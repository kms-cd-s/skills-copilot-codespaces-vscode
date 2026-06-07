from __future__ import annotations

import re
import unicodedata
from dataclasses import replace

from .models import (
    AboutnessResult,
    AddresseeResult,
    ConversationState,
    FollowupResult,
    IncomingMessage,
    InvocationResult,
    PersistenceResult,
    RouterDecision,
    RouterPolicy,
    Sensitivity,
    SpeakerRole,
)

_PARTICLES = "은는이가을를도만에게한테랑과와로으로야아께서부터까지처럼보다의"
_ENDING_RE = re.compile(r"(됐어|고마워|괜찮아|나중에|끝|해결했어|아냐\s*됐)")
_HIGH_SENSITIVE = [
    re.compile(r"(?:비밀번호|password|api[_-]?key|token|secret)\s*[:=]", re.I),
    re.compile(r"\b\d{6}-\d{7}\b"),
    re.compile(r"\b\d{3}-\d{3,4}-\d{4}\b"),
]
_MEDIUM_SENSITIVE = re.compile(r"(주소|계좌|카드번호|주민등록|병원|진단|처방)")


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text)).strip()


def _compact(text: str) -> str:
    return re.sub(r"\s+", "", text.lower())


def _is_question(text: str) -> bool:
    return bool(re.search(r"[?？]$|(까|나요|니|인가|일까|줄래|어떻게|왜|뭐|무엇|언제|어디|누구)\??$", text))


def _token_starts_false_positive(text: str, prefixes: tuple[str, ...]) -> str | None:
    # False positives are checked on token starts only. This prevents a phrase such as
    # "어떻게 생각해 결아?" from being blocked because "생각해 결아" contains "해결" when compacted.
    tokens = [token for token in re.split(r"[\s,.:;!?！？~]+", text.lower()) if token]
    return next((prefix for prefix in prefixes if any(token.startswith(prefix) for token in tokens)), None)


def _starts_with_direct_alias(text: str, aliases: tuple[str, ...]) -> str | None:
    for alias in aliases:
        if re.search(rf"^{re.escape(alias.lower())}(?:[\s,.:;!?！？~]|$)", text.lower()):
            return alias
    return None


def _ends_with_vocative(text: str, aliases: tuple[str, ...]) -> str | None:
    for alias in aliases:
        if re.search(rf"(?:^|[\s,]){re.escape(alias.lower())}[\s.?!！？~]*$", text.lower()):
            return alias
    return None


def _has_particle_reference(text: str, aliases: tuple[str, ...]) -> str | None:
    for alias in aliases:
        if re.search(
            rf"(?:^|[\s,]){re.escape(alias.lower())}(?:[{_PARTICLES}]{{1,3}}|\s+봇)(?:[\s,.:;!?！？~]|$)",
            text.lower(),
        ):
            return alias
    return None


def _shape_blocks(ctx: IncomingMessage, policy: RouterPolicy) -> tuple[bool, str | None]:
    content = ctx.content.strip()
    if ctx.is_system:
        return True, "system_message"
    if ctx.author_is_bot:
        return True, "bot_message"
    if not content and not ctx.attachments:
        return True, "empty_message"
    if content.startswith(("!", "/", "\\")):
        return True, "command_message"
    if len(content) > policy.limits.max_content_length:
        return False, "too_long"
    if not content and ctx.attachments:
        return False, "attachment_only"
    return False, None


def _no_response(reason: str) -> RouterDecision:
    return RouterDecision(
        target="ignore",
        call_type="system",
        action="no_response",
        gemini="skip",
        transcript="drop",
        memory_candidate="none",
        confidence=0.0,
        reasons=[reason],
    )


def _speaker(ctx: IncomingMessage, policy: RouterPolicy) -> SpeakerRole:
    if ctx.is_system:
        return "system"
    if ctx.author_is_bot:
        return "bot"
    if ctx.author_id in policy.maker.maker_user_ids:
        return "maker"
    return "normal_user"


