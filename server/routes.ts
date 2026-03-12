import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { decodeQrFromImage } from "./image-decode";

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/qr/decode-image", async (req: Request, res: Response) => {
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

  const httpServer = createServer(app);
  return httpServer;
}
