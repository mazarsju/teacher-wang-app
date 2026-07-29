import { getMotivationMessages } from "./homeMotivation";

describe("getMotivationMessages", () => {
  it("returns no messages for low character counts", () => {
    expect(getMotivationMessages(100)).toEqual([]);
  });

  it("adds newspaper and school messages at the configured thresholds", () => {
    expect(getMotivationMessages(1001)).toEqual([
      "You should know more than 90% of the characters in a newspaper",
    ]);

    expect(getMotivationMessages(2501)).toEqual([
      "You should know more than 90% of the characters in a newspaper",
      "You should know more than 98% of the characters of a newspaper",
      "You know more characters than a kid at the end of primary school !",
    ]);

    expect(getMotivationMessages(3001)).toEqual([
      "You should know more than 90% of the characters in a newspaper",
      "You should know more than 98% of the characters of a newspaper",
      "You should know more than 99% of the characters of a newspaper",
      "You know more characters than a kid at the end of primary school !",
    ]);
  });
});
