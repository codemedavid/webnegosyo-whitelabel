// Orders THIS device confirmed from the kitchen board, so its own cashier
// banner never echoes a tap it just made (an owner running the board and the
// register on one tablet). In memory only: a restart forgets, and the banner's
// first snapshot after a restart is silent anyway.

/** Enough for a long shift; older taps are long past their banner. */
const CAP = 200;

let confirmedHere: readonly string[] = [];

export function rememberConfirmedHere(orderId: string): void {
  confirmedHere = [...confirmedHere.filter((id) => id !== orderId), orderId].slice(-CAP);
}

/** A snapshot — later taps do not change a set already handed out. */
export function confirmedOnThisDevice(): ReadonlySet<string> {
  return new Set(confirmedHere);
}

export function resetConfirmedHereForTests(): void {
  confirmedHere = [];
}
