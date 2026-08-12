# Oven Dryer Monitor — Node.js + VPS

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

Kalau langkah 1-8 sudah jalan normal di laptop, baru lanjut deploy ke VPS.

## B. Deploy ke VPS Jagoan Hosting

Hosting yang dipakai adalah **VPS Jagoan Hosting (paket VPS NextGen Nebula), Ubuntu, akses root via SSH**. Ikuti urutan ini dari nol sampai app jalan permanen dan auto-restart kalau server reboot.

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

### Estimasi biaya

- VPS Jagoan Hosting paket **NextGen Nebula**: mulai **Rp100.000/bulan** — 2 core CPU, 2GB RAM, 40GB storage
- Bisa dibayar per siklus bulanan, 3 bulan, 6 bulan, atau tahunan; harga perpanjangan sama dengan harga awal (tidak naik)
- App sekecil ini (1 vCPU, RAM di bawah 512MB, database SQLite beberapa MB) jauh di bawah kapasitas paket Nebula, jadi masih longgar buat nambah project lain di VPS yang sama kalau perlu
- HiveMQ Cloud Free tier tetap gratis, cukup buat 1 device
- Domain (kalau belum punya) beli terpisah, biasanya Rp15.000–Rp150.000/tahun tergantung ekstensi; sertifikat SSL dari Let's Encrypt via Certbot **gratis**

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
- Cek isi file `.env` di server (folder `oven-node`, lihat langkah B.5) — `MQTT_HOST`/`MQTT_USER`/`MQTT_PASSWORD` harus sama persis dengan yang dipakai ESP32
- Cek log PM2: `pm2 logs oven-dryer-monitor`, harus ada baris "Terhubung ke broker MQTT"
- Pastikan ESP32 memang publish ke topik `oven/status`, cek HiveMQ Cloud Console > Web Client buat lihat traffic langsung

Histori grafik hilang
- Berarti file `oven.db` di server ke-hapus atau `DB_PATH` di `.env` berubah-ubah. Selama folder project di VPS tidak dihapus/dipindah dan `DB_PATH` tidak diubah, histori tersimpan permanen di disk VPS (beda dari hosting yang filesystem-nya di-reset tiap deploy)
- Kalau butuh backup, tinggal copy file `oven.db` dari server (mis. pakai `scp`)

Browser minta username/password terus tidak bisa masuk
- Cek `DASH_USER`/`DASH_PASSWORD` di file `.env` di server, harus sama persis (case-sensitive) dengan yang diketik, lalu `pm2 restart oven-dryer-monitor --update-env` setelah ubah `.env`

Setpoint/timer/start-stop tidak direspon mesin
- Cek ESP32 masih konek ke HiveMQ (lihat serial monitor ESP32 atau HiveMQ Web Client)
- Cek watchdog ESP32 tidak lagi fail-safe (motor mati otomatis kalau MQTT putus >15 detik)

Error waktu `npm install` soal `better-sqlite3`
- Butuh koneksi internet buat download binary native, dan `build-essential`/`python3` sudah terpasang (lihat langkah B.2). Kalau masih gagal, jalankan `apt install -y build-essential python3` lalu `npm install --omit=dev` ulang

App tidak jalan lagi setelah VPS di-reboot
- Pastikan sudah menjalankan `pm2 save` dan perintah dari `pm2 startup` (lihat langkah B.7) — tanpa ini, PM2 tidak otomatis start lagi setelah reboot

## E. Catatan keselamatan (tetap berlaku, tidak berubah dari sistem sebelumnya)

- Emergency stop tetap wajib jalur hardware langsung ke coil K1, terpisah total dari software apa pun
- TK4S tetap PID controller mandiri, ESP32 dan dashboard ini cuma baca PV dan kirim SV, tidak pernah men-drive SSR langsung
- Dashboard ini bisa mengontrol mesin fisik dari internet — **jangan pernah share `DASH_USER`/`DASH_PASSWORD` sembarangan**, dan jangan matikan basic auth di `server.js`
