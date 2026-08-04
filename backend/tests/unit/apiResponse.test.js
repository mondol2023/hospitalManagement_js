'use strict';

const { sendSuccess, sendCreated, sendPage, sendNoContent, toWire } = require('../../src/utils/apiResponse');

/**
 * The response envelope, tested at the only place its rules are actually
 * decided.
 *
 * `toWire` is the reason this file exists. It is the single point where a
 * document's persistence shape (`_id`, `__v`) becomes its wire shape (`id`), and
 * it runs on *every* response body in the API — so a mistake here is not one
 * broken endpoint, it is a contract change across all of them, of the silent
 * kind: the request still returns 200, the client just stops finding the field
 * it keys on. The integration suites assert `id` on the handful of payloads they
 * touch. That samples the behaviour; it does not pin it.
 *
 * The awkward inputs are the point. A lean read is a plain object, a hydrated
 * one defines `toJSON`, an ObjectId defines a `toJSON` that returns a string,
 * and a Date defines one that returns a string too — all four arrive here
 * through the same call, nested arbitrarily deep inside each other.
 */

const fakeRes = () => {
  const res = {
    statusCode: undefined,
    body: undefined,
  };
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body) => {
    res.body = body;
    return res;
  });
  res.send = jest.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
};

describe('toWire — the persistence-to-wire rename', () => {
  it('renames _id and drops __v', () => {
    expect(toWire({ _id: 'abc', __v: 3, name: 'Ada' })).toEqual({ id: 'abc', name: 'Ada' });
  });

  it('reaches documents nested at any depth, including inside arrays', () => {
    // A populated `primaryDoctor` is a document inside a document; a patient list
    // is documents inside an array inside the body. One missed branch and half a
    // response speaks `_id` while the other half speaks `id`.
    const wired = toWire({
      _id: 'patient-1',
      primaryDoctor: { _id: 'doctor-1', __v: 0 },
      assignedNurses: [{ _id: 'nurse-1' }, { _id: 'nurse-2', ward: { _id: 'ward-1' } }],
    });

    expect(wired).toEqual({
      id: 'patient-1',
      primaryDoctor: { id: 'doctor-1' },
      assignedNurses: [{ id: 'nurse-1' }, { id: 'nurse-2', ward: { id: 'ward-1' } }],
    });
  });

  it('defers to a value that defines its own wire form', () => {
    // Mongoose documents, ObjectIds, Dates and Decimal128 all do. Walking their
    // internals instead would leak `$__`, `_doc` and friends into the response.
    const date = new Date('2026-01-02T03:04:05.000Z');
    const objectId = { toJSON: () => '507f1f77bcf86cd799439011' };
    const doc = { toJSON: () => ({ _id: 'doc-1', __v: 7, name: 'Ada' }) };

    expect(toWire({ date, objectId, doc })).toEqual({
      date: date.toJSON(),
      objectId: '507f1f77bcf86cd799439011',
      doc: { id: 'doc-1', name: 'Ada' },
    });
  });

  it('does not loop on a toJSON that returns the object itself', () => {
    // `json !== value` is load-bearing: without it this recurses until the stack
    // gives out, and a self-returning toJSON is exactly what a naive
    // `toJSON() { return this; }` on a plain class produces.
    class SelfReturning {
      constructor(id) {
        this._id = id;
      }

      toJSON() {
        return this;
      }
    }

    // A class, not an object literal: `toJSON` has to live on the prototype the
    // way Mongoose's does, or the property walk below would copy the method
    // itself into the response — which is a different bug from the one this
    // guards.
    expect(toWire(new SelfReturning('x'))).toEqual({ id: 'x' });
  });

  it('lets an explicit id win over _id', () => {
    // A hydrated document has already made the substitution. Overwriting it with
    // the raw `_id` would undo a transform that may have done more than rename.
    expect(toWire({ _id: 'raw', id: 'already-transformed' })).toEqual({ id: 'already-transformed' });
  });

  it('passes primitives and empty containers through untouched', () => {
    for (const value of ['text', 42, 0, true, false, null, undefined]) {
      expect(toWire(value)).toBe(value);
    }
    expect(toWire([])).toEqual([]);
    expect(toWire({})).toEqual({});
  });

  it('keeps falsy and empty fields rather than pruning them', () => {
    // `dischargedAt: null` and `balance: 0` are answers. Dropping them would make
    // a client unable to tell "not discharged" from "field not returned".
    expect(toWire({ _id: 'a', dischargedAt: null, balance: 0, notes: '', tags: [] })).toEqual({
      id: 'a',
      dischargedAt: null,
      balance: 0,
      notes: '',
      tags: [],
    });
  });

  it('does not mutate what it was given', () => {
    // The caller usually hands over a document it still holds a reference to.
    const source = { _id: 'a', __v: 1, nested: { _id: 'b' } };
    toWire(source);
    expect(source).toEqual({ _id: 'a', __v: 1, nested: { _id: 'b' } });
  });
});

