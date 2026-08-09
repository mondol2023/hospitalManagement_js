import { motion } from 'framer-motion';
import { Siren } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ApiError } from '@/shared/api/envelope';
import { formatDateTime, formatRelative, humanizeEnum } from '@/shared/lib/format';
import { ROLES } from '@/shared/lib/roles';
import {
  EMERGENCY_SEVERITY_TONE,
  EMERGENCY_STATUS_TONE,
  SEVERITY_WEIGHT,
} from '@/shared/lib/status';
import { fadeSlideUp, staggerList } from '@/shared/motion/variants';
import { useConnectionState } from '@/shared/realtime/useSocketEvent';
import {
  EMERGENCY_SEVERITY,
  EMERGENCY_STATUS,
  EMERGENCY_TYPES,
  refObject,
  type Emergency,
  type EmergencySeverity,
  type EmergencyStatus,
  type EmergencyType,
} from '@/shared/types/domain';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pagination,
  Select,
  SeverityDot,
  Skeleton,
  type Column,
} from '@/shared/ui';
import { useCan } from '@/features/auth';
import { patientName } from '@/features/patients';

import {
  useAcknowledgeEmergency,
  useActiveEmergencies,
  useEmergencies,
  useEmergencyAlerts,
  useEscalateEmergency,
} from '../model/use-emergencies';
import { EmergencyCard } from './EmergencyCard';
import { RaiseEmergencyModal } from './RaiseEmergencyModal';
import { ResolveEmergencyModal } from './ResolveEmergencyModal';

const PAGE_SIZE = 20;
const BOARD_SIZE = 12;

const RESPONDER_ROLES = [ROLES.DOCTOR, ROLES.NURSE, ROLES.ADMIN, ROLES.MANAGER];

/** The next rung up the ladder; `null` once there is nowhere higher to go. */
function nextSeverity(severity: EmergencySeverity): EmergencySeverity | null {
  const ordered = [...EMERGENCY_SEVERITY].sort(
    (a, b) => SEVERITY_WEIGHT[a] - SEVERITY_WEIGHT[b]
  );
  const index = ordered.indexOf(severity);
  return index >= 0 && index < ordered.length - 1 ? (ordered[index + 1] as EmergencySeverity) : null;
}

const CONNECTION_COPY = {
  connected: { tone: 'success', label: 'Live' },
  connecting: { tone: 'warning', label: 'Reconnecting' },
  disconnected: { tone: 'danger', label: 'Offline — showing polled data' },
} as const;

/**
 * The alert board.
 *
 * Two things share this screen because they answer two different questions.
 * The board at the top is "what is happening right now" — cards, not rows,
 * because an alert deserves more than a line of table and because a responder
 * reads it from across a room. The log below is "what happened", filterable and
 * paged, and it is what gets read in the debrief.
 *
 * Raising an alert is available to everyone, matching the backend, which puts
 * no role gate on `POST /emergencies`. Responding is not: acknowledge, resolve
 * and escalate are drawn only for clinical and admin staff, because those are
 * the only accounts the server will accept them from.
 *
 * The connection indicator is deliberately loud when it is unhappy. A board
 * that has silently stopped receiving pushes still looks like a calm ward.
 */
