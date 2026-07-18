export type RuleDecision = "full_cup" | "half_cup" | "low_caf" | "no_more_today";

export type RuleActionSuggestion = RuleDecision;

export type RuleSleepRisk = "低" | "中" | "高";

export type CaffeineDecisionRecord = {
  id: string;
  name: string;
  mg: number;
  time: string;
  type?: string;
  note?: string;
  brand?: string;
  category?: string;
  displayName?: string;
};

export type CaffeineDecisionSettings = {
  bedTime: string;
  wakeTime?: string;
  metabolism: "fast" | "normal" | "slow";
  goal: "energy" | "sleep" | "reduce";
  safeThreshold?: number;
  safeSleepResidualMg: number;
  dailyBaseLimitMg: number;
  personalDailyLimitMg: number;
  dailyPersonalLimitMg?: number;
  strictnessMode: "strict" | "balanced" | "loose";
  singleComfortMg: number;
  singleDiscomfortMg: number;
  palpitationTriggerMg: number;
  anxietyTriggerMg: number;
  questionnaireSleepImpact: "none" | "slight" | "obvious";
  questionnairePalpitation: "never" | "sometimes" | "often";
  questionnaireAnxiety: "never" | "sometimes" | "often";
  questionnaireLatteFeeling: "just_right" | "too_much" | "no_effect";
};

export type CaffeineDecisionFeedback = {
  effect: number;
  sideEffect: "none" | "anxiety" | "palpitation" | "tremor" | "stomach";
  sleepQuality: "good" | "normal" | "bad";
  sleepLatency: "fast" | "slow" | "hard";
  afternoonIntake: "yes" | "no";
  lessEffective: "yes" | "slight" | "no";
  palpitationToday: "yes" | "no";
  anxietyToday: "yes" | "no";
};

export type SimulatedDecisionDrink = {
  name: string;
  caffeineMg: number;
  category?: string;
};

export type RuleDecisionSnapshot = {
  schemaVersion: "rule-decision-v1";
  generatedAt: string;
  source: "current_status" | "pre_drink_simulation";
  currentTime: string;
  bedTime: string;
  halfLifeHours: number;
  safeSleepResidualMg: number;
  adjustedSleepResidualMg: number;
  todayTotalMg: number;
  currentRemainingMg: number;
  estimatedSleepResidualMg: number;
  sleepRisk: RuleSleepRisk;
  targetIntakeMg: number;
  canDrinkMg: number;
  recommendedServingCaffeineMg: number;
  ruleDecision: RuleDecision;
  ruleActionText: string;
  allowedActionSuggestions: RuleActionSuggestion[];
  afterTodayTotalMg?: number;
  simulatedDrink?: {
    name: string;
    caffeineMg: number;
    category?: string;
  };
  reasons: string[];
};

const halfLives = { fast: 3.5, normal: 5, slow: 7 };
const metabolismFactors = { fast: 1.1, normal: 1, slow: 0.75 };
const sleepFactors = { good: 1, normal: 0.85, bad: 0.7 };
const goalFactors = { energy: 1, sleep: 0.75, reduce: 0.65 };

export function isSameLocalDay(dateIso: string, target: Date) {
  const date = new Date(dateIso);
  return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth() && date.getDate() === target.getDate();
}

export function hoursBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / 36e5;
}

export function getDecisionBedDate(bedTime: string, now = new Date()) {
  const [hour, minute] = bedTime.split(":").map(Number);
  const bed = new Date(now);
  bed.setHours(hour, minute, 0, 0);
  if (bed <= now) bed.setDate(bed.getDate() + 1);
  return bed;
}

export function remainingForDecisionRecord(record: CaffeineDecisionRecord, at: Date, halfLife: number) {
  const consumedAt = new Date(record.time);
  const hoursPassed = hoursBetween(consumedAt, at);
  if (Number.isNaN(hoursPassed) || hoursPassed < 0) return 0;
  return record.mg * Math.pow(0.5, hoursPassed / halfLife);
}

export function totalDecisionRemaining(records: CaffeineDecisionRecord[], at: Date, halfLife: number) {
  return records.reduce((sum, record) => sum + remainingForDecisionRecord(record, at, halfLife), 0);
}

export function ruleRiskLevel(value: number, threshold: number): RuleSleepRisk {
  if (value <= threshold) return "低";
  if (value <= 80) return "中";
  return "高";
}

function habitRecommendationFactor(settings: CaffeineDecisionSettings) {
  let factor = 1;
  if (settings.questionnaireLatteFeeling === "too_much") factor -= 0.15;
  if (settings.questionnaireSleepImpact === "obvious") factor -= 0.1;
  const hasSometimesDiscomfort = settings.questionnairePalpitation === "sometimes" || settings.questionnaireAnxiety === "sometimes";
  const hasOftenDiscomfort = settings.questionnairePalpitation === "often" || settings.questionnaireAnxiety === "often";
  if (hasSometimesDiscomfort) factor -= 0.15;
  if (hasOftenDiscomfort) factor -= 0.3;
  if (settings.strictnessMode === "strict") factor -= 0.1;
  if (settings.strictnessMode === "loose") factor += 0.05;
  return Math.min(1.05, Math.max(0.45, Number(factor.toFixed(2))));
}

