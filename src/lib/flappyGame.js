import { FaceLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
import { createWithFallback } from './mediapipe.js';

let faceLandmarker;
let running = false;
let isGameOver = false;
let canvas, ctx;
let frameCount = 0;
let score = 0;

const bird = { x: 100, y: 300, w: 45, h: 35, img: new Image() };
let pipes = [];
const pipeSettings = { width: 60, gap: 160, speed: 3.5 };

const pipeImg = new Image();
const baseImg = new Image();
let refs = null;

bird.img.src = "assets/textures/bluebird-upflap.png";
pipeImg.src = "assets/textures/pipe-green.png";
baseImg.src = "assets/textures/base.png";

export async function initFlappyGame(refsArg) {
  refs = refsArg;
  canvas = refs.canvas;

  faceLandmarker = await createWithFallback(
    FaceLandmarker,
    {
      baseOptions: { modelAssetPath: "public/models/face_landmarker.task" },
      runningMode: "VIDEO",
      numFaces: 1,
    },
    "Flappy Nose"
  );

  ctx = canvas.getContext("2d");

  refs.restartBtn.onclick = () => {
    if (isGameOver) {
      resetGame();
      animate();
    }
  };

  resetGame();
  running = true;
  animate();
}

function resetGame() {
  score = 0;
  pipes = [];
  frameCount = 0;
  bird.y = 300;
  isGameOver = false;
  refs.gameOver.classList.add("hidden");
}

function showGameOver() {
  isGameOver = true;
  refs.finalScore.textContent = score;
  refs.gameOver.classList.remove("hidden");
}

function animate() {
  if (!running || isGameOver) return;

  const video = refs.video;
  if (video.readyState === 4) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const results = faceLandmarker.detectForVideo(video, performance.now());

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      const nose = results.faceLandmarks[0][1];
      const targetX = nose.x * canvas.width;
      const targetY = nose.y * canvas.height;
      bird.y += (targetY - bird.y) * 0.25;
      bird.x = targetX;
    }

    if (frameCount % 90 === 0) {
      const minHeight = 50;
      const maxHeight = canvas.height - pipeSettings.gap - minHeight - 50;
      const randomY = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;
      pipes.push({ x: 0 - pipeSettings.width, y: randomY, passed: false });
    }

    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x += pipeSettings.speed;

      ctx.save();
      ctx.translate(p.x + pipeSettings.width / 2, p.y);
      ctx.scale(1, -1);
      ctx.drawImage(pipeImg, -pipeSettings.width / 2, 0, pipeSettings.width, p.y);
      ctx.restore();

      ctx.drawImage(pipeImg, p.x, p.y + pipeSettings.gap, pipeSettings.width, canvas.height - (p.y + pipeSettings.gap));

      if (checkCollision(p)) {
        showGameOver();
        return;
      }

      if (!p.passed && p.x > bird.x) {
        score++;
        p.passed = true;
      }

      if (p.x > canvas.width) pipes.splice(i, 1);
    }

    ctx.drawImage(baseImg, 0, canvas.height - 40, canvas.width, 40);

    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.scale(-1, 1);
    ctx.drawImage(bird.img, -bird.w / 2, -bird.h / 2, bird.w, bird.h);
    ctx.restore();

    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    ctx.fillStyle = "white";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    ctx.font = "bold 40px Arial";
    ctx.strokeText(`Puntos: ${score}`, 20, 60);
    ctx.fillText(`Puntos: ${score}`, 20, 60);
    ctx.restore();

    frameCount++;
  }

  requestAnimationFrame(animate);
}

function checkCollision(p) {
  const hitbox = 10;
  const birdLeft = bird.x - bird.w / 2 + hitbox;
  const birdRight = bird.x + bird.w / 2 - hitbox;
  const birdTop = bird.y - bird.h / 2 + hitbox;
  const birdBottom = bird.y + bird.h / 2 - hitbox;

  if (birdRight > p.x && birdLeft < p.x + pipeSettings.width) {
    if (birdTop < p.y || birdBottom > p.y + pipeSettings.gap) {
      return true;
    }
  }
  return birdBottom > canvas.height - 40;
}

export function stopFlappyGame() {
  running = false;
  if (refs && refs.gameOver) refs.gameOver.classList.add("hidden");
}