let handLandmarker = null;
let detectionRunning = false;

const statusEl = () => document.getElementById("loading-status");

let tasksVisionPromise = null;

export function loadTasksVision() {
  if (!tasksVisionPromise) {
    tasksVisionPromise = import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3"
    ).then((m) => ({
      HandLandmarker: m.HandLandmarker,
      FaceLandmarker: m.FaceLandmarker,
      PoseLandmarker: m.PoseLandmarker,
      DrawingUtils: m.DrawingUtils,
    }));
  }
  return tasksVisionPromise;
}

export function getHandLandmarker() {
  return handLandmarker;
}

function setStatus(msg) {
  const el = statusEl();
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

export const INTRO_TEXT = {
  senias: {
    title: "Lengua de Señas",
    desc: "El alfabeto LSEC se reconoce en tiempo real. Muestra tus manos y lee las letras en pantalla.",
  },
  airpiano: {
    title: "Air Piano",
    desc: "Toca el piano en el aire. Desliza tu dedo índice sobre las teclas virtuales para reproducir notas.",
  },
  game: {
    title: "Big Flappy Bird",
    desc: "Controla el pájaro con tu nariz. Inclina la cabeza para esquivar los obstáculos.",
  },
  voicebird: {
    title: "Flappy Curl",
    desc: "Controla el vuelo con curls de bíceps. Extiende los brazos abajo y flexiona los codos para que el pájaro suba.",
  },
  vozsenias: {
    title: "Voz a Señas",
    desc: "Habla al micrófono y el sistema traduce tu voz a texto y a lengua de señas con imágenes en tiempo real.",
  },
};

export const INTRO_ICONS = {
  senias: "✋",
  airpiano: "🎹",
  game: "🐦",
  voicebird: "🏋️",
  vozsenias: "🎤",
};

export function waitForPerson(videoElement) {
  setStatus("Iniciando detección de presencia…");
  return ensureModels().then(() => {
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
  });
}

export function stopPresenceCheck() {
  detectionRunning = false;
}

export async function createWithFallback(ModelClass, options, name = "") {
  const { FilesetResolver } = await import(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3"
  );
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );
  try {
    return await ModelClass.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "GPU" },
    });
  } catch {
    console.warn(`GPU no disponible${name ? ` para ${name}` : ""}, usando CPU`);
    return await ModelClass.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "CPU" },
    });
  }
}