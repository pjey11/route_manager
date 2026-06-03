import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { eq, and, asc } from "drizzle-orm";
import { db, visitsTable, uploadBatchesTable, notificationTemplatesTable } from "@workspace/db";
import {
  ListVisitsQueryParams,
  StartVisitParams,
  CompleteVisitParams,
  EndVisitParams,
  EndDayParams,
  GeofenceAlertParams,
  SendGeofenceMessageParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { sendWhatsApp } from "../lib/whatsapp";
import { geocodeAddress } from "../lib/geocode";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

const REQUIRED_COLUMNS = ["date", "stop number", "anticipated visit time", "name", "phone number", "street address", "city", "postal code", "prasad offering"];

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim();
}

function buildVisitResponse(visit: typeof visitsTable.$inferSelect, isFirst: boolean, isLast: boolean) {
  return {
    id: visit.id,
    date: visit.date,
    stopNumber: visit.stopNumber,
    visitTime: visit.visitTime,
    name: visit.name,
    phone: visit.phone,
    streetAddress: visit.streetAddress,
    city: visit.city,
    postalCode: visit.postalCode,
    prasadOffering: visit.prasadOffering,
    status: visit.status,
    isFirst,
    isLast,
    batchId: visit.batchId,
    lat: visit.lat ?? undefined,
    lng: visit.lng ?? undefined,
  };
}

async function getTemplate(id: number): Promise<string> {
  const [tmpl] = await db.select().from(notificationTemplatesTable).where(eq(notificationTemplatesTable.id, id));
  return tmpl?.content || "";
}

function applyTemplate(content: string, name: string): string {
  return content.replace(/\{name\}/g, name);
}

router.get("/visits/dates", requireAuth, async (_req, res): Promise<void> => {
  const batches = await db
    .selectDistinct({ date: uploadBatchesTable.date })
    .from(uploadBatchesTable)
    .orderBy(asc(uploadBatchesTable.date));

  res.json({ dates: batches.map((b) => b.date) });
});

router.get("/visits", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListVisitsQueryParams.safeParse(req.query);
  const today = new Date().toISOString().split("T")[0];
  const date = parsed.success && parsed.data.date ? parsed.data.date : today;

  const visits = await db
    .select()
    .from(visitsTable)
    .where(eq(visitsTable.date, date))
    .orderBy(asc(visitsTable.stopNumber));

  const batch = await db
    .select()
    .from(uploadBatchesTable)
    .where(eq(uploadBatchesTable.date, date))
    .limit(1);

  const isDayComplete = batch[0]?.isDayComplete ?? false;

  const visitList = visits.map((v, i) =>
    buildVisitResponse(v, i === 0, i === visits.length - 1)
  );

  let activeIndex: number | undefined;
  for (let i = 0; i < visitList.length; i++) {
    if (visitList[i].status === "pending" || visitList[i].status === "started") {
      activeIndex = i;
      break;
    }
  }

  res.json({
    visits: visitList,
    date,
    isDayComplete,
    totalCount: visits.length,
    activeIndex,
  });
});

