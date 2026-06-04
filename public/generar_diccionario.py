#!/usr/bin/env python3
"""
generar_diccionario.py — Genera diccionario de landmarks LSEC a partir del abecedario.

Procesa cada imagen del abecedario con MediaPipe Hands para extraer landmarks,
genera imágenes con landmarks dibujados y un archivo JSON para usar en la web.

Uso:
    python public/generar_diccionario.py

Salida en assets/LSEC/diccionario/:
    - {LETTER}_{variant}_landmarks.jpg   (imagen con landmarks dibujados)
    - landmarks.json                      (coordenadas normalizadas + distancias pairwise)
    - reporte.html                        (grid visual para validación rápida)
"""

import cv2
import mediapipe as mp
import numpy as np
import json
import os
import shutil
from pathlib import Path

# ── Configuración ──────────────────────────────────────────────────────────────
INPUT_DIR = Path("assets/LSEC/abecedario")
OUTPUT_DIR = Path("assets/LSEC/diccionario")
TEMP_DIR = Path("/tmp/lsec_diccionario")

# Paleta de colores por dedo (BGR para OpenCV)
FINGER_COLORS = {
    "pulgar":   (255, 0, 255),   # magenta
    "indice":   (0, 255, 0),     # verde
    "medio":    (0, 255, 255),   # amarillo
    "anular":   (255, 128, 0),   # naranja
    "menique":  (255, 0, 0),     # azul
}

# Conexiones de MediaPipe Hands (índices de landmarks)
MP_HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),       # pulgar
    (0, 5), (5, 6), (6, 7), (7, 8),       # índice
    (0, 9), (9, 10), (10, 11), (11, 12),   # medio
    (0, 13), (13, 14), (14, 15), (15, 16), # anular
    (0, 17), (17, 18), (18, 19), (19, 20), # meñique
]

# Asignar color a cada conexión según el dedo
CONNECTION_COLORS = {}
finger_connections = {
    "pulgar":  [(0, 1), (1, 2), (2, 3), (3, 4)],
    "indice":  [(0, 5), (5, 6), (6, 7), (7, 8)],
    "medio":   [(0, 9), (9, 10), (10, 11), (11, 12)],
    "anular":  [(0, 13), (13, 14), (14, 15), (15, 16)],
    "menique": [(0, 17), (17, 18), (18, 19), (19, 20)],
}
for finger, conns in finger_connections.items():
    for conn in conns:
        CONNECTION_COLORS[conn] = FINGER_COLORS[finger]


# ── Inicializar MediaPipe ─────────────────────────────────────────────────────
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

hands = mp_hands.Hands(
    static_image_mode=True,
    max_num_hands=2,
    min_detection_confidence=0.5,
)


# ── Normalización ─────────────────────────────────────────────────────────────
def normalize_landmarks(landmarks):
    """
    Normaliza landmarks 3D:
      1. Centra en la muñeca (landmark 0)
      2. Escala por distancia muñeca→base del medio (landmark 0→9)
    Devuelve: normalized list, palm_size, centro.
    """
    w = np.array([landmarks[0].x, landmarks[0].y, landmarks[0].z])
    m = np.array([landmarks[9].x, landmarks[9].y, landmarks[9].z])
    palm_size = float(np.linalg.norm(m - w))
    if palm_size < 1e-8:
        palm_size = 1.0
    norm = []
    for lm in landmarks:
        p = np.array([lm.x, lm.y, lm.z])
        norm.append(((p - w) / palm_size).tolist())
    return norm, palm_size


def compute_pairwise_distances(norm_pts):
    """Vector 210D de distancias pairwise entre todos los landmarks normalizados."""
    pts = np.array(norm_pts)
    n = len(pts)
    dists = []
    for i in range(n):
        for j in range(i + 1, n):
            dists.append(float(np.linalg.norm(pts[i] - pts[j])))
    return dists


