# Downloader

A simple web application to download media from various sites using Flask and `yt-dlp`.

## Description

This project provides an easy-to-use front-end interface for analyzing media URLs and downloading videos, audio, or images.

The backend is written with Flask, while downloads are managed by `yt-dlp` in a separate thread and equipped with a progress polling system.

## Features

- Analyze media URL metadata without downloading
- Download videos, audio, and images from many sources
- Resolution, format, codec, and audio quality options
- Async download in background thread
- Real-time progress polling with speed/ETA information
- Automatic fallback if `ffmpeg` is not available
- Automatic cleanup for files older than 1 hour

## Project Structure

```
downloader/
├── app.py                # Main Flask application and yt-dlp worker
├── requirements.txt      # Python dependencies
├── README.md             # Project documentation
├── downloads/            # Download results folder
├── static/               # Frontend assets
│   ├── style.css
│   └── js/
│       └── main.js
└── templates/
    └── index.html        # Main UI page
```

## Requirements

- Python 3.9+ or newer
- `yt-dlp`
- `Flask`
- `Flask-Cors`
- Optional: `ffmpeg` for audio/video merging and format conversion

## Installation

1. Create a virtual environment:

```bash
python -m venv venv
```

2. Activate the environment:

- Windows:
  ```bash
  venv\Scripts\activate
  ```
- macOS / Linux:
  ```bash
  source venv/bin/activate
  ```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

## Running the application

```bash
python app.py
```

Open your browser and go to `http://127.0.0.1:5000` to use the downloader UI.

## Environment Variables

- `RENDER_DISK_PATH` (optional): if set, the application will save download results to that path. Otherwise, it will use the local `downloads/` folder.

## API Endpoints

- `POST /api/info` — Retrieve media metadata from URL without downloading
- `POST /api/download` — Start async download
- `GET /api/progress/<task_id>` — Check download progress
- `GET /api/download-file/<task_id>` — Retrieve downloaded file when complete
- `DELETE /api/cleanup/<task_id>` — Delete task and download folder

## Usage

1. Enter media URL in the UI.
2. Click "Analyze URL" to see available metadata and formats.
3. Select media type, format, and quality options.
4. Start download and wait for progress to complete.
5. Click the save button when the file is ready.

## Notes

- If `ffmpeg` is not found, the application can still download files, but merging and audio/video extraction options may be limited.
- The `downloads/` folder stores temporary download results, and old files will be automatically cleaned up if they are older than one hour.
- Use `gunicorn` or another production server if you want to run in a deployment environment.
