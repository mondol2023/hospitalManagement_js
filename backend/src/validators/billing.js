'use strict';

const {
  z,
  objectId,
  objectIdOrSelf,
  idParam,
  listQuery,
  shortText,
  optionalText,
  dateValue,
  dateRange,
  minorUnits,
  boolish,
  nonEmptyPatch,
} = require('./common');
const { BILL_STATUS_VALUES, PAYMENT_METHOD_VALUES } = require('../utils/constants');

/**
 * Invoicing and collection.
 *
 * Every amount here is `minorUnits` — an integer number of cents. `12.5` is not
 * twelve and a half cents, it is a client that has sent dollars to a cents
 * field, and rounding it somewhere downstream is how a ledger stops balancing.
 * The service rejects non-integers too; this schema makes the rejection a
 * field-level 422 that names the line item.
 *
 * `totalCents`, `paidCents`, `status` and `invoiceNumber` appear on no schema:
 * the first three are derived by the model from the line items, and the fourth
 * is the document's identity.
 */

const lineItem = z.object({
  description: shortText(300),
  code: shortText(60).optional(),
  quantity: z.coerce.number().int().min(1).max(10_000).optional(),
  unitPriceCents: minorUnits,
});

const items = z.array(lineItem).min(1).max(200);

const terms = {
  taxCents: minorUnits.optional(),
  discountCents: minorUnits.optional(),
  dueDate: dateValue.optional(),
  notes: optionalText(1000),
  isDraft: z.boolean().optional(),
};

const list = {
  query: listQuery({
    search: shortText(120).optional(),
    status: z.enum(BILL_STATUS_VALUES).optional(),
    patientId: objectId.optional(),
    overdue: boolish.optional(),
  }),
};

const listForPatient = {
  params: z.object({ patientId: objectIdOrSelf }),
  // `open`: bills that still owe something (unpaid or part-paid). Overrides `status`.
  query: listQuery({ status: z.enum(BILL_STATUS_VALUES).optional(), open: boolish.optional() }),
};

const outstanding = { query: listQuery({}) };

const revenue = { query: dateRange() };

const byId = { params: idParam() };

const byInvoiceNumber = { params: z.object({ invoiceNumber: shortText(60) }) };

const create = {
  body: z.object({
    patientId: objectId,
    items,
    currency: z.string().trim().toUpperCase().length(3).optional(),
    ...terms,
  }),
};

/** Sweeps the patient's unbilled chargeable services onto one invoice. */
const buildFromCare = {
  params: z.object({ patientId: objectId }),
  body: z.object(terms),
};

const addItems = {
  params: idParam(),
  body: z.object({ items }),
};

/** Line items are replaced wholesale — a partial edit of a priced list is ambiguous. */
const update = {
  params: idParam(),
  body: nonEmptyPatch(
    z.object({
      items: items.optional(),
      taxCents: minorUnits.optional(),
      discountCents: minorUnits.optional(),
      dueDate: dateValue.optional(),
      notes: optionalText(1000),
    })
  ),
};

const voidBill = {
  params: idParam(),
  body: z.object({ reason: optionalText(500) }),
};

const pay = {
  params: idParam(),
  body: z.object({
    amountCents: minorUnits.refine((value) => value > 0, {
      message: 'A payment must be a positive amount',
    }),
    method: z.enum(PAYMENT_METHOD_VALUES),
    transactionId: shortText(120).optional(),
    metadata: z.record(z.string().max(500)).optional(),
  }),
};

/**
 * `amountCents` is optional: omitting it reverses the payment in full, which is
 * the common case and should not require the caller to look the figure up first.
 */
const refund = {
  params: idParam(),
  body: z.object({
    transactionId: shortText(120),
    amountCents: minorUnits.optional(),
    reason: optionalText(500),
  }),
};

module.exports = {
  list,
  listForPatient,
  outstanding,
  revenue,
  byId,
  byInvoiceNumber,
  create,
  buildFromCare,
  addItems,
  update,
  voidBill,
  pay,
  refund,
};
