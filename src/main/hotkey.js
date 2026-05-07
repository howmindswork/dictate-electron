const { globalShortcut } = require("electron");

let currentCallback = null;

// Convert user-facing hotkey string to Electron accelerator format
// globalShortcut on Windows uses "Ctrl" not "CommandOrControl"
function toAccelerator(hotkeyStr) {
  return hotkeyStr
    .replace(/\bCtrl\b/g, "Ctrl")
    .replace(/\bCmd\b/g, "Ctrl")
    .replace(/\bSpace\b/g, "Space");
}

let _notifyFn = null;

function setNotifier(fn) { _notifyFn = fn; }

function registerSafe(accelerator, fn) {
  try {
    globalShortcut.unregisterAll();
    const ok = globalShortcut.register(accelerator, fn);
    if (!ok) {
      console.error("Hotkey registration failed:", accelerator);
      if (_notifyFn) _notifyFn("hotkeyConflict", accelerator);
    } else {
      console.log("Hotkey registered:", accelerator);
    }
  } catch (e) {
    console.error("Hotkey error, falling back to Ctrl+Space:", e.message);
    try {
      globalShortcut.register("Ctrl+Space", fn);
      console.log("Hotkey registered: Ctrl+Space (fallback)");
      if (_notifyFn) _notifyFn("hotkeyFallback", accelerator);
    } catch (e2) {
      console.error("Fallback hotkey also failed:", e2.message);
    }
  }
}

function setupHotkey(onPress, hotkeyStr) {
  currentCallback = onPress;
  const accelerator = toAccelerator(hotkeyStr || "Ctrl+Shift+Space");
  registerSafe(accelerator, onPress);
}

function updateHotkey(hotkeyStr) {
  if (!currentCallback) return;
  const accelerator = toAccelerator(hotkeyStr);
  registerSafe(accelerator, currentCallback);
}

function teardown() {
  globalShortcut.unregisterAll();
}

module.exports = { setupHotkey, updateHotkey, teardown, setNotifier };
