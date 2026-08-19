import { getHandLandmarker, createWithFallback, loadTasksVision } from './mediapipe.js';

let running = false;
let handLandmarker;
let canvas, ctx;
let refs = null;

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

const NOTES = [
  261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99,
  392.00, 415.30, 440.00, 466.16, 493.88, 523.25,
];
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B","C"];

const WHITE_TO_CHROMATIC = [0, 2, 4, 5, 7, 9, 11, 12];
const BLACK_PAIRS = [
  { between: [0,1], chromatic: 1  },
  { between: [1,2], chromatic: 3  },
  { between: [3,4], chromatic: 6  },
  { between: [4,5], chromatic: 8  },
  { between: [5,6], chromatic: 10 },
];

let lastKeyPlayed = null;
let lastPlayTime = 0;
const PLAY_COOLDOWN = 120;

const effects = [];
const KEYBOARD_HEIGHT = 220;
const BLACK_KEY_RATIO = 0.62;
const BLACK_KEY_HEIGHT_RATIO = 0.58;

function playPianoNote(freq) {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  const dur = 2.0;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(0.28, now + 0.004);
  masterGain.gain.exponentialRampToValueAtTime(0.07, now + 0.35);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  masterGain.connect(ctx.destination);

  const osc1 = ctx.createOscillator();
  osc1.type = "triangle";
  osc1.frequency.value = freq;
  osc1.connect(masterGain);
  osc1.start(now);
  osc1.stop(now + dur);

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = freq * 2;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.10, now);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc2.connect(g2);
  g2.connect(masterGain);
  osc2.start(now);
  osc2.stop(now + 0.5);

  const osc3 = ctx.createOscillator();
  osc3.type = "sine";
  osc3.frequency.value = freq * 3.01;
  const g3 = ctx.createGain();
  g3.gain.setValueAtTime(0.05, now);
  g3.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  osc3.connect(g3);
  g3.connect(masterGain);
  osc3.start(now);
  osc3.stop(now + 0.25);

  const bufSize = ctx.sampleRate * 0.035;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.12));
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.06, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  noise.connect(ng);
  ng.connect(masterGain);
  noise.start(now);
  noise.stop(now + 0.04);
}

function addEffect(chromaticIdx, cx, cy, isBlack) {
  const color = isBlack ? "#3CC3E6" : "#00FF88";
  const name = NOTE_NAMES[chromaticIdx];
  effects.push({
    type: "ring", x: cx, y: cy,
    time: performance.now(), dur: 600,
    color,
  });
  effects.push({
    type: "float", x: cx, y: cy - 30,
    text: name, time: performance.now(), dur: 900,
  });
}

