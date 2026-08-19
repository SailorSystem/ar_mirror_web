# AR Mirror Web

Experiencias de cámara, gestos y realidad aumentada con interfaz tipo cristal, profundidad 3D y energía espacial.

**Stack actual:** React 18 + Vite, MediaPipe Tasks Vision, Three.js, Web Speech API, Web Audio API y WebXR. El sitio se sirve 100 % estático (HTML/JS/CSS compilados en `dist/`).

---

## 1. Cómo funciona el traductor de voz / texto a lengua de señas

La sección **Voz a Señas** convierte el habla (o texto) en una secuencia de tarjetas con la seña correspondiente:

1. **Reconocimiento de voz** — usa la **Web Speech API** (idioma `es-ES`) del navegador. No envía audio a ningún servidor: el reconocimiento corre localmente en Chrome/Edge/Safari.
2. **Normalización** — el texto se convierte a mayúsculas, se quitan tildes y caracteres no alfabéticos, conservando `Ñ`.
3. **Matcheo de frases primero** — se buscan frases completas del catálogo (ej. `BUENOS DIAS`, `NECESITAS AYUDA`) antes de caer a palabra suelta o letra. Esto permite frases con significado propio.
4. **Cola de reproducción** — cada palabra/letra enqueuea su seña y se reproduce en secuencia con un slider de duración (1–10 s por tarjeta).
5. **Visualización** — según el tipo de entrada muestra:
   - **Gesto/frase** → video `WebM` animado (`assets/LSEC/gestoswebm/`).
   - **Letra (mayoría del alfabeto)** → imagen `JPG` (`assets/LSEC/abecedario/`).
   - **Letras con material animado `J`, `Ñ`, `Z`** → video MP4 (`assets/LSEC/abecedario/`).

También existe **Lengua de Señas (LSEC)** que reconoce el alfabeto dactilológico y gestos en tiempo real por cámara usando MediaPipe Hand Landmarker (distancias pairwise + estado de dedos + votación por ventana de frames).

---

## 2. Dónde están guardados los recursos

Los recursos viven **dentro del propio proyecto** (repo git) en estas rutas:

| Recurso | Ruta | Tamaño aprox. |
|---|---|---|
| Videos de gestos/frases (WebM) | `assets/LSEC/gestoswebm/` | 83 MB |
| Imágenes de letras + videos J/Ñ/Z | `assets/LSEC/abecedario/` | 14 MB |
| Texturas del juego/logo | `assets/textures/` | ~92 KB |
| Modelos MediaPipe (.task) | `public/models/` | ~34 MB (hand, face, pose, gesture) |
| Catálogo abecedario (distancias) | `lib/lsec_abecedario.json` | 0.5 MB |
| Catálogo de gestos (distancias, 3 lotes) | `lib/lsec_gestos/diccionario_0*.json` | ~110 MB |
| Manifiesto texto→archivo de video | `lib/lsec_gestos/videos_index.json` | ~0.1 MB |
| Lista de lotes de diccionario | `lib/lsec_gestos/index.json` | — |

> **Ojo:** el dataset origen `assets/LSEC2/` (~4 GB, vídeos `.MTS` brutos) **no** se sube a git; solo está en el equipo de desarrollo (ver `.gitignore`). Todo lo que el sitio necesita en producción está dentro del repo y se copia al `dist/` en el build.

---

## 3. ¿Base de datos, API o solo archivos?

**Solo archivos estáticos incluidos en el proyecto. No hay base de datos ni API.**

- Los catálogos (`*.json`) y los medios (webm/jpg/mp4/models) son archivos servidos por el servidor web como cualquier estático; el navegador los pide por ruta.
- El reconocimiento de voz y de manos corre **en el cliente** (Web Speech + MediaPipe WASM). MediaPipe se carga bajo demanda desde los CDN jsDelivr/unpkg solo cuando entras a una sección que lo usa (el Home funciona sin depender de ningún CDN).
- No se requiere ningún servidor de backend, ni credenciales, ni claves API.

---

## 4. Instalación en Hostinger

El proyecto es 100 % estático: basta subir la carpeta `dist/` (resultado del build) al hosting.

**Pasos:**

1. Construir el sitio en un equipo con Node.js 18+:
   ```bash
   npm ci
   npm run build
   ```
   Esto genera la carpeta `dist/` (≈ 253 MB) con `index.html`, `assets/`, `lib/` y `public/`.

2. En **Hostinger → hPanel**:
   - **Publicar/Domains → Manage → File Manager** (o subir por FTP con FileZilla).
   - Subir el **contenido de `dist/`** a `public_html/` (o subcarpeta si quieres que viva en `/mirror/`).
   - Asegurar permisos `644` en archivos y `755` en carpetas (Hostinger los asigna por defecto).

