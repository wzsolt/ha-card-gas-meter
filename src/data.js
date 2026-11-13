export const CARD_TYPE = "ha-card-gas-meter";
export const CHARTS = ["hourly", "daily", "monthly", "voltage"];
export const FIELDS = [
  "meter_entity", "consumption_entity", "last_contact_entity",
  "battery_level_entity", "battery_voltage_entity", "temperature_entity",
];

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

export function normalizeConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Gas Meter Card requires a configuration object.");
  }
  for (const field of FIELDS) {
    if (config[field] && !/^sensor\.[a-z0-9_]+$/.test(config[field])) {
      throw new Error(field + " must be a sensor entity ID.");
    }
  }
  return {
    ...config,
    charts: {
      ...Object.fromEntries(CHARTS.map((key) => [key, config.charts?.[key] !== false])),
      temperature: config.charts?.temperature !== false,
    },
  };
}

export function numeric(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Represent calendar dates as UTC dates for date arithmetic only. Resolve each
// local midnight separately because its UTC offset can differ from today's.
export function calendar(zone, now) {
  const dateFormat = new Intl.DateTimeFormat("en", {
    timeZone: zone, year: "numeric", month: "numeric", day: "numeric",
  });
  const clockFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  function localDate(time) {
    const parts = dateFormat.formatToParts(time);
    const part = (name) => Number(parts.find(({ type }) => type === name).value);
    return Date.UTC(part("year"), part("month") - 1, part("day"));
  }
  function midnight(date) {
    // Find the first instant of the local date, including dates whose clock
    // jumps at midnight. The search window covers all current UTC offsets.
    let low = date - 26 * hour;
    let high = date + 26 * hour;
    while (high - low > 1) {
      const middle = Math.floor((high + low) / 2);
      if (localDate(middle) < date) low = middle;
      else high = middle;
    }
    return high;
  }
  const today = localDate(now);
  const start = now - day;
  const hourly = [];
  function addHour(time, label) {
    hourly.push({ key: localDate(time), start: time, end: now, label, partial: true });
  }
  function clockMinute(label) {
    return Number(label.slice(0, 2)) * 60 + Number(label.slice(3));
  }
  const firstLabel = clockFormat.format(start);
  addHour(start, firstLabel);
  let previousClockMinute = clockMinute(firstLabel);
  // Split at local hour boundaries or clock changes. Clip the outer buckets
  // so that even on a clock change the window spans exactly 24 elapsed hours.
  for (let time = Math.floor(start / minute) * minute + minute; time <= now; time += minute) {
    const label = clockFormat.format(time);
    const currentClockMinute = clockMinute(label);
    if (currentClockMinute % 60 === 0 || currentClockMinute !== (previousClockMinute + 1) % 1440) {
      const previousHour = hourly.at(-1);
      previousHour.end = time;
      previousHour.partial = false;
      if (time < now) addHour(time, label);
    }
    previousClockMinute = currentClockMinute;
  }
  const hourKey = ({ key, label }) => key + ":" + label.slice(0, 2);
  const counts = new Map();
  for (const bucket of hourly) {
    const key = hourKey(bucket);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const bucket of hourly) bucket.repeated = counts.get(hourKey(bucket)) > 1;
  const date = new Date(today);
  const month = (offset) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1);
  const daily = Array.from({ length: 30 }, (_, index) => {
    const key = today - (29 - index) * day;
    return { key, start: midnight(key), partial: index === 29 };
  });
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const key = month(index - 11);
    return { key, start: midnight(key), partial: index === 11 };
  });
  return { now, hourly, daily, monthly, localDate };
}

function historySamples(rows, now) {
  return rows.map((row) => ({
    time: (row.lc ?? row.lu) * 1000,
    value: numeric(row.s),
  })).filter(({ time }) => Number.isFinite(time) && time <= now)
    .sort((a, b) => a.time - b.time);
}

export function hourlyValues(buckets, rows, now) {
  const samples = historySamples(rows, now);

  let index = 0;
  let previous = null;
  return buckets.map((bucket) => {
    while (index < samples.length && samples[index].time < bucket.start) {
      previous = samples[index++].value;
    }
    if (bucket.start > now) return { ...bucket, value: null };
    let value = previous === null ? null : 0;
    while (index < samples.length && samples[index].time < bucket.end) {
      const next = samples[index++].value;
      if (next === null || previous === null || next < previous) {
        value = null;
      } else if (value !== null) {
        value += next - previous;
      }
      previous = next;
    }
    return { ...bucket, value };
  });
}

// Recorder logs state changes. Weight each reading by how long it was
// current inside the bucket, skipping intervals with an unavailable state.
export function hourlyTemperature(buckets, rows, now) {
  const samples = historySamples(rows, now);
  let index = 0;
  let value = null;
  return buckets.map(({ start, end }) => {
    while (index < samples.length && samples[index].time <= start) {
      value = samples[index++].value;
    }
    let cursor = start;
    let weighted = 0;
    let duration = 0;
    while (index < samples.length && samples[index].time < end) {
      const sample = samples[index++];
      if (value !== null) {
        weighted += value * (sample.time - cursor);
        duration += sample.time - cursor;
      }
      cursor = sample.time;
      value = sample.value;
    }
    if (value !== null) {
      weighted += value * (end - cursor);
      duration += end - cursor;
    }
    return duration ? weighted / duration : null;
  });
}

export function statisticsValues(buckets, rows, calendar, field, period) {
  const values = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row.start) || row.start > calendar.now) continue;
    let key = calendar.localDate(row.start);
    if (period === "month") {
      const date = new Date(key);
      key = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    }
    const value = numeric(row[field]);
    values.set(key, field === "change" && value < 0 ? null : value);
  }
  return buckets.map((bucket) => ({ ...bucket, value: values.get(bucket.key) ?? null }));
}

export function sourceFor(key, config) {
  return key === "voltage" ? config.battery_voltage_entity : config.consumption_entity;
}

export async function fetchHistory(hass, id, dates) {
  const result = await hass.callWS({
    type: "history/history_during_period",
    entity_ids: [id],
    // Recorder labels the synthetic opening state with the request start.
    start_time: new Date(dates.hourly[0].start - 1000).toISOString(),
    end_time: new Date(dates.now).toISOString(),
    include_start_time_state: true,
    minimal_response: true,
    no_attributes: true,
    significant_changes_only: false,
  });
  return result[id] ?? [];
}

export async function fetchSeries(hass, key, id, dates) {
  if (key === "hourly") {
    return hourlyValues(dates.hourly, await fetchHistory(hass, id, dates), dates.now);
  }
  const period = key === "monthly" ? "month" : "day";
  const buckets = period === "month" ? dates.monthly : dates.daily;
  const field = key === "voltage" ? "mean" : "change";
  const rows = await recorderStatistics(hass, id, buckets[0].start, dates.now, period, field);
  return statisticsValues(buckets, rows, dates, field, period);
}

export async function recorderStatistics(hass, id, start, end, period, field) {
  const result = await hass.callWS({
    type: "recorder/statistics_during_period",
    statistic_ids: [id],
    start_time: new Date(start).toISOString(),
    end_time: new Date(end).toISOString(),
    period,
    types: [field],
  });
  return result[id] ?? [];
}