router.post("/visits/upload", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

    // Normalize all row keys to lowercase so header casing in Excel doesn't matter
    const allRows = rawRows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [normalizeHeader(k), v]))
    );

    // Strip completely blank rows (all values null) that Excel often appends
    const rows = allRows.filter((row) =>
      Object.values(row).some((v) => v !== null && v !== "")
    );

    if (rows.length === 0) {
      res.status(400).json({ error: "The uploaded file contains no data rows." });
      return;
    }

    const headers = Object.keys(rows[0]).map(normalizeHeader);
    const missingCols = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));

    if (missingCols.length > 0) {
      res.status(400).json({
        error: `Missing required columns: ${missingCols.join(", ")}. The file must contain all of these columns: Date, Stop Number, Anticipated Visit Time, Name, Phone Number, Street Address, City, Postal Code, Prasad Offering.`,
      });
      return;
    }

    if (rows.length > 300) {
      res.status(400).json({
        error: `The file has ${rows.length} rows, which exceeds the maximum of 300 rows.`,
      });
      return;
    }

    const rowsWithNulls = rows.map((row, i) => {
      const dateVal = row["date"] ?? null;
      const stopVal = row["stop number"] ?? null;
      const timeVal = row["anticipated visit time"] ?? null;
      const nameVal = row["name"] ?? null;
      const phoneVal = row["phone number"] ?? null;
      const streetVal = row["street address"] ?? null;
      const cityVal = row["city"] ?? null;
      const postalVal = row["postal code"] ?? null;
      const prasadVal = row["prasad offering"] ?? null;
      if (dateVal == null || stopVal == null || timeVal == null || nameVal == null || phoneVal == null || streetVal == null || cityVal == null || postalVal == null || prasadVal == null) {
        return i + 1;
      }
      return null;
    }).filter((v) => v !== null);

    if (rowsWithNulls.length > 0) {
      res.status(400).json({
        error: `Row(s) ${rowsWithNulls.join(", ")} contain empty values. Please fix the spreadsheet and re-upload.`,
      });
      return;
    }

    const groupedByDate = new Map<string, typeof rows>();
    for (const row of rows) {
      const rawDate = row["date"];
      let dateStr: string;
      if (typeof rawDate === "number") {
        const d = XLSX.SSF.parse_date_code(rawDate);
        dateStr = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
      } else {
        dateStr = String(rawDate);
      }
      if (!groupedByDate.has(dateStr)) groupedByDate.set(dateStr, []);
      groupedByDate.get(dateStr)!.push(row);
    }

    for (const [dateStr, dateRows] of groupedByDate) {
      if (dateRows.length > 20) {
        res.status(400).json({
          error: `Date ${dateStr} has ${dateRows.length} visits, which exceeds the maximum of 20 visits per day.`,
        });
        return;
      }
    }

    let insertedCount = 0;
    let batchId = 0;
    let firstDate = "";

    for (const [dateStr, dateRows] of groupedByDate) {
      await db.delete(visitsTable).where(eq(visitsTable.date, dateStr));
      await db.delete(uploadBatchesTable).where(eq(uploadBatchesTable.date, dateStr));

      const [batch] = await db
        .insert(uploadBatchesTable)
        .values({ date: dateStr, totalVisits: dateRows.length, isDayComplete: false })
        .returning();

      batchId = batch.id;
      if (!firstDate) firstDate = dateStr;

      const visitInserts = dateRows.map((row) => {
        const rawStop = row["stop number"];
        const rawTime = row["anticipated visit time"];
        const name = String(row["name"]);
        const phone = String(row["phone number"]);
        const streetAddress = String(row["street address"]);
        const city = String(row["city"]);
        const postalCode = String(row["postal code"]);
        const prasadOffering = String(row["prasad offering"] ?? "");

        let timeStr = String(rawTime);
        if (!isNaN(Number(rawTime))) {
          const d = XLSX.SSF.parse_date_code(Number(rawTime));
          timeStr = `${String(d.H).padStart(2, "0")}:${String(d.M).padStart(2, "0")}`;
        }

        return {
          batchId: batch.id,
          date: dateStr,
          stopNumber: parseInt(String(rawStop), 10),
          visitTime: timeStr,
          name,
          phone,
          streetAddress,
          city,
          postalCode,
          prasadOffering,
          status: "pending",
        };
      });

      const inserted = await db.insert(visitsTable).values(visitInserts).returning();
      insertedCount += inserted.length;

      for (const v of inserted) {
        const fullAddress = `${v.streetAddress}, ${v.city}, ${v.postalCode}`;
        geocodeAddress(fullAddress).then((geo) => {
          if (geo) {
            db.update(visitsTable)
              .set({ lat: geo.lat, lng: geo.lng })
              .where(eq(visitsTable.id, v.id))
              .catch(() => {});
          }
        }).catch(() => {});
      }
    }

    res.json({
      success: true,
      message: `Successfully uploaded ${insertedCount} visits.`,
      count: insertedCount,
      date: firstDate,
      batchId,
    });
  } catch (err) {
    req.log.error({ err }, "Error processing Excel upload");
    res.status(400).json({ error: "Failed to parse the uploaded file. Please ensure it is a valid Excel (.xlsx or .xls) file." });
  }
});

router.post("/visits/:id/start", requireAuth, async (req, res): Promise<void> => {
  const parsed = StartVisitParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid visit ID" });
    return;
  }
  const id = parsed.data.id;

  const [visit] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));
  if (!visit) {
    res.status(404).json({ error: "Visit not found" });
    return;
  }

  await db.update(visitsTable).set({ status: "started" }).where(eq(visitsTable.id, id));
  const [updated] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));

  const allVisits = await db
    .select()
    .from(visitsTable)
    .where(eq(visitsTable.date, visit.date))
    .orderBy(asc(visitsTable.stopNumber));
  const idx = allVisits.findIndex((v) => v.id === id);

  const templateContent = await getTemplate(1);
  const message = applyTemplate(templateContent, visit.name);
  const waResult = await sendWhatsApp(visit.phone, message);

  res.json({
    success: true,
    message: "Visit started",
    visit: buildVisitResponse(updated, idx === 0, idx === allVisits.length - 1),
    whatsappSent: waResult.success,
    whatsappError: waResult.error,
  });
});

