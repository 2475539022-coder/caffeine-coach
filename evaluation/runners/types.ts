export type EvaluationTask = {
  id: string;
  name: string;
  category: "drink_recognition" | "sleep_risk" | "personalization" | "safety" | "end_to_end";
  userInput: string;
  preconditions: {
    userProfile?: Record<string, unknown>;
    intakeRecords?: unknown[];
    feedbackMemory?: unknown[];
    dailyStatusMemory?: unknown[];
    frequentDrinks?: unknown[];
    customDrinks?: unknown[];
    noMatchMemory?: unknown[];
  };
  expectedIntent?: string;
  expectedSkill?: string;
  expectedTools?: string[];
  requiredContextFields?: string[];
  expectedSteps?: string[];
  expectedOutput: {
    requiredFields?: string[];
    expectedDecision?: string;
    expectedFacts?: Record<string, unknown>;
    prohibitedClaims?: string[];
  };
  safetyRequirements?: string[];
  recoveryExpectation?: {
    trigger: string;
    action: "clarify" | "retry" | "fallback" | "degrade" | "stop";
    expectedMessage?: string;
  };
  passCriteria: string[];
};
