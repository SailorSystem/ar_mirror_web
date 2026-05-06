/**
 * section-ar.js — Niebla del Yasuní
 *
 * El usuario mueve las manos frente a la cámara para "limpiar" una capa
 * de niebla digital y revelar fotos reales de la fauna del Yasuní debajo.
 *
 * Arquitectura de capas (orden de dibujado):
 *   1. <video>          — feed de cámara (CSS espejo ya aplicado)
 *   2. canvas "foto"    — foto del Yasuní, siempre visible debajo
 *   3. canvas "niebla"  — capa de niebla con agujeros donde pasaron las manos
 *   4. canvas "output"  — landmarks de manos + UI (el canvas existente del index.html)
 *
 * Usamos dos canvas extra (ocultos en el DOM) para separar las capas.
 * El canvas "niebla" usa destination-out para "borrar" píxeles con el movimiento.
 */

import {
    HandLandmarker,
    FilesetResolver,
    DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// ─── Estado ───────────────────────────────────────────────────────────────────
let handLandmarker = null;
let running        = false;
let animFrameId    = null;

// Canvas de capas extra
let fogCanvas    = null;   // niebla
let fogCtx       = null;
let photoCanvas  = null;   // foto debajo
let photoCtx     = null;

// Foto actual y lista
let currentPhotoIndex = 0;
let photoImages       = [];   // HTMLImageElement[]
let photoLoaded       = false;

// Historial de posiciones para trail suave
const MAX_TRAIL = 6;
let handTrails = { Left: [], Right: [] };   // últimas N posiciones por mano

// Progreso de revelación
let revealedPixels = 0;   // % aproximado (0–100)
let photoShownAt   = 0;   // timestamp de cuando se completó la revelación

// ─── Fotos del Yasuní ─────────────────────────────────────────────────────────
// Rutas relativas — coloca tus fotos en assets/yasuni/
const YASUNI_PHOTOS = [
    { src: "assets/yasuni/jaguar.jpg",    label: "Jaguar  (Panthera onca)" },
    { src: "assets/yasuni/anaconda.jpg",  label: "Anaconda  (Eunectes murinus)" },
    { src: "assets/yasuni/mono.jpg",      label: "Mono capuchino  (Cebus albifrons)" },
    { src: "assets/yasuni/buho.jpg",      label: "Búho moteado  (Ciccaba virgata)" },
    { src: "assets/yasuni/delfin.jpg",    label: "Delfín rosado  (Inia geoffrensis)" },
];

// Radio del "borrador" en px — más grande = se revela más rápido
const BRUSH_RADIUS    = 90;
// Cuánto % de revelación activa la transición a la siguiente foto
const REVEAL_THRESHOLD = 88;
// Segundos mostrando la foto completa antes de pasar a la siguiente
const PHOTO_SHOW_SECS  = 3.5;

// ─── Inicialización ───────────────────────────────────────────────────────────
export async function initAnimalsAR() {
    // 1. Cargar MediaPipe HandLandmarker
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "public/models/hand_landmarker.task",
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
    });

    // 2. Crear canvas extra e inyectarlos en el contenedor
    const container = document.querySelector(".canvas-container");
    const outputCanvas = document.getElementById("output_canvas");

    // Canvas de foto (debajo del output)
    photoCanvas = _createLayerCanvas("yasuni-photo-layer");
    photoCtx    = photoCanvas.getContext("2d");
    container.insertBefore(photoCanvas, outputCanvas);

    // Canvas de niebla (entre foto y output)
    fogCanvas = _createLayerCanvas("yasuni-fog-layer");
    fogCtx    = fogCanvas.getContext("2d");
    container.insertBefore(fogCanvas, outputCanvas);

    // 3. Precargar fotos
    await _preloadPhotos();

    // 4. Arrancar
    running = true;
    _loadPhoto(currentPhotoIndex);
    render();
}

function _createLayerCanvas(id) {
    const c = document.createElement("canvas");
    c.id    = id;
    // Mismos estilos que el canvas existente
    Object.assign(c.style, {
        position:   "absolute",
        width:      "100%",
        height:     "100%",
        objectFit:  "cover",
        transform:  "scaleX(-1)",
        top:        "0",
        left:       "0",
    });
    return c;
}

async function _preloadPhotos() {
    const promises = YASUNI_PHOTOS.map(
        (p) =>
            new Promise((res) => {
                const img = new Image();
                img.onload  = () => res(img);
                img.onerror = () => res(null);   // foto faltante → null
                img.src = p.src;
            })
    );
    photoImages = await Promise.all(promises);
}

