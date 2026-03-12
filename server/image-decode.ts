export async function decodeQrFromImage(base64Data: string): Promise<string | null> {
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
