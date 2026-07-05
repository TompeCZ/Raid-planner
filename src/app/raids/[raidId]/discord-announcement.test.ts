import { describe, expect, it } from "vitest";
import { buildAnnouncementContent } from "./discord-announcement";

describe("buildAnnouncementContent", () => {
  it("obsahuje @here, instanci, počet přihlášených a odkaz na raid", () => {
    const content = buildAnnouncementContent({
      instance: "Karazhan",
      dateLabel: "út 8.7. 20:00",
      signupCount: 12,
      raidUrl: "https://example.com/raids/abc-123",
    });

    expect(content).toContain("@here");
    expect(content).toContain("Karazhan");
    expect(content).toContain("12");
    expect(content).toContain("https://example.com/raids/abc-123");
  });
});
