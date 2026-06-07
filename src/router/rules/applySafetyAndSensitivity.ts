import type { RouterDecision, SafetyPolicy } from "../types.js";

export function applySafetyAndSensitivity(decision: RouterDecision, sensitivity: "none" | "low" | "medium" | "high", policy: SafetyPolicy): RouterDecision {
  if (sensitivity === "high" && policy.dropHighSensitivity) {
    return {
      ...decision,
      action: decision.action === "no_response" ? "no_response" : "listen_only",
      gemini: "skip",
      transcript: "save_redacted",
      memoryCandidate: "none",
      reasons: [...decision.reasons, "high_sensitivity_no_gemini"]
    };
  }
  if ((sensitivity === "medium" || sensitivity === "low") && policy.redactSensitive) {
    return { ...decision, transcript: "save_redacted", reasons: [...decision.reasons, "sensitive_redaction"] };
  }
  return decision;
}