def _detect_invocation(ctx: IncomingMessage, text: str, state: ConversationState, policy: RouterPolicy) -> InvocationResult:
    if ctx.reply_to and ctx.reply_to.author_id == state.bot_user_id:
        return InvocationResult("strong", "reply_to_bot", 0.98, reasons=["reply_to_bot"])
    if any(mention.id == state.bot_user_id for mention in ctx.mentions):
        return InvocationResult("strong", "bot_mention", 0.96, reasons=["bot_mention"])

    direct_alias = _starts_with_direct_alias(text, policy.alias.vocative + policy.alias.canonical)
    if direct_alias:
        return InvocationResult("strong", "start_alias", 0.93, direct_alias, [f"start_alias:{direct_alias}"])

    end_alias = _ends_with_vocative(text, policy.alias.vocative)
    if end_alias:
        return InvocationResult("strong", "end_vocative", 0.88, end_alias, [f"end_vocative:{end_alias}"])

    weak_alias = _has_particle_reference(text, policy.alias.weak_reference)
    if weak_alias:
        return InvocationResult("weak", "particle_reference", 0.58, weak_alias, [f"particle_reference:{weak_alias}"])

    false_positive = _token_starts_false_positive(text, policy.alias.false_positive_prefixes)
    if false_positive:
        return InvocationResult("none", "false_positive", 0.05, false_positive, [f"false_positive:{false_positive}"])

    return InvocationResult("none", "none", 0.0)


def _detect_aboutness(text: str, invocation: InvocationResult) -> AboutnessResult:
    if invocation.kind == "false_positive":
        return AboutnessResult(False, "none", "neutral", False, 0.0)

    compact = _compact(text)
    mentions_keyol = invocation.strength != "none" or bool(
        re.search(r"(?:^|\s)(결|결이|keyol)(?:\s|$|[은는이가을를도한테에게])", text.lower())
    )
    if not mentions_keyol:
        return AboutnessResult(False, "none", "neutral", False, 0.0)

    mode = "third_person_reference"
    sentiment = "neutral"
    confidence = 0.8 if invocation.strength == "strong" else 0.5
    invites = invocation.strength == "strong"
    reasons: list[str] = []

    checks = [
        ("status_question", r"(온라인|있어|듣고|켜져|접속|상태)", "status_question"),
        ("capability_question", r"(할수|가능|뭐해|도와|물어볼까|봐줄|정리)", "capability_question"),
        ("troubleshooting", r"(이상|고장|문제|오류|안돼|안되|느려|망가)", "troubleshooting"),
        ("identity_discussion", r"(누구|정체|존재|로봇|사람|생명|결이란|keyol이란)", "identity_discussion"),
        ("memory_reference", r"(기억|아까|전에|말했|대화)", "memory_reference"),
        ("evaluation", r"(좋|싫|짧|조용|귀엽|별로|무섭|괜찮)", "evaluation"),
    ]
    for candidate, pattern, reason in checks:
        if re.search(pattern, compact, re.I):
            mode = candidate  # type: ignore[assignment]
            confidence += 0.18 if candidate == "troubleshooting" else 0.15
            invites = candidate in {"status_question", "capability_question", "troubleshooting"} or invites
            reasons.append(reason)
            break

    if re.search(r"(급해|도와줘|살려|위험|힘들|죽고|자해)", compact):
        sentiment = "urgent"
        invites = True
        confidence += 0.25
        reasons.append("urgent_signal")
    elif re.search(r"(이상|문제|안돼|안되|힘들|불편)", compact):
        sentiment = "confused"
    elif re.search(r"(좋|고마|괜찮)", compact):
        sentiment = "positive"

    if _is_question(text) and mode != "third_person_reference":
        invites = True
        confidence += 0.05
        reasons.append("question_invites_entry")

    return AboutnessResult(True, mode, sentiment, invites, min(confidence, 0.95), reasons)


