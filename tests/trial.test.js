const { isTrialActive, daysLeft } = require("../src/main/trial");

describe("trial logic", () => {
  test("trial is active when installed today", () => {
    const now = new Date();
    expect(isTrialActive(now)).toBe(true);
  });

  test("trial is active on day 14", () => {
    const day14 = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
    expect(isTrialActive(day14)).toBe(true);
  });

  test("trial is expired after 14 days", () => {
    const day15 = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    expect(isTrialActive(day15)).toBe(false);
  });

  test("daysLeft returns 14 when installed today", () => {
    const now = new Date();
    expect(daysLeft(now)).toBe(14);
  });

  test("daysLeft returns 0 when expired", () => {
    const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    expect(daysLeft(old)).toBe(0);
  });
});
