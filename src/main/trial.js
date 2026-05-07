const TRIAL_DAYS = 30;
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

module.exports = {
  isTrialActive,
  daysLeft,
  TRIAL_DAYS,
  isOwnerKey,
  OWNER_KEYS,
};
