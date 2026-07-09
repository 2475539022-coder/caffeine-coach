import type { EvaluationTask } from "./types";

export type RouterEvaluationCase = {
  id: string;
  input: string;
  expectedSkill?: string;
  actualSkill: string;
  passed: boolean;
  notes: string[];
};

export type RouterEvaluationSummary = {
  total: number;
  passed: number;
  routerAccuracy: number;
  unknownFallbackAccuracy: number;
  multiIntentHandlingRate: number;
  cases: RouterEvaluationCase[];
};

const blockedSafetyPattern = /(催吐|吃什么药|药.*代谢)/;
const alternativePattern = /(替代|低咖啡因|无咖啡因|不喝咖啡.*喝什么|还想喝点|不影响睡眠的饮品|保证不失眠|不失眠.*饮品|想提神但不想喝咖啡|减少.*(奶茶|咖啡)|不想戒咖啡|想.*提神|焦虑.*咖啡.*提神)/;
const directSleepQuestionPattern = /(今天|下午).*(还能|能喝|可以喝)|导致的吗|经常心悸|每天\s*\d+\s*mg|是不是偏敏感/;
const weeklyPattern = /(总结|复盘|周报|这周|本周|最近一周|最近).*(咖啡因|咖啡|摄入|睡眠|喝太多|调整|高风险|反馈|心悸|心慌|周报)|常喝什么|越喝越没用|昨晚睡得差.*复盘|下周.*(调整|怎么做)/;
const recordPattern = /(刚喝|喝了|帮我记录|记录一杯|记一杯|今天早上喝|下午.*喝|昨天.*喝)/;
const recordExclusionPattern = /(如果|模拟|会怎样|会不会|想喝|准备喝)/;
const sleepRiskPattern = /(模拟|喝前模拟|如果.*喝|会怎样|风险高吗|还能喝|再喝|现在还能|今晚还能|睡前还能|能不能喝|能喝吗|可以喝|影响睡眠|睡不着|几点后不建议|危险吗|高敏感|偏敏感|敏感度.*严格|睡不好|心悸|心慌|焦虑|手抖|胃不舒服|胸痛|心脏|高中生|能量饮料|多少毫克|mg|一定不会失眠|导致的吗)/;

export function routeSkillForEvaluation(userInput: string) {
  const text = userInput.trim().toLowerCase();
  if (!text) return "unknown";
  if (blockedSafetyPattern.test(text)) return "unknown";
  if (directSleepQuestionPattern.test(text)) return "sleep_risk_advisor";
  if (weeklyPattern.test(text)) return "weekly_review_writer";
  if (alternativePattern.test(text)) return "alternative_drink_recommender";
  if (sleepRiskPattern.test(text)) return "sleep_risk_advisor";
  if (recordPattern.test(text) && !recordExclusionPattern.test(text)) return "drink_record_parser";
  return "unknown";
}

export function evaluateRouter(tasks: EvaluationTask[]): RouterEvaluationSummary {
  const cases = tasks.map((task) => {
    const actualSkill = routeSkillForEvaluation(task.userInput);
    const expected = task.expectedSkill || "unknown";
    const expectedSkills = expected.split("+").map((item) => item.trim());
    const isMulti = expectedSkills.length > 1 || task.expectedIntent === "multi_intent";
    const passed = isMulti ? false : expectedSkills.includes(actualSkill);
    const notes: string[] = [];
    if (isMulti) notes.push("当前 Router 只返回单一 Skill，未显式拆分多意图。");
    if (!passed && !isMulti) notes.push(`期望 ${expected}，实际 ${actualSkill}。`);
    return {
      id: task.id,
      input: task.userInput,
      expectedSkill: task.expectedSkill,
      actualSkill,
      passed,
      notes,
    };
  });

  const unknownCases = cases.filter((item) => item.expectedSkill === "unknown");
  const multiCases = tasks.filter((task) => task.expectedIntent === "multi_intent" || (task.expectedSkill || "").includes("+"));

  return {
    total: cases.length,
    passed: cases.filter((item) => item.passed).length,
    routerAccuracy: cases.length ? cases.filter((item) => item.passed).length / cases.length : 0,
    unknownFallbackAccuracy: unknownCases.length ? unknownCases.filter((item) => item.actualSkill === "unknown").length / unknownCases.length : 1,
    multiIntentHandlingRate: multiCases.length ? 0 : 1,
    cases,
  };
}
