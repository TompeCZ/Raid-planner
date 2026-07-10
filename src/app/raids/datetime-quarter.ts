/**
 * Rozklad/skládání hodnoty `datetime-local` ("YYYY-MM-DDTHH:mm") pro UI se
 * samostatnými select-y na hodinu a minutu. Nativní `step` na `datetime-local`
 * omezí jen krok šipek nahoru/dolů v prohlížeči, ne ruční zápis do segmentu —
 * proto číselník minut řešíme vlastním <select> (viz `datetime-quarter-input.tsx`).
 */
export const MINUTE_OPTIONS = ["00", "15", "30", "45"] as const;
export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));

const DEFAULT_HOUR = "20";
const DEFAULT_MINUTE = "00";

export type DateTimeQuarterParts = { date: string; hour: string; minute: string };

/**
 * Rozloží na části pro select-y. Chybějící hodinu/minutu (nová hodnota) dostane
 * rozumný default — existující hodnotu MIMO čtvrthodinu (starší data uložená
 * před zavedením číselníku) záměrně NEsnapuje na nejbližší krok, jinak by
 * pouhé otevření a uložení edit formuláře tiše přepsalo minutu, které se hráč
 * ani nedotkl (viz `datetime-quarter-input.tsx`, kde se taková hodnota přidá
 * do nabídky navíc, dokud ji RL sám nezmění).
 */
export function splitDateTimeQuarter(value: string): DateTimeQuarterParts {
  const [date, time] = value.split("T");
  const [hour, minute] = (time ?? "").split(":");
  return {
    date: date ?? "",
    hour: hour || DEFAULT_HOUR,
    minute: minute || DEFAULT_MINUTE,
  };
}

/** Poskládá zpátky do "YYYY-MM-DDTHH:mm". Bez data je celek prázdný (formulář ještě nevyplněný). */
export function joinDateTimeQuarter(date: string, hour: string, minute: string): string {
  return date ? `${date}T${hour}:${minute}` : "";
}
