let recognition = null;
let listening = false;
let micEnabled = true;
let container = null;
let fullTranscript = '';
let currentInterim = '';
let videoQueue = [];
let isPlaying = false;
let displayDuration = 3;
let lastQueuedWordCount = 0;

// Manifiesto de gestos: clave normalizada (con espacios en frases) → archivo webm
const gestureManifest = {};
// Entradas ordenadas por número de tokens (frases largas primero) para matcheo glotón
let phraseList = [];

const LETTER_VIDEOS = ['J', 'Ñ', 'Z'];

function normalizeWord(w) {
    return w.toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-ZÑ]/g, '');
}

async function loadGestureManifest() {
    try {
        const resp = await fetch('lib/lsec_gestos/videos_index.json');
        const data = await resp.json();
        Object.assign(gestureManifest, data);
        phraseList = Object.entries(data)
            .map(([key]) => ({ key, tokens: key.split(' ') }))
            .sort((a, b) => b.tokens.length - a.tokens.length);
        console.log(`Videos de gestos cargados: ${phraseList.length}`);
    } catch (e) {
        console.error('Error cargando manifiesto de videos:', e);
        phraseList = [];
    }
}

function hasLetterImage(letter) {
    return !LETTER_VIDEOS.includes(letter);
}

function getGestureFile(norm) {
    return gestureManifest[norm] || null;
}

function getWordMedia(norm) {
    const file = getGestureFile(norm);
    if (file) return { type: 'gesto', norm, file };
    if (norm.length === 1 && /[A-ZÑ]/.test(norm)) {
        if (hasLetterImage(norm)) return { type: 'letra-img', norm };
        return { type: 'letra-video', norm };
    }
    return null;
}

// Busca la entrada más larga del manifiesto que coincida empezando en words[i]
function matchAt(words, i) {
    for (const entry of phraseList) {
        const n = entry.tokens.length;
        if (i + n > words.length) continue;
        let ok = true;
        for (let j = 0; j < n; j++) {
            if (normalizeWord(words[i + j]) !== entry.tokens[j]) {
                ok = false;
                break;
            }
        }
        if (ok) return entry;
    }
    return null;
}

