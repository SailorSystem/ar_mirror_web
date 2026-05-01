const { PoseLandmarker, FilesetResolver, DrawingUtils } = mpTasksVision;

let poseLandmarker;
let running = false;

export async function initAnimalsAR() {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "models/pose_landmarker_lite.task", delegate: "GPU" },
        runningMode: "VIDEO"
    });
    
    running = true;
    render();
}

function render() {
    if (!running) return;
    const video = document.getElementById("webcam");
    const canvas = document.getElementById("output_canvas");
    const ctx = canvas.getContext("2d");
    const drawingUtils = new DrawingUtils(ctx);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const result = poseLandmarker.detectForVideo(video, performance.now());
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (result.landmarks) {
        for (const landmarks of result.landmarks) {
            // DIBUJAR ESQUELETO (DEBUG)
            drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS);
            drawingUtils.drawLandmarks(landmarks, { color: "#FF0000", lineWidth: 2 });
            
            // Ejemplo: Burbuja sobre el hombro izquierdo (punto 11)
            const shoulder = landmarks[11];
            ctx.fillStyle = "white";
            ctx.fillText("¡Mueve los brazos!", (1 - shoulder.x) * canvas.width, shoulder.y * canvas.height - 20);
        }
    }
    requestAnimationFrame(render);
}

function checkSign(landmarks) {
    // Índices de MediaPipe: 8 (Índice), 12 (Medio), 16 (Anular), 20 (Meñique)
    // Nudillos base: 5, 9, 13, 17
    
    const isFingerDown = (tip, base) => landmarks[tip].y > landmarks[base].y;
    
    let gesture = "Detectando...";

    // Lógica para letra 'A' (Puño cerrado, pulgar a un lado)
    const fingersDown = isFingerDown(8, 5) && isFingerDown(12, 9) && 
                        isFingerDown(16, 13) && isFingerDown(20, 17);
    
    // Lógica para letra 'B' (Mano abierta, dedos juntos)
    const fingersUp = !isFingerDown(8, 5) && !isFingerDown(12, 9) && 
                      !isFingerDown(16, 13) && !isFingerDown(20, 17);

    if (fingersDown) gesture = "Letra: A";
    else if (fingersUp) gesture = "Letra: B";

    // Dibujar en pantalla con estilo
    ctx.fillStyle = "rgba(0, 255, 136, 0.8)";
    ctx.roundRect(20, 20, 250, 60, 15);
    ctx.fill();
    ctx.fillStyle = "black";
    ctx.font = "bold 30px Arial";
    ctx.fillText(gesture, 40, 60);
}

export function stopAnimalsAR() { running = false; }