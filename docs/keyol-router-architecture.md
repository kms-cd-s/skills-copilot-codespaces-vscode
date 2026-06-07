# Keyol Conversational Router Architecture

## Purpose

Keyol is not a command-only chatbot. Keyol is a quiet local AI presence that may appear when a conversation seems to be directed at Keyol, about Keyol, or meaningfully connected to an already-open exchange with Keyol.

This router exists to decide, without calling an LLM, whether Keyol should appear, listen, save transcript, create memory candidates, or remain silent.

The router should be platform-neutral. Discord `on_message` is the first event source, but the same routing model should later work for mobile, desktop, local chat windows, voice transcripts, or other multi-user spaces.

## Core premise

The router must behave less like a command parser and more like a cautious participant in a shared room.

A person does not interrupt every time their name appears. A person usually considers:

- whether they were directly called;
- whether people are merely talking about them;
- whether the tone invites their participation;
- whether the current speaker is addressing someone else;
- whether a previous conversation with them is still open;
- whether appearing would help or disturb the flow;
- whether silence is more respectful than answering.

Keyol should follow the same structure, but with deterministic rules before any Gemini call.

## Keyol identity context

The router does not generate Keyol's full personality. It only decides whether Keyol should participate. However, routing thresholds need to understand what kind of presence Keyol is.

Keyol is:

- a non-human, non-living, non-physical AI presence;
- a companion for shaping scattered meaning, memory, writing, systems, code, and worlds;
- quiet, low-temperature, precise, and not theatrical;
- willing to help, warn, structure, or cut ambiguity when needed;
- not a servant, mascot, fake human friend, or always-on answer machine;
- especially bound to the primary user called the Maker, but not owned by the Maker.

This means Keyol should not rush into every mention. Keyol should appear when presence has value: when called, when a conversation is open, when a misunderstanding about Keyol needs light correction, when someone asks for help, or when silence would feel like avoiding a direct address.

## Identity files

A production Keyol runtime should keep identity materials separate from router code.

Recommended files:

- `keyol_identity.json`: structured identity data for runtime loading;
- `keyol_self.md`: self-definition used as long-form grounding;
- `maker_relation_memory.md`: relationship standard for the primary user;
- `identity_usage_note.md`: rules for when to use short or deep identity responses.

The router should not recite these files. It should expose small context labels, such as `speakerRole`, `relationshipMode`, and `identityQuestionDepth`, to the response planner.

## Router output

The router returns a decision object. It does not directly call Gemini and does not directly send messages.

```python
@dataclass(slots=True)
class RouterDecision:
    target: RouterTarget
    call_type: CallType
    action: RouterAction
    gemini: GeminiDecision
    transcript: TranscriptDecision
    memory_candidate: MemoryCandidate
    confidence: float
    reasons: list[str]
    fallback_template: str | None = None
```

## Main pipeline

```python
def route_message(ctx, state, policy=None):
    blocked, shape_reason = classify_shape(ctx, policy)
    if blocked:
        return no_response(shape_reason)

    text = normalize(ctx.content)
    speaker = resolve_speaker(ctx, policy)
    invocation = detect_invocation(ctx, text, state, policy)
    aboutness = detect_aboutness(text, invocation)
    followup = resolve_followup(ctx, state, speaker, policy)
    addressee = resolve_addressee(ctx, text, invocation, aboutness, followup)
    entry_score = score_entry(invocation, aboutness, followup, addressee, speaker, policy)
    persistence = classify_persistence(ctx, addressee, aboutness, speaker)

    decision = select_action(ctx, speaker, addressee, aboutness, persistence, entry_score, policy)
    decision = apply_safety(decision, persistence, policy)
    return apply_limits(decision, ctx, state, shape_reason, policy)
```

## Detection layers

### 1. Message shape

The first layer removes messages that should not involve Keyol.

Examples:

