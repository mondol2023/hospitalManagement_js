'use strict';

const cloudinary = require('cloudinary').v2;
const env = require('./env');
const logger = require('./logger');

/**
 * Cloudinary is optional. When credentials are absent the module exports a
 * disabled marker so the upload service can fall back to local storage rather
 * than throwing on every request.
 */

const enabled = Boolean(
  env.CLOUDINARY_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
);

if (enabled) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
} else {
  logger.warn('Cloudinary credentials not set — uploads fall back to local storage');
}

module.exports = { cloudinary, enabled };
