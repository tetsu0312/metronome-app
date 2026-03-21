let bpm = 120;
let isPlaying = false;
let soundType = "ウッド";
let isDragging = false;
let beatsPerBar = 4; // ← デフォルト4拍子
let currentBeat = 0; // ← 今何拍目か
let isAdjusting = false;
let restartTimeout = null; // ← 再同期の遅延用

// 要素取得
const bpmEl = document.getElementById("bpm");
const slider = document.getElementById("slider");
const playBtn = document.getElementById("playBtn");
const plusBtn = document.querySelector(".plus");
const minusBtn = document.querySelector(".minus");
const soundButtons = document.querySelectorAll(".sound");
const beatDisplay = document.getElementById("beatDisplay");

/* =========================
   UI：拍数選択
========================= */
// 表示開始位置（2〜6）
let beatStart = 2; 

// 表示数
const beatCount = 5;

// DOM
const beatSelector = document.getElementById("beatSelector");
const leftArrow = document.getElementById("leftArrow");
const rightArrow = document.getElementById("rightArrow");



// AudioContext
let audioCtx = null;

// 未来スケジューリング用
let nextNoteTime = 0;
let schedulerWorker = null;
let fallbackTimer = null;
const lookahead = 10; // msごとにスケジューラ確認
const scheduleAheadTime = 0.03; // 30ms先まで予約
let visualTimeouts = [];

/* =========================
   Audio 初期化（iOS / 背景再生対策）
========================= */
async function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: "interactive",
    });
  }

  // 対応ブラウザなら再生用途を明示
  try {
    if (navigator.audioSession && "type" in navigator.audioSession) {
      navigator.audioSession.type = "playback";
    }
  } catch (e) {
    console.log("audioSession not available", e);
  }

  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }

  // iOS向け：無音バッファを1回流してアンロック
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
  const max = 200;

  // 0〜1に正規化
  const t = (currentBpm - min) / (max - min);

  // Hueを130→360→0へ回す
  let hue = 130 + t * 230; // 130 → 360

  if (hue > 360) hue -= 360; // 360超えたらループ

  let saturation = 75;
  let lightness = 50;

  // 微調整（今の良いやつ残す）
  if (currentBpm > 170) {
    saturation = 85;
  }

  if (currentBpm < 80) {
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

  // =========================
  // BPM変更時：1秒後に完全リスタート
  // =========================
  if (isPlaying) {
    if (restartTimeout) clearTimeout(restartTimeout);

    restartTimeout = setTimeout(async () => {
      stop();        // ← 予約ごとリセット
      await start(); // ← 1拍目から再開
    }, 1000);
  }
}

/* =========================
   Web Worker スケジューラ
   背景タブでも鳴りやすくするため
========================= */
function createSchedulerWorker() {
  const workerCode = `
    let timerId = null;
    let interval = 25;

    self.onmessage = function(e) {
      const data = e.data;

      if (data === "start") {
        if (timerId) clearInterval(timerId);
        timerId = setInterval(() => {
          self.postMessage("tick");
        }, interval);
      }

      if (data === "stop") {
        if (timerId) {
          clearInterval(timerId);
          timerId = null;
        }
      }

      if (data && data.type === "setInterval") {
        interval = data.interval;
        if (timerId) {
          clearInterval(timerId);
          timerId = setInterval(() => {
            self.postMessage("tick");
          }, interval);
        }
      }
    };
  `;

  const blob = new Blob([workerCode], { type: "application/javascript" });
  return new Worker(URL.createObjectURL(blob));
}

function startSchedulerLoop() {
  stopSchedulerLoop();

  if (window.Worker) {
    schedulerWorker = createSchedulerWorker();
    schedulerWorker.onmessage = (e) => {
      if (e.data === "tick") {
        scheduler();
      }
    };
    schedulerWorker.postMessage({ type: "setInterval", interval: lookahead });
    schedulerWorker.postMessage("start");
  } else {
    fallbackTimer = setInterval(scheduler, lookahead);
  }
}

function stopSchedulerLoop() {
  if (schedulerWorker) {
    schedulerWorker.postMessage("stop");
    schedulerWorker.terminate();
    schedulerWorker = null;
  }

  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
}

/* =========================
   再生制御
========================= */
async function start() {
  if (isPlaying) return;

  await initAudio();

  if (!audioCtx) return;
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }

  isPlaying = true;
  playBtn.textContent = "■";

  currentBeat = 0;

  // 少し先からスタートさせると安定しやすい
  nextNoteTime = audioCtx.currentTime + 0.1;

  startSchedulerLoop();
}

function clearVisualTimeouts() {
  visualTimeouts.forEach((id) => clearTimeout(id));
  visualTimeouts = [];
}


function stop() {
  isPlaying = false;
  playBtn.textContent = "▶";

  stopSchedulerLoop();
  clearVisualTimeouts();

  nextNoteTime = 0; 
  currentBeat = 0;
  schedulerWorker = null;
}

