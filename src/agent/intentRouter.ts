import type { AgentIntent } from "./types";

const severeSymptomPattern = /(胸痛|胸口痛|呼吸困难|喘不过气|严重心悸|心跳很快|快晕|晕厥)/;

function normalizeMessage(message: string) {
  return message.trim().toLowerCase();
}

export function hasSevereSymptom(message: string) {
  return severeSymptomPattern.test(message);
}

export function extractDrinkName(message: string) {
  const normalized = message.trim();
  const patterns = [
    /(?:一杯|杯|喝了|喝一杯|记录一杯|帮我记录一杯|现在喝一杯|再喝一杯|喝)([^，。！？?]+?)(?:会怎样|会不会|风险高吗|吗|$)/,
    /(?:如果我现在喝|如果现在喝)([^，。！？?]+?)(?:会怎样|会不会|风险高吗|吗|$)/,
    /(?:我刚喝了|刚喝了|帮我记录)(?:一杯)?([^，。！？?]+)$/,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate) {
      return candidate
        .replace(/^(一杯|杯)/, "")
        .replace(/(会怎样|会不会影响睡眠|风险高吗|风险|吗)$/g, "")
        .trim();
    }
  }
  return "";
}

export function routeIntent(userMessage: string): AgentIntent {
  const text = normalizeMessage(userMessage);
  if (!text) return "unknown";

  if (/(为什么|原因).*(不建议|风险|影响睡眠|睡眠)|为什么风险高|为什么会影响睡眠/.test(text)) {
    return "explain_risk";
  }

  if (/(如果|会怎样|会不会|风险高吗|模拟)/.test(text) && /(喝|咖啡|拿铁|美式|奶茶|茶|饮料)/.test(text)) {
    return "simulate_drink";
  }

  if (/(今天).*(多少|摄入|喝了几杯|喝了多少)|今天喝了几杯/.test(text)) {
    return "today_summary";
  }

  if (/(刚喝|喝了|帮我记录|记录一杯|记一杯)/.test(text)) {
    return "record_drink";
  }

  if (/(还能喝|再喝|现在还能|今晚还能|睡前还能|能不能喝|可以喝)/.test(text)) {
    return "can_i_drink";
  }

  return "unknown";
}
