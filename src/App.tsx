import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Label,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BarChart3,
  Bot,
  Camera,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Coffee,
  Edit3,
  FlaskConical,
  Gauge,
  Home,
  Moon,
  NotebookPen,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { BeanAvatar, type BeanAvatarStatus } from "./components/BeanAvatar";
import { DrinkSelector, categoryLabels, confidenceLabels, sourceLabels } from "./components/DrinkSelector";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import type { DrinkCategory, DrinkConfidence, DrinkItem, DrinkSourceType } from "./types/drink";
import { deleteCustomDrink, getAllDrinks, saveCustomDrink, type CustomDrinkInput } from "./utils/drinkData";
import { matchDrinkFromText, type DrinkMatch } from "./utils/drinkMatcher";
import {
  buildFrequentDrinkMemory,
  pinFrequentDrinkMemory,
  removeFrequentDrinkMemory,
  type FrequentDrinkMemory,
  type FrequentDrinkSource,
} from "./utils/frequentDrinkMemory";
import {
  convertNoMatchDrinkMemory,
  getPendingNoMatchDrinkMemory,
  upsertNoMatchDrinkMemory,
  type NoMatchDrinkMemory,
} from "./utils/noMatchDrinkMemory";
import { recognizeDrinkFromImage } from "./services/mockOcr";
import { agentLoop } from "./agent/agentLoop";
import { permissionGuard } from "./agent/permissions";
import type { AgentLoopResponse } from "./agent/types";
import { useAdviceRefresh } from "./hooks/useAdviceRefresh";
import { calculateRuleDecisionSnapshot, type RuleDecision } from "./decision/caffeineDecisionEngine";

type MainTab = "today" | "records" | "insights" | "mine";

type Drink = {
  id: string;
  name: string;
  type: string;
  mg: number;
  time: string;
  note: string;
  drinkItemId?: string;
  brand?: string;
  category?: DrinkCategory;
  displayName?: string;
  volumeMl?: number;
  sizeLabel?: string;
  sourceType?: DrinkSourceType;
  confidence?: DrinkConfidence;
  isDecaf?: boolean;
};

type DrinkDraft = {
  name: string;
  type: string;
  mg: number;
  time: string;
  note: string;
  drinkItemId?: string;
  brand?: string;
  category?: DrinkCategory;
  displayName?: string;
  volumeMl?: number;
  sizeLabel?: string;
  sourceType?: DrinkSourceType;
  confidence?: DrinkConfidence;
  isDecaf?: boolean;
};

type SimulationDraft = Omit<DrinkDraft, "time" | "note">;

type OcrResult = Awaited<ReturnType<typeof recognizeDrinkFromImage>>;

type OcrState = {
  loading: boolean;
  result?: OcrResult;
  matches: DrinkMatch[];
  selectedIndex: number;
  editing: boolean;
  manualMg: number;
  error?: string;
};

type SettingsState = {
  bedTime: string;
  wakeTime: string;
  metabolism: "fast" | "normal" | "slow";
  goal: "energy" | "sleep" | "reduce";
  safeThreshold: number;
  sensitivityProfile: "normal" | "sleep_sensitive" | "body_sensitive" | "high_tolerance";
  singleComfortMg: number;
  singleDiscomfortMg: number;
  palpitationTriggerMg: number;
  anxietyTriggerMg: number;
  dailyBaseLimitMg: number;
  personalDailyLimitMg: number;
  dailyPersonalLimitMg: number;
  safeSleepResidualMg: number;
  strictnessMode: "strict" | "balanced" | "loose";
  questionnaireSleepImpact: "none" | "slight" | "obvious";
  questionnairePalpitation: "never" | "sometimes" | "often";
  questionnaireAnxiety: "never" | "sometimes" | "often";
  questionnaireLatteFeeling: "just_right" | "too_much" | "no_effect";
  goodFeedbackCount: number;
};

type FeedbackState = {
  effect: number;
  sideEffect: "none" | "anxiety" | "palpitation" | "tremor" | "stomach";
  sleepQuality: "good" | "normal" | "bad";
  sleepLatency: "fast" | "slow" | "hard";
  afternoonIntake: "yes" | "no";
  lessEffective: "yes" | "slight" | "no";
  palpitationToday: "yes" | "no";
  anxietyToday: "yes" | "no";
  updatedAt?: string;
};

type CaffeineHabits = {
  coffeeFeeling: "just_right" | "too_much" | "not_effective";
  afternoonSleepImpact: "none" | "slight" | "obvious";
  discomfortFrequency: "never" | "sometimes" | "often";
  reminderStrictness: "loose" | "balanced" | "strict";
};

type CaffeineHabitProfile = {
  sensitivityLevel: "low" | "medium" | "high";
  toleranceSignal: "normal" | "possible_tolerance";
  singleCupAdvice: "normal" | "prefer_half" | "prefer_low_caf";
  sleepCutoffShiftMinutes: number;
  recommendationFactor: number;
  sleepRiskStrictness: "normal" | "strict";
};

type Bean = {
  name: string;
  status: BeanAvatarStatus;
  tone: string;
  chip: string;
  text: string;
  color: string;
};

type SensitivityInsight = {
  level: "low" | "medium" | "high";
  label: "低敏感" | "中敏感" | "高敏感";
  coefficient: number;
  text: string;
};

type SensitivityExplanation = {
  statusLabel: "偏敏感" | "正常" | "偏耐受";
  summary: string;
  reasons: string[];
  evidence: { label: string; value: string; helper?: string }[];
  suggestions: string[];
};

type ToleranceInsight = {
  level: "low" | "medium" | "high" | "unknown";
  label: string;
  dailyAvg: number;
  avgEffect: number;
  trend: "稳定" | "轻微升高" | "明显升高" | "正在恢复" | "数据不足";
  text: string;
  chartData: { day: string; mg: number; score: number | null }[];
};

type SevenDayInsight = {
  chartData: { day: string; mg: number; sleepResidual: number; late: number; overTarget: boolean; highSleepRisk: boolean }[];
  totalMg: number;
  dailyAvg: number;
  lateIntakeDays: number;
  overTargetDays: number;
  highSleepRiskDays: number;
  sleepResidualAvg: number;
};

type DailyStatusMemoryEntry = {
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

type FeedbackMemoryEntry = {
  date: string;
  feedbackType: "daily_checkin" | "calendar_backfill";
  sleepQuality: FeedbackState["sleepQuality"];
  fallAsleepSpeed: "fast" | "normal" | "slow";
  palpitation: boolean;
  anxiety: boolean;
  stomachDiscomfort: boolean;
  handTremor: boolean;
  focusEffect: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "caffeine-coach-demo-v1";

function categoryIcon(category?: DrinkCategory) {
  if (category === "milk_tea") return "🧋";
  if (category === "tea") return "🍵";
  if (category === "energy_drink") return "⚡";
  if (category === "soda") return "🥤";
  return "☕";
}

function drinkTypeLabel(category?: DrinkCategory, fallback = "饮品") {
  return category ? categoryLabels[category] : fallback;
}

const defaultSettings: SettingsState = {
  bedTime: "23:30",
  wakeTime: "07:30",
  metabolism: "normal",
  goal: "energy",
  safeThreshold: 30,
  sensitivityProfile: "normal",
  singleComfortMg: 120,
  singleDiscomfortMg: 180,
  palpitationTriggerMg: 150,
  anxietyTriggerMg: 120,
  dailyBaseLimitMg: 280,
  personalDailyLimitMg: 0,
  dailyPersonalLimitMg: 0,
  safeSleepResidualMg: 30,
  strictnessMode: "balanced",
  questionnaireSleepImpact: "slight",
  questionnairePalpitation: "never",
  questionnaireAnxiety: "never",
  questionnaireLatteFeeling: "just_right",
  goodFeedbackCount: 0,
};

const defaultFeedback: FeedbackState = {
  effect: 3,
  sideEffect: "none",
  sleepQuality: "normal",
  sleepLatency: "fast",
  afternoonIntake: "no",
  lessEffective: "no",
  palpitationToday: "no",
  anxietyToday: "no",
};

const defaultDrinks: Drink[] = [
  {
    id: "seed-latte",
    name: "拿铁",
    type: "咖啡",
    mg: 120,
    time: new Date().toISOString(),
    note: "下午提神",
  },
  {
    id: "seed-green",
    name: "绿茶",
    type: "茶",
    mg: 30,
    time: new Date().toISOString(),
    note: "",
  },
];

const halfLives = { fast: 3.5, normal: 5, slow: 7 };
const metabolismFactors = { fast: 1.1, normal: 1, slow: 0.75 };
const sleepFactors = { good: 1, normal: 0.85, bad: 0.7 };
const goalFactors = { energy: 1, sleep: 0.75, reduce: 0.65 };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function todayLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());
}

function toInputDateTime(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromInputDateTime(value: string) {
  return new Date(value).toISOString();
}

function isSameDay(dateIso: string, now = new Date()) {
  const date = new Date(dateIso);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function getDayStart(date: Date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date();
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function recentDateKeys(count: number) {
  const today = getDayStart(new Date());
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getTime() - (count - 1 - index) * 24 * 36e5);
    return dateKey(date);
  });
}

function isTodayKey(key: string) {
  return key === dateKey(new Date());
}

function formatDateKey(key: string) {
  const date = dateFromKey(key);
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(date);
}

function shortDateKeyLabel(key: string) {
  const date = dateFromKey(key);
  return isTodayKey(key) ? "今天" : `${date.getMonth() + 1}/${date.getDate()}`;
}

function getBedDate(bedTime: string, now = new Date()) {
  const [hour, minute] = bedTime.split(":").map(Number);
  const bed = new Date(now);
  bed.setHours(hour, minute, 0, 0);
  if (bed <= now) bed.setDate(bed.getDate() + 1);
  return bed;
}

function hoursBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / 36e5;
}

function remainingForDrink(drink: Drink, at: Date, halfLife: number) {
  const consumedAt = new Date(drink.time);
  const hoursPassed = hoursBetween(consumedAt, at);
  if (hoursPassed < 0) return 0;
  return drink.mg * Math.pow(0.5, hoursPassed / halfLife);
}

function totalRemaining(drinks: Drink[], at: Date, halfLife: number) {
  return drinks.reduce((sum, drink) => sum + remainingForDrink(drink, at, halfLife), 0);
}

function riskLevel(value: number, threshold: number) {
  if (value <= threshold) return "低";
  if (value <= 80) return "中";
  return "高";
}

