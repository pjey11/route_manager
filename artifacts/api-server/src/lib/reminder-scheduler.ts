import { eq, and, asc } from "drizzle-orm";
import { db, visitsTable, uploadBatchesTable, profileTable } from "@workspace/db";
import { sendWhatsApp } from "./whatsapp";
import { logger } from "./logger";

const CHECK_INTERVAL_MS = 60 * 1000;

async function getAdminPhone(): Promise<string | null> {
  const rows = await db.select().from(profileTable).where(eq(profileTable.id, 1)).limit(1);
  const phone = rows[0]?.phone?.trim();
  return phone || null;
}

async function checkAndSendAdminReminder(): Promise<void> {
  const adminPhone = await getAdminPhone();
  if (!adminPhone) return;

  const today = new Date().toISOString().split("T")[0];
  const now = new Date();

  const batches = await db
    .select()
    .from(uploadBatchesTable)
    .where(
      and(
        eq(uploadBatchesTable.date, today),
        eq(uploadBatchesTable.adminReminderSent, false),
        eq(uploadBatchesTable.isDayComplete, false),
      )
    )
    .limit(1);

  if (batches.length === 0) return;
  const batch = batches[0];

  const firstVisit = await db
    .select()
    .from(visitsTable)
    .where(
      and(
        eq(visitsTable.date, today),
        eq(visitsTable.status, "pending"),
      )
    )
    .orderBy(asc(visitsTable.stopNumber))
    .limit(1);

  if (firstVisit.length === 0) return;
  const visit = firstVisit[0];

  const timeParts = visit.visitTime.split(":");
  if (timeParts.length < 2) return;

  const hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return;

  const visitDate = new Date();
  visitDate.setHours(hours, minutes, 0, 0);

  const diffMs = visitDate.getTime() - now.getTime();
  const diffMinutes = diffMs / 60000;

  if (diffMinutes >= 28 && diffMinutes <= 32) {
    logger.info({ visitTime: visit.visitTime, name: visit.name }, "Sending 30-min admin reminder via WhatsApp");

    const message =
      `OmSaiRam! Reminder: The first Sai Palki visit of the day is in 30 minutes.\n\n` +
      `First stop: ${visit.name}\n` +
      `Time: ${visit.visitTime}\n` +
      `Address: ${visit.address}\n\n` +
      `Please prepare and notify the devotee. Jai Sairam!`;

    const result = await sendWhatsApp(adminPhone, message);

    await db
      .update(uploadBatchesTable)
      .set({ adminReminderSent: true })
      .where(eq(uploadBatchesTable.id, batch.id));

    if (result.success) {
      logger.info("Admin WhatsApp reminder sent successfully");
    } else {
      logger.warn({ error: result.error }, "Admin WhatsApp reminder failed to send");
    }
  }
}

export function startReminderScheduler(): void {
  logger.info("Admin reminder scheduler started");
  setInterval(() => {
    checkAndSendAdminReminder().catch((err) => {
      logger.error({ err }, "Error in reminder scheduler");
    });
  }, CHECK_INTERVAL_MS);

  checkAndSendAdminReminder().catch((err) => {
    logger.error({ err }, "Error in initial reminder check");
  });
}
