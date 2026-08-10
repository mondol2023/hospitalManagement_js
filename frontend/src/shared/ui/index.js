/**
 * The design system's public surface. Features import from `@/shared/ui`, never
 * from a file inside it — that keeps primitives free to move or split without
 * touching call sites, and makes an accidental import of an internal helper
 * visible in review.
 */
export { Badge, StatusBadge, SeverityDot } from './Badge';
export { Button } from './Button';
export { Card, CardHeader, CardBody, CardFooter, Metric } from './Card';
export { DataTable } from './DataTable';
export { EmptyState, ErrorState } from './EmptyState';
export { Field, useFieldControl } from './Field';
export { Input, Select, Textarea } from './Input';
export { Modal, ConfirmDialog } from './Modal';
export { PageHeader } from './PageHeader';
export { Pagination, pageWindow } from './Pagination';
export { Skeleton, SkeletonText } from './Skeleton';
export { Spinner } from './Spinner';
export { Toaster } from './Toaster';
export { toast, useToastStore } from './toast-store';
