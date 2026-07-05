import "server-only";

export type DiscordAllowedMentions = {
  parse?: ("users" | "roles" | "everyone")[];
};

export type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

export type DiscordEmbed = {
  title?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
};

export type DiscordMessagePayload = {
  content?: string;
  embeds?: DiscordEmbed[];
  allowed_mentions?: DiscordAllowedMentions;
};

/**
 * POST novou zprávu na webhook. `?wait=true` donutí Discord vrátit JSON zprávy
 * (vč. `id`), který potřebujeme pro pozdější editaci (re-publikace raidu/setupu).
 * Nikdy nevyhodí — chyba se jen zaloguje, návratovka je `null`.
 */
export async function postDiscordMessage(
  url: string | null | undefined,
  payload: DiscordMessagePayload,
): Promise<{ id: string } | null> {
  if (!url) return null;
  try {
    const res = await fetch(`${url}?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`Discord webhook selhal (${res.status}): ${await res.text()}`);
      return null;
    }
    const json = (await res.json()) as { id?: string };
    return json.id ? { id: json.id } : null;
  } catch (err) {
    console.error("Discord webhook selhal:", err);
    return null;
  }
}

/**
 * PATCH existující zprávy webhooku — přepíše content/embed na místě (re-publikace
 * oznámení/setupu beze spamování kanálu novou zprávou). Nikdy nevyhodí.
 */
export async function editDiscordMessage(
  url: string | null | undefined,
  messageId: string,
  payload: DiscordMessagePayload,
): Promise<boolean> {
  if (!url) return false;
  try {
    const res = await fetch(`${url}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`Discord webhook edit selhal (${res.status}): ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Discord webhook edit selhal:", err);
    return false;
  }
}

/**
 * Pošle prostou textovou zprávu na Discord webhook. Zachováno kvůli
 * absence-conflict pingu (`absences/actions.ts`) — deleguje na
 * `postDiscordMessage`, návratovku ignoruje, nikdy nevyhodí.
 */
export async function sendDiscordWebhook(
  url: string | null | undefined,
  content: string,
): Promise<void> {
  await postDiscordMessage(url, { content });
}
