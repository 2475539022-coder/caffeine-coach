export type SkillId =
  | "sleep_risk_advisor"
  | "drink_record_parser"
  | "weekly_review_writer"
  | "alternative_drink_recommender";

export type SkillDefinition = {
  id: SkillId;
  name: string;
  description: string;
  triggers: string[];
  requiredContext: string[];
  outputType: string;
  safetyNotes: string[];
};

export const SKILL_REGISTRY: Record<SkillId, SkillDefinition> = {
  sleep_risk_advisor: {
    id: "sleep_risk_advisor",
    name: "Sleep Risk Advisor",
    description: "判断今晚还能不能喝、是否可能影响睡眠，以及几点后应更谨慎。",
    triggers: ["今晚还能喝", "现在喝会不会影响睡眠", "几点后不建议喝", "睡前还能喝", "会不会睡不着"],
    requiredContext: [
      "userProfile.sleepTime",
      "userProfile.sensitivity",
      "userProfile.halfLife",
      "todayIntakeRecords",
      "remainingCaffeine",
      "estimatedCaffeineAtSleep",
      "sleepRisk",
      "recentFeedbackSummary",
    ],
    outputType: "sleep_risk_advice",
    safetyNotes: ["不做医学诊断", "不承诺一定不会失眠", "不忽略用户敏感度和睡觉时间"],
  },
  drink_record_parser: {
    id: "drink_record_parser",
    name: "Drink Record Parser",
    description: "把自然语言饮品记录解析成待确认的记录草稿。",
    triggers: ["我刚喝了一杯", "帮我记录", "今天早上喝了", "下午三点喝了", "昨天晚上喝了"],
    requiredContext: ["userText", "currentTime", "drinkLibrary", "customDrinks", "frequentDrinks", "noMatchMemory"],
    outputType: "drink_record_parse_result",
    safetyNotes: ["不编造咖啡因含量", "不自动写入 no_match", "未确认前不创建真实记录"],
  },
  weekly_review_writer: {
    id: "weekly_review_writer",
    name: "Weekly Review Writer",
    description: "生成近 7 天咖啡因摄入、睡眠风险、反馈和下周建议复盘。",
    triggers: ["总结这周", "本周复盘", "最近是不是喝太多", "这周有没有影响睡眠", "下周怎么调整"],
    requiredContext: ["weekRange", "intakeSummary", "dailyStatusSummary", "frequentDrinks", "feedbackSummary", "sensitivityExplanation"],
    outputType: "weekly_review",
    safetyNotes: ["只基于真实记录", "pending no_match 不计入", "模拟记录不计入", "不做医学诊断"],
  },
  alternative_drink_recommender: {
    id: "alternative_drink_recommender",
    name: "Alternative Drink Recommender",
    description: "在不适合继续摄入高咖啡因时推荐低因、无因或非饮品替代方案。",
    triggers: ["不喝咖啡喝什么", "有没有替代", "低咖啡因选择", "无咖啡因", "还想喝点东西"],
    requiredContext: ["userProfile", "currentState", "drinkOptions", "recentFeedbackSummary"],
    outputType: "alternative_drink_recommendation",
    safetyNotes: ["不编造咖啡因含量", "未知含量必须标注未知", "不承诺一定不影响睡眠"],
  },
};

export const SKILL_DEFINITIONS: SkillDefinition[] = Object.values(SKILL_REGISTRY);

export function getSkillDefinition(skillId: SkillId) {
  return SKILL_REGISTRY[skillId];
}
