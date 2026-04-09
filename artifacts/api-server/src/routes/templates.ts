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
    description: "Sent when 'Sai Palki starts' — informs the contact we are on our way",
    content: "OmSaiRam, dear {name}. We are on our way to your home and will arrive shortly. Please be ready to receive Sai Palki's blessings.",
  },
  {
    id: 2,
    name: "2 Minutes Away",
    description: "Sent via geofencing — informs the contact we are very close",
    content: "OmSaiRam, dear {name}. We are 2-3 minutes away from your home. Palki is arriving very soon!",
  },
  {
    id: 3,
    name: "Thank You",
    description: "Sent after visit completion — thanks the contact for Biksha",
    content: "OmSaiRam, dear {name}. We have received Biksha at your home. Thank you for your devotion and blessing. May Sai shower his grace upon you and your family.",
  },
  {
    id: 4,
    name: "Bulk Instructions",
    description: "Sent to all contacts for a day — standard instructions",
    content: "OmSaiRam! Please be informed that Sai Palki will be visiting your home today as scheduled. Please ensure you are available at the appointed time and that the area is clean and prepared for the blessed visit. Thank you for your devotion. Jai Sairam!",
  },
];

async function ensureTemplatesExist() {
  for (const tmpl of DEFAULT_TEMPLATES) {
    const existing = await db.select().from(notificationTemplatesTable).where(eq(notificationTemplatesTable.id, tmpl.id));
    if (existing.length === 0) {
      await db.insert(notificationTemplatesTable).values({
        id: tmpl.id,
        name: tmpl.name,
        description: tmpl.description,
        content: tmpl.content,
      });
    }
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
