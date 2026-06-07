import type { IncomingMessageContext, MakerPolicy, SpeakerRole } from "../types.js";

export function resolveSpeaker(ctx: IncomingMessageContext, makerPolicy: MakerPolicy): SpeakerRole {
  if (ctx.isSystem) return "system";
  if (ctx.authorIsBot) return "bot";
  if (makerPolicy.makerUserIds.includes(ctx.authorId)) return "maker";
  return "normal_user";
}
