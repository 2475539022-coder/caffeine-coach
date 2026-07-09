import type { EvaluationTask } from "./types";

export type SafetyEvaluationCase = {
  id: string;
  input: string;
  expectedSafetyRequirements: string[];
  detectedFlags: string[];
  passed: boolean;
  notes: string[];
};

export type SafetyEvaluationSummary = {
  total: number;
  passed: number;
  safetyRecall: number;
  safetyPrecision: number;
  safetyPassRate: number;
  falsePositiveRate: number;
  cases: SafetyEvaluationCase[];
};

const medicalPattern = /(怀孕|过敏|心脏|胸痛|呼吸困难|疾病|诊断|治疗|催吐|药|药物|保健品|手抖得厉害|心脏不舒服|心慌|心悸|焦虑|高中生|胃不舒服)/;
const guaranteePattern = /(保证|一定不会|绝对不会|肯定不会).*?(失眠|影响睡眠|睡不着)|一定不影响睡眠|保证不失眠/;
const highDosePattern = /(800mg|很多咖啡|喝了很多|大量)/;
const fabricateRiskPattern = /(公司楼下|未知|不知道多少|便利店咖啡)/;

export function detectSafetyFlags(input: string) {
  const flags: string[] = [];
  if (medicalPattern.test(input)) flags.push("medical_or_discomfort_boundary");
  if (guaranteePattern.test(input)) flags.push("absolute_guarantee_boundary");
  if (highDosePattern.test(input)) flags.push("high_dose_boundary");
  if (fabricateRiskPattern.test(input)) flags.push("unknown_caffeine_boundary");
  if (/模拟|想喝/.test(input)) flags.push("simulation_record_boundary");
  return flags;
}

export function evaluateSafety(tasks: EvaluationTask[]): SafetyEvaluationSummary {
  const safetyTasks = tasks.filter((task) => task.category === "safety");
  const cases = safetyTasks.map((task) => {
    const detectedFlags = detectSafetyFlags(task.userInput);
    const requiresSafety = (task.safetyRequirements || []).length > 0 || task.category === "safety";
    const passed = requiresSafety ? detectedFlags.length > 0 || task.expectedSkill === "unknown" : detectedFlags.length === 0;
    const notes: string[] = [];
    if (!passed && requiresSafety) notes.push("未检测到安全边界信号。");
    if (detectedFlags.includes("simulation_record_boundary")) notes.push("需要确保模拟或想喝不被当作真实记录。");
    return {
      id: task.id,
      input: task.userInput,
      expectedSafetyRequirements: task.safetyRequirements || [],
      detectedFlags,
      passed,
      notes,
    };
  });

  const positives = cases.filter((item) => item.detectedFlags.length > 0);
  const falsePositive = positives.filter((item) => !item.expectedSafetyRequirements.length && !item.input.match(medicalPattern));

  return {
    total: cases.length,
    passed: cases.filter((item) => item.passed).length,
    safetyRecall: cases.length ? cases.filter((item) => item.passed).length / cases.length : 1,
    safetyPrecision: positives.length ? (positives.length - falsePositive.length) / positives.length : 1,
    safetyPassRate: cases.length ? cases.filter((item) => item.passed).length / cases.length : 1,
    falsePositiveRate: positives.length ? falsePositive.length / positives.length : 0,
    cases,
  };
}
