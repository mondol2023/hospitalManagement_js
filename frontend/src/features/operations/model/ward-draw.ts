/**
 * Whether this visit to the ops board gets to draw the ward tracks.
 *
 * The draw is the slice's one orchestrated moment (spec §5.8), so it plays once
 * per session. The flag is module state on purpose: it lives exactly as long as
 * the page does, and a reload is a new session.
 */
let drawn = false;

export function claimFirstDraw(): boolean {
  if (drawn) return false;
  drawn = true;
  return true;
}
