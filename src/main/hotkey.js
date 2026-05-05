const { uIOhook } = require("uiohook-napi");

const MIDDLE_MOUSE_BUTTON = 1;

function setupHotkey(onPress) {
  uIOhook.on("mousedown", (event) => {
    if (event.button === MIDDLE_MOUSE_BUTTON) {
      onPress();
    }
  });
  uIOhook.start();
}

function teardown() {
  uIOhook.stop();
}

module.exports = { setupHotkey, teardown };
