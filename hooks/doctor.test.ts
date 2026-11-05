import { expect, test } from 'claude-code/testing'

import {
  cleanupText,
  DEFAULT_CONFLICTS,
  doctor,
  doctorText,
  expiredTrials,
  readConflicts,
  readTrials,
  TRIAL_DAYS,
  uninstallHint,
} from './doctor'
import { DAY } from './usage'

const inventory = {
  skills: [
    { name: 'code-review', tokens: 5, source: 'userSettings' },
    { name: 'engineering:code-review', plugin: 'engineering', tokens: 6, source: 'plugin' },
    { name: 'mattpocock:code-review', plugin: 'mattpocock', tokens: 4, source: 'plugin' },
    { name: 'ponytail:ponytail', plugin: 'ponytail', tokens: 30, source: 'plugin' },
    { name: 'superpowers:brainstorming', plugin: 'superpowers', tokens: 50, source: 'plugin' },
    { name: 'tdd', tokens: 9, source: 'userSettings' },
  ],
  servers: [
    { server: 'gmail', label: 'gmail', tokens: 7, tools: ['send', 'read'] },
    { server: 'gmail2', label: 'claude.ai Gmail', tokens: 9, tools: ['read', 'send'] },
    { server: 'figma', label: 'figma', tokens: 3, tools: ['authenticate'] },
  ],
  descriptions: {},
}

const now = 100 * DAY
const usage = {
  since: 50 * DAY,
  items: { 'mcp:gmail2': { count: 3, last: 99 * DAY }, 'skill:tdd': { count: 1, last: 99 * DAY } },
}

test('doctor finds duplicates, auth, overlaps, conflicts and unused items', () => {
  const report = doctor({ inventory, off: [], usage, now, conflicts: DEFAULT_CONFLICTS })
  expect(report.duplicates).toEqual([{ keep: 'mcp:gmail2', drop: ['mcp:gmail'], tokens: 7, tools: 2 }])
  expect(report.needsAuth).toEqual([{ id: 'mcp:figma', tokens: 3 }])
  expect(report.overlaps[0]).toEqual({
    word: 'review',
    keep: 'skill:engineering:code-review',
    drop: ['skill:code-review', 'skill:mattpocock:code-review'],
    tokens: 9,
  })
  expect(report.conflicts).toEqual([{ a: 'plugin:ponytail', b: 'plugin:superpowers', aTokens: 30, bTokens: 50 }])
  expect(report.heaviest[0]).toEqual({ id: 'plugin:superpowers', tokens: 50 })
  expect(report.unused.ids).toContain('skill:code-review')
  expect(report.unused.ids).not.toContain('skill:tdd')
  expect(report.unused.ids).not.toContain('mcp:gmail2')
})

test('items already off are not suggested again', () => {
  const report = doctor({ inventory, off: ['mcp:gmail', 'plugin:superpowers'], usage, now, conflicts: DEFAULT_CONFLICTS })
  expect(report.duplicates).toEqual([])
  expect(report.conflicts).toEqual([])
  expect(report.heaviest.map(h => h.id)).not.toContain('plugin:superpowers')
})

test('the doctor text gives tokens saved and a total', () => {
  const text = doctorText(doctor({ inventory, off: [], usage, now, conflicts: DEFAULT_CONFLICTS }), {
    cwd: '/p',
    now,
    since: usage.since,
  })
  expect(text).toContain('claude.ai Gmail = gmail (same 2 tools): keep claude.ai Gmail, off the rest saves ~7t')
  expect(text).toContain('figma: only an authenticate tool, off saves ~3t')
  expect(text).toContain('review: code-review, engineering:code-review, mattpocock:code-review')
  expect(text).toContain('ponytail + superpowers are both on: off ponytail saves ~30t, off superpowers ~50t')
  expect(text).toContain('Unused 30+ days in /p (counting since 1970-02-20, 50 days)')
  expect(text).toMatch(/If you take every suggestion above: ~\d+t/)
})

test('cleanup lists commands for the person to run, never runs them', () => {
  const report = doctor({ inventory, off: [], usage, now, conflicts: DEFAULT_CONFLICTS })
  const text = cleanupText(report, inventory)
  expect(text).toContain('gmail  ~7t  claude mcp remove "gmail"')
  expect(text).toContain('figma  ~3t  claude mcp remove "figma"')
  expect(text).toContain('ponytail  ~30t  claude plugin uninstall ponytail')
  expect(text).toContain('code-review  ~5t  delete the folder ~/.claude/skills/code-review')
  expect(text).toContain('Loadout never runs these')
  expect(text).toContain('/loadout trial <name>')
  expect(uninstallHint({ id: 'mcp:x', name: 'claude.ai Gmail', tokens: 1, source: '', children: [] }, inventory)).toBe(
    'remove the connector in claude.ai Settings, Connectors',
  )
})

test('trials end after their date', () => {
  expect(readTrials({ a: 5, b: 'x' })).toEqual({ a: 5 })
  expect(expiredTrials({ a: 5, b: 50 }, 10)).toEqual(['a'])
  expect(TRIAL_DAYS).toBe(14)
})

test('conflict pairs read safely from the store', () => {
  expect(readConflicts(undefined)).toEqual(DEFAULT_CONFLICTS)
  expect(readConflicts([['a', 'b'], ['c'], 'x'])).toEqual([['a', 'b']])
  expect(readConflicts([])).toEqual([])
})
