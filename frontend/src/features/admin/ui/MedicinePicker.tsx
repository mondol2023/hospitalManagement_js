import { useQuery } from '@tanstack/react-query';

import { medicinesApi, type MedicineListParams } from '@/features/pharmacy';
import { queryKeys } from '@/shared/api/queryKeys';
import type { Medicine } from '@/shared/types/domain';
import { Badge } from '@/shared/ui';

import { formatOnHand } from '../pharmacy-reports/model/movement-kinds';
import { SearchPicker } from './SearchPicker';
import { useSearchText } from './use-search-text';

const PAGE_SIZE = 20;

export interface MedicinePickerProps {
  label: string;
  placeholder?: string;
  /** Only the name is needed to draw the chip, so a link that carries just an id can still show one. */
  value: Pick<Medicine, 'id' | 'name'> | null;
  onChange: (next: Medicine | null) => void;
  className?: string;
}

/**
 * Find a medicine batch by name. Deactivated batches are included: their
 * movements are still history someone may need to read.
 */
export function MedicinePicker({ label, placeholder, value, onChange, className }: MedicinePickerProps) {
  const search = useSearchText();

  const params: MedicineListParams = {
    search: search.query,
    limit: PAGE_SIZE,
    includeInactive: true,
  };

  const results = useQuery({
    queryKey: queryKeys.medicines.list(params),
    queryFn: () => medicinesApi.list(params),
    enabled: search.query !== '',
    placeholderData: (previous) => previous,
  });

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
      results={{ items: results.data?.items ?? [], isFetching: results.isFetching, error: results.error }}
      itemKey={(item) => item.id}
      noMatch={(query) => `No medicine matches “${query}”.`}
      renderItem={(item) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium">{item.name}</span>
          <span className="font-mono text-xs text-muted">{item.batchNumber}</span>
          <span className="text-xs text-muted">{formatOnHand(item.quantity, item.unit)}</span>
          {!item.isActive && <Badge>Inactive</Badge>}
        </span>
      )}
    />
  );
}
