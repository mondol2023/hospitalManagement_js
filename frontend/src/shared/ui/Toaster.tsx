import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect } from 'react';

import { cn } from '@/shared/lib/cn';
import { toastItem } from '@/shared/motion/variants';
import { useToastStore, type Toast } from '@/shared/ui/toast-store';

const TONE_STYLE: Record<Toast['tone'], string> = {
  success: 'border-success/40 bg-success-soft text-success',
  warning: 'border-warning/40 bg-warning-soft text-warning',
  danger: 'border-danger/40 bg-danger-soft text-danger',
  info: 'border-info/40 bg-info-soft text-info',
};

const TONE_ICON: Record<Toast['tone'], LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
};

function ToastRow({ item }: { item: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const Icon = TONE_ICON[item.tone];

  useEffect(() => {
    if (item.duration === null) return;
    const timer = window.setTimeout(() => dismiss(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [item.id, item.duration, dismiss]);

  return (
    <motion.li
      layout
      variants={toastItem}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={cn(
        'pointer-events-auto flex w-80 items-start gap-3 rounded-card border bg-surface px-3.5 py-3 shadow-pop',
        TONE_STYLE[item.tone]
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-content">{item.title}</p>
        {item.description && <p className="mt-0.5 text-xs text-muted">{item.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        className="-mr-1 -mt-0.5 rounded p-1 text-muted transition-colors hover:text-content"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </motion.li>
  );
}

/**
 * Mounted once, at the root.
 *
 * `aria-live="polite"` rather than `assertive`: these announce after the
 * current utterance instead of cutting it off. Genuinely urgent things —
 * emergency alerts — do not come through here; they get their own persistent,
 * acknowledged surface, because a message that disappears on a timer is the
 * wrong container for something a person must act on.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <ul
      role="status"
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <ToastRow key={item.id} item={item} />
        ))}
      </AnimatePresence>
    </ul>
  );
}
