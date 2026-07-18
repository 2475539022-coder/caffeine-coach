import {
  ruleFallbackExplanation,
  shouldUsePersonalizedExplanation,
  validatePersonalizedExplanation,
  type ExplanationValidationErrorCode,
  type ExplanationValidationFailureField,
  type ModelPersonalizedPreDrinkExplanation,
  type PersonalizedPreDrinkExplanation,
  type SafetyTriggerCode,
} from "../src/ai/personalizedPreDrinkExplanation.js";
import type { CompactEvidenceContext } from "../src/decision/aiExplanationEvidenceBuilder.js";

declare const process: {
  env: Record<string, string | undefined>;
};

type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

type ApiSuccess = {
  success: true;
  data: PersonalizedPreDrinkExplanation;
  source: "llm" | "fallback";
  fallbackType?: string;
  validationFailureCode?: ValidationFailureCode;
  validationFailureField?: ExplanationValidationFailureField;
  unexpectedNumberTokens?: string[];
  safetyTriggerCode?: SafetyTriggerCode;
};

type ApiFailure = {
  success: false;
  error: string;
  fallbackType: string;
};

const PROMPT_VERSION = "personalized-pre-drink-explanation-v1";
const SCHEMA_VERSION = "ai-explanation-output-v1";
const SAFETY_VERSION = "safety-v1";

type ValidationFailureCode =
  | "schema_invalid"
  | "decision_mismatch"
  | "action_not_allowed"
  | "invalid_evidence_id"
  | "fact_number_not_allowed"
  | "evidence_strength_mismatch"
  | "medical_claim"
  | "causal_claim"
  | "absolute_claim"
  | "safety_note_invalid"
  | "unknown_validation_failure";

type CausalValidationFailureField =
  | "explanation"
  | "historicalObservation"
  | "evidenceSummary"
  | "dataLimitation"
  | "actionSuggestion"
  | "unknown";

