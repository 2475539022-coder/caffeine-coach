import type { DrinkCategory, DrinkConfidence, DrinkSourceType } from "../types/drink";

const FREQUENT_DRINK_MEMORY_KEY = "caffeine-coach-frequent-drinks-v1";
const RECENT_WINDOW_DAYS = 14;

export type FrequentDrinkSource = {
  drinkId?: string;
  name: string;
  brand?: string;
  size?: string;
  caffeineMg?: number;
  category?: DrinkCategory;
  sourceType?: DrinkSourceType;
  confidence?: DrinkConfidence;
  isDecaf?: boolean;
  usedAt?: string;
};

export type FrequentDrinkMemory = {
  id: string;
  drinkId?: string;
  name: string;
  brand?: string;
  size?: string;
  caffeineMg?: number;
  category?: DrinkCategory;
  source: "auto" | "manual";
  count: number;
  lastUsedAt: string;
  isPinned?: boolean;
  sourceType?: DrinkSourceType;
  confidence?: DrinkConfidence;
  isDecaf?: boolean;
};

type StoredFrequentDrinkMemory = {
  pinned: FrequentDrinkMemory[];
  excludedIds: string[];
};

function emptyStore(): StoredFrequentDrinkMemory {
  return { pinned: [], excludedIds: [] };
}

function normalizeText(value?: string) {
  return (value || "").trim().toLowerCase();
}

export function frequentDrinkMemoryId(input: FrequentDrinkSource) {
  if (input.drinkId) return `drink:${input.drinkId}`;
  return [
    "manual",
    normalizeText(input.brand),
    normalizeText(input.name),
    Math.round(Number(input.caffeineMg) || 0),
  ].join(":");
}

export function sourceToFrequentMemory(input: FrequentDrinkSource, source: FrequentDrinkMemory["source"], count = 1): FrequentDrinkMemory {
  const now = new Date().toISOString();
  return {
    id: frequentDrinkMemoryId(input),
    drinkId: input.drinkId,
    name: input.name,
    brand: input.brand,
    size: input.size,
    caffeineMg: Number(input.caffeineMg) || 0,
    category: input.category,
    source,
    count,
    lastUsedAt: input.usedAt || now,
    isPinned: source === "manual",
    sourceType: input.sourceType,
    confidence: input.confidence,
    isDecaf: input.isDecaf,
  };
}

export function loadFrequentDrinkMemoryStore(): StoredFrequentDrinkMemory {
  try {
    const raw = localStorage.getItem(FREQUENT_DRINK_MEMORY_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<StoredFrequentDrinkMemory>;
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
      excludedIds: Array.isArray(parsed.excludedIds) ? parsed.excludedIds : [],
    };
  } catch {
    return emptyStore();
  }
}

function saveFrequentDrinkMemoryStore(store: StoredFrequentDrinkMemory) {
  localStorage.setItem(FREQUENT_DRINK_MEMORY_KEY, JSON.stringify(store));
}

export function pinFrequentDrinkMemory(input: FrequentDrinkSource) {
  const store = loadFrequentDrinkMemoryStore();
  const pinned = sourceToFrequentMemory(input, "manual");
  saveFrequentDrinkMemoryStore({
    pinned: [pinned, ...store.pinned.filter((item) => item.id !== pinned.id)],
    excludedIds: store.excludedIds.filter((id) => id !== pinned.id),
  });
  return pinned;
}

export function removeFrequentDrinkMemory(id: string) {
  const store = loadFrequentDrinkMemoryStore();
  saveFrequentDrinkMemoryStore({
    pinned: store.pinned.filter((item) => item.id !== id),
    excludedIds: Array.from(new Set([...store.excludedIds, id])),
  });
}

export function buildFrequentDrinkMemory(records: FrequentDrinkSource[], limit = 6): FrequentDrinkMemory[] {
  const store = loadFrequentDrinkMemoryStore();
  const now = Date.now();
  const recentStart = now - RECENT_WINDOW_DAYS * 24 * 36e5;
  const groups = new Map<string, { sample: FrequentDrinkSource; totalCount: number; recentCount: number; lastUsedAt: string }>();

  records.forEach((record) => {
    const id = frequentDrinkMemoryId(record);
    const usedAt = record.usedAt || new Date().toISOString();
    const usedTime = new Date(usedAt).getTime();
    const existing = groups.get(id);
    if (!existing) {
      groups.set(id, {
        sample: record,
        totalCount: 1,
        recentCount: usedTime >= recentStart ? 1 : 0,
        lastUsedAt: usedAt,
      });
      return;
    }
    existing.totalCount += 1;
    if (usedTime >= recentStart) existing.recentCount += 1;
    if (new Date(usedAt).getTime() > new Date(existing.lastUsedAt).getTime()) {
      existing.sample = record;
      existing.lastUsedAt = usedAt;
    }
  });

  const excluded = new Set(store.excludedIds);
  const pinnedIds = new Set(store.pinned.map((item) => item.id));
  const pinned = store.pinned
    .filter((item) => !excluded.has(item.id))
    .map((item) => {
      const group = groups.get(item.id);
      return group
        ? { ...item, count: group.totalCount, lastUsedAt: group.lastUsedAt, source: "manual" as const, isPinned: true }
        : item;
    });

  const automatic = Array.from(groups.entries())
    .filter(([id, group]) => !excluded.has(id) && !pinnedIds.has(id) && (group.recentCount >= 2 || group.totalCount >= 3))
    .map(([id, group]) => ({
      ...sourceToFrequentMemory({ ...group.sample, usedAt: group.lastUsedAt }, "auto", group.totalCount),
      id,
      lastUsedAt: group.lastUsedAt,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime();
    });

  return [...pinned, ...automatic].slice(0, limit);
}
