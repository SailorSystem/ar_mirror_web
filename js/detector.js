import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

let handLandmarker = null;
let detectionRunning = false;

export function getHandLandmarker() {
  return handLandmarker;
}

export async function ensureModels() {
  if (handLandmarker) return;
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "public/models/hand_landmarker.task", delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
  });
}

const INTRO_TEXT = {
  animals: {
    title: "Animales AR",
    desc: "Mueve tus manos frente a la cámara para revelar la fauna del Yasuní escondida bajo la niebla."
  },
  senias: {
    title: "Lengua de Señas",
    desc: "El alfabeto LSEC se reconoce en tiempo real. Muestra tus manos y lee las letras en pantalla."
  },
  airpiano: {
    title: "Air Piano",
    desc: "Toca el piano en el aire. Desliza tu dedo índice sobre las teclas virtuales para reproducir notas."
  },
  antigravedad: {
    title: "Antigravedad PUCE",
    desc: "Agarra y mueve las bolas flotantes. Puño para atraer, mano abierta para repeler."
  },
  game: {
    title: "Big Flappy Bird",
    desc: "Controla el pájaro con tu nariz. Inclina la cabeza para esquivar los obstáculos."
  },
  donkeyfitness: {
    title: "Donkey Kong Fitness",
    desc: "Ponte en cuclillas para que Donkey Kong salte y evite obstáculos. ¡A moverse!"
  }
};

const INTRO_EL_ID = "intro-overlay";

function ensureIntroContainer() {
  if (document.getElementById(INTRO_EL_ID)) return;
  const el = document.createElement("div");
  el.id = INTRO_EL_ID;
  el.className = "hidden";
  el.innerHTML = `
    <div class="intro-modal">
      <div class="intro-icon"></div>
      <h2 class="intro-title"></h2>
      <p class="intro-desc"></p>
      <button class="intro-btn">Comenzar</button>
      <p class="intro-hint">Acerca tu mano a la cámara para empezar</p>
    </div>`;
  document.body.appendChild(el);
}

export function showIntro(sectionId) {
  return new Promise((resolve) => {
    ensureIntroContainer();
    const overlay = document.getElementById(INTRO_EL_ID);
    const info = INTRO_TEXT[sectionId] || { title: sectionId, desc: "" };
    overlay.querySelector(".intro-icon").textContent = {
      animals: "🦁", senias: "✋", airpiano: "🎹",
      antigravedad: "🪐", game: "🐦", donkeyfitness: "🦍"
    }[sectionId] || "✨";
    overlay.querySelector(".intro-title").textContent = info.title;
    overlay.querySelector(".intro-desc").textContent = info.desc;
    overlay.classList.remove("hidden");

    const btn = overlay.querySelector(".intro-btn");
    btn.onclick = () => {
      overlay.classList.add("hidden");
      resolve();
    };
  });
}

export async function waitForPerson(videoElement) {
  await ensureModels();
  return new Promise((resolve) => {
    detectionRunning = true;

    function detect() {
      if (!detectionRunning) return;
      if (videoElement.readyState === 4) {
        const result = handLandmarker.detectForVideo(videoElement, performance.now());
        if (result.landmarks && result.landmarks.length > 0) {
          detectionRunning = false;
          resolve();
          return;
        }
      }
      requestAnimationFrame(detect);
    }
    detect();
  });
}

export function stopPresenceCheck() {
  detectionRunning = false;
}
