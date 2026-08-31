// ===================================================================
// OVEN DRYER MONITOR - server.js
// Gantiin: Mosquitto/HiveMQ (tetap dipakai sbg broker) + Telegraf + InfluxDB + Grafana + Node-RED
// Jadi 1 aplikasi Node.js: subscribe MQTT, simpan histori SQLite, dashboard realtime, kirim command
// ===================================================================

require("dotenv").config();

const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mqtt = require("mqtt");
const Database = require("better-sqlite3");
const basicAuth = require("express-basic-auth");

// ---------- KONFIGURASI DARI ENV ----------
const PORT = process.env.PORT || 3000;

const MQTT_HOST = process.env.MQTT_HOST; // contoh: xxxxxxxx.s1.eu.hivemq.cloud
const MQTT_PORT = process.env.MQTT_PORT || 8883;
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

const DASH_USER = process.env.DASH_USER;
const DASH_PASSWORD = process.env.DASH_PASSWORD;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "oven.db");
const HISTORY_RETENTION_DAYS = Number(process.env.HISTORY_RETENTION_DAYS || 30);

const TOPIC_STATUS = "oven/status";
const TOPIC_SETPOINT = "oven/setpoint";
const TOPIC_TIMER = "oven/timer";
const TOPIC_CONTROL = "oven/control";

const MIN_SV = 0;
const MAX_SV = 300;

if (!MQTT_HOST || !MQTT_USER || !MQTT_PASSWORD) {
  console.error("ERROR: MQTT_HOST / MQTT_USER / MQTT_PASSWORD belum diisi di environment variable.");
  process.exit(1);
}
if (!DASH_USER || !DASH_PASSWORD) {
  console.error("ERROR: DASH_USER / DASH_PASSWORD belum diisi. Dashboard ini mengontrol mesin fisik, wajib dilindungi password.");
  process.exit(1);
}

// ---------- DATABASE (SQLite, gantiin InfluxDB) ----------
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    tc1_pv REAL, tc2_pv REAL,
    tc1_sv REAL, tc2_sv REAL,
    motor_running INTEGER,
    emergency_active INTEGER,
    timer_running INTEGER,
    timer_remaining_sec INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings(ts);
`);

const insertReading = db.prepare(`
  INSERT INTO readings (ts, tc1_pv, tc2_pv, tc1_sv, tc2_sv, motor_running, emergency_active, timer_running, timer_remaining_sec)
  VALUES (@ts, @tc1_pv, @tc2_pv, @tc1_sv, @tc2_sv, @motor_running, @emergency_active, @timer_running, @timer_remaining_sec)
`);

function pruneOldReadings() {
  const cutoff = Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare("DELETE FROM readings WHERE ts < ?").run(cutoff);
}
setInterval(pruneOldReadings, 6 * 60 * 60 * 1000); // bersihkan tiap 6 jam

// ---------- STATE TERAKHIR (buat client yang baru konek) ----------
let latestStatus = null;

// ---------- EXPRESS + SOCKET.IO ----------
const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server);

// Dashboard dilindungi basic auth (device ini bisa START/STOP mesin fisik, jangan dibiarkan terbuka)
app.use(
  basicAuth({
    users: { [DASH_USER]: DASH_PASSWORD },
    challenge: true,
    realm: "Oven Dryer Monitor",
  })
);

app.use(express.static(path.join(__dirname, "public")));

// ---------- MQTT CLIENT ----------
const mqttClient = mqtt.connect(`mqtts://${MQTT_HOST}:${MQTT_PORT}`, {
  username: MQTT_USER,
  password: MQTT_PASSWORD,
  clientId: "oven_node_dashboard_" + Math.random().toString(16).slice(2, 8),
  reconnectPeriod: 5000,
});

mqttClient.on("connect", () => {
  console.log("Terhubung ke broker MQTT: " + MQTT_HOST);
  mqttClient.subscribe(TOPIC_STATUS, (err) => {
    if (err) console.error("Gagal subscribe oven/status:", err.message);
  });
});

mqttClient.on("error", (err) => {
  console.error("MQTT error:", err.message);
});

mqttClient.on("message", (topic, payload) => {
  if (topic !== TOPIC_STATUS) return;

  let data;
  try {
    data = JSON.parse(payload.toString());
  } catch (e) {
    console.error("Payload oven/status bukan JSON valid:", payload.toString());
    return;
  }

  const row = {
    ts: Date.now(),
    tc1_pv: data.tc1_pv ?? null,
    tc2_pv: data.tc2_pv ?? null,
    tc1_sv: data.tc1_sv ?? null,
    tc2_sv: data.tc2_sv ?? null,
    motor_running: data.motor_running ? 1 : 0,
    emergency_active: data.emergency_active ? 1 : 0,
    timer_running: data.timer_running ? 1 : 0,
    timer_remaining_sec: data.timer_remaining_sec ?? 0,
  };

  try {
    insertReading.run(row);
  } catch (e) {
    console.error("Gagal simpan ke SQLite:", e.message);
  }

  latestStatus = { ...data, ts: row.ts };
  io.emit("status", latestStatus);
});

io.on("connection", (socket) => {
  if (latestStatus) socket.emit("status", latestStatus);
});

// ---------- API: histori untuk grafik ----------
app.get("/api/history", (req, res) => {
  const hours = Math.min(Number(req.query.hours) || 6, 24 * 30);
  const since = Date.now() - hours * 60 * 60 * 1000;

  const rows = db
    .prepare(
      `SELECT ts, tc1_pv, tc2_pv, tc1_sv, tc2_sv
       FROM readings WHERE ts >= ? ORDER BY ts ASC`
    )
    .all(since);

  res.json(rows);
});

app.get("/api/latest", (req, res) => {
  res.json(latestStatus || {});
});

// ---------- API: kontrol (publish ke MQTT) ----------
app.post("/api/setpoint", (req, res) => {
  const { tc1, tc2 } = req.body;
  const payload = {};

  if (tc1 !== undefined) {
    const v = Number(tc1);
    if (isNaN(v) || v < MIN_SV || v > MAX_SV) {
      return res.status(400).json({ error: `tc1 harus antara ${MIN_SV} dan ${MAX_SV}` });
    }
    payload.tc1 = v;
  }
  if (tc2 !== undefined) {
    const v = Number(tc2);
    if (isNaN(v) || v < MIN_SV || v > MAX_SV) {
      return res.status(400).json({ error: `tc2 harus antara ${MIN_SV} dan ${MAX_SV}` });
    }
    payload.tc2 = v;
  }
  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ error: "isi tc1 dan/atau tc2" });
  }

  mqttClient.publish(TOPIC_SETPOINT, JSON.stringify(payload));
  res.json({ ok: true, sent: payload });
});

app.post("/api/timer", (req, res) => {
  const minutes = Number(req.body.minutes);
  if (isNaN(minutes) || minutes <= 0 || minutes > 480) {
    return res.status(400).json({ error: "menit harus antara 1 dan 480" });
  }
  mqttClient.publish(TOPIC_TIMER, JSON.stringify({ minutes }));
  res.json({ ok: true, minutes });
});

app.post("/api/control", (req, res) => {
  const action = String(req.body.action || "").toUpperCase();
  if (action !== "START" && action !== "STOP") {
    return res.status(400).json({ error: "action harus START atau STOP" });
  }
  mqttClient.publish(TOPIC_CONTROL, action);
  res.json({ ok: true, action });
});

server.listen(PORT, () => {
  console.log(`Oven Dryer Monitor jalan di port ${PORT}`);
});
