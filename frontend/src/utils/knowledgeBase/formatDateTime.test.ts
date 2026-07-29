import { describe, expect, it } from "vitest";
import { formatDateTime } from "./formatDateTime";

describe("formatDateTime", () => {
  it("formats a valid ISO timestamp", () => {
    const formatted = formatDateTime("2026-07-12T12:00:00.000Z");
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("returns the original string for invalid input", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });
});
