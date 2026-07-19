import type { CaffeineDecisionRecord, RuleDecisionSnapshot } from "./caffeineDecisionEngine.js";

export type FeedbackMemoryForEvidence = {
  date: string;
  sleepQuality?: "good" | "normal" | "bad";
  fallAsleepSpeed?: "fast" | "normal" | "slow";
  palpitation?: boolean;
  anxiety?: boolean;
  stomachDiscomfort?: boolean;
  handTremor?: boolean;
  focusEffect?: number;
};

export type DailyStatusForEvidence = {
  date: string;
  recordCount: number;
  bedtimeResidualMg: number;
  sleepRiskLevel: "低" | "中" | "高";
  hasEveningIntake: boolean;
  hasFeedback: boolean;
};

export type EvidenceStrength = "low" | "medium" | "high";

export type ObservationType =
  | "low_risk_positive_pattern"
  | "evening_intake_pattern"
  | "high_residual_pattern"
  | "sleep_feedback_overlap"
  | "discomfort_overlap"
  | "insufficient_data"
  | "none";

export type EvidenceDecisionRelation = "supports_decision" | "contrasts_with_decision" | "not_relevant";

export type EvidenceCandidate = {
  evidenceId: string;
  observationType: ObservationType;
  count: number;
  summary: string;
  requiresFeedback: boolean;
  relationToDecision: EvidenceDecisionRelation;
  relationSummary: string;
};

export type HistoricalEvidenceSummary = {
  windowDays: 14;
  effectiveRecordDays: number;
  eveningIntakeDays: number;
  highResidualDays: number;
  sleepAffectedFeedbackCount: number;
  discomfortFeedbackCount: number;
  highResidualAndSleepFeedbackSameDayCount: number;
  drinkTypeAndDiscomfortSameDayCount: number;
  dataCompleteness: "insufficient" | "partial" | "enough";
  minimumEvidenceMet: boolean;
  evidenceStrength: EvidenceStrength;
  candidates: EvidenceCandidate[];
};

export type CompactEvidenceContext = {
  requestId: string;
  dataVersionHash: string;
  schemaVersion: "ai-explanation-input-v1";
  ruleDecision: RuleDecisionSnapshot;
  historicalEvidence: HistoricalEvidenceSummary;
  evidenceIds: string[];
  allowedFacts: Record<string, string | number>;
  allowedActionSuggestions: RuleDecisionSnapshot["allowedActionSuggestions"];
  constraints: string[];
};

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function recentDateSet(days: number, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return new Set(
    Array.from({ length: days }, (_, index) => {
      const date = new Date(start.getTime() - index * 24 * 36e5);
      return dateKey(date);
    }),
  );
}

function recordDateKey(record: CaffeineDecisionRecord) {
  return dateKey(new Date(record.time));
}

function feedbackHasSleepImpact(feedback: FeedbackMemoryForEvidence) {
  return feedback.sleepQuality === "bad" || feedback.fallAsleepSpeed === "slow";
}

function feedbackHasDiscomfort(feedback: FeedbackMemoryForEvidence) {
  return Boolean(feedback.palpitation || feedback.anxiety || feedback.stomachDiscomfort || feedback.handTremor);
}

function drinkCategoryForEvidence(record?: Partial<CaffeineDecisionRecord> & { category?: string }) {
  return record?.category || record?.type || "drink";
}

