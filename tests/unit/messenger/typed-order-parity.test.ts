import fs from 'fs'
import path from 'path'

// The bot (web) and the merchant app's "Found in chat" read typed orders with
// the SAME matcher, so a dish the bot noticed is a dish the app offers.
describe('typed-order matcher parity', () => {
  it('is byte-identical in the web and the merchant app', () => {
    const web = fs.readFileSync(path.join(process.cwd(), 'src/lib/messenger/typed-order.ts'), 'utf8')
    const app = fs.readFileSync(path.join(process.cwd(), 'webnegosyo-app/lib/messenger-chat/typed-order.ts'), 'utf8')
    expect(app).toBe(web)
  })
})
