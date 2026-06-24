# Downloader

Aplikasi web sederhana untuk mengunduh media dari berbagai situs menggunakan Flask dan `yt-dlp`.

## Deskripsi

Proyek ini menyediakan antarmuka front-end yang mudah digunakan untuk menganalisis URL media dan mengunduh video, audio, atau gambar.

Backend ditulis dengan Flask, sementara unduhan dikelola oleh `yt-dlp` dalam thread terpisah dan dilengkapi dengan sistem polling progress.

## Fitur

- Analisis metadata URL media tanpa mengunduh
- Unduhan video, audio, dan gambar dari banyak sumber
- Pilihan resolusi, format, codec, dan kualitas audio
- Download async di background thread
- Progress polling real-time dengan informasi kecepatan/ETA
- Fallback otomatis jika `ffmpeg` tidak tersedia
- Cleanup otomatis untuk file yang sudah lebih dari 1 jam

## Struktur Proyek

```
downloader/
├── app.py                # Aplikasi Flask utama dan worker yt-dlp
├── requirements.txt      # Dependensi Python
├── README.md             # Dokumentasi proyek
├── downloads/            # Folder hasil unduhan
├── static/               # Asset frontend
│   ├── style.css
│   └── js/
│       └── main.js
└── templates/
    └── index.html        # Halaman UI utama
```

## Persyaratan

- Python 3.9+ atau lebih baru
- `yt-dlp`
- `Flask`
- `Flask-Cors`
- Opsional: `ffmpeg` untuk penggabungan audio/video dan konversi format

## Instalasi

1. Buat virtual environment:

```bash
python -m venv venv
```

2. Aktifkan environment:

- Windows:
  ```bash
  venv\Scripts\activate
  ```
- macOS / Linux:
  ```bash
  source venv/bin/activate
  ```

3. Instal dependensi:

```bash
pip install -r requirements.txt
```

## Menjalankan aplikasi

```bash
python app.py
```

Buka browser dan pergi ke `http://127.0.0.1:5000` untuk menggunakan UI downloader.

## Variabel Lingkungan

- `RENDER_DISK_PATH` (opsional): jika diatur, aplikasi akan menyimpan hasil unduhan di path tersebut. Jika tidak, akan menggunakan folder lokal `downloads/`.

## Endpoint API

- `POST /api/info` — Ambil metadata media dari URL tanpa mengunduh
- `POST /api/download` — Mulai unduhan async
- `GET /api/progress/<task_id>` — Periksa progress unduhan
- `GET /api/download-file/<task_id>` — Ambil file hasil unduhan ketika selesai
- `DELETE /api/cleanup/<task_id>` — Hapus task dan folder unduhan

## Penggunaan

1. Masukkan URL media di UI.
2. Klik "Analisis URL" untuk melihat metadata dan format yang tersedia.
3. Pilih jenis media, format, dan opsi kualitas.
4. Mulai unduhan dan tunggu progress sampai selesai.
5. Klik tombol simpan ketika file sudah siap.

## Catatan

- Jika `ffmpeg` tidak ditemukan, aplikasi tetap dapat mengunduh file, tetapi opsi penggabungan dan ekstraksi audio/video mungkin dibatasi.
- Folder `downloads/` menyimpan hasil unduhan sementara, dan file lama akan dibersihkan otomatis jika sudah lebih dari satu jam.
- Gunakan `gunicorn` atau server produksi lain jika ingin menjalankan di lingkungan deployment.
