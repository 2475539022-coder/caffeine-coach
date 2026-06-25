import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
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
  BarChart3,
  ClipboardList,
  Coffee,
  Home,
  NotebookPen,
  Plus,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { BeanAvatar, type BeanAvatarStatus } from "./components/BeanAvatar";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";

type Drink = {
  id: string;
  name: string;
  type: string;
  mg: number;
  time: string;
  note: string;
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
  sideEffect: "none" | "anxiety" | "palpitation" | "stomach";
  sleepQuality: "good" | "normal" | "bad";
  sleepLatency: "fast" | "slow" | "hard";
  afternoonIntake: "yes" | "no";
  lessEffective: "yes" | "no";
  palpitationToday: "yes" | "no";
  anxietyToday: "yes" | "no";
  updatedAt?: string;
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

type ToleranceInsight = {
  level: "low" | "medium" | "high" | "unknown";
  label: string;
  dailyAvg: number;
  avgEffect: number;
  trend: "稳定" | "轻微升高" | "明显升高" | "正在恢复" | "数据不足";
  text: string;
  chartData: { day: string; mg: number; score: number | null }[];
};

const STORAGE_KEY = "caffeine-coach-demo-v1";

const quickDrinks = [
  { name: "美式", type: "咖啡", mg: 150, icon: "☕" },
  { name: "拿铁", type: "咖啡", mg: 120, icon: "🥛" },
  { name: "奶茶", type: "茶饮", mg: 80, icon: "🧋" },
  { name: "红茶", type: "茶", mg: 50, icon: "🍵" },
  { name: "绿茶", type: "茶", mg: 30, icon: "🍃" },
  { name: "可乐", type: "汽水", mg: 35, icon: "🥤" },
  { name: "能量饮料", type: "功能饮料", mg: 160, icon: "⚡" },
];

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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      drinks?: Drink[];
      settings?: SettingsState;
      feedback?: Partial<FeedbackState>;
    };
    return {
      drinks: parsed.drinks ?? defaultDrinks,
      settings: normalizeSettings(parsed.settings),
      feedback: normalizeFeedback(parsed.feedback),
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
  if (profile === "high_tolerance") return "高耐受型";
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
    feedback.lessEffective === "no";

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
  } else if (feedback.lessEffective === "yes") {
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
      text: "记录更多数据后，我会生成耐受指数，判断是否越喝越没效果。",
    };
  }

  const high = (dailyAvg > 250 && avgEffect < 3) || feedback.lessEffective === "yes";
  const medium = dailyAvg >= 150 || avgEffect === 3 || secondHalf - firstHalf > 50;
  const low = dailyAvg < 150 && avgEffect >= 4;
  const recovering = feedback.afternoonIntake === "no" && dailyAvg < 180 && feedback.sleepQuality !== "bad";
  const trend =
    recovering ? "正在恢复" : high ? "明显升高" : secondHalf - firstHalf > 35 || feedback.lessEffective === "yes" ? "轻微升高" : "稳定";

  if (high) {
    return {
      level: "high",
      label: "高耐受",
      dailyAvg,
      avgEffect,
      trend,
      chartData: days,
      text: "你的耐受可能正在升高。最近摄入较多或提神反馈下降，建议未来 3 天降低下午摄入。",
    };
  }
  if (medium && !low) {
    return {
      level: "medium",
      label: "中耐受",
      dailyAvg,
      avgEffect,
      trend,
      chartData: days,
      text: "你的耐受处于中等水平。可以保留上午咖啡，把下午摄入改成小剂量或低因。",
    };
  }
  return {
    level: "low",
    label: "低耐受",
    dailyAvg,
    avgEffect,
    trend,
    chartData: days,
    text: "你的 7 日耐受水平较低。最近摄入量不高，提神反馈较好，继续保持即可。",
  };
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
  const overPersonalLimit = settings.personalDailyLimitMg > 0 && todayTotal > settings.personalDailyLimitMg;
  if (
    feedback.sideEffect === "palpitation" ||
    feedback.palpitationToday === "yes" ||
    latestDoseMg >= settings.palpitationTriggerMg ||
    overPersonalLimit
  ) {
    return {
      name: "心慌豆",
      status: "palpitation",
      tone: "bg-[#ffe7df]",
      chip: "text-[#cb694f] bg-white/65",
      color: "#DD7A61",
      text: "身体已经有明显提醒，今天建议暂停咖啡因。",
    };
  }
  if (
    feedback.sideEffect === "anxiety" ||
    feedback.anxietyToday === "yes" ||
    latestDoseMg >= settings.anxietyTriggerMg ||
    sleepRemaining > settings.safeSleepResidualMg ||
    sleepRisk === "高"
  ) {
    return {
      name: "焦虑豆",
      status: "anxious",
      tone: "bg-[#e9f2df]",
      chip: "text-[#c66a4e] bg-white/65",
      color: "#D97D5D",
      text: "咖啡因负荷偏高，今天建议谨慎摄入。",
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
      text: "摄入合理，提神收益不错，今天状态在线。",
    };
  }
  return {
    name: "平稳豆",
    status: "stable",
    tone: "bg-[#edf1df]",
    chip: "text-[#7a704b] bg-white/70",
    color: "#9AA36B",
    text: "状态整体平稳，继续保持当前节奏。",
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
  if (sleepRemaining <= settings.safeSleepResidualMg && risk === "低") tags.push("睡眠低风险");
  if (sleepRemaining > settings.safeSleepResidualMg || risk === "高") tags.push("睡眠高风险");
  if (latestDrink && new Date(latestDrink.time) > safeDrinkDeadline(settings, halfLives[settings.metabolism])) tags.push("晚间摄入");
  if (todayTotal > recommended) tags.push("已超推荐量");
  if (sensitivity.level === "high") tags.push("高敏感");
  if (tolerance.level === "high" || tolerance.trend === "轻微升高" || tolerance.trend === "明显升高") tags.push("耐受升高");
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
  if (feedback.sideEffect === "palpitation") return "今天建议：出现心悸反馈，先停止咖啡因摄入";
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
  if (feedback.sideEffect === "palpitation" || feedback.palpitationToday === "yes") return "你反馈有心悸，系统会适当降低推荐摄入量。";
  if (feedback.sideEffect === "anxiety" || feedback.anxietyToday === "yes") return "你反馈有焦虑，系统会更谨慎地判断单次摄入量。";
  if (feedback.sleepLatency !== "fast" || feedback.afternoonIntake === "yes") return "你反馈入睡变慢或下午后仍摄入，系统会更谨慎地提示最晚饮用时间。";
  if (feedback.lessEffective === "yes") return "你反馈越喝越没用，系统会提高耐受警示并降低推荐上限。";
  if (feedback.effect >= 4 && feedback.sleepQuality === "good") return "提神反馈较好且睡眠稳定，系统会维持当前推荐策略。";
  return "系统会把这次反馈纳入敏感指数、耐受指数和后续推荐量。";
}