function restartMetronome() {
  if (!isPlaying || !audioCtx) return;

  // 👇 まずリセット
  currentBeat = 0;

  // 👇 未来を完全リスタート
  nextNoteTime = audioCtx.currentTime + 0.1;
}


/* =========================
   次の拍を計算
========================= */
function nextNote() {
  const secondsPerBeat = 60 / bpm;
  nextNoteTime += secondsPerBeat;
}

/* =========================
   スケジューラ本体
========================= */
function scheduler() {
  if (!isPlaying || !audioCtx) return;

  // suspendされたら復帰を試みる
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
    return;
  }

  while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
    scheduleBeat(nextNoteTime);
    nextNote();
  }
}

/* =========================
   1拍分を予約
========================= */
function scheduleBeat(time) {
  console.log("beat:", currentBeat);
  const isAccent = currentBeat === 0;

  scheduleSound(time, isAccent);
  scheduleVisualBeat(time, currentBeat);

  currentBeat++;
  if (currentBeat >= beatsPerBar) {
    currentBeat = 0;
  }
}

/* =========================
   音予約
========================= */
function scheduleSound(time, isAccent) {
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  gain.gain.cancelScheduledValues(time);

 switch (soundType) {

case "ソフト":
  osc.type = "sine";

  if (isAccent) {
    osc.frequency.setValueAtTime(900, time);
    gain.gain.setValueAtTime(0.6, time);
  } else {
    osc.frequency.setValueAtTime(600, time);
    gain.gain.setValueAtTime(0.3, time);
  }

  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);

  osc.start(time);
  osc.stop(time + 0.15);
  break;

  case "クリック":
    osc.type = "sine";

    if (isAccent) {
      osc.frequency.setValueAtTime(1400, time);
      gain.gain.setValueAtTime(0.8, time);
    } else {
      osc.frequency.setValueAtTime(1000, time);
      gain.gain.setValueAtTime(0.4, time);
    }

    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);

    osc.start(time);
    osc.stop(time + 0.1);
    break;

  case "ティック":
    osc.type = "triangle";

    if (isAccent) {
      osc.frequency.setValueAtTime(1100, time);
      gain.gain.setValueAtTime(0.7, time);
    } else {
      osc.frequency.setValueAtTime(800, time);
      gain.gain.setValueAtTime(0.3, time);
    }

    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);

    osc.start(time);
    osc.stop(time + 0.08);
    break;

case "ウッド":
  osc.type = "triangle";

  if (isAccent) {
    // 1拍目（コツッ！って強め）
    osc.frequency.setValueAtTime(700, time);
    gain.gain.setValueAtTime(0.7, time);
  } else {
    // 通常拍
    osc.frequency.setValueAtTime(500, time);
    gain.gain.setValueAtTime(0.4, time);
  }

  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

  osc.start(time);
  osc.stop(time + 0.12);
  break;

}
}

/* =========================
   UI鼓動アニメーション予約
========================= */
function scheduleVisualBeat(time, beatIndex) {
  if (!audioCtx) return;

  const delayMs = Math.max(0, (time - audioCtx.currentTime) * 1000);

  const addId = setTimeout(() => {
    playBtn.classList.add("beat");

      if (beatDisplay) {
    beatDisplay.textContent = beatIndex + 1;

  }

    const display = document.querySelector(".beat-display");

if (display) {
  display.textContent = beatIndex + 1;

  // アニメーション
  display.classList.add("active");

  setTimeout(() => {
    display.classList.remove("active");
  }, 100);
}

    // ドット更新
    const dots = document.querySelectorAll(".beat-dot");

    dots.forEach((dot, i) => {
      dot.classList.remove("active", "accent");

      if (i === beatIndex) {
        if (i === 0) {
          dot.classList.add("accent"); // 強拍
        } else {
          dot.classList.add("active");
        }
      }
    });

    const removeId = setTimeout(() => {
      playBtn.classList.remove("beat");
      visualTimeouts = visualTimeouts.filter((id) => id !== removeId);
    }, 100);

    visualTimeouts.push(removeId);
    visualTimeouts = visualTimeouts.filter((id) => id !== addId);
  }, delayMs);

  visualTimeouts.push(addId);
}


/* =========================
   UI描画：拍ボタン
========================= */
function renderBeatButtons() {
  if (!beatSelector) return;

  beatSelector.innerHTML = "";

  for (let i = beatStart; i < beatStart + beatCount; i++) {
    if (i > 10) break;

    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = "beat-btn";

    if (i === beatsPerBar) {
      btn.classList.add("active");
    }

    btn.onclick = () => {
      setBeats(i);
      renderBeatButtons();
    };

    beatSelector.appendChild(btn);
  }
}

