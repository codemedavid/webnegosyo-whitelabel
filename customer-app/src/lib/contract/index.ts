/**
 * The customer app's wire contract. SOURCE OF TRUTH — `customer-app/src/lib/contract/`
 * is a byte-identical copy (`npm run sync:contract` in customer-app), pinned by
 * tests/unit/app-contract/parity.test.ts. Depends on zod only; imports stay relative.
 */
export * from './envelope'
export * from './primitives'
export * from './theme'
export * from './config'
export * from './catalog'
export * from './loyalty'
export * from './orders'
