import { expect, test } from 'claude-code/testing'

import { DAY, itemOfCall, lastUse, readUsage, recordUse, unusedNodes, usageKey, usageText } from './usage'

test('a call names the item it uses', () => {
  expect(itemOfCall('mcp__gmail__send', {})).toBe('mcp:gmail')
  expect(itemOfCall('Skill', { skill: 'superpowers:tdd' })).toBe('skill:superpowers:tdd')
  expect(itemOfCall('Skill', { skill: '/tdd' })).toBe('skill:tdd')
  expect(itemOfCall('Skill', {})).toBeUndefined()
  expect(itemOfCall('Bash', { command: 'ls' })).toBeUndefined()
  expect(itemOfCall('mcp__loadout__use_preset', {})).toBeUndefined()
})

test('recording counts and dates without changing the old value', () => {
  const empty = readUsage(undefined, 5)
  expect(empty).toEqual({ since: 5, items: {} })
  const once = recordUse(empty, 'mcp:gmail', 10)
  const twice = recordUse(once, 'mcp:gmail', 20)
  expect(once.items['mcp:gmail']).toEqual({ count: 1, last: 10 })
  expect(twice.items['mcp:gmail']).toEqual({ count: 2, last: 20 })
  expect(empty.items).toEqual({})
  expect(readUsage({ since: 1, items: { a: { count: 'x' }, b: { count: 2, last: 3 } } }, 9)).toEqual({
    since: 1,
    items: { b: { count: 2, last: 3 } },
  })
  expect(usageKey('/a/b')).toBe('usage:/a/b')
})

const node = (id: string, tokens: number, children: any[] = []) => ({ id, name: id, tokens, source: '', children })

test('a plugin counts as used when one of its parts was used', () => {
  const usage = { since: 0, items: { 'skill:p:a': { count: 1, last: 50 } } }
  const plugin = node('plugin:p', 10, [node('skill:p:a', 4), node('skill:p:b', 6)])
  expect(lastUse(plugin, usage)).toBe(50)
  expect(lastUse(node('skill:x', 1), usage)).toBeUndefined()
})

test('unused items are the top-level ones with no use inside the window', () => {
  const now = 40 * DAY
  const usage = { since: 0, items: { 'mcp:gmail': { count: 3, last: 35 * DAY }, 'skill:old': { count: 1, last: 2 * DAY } } }
  const nodes = [node('mcp:gmail', 5), node('skill:old', 7), node('skill:never', 9)]
  expect(unusedNodes(nodes, usage, now, 30).map(n => n.id)).toEqual(['skill:old', 'skill:never'])
})

test('the usage text lists the most used first with the date', () => {
  const usage = { since: 0, items: { a: { count: 1, last: DAY }, b: { count: 4, last: 2 * DAY } } }
  expect(usageText(usage, '/p')).toBe(
    'Usage in /p (since 1970-01-01):\n  4  b  last 1970-01-03\n  1  a  last 1970-01-02',
  )
  expect(usageText({ since: 0, items: {} }, '/p')).toContain('No calls counted yet')
})
