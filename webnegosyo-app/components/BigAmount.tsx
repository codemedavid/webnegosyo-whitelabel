/**
 * The shared hero figure (smaller ₱, tabular digits, a spoken amount for
 * screen readers). It was born in Expenses; cash screens (drawer count, verdict,
 * remit) import it from here. It is re-exported rather than moved so the
 * Expenses and Profit screens keep their imports untouched.
 */
export { BigAmount } from "./expenses/BigAmount";
