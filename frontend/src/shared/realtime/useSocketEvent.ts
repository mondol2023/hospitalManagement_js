import { useEffect, useRef, useState } from 'react';

import { getSocket, type AppSocket } from './socket';
import type { ServerToClientEvents } from '@/shared/types/socket-events';

/**
 * Subscribes to one server event for the lifetime of a component.
 *
 * The handler is held in a ref and the effect depends only on the event name.
 * Without that, every parent re-render would produce a new closure, tearing
 * the listener down and rebuilding it — which on a bed board that re-renders
 * on each update means dropping the very events it exists to receive.
 */
export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
  enabled = true
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    if (!socket) return;

    const listener = (...args: unknown[]) => {
      (handlerRef.current as (...a: unknown[]) => void)(...args);
    };

    socket.on(event as string, listener);
    return () => {
      socket.off(event as string, listener);
    };
  }, [event, enabled]);
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

/**
 * The socket's state, for the "live"/"reconnecting" indicator.
 *
 * Worth surfacing rather than hiding: a bed board that silently stopped
 * receiving updates still looks correct, and someone will assign a bed that
 * was taken four minutes ago.
 */
export function useConnectionState(): ConnectionState {
  const [state, setState] = useState<ConnectionState>(() =>
    getSocket()?.connected ? 'connected' : 'connecting'
  );

  useEffect(() => {
    const socket: AppSocket | null = getSocket();
    if (!socket) {
      setState('disconnected');
      return;
    }

    setState(socket.connected ? 'connected' : 'connecting');

    const onConnect = () => setState('connected');
    const onDisconnect = () => setState('disconnected');
    const onReconnectAttempt = () => setState('connecting');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnectAttempt);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
    };
  }, []);

  return state;
}
