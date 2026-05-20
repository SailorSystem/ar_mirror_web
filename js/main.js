import { initFlappyGame, stopFlappyGame } from './section-game.js';
import { initAnimalsAR, stopAnimalsAR } from './section-ar.js';
import { initSenias, stopSenias } from './section-senias.js';
import { initVozSenias, stopVozSenias } from './section-vozsenias.js';
import { initAirPiano, stopAirPiano } from './section-airpiano.js';
import { initVoiceBird, stopVoiceBird } from './section-voicebird.js';
import { initPullup, stopPullup } from './section-pullup.js';
import { initDonkeyFitness, stopDonkeyFitness } from './section-donkeyfitness.js';
import { initAntigravedad, stopAntigravedad } from './section-antigravedad.js';
import { bindHomeCardEffects, initHomeScene } from './home-scene.js';
import { showIntro, waitForPerson, stopPresenceCheck } from './detector.js';

const video = document.getElementById('webcam');
const nav = document.getElementById('top-nav');
const sectionTitle = document.getElementById('section-title');

const sectionConfig = {
    game:         { title: 'Flappy Nose',           init: initFlappyGame,     stop: stopFlappyGame },
    animals:      { title: 'Animales AR',           init: initAnimalsAR,      stop: stopAnimalsAR },
    senias:       { title: 'Traductor de Señas',    init: initSenias,         stop: stopSenias },
    airpiano:     { title: 'Air Piano',             init: initAirPiano,       stop: stopAirPiano },
    voicebird:    { title: 'Flappy Voice',          init: initVoiceBird,      stop: stopVoiceBird },
    pullup:       { title: 'Pull-up Coach',         init: initPullup,         stop: stopPullup },
    donkeyfitness:{ title: 'Donkey Kong Fitness',   init: initDonkeyFitness,  stop: stopDonkeyFitness },
    antigravedad: { title: 'Antigravedad PUCE',     init: initAntigravedad,   stop: stopAntigravedad },
    vozsenias:    { title: 'Voz a Señas',           init: initVozSenias,      stop: stopVozSenias, noCamera: true },
};

initHomeScene();
bindHomeCardEffects();
import('./detector.js').then(m => m.ensureModels().catch(() => {}));

window.showSection = async function(sectionId) {
    Object.values(sectionConfig).forEach(s => s.stop());
    stopPresenceCheck();

    document.getElementById('sec-home').classList.add('hidden');
    document.getElementById('sec-app').classList.add('hidden');
    nav.classList.add('hidden');

    if (sectionId === 'home') {
        document.getElementById('sec-home').classList.remove('hidden');
        stopCamera();
        const c = document.getElementById('output_canvas');
        c.width = 1; c.height = 1;
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
        const c = document.getElementById('output_canvas');
        c.width = 640; c.height = 480;
        c.getContext('2d').fillStyle = '#000';
        c.getContext('2d').fillRect(0, 0, 640, 480);

        if (!config.noCamera) {
            await startCamera();
            await showIntro(sectionId);
            const overlay = document.getElementById('loading-overlay');
            overlay.classList.remove('hidden');
            await waitForPerson(video);
            overlay.classList.add('hidden');
        }
        await config.init();
    } catch (err) {
        console.error('Error al iniciar sección:', err);
        window.showSection('home');
    }
};

document.getElementById('btn-home').onclick = () => window.showSection('home');

async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = stream;
    await new Promise(resolve => video.onloadedmetadata = resolve);
}

function stopCamera() {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }
}
