import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from 'react';
import { Button } from '@/shared/ui';
/**
 * The last line of defence. A render-time exception in React 18 unmounts the
 * whole tree — without a boundary the user gets a white page, which in a
 * clinical setting is indistinguishable from "the system is down".
 *
 * Deliberately a class: error boundaries have no hook equivalent.
 *
 * Note what is *not* shown: `error.stack` and `error.message` stay out of the
 * UI. Messages from a bundled build routinely leak internal paths and request
 * shapes, and this screen may be on a display a patient can see.
 */
export class ErrorBoundary extends Component {
    state = { error: null };
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        // The place to wire an error reporter. Console only for now — better an
        // obvious gap than a half-configured pipe that quietly drops everything.
        // eslint-disable-next-line no-console
        console.error('Unhandled render error', error, info.componentStack);
    }
    handleReload = () => {
        window.location.assign('/');
    };
    render() {
        if (!this.state.error)
            return this.props.children;
        return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-canvas px-6", children: _jsxs("div", { className: "flex max-w-md flex-col items-center gap-4 text-center", children: [_jsx("h1", { className: "font-display text-xl font-semibold", children: "This screen stopped working" }), _jsx("p", { className: "text-sm text-muted", children: "Nothing you entered was sent. Reload to start again \u2014 if it keeps happening, tell your IT team which page you were on." }), _jsx(Button, { onClick: this.handleReload, children: "Reload the app" })] }) }));
    }
}
