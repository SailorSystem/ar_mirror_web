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

export function stopAnimalsAR() { running = false; }