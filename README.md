# AR Mirror Web

Experiencias de cámara, gestos y realidad aumentada con interfaz tipo cristal, profundidad 3D y energía espacial.

## Secciones

### Animales AR
Revela la fauna del Yasuní moviendo las manos frente a la cámara. La niebla digital se disipa con el movimiento, mostrando fotos reales de animales (jaguar, anaconda, mono capuchino, búho moteado, delfín rosado).
- **Modelo:** Hand Landmarker (MediaPipe)
- **Mecánica:** Manos como "borrador" con `destination-out` compositing

### Lengua de Señas (LSEC)
Reconocimiento visual en tiempo real del alfabeto dactilológico LSEC (A-Z, Ñ) y gestos/expresiones. Panel dual con detección simultánea de ambas manos. El diccionario de gestos se carga desde lotes numerados (`diccionario_01.json`, `diccionario_02.json`) divididos por tamaño (< 100 MB cada uno).
- **Modelo:** Hand Landmarker (MediaPipe)
- **Alfabeto:** Distancias pairwise + estado de dedos + voto sobre ventana de 10 frames
- **Gestos:** Voting con ventana de 20 frames, hold de 3s, debounce de 500ms
- **Diccionario:** 199 gestos en 2 lotes (~109 MB total), cargados desde `lib/lsec_gestos/`
- **Dataset origen** `assets/LSEC2/` (excluido de git, ~4 GB en disco)

### Voz a Señas
Reconocimiento de voz (Web Speech API) que traduce el habla a lengua de señas. Muestra una fila de tarjetas con GIFs/videos de cada palabra o letra detectada, con cola de reproducción y control de velocidad.
- **API:** Web Speech API (es-ES)
- **Visualización:** GIFs animados para gestos, imágenes para letras, videos para J/Ñ/Z
- **Cola de reproducción:** Auto-play secuencial con slider de duración (1-10s)
- **Cobertura:** 27 palabras mapeadas + todo el alfabeto A-ZÑ

### Bioma AR (WebXR)
Visor 3D del modelo Yasuní en navegador. Soporta rotación táctil, control por teclado, y modo AR (WebXR) en dispositivos móviles compatibles.
- **Motor:** Three.js
- **AR:** WebXR `immersive-ar` en Android
- **Modelo:** GLB del bosque Yasuní (~16 MB, excluido de git)

### Flappy Nose
Controla el pájaro con la nariz. Sigue el eje vertical y horizontal del rostro.
- **Modelo:** Face Landmarker (MediaPipe)
- **Mecánica:** Colisión con tuberías + compensación de espejo

### Flappy Voice
Controla el pájaro con la voz — entre más agudo, más alto vuela.
- **API:** Web Audio API (AnalyserNode, frecuencia dominante)
- **Gameplay:** Misma física que Flappy Nose pero control por tono de voz

### Air Piano
8 teclas virtuales suspendidas en el aire que se activan al tocar con la yema del dedo índice.
- **Modelo:** Hand Landmarker (MediaPipe)
- **Audio:** Oscillators Web Audio con formas de onda y escalas

### Pull-up Coach
Entrenador de dominadas con IA. La cámara detecta la posición del cuerpo y cuenta repeticiones automáticamente.
- **Modelo:** Pose Landmarker (MediaPipe)
- **Detección:** Umbral de altura de manos sobre la barra virtual

### Donkey Kong Fitness
Sistema de sentadillas asistido por visión. Detecta la flexión de rodilla/cadera para contar repeticiones.
- **Modelo:** Pose Landmarker (MediaPipe)
- **Métrica:** Diferencia cadera-rodilla para detectar posición baja/alta

### Antigravedad PUCE
Simulación física con Matter.js + control por gestos de mano. 18 partículas con paleta cromática PUCE.
- **Modelo:** Hand Landmarker (MediaPipe) + Matter.js
- **Gestos:** Puño agarra/atrae partículas; mano abierta las dispersa con repulsión

## Tecnologías

- **Frontend:** HTML5, CSS3 (Custom Properties, Flexbox, Grid, Glassmorphism)
- **Lógica:** JavaScript ES6 Modules, import maps
- **IA/Visión:** MediaPipe Tasks Vision v0.10.3 (Hand, Face, Pose Landmarker)
- **3D:** Three.js (escena de fondo + Bioma AR)
- **Física:** Matter.js (Antigravedad)
- **Audio:** Web Audio API (Air Piano, Flappy Voice)
- **Voz:** Web Speech API (Voz a Señas)
- **AR:** WebXR (Bioma AR)
- **ML (futuro):** TF.js/ONNX (plan en `public/README_ML_TRAINING.md`)

## Diccionario LSEC

| Archivo | Gestos | Tamaño |
|---|---|---|
| `lib/lsec_gestos/diccionario_01.json` | 173 | 94.9 MB |
| `lib/lsec_gestos/diccionario_02.json` | 26 | 14.0 MB |
| `lib/lsec_gestos/index.json` | — | lista de lotes |

Generado desde `assets/LSEC2/` (excluido de git) mediante `public/generar_diccionario_gestos.py`.

## Color Palette

| Token | Hex | Uso |
|---|---|---|
| `--blue-main` | `#1F3F8B` | Fondo principal |
| `--blue-secondary` | `#244DA1` | Gradientes de fondo |
| `--blue-accent` | `#2FA4D9` | Acentos UI |
| `--cyan-bright` | `#3CC3E6` | Brillos y sombras neón |
| `--dark` | `#050816` | Base oscura |
| `--glass` | RGBA(255,255,255,0.08) | Superficies vítreas |

## Despliegue

```bash
python3 -m http.server 8080
```

Abrir `http://localhost:8080` en Chrome/Edge (HTTPS o localhost para cámara).

## Licencia

PUCE — Pontificia Universidad Católica del Ecuador
