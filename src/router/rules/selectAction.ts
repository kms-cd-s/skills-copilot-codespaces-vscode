import type { Aboutness, AddresseeResult, ChannelPolicy, EntryScore, GeminiDecision, IncomingMessageContext, InvocationResult, NormalizedMessage, PersistenceDecision, RouterAction, RouterDecision, SpeakerRole } from "../types.js";
import { getFallbackTemplate } from "../fallbacks/templates.js";

function isCrisis(text: string): boolean {
  return /(죽고싶|자해|살려줘|위험해|극단적|숨을 못|응급)/u.test(text);
}

function needsGemini(input: {
  action: RouterAction;
  text: string;
  aboutness: Aboutness;
  addressee: AddresseeResult;
  normalized: NormalizedMessage;
}): GeminiDecision {
  const { action, text, aboutness, addressee, normalized } = input;

  if (["listen_only", "no_response", "consider_entry", "low_intervention"].includes(action)) return "skip";
  if (action === "crisis_reply") return "call";
  if (action === "reply_short" && ["status_question", "troubleshooting"].includes(aboutness.mode)) return "fallback_template";
  if (addressee.callType === "followup" && normalized.isQuestion) return "call";
  if (action === "reply_now") return "call";
  if (text.length < 20) return "fallback_template";
  return "call";
}

function templateReason(input: {
  action: RouterAction;
  aboutness: Aboutness;
  addressee: AddresseeResult;
}): string {
  const { action, aboutness, addressee } = input;
  if (action === "reply_short" && aboutness.mode === "status_question") return "status_question";
  if (action === "reply_short" && aboutness.mode === "troubleshooting") return "troubleshooting";
  if (addressee.callType === "followup") return "short_followup";
  return "short_reply";
}

export function selectAction(input: {
  ctx: IncomingMessageContext;
  normalized: NormalizedMessage;
  speaker: SpeakerRole;
  invocation: InvocationResult;
  aboutness: Aboutness;
  addressee: AddresseeResult;
  entry: EntryScore;
  persistence: PersistenceDecision;
  channelPolicy: ChannelPolicy;
}): RouterDecision {
  const { ctx, normalized, speaker, invocation, aboutness, addressee, entry, persistence, channelPolicy } = input;
  const text = ctx.content ?? "";
  const reasons = [...invocation.reasons, ...aboutness.reasons, ...addressee.reasons, ...entry.reasons, ...persistence.reasons];

  if (!channelPolicy.canListen) {
    return {
      target: "ignore",
      callType: "system",
      action: "no_response",
      gemini: "skip",
      transcript: "drop",
      memoryCandidate: "none",
      confidence: 0,
      reasons: ["channel_cannot_listen"]
    };
  }

  let action: RouterAction = "listen_only";
  if (isCrisis(text)) action = "crisis_reply";
  else if (!channelPolicy.canSpeak || channelPolicy.mode === "quiet") action = "listen_only";
  else if (addressee.target === "keyol" && addressee.callType === "direct_call") action = "reply_now";
  else if (addressee.target === "keyol" && addressee.callType === "followup") action = "reply_if_question";
  else if (addressee.target === "keyol" && addressee.callType === "invited_entry" && channelPolicy.allowAmbientIntervention) {
    action = "consider_entry";
  } else if (addressee.target === "keyol" && aboutness.invitesEntry && entry.score >= (channelPolicy.responseThreshold ?? 0.65)) {
    action = aboutness.mode === "status_question" ? "reply_short" : "reply_if_question";
  } else if (aboutness.isAboutKeyol && entry.score >= 0.45 && channelPolicy.allowAmbientIntervention) {
    action = "consider_entry";
  }

  if (speaker === "maker" && action === "reply_if_question" && addressee.target === "keyol") action = "reply_now";

  const gemini = needsGemini({ action, text, aboutness, addressee, normalized });
  const fallbackTemplate = gemini === "fallback_template"
    ? getFallbackTemplate(templateReason({ action, aboutness, addressee }))
    : undefined;

  return {
    target: addressee.target,
    callType: addressee.callType,
    action,
    gemini,
    transcript: persistence.transcript,
    memoryCandidate: persistence.memoryCandidate,
    confidence: Math.max(addressee.confidence, entry.score),
    reasons,
    fallbackTemplate,
    pronouns: addressee.pronouns
  };
}
