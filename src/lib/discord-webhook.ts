import "server-only";

/** Pošle zprávu na Discord webhook. Nikdy nevyhodí — chybějící/neplatný webhook jen zaloguje. */
export async function sendDiscordWebhook(
  url: string | null | undefined,
  content: string,
): Promise<void> {
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      console.error(`Discord webhook selhal (${res.status}): ${await res.text()}`);
    }
  } catch (err) {
    console.error("Discord webhook selhal:", err);
  }
}
