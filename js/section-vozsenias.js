let recognition = null;
let listening = false;
let container = null;
let fullTranscript = '';
let currentInterim = '';
let videoQueue = [];
let isPlaying = false;
let lastFinalText = '';

const GESTURE_WORDS = {
    'ABURRIDO':'ABURRIDO','ABUELO':'ABUELO','ALUMNO':'ALUMNO',
    'AYER':'AYER','BEBER':'BEBER','BIEN':'BIEN','BONITA':'BONITA',
    'COMER':'COMER','FUTURA':'FUTURA','GUSTAR':'GUSTAR',
    'INTELIGENTE':'INTELIGENTE','LUNES':'LUNES','MAL':'MAL',
    'MAMA':'MAMÁ','MANANA':'MAÑANA','MIRAR':'MIRAR',
    'NECESITA':'NECESITA','PAPA':'PAPÁ','PROFESOR':'PROFESOR',
    'PUCE':'PUCE','RECORDAR':'RECORDAR','SUEGRO':'SUEGRO',
    'TIO':'TIO','TOMAR':'TOMAR','UNIVERSIDAD':'UNIVERSIDAD',
    'VER':'VER','VIERNES':'VIERNES'
};

const LETTER_VIDEOS = ['J', 'Ñ', 'Z'];

function normalizeWord(w) {
    return w.toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-ZÑ]/g, '');
}

function getGestureFilename(word) {
    return GESTURE_WORDS[normalizeWord(word)] || null;
}

function hasLetterImage(letter) {
    return !LETTER_VIDEOS.includes(letter);
}

function normalizeTextForDisplay(text) {
    return text.trim();
}

export async function initVozSenias() {
    createUI();
    startSpeechRecognition();
}

function createUI() {
    const canvasContainer = document.querySelector('.canvas-container');
    const existing = canvasContainer.querySelector('.vozsenias-container');
    if (existing) existing.remove();

    container = document.createElement('div');
    container.className = 'vozsenias-container';

    container.innerHTML = `
        <div class="vs-header">
            <div class="vs-listening-indicator" id="vs-indicator">
                <span class="vs-dot"></span>
                <span class="vs-label">Escuchando</span>
            </div>
            <button class="vs-clear-btn" id="vs-clear-btn">Limpiar</button>
        </div>
        <div class="vs-video-player" id="vs-video-player">
            <span class="vs-video-placeholder">Señas con movimiento</span>
        </div>
        <div class="vs-signs-area" id="vs-signs-area">
            <div class="vs-signs-scroll" id="vs-signs-scroll"></div>
        </div>
        <div class="vs-transcript" id="vs-transcript">
            <span class="vs-placeholder">Habla al micrófono para comenzar...</span>
        </div>
    `;

    canvasContainer.appendChild(container);

    document.getElementById('vs-clear-btn').onclick = () => {
        fullTranscript = '';
        currentInterim = '';
        lastFinalText = '';
        videoQueue = [];
        isPlaying = false;
        document.getElementById('vs-transcript').innerHTML = '<span class="vs-placeholder">Habla al micrófono para comenzar...</span>';
        document.getElementById('vs-signs-scroll').innerHTML = '';
        document.getElementById('vs-video-player').innerHTML = '<span class="vs-video-placeholder">Señas con movimiento</span>';
    };
}

function startSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        document.getElementById('vs-transcript').innerHTML =
            '<span class="vs-error">Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.</span>';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
        let interim = '';
        let newFinalParts = [];

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
                newFinalParts.push(result[0].transcript.trim());
            } else {
                interim += result[0].transcript;
            }
        }

        if (newFinalParts.length > 0) {
            let newText = newFinalParts.join(' ').trim();
            if (newText !== lastFinalText && !fullTranscript.includes(newText)) {
                fullTranscript += (fullTranscript ? ' ' : '') + newText;
                lastFinalText = newText;
            }
        }

        currentInterim = interim;
        updateTranscript();
        updateSigns();
    };

    recognition.onerror = (event) => {
        if (event.error === 'no-speech') return;
        const el = document.getElementById('vs-transcript');
        if (el) el.innerHTML = `<span class="vs-error">Error: ${event.error}. Presiona "Limpiar" para reintentar.</span>`;
    };

    recognition.onend = () => {
        if (listening) {
            try { recognition.start(); } catch {}
        }
    };

    try {
        recognition.start();
        listening = true;
        document.getElementById('vs-indicator')?.classList.add('vs-active');
    } catch (e) {
        document.getElementById('vs-transcript').innerHTML =
            '<span class="vs-error">Error al iniciar el micrófono: ' + e.message + '</span>';
    }
}

