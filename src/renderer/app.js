const { ipcRenderer } = require("electron");

let mediaRecorder = null;
let audioChunks = [];
let analyser = null;
let animFrame = null;
let paused = false;
const canvas = document.getElementById("wave-canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");

async function startRecording() {
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

ipcRenderer.on("start-recording", () => startRecording());
ipcRenderer.on("stop-recording", () => stopRecording());

ipcRenderer.on("transcription-done", () => {
  document.body.classList.remove("processing");
  window.close();
});

ipcRenderer.on("transcription-error", (_, msg) => {
  statusEl.textContent = `Error: ${msg}`;
  setTimeout(() => window.close(), 2000);
});
