/**
 * The design system's public surface. Features import from `@/shared/ui`, never
 * from a file inside it — that keeps primitives free to move or split without
 * touching call sites, and makes an accidental import of an internal helper
 * visible in review.
 */
export { Badge, StatusBadge, SeverityDot, type BadgeProps } from './Badge';
export { Button, type ButtonProps } from './Button';
export { buttonVariants } from './buttonVariants';
export { BrandMark } from './BrandMark';
export { EmergencyStrip } from './EmergencyStrip';
export { Card, CardHeader, CardBody, CardFooter, Metric } from './Card';
export { DataTable, type Column } from './DataTable';
export { EmptyState, ErrorState } from './EmptyState';
export { Field } from './Field';
export { useFieldControl } from './field-context';
export { Input, Select, Textarea } from './Input';
export { Modal, ConfirmDialog } from './Modal';
export { PageHeader } from './PageHeader';
export { Pagination } from './Pagination';
export { pageWindow } from './page-window';
export { Skeleton, SkeletonText } from './Skeleton';
export { Spinner } from './Spinner';
export { Toaster } from './Toaster';
export { toast, useToastStore, type Toast } from './toast-store';
