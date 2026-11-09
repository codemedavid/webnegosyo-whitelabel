/** @jest-environment node */
import { describe, expect, it } from '@jest/globals'
import { isSameOriginRequest } from '@/lib/http/same-origin'
import { isSameOriginRequest as reExported } from '@/lib/order-deletion/access'

describe('isSameOriginRequest home', () => {
  it('order deletion still reads the one shared check', () => {
    expect(reExported).toBe(isSameOriginRequest)
  })

  it('accepts same host, refuses a page elsewhere', () => {
    const headers = (origin: string) => new Headers({ origin, host: 'www.webnegosyo.com' })
    expect(isSameOriginRequest(headers('https://www.webnegosyo.com'))).toBe(true)
    expect(isSameOriginRequest(headers('https://evil.example'))).toBe(false)
  })
})
