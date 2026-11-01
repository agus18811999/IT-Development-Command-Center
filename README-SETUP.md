# IT Development Command Center — Panduan instalasi

## Struktur proyek

```
IT-PROJECT-MANAGER/
├── index.html            # login, register, forgot password
├── verify.html           # email verification dan reset password
├── main.html             # dashboard & 20 menu
├── config.js             # konfigurasi publik dan API client
├── api/
│   └── proxy.js          # Vercel Function, proxy HTTPS untuk menghindari CORS Apps Script
└── BACKEND/
    └── Code.gs           # TEMPel isi file ke editor Google Apps Script
```

**WAJIB:** Semua file frontend dan `api/proxy.js` ditempel/diubah di **Visual Studio Code**. Hanya isi `BACKEND/Code.gs` yang ditempel di editor Google Apps Script. Folder `BACKEND` tidak perlu dideploy ke Vercel; jika repo publik, hapus folder ini dari deployment sumber untuk membatasi eksposur implementasi backend (jangan pernah taruh secret di source code).

## 1 — Google Sheets

1. Buat Google Sheets baru, contohnya **IT Command Center Database**.
2. Dari URL `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit` salin bagian `SPREADSHEET_ID`.
3. Tidak perlu membuat tab/kolom manual. Setup Apps Script akan membuat 20 tab dan header.
4. Jangan berbagi akses edit spreadsheet kepada pengguna aplikasi, karena Apps Script bertindak sebagai pemilik file database.

## 2 — Firebase Authentication

1. Buka Firebase Console, buat project Firebase baru, lalu tambahkan Web App untuk mendapatkan **Web API Key** (di Project Settings).
2. Pilih **Authentication → Sign-in method → Email/Password → Enable**.
3. Untuk produksi, atur Authentication → Settings → Authorized domains sesuai domain aplikasi, misalnya `project-anda.vercel.app`. Aktifkan perlindungan penyalahgunaan dan batas kuota yang relevan.
4. Buka **Authentication → Templates** lalu **Customize action URL** agar email verifikasi/reset membuka `https://domain-anda.vercel.app/verify.html`. Firebase akan menambahkan parameter `mode` dan `oobCode` pada URL.
5. Sesuaikan nama dan template email pada Firebase Console. Versi ini **menggunakan email Firebase Authentication**, bukan MailApp, sehingga token/tautan satu kali pakai ditangani layanan auth terkelola.
6. Tempel Web API Key (nilai **publik**) ke `FIREBASE_WEB_API_KEY` di `config.js`. Jangan gunakan Firebase Admin SDK secret atau service account key di frontend.

### Password & email

- Firebase mengelola hash password, verifikasi email, reset password, dan login.
- `verify.html?mode=verifyEmail&oobCode=...` memverifikasi email, sedangkan `verify.html?mode=resetPassword&oobCode=...` menampilkan form password baru.
- Halaman profil dapat mengubah email (memerlukan password lama, kemudian verifikasi email baru) atau password. Untuk keamanan tinggi, pertimbangkan policy reauthentication dan login multi-device pada pengembangan lanjutan.

## 3 — Google Apps Script (`Code.gs`)

1. Dari Google Sheets pilih **Extensions → Apps Script**.
2. Tempel seluruh kode `BACKEND/Code.gs` pada satu file `Code.gs`. Hapus kode bawaan `myFunction()` jika ada.
3. Klik **Project Settings → Script Properties**, buat dua properti:

   | Property | Value |
   |---|---|
   | `SPREADSHEET_ID` | ID dari URL spreadsheet yang dibuat |
   | `FIREBASE_WEB_API_KEY` | Firebase Web API Key yang sama dengan `config.js` |

4. Pilih fungsi **`setupITCommandCenter`** di toolbar lalu klik **Run**. Setujui authorization untuk spreadsheet dan panggilan HTTPS ke Firebase.
5. Lihat **Execution log**. Pesan yang diharapkan: `READY: ... | 20 sheets`.
6. Klik **Deploy → New deployment → Web app**, pilih **Execute as: Me** dan **Who has access: Anyone**. Deploy dan salin alamat yang berakhiran `/exec`.
7. Jangan gunakan URL `/dev`, karena itu hanya untuk editor/akun tertentu. Bila `Code.gs` diubah, lakukan **Deploy → Manage deployments → Edit → New version → Deploy**.

### Mengapa Web App dapat diakses Anyone?

