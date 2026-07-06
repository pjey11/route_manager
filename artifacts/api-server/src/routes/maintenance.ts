import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, visitsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();

// TEMPORARY one-time data fix route — remove after use.
// Updates the "8 Aries St" visit on 2026-07-10 to "42 Brentcliff Dr" / L7A 2N1.
router.post("/api/maintenance/fix-visit-158", requireAdmin, async (req, res) => {
  const updated = await db
    .update(visitsTable)
    .set({ streetAddress: "42 Brentcliff Dr", postalCode: "L7A 2N1" })
    .where(and(eq(visitsTable.streetAddress, "8 Aries St"), eq(visitsTable.date, "2026-07-10")))
    .returning();

  res.json({ updated });
});

export default router;