function feedbackFactor(feedback: FeedbackState) {
  let factor = 1;
  if (feedback.lessEffective === "yes") factor *= 0.92;
  if (feedback.sideEffect === "palpitation" || feedback.palpitationToday === "yes") factor *= 0.82;
  else if (feedback.sideEffect === "anxiety" || feedback.anxietyToday === "yes") factor *= 0.88;
  if (feedback.sleepLatency === "hard") factor *= 0.88;
  else if (feedback.sleepLatency === "slow") factor *= 0.95;
  return factor;
}

function recommendationPreview(settings: SettingsState, feedback: FeedbackState, sensitivity: SensitivityInsight) {
  const raw = Math.round(
    settings.dailyBaseLimitMg *
      metabolismFactors[settings.metabolism] *
      sensitivity.coefficient *
      sleepFactors[feedback.sleepQuality] *
      goalFactors[settings.goal] *
      feedbackFactor(feedback) *
      strictnessFactor(settings.strictnessMode),
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

function App() {
  const initial = loadState();
  const [drinks, setDrinks] = useState<Drink[]>(initial?.drinks ?? defaultDrinks);
  const [settings, setSettings] = useState<SettingsState>(initial?.settings ?? defaultSettings);
  const [feedback, setFeedback] = useState<FeedbackState>(initial?.feedback ?? defaultFeedback);
  const [recordOpen, setRecordOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [toastBean, setToastBean] = useState<{ bean: Bean; text: string } | null>(null);
  const [insightTab, setInsightTab] = useState<"metabolism" | "tolerance">("metabolism");
  const [recordDraft, setRecordDraft] = useState({
    name: "美式",
    type: "咖啡",
    mg: 150,
    time: toInputDateTime(new Date()),
    note: "",
  });
  const [simulation, setSimulation] = useState({ name: "拿铁", type: "咖啡", mg: 120 });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ drinks, settings, feedback }));
  }, [drinks, settings, feedback]);

  const tolerance = useMemo(() => buildToleranceInsight(drinks, feedback), [drinks, feedback]);

  const derived = useMemo(() => {
    const now = new Date();
    const todayDrinks = drinks.filter((drink) => isSameDay(drink.time, now));
    const todayTotal = todayDrinks.reduce((sum, drink) => sum + drink.mg, 0);
    const halfLife = halfLives[settings.metabolism];
    const current = totalRemaining(drinks, now, halfLife);
    const bedDate = getBedDate(settings.bedTime, now);
    const sleepRemaining = totalRemaining(drinks, bedDate, halfLife);
    const sensitivity = buildSensitivityInsight(settings, feedback, sleepRemaining);
    const rawRecommended = Math.round(
      settings.dailyBaseLimitMg *
        metabolismFactors[settings.metabolism] *
        sensitivity.coefficient *
        sleepFactors[feedback.sleepQuality] *
        goalFactors[settings.goal] *
        feedbackFactor(feedback) *
        strictnessFactor(settings.strictnessMode),
    );
    const recommended = settings.personalDailyLimitMg > 0 ? Math.min(rawRecommended, settings.personalDailyLimitMg) : rawRecommended;
    const canDrink = Math.max(0, recommended - todayTotal);
    const adjustedThreshold =
      feedback.sleepLatency === "hard" || feedback.afternoonIntake === "yes"
        ? Math.max(15, settings.safeSleepResidualMg - 5)
        : settings.safeSleepResidualMg;
    const risk = riskLevel(sleepRemaining, adjustedThreshold);
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
      deadline,
      lastDrink,
      conclusion: conclusionText({ todayTotal, recommended, canDrink, sleepRemaining, risk, settings, feedback }),
      basis: basisText(settings, feedback),
    };
  }, [drinks, feedback, settings, tolerance]);

  const simResult = useMemo(() => {
    const now = new Date();
    const bedDate = getBedDate(settings.bedTime, now);
    const synthetic: Drink = {
      id: "simulation",
      name: simulation.name,
      type: simulation.type,
      mg: simulation.mg,
      time: now.toISOString(),
      note: "",
    };
    const sleepRemaining = Math.round(totalRemaining([...drinks, synthetic], bedDate, derived.halfLife));
    const risk = riskLevel(sleepRemaining, derived.adjustedThreshold);
    const afterTotal = derived.todayTotal + simulation.mg;
    const exceedsPalpitation = simulation.mg >= settings.palpitationTriggerMg;
    const exceedsAnxiety = simulation.mg >= settings.anxietyTriggerMg;
    const exceedsComfort = simulation.mg > settings.singleComfortMg;
    const overPersonalLimit = settings.personalDailyLimitMg > 0 && afterTotal > settings.personalDailyLimitMg;
    const decision =
      exceedsPalpitation || overPersonalLimit
        ? "不建议喝完整一杯"
        : exceedsAnxiety || risk === "高" || afterTotal > derived.recommended
        ? "不建议喝完整一杯"
        : risk === "中" || exceedsComfort
          ? "建议改成半杯或低因"
          : "可以饮用";
    const advice =
      exceedsPalpitation
        ? `这杯超过了你的心悸触发阈值 ${settings.palpitationTriggerMg}mg，建议改为半杯或低因。`
        : overPersonalLimit
          ? "这杯会超过你的个人每日上限，今天建议暂停咖啡因。"
          : exceedsAnxiety
            ? `这杯超过了你的焦虑触发阈值 ${settings.anxietyTriggerMg}mg，建议改成半杯。`
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
      `按${settings.metabolism === "fast" ? "快" : settings.metabolism === "slow" ? "慢" : "普通"}半衰期估算，睡前残留会${sleepRemaining > derived.adjustedThreshold ? "超过" : "低于"}安全阈值 ${derived.adjustedThreshold}mg。`,
      `你的单次舒适量为 ${settings.singleComfortMg}mg，心悸触发阈值为 ${settings.palpitationTriggerMg}mg。`,
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

  function selectQuickDrink(name: string, target: "record" | "sim") {
    const selected = quickDrinks.find((drink) => drink.name === name);
    if (!selected) return;
    if (target === "record") {
      setRecordDraft((draft) => ({ ...draft, name: selected.name, type: selected.type, mg: selected.mg }));
    } else {
      setSimulation({ name: selected.name, type: selected.type, mg: selected.mg });
    }
  }

  function addRecord() {
    setDrinks((items) => [
      {
        id: crypto.randomUUID(),
        name: recordDraft.name,
        type: recordDraft.type,
        mg: Number(recordDraft.mg) || 0,
        time: fromInputDateTime(recordDraft.time),
        note: recordDraft.note,
      },
      ...items,
    ]);
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
      },
      ...items,
    ]);
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
    setDrinks((items) => items.filter((drink) => drink.id !== id));
  }

  const progress = Math.min(100, Math.round((derived.todayTotal / Math.max(derived.recommended, 1)) * 100));
  const riskColor =
    derived.risk === "低" ? "text-sage bg-[#e8f3e5]" : derived.risk === "中" ? "text-[#b87425] bg-[#fff0d8]" : "text-[#d66f55] bg-[#ffe9e3]";
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
            <p className="text-base text-ink/55">{todayLabel()}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="主观反馈">
                <NotebookPen className="h-6 w-6" />
              </Button>
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
              afterSave={(text) => setToastBean({ bean: derived.bean, text })}
            />
          </Dialog>
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="个性化设置">
                <Settings className="h-6 w-6" />
              </Button>
            </DialogTrigger>
            <SettingsDialog settings={settings} setSettings={setSettings} feedback={feedback} sensitivity={derived.sensitivity} close={() => setSettingsOpen(false)} />
          </Dialog>
        </div>
      </header>

      {toastBean && (
        <button className={`mb-5 flex w-full items-center gap-4 rounded-[28px] p-4 text-left ${toastBean.bean.tone}`} onClick={() => setToastBean(null)}>
          <BeanFace bean={toastBean.bean} size="sm" animated />
          <div>
            <p className="font-bold text-ink">今日豆豆 · {toastBean.bean.name}</p>
            <p className="text-sm leading-relaxed text-ink/65">{toastBean.text}</p>
          </div>
        </button>
      )}

      <section className="card mb-7 p-7">
        <div className="rounded-[26px] bg-[#f7ead9] p-5">
          <p className="text-sm font-bold text-caramel">今日结论</p>
          <h2 className="mt-2 text-2xl font-bold leading-snug text-ink">{derived.conclusion}</h2>
          <p className="mt-3 text-base leading-relaxed text-ink/62">{derived.basis}</p>
        </div>

        <div className="mt-7 flex items-start justify-between gap-5">
          <div>
            <p className="text-lg font-semibold text-ink/55">今日建议摄入量</p>
            <div className="mt-2 flex items-end gap-3">
              <strong className="font-display text-7xl leading-none text-caramel">{derived.recommended}</strong>
              <span className="mb-2 text-2xl text-ink/60">mg</span>
            </div>
          </div>
          <span className={`rounded-full px-4 py-2 text-sm font-bold ${riskColor}`}>{derived.risk}风险</span>
        </div>

        <div className="mt-7 h-3 rounded-full bg-[#eadfd7]">
          <div className="h-full rounded-full bg-caramel" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-4 flex justify-between text-base font-medium text-ink/55">
          <span>已摄入 {derived.todayTotal}mg</span>
          <span>还可摄入 {derived.canDrink}mg</span>
        </div>
        <div className="mt-5 grid gap-3 rounded-[24px] bg-[#fff8ee] p-4 text-sm text-ink/62">
          <p>最晚建议饮用时间：<strong className="text-ink">{formatClock(derived.deadline)} 前</strong></p>
          <p>推荐依据：{derived.basis}</p>
        </div>

        <div className={`mt-7 flex items-center gap-5 rounded-[28px] p-5 ${derived.bean.tone}`}>
          <BeanFace bean={derived.bean} animated />
          <div>
            <p className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${derived.bean.chip}`}>今日豆豆 · {derived.bean.name}</p>
            <p className="mt-3 text-lg font-semibold leading-relaxed text-ink/72">{derived.bean.text}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {derived.auxTags.map((tag) => (
                <span key={tag} className="rounded-full bg-white/60 px-3 py-1 text-xs font-bold text-ink/55">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-4">
          <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
            <DialogTrigger asChild>
              <Button className="w-full">
                <Plus className="h-6 w-6" />
                记录一杯
              </Button>
            </DialogTrigger>
            <RecordDialog
              draft={recordDraft}
              setDraft={setRecordDraft}
              selectQuick={(name) => selectQuickDrink(name, "record")}
              addRecord={addRecord}
            />
          </Dialog>
          <Dialog open={simOpen} onOpenChange={setSimOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full">
                <Sparkles className="h-5 w-5" />
                喝前模拟
              </Button>
            </DialogTrigger>
            <SimulationDialog
              simulation={simulation}
              setSimulation={setSimulation}
              selectQuick={(name) => selectQuickDrink(name, "sim")}
              result={simResult}
              settings={settings}
              recordSimulation={recordSimulation}
              skipSimulation={skipSimulation}
            />
          </Dialog>
        </div>
      </section>

      <section className="mb-7 grid grid-cols-2 gap-4">
        <MetricCard title="当前体内剩余" value={derived.current} suffix="mg" sub={`状态：${derived.currentStatus}`} foot={`半衰期 ${derived.halfLife}h`} />
        <MetricCard
          title="睡前预计残留"
          value={derived.sleepRemaining}
          suffix="mg"
          sub={`状态：${derived.risk}风险`}
          foot={`目标 ≤ ${derived.adjustedThreshold}mg`}
          accent
        />
      </section>

      <section className="card mb-7 flex items-center justify-between p-6">
        <div>
          <p className="text-lg font-semibold text-ink/55">睡眠风险</p>
          <p className="mt-2 text-4xl font-semibold text-ink">{derived.risk} <span className="text-2xl text-ink/55">风险</span></p>
        </div>
        <span className={`rounded-full px-5 py-3 text-base font-bold ${riskColor}`}>阈值 {derived.adjustedThreshold}mg</span>
      </section>

      <InsightCard
        activeTab={insightTab}
        setActiveTab={setInsightTab}
        chartData={derived.chartData}
        halfLife={derived.halfLife}
        adjustedThreshold={derived.adjustedThreshold}
        sleepHour={derived.sleepHour}
        tolerance={tolerance}
      />

      <IndexSummary sensitivity={derived.sensitivity} tolerance={tolerance} />

      <section id="records" className="mb-5 flex items-center justify-between px-2">
        <h2 className="font-display text-2xl font-bold">摄入记录</h2>
        <div className="flex items-center gap-2 text-caramel">
          <ClipboardList className="h-5 w-5" />
          <span className="font-semibold">全部记录</span>
        </div>
      </section>

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

      <footer className="pb-12 text-center text-sm text-ink/50">Caffeine Coach · Demo · 数据仅保存在你的设备上</footer>
      <BottomNav />
    </main>
  );
}

function BeanFace({ bean, size = "md", animated = false }: { bean: Bean; size?: "sm" | "md" | "lg"; animated?: boolean }) {
  return <BeanAvatar status={bean.status} size={size} animated={animated} label={bean.name} />;
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

function LabelText({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-base font-bold text-ink">{children}</label>;
}

function RecordDialog({
  draft,
  setDraft,
  selectQuick,
  addRecord,
}: {
  draft: { name: string; type: string; mg: number; time: string; note: string };
  setDraft: React.Dispatch<React.SetStateAction<{ name: string; type: string; mg: number; time: string; note: string }>>;
  selectQuick: (name: string) => void;
  addRecord: () => void;
}) {
  return (
    <DialogContent>
      <DialogTitle className="mb-7 pr-10 font-display text-3xl font-bold">记录一杯</DialogTitle>
      <DialogDescription className="sr-only">新增咖啡因摄入记录</DialogDescription>
      <div className="mb-6 flex flex-wrap gap-3">
        {quickDrinks.map((drink) => (
          <button
            key={drink.name}
            onClick={() => selectQuick(drink.name)}
            className={`rounded-full border px-4 py-2 font-semibold ${draft.name === drink.name ? "border-caramel bg-caramel text-white" : "border-[#e6d9ca] bg-white/60 text-ink"}`}
          >
            {drink.icon} {drink.name}
          </button>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <LabelText>饮品名称</LabelText>
          <input className="field" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        </div>
        <div>
          <LabelText>饮品类型</LabelText>
          <input className="field" value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))} />
        </div>
        <div>
          <LabelText>咖啡因含量 mg</LabelText>
          <input className="field" type="number" min="0" value={draft.mg} onChange={(e) => setDraft((d) => ({ ...d, mg: Number(e.target.value) }))} />
        </div>
        <div>
          <LabelText>摄入时间</LabelText>
          <input className="field" type="datetime-local" value={draft.time} onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <LabelText>备注</LabelText>
          <input className="field" value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder="例如：下午提神、会议前" />
        </div>
      </div>
      <Button className="mt-8 w-full" onClick={addRecord}>保存记录</Button>
    </DialogContent>
  );
}

function SimulationDialog({
  simulation,
  setSimulation,
  selectQuick,
  result,
  settings,
  recordSimulation,
  skipSimulation,
}: {
  simulation: { name: string; type: string; mg: number };
  setSimulation: React.Dispatch<React.SetStateAction<{ name: string; type: string; mg: number }>>;
  selectQuick: (name: string) => void;
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
}) {
  function halveDrink() {
    setSimulation((s) => ({ ...s, mg: Math.max(1, Math.round(s.mg / 2)) }));
  }

  return (
    <DialogContent>
      <DialogTitle className="mb-6 pr-10 font-display text-3xl font-bold">喝前模拟</DialogTitle>
      <DialogDescription className="sr-only">模拟现在摄入一杯饮品后的睡前残留</DialogDescription>
      <div className="mb-6 flex flex-wrap gap-3">
        {quickDrinks.map((drink) => (
          <button
            key={drink.name}
            onClick={() => selectQuick(drink.name)}
            className={`rounded-full border px-4 py-2 font-semibold ${simulation.name === drink.name ? "border-caramel bg-caramel text-white" : "border-[#e6d9ca] bg-white/60 text-ink"}`}
          >
            {drink.icon} {drink.name}
          </button>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <LabelText>想喝的饮品</LabelText>
          <input className="field" value={simulation.name} onChange={(e) => setSimulation((s) => ({ ...s, name: e.target.value }))} />
        </div>
        <div>
          <LabelText>咖啡因含量 mg</LabelText>
          <input className="field" type="number" min="0" value={simulation.mg} onChange={(e) => setSimulation((s) => ({ ...s, mg: Number(e.target.value) }))} />
        </div>
      </div>
      <div className={`mt-7 rounded-[28px] p-6 ${result.bean.tone}`}>
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
          <p className="mt-3 text-xs text-ink/45">当前睡前安全阈值：{settings.safeSleepResidualMg}mg</p>
        </div>
        <div className="mt-4">
          <KnowledgeAccordion title="为什么不建议继续喝？">
            <p>咖啡因会阻断困意信号，让人更清醒。如果距离睡觉时间太近，体内仍有较多残留，就可能增加入睡难度或影响睡眠质量。</p>
            <p>如果这杯超过你的心悸、焦虑或单次舒适阈值，系统会优先建议半杯、低因或暂停摄入。</p>
          </KnowledgeAccordion>
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

function IndexSummary({ sensitivity, tolerance }: { sensitivity: SensitivityInsight; tolerance: ToleranceInsight }) {
  return (
    <section className="card mb-8 grid gap-4 p-5 md:grid-cols-2">
      <div className="rounded-[24px] bg-[#fff8ee] p-5">
        <p className="text-sm font-bold text-caramel">敏感指数</p>
        <p className="mt-2 text-2xl font-bold text-ink">{sensitivity.label}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink/58">{sensitivity.text}</p>
      </div>
      <div className="rounded-[24px] bg-[#eef4e8] p-5">
        <p className="text-sm font-bold text-sage">耐受指数</p>
        <p className="mt-2 text-2xl font-bold text-ink">{tolerance.label}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink/58">{tolerance.text}</p>
      </div>
    </section>
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
}: {
  activeTab: "metabolism" | "tolerance";
  setActiveTab: (tab: "metabolism" | "tolerance") => void;
  chartData: { hour: number; label: string; mg: number }[];
  halfLife: number;
  adjustedThreshold: number;
  sleepHour: number;
  tolerance: ToleranceInsight;
}) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const toleranceHint =
    tolerance.level === "unknown"
      ? "继续记录 3-5 天后可更准确判断趋势。"
      : tolerance.trend === "明显升高" || tolerance.trend === "轻微升高"
        ? "耐受有升高迹象，未来几天可以尝试减少下午摄入。"
        : "当前趋势相对稳定，保持记录能让判断更可靠。";

  function handleTouchEnd(x: number) {
    if (touchStartX === null) return;
    const delta = x - touchStartX;
    if (Math.abs(delta) > 42) {
      setActiveTab(delta < 0 ? "tolerance" : "metabolism");
    }
    setTouchStartX(null);
  }

  return (
    <section
      id="curve"
      className="card mb-8 p-6"
      onTouchStart={(event) => setTouchStartX(event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-caramel">咖啡因洞察</p>
          <h2 className="mt-1 font-display text-2xl font-bold">今天的代谢与耐受</h2>
        </div>
        <div className="flex rounded-full border border-[#eadccd] bg-[#fff8ee] p-1">
          {[
            { key: "metabolism", label: "代谢曲线" },
            { key: "tolerance", label: "耐受趋势" },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                activeTab === tab.key ? "bg-caramel text-white shadow-sm" : "text-ink/55"
              }`}
              onClick={() => setActiveTab(tab.key as "metabolism" | "tolerance")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "metabolism" ? (
        <div>
          <div className="mb-4">
            <h3 className="text-xl font-bold text-ink">代谢曲线</h3>
            <p className="mt-1 text-base text-ink/55">半衰期 {halfLife}h · 睡前阈值 {adjustedThreshold}mg</p>
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
      ) : (
        <div>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-ink">耐受趋势</h3>
              <p className="mt-1 text-base text-ink/55">{tolerance.text}</p>
            </div>
            <span className="shrink-0 rounded-full bg-[#e7f2df] px-4 py-2 text-sm font-bold text-[#648b50]">
              {tolerance.label}
            </span>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            <InfoPill label="日均摄入" value={`${tolerance.dailyAvg}mg`} />
            <InfoPill label="提神评分" value={`${tolerance.avgEffect}/5`} />
            <InfoPill label="耐受判断" value={tolerance.label} />
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer>
              <ComposedChart data={tolerance.chartData} margin={{ left: 8, right: 10, top: 12, bottom: 0 }}>
                <CartesianGrid stroke="#eadfce" strokeDasharray="5 6" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: "#dfcfbd" }} />
                <YAxis yAxisId="mg" tickLine={false} axisLine={false} width={46} tickFormatter={(v) => `${v}`} />
                <YAxis yAxisId="score" orientation="right" domain={[0, 5]} tickLine={false} axisLine={false} width={28} />
                <Tooltip contentStyle={{ borderRadius: 18, border: "1px solid #eadccd" }} />
                <Bar yAxisId="mg" dataKey="mg" name="摄入 mg" fill="#C99B6E" radius={[10, 10, 4, 4]} barSize={20} />
                <Line yAxisId="score" type="monotone" dataKey="score" name="提神评分" stroke="#7EA468" strokeWidth={3} dot={{ r: 4 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-4 rounded-[22px] bg-[#eef4e8] p-4 text-sm leading-relaxed text-ink/60">{toleranceHint}</p>
          <div className="mt-4">
            <KnowledgeAccordion title="耐受是什么意思？">
              <p>耐受指长期或高频摄入后，同样剂量带来的提神感可能下降。常见表现是喝得更多但还是困，或下午需要继续补咖啡。</p>
              <p>系统会结合最近 7 天摄入量、提神评分、下午后摄入和“越喝越没用”的反馈来估算耐受趋势。</p>
            </KnowledgeAccordion>
          </div>
        </div>
      )}
      <p className="mt-4 text-center text-xs font-semibold text-ink/38">左右滑动可切换洞察视图</p>
    </section>
  );
}

