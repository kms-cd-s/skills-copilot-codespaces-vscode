import test from "node:test";
import assert from "node:assert/strict";
import { routeMessage } from "../dist/router/routeMessage.js";

const now = 1_700_000_000_000;
const state = { botUserId: "bot-keyol" };

function msg(content, overrides = {}) {
  return {
    id: `m-${Math.random()}`,
    platform: "discord",
    channelId: "chan",
    authorId: "user-a",
    content,
    timestamp: now,
    ...overrides
  };
}

test("routes direct Korean vocative to Keyol and calls Gemini", () => {
  const decision = routeMessage(msg("결아 이거 어떻게 생각해?"), state);
  assert.equal(decision.target, "keyol");
  assert.equal(decision.callType, "direct_call");
  assert.equal(decision.action, "reply_now");
  assert.equal(decision.gemini, "call");
});

test("routes sentence-final vocative as direct call", () => {
  const decision = routeMessage(msg("어떻게 생각해 결아?"), state);
  assert.equal(decision.target, "keyol");
  assert.equal(decision.callType, "direct_call");
});

test("detects aliases such as 귤아", () => {
  const decision = routeMessage(msg("귤아 로그 좀 봐줘"), state);
  assert.equal(decision.target, "keyol");
  assert.equal(decision.callType, "direct_call");
});

test("does not false-positive Korean compounds", () => {
  for (const content of ["결과가 안 좋다", "해결이 안 된다", "연결이 끊겼다"]) {
    const decision = routeMessage(msg(content), state);
    assert.notEqual(decision.callType, "direct_call");
    assert.notEqual(decision.target, "keyol");
    assert.equal(decision.gemini, "skip");
  }
});

test("classifies about-Keyol status question as short template response", () => {
  const decision = routeMessage(msg("결이 지금 온라인이야?"), state);
  assert.equal(decision.target, "keyol");
  assert.equal(decision.action, "reply_short");
  assert.equal(decision.gemini, "fallback_template");
});

test("keeps third-person mention as consider-entry when ambient intervention is enabled", () => {
  const policy = { channelPolicy: { allowAmbientIntervention: true } };
  const decision = routeMessage(msg("결한테 물어볼까?"), state, policy);
  assert.equal(decision.action, "consider_entry");
  assert.equal(decision.gemini, "skip");
});

test("uses reply-to-bot as strong direct call", () => {
  const decision = routeMessage(msg("그럼 이건?", { replyTo: { messageId: "old", authorId: "bot-keyol" } }), state);
  assert.equal(decision.target, "keyol");
  assert.equal(decision.callType, "direct_call");
});

test("uses open conversation followup", () => {
  const followState = {
    botUserId: "bot-keyol",
    openConversations: [
      {
        channelId: "chan",
        userId: "user-a",
        openedAt: now - 20_000,
        lastBotMessageAt: now - 10_000,
        lastUserMessageAt: now - 20_000,
        lastBotAskedQuestion: true,
        interruptedByUserIds: [],
        mode: "normal"
      }
    ]
  };
  const decision = routeMessage(msg("응 그 방향이 맞아"), followState);
  assert.equal(decision.target, "keyol");
  assert.equal(decision.callType, "followup");
});

test("maker direct call becomes long-term candidate", () => {
  const policy = { makerPolicy: { makerUserIds: ["maker"] } };
  const decision = routeMessage(msg("결, 이 구조 좀 잡아줘.", { authorId: "maker" }), state, policy);
  assert.equal(decision.target, "keyol");
  assert.equal(decision.memoryCandidate, "long_term_candidate");
});

test("quiet channel listens but does not speak", () => {
  const policy = { channelPolicy: { mode: "quiet", canSpeak: false } };
  const decision = routeMessage(msg("결아 봐줘"), state, policy);
  assert.equal(decision.target, "keyol");
  assert.equal(decision.action, "listen_only");
  assert.equal(decision.gemini, "skip");
});

test("redacts high sensitivity and skips Gemini", () => {
  const decision = routeMessage(msg("결아 password: hunter2 기억해줘"), state);
  assert.equal(decision.transcript, "save_redacted");
  assert.equal(decision.memoryCandidate, "none");
  assert.equal(decision.gemini, "skip");
});

test("rate limit switches Gemini calls to fallback template", () => {
  const limitedState = {
    botUserId: "bot-keyol",
    geminiDailyLimit: 100,
    geminiCallsToday: 95
  };
  const decision = routeMessage(msg("결아 이 시스템 설계를 길게 분석해줘"), limitedState);
  assert.equal(decision.gemini, "fallback_template");
  assert.equal(decision.fallbackTemplate, "지금은 가볍게만 볼게. 깊은 답은 조금 아껴두자.");
});
