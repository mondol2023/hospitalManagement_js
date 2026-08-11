import { refObject, type Conversation, type User } from '@/shared/types/domain';
import { patientName } from '@/features/patients';

/**
 * A thread's name, worked out rather than stored.
 *
 * Only staff threads carry a title. A care-team thread is named after the
 * patient it is about — that is the thing the reader is scanning for — and a
 * direct thread after the other person, which means resolving "the other
 * person" against the viewer rather than taking participant zero.
 *
 * Both the list and the thread header need this, and it is not a component, so
 * it sits in its own module rather than costing `ConversationList` its fast
 * refresh.
 */
export function conversationTitle(
  conversation: Conversation,
  viewerId: string | undefined
): string {
  if (conversation.title) return conversation.title;

  if (conversation.type === 'care_team') {
    const patient = refObject(conversation.patient);
    return patient ? `${patientName(patient)} · care team` : 'Care team';
  }

  const others = conversation.participants
    .map((participant) => refObject(participant))
    .filter((participant): participant is User => Boolean(participant) && participant?.id !== viewerId);

  if (others.length === 0) return 'Conversation';
  if (others.length === 1) return others[0]?.name ?? 'Conversation';
  return `${others[0]?.name} and ${others.length - 1} others`;
}
