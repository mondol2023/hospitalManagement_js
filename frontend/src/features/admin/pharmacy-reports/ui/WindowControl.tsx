import { useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { Field, Input } from '@/shared/ui';

import {
  DAY_PRESETS,
  isValidDays,
  MAX_DAYS,
  MIN_DAYS,
} from '../model/report-params';

const segment =
  'h-8 px-3 text-sm font-medium transition-colors first:rounded-l-control last:rounded-r-control';

/**
 * How far back "restocked by" looks: 7, 30 or 90 days, or a number of the
 * reader's choosing. The custom box only reports a value once it is valid, so
 * a half-typed "4" never becomes a request for 4 days and "400" never becomes a
 * request at all.
 */
export function WindowControl({
  days,
  onChange,
}: {
  days: number;
  onChange: (days: number) => void;
}) {
  const [custom, setCustom] = useState(!DAY_PRESETS.some((preset) => preset === days));
  const [draft, setDraft] = useState(String(days));

  const valid = (value: string) => /^\d+$/.test(value) && isValidDays(Number(value));

  function typeDays(value: string) {
    setDraft(value);
    if (valid(value)) onChange(Number(value));
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div role="group" aria-label="Report window" className="flex">
        {DAY_PRESETS.map((preset) => {
          const pressed = !custom && days === preset;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={pressed}
              onClick={() => {
                setCustom(false);
                setDraft(String(preset));
                onChange(preset);
              }}
              className={cn(
                segment,
                'border border-line -ml-px first:ml-0',
                pressed ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-raised hover:text-content'
              )}
            >
              {preset} days
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={custom}
          onClick={() => setCustom(true)}
          className={cn(
            segment,
            'border border-line -ml-px',
            custom ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-raised hover:text-content'
          )}
        >
          Custom
        </button>
      </div>

      {custom && (
        <Field
          label="Days"
          className="w-28"
          error={!valid(draft) ?`Enter a number from ${MIN_DAYS} to ${MAX_DAYS}.` : undefined}
        >
          <Input
            type="text"
            inputMode="numeric"
            inputSize="sm"
            numeric
            value={draft}
            onChange={(event) => typeDays(event.target.value)}
          />
        </Field>
      )}
    </div>
  );
}
