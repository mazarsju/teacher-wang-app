import { overallScore, scoreTier } from "./overallScore";

describe("overallScore", () => {
  it("sums vocabulary and grammar scores", () => {
    expect(overallScore(60, 40)).toBe(100);
  });
});

describe("scoreTier", () => {
  it("is excellent above 180", () => {
    expect(scoreTier(181)).toBe("excellent");
    expect(scoreTier(200)).toBe("excellent");
  });

  it("is good above 160 up to and including 180", () => {
    expect(scoreTier(180)).toBe("good");
    expect(scoreTier(161)).toBe("good");
  });

  it("is fair above 130 up to and including 160", () => {
    expect(scoreTier(160)).toBe("fair");
    expect(scoreTier(131)).toBe("fair");
  });

  it("is poor at or below 130", () => {
    expect(scoreTier(130)).toBe("poor");
    expect(scoreTier(0)).toBe("poor");
  });
});
