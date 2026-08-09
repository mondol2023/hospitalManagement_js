import { motion } from 'framer-motion';
import { MapPin, User as UserIcon } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { formatRelative, humanizeEnum } from '@/shared/lib/format';
import { EMERGENCY_SEVERITY_TONE, EMERGENCY_STATUS_TONE } from '@/shared/lib/status';
import { alertPulse, staggerItem } from '@/shared/motion/variants';
import { refObject, type Emergency } from '@/shared/types/domain';
import { Badge, Button } from '@/shared/ui';
import { patientName } from '@/features/patients';

const RING: Record<Emergency['severity'], string> = {
  low: 'ring-info/30',
  medium: 'ring-warning/40',
  high: 'ring-danger/40',
  critical: 'ring-danger',
};

function describeLocation(location: Emergency['location']): string | null {
  if (!location) return null;
  const parts = [
    location.ward,
    location.floor != null ? `Floor ${location.floor}` : undefined,
    location.room ? `Room ${location.room}` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * One alert on the live board.
 *
 * Read top-down in the order a responder needs it: how bad, what kind, how long
 * it has been waiting, then where and who. The elapsed time is relative rather
 * than a clock time because "4 minutes ago" is the number that decides whether
 * to walk or run, and nobody should have to do the subtraction.
 *
 * Only a critical alert animates. If everything pulsed, nothing would.
 */
export function EmergencyCard({
  emergency,
  canRespond,
  onAcknowledge,
  onResolve,
  onEscalate,
  busy,
}: {
  emergency: Emergency;
  canRespond: boolean;
  onAcknowledge: () => void;
  onResolve: () => void;
  onEscalate: () => void;
  busy?: boolean;
}) {
  const patient = refObject(emergency.patient);
  const location = describeLocation(emergency.location);
  const isCritical = emergency.severity === 'critical' && emergency.status === 'open';

  return (
    <motion.article
      variants={isCritical ? alertPulse : staggerItem}
      className={cn(
        'flex flex-col gap-3 rounded-card bg-surface-raised p-4 ring-1 ring-inset',
        RING[emergency.severity]
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={EMERGENCY_SEVERITY_TONE[emergency.severity]}>
          {humanizeEnum(emergency.severity)}
        </Badge>
        <Badge tone={EMERGENCY_STATUS_TONE[emergency.status]}>
          {humanizeEnum(emergency.status)}
        </Badge>
        <span className="label-eyebrow ml-auto text-muted">
          {formatRelative(emergency.createdAt)}
        </span>
      </div>

      <div>
        <p className="font-display text-sm font-semibold">{humanizeEnum(emergency.type)}</p>
        {emergency.description && (
          <p className="mt-1 line-clamp-3 text-sm text-content">{emergency.description}</p>
        )}
      </div>

      {(location || patient) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {location}
            </span>
          )}
          {patient && (
            <span className="inline-flex items-center gap-1">
              <UserIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {patientName(patient)}
            </span>
          )}
        </div>
      )}

      {canRespond && (
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {emergency.status === 'open' && (
            <Button size="sm" onClick={onAcknowledge} loading={busy}>
              Acknowledge
            </Button>
          )}
          {emergency.status !== 'resolved' && (
            <Button size="sm" variant="secondary" onClick={onResolve}>
              Resolve
            </Button>
          )}
          {emergency.severity !== 'critical' && emergency.status !== 'resolved' && (
            <Button size="sm" variant="ghost" onClick={onEscalate}>
              Escalate
            </Button>
          )}
        </div>
      )}
    </motion.article>
  );
}
