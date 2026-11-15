'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor } = require('../helpers/factories');
const { MedicalRecord, User } = require('../../src/models');
const { ROLES } = require('../../src/utils/constants');
const ApiError = require('../../src/utils/ApiError');
const storage = require('../../src/services/providers/storageProvider');

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const PDF = Buffer.from('%PDF-1.4');

// The provider is the network edge; everything above it runs for real.
beforeEach(() => {
  jest.spyOn(storage, 'upload').mockImplementation(async (file, { folder }) => ({
    url: `https://cdn.test/${folder}/${file.originalname}`,
    label: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
  }));
});

async function recordBy(doctor, patient) {
  return MedicalRecord.create({ patient: patient.profile._id, doctor: doctor.user._id, diagnosis: 'Flu' });
}

describe('POST /medical-records/:id/attachments', () => {
  it('lets the authoring doctor attach scans and PDFs', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    const record = await recordBy(doctor, patient);

    const res = await api()
      .post(url(`/medical-records/${record.id}/attachments`))
      .set(doctor.headers)
      .attach('files', PNG, { filename: 'xray.png', contentType: 'image/png' })
      .attach('files', PDF, { filename: 'lab.pdf', contentType: 'application/pdf' });

    const data = expectOk(res, 201);
    expect(data.attachments.map((a) => a.label)).toEqual(['xray.png', 'lab.pdf']);
    const saved = await MedicalRecord.findById(record.id).lean();
    expect(saved.attachments).toHaveLength(2);
    expect(saved.attachments[0].url).toBe('https://cdn.test/medical-records/xray.png');
  });

  it('refuses a doctor who did not author the record', async () => {
    const author = await createActor(ROLES.DOCTOR);
    const other = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    const record = await recordBy(author, patient);

    const res = await api()
      .post(url(`/medical-records/${record.id}/attachments`))
      .set(other.headers)
      .attach('files', PNG, { filename: 'x.png', contentType: 'image/png' });

    expectError(res, 403);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('refuses non-doctors', async () => {
    const nurse = await createActor(ROLES.NURSE);
    const res = await api()
      .post(url('/medical-records/507f1f77bcf86cd799439011/attachments'))
      .set(nurse.headers)
      .attach('files', PNG, { filename: 'x.png', contentType: 'image/png' });
    expectError(res, 403);
  });

  it('rejects a body with no files', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    const record = await recordBy(doctor, patient);

    const res = await api()
      .post(url(`/medical-records/${record.id}/attachments`))
      .set(doctor.headers);
    expectError(res, 400);
  });

  it('rejects a disallowed file type', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    const record = await recordBy(doctor, patient);

    const res = await api()
      .post(url(`/medical-records/${record.id}/attachments`))
      .set(doctor.headers)
      .attach('files', Buffer.from('MZ'), { filename: 'a.exe', contentType: 'application/x-msdownload' });
    expectError(res, 400);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('refuses to exceed 20 attachments on one record', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    const record = await MedicalRecord.create({
      patient: patient.profile._id,
      doctor: doctor.user._id,
      diagnosis: 'Flu',
      attachments: Array.from({ length: 20 }, (_, i) => ({ url: `https://cdn.test/${i}.png` })),
    });

    const res = await api()
      .post(url(`/medical-records/${record.id}/attachments`))
      .set(doctor.headers)
      .attach('files', PNG, { filename: 'x.png', contentType: 'image/png' });
    expectError(res, 409);
  });

  it('is 503 when storage is not configured', async () => {
    storage.upload.mockRejectedValue(
      ApiError.serviceUnavailable('File storage is not configured', { code: 'STORAGE_DISABLED' })
    );
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);
    const record = await recordBy(doctor, patient);

    const res = await api()
      .post(url(`/medical-records/${record.id}/attachments`))
      .set(doctor.headers)
      .attach('files', PNG, { filename: 'x.png', contentType: 'image/png' });
    expectError(res, 503, 'STORAGE_DISABLED');
  });
});

describe('PUT /patients/me/avatar', () => {
  it('stores the image and points the account at it', async () => {
    const patient = await createActor(ROLES.PATIENT);

    const res = await api()
      .put(url('/patients/me/avatar'))
      .set(patient.headers)
      .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' });

    const data = expectOk(res);
    expect(data.profilePic).toBe('https://cdn.test/avatars/me.png');
    const saved = await User.findById(patient.user.id).lean();
    expect(saved.profilePic).toBe('https://cdn.test/avatars/me.png');
  });

  it('rejects a PDF as an avatar', async () => {
    const patient = await createActor(ROLES.PATIENT);
    const res = await api()
      .put(url('/patients/me/avatar'))
      .set(patient.headers)
      .attach('file', PDF, { filename: 'me.pdf', contentType: 'application/pdf' });
    expectError(res, 400);
  });

  it('rejects a request without a file', async () => {
    const patient = await createActor(ROLES.PATIENT);
    expectError(await api().put(url('/patients/me/avatar')).set(patient.headers), 400);
  });
});