describe('sendSuccess', () => {
  it('wraps the payload in the envelope with a 200 by default', () => {
    const res = fakeRes();
    sendSuccess(res, { data: { _id: 'a' } });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: { id: 'a' } });
  });

  it('answers with a null payload rather than an absent one', () => {
    // `data` is always present on a success, so a client can read `body.data`
    // without first checking whether the key exists.
    const res = fakeRes();
    sendSuccess(res);
    expect(res.body).toEqual({ success: true, data: null });
  });

  it('emits the message when one is given', () => {
    // This is the regression: nine controllers passed `message` and it was being
    // dropped here, so every confirmation reached the client as `data: null`
    // with nothing to show the user.
    const res = fakeRes();
    sendSuccess(res, { message: 'Marked as read' });
    expect(res.body).toEqual({ success: true, data: null, message: 'Marked as read' });
  });

  it('omits message and meta when they carry nothing', () => {
    const res = fakeRes();
    sendSuccess(res, { data: 1, message: '', meta: undefined });
    expect(res.body).toEqual({ success: true, data: 1 });
    expect(Object.keys(res.body)).toEqual(['success', 'data']);
  });

  it('honours an explicit status', () => {
    const res = fakeRes();
    sendSuccess(res, { data: null, status: 202 });
    expect(res.statusCode).toBe(202);
  });

  it('returns whatever res.json returned, so a controller can `return` it', () => {
    const res = fakeRes();
    expect(sendSuccess(res, { data: null })).toBe(res);
  });
});

describe('sendCreated', () => {
  it('is a 201 with the same envelope', () => {
    const res = fakeRes();
    sendCreated(res, { _id: 'new-1', __v: 0 });

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, data: { id: 'new-1' } });
  });
});

describe('sendPage', () => {
  it('puts the rows in data and the counters in meta', () => {
    // Pagination belongs beside the payload, not inside it: a client mapping
    // `data` must not have to step over a `pagination` key first.
    const res = fakeRes();
    const pagination = { total: 45, page: 2, limit: 20, totalPages: 3, hasNextPage: true, hasPrevPage: true };
    sendPage(res, { items: [{ _id: 'a' }, { _id: 'b' }], pagination });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ id: 'a' }, { id: 'b' }], meta: { pagination } });
  });

  it('still sends an envelope for an empty page', () => {
    const res = fakeRes();
    sendPage(res, { items: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } });
    expect(res.body.data).toEqual([]);
    expect(res.body.success).toBe(true);
  });
});

describe('sendNoContent', () => {
  it('sends a bodiless 204', () => {
    // A 204 with a JSON body is a protocol violation some proxies will strip and
    // others will pass on, which makes it fail in staging and not in dev.
    const res = fakeRes();
    sendNoContent(res);

    expect(res.statusCode).toBe(204);
    expect(res.json).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith();
  });
});
