const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let renderer = null;
let scene = null;
let camera = null;
let mirrorMesh = null;
let particles = null;
let animationId = null;
let initialized = false;

let THREE = null;
let fallbackContext = null;
const pointer = { x: 0.5, y: 0.5, set(x, y) { this.x = x; this.y = y; } };
let clock = null;

const CARD_ACCENTS = {
    animals: '#5dffb4',
    senias: '#7fd7ff',
    game: '#ffd166',
    airpiano: '#d28cff',
    donkeyfitness: '#ff8f70',
    antigravedad: '#9cf7ff',
};

export function initHomeScene() {
    if (initialized || prefersReducedMotion.matches) return;

    import('https://unpkg.com/three@0.164.1/build/three.module.js')
        .then((threeModule) => startThreeMirrorScene(threeModule))
        .catch(() => startFallbackMirrorScene());
}

function startThreeMirrorScene(threeModule) {
    if (initialized) return;

    const canvas = document.getElementById('mirror-scene');
    if (!canvas) return;

    THREE = threeModule;
    clock = new THREE.Clock();
    const threePointer = new THREE.Vector2(pointer.x, pointer.y);
    pointer.copy = (target) => target.set(pointer.x, pointer.y);

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    camera.position.z = 1;

    const mirrorShader = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
            uTime: { value: 0 },
            uPointer: { value: threePointer },
            uResolution: { value: new THREE.Vector2(1, 1) },
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }
        `,
        fragmentShader: `
            precision highp float;
            varying vec2 vUv;
            uniform float uTime;
            uniform vec2 uPointer;
            uniform vec2 uResolution;

            float line(vec2 p, float offset, float width) {
                float wave = sin((p.x + offset) * 8.0 + uTime * 0.55) * 0.035;
                return smoothstep(width, 0.0, abs(p.y - 0.5 - wave));
            }

            void main() {
                vec2 uv = vUv;
                vec2 center = uv - 0.5;
                float aspect = uResolution.x / max(uResolution.y, 1.0);
                center.x *= aspect;

                vec2 mirrorUv = abs(uv - 0.5) * 2.0;
                float mirrorFold = pow(1.0 - length(mirrorUv), 2.2);
                float pointerGlow = 1.0 - smoothstep(0.0, 0.62, distance(uv, uPointer));
                float scan = line(uv, 0.0, 0.012) + line(uv, 0.28, 0.009) * 0.65;
                float prism = sin((uv.x - uv.y) * 18.0 + uTime) * 0.5 + 0.5;
                float vignette = smoothstep(0.92, 0.12, length(center));

                vec3 deepBlue = vec3(0.018, 0.035, 0.105);
                vec3 puceBlue = vec3(0.055, 0.20, 0.48);
                vec3 cyan = vec3(0.22, 0.78, 0.95);
                vec3 emerald = vec3(0.18, 1.0, 0.62);

                vec3 color = mix(deepBlue, puceBlue, uv.y + mirrorFold * 0.35);
                color += cyan * scan * 0.18;
                color += emerald * pointerGlow * 0.18;
                color += mix(cyan, emerald, prism) * mirrorFold * 0.15;

                float alpha = 0.72 * vignette + scan * 0.08 + pointerGlow * 0.08;
                gl_FragColor = vec4(color, alpha);
            }
        `,
    });

    mirrorMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mirrorShader);
    scene.add(mirrorMesh);

    particles = createStarField();
    scene.add(particles);

    window.addEventListener('resize', resizeHomeScene);
    window.addEventListener('pointermove', handlePointerMove);
    resizeHomeScene();
    animateHomeScene();
    initialized = true;
}

function startFallbackMirrorScene() {
    if (initialized) return;

    const canvas = document.getElementById('mirror-scene');
    if (!canvas) return;

    fallbackContext = canvas.getContext('2d');
    if (!fallbackContext) return;

    window.addEventListener('resize', resizeHomeScene);
    window.addEventListener('pointermove', handlePointerMove);
    resizeHomeScene();
    animateFallbackScene();
    initialized = true;
}

export function bindHomeCardEffects() {
    document.querySelectorAll('.card').forEach((card) => {
        const section = getSectionFromCard(card);
        card.style.setProperty('--card-accent', CARD_ACCENTS[section] || '#3cc3e6');

        card.addEventListener('pointerdown', () => {
            card.classList.remove('is-pressed');
            void card.offsetWidth;
            card.classList.add('is-pressed');
        });

        card.addEventListener('animationend', () => {
            card.classList.remove('is-pressed');
        });
    });
}

function createStarField() {
    const count = 180;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [
        new THREE.Color('#3cc3e6'),
        new THREE.Color('#ffffff'),
        new THREE.Color('#7ce38b'),
        new THREE.Color('#8da7ff'),
    ];

    for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 5.6;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 3.4;
        positions[i * 3 + 2] = Math.random() * 0.4;

        const color = palette[i % palette.length];
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.018,
        vertexColors: true,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    return new THREE.Points(geometry, material);
}

function animateHomeScene() {
    animationId = requestAnimationFrame(animateHomeScene);
    const elapsed = clock.getElapsedTime();

    if (mirrorMesh) {
        mirrorMesh.material.uniforms.uTime.value = elapsed;
        pointer.copy(mirrorMesh.material.uniforms.uPointer.value);
    }

    if (particles) {
        particles.rotation.z = elapsed * 0.018;
        particles.rotation.x = Math.sin(elapsed * 0.25) * 0.045;
    }

    renderer.render(scene, camera);
}

function animateFallbackScene() {
    animationId = requestAnimationFrame(animateFallbackScene);

    const canvas = fallbackContext.canvas;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const time = performance.now() * 0.001;

    fallbackContext.clearRect(0, 0, width, height);
    const base = fallbackContext.createRadialGradient(pointer.x * width, pointer.y * height, 0, width / 2, height / 2, Math.max(width, height));
    base.addColorStop(0, 'rgba(60, 195, 230, 0.34)');
    base.addColorStop(0.42, 'rgba(31, 63, 139, 0.30)');
    base.addColorStop(1, 'rgba(3, 6, 20, 0.76)');
    fallbackContext.fillStyle = base;
    fallbackContext.fillRect(0, 0, width, height);

    fallbackContext.save();
    fallbackContext.globalCompositeOperation = 'screen';
    for (let i = 0; i < 12; i++) {
        const y = height * (0.18 + i * 0.055) + Math.sin(time + i) * 18;
        const alpha = 0.045 + (i % 3) * 0.018;
        fallbackContext.strokeStyle = `rgba(124, 227, 139, ${alpha})`;
        fallbackContext.lineWidth = 1.2;
        fallbackContext.beginPath();
        fallbackContext.moveTo(width * 0.08, y);
        fallbackContext.bezierCurveTo(width * 0.35, y - 40, width * 0.62, y + 40, width * 0.92, y);
        fallbackContext.stroke();
    }
    fallbackContext.restore();
}

function resizeHomeScene() {
    const canvas = renderer ? renderer.domElement : fallbackContext.canvas;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    if (renderer) {
        renderer.setSize(width, height, false);
        if (mirrorMesh) mirrorMesh.material.uniforms.uResolution.value.set(width, height);
        return;
    }

    const ratio = Math.min(window.devicePixelRatio || 1, 1.8);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    fallbackContext.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function handlePointerMove(event) {
    pointer.set(event.clientX / window.innerWidth, 1 - event.clientY / window.innerHeight);
}

function getSectionFromCard(card) {
    const onclick = card.getAttribute('onclick') || '';
    const match = onclick.match(/showSection\('([^']+)'\)/);
    return match ? match[1] : 'default';
}
