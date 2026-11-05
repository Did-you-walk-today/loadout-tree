import { expect, test } from 'claude-code/testing'

import {
  basicIds,
  buildTree,
  capRows,
  MAX_PANE_ROWS,
  COLORS,
  columnWidths,
  describeNode,
  kindColor,
  paneFolders,
  withDesc,
  filterDeferredTools,
  filterHookText,
  filterSkillListing,
  fit,
  isPresetName,
  isToolOff,
  parseTranslation,
  presetToolDescription,
  readPresets,
  resolveName,
  savedTokens,
  tokenCell,
} from './logic'

const inv = {
  skills: [
    { name: 'tdd', tokens: 10, source: 'userSettings' },
    { name: 'sales:forecast', plugin: 'sales', tokens: 20, source: 'plugin' },
  ],
  servers: [{ server: 'plugin_sales_gong', label: 'plugin:sales:gong', plugin: 'sales', tokens: 5, tools: ['a'] }],
  descriptions: {},
}

test('an off skill and its wrapped lines leave the listing', () => {
  const text = 'Skills:\n- tdd: tests\n  more\n- sales:forecast: numbers\n- other'
  expect(filterSkillListing(text, ['skill:tdd'])).toBe('Skills:\n- sales:forecast: numbers\n- other')
  expect(filterSkillListing(text, ['plugin:sales'])).toBe('Skills:\n- tdd: tests\n  more\n- other')
})

test('tools of an off server or plugin are off', () => {
  expect(isToolOff('mcp__plugin_sales_gong__a', ['plugin:sales'])).toBe(true)
  expect(isToolOff('mcp__gmail__a', ['mcp:gmail'])).toBe(true)
  expect(isToolOff('mcp__gmail__a', ['mcp:drive'])).toBe(false)
  expect(isToolOff('Bash', ['plugin:sales'])).toBe(false)
  expect(filterDeferredTools('Read\nmcp__gmail__a\nmcp__x__b', ['mcp:gmail'])).toBe('Read\nmcp__x__b')
})

test('savings count a plugin once, not again for its children', () => {
  expect(savedTokens(inv, ['plugin:sales'])).toBe(25)
  expect(savedTokens(inv, ['skill:sales:forecast', 'skill:tdd'])).toBe(30)
})

test('names resolve and a bad model reply is empty', () => {
  expect(resolveName(inv, 'sales')?.id).toBe('plugin:sales')
  expect(resolveName(inv, 'nope')).toBeUndefined()
  expect(parseTranslation('not json')).toEqual({})
  expect(parseTranslation('ok {"a":"b","c":1}')).toEqual({ a: 'b' })
})

test('columns have fixed widths and long names are cut', () => {
  const w = columnWidths(80)
  expect(w).toEqual({ glyph: 9, star: 4, toggle: 6, name: 28, tokens: 8, description: 25 })
  expect(columnWidths(20).name).toBe(12)
  expect(columnWidths(200).name).toBe(40)
  expect(columnWidths(20).description).toBe(0)
  expect(fit('short', 10)).toBe('short')
  expect(fit('a-very-long-skill-name', 10)).toBe('a-very-lo…')
  expect(fit('a-very-long-skill-name', 10).length).toBe(10)
  expect(tokenCell(5, 8)).toBe('    ~5t')
  expect(tokenCell(1234, 8)).toBe('~1234t'.padStart(7))
})

test('presets read only valid names and string ids', () => {
  expect(readPresets({ coding: { off: ['skill:a', 3] }, 'bad name': { off: [] }, x: 'no' })).toEqual({
    coding: { off: ['skill:a'] },
  })
  expect(readPresets(undefined)).toEqual({})
  expect(isPresetName('plan-1')).toBe(true)
  expect(isPresetName('')).toBe(false)
  expect(presetToolDescription(['coding', 'planning'])).toContain('Presets: coding, planning.')
})

