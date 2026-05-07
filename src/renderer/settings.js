const { ipcRenderer } = require("electron");

let currentSettings = {
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

// ── Nav routing ──────────────────────────────────────────────────────────────

function initNav() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      document
        .querySelectorAll(".nav-item")
        .forEach((n) => n.classList.remove("active"));
      document
        .querySelectorAll(".panel")
        .forEach((p) => p.classList.remove("active"));
      item.classList.add("active");
      const panelId = "panel-" + item.dataset.panel;
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.add("active");
      if (item.dataset.panel === "voice-log") loadVoiceLog();
    });
  });
}

// ── Stats ────────────────────────────────────────────────────────────────────

function displayStats(s) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set("stat-total-words", (s.totalWords || 0).toLocaleString());
  set("stat-weekly-words", (s.weeklyWords || 0).toLocaleString());
  set("stat-streak", s.longestStreak || 0);
  set("stat-hours-saved", (s.hoursSaved || 0).toFixed(1));
  set("stat-count", (s.transcriptionCount || 0).toLocaleString());
}

ipcRenderer.on("stats-data", (_, s) => displayStats(s));

// ── Voice Log ────────────────────────────────────────────────────────────────

function loadVoiceLog() {
  ipcRenderer.send("get-transcription-history");
}

ipcRenderer.on("transcription-history", (_, transcriptions) => {
  const container = document.getElementById("voice-log-list");
  if (!container) return;

  if (!transcriptions || transcriptions.length === 0) {
    container.innerHTML =
      '<div class="log-empty">No transcriptions yet. Press Ctrl+Space to start.</div>';
    return;
  }

  const sorted = [...transcriptions].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
  );

  container.innerHTML = sorted
    .map((t, idx) => {
      const d = new Date(t.timestamp);
      const time = d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
      const esc = (s) =>
        s.replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#039;",
            })[c],
        );
      return `<div class="log-entry">
      <div class="log-entry-meta">${date} at ${time} &bull; ${t.wordCount || 0} words
        <button class="log-delete-btn" data-idx="${idx}" style="float:right;background:rgba(244,114,182,0.15);border:1px solid rgba(244,114,182,0.3);border-radius:5px;color:rgba(244,114,182,0.8);font-size:11px;padding:2px 8px;cursor:pointer;font-family:inherit">Delete</button>
      </div>
      <div class="log-entry-text">${esc(t.text)}</div>
    </div>`;
    })
    .join("");

  document.querySelectorAll(".log-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      ipcRenderer.send("delete-transcription", parseInt(btn.dataset.idx));
      setTimeout(loadVoiceLog, 100);
    });
  });
});

// ── Preferences ──────────────────────────────────────────────────────────────

function initPreferences() {
  ipcRenderer.send("load-settings");

  const wire = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
      currentSettings[key] = el.checked;
      ipcRenderer.send("save-settings", currentSettings);
    });
  };

  wire("hands-free-mode", "handsFreeModeEnabled");
  wire("auto-paste", "autoPasteEnabled");
  wire("sound-effects", "soundEffectsEnabled");
  wire("save-to-log", "saveToLogEnabled");
  wire("remove-fillers", "removeFiltersEnabled");
  wire("auto-detect-lang", "autoDetectLanguageEnabled");
  wire("save-recordings", "saveRecordingsEnabled");
  wire("restore-clipboard", "restoreClipboardEnabled");

  const restoreBtn = document.getElementById("restore-clipboard-btn");
  if (restoreBtn)
    restoreBtn.addEventListener("click", () =>
      ipcRenderer.send("restore-clipboard"),
    );
}

ipcRenderer.on("settings-loaded", (_, settings) => {
  currentSettings = settings;
  const setCheck = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = val;
  };
  setCheck("hands-free-mode", settings.handsFreeModeEnabled);
  setCheck("auto-paste", settings.autoPasteEnabled);
  setCheck("sound-effects", settings.soundEffectsEnabled);
  setCheck("save-to-log", settings.saveToLogEnabled);
  setCheck("remove-fillers", settings.removeFiltersEnabled);
  setCheck("auto-detect-lang", settings.autoDetectLanguageEnabled);
  setCheck("save-recordings", settings.saveRecordingsEnabled);
  setCheck("restore-clipboard", settings.restoreClipboardEnabled);
});

// ── Keybindings ──────────────────────────────────────────────────────────────