function ruleDecisionToSimulationLabel(decision: RuleDecision) {
  if (decision === "full_cup") return "可以饮用";
  if (decision === "half_cup") return "建议改成半杯或低因";
  if (decision === "low_caf") return "建议选择低因";
  return "不建议喝完整一杯";
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

function formatClock(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeFeedback(feedback?: Partial<FeedbackState>): FeedbackState {
  return {
    ...defaultFeedback,
    ...feedback,
    afternoonIntake: feedback?.afternoonIntake ?? "no",
    lessEffective: feedback?.lessEffective ?? "no",
    palpitationToday: feedback?.palpitationToday ?? (feedback?.sideEffect === "palpitation" ? "yes" : "no"),
    anxietyToday: feedback?.anxietyToday ?? (feedback?.sideEffect === "anxiety" ? "yes" : "no"),
  };
}

function hasLessEffectiveFeedback(feedback: FeedbackState) {
  return feedback.lessEffective !== "no";
}

function normalizeSettings(settings?: Partial<SettingsState>): SettingsState {
  const safeSleepResidualMg = settings?.safeSleepResidualMg ?? settings?.safeThreshold ?? defaultSettings.safeSleepResidualMg;
  const personalDailyLimitMg = settings?.personalDailyLimitMg ?? settings?.dailyPersonalLimitMg ?? defaultSettings.personalDailyLimitMg;
  return {
    ...defaultSettings,
    ...settings,
    safeThreshold: safeSleepResidualMg,
    safeSleepResidualMg,
    sensitivityProfile: settings?.sensitivityProfile ?? defaultSettings.sensitivityProfile,
    singleComfortMg: settings?.singleComfortMg ?? defaultSettings.singleComfortMg,
    singleDiscomfortMg: settings?.singleDiscomfortMg ?? defaultSettings.singleDiscomfortMg,
    palpitationTriggerMg: settings?.palpitationTriggerMg ?? defaultSettings.palpitationTriggerMg,
    anxietyTriggerMg: settings?.anxietyTriggerMg ?? defaultSettings.anxietyTriggerMg,
    dailyBaseLimitMg: settings?.dailyBaseLimitMg ?? defaultSettings.dailyBaseLimitMg,
    personalDailyLimitMg,
    dailyPersonalLimitMg: personalDailyLimitMg,
    strictnessMode: settings?.strictnessMode ?? defaultSettings.strictnessMode,
    questionnaireSleepImpact: settings?.questionnaireSleepImpact ?? defaultSettings.questionnaireSleepImpact,
    questionnairePalpitation: settings?.questionnairePalpitation ?? defaultSettings.questionnairePalpitation,
    questionnaireAnxiety: settings?.questionnaireAnxiety ?? defaultSettings.questionnaireAnxiety,
    questionnaireLatteFeeling: settings?.questionnaireLatteFeeling ?? defaultSettings.questionnaireLatteFeeling,
    goodFeedbackCount: settings?.goodFeedbackCount ?? defaultSettings.goodFeedbackCount,
  };
}

function feedbackMemoryToFeedbackState(entry?: FeedbackMemoryEntry, fallback: FeedbackState = defaultFeedback): FeedbackState {
  if (!entry) return fallback;
  const sideEffect: FeedbackState["sideEffect"] = entry.palpitation
    ? "palpitation"
    : entry.anxiety
      ? "anxiety"
      : entry.stomachDiscomfort
        ? "stomach"
        : entry.handTremor
          ? "tremor"
          : "none";
  return {
    ...fallback,
    effect: entry.focusEffect,
    sideEffect,
    sleepQuality: entry.sleepQuality,
    sleepLatency: entry.fallAsleepSpeed === "slow" ? "hard" : entry.fallAsleepSpeed === "normal" ? "slow" : "fast",
    palpitationToday: entry.palpitation ? "yes" : "no",
    anxietyToday: entry.anxiety ? "yes" : "no",
    updatedAt: entry.updatedAt,
  };
}

function feedbackStateToMemoryEntry(
  date: string,
  feedback: FeedbackState,
  feedbackType: FeedbackMemoryEntry["feedbackType"],
  existing?: FeedbackMemoryEntry,
  note = "",
): FeedbackMemoryEntry {
  const now = new Date().toISOString();
  return {
    date,
    feedbackType,
    sleepQuality: feedback.sleepQuality,
    fallAsleepSpeed: feedback.sleepLatency === "hard" ? "slow" : feedback.sleepLatency === "slow" ? "normal" : "fast",
    palpitation: feedback.sideEffect === "palpitation" || feedback.palpitationToday === "yes",
    anxiety: feedback.sideEffect === "anxiety" || feedback.anxietyToday === "yes",
    stomachDiscomfort: feedback.sideEffect === "stomach",
    handTremor: feedback.sideEffect === "tremor",
    focusEffect: feedback.effect,
    note,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function previousDateKey(key: string) {
  return dateKey(new Date(dateFromKey(key).getTime() - 24 * 36e5));
}

function buildAttributedFeedbackMemoryEntries(
  feedbackDate: string,
  entry: Omit<FeedbackMemoryEntry, "date" | "feedbackType" | "createdAt" | "updatedAt">,
  feedbackType: FeedbackMemoryEntry["feedbackType"],
  existingItems: FeedbackMemoryEntry[],
) {
  const now = new Date().toISOString();
  const sleepDate = previousDateKey(feedbackDate);
  const existingSleep = existingItems.find((item) => item.date === sleepDate);
  const existingImmediate = existingItems.find((item) => item.date === feedbackDate);

  const sleepEntry: FeedbackMemoryEntry = {
    date: sleepDate,
    feedbackType,
    sleepQuality: entry.sleepQuality,
    fallAsleepSpeed: entry.fallAsleepSpeed,
    palpitation: existingSleep?.palpitation ?? false,
    anxiety: existingSleep?.anxiety ?? false,
    stomachDiscomfort: existingSleep?.stomachDiscomfort ?? false,
    handTremor: existingSleep?.handTremor ?? false,
    focusEffect: existingSleep?.focusEffect ?? 3,
    note: existingSleep?.note ?? "",
    createdAt: existingSleep?.createdAt ?? now,
    updatedAt: now,
  };

  const immediateEntry: FeedbackMemoryEntry = {
    date: feedbackDate,
    feedbackType,
    sleepQuality: existingImmediate?.sleepQuality ?? "normal",
    fallAsleepSpeed: existingImmediate?.fallAsleepSpeed ?? "normal",
    palpitation: entry.palpitation,
    anxiety: entry.anxiety,
    stomachDiscomfort: entry.stomachDiscomfort,
    handTremor: entry.handTremor,
    focusEffect: entry.focusEffect,
    note: entry.note,
    createdAt: existingImmediate?.createdAt ?? now,
    updatedAt: now,
  };

  return sleepDate === feedbackDate ? [immediateEntry] : [sleepEntry, immediateEntry];
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      drinks?: Drink[];
      settings?: SettingsState;
      feedback?: Partial<FeedbackState>;
      dailyStatusMemory?: DailyStatusMemoryEntry[];
      feedbackMemory?: FeedbackMemoryEntry[];
    };
    return {
      drinks: parsed.drinks ?? defaultDrinks,
      settings: normalizeSettings(parsed.settings),
      feedback: normalizeFeedback(parsed.feedback),
      dailyStatusMemory: parsed.dailyStatusMemory ?? [],
      feedbackMemory: parsed.feedbackMemory ?? [],
    };
  } catch {
    return null;
  }
}

function toleranceFactor(level: ToleranceInsight["level"]) {
  if (level === "high") return 0.8;
  if (level === "medium") return 0.9;
  return 1;
}

function strictnessFactor(mode: SettingsState["strictnessMode"]) {
  if (mode === "strict") return 0.8;
  if (mode === "loose") return 1.1;
  return 1;
}

function profileLabel(profile: SettingsState["sensitivityProfile"]) {
  if (profile === "sleep_sensitive") return "睡眠敏感型";
  if (profile === "body_sensitive") return "身体敏感型";
  if (profile === "high_tolerance") return "提神变弱型";
  return "普通型";
}

function profileThresholds(profile: SettingsState["sensitivityProfile"]) {
  if (profile === "sleep_sensitive") {
    return {
      singleComfortMg: 80,
      singleDiscomfortMg: 150,
      palpitationTriggerMg: 130,
      anxietyTriggerMg: 110,
      safeSleepResidualMg: 20,
      dailyBaseLimitMg: 200,
    };
  }
  if (profile === "body_sensitive") {
    return {
      singleComfortMg: 60,
      singleDiscomfortMg: 100,
      palpitationTriggerMg: 100,
      anxietyTriggerMg: 90,
      safeSleepResidualMg: 20,
      dailyBaseLimitMg: 150,
    };
  }
  if (profile === "high_tolerance") {
    return {
      singleComfortMg: 120,
      singleDiscomfortMg: 220,
      palpitationTriggerMg: 180,
      anxietyTriggerMg: 150,
      safeSleepResidualMg: 30,
      dailyBaseLimitMg: 220,
    };
  }
  return {
    singleComfortMg: 120,
    singleDiscomfortMg: 180,
    palpitationTriggerMg: 150,
    anxietyTriggerMg: 120,
    safeSleepResidualMg: 30,
    dailyBaseLimitMg: 280,
  };
}

function inferProfile(settings: SettingsState): SettingsState["sensitivityProfile"] {
  const sleepScore = settings.questionnaireSleepImpact === "obvious" ? 2 : settings.questionnaireSleepImpact === "slight" ? 1 : 0;
  const bodyScore =
    (settings.questionnairePalpitation === "often" ? 2 : settings.questionnairePalpitation === "sometimes" ? 1 : 0) +
    (settings.questionnaireAnxiety === "often" ? 2 : settings.questionnaireAnxiety === "sometimes" ? 1 : 0) +
    (settings.questionnaireLatteFeeling === "too_much" ? 1 : 0);
  if (bodyScore >= 3) return "body_sensitive";
  if (sleepScore >= 2) return "sleep_sensitive";
  if (settings.questionnaireLatteFeeling === "no_effect") return "high_tolerance";
  return "normal";
}

function applyProfileSettings(settings: SettingsState): SettingsState {
  const sensitivityProfile = inferProfile(settings);
  const thresholds = profileThresholds(sensitivityProfile);
  return {
    ...settings,
    ...thresholds,
    sensitivityProfile,
    safeThreshold: thresholds.safeSleepResidualMg,
    goal:
      settings.questionnaireSleepImpact === "obvious"
        ? "sleep"
        : settings.questionnaireLatteFeeling === "no_effect"
          ? "reduce"
          : settings.goal,
  };
}

function habitsFromSettings(settings: SettingsState): CaffeineHabits {
  return {
    coffeeFeeling: settings.questionnaireLatteFeeling === "no_effect" ? "not_effective" : settings.questionnaireLatteFeeling,
    afternoonSleepImpact: settings.questionnaireSleepImpact,
    discomfortFrequency:
      settings.questionnairePalpitation === "often" || settings.questionnaireAnxiety === "often"
        ? "often"
        : settings.questionnairePalpitation === "sometimes" || settings.questionnaireAnxiety === "sometimes"
          ? "sometimes"
          : "never",
    reminderStrictness: settings.strictnessMode,
  };
}

function deriveCaffeineProfileFromHabits(habits: CaffeineHabits): CaffeineHabitProfile {
  let recommendationFactor = 1;
  let sensitivityLevel: CaffeineHabitProfile["sensitivityLevel"] = "low";
  let toleranceSignal: CaffeineHabitProfile["toleranceSignal"] = "normal";
  let singleCupAdvice: CaffeineHabitProfile["singleCupAdvice"] = "normal";
  let sleepCutoffShiftMinutes = 0;
  let sleepRiskStrictness: CaffeineHabitProfile["sleepRiskStrictness"] = "normal";

  if (habits.coffeeFeeling === "too_much") {
    recommendationFactor -= 0.15;
    singleCupAdvice = "prefer_half";
  }
  if (habits.coffeeFeeling === "not_effective") {
    toleranceSignal = "possible_tolerance";
  }
  if (habits.afternoonSleepImpact === "slight") {
    sleepCutoffShiftMinutes = 60;
  }
  if (habits.afternoonSleepImpact === "obvious") {
    sleepCutoffShiftMinutes = 120;
    sleepRiskStrictness = "strict";
    recommendationFactor -= 0.1;
  }
  if (habits.discomfortFrequency === "sometimes") {
    sensitivityLevel = "medium";
    recommendationFactor -= 0.15;
    if (singleCupAdvice === "normal") singleCupAdvice = "prefer_half";
  }
  if (habits.discomfortFrequency === "often") {
    sensitivityLevel = "high";
    recommendationFactor -= 0.3;
    singleCupAdvice = "prefer_low_caf";
  }
  if (habits.reminderStrictness === "strict") recommendationFactor -= 0.1;
  if (habits.reminderStrictness === "loose") recommendationFactor += 0.05;

  return {
    sensitivityLevel,
    toleranceSignal,
    singleCupAdvice,
    sleepCutoffShiftMinutes,
    recommendationFactor: Math.min(1.05, Math.max(0.45, Number(recommendationFactor.toFixed(2)))),
    sleepRiskStrictness,
  };
}

function applyHabitSettings(settings: SettingsState): SettingsState {
  const habits = habitsFromSettings(settings);
  const profile = deriveCaffeineProfileFromHabits(habits);
  const sensitivityProfile =
    profile.sensitivityLevel === "high"
      ? "body_sensitive"
      : profile.sleepRiskStrictness === "strict"
        ? "sleep_sensitive"
        : profile.toleranceSignal === "possible_tolerance"
          ? "high_tolerance"
          : "normal";
  const thresholds = profileThresholds(sensitivityProfile);
  return {
    ...settings,
    ...thresholds,
    sensitivityProfile,
    safeThreshold: thresholds.safeSleepResidualMg,
  };
}

function nudgeToward(current: number, target: number, maxStep: number) {
  if (target < current) return Math.max(target, current - maxStep);
  return Math.min(target, current + maxStep);
}

function calibrateSettingsFromFeedback(settings: SettingsState, feedback: FeedbackState, latestDoseMg: number, sleepRemaining: number) {
  let next = { ...settings };
  const dose = latestDoseMg || settings.singleComfortMg;
  const goodFeedback =
    feedback.effect >= 4 &&
    feedback.sideEffect === "none" &&
    feedback.palpitationToday === "no" &&
    feedback.anxietyToday === "no" &&
    feedback.sleepQuality !== "bad" &&
    !hasLessEffectiveFeedback(feedback);

  if (feedback.sideEffect === "palpitation" || feedback.palpitationToday === "yes") {
    next.palpitationTriggerMg = nudgeToward(next.palpitationTriggerMg, dose, 15);
    next.singleComfortMg = Math.max(40, next.singleComfortMg - (dose >= next.singleComfortMg ? 20 : 10));
    next.goodFeedbackCount = 0;
    if (next.strictnessMode === "loose") next.strictnessMode = "balanced";
    else next.strictnessMode = "strict";
  } else if (feedback.sideEffect === "anxiety" || feedback.anxietyToday === "yes") {
    next.anxietyTriggerMg = nudgeToward(next.anxietyTriggerMg, dose, 15);
    next.singleComfortMg = Math.max(40, next.singleComfortMg - 10);
    next.goodFeedbackCount = 0;
    if (next.strictnessMode === "loose") next.strictnessMode = "balanced";
  } else if (feedback.sleepQuality === "bad") {
    if (sleepRemaining > next.safeSleepResidualMg) {
      next.safeSleepResidualMg = Math.max(10, next.safeSleepResidualMg - 5);
      next.safeThreshold = next.safeSleepResidualMg;
    }
    next.goodFeedbackCount = 0;
  } else if (hasLessEffectiveFeedback(feedback)) {
    next.goodFeedbackCount = 0;
    if (next.strictnessMode === "loose") next.strictnessMode = "balanced";
  } else if (goodFeedback) {
    const count = Math.min(3, next.goodFeedbackCount + 1);
    next.goodFeedbackCount = count;
    if (count >= 3 && next.strictnessMode === "strict") next.strictnessMode = "balanced";
  } else {
    next.goodFeedbackCount = 0;
  }
  return next;
}

function buildSensitivityInsight(settings: SettingsState, feedback: FeedbackState, sleepRemaining: number): SensitivityInsight {
  let score = 0;
  if (settings.singleDiscomfortMg <= 120) score += 2;
  else if (settings.singleDiscomfortMg <= 160) score += 1;
  if (settings.palpitationTriggerMg <= 120) score += 2;
  else if (settings.palpitationTriggerMg <= 150) score += 1;
  if (settings.anxietyTriggerMg <= 100) score += 2;
  else if (settings.anxietyTriggerMg <= 120) score += 1;
  if (feedback.sideEffect === "palpitation" || feedback.palpitationToday === "yes") score += 3;
  if (feedback.sideEffect === "anxiety" || feedback.anxietyToday === "yes") score += 2;
  if (feedback.sleepQuality === "bad" && sleepRemaining <= settings.safeSleepResidualMg * 1.3) score += 1;

  if (score >= 4) {
    return {
      level: "high",
      label: "高敏感",
      coefficient: 0.6,
      text: "你对咖啡因反应偏敏感，系统会更保守地控制单次剂量和每日上限。",
    };
  }
  if (score >= 2) {
    return {
      level: "medium",
      label: "中敏感",
      coefficient: 0.8,
      text: "你有一定敏感表现，建议把完整杯改成小杯或半杯更稳。",
    };
  }
  return {
    level: "low",
    label: "低敏感",
    coefficient: 1,
    text: "目前敏感反馈不明显，系统会按常规节奏推荐。",
  };
}

function buildSensitivityExplanation({
  drinks,
  dailyStatusMemory,
  feedbackMemory,
  settings,
  feedback,
  sensitivity,
}: {
  drinks: Drink[];
  dailyStatusMemory: DailyStatusMemoryEntry[];
  feedbackMemory: FeedbackMemoryEntry[];
  settings: SettingsState;
  feedback: FeedbackState;
  sensitivity: SensitivityInsight;
}): SensitivityExplanation {
  const recentKeys = new Set(recentDateKeys(7));
  const recentStatuses = dailyStatusMemory.filter((item) => recentKeys.has(item.date));
  const recentFeedback = feedbackMemory.filter((item) => recentKeys.has(item.date));
  const recentDrinks = drinks.filter((drink) => recentKeys.has(dateKey(new Date(drink.time))));
  const totalMg = recentDrinks.reduce((sum, drink) => sum + drink.mg, 0);
  const averageMg = Math.round(totalMg / 7);
  const lateDays = recentStatuses.filter((item) => item.hasEveningIntake).length;
  const highResidualDays = recentStatuses.filter((item) => item.sleepRiskLevel === "高" || item.bedtimeResidualMg > settings.safeSleepResidualMg).length;
  const sleepAffectedCount = recentFeedback.filter((item) => item.sleepQuality === "bad" || item.fallAsleepSpeed === "slow").length;
  const discomfortCount =
    recentFeedback.filter((item) => item.palpitation || item.anxiety || item.handTremor || item.stomachDiscomfort).length +
    (feedback.sideEffect !== "none" || feedback.palpitationToday === "yes" || feedback.anxietyToday === "yes" ? 1 : 0);
  const toleranceSignal = settings.sensitivityProfile === "high_tolerance" || hasLessEffectiveFeedback(feedback);
  const statusLabel: SensitivityExplanation["statusLabel"] =
    sensitivity.level === "high" || discomfortCount >= 2 || settings.sensitivityProfile === "body_sensitive"
      ? "偏敏感"
      : toleranceSignal
        ? "偏耐受"
        : "正常";

  const reasons: string[] = [];
  if (settings.sensitivityProfile === "body_sensitive") reasons.push("你的习惯设置里显示，喝咖啡后更容易出现心慌或紧张，因此系统会更保守。");
  if (settings.sensitivityProfile === "sleep_sensitive") reasons.push("你的习惯设置里显示，下午咖啡更容易影响睡眠，因此晚间摄入提醒会提前。");
  if (settings.sensitivityProfile === "high_tolerance") reasons.push("你反馈一杯咖啡可能没什么感觉，系统会记录为提神效果变弱信号，但不会直接建议加量。");
  if (highResidualDays > 0) reasons.push(`最近 7 天有 ${highResidualDays} 天睡前残留高于更安心的目标，晚些时候喝咖啡可能让风险偏高。`);
  if (lateDays > 0) reasons.push(`最近 7 天有 ${lateDays} 天存在晚间摄入，最后一杯时间会影响睡前残留。`);
  if (sleepAffectedCount > 0) reasons.push(`最近反馈里有 ${sleepAffectedCount} 次睡眠受影响记录，系统会把睡眠风险判断调得更谨慎。`);
  if (discomfortCount > 0) reasons.push(`最近有 ${discomfortCount} 次心慌、焦虑、手抖或胃部不适相关反馈，单杯建议会更倾向小剂量。`);
  if (reasons.length === 0) reasons.push("最近记录里没有明显不适或睡眠受影响信号，系统暂时按常规节奏判断。");

  const suggestions: string[] =
    statusLabel === "偏敏感"
      ? ["优先把最后一杯提前到下午较早时间。", "想喝时可以先选择半杯、小杯或低因。", "如果连续出现不舒服反馈，可以在设置里把提醒调严格一点。"]
      : statusLabel === "偏耐受"
        ? ["不要因为提神感变弱就直接加量。", "可以连续几天降低下午摄入，观察提神效果是否恢复。", "继续记录真实感受，系统会根据反馈辅助校准。"]
        : ["继续保持当前节奏。", "如果某天睡不好或有不舒服，可以补充反馈帮助后续判断。", "当前敏感度不是固定标签，会随记录和反馈逐步调整。"];

  return {
    statusLabel,
    summary:
      statusLabel === "偏敏感"
        ? "根据你的近期记录和反馈，系统会倾向更保守地提醒咖啡因摄入。"
        : statusLabel === "偏耐受"
          ? "根据你的反馈，系统会关注提神效果是否变弱，但不会直接鼓励提高剂量。"
          : "目前没有明显偏敏感或偏耐受信号，系统会按当前习惯保持平衡建议。",
    reasons,
    evidence: [
      { label: "近 7 天摄入", value: `${totalMg}mg`, helper: `日均约 ${averageMg}mg` },
      { label: "晚间摄入", value: `${lateDays}天`, helper: "影响最后一杯建议时间" },
      { label: "睡前残留偏高", value: `${highResidualDays}天`, helper: `目标 ${settings.safeSleepResidualMg}mg` },
      { label: "睡眠受影响反馈", value: `${sleepAffectedCount}次`, helper: "来自状态日历和今日反馈" },
      { label: "即时不适反馈", value: `${discomfortCount}次`, helper: "心慌、焦虑、手抖或胃不舒服" },
      { label: "半衰期估算", value: `${halfLives[settings.metabolism]}h`, helper: profileLabel(settings.sensitivityProfile) },
      { label: "计划睡觉", value: settings.bedTime, helper: "用于估算睡前残留" },
      { label: "提醒策略", value: settings.strictnessMode === "strict" ? "严格" : settings.strictnessMode === "loose" ? "宽松" : "平衡", helper: "可在设置中调整" },
    ],
    suggestions,
  };
}

function buildToleranceInsight(drinks: Drink[], feedback: FeedbackState): ToleranceInsight {
  const now = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = getDayStart(new Date(now.getTime() - (6 - index) * 24 * 36e5));
    const next = new Date(date.getTime() + 24 * 36e5);
    const mg = drinks
      .filter((drink) => {
        const time = new Date(drink.time);
        return time >= date && time < next;
      })
      .reduce((sum, drink) => sum + drink.mg, 0);
    return {
      day: index === 6 ? "今天" : `${date.getMonth() + 1}/${date.getDate()}`,
      mg,
      score: index === 6 ? feedback.effect : null,
    };
  });
  const recordedDays = days.filter((day) => day.mg > 0).length;
  const total = days.reduce((sum, day) => sum + day.mg, 0);
  const dailyAvg = Math.round(total / 7);
  const avgEffect = feedback.effect;
  const firstHalf = days.slice(0, 3).reduce((sum, day) => sum + day.mg, 0) / 3;
  const secondHalf = days.slice(4).reduce((sum, day) => sum + day.mg, 0) / 3;

  if (recordedDays < 2) {
    return {
      level: "unknown",
      label: "数据不足",
      dailyAvg,
      avgEffect,
      trend: "数据不足",
      chartData: days,
      text: "继续记录几天后，我会判断提神效果有没有变弱。",
    };
  }

  const high = (dailyAvg > 250 && avgEffect < 3) || feedback.lessEffective === "yes";
  const medium = dailyAvg >= 150 || avgEffect === 3 || secondHalf - firstHalf > 50;
  const low = dailyAvg < 150 && avgEffect >= 4;
  const recovering = feedback.afternoonIntake === "no" && dailyAvg < 180 && feedback.sleepQuality !== "bad";
  const trend =
    recovering ? "正在恢复" : high ? "明显升高" : secondHalf - firstHalf > 35 || hasLessEffectiveFeedback(feedback) ? "轻微升高" : "稳定";

  if (high) {
    return {
      level: "high",
      label: "提神变弱明显",
      dailyAvg,
      avgEffect,
      trend,
      chartData: days,
      text: "最近可能有越喝越没感觉的迹象。建议未来 3 天减少下午摄入。",
    };
  }
  if (medium && !low) {
    return {
      level: "medium",
      label: "提神略有变化",
      dailyAvg,
      avgEffect,
      trend,
      chartData: days,
      text: "提神效果有一点变化。可以保留上午咖啡，把下午摄入改成小剂量或低因。",
    };
  }
  return {
    level: "low",
    label: "提神反馈稳定",
    dailyAvg,
    avgEffect,
    trend,
    chartData: days,
    text: "最近提神反馈比较稳定，继续保持当前节奏即可。",
  };
}

function buildSevenDayInsight(drinks: Drink[], settings: SettingsState, recommended: number, threshold: number): SevenDayInsight {
  const now = new Date();
  const halfLife = halfLives[settings.metabolism];
  const chartData = Array.from({ length: 7 }, (_, index) => {
    const dayStart = getDayStart(new Date(now.getTime() - (6 - index) * 24 * 36e5));
    const dayEnd = new Date(dayStart.getTime() + 24 * 36e5);
    const [bedHour, bedMinute] = settings.bedTime.split(":").map(Number);
    const bedAt = new Date(dayStart);
    bedAt.setHours(bedHour, bedMinute, 0, 0);
    if (bedAt <= dayStart) bedAt.setDate(bedAt.getDate() + 1);
    const dayDrinks = drinks.filter((drink) => {
      const time = new Date(drink.time);
      return time >= dayStart && time < dayEnd;
    });
    const mg = dayDrinks.reduce((sum, drink) => sum + drink.mg, 0);
    const late = dayDrinks.some((drink) => new Date(drink.time).getHours() >= 15) ? 1 : 0;
    const sleepResidual = Math.round(totalRemaining(dayDrinks, bedAt, halfLife));
    return {
      day: index === 6 ? "今天" : `${dayStart.getMonth() + 1}/${dayStart.getDate()}`,
      mg,
      sleepResidual,
      late,
      overTarget: mg > recommended,
      highSleepRisk: sleepResidual > threshold,
    };
  });
  const totalMg = chartData.reduce((sum, day) => sum + day.mg, 0);
  const sleepResidualTotal = chartData.reduce((sum, day) => sum + day.sleepResidual, 0);
  return {
    chartData,
    totalMg,
    dailyAvg: Math.round(totalMg / 7),
    lateIntakeDays: chartData.filter((day) => day.late).length,
    overTargetDays: chartData.filter((day) => day.overTarget).length,
    highSleepRiskDays: chartData.filter((day) => day.highSleepRisk).length,
    sleepResidualAvg: Math.round(sleepResidualTotal / 7),
  };
}

function getBedDateForDay(settings: SettingsState, key: string) {
  const [hour, minute] = settings.bedTime.split(":").map(Number);
  const bedAt = dateFromKey(key);
  bedAt.setHours(hour, minute, 0, 0);
  return bedAt;
}

function safeDrinkDeadlineForDay(settings: SettingsState, halfLife: number, key: string) {
  const bed = getBedDateForDay(settings, key);
  const typicalCup = settings.goal === "reduce" ? 60 : 120;
  const threshold = Math.max(settings.safeSleepResidualMg, 10);
  const neededHours = Math.max(2, halfLife * Math.log2(typicalCup / threshold));
  return new Date(bed.getTime() - neededHours * 36e5);
}

function recommendedForStatus(settings: SettingsState, feedback: FeedbackState, sleepRemaining: number) {
  const sensitivity = buildSensitivityInsight(settings, feedback, sleepRemaining);
  const habitProfile = deriveCaffeineProfileFromHabits(habitsFromSettings(settings));
  const rawRecommended = Math.round(
    settings.dailyBaseLimitMg *
      metabolismFactors[settings.metabolism] *
      sensitivity.coefficient *
      sleepFactors[feedback.sleepQuality] *
      goalFactors[settings.goal] *
      feedbackFactor(feedback) *
      habitProfile.recommendationFactor,
  );
  return settings.personalDailyLimitMg > 0 ? Math.min(rawRecommended, settings.personalDailyLimitMg) : rawRecommended;
}

function buildDailyStatusMemoryEntry(
  key: string,
  drinks: Drink[],
  settings: SettingsState,
  feedbackMemory: FeedbackMemoryEntry[],
  currentFeedback: FeedbackState,
): DailyStatusMemoryEntry {
  const start = dateFromKey(key);
  const end = new Date(start.getTime() + 24 * 36e5);
  const dayDrinks = drinks.filter((drink) => {
    const time = new Date(drink.time);
    return time >= start && time < end;
  });
  const feedbackEntry = feedbackMemory.find((item) => item.date === key);
  const memoryFeedbackForDay = feedbackMemoryToFeedbackState(feedbackEntry, defaultFeedback);
  const feedbackForDay = isTodayKey(key) ? { ...memoryFeedbackForDay, ...currentFeedback } : memoryFeedbackForDay;
  const halfLife = halfLives[settings.metabolism];
  const totalCaffeineMg = dayDrinks.reduce((sum, drink) => sum + drink.mg, 0);
  const bedAt = getBedDateForDay(settings, key);
  const bedtimeResidualMg = Math.round(totalRemaining(dayDrinks, bedAt, halfLife));
  const adjustedThreshold =
    feedbackForDay.sleepLatency === "hard" || feedbackForDay.afternoonIntake === "yes"
      ? Math.max(15, settings.safeSleepResidualMg - 5)
      : settings.safeSleepResidualMg;
  const sleepRiskLevel = riskLevel(bedtimeResidualMg, adjustedThreshold);
  const recommended = recommendedForStatus(settings, feedbackForDay, bedtimeResidualMg);
  const lastDrink = latestDrink(dayDrinks);
  const deadline = safeDrinkDeadlineForDay(settings, halfLife, key);
  const hasEveningIntake = dayDrinks.some((drink) => new Date(drink.time) > deadline);
  const bean = beanState({
    todayTotal: totalCaffeineMg,
    recommended,
    sleepRemaining: bedtimeResidualMg,
    sleepRisk: sleepRiskLevel,
    settings,
    feedback: feedbackForDay,
    latestDoseMg: lastDrink?.mg ?? 0,
  });
  return {
    date: key,
    totalCaffeineMg,
    recordCount: dayDrinks.length,
    latestIntakeTime: lastDrink?.time,
    bedtimeResidualMg,
    sleepRiskLevel,
    exceededDailyTarget: totalCaffeineMg > recommended,
    hasEveningIntake,
    beanStatus: bean.name,
    summaryText: conclusionText({
      todayTotal: totalCaffeineMg,
      recommended,
      canDrink: Math.max(0, recommended - totalCaffeineMg),
      sleepRemaining: bedtimeResidualMg,
      risk: sleepRiskLevel,
      settings,
      feedback: feedbackForDay,
    }).replace(/^今天建议：/, ""),
    hasFeedback: Boolean(feedbackEntry),
  };
}

function buildDailyStatusMemory(
  drinks: Drink[],
  settings: SettingsState,
  feedbackMemory: FeedbackMemoryEntry[],
  currentFeedback: FeedbackState,
  count = 14,
) {
  return recentDateKeys(count).map((key) => buildDailyStatusMemoryEntry(key, drinks, settings, feedbackMemory, currentFeedback));
}

function statusForCurrent(current: number, recommended: number) {
  if (current > recommended * 0.55) return "偏高";
  if (current > 55) return "仍在代谢中";
  return "负荷适中";
}

function latestDrink(drinks: Drink[]) {
  if (!drinks.length) return null;
  return drinks.reduce((latest, drink) => (new Date(drink.time) > new Date(latest.time) ? drink : latest), drinks[0]);
}

function safeDrinkDeadline(settings: SettingsState, halfLife: number) {
  const bed = getBedDate(settings.bedTime);
  const typicalCup = settings.goal === "reduce" ? 60 : 120;
  const threshold = Math.max(settings.safeSleepResidualMg, 10);
  const neededHours = Math.max(2, halfLife * Math.log2(typicalCup / threshold));
  return new Date(bed.getTime() - neededHours * 36e5);
}

