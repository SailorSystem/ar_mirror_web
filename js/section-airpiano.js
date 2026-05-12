import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

let running = false;
let handLandmarker;

// ---------------------------
// Web Audio API (sintetizador)
// ---------------------------
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const NOTES = [
  261.63, // C4
  293.66, // D4
  329.63, // E4
  349.23, // F4
  392.00, // G4
  440.00, // A4
  493.88, // B4
  523.25  // C5
];

function playNote(freq, duration = 0.25) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.frequency.value = freq;
  osc.type = "sine";

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

// Para evitar múltiples disparos continuos
let lastKeyPlayed = null;
let lastPlayTime = 0;
const PLAY_COOLDOWN = 120; // ms




// ---------------------------------------
// Inicialización del modelo de Mediapipe
// ---------------------------------------
export async function initAirPiano() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "public/models/hand_landmarker.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 2
  });

  running = true;
  render();
}



// ---------------------------------------
// Render + detección + reproducción audio
// ---------------------------------------
function render() {
  if (!running) return;

  const video = document.getElementById("webcam");
  const canvas = document.getElementById("output_canvas");
  const ctx = canvas.getContext("2d");

  if (video.readyState === 4) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const result = handLandmarker.detectForVideo(video, performance.now());
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const keyWidth = canvas.width / 8;

    // Dibujar teclas
    for (let k = 0; k < 8; k++) {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(k * keyWidth, canvas.height - 180, keyWidth - 3, 180);
    }

    // Detección de dedos
    if (result.landmarks?.length) {
      result.landmarks.forEach((lm) => {
        const tip = lm[8]; // dedo índice
        const x = (1 - tip.x) * canvas.width;
        const y = tip.y * canvas.height;

        if (y > canvas.height - 180) {
          const key = Math.min(7, Math.max(0, Math.floor(x / keyWidth)));

          // Pintar tecla tocada
          ctx.fillStyle = "rgba(0,255,136,0.6)";
          ctx.fillRect(key * keyWidth, canvas.height - 180, keyWidth - 3, 180);

          // Reproducir sonido con cooldown
          const now = performance.now();
          if (key !== lastKeyPlayed || now - lastPlayTime > PLAY_COOLDOWN) {
            playNote(NOTES[key]);
            lastKeyPlayed = key;
            lastPlayTime = now;
          }
        }
      });
    }
  }

  requestAnimationFrame(render);
}



// ---------------------------
export function stopAirPiano() {
  running = false;
}