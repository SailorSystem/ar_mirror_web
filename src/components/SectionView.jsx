import { useRef, useState, useEffect, useMemo } from 'react';
import { INTRO_TEXT, INTRO_ICONS, waitForPerson, stopPresenceCheck } from '../lib/mediapipe.js';

export default function SectionView({ config, onExit }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const loadingRef = useRef(null);
  const statusRef = useRef(null);
  const gameOverRef = useRef(null);
  const scoreRef = useRef(null);
  const restartRef = useRef(null);
  const containerRef = useRef(null);

  const [intro, setIntro] = useState(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const initId = useRef(0);
  const confirmRef = useRef(null);

  const refs = useMemo(
    () => ({
      get video() { return videoRef.current; },
      get canvas() { return canvasRef.current; },
      get restartBtn() { return restartRef.current; },
      get gameOver() { return gameOverRef.current; },
      get finalScore() { return scoreRef.current; },
      get container() { return containerRef.current; },
      get status() { return statusRef.current; },
    }),
    []
  );

  useEffect(() => {
    const id = ++initId.current;
    let cancelled = false;
    setReady(false);
    setError(null);

    const c = canvasRef.current;
    const cw = containerRef.current?.clientWidth || 1280;
    const ch = containerRef.current?.clientHeight || 720;
    c.width = cw;
    c.height = ch;
    c.getContext('2d').fillStyle = '#000';
    c.getContext('2d').fillRect(0, 0, cw, ch);

    window.scrollTo(0, 0);

    (async () => {
      try {
        if (config.noCamera) {
          setReady(true);
          return;
        }

        await startCamera(videoRef.current);
        if (cancelled || initId.current !== id) return;

        const info = INTRO_TEXT[config.id];
        if (info) {
          await new Promise((resolve) => {
            confirmRef.current = () => {
              setIntro(null);
              resolve();
            };
            setIntro({ ...info, icon: INTRO_ICONS[config.id] || '✨' });
          });
          confirmRef.current = null;
        }

        if (cancelled || initId.current !== id) return;
        loadingRef.current.classList.remove('hidden');
        await waitForPerson(videoRef.current);
        if (cancelled || initId.current !== id) return;
        loadingRef.current.classList.add('hidden');
        setReady(true);
      } catch (err) {
        if (err?.message === 'cancelled' || cancelled || initId.current !== id) return;
        console.error('Error al iniciar sección:', err);
        setError(err?.message || 'Error');
      }
    })();

    return () => {
      cancelled = true;
      initId.current++;
      stopPresenceCheck();
      stopCamera();
    };
  }, [config]);

  function stopCamera() {
    const v = videoRef.current;
    if (v && v.srcObject) {
      v.srcObject.getTracks().forEach((t) => t.stop());
      v.srcObject = null;
    }
  }

  async function startCamera(videoEl) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    const ready = new Promise((resolve) => {
      videoEl.onloadedmetadata = () => resolve();
    });
    videoEl.srcObject = stream;
    await ready;
  }

  const handleExit = () => {
    initId.current++;
    stopPresenceCheck();
    stopCamera();
    onExit();
  };

  return (
    <>
      <div className="canvas-container" ref={containerRef}>
        <div id="loading-overlay" ref={loadingRef} className="hidden">
          <div className="loader"></div>
          <p>Preparando experiencia…</p>
          <span id="loading-status" ref={statusRef}></span>
        </div>
        {!config.noCamera && <video id="webcam" ref={videoRef} autoPlay playsInline />}
        <canvas id="output_canvas" ref={canvasRef}></canvas>
        <div id="game-over-screen" ref={gameOverRef} className="hidden">
          <div className="menu-box">
            <h2>¡Puntuación Final!</h2>
            <h1 id="final-score" ref={scoreRef}>0</h1>
            <button id="restart-btn" ref={restartRef}>Intentar de Nuevo</button>
            <button onClick={handleExit}>Menú Principal</button>
          </div>
        </div>
        {ready && <config.Section refs={refs} />}
      </div>

      {intro && (
        <div id="intro-overlay" className="">
          <div className="intro-modal">
            <div className="intro-icon">{intro.icon}</div>
            <h2 className="intro-title">{intro.title}</h2>
            <p className="intro-desc">{intro.desc}</p>
            <div className="intro-actions">
              <button className="intro-btn intro-btn-cancel" onClick={handleExit}>Cancelar</button>
              <button className="intro-btn" onClick={() => confirmRef.current?.()}>Comenzar</button>
            </div>
            <p className="intro-hint">Presiona "Comenzar" para iniciar la experiencia</p>
          </div>
        </div>
      )}

      {error && (
        <div id="intro-overlay">
          <div className="menu-box">
            <h2>Error</h2>
            <p>{error}</p>
            <button onClick={handleExit}>Menú Principal</button>
          </div>
        </div>
      )}
    </>
  );
}