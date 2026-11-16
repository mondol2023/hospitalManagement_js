import { Plus, X } from 'lucide-react';
import { useState } from 'react';

import { selectUser, useAuthStore } from '@/features/auth';
import { useOnDutyNurses } from '@/features/directory';
import {
  HANDOVER_LIMITS,
  patientName,
  useCaseload,
  useLogHandover,
} from '@/features/patients';
import { refObject } from '@/shared/types/domain';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '@/shared/ui';

import { bedLabel } from '../model/display';
import { SentHandovers } from './SentHandovers';

interface TaskDraft {
  key: number;
  text: string;
}

/**
 * Hand a patient over to the next nurse on the ward.
 *
 * The receiver is chosen from nurses on duty in the patient's own ward — never
 * the sender — so a handover cannot go to someone who is off shift or cannot
 * see the patient. When there is nobody to send it to, the form says so rather
 * than offering an empty list; it is the charge nurse's call, not the form's.
 */
export function HandoverPage() {
  const me = useAuthStore(selectUser);
  const caseload = useCaseload({ limit: 100 });
  const handover = useLogHandover();

  const [patientId, setPatientId] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [summary, setSummary] = useState('');
  const [tasks, setTasks] = useState<TaskDraft[]>([]);
  const [nextKey, setNextKey] = useState(1);

  const patients = caseload.data?.items ?? [];
  const patient = patients.find((candidate) => candidate.id === patientId);
  const ward = patient ? (patient.ward ?? refObject(patient.bed)?.ward) : undefined;

  const onDuty = useOnDutyNurses(ward);
  const colleagues = (onDuty.data ?? []).filter((nurse) => nurse.user.id !== me?.id);
  const receiver = colleagues.find((nurse) => nurse.user.id === receiverId);

  const noWard = Boolean(patient) && !ward;
  const nobodyOnDuty = Boolean(ward) && onDuty.isSuccess && colleagues.length === 0;
  const canSend = Boolean(patient && receiver && summary.trim()) && !handover.isPending;

  function reset() {
    setPatientId('');
    setReceiverId('');
    setSummary('');
    setTasks([]);
  }

  function addTask() {
    setTasks((current) => [...current, { key: nextKey, text: '' }]);
    setNextKey((key) => key + 1);
  }

  function send() {
    if (!patient || !receiver) return;
    const outstandingTasks = tasks.map((task) => task.text.trim()).filter(Boolean);
    handover.mutate(
      {
        input: {
          patientId: patient.id,
          toNurseUserId: receiver.user.id,
          summary: summary.trim(),
          ...(outstandingTasks.length > 0 && { outstandingTasks }),
        },
        receiverName: receiver.user.name,
      },
      { onSuccess: reset }
    );
  }

  return (
    <div>
      <PageHeader
        title="Handover"
        description="Pass a patient to the next nurse, with what they need to pick up."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader title="New handover" />
          <CardBody>
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSend) send();
              }}
            >
              <Field label="Patient">
                <Select
                  value={patientId}
                  placeholder={caseload.isLoading ? 'Loading your patients…' : 'Choose a patient'}
                  disabled={patients.length === 0}
                  onChange={(event) => {
                    setPatientId(event.target.value);
                    setReceiverId('');
                  }}
                >
                  {patients.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {[patientName(candidate), bedLabel(candidate)].filter(Boolean).join(' · ')}
                    </option>
                  ))}
                </Select>
              </Field>

              {!caseload.isLoading && patients.length === 0 && (
                <p className="text-sm text-muted">
                  {caseload.isError
                    ? 'Couldn’t load your patients. Refresh the page to try again.'
                    : 'No patients assigned to you yet — the charge nurse assigns them from the ward board.'}
                </p>
              )}

              {noWard && (
                <p role="status" className="text-sm text-muted">
                  {patientName(patient as NonNullable<typeof patient>)} isn’t on a ward yet, so
                  there is no one to hand over to.
                </p>
              )}

              {nobodyOnDuty && (
                <p role="status" className="text-sm text-muted">
                  No other nurses on duty in {ward}. Ask the charge nurse to check the roster.
                </p>
              )}

              {ward && colleagues.length > 0 && (
                <Field label="Hand over to">
                  <Select
                    value={receiverId}
                    placeholder="Choose a nurse"
                    onChange={(event) => setReceiverId(event.target.value)}
                  >
                    {colleagues.map((nurse) => (
                      <option key={nurse.id} value={nurse.user.id}>
                        {nurse.user.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <Field label="Summary" hint={`${summary.length} / ${HANDOVER_LIMITS.summary}`}>
                <Textarea
                  value={summary}
                  maxLength={HANDOVER_LIMITS.summary}
                  onChange={(event) => setSummary(event.target.value)}
                />
              </Field>

              <fieldset className="flex flex-col gap-2">
                <legend className="label-eyebrow mb-1.5">Outstanding tasks</legend>
                {tasks.map((task, index) => (
                  <div key={task.key} className="flex items-center gap-2">
                    <Input
                      aria-label={`Task ${index + 1}`}
                      value={task.text}
                      maxLength={HANDOVER_LIMITS.taskLength}
                      onChange={(event) =>
                        setTasks((current) =>
                          current.map((entry) =>
                            entry.key === task.key ? { ...entry, text: event.target.value } : entry
                          )
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove task ${index + 1}`}
                      onClick={() => setTasks((current) => current.filter((entry) => entry.key !== task.key))}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={tasks.length >= HANDOVER_LIMITS.tasks}
                    onClick={addTask}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add task
                  </Button>
                </div>
              </fieldset>

              <div>
                <Button type="submit" disabled={!canSend} loading={handover.isPending}>
                  Hand over
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <SentHandovers />
      </div>
    </div>
  );
}
