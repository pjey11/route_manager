import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, profileTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();

router.get("/profile", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(profileTable).where(eq(profileTable.id, 1)).limit(1);

  if (rows.length === 0) {
    res.json({ id: 1, name: "", phone: "", updatedAt: new Date().toISOString() });
    return;
  }

  const p = rows[0];
  res.json({ id: p.id, name: p.name, phone: p.phone, updatedAt: p.updatedAt.toISOString() });
});

router.put("/profile", requireAdmin, async (req, res): Promise<void> => {
  const { name, phone } = req.body as { name?: string; phone?: string };

  if (typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  if (typeof phone !== "string" || phone.trim() === "") {
    res.status(400).json({ error: "Phone number is required" });
    return;
  }

  const existing = await db.select().from(profileTable).where(eq(profileTable.id, 1)).limit(1);

  let updated;
  if (existing.length === 0) {
    [updated] = await db
      .insert(profileTable)
      .values({ id: 1, name: name.trim(), phone: phone.trim() })
      .returning();
  } else {
    [updated] = await db
      .update(profileTable)
      .set({ name: name.trim(), phone: phone.trim(), updatedAt: new Date() })
      .where(eq(profileTable.id, 1))
      .returning();
  }

  res.json({ id: updated.id, name: updated.name, phone: updated.phone, updatedAt: updated.updatedAt.toISOString() });
});

export default router;
