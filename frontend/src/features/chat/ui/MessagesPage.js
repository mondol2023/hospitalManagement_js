import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { useConnectionState } from '@/shared/realtime/useSocketEvent';
import { Badge, Button, Card, PageHeader, Select } from '@/shared/ui';
import { selectUser, useAuthStore } from '@/features/auth';
import { useChatStream, useConversation, useInbox } from '../model/use-chat';
import { ConversationList } from './ConversationList';
import { NewThreadModal } from './NewThreadModal';
import { ThreadView } from './ThreadView';
const TYPE_FILTERS = [
    { value: '', label: 'All conversations' },
    { value: 'care_team', label: 'Care teams' },
    { value: 'staff_only', label: 'Staff' },
    { value: 'direct', label: 'Direct' },
];
/**
 * Messages: inbox rail beside the open thread.
 *
 * `useChatStream` is mounted here and nowhere else. It is the single subscriber
 * that applies pushed messages to the cache, and mounting it twice would apply
 * every message twice — the thread pane deliberately does not register its own.
 *
 * On a narrow screen the two panes become one: the rail until a thread is
 * picked, the thread after. A 40%-wide chat column on a phone is unreadable,
 * and this is a screen people use on a phone while walking a ward.
 */
export function MessagesPage() {
    const [type, setType] = useState('');
    const [selectedId, setSelectedId] = useState();
    const [newThreadOpen, setNewThreadOpen] = useState(false);
    const viewer = useAuthStore(selectUser);
    const connection = useConnectionState();
    const inbox = useInbox({ limit: 50, ...(type ? { type } : {}) });
    const conversations = useMemo(() => inbox.data?.items ?? [], [inbox.data]);
    // The row in the inbox is the freshest copy — it carries the unread count the
    // list renders. The detail query is only the fallback for a thread that was
    // just created and has not made it into this page of the inbox yet.
    const fromInbox = conversations.find((conversation) => conversation.id === selectedId);
    const detail = useConversation(fromInbox ? undefined : selectedId);
    const selected = fromInbox ?? detail.data;
    useChatStream(selectedId);
    const open = (conversation) => setSelectedId(conversation.id);
    return (_jsxs("div", { className: "flex h-full min-h-0 flex-col", children: [_jsx(PageHeader, { title: "Messages", description: "Care teams, staff threads and direct conversations.", action: _jsx(Button, { leadingIcon: _jsx(Plus, { className: "h-4 w-4" }), onClick: () => setNewThreadOpen(true), children: "New conversation" }), children: _jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsx(Select, { value: type, "aria-label": "Filter conversations by type", className: "w-56", onChange: (event) => setType(event.target.value), children: TYPE_FILTERS.map((filter) => (_jsx("option", { value: filter.value, children: filter.label }, filter.value))) }), connection !== 'connected' && (_jsx(Badge, { tone: "warning", children: connection === 'connecting' ? 'Reconnecting…' : 'Live updates offline' }))] }) }), _jsxs(Card, { className: "flex min-h-0 flex-1 overflow-hidden p-0", children: [_jsx("aside", { className: cn('w-full shrink-0 overflow-y-auto border-line scrollbar-thin md:w-80 md:border-r', selectedId ? 'hidden md:block' : 'block'), children: _jsx(ConversationList, { conversations: conversations, selectedId: selectedId, viewerId: viewer?.id, isLoading: inbox.isLoading, onSelect: open }) }), _jsxs("section", { className: cn('min-h-0 min-w-0 flex-1 flex-col', selectedId ? 'flex' : 'hidden md:flex'), children: [selectedId && (_jsx("div", { className: "border-b border-line px-4 py-2 md:hidden", children: _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setSelectedId(undefined), children: "\u2190 All conversations" }) })), _jsx("div", { className: "min-h-0 flex-1", children: _jsx(ThreadView, { conversation: selected, viewerId: viewer?.id }) })] })] }), _jsx(NewThreadModal, { open: newThreadOpen, onOpenChange: setNewThreadOpen, onCreated: (conversation) => setSelectedId(conversation.id) })] }));
}
