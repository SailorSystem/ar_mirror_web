import { PoseLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
import { createWithFallback } from './detector.js';

let poseLandmarker;
let running = false;
let isGameOver = false;
let canvas, ctx;
let frameCount = 0;
let score = 0;
let velocity = 0;

const bird = { x: 480, y: 300, w: 45, h: 35, img: new Image() };
const pipes = [];
const pipeSettings = { width: 60, gap: 190, speed: 2.5 };

bird.img.src = "assets/textures/bluebird-upflap.png";
const pipeImg = new Image(); pipeImg.src = "assets/textures/pipe-green.png";
const baseImg = new Image(); baseImg.src = "assets/textures/base.png";

let modelReady = false;
let leftReady = false;
let rightReady = false;
let flapFlash = 0;
let curlCount = 0;

const GRAVITY = 0.45;
const FLAP_VELOCITY = -7.5;
const ANGLE_EXTENDED = 150;
const ANGLE_CURLED = 100;

const SKELETON = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
];

function calcElbowAngle(shoulder, elbow, wrist) {
  const v1x = shoulder.x - elbow.x;
  const v1y = shoulder.y - elbow.y;
  const v2x = wrist.x - elbow.x;
  const v2y = wrist.y - elbow.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const m2 = Math.sqrt(v2x * v2x + v2y * v2y);
  if (m1 < 0.001 || m2 < 0.001) return 180;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2))));
  return angle * (180 / Math.PI);
}

