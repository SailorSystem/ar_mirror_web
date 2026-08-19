import { getHandLandmarker, createWithFallback, loadTasksVision } from './mediapipe.js';

let handLandmarker;
let running = false;
let canvas, ctx, drawingUtils;
let handLandmarkerClass = null;
let dictionary = null;
let gestureDict = null;
let refs = null;

const lastLetter = { Left: "", Right: "" };
const letterTs = { Left: 0, Right: 0 };
const DEBOUNCE_MS = 200;

const history = { Left: [], Right: [] };
const HISTORY_SIZE = 10;
const CONF_THRESHOLD = 0.35;
let handsSeen = { Left: 0, Right: 0 };

const handMotion = { Left: [], Right: [] };
const MOTION_WINDOW = 8;

const gestureVotes = [];
const GESTURE_WINDOW = 20;
const GESTURE_VOTE_RATIO = 0.3;
const GESTURE_CONF_THRESHOLD = 0.3;
let lastGestureWord = "";
let lastGestureTs = 0;
const GESTURE_DEBOUNCE = 500;
const GESTURE_HOLD_TIME = 3000;
let displayedGestureWord = "";
let displayedGestureTs = 0;

export async function initSenias(refsArg) {
  refs = refsArg;

  const { HandLandmarker, DrawingUtils } = await loadTasksVision();
  handLandmarkerClass = HandLandmarker;
  handLandmarker = getHandLandmarker();
  if (!handLandmarker) {
    handLandmarker = await createWithFallback(
      HandLandmarker,
      {
        baseOptions: { modelAssetPath: "public/models/hand_landmarker.task" },
        runningMode: "VIDEO",
        numHands: 2,
      },
      "Lengua de Señas"
    );
  }

  await loadDictionary();
  await loadGestureDictionary();

  canvas = refs.canvas;
  ctx = canvas.getContext("2d");
  drawingUtils = new DrawingUtils(ctx);
  running = true;
  render();
}

async function loadDictionary() {
  try {
    const resp = await fetch("lib/lsec_abecedario.json");
    dictionary = await resp.json();
    console.log(`Abecedario LSEC cargado: ${Object.keys(dictionary).length} letras`);
  } catch (e) {
    console.error("Error cargando abecedario:", e);
    dictionary = {};
  }
}

async function loadGestureDictionary() {
  try {
    const idxResp = await fetch("lib/lsec_gestos/index.json");
    const modules = await idxResp.json();
    const responses = await Promise.all(
      modules.map(m => fetch(`lib/lsec_gestos/${m}.json`).then(r => r.json()))
    );
    gestureDict = Object.assign({}, ...responses);
    console.log(`Gestos LSEC cargado: ${Object.keys(gestureDict).length} gestos (${modules.length} módulos)`);
  } catch (e) {
    console.error("Error cargando gestos:", e);
    gestureDict = {};
  }
}

function normalizeLandmarks(lm) {
  const wx = lm[0].x, wy = lm[0].y, wz = lm[0].z;
  const mx = lm[9].x, my = lm[9].y, mz = lm[9].z;
  const palmSize = Math.hypot(mx - wx, my - wy, mz - wz);
  if (palmSize < 1e-8) return null;
  const norm = [];
  for (let i = 0; i < 21; i++) {
    norm.push([
      (lm[i].x - wx) / palmSize,
      (lm[i].y - wy) / palmSize,
      (lm[i].z - wz) / palmSize,
    ]);
  }
  return norm;
}

function computePairwiseDistances(norm) {
  const dists = [];
  for (let i = 0; i < 21; i++) {
    for (let j = i + 1; j < 21; j++) {
      const dx = norm[i][0] - norm[j][0];
      const dy = norm[i][1] - norm[j][1];
      const dz = norm[i][2] - norm[j][2];
      dists.push(Math.hypot(dx, dy, dz));
    }
  }
  return dists;
}

