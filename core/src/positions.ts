// Positions are numbers and an item moves by taking one between two others, so a
// move is one write however many items it jumps over, hidden ones included. When
// two neighbors come too close, the folder is renumbered once.
export const POSITION_GAP_MIN = 1e-6;

export function nextPosition(last: number | undefined): number {
  return last === undefined ? 1 : Math.floor(last) + 1;
}

export function between(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return (after as number) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

export function tooClose(a: number, b: number): boolean {
  return Math.abs(b - a) < POSITION_GAP_MIN;
}
