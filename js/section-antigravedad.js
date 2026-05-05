/**
 * section-antigravedad.js — Partículas PUCE con física de manos
 *
 * FÍSICA:
 *   ✊ PUÑO  (todos los dedos doblados) → atracción fuerte: las partículas vuelan hacia la mano
 *   🖐 ABIERTA (dedos extendidos)       → repulsión/explosión: las partículas salen disparadas
 *   Mano ausente                        → flotación con leve gravedad inversa (antigravedad)
 *
 * Partículas: 40 esferas con colores institucionales PUCE
 * (azul marino #003366, dorado #C8A951, blanco)
 */

import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

let running      = false;
let handLandmarker;
let particles    = [];
let animFrameId  = null;

// ─── Configuración visual ─────────────────────────────────────────────────────
const PARTICLE_COUNT   = 40;
const PUCE_COLORS      = ["#003366", "#003366", "#C8A951", "#C8A951", "#FFFFFF"];
const BASE_RADIUS      = 8;

// ─── Física ───────────────────────────────────────────────────────────────────
const ATTRACT_FORCE    = 0.00018;  // puño — fuerza de atracción
const REPEL_FORCE      = 0.00025;  // mano abierta — fuerza de repulsión
const DRIFT_FORCE      = 0.00004;  // sin mano — flotación suave
const DAMPING          = 0.96;     // amortiguación de velocidad
const ANTIGRAV         = -0.0004;  // gravedad inversa constante (flotación)
const MAX_SPEED        = 0.035;    // velocidad máxima normalizada

// ─── Inicialización ───────────────────────────────────────────────────────────
export async function initAntigravedad() {
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

    // Inicializar partículas en posiciones aleatorias
    particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        x:     Math.random(),
        y:     Math.random(),
        vx:    (Math.random() - 0.5) * 0.008,
        vy:    (Math.random() - 0.5) * 0.008,
        color: PUCE_COLORS[i % PUCE_COLORS.length],
        r:     BASE_RADIUS + Math.random() * 5,
        alpha: 0.7 + Math.random() * 0.3,
        // Offset de fase para el efecto de pulso
        phase: Math.random() * Math.PI * 2,
    }));

    running = true;
    render();
}

// ─── Detección de gesto de mano ───────────────────────────────────────────────
/**
 * Clasifica la mano como "puño", "abierta" o "neutra".
 * Basado en si las puntas de los dedos están por encima o debajo de sus nudillos.
 */
function clasificarMano(lm) {
    const arriba = (tip, pip) => lm[tip].y < lm[pip].y;
    const dedosArriba = [
        arriba(8,  6),   // índice
        arriba(12, 10),  // medio
        arriba(16, 14),  // anular
        arriba(20, 18),  // meñique
    ];
    const conteo = dedosArriba.filter(Boolean).length;

    if (conteo === 0) return "puño";     // todos doblados
    if (conteo >= 3)  return "abierta";  // 3 o más extendidos
    return "neutra";
}

// ─── Centro de la palma (punto 9, base del dedo medio) ───────────────────────
function centrarMano(lm) {
    return {
        x: (lm[0].x + lm[9].x) / 2,
        y: (lm[0].y + lm[9].y) / 2,
    };
}

