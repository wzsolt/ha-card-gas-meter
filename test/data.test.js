import assert from "node:assert/strict";
import { test } from "node:test";
import { calendar, fetchSeries, hourlyValues, normalizeConfig, statisticsValues } from "../src/data.js";

const zone = "Europe/Budapest";
const ms = Date.parse;
const row = (s, iso, field = "lc") => ({ s, [field]: ms(iso) / 1000 });

test("uses the local midnight baseline, assigns increases by arrival hour, and leaves the future empty", () => {
  const dates = calendar(zone, ms("2026-11-11T03:20:00Z"));
  const values = hourlyValues(dates.hourly, [
    row("100", "2026-11-10T22:59:59Z", "lu"),
    row("100.125", "2026-11-10T23:00:00Z"),
    row("100.25", "2026-11-10T23:30:00Z"),
    row("100.75", "2026-11-11T02:55:00Z"),
  ], dates.now);
  assert.equal(new Date(dates.start).toISOString(), "2026-11-10T23:00:00.000Z");
  assert.deepEqual(values.slice(0, 6).map(({ value }) => value), [0.25, 0, 0, 0.5, 0, null]);
  assert.equal(values[4].partial, true);
});

test("a missing opening state, unavailable sample and meter reset leave gaps", () => {
  const dates = calendar("UTC", ms("2026-11-11T08:00:00Z"));
  const values = hourlyValues(dates.hourly, [
    row("80", "2026-11-11T01:30:00Z"),
    row("81", "2026-11-11T02:15:00Z"),
    row("unavailable", "2026-11-11T03:15:00Z"),
    row("83", "2026-11-11T04:15:00Z"),
    row("1", "2026-11-11T05:15:00Z"),
    row("1.5", "2026-11-11T06:15:00Z"),
  ], dates.now);
  assert.deepEqual(values.slice(0, 8).map(({ value }) => value), [null, null, 1, null, null, null, 0.5, 0]);
  assert.equal(hourlyValues(dates.hourly, [], dates.now).every(({ value }) => value === null), true);
});

test("both clock changes use local hours and keep repeated consumption distinct", () => {
  const spring = calendar(zone, ms("2026-03-29T12:00:00Z"));
  assert.equal(spring.hourly.length, 23);
  assert.equal(spring.hourly.some(({ label }) => label === "02:00"), false);
  const fall = calendar(zone, ms("2026-10-25T12:00:00Z"));
  assert.equal(fall.hourly.length, 25);
  const values = hourlyValues(fall.hourly, [
    row("20", "2026-10-24T21:59:59Z"),
    row("21", "2026-10-25T00:30:00Z"),
    row("23", "2026-10-25T01:30:00Z"),
  ], fall.now);
  const repeated = values.filter(({ label }) => label === "02:00");
  assert.deepEqual(repeated.map(({ value, repeated }) => [value, repeated]), [[1, true], [2, true]]);
});

test("30 days and 12 months roll over by the local date, with gaps and partial statistics", () => {
  const dates = calendar(zone, ms("2026-12-31T23:15:00Z"));
  assert.equal(dates.daily.length, 30);
  assert.equal(dates.monthly.length, 12);
  assert.equal(dates.daily[0].key, ms("2026-12-03"));
  assert.equal(dates.monthly[0].key, ms("2026-02-01"));
  const month = statisticsValues(dates.monthly, [
    { start: ms("2026-10-31T23:00:00Z"), change: 0 },
    { start: ms("2026-11-30T23:00:00Z"), change: null },
    { start: ms("2026-12-31T23:00:00Z"), change: 8.125 },
  ], dates, "change", "month");
  assert.deepEqual(month.slice(-3).map(({ value, partial }) => [value, partial]), [
    [0, false], [null, false], [8.125, true],
  ]);
  const voltage = statisticsValues(dates.daily, [
    { start: ms("2026-12-30T23:00:00Z"), mean: 4.075 },
    { start: ms("2027-01-01T23:00:00Z"), mean: 5 },
  ], dates, "mean", "day");
  assert.deepEqual(voltage.slice(-3).map(({ value }) => value), [null, 4.075, null]);
});

test("requests only the intended Recorder statistic and uses a pre-midnight opening state", async () => {
  const calls = [];
  const hass = { callWS: async (message) => { calls.push(message); return {}; } };
  const dates = calendar(zone, ms("2026-11-11T09:15:00Z"));
  const settings = normalizeConfig({ charts: { voltage: false } });
  assert.deepEqual(settings.charts, { hourly: true, daily: true, monthly: true, voltage: false });
  await fetchSeries(hass, "hourly", "sensor.consumption", dates);
  await fetchSeries(hass, "monthly", "sensor.consumption", dates);
  await fetchSeries(hass, "voltage", "sensor.voltage", dates);
  assert.equal(calls[0].type, "history/history_during_period");
  assert.equal(calls[0].start_time, "2026-11-10T22:59:59.000Z");
  assert.equal(calls[0].include_start_time_state, true);
  assert.deepEqual(calls[0].entity_ids, ["sensor.consumption"]);
  assert.deepEqual(calls[1].types, ["change"]);
  assert.equal(calls[1].period, "month");
  assert.deepEqual(calls[2].types, ["mean"]);
  assert.deepEqual(calls[2].statistic_ids, ["sensor.voltage"]);
});
