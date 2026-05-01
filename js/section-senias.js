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
    if (i && m && r && p && !t) return "Número 4";
    if (!i && !m && !r && p && !t) return "Letra I";
    if (i && !m && !r && p && t) return "Símbolo Rock";
    if (i && !m && !r && !p && !t) return "Número 1";
    if (!i && m && r && p && t) return "Letra B";
    if (t && !i && !m && !r && !p) return "Pulgar Arriba (Bien)";
    
    return "Analizando...";
}

function drawUI(text) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    ctx.fillStyle = "rgba(0, 255, 136, 0.9)";
    ctx.font = "bold 30px Arial";
    ctx.textAlign = "center";
    ctx.fillText(text, canvas.width / 2, 80); // Muestra el estado de ambas manos[cite: 26, 30]
    ctx.restore();
}

export function stopSenias() { running = false; }