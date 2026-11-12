/**
 * Two copies decide which checkout questions mean name / phone / address /
 * table: the web's (`src/lib/checkout/question-roles.ts`, used by the customer
 * app's order path) and the register's (`webnegosyo-app/lib/pos-checkout-fields.ts`).
 * If they disagree, a renamed question is answered by one and asked twice by
 * the other.
 */
import { QUESTION_ROLE_ALIASES, questionRole } from '@/lib/checkout/question-roles'

jest.mock('../../../webnegosyo-app/lib/supabase', () => ({ supabase: {} }))
// eslint-disable-next-line @typescript-eslint/no-require-imports -- after the mock
const { fieldRole } = require('../../../webnegosyo-app/lib/pos-checkout-fields') as { fieldRole: (name: string) => string }

const SPELLINGS = [
  ...Object.values(QUESTION_ROLE_ALIASES).flat(),
  ...Object.values(QUESTION_ROLE_ALIASES).flat().map((alias) => alias.toUpperCase().replace(/ /g, '_')),
  ...Object.values(QUESTION_ROLE_ALIASES).flat().map((alias) => `  ${alias}: `),
  'delivery_address', 'customer_name', 'customer_phone', 'Landmark', 'pickup_date', 'Name of rider', '', 'contact person',
]

describe('question roles: web and register agree', () => {
  it.each(SPELLINGS)('%p', (name) => {
    expect(questionRole(name)).toBe(fieldRole(name))
  })
})
