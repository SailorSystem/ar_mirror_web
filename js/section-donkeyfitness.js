import { PoseLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

let running = false;
let poseLandmarker;
let squats = 0;
let isDown = false;
let playerY = 0;

export async function initDonkeyFitness() {
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "public/models/pose_landmarker_lite.task", delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1
  });
  squats = 0; isDown = false; playerY = 0;
  running = true;
  render();
}

function render() {
  if (!running) return;
  const video = document.getElementById("webcam");
  const canvas = document.getElementById("output_canvas");
  const ctx = canvas.getContext("2d");
  if (video.readyState === 4) {
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const r = poseLandmarker.detectForVideo(video, performance.now());
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (r.landmarks?.[0]) {
      const lm = r.landmarks[0];
      const hip = lm[24].y;
      const knee = lm[26].y;
      const delta = knee - hip;
      if (delta < 0.12 && !isDown) isDown = true;
      if (delta > 0.18 && isDown) { squats++; isDown = false; playerY = -140; }
    }

    playerY = Math.min(0, playerY + 8);
    ctx.fillStyle = "#4caf50"; ctx.fillRect(0, canvas.height - 80, canvas.width, 80);
    ctx.fillStyle = "#ff9800"; ctx.fillRect(120, canvas.height - 150 + playerY, 70, 70);
    ctx.fillStyle = "#fff"; ctx.font = "bold 36px Arial"; ctx.fillText(`Sentadillas: ${squats}`, 20, 50);
  }
  requestAnimationFrame(render);
}

export function stopDonkeyFitness() { running = false; }
