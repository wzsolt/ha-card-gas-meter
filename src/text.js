const en = {
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
