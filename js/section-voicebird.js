let running = false;
let isGameOver = false;
let canvas, ctx;
let frameCount = 0;
let score = 0;

const bird = { x: 380, y: 300, w: 45, h: 35, img: new Image() };
const pipes = [];
const pipeSettings = { width: 60, gap: 190, speed: 2.5 };

bird.img.src = "assets/textures/bluebird-upflap.png";
const pipeImg = new Image(); pipeImg.src = "assets/textures/pipe-green.png";
const baseImg = new Image(); baseImg.src = "assets/textures/base.png";

let audioCtx = null;
let micStream = null;
let analyser = null;
let source = null;
let dataArray = null;
let smoothPitch = 0;
let pitchHistory = [];
let calibrated = false;
let pitchMin = 180;
let pitchMax = 350;
let calibrateTimer = 0;
const CALIBRATE_DURATION = 2000;

async function startMic() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  source = audioCtx.createMediaStreamSource(micStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  dataArray = new Float32Array(analyser.fftSize);
}

function stopMic() {
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  if (audioCtx && audioCtx.state !== "closed") {
    audioCtx.close();
    audioCtx = null;
  }
}

function detectPitch(buffer, sampleRate) {
  const minFreq = 75, maxFreq = 900;
  const minOffset = Math.floor(sampleRate / maxFreq);
  const maxOffset = Math.floor(sampleRate / minFreq);
  let bestOffset = minOffset, bestDiff = Infinity;

  for (let off = minOffset; off <= maxOffset; off++) {
    let diff = 0;
    for (let i = 0; i < maxOffset; i++) diff += Math.abs(buffer[i] - buffer[i + off]);
    const avg = diff / maxOffset;
    if (avg < bestDiff) { bestDiff = avg; bestOffset = off; }
  }

  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.018 || bestDiff > 0.35) return -1;
  return sampleRate / bestOffset;
}

export async function initVoiceBird() {
  canvas = document.getElementById("output_canvas");
  ctx = canvas.getContext("2d");

  try {
    await startMic();
  } catch {
    console.warn("Micrófono no disponible");
  }

  document.getElementById("restart-btn").onclick = () => {
    if (isGameOver) { resetGame(); animate(); }
  };

  resetGame();
  running = true;
  animate();
}

function resetGame() {
  score = 0; pipes.length = 0; frameCount = 0; bird.y = 300;
  isGameOver = false;
  pitchHistory = []; calibrated = false; calibrateTimer = 0;
  smoothPitch = 0;
  document.getElementById("game-over-screen").classList.add("hidden");
}

function showGameOver() {
  isGameOver = true;
  document.getElementById("final-score").innerText = score;
  document.getElementById("game-over-screen").classList.remove("hidden");
}

