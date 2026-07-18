import { getAllDrinks } from "../utils/drinkData";
import { matchDrinkFromText } from "../utils/drinkMatcher";
import { calculateRuleDecisionSnapshot, type RuleDecision } from "../decision/caffeineDecisionEngine";
import type {
  AgentDrinkRecord,
  AgentFeedback,
  AgentProfile,
  AgentSettings,
  AgentToolName,
  AgentToolResult,
  CaffeineStatusInput,
  CaffeineStatusOutput,
  RecommendationSummaryInput,
  RecommendationSummaryOutput,
  SearchDrinkInput,
  SearchDrinkOutput,
  SimulateDrinkInput,
  SimulateDrinkOutput,
  TodayIntakeInput,
  TodayIntakeOutput,
} from "./types";

const STORAGE_KEY = "caffeine-coach-demo-v1";

const defaultSettings: AgentSettings = {
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

const defaultFeedback: AgentFeedback = {
  effect: 3,
  sideEffect: "none",
  sleepQuality: "normal",
  sleepLatency: "fast",
  afternoonIntake: "no",
  lessEffective: "no",
  palpitationToday: "no",
  anxietyToday: "no",
};

const halfLives = { fast: 3.5, normal: 5, slow: 7 };
const metabolismFactors = { fast: 1.1, normal: 1, slow: 0.75 };
const sleepFactors = { good: 1, normal: 0.85, bad: 0.7 };
const goalFactors = { energy: 1, sleep: 0.75, reduce: 0.65 };

function getStoredState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const settings = normalizeSettings(parsed.settings);
    const feedback = normalizeFeedback(parsed.feedback);
    const drinks = Array.isArray(parsed.drinks) ? parsed.drinks : [];
    return { drinks: drinks as AgentDrinkRecord[], settings, feedback };
  } catch {
    return { drinks: [] as AgentDrinkRecord[], settings: defaultSettings, feedback: defaultFeedback };
  }
}

function normalizeSettings(settings?: Partial<AgentSettings>): AgentSettings {
  const safeSleepResidualMg = settings?.safeSleepResidualMg ?? settings?.safeThreshold ?? defaultSettings.safeSleepResidualMg;
  const personalDailyLimitMg = settings?.personalDailyLimitMg ?? settings?.dailyPersonalLimitMg ?? defaultSettings.personalDailyLimitMg;
  return {
    ...defaultSettings,
    ...settings,
    safeThreshold: safeSleepResidualMg,
    safeSleepResidualMg,
    personalDailyLimitMg,
    dailyPersonalLimitMg: personalDailyLimitMg,
  };
}

function normalizeFeedback(feedback?: Partial<AgentFeedback>): AgentFeedback {
  return {
    ...defaultFeedback,
    ...feedback,
    palpitationToday: feedback?.palpitationToday ?? (feedback?.sideEffect === "palpitation" ? "yes" : "no"),
    anxietyToday: feedback?.anxietyToday ?? (feedback?.sideEffect === "anxiety" ? "yes" : "no"),
  };
}

function isSameDay(dateIso: string, target: Date) {
  const date = new Date(dateIso);
  return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth() && date.getDate() === target.getDate();
}

function isValidDate(date: Date) {
  return !Number.isNaN(date.getTime());
}

function hoursBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / 36e5;
}

function getBedDate(bedTime: string, now = new Date()) {
  const [hour, minute] = bedTime.split(":").map(Number);
  const bed = new Date(now);
  bed.setHours(hour, minute, 0, 0);
  if (bed <= now) bed.setDate(bed.getDate() + 1);
  return bed;
}

function remainingForRecord(record: AgentDrinkRecord, at: Date, halfLife: number) {
  const consumedAt = new Date(record.time);
  const hoursPassed = hoursBetween(consumedAt, at);
  if (Number.isNaN(hoursPassed) || hoursPassed < 0) return 0;
  return record.mg * Math.pow(0.5, hoursPassed / halfLife);
}

