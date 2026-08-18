import { describe, expect, it } from "vitest";
import { classifyProfileActivity, resolveBrazilEligibility } from "./provider-contracts";

describe("Intent v1 provider contracts", () => {
  it("accepts only a literal Brazilian country returned by enrichment", () => {
    expect(resolveBrazilEligibility("Brazil")).toEqual({
      status: "confirmed_brazil",
      country: "Brazil",
    });
    expect(resolveBrazilEligibility("Brasil").status).toBe("confirmed_brazil");
    expect(resolveBrazilEligibility("United States")).toEqual({
      status: "outside_brazil",
      country: "United States",
    });
    expect(resolveBrazilEligibility(null)).toEqual({
      status: "pending_verification",
      country: null,
    });
  });

  it("does not confuse a succeeded HarvestAPI run with an available profile", () => {
    expect(
      classifyProfileActivity({
        provider: "harvestapi",
        runStatus: "SUCCEEDED",
        datasetItems: [],
        logMessages: ["Error fetching profile-reactions page 1: No valid source provided"],
      }),
    ).toBe("profile_unavailable");
  });

  it("recognizes the typed fallback error item", () => {
    expect(
      classifyProfileActivity({
        provider: "scraping_solutions",
        runStatus: "SUCCEEDED",
        datasetItems: [{ sourceType: "error", inputUsername: "unavailable-profile" }],
      }),
    ).toBe("profile_unavailable");
  });

  it("keeps an empty dataset uncertain when the provider supplies no diagnostic", () => {
    expect(
      classifyProfileActivity({
        provider: "harvestapi",
        runStatus: "SUCCEEDED",
        datasetItems: [],
      }),
    ).toBe("provider_partial");
  });

  it("separates valid emptiness, activity and provider failure", () => {
    expect(
      classifyProfileActivity({
        provider: "harvestapi",
        runStatus: "SUCCEEDED",
        datasetItems: [],
        logMessages: ["Finished profile activity scan"],
      }),
    ).toBe("no_activity");
    expect(
      classifyProfileActivity({
        provider: "harvestapi",
        runStatus: "SUCCEEDED",
        datasetItems: [{ action: "commented" }],
      }),
    ).toBe("activity_available");
    expect(
      classifyProfileActivity({
        provider: "harvestapi",
        runStatus: "FAILED",
        datasetItems: [],
      }),
    ).toBe("provider_error");
  });
});
