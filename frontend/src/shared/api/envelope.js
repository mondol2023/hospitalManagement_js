import { ERROR_CODES, friendlyMessage } from './errorCodes';
/**
 * Every failed request surfaces as this, whether it failed with a JSON
 * envelope, a 502 from a proxy, or a dropped connection. One catch-shape means
 * call sites never have to ask "is this an axios error or a real one".
 */
export class ApiError extends Error {
    code;
    status;
    details;
    constructor(code, message, status, details) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.status = status;
        this.details = details;
        Object.setPrototypeOf(this, ApiError.prototype);
    }
    /** Copy suitable for showing a user — never rendered as HTML. */
    get userMessage() {
        return friendlyMessage(this.code, this.message);
    }
    is(...codes) {
        return codes.includes(this.code);
    }
    static network(message = 'Could not reach the server. Check your connection.') {
        return new ApiError('NETWORK_ERROR', message, 0);
    }
    static unknown(message = 'Something went wrong.') {
        return new ApiError(ERROR_CODES.INTERNAL_ERROR, message, 500);
    }
}
/**
 * Zod-style field errors come back in `details` from the backend's
 * `validate()` middleware. Shape-checked rather than cast, because `details`
 * is `unknown` by contract and a bad cast here would crash a form.
 */
export function fieldErrorsFrom(error) {
    const out = {};
    const details = error.details;
    if (!Array.isArray(details))
        return out;
    for (const issue of details) {
        if (!issue || typeof issue !== 'object')
            continue;
        const { path, message } = issue;
        if (typeof message !== 'string')
            continue;
        const key = Array.isArray(path) ? path.join('.') : typeof path === 'string' ? path : '';
        if (key)
            out[key] = message;
    }
    return out;
}
