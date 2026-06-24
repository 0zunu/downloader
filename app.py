"""
MediaFetch Backend — Flask + yt-dlp
Mendukung unduhan gambar, video, dan audio dari 100+ situs
"""

import os
import uuid
import json
import threading
import time
import shutil
from pathlib import Path

from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS
import yt_dlp

app = Flask(__name__)
CORS(app)

# Gunakan path dari env var RENDER_DISK_PATH jika ada, jika tidak, fallback ke "downloads"
# Ini memungkinkan kita menggunakan Render Disk di produksi dan folder lokal saat development.
DOWNLOAD_DIR = Path(os.environ.get("RENDER_DISK_PATH", "downloads"))
DOWNLOAD_DIR.mkdir(exist_ok=True)

# Simpan progress tiap task
tasks: dict[str, dict] = {}
tasks_lock = threading.Lock()


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def make_task_id() -> str:
    return str(uuid.uuid4())


def progress_hook(task_id: str):
    """Kembalikan closure hook untuk yt-dlp."""
    def hook(d):
        if d["status"] == "downloading":
            total   = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            speed   = d.get("speed") or 0
            eta     = d.get("eta") or 0
            pct     = (downloaded / total * 100) if total else 0
            
            with tasks_lock:
                tasks[task_id].update({
                    "status":     "downloading",
                    "progress":   round(pct, 1),
                    "speed":      format_bytes(speed) + "/s" if speed else "—",
                    "size":       format_bytes(total) if total else "—",
                    "eta":        f"{eta}s" if eta else "—",
                    "downloaded": format_bytes(downloaded),
                })

        elif d["status"] == "finished":
            with tasks_lock:
                tasks[task_id]["status"] = "processing"
                tasks[task_id]["progress"] = 99

    return hook


def format_bytes(b: float) -> str:
    if b < 1024:
        return f"{b:.0f} B"
    elif b < 1024 ** 2:
        return f"{b/1024:.1f} KB"
    elif b < 1024 ** 3:
        return f"{b/1024**2:.1f} MB"
    return f"{b/1024**3:.2f} GB"


def resolution_to_ytdlp_format(media_type: str, resolution: str, fmt: str, codec: str = "h264") -> str:
    """Konversi pilihan resolusi UI ke format string yt-dlp."""
    if media_type == "audio":
        bitrate_map = {
            "128 kbps": "ba[abr<=128]",
            "192 kbps": "ba[abr<=192]",
            "256 kbps": "ba[abr<=256]",
            "320 kbps": "ba[abr<=320]",
            "Lossless": "ba",
        }
        return bitrate_map.get(resolution, "ba/bestaudio")

    if resolution in ("Terbaik", "Original", "∞", ""):
        return "bestvideo+bestaudio/best"

    height_map = {
        "360p": 360, "480p": 480, "720p": 720,
        "1080p": 1080, "1440p": 1440, "4K": 2160, "8K": 4320,
        "SD": 480, "HD": 720, "Full HD": 1080, "4K UHD": 2160, "8K UHD": 4320,
    }
    h = height_map.get(resolution)
    if h:
        return f"bestvideo[height<={h}]+bestaudio/best[height<={h}]"
    return "bestvideo+bestaudio/best"


def ext_for_format(fmt: str, media_type: str) -> str:
    ext_map = {
        "MP4": "mp4", "WebM": "webm", "MKV": "mkv", "AVI": "avi",
        "MOV": "mov", "FLV": "flv", "TS": "ts", "3GP": "3gp",
        "MP3": "mp3", "AAC": "m4a", "FLAC": "flac", "WAV": "wav",
        "OGG": "ogg", "OPUS": "opus", "M4A": "m4a", "AIFF": "aiff",
        "JPEG": "jpg", "PNG": "png", "WebP": "webp", "AVIF": "avif",
        "TIFF": "tiff", "BMP": "bmp", "SVG": "svg", "RAW": "raw",
    }
    return ext_map.get(fmt.upper(), "mp4")


# ─────────────────────────────────────────────
# Worker thread
# ─────────────────────────────────────────────

