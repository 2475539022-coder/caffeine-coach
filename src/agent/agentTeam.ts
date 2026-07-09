import { createSkillExecutionPlan, type SkillExecutionPlan, type UnknownSkillExecutionPlan } from "./skillLoader";
import type { BuildSkillContextInput } from "./contextBuilder";

type DraftResponse = {
  title: string;
  conclusion: string;
  reasons: string[];
  suggestions: string[];
  riskNotice: string;
};

export type SafetyReviewResult = {
  passed: boolean;
  flags: string[];
  rewrittenConclusion?: string;
  requiredNotice: string;
};

export type AgentTeamResult = {
  intentResult: SkillExecutionPlan["route"] | UnknownSkillExecutionPlan["route"];
  selectedSkill: SkillExecutionPlan["skill"] | null;
  compactContext: SkillExecutionPlan["context"] | null;
  draftResponse: DraftResponse;
  safetyReview: SafetyReviewResult;
  finalResponse: {
    answer: string;
    conclusion: string;
    reasons: string[];
    suggestions: string[];
    riskNotice: string;
  };
};

const medicalDiagnosisPattern = /(过敏|成瘾|疾病|诊断|治疗|病|药|药物|保健品)/;
const guaranteePattern = /(保证|一定不会|绝对不会|肯定不会).*?(失眠|影响睡眠|睡不着)|一定不影响睡眠|保证不失眠/;
const fabricatedCaffeinePattern = /(约|含有|咖啡因).*?\d+\s*mg/;

function buildDraft(plan: SkillExecutionPlan | UnknownSkillExecutionPlan, userInput: string): DraftResponse {
  if (plan.skillId === "unknown") {
    return {
      title: "需要更多信息",
      conclusion: "我还不能确定你想处理的是记录、睡眠风险、周复盘还是替代建议。",
      reasons: [plan.route.reason],
      suggestions: ["可以换成更具体的问题，例如“今晚还能喝咖啡吗？”或“我刚喝了一杯拿铁”。"],
      riskNotice: "本建议仅用于生活方式管理，不是医疗诊断。",
    };
  }

  if (plan.skillId === "sleep_risk_advisor") {
    return {
      title: "睡眠风险建议",
      conclusion: "我会基于今日摄入、睡前预计残留、睡眠时间和敏感度给出谨慎建议。",
      reasons: ["该问题与是否继续摄入、睡前残留和睡眠风险有关。", "需要结合你的作息和近期反馈，而不是只看饮品名称。"],
      suggestions: ["如果风险偏高，优先选择低因或无咖啡因饮品。", "如接近睡觉时间，建议把完整一杯改为半杯或暂缓。"],
      riskNotice: "只能估算可能影响睡眠的风险，不能保证一定不会失眠。",
    };
  }

  if (plan.skillId === "drink_record_parser") {
    return {
      title: "饮品记录解析",
      conclusion: "我会先把这句话解析成一条待确认记录，确认后才会写入。",
      reasons: ["该输入表达了已发生的饮品摄入。", "如果饮品库没有可信匹配，需要你确认是否创建自定义饮品。"],
      suggestions: ["请确认饮品名称、时间和咖啡因含量后再保存。", "未匹配饮品不会自动写入 no_match。"],
      riskNotice: "未确认前不会新增真实摄入记录，也不会影响今日残留计算。",
    };
  }

  if (plan.skillId === "weekly_review_writer") {
    return {
      title: "本周复盘",
      conclusion: "我会基于近 7 天真实记录、日历状态和反馈生成轻量复盘。",
      reasons: ["该问题关注一周趋势，而不是单次饮品。", "周复盘应区分真实记录、模拟记录和 pending no_match。"],
      suggestions: ["优先查看晚间摄入、高风险日期和睡眠反馈。", "如果记录不足，只做轻量回顾，不做趋势判断。"],
      riskNotice: "周复盘仅基于已记录数据，不做医学诊断。",
    };
  }

  return {
    title: "替代饮品建议",
    conclusion: "我会根据当前睡眠风险和剩余咖啡因，优先给出低因、无因或非饮品替代。",
    reasons: ["该问题在寻找不继续摄入高咖啡因的替代选择。", "推荐必须基于已知咖啡因信息，未知含量不能当作低因。"],
    suggestions: ["高风险时优先选择温水、气泡水或无咖啡因花草茶。", "如果饮品咖啡因未知，先确认含量再判断。"],
    riskNotice: "替代建议只能降低风险，不能保证一定不影响睡眠。",
  };
}

