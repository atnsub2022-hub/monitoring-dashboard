//tes kode baru
// =========================
// CONFIG
// =========================
const BROKER = "__MQTT_BROKER__";
const PORT = "__MQTT_PORT__";
const USER = "__MQTT_USER__";
const PASS = "__MQTT_PASS__";

const MAX_POINTS = 30;
const TIMEOUT = 5000; // ms

let logBuffer = [];

// =========================
// GET NODE FROM URL
// =========================
const params = new URLSearchParams(window.location.search);
const nodeId = params.get("node") || "unknown";

// =========================
// DOM ELEMENTS
// =========================
const splEl = document.getElementById("spl");
const minEl = document.getElementById("min");
const maxEl = document.getElementById("max");
const avgEl = document.getElementById("avg");
const statusEl = document.getElementById("status");

// =========================
// STATE
// =========================
let lastUpdate = 0;

// =========================
// STATUS LOGIC
// =========================
function updateStatus(spl) {
  if (spl < 60) {
    statusEl.textContent = "STATUS: NORMAL";
    splEl.style.color = "#22C55E";
  } else if (spl < 80) {
    statusEl.textContent = "STATUS: WARNING";
    splEl.style.color = "#FACC15";
  } else {
    statusEl.textContent = "STATUS: DANGER";
    splEl.style.color = "#EF4444";
  }
}

// =========================
// PERSISTENCE: LOAD CACHE
// =========================
const saved = JSON.parse(localStorage.getItem(`cache_${nodeId.toUpperCase()}`));

if (saved && splEl) {
  splEl.textContent = saved.val; // Tampilkan angka terakhir
  const subtitleEl = document.querySelector(".subtitle");
  if (subtitleEl) {
    subtitleEl.textContent = `Realtime Sound Pressure Level | Last Updated: ${saved.date} ${saved.time}`;
  }
  // Optional: Update warna status berdasarkan nilai terakhir
  updateStatus(parseFloat(saved.val));
}

// update title (optional)
document.querySelector("h1").textContent = "Node: " + nodeId;



// =========================
// STATS
// =========================
function updateStats() {
  const data = splData.datasets[0].data;
  if (data.length === 0) return;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const sum = data.reduce((a, b) => a + b, 0);
  const avg = sum / data.length;

  if (minEl) minEl.textContent = min.toFixed(1);
  if (maxEl) maxEl.textContent = max.toFixed(1);
  if (avgEl) avgEl.textContent = avg.toFixed(1);
}

// =========================
// CHART SETUP
// =========================
const ctx = document.getElementById("splChart").getContext("2d");

const splData = {
  labels: [],
  datasets: [{
    label: "SPL (dB)",
    data: [],
    borderColor: "#22C55E",
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 2,
    tension: 0.3,
    fill: true,
    pointRadius: 1
  }]
};

const splChart = new Chart(ctx, {
  type: "line",
  data: splData,
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: { display: false },
      y: {
        min: 0,
        max: 100,
        ticks: { color: "#94A3B8" }
      }
    },
    plugins: {
      legend: { display: false }
    }
  }
});

// =========================
// MQTT SETUP (PAHO)
// =========================
const client = new Paho.MQTT.Client(
  BROKER,
  Number(PORT), //Mengubah string menjadi angka port
  "detail_" + nodeId + "_" + Math.random()
);

// connection lost
client.onConnectionLost = function (responseObject) {
  console.warn("MQTT lost:", responseObject.errorMessage);
  statusEl.textContent = "STATUS: DISCONNECTED";
};

