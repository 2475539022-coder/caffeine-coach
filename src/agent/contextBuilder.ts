import { loadCustomDrinks, loadDefaultDrinks } from "../utils/drinkData";
import { buildFrequentDrinkMemory, type FrequentDrinkMemory, type FrequentDrinkSource } from "../utils/frequentDrinkMemory";
import { loadNoMatchDrinkMemory, type NoMatchDrinkMemory } from "../utils/noMatchDrinkMemory";
import type { DrinkItem } from "../types/drink";
import {
  calculateCurrentCaffeineStatus,
  getTodayIntakeRecords,
  getUserProfile,
} from "./toolHandlers";
import type {
  AgentDrinkRecord,
  AgentProfile,
  CaffeineStatusOutput,
  TodayIntakeOutput,
} from "./types";
import type { SkillId } from "./skillRegistry";

const STORAGE_KEY = "caffeine-coach-demo-v1";

type StoredSnapshot = {
  drinks: AgentDrinkRecord[];
  dailyStatusMemory: DailyStatusMemorySnapshot[];
  feedbackMemory: FeedbackMemorySnapshot[];
};

type DailyStatusMemorySnapshot = {
  date: string;
  totalCaffeineMg: number;
  recordCount: number;
  latestIntakeTime?: string;
  bedtimeResidualMg: number;
  sleepRiskLevel: "低" | "中" | "高";
  exceededDailyTarget: boolean;
  hasEveningIntake: boolean;
  beanStatus: string;
  summaryText: string;
  hasFeedback: boolean;
};

type FeedbackMemorySnapshot = {
  date: string;
  sleepQuality?: string;
  fallAsleepSpeed?: string;
  palpitation?: boolean;
  anxiety?: boolean;
  stomachDiscomfort?: boolean;
  handTremor?: boolean;
  focusEffect?: number;
  note?: string;
};

export type SleepRiskAdvisorContext = {
  userProfile: {
    sleepTime: string;
    sensitivity: "sensitive" | "normal" | "tolerant";
    halfLife: number;
    reminderStrictness: string;
  };
  todayIntakeRecords: AgentDrinkRecord[];
  remainingCaffeine: number;
  estimatedCaffeineAtSleep: number;
  sleepRisk: "low" | "medium" | "high";
  recentFeedbackSummary: {
    sleepAffectedDays: number;
    discomfortCount: number;
  };
};

export type DrinkRecordParserContext = {
  userText: string;
  currentTime: string;
  drinkLibrary: DrinkItem[];
  customDrinks: DrinkItem[];
  frequentDrinks: FrequentDrinkMemory[];
  noMatchMemory: NoMatchDrinkMemory[];
};

export type WeeklyReviewWriterContext = {
  weekRange: {
    start: string;
    end: string;
  };
  intakeSummary: {
    totalCaffeineMg: number;
    averageDailyCaffeineMg: number;
    maxDayCaffeineMg: number;
    lateIntakeCount: number;
  };
  dailyStatusSummary: {
    date: string;
    status: string;
    totalCaffeineMg: number;
    riskLevel: string;
  }[];
  frequentDrinks: FrequentDrinkMemory[];
  feedbackSummary: {
    sleepAffectedDays: number;
    discomfortCount: number;
    feedbackExamples: string[];
  };
  sensitivityExplanation: {
    label: string;
    reasons: string[];
  };
};

export type AlternativeDrinkRecommenderContext = {
  userProfile: {
    sleepTime: string;
    sensitivity: string;
    halfLife: number;
    reminderStrictness: string;
  };
  currentState: {
    remainingCaffeine: number;
    sleepRisk: "low" | "medium" | "high";
    estimatedCaffeineAtSleep: number;
  };
  drinkOptions: {
    drinkLibrary: DrinkItem[];
    frequentDrinks: FrequentDrinkMemory[];
    customDrinks: DrinkItem[];
  };
  recentFeedbackSummary: {
    sleepAffectedDays: number;
    discomfortCount: number;
  };
};

export type SkillContextMap = {
  sleep_risk_advisor: SleepRiskAdvisorContext;
  drink_record_parser: DrinkRecordParserContext;
  weekly_review_writer: WeeklyReviewWriterContext;
  alternative_drink_recommender: AlternativeDrinkRecommenderContext;
};

