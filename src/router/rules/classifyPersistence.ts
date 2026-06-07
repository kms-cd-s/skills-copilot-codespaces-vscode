import type { Aboutness, AddresseeResult, IncomingMessageContext, PersistenceDecision, SpeakerRole } from "../types.js";

const HIGH_SENSITIVE_PATTERNS = [
  /(?:비밀번호|password|api[_-]?key|token|secret)\s*[:=]/iu,
  /\b\d{6}-\d{7}\b/u,
  /\b\d{3}-\d{3,4}-\d{4}\b/u
];
const MEDIUM_SENSITIVE_PATTERNS = [/(주소|계좌|카드번호|주민등록|병원|진단|처방)/u];

export function detectSensitivity(text: string): PersistenceDecision["sensitivity"] {
  if (HIGH_SENSITIVE_PATTERNS.some((pattern) => pattern.test(text))) return "high";
  if (MEDIUM_SENSITIVE_PATTERNS.some((pattern) => pattern.test(text))) return "medium";
  if (/(개인정보|사적인|비밀)/u.test(text)) return "low";
  return "none";
}

export function classifyPersistence(
  ctx: IncomingMessageContext,
  addressee: AddresseeResult,
  aboutness: Aboutness,
  speaker: SpeakerRole
): PersistenceDecision {
  const text = ctx.content ?? "";
  const sensitivity = detectSensitivity(text);
  const reasons: string[] = [];

  if (speaker === "bot" || speaker === "system") {
    return { transcript: "drop", memoryCandidate: "none", sensitivity, reasons: ["bot_or_system_drop"] };
  }

  if (sensitivity === "high") {
    return { transcript: "save_redacted", memoryCandidate: "none", sensitivity, reasons: ["high_sensitivity"] };
  }

  let transcript: PersistenceDecision["transcript"] = addressee.target === "keyol" ? "save_full" : "save_summary_only";
  if (sensitivity === "medium" || sensitivity === "low") {
    transcript = "save_redacted";
    reasons.push(`${sensitivity}_sensitivity`);
  }

  let memoryCandidate: PersistenceDecision["memoryCandidate"] = "none";
  if (addressee.target === "keyol") memoryCandidate = "daily_summary";
  if (aboutness.mode === "identity_discussion" || aboutness.mode === "memory_reference") memoryCandidate = "relationship_signal";
  if (speaker === "maker" && addressee.target === "keyol") memoryCandidate = "long_term_candidate";
  if (text.length < 40 && addressee.target !== "keyol") memoryCandidate = "short_chat";

  return { transcript, memoryCandidate, sensitivity, reasons };
}