function drawSkeleton(lm, W, H) {
  for (const [a, b] of SKELETON) {
    ctx.beginPath();
    ctx.moveTo(lm[a].x * W, lm[a].y * H);
    ctx.lineTo(lm[b].x * W, lm[b].y * H);
    ctx.strokeStyle = "rgba(60,195,230,0.30)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (const i of [11, 12, 13, 14, 15, 16]) {
    const x = lm[i].x * W, y = lm[i].y * H;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = i === 13 || i === 14 ? "#ffd166" : "#3CC3E6";
    ctx.shadowColor = "#3CC3E6";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function flap() {
  velocity = FLAP_VELOCITY;
  curlCount++;
  flapFlash = 1;
}

export async function initVoiceBird() {
  canvas = document.getElementById("output_canvas");
  ctx = canvas.getContext("2d");

  try {
    poseLandmarker = await createWithFallback(PoseLandmarker, {
      baseOptions: { modelAssetPath: "public/models/pose_landmarker_lite.task" },
      runningMode: "VIDEO", numPoses: 1,
    }, "Flappy Curl");
    modelReady = true;
  } catch (err) {
    console.error("Error cargando PoseLandmarker:", err);
  }

  document.getElementById("restart-btn").onclick = () => {
    if (isGameOver) { resetGame(); animate(); }
  };

  resetGame();
  running = true;
  animate();
}

function resetGame() {
  score = 0; pipes.length = 0; frameCount = 0; bird.y = 300;
  isGameOver = false; velocity = 0; curlCount = 0;
  leftReady = false; rightReady = false; flapFlash = 0;
  document.getElementById("game-over-screen").classList.add("hidden");
}

function showGameOver() {
  isGameOver = true;
  document.getElementById("final-score").innerText = score;
  document.getElementById("game-over-screen").classList.remove("hidden");
}

function animate() {
  if (!running || isGameOver) return;

  const video = document.getElementById("webcam");
  if (video.readyState === 4) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    if (modelReady && poseLandmarker) {
      const results = poseLandmarker.detectForVideo(video, performance.now());

      if (results.landmarks && results.landmarks.length > 0) {
        const lm = results.landmarks[0];

        drawSkeleton(lm, W, H);

        const leftAngle = calcElbowAngle(lm[11], lm[13], lm[15]);
        const rightAngle = calcElbowAngle(lm[12], lm[14], lm[16]);

        if (leftAngle > ANGLE_EXTENDED) leftReady = true;
        if (rightAngle > ANGLE_EXTENDED) rightReady = true;

        if (leftReady && leftAngle < ANGLE_CURLED) {
          flap();
          leftReady = false;
        }
        if (rightReady && rightAngle < ANGLE_CURLED) {
          flap();
          rightReady = false;
        }

        const barX = W - 20;
        const barY = H * 0.08;
        const barH = H * 0.60;

        function drawAngleBar(x, angle, label, ready) {
          const n = Math.max(0, Math.min(1, (angle - 30) / (180 - 30)));
          const iy = barY + (1 - n) * barH;

          ctx.fillStyle = "rgba(255,255,255,0.04)";
          ctx.beginPath();
          ctx.roundRect(x, barY, 8, barH, 4);
          ctx.fill();

          const grad = ctx.createLinearGradient(x, barY, x, barY + barH);
          grad.addColorStop(0, "#4ade80");
          grad.addColorStop(0.5, "#ffd166");
          grad.addColorStop(1, "#ff6b6b");
          ctx.fillStyle = grad;
          ctx.shadowColor = "#ffd166";
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.roundRect(x - 1, iy - 2, 10, 4, 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          if (ready) {
            ctx.fillStyle = "rgba(74,222,128,0.25)";
            ctx.beginPath();
            ctx.roundRect(x - 2, barY, 12, barH, 4);
            ctx.fill();
          }

          ctx.font = "9px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.fillText(label, x + 4, barY - 6);

          ctx.font = "8px 'Inter', sans-serif";
          ctx.fillStyle = ready ? "rgba(74,222,128,0.6)" : "rgba(255,255,255,0.2)";
          ctx.fillText(ready ? "LISTO" : "---", x + 4, barY + barH + 10);
        }

        drawAngleBar(barX - 14, leftAngle, "IZQ", leftReady);
        drawAngleBar(barX + 6, rightAngle, "DER", rightReady);

        ctx.font = "10px 'Inter', sans-serif";
        ctx.textAlign = "right";
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillText(`Curls: ${curlCount}`, W - 4, H - 10);
      }
    }

    velocity += GRAVITY;
    bird.y += velocity;
    bird.y = Math.max(5, Math.min(H - 45, bird.y));

    if (flapFlash > 0) flapFlash = Math.max(0, flapFlash - 0.04);

    if (frameCount % 120 === 0) {
      const minH = 50, maxH = H - pipeSettings.gap - minH - 50;
      pipes.push({ x: 0 - pipeSettings.width, y: Math.floor(Math.random() * (maxH - minH + 1)) + minH, passed: false, fade: 0 });
    }

    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x += pipeSettings.speed;
      if (p.fade < 1) p.fade = Math.min(1, p.fade + 0.04);

      ctx.globalAlpha = p.fade;
      ctx.save();
      ctx.translate(p.x + pipeSettings.width / 2, p.y);
      ctx.scale(1, -1);
      ctx.drawImage(pipeImg, -pipeSettings.width / 2, 0, pipeSettings.width, p.y);
      ctx.restore();
      ctx.drawImage(pipeImg, p.x, p.y + pipeSettings.gap, pipeSettings.width, H - (p.y + pipeSettings.gap));
      ctx.globalAlpha = 1;

      if (checkCollision(p, H)) { showGameOver(); return; }
      if (!p.passed && p.x > bird.x) { score++; p.passed = true; }
      if (p.x > W) pipes.splice(i, 1);
    }

    ctx.drawImage(baseImg, 0, H - 40, W, 40);

    if (flapFlash > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(255,209,102,${flapFlash * 0.15})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(bird.x, bird.y);
    const tilt = Math.max(-25, Math.min(25, velocity * 2.5));
    ctx.rotate(tilt * Math.PI / 180);
    ctx.scale(-1, 1);
    ctx.drawImage(bird.img, -bird.w / 2, -bird.h / 2, bird.w, bird.h);
    ctx.restore();

    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-W, 0);
    ctx.fillStyle = "white";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    ctx.font = "bold 40px Arial";
    ctx.strokeText(`Puntos: ${score}`, 20, 60);
    ctx.fillText(`Puntos: ${score}`, 20, 60);
    ctx.restore();

    if (!modelReady) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, H / 2 - 30, W, 60);
      ctx.fillStyle = "#f87171";
      ctx.font = "bold 22px 'Orbitron', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#f87171";
      ctx.shadowBlur = 16;
      ctx.fillText("Cargando modelo de pose…", W / 2, H / 2);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    frameCount++;
  }

  requestAnimationFrame(animate);
}

function checkCollision(p, H) {
  const h = 10;
  const l = bird.x - bird.w / 2 + h, r = bird.x + bird.w / 2 - h;
  const t = bird.y - bird.h / 2 + h, b = bird.y + bird.h / 2 - h;
  if (r > p.x && l < p.x + pipeSettings.width) {
    if (t < p.y || b > p.y + pipeSettings.gap) return true;
  }
  return b > H - 40;
}

export function stopVoiceBird() {
  running = false;
  document.getElementById("game-over-screen").classList.add("hidden");
}
