import { signupMode as signupModeEnum } from "@/db/schema";

const SIGNUP_MODES = signupModeEnum.enumValues;

/** Mapuje hlášku z readRaidForm na jméno pole — pro zvýraznění konkrétního inputu ve formuláři. */
const FIELD_BY_ERROR: Record<string, string> = {
  "Instance je povinná.": "instance",
  "Neplatné začátek.": "startsAt",
  "Neplatné konec.": "endsAt",
  "Konec musí být po začátku.": "endsAt",
  "Neplatný signup mode.": "signupMode",
  "Kapacita musí být kladné celé číslo.": "capacity",
};

export function fieldForRaidFormError(message: string): string | null {
  return FIELD_BY_ERROR[message] ?? null;
}

/** `datetime-local` input nemá timezone — parsuje se jako lokální čas serveru. */
function parseDateTimeLocal(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Neplatné ${label}.`);
  return date;
}

/** Sdílené čtení + validace formuláře raidu — používá create i update. */
export function readRaidForm(formData: FormData) {
  const instance = String(formData.get("instance") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const endsAtRaw = String(formData.get("endsAt") ?? "");
  const signupModeValue = String(formData.get("signupMode") ?? "");
  const capacityRaw = String(formData.get("capacity") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!instance) throw new Error("Instance je povinná.");
  const startsAt = parseDateTimeLocal(startsAtRaw, "začátek");
  const endsAt = parseDateTimeLocal(endsAtRaw, "konec");
  // Respektuje DB check raid_time_order.
  if (endsAt <= startsAt) throw new Error("Konec musí být po začátku.");
  if (!SIGNUP_MODES.includes(signupModeValue as (typeof SIGNUP_MODES)[number])) {
    throw new Error("Neplatný signup mode.");
  }
  const capacity = Number(capacityRaw);
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error("Kapacita musí být kladné celé číslo.");
  }

  return {
    instance,
    startsAt,
    endsAt,
    signupMode: signupModeValue as (typeof SIGNUP_MODES)[number],
    capacity,
    notes: notes || null,
  };
}
