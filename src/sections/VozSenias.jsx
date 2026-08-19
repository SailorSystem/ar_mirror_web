import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const LETTER_VIDEOS = ['J', 'Ñ', 'Z'];

function normalizeWord(w) {
  return w
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-ZÑ]/g, '');
}

function hasLetterImage(letter) {
  return !LETTER_VIDEOS.includes(letter);
}

export default function VozSenias() {
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);

  const [displayDuration, setDisplayDuration] = useState(3);
  const [micEnabled, setMicEnabled] = useState(true);
  const [listening, setListening] = useState(false);
  const [manifest, setManifest] = useState({});

  useEffect(() => {
    let cancelled = false;
    fetch('lib/lsec_gestos/videos_index.json')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setManifest(data || {});
      })
      .catch((e) => {
        console.error('Error cargando manifiesto de videos:', e);
        if (!cancelled) setManifest({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const phraseList = useMemo(() => {
    const data = manifest && Object.keys(manifest).length ? manifest : {};
    return Object.entries(data)
      .map(([key]) => ({ key, tokens: key.split(' ') }))
      .sort((a, b) => b.tokens.length - a.tokens.length);
  }, [manifest]);

  const [fullTranscript, setFullTranscript] = useState('');
  const [currentInterim, setCurrentInterim] = useState('');
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState('');

  const queueRef = useRef([]);
  const timerRef = useRef(null);
  const isPlayingRef = useRef(false);
  const displayDurationRef = useRef(3);
  const micEnabledRef = useRef(true);
  const listeningRef = useRef(false);

  useEffect(() => { displayDurationRef.current = displayDuration; }, [displayDuration]);
  useEffect(() => { micEnabledRef.current = micEnabled; }, [micEnabled]);

  const lastQueuedWordCount = useRef(0);
  const lastFinalRef = useRef('');

  const getGestureFile = useCallback(
    (norm) => manifest[norm] || null,
    [manifest]
  );

  const matchAt = useCallback(
    (words, i) => {
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
    },
    [phraseList]
  );

  const getWordMedia = useCallback(
    (norm) => {
      const file = getGestureFile(norm);
      if (file) return { type: 'gesto', norm, file };
      if (norm.length === 1 && /[A-ZÑ]/.test(norm)) {
        if (hasLetterImage(norm)) return { type: 'letra-img', norm };
        return { type: 'letra-video', norm };
      }
      return null;
    },
    [getGestureFile]
  );

  const showInPlayer = useCallback((item) => {
    isPlayingRef.current = true;
    setCurrent(item);
    timerRef.current = setTimeout(() => {
      const next = queueRef.current.shift() || null;
      if (next) {
        showInPlayer(next);
      } else {
        isPlayingRef.current = false;
        setCurrent(null);
      }
    }, displayDurationRef.current * 1000);
  }, []);

  const addToQueue = useCallback(
    (type, norm, file) => {
      queueRef.current.push({ type, norm, file });
      if (!isPlayingRef.current) {
        const item = queueRef.current.shift() || null;
        if (item) showInPlayer(item);
      }
    },
    [showInPlayer]
  );

  const processNewFinalWords = useCallback(() => {
    const words = fullTranscript.split(/\s+/).filter((w) => w.length > 0);
    if (words.length <= lastQueuedWordCount.current) return;

    let i = lastQueuedWordCount.current;
    const pending = [];
    while (i < words.length) {
      const entry = matchAt(words, i);
      if (entry) {
        pending.push({ type: 'gesto', norm: entry.key, file: manifest[entry.key] });
        i += entry.tokens.length;
      } else {
        const media = getWordMedia(normalizeWord(words[i]));
        if (media) {
          pending.push(media);
        }
        i++;
      }
    }
    lastQueuedWordCount.current = words.length;
    for (const p of pending) addToQueue(p.type, p.norm, p.file);
  }, [fullTranscript, matchAt, getWordMedia, manifest, addToQueue]);

  useEffect(() => {
    if (!fullTranscript) return;
    processNewFinalWords();
  }, [fullTranscript, processNewFinalWords]);

  const mergeTranscripts = useCallback((existing, incoming) => {
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
  }, []);

  const stopRecognition = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
  }, []);

  const startRecognition = useCallback(() => {
    if (!micEnabledRef.current) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
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
        setFullTranscript((prev) => {
          const merged = mergeTranscripts(prev, lastFinal);
          lastFinalRef.current = merged;
          return merged;
        });
      }
      setCurrentInterim(interim);
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') return;
      setError(`Error: ${event.error}. Presiona "Limpiar" para reintentar.`);
    };

    recognition.onend = () => {
      if (listeningRef.current && micEnabledRef.current) {
        try { recognition.start(); } catch {}
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      listeningRef.current = true;
      setListening(true);
    } catch (e) {
      setError('Error al iniciar el micrófono: ' + e.message);
    }
  }, [mergeTranscripts]);

  useEffect(() => {
    startRecognition();
    return () => {
      stopRecognition();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [startRecognition, stopRecognition]);

  const toggleMic = useCallback(() => {
    const next = !micEnabledRef.current;
    micEnabledRef.current = next;
    setMicEnabled(next);
    if (next) {
      lastFinalRef.current = '';
      startRecognition();
    } else {
      stopRecognition();
    }
  }, [startRecognition, stopRecognition]);

  const clearAll = useCallback(() => {
    stopRecognition();
    lastFinalRef.current = '';
    lastQueuedWordCount.current = 0;
    queueRef.current = [];
    isPlayingRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    setCurrent(null);
    setFullTranscript('');
    setCurrentInterim('');
    setError('');
    setTimeout(() => startRecognition(), 50);
  }, [startRecognition, stopRecognition]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [fullTranscript, currentInterim]);

  const signs = useMemo(() => {
    const text = (fullTranscript + ' ' + currentInterim).trim();
    if (!text) return [];
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const lastIdx = words.length - 1;
    const out = [];
    let i = 0;
    while (i < words.length) {
      const entry = matchAt(words, i);
      if (entry) {
        const phraseWords = words.slice(i, i + entry.tokens.length);
        const displayWord = phraseWords.join(' ').replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, '');
        const isLast = i + entry.tokens.length - 1 === lastIdx;
        out.push({
          kind: 'gesto',
          isLast,
          label: displayWord,
          norm: entry.key,
          file: manifest[entry.key],
        });
        i += entry.tokens.length;
        continue;
      }

      const word = words[i];
      const norm = normalizeWord(word);
      const displayWord = word.replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, '');
      const isLast = i === lastIdx;

      if (norm.length === 1 && /[A-ZÑ]/.test(norm)) {
        if (hasLetterImage(norm)) {
          out.push({ kind: 'letra-img', isLast, label: norm, norm });
        } else {
          out.push({ kind: 'letra-video', isLast, label: norm, norm });
        }
      } else if (norm) {
        out.push({ kind: 'text', isLast, label: displayWord });
      }
      i++;
    }
    return out;
  }, [fullTranscript, currentInterim, matchAt, manifest]);

  const transcript = fullTranscript + (currentInterim ? ' ' + currentInterim : '');

  return (
    <div className="vozsenias-container" ref={containerRef}>
      <div className="vs-header">
        <div className={`vs-listening-indicator ${listening ? 'vs-active' : ''}`}>
          <span className="vs-dot"></span>
          <span className="vs-label">{listening ? 'Escuchando' : 'Micrófono apagado'}</span>
        </div>
        <div className="vs-timing-control">
          <span className="vs-timing-icon">⏱</span>
          <input
            type="range"
            className="vs-timing-slider"
            min="1"
            max="10"
            value={displayDuration}
            step="0.5"
            onChange={(e) => setDisplayDuration(parseFloat(e.target.value))}
          />
          <span className="vs-timing-value">{displayDuration}s</span>
        </div>
        <div className="vs-header-btns">
          <button
            className={`vs-mic-btn ${micEnabled ? '' : 'vs-mic-off'}`}
            onClick={toggleMic}
          >
            {micEnabled ? '🔊 Mic' : '🔇 Mic'}
          </button>
          <button className="vs-clear-btn" onClick={clearAll}>Limpiar</button>
        </div>
      </div>

      <div className="vs-video-player" id="vs-video-player">
        {current ? (
          <div className="vs-player-content">
            {current.type === 'gesto' && (
              <video className="vs-player-video" src={`assets/LSEC/gestoswebm/${current.file}`} autoPlay playsInline />
            )}
            {current.type === 'letra-img' && (
              <img className="vs-player-gesture-img" src={`assets/LSEC/abecedario/${current.norm}.jpg`} alt={current.norm} />
            )}
            {current.type === 'letra-video' && (
              <video className="vs-player-video" src={`assets/LSEC/abecedario/${current.norm}.mp4`} autoPlay loop muted playsInline />
            )}
            <span className="vs-player-label">{current.norm}</span>
          </div>
        ) : (
          <span className="vs-video-placeholder">Señas con movimiento</span>
        )}
      </div>

      <div className="vs-signs-area">
        <div className="vs-signs-scroll" id="vs-signs-scroll" ref={scrollRef}>
          {signs.length === 0 ? (
            <div className="vs-signs-empty">Las señas aparecerán aquí</div>
          ) : (
            signs.map((s, i) => (
              <div
                key={i}
                className={`vs-sign-card vs-sign-card-${s.kind === 'text' ? 'text' : s.kind === 'letra-img' ? 'img' : 'video'}${s.isLast ? ' vs-sign-card-new' : ''}`}
                data-index={i}
                onClick={() => {
                  if (s.kind === 'gesto') addToQueue('gesto', s.norm, s.file);
                  else if (s.kind === 'letra-img') addToQueue('letra-img', s.norm);
                  else if (s.kind === 'letra-video') addToQueue('letra-video', s.norm);
                }}
              >
                <span className="vs-sign-label">{s.label}</span>
                {s.kind === 'gesto' && (
                  <video className="vs-sign-video" src={`assets/LSEC/gestoswebm/${s.file}`} autoPlay loop muted playsInline />
                )}
                {s.kind === 'letra-img' && (
                  <img className="vs-sign-img" src={`assets/LSEC/abecedario/${s.norm}.jpg`} alt={s.norm} />
                )}
                {s.kind === 'letra-video' && (
                  <video className="vs-sign-video" src={`assets/LSEC/abecedario/${s.norm}.mp4`} autoPlay loop muted playsInline />
                )}
                {s.kind === 'text' && (
                  <span className="vs-text-badge">{s.label}</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="vs-transcript" id="vs-transcript">
        {error ? (
          <span className="vs-error">{error}</span>
        ) : transcript ? (
          <>
            {fullTranscript}
            {currentInterim ? <span className="vs-interim"> {currentInterim}</span> : null}
          </>
        ) : (
          <span className="vs-placeholder">Habla al micrófono para comenzar...</span>
        )}
      </div>
    </div>
  );
}