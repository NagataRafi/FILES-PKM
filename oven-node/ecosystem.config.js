// Konfigurasi PM2 - lihat README bagian "Deploy ke VPS Jagoan Hosting"
// Jalankan dengan: pm2 start ecosystem.config.js
// Variabel rahasia (MQTT_HOST, DASH_PASSWORD, dll) TETAP diisi lewat file .env,
// bukan di sini, supaya tidak ikut ke-commit ke git.

module.exports = {
  apps: [
    {
      name: "oven-dryer-monitor",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
