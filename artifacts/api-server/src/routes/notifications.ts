import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, visitsTable, notificationTemplatesTable } from "@workspace/db";
import { SendBulkNotificationBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { sendWhatsApp } from "../lib/whatsapp";

const router: IRouter = Router();

router.post("/notifications/bulk", requireAuth, async (req, res): Promise<void> => {
  const parsed = SendBulkNotificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body. Please provide a valid date." });
    return;
  }

  const { date } = parsed.data;

  const visits = await db
    .select()
    .from(visitsTable)
    .where(eq(visitsTable.date, date))
    .orderBy(asc(visitsTable.stopNumber));

  if (visits.length === 0) {
    res.status(400).json({ error: `No visits found for ${date}. Please upload a schedule first.` });
    return;
  }

  const [template] = await db
    .select()
    .from(notificationTemplatesTable)
    .where(eq(notificationTemplatesTable.id, 4));

  const message = template?.content || "OmSaiRam! Sai Palki will visit your home today as scheduled. Please be ready at the appointed time.";

  let sent = 0;
  let failed = 0;

  for (const visit of visits) {
    const result = await sendWhatsApp(visit.phone, message);
    if (result.success) {
      sent++;
    } else {
      failed++;
    }
  }

  res.json({
    success: failed === 0,
    sent,
    failed,
    total: visits.length,
    message: `Sent ${sent} of ${visits.length} messages${failed > 0 ? ` (${failed} failed)` : ""}.`,
  });
});

export default router;
