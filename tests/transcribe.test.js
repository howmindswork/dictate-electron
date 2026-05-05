const { buildGroqClient } = require("../src/main/transcribe");

describe("transcribe", () => {
  test("buildGroqClient returns client with audio property", () => {
    const client = buildGroqClient("test-api-key");
    expect(client).toHaveProperty("audio");
  });
});
