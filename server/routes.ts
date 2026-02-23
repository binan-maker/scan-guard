import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import {
  createUser,
  getUserByEmail,
  getUserById,
  verifyPassword,
  createAuthToken,
  getUserByToken,
  deleteAuthToken,
  getOrCreateQrCode,
  getQrCodeById,
  getQrCodeComments,
  addComment,
  getQrCodeReports,
  addReport,
  getUserReport,
  recordScan,
  getUserScans,
  getTotalScans,
  getTotalComments,
  decodeQrFromImage,
  toggleCommentLike,
  getUserCommentLike,
  reportComment,
  getCommentReportCount,
  addFavorite,
  removeFavorite,
  getUserFavorites,
  isUserFavorite,
  addQrFollow,
  removeQrFollow,
  getQrFollowCount,
  isUserFollowing,
  getUserFollowing,
  addFeedback,
  softDeleteUser,
  getUserComments,
  clearUserComments,
  getReportedComments,
} from "./storage";
import { registerSchema, loginSchema } from "@shared/schema";

interface AuthRequest extends Request {
  user?: { id: string; email: string; displayName: string };
}

async function authMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const user = await getUserByToken(token);
    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      };
    }
  }
  next();
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

function detectContentType(content: string): string {
  const lower = content.toLowerCase();

  if (lower.startsWith("upi://")) return "payment";
  if (lower.startsWith("tez://")) return "payment";
  if (lower.includes("paypal.me") || lower.includes("paypal.com/payables")) return "payment";
  if (lower.includes("phonepe")) return "payment";
  if (lower.includes("pay.google.com")) return "payment";
  if (lower.includes("paytm")) return "payment";
  if (lower.includes("venmo.com")) return "payment";
  if (lower.includes("cash.app")) return "payment";

  if (content.startsWith("tel:")) return "phone";
  if (content.startsWith("mailto:")) return "email";
  if (content.startsWith("WIFI:")) return "wifi";
  if (content.startsWith("geo:")) return "location";

  try {
    new URL(content);
    return "url";
  } catch {
    return "text";
  }
}