function totalRemaining(records: AgentDrinkRecord[], at: Date, halfLife: number) {
  return records.reduce((sum, record) => sum + remainingForRecord(record, at, halfLife), 0);
}

function riskLevel(value: number, threshold: number): "低" | "中" | "高" {
  if (value <= threshold) return "低";
  if (value <= 80) return "中";
  return "高";
}

function habitsFromSettings(settings: AgentSettings): AgentProfile["habits"] {
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

function habitRecommendationFactor(habits: AgentProfile["habits"]) {
  let factor = 1;
  if (habits.coffeeFeeling === "too_much") factor -= 0.15;
  if (habits.afternoonSleepImpact === "obvious") factor -= 0.1;
  if (habits.discomfortFrequency === "sometimes") factor -= 0.15;
  if (habits.discomfortFrequency === "often") factor -= 0.3;
  if (habits.reminderStrictness === "strict") factor -= 0.1;
  if (habits.reminderStrictness === "loose") factor += 0.05;
  return Math.min(1.05, Math.max(0.45, Number(factor.toFixed(2))));
}

function feedbackFactor(feedback: AgentFeedback) {
  let factor = 1;
  if (feedback.lessEffective === "yes") factor *= 0.92;
  else if (feedback.lessEffective === "slight") factor *= 0.96;
  if (feedback.sideEffect === "palpitation" || feedback.palpitationToday === "yes") factor *= 0.82;
  else if (feedback.sideEffect !== "none" || feedback.anxietyToday === "yes") factor *= 0.88;
  if (feedback.sleepLatency === "hard") factor *= 0.88;
  else if (feedback.sleepLatency === "slow") factor *= 0.95;
  return factor;
}

function sensitivityCoefficient(settings: AgentSettings, feedback: AgentFeedback) {
  let score = 0;
  if (settings.singleDiscomfortMg <= 120) score += 2;
  else if (settings.singleDiscomfortMg <= 160) score += 1;
  if (settings.palpitationTriggerMg <= 120) score += 2;
  else if (settings.palpitationTriggerMg <= 150) score += 1;
  if (settings.anxietyTriggerMg <= 100) score += 2;
  else if (settings.anxietyTriggerMg <= 120) score += 1;
  if (feedback.sideEffect === "palpitation" || feedback.palpitationToday === "yes") score += 3;
  if (feedback.sideEffect === "anxiety" || feedback.anxietyToday === "yes") score += 2;
  if (score >= 4) return 0.6;
  if (score >= 2) return 0.8;
  return 1;
}

function targetIntakeMg(settings: AgentSettings, feedback: AgentFeedback) {
  const habits = habitsFromSettings(settings);
  const raw = Math.round(
    settings.dailyBaseLimitMg *
      metabolismFactors[settings.metabolism] *
      sensitivityCoefficient(settings, feedback) *
      sleepFactors[feedback.sleepQuality] *
      goalFactors[settings.goal] *
      feedbackFactor(feedback) *
      habitRecommendationFactor(habits),
  );
  return settings.personalDailyLimitMg > 0 ? Math.min(raw, settings.personalDailyLimitMg) : raw;
}

function profileFromState(settings: AgentSettings, feedback: AgentFeedback): AgentProfile {
  const sensitivityLabel =
    sensitivityCoefficient(settings, feedback) === 0.6
      ? "高敏感"
      : sensitivityCoefficient(settings, feedback) === 0.8
        ? "中敏感"
        : "低敏感";
  return {
    settings,
    feedback,
    habits: habitsFromSettings(settings),
    labels: {
      metabolism: settings.metabolism === "fast" ? "快代谢" : settings.metabolism === "slow" ? "慢代谢" : "普通代谢",
      goal: settings.goal === "sleep" ? "改善睡眠" : settings.goal === "reduce" ? "减少依赖" : "保持精力",
      sensitivity: sensitivityLabel,
    },
    targetIntakeMg: targetIntakeMg(settings, feedback),
  };
}

function resolveProfile(profile?: Partial<AgentProfile>) {
  const stored = getStoredState();
  const settings = normalizeSettings(profile?.settings ?? stored.settings);
  const feedback = normalizeFeedback(profile?.feedback ?? stored.feedback);
  return profileFromState(settings, feedback);
}

function calculationFor(records: AgentDrinkRecord[], profile: AgentProfile, currentTime?: string): CaffeineStatusOutput {
  const snapshot = calculateRuleDecisionSnapshot({
    records,
    settings: profile.settings,
    feedback: profile.feedback,
    currentTime,
  });
  return {
    currentTime: snapshot.currentTime,
    todayTotalMg: snapshot.todayTotalMg,
    currentRemainingMg: snapshot.currentRemainingMg,
    sleepRemainingMg: snapshot.estimatedSleepResidualMg,
    sleepRisk: snapshot.sleepRisk,
    bedTime: snapshot.bedTime,
    halfLifeHours: snapshot.halfLifeHours,
    safeSleepResidualMg: snapshot.adjustedSleepResidualMg,
  };
}

function decisionLabelFromRule(decision: RuleDecision): SimulateDrinkOutput["decision"] {
  if (decision === "full_cup") return "可以饮用";
  if (decision === "half_cup" || decision === "low_caf") return "建议改成半杯或低因";
  return "不建议喝完整一杯";
}

export function getTodayIntakeRecords(input: TodayIntakeInput = {}): AgentToolResult<TodayIntakeOutput> {
  try {
    const { drinks } = getStoredState();
    const date = input.date ? new Date(input.date) : new Date();
    if (!isValidDate(date)) {
      return { success: false, error: "日期格式不正确，请提供有效的日期或时间。", message: "日期格式不正确，请提供有效的日期或时间。" };
    }
    const records = drinks.filter((record) => isSameDay(record.time, date));
    return {
      success: true,
      data: {
        date: date.toISOString(),
        records,
        totalMg: records.reduce((sum, record) => sum + record.mg, 0),
      },
    };
  } catch (error) {
    return { success: false, error: "读取今日记录失败，请稍后再试。" };
  }
}

export function getUserProfile(): AgentToolResult<AgentProfile> {
  try {
    const { settings, feedback } = getStoredState();
    return { success: true, data: profileFromState(settings, feedback) };
  } catch (error) {
    return { success: false, error: "读取用户画像失败，请稍后再试。" };
  }
}

export function searchDrinkLibrary(input: SearchDrinkInput): AgentToolResult<SearchDrinkOutput> {
  try {
    if (!input || typeof input.drinkName !== "string") {
      return {
        success: false,
        error: "请先提供想查询的饮品名称。",
        message: "请先提供想查询的饮品名称。",
      };
    }
    const query = input.drinkName?.trim() ?? "";
    if (!query) {
      return {
        success: true,
        data: {
          query,
          matchStatus: "no_match",
          candidates: [],
          message: "暂未找到该饮品的咖啡因含量，可以手动输入或选择相近饮品。",
        },
      };
    }
    const candidates = matchDrinkFromText({ rawText: query, drinkName: query }, getAllDrinks());
    if (!candidates.length) {
      return {
        success: true,
        data: {
          query,
          matchStatus: "no_match",
          candidates: [],
          message: "暂未找到该饮品的咖啡因含量，可以手动输入或选择相近饮品。",
        },
      };
    }
    const top = candidates[0];
    const exactName = top.drink.name === query || top.drink.displayName === query || (top.drink.aliases || []).includes(query);
    const matchStatus = exactName || top.confidence === "high" ? "exact_match" : "fuzzy_match";
    return {
      success: true,
      data: {
        query,
        matchStatus,
        candidates,
        message: matchStatus === "exact_match" ? "已找到可信饮品候选。" : "找到一些相近饮品，请确认品牌和杯型。",
      },
    };
  } catch (error) {
    return { success: false, error: "搜索饮品库失败，请稍后再试。" };
  }
}

export function calculateCurrentCaffeineStatus(input: CaffeineStatusInput = {}): AgentToolResult<CaffeineStatusOutput> {
  try {
    const stored = getStoredState();
    const profile = resolveProfile(input.profile);
    const records = input.records ?? stored.drinks;
    if (input.currentTime && !isValidDate(new Date(input.currentTime))) {
      return {
        success: false,
        error: "当前时间格式不正确，请提供有效的 ISO 时间。",
        message: "当前时间格式不正确，请提供有效的 ISO 时间。",
      };
    }
    return { success: true, data: calculationFor(records, profile, input.currentTime) };
  } catch (error) {
    return { success: false, error: "计算咖啡因状态失败，请检查记录和时间格式。" };
  }
}

export function simulateDrinkBeforeAdding(input: SimulateDrinkInput): AgentToolResult<SimulateDrinkOutput> {
  try {
    if (!input || !input.drink) {
      return {
        success: false,
        error: "请先选择或提供一杯要模拟的饮品。",
        message: "请先选择或提供一杯要模拟的饮品。",
      };
    }
    if (input.time && !isValidDate(new Date(input.time))) {
      return {
        success: false,
        error: "模拟时间格式不正确，请提供有效的 ISO 时间。",
        message: "模拟时间格式不正确，请提供有效的 ISO 时间。",
      };
    }
    const stored = getStoredState();
    const profile = resolveProfile(input.profile);
    const now = input.time ? new Date(input.time) : new Date();
    const caffeineMg = Number(input.drink?.caffeineMg ?? 0);
    if (!Number.isFinite(caffeineMg) || caffeineMg < 0) {
      return {
        success: false,
        error: "饮品的咖啡因含量不正确，请确认后再模拟。",
        message: "饮品的咖啡因含量不正确，请确认后再模拟。",
      };
    }
    const drinkName = input.drink?.displayName || input.drink?.name || "这杯饮品";
    const snapshot = calculateRuleDecisionSnapshot({
      records: stored.drinks,
      settings: profile.settings,
      feedback: profile.feedback,
      currentTime: now.toISOString(),
      simulatedDrink: {
        name: drinkName,
        caffeineMg,
        category: input.drink?.category,
      },
    });
    const currentToday = stored.drinks.filter((record) => isSameDay(record.time, now)).reduce((sum, record) => sum + record.mg, 0);
    const afterTodayTotalMg = snapshot.afterTodayTotalMg ?? currentToday + caffeineMg;
    const exceedsPalpitation = caffeineMg >= profile.settings.palpitationTriggerMg;
    const exceedsAnxiety = caffeineMg >= profile.settings.anxietyTriggerMg;
    const overPersonalLimit = profile.settings.personalDailyLimitMg > 0 && afterTodayTotalMg > profile.settings.personalDailyLimitMg;
    const decision = decisionLabelFromRule(snapshot.ruleDecision);
    const advice =
      exceedsPalpitation
        ? "这杯超过了你的心慌提醒线，建议改为半杯或低因。"
        : overPersonalLimit
          ? "这杯会超过你的个人每日上限，今天建议暂停咖啡因。"
          : exceedsAnxiety
            ? "这杯可能让你更容易紧张，建议改成半杯。"
            : snapshot.sleepRisk === "高" || afterTodayTotalMg > profile.targetIntakeMg
              ? "不建议继续摄入，今晚优先保护睡眠。"
              : snapshot.sleepRisk === "中" || caffeineMg > profile.settings.singleComfortMg
                ? "建议喝半杯，或选择低因饮品。"
                : "可以饮用，建议慢慢喝并留意身体反馈。";
    return {
      success: true,
      data: {
        drinkName,
        caffeineMg,
        afterTodayTotalMg,
        sleepRemainingMg: snapshot.estimatedSleepResidualMg,
        sleepRisk: snapshot.sleepRisk,
        decision,
        advice,
        reasons: [
          `你计划 ${profile.settings.bedTime} 睡觉。`,
          `这杯约 ${caffeineMg}mg，今天喝完后累计约 ${afterTodayTotalMg}mg。`,
          `睡前预计残留约 ${snapshot.estimatedSleepResidualMg}mg，目标约 ${snapshot.adjustedSleepResidualMg}mg。`,
        ],
      },
    };
  } catch (error) {
    return { success: false, error: "模拟饮品失败，请确认饮品信息后再试。" };
  }
}

export function generateRecommendationSummary(input: RecommendationSummaryInput = {}): AgentToolResult<RecommendationSummaryOutput> {
  try {
    const stored = getStoredState();
    const profile = resolveProfile(input.profile);
    const records = input.records ?? stored.drinks;
    const calculation = input.calculation
      ? ({ ...calculationFor(records, profile), ...input.calculation } as CaffeineStatusOutput)
      : calculationFor(records, profile);
    const canDrinkMg = Math.max(0, profile.targetIntakeMg - calculation.todayTotalMg);
    const riskReasons: string[] = [];
    const symptom = profile.feedback.sideEffect !== "none" || profile.feedback.palpitationToday === "yes" || profile.feedback.anxietyToday === "yes";
    if (symptom) riskReasons.push("你今天反馈了不舒服，建议先暂停咖啡因。");
    if (calculation.sleepRisk === "高") riskReasons.push("睡前残留预计偏高。");
    if (calculation.todayTotalMg >= profile.targetIntakeMg) riskReasons.push("今日摄入已经达到或超过建议量。");
    if (profile.settings.goal === "reduce") riskReasons.push("你当前目标是减少依赖，建议优先控制总量。");
    const summary =
      symptom
        ? "今天建议：先暂停咖啡因，补水休息。"
        : calculation.todayTotalMg >= profile.targetIntakeMg || calculation.sleepRisk === "高"
          ? "今天建议：咖啡因负荷偏高，先不要继续喝。"
          : calculation.sleepRisk === "中" || canDrinkMg < 120
            ? "今天建议：还可以少量摄入，优先半杯或低因。"
            : "今天建议：当前节奏平稳，可以按需少量摄入。";
    return {
      success: true,
      data: {
        summary,
        riskReasons,
        actionAdvice:
          canDrinkMg <= 0 || calculation.sleepRisk === "高"
            ? "今天不建议再喝完整一杯咖啡。"
            : canDrinkMg < 120 || calculation.sleepRisk === "中"
              ? "如果确实需要提神，建议选择半杯、小杯或低因。"
              : "可以保留一杯小剂量饮品，尽量避开临睡前。",
        canDrinkMg,
        recommendedMg: profile.targetIntakeMg,
        sleepRisk: calculation.sleepRisk,
      },
    };
  } catch (error) {
    return { success: false, error: "生成推荐摘要失败，请稍后再试。" };
  }
}

export const TOOL_HANDLERS: Record<AgentToolName, (input: unknown) => AgentToolResult | Promise<AgentToolResult>> = {
  getTodayIntakeRecords: (input) => getTodayIntakeRecords((input ?? {}) as TodayIntakeInput),
  getUserProfile: () => getUserProfile(),
  searchDrinkLibrary: (input) => searchDrinkLibrary(input as SearchDrinkInput),
  calculateCurrentCaffeineStatus: (input) => calculateCurrentCaffeineStatus((input ?? {}) as CaffeineStatusInput),
  simulateDrinkBeforeAdding: (input) => simulateDrinkBeforeAdding(input as SimulateDrinkInput),
  generateRecommendationSummary: (input) => generateRecommendationSummary((input ?? {}) as RecommendationSummaryInput),
};
