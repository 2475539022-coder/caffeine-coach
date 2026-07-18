#!/usr/bin/env node

const baseUrl = (process.argv[2] || process.env.TEST_API_BASE_URL || "").replace(/\/+$/, "");

if (!baseUrl) {
  console.error("Usage: node scripts/test-personalized-explanation.mjs <preview-url>");
  console.error("Or set TEST_API_BASE_URL to the Preview URL.");
  process.exit(1);
}

const endpoint = `${baseUrl}/api/personalized-explanation`;
const protectionBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

function requestHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (protectionBypassSecret) {
    headers["x-vercel-protection-bypass"] = protectionBypassSecret;
  }
  return headers;
}

function ruleDecision(overrides = {}) {
  return {
    schemaVersion: "rule-decision-v1",
    generatedAt: "2026-07-17T10:00:00.000Z",
    source: "pre_drink_simulation",
    currentTime: "2026-07-17T10:00:00.000Z",
    bedTime: "23:30",
    halfLifeHours: 5,
    safeSleepResidualMg: 30,
    adjustedSleepResidualMg: 30,
    todayTotalMg: 180,
    currentRemainingMg: 90,
    estimatedSleepResidualMg: 68,
    sleepRisk: "中",
    targetIntakeMg: 230,
    canDrinkMg: 50,
    recommendedServingCaffeineMg: 50,
    ruleDecision: "half_cup",
    ruleActionText: "建议改成半杯或选择低因饮品。",
    allowedActionSuggestions: ["half_cup", "low_caf", "no_more_today"],
    afterTodayTotalMg: 300,
    simulatedDrink: {
      name: "拿铁",
      caffeineMg: 120,
      category: "coffee",
    },
    reasons: ["睡前预计残留高于安心目标。", "今日剩余额度有限。"],
    ...overrides,
  };
}

function validContext() {
  const candidate = {
    evidenceId: "evidence_evening_intake_days_14d",
    observationType: "evening_intake_pattern",
    count: 2,
    summary: "最近 14 天有 2 天出现晚间摄入。",
    requiresFeedback: false,
  };
  return {
    requestId: "smoke-valid",
    dataVersionHash: "smoke-valid-v1",
    schemaVersion: "ai-explanation-input-v1",
    ruleDecision: ruleDecision(),
    historicalEvidence: {
      windowDays: 14,
      effectiveRecordDays: 5,
      eveningIntakeDays: 2,
      highResidualDays: 2,
      sleepAffectedFeedbackCount: 0,
      discomfortFeedbackCount: 0,
      highResidualAndSleepFeedbackSameDayCount: 0,
      drinkTypeAndDiscomfortSameDayCount: 0,
      dataCompleteness: "partial",
      minimumEvidenceMet: true,
      evidenceStrength: "medium",
      candidates: [candidate],
    },
    evidenceIds: [candidate.evidenceId],
    allowedFacts: {
      fact_window_days: 14,
      fact_decision: "half_cup",
      fact_action_text: "建议改成半杯或选择低因饮品。",
      fact_today_total_mg: 180,
      fact_current_remaining_mg: 90,
      fact_estimated_sleep_residual_mg: 68,
      fact_sleep_risk: "中",
      fact_target_intake_mg: 230,
      fact_recommended_serving_caffeine_mg: 50,
      fact_safe_sleep_residual_mg: 30,
      fact_bed_time: "23:30",
      fact_effective_record_days: 5,
      fact_evening_intake_days: 2,
      fact_high_residual_days: 2,
      fact_sleep_affected_feedback_count: 0,
      fact_discomfort_feedback_count: 0,
      fact_high_residual_sleep_overlap_count: 0,
      fact_drink_type_discomfort_overlap_count: 0,
      fact_data_completeness: "partial",
      fact_evidence_strength: "medium",
      fact_simulated_drink_category: "coffee",
      fact_simulated_drink_caffeine_mg: 120,
    },
    allowedActionSuggestions: ["half_cup", "low_caf", "no_more_today"],
    constraints: [
      "不得重新计算或改写任何数字。",
      "decision 必须与规则层一致。",
      "actionSuggestion 必须在 allowedActionSuggestions 内。",
      "不得把共现描述为因果。",
      "不得做医学诊断或保证睡眠结果。",
    ],
  };
}

function insufficientContext() {
  return {
    ...validContext(),
    requestId: "smoke-insufficient",
    dataVersionHash: "smoke-insufficient-v1",
    historicalEvidence: {
      windowDays: 14,
      effectiveRecordDays: 1,
      eveningIntakeDays: 0,
      highResidualDays: 0,
      sleepAffectedFeedbackCount: 0,
      discomfortFeedbackCount: 0,
      highResidualAndSleepFeedbackSameDayCount: 0,
      drinkTypeAndDiscomfortSameDayCount: 0,
      dataCompleteness: "insufficient",
      minimumEvidenceMet: false,
      evidenceStrength: "low",
      candidates: [],
    },
    evidenceIds: [],
  };
}

const cases = [
  { name: "valid", body: { context: validContext() } },
  { name: "insufficient_evidence", body: { context: insufficientContext() } },
  { name: "invalid_context", body: { context: { schemaVersion: "wrong" } } },
];

function summarize(name, status, elapsedMs, payload) {
  const resultType = payload?.success === true ? payload.source || "success" : "error";
  const fallbackType = payload?.fallbackType || "";
  const validationFailureCode = payload?.validationFailureCode || "";
  const validationFailureField = payload?.validationFailureField || "";
  const safetyTriggerCode = payload?.safetyTriggerCode || "";
  const unexpectedNumberTokens = payload?.unexpectedNumberTokens ? JSON.stringify(payload.unexpectedNumberTokens) : "";
  const decision = payload?.data?.decision || "";
  const validation = payload?.success === true && payload?.data?.decision ? "ok" : "not_applicable";
  console.log(
    [
      `case=${name}`,
      `http=${status}`,
      `resultType=${resultType}`,
      `fallbackType=${fallbackType}`,
      `validationFailureCode=${validationFailureCode}`,
      `validationFailureField=${validationFailureField}`,
      `safetyTriggerCode=${safetyTriggerCode}`,
      `unexpectedNumberTokens=${unexpectedNumberTokens}`,
      `decision=${decision}`,
      `validation=${validation}`,
      `elapsedMs=${elapsedMs}`,
    ].join(" "),
  );
}

for (const item of cases) {
  const startedAt = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify(item.body),
    });
    const elapsedMs = Date.now() - startedAt;
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = { success: false, fallbackType: "non_json_response" };
    }
    summarize(item.name, response.status, elapsedMs, payload);
  } catch {
    summarize(item.name, "network_error", Date.now() - startedAt, { success: false, fallbackType: "request_failed" });
  }
}
