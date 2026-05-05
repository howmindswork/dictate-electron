require("dotenv").config();
const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const Store = require("electron-store");
const { isTrialActive } = require("./trial");
const { transcribeAudioBuffer } = require("./transcribe");
const { injectText } = require("./inject");
const { setupHotkey, teardown } = require("./hotkey");

const store = new Store();
let overlayWindow = null;
let isRecording = false;

if (!store.get("installDate")) {
  store.set("installDate", new Date().toISOString());
}

function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 320,
    height: 68,
    x: Math.round((width - 320) / 2),
    y: height - 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  overlayWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  overlayWindow.setIgnoreMouseEvents(false);

  return overlayWindow;
}

function toggleRecording() {
  const installDate = store.get("installDate");
  if (!isTrialActive(new Date(installDate))) {
    console.log("Trial expired — license check goes here in Phase 2");
  }

  if (!isRecording) {
    isRecording = true;
    const win = createOverlay();
    win.webContents.on("did-finish-load", () => {
      win.webContents.send("start-recording");
    });
  } else {
    isRecording = false;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send("stop-recording");
    }
  }
}

ipcMain.on("audio-ready", async (event, arrayBuffer) => {
  try {
    const text = await transcribeAudioBuffer(arrayBuffer);
    if (text) await injectText(text);
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send("transcription-done");
    }
  } catch (err) {
    console.error("Transcription error:", err.message);
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send("transcription-error", err.message);
    }
  } finally {
    overlayWindow = null;
    isRecording = false;
  }
});

app.whenReady().then(() => {
  setupHotkey(toggleRecording);
  console.log("dictate.app running — press middle mouse button to dictate");
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("before-quit", () => {
  teardown();
});