// ─── Render loop ──────────────────────────────────────────────────────────────
function render() {
    if (!running) return;
    animFrameId = requestAnimationFrame(render);

    const video  = document.getElementById("webcam");
    const canvas = document.getElementById("output_canvas");
    const ctx    = canvas.getContext("2d");

    if (video.readyState < 4) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const W = canvas.width;
    const H = canvas.height;

    const result = handLandmarker.detectForVideo(video, performance.now());
    ctx.clearRect(0, 0, W, H);

    // Recopilar manos activas con su gesto y posición
    const manos = (result.landmarks || []).map((lm) => ({
        pos:   centrarMano(lm),
        gesto: clasificarMano(lm),
    }));

    const t = performance.now() / 1000;

    // ── Actualizar física de cada partícula ───────────────────────────────────
    particles.forEach((p) => {
        // Antigravedad constante (flotación hacia arriba)
        p.vy += ANTIGRAV;

        if (manos.length === 0) {
            // Sin mano: drift suave + ligera atracción al centro
            p.vx += (0.5 - p.x) * DRIFT_FORCE;
            p.vy += (0.5 - p.y) * DRIFT_FORCE;
        } else {
            manos.forEach(({ pos, gesto }) => {
                const dx  = pos.x - p.x;
                const dy  = pos.y - p.y;
                const d2  = Math.max(0.0005, dx * dx + dy * dy);
                const inv = 1 / d2;

                if (gesto === "puño") {
                    // Atracción — partícula vuela hacia la mano
                    const f = ATTRACT_FORCE * inv;
                    p.vx += dx * f;
                    p.vy += dy * f;
                } else if (gesto === "abierta") {
                    // Repulsión — explosión desde la palma
                    const f = REPEL_FORCE * inv;
                    p.vx -= dx * f;
                    p.vy -= dy * f;
                } else {
                    // Neutra: atracción débil
                    const f = ATTRACT_FORCE * 0.3 * inv;
                    p.vx += dx * f;
                    p.vy += dy * f;
                }
            });
        }

        // Limitar velocidad máxima
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > MAX_SPEED) {
            p.vx = (p.vx / speed) * MAX_SPEED;
            p.vy = (p.vy / speed) * MAX_SPEED;
        }

        // Amortiguación
        p.vx *= DAMPING;
        p.vy *= DAMPING;

        // Mover
        p.x += p.vx;
        p.y += p.vy;

        // Rebotar en bordes con pérdida de energía
        if (p.x < 0)   { p.x = 0;   p.vx *= -0.7; }
        if (p.x > 1)   { p.x = 1;   p.vx *= -0.7; }
        if (p.y < 0)   { p.y = 0;   p.vy *= -0.7; }
        if (p.y > 1)   { p.y = 1;   p.vy *= -0.7; }
    });

    // ── Dibujar conexiones entre partículas cercanas ──────────────────────────
    ctx.save();
    for (let a = 0; a < particles.length; a++) {
        for (let b = a + 1; b < particles.length; b++) {
            const pa = particles[a], pb = particles[b];
            const d  = Math.hypot(pa.x - pb.x, pa.y - pb.y);
            if (d < 0.12) {
                const alpha = (1 - d / 0.12) * 0.35;
                ctx.beginPath();
                ctx.moveTo(pa.x * W, pa.y * H);
                ctx.lineTo(pb.x * W, pb.y * H);
                ctx.strokeStyle = `rgba(200, 169, 81, ${alpha})`;
                ctx.lineWidth   = 1;
                ctx.stroke();
            }
        }
    }
    ctx.restore();

    // ── Dibujar partículas ────────────────────────────────────────────────────
    const tiempo = performance.now() * 0.001;
    particles.forEach((p) => {
        const px   = (1 - p.x) * W;   // invertir X por el espejo CSS
        const py   = p.y * H;
        const pulso = 1 + 0.15 * Math.sin(tiempo * 2 + p.phase);
        const r    = p.r * pulso;

        // Sombra para profundidad
        ctx.shadowColor = p.color;
        ctx.shadowBlur  = 12;

        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.round(p.alpha * 255).toString(16).padStart(2, "0");
        ctx.fill();

        ctx.shadowBlur = 0;
    });

    // ── HUD de estado ──────────────────────────────────────────────────────────
    ctx.save();
    ctx.font      = "bold 20px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    if (manos.length === 0) {
        ctx.fillStyle = "rgba(200,169,81,0.7)";
        ctx.fillText("✨ Acerca una mano para interactuar", 20, 20);
    } else {
        manos.forEach((m, i) => {
            const icono  = m.gesto === "puño" ? "✊ Atrayendo" : m.gesto === "abierta" ? "🖐 Dispersando" : "🤚 Neutral";
            ctx.fillStyle = m.gesto === "puño" ? "#C8A951" : m.gesto === "abierta" ? "#00ff88" : "#ffffff";
            ctx.fillText(icono, 20, 20 + i * 32);
        });
    }

    // Logo PUCE en esquina
    ctx.font      = "bold 16px 'Segoe UI', sans-serif";
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(200,169,81,0.6)";
    ctx.fillText("PUCE Anti-gravedad", canvas.width - 20, 20);

    ctx.restore();
}

// ─── Stop ─────────────────────────────────────────────────────────────────────
export function stopAntigravedad() {
    running = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);
}