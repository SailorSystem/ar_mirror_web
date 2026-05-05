/**
 * section-senias.js — Traductor de Lengua de Señas Ecuatoriana (LSEC)
 *
 * Alfabeto dactilológico basado en el Glosario Básico de LSEC (FENASEC /
 * Vicepresidencia de la República del Ecuador).
 *
 * Estrategia de detección:
 *   1. HandLandmarker → 21 puntos 3D → reglas geométricas para el alfabeto estático
 *   2. GestureRecognizer → gestos predefinidos (Thumb_Up, Victory, etc.) como capa
 *      de refuerzo para saludos y expresiones comunes
 *
 * Referencia de puntos MediaPipe:
 *   0=muñeca  4=pulgar_tip  8=índice_tip  12=medio_tip  16=anular_tip  20=meñique_tip
 *   Bases de metacarpos: 1=pulgar 2=índice 5=índice_base 9=medio 13=anular 17=meñique
 */

import {
    HandLandmarker,
    GestureRecognizer,
    FilesetResolver,
    DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

let handLandmarker;
let gestureRecognizer;
let running = false;
let canvas, ctx, drawingUtils;

// ─── Inicialización ───────────────────────────────────────────────────────────
export async function initSenias() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );

    // HandLandmarker — para reglas geométricas del alfabeto LSEC
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "public/models/hand_landmarker.task",
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
    });

    // GestureRecognizer — capa adicional para saludos y gestos universales
    try {
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "public/models/gesture_recognizer.task",
                delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 2,
        });
    } catch (_) {
        // El gesture_recognizer.task es opcional
        gestureRecognizer = null;
    }

    canvas = document.getElementById("output_canvas");
    ctx    = canvas.getContext("2d");
    drawingUtils = new DrawingUtils(ctx);
    running = true;
    render();
}

// ─── Render loop ──────────────────────────────────────────────────────────────
function render() {
    if (!running) return;
    const video = document.getElementById("webcam");

    if (video.readyState === 4) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        const now = performance.now();

        const handResult    = handLandmarker.detectForVideo(video, now);
        const gestureResult = gestureRecognizer
            ? gestureRecognizer.recognizeForVideo(video, now)
            : null;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (handResult.landmarks && handResult.landmarks.length > 0) {
            let gestures = [];

            handResult.landmarks.forEach((lm, idx) => {
                drawingUtils.drawConnectors(lm, HandLandmarker.HAND_CONNECTIONS, {
                    color: "#00FF88", lineWidth: 4,
                });
                drawingUtils.drawLandmarks(lm, {
                    color: "#FFFFFF", lineWidth: 1, radius: 3,
                });

                // Lateralidad
                let lado = "Mano";
                if (handResult.handedness?.[idx]?.[0]) {
                    lado = handResult.handedness[idx][0].categoryName === "Left"
                        ? "Izquierda" : "Derecha";
                }

                // Intentar primero con GestureRecognizer para saludos/expresiones
                let seña = null;
                if (gestureResult?.gestures?.[idx]?.[0]) {
                    seña = _mapGestureToLSEC(gestureResult.gestures[idx][0].categoryName);
                }

                // Si no se reconoció por gesture, usar reglas del alfabeto LSEC
                if (!seña) {
                    seña = interpretarLSEC(lm);
                }

                gestures.push(`${lado}: ${seña}`);
            });

            drawUI(gestures.join("   |   "));
        }
    }
    requestAnimationFrame(render);
}

// ─── Mapa de GestureRecognizer → LSEC ────────────────────────────────────────
function _mapGestureToLSEC(category) {
    const map = {
        "Thumb_Up":     "👍 Bien / Gracias",
        "Victory":      "✌ Letra V / 2",
        "Open_Palm":    "🖐 Letra B / Hola",
        "Closed_Fist":  "✊ Letra A / E / S",
        "Pointing_Up":  "☝ Letra D / 1",
        "ILoveYou":     "🤟 Letra Y / Te quiero",
    };
    return map[category] || null;
}

