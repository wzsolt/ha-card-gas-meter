# Gas Meter Card

A Home Assistant dashboard card for a cumulative gas meter. It shows the physical meter reading, the last report and the estimated battery level alongside interactive hourly, daily and monthly consumption charts and a battery voltage chart.

## Install

1. In HACS, open **Custom repositories** from the menu. Add `https://github.com/wzsolt/ha-card-gas-meter` as a **Dashboard** repository.
2. Download **Gas Meter Card** and reload your dashboard. If you manage Lovelace resources in YAML, add the JavaScript module URL shown by HACS to your resources.
3. Edit your dashboard, add **Gas Meter Card**, and select your sensors. You can also paste the YAML below into a manual card.

### Manual installation

Download `ha-card-gas-meter.js` from the [latest release](https://github.com/wzsolt/ha-card-gas-meter/releases/latest). Copy it to `/config/www/ha-card-gas-meter.js` and register `/local/ha-card-gas-meter.js` as a **JavaScript Module** resource. Reload the dashboard and add the card. After replacing a manually installed file, update the resource URL with a new version query parameter if your browser still serves the old file.

## Configuration

```yaml
type: custom:ha-card-gas-meter
title: Gázmérő
meter_entity: sensor.garden_gas_reader
consumption_entity: sensor.garden_gas_consumption
last_contact_entity: sensor.garden_gas_reader_last_contact
battery_level_entity: sensor.garden_gas_reader_battery_level_estimated
battery_voltage_entity: sensor.garden_gas_reader_battery_voltage
charts:
  hourly: true
  daily: true
  monthly: true
  voltage: true
```

| Option | Purpose |
| --- | --- |
| `title` | Optional title. Defaults to the localized “Gas meter”. |
| `meter_entity` | Physical meter reading. The card shows three decimal places. |
| `consumption_entity` | Separate cumulative gas sensor with statistics support, such as a `total` or `total_increasing` gas sensor. Used by all consumption charts. |
| `last_contact_entity` | Timestamp sensor for the last successful report. |
| `battery_level_entity` | Estimated charge from 0 to 100 percent. The badge shows the value as a percentage and fills its background proportionally. |
| `battery_voltage_entity` | Voltage sensor with the `measurement` state class for mean statistics. |
| `charts.hourly` | Show today's consumption per hour, on a midnight-to-midnight axis. Defaults to `true`. |
| `charts.daily` | Show the last 30 calendar days, including today. Defaults to `true`. |
| `charts.monthly` | Show the last 12 calendar months, including this month. Defaults to `true`. |
| `charts.voltage` | Show daily mean voltage for the last 30 calendar days. Defaults to `true`. |

Use the four buttons on the card to change the current view. Set the defaults in the visual card editor or YAML. Hover or tap to inspect a period. You can also tab into a chart and use the arrow keys, Home and End. Labels are available in English and Hungarian.

### Recorder and timing

Include the consumption and voltage sensors in Home Assistant Recorder. Today's hourly chart uses the cumulative consumption history. The day, month and voltage charts use Recorder statistics, so the latest period can lag the live readings and is marked as in progress. Empty periods appear as gaps. The card uses the time zone configured in Home Assistant and distinguishes repeated hours by their UTC offset.

The cumulative consumption sensor should track usage independently of manual corrections to the physical meter reading. With Gas Reader, consumption is assigned to the time Home Assistant receives the report. A delayed report may therefore show several hours of usage in a single hour. Hours with an available, unchanged counter show zero recorded usage.

## MVM residential gas cost estimates

Enable **Estimated gas cost** in the visual editor to use the Hungarian MVM profile for monthly meter readings with heating and hot water. The estimate uses the existing consumption sensor in m³. The bill's gross discounted rate, heating value and volume correction factor are required. The following values are illustrative. Replace them with the values for your supply point and use the first day for which they apply.

```yaml
cost:
  enabled: true
  effective_from: "2026-08-01"
  discounted_ft_per_mj: 2.86512
  heating_value_mj_per_m3: 34.8
  correction_factor: 1.0
  billing_period_start: "2026-11-04"  # Optional. Update after reporting a reading.
```

| Cost option | Purpose |
| --- | --- |
| `enabled` | The cost section is off unless configured. Set to `false` to retain the settings while hiding it. |
| `effective_from` | First date for which the configured inputs apply. The supported MVM profile starts on 2024-08-01. |
| `discounted_ft_per_mj` | Gross discounted rate from your bill or local distributor's tariff, in Ft/MJ. |
| `market_ft_per_mj` | Gross above-allowance rate. Defaults to 22.002 Ft/MJ. |
| `base_ft_per_year` | Gross annual base fee. Defaults to 11,674 Ft for the standard A1 profile. Set to zero if there is no base fee. |
| `heating_value_mj_per_m3` | Heating value from your bill, in MJ/m³. |
| `correction_factor` | Meter volume correction factor from your bill. |
| `annual_allowance_mj` | Annual discounted energy allowance. Defaults to 63,645 MJ. |
| `monthly_weights` | Optional list of 12 nonnegative weights in January–December order. Defaults to the MVM monthly profile and scales to the configured annual allowance. |
| `billing_period_start` | Optional first calendar day of the current billing period. Set it to the next period's first day after each reading. |

The card converts recorded meter volume into MJ using your heating value and correction factor. It accumulates the MVM seasonal allowance from August 1 through July 31 and distributes each month's quota over its calendar days. Unused allowance carries forward within that year. When newly available allowance covers earlier usage above the cap, the difference is shown as an estimated tier correction. The total can be negative on a day with a correction. The card allocates one twelfth of the annual base fee per calendar month, then spreads that fee evenly across the days of the month.

The three chart views cover 30 days, 12 calendar months, and up to four gas years. The latest day, month, and gas year are in progress. Missing days remain blank, and affected totals are marked as subtotals. After a gap the estimate starts with the next known day's allowance, so the earlier balance is unknown until the next gas year. Recent totals can lag if only Recorder statistics are available for today. The same configured inputs apply to all dates from their effective date. Estimates exclude one-off credits such as the January 2026 MVM credit.

Sources: [MVM tariff tables](https://www.mvmnext.hu/foldgaz/egyetemes-szolgaltatas/ugyintezes/arak-dijszabasok/aktualis-arak), [seasonal allowance](https://www.mvmnext.hu/vallalati-informaciok/hirek-aktualitasok/aktualis/2024/08-01), [tier correction](https://www.mvmnext.hu/lakossagirezsi/gyakorikerdesek-foldgaz), and [January 2026 credit](https://www.mvmnext.hu/rezsistop/reszletes-informaciok).

## Develop and release

```sh
npm ci
npm test
npm run build
npx playwright-core install chromium
npm run test:browser
```

Use `GAS_METER_CHROMIUM` to point the browser tests at an existing Chromium executable. The bundle is built at `dist/ha-card-gas-meter.js`. Pushes and pull requests run the unit tests, build and browser tests.

To release, update the package version and lockfile, add a matching version section to `CHANGELOG.md`, and push the corresponding tag such as `v0.1.0`. GitHub Actions publishes the module as a release asset after the tests pass, verifies the asset and runs HACS validation. The release is the version HACS users can download. The module runs within the user's Home Assistant dashboard and reads data through the existing connection.
