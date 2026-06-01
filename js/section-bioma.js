let THREE = null;
let scene, camera, renderer;
let model, mixer;
let controls;
let animFrameId = null;
let running = false;
let loadingBarFill = null;
let lastInteraction = 0;
let fps = 0, frameCount = 0, fpsTimer = 0;

export async function initBioma() {
  const container = document.querySelector('.canvas-container');
  const video = document.getElementById('webcam');

  THREE = await import('https://unpkg.com/three@0.164.1/build/three.module.js');
  const { GLTFLoader } = await import('https://unpkg.com/three@0.164.1/examples/jsm/loaders/GLTFLoader.js');
  const { OrbitControls } = await import('https://unpkg.com/three@0.164.1/examples/jsm/controls/OrbitControls.js');

  const canvas = document.createElement('canvas');
  canvas.id = 'bioma-canvas';
  container.insertBefore(canvas, document.getElementById('output_canvas'));

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(3, 1.5, 5);

  const ambient = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x362d1a, 1.0);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffeedd, 1.5);
  key.position.set(5, 8, 6);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x4488ff, 0.4);
  fill.position.set(-4, 1, 4);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x88ddff, 0.3);
  rim.position.set(-2, -1, -5);
  scene.add(rim);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.5;
  controls.minDistance = 1.5;
  controls.maxDistance = 12;
  controls.target.set(0, 0.3, 0);
  controls.update();

  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    lastInteraction = performance.now();
  });
  controls.addEventListener('end', () => {
    lastInteraction = performance.now();
  });

  const overlay = document.getElementById('loading-overlay');
  overlay.classList.remove('hidden');
  const statusEl = document.getElementById('loading-status');
  const overlayP = overlay.querySelector('p');
  if (overlayP) overlayP.textContent = 'Cargando anaconda…';

  const barContainer = document.createElement('div');
  barContainer.className = 'bioma-loading-bar';
  loadingBarFill = document.createElement('div');
  loadingBarFill.className = 'bioma-loading-bar-fill';
  barContainer.appendChild(loadingBarFill);
  overlay.appendChild(barContainer);

  const updateStatus = (msg, pct) => {
    if (statusEl) statusEl.textContent = msg;
    if (loadingBarFill && pct !== undefined) {
      loadingBarFill.style.width = `${Math.min(pct, 100)}%`;
    }
  };

  updateStatus('Preparando modelo 3D…', 0);

  try {
    const anacondaGltf = await new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        'assets/yasuni/3d/models_animals/anaconda_attack_jungle.glb',
        (gltf) => resolve(gltf),
        (xhr) => {
          if (xhr.total > 0) {
            const pct = Math.round((xhr.loaded / xhr.total) * 100);
            updateStatus(`Cargando anaconda… ${pct}%`, pct);
          }
        },
        (err) => reject(err)
      );
    });

    updateStatus('Procesando modelo…', 95);

    model = anacondaGltf.scene;
    model.position.set(0, 0, 0);
    scene.add(model);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetScale = 2.8 / maxDim;
    model.scale.setScalar(targetScale);

    const yOffset = size.y * targetScale * 0.35;
    controls.target.set(0, yOffset, 0);
    controls.update();

    if (anacondaGltf.animations && anacondaGltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      anacondaGltf.animations.forEach((clip) => {
        mixer.clipAction(clip).play();
      });
    }

    updateStatus('✅ Anaconda cargada', 100);

    await new Promise(r => setTimeout(r, 800));

  } catch (err) {
    console.error('Error cargando modelo:', err);
    updateStatus('❌ Error al cargar el modelo. Revisa la consola.', 0);
    await new Promise(r => setTimeout(r, 3000));
  }

  overlay.classList.add('hidden');

  showHint();

  window.addEventListener('resize', onResize);

  running = true;
  fpsTimer = performance.now();
  animate();
}

function animate() {
  if (!running) return;
  animFrameId = requestAnimationFrame(animate);

  const now = performance.now();

  frameCount++;
  if (now - fpsTimer >= 1000) {
    fps = frameCount;
    frameCount = 0;
    fpsTimer = now;
    updateFPS(fps);
  }

  if (!controls.autoRotate && now - lastInteraction > 4000) {
    controls.autoRotate = true;
  }

  if (mixer) mixer.update(0.016);

  controls.update();
  renderer.render(scene, camera);
}

function updateFPS(val) {
  let el = document.getElementById('bioma-fps');
  if (!el) {
    el = document.createElement('div');
    el.id = 'bioma-fps';
    el.className = 'bioma-fps';
    document.body.appendChild(el);
  }
  el.textContent = `${val} FPS`;
}

function showHint() {
  let el = document.getElementById('bioma-hint');
  if (el) return;
  el = document.createElement('div');
  el.id = 'bioma-hint';
  el.className = 'bioma-hint';
  el.textContent = '🖱 Arrastra para rotar · Rueda para zoom';
  document.body.appendChild(el);
}

function onResize() {
  if (!renderer) return;
  const container = renderer.domElement.parentElement;
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

export function stopBioma() {
  running = false;
  if (animFrameId) cancelAnimationFrame(animFrameId);

  if (controls) controls.dispose();
  if (renderer) {
    renderer.dispose();
  }

  const canvas = document.getElementById('bioma-canvas');
  if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);

  const fpsEl = document.getElementById('bioma-fps');
  if (fpsEl && fpsEl.parentNode) fpsEl.parentNode.removeChild(fpsEl);

  const hint = document.getElementById('bioma-hint');
  if (hint && hint.parentNode) hint.parentNode.removeChild(hint);

  const bar = document.querySelector('.bioma-loading-bar');
  if (bar && bar.parentNode) bar.parentNode.removeChild(bar);

  const overlayP = document.querySelector('#loading-overlay p');
  if (overlayP) overlayP.textContent = 'Preparando experiencia…';

  window.removeEventListener('resize', onResize);

  THREE = null; scene = null; camera = null; renderer = null;
  controls = null; model = null; mixer = null;
  loadingBarFill = null;
}
