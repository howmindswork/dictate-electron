const Groq = require("groq-sdk");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { app } = require("electron");

function buildGroqClient(apiKey) {
  if (!apiKey)
    throw new Error("No Groq API key. Add yours in Settings → API Key.");
  return new Groq({ apiKey });
}

async function transcribeAudioBuffer(audioBuffer, apiKey, prefs) {
  const client = buildGroqClient(apiKey);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const tempPath = path.join(os.tmpdir(), `dictate-${Date.now()}.webm`);
  fs.writeFileSync(tempPath, Buffer.from(audioBuffer));

  try {
    const requestParams = {
      file: fs.createReadStream(tempPath),
      model: "whisper-large-v3-turbo",
      response_format: "text",
    };

    // Auto-detect language: if disabled, force a fixed language
    if (prefs && prefs.autoDetectLanguageEnabled === false) {
      requestParams.language = prefs.language || "en";
    }

    const result = await client.audio.transcriptions.create(requestParams);
    return typeof result === "string"
      ? result.trim()
      : (result.text?.trim() ?? "");
  } finally {
    // Save recording if enabled
    if (prefs && prefs.saveRecordingsEnabled) {
      try {
        const docsPath = app.getPath("documents");
        const saveDir = path.join(docsPath, "dictate-recordings");
        if (!fs.existsSync(saveDir)) {
          fs.mkdirSync(saveDir, { recursive: true });
        }
        const savePath = path.join(saveDir, `${timestamp}.webm`);
        fs.copyFileSync(tempPath, savePath);
      } catch (saveErr) {
        console.error("Failed to save recording:", saveErr.message);
      }
    }
    fs.unlinkSync(tempPath);
  }
}

module.exports = { buildGroqClient, transcribeAudioBuffer };
