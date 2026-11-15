'use strict';

const { StorageProvider } = require('../../src/services/providers/storageProvider');

const CONFIGURED = { CLOUDINARY_NAME: 'demo', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' };
const file = { buffer: Buffer.from('x'), mimetype: 'image/png', originalname: 'scan.png', size: 1 };

function fakeSdk(result = { secure_url: 'https://cdn.test/scan.png' }) {
  const upload_stream = jest.fn((options, done) => ({ end: () => done(null, result) }));
  const config = jest.fn();
  return { sdk: { config, uploader: { upload_stream } }, upload_stream, config };
}

describe('StorageProvider', () => {
  it('is disabled until all three Cloudinary credentials are set', () => {
    expect(new StorageProvider({ CLOUDINARY_NAME: 'demo' }).isEnabled).toBe(false);
    expect(new StorageProvider(CONFIGURED).isEnabled).toBe(true);
  });

  it('rejects with 503 STORAGE_DISABLED when unconfigured', async () => {
    const storage = new StorageProvider({});
    await expect(storage.upload(file, { folder: 'x' })).rejects.toMatchObject({
      statusCode: 503,
      code: 'STORAGE_DISABLED',
    });
  });

  it('uploads into the folder and returns the attachment shape', async () => {
    const { sdk, upload_stream, config } = fakeSdk();
    const storage = new StorageProvider(CONFIGURED, () => sdk);

    const stored = await storage.upload(file, { folder: 'medical-records' });

    expect(config).toHaveBeenCalledWith(expect.objectContaining({ cloud_name: 'demo', secure: true }));
    expect(upload_stream).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'medical-records', resource_type: 'auto' }),
      expect.any(Function)
    );
    expect(stored).toEqual({
      url: 'https://cdn.test/scan.png',
      label: 'scan.png',
      mimeType: 'image/png',
      sizeBytes: 1,
    });
  });

  it('surfaces an SDK failure as a 502', async () => {
    const sdk = {
      config: jest.fn(),
      uploader: { upload_stream: (o, done) => ({ end: () => done(new Error('boom')) }) },
    };
    const storage = new StorageProvider(CONFIGURED, () => sdk);
    await expect(storage.upload(file, { folder: 'x' })).rejects.toMatchObject({ statusCode: 502 });
  });
});
