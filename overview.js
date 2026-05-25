// =========================
// CONFIG & STATE
// =========================
//sebagai contoh, ubah sendiri sesuai konfigurasi HIVEMQ MQTT broker
const BROKER = "__MQTT_BROKER__";
const PORT = "__MQTT_PORT__";
const USER = "__MQTT_USER__";
const PASS = "__MQTT_PASS__";

const TIMEOUT = 10000; // ms → dianggap offline

// 1. Tentukan daftar gate yang dimiliki, hardcoded
const INITIAL_NODES = ["GATE1", "GATE2", "GATE3", "GATE4", "GATE5", "GATE6" ];
// const INITIAL_NODES = raw_nodes.map(node => node.toUpperCase());
const nodes = {}; 


//DOM
const grid = document.getElementById("grid");


// =========================
// CREATE CARD (Living Card)
// =========================
function createCard(nodeId) {
  // CEK APAKAH ADA INGATAN LAMA?
  const saved = JSON.parse(localStorage.getItem(`cache_${nodeId}`));
    
  // Jika ada, pakai itu sebagai default, jika tidak pakai "--"
  const displayVal = saved ? saved.val : "--";
  const displayTime = saved ? `Last Updated: ${saved.date}<br>${saved.time}` : "Last updated: Never";
  const initialClass = saved ? "card offline" : "card offline"; // Tetap offline sampai MQTT masuk
// Jika ada data lama, kita biarkan status visualnya 'offline' tapi angkanya ada

  console.log("Membuat kartu untuk:", nodeId);
  //mencegah duplikasi jika card sudah diinisialisasi
  if (nodes[nodeId]) return;

  const el = document.createElement("div");
  
  el.className = "card offline"; //kondisi default offline

  el.innerHTML = `
  <div class="card-header">
        <div class="node-badge">${nodeId.replace('gate', '').toUpperCase()}</div>
        <div class="status-indicator">
            <span class="status-text">OFFLINE</span>
            <div class="status-dot"></div>
        </div>
  </div>

  <div class="card-body">
        <div class="main-stat">
            <h2 class="value">${displayVal}</h2>
            <span class="unit">dBA</span>
        </div>
        <div class="trend-indicator trend-neutral">
            <span class="trend-icon">--</span>
            <span class="trend-pct">--%</span>        
        </div>
  </div>

  <div class="card-footer">
        <span class="last-seen">${displayTime}</span>
  </div>
  `;

  el.onclick = () => {
    window.location.href = `dashboard.html?node=${nodeId}`;
  };

  grid.appendChild(el);

  nodes[nodeId] = {
    value: saved ? parseFloat(saved.val) : null, // Masukkan nilai lama ke memori agar tren akurat    lastUpdate: 0, //langsung dianggap Watchdog offline
    el: el,
    previousValue: saved ? parseFloat(saved.val) : null //dibutuhkan untuk menghitung tren
  };
}

//Fungsi untuk inisialisasi card saat startup, biar instan
function initDashboard() {
  INITIAL_NODES.forEach(nodeId => {
    createCard(nodeId);
  });
}

initDashboard();

function updateCard(nodeId, value) {
    if (!nodes[nodeId]) createCard(nodeId);
    const node = nodes[nodeId];
  
    // 1. Hitung Tren (%)
    let trendPct = 0;
    let trendIcon = "•";
    let trendClass = "trend-neutral";
  
    if (node.previousValue !== null && node.previousValue !== 0) {
        trendPct = ((value - node.previousValue) / node.previousValue) * 100;
        if (value > node.previousValue) {
            trendIcon = "▲";
            trendClass = "trend-up"; // Merah: Kebisingan naik itu buruk
        } else if (value < node.previousValue) {
            trendIcon = "▼";
            trendClass = "trend-down"; // Hijau: Kebisingan turun itu baik
        }
    }
  
    // 2. Update State
    node.previousValue = value; 
    node.value = value;
    node.lastUpdate = Date.now();
  
    // 3. Update UI
    const el = node.el;
  
    //Angka Utama
    el.querySelector(".value").textContent = value.toFixed(1);
    
    // Update tren dengan class warna
    const trendContainer = el.querySelector(".trend-indicator");
    trendContainer.className = `trend-indicator ${trendClass}`;
    el.querySelector(".trend-pct").textContent = Math.abs(trendPct).toFixed(1) + "%";
    el.querySelector(".trend-icon").textContent = trendIcon;
  
    // Update Status & Time
    el.querySelector(".status-text").textContent = "ONLINE";
    
    const now = new Date(); //ambil waktu sekarang
    // Format Tanggal: 06/04/26
    const dateStr = now.toLocaleDateString('id-ID', { 
      day: '2-digit', 
      month: '2-digit', 
      year: '2-digit' 
    });

    // Format Jam: 11:20 AM
    const timeStr = now.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });    

    // Gabungkan menjadi "Updated: 06/04/26 11:20 AM"
    el.querySelector(".last-seen").innerHTML = `Updated: ${dateStr}<br>${timeStr}`;
  
    // 4. Update Level Bahaya (Card Border/Glow)
    el.classList.remove("online", "warning", "danger", "offline");
    if (value > 80) el.classList.add("danger", "online");
    else if (value > 60) el.classList.add("warning", "online");
    else el.classList.add("online");

// SIMPAN KE STORAGE (Gunakan variabel yang sudah ada agar sinkron)
    const cacheData = {
      val: value.toFixed(1),
      time: timeStr,
      date: dateStr
    };
      localStorage.setItem(`cache_${nodeId}`, JSON.stringify(cacheData));
  }

// =========================
// OFFLINE WATCHDOG
// =========================
function checkOffline() {
  const now = Date.now();

  Object.keys(nodes).forEach(nodeId => {
    const node = nodes[nodeId];

// Jika lewat timeout, ubah UI ke state offline    
    if (now - node.lastUpdate > TIMEOUT) {
      const el = node.el;

     //Perbaiki selector agar tidak null
     const statusText = el.querySelector(".status-text");
     if (statusText) statusText.textContent = "OFFLINE";

     el.classList.remove("online", "warning", "danger");
     el.classList.add("offline");
    }
  });
}

// Jalankan pengecekan setiap 2 detik
setInterval(checkOffline, 2000);

// =========================
// MQTT SETUP (PAHO)
// =========================
const client = new Paho.MQTT.Client(
  BROKER,
  Number(PORT), //mengubah string menjadi angka port
  "overview_" + Math.random()
);

// connection lost
client.onConnectionLost = function (responseObject) {
  console.warn("MQTT lost:", responseObject.errorMessage);
};

// message handler
client.onMessageArrived = function (message) {
  const topic = message.destinationName;
  const payload = message.payloadString;

  // Ekstrak nodeId dari topic monitoring/nodeId/db
  // contoh topic: monitoring/gate1/db
  const nodeId = topic.split("/")[1].toUpperCase();

  let value;

  // fleksibel parsing
  try {
    const data = JSON.parse(payload);
    value = data.spl ?? data.value ?? parseFloat(payload);
  } catch {
    value = parseFloat(payload);
  }

  if (!isNaN(value)) {
  updateCard(nodeId, value);
  }
};

// connect
function onConnect() {
  console.log("MQTT connected (overview)");

  // wildcard → semua node
  client.subscribe("monitoring/+/db"); //subscribe ke semua node
}

client.connect({
  userName: USER,
  password: PASS,
  useSSL: true,
  onSuccess: onConnect,
//   reconnect: true
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
