const { clipboard } = require("electron");
const { execSync } = require("child_process");

async function injectText(text) {
  if (!text || !text.trim()) return;

  clipboard.writeText(text);
  await new Promise((r) => setTimeout(r, 100));

  // Simulate Ctrl+V via PowerShell SendKeys — no native deps needed
  execSync(
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "` +
      `Add-Type -AssemblyName System.Windows.Forms; ` +
      `[System.Windows.Forms.SendKeys]::SendWait('^v')"`,
    { windowsHide: true },
  );
}

module.exports = { injectText };
