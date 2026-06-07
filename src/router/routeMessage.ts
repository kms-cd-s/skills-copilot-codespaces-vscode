import type { AliasPolicy, ConversationState, IncomingMessageContext, RouterDecision, RouterPolicy } from "./types.js";
import { normalizeMessage } from "./normalize.js";
import { resolvePolicy } from "./policies/defaults.js";
import { classifyMessageShape } from "./rules/classifyMessageShape.js";
import { resolveSpeaker } from "./rules/resolveSpeaker.js";
import { detectInvocation } from "./rules/detectInvocation.js";
import { detectAboutness } from "./rules/detectAboutness.js";
import { resolveFollowup } from "./rules/resolveFollowup.js";
import { resolveAddressee } from "./rules/resolveAddressee.js";
import { scoreEntryOpportunity } from "./rules/scoreEntryOpportunity.js";
import { classifyPersistence } from "./rules/classifyPersistence.js";
import { selectAction } from "./rules/selectAction.js";
import { applySafetyAndSensitivity } from "./rules/applySafetyAndSensitivity.js";
import { applyRateLimits } from "./rules/applyRateLimits.js";

function noResponse(reason: string): RouterDecision {
  return {
    target: "ignore",
    callType: "system",
    action: "no_response",
    gemini: "skip",
    transcript: "drop",
    memoryCandidate: "none",
    confidence: 0,
    reasons: [reason]
  };
}

function mergeChannelAliases(aliasPolicy: AliasPolicy, channelAliases: string[] = []): AliasPolicy {
  return {
    ...aliasPolicy,
    canonical: [...aliasPolicy.canonical, ...channelAliases],
    vocative: [...aliasPolicy.vocative, ...channelAliases],
    weakReference: [...aliasPolicy.weakReference, ...channelAliases]
  };
}

export function routeMessage(ctx: IncomingMessageContext, state: ConversationState, policy: RouterPolicy = {}): RouterDecision {
  const resolved = resolvePolicy(policy);
  const normalized = normalizeMessage(ctx);
  const shape = classifyMessageShape(ctx, resolved.limitPolicy);

  if (shape.isSystem || shape.isOtherBot || shape.isEmpty || shape.isCommand) {
    return noResponse(shape.reasons[0] ?? "ignored_shape");
  }

  const speaker = resolveSpeaker(ctx, resolved.makerPolicy);
  const aliasPolicy = mergeChannelAliases(resolved.aliasPolicy, resolved.channelPolicy.aliases);
  const invocation = detectInvocation(normalized, ctx, aliasPolicy, state.botUserId);
  const aboutness = detectAboutness(normalized, invocation, aliasPolicy);
  const followup = resolveFollowup(ctx, state, speaker, resolved.makerPolicy);
  const addressee = resolveAddressee(ctx, normalized, invocation, aboutness, followup);
  const entry = scoreEntryOpportunity(invocation, aboutness, followup, addressee, speaker, resolved.channelPolicy);
  const persistence = classifyPersistence(ctx, addressee, aboutness, speaker);

  let decision = selectAction({
    ctx,
    normalized,
    speaker,
    invocation,
    aboutness,
    addressee,
    entry,
    persistence,
    channelPolicy: resolved.channelPolicy
  });

  decision = applySafetyAndSensitivity(decision, persistence.sensitivity, resolved.safetyPolicy);
  decision = applyRateLimits(decision, ctx, state, resolved.limitPolicy, shape);

  return decision;
}
