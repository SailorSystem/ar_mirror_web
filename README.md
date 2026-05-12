# AR Mirror Web

Experiencias de cámara, gestos y realidad aumentada con una interfaz tipo cristal, profundidad 3D y energía espacial.

## Secciones

### Animales AR
Revela la fauna del Yasuní moviendo las manos frente a la cámara. La niebla digital se disipa con el movimiento de las manos, mostrando fotos reales de animales como el jaguar, anaconda, mono capuchino, búho moteado y delfín rosado.
- **Modelo:** Hand Landmarker (MediaPipe)
- **Mecánica:** Las manos actúan como "borrador" sobre una capa de niebla con `destination-out` compositing

### Lengua de Señas (LSEC)
Reconocimiento visual en tiempo real del alfabeto dactilológico LSEC y gestos/expresiones. Panel dual: alfabeto A-Z + gestos como HOLA, GRACIAS, ADIÓS.
- **Modelos:** Hand Landmarker + Gesture Recognizer (MediaPipe)
- **Orientación:** Detecta palma/dorso y orientación de muñeca para distinguir letras similares
- **Debounce:** 350ms para evitar parpadeo entre detecciones

### Flappy Nose
Controla el pájaro con la nariz. Sigue el eje vertical y horizontal de tu rostro en tiempo real.
- **Modelo:** Face Landmarker (MediaPipe)
- **Puntuación:** Sistema de colisión y conteo con tuberías invertidas (compensación de espejo)

### Air Piano
Toca notas suspendidas en el aire. 8 teclas virtuales que se activan al tocar con la yema del dedo índice.
- **Modelo:** Hand Landmarker (MediaPipe)
- **Mecánica:** Posición del dedo índice vs zonas de teclas en la parte inferior de la pantalla

### Donkey Kong Fitness
Sistema de sentadillas asistido por visión. Detecta la flexión de rodilla/cadera para contar repeticiones.
- **Modelo:** Pose Landmarker (MediaPipe)
- **Métrica:** Diferencia entre cadera y rodilla para detectar posición baja/alta

### Antigravedad PUCE
Simulación física con Matter.js + control por gestos de mano. 18 partículas con paleta cromática PUCE.
- **Modelo:** Hand Landmarker (MediaPipe) + Matter.js
- **Gestos:** Puño agarra/atrae partículas, mano abierta las dispersa con repulsión

## Tecnologías

- **Frontend:** HTML5, CSS3 (Custom Properties, Flexbox, Grid, Glassmorphism)
- **Lógica:** JavaScript ES6 Modules
- **IA/Visión:** MediaPipe Tasks Vision v0.10.3 (Face, Hand, Pose, Gesture)
- **3D:** Three.js (escena de fondo en home)
- **Física:** Matter.js (antigravedad)
- **GPU:** WebGL para aceleración de modelos

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
# Servir con cualquier servidor HTTP estático
python3 -m http.server 8080
# o
npx serve .
```

Abrir `http://localhost:8080` en un navegador con cámara (Chrome, Edge recomendados).
Se requiere conexión HTTPS o localhost para acceso a cámara.

## Licencia

PUCE - Pontificia Universidad Católica del Ecuador