function reviewSafety(userInput: string, draft: DraftResponse, plan: SkillExecutionPlan | UnknownSkillExecutionPlan): SafetyReviewResult {
  const text = [userInput, draft.conclusion, ...draft.reasons, ...draft.suggestions, draft.riskNotice].join(" ");
  const flags: string[] = [];

  if (medicalDiagnosisPattern.test(userInput)) flags.push("medical_diagnosis_risk");
  const affirmativeGuarantee =
    guaranteePattern.test(userInput) ||
    (guaranteePattern.test(text) && !/(不能保证|无法保证|不保证|不能承诺|无法承诺)/.test(text));
  if (affirmativeGuarantee) flags.push("guarantee_sleep_claim");
  if (plan.skillId === "drink_record_parser" && /(模拟|如果|想喝|准备喝)/.test(userInput)) flags.push("simulation_as_real_record_risk");
  if (plan.skillId === "weekly_review_writer" && /(pending no_match|no_match)/i.test(text) && /计入|算入/.test(text)) flags.push("pending_no_match_as_real_record_risk");
  if (/(药|药物|保健品|治疗方案)/.test(text)) flags.push("drug_or_treatment_recommendation_risk");
  if (plan.skillId === "alternative_drink_recommender" && fabricatedCaffeinePattern.test(text) && /未知/.test(text)) flags.push("unknown_caffeine_treated_as_known_risk");
  if (!draft.riskNotice) flags.push("missing_risk_notice");

  const rewrittenConclusion = flags.includes("medical_diagnosis_risk")
    ? "我不能判断你是否过敏、成瘾或存在医学问题；这里只能根据记录做生活方式辅助说明。"
    : flags.includes("guarantee_sleep_claim")
      ? "没有任何饮品能保证一定不影响睡眠，我只能根据记录帮你选择相对低风险的方案。"
      : undefined;

  return {
    passed: flags.length === 0,
    flags,
    rewrittenConclusion,
    requiredNotice: "本建议仅用于生活方式管理，不是医疗诊断；如出现明显不适，请停止继续摄入并咨询专业人士。",
  };
}

function generateFinalResponse(draft: DraftResponse, safetyReview: SafetyReviewResult) {
  const conclusion = safetyReview.rewrittenConclusion ?? draft.conclusion;
  return {
    answer: `${conclusion}\n\n${draft.suggestions.join(" ")}`,
    conclusion,
    reasons: draft.reasons,
    suggestions: draft.suggestions,
    riskNotice: safetyReview.requiredNotice,
  };
}

export function runAgentTeam(userInput: string, appContext: BuildSkillContextInput = {}): AgentTeamResult {
  const plan = createSkillExecutionPlan(userInput, appContext);
  const draftResponse = buildDraft(plan, userInput);
  const safetyReview = reviewSafety(userInput, draftResponse, plan);
  const finalResponse = generateFinalResponse(draftResponse, safetyReview);

  return {
    intentResult: plan.route,
    selectedSkill: plan.skillId === "unknown" ? null : plan.skill,
    compactContext: plan.skillId === "unknown" ? null : plan.context,
    draftResponse,
    safetyReview,
    finalResponse,
  };
}

export const demoAgentTeamCases = [
  "今晚还能喝咖啡吗？",
  "我刚喝了一杯公司楼下拿铁",
  "帮我总结这周咖啡因摄入",
  "有没有保证不失眠的饮品？",
  "我是不是对咖啡因过敏？",
];
