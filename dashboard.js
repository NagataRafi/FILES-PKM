const socket = io();
const badge = document.getElementById("conn-badge");

socket.on("connect", () => {
  badge.textContent = "Online";
  badge.className = "badge online";
});
socket.on("disconnect", () => {
  badge.textContent = "Terputus";
  badge.className = "badge offline";
});

socket.on("status", (data) => {
  document.getElementById("tc1-pv").textContent = fmt(data.tc1_pv);
  document.getElementById("tc2-pv").textContent = fmt(data.tc2_pv);
  document.getElementById("tc1-sv").textContent = fmt(data.tc1_sv);
  document.getElementById("tc2-sv").textContent = fmt(data.tc2_sv);

  const motorEl = document.getElementById("motor-status");
  motorEl.textContent = data.motor_running ? "RUNNING" : "STOPPED";
  motorEl.className = "card-value " + (data.motor_running ? "status-ok" : "");

  const emgEl = document.getElementById("emergency-status");
  emgEl.textContent = data.emergency_active ? "AKTIF" : "Normal";
  emgEl.className = "card-value " + (data.emergency_active ? "status-alert" : "status-ok");

  const timerEl = document.getElementById("timer-remaining");
  timerEl.textContent = data.timer_running ? formatDuration(data.timer_remaining_sec) : "--";
});

function fmt(v) {
  return v === undefined || v === null ? "--" : Number(v).toFixed(1);
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${s}s`;
}

// ---------- CHART HISTORI ----------
const ctx = document.getElementById("tempChart").getContext("2d");
const chart = new Chart(ctx, {
  type: "line",
  data: {
    datasets: [
      { label: "TC1 PV", data: [], borderColor: "#ff9a3d", backgroundColor: "transparent", tension: 0.2, pointRadius: 0, borderWidth: 2 },
      { label: "TC2 PV", data: [], borderColor: "#3ddc84", backgroundColor: "transparent", tension: 0.2, pointRadius: 0, borderWidth: 2 },
      { label: "TC1 SV", data: [], borderColor: "#ff9a3d", backgroundColor: "transparent", borderDash: [4, 4], tension: 0, pointRadius: 0, borderWidth: 1 },
      { label: "TC2 SV", data: [], borderColor: "#3ddc84", backgroundColor: "transparent", borderDash: [4, 4], tension: 0, pointRadius: 0, borderWidth: 1 },
    ],
  },
  options: {
    responsive: true,
    animation: false,
    scales: {
      x: { type: "time", time: { unit: "minute" }, ticks: { color: "#8b95a3" }, grid: { color: "#2a3038" } },
      y: { ticks: { color: "#8b95a3" }, grid: { color: "#2a3038" }, title: { display: true, text: "°C", color: "#8b95a3" } },
    },
    plugins: {
      legend: { labels: { color: "#eef1f5" } },
    },
  },
});

async function loadHistory() {
  const hours = document.getElementById("range-select").value;
  const res = await fetch(`/api/history?hours=${hours}`);
  const rows = await res.json();

  chart.data.datasets[0].data = rows.map((r) => ({ x: r.ts, y: r.tc1_pv }));
  chart.data.datasets[1].data = rows.map((r) => ({ x: r.ts, y: r.tc2_pv }));
  chart.data.datasets[2].data = rows.map((r) => ({ x: r.ts, y: r.tc1_sv }));
  chart.data.datasets[3].data = rows.map((r) => ({ x: r.ts, y: r.tc2_sv }));
  chart.update();
}

document.getElementById("range-select").addEventListener("change", loadHistory);
loadHistory();
setInterval(loadHistory, 30000); // refresh grafik tiap 30 detik

// ---------- KONTROL ----------
function showToast(msg, type) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast " + type;
  setTimeout(() => { el.textContent = ""; el.className = "toast"; }, 3000);
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Gagal kirim perintah");
  return data;
}

async function sendSetpoint(which) {
  const val = document.getElementById(`input-${which === "tc1" ? "sv1" : "sv2"}`).value;
  if (val === "") return showToast("Isi angka dulu", "error");
  try {
    const data = await postJSON("/api/setpoint", { [which]: val });
    showToast(`Setpoint ${which.toUpperCase()} terkirim: ${data.sent[which]}°C`, "success");
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function sendTimer() {
  const minutes = document.getElementById("input-timer").value;
  try {
    await postJSON("/api/timer", { minutes });
    showToast(`Timer diset ${minutes} menit`, "success");
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function sendControl(action) {
  try {
    await postJSON("/api/control", { action });
    showToast(`Perintah ${action} terkirim`, "success");
  } catch (e) {
    showToast(e.message, "error");
  }
}
