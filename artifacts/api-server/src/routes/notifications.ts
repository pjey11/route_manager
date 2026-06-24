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

  const dateObj = new Date(`${date}T12:00:00`);
  const monthDay = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const formatTime = (t: string) => {
    const [hh, mm] = t.split(":");
    const h = parseInt(hh, 10);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${mm} ${period}`;
  };

  const stopLines = visits.map((v) => {
    const lines = [
      `Time: ${formatTime(v.visitTime)}`,
      v.streetAddress,
      `${v.city} ${v.postalCode}`,
    ];
    if (v.prasadOffering) lines.push(`Prasad: ${v.prasadOffering}`);
    return lines.join("\n");
  }).join("\n\n");

  const message =
    `OmSaiRam! Palki begins today, ${monthDay}. Baba will be visiting the following homes:\n\n` +
    stopLines;

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
