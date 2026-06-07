from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

SpeakerRole = Literal["maker", "normal_user", "bot", "system"]
ChannelMode = Literal["test", "chat", "allowed", "quiet", "dm"]
RouterTarget = Literal["keyol", "other_user", "channel", "ignore"]
CallType = Literal[
    "direct_call",
    "mention_about",
    "identity_about_keyol",
    "invited_entry",
    "followup",
    "ambient",
    "system",
]
RouterAction = Literal[
    "reply_now",
    "reply_short",
    "reply_if_question",
    "consider_entry",
    "crisis_reply",
    "low_intervention",
    "listen_only",
    "no_response",
]
GeminiDecision = Literal["call", "skip", "fallback_template"]
TranscriptDecision = Literal["save_full", "save_summary_only", "save_redacted", "drop"]
MemoryCandidate = Literal[
    "none", "short_chat", "relationship_signal", "daily_summary", "long_term_candidate"
]
Sensitivity = Literal["none", "low", "medium", "high"]


@dataclass(slots=True)
class Mention:
    id: str
    username: str | None = None
    display_name: str | None = None
    is_bot: bool = False


@dataclass(slots=True)
class Attachment:
    id: str
    content_type: str | None = None
    filename: str | None = None
    size: int | None = None


@dataclass(slots=True)
class ReplyContext:
    message_id: str
    author_id: str
    author_is_bot: bool = False


@dataclass(slots=True)
class IncomingMessage:
    id: str
    platform: Literal["discord", "desktop", "mobile", "generic"]
    channel_id: str
    author_id: str
    timestamp: float
    content: str = ""
    guild_id: str | None = None
    channel_mode: ChannelMode | None = None
    author_display_name: str | None = None
    author_is_bot: bool = False
    mentions: list[Mention] = field(default_factory=list)
    reply_to: ReplyContext | None = None
    attachments: list[Attachment] = field(default_factory=list)
    is_system: bool = False


@dataclass(slots=True)
class OpenConversation:
    channel_id: str
    user_id: str
    opened_at: float
    last_bot_message_at: float
    last_user_message_at: float
    last_bot_asked_question: bool = False
    interrupted_by_user_ids: list[str] = field(default_factory=list)
    mode: Literal["normal", "maker", "support"] = "normal"
    closed_at: float | None = None


@dataclass(slots=True)
class ConversationState:
    bot_user_id: str
    open_conversations: list[OpenConversation] = field(default_factory=list)
    recent_bot_responses: list[tuple[str, float]] = field(default_factory=list)
    user_message_counts: list[tuple[str, float]] = field(default_factory=list)
    gemini_calls_today: int = 0
    gemini_daily_limit: int | None = None


@dataclass(slots=True)
class AliasPolicy:
    canonical: tuple[str, ...] = ("결", "keyol")
    vocative: tuple[str, ...] = ("결아", "귤아", "키올아", "keyol")
    weak_reference: tuple[str, ...] = (
        "결이는", "결은", "결이", "결한테", "결에게", "결도", "결 봇", "keyol"
    )
    false_positive_prefixes: tuple[str, ...] = ("결과", "해결", "연결", "판결", "종결", "미결")


@dataclass(slots=True)
class MakerPolicy:
    maker_user_ids: set[str] = field(default_factory=set)
    longer_conversation_window_ms: int = 15 * 60 * 1000
    normal_conversation_window_ms: int = 3 * 60 * 1000
    answer_window_ms: int = 10 * 60 * 1000
    maker_answer_window_ms: int = 30 * 60 * 1000
    lower_response_threshold: bool = True


@dataclass(slots=True)
class ChannelPolicy:
    mode: ChannelMode = "chat"
    can_speak: bool = True
    can_listen: bool = True
    response_threshold: float = 0.65
    allow_ambient_intervention: bool = False


@dataclass(slots=True)
class LimitPolicy:
    user_max_messages_per_window: int = 10
    user_window_ms: int = 60_000
    channel_response_window_ms: int = 5 * 60 * 1000
    channel_max_responses: int = 8
    gemini_daily_soft_limit_ratio: float = 0.9
    max_content_length: int = 4_000


@dataclass(slots=True)
class SafetyPolicy:
    redact_sensitive: bool = True
    drop_high_sensitivity: bool = True


@dataclass(slots=True)
class RouterPolicy:
    alias: AliasPolicy = field(default_factory=AliasPolicy)
    maker: MakerPolicy = field(default_factory=MakerPolicy)
    channel: ChannelPolicy = field(default_factory=ChannelPolicy)
    limits: LimitPolicy = field(default_factory=LimitPolicy)
    safety: SafetyPolicy = field(default_factory=SafetyPolicy)


@dataclass(slots=True)
class InvocationResult:
    strength: Literal["none", "weak", "strong"]
    kind: Literal[
        "none", "bot_mention", "reply_to_bot", "start_alias", "end_vocative",
        "particle_reference", "false_positive"
    ]
    confidence: float
    matched: str | None = None
    reasons: list[str] = field(default_factory=list)


@dataclass(slots=True)
class AboutnessResult:
    is_about_keyol: bool
    mode: Literal[
        "status_question", "capability_question", "third_person_reference", "evaluation",
        "troubleshooting", "identity_discussion", "memory_reference", "none"
    ]
    sentiment: Literal["positive", "neutral", "confused", "negative", "urgent"]
    invites_entry: bool
    confidence: float
    reasons: list[str] = field(default_factory=list)


@dataclass(slots=True)
class FollowupResult:
    is_followup: bool
    confidence: float
    conversation: OpenConversation | None = None
    reasons: list[str] = field(default_factory=list)


@dataclass(slots=True)
class AddresseeResult:
    target: RouterTarget
    call_type: CallType
    confidence: float
    you_ref: Literal["keyol", "other_user", "channel", "unknown"] = "unknown"
    me_ref: Literal["speaker", "maker", "keyol", "unknown"] = "unknown"
    reasons: list[str] = field(default_factory=list)


@dataclass(slots=True)
class PersistenceResult:
    transcript: TranscriptDecision
    memory_candidate: MemoryCandidate
    sensitivity: Sensitivity
    reasons: list[str] = field(default_factory=list)


@dataclass(slots=True)
class RouterDecision:
    target: RouterTarget
    call_type: CallType
    action: RouterAction
    gemini: GeminiDecision
    transcript: TranscriptDecision
    memory_candidate: MemoryCandidate
    confidence: float
    reasons: list[str] = field(default_factory=list)
    fallback_template: str | None = None
    you_ref: Literal["keyol", "other_user", "channel", "unknown"] = "unknown"
    me_ref: Literal["speaker", "maker", "keyol", "unknown"] = "unknown"
