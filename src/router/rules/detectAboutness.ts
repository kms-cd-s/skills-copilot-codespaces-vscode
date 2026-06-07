import type { Aboutness, InvocationResult, NormalizedMessage, AliasPolicy } from "../types.js";

const KOREAN_PARTICLES = "은는이가을를도만에게한테랑과와로으로야아께서부터까지처럼보다의";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasReferencePattern(aliases: string[]): RegExp {
  const escaped = aliases
    .filter(Boolean)
    .map((alias) => escapeRegExp(alias.toLocaleLowerCase()))
    .sort((a, b) => b.length - a.length);

  if (escaped.length === 0) return /$a/u;

  return new RegExp(`(?:^|\\s)(?:${escaped.join("|")})(?:\\s|$|[${KOREAN_PARTICLES}])`, "iu");
}

export function detectAboutness(
  normalized: NormalizedMessage,
  invocation: InvocationResult,
  aliasPolicy: AliasPolicy
): Aboutness {
  const text = normalized.lower;
  const compact = normalized.compact;
  const reasons: string[] = [];

  if (invocation.kind === "false_positive") {
    return { isAboutKeyol: false, mode: "none", sentiment: "neutral", invitesEntry: false, confidence: 0, reasons };
  }

  const aboutAliases = [
    ...aliasPolicy.canonical,
    ...aliasPolicy.vocative,
    ...aliasPolicy.weakReference
  ];
  const mentionsKeyol = invocation.strength !== "none" || aliasReferencePattern(aboutAliases).test(text);

  if (!mentionsKeyol) {
    return { isAboutKeyol: false, mode: "none", sentiment: "neutral", invitesEntry: false, confidence: 0, reasons };
  }

  let mode: Aboutness["mode"] = "third_person_reference";
  let sentiment: Aboutness["sentiment"] = "neutral";
  let confidence = invocation.strength === "strong" ? 0.8 : 0.5;
  let invitesEntry = invocation.strength === "strong";

  if (/(온라인|있어|듣고|켜져|접속|상태)/u.test(compact)) {
    mode = "status_question";
    confidence += 0.15;
    invitesEntry = true;
    reasons.push("status_question");
  } else if (/(할수|가능|뭐해|도와|물어볼까|봐줄|정리)/u.test(compact)) {
    mode = "capability_question";
    confidence += 0.15;
    invitesEntry = true;
    reasons.push("capability_question");
  } else if (/(이상|고장|문제|오류|안돼|안되|느려|망가)/u.test(compact)) {
    mode = "troubleshooting";
    sentiment = "confused";
    confidence += 0.18;
    invitesEntry = true;
    reasons.push("troubleshooting");
  } else if (/(누구|정체|존재|로봇|사람|생명|결이란|keyol이란|키올이란|귤이란)/iu.test(compact)) {
    mode = "identity_discussion";
    confidence += 0.2;
    invitesEntry = normalized.isQuestion;
    reasons.push("identity_discussion");
  } else if (/(기억|아까|전에|말했|대화)/u.test(compact)) {
    mode = "memory_reference";
    confidence += 0.1;
    invitesEntry = normalized.isQuestion;
    reasons.push("memory_reference");
  } else if (/(좋|싫|짧|조용|귀엽|별로|무섭|괜찮)/u.test(compact)) {
    mode = "evaluation";
    confidence += 0.08;
    reasons.push("evaluation");
  }

  if (/(급해|도와줘|살려|위험|힘들|죽고|자해)/u.test(compact)) {
    sentiment = "urgent";
    invitesEntry = true;
    confidence += 0.25;
    reasons.push("urgent_signal");
  } else if (/(이상|문제|안돼|안되|힘들|불편)/u.test(compact)) {
    sentiment = "confused";
  } else if (/(좋|고마|괜찮)/u.test(compact)) {
    sentiment = "positive";
  }

  if (normalized.isQuestion && mode !== "third_person_reference") {
    invitesEntry = true;
    confidence += 0.05;
    reasons.push("question_invites_entry");
  }

  return {
    isAboutKeyol: true,
    mode,
    sentiment,
    invitesEntry,
    confidence: Math.min(confidence, 0.95),
    reasons
  };
}