function compareFingerState(norm) {
  const f = {};
  f.indice = norm[8][1] < norm[5][1];
  f.medio = norm[12][1] < norm[9][1];
  f.anular = norm[16][1] < norm[13][1];
  f.menique = norm[20][1] < norm[17][1];
  f.pulgar = norm[4][0] < norm[2][0];
  return f;
}

function findBestMatch(lm) {
  const norm = normalizeLandmarks(lm);
  if (!norm || !dictionary) return { letter: "·", confidence: 0 };

  const liveDists = computePairwiseDistances(norm);
  const liveState = compareFingerState(norm);

  let bestLetter = "·";
  let bestScore = Infinity;
  let bestDist = Infinity;

  for (const [letter, variants] of Object.entries(dictionary)) {
    for (const v of variants) {
      if (!v.detected) continue;

      let sumSq = 0;
      const dd = v.pairwise_distances;
      for (let i = 0; i < liveDists.length; i++) {
        const d = liveDists[i] - dd[i];
        sumSq += d * d;
      }
      const distScore = Math.sqrt(sumSq);

      let stateMatch = 0;
      if (v.finger_state) {
        for (const f of ["indice", "medio", "anular", "menique"]) {
          if (liveState[f] === v.finger_state[f]) stateMatch++;
        }
      }

      const score = distScore - stateMatch * 0.25;

      if (score < bestScore) {
        bestScore = score;
        bestLetter = letter;
        bestDist = distScore;
      }
    }
  }

  const confidence = Math.max(0, Math.min(1, 1 - bestDist / 3.5));
  return { letter: bestLetter, confidence };
}

function smoothLetter(key, match) {
  const h = history[key];
  h.push(match);
  if (h.length > HISTORY_SIZE) h.shift();

  const counts = {};
  let totalConf = 0;
  for (const m of h) {
    counts[m.letter] = (counts[m.letter] || 0) + 1;
    totalConf += m.confidence;
  }
  const avgConf = totalConf / h.length;

  let best = "·", bestCount = 0;
  for (const [l, c] of Object.entries(counts)) {
    if (c > bestCount) { bestCount = c; best = l; }
  }

  const ratio = bestCount / h.length;
  if (ratio > 0.35 && avgConf > CONF_THRESHOLD && best !== "·") {
    return best;
  }
  return "·";
}

function getHandKey(lm, idx, hr) {
  let lado = hr.handedness?.[idx]?.[0]?.categoryName;
  if (lado !== "Left" && lado !== "Right") {
    lado = lm[0].x > 0.5 ? "Left" : "Right";
  }
  return lado === "Left" ? "Left" : "Right";
}

function updateMotion(key, lm) {
  const pos = { x: lm[0].x, y: lm[0].y, z: lm[0].z };
  const h = handMotion[key];
  h.push(pos);
  if (h.length > MOTION_WINDOW) h.shift();
}

function getHandMotion(key) {
  const h = handMotion[key];
  if (h.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < h.length; i++) {
    total += Math.hypot(h[i].x - h[i - 1].x, h[i].y - h[i - 1].y, h[i].z - h[i - 1].z);
  }
  return total / (h.length - 1);
}

function matchGestureFrame(lm) {
  const norm = normalizeLandmarks(lm);
  if (!norm || !gestureDict) return { word: null, distance: Infinity };

  const liveDists = computePairwiseDistances(norm);

  let bestWord = null;
  let bestDist = Infinity;

  for (const [word, data] of Object.entries(gestureDict)) {
    const primary = data.hand_analysis?.primary_hand || "Left";
    for (const f of data.frames) {
      const hand = f.hands?.[primary] || f.hand;
      if (!hand || !hand.detected || !hand.pairwise_distances) continue;

      let sumSq = 0;
      const dd = hand.pairwise_distances;
      for (let i = 0; i < liveDists.length; i++) {
        const d = liveDists[i] - dd[i];
        sumSq += d * d;
      }
      const dist = Math.sqrt(sumSq);

      if (dist < bestDist) {
        bestDist = dist;
        bestWord = word;
      }
    }
  }

  const confidence = Math.max(0, Math.min(1, 1 - bestDist / 3.5));
  return { word: bestWord, distance: bestDist, confidence };
}

