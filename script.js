let bpm = 100;
let isPlaying = false;
let timer = null;
let soundType = "click"; // 初期値

// 要素取得
const bpmEl = document.getElementById("bpm");
const slider = document.getElementById("slider");
const playBtn = document.getElementById("playBtn");
const plusBtn = document.querySelector(".plus");
const minusBtn = document.querySelector(".minus");

const soundButtons = document.querySelectorAll(".sound");

soundButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    soundType = btn.dataset.sound;

    // active切り替え
    soundButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// AudioContext
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  // 強制再開（Promise無視でOK）
  audioCtx.resume().then(() => {
    console.log("Audio resumed:", audioCtx.state);
  });
}

/* =========================
   色（BPMに応じて変化）
========================= */
function getColorByBpm(bpm) {
  const min = 60;
  const max = 200;

  const ratio = (bpm - min) / (max - min);

  let hue;

  if (ratio < 0.5) {
    const t = ratio / 0.5;
    hue = 140 + (60 * t); // 緑 → 青
  } else {
    const t = (ratio - 0.5) / 0.5;
    hue = 200 + (120 * t); // 青 → ピンク
  }

  const saturation = 70;
  const lightness = 55;

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/* =========================
   色適用
========================= */
function applyColor() {
  const color = getColorByBpm(bpm);

  playBtn.style.background = color;
  slider.style.setProperty("--thumb-color", color);
  slider.style.setProperty("--slider-color", color + "55");
}

/* =========================
   BPM更新
========================= */
function updateBpm(val) {
  bpm = Math.min(200, Math.max(60, val));

  bpmEl.textContent = bpm;
  slider.value = bpm;

  applyColor();

  if (isPlaying) {
    stop();
    start();
  }
}

/* =========================
   イベント
========================= */

// スライダー
slider.addEventListener("input", (e) => {
  updateBpm(parseInt(e.target.value));
});

// ＋ −
plusBtn.addEventListener("click", () => {
  updateBpm(bpm + 1);
});

minusBtn.addEventListener("click", () => {
  updateBpm(bpm - 1);
});

// 再生ボタン
playBtn.addEventListener("click", () => {
  initAudio();

  // iOS対策：無音でもいいから1回鳴らす🔥
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime); // ほぼ無音

  osc.start();
  osc.stop(audioCtx.currentTime + 0.01);

  // 通常処理
  if (isPlaying) {
    stop();
  } else {
    start();
  }
});

document.body.addEventListener("touchstart", initAudio, { once: true });

/* =========================
   再生制御
========================= */
function start() {
  isPlaying = true;
  playBtn.textContent = "■";

  playSound(); 

  timer = setInterval(playSound, 60000 / bpm);
}

function stop() {
  isPlaying = false;
  playBtn.textContent = "▶";
  clearInterval(timer);
}

/* =========================
   音 + 鼓動
========================= */

function playSound() {
  if (!audioCtx) return;

  console.log("playSound", audioCtx?.state);

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  // 鼓動
  playBtn.classList.add("beat");
  setTimeout(() => {
    playBtn.classList.remove("beat");
  }, 100);

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  // ===== サウンド分岐 =====
  if (soundType === "beep") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(1000, audioCtx.currentTime);

  } else if (soundType === "wood") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);

  } else {
    osc.type = "square";
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  }

  // ===== 音量しっかり出す🔥 =====
  gain.gain.setValueAtTime(1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    audioCtx.currentTime + 0.12 // ← 少し長く
  );

  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.12);
}

/* =========================
   初期化
========================= */
updateBpm(bpm);