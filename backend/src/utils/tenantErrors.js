'use strict';

/** Thrown by `context.set` / `context.require` when no request store exists. */
class ContextMissingError extends Error {
  constructor(message = 'No request context is active') {
    super(message);
    this.name = 'ContextMissingError';
    this.code = 'CONTEXT_MISSING';
  }
}

/**
 * Thrown by the tenantScoped plugin when a query runs with no tenant and no
 * explicit bypass. Deliberately a plain Error (surfaces as a 500): a missing
 * tenant is a programming error, never a client error.
 */
class TenantContextMissingError extends Error {
  constructor(message = 'Tenant context is missing for a tenant-scoped operation') {
    super(message);
    this.name = 'TenantContextMissingError';
    this.code = 'TENANT_CONTEXT_MISSING';
  }
}

/**
 * Thrown by the tenantScoped plugin when an operation would cross tenants: a
 * document for another organisation, an update that moves a document, or a
 * pipeline stage that writes outside the filter. A programming error, so it
 * stays a plain Error (a 500), never a client error.
 */
class TenantViolationError extends Error {
  constructor(message = 'Operation would cross a tenant boundary') {
    super(message);
    this.name = 'TenantViolationError';
    this.code = 'TENANT_VIOLATION';
  }
}

module.exports = { ContextMissingError, TenantContextMissingError, TenantViolationError };