function userReportedSymptom(feedback: FeedbackState) {
  const palpitation = feedback.sideEffect === "palpitation" || feedback.palpitationToday === "yes";
  const anxiety = feedback.sideEffect === "anxiety" || feedback.anxietyToday === "yes";
  const discomfort = feedback.sideEffect === "stomach" || feedback.sideEffect === "tremor";
  return {
    palpitation,
    anxiety,
    discomfort,
    any: palpitation || anxiety || discomfort,
  };
}

function predictedRisk(args: {
  todayTotal: number;
  recommended: number;
  sleepRemaining: number;
  sleepRisk: string;
  settings: SettingsState;
  latestDoseMg?: number;
}) {
  const { todayTotal, recommended, sleepRemaining, sleepRisk, settings, latestDoseMg = 0 } = args;
  const overPersonalLimit = settings.personalDailyLimitMg > 0 && todayTotal > settings.personalDailyLimitMg;
  return {
    highSleepRisk: sleepRemaining > settings.safeSleepResidualMg || sleepRisk === "高",
    overRecommended: todayTotal > recommended,
    overPersonalLimit,
    highSingleDose: latestDoseMg >= settings.palpitationTriggerMg || latestDoseMg >= settings.anxietyTriggerMg,
    any:
      sleepRemaining > settings.safeSleepResidualMg ||
      sleepRisk === "高" ||
      todayTotal > recommended ||
      overPersonalLimit ||
      latestDoseMg >= settings.palpitationTriggerMg ||
      latestDoseMg >= settings.anxietyTriggerMg,
  };
}

function beanState({
  todayTotal,
  recommended,
  sleepRemaining,
  sleepRisk,
  settings,
  feedback,
  latestDoseMg = 0,
}: {
  todayTotal: number;
  recommended: number;
  sleepRemaining: number;
  sleepRisk: string;
  settings: SettingsState;
  feedback: FeedbackState;
  latestDoseMg?: number;
}): Bean {
  const reported = userReportedSymptom(feedback);
  const predicted = predictedRisk({ todayTotal, recommended, sleepRemaining, sleepRisk, settings, latestDoseMg });

  if (reported.any) {
    return {
      name: "焦虑豆",
      status: "anxious",
      tone: "bg-[#ffe7df]",
      chip: "text-[#cb694f] bg-white/65",
      color: "#DD7A61",
      text: "你反馈了不舒服，今天咖啡因建议先到这里。",
    };
  }

  if (predicted.any) {
    if (settings.goal === "reduce" || (todayTotal >= recommended && sleepRemaining <= settings.safeSleepResidualMg * 1.6)) {
      return {
        name: "恢复豆",
        status: "sleep_safe",
        tone: "bg-[#eaf1df]",
        chip: "text-[#648b50] bg-white/70",
        color: "#82A56B",
        text: "现在更适合进入恢复状态，今晚先不继续摄入。",
      };
    }
    return {
      name: "焦虑豆",
      status: "anxious",
      tone: "bg-[#e9f2df]",
      chip: "text-[#c66a4e] bg-white/65",
      color: "#D97D5D",
      text: predicted.highSleepRisk
        ? "睡前残留预计偏高，今天建议先停止摄入咖啡因。"
        : "咖啡因负荷偏高，今晚睡眠受影响风险较高，建议暂停摄入。",
    };
  }
  if (sleepRisk === "中" || todayTotal >= recommended * 0.75) {
    return {
      name: "纠结豆",
      status: "stable",
      tone: "bg-[#fff0df]",
      chip: "text-caramel bg-white/70",
      color: "#B5793E",
      text: "还能喝，但建议控制分量，优先半杯或小杯。",
    };
  }
  if (todayTotal > recommended * 0.5 || sleepRemaining > settings.safeSleepResidualMg * 0.75) {
    return {
      name: "低因豆",
      status: "growth",
      tone: "bg-[#eef4e8]",
      chip: "text-[#648b50] bg-white/70",
      color: "#86A96F",
      text: "如果确实需要提神，建议选择低因、半杯或小杯。",
    };
  }
  if (
    todayTotal <= recommended &&
    sleepRemaining <= settings.safeSleepResidualMg &&
    feedback.effect >= 4 &&
    feedback.sideEffect === "none" &&
    feedback.palpitationToday === "no" &&
    feedback.anxietyToday === "no"
  ) {
    return {
      name: "清醒豆",
      status: "happy",
      tone: "bg-[#eaf5e2]",
      chip: "text-[#648b50] bg-white/70",
      color: "#86A96F",
      text: "今天状态比较稳定，可以正常安排咖啡因摄入。",
    };
  }
  return {
    name: "清醒豆",
    status: "stable",
    tone: "bg-[#edf1df]",
    chip: "text-[#7a704b] bg-white/70",
    color: "#9AA36B",
    text: "当前节奏稳定，继续保持就好。",
  };
}

function buildAuxTags(args: {
  todayTotal: number;
  recommended: number;
  sleepRemaining: number;
  risk: string;
  settings: SettingsState;
  feedback: FeedbackState;
  sensitivity: SensitivityInsight;
  tolerance: ToleranceInsight;
  latestDrink: Drink | null;
}) {
  const { todayTotal, recommended, sleepRemaining, risk, settings, feedback, sensitivity, tolerance, latestDrink } = args;
  const tags: string[] = [];
  const reported = userReportedSymptom(feedback);
  if (sleepRemaining <= settings.safeSleepResidualMg && risk === "低") tags.push("睡眠低风险");
  if (sleepRemaining > settings.safeSleepResidualMg || risk === "高") tags.push("睡眠高风险");
  if (latestDrink && new Date(latestDrink.time) > safeDrinkDeadline(settings, halfLives[settings.metabolism])) tags.push("晚间摄入");
  if (todayTotal > recommended) tags.push("已超推荐量");
  if (reported.palpitation) tags.push("用户反馈心慌");
  if (reported.anxiety) tags.push("用户反馈焦虑");
  if (reported.discomfort) tags.push("用户反馈不适");
  if (sensitivity.level === "high") tags.push("高敏感");
  if (tolerance.level === "high" || tolerance.trend === "轻微升高" || tolerance.trend === "明显升高") tags.push("提神变弱");
  if (settings.goal === "reduce") tags.push("减量中");
  if (todayTotal <= recommended * 0.8 && risk === "低") tags.push("挑战完成");
  if (feedback.afternoonIntake === "yes" && !tags.includes("晚间摄入")) tags.push("晚间摄入");
  return Array.from(new Set(tags)).slice(0, 6);
}

function conclusionText(args: {
  todayTotal: number;
  recommended: number;
  canDrink: number;
  sleepRemaining: number;
  risk: string;
  settings: SettingsState;
  feedback: FeedbackState;
}) {
  const { todayTotal, recommended, canDrink, sleepRemaining, risk, settings, feedback } = args;
  if (userReportedSymptom(feedback).any) return "今天建议：你反馈了心慌或不适，先暂停咖啡因摄入";
  if (settings.goal === "reduce") return "今天建议：以恢复为主，控制摄入并优先选择低因";
  if (todayTotal >= recommended || risk === "高" || sleepRemaining > 80) return "今天建议：咖啡因负荷偏高，建议停止摄入";
  if (risk === "中" || canDrink < 120) return "今天建议：还可以少量摄入，建议不超过半杯拿铁";
  if (settings.goal === "sleep" || feedback.sleepLatency !== "fast") return "今天建议：下午后尽量不再喝完整一杯咖啡";
  return "今天建议：当前状态平稳，可以继续保持";
}

function basisText(settings: SettingsState, feedback: FeedbackState) {
  const metabolism = settings.metabolism === "fast" ? "快代谢" : settings.metabolism === "slow" ? "慢代谢" : "普通代谢";
  const sleep = feedback.sleepQuality === "good" ? "睡眠好" : feedback.sleepQuality === "bad" ? "睡眠差" : "睡眠一般";
  return `基于你的${metabolism}速度、${settings.bedTime} 睡觉时间和最近${sleep}反馈计算。`;
}

function feedbackImpact(feedback: FeedbackState) {
  const reported = userReportedSymptom(feedback);
  if (reported.palpitation) return "你反馈有心慌或心悸，系统会适当降低推荐摄入量。";
  if (reported.anxiety) return "你反馈有焦虑，系统会更谨慎地判断单次摄入量。";
  if (reported.discomfort) return "你反馈有手抖或胃不舒服，系统会更保守地判断单次摄入量。";
  if (feedback.sleepLatency !== "fast" || feedback.afternoonIntake === "yes") return "你反馈入睡变慢或下午后仍摄入，系统会更谨慎地提示最晚饮用时间。";
  if (hasLessEffectiveFeedback(feedback)) return "你反馈提神效果变弱，系统会更谨慎地安排后续推荐量。";
  if (feedback.effect >= 4 && feedback.sleepQuality === "good") return "提神反馈较好且睡眠稳定，系统会维持当前推荐策略。";
  return "系统会把这次感受纳入后续推荐量。";
}

function feedbackFactor(feedback: FeedbackState) {
  let factor = 1;
  const reported = userReportedSymptom(feedback);
  if (hasLessEffectiveFeedback(feedback)) factor *= feedback.lessEffective === "yes" ? 0.92 : 0.96;
  if (reported.palpitation) factor *= 0.82;
  else if (reported.anxiety || reported.discomfort) factor *= 0.88;
  if (feedback.sleepLatency === "hard") factor *= 0.88;
  else if (feedback.sleepLatency === "slow") factor *= 0.95;
  return factor;
}

function recommendationPreview(settings: SettingsState, feedback: FeedbackState, sensitivity: SensitivityInsight) {
  const habitProfile = deriveCaffeineProfileFromHabits(habitsFromSettings(settings));
  const raw = Math.round(
    settings.dailyBaseLimitMg *
      metabolismFactors[settings.metabolism] *
      sensitivity.coefficient *
      sleepFactors[feedback.sleepQuality] *
      goalFactors[settings.goal] *
      feedbackFactor(feedback) *
      habitProfile.recommendationFactor,
  );
  return settings.personalDailyLimitMg > 0 ? Math.min(raw, settings.personalDailyLimitMg) : raw;
}

function groupRecords(drinks: Drink[]) {
  const now = getDayStart(new Date());
  const yesterday = new Date(now.getTime() - 24 * 36e5);
  return {
    今天: drinks.filter((drink) => new Date(drink.time) >= now),
    昨天: drinks.filter((drink) => new Date(drink.time) >= yesterday && new Date(drink.time) < now),
    更早: drinks.filter((drink) => new Date(drink.time) < yesterday),
  };
}

function draftFromDrinkItem(drink: DrinkItem, time = toInputDateTime(new Date())): DrinkDraft {
  return {
    name: drink.displayName,
    type: drinkTypeLabel(drink.category),
    mg: drink.caffeineMg,
    time,
    note: "",
    drinkItemId: drink.id,
    brand: drink.brand,
    category: drink.category,
    displayName: drink.displayName,
    volumeMl: drink.volumeMl,
    sizeLabel: drink.sizeLabel,
    sourceType: drink.sourceType,
    confidence: drink.confidence,
    isDecaf: drink.isDecaf,
  };
}

function simulationFromDrinkItem(drink: DrinkItem): SimulationDraft {
  const draft = draftFromDrinkItem(drink);
  return {
    name: draft.name,
    type: draft.type,
    mg: draft.mg,
    drinkItemId: draft.drinkItemId,
    brand: draft.brand,
    category: draft.category,
    displayName: draft.displayName,
    volumeMl: draft.volumeMl,
    sizeLabel: draft.sizeLabel,
    sourceType: draft.sourceType,
    confidence: draft.confidence,
    isDecaf: draft.isDecaf,
  };
}

function recordFromDraft(draft: DrinkDraft): Drink {
  return {
    id: crypto.randomUUID(),
    name: draft.name,
    type: draft.type,
    mg: Number(draft.mg) || 0,
    time: fromInputDateTime(draft.time),
    note: draft.note,
    drinkItemId: draft.drinkItemId,
    brand: draft.brand,
    category: draft.category,
    displayName: draft.displayName,
    volumeMl: draft.volumeMl,
    sizeLabel: draft.sizeLabel,
    sourceType: draft.sourceType,
    confidence: draft.confidence,
    isDecaf: draft.isDecaf,
  };
}

function frequentSourceFromDraft(draft: DrinkDraft): FrequentDrinkSource {
  return {
    drinkId: draft.drinkItemId,
    name: draft.name,
    brand: draft.brand,
    size: draft.sizeLabel,
    caffeineMg: Number(draft.mg) || 0,
    category: draft.category,
    sourceType: draft.sourceType,
    confidence: draft.confidence,
    isDecaf: draft.isDecaf,
  };
}

function frequentSourceFromDrink(drink: Drink): FrequentDrinkSource {
  return {
    drinkId: drink.drinkItemId,
    name: drink.displayName || drink.name,
    brand: drink.brand,
    size: drink.sizeLabel,
    caffeineMg: Number(drink.mg) || 0,
    category: drink.category,
    sourceType: drink.sourceType,
    confidence: drink.confidence,
    isDecaf: drink.isDecaf,
    usedAt: drink.time,
  };
}

function recordFromFrequentDrink(memory: FrequentDrinkMemory): Drink {
  return {
    id: crypto.randomUUID(),
    name: memory.name,
    type: drinkTypeLabel(memory.category),
    mg: Number(memory.caffeineMg) || 0,
    time: new Date().toISOString(),
    note: "常喝饮品快捷记录",
    drinkItemId: memory.drinkId,
    brand: memory.brand,
    category: memory.category,
    displayName: memory.name,
    sizeLabel: memory.size,
    sourceType: memory.sourceType,
    confidence: memory.confidence,
    isDecaf: memory.isDecaf,
  };
}

