import { HandLandmarker, FilesetResolver, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

let handLandmarker;
let running = false;
let canvas, ctx, drawingUtils;

export async function initSenias() {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "public/models/hand_landmarker.task",
            delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2 // AHORA DETECTA DOS MANOS[cite: 30]
    });

    canvas = document.getElementById("output_canvas");
    ctx = canvas.getContext("2d");
    drawingUtils = new DrawingUtils(ctx);
    running = true;
    render();
}

function render() {
    if (!running) return;
    const video = document.getElementById("webcam");

    if (video.readyState === 4) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const result = handLandmarker.detectForVideo(video, performance.now());

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Validamos que existan landmarks y datos de lateralidad (handedness)
        if (result.landmarks && result.landmarks.length > 0) {
            let gestures = [];
            
            result.landmarks.forEach((landmarks, index) => {
                // Dibujo de conectores y puntos[cite: 26, 30]
                drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, { color: "#00FF88", lineWidth: 5 });
                drawingUtils.drawLandmarks(landmarks, { color: "#FFFFFF", lineWidth: 2, radius: 4 });

                // CORRECCIÓN: Validación de seguridad para handedness
                let label = "Mano"; 
                if (result.handedness && result.handedness[index] && result.handedness[index][0]) {
                    label = result.handedness[index][0].categoryName === "Left" ? "Izquierda" : "Derecha";
                }

                const gesture = interpretGesture(landmarks);
                gestures.push(`${label}: ${gesture}`);
            });
            
            drawUI(gestures.join(" | "));
        }
    }
    requestAnimationFrame(render);
}

function interpretGesture(lm) {
    const isUp = (tip, base) => lm[tip].y < lm[base].y;
    const isExtended = (tip, knuckle) => Math.abs(lm[tip].x - lm[knuckle].x) > 0.1;

    const dist = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
    const pinch = dist(4, 8) < 0.06;
    const thumbNearIndexBase = dist(4, 5) < 0.08;

    const i = isUp(8, 6);  // Índice[cite: 26]
    const m = isUp(12, 10); // Medio[cite: 26]
    const r = isUp(16, 14); // Anular[cite: 26]
    const p = isUp(20, 18); // Meñique[cite: 26]
    const t = isExtended(4, 2); // Pulgar[cite: 26]

    // DICCIONARIO EXTENDIDO[cite: 26, 30]
    if (i && m && r && p && t) return "Mano Abierta (5)";
    if (!i && !m && !r && !p && !t) return "Puño (A)";
    if (i && !m && !r && !p && t) return "Letra L";
    if (i && m && !r && !p && !t) return "Número 2 (V)";
    if (i && m && r && !p && !t) return "Número 3";
    if (t && i && !m && !r && !p) return "Pistola / Letra L variante";
    if (i && m && r && p && !t) return "Número 4";
    if (thumbNearIndexBase && i && m && r && p) return "Letra B";
    if (!i && !m && !r && p && !t) return "Letra I";
    if (i && !m && !r && p && t) return "Símbolo Rock";
    if (i && !m && !r && !p && !t) return "Número 1";
    if (!i && m && r && p && t) return "Letra B";
    if (t && !i && !m && !r && !p) return "Pulgar Arriba (Bien)";
    if (pinch && !m && !r && !p) return "Pinza (OK simple)";
    if (pinch && m && r && p) return "Letra F / OK";
    if (!i && m && !r && !p && !t) return "Letra U (aprox.)";
    if (!i && m && r && !p && !t) return "Letra W (aprox.)";
    if (!i && !m && r && p && !t) return "Gesto 2 dedos laterales";
    if (!i && !m && !r && p && t) return "Letra Y";
    if (i && m && !r && !p && t) return "Número 8 (aprox.)";
    if (i && !m && r && !p && !t) return "Seña combinada (I-R)";
    if (!i && m && !r && p && !t) return "Seña combinada (M-P)";
    
    return "Analizando...";
}

function drawUI(text) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);

    const maxWidth = Math.min(canvas.width - 40, 1100);
    const x = canvas.width / 2;
    const y = 110; // evita chocar con el nav superior

    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const width = Math.min(ctx.measureText(text).width + 48, maxWidth);
    const height = 50;
    const left = x - width / 2;
    const top = y - height / 2;

    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.strokeStyle = "rgba(0, 255, 136, 0.9)";
    ctx.lineWidth = 2;
    roundRect(ctx, left, top, width, height, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#00ff88";
    ctx.fillText(text, x, y);
    ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

export function stopSenias() { running = false; }
