import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, aiSettingsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/ai-settings", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(aiSettingsTable).where(eq(aiSettingsTable.id, 1)).limit(1);

  if (rows.length === 0) {
    res.json({
      id: 1,
      provider: "huggingface",
      modelId: "facebook/detr-resnet-50",
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  const s = rows[0];
  res.json({ id: s.id, provider: s.provider, modelId: s.modelId, updatedAt: s.updatedAt.toISOString() });
});

router.put("/ai-settings", requireAuth, async (req, res): Promise<void> => {
  const { provider, modelId } = req.body as { provider?: string; modelId?: string };

  if (typeof provider !== "string" || provider.trim() === "") {
    res.status(400).json({ error: "Provider is required" });
    return;
  }
  if (typeof modelId !== "string" || modelId.trim() === "") {
    res.status(400).json({ error: "Model ID is required" });
    return;
  }

  const existing = await db.select().from(aiSettingsTable).where(eq(aiSettingsTable.id, 1)).limit(1);

  let updated;
  if (existing.length === 0) {
    [updated] = await db.insert(aiSettingsTable)
      .values({ id: 1, provider: provider.trim(), modelId: modelId.trim() })
      .returning();
  } else {
    [updated] = await db.update(aiSettingsTable)
      .set({ provider: provider.trim(), modelId: modelId.trim(), updatedAt: new Date() })
      .where(eq(aiSettingsTable.id, 1))
      .returning();
  }

  res.json({
    id: updated.id,
    provider: updated.provider,
    modelId: updated.modelId,
    updatedAt: updated.updatedAt.toISOString(),
  });
});

export default router;
