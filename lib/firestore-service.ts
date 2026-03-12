import { firestore } from "./firebase";
import {
  doc,
  collection,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit as firestoreLimit,
  startAfter,
  getDocs,
  increment,
  serverTimestamp,
  DocumentSnapshot,
} from "firebase/firestore";
import * as Crypto from "expo-crypto";

export interface QrCodeData {
  id: string;
  content: string;
  contentType: string;
  createdAt: string;
  scanCount: number;
  commentCount: number;
}

export interface CommentItem {
  id: string;
  qrCodeId: string;
  userId: string;
  text: string;
  parentId: string | null;
  isDeleted: boolean;
  likeCount: number;
  dislikeCount: number;
  createdAt: string;
  userLike: "like" | "dislike" | null;
  user: { displayName: string };
}

export interface TrustScore {
  score: number;
  label: string;
  totalReports: number;
}

export function detectContentType(content: string): string {
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

export function calculateTrustScore(reportCounts: Record<string, number>): TrustScore {
  const safe = reportCounts.safe || 0;
  const scam = reportCounts.scam || 0;
  const fake = reportCounts.fake || 0;
  const spam = reportCounts.spam || 0;
  const total = safe + scam + fake + spam;
  if (total === 0) return { score: -1, label: "Unrated", totalReports: 0 };
  if (total === 1) {
    if (safe === 1) return { score: 60, label: "Likely Safe", totalReports: 1 };
    return { score: 40, label: "Uncertain", totalReports: 1 };
  }
  const safeRatio = safe / total;
  const confidence = Math.min(total / 10, 1);
  let score = safeRatio * 100;
  score = 50 + (score - 50) * confidence;
  let label = "Dangerous";
  if (score >= 75) label = "Trusted";
  else if (score >= 55) label = "Likely Safe";
  else if (score >= 40) label = "Uncertain";
  else if (score >= 25) label = "Suspicious";
  return { score: Math.round(score), label, totalReports: total };
}

function tsToString(ts: any): string {
  if (!ts) return new Date().toISOString();
  if (ts.toDate) return ts.toDate().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  return new Date(ts).toISOString();
}

export async function getQrCodeId(content: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    content
  );
  return hash.slice(0, 20);
}

export async function getOrCreateQrCode(content: string): Promise<QrCodeData> {
  const qrId = await getQrCodeId(content);
  const ref = doc(firestore, "qrCodes", qrId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const d = snap.data();
    return {
      id: qrId,
      content: d.content,
      contentType: d.contentType,
      createdAt: tsToString(d.createdAt),
      scanCount: d.scanCount || 0,
      commentCount: d.commentCount || 0,
    };
  }
  const contentType = detectContentType(content);
  await setDoc(ref, {
    content,
    contentType,
    createdAt: serverTimestamp(),
    scanCount: 0,
    commentCount: 0,
  });
  return {
    id: qrId,
    content,
    contentType,
    createdAt: new Date().toISOString(),
    scanCount: 0,
    commentCount: 0,
  };
}

export async function getQrCodeById(qrId: string): Promise<QrCodeData | null> {
  const snap = await getDoc(doc(firestore, "qrCodes", qrId));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: qrId,
    content: d.content,
    contentType: d.contentType,
    createdAt: tsToString(d.createdAt),
    scanCount: d.scanCount || 0,
    commentCount: d.commentCount || 0,
  };
}

export async function recordScan(
  qrId: string,
  content: string,
  contentType: string,
  userId: string | null,
  isAnonymous: boolean
): Promise<void> {
  try {
    await updateDoc(doc(firestore, "qrCodes", qrId), { scanCount: increment(1) });
  } catch {}
  if (userId && !isAnonymous) {
    try {
      await addDoc(collection(firestore, "users", userId, "scans"), {
        qrCodeId: qrId,
        content,
        contentType,
        isAnonymous: false,
        scannedAt: serverTimestamp(),
      });
    } catch {}
  }
}

export async function getUserScans(userId: string): Promise<any[]> {
  const q = query(
    collection(firestore, "users", userId, "scans"),
    orderBy("scannedAt", "desc"),
    firestoreLimit(100)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    scannedAt: tsToString(d.data().scannedAt),
  }));
}

export async function getQrReportCounts(qrId: string): Promise<Record<string, number>> {
  const snap = await getDocs(collection(firestore, "qrCodes", qrId, "reports"));
  const counts: Record<string, number> = {};
  snap.forEach((d) => {
    const { reportType } = d.data();
    counts[reportType] = (counts[reportType] || 0) + 1;
  });
  return counts;
}