function initKeybindings() {
  const display = document.getElementById("hotkey-display");
  const btn = document.getElementById("rebind-hotkey-btn");
  if (!display || !btn) return;

  btn.addEventListener("click", () => {
    btn.textContent = "Press any key...";
    btn.disabled = true;
    let listening = true;

    const onKey = (e) => {
      if (!listening) return;
      e.preventDefault();
      const keys = [];
      if (e.ctrlKey) keys.push("Ctrl");
      if (e.shiftKey) keys.push("Shift");
      if (e.altKey) keys.push("Alt");
      if (e.metaKey) keys.push("Cmd");
      if (e.key === " ") keys.push("Space");
      else if (e.key && e.key.length === 1) keys.push(e.key.toUpperCase());
      else if (e.key && e.key.startsWith("F")) keys.push(e.key);

      // Must have at least one non-modifier key
      const hasRealKey = keys.some(
        (k) => !["Ctrl", "Shift", "Alt", "Cmd"].includes(k),
      );
      if (keys.length > 0 && hasRealKey) {
        const hotkey = keys.join("+");
        display.value = hotkey;
        ipcRenderer.send("set-hotkey", hotkey);
        listening = false;
        document.removeEventListener("keydown", onKey);
        btn.textContent = "Change";
        btn.disabled = false;
      }
    };

    document.addEventListener("keydown", onKey);
    setTimeout(() => {
      if (listening) {
        listening = false;
        document.removeEventListener("keydown", onKey);
        btn.textContent = "Change";
        btn.disabled = false;
      }
    }, 5000);
  });
}

// ── Account & Updates ────────────────────────────────────────────────────────

function initActions() {
  const acct = document.getElementById("account-btn");
  if (acct)
    acct.addEventListener("click", () => ipcRenderer.send("open-checkout"));

  const getPro = document.getElementById("get-pro-btn");
  if (getPro)
    getPro.addEventListener("click", () => ipcRenderer.send("open-checkout"));

  const upd = document.getElementById("updates-btn");
  if (upd)
    upd.addEventListener("click", () => ipcRenderer.send("check-for-updates"));

  const minimize = document.getElementById("win-minimize");
  if (minimize)
    minimize.addEventListener("click", () =>
      ipcRenderer.send("window-minimize"),
    );

  const close = document.getElementById("win-close");
  if (close)
    close.addEventListener("click", () => ipcRenderer.send("window-close"));
}

// ── AI / API Key ─────────────────────────────────────────────────────────────

function initAiPanel() {
  const input = document.getElementById("groq-api-key");
  const btn = document.getElementById("save-api-key-btn");
  const testBtn = document.getElementById("test-api-key-btn");
  const status = document.getElementById("api-key-status");

  ipcRenderer.send("load-api-key");
  ipcRenderer.on("api-key-loaded", (_, key) => {
    if (key && input) {
      input.value = key;
      input.placeholder = "gsk_...";
    }
  });

  if (btn && input && status) {
    btn.addEventListener("click", () => {
      const key = input.value.trim();
      if (!key) return;
      ipcRenderer.send("save-api-key", key);
      status.style.display = "block";
      status.style.color = "rgba(192,132,252,0.9)";
      status.textContent =
        "Saved. Groq will use this key for all transcriptions.";
      setTimeout(() => {
        status.style.display = "none";
      }, 3000);
    });
  }

  if (testBtn && input && status) {
    testBtn.addEventListener("click", () => {
      const key = input.value.trim();
      if (!key) {
        status.style.display = "block";
        status.style.color = "rgba(244,114,182,0.9)";
        status.textContent = "Paste your API key first.";
        return;
      }
      testBtn.textContent = "Testing...";
      testBtn.disabled = true;
      ipcRenderer.send("validate-api-key", key);
    });
  }

  ipcRenderer.on("api-key-valid", (_, valid) => {
    if (!testBtn || !status) return;
    testBtn.textContent = "Test";
    testBtn.disabled = false;
    status.style.display = "block";
    if (valid) {
      status.style.color = "rgba(52,211,153,0.9)";
      status.textContent = "Connected. Key works.";
      ipcRenderer.send(
        "save-api-key",
        document.getElementById("groq-api-key").value.trim(),
      );
    } else {
      status.style.color = "rgba(244,114,182,0.9)";
      status.textContent = "Invalid key. Double-check it at console.groq.com.";
    }
    setTimeout(() => {
      status.style.display = "none";
    }, 4000);
  });
}

// ── Trial banner ──────────────────────────────────────────────────────────────

function initTrialBanner() {
  ipcRenderer.send("get-trial-info");
  ipcRenderer.on("trial-info", (_, info) => {
    const banner = document.getElementById("trial-banner");
    const text = document.getElementById("trial-days-text");
    if (!banner || !text) return;
    if (info.hasLicense) return;
    if (info.active) {
      banner.style.display = "block";
      text.textContent = `${info.daysLeft} day${info.daysLeft === 1 ? "" : "s"} left in your free trial. Upgrade to keep using dictate.app.`;
    } else {
      banner.style.display = "block";
      banner.style.background = "rgba(244,114,182,0.1)";
      banner.style.borderColor = "rgba(244,114,182,0.3)";
      text.style.color = "rgba(244,114,182,0.95)";
      text.textContent =
        "Your trial has expired. Upgrade now to continue dictating.";
    }
  });
}

// ── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initPreferences();
  initKeybindings();
  initActions();
  initAiPanel();
  initTrialBanner();
  ipcRenderer.send("get-stats");
  setInterval(() => ipcRenderer.send("get-stats"), 3000);
});
