import type {
  AgentIntent,
  AgentLoopResponse,
  AgentToolResult,
  CaffeineStatusOutput,
  RecommendationSummaryOutput,
  SearchDrinkOutput,
  SimulateDrinkOutput,
  TodayIntakeOutput,
  ToolTrace,
} from "./types";

type ResponseDraft = Omit<AgentLoopResponse, "answer" | "usedTools" | "intent"> & {
  answer?: string;
};

function composeAnswer(draft: ResponseDraft) {
  const sections = [
    draft.conclusion,
    draft.reasons.length ? `原因：${draft.reasons.join("；")}` : "",
    draft.dataEvidence.length ? `依据：${draft.dataEvidence.join("；")}` : "",
    draft.suggestions.length ? `建议：${draft.suggestions.join("；")}` : "",
    draft.followUpQuestion,
  ].filter(Boolean);
  return sections.join("\n");
}

export function outputSummary(result: AgentToolResult) {
  if (!result.success) return result.error || result.message || "工具调用失败";
  if (!result.data) return "调用成功";
  const data = result.data as Record<string, unknown>;
  if ("matchStatus" in data) {
    return `匹配状态：${data.matchStatus}，候选数：${Array.isArray(data.candidates) ? data.candidates.length : 0}`;
  }
  if ("totalMg" in data) return `今日总摄入：${data.totalMg}mg`;
  if ("currentRemainingMg" in data) return `当前残留：${data.currentRemainingMg}mg，睡前残留：${data.sleepRemainingMg}mg`;
  if ("summary" in data) return String(data.summary);
  if ("decision" in data) return String(data.decision);
  if ("targetIntakeMg" in data) return `目标摄入：${data.targetIntakeMg}mg`;
  return "调用成功";
}

export function fallbackResponse(intent: AgentIntent, usedTools: ToolTrace[], followUpQuestion = "你想问的是今天还能不能喝、记录一杯，还是模拟某个饮品？"): AgentLoopResponse {
  const draft: ResponseDraft = {
    conclusion: "我还需要再确认一下你的意思。",
    reasons: ["当前问题没有足够明确地指向记录、模拟或今日建议。"],
    dataEvidence: [],
    suggestions: ["可以换成更具体的问题，比如“今晚还能喝咖啡吗？”或“如果现在喝一杯拿铁会怎样？”"],
    needFollowUp: true,
    followUpQuestion,
    isFallback: true,
  };
  return { ...draft, answer: composeAnswer(draft), usedTools, intent };
}

export function severeSymptomResponse(intent: AgentIntent, usedTools: ToolTrace[]): AgentLoopResponse {
  const draft: ResponseDraft = {
    conclusion: "先不要继续摄入咖啡因。",
    reasons: ["你提到了比较明显的不适表现，这类情况不适合继续用咖啡因硬撑。"],
    dataEvidence: [],
    suggestions: ["建议先停止咖啡因摄入并休息补水", "如果胸痛、严重心悸或呼吸困难持续，请尽快咨询专业人士"],
    needFollowUp: false,
    isFallback: false,
  };
  return { ...draft, answer: composeAnswer(draft), usedTools, intent };
}

export function buildCanIDrinkResponse(args: {
  intake?: TodayIntakeOutput;
  status?: CaffeineStatusOutput;
  recommendation?: RecommendationSummaryOutput;
  usedTools: ToolTrace[];
  intent: AgentIntent;
}) {
  const { intake, status, recommendation, usedTools, intent } = args;
  const conclusion = recommendation?.summary || "可以先谨慎判断，暂时不建议贸然加一整杯。";
  const draft: ResponseDraft = {
    conclusion,
    reasons: recommendation?.riskReasons.length ? recommendation.riskReasons : ["我结合了今天摄入、睡前残留和你的设置做了估算。"],
    dataEvidence: [
      intake ? `今天已记录 ${intake.records.length} 杯，共 ${intake.totalMg}mg` : "",
      status ? `当前预计残留 ${status.currentRemainingMg}mg` : "",
      status ? `睡前预计残留 ${status.sleepRemainingMg}mg，睡眠风险${status.sleepRisk}` : "",
      recommendation ? `今日建议量约 ${recommendation.recommendedMg}mg，还可摄入约 ${recommendation.canDrinkMg}mg` : "",
    ].filter(Boolean),
    suggestions: [recommendation?.actionAdvice || "如果确实想喝，建议选择半杯、小杯或低因饮品。"],
    needFollowUp: false,
    isFallback: false,
  };
  return { ...draft, answer: composeAnswer(draft), usedTools, intent };
}

export function buildTodaySummaryResponse(intake: TodayIntakeOutput | undefined, usedTools: ToolTrace[], intent: AgentIntent) {
  const records = intake?.records ?? [];
  const names = records.slice(0, 3).map((record) => `${record.name} ${record.mg}mg`);
  const draft: ResponseDraft = {
    conclusion: `今天已记录咖啡因约 ${intake?.totalMg ?? 0}mg。`,
    reasons: records.length ? [`目前有 ${records.length} 条摄入记录。`] : ["今天还没有记录到咖啡因摄入。"],
    dataEvidence: names.length ? names : ["暂无饮品记录"],
    suggestions: records.length ? ["如果还有漏记的饮品，可以继续补充记录。"] : ["记录第一杯后，我可以帮你估算睡前残留。"],
    needFollowUp: false,
    isFallback: false,
  };
  return { ...draft, answer: composeAnswer(draft), usedTools, intent };
}

