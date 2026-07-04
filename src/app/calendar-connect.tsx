"use client";

import { useState, useTransition } from "react";
import { generateCalendarToken } from "./actions";

export function CalendarConnect({
  initialToken,
  siteUrl,
}: {
  initialToken: string | null;
  siteUrl: string;
}) {
  const [token, setToken] = useState(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    if (token && !confirm("Vygenerovat novou URL? Stará přestane fungovat.")) return;
    setError(null);
    startTransition(async () => {
      try {
        const newToken = await generateCalendarToken();
        setToken(newToken);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  const url = token ? `${siteUrl}/api/calendar/${token}` : null;

  return (
    <section style={{ marginTop: "1.5rem" }}>
      <h2>Připojit kalendář</h2>
      {url ? (
        <>
          <p style={{ fontSize: "0.9rem" }}>Odběrová URL (obsahuje jen tvoje raidy, drž ji v tajnosti):</p>
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            style={{ width: "100%", maxWidth: 480 }}
          />
          <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", opacity: 0.8 }}>
            <p>
              <strong>Google Calendar:</strong> Přidat kalendář → Z adresy URL → vlož URL výše.
            </p>
            <p>
              <strong>Apple Calendar:</strong> Soubor → Nový odběr kalendáře (Odebírat kalendář) → vlož URL výše.
            </p>
          </div>
        </>
      ) : (
        <p style={{ fontSize: "0.9rem", opacity: 0.7 }}>
          Zatím nemáš odběrovou URL — vygeneruj si ji a přidej si své raidy do Google/Apple kalendáře.
        </p>
      )}
      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
      <button type="button" onClick={handleGenerate} disabled={isPending}>
        {token ? "Vygenerovat znovu" : "Vygenerovat"}
      </button>
    </section>
  );
}
