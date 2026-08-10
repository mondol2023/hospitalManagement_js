import { useEffect, useRef, useState } from 'react';
import { getSocket } from './socket';
/**
 * Subscribes to one server event for the lifetime of a component.
 *
 * The handler is held in a ref and the effect depends only on the event name.
 * Without that, every parent re-render would produce a new closure, tearing
 * the listener down and rebuilding it — which on a bed board that re-renders
 * on each update means dropping the very events it exists to receive.
 */
export function useSocketEvent(event, handler, enabled = true) {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;
    useEffect(() => {
        if (!enabled)
            return;
        const socket = getSocket();
        if (!socket)
            return;
        const listener = (...args) => {
            handlerRef.current(...args);
        };
        socket.on(event, listener);
        return () => {
            socket.off(event, listener);
        };
    }, [event, enabled]);
}
/**
 * The socket's state, for the "live"/"reconnecting" indicator.
 *
 * Worth surfacing rather than hiding: a bed board that silently stopped
 * receiving updates still looks correct, and someone will assign a bed that
 * was taken four minutes ago.
 */
export function useConnectionState() {
    const [state, setState] = useState(() => getSocket()?.connected ? 'connected' : 'connecting');
    useEffect(() => {
        const socket = getSocket();
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