Karena endpoint membutuhkan validasi **Firebase ID token** dan **server session** pada setiap API call. Ini bukan berarti semua user boleh mengakses spreadsheet. Ownership `ownerUid` diverifikasi di backend. Jangan pernah hanya mempercayai `uid` dari browser.

## 4 — Vercel Function sebagai API proxy

Browser tidak dapat diandalkan untuk melakukan `fetch()` cross-origin langsung ke Apps Script, termasuk penanganan preflight/redirect ContentService. `api/proxy.js` berjalan **di server Vercel**, menggunakan `GAS_WEB_APP_URL` dari environment variable dan mengembalikan JSON ke browser melalui origin yang sama.

1. Buat proyek di Vercel dari folder `IT-PROJECT-MANAGER` (atau Git repo berisi folder ini).
2. Di **Project Settings → Environment Variables**, tambahkan:

   | Variable | Value | Environments |
   |---|---|---|
   | `GAS_WEB_APP_URL` | URL deployment Google Apps Script yang berakhir `/exec` | Development, Preview, Production yang digunakan |

3. Redeploy setelah menambahkan variable. Jangan menulis URL `/exec` berulang di HTML; `config.js` menggunakan `/api/proxy`.
4. Jangan mengisi `API_URL` dengan URL Apps Script langsung. Gunakan `API_URL:'/api/proxy'`.
5. Pada Vercel Static Site (framework preset **Other**), file HTML akan dihosting sebagai file statis, dan `api/proxy.js` disajikan sebagai Vercel Function.
6. Buka `https://nama-project.vercel.app/index.html` untuk halaman login.

**Catatan keamanan:** Proxy ini mengharuskan token Firebase tetapi bukan layanan rate limiting / WAF penuh. Firebase memberi perlindungan autentikasi tertentu. Tambahkan rate limits di edge jika aplikasi sangat publik atau mengalami abuse. Google Apps Script/Sheets memiliki kuota, limit eksekusi, dan latency yang membuat target seluruh request 1 detik tidak bisa dijamin.

## 5 — Buka dan jalankan di Visual Studio Code

Buka folder hasil ekstraksi ZIP di **VS Code**. VS Code digunakan untuk mengedit keempat file frontend serta proxy Vercel. Untuk uji API lokal yang sama-origin, gunakan Vercel CLI:

```bash
npm install -g vercel
vercel login
vercel link
vercel pull
vercel dev
```

Buka alamat lokal yang ditampilkan Vercel CLI (umumnya `http://localhost:3000`). `vercel pull` diperlukan saat environment variable dibuat/diubah. **Jangan uji API hanya dengan membuka `index.html` menggunakan `file://` atau Live Server**, karena `/api/proxy` harus ditangani Vercel Function.

## 6 — Siklus uji lengkap

Setiap langkah beri hasil **PASS** hanya setelah benar-benar diuji di lingkungan Anda.

| Pengujian | Hasil yang diharapkan |
|---|---|
| App shell | `index.html` dan `main.html` dapat dibuka dari origin Vercel; halaman protected tidak memperlihatkan data tanpa sesi |
| Register | Email baru berhasil terdaftar; email verifikasi terkirim; belum bisa membuka dashboard sebelum verified |
| Verify email | Tautan `verify.html` memvalidasi code dan memberi feedback sesuai status |
| Login | Akun verified login dan dibuatkan sesi backend |
| Logout | Session backend dicabut; browser kembali ke login |
| Forgot password | Email reset terkirim bila email ditemukan; reset code bisa dipakai sekali |
| Change email | Password lama dikonfirmasi, email baru butuh verifikasi |
| Change password | Password baru berlaku pada autentikasi Firebase |
| Profile | Nama/bio tersimpan ke tab `Users` |
| User isolation | User A tidak dapat membaca/mengubah Project ID milik User B; akun baru kosong |
| Create project | Baris baru muncul di `Projects` setelah request sukses |
| Edit / delete | Data diperbarui/soft deleted di Sheets tanpa page reload |
| Archive / restore | Proyek beralih antara view Active dan Archived |
| Duplicate | Proyek baru disalin dengan ID baru (tanpa menyalin child records) |
| Workspace | Detail per Project ID memuat arsitektur, spesifikasi, milestone, checklist |
| 13 technical registries | CRUD dapat digunakan di 13 registri metadata (technology, hosting, repository, bug, features, version, API, DB, domain, docs, snippet, resource, cost) |
| Activity | Setiap create/update/delete memunculkan aktivitas yang benar |
| Analytics | Chart kosong ketika data kosong, mencerminkan data asli ketika terisi |
| Search / filter | Daftar merespons keyword dan Project ID; pagination bekerja |
| Cost reporting | Monthly/annual estimate dipisahkan berdasarkan mata uang |
| CSV export | File CSV valid dan dapat dibuka dalam spreadsheet |
| JSON backup/import | Backup terunduh; import menambahkan salinan dengan ID proyek baru |
| Error handling | Gagal API tidak memunculkan toast sukses palsu |
| Mobile | Pada lebar 320/375/390px sidebar dan drawer dapat digulir tanpa overflow horizontal |
| Performance | Catat First Contentful Paint dan response di Browser DevTools / Apps Script Execution log; jangan menganggap 1 detik terjamin |