function calculateTrustScore(reportCounts: Record<string, number>) {
  const safe = reportCounts.safe || 0;
  const scam = reportCounts.scam || 0;
  const fake = reportCounts.fake || 0;
  const spam = reportCounts.spam || 0;
  const total = safe + scam + fake + spam;

  if (total === 0) return { score: -1, label: "Unrated", totalReports: 0 };

  const negativeCount = scam + fake + spam;
  const safeRatio = safe / total;

  let confidence = Math.min(total / 10, 1);

  if (total === 1) {
    if (safe === 1) return { score: 60, label: "Likely Safe", totalReports: 1 };
    return { score: 40, label: "Uncertain", totalReports: 1 };
  }

  let score = safeRatio * 100;
  score = 50 + (score - 50) * confidence;

  let label = "Dangerous";
  if (score >= 75) label = "Trusted";
  else if (score >= 55) label = "Likely Safe";
  else if (score >= 40) label = "Uncertain";
  else if (score >= 25) label = "Suspicious";

  return { score: Math.round(score), label, totalReports: total };
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.use("/api", authMiddleware as any);

  app.post("/api/auth/register", async (req: AuthRequest, res: Response) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const { email, displayName, password } = parsed.data;
      const existing = await getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "Email already registered" });
      }
      const user = await createUser(email, displayName, password);
      const token = await createAuthToken(user.id);
      res.json({
        user: { id: user.id, email: user.email, displayName: user.displayName },
        token,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/auth/login", async (req: AuthRequest, res: Response) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const { email, password } = parsed.data;
      const user = await getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      if (user.isDeleted) {
        return res.status(401).json({ message: "This account has been deleted" });
      }
      const valid = await verifyPassword(user, password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const token = await createAuthToken(user.id);
      res.json({
        user: { id: user.id, email: user.email, displayName: user.displayName },
        token,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/auth/me", async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    res.json({ user: req.user });
  });

  app.post("/api/auth/logout", async (req: AuthRequest, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      await deleteAuthToken(authHeader.slice(7));
    }
    res.json({ success: true });
  });

  app.post("/api/qr/scan", async (req: AuthRequest, res: Response) => {
    try {
      const { content, isAnonymous } = req.body;
      if (!content) return res.status(400).json({ message: "Content required" });
      const contentType = detectContentType(content);
      const qr = await getOrCreateQrCode(content, contentType);
      if (req.user && !isAnonymous) {
        await recordScan(qr.id, req.user.id, false);
      } else if (req.user && isAnonymous) {
        await recordScan(qr.id, req.user.id, true);
      }
      const reportCounts = await getQrCodeReports(qr.id);
      const totalScans = await getTotalScans(qr.id);
      const totalComments = await getTotalComments(qr.id);
      const trustScore = calculateTrustScore(reportCounts);
      res.json({ qrCode: qr, reportCounts, totalScans, totalComments, trustScore });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/qr/decode-image", async (req: AuthRequest, res: Response) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) return res.status(400).json({ message: "Image required" });
      const content = await decodeQrFromImage(imageBase64);
      if (!content) return res.status(404).json({ message: "No QR code found in image" });
      res.json({ content });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/qr/:id", async (req: AuthRequest, res: Response) => {
    try {
      const qr = await getQrCodeById(req.params.id);
      if (!qr) return res.status(404).json({ message: "QR code not found" });
      const reportCounts = await getQrCodeReports(qr.id);
      const totalScans = await getTotalScans(qr.id);
      const totalComments = await getTotalComments(qr.id);
      const trustScore = calculateTrustScore(reportCounts);
      const followCount = await getQrFollowCount(qr.id);
      let userReport = null;
      let isFavorite = false;
      let isFollowing = false;
      if (req.user) {
        userReport = await getUserReport(qr.id, req.user.id);
        isFavorite = await isUserFavorite(qr.id, req.user.id);
        isFollowing = await isUserFollowing(qr.id, req.user.id);
      }
      res.json({
        qrCode: qr,
        reportCounts,
        totalScans,
        totalComments,
        trustScore,
        userReport,
        isFavorite,
        isFollowing,
        followCount,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/qr/:id/comments", async (req: AuthRequest, res: Response) => {
    try {
      const isGuest = !req.user;
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const requestedLimit = Math.max(1, Math.min(50, parseInt(req.query.limit as string) || 20));
      const limit = isGuest ? Math.min(requestedLimit, 6) : requestedLimit;

      const allComments = await getQrCodeComments(req.params.id, offset, limit);
      const totalComments = await getTotalComments(req.params.id);

      const commentsWithLikes = await Promise.all(
        allComments.map(async (comment) => {
          let userLike: "like" | "dislike" | null = null;
          if (req.user) {
            const like = await getUserCommentLike(comment.id, req.user.id);
            if (like) userLike = like.isLike ? "like" : "dislike";
          }
          return { ...comment, userLike };
        })
      );

      res.json({
        comments: commentsWithLikes,
        total: totalComments,
        offset,
        limit,
        hasMore: offset + limit < totalComments,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post(
    "/api/qr/:id/comments",
    requireAuth as any,
    async (req: AuthRequest, res: Response) => {
      try {
        const { text, parentId } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ message: "Comment text required" });
        const comment = await addComment(req.params.id, req.user!.id, text.trim(), parentId);
        res.json({ comment });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    }
  );

  app.post(
    "/api/qr/:id/report",
    requireAuth as any,
    async (req: AuthRequest, res: Response) => {
      try {
        const { reportType } = req.body;
        const validTypes = ["scam", "fake", "spam", "safe"];
        if (!validTypes.includes(reportType)) {
          return res.status(400).json({ message: "Invalid report type" });
        }
        const report = await addReport(req.params.id, req.user!.id, reportType);
        const reportCounts = await getQrCodeReports(req.params.id);
        const trustScore = calculateTrustScore(reportCounts);
        res.json({ report, reportCounts, trustScore });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    }
  );

  app.post(
    "/api/comments/:id/like",
    requireAuth as any,
    async (req: AuthRequest, res: Response) => {
      try {
        const { isLike } = req.body;
        if (typeof isLike !== "boolean") {
          return res.status(400).json({ message: "isLike must be a boolean" });
        }
        const counts = await toggleCommentLike(req.params.id, req.user!.id, isLike);
        res.json(counts);
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    }
  );

  app.post(
    "/api/comments/:id/report",
    requireAuth as any,
    async (req: AuthRequest, res: Response) => {
      try {
        const { reason } = req.body;
        const validReasons = ["inappropriate", "sensitive", "harmful"];
        if (!validReasons.includes(reason)) {
          return res.status(400).json({ message: "Invalid reason. Must be: inappropriate, sensitive, or harmful" });
        }
        const report = await reportComment(req.params.id, req.user!.id, reason);
        const reportCount = await getCommentReportCount(req.params.id);
        res.json({ report, reportCount });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    }
  );

  app.post(
    "/api/qr/:id/favorite",
    requireAuth as any,
    async (req: AuthRequest, res: Response) => {
      try {
        const favorited = await isUserFavorite(req.params.id, req.user!.id);
        if (favorited) {
          await removeFavorite(req.params.id, req.user!.id);
          res.json({ isFavorite: false });
        } else {
          await addFavorite(req.params.id, req.user!.id);
          res.json({ isFavorite: true });
        }
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    }
  );

  app.post(
    "/api/qr/:id/follow",
    requireAuth as any,
    async (req: AuthRequest, res: Response) => {
      try {
        const following = await isUserFollowing(req.params.id, req.user!.id);
        if (following) {
          await removeQrFollow(req.params.id, req.user!.id);
        } else {
          await addQrFollow(req.params.id, req.user!.id);
        }
        const followCount = await getQrFollowCount(req.params.id);
        res.json({ isFollowing: !following, followCount });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    }
  );

  app.get(
    "/api/user/history",
    requireAuth as any,
    async (req: AuthRequest, res: Response) => {
      try {
        const history = await getUserScans(req.user!.id);
        res.json({ history });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    }
  );

  app.get(
    "/api/user/favorites",
    requireAuth as any,
    async (req: AuthRequest, res: Response) => {
      try {
        const favs = await getUserFavorites(req.user!.id);
        res.json({ favorites: favs });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    }
  );

  app.get(
    "/api/user/following",
    requireAuth as any,
    async (req: AuthRequest, res: Response) => {
      try {
        const following = await getUserFollowing(req.user!.id);
        res.json({ following });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    }
  );

  app.get(
    "/api/user/comments",
    requireAuth as any,
    async (req: AuthRequest, res: Response) => {
      try {
        const userComments = await getUserComments(req.user!.id);
        res.json({ comments: userComments });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    }
  );

  app.delete(
    "/api/user/comments",
    requireAuth as any,
    async (req: AuthRequest, res: Response) => {
      try {
        await clearUserComments(req.user!.id);
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    }
  );

  app.post(
    "/api/user/delete-account",
    requireAuth as any,
    async (req: AuthRequest, res: Response) => {
      try {
        await softDeleteUser(req.user!.id);
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          await deleteAuthToken(authHeader.slice(7));
        }
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    }
  );

  app.post("/api/feedback", async (req: AuthRequest, res: Response) => {
    try {
      const { message, email } = req.body;
      if (!message || !message.trim()) {
        return res.status(400).json({ message: "Feedback message required" });
      }
      const userId = req.user?.id || null;
      const fb = await addFeedback(userId, email || null, message.trim());
      res.json({ feedback: fb });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/reported-comments", async (req: AuthRequest, res: Response) => {
    try {
      const reported = await getReportedComments();
      res.json({ reportedComments: reported });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
