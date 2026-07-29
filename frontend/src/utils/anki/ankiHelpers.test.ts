import { describe, expect, it } from "vitest";
import { readErrorMessage, statusFromSyncCounts, versoSignificantPart } from "./ankiHelpers";

describe("statusFromSyncCounts", () => {
  it("returns not_configured when not configured", () => {
    expect(
      statusFromSyncCounts({
        configured: false,
        pushCount: 0,
        pullCount: 0,
      }),
    ).toBe("not_configured");
  });

  it("returns not_synchronized when push, pull, or unsyncable remain", () => {
    expect(
      statusFromSyncCounts({
        configured: true,
        pushCount: 1,
        pullCount: 0,
      }),
    ).toBe("not_synchronized");
    expect(
      statusFromSyncCounts({
        configured: true,
        pushCount: 0,
        pullCount: 2,
      }),
    ).toBe("not_synchronized");
    expect(
      statusFromSyncCounts({
        configured: true,
        pushCount: 0,
        pullCount: 0,
        unsyncableCount: 1,
      }),
    ).toBe("not_synchronized");
  });

  it("returns synchronized when nothing is pending", () => {
    expect(
      statusFromSyncCounts({
        configured: true,
        pushCount: 0,
        pullCount: 0,
      }),
    ).toBe("synchronized");
  });
});

describe("versoSignificantPart", () => {
  it("keeps text before the first dash", () => {
    expect(versoSignificantPart("你好-annotation")).toBe("你好");
    expect(versoSignificantPart("水")).toBe("水");
  });
});

describe("readErrorMessage", () => {
  it("reads error from JSON body", async () => {
    const response = {
      json: async () => ({ error: "boom" }),
    } as Response;
    await expect(readErrorMessage(response, "fallback")).resolves.toBe("boom");
  });

  it("falls back when body has no error", async () => {
    const response = {
      json: async () => ({}),
    } as Response;
    await expect(readErrorMessage(response, "fallback")).resolves.toBe(
      "fallback",
    );
  });
});
