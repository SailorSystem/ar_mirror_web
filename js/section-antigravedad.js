import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

let running = false;
let handLandmarker;
let particles = [];

export async function initAntigravedad() {
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "public/models/hand_landmarker.task", delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2
  });
  particles = Array.from({ length: 28 }, () => ({ x: Math.random(), y: Math.random(), vx: 0, vy: 0 }));
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
    const r = handLandmarker.detectForVideo(video, performance.now());
    const hands = (r.landmarks || []).map((lm) => ({ x: lm[8].x, y: lm[8].y }));
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach((p) => {
      hands.forEach((h) => {
        const dx = p.x - h.x, dy = p.y - h.y;
        const d2 = Math.max(0.0008, dx * dx + dy * dy);
        const force = 0.00005 / d2;
        p.vx += dx * force; p.vy += dy * force;
      });
      p.vy -= 0.0007;
      p.vx *= 0.98; p.vy *= 0.98;
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > 1) p.vx *= -1;
      if (p.y < 0 || p.y > 1) p.vy *= -1;
      p.x = Math.max(0, Math.min(1, p.x)); p.y = Math.max(0, Math.min(1, p.y));
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath(); ctx.arc((1 - p.x) * canvas.width, p.y * canvas.height, 7, 0, Math.PI * 2); ctx.fill();
    });

    ctx.fillStyle = "#00ff88"; ctx.font = "700 26px Arial";
    ctx.fillText("PUCE Anti-gravedad", 20, 40);
  }
  requestAnimationFrame(render);
}

export function stopAntigravedad() { running = false; }
