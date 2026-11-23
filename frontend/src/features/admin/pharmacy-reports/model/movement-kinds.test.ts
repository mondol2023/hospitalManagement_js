import { describe, expect, it } from 'vitest';

import { STOCK_MOVEMENT_KINDS } from '../api/reports-api';
import { KIND_LABEL, formatChange, formatOnHand, parseKind } from './movement-kinds';

describe('KIND_LABEL', () => {
  it('names every kind the server can send, in plain words', () => {
    expect(KIND_LABEL).toEqual({
      restock: 'Restock',
      dispense: 'Dispensed',
      adjust: 'Adjusted',
      administered: 'Given to patient',
      restored: 'Returned to stock',
      withdrawn: 'Written off',
    });
    expect(Object.keys(KIND_LABEL).sort()).toEqual([...STOCK_MOVEMENT_KINDS].sort());
  });
});

describe('parseKind', () => {
  it('passes a known kind through and drops anything else', () => {
    expect(parseKind('withdrawn')).toBe('withdrawn');
    expect(parseKind('theft')).toBeNull();
    expect(parseKind('')).toBeNull();
    expect(parseKind(null)).toBeNull();
  });
});

describe('formatChange', () => {
  it('always shows the sign, so colour is never the only cue', () => {
    expect(formatChange(120, 'tablet')).toBe('+120 tablets');
    expect(formatChange(-4, 'vial')).toBe('−4 vials');
  });

  it('uses a true minus sign, not a hyphen', () => {
    expect(formatChange(-4, 'strip').startsWith('−')).toBe(true);
  });

  it('says one, not "1s"', () => {
    expect(formatChange(1, 'bottle')).toBe('+1 bottle');
    expect(formatChange(-1, 'capsule')).toBe('−1 capsule');
  });

  it('leaves measures alone: millilitres and milligrams do not take an s', () => {
    expect(formatChange(-4, 'ml')).toBe('−4 ml');
    expect(formatChange(250, 'mg')).toBe('+250 mg');
  });

  it('shows zero without a sign', () => {
    expect(formatChange(0, 'tablet')).toBe('0 tablets');
  });
});

describe('formatOnHand', () => {
  it('is the balance with its unit', () => {
    expect(formatOnHand(60, 'tablet')).toBe('60 tablets');
    expect(formatOnHand(1, 'vial')).toBe('1 vial');
    expect(formatOnHand(0, 'ml')).toBe('0 ml');
  });
});
