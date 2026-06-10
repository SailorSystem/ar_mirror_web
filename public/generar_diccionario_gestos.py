#!/usr/bin/env python3
"""
generar_diccionario_gestos.py — Genera diccionario de landmarks para gestos LSEC.

Procesa cada video MP4 de gestos, extrayendo frames equiespaciados y
extrayendo landmarks de MANOS (ambas, Left+Right) + CARA con MediaPipe.
Genera imágenes, montajes y JSON completo para usar en la web.

Uso:
    python public/generar_diccionario_gestos.py

Salida en assets/LSEC/diccionario_gestos/:
    - frames/{GESTO}_{idx}_landmarks.jpg   (frames individuales con landmarks)
    - {GESTO}_montaje.jpg                   (grid del gesto completo)
    - gestos_landmarks.json                 (ambas manos + cara por frame)
    - reporte.html                          (grid visual para validación)
"""

import cv2
import mediapipe as mp
import numpy as np
import json
import os
import shutil
import unicodedata
import math
import time
from pathlib import Path

# ── Configuración ──────────────────────────────────────────────────────────────
LSEC2_DIR = Path("assets/LSEC2")
OUTPUT_DIR = Path("assets/LSEC2/diccionario_gestos")
FRAMES_DIR = OUTPUT_DIR / "frames"
GESTOS_DIR = Path("lib/lsec_gestos")
TEMP_DIR = Path("/tmp/lsec_gestos")

NUM_SAMPLES = 12
MIN_PALM_SIZE = 0.02

# Paleta de colores (BGR)
FINGER_COLORS = {
    "pulgar":   (255, 0, 255),
    "indice":   (0, 255, 0),
    "medio":    (0, 255, 255),
    "anular":   (255, 128, 0),
    "menique":  (255, 0, 0),
}
FACE_COLOR  = (255, 200, 100)
MP_HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (0, 9), (9, 10), (10, 11), (11, 12),
    (0, 13), (13, 14), (14, 15), (15, 16),
    (0, 17), (17, 18), (18, 19), (19, 20),
]
FINGER_CONNS = {
    "pulgar":  [(0, 1), (1, 2), (2, 3), (3, 4)],
    "indice":  [(0, 5), (5, 6), (6, 7), (7, 8)],
    "medio":   [(0, 9), (9, 10), (10, 11), (11, 12)],
    "anular":  [(0, 13), (13, 14), (14, 15), (15, 16)],
    "menique": [(0, 17), (17, 18), (18, 19), (19, 20)],
}
CONN_COLORS = {}
for finger, conns in FINGER_CONNS.items():
    for conn in conns:
        CONN_COLORS[conn] = FINGER_COLORS[finger]

# ── Inicializar MediaPipe ─────────────────────────────────────────────────────
mp_hands = mp.solutions.hands
mp_face_mesh = mp.solutions.face_mesh

hands = mp_hands.Hands(
    static_image_mode=True,
    max_num_hands=2,
    min_detection_confidence=0.5,
)
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=True,
    max_num_faces=1,
    min_detection_confidence=0.3,
)

