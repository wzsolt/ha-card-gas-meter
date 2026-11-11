const en = {
  cost: "Estimated gas cost", costShort: "Cost", costPeriod: "Cost chart period",
  cost_daily: "30 days", cost_monthly: "12 months", cost_yearly: "Gas years",
  costToday: "Today", costMonth: "This month", costYear: "This gas year", costBilling: "Current billing period",
  costDiscount: "Discounted", costMarket: "Above allowance", costBase: "Base fee",
  costCorrection: "Estimated tier correction", costIncomplete: "Subtotal · missing days",
  costUncertainShort: "Earlier allowance unknown", costDelayed: "Recorder data may lag",
  costUncertain: "Earlier consumption is missing. The previous unused allowance is unknown.",
  costHistoryError: "Could not load earlier Recorder data.",
  costEstimate: "MVM residential estimate. A gas year runs August–July. One-off bill credits are excluded.",
  costSettings: "Enter valid tariff details and their start date in the card settings.",
  costFuture: "The configured tariff is not yet effective.",
  costSensor: "The gas consumption sensor is unavailable.",
  costUnit: "The cost estimate requires a gas consumption sensor in m³.",
  enabled: "Show MVM cost estimates", effective_from: "Tariff effective from",
  billing_period_start: "First day of current billing period (optional)",
  discounted_ft_per_mj: "Gross discounted rate (Ft/MJ)", market_ft_per_mj: "Gross above-allowance rate (Ft/MJ)",
  base_ft_per_year: "Gross annual base fee (Ft)", heating_value_mj_per_m3: "Heating value (MJ/m³)",
  correction_factor: "Meter volume correction factor", annual_allowance_mj: "Annual discounted allowance (MJ)",
  monthly_weights: "Monthly allowance weights (January–December)",
  monthlyWeightsHelp: "Leave blank for the MVM profile, or enter 12 comma-separated weights.",
  title: "Gas meter", meter_entity: "Meter reading", consumption_entity: "Gas consumption sensor",
  last_contact_entity: "Last report", battery_level_entity: "Battery (estimated)",
  battery_voltage_entity: "Battery voltage sensor",
  hourly: "Hourly consumption", daily: "Daily consumption", monthly: "Monthly consumption",
  voltage: "Battery voltage", hourlyShort: "Today", dailyShort: "30 days", monthlyShort: "12 months",
  voltageShort: "Voltage", hourlyRange: "Today · 00:00–24:00", dailyRange: "Last 30 calendar days",
  monthlyRange: "Last 12 calendar months", voltageRange: "Daily average · Last 30 days",
  reportNote: "Consumption is assigned to the hour the report arrived.",
  charts: "Charts", loading: "Loading Recorder data…", error: "Could not load Recorder data.",
  empty: "No Recorder data for this period.", configure: "Select a sensor in the card settings.",
  missing: "No data", partial: "in progress", tooltipHelp: "Use the arrow keys to browse values.",
};

const hu = {
  cost: "Becsült gázköltség", costShort: "Költség", costPeriod: "Költséggrafikon időszaka",
  cost_daily: "30 nap", cost_monthly: "12 hónap", cost_yearly: "Kedvezményes évek",
  costToday: "Ma", costMonth: "Ebben a hónapban", costYear: "Ebben a kedvezményes évben",
  costBilling: "Aktuális diktálási időszak",
  costDiscount: "Kedvezményes díj", costMarket: "Kereten túli díj", costBase: "Alapdíj",
  costCorrection: "Becsült sávkorrekció", costIncomplete: "Részösszeg · hiányzó napok",
  costUncertainShort: "Korábbi keret ismeretlen", costDelayed: "A Recorder adatai késhetnek",
  costUncertain: "Korábbi fogyasztási adatok hiányoznak, így az akkori keretmaradvány ismeretlen.",
  costHistoryError: "A korábbi Recorder-adatok nem tölthetők be.",
  costEstimate: "MVM lakossági becslés. A kedvezményes év augusztustól júliusig tart. Az egyedi számlajóváírások nem szerepelnek benne.",
  costSettings: "Add meg az érvényes tarifát és annak kezdőnapját a kártya beállításaiban.",
  costFuture: "A beállított tarifa még nem érvényes.",
  costSensor: "A gázfogyasztás-szenzor nem érhető el.",
  costUnit: "A költségbecsléshez m³-ben mérő gázfogyasztás-szenzor szükséges.",
  enabled: "MVM költségbecslés megjelenítése", effective_from: "A tarifa érvényességének kezdete",
  billing_period_start: "Aktuális diktálási időszak első napja (opcionális)",
  discounted_ft_per_mj: "Bruttó kedvezményes ár (Ft/MJ)", market_ft_per_mj: "Bruttó kereten túli ár (Ft/MJ)",
  base_ft_per_year: "Bruttó éves alapdíj (Ft)", heating_value_mj_per_m3: "Fűtőérték (MJ/m³)",
  correction_factor: "Korrekciós tényező", annual_allowance_mj: "Éves kedvezményes keret (MJ)",
  monthly_weights: "Havi keretsúlyok (januártól decemberig)",
  monthlyWeightsHelp: "Üresen az MVM jelleggörbéjét használja, vagy adj meg 12 vesszővel elválasztott súlyt.",
  title: "Gázmérő", meter_entity: "Óraállás", consumption_entity: "Gázfogyasztás-szenzor",
  last_contact_entity: "Utolsó beküldés", battery_level_entity: "Akku (becsült)",
  battery_voltage_entity: "Akkufeszültség-szenzor",
  hourly: "Óránkénti gázfogyasztás", daily: "Napi gázfogyasztás", monthly: "Havi gázfogyasztás",
  voltage: "Akkufeszültség", hourlyShort: "Ma", dailyShort: "30 nap", monthlyShort: "12 hónap",
  voltageShort: "Feszültség", hourlyRange: "Ma · 00:00–24:00", dailyRange: "Utolsó 30 naptári nap",
  monthlyRange: "Utolsó 12 naptári hónap", voltageRange: "Napi átlag · Utolsó 30 nap",
  reportNote: "A fogyasztás ahhoz az órához kerül, amikor az adat beérkezett.",
  charts: "Grafikonok", loading: "Recorder-adatok betöltése…",
  error: "A Recorder-adatok nem tölthetők be.", empty: "Erre az időszakra nincs Recorder-adat.",
  configure: "Válassz szenzort a kártya beállításaiban.", missing: "Nincs adat",
  partial: "folyamatban", tooltipHelp: "A nyílbillentyűkkel lépkedhetsz az értékek között.",
};

export function localeFor(hass) {
  return hass.locale?.language || hass.language || "en";
}

export function labels(hass) {
  return /^hu\b/i.test(localeFor(hass)) ? hu : en;
}

export function theme(element, hass) {
  element.dataset.themeMode = hass.themes?.darkMode ? "dark" : "light";
}
