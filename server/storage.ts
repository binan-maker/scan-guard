import { drizzle } from "drizzle-orm/node-postgres";
import { eq, desc, count, and, sql, asc } from "drizzle-orm";
import {
  users,
  authTokens,
  qrCodes,
  comments,
  commentLikes,
  commentReports,
  reports,
  scans,
  favorites,
  qrFollows,
  feedback,
  type User,
  type QrCode,
  type Comment,
  type Report,
  type Scan,
} from "@shared/schema";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const db = drizzle(process.env.DATABASE_URL!);

export async function createUser(
  email: string,
  displayName: string,
  password: string
): Promise<User> {
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(users)
    .values({ email, displayName, passwordHash })
    .returning();
  return user;
}

export async function createOrGetGoogleUser(
  googleId: string,
  email: string,
  displayName: string,
  photoURL: string | null
): Promise<User> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.googleId, googleId));
  if (existing) {
    const [updated] = await db
      .update(users)
      .set({ displayName, photoURL })
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }
  const [byEmail] = await db
    .select()
    .from(users)
    .where(eq(users.email, email));
  if (byEmail) {
    const [updated] = await db
      .update(users)
      .set({ googleId, photoURL, displayName })
      .where(eq(users.id, byEmail.id))
      .returning();
    return updated;
  }
  const [user] = await db
    .insert(users)
    .values({ email, displayName, googleId, photoURL, passwordHash: null })
    .returning();
  return user;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

export async function getUserById(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function verifyPassword(
  user: User,
  password: string
): Promise<boolean> {
  if (!user.passwordHash) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export async function createAuthToken(userId: string): Promise<string> {
  const token = randomUUID();
  await db.insert(authTokens).values({ userId, token });
  return token;
}

export async function getUserByToken(token: string): Promise<User | undefined> {
  const [result] = await db
    .select()
    .from(authTokens)
    .innerJoin(users, eq(authTokens.userId, users.id))
    .where(eq(authTokens.token, token));
  return result?.users;
}

export async function deleteAuthToken(token: string): Promise<void> {
  await db.delete(authTokens).where(eq(authTokens.token, token));
}

export async function getOrCreateQrCode(
  content: string,
  contentType: string = "text"
): Promise<QrCode> {
  const [existing] = await db
    .select()
    .from(qrCodes)
    .where(eq(qrCodes.content, content));
  if (existing) return existing;
  const [created] = await db
    .insert(qrCodes)
    .values({ content, contentType })
    .returning();
  return created;
}

export async function getQrCodeById(id: string): Promise<QrCode | undefined> {
  const [qr] = await db.select().from(qrCodes).where(eq(qrCodes.id, id));
  return qr;
}

export async function getQrCodeComments(
  qrCodeId: string,
  offset: number = 0,
  limit: number = 20
) {
  const results = await db
    .select({
      id: comments.id,
      qrCodeId: comments.qrCodeId,
      userId: comments.userId,
      parentId: comments.parentId,
      text: comments.text,
      isDeleted: comments.isDeleted,
      createdAt: comments.createdAt,
      userDisplayName: users.displayName,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.qrCodeId, qrCodeId))
    .orderBy(desc(comments.createdAt))
    .offset(offset)
    .limit(limit);

  const commentIds = results.map((r) => r.id);
  if (commentIds.length === 0) return [];

  const likeCounts = await db
    .select({
      commentId: commentLikes.commentId,
      isLike: commentLikes.isLike,
      cnt: count(),
    })
    .from(commentLikes)
    .where(sql`${commentLikes.commentId} IN ${commentIds}`)
    .groupBy(commentLikes.commentId, commentLikes.isLike);

  const likeMap: Record<string, { likes: number; dislikes: number }> = {};
  for (const row of likeCounts) {
    if (!likeMap[row.commentId]) likeMap[row.commentId] = { likes: 0, dislikes: 0 };
    if (row.isLike) likeMap[row.commentId].likes = Number(row.cnt);
    else likeMap[row.commentId].dislikes = Number(row.cnt);
  }

  return results.map((r) => ({
    id: r.id,
    qrCodeId: r.qrCodeId,
    userId: r.userId,
    parentId: r.parentId,
    text: r.isDeleted ? "[deleted]" : r.text,
    isDeleted: r.isDeleted,
    createdAt: r.createdAt,
    user: { displayName: r.isDeleted ? "[deleted]" : r.userDisplayName },
    likes: likeMap[r.id]?.likes || 0,
    dislikes: likeMap[r.id]?.dislikes || 0,
  }));
}

export async function addComment(
  qrCodeId: string,
  userId: string,
  text: string,
  parentId?: string
): Promise<Comment> {
  const [comment] = await db
    .insert(comments)
    .values({ qrCodeId, userId, text, parentId: parentId || null })
    .returning();
  return comment;
}

export async function toggleCommentLike(
  commentId: string,
  userId: string,
  isLike: boolean
) {
  const [existing] = await db
    .select()
    .from(commentLikes)
    .where(
      and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, userId))
    );

  if (existing) {
    if (existing.isLike === isLike) {
      await db.delete(commentLikes).where(eq(commentLikes.id, existing.id));
    } else {
      await db
        .update(commentLikes)
        .set({ isLike })
        .where(eq(commentLikes.id, existing.id));
    }
  } else {
    await db.insert(commentLikes).values({ commentId, userId, isLike });
  }

  return getCommentLikeCounts(commentId);
}

