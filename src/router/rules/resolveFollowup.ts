import type { ConversationState, FollowupResult, IncomingMessageContext, MakerPolicy, SpeakerRole } from "../types.js";

const ENDING_PATTERN = /(됐어|고마워|괜찮아|나중에|끝|해결했어|아냐\s*됐)/u;

export function resolveFollowup(
  ctx: IncomingMessageContext,
  state: ConversationState,
  speaker: SpeakerRole,
  makerPolicy: MakerPolicy
): FollowupResult {
  const open = (state.openConversations ?? [])
    .filter((conv) => conv.channelId === ctx.channelId && !conv.closedAt)
    .sort((a, b) => b.lastBotMessageAt - a.lastBotMessageAt)[0];

  if (!open) return { isFollowup: false, confidence: 0, reasons: [] };

  const reasons: string[] = [];
  const text = ctx.content ?? "";
  if (ENDING_PATTERN.test(text)) {
    return { isFollowup: false, confidence: 0.1, conversation: open, reasons: ["conversation_ending_phrase"] };
  }

  const sameUser = open.userId === ctx.authorId;
  const isMakerMode = speaker === "maker" || open.mode === "maker";
  const baseWindow = isMakerMode
    ? makerPolicy.longerConversationWindowMs ?? 15 * 60 * 1000
    : makerPolicy.normalConversationWindowMs ?? 3 * 60 * 1000;
  const answerWindow = isMakerMode
    ? makerPolicy.makerAnswerWindowMs ?? 30 * 60 * 1000
    : makerPolicy.answerWindowMs ?? 10 * 60 * 1000;
  const windowMs = open.lastBotAskedQuestion ? answerWindow : baseWindow;
  const age = ctx.timestamp - Math.max(open.lastBotMessageAt, open.lastUserMessageAt);

  if (age > windowMs) {
    return { isFollowup: false, confidence: 0.15, conversation: open, reasons: ["followup_window_expired"] };
  }

  let confidence = sameUser ? 0.72 : 0.42;
  if (sameUser) reasons.push("same_user_followup");
  if (open.lastBotAskedQuestion) {
    confidence += sameUser ? 0.15 : 0.08;
    reasons.push("answer_to_bot_question_window");
  }
  if (!sameUser) {
    reasons.push("different_user_interruption");
    if (!isMakerMode) confidence -= 0.12;
  }
  if (open.interruptedByUserIds.length > 0 && !sameUser) confidence -= 0.1;

  return {
    isFollowup: confidence >= 0.5,
    confidence: Math.max(0, Math.min(confidence, 0.92)),
    conversation: open,
    reasons
  };
}
