import { fetchSeries, numeric, recorderStatistics } from "./data.js";

const dayMs = 86_400_000;
const firstMvmDay = Date.UTC(2024, 7, 1);
export const monthlyWeights = Object.freeze([
  12365, 10421, 8915, 5145, 1827, 635, 512, 565, 1109, 3724, 7490, 10937,
]);
export const costDefaults = {
  market_ft_per_mj: 22.002,
  base_ft_per_year: 11674,
  annual_allowance_mj: 63645,
};
export const costNumberFields = [
  "discounted_ft_per_mj", "market_ft_per_mj", "base_ft_per_year",
  "heating_value_mj_per_m3", "correction_factor", "annual_allowance_mj",
];

function dateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = Date.parse(value);
  return Number.isFinite(date) && new Date(date).toISOString().startsWith(value) ? date : null;
}

export function costEnabled(cost) {
  return cost != null && cost.enabled !== false;
}

export function costOptions(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const values = Object.fromEntries(costNumberFields.map((field) => [
    field, numeric(config[field] ?? costDefaults[field]),
  ]));
  const effectiveDate = dateKey(config.effective_from);
  const effective = Math.max(effectiveDate, firstMvmDay);
  const billingStart = dateKey(config.billing_period_start);
  const weights = config.monthly_weights ?? monthlyWeights;
  if (effectiveDate === null || (config.billing_period_start && billingStart === null) ||
      !Array.isArray(weights) || weights.length !== 12) return null;
  const openingDate = dateKey(config.opening_date);
  const openingVolume = numeric(config.opening_consumption_m3);
  const hasOpening = [config.opening_date, config.opening_consumption_m3]
    .some((value) => value != null && value !== "");
  if (hasOpening && (openingDate === null || openingDate < effective ||
      openingVolume === null || openingVolume < 0 ||
      (openingDate === gasYearStart(openingDate) && openingVolume !== 0))) return null;
  const curve = weights.map(numeric);
  const weightTotal = curve.reduce((sum, value) => sum + value, 0);
  if (curve.some((value) => value === null || value < 0) || !(weightTotal > 0) ||
      !Number.isFinite(weightTotal) ||
      costNumberFields.some((field) => values[field] === null ||
        (field === "base_ft_per_year" ? values[field] < 0 : values[field] <= 0)) ||
      values.market_ft_per_mj < values.discounted_ft_per_mj) return null;
  return {
    ...values,
    effective, billingStart,
    opening: hasOpening ? { start: openingDate, volume: openingVolume } : null,
    monthlyAllowance: curve.map((weight) => values.annual_allowance_mj * (weight / weightTotal)),
  };
}

function monthStart(key, offset = 0) {
  const date = new Date(key);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1);
}

export function gasYearStart(key, offset = 0) {
  const date = new Date(key);
  const year = date.getUTCFullYear() - Number(date.getUTCMonth() < 7);
  return Date.UTC(year + offset, 7, 1);
}

export function costHistoryStart(today, options) {
  const first = Math.max(gasYearStart(today, -3), options.effective);
  const opening = options.opening;
  return opening && first >= gasYearStart(opening.start) && first < opening.start
    ? opening.start : first;
}

function daysInMonth(key) {
  return (monthStart(key, 1) - monthStart(key)) / dayMs;
}

function accruedAllowance(start, end, monthlyAllowance) {
  let quota = 0;
  for (let key = start; key < end; ) {
    const monthEnd = monthStart(key, 1);
    const days = (Math.min(end, monthEnd) - key) / dayMs;
    quota += monthlyAllowance[new Date(key).getUTCMonth()] * days / daysInMonth(key);
    key = monthEnd;
  }
  return quota;
}

