type RuleCase = {
  id: string;
  name: string;
  category: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  tolerance?: number;
};

export type RuleEvaluationCase = {
  id: string;
  name: string;
  category: string;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  passed: boolean;
  notes: string[];
};

export type RuleEvaluationSummary = {
  total: number;
  passed: number;
  calculationConsistency: number;
  rulePassRate: number;
  boundaryCasePassRate: number;
  dataIsolationPassRate: number;
  failedCases: RuleEvaluationCase[];
  cases: RuleEvaluationCase[];
};

function hoursBetween(from: string, to: string) {
  return (new Date(to).getTime() - new Date(from).getTime()) / 36e5;
}

function remainingForRecord(record: { mg: number; time: string }, at: string, halfLife: number) {
  const hoursPassed = hoursBetween(record.time, at);
  if (Number.isNaN(hoursPassed) || hoursPassed < 0) return 0;
  return record.mg * Math.pow(0.5, hoursPassed / halfLife);
}

function totalRemaining(records: { mg: number; time: string }[], at: string, halfLife: number) {
  return records.reduce((sum, record) => sum + remainingForRecord(record, at, halfLife), 0);
}

function riskLevel(value: number, threshold: number) {
  if (value <= threshold) return "低";
  if (value <= 80) return "中";
  return "高";
}

function bedDate(currentTime: string, bedTime: string) {
  const current = new Date(currentTime);
  const [hour, minute] = bedTime.split(":").map(Number);
  const bed = new Date(current);
  bed.setHours(hour, minute, 0, 0);
  if (bed <= current) bed.setDate(bed.getDate() + 1);
  return bed;
}

function normalizeNoMatchInput(input: string) {
  return input
    .trim()
    .replace(/[，。,.!?！？、:：;；"'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function frequentId(input: { drinkId?: string; brand?: string; name: string; caffeineMg?: number }) {
  if (input.drinkId) return `drink:${input.drinkId}`;
  return ["manual", (input.brand || "").trim().toLowerCase(), input.name.trim().toLowerCase(), Math.round(Number(input.caffeineMg) || 0)].join(":");
}

function evaluateExpected(expected: Record<string, unknown>, actual: Record<string, unknown>, tolerance = 0.1) {
  const notes: string[] = [];
  let passed = true;
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key];
    if (typeof expectedValue === "number") {
      const actualNumber = Number(actualValue);
      const ok = Math.abs(actualNumber - expectedValue) <= tolerance;
      if (!ok) {
        passed = false;
        notes.push(`${key}: expected ${expectedValue}, actual ${actualValue}`);
      }
      continue;
    }
    if (Array.isArray(expectedValue)) {
      const expectedJson = JSON.stringify(expectedValue);
      const actualJson = JSON.stringify(actualValue);
      if (expectedJson !== actualJson) {
        passed = false;
        notes.push(`${key}: expected ${expectedJson}, actual ${actualJson}`);
      }
      continue;
    }
    if (expectedValue !== actualValue) {
      passed = false;
      notes.push(`${key}: expected ${String(expectedValue)}, actual ${String(actualValue)}`);
    }
  }
  return { passed, notes };
}

function evaluateCalculation(testCase: RuleCase) {
  const input = testCase.input as any;
  if (testCase.category === "risk_rule") {
    return { risk: riskLevel(input.remainingMg, input.threshold) };
  }
  if (testCase.category === "sleep_residual") {
    const at = bedDate(input.currentTime, input.bedTime);
    return {
      sleepRemainingMg: Number(totalRemaining(input.records, at.toISOString(), input.halfLife).toFixed(2)),
      risk: riskLevel(totalRemaining(input.records, at.toISOString(), input.halfLife), input.threshold),
      bedDate: at.toDateString() === new Date(input.currentTime).toDateString() ? "same_day" : "next_day",
    };
  }
  return {
    remainingMg: Number(totalRemaining(input.records, input.at, input.halfLife).toFixed(2)),
  };
}

