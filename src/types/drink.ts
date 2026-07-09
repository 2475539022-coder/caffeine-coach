export type DrinkCategory =
  | "coffee"
  | "tea"
  | "milk_tea"
  | "energy_drink"
  | "soda"
  | "other";

export type DrinkSourceType =
  | "generic_estimate"
  | "brand_library"
  | "label"
  | "food_api"
  | "user_custom";

export type DrinkConfidence =
  | "low"
  | "medium"
  | "high"
  | "user_confirmed";

export type DrinkItem = {
  id: string;
  brand: string;
  name: string;
  displayName: string;
  category: DrinkCategory;
  subCategory?: string;
  sizeLabel?: string;
  volumeMl?: number;
  servingCount?: number;
  caffeineMg: number;
  caffeineRangeMg?: {
    min: number;
    max: number;
  };
  caffeinePer100ml?: number;
  sourceType: DrinkSourceType;
  confidence: DrinkConfidence;
  isDefault?: boolean;
  isCustom?: boolean;
  isDecaf?: boolean;
  aliases?: string[];
  ocrKeywords?: string[];
  matchPriority?: number;
  tags?: string[];
  notes?: string;
  editableFields?: string[];
};
