import { expect, mock, test } from 'claude-code/testing'

const DAY = 24 * 60 * 60 * 1000

const BREAKDOWN = {
  mcpTools: [
    { name: 'mcp__gmail__send', serverName: 'gmail', tokens: 7, isLoaded: false },
    { name: 'mcp__gmail2__send', serverName: 'claude.ai Gmail', tokens: 9, isLoaded: false },
    { name: 'mcp__figma__authenticate', serverName: 'figma', tokens: 3, isLoaded: false },
  ],
  skills: {
    totalSkills: 4,
    includedSkills: 4,
    tokens: 40,
    skillFrontmatter: [
      { name: 'tdd', source: 'userSettings', tokens: 9 },
      { name: 'code-review', source: 'userSettings', tokens: 5 },
      { name: 'engineering:code-review', source: 'plugin', tokens: 6, pluginName: 'engineering' },
      { name: 'mattpocock:code-review', source: 'plugin', tokens: 4, pluginName: 'mattpocock' },
      { name: 'ponytail:ponytail', source: 'plugin', tokens: 30, pluginName: 'ponytail' },
      { name: 'superpowers:brainstorming', source: 'plugin', tokens: 50, pluginName: 'superpowers' },
    ],
  },
}

export let toasts: string[] = []
export let statuses: (string | undefined)[] = []
let store: Record<string, unknown> = {}
let replies: string[] = []

export async function start($: any, on: any, options: { cwd?: string; now?: number } = {}) {
  store = {}
  toasts = []
  statuses = []
  const clock = mock.clock(on, { now: options.now ?? 100 * DAY })
  on('tool.register', (_: unknown, e: any) => ({ value: { tool: `mcp__loadout__${e.name}` } }))
  on('ui.toast', (_: unknown, e: any) => {
    toasts = [...toasts, e.text]
    return { value: undefined }
  })
  on('ui.status', (_: unknown, e: any) => {
    statuses = [...statuses, e.text]
    return { value: undefined }
  })
  on('tool.list', () => ({ value: [] }))
  on('store.get', (_: unknown, e: any) => ({ value: store[e.key] }))
  on('store.set', (_: unknown, e: any) => {
    store = { ...store, [e.key]: e.value }
    return { value: undefined }
  })
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: options.cwd ?? '/proj' }))
  on('command.register', () => ({ value: { command: 'loadout' } }))
  on('command.list', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('prompt.attachment', (_: unknown, e: any) => ({ text: e.text }))
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
  on('tool.call', { tool: 'mcp__gmail__slow' }, async () => {
    await clock.sleep(1000)
    return { result: {} }
  })
  on('tool.call', () => ({ result: {} }))
  on('ui.render', { component: 'AbovePrompt' }, ($b: any, e: any) => {
    const { Box } = $b.ui.resolve(e)
    return <Box />
  })
  on('command.run', () => ({ text: 'engine' }))
  on('model.complete', () => ({ value: { isAnswered: true, text: replies.shift() ?? '{}', usage: {} } }))
  on('session.usage', () => ({ value: { context: { window: 1000, breakdown: BREAKDOWN } } }))
  await $.session.start({ cwd: options.cwd ?? '/proj', surface: 'desktop', isInteractive: true })
  return clock
}

export const setReplies = (next: string[]) => {
  replies = [...next]
}
export const stored = (key: string) => store[key]

export const run = ($: any, args: string) => $.command.run({ command: 'loadout', args, name: 'loadout' })

