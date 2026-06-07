import type { Aboutness, AddresseeResult, ChannelPolicy, EntryScore, FollowupResult, InvocationResult, SpeakerRole } from "../types.js";

export function scoreEntryOpportunity(
  invocation: InvocationResult,
  aboutness: Aboutness,
  followup: FollowupResult,
  addressee: AddresseeResult,
  speaker: SpeakerRole,
  channelPolicy: ChannelPolicy
): EntryScore {
  let score = 0.2;
  const reasons: string[] = [];

  if (invocation.strength === "strong") {
    score += 0.7;
    reasons.push("direct_invocation");
  }
  if (followup.isFollowup) {
    score += 0.35;
    reasons.push("open_followup");
  }
  if (aboutness.isAboutKeyol) {
    score += 0.15;
    reasons.push("about_keyol");
  }
  if (aboutness.invitesEntry) {
    score += 0.18;
    reasons.push("aboutness_invites_entry");
  }
  if (["status_question", "capability_question", "troubleshooting", "identity_discussion"].includes(aboutness.mode)) {
    score += 0.12;
    reasons.push(`aboutness_mode:${aboutness.mode}`);
  }
  if (speaker === "maker" && aboutness.isAboutKeyol) {
    score += 0.12;
    reasons.push("maker_about_keyol");
  }
  if (addressee.target === "other_user") {
    score -= 0.55;
    reasons.push("other_user_target_penalty");
  }
  if (channelPolicy.mode === "quiet" || !channelPolicy.canSpeak) {
    score -= 0.6;
    reasons.push("quiet_or_cannot_speak");
  }
  if (channelPolicy.mode === "test") {
    score += 0.1;
    reasons.push("test_channel_bonus");
  }

  return { score: Math.max(0, Math.min(score, 1)), reasons };
}
