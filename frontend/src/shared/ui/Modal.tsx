import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { modalOverlay, modalPanel } from '@/shared/motion/variants';
import { Button } from '@/shared/ui/Button';

/**
 * Built on Radix Dialog rather than a hand-rolled portal, because the parts
 * that are easy to get wrong here are the parts that matter: focus is trapped
 * on open and restored to the trigger on close, the rest of the page is
 * `aria-hidden`, Escape closes, and background scroll is locked. Reimplementing
 * that correctly is a week of work and a permanent liability.
 *
 * `forceMount` + AnimatePresence is the standard pairing: Radix would otherwise
 * unmount the content instantly and the exit animation would never play.
 */
interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Read by screen readers on open — say what the dialog is for. */
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /**
   * Set while a mutation is in flight so a half-submitted form cannot be
   * dismissed by a stray Escape or backdrop click.
   */
  busy?: boolean;
}

const SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
};

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  busy = false,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
                variants={modalOverlay}
                initial="hidden"
                animate="visible"
                exit="hidden"
              />
            </Dialog.Overlay>

            <Dialog.Content
              asChild
              forceMount
              onEscapeKeyDown={(event) => busy && event.preventDefault()}
              onPointerDownOutside={(event) => busy && event.preventDefault()}
              onInteractOutside={(event) => busy && event.preventDefault()}
            >
              <motion.div
                className={cn(
                  'fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
                  'rounded-card border border-line bg-surface shadow-pop',
                  SIZE[size]
                )}
                variants={modalPanel}
                initial="hidden"
                animate="visible"
                exit="hidden"
              >
                <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                  <div className="min-w-0">
                    <Dialog.Title className="font-display text-base font-semibold">
                      {title}
                    </Dialog.Title>
                    {description && (
                      <Dialog.Description className="mt-1 text-sm text-muted">
                        {description}
                      </Dialog.Description>
                    )}
                  </div>
                  <Dialog.Close
                    className="-mr-1 -mt-1 rounded p-1.5 text-muted transition-colors hover:bg-surface-raised hover:text-content disabled:pointer-events-none disabled:opacity-40"
                    disabled={busy}
                    aria-label="Close dialog"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Dialog.Close>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
                  {children}
                </div>

                {footer && (
                  <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
                    {footer}
                  </div>
                )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/**
 * The destructive-action gate. Discharges, voids, refunds and deletes all go
 * through this so the wording, the tone and the busy-lock behave identically —
 * and so no screen invents its own softer confirmation for an action the
 * backend treats as irreversible.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  busy = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">{message}</p>
    </Modal>
  );
}