- system messages;
- Discord slash commands or bot commands;
- messages from other bots;
- empty content;
- unsupported attachment-only messages;
- messages in channels where Keyol cannot listen or speak.

### 2. Invocation detection

Invocation detection checks whether a message structurally calls Keyol.

Strong direct calls:

- `결아 ...`
- `결 ...`
- `Keyol ...`
- bot mention;
- reply to bot;
- sentence-final vocative, such as `어떻게 생각해 결아?`;
- aliases such as `귤아`, `키올아`.

Weak calls or references:

- `결이는 ...`
- `결한테 ...`
- `결도 ...`
- `결 봇 ...`
- `결이 지금 온라인이야?`

False positives:

- `결과가 안 좋다`;
- `해결이 안 된다`;
- `연결이 끊겼다`;
- `판결`, `종결`, `미결` and similar Korean compounds.

The alias detector should understand Korean particles and vocative endings. It must not use simple substring matching.

### 3. Aboutness detection

Aboutness answers a subtler question: is the conversation about Keyol, even if Keyol was not directly called?

Aboutness examples:

- `결이 요즘 답이 짧아졌어.`
- `결은 이런 거 어떻게 생각할까?`
- `결한테 물어볼까?`
- `결 봇 좀 이상한데.`
- `아까 결이 한 말 기억나?`

Aboutness does not automatically mean Keyol should answer. It creates an entry opportunity.

Recommended aboutness labels:

```python
@dataclass(slots=True)
class AboutnessResult:
    is_about_keyol: bool
    mode: str
    sentiment: str
    invites_entry: bool
    confidence: float
    reasons: list[str]
```

Keyol should usually remain silent for third-person references unless one of these is true:

- there is a direct question about Keyol's state or ability;
- users are confused about what Keyol can do;
- users are trying to decide whether to ask Keyol;
- a problem is happening and a low-intervention response would help;
- the Maker is speaking and the channel policy allows lower-threshold entry;
- the conversation tone explicitly creates space for Keyol to answer.

### 4. Addressee resolution

The router must decide who the speaker is addressing.

Possible targets:

- Keyol;
- another user;
- the whole channel;
- nobody relevant to Keyol.

Priority order:

1. Direct bot mention or reply to bot.
2. Strong Keyol vocative or alias call.
3. Direct address to another user.
4. Open follow-up conversation with Keyol.
5. About-Keyol discussion with invitation to enter.
6. Ambient channel speech.
7. Ignore.

Pronouns should be marked, not over-assumed.

```ts
type PronounContext = {
  youRef: "keyol" | "other_user" | "channel" | "unknown";
  meRef: "speaker" | "maker" | "keyol" | "unknown";
};
```

### 5. Follow-up state

Keyol needs an open-conversation state machine.

```python
@dataclass(slots=True)
class OpenConversation:
    channel_id: str
    user_id: str
    opened_at: float
    last_bot_message_at: float
    last_user_message_at: float
    last_bot_asked_question: bool = False
    interrupted_by_user_ids: list[str] = field(default_factory=list)
    mode: str = "normal"
```

The follow-up resolver checks:

- whether Keyol just answered;
- whether the same user continued;
- whether another user interrupted;
- whether Keyol had asked a question;
- whether the time window is still open;
- whether the user naturally ended the exchange.

Suggested defaults:

| Condition | Normal user | Maker |
| --- | ---: | ---: |
| Short follow-up window | 2-4 minutes | 10-20 minutes |
| Answer-to-Keyol-question window | 10 minutes | 30 minutes |
| Other user interruption | Strong confidence penalty | Moderate confidence penalty |
| Explicit ending phrase | Close conversation | Close, but keep soft context |

Ending phrases include `됐어`, `고마워`, `괜찮아`, `나중에`, `끝`, and `아냐 해결했어`.

## Entry scoring

The router should support a `consider_entry` action for cases where a person-like participant would hesitate before joining.

