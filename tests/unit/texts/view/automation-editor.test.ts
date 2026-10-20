import { automationMessageProblem, canStep, renderAutomationSample, sentenceFor, stepKnob, toApiDraft, unitFor } from '@/lib/texts/view/automation-editor'

describe('automation editor', () => {
  test('sentences and units', () => {
    expect(sentenceFor('win_back')).toMatchObject({ before: 'Text guests who haven’t ordered in', knob: 'inactiveDays' })
    expect(unitFor(1, 'days')).toBe('day')
    expect(unitFor(3, 'days')).toBe('days')
  })

  test('inactive days move in fives inside the limits', () => {
    expect(stepKnob(30, 1, 'inactiveDays', [7, 180])).toBe(35)
    expect(stepKnob(32, -1, 'inactiveDays', [7, 180])).toBe(30)
    expect(stepKnob(3, 1, 'delayHours', [1, 72])).toBe(4)
    expect(canStep(180, 1, [7, 180])).toBe(false)
  })

  test('the api draft drops an empty name', () => {
    expect(toApiDraft({ recipe: 'win_back', name: null, params: {}, messageTemplate: 'Hi', runMode: 'auto', reentryDays: null }))
      .toEqual({ recipe: 'win_back', params: {}, messageTemplate: 'Hi', runMode: 'auto', reentryDays: null })
  })

  test('message problems and sample render', () => {
    expect(automationMessageProblem('Hi {{rewardName}}', ['firstName'])).toBe("We don't know {{rewardName}}. Use the chips above.")
    expect(automationMessageProblem('Hi {{firstName}}', ['firstName'])).toBeNull()
    expect(renderAutomationSample('Hi {{firstName}} {{menuLink}}', 'Kape', 'kape')).toBe('Hi Maria https://kape.webnegosyo.com/menu')
  })
})
