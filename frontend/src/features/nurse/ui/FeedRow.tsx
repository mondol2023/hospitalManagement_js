import { Link } from 'react-router-dom';

import { userName } from '@/features/patients';
import { formatRelative, humanizeEnum } from '@/shared/lib/format';
import { appPath } from '@/shared/lib/routes';
import type { CareLog } from '@/shared/types/domain';
import { Badge, Button } from '@/shared/ui';

import { entryTime, logPatientId, logPatientName } from '../model/display';

interface FeedRowProps {
  log: CareLog;
  onAcknowledge: (logId: string) => void;
  /** True while this row's own acknowledge request is in flight. */
  acknowledging: boolean;
}

/**
 * One entry in the ward feed: who it is about, what kind of entry it is, what
 * was written and who wrote it. A flagged entry nobody has picked up carries
 * its Acknowledge button; once someone has, it says who.
 */
export function FeedRow({ log, onAcknowledge, acknowledging }: FeedRowProps) {
  const id = logPatientId(log.patient);
  const name = logPatientName(log.patient);
  const text = log.type === 'handover' ? log.handover?.summary : log.notes;
  const acknowledger = log.acknowledgedBy ? userName(log.acknowledgedBy, 'a colleague') : null;
  const needsAttention = Boolean(log.requiresAttention) && !log.acknowledgedBy;

  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {id ? (
            <Link to={appPath(`patients/${id}`)} className="hover:text-brand hover:underline">
              {name}
            </Link>
          ) : (
            name
          )}
          <Badge tone={log.requiresAttention ? 'warning' : 'neutral'}>{humanizeEnum(log.type)}</Badge>
        </p>
        {text && <p className="mt-0.5 line-clamp-3 text-sm text-muted">{text}</p>}
        <p className="mt-1 text-xs text-muted">
          {[
            userName(log.recordedBy, ''),
            formatRelative(entryTime(log)),
            acknowledger && `Acknowledged by ${acknowledger}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      {needsAttention && (
        <Button
          size="sm"
          variant="secondary"
          loading={acknowledging}
          aria-label={`Acknowledge entry for ${name}`}
          onClick={() => onAcknowledge(log.id)}
        >
          Acknowledge
        </Button>
      )}
    </li>
  );
}
