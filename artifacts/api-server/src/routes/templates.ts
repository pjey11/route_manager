import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, notificationTemplatesTable } from "@workspace/db";
import { UpdateTemplateParams, UpdateTemplateBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const DEFAULT_TEMPLATES = [
  {
    id: 1,
    name: "Arrival Notice",
    description: "Sent when 'Sai Palki starts' — group notification that Palki is on the way",
    content: "🙏 OmSaiRam! Sai Palki is on the way to {name}'s home at {address}. Jai Sairam!",
  },
  {
    id: 2,
    name: "2 Minutes Away",
    description: "Sent via geofencing — group notification that Palki is almost there",
    content: "🙏 OmSaiRam! Sai Palki is 2-3 minutes away from {name}'s home at {address}. Please be ready to receive the Palki!",
  },
  {
    id: 3,
    name: "Thank You",
    description: "Sent after visit completion — group notification that Bikhsa was received",
    content: "✅ OmSaiRam! Bikhsa has been received at {name}'s home ({prasad}). Sai Palki continues its blessed journey. Jai Sairam!",
  },
  {
    id: 4,
    name: "Bulk Schedule",
    description: "Sent as day-start announcement — group summary of today's route (built automatically from visit data)",
    content: "🙏 OmSaiRam! Today's Sai Palki route schedule will be shared shortly. Please be ready at your appointed time. Jai Sairam!",
  },
];

async function ensureTemplatesExist() {
  for (const tmpl of DEFAULT_TEMPLATES) {
    await db
      .insert(notificationTemplatesTable)
      .values({ id: tmpl.id, name: tmpl.name, description: tmpl.description, content: tmpl.content })
      .onConflictDoUpdate({
        target: notificationTemplatesTable.id,
        set: { name: tmpl.name, description: tmpl.description, content: tmpl.content },
      });
  }
}

router.get("/templates", requireAuth, async (req, res): Promise<void> => {
  await ensureTemplatesExist();

  const templates = await db
    .select()
    .from(notificationTemplatesTable)
    .orderBy(notificationTemplatesTable.id);

  res.json({
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      content: t.content,
      updatedAt: t.updatedAt?.toISOString(),
    })),
  });
});

router.put("/templates/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid template ID" });
    return;
  }

  const body = UpdateTemplateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  await ensureTemplatesExist();

  const [updated] = await db
    .update(notificationTemplatesTable)
    .set({ content: body.data.content, updatedAt: new Date() })
    .where(eq(notificationTemplatesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  res.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    content: updated.content,
    updatedAt: updated.updatedAt?.toISOString(),
  });
});

export default router;
