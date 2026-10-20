import { CAMPAIGN_DISPLAY_STATES, PHONE_STATES } from '@/lib/texts/types'
import { activityChip, campaignChip, phoneChip } from '@/lib/texts/view/chips'

describe('status chips', () => {
  test('every campaign state has a label and a tone', () => {
    for (const state of CAMPAIGN_DISPLAY_STATES) {
      const chip = campaignChip(state)
      expect(chip.label.length).toBeGreaterThan(0)
      expect(chip.tone).toBeTruthy()
    }
  })

  test('campaign chips follow the spec words and colours', () => {
    expect(campaignChip('sending')).toMatchObject({ label: 'Sending', tone: 'emerald', isPulsing: true })
    expect(campaignChip('waiting_for_phone')).toMatchObject({ label: 'Waiting for phone', tone: 'amber' })
    expect(campaignChip('repeating')).toMatchObject({ label: 'Repeating', tone: 'sky', icon: 'repeat' })
    expect(campaignChip('sent')).toMatchObject({ label: 'Sent', tone: 'emerald', icon: 'check' })
    expect(campaignChip('archived')).toMatchObject({ label: 'Archived', tone: 'grey', isOutline: true })
    expect(campaignChip('app_managed').label).toBe('You send it from the app')
  })

  test('only Sending pulses', () => {
    const pulsing = CAMPAIGN_DISPLAY_STATES.filter((state) => campaignChip(state).isPulsing)
    expect(pulsing).toEqual(['sending'])
  })

  test('phone chips', () => {
    for (const state of PHONE_STATES) expect(phoneChip(state, false).label).toBeTruthy()
    expect(phoneChip('late', false)).toMatchObject({ label: 'Checking in late', tone: 'amber' })
    expect(phoneChip('resting', false).label).toBe('Resting')
    expect(phoneChip('offline', true).label).toBe('Inactive')
    expect(phoneChip('never', false).label).toBe('Never checked in')
  })

  test('activity chips', () => {
    expect(activityChip('queued')).toMatchObject({ label: 'Waiting', tone: 'amber' })
    expect(activityChip('claimed')).toMatchObject({ label: 'Sending', isPulsing: true })
    expect(activityChip('sent')).toMatchObject({ label: 'Sent', tone: 'emerald' })
    expect(activityChip('failed')).toMatchObject({ label: 'Not sent', tone: 'grey' })
    expect(activityChip('expired').label).toBe('Not sent')
  })
})
