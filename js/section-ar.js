import { HandLandmarker, FilesetResolver, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// ─── Estados de la máquina ────────────────────────────────────────────────────
const S_FOG = 0;
const S_CLEARING = 1;
const S_REVEALED = 2;
const S_REGENERATING = 3;

// ─── Animales del Yasuní ──────────────────────────────────────────────────────
const ANIMALS = [
  { file: "elephant.png", name: "Elefante",       emoji: "🐘", fact: "Pueden reconocerse en un espejo, como los delfines y los humanos." },
  { file: "giraffe.png",  name: "Jirafa",         emoji: "🦒", fact: "Su cuello mide hasta 2.4 m, pero solo tiene 7 vértebras, igual que nosotros." },
  { file: "hippo.png",    name: "Hipopótamo",     emoji: "🦛", fact: "Pasa hasta 16 horas al día en el agua para proteger su piel del sol." },
  { file: "monkey.png",   name: "Mono Capuchino", emoji: "🐒", fact: "Son tan inteligentes que usan piedras como martillos para romper nueces." },
  { file: "panda.png",    name: "Panda Gigante",  emoji: "🐼", fact: "Come entre 12 y 38 kg de bambú al día, ¡hasta 14 horas comiendo!" },
  { file: "parrot.png",   name: "Loro",           emoji: "🦜", fact: "Algunas especies viven más de 80 años y aprenden cientos de palabras." },
  { file: "penguin.png",  name: "Pingüino",       emoji: "🐧", fact: "El pingüino emperador aguanta hasta 20 minutos bajo el agua." },
  { file: "pig.png",      name: "Cerdo",          emoji: "🐷", fact: "Son más inteligentes que los perros en pruebas de resolución de problemas." },
  { file: "rabbit.png",   name: "Conejo",         emoji: "🐰", fact: "Sus orejas giran 270 grados para detectar depredadores desde lejos." },
  { file: "snake.png",    name: "Serpiente",      emoji: "🐍", fact: "Algunas especies pueden pasar meses sin comer después de una gran presa." },
];

// ─── Estado global ────────────────────────────────────────────────────────────
let handLandmarker = null;
let running = false;
let animFrameId = null;

let canvasWidth = 1280;
let canvasHeight = 720;

// Canvases
let fogCanvas = null;
let fogCtx = null;
let photoCanvas = null;
let photoCtx = null;

// Fotos precargadas
let photoImages = [];

// Máquina de estados
let state = S_FOG;
let currentIdx = -1;
let prevIndices = [];

// Regeneración de niebla
let fogBuffer = null;
let regenStart = 0;

// Pop-in del animal
let revealTs = 0;
const REVEAL_DURATION_MS = 8000;

// Progreso de revelado
let revealedPixels = 0;
const REVEAL_THRESHOLD = 55;
const BRUSH_RADIUS = 140;

// Trail de manos
const MAX_TRAIL = 6;
let handTrails = { Left: [], Right: [] };

// Detección de mano quieta
let handPresent = false;
let handStill = false;
let handStillSince = 0;
let prevPalmPositions = [];

// Mensaje de estado flotante
let statusMsg = "";
let statusMsgTs = 0;
const SHOW_MSG_MS = 3500;

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function initAnimalsAR() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "public/models/hand_landmarker.task", delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
  });

  const container = document.querySelector(".canvas-container");
  const outputCanvas = document.getElementById("output_canvas");

  photoCanvas = _createLayerCanvas("yasuni-photo-layer");
  photoCtx = photoCanvas.getContext("2d");
  container.insertBefore(photoCanvas, outputCanvas);

  fogCanvas = _createLayerCanvas("yasuni-fog-layer");
  fogCtx = fogCanvas.getContext("2d");
  container.insertBefore(fogCanvas, outputCanvas);

  await _preloadPhotos();

  running = true;
  _enterFog();
  render();
}

function _createLayerCanvas(id) {
  const c = document.createElement("canvas");
  c.id = id;
  Object.assign(c.style, {
    position: "absolute",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: "scaleX(-1)",
    top: "0",
    left: "0",
  });
  return c;
}

async function _preloadPhotos() {
  const promises = ANIMALS.map(
    (a) =>
      new Promise((res) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = `assets/yasuni/${a.file}`;
      })
  );
  photoImages = await Promise.all(promises);
}

