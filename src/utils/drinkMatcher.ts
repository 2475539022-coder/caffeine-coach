import type { DrinkConfidence, DrinkItem } from "../types/drink";
import { getAllDrinks } from "./drinkData";

export type DrinkMatchInput = {
  rawText?: string;
  brand?: string;
  drinkName?: string;
  sizeLabel?: string;
  volumeMl?: number;
};

export type DrinkMatch = {
  drink: DrinkItem;
  score: number;
  confidence: Exclude<DrinkConfidence, "user_confirmed">;
  reason: string;
  matchReason:
    | "name_matched"
    | "alias_matched"
    | "brand_matched"
    | "ocr_keyword_matched"
    | "size_or_volume_matched"
    | "no_reliable_match";
};

function includesText(source: string | undefined, target: string | undefined) {
  if (!source || !target) return false;
  return source.toLowerCase().includes(target.toLowerCase()) || target.toLowerCase().includes(source.toLowerCase());
}

function confidenceFromScore(score: number): DrinkMatch["confidence"] {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export function matchDrinkFromText(input: DrinkMatchInput, drinks = getAllDrinks()): DrinkMatch[] {
  const text = [input.rawText, input.brand, input.drinkName, input.sizeLabel].filter(Boolean).join(" ");

  return drinks
    .map((drink) => {
      let score = 0;
      const reasons: string[] = [];
      let matchReason: DrinkMatch["matchReason"] = "no_reliable_match";
      let hasReliableMatch = false;

      if (input.drinkName && (drink.name === input.drinkName || drink.displayName === input.drinkName)) {
        score += 70;
        reasons.push("名称精确命中");
        matchReason = "name_matched";
        hasReliableMatch = true;
      } else if (input.drinkName && includesText(drink.name, input.drinkName)) {
        score += 50 + Math.min(25, drink.name.length * 3);
        reasons.push("名称命中");
        matchReason = "name_matched";
        hasReliableMatch = true;
      }
      if (input.rawText && (input.rawText.includes(drink.name) || input.rawText.includes(drink.displayName))) {
        score += 35 + Math.min(20, drink.name.length * 2);
        reasons.push("完整名称出现在识别文本");
        matchReason = "name_matched";
        hasReliableMatch = true;
      }
      if ((drink.aliases || []).some((alias) => includesText(text, alias))) {
        score += 40;
        reasons.push("别名命中");
        if (matchReason === "no_reliable_match") matchReason = "alias_matched";
        hasReliableMatch = true;
      }
      if ((drink.ocrKeywords || []).some((keyword) => includesText(text, keyword))) {
        score += 35;
        reasons.push("识别关键词命中");
        if (matchReason === "no_reliable_match") matchReason = "ocr_keyword_matched";
        hasReliableMatch = true;
      }
      if (input.brand && includesText(drink.brand, input.brand)) {
        score += 25;
        reasons.push("品牌命中");
        if (matchReason === "no_reliable_match") matchReason = "brand_matched";
        hasReliableMatch = true;
      }
      if (input.sizeLabel && drink.sizeLabel && includesText(drink.sizeLabel, input.sizeLabel)) {
        score += 10;
        reasons.push("杯型接近");
        if (matchReason === "no_reliable_match") matchReason = "size_or_volume_matched";
      }
      if (input.volumeMl && drink.volumeMl && Math.abs(drink.volumeMl - input.volumeMl) <= 80) {
        score += 10;
        reasons.push("容量接近");
        if (matchReason === "no_reliable_match") matchReason = "size_or_volume_matched";
      }
      if (hasReliableMatch) score += Math.min(10, Math.max(0, drink.matchPriority || 0));

      return {
        drink,
        score: Math.round(score),
        confidence: confidenceFromScore(score),
        reason: reasons.length ? reasons.join("、") : "相似度较低，请确认",
        matchReason,
      };
    })
    .filter((item) => item.matchReason !== "no_reliable_match" && item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