export function EmergenciesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<EmergencyStatus | ''>('');
  const [type, setType] = useState<EmergencyType | ''>('');
  const [severity, setSeverity] = useState<EmergencySeverity | ''>('');
  const [ward, setWard] = useState('');
  const [raising, setRaising] = useState(false);
  const [resolving, setResolving] = useState<Emergency | null>(null);

  const canRespond = useCan(RESPONDER_ROLES);
  const connection = useConnectionState();

  // Pushes keep both queries fresh; the board's own 30s poll is the backstop.
  useEmergencyAlerts();

  const boardParams = useMemo(
    () => ({
      limit: BOARD_SIZE,
      ...(type ? { type } : {}),
      ...(severity ? { severity } : {}),
      ...(ward.trim() ? { ward: ward.trim() } : {}),
    }),
    [type, severity, ward]
  );

  const logParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(severity ? { severity } : {}),
    }),
    [page, status, type, severity]
  );

  const board = useActiveEmergencies(boardParams);
  const log = useEmergencies(logParams);

  const acknowledge = useAcknowledgeEmergency();
  const escalate = useEscalateEmergency();

  const escalateOne = (emergency: Emergency) => {
    const next = nextSeverity(emergency.severity);
    if (next) escalate.mutate({ id: emergency.id, severity: next });
  };

  const columns = useMemo<Array<Column<Emergency>>>(
    () => [
      {
        id: 'severity',
        header: 'Severity',
        width: 'w-36',
        cell: (emergency) => (
          <span className="inline-flex items-center gap-2">
            <SeverityDot
              tone={EMERGENCY_SEVERITY_TONE[emergency.severity]}
              label={humanizeEnum(emergency.severity)}
            />
            <span>{humanizeEnum(emergency.severity)}</span>
          </span>
        ),
      },
      {
        id: 'alert',
        header: 'Alert',
        cell: (emergency) => {
          const patient = refObject(emergency.patient);
          return (
            <div className="min-w-0">
              <p className="truncate font-medium">{humanizeEnum(emergency.type)}</p>
              <p className="truncate text-xs text-muted">
                {emergency.description || (patient ? patientName(patient) : 'No details given')}
              </p>
            </div>
          );
        },
      },
      {
        id: 'location',
        header: 'Location',
        hideBelowMd: true,
        cell: (emergency) =>
          [emergency.location?.ward, emergency.location?.room].filter(Boolean).join(' · ') || '—',
      },
      {
        id: 'raised',
        header: 'Raised',
        width: 'w-44',
        hideBelowMd: true,
        cell: (emergency) => (
          <span title={formatDateTime(emergency.createdAt)}>
            {formatRelative(emergency.createdAt)}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        width: 'w-32',
        cell: (emergency) => (
          <Badge tone={EMERGENCY_STATUS_TONE[emergency.status]}>
            {humanizeEnum(emergency.status)}
          </Badge>
        ),
      },
      ...(canRespond
        ? [
            {
              id: 'actions',
              header: 'Actions',
              numeric: true,
              width: 'w-56',
              cell: (emergency: Emergency) => (
                <div className="flex justify-end gap-1">
                  {emergency.status === 'open' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={acknowledge.isPending && acknowledge.variables === emergency.id}
                      onClick={() => acknowledge.mutate(emergency.id)}
                    >
                      Acknowledge
                    </Button>
                  )}
                  {emergency.status !== 'resolved' && (
                    <Button size="sm" variant="ghost" onClick={() => setResolving(emergency)}>
                      Resolve
                    </Button>
                  )}
                </div>
              ),
            } satisfies Column<Emergency>,
          ]
        : []),
    ],
    [canRespond, acknowledge]
  );

  const filtered = Boolean(status || type || severity || ward);
  const active = board.data?.items ?? [];
  const indicator = CONNECTION_COPY[connection];

  return (
    <motion.div variants={fadeSlideUp} initial="hidden" animate="visible">
      <PageHeader
        title="Emergencies"
        description="Everything open right now, and the record of everything that came before."
        action={
          <Button variant="danger" leadingIcon={<Siren className="h-4 w-4" />} onClick={() => setRaising(true)}>
            Raise alert
          </Button>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Status" className="w-44">
            <Select
              value={status}
              aria-label="Filter by status"
              onChange={(event) => {
                setStatus(event.target.value as EmergencyStatus | '');
                setPage(1);
              }}
            >
              <option value="">Any status</option>
              {EMERGENCY_STATUS.map((value) => (
                <option key={value} value={value}>
                  {humanizeEnum(value)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Type" className="w-44">
            <Select
              value={type}
              aria-label="Filter by type"
              onChange={(event) => {
                setType(event.target.value as EmergencyType | '');
                setPage(1);
              }}
            >
              <option value="">Any type</option>
              {EMERGENCY_TYPES.map((value) => (
                <option key={value} value={value}>
                  {humanizeEnum(value)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Severity" className="w-44">
            <Select
              value={severity}
              aria-label="Filter by severity"
              onChange={(event) => {
                setSeverity(event.target.value as EmergencySeverity | '');
                setPage(1);
              }}
            >
              <option value="">Any severity</option>
              {EMERGENCY_SEVERITY.map((value) => (
                <option key={value} value={value}>
                  {humanizeEnum(value)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Ward" className="w-44">
            <Input
              value={ward}
              aria-label="Filter the board by ward"
              placeholder="Any ward"
              onChange={(event) => setWard(event.target.value)}
            />
          </Field>

          {filtered && (
            <Button
              variant="ghost"
              onClick={() => {
                setStatus('');
                setType('');
                setSeverity('');
                setWard('');
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </PageHeader>

      <Card className="mb-6">
        <CardHeader
          title="Live board"
          description="Open and acknowledged alerts, newest and most severe first."
          action={
            <span className="inline-flex items-center gap-2">
              <Badge tone={indicator.tone}>{indicator.label}</Badge>
            </span>
          }
        />
        <CardBody>
          {board.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-40 rounded-card" />
              ))}
            </div>
          ) : active.length === 0 ? (
            <EmptyState
              icon={Siren}
              title="Nothing open"
              description={
                board.isError
                  ? 'The board could not be loaded — this is not confirmation that the ward is quiet.'
                  : 'Every alert raised so far has been resolved.'
              }
            />
          ) : (
            <motion.div
              variants={staggerList}
              initial="hidden"
              animate="visible"
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            >
              {active.map((emergency) => (
                <EmergencyCard
                  key={emergency.id}
                  emergency={emergency}
                  canRespond={canRespond}
                  busy={acknowledge.isPending && acknowledge.variables === emergency.id}
                  onAcknowledge={() => acknowledge.mutate(emergency.id)}
                  onResolve={() => setResolving(emergency)}
                  onEscalate={() => escalateOne(emergency)}
                />
              ))}
            </motion.div>
          )}
        </CardBody>
      </Card>

      <Card>
        <DataTable
          caption="Alert history"
          columns={columns}
          rows={log.data?.items ?? []}
          rowKey={(emergency) => emergency.id}
          isLoading={log.isLoading}
          error={
            log.error
              ? {
                  title: 'Could not load the alert history',
                  description: log.error instanceof ApiError ? log.error.userMessage : undefined,
                }
              : null
          }
          empty={{
            icon: Siren,
            title: filtered ? 'No alerts match' : 'No alerts recorded',
            description: filtered
              ? 'Try a wider filter, or clear them all.'
              : 'Raised alerts stay here permanently, resolved or not.',
          }}
        />

        {log.data && (
          <Pagination pagination={log.data.pagination} onPageChange={setPage} unit="alert" />
        )}
      </Card>

      <RaiseEmergencyModal open={raising} onOpenChange={setRaising} />

      <ResolveEmergencyModal
        emergency={resolving}
        onOpenChange={(open) => !open && setResolving(null)}
      />
    </motion.div>
  );
}
