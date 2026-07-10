"use client";

import type { CSSProperties } from "react";
import { HOUR_OPTIONS, MINUTE_OPTIONS, joinDateTimeQuarter, splitDateTimeQuarter } from "./datetime-quarter";

type Props = {
  name: string;
  value: string; // "YYYY-MM-DDTHH:mm", případně ""
  onChange: (value: string) => void;
  required?: boolean;
  style?: CSSProperties;
};

/**
 * Datum + hodina/minuta jako <select>, minuty jen 00/15/30/45 — viz
 * `datetime-quarter.ts` proč nejde spolehnout na `step` na `datetime-local`.
 * Skládá se do stejného "YYYY-MM-DDTHH:mm" tvaru, který čte
 * `raid-validation.ts#parseDateTimeLocal`, přes skrytý input se skutečným `name`.
 */
export function DateTimeQuarterInput({ name, value, onChange, required, style }: Props) {
  const { date, hour, minute } = splitDateTimeQuarter(value);
  // Existující hodnota mimo čtvrthodinu (starší data) se nabídne navíc, ať se
  // needitovaná neschová a needitovaná i nezmění tichým uložením na "00".
  const minuteChoices: readonly string[] = (MINUTE_OPTIONS as readonly string[]).includes(minute)
    ? MINUTE_OPTIONS
    : [minute, ...MINUTE_OPTIONS];

  function compose(nextDate: string, nextHour: string, nextMinute: string) {
    onChange(joinDateTimeQuarter(nextDate, nextHour, nextMinute));
  }

  return (
    <span style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", ...style }}>
      <input type="date" value={date} onChange={(e) => compose(e.target.value, hour, minute)} required={required} />
      <select value={hour} onChange={(e) => compose(date, e.target.value, minute)} required={required}>
        {HOUR_OPTIONS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      :
      <select value={minute} onChange={(e) => compose(date, hour, e.target.value)} required={required}>
        {minuteChoices.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <input type="hidden" name={name} value={value} />
    </span>
  );
}
