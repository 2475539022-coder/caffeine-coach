const NO_MATCH_DRINK_MEMORY_KEY = "caffeine-coach-no-match-drinks-v1";

export type NoMatchDrinkStatus = "pending" | "converted";

export type NoMatchDrinkMemory = {
  id: string;
  rawInput: string;
  normalizedInput: string;
  firstSeenAt: string;
  lastSeenAt: string;
  count: number;
  status: NoMatchDrinkStatus;
  caffeineMg?: number;
  convertedDrinkId?: string;
  note?: string;
};

export function normalizeNoMatchInput(input: string) {
  return input
    .trim()
    .replace(/[，。,.!?！？、:：;；"'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function safeNow() {
  return new Date().toISOString();
}

export function loadNoMatchDrinkMemory(): NoMatchDrinkMemory[] {
  try {
    const raw = localStorage.getItem(NO_MATCH_DRINK_MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveNoMatchDrinkMemory(items: NoMatchDrinkMemory[]) {
  localStorage.setItem(NO_MATCH_DRINK_MEMORY_KEY, JSON.stringify(items));
}

export function upsertNoMatchDrinkMemory(
  rawInput: string,
  updates: Partial<Omit<NoMatchDrinkMemory, "id" | "normalizedInput" | "firstSeenAt" | "lastSeenAt" | "count">> = {},
) {
  const normalizedInput = normalizeNoMatchInput(rawInput);
  if (!normalizedInput) return null;

  const now = safeNow();
  const items = loadNoMatchDrinkMemory();
  const existing = items.find((item) => item.normalizedInput === normalizedInput);
  const nextItem: NoMatchDrinkMemory = existing
    ? {
        ...existing,
        rawInput: rawInput.trim() || existing.rawInput,
        lastSeenAt: now,
        count: existing.count + 1,
        status: updates.status || existing.status,
        ...updates,
      }
    : {
        id: `no-match-${crypto.randomUUID()}`,
        rawInput: rawInput.trim(),
        normalizedInput,
        firstSeenAt: now,
        lastSeenAt: now,
        count: 1,
        status: "pending",
        ...updates,
      };

  saveNoMatchDrinkMemory([nextItem, ...items.filter((item) => item.normalizedInput !== normalizedInput)]);
  return nextItem;
}

export function convertNoMatchDrinkMemory(rawInput: string, caffeineMg: number, convertedDrinkId: string, note?: string) {
  return upsertNoMatchDrinkMemory(rawInput, {
    status: "converted",
    caffeineMg: Math.max(0, Math.round(Number(caffeineMg) || 0)),
    convertedDrinkId,
    note,
  });
}

export function getPendingNoMatchDrinkMemory(limit = 5) {
  return loadNoMatchDrinkMemory()
    .filter((item) => item.status === "pending")
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, limit);
}
