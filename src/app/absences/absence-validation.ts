/** Sdílené čtení + validace formuláře absence — používá create i update. */
export function readAbsenceForm(formData: FormData) {
  const fromDate = String(formData.get("fromDate") ?? "");
  const toDate = String(formData.get("toDate") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!fromDate) throw new Error("Od kdy je povinné.");
  if (!toDate) throw new Error("Do kdy je povinné.");
  // Řetězcové porovnání funguje díky ISO formátu (YYYY-MM-DD) z <input type="date">.
  // Respektuje DB check absence_date_order.
  if (toDate < fromDate) throw new Error("Konec musí být stejný den nebo po začátku.");

  return { fromDate, toDate, note: note || null };
}

/** Mapuje hlášku z readAbsenceForm na jméno pole — pro zvýraznění konkrétního inputu ve formuláři. */
const FIELD_BY_ERROR: Record<string, string> = {
  "Od kdy je povinné.": "fromDate",
  "Do kdy je povinné.": "toDate",
  "Konec musí být stejný den nebo po začátku.": "toDate",
};

export function fieldForAbsenceFormError(message: string): string | null {
  return FIELD_BY_ERROR[message] ?? null;
}
