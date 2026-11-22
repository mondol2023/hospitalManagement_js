import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

import type { ArrivalAppointment } from '@/features/appointments';
import { formatTime } from '@/shared/lib/format';
import { APPOINTMENT_TONE } from '@/shared/lib/status';
import { fade } from '@/shared/motion/variants';
import { Button, StatusBadge } from '@/shared/ui';

import { doctorLabel, patientLabel } from '../model/display';

/**
 * One visit on the day's list.
 *
 * Confirming changes the badge in place and nothing else: the row does not move
 * or re-sort, because a list that reorders under the cursor makes the next click
 * land on the wrong patient. The badge cross-fades only when its status changes,
 * not when the row first appears.
 *
 * "Confirm" is the backend's confirm and is not a check-in: there is no arrived
 * status (spec open item O1), so the copy never claims the patient is here.
 */
export function ArrivalRow({
  appointment,
  onConfirm,
  confirming = false,
}: {
  appointment: ArrivalAppointment;
  onConfirm: (appointment: ArrivalAppointment, patientName: string) => void;
  confirming?: boolean;
}) {
  const { name, mrn } = patientLabel(appointment.patient);
  const doctor = doctorLabel(appointment.doctor);
  const { status } = appointment;

  const shown = useRef(status);
  const changed = shown.current !== status;
  useEffect(() => {
    shown.current = status;
  }, [status]);

  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 md:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,10rem)_8.5rem_5.5rem]">
      <span className="numeric text-sm font-medium tabular-nums">
        {formatTime(appointment.scheduledAt)}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[0.9375rem] font-medium" title={name}>
          {name}
        </span>
        {mrn && <span className="block font-mono text-xs text-muted">{mrn}</span>}
      </span>

      <span
        className="col-start-2 row-start-2 min-w-0 truncate text-sm text-muted md:col-start-3 md:row-start-1"
        title={doctor ?? undefined}
      >
        {doctor ?? 'No doctor'}
      </span>

      <span className="col-start-3 row-start-1 justify-self-end md:col-start-4 md:justify-self-start">
        <motion.span
          key={status}
          variants={fade}
          initial={changed ? 'hidden' : false}
          animate="visible"
          className="inline-flex"
        >
          <StatusBadge status={status} tone={APPOINTMENT_TONE[status]} />
        </motion.span>
      </span>

      <span className="col-start-3 row-start-2 justify-self-end md:col-start-5 md:row-start-1">
        {status === 'pending' && (
          <Button
            size="sm"
            variant="secondary"
            disabled={confirming}
            aria-label={`Confirm visit for ${name}`}
            onClick={() => onConfirm(appointment, name)}
          >
            Confirm
          </Button>
        )}
      </span>
    </li>
  );
}