3. **HTTPS** — activar el SSL gratuito (Let's Encrypt / AutoSSL) en hPanel y forzar HTTPS. La cámara y el micrófono **requieren** HTTPS (o `localhost`); no funcionan por HTTP simple.

4. **Variables de entorno / credenciales:** **ninguna**. El sitio no usa SDK de Hostinger, ni backend, ni API keys.

5. Verificar en el navegador: **DevTools → Console** sin errores rojos y probar cámara/micrófono de cada sección.

> **Nota sobre tamaño:** el total desplegado (≈ 253 MB incluyendo diccionarios) supera el tráfico de planes de entrada; con el plan normal de Hostinger y almacenamiento SSD es viable. Si se quisiera reducir, los diccionarios de distancias (109 MB) y los WebM (83 MB) son los candidatos a mover a un CDN externo.

---

## 5. Rutas en un dominio nuevo

Todas las rutas dentro del código son **relativas** (ej. `assets/LSEC/gestoswebm/file.webm`, `lib/...`, `public/models/...`) y el build usa `base: './'`. Eso significa que:

- **Cualquier dominio o subcarpeta funciona sin tocar el código.** Solo se sube `dist/` y las rutas resuelven relativas desde donde se sirva.
- No dependen de GitHub Pages: se probó publicándolo también como carpeta estática en Hostinger.
- Dentro del código hay 3 URLs absolutas externas a CDN (jsdelivr/unpkg) que se cargan **solo al entrar a las secciones** que usan MediaPipe/Three; no dependen del dominio propio.

---

## 6. Cómo se identifica cada seña

| Ámbito | Identificador | Formato del archivo |
|---|---|---|
| **Gesto / frase** | **Nombre normalizado** (la clave del manifest). Ej. `BUENOS DIAS` → `BUENOS_DIAS.webm` | `assets/LSEC/gestoswebm/{nombre}.webm` |
| **Letra (imagen)** | Código de la letra. Ej. `A`, `CH` | `assets/LSEC/abecedario/{letra}.jpg` |
| **Letra (video)** | Solo `J`, `Ñ`, `Z` | `assets/LSEC/abecedario/{letra}.mp4` |
| **Gesto en diccionario ML** | Palabra en minúscula + categoría. Ej. `AGUA` → `category: "alimentos"` | `lib/lsec_gestos/diccionario_0*.json` |

El enlace entre texto hablado y archivo es **`lib/lsec_gestos/videos_index.json`**: un mapa `{ "TEXTO": "ARCHIVO.webm" }` (214 entradas: ~174 palabras + ~40 frases).

En los diccionarios ML cada gesto lleva `word`, `module` (categoría origen del dataset), `category`, `video` (ruta fuente `.MTS`), `fps`, `total_frames` y `frames` con los landmarks (distancias pairwise por mano).

---

## 7. Relación con el otro catologo

La propuesta acordada: **un catálogo común de señas que comparten ambas aplicaciones, manteniendo cada app sus datos técnicos separados**. Los videos **no** se guardan en la base de datos; esta solo contiene el identificador, nombre, categoría y dirección del archivo.

Propuesta de estructura mínima para el catálogo compartido:

```json
{
  "id": "BUENOS_DIAS",
  "nombre": "Buenos días",
  "categoria": "saludos",
  "tipo": "frase",
  "archivo": "assets/LSEC/gestoswebm/BUENOS_DIAS.webm",
  "formato": "webm"
}
```

- **Este proyecto** ya puede exportar su catálogo a ese formato desde `videos_index.json` + los diccionarios. Los datos técnicos ML (landmarks, distancias, config de detección) se quedan privados en `lib/lsec_gestos/`.
- **Adaptar para el catálogo de Adrián** requiere conocer el formato en que tiene sus muestras (nombres de archivo, categorías, si usa su propia carpeta de videos). Con eso generamos un mapeo/catálogo común sin tocar la lógica de detección.

---

## 8. Dockerfile / carpeta estática Nginx

No hace falta contenedor (el proyecto es estático), pero se puede servir igual con Nginx:

```nginx
server {
    listen 80;
    server_name tu-dominio;
    root /var/www/dist;             # contenido de dist/ que se sube
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    client_max_body_size 2m;
}
```

Si quieren contenerlo:

```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
EXPOSE 80
```

Todos los archivos del sitio ya están en `dist/`, listos para publicarse con Nginx, Hostinger o cualquier servidor estático.

---

## 9. Despliegue local

```bash
npm ci
npm run dev      # desarrollo (hot reload)
npm run build    # producción -> dist/
npm run preview  # probar el build localmente
```

Cámara/micrófono funcionan en `localhost` o por HTTPS.

---

## 10. Arquitectura de despliegue producción

- **GitHub Pages:** workflow `.github/workflows/deploy.yml` en cada push a `main`: `npm ci` → `npm run build` → deploy de `dist/` (Fuente en Settings → Pages = **GitHub Actions**).
- **Hostinger**: subir el contenido de `dist/` a `public_html/` (recomendado mantener GitHub Pages como espejo/backup y Hostinger como dominio oficial).

---

## Documentación por sección

- **Animales AR** — fauna del Yasuní revelada con movimiento de manos (Hand Landmarker, compositing `destination-out`).
- **Lengua de Señas (LSEC)** — reconocimiento del abecedario y gestos en vivo (Hand Landmarker; 28 letras + 199 gestos).
- **Voz a Señas** — voz→texto→señas (Web Speech API; ~214 entradas + alfabeto).
- **Bioma AR (WebXR)** — visor 3D del Yasuní con modo AR mobile (Three.js).
- **Flappy Nose / Flappy Voice / Flappy Curl** — juegos controlados por rostro, voz y pose.
- **Air Piano** — piano virtual con dedo índice (Hand Landmarker + Web Audio).
- **Pull-up Coach / Donkey Kong Fitness** — conteo de dominadas y sentadillas (Pose Landmarker).
- **Antigravedad PUCE** — simulación física Matter.js con gestos de mano.

## Tecnologías

React 18 · Vite 5 · MediaPipe Tasks Vision 0.10.3 · Three.js 0.164 · Matter.js · Web Speech API · Web Audio API · WebXR · GitHub Actions + GitHub Pages

## Color Palette

| Token | Hex | Uso |
|---|---|---|
| `--blue-main` | `#1F3F8B` | Fondo principal |
| `--blue-secondary` | `#244DA1` | Gradientes de fondo |
| `--blue-accent` | `#2FA4D9` | Acentos UI |
| `--cyan-bright` | `#3CC3E6` | Brillos y sombras neón |
| `--dark` | `#050816` | Base oscura |

## Licencia

PUCE — Pontificia Universidad Católica del Ecuador