# ⚠️ PENTING: PANDUAN UNTUK AI / IMPORTANT: AI CODEBASE INSTRUCTIONS

**BACA INI SEBELUM MELAKUKAN PERUBAHAN APAPUN / READ THIS BEFORE MAKING ANY CHANGES**

Proyek ini memiliki aturan anggaran yang **sangat ketat**. Pemilik telah mengalami tagihan besar yang tidak disengaja di masa lalu (seperti di Render). Semua AI yang bekerja pada codebase ini **WAJIB** mengikuti panduan infrastruktur gratis berikut.

This project has a **strictly zero-budget** constraint. The owner has previously incurred high unexpected bills (e.g., on Render). All AIs assisting on this codebase **MUST** strictly follow these free-tier rules.

---

## 🚫 ATURAN UTAMA / CORE RULES

1. **JANGAN PERNAH menyarankan layanan berbayar**: Jangan merekomendasikan VPS berbayar, database berbayar, server Render berbayar, AWS, Google Cloud, Azure, Vercel Pro, atau upgrade paket Supabase.
2. **GUNAKAN HANYA INFRASTRUKTUR GRATIS / ONLY USE FREE INFRASTRUCTURE**:
   * 🖥️ **Front-End**: Next.js 16 dideploy di **Cloudflare Pages (Free Tier)** dengan mode static export (`output: 'export'`).
   * ⚙️ **Back-End**: FastAPI Python dideploy di **Hugging Face Spaces (Free Docker Space)**.
   * 🗄️ **Database & File Storage**: **Supabase (Free Tier)**.
3. **Optimasi Batasan Kuota**: Jika database atau penyimpanan hampir penuh, buatlah script/kebijakan pembersihan otomatis (cleanup policy) alih-alih menyarankan upgrade layanan. (Contoh: Sistem saat ini otomatis menghapus data job/transaksi yang sudah selesai setelah 7 hari).

---

## 🚀 PANDUAN DEPLOYMENT / DEPLOYMENT WORKFLOW

### A. Backend (Hugging Face Spaces)
Hugging Face Spaces memerlukan folder FastAPI berada di root repository. Namun, proyek ini menggabungkan frontend dan backend dalam satu repo Git. 
Untuk mendeploy ke Hugging Face tanpa mengunggah folder `frontend/` atau file biner `.whl` yang besar (yang ditolak oleh pre-receive hook HF):
1. Buat branch orphan sementara:
   ```bash
   git checkout --orphan deploy-temp
   git rm -rf --cached .
   ```
2. Tambahkan hanya file backend:
   ```bash
   git add app/ Dockerfile requirements.txt .dockerignore .gitattributes README.md
   ```
3. Commit dan force push ke remote `hf` branch `main`:
   ```bash
   git commit -m "deploy: Hugging Face Space backend deployment"
   git push -f hf deploy-temp:main
   ```
4. Kembali ke branch utama dan hapus branch sementara:
   ```bash
   git checkout main
   git branch -D deploy-temp
   ```

### B. Frontend (Cloudflare Pages)
Karena frontend menggunakan static export (`out` folder), variabel lingkungan (seperti `NEXT_PUBLIC_API_URL` yang mengarah ke backend) ditanam **saat proses build (build time)**.
* Jika mendeploy manual dari lokal: Jalankan `npm run deploy:cloudflare` di dalam folder `frontend/` (karena file `.env.production` lokal sudah terkonfigurasi dengan benar).
* Jika menggunakan integrasi Git otomatis di Cloudflare Dashboard: Variabel `NEXT_PUBLIC_API_URL` harus diupdate secara manual di **Cloudflare Pages Project Settings -> Environment Variables** lalu lakukan redeploy.
