/**
 * Setup for the rendered-component suite.
 *
 * Deliberately almost empty. RNTL v13 extends `expect` with its own matchers
 * the moment it is imported, so the only thing left to declare is the act
 * environment. Nothing that decides money is stubbed here — see the sheets'
 * tests for why.
 */

// Without it every state update logs an act() warning loud enough to hide a
// real one.
global.IS_REACT_ACT_ENVIRONMENT = true;
