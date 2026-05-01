import { initFlappyGame, stopFlappyGame } from './section-game.js';
// Importa section-ar si ya lo tienes listo
import { initSenias, stopSenias } from './section-senias.js'; // Nueva

const video = document.getElementById('webcam');
const nav = document.getElementById('top-nav');

// IMPORTANTE: Exponer a window para que el HTML lo vea
window.showSection = async function(sectionId) {
    document.getElementById('sec-home').classList.add('hidden');
    document.getElementById('sec-app').classList.add('hidden');
    nav.classList.add('hidden');

    stopFlappyGame(); // Detener juego si estaba activo
    stopSenias();

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
        if (sectionId === 'animals') {
            document.getElementById('section-title').innerText = "Animales AR";
            initAnimalsAR();
        }
        if (sectionId === 'senias') {
            document.getElementById('section-title').innerText = "Traductor de Señas";
            initSenias();
        }
    }
};

document.getElementById('btn-home').onclick = () => window.showSection('home');

async function startCamera() {
    const overlay = document.getElementById('loading-overlay');
    overlay.classList.remove('hidden');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            // Mejora para móviles: usa la resolución disponible
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        video.srcObject = stream;
        await new Promise(resolve => video.onloadedmetadata = resolve);
        overlay.classList.add('hidden'); // Solo quitamos carga cuando el video fluye
    } catch (e) { 
        overlay.classList.add('hidden');
        alert("No se detectó cámara o acceso denegado."); 
    }
}

function stopCamera() {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }
}
