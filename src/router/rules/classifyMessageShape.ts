import type { IncomingMessageContext, LimitPolicy, MessageShape } from "../types.js";

export function classifyMessageShape(ctx: IncomingMessageContext, limits: LimitPolicy): MessageShape {
  const content = ctx.content?.trim() ?? "";
  const attachments = ctx.attachments ?? [];
  const hasImage = attachments.some((item) => item.contentType?.startsWith("image/"));
  const hasFile = attachments.length > 0 && !hasImage;
  const isCommand = /^[!/\\]/.test(content);

  const shape: MessageShape = {
    isSystem: Boolean(ctx.isSystem),
    isOtherBot: Boolean(ctx.authorIsBot && ctx.authorId !== ""),
    isEmpty: content.length === 0 && attachments.length === 0,
    isCommand,
    isAttachmentOnly: content.length === 0 && attachments.length > 0,
    isTooLong: content.length > limits.maxContentLength,
    hasImage,
    hasFile,
    reasons: []
  };

  if (shape.isSystem) shape.reasons.push("system_message");
  if (shape.isOtherBot) shape.reasons.push("bot_message");
  if (shape.isEmpty) shape.reasons.push("empty_message");
  if (shape.isCommand) shape.reasons.push("command_message");
  if (shape.isAttachmentOnly) shape.reasons.push("attachment_only");
  if (shape.isTooLong) shape.reasons.push("too_long");
  if (shape.hasImage) shape.reasons.push("has_image");
  if (shape.hasFile) shape.reasons.push("has_file");

  return shape;
}
