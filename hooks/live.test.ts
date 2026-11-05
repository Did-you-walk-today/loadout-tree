import { expect, test } from 'claude-code/testing'

import { bandText, historyText, markerOf, MAX_HISTORY, readHistory, statusText, withHistory } from './live'
import { DAY } from './usage'

const node = (id: string, children: any[] = []) => ({ id, name: id, tokens: 1, source: '', children })

test('the status line names the preset, items off and tokens saved', () => {
  expect(statusText('coding', 3, 1234)).toBe('Loadout: coding | 3 off | ~1234t saved (est.)')
  expect(statusText('', 0, 0)).toBe('Loadout: no preset | 0 off | ~0t saved (est.)')
})

test('the band says who switched and that it applies fully next session', () => {
  expect(bandText('coding', 'model', 3, 40)).toBe(
    'Loadout: switched to coding (by model). 3 off, ~40t saved (est.). Applies fully in a new session.',
  )
})

test('a row marker: in use beats just now beats off next session', () => {
  const state = { inFlight: ['mcp:a'], recent: ['mcp:a', 'skill:b'], pendingOff: ['skill:b', 'skill:c'] }
  expect(markerOf(node('mcp:a'), state)).toBe('in use')
  expect(markerOf(node('plugin:p', [node('mcp:a')]), state)).toBe('in use')
  expect(markerOf(node('skill:b'), state)).toBe('just now')
  expect(markerOf(node('skill:c'), state)).toBe('off next session')
  expect(markerOf(node('skill:d'), state)).toBeUndefined()
})

test('the history keeps the newest entries and reads safely', () => {
  const one = withHistory([], { at: DAY, preset: 'coding', by: 'user', off: 2 })
  expect(one).toEqual([{ at: DAY, preset: 'coding', by: 'user', off: 2 }])
  const many = Array.from({ length: MAX_HISTORY + 5 }, (_, i) => ({ at: i, preset: 'p', by: 'auto' as const, off: 0 }))
  expect(withHistory(many, { at: 99, preset: 'x', by: 'model', off: 1 }).length).toBe(MAX_HISTORY)
  expect(readHistory([{ at: 1, preset: 'a', by: 'user', off: 0 }, { at: 'x' }, { at: 2, preset: 'b', by: 'nobody', off: 0 }])).toEqual([
    { at: 1, preset: 'a', by: 'user', off: 0 },
  ])
  expect(historyText(one)).toBe('Preset switches, newest first:\n  1970-01-02 00:00  coding  by user  (2 off)')
  expect(historyText([])).toContain('No preset switches yet')
})
