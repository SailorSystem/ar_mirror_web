let handLandmarker = null;
let detectionRunning = false;

export function getHandLandmarker() {
  return handLandmarker;
}

function setStatus(msg) {
  const el = document.getElementById("loading-status");
  if (el) el.textContent = msg;
}

export async function ensureModels() {
  if (handLandmarker) return;
  setStatus("Cargando modelo de detección…");
  const { HandLandmarker, FilesetResolver } = await import(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3"
  );
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );
  try {
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "public/models/hand_landmarker.task", delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
    });
  } catch (_) {
    console.warn("GPU no disponible, usando CPU");
    setStatus("GPU no disponible, cambiando a CPU…");
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "public/models/hand_landmarker.task", delegate: "CPU" },
      runningMode: "VIDEO",
      numHands: 2,
    });
  }
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
  },
  voicebird: {
    title: "Flappy Voice",
    desc: "Controla el vuelo con tu voz. Entre más agudo cantes, más alto volará el pájaro."
  },
  pullup: {
    title: "Pull-up Coach",
    desc: "Entrenador de dominadas con IA. Ponte frente a la cámara y salta para cruzar la barra."
  },
  vozsenias: {
    title: "Voz a Señas",
    desc: "Habla al micrófono y el sistema traduce tu voz a texto y a lengua de señas con imágenes en tiempo real."
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
      <p class="intro-hint">Presiona "Comenzar" para iniciar la experiencia</p>
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
      antigravedad: "🪐", game: "🐦", donkeyfitness: "🦍",
      voicebird: "🎤", pullup: "💪", vozsenias: "🎤"
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
  setStatus("Iniciando detección de presencia…");
  await ensureModels();
  setStatus("Acerca tu mano a la cámara…");
  return new Promise((resolve) => {
    detectionRunning = true;
    const started = performance.now();
    const TIMEOUT = 15000;

    function detect() {
      if (!detectionRunning) return resolve();
      if (performance.now() - started > TIMEOUT) {
        console.warn("Tiempo agotado — continuando sin detección");
        detectionRunning = false;
        return resolve();
      }
      if (videoElement.readyState === 4) {
        try {
          const result = handLandmarker.detectForVideo(videoElement, performance.now());
          if (result.landmarks && result.landmarks.length > 0) {
            detectionRunning = false;
            return resolve();
          }
        } catch (_) {}
      }
      requestAnimationFrame(detect);
    }
    detect();
  });
}

export function stopPresenceCheck() {
  detectionRunning = false;
}
