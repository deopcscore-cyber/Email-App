import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  avatarHue,
  displayName,
  formatBytes,
  formatListTime,
  initials,
} from "./format";

describe("formatListTime", () => {
  beforeEach(() => {
    // Fixed "now" so same-day/yesterday/older branches are deterministic.
    vi.setSystemTime(new Date("2026-07-11T18:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a same-day timestamp as a time", () => {
    expect(formatListTime(new Date("2026-07-11T09:05:00").toISOString())).toMatch(
      /9:05/,
    );
  });

  it("renders yesterday as 'Yesterday'", () => {
    expect(formatListTime(new Date("2026-07-10T22:00:00").toISOString())).toBe(
      "Yesterday",
    );
  });

  it("renders an older same-year date without the year", () => {
    const result = formatListTime(new Date("2026-05-01T09:00:00").toISOString());
    expect(result).toContain("May 1");
    expect(result).not.toContain("2026");
  });

  it("includes the year for a date in a different year", () => {
    const result = formatListTime(new Date("2025-05-01T09:00:00").toISOString());
    expect(result).toContain("2025");
  });
});

describe("displayName", () => {
  it("prefers the address name when present", () => {
    expect(displayName({ name: "Sarah Chen", email: "sarah@acme.com" })).toBe(
      "Sarah Chen",
    );
  });

  it("falls back to the email's local part when name is null", () => {
    expect(displayName({ name: null, email: "sarah@acme.com" })).toBe("sarah");
  });
});

describe("initials", () => {
  it("takes the first letter of the first and last word", () => {
    expect(initials({ name: "Sarah Chen", email: "sarah@acme.com" })).toBe("SC");
  });

  it("handles a single-word name", () => {
    expect(initials({ name: "Sarah", email: "sarah@acme.com" })).toBe("S");
  });

  it("falls back to the email local part when name is null", () => {
    expect(initials({ name: null, email: "sarah@acme.com" })).toBe("S");
  });

  it("uppercases the result", () => {
    expect(initials({ name: "sarah chen", email: "sarah@acme.com" })).toBe("SC");
  });
});

describe("avatarHue", () => {
  it("is deterministic for the same email", () => {
    const a = avatarHue("sarah@acme.com");
    const b = avatarHue("sarah@acme.com");
    expect(a).toBe(b);
  });

  it("differs across distinct emails (no accidental collisions for these cases)", () => {
    expect(avatarHue("sarah@acme.com")).not.toBe(avatarHue("alex@brightlabs.io"));
  });

  it("always returns a value in [0, 360)", () => {
    for (const email of ["a@a.com", "zzzzzz@z.com", "x@y.io", ""]) {
      const hue = avatarHue(email);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});

describe("formatBytes", () => {
  it("renders bytes under 1KB verbatim", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("renders kilobytes rounded to the nearest whole number", () => {
    expect(formatBytes(1536)).toBe("2 KB");
  });

  it("renders megabytes with one decimal place", () => {
    expect(formatBytes(2_516_582)).toBe("2.4 MB");
  });
});
