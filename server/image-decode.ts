export async function decodeQrFromImage(base64Data: string): Promise<string | null> {
  try {
    const { Jimp } = await import("jimp");
    const jsQR = (await import("jsqr")).default;

    const buffer = Buffer.from(base64Data, "base64");
    let image = await Jimp.read(buffer);

    // Resize large images to improve jsQR decode speed and reliability
    const maxDim = 1200;
    if (image.bitmap.width > maxDim || image.bitmap.height > maxDim) {
      const scale = maxDim / Math.max(image.bitmap.width, image.bitmap.height);
      image = image.resize({ w: Math.round(image.bitmap.width * scale), h: Math.round(image.bitmap.height * scale) });
    }

    const { width, height } = image.bitmap;
    // Safely convert Node.js Buffer to Uint8ClampedArray that jsQR expects (RGBA)
    const bitmapBuf: Buffer = image.bitmap.data as unknown as Buffer;
    const data = new Uint8ClampedArray(bitmapBuf.buffer, bitmapBuf.byteOffset, bitmapBuf.byteLength);

    const code = jsQR(data, width, height, {
      inversionAttempts: "attemptBoth",
    });

    return code ? code.data : null;
  } catch (e) {
    console.error("QR decode error:", e);
    return null;
  }
}