function buildFrequent(records: any[], pinned: any[], excludedIds: string[], now: string) {
  const recentStart = new Date(now).getTime() - 14 * 24 * 36e5;
  const groups = new Map<string, { sample: any; totalCount: number; recentCount: number; lastUsedAt: string }>();
  records.forEach((record) => {
    const id = frequentId(record);
    const usedAt = record.usedAt || now;
    const existing = groups.get(id);
    if (!existing) {
      groups.set(id, {
        sample: record,
        totalCount: 1,
        recentCount: new Date(usedAt).getTime() >= recentStart ? 1 : 0,
        lastUsedAt: usedAt,
      });
      return;
    }
    existing.totalCount += 1;
    if (new Date(usedAt).getTime() >= recentStart) existing.recentCount += 1;
    if (new Date(usedAt).getTime() > new Date(existing.lastUsedAt).getTime()) {
      existing.sample = record;
      existing.lastUsedAt = usedAt;
    }
  });
  const excluded = new Set(excludedIds);
  const pinnedIds = new Set(pinned.map((item) => item.id));
  const pinnedItems = pinned.filter((item) => !excluded.has(item.id));
  const automatic = Array.from(groups.entries())
    .filter(([id, group]) => !excluded.has(id) && !pinnedIds.has(id) && (group.recentCount >= 2 || group.totalCount >= 3))
    .map(([id, group]) => ({ id, ...group.sample, count: group.totalCount, source: "auto", lastUsedAt: group.lastUsedAt }));
  return [...pinnedItems, ...automatic];
}

function evaluateMemory(testCase: RuleCase) {
  const input = testCase.input as any;
  if (testCase.category === "frequent_drink") {
    const memories = buildFrequent(input.records || [], input.pinned || [], input.excludedIds || [], input.now || new Date().toISOString());
    const target = memories[0];
    return {
      appears: memories.length > 0,
      count: target?.count,
      source: target?.source,
      isPinned: target?.isPinned,
      sourceType: target?.sourceType,
      groupCount: new Set((input.records || []).map((record: any) => frequentId(record))).size,
    };
  }

  const existing = [...(input.existing || [])];
  if (input.userChoice === "cancel" || input.userChoice === "none" || input.action === "search_no_result") {
    return { memoryCount: existing.length };
  }

  const normalizedInput = normalizeNoMatchInput(input.rawInput);
  const existingItem = existing.find((item: any) => item.normalizedInput === normalizedInput);
  const next =
    input.action === "convert"
      ? {
          ...(existingItem || {}),
          rawInput: input.rawInput.trim(),
          normalizedInput,
          count: existingItem ? existingItem.count + 1 : 1,
          status: "converted",
          caffeineMg: Math.max(0, Math.round(Number(input.caffeineMg) || 0)),
          convertedDrinkId: input.convertedDrinkId,
        }
      : {
          ...(existingItem || {}),
          rawInput: input.rawInput.trim(),
          normalizedInput,
          count: existingItem ? existingItem.count + 1 : 1,
          status: "pending",
        };
  const items = [next, ...existing.filter((item: any) => item.normalizedInput !== normalizedInput)];
  return {
    memoryCount: items.length,
    normalizedInput: next.normalizedInput,
    status: next.status,
    count: next.count,
    caffeineMg: next.caffeineMg,
    convertedDrinkId: next.convertedDrinkId,
  };
}

function sameDate(iso: string, date: string) {
  return iso.slice(0, 10) === date;
}

