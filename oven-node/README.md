# Oven Dryer Monitor — Node.js + Railway

Sistem baru, lebih simpel: 1 aplikasi Node.js gantiin Grafana + InfluxDB + Telegraf + Node-RED. Broker MQTT tetap HiveMQ Cloud. ESP32 dan alert Telegram **tidak berubah** dari sebelumnya.

```
ESP32 (Modbus RTU ke TK4S) --MQTT (TLS)--> HiveMQ Cloud --MQTT--> Node.js app
                                                                     |  |
                                                                SQLite  Dashboard web
                                                             (histori) (realtime + kontrol)
                                                                     |
                                                              publish balik ke MQTT
                                                              (setpoint/timer/start-stop)
```

## A. Install & jalan di laptop dulu (buat testing sebelum deploy)

1. Install Node.js versi 18 ke atas dari https://nodejs.org (pilih LTS)
2. Buka terminal di folder `oven-node`
3. Install dependency:
   ```
   npm install
   ```
4. Copy `.env.example` jadi `.env`:
   ```
   cp .env.example .env
   ```
5. Buka `.env`, isi:
   - `MQTT_HOST`, `MQTT_USER`, `MQTT_PASSWORD` — sama seperti yang dipakai ESP32, dari HiveMQ Cloud Console
   - `DASH_USER`, `DASH_PASSWORD` — bikin sendiri, ini password buat buka dashboard (WAJIB, dashboard bisa START/STOP mesin)
6. Jalankan:
   ```
   npm start
   ```
7. Buka browser ke `http://localhost:3000`, browser akan minta username/password (isi sesuai `DASH_USER`/`DASH_PASSWORD`)
8. Kalau ESP32 sudah nyala dan publish ke HiveMQ, data suhu langsung muncul realtime di dashboard

Kalau langkah 1-8 sudah jalan normal di laptop, baru lanjut deploy ke Railway.

## B. Deploy ke Railway (supaya online 24 jam, bisa diakses dari HP di mana saja)

### 1. Siapkan kode di GitHub