function updateTranscript() {
    const el = document.getElementById('vs-transcript');
    if (!el) return;

    const displayText = fullTranscript +
        (currentInterim ? ' <span class="vs-interim">' + currentInterim + '</span>' : '');

    el.innerHTML = displayText || '<span class="vs-placeholder">Habla al micrófono para comenzar...</span>';
}

function queueVideo(path) {
    if (videoQueue.length > 0 && videoQueue[videoQueue.length - 1] === path) return;
    videoQueue.push(path);
    if (!isPlaying) playNextVideo();
}

function playNextVideo() {
    if (videoQueue.length === 0) {
        isPlaying = false;
        return;
    }
    isPlaying = true;
    const path = videoQueue.shift();
    const player = document.getElementById('vs-video-player');
    player.innerHTML = `<video class="vs-player-video" src="${path}" autoplay playsinline></video>`;
    const video = player.querySelector('video');
    video.onended = () => {
        video.onended = null;
        playNextVideo();
    };
    video.onerror = () => {
        playNextVideo();
    };
}

function updateSigns() {
    const scrollEl = document.getElementById('vs-signs-scroll');
    if (!scrollEl) return;

    const text = (fullTranscript + ' ' + currentInterim).trim();
    if (!text) {
        scrollEl.innerHTML = '<div class="vs-signs-empty">Las señas aparecerán aquí</div>';
        return;
    }

    const words = text.split(/\s+/).filter(w => w.length > 0);

    scrollEl.innerHTML = words.map((word, idx) => {
        const norm = normalizeWord(word);
        const displayWord = word.replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, '');
        if (!norm) return '';
        const isLast = idx === words.length - 1;
        const cls = isLast ? ' vs-sign-card-new' : '';

        const gestureFile = getGestureFilename(norm);
        if (gestureFile) {
            const videoPath = `assets/LSEC/gestos/${gestureFile}.mp4`;
            return `
                <div class="vs-sign-card vs-sign-card-video${cls}" data-index="${idx}">
                    <span class="vs-sign-label">${displayWord}</span>
                    <span class="vs-sign-thumb">▶</span>
                </div>
            `;
        }

        if (norm.length === 1 && /[A-ZÑ]/.test(norm)) {
            if (hasLetterImage(norm)) {
                return `
                    <div class="vs-sign-card vs-sign-card-img${cls}" data-index="${idx}">
                        <span class="vs-sign-label">${norm}</span>
                        <img class="vs-sign-img" src="assets/LSEC/abecedario/${norm}.jpg" alt="${norm}">
                    </div>
                `;
            } else {
                return `
                    <div class="vs-sign-card vs-sign-card-video${cls}" data-index="${idx}">
                        <span class="vs-sign-label">${norm}</span>
                        <video class="vs-sign-video" src="assets/LSEC/abecedario/${norm}.mp4" autoplay loop muted playsinline></video>
                    </div>
                `;
            }
        }

        return `
            <div class="vs-sign-card vs-sign-card-text${cls}" data-index="${idx}">
                <span class="vs-sign-label">${displayWord}</span>
                <span class="vs-text-badge">${displayWord}</span>
            </div>
        `;
    }).join('');

    scrollEl.scrollLeft = scrollEl.scrollWidth;

    const lastWord = words[words.length - 1];
    if (lastWord) {
        const norm = normalizeWord(lastWord);
        const gestureFile = getGestureFilename(norm);
        if (gestureFile) {
            const path = `assets/LSEC/gestos/${gestureFile}.mp4`;
            queueVideo(path);
        }
    }
}

export function stopVozSenias() {
    listening = false;
    if (recognition) {
        try { recognition.stop(); } catch {}
        recognition = null;
    }
    if (container && container.parentNode) {
        container.remove();
        container = null;
    }
}
