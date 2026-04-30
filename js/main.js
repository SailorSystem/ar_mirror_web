import { initFlappyGame, stopFlappyGame } from './section-game.js';
// Importa section-ar si ya lo tienes listo

const video = document.getElementById('webcam');
const nav = document.getElementById('top-nav');

// IMPORTANTE: Exponer a window para que el HTML lo vea
window.showSection = async function(sectionId) {
    document.getElementById('sec-home').classList.add('hidden');
    document.getElementById('sec-app').classList.add('hidden');
    nav.classList.add('hidden');

    stopFlappyGame(); // Detener juego si estaba activo

    if (sectionId === 'home') {
        document.getElementById('sec-home').classList.remove('hidden');
        stopCamera();
    } else {
        document.getElementById('sec-app').classList.remove('hidden');
        nav.classList.remove('hidden');
        await startCamera();
        
        if (sectionId === 'game') {
            document.getElementById('section-title').innerText = "Flappy Nose";
            initFlappyGame();
        }
    }
};

document.getElementById('btn-home').onclick = () => window.showSection('home');

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: 640, height: 480 }
        });
        video.srcObject = stream;
        return new Promise(resolve => video.onloadedmetadata = resolve);
    } catch (e) { alert("Error cámara: " + e); }
}

function stopCamera() {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }
}