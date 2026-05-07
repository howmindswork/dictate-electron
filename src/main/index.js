require("dotenv").config();
const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Tray,
  Menu,
  nativeImage,
  clipboard,
  shell,
} = require("electron");
const path = require("path");
const Store = require("electron-store");
const { isTrialActive, isOwnerKey } = require("./trial");
const { transcribeAudioBuffer } = require("./transcribe");
const { injectText } = require("./inject");
const {
  setupHotkey,
  updateHotkey,
  teardown,
  setNotifier,
} = require("./hotkey");

const store = new Store();
let overlayWindow = null;
let isRecording = false;
let tray = null;
let settingsWindow = null;

// Default preferences schema
const defaultPreferences = {
  handsFreeModeEnabled: false,
  autoPasteEnabled: true,
  restoreClipboardEnabled: false,
  soundEffectsEnabled: true,
  saveToLogEnabled: true,
  removeFiltersEnabled: false,
  autoDetectLanguageEnabled: true,
  darkThemeEnabled: true,
  saveRecordingsEnabled: false,
  hotkey: "Ctrl+Space",
};

if (!store.get("installDate")) {
  store.set("installDate", new Date().toISOString());
}

if (!store.get("transcriptions")) {
  store.set("transcriptions", []);
}

if (!store.get("preferences")) {
  store.set("preferences", defaultPreferences);
}

// Calculate stats from transcription history
function calculateStats() {
  const transcriptions = store.get("transcriptions") || [];
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Total words
  const totalWords = transcriptions.reduce(
    (sum, t) => sum + (t.wordCount || 0),
    0,
  );

  // Weekly words
  const weeklyWords = transcriptions
    .filter((t) => new Date(t.timestamp) >= oneWeekAgo)
    .reduce((sum, t) => sum + (t.wordCount || 0), 0);

  // Longest streak (consecutive days with transcriptions)
  const longestStreak = calculateLongestStreak(transcriptions);

  // Hours saved (estimate: 150 words per minute typing = 60 words per minute)
  const hoursSaved = Math.round((totalWords / 60) * 10) / 10;

  // Transcription count
  const transcriptionCount = transcriptions.length;

  return {
    totalWords,
    weeklyWords,
    longestStreak,
    hoursSaved,
    transcriptionCount,
  };
}

