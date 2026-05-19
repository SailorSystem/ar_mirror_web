let running = false;
let isGameOver = false;
let canvas, ctx;
let frameCount = 0;
let score = 0;

const bird = { x: 100, y: 300, w: 45, h: 35, img: new Image() };
const pipes = [];
const pipeSettings = { width: 60, gap: 160, speed: 3.5 };

bird.img.src = "assets/textures/bluebird-upflap.png";
const pipeImg = new Image(); pipeImg.src = "assets/textures/pipe-green.png";
const baseImg = new Image(); baseImg.src = "assets/textures/base.png";

let audioCtx = null;
let micStream = null;
let analyser = null;
let source = null;
let dataArray = null;
let smoothPitch = 0;
let pitchHistory = [];
let calibrated = false;
let pitchMin = 200;
let pitchMax = 400;
let calibrateTimer = 0;
const CALIBRATE_DURATION = 2000;

async function startMic() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  source = audioCtx.createMediaStreamSource(micStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  dataArray = new Float32Array(analyser.fftSize);
}

function stopMic() {
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  if (audioCtx && audioCtx.state !== "closed") {
    audioCtx.close();
    audioCtx = null;
  }
}

function detectPitch(buffer, sampleRate) {
  const minFreq = 75;
  const maxFreq = 900;
  const minOffset = Math.floor(sampleRate / maxFreq);
  const maxOffset = Math.floor(sampleRate / minFreq);

  let bestOffset = minOffset;
  let bestDiff = Infinity;

  for (let offset = minOffset; offset <= maxOffset; offset++) {
    let diff = 0;
    for (let i = 0; i < maxOffset; i++) {
      diff += Math.abs(buffer[i] - buffer[i + offset]);
    }
    const avgDiff = diff / maxOffset;
    if (avgDiff < bestDiff) {
      bestDiff = avgDiff;
      bestOffset = offset;
    }
  }

  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);

  if (rms < 0.018) return -1;
  if (bestDiff > 0.35) return -1;

  return sampleRate / bestOffset;
}

export async function initVoiceBird() {
  canvas = document.getElementById("output_canvas");
  ctx = canvas.getContext("2d");

  try {
    await startMic();
  } catch {
    console.warn("Micrófono no disponible");
  }

  document.getElementById("restart-btn").onclick = () => {
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
  pipes.length = 0;
  frameCount = 0;
  bird.y = 300;
  isGameOver = false;
  pitchHistory = [];
  calibrated = false;
  calibrateTimer = 0;
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
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    if (analyser && dataArray) {
      analyser.getFloatTimeDomainData(dataArray);
      const pitch = detectPitch(dataArray, audioCtx.sampleRate);

      if (pitch > 0) {
        smoothPitch += (pitch - smoothPitch) * 0.35;

        if (!calibrated) {
          pitchHistory.push(smoothPitch);
          calibrateTimer += 16;
          if (calibrateTimer >= CALIBRATE_DURATION && pitchHistory.length > 10) {
            pitchMin = Math.min(...pitchHistory);
            pitchMax = Math.max(...pitchHistory);
            const range = pitchMax - pitchMin;
            pitchMin -= range * 0.15;
            pitchMax += range * 0.15;
            calibrated = true;
          }
        }
      }

      if (calibrated && smoothPitch > 0) {
        let t = (smoothPitch - pitchMin) / (pitchMax - pitchMin);
        t = Math.max(0, Math.min(1, t));
        const targetY = H * 0.12 + (1 - t) * (H * 0.65);
        bird.y += (targetY - bird.y) * 0.18;
      } else if (!calibrated) {
        bird.y += 1.5;
      } else {
        bird.y += 2.5;
      }

      bird.y = Math.max(20, Math.min(H - 100, bird.y));

      ctx.save();
      ctx.globalAlpha = 0.12;
      for (let i = 0; i < dataArray.length; i += 4) {
        const x = (i / dataArray.length) * W;
        const amp = (dataArray[i] + 1) * 0.5;
        ctx.fillStyle = "#3CC3E6";
        ctx.fillRect(x, H - 20 - amp * 16, 2, amp * 16);
      }
      ctx.restore();

      if (calibrated) {
        const barX = W - 30;
        const barH = H * 0.55;
        const barY = H * 0.12;
        const pitchNorm = (smoothPitch - pitchMin) / (pitchMax - pitchMin);
        const indicatorY = barY + (1 - Math.max(0, Math.min(1, pitchNorm))) * barH;

        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(barX, barY, 12, barH);

        const grad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
        grad.addColorStop(0, "#3CC3E6");
        grad.addColorStop(0.5, "#ffd166");
        grad.addColorStop(1, "#ff6b6b");
        ctx.fillStyle = grad;
        ctx.fillRect(barX + 2, indicatorY - 3, 8, 6);

        ctx.shadowColor = "#3CC3E6";
        ctx.shadowBlur = 12;
        ctx.fillRect(barX + 2, indicatorY - 3, 8, 6);
        ctx.shadowBlur = 0;

        ctx.font = "9px 'Orbitron', sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillText("TONO", barX + 6, barY - 8);
      }
    } else {
      bird.y += 1.5;
    }

    if (frameCount % 90 === 0) {
      const minH = 50;
      const maxH = H - pipeSettings.gap - minH - 50;
      const randomY = Math.floor(Math.random() * (maxH - minH + 1)) + minH;
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

      ctx.drawImage(pipeImg, p.x, p.y + pipeSettings.gap, pipeSettings.width, H - (p.y + pipeSettings.gap));

      if (checkCollision(p, H)) {
        showGameOver();
        return;
      }

      if (!p.passed && p.x > bird.x) {
        score++;
        p.passed = true;
      }

      if (p.x > W) pipes.splice(i, 1);
    }

    ctx.drawImage(baseImg, 0, H - 40, W, 40);

    ctx.save();
    ctx.translate(bird.x, bird.y);
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

    if (!calibrated) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, H / 2 - 30, W, 60);
      ctx.fillStyle = "#ffd166";
      ctx.font = "bold 22px 'Orbitron', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#ffd166";
      ctx.shadowBlur = 16;
      ctx.fillText("🎤 Haz sonido para calibrar…", W / 2, H / 2);
      ctx.restore();
    }

    frameCount++;
  }

  requestAnimationFrame(animate);
}

function checkCollision(p, H) {
  const hitbox = 10;
  const bL = bird.x - bird.w / 2 + hitbox;
  const bR = bird.x + bird.w / 2 - hitbox;
  const bT = bird.y - bird.h / 2 + hitbox;
  const bB = bird.y + bird.h / 2 - hitbox;

  if (bR > p.x && bL < p.x + pipeSettings.width) {
    if (bT < p.y || bB > p.y + pipeSettings.gap) return true;
  }
  return bB > H - 40;
}

export function stopVoiceBird() {
  running = false;
  stopMic();
  document.getElementById("game-over-screen").classList.add("hidden");
}
