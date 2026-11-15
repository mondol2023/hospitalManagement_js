'use strict';

const handle = require('../../src/utils/handle');

function fakeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}
const flush = () => new Promise(setImmediate);

describe('handle', () => {
  it('wraps the result as a 200 success envelope', async () => {
    const res = fakeRes();
    handle((req) => ({ id: req.params.id }))({ params: { id: 'a' } }, res, jest.fn());
    await flush();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'a' } });
  });

  it('handle.created answers 201', async () => {
    const res = fakeRes();
    handle.created(() => ({ ok: 1 }))({}, res, jest.fn());
    await flush();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('handle.page hoists pagination into meta', async () => {
    const res = fakeRes();
    const pagination = { page: 1 };
    handle.page(() => ({ items: [1], pagination }))({}, res, jest.fn());
    await flush();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [1], meta: { pagination } });
  });

  it('forwards a rejection to next()', async () => {
    const next = jest.fn();
    const boom = new Error('boom');
    handle(() => Promise.reject(boom))({}, fakeRes(), next);
    await flush();
    expect(next).toHaveBeenCalledWith(boom);
  });
});