function animate() {
  if (!running || isGameOver) return;

  const video = document.getElementById("webcam");
  if (video.readyState === 4) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    if (analyser && dataArray) {
      analyser.getFloatTimeDomainData(dataArray);
      const pitch = detectPitch(dataArray, audioCtx.sampleRate);

      if (pitch > 0) {
        smoothPitch += (pitch - smoothPitch) * 0.35;
        if (!calibrated) {
          pitchHistory.push(smoothPitch);
          calibrateTimer += 16;
          if (calibrateTimer >= CALIBRATE_DURATION && pitchHistory.length > 10) {
            let mn = Infinity, mx = -Infinity;
            pitchHistory.forEach(v => { if (v < mn) mn = v; if (v > mx) mx = v; });
            const range = Math.max(mx - mn, 40);
            pitchMin = mn - range * 0.25;
            pitchMax = mx + range * 0.25;
            calibrated = true;
          }
        }
      }

      // Igual que Flappy Nose: smoothing factor 0.25, rango completo
      if (calibrated && smoothPitch > 0) {
        let t = (smoothPitch - pitchMin) / (pitchMax - pitchMin);
        t = Math.max(0, Math.min(1, t));
        // Rango completo: desde casi el tope hasta casi el piso
        const targetY = 10 + (1 - t) * (H - 60);
        bird.y += (targetY - bird.y) * 0.25;
      } else if (!calibrated) {
        bird.y += 0.8;
      } else {
        bird.y += 1.8;
      }

      bird.y = Math.max(5, Math.min(H - 45, bird.y));

      // Waveform decorativa
      ctx.save();
      ctx.globalAlpha = 0.08;
      for (let i = 0; i < dataArray.length; i += 4) {
        const x = (i / dataArray.length) * W;
        ctx.fillStyle = "#3CC3E6";
        ctx.fillRect(x, H - 14 - (dataArray[i] + 1) * 10, 2, (dataArray[i] + 1) * 10);
      }
      ctx.restore();

      // Indicador de tono
      if (calibrated) {
        const by = H * 0.08, bh = H * 0.60, bx = W - 26;
        const norm = Math.max(0, Math.min(1, (smoothPitch - pitchMin) / (pitchMax - pitchMin)));
        const iy = by + (1 - norm) * bh;

        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.beginPath();
        ctx.roundRect(bx, by, 8, bh, 4);
        ctx.fill();

        const g = ctx.createLinearGradient(bx, by, bx, by + bh);
        g.addColorStop(0, "#3CC3E6"); g.addColorStop(0.5, "#ffd166"); g.addColorStop(1, "#ff6b6b");
        ctx.fillStyle = g;
        ctx.shadowColor = "#ffd166";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(bx - 1, iy - 3, 10, 6, 3);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    } else {
      bird.y += 0.8;
    }

    // Tuberías con fade-in
    if (frameCount % 120 === 0) {
      const minH = 50, maxH = H - pipeSettings.gap - minH - 50;
      pipes.push({ x: 0 - pipeSettings.width, y: Math.floor(Math.random() * (maxH - minH + 1)) + minH, passed: false, fade: 0 });
    }

    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x += pipeSettings.speed;
      if (p.fade < 1) p.fade = Math.min(1, p.fade + 0.04);

      ctx.globalAlpha = p.fade;
      ctx.save();
      ctx.translate(p.x + pipeSettings.width / 2, p.y);
      ctx.scale(1, -1);
      ctx.drawImage(pipeImg, -pipeSettings.width / 2, 0, pipeSettings.width, p.y);
      ctx.restore();
      ctx.drawImage(pipeImg, p.x, p.y + pipeSettings.gap, pipeSettings.width, H - (p.y + pipeSettings.gap));
      ctx.globalAlpha = 1;

      if (checkCollision(p, H)) { showGameOver(); return; }
      if (!p.passed && p.x > bird.x) { score++; p.passed = true; }
      if (p.x > W) pipes.splice(i, 1);
    }

    ctx.drawImage(baseImg, 0, H - 40, W, 40);

    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.scale(-1, 1);
    ctx.drawImage(bird.img, -bird.w / 2, -bird.h / 2, bird.w, bird.h);
    ctx.restore();

    // Score con mirror
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-W, 0);
    ctx.fillStyle = "white";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    ctx.font = "bold 40px Arial";
    ctx.strokeText(`Puntos: ${score}`, 20, 60);
    ctx.fillText(`Puntos: ${score}`, 20, 60);
    ctx.restore();

    if (!calibrated) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, H/2-26, W, 52);
      ctx.fillStyle = "#ffd166";
      ctx.font = "bold 22px 'Orbitron', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#ffd166";
      ctx.shadowBlur = 16;
      ctx.fillText("🎤 Haz sonido fuerte y suave para calibrar…", W/2, H/2);
      ctx.restore();
    }

    frameCount++;
  }

  requestAnimationFrame(animate);
}

function checkCollision(p, H) {
  const h = 10;
  const l = bird.x - bird.w/2 + h, r = bird.x + bird.w/2 - h;
  const t = bird.y - bird.h/2 + h, b = bird.y + bird.h/2 - h;
  if (r > p.x && l < p.x + pipeSettings.width) {
    if (t < p.y || b > p.y + pipeSettings.gap) return true;
  }
  return b > H - 40;
}

export function stopVoiceBird() {
  running = false;
  stopMic();
  document.getElementById("game-over-screen").classList.add("hidden");
}
