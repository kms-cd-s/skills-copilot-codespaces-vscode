import type { ConversationState, IncomingMessageContext, LimitPolicy, MessageShape, RouterDecision } from "../types.js";
import { getFallbackTemplate } from "../fallbacks/templates.js";

function countSince<T extends { timestamp: number }>(items: T[] | undefined, since: number): number {
  return (items ?? []).filter((item) => item.timestamp >= since).length;
}

export function applyRateLimits(
  decision: RouterDecision,
  ctx: IncomingMessageContext,
  state: ConversationState,
  limits: LimitPolicy,
  shape: MessageShape
): RouterDecision {
  if (shape.isCommand || shape.isSystem || shape.isOtherBot || shape.isEmpty) {
    return {
      ...decision,
      target: "ignore",
      callType: "system",
      action: "no_response",
      gemini: "skip",
      transcript: "drop",
      memoryCandidate: "none",
      reasons: [...decision.reasons, ...shape.reasons]
    };
  }

  if (shape.isTooLong || shape.isAttachmentOnly) {
    const reason = shape.isTooLong ? "too_long" : "attachment_only";
    return {
      ...decision,
      action: decision.target === "keyol" ? "reply_short" : "listen_only",
      gemini: decision.target === "keyol" ? "fallback_template" : "skip",
      fallbackTemplate: getFallbackTemplate(reason),
      reasons: [...decision.reasons, reason]
    };
  }

  const userMessageCount = countSince(state.userMessageCounts?.filter((item) => item.userId === ctx.authorId), ctx.timestamp - limits.userWindowMs);
  if (userMessageCount > limits.userMaxMessagesPerWindow && decision.gemini === "call") {
    return {
      ...decision,
      gemini: "fallback_template",
      fallbackTemplate: getFallbackTemplate("rate_limited"),
      reasons: [...decision.reasons, "user_rate_limited"]
    };
  }

  const recentChannelResponses = countSince(
    state.recentBotResponses?.filter((item) => item.channelId === ctx.channelId),
    ctx.timestamp - limits.channelResponseWindowMs
  );
  if (recentChannelResponses >= limits.channelMaxResponses && decision.gemini === "call") {
    return {
      ...decision,
      gemini: "fallback_template",
      fallbackTemplate: getFallbackTemplate("rate_limited"),
      reasons: [...decision.reasons, "channel_response_budget_exhausted"]
    };
  }

  const dailyLimit = state.geminiDailyLimit ?? 0;
  if (dailyLimit > 0 && (state.geminiCallsToday ?? 0) / dailyLimit >= limits.geminiDailySoftLimitRatio && decision.gemini === "call") {
    return {
      ...decision,
      gemini: "fallback_template",
      fallbackTemplate: getFallbackTemplate("gemini_quota_risk"),
      reasons: [...decision.reasons, "gemini_quota_risk"]
    };
  }

  return decision;
}
