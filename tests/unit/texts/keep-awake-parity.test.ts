/**
 * The merchant app's keep-awake steps must be BYTE-IDENTICAL to the web's, so
 * the phone and the Texts page never tell an owner two different things.
 * If this fails: copy src/lib/texts/keep-awake.ts over the app file.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

test('the app copy of keep-awake.ts is byte-identical to the web copy', () => {
  const web = readFileSync(join(process.cwd(), 'src/lib/texts/keep-awake.ts'), 'utf8')
  const app = readFileSync(join(process.cwd(), 'webnegosyo-app/lib/sms-automations/keep-awake.ts'), 'utf8')
  expect(app).toBe(web)
})
