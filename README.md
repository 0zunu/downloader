# Downloader

A simple Flask-based media downloader using `yt-dlp`.

## Deskripsi

Proyek ini menyediakan antarmuka web untuk menganalisis URL media dan mengunduh konten dari berbagai situs. Backend menggunakan Flask, sedangkan unduhan dikelola oleh `yt-dlp` dengan dukungan progress monitoring.

## Fitur

- Analisis URL untuk menampilkan informasi media
- Dukungan unduhan video, audio, dan gambar
- Pengaturan resolusi / kualitas
- Proses unduhan latar belakang dengan progress polling
- Penanganan fallback jika `ffmpeg` tidak tersedia

## Struktur File

```
downloader/
├── app.py                # Aplikasi Flask utama dan worker yt-dlp
├── requirements.txt      # Dependensi Python
├── README.md             # Dokumentasi proyek
├── downloads/            # Folder output unduhan
├── static/               # Asset frontend
│   ├── style.css
│   └── js/
│       └── main.js
└── templates/
    └── index.html        # Halaman UI utama
```

## Instalasi

1. Buat environment Python baru:

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

3. Pasang dependensi:

```bash
pip install -r requirements.txt
```

## Menjalankan

```bash
python app.py
```

Lalu buka browser ke `http://127.0.0.1:5000`.

## Catatan

- Jika `ffmpeg` tidak terpasang, unduhan akan berfungsi tetapi penggabungan format audio/video akan dinonaktifkan.
- Direktori `downloads/` digunakan untuk menyimpan hasil unduhan.