KEY_FACE_INDICES = {
    "boca_exterior":  [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
    "boca_interior":  [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95],
    "ceja_izq":       [46, 53, 52, 65, 55, 70, 63, 105, 66, 107],
    "ceja_der":       [276, 283, 282, 295, 285, 300, 293, 334, 296, 336],
    "ojo_izq":        [33, 160, 158, 133, 153, 144, 159, 145],
    "ojo_der":        [362, 385, 387, 263, 373, 380, 386, 374],
    "nariz":          [1, 2, 196, 3, 4, 5, 6, 19, 20, 44, 45, 51, 122, 131, 134, 168, 94, 97, 98, 209, 217, 237, 241, 240, 279, 351, 353, 354, 355, 356, 450, 449, 448, 456, 420],
    "mandibula":      [152, 175, 176, 150, 149, 148, 147, 146, 200, 377, 378, 379, 380, 381],
    "frente":         [10, 338, 297, 332, 284, 251, 389, 356, 70, 63, 105],
}
KEY_FACE_INDICES_LIST = sorted(set(
    idx for indices in KEY_FACE_INDICES.values() for idx in indices
))

FACE_CONNECTIONS = [
    (33, 133), (362, 263),
    (159, 145), (386, 374),
    (61, 291),
    (0, 17), (14, 13),
    (46, 105), (276, 334),
    (10, 152),
]


# ── Utilidades ────────────────────────────────────────────────────────────────
def normalize_word(name):
    s = unicodedata.normalize("NFD", name)
    s = s.encode("ascii", "ignore").decode("ascii")
    return s.upper()


def normalize_landmarks_3d(landmarks, indices=None):
    if indices is None:
        pts = np.array([[lm.x, lm.y, lm.z] for lm in landmarks])
    else:
        pts = np.array([[landmarks[i].x, landmarks[i].y, landmarks[i].z] for i in indices])
    center = pts[0]
    translated = pts - center
    scale = float(np.std(translated)) + 1e-8
    norm = (translated / scale).tolist()
    return norm, scale, center.tolist()


def normalize_landmarks(landmarks):
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
    pts = np.array(norm_pts)
    n = len(pts)
    dists = []
    for i in range(n):
        for j in range(i + 1, n):
            dists.append(float(np.linalg.norm(pts[i] - pts[j])))
    return dists


def compute_finger_angles(norm_pts):
    finger_indices = {
        "pulgar":  [1, 2, 3, 4],
        "indice":  [5, 6, 7, 8],
        "medio":   [9, 10, 11, 12],
        "anular":  [13, 14, 15, 16],
        "menique": [17, 18, 19, 20],
    }
    angles = {}
    for name, idxs in finger_indices.items():
        pts = [np.array(norm_pts[i]) for i in idxs]
        v1 = pts[1] - pts[0]
        v2 = pts[2] - pts[1]
        v3 = pts[3] - pts[2]
        def cos_between(a, b):
            denom = np.linalg.norm(a) * np.linalg.norm(b)
            return float(np.dot(a, b) / denom) if denom > 1e-8 else 1.0
        angles[name] = [cos_between(v1, v2), cos_between(v2, v3)]
    return angles


def compute_finger_state(norm_pts):
    fingers = {
        "indice":  (5, 8),
        "medio":   (9, 12),
        "anular":  (13, 16),
        "menique": (17, 20),
    }
    state = {}
    for name, (base, tip) in fingers.items():
        state[name] = norm_pts[tip][1] < norm_pts[base][1]
    state["pulgar"] = norm_pts[4][0] < norm_pts[2][0]
    return state


def compute_face_metrics(face_lms, indices):
    pts = {name: np.array([[face_lms[j].x, face_lms[j].y, face_lms[j].z]
                           for j in idxs])
           for name, idxs in indices.items()}
    metrics = {}

    if len(pts.get("boca_interior", [])) > 0 and len(pts.get("boca_exterior", [])) > 0:
        mouth_top = np.array([face_lms[0].x, face_lms[0].y])
        mouth_bot = np.array([face_lms[14].x, face_lms[14].y])
        mouth_l   = np.array([face_lms[61].x, face_lms[61].y])
        mouth_r   = np.array([face_lms[291].x, face_lms[291].y])
        mouth_h   = float(np.linalg.norm(mouth_top - mouth_bot))
        mouth_w   = float(np.linalg.norm(mouth_l - mouth_r))
        metrics["mouth_open"] = mouth_h / (mouth_w + 1e-8)
        metrics["mouth_width"] = mouth_w
    else:
        metrics["mouth_open"] = 0.0
        metrics["mouth_width"] = 0.0

    for side, eye_idxs, brow_idxs in [
        ("izq", [33, 133, 159, 145], [46, 53, 52, 65, 55, 70, 63, 105, 66, 107]),
        ("der", [362, 385, 387, 263, 373, 380, 386, 374], [276, 283, 282, 295, 285, 300, 293, 334, 296, 336]),
    ]:
        eye_center_y = np.mean([face_lms[i].y for i in eye_idxs])
        brow_center_y = np.mean([face_lms[i].y for i in brow_idxs])
        metrics[f"eyebrow_raise_{side}"] = float(eye_center_y - brow_center_y)

    for side, l_idx, r_idx, t_idx, b_idx in [
        ("izq", 33, 133, 159, 145),
        ("der", 362, 263, 386, 374),
    ]:
        eye_w = float(np.linalg.norm(
            np.array([face_lms[l_idx].x, face_lms[l_idx].y]) -
            np.array([face_lms[r_idx].x, face_lms[r_idx].y])
        ))
        eye_h = float(np.linalg.norm(
            np.array([face_lms[t_idx].x, face_lms[t_idx].y]) -
            np.array([face_lms[b_idx].x, face_lms[b_idx].y])
        ))
        metrics[f"eye_open_{side}"] = eye_h / (eye_w + 1e-8)

    return metrics


# ── Dibujar ───────────────────────────────────────────────────────────────────
def draw_landmarks(image, draw_hands, face_landmarks=None):
    """
    draw_hands: list of (mediapipe_landmark_list, label_key)
    - mediapipe_landmark_list: list of MediaPipe NormalizedLandmark objects
    - label_key: "Left" or "Right"
    """
    h, w = image.shape[:2]
    canvas = image.copy()

    if face_landmarks:
        for conn in FACE_CONNECTIONS:
            a, b = conn
            pt1 = (int(face_landmarks[a].x * w), int(face_landmarks[a].y * h))
            pt2 = (int(face_landmarks[b].x * w), int(face_landmarks[b].y * h))
            cv2.line(canvas, pt1, pt2, FACE_COLOR, 1, cv2.LINE_AA)
        for i in KEY_FACE_INDICES_LIST:
            lm = face_landmarks[i]
            cx, cy = int(lm.x * w), int(lm.y * h)
            cv2.circle(canvas, (cx, cy), 2, FACE_COLOR, -1)

    for hand_landmarks, label_key in draw_hands:
        color = (0, 255, 0) if label_key == "Right" else (0, 200, 255)
        for conn in MP_HAND_CONNECTIONS:
            a, b = conn
            pt1 = (int(hand_landmarks[a].x * w), int(hand_landmarks[a].y * h))
            pt2 = (int(hand_landmarks[b].x * w), int(hand_landmarks[b].y * h))
            conn_color = CONN_COLORS.get(conn, color)
            cv2.line(canvas, pt1, pt2, conn_color, 2, cv2.LINE_AA)
        for i, lm in enumerate(hand_landmarks):
            cx, cy = int(lm.x * w), int(lm.y * h)
            radius = 6 if i == 0 else 4
            cv2.circle(canvas, (cx, cy), radius, (255, 255, 255), -1)
            cv2.circle(canvas, (cx, cy), radius, (0, 0, 0), 1)
            cv2.putText(canvas, str(i), (cx + 5, cy - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 255, 255), 1)
        cv2.putText(canvas, label_key[0], (int(hand_landmarks[0].x * w) - 10, int(hand_landmarks[0].y * h) - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    return canvas


def build_hand_data(hlm_landmarks):
    """Convierte landmarks de MediaPipe a dict con todas las métricas."""
    norm_lms, palm_size = normalize_landmarks(hlm_landmarks)
    pairwise = compute_pairwise_distances(norm_lms)
    angles = compute_finger_angles(norm_lms)
    finger_state = compute_finger_state(norm_lms)
    raw_lms = [[lm.x, lm.y, lm.z] for lm in hlm_landmarks]
    return {
        "detected": True,
        "landmarks_raw": raw_lms,
        "landmarks_norm": norm_lms,
        "palm_size": palm_size,
        "pairwise_distances": pairwise,
        "angles": angles,
        "finger_state": finger_state,
    }


def process_frame(image):
    """
    Procesa un frame: detecta AMBAS manos + cara.
    Retorna (hands_dict, face_data, img_drawn, draw_hands).
    - hands_dict: {"Left": data|None, "Right": data|None}
    - draw_hands: list of (MediaPipe_landmarks, key) para dibujar
    """
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    hands_dict = {"Left": None, "Right": None}
    draw_hands = []
    hand_results = hands.process(rgb)

    if hand_results.multi_hand_landmarks:
        for idx, hlm in enumerate(hand_results.multi_hand_landmarks):
            label = "Right"
            if hand_results.multi_handedness and idx < len(hand_results.multi_handedness):
                label = hand_results.multi_handedness[idx].classification[0].label
            key = "Right" if label == "Right" else "Left"

            _, ps = normalize_landmarks(hlm.landmark)
            if ps < MIN_PALM_SIZE:
                continue

            hlm_landmarks = hlm.landmark
            data = build_hand_data(hlm_landmarks)
            data["label"] = key

            if hands_dict[key] is None or ps > hands_dict[key]["palm_size"]:
                hands_dict[key] = data
                draw_hands.append((hlm_landmarks, key))

    # ── Cara ──
    face_data = None
    face_results = face_mesh.process(rgb)
    if face_results.multi_face_landmarks:
        flm = face_results.multi_face_landmarks[0].landmark
        raw_face = [[flm[i].x, flm[i].y, flm[i].z] for i in KEY_FACE_INDICES_LIST]
        norm_face, face_scale, face_center = normalize_landmarks_3d(flm, KEY_FACE_INDICES_LIST)
        metrics = compute_face_metrics(flm, {
            "boca_exterior": [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
            "boca_interior": [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95],
        })
        face_data = {
            "detected": True,
            "key_indices": KEY_FACE_INDICES_LIST,
            "landmarks_raw": raw_face,
            "landmarks_norm": norm_face,
            "scale": face_scale,
            "center": face_center,
            "metrics": metrics,
        }

    face_lms_for_draw = flm if face_data else None
    img_drawn = draw_landmarks(image, draw_hands, face_lms_for_draw)

    return hands_dict, face_data, img_drawn, draw_hands


# ── Montaje ───────────────────────────────────────────────────────────────────
def create_montage(frames, labels, cols=4):
    n = len(frames)
    if n == 0:
        return None
    rows = (n + cols - 1) // cols
    h, w = frames[0].shape[:2]
    gap = 4
    canvas_h = rows * h + (rows - 1) * gap + 40
    canvas_w = cols * w + (cols - 1) * gap
    montage = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)
    montage.fill(30)
    for i, (frame, label) in enumerate(zip(frames, labels)):
        r = i // cols
        c = i % cols
        x = c * (w + gap)
        y = r * (h + gap) + 40
        if y + h <= canvas_h and x + w <= canvas_w:
            montage[y:y+h, x:x+w] = frame
            cv2.putText(montage, label, (x + 6, y + h - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
    cv2.putText(montage, f"{n} frames", (8, 24),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    return montage


# ── Reporte HTML ──────────────────────────────────────────────────────────────
def generate_report(entries):
    html = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Diccionario Gestos LSEC — Validacion</title>
<style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;background:#111;color:#eee;padding:24px}
    h1{text-align:center;margin-bottom:4px;font-size:26px;color:#0f0}
    .sub{text-align:center;margin-bottom:24px;color:#888;font-size:14px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:16px;max-width:1600px;margin:0 auto}
    .card{background:#1a1a1a;border-radius:12px;padding:12px;text-align:center;border:1px solid #333}
    .card img{width:100%;height:auto;border-radius:8px;display:block}
    .card .label{font-size:22px;font-weight:700;margin:8px 0 2px}
    .card .sub{font-size:13px;color:#aaa}
    .badge{display:inline-block;padding:2px 10px;border-radius:4px;font-size:11px;margin-top:6px;font-weight:600}
    .badge-ok{background:#060;color:#0f0}
    .badge-fail{background:#600;color:#f00}
    .stats{text-align:center;margin-bottom:20px;font-size:14px;color:#aaa}
    .stats span{margin:0 12px}
    .stats .ok{color:#0f0}
    .stats .fail{color:#f00}
    .pri{color:#ff0}
</style>
</head>
<body>
<h1>Diccionario Gestos LSEC</h1>
<p class="sub">Validacion de landmarks (ambas manos + cara) en videos</p>
"""
    total = len(entries)
    h_total = sum(g["hand_total"] for g in entries)
    h_ok_all = sum(g["hand_ok"]["left"] + g["hand_ok"]["right"] for g in entries)
    f_ok = sum(g["face_ok"] for g in entries)

    html += f'<div class="stats">'
    html += f'<span class="ok">Manos: {h_ok_all}/{h_total*2}</span>'
    html += f'<span class="fail">Fallo: {h_total*2 - h_ok_all}</span>'
    html += f'<span>Cara: {f_ok}/{h_total}</span>'
    html += f'<span>Gestos: {total}</span>'
    html += f'</div>\n'
    html += '<div class="grid">\n'

    for g in entries:
        left_ok = g["hand_ok"]["left"]
        right_ok = g["hand_ok"]["right"]
        total_h = g["hand_total"]
        total_detected = left_ok + right_ok
        ratio = total_detected / max(total_h * 2, 1) * 100
        badge = "badge-ok" if ratio > 50 else "badge-fail"
        pri = g.get("primary_hand", "?")
        status = f"L:{left_ok}/{total_h} R:{right_ok}/{total_h} C:{g['face_ok']}/{total_h} pri:{pri}"
        html += f"""<div class="card">
    <img src="{g['montaje']}" alt="{g['word']}">
    <div class="label">{g['word']}</div>
    <div class="sub">{status}</div>
    <span class="badge {badge}">{ratio:.0f}%</span>
</div>\n"""

    html += """</div>
</body>
</html>"""
    return html


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("=" * 58)
    print("  Generador de Diccionario de Gestos LSEC (ambas manos + cara)")
    print("=" * 58)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    # ── Scan módulos 03-10 para archivos de video ───────────────────────
    video_files = []  # (path, module_name, category_name)
    module_dirs = sorted([
        d for d in LSEC2_DIR.iterdir()
        if d.is_dir() and d.name[:2].isdigit()
        and 3 <= int(d.name[:2]) <= 10
    ])
    for mod_dir in module_dirs:
        mod_name = mod_dir.name
        for sub_dir in sorted(mod_dir.iterdir()):
            if not sub_dir.is_dir():
                continue
            cat_name = sub_dir.name
            for ext in ("*.MTS", "*.mp4", "*.MP4", "*.mts"):
                for f in sorted(sub_dir.glob(ext)):
                    if ":Zone" not in f.name:
                        video_files.append((f, mod_name, cat_name))

    print(f"\n  Módulos: {len(module_dirs)} | Videos: {len(video_files)} | Frames por video: {NUM_SAMPLES}")
    for md in module_dirs:
        count = sum(1 for _, m, _ in video_files if m == md.name)
        if count:
            print(f"    {md.name}: {count} videos")
    print()

    dictionary = {}
    report_entries = []
    t_start = time.time()

    for vid_idx, (vid_path, mod_name, cat_name) in enumerate(video_files):
        word_name = vid_path.stem
        word_key = normalize_word(word_name)
        # Avoid key collisions: append source if duplicate
        orig_key = word_key
        suffix = 2
        while word_key in dictionary:
            word_key = f"{orig_key}_{suffix}"
            suffix += 1
        t_vid = time.time()

        # ── Progress bar ────────────────────────────────────────────────
        elapsed = time.time() - t_start
        done = vid_idx
        remain = len(video_files) - vid_idx
        avg = elapsed / max(vid_idx, 1)
        eta = avg * remain if vid_idx > 0 else 0
        bar_len = 30
        filled = int(bar_len * vid_idx / len(video_files))
        bar = "█" * filled + "░" * (bar_len - filled)
        print(f"\n  [{bar}] {done}/{len(video_files)}  Elapsed:{elapsed/60:.1f}m  ETA:{eta/60:.1f}m", flush=True)
        print(f"  [{vid_idx+1}/{len(video_files)}] {mod_name}/{cat_name}/{word_name} ({word_key}) ...", flush=True)

        cap = cv2.VideoCapture(str(vid_path))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)

        if total_frames < 1:
            print(f"    Video vacío")
            cap.release()
            continue

        samples = min(NUM_SAMPLES, total_frames)
        frame_indices = np.linspace(0, total_frames - 1, samples, dtype=int).tolist()

        frame_data_list = []
        drawn_frames = []
        frame_labels = []
        hand_detected_count = {"Left": 0, "Right": 0}
        face_detected_count = 0

        # ── Motion tracking ────────────────────────────────────────────
        prev_wrist = {"Left": None, "Right": None}
        total_motion = {"Left": 0.0, "Right": 0.0}

        for fi, frame_idx in enumerate(frame_indices):
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame = cap.read()
            if not ret:
                continue

            hands_dict, face_data, img_drawn, draw_hands = process_frame(frame)
            pct = (frame_idx / max(total_frames - 1, 1)) * 100
            label = f"#{frame_idx} ({pct:.0f}%)"

            # ── Motion update + frame label ──
            for hkey in ["Left", "Right"]:
                hd = hands_dict[hkey]
                if hd and hd["detected"]:
                    wrist = hd["landmarks_raw"][0]
                    if prev_wrist[hkey] is not None:
                        dx = wrist[0] - prev_wrist[hkey][0]
                        dy = wrist[1] - prev_wrist[hkey][1]
                        total_motion[hkey] += math.hypot(dx, dy)
                    prev_wrist[hkey] = (wrist[0], wrist[1])

            # ── Frame entry ──
            l_det = hands_dict["Left"] and hands_dict["Left"]["detected"]
            r_det = hands_dict["Right"] and hands_dict["Right"]["detected"]

            frame_entry = {
                "idx": frame_idx,
                "pct": round(pct, 1),
                "hands": {
                    "Left": hands_dict["Left"] if l_det else {"detected": False},
                    "Right": hands_dict["Right"] if r_det else {"detected": False},
                },
                "face": face_data if face_data else {"detected": False},
            }

            if l_det:
                hand_detected_count["Left"] += 1
            if r_det:
                hand_detected_count["Right"] += 1
            if face_data and face_data["detected"]:
                face_detected_count += 1

            label += f" L={'OK' if l_det else '--'} R={'OK' if r_det else '--'}"
            if face_data and face_data["detected"]:
                label += " F✓"
            else:
                label += " F✗"

            drawn_frames.append(img_drawn)
            frame_labels.append(label)
            frame_data_list.append(frame_entry)

            if fi % 3 == 0:
                l_s = "OK" if l_det else "--"
                r_s = "OK" if r_det else "--"
                f_s = "OK" if face_data and face_data["detected"] else "--"
                print(f"    Frame {frame_idx}: L={l_s} R={r_s} F={f_s}", flush=True)

        cap.release()

        # ── Primary hand analysis ──
        primary_hand = "Left" if total_motion["Left"] >= total_motion["Right"] else "Right"

        # ── Montaje ──
        montage_name = None
        if drawn_frames:
            cols = min(4, len(drawn_frames))
            montage = create_montage(drawn_frames, frame_labels, cols)
            if montage is not None:
                montage_name = f"{word_key}_montaje.jpg"
                cv2.imwrite(str(OUTPUT_DIR / montage_name), montage)

        # ── Guardar frames individuales (si alguna mano detectada) ──
        saved_frames = 0
        for fi, f_entry in enumerate(frame_data_list):
            l_det = f_entry["hands"]["Left"]["detected"]
            r_det = f_entry["hands"]["Right"]["detected"]
            if l_det or r_det:
                fname = f"{word_key}_{fi}_landmarks.jpg"
                cv2.imwrite(str(FRAMES_DIR / fname), drawn_frames[fi])
                saved_frames += 1

        dictionary[word_key] = {
            "word": word_name,
            "module": mod_name,
            "category": cat_name,
            "video": str(vid_path.relative_to(LSEC2_DIR.parent)),
            "total_frames": total_frames,
            "fps": fps,
            "samples": samples,
            "hand_analysis": {
                "primary_hand": primary_hand,
                "left_motion": round(total_motion["Left"], 4),
                "right_motion": round(total_motion["Right"], 4),
            },
            "frames": frame_data_list,
        }

        report_entries.append({
            "word": f"{word_name} ({word_key})",
            "montaje": montage_name or "",
            "hand_total": samples,
            "hand_ok": {
                "left": hand_detected_count["Left"],
                "right": hand_detected_count["Right"],
            },
            "face_ok": face_detected_count,
            "primary_hand": primary_hand,
        })

        print(f"  >> L:{hand_detected_count['Left']}/{samples} R:{hand_detected_count['Right']}/{samples} "
              f"F:{face_detected_count}/{samples} | prim:{primary_hand} "
              f"motion L:{total_motion['Left']:.3f} R:{total_motion['Right']:.3f} | saved:{saved_frames}", flush=True)

    # ── Guardar JSON en lotes numerados (< 100 MB cada uno) ──
    MAX_BATCH_SIZE = 95 * 1024 * 1024  # 95 MB margin
    GESTOS_DIR.mkdir(parents=True, exist_ok=True)

    entries = list(dictionary.items())
    batches = []
    current_batch = {}
    current_size = 0

    for key, entry in entries:
        entry_str = json.dumps({key: entry}, indent=2, ensure_ascii=False)
        entry_size = len(entry_str.encode("utf-8"))

        if current_size + entry_size > MAX_BATCH_SIZE and current_batch:
            batches.append(current_batch)
            current_batch = {}
            current_size = 0

        current_batch[key] = entry
        current_size += entry_size

    if current_batch:
        batches.append(current_batch)

    batch_files = []
    print(f"\n  JSON en lotes en {GESTOS_DIR}/:")
    for idx, batch in enumerate(batches, 1):
        fname = f"diccionario_{idx:02d}.json"
        path = GESTOS_DIR / fname
        with open(path, "w", encoding="utf-8") as f:
            json.dump(batch, f, indent=2, ensure_ascii=False)
        size_mb = path.stat().st_size / (1024 * 1024)
        batch_files.append(fname)
        print(f"    {fname}: {len(batch)} gestos ({size_mb:.1f} MB)")

    batch_stems = [Path(f).stem for f in batch_files]
    with open(GESTOS_DIR / "index.json", "w", encoding="utf-8") as f:
        json.dump(batch_stems, f, indent=2)
    print(f"    index.json: {len(batch_stems)} lotes")

    # ── Reporte HTML ──
    html = generate_report(report_entries)
    report_path = OUTPUT_DIR / "reporte.html"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  HTML: {report_path}")

    # ── Resumen ──
    total_l = sum(g["hand_ok"]["left"] for g in report_entries)
    total_r = sum(g["hand_ok"]["right"] for g in report_entries)
    total_f_ok = sum(g["face_ok"] for g in report_entries)
    total_samples = sum(g["hand_total"] for g in report_entries)

    t_total = time.time() - t_start
    print(f"\n  {'=' * 40}")
    print(f"  Gestos:              {len(report_entries)}")
    print(f"  Mano izquierda:      {total_l}/{total_samples}")
    print(f"  Mano derecha:        {total_r}/{total_samples}")
    print(f"  Mano total:          {total_l+total_r}/{total_samples*2}")
    if total_samples:
        print(f"  Tasa manos:          {(total_l+total_r)/(total_samples*2)*100:.1f}%")
    print(f"  Cara detectada:      {total_f_ok}/{total_samples}")
    if total_samples:
        print(f"  Tasa cara:           {total_f_ok/total_samples*100:.1f}%")
    print(f"  Tiempo total:        {t_total/60:.1f} minutos ({t_total:.0f}s)")
    print(f"  {'=' * 40}")
    print(f"\n  Reporte: http://localhost:8000/{OUTPUT_DIR}/reporte.html")
    print()

    shutil.rmtree(TEMP_DIR, ignore_errors=True)


if __name__ == "__main__":
    main()
