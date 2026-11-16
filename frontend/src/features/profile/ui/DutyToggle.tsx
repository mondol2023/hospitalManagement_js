import { Badge, Button, Card, CardBody } from '@/shared/ui';

import { useSetDuty, type ProfileKind } from '../model/use-profile';

/**
 * Whether you are on shift right now. Rosters, the nurse-on-duty list and bed
 * assignment all read this flag, so it is a first-class control here and not a
 * field buried in the form below.
 *
 * It saves immediately: it describes this minute, not a draft.
 */
export function DutyToggle({
  kind,
  isOnDuty,
}: {
  kind: Exclude<ProfileKind, 'patient'>;
  isOnDuty: boolean;
}) {
  const setDuty = useSetDuty(kind);

  return (
    <Card>
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge tone={isOnDuty ? 'success' : 'neutral'}>{isOnDuty ? 'On duty' : 'Off duty'}</Badge>
          <p className="text-sm text-muted">
            {isOnDuty
              ? 'Colleagues can see you are on shift.'
              : 'You are hidden from on-duty lists until you go on duty.'}
          </p>
        </div>
        <Button
          variant={isOnDuty ? 'secondary' : 'primary'}
          loading={setDuty.isPending}
          onClick={() => setDuty.mutate(!isOnDuty)}
        >
          {isOnDuty ? 'Go off duty' : 'Go on duty'}
        </Button>
      </CardBody>
    </Card>
  );
}
