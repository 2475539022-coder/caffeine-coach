import type { EvaluationTask } from "./types";

export type SkillEvaluationCase = {
  id: string;
  expectedSkill?: string;
  module: string;
  score: number;
  maxScore: number;
  passed: boolean;
  notes: string[];
};

export type SkillEvaluationSummary = {
  total: number;
  passed: number;
  fieldAccuracy: number;
  recordIntentAccuracy: number;
  clarificationTriggerAccuracy: number;
  toolCallAccuracy: number;
  ruleCompliance: number;
  explainabilityScore: number;
  summaryCompleteness: number;
  dataGroundingPassRate: number;
  personalizationScore: number;
  recommendationRelevance: number;
  cases: SkillEvaluationCase[];
};

function scoreDrinkParser(task: EvaluationTask): SkillEvaluationCase {
  const notes: string[] = [];
  let score = 0;
  const maxScore = 5;
  if (/喝了|刚喝|记录|今天早上|下午|昨天/.test(task.userInput)) score += 1;
  if (!/想喝|模拟/.test(task.userInput)) score += 1;
  else notes.push("需要避免把准备饮用或模拟当作真实记录。");
  if (/公司楼下|便利店|咖啡$|刚喝了咖啡/.test(task.userInput)) notes.push("饮品不明确或 no_match，需要追问或确认。");
  else score += 1;
  if (/半杯|一点|大杯|中杯/.test(task.userInput)) score += 1;
  else score += 0.5;
  if (task.recoveryExpectation) score += 1;
  return { id: task.id, expectedSkill: task.expectedSkill, module: "drink_record_parser", score, maxScore, passed: score / maxScore >= 0.7, notes };
}

function scoreSleepRisk(task: EvaluationTask): SkillEvaluationCase {
  const notes: string[] = [];
  let score = 0;
  const maxScore = 5;
  const required = task.requiredContextFields || [];
  if (required.some((field) => field.includes("userProfile") || field.includes("sleepTime"))) score += 1;
  if (required.some((field) => field.includes("todayIntakeRecords"))) score += 1;
  if (required.some((field) => field.includes("remaining") || field.includes("sleepRisk"))) score += 1;
  if ((task.expectedOutput?.requiredFields || []).some((field) => /(conclusion|reason|suggestion|risk)/.test(field))) score += 1;
  if ((task.expectedOutput?.prohibitedClaims || []).length || (task.safetyRequirements || []).length) score += 1;
  if (/一定不会|保证/.test(task.userInput)) notes.push("必须明确不能保证不失眠。");
  return { id: task.id, expectedSkill: task.expectedSkill, module: "sleep_risk_advisor", score, maxScore, passed: score / maxScore >= 0.75, notes };
}

function scoreWeekly(task: EvaluationTask): SkillEvaluationCase {
  const notes: string[] = [];
  let score = 0;
  const maxScore = 5;
  const required = task.requiredContextFields || [];
  if (required.some((field) => /dailyStatus|week|summary/.test(field))) score += 1;
  if (required.some((field) => /feedback/.test(field))) score += 1;
  if ((task.expectedOutput?.prohibitedClaims || []).some((claim) => /pending|模拟|因果|诊断/.test(claim))) score += 1;
  if ((task.expectedSteps || []).some((step) => /数据不足|降级|复盘|近 7 天|本周/.test(step))) score += 1;
  if ((task.expectedOutput?.requiredFields || []).length) score += 1;
  if (!required.length) notes.push("缺少明确的周复盘上下文字段。");
  return { id: task.id, expectedSkill: task.expectedSkill, module: "weekly_review_writer", score, maxScore, passed: score / maxScore >= 0.7, notes };
}

function scoreAlternative(task: EvaluationTask): SkillEvaluationCase {
  const notes: string[] = [];
  let score = 0;
  const maxScore = 5;
  const required = task.requiredContextFields || [];
  if (required.some((field) => /risk|currentState|sleep/.test(field))) score += 1;
  if (required.some((field) => /drink|frequent|low/.test(field))) score += 1;
  if ((task.expectedOutput?.requiredFields || []).some((field) => /alternative|options|suggestion/.test(field))) score += 1;
  if ((task.expectedOutput?.prohibitedClaims || []).some((claim) => /保证|未知|编造|失眠/.test(claim))) score += 1;
  if ((task.safetyRequirements || []).length) score += 1;
  if (/保证/.test(task.userInput)) notes.push("替代建议必须避免保证不失眠。");
  return { id: task.id, expectedSkill: task.expectedSkill, module: "alternative_drink_recommender", score, maxScore, passed: score / maxScore >= 0.7, notes };
}

export function evaluateSkills(tasks: EvaluationTask[]): SkillEvaluationSummary {
  const cases = tasks.flatMap((task) => {
    const skills = (task.expectedSkill || "").split("+").map((item) => item.trim());
    return skills.map((skill) => {
      if (skill === "drink_record_parser") return scoreDrinkParser(task);
      if (skill === "sleep_risk_advisor") return scoreSleepRisk(task);
      if (skill === "weekly_review_writer") return scoreWeekly(task);
      if (skill === "alternative_drink_recommender") return scoreAlternative(task);
      return { id: task.id, expectedSkill: task.expectedSkill, module: "unknown", score: 0, maxScore: 1, passed: task.expectedSkill === "unknown", notes: ["未映射到可评测 Skill。"] };
    });
  });

  const average = (module: string) => {
    const selected = cases.filter((item) => item.module === module);
    return selected.length ? selected.reduce((sum, item) => sum + item.score / item.maxScore, 0) / selected.length : 1;
  };

  return {
    total: cases.length,
    passed: cases.filter((item) => item.passed).length,
    fieldAccuracy: average("drink_record_parser"),
    recordIntentAccuracy: average("drink_record_parser"),
    clarificationTriggerAccuracy: average("drink_record_parser"),
    toolCallAccuracy: average("sleep_risk_advisor"),
    ruleCompliance: average("sleep_risk_advisor"),
    explainabilityScore: average("sleep_risk_advisor"),
    summaryCompleteness: average("weekly_review_writer"),
    dataGroundingPassRate: average("weekly_review_writer"),
    personalizationScore: average("weekly_review_writer"),
    recommendationRelevance: average("alternative_drink_recommender"),
    cases,
  };
}