export function dailyLedger(days, first, today, options) {
  let quota = 0;
  let used = 0;
  let uncertain = first !== gasYearStart(first);
  const ledger = new Map();
  const opening = options.opening;
  const openingYear = opening ? gasYearStart(opening.start) : null;
  const mjPerM3 = options.heating_value_mj_per_m3 * options.correction_factor;
  for (let key = first; key <= today; key += dayMs) {
    if (opening && key >= openingYear && key < opening.start) continue;
    if (key === gasYearStart(key)) {
      quota = 0;
      used = 0;
      uncertain = false;
    }
    if (key === opening?.start) {
      quota = accruedAllowance(openingYear, key, options.monthlyAllowance);
      used = opening.volume * mjPerM3;
      uncertain = false;
    }
    const volume = days.get(key);
    if (!Number.isFinite(volume) || volume < 0) {
      quota = 0;
      used = 0;
      uncertain = true;
      continue;
    }
    const month = new Date(key).getUTCMonth();
    const monthDays = daysInMonth(key);
    const dailyQuota = options.monthlyAllowance[month] / monthDays;
    const heat = volume * mjPerM3;

    // New quota first reprices previous usage above the cap. The remainder
    // and any unused quota from earlier days cover today's usage.
    const repriced = Math.min(dailyQuota, Math.max(0, used - quota));
    quota += dailyQuota;
    const discountedHeat = Math.min(heat, Math.max(0, quota - used));
    used += heat;
    const discounted = discountedHeat * options.discounted_ft_per_mj;
    const market = (heat - discountedHeat) * options.market_ft_per_mj;
    const correction = repriced > 0 ? repriced * (options.discounted_ft_per_mj - options.market_ft_per_mj) : 0;
    const base = options.base_ft_per_year / 12 / monthDays;
    ledger.set(key, {
      value: discounted + market + correction + base,
      discounted, market, correction, base, uncertain,
    });
  }
  return ledger;
}

function summarize(ledger, key, end, today, delayed, first) {
  const last = Math.min(end, today + dayMs);
  const totals = { value: 0, discounted: 0, market: 0, correction: 0, base: 0 };
  let count = 0;
  let uncertain = false;
  for (let date = Math.max(key, first); date < last; date += dayMs) {
    const line = ledger.get(date);
    if (!line) continue;
    for (const field of Object.keys(totals)) totals[field] += line[field];
    count++;
    uncertain ||= line.uncertain;
  }
  return {
    ...totals, key, end, value: count ? totals.value : null,
    partial: end > today,
    incomplete: count !== (last - key) / dayMs,
    uncertain,
    delayed: delayed && today >= key && today < end && ledger.has(today),
  };
}

export function buildCostView(days, today, options, delayed = false) {
  const first = costHistoryStart(today, options);
  const ledger = dailyLedger(days, first, today, options);
  const point = (start, end) => summarize(ledger, start, end, today, delayed, first);
  const daily = Array.from({ length: 30 }, (_, index) => {
    const key = today - (29 - index) * dayMs;
    return point(key, key + dayMs);
  });
  const monthly = Array.from({ length: 12 }, (_, index) =>
    point(monthStart(today, index - 11), monthStart(today, index - 10)));
  const yearly = [-3, -2, -1, 0].map((offset) =>
    point(gasYearStart(today, offset), gasYearStart(today, offset + 1)))
    .filter(({ end }) => end > firstMvmDay);
  const summary = {
    costToday: daily.at(-1), costMonth: monthly.at(-1), costYear: yearly.at(-1),
  };
  if (options.billingStart !== null && options.billingStart <= today) {
    summary.costBilling = point(options.billingStart, today + dayMs);
  }
  return { daily, monthly, yearly, summary };
}

function dailyVolumes(rows, dates) {
  const volumes = new Map();
  for (const { start, change } of rows) {
    const volume = numeric(change);
    if (Number.isFinite(start) && start <= dates.now && volume !== null && volume >= 0) {
      volumes.set(dates.localDate(start), volume);
    }
  }
  return volumes;
}

export async function fetchClosedDays(hass, id, dates, options) {
  const first = costHistoryStart(dates.today, options);
  if (first >= dates.today) return new Map();
  const rows = await recorderStatistics(hass, id, dates.midnight(first), dates.start - 1, "day", "change");
  const volumes = dailyVolumes(rows, dates);
  volumes.delete(dates.today);
  return volumes;
}

export async function fetchTodayVolume(hass, id, dates, hourly) {
  try {
    const hours = (await (hourly ?? fetchSeries(hass, "hourly", id, dates)))
      .filter(({ start }) => start <= dates.now);
    if (hours.length && hours.every(({ value }) => Number.isFinite(value) && value >= 0)) {
      return { volume: hours.reduce((total, { value }) => total + value, 0), delayed: false };
    }
  } catch {
    // Recorder statistics can still be available when raw history fails.
  }
  const rows = await recorderStatistics(hass, id, dates.start, dates.now, "day", "change");
  return { volume: dailyVolumes(rows, dates).get(dates.today), delayed: true };
}