export async function getUserQrReport(qrId: string, userId: string): Promise<string | null> {
  const snap = await getDoc(doc(firestore, "qrCodes", qrId, "reports", userId));
  return snap.exists() ? snap.data().reportType : null;
}

export async function reportQrCode(
  qrId: string,
  userId: string,
  reportType: string
): Promise<Record<string, number>> {
  await setDoc(doc(firestore, "qrCodes", qrId, "reports", userId), {
    reportType,
    createdAt: serverTimestamp(),
  });
  return getQrReportCounts(qrId);
}

export async function isUserFavorite(qrId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(doc(firestore, "users", userId, "favorites", qrId));
  return snap.exists();
}

export async function toggleFavorite(
  qrId: string,
  userId: string,
  content: string,
  contentType: string
): Promise<boolean> {
  const isFav = await isUserFavorite(qrId, userId);
  if (isFav) {
    await deleteDoc(doc(firestore, "users", userId, "favorites", qrId));
  } else {
    await setDoc(doc(firestore, "users", userId, "favorites", qrId), {
      qrCodeId: qrId,
      content,
      contentType,
      createdAt: serverTimestamp(),
    });
  }
  return !isFav;
}

export async function getUserFavorites(userId: string): Promise<any[]> {
  const q = query(
    collection(firestore, "users", userId, "favorites"),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: tsToString(d.data().createdAt),
  }));
}

export async function isUserFollowingQr(qrId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(doc(firestore, "qrCodes", qrId, "followers", userId));
  return snap.exists();
}

export async function getFollowCount(qrId: string): Promise<number> {
  const snap = await getDocs(collection(firestore, "qrCodes", qrId, "followers"));
  return snap.size;
}

export async function toggleFollow(
  qrId: string,
  userId: string,
  content: string,
  contentType: string
): Promise<{ isFollowing: boolean; followCount: number }> {
  const following = await isUserFollowingQr(qrId, userId);
  if (following) {
    await deleteDoc(doc(firestore, "qrCodes", qrId, "followers", userId));
    await deleteDoc(doc(firestore, "users", userId, "following", qrId));
  } else {
    await setDoc(doc(firestore, "qrCodes", qrId, "followers", userId), {
      userId,
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(firestore, "users", userId, "following", qrId), {
      qrCodeId: qrId,
      content,
      contentType,
      createdAt: serverTimestamp(),
    });
  }
  const followCount = await getFollowCount(qrId);
  return { isFollowing: !following, followCount };
}

export async function getUserFollowing(userId: string): Promise<any[]> {
  const q = query(
    collection(firestore, "users", userId, "following"),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: tsToString(d.data().createdAt),
  }));
}

export async function getComments(
  qrId: string,
  pageLimit: number = 20,
  lastDoc?: DocumentSnapshot
): Promise<{ comments: CommentItem[]; hasMore: boolean; lastDoc?: DocumentSnapshot }> {
  let q;
  if (lastDoc) {
    q = query(
      collection(firestore, "qrCodes", qrId, "comments"),
      orderBy("createdAt", "desc"),
      startAfter(lastDoc),
      firestoreLimit(pageLimit + 1)
    );
  } else {
    q = query(
      collection(firestore, "qrCodes", qrId, "comments"),
      orderBy("createdAt", "desc"),
      firestoreLimit(pageLimit + 1)
    );
  }
  const snap = await getDocs(q);
  const hasMore = snap.docs.length > pageLimit;
  const docs = hasMore ? snap.docs.slice(0, pageLimit) : snap.docs;
  const comments: CommentItem[] = docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      qrCodeId: qrId,
      userId: data.userId,
      text: data.isDeleted ? "[deleted]" : data.text,
      parentId: data.parentId || null,
      isDeleted: data.isDeleted || false,
      likeCount: data.likeCount || 0,
      dislikeCount: data.dislikeCount || 0,
      createdAt: tsToString(data.createdAt),
      userLike: null,
      user: { displayName: data.isDeleted ? "[deleted]" : (data.userDisplayName || "User") },
    };
  });
  return { comments, hasMore, lastDoc: docs[docs.length - 1] };
}

