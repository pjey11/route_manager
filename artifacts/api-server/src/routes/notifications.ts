import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, visitsTable } from "@workspace/db";
import { SendBulkNotificationBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin";
import { sendGroupMessage } from "../lib/whatsapp";

const router: IRouter = Router();

router.post("/notifications/bulk", requireAdmin, async (req, res): Promise<void> => {
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

  const stopLines = visits
    .map((v) => `  ${v.stopNumber}. ${v.visitTime} — ${v.streetAddress}, ${v.city}`)
    .join("\n");

  const message =
    `🙏 OmSaiRam! Today's Sai Palki route (${date}):\n\n` +
    `${stopLines}\n\n` +
    `Please keep your home ready at the appointed time. Jai Sairam!`;

  const result = await sendGroupMessage(message);

  res.json({
    success: result.success,
    sent: result.success ? 1 : 0,
    failed: result.success ? 0 : 1,
    total: 1,
    message: result.success
      ? `Route notification sent to the WhatsApp group for ${visits.length} stops.`
      : `Failed to send group notification: ${result.error}`,
  });
});

export default router;