export function buildRecordDrinkResponse(search: SearchDrinkOutput | undefined, usedTools: ToolTrace[], intent: AgentIntent) {
  if (!search || search.matchStatus === "no_match") {
    const draft: ResponseDraft = {
      conclusion: "我暂时没有找到这个饮品的可信咖啡因数据。",
      reasons: ["饮品库里没有可靠命中，不能直接编造咖啡因含量。"],
      dataEvidence: [search?.message || "暂无可信候选"],
      suggestions: ["可以手动输入咖啡因 mg", "或者换一个更具体的品牌/饮品名再试"],
      needFollowUp: true,
      followUpQuestion: "你知道这杯大概多少 mg 咖啡因吗？或者要不要提供品牌和杯型？",
      isFallback: false,
    };
    return { ...draft, answer: composeAnswer(draft), usedTools, intent };
  }

  const top = search.candidates[0];
  const draft: ResponseDraft = {
    conclusion: search.matchStatus === "exact_match" ? "我找到了一个可信饮品候选，可以等你确认后记录。" : "我找到了相近饮品，需要你先确认。",
    reasons: [search.matchStatus === "exact_match" ? "饮品名称或关键词命中较明确。" : "这是模糊匹配，品牌或杯型可能需要核对。"],
    dataEvidence: [`候选：${top.drink.displayName}，约 ${top.drink.caffeineMg}mg`, `匹配原因：${top.reason}`],
    suggestions: ["暂时不会自动写入记录", "确认后可以把这杯加入今日摄入"],
    needFollowUp: true,
    followUpQuestion: `要按“${top.drink.displayName}（约 ${top.drink.caffeineMg}mg）”记录吗？`,
    isFallback: false,
  };
  return { ...draft, answer: composeAnswer(draft), usedTools, intent };
}

export function buildSimulateDrinkResponse(args: {
  search?: SearchDrinkOutput;
  simulation?: SimulateDrinkOutput;
  usedTools: ToolTrace[];
  intent: AgentIntent;
}) {
  const { search, simulation, usedTools, intent } = args;
  if (!search || search.matchStatus === "no_match") {
    const draft: ResponseDraft = {
      conclusion: "我暂时无法可靠模拟这杯饮品。",
      reasons: ["饮品库里没有可信咖啡因数据，所以不继续估算。"],
      dataEvidence: [search?.message || "暂无可信候选"],
      suggestions: ["可以换一个更具体的饮品名", "或者先手动输入咖啡因含量再模拟"],
      needFollowUp: true,
      followUpQuestion: "你能补充品牌、杯型，或这杯大概多少 mg 咖啡因吗？",
      isFallback: false,
    };
    return { ...draft, answer: composeAnswer(draft), usedTools, intent };
  }

  if (search.matchStatus === "fuzzy_match" || !simulation) {
    const top = search.candidates[0];
    const draft: ResponseDraft = {
      conclusion: "我找到了相近饮品，但建议先确认后再模拟。",
      reasons: ["当前是模糊匹配，直接模拟可能会误判咖啡因含量。"],
      dataEvidence: [`候选：${top.drink.displayName}，约 ${top.drink.caffeineMg}mg`, `匹配原因：${top.reason}`],
      suggestions: ["确认品牌和杯型后再继续模拟"],
      needFollowUp: true,
      followUpQuestion: `你说的是“${top.drink.displayName}”吗？`,
      isFallback: false,
    };
    return { ...draft, answer: composeAnswer(draft), usedTools, intent };
  }

  const draft: ResponseDraft = {
    conclusion: simulation.decision,
    reasons: [simulation.advice, ...simulation.reasons],
    dataEvidence: [
      `${simulation.drinkName} 约 ${simulation.caffeineMg}mg`,
      `喝完后今天累计约 ${simulation.afterTodayTotalMg}mg`,
      `睡前预计残留约 ${simulation.sleepRemainingMg}mg，风险${simulation.sleepRisk}`,
    ],
    suggestions: simulation.decision === "可以饮用" ? ["慢慢喝，并留意身体反馈。"] : ["建议改成半杯、小杯或低因", "今晚优先保护睡眠"],
    needFollowUp: false,
    isFallback: false,
  };
  return { ...draft, answer: composeAnswer(draft), usedTools, intent };
}

export function buildExplainRiskResponse(args: {
  status?: CaffeineStatusOutput;
  recommendation?: RecommendationSummaryOutput;
  usedTools: ToolTrace[];
  intent: AgentIntent;
}) {
  const { status, recommendation, usedTools, intent } = args;
  const draft: ResponseDraft = {
    conclusion: "风险判断主要来自今日摄入量、睡前预计残留和你的个人设置。",
    reasons: recommendation?.riskReasons.length
      ? recommendation.riskReasons
      : ["咖啡因会逐步代谢，距离睡觉越近，残留越可能影响入睡。"],
    dataEvidence: [
      status ? `当前残留约 ${status.currentRemainingMg}mg` : "",
      status ? `睡前预计残留约 ${status.sleepRemainingMg}mg` : "",
      status ? `睡前更安心目标约 ${status.safeSleepResidualMg}mg` : "",
      recommendation ? `今日建议量约 ${recommendation.recommendedMg}mg` : "",
    ].filter(Boolean),
    suggestions: [recommendation?.actionAdvice || "如果风险偏高，今晚建议选择无咖啡因饮品。"],
    needFollowUp: false,
    isFallback: false,
  };
  return { ...draft, answer: composeAnswer(draft), usedTools, intent };
}