// ─── Interpretador LSEC ───────────────────────────────────────────────────────
/**
 * Implementa el alfabeto dactilológico del Glosario Básico LSEC (FENASEC).
 * Las posiciones de referencia se leen del PDF oficial página 22.
 *
 * Convenciones:
 *   - "extendido" = la punta está claramente por encima del nudillo base (Y menor)
 *   - "doblado"   = la punta está por debajo o al nivel del nudillo
 *   - "pinza"     = distancia entre punta pulgar e índice < umbral
 *   - "contacto"  = dos puntas tocándose (dist < umbral)
 */
function interpretarLSEC(lm) {
    // ── Helpers geométricos ───────────────────────────────────────────────────
    const dist  = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
    const dist3 = (a, b) => Math.hypot(
        lm[a].x - lm[b].x, lm[a].y - lm[b].y, (lm[a].z || 0) - (lm[b].z || 0)
    );

    // Un dedo está "arriba" si su punta supera verticalmente su nudillo base
    const arriba = (tip, pip) => lm[tip].y < lm[pip].y;

    // Pulgar extendido lateralmente — comparar con la base del índice (5)
    const pulgarAfuera = lm[4].x < lm[2].x - 0.04 || lm[4].x > lm[2].x + 0.04;
    const pulgarArriba = lm[4].y < lm[3].y;

    // Estado de cada dedo (true = extendido)
    const i = arriba(8,  6);   // índice
    const m = arriba(12, 10);  // medio
    const r = arriba(16, 14);  // anular
    const p = arriba(20, 18);  // meñique
    const t = pulgarAfuera || pulgarArriba; // pulgar

    // Distancias útiles
    const pinzaIM  = dist(4, 8);   // pulgar-índice
    const pinzaMM  = dist(4, 12);  // pulgar-medio
    const pinzaAM  = dist(4, 16);  // pulgar-anular
    const pinzaMeñ = dist(4, 20);  // pulgar-meñique
    const contactoIM  = pinzaIM  < 0.07;
    const contactoMM  = pinzaMM  < 0.07;
    const contactoRM  = pinzaAM  < 0.07;
    const contactoPI  = dist(4, 5) < 0.07;  // pulgar sobre base índice

    // ── Alfabeto LSEC ─────────────────────────────────────────────────────────
    // Basado en ilustraciones del Glosario Básico LSEC, página 22.

    // A — puño cerrado, pulgar a un lado (sobre índice-medio)
    if (!i && !m && !r && !p && !t && contactoPI) return "A";

    // B — mano abierta, todos los dedos juntos y arriba, pulgar doblado
    if (i && m && r && p && !t) return "B";

    // C — mano curvada en forma de C, dedos semiflexionados
    // Aproximación: índice y meñique arriba, medio y anular semiflexionados
    if (i && !m && !r && p && !t && dist(8, 20) > 0.15) return "C";

    // CH — similar a C pero con movimiento lateral (usamos forma estática)
    if (i && m && !r && !p && !t && !contactoIM) return "CH";

    // D — índice arriba, resto en círculo con pulgar
    if (i && !m && !r && !p && contactoMM) return "D";

    // E — todos los dedos doblados hacia la palma, diferente de A (sin pulgar lateral)
    if (!i && !m && !r && !p && !pulgarArriba && !contactoPI) return "E";

    // F — índice y pulgar hacen pinza, resto extendido
    if (!i && m && r && p && contactoIM) return "F";

    // G — índice apunta horizontalmente, pulgar también horizontal
    if (i && !m && !r && !p && !t && lm[8].y > lm[5].y - 0.03) return "G";

    // H — índice y medio extendidos horizontalmente juntos
    if (i && m && !r && !p && !t && Math.abs(lm[8].y - lm[12].y) < 0.04) return "H";

    // I — solo meñique extendido
    if (!i && !m && !r && p && !t) return "I";

    // J — meñique extendido + pulgar (similar a Y pero con movimiento en J)
    if (!i && !m && !r && p && t) return "J / Y";

    // K — índice y medio arriba en V, pulgar entre ellos
    if (i && m && !r && !p && dist(4, 12) < 0.09 && dist(8, 12) > 0.08) return "K";

    // L — índice arriba + pulgar extendido horizontal (forma de L)
    if (i && !m && !r && !p && t && lm[4].y > lm[8].y) return "L";

    // LL — índice apunta y hace curva (forma estática: similar a L pero pulgar más bajo)
    if (i && !m && !r && !p && !t) return "LL / 1";

    // M — tres dedos (índice, medio, anular) doblados sobre el pulgar
    if (!i && !m && !r && !p && !t && dist(4, 9) < 0.08) return "M";

    // N — índice y medio doblados sobre el pulgar
    if (!i && !m && !r && !p && !t && dist(4, 6) < 0.08) return "N";

    // Ñ — similar a N pero con movimiento (forma estática parecida a N)
    // Diferenciar por posición relativa del pulgar
    if (!i && !m && !r && p && dist(4, 9) < 0.09) return "Ñ";

    // O — todos los dedos forman un círculo con el pulgar
    if (!i && !m && !r && !p && contactoIM && dist(8, 20) < 0.12) return "O";

    // P — índice apunta hacia abajo, pulgar extendido
    if (i && !m && !r && !p && t && lm[8].y > lm[5].y + 0.05) return "P";

    // Q — índice y pulgar apuntan hacia abajo formando un círculo
    if (contactoIM && !m && !r && !p && lm[8].y > lm[5].y + 0.04) return "Q";

    // R — índice y medio cruzados, extendidos
    if (i && m && !r && !p && !t && dist(8, 12) < 0.05) return "R";

    // RR — dos índices (usar ambas manos detectadas — aquí solo una)
    // En mano sola: similar a R pero dedos más separados
    if (i && m && !r && !p && !t && dist(8, 12) > 0.05 && dist(8, 12) < 0.10) return "RR";

    // S — puño cerrado con pulgar sobre los dedos (similar a A)
    if (!i && !m && !r && !p && lm[4].x > lm[8].x - 0.02) return "S";

    // T — índice doblado, pulgar entre índice y medio
    if (!i && !m && !r && !p && dist(4, 7) < 0.08) return "T";

    // U — índice y medio arriba juntos, anular y meñique doblados
    if (i && m && !r && !p && !t && dist(8, 12) < 0.04) return "U";

    // V — índice y medio arriba en V (separados)
    if (i && m && !r && !p && !t && dist(8, 12) > 0.06) return "V / 2";

    // W — índice, medio y anular arriba
    if (i && m && r && !p && !t) return "W / 3";

    // X — índice curvado en gancho
    if (!i && !m && !r && !p && !t && lm[8].y < lm[6].y && lm[8].y > lm[5].y) return "X";

    // Y — meñique y pulgar extendidos (cuernos de rock)
    if (!i && !m && !r && p && t) return "Y";

    // Z — índice traza una Z (forma estática: índice apunta, resto cerrado)
    if (i && !m && !r && !p && !t) return "Z / D / 1";

    // Números
    if (i && m && r && p && t)    return "B / 5 abierta";
    if (i && m && r && p && !t)   return "4";
    if (i && m && r && !p && !t)  return "3";
    if (contactoIM && !m && !r && !p) return "OK / F";

    return "Analizando...";
}

// ─── UI ───────────────────────────────────────────────────────────────────────
function drawUI(text) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);

    const W      = canvas.width;
    const maxW   = Math.min(W - 40, 1100);
    const cx     = W / 2;
    const cy     = 110;

    ctx.font      = "bold 26px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const tw  = Math.min(ctx.measureText(text).width + 56, maxW);
    const th  = 54;
    const bx  = cx - tw / 2;
    const by  = cy - th / 2;

    // Fondo con borde verde
    ctx.fillStyle   = "rgba(0, 0, 0, 0.60)";
    ctx.strokeStyle = "rgba(0, 255, 136, 0.9)";
    ctx.lineWidth   = 2;
    _roundRect(ctx, bx, by, tw, th, 14);
    ctx.fill();
    ctx.stroke();

    // Texto
    ctx.fillStyle = "#00ff88";
    ctx.fillText(text, cx, cy);

    // Subtítulo de referencia
    ctx.font      = "14px 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText("Alfabeto LSEC — FENASEC", cx, cy + th / 2 + 16);

    ctx.restore();
}

function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

export function stopSenias() { running = false; }