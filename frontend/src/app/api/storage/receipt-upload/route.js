import { NextResponse } from 'next/server';
import { createSSRClient } from '@/lib/supabase/server';
import { createServerAdminClient } from '@/lib/supabase/serverAdminClient';
import { fetchBackendAsCaller } from '@/lib/server/backend';
import {
  buildReceiptObjectKey,
  detectAllowedFileType,
  isUuid,
} from '@/lib/server/upload-policy';
import { enforceSameOrigin } from '@/lib/utils/origin';

const MAX_FILE_SIZE = 20971520; // 20 MB, same as the bucket limit
const RECEIPTS_BUCKET = 'receipts';
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * POST /api/storage/receipt-upload  (multipart: businessId, file)
 * Stop-gap hardening (CS-02); the attachment design replaces it in B3 (NA-04).
 */
export async function POST(request) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;

  const supabase = await createSSRClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  // Unknown, foreign and malformed business ids all answer 404 (no existence oracle).
  const businessId = formData.get('businessId');
  if (!isUuid(businessId)) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  }
  const access = await fetchBackendAsCaller(request, `/api/v1/businesses/${businessId}`);
  if (!access.ok) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds 20 MB limit' }, { status: 413 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const fileType = detectAllowedFileType(fileBuffer);
  if (!fileType) {
    return NextResponse.json(
      { error: 'File type not allowed. Accepted: JPEG, PNG, WebP, GIF, PDF' },
      { status: 415 },
    );
  }

  const path = buildReceiptObjectKey(businessId, fileType.ext);
  const adminClient = await createServerAdminClient();
  const { error: uploadError } = await adminClient.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, fileBuffer, { contentType: fileType.mime, upsert: false });
  if (uploadError) {
    console.error('Receipt upload error:', uploadError.message);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  const { data: signed, error: signError } = await adminClient.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError) {
    console.error('Receipt signed URL error:', signError.message);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl, path });
}
