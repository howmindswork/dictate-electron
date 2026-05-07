const TRIAL_DAYS = 7;
const OWNER_KEYS = ["DICTATE-OWNER-2026", "HMW-ADMIN-FOREVER"];

function isOwnerKey(key) {
  return OWNER_KEYS.includes(key);
}

function isTrialActive(installDate) {
  const msElapsed = Date.now() - new Date(installDate).getTime();
  const daysElapsed = msElapsed / (1000 * 60 * 60 * 24);
  return daysElapsed < TRIAL_DAYS;
}

function daysLeft(installDate) {
  const msElapsed = Date.now() - new Date(installDate).getTime();
  const daysElapsed = msElapsed / (1000 * 60 * 60 * 24);
  const remaining = Math.ceil(TRIAL_DAYS - daysElapsed);
  return Math.max(0, remaining);
}

const TRIAL_WORKER_BASE = "https://trial-worker.howmindswork.workers.dev";
const TRIAL_WORKER_URL = `${TRIAL_WORKER_BASE}/api/check-trial`;

async function checkRemoteTrial(fingerprint) {
  try {
    const res = await fetch(TRIAL_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fingerprint }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function validateLicenseKey(key) {
  // Owner keys always pass without a network call
  if (isOwnerKey(key)) return true;

  try {
    const res = await fetch(`${TRIAL_WORKER_BASE}/api/validate-license`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.valid === true;
  } catch {
    // Network failure — fall back to owner key check (already done above)
    return false;
  }
}

module.exports = {
  isTrialActive,
  daysLeft,
  TRIAL_DAYS,
  isOwnerKey,
  OWNER_KEYS,
  checkRemoteTrial,
  validateLicenseKey,
};
