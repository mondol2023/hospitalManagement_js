import { motion } from 'framer-motion';
import { MessagesSquare } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { formatRelative, initials } from '@/shared/lib/format';
import { staggerItem, staggerList } from '@/shared/motion/variants';
import { type Conversation } from '@/shared/types/domain';
import { Badge, EmptyState, SkeletonText } from '@/shared/ui';

import { conversationTitle } from './conversation-title';

const TYPE_LABEL: Record<Conversation['type'], string> = {
  care_team: 'Care team',
  staff_only: 'Staff',
  direct: 'Direct',
};

export function ConversationList({
  conversations,
  selectedId,
  viewerId,
  isLoading,
  onSelect,
}: {
  conversations: Conversation[];
  selectedId?: string;
  viewerId?: string;
  isLoading?: boolean;
  onSelect: (conversation: Conversation) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3 p-3">
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonText key={index} lines={2} />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="No conversations"
        description="Start one, or wait to be added to a care team."
      />
    );
  }

  return (
    <motion.ul
      variants={staggerList}
      initial="hidden"
      animate="visible"
      className="divide-y divide-line"
    >
      {conversations.map((conversation) => {
        const selected = conversation.id === selectedId;
        const unread = conversation.unreadCount ?? 0;
        const title = conversationTitle(conversation, viewerId);

        return (
          <motion.li key={conversation.id} variants={staggerItem}>
            <button
              type="button"
              onClick={() => onSelect(conversation)}
              aria-current={selected ? 'true' : undefined}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-3 text-left transition-colors',
                selected ? 'bg-brand/10' : 'hover:bg-surface-raised'
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  selected ? 'bg-brand text-brand-fg' : 'bg-surface-raised text-muted'
                )}
                aria-hidden="true"
              >
                {initials(title)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={cn('truncate text-sm', unread > 0 ? 'font-semibold' : 'font-medium')}>
                    {title}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted">
                    {conversation.lastMessageAt ? formatRelative(conversation.lastMessageAt) : ''}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className="label-eyebrow text-muted">{TYPE_LABEL[conversation.type]}</span>
                  {conversation.isArchived && <span className="text-[11px] text-muted">Archived</span>}
                  {unread > 0 && (
                    <Badge tone="brand" className="ml-auto">
                      {unread > 99 ? '99+' : unread}
                    </Badge>
                  )}
                </span>
              </span>
            </button>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}
