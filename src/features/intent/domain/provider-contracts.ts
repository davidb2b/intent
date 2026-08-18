export const BRAZIL_COUNTRY_LITERALS = ["brazil", "brasil", "br"] as const;

export type RegionalEligibility =
  | { status: "confirmed_brazil"; country: string }
  | { status: "outside_brazil"; country: string }
  | { status: "pending_verification"; country: null };

export function resolveBrazilEligibility(country: unknown): RegionalEligibility {
  if (typeof country !== "string" || !country.trim()) {
    return { status: "pending_verification", country: null };
  }

  const literal = country.trim();
  const normalized = literal.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if ((BRAZIL_COUNTRY_LITERALS as readonly string[]).includes(normalized)) {
    return { status: "confirmed_brazil", country: literal };
  }

  return { status: "outside_brazil", country: literal };
}

export type ProfileActivityState =
  | "activity_available"
  | "no_activity"
  | "profile_unavailable"
  | "provider_partial"
  | "provider_error";

export interface ProfileActivityObservation {
  provider: "harvestapi" | "scraping_solutions";
  runStatus: "SUCCEEDED" | "FAILED" | "TIMED-OUT" | "ABORTED";
  datasetItems: unknown[];
  logMessages?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function classifyProfileActivity(
  observation: ProfileActivityObservation,
): ProfileActivityState {
  if (observation.runStatus !== "SUCCEEDED") return "provider_error";

  const fallbackError = observation.datasetItems.some((item) => {
    if (!isRecord(item)) return false;
    return item.sourceType === "error" || item.type === "error";
  });
  if (fallbackError) return "profile_unavailable";

  if (observation.datasetItems.length > 0) return "activity_available";

  const normalizedLog = (observation.logMessages ?? []).join("\n").toLowerCase();
  if (
    normalizedLog.includes("no valid source provided") ||
    normalizedLog.includes("profile not found") ||
    normalizedLog.includes("profile unavailable")
  ) {
    return "profile_unavailable";
  }

  if (!observation.logMessages) return "provider_partial";
  return "no_activity";
}