export async function initVozSenias() {
    await loadGestureManifest();
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
            <div class="vs-timing-control">
                <span class="vs-timing-icon">⏱</span>
                <input type="range" class="vs-timing-slider" id="vs-timing-slider" min="1" max="10" value="3" step="0.5">
                <span class="vs-timing-value" id="vs-timing-value">3s</span>
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

    document.getElementById('vs-timing-slider').addEventListener('input', (e) => {
        displayDuration = parseFloat(e.target.value);
        document.getElementById('vs-timing-value').textContent = displayDuration + 's';
    });

    document.getElementById('vs-clear-btn').onclick = () => {
        fullTranscript = '';
        currentInterim = '';
        videoQueue = [];
        isPlaying = false;
        lastQueuedWordCount = 0;
        document.getElementById('vs-transcript').innerHTML = '<span class="vs-placeholder">Habla al micrófono para comenzar...</span>';
        document.getElementById('vs-signs-scroll').innerHTML = '';
        document.getElementById('vs-video-player').innerHTML = '<span class="vs-video-placeholder">Señas con movimiento</span>';
    };

    document.getElementById('vs-mic-btn').onclick = toggleMic;

    document.getElementById('vs-signs-scroll').addEventListener('click', (e) => {
        const card = e.target.closest('.vs-sign-card');
        if (!card) return;
        const type = card.dataset.type;
        const norm = card.dataset.norm;
        if (type === 'gesto') {
            addToQueue(type, norm, card.dataset.file);
        } else if (type && norm) {
            addToQueue(type, norm);
        }
    });
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
        processNewFinalWords();
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

function processNewFinalWords() {
    const words = fullTranscript.split(/\s+/).filter(w => w.length > 0);
    if (words.length <= lastQueuedWordCount) return;

    let i = lastQueuedWordCount;
    while (i < words.length) {
        const entry = matchAt(words, i);
        if (entry) {
            addToQueue('gesto', entry.key, gestureManifest[entry.key]);
            i += entry.tokens.length;
        } else {
            const media = getWordMedia(normalizeWord(words[i]));
            if (media) {
                addToQueue(media.type, media.norm, media.file);
            }
            i++;
        }
    }
    lastQueuedWordCount = words.length;
}

function addToQueue(type, norm, file) {
    videoQueue.push({ type, norm, file });
    if (!isPlaying) playNext();
}

function playNext() {
    if (videoQueue.length === 0) {
        isPlaying = false;
        return;
    }

    isPlaying = true;
    const item = videoQueue.shift();
    showInPlayer(item);

    setTimeout(() => {
        playNext();
    }, displayDuration * 1000);
}

function updateTranscript() {
    const el = document.getElementById('vs-transcript');
    if (!el) return;

    const displayText = fullTranscript +
        (currentInterim ? ' <span class="vs-interim">' + currentInterim + '</span>' : '');

    el.innerHTML = displayText || '<span class="vs-placeholder">Habla al micrófono para comenzar...</span>';
}

function showInPlayer(item) {
    const player = document.getElementById('vs-video-player');
    if (item.type === 'gesto') {
        player.innerHTML = `
            <div class="vs-player-content">
                <video class="vs-player-video" src="assets/LSEC/gestoswebm/${item.file}" autoplay playsinline></video>
                <span class="vs-player-label">${item.norm}</span>
            </div>
        `;
    } else if (item.type === 'letra-img') {
        player.innerHTML = `
            <div class="vs-player-content">
                <img class="vs-player-gesture-img" src="assets/LSEC/abecedario/${item.norm}.jpg" alt="${item.norm}" />
                <span class="vs-player-label">${item.norm}</span>
            </div>
        `;
    } else if (item.type === 'letra-video') {
        player.innerHTML = `
            <div class="vs-player-content">
                <video class="vs-player-video" src="assets/LSEC/abecedario/${item.norm}.mp4" autoplay loop muted playsinline></video>
                <span class="vs-player-label">${item.norm}</span>
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
    const lastIdx = words.length - 1;
    let html = '';

    let i = 0;
    while (i < words.length) {
        const entry = matchAt(words, i);
        if (entry) {
            const phraseWords = words.slice(i, i + entry.tokens.length);
            const displayWord = phraseWords.join(' ').replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, '');
            const isLast = i + entry.tokens.length - 1 === lastIdx;
            html += `
                <div class="vs-sign-card vs-sign-card-video${isLast ? ' vs-sign-card-new' : ''}"
                     data-type="gesto" data-norm="${entry.key}" data-file="${gestureManifest[entry.key]}" data-index="${i}">
                    <span class="vs-sign-label">${displayWord}</span>
                    <video class="vs-sign-video" src="assets/LSEC/gestoswebm/${gestureManifest[entry.key]}"
                        autoplay loop muted playsinline></video>
                </div>
            `;
            i += entry.tokens.length;
            continue;
        }

        const word = words[i];
        const norm = normalizeWord(word);
        const displayWord = word.replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, '');
        const isLast = i === lastIdx;
        const cls = isLast ? ' vs-sign-card-new' : '';

        if (norm.length === 1 && /[A-ZÑ]/.test(norm)) {
            if (hasLetterImage(norm)) {
                html += `
                    <div class="vs-sign-card vs-sign-card-img${cls}" data-type="letra-img" data-norm="${norm}" data-index="${i}">
                        <span class="vs-sign-label">${norm}</span>
                        <img class="vs-sign-img" src="assets/LSEC/abecedario/${norm}.jpg" alt="${norm}">
                    </div>
                `;
            } else {
                html += `
                    <div class="vs-sign-card vs-sign-card-video${cls}" data-type="letra-video" data-norm="${norm}" data-index="${i}">
                        <span class="vs-sign-label">${norm}</span>
                        <video class="vs-sign-video" src="assets/LSEC/abecedario/${norm}.mp4" autoplay loop muted playsinline></video>
                    </div>
                `;
            }
        } else if (norm) {
            html += `
                <div class="vs-sign-card vs-sign-card-text${cls}" data-index="${i}">
                    <span class="vs-sign-label">${displayWord}</span>
                    <span class="vs-text-badge">${displayWord}</span>
                </div>
            `;
        }
        i++;
    }

    scrollEl.innerHTML = html || '<div class="vs-signs-empty">Las señas aparecerán aquí</div>';
    scrollEl.scrollLeft = scrollEl.scrollWidth;
}

export function stopVozSenias() {
    listening = false;
    micEnabled = false;
    videoQueue = [];
    isPlaying = false;
    if (recognition) {
        try { recognition.stop(); } catch {}
        recognition = null;
    }
    if (container && container.parentNode) {
        container.remove();
        container = null;
    }
}