import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

let running = false;
let handLandmarker;

export async function initAirPiano() {
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "public/models/hand_landmarker.task", delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2
  });
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
    const result = handLandmarker.detectForVideo(video, performance.now());
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const keyWidth = canvas.width / 8;
    for (let k = 0; k < 8; k++) {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(k * keyWidth, canvas.height - 180, keyWidth - 3, 180);
    }
    if (result.landmarks?.length) {
      result.landmarks.forEach((lm) => {
        const tip = lm[8];
        const x = (1 - tip.x) * canvas.width;
        const y = tip.y * canvas.height;
        if (y > canvas.height - 180) {
          const key = Math.min(7, Math.max(0, Math.floor(x / keyWidth)));
          ctx.fillStyle = "rgba(0,255,136,0.6)";
          ctx.fillRect(key * keyWidth, canvas.height - 180, keyWidth - 3, 180);
        }
      });
    }
  }
  requestAnimationFrame(render);
}

export function stopAirPiano() { running = false; }
