import { expect, test } from 'claude-code/testing'

import { buildTree } from './logic'
import { categoryFolders, classifyTodo, detectTask, drafts, parseCategories, preview, previewText } from './recommend'
import { DAY } from './usage'

const inventory = {
  skills: [
    { name: 'tdd', tokens: 9, source: 'userSettings' },
    { name: 'seo-audit', tokens: 20, source: 'userSettings' },
    { name: 'sales:forecast', plugin: 'sales', tokens: 30, source: 'plugin' },
  ],
  servers: [
    { server: 'gmail', label: 'gmail', tokens: 7, tools: ['send'] },
    { server: 'loadout', label: 'loadout', tokens: 2, tools: ['use_preset'] },
  ],
  descriptions: { tdd: 'Write tests first' },
}
const categories = {
  'skill:tdd': { source: 'Write tests first', category: 'coding' },
  'skill:seo-audit': { source: '', category: 'seo' },
  'plugin:sales': { source: 'forecast', category: 'sales' },
  'mcp:gmail': { source: '1 tools: send', category: 'writing' },
}
const now = 100 * DAY
const usage = { since: 0, items: { 'mcp:gmail': { count: 1, last: 99 * DAY } } }

test('a prompt suggests the preset whose kind of work it reads like', () => {
  expect(detectTask('fix the failing test in the parser and refactor it', ['coding', 'planning'])).toBe('coding')
  expect(detectTask('draft a roadmap and a spec for next quarter', ['coding', 'planning'])).toBe('planning')
  expect(detectTask('use my seo preset please', ['seo', 'coding'])).toBe('seo')
  expect(detectTask('hello there', ['coding'])).toBeUndefined()
  expect(detectTask('fix a bug', [])).toBeUndefined()
  expect(detectTask('one bug', ['coding'])).toBeUndefined()
})

test('category replies keep only known categories', () => {
  expect(parseCategories('{"a":"coding","b":"cooking","c":3}')).toEqual({ a: 'coding' })
})

test('only top-level items with a changed description are sent to classify', () => {
  const todo = classifyTodo(inventory, categories).map(n => n.id)
  expect(todo).toEqual(['mcp:loadout'])
})

test('drafts come from usage and from categories, never turning Loadout or starred items off', () => {
  const list = drafts({ inventory, usage, now, categories, starred: ['skill:seo-audit'] })
  const unused = list.find(d => d.name === 'unused')
  expect(unused?.off.sort()).toEqual(['plugin:sales', 'skill:tdd'])
  const coding = list.find(d => d.name === 'coding')
  expect(coding?.off.sort()).toEqual(['mcp:gmail', 'plugin:sales'])
  expect(list.map(d => d.name)).toEqual(['unused', 'coding', 'sales', 'seo', 'writing'])
})

test('a preview counts items, tokens and recently used items that would go off', () => {
  const p = preview(inventory, { name: 'coding', off: ['mcp:gmail', 'plugin:sales'] }, usage, now)
  expect(p).toEqual({ name: 'coding', count: 2, tokens: 37, recent: ['mcp:gmail'] })
  expect(previewText(p, { 'mcp:gmail': 'gmail' })).toBe(
    'coding: 2 items off, saves ~37t. Used in the last 7 days and would go off: gmail',
  )
})

test('the category view groups top-level items by category', () => {
  const folders = categoryFolders(buildTree(inventory), categories, {})
  expect(folders.map(f => f.name)).toEqual(['coding/', 'sales/', 'seo/', 'writing/', 'unsorted/'])
  expect(folders.at(-1)?.children.map(c => c.id)).toEqual(['mcp:loadout'])
})