function drawEffects(ctx, W, H) {
  const now = performance.now();
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    const t = (now - e.time) / e.dur;
    if (t >= 1) { effects.splice(i, 1); continue; }

    if (e.type === "ring") {
      const radius = 20 + t * 120;
      const alpha = 1 - t;
      ctx.beginPath();
      ctx.arc(e.x, e.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${e.color === "#00FF88" ? "0,255,136" : "60,195,230"},${alpha * 0.5})`;
      ctx.lineWidth = 3 * (1 - t);
      ctx.stroke();
    }

    if (e.type === "float") {
      const alpha = 1 - t;
      const yOff = -t * 50;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "bold 22px 'Orbitron', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = e.color;
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 16;
      ctx.fillText(e.text, e.x, e.y + yOff);
      ctx.restore();
    }
  }
}

export async function initAirPiano(refsArg) {
  refs = refsArg;
  canvas = refs.canvas;

  const { HandLandmarker } = await loadTasksVision();
  handLandmarker = getHandLandmarker();
  if (!handLandmarker) {
    handLandmarker = await createWithFallback(HandLandmarker, {
      baseOptions: { modelAssetPath: "public/models/hand_landmarker.task" },
      runningMode: "VIDEO", numHands: 2,
    }, "Air Piano");
  }

  running = true;
  render();
}

function render() {
  if (!running) return;

  const video = refs.video;
  const ctx = canvas.getContext("2d");

  if (video.readyState === 4) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const W = canvas.width;
    const H = canvas.height;

    const result = handLandmarker.detectForVideo(video, performance.now());
    ctx.clearRect(0, 0, W, H);

    const keyW = W / 8;
    const kbY = H - KEYBOARD_HEIGHT;
    const blackW = keyW * BLACK_KEY_RATIO;
    const blackH = KEYBOARD_HEIGHT * BLACK_KEY_HEIGHT_RATIO;

    for (let k = 0; k < 8; k++) {
      const x = k * keyW;
      const grad = ctx.createLinearGradient(x, kbY, x, H);
      grad.addColorStop(0, "rgba(255,255,255,0.15)");
      grad.addColorStop(0.6, "rgba(255,255,255,0.08)");
      grad.addColorStop(1, "rgba(255,255,255,0.04)");
      ctx.fillStyle = grad;
      ctx.fillRect(x + 1, kbY, keyW - 2, KEYBOARD_HEIGHT);

      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, kbY, keyW - 2, KEYBOARD_HEIGHT);

      ctx.font = "11px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillText(NOTE_NAMES[WHITE_TO_CHROMATIC[k]], x + keyW / 2, H - 6);
    }

    for (const bp of BLACK_PAIRS) {
      const centerX = bp.between[1] * keyW;
      const bx = centerX - blackW / 2;
      const grad = ctx.createLinearGradient(bx, kbY, bx, kbY + blackH);
      grad.addColorStop(0, "rgba(20,25,40,0.85)");
      grad.addColorStop(0.5, "rgba(10,15,30,0.75)");
      grad.addColorStop(1, "rgba(5,8,20,0.65)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(bx, kbY, blackW, blackH, [0, 0, 4, 4]);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, kbY, blackW, blackH, [0, 0, 4, 4]);
      ctx.stroke();
    }

    if (result.landmarks?.length) {
      result.landmarks.forEach((lm) => {
        const tip = lm[8];
        const x = tip.x * W;
        const y = tip.y * H;

        if (y > kbY) {
          let hitKey = -1;
          let isBlack = false;

          for (const bp of BLACK_PAIRS) {
            const centerX = bp.between[1] * keyW;
            const bx = centerX - blackW / 2;
            if (y < kbY + blackH && x >= bx && x <= bx + blackW) {
              hitKey = bp.chromatic;
              isBlack = true;
              break;
            }
          }

          if (hitKey === -1) {
            const wk = Math.min(7, Math.max(0, Math.floor(x / keyW)));
            hitKey = WHITE_TO_CHROMATIC[wk];
          }

          const now = performance.now();
          if (hitKey !== lastKeyPlayed || now - lastPlayTime > PLAY_COOLDOWN) {
            playPianoNote(NOTES[hitKey]);
            lastKeyPlayed = hitKey;
            lastPlayTime = now;

            const keyCenter = isBlack
              ? { x: (Math.floor((BLACK_PAIRS.find(bp => bp.chromatic === hitKey)).between[1])) * keyW, y: kbY + blackH / 2 }
              : { x: (WHITE_TO_CHROMATIC.indexOf(hitKey)) * keyW + keyW / 2, y: kbY + KEYBOARD_HEIGHT / 2 };
            addEffect(hitKey, keyCenter.x, keyCenter.y, isBlack);
          }

          if (isBlack) {
            const bp = BLACK_PAIRS.find(b => b.chromatic === hitKey);
            const centerX = bp.between[1] * keyW;
            ctx.fillStyle = "rgba(60,195,230,0.5)";
            ctx.shadowColor = "#3CC3E6";
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.roundRect(centerX - blackW / 2, kbY, blackW, blackH, [0, 0, 4, 4]);
            ctx.fill();
            ctx.shadowBlur = 0;
          } else {
            const wk = WHITE_TO_CHROMATIC.indexOf(hitKey);
            if (wk !== -1) {
              ctx.fillStyle = "rgba(0,255,136,0.4)";
              ctx.shadowColor = "#00FF88";
              ctx.shadowBlur = 25;
              ctx.fillRect(wk * keyW + 1, kbY, keyW - 2, KEYBOARD_HEIGHT);
              ctx.shadowBlur = 0;

              ctx.shadowColor = "#00FF88";
              ctx.shadowBlur = 15;
              ctx.strokeStyle = "rgba(0,255,136,0.5)";
              ctx.lineWidth = 2;
              ctx.strokeRect(wk * keyW + 1, kbY, keyW - 2, KEYBOARD_HEIGHT);
              ctx.shadowBlur = 0;
            }
          }
        }
      });
    }

    drawEffects(ctx, W, H);
  }

  requestAnimationFrame(render);
}

export function stopAirPiano() {
  running = false;
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}