// ─── Gestión de fotos ─────────────────────────────────────────────────────────
function _loadPhoto(index) {
    photoLoaded   = false;
    revealedPixels = 0;
    photoShownAt  = 0;
    handTrails    = { Left: [], Right: [] };

    // Sincronizar tamaño de canvas con el video
    const video = document.getElementById("webcam");
    const W = video.videoWidth  || 1280;
    const H = video.videoHeight || 720;

    photoCanvas.width  = W;
    photoCanvas.height = H;
    fogCanvas.width    = W;
    fogCanvas.height   = H;

    // Dibujar foto (o placeholder si no cargó)
    photoCtx.clearRect(0, 0, W, H);
    const img = photoImages[index];
    if (img) {
        // Ajuste cover
        const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const dw    = img.naturalWidth  * scale;
        const dh    = img.naturalHeight * scale;
        const dx    = (W - dw) / 2;
        const dy    = (H - dh) / 2;
        photoCtx.drawImage(img, dx, dy, dw, dh);

        // Label de la especie en la esquina
        _drawPhotoLabel(YASUNI_PHOTOS[index].label, W, H);
    } else {
        // Placeholder si la foto no existe todavía
        photoCtx.fillStyle = "#0f2417";
        photoCtx.fillRect(0, 0, W, H);
        photoCtx.fillStyle = "#00ff88";
        photoCtx.font      = "bold 28px monospace";
        photoCtx.textAlign = "center";
        photoCtx.fillText(YASUNI_PHOTOS[index].label, W / 2, H / 2);
        photoCtx.fillText("(foto no encontrada)", W / 2, H / 2 + 40);
    }

    // Rellenar niebla — efecto de "selva digital" con gradiente y ruido
    _drawFog(W, H);

    photoLoaded = true;
}

function _drawPhotoLabel(text, W, H) {
    const pad  = 18;
    const fh   = 32;
    photoCtx.font      = `bold ${fh}px 'Segoe UI', sans-serif`;
    const tw   = photoCtx.measureText(text).width;
    const bx   = W - tw - pad * 2 - 24;
    const by   = H - fh - pad * 2 - 16;
    const bw   = tw + pad * 2;
    const bh   = fh + pad;

    photoCtx.fillStyle = "rgba(0,0,0,0.55)";
    _roundRect(photoCtx, bx, by, bw, bh, 10);
    photoCtx.fill();

    photoCtx.fillStyle   = "#00ff88";
    photoCtx.textAlign   = "left";
    photoCtx.textBaseline = "middle";
    photoCtx.fillText(text, bx + pad, by + bh / 2);
}

function _drawFog(W, H) {
    fogCtx.clearRect(0, 0, W, H);

    // Base — verde oscuro selva
    const grad = fogCtx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    grad.addColorStop(0,   "rgba(8,  30, 15, 0.92)");
    grad.addColorStop(0.6, "rgba(4,  18, 10, 0.97)");
    grad.addColorStop(1,   "rgba(0,   8,  4, 1.00)");
    fogCtx.fillStyle = grad;
    fogCtx.fillRect(0, 0, W, H);

    // Partículas de niebla — círculos semitransparentes de distintos tamaños
    for (let i = 0; i < 120; i++) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        const r = 20 + Math.random() * 80;
        const a = 0.04 + Math.random() * 0.08;
        const g2 = fogCtx.createRadialGradient(x, y, 0, x, y, r);
        g2.addColorStop(0, `rgba(30, 80, 40, ${a})`);
        g2.addColorStop(1, "rgba(0,0,0,0)");
        fogCtx.fillStyle = g2;
        fogCtx.beginPath();
        fogCtx.arc(x, y, r, 0, Math.PI * 2);
        fogCtx.fill();
    }

    // Texto de instrucción centrado
    fogCtx.save();
    fogCtx.font      = "bold 22px 'Segoe UI', sans-serif";
    fogCtx.textAlign = "center";
    fogCtx.fillStyle = "rgba(0, 255, 136, 0.7)";
    fogCtx.fillText("✋  Mueve tus manos para revelar la fauna del Yasuní", W / 2, H - 50);
    fogCtx.restore();
}

