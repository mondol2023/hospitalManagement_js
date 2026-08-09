import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { initials } from '@/shared/lib/format';
import { roleLabel } from '@/shared/lib/roles';
import { refObject, type Conversation, type User } from '@/shared/types/domain';
import { Button, Field, Input, Modal, SkeletonText } from '@/shared/ui';
import { useDoctors, useNurses, useStaff } from '@/features/directory';

import { useCreateStaffThread } from '../model/use-chat';

/**
 * Start a staff conversation.
 *
 * The picker is assembled from the three staff directories rather than a user
 * list, because there is no endpoint that returns "everyone" and there should
 * not be — a patient must never be selectable here. A staff thread is the one
 * conversation type with no patient attached, and its whole purpose is that it
 * can be spoken in freely; putting a patient in it by accident would quietly
 * turn a clinical aside into something they can read.
 *
 * Filtering happens client-side across the three loaded pages. That is honest
 * for a directory of this size and avoids three debounced searches racing.
 */
export function NewThreadModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (conversation: Conversation) => void;
}) {
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<User[]>([]);

  const create = useCreateStaffThread();

  const doctors = useDoctors({ limit: 100 });
  const nurses = useNurses({ limit: 100 });
  const staff = useStaff({ limit: 100 });

  const isLoading = doctors.isLoading || nurses.isLoading || staff.isLoading;

  const people = useMemo(() => {
    const profiles = [
      ...(doctors.data?.items ?? []),
      ...(nurses.data?.items ?? []),
      ...(staff.data?.items ?? []),
    ];

    const byId = new Map<string, User>();
    for (const profile of profiles) {
      const user = refObject(profile.user);
      if (user && !byId.has(user.id)) byId.set(user.id, user);
    }

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [doctors.data, nurses.data, staff.data]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return people;
    return people.filter(
      (person) =>
        person.name.toLowerCase().includes(needle) ||
        person.email.toLowerCase().includes(needle) ||
        roleLabel(person.role).toLowerCase().includes(needle)
    );
  }, [people, search]);

  const close = (next: boolean) => {
    if (!next) {
      setTitle('');
      setDepartment('');
      setSearch('');
      setSelected([]);
    }
    onOpenChange(next);
  };

  const toggle = (person: User) => {
    setSelected((current) =>
      current.some((chosen) => chosen.id === person.id)
        ? current.filter((chosen) => chosen.id !== person.id)
        : [...current, person]
    );
  };

  const submit = () => {
    if (selected.length === 0) return;

    create.mutate(
      {
        participantIds: selected.map((person) => person.id),
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(department.trim() ? { department: department.trim() } : {}),
      },
      {
        onSuccess: (conversation) => {
          onCreated?.(conversation);
          close(false);
        },
      }
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="New staff conversation"
      description="Pick who should be in it. Only staff appear here — patients are never added to a staff thread."
      size="lg"
      busy={create.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={selected.length === 0}>
            {selected.length === 0
              ? 'Start conversation'
              : `Start with ${selected.length} ${selected.length === 1 ? 'person' : 'people'}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" hint="Optional — otherwise the participants name it">
          <Input
            value={title}
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Night handover, Ward B"
          />
        </Field>

        <Field label="Department" hint="Optional">
          <Input
            value={department}
            maxLength={120}
            onChange={(event) => setDepartment(event.target.value)}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Participants">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email or role"
          />
        </Field>

        {selected.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {selected.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => toggle(person)}
                  className="flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium"
                  aria-label={`Remove ${person.name}`}
                >
                  {person.name}
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 max-h-64 overflow-y-auto rounded-card border border-line scrollbar-thin">
          {isLoading ? (
            <div className="space-y-3 p-3">
              {Array.from({ length: 5 }, (_, index) => (
                <SkeletonText key={index} lines={1} />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Nobody matches that search.</p>
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((person) => {
                const chosen = selected.some((candidate) => candidate.id === person.id);

                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() => toggle(person)}
                      aria-pressed={chosen}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                        chosen ? 'bg-brand/10' : 'hover:bg-surface-raised'
                      )}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-[11px] font-semibold text-muted"
                        aria-hidden="true"
                      >
                        {initials(person.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{person.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {roleLabel(person.role)} · {person.email}
                        </span>
                      </span>
                      {chosen && <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
