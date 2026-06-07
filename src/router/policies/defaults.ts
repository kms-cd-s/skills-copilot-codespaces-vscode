import type { AliasPolicy, ChannelPolicy, LimitPolicy, MakerPolicy, RouterPolicy, SafetyPolicy } from "../types.js";

export const defaultAliasPolicy: AliasPolicy = {
  canonical: ["결", "keyol"],
  vocative: ["결아", "귤아", "키올아", "keyol"],
  weakReference: ["결이는", "결은", "결한테", "결에게", "결도", "결이", "결 봇", "keyol"],
  falsePositivePrefixes: ["결과", "해결", "연결", "판결", "종결", "미결"],
  makerOnly: []
};

export const defaultMakerPolicy: MakerPolicy = {
  makerUserIds: [],
  longerConversationWindowMs: 15 * 60 * 1000,
  normalConversationWindowMs: 3 * 60 * 1000,
  answerWindowMs: 10 * 60 * 1000,
  makerAnswerWindowMs: 30 * 60 * 1000,
  lowerResponseThreshold: true
};

export const defaultChannelPolicy: ChannelPolicy = {
  mode: "chat",
  canSpeak: true,
  canListen: true,
  aliases: [],
  responseThreshold: 0.65,
  allowAmbientIntervention: false
};

export const defaultLimitPolicy: LimitPolicy = {
  userCooldownMs: 8_000,
  userMaxMessagesPerWindow: 10,
  userWindowMs: 60_000,
  channelResponseWindowMs: 5 * 60 * 1000,
  channelMaxResponses: 8,
  geminiDailySoftLimitRatio: 0.9,
  maxContentLength: 4_000
};

export const defaultSafetyPolicy: SafetyPolicy = {
  redactSensitive: true,
  dropHighSensitivity: true
};

export function resolvePolicy(policy: RouterPolicy = {}) {
  return {
    aliasPolicy: {
      ...defaultAliasPolicy,
      ...policy.aliasPolicy,
      canonical: [...defaultAliasPolicy.canonical, ...(policy.aliasPolicy?.canonical ?? [])],
      vocative: [...defaultAliasPolicy.vocative, ...(policy.aliasPolicy?.vocative ?? [])],
      weakReference: [...defaultAliasPolicy.weakReference, ...(policy.aliasPolicy?.weakReference ?? [])],
      falsePositivePrefixes: [
        ...defaultAliasPolicy.falsePositivePrefixes,
        ...(policy.aliasPolicy?.falsePositivePrefixes ?? [])
      ],
      makerOnly: [...(defaultAliasPolicy.makerOnly ?? []), ...(policy.aliasPolicy?.makerOnly ?? [])]
    },
    makerPolicy: { ...defaultMakerPolicy, ...policy.makerPolicy },
    channelPolicy: { ...defaultChannelPolicy, ...policy.channelPolicy },
    limitPolicy: { ...defaultLimitPolicy, ...policy.limitPolicy },
    safetyPolicy: { ...defaultSafetyPolicy, ...policy.safetyPolicy }
  };
}