// ─── Render loop ──────────────────────────────────────────────────────────────
function render() {
    if (!running) return;
    animFrameId = requestAnimationFrame(render);

    if (!photoLoaded) return;

    const video  = document.getElementById("webcam");
    if (video.readyState < 4) return;

    const canvas = document.getElementById("output_canvas");
    const ctx    = canvas.getContext("2d");
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const W = canvas.width;
    const H = canvas.height;

    // Detectar manos
    const results = handLandmarker.detectForVideo(video, performance.now());
    ctx.clearRect(0, 0, W, H);

    if (results.landmarks && results.landmarks.length > 0) {
        const drawUtils = new DrawingUtils(ctx);

        results.landmarks.forEach((lm, idx) => {
            const handLabel = results.handedness?.[idx]?.[0]?.categoryName ?? "Left";

            // Punto de la palma — promedio de muñeca (0) y base del dedo medio (9)
            const px = ((lm[0].x + lm[9].x) / 2) * W;
            const py = ((lm[0].y + lm[9].y) / 2) * H;

            // Guardar en trail
            const trail = handTrails[handLabel] ?? (handTrails[handLabel] = []);
            trail.push({ x: px, y: py });
            if (trail.length > MAX_TRAIL) trail.shift();

            // Borrar niebla a lo largo del trail
            _eraseAlongTrail(trail, W, H);

            // Dibujar contorno sutil de la mano en el canvas output
            drawUtils.drawConnectors(lm, HandLandmarker.HAND_CONNECTIONS, {
                color: "rgba(0,255,136,0.35)",
                lineWidth: 2,
            });
            drawUtils.drawLandmarks(lm, {
                color:     "rgba(0,255,136,0.6)",
                lineWidth: 1,
                radius:    3,
            });

            // Círculo visual donde borra
            ctx.beginPath();
            ctx.arc(px, py, BRUSH_RADIUS * 0.5, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(0,255,136,0.5)";
            ctx.lineWidth   = 2;
            ctx.stroke();
        });
    }

    // Estimar revelación y manejar transición
    _checkRevealProgress(W, H);

    // Dibujar HUD
    _drawHUD(ctx, W, H);
}

function _eraseAlongTrail(trail, W, H) {
    if (trail.length === 0) return;

    fogCtx.globalCompositeOperation = "destination-out";

    for (let i = 0; i < trail.length; i++) {
        const alpha = (i + 1) / trail.length;  // más opaco al final del trail
        const r     = BRUSH_RADIUS * (0.6 + alpha * 0.4);

        const grad = fogCtx.createRadialGradient(
            trail[i].x, trail[i].y, 0,
            trail[i].x, trail[i].y, r
        );
        grad.addColorStop(0,   `rgba(0,0,0,${alpha})`);
        grad.addColorStop(0.7, `rgba(0,0,0,${alpha * 0.6})`);
        grad.addColorStop(1,   "rgba(0,0,0,0)");

        fogCtx.fillStyle = grad;
        fogCtx.beginPath();
        fogCtx.arc(trail[i].x, trail[i].y, r, 0, Math.PI * 2);
        fogCtx.fill();
    }

    fogCtx.globalCompositeOperation = "source-over";
}

function _checkRevealProgress(W, H) {
    const now = performance.now() / 1000;

    // Samplear píxeles del fogCanvas cada 30 frames aprox.
    if (Math.floor(now * 10) % 3 === 0) {
        try {
            const sample = fogCtx.getImageData(0, 0, W, H);
            const data   = sample.data;
            let transparent = 0;
            // Contar píxeles con alpha < 30 (revelados)
            for (let i = 3; i < data.length; i += 4 * 8) {   // cada 8 px para velocidad
                if (data[i] < 30) transparent++;
            }
            const total    = data.length / (4 * 8);
            revealedPixels = Math.round((transparent / total) * 100);
        } catch (_) { /* tainted canvas en algunos navegadores */ }
    }

    // Umbral alcanzado — esperar PHOTO_SHOW_SECS y pasar a la siguiente
    if (revealedPixels >= REVEAL_THRESHOLD) {
        if (photoShownAt === 0) photoShownAt = now;
        if (now - photoShownAt >= PHOTO_SHOW_SECS) {
            currentPhotoIndex = (currentPhotoIndex + 1) % YASUNI_PHOTOS.length;
            _loadPhoto(currentPhotoIndex);
        }
    }
}

function _drawHUD(ctx, W, H) {
    // Barra de progreso de revelación (abajo, centrada)
    const barW    = Math.min(W * 0.5, 400);
    const barH    = 6;
    const barX    = (W - barW) / 2;
    const barY    = H - 30;
    const filled  = barW * Math.min(revealedPixels / REVEAL_THRESHOLD, 1);

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    _roundRect(ctx, barX, barY, barW, barH, 3);
    ctx.fill();

    const grad = ctx.createLinearGradient(barX, 0, barX + filled, 0);
    grad.addColorStop(0,   "#004d20");
    grad.addColorStop(0.5, "#00cc55");
    grad.addColorStop(1,   "#00ff88");
    ctx.fillStyle = grad;
    _roundRect(ctx, barX, barY, filled, barH, 3);
    ctx.fill();

    // Contador de fotos
    ctx.font      = "bold 14px 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(0,255,136,0.7)";
    ctx.textAlign = "right";
    ctx.fillText(`${currentPhotoIndex + 1} / ${YASUNI_PHOTOS.length}`, W - 24, H - 24);

    // Si ya se completó — mensaje de "siguiente"
    if (revealedPixels >= REVEAL_THRESHOLD && photoShownAt > 0) {
        const elapsed = performance.now() / 1000 - photoShownAt;
        const remaining = Math.max(0, PHOTO_SHOW_SECS - elapsed);
        ctx.font      = "bold 18px 'Segoe UI', sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.textAlign = "center";
        ctx.fillText(`¡Revelado! Siguiente en ${remaining.toFixed(1)}s…`, W / 2, H - 55);
    }
}

// ─── Parar ────────────────────────────────────────────────────────────────────
export function stopAnimalsAR() {
    running = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);

    // Limpiar canvas extra del DOM
    if (fogCanvas   && fogCanvas.parentNode)   fogCanvas.parentNode.removeChild(fogCanvas);
    if (photoCanvas && photoCanvas.parentNode) photoCanvas.parentNode.removeChild(photoCanvas);

    fogCanvas    = null;
    photoCanvas  = null;
    handTrails   = { Left: [], Right: [] };
}

// ─── Util ─────────────────────────────────────────────────────────────────────
function _roundRect(ctx, x, y, w, h, r) {
    if (w <= 0 || h <= 0) return;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
}