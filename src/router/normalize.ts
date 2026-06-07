import type { IncomingMessageContext, NormalizedMessage } from "./types.js";

export function normalizeMessage(ctx: IncomingMessageContext): NormalizedMessage {
  const original = ctx.content ?? "";
  const text = original.normalize("NFKC").replace(/\s+/g, " ").trim();
  const lower = text.toLocaleLowerCase();
  const compact = lower.replace(/\s+/g, "");
  const isQuestion = /[?？]$/.test(text) || /(까|나요|니|어|해|인가|일까|줄래|줄 수|어떻게|왜|뭐|무엇|언제|어디|누구)\??$/u.test(text);

  return { original, text, compact, lower, isQuestion };
}
