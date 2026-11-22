import { describe, expect, it } from 'vitest';

import { checkAttachments } from './attachments';

const file = (name: string, type: string, bytes = 10) =>
  new File([new Uint8Array(bytes)], name, { type });

const MB = 1024 * 1024;

describe('checkAttachments', () => {
  it('lets images and PDFs through', () => {
    const files = [file('xray.png', 'image/png'), file('letter.pdf', 'application/pdf')];
    expect(checkAttachments(files, 0)).toEqual({ ok: true, files });
  });

  it('rejects more than five files at once', () => {
    const files = Array.from({ length: 6 }, (_, i) => file(`s${i}.png`, 'image/png'));
    expect(checkAttachments(files, 0)).toEqual({
      ok: false,
      message: 'Pick up to 5 files at a time.',
    });
  });

  it('rejects a file that is neither an image nor a PDF, and names it', () => {
    expect(checkAttachments([file('notes.docx', 'application/msword')], 0)).toEqual({
      ok: false,
      message: 'notes.docx is not an image or a PDF.',
    });
  });

  it('rejects a file over 5 MB, and names it', () => {
    expect(checkAttachments([file('scan.png', 'image/png', 5 * MB + 1)], 0)).toEqual({
      ok: false,
      message: 'scan.png is larger than 5 MB.',
    });
  });

  it('accepts a file of exactly 5 MB', () => {
    const files = [file('scan.png', 'image/png', 5 * MB)];
    expect(checkAttachments(files, 0).ok).toBe(true);
  });

  // 20 is a ceiling per record, so what is already attached counts.
  it('rejects an upload that would take the record past 20 files', () => {
    expect(
      checkAttachments([file('a.png', 'image/png'), file('b.png', 'image/png')], 19)
    ).toEqual({ ok: false, message: 'This record has room for 1 more file.' });
  });

  it('says so plainly when the record is already full', () => {
    expect(checkAttachments([file('a.png', 'image/png')], 20)).toEqual({
      ok: false,
      message: 'This record already holds the maximum of 20 files.',
    });
  });

  it('does nothing for an empty pick', () => {
    expect(checkAttachments([], 3)).toEqual({ ok: false, message: '' });
  });
});
