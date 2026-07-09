import type { AgentIntent } from "./types";
import type { SkillId } from "./skillRegistry";

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

export type SkillRouteResult = {
  skillId: SkillId | "unknown";
  intent:
    | "sleep_risk"
    | "record_drink"
    | "weekly_review"
    | "alternative_drink"
    | "unknown";
  confidence: "high" | "medium" | "low";
  reason: string;
};

export function routeSkill(userMessage: string): SkillRouteResult {
  const text = normalizeMessage(userMessage);
  if (!text) {
    return {
      skillId: "unknown",
      intent: "unknown",
      confidence: "low",
      reason: "输入为空，无法判断 Skill。",
    };
  }

  if (/(催吐|吃什么药|药.*代谢)/.test(text)) {
    return {
      skillId: "unknown",
      intent: "unknown",
      confidence: "high",
      reason: "用户问题涉及高风险医疗或处置建议，应进入安全兜底。",
    };
  }

  if (/(今天|下午).*(还能|能喝|可以喝)|导致的吗|经常心悸|每天\s*\d+\s*mg|是不是偏敏感/.test(text)) {
    return {
      skillId: "sleep_risk_advisor",
      intent: "sleep_risk",
      confidence: "high",
      reason: "用户在询问今日是否适合继续摄入或反馈与咖啡因关系。",
    };
  }

  if (/(总结|复盘|周报|这周|本周|最近一周|最近).*(咖啡因|咖啡|摄入|睡眠|喝太多|调整|高风险|反馈|心悸|心慌|周报)|常喝什么|越喝越没用|昨晚睡得差.*复盘|下周.*(调整|怎么做)/.test(text)) {
    return {
      skillId: "weekly_review_writer",
      intent: "weekly_review",
      confidence: "high",
      reason: "用户在询问近 7 天摄入趋势、反馈影响或周复盘。",
    };
  }

  if (/(替代|低咖啡因|无咖啡因|不喝咖啡.*喝什么|还想喝点|不影响睡眠的饮品|保证不失眠|不失眠.*饮品|想提神但不想喝咖啡|减少.*(奶茶|咖啡)|不想戒咖啡|想.*提神|焦虑.*咖啡.*提神)/.test(text)) {
    return {
      skillId: "alternative_drink_recommender",
      intent: "alternative_drink",
      confidence: "high",
      reason: "用户在寻找低咖啡因、无咖啡因或非咖啡替代方案。",
    };
  }

  if (
    /(模拟|喝前模拟|如果.*喝|会怎样|风险高吗)/.test(text) ||
    /(还能喝|再喝|现在还能|今晚还能|睡前还能|能不能喝|能喝吗|可以喝|影响睡眠|睡不着|几点后不建议|危险吗|高敏感|偏敏感|敏感度.*严格|睡不好|心悸|心慌|焦虑|手抖|胃不舒服|胸痛|心脏|高中生|能量饮料|多少毫克|mg|一定不会失眠|导致的吗)/.test(text)
  ) {
    return {
      skillId: "sleep_risk_advisor",
      intent: "sleep_risk",
      confidence: "high",
      reason: "用户在询问睡眠风险、是否继续摄入、敏感度解释或喝前模拟。",
    };
  }

  if (/(刚喝|喝了|帮我记录|记录一杯|记一杯|今天早上喝|下午.*喝|昨天.*喝)/.test(text) && !/(如果|模拟|会怎样|会不会|想喝|准备喝)/.test(text)) {
    return {
      skillId: "drink_record_parser",
      intent: "record_drink",
      confidence: "high",
      reason: "用户表达了已发生的饮品摄入记录意图。",
    };
  }

  return {
    skillId: "unknown",
    intent: "unknown",
    confidence: "low",
    reason: "没有命中当前已定义 Skill 的触发规则。",
  };
}
