import { pgTable, serial, text, integer, real, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const uploadBatchesTable = pgTable("upload_batches", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  totalVisits: integer("total_visits").notNull(),
  isDayComplete: boolean("is_day_complete").notNull().default(false),
  adminReminderSent: boolean("admin_reminder_sent").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const visitsTable = pgTable("visits", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => uploadBatchesTable.id),
  date: text("date").notNull(),
  stopNumber: integer("stop_number").notNull(),
  visitTime: text("visit_time").notNull(),
  name: text("name").notNull().default(""),
  phone: text("phone").notNull(),
  streetAddress: text("street_address").notNull(),
  city: text("city").notNull(),
  postalCode: text("postal_code").notNull(),
  prasadOffering: text("prasad_offering").notNull().default(""),
  lat: real("lat"),
  lng: real("lng"),
  status: text("status").notNull().default("pending"),
  completedAt: timestamp("completed_at"),
  completionNotes: text("completion_notes"),
  completionTimeEdited: boolean("completion_time_edited"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notificationTemplatesTable = pgTable("notification_templates", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const profileTable = pgTable("profile", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const visitPhotosTable = pgTable("visit_photos", {
  id: serial("id").primaryKey(),
  visitId: integer("visit_id").notNull().references(() => visitsTable.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  headCount: integer("head_count"),
  aiModel: text("ai_model"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiSettingsTable = pgTable("ai_settings", {
  id: integer("id").primaryKey().default(1),
  provider: text("provider").notNull().default("huggingface"),
  modelId: text("model_id").notNull().default("facebook/detr-resnet-50"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Profile = typeof profileTable.$inferSelect;

export const insertVisitSchema = createInsertSchema(visitsTable).omit({ id: true, createdAt: true });
export const insertBatchSchema = createInsertSchema(uploadBatchesTable).omit({ id: true, createdAt: true });
export const insertTemplateSchema = createInsertSchema(notificationTemplatesTable).omit({ updatedAt: true });

export type Visit = typeof visitsTable.$inferSelect;
export type InsertVisit = z.infer<typeof insertVisitSchema>;
export type UploadBatch = typeof uploadBatchesTable.$inferSelect;
export type NotificationTemplate = typeof notificationTemplatesTable.$inferSelect;
