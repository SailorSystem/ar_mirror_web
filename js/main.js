import { initFlappyGame, stopFlappyGame } from './section-game.js';
import { initAnimalsAR, stopAnimalsAR } from './section-ar.js';
import { initSenias, stopSenias } from './section-senias.js';
import { initAirPiano, stopAirPiano } from './section-airpiano.js';
import { initDonkeyFitness, stopDonkeyFitness } from './section-donkeyfitness.js';
import { initAntigravedad, stopAntigravedad } from './section-antigravedad.js';
import { bindHomeCardEffects, initHomeScene } from './home-scene.js';

const video = document.getElementById('webcam');
const nav = document.getElementById('top-nav');
const sectionTitle = document.getElementById('section-title');

initHomeScene();
bindHomeCardEffects();

// IMPORTANTE: Exponer a window para que el HTML lo vea
window.showSection = async function(sectionId) {
    await stopActiveSections();

    document.getElementById('sec-home').classList.add('hidden');
    document.getElementById('sec-app').classList.add('hidden');
    nav.classList.add('hidden');

    stopFlappyGame(); // Detener juego si estaba activo
    stopAnimalsAR();
    stopSenias();
    stopAirPiano();
    stopDonkeyFitness();
    stopAntigravedad();

    if (sectionId === 'home') {
        document.getElementById('sec-home').classList.remove('hidden');
        stopCamera();
        return;
    }

    const config = sectionConfig[sectionId];
    if (!config) {
        window.showSection('home');
        return;
    }

    document.getElementById('sec-app').classList.remove('hidden');
    nav.classList.remove('hidden');
    sectionTitle.innerText = config.title;

    try {
        await startCamera();
        
        if (sectionId === 'game') {
            document.getElementById('section-title').innerText = "Flappy Nose";
            initFlappyGame();
        }
        if (sectionId === 'animals') {
            document.getElementById('section-title').innerText = "Animales AR";
            initAnimalsAR();
        }
        if (sectionId === 'senias') {
            document.getElementById('section-title').innerText = "Traductor de Señas";
            initSenias();
        }
        if (sectionId === 'airpiano') {
            document.getElementById('section-title').innerText = "Air Piano";
            initAirPiano();
        }
        if (sectionId === 'donkeyfitness') {
            document.getElementById('section-title').innerText = "Donkey Kong Fitness";
            initDonkeyFitness();
        }
        if (sectionId === 'antigravedad') {
            document.getElementById('section-title').innerText = "Antigravedad PUCE";
            initAntigravedad();
        }
    }
};

document.getElementById('btn-home').onclick = () => window.showSection('home');

async function loadSection(sectionId) {
    if (!loadedSections.has(sectionId)) {
        const modulePromise = sectionLoaders[sectionId]().catch((error) => {
            loadedSections.delete(sectionId);
            throw error;
        });
        loadedSections.set(sectionId, modulePromise);
    }

    return loadedSections.get(sectionId);
}

async function stopActiveSections() {
    const modules = await Promise.allSettled([...loadedSections.entries()].map(async ([sectionId, modulePromise]) => {
        const sectionModule = await modulePromise;
        const stopName = sectionConfig[sectionId]?.stop;
        if (stopName && typeof sectionModule[stopName] === 'function') {
            sectionModule[stopName]();
        }
    }));

    modules.forEach((result) => {
        if (result.status === 'rejected') console.warn('No se pudo detener una sección:', result.reason);
    });
}

async function startCamera() {
    const overlay = document.getElementById('loading-overlay');
    overlay.classList.remove('hidden');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        video.srcObject = stream;
        await new Promise(resolve => video.onloadedmetadata = resolve);
    } finally {
        overlay.classList.add('hidden');
    }
}

function stopCamera() {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }
}