function calculateLongestStreak(transcriptions) {
  if (transcriptions.length === 0) return 0;

  // Get unique dates
  const dates = [
    ...new Set(transcriptions.map((t) => new Date(t.timestamp).toDateString())),
  ];
  dates.sort();

  let currentStreak = 1;
  let longestStreak = 1;

  for (let i = 1; i < dates.length; i++) {
    const prevDate = new Date(dates[i - 1]);
    const currDate = new Date(dates[i]);
    const diffDays = (currDate - prevDate) / (1000 * 60 * 60 * 24);

    if (diffDays === 1) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  return longestStreak;
}

function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 280,
    height: 65,
    x: Math.round((width - 280) / 2),
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

const { daysLeft } = require("./trial");

function updateTrayTooltip() {
  if (!tray) return;
  const installDate = store.get("installDate");
  const prefs = store.get("preferences") || {};
  if (isTrialActive(new Date(installDate))) {
    const left = daysLeft(new Date(installDate));
    tray.setToolTip(
      `dictate.app — ${left} day${left === 1 ? "" : "s"} left in trial · Ctrl+Space`,
    );
  } else if (prefs.licenseKey) {
    tray.setToolTip("dictate.app — Pro · Ctrl+Space");
  } else {
    tray.setToolTip("dictate.app — Trial expired. Open Settings to upgrade.");
  }
}

function toggleRecording() {
  const installDate = store.get("installDate");
  const prefs = store.get("preferences") || {};
  const hasLicense = !!prefs.licenseKey;

  if (!isTrialActive(new Date(installDate)) && !hasLicense) {
    createSettingsWindow();
    if (tray && tray.displayBalloon) {
      tray.displayBalloon({
        title: "dictate.app — Trial Expired",
        content: "Your 7-day trial has ended. Open Settings to upgrade.",
        iconType: "info",
      });
    }
    return;
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
    const prefs = store.get("preferences") || {};
    const apiKey = prefs.groqApiKey || undefined;
    const text = await transcribeAudioBuffer(arrayBuffer, apiKey);
    if (text) {
      await injectText(text);

      // Store transcription in history
      const wordCount = text.trim().split(/\s+/).length;
      const transcription = {
        timestamp: new Date().toISOString(),
        text: text,
        wordCount: wordCount,
      };

      const transcriptions = store.get("transcriptions") || [];
      transcriptions.push(transcription);
      store.set("transcriptions", transcriptions);

      // Clean up old transcriptions (older than 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const filtered = transcriptions.filter(
        (t) => new Date(t.timestamp) >= ninetyDaysAgo,
      );
      if (filtered.length !== transcriptions.length) {
        store.set("transcriptions", filtered);
      }
    }

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

ipcMain.on("get-stats", (event) => {
  const stats = calculateStats();
  event.reply("stats-data", stats);
});

// ============================================================================
// SETTINGS WINDOW & IPC HANDLERS
// ============================================================================

function createSettingsWindow() {
  // If already exists but hidden, just show it
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;

  settingsWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 760,
    minHeight: 500,
    x: Math.round((screenWidth - 900) / 2),
    y: Math.round((screenHeight - 680) / 2),
    frame: false,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, "../renderer/settings.html"));
  settingsWindow.show();

  // Hide to tray on close — only Quit actually quits
  settingsWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      settingsWindow.hide();
    }
  });

  return settingsWindow;
}

ipcMain.on("open-settings", () => {
  createSettingsWindow();
});

ipcMain.on("window-minimize", () => {
  if (settingsWindow) settingsWindow.minimize();
});

// X button hides to tray, does not quit
ipcMain.on("window-close", () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.hide();
});

ipcMain.on("load-settings", (event) => {
  const preferences = store.get("preferences") || defaultPreferences;
  event.reply("settings-loaded", preferences);
});

ipcMain.on("save-settings", (event, preferences) => {
  store.set("preferences", preferences);
  console.log("Preferences saved:", preferences);
});

ipcMain.on("get-transcription-history", (event) => {
  const transcriptions = store.get("transcriptions") || [];
  event.reply("transcription-history", transcriptions);
});

ipcMain.on("delete-transcription", (event, index) => {
  const transcriptions = store.get("transcriptions") || [];
  if (index >= 0 && index < transcriptions.length) {
    transcriptions.splice(index, 1);
    store.set("transcriptions", transcriptions);
  }
});

ipcMain.on("restore-clipboard", (event) => {
  // Store current clipboard before next paste
  const savedClipboard = clipboard.readText();
  console.log(
    "Clipboard saved for restoration:",
    savedClipboard.substring(0, 50),
  );
  event.sender.send("clipboard-saved", savedClipboard);
});

ipcMain.on("set-hotkey", (event, hotkeyStr) => {
  const preferences = store.get("preferences") || defaultPreferences;
  preferences.hotkey = hotkeyStr;
  store.set("preferences", preferences);
  updateHotkey(hotkeyStr);
});

ipcMain.on("load-api-key", (event) => {
  const prefs = store.get("preferences") || {};
  event.reply("api-key-loaded", prefs.groqApiKey || "");
});

ipcMain.on("save-api-key", (event, key) => {
  const prefs = store.get("preferences") || defaultPreferences;
  prefs.groqApiKey = key.trim();
  store.set("preferences", prefs);
});

const STRIPE_CHECKOUT_URL = "https://buy.stripe.com/8x2aEX7ree937fw6A3dwc0l";

ipcMain.on("open-account-page", () => {
  shell.openExternal(STRIPE_CHECKOUT_URL);
});

