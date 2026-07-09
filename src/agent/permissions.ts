import type { AgentToolName } from "./types";

export type PermissionLevel = "allow" | "ask" | "deny" | "strong_confirm";

export type PermissionToolName =
  | AgentToolName
  | "deleteIntakeRecord"
  | "updateUserProfile"
  | "enableReminder"
  | "confirmFuzzyDrinkMatch"
  | "deleteAllRecords"
  | "resetAllData";

export type PermissionDecision = {
  toolName: PermissionToolName;
  level: PermissionLevel;
  allowed: boolean;
  requiresConfirmation: boolean;
  message: string;
  input?: unknown;
};

const allowTools = new Set<PermissionToolName>([
  "getTodayIntakeRecords",
  "getUserProfile",
  "searchDrinkLibrary",
  "calculateCurrentCaffeineStatus",
  "simulateDrinkBeforeAdding",
  "generateRecommendationSummary",
]);

const askTools = new Set<PermissionToolName>([
  "deleteIntakeRecord",
  "updateUserProfile",
  "enableReminder",
  "confirmFuzzyDrinkMatch",
]);

const strongConfirmTools = new Set<PermissionToolName>([
  "deleteAllRecords",
  "resetAllData",
]);

export function permissionGuard(toolName: PermissionToolName, input?: unknown): PermissionDecision {
  if (allowTools.has(toolName)) {
    return {
      toolName,
      level: "allow",
      allowed: true,
      requiresConfirmation: false,
      message: "该操作只读取或计算信息，可以自动执行。",
      input,
    };
  }

  if (askTools.has(toolName)) {
    return {
      toolName,
      level: "ask",
      allowed: false,
      requiresConfirmation: true,
      message: "该操作会修改你的数据，需要确认后执行。",
      input,
    };
  }

  if (strongConfirmTools.has(toolName)) {
    return {
      toolName,
      level: "strong_confirm",
      allowed: false,
      requiresConfirmation: true,
      message: "该操作风险较高，当前版本不会自动执行。",
      input,
    };
  }

  return {
    toolName,
    level: "ask",
    allowed: false,
    requiresConfirmation: true,
    message: "未知操作需要先确认。",
    input,
  };
}
