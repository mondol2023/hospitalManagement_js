/**
 * Builds the visible page window: first, last, the current page and its
 * neighbours, with gaps collapsed to an ellipsis. Pure and kept beside the
 * component rather than inside it, so it can be unit-tested without rendering —
 * the off-by-one cases (page 1 of 1, page 2 of 30, the last page) are exactly
 * where hand-rolled paginators break.
 */
export function pageWindow(current: number, totalPages: number, radius = 1): Array<number | '…'> {
  if (totalPages <= 1) return totalPages === 1 ? [1] : [];

  const pages = new Set<number>([1, totalPages]);
  for (let page = current - radius; page <= current + radius; page += 1) {
    if (page >= 1 && page <= totalPages) pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  let previous = 0;

  for (const page of sorted) {
    // A single skipped page becomes that page, not an ellipsis — "1 … 3" is
    // longer to read than "1 2 3" and hides a reachable target.
    if (page - previous === 2) out.push(page - 1);
    else if (page - previous > 2) out.push('…');
    out.push(page);
    previous = page;
  }

  return out;
}