export type BuildSkillContextInput = {
  userText?: string;
  currentTime?: string;
  date?: string;
};

function readStoredSnapshot(): StoredSnapshot {
  try {
    if (typeof localStorage === "undefined") {
      return { drinks: [], dailyStatusMemory: [], feedbackMemory: [] };
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      drinks: Array.isArray(parsed.drinks) ? parsed.drinks : [],
      dailyStatusMemory: Array.isArray(parsed.dailyStatusMemory) ? parsed.dailyStatusMemory : [],
      feedbackMemory: Array.isArray(parsed.feedbackMemory) ? parsed.feedbackMemory : [],
    };
  } catch {
    return { drinks: [], dailyStatusMemory: [], feedbackMemory: [] };
  }
}

function riskToEnglish(risk?: string): "low" | "medium" | "high" {
  if (risk === "高") return "high";
  if (risk === "中") return "medium";
  return "low";
}

function compactSensitivity(profile?: AgentProfile): "sensitive" | "normal" | "tolerant" {
  const label = profile?.labels.sensitivity || "";
  if (label.includes("高") || label.includes("中")) return "sensitive";
  if (profile?.settings.sensitivityProfile === "high_tolerance") return "tolerant";
  return "normal";
}

function recordToFrequentSource(record: AgentDrinkRecord): FrequentDrinkSource {
  return {
    drinkId: record.drinkItemId,
    name: record.displayName || record.name,
    brand: record.brand,
    size: record.sizeLabel,
    caffeineMg: record.mg,
    category: record.category,
    sourceType: record.sourceType,
    confidence: record.confidence,
    isDecaf: record.isDecaf,
    usedAt: record.time,
  };
}

function recentFeedbackSummary(feedbackMemory: FeedbackMemorySnapshot[], count = 7) {
  const recent = feedbackMemory.slice(-count);
  return {
    sleepAffectedDays: recent.filter((item) => item.sleepQuality === "bad" || item.fallAsleepSpeed === "slow").length,
    discomfortCount: recent.filter((item) => item.palpitation || item.anxiety || item.stomachDiscomfort || item.handTremor).length,
  };
}

function profileOrFallback() {
  const result = getUserProfile();
  return result.success ? result.data : undefined;
}

function statusOrFallback(currentTime?: string) {
  const result = calculateCurrentCaffeineStatus({ currentTime });
  return result.success ? result.data : undefined;
}

function todayOrFallback(date?: string): TodayIntakeOutput {
  const result = getTodayIntakeRecords({ date });
  return result.success && result.data
    ? result.data
    : {
        date: date || new Date().toISOString(),
        records: [],
        totalMg: 0,
      };
}

export function buildSleepRiskAdvisorContext(input: BuildSkillContextInput = {}): SleepRiskAdvisorContext {
  const profile = profileOrFallback();
  const status = statusOrFallback(input.currentTime);
  const today = todayOrFallback(input.date || input.currentTime);
  const snapshot = readStoredSnapshot();
  const feedback = recentFeedbackSummary(snapshot.feedbackMemory);

  return {
    userProfile: {
      sleepTime: profile?.settings.bedTime ?? "23:30",
      sensitivity: compactSensitivity(profile),
      halfLife: status?.halfLifeHours ?? 5,
      reminderStrictness: profile?.settings.strictnessMode ?? "balanced",
    },
    todayIntakeRecords: today.records,
    remainingCaffeine: status?.currentRemainingMg ?? 0,
    estimatedCaffeineAtSleep: status?.sleepRemainingMg ?? 0,
    sleepRisk: riskToEnglish(status?.sleepRisk),
    recentFeedbackSummary: feedback,
  };
}

export function buildDrinkRecordParserContext(input: BuildSkillContextInput = {}): DrinkRecordParserContext {
  const snapshot = readStoredSnapshot();
  return {
    userText: input.userText ?? "",
    currentTime: input.currentTime ?? new Date().toISOString(),
    drinkLibrary: loadDefaultDrinks(),
    customDrinks: loadCustomDrinks(),
    frequentDrinks: buildFrequentDrinkMemory(snapshot.drinks.map(recordToFrequentSource), 6),
    noMatchMemory: loadNoMatchDrinkMemory(),
  };
}

