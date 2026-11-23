import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/shared/api/queryKeys';
import { humanizeEnum } from '@/shared/lib/format';
import type { Role } from '@/shared/lib/roles';
import type { User } from '@/shared/types/domain';
import { Badge } from '@/shared/ui';

import { usersApi, type UserListParams } from '../api/users-api';
import { SearchPicker } from './SearchPicker';
import { useSearchText } from './use-search-text';

const PAGE_SIZE = 20;

export interface UserPickerProps {
  label: string;
  placeholder?: string;
  /** Only the name is needed to draw the chip, so a link that carries just an id can still show one. */
  value: Pick<User, 'id' | 'name'> | null;
  onChange: (next: User | null) => void;
  /**
   * One role is sent to the server. Several are filtered here over the one
   * page that comes back, because the server takes a single role.
   */
  role?: Role | Role[];
  /** Leave deactivated accounts out. Off for history, where they still appear. */
  activeOnly?: boolean;
  className?: string;
}

/** Find a person by name or email. Admin-only on the server, so this is for admin pages. */
export function UserPicker({
  label,
  placeholder,
  value,
  onChange,
  role,
  activeOnly = true,
  className,
}: UserPickerProps) {
  const search = useSearchText();
  const roles = role === undefined ? [] : Array.isArray(role) ? role : [role];

  // Empty filters are left out, not sent as `undefined` or ''.
  const params: UserListParams = { search: search.query, limit: PAGE_SIZE };
  if (activeOnly) params.isActive = true;
  if (roles.length === 1) params.role = roles[0];

  const results = useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: () => usersApi.list(params),
    enabled: search.query !== '',
    placeholderData: (previous) => previous,
  });

  const found = results.data?.items ?? [];
  const items = roles.length > 1 ? found.filter((person) => roles.includes(person.role)) : found;

  return (
    <SearchPicker
      className={className}
      label={label}
      placeholder={placeholder}
      chip={value?.name ?? null}
      onChange={onChange}
      text={search.text}
      onTextChange={search.setText}
      active={search.active}
      pending={search.pending}
      query={search.query}
      results={{ items, isFetching: results.isFetching, error: results.error }}
      itemKey={(person) => person.id}
      noMatch={(query) => `No one matches “${query}”.`}
      renderItem={(person) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium">{person.name}</span>
          <Badge>{humanizeEnum(person.role)}</Badge>
          <span className="text-xs text-muted">{person.email}</span>
        </span>
      )}
    />
  );
}