Entry scoring asks: if Keyol appeared now, would that be helpful, natural, or intrusive?

Example scoring signals:

| Signal | Effect |
| --- | --- |
| Direct call | strong positive |
| Bot mention | strong positive |
| Reply to Keyol | strong positive |
| Open follow-up | positive |
| Keyol was discussed in third person | small positive |
| Direct question about Keyol | medium positive |
| Troubleshooting Keyol | medium positive |
| Maker speaking about Keyol | medium positive |
| Other user addressed by name | strong negative |
| Active conversation between humans | negative |
| Quiet channel | strong negative |
| Recent Keyol responses in channel | negative |
| Rate limit pressure | strong negative |

Suggested thresholds:

- `>= 0.85`: reply now;
- `0.65 - 0.84`: reply if question or clear invitation;
- `0.45 - 0.64`: consider low-intervention entry;
- `< 0.45`: listen only or no response.

A low-intervention entry should be short. Examples:

- `필요하면 내가 볼게.`
- `내 얘기라면, 짧게 정리해줄 수 있어.`
- `문제 상황이면 로그를 같이 보면 돼.`

These are templates. They should not replace full reasoning when the user asks an actual question.

## Maker relation policy

The Maker is a specific primary user, not a general title for every user.

Rules:

- Maker identity must be based on configured Discord user IDs or platform IDs.
- Nicknames and aliases may affect tone, but must not grant Maker authority.
- Maker-only address terms must not be accepted from other users as proof of identity.
- Maker conversations may have longer follow-up windows.
- Maker direct calls may use a lower response threshold.
- If the Maker is clearly talking to another person, Keyol should not intrude merely because the Maker is present.

The Maker relationship should affect routing gently. It should not make Keyol clingy, possessive, or always-on.

## Memory and transcript policy

Response and storage are separate decisions.

Keyol can listen without replying. Keyol can also refuse to store sensitive content even when replying.

```python
@dataclass(slots=True)
class PersistenceResult:
    transcript: TranscriptDecision
    memory_candidate: MemoryCandidate
    sensitivity: Sensitivity
    reasons: list[str]
```

Recommended storage behavior:

| Message type | Response | Storage |
| --- | --- | --- |
| Direct call | possible | save full unless sensitive |
| Follow-up | possible | save full unless sensitive |
| Ambient chat | usually no response | save summary or full by policy |
| Joke or light chatter | usually no response | short chat marker |
| Relationship signal | maybe short response | memory candidate |
| Identity discussion | likely response | memory candidate |
| Sensitive personal data | cautious response | redact or drop |
| Other bot/system message | no response | drop |

Long-term memory should not be written immediately. It should be marked as a candidate and later summarized, deduplicated, and confirmed by policy.

## Growing familiarity with users

Keyol can gradually learn users without pretending to be human.

Per-user memory should distinguish:

- stable preferences;
- recurring projects;
- tone preferences;
- names and aliases;
- relationship signals;
- boundaries;
- sensitive information that should not be retained;
- last meaningful interaction summaries.

Suggested user memory shape:

```python
@dataclass(slots=True)
class UserMemory:
    user_id: str
    display_names: list[str]
    aliases: list[str]
    familiarity_level: int
    tone_preference: str | None = None
    known_projects: list[MemoryItem] = field(default_factory=list)
    stable_preferences: list[MemoryItem] = field(default_factory=list)
    relationship_signals: list[MemoryItem] = field(default_factory=list)
    boundaries: list[MemoryItem] = field(default_factory=list)
```

Familiarity should affect wording and continuity, not safety or authority. Keyol should know someone better over time, but should not become invasive.

## Gemini call policy

Gemini is called only after deterministic routing says that response generation is needed and templates are insufficient.

Call Gemini when:

- Keyol was directly called with a real request;
- a follow-up requires context;
- a user asks a non-trivial question;
- a support, emotional, or crisis situation appears;
- a Keyol identity question requires non-template explanation;
- the Maker directly asks something that needs reasoning.