test('hook text of an off plugin is cut, the rest kept', () => {
  const pony = 'PONYTAIL MODE ACTIVE - level: full\n\n# Ponytail\nrules'
  expect(filterHookText(pony, [])).toBe(pony)
  expect(filterHookText(pony, ['plugin:ponytail'])).toBeNull()
  const mixed =
    'Invoke the task-observer skill.\n<EXTREMELY_IMPORTANT>\nYou have superpowers.\n<EXTREMELY-IMPORTANT>x</EXTREMELY-IMPORTANT>\n</EXTREMELY_IMPORTANT>'
  expect(filterHookText(mixed, ['plugin:superpowers'])).toBe('Invoke the task-observer skill.')
  expect(filterHookText(mixed, ['plugin:ponytail'])).toBe(mixed)
  expect(filterHookText('<EXTREMELY_IMPORTANT>other</EXTREMELY_IMPORTANT>', ['plugin:superpowers'])).toBe(
    '<EXTREMELY_IMPORTANT>other</EXTREMELY_IMPORTANT>',
  )
})

const wide = {
  skills: [
    { name: 'alpha', tokens: 1, source: 'userSettings' },
    { name: 'beta', tokens: 2, source: 'userSettings' },
    { name: 'batch', tokens: 3, source: 'built-in' },
  ],
  servers: [{ server: 'gmail', label: 'gmail', tokens: 4, tools: ['send'] }],
  descriptions: {},
}

test('the pane draws at most the row cap', () => {
  const list = Array.from({ length: MAX_PANE_ROWS + 7 }, (_, i) => i)
  expect(capRows(list).shown.length).toBe(MAX_PANE_ROWS)
  expect(capRows(list).hidden).toBe(7)
  expect(capRows([1, 2])).toEqual({ shown: [1, 2], hidden: 0 })
})

test('each kind of row has its own color', () => {
  expect(kindColor('folder:skills')).toBe(COLORS.folder)
  expect(kindColor('plugin:sales')).toBe(COLORS.plugin)
  expect(kindColor('mcp:gmail')).toBe(COLORS.mcp)
  expect(kindColor('skill:tdd')).toBe(COLORS.skill)
  expect(new Set([COLORS.folder, COLORS.plugin, COLORS.mcp, COLORS.skill]).size).toBe(4)
  expect(COLORS.on).not.toBe(COLORS.off)
})

test('basic skills are the built-in ones and hide from the pane', () => {
  expect(basicIds(wide)).toEqual(['skill:batch'])
  const skillsFolder = (hidden: string[]) =>
    paneFolders(buildTree(wide), { hidden })[1]?.children.flatMap(letter => letter.children.map(n => n.name))
  expect(skillsFolder([])).toEqual(['alpha', 'batch', 'beta'])
  expect(skillsFolder(basicIds(wide))).toEqual(['alpha', 'beta'])
})

test('starred items and the folders holding them come first', () => {
  const skills = paneFolders(buildTree(wide), { starred: ['skill:beta'] })[1]?.children ?? []
  expect(skills.map(n => n.name)).toEqual(['b/', 'a/'])
  expect(skills[0]?.children.map(n => n.name)).toEqual(['beta', 'batch'])
})

test('an own description beats the translated and the original one', () => {
  const node = buildTree(wide).servers[0]!
  const translated = { 'mcp:gmail': { source: node.source, text: 'translated' } }
  expect(describeNode(node, {})).toBe('1 tools: send')
  expect(describeNode(node, translated)).toBe('translated')
  expect(describeNode(node, translated, { 'mcp:gmail': 'mine' })).toBe('mine')
  const set = withDesc({}, 'mcp:gmail', '  mine\n  too ')
  expect(set).toEqual({ 'mcp:gmail': 'mine too' })
  expect(withDesc(set, 'mcp:gmail', '')).toEqual({})
  expect(withDesc({}, 'x', 'y'.repeat(300))['x']?.length).toBe(200)
})
