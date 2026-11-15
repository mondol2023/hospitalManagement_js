'use strict';

const env = require('../../config/env');
const logger = require('../../config/logger');
const ApiError = require('../../utils/ApiError');

// Cloudinary is the only backend; uploads answer 503 until it is configured.
class StorageProvider {
  constructor(config = env, loadSdk = () => require('cloudinary').v2) { // eslint-disable-line global-require
    this.config = config;
    this.loadSdk = loadSdk;
    this._sdk = null;
  }

  get isEnabled() {
    const { CLOUDINARY_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = this.config;
    return Boolean(CLOUDINARY_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
  }

  sdk() {
    if (this._sdk) return this._sdk;
    this._sdk = this.loadSdk();
    this._sdk.config({
      cloud_name: this.config.CLOUDINARY_NAME,
      api_key: this.config.CLOUDINARY_API_KEY,
      api_secret: this.config.CLOUDINARY_API_SECRET,
      secure: true,
    });
    return this._sdk;
  }

  /** @param {{buffer: Buffer, mimetype: string, originalname: string, size: number}} file */
  async upload(file, { folder }) {
    if (!this.isEnabled) {
      throw ApiError.serviceUnavailable('File storage is not configured', { code: 'STORAGE_DISABLED' });
    }
    try {
      const result = await new Promise((resolve, reject) => {
        this.sdk()
          .uploader.upload_stream({ folder, resource_type: 'auto' }, (error, res) =>
            error ? reject(error) : resolve(res)
          )
          .end(file.buffer);
      });
      return {
        url: result.secure_url,
        label: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      };
    } catch (error) {
      logger.error('File upload failed', { folder, error: error.message });
      throw new ApiError(502, 'File storage failed', { code: 'STORAGE_FAILED', cause: error });
    }
  }
}

module.exports = new StorageProvider();
module.exports.StorageProvider = StorageProvider;
