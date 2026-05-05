require("dotenv").config();
const Groq = require("groq-sdk");
const fs = require("fs");
const path = require("path");
const os = require("os");

function buildGroqClient(apiKey) {
  return new Groq({ apiKey: apiKey || process.env.GROQ_API_KEY });
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
