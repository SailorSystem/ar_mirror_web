import { useHomeScene } from '../lib/homeScene.js';

const CARDS = [
  {
    section: 'vozsenias',
    accent: '#5dffb4',
    cls: 'card-featured',
    kicker: 'voz + señas',
    title: 'Voz a Señas',
    copy: 'Habla y el sistema traduce a lengua de señas con imágenes en tiempo real.',
  },
  {
    section: 'senias',
    accent: '#7fd7ff',
    cls: 'card-featured card-featured-mint',
    kicker: 'gestos',
    title: 'Lengua de señas',
    copy: 'Reconocimiento visual para traducir señales frente al espejo.',
  },
];

const SHOW_GAMES = false;

const GAME_CARDS = [
  {
    section: 'game',
    accent: '#ffd166',
    kicker: 'rostro',
    title: 'Big Flappy Bird',
    copy: 'Controla el vuelo con la nariz y esquiva obstáculos.',
  },
  {
    section: 'airpiano',
    accent: '#d28cff',
    kicker: 'manos',
    title: 'Air Piano',
    copy: 'Toca notas suspendidas en el aire con gestos.',
  },
  {
    section: 'voicebird',
    accent: '#ffd166',
    kicker: 'fitness',
    title: 'Flappy Curl',
    copy: 'Controla el vuelo con curls de bíceps. Flexiona los brazos para que el pájaro vuele.',
  },
];

function Card({ card, onSelect }) {
  return (
    <button
      className={`card ${card.cls || ''}`}
      style={{ '--card-accent': card.accent }}
      onClick={() => onSelect(card.section)}
    >
      <span className="card-kicker">{card.kicker}</span>
      <span className="card-title">{card.title}</span>
      <span className="card-copy">{card.copy}</span>
    </button>
  );
}

export default function Home({ onSelect }) {
  const canvasRef = useHomeScene();

  return (
    <section id="sec-home" className="active">
      <canvas id="mirror-scene" ref={canvasRef} aria-hidden="true"></canvas>
      <div className="hero">
        <div className="hero-shell">
          <span className="hero-eyebrow">Mirror Lab · PUCE</span>
          <div className="hero-logo-badge">
            <img src="assets/textures/logo80new.png" alt="PUCE 80 años" className="hero-logo" />
          </div>
          <h1>AR Mirror Web</h1>
          <p className="hero-copy">Experiencias de cámara, gestos y realidad aumentada con una interfaz tipo cristal, profundidad 3D y energía espacial.</p>
        </div>

        <div className="menu-grid">
          {CARDS.map((card) => (
            <Card key={card.section} card={card} onSelect={onSelect} />
          ))}
        </div>

        {SHOW_GAMES && (
          <>
            <h2 className="group-title">Suite de Juegos</h2>
            <div className="menu-grid menu-games">
              {GAME_CARDS.map((card) => (
                <Card key={card.section} card={card} onSelect={onSelect} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}