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
  LastHomeParams,
  VolunteerCompleteParams,
  VolunteerCompleteBody,
  UpdateVisitTimeParams,
  UpdateVisitTimeBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireAdmin } from "../middlewares/requireAdmin";
import { sendGroupMessage } from "../lib/whatsapp";
import { geocodeAddress } from "../lib/geocode";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

const REQUIRED_COLUMNS = ["date", "stop number", "time", "street address", "city", "postal code", "prasad offering"];

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
    mapUrl: visit.mapUrl ?? undefined,
    lat: visit.lat ?? undefined,
    lng: visit.lng ?? undefined,
    completedAt: visit.completedAt ? visit.completedAt.toISOString() : null,
    timeEdited: visit.completionTimeEdited ?? null,
    completionNotes: visit.completionNotes ?? null,
    devoteesAttended: visit.devoteesAttended ?? null,
    skipped: visit.skipped,
  };
}

async function getTemplate(id: number): Promise<string> {
  const [tmpl] = await db.select().from(notificationTemplatesTable).where(eq(notificationTemplatesTable.id, id));
  return tmpl?.content || "";
}

type VisitFields = { streetAddress: string; city: string; postalCode: string; prasadOffering: string; visitTime: string };

function formatAddress(v: VisitFields): string {
  return `${v.streetAddress}, ${v.city} ${v.postalCode}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const clamped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatTime12h(t: string): string {
  const clean = t.replace(/\s*(am|pm)$/i, "").trim();
  const [hh, mm] = clean.split(":");
  const h = parseInt(hh, 10);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${mm} ${period}`;
}

function buildInTransitMessage(
  current: { streetAddress: string; city: string; postalCode: string; prasadOffering: string },
  next: { streetAddress: string; city: string; postalCode: string; prasadOffering: string; mapUrl?: string | null } | null
): string {
  const lines: string[] = [
    "OmSaiRam! ",
    "",
    "*Palki arrived at:*",
    current.streetAddress,
    `${current.city} ${current.postalCode}`,
    `Prasad: ${current.prasadOffering}`,
  ];
  if (next) {
    lines.push("");
    lines.push("*Next Sai Home is:*");
    lines.push(next.streetAddress);
    lines.push(`${next.city} ${next.postalCode}`);
    lines.push(`Prasad: ${next.prasadOffering}`);
    if (next.mapUrl) lines.push(`Map: ${next.mapUrl}`);
  }
  return lines.join("\n");
}

function buildRoster(visits: VisitFields[]): string {
  return visits.map((v) => {
    const lines = [
      `Time: ${formatTime12h(v.visitTime)}`,
      `*${v.streetAddress}*`,
      `${v.city} ${v.postalCode}`,
    ];
    if (v.prasadOffering) lines.push(`Prasad: ${v.prasadOffering}`);
    return lines.join("\n");
  }).join("\n\n");
}