function SettingsDialog({
  settings,
  setSettings,
  feedback,
  sensitivity,
  close,
}: {
  settings: SettingsState;
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  feedback: FeedbackState;
  sensitivity: SensitivityInsight;
  close: () => void;
}) {
  const preview = recommendationPreview(settings, feedback, sensitivity);
  const note =
    settings.goal === "sleep"
      ? "你选择了改善睡眠目标，系统会将推荐量降低，并提前最晚饮用时间。"
      : settings.strictnessMode === "strict"
        ? "你选择了严格策略，系统会降低推荐量并优先避开不适阈值。"
        : settings.metabolism === "slow"
        ? "你选择了慢代谢，系统会更严格控制下午摄入。"
        : settings.goal === "reduce"
          ? "你选择了减少依赖，系统会优先提示低因和暂停摄入。"
          : "当前设置偏向保持精力，系统会在安全阈值内保留摄入余量。";
  function applyQuestionnaire() {
    setSettings((s) => applyProfileSettings(s));
  }

  return (
    <DialogContent>
      <DialogTitle className="mb-8 pr-10 font-display text-3xl font-bold">个性化设置</DialogTitle>
      <DialogDescription className="sr-only">调整睡眠时间、代谢类型和管理目标</DialogDescription>
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
          <LabelText>代谢类型</LabelText>
          <Select value={settings.metabolism} onValueChange={(value: SettingsState["metabolism"]) => setSettings((s) => ({ ...s, metabolism: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fast">快代谢（半衰期约 3.5h）</SelectItem>
              <SelectItem value="normal">普通（半衰期约 5h）</SelectItem>
              <SelectItem value="slow">慢代谢（半衰期约 7h）</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <LabelText>管理目标</LabelText>
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
              <p className="text-lg font-bold text-ink">咖啡因敏感度校准</p>
              <p className="mt-1 text-sm leading-relaxed text-ink/55">先用问卷估算你的初始阈值，再由每日反馈慢慢微调。</p>
            </div>
            <span className="shrink-0 rounded-full bg-white/70 px-3 py-2 text-xs font-bold text-caramel">{profileLabel(settings.sensitivityProfile)}</span>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <LabelText>下午喝咖啡会影响睡眠吗？</LabelText>
              <Select value={settings.questionnaireSleepImpact} onValueChange={(value: SettingsState["questionnaireSleepImpact"]) => setSettings((s) => ({ ...s, questionnaireSleepImpact: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不会</SelectItem>
                  <SelectItem value="slight">有一点</SelectItem>
                  <SelectItem value="obvious">明显会</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <LabelText>喝咖啡后容易心慌吗？</LabelText>
              <Select value={settings.questionnairePalpitation} onValueChange={(value: SettingsState["questionnairePalpitation"]) => setSettings((s) => ({ ...s, questionnairePalpitation: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">从不</SelectItem>
                  <SelectItem value="sometimes">偶尔</SelectItem>
                  <SelectItem value="often">经常</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <LabelText>喝咖啡后容易焦虑或紧张吗？</LabelText>
              <Select value={settings.questionnaireAnxiety} onValueChange={(value: SettingsState["questionnaireAnxiety"]) => setSettings((s) => ({ ...s, questionnaireAnxiety: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">从不</SelectItem>
                  <SelectItem value="sometimes">偶尔</SelectItem>
                  <SelectItem value="often">经常</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <LabelText>120mg 咖啡因通常是什么感觉？</LabelText>
              <Select value={settings.questionnaireLatteFeeling} onValueChange={(value: SettingsState["questionnaireLatteFeeling"]) => setSettings((s) => ({ ...s, questionnaireLatteFeeling: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="just_right">刚好</SelectItem>
                  <SelectItem value="too_much">有点多</SelectItem>
                  <SelectItem value="no_effect">没什么感觉</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Button variant="outline" className="w-full" onClick={applyQuestionnaire}>根据问卷生成阈值</Button>
            </div>
          </div>
          {settings.sensitivityProfile === "high_tolerance" && (
            <p className="mt-4 rounded-[20px] bg-white/65 p-3 text-sm font-semibold leading-relaxed text-ink/62">高耐受不代表继续提高剂量更好，建议阶段性减量，让提神敏感度慢慢恢复。</p>
          )}
        </div>
        <div className="md:col-span-2">
          <LabelText>睡前安全残留阈值 (mg)</LabelText>
          <input className="field" type="number" min="0" value={settings.safeSleepResidualMg} onChange={(e) => setSettings((s) => ({ ...s, safeThreshold: Number(e.target.value), safeSleepResidualMg: Number(e.target.value) }))} />
        </div>
        <div className="md:col-span-2 rounded-[28px] bg-white/55 p-5">
          <p className="mb-5 text-lg font-bold text-ink">我的咖啡因反应阈值</p>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <LabelText>单次舒适摄入量 (mg)</LabelText>
              <input className="field" type="number" min="0" value={settings.singleComfortMg} onChange={(e) => setSettings((s) => ({ ...s, singleComfortMg: Number(e.target.value) }))} />
            </div>
            <div>
              <LabelText>单次不适阈值 (mg)</LabelText>
              <input className="field" type="number" min="0" value={settings.singleDiscomfortMg} onChange={(e) => setSettings((s) => ({ ...s, singleDiscomfortMg: Number(e.target.value) }))} />
            </div>
            <div>
              <LabelText>心悸触发阈值 (mg)</LabelText>
              <input className="field" type="number" min="0" value={settings.palpitationTriggerMg} onChange={(e) => setSettings((s) => ({ ...s, palpitationTriggerMg: Number(e.target.value) }))} />
            </div>
            <div>
              <LabelText>焦虑触发阈值 (mg)</LabelText>
              <input className="field" type="number" min="0" value={settings.anxietyTriggerMg} onChange={(e) => setSettings((s) => ({ ...s, anxietyTriggerMg: Number(e.target.value) }))} />
            </div>
            <div>
              <LabelText>系统基础日上限 (mg)</LabelText>
              <input className="field" type="number" min="0" value={settings.dailyBaseLimitMg} onChange={(e) => setSettings((s) => ({ ...s, dailyBaseLimitMg: Number(e.target.value) }))} />
            </div>
            <div>
              <LabelText>个人每日上限 (mg)</LabelText>
              <input className="field" type="number" min="0" value={settings.personalDailyLimitMg} onChange={(e) => setSettings((s) => ({ ...s, personalDailyLimitMg: Number(e.target.value), dailyPersonalLimitMg: Number(e.target.value) }))} />
              <p className="mt-2 text-xs text-ink/45">填 0 表示使用系统推荐量。</p>
            </div>
            <div>
              <LabelText>推荐策略</LabelText>
              <Select value={settings.strictnessMode} onValueChange={(value: SettingsState["strictnessMode"]) => setSettings((s) => ({ ...s, strictnessMode: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="strict">严格</SelectItem>
                  <SelectItem value="balanced">平衡</SelectItem>
                  <SelectItem value="loose">宽松</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-7 rounded-[28px] bg-white/65 p-5">
        <p className="text-sm font-bold text-caramel">推荐结果预览</p>
        <p className="mt-2 text-xl font-bold text-ink">根据当前设置，今日基础推荐量约为 {preview}mg。</p>
        <p className="mt-2 text-base leading-relaxed text-ink/60">{note} 当前敏感指数：{sensitivity.label}。</p>
      </div>
      <div className="mt-4">
        <KnowledgeAccordion title="为什么需要敏感度设置？">
          <p>不同人对咖啡因的睡眠影响、心悸和焦虑反应差异很大。问卷会先给出初始估算，之后再结合你的反馈小幅校准。</p>
          <p>这些阈值用于喝前模拟、今日推荐量和睡前残留判断，帮助建议更贴近你的身体感受。</p>
          <p>400mg 常被作为多数健康成年人的每日参考上限，但它不是每个人的最佳摄入量。对于睡眠敏感、容易心悸、焦虑或正在减少依赖的用户，合适推荐量可能远低于 400mg。</p>
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
  const sleepNote =
    feedback.sleepQuality === "bad" && sleepRemaining <= settings.safeSleepResidualMg
      ? " 昨晚睡眠差但咖啡因残留不高，可能还有压力、作息或环境等因素，系统不会直接把原因归为咖啡因。"
      : "";

  function saveFeedback() {
    const text = `已保存反馈。你的提神评分为 ${feedback.effect} 分，这次反馈会用于调整你的敏感指数、耐受指数和后续推荐量。${impact}${sleepNote}`;
    setFeedback((f) => ({ ...f, updatedAt: new Date().toISOString() }));
    setSettings((s) => calibrateSettingsFromFeedback(s, feedback, latestDoseMg, sleepRemaining));
    setSavedText(text);
    afterSave(text);
  }

  return (
    <DialogContent>
      <DialogTitle className="mb-8 pr-10 font-display text-3xl font-bold">主观反馈</DialogTitle>
      <DialogDescription className="sr-only">记录提神效果、副作用和睡眠质量</DialogDescription>
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
          <LabelText>副作用</LabelText>
          <Select value={feedback.sideEffect} onValueChange={(value: FeedbackState["sideEffect"]) => setFeedback((f) => ({ ...f, sideEffect: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">无</SelectItem>
              <SelectItem value="anxiety">焦虑</SelectItem>
              <SelectItem value="palpitation">心悸</SelectItem>
              <SelectItem value="stomach">胃不舒服</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <LabelText>昨晚睡眠质量</LabelText>
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
          <LabelText>入睡速度</LabelText>
          <Select value={feedback.sleepLatency} onValueChange={(value: FeedbackState["sleepLatency"]) => setFeedback((f) => ({ ...f, sleepLatency: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fast">很快</SelectItem>
              <SelectItem value="slow">稍慢</SelectItem>
              <SelectItem value="hard">很难入睡</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <LabelText>今日是否下午后摄入</LabelText>
            <Select value={feedback.afternoonIntake} onValueChange={(value: FeedbackState["afternoonIntake"]) => setFeedback((f) => ({ ...f, afternoonIntake: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="no">否</SelectItem>
                <SelectItem value="yes">是</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <LabelText>今天是否觉得越喝越没用</LabelText>
            <Select value={feedback.lessEffective} onValueChange={(value: FeedbackState["lessEffective"]) => setFeedback((f) => ({ ...f, lessEffective: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="no">否</SelectItem>
                <SelectItem value="yes">是</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <LabelText>今天摄入后是否心悸</LabelText>
            <Select value={feedback.palpitationToday} onValueChange={(value: FeedbackState["palpitationToday"]) => setFeedback((f) => ({ ...f, palpitationToday: value, sideEffect: value === "yes" ? "palpitation" : f.sideEffect }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="no">否</SelectItem>
                <SelectItem value="yes">是</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <LabelText>今天摄入后是否焦虑</LabelText>
            <Select value={feedback.anxietyToday} onValueChange={(value: FeedbackState["anxietyToday"]) => setFeedback((f) => ({ ...f, anxietyToday: value, sideEffect: value === "yes" ? "anxiety" : f.sideEffect }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="no">否</SelectItem>
                <SelectItem value="yes">是</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className={`mt-7 rounded-[28px] p-5 ${bean.tone}`}>
        <div className="flex gap-4">
          <BeanFace bean={bean} size="sm" animated={Boolean(savedText)} />
          <div>
            <p className="font-bold text-ink">最近反馈摘要</p>
            <p className="mt-1 text-sm leading-relaxed text-ink/65">
              最近反馈：提神效果 {feedback.effect}/5，{feedback.sideEffect === "none" ? "无副作用" : "有副作用"}，睡眠{feedback.sleepQuality === "good" ? "好" : feedback.sleepQuality === "bad" ? "差" : "一般"}。推荐策略：{impact}
            </p>
            <p className="mt-2 text-sm text-ink/52">当前耐受：{tolerance.label} · {tolerance.trend}</p>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <KnowledgeAccordion title="为什么主观反馈会影响推荐量？">
          <p>咖啡因反应不只和摄入量有关，也和睡眠、压力、耐受和个人敏感度有关。</p>
          <p>如果你反馈心悸、焦虑或越喝越没用，系统会降低单次建议量或提高耐受提醒；如果连续反馈良好，系统会保持当前阈值，不会突然大幅放宽。</p>
          <p>咖啡因会刺激中枢神经系统，部分用户在较低剂量下也可能出现心跳加快、紧张、焦虑、手抖或胃部不适等反应。</p>
        </KnowledgeAccordion>
      </div>
      {savedText && <div className="mt-4 rounded-[24px] bg-white/70 p-4 text-base font-semibold leading-relaxed text-ink/70">{savedText}</div>}
      <Button className="mt-8 w-full" onClick={saveFeedback}>保存今日反馈</Button>
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
  return (
    <article className="card flex items-center gap-4 p-5">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#dff1d8] text-2xl">
        {quickDrinks.find((item) => item.name === drink.name)?.icon ?? "☕"}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-lg font-bold">{drink.name}</h3>
        <p className="text-ink/55">{formatTime(drink.time)} {drink.note ? `· ${drink.note}` : ""}</p>
      </div>
      <input
        className="w-20 rounded-full border border-[#eadccd] bg-white/70 px-3 py-2 text-right font-display text-2xl text-caramel outline-none focus:ring-4 focus:ring-caramel/20"
        type="number"
        min="0"
        value={drink.mg}
        onChange={(event) => updateDrinkMg(drink.id, Number(event.target.value))}
        aria-label={`${drink.name} 咖啡因含量`}
      />
      <span className="text-sm text-ink/60">mg</span>
      <button className="text-[#d66f55]" onClick={() => deleteDrink(drink.id)} aria-label={`删除 ${drink.name}`}>
        <Trash2 className="h-5 w-5" />
      </button>
    </article>
  );
}

function BottomNav() {
  const items = [
    { label: "首页", icon: Home, target: "home" },
    { label: "曲线", icon: BarChart3, target: "curve" },
    { label: "记录", icon: ClipboardList, target: "records" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-[min(92vw,420px)] justify-center rounded-full border border-[#eadccd] bg-white/82 p-2 shadow-soft backdrop-blur">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-3 text-sm font-bold transition ${index === 0 ? "bg-[#f3e6d6] text-caramel" : "text-ink/52 hover:bg-[#fff7eb]"}`}
            onClick={() => document.getElementById(item.target)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

export default App;