1. Buat akun GitHub kalau belum punya (https://github.com)
2. Buat repository baru, upload folder `oven-node` ini ke situ (lewat GitHub Desktop atau `git push`)
3. Pastikan file `.env` **tidak ikut ke-upload** (sudah ada di `.gitignore`, aman)

### 2. Buat akun & project Railway

1. Buka https://railway.com, daftar/login (bisa pakai akun GitHub langsung)
2. Klik **New Project** > **Deploy from GitHub repo** > pilih repo yang tadi di-upload
3. Railway otomatis deteksi ini project Node.js dan mulai build

### 3. Isi Environment Variables

1. Di halaman project Railway, klik service yang barusan dibuat > tab **Variables**
2. Tambahkan satu-satu (klik "New Variable"):
   - `MQTT_HOST` = cluster URL HiveMQ Cloud Anda
   - `MQTT_PORT` = `8883`
   - `MQTT_USER` = username HiveMQ Anda
   - `MQTT_PASSWORD` = password HiveMQ Anda
   - `DASH_USER` = username buat login dashboard
   - `DASH_PASSWORD` = password kuat, ini yang melindungi kontrol oven dari orang asing di internet
   - `HISTORY_RETENTION_DAYS` = `30` (opsional)
3. Railway otomatis kasih `PORT`, tidak perlu diisi manual

### 4. Tambah Volume (biar histori suhu tidak hilang tiap deploy ulang)

1. Di service yang sama, tab **Settings** > cari bagian **Volumes**
2. Klik **Add Volume**, mount path isi `/data`
3. Kembali ke tab **Variables**, tambah:
   - `DB_PATH` = `/data/oven.db`
4. Redeploy service (Railway biasanya otomatis redeploy setelah ubah variable)

### 5. Buka aplikasi

1. Tab **Settings** > **Networking** > klik **Generate Domain**
2. Railway kasih URL publik semacam `https://oven-dryer-monitor-production.up.railway.app`
3. Buka URL itu dari HP atau laptop mana saja, login pakai `DASH_USER`/`DASH_PASSWORD`
4. Dashboard sudah HTTPS otomatis dari Railway, aman buat diakses lewat internet

### Estimasi biaya

- Railway Hobby plan: **$5/bulan** (termasuk $5 kredit pemakaian resource)
- App sekecil ini (1 vCPU kecil, RAM di bawah 512MB, volume beberapa MB) biasanya masih masuk dalam kredit $5 tsb kalau trafiknya ringan (1 oven, beberapa user buka dashboard)
- HiveMQ Cloud Free tier tetap gratis, cukup buat 1 device

## B2. Deploy ke VPS Jagoan Hosting (alternatif ke Railway, akses root penuh)

Kalau Anda pakai VPS sendiri (mis. Jagoan Hosting VPS NextGen Nebula, Ubuntu, akses root via SSH) alih-alih Railway, ikuti urutan ini dari nol sampai app jalan permanen dan auto-restart kalau server reboot.

### 1. Login SSH pertama kali

Dari laptop (Windows: pakai PowerShell/Terminal, atau PuTTY):

```
ssh root@ALAMAT_IP_VPS_ANDA
```

- Masukkan password root yang dikirim Jagoan Hosting saat pertama beli VPS
- Kalau ini login pertama, sebaiknya langsung ganti password root:
  ```
  passwd
  ```
- Update dulu paket sistem:
  ```
  apt update && apt upgrade -y
  ```

### 2. Install Node.js versi LTS

Pakai NodeSource repository supaya dapat versi LTS terbaru (misal Node 20.x):

```
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v
```

Project ini juga butuh `build-essential` dan `python3` karena salah satu dependency (`better-sqlite3`) perlu compile native module:

```
apt install -y build-essential python3
```

### 3. Install PM2 (process manager, biar app auto-restart)

```
npm install -g pm2
```

### 4. Install Git & clone project dari GitHub

```
apt install -y git
cd /var/www
git clone https://github.com/NagataRafi/FILES-PKM.git
cd FILES-PKM/oven-node
```

(Folder project ada di dalam `oven-node/` karena repo GitHub-nya membungkus beberapa project, bukan cuma yang ini.)

### 5. Isi file `.env` di server

File `.env` **tidak ikut ke-clone** dari GitHub (memang sengaja, supaya kredensial tidak bocor). Buat manual di server:

```
cp .env.example .env
nano .env
```

Isi persis seperti waktu testing di laptop:
- `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASSWORD` — sama seperti punya ESP32, dari HiveMQ Cloud Console
- `DASH_USER`, `DASH_PASSWORD` — password buat login dashboard (WAJIB diisi, jangan disebar)
- `PORT=3000` (biarkan default, Nginx yang akan meneruskan dari port 80/443 ke sini)

Simpan dengan `Ctrl+O`, Enter, lalu keluar dengan `Ctrl+X`.

### 6. Install dependency & jalankan lewat PM2

```
npm install --omit=dev
pm2 start ecosystem.config.js
```

Cek jalan dengan benar:

```
pm2 status
pm2 logs oven-dryer-monitor
```

Harus muncul baris log `Terhubung ke broker MQTT (HiveMQ Cloud)` dan `Oven Dryer Monitor jalan di port 3000`.

### 7. Supaya PM2 auto-start lagi kalau VPS reboot

```
pm2 save
pm2 startup
```

`pm2 startup` akan menampilkan satu baris perintah (biasanya diawali `sudo env PATH=...`) — copy-paste dan jalankan persis seperti yang ditampilkan. Setelah itu, app akan otomatis jalan lagi tiap kali VPS restart, tanpa perlu SSH manual.

### 8. Pasang Nginx sebagai reverse proxy

```
apt install -y nginx
cp deploy/nginx-oven.conf /etc/nginx/sites-available/oven-dryer
nano /etc/nginx/sites-available/oven-dryer
```

Ganti `ganti-domain-anda.com` dengan domain/subdomain Anda (mis. `oven.domainanda.com`), lalu simpan.

```
ln -s /etc/nginx/sites-available/oven-dryer /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

Pastikan juga domain tersebut sudah diarahkan (DNS A record) ke alamat IP VPS ini — biasanya diatur lewat panel domain/DNS provider Anda, bukan di VPS.

Setelah langkah ini, buka `http://domain-anda.com` dari browser — harus sudah bisa masuk ke dashboard (masih HTTP biasa, belum HTTPS).

### 9. Pasang SSL gratis (Let's Encrypt) via Certbot

```
apt install -y certbot python3-certbot-nginx
certbot --nginx -d ganti-domain-anda.com
```

Ikuti pertanyaan interaktifnya (isi email, setuju ToS). Certbot otomatis mengedit konfigurasi Nginx untuk menambahkan HTTPS dan redirect HTTP ke HTTPS. Sertifikat ini juga otomatis diperpanjang sebelum expired (certbot memasang cron/timer sendiri), tidak perlu diurus manual lagi.

Cek dari browser: `https://domain-anda.com` sudah pakai gembok SSL.

### 10. Update aplikasi di kemudian hari

Setiap kali ada perubahan kode baru di GitHub, tinggal jalankan script bantu yang sudah disiapkan:

```
cd /var/www/FILES-PKM/oven-node
bash deploy/deploy.sh
```

Script ini otomatis `git pull`, `npm install --omit=dev`, lalu `pm2 restart`.

### Ringkasan firewall (opsional tapi disarankan)

Kalau Jagoan Hosting menyediakan firewall/UFW dan ingin diaktifkan, minimal buka port SSH, HTTP, HTTPS supaya tidak terkunci dari luar:

```
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

Port 3000 (app Node.js) **tidak perlu** dibuka ke publik — cukup diakses lewat Nginx di 80/443, karena `proxy_pass` di Nginx mengaksesnya lewat `127.0.0.1:3000` (localhost saja).

## C. Cara pakai dashboard

- **Kartu atas**: suhu TC1/TC2 realtime, status motor, status emergency, sisa timer — update otomatis tiap ada data baru dari ESP32, tanpa refresh
- **Grafik**: suhu vs setpoint, pilih rentang waktu 1 jam / 6 jam / 24 jam / 7 hari
- **Kontrol**:
  - Isi angka di kotak Setpoint TC1/TC2, klik Kirim — divalidasi 0–300°C sebelum dikirim
  - Isi menit di Durasi Timer, klik Set Timer
  - Tombol START/STOP kirim perintah `oven/control`
- Semua request masuk topik MQTT yang sama seperti sebelumnya (`oven/setpoint`, `oven/timer`, `oven/control`), jadi ESP32 **tidak perlu diubah sama sekali**

## D. Troubleshooting

Dashboard kebuka tapi data suhu tidak muncul
- Cek variable `MQTT_HOST`/`MQTT_USER`/`MQTT_PASSWORD` di Railway sama persis dengan yang dipakai ESP32
- Cek log Railway (tab **Deployments** > klik deployment aktif > **View Logs**), harus ada baris "Terhubung ke broker MQTT"
- Pastikan ESP32 memang publish ke topik `oven/status`, cek HiveMQ Cloud Console > Web Client buat lihat traffic langsung

Histori grafik hilang tiap kali deploy ulang
- Berarti Volume di langkah B.4 belum dipasang atau `DB_PATH` belum diarahkan ke `/data/oven.db`

Browser minta username/password terus tidak bisa masuk
- Cek `DASH_USER`/`DASH_PASSWORD` di Railway Variables, harus sama persis (case-sensitive) dengan yang diketik

Setpoint/timer/start-stop tidak direspon mesin
- Cek ESP32 masih konek ke HiveMQ (lihat serial monitor ESP32 atau HiveMQ Web Client)
- Cek watchdog ESP32 tidak lagi fail-safe (motor mati otomatis kalau MQTT putus >15 detik)

Error waktu `npm install` soal `better-sqlite3`
- Butuh koneksi internet buat download binary native, dan environment yang punya build tools dasar. Railway sudah otomatis sediakan ini, tidak perlu setting tambahan

## E. Catatan keselamatan (tetap berlaku, tidak berubah dari sistem sebelumnya)

- Emergency stop tetap wajib jalur hardware langsung ke coil K1, terpisah total dari software apa pun
- TK4S tetap PID controller mandiri, ESP32 dan dashboard ini cuma baca PV dan kirim SV, tidak pernah men-drive SSR langsung
- Dashboard ini bisa mengontrol mesin fisik dari internet — **jangan pernah share `DASH_USER`/`DASH_PASSWORD` sembarangan**, dan jangan matikan basic auth di `server.js`