function applyTemplate(content: string, visit: VisitFields, nextVisit?: VisitFields): string {
  const nextAddress = nextVisit ? formatAddress(nextVisit) : "";
  return content
    .replace(/\{address\}/g, formatAddress(visit))
    .replace(/\{address_next\}/g, nextAddress)
    .replace(/\{street\}/g, visit.streetAddress)
    .replace(/\{city_postal\}/g, `${visit.city} ${visit.postalCode}`)
    .replace(/\{prasad\}/g, visit.prasadOffering);
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

  const lastNonSkippedIdx = visits.reduce((last, v, i) => (!v.skipped ? i : last), -1);
  const firstNonSkippedIdx = visits.findIndex(v => !v.skipped);
  const visitList = visits.map((v, i) =>
    buildVisitResponse(v, i === firstNonSkippedIdx, i === lastNonSkippedIdx)
  );

  let activeIndex: number | undefined;
  for (let i = 0; i < visitList.length; i++) {
    if (visitList[i].status === "pending" || visitList[i].status === "started" || visitList[i].status === "in_transit") {
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

router.post("/visits/upload", requireAdmin, upload.single("file"), async (req, res): Promise<void> => {
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
    const allRows: Record<string, unknown>[] = rawRows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [normalizeHeader(k), v]))
    );

    // Extract hyperlink URLs for the "map url" column (Excel stores URLs as hyperlinks,
    // which sheet_to_json does not include in cell values)
    const hyperlinkMapUrls = new Map<number, string>();
    const sheetRef = sheet["!ref"];
    if (sheetRef) {
      const range = XLSX.utils.decode_range(sheetRef);
      let mapUrlColIdx = -1;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const hCell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
        const hNorm = normalizeHeader(String(hCell?.v ?? ""));
        if (["map url", "map_url", "map", "location"].includes(hNorm)) {
          mapUrlColIdx = c;
          break;
        }
      }
      if (mapUrlColIdx !== -1) {
        for (let r = range.s.r + 1; r <= range.e.r; r++) {
          const cell = sheet[XLSX.utils.encode_cell({ r, c: mapUrlColIdx })];
          if (cell?.l?.Target) {
            hyperlinkMapUrls.set(r - range.s.r - 1, cell.l.Target);
          }
        }
      }
    }

    // Strip completely blank rows (all values null) that Excel often appends
    const indexedRows = allRows
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => Object.values(row).some((v) => v !== null && v !== ""));
    const rows: (Record<string, unknown> & { __rowIdx: number })[] = indexedRows.map(({ row, i }) => ({
      ...row,
      __rowIdx: i,
    }));

    if (rows.length === 0) {
      res.status(400).json({ error: "The uploaded file contains no data rows." });
      return;
    }

    const headers = Object.keys(rows[0]).filter(h => h !== "__rowIdx").map(normalizeHeader);
    req.log.info({ headers, hyperlinkMapUrlCount: hyperlinkMapUrls.size }, "Uploaded file column headers detected");
    const missingCols = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));

    if (missingCols.length > 0) {
      res.status(400).json({
        error: `Missing required columns: ${missingCols.join(", ")}. The file must contain all of these columns: Date, Stop Number, Anticipated Visit Time, Street Address, City, Postal Code, Prasad Offering.`,
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
      const timeVal = row["time"] ?? null;
      const streetVal = row["street address"] ?? null;
      const cityVal = row["city"] ?? null;
      const postalVal = row["postal code"] ?? null;
      const prasadVal = row["prasad offering"] ?? null;
      if (dateVal == null || stopVal == null || timeVal == null || streetVal == null || cityVal == null || postalVal == null || prasadVal == null) {
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
        const rawTime = row["time"];
        const phone = row["phone number"] ? String(row["phone number"]) : "";
        const streetAddress = String(row["street address"]);
        const city = String(row["city"]);
        const postalCode = String(row["postal code"]);
        const prasadOffering = String(row["prasad offering"] ?? "");
        const rawMapUrl = row["map url"] ?? row["map_url"] ?? row["map"] ?? row["location"] ?? null;
        const rowIdx = row["__rowIdx"] as number;
        const mapUrl = (rawMapUrl ? String(rawMapUrl) : null) || hyperlinkMapUrls.get(rowIdx) || null;

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
          name: "",
          phone,
          streetAddress,
          city,
          postalCode,
          prasadOffering,
          mapUrl,
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

router.post("/visits/:id/start", requireAdmin, async (req, res): Promise<void> => {
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

  const dateObj = new Date(`${visit.date}T12:00:00`);
  const monthDay = dateObj.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const roster = buildRoster(allVisits);
  const message = `OmSaiRam! Palki begins today, ${monthDay}! Baba will be visiting the following homes:\n\n${roster}`;
  const waResult = await sendGroupMessage(message);

  res.json({
    success: true,
    message: "Visit started",
    visit: buildVisitResponse(updated, idx === 0, idx === allVisits.length - 1),
    whatsappSent: waResult.success,
    whatsappError: waResult.error,
  });
});

router.post("/visits/:id/complete", requireAdmin, async (req, res): Promise<void> => {
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

  await db.update(visitsTable).set({ status: "in_transit" }).where(eq(visitsTable.id, id));
  const [updated] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));

  const allVisits = await db
    .select()
    .from(visitsTable)
    .where(eq(visitsTable.date, visit.date))
    .orderBy(asc(visitsTable.stopNumber));
  const idx = allVisits.findIndex((v) => v.id === id);

  const isLast = idx === allVisits.length - 1;
  let waMsg: string;
  if (isLast) {
    waMsg = await getTemplate(4);
  } else {
    const nextVisit = allVisits[idx + 1];
    waMsg = buildInTransitMessage(visit, nextVisit);
  }
  const waResult = await sendGroupMessage(waMsg);

  res.json({
    success: true,
    message: "Visit completed",
    visit: buildVisitResponse(updated, idx === 0, isLast),
    whatsappSent: waResult.success,
    whatsappError: waResult.error,
  });
});

router.post("/visits/:id/end", requireAdmin, async (req, res): Promise<void> => {
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

  await db.update(visitsTable).set({ status: "ended", completedAt: new Date() }).where(eq(visitsTable.id, id));
  const [updated] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));

  const allVisits = await db
    .select()
    .from(visitsTable)
    .where(eq(visitsTable.date, visit.date))
    .orderBy(asc(visitsTable.stopNumber));
  const idx = allVisits.findIndex((v) => v.id === id);

  const isLast = idx === allVisits.length - 1;
  let waMsg: string;
  if (isLast) {
    waMsg = await getTemplate(4);
  } else {
    const nextVisit = allVisits[idx + 1];
    waMsg = buildInTransitMessage(visit, nextVisit);
  }
  const waResult = await sendGroupMessage(waMsg);

  res.json({
    success: true,
    message: "Visit ended",
    visit: buildVisitResponse(updated, idx === 0, isLast),
    whatsappSent: waResult.success,
    whatsappError: waResult.error,
  });
});