def download_worker(task_id: str, url: str, media_type: str,
                    fmt: str, resolution: str, quality: str,
                    codec: str, color_space: str, audio_opt: str):
    task_dir = DOWNLOAD_DIR / task_id
    task_dir.mkdir(parents=True, exist_ok=True)

    ydl_opts: dict = {
        "outtmpl":        str(task_dir / "%(title)s.%(ext)s"),
        "progress_hooks": [progress_hook(task_id)],
        "noplaylist":     True,
        "retries":        3,
        "quiet":          True,
        "no_warnings":    True,
    }

    # Detect whether ffmpeg is available; yt-dlp needs ffmpeg to merge
    ffmpeg_available = shutil.which('ffmpeg') is not None or shutil.which('ffmpeg.exe') is not None
    if not ffmpeg_available:
        with tasks_lock:
            tasks[task_id].update({"warning": "ffmpeg not found on server — merging disabled"})

    try:
        if media_type == "image":
            # Coba unduh sebagai gambar langsung
            ydl_opts["format"] = "best"
            ydl_opts["writethumbnail"] = True

        elif media_type == "audio":
            ext = ext_for_format(fmt, "audio")
            ydl_opts["format"] = resolution_to_ytdlp_format("audio", resolution, fmt)
            ydl_opts["postprocessors"] = [{
                "key":            "FFmpegExtractAudio",
                "preferredcodec": ext if ext not in ("m4a",) else "aac",
                "preferredquality": quality.split()[0] if quality else "192",
            }]

        else:  # video
            ydl_opts["format"] = resolution_to_ytdlp_format("video", resolution, fmt, codec)
            ext = ext_for_format(fmt, "video")
            merge_fmt = ext if ext in ("mp4", "mkv", "webm") else "mp4"
            # Only set merge output format if ffmpeg is available; otherwise avoid requesting merging
            if ffmpeg_available:
                ydl_opts["merge_output_format"] = merge_fmt
            else:
                # If the format requests multiple streams (video+audio) but ffmpeg is missing,
                # pick the primary video component to avoid yt-dlp trying to merge and failing.
                fstr = ydl_opts["format"]
                if "+" in fstr:
                    ydl_opts["format"] = fstr.split("+")[0]

            if audio_opt == "Tanpa Audio (Mute)":
                ydl_opts["format"] = ydl_opts["format"].split("+")[0]

        # Jalankan download
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                title = info.get("title", "media") if info else "media"
        except yt_dlp.utils.DownloadError as e:
            # Retry fallback for sites like Pinterest with no direct video formats
            if media_type == "video" and "no video formats found" in str(e).lower():
                ydl_opts.pop("merge_output_format", None)
                ydl_opts["format"] = "best"
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                    title = info.get("title", "media") if info else "media"
            else:
                raise

        # Temukan file hasil
        files = list(task_dir.glob("*"))
        files = [f for f in files if f.is_file()]
        if not files:
            raise FileNotFoundError("File tidak ditemukan setelah unduhan")

        result_file = sorted(files, key=lambda x: x.stat().st_size, reverse=True)[0]

        with tasks_lock:
            tasks[task_id].update({
                "status":    "done",
                "progress":  100,
                "filename":  result_file.name,
                "filepath":  str(result_file),
                "title":     title,
                "filesize":  format_bytes(result_file.stat().st_size),
                "eta":       "0s",
            })

    except yt_dlp.utils.DownloadError as e:
        with tasks_lock:
            tasks[task_id].update({"status": "error", "error": str(e)})
    except Exception as e:
        with tasks_lock:
            tasks[task_id].update({"status": "error", "error": str(e)})


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/info", methods=["POST"])
def get_info():
    """Ambil metadata URL tanpa mengunduh."""
    data = request.get_json()
    url  = (data or {}).get("url", "").strip()
    if not url:
        return jsonify({"error": "URL tidak boleh kosong"}), 400

    try:
        ydl_opts = {
            "quiet":       True,
            "no_warnings": True,
            "skip_download": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        formats = []
        for f in (info.get("formats") or []):
            formats.append({
                "format_id": f.get("format_id"),
                "ext":       f.get("ext"),
                "width":     f.get("width"),
                "height":    f.get("height"),
                "fps":       f.get("fps"),
                "vcodec":    f.get("vcodec"),
                "acodec":    f.get("acodec"),
                "filesize":  format_bytes(f["filesize"]) if f.get("filesize") else "—",
                "tbr":       f.get("tbr"),
            })

        return jsonify({
            "title":     info.get("title"),
            "thumbnail": info.get("thumbnail"),
            "duration":  info.get("duration"),
            "uploader":  info.get("uploader"),
            "view_count":info.get("view_count"),
            "formats":   formats[-20:],          # kirim 20 format terakhir saja
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/download", methods=["POST"])
def start_download():
    """Mulai unduhan di background thread."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Body kosong"}), 400

    url        = data.get("url", "").strip()
    media_type = data.get("media_type", "video")    # image | video | audio
    fmt        = data.get("format", "MP4")
    resolution = data.get("resolution", "1080p")
    quality    = data.get("quality", "85%")
    codec      = data.get("codec", "h264")
    color_space= data.get("color_space", "sRGB")
    audio_opt  = data.get("audio", "Dengan Audio (AAC)")

    if not url:
        return jsonify({"error": "URL tidak boleh kosong"}), 400

    task_id = make_task_id()
    with tasks_lock:
        tasks[task_id] = {
            "status":     "queued",
            "progress":   0,
            "speed":      "—",
            "size":       "—",
            "eta":        "—",
            "filename":   None,
            "error":      None,
            "created_at": time.time(),
        }

    t = threading.Thread(
        target=download_worker,
        args=(task_id, url, media_type, fmt, resolution,
              quality, codec, color_space, audio_opt),
        daemon=True,
    )
    t.start()

    return jsonify({"task_id": task_id})


@app.route("/api/progress/<task_id>")
def get_progress(task_id: str):
    """Polling progress endpoint."""
    with tasks_lock:
        task = tasks.get(task_id)
        if not task:
            return jsonify({"error": "Task tidak ditemukan"}), 404
        return jsonify(task)


@app.route("/api/download-file/<task_id>")
def download_file(task_id: str):
    """Kirimkan file hasil unduhan ke browser."""
    with tasks_lock:
        task = tasks.get(task_id)
        if not task or task["status"] != "done":
            return jsonify({"error": "File belum siap"}), 404

        filepath = task.get("filepath")
        if not filepath or not Path(filepath).exists():
            return jsonify({"error": "File tidak ditemukan"}), 404

    return send_file(
        filepath,
        as_attachment=True,
        download_name=task.get("filename", "download"),
    )


@app.route("/api/cleanup/<task_id>", methods=["DELETE"])
def cleanup(task_id: str):
    """Hapus folder task dari disk."""
    task_dir = DOWNLOAD_DIR / task_id
    if task_dir.exists():
        shutil.rmtree(task_dir, ignore_errors=True)
    with tasks_lock:
        tasks.pop(task_id, None)
    return jsonify({"deleted": True})


@app.route("/api/tasks")
def list_tasks():
    """Daftar semua task aktif (untuk debug)."""
    with tasks_lock:
        return jsonify(tasks)


# ─────────────────────────────────────────────
# Auto-cleanup: hapus file > 1 jam
# ─────────────────────────────────────────────

def auto_cleanup():
    while True:
        time.sleep(3600)  # Cek setiap jam
        now = time.time()
        
        with tasks_lock:
            # Buat salinan task ID untuk diiterasi
            task_ids_to_check = list(tasks.keys())
            
            for task_id in task_ids_to_check:
                task = tasks.get(task_id)
                if not task:
                    continue

                is_old = (now - task.get("created_at", now)) > 3600
                is_final_state = task.get("status") in ("done", "error")

                if is_old and is_final_state:
                    task_dir = DOWNLOAD_DIR / task_id
                    if task_dir.exists():
                        shutil.rmtree(task_dir, ignore_errors=True)
                    
                    # Hapus dari dictionary utama
                    tasks.pop(task_id, None)


threading.Thread(target=auto_cleanup, daemon=True).start()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)