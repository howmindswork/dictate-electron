const TRIAL_DAYS = 14;

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

module.exports = { isTrialActive, daysLeft, TRIAL_DAYS };
