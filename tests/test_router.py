import unittest

from keyol_router import (
    ChannelPolicy,
    ConversationState,
    IncomingMessage,
    MakerPolicy,
    Mention,
    OpenConversation,
    RouterPolicy,
    route_message,
)
from keyol_router.models import ReplyContext

NOW = 1_700_000_000_000
STATE = ConversationState(bot_user_id="bot-keyol")


def msg(content: str, **overrides):
    data = dict(
        id="m1",
        platform="discord",
        channel_id="chan",
        author_id="user-a",
        timestamp=NOW,
        content=content,
    )
    data.update(overrides)
    return IncomingMessage(**data)


class KeyolRouterTests(unittest.TestCase):
    def test_direct_korean_vocative_calls_gemini(self):
        decision = route_message(msg("결아 이거 어떻게 생각해?"), STATE)
        self.assertEqual(decision.target, "keyol")
        self.assertEqual(decision.call_type, "direct_call")
        self.assertEqual(decision.action, "reply_now")
        self.assertEqual(decision.gemini, "call")

    def test_sentence_final_vocative_not_blocked_by_haegyeol_boundary(self):
        decision = route_message(msg("어떻게 생각해 결아?"), STATE)
        self.assertEqual(decision.target, "keyol")
        self.assertEqual(decision.call_type, "direct_call")
        self.assertNotIn("false_positive:해결", decision.reasons)

    def test_alias_vocative(self):
        decision = route_message(msg("귤아 로그 좀 봐줘"), STATE)
        self.assertEqual(decision.target, "keyol")
        self.assertEqual(decision.call_type, "direct_call")

    def test_real_final_call_survives_false_positive_elsewhere(self):
        decision = route_message(msg("해결이 안 된다. 어떻게 생각해 결아?"), STATE)
        self.assertEqual(decision.target, "keyol")
        self.assertEqual(decision.call_type, "direct_call")

    def test_korean_false_positive_compounds_do_not_call_keyol(self):
        for content in ["결과가 안 좋다", "해결이 안 된다", "연결이 끊겼다"]:
            with self.subTest(content=content):
                decision = route_message(msg(content), STATE)
                self.assertNotEqual(decision.target, "keyol")
                self.assertNotEqual(decision.call_type, "direct_call")
                self.assertEqual(decision.gemini, "skip")

    def test_status_question_about_keyol_is_short_template(self):
        decision = route_message(msg("결이 지금 온라인이야?"), STATE)
        self.assertEqual(decision.target, "keyol")
        self.assertEqual(decision.action, "reply_short")
        self.assertEqual(decision.gemini, "fallback_template")

    def test_third_person_mention_can_be_consider_entry(self):
        policy = RouterPolicy(channel=ChannelPolicy(allow_ambient_intervention=True))
        decision = route_message(msg("결한테 물어볼까?"), STATE, policy)
        self.assertEqual(decision.target, "keyol")
        self.assertEqual(decision.action, "consider_entry")
        self.assertEqual(decision.gemini, "skip")

    def test_reply_to_bot_is_direct_call(self):
        decision = route_message(
            msg("그럼 이건?", reply_to=ReplyContext(message_id="old", author_id="bot-keyol")),
            STATE,
        )
        self.assertEqual(decision.target, "keyol")
        self.assertEqual(decision.call_type, "direct_call")

    def test_bot_mention_is_direct_call(self):
        decision = route_message(msg("이거 봐줘", mentions=[Mention(id="bot-keyol", is_bot=True)]), STATE)
        self.assertEqual(decision.target, "keyol")
        self.assertEqual(decision.call_type, "direct_call")

    def test_open_conversation_followup(self):
        follow_state = ConversationState(
            bot_user_id="bot-keyol",
            open_conversations=[
                OpenConversation(
                    channel_id="chan",
                    user_id="user-a",
                    opened_at=NOW - 20_000,
                    last_bot_message_at=NOW - 10_000,
                    last_user_message_at=NOW - 20_000,
                    last_bot_asked_question=True,
                )
            ],
        )
        decision = route_message(msg("응 그 방향이 맞아"), follow_state)
        self.assertEqual(decision.target, "keyol")
        self.assertEqual(decision.call_type, "followup")

    def test_other_user_address_blocks_ambient_keyol_entry(self):
        policy = RouterPolicy(channel=ChannelPolicy(allow_ambient_intervention=True))
        decision = route_message(msg("민수야 결한테 물어볼까?"), STATE, policy)
        self.assertEqual(decision.target, "other_user")
        self.assertNotEqual(decision.action, "reply_now")

    def test_maker_direct_call_is_long_term_candidate(self):
        policy = RouterPolicy(maker=MakerPolicy(maker_user_ids={"maker"}))
        decision = route_message(msg("결, 이 구조 좀 잡아줘.", author_id="maker"), STATE, policy)
        self.assertEqual(decision.target, "keyol")
        self.assertEqual(decision.memory_candidate, "long_term_candidate")

    def test_quiet_channel_listens_without_gemini(self):
        policy = RouterPolicy(channel=ChannelPolicy(mode="quiet", can_speak=False))
        decision = route_message(msg("결아 봐줘"), STATE, policy)
        self.assertEqual(decision.target, "keyol")
        self.assertEqual(decision.action, "listen_only")
        self.assertEqual(decision.gemini, "skip")

    def test_high_sensitivity_is_redacted_and_skips_gemini(self):
        decision = route_message(msg("결아 password: hunter2 기억해줘"), STATE)
        self.assertEqual(decision.transcript, "save_redacted")
        self.assertEqual(decision.memory_candidate, "none")
        self.assertEqual(decision.gemini, "skip")

    def test_gemini_quota_changes_call_to_template(self):
        limited_state = ConversationState(bot_user_id="bot-keyol", gemini_calls_today=95, gemini_daily_limit=100)
        decision = route_message(msg("결아 이 시스템 설계를 길게 분석해줘"), limited_state)
        self.assertEqual(decision.gemini, "fallback_template")
        self.assertEqual(decision.fallback_template, "지금은 가볍게만 볼게. 깊은 답은 조금 아껴두자.")

    def test_commands_and_bots_are_ignored(self):
        self.assertEqual(route_message(msg("/결아 봐줘"), STATE).target, "ignore")
        self.assertEqual(route_message(msg("결아 봐줘", author_is_bot=True), STATE).target, "ignore")


if __name__ == "__main__":
    unittest.main()