// message handler
client.onMessageArrived = function (message) {
  const payload = message.payloadString;

  let spl;

  // fleksibel parsing
  try {
    const data = JSON.parse(payload);
    spl = data.spl ?? data.value ?? parseFloat(payload);
  } catch {
    spl = parseFloat(payload);
  }

  if (spl !== undefined && !isNaN(spl)) {
    const timestamp = new Date().toLocaleString();
    logBuffer.push({ time: timestamp, spl: spl.toFixed(1) });

//batasi logbuffernya agar tidak terlalu berat
    if (logBuffer.length > 5000) logBuffer.shift();
  }

  if (isNaN(spl)) return;

  lastUpdate = Date.now();

  // update UI
  splEl.textContent = spl.toFixed(1);
  updateStatus(spl);


  // 2. LOGIKA BARU: Update Timestamp di Subtitle
  const now = new Date(); //Ambil waktu sistem

  // Format Tanggal: 06/04/26
  const dateStr = now.toLocaleDateString('id-ID', { 
    day: '2-digit', 
    month: '2-digit', 
    year: '2-digit' 
  });
  
  // Format Jam: 11:29 AM
  const timeStr = now.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

    // SIMPAN KE LOCAL STORAGE
  const cacheData = {
    val: spl.toFixed(1),
    time: timeStr,
    date: dateStr
  };
  localStorage.setItem(`cache_${nodeId.toUpperCase()}`, JSON.stringify(cacheData));

  // Update elemen subtitle agar sinkron dengan Overview
  const subtitleEl = document.querySelector(".subtitle");
  if (subtitleEl) {
    subtitleEl.textContent = `Realtime Sound Pressure Level | Updated: ${dateStr} ${timeStr}`;
  }

  splData.labels.push(timeStr);
  splData.datasets[0].data.push(spl);

  if (splData.labels.length > MAX_POINTS) {
    splData.labels.shift();
    splData.datasets[0].data.shift();
  }

  updateStats();
  splChart.update();
};

// connect
function onConnect() {
  console.log("MQTT connected (detail)");

  statusEl.textContent = "STATUS: CONNECTED";

  const topic = `monitoring/${nodeId}/db`;
  client.subscribe(topic);
}

// connect options
client.connect({
  userName: USER,
  password: PASS,
  useSSL: true,
  onSuccess: onConnect,
  // reconnect: true
});

// =========================
// OFFLINE WATCHDOG
// =========================
setInterval(() => {
  if (lastUpdate !== 0 && (Date.now() - lastUpdate > TIMEOUT)) {
    statusEl.textContent = "STATUS: OFFLINE";
    statusEl.style.color = "#94A3B8"; // Beri warna redup saat offline
    
    // JANGAN mereset splEl ke "--" di sini agar persistence terjaga
  }
}, 2000);

//Fungsi Download Log CSV 
function downloadCSV() {
  if (logBuffer.length === 0) {
    alert('Belum ada data terkumpul untuk diunduh!');
    return;
  }

  //Ambil waktu sistem
  const now = new Date(); 

  //Format tanggal: 07-05-26 (Ganti '/' menjadi '-' agar aman untuk nama file)
  const dateFile = now.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  }).replace(/\//g, '-');

  // Format Jam: 11:29 AM
  const timeFile = now.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit'
  }).replace(':', '-');

//Susun isi CSV 
  let csvContent = '"Timestamp","SPL (dBA)"\n';
  logBuffer.forEach(row => {
    csvContent += `"${row.time}","${row.spl}"\n`;
  });

  const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);


  const link = document.createElement("a");
  link.setAttribute("href", url);

  link.setAttribute("download", `${nodeId}_${dateFile}_${timeFile}_log.csv`);
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

//mengingatkan pengguna untuk ekspor csv dan menahannya sebelum refresh/keluar halaman
window.addEventListener('beforeunload', function (e) {
  // Hanya kunci halaman jika logBuffer sudah berisi data sensor
  if (logBuffer.length > 0) {
    const pesanPeringatan = "CSV belum diekspor. Yakin ingin keluar?";
    
    // Memasukkan teks sesuai keinginan Anda (untuk kompatibilitas)
    e.returnValue = pesanPeringatan; 
    return pesanPeringatan;
  }
});


const toggleSwitch = document.querySelector('#theme-toggle');

/**
 * Fungsi Sinkronisasi: Memastikan visual tombol = data di localStorage
 */
function syncTheme() {
    const currentTheme = localStorage.getItem('theme');
    
    if (currentTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        // Validasi: Jika data 'dark', pastikan tombol terpilih (checked)
        if (toggleSwitch) toggleSwitch.checked = true;
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        // Validasi: Jika data 'light' atau kosong, pastikan tombol tidak terpilih
        if (toggleSwitch) toggleSwitch.checked = false;
    }
}

// Jalankan sinkronisasi saat halaman pertama kali dimuat atau kembali dari back button
window.addEventListener('pageshow', (event) => {
    syncTheme();
});

// Event listener untuk perubahan manual saat tombol diklik
toggleSwitch.addEventListener('change', (e) => {
    if (e.target.checked) {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    }
});
