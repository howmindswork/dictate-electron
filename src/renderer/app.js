const { ipcRenderer } = require("electron");

let mediaRecorder = null;
let audioChunks = [];
let analyser = null;
let animFrame = null;
let paused = false;
let audioContext = null;
let recordingUndone = false;
const canvas = document.getElementById("wave-canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const undoPopup = document.getElementById("undo-popup");

function generatePopSound() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const now = audioContext.currentTime;
    const duration = 0.12;

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.frequency.setValueAtTime(850, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + duration);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    osc.start(now);
    osc.stop(now + duration);
  } catch (e) {
    console.error("Pop sound generation error:", e);
  }
}

async function startRecording() {
  generatePopSound();

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  drawWaveform();

  mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  audioChunks = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };
  mediaRecorder.onstop = sendAudioForTranscription;
  mediaRecorder.start();

  statusEl.textContent = "Listening...";
  recordingUndone = false;
}

function drawWaveform() {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const barWidth = 3;
  const gap = 2;
  const barCount = Math.floor(canvas.width / (barWidth + gap));
  const step = Math.floor(data.length / barCount);

  for (let i = 0; i < barCount; i++) {
    const value = data[i * step] / 255;
    const barHeight = Math.max(3, value * canvas.height);
    const x = i * (barWidth + gap);
    const y = (canvas.height - barHeight) / 2;
    const alpha = 0.3 + value * 0.7;
    ctx.fillStyle = `rgba(80, 140, 255, ${alpha})`;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, 2);
    ctx.fill();
  }

  animFrame = requestAnimationFrame(drawWaveform);
}

async function sendAudioForTranscription() {
  cancelAnimationFrame(animFrame);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  statusEl.textContent = "Processing...";
  document.body.classList.add("processing");

  const blob = new Blob(audioChunks, { type: "audio/webm" });
  const arrayBuffer = await blob.arrayBuffer();
  ipcRenderer.send("audio-ready", arrayBuffer);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    generatePopSound();
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((t) => t.stop());
  }
}

function togglePause() {
  if (!mediaRecorder) return;
  if (paused) {
    mediaRecorder.resume();
    paused = false;
    statusEl.textContent = "Listening...";
  } else {
    mediaRecorder.pause();
    paused = true;
    statusEl.textContent = "Paused";
  }
}

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

function showUndoPopup() {
  undoPopup.classList.add("show");
  undoPopup.classList.remove("fade-out");

  const timeout = setTimeout(() => {
    hideUndoPopup();
  }, 2500);

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
  setTimeout(() => {
    undoPopup.classList.remove("show", "fade-out");
  }, 300);
}

ipcRenderer.on("start-recording", () => {
  startRecording();
});

ipcRenderer.on("stop-recording", () => {
  stopRecording();
});

ipcRenderer.on("transcription-done", () => {
  document.body.classList.remove("processing");
  window.close();
});

ipcRenderer.on("transcription-error", (_, msg) => {
  statusEl.textContent = `Error: ${msg}`;
  setTimeout(() => window.close(), 2000);
});