/* =========================
   ドット生成
========================= */
function renderBeatDots() {
  const container = document.getElementById("beatDots");
  if (!container) return;

  container.innerHTML = "";

  for (let i = 0; i < beatsPerBar; i++) {
    const dot = document.createElement("div");
    dot.className = "beat-dot";
    container.appendChild(dot);
  }
}

/* =========================
   UIイベント：拍数変更
========================= */
function setBeats(val) {
  beatsPerBar = val;

  // ① 拍リセット（必須）
  currentBeat = 0;

  // UI更新
  renderBeatButtons();
  renderBeatDots();

  // ② 再生中なら「1秒後に再スタート」
  if (isPlaying) {
    // すでに予約あったらキャンセル
    if (restartTimeout) {
      clearTimeout(restartTimeout);
    }

    // 一旦止める（←ここ重要！）
    stop();

    // 0.5秒後に再スタート
    restartTimeout = setTimeout(async () => {
      await start();
    }, 500);
  }
}



// サウンド切替
soundButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    soundType = btn.dataset.sound;

    soundButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    // 音切替直後でもAudioContext起きてる状態を保ちやすくする
    await initAudio();
  });
});

// 矢印
if (leftArrow) {
  leftArrow.onclick = () => {
    if (beatStart > 1) {
      beatStart--;
      renderBeatButtons();
    }
  };
}

if (rightArrow) {
  rightArrow.onclick = () => {
    if (beatStart + beatCount <= 10) {
      beatStart++;
      renderBeatButtons();
    }
  };
}


// スライダー：触り始め
slider.addEventListener("mousedown", () => {
  isDragging = true;
});

slider.addEventListener(
  "touchstart",
  () => {
    isDragging = true;
  },
  { passive: true }
);

// スライダー：動かしている最中
slider.addEventListener("input", (e) => {
  isDragging = true;
  updateBpm(parseInt(e.target.value, 10));
});

// スライダー：離した時（PC）
slider.addEventListener("change", () => {
  isDragging = false;

});

// スライダー：離した時（iOS）
slider.addEventListener("touchend", () => {
  isDragging = false;

});

// =========================
// ＋ボタン（押してる間は再同期しない）
// =========================

// 押した瞬間
plusBtn.addEventListener("mousedown", () => {
  isAdjusting = true;
});

// 離した瞬間
plusBtn.addEventListener("mouseup", () => {
  isAdjusting = false;

  // 指離したタイミングで1回だけ再同期
});

// クリック（値変更）
plusBtn.addEventListener("click", () => {
  updateBpm(bpm + 1);
});


// =========================
// −ボタン（押してる間は再同期しない）
// =========================

// 押した瞬間
minusBtn.addEventListener("mousedown", () => {
  isAdjusting = true;
});

// 離した瞬間
minusBtn.addEventListener("mouseup", () => {
  isAdjusting = false;

});

// クリック（値変更）
minusBtn.addEventListener("click", () => {
  updateBpm(bpm - 1);
});


// スマホ対応（タッチ）
plusBtn.addEventListener("touchstart", () => {
  isAdjusting = true;
});

plusBtn.addEventListener("touchend", () => {
  isAdjusting = false;
});

minusBtn.addEventListener("touchstart", () => {
  isAdjusting = true;
});

minusBtn.addEventListener("touchend", () => {
  isAdjusting = false;
});



// 再生ボタン
playBtn.addEventListener("click", async () => {
  if (isPlaying) {
    stop();
  } else {
    await start();
  }
});

// 初回タッチでAudio解放
document.body.addEventListener(
  "touchstart",
  async () => {
    await initAudio();
  },
  { once: true, passive: true }
);

// 初回クリックでもAudio解放
document.body.addEventListener(
  "click",
  async () => {
    await initAudio();
  },
  { once: true, passive: true }
);

/* =========================
   バックグラウンド対策
========================= */

// タブ復帰時にAudioContextが止まってたら復帰を試みる
document.addEventListener("visibilitychange", async () => {
  if (!audioCtx) return;

  if (!document.hidden && audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
      if (isPlaying) {
        restartMetronome();
      }
    } catch (e) {
      console.log("resume on visibilitychange failed", e);
    }
  }
});

// ページフォーカス時も復帰を試みる
window.addEventListener("focus", async () => {
  if (!audioCtx) return;

  if (audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
      if (isPlaying) {
        restartMetronome();
      }
    } catch (e) {
      console.log("resume on focus failed", e);
    }
  }
});

/* =========================
   初期化
========================= */
updateBpm(bpm);

// デフォルトサウンドのUI反映
soundButtons.forEach((btn) => {
  if (btn.dataset.sound === "ウッド") {
    btn.classList.add("active");
  } else {
    btn.classList.remove("active");
  }
});

// 拍表示の初期値
document.getElementById("beatDisplay").textContent = 1;

renderBeatButtons();
renderBeatDots();