def compute_finger_angles(norm_pts):
    """
    Calcula ángulos de flexión de cada dedo.
    Cada dedo tiene 4 landmarks relevantes.
    Ángulo = producto punto entre vectores consecutivos normalizados.
    """
    finger_indices = {
        "pulgar":  [1, 2, 3, 4],
        "indice":  [5, 6, 7, 8],
        "medio":   [9, 10, 11, 12],
        "anular":  [13, 14, 15, 16],
        "menique": [17, 18, 19, 20],
    }
    angles = {}
    for name, idxs in finger_indices.items():
        pts_list = [np.array(norm_pts[i]) for i in idxs]
        v1 = pts_list[1] - pts_list[0]
        v2 = pts_list[2] - pts_list[1]
        v3 = pts_list[3] - pts_list[2]
        def cos_between(a, b):
            denom = (np.linalg.norm(a) * np.linalg.norm(b))
            return float(np.dot(a, b) / denom) if denom > 1e-8 else 1.0
        angles[name] = [cos_between(v1, v2), cos_between(v2, v3)]
    return angles


def compute_finger_state(norm_pts):
    """Determina si cada dedo está extendido (True) o doblado (False).
    Compara la posición Y (arriba/abajo en imagen) de la punta vs la base del dedo.
    Para el pulgar: compara x en lugar de y (movimiento lateral).
    """
    fingers = {
        "indice":  (5, 8),
        "medio":   (9, 12),
        "anular":  (13, 16),
        "menique": (17, 20),
    }
    state = {}
    for name, (base, tip) in fingers.items():
        state[name] = norm_pts[tip][1] < norm_pts[base][1]
    # Pulgar: extendido si punta (4) está a la izquierda de la base (2) en x
    state["pulgar"] = norm_pts[4][0] < norm_pts[2][0]
    return state


