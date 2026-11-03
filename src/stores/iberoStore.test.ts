import { describe, expect, it } from "vitest";
import { parseIberoContext } from "./iberoStore";

const base = { apiUrl: "http://api.test", organizationId: "org-1", datasetId: "d1" };

describe("parseIberoContext canPublish", () => {
  it("is false only when Ibero Data says the user cannot save", () => {
    expect(parseIberoContext({ ...base, canPublish: false })?.canPublish).toBe(false);
    expect(parseIberoContext({ ...base, canPublish: true, publishToken: "t" })?.canPublish).toBe(true);
    // Contexts saved before the flag existed came with a publish token.
    expect(parseIberoContext({ ...base, publishToken: "t" })?.canPublish).toBe(true);
  });
});