ipcMain.on("open-checkout", () => {
  shell.openExternal(STRIPE_CHECKOUT_URL);
});

ipcMain.on("check-for-updates", () => {
  shell.openExternal("https://dictate-app.pages.dev");
});

ipcMain.on("validate-api-key", async (event, key) => {
  try {
    const { buildGroqClient } = require("./transcribe");
    const client = buildGroqClient(key);
    await client.models.list();
    event.reply("api-key-valid", true);
  } catch (err) {
    event.reply("api-key-valid", false);
  }
});

ipcMain.on("get-trial-info", (event) => {
  const installDate = store.get("installDate");
  const prefs = store.get("preferences") || {};
  const ownerUnlocked = isOwnerKey(prefs.licenseKey);
  event.reply("trial-info", {
    active: ownerUnlocked || isTrialActive(new Date(installDate)),
    daysLeft: ownerUnlocked ? 9999 : daysLeft(new Date(installDate)),
    hasLicense: !!prefs.licenseKey,
    ownerUnlocked,
  });
});

ipcMain.on("validate-license-key", (event, key) => {
  const owner = isOwnerKey(key);
  const valid = owner || (typeof key === "string" && key.trim().length > 8);
  event.reply("license-key-validated", { valid, owner });
});

app.whenReady().then(() => {
  const iconPath = path.join(__dirname, "../../assets/app-icon.png");
  const icon = nativeImage
    .createFromPath(iconPath)
    .resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const buildTrayMenu = () =>
    Menu.buildFromTemplate([
      { label: "dictate.app", enabled: false },
      { type: "separator" },
      { label: "Open Settings", click: () => createSettingsWindow() },
      { type: "separator" },
      {
        label: "History",
        click: () => {
          createSettingsWindow();
          settingsWindow.webContents.send("nav-to", "history");
        },
      },
      {
        label: "Microphone",
        click: () => {
          createSettingsWindow();
          settingsWindow.webContents.send("nav-to", "microphone");
        },
      },
      {
        label: "Keyboard",
        click: () => {
          createSettingsWindow();
          settingsWindow.webContents.send("nav-to", "keyboard");
        },
      },
      { type: "separator" },
      {
        label: "Privacy Policy",
        click: () =>
          shell.openExternal("https://dictate-app.pages.dev/privacy"),
      },
      { type: "separator" },
      {
        label: "Quit dictate.app",
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);
  tray.setContextMenu(buildTrayMenu());
  // Double-click tray icon opens settings
  tray.on("double-click", () => createSettingsWindow());

  updateTrayTooltip();
  setInterval(updateTrayTooltip, 60 * 60 * 1000);

  setNotifier((type, hotkey) => {
    if (type === "hotkeyConflict" && tray && tray.displayBalloon) {
      tray.displayBalloon({
        title: "dictate.app — Hotkey Conflict",
        content: `${hotkey} is taken. Remapped to Ctrl+Space. Change it in Settings.`,
        iconType: "warning",
      });
    }
  });

  Menu.setApplicationMenu(null);
  const prefs = store.get("preferences") || defaultPreferences;
  let savedHotkey = prefs.hotkey || "Ctrl+Space";
  const modifierOnly =
    /^(Ctrl|Shift|Alt|Cmd|Meta|Super)(\+(Ctrl|Shift|Alt|Cmd|Meta|Super))*$/i;
  if (modifierOnly.test(savedHotkey) || savedHotkey.split("+").length < 2) {
    savedHotkey = "Ctrl+Space";
    prefs.hotkey = savedHotkey;
    store.set("preferences", prefs);
  }
  setupHotkey(toggleRecording, savedHotkey);
  console.log("dictate.app running — hotkey:", savedHotkey);

  // Show settings on first launch so users know the app is running
  if (!store.get("hasLaunched")) {
    store.set("hasLaunched", true);
    createSettingsWindow();
  }
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("before-quit", () => {
  app.isQuitting = true;
  teardown();
});
