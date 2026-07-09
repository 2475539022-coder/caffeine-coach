export async function recognizeDrinkFromImage(_file: File) {
  await new Promise((resolve) => window.setTimeout(resolve, 650));
  return {
    rawText: "瑞幸咖啡 生椰拿铁 大杯 冰",
    brand: "瑞幸咖啡",
    drinkName: "生椰拿铁",
    sizeLabel: "大杯",
    volumeMl: 480,
    confidence: "medium" as const,
  };
}
