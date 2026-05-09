const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const pointer = { x: 0.5, y: 0.42 };
let ctx = null;
let animationId = null;
let stars = [];

const CARD_ACCENTS = {
    animals: '#42f5a7',
    senias: '#72d7ff',
    game: '#ffd166',
    airpiano: '#d99cff',
    donkeyfitness: '#ff936f',
    antigravedad: '#9cf7ff',
};

export function initHomeScene() {
    const canvas = document.getElementById('mirror-scene');
    if (!canvas || prefersReducedMotion.matches) return;

    ctx = canvas.getContext('2d');
    if (!ctx) return;

    window.addEventListener('resize', resizeScene);
    window.addEventListener('pointermove', updatePointer);
    resizeScene();
    renderScene();
}

export function bindHomeCardEffects() {
    document.querySelectorAll('.card').forEach((card) => {
        const section = getSectionFromCard(card);
        card.style.setProperty('--card-accent', CARD_ACCENTS[section] || '#3cc3e6');

        card.addEventListener('pointermove', (event) => {
            const rect = card.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const rotateY = ((x / rect.width) - 0.5) * 5;
            const rotateX = -((y / rect.height) - 0.5) * 5;

            card.style.setProperty('--mx', `${x}px`);
            card.style.setProperty('--my', `${y}px`);
            card.style.setProperty('--rx', `${rotateX}deg`);
            card.style.setProperty('--ry', `${rotateY}deg`);
        });

        card.addEventListener('pointerleave', () => {
            card.style.setProperty('--rx', '0deg');
            card.style.setProperty('--ry', '0deg');
        });

        card.addEventListener('pointerdown', () => {
            card.classList.remove('is-pressed');
            void card.offsetWidth;
            card.classList.add('is-pressed');
        });

        card.addEventListener('animationend', () => card.classList.remove('is-pressed'));
    });
}

function resizeScene() {
    const canvas = ctx.canvas;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.7);
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    stars = Array.from({ length: 70 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.8 + 0.35,
        a: Math.random() * 0.45 + 0.18,
        speed: Math.random() * 0.22 + 0.06,
    }));
}

function renderScene() {
    animationId = requestAnimationFrame(renderScene);

    const canvas = ctx.canvas;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const time = performance.now() * 0.001;

    ctx.clearRect(0, 0, width, height);
    drawMirrorBackground(width, height, time);
    drawStars(width, height, time);
    drawSoftRings(width, height, time);
}

function drawMirrorBackground(width, height, time) {
    const base = ctx.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, '#071023');
    base.addColorStop(0.45, '#102f67');
    base.addColorStop(1, '#06111f');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(pointer.x * width, pointer.y * height, 0, pointer.x * width, pointer.y * height, Math.max(width, height) * 0.62);
    glow.addColorStop(0, 'rgba(60, 195, 230, 0.26)');
    glow.addColorStop(0.42, 'rgba(66, 245, 167, 0.10)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#a9f4ff';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
        const y = height * (0.18 + i * 0.09) + Math.sin(time * 0.7 + i) * 8;
        ctx.beginPath();
        ctx.moveTo(width * 0.08, y);
        ctx.bezierCurveTo(width * 0.35, y - 22, width * 0.64, y + 22, width * 0.92, y);
        ctx.stroke();
    }
    ctx.restore();
}

function drawStars(width, height, time) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    stars.forEach((star) => {
        star.y += star.speed;
        if (star.y > height + 4) star.y = -4;

        ctx.globalAlpha = star.a + Math.sin(time * 2 + star.x) * 0.08;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function drawSoftRings(width, height, time) {
    ctx.save();
    ctx.translate(width * 0.5, height * 0.47);
    ctx.rotate(Math.sin(time * 0.25) * 0.08);
    ctx.strokeStyle = 'rgba(60, 195, 230, 0.14)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, width * (0.18 + i * 0.08), height * (0.07 + i * 0.035), 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}

function updatePointer(event) {
    pointer.x = event.clientX / window.innerWidth;
    pointer.y = event.clientY / window.innerHeight;
}

function getSectionFromCard(card) {
    const onclick = card.getAttribute('onclick') || '';
    const match = onclick.match(/showSection\('([^']+)'\)/);
    return match ? match[1] : 'default';
}