def _followup(ctx: IncomingMessage, state: ConversationState, speaker: SpeakerRole, policy: RouterPolicy) -> FollowupResult:
    conversations = [c for c in state.open_conversations if c.channel_id == ctx.channel_id and c.closed_at is None]
    if not conversations:
        return FollowupResult(False, 0.0)
    conv = max(conversations, key=lambda item: item.last_bot_message_at)
    if _ENDING_RE.search(ctx.content):
        return FollowupResult(False, 0.1, conv, ["conversation_ending_phrase"])

    same_user = conv.user_id == ctx.author_id
    maker_mode = speaker == "maker" or conv.mode == "maker"
    base_window = policy.maker.longer_conversation_window_ms if maker_mode else policy.maker.normal_conversation_window_ms
    answer_window = policy.maker.maker_answer_window_ms if maker_mode else policy.maker.answer_window_ms
    window = answer_window if conv.last_bot_asked_question else base_window
    age = ctx.timestamp - max(conv.last_bot_message_at, conv.last_user_message_at)
    if age > window:
        return FollowupResult(False, 0.15, conv, ["followup_window_expired"])

    confidence = 0.72 if same_user else 0.42
    reasons = ["same_user_followup"] if same_user else ["different_user_interruption"]
    if conv.last_bot_asked_question:
        confidence += 0.15 if same_user else 0.08
        reasons.append("answer_to_bot_question_window")
    if not same_user and not maker_mode:
        confidence -= 0.12
    if conv.interrupted_by_user_ids and not same_user:
        confidence -= 0.1
    return FollowupResult(confidence >= 0.5, max(0.0, min(confidence, 0.92)), conv, reasons)


def _other_user_addressed(ctx: IncomingMessage, text: str) -> bool:
    if any(not mention.is_bot for mention in ctx.mentions):
        return True
    return bool(re.search(r"^[^\s,]{1,16}(아|야|님)[\s,]", text)) and not re.search(r"^(결아|귤아|키올아)", text)


def _resolve_addressee(ctx: IncomingMessage, text: str, invocation: InvocationResult, aboutness: AboutnessResult, followup: FollowupResult) -> AddresseeResult:
    if invocation.strength == "strong":
        target, call_type, confidence, reasons = "keyol", "direct_call", invocation.confidence, invocation.reasons
    elif _other_user_addressed(ctx, text):
        target, call_type, confidence, reasons = "other_user", "ambient", 0.75, ["other_user_addressed"]
    elif followup.is_followup:
        target, call_type, confidence, reasons = "keyol", "followup", followup.confidence, followup.reasons
    elif aboutness.is_about_keyol and aboutness.invites_entry:
        call_type = "identity_about_keyol" if aboutness.mode == "identity_discussion" else "invited_entry"
        target, confidence, reasons = "keyol", max(0.55, aboutness.confidence), aboutness.reasons
    elif aboutness.is_about_keyol:
        target, call_type, confidence, reasons = "channel", "mention_about", aboutness.confidence, ["about_keyol_without_invitation", *aboutness.reasons]
    else:
        target, call_type, confidence, reasons = "channel", "ambient", 0.25, []

    has_you = bool(re.search(r"(?:^|\s)(너|너는|넌|네가|니가|당신)(?:\s|$)", ctx.content))
    has_me = bool(re.search(r"(?:^|\s)(나|나는|난|내가|저|제가)(?:\s|$)", ctx.content))
    you_ref = "keyol" if has_you and target == "keyol" else "other_user" if has_you and target == "other_user" else "unknown"
    me_ref = "speaker" if has_me else "unknown"
    return AddresseeResult(target, call_type, confidence, you_ref, me_ref, list(reasons))


def _entry_score(invocation: InvocationResult, aboutness: AboutnessResult, followup: FollowupResult, addressee: AddresseeResult, speaker: SpeakerRole, policy: RouterPolicy) -> tuple[float, list[str]]:
    score = 0.2
    reasons: list[str] = []
    for condition, delta, reason in [
        (invocation.strength == "strong", 0.7, "direct_invocation"),
        (followup.is_followup, 0.35, "open_followup"),
        (aboutness.is_about_keyol, 0.15, "about_keyol"),
        (aboutness.invites_entry, 0.18, "aboutness_invites_entry"),
        (speaker == "maker" and aboutness.is_about_keyol, 0.12, "maker_about_keyol"),
    ]:
        if condition:
            score += delta
            reasons.append(reason)
    if aboutness.mode in {"status_question", "capability_question", "troubleshooting", "identity_discussion"}:
        score += 0.12
        reasons.append(f"aboutness_mode:{aboutness.mode}")
    if addressee.target == "other_user":
        score -= 0.55
        reasons.append("other_user_target_penalty")
    if policy.channel.mode == "quiet" or not policy.channel.can_speak:
        score -= 0.6
        reasons.append("quiet_or_cannot_speak")
    if policy.channel.mode == "test":
        score += 0.1
        reasons.append("test_channel_bonus")
    return max(0.0, min(score, 1.0)), reasons


