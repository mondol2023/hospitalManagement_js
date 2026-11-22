import { ATTACHMENT_LIMITS } from '@/features/patients';

export type AttachmentCheck = { ok: true; files: File[] } | { ok: false; message: string };

const accepted: readonly string[] = ATTACHMENT_LIMITS.accept;
const maxMb = ATTACHMENT_LIMITS.maxBytes / (1024 * 1024);

/**
 * The same limits the backend enforces, checked before the upload so a wrong
 * file is turned away on the spot rather than after the round trip. The backend
 * still decides: a limit raised on the server only makes this check stricter.
 *
 * `alreadyAttached` is what the record holds now — 20 is a ceiling per record,
 * not per request.
 */
export function checkAttachments(files: readonly File[], alreadyAttached: number): AttachmentCheck {
  if (files.length === 0) return { ok: false, message: '' };

  if (files.length > ATTACHMENT_LIMITS.perRequest) {
    return { ok: false, message: `Pick up to ${ATTACHMENT_LIMITS.perRequest} files at a time.` };
  }

  for (const file of files) {
    if (!accepted.includes(file.type)) {
      return { ok: false, message: `${file.name} is not an image or a PDF.` };
    }
    if (file.size > ATTACHMENT_LIMITS.maxBytes) {
      return { ok: false, message: `${file.name} is larger than ${maxMb} MB.` };
    }
  }

  const room = ATTACHMENT_LIMITS.perRecord - alreadyAttached;
  if (room <= 0) {
    return {
      ok: false,
      message: `This record already holds the maximum of ${ATTACHMENT_LIMITS.perRecord} files.`,
    };
  }
  if (files.length > room) {
    return { ok: false, message: `This record has room for ${room} more ${room === 1 ? 'file' : 'files'}.` };
  }

  return { ok: true, files: [...files] };
}
