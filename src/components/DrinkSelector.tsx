import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { DrinkCategory, DrinkConfidence, DrinkItem, DrinkSourceType } from "../types/drink";

type FilterKey = "all" | DrinkCategory | "decaf";

const filters: { key: FilterKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "coffee", label: "咖啡" },
  { key: "tea", label: "茶" },
  { key: "milk_tea", label: "奶茶" },
  { key: "energy_drink", label: "能量饮料" },
  { key: "soda", label: "碳酸饮料" },
  { key: "decaf", label: "低因" },
];

export const categoryLabels: Record<DrinkCategory, string> = {
  coffee: "咖啡",
  tea: "茶",
  milk_tea: "奶茶",
  energy_drink: "能量饮料",
  soda: "碳酸饮料",
  other: "其他",
};

export const sourceLabels: Record<DrinkSourceType, string> = {
  generic_estimate: "估算",
  brand_library: "品牌库",
  label: "标签",
  food_api: "食品库",
  user_custom: "我的常喝",
};

export const confidenceLabels: Record<DrinkConfidence, string> = {
  low: "低置信",
  medium: "中置信",
  high: "高置信",
  user_confirmed: "已确认",
};

function searchableText(drink: DrinkItem) {
  return [
    drink.brand,
    drink.name,
    drink.displayName,
    drink.sizeLabel,
    drink.category,
    drink.subCategory,
    ...(drink.aliases || []),
    ...(drink.ocrKeywords || []),
    ...(drink.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function metaText(drink: DrinkItem) {
  return [drink.sizeLabel, drink.volumeMl ? `${drink.volumeMl}ml` : ""].filter(Boolean).join(" · ");
}

export function DrinkSelector({
  drinks,
  selectedId,
  onSelect,
  onAddCustom,
  onSaveNoMatchName,
  onSaveNoMatchAsCustom,
  noMatchPrimaryLabel = "补充并保存",
}: {
  drinks: DrinkItem[];
  selectedId?: string;
  onSelect: (drink: DrinkItem) => void;
  onAddCustom?: () => void;
  onSaveNoMatchName?: (rawInput: string) => void;
  onSaveNoMatchAsCustom?: (rawInput: string, caffeineMg: number) => void;
  noMatchPrimaryLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [noMatchMg, setNoMatchMg] = useState(80);
  const hasSearchIntent = query.trim().length > 0 || filter !== "all";
  const noMatchQuery = query.trim();
  const canRememberNoMatch = noMatchQuery.length > 0 && Boolean(onSaveNoMatchName || onSaveNoMatchAsCustom);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized && filter === "all") return [];
    return drinks
      .filter((drink) => {
        if (filter === "decaf") return drink.isDecaf;
        if (filter !== "all") return drink.category === filter;
        return true;
      })
      .filter((drink) => !normalized || searchableText(drink).includes(normalized))
      .slice(0, 24);
  }, [drinks, filter, query]);

  return (
    <div className="rounded-[28px] bg-white/45 p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/35" />
        <input
          className="field pl-12"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索品牌、饮品名、别名或识别关键词"
        />
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {filters.map((item) => (
          <button
            key={item.key}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold ${
              filter === item.key ? "border-caramel bg-caramel text-white" : "border-[#eadccd] bg-white/60 text-ink/60"
            }`}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-4 max-h-[330px] space-y-3 overflow-y-auto pr-1">
        {!hasSearchIntent ? (
          <div className="rounded-[24px] bg-white/65 p-5 text-center">
            <p className="font-bold text-ink">先搜索你喝了什么</p>
            <p className="mt-2 text-sm leading-relaxed text-ink/55">
              输入品牌、饮品名、别名或杯型后，我会显示可能候选；找不到时可以在下方确认卡里手动填写。
            </p>
          </div>
        ) : results.length ? (
          results.map((drink) => (
            <button
              key={drink.id}
              onClick={() => onSelect(drink)}
              className={`w-full rounded-[24px] border p-4 text-left transition ${
                selectedId === drink.id ? "border-caramel bg-[#fff4e8]" : "border-[#eadccd] bg-white/68 hover:bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-ink">{drink.displayName}</p>
                  <p className="mt-1 text-sm text-ink/50">
                    {[drink.brand, categoryLabels[drink.category], metaText(drink)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="shrink-0 font-display text-3xl text-caramel">
                  {drink.caffeineMg}<span className="font-sans text-sm text-ink/50">mg</span>
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#fff8ee] px-3 py-1 text-xs font-bold text-caramel">{sourceLabels[drink.sourceType]}</span>
                <span className="rounded-full bg-[#eef4e8] px-3 py-1 text-xs font-bold text-[#668f58]">{confidenceLabels[drink.confidence]}</span>
                {drink.isDecaf && <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ink/55">低因</span>}
              </div>
              {drink.notes && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink/45">{drink.notes}</p>}
            </button>
          ))
        ) : (
          <div className="rounded-[24px] bg-white/65 p-5 text-center">
            <p className="font-semibold text-ink/70">
              {noMatchQuery ? `没有找到“${noMatchQuery}”` : "没有找到可信饮品"}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink/45">
              是否创建为自定义饮品？不会自动编造咖啡因含量，可以按包装、菜单或经验值补充。
            </p>
            {canRememberNoMatch && (
              <div className="mt-4 rounded-[20px] bg-[#fff8ee] p-4 text-left">
                <label className="block text-xs font-bold text-ink/55">咖啡因含量估算 mg</label>
                <input
                  className="mt-2 w-full rounded-full border border-[#eadccd] bg-white/75 px-4 py-3 text-sm font-bold text-ink outline-none"
                  type="number"
                  min="0"
                  value={noMatchMg}
                  onChange={(event) => setNoMatchMg(Number(event.target.value) || 0)}
                />
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {onSaveNoMatchAsCustom && (
                    <button className="rounded-full bg-caramel px-4 py-2 text-sm font-bold text-white" onClick={() => onSaveNoMatchAsCustom(noMatchQuery, noMatchMg)}>
                      {noMatchPrimaryLabel}
                    </button>
                  )}
                  {onSaveNoMatchName && (
                    <button className="rounded-full border border-[#eadccd] bg-white/70 px-4 py-2 text-sm font-bold text-caramel" onClick={() => onSaveNoMatchName(noMatchQuery)}>
                      仅保存名称
                    </button>
                  )}
                  <button className="rounded-full border border-[#eadccd] bg-white/45 px-4 py-2 text-sm font-bold text-ink/45" onClick={() => setQuery("")}>
                    取消
                  </button>
                </div>
              </div>
            )}
            {onAddCustom && (
              <button className="mt-4 inline-flex items-center gap-2 rounded-full bg-caramel px-5 py-3 font-bold text-white shadow-button" onClick={onAddCustom}>
                <Plus className="h-4 w-4" />
                添加我的常喝饮品
              </button>
            )}
          </div>
        )}
      </div>
      {onAddCustom && (
        <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-[#eadccd] bg-white/58 px-5 py-3 font-bold text-caramel" onClick={onAddCustom}>
          <Plus className="h-4 w-4" />
          添加我的常喝饮品
        </button>
      )}
    </div>
  );
}
