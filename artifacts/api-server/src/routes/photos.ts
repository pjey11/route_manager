import { Router, type IRouter } from "express";
import { eq, and, count } from "drizzle-orm";
import { db, visitPhotosTable, aiSettingsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/requireAdmin";
import { requireAuth } from "../middlewares/requireAuth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_PHOTOS = 3;

router.get("/visits/:id/photos", requireAuth, async (req, res): Promise<void> => {
  const visitId = parseInt(String(req.params["id"] ?? "0"));
  if (!visitId) { res.status(400).json({ error: "Invalid visit id" }); return; }

  const photos = await db.select().from(visitPhotosTable)
    .where(eq(visitPhotosTable.visitId, visitId))
    .orderBy(visitPhotosTable.createdAt);

  res.json({
    photos: photos.map(p => ({
      id: p.id,
      visitId: p.visitId,
      objectPath: p.objectPath,
      headCount: p.headCount ?? null,
      aiModel: p.aiModel ?? null,
      createdAt: p.createdAt.toISOString(),
    }))
  });
});

router.post("/visits/:id/photos", requireAuth, async (req, res): Promise<void> => {
  const visitId = parseInt(String(req.params["id"] ?? "0"));
  if (!visitId) { res.status(400).json({ error: "Invalid visit id" }); return; }

  const { objectPath } = req.body as { objectPath?: string };
  if (!objectPath || typeof objectPath !== "string") {
    res.status(400).json({ error: "objectPath is required" });
    return;
  }

  const [{ value: existingCount }] = await db
    .select({ value: count() })
    .from(visitPhotosTable)
    .where(eq(visitPhotosTable.visitId, visitId));

  if (existingCount >= MAX_PHOTOS) {
    res.status(400).json({ error: `Maximum ${MAX_PHOTOS} photos allowed per visit` });
    return;
  }

  const [photo] = await db.insert(visitPhotosTable)
    .values({ visitId, objectPath })
    .returning();

  res.json({
    id: photo.id,
    visitId: photo.visitId,
    objectPath: photo.objectPath,
    headCount: photo.headCount ?? null,
    aiModel: photo.aiModel ?? null,
    createdAt: photo.createdAt.toISOString(),
  });
});

router.delete("/visits/:id/photos/:photoId", requireAuth, async (req, res): Promise<void> => {
  const visitId = parseInt(String(req.params["id"] ?? "0"));
  const photoId = parseInt(String(req.params["photoId"] ?? "0"));
  if (!visitId || !photoId) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(visitPhotosTable)
    .where(and(eq(visitPhotosTable.id, photoId), eq(visitPhotosTable.visitId, visitId)));

  res.json({ success: true, message: "Photo deleted" });
});

router.post("/visits/:id/photos/:photoId/analyze", requireAdmin, async (req, res): Promise<void> => {
  const visitId = parseInt(String(req.params["id"] ?? "0"));
  const photoId = parseInt(String(req.params["photoId"] ?? "0"));
  if (!visitId || !photoId) { res.status(400).json({ error: "Invalid id" }); return; }

  const photos = await db.select().from(visitPhotosTable)
    .where(and(eq(visitPhotosTable.id, photoId), eq(visitPhotosTable.visitId, visitId)))
    .limit(1);

  if (photos.length === 0) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }

  const photo = photos[0];

  const aiSettingsRows = await db.select().from(aiSettingsTable)
    .where(eq(aiSettingsTable.id, 1)).limit(1);

  const aiSettings = aiSettingsRows.length > 0
    ? aiSettingsRows[0]
    : { provider: "huggingface", modelId: "facebook/detr-resnet-50" };

  const apiKey = process.env["HUGGINGFACE_API_KEY"];
  if (!apiKey) {
    res.status(400).json({ error: "HUGGINGFACE_API_KEY is not configured. Add it in AI Settings." });
    return;
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(photo.objectPath);
    const [imageData] = await objectFile.download();

    let headCount = 0;
    let modelUsed = aiSettings.modelId;

    if (aiSettings.provider === "huggingface") {
      const hfResponse = await fetch(
        `https://api-inference.huggingface.co/models/${aiSettings.modelId}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/octet-stream",
          },
          body: imageData,
        }
      );

      if (!hfResponse.ok) {
        const errorText = await hfResponse.text();
        req.log.error({ status: hfResponse.status, body: errorText }, "HuggingFace API error");
        res.status(502).json({ error: `AI model error: ${hfResponse.status}. ${errorText.slice(0, 200)}` });
        return;
      }

      const detections = await hfResponse.json() as Array<{ label: string; score: number }>;

      if (Array.isArray(detections)) {
        headCount = detections.filter(
          d => d.label?.toLowerCase() === "person" && (d.score ?? 0) >= 0.5
        ).length;
      }
    }

    const [updated] = await db.update(visitPhotosTable)
      .set({ headCount, aiModel: modelUsed })
      .where(eq(visitPhotosTable.id, photoId))
      .returning();

    res.json({
      headCount,
      aiModel: modelUsed,
      photo: {
        id: updated.id,
        visitId: updated.visitId,
        objectPath: updated.objectPath,
        headCount: updated.headCount ?? null,
        aiModel: updated.aiModel ?? null,
        createdAt: updated.createdAt.toISOString(),
      }
    });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Photo file not found in storage" });
      return;
    }
    req.log.error({ err: error }, "Error analyzing photo");
    res.status(500).json({ error: "Failed to analyze photo" });
  }
});

export default router;
