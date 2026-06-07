import type { AliasPolicy, IncomingMessageContext, InvocationResult, NormalizedMessage } from "../types.js";

const KOREAN_PARTICLES = "은는이가을를도만에게한테랑과와로으로야아께서부터까지처럼보다의";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasBotMention(ctx: IncomingMessageContext, botUserId: string): boolean {
  return (ctx.mentions ?? []).some((mention) => mention.id === botUserId);
}

function isReplyToBot(ctx: IncomingMessageContext, botUserId: string): boolean {
  return ctx.replyTo?.authorId === botUserId || Boolean(ctx.replyTo?.authorIsBot && ctx.replyTo.authorId === botUserId);
}

function isFalsePositive(normalized: NormalizedMessage, policy: AliasPolicy): string | undefined {
  const tokens = normalized.lower.split(/[\s,.:;!?！？~]+/u).filter(Boolean);
  return policy.falsePositivePrefixes.find((word) =>
    tokens.some((token) => token.startsWith(word.toLocaleLowerCase()))
  );
}

function startsWithAlias(text: string, aliases: string[]): string | undefined {
  return aliases.find((alias) => {
    const pattern = new RegExp(`^${escapeRegExp(alias.toLocaleLowerCase())}(?:[\\s,.:;!?！？~]|$)`, "u");
    return pattern.test(text);
  });
}

function endsWithVocative(text: string, aliases: string[]): string | undefined {
  return aliases.find((alias) => {
    const pattern = new RegExp(`(?:^|[\\s,])${escapeRegExp(alias.toLocaleLowerCase())}[\\s.?!！？~]*$`, "u");
    return pattern.test(text);
  });
}

function hasParticleReference(text: string, aliases: string[]): string | undefined {
  return aliases.find((alias) => {
    const escaped = escapeRegExp(alias.toLocaleLowerCase());
    const pattern = new RegExp(`(?:^|[\\s,])${escaped}(?:[${KOREAN_PARTICLES}]{1,3}|\\s+봇)(?:[\\s,.:;!?！？~]|$)`, "u");
    return pattern.test(text);
  });
}

export function detectInvocation(
  normalized: NormalizedMessage,
  ctx: IncomingMessageContext,
  policy: AliasPolicy,
  botUserId: string
): InvocationResult {
  if (isReplyToBot(ctx, botUserId)) {
    return { strength: "strong", kind: "reply_to_bot", confidence: 0.98, reasons: ["reply_to_bot"] };
  }

  if (hasBotMention(ctx, botUserId)) {
    return { strength: "strong", kind: "bot_mention", confidence: 0.96, reasons: ["bot_mention"] };
  }

  const falsePositive = isFalsePositive(normalized, policy);
  if (falsePositive) {
    return {
      strength: "none",
      kind: "false_positive",
      matched: falsePositive,
      confidence: 0.05,
      reasons: [`false_positive:${falsePositive}`]
    };
  }

  const startAlias = startsWithAlias(normalized.lower, [...policy.vocative, ...policy.canonical]);
  if (startAlias) {
    return {
      strength: "strong",
      kind: "start_alias",
      matched: startAlias,
      confidence: 0.93,
      reasons: [`start_alias:${startAlias}`]
    };
  }

  const endAlias = endsWithVocative(normalized.lower, policy.vocative);
  if (endAlias) {
    return {
      strength: "strong",
      kind: "end_vocative",
      matched: endAlias,
      confidence: 0.88,
      reasons: [`end_vocative:${endAlias}`]
    };
  }

  const weak = hasParticleReference(normalized.lower, policy.weakReference);
  if (weak) {
    return {
      strength: "weak",
      kind: "particle_reference",
      matched: weak,
      confidence: 0.58,
      reasons: [`particle_reference:${weak}`]
    };
  }

  return { strength: "none", kind: "none", confidence: 0, reasons: [] };
}
