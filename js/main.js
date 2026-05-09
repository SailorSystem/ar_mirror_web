import { bindHomeCardEffects, initHomeScene } from './home-scene.js';

const video = document.getElementById('webcam');
const nav = document.getElementById('top-nav');
const sectionTitle = document.getElementById('section-title');

const sectionLoaders = {
    animals: () => import('./section-ar.js'),
    senias: () => import('./section-senias.js'),
    game: () => import('./section-game.js'),
    airpiano: () => import('./section-airpiano.js'),
    donkeyfitness: () => import('./section-donkeyfitness.js'),
    antigravedad: () => import('./section-antigravedad.js'),
};

const loadedSections = new Map();

const sectionConfig = {
    animals: {
        title: 'Animales AR',
        init: 'initAnimalsAR',
        stop: 'stopAnimalsAR',
    },
    senias: {
        title: 'Traductor de Señas',
        init: 'initSenias',
        stop: 'stopSenias',
    },
    game: {
        title: 'Flappy Nose',
        init: 'initFlappyGame',
        stop: 'stopFlappyGame',
    },
    airpiano: {
        title: 'Air Piano',
        init: 'initAirPiano',
        stop: 'stopAirPiano',
    },
    donkeyfitness: {
        title: 'Donkey Kong Fitness',
        init: 'initDonkeyFitness',
        stop: 'stopDonkeyFitness',
    },
    antigravedad: {
        title: 'Antigravedad PUCE',
        init: 'initAntigravedad',
        stop: 'stopAntigravedad',
    },
};

initHomeScene();
bindHomeCardEffects();

// IMPORTANTE: Exponer a window para que el HTML lo vea aunque algún módulo de IA falle al cargar.
window.showSection = async function(sectionId) {
    await stopActiveSections();

    document.getElementById('sec-home').classList.add('hidden');
    document.getElementById('sec-app').classList.add('hidden');
    nav.classList.add('hidden');

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
        const sectionModule = await loadSection(sectionId);
        await sectionModule[config.init]();
    } catch (error) {
        console.error(`No se pudo iniciar la sección ${sectionId}:`, error);
        alert('No se pudo iniciar esta experiencia. Revisa la cámara o la conexión de los modelos.');
        window.showSection('home');
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
