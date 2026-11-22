import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());

describe('claimFirstDraw', () => {
  it('lets the first visit of a session draw the ward tracks', async () => {
    const { claimFirstDraw } = await import('./ward-draw');

    expect(claimFirstDraw()).toBe(true);
  });

  it('refuses every later visit in the same session', async () => {
    const { claimFirstDraw } = await import('./ward-draw');

    claimFirstDraw();

    expect(claimFirstDraw()).toBe(false);
    expect(claimFirstDraw()).toBe(false);
  });

  it('starts over in a new session, which is a fresh module', async () => {
    const first = await import('./ward-draw');
    first.claimFirstDraw();

    vi.resetModules();
    const second = await import('./ward-draw');

    expect(second.claimFirstDraw()).toBe(true);
  });
});
