'use strict';

const context = require('../../src/utils/context');
const { ContextMissingError, TenantContextMissingError } = require('../../src/utils/tenantErrors');

describe('request context', () => {
  afterEach(() => {
    context.clearTestDefault();
  });

  it('run exposes the store to async continuations', async () => {
    await context.run({ organizationId: 'o1' }, async () => {
      await new Promise((r) => setImmediate(r));
      expect(context.get().organizationId).toBe('o1');
    });
  });

  it('set merges into the current store and throws without one', () => {
    expect(() => context.set({ a: 1 })).toThrow(ContextMissingError);
    context.run({ a: 1 }, () => {
      context.set({ b: 2 });
      expect(context.get()).toMatchObject({ a: 1, b: 2 });
    });
  });

  it('require throws without a store and returns it with one', () => {
    expect(() => context.require()).toThrow(ContextMissingError);
    context.run({ a: 1 }, () => expect(context.require().a).toBe(1));
  });

  it('nested runAs does not leak to the outer scope', () => {
    context.run({ organizationId: 'o1' }, () => {
      context.runAs({ organizationId: 'o2', branchId: 'b2' }, () => {
        expect(context.get()).toMatchObject({
          organizationId: 'o2',
          branchId: 'b2',
          source: 'job',
          canReadAllBranches: false,
          defaultBranchRead: 'active',
        });
      });
      expect(context.get().organizationId).toBe('o1');
    });
  });

  it('withoutTenant sets bypass with its reason and works with no store', () => {
    context.withoutTenant('why', () =>
      expect(context.get()).toMatchObject({ bypassTenant: true, bypassReason: 'why' })
    );
  });

  it('withoutTenant keeps the surrounding store fields and leaves the outer store untouched', () => {
    context.run({ organizationId: 'o1' }, () => {
      context.withoutTenant('why', () => expect(context.get().organizationId).toBe('o1'));
      expect(context.get().bypassTenant).toBeUndefined();
    });
  });

  it('test default applies only with no store, and only after setTestDefault', () => {
    expect(context.get()).toBeUndefined();
    context.setTestDefault({ organizationId: 'T' });
    expect(context.get().organizationId).toBe('T');
    context.run({ organizationId: 'X' }, () => expect(context.get().organizationId).toBe('X'));
    context.clearTestDefault();
    expect(context.get()).toBeUndefined();
  });

  it('setTestDefault and clearTestDefault throw when NODE_ENV is not test', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => context.setTestDefault({ organizationId: 'T' })).toThrow();
      expect(() => context.clearTestDefault()).toThrow();
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe('tenant errors', () => {
  it('TenantContextMissingError carries its code and is a plain Error', () => {
    const err = new TenantContextMissingError();
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('TENANT_CONTEXT_MISSING');
    expect(err.statusCode).toBeUndefined();
  });
});

describe('logger tenant format', () => {
  it('copies requestId, organizationId and branchId from the store onto the entry', () => {
    const { tenantContextFormat } = require('../../src/config/logger');
    const run = (info) => tenantContextFormat().transform(info);
    context.run({ requestId: 'r1', organizationId: 'o1', branchId: 'b1' }, () => {
      expect(run({ level: 'info', message: 'x' })).toMatchObject({
        requestId: 'r1',
        organizationId: 'o1',
        branchId: 'b1',
      });
    });
    expect(run({ level: 'info', message: 'x' })).not.toHaveProperty('organizationId');
  });
});