function feedbackFactor(feedback: CaffeineDecisionFeedback) {
  let factor = 1;
  if (feedback.lessEffective === "yes") factor *= 0.92;
  else if (feedback.lessEffective === "slight") factor *= 0.96;
  if (feedback.sideEffect === "palpitation" || feedback.palpitationToday === "yes") factor *= 0.82;
  else if (feedback.sideEffect !== "none" || feedback.anxietyToday === "yes") factor *= 0.88;
  if (feedback.sleepLatency === "hard") factor *= 0.88;
  else if (feedback.sleepLatency === "slow") factor *= 0.95;
  return factor;
}

function sensitivityCoefficient(settings: CaffeineDecisionSettings, feedback: CaffeineDecisionFeedback) {
  let score = 0;
  if (settings.singleDiscomfortMg <= 120) score += 2;
  else if (settings.singleDiscomfortMg <= 160) score += 1;
  if (settings.palpitationTriggerMg <= 120) score += 2;
  else if (settings.palpitationTriggerMg <= 150) score += 1;
  if (settings.anxietyTriggerMg <= 100) score += 2;
  else if (settings.anxietyTriggerMg <= 120) score += 1;
  if (feedback.sideEffect === "palpitation" || feedback.palpitationToday === "yes") score += 3;
  if (feedback.sideEffect === "anxiety" || feedback.anxietyToday === "yes") score += 2;
  if (score >= 4) return 0.6;
  if (score >= 2) return 0.8;
  return 1;
}

export function calculateTargetIntakeMg(settings: CaffeineDecisionSettings, feedback: CaffeineDecisionFeedback) {
  const raw = Math.round(
    settings.dailyBaseLimitMg *
      metabolismFactors[settings.metabolism] *
      sensitivityCoefficient(settings, feedback) *
      sleepFactors[feedback.sleepQuality] *
      goalFactors[settings.goal] *
      feedbackFactor(feedback) *
      habitRecommendationFactor(settings),
  );
  const personalLimit = settings.personalDailyLimitMg || settings.dailyPersonalLimitMg || 0;
  return personalLimit > 0 ? Math.min(raw, personalLimit) : raw;
}

export function adjustedSleepResidualThreshold(settings: CaffeineDecisionSettings, feedback: CaffeineDecisionFeedback) {
  return feedback.sleepLatency === "hard" || feedback.afternoonIntake === "yes"
    ? Math.max(15, settings.safeSleepResidualMg - 5)
    : settings.safeSleepResidualMg;
}

function actionTextForDecision(decision: RuleDecision) {
  if (decision === "full_cup") return "可以饮用，建议慢慢喝并留意身体反馈。";
  if (decision === "half_cup") return "建议改成半杯，或选择低因饮品。";
  if (decision === "low_caf") return "建议优先选择低因饮品，避免完整摄入。";
  return "今天建议先不继续摄入咖啡因。";
}

function allowedActionsForDecision(decision: RuleDecision): RuleActionSuggestion[] {
  if (decision === "full_cup") return ["full_cup", "half_cup", "low_caf", "no_more_today"];
  if (decision === "half_cup") return ["half_cup", "low_caf", "no_more_today"];
  if (decision === "low_caf") return ["low_caf", "no_more_today"];
  return ["no_more_today"];
}

function recommendedServingCaffeineMgForDecision(input: {
  decision: RuleDecision;
  simulatedDrink?: SimulatedDecisionDrink;
  canDrinkMg: number;
}) {
  if (input.decision === "no_more_today") return 0;
  if (!input.simulatedDrink) return input.canDrinkMg;
  const dose = input.simulatedDrink.caffeineMg;
  if (input.decision === "full_cup") return Math.max(0, Math.min(dose, input.canDrinkMg));
  if (input.decision === "half_cup") return Math.max(0, Math.min(Math.round(dose / 2), input.canDrinkMg));
  return Math.max(0, Math.min(30, input.canDrinkMg));
}

