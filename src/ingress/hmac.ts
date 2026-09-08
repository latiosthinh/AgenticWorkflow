import crypto from 'node:crypto';

export function verifyHmac(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!rawBody || !signatureHeader || !secret) {
    return false;
  }

  const cleanSig = signatureHeader.replace(/^sha256=/i, '').trim();
  if (!cleanSig) {
    return false;
  }

  const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expectedHex, 'hex');
  const providedBuffer = Buffer.from(cleanSig, 'hex');

  // Explicit length guard prevents RangeError crash in crypto.timingSafeEqual
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}
