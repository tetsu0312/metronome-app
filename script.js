let bpm = 100;
let isPlaying = false;
let timer = null;
let soundType = "click";
let isDragging = false;

// 要素取得
const bpmEl = document.getElementById("bpm");
const slider = document.getElementById("slider");
const playBtn = document.getElementById("playBtn");
const plusBtn = document.querySelector(".plus");
const minusBtn = document.querySelector(".minus");
const soundButtons = document.querySelectorAll(".sound");

// AudioContext
let audioCtx = null;

/* =========================
   Audio 初期化（iOS対策）
========================= */
async function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: "interactive",
    });
  }

  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }

  // iOS向け：無音バッファを1回流して音声出力を解放
const buffer = audioCtx.createBuffer(1, 1, 22050);
const source = audioCtx.createBufferSource();
source.buffer = buffer;
source.connect(audioCtx.destination);

try {
  source.start(0);
} catch (e) {
  console.log("unlock error", e);
}
}

/* =========================
   色（BPMに応じて変化）
   60: 緑 / 100: 水色 / 140: 黄色 / 200: 赤
========================= */
function getColorByBpm(currentBpm) {
  const min = 60;
  const mid1 = 100;
  const mid2 = 140;
  const max = 200;

  let hue;

  if (currentBpm <= mid1) {
    // 緑 → 水色（60〜100）
    const t = (currentBpm - min) / (mid1 - min);
    hue = 130 + (70 * t); // 130(緑) → 200(水色)
  } else if (currentBpm <= mid2) {
    // 水色 → 黄色（100〜140）
    const t = (currentBpm - mid1) / (mid2 - mid1);
    hue = 200 - (140 * t); // 200(水色) → 60(黄色)
  } else {
    // 黄色 → 赤（140〜200）
    const t = (currentBpm - mid2) / (max - mid2);
    hue = 60 - (60 * t); // 60(黄色) → 0(赤)
  }

  let saturation = 75;
  let lightness = 50;

  if (currentBpm > 170) {
    saturation = 85;
    lightness = 50;
  }

  if (currentBpm < 80) {
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

  // 再生中かつドラッグ中でなければ、新しいBPMで再起動
  if (isPlaying && !isDragging) {
    restartMetronome();
  }
}

/* =========================
   再生制御
========================= */
function start() {
  if (isPlaying) return;

  isPlaying = true;
  playBtn.textContent = "■";

  // ✅ まず1回鳴らす
  playSound();

  // ✅ その後ループ
  timer = setInterval(() => {
    playSound();
  }, 60000 / bpm);
}

function stop() {
  isPlaying = false;
  playBtn.textContent = "▶";

  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function restartMetronome() {
  if (!isPlaying) return;

  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  // 触ってない時だけ即再開
  if (!isDragging) {
    playSound();
  }

  timer = setInterval(() => {
    playSound();
  }, 60000 / bpm);
}

/* =========================
   音 + 鼓動
========================= */
function playSound() {
  if (isDragging) return;
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  // 鼓動アニメーション
  playBtn.classList.add("beat");
  setTimeout(() => {
    playBtn.classList.remove("beat");
  }, 100);

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  // サウンド切替
  switch (soundType) {
    case "beep":
      osc.type = "sine";
      osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
      break;

    case "wood":
      osc.type = "triangle";
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      break;

    case "digital":
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
      break;

    case "mix":
      osc.type = "square";
      osc.frequency.setValueAtTime(900, audioCtx.currentTime);
      break;

    case "click":
    default:
      osc.type = "square";
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      break;
  }

  gain.gain.setValueAtTime(1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    audioCtx.currentTime + 0.12
  );

  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.12);
}

/* =========================
   イベント
========================= */

// サウンド切替
soundButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    soundType = btn.dataset.sound;

    soundButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// スライダー：触り始め
slider.addEventListener("mousedown", () => {
  isDragging = true;
});

slider.addEventListener("touchstart", () => {
  isDragging = true;
}, { passive: true });

// スライダー：動かしている最中
slider.addEventListener("input", (e) => {
  isDragging = true;
  updateBpm(parseInt(e.target.value, 10));
});

// スライダー：離した時（PC）
slider.addEventListener("change", () => {
  isDragging = false;

  if (isPlaying) {
    restartMetronome();
  }
});

// スライダー：離した時（iOS）
slider.addEventListener("touchend", () => {
  isDragging = false;

  if (isPlaying) {
    restartMetronome();
  }
});

// ＋ −
plusBtn.addEventListener("click", () => {
  updateBpm(bpm + 1);
});

minusBtn.addEventListener("click", () => {
  updateBpm(bpm - 1);
});

// 再生ボタン
playBtn.addEventListener("click", async () => {
  await initAudio();

  if (isPlaying) {
    stop();
  } else {
    start();
  }
});

// iOS向け：最初のタッチでAudio解放
document.body.addEventListener(
  "touchstart",
  async () => {
    await initAudio();
  },
  { once: true, passive: true }
);

/* =========================
   初期化
========================= */
updateBpm(bpm);