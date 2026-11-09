/** @jest-environment node */
import { parsePastedLocation } from '@/lib/maps/pasted-location'

describe('parsePastedLocation', () => {
  it.each([
    ['14.5995, 120.9842', 14.5995, 120.9842],
    ['14.5995,120.9842', 14.5995, 120.9842],
    ['(7.09, 125.504)', 7.09, 125.504],
    ['https://www.google.com/maps/@14.5995,120.9842,17z', 14.5995, 120.9842],
    ['https://www.google.com/maps/place/Paniqui/@15.66,120.58,17z/data=!3m1!4b1!4m6!3m5!1s0x0!8m2!3d15.6612!4d120.5825', 15.6612, 120.5825],
    ['https://maps.google.com/?q=15.6612,120.5825', 15.6612, 120.5825],
    ['https://www.google.com/maps/search/?api=1&query=15.6612,120.5825', 15.6612, 120.5825],
    ['https://www.google.com.ph/maps/dir/?api=1&destination=15.6612,120.5825', 15.6612, 120.5825],
    ['https://maps.apple.com/?ll=15.6612,120.5825&q=Home', 15.6612, 120.5825],
    ['www.google.com/maps/@14.5995,120.9842,17z', 14.5995, 120.9842],
  ])('finds the spot in %p', (text, lat, lng) => {
    expect(parsePastedLocation(text)).toEqual({ kind: 'point', point: { lat, lng } })
  })

  it('prefers the place over where the map happened to look', () => {
    expect(parsePastedLocation('https://www.google.com/maps/place/X/@1.5,2.5,17z/data=!3d14.5!4d120.5')).toEqual({ kind: 'point', point: { lat: 14.5, lng: 120.5 } })
  })

  it('reads a link that names a place as words to search', () => {
    expect(parsePastedLocation('https://maps.google.com/?q=Paniqui+Public+Market')).toEqual({ kind: 'query', query: 'Paniqui Public Market' })
    expect(parsePastedLocation('https://www.google.com/maps/place/Paniqui+Public+Market')).toEqual({ kind: 'query', query: 'Paniqui Public Market' })
  })

  it('hands short links to the server', () => {
    expect(parsePastedLocation('https://maps.app.goo.gl/AbC123')).toEqual({ kind: 'short-link', url: 'https://maps.app.goo.gl/AbC123' })
    expect(parsePastedLocation('https://goo.gl/maps/AbC123')).toEqual({ kind: 'short-link', url: 'https://goo.gl/maps/AbC123' })
  })

  it.each([
    'Blk 4 Lot 12 Camella Tanza',
    '123 Zamora St',
    '14.5995',
    '0.0, 0.0',
    '95.5, 120.5',
    'https://goo.gl/abc',
    'https://evil.example.com/maps/@14.5,120.9,17z',
    'https://google.evil.com/maps/@14.5,120.9,17z',
    'https://www.google.com/search?q=14.5,120.9',
    'not a url at all',
  ])('reads %p as no location', (text) => {
    expect(parsePastedLocation(text)).toBeNull()
  })
})
