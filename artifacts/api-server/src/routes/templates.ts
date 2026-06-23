import { Router, type IRouter } from "express";
import { eq, notInArray } from "drizzle-orm";
import { db, notificationTemplatesTable } from "@workspace/db";
import { UpdateTemplateParams, UpdateTemplateBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();

const DEFAULT_TEMPLATES = [
  {
    id: 1,
    name: "Arrival Notice",
    description: "Sent when Palki starts for the day — announces first home's address to the group",
    content: "OmSaiRam! Palki is starting for the day. Baba will arrive at {address} soon for Biksha. Jai Sairam!",
  },
  {
    id: 3,
    name: "Thank You & Next Home",
    description: "Sent after each visit — announces Biksha received and next stop address to the group",
    content: "OmSaiRam! Palki arrived at {address}. The next home is {address_next}. Jai Sairam!",
  },
  {
    id: 4,
    name: "Finishing for the Day",
    description: "Sent after the last visit or when day is ended — closes out the route for the group",
    content: "OmSaiRam! Palki for the day is completed. Sai Palki will continue its blessed journey tomorrow. Jai Sairam!",
  },
  {
    id: 5,
    name: "Last Home for the Day",
    description: "Sent when Palki arrives at the final home — announces last Bhoj address to the group",
    content: "Om Sai Ram! The Palki has arrived at the last home of the day. Baba will have the Bhoj at {address}",
  },
];

const ALLOWED_TEMPLATE_IDS = DEFAULT_TEMPLATES.map((t) => t.id);

async function ensureTemplatesExist() {
  await db
    .delete(notificationTemplatesTable)
    .where(notInArray(notificationTemplatesTable.id, ALLOWED_TEMPLATE_IDS));

  for (const tmpl of DEFAULT_TEMPLATES) {
    const existing = await db
      .select({ id: notificationTemplatesTable.id })
      .from(notificationTemplatesTable)
      .where(eq(notificationTemplatesTable.id, tmpl.id));
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

router.get("/templates", requireAdmin, async (req, res): Promise<void> => {
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

router.put("/templates/:id", requireAdmin, async (req, res): Promise<void> => {
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
    .set({
      content: body.data.content,
      ...(body.data.name !== undefined && { name: body.data.name }),
      ...(body.data.description !== undefined && { description: body.data.description }),
      updatedAt: new Date(),
    })
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
