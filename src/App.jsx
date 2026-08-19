import { useCallback, useState } from 'react';
import Home from './components/Home.jsx';
import SectionView from './components/SectionView.jsx';
import FlappyGame from './sections/FlappyGame.jsx';
import Senias from './sections/Senias.jsx';
import AirPiano from './sections/AirPiano.jsx';
import VoiceBird from './sections/VoiceBird.jsx';
import VozSenias from './sections/VozSenias.jsx';

const SECTION_CONFIG = {
  game: { id: 'game', title: 'Flappy Nose', Section: FlappyGame },
  senias: { id: 'senias', title: 'Traductor de Señas', Section: Senias },
  airpiano: { id: 'airpiano', title: 'Air Piano', Section: AirPiano },
  voicebird: { id: 'voicebird', title: 'Flappy Curl', Section: VoiceBird },
  vozsenias: { id: 'vozsenias', title: 'Voz a Señas', Section: VozSenias, noCamera: true },
};

export default function App() {
  const [active, setActive] = useState('home');
  const config = SECTION_CONFIG[active];

  const goHome = useCallback(() => setActive('home'), []);

  return (
    <>
      <nav id="top-nav" className={active === 'home' ? 'hidden' : ''}>
        <img src="assets/textures/logo80new.png" alt="PUCE 80 años" className="nav-logo" />
        <button id="btn-home" onClick={goHome}>🏠 Inicio</button>
        <span id="section-title">{config?.title || 'Sección'}</span>
      </nav>

      {active === 'home' ? (
        <Home onSelect={setActive} />
      ) : (
        <section id="sec-app" className="active">
          <SectionView key={active} config={config} onExit={goHome} />
        </section>
      )}

      <footer className="app-footer">
        <details className="footer-details">
          <summary>🛠️ Herramientas y tecnologías</summary>
          <div className="footer-content">
            <p>Este proyecto fue construido con tecnologías de código abierto y librerías web:</p>
            <ul>
              <li><strong>React</strong> — Interfaz declarativa y enrutamiento de secciones.</li>
              <li><strong>Three.js</strong> — Motor 3D para renderizado y realidad aumentada.</li>
              <li><strong>MediaPipe (Google)</strong> — Visión por computadora para detección de manos, pose y rostro.</li>
              <li><strong>Matter.js</strong> — Física 2D para simulaciones de gravedad.</li>
              <li><strong>Web Speech API</strong> — Reconocimiento de voz a texto.</li>
              <li><strong>Web Audio API</strong> — Síntesis de audio para el piano y controles.</li>
              <li><strong>WebXR</strong> — Soporte de realidad aumentada en dispositivos móviles.</li>
            </ul>
            <p className="footer-note">Proyecto educativo · Mirror Lab · Pontificia Universidad Católica del Ecuador (PUCE)</p>
          </div>
        </details>
      </footer>
    </>
  );
}