export function buildWeeklyReviewWriterContext(input: BuildSkillContextInput = {}): WeeklyReviewWriterContext {
  const snapshot = readStoredSnapshot();
  const profile = profileOrFallback();
  const recentStatuses = snapshot.dailyStatusMemory.slice(-7);
  const totals = recentStatuses.map((item) => Number(item.totalCaffeineMg) || 0);
  const totalCaffeineMg = totals.reduce((sum, value) => sum + value, 0);
  const feedback = recentFeedbackSummary(snapshot.feedbackMemory);

  return {
    weekRange: {
      start: recentStatuses[0]?.date ?? "",
      end: recentStatuses[recentStatuses.length - 1]?.date ?? "",
    },
    intakeSummary: {
      totalCaffeineMg,
      averageDailyCaffeineMg: recentStatuses.length ? Math.round(totalCaffeineMg / recentStatuses.length) : 0,
      maxDayCaffeineMg: totals.length ? Math.max(...totals) : 0,
      lateIntakeCount: recentStatuses.filter((item) => item.hasEveningIntake).length,
    },
    dailyStatusSummary: recentStatuses.map((item) => ({
      date: item.date,
      status: item.summaryText || item.beanStatus,
      totalCaffeineMg: item.totalCaffeineMg,
      riskLevel: item.sleepRiskLevel,
    })),
    frequentDrinks: buildFrequentDrinkMemory(snapshot.drinks.map(recordToFrequentSource), 6),
    feedbackSummary: {
      ...feedback,
      feedbackExamples: snapshot.feedbackMemory.slice(-3).map((item) => item.note).filter(Boolean) as string[],
    },
    sensitivityExplanation: {
      label: profile?.labels.sensitivity ?? "未知",
      reasons: [
        profile?.labels.metabolism ? `当前代谢设置：${profile.labels.metabolism}` : "TODO: 接入更完整的敏感度解释原因。",
        profile?.labels.goal ? `当前管理目标：${profile.labels.goal}` : "TODO: 接入用户目标。",
      ],
    },
  };
}

export function buildAlternativeDrinkRecommenderContext(input: BuildSkillContextInput = {}): AlternativeDrinkRecommenderContext {
  const profile = profileOrFallback();
  const status = statusOrFallback(input.currentTime);
  const snapshot = readStoredSnapshot();
  const feedback = recentFeedbackSummary(snapshot.feedbackMemory);

  return {
    userProfile: {
      sleepTime: profile?.settings.bedTime ?? "23:30",
      sensitivity: profile?.labels.sensitivity ?? "未知",
      halfLife: status?.halfLifeHours ?? 5,
      reminderStrictness: profile?.settings.strictnessMode ?? "balanced",
    },
    currentState: {
      remainingCaffeine: status?.currentRemainingMg ?? 0,
      sleepRisk: riskToEnglish(status?.sleepRisk),
      estimatedCaffeineAtSleep: status?.sleepRemainingMg ?? 0,
    },
    drinkOptions: {
      drinkLibrary: loadDefaultDrinks(),
      frequentDrinks: buildFrequentDrinkMemory(snapshot.drinks.map(recordToFrequentSource), 6),
      customDrinks: loadCustomDrinks(),
    },
    recentFeedbackSummary: feedback,
  };
}

export function buildSkillContext<T extends SkillId>(skillId: T, input: BuildSkillContextInput = {}): SkillContextMap[T] {
  switch (skillId) {
    case "sleep_risk_advisor":
      return buildSleepRiskAdvisorContext(input) as SkillContextMap[T];
    case "drink_record_parser":
      return buildDrinkRecordParserContext(input) as SkillContextMap[T];
    case "weekly_review_writer":
      return buildWeeklyReviewWriterContext(input) as SkillContextMap[T];
    case "alternative_drink_recommender":
      return buildAlternativeDrinkRecommenderContext(input) as SkillContextMap[T];
    default:
      throw new Error(`Unsupported skill: ${String(skillId)}`);
  }
}
