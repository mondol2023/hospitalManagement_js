import { Link } from 'react-router-dom';

import { userName } from '@/features/patients';
import { formatRelative } from '@/shared/lib/format';
import { appPath } from '@/shared/lib/routes';
import type { CareLog } from '@/shared/types/domain';
import { Button } from '@/shared/ui';

import { entryTime, logPatientId, logPatientName } from '../model/display';

interface AttentionRowProps {
  log: CareLog;
  onAcknowledge: (logId: string) => void;
  /** True while this row's own acknowledge request is in flight. */
  acknowledging: boolean;
}

/**
 * One flagged entry nobody has picked up. Shared by the dashboard panel and the
 * ward feed's "Needs attention" view so the two never describe the same entry
 * differently.
 */
export function AttentionRow({ log, onAcknowledge, acknowledging }: AttentionRowProps) {
  const id = logPatientId(log.patient);
  const name = logPatientName(log.patient);

  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {id ? (
            <Link to={appPath(`patients/${id}`)} className="hover:text-brand hover:underline">
              {name}
            </Link>
          ) : (
            name
          )}
        </p>
        {log.notes && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{log.notes}</p>}
        <p className="mt-1 text-xs text-muted">
          {[log.ward, userName(log.recordedBy, ''), formatRelative(entryTime(log))]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        loading={acknowledging}
        aria-label={`Acknowledge entry for ${name}`}
        onClick={() => onAcknowledge(log.id)}
      >
        Acknowledge
      </Button>
    </li>
  );
}
