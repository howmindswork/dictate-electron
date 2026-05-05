const { keyboard, Key } = require("keysender");
const { clipboard } = require("electron");

async function injectText(text) {
  if (!text || !text.trim()) return;

  clipboard.writeText(text);
  await new Promise((r) => setTimeout(r, 50));

  await keyboard.toggleKey(Key.Control, true);
  await keyboard.sendKey(Key.V);
  await keyboard.toggleKey(Key.Control, false);
}

module.exports = { injectText };
