import { describe, expect, it } from 'vitest';

import { highlightFlash, STAGGER, staggerDelay, staggerRow } from './variants';

describe('highlightFlash', () => {
  // It marks which event a deep link meant, once. A loop would read as an alert,
  // and the only looping motion in the product is `alertPulse` on emergencies.
  it('fades once from visible to gone, over 1.2 seconds', () => {
    const flash = highlightFlash.flash as {
      opacity: number[];
      transition: Record<string, unknown>;
    };

    expect(flash.opacity[0]).toBeGreaterThan(0);
    expect(flash.opacity.at(-1)).toBe(0);
    expect(flash.transition.duration).toBe(1.2);
    expect(flash.transition).not.toHaveProperty('repeat');
  });

  it('rests invisible and animates opacity only', () => {
    expect(highlightFlash.rest).toEqual({ opacity: 0 });
    expect(Object.keys(highlightFlash.flash as object).sort()).toEqual(['opacity', 'transition']);
  });
});

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
