/** Locale / timezone / currency choices — shared by the form and validation. */

export const LOCALES = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
] as const;

export const CURRENCIES = [
  { value: "MAD", label: "Dirham marocain (DH)" },
  { value: "EUR", label: "Euro (€)" },
  { value: "USD", label: "Dollar US ($)" },
] as const;

export const TIMEZONES = [
  { value: "Africa/Casablanca", label: "Casablanca (GMT+1)" },
  { value: "Europe/Paris", label: "Paris (GMT+1/+2)" },
  { value: "Africa/Cairo", label: "Le Caire (GMT+2)" },
  { value: "UTC", label: "UTC" },
] as const;

export const LOCALE_VALUES = LOCALES.map((o) => o.value) as readonly string[];
export const CURRENCY_VALUES = CURRENCIES.map((o) => o.value) as readonly string[];
export const TIMEZONE_VALUES = TIMEZONES.map((o) => o.value) as readonly string[];
