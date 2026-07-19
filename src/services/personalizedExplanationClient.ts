import type { PersonalizedPreDrinkExplanation } from "../ai/personalizedPreDrinkExplanation";
import type { CompactEvidenceContext } from "../decision/aiExplanationEvidenceBuilder";

export type PersonalizedExplanationApiResponse =
  | {
      success: true;
      source: "llm" | "fallback";
      fallbackType?: string;
      data: PersonalizedPreDrinkExplanation;
    }
  | {
      success: false;
      error: string;
      fallbackType: string;
    };

export async function requestPersonalizedPreDrinkExplanation(
  context: CompactEvidenceContext,
  signal?: AbortSignal,
): Promise<PersonalizedExplanationApiResponse> {
  const response = await fetch("/api/personalized-explanation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context }),
    signal,
  });
  const payload = (await response.json()) as PersonalizedExplanationApiResponse;
  if (!response.ok) {
    return {
      success: false,
      error: "个性化说明暂时不可用。",
      fallbackType: payload.success === false ? payload.fallbackType : "request_failed",
    };
  }
  return payload;
}