## 7 — Kendala umum

- **HTTP 502 `UPSTREAM_INVALID`**: periksa `GAS_WEB_APP_URL`, access Anyone, endpoint `/exec`, dan deployment versi terbaru. Coba buka URL `/exec` di browser dan pastikan status JSON muncul.
- **`NOT_CONFIGURED`**: environment variable Vercel belum ada atau belum redeploy.
- **`DB_NOT_READY`**: jalankan `setupITCommandCenter()` setelah mengisi Script Properties.
- **`EMAIL_UNVERIFIED`**: verifikasi email atau kirim ulang dari halaman login.
- **`UNAUTHORIZED`**: login ulang (ID token / sesi berakhir).
- **`ARCHIVED`**: restore proyek terlebih dahulu sebelum menambah/mengubah catatan terkait.
- **`403 / CORS`**: hindari fetch langsung ke Apps Script dari browser. Gunakan same-origin Vercel Function `/api/proxy`.
- **Chart kosong**: periksa data proyek; chart hanya menampilkan statistik yang benar-benar tersimpan.
- **Waktu response lambat**: periksa quota Apps Script, jumlah data tab Sheets, dan jarak lokasi deployment Vercel. Rendering awal dibuat ringan tetapi waktu respons backend dapat jauh lebih dari 1 detik.

## 8 — Batasan rilis ini

- Tidak ada deployment otomatis ke GitHub/Vercel; modul bersifat **registry**, bukan integrasi API eksternal.
- Domain dan SSL bukan pemeriksaan live; tanggal kadaluarsa berdasarkan entri pengguna.
- Dokumen/snippet adalah teks aman (`pre`/escape HTML), belum rich-text WYSIWYG atau syntax highlighting otomatis.
- Export JSON menyertakan profil, preferensi, serta activity log sebagai referensi, tetapi import hanya menyalin 16 tabel proyek dan record terkait, tidak menulis ulang profil/riwayat lama.
- Backup/import menyimpan **metadata**; gambar eksternal, repositori, dan file server tidak dicadangkan. Import adalah merge-copy dan tidak mendukung rollback transaksional lintas sheet.
- Query Sheets memakai scan terfilter per tabel; cocok untuk pengembangan pribadi dan skala ringan, bukan database relasional besar.
- Project list dan picker dibatasi 100 item saat memuat dropdown; tambahkan pencarian server-side jika jumlah proyek bertambah banyak.
- Firebase token dan sesi disimpan browser storage. Ini **bukan** mekanisme httpOnly-cookie. Hardening untuk aplikasi publik meliputi Content Security Policy, proteksi XSS, cookie server-side, WAF/rate limits, audit logging, pengujian keamanan, dan pentest sebelum memuat data sensitif.
- Sesi server akan kedaluwarsa maksimal 30 hari dan dapat di-revoke saat logout berhasil. Cache auth identity hingga 60 detik dan cache sesi hingga 45 detik; token yang telah dicabut bisa memiliki masa tunda sesuai cache jika dicabut di luar aplikasi.
- Tailwind CDN digunakan untuk kemudahan paste-run; untuk produksi bertrafik tinggi, kompilasikan Tailwind build statis dan hapus browser CDN.
- Ini **implementasi fungsional untuk diuji**, bukan sistem production-ready yang diaudit keamanan, bukan jaminan 1 detik untuk setiap request.

## Referensi resmi

- Firebase Auth REST API: https://firebase.google.com/docs/reference/rest/auth
- Firebase custom email action handler: https://firebase.google.com/docs/auth/custom-email-handler
- Apps Script Content Service redirects: https://developers.google.com/apps-script/guides/content
- Vercel Functions: https://vercel.com/docs/functions/runtimes/node-js
- Vercel CLI for development: https://vercel.com/docs/cli/dev
