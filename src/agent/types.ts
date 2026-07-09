import type { DrinkCategory, DrinkConfidence, DrinkItem, DrinkSourceType } from "../types/drink";

export type AgentToolResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

export type JsonSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type AgentToolDefinition = {
  name: AgentToolName;
  description: string;
  inputSchema: JsonSchema;
};

export type AgentTool<Input = unknown, Output = unknown> = AgentToolDefinition & {
  handler: (input: Input) => AgentToolResult<Output> | Promise<AgentToolResult<Output>>;
};

export type AgentToolName =
  | "getTodayIntakeRecords"
  | "getUserProfile"
  | "searchDrinkLibrary"
  | "calculateCurrentCaffeineStatus"
  | "simulateDrinkBeforeAdding"
  | "generateRecommendationSummary";

export type AgentIntent =
  | "can_i_drink"
  | "today_summary"
  | "record_drink"
  | "simulate_drink"
  | "explain_risk"
  | "unknown";

export type ToolTrace = {
  toolName: string;
  input: unknown;
  outputSummary: string;
  status: "success" | "failed";
};

export type AgentLoopContext = {
  currentTime?: string;
  date?: string;
  maxToolCalls?: number;
};

export type AgentLoopResponse = {
  answer: string;
  conclusion: string;
  reasons: string[];
  dataEvidence: string[];
  suggestions: string[];
  usedTools: ToolTrace[];
  needFollowUp: boolean;
  followUpQuestion?: string;
  isFallback: boolean;
  intent: AgentIntent;
};

export type AgentDrinkRecord = {
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

export type AgentSettings = {
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

export type AgentFeedback = {
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

export type AgentProfile = {
  settings: AgentSettings;
  feedback: AgentFeedback;
  habits: {
    coffeeFeeling: "just_right" | "too_much" | "not_effective";
    afternoonSleepImpact: "none" | "slight" | "obvious";
    discomfortFrequency: "never" | "sometimes" | "often";
    reminderStrictness: "loose" | "balanced" | "strict";
  };
  labels: {
    metabolism: string;
    goal: string;
    sensitivity: string;
  };
  targetIntakeMg: number;
};

export type TodayIntakeInput = {
  date?: string;
};

export type TodayIntakeOutput = {
  date: string;
  records: AgentDrinkRecord[];
  totalMg: number;
};

export type SearchDrinkInput = {
  drinkName: string;
};

export type DrinkCandidate = {
  drink: DrinkItem;
  score: number;
  confidence: "low" | "medium" | "high";
  reason: string;
  matchReason:
    | "name_matched"
    | "alias_matched"
    | "brand_matched"
    | "ocr_keyword_matched"
    | "size_or_volume_matched"
    | "no_reliable_match";
};

export type SearchDrinkOutput = {
  query: string;
  matchStatus: "exact_match" | "fuzzy_match" | "no_match";
  candidates: DrinkCandidate[];
  message?: string;
};

export type CaffeineStatusInput = {
  records?: AgentDrinkRecord[];
  profile?: Partial<AgentProfile>;
  currentTime?: string;
};

export type CaffeineStatusOutput = {
  currentTime: string;
  todayTotalMg: number;
  currentRemainingMg: number;
  sleepRemainingMg: number;
  sleepRisk: "低" | "中" | "高";
  bedTime: string;
  halfLifeHours: number;
  safeSleepResidualMg: number;
};

export type SimulateDrinkInput = {
  drink?: Partial<DrinkItem> & {
    name?: string;
    displayName?: string;
    caffeineMg?: number;
  };
  time?: string;
  profile?: Partial<AgentProfile>;
};

export type SimulateDrinkOutput = {
  drinkName: string;
  caffeineMg: number;
  afterTodayTotalMg: number;
  sleepRemainingMg: number;
  sleepRisk: "低" | "中" | "高";
  decision: "可以饮用" | "建议改成半杯或低因" | "不建议喝完整一杯";
  advice: string;
  reasons: string[];
};

export type RecommendationSummaryInput = {
  records?: AgentDrinkRecord[];
  profile?: Partial<AgentProfile>;
  calculation?: Partial<CaffeineStatusOutput>;
};

export type RecommendationSummaryOutput = {
  summary: string;
  riskReasons: string[];
  actionAdvice: string;
  canDrinkMg: number;
  recommendedMg: number;
  sleepRisk: "低" | "中" | "高";
};