function accumulateGesture() {
  if (gestureVotes.length < 5) return null;

  const counts = {};
  let totalConf = 0;
  for (const v of gestureVotes) {
    if (v.word) {
      counts[v.word] = (counts[v.word] || 0) + 1;
      totalConf += v.confidence;
    }
  }

  const avgConf = totalConf / gestureVotes.length;
  if (avgConf < GESTURE_CONF_THRESHOLD) return null;

  let bestWord = null;
  let bestCount = 0;
  for (const [word, count] of Object.entries(counts)) {
    if (count > bestCount) {
      bestCount = count;
      bestWord = word;
    }
  }

  if (!bestWord) return null;
  const ratio = bestCount / gestureVotes.length;
  if (ratio < GESTURE_VOTE_RATIO) return null;

  return { word: bestWord, confidence: ratio * avgConf };
}

function render() {
  if (!running) return;
  const video = refs.video;
  if (video.readyState === 4) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const now = performance.now();
    const hr = handLandmarker.detectForVideo(video, now);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const seen = { Left: false, Right: false };
    const lines = [];
    let gestureLm = null;
    let gestureMotion = 0;

    if (hr.landmarks?.length) {
      for (let idx = 0; idx < hr.landmarks.length; idx++) {
        const lm = hr.landmarks[idx];

        drawingUtils.drawConnectors(lm, handLandmarkerClass.HAND_CONNECTIONS, { color: "#00FF88", lineWidth: 3 });
        drawingUtils.drawLandmarks(lm, { color: "#FFF", lineWidth: 1, radius: 3 });

        const key = getHandKey(lm, idx, hr);
        seen[key] = true;
        handsSeen[key] = now;

        updateMotion(key, lm);

        const motion = getHandMotion(key);
        if (motion > gestureMotion) {
          gestureMotion = motion;
          gestureLm = { lm, key, motion };
        }
      }

      for (let idx = 0; idx < hr.landmarks.length; idx++) {
        const lm = hr.landmarks[idx];
        const key = getHandKey(lm, idx, hr);
        const label = key === "Left" ? "Izquierda" : "Derecha";

        const match = findBestMatch(lm);
        const smoothed = smoothLetter(key, match);

        if (smoothed !== lastLetter[key] || now - letterTs[key] > DEBOUNCE_MS) {
          lastLetter[key] = smoothed;
          letterTs[key] = now;
        }

        const conf = match.confidence;
        const pct = Math.round(conf * 100);
        const display = lastLetter[key] !== "·"
          ? `${label}: ${lastLetter[key]} (${pct}%)`
          : `${label}: ·`;

        lines.push(display);

        if (lastLetter[key] !== "·" && conf > CONF_THRESHOLD) {
          drawLetterBadge(lastLetter[key], conf, key);
        }
      }
    }

    for (const hand of ["Left", "Right"]) {
      if (!seen[hand] && handsSeen[hand] && now - handsSeen[hand] > 500) {
        history[hand] = [];
        lastLetter[hand] = "";
        handMotion[hand] = [];
        handsSeen[hand] = 0;
      }
    }

    if (gestureLm && gestureMotion > 0.03) {
      const gmatch = matchGestureFrame(gestureLm.lm);
      gestureVotes.push(gmatch);
      if (gestureVotes.length > GESTURE_WINDOW) gestureVotes.shift();

      const gresult = accumulateGesture();
      if (gresult && now - lastGestureTs > GESTURE_DEBOUNCE) {
        lastGestureWord = gresult.word;
        lastGestureTs = now;
        displayedGestureWord = gresult.word;
        displayedGestureTs = now;
        lines.push(`Gesto: ${gresult.word}`);
      } else if (gresult && lastGestureWord !== "" && now - lastGestureTs < GESTURE_DEBOUNCE) {
        lines.push(`Gesto: ${lastGestureWord}`);
      }
    } else if (gestureMotion <= 0.03) {
      const stillCount = gestureVotes.filter(v => v.distance > 2.0).length;
      if (stillCount > gestureVotes.length * 0.5) {
        gestureVotes.length = 0;
      }
    }

    let activeGestureWord = null;
    if (displayedGestureWord && now - displayedGestureTs < GESTURE_HOLD_TIME) {
      activeGestureWord = displayedGestureWord;
    }
    const gestureFromVote = lines.findIndex(l => l.startsWith('Gesto:'));
    if (gestureFromVote >= 0) {
      activeGestureWord = lines[gestureFromVote].replace('Gesto: ', '');
    }

    const letterLines = gestureFromVote >= 0
      ? lines.filter((_, i) => i !== gestureFromVote)
      : lines;

    if (letterLines.length) {
      drawPanel(letterLines, 120, "#00ff88", "rgba(0,60,20,0.65)", "LSEC — Letras");
    }
    if (activeGestureWord) {
      drawGestureBadge(activeGestureWord);
      drawPanel([`Gesto: ${activeGestureWord}`], 190, "#3CC3E6", "rgba(0,60,80,0.65)", "Gesto detectado");
    }
  }
  requestAnimationFrame(render);
}

