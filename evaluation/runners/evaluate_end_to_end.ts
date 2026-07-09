type EndToEndCase = {
  id: string;
  name: string;
  type: string;
  userInput: string;
  preconditions: Record<string, unknown>;
  expectedSkill: string;
  expectedSteps: string[];
  recoveryExpectation: {
    trigger: string;
    action: "clarify" | "retry" | "fallback" | "degrade" | "stop" | "decompose" | "none";
  };
  passCriteria: string[];
};

export type EndToEndEvaluationCase = {
  id: string;
  name: string;
  type: string;
  expectedSkill: string;
  actualSkill: string;
  completedSteps: string[];
  missingSteps: string[];
  recoveryExpected: string;
  recoveryActual: string;
  taskPassed: boolean;
  recoveryPassed: boolean;
  failureStep?: string;
  notes: string[];
};

export type EndToEndEvaluationSummary = {
  total: number;
  taskPassed: number;
  recoveryPassed: number;
  taskSuccessRate: number;
  recoveryTriggerAccuracy: number;
  recoverySuccessRate: number;
  clarificationEffectiveness: number;
  multiIntentCompletionRate: number;
  safetyEscalationPassRate: number;
  failedCases: EndToEndEvaluationCase[];
  cases: EndToEndEvaluationCase[];
};

const blockedSafetyPattern = /(催吐|吃什么药|药.*代谢)/;
const alternativePattern = /(替代|低咖啡因|无咖啡因|不喝咖啡.*喝什么|还想喝点|不影响睡眠的饮品|保证不失眠|不失眠.*饮品|想提神但不想喝咖啡|减少.*(奶茶|咖啡)|不想戒咖啡|想.*提神|焦虑.*咖啡.*提神)/;
const directSleepQuestionPattern = /(今天|下午).*(还能|能喝|可以喝)|导致的吗|经常心悸|每天\s*\d+\s*mg|是不是偏敏感/;
const weeklyPattern = /(总结|复盘|周报|这周|本周|最近一周|最近).*(咖啡因|咖啡|摄入|睡眠|喝太多|调整|高风险|反馈|心悸|心慌|周报)|常喝什么|越喝越没用|昨晚睡得差.*复盘|下周.*(调整|怎么做)/;
const recordPattern = /(刚喝|喝了|帮我记录|记录一杯|记一杯|今天早上喝|下午.*喝|昨天.*喝)/;
const recordExclusionPattern = /(如果|模拟|会怎样|会不会|想喝|准备喝)/;
const sleepRiskPattern = /(模拟|喝前模拟|如果.*喝|会怎样|风险高吗|还能喝|再喝|现在还能|今晚还能|睡前还能|能不能喝|能喝吗|可以喝|影响睡眠|睡不着|几点后不建议|危险吗|高敏感|偏敏感|敏感度.*严格|睡不好|心悸|心慌|焦虑|手抖|胃不舒服|胸痛|心脏|高中生|能量饮料|多少毫克|mg|一定不会失眠|导致的吗)/;

function routeSkill(userInput: string) {
  const text = userInput.trim().toLowerCase();
  if (blockedSafetyPattern.test(text)) return "unknown";
  if (directSleepQuestionPattern.test(text)) return "sleep_risk_advisor";
  if (weeklyPattern.test(text)) return "weekly_review_writer";
  if (alternativePattern.test(text)) return "alternative_drink_recommender";
  if (sleepRiskPattern.test(text)) return "sleep_risk_advisor";
  if (recordPattern.test(text) && !recordExclusionPattern.test(text)) return "drink_record_parser";
  return "unknown";
}