router.post("/visits/:id/complete", requireAuth, async (req, res): Promise<void> => {
  const parsed = CompleteVisitParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid visit ID" });
    return;
  }
  const id = parsed.data.id;

  const [visit] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));
  if (!visit) {
    res.status(404).json({ error: "Visit not found" });
    return;
  }

  await db.update(visitsTable).set({ status: "completed" }).where(eq(visitsTable.id, id));
  const [updated] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));

  const allVisits = await db
    .select()
    .from(visitsTable)
    .where(eq(visitsTable.date, visit.date))
    .orderBy(asc(visitsTable.stopNumber));
  const idx = allVisits.findIndex((v) => v.id === id);

  const template3 = await getTemplate(3);
  const thankMsg = applyTemplate(template3, visit.name);
  const waResult1 = await sendWhatsApp(visit.phone, thankMsg);

  let waResult2 = { success: false, error: "No next visit" };
  if (idx < allVisits.length - 1) {
    const nextVisit = allVisits[idx + 1];
    const template1 = await getTemplate(1);
    const arrivalMsg = applyTemplate(template1, nextVisit.name);
    waResult2 = await sendWhatsApp(nextVisit.phone, arrivalMsg);
  }

  res.json({
    success: true,
    message: "Visit completed",
    visit: buildVisitResponse(updated, idx === 0, idx === allVisits.length - 1),
    whatsappSent: waResult1.success && waResult2.success,
    whatsappError: waResult1.error || waResult2.error,
  });
});

router.post("/visits/:id/end", requireAuth, async (req, res): Promise<void> => {
  const parsed = EndVisitParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid visit ID" });
    return;
  }
  const id = parsed.data.id;

  const [visit] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));
  if (!visit) {
    res.status(404).json({ error: "Visit not found" });
    return;
  }

  await db.update(visitsTable).set({ status: "ended" }).where(eq(visitsTable.id, id));
  const [updated] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));

  const allVisits = await db
    .select()
    .from(visitsTable)
    .where(eq(visitsTable.date, visit.date))
    .orderBy(asc(visitsTable.stopNumber));
  const idx = allVisits.findIndex((v) => v.id === id);

  const template3 = await getTemplate(3);
  const thankMsg = applyTemplate(template3, visit.name);
  const waResult = await sendWhatsApp(visit.phone, thankMsg);

  res.json({
    success: true,
    message: "Visit ended",
    visit: buildVisitResponse(updated, idx === 0, idx === allVisits.length - 1),
    whatsappSent: waResult.success,
    whatsappError: waResult.error,
  });
});

router.post("/visits/:id/end-day", requireAuth, async (req, res): Promise<void> => {
  const parsed = EndDayParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid visit ID" });
    return;
  }
  const id = parsed.data.id;

  const [visit] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));
  if (!visit) {
    res.status(404).json({ error: "Visit not found" });
    return;
  }

  await db
    .update(uploadBatchesTable)
    .set({ isDayComplete: true })
    .where(eq(uploadBatchesTable.id, visit.batchId));

  await db.update(visitsTable).set({ status: "day_ended" }).where(eq(visitsTable.id, id));
  const [updated] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));

  const allVisits = await db
    .select()
    .from(visitsTable)
    .where(eq(visitsTable.date, visit.date))
    .orderBy(asc(visitsTable.stopNumber));
  const idx = allVisits.findIndex((v) => v.id === id);

  res.json({
    success: true,
    message: "Day ended",
    visit: buildVisitResponse(updated, idx === 0, idx === allVisits.length - 1),
    whatsappSent: false,
  });
});

router.post("/visits/:id/geofence-alert", requireAuth, async (req, res): Promise<void> => {
  const parsed = GeofenceAlertParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid visit ID" });
    return;
  }
  const id = parsed.data.id;

  const [visit] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));
  if (!visit) {
    res.status(404).json({ error: "Visit not found" });
    return;
  }

  const allVisits = await db
    .select()
    .from(visitsTable)
    .where(eq(visitsTable.date, visit.date))
    .orderBy(asc(visitsTable.stopNumber));
  const idx = allVisits.findIndex((v) => v.id === id);

  const template2 = await getTemplate(2);
  const message = applyTemplate(template2, visit.name);

  res.json({
    shouldSendMessage: true,
    message,
    visit: buildVisitResponse(visit, idx === 0, idx === allVisits.length - 1),
  });
});

router.post("/visits/:id/send-geofence", requireAuth, async (req, res): Promise<void> => {
  const parsed = SendGeofenceMessageParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid visit ID" });
    return;
  }
  const id = parsed.data.id;

  const [visit] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));
  if (!visit) {
    res.status(404).json({ error: "Visit not found" });
    return;
  }

  const allVisits = await db
    .select()
    .from(visitsTable)
    .where(eq(visitsTable.date, visit.date))
    .orderBy(asc(visitsTable.stopNumber));
  const idx = allVisits.findIndex((v) => v.id === id);

  const template2 = await getTemplate(2);
  const message = applyTemplate(template2, visit.name);
  const waResult = await sendWhatsApp(visit.phone, message);

  res.json({
    success: waResult.success,
    message: waResult.success ? "Arrival notice sent" : `Failed: ${waResult.error}`,
    visit: buildVisitResponse(visit, idx === 0, idx === allVisits.length - 1),
    whatsappSent: waResult.success,
    whatsappError: waResult.error,
  });
});

export default router;
