import { describe, expect, it } from 'vitest';

import { STAGGER, staggerDelay, staggerRow } from './variants';

type Resolve = (index: number) => { opacity: number; y: number; transition: { delay: number } };

const visible = staggerRow.visible as Resolve;

describe('staggerRow', () => {
  // framer-motion lets a variant's own `transition` replace the element's
  // `transition` prop, so a delay passed as a prop is silently dropped. The delay
  // has to be inside the variant, which is what `custom` carries the index for.
  it('puts the delay inside the variant, from the row index', () => {
    expect(visible(0).transition.delay).toBe(0);
    expect(visible(3).transition.delay).toBeCloseTo(3 * STAGGER.each);
  });

  it('stops delaying after the first six rows', () => {
    expect(visible(6).transition.delay).toBeCloseTo(staggerDelay(STAGGER.max));
    expect(visible(40).transition.delay).toBe(visible(6).transition.delay);
  });

  it('moves only opacity and y', () => {
    expect(Object.keys(staggerRow.hidden as object).sort()).toEqual(['opacity', 'y']);
    expect(Object.keys(visible(0)).sort()).toEqual(['opacity', 'transition', 'y']);
  });
});
