import { Activity, CalendarDays, MessageSquare, Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';

import { appPath } from '@/shared/lib/routes';
import { Card, CardBody, CardHeader, PageHeader } from '@/shared/ui';

/** Where a patient lands. No analytics, just the four things they came for. */
const PATIENT_LINKS = [
  {
    to: appPath('appointments'),
    icon: CalendarDays,
    title: 'Appointments',
    description: 'Book a visit, or check when your next one is.',
  },
  {
    to: appPath('billing'),
    icon: Receipt,
    title: 'Bills',
    description: 'Statements, payments and anything outstanding.',
  },
  {
    to: appPath('messages'),
    icon: MessageSquare,
    title: 'Messages',
    description: 'Talk to your care team.',
  },
] as const;

export function PatientHome({ name }: { name?: string }) {
  return (
    <div>
      <PageHeader
        title={name ? `Welcome, ${name.split(' ')[0]}` : 'Welcome'}
        description="Your appointments, bills and messages in one place."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PATIENT_LINKS.map(({ to, icon: Icon, title, description }) => (
          <Link
            key={to}
            to={to}
            className="rounded-card border border-line bg-surface p-4 transition-colors hover:border-brand hover:bg-surface-raised"
          >
            <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-control bg-brand-soft text-brand">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="font-display text-sm font-semibold">{title}</p>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </Link>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader title="In an emergency" />
        <CardBody className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="text-sm text-muted">
            Do not use this app to report an emergency. Call your local emergency number, or go to
            the nearest emergency department.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
