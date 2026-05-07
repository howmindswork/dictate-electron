const { execSync } = require("child_process");
const crypto = require("crypto");

function getMachineId() {
  try {
    const uuid =
      execSync("wmic csproduct get UUID", { encoding: "utf8" })
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && l !== "UUID")[0] || "";

    const mac = execSync("getmac /fo csv /nh", { encoding: "utf8" })
      .split("\n")[0]
      .split(",")[0]
      .replace(/"/g, "")
      .trim();

    return crypto
      .createHash("sha256")
      .update(uuid + mac)
      .digest("hex");
  } catch {
    return crypto
      .createHash("sha256")
      .update(process.env.COMPUTERNAME || "fallback")
      .digest("hex");
  }
}

module.exports = { getMachineId };