function simpleHash(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function evaluateCompleteness(effectiveRecordDays: number, feedbackCount: number) {
  if (effectiveRecordDays >= 7 && feedbackCount >= 3) return "enough" as const;
  if (effectiveRecordDays >= 4) return "partial" as const;
  return "insufficient" as const;
}

function evidenceStrengthFor(summary: {
  effectiveRecordDays: number;
  candidates: EvidenceCandidate[];
  sleepAffectedFeedbackCount: number;
  discomfortFeedbackCount: number;
}) {
  const strongestCount = Math.max(0, ...summary.candidates.map((candidate) => candidate.count));
  if (summary.effectiveRecordDays >= 10 && strongestCount >= 3 && summary.sleepAffectedFeedbackCount + summary.discomfortFeedbackCount >= 3) return "high";
  if (summary.effectiveRecordDays >= 4 && strongestCount >= 2) return "medium";
  return "low";
}

function relationForCandidate(input: {
  decision: RuleDecisionSnapshot["ruleDecision"];
  observationType: ObservationType;
  sleepRisk: RuleDecisionSnapshot["sleepRisk"];
  estimatedSleepResidualMg: number;
  adjustedSleepResidualMg: number;
}): Pick<EvidenceCandidate, "relationToDecision" | "relationSummary"> {
  const isNegativeEvidence =
    input.observationType === "evening_intake_pattern" ||
    input.observationType === "high_residual_pattern" ||
    input.observationType === "sleep_feedback_overlap" ||
    input.observationType === "discomfort_overlap";
  if (input.decision === "full_cup") {
    if (input.observationType === "low_risk_positive_pattern") {
      return {
        relationToDecision: "supports_decision",
        relationSummary: "这条历史观察支持当前低风险、可饮用的判断。",
      };
    }
    if (isNegativeEvidence && input.sleepRisk === "低" && input.estimatedSleepResidualMg <= input.adjustedSleepResidualMg) {
      return {
        relationToDecision: "contrasts_with_decision",
        relationSummary: "这条历史观察属于对照：历史场景残留更高，而本次预计残留低于当前默认参考目标。",
      };
    }
    return {
      relationToDecision: "not_relevant",
      relationSummary: "这条历史观察与当前可饮用判断关系较弱，不建议引用。",
    };
  }
  if (input.decision === "half_cup") {
    if (isNegativeEvidence) {
      return {
        relationToDecision: "supports_decision",
        relationSummary: "这条历史观察支持本次控制份量的建议。",
      };
    }
    return {
      relationToDecision: "not_relevant",
      relationSummary: "这条历史观察与当前半杯建议关系较弱，不建议引用。",
    };
  }
  if (input.decision === "low_caf") {
    if (input.observationType === "discomfort_overlap" || input.observationType === "high_residual_pattern" || input.observationType === "sleep_feedback_overlap") {
      return {
        relationToDecision: "supports_decision",
        relationSummary: "这条历史观察支持本次优先选择低因的建议。",
      };
    }
    if (input.observationType === "evening_intake_pattern") {
      return {
        relationToDecision: "supports_decision",
        relationSummary: "这条历史观察支持本次降低咖啡因负荷的建议。",
      };
    }
    return {
      relationToDecision: "not_relevant",
      relationSummary: "这条历史观察与当前低因建议关系较弱，不建议引用。",
    };
  }
  if (input.decision === "no_more_today" && isNegativeEvidence) {
    return {
      relationToDecision: "supports_decision",
      relationSummary: "这条历史观察支持今天先暂停咖啡因的建议。",
    };
  }
  return {
    relationToDecision: "not_relevant",
    relationSummary: "这条历史观察与当前建议关系较弱，不建议引用。",
  };
}

function orderCandidates(candidates: EvidenceCandidate[]) {
  const rank: Record<EvidenceDecisionRelation, number> = {
    supports_decision: 0,
    contrasts_with_decision: 1,
    not_relevant: 2,
  };
  return candidates
    .filter((candidate) => candidate.relationToDecision !== "not_relevant")
    .sort((a, b) => rank[a.relationToDecision] - rank[b.relationToDecision] || b.count - a.count);
}

export function buildHistoricalEvidenceSummary(input: {
  records: CaffeineDecisionRecord[];
  dailyStatusMemory: DailyStatusForEvidence[];
  feedbackMemory: FeedbackMemoryForEvidence[];
  ruleDecision: RuleDecisionSnapshot;
  currentTime?: string;
}): HistoricalEvidenceSummary {
  const now = input.currentTime ? new Date(input.currentTime) : new Date();
  const recentKeys = recentDateSet(14, now);
  const recentRecords = input.records.filter((record) => recentKeys.has(recordDateKey(record)));
  const recordDays = new Set(recentRecords.map(recordDateKey));
  const dailyStatuses = input.dailyStatusMemory.filter((item) => recentKeys.has(item.date));
  const feedbackItems = input.feedbackMemory.filter((item) => recentKeys.has(item.date));
  const highResidualDates = new Set(dailyStatuses.filter((item) => item.sleepRiskLevel === "高").map((item) => item.date));
  const sleepAffectedDates = new Set(feedbackItems.filter(feedbackHasSleepImpact).map((item) => item.date));
  const discomfortDates = new Set(feedbackItems.filter(feedbackHasDiscomfort).map((item) => item.date));
  const simulatedCategory = drinkCategoryForEvidence(input.ruleDecision.simulatedDrink);
  const categoryRecordDates = new Set(recentRecords.filter((record) => drinkCategoryForEvidence(record) === simulatedCategory).map(recordDateKey));
  const highResidualAndSleepFeedbackSameDayCount = [...highResidualDates].filter((key) => sleepAffectedDates.has(key)).length;
  const drinkTypeAndDiscomfortSameDayCount = [...categoryRecordDates].filter((key) => discomfortDates.has(key)).length;
  const effectiveRecordDays = recordDays.size;
  const eveningIntakeDays = dailyStatuses.filter((item) => item.hasEveningIntake).length;
  const highResidualDays = highResidualDates.size;
  const sleepAffectedFeedbackCount = sleepAffectedDates.size;
  const discomfortFeedbackCount = discomfortDates.size;
  const candidates: EvidenceCandidate[] = [];
  const lowRiskStableDays = dailyStatuses.filter((item) => {
    if (item.recordCount <= 0 || item.sleepRiskLevel !== "低" || item.hasEveningIntake) return false;
    const feedback = feedbackItems.find((entry) => entry.date === item.date);
    return !feedback || (!feedbackHasSleepImpact(feedback) && !feedbackHasDiscomfort(feedback));
  }).length;
  const withRelation = (
    candidate: Omit<EvidenceCandidate, "relationToDecision" | "relationSummary">,
  ): EvidenceCandidate => ({
    ...candidate,
    ...relationForCandidate({
      decision: input.ruleDecision.ruleDecision,
      observationType: candidate.observationType,
      sleepRisk: input.ruleDecision.sleepRisk,
      estimatedSleepResidualMg: input.ruleDecision.estimatedSleepResidualMg,
      adjustedSleepResidualMg: input.ruleDecision.adjustedSleepResidualMg,
    }),
  });
  if (lowRiskStableDays >= 2) {
    candidates.push(
      withRelation({
        evidenceId: "evidence_low_risk_stable_days_14d",
        observationType: "low_risk_positive_pattern",
        count: lowRiskStableDays,
        summary: `最近 14 天有 ${lowRiskStableDays} 天较早或轻量摄入后，睡前残留处于低风险记录。`,
        requiresFeedback: false,
      }),
    );
  }
  if (eveningIntakeDays >= 2) {
    candidates.push(
      withRelation({
        evidenceId: "evidence_evening_intake_days_14d",
        observationType: "evening_intake_pattern",
        count: eveningIntakeDays,
        summary: `最近 14 天有 ${eveningIntakeDays} 天出现晚间摄入。`,
        requiresFeedback: false,
      }),
    );
  }
  if (highResidualDays >= 2) {
    candidates.push(
      withRelation({
        evidenceId: "evidence_high_residual_days_14d",
        observationType: "high_residual_pattern",
        count: highResidualDays,
        summary: `最近 14 天有 ${highResidualDays} 天睡前残留偏高。`,
        requiresFeedback: false,
      }),
    );
  }
  if (sleepAffectedFeedbackCount >= 2 && highResidualAndSleepFeedbackSameDayCount >= 2) {
    candidates.push(
      withRelation({
        evidenceId: "evidence_high_residual_sleep_overlap_14d",
        observationType: "sleep_feedback_overlap",
        count: highResidualAndSleepFeedbackSameDayCount,
        summary: `有 ${highResidualAndSleepFeedbackSameDayCount} 天同时出现高残留和睡眠受影响反馈。`,
        requiresFeedback: true,
      }),
    );
  }
  if (discomfortFeedbackCount >= 2 && drinkTypeAndDiscomfortSameDayCount >= 2) {
    candidates.push(
      withRelation({
        evidenceId: "evidence_drink_type_discomfort_overlap_14d",
        observationType: "discomfort_overlap",
        count: drinkTypeAndDiscomfortSameDayCount,
        summary: `当前饮品类别与即时不适反馈同日出现 ${drinkTypeAndDiscomfortSameDayCount} 次。`,
        requiresFeedback: true,
      }),
    );
  }
  const relevantCandidates = orderCandidates(candidates);
  const dataCompleteness = evaluateCompleteness(effectiveRecordDays, sleepAffectedFeedbackCount + discomfortFeedbackCount);
  const minimumEvidenceMet = effectiveRecordDays >= 4 && relevantCandidates.some((candidate) => candidate.count >= 2);
  const evidenceStrength = evidenceStrengthFor({ effectiveRecordDays, candidates: relevantCandidates, sleepAffectedFeedbackCount, discomfortFeedbackCount });
  return {
    windowDays: 14,
    effectiveRecordDays,
    eveningIntakeDays,
    highResidualDays,
    sleepAffectedFeedbackCount,
    discomfortFeedbackCount,
    highResidualAndSleepFeedbackSameDayCount,
    drinkTypeAndDiscomfortSameDayCount,
    dataCompleteness,
    minimumEvidenceMet,
    evidenceStrength,
    candidates: relevantCandidates,
  };
}

export function buildCompactEvidenceContext(input: {
  requestId?: string;
  records: CaffeineDecisionRecord[];
  dailyStatusMemory: DailyStatusForEvidence[];
  feedbackMemory: FeedbackMemoryForEvidence[];
  ruleDecision: RuleDecisionSnapshot;
  currentTime?: string;
  promptVersion: string;
  modelProvider: string;
  modelVersion: string;
  schemaVersion?: string;
  safetyVersion: string;
}): CompactEvidenceContext {
  const historicalEvidence = buildHistoricalEvidenceSummary(input);
  const allowedFacts: Record<string, string | number> = {
    fact_window_days: historicalEvidence.windowDays,
    fact_decision: input.ruleDecision.ruleDecision,
    fact_action_text: input.ruleDecision.ruleActionText,
    fact_today_total_mg: input.ruleDecision.todayTotalMg,
    fact_current_remaining_mg: input.ruleDecision.currentRemainingMg,
    fact_estimated_sleep_residual_mg: input.ruleDecision.estimatedSleepResidualMg,
    fact_sleep_risk: input.ruleDecision.sleepRisk,
    fact_target_intake_mg: input.ruleDecision.targetIntakeMg,
    fact_recommended_serving_caffeine_mg: input.ruleDecision.recommendedServingCaffeineMg,
    fact_safe_sleep_residual_mg: input.ruleDecision.adjustedSleepResidualMg,
    fact_bed_time: input.ruleDecision.bedTime,
    fact_effective_record_days: historicalEvidence.effectiveRecordDays,
    fact_evening_intake_days: historicalEvidence.eveningIntakeDays,
    fact_high_residual_days: historicalEvidence.highResidualDays,
    fact_sleep_affected_feedback_count: historicalEvidence.sleepAffectedFeedbackCount,
    fact_discomfort_feedback_count: historicalEvidence.discomfortFeedbackCount,
    fact_high_residual_sleep_overlap_count: historicalEvidence.highResidualAndSleepFeedbackSameDayCount,
    fact_drink_type_discomfort_overlap_count: historicalEvidence.drinkTypeAndDiscomfortSameDayCount,
    fact_data_completeness: historicalEvidence.dataCompleteness,
    fact_evidence_strength: historicalEvidence.evidenceStrength,
  };
  if (input.ruleDecision.simulatedDrink) {
    allowedFacts.fact_simulated_drink_category = input.ruleDecision.simulatedDrink.category || "drink";
    allowedFacts.fact_simulated_drink_caffeine_mg = input.ruleDecision.simulatedDrink.caffeineMg;
  }
  const evidenceIds = historicalEvidence.candidates.map((candidate) => candidate.evidenceId);
  const hashPayload = JSON.stringify({
    ruleDecision: input.ruleDecision,
    historicalEvidence,
    promptVersion: input.promptVersion,
    modelProvider: input.modelProvider,
    modelVersion: input.modelVersion,
    schemaVersion: input.schemaVersion || "ai-explanation-output-v1",
    safetyVersion: input.safetyVersion,
  });
  return {
    requestId: input.requestId || `ai-explain-${Date.now()}`,
    dataVersionHash: simpleHash(hashPayload),
    schemaVersion: "ai-explanation-input-v1",
    ruleDecision: input.ruleDecision,
    historicalEvidence,
    evidenceIds,
    allowedFacts,
    allowedActionSuggestions: input.ruleDecision.allowedActionSuggestions,
    constraints: [
      "不得重新计算或改写任何数字。",
      "decision 必须与规则层一致。",
      "actionSuggestion 必须在 allowedActionSuggestions 内。",
      "不得把共现描述为因果。",
      "不得做医学诊断或保证睡眠结果。",
      "数据不足时必须回退规则解释。",
    ],
  };
}
