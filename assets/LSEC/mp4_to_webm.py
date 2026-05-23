import os
import subprocess

INPUT_DIR = "./gestos"
OUTPUT_DIR = "./gestoswebm"

os.makedirs(OUTPUT_DIR, exist_ok=True)

for file in os.listdir(INPUT_DIR):
    if file.lower().endswith(".mp4"):
        name = os.path.splitext(file)[0]
        input_path = os.path.join(INPUT_DIR, file)
        output_path = os.path.join(OUTPUT_DIR, f"{name}.webm")

        print(f"=== Procesando {file} ===")

        cmd = [
            "ffmpeg",
            "-i", input_path,
            "-c:v", "libvpx-vp9",
            "-b:v", "0",
            "-crf", "32",
            "-pix_fmt", "yuv420p",
            "-an",
            output_path
        ]

        print(">>", " ".join(cmd))
        subprocess.run(cmd)