def _sensitivity(text: str) -> Sensitivity:
    if any(pattern.search(text) for pattern in _HIGH_SENSITIVE):
        return "high"
    if _MEDIUM_SENSITIVE.search(text):
        return "medium"
    if re.search(r"(개인정보|사적인|비밀)", text):
        return "low"
    return "none"


def _persistence(ctx: IncomingMessage, addressee: AddresseeResult, aboutness: AboutnessResult, speaker: SpeakerRole) -> PersistenceResult:
    sensitivity = _sensitivity(ctx.content)
    if speaker in {"bot", "system"}:
        return PersistenceResult("drop", "none", sensitivity, ["bot_or_system_drop"])
    if sensitivity == "high":
        return PersistenceResult("save_redacted", "none", sensitivity, ["high_sensitivity"])

    transcript = "save_full" if addressee.target == "keyol" else "save_summary_only"
    reasons: list[str] = []
    if sensitivity in {"medium", "low"}:
        transcript = "save_redacted"
        reasons.append(f"{sensitivity}_sensitivity")

    memory = "daily_summary" if addressee.target == "keyol" else "none"
    if aboutness.mode in {"identity_discussion", "memory_reference"}:
        memory = "relationship_signal"
    if speaker == "maker" and addressee.target == "keyol":
        memory = "long_term_candidate"
    if len(ctx.content) < 40 and addressee.target != "keyol":
        memory = "short_chat"
    return PersistenceResult(transcript, memory, sensitivity, reasons)


def _fallback(reason: str) -> str:
    return {
        "attachment_only": "첨부만으로는 아직 조용히 기록만 해둘게.",
        "too_long": "메시지가 길어. 필요하면 나눠서 보내줘.",
        "gemini_quota_risk": "지금은 가볍게만 볼게. 깊은 답은 조금 아껴두자.",
        "rate_limited": "잠깐만. 흐름이 너무 빨라서 조금 늦출게.",
    }.get(reason, "필요하면 짧게 볼게.")


def _needs_gemini(action: str, text: str, aboutness: AboutnessResult) -> str:
    if action in {"listen_only", "no_response", "consider_entry", "low_intervention"}:
        return "skip"
    if action == "reply_short" and aboutness.mode in {"status_question", "troubleshooting"}:
        return "fallback_template"
    if action == "reply_now":
        return "call"
    if len(text) < 20 and action != "crisis_reply":
        return "fallback_template"
    return "call"


def _select(ctx: IncomingMessage, speaker: SpeakerRole, addressee: AddresseeResult, aboutness: AboutnessResult, persistence: PersistenceResult, score: float, reasons: list[str], policy: RouterPolicy) -> RouterDecision:
    if not policy.channel.can_listen:
        return _no_response("channel_cannot_listen")

    action = "listen_only"
    if re.search(r"(죽고싶|자해|살려줘|위험해|극단적|숨을 못|응급)", ctx.content):
        action = "crisis_reply"
    elif not policy.channel.can_speak or policy.channel.mode == "quiet":
        action = "listen_only"
    elif addressee.target == "keyol" and addressee.call_type == "direct_call":
        action = "reply_now"
    elif addressee.target == "keyol" and addressee.call_type == "followup":
        action = "reply_if_question"
    elif addressee.target == "keyol" and addressee.call_type == "invited_entry" and policy.channel.allow_ambient_intervention:
        action = "consider_entry"
    elif addressee.target == "keyol" and aboutness.invites_entry and score >= policy.channel.response_threshold:
        action = "reply_short" if aboutness.mode == "status_question" else "reply_if_question"
    elif aboutness.is_about_keyol and score >= 0.45 and policy.channel.allow_ambient_intervention:
        action = "consider_entry"

    if speaker == "maker" and action == "reply_if_question" and addressee.target == "keyol":
        action = "reply_now"

    return RouterDecision(
        target=addressee.target,
        call_type=addressee.call_type,
        action=action,  # type: ignore[arg-type]
        gemini=_needs_gemini(action, ctx.content, aboutness),  # type: ignore[arg-type]
        transcript=persistence.transcript,
        memory_candidate=persistence.memory_candidate,
        confidence=max(addressee.confidence, score),
        reasons=reasons,
        you_ref=addressee.you_ref,
        me_ref=addressee.me_ref,
    )


