/**
 * A patient in a table cell: the name, and under it the MRN when there is a name
 * to pair it with. (`partyOf` already folds an unnamed patient's MRN into `name`
 * and leaves `mrn` empty, so it is never printed twice.)
 */
export function PatientCell({ name, mrn }: { name: string; mrn?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{name}</p>
      {mrn && <p className="font-mono text-xs text-muted">{mrn}</p>}
    </div>
  );
}
