let bpm = 100;
let isPlaying = false;
let timer = null;
let soundType = 0;

// Web Audio API（再利用）
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

const bpmEl = document.getElementById("bpm");
const slider = document.getElementById("slider");
const playBtn = document.getElementById("playBtn");

const sounds = document.querySelectorAll(".sound");

// BPM更新
function updateBpm(val) {
  bpm = Math.min(200, Math.max(60, val));
  bpmEl.textContent = bpm;
  slider.value = bpm;

  if (isPlaying) {
    stop();
    start();
  }
}

// ＋ −
document.getElementById("plus").onclick = () => updateBpm(bpm + 1);
document.getElementById("minus").onclick = () => updateBpm(bpm - 1);

// スライダー
slider.addEventListener("input", e => {
  updateBpm(parseInt(e.target.value));
});

// 再生
playBtn.onclick = () => {
  initAudio(); // ← ユーザー操作で初期化（超重要）

  isPlaying ? stop() : start();
};

function start() {
  isPlaying = true;
  playBtn.textContent = "■";

  timer = setInterval(playSound, 60000 / bpm);
}

function stop() {
  isPlaying = false;
  playBtn.textContent = "▶";
  clearInterval(timer);
}

// 音（改善版）
function playSound() {
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const freqs = [
    1000,
    600,
    300,
    1200,
    Math.random() * 1000 + 300
  ];

  osc.frequency.value = freqs[soundType];

  // クリックっぽくする
  gain.gain.setValueAtTime(1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.08);
}

// サウンド切替
sounds.forEach((btn, index) => {
  btn.onclick = () => {
    soundType = index;

    sounds.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  };
});
