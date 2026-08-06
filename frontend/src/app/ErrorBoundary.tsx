import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/shared/ui';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

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
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The place to wire an error reporter. Console only for now — better an
    // obvious gap than a half-configured pipe that quietly drops everything.
    // eslint-disable-next-line no-console
    console.error('Unhandled render error', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.assign('/');
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <h1 className="font-display text-xl font-semibold">This screen stopped working</h1>
          <p className="text-sm text-muted">
            Nothing you entered was sent. Reload to start again — if it keeps happening, tell your
            IT team which page you were on.
          </p>
          <Button onClick={this.handleReload}>Reload the app</Button>
        </div>
      </div>
    );
  }
}
