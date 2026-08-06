import { ShieldOff, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, EmptyState } from '@/shared/ui';

/**
 * Where the role guard sends someone who reached a page their role cannot use.
 *
 * It names the limitation plainly rather than pretending the page does not
 * exist. Staff who hit this need to know whether to ask an administrator for
 * access or whether they simply took a wrong link.
 */
export function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={ShieldOff}
        title="You do not have access to this area"
        description="Your role does not include this section. If you need it for your work, ask an administrator to review your access."
        action={
          <Button variant="secondary" onClick={() => window.history.back()}>
            Go back
          </Button>
        }
      />
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The link may be out of date, or the record it pointed to has been removed."
        action={
          <Link to="/">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        }
      />
    </div>
  );
}