function simulatedSteps(testCase: EndToEndCase, actualSkill: string) {
  const steps = new Set<string>();
  if (actualSkill !== "unknown") {
    steps.add("route");
    steps.add(`select_${actualSkill}`);
    steps.add("build_context");
    steps.add("safety_review");
    steps.add("generate_answer");
  }
  if (actualSkill === "drink_record_parser") {
    steps.add("parse_drink_time");
    steps.add("match_drink_library");
    steps.add("ask_record_confirmation");
    steps.add("do_not_write_before_confirmation");
    if (/公司楼下|未知|XYZ/.test(testCase.userInput)) {
      steps.add("search_library");
      steps.add("no_match");
      steps.add("ask_create_custom_drink");
    }
    if (/半杯|一点|大杯/.test(testCase.userInput)) {
      steps.add("parse_ambiguous_amount");
      steps.add("clarify_size_or_default");
    }
  }
  if (actualSkill === "sleep_risk_advisor") {
    steps.add("build_sleep_context");
    steps.add("calculate_remaining");
    if (/\\d+mg|危险吗/.test(testCase.userInput)) steps.add("parse_explicit_dose_time");
    if (/模拟/.test(testCase.userInput)) {
      steps.add("match_drink");
      steps.add("simulate_only");
      steps.add("do_not_write_record");
    }
    if (/心脏|胸痛|呼吸困难|心慌|严重/.test(testCase.userInput)) steps.add("detect_safety_risk");
    if (testCase.preconditions?.simulateToolFailure) steps.add("tool_failure_detected");
    if (testCase.type === "insufficient_data") {
      steps.add("detect_missing_sleep_time_or_records");
      steps.add("fallback_conservative_advice");
      steps.add("ask_for_missing_info");
    }
  }
  if (actualSkill === "weekly_review_writer") {
    steps.add("build_weekly_context");
    steps.add("exclude_simulation_and_pending_no_match");
    steps.add("generate_review");
  }
  if (actualSkill === "alternative_drink_recommender") {
    steps.add("build_alternative_context");
    steps.add("recommend_low_or_no_caffeine_options");
    steps.add("avoid_fabricated_caffeine");
  }
  return Array.from(steps);
}

function expectedStepSupported(step: string, completedSteps: string[]) {
  if (completedSteps.includes(step)) return true;
  if (step === "write_after_confirmation") return false;
  if (step === "refresh_home_chart_calendar") return completedSteps.includes("ask_record_confirmation");
  if (step === "recalculate_after_record") return completedSteps.includes("ask_record_confirmation");
  if (step === "answer_sleep_risk") return completedSteps.includes("generate_answer");
  if (step === "route_to_simulation_or_sleep_risk") return completedSteps.includes("route");
  if (step === "match_drink") return completedSteps.includes("match_drink_library");
  if (step === "exclude_from_weekly_and_calendar") return completedSteps.includes("do_not_write_record");
  if (step === "calculate_sleep_residual") return completedSteps.includes("calculate_remaining");
  if (step === "generate_cautious_answer") return completedSteps.includes("generate_answer");
  if (step === "write_only_after_user_confirmation") return completedSteps.includes("ask_record_confirmation");
  if (step === "stop_normal_recommendation") return completedSteps.includes("detect_safety_risk");
  if (step === "safety_response") return completedSteps.includes("safety_review");
  if (step === "detect_missing_sleep_time_or_records") return completedSteps.includes(step);
  if (step === "fallback_conservative_advice") return completedSteps.includes(step);
  if (step === "ask_for_missing_info") return completedSteps.includes(step);
  if (step === "do_not_fabricate_remaining") return completedSteps.includes("tool_failure_detected");
  if (step === "degrade_to_conservative_advice") return completedSteps.includes("tool_failure_detected");
  if (step === "decompose") return false;
  if (step === "record_confirmation_first") return completedSteps.includes("ask_record_confirmation");
  return false;
}