test('tool calls and Skill calls are counted per project', async ($: any, on: any) => {
  await start($, on)
  await $.tool.call({ tool: 'mcp__gmail__send' })
  await $.tool.call({ tool: 'mcp__gmail__send' })
  await $.tool.call({ tool: 'Skill', skill: 'tdd' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  const text = (await run($, 'usage')).text
  expect(text).toContain('2  mcp:gmail  last 1970-04-11')
  expect(text).toContain('1  skill:tdd')
  expect(text).not.toContain('Bash')
  expect(stored('usage:/proj')).toBeDefined()
})

test('another project keeps its own counts', async ($: any, on: any) => {
  await start($, on, { cwd: '/other' })
  await $.tool.call({ tool: 'Skill', skill: 'tdd' })
  expect((await run($, 'usage')).text).toContain('Usage in /other')
  expect(stored('usage:/proj')).toBeUndefined()
})

test('doctor reports from the live inventory and conflict pairs can change', async ($: any, on: any) => {
  await start($, on)
  const text = (await run($, 'doctor')).text
  expect(text).toContain('claude.ai Gmail = gmail (same 1 tools)')
  expect(text).toContain('figma: only an authenticate tool')
  expect(text).toContain('ponytail + superpowers are both on')
  expect((await run($, 'conflict remove ponytail superpowers')).text).toContain('Removed')
  expect((await run($, 'doctor')).text).not.toContain('Conflicts:')
  expect((await run($, 'conflict add tdd code-review')).text).toContain('Added')
  expect((await run($, 'conflict list')).text).toBe('tdd + code-review')
  expect((await run($, 'conflict add tdd nope')).text).toContain('Nothing is named')
})

const PANE = {
  plugin: 'loadout',
  component: 'Pane',
  requestId: 'loadout',
  props: { title: 'Loadout', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('classify sorts items, suggest previews drafts and saves one only when asked', async ($: any, on: any) => {
  await start($, on)
  setReplies([
    JSON.stringify({ 'skill:tdd': 'coding', 'plugin:superpowers': 'planning', 'mcp:gmail': 'writing', 'mcp:figma': 'design' }),
  ])
  expect((await run($, 'suggest')).text).toContain('run /loadout classify')
  expect((await run($, 'classify')).text).toMatch(/^Sorted 4 of \d+ items/)
  const list = (await run($, 'suggest')).text
  expect(list).toContain('nothing is saved until')
  expect(list).toContain('coding: 3 items off, saves ~')
  expect((await run($, 'suggest coding')).text).toContain('  off  gmail')
  expect((await run($, 'preset list')).text).toContain('No presets yet')
  expect((await run($, 'suggest save coding work')).text).toContain('Saved preset work from draft coding')
  expect((await run($, 'preset list')).text).toContain('work  (3 off)')
  expect((await run($, 'suggest save nope x')).text).toContain('No draft is named')
})

test('the pane switches to the category view', async ($: any, on: any) => {
  await start($, on)
  setReplies([JSON.stringify({ 'skill:tdd': 'coding' })])
  await run($, 'classify')
  await run($, '')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^ coding\/$/ })).toBeUndefined()
    await ui.press({ key: 'view' })
    expect((await ui.find({ type: 'Text', text: /^ coding\/$/ }))?.text).toBe(' coding/')
    expect(await ui.find({ type: 'Text', text: /^ unsorted\/$/ })).toBeDefined()
    await ui.press({ key: 'view' })
    await ui.unmount()
  }
})

test('cleanup prints commands and a trial turns an item off for two weeks', async ($: any, on: any) => {
  const clock = await start($, on)
  const text = (await run($, 'cleanup')).text
  expect(text).toContain('claude plugin uninstall superpowers')
  expect(text).toContain('Loadout never runs these')
  expect((await run($, 'trial superpowers')).text).toContain('off until 1970-04-25')
  expect((await run($, 'tree')).text).toContain('[off] superpowers')
  await clock.advance(15 * DAY)
  toasts = []
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  expect(toasts.some(t => t.includes('trial of superpowers ended'))).toBe(true)
  expect((await run($, 'tree')).text).toContain('[off] superpowers')
  expect(stored('trials')).toEqual({})
})

test('a project preset applies at session start by folder', async ($: any, on: any) => {
  await start($, on)
  await run($, 'off gmail')
  await run($, 'preset save coding')
  await run($, 'reset')
  await run($, 'preset save planning')
  expect((await run($, 'project coding')).text).toContain('/proj uses preset coding')
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  expect((await run($, 'preset list')).text).toContain('* coding')
  expect((await $.tool.call({ tool: 'mcp__gmail__send' })).deny).toContain('turned off')
  expect((await run($, 'project nope')).text).toContain('No preset is named')
  expect((await run($, 'project clear')).text).toContain('no preset')
})

