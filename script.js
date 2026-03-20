let bpm = 100;
let isPlaying = false;
let timer = null;
let soundType = "click"; // 初期値
let isDragging = false;

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
  const mid1 = 100;
  const mid2 = 140;
  const max = 200;

  let hue;

  if (bpm <= mid1) {
    // 緑 → 水色（60〜100）
    const t = (bpm - min) / (mid1 - min);
    hue = 130 + (70 * t); // 130(緑) → 200(水色)

  } else if (bpm <= mid2) {
    // 水色 → 黄色（100〜140）
    const t = (bpm - mid1) / (mid2 - mid1);
    hue = 200 - (140 * t); // 200(水色) → 60(黄色)

  } else {
    // 黄色 → 赤（140〜200）
    const t = (bpm - mid2) / (max - mid2);
    hue = 60 - (60 * t); // 60(黄色) → 0(赤)
  }

  // デザイン調整✨
  let saturation = 75; // 彩度（低めで柔らかく）
  let lightness = 50; // 明るさ（高めでパステル）


  // 高速は危険感🔥
  if (bpm > 170) {
    saturation = 85;
    lightness = 50;
  }

  // 低速はやさしく🌿
  if (bpm < 80) {
    saturation = 65;
    lightness = 65;
  }

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

  if (isPlaying && !isDragging) {
    stop();
    start();
  }
}

/* =========================
   イベント
========================= */

// スライダー触り始め
slider.addEventListener("mousedown", () => {
  isDragging = true;
});

slider.addEventListener("touchstart", () => {
  isDragging = true;
});

slider.addEventListener("input", (e) => {
  isDragging = true;
  updateBpm(parseInt(e.target.value));
});

// マウス離す（PC）
slider.addEventListener("change", () => {
  isDragging = false;
});

// スマホ対応（重要🔥）
slider.addEventListener("touchend", () => {
  isDragging = false;
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
  if (isDragging) return;
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