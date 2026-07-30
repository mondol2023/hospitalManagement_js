'use strict';

const path = require('path');
const multer = require('multer');

const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * File uploads: avatars, scan images, lab report PDFs.
 *
 * **Memory storage, not disk.** Files are streamed on to Cloudinary (or written
 * by the caller) and never persisted under the app directory. Disk storage would
 * mean attacker-influenced filenames landing on the filesystem of a process that
 * also serves static files — the classic path to an uploaded file being served
 * back as executable content. It also breaks the moment there is more than one
 * instance, since the second one cannot see the first one's disk.
 *
 * **Extension and MIME must agree.** Neither alone is a control: the MIME type
 * is caller-supplied and the extension is cosmetic. Requiring both to map to the
 * same allowed type raises the bar to actually re-encoding the payload.
 *
 * This is still not content inspection. It stops mislabelled files, not a valid
 * JPEG with a malicious payload appended — that is the storage provider's and
 * the viewer's problem, and pretending otherwise here would be false comfort.
 */

const IMAGE_TYPES = Object.freeze({
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
});

const DOCUMENT_TYPES = Object.freeze({
  'application/pdf': ['.pdf'],
});

const SCAN_TYPES = Object.freeze({ ...IMAGE_TYPES, ...DOCUMENT_TYPES });

function buildFileFilter(allowed) {
  const accepted = Object.keys(allowed).join(', ');

  return function fileFilter(req, file, cb) {
    const extensions = allowed[file.mimetype];
    if (!extensions) {
      return cb(ApiError.badRequest(`Unsupported file type. Allowed: ${accepted}`));
    }

    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!extensions.includes(extension)) {
      return cb(ApiError.badRequest(`File extension does not match its type (${file.mimetype})`));
    }

    return cb(null, true);
  };
}

/**
 * @param {object} [options]
 * @param {object} [options.types] mimetype → allowed extensions
 * @param {number} [options.maxFiles] cap on a multi-file field
 */
function createUploader({ types = IMAGE_TYPES, maxFiles = 5 } = {}) {
  return multer({
    storage: multer.memoryStorage(),
    fileFilter: buildFileFilter(types),
    limits: {
      fileSize: env.UPLOAD_MAX_BYTES,
      files: maxFiles,
      // Multipart bodies carry text fields too; without caps a "file upload"
      // endpoint accepts an unbounded number of unbounded form fields.
      fields: 20,
      fieldSize: 100 * 1024,
      parts: 30,
    },
  });
}

const imageUploader = createUploader({ types: IMAGE_TYPES });
const scanUploader = createUploader({ types: SCAN_TYPES });

/** Exactly one image, e.g. a profile photo. */
const singleImage = (field = 'file') => imageUploader.single(field);

/** Several images or PDFs, e.g. attachments on a medical record. */
const manyScans = (field = 'files', maxCount = 5) =>
  createUploader({ types: SCAN_TYPES, maxFiles: maxCount }).array(field, maxCount);

module.exports = {
  createUploader,
  imageUploader,
  scanUploader,
  singleImage,
  manyScans,
  IMAGE_TYPES,
  DOCUMENT_TYPES,
  SCAN_TYPES,
  MulterError: multer.MulterError,
};
