import { PoseLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
import { createWithFallback } from './detector.js';

let running = false;
let poseLandmarker;
let state = "waiting";
let reps = 0;
let isAbove = false;
let barY = 0;
let startTime = 0;
let flashAlpha = 0;
let particles = [];
let handsUpFrames = 0;

const SKELETON = [
  [11,12],[11,23],[12,24],[23,24],
  [11,13],[13,15],[12,14],[14,16],
  [23,25],[25,27],[24,26],[26,28],
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
];
const BODY_LABELS = {
  0:"nariz", 7:"oreja izq", 8:"oreja der",
  11:"hombro izq", 12:"hombro der",
  15:"muñeca izq", 16:"muñeca der",
};

export async function initPullup() {
  poseLandmarker = await createWithFallback(PoseLandmarker, {
    baseOptions: { modelAssetPath: "public/models/pose_landmarker_lite.task" },
    runningMode: "VIDEO", numPoses: 1,
  }, "Pull-up");

  state = "waiting"; reps = 0; isAbove = false; barY = 0;
  handsUpFrames = 0; particles = []; flashAlpha = 0;
  startTime = performance.now();
  running = true;
  render();
}

function drawSkeleton(ctx, lm, W, H) {
  for (const [a, b] of SKELETON) {
    ctx.beginPath();
    ctx.moveTo(lm[a].x * W, lm[a].y * H);
    ctx.lineTo(lm[b].x * W, lm[b].y * H);
    ctx.strokeStyle = "rgba(60,195,230,0.40)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  for (let i = 0; i < lm.length; i++) {
    const x = lm[i].x * W, y = lm[i].y * H;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#3CC3E6";
    ctx.shadowColor = "#3CC3E6";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (BODY_LABELS[i]) {
      ctx.font = "10px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(`${i} ${BODY_LABELS[i]}`, x, y - 12);
    }
  }

  // Nariz destacada
  const nx = lm[0].x * W, ny = lm[0].y * H;
  ctx.beginPath();
  ctx.arc(nx, ny, 8, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#ffd166";
  ctx.shadowBlur = 20;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Muñecas destacadas durante calibración
  if (state === "calibrating") {
    for (const idx of [15, 16]) {
      const wx = lm[idx].x * W, wy = lm[idx].y * H;
      ctx.beginPath();
      ctx.arc(wx, wy, 10, 0, Math.PI * 2);
      ctx.strokeStyle = "#ff6b6b";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function addParticles(x, y) {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 1, size: 3 + Math.random() * 4, color: Math.random() > 0.5 ? "#ff6b6b" : "#ffd166" });
  }
}

function renderParticles(ctx) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.025;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function drawCenterText(ctx, msg, sub, W, H, color) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.roundRect(W/2-200, H/2-48, 400, 96, 14);
  ctx.fill();
  ctx.fillStyle = color || "#ff6b6b";
  ctx.font = "bold 20px 'Orbitron', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = color || "#ff6b6b";
  ctx.shadowBlur = 16;
  ctx.fillText(msg, W/2, H/2 - 8);
  if (sub) {
    ctx.font = "13px 'Inter', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.shadowBlur = 0;
    ctx.fillText(sub, W/2, H/2 + 26);
  }
  ctx.restore();
}

function render() {
  if (!running) return;

  const video = document.getElementById("webcam");
  const canvas = document.getElementById("output_canvas");
  const ctx = canvas.getContext("2d");

  if (video.readyState === 4) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const W = canvas.width, H = canvas.height;

    const result = poseLandmarker.detectForVideo(video, performance.now());
    ctx.clearRect(0, 0, W, H);

    if (result.landmarks?.[0]) {
      const lm = result.landmarks[0];

      drawSkeleton(ctx, lm, W, H);

      if (state === "waiting") {
        state = "calibrating";
      }

      if (state === "calibrating") {
        const shoulderY = ((lm[11].y + lm[12].y) / 2) * H;
        const leftUp = lm[15] && (lm[15].y * H) < shoulderY;
        const rightUp = lm[16] && (lm[16].y * H) < shoulderY;

        if (leftUp && rightUp) {
          handsUpFrames++;
          const color = `rgba(255,107,107,${0.08 + Math.sin(performance.now() * 0.005) * 0.04 + 0.04})`;
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, W, H);

          if (handsUpFrames > 15) {
            const wristY = Math.min(lm[15].y * H, lm[16].y * H);
            barY = wristY - 10;
            state = "ready";
          }
        } else {
          handsUpFrames = Math.max(0, handsUpFrames - 1);
        }

        drawCenterText(ctx, "🙌  LEVANTA LOS BRAZOS", "Extiende ambas manos hacia arriba como si agarraras una barra", W, H);
      }

      if (state === "ready") {
        // Tubo/barra
        const tH = 14;
        const grad = ctx.createLinearGradient(0, barY - tH/2, 0, barY + tH/2);
        grad.addColorStop(0, "rgba(255,107,107,0.1)");
        grad.addColorStop(0.3, "rgba(255,107,107,0.8)");
        grad.addColorStop(0.7, "rgba(255,107,107,0.8)");
        grad.addColorStop(1, "rgba(255,107,107,0.1)");
        ctx.fillStyle = grad;
        ctx.shadowColor = "#ff6b6b";
        ctx.shadowBlur = 30;
        ctx.fillRect(0, barY - tH/2, W, tH);
        ctx.shadowBlur = 0;

        ctx.fillStyle = "rgba(255,255,255,0.1)";
        for (let x = 0; x < W; x += W/3) ctx.fillRect(x, barY - tH/2 + 3, 30, tH - 6);

        ctx.font = "10px 'Orbitron', sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(255,107,107,0.6)";
        ctx.fillText("▸ CRUZA LA NARIZ SOBRE LA BARRA ◂", 18, barY + 4);

        ctx.fillStyle = "rgba(255,107,107,0.06)";
        ctx.fillRect(0, 0, W, barY);

        const noseY = lm[0].y * H;
        const nowAbove = noseY < barY - 8;

        if (nowAbove && !isAbove) {
          flashAlpha = 0.3;
          addParticles(lm[0].x * W, lm[0].y * H);
        }
        if (!nowAbove && isAbove && reps < 10) {
          reps++;
          flashAlpha = 0.18;
          addParticles(W/2, barY);
        }
        isAbove = nowAbove;
      }

      // HUD
      const hudX = 16, hudY = 16, hudW = 130, hudH = 56;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.roundRect(hudX, hudY, hudW, hudH, 10);
      ctx.fill();

      ctx.font = "bold 38px 'Cinzel', serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "#ff6b6b";
      ctx.shadowBlur = 12;
      ctx.fillText(`${reps}`, hudX + 14, hudY + 44);
      ctx.shadowBlur = 0;
      ctx.font = "10px 'Orbitron', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText("REPS", hudX + 68, hudY + 38);

      const elapsed = (performance.now() - startTime) / 1000;
      const mins = Math.floor(elapsed / 60), secs = Math.floor(elapsed % 60);
      ctx.font = "15px 'Orbitron', sans-serif";
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(`${mins}:${secs.toString().padStart(2,"0")}`, W - 18, 42);
      ctx.font = "9px 'Orbitron', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillText("TIEMPO", W - 18, 56);

      if (reps > 0) {
        const bw = Math.min(W - 80, 280), bx = (W - bw)/2, bh = 6;
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.roundRect(bx, H - 38, bw, bh, 3);
        ctx.fill();
        ctx.fillStyle = "#ff6b6b";
        ctx.shadowColor = "#ff6b6b";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.roundRect(bx, H - 38, bw * Math.min(1, reps/10), bh, 3);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = "9px 'Orbitron', sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillText(`${reps}/10`, bx + bw/2, H - 46);
      }
    } else {
      drawCenterText(ctx, "PÁRATE FRENTE A LA CÁMARA", "Esperando detectar tu cuerpo…", W, H, "#3CC3E6");
    }

    if (flashAlpha > 0) {
      ctx.fillStyle = `rgba(255,107,107,${flashAlpha})`;
      ctx.fillRect(0, 0, W, H);
      flashAlpha -= 0.02;
    }

    renderParticles(ctx);
  }

  requestAnimationFrame(render);
}

export function stopPullup() {
  running = false;
}