function json(res: ApiResponse, statusCode: number, body: ApiSuccess | ApiFailure) {
  res.setHeader?.("Cache-Control", "no-store");
  return res.status(statusCode).json(body);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCompactEvidenceContext(value: unknown): value is CompactEvidenceContext {
  if (!isObject(value)) return false;
  if (value.schemaVersion !== "ai-explanation-input-v1") return false;
  if (!isObject(value.ruleDecision)) return false;
  if (!isObject(value.historicalEvidence)) return false;
  if (!Array.isArray(value.evidenceIds)) return false;
  if (!isObject(value.allowedFacts)) return false;
  if (!Array.isArray(value.allowedActionSuggestions)) return false;
  return true;
}

function buildEndpoint(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function buildSystemPrompt() {
  return [
    "你是 Caffeine Coach 的 AI 个性化喝前解释器。",
    "核心计算与风险结论已经由规则层完成，你只能解释，不能改写。",
    "你必须输出 JSON，字段必须符合 schema。",
    "不得重新计算数字，不得新增事实，不得编造饮品、记录、反馈或咖啡因含量。",
    "不得引用任何输入中未提供的数字。",
    "不得补充每日摄入上限、医学阈值、推荐标准或通用健康知识。",
    "只能原样使用 compactContext.allowedFacts 中明确提供的数字。",
    "数字不是必要信息时，使用“当前建议量”“近期”“较高”“较低”等定性表达。",
    "explanation 必须围绕既有 decision 解释，不能重新判断 decision。",
    "不得把共现写成因果，不得做医学诊断，不得承诺一定不会失眠。",
    "只能描述历史记录中的“同时出现、相关、趋势或参考信息”。",
    "不得把历史记录表达为确定的因果关系。",
    "不得说明某次饮用“导致、造成、引发、带来、使你、使得、会让、会使、从而导致、直接影响”某个结果。",
    "不得使用“因为 A，所以一定会 B”或类似确定因果链。",
    "不得根据有限历史记录下医学或生理结论。",
    "explanation 推荐固定逻辑：先说明当前 decision 来自规则结果；再引用一条相关历史现象；最后说明该现象仅作为建议参考，不代表因果关系。",
    "禁止表达示例：较晚饮用会导致你睡不好；咖啡因会让你今晚失眠；晚喝咖啡会带来更严重的睡眠问题；这些记录证明咖啡因直接影响了你的睡眠。",
    "允许表达示例：近期记录中，较晚饮用与较差反馈曾同时出现；结合这些记录，本次可以优先遵循半杯建议；该现象仅作为当前建议的参考，不代表因果关系。",
    "actionSuggestion 必须来自 allowedActionSuggestions。",
    "decision 必须与 ruleDecision.ruleDecision 完全一致。",
  ].join("\n");
}

function buildUserPrompt(context: CompactEvidenceContext) {
  return JSON.stringify({
    task: "基于结构化证据生成本次喝前决策的个性化解释。",
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    safetyVersion: SAFETY_VERSION,
    outputSchema: {
      decision: "full_cup | half_cup | low_caf | no_more_today",
      explanation: "string",
      historicalObservation: "string，可为空",
      observationType:
        "evening_intake_pattern | high_residual_pattern | sleep_feedback_overlap | discomfort_overlap | insufficient_data | none",
      evidenceIds: "string[]",
      evidenceSummary: "string",
      actionSuggestion: "full_cup | half_cup | low_caf | no_more_today",
      confidence: "low | medium | high",
    },
    compactContext: context,
  });
}

async function callLlm(context: CompactEvidenceContext) {
  const hasApiKey = Boolean(process.env.LLM_API_KEY);
  const provider = process.env.LLM_PROVIDER || "qwen";
  const model = process.env.LLM_MODEL;
  const baseUrl = process.env.LLM_BASE_URL;
  if (!hasApiKey || !model || !baseUrl) {
    return { ok: false as const, fallbackType: "missing_server_env", retryable: false };
  }
  if (provider !== "qwen") {
    return { ok: false as const, fallbackType: "unsupported_provider", retryable: false };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(buildEndpoint(baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(context) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        enable_thinking: false,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false as const,
        fallbackType: `llm_http_${response.status}`,
        retryable: response.status === 429 || response.status >= 500,
      };
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return { ok: false as const, fallbackType: "missing_llm_content", retryable: true };
    try {
      return { ok: true as const, output: JSON.parse(content) as ModelPersonalizedPreDrinkExplanation };
    } catch {
      return { ok: false as const, fallbackType: "invalid_json_content", retryable: true };
    }
  } catch (error) {
    return {
      ok: false as const,
      fallbackType: error instanceof DOMException && error.name === "AbortError" ? "api_timeout" : "api_error",
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callLlmWithTechnicalRetry(context: CompactEvidenceContext) {
  const firstResult = await callLlm(context);
  if (firstResult.ok || !firstResult.retryable) return { ...firstResult, attemptCount: 1 };
  const retryResult = await callLlm(context);
  return { ...retryResult, attemptCount: 2 };
}

function classifyValidationFailure(errorCodes: ExplanationValidationErrorCode[]): ValidationFailureCode {
  if (errorCodes.includes("schema")) return "schema_invalid";
  if (errorCodes.includes("decision_mismatch")) return "decision_mismatch";
  if (errorCodes.includes("action_not_allowed")) return "action_not_allowed";
  if (errorCodes.includes("invalid_evidence_id")) return "invalid_evidence_id";
  if (errorCodes.includes("unknown_number")) return "fact_number_not_allowed";
  if (errorCodes.includes("medical_claim")) return "medical_claim";
  if (errorCodes.includes("causal_claim")) return "causal_claim";
  if (errorCodes.includes("absolute_claim")) return "absolute_claim";
  if (errorCodes.includes("extra_data_limitation")) return "schema_invalid";
  if (errorCodes.includes("extra_safety_note")) return "schema_invalid";
  return "unknown_validation_failure";
}

function toCausalValidationFailureField(field?: ExplanationValidationFailureField): CausalValidationFailureField {
  if (
    field === "explanation" ||
    field === "historicalObservation" ||
    field === "evidenceSummary" ||
    field === "dataLimitation" ||
    field === "actionSuggestion"
  ) {
    return field;
  }
  return "unknown";
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const startedAt = Date.now();
  if (req.method !== "POST") {
    return json(res, 405, { success: false, error: "Method not allowed", fallbackType: "method_not_allowed" });
  }
  const context = isObject(req.body) && "context" in req.body ? (req.body as { context?: unknown }).context : req.body;
  if (!isCompactEvidenceContext(context)) {
    return json(res, 400, { success: false, error: "Invalid compact evidence context", fallbackType: "invalid_context" });
  }
  const gate = shouldUsePersonalizedExplanation(context);
  if (!gate.allowed) {
    return json(res, 200, {
      success: true,
      source: "fallback",
      fallbackType: "insufficient_evidence",
      data: ruleFallbackExplanation(context, gate.reason),
    });
  }
  const llmResult = await callLlmWithTechnicalRetry(context);
  if (!llmResult.ok) {
    return json(res, 200, {
      success: true,
      source: "fallback",
      fallbackType: llmResult.fallbackType,
      data: ruleFallbackExplanation(context, "个性化解释暂不可用，已展示规则型解释。"),
    });
  }
  let validation = validatePersonalizedExplanation(llmResult.output, context);
  let attemptCount = llmResult.attemptCount;
  if (!validation.valid && "retryable" in validation && validation.retryable) {
    const retryResult = await callLlm(context);
    attemptCount += 1;
    if (retryResult.ok) validation = validatePersonalizedExplanation(retryResult.output, context);
  }
  if (!validation.valid) {
    const validationFailureCode = "errorCodes" in validation
      ? classifyValidationFailure(validation.errorCodes)
      : "unknown_validation_failure";
    const factNumberDiagnostics =
      validationFailureCode === "fact_number_not_allowed" && "unexpectedNumberTokens" in validation
        ? {
            validationFailureField: validation.validationFailureField || "unknown",
            unexpectedNumberTokens: validation.unexpectedNumberTokens || [],
          }
        : {};
    const causalDiagnostics =
      validationFailureCode === "causal_claim" && "safetyTriggerCode" in validation
        ? {
            validationFailureField: toCausalValidationFailureField(validation.validationFailureField),
            safetyTriggerCode: validation.safetyTriggerCode || "unknown_causal_pattern",
          }
        : {};
    console.warn(
      [
        "personalized_explanation_validation_failed",
        `requestId=${context.requestId}`,
        `validationFailureCode=${validationFailureCode}`,
        `attemptCount=${attemptCount}`,
        `latencyMs=${Date.now() - startedAt}`,
        `model=${process.env.LLM_MODEL || "not_configured"}`,
      ].join(" "),
    );
    return json(res, 200, {
      success: true,
      source: "fallback",
      fallbackType: "validation_failed",
      validationFailureCode,
      ...factNumberDiagnostics,
      ...causalDiagnostics,
      data: ruleFallbackExplanation(context, "个性化解释未通过安全或事实校验，已展示规则型解释。"),
    });
  }
  return json(res, 200, {
    success: true,
    source: "llm",
    data: validation.value,
  });
}
