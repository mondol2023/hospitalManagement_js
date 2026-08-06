import { create } from 'zustand';

import type { Tone } from '@/shared/lib/status';

export interface Toast {
  id: string;
  tone: Extract<Tone, 'success' | 'warning' | 'danger' | 'info'>;
  title: string;
  description?: string;
  /** Milliseconds before auto-dismiss. `null` means it stays until dismissed. */
  duration: number | null;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number | null }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

/** Newest first, capped — a stack of fifteen toasts is a bug, not a feature. */
const MAX_TOASTS = 4;

let counter = 0;
const nextId = () => `toast-${(counter += 1)}`;

/**
 * Toasts live outside React state on purpose: the axios interceptor and the
 * socket listener both need to raise one, and neither is inside a component.
 * A store keeps `toast.error(...)` callable from anywhere without prop
 * drilling a context through the whole tree.
 */
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: ({ duration, ...rest }) => {
    const id = nextId();
    set((state) => ({
      toasts: [{ id, duration: duration === undefined ? 5000 : duration, ...rest }, ...state.toasts].slice(
        0,
        MAX_TOASTS
      ),
    }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/**
 * The imperative surface. Errors default to staying on screen: a failed
 * payment or a rejected discharge must not vanish before the person who caused
 * it has looked up from the keyboard.
 */
export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'success', title, description }),
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'info', title, description }),
  warning: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'warning', title, description, duration: 8000 }),
  error: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'danger', title, description, duration: null }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
};
