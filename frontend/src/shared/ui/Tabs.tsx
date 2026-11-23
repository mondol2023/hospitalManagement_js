import { motion } from 'framer-motion';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { TRANSITION } from '@/shared/motion/variants';

export interface TabItem {
  id: string;
  label: string;
  /** Shown beside the label, e.g. how many rows the tab holds. */
  count?: number;
}

interface TabsProps {
  /** Pairs the tabs with their `TabPanel`. Unique on the page. */
  tabsId: string;
  /** Names the tablist for screen readers. */
  label: string;
  value: string;
  onChange: (id: string) => void;
  items: readonly TabItem[];
  /** Shared-layout id for the sliding underline. Unique per tablist. */
  layoutId: string;
  className?: string;
}

const tabDomId = (tabsId: string, id: string) => `${tabsId}-tab-${id}`;
const panelDomId = (tabsId: string) => `${tabsId}-panel`;

/**
 * An underlined tablist with the keyboard behaviour the ARIA pattern asks for:
 * only the selected tab is in the tab order, arrows move and select (wrapping),
 * Home and End jump. Selection follows focus because every panel here is cheap
 * to show; nothing is fetched on a tab change that is not already cached or
 * about to be needed.
 */
export function Tabs({ tabsId, label, value, onChange, items, layoutId, className }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.id === value);
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % items.length;
        break;
      case 'ArrowLeft':
        next = (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = items[next]!;
    onChange(target.id);
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(tabDomId(tabsId, target.id))}`)?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('flex gap-6 border-b border-line', className)}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            id={tabDomId(tabsId, item.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelDomId(tabsId)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative -mb-px inline-flex min-h-11 items-center gap-2 text-sm font-medium transition-colors',
              selected ? 'text-ink' : 'text-muted hover:text-ink'
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="numeric rounded-full bg-surface-raised px-1.5 text-xs text-muted">
                {item.count}
              </span>
            )}
            {selected && (
              <motion.span
                layoutId={layoutId}
                transition={TRANSITION.spring}
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  tabsId,
  value,
  children,
  className,
}: {
  tabsId: string;
  /** The selected tab's id. */
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={panelDomId(tabsId)}
      aria-labelledby={tabDomId(tabsId, value)}
      className={className}
    >
      {children}
    </div>
  );
}
