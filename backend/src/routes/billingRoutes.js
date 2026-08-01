'use strict';

const express = require('express');

const { authenticate, authorize, loadPatient, validate } = require('../middleware');
const { ROLES } = require('../utils/constants');
const schemas = require('../validators/billing');
const controller = require('../controllers/billingController');

/**
 * Reading a bill and moving money are two different authorities.
 *
 * A patient reaches `/patient/:patientId` and `/:id` for their own invoices —
 * `billingService._assertCanRead` decides whose those are, so the route does not
 * try to. Everything that raises, edits, collects or reverses is restricted to
 * the billing roles, and refunds are narrower still: a receptionist takes money
 * at the desk all day, but sending it back out has no counterparty check, so it
 * stays with finance.
 *
 * Clinicians are deliberately absent from the write side. They treat patients;
 * they do not invoice them.
 */
const router = express.Router();

router.use(authenticate);

const billing = authorize(ROLES.ACCOUNTANT, ROLES.RECEPTIONIST, ROLES.ADMIN, ROLES.MANAGER);
const finance = authorize(ROLES.ACCOUNTANT, ROLES.ADMIN, ROLES.MANAGER);

// Fixed segments before `/:id`.
router.get('/payment-methods', billing, controller.paymentMethods);
router.get('/outstanding', billing, validate(schemas.outstanding), controller.outstanding);
router.get('/revenue', finance, validate(schemas.revenue), controller.revenue);
router.get(
  '/invoice/:invoiceNumber',
  billing,
  validate(schemas.byInvoiceNumber),
  controller.getByInvoiceNumber
);

router.get(
  '/patient/:patientId',
  validate(schemas.listForPatient),
  loadPatient(),
  controller.listForPatient
);

router.post(
  '/patient/:patientId/from-care',
  billing,
  validate(schemas.buildFromCare),
  controller.buildFromCare
);

router.get('/', billing, validate(schemas.list), controller.list);
router.post('/', billing, validate(schemas.create), controller.create);

router.get('/:id', validate(schemas.byId), controller.getById);
router.patch('/:id', billing, validate(schemas.update), controller.update);

router.post('/:id/items', billing, validate(schemas.addItems), controller.addItems);
router.post('/:id/issue', billing, validate(schemas.byId), controller.issue);
router.post('/:id/void', billing, validate(schemas.voidBill), controller.voidBill);
router.post('/:id/payments', billing, validate(schemas.pay), controller.pay);
router.post('/:id/refunds', finance, validate(schemas.refund), controller.refund);

module.exports = router;
