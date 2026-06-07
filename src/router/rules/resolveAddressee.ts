import type { Aboutness, AddresseeResult, FollowupResult, IncomingMessageContext, InvocationResult, NormalizedMessage, PronounContext } from "../types.js";

function directOtherUserAddress(ctx: IncomingMessageContext, normalized: NormalizedMessage): boolean {
  const mentions = ctx.mentions ?? [];
  if (mentions.some((mention) => !mention.isBot)) return true;
  return /^[^\s,]{1,16}(아|야|님)[\s,]/u.test(normalized.text) && !/^(결아|귤아|키올아)/u.test(normalized.text);
}

function resolvePronouns(target: AddresseeResult["target"], ctx: IncomingMessageContext): PronounContext {
  const hasYou = /(?:^|\s)(너|너는|넌|네가|니가|당신)(?:\s|$)/u.test(ctx.content ?? "");
  const hasMe = /(?:^|\s)(나|나는|난|내가|저|제가)(?:\s|$)/u.test(ctx.content ?? "");
  return {
    youRef: hasYou ? (target === "keyol" ? "keyol" : target === "other_user" ? "other_user" : "unknown") : "unknown",
    meRef: hasMe ? "speaker" : "unknown"
  };
}

export function resolveAddressee(
  ctx: IncomingMessageContext,
  normalized: NormalizedMessage,
  invocation: InvocationResult,
  aboutness: Aboutness,
  followup: FollowupResult
): AddresseeResult {
  const reasons: string[] = [];
  let target: AddresseeResult["target"] = "channel";
  let callType: AddresseeResult["callType"] = "ambient";
  let confidence = 0.25;

  if (invocation.strength === "strong") {
    target = "keyol";
    callType = "direct_call";
    confidence = invocation.confidence;
    reasons.push(...invocation.reasons);
  } else if (directOtherUserAddress(ctx, normalized)) {
    target = "other_user";
    callType = "ambient";
    confidence = 0.75;
    reasons.push("other_user_addressed");
  } else if (followup.isFollowup) {
    target = "keyol";
    callType = "followup";
    confidence = followup.confidence;
    reasons.push(...followup.reasons);
  } else if (aboutness.isAboutKeyol && aboutness.invitesEntry) {
    target = "keyol";
    callType = aboutness.mode === "identity_discussion" ? "identity_about_keyol" : "invited_entry";
    confidence = Math.max(0.55, aboutness.confidence);
    reasons.push(...aboutness.reasons);
  } else if (aboutness.isAboutKeyol) {
    target = "channel";
    callType = "mention_about";
    confidence = aboutness.confidence;
    reasons.push("about_keyol_without_invitation", ...aboutness.reasons);
  }

  return { target, callType, pronouns: resolvePronouns(target, ctx), confidence, reasons };
}
