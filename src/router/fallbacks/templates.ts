export function getFallbackTemplate(reason: string): string {
  switch (reason) {
    case "attachment_only":
      return "첨부만으로는 아직 조용히 기록만 해둘게.";
    case "too_long":
      return "메시지가 길어. 필요하면 나눠서 보내줘.";
    case "gemini_quota_risk":
      return "지금은 가볍게만 볼게. 깊은 답은 조금 아껴두자.";
    case "rate_limited":
      return "잠깐만. 흐름이 너무 빨라서 조금 늦출게.";
    case "quiet_channel":
      return "";
    default:
      return "필요하면 짧게 볼게.";
  }
}
