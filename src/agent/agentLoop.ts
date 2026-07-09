import { routeIntent, extractDrinkName, hasSevereSymptom } from "./intentRouter";
import {
  buildCanIDrinkResponse,
  buildExplainRiskResponse,
  buildRecordDrinkResponse,
  buildSimulateDrinkResponse,
  buildTodaySummaryResponse,
  fallbackResponse,
  outputSummary,
  severeSymptomResponse,
} from "./responseGenerator";
import { TOOL_HANDLERS } from "./toolHandlers";
import type {
  AgentIntent,
  AgentLoopContext,
  AgentLoopResponse,
  AgentToolName,
  AgentToolResult,
  CaffeineStatusOutput,
  RecommendationSummaryOutput,
  SearchDrinkOutput,
  SimulateDrinkOutput,
  TodayIntakeOutput,
  ToolTrace,
} from "./types";

type ToolState = {
  intake?: TodayIntakeOutput;
  search?: SearchDrinkOutput;
  status?: CaffeineStatusOutput;
  recommendation?: RecommendationSummaryOutput;
  simulation?: SimulateDrinkOutput;
};

function hasToolBudget(usedTools: ToolTrace[], maxToolCalls: number) {
  return usedTools.length < maxToolCalls;
}

async function callTool(
  toolName: AgentToolName,
  input: unknown,
  usedTools: ToolTrace[],
  maxToolCalls: number,
): Promise<AgentToolResult | null> {
  if (!hasToolBudget(usedTools, maxToolCalls)) return null;
  try {
    const output = await TOOL_HANDLERS[toolName](input);
    usedTools.push({
      toolName,
      input,
      outputSummary: outputSummary(output),
      status: output.success ? "success" : "failed",
    });
    return output;
  } catch (error) {
    usedTools.push({
      toolName,
      input,
      outputSummary: "工具调用失败",
      status: "failed",
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "工具调用失败",
    };
  }
}

function maxToolFallback(intent: AgentIntent, usedTools: ToolTrace[]): AgentLoopResponse {
  return fallbackResponse(intent, usedTools, "我已经达到本轮最多工具调用次数。你可以换个更具体的问题，我再继续帮你判断。");
}

export async function agentLoop(userMessage: string, context: AgentLoopContext = {}): Promise<AgentLoopResponse> {
  const intent = routeIntent(userMessage);
  const usedTools: ToolTrace[] = [];
  const maxToolCalls = context.maxToolCalls ?? 5;

  if (hasSevereSymptom(userMessage)) {
    return severeSymptomResponse(intent, usedTools);
  }

  if (intent === "unknown") {
    return fallbackResponse(intent, usedTools);
  }

  const state: ToolState = {};
  const date = context.date || context.currentTime;
  const currentTime = context.currentTime;

  if (intent === "can_i_drink" || intent === "explain_risk") {
    const intake = await callTool("getTodayIntakeRecords", { date }, usedTools, maxToolCalls);
    if (intake?.success) state.intake = intake.data as TodayIntakeOutput;

    const profile = await callTool("getUserProfile", {}, usedTools, maxToolCalls);
    if (!profile) return maxToolFallback(intent, usedTools);

    const status = await callTool("calculateCurrentCaffeineStatus", { currentTime }, usedTools, maxToolCalls);
    if (status?.success) state.status = status.data as CaffeineStatusOutput;

    const recommendation = await callTool(
      "generateRecommendationSummary",
      {
        calculation: state.status,
      },
      usedTools,
      maxToolCalls,
    );
    if (recommendation?.success) state.recommendation = recommendation.data as RecommendationSummaryOutput;

    if (intent === "explain_risk") {
      return buildExplainRiskResponse({ status: state.status, recommendation: state.recommendation, usedTools, intent });
    }
    return buildCanIDrinkResponse({ intake: state.intake, status: state.status, recommendation: state.recommendation, usedTools, intent });
  }

  if (intent === "today_summary") {
    const intake = await callTool("getTodayIntakeRecords", { date }, usedTools, maxToolCalls);
    if (intake?.success) state.intake = intake.data as TodayIntakeOutput;
    return buildTodaySummaryResponse(state.intake, usedTools, intent);
  }

  if (intent === "record_drink") {
    const drinkName = extractDrinkName(userMessage);
    if (!drinkName) {
      return fallbackResponse(intent, usedTools, "你刚喝的是什么饮品？可以告诉我品牌和饮品名。");
    }
    const search = await callTool("searchDrinkLibrary", { drinkName }, usedTools, maxToolCalls);
    if (search?.success) state.search = search.data as SearchDrinkOutput;
    return buildRecordDrinkResponse(state.search, usedTools, intent);
  }

  if (intent === "simulate_drink") {
    const drinkName = extractDrinkName(userMessage);
    if (!drinkName) {
      return fallbackResponse(intent, usedTools, "你想模拟哪一种饮品？比如拿铁、美式或奶茶。");
    }

    const search = await callTool("searchDrinkLibrary", { drinkName }, usedTools, maxToolCalls);
    if (search?.success) state.search = search.data as SearchDrinkOutput;
    if (!state.search || state.search.matchStatus === "no_match" || state.search.matchStatus === "fuzzy_match") {
      return buildSimulateDrinkResponse({ search: state.search, usedTools, intent });
    }

    const profile = await callTool("getUserProfile", {}, usedTools, maxToolCalls);
    if (!profile) return maxToolFallback(intent, usedTools);

    const topDrink = state.search.candidates[0]?.drink;
    const simulation = await callTool(
      "simulateDrinkBeforeAdding",
      {
        drink: topDrink,
        time: currentTime,
      },
      usedTools,
      maxToolCalls,
    );
    if (simulation?.success) state.simulation = simulation.data as SimulateDrinkOutput;
    return buildSimulateDrinkResponse({ search: state.search, simulation: state.simulation, usedTools, intent });
  }

  return fallbackResponse(intent, usedTools);
}

export const demoAgentLoopCases = [
  "今晚还能喝咖啡吗？",
  "我今天喝了多少咖啡因？",
  "我刚喝了一杯拿铁",
  "我刚喝了一杯 XYZ987",
  "如果我现在喝一杯拿铁会怎样？",
  "为什么不建议我喝？",
  "随便问一个无法判断的问题",
];
