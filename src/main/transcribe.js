const Groq = require("groq-sdk");
const fs = require("fs");
const path = require("path");
const os = require("os");

function buildGroqClient(apiKey) {
  if (!apiKey)
    throw new Error("No Groq API key. Add yours in Settings → API Key.");
  return new Groq({ apiKey });
}

async function transcribeAudioBuffer(audioBuffer, apiKey) {
  const client = buildGroqClient(apiKey);

  const tempPath = path.join(os.tmpdir(), `dictate-${Date.now()}.webm`);
  fs.writeFileSync(tempPath, Buffer.from(audioBuffer));

  try {
    const result = await client.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: "whisper-large-v3-turbo",
      response_format: "text",
    });
    return typeof result === "string"
      ? result.trim()
      : (result.text?.trim() ?? "");
  } finally {
    fs.unlinkSync(tempPath);
  }
}

module.exports = { buildGroqClient, transcribeAudioBuffer };