export async function getCommentLikeCounts(commentId: string) {
  const results = await db
    .select({
      isLike: commentLikes.isLike,
      cnt: count(),
    })
    .from(commentLikes)
    .where(eq(commentLikes.commentId, commentId))
    .groupBy(commentLikes.isLike);

  let likes = 0;
  let dislikes = 0;
  for (const row of results) {
    if (row.isLike) likes = Number(row.cnt);
    else dislikes = Number(row.cnt);
  }
  return { likes, dislikes };
}

export async function getUserCommentLike(commentId: string, userId: string) {
  const [result] = await db
    .select()
    .from(commentLikes)
    .where(
      and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, userId))
    );
  return result || null;
}

export async function reportComment(
  commentId: string,
  userId: string,
  reason: string
) {
  const [report] = await db
    .insert(commentReports)
    .values({ commentId, userId, reason })
    .returning();
  return report;
}

export async function getCommentReportCount(commentId: string): Promise<number> {
  const [result] = await db
    .select({ cnt: count() })
    .from(commentReports)
    .where(eq(commentReports.commentId, commentId));
  return Number(result.cnt);
}

export async function getQrCodeReports(qrCodeId: string) {
  const results = await db
    .select({
      reportType: reports.reportType,
      cnt: count(),
    })
    .from(reports)
    .where(eq(reports.qrCodeId, qrCodeId))
    .groupBy(reports.reportType);
  return results.reduce(
    (acc, r) => {
      acc[r.reportType] = Number(r.cnt);
      return acc;
    },
    {} as Record<string, number>
  );
}

export async function addReport(
  qrCodeId: string,
  userId: string,
  reportType: string
): Promise<Report> {
  const existing = await db
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.qrCodeId, qrCodeId),
        eq(reports.userId, userId)
      )
    );
  if (existing.length > 0) {
    const [updated] = await db
      .update(reports)
      .set({ reportType })
      .where(eq(reports.id, existing[0].id))
      .returning();
    return updated;
  }
  const [report] = await db
    .insert(reports)
    .values({ qrCodeId, userId, reportType })
    .returning();
  return report;
}

export async function getUserReport(qrCodeId: string, userId: string) {
  const [report] = await db
    .select()
    .from(reports)
    .where(
      and(eq(reports.qrCodeId, qrCodeId), eq(reports.userId, userId))
    );
  return report || null;
}

export async function recordScan(
  qrCodeId: string,
  userId: string | null,
  isAnonymous: boolean = false
): Promise<Scan> {
  const [scan] = await db
    .insert(scans)
    .values({
      qrCodeId,
      userId,
      isAnonymous,
    })
    .returning();
  return scan;
}

export async function getUserScans(userId: string) {
  const results = await db
    .select({
      id: scans.id,
      qrCodeId: scans.qrCodeId,
      scannedAt: scans.scannedAt,
      isAnonymous: scans.isAnonymous,
      content: qrCodes.content,
      contentType: qrCodes.contentType,
    })
    .from(scans)
    .innerJoin(qrCodes, eq(scans.qrCodeId, qrCodes.id))
    .where(and(eq(scans.userId, userId), eq(scans.isAnonymous, false)))
    .orderBy(desc(scans.scannedAt));
  return results;
}

export async function getTotalScans(qrCodeId: string): Promise<number> {
  const [result] = await db
    .select({ cnt: count() })
    .from(scans)
    .where(eq(scans.qrCodeId, qrCodeId));
  return Number(result.cnt);
}

export async function getTotalComments(qrCodeId: string): Promise<number> {
  const [result] = await db
    .select({ cnt: count() })
    .from(comments)
    .where(eq(comments.qrCodeId, qrCodeId));
  return Number(result.cnt);
}

export async function addFavorite(qrCodeId: string, userId: string) {
  const [fav] = await db
    .insert(favorites)
    .values({ qrCodeId, userId })
    .returning();
  return fav;
}

export async function removeFavorite(qrCodeId: string, userId: string) {
  await db
    .delete(favorites)
    .where(and(eq(favorites.qrCodeId, qrCodeId), eq(favorites.userId, userId)));
}

export async function getUserFavorites(userId: string) {
  const results = await db
    .select({
      id: favorites.id,
      qrCodeId: favorites.qrCodeId,
      createdAt: favorites.createdAt,
      content: qrCodes.content,
      contentType: qrCodes.contentType,
      qrCreatedAt: qrCodes.createdAt,
    })
    .from(favorites)
    .innerJoin(qrCodes, eq(favorites.qrCodeId, qrCodes.id))
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt));
  return results;
}

