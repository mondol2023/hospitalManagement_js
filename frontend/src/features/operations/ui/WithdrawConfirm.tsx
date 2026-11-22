import type { ExpiryBatch } from '@/features/pharmacy';
import { pluralize } from '@/shared/lib/format';
import { Button, Modal } from '@/shared/ui';

import { quantityLabel } from '../model/display';

/**
 * The gate in front of the write-off.
 *
 * It lists exactly the batches the user is agreeing to, and the button names the
 * number of units, so the verb and the amount match the toast that follows.
 * Cancel is focused first: this is the one irreversible action on the page, and
 * Enter should never be one keystroke from it.
 *
 * `batches` is a snapshot taken when the dialog opened. A refetch behind the
 * dialog must not change what someone is in the middle of agreeing to; if the
 * server ends up writing off a different set, the toast reports its numbers.
 */
export function WithdrawConfirm({
  open,
  onOpenChange,
  batches,
  busy,
  failed,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batches: readonly ExpiryBatch[];
  busy: boolean;
  failed: boolean;
  onConfirm: () => void;
}) {
  const units = batches.reduce((sum, batch) => sum + batch.quantity, 0);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      busy={busy}
      title={`Write off ${pluralize(batches.length, 'expired batch', 'expired batches')}?`}
      footer={
        <>
          <Button variant="secondary" autoFocus disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>
            Write off {pluralize(units, 'unit')}
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-line rounded-control border border-line text-sm">
        {batches.map((batch) => (
          <li key={batch.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate font-medium" title={batch.name}>
                {batch.name}
              </span>
              <span className="block font-mono text-xs text-muted">{batch.batchNumber}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {quantityLabel(batch.quantity, batch.unit)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-sm text-muted">
        Stock for these batches goes to 0 and they leave circulation. This is recorded against your
        name and can’t be undone here.
      </p>

      {failed && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          Couldn’t write off the expired stock. Try again.
        </p>
      )}
    </Modal>
  );
}
