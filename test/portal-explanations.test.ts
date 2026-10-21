// Each owner's portal is published from the portal folder alone, so it keeps its own
// copy of the plain-English explanations. This makes sure the copy never drifts.

import { describe, expect, it } from "vitest";
import { EXPLANATIONS } from "../src/explanations.js";
import { EXPLANATIONS as PORTAL_EXPLANATIONS } from "../portal/src/explanations.js";

describe("the portal's copy of the explanations", () => {
  it("matches the command-line tool's explanations exactly", () => {
    expect(PORTAL_EXPLANATIONS).toEqual(EXPLANATIONS);
  });
});
