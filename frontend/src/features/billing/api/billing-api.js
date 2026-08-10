import { api } from '@/shared/api/client';
export const billingApi = {
    list: (params) => api.page('/billing', { params }),
    outstanding: (params) => api.page('/billing/outstanding', { params }),
    revenue: (params) => api.get('/billing/revenue', { params }),
    /**
     * What this deployment can actually take money through — not the enum. A
     * deployment with no Stripe key must never offer a button that can only 503.
     */
    paymentMethods: () => api.get('/billing/payment-methods'),
    getById: (id) => api.get(`/billing/${id}`),
    getByInvoiceNumber: (invoiceNumber) => api.get(`/billing/invoice/${invoiceNumber}`),
    listForPatient: (patientId, params) => api.page(`/billing/patient/${patientId}`, { params }),
    /** Sweeps the patient's unbilled chargeable care onto one invoice. */
    buildFromCare: (patientId, terms) => api.post(`/billing/patient/${patientId}/from-care`, terms ?? {}),
    create: (input) => api.post('/billing', input),
    update: (id, input) => api.patch(`/billing/${id}`, input),
    addItems: (id, items) => api.post(`/billing/${id}/items`, { items }),
    issue: (id) => api.post(`/billing/${id}/issue`, {}),
    void: (id, reason) => api.post(`/billing/${id}/void`, reason ? { reason } : {}),
    pay: (id, input) => api.post(`/billing/${id}/payments`, input),
    refund: (id, input) => api.post(`/billing/${id}/refunds`, input),
};
