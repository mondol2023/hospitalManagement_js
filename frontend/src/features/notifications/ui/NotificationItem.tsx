import {
  Activity,
  Bell,
  CalendarDays,
  MessageSquare,
  Pill,
  Receipt,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { formatRelative } from '@/shared/lib/format';
import type { AppNotification, NotificationType } from '@/shared/types/domain';

const ICONS: Record<NotificationType, LucideIcon> = {
  appointment: CalendarDays,
  emergency: Activity,
  billing: Receipt,
  inventory: Pill,
  care: Stethoscope,
  message: MessageSquare,
  system: Bell,
};

/** Only emergency gets colour. If everything is urgent, nothing is. */
const TONES: Partial<Record<NotificationType, string>> = {
  emergency: 'bg-danger-soft text-danger',
};

export function NotificationItem({
  notification,
  onRead,
}: {
  notification: AppNotification;
  onRead?: () => void;
}) {
  const Icon = ICONS[notification.type] ?? Bell;
  const body = notification.body ?? notification.message;

  return (
    <li
      className={cn(
        'flex gap-3 px-3 py-3 transition-colors',
        !notification.isRead && 'bg-brand/5'
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          TONES[notification.type] ?? 'bg-surface-raised text-muted'
        )}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', notification.isRead ? 'font-medium' : 'font-semibold')}>
          {notification.title}
        </p>
        {body && <p className="mt-0.5 text-sm text-muted">{body}</p>}
        <p className="mt-1 text-2xs text-muted">{formatRelative(notification.createdAt)}</p>
      </div>

      {!notification.isRead && onRead && (
        <button
          type="button"
          onClick={onRead}
          className="self-start text-2xs font-medium text-brand hover:underline"
        >
          Mark read
        </button>
      )}
    </li>
  );
}
