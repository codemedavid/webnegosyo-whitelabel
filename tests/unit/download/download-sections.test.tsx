import { describe, it, expect, jest, afterEach } from '@jest/globals'
import { render, screen, within } from '@testing-library/react'
import { ListingStats } from '@/components/download/listing-stats'
import { WhatsNew } from '@/components/download/whats-new'
import type { AppStoreListing } from '@/lib/download/app-store-listing'

const LISTING: AppStoreListing = {
  rating: 4.8,
  ratingCount: 12,
  version: '1.0.14',
  releaseNotes: [],
  releasedAt: '2026-10-16T00:00:00Z',
  minimumOsVersion: '15.1',
}

function versionCell() {
  const label = screen.getByText('Version')
  return within(label.parentElement as HTMLElement)
}

describe('ListingStats version', () => {
  it('shows the App Store version when the listing was read', () => {
    render(<ListingStats listing={LISTING} fallbackVersion="9.9.9" />)
    expect(versionCell().getByText('1.0.14')).toBeTruthy()
  })

  it('falls back to the configured iOS version, never another platform\'s', () => {
    render(<ListingStats listing={null} fallbackVersion="1.0.13" />)
    expect(versionCell().getByText('1.0.13')).toBeTruthy()
  })

  it('shows a dash when no iOS version is known', () => {
    render(<ListingStats listing={null} fallbackVersion={null} />)
    expect(versionCell().getByText('—')).toBeTruthy()
  })
})

describe('WhatsNew', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders repeated release-note lines without duplicate React keys', () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {})
    const notes = ['Bug fixes', 'Bug fixes', 'Faster printing', 'Bug fixes', 'Bug fixes']

    render(<WhatsNew listing={{ ...LISTING, releaseNotes: notes }} appStoreUrl={null} />)

    expect(screen.getAllByText('Bug fixes')).toHaveLength(4)
    const keyWarnings = errors.mock.calls.filter((call) => String(call[0]).includes('same key'))
    expect(keyWarnings).toEqual([])
  })
})
