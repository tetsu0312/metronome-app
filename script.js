function getColorByBpm(bpm) {
  if (bpm < 80) return "#7fd8ff";      // ゆっくり
  if (bpm < 120) return "#5ec8ff";     // 普通
  if (bpm < 160) return "#3aaed8";     // 速い
  return "#007ea7";                    // めっちゃ速い
}

function applyColor() {
  const color = getColorByBpm(bpm);

  playBtn.style.background = color;

  document.querySelector("input[type='range']::-webkit-slider-thumb");

  slider.style.setProperty("--thumb-color", color);
}

// BPM更新時に呼ぶ
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

// 拍アニメーション
function playSound() {
  if (!audioCtx) return;

  // ボタン鼓動
  playBtn.classList.add("beat");
  setTimeout(() => {
    playBtn.classList.remove("beat");
  }, 100);

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.frequency.value = 800;

  gain.gain.setValueAtTime(1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.08);
}