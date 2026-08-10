import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
/**
 * The one className helper. `twMerge` resolves Tailwind conflicts by
 * last-wins (`p-2 p-4` → `p-4`), which is what lets a caller override a
 * component's default padding without an `!important` arms race.
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
