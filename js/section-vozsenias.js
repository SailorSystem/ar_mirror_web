let recognition = null;
let listening = false;
let micEnabled = true;
let container = null;
let fullTranscript = '';
let currentInterim = '';
let videoQueue = [];
let isPlaying = false;

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
            <div class="vs-header-btns">
                <button class="vs-mic-btn" id="vs-mic-btn">🔊 Mic</button>
                <button class="vs-clear-btn" id="vs-clear-btn">Limpiar</button>
            </div>
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
        videoQueue = [];
        isPlaying = false;
        document.getElementById('vs-transcript').innerHTML = '<span class="vs-placeholder">Habla al micrófono para comenzar...</span>';
        document.getElementById('vs-signs-scroll').innerHTML = '';
        document.getElementById('vs-video-player').innerHTML = '<span class="vs-video-placeholder">Señas con movimiento</span>';
    };

    document.getElementById('vs-mic-btn').onclick = toggleMic;
}

function toggleMic() {
    const btn = document.getElementById('vs-mic-btn');
    micEnabled = !micEnabled;
    if (micEnabled) {
        btn.textContent = '🔊 Mic';
        btn.classList.remove('vs-mic-off');
        startSpeechRecognition();
    } else {
        btn.textContent = '🔇 Mic';
        btn.classList.add('vs-mic-off');
        stopSpeechRecognition();
    }
}

function stopSpeechRecognition() {
    listening = false;
    if (recognition) {
        try { recognition.stop(); } catch {}
        recognition = null;
    }
    document.getElementById('vs-indicator')?.classList.remove('vs-active');
}

function startSpeechRecognition() {
    if (!micEnabled) return;
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
        let lastFinal = '';

        for (let i = 0; i < event.results.length; i++) {
            const r = event.results[i];
            if (r.isFinal) {
                lastFinal = r[0].transcript.trim();
            } else {
                interim += r[0].transcript;
            }
        }

        if (lastFinal) {
            fullTranscript = mergeTranscripts(fullTranscript, lastFinal);
        }

        currentInterim = interim;
        updateTranscript();
        updateSigns();
    };

    function mergeTranscripts(existing, incoming) {
        if (!existing) return incoming;
        const ew = existing.split(/\s+/);
        const iw = incoming.split(/\s+/);
        let overlap = 0;
        for (let len = Math.min(ew.length, iw.length); len > 0; len--) {
            if (ew.slice(-len).join(' ') === iw.slice(0, len).join(' ')) {
                overlap = len;
                break;
            }
        }
        const delta = iw.slice(overlap);
        return delta.length === 0 ? existing : existing + ' ' + delta.join(' ');
    }

    recognition.onerror = (event) => {
        if (event.error === 'no-speech') return;
        const el = document.getElementById('vs-transcript');
        if (el) el.innerHTML = `<span class="vs-error">Error: ${event.error}. Presiona "Limpiar" para reintentar.</span>`;
    };

    recognition.onend = () => {
        if (listening && micEnabled) {
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

function showInPlayer(type, file) {
    const player = document.getElementById('vs-video-player');
    if (type === 'gesto') {
        const gestureFile = file;
        player.innerHTML = `
            <div class="vs-player-content">
                <img class="vs-player-gesture-img" src="assets/LSEC/gestosgif/${gestureFile}.gif" alt="${gestureFile}" onerror="this.style.display='none'" />
                <video class="vs-player-video" src="assets/LSEC/gestoswebm/${gestureFile}.webm" autoplay playsinline></video>
                <span class="vs-player-label">${gestureFile}</span>
            </div>
        `;
    } else if (type === 'letra-img') {
        player.innerHTML = `
            <div class="vs-player-content">
                <img class="vs-player-gesture-img" src="assets/LSEC/abecedario/${file}.jpg" alt="${file}" />
                <span class="vs-player-label">${file}</span>
            </div>
        `;
    } else if (type === 'letra-video') {
        player.innerHTML = `
            <div class="vs-player-content">
                <video class="vs-player-video" src="assets/LSEC/abecedario/${file}.mp4" autoplay loop muted playsinline></video>
                <span class="vs-player-label">${file}</span>
            </div>
        `;
    }
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
            showInPlayer('gesto', gestureFile);
        } else if (norm.length === 1 && /[A-ZÑ]/.test(norm)) {
            if (hasLetterImage(norm)) {
                showInPlayer('letra-img', norm);
            } else {
                showInPlayer('letra-video', norm);
            }
        }
    }
}

export function stopVozSenias() {
    listening = false;
    micEnabled = false;
    if (recognition) {
        try { recognition.stop(); } catch {}
        recognition = null;
    }
    if (container && container.parentNode) {
        container.remove();
        container = null;
    }
}
