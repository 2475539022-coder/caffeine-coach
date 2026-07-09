import {
  getUserProfile,
  TOOL_HANDLERS,
} from "./toolHandlers";
import type { AgentTool, AgentToolDefinition, AgentToolName } from "./types";

function handlerFor(name: AgentToolName) {
  return (input: unknown) => TOOL_HANDLERS[name](input);
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "getTodayIntakeRecords",
    description: "读取某一天的咖啡因摄入记录，并返回当天总摄入量。读取不到记录时返回空数组。",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "可选，ISO 日期或时间字符串。不传则使用今天。" },
      },
      additionalProperties: false,
    },
    handler: handlerFor("getTodayIntakeRecords"),
  },
  {
    name: "getUserProfile",
    description: "读取用户作息、管理目标、咖啡因习惯、主观反馈和当前目标摄入量。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: () => getUserProfile(),
  },
  {
    name: "searchDrinkLibrary",
    description: "根据饮品名称搜索饮品库，返回候选饮品、咖啡因含量、杯型规格和匹配原因。",
    inputSchema: {
      type: "object",
      properties: {
        drinkName: { type: "string", description: "用户输入的饮品名称、品牌或 OCR 文本。" },
      },
      required: ["drinkName"],
      additionalProperties: false,
    },
    handler: handlerFor("searchDrinkLibrary"),
  },
  {
    name: "calculateCurrentCaffeineStatus",
    description: "根据摄入记录、用户画像和当前时间计算当前体内残留、睡前预计残留和睡眠风险。",
    inputSchema: {
      type: "object",
      properties: {
        records: { type: "array", description: "可选，摄入记录列表。不传则读取本地记录。" },
        profile: { type: "object", description: "可选，用户画像。不传则读取本地设置和反馈。" },
        currentTime: { type: "string", description: "可选，ISO 时间。不传则使用当前时间。" },
      },
      additionalProperties: false,
    },
    handler: handlerFor("calculateCurrentCaffeineStatus"),
  },
  {
    name: "simulateDrinkBeforeAdding",
    description: "模拟现在喝下一杯饮品后的今日累计量、睡前残留、睡眠风险和饮用建议。",
    inputSchema: {
      type: "object",
      properties: {
        drink: {
          type: "object",
          description: "准备饮用的饮品，至少包含 displayName/name 和 caffeineMg。",
        },
        time: { type: "string", description: "可选，计划饮用时间。不传则使用当前时间。" },
        profile: { type: "object", description: "可选，用户画像。不传则读取本地设置和反馈。" },
      },
      required: ["drink"],
      additionalProperties: false,
    },
    handler: handlerFor("simulateDrinkBeforeAdding"),
  },
  {
    name: "generateRecommendationSummary",
    description: "基于今日记录、用户画像和计算结果生成今日推荐摘要、风险原因和行动建议。",
    inputSchema: {
      type: "object",
      properties: {
        records: { type: "array", description: "可选，摄入记录列表。不传则读取本地记录。" },
        profile: { type: "object", description: "可选，用户画像。不传则读取本地设置和反馈。" },
        calculation: { type: "object", description: "可选，咖啡因状态计算结果。" },
      },
      additionalProperties: false,
    },
    handler: handlerFor("generateRecommendationSummary"),
  },
];

export const TOOL_DEFINITIONS: AgentToolDefinition[] = AGENT_TOOLS.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema,
}));
