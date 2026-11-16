import { BellOff } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { humanizeEnum } from '@/shared/lib/format';
import { NOTIFICATION_TYPES, type NotificationType } from '@/shared/types/domain';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Pagination,
  Select,
  SkeletonText,
} from '@/shared/ui';

import type { NotificationListParams } from '../api/notifications-api';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '../model/use-notifications';
import { NotificationItem } from './NotificationItem';

const PAGE_SIZE = 20;

/**
 * The whole inbox. The bell shows the latest twenty for a quick look; this is
 * where you go to find the one from last Tuesday.
 *
 * Filtering is server-side (`unreadOnly`, `type`) — the inbox can be long, and
 * filtering one page of it in the browser would show a different answer on
 * every page.
 */
export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState<NotificationType | ''>('');
  const [pageNumber, setPageNumber] = useState(1);

  const params: NotificationListParams = {
    page: pageNumber,
    limit: PAGE_SIZE,
    ...(unreadOnly ? { unreadOnly: true } : {}),
    ...(type ? { type } : {}),
  };

  const list = useNotifications(params);
  const unread = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const unreadCount = unread.data?.count ?? 0;
  const filtered = unreadOnly || type !== '';

  // A new filter is a new list: staying on page 4 of a result set that now has
  // two pages would show an empty page that looks like an empty inbox.
  const changeFilter = (apply: () => void) => {
    apply();
    setPageNumber(1);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description="Alerts about your patients, appointments and shifts."
        action={
          unreadCount > 0 ? (
            <Button variant="secondary" loading={markAll.isPending} onClick={() => markAll.mutate()}>
              Mark all read
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-end gap-4">
          <div
            className="inline-flex rounded-control border border-line p-0.5"
            role="group"
            aria-label="Show"
          >
            <FilterButton active={!unreadOnly} onClick={() => changeFilter(() => setUnreadOnly(false))}>
              All
            </FilterButton>
            <FilterButton active={unreadOnly} onClick={() => changeFilter(() => setUnreadOnly(true))}>
              Unread
              {unreadCount > 0 && <span className="numeric ml-1.5 text-xs">{unreadCount}</span>}
            </FilterButton>
          </div>

          <Field label="Type" className="w-44">
            <Select
              inputSize="sm"
              value={type}
              onChange={(event) =>
                changeFilter(() => setType(event.target.value as NotificationType | ''))
              }
            >
              <option value="">Every type</option>
              {NOTIFICATION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {humanizeEnum(value)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </PageHeader>

      <Card className="overflow-hidden">
        {list.isLoading ? (
          <div className="space-y-4 p-4" aria-busy="true">
            {Array.from({ length: 5 }, (_, index) => (
              <SkeletonText key={index} lines={2} />
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState
            title="We couldn’t load your notifications"
            description="Check your connection, then try again."
            action={
              <Button variant="secondary" onClick={() => void list.refetch()}>
                Try again
              </Button>
            }
          />
        ) : list.data && list.data.items.length > 0 ? (
          <>
            <ul className="divide-y divide-line">
              {list.data.items.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={() => markRead.mutate(notification.id)}
                />
              ))}
            </ul>
            <Pagination
              pagination={list.data.pagination}
              onPageChange={setPageNumber}
              unit="notification"
            />
          </>
        ) : (
          <EmptyState
            icon={BellOff}
            title={filtered ? 'Nothing matches those filters' : 'Nothing here yet'}
            description={
              filtered
                ? 'Show everything, or pick a different type.'
                : 'Alerts about your patients, appointments and shifts will appear here.'
            }
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    changeFilter(() => {
                      setUnreadOnly(false);
                      setType('');
                    })
                  }
                >
                  Show everything
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center rounded-[6px] px-3 text-sm transition-colors',
        active ? 'bg-brand-soft font-medium text-brand' : 'text-muted hover:text-content'
      )}
    >
      {children}
    </button>
  );
}