router.post("/visits/:id/volunteer-complete", requireAuth, async (req, res): Promise<void> => {
  const parsedParams = VolunteerCompleteParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "Invalid visit ID" });
    return;
  }
  const id = parsedParams.data.id;

  const parsedBody = VolunteerCompleteBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { completedAt, notes, timeEdited, devoteesAttended } = parsedBody.data;

  const [visit] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));
  if (!visit) {
    res.status(404).json({ error: "Visit not found" });
    return;
  }

  if (visit.status !== "pending" && visit.status !== "started" && visit.status !== "in_transit") {
    res.status(400).json({ error: "Visit is not in a completable state" });
    return;
  }

  await db.update(visitsTable).set({
    status: "completed",
    completedAt: new Date(completedAt),
    completionNotes: notes ?? null,
    completionTimeEdited: timeEdited ?? false,
    devoteesAttended: devoteesAttended ?? null,
  }).where(eq(visitsTable.id, id));

  const [updated] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));

  const allVisits = await db
    .select()
    .from(visitsTable)
    .where(eq(visitsTable.date, visit.date))
    .orderBy(asc(visitsTable.stopNumber));
  const idx = allVisits.findIndex((v) => v.id === id);

  res.json({
    success: true,
    message: "Stop marked complete",
    visit: buildVisitResponse(updated, idx === 0, idx === allVisits.length - 1),
    whatsappSent: false,
  });
});

router.post("/visits/:id/last-home", requireAdmin, async (req, res): Promise<void> => {
  const parsed = LastHomeParams.safeParse(req.params);
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

  const templateContent = await getTemplate(5);
  const message = applyTemplate(templateContent, visit);
  const waResult = await sendGroupMessage(message);

  res.json({
    success: true,
    message: "Last home announced",
    visit: buildVisitResponse(visit, idx === 0, idx === allVisits.length - 1),
    whatsappSent: waResult.success,
    whatsappError: waResult.error,
  });
});

router.post("/visits/:id/end-day", requireAdmin, async (req, res): Promise<void> => {
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

  const endMsg = await getTemplate(4);
  const waResult = await sendGroupMessage(endMsg);

  res.json({
    success: true,
    message: "Day ended",
    visit: buildVisitResponse(updated, idx === 0, idx === allVisits.length - 1),
    whatsappSent: waResult.success,
    whatsappError: waResult.error,
  });
});

router.post("/visits/:id/skip", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid visit ID" });
    return;
  }

  const [visit] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));
  if (!visit) {
    res.status(404).json({ error: "Visit not found" });
    return;
  }

  await db.update(visitsTable).set({ skipped: true }).where(eq(visitsTable.id, id));
  const [updated] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));

  const allVisits = await db
    .select()
    .from(visitsTable)
    .where(eq(visitsTable.date, visit.date))
    .orderBy(asc(visitsTable.stopNumber));
  const idx = allVisits.findIndex((v) => v.id === id);

  res.json({
    success: true,
    message: "Visit skipped",
    visit: buildVisitResponse(updated, idx === 0, idx === allVisits.length - 1),
  });
});

router.patch("/visits/:id/time", requireAdmin, async (req, res): Promise<void> => {
  const parsedParams = UpdateVisitTimeParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "Invalid visit ID" });
    return;
  }
  const id = parsedParams.data.id;

  const parsedBody = UpdateVisitTimeBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "Invalid visit time format" });
    return;
  }
  const { visitTime: newTime } = parsedBody.data;

  const [visit] = await db.select().from(visitsTable).where(eq(visitsTable.id, id));
  if (!visit) {
    res.status(404).json({ error: "Visit not found" });
    return;
  }

  if (visit.status === "completed" || visit.status === "ended" || visit.status === "day_ended") {
    res.status(403).json({ error: "Cannot edit time for a completed visit" });
    return;
  }

  const diffMinutes = timeToMinutes(newTime) - timeToMinutes(visit.visitTime);

  await db.update(visitsTable)
    .set({ visitTime: newTime })
    .where(eq(visitsTable.id, id));

  const allVisits = await db.select()
    .from(visitsTable)
    .where(eq(visitsTable.date, visit.date))
    .orderBy(asc(visitsTable.stopNumber));

  const toUpdate = allVisits.filter(
    v => v.id !== id &&
      (v.status === "pending" || v.status === "started") &&
      v.stopNumber > visit.stopNumber
  );

  for (const v of toUpdate) {
    await db.update(visitsTable)
      .set({ visitTime: minutesToTime(timeToMinutes(v.visitTime) + diffMinutes) })
      .where(eq(visitsTable.id, v.id));
  }

  const updatedCount = 1 + toUpdate.length;
  res.json({
    success: true,
    message: `Visit times updated for ${updatedCount} stop${updatedCount !== 1 ? "s" : ""}`,
    updatedCount,
  });
});

export default router;