# ── Dibujar ───────────────────────────────────────────────────────────────────
def draw_landmarks(image, landmarks, show_labels=True):
    """Dibuja landmarks coloreados por dedo sobre la imagen."""
    h, w = image.shape[:2]
    canvas = image.copy()

    # Conexiones coloreadas por dedo
    for conn in MP_HAND_CONNECTIONS:
        a, b = conn
        pt1 = (int(landmarks[a].x * w), int(landmarks[a].y * h))
        pt2 = (int(landmarks[b].x * w), int(landmarks[b].y * h))
        color = CONNECTION_COLORS.get(conn, (0, 255, 0))
        cv2.line(canvas, pt1, pt2, color, 2, cv2.LINE_AA)

    # Landmarks como círculos
    for i, lm in enumerate(landmarks):
        cx, cy = int(lm.x * w), int(lm.y * h)
        color = (255, 255, 255)
        radius = 6 if i == 0 else 4
        cv2.circle(canvas, (cx, cy), radius, color, -1)
        cv2.circle(canvas, (cx, cy), radius, (0, 0, 0), 1)
        if show_labels:
            cv2.putText(canvas, str(i), (cx + 5, cy - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1)

    return canvas


# ── Procesar una imagen ───────────────────────────────────────────────────────
def process_image(filepath):
    """
    Procesa una imagen con MediaPipe Hands.
    Retorna (datos_dict, imagen_con_landmarks) o (None, None) si falla.
    """
    image = cv2.imread(str(filepath))
    if image is None:
        return None, None

    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = hands.process(rgb)

    if not results.multi_hand_landmarks:
        return None, None

    # Primera mano detectada
    hand_lms = results.multi_hand_landmarks[0].landmark

    # Normalizar
    norm_lms, palm_size = normalize_landmarks(hand_lms)

    # Features
    pairwise = compute_pairwise_distances(norm_lms)
    angles = compute_finger_angles(norm_lms)
    finger_state = compute_finger_state(norm_lms)

    # Raw
    raw_lms = [[lm.x, lm.y, lm.z] for lm in hand_lms]

    # Imagen dibujada
    img_drawn = draw_landmarks(image, hand_lms, show_labels=True)

    data = {
        "landmarks_raw": raw_lms,
        "landmarks_norm": norm_lms,
        "palm_size": palm_size,
        "pairwise_distances": pairwise,
        "angles": angles,
        "finger_state": finger_state,
        "detected": True,
    }
    return data, img_drawn


# ── Extraer frame de video ────────────────────────────────────────────────────
def extract_video_frame(filepath, output_path):
    """Extrae el primer frame de un video y lo guarda como JPG."""
    cap = cv2.VideoCapture(str(filepath))
    ret, frame = cap.read()
    cap.release()
    if ret:
        cv2.imwrite(str(output_path), frame)
        return output_path
    return None


# ── Generar reporte HTML ──────────────────────────────────────────────────────
def generate_report(entries):
    html = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Diccionario LSEC — Validacion de Landmarks</title>
<style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;background:#111;color:#eee;padding:24px}
    h1{text-align:center;margin-bottom:4px;font-size:26px;color:#0f0}
    .sub{text-align:center;margin-bottom:24px;color:#888;font-size:14px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;max-width:1400px;margin:0 auto}
    .card{background:#1a1a1a;border-radius:12px;padding:12px;text-align:center;border:1px solid #333;transition:border-color .2s}
    .card:hover{border-color:#0f0}
    .card img{width:100%;height:auto;border-radius:8px;display:block}
    .card .letter{font-size:28px;font-weight:700;margin:8px 0 2px}
    .card .variant{font-size:12px;color:#888}
    .badge{display:inline-block;padding:2px 10px;border-radius:4px;font-size:11px;margin-top:6px;font-weight:600}
    .badge-ok{background:#060;color:#0f0}
    .badge-fail{background:#600;color:#f00}
    .stats{text-align:center;margin-bottom:20px;font-size:14px;color:#aaa}
    .stats span{margin:0 12px}
    .stats .ok{color:#0f0}
    .stats .fail{color:#f00}
</style>
</head>
<body>
<h1>Diccionario LSEC</h1>
<p class="sub">Validacion visual de landmarks detectados por MediaPipe</p>
"""
    total = len(entries)
    ok = sum(1 for e in entries if e["detected"])
    fail = total - ok

    html += f'<div class="stats"><span class="ok">OK: {ok}</span><span class="fail">Fallos: {fail}</span><span>Total: {total}</span></div>\n'
    html += '<div class="grid">\n'

    for e in entries:
        badge = "badge-ok" if e["detected"] else "badge-fail"
        status = "detectado" if e["detected"] else "NO detectado"
        html += f"""<div class="card">
    <img src="{e['img_file']}" alt="{e['letter']}">
    <div class="letter">{e['letter']}</div>
    <div class="variant">{e['variant']}</div>
    <span class="badge {badge}">{status}</span>
</div>\n"""

    html += """</div>
</body>
</html>"""
    return html


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("=" * 55)
    print("  Generador de Diccionario LSEC — Landmarks")
    print("=" * 55)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Colectar archivos de imagen y video
    jpg_files = sorted(INPUT_DIR.glob("*.jpg"))
    mp4_files = sorted(INPUT_DIR.glob("*.mp4"))

    # Filtrar archivos Zone.Identifier (Windows leftovers)
    jpg_files = [f for f in jpg_files if ":Zone" not in f.name]
    mp4_files = [f for f in mp4_files if ":Zone" not in f.name]

    print(f"\n  Imágenes: {len(jpg_files)} archivos")
    print(f"  Videos:   {len(mp4_files)} archivos")

    # 2. Agrupar por letra
    #    X.jpg  → frontal (stem = "X")
    #    X..jpg → lateral (stem = "X." → letter = "X")
    letter_map = {}

    for f in jpg_files:
        stem = f.stem
        if stem.endswith("."):
            letter = stem[:-1]
            variant = "lateral"
        else:
            letter = stem
            variant = "frontal"
        letter_map.setdefault(letter, []).append({"variant": variant, "file": f})

    for f in mp4_files:
        letter = f.stem
        letter_map.setdefault(letter, []).append({"variant": "video", "file": f})

    print(f"\n  Letras únicas: {len(letter_map)}")
    for letter in sorted(letter_map.keys()):
        vnames = [v["variant"] for v in letter_map[letter]]
        print(f"    {letter}: {', '.join(vnames)}")

    # 3. Procesar cada variante
    dictionary = {}
    report_entries = []
    total_variants = sum(len(v) for v in letter_map.values())
    processed = 0

    for letter in sorted(letter_map.keys()):
        variants = letter_map[letter]
        dictionary[letter] = []

        for v in variants:
            fpath = v["file"]
            processed += 1
            print(f"\n  [{processed}/{total_variants}] {letter} ({v['variant']}): {fpath.name} ...", end=" ", flush=True)

            # Videos: extraer primer frame
            if v["variant"] == "video":
                frame_path = TEMP_DIR / f"{letter}_frame.jpg"
                if not extract_video_frame(fpath, frame_path):
                    print("ERROR al extraer frame")
                    dictionary[letter].append({
                        "variant": "video",
                        "file": str(fpath.relative_to(Path("assets"))),
                        "detected": False,
                    })
                    report_entries.append({
                        "letter": letter, "variant": "video",
                        "img_file": "", "detected": False,
                    })
                    continue
                data, img = process_image(frame_path)
                os.remove(frame_path)
            else:
                data, img = process_image(fpath)

            if data is None:
                print("NO se detectó mano")
                dictionary[letter].append({
                    "variant": v["variant"],
                    "file": str(fpath.relative_to(Path("assets"))),
                    "detected": False,
                })
                report_entries.append({
                    "letter": letter, "variant": v["variant"],
                    "img_file": "", "detected": False,
                })
                continue

            # Guardar imagen con landmarks
            out_name = f"{letter}_{v['variant']}_landmarks.jpg"
            out_path = OUTPUT_DIR / out_name
            cv2.imwrite(str(out_path), img)

            dictionary[letter].append({
                "variant": v["variant"],
                "file": str(fpath.relative_to(Path("assets"))),
                "landmarks_raw": data["landmarks_raw"],
                "landmarks_norm": data["landmarks_norm"],
                "palm_size": data["palm_size"],
                "pairwise_distances": data["pairwise_distances"],
                "angles": data["angles"],
                "finger_state": data["finger_state"],
                "detected": True,
            })

            report_entries.append({
                "letter": letter,
                "variant": v["variant"],
                "img_file": out_name,
                "detected": True,
            })

            print(f"OK (palm={data['palm_size']:.4f})")

    # 4. Guardar JSON
    json_path = OUTPUT_DIR / "landmarks.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(dictionary, f, indent=2, ensure_ascii=False)
    print(f"\n\n  JSON guardado: {json_path}")

    # 5. Generar reporte HTML
    html = generate_report(report_entries)
    report_path = OUTPUT_DIR / "reporte.html"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  Reporte HTML: {report_path}")

    # 6. Resumen
    total = len(report_entries)
    ok = sum(1 for e in report_entries if e["detected"])
    fail = total - ok
    print(f"\n  {'=' * 40}")
    print(f"  Total variantes: {total}")
    print(f"  Detectadas:      {ok}")
    print(f"  Fallos:          {fail}")
    if total:
        print(f"  Tasa de éxito:   {ok / total * 100:.1f}%")
    print(f"  {'=' * 40}")
    print(f"\n  Para ver el reporte:")
    print(f"    python -m http.server 8000")
    print(f"    → http://localhost:8000/assets/LSEC/diccionario/reporte.html")
    print()

    # Limpiar temp
    shutil.rmtree(TEMP_DIR, ignore_errors=True)


if __name__ == "__main__":
    main()