function evaluateCalendar(testCase: RuleCase) {
  const input = testCase.input as any;
  if (testCase.category === "feedback_attribution") {
    const hasSleepFeedback = input.feedback.sleepQuality || input.feedback.fallAsleepSpeed;
    const date = new Date(`${input.feedbackDate}T12:00:00+08:00`);
    if (hasSleepFeedback) date.setDate(date.getDate() - 1);
    return { attributedDate: date.toISOString().slice(0, 10) };
  }
  if (testCase.category === "calendar_detail") {
    const visible = (input.records || []).filter((record: any) => sameDate(record.time, input.selectedDate));
    const hidden = (input.records || []).filter((record: any) => !sameDate(record.time, input.selectedDate));
    return {
      visibleRecordNames: visible.map((record: any) => record.name),
      hiddenRecordNames: hidden.map((record: any) => record.name),
    };
  }
  if (testCase.category === "calendar_status") {
    const total = (input.records || []).reduce((sum: number, record: any) => sum + record.mg, 0);
    return { exceededDailyTarget: total > input.targetMg };
  }
  if (input.event === "settings_updated") return { recomputedDays: input.recentDayCount };
  const total = (input.records || []).reduce((sum: number, record: any) => sum + record.mg, 0);
  return {
    date: input.date,
    totalCaffeineMg: total,
    recordCount: (input.records || []).length,
    hasFeedback: false,
  };
}

function evaluateIsolation(testCase: RuleCase) {
  const input = testCase.input as any;
  if (testCase.category === "weekly_isolation") {
    return { weeklyTotalMg: (input.weeklyRecords || []).filter((record: any) => record.kind !== "simulation").reduce((sum: number, record: any) => sum + record.mg, 0), excludedKinds: ["simulation"] };
  }
  if (testCase.category === "frequent_isolation") {
    const memories = buildFrequent(input.realRecords || [], [], [], new Date().toISOString());
    return { frequentDrinkCount: memories.length };
  }
  if (testCase.category === "no_match_isolation") {
    return {
      todayTotalMg: (input.realRecords || []).reduce((sum: number, record: any) => sum + record.mg, 0),
      weeklyTotalMg: (input.weeklyRecords || []).reduce((sum: number, record: any) => sum + record.mg, 0),
      pendingListCount: (input.noMatchMemory || []).filter((item: any) => item.status === "pending").length,
    };
  }
  if (testCase.category === "calendar_isolation") {
    return { calendarTotalMg: (input.calendarRecords || []).filter((record: any) => record.kind !== "simulation").reduce((sum: number, record: any) => sum + record.mg, 0) };
  }
  return {
    realRecordCount: (input.realRecords || []).length,
    todayTotalMg: (input.realRecords || []).reduce((sum: number, record: any) => sum + record.mg, 0),
  };
}

export function evaluateRuleCases(testCases: RuleCase[]): RuleEvaluationSummary {
  const cases = testCases.map((testCase) => {
    const actual =
      testCase.category.includes("calculation") || testCase.category === "sleep_residual" || testCase.category === "risk_rule"
        ? evaluateCalculation(testCase)
        : testCase.category.includes("isolation")
          ? evaluateIsolation(testCase)
          : testCase.category.includes("frequent") || testCase.category === "no_match"
            ? evaluateMemory(testCase)
            : testCase.category.includes("calendar") || testCase.category.includes("feedback")
              ? evaluateCalendar(testCase)
              : evaluateIsolation(testCase);
    const verdict = evaluateExpected(testCase.expected, actual, testCase.tolerance);
    return {
      id: testCase.id,
      name: testCase.name,
      category: testCase.category,
      expected: testCase.expected,
      actual,
      passed: verdict.passed,
      notes: verdict.notes,
    };
  });

  const calculationCases = cases.filter((item) => item.category.includes("calculation") || item.category === "sleep_residual" || item.category === "risk_rule");
  const isolationCases = cases.filter((item) => item.category.includes("isolation"));
  const boundaryCases = cases.filter((item) => /future|0mg|极高|跨日|无|pending|converted|取消/.test(item.name));

  return {
    total: cases.length,
    passed: cases.filter((item) => item.passed).length,
    calculationConsistency: calculationCases.length ? calculationCases.filter((item) => item.passed).length / calculationCases.length : 1,
    rulePassRate: cases.length ? cases.filter((item) => item.passed).length / cases.length : 1,
    boundaryCasePassRate: boundaryCases.length ? boundaryCases.filter((item) => item.passed).length / boundaryCases.length : 1,
    dataIsolationPassRate: isolationCases.length ? isolationCases.filter((item) => item.passed).length / isolationCases.length : 1,
    failedCases: cases.filter((item) => !item.passed),
    cases,
  };
}