def _apply_safety(decision: RouterDecision, persistence: PersistenceResult, policy: RouterPolicy) -> RouterDecision:
    if persistence.sensitivity == "high" and policy.safety.drop_high_sensitivity:
        return replace(
            decision,
            action="listen_only",
            gemini="skip",
            transcript="save_redacted",
            memory_candidate="none",
            reasons=[*decision.reasons, "high_sensitivity_no_gemini"],
        )
    if persistence.sensitivity in {"medium", "low"} and policy.safety.redact_sensitive:
        return replace(decision, transcript="save_redacted", reasons=[*decision.reasons, "sensitive_redaction"])
    return decision


def _apply_limits(decision: RouterDecision, ctx: IncomingMessage, state: ConversationState, shape_reason: str | None, policy: RouterPolicy) -> RouterDecision:
    if shape_reason in {"too_long", "attachment_only"}:
        return replace(
            decision,
            action="reply_short" if decision.target == "keyol" else "listen_only",
            gemini="fallback_template" if decision.target == "keyol" else "skip",
            fallback_template=_fallback(shape_reason),
            reasons=[*decision.reasons, shape_reason],
        )

    user_count = sum(1 for user_id, ts in state.user_message_counts if user_id == ctx.author_id and ts >= ctx.timestamp - policy.limits.user_window_ms)
    if user_count > policy.limits.user_max_messages_per_window and decision.gemini == "call":
        return replace(decision, gemini="fallback_template", fallback_template=_fallback("rate_limited"), reasons=[*decision.reasons, "user_rate_limited"])

    channel_count = sum(1 for channel_id, ts in state.recent_bot_responses if channel_id == ctx.channel_id and ts >= ctx.timestamp - policy.limits.channel_response_window_ms)
    if channel_count >= policy.limits.channel_max_responses and decision.gemini == "call":
        return replace(decision, gemini="fallback_template", fallback_template=_fallback("rate_limited"), reasons=[*decision.reasons, "channel_response_budget_exhausted"])

    if state.gemini_daily_limit and state.gemini_calls_today / state.gemini_daily_limit >= policy.limits.gemini_daily_soft_limit_ratio and decision.gemini == "call":
        return replace(decision, gemini="fallback_template", fallback_template=_fallback("gemini_quota_risk"), reasons=[*decision.reasons, "gemini_quota_risk"])
    return decision


def route_message(ctx: IncomingMessage, state: ConversationState, policy: RouterPolicy | None = None) -> RouterDecision:
    """Return a deterministic participation decision for one incoming message.

    The order intentionally checks direct evidence before false-positive compounds so unrelated
    words such as "해결" do not block a real sentence-final call like "... 결아?".
    """
    policy = policy or RouterPolicy()
    blocked, shape_reason = _shape_blocks(ctx, policy)
    if blocked:
        return _no_response(shape_reason or "ignored_shape")

    text = _norm(ctx.content)
    speaker = _speaker(ctx, policy)
    invocation = _detect_invocation(ctx, text, state, policy)
    aboutness = _detect_aboutness(text, invocation)
    followup = _followup(ctx, state, speaker, policy)
    addressee = _resolve_addressee(ctx, text, invocation, aboutness, followup)
    score, score_reasons = _entry_score(invocation, aboutness, followup, addressee, speaker, policy)
    persistence = _persistence(ctx, addressee, aboutness, speaker)
    reasons = [*invocation.reasons, *aboutness.reasons, *followup.reasons, *addressee.reasons, *score_reasons, *persistence.reasons]

    decision = _select(ctx, speaker, addressee, aboutness, persistence, score, reasons, policy)
    decision = _apply_safety(decision, persistence, policy)
    return _apply_limits(decision, ctx, state, shape_reason, policy)
