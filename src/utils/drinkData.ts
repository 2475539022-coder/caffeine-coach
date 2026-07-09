import drinks from "../data/drinks.json";
import type { DrinkCategory, DrinkItem } from "../types/drink";

const CUSTOM_DRINKS_KEY = "caffeine-coach-custom-drinks-v1";

export type CustomDrinkInput = {
  id?: string;
  brand: string;
  name: string;
  displayName: string;
  category: DrinkCategory;
  sizeLabel?: string;
  volumeMl?: number;
  caffeineMg: number;
  notes?: string;
};

export function loadDefaultDrinks(): DrinkItem[] {
  return drinks as DrinkItem[];
}

export function loadCustomDrinks(): DrinkItem[] {
  try {
    const raw = localStorage.getItem(CUSTOM_DRINKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistCustomDrinks(items: DrinkItem[]) {
  localStorage.setItem(CUSTOM_DRINKS_KEY, JSON.stringify(items));
}

export function saveCustomDrink(input: CustomDrinkInput): DrinkItem {
  const customDrinks = loadCustomDrinks();
  const drink: DrinkItem = {
    id: input.id || `custom-${crypto.randomUUID()}`,
    brand: input.brand || "我的常喝",
    name: input.name || input.displayName,
    displayName: input.displayName || input.name,
    category: input.category,
    sizeLabel: input.sizeLabel,
    volumeMl: input.volumeMl,
    caffeineMg: Number(input.caffeineMg) || 0,
    sourceType: "user_custom",
    confidence: "user_confirmed",
    isDefault: false,
    isCustom: true,
    isDecaf: Number(input.caffeineMg) <= 15,
    aliases: [input.name, input.displayName, input.brand].filter(Boolean),
    ocrKeywords: [input.brand, input.name, input.displayName].filter(Boolean),
    matchPriority: 50,
    tags: ["我的常喝", input.category],
    notes: input.notes,
    editableFields: ["caffeineMg", "displayName", "sizeLabel", "volumeMl", "notes"],
  };
  const next = [drink, ...customDrinks.filter((item) => item.id !== drink.id)];
  persistCustomDrinks(next);
  return drink;
}

export function deleteCustomDrink(id: string) {
  persistCustomDrinks(loadCustomDrinks().filter((item) => item.id !== id));
}

export function getAllDrinks(): DrinkItem[] {
  return [...loadCustomDrinks(), ...loadDefaultDrinks()];
}