export async function isUserFavorite(qrCodeId: string, userId: string): Promise<boolean> {
  const [result] = await db
    .select()
    .from(favorites)
    .where(and(eq(favorites.qrCodeId, qrCodeId), eq(favorites.userId, userId)));
  return !!result;
}

export async function addQrFollow(qrCodeId: string, userId: string) {
  const [follow] = await db
    .insert(qrFollows)
    .values({ qrCodeId, userId })
    .returning();
  return follow;
}

export async function removeQrFollow(qrCodeId: string, userId: string) {
  await db
    .delete(qrFollows)
    .where(and(eq(qrFollows.qrCodeId, qrCodeId), eq(qrFollows.userId, userId)));
}

export async function getQrFollowCount(qrCodeId: string): Promise<number> {
  const [result] = await db
    .select({ cnt: count() })
    .from(qrFollows)
    .where(eq(qrFollows.qrCodeId, qrCodeId));
  return Number(result.cnt);
}

export async function isUserFollowing(qrCodeId: string, userId: string): Promise<boolean> {
  const [result] = await db
    .select()
    .from(qrFollows)
    .where(and(eq(qrFollows.qrCodeId, qrCodeId), eq(qrFollows.userId, userId)));
  return !!result;
}

export async function getUserFollowing(userId: string) {
  const results = await db
    .select({
      id: qrFollows.id,
      qrCodeId: qrFollows.qrCodeId,
      createdAt: qrFollows.createdAt,
      content: qrCodes.content,
      contentType: qrCodes.contentType,
      qrCreatedAt: qrCodes.createdAt,
    })
    .from(qrFollows)
    .innerJoin(qrCodes, eq(qrFollows.qrCodeId, qrCodes.id))
    .where(eq(qrFollows.userId, userId))
    .orderBy(desc(qrFollows.createdAt));
  return results;
}

export async function addFeedback(
  userId: string | null,
  email: string | null,
  message: string
) {
  const [fb] = await db
    .insert(feedback)
    .values({ userId, email, message })
    .returning();
  return fb;
}

export async function softDeleteUser(userId: string) {
  await db
    .update(users)
    .set({ isDeleted: true, deletedAt: new Date() })
    .where(eq(users.id, userId));

  await db
    .update(comments)
    .set({ isDeleted: true })
    .where(eq(comments.userId, userId));
}

export async function getUserComments(userId: string) {
  const results = await db
    .select({
      id: comments.id,
      qrCodeId: comments.qrCodeId,
      parentId: comments.parentId,
      text: comments.text,
      isDeleted: comments.isDeleted,
      createdAt: comments.createdAt,
      content: qrCodes.content,
      contentType: qrCodes.contentType,
    })
    .from(comments)
    .innerJoin(qrCodes, eq(comments.qrCodeId, qrCodes.id))
    .where(eq(comments.userId, userId))
    .orderBy(desc(comments.createdAt));
  return results;
}

export async function clearUserComments(userId: string) {
  await db
    .update(comments)
    .set({ isDeleted: true })
    .where(eq(comments.userId, userId));
}

export async function getReportedComments() {
  const results = await db
    .select({
      commentId: commentReports.commentId,
      reportCount: count(),
    })
    .from(commentReports)
    .groupBy(commentReports.commentId)
    .orderBy(desc(count()));

  const detailed = [];
  for (const row of results) {
    const [comment] = await db
      .select({
        id: comments.id,
        qrCodeId: comments.qrCodeId,
        userId: comments.userId,
        text: comments.text,
        isDeleted: comments.isDeleted,
        createdAt: comments.createdAt,
        userDisplayName: users.displayName,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.id, row.commentId));

    if (comment) {
      const reporters = await db
        .select({
          reason: commentReports.reason,
          createdAt: commentReports.createdAt,
          reporterName: users.displayName,
        })
        .from(commentReports)
        .innerJoin(users, eq(commentReports.userId, users.id))
        .where(eq(commentReports.commentId, row.commentId))
        .orderBy(desc(commentReports.createdAt));

      detailed.push({
        ...comment,
        user: { displayName: comment.userDisplayName },
        reportCount: Number(row.reportCount),
        reporters,
      });
    }
  }
  return detailed;
}

export async function decodeQrFromImage(
  base64Data: string
): Promise<string | null> {
  try {
    const { Jimp } = await import("jimp");
    const jsQR = (await import("jsqr")).default;
    const buffer = Buffer.from(base64Data, "base64");
    const image = await Jimp.read(buffer);
    const width = image.width;
    const height = image.height;
    const bitmap = image.bitmap;
    const data = new Uint8ClampedArray(bitmap.data);
    const code = jsQR(data, width, height);
    return code ? code.data : null;
  } catch (e) {
    console.error("QR decode error:", e);
    return null;
  }
}