function _resizeCanvases(W, H) {
  if (fogCanvas.width !== W) fogCanvas.width = W;
  if (fogCanvas.height !== H) fogCanvas.height = H;
  if (photoCanvas.width !== W) photoCanvas.width = W;
  if (photoCanvas.height !== H) photoCanvas.height = H;
  canvasWidth = W;
  canvasHeight = H;
}

// ─── Selección aleatoria (evita repetir los últimos 3) ────────────────────────
function _pickNext() {
  let pool = ANIMALS.map((_, i) => i).filter((i) => !prevIndices.includes(i));
  if (pool.length === 0) {
    prevIndices = [];
    pool = ANIMALS.map((_, i) => i);
  }
  const idx = pool[Math.floor(Math.random() * pool.length)];
  prevIndices.push(idx);
  if (prevIndices.length > 3) prevIndices.shift();
  currentIdx = idx;
}

// ─── Transiciones ─────────────────────────────────────────────────────────────
function _enterFog() {
  state = S_FOG;
  revealedPixels = 0;
  handTrails = { Left: [], Right: [] };
  prevPalmPositions = [];
  handStill = false;
  handStillSince = 0;
  _setStatus("");

  const W = canvasWidth;
  const H = canvasHeight;

  // Photo canvas: dark background
  photoCtx.fillStyle = "#050a10";
  photoCtx.fillRect(0, 0, W, H);

  // Render full fog to buffer for later regeneration
  _renderFogBuffer(W, H);

  // Draw full fog on fog canvas
  fogCtx.clearRect(0, 0, W, H);
  fogCtx.drawImage(fogBuffer, 0, 0);
}

function _enterClearing() {
  state = S_CLEARING;
  _setStatus("");
}

function _enterRevealed() {
  state = S_REVEALED;
  revealTs = performance.now();

  const W = canvasWidth;
  const H = canvasHeight;
  const img = photoImages[currentIdx];

  // Draw animal photo on photo canvas
  photoCtx.clearRect(0, 0, W, H);
  if (img) {
    const scale = Math.min(W / img.naturalWidth * 0.85, H / img.naturalHeight * 0.7);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    photoCtx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    photoCtx.fillStyle = "#1a3a2a";
    photoCtx.fillRect(0, 0, W, H);
    photoCtx.fillStyle = "#00ff88";
    photoCtx.font = "bold 28px monospace";
    photoCtx.textAlign = "center";
    photoCtx.fillText(ANIMALS[currentIdx].name, W / 2, H / 2);
  }
}

function _enterRegenerating() {
  state = S_REGENERATING;
  regenStart = performance.now();
  _setStatus("🌀  Niebla regenerándose...");
}

// ─── Prerender de niebla (para regeneración) ─────────────────────────────────
function _renderFogBuffer(W, H) {
  if (!fogBuffer || fogBuffer.width !== W || fogBuffer.height !== H) {
    fogBuffer = document.createElement("canvas");
    fogBuffer.width = W;
    fogBuffer.height = H;
  }
  const bCtx = fogBuffer.getContext("2d");
  bCtx.clearRect(0, 0, W, H);

  const grad = bCtx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
  grad.addColorStop(0, "rgba(8, 30, 15, 0.92)");
  grad.addColorStop(0.6, "rgba(4, 18, 10, 0.97)");
  grad.addColorStop(1, "rgba(0, 8, 4, 1.00)");
  bCtx.fillStyle = grad;
  bCtx.fillRect(0, 0, W, H);

  for (let i = 0; i < 120; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 20 + Math.random() * 80;
    const a = 0.04 + Math.random() * 0.08;
    const g2 = bCtx.createRadialGradient(x, y, 0, x, y, r);
    g2.addColorStop(0, `rgba(30, 80, 40, ${a})`);
    g2.addColorStop(1, "rgba(0,0,0,0)");
    bCtx.fillStyle = g2;
    bCtx.beginPath();
    bCtx.arc(x, y, r, 0, Math.PI * 2);
    bCtx.fill();
  }
}

