import { describe, expect, it } from "vitest";
import { sameSelection } from "./createStore";

describe("sameSelection", () => {
  it("keeps the identity of equal lists and tells different selections apart", () => {
    expect(sameSelection(["a"], ["a"])).toBe(true);
    expect(sameSelection([], [])).toBe(true);
    expect(sameSelection(["a"], ["b"])).toBe(false);
    expect(sameSelection(undefined, { id: 1 })).toBe(false);
    expect(sameSelection({ id: 1 }, { id: 1 })).toBe(false);
  });
});