function drawLetterBadge(letter, conf, side) {
  const h = canvas.height;
  const w = canvas.width;
  const size = 80;
  const x = side === "Left" ? 40 : w - 40 - size;
  const y = h / 2 - size / 2;

  ctx.save();
  ctx.scale(-1, 1);
  ctx.translate(-canvas.width, 0);

  ctx.fillStyle = "rgba(0,60,20,0.8)";
  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = 2;
  rrect(ctx, x, y, size, size, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#00ff88";
  ctx.font = "bold 40px 'Segoe UI',sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, x + size / 2, y + size / 2 - 6);

  ctx.font = "11px 'Segoe UI',sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText(`${Math.round(conf * 100)}%`, x + size / 2, y + size - 10);

  ctx.restore();
}

function drawGestureBadge(word) {
  const h = canvas.height;
  const w = canvas.width;
  ctx.save();
  ctx.scale(-1, 1);
  ctx.translate(-canvas.width, 0);
  const bw = Math.min(w * 0.55, 380);
  const bh = 56;
  const bx = w / 2 - bw / 2;
  const by = 16;
  ctx.fillStyle = "rgba(0,60,80,0.85)";
  ctx.strokeStyle = "#3CC3E6";
  ctx.lineWidth = 2;
  rrect(ctx, bx, by, bw, bh, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#3CC3E6";
  ctx.font = "bold 28px 'Segoe UI',sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(word, w / 2, by + bh / 2 - 2);
  ctx.font = "9px 'Segoe UI',sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText("GESTO", w / 2, by + bh - 7);
  ctx.restore();
}

function drawPanel(lines, yBase, textColor, bgColor, label) {
  if (!lines.length) return;
  ctx.save();
  ctx.scale(-1, 1);
  ctx.translate(-canvas.width, 0);
  const W = canvas.width;
  const text = lines.join("   |   ");
  ctx.font = "bold 24px 'Segoe UI',sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = Math.min(ctx.measureText(text).width + 56, W - 40);
  const th = 50;
  const bx = W / 2 - tw / 2;
  const by = yBase - th / 2;
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = textColor;
  ctx.lineWidth = 2;
  rrect(ctx, bx, by, tw, th, 13);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.fillText(text, W / 2, yBase);
  ctx.font = "12px 'Segoe UI',sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText(label, W / 2, yBase + th / 2 + 14);
  ctx.restore();
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function stopSenias() {
  running = false;
}