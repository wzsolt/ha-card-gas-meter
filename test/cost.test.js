import assert from "node:assert/strict";
import { test } from "node:test";
import { calendar } from "../src/data.js";
import {
  buildCostView, costOptions, dailyLedger, fetchClosedDays, fetchTodayVolume, gasYearStart, monthlyWeights,
} from "../src/cost.js";

const key = Date.parse;
const day = 86_400_000;
const options = (overrides = {}) => costOptions({
  discounted_ft_per_mj: 2, market_ft_per_mj: 10,
  heating_value_mj_per_m3: 5, correction_factor: 1.2, base_ft_per_year: 0,
  annual_allowance_mj: 372, monthly_weights: Array(12).fill(31),
  effective_from: "2024-08-01", ...overrides,
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8,
  "Expected " + actual + " to be close to " + expected);

test("carries unused allowance and separately reprices earlier above-allowance usage", () => {
  const start = key("2026-08-01");
  const days = new Map([[start, 0], [start + day, 1], [start + 2 * day, 0], [start + 3 * day, 0.5]]);
  const ledger = dailyLedger(days, start, start + 3 * day, options());
  const second = ledger.get(start + day);
  assert.equal(second.discounted, 4);
  assert.equal(second.market, 40);
  assert.equal(second.correction, 0);
  assert.equal(second.value, 44);
  assert.equal(ledger.get(start + 2 * day).value, -8);
  const fourth = ledger.get(start + 3 * day);
  assert.deepEqual([fourth.discounted, fourth.market, fourth.correction, fourth.value], [0, 30, -8, 22]);
  close([...ledger.values()].reduce((total, point) => total + point.value, 0), 4 * 2 + 5 * 10);
});

test("uses the published seasonal profile and spreads February over all leap days", () => {
  const standard = costOptions({
    discounted_ft_per_mj: 2, heating_value_mj_per_m3: 1, correction_factor: 1,
    effective_from: "2024-08-01",
  });
  const { monthlyAllowance } = standard;
  assert.equal(monthlyWeights.reduce((sum, value) => sum + value, 0), 63645);
  for (const [month, expected] of [[0, 12365], [6, 512], [10, 7490]]) close(monthlyAllowance[month], expected);

  for (const [year, length] of [[2027, 28], [2028, 29]]) {
    const first = Date.UTC(year, 1, 1);
    const days = new Map(Array.from({ length }, (_, index) => [first + index * day, 1000]));
    const ledger = dailyLedger(days, first, first + (length - 1) * day, standard);
    close(ledger.get(first).discounted, 10421 / length * 2);
    const cheapEnergy = [...ledger.values()].reduce((total, line) => total +
      line.discounted / standard.discounted_ft_per_mj -
      line.correction / (standard.market_ft_per_mj - standard.discounted_ft_per_mj), 0);
    close(cheapEnergy, 10421);
  }
});

test("starts a new allowance on August 1, including after an incomplete year", () => {
  const july = key("2026-07-31");
  const august = july + day;
  const ledger = dailyLedger(new Map([[july, 0], [august, 1]]), july, august, options());
  assert.equal(gasYearStart(july), key("2025-08-01"));
  assert.equal(gasYearStart(august), key("2026-08-01"));
  assert.equal(ledger.get(july).uncertain, true);
  assert.equal(ledger.get(august).uncertain, false);
  assert.equal(ledger.get(august).discounted, 2);
  assert.equal(ledger.get(august).market, 50);
});

test("aggregates base fees and supports a billing period that starts mid-month", () => {
  const first = key("2025-08-01");
  const today = key("2026-08-05");
  const days = new Map(Array.from({ length: (today - first) / day + 1 }, (_, index) => [first + index * day, 0]));
  const view = buildCostView(days, today, options({
    base_ft_per_year: 1200, effective_from: "2025-08-01", billing_period_start: "2026-07-15",
  }));
  close(view.monthly.at(-2).base, 100);
  close(view.yearly.at(-2).value, 1200);
  close(view.summary.costToday.value, 100 / 31);
  close(view.summary.costMonth.value, 5 * 100 / 31);
  close(view.summary.costYear.value, 5 * 100 / 31);
  close(view.summary.costBilling.value, 22 * 100 / 31);
  assert.equal(view.summary.costBilling.incomplete, false);
  assert.equal(view.summary.costBilling.uncertain, false);
});

test("leaves missing or unpriced days blank and marks affected totals and allowance", () => {
  const start = key("2026-08-01");
  const today = start + 3 * day;
  const days = new Map([[start, 1], [start + day, 1], [today, 1]]);
  const view = buildCostView(days, today, options({ effective_from: "2026-08-02" }), true);
  assert.deepEqual(view.daily.slice(-4).map(({ value }) => value), [null, 52, null, 52]);
  assert.equal(view.summary.costToday.delayed, true);
  assert.equal(view.summary.costToday.uncertain, true);
  assert.equal(view.summary.costMonth.incomplete, true);
  assert.equal(view.summary.costMonth.value, 104);
  assert.equal(view.summary.costYear.uncertain, true);
  assert.equal(view.yearly.some(({ key: start }) => start < key("2024-08-01")), false);
  assert.equal(options({ effective_from: "2026-02-30" }), null);
  assert.equal(options({ monthly_weights: Array(12).fill(0) }), null);
  assert.equal(options({ market_ft_per_mj: 1 }), null);
});

test("keeps today's live total separate from closed days and labels a Recorder fallback", async () => {
  const dates = calendar("Europe/Budapest", key("2026-11-11T01:15:00Z"));
  const calls = [];
  const id = "sensor.consumption";
  const hass = {
    callWS: async (request) => {
      calls.push(request);
      return { [id]: [
        { start: dates.start - day, change: 1.2 },
        { start: dates.start, change: 2.5 },
      ] };
    },
  };
  const complete = dates.hourly.filter(({ start }) => start <= dates.now).map((hour, index) => ({
    ...hour, value: index,
  }));
  const live = await fetchTodayVolume(hass, id, dates, Promise.resolve(complete));
  assert.deepEqual(live, { volume: 3, delayed: false });
  assert.equal(calls.length, 0);
  const incomplete = [{ ...complete[0], value: null }, ...complete.slice(1)];
  assert.deepEqual(await fetchTodayVolume(hass, id, dates, Promise.resolve(incomplete)), { volume: 2.5, delayed: true });
  assert.deepEqual(await fetchClosedDays(hass, id, dates, options()), new Map([[dates.today - day, 1.2]]));
  assert.equal(calls[0].start_time, new Date(dates.start).toISOString());
  assert.equal(calls[1].end_time, new Date(dates.start - 1).toISOString());
});

test("seeds the November allowance once and prices Recorder readings from the opening date", async () => {
  const opening = key("2026-11-01");
  const today = opening + day;
  const settings = options({
    effective_from: "2026-09-01",
    opening_date: "2026-11-01",
    opening_consumption_m3: 16,
  });
  const days = new Map([[opening - day, 1000], [opening, 1], [today, 0]]);
  const view = buildCostView(days, today, settings);
  const [before, first, second] = view.daily.slice(-3);
  assert.equal(before.value, null);
  assert.equal(first.market, 60);
  assert.equal(first.uncertain, false);
  close(first.correction, -8 * 31 / 30);
  close(second.correction, first.correction);
  close(view.summary.costMonth.value, 60 + first.correction + second.correction);
  assert.equal(view.summary.costMonth.incomplete, false);
  assert.equal(view.summary.costYear.incomplete, true);

  const dates = calendar("Europe/Budapest", key("2026-11-02T10:00:00Z"));
  const hass = { callWS: async (message) => {
    assert.equal(message.start_time, "2026-10-31T23:00:00.000Z");
    return {};
  } };
  await fetchClosedDays(hass, "sensor.consumption", dates, settings);
});

test("accepts a zero opening volume, validates the pair, and resets at the next gas year", () => {
  assert.equal(options({ opening_date: "2026-11-01" }), null);
  assert.equal(options({ opening_consumption_m3: 1 }), null);
  assert.equal(options({ opening_date: "2026-11-01", opening_consumption_m3: -1 }), null);
  assert.equal(options({ opening_date: "2026-08-01", opening_consumption_m3: 1 }), null);
  assert.equal(options({
    effective_from: "2026-11-02", opening_date: "2026-11-01", opening_consumption_m3: 0,
  }), null);
  const settings = options({ opening_date: "2026-11-01", opening_consumption_m3: 0 });
  const first = key("2026-11-01");
  const nextYear = key("2027-08-01");
  const ledger = dailyLedger(new Map([[first, 1], [nextYear, 1]]), first, nextYear, settings);
  assert.equal(ledger.get(first).discounted, 12);
  assert.equal(ledger.get(first).market, 0);
  assert.equal(ledger.get(nextYear).discounted, 2);
  assert.equal(ledger.get(nextYear).market, 50);
  assert.equal(ledger.get(nextYear).uncertain, false);
});