// ─── Render loop ──────────────────────────────────────────────────────────────
function render() {
  if (!running) return;
  animFrameId = requestAnimationFrame(render);

  const video = document.getElementById("webcam");
  if (video.readyState < 4) return;

  const canvas = document.getElementById("output_canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const W = canvas.width;
  const H = canvas.height;

  _resizeCanvases(W, H);

  // Detectar manos
  const results = handLandmarker.detectForVideo(video, performance.now());
  ctx.clearRect(0, 0, W, H);

  const hands = _processHands(results, W, H);

  // Determinar presencia y movimiento de mano
  _updateHandState(hands);

  // Máquina de estados
  _updateState(hands, W, H);

  // Dibujar según estado
  _drawState(ctx, W, H, hands);
}

function _processHands(results, W, H) {
  const hands = [];
  if (results.landmarks && results.landmarks.length > 0) {
    results.landmarks.forEach((lm, idx) => {
      const handLabel = results.handedness?.[idx]?.[0]?.categoryName ?? "Left";
      const px = ((lm[0].x + lm[9].x) / 2) * W;
      const py = ((lm[0].y + lm[9].y) / 2) * H;

      const trail = handTrails[handLabel] ?? (handTrails[handLabel] = []);
      trail.push({ x: px, y: py });
      if (trail.length > MAX_TRAIL) trail.shift();

      hands.push({ lm, px, py, label: handLabel });
    });
  }
  return hands;
}

function _updateHandState(hands) {
  handPresent = hands.length > 0;

  if (!handPresent) {
    handStill = false;
    handStillSince = 0;
    prevPalmPositions = [];
    return;
  }

  // Track palm positions for stillness detection
  const palm = hands[0];
  prevPalmPositions.push({ x: palm.px, y: palm.py });
  if (prevPalmPositions.length > 10) prevPalmPositions.shift();

  if (prevPalmPositions.length < 5) {
    handStill = false;
    return;
  }

  // Compute average movement in last frames
  const avg = prevPalmPositions.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  avg.x /= prevPalmPositions.length;
  avg.y /= prevPalmPositions.length;

  const dist = Math.hypot(palm.px - avg.x, palm.py - avg.y);
  const wasStill = handStill;
  handStill = dist < 12;

  if (handStill && !wasStill) handStillSince = performance.now();
  if (!handStill) handStillSince = 0;
}

function _updateState(hands, W, H) {
  const now = performance.now();

  switch (state) {
    case S_FOG: {
      if (!handPresent) {
        _setStatusMsg("✋  Acerca tu mano a la cámara");
        break;
      }
      if (handStill) {
        const elapsed = now - handStillSince;
        if (elapsed > 3000) {
          _setStatusMsg("✋  ¡Mueve tu mano! Barre la niebla para descubrir animales");
        }
        break;
      }
      // Hand is moving → start clearing
      _enterClearing();
      break;
    }

    case S_CLEARING: {
      if (!handPresent) {
        // Hand left during clearing → reset to FOG
        _setStatusMsg("🔄  Vuelve a acercar tu mano para continuar");
        _enterFog();
        break;
      }

      // Erase fog along trail
      hands.forEach((h) => {
        const trail = handTrails[h.label] || [];
        _eraseAlongTrail(trail, W, H);
      });

      // Sample reveal progress
      _sampleReveal(W, H);

      if (revealedPixels >= REVEAL_THRESHOLD) {
        _enterRevealed();
      }
      break;
    }

    case S_REVEALED: {
      const revealElapsed = now - revealTs;
      if (revealElapsed > REVEAL_DURATION_MS) {
        _enterRegenerating();
        break;
      }
      // Skip to next if hand removed after minimum viewing time
      if (!handPresent && revealElapsed > 2500) {
        _enterRegenerating();
        break;
      }
      if (revealElapsed > 2000) {
        const remaining = Math.ceil((REVEAL_DURATION_MS - revealElapsed) / 1000);
        _setStatusMsg(`🙌  Próximo animal en ${remaining}s — retira tu mano para saltar`);
      }
      break;
    }

    case S_REGENERATING: {
      const elapsed = now - regenStart;
      const dur = 1500;
      const t = Math.min(elapsed / dur, 1);

      // Blend fog buffer over current fog canvas
      fogCtx.globalAlpha = t * t; // ease-in
      fogCtx.drawImage(fogBuffer, 0, 0);
      fogCtx.globalAlpha = 1;

      if (t >= 1) {
        _pickNext();
        _enterFog();
      }
      break;
    }
  }
}

function _setStatusMsg(msg) {
  if (statusMsg === msg) return;
  statusMsg = msg;
  // auto-clear short messages; keep instructional ones until overwritten
  if (msg.length < 20) {
    statusMsgTs = 0;
  } else {
    statusMsgTs = 0;
  }
}

function _setStatus(msg) {
  statusMsg = msg;
}

// ─── Eraser ───────────────────────────────────────────────────────────────────
function _eraseAlongTrail(trail, W, H) {
  if (trail.length === 0) return;

  fogCtx.globalCompositeOperation = "destination-out";

  for (let i = 0; i < trail.length; i++) {
    const alpha = (i + 1) / trail.length;
    const r = BRUSH_RADIUS * (0.6 + alpha * 0.4);

    const grad = fogCtx.createRadialGradient(
      trail[i].x, trail[i].y, 0,
      trail[i].x, trail[i].y, r
    );
    grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
    grad.addColorStop(0.7, `rgba(0,0,0,${alpha * 0.6})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");

    fogCtx.fillStyle = grad;
    fogCtx.beginPath();
    fogCtx.arc(trail[i].x, trail[i].y, r, 0, Math.PI * 2);
    fogCtx.fill();
  }

  fogCtx.globalCompositeOperation = "source-over";
}

function _sampleReveal(W, H) {
  const now = performance.now();
  if (Math.floor(now * 10) % 3 !== 0) return;

  try {
    const sample = fogCtx.getImageData(0, 0, W, H);
    const data = sample.data;
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4 * 8) {
      if (data[i] < 30) transparent++;
    }
    const total = data.length / (4 * 8);
    revealedPixels = Math.round((transparent / total) * 100);
  } catch (_) {}
}

// ─── Dibujado por estado ──────────────────────────────────────────────────────
function _drawState(ctx, W, H, hands) {
  const drawUtils = hands.length > 0 ? new DrawingUtils(ctx) : null;

  switch (state) {
    case S_FOG:
      _drawFogOverlay(ctx, W, H);
      if (hands.length > 0) _drawHands(ctx, hands, drawUtils, W, H);
      break;

    case S_CLEARING:
      _drawHands(ctx, hands, drawUtils, W, H);
      _drawProgressBar(ctx, W, H);
      break;

    case S_REVEALED:
      _drawRevealBurst(ctx, W, H);
      _drawInfoCloud(ctx, W, H);
      if (hands.length > 0) _drawHands(ctx, hands, drawUtils, W, H);
      break;

    case S_REGENERATING:
      if (hands.length > 0) _drawHands(ctx, hands, drawUtils, W, H);
      break;
  }

  // Status message (on top of everything)
  if (statusMsg) {
    _drawStatusMessage(ctx, W, H);
  }
}

// ─── Componentes visuales ─────────────────────────────────────────────────────

function _drawFogOverlay(ctx, W, H) {
  ctx.save();
  ctx.scale(-1, 1);
  ctx.translate(-W, 0);
  ctx.font = "bold 22px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(0, 255, 136, 0.7)";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 12;
  ctx.fillText("🌿  Mueve tus manos para revelar la fauna del Yasuní", W / 2, H - 60);
  ctx.restore();
}

function _drawHands(ctx, hands, drawUtils, W, H) {
  hands.forEach((h) => {
    drawUtils.drawConnectors(h.lm, HandLandmarker.HAND_CONNECTIONS, {
      color: "rgba(0,255,136,0.35)",
      lineWidth: 2,
    });
    drawUtils.drawLandmarks(h.lm, {
      color: "rgba(0,255,136,0.6)",
      lineWidth: 1,
      radius: 3,
    });

    // Brush circle
    ctx.beginPath();
    ctx.arc(h.px, h.py, BRUSH_RADIUS * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,255,136,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function _drawProgressBar(ctx, W, H) {
  const barW = Math.min(W * 0.5, 400);
  const barH = 6;
  const barX = (W - barW) / 2;
  const barY = H - 30;
  const filled = barW * Math.min(revealedPixels / REVEAL_THRESHOLD, 1);

  ctx.fillStyle = "rgba(0,0,0,0.4)";
  _roundRect(ctx, barX, barY, barW, barH, 3);
  ctx.fill();

  const grad = ctx.createLinearGradient(barX, 0, barX + filled, 0);
  grad.addColorStop(0, "#004d20");
  grad.addColorStop(0.5, "#00cc55");
  grad.addColorStop(1, "#00ff88");
  ctx.fillStyle = grad;
  _roundRect(ctx, barX, barY, filled, barH, 3);
  ctx.fill();
}

function _drawRevealBurst(ctx, W, H) {
  const elapsed = performance.now() - revealTs;

  if (elapsed < 400) {
    const t = elapsed / 400;
    const alpha = 1 - t;
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
    grad.addColorStop(0, `rgba(0, 255, 136, ${alpha * 0.2})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
}

function _drawInfoCloud(ctx, W, H) {
  const elapsed = performance.now() - revealTs;
  const animal = ANIMALS[currentIdx];

  const delay = 200;
  const animDur = 300;
  const phase = Math.max(0, Math.min(1, (elapsed - delay) / animDur));
  const alpha = phase;

  if (phase <= 0) return;

  const pad = 18;
  const cardH = 100;
  const cardW = Math.min(W - 40, 520);
  const cx = (W - cardW) / 2;
  const cy = H - cardH - 28;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.scale(-1, 1);
  ctx.translate(-W, 0);

  ctx.fillStyle = "rgba(5, 18, 51, 0.75)";
  _roundRect(ctx, cx, cy, cardW, cardH, 16);
  ctx.fill();

  ctx.strokeStyle = "rgba(60, 195, 230, 0.3)";
  ctx.lineWidth = 1;
  _roundRect(ctx, cx, cy, cardW, cardH, 16);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.04)";
  _roundRect(ctx, cx + 2, cy + 2, cardW - 4, cardH / 2, 16);
  ctx.fill();

  ctx.font = "36px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(animal.emoji, cx + pad, cy + 12);

  ctx.font = "bold 22px 'Orbitron', sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const emojiRight = cx + pad + 46;
  ctx.fillText(animal.name, emojiRight, cy + 16);

  ctx.font = "11px 'Orbitron', sans-serif";
  ctx.fillStyle = "rgba(60, 195, 230, 0.7)";
  ctx.fillText("YASUNÍ · FAUNA", emojiRight, cy + 44);

  ctx.font = "14px 'Inter', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.textBaseline = "bottom";
  ctx.fillText(`💡 ${animal.fact}`, cx + pad, cy + cardH - 12);

  ctx.restore();
}

function _drawStatusMessage(ctx, W, H) {
  ctx.save();
  ctx.scale(-1, 1);
  ctx.translate(-W, 0);
  ctx.font = "bold 18px 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const msgW = Math.min(W - 60, 500);
  const msgH = 54;
  const mx = (W - msgW) / 2;
  const my = 110;

  ctx.fillStyle = "rgba(5, 18, 51, 0.8)";
  _roundRect(ctx, mx, my, msgW, msgH, 14);
  ctx.fill();

  ctx.strokeStyle = "rgba(60, 195, 230, 0.2)";
  ctx.lineWidth = 1;
  _roundRect(ctx, mx, my, msgW, msgH, 14);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(statusMsg, W / 2, my + 16);
  ctx.restore();
}

// ─── Stop ─────────────────────────────────────────────────────────────────────
export function stopAnimalsAR() {
  running = false;
  if (animFrameId) cancelAnimationFrame(animFrameId);

  if (fogCanvas && fogCanvas.parentNode) fogCanvas.parentNode.removeChild(fogCanvas);
  if (photoCanvas && photoCanvas.parentNode) photoCanvas.parentNode.removeChild(photoCanvas);

  fogCanvas = null;
  photoCanvas = null;
  fogBuffer = null;
  handTrails = { Left: [], Right: [] };
  prevIndices = [];
  state = S_FOG;
}

// ─── Util ─────────────────────────────────────────────────────────────────────
function _roundRect(ctx, x, y, w, h, r) {
  if (w <= 0 || h <= 0) return;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
