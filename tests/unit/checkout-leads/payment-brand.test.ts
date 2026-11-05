/**
 * The funnel shows the real GCash / BPI logo for a platform payment method
 * and pulls the account name + number out of its free-text details so the
 * buyer can copy the number instead of retyping it.
 */
import { describe, it, expect } from '@jest/globals'
import { paymentBrandFor, parsePaymentDetails } from '@/lib/checkout-leads/payment-brand'

describe('paymentBrandFor', () => {
  it.each(['Gcash', 'GCash', ' gcash ', 'G-Cash', 'GCash (InstaPay)'])('gives %p the GCash logo', (name) => {
    expect(paymentBrandFor(name)).toMatchObject({ id: 'gcash', logoSrc: '/payments/gcash.svg' })
  })

  it.each(['BPI', 'bpi', 'BPI Savings', 'Bank of the Philippine Islands'])('gives %p the BPI logo', (name) => {
    expect(paymentBrandFor(name)).toMatchObject({ id: 'bpi', logoSrc: '/payments/bpi.svg' })
  })

  it('has no logo for a method it does not know, so the name is shown instead', () => {
    expect(paymentBrandFor('Maya')).toBeNull()
    expect(paymentBrandFor('Cash on pickup')).toBeNull()
    expect(paymentBrandFor('')).toBeNull()
  })

  it('does not mistake a word that merely contains the letters for BPI', () => {
    expect(paymentBrandFor('Subpixel Bank')).toBeNull()
  })

  it('spells the brand its own way whatever staff typed', () => {
    expect(paymentBrandFor('Gcash')?.displayName).toBe('GCash')
    expect(paymentBrandFor('bpi')?.displayName).toBe('BPI')
  })

  it('names the number the way each wallet does', () => {
    expect(paymentBrandFor('GCash')?.numberLabel).toBe('GCash number')
    expect(paymentBrandFor('BPI')?.numberLabel).toBe('Account number')
  })
})

describe('parsePaymentDetails', () => {
  it('reads the account name and number from "name / number" lines', () => {
    expect(parsePaymentDetails('John Angelo David\n09928214519')).toEqual({
      accountName: 'John Angelo David',
      accountNumber: '09928214519',
      extraLines: [],
    })
  })

  it('reads them in either order and keeps any other line', () => {
    expect(parsePaymentDetails('0656 982 775\nJohn Angelo David\nSavings account')).toEqual({
      accountName: 'John Angelo David',
      accountNumber: '0656982775',
      extraLines: ['Savings account'],
    })
  })

  it('copies the digits only, without the spaces or dashes', () => {
    expect(parsePaymentDetails('0992-821-4519')?.accountNumber).toBe('09928214519')
  })

  it('treats a short digit line as text, not an account number', () => {
    expect(parsePaymentDetails('Branch 12\nJohn Angelo David')).toEqual({
      accountName: 'Branch 12',
      accountNumber: null,
      extraLines: ['John Angelo David'],
    })
  })

  it('returns null when there are no details', () => {
    expect(parsePaymentDetails(null)).toBeNull()
    expect(parsePaymentDetails('  \n ')).toBeNull()
  })
})
