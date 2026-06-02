let THREE = null;
let scene, camera, renderer;
let model, mixer;
let controls;
let animFrameId = null;
let running = false;
let loadingBarFill = null;
let lastInteraction = 0;
let fps = 0, frameCount = 0, fpsTimer = 0;
let xrSession = null;
let arSupported = false;
let inAR = false;

async function checkARSupport() {
  if (!navigator.xr) return false;
  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!isMobile) return false;
  try {
    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    console.log('[Bioma] WebXR AR compatible:', supported);
    return supported;
  } catch (err) {
    console.warn('[Bioma] Error detectando AR:', err);
    return false;
  }
}

export async function initBioma() {
  const container = document.querySelector('.canvas-container');

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

  arSupported = await checkARSupport();
  if (arSupported) showARButton();

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

function showARButton() {
  if (document.getElementById('bioma-ar-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'bioma-ar-btn';
  btn.className = 'bioma-ar-btn';
  btn.textContent = '🎥 Ver en AR';
  btn.onclick = enterAR;
  document.body.appendChild(btn);
}

function hideARButton() {
  const btn = document.getElementById('bioma-ar-btn');
  if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
}

function showToast(msg, duration = 3500) {
  let toast = document.getElementById('bioma-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'bioma-toast';
    toast.className = 'bioma-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), duration);
}

async function enterAR() {
  if (inAR || !arSupported) return;

  try {
    inAR = true;
    running = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);

    controls.enabled = false;
    hideHUD();
    hideARButton();

    model.position.set(0, 0, -2.5);

    renderer.xr.enabled = true;

    xrSession = await navigator.xr.requestSession('immersive-ar', {
      optionalFeatures: ['local-floor', 'dom-overlay'],
      domOverlay: { root: document.body }
    });

    xrSession.addEventListener('end', onARSessionEnd);
    await renderer.xr.setSession(xrSession);

    renderer.setAnimationLoop(arAnimate);

  } catch (err) {
    console.error('[Bioma] Error al iniciar AR:', err);
    inAR = false;
    renderer.xr.enabled = false;
    running = true;
    controls.enabled = true;
    model.position.set(0, 0, 0);
    showHUD();
    showARButton();
    if (err.message && err.message.includes('not supported')) {
      showToast('AR no disponible en este dispositivo. Usa Chrome en Android.');
    } else if (err.message && err.message.includes('security')) {
      showToast('AR requiere HTTPS. Sirve la página con HTTPS.');
    } else {
      showToast(`AR no disponible: ${err.message || 'error desconocido'}`);
    }
    animate();
  }
}

function arAnimate() {
  if (mixer) mixer.update(0.016);
  renderer.render(scene, camera);
}

function onARSessionEnd() {
  exitAR();
}

function exitAR() {
  if (!inAR) return;
  inAR = false;

  renderer.setAnimationLoop(null);
  renderer.xr.enabled = false;

  if (xrSession) {
    const session = xrSession;
    xrSession = null;
    session.removeEventListener('end', onARSessionEnd);
    try { session.end(); } catch (_) {}
  }

  if (model) model.position.set(0, 0, 0);

  controls.enabled = true;
  showHUD();
  showARButton();

  running = true;
  animate();
}

function hideHUD() {
  const fpsEl = document.getElementById('bioma-fps');
  if (fpsEl) fpsEl.style.display = 'none';
  const hint = document.getElementById('bioma-hint');
  if (hint) hint.style.display = 'none';
}

function showHUD() {
  const fpsEl = document.getElementById('bioma-fps');
  if (fpsEl) fpsEl.style.display = '';
  const hint = document.getElementById('bioma-hint');
  if (hint) hint.style.display = '';
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
  if (inAR) exitAR();

  running = false;
  if (animFrameId) cancelAnimationFrame(animFrameId);

  if (controls) controls.dispose();
  if (renderer) renderer.dispose();

  const canvas = document.getElementById('bioma-canvas');
  if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);

  const fpsEl = document.getElementById('bioma-fps');
  if (fpsEl && fpsEl.parentNode) fpsEl.parentNode.removeChild(fpsEl);

  const hint = document.getElementById('bioma-hint');
  if (hint && hint.parentNode) hint.parentNode.removeChild(hint);

  const bar = document.querySelector('.bioma-loading-bar');
  if (bar && bar.parentNode) bar.parentNode.removeChild(bar);

  hideARButton();

  const overlayP = document.querySelector('#loading-overlay p');
  if (overlayP) overlayP.textContent = 'Preparando experiencia…';

  window.removeEventListener('resize', onResize);

  THREE = null; scene = null; camera = null; renderer = null;
  controls = null; model = null; mixer = null;
  loadingBarFill = null;
  arSupported = false;
}