export async function addComment(
  qrId: string,
  userId: string,
  displayName: string,
  text: string,
  parentId: string | null = null
): Promise<CommentItem> {
  const ref = collection(firestore, "qrCodes", qrId, "comments");
  const docRef = await addDoc(ref, {
    userId,
    userDisplayName: displayName,
    text,
    parentId,
    isDeleted: false,
    likeCount: 0,
    dislikeCount: 0,
    createdAt: serverTimestamp(),
  });
  try {
    await updateDoc(doc(firestore, "qrCodes", qrId), { commentCount: increment(1) });
  } catch {}
  try {
    await setDoc(doc(firestore, "users", userId, "comments", docRef.id), {
      commentId: docRef.id,
      qrCodeId: qrId,
      text,
      createdAt: serverTimestamp(),
    });
  } catch {}
  return {
    id: docRef.id,
    qrCodeId: qrId,
    userId,
    text,
    parentId,
    isDeleted: false,
    likeCount: 0,
    dislikeCount: 0,
    createdAt: new Date().toISOString(),
    userLike: null,
    user: { displayName },
  };
}

export async function toggleCommentLike(
  qrId: string,
  commentId: string,
  userId: string,
  isLike: boolean
): Promise<{ likes: number; dislikes: number }> {
  const likeRef = doc(firestore, "qrCodes", qrId, "comments", commentId, "likes", userId);
  const commentRef = doc(firestore, "qrCodes", qrId, "comments", commentId);
  const existing = await getDoc(likeRef);
  if (existing.exists()) {
    const wasLike = existing.data().isLike;
    if (wasLike === isLike) {
      await deleteDoc(likeRef);
      await updateDoc(commentRef, { [isLike ? "likeCount" : "dislikeCount"]: increment(-1) });
    } else {
      await setDoc(likeRef, { isLike, createdAt: serverTimestamp() });
      await updateDoc(commentRef, {
        likeCount: increment(isLike ? 1 : -1),
        dislikeCount: increment(isLike ? -1 : 1),
      });
    }
  } else {
    await setDoc(likeRef, { isLike, createdAt: serverTimestamp() });
    await updateDoc(commentRef, { [isLike ? "likeCount" : "dislikeCount"]: increment(1) });
  }
  const updated = await getDoc(commentRef);
  if (updated.exists()) {
    return { likes: updated.data().likeCount || 0, dislikes: updated.data().dislikeCount || 0 };
  }
  return { likes: 0, dislikes: 0 };
}

export async function reportComment(
  qrId: string,
  commentId: string,
  userId: string,
  reason: string
): Promise<void> {
  await setDoc(
    doc(firestore, "qrCodes", qrId, "comments", commentId, "reports", userId),
    { reason, createdAt: serverTimestamp() }
  );
}

export async function softDeleteComment(
  qrId: string,
  commentId: string,
  userId: string
): Promise<void> {
  const ref = doc(firestore, "qrCodes", qrId, "comments", commentId);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().userId === userId) {
    await updateDoc(ref, { isDeleted: true, text: "" });
    try {
      await deleteDoc(doc(firestore, "users", userId, "comments", commentId));
    } catch {}
  }
}

export async function getUserComments(userId: string): Promise<any[]> {
  const q = query(
    collection(firestore, "users", userId, "comments"),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: tsToString(d.data().createdAt),
  }));
}

export async function submitFeedback(
  userId: string | null,
  email: string | null,
  message: string
): Promise<void> {
  await addDoc(collection(firestore, "feedback"), {
    userId,
    email,
    message,
    createdAt: serverTimestamp(),
  });
}

export async function deleteUserAccount(userId: string): Promise<void> {
  await updateDoc(doc(firestore, "users", userId), {
    isDeleted: true,
    deletedAt: serverTimestamp(),
  });
}

export async function loadQrDetail(qrId: string, userId: string | null) {
  const [qrCode, reportCounts, followersSnap] = await Promise.all([
    getQrCodeById(qrId),
    getQrReportCounts(qrId),
    getDocs(collection(firestore, "qrCodes", qrId, "followers")),
  ]);
  if (!qrCode) return null;
  const followCount = followersSnap.size;
  const trustScore = calculateTrustScore(reportCounts);
  let userReport: string | null = null;
  let isFavorite = false;
  let isFollowing = false;
  if (userId) {
    [userReport, isFavorite, isFollowing] = await Promise.all([
      getUserQrReport(qrId, userId),
      isUserFavorite(qrId, userId),
      isUserFollowingQr(qrId, userId),
    ]);
  }
  return {
    qrCode,
    reportCounts,
    totalScans: qrCode.scanCount,
    totalComments: qrCode.commentCount,
    trustScore,
    followCount,
    userReport,
    isFavorite,
    isFollowing,
  };
}
