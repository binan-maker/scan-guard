import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, primaryKey } from "drizzle-orm/pg-core";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash"),
  photoURL: text("photo_url"),
  googleId: text("google_id").unique(),
  isDeleted: boolean("is_deleted").default(false),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const authTokens = pgTable("auth_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const qrCodes = pgTable("qr_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  content: text("content").notNull().unique(),
  contentType: text("content_type").notNull().default("text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  qrCodeId: varchar("qr_code_id").notNull().references(() => qrCodes.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  parentId: varchar("parent_id"),
  text: text("text").notNull(),
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const commentLikes = pgTable("comment_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").notNull().references(() => comments.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  isLike: boolean("is_like").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const commentReports = pgTable("comment_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").notNull().references(() => comments.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  qrCodeId: varchar("qr_code_id").notNull().references(() => qrCodes.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  reportType: text("report_type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scans = pgTable("scans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  qrCodeId: varchar("qr_code_id").notNull().references(() => qrCodes.id),
  userId: varchar("user_id").references(() => users.id),
  isAnonymous: boolean("is_anonymous").default(false),
  scannedAt: timestamp("scanned_at").defaultNow().notNull(),
});

export const favorites = pgTable("favorites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  qrCodeId: varchar("qr_code_id").notNull().references(() => qrCodes.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const qrFollows = pgTable("qr_follows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  qrCodeId: varchar("qr_code_id").notNull().references(() => qrCodes.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const feedback = pgTable("feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  email: text("email"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const registerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(50),
  password: z.string().min(6),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type User = typeof users.$inferSelect;
export type QrCode = typeof qrCodes.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Scan = typeof scans.$inferSelect;
export type CommentLike = typeof commentLikes.$inferSelect;
export type CommentReport = typeof commentReports.$inferSelect;
export type Favorite = typeof favorites.$inferSelect;
export type QrFollow = typeof qrFollows.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
