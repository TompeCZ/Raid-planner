import "server-only";
import { db } from "@/db/client";
import { auditLog } from "@/db/schema";

/**
 * Zapíše smysluplnou akci do audit_log — ne každý klik, jen věci jako
 * přiřazení/odebrání/bench postavy, přechod stavu raidu, vznik konfliktu.
 */
export async function logAudit(entry: {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  description: string;
}): Promise<void> {
  await db.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    description: entry.description,
  });
}