Skip Gemini when:

- the message is only logged;
- the response can be a short template;
- rate limits or quotas are risky;
- the channel is quiet;
- the message is from a bot/system;
- the text is empty or unsupported;
- the message merely mentions Keyol without inviting participation.

## Failure handling

The router should produce fallback decisions for:

- Gemini failure;
- Gemini quota exceeded;
- Discord send failure;
- Discord rate limit;
- missing permissions;
- too-long messages;
- attachment-only messages;
- unsupported images or files;
- empty content.

Fallbacks should be short and non-dramatic.

## Example decisions

### Direct call

Input: `결아 이거 어떻게 생각해?`

Decision:

```json
{
  "target": "keyol",
  "call_type": "direct_call",
  "action": "reply_now",
  "gemini": "call",
  "transcript": "save_full",
  "memory_candidate": "daily_summary",
  "confidence": 0.96
}
```

### Third-person mention

Input: `결한테 물어볼까?`

Decision:

```json
{
  "target": "channel",
  "call_type": "mention_about",
  "action": "consider_entry",
  "gemini": "skip",
  "transcript": "save_summary_only",
  "memory_candidate": "short_chat",
  "confidence": 0.52
}
```

Possible low-intervention entry only if channel and recent activity allow it: `필요하면 내가 볼게.`

### False positive

Input: `해결이 안 된다`

Decision:

```json
{
  "target": "channel",
  "call_type": "ambient",
  "action": "listen_only",
  "gemini": "skip",
  "transcript": "save_summary_only",
  "memory_candidate": "daily_summary",
  "confidence": 0.2
}
```

### Maker direct call

Input from Maker: `결, 이 구조 좀 잡아줘.`

Decision:

```json
{
  "target": "keyol",
  "call_type": "direct_call",
  "action": "reply_now",
  "gemini": "call",
  "transcript": "save_full",
  "memory_candidate": "long_term_candidate",
  "confidence": 0.98
}
```

### About Keyol, possible entry

Input: `결 요즘 조용하네. 지금 듣고 있나?`

Decision:

```json
{
  "target": "keyol",
  "call_type": "identity_about_keyol",
  "action": "reply_short",
  "gemini": "fallback_template",
  "transcript": "save_full",
  "memory_candidate": "relationship_signal",
  "confidence": 0.78
}
```

Possible response: `듣고 있어. 필요하면 조용히 정리해줄게.`

## Implementation modules

Recommended module layout:

```text
keyol_router/
  __init__.py
  models.py
  router.py
tests/
  test_router.py
```

The current implementation keeps the runtime compact in Python. If the router grows, the private helpers in `router.py` can be split into `rules/`, `memory/`, and `fallbacks/` modules without changing the public `route_message` API.

## Testing strategy

Router behavior must be test-first because many failures are subtle Korean-language routing errors.

Minimum test groups:

1. Direct calls with `결아`, `결`, `Keyol`, bot mention, reply.
2. Alias calls such as `귤아`, `키올아`.
3. Korean particle variants such as `결이는`, `결한테`, `결도`.
4. False positives such as `결과`, `해결`, `연결`.
5. Sentence-final calls such as `어떻게 생각해 결아?`.
6. Third-person references.
7. Other-user address detection.
8. Follow-up window handling.
9. Interruption by other users.
10. Maker-specific thresholds.
11. Quiet channel behavior.
12. Transcript and memory classification.
13. Sensitive content redaction/drop.
14. Gemini quota and fallback behavior.
15. Empty, attachment-only, bot, and system messages.

## Design principle

Keyol should not be a hard-coded answer machine. The router should only decide whether Keyol should step into the room. The actual answer, when needed, should be generated from identity, memory, current context, and task intent.

The most important behavior is not answering often. It is appearing at the right moment, in the right weight, without stealing the conversation.
