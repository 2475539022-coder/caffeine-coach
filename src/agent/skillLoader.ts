import { buildSkillContext, type BuildSkillContextInput, type SkillContextMap } from "./contextBuilder";
import { routeSkill, type SkillRouteResult } from "./intentRouter";
import { getSkillDefinition, type SkillDefinition, type SkillId } from "./skillRegistry";

export type SkillExecutionPlan<T extends SkillId = SkillId> = {
  skillId: T;
  skill: SkillDefinition;
  route: SkillRouteResult;
  context: SkillContextMap[T];
  ready: boolean;
  notes: string[];
};

export type UnknownSkillExecutionPlan = {
  skillId: "unknown";
  route: SkillRouteResult;
  ready: false;
  notes: string[];
};

export function createSkillExecutionPlan(
  userMessage: string,
  input: BuildSkillContextInput = {},
): SkillExecutionPlan | UnknownSkillExecutionPlan {
  const route = routeSkill(userMessage);
  if (route.skillId === "unknown") {
    return {
      skillId: "unknown",
      route,
      ready: false,
      notes: ["未命中可用 Skill，可进入 fallback 或追问。"],
    };
  }

  const contextInput = {
    ...input,
    userText: input.userText ?? userMessage,
  };

  return {
    skillId: route.skillId,
    skill: getSkillDefinition(route.skillId),
    route,
    context: buildSkillContext(route.skillId, contextInput),
    ready: true,
    notes: ["已选择 Skill，并构建 compact context。当前版本不执行 Markdown Skill，也不接入真实 LLM。"],
  };
}

export const demoSkillRouterCases = [
  "今晚还能喝咖啡吗？",
  "我刚喝了一杯拿铁",
  "帮我总结这周咖啡因摄入",
  "晚上不喝咖啡可以喝什么？",
  "你好",
];
