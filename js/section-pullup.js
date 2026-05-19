import { PoseLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

let running = false;
let poseLandmarker;
let reps = 0;
let isAbove = false;
let barY = 0;
let barSet = false;
let startTime = 0;
let elapsed = 0;
let flashAlpha = 0;
let particles = [];

const SKELETON = [
  [11,12],[11,23],[12,24],[23,24],
  [11,13],[13,15],[12,14],[14,16],
  [23,25],[25,27],[24,26],[26,28],
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
];
const LANDMARK_LABELS = {
  0:"nariz", 7:"oreja izq", 8:"oreja der",
  11:"hombro izq", 12:"hombro der",
  13:"codo izq", 14:"codo der",
  15:"muñeca izq", 16:"muñeca der",
  23:"cadera izq", 24:"cadera der",
};

export async function initPullup() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );
  try {
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "public/models/pose_landmarker_lite.task", delegate: "GPU" },
      runningMode: "VIDEO", numPoses: 1,
    });
  } catch {
    console.warn("GPU no disponible para Pull-up, usando CPU");
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "public/models/pose_landmarker_lite.task", delegate: "CPU" },
      runningMode: "VIDEO", numPoses: 1,
    });
  }

  reps = 0; isAbove = false; barSet = false; particles = []; flashAlpha = 0;
  startTime = performance.now();
  running = true;
  render();
}

function drawSkeleton(ctx, landmarks, W, H) {
  const lx = (i) => landmarks[i].x * W;
  const ly = (i) => landmarks[i].y * H;

  for (const [a, b] of SKELETON) {
    ctx.beginPath();
    ctx.moveTo(lx(a), ly(a));
    ctx.lineTo(lx(b), ly(b));
    ctx.strokeStyle = "rgba(60,195,230,0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  for (let i = 0; i < landmarks.length; i++) {
    const x = lx(i);
    const y = ly(i);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#3CC3E6";
    ctx.shadowColor = "#3CC3E6";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;

    if (LANDMARK_LABELS[i]) {
      ctx.font = "9px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(`${i} ${LANDMARK_LABELS[i]}`, x, y - 10);
    }
  }

  if (landmarks[0]) {
    const nx = lx(0);
    const ny = ly(0);
    ctx.beginPath();
    ctx.arc(nx, ny, 8, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#ffd166";
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function addParticles(x, y) {
  for (let i = 0; i < 16; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1,
      size: 3 + Math.random() * 4,
      color: Math.random() > 0.5 ? "#ff6b6b" : "#ffd166",
    });
  }
}

function drawParticles(ctx) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12;
    p.life -= 0.025;
    if (p.life <= 0) { particles.splice(i, 1); continue; }

    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function render() {
  if (!running) return;

  const video = document.getElementById("webcam");
  const canvas = document.getElementById("output_canvas");
  const ctx = canvas.getContext("2d");

  if (video.readyState === 4) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const W = canvas.width;
    const H = canvas.height;

    const result = poseLandmarker.detectForVideo(video, performance.now());
    ctx.clearRect(0, 0, W, H);

    if (result.landmarks?.[0]) {
      const lm = result.landmarks[0];

      if (!barSet && lm[0]) {
        barY = lm[0].y * H - 60;
        barSet = true;
      }

      drawSkeleton(ctx, lm, W, H);

      if (barSet) {
        ctx.beginPath();
        ctx.moveTo(0, barY);
        ctx.lineTo(W, barY);
        ctx.strokeStyle = "rgba(255,107,107,0.7)";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#ff6b6b";
        ctx.shadowBlur = 20;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = "rgba(255,107,107,0.12)";
        ctx.fillRect(0, 0, W, barY);

        ctx.font = "12px 'Orbitron', sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = "#ff6b6b";
        ctx.shadowColor = "#ff6b6b";
        ctx.shadowBlur = 10;
        ctx.fillText("━ BARRA ━", 16, barY - 10);
        ctx.shadowBlur = 0;

        const noseY = lm[0].y * H;
        const nowAbove = noseY < barY - 8;

        if (nowAbove && !isAbove) {
          flashAlpha = 0.35;
          addParticles(lm[0].x * W, lm[0].y * H);
        }
        if (!nowAbove && isAbove) {
          reps++;
          flashAlpha = 0.2;
          addParticles(W / 2, H / 2);
        }

        isAbove = nowAbove;
      }

      ctx.save();
      ctx.font = "bold 42px 'Cinzel', serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "#ff6b6b";
      ctx.shadowBlur = 18;
      ctx.fillText(`${reps}`, 24, 60);
      ctx.shadowBlur = 0;
      ctx.font = "11px 'Orbitron', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText("REPS", 72, 54);

      elapsed = (performance.now() - startTime) / 1000;
      const mins = Math.floor(elapsed / 60);
      const secs = Math.floor(elapsed % 60);
      ctx.font = "18px 'Orbitron', sans-serif";
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(`${mins}:${secs.toString().padStart(2, "0")}`, W - 20, 48);
      ctx.font = "9px 'Orbitron', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillText("TIEMPO", W - 20, 62);
      ctx.restore();

      if (reps > 0) {
        const barW = Math.min(W - 80, 300);
        const barX = (W - barW) / 2;
        const barH = 6;
        const pct = Math.min(1, reps / 10);
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.roundRect(barX, H - 40, barW, barH, 3);
        ctx.fill();
        ctx.fillStyle = "#ff6b6b";
        ctx.shadowColor = "#ff6b6b";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.roundRect(barX, H - 40, barW * pct, barH, 3);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = "9px 'Orbitron', sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillText(`${reps}/10`, barX + barW / 2, H - 48);
      }
    } else {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, H / 2 - 30, W, 60);
      ctx.fillStyle = "#ff6b6b";
      ctx.font = "bold 20px 'Orbitron', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#ff6b6b";
      ctx.shadowBlur = 16;
      ctx.fillText("Párate frente a la cámara", W / 2, H / 2);
      ctx.restore();
    }

    if (flashAlpha > 0) {
      ctx.fillStyle = `rgba(255,107,107,${flashAlpha})`;
      ctx.fillRect(0, 0, W, H);
      flashAlpha -= 0.02;
    }

    drawParticles(ctx);
  }

  requestAnimationFrame(render);
}

export function stopPullup() {
  running = false;
}
