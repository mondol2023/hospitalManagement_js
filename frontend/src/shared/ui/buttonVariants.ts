import { cva } from 'class-variance-authority';

/**
 * The look of the app's button, separate from the component so a router `<Link>`
 * can wear it too: a navigation is a real link, not a button nested in one.
 *
 * `danger` is not a style choice — it is reserved for actions that destroy or
 * reverse something (void a bill, discharge, delete a record), matching the
 * rule that red only ever means "this matters" (see index.css). A "Save"
 * button never gets it, however much visual weight the page wants.
 */
export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control',
    'font-display font-medium tracking-tight',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-100',
    'active:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-fg hover:bg-brand/90',
        secondary: 'border border-line bg-surface text-content hover:bg-surface-raised',
        ghost: 'text-muted hover:bg-surface-raised hover:text-content',
        danger: 'bg-danger text-white hover:bg-danger/90',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-base',
        /** Square, for a lone icon. Pair with `aria-label`. */
        icon: 'h-9 w-9 p-0',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  }
);
