import {
    HandLandmarker,
    FilesetResolver,
    DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

let handLandmarker;
let running = false;
let canvas, ctx, drawingUtils;
let dictionary = null;

const lastLetter = { Left:"", Right:"" };
const letterTs   = { Left:0,  Right:0  };
const DEBOUNCE_MS = 200;

const history = { Left:[], Right:[] };
const HISTORY_SIZE = 10;
const CONF_THRESHOLD = 0.35;
let handsSeen = { Left:0, Right:0 };

export async function initSenias() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions:{ modelAssetPath:"public/models/hand_landmarker.task", delegate:"GPU" },
        runningMode:"VIDEO", numHands:2,
    });

    await loadDictionary();

    canvas = document.getElementById("output_canvas");
    ctx    = canvas.getContext("2d");
    drawingUtils = new DrawingUtils(ctx);
    running = true;
    render();
}

async function loadDictionary() {
    try {
        const resp = await fetch("assets/LSEC/diccionario/landmarks.json");
        dictionary = await resp.json();
        console.log(`Diccionario LSEC cargado: ${Object.keys(dictionary).length} letras`);
    } catch(e) {
        console.error("Error cargando diccionario:", e);
        dictionary = {};
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
    f.indice  = norm[8][1]  < norm[5][1];
    f.medio   = norm[12][1] < norm[9][1];
    f.anular  = norm[16][1] < norm[13][1];
    f.menique = norm[20][1] < norm[17][1];
    f.pulgar  = norm[4][0]  < norm[2][0];
    return f;
}

function findBestMatch(lm) {
    const norm = normalizeLandmarks(lm);
    if (!norm || !dictionary) return { letter:"·", confidence:0 };

    const liveDists = computePairwiseDistances(norm);
    const liveState = compareFingerState(norm);

    let bestLetter = "·";
    let bestScore  = Infinity;
    let bestDist   = Infinity;

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
                for (const f of ["indice","medio","anular","menique"]) {
                    if (liveState[f] === v.finger_state[f]) stateMatch++;
                }
            }

            const score = distScore - stateMatch * 0.25;

            if (score < bestScore) {
                bestScore  = score;
                bestLetter = letter;
                bestDist   = distScore;
            }
        }
    }

    const confidence = Math.max(0, Math.min(1, 1 - bestDist / 3.5));
    return { letter:bestLetter, confidence };
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

function render() {
    if (!running) return;
    const video = document.getElementById("webcam");
    if (video.readyState === 4) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        const now = performance.now();
        const hr = handLandmarker.detectForVideo(video, now);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const seen = { Left:false, Right:false };
        const lines = [];

        if (hr.landmarks?.length) {
            hr.landmarks.forEach((lm, idx) => {
                drawingUtils.drawConnectors(lm, HandLandmarker.HAND_CONNECTIONS, { color:"#00FF88", lineWidth:3 });
                drawingUtils.drawLandmarks(lm, { color:"#FFF", lineWidth:1, radius:3 });

                let lado = hr.handedness?.[idx]?.[0]?.categoryName;
                if (lado !== "Left" && lado !== "Right") {
                    lado = lm[0].x > 0.5 ? "Left" : "Right";
                }
                const key = lado === "Left" ? "Left" : "Right";
                seen[key] = true;
                handsSeen[key] = performance.now();

                const label = lado === "Left" ? "Izquierda" : "Derecha";

                const match = findBestMatch(lm);
                const smoothed = smoothLetter(key, match);

                const ts = now - letterTs[key];
                if (smoothed !== lastLetter[key] || ts > DEBOUNCE_MS) {
                    lastLetter[key] = smoothed;
                    letterTs[key]   = now;
                }

                const conf = match.confidence;
                const pct = Math.round(conf * 100);
                const display = lastLetter[key] !== "·"
                    ? `${label}: ${lastLetter[key]} (${pct}%)`
                    : `${label}: ·`;

                lines.push(display);

                if (lastLetter[key] !== "·" && conf > CONF_THRESHOLD) {
                    drawLetterBadge(lastLetter[key], conf, lado);
                }
            });
        }

        for (const hand of ["Left", "Right"]) {
            if (!seen[hand] && handsSeen[hand] && now - handsSeen[hand] > 500) {
                history[hand] = [];
                lastLetter[hand] = "";
                handsSeen[hand] = 0;
            }
        }

        drawPanel(lines, 120, "#00ff88", "rgba(0,60,20,0.65)", "Alfabeto LSEC");
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

function orientation(lm) {
    const wristY   = lm[0].y;
    const midBaseY = lm[9].y;
    const wristX   = lm[0].x;
    const midBaseX = lm[9].x;
    const palmUp   = (lm[0].z || 0) > (lm[9].z || 0);
    return {
        palmUp,
        wristUp:   wristY < midBaseY,
        handRight: wristX < midBaseX,
        angle:     Math.atan2(midBaseY - wristY, midBaseX - wristX),
    };
}

function lsecPhrase(lm) {
    const up   = (t,p) => lm[t].y < lm[p].y;
    const dist = (a,b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
    const ori  = orientation(lm);
    const i = up(8,6), m = up(12,10), r = up(16,14), p = up(20,18);

    if (i && m && r && p && !ori.wristUp && lm[9].y < 0.45) return "HOLA";
    if (i && m && r && p && ori.handRight && lm[9].y < 0.5) return "ADIOS";
    if (i && m && r && p && !ori.wristUp && lm[9].y > 0.55) return "GRACIAS";
    if (!i && !m && !r && !p && dist(4,5) < 0.06 && lm[9].y > 0.5) return "POR FAVOR";
    if (i && m && r && p && lm[8].y < 0.35 && ori.wristUp) return "BUENOS DIAS";
    if (!i && !m && !r && !p && lm[9].y > 0.5 && lm[9].y < 0.75) return "SI";
    if (i && !m && !r && !p && !ori.wristUp) return "NO";
    if (i && m && r && p && ori.wristUp && lm[9].y > 0.45) return "AYUDA";
    if (i && m && !r && !p && dist(8,12) < 0.06) return "LENGUA DE SENAS";
    return null;
}

function mapGesture(cat) {
    return {
        "Thumb_Up":   "BIEN / GRACIAS",
        "Victory":    "V / 2",
        "Open_Palm":  "HOLA / B",
        "Closed_Fist":"A / E / S",
        "Pointing_Up":"1 / Z",
        "ILoveYou":   "TE QUIERO / Y",
    }[cat] || null;
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

export function stopSenias() { running = false; }
