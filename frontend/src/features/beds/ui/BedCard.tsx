import { motion } from 'framer-motion';

import { cn } from '@/shared/lib/cn';
import { formatRelative, humanizeEnum } from '@/shared/lib/format';
import { formatMoney } from '@/shared/lib/money';
import { BED_TONE } from '@/shared/lib/status';
import { staggerItem } from '@/shared/motion/variants';
import { refObject, type Bed } from '@/shared/types/domain';
import { Badge, Button } from '@/shared/ui';
import { userName } from '@/features/patients';

const STATUS_RING: Record<Bed['status'], string> = {
  available: 'border-success/40',
  occupied: 'border-info/40',
  cleaning: 'border-warning/40',
  maintenance: 'border-line',
};

/**
 * One bed on the board.
 *
 * The card leads with the bed number because that is what someone standing in
 * the ward is holding in their head; the patient is secondary and the money is
 * last. `dailyRate` is a plain major-unit number on the bed model (unlike the
 * billing fields, which are cents), so it converts to cents exactly once, here.
 */
export function BedCard({
  bed,
  onAssign,
  onRelease,
  onStatus,
  busy,
}: {
  bed: Bed;
  onAssign: (bed: Bed) => void;
  onRelease: (bed: Bed) => void;
  onStatus: (bed: Bed) => void;
  busy?: boolean;
}) {
  const patient = refObject(bed.patient ?? null);

  return (
    <motion.article
      variants={staggerItem}
      className={cn(
        'flex flex-col gap-3 rounded-xl border-2 bg-surface p-4 shadow-sm',
        STATUS_RING[bed.status]
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold leading-none">{bed.bedNumber}</p>
          <p className="mt-1 truncate text-xs text-muted">
            {bed.ward}
            {bed.floor != null && ` · Floor ${bed.floor}`} · {humanizeEnum(bed.type)}
          </p>
        </div>
        <Badge tone={BED_TONE[bed.status]}>{humanizeEnum(bed.status)}</Badge>
      </div>

      <div className="min-h-[2.5rem] text-sm">
        {patient ? (
          <>
            <p className="truncate font-medium">{userName(patient.user)}</p>
            <p className="truncate text-xs text-muted">
              Admitted {formatRelative(bed.occupiedAt)}
            </p>
          </>
        ) : (
          <p className="text-muted">
            {bed.status === 'available' ? 'Ready for admission' : 'Not available'}
          </p>
        )}
      </div>

      <p className="text-xs text-muted">{formatMoney(Math.round(bed.dailyRate * 100))} / day</p>

      <div className="mt-auto flex flex-wrap gap-2">
        {bed.status === 'available' && (
          <Button size="sm" disabled={busy} onClick={() => onAssign(bed)}>
            Admit
          </Button>
        )}
        {bed.status === 'occupied' && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onRelease(bed)}>
            Release
          </Button>
        )}
        {bed.status !== 'occupied' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus(bed)}>
            Housekeeping
          </Button>
        )}
      </div>
    </motion.article>
  );
}
