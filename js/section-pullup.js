import { PoseLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

let running = false;
let poseLandmarker;
let reps = 0;
let isAbove = false;
let barY = 0;
let barSet = false;
let calibrating = true;
let startTime = 0;
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

  reps = 0; isAbove = false; barSet = false; calibrating = true;
  particles = []; flashAlpha = 0;
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

      // Barra adaptativa basada en proporciones del cuerpo
      if (!barSet && lm[0] && lm[11] && lm[12]) {
        const noseY = lm[0].y * H;
        const shoulderY = ((lm[11].y + lm[12].y) / 2) * H;
        const headLength = shoulderY - noseY;
        barY = noseY - headLength * 0.7;
        barSet = true;
        calibrating = false;
      }

      drawSkeleton(ctx, lm, W, H);

      if (barSet) {
        // Zona de barra (arriba)
        ctx.fillStyle = "rgba(255,107,107,0.08)";
        ctx.fillRect(0, 0, W, barY);

        // Línea de barra con efecto de tubo
        const tubeH = 14;
        const grad = ctx.createLinearGradient(0, barY - tubeH / 2, 0, barY + tubeH / 2);
        grad.addColorStop(0, "rgba(255,107,107,0.15)");
        grad.addColorStop(0.3, "rgba(255,107,107,0.7)");
        grad.addColorStop(0.7, "rgba(255,107,107,0.7)");
        grad.addColorStop(1, "rgba(255,107,107,0.15)");
        ctx.fillStyle = grad;
        ctx.shadowColor = "#ff6b6b";
        ctx.shadowBlur = 25;
        ctx.fillRect(0, barY - tubeH / 2, W, tubeH);
        ctx.shadowBlur = 0;

        // Destellos en los extremos del tubo
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        for (let x = 0; x < W; x += W / 3) {
          ctx.fillRect(x, barY - tubeH / 2 + 2, 40, tubeH - 4);
        }

        ctx.font = "10px 'Orbitron', sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(255,107,107,0.6)";
        ctx.fillText("⬆ CRUZA LA BARRA ⬆", 18, barY + 3);

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

      if (calibrating) {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, H / 2 - 36, W, 72);
        ctx.fillStyle = "#ff6b6b";
        ctx.font = "bold 18px 'Orbitron', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#ff6b6b";
        ctx.shadowBlur = 16;
        ctx.fillText("🔄 Párate derecho frente a la cámara", W / 2, H / 2);
        ctx.restore();
      }

      // HUD con fondo para el contador
      const hudW = 140;
      const hudH = 64;
      const hudX = 18;
      const hudY = 18;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(hudX, hudY, hudW, hudH, 10);
      ctx.fill();

      ctx.font = "bold 40px 'Cinzel', serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "#ff6b6b";
      ctx.shadowBlur = 14;
      ctx.fillText(`${reps}`, hudX + 18, hudY + 48);
      ctx.shadowBlur = 0;
      ctx.font = "10px 'Orbitron', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText("REPS", hudX + 72, hudY + 42);

      elapsed = (performance.now() - startTime) / 1000;
      const mins = Math.floor(elapsed / 60);
      const secs = Math.floor(elapsed % 60);
      ctx.font = "16px 'Orbitron', sans-serif";
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(`${mins}:${secs.toString().padStart(2, "0")}`, W - 20, 44);
      ctx.font = "9px 'Orbitron', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillText("TIEMPO", W - 20, 58);

      // Barra de progreso
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
