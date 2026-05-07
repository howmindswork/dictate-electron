const { ipcRenderer } = require("electron");
const path = require("path");

let mediaRecorder = null;
let audioChunks = [];
let analyser = null;
let animFrame = null;
let paused = false;
let audioContext = null;
let recordingUndone = false;

// VOWEN waveform: 5-bar spring-smoothed bars with white gradient
const barCount = 5;
const barSmoothed = new Array(barCount).fill(0);
// VOWEN's bar order: [2,0,4,1,3] — pseudo-random visual spread
const barOrder = [2, 0, 4, 1, 3];

const canvas = document.getElementById("waveform");
const ctx2d = canvas.getContext("2d");
const container = document.getElementById("recording-container");
const recordingBar = document.getElementById("recording-bar");
const undoPopup = document.getElementById("undo-popup");
const pauseIcon = document.getElementById("pause-icon");
const resumeIcon = document.getElementById("resume-icon");
const processingLogo = document.getElementById("processing-logo");

function playSound(name) {
  try {
    const soundPath = path.join(__dirname, "../../assets", name + ".mp3");
    const audio = new Audio("file://" + soundPath);
    audio.volume = 0.7;
    audio.play().catch(() => {});
  } catch (e) {}
}

// ── VOWEN waveform algorithm ─────────────────────────────────────────────────
// fftSize:64, smoothingTimeConstant:0.6, 5 bars, spring lerp 0.2
// White gradient bars: rgba(255,255,255,0.9) → rgba(255,255,255,0.6)
function drawWaveform() {
  if (!analyser) return;

  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width;
  const h = rect.height;
  const cw = Math.round(w * dpr);
  const ch = Math.round(h * dpr);

  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
    ctx2d.scale(dpr, dpr);
  }

  ctx2d.clearRect(0, 0, w, h);

  const BAR_W = 5;
  const GAP = 3;
  const STEP = BAR_W + GAP;
  const totalBarPx = barCount * BAR_W + (barCount - 1) * GAP;
  const originX = (w - totalBarPx) / 2;
  const now = Date.now();
  const MIN_H = 3;
  const MAX_H = h - 4;
  const LERP = 0.2;

  for (let i = 0; i < barCount; i++) {
    const dataIdx = Math.floor((barOrder[i] * data.length) / barCount);
    const raw = data[dataIdx] / 255;

    // VOWEN: add tiny noise + sine breathe
    const noise = (Math.random() - 0.5) * 0.15 * raw;
    const breathe = Math.sin(now / 300 + i * 1.2) * 0.04 + 0.04;
    const target = Math.max(0, Math.min(1, raw + noise + breathe));

    // Spring smooth
    barSmoothed[i] = barSmoothed[i] + (target - barSmoothed[i]) * LERP;

    const barH = Math.max(MIN_H, MIN_H + barSmoothed[i] * (MAX_H - MIN_H));
    const x = originX + i * STEP;
    const y = (h - barH) / 2;
    const r = BAR_W / 2;

    // White gradient (VOWEN exact) — dictate.app tints slightly purple at top
    const grad = ctx2d.createLinearGradient(x, y, x, y + barH);
    grad.addColorStop(0, "rgba(220, 190, 255, 0.95)");
    grad.addColorStop(1, "rgba(255, 255, 255, 0.65)");

    ctx2d.fillStyle = grad;
    ctx2d.beginPath();
    ctx2d.roundRect(x, y, BAR_W, barH, r);
    ctx2d.fill();
  }

  animFrame = requestAnimationFrame(drawWaveform);
}

// ── Recording ────────────────────────────────────────────────────────────────
function showPillError(msg) {
  recordingBar.classList.remove("recording", "paused", "processing");
  recordingBar.classList.add("processing");
  if (processingLogo) processingLogo.style.display = "none";
  const errEl = document.createElement("span");
  errEl.style.cssText =
    "font-size:11px;color:rgba(244,114,182,0.95);white-space:nowrap;padding:0 4px;";
  errEl.textContent = msg;
  recordingBar.appendChild(errEl);
  container.classList.add("active");
  setTimeout(() => {
    container.classList.remove("active");
    setTimeout(() => window.close(), 380);
  }, 2200);
}

async function startRecording() {
  playSound("start");

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const msg =
      err.name === "NotAllowedError"
        ? "Mic access denied — check Windows privacy settings"
        : "Microphone not found";
    showPillError(msg);
    return;
  }

  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 64;
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);

  drawWaveform();

  mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  audioChunks = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };
  mediaRecorder.onstop = sendAudioForTranscription;
  mediaRecorder.start();

  recordingUndone = false;
}

async function sendAudioForTranscription() {
  if (recordingUndone) {
    recordingUndone = false;
    return;
  }

  cancelAnimationFrame(animFrame);
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);

  // Processing state: shrink pill + shimmer border + pulsing mic logo
  recordingBar.classList.remove("recording", "paused");
  recordingBar.classList.add("processing");
  canvas.classList.add("hidden");
  if (processingLogo) processingLogo.style.display = "block";

  const blob = new Blob(audioChunks, { type: "audio/webm" });
  const arrayBuffer = await blob.arrayBuffer();
  ipcRenderer.send("audio-ready", arrayBuffer);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    playSound("stop");
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((t) => t.stop());
  }
}

function togglePause() {
  if (!mediaRecorder) return;
  if (paused) {
    mediaRecorder.resume();
    paused = false;
    recordingBar.classList.remove("paused");
    pauseIcon.style.display = "";
    resumeIcon.style.display = "none";
    drawWaveform();
  } else {
    mediaRecorder.pause();
    paused = true;
    cancelAnimationFrame(animFrame);
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    recordingBar.classList.add("paused");
    pauseIcon.style.display = "none";
    resumeIcon.style.display = "";
  }
}

// ── Controls ─────────────────────────────────────────────────────────────────
document.getElementById("pause-btn").addEventListener("click", togglePause);
document.getElementById("stop-btn").addEventListener("click", stopRecording);

document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    mediaRecorder &&
    mediaRecorder.state !== "inactive"
  ) {
    e.preventDefault();
    stopRecording();
    recordingUndone = true;
    showUndoPopup();
  }
});

// ── Undo popup ────────────────────────────────────────────────────────────────
function showUndoPopup() {
  undoPopup.classList.add("show");
  undoPopup.classList.remove("fade-out");

  const timeout = setTimeout(hideUndoPopup, 2500);

  const clickHandler = () => {
    clearTimeout(timeout);
    hideUndoPopup();
    startRecording();
    undoPopup.removeEventListener("click", clickHandler);
  };

  undoPopup.addEventListener("click", clickHandler);
}

function hideUndoPopup() {
  undoPopup.classList.add("fade-out");
  setTimeout(() => undoPopup.classList.remove("show", "fade-out"), 250);
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcRenderer.on("start-recording", () => {
  container.classList.add("active");
  startRecording();
});

ipcRenderer.on("stop-recording", () => {
  stopRecording();
});

ipcRenderer.on("transcription-done", () => {
  if (processingLogo) processingLogo.style.display = "none";
  container.classList.remove("active");
  setTimeout(() => window.close(), 380);
});

ipcRenderer.on("transcription-error", (_, msg) => {
  if (processingLogo) processingLogo.style.display = "none";
  console.error("Transcription error:", msg);
  const errText =
    msg && msg.toLowerCase().includes("api")
      ? "No API key — add one in Settings"
      : "Transcription failed. Try again.";
  showPillError(errText);
});