test('a prompt that reads like another preset gets a toast, once, and passes unchanged', async ($: any, on: any) => {
  await start($, on)
  await run($, 'preset save coding')
  await run($, 'preset save planning')
  const typed = await $.prompt.submit({ text: 'fix the bug and add a test' })
  expect(typed.text).toBe('fix the bug and add a test')
  expect(toasts).toContain('Loadout: this looks like coding work. Switch with /loadout preset use coding.')
  toasts = []
  await $.prompt.submit({ text: 'fix another bug and its test' })
  expect(toasts).toEqual([])
})

test('an off tool call suggests once, and once allows it for this session only', async ($: any, on: any) => {
  await start($, on)
  await run($, 'off gmail')
  const denied = await $.tool.call({ tool: 'mcp__gmail__send' })
  expect(denied.deny).toContain('/loadout once gmail')
  expect(toasts.some(t => t.includes('/loadout once gmail'))).toBe(true)
  expect((await run($, 'once gmail')).text).toContain('allowed for this session')
  expect((await $.tool.call({ tool: 'mcp__gmail__send' })).deny).toBeUndefined()
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  expect((await $.tool.call({ tool: 'mcp__gmail__send' })).deny).toContain('turned off')
})

const BAND = {
  plugin: 'loadout',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

test('the status line follows what is off, and a switch shows a band for a few seconds', async ($: any, on: any) => {
  const clock = await start($, on)
  expect(statuses.at(-1)).toBe('Loadout: no preset | 0 off | ~0t saved (est.)')
  await run($, 'off gmail')
  expect(statuses.at(-1)).toBe('Loadout: no preset | 1 off | ~7t saved (est.)')
  await run($, 'preset save coding')
  await run($, 'reset')
  await run($, 'preset use coding')
  expect(statuses.at(-1)).toBe('Loadout: coding | 1 off | ~7t saved (est.)')
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ type: 'Text', text: /switched to coding \(by user\)/ }))?.text).toContain('Applies fully in a new session')
    await band.unmount()
  }
  await clock.advance(5000)
  const after = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await after.find({ type: 'Text', text: /switched to/ })).toBeUndefined()
  await after.unmount()
})

test('the history says who switched: user, model or auto', async ($: any, on: any) => {
  await start($, on)
  expect((await run($, 'history')).text).toContain('No preset switches yet')
  await run($, 'preset save coding')
  await run($, 'preset use coding')
  await $.tool.call({ tool: 'mcp__loadout__use_preset', name: 'coding' })
  await run($, 'project coding')
  await run($, 'preset save planning')
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  const text = (await run($, 'history')).text
  expect(text.split('\n').slice(1).map((line: string) => line.split('by ')[1])).toEqual(['auto  (0 off)', 'user  (0 off)'])
})

test('pane markers: in use, just now, off next session', async ($: any, on: any) => {
  const clock = await start($, on)
  await run($, '')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'open:folder:mcp' })
  const call = $.tool.call({ tool: 'mcp__gmail__slow' })
  await clock.settle()
  expect((await ui.find({ type: 'Text', text: /^\[in use\] $/ }))?.text).toBe('[in use] ')
  await clock.advance(1000)
  await call
  expect(await ui.find({ type: 'Text', text: /^\[in use\] $/ })).toBeUndefined()
  await ui.press({ key: 'toggle:mcp:figma' })
  expect((await ui.find({ type: 'Text', text: /^\[just now\] $/ }))?.text).toBe('[just now] ')
  await clock.advance(60000)
  expect((await ui.find({ type: 'Text', text: /^\[off next session\] $/ }))?.text).toBe('[off next session] ')
  await ui.unmount()
})

test('an off server call is not counted', async ($: any, on: any) => {
  await start($, on)
  await run($, 'off gmail')
  await $.tool.call({ tool: 'mcp__gmail__send' })
  expect((await run($, 'usage')).text).toContain('No calls counted yet')
})