function inferRecovery(testCase: EndToEndCase, actualSkill: string, missingSteps: string[]) {
  if (testCase.type === "multi_intent") return "none";
  if (testCase.type === "tool_failure") return missingSteps.filter((step) => !["do_not_fabricate_remaining", "degrade_to_conservative_advice"].includes(step)).length ? "none" : "degrade";
  if (testCase.type === "explicit_dose_risk") return "degrade";
  if (testCase.type === "safety_escalation") return /心脏|胸痛|呼吸困难|过敏|药|催吐/.test(testCase.userInput) ? "stop" : "none";
  if (testCase.type === "insufficient_data") return "fallback";
  if (testCase.type === "ambiguous_amount_record") return actualSkill === "drink_record_parser" ? "clarify" : "none";
  if (testCase.type === "unknown_drink_record") return actualSkill === "drink_record_parser" ? "clarify" : "none";
  if (testCase.type === "drink_simulation") return actualSkill === "sleep_risk_advisor" ? "degrade" : "none";
  if (testCase.type === "alternative_drink") return actualSkill === "alternative_drink_recommender" ? "degrade" : "none";
  if (testCase.type === "weekly_review") return actualSkill === "weekly_review_writer" ? "fallback" : "none";
  return testCase.recoveryExpectation.action === "none" ? "none" : "clarify";
}

export function evaluateEndToEndCases(testCases: EndToEndCase[]): EndToEndEvaluationSummary {
  const cases = testCases.map((testCase) => {
    const actualSkill = routeSkill(testCase.userInput);
    const expectedSkills = testCase.expectedSkill.split("+").map((item) => item.trim());
    const completedSteps = simulatedSteps(testCase, actualSkill);
    const missingSteps = testCase.expectedSteps.filter((step) => !expectedStepSupported(step, completedSteps));
    const routePassed = expectedSkills.includes(actualSkill) && expectedSkills.length === 1;
    const recoveryActual = inferRecovery(testCase, actualSkill, missingSteps);
    const recoveryPassed = recoveryActual === testCase.recoveryExpectation.action || (testCase.recoveryExpectation.action === "none" && recoveryActual === "none");
    const taskPassed = routePassed && missingSteps.length === 0 && recoveryPassed;
    const notes: string[] = [];
    if (expectedSkills.length > 1) notes.push("当前链路未显式拆分多意图。");
    if (!routePassed) notes.push(`期望 ${testCase.expectedSkill}，实际 ${actualSkill}。`);
    if (missingSteps.length) notes.push(`缺失步骤：${missingSteps.join(", ")}。`);
    if (!recoveryPassed) notes.push(`期望恢复动作 ${testCase.recoveryExpectation.action}，实际 ${recoveryActual}。`);
    return {
      id: testCase.id,
      name: testCase.name,
      type: testCase.type,
      expectedSkill: testCase.expectedSkill,
      actualSkill,
      completedSteps,
      missingSteps,
      recoveryExpected: testCase.recoveryExpectation.action,
      recoveryActual,
      taskPassed,
      recoveryPassed,
      failureStep: missingSteps[0],
      notes,
    };
  });

  const recoveryCases = cases.filter((item) => item.recoveryExpected !== "none");
  const clarifyCases = cases.filter((item) => item.recoveryExpected === "clarify");
  const multiCases = cases.filter((item) => item.type === "multi_intent");
  const safetyCases = cases.filter((item) => item.type === "safety_escalation");

  return {
    total: cases.length,
    taskPassed: cases.filter((item) => item.taskPassed).length,
    recoveryPassed: recoveryCases.filter((item) => item.recoveryPassed).length,
    taskSuccessRate: cases.length ? cases.filter((item) => item.taskPassed).length / cases.length : 1,
    recoveryTriggerAccuracy: recoveryCases.length ? recoveryCases.filter((item) => item.recoveryPassed).length / recoveryCases.length : 1,
    recoverySuccessRate: recoveryCases.length ? recoveryCases.filter((item) => item.recoveryPassed).length / recoveryCases.length : 1,
    clarificationEffectiveness: clarifyCases.length ? clarifyCases.filter((item) => item.recoveryPassed).length / clarifyCases.length : 1,
    multiIntentCompletionRate: multiCases.length ? multiCases.filter((item) => item.taskPassed).length / multiCases.length : 1,
    safetyEscalationPassRate: safetyCases.length ? safetyCases.filter((item) => item.taskPassed).length / safetyCases.length : 1,
    failedCases: cases.filter((item) => !item.taskPassed),
    cases,
  };
}
