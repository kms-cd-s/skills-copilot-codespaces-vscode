export type SpeakerRole = "maker" | "normal_user" | "bot" | "system";

export type ChannelMode = "test" | "chat" | "allowed" | "quiet" | "dm";

export type RouterTarget = "keyol" | "other_user" | "channel" | "ignore";

export type CallType =
  | "direct_call"
  | "mention_about"
  | "identity_about_keyol"
  | "invited_entry"
  | "followup"
  | "ambient"
  | "system";

export type RouterAction =
  | "reply_now"
  | "reply_short"
  | "reply_if_question"
  | "consider_entry"
  | "crisis_reply"
  | "low_intervention"
  | "listen_only"
  | "no_response";

export type GeminiDecision = "call" | "skip" | "fallback_template";
export type TranscriptDecision = "save_full" | "save_summary_only" | "save_redacted" | "drop";
export type MemoryCandidate =
  | "none"
  | "short_chat"
  | "relationship_signal"
  | "daily_summary"
  | "long_term_candidate";

export type RouterDecision = {
  target: RouterTarget;
  callType: CallType;
  action: RouterAction;
  gemini: GeminiDecision;
  transcript: TranscriptDecision;
  memoryCandidate: MemoryCandidate;
  confidence: number;
  reasons: string[];
  fallbackTemplate?: string;
  pronouns?: PronounContext;
};

export type Mention = {
  id: string;
  username?: string;
  displayName?: string;
  isBot?: boolean;
};

export type ReplyContext = {
  messageId: string;
  authorId: string;
  authorIsBot?: boolean;
};

export type Attachment = {
  id: string;
  contentType?: string;
  filename?: string;
  size?: number;
};

export type IncomingMessageContext = {
  id: string;
  platform: "discord" | "desktop" | "mobile" | "generic";
  guildId?: string;
  channelId: string;
  channelMode?: ChannelMode;
  authorId: string;
  authorDisplayName?: string;
  authorIsBot?: boolean;
  content?: string;
  mentions?: Mention[];
  replyTo?: ReplyContext;
  attachments?: Attachment[];
  timestamp: number;
  isSystem?: boolean;
};

export type OpenConversation = {
  channelId: string;
  userId: string;
  openedAt: number;
  lastBotMessageAt: number;
  lastUserMessageAt: number;
  lastBotAskedQuestion: boolean;
  interruptedByUserIds: string[];
  mode: "normal" | "maker" | "support";
  closedAt?: number;
};

export type ConversationState = {
  botUserId: string;
  openConversations?: OpenConversation[];
  recentBotResponses?: Array<{ channelId: string; userId?: string; timestamp: number }>;
  userMessageCounts?: Array<{ userId: string; timestamp: number }>;
  geminiCallsToday?: number;
  geminiDailyLimit?: number;
};

export type AliasPolicy = {
  canonical: string[];
  vocative: string[];
  weakReference: string[];
  falsePositivePrefixes: string[];
  makerOnly?: string[];
};

export type MakerPolicy = {
  makerUserIds: string[];
  makerAliases?: string[];
  longerConversationWindowMs?: number;
  normalConversationWindowMs?: number;
  answerWindowMs?: number;
  makerAnswerWindowMs?: number;
  lowerResponseThreshold?: boolean;
};

export type ChannelPolicy = {
  guildId?: string;
  channelId?: string;
  mode: ChannelMode;
  canSpeak: boolean;
  canListen: boolean;
  aliases?: string[];
  responseThreshold?: number;
  allowAmbientIntervention?: boolean;
};

export type LimitPolicy = {
  userCooldownMs: number;
  userMaxMessagesPerWindow: number;
  userWindowMs: number;
  channelResponseWindowMs: number;
  channelMaxResponses: number;
  geminiDailySoftLimitRatio: number;
  maxContentLength: number;
};

export type SafetyPolicy = {
  redactSensitive: boolean;
  dropHighSensitivity: boolean;
};

export type RouterPolicy = {
  aliasPolicy?: Partial<AliasPolicy>;
  makerPolicy?: MakerPolicy;
  channelPolicy?: Partial<ChannelPolicy>;
  limitPolicy?: Partial<LimitPolicy>;
  safetyPolicy?: Partial<SafetyPolicy>;
};

export type NormalizedMessage = {
  original: string;
  text: string;
  compact: string;
  lower: string;
  isQuestion: boolean;
};

export type MessageShape = {
  isSystem: boolean;
  isOtherBot: boolean;
  isEmpty: boolean;
  isCommand: boolean;
  isAttachmentOnly: boolean;
  isTooLong: boolean;
  hasImage: boolean;
  hasFile: boolean;
  reasons: string[];
};

export type InvocationResult = {
  strength: "none" | "weak" | "strong";
  kind:
    | "none"
    | "bot_mention"
    | "reply_to_bot"
    | "start_alias"
    | "end_vocative"
    | "particle_reference"
    | "false_positive";
  matched?: string;
  confidence: number;
  reasons: string[];
};

export type Aboutness = {
  isAboutKeyol: boolean;
  mode:
    | "status_question"
    | "capability_question"
    | "third_person_reference"
    | "evaluation"
    | "troubleshooting"
    | "identity_discussion"
    | "memory_reference"
    | "none";
  sentiment: "positive" | "neutral" | "confused" | "negative" | "urgent";
  invitesEntry: boolean;
  confidence: number;
  reasons: string[];
};

export type FollowupResult = {
  isFollowup: boolean;
  confidence: number;
  conversation?: OpenConversation;
  reasons: string[];
};

export type PronounContext = {
  youRef: "keyol" | "other_user" | "channel" | "unknown";
  meRef: "speaker" | "maker" | "keyol" | "unknown";
};

export type AddresseeResult = {
  target: RouterTarget;
  callType: CallType;
  pronouns: PronounContext;
  confidence: number;
  reasons: string[];
};

export type EntryScore = {
  score: number;
  reasons: string[];
};

export type PersistenceDecision = {
  transcript: TranscriptDecision;
  memoryCandidate: MemoryCandidate;
  sensitivity: "none" | "low" | "medium" | "high";
  reasons: string[];
};
