import { eq, and, asc } from "drizzle-orm";
import { db, visitsTable, uploadBatchesTable } from "@workspace/db";
import { sendGroupMessage } from "./whatsapp";
import { logger } from "./logger";

const CHECK_INTERVAL_MS = 60 * 1000;

async function checkAndSendAdminReminder(): Promise<void> {
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
    logger.info({ visitTime: visit.visitTime, name: visit.name }, "Sending 30-min admin reminder to WhatsApp group");

    const fullAddress = `${visit.streetAddress}, ${visit.city} ${visit.postalCode}`;
    const message =
      `🔔 OmSaiRam! Reminder: Sai Palki starts in 30 minutes.\n\n` +
      `First stop: ${fullAddress}\n` +
      `Time: ${visit.visitTime}\n\n` +
      `Please prepare the route. Jai Sairam!`;

    const result = await sendGroupMessage(message);

    await db
      .update(uploadBatchesTable)
      .set({ adminReminderSent: true })
      .where(eq(uploadBatchesTable.id, batch.id));

    if (result.success) {
      logger.info("Admin WhatsApp group reminder sent successfully");
    } else {
      logger.warn({ error: result.error }, "Admin WhatsApp group reminder failed to send");
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
