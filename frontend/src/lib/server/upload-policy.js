/**
 * Pure rules for receipt attachment uploads (CS-02 stop-gap; replaced in B3, NA-04).
 * The file type comes from the file's own bytes, never from the client's MIME type
 * or file name, and the storage key is generated here, never from the file name.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Magic-byte signatures of the allowed types (no SVG/HTML: they can carry active content).
const SIGNATURES = [
  { mime: 'image/jpeg', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/gif', ext: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'application/pdf', ext: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const WEBP_TAG_OFFSET = 8;

function startsWith(bytes, signature, offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

export function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Return { mime, ext } for an allowed file type detected from its bytes, else null. */
export function detectAllowedFileType(bytes) {
  const match = SIGNATURES.find((signature) => startsWith(bytes, signature.bytes));
  if (match) return { mime: match.mime, ext: match.ext };
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, WEBP_TAG_OFFSET)) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

/** Server-generated object key: `{businessId}/{uuid}.{ext}`. */
export function buildReceiptObjectKey(businessId, ext) {
  return `${businessId}/${crypto.randomUUID()}.${ext}`;
}