function App() {
  const initial = loadState();
  const [drinks, setDrinks] = useState<Drink[]>(initial?.drinks ?? defaultDrinks);
  const [libraryDrinks, setLibraryDrinks] = useState<DrinkItem[]>(() => getAllDrinks());
  const [settings, setSettings] = useState<SettingsState>(initial?.settings ?? defaultSettings);
  const [feedback, setFeedback] = useState<FeedbackState>(initial?.feedback ?? defaultFeedback);
  const [dailyStatusMemory, setDailyStatusMemory] = useState<DailyStatusMemoryEntry[]>(initial?.dailyStatusMemory ?? []);
  const [feedbackMemory, setFeedbackMemory] = useState<FeedbackMemoryEntry[]>(initial?.feedbackMemory ?? []);
  const [recordOpen, setRecordOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [statusCalendarOpen, setStatusCalendarOpen] = useState(false);
  const [selectedStatusDate, setSelectedStatusDate] = useState(() => dateKey(new Date()));
  const [toastBean, setToastBean] = useState<{ bean: Bean; text: string } | null>(null);
  const [frequentMemoryRevision, setFrequentMemoryRevision] = useState(0);
  const [noMatchMemoryRevision, setNoMatchMemoryRevision] = useState(0);
  const [mainTab, setMainTab] = useState<MainTab>("today");
  const [insightTab, setInsightTab] = useState<"metabolism" | "tolerance" | "sleep">("metabolism");
  const [ocrState, setOcrState] = useState<OcrState>({ loading: false, matches: [], selectedIndex: 0, editing: false, manualMg: 0 });
  const initialRecordDrink = libraryDrinks.find((drink) => drink.name.includes("美式")) ?? libraryDrinks[0];
  const initialSimDrink = libraryDrinks.find((drink) => drink.name.includes("拿铁")) ?? initialRecordDrink;
  const [recordDraft, setRecordDraft] = useState<DrinkDraft>(() =>
    initialRecordDrink ? draftFromDrinkItem(initialRecordDrink) : { name: "美式", type: "咖啡", mg: 150, time: toInputDateTime(new Date()), note: "" },
  );
  const [simulation, setSimulation] = useState<SimulationDraft>(() =>
    initialSimDrink ? simulationFromDrinkItem(initialSimDrink) : { name: "拿铁", type: "咖啡", mg: 120 },
  );
  const [homeAgentAdvice, setHomeAgentAdvice] = useState<AgentLoopResponse | null>(null);
  const [homeAgentLoading, setHomeAgentLoading] = useState(false);
  const [simAgentAdvice, setSimAgentAdvice] = useState<AgentLoopResponse | null>(null);
  const [simAgentLoading, setSimAgentLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ drinks, settings, feedback, dailyStatusMemory, feedbackMemory }));
  }, [drinks, settings, feedback, dailyStatusMemory, feedbackMemory]);

  useEffect(() => {
    const next = buildDailyStatusMemory(drinks, settings, feedbackMemory, feedback);
    setDailyStatusMemory((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, [drinks, settings, feedbackMemory, feedback]);

  useEffect(() => {
    if (!toastBean) return;
    const timer = window.setTimeout(() => setToastBean(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toastBean]);

  useEffect(() => {
    if (!simOpen || !simulation.name.trim()) return;
    let active = true;
    setSimAgentLoading(true);
    void agentLoop(`如果我现在喝一杯${simulation.name}会怎样？`, { currentTime: new Date().toISOString(), maxToolCalls: 5 })
      .then((response) => {
        if (active) setSimAgentAdvice(response);
      })
      .finally(() => {
        if (active) setSimAgentLoading(false);
      });
    return () => {
      active = false;
    };
  }, [simOpen, simulation.name, simulation.drinkItemId, simulation.mg]);

  const { emitAdviceRefresh } = useAdviceRefresh({
    watch: [drinks, settings, feedback],
    refreshTodayAdvice: () => runHomeAgentAdvice("今晚还能喝咖啡吗？"),
    refreshCurrentCaffeineStatus: () => undefined,
    refreshRecentRecords: () => undefined,
    refreshInsightStats: () => undefined,
  });

  const setSettingsWithRefresh: React.Dispatch<React.SetStateAction<SettingsState>> = (action) => {
    setSettings(action);
    emitAdviceRefresh("settings_updated");
  };

  const frequentDrinks = useMemo(
    () => buildFrequentDrinkMemory(drinks.map(frequentSourceFromDrink), 6),
    [drinks, frequentMemoryRevision],
  );
  const pendingNoMatchDrinks = useMemo(
    () => getPendingNoMatchDrinkMemory(5),
    [noMatchMemoryRevision, libraryDrinks.length],
  );

  const tolerance = useMemo(() => buildToleranceInsight(drinks, feedback), [drinks, feedback]);

  const derived = useMemo(() => {
    const now = new Date();
    const todayDrinks = drinks.filter((drink) => isSameDay(drink.time, now));
    const snapshot = calculateRuleDecisionSnapshot({
      records: drinks,
      settings,
      feedback,
      currentTime: now.toISOString(),
    });
    const todayTotal = snapshot.todayTotalMg;
    const halfLife = snapshot.halfLifeHours;
    const current = snapshot.currentRemainingMg;
    const bedDate = getBedDate(settings.bedTime, now);
    const sleepRemaining = snapshot.estimatedSleepResidualMg;
    const sensitivity = buildSensitivityInsight(settings, feedback, sleepRemaining);
    const recommended = snapshot.targetIntakeMg;
    const canDrink = snapshot.canDrinkMg;
    const adjustedThreshold = snapshot.adjustedSleepResidualMg;
    const risk = snapshot.sleepRisk;
    const chartData = Array.from({ length: 25 }, (_, index) => {
      const at = new Date(now.getTime() + index * 36e5);
      return {
        hour: index,
        label: `${pad(at.getHours())}:00`,
        mg: Math.round(totalRemaining(drinks, at, halfLife)),
      };
    });
    const sleepHour = Math.max(0, Math.min(24, Math.round(hoursBetween(now, bedDate))));
    const lastDrink = latestDrink(todayDrinks);
    const deadline = safeDrinkDeadline(settings, halfLife);
    const bean = beanState({ todayTotal, recommended, sleepRemaining, sleepRisk: risk, settings, feedback, latestDoseMg: lastDrink?.mg ?? 0 });
    const sevenDayInsight = buildSevenDayInsight(drinks, settings, recommended, adjustedThreshold);
    const auxTags = buildAuxTags({
      todayTotal,
      recommended,
      sleepRemaining,
      risk,
      settings,
      feedback,
      sensitivity,
      tolerance,
      latestDrink: lastDrink,
    });

    return {
      now,
      todayDrinks,
      todayTotal,
      halfLife,
      current: Math.round(current),
      currentStatus: statusForCurrent(current, recommended),
      sleepRemaining: Math.round(sleepRemaining),
      recommended,
      canDrink,
      risk,
      adjustedThreshold,
      chartData,
      sleepHour,
      bean,
      auxTags,
      sensitivity,
      sevenDayInsight,
      deadline,
      lastDrink,
      conclusion: conclusionText({ todayTotal, recommended, canDrink, sleepRemaining, risk, settings, feedback }),
      basis: basisText(settings, feedback),
    };
  }, [drinks, feedback, settings, tolerance]);

  const sensitivityExplanation = useMemo(
    () =>
      buildSensitivityExplanation({
        drinks,
        dailyStatusMemory,
        feedbackMemory,
        settings,
        feedback,
        sensitivity: derived.sensitivity,
      }),
    [drinks, dailyStatusMemory, feedbackMemory, settings, feedback, derived.sensitivity],
  );

  const simResult = useMemo(() => {
    const now = new Date();
    const snapshot = calculateRuleDecisionSnapshot({
      records: drinks,
      settings,
      feedback,
      currentTime: now.toISOString(),
      simulatedDrink: {
        name: simulation.displayName || simulation.name,
        caffeineMg: simulation.mg,
        category: simulation.category || simulation.type,
      },
    });
    const sleepRemaining = snapshot.estimatedSleepResidualMg;
    const risk = snapshot.sleepRisk;
    const afterTotal = snapshot.afterTodayTotalMg ?? derived.todayTotal + simulation.mg;
    const exceedsPalpitation = simulation.mg >= settings.palpitationTriggerMg;
    const exceedsAnxiety = simulation.mg >= settings.anxietyTriggerMg;
    const exceedsComfort = simulation.mg > settings.singleComfortMg;
    const overPersonalLimit = settings.personalDailyLimitMg > 0 && afterTotal > settings.personalDailyLimitMg;
    const decision = ruleDecisionToSimulationLabel(snapshot.ruleDecision);
    const advice =
      exceedsPalpitation
        ? "这杯对你来说可能偏刺激，建议改为半杯或低因。"
        : overPersonalLimit
          ? "这杯会超过你的个人每日上限，今天建议暂停咖啡因。"
          : exceedsAnxiety
            ? "这杯可能让你更容易紧张，建议改成半杯。"
            : risk === "高" || afterTotal > derived.recommended
        ? "不建议继续摄入，今晚优先保护睡眠。"
        : risk === "中" || exceedsComfort
          ? "建议喝半杯，或选择低因饮品。"
          : "可以饮用，建议慢慢喝并留意身体反馈。";
    const alternatives =
      risk === "高"
        ? ["半杯拿铁", "低因美式", "温水 / 玄米茶"]
        : afterTotal > derived.recommended
          ? ["半杯当前饮品", "绿茶", "低因咖啡"]
          : ["小杯拿铁", "绿茶", "继续保留这杯"];
    const reasons = [
      `你计划 ${settings.bedTime} 睡觉。`,
      "当前距离睡觉时间会影响咖啡因代谢余量。",
      `按你的代谢速度估算，睡前残留会${sleepRemaining > derived.adjustedThreshold ? "高于" : "低于"}睡前更安心的目标。`,
      `这杯是否合适，会结合你的日常感受和不舒服反馈一起判断。`,
      `今天已摄入 ${derived.todayTotal}mg，模拟后为 ${afterTotal}mg。`,
    ];
    const bean = beanState({
      todayTotal: afterTotal,
      recommended: derived.recommended,
      sleepRemaining,
      sleepRisk: risk,
      settings,
      feedback,
      latestDoseMg: simulation.mg,
    });
    return { sleepRemaining, risk, advice, afterTotal, decision, alternatives, reasons, bean };
  }, [derived, drinks, feedback, settings, simulation]);

  function refreshLibraryDrinks() {
    setLibraryDrinks(getAllDrinks());
  }

  function addCustomDrink(input: CustomDrinkInput) {
    const saved = saveCustomDrink(input);
    refreshLibraryDrinks();
    return saved;
  }

  function removeCustomDrink(id: string) {
    deleteCustomDrink(id);
    refreshLibraryDrinks();
  }

  function refreshNoMatchMemory() {
    setNoMatchMemoryRevision((revision) => revision + 1);
  }

  function refreshFrequentMemory() {
    setFrequentMemoryRevision((revision) => revision + 1);
  }

  function selectLibraryDrink(drink: DrinkItem, target: "record" | "sim") {
    if (target === "record") {
      setRecordDraft((draft) => ({ ...draftFromDrinkItem(drink, draft.time), note: draft.note }));
    } else {
      setSimulation(simulationFromDrinkItem(drink));
    }
  }

  function recordFrequentDrink(memory: FrequentDrinkMemory) {
    setDrinks((items) => [recordFromFrequentDrink(memory), ...items]);
    emitAdviceRefresh("record_added");
    setRecordOpen(false);
    setToastBean({ bean: derived.bean, text: `${memory.name} 已按常喝饮品记录，今日建议会重新计算。` });
  }

  function pinRecordDraftAsFrequent() {
    const pinned = pinFrequentDrinkMemory(frequentSourceFromDraft(recordDraft));
    refreshFrequentMemory();
    setToastBean({ bean: derived.bean, text: `${pinned.name} 已加入常喝饮品。` });
  }

  function removeFrequentDrink(memory: FrequentDrinkMemory) {
    removeFrequentDrinkMemory(memory.id);
    refreshFrequentMemory();
    setToastBean({ bean: derived.bean, text: `${memory.name} 已从常喝饮品移除。` });
  }

  function saveNoMatchName(rawInput: string) {
    const entry = upsertNoMatchDrinkMemory(rawInput, { status: "pending" });
    refreshNoMatchMemory();
    if (entry) setToastBean({ bean: derived.bean, text: `${entry.rawInput} 已加入待补充饮品。` });
  }

  function recordNoMatchAsCustomDrink(rawInput: string, caffeineMg: number) {
    const name = rawInput.trim();
    if (!name) return;
    const saved = addCustomDrink({
      brand: "我的补充",
      name,
      displayName: name,
      category: "other",
      caffeineMg: Math.max(0, Math.round(Number(caffeineMg) || 0)),
      notes: "由未匹配饮品直接记录",
    });
    convertNoMatchDrinkMemory(name, saved.caffeineMg, saved.id, "已转为自定义饮品并记录");
    refreshNoMatchMemory();
    setDrinks((items) => [
      {
        id: crypto.randomUUID(),
        name: saved.displayName,
        type: categoryLabels[saved.category],
        mg: saved.caffeineMg,
        time: new Date().toISOString(),
        note: "由自定义饮品记录",
        drinkItemId: saved.id,
        brand: saved.brand,
        category: saved.category,
        displayName: saved.displayName,
        volumeMl: saved.volumeMl,
        sizeLabel: saved.sizeLabel,
        sourceType: saved.sourceType,
        confidence: saved.confidence,
        isDecaf: saved.isDecaf,
      },
      ...items,
    ]);
    emitAdviceRefresh("record_added");
    refreshFrequentMemory();
    setRecordOpen(false);
    setRecordDraft((draft) => ({ ...draftFromDrinkItem(saved, toInputDateTime(new Date())), note: draft.note }));
    setToastBean({ bean: derived.bean, text: `${saved.displayName} 已保存为自定义饮品，并记录到今天。` });
  }

  function convertNoMatchToSimulationDrink(rawInput: string, caffeineMg: number) {
    const name = rawInput.trim();
    if (!name) return;
    const saved = addCustomDrink({
      brand: "我的补充",
      name,
      displayName: name,
      category: "other",
      caffeineMg: Math.max(0, Math.round(Number(caffeineMg) || 0)),
      notes: "由待补充饮品保存",
    });
    convertNoMatchDrinkMemory(name, saved.caffeineMg, saved.id, "已转为自定义饮品");
    refreshNoMatchMemory();
    setSimulation(simulationFromDrinkItem(saved));
    setToastBean({ bean: derived.bean, text: `${saved.displayName} 已保存为自定义饮品，可用于喝前模拟。` });
  }

  function addRecord() {
    setDrinks((items) => [recordFromDraft(recordDraft), ...items]);
    emitAdviceRefresh("record_added");
    setRecordOpen(false);
    setRecordDraft((draft) => ({ ...draft, time: toInputDateTime(new Date()), note: "" }));
  }

  function recordSimulation() {
    setDrinks((items) => [
      {
        id: crypto.randomUUID(),
        name: simulation.name,
        type: simulation.type,
        mg: Number(simulation.mg) || 0,
        time: new Date().toISOString(),
        note: "喝前模拟记录",
        drinkItemId: simulation.drinkItemId,
        brand: simulation.brand,
        category: simulation.category,
        displayName: simulation.displayName,
        volumeMl: simulation.volumeMl,
        sizeLabel: simulation.sizeLabel,
        sourceType: simulation.sourceType,
        confidence: simulation.confidence,
        isDecaf: simulation.isDecaf,
      },
      ...items,
    ]);
    emitAdviceRefresh("record_added");
    setToastBean({ bean: simResult.bean, text: `${simulation.name} 已记录，豆豆会重新计算今天的建议。` });
    setSimOpen(false);
  }

  function skipSimulation() {
    setToastBean({ bean: derived.bean, text: "做得不错，今天先休息一下，豆豆给你记一笔克制分。" });
    setSimOpen(false);
  }

  function updateDrinkMg(id: string, mg: number) {
    setDrinks((items) => items.map((drink) => (drink.id === id ? { ...drink, mg } : drink)));
  }

  function deleteDrink(id: string) {
    const target = drinks.find((drink) => drink.id === id);
    setDrinks((items) => items.filter((drink) => drink.id !== id));
    emitAdviceRefresh("record_deleted");
    if (target) setToastBean({ bean: derived.bean, text: `${target.name} 已删除记录，今日建议会重新计算。` });
  }

  async function handleOcrFile(file: File) {
    setOcrState({ loading: true, matches: [], selectedIndex: 0, editing: false, manualMg: 0 });
    try {
      const result = await recognizeDrinkFromImage(file);
      const matches = matchDrinkFromText(result, libraryDrinks);
      setOcrState({
        loading: false,
        result,
        matches,
        selectedIndex: 0,
        editing: false,
        manualMg: matches[0]?.drink.caffeineMg ?? 0,
        error: matches.length ? undefined : "没有找到足够接近的候选，请手动修改或添加常喝饮品。",
      });
    } catch {
      setOcrState({ loading: false, matches: [], selectedIndex: 0, editing: false, manualMg: 0, error: "识别失败，请稍后再试或手动记录。" });
    }
  }

  function confirmOcrRecord() {
    const selected = ocrState.matches[ocrState.selectedIndex];
    if (!selected) return;
    const draft = draftFromDrinkItem(selected.drink);
    setDrinks((items) => [
      {
        ...recordFromDraft({
          ...draft,
          mg: ocrState.manualMg || selected.drink.caffeineMg,
          note: "拍照识别确认",
        }),
        confidence: selected.confidence,
      },
      ...items,
    ]);
    emitAdviceRefresh("record_added");
    setOcrState({ loading: false, matches: [], selectedIndex: 0, editing: false, manualMg: 0 });
    setToastBean({ bean: derived.bean, text: "识别结果已确认并记录，首页建议已更新。" });
  }

  function upsertFeedbackMemory(entry: FeedbackMemoryEntry) {
    setFeedbackMemory((items) => {
      const exists = items.find((item) => item.date === entry.date);
      if (exists) return items.map((item) => (item.date === entry.date ? { ...entry, createdAt: item.createdAt } : item));
      return [entry, ...items].sort((a, b) => b.date.localeCompare(a.date));
    });
  }

  function upsertFeedbackMemoryEntries(entries: FeedbackMemoryEntry[]) {
    setFeedbackMemory((items) => {
      const byDate = new Map(items.map((item) => [item.date, item]));
      entries.forEach((entry) => {
        const existing = byDate.get(entry.date);
        byDate.set(entry.date, existing ? { ...entry, createdAt: existing.createdAt } : entry);
      });
      return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
    });
  }

  function saveCalendarFeedback(date: string, entry: Omit<FeedbackMemoryEntry, "date" | "feedbackType" | "createdAt" | "updatedAt">) {
    const attributedEntries = buildAttributedFeedbackMemoryEntries(date, entry, "calendar_backfill", feedbackMemory);
    upsertFeedbackMemoryEntries(attributedEntries);
    if (isTodayKey(date)) {
      const currentDayEntry = attributedEntries.find((item) => item.date === date);
      if (currentDayEntry) setFeedback((current) => ({ ...current, ...feedbackMemoryToFeedbackState(currentDayEntry, current) }));
    }
    emitAdviceRefresh("feedback_saved");
    setToastBean({ bean: derived.bean, text: `${formatDateKey(date)} 的反馈已补充，状态日历会重新计算。` });
  }

  async function runHomeAgentAdvice(question: string) {
    setHomeAgentLoading(true);
    try {
      const response = await agentLoop(question, { currentTime: new Date().toISOString(), maxToolCalls: 5 });
      setHomeAgentAdvice(response);
    } finally {
      setHomeAgentLoading(false);
    }
  }

  const grouped = groupRecords(drinks);

  return (
    <main className="mx-auto min-h-screen w-full max-w-[540px] px-5 pb-32 pt-7 md:max-w-[620px]">
      <header id="home" className="mb-7 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-caramel text-white shadow-button">
            <Coffee className="h-7 w-7" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold leading-tight text-ink">Caffeine Coach</h1>
            <p className="text-base text-ink/55">你的咖啡因小教练</p>
          </div>
        </div>
        <button className="rounded-full bg-[#fff8ee] px-4 py-2 text-sm font-bold text-caramel" onClick={() => setMainTab("mine")}>
          我的
        </button>
      </header>

      {toastBean && (
        <button className={`fixed left-1/2 top-5 z-[60] flex w-[min(92vw,520px)] -translate-x-1/2 items-center gap-3 rounded-[24px] p-3 text-left shadow-soft ${toastBean.bean.tone}`} onClick={() => setToastBean(null)}>
          <BeanFace bean={toastBean.bean} size="sm" animated />
          <div>
            <p className="font-bold text-ink">{toastBean.bean.name}</p>
            <p className="text-sm leading-relaxed text-ink/65">{toastBean.text}</p>
          </div>
        </button>
      )}

      {mainTab === "today" && (
        <>
          <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
            <RecordDialog
              draft={recordDraft}
              setDraft={setRecordDraft}
              drinks={libraryDrinks}
              selectDrink={(drink) => selectLibraryDrink(drink, "record")}
              addRecord={addRecord}
              frequentDrinks={frequentDrinks}
              recordFrequentDrink={recordFrequentDrink}
              pinCurrentDrink={pinRecordDraftAsFrequent}
              removeFrequentDrink={removeFrequentDrink}
              pendingNoMatchDrinks={pendingNoMatchDrinks}
              saveNoMatchName={saveNoMatchName}
              saveNoMatchAsCustom={recordNoMatchAsCustomDrink}
            />
          </Dialog>

          <Dialog open={simOpen} onOpenChange={setSimOpen}>
            <SimulationDialog
              simulation={simulation}
              setSimulation={setSimulation}
              drinks={libraryDrinks}
              selectDrink={(drink) => selectLibraryDrink(drink, "sim")}
              addCustomDrink={addCustomDrink}
              deleteCustomDrink={removeCustomDrink}
              result={simResult}
              settings={settings}
              recordSimulation={recordSimulation}
              skipSimulation={skipSimulation}
              agentAdvice={simAgentAdvice}
              agentLoading={simAgentLoading}
              saveNoMatchName={saveNoMatchName}
              saveNoMatchAsCustom={convertNoMatchToSimulationDrink}
            />
          </Dialog>

          <HomeStatusCard
            result={homeAgentAdvice}
            loading={homeAgentLoading}
            bean={derived.bean}
            tags={derived.auxTags}
            risk={derived.risk}
            openRecord={() => setRecordOpen(true)}
            openSim={() => setSimOpen(true)}
            onExplain={() => void runHomeAgentAdvice("为什么不建议我喝？")}
          />

          <IntakeProgressCard recommended={derived.recommended} total={derived.todayTotal} canDrink={derived.canDrink} />

          <HomeMetricGrid
            current={derived.current}
            sleepRemaining={derived.sleepRemaining}
            tolerance={tolerance}
            risk={derived.risk}
          />

          <button className="card mb-7 flex w-full items-center justify-between p-5 text-left" onClick={() => setMainTab("mine")}>
            <div>
              <p className="font-bold text-ink">今天感觉如何？</p>
              <p className="mt-1 text-sm text-ink/55">补充今日感受，让明天建议更贴近你。</p>
            </div>
            <span className="rounded-full bg-[#fff8ee] px-4 py-2 text-sm font-bold text-caramel">去反馈</span>
          </button>

          <section className="mb-5 flex items-center justify-between px-2">
            <h2 className="font-display text-xl font-bold">最近记录</h2>
            <button className="text-sm font-bold text-caramel" onClick={() => setMainTab("records")}>查看全部</button>
          </section>
          <section className="space-y-4 pb-10">
            {derived.todayDrinks.slice(0, 2).length ? (
              derived.todayDrinks.slice(0, 2).map((drink) => (
                <RecordItem key={drink.id} drink={drink} updateDrinkMg={updateDrinkMg} deleteDrink={deleteDrink} />
              ))
            ) : (
              <div className="card p-6 text-center text-ink/55">今天还没有记录。记录第一杯后，我会帮你估算睡前残留。</div>
            )}
          </section>
        </>
      )}

      {mainTab === "records" && (
        <>
          <section id="records" className="mb-5 flex items-center justify-between px-2">
            <div>
              <h2 className="font-display text-2xl font-bold">记录</h2>
              <p className="mt-1 text-sm text-ink/50">先选饮品，再确认咖啡因估算值。</p>
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
                <DialogTrigger asChild>
                  <Button className="px-4">
                    <Plus className="h-5 w-5" />
                    记录
                  </Button>
                </DialogTrigger>
                <RecordDialog
                  draft={recordDraft}
                  setDraft={setRecordDraft}
                  drinks={libraryDrinks}
                  selectDrink={(drink) => selectLibraryDrink(drink, "record")}
                  addRecord={addRecord}
                  frequentDrinks={frequentDrinks}
                  recordFrequentDrink={recordFrequentDrink}
                  pinCurrentDrink={pinRecordDraftAsFrequent}
                  removeFrequentDrink={removeFrequentDrink}
                  pendingNoMatchDrinks={pendingNoMatchDrinks}
                  saveNoMatchName={saveNoMatchName}
                  saveNoMatchAsCustom={recordNoMatchAsCustomDrink}
                />
              </Dialog>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#fff8ee] px-4 py-3 text-sm font-bold text-caramel">
                <Camera className="h-4 w-4" />
                拍照
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleOcrFile(file);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
          </section>

          <OcrConfirmCard
            state={ocrState}
            setState={setOcrState}
            confirm={confirmOcrRecord}
            openManualRecord={() => {
              const selected = ocrState.matches[ocrState.selectedIndex];
              if (selected) setRecordDraft({ ...draftFromDrinkItem(selected.drink), mg: ocrState.manualMg || selected.drink.caffeineMg, note: "拍照识别后手动修改" });
              setRecordOpen(true);
            }}
          />

          <section className="card mb-6 grid grid-cols-3 gap-3 p-5 text-center">
            <div>
              <p className="text-sm text-ink/50">今日总摄入</p>
              <p className="mt-1 font-display text-3xl text-caramel">{derived.todayTotal}</p>
              <p className="text-xs text-ink/45">mg</p>
            </div>
            <div>
              <p className="text-sm text-ink/50">记录次数</p>
              <p className="mt-1 font-display text-3xl text-caramel">{derived.todayDrinks.length}</p>
              <p className="text-xs text-ink/45">次</p>
            </div>
            <div>
              <p className="text-sm text-ink/50">最晚摄入</p>
              <p className="mt-2 text-lg font-bold text-ink">{derived.lastDrink ? formatTime(derived.lastDrink.time) : "暂无"}</p>
              <p className="text-xs text-ink/45">今天</p>
            </div>
          </section>

          <section className="space-y-6 pb-10">
            {drinks.length === 0 ? (
              <div className="card p-7 text-center text-ink/55">还没有记录。记录第一杯后，我会帮你估算睡前残留。</div>
            ) : (
              Object.entries(grouped).map(([title, items]) =>
                items.length ? (
                  <div key={title}>
                    <h3 className="mb-3 px-2 text-lg font-bold text-ink">{title}</h3>
                    <div className="space-y-4">
                      {items.map((drink) => (
                        <RecordItem key={drink.id} drink={drink} updateDrinkMg={updateDrinkMg} deleteDrink={deleteDrink} />
                      ))}
                    </div>
                  </div>
                ) : null,
              )
            )}
          </section>
        </>
      )}

      {mainTab === "insights" && (
        <>
          <section className="mb-5 px-2">
            <h2 className="font-display text-2xl font-bold">洞察</h2>
            <p className="mt-1 text-sm text-ink/50">复盘近 7 天摄入、睡前残留与敏感度变化</p>
          </section>
          <StatusCalendarEntry onOpen={() => setStatusCalendarOpen(true)} />
          <Dialog open={statusCalendarOpen} onOpenChange={setStatusCalendarOpen}>
            <StatusCalendarDialog
              dailyStatusMemory={dailyStatusMemory}
              feedbackMemory={feedbackMemory}
              drinks={drinks}
              selectedDate={selectedStatusDate}
              setSelectedDate={setSelectedStatusDate}
              saveFeedback={saveCalendarFeedback}
            />
          </Dialog>
          <InsightSummaryCard insight={derived.sevenDayInsight} sensitivity={derived.sensitivity} tolerance={tolerance} />
          <InsightCard
            activeTab={insightTab}
            setActiveTab={setInsightTab}
            chartData={derived.chartData}
            halfLife={derived.halfLife}
            adjustedThreshold={derived.adjustedThreshold}
            sleepHour={derived.sleepHour}
            tolerance={tolerance}
            sensitivity={derived.sensitivity}
            insight={derived.sevenDayInsight}
            recommended={derived.recommended}
          />
        </>
      )}

      {mainTab === "mine" && (
        <>
          <section className="mb-5 px-2">
            <h2 className="font-display text-2xl font-bold">我的</h2>
            <p className="mt-1 text-sm text-ink/50">设置偏好、补充反馈，管理常喝饮品。</p>
          </section>
          <section className="grid gap-4 pb-10">
            <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
              <DialogTrigger asChild>
                <button className="card flex w-full items-center justify-between p-5 text-left">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff0df] text-caramel">
                      <NotebookPen className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-ink">今日主观反馈</p>
                      <p className="mt-1 text-sm text-ink/52">提神效果、副作用和睡眠感受。</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#fff8ee] px-4 py-2 text-sm font-bold text-caramel">填写</span>
                </button>
              </DialogTrigger>
              <FeedbackDialog
                feedback={feedback}
                setFeedback={setFeedback}
                settings={settings}
                setSettings={setSettings}
                bean={derived.bean}
                tolerance={tolerance}
                latestDoseMg={derived.lastDrink?.mg ?? 0}
                sleepRemaining={derived.sleepRemaining}
                close={() => setFeedbackOpen(false)}
                afterSave={(text) => {
                  setToastBean({ bean: derived.bean, text });
                  const todayKey = dateKey(new Date());
                  const rawEntry = feedbackStateToMemoryEntry(todayKey, feedback, "daily_checkin", feedbackMemory.find((item) => item.date === todayKey));
                  upsertFeedbackMemoryEntries(
                    buildAttributedFeedbackMemoryEntries(
                      todayKey,
                      {
                        sleepQuality: rawEntry.sleepQuality,
                        fallAsleepSpeed: rawEntry.fallAsleepSpeed,
                        palpitation: rawEntry.palpitation,
                        anxiety: rawEntry.anxiety,
                        stomachDiscomfort: rawEntry.stomachDiscomfort,
                        handTremor: rawEntry.handTremor,
                        focusEffect: rawEntry.focusEffect,
                        note: rawEntry.note,
                      },
                      "daily_checkin",
                      feedbackMemory,
                    ),
                  );
                  emitAdviceRefresh("feedback_saved");
                }}
              />
            </Dialog>

            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <button className="card flex w-full items-center justify-between p-5 text-left">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff0df] text-caramel">
                      <Settings className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-ink">个性化设置</p>
                      <p className="mt-1 text-sm text-ink/52">作息目标、喝完感受和提醒偏好。</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#fff8ee] px-4 py-2 text-sm font-bold text-caramel">调整</span>
                </button>
              </DialogTrigger>
              <SettingsDialog
                settings={settings}
                setSettings={setSettingsWithRefresh}
                feedback={feedback}
                sensitivity={derived.sensitivity}
                explanation={sensitivityExplanation}
                close={() => setSettingsOpen(false)}
              />
            </Dialog>

            <div className="card p-5">
              <h3 className="text-lg font-bold text-ink">我的常喝饮品</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink/52">保存后会出现在记录和模拟的饮品库搜索里。</p>
              <CustomDrinkManager
                id="custom-drink-form-mine"
                drinks={libraryDrinks}
                addCustomDrink={addCustomDrink}
                deleteCustomDrink={removeCustomDrink}
                onSaved={(drink) => selectLibraryDrink(drink, "record")}
              />
            </div>

            <div className="card p-5">
              <h3 className="text-lg font-bold text-ink">饮品库说明</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/58">
                咖啡因含量来自饮品库估算，可能因品牌、杯型和制作方式不同而变化。记录时建议先搜索饮品，再按实际杯型确认。
              </p>
            </div>

            <div className="card p-5">
              <h3 className="text-lg font-bold text-ink">数据管理 / 关于</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/58">Caffeine Coach Demo · 数据仅保存在你的设备上，不需要登录。</p>
            </div>
          </section>
        </>
      )}

      <footer className="pb-12 text-center text-sm text-ink/50">Caffeine Coach · Demo · 数据仅保存在你的设备上</footer>
      <BottomNav activeTab={mainTab} setActiveTab={setMainTab} />
    </main>
  );
}

function BeanFace({ bean, size = "md", animated = false }: { bean: Bean; size?: "sm" | "md" | "lg"; animated?: boolean }) {
  return <BeanAvatar status={bean.status} size={size} animated={animated} label={bean.name} />;
}

function HomeStatusCard({
  result,
  loading,
  bean,
  tags,
  risk,
  openRecord,
  openSim,
  onExplain,
}: {
  result: AgentLoopResponse | null;
  loading: boolean;
  bean: Bean;
  tags: string[];
  risk: string;
  openRecord: () => void;
  openSim: () => void;
  onExplain: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const conclusion = (result?.conclusion || bean.text).replace(/^今天建议：/, "");
  const isPauseAdvice = /不建议|停止|暂停|先不|到这里/.test(conclusion);
  const isSmallDoseAdvice = /少量|半杯|低因|小杯/.test(conclusion);
  const action = isPauseAdvice
    ? "今晚先暂停咖啡因，给身体留出代谢时间。"
    : isSmallDoseAdvice
      ? "如果确实想喝，优先半杯、小杯或低因。"
      : result?.suggestions?.[0] || "保持当前节奏，优先在较早时间摄入。";
  const beanNote = isPauseAdvice ? "今天先稳一点。" : isSmallDoseAdvice ? "可以，但分量要轻。" : "状态还不错。";
  const riskTone =
    risk === "低"
      ? "bg-[#e8f3e5] text-sage"
      : risk === "中"
        ? "bg-[#f6dfc4] text-caramel"
        : "bg-[#ffe2dc] text-[#c96a50]";

  function toggleDetails() {
    const nextOpen = !detailsOpen;
    setDetailsOpen(nextOpen);
    if (nextOpen) onExplain();
  }

  return (
    <section className="card mb-7 rounded-[34px] p-6 shadow-soft md:p-7">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-caramel">今日饮用建议</p>
          <h2 className="mt-1 font-display text-3xl font-bold text-ink">今天还能不能喝？</h2>
        </div>
        {loading && <span className="rounded-full bg-[#fff8ee] px-3 py-1 text-xs font-bold text-caramel">更新中</span>}
      </div>

      <div className="flex items-center gap-5">
        <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-[#f4dfc8] shadow-inner">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#ffe9cd]">
            <BeanFace bean={bean} size="lg" animated />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-display text-3xl font-bold text-ink">{bean.name}</h3>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${riskTone}`}>睡眠风险 {risk}</span>
          </div>
          <p className="mt-3 text-base leading-relaxed text-ink/60">{beanNote}</p>
        </div>
      </div>

      <div className="mt-6 rounded-[28px] bg-[#fff1df] p-5">
        <p className="text-xl font-bold leading-relaxed text-ink">{conclusion}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink/58">{action}</p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <Button className="h-14 rounded-full text-lg" onClick={openRecord}>
          <Coffee className="h-6 w-6" />
          记录一杯
        </Button>
        <Button variant="outline" className="h-14 rounded-full bg-[#eee5d8] text-lg" onClick={openSim}>
          <FlaskConical className="h-5 w-5" />
          喝前模拟
        </Button>
      </div>

      <div className="mt-5">
        <button className="text-sm font-bold text-caramel" disabled={loading} onClick={toggleDetails}>
          {detailsOpen ? "收起依据" : "为什么这样建议？"}
        </button>
      </div>

      {detailsOpen && result && (
        <div className="mt-4 space-y-3 rounded-[26px] bg-white/55 p-4">
          <AgentListBlock title="原因" items={result.reasons} emptyText="暂无额外原因。" />
          <AgentListBlock title="依据数据" items={result.dataEvidence} emptyText="这次没有调用到具体数据。" />
          {tags.length > 0 && (
            <div className="rounded-[24px] bg-[#fff8ee] p-4">
              <p className="text-sm font-bold text-ink">标签</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-ink/55">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          <AgentToolTraceDetails result={result} />
        </div>
      )}
    </section>
  );
}

function IntakeProgressCard({ recommended, total, canDrink }: { recommended: number; total: number; canDrink: number }) {
  const percent = Math.min(100, Math.max(0, Math.round((total / Math.max(recommended, 1)) * 100)));
  return (
    <section className="card mb-7 grid grid-cols-[140px_1fr] items-center gap-5 rounded-[34px] p-7">
      <div
        className="flex h-32 w-32 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(#a96b32 ${percent}%, #f1e5d8 ${percent}% 100%)` }}
      >
        <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white">
          <strong className="font-display text-4xl leading-none text-ink">{total}</strong>
          <span className="mt-1 text-sm font-semibold text-ink/55">/ {recommended} mg</span>
        </div>
      </div>
      <div>
        <p className="text-base font-semibold text-ink/55">今日推荐摄入量</p>
        <p className="mt-1 font-display text-4xl text-caramel">{recommended} mg</p>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-semibold text-ink/48">已摄入</p>
            <p className="mt-1 text-2xl font-bold text-ink">{total} mg</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink/48">还可摄入</p>
            <p className="mt-1 text-2xl font-bold text-sage">{canDrink} mg</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeMetricGrid({
  current,
  sleepRemaining,
  tolerance,
  risk,
}: {
  current: number;
  sleepRemaining: number;
  tolerance: ToleranceInsight;
  risk: string;
}) {
  const toleranceText =
    tolerance.level === "unknown"
      ? "待判断"
      : tolerance.level === "high"
        ? "高"
        : tolerance.level === "medium"
          ? "中"
          : "低";
  return (
    <section className="mb-7 grid grid-cols-2 gap-4">
      <SimpleMetricCard icon={Activity} title="当前体内剩余" value={String(current)} suffix="mg" />
      <SimpleMetricCard icon={Moon} title="睡前预计残留" value={String(sleepRemaining)} suffix="mg" accent="green" />
      <SimpleMetricCard icon={Gauge} title="耐受趋势" value={toleranceText} />
      <SimpleMetricCard icon={Zap} title="睡眠风险" value={risk} />
    </section>
  );
}

function SimpleMetricCard({
  icon: Icon,
  title,
  value,
  suffix,
  accent,
}: {
  icon: typeof Activity;
  title: string;
  value: string;
  suffix?: string;
  accent?: "green";
}) {
  return (
    <article className="card rounded-[26px] p-5">
      <div className="flex items-center gap-2 text-ink/55">
        <Icon className="h-5 w-5" />
        <p className="text-base font-semibold">{title}</p>
      </div>
      <p className={`mt-5 font-display text-4xl leading-none ${accent === "green" ? "text-sage" : "text-caramel"}`}>
        {value} {suffix && <span className="font-sans text-lg text-ink/55">{suffix}</span>}
      </p>
    </article>
  );
}

function MetricCard({
  title,
  value,
  suffix,
  sub,
  foot,
  accent = false,
}: {
  title: string;
  value: number;
  suffix: string;
  sub: string;
  foot: string;
  accent?: boolean;
}) {
  return (
    <article className="card p-5">
      <p className="text-base font-semibold text-ink/55">{title}</p>
      <p className={`mt-2 font-display text-4xl leading-none ${accent ? "text-[#d66f55]" : "text-caramel"}`}>
        {value} <span className="font-sans text-xl text-ink/60">{suffix}</span>
      </p>
      <p className="mt-3 text-base font-semibold text-ink/70">{sub}</p>
      <p className="mt-1 text-sm text-ink/45">{foot}</p>
    </article>
  );
}

function AgentAdviceCard({
  title,
  subtitle,
  result,
  loading,
  compact = false,
  metrics = [],
  bean,
  tags = [],
  onExplain,
  onSimulate,
}: {
  title: string;
  subtitle: string;
  result: AgentLoopResponse | null;
  loading: boolean;
  compact?: boolean;
  metrics?: { label: string; value: string }[];
  bean?: Bean;
  tags?: string[];
  onExplain?: () => void;
  onSimulate?: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const suggestion = result?.suggestions[0] || "建议先按当前节奏观察，必要时选择半杯或低因。";
  return (
    <section className={`card ${compact ? "mb-7 p-5" : "p-6"}`}>
      <div className="flex items-start gap-4">
        {bean ? (
          <BeanFace bean={bean} size="sm" animated />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fff0df] text-caramel">
            <Bot className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-caramel">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink/55">{subtitle}</p>
          {bean && <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${bean.chip}`}>今日豆豆：{bean.name}</p>}
        </div>
        {loading && <span className="rounded-full bg-[#fff8ee] px-3 py-1 text-xs font-bold text-caramel">更新中</span>}
      </div>

      {result ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-[24px] bg-[#f7ead9] p-5">
            <p className="text-sm font-bold text-caramel">结论</p>
            <h3 className="mt-2 text-xl font-bold leading-snug text-ink">{result.conclusion}</h3>
            {metrics.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {metrics.map((metric) => (
                  <div key={metric.label} className="rounded-[18px] bg-white/62 px-2 py-3">
                    <p className="text-xs font-bold text-ink/45">{metric.label}</p>
                    <p className="mt-1 text-sm font-bold text-ink">{metric.value}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 rounded-[18px] bg-white/62 px-4 py-3">
              <p className="text-xs font-bold text-ink/45">建议行动</p>
              <p className="mt-1 text-sm font-bold leading-relaxed text-ink/70">{suggestion}</p>
            </div>
            {result.isFallback && (
              <p className="mt-3 rounded-[18px] bg-white/60 px-4 py-3 text-sm font-semibold leading-relaxed text-ink/62">
                本次建议基于部分信息生成，可补充记录后获得更准确建议。
              </p>
            )}
            {result.needFollowUp && result.followUpQuestion && (
              <p className="mt-3 rounded-[18px] bg-[#eaf5e2] px-4 py-3 text-sm font-semibold leading-relaxed text-[#648b50]">
                {result.followUpQuestion}
              </p>
            )}
          </div>
          {(onExplain || onSimulate) && (
            <div className="flex flex-wrap gap-2">
              {onExplain && (
                <button
                  className="rounded-full bg-[#fff8ee] px-4 py-2 text-sm font-bold text-caramel"
                  disabled={loading}
                  onClick={() => {
                    const nextOpen = !detailsOpen;
                    setDetailsOpen(nextOpen);
                    if (nextOpen) onExplain();
                  }}
                >
                  {detailsOpen ? "收起依据" : "为什么这样建议？"}
                </button>
              )}
              {onSimulate && (
                <button className="rounded-full bg-[#eaf5e2] px-4 py-2 text-sm font-bold text-[#648b50]" onClick={onSimulate}>
                  喝前算一算
                </button>
              )}
            </div>
          )}
          {detailsOpen && (
            <div className="space-y-3 rounded-[24px] border border-[#eadccd] bg-white/45 p-4">
              <AgentListBlock title="原因" items={result.reasons} emptyText="暂无额外原因。" />
              <AgentListBlock title="依据数据" items={result.dataEvidence} emptyText="这次没有调用到具体数据。" />
              {tags.length > 0 && (
                <div className="rounded-[24px] bg-white/55 p-4">
                  <p className="text-sm font-bold text-ink">标签</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-[#fff8ee] px-3 py-1 text-xs font-bold text-ink/58">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <AgentToolTraceDetails result={result} />
            </div>
          )}
        </div>
      ) : (
        <p className="mt-5 rounded-[22px] bg-[#fff8ee] p-4 text-sm font-semibold leading-relaxed text-ink/55">
          正在根据今日记录生成建议。
        </p>
      )}
    </section>
  );
}

function AgentListBlock({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div className="rounded-[24px] bg-white/55 p-4">
      <p className="text-sm font-bold text-ink">{title}</p>
      <ul className="mt-2 space-y-2">
        {(items.length ? items : [emptyText]).map((item, index) => (
          <li key={`${item}-${index}`} className="text-sm font-semibold leading-relaxed text-ink/65">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgentToolTraceDetails({ result }: { result: AgentLoopResponse }) {
  return (
    <details className="rounded-[24px] border border-[#eadccd] bg-white/45">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-ink/45">开发调试：查看工具调用轨迹</summary>
      <div className="space-y-3 border-t border-[#eadccd] p-4">
        {result.usedTools.length ? (
          result.usedTools.map((tool, index) => (
            <div key={`${tool.toolName}-${index}`} className="rounded-[20px] bg-[#fff8ee] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-ink">{tool.toolName}</p>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tool.status === "success" ? "bg-[#e8f3e5] text-sage" : "bg-[#ffe9e3] text-[#c96a50]"}`}>
                  {tool.status === "success" ? "成功" : "失败"}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink/55">输入：{summarizeToolInput(tool.input)}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink/55">输出：{tool.outputSummary}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-ink/50">本次没有调用工具。</p>
        )}
      </div>
    </details>
  );
}

function summarizeToolInput(input: unknown) {
  if (!input || (typeof input === "object" && Object.keys(input as Record<string, unknown>).length === 0)) return "无额外输入";
  try {
    return JSON.stringify(input).slice(0, 120);
  } catch {
    return "输入不可序列化";
  }
}

function LabelText({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-base font-bold text-ink">{children}</label>;
}

function FrequentDrinkShelf({
  items,
  recordDrink,
  removeDrink,
}: {
  items: FrequentDrinkMemory[];
  recordDrink: (memory: FrequentDrinkMemory) => void;
  removeDrink: (memory: FrequentDrinkMemory) => void;
}) {
  return (
    <section className="rounded-[28px] bg-white/45 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-base font-bold text-ink">常喝饮品</p>
          <p className="mt-1 text-xs text-ink/45">点击即可按当前时间再次记录</p>
        </div>
        <span className="rounded-full bg-[#fff8ee] px-3 py-1 text-xs font-bold text-caramel">最近常用</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-[22px] bg-white/62 p-4 text-sm leading-relaxed text-ink/50">
          还没有常喝饮品。连续记录同一饮品后会自动出现，也可以把当前选中饮品加入常喝。
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-[22px] border border-[#eadccd] bg-white/68 p-3">
              <button className="min-w-0 flex flex-1 items-center gap-3 text-left" onClick={() => recordDrink(item)}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#dff1d8] text-xl">{categoryIcon(item.category)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-bold text-ink">{item.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-ink/48">
                    {[item.brand, item.size, item.source === "manual" ? "已固定" : `已记录 ${item.count} 次`].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
              <div className="shrink-0 text-right">
                <p className="font-display text-xl font-bold text-caramel">{item.caffeineMg ?? 0}<span className="ml-1 text-xs text-ink/45">mg</span></p>
                <button className="mt-1 text-xs font-bold text-ink/35 hover:text-[#d66f55]" onClick={() => removeDrink(item)} aria-label={`移除 ${item.name}`}>
                  移除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PendingNoMatchDrinkPanel({
  items,
  saveAsCustom,
}: {
  items: NoMatchDrinkMemory[];
  saveAsCustom: (rawInput: string, caffeineMg: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-[28px] bg-white/45 p-4">
      <div className="mb-3">
        <p className="text-base font-bold text-ink">待补充饮品</p>
        <p className="mt-1 text-xs text-ink/45">这些饮品暂时没在库里，补充咖啡因后就能复用。</p>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <PendingNoMatchDrinkItem key={item.id} item={item} saveAsCustom={saveAsCustom} />
        ))}
      </div>
    </section>
  );
}

function PendingNoMatchDrinkItem({
  item,
  saveAsCustom,
}: {
  item: NoMatchDrinkMemory;
  saveAsCustom: (rawInput: string, caffeineMg: number) => void;
}) {
  const [mg, setMg] = useState(item.caffeineMg || 80);
  return (
    <div className="rounded-[22px] border border-[#eadccd] bg-white/68 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold text-ink">{item.rawInput}</p>
          <p className="mt-1 text-xs text-ink/45">出现 {item.count} 次 · 待补充</p>
        </div>
        <input
          className="w-24 rounded-full border border-[#eadccd] bg-white/75 px-3 py-2 text-right text-sm font-bold text-ink outline-none"
          type="number"
          min="0"
          value={mg}
          onChange={(event) => setMg(Number(event.target.value) || 0)}
          aria-label={`${item.rawInput} 咖啡因含量`}
        />
      </div>
      <div className="mt-3">
        <button className="rounded-full bg-caramel px-4 py-2 text-sm font-bold text-white" onClick={() => saveAsCustom(item.rawInput, mg)}>
          补充并记录
        </button>
      </div>
    </div>
  );
}

function RecordDialog({
  draft,
  setDraft,
  drinks,
  selectDrink,
  addRecord,
  frequentDrinks,
  recordFrequentDrink,
  pinCurrentDrink,
  removeFrequentDrink,
  pendingNoMatchDrinks,
  saveNoMatchName,
  saveNoMatchAsCustom,
}: {
  draft: DrinkDraft;
  setDraft: React.Dispatch<React.SetStateAction<DrinkDraft>>;
  drinks: DrinkItem[];
  selectDrink: (drink: DrinkItem) => void;
  addRecord: () => void;
  frequentDrinks: FrequentDrinkMemory[];
  recordFrequentDrink: (memory: FrequentDrinkMemory) => void;
  pinCurrentDrink: () => void;
  removeFrequentDrink: (memory: FrequentDrinkMemory) => void;
  pendingNoMatchDrinks: NoMatchDrinkMemory[];
  saveNoMatchName: (rawInput: string) => void;
  saveNoMatchAsCustom: (rawInput: string, caffeineMg: number) => void;
}) {
  return (
    <DialogContent className="p-0 md:p-0">
      <div className="px-6 pb-4 pt-6 md:px-8 md:pt-8">
        <DialogTitle className="pr-10 font-display text-3xl font-bold">记录一杯</DialogTitle>
        <DialogDescription className="mt-3 text-sm leading-relaxed text-ink/58">
          搜索饮品后确认咖啡因含量和时间，即可保存并更新今日建议。
        </DialogDescription>
      </div>

      <div className="space-y-5 px-6 pb-28 md:px-8">
        <FrequentDrinkShelf items={frequentDrinks} recordDrink={recordFrequentDrink} removeDrink={removeFrequentDrink} />
        <DrinkSelector
          drinks={drinks}
          selectedId={draft.drinkItemId}
          onSelect={selectDrink}
          onSaveNoMatchName={saveNoMatchName}
          onSaveNoMatchAsCustom={saveNoMatchAsCustom}
          noMatchPrimaryLabel="补充并记录"
        />
        <PendingNoMatchDrinkPanel items={pendingNoMatchDrinks} saveAsCustom={saveNoMatchAsCustom} />

        <section className="rounded-[28px] bg-white/58 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#dff1d8] text-2xl">
                {categoryIcon(draft.category)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-caramel">已选饮品</p>
                <input
                  className="mt-1 w-full bg-transparent text-xl font-bold text-ink outline-none"
                  value={draft.name}
                  onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
                  aria-label="饮品名称"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#fff8ee] px-3 py-1 text-xs font-bold text-caramel">
                    {draft.sourceType ? sourceLabels[draft.sourceType] : "手动填写"}
                  </span>
                  <span className="rounded-full bg-[#eef4e8] px-3 py-1 text-xs font-bold text-[#668f58]">
                    {draft.confidence ? confidenceLabels[draft.confidence] : "手动确认"}
                  </span>
                  {draft.isDecaf && <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ink/55">低因</span>}
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-display text-4xl text-caramel">{draft.mg}</p>
              <p className="-mt-1 text-sm font-bold text-ink/45">mg</p>
            </div>
          </div>
          <p className="mt-4 rounded-[18px] bg-[#fff8ee] px-4 py-3 text-xs font-semibold leading-relaxed text-ink/52">
            该咖啡因数值为估算，可在高级调整中修改。
          </p>
          <button
            className="mt-3 inline-flex rounded-full border border-[#eadccd] bg-white/58 px-4 py-2 text-sm font-bold text-caramel"
            onClick={pinCurrentDrink}
          >
            加入常喝
          </button>
        </section>

        <section className="rounded-[28px] bg-white/58 p-5">
          <LabelText>摄入时间</LabelText>
          <input className="field" type="datetime-local" value={draft.time} onChange={(event) => setDraft((d) => ({ ...d, time: event.target.value }))} />
        </section>

        <details className="rounded-[24px] border border-[#eadccd] bg-white/45 p-4">
          <summary className="cursor-pointer list-none text-sm font-bold text-caramel">高级调整（可选）</summary>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <LabelText>咖啡因含量 mg</LabelText>
              <input className="field" type="number" min="0" value={draft.mg} onChange={(event) => setDraft((d) => ({ ...d, mg: Number(event.target.value) }))} />
            </div>
            <div>
              <LabelText>饮品类型</LabelText>
              <input className="field" value={draft.type} onChange={(event) => setDraft((d) => ({ ...d, type: event.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <LabelText>备注</LabelText>
              <input className="field" value={draft.note} onChange={(event) => setDraft((d) => ({ ...d, note: event.target.value }))} placeholder="例如：下午提神、会议前" />
            </div>
            <div className="md:col-span-2">
              <DrinkMetaNotice draft={draft} />
            </div>
          </div>
        </details>
      </div>

      <div className="sticky bottom-0 z-10 grid grid-cols-[0.9fr_1.4fr] gap-3 border-t border-[#eadccd] bg-cream/95 px-6 py-4 backdrop-blur md:px-8">
        <DialogClose asChild>
          <Button variant="ghost">取消</Button>
        </DialogClose>
        <Button onClick={addRecord}>保存记录</Button>
      </div>
    </DialogContent>
  );
}

function SimulationDialog({
  simulation,
  setSimulation,
  drinks,
  selectDrink,
  addCustomDrink,
  deleteCustomDrink,
  result,
  settings,
  recordSimulation,
  skipSimulation,
  agentAdvice,
  agentLoading,
  saveNoMatchName,
  saveNoMatchAsCustom,
}: {
  simulation: SimulationDraft;
  setSimulation: React.Dispatch<React.SetStateAction<SimulationDraft>>;
  drinks: DrinkItem[];
  selectDrink: (drink: DrinkItem) => void;
  addCustomDrink: (input: CustomDrinkInput) => DrinkItem;
  deleteCustomDrink: (id: string) => void;
  result: {
    sleepRemaining: number;
    risk: string;
    advice: string;
    afterTotal: number;
    decision: string;
    alternatives: string[];
    reasons: string[];
    bean: Bean;
  };
  settings: SettingsState;
  recordSimulation: () => void;
  skipSimulation: () => void;
  agentAdvice: AgentLoopResponse | null;
  agentLoading: boolean;
  saveNoMatchName: (rawInput: string) => void;
  saveNoMatchAsCustom: (rawInput: string, caffeineMg: number) => void;
}) {
  function halveDrink() {
    setSimulation((s) => ({ ...s, mg: Math.max(1, Math.round(s.mg / 2)) }));
  }
  const riskTone = result.risk === "低" ? "bg-[#eaf5e2]" : result.risk === "中" ? "bg-[#fff0d8]" : "bg-[#ffe9e3]";

  return (
    <DialogContent>
      <DialogTitle className="mb-6 pr-10 font-display text-3xl font-bold">喝前模拟</DialogTitle>
      <DialogDescription className="sr-only">模拟现在摄入一杯饮品后的睡前残留</DialogDescription>
      <p className="-mt-3 mb-4 rounded-[22px] bg-[#fff8ee] p-4 text-sm leading-relaxed text-ink/58">
        先选择想喝的饮品，我会根据饮品库估算这杯对今晚睡眠的影响。
      </p>
      <DrinkSelector
        drinks={drinks}
        selectedId={simulation.drinkItemId}
        onSelect={selectDrink}
        onAddCustom={() => document.getElementById("custom-drink-form-sim")?.scrollIntoView({ behavior: "smooth" })}
        onSaveNoMatchName={saveNoMatchName}
        onSaveNoMatchAsCustom={saveNoMatchAsCustom}
      />
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <LabelText>想喝的饮品</LabelText>
          <input className="field" value={simulation.name} onChange={(e) => setSimulation((s) => ({ ...s, name: e.target.value }))} />
        </div>
      </div>
      <DrinkMetaNotice draft={simulation} />
      <details className="mt-4 rounded-[24px] border border-[#eadccd] bg-white/45 p-4">
        <summary className="cursor-pointer list-none text-sm font-bold text-caramel">高级调整：手动修改咖啡因含量</summary>
        <div className="mt-4">
          <LabelText>咖啡因含量 mg</LabelText>
          <input className="field" type="number" min="0" value={simulation.mg} onChange={(e) => setSimulation((s) => ({ ...s, mg: Number(e.target.value) }))} />
          <p className="mt-2 text-xs text-ink/45">咖啡因含量由饮品库估算，可按实际杯型或标签手动调整。</p>
        </div>
      </details>
      <CustomDrinkManager id="custom-drink-form-sim" drinks={drinks} addCustomDrink={addCustomDrink} deleteCustomDrink={deleteCustomDrink} onSaved={selectDrink} />
      <div className={`mt-7 rounded-[28px] p-6 ${riskTone}`}>
        <div className="flex items-center gap-4">
          <BeanFace bean={result.bean} size="sm" animated />
          <div>
            <p className="text-sm font-bold text-caramel">模拟结论</p>
            <h3 className="text-2xl font-bold text-ink">{result.decision}</h3>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <InfoPill label="摄入" value={`${simulation.mg}mg`} />
          <InfoPill label="睡前残留" value={`${result.sleepRemaining}mg`} />
          <InfoPill label="风险等级" value={`${result.risk}风险`} />
        </div>
        <div className="mt-4 grid gap-2 rounded-[22px] bg-white/58 p-4 text-sm text-ink/62 md:grid-cols-2">
          <p>品牌：<strong className="text-ink">{simulation.brand || "未填写"}</strong></p>
          <p>杯型/容量：<strong className="text-ink">{[simulation.sizeLabel, simulation.volumeMl ? `${simulation.volumeMl}ml` : ""].filter(Boolean).join(" · ") || "未填写"}</strong></p>
          <p>数据来源：<strong className="text-ink">{simulation.sourceType ? sourceLabels[simulation.sourceType] : "手动填写"}</strong></p>
          <p>置信度：<strong className="text-ink">{simulation.confidence ? confidenceLabels[simulation.confidence] : "手动确认"}</strong></p>
        </div>
        <p className="mt-5 text-lg font-bold text-ink">{result.advice}</p>
        <div className="mt-4 rounded-[22px] bg-white/58 p-4">
          <p className="font-bold text-ink">原因</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-ink/66">
            {result.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ol>
          <p className="mt-4 font-bold text-ink">替代建议</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {result.alternatives.map((item) => (
              <span key={item} className="rounded-full bg-white/70 px-3 py-1 text-sm font-semibold text-ink/70">{item}</span>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink/45">睡前更安心的目标：{settings.safeSleepResidualMg}mg</p>
        </div>
        <div className="mt-4">
          <KnowledgeAccordion title="为什么不建议继续喝？">
            <p>咖啡因会阻断困意信号，让人更清醒。如果距离睡觉时间太近，体内仍有较多残留，就可能增加入睡难度或影响睡眠质量。</p>
            <p>如果这杯可能让你不舒服，系统会优先建议半杯、低因或暂停摄入。</p>
          </KnowledgeAccordion>
        </div>
        <div className="mt-4">
          <AgentAdviceCard
            title="喝前建议依据"
            subtitle="已根据饮品信息、今日摄入和你的作息估算风险。"
            result={agentAdvice}
            loading={agentLoading}
            compact
            metrics={[
              { label: "这杯咖啡因", value: `${simulation.mg}mg` },
              { label: "今日累计", value: `${result.afterTotal}mg` },
              { label: "睡前残留", value: `${result.sleepRemaining}mg` },
              { label: "风险等级", value: `${result.risk}风险` },
            ]}
          />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Button onClick={recordSimulation}>记录这杯</Button>
          <Button variant="outline" onClick={halveDrink}>改成半杯</Button>
          <Button variant="ghost" onClick={skipSimulation}>今天不喝了</Button>
        </div>
      </div>
    </DialogContent>
  );
}

function DrinkMetaNotice({ draft }: { draft: Partial<DrinkDraft> }) {
  return (
    <div className="mt-5 rounded-[24px] bg-[#fff8ee] p-4 text-sm leading-relaxed text-ink/58">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-white/70 px-3 py-1 font-bold text-caramel">
          {draft.sourceType ? sourceLabels[draft.sourceType] : "手动填写"}
        </span>
        <span className="rounded-full bg-[#eef4e8] px-3 py-1 font-bold text-[#668f58]">
          {draft.confidence ? confidenceLabels[draft.confidence] : "手动确认"}
        </span>
        {draft.isDecaf && <span className="rounded-full bg-white/70 px-3 py-1 font-bold text-ink/55">低因</span>}
      </div>
      <p className="mt-3">
        咖啡因含量为估算值，可能因品牌、杯型和制作方式不同而变化，可手动修改。
      </p>
    </div>
  );
}

function CustomDrinkManager({
  id,
  drinks,
  addCustomDrink,
  deleteCustomDrink,
  onSaved,
}: {
  id: string;
  drinks: DrinkItem[];
  addCustomDrink: (input: CustomDrinkInput) => DrinkItem;
  deleteCustomDrink: (id: string) => void;
  onSaved: (drink: DrinkItem) => void;
}) {
  const customDrinks = drinks.filter((drink) => drink.isCustom);
  const [draft, setDraft] = useState<CustomDrinkInput>({
    brand: "",
    name: "",
    displayName: "",
    category: "coffee",
    sizeLabel: "",
    volumeMl: undefined,
    caffeineMg: 80,
    notes: "",
  });

  function editDrink(drink: DrinkItem) {
    setDraft({
      id: drink.id,
      brand: drink.brand,
      name: drink.name,
      displayName: drink.displayName,
      category: drink.category,
      sizeLabel: drink.sizeLabel || "",
      volumeMl: drink.volumeMl,
      caffeineMg: drink.caffeineMg,
      notes: drink.notes || "",
    });
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function save() {
    const saved = addCustomDrink({
      ...draft,
      name: draft.name || draft.displayName,
      displayName: draft.displayName || draft.name,
      caffeineMg: Number(draft.caffeineMg) || 0,
      volumeMl: draft.volumeMl ? Number(draft.volumeMl) : undefined,
    });
    onSaved(saved);
    setDraft({
      brand: "",
      name: "",
      displayName: "",
      category: "coffee",
      sizeLabel: "",
      volumeMl: undefined,
      caffeineMg: 80,
      notes: "",
    });
  }

  return (
    <details id={id} className="mt-5 rounded-[28px] border border-[#eadccd] bg-white/45 p-4">
      <summary className="cursor-pointer list-none text-base font-bold text-caramel">我的常喝饮品</summary>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <LabelText>品牌</LabelText>
          <input className="field" value={draft.brand} onChange={(event) => setDraft((d) => ({ ...d, brand: event.target.value }))} placeholder="例如：瑞幸咖啡" />
        </div>
        <div>
          <LabelText>饮品名</LabelText>
          <input className="field" value={draft.name} onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value, displayName: d.displayName || event.target.value }))} placeholder="例如：生椰拿铁" />
        </div>
        <div>
          <LabelText>展示名称</LabelText>
          <input className="field" value={draft.displayName} onChange={(event) => setDraft((d) => ({ ...d, displayName: event.target.value }))} />
        </div>
        <div>
          <LabelText>分类</LabelText>
          <Select value={draft.category} onValueChange={(value: DrinkCategory) => setDraft((d) => ({ ...d, category: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <LabelText>杯型</LabelText>
          <input className="field" value={draft.sizeLabel || ""} onChange={(event) => setDraft((d) => ({ ...d, sizeLabel: event.target.value }))} placeholder="例如：大杯" />
        </div>
        <div>
          <LabelText>容量 ml</LabelText>
          <input className="field" type="number" min="0" value={draft.volumeMl ?? ""} onChange={(event) => setDraft((d) => ({ ...d, volumeMl: Number(event.target.value) || undefined }))} />
        </div>
        <div>
          <LabelText>咖啡因 mg</LabelText>
          <input className="field" type="number" min="0" value={draft.caffeineMg} onChange={(event) => setDraft((d) => ({ ...d, caffeineMg: Number(event.target.value) }))} />
        </div>
        <div>
          <LabelText>备注</LabelText>
          <input className="field" value={draft.notes || ""} onChange={(event) => setDraft((d) => ({ ...d, notes: event.target.value }))} />
        </div>
      </div>
      <Button className="mt-4 w-full" onClick={save}>{draft.id ? "保存修改" : "添加我的常喝饮品"}</Button>
      {customDrinks.length > 0 && (
        <div className="mt-5 space-y-3">
          {customDrinks.map((drink) => (
            <div key={drink.id} className="flex items-center gap-3 rounded-[22px] bg-white/65 p-3">
              <span className="text-xl">{categoryIcon(drink.category)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink">{drink.displayName}</p>
                <p className="text-sm text-ink/50">{drink.caffeineMg}mg · {sourceLabels[drink.sourceType]}</p>
              </div>
              <button className="text-caramel" onClick={() => editDrink(drink)} aria-label={`编辑 ${drink.displayName}`}>
                <Edit3 className="h-4 w-4" />
              </button>
              <button className="text-[#d66f55]" onClick={() => deleteCustomDrink(drink.id)} aria-label={`删除 ${drink.displayName}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function OcrConfirmCard({
  state,
  setState,
  confirm,
  openManualRecord,
}: {
  state: OcrState;
  setState: React.Dispatch<React.SetStateAction<OcrState>>;
  confirm: () => void;
  openManualRecord: () => void;
}) {
  if (!state.loading && !state.result && !state.error) return null;
  const selected = state.matches[state.selectedIndex];

  return (
    <section className="card mb-6 p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fff0df] text-caramel">
          <Camera className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-caramel">拍照识别</p>
          <h3 className="text-xl font-bold text-ink">{state.loading ? "识别中..." : "识别结果需确认"}</h3>
        </div>
      </div>
      {state.loading ? (
        <div className="rounded-[24px] bg-[#fff8ee] p-5 text-ink/60">正在读取图片文字，并匹配饮品库...</div>
      ) : (
        <div className="space-y-4">
          {state.result && (
            <div className="rounded-[24px] bg-[#fff8ee] p-4 text-sm leading-relaxed text-ink/62">
              <p>识别文本：<strong className="text-ink">{state.result.rawText}</strong></p>
              <p>识别字段：{[state.result.brand, state.result.drinkName, state.result.sizeLabel, state.result.volumeMl ? `${state.result.volumeMl}ml` : ""].filter(Boolean).join(" · ")}</p>
            </div>
          )}
          {state.error && <p className="rounded-[22px] bg-[#ffe9e3] p-4 text-sm font-semibold text-[#c96c55]">{state.error}</p>}
          {selected && (
            <div className="rounded-[26px] bg-[#eef4e8] p-4">
              <p className="text-sm font-bold text-[#668f58]">最佳匹配</p>
              <div className="mt-2 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-bold text-ink">{selected.drink.displayName}</h4>
                  <p className="text-sm text-ink/55">{selected.drink.brand} · {[selected.drink.sizeLabel, selected.drink.volumeMl ? `${selected.drink.volumeMl}ml` : ""].filter(Boolean).join(" · ") || "杯型未标注"}</p>
                </div>
                <p className="font-display text-3xl text-caramel">{state.manualMg || selected.drink.caffeineMg}<span className="font-sans text-sm text-ink/50">mg</span></p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-caramel">{sourceLabels[selected.drink.sourceType]}</span>
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-[#668f58]">{selected.confidence === "high" ? "高匹配" : selected.confidence === "medium" ? "中匹配" : "低匹配"}</span>
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-ink/55">{selected.reason}</span>
              </div>
              {selected.drink.notes && <p className="mt-3 text-xs leading-relaxed text-ink/48">{selected.drink.notes}</p>}
              <div className="mt-4">
                <LabelText>确认咖啡因 mg</LabelText>
                <input className="field" type="number" min="0" value={state.manualMg || selected.drink.caffeineMg} onChange={(event) => setState((s) => ({ ...s, manualMg: Number(event.target.value) }))} />
              </div>
            </div>
          )}
          {state.matches.length > 0 && (
            <div>
              <p className="mb-2 px-1 text-sm font-bold text-ink/60">Top 3 候选</p>
              <div className="grid gap-2">
                {state.matches.map((match, index) => (
                  <button
                    key={match.drink.id}
                    className={`rounded-[20px] border p-3 text-left ${state.selectedIndex === index ? "border-caramel bg-[#fff4e8]" : "border-[#eadccd] bg-white/60"}`}
                    onClick={() => setState((s) => ({ ...s, selectedIndex: index, manualMg: match.drink.caffeineMg }))}
                  >
                    <div className="flex justify-between gap-3">
                      <span className="font-bold text-ink">{match.drink.displayName}</span>
                      <span className="text-caramel">{match.drink.caffeineMg}mg</span>
                    </div>
                    <p className="mt-1 text-xs text-ink/50">匹配分 {match.score} · {match.reason}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-4">
            <Button onClick={confirm} disabled={!selected}>
              <CheckCircle2 className="h-4 w-4" />
              确认记录
            </Button>
            <Button variant="outline" onClick={openManualRecord} disabled={!selected}>手动修改</Button>
            <Button
              variant="outline"
              onClick={() => setState((s) => ({ ...s, selectedIndex: s.matches.length ? (s.selectedIndex + 1) % s.matches.length : 0, manualMg: s.matches.length ? s.matches[(s.selectedIndex + 1) % s.matches.length].drink.caffeineMg : 0 }))}
              disabled={state.matches.length < 2}
            >
              换一个候选
            </Button>
            <Button variant="ghost" onClick={() => setState({ loading: false, matches: [], selectedIndex: 0, editing: false, manualMg: 0 })}>取消</Button>
          </div>
        </div>
      )}
    </section>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] bg-white/68 px-3 py-3">
      <p className="text-xs text-ink/48">{label}</p>
      <p className="mt-1 font-bold text-ink">{value}</p>
    </div>
  );
}

function KnowledgeAccordion({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-[24px] border border-[#eadccd] bg-white/55 p-4 text-left">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-caramel">
        <span>{title}</span>
        <span className="rounded-full bg-[#f3e6d6] px-2 py-1 text-xs text-caramel group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink/62">
        {children}
        <p className="text-xs text-ink/45">本产品提供的是估算和生活管理建议，不是医疗诊断。</p>
      </div>
    </details>
  );
}

function StatusCalendarEntry({ onOpen }: { onOpen: () => void }) {
  return (
    <button className="card mb-6 flex w-full items-center justify-between gap-4 rounded-[30px] p-5 text-left" onClick={onOpen}>
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff0df] text-caramel">
          <CalendarDays className="h-6 w-6" />
        </div>
        <div>
          <p className="text-lg font-bold text-ink">状态日历</p>
          <p className="mt-1 text-sm leading-relaxed text-ink/52">按天查看摄入、睡前残留和反馈记录</p>
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-[#fff8ee] px-4 py-2 text-sm font-bold text-caramel">查看</span>
    </button>
  );
}

function riskBadgeClass(risk: DailyStatusMemoryEntry["sleepRiskLevel"]) {
  if (risk === "低") return "bg-[#e8f3e5] text-sage";
  if (risk === "中") return "bg-[#fff0d8] text-[#b87425]";
  return "bg-[#ffe9e3] text-[#d66f55]";
}

function riskDotClass(risk: DailyStatusMemoryEntry["sleepRiskLevel"]) {
  if (risk === "低") return "bg-sage";
  if (risk === "中") return "bg-[#d9a24d]";
  return "bg-[#d66f55]";
}

function StatusCalendarDialog({
  dailyStatusMemory,
  feedbackMemory,
  drinks,
  selectedDate,
  setSelectedDate,
  saveFeedback,
}: {
  dailyStatusMemory: DailyStatusMemoryEntry[];
  feedbackMemory: FeedbackMemoryEntry[];
  drinks: Drink[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  saveFeedback: (date: string, entry: Omit<FeedbackMemoryEntry, "date" | "feedbackType" | "createdAt" | "updatedAt">) => void;
}) {
  const selectedStatus = dailyStatusMemory.find((item) => item.date === selectedDate) ?? dailyStatusMemory[dailyStatusMemory.length - 1];
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const detailStatus = detailDate ? dailyStatusMemory.find((item) => item.date === detailDate) : undefined;
  const selectedFeedback = feedbackMemory.find((item) => item.date === detailStatus?.date);
  const dayRecords = detailStatus
    ? drinks
        .filter((drink) => dateKey(new Date(drink.time)) === detailStatus.date)
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    : [];

  function openDay(day: DailyStatusMemoryEntry) {
    setSelectedDate(day.date);
    setDetailDate(day.date);
  }

  return (
    <DialogContent>
      <DialogTitle className="pr-10 font-display text-3xl font-bold">状态日历</DialogTitle>
      <DialogDescription className="mt-3 text-base leading-relaxed text-ink/58">
        近 14 天每天的摄入、睡前残留和反馈标记。点击日期查看当天详情。
      </DialogDescription>

      <div className="mt-6 grid grid-cols-7 gap-x-2 gap-y-4">
        {dailyStatusMemory.map((day) => (
          <button
            key={day.date}
            className={`min-h-[68px] rounded-[18px] p-2 text-left transition ${
              day.date === selectedStatus?.date ? "bg-[#fff7ec] ring-1 ring-caramel/45" : "hover:bg-white/55"
            }`}
            onClick={() => openDay(day)}
            aria-label={`${formatDateKey(day.date)}，睡眠${day.sleepRiskLevel}风险`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs font-bold text-ink/62">{shortDateKeyLabel(day.date)}</span>
              <span className={`h-2.5 w-2.5 rounded-full ${riskDotClass(day.sleepRiskLevel)}`} />
            </div>
            <p className={`mt-2 text-[11px] font-bold ${day.totalCaffeineMg > 0 ? "text-ink/45" : "text-ink/24"}`}>
              {day.totalCaffeineMg > 0 ? `${day.totalCaffeineMg}mg` : "0mg"}
            </p>
            <div className="mt-1 flex items-center gap-1">
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${riskBadgeClass(day.sleepRiskLevel)}`}>{day.sleepRiskLevel}</span>
              {day.hasFeedback && <span className="h-1.5 w-1.5 rounded-full bg-caramel/70" aria-label="已反馈" />}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-[24px] bg-white/45 p-4 text-sm leading-relaxed text-ink/50">
        颜色表示当天睡前残留风险，小圆点表示已补充反馈。日历只做按天回看，详细记录点击日期后查看。
      </div>

      {detailStatus && (
        <>
          <button className="fixed inset-0 z-[55] bg-black/20" onClick={() => setDetailDate(null)} aria-label="关闭状态详情" />
          <section className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-h-[72vh] w-full max-w-[640px] overflow-y-auto rounded-t-[2rem] bg-cream p-5 shadow-soft">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#d8c8b5]" />
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-caramel">{formatDateKey(detailStatus.date)} · {detailStatus.sleepRiskLevel}风险</p>
                <h3 className="mt-1 text-2xl font-bold text-ink">{detailStatus.beanStatus}</h3>
              </div>
              <button
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#eadccd] bg-white/70 text-xl leading-none text-ink/45"
                onClick={() => setDetailDate(null)}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <p className="rounded-[24px] bg-[#fff8ee] p-4 text-sm font-semibold leading-relaxed text-ink/62">{detailStatus.summaryText}</p>
            <div className="mt-4 rounded-[24px] bg-white/60 p-4">
              <p className="text-sm font-bold text-caramel">今日判断依据</p>
              <ul className="mt-2 space-y-1 text-sm leading-relaxed text-ink/58">
                <li>• 睡前预计残留约 {detailStatus.bedtimeResidualMg}mg，风险为{detailStatus.sleepRiskLevel}。</li>
                {detailStatus.hasEveningIntake && <li>• 当天有较晚摄入，可能让睡前残留偏高。</li>}
                {detailStatus.exceededDailyTarget && <li>• 当天摄入超过建议量，因此系统会更谨慎。</li>}
                {selectedFeedback && (selectedFeedback.palpitation || selectedFeedback.anxiety || selectedFeedback.handTremor || selectedFeedback.stomachDiscomfort) && (
                  <li>• 当天有不舒服反馈，后续单杯建议会倾向更轻。</li>
                )}
                {selectedFeedback && (selectedFeedback.sleepQuality === "bad" || selectedFeedback.fallAsleepSpeed === "slow") && (
                  <li>• 睡眠反馈显示可能受影响，晚间摄入提醒会更保守。</li>
                )}
              </ul>
              <p className="mt-2 text-xs leading-relaxed text-ink/42">这是基于记录和反馈的辅助判断，不是医疗建议。</p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <InfoPill label="当日总摄入" value={`${detailStatus.totalCaffeineMg}mg`} />
              <InfoPill label="睡前预计残留" value={`${detailStatus.bedtimeResidualMg}mg`} />
              <InfoPill label="最晚摄入" value={detailStatus.latestIntakeTime ? formatTime(detailStatus.latestIntakeTime) : "暂无"} />
              <InfoPill label="记录数量" value={`${detailStatus.recordCount}次`} />
            </div>
            {(detailStatus.hasEveningIntake || detailStatus.exceededDailyTarget) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {detailStatus.hasEveningIntake && <span className="rounded-full bg-[#fff0d8] px-3 py-1 text-xs font-bold text-[#b87425]">有晚间摄入</span>}
                {detailStatus.exceededDailyTarget && <span className="rounded-full bg-[#ffe9e3] px-3 py-1 text-xs font-bold text-[#d66f55]">超过当日建议</span>}
              </div>
            )}

            <div className="mt-5 rounded-[26px] bg-white/60 p-4">
              <p className="text-base font-bold text-ink">当日记录</p>
              {dayRecords.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {dayRecords.map((drink) => (
                    <div key={drink.id} className="flex items-center justify-between gap-3 rounded-[20px] bg-[#fffaf3] px-4 py-3">
                      <div>
                        <p className="font-bold text-ink">{drink.displayName || drink.name}</p>
                        <p className="mt-1 text-xs text-ink/45">{formatTime(drink.time)}</p>
                      </div>
                      <p className="shrink-0 font-display text-xl font-bold text-caramel">{drink.mg}<span className="ml-1 text-sm text-ink/45">mg</span></p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-[20px] bg-[#fffaf3] p-4 text-sm text-ink/45">当天暂无摄入记录</p>
              )}
            </div>

            <div className="mt-5 rounded-[26px] bg-[#eef4e8] p-4">
              <p className="text-base font-bold text-[#668f58]">反馈</p>
              <p className="mt-2 text-sm leading-relaxed text-ink/62">
                {selectedFeedback
                  ? `睡眠${selectedFeedback.sleepQuality === "good" ? "好" : selectedFeedback.sleepQuality === "bad" ? "差" : "一般"}，入睡${selectedFeedback.fallAsleepSpeed === "fast" ? "快" : selectedFeedback.fallAsleepSpeed === "slow" ? "慢" : "一般"}，提神 ${selectedFeedback.focusEffect}/5${selectedFeedback.palpitation ? "，有心悸" : ""}${selectedFeedback.anxiety ? "，有焦虑" : ""}${selectedFeedback.handTremor ? "，有手抖" : ""}${selectedFeedback.note ? `。${selectedFeedback.note}` : ""}`
                  : "这一天还没有反馈，可以补录睡眠和饮后感受。"}
              </p>
            </div>
            <CalendarFeedbackForm date={detailStatus.date} existing={selectedFeedback} saveFeedback={saveFeedback} />
          </section>
        </>
      )}
    </DialogContent>
  );
}

function CalendarFeedbackForm({
  date,
  existing,
  saveFeedback,
}: {
  date: string;
  existing?: FeedbackMemoryEntry;
  saveFeedback: (date: string, entry: Omit<FeedbackMemoryEntry, "date" | "feedbackType" | "createdAt" | "updatedAt">) => void;
}) {
  const [sleepQuality, setSleepQuality] = useState<FeedbackMemoryEntry["sleepQuality"]>(existing?.sleepQuality ?? "normal");
  const [fallAsleepSpeed, setFallAsleepSpeed] = useState<FeedbackMemoryEntry["fallAsleepSpeed"]>(existing?.fallAsleepSpeed ?? "normal");
  const [palpitation, setPalpitation] = useState(existing?.palpitation ?? false);
  const [anxiety, setAnxiety] = useState(existing?.anxiety ?? false);
  const [handTremor, setHandTremor] = useState(existing?.handTremor ?? false);
  const [focusEffect, setFocusEffect] = useState(existing?.focusEffect ?? 3);
  const [note, setNote] = useState(existing?.note ?? "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSleepQuality(existing?.sleepQuality ?? "normal");
    setFallAsleepSpeed(existing?.fallAsleepSpeed ?? "normal");
    setPalpitation(existing?.palpitation ?? false);
    setAnxiety(existing?.anxiety ?? false);
    setHandTremor(existing?.handTremor ?? false);
    setFocusEffect(existing?.focusEffect ?? 3);
    setNote(existing?.note ?? "");
    setSaved(false);
  }, [date, existing]);

  function submit() {
    saveFeedback(date, {
      sleepQuality,
      fallAsleepSpeed,
      palpitation,
      anxiety,
      stomachDiscomfort: false,
      handTremor,
      focusEffect,
      note,
    });
    setSaved(true);
  }

  return (
    <details className="mt-4 rounded-[24px] border border-[#eadccd] bg-white/45 p-4">
      <summary className="cursor-pointer list-none text-sm font-bold text-caramel">{existing ? "修改这天反馈" : "补录反馈"}</summary>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <LabelText>昨晚睡眠质量</LabelText>
          <Select value={sleepQuality} onValueChange={(value: FeedbackMemoryEntry["sleepQuality"]) => setSleepQuality(value)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="good">好</SelectItem>
              <SelectItem value="normal">一般</SelectItem>
              <SelectItem value="bad">差</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <LabelText>入睡速度</LabelText>
          <Select value={fallAsleepSpeed} onValueChange={(value: FeedbackMemoryEntry["fallAsleepSpeed"]) => setFallAsleepSpeed(value)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fast">快</SelectItem>
              <SelectItem value="normal">一般</SelectItem>
              <SelectItem value="slow">慢</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <LabelText>提神效果</LabelText>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                className={`h-11 rounded-full border text-base font-bold ${
                  focusEffect === score ? "border-caramel bg-caramel text-white" : "border-[#eadccd] bg-white/60 text-ink"
                }`}
                onClick={() => setFocusEffect(score)}
              >
                {score}
              </button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2 grid grid-cols-3 gap-2">
          {[
            ["palpitation", "心悸", palpitation, setPalpitation],
            ["anxiety", "焦虑", anxiety, setAnxiety],
            ["handTremor", "手抖", handTremor, setHandTremor],
          ].map(([key, label, checked, setter]) => (
            <button
              key={String(key)}
              className={`rounded-full border px-3 py-2 text-sm font-bold ${
                checked ? "border-caramel bg-[#fff0df] text-caramel" : "border-[#eadccd] bg-white/55 text-ink/55"
              }`}
              onClick={() => (setter as React.Dispatch<React.SetStateAction<boolean>>)(!checked)}
            >
              {String(label)}
            </button>
          ))}
        </div>
        <div className="md:col-span-2">
          <LabelText>备注</LabelText>
          <input className="field" value={note} onChange={(event) => setNote(event.target.value)} placeholder="可选，例如：睡得浅、下午喝太晚" />
        </div>
        <div className="md:col-span-2">
          <p className="mb-3 text-xs leading-relaxed text-ink/45">睡眠类反馈默认归属到所选日期对应的睡眠周期；心悸、焦虑、手抖等即时感受归属到反馈当天。</p>
          <Button className="w-full" onClick={submit}>{existing ? "保存修改" : "保存反馈"}</Button>
          {saved && <p className="mt-3 text-center text-sm font-bold text-sage">已保存，这一天会显示已反馈。</p>}
        </div>
      </div>
    </details>
  );
}

function InsightSummaryCard({
  insight,
  sensitivity,
  tolerance,
}: {
  insight: SevenDayInsight;
  sensitivity: SensitivityInsight;
  tolerance: ToleranceInsight;
}) {
  const conclusion =
    insight.highSleepRiskDays > 0
      ? `本周整体偏稳定，但有 ${insight.highSleepRiskDays} 天睡前残留偏高，晚间摄入仍需控制。`
      : insight.lateIntakeDays > 0
        ? `本周睡前残留整体可控，但有 ${insight.lateIntakeDays} 天晚间摄入，建议继续观察。`
        : "本周整体比较稳定，睡前残留处在较可控的范围内。";
  const riskTone = insight.highSleepRiskDays > 0 ? "bg-[#fff0df] text-[#c56f3d] border-[#f3c8a9]" : "bg-[#eef4e8] text-[#668f58] border-[#d8e8cf]";
  return (
    <section className="card relative mb-6 overflow-hidden rounded-[30px] border border-[#eadccd] p-6">
      <div className="pointer-events-none absolute -right-8 bottom-0 h-36 w-36 rounded-full bg-[#f7eadb]/70" />
      <div className="relative">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-caramel text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <p className="text-lg font-bold text-caramel">本周结论</p>
        </div>
        <p className="font-display text-2xl font-bold leading-relaxed text-ink md:text-3xl">{conclusion}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <span className="rounded-full border border-[#d8e8cf] bg-[#eef4e8] px-4 py-2 text-sm font-bold text-[#668f58]">
            {sensitivity.label}
          </span>
          <span className={`rounded-full border px-4 py-2 text-sm font-bold ${riskTone}`}>
            高风险 {insight.highSleepRiskDays} 天
          </span>
          <span className="rounded-full border border-[#efd4ae] bg-[#fff4e3] px-4 py-2 text-sm font-bold text-caramel">
            晚间摄入 {insight.lateIntakeDays} 天
          </span>
        </div>
        {tolerance.level !== "unknown" && (
          <p className="mt-4 text-sm leading-relaxed text-ink/52">
            {tolerance.trend === "明显升高" || tolerance.trend === "轻微升高"
              ? "最近反馈提示需要更保守一点，优先把摄入提前到下午。"
              : "目前趋势没有明显异常，继续记录会让判断更可靠。"}
          </p>
        )}
      </div>
    </section>
  );
}

function IndexSummary({ sensitivity, tolerance }: { sensitivity: SensitivityInsight; tolerance: ToleranceInsight }) {
  const toleranceDisplay =
    tolerance.level === "unknown"
      ? "数据还不够"
      : tolerance.level === "high"
        ? "提神变弱明显"
        : tolerance.level === "medium"
          ? "提神略有变化"
          : "提神反馈稳定";
  return (
    <section className="card mb-8 grid gap-4 p-5 md:grid-cols-2">
      <div className="rounded-[24px] bg-[#fff8ee] p-5">
        <p className="text-sm font-bold text-caramel">对咖啡因的敏感程度</p>
        <p className="mt-2 text-2xl font-bold text-ink">{sensitivity.label}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink/58">{sensitivity.text}</p>
      </div>
      <div className="rounded-[24px] bg-[#eef4e8] p-5">
        <p className="text-sm font-bold text-sage">耐受 / 敏感趋势</p>
        <p className="mt-2 text-2xl font-bold text-ink">{toleranceDisplay}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink/58">{tolerance.text}</p>
      </div>
    </section>
  );
}

function SensitivityExplanationPanel({ explanation }: { explanation: SensitivityExplanation }) {
  const tone =
    explanation.statusLabel === "偏敏感"
      ? "bg-[#fff0d8] text-[#b87425]"
      : explanation.statusLabel === "偏耐受"
        ? "bg-[#fff8ee] text-caramel"
        : "bg-[#e8f3e5] text-sage";
  return (
    <details className="mt-6 rounded-[28px] border border-[#eadccd] bg-white/55 p-5" open>
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-bold text-ink">为什么这样判断？</p>
            <p className="mt-1 text-sm leading-relaxed text-ink/55">根据近期摄入、反馈和你的设置生成辅助解释。</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{explanation.statusLabel}</span>
        </div>
      </summary>
      <div className="mt-5 space-y-5">
        <div className="rounded-[24px] bg-[#fff8ee] p-4">
          <p className="text-sm font-bold text-caramel">当前解释</p>
          <p className="mt-2 text-base font-semibold leading-relaxed text-ink/68">{explanation.summary}</p>
        </div>
        <div>
          <p className="text-sm font-bold text-ink">主要依据</p>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink/62">
            {explanation.reasons.map((reason) => (
              <li key={reason} className="rounded-[18px] bg-white/65 px-4 py-3">
                {reason}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-ink">关键证据</p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {explanation.evidence.map((item) => (
              <div key={item.label} className="rounded-[20px] bg-white/65 p-3">
                <p className="text-xs font-bold text-ink/45">{item.label}</p>
                <p className="mt-1 text-lg font-bold text-ink">{item.value}</p>
                {item.helper && <p className="mt-1 text-[11px] leading-relaxed text-ink/42">{item.helper}</p>}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[24px] bg-[#eef4e8] p-4">
          <p className="text-sm font-bold text-[#668f58]">校准建议</p>
          <ul className="mt-3 space-y-1 text-sm leading-relaxed text-ink/64">
            {explanation.suggestions.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-ink/45">
            当前敏感度不是永久标签，会随着后续记录和反馈逐步校准。本产品提供生活管理估算，不是医疗建议。
          </p>
        </div>
      </div>
    </details>
  );
}

function InsightCard({
  activeTab,
  setActiveTab,
  chartData,
  halfLife,
  adjustedThreshold,
  sleepHour,
  tolerance,
  sensitivity,
  insight,
  recommended,
}: {
  activeTab: "metabolism" | "tolerance" | "sleep";
  setActiveTab: (tab: "metabolism" | "tolerance" | "sleep") => void;
  chartData: { hour: number; label: string; mg: number }[];
  halfLife: number;
  adjustedThreshold: number;
  sleepHour: number;
  tolerance: ToleranceInsight;
  sensitivity: SensitivityInsight;
  insight: SevenDayInsight;
  recommended: number;
}) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const tabs = [
    { key: "metabolism", label: "代谢曲线" },
    { key: "sleep", label: "睡眠影响" },
    { key: "tolerance", label: "耐受 / 敏感" },
  ] as const;
  const hasEnoughFeedback = tolerance.level !== "unknown";
  const toleranceHint =
    tolerance.level === "unknown"
      ? "反馈数据还不够，记录几天后会更准确。"
      : tolerance.trend === "明显升高" || tolerance.trend === "轻微升高"
        ? "近期摄入和反馈提示可能需要更保守，未来几天可以尝试减少下午摄入。"
        : "当前趋势相对稳定，保持记录能让判断更可靠。";
  const toleranceDisplay =
    tolerance.level === "unknown"
      ? "数据还不够"
      : tolerance.level === "high"
        ? "耐受可能升高"
        : tolerance.level === "medium"
          ? "轻微变化"
          : "稳定";
  const sleepTrendText =
    insight.highSleepRiskDays > 0
      ? `近 7 天有 ${insight.highSleepRiskDays} 天睡前残留高于目标，建议把下午摄入再提前一点。`
      : "近 7 天睡前残留整体可控，继续保持较早摄入会更稳。";
  const highResidualDays = insight.chartData.filter((day) => day.highSleepRisk).map((day) => day.day).join("、");

  function handleTouchEnd(x: number) {
    if (touchStartX === null) return;
    const delta = x - touchStartX;
    if (Math.abs(delta) > 42) {
      const currentIndex = tabs.findIndex((tab) => tab.key === activeTab);
      const nextIndex = Math.max(0, Math.min(tabs.length - 1, currentIndex + (delta < 0 ? 1 : -1)));
      setActiveTab(tabs[nextIndex].key);
    }
    setTouchStartX(null);
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-3 rounded-full border border-[#eadccd] bg-[#fff8ee] p-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`rounded-full px-2 py-3 text-sm font-bold transition sm:text-base ${
              activeTab === tab.key ? "bg-caramel text-white shadow-button" : "text-ink/55"
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section
        id="curve"
        className="card mb-8 rounded-[32px] p-6"
        onTouchStart={(event) => setTouchStartX(event.touches[0]?.clientX ?? null)}
        onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
      >

      {activeTab === "metabolism" ? (
        <div>
          <div className="mb-4">
            <h3 className="text-xl font-bold text-ink">代谢曲线</h3>
            <p className="mt-1 text-base text-ink/55">代谢估算 {halfLife}h · 睡前更安心的目标 {adjustedThreshold}mg</p>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ left: 10, right: 12, top: 12, bottom: 0 }}>
                <defs>
                  <linearGradient id="coffeeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#A4602A" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#A4602A" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e9dcca" strokeDasharray="5 6" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#dfcfbd" }} interval={3} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v}mg`} width={54} />
                <Tooltip
                  formatter={(value) => [`${value}mg`, "体内剩余"]}
                  labelFormatter={(label) => `未来时间 ${label}`}
                  contentStyle={{ borderRadius: 18, border: "1px solid #eadccd" }}
                />
                <ReferenceLine x={chartData[0]?.label} stroke="#E48363" strokeDasharray="5 5">
                  <Label value="现在" position="top" fill="#D56F55" fontSize={13} />
                </ReferenceLine>
                <ReferenceLine x={chartData[sleepHour]?.label} stroke="#8AA77A" strokeDasharray="5 5">
                  <Label value="睡觉" position="top" fill="#6D9D61" fontSize={13} />
                </ReferenceLine>
                <ReferenceLine y={adjustedThreshold} stroke="#7EB26D" strokeDasharray="6 6">
                  <Label value={`安全 ${adjustedThreshold}mg`} position="right" fill="#5CA85B" fontSize={13} />
                </ReferenceLine>
                <Area type="monotone" dataKey="mg" stroke="#A4602A" strokeWidth={4} fill="url(#coffeeFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-4 rounded-[22px] bg-[#fff8ee] p-4 text-sm leading-relaxed text-ink/60">
            曲线会把多次摄入分别按半衰期衰减后叠加，帮助你判断睡前是否还会残留较多咖啡因。
          </p>
          <div className="mt-4">
            <KnowledgeAccordion title="咖啡因半衰期是什么？">
              <p>咖啡因不会一下子从体内消失，而是会随着时间逐步代谢。半衰期指的是体内咖啡因减少一半所需的时间。</p>
              <p>产品默认使用你的代谢类型估算，实际会受到个体代谢、作息和身体状态影响。</p>
              <p className="font-semibold text-ink/70">剩余咖啡因 = 摄入量 × 0.5 ^（经过小时数 / 半衰期）</p>
            </KnowledgeAccordion>
          </div>
        </div>
      ) : activeTab === "tolerance" ? (
        <div>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-ink">耐受 / 敏感度趋势</h3>
              <p className="mt-1 text-base text-ink/55">{tolerance.text}</p>
            </div>
            <span className="shrink-0 rounded-full bg-[#e7f2df] px-4 py-2 text-sm font-bold text-[#648b50]">
              {toleranceDisplay}
            </span>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            <InfoPill label="日均摄入" value={`${tolerance.dailyAvg}mg`} />
            <InfoPill label="今日反馈" value={`${tolerance.avgEffect}/5`} />
            <InfoPill label="敏感程度" value={sensitivity.label} />
          </div>
          <div className="h-[240px]">
            {hasEnoughFeedback ? (
              <ResponsiveContainer>
                <ComposedChart data={tolerance.chartData} margin={{ left: 8, right: 10, top: 12, bottom: 0 }}>
                  <CartesianGrid stroke="#eadfce" strokeDasharray="5 6" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: "#dfcfbd" }} />
                  <YAxis yAxisId="mg" tickLine={false} axisLine={false} width={46} tickFormatter={(v) => `${v}`} />
                  <YAxis yAxisId="score" orientation="right" domain={[0, 5]} tickLine={false} axisLine={false} width={28} />
                  <Tooltip contentStyle={{ borderRadius: 18, border: "1px solid #eadccd" }} />
                  <Bar yAxisId="mg" dataKey="mg" name="摄入 mg" fill="#C99B6E" radius={[10, 10, 4, 4]} barSize={20} />
                  <Line yAxisId="score" type="monotone" dataKey="score" name="今日反馈评分" stroke="#7EA468" strokeWidth={3} dot={{ r: 4 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-[26px] bg-[#fff8ee] px-6 text-center text-sm font-semibold leading-relaxed text-ink/55">
                反馈数据还不够，记录几天后会更准确。
              </div>
            )}
          </div>
          <div className="mt-4 rounded-[24px] bg-[#eef4e8] p-5">
            <p className="mb-3 text-base font-bold text-[#668f58]">建议解读</p>
            <ul className="space-y-2 text-sm leading-relaxed text-ink/62">
              <li>• {toleranceHint}</li>
              <li>• 当前今日推荐量约 {recommended}mg，会结合你的敏感程度和近期反馈调整。</li>
              <li>• 如果连续出现睡不好、心慌或焦虑，后续推荐量会更保守。</li>
              <li>• 这里根据摄入记录和反馈估算，不作为医学判断。</li>
            </ul>
          </div>
          <div className="mt-4">
            <KnowledgeAccordion title="耐受是什么意思？">
              <p>耐受指长期或高频摄入后，同样剂量带来的提神感可能下降。常见表现是喝得更多但还是困，或下午需要继续补咖啡。</p>
              <p>这里主要结合最近 7 天摄入量和你主动填写的反馈做轻量判断；数据不足时不会下确定结论。</p>
            </KnowledgeAccordion>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-4">
            <h3 className="text-xl font-bold text-ink">睡眠影响</h3>
            <p className="mt-1 text-base text-ink/55">看近 7 天睡前是否还有较多咖啡因残留。</p>
          </div>
          <div className="mt-5 h-[260px]">
            <ResponsiveContainer>
              <ComposedChart data={insight.chartData} margin={{ left: 8, right: 12, top: 12, bottom: 0 }}>
                <CartesianGrid stroke="#eadfce" strokeDasharray="5 6" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: "#dfcfbd" }} />
                <YAxis tickLine={false} axisLine={false} width={46} tickFormatter={(v) => `${v}`} />
                <Tooltip
                  formatter={(value) => [`${value}mg`, "睡前残留"]}
                  contentStyle={{ borderRadius: 18, border: "1px solid #eadccd" }}
                />
                <Bar dataKey="sleepResidual" name="睡前残留 mg" radius={[10, 10, 4, 4]} barSize={22}>
                  {insight.chartData.map((day) => (
                    <Cell key={day.day} fill={day.highSleepRisk ? "#EF8D55" : "#9BBE8A"} />
                  ))}
                </Bar>
                <ReferenceLine y={adjustedThreshold} stroke="#D58A5D" strokeDasharray="5 5">
                  <Label value={`安心目标 ${adjustedThreshold}mg`} position="right" fill="#B87443" fontSize={12} />
                </ReferenceLine>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 rounded-[24px] bg-[#eef4e8] p-5">
            <p className="mb-3 text-base font-bold text-[#668f58]">建议解读</p>
            <ul className="space-y-2 text-sm leading-relaxed text-ink/62">
              <li>• {sleepTrendText}</li>
              {highResidualDays && <li>• {highResidualDays} 残留偏高，可能影响入睡质量。</li>}
              <li>• 减少晚间摄入，或将咖啡提前到下午，有助于降低睡前残留。</li>
            </ul>
          </div>
          <div className="mt-4">
            <KnowledgeAccordion title="为什么咖啡因会影响睡眠？">
              <p>咖啡因会阻断困意信号，让人更清醒。如果距离睡觉时间太近，体内仍有较多残留，就可能增加入睡难度或影响睡眠质量。</p>
              <p>不同人对咖啡因的睡眠影响差异很大，所以系统会结合你的睡眠反馈动态调整提醒。</p>
            </KnowledgeAccordion>
          </div>
        </div>
      )}
      <p className="mt-4 text-center text-xs font-semibold text-ink/38">左右滑动可切换洞察视图</p>
      </section>
    </>
  );
}

function SettingsDialog({
  settings,
  setSettings,
  feedback,
  sensitivity,
  explanation,
  close,
}: {
  settings: SettingsState;
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  feedback: FeedbackState;
  sensitivity: SensitivityInsight;
  explanation: SensitivityExplanation;
  close: () => void;
}) {
  const preview = recommendationPreview(settings, feedback, sensitivity);
  const habits = habitsFromSettings(settings);
  const habitProfile = deriveCaffeineProfileFromHabits(habits);
  const note =
    habitProfile.singleCupAdvice === "prefer_low_caf"
      ? "你更适合小杯或低因饮品，系统会更早提醒暂停。"
      : habitProfile.singleCupAdvice === "prefer_half"
        ? "如果想再喝，系统会优先提示半杯更稳。"
        : habitProfile.toleranceSignal === "possible_tolerance"
          ? "系统会记录提神效果变弱的信号，但不会直接鼓励加量。"
          : "系统会按当前习惯维持平衡推荐。";

  function updateHabit(next: Partial<CaffeineHabits>) {
    setSettings((current) => {
      const merged = { ...habitsFromSettings(current), ...next };
      const updated: SettingsState = {
        ...current,
        questionnaireLatteFeeling: merged.coffeeFeeling === "not_effective" ? "no_effect" : merged.coffeeFeeling,
        questionnaireSleepImpact: merged.afternoonSleepImpact,
        questionnairePalpitation: merged.discomfortFrequency,
        questionnaireAnxiety: "never",
        strictnessMode: merged.reminderStrictness,
      };
      return applyHabitSettings(updated);
    });
  }

  return (
    <DialogContent>
      <DialogTitle className="mb-3 pr-10 font-display text-3xl font-bold">我的咖啡因习惯</DialogTitle>
      <DialogDescription className="mb-7 text-base leading-relaxed text-ink/58">
        系统会根据你的感受，自动调整每日推荐量。
      </DialogDescription>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <LabelText>计划睡觉</LabelText>
          <input className="field" type="time" value={settings.bedTime} onChange={(e) => setSettings((s) => ({ ...s, bedTime: e.target.value }))} />
        </div>
        <div>
          <LabelText>起床时间</LabelText>
          <input className="field" type="time" value={settings.wakeTime} onChange={(e) => setSettings((s) => ({ ...s, wakeTime: e.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <LabelText>你现在最想要什么？</LabelText>
          <Select value={settings.goal} onValueChange={(value: SettingsState["goal"]) => setSettings((s) => ({ ...s, goal: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="energy">保持精力</SelectItem>
              <SelectItem value="sleep">改善睡眠</SelectItem>
              <SelectItem value="reduce">减少依赖</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2 rounded-[28px] bg-[#fff8ee] p-5">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-bold text-ink">我的咖啡因习惯</p>
              <p className="mt-1 text-sm leading-relaxed text-ink/55">告诉我你的日常感受，后面的建议会更贴近你。</p>
            </div>
            <span className="shrink-0 rounded-full bg-white/70 px-3 py-2 text-xs font-bold text-caramel">
              {habitProfile.sensitivityLevel === "high" ? "高敏感" : habitProfile.sensitivityLevel === "medium" ? "中敏感" : "普通"}
            </span>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <LabelText>你平时喝一杯咖啡后的感觉？</LabelText>
              <Select value={habits.coffeeFeeling} onValueChange={(value: CaffeineHabits["coffeeFeeling"]) => updateHabit({ coffeeFeeling: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="just_right">刚刚好</SelectItem>
                  <SelectItem value="too_much">有点多</SelectItem>
                  <SelectItem value="not_effective">没什么感觉</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-ink/45">“有点多”会让系统更倾向半杯提醒。</p>
            </div>
            <div>
              <LabelText>下午喝咖啡会影响睡觉吗？</LabelText>
              <Select value={habits.afternoonSleepImpact} onValueChange={(value: CaffeineHabits["afternoonSleepImpact"]) => updateHabit({ afternoonSleepImpact: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不会</SelectItem>
                  <SelectItem value="slight">有一点</SelectItem>
                  <SelectItem value="obvious">明显会</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-ink/45">影响越明显，最晚建议饮用时间会越早。</p>
            </div>
            <div>
              <LabelText>喝咖啡后容易心慌或紧张吗？</LabelText>
              <Select value={habits.discomfortFrequency} onValueChange={(value: CaffeineHabits["discomfortFrequency"]) => updateHabit({ discomfortFrequency: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">不会</SelectItem>
                  <SelectItem value="sometimes">偶尔</SelectItem>
                  <SelectItem value="often">经常</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-ink/45">偶尔或经常不舒服时，系统会更保守。</p>
            </div>
            <div>
              <LabelText>你希望系统提醒严格一点吗？</LabelText>
              <Select value={habits.reminderStrictness} onValueChange={(value: CaffeineHabits["reminderStrictness"]) => updateHabit({ reminderStrictness: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="loose">宽松</SelectItem>
                  <SelectItem value="balanced">平衡</SelectItem>
                  <SelectItem value="strict">严格</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-ink/45">严格模式会更早提醒停止摄入。</p>
            </div>
          </div>
          {habitProfile.toleranceSignal === "possible_tolerance" && (
            <p className="mt-4 rounded-[20px] bg-white/65 p-3 text-sm font-semibold leading-relaxed text-ink/62">如果觉得没什么感觉，建议先观察提神效果变化，不建议直接加量。</p>
          )}
        </div>
      </div>
      <div className="mt-7 rounded-[28px] bg-white/65 p-5">
        <p className="text-sm font-bold text-caramel">推荐结果预览</p>
        <p className="mt-2 text-xl font-bold text-ink">按当前习惯，今天建议约 {preview}mg。</p>
        <p className="mt-2 text-base leading-relaxed text-ink/60">{note}</p>
      </div>
      <SensitivityExplanationPanel explanation={explanation} />
      <details className="mt-5 rounded-[28px] border border-[#eadccd] bg-white/55 p-5">
        <summary className="cursor-pointer list-none">
          <p className="font-bold text-ink">高级参数</p>
          <p className="mt-1 text-sm text-ink/50">不了解可以不用修改，系统会根据你的记录自动估算。</p>
        </summary>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <LabelText>每日最高参考量 mg</LabelText>
            <input className="field" type="number" min="0" value={settings.dailyBaseLimitMg} onChange={(e) => setSettings((s) => ({ ...s, dailyBaseLimitMg: Number(e.target.value) }))} />
          </div>
          <div>
            <LabelText>睡前残留目标 mg</LabelText>
            <input className="field" type="number" min="0" value={settings.safeSleepResidualMg} onChange={(e) => setSettings((s) => ({ ...s, safeThreshold: Number(e.target.value), safeSleepResidualMg: Number(e.target.value) }))} />
          </div>
          <div className="md:col-span-2">
            <LabelText>半衰期估算</LabelText>
            <Select value={settings.metabolism} onValueChange={(value: SettingsState["metabolism"]) => setSettings((s) => ({ ...s, metabolism: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fast">偏快（约 3.5 小时）</SelectItem>
                <SelectItem value="normal">普通（约 5 小时）</SelectItem>
                <SelectItem value="slow">偏慢（约 7 小时）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <LabelText>个人每日上限 mg</LabelText>
            <input className="field" type="number" min="0" value={settings.personalDailyLimitMg} onChange={(e) => setSettings((s) => ({ ...s, personalDailyLimitMg: Number(e.target.value), dailyPersonalLimitMg: Number(e.target.value) }))} />
            <p className="mt-2 text-xs text-ink/45">填 0 表示使用系统建议。</p>
          </div>
          <div className="md:col-span-2 rounded-[24px] bg-[#fff8ee] p-4">
            <p className="mb-3 text-sm font-bold text-caramel">手动参数</p>
            <div>
              <LabelText>单杯提醒参考 mg</LabelText>
              <input className="field" type="number" min="0" value={settings.singleComfortMg} onChange={(e) => setSettings((s) => ({ ...s, singleComfortMg: Number(e.target.value) }))} />
            </div>
            <div className="mt-4">
              <LabelText>不适提醒参考 mg</LabelText>
              <input className="field" type="number" min="0" value={settings.singleDiscomfortMg} onChange={(e) => setSettings((s) => ({ ...s, singleDiscomfortMg: Number(e.target.value) }))} />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Button variant="outline" onClick={() => setSettings((s) => applyHabitSettings(s))}>按当前习惯重置推荐参数</Button>
              <Button variant="ghost" onClick={() => setSettings(defaultSettings)}>恢复默认设置</Button>
            </div>
          </div>
        </div>
      </details>
      <div className="mt-4">
        <KnowledgeAccordion title="为什么要记录这些习惯？">
          <p>不同人喝咖啡后的感受差异很大。你只需要告诉我大概感受，系统会在后台调整提醒节奏。</p>
          <p>本产品提供的是生活管理估算，不是医疗诊断；如果持续不适，建议减少摄入或咨询专业人士。</p>
        </KnowledgeAccordion>
      </div>
      <DialogClose asChild>
        <Button className="mt-8 w-full" onClick={close}>保存设置</Button>
      </DialogClose>
    </DialogContent>
  );
}

function FeedbackDialog({
  feedback,
  setFeedback,
  settings,
  setSettings,
  bean,
  tolerance,
  latestDoseMg,
  sleepRemaining,
  close,
  afterSave,
}: {
  feedback: FeedbackState;
  setFeedback: React.Dispatch<React.SetStateAction<FeedbackState>>;
  settings: SettingsState;
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  bean: Bean;
  tolerance: ToleranceInsight;
  latestDoseMg: number;
  sleepRemaining: number;
  close: () => void;
  afterSave: (text: string) => void;
}) {
  const [savedText, setSavedText] = useState("");
  const impact = feedbackImpact(feedback);
  const discomfortText =
    feedback.sideEffect === "anxiety"
      ? "有点焦虑"
      : feedback.sideEffect === "palpitation"
        ? "有点心慌"
        : feedback.sideEffect === "stomach"
          ? "胃不舒服"
          : feedback.sideEffect === "tremor"
            ? "有点手抖"
            : "没有不舒服";

  function saveFeedback() {
    const text = "已记录。系统会根据你的感受，微调后续推荐量。";
    setFeedback((f) => ({ ...f, updatedAt: new Date().toISOString() }));
    setSettings((s) => calibrateSettingsFromFeedback(s, feedback, latestDoseMg, sleepRemaining));
    setSavedText(text);
    afterSave(text);
  }

  return (
    <DialogContent>
      <DialogTitle className="mb-3 pr-10 font-display text-3xl font-bold">今天喝完感觉如何？</DialogTitle>
      <DialogDescription className="mb-7 text-base leading-relaxed text-ink/58">
        只需要记录感受，后续推荐会慢慢贴近你的节奏。
      </DialogDescription>
      <div className="space-y-7">
        <div>
          <LabelText>提神效果</LabelText>
          <div className="grid grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                className={`h-14 rounded-full border text-xl font-semibold ${feedback.effect === score ? "border-caramel bg-caramel text-white" : "border-[#e6d9ca] bg-white/65 text-ink"}`}
                onClick={() => setFeedback((f) => ({ ...f, effect: score }))}
              >
                {score}
              </button>
            ))}
          </div>
        </div>
        <div>
          <LabelText>有没有不舒服？</LabelText>
          <Select value={feedback.sideEffect} onValueChange={(value: FeedbackState["sideEffect"]) => setFeedback((f) => ({ ...f, sideEffect: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">没有</SelectItem>
              <SelectItem value="anxiety">有点焦虑</SelectItem>
              <SelectItem value="palpitation">有点心慌</SelectItem>
              <SelectItem value="stomach">胃不舒服</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <LabelText>昨晚睡得怎么样？</LabelText>
          <Select value={feedback.sleepQuality} onValueChange={(value: FeedbackState["sleepQuality"]) => setFeedback((f) => ({ ...f, sleepQuality: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="good">好</SelectItem>
              <SelectItem value="normal">一般</SelectItem>
              <SelectItem value="bad">差</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <LabelText>今天有没有觉得越喝越没用？</LabelText>
          <Select value={feedback.lessEffective} onValueChange={(value: FeedbackState["lessEffective"]) => setFeedback((f) => ({ ...f, lessEffective: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">没有</SelectItem>
              <SelectItem value="slight">有一点</SelectItem>
              <SelectItem value="yes">明显有</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={`mt-7 rounded-[28px] p-5 ${bean.tone}`}>
        <div className="flex gap-4">
          <BeanFace bean={bean} size="sm" animated={Boolean(savedText)} />
          <div>
            <p className="font-bold text-ink">最近感受摘要</p>
            <p className="mt-1 text-sm leading-relaxed text-ink/65">
              提神效果 {feedback.effect}/5，{discomfortText}，昨晚睡得{feedback.sleepQuality === "good" ? "好" : feedback.sleepQuality === "bad" ? "差" : "一般"}。{impact}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <KnowledgeAccordion title="为什么记录感受有帮助？">
          <p>同样一杯咖啡，每个人的感受都可能不同。记录提神感、睡眠和不舒服的情况，可以让系统慢慢调准提醒节奏。</p>
          <p>如果你反馈心慌、焦虑或提神效果变弱，系统会更谨慎地给出后续建议。</p>
        </KnowledgeAccordion>
      </div>
      {savedText && <div className="mt-4 rounded-[24px] bg-white/70 p-4 text-base font-semibold leading-relaxed text-ink/70">{savedText}</div>}
      <Button className="mt-8 w-full" onClick={saveFeedback}>保存今日感受</Button>
      <DialogClose asChild>
        <Button variant="ghost" className="mt-3 w-full" onClick={close}>完成</Button>
      </DialogClose>
    </DialogContent>
  );
}

function RecordItem({
  drink,
  updateDrinkMg,
  deleteDrink,
}: {
  drink: Drink;
  updateDrinkMg: (id: string, mg: number) => void;
  deleteDrink: (id: string) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deletePermission = permissionGuard("deleteIntakeRecord", { id: drink.id, name: drink.name });

  function requestDelete() {
    if (deletePermission.requiresConfirmation) {
      setConfirmOpen(true);
      return;
    }
    deleteDrink(drink.id);
  }

  function confirmDelete() {
    setConfirmOpen(false);
    deleteDrink(drink.id);
  }

  return (
    <article className="card flex items-start gap-4 p-5">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#dff1d8] text-2xl">
        {categoryIcon(drink.category)}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-lg font-bold">{drink.name}</h3>
        <p className="text-ink/55">{formatTime(drink.time)} {drink.note ? `· ${drink.note}` : ""}</p>
      </div>
      <input
        className="w-20 shrink-0 rounded-full border border-[#eadccd] bg-white/70 px-3 py-2 text-right font-display text-2xl text-caramel outline-none focus:ring-4 focus:ring-caramel/20"
        type="number"
        min="0"
        value={drink.mg}
        onChange={(event) => updateDrinkMg(drink.id, Number(event.target.value))}
        aria-label={`${drink.name} 咖啡因含量`}
      />
      <span className="text-sm text-ink/60">mg</span>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <button className="text-[#d66f55]" onClick={requestDelete} aria-label={`删除 ${drink.name}`}>
          <Trash2 className="h-5 w-5" />
        </button>
        <DialogContent>
          <DialogTitle className="pr-10 font-display text-3xl font-bold">确认删除这条记录？</DialogTitle>
          <DialogDescription className="mt-4 text-base leading-relaxed text-ink/60">
            删除后会影响今日摄入、残留计算和趋势统计。
          </DialogDescription>
          <div className="mt-6 rounded-[24px] bg-[#fff8ee] p-4">
            <p className="text-sm font-bold text-caramel">{drink.name}</p>
            <p className="mt-1 text-sm text-ink/55">
              {formatTime(drink.time)} · {drink.mg}mg
            </p>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            <DialogClose asChild>
              <Button variant="ghost">取消</Button>
            </DialogClose>
            <Button className="bg-[#d66f55] hover:bg-[#c76049]" onClick={confirmDelete}>
              确认删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function BottomNav({
  activeTab,
  setActiveTab,
}: {
  activeTab: MainTab;
  setActiveTab: (tab: MainTab) => void;
}) {
  const items = [
    { key: "today", label: "今天", icon: Home },
    { key: "records", label: "记录", icon: ClipboardList },
    { key: "insights", label: "洞察", icon: BarChart3 },
    { key: "mine", label: "我的", icon: Settings },
  ] as const;
  return (
    <nav className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-[min(94vw,520px)] justify-center rounded-[28px] border border-[#eadccd] bg-white/86 p-2 shadow-soft backdrop-blur">
      {items.map((item) => {
        const Icon = item.icon;
        const selected = activeTab === item.key;
        return (
          <button
            key={item.label}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[22px] px-2 py-3 text-sm font-bold transition ${
              selected ? "bg-[#f3e6d6] text-caramel shadow-sm" : "text-ink/42 hover:bg-[#fff7eb] hover:text-ink/60"
            }`}
            onClick={() => {
              setActiveTab(item.key);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <Icon className={`h-4 w-4 ${selected ? "text-caramel" : "text-ink/35"}`} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

export default App;