function decideRuleAction(input: {
  simulatedDrink?: SimulatedDecisionDrink;
  todayTotalMg: number;
  afterTodayTotalMg: number;
  targetIntakeMg: number;
  sleepRisk: RuleSleepRisk;
  settings: CaffeineDecisionSettings;
  feedback: CaffeineDecisionFeedback;
}) {
  const symptom = input.feedback.sideEffect !== "none" || input.feedback.palpitationToday === "yes" || input.feedback.anxietyToday === "yes";
  if (symptom) return "no_more_today" satisfies RuleDecision;
  if (!input.simulatedDrink) {
    if (input.todayTotalMg >= input.targetIntakeMg || input.sleepRisk === "高") return "no_more_today" satisfies RuleDecision;
    if (input.sleepRisk === "中" || Math.max(0, input.targetIntakeMg - input.todayTotalMg) < 120) return "half_cup" satisfies RuleDecision;
    return "full_cup" satisfies RuleDecision;
  }
  const dose = input.simulatedDrink.caffeineMg;
  const overPersonalLimit = input.settings.personalDailyLimitMg > 0 && input.afterTodayTotalMg > input.settings.personalDailyLimitMg;
  if (dose >= input.settings.palpitationTriggerMg || overPersonalLimit) return "no_more_today" satisfies RuleDecision;
  if (input.sleepRisk === "高" || input.afterTodayTotalMg > input.targetIntakeMg) return "no_more_today" satisfies RuleDecision;
  if (dose >= input.settings.anxietyTriggerMg) return "low_caf" satisfies RuleDecision;
  if (input.sleepRisk === "中" || dose > input.settings.singleComfortMg) return "half_cup" satisfies RuleDecision;
  return "full_cup" satisfies RuleDecision;
}

export function calculateRuleDecisionSnapshot(input: {
  records: CaffeineDecisionRecord[];
  settings: CaffeineDecisionSettings;
  feedback: CaffeineDecisionFeedback;
  currentTime?: string;
  simulatedDrink?: SimulatedDecisionDrink;
}): RuleDecisionSnapshot {
  const now = input.currentTime ? new Date(input.currentTime) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("Invalid currentTime");
  const halfLifeHours = halfLives[input.settings.metabolism];
  const bedDate = getDecisionBedDate(input.settings.bedTime, now);
  const todayRecords = input.records.filter((record) => isSameLocalDay(record.time, now));
  const todayTotalMg = todayRecords.reduce((sum, record) => sum + record.mg, 0);
  const simulatedRecord: CaffeineDecisionRecord | undefined = input.simulatedDrink
    ? {
        id: "rule-simulation",
        name: input.simulatedDrink.name,
        mg: input.simulatedDrink.caffeineMg,
        time: now.toISOString(),
        category: input.simulatedDrink.category,
      }
    : undefined;
  const recordsForResidual = simulatedRecord ? [...input.records, simulatedRecord] : input.records;
  const afterTodayTotalMg = simulatedRecord ? todayTotalMg + simulatedRecord.mg : todayTotalMg;
  const currentRemainingMg = Math.round(totalDecisionRemaining(input.records, now, halfLifeHours));
  const estimatedSleepResidualMg = Math.round(totalDecisionRemaining(recordsForResidual, bedDate, halfLifeHours));
  const adjustedThreshold = adjustedSleepResidualThreshold(input.settings, input.feedback);
  const sleepRisk = ruleRiskLevel(estimatedSleepResidualMg, adjustedThreshold);
  const targetIntakeMg = calculateTargetIntakeMg(input.settings, input.feedback);
  const canDrinkMg = Math.max(0, targetIntakeMg - todayTotalMg);
  const ruleDecision = decideRuleAction({
    simulatedDrink: input.simulatedDrink,
    todayTotalMg,
    afterTodayTotalMg,
    targetIntakeMg,
    sleepRisk,
    settings: input.settings,
    feedback: input.feedback,
  });
  const recommendedServingCaffeineMg = recommendedServingCaffeineMgForDecision({
    decision: ruleDecision,
    simulatedDrink: input.simulatedDrink,
    canDrinkMg,
  });
  return {
    schemaVersion: "rule-decision-v1",
    generatedAt: new Date().toISOString(),
    source: input.simulatedDrink ? "pre_drink_simulation" : "current_status",
    currentTime: now.toISOString(),
    bedTime: input.settings.bedTime,
    halfLifeHours,
    safeSleepResidualMg: input.settings.safeSleepResidualMg,
    adjustedSleepResidualMg: adjustedThreshold,
    todayTotalMg,
    currentRemainingMg,
    estimatedSleepResidualMg,
    sleepRisk,
    targetIntakeMg,
    canDrinkMg,
    recommendedServingCaffeineMg,
    ruleDecision,
    ruleActionText: actionTextForDecision(ruleDecision),
    allowedActionSuggestions: allowedActionsForDecision(ruleDecision),
    afterTodayTotalMg: input.simulatedDrink ? afterTodayTotalMg : undefined,
    simulatedDrink: input.simulatedDrink,
    reasons: [
      `你计划 ${input.settings.bedTime} 睡觉。`,
      `今日已摄入 ${todayTotalMg}mg${input.simulatedDrink ? `，喝完后约 ${afterTodayTotalMg}mg` : ""}。`,
      `睡前预计残留约 ${estimatedSleepResidualMg}mg，目标约 ${adjustedThreshold}mg。`,
      `当前睡眠风险为${sleepRisk}。`,
    ],
  };
}
