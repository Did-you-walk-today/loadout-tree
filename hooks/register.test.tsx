import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'loadout',
  component: 'Pane',
  requestId: 'loadout',
  props: {
    title: 'Loadout',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const BREAKDOWN = {
  mcpTools: [{ name: 'mcp__gmail__send', serverName: 'gmail', tokens: 7, isLoaded: false }],
  skills: {
    totalSkills: 1,
    includedSkills: 1,
    tokens: 9,
    skillFrontmatter: [
      { name: 'tdd', source: 'userSettings', tokens: 9 },
      { name: 'simplify', source: 'built-in', tokens: 4 },
    ],
  },
}

let toasts: string[] = []
let tools: any[] = []

const start = async ($: any, on: any, breakdown: unknown = BREAKDOWN) => {
  let store: Record<string, unknown> = {}
  toasts = []
  tools = []
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('tool.register', (_: unknown, e: any) => {
    tools = [...tools, e]
    return { value: { tool: `mcp__loadout__${e.name}` } }
  })
  on('ui.toast', (_: unknown, e: any) => {
    toasts = [...toasts, e.text]
    return { value: undefined }
  })
  on('tool.list', () => ({ value: [{ name: 'mcp__gmail__send', description: 'Send', mcp: true }, { name: 'Bash', description: 'Run', mcp: false }] }))
  on('store.get', (_: unknown, e: any) => ({ value: store[e.key] }))
  on('store.set', (_: unknown, e: any) => {
    store = { ...store, [e.key]: e.value }
    return { value: undefined }
  })
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/' }))
  on('command.register', () => ({ value: { command: 'loadout' } }))
  on('command.list', () => ({
    value: [
      { name: 'tdd', description: 'Write tests first', source: 'user' },
      { name: 'ponytail:ponytail', description: 'Least code', source: 'plugin', plugin: 'ponytail' },
    ],
  }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('prompt.attachment', (_: unknown, e: any) => ({ text: e.text }))
  on('agent.offer', () => ({ isOffered: true }))
  on('skill.prompt', (_: unknown, e: any) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} }))
  on('command.run', () => ({ text: 'engine' }))
  on('session.usage', () => ({
    value: { context: { window: 1000, breakdown } },
  }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
}

const run = ($: any, args: string) =>
  $.command.run({ command: 'loadout', args, name: 'loadout' })

test('with no breakdown the tree still lists what exists', async ($: any, on: any) => {
  await start($, on, null)
  const tree = await run($, 'tree')
  expect(tree.text).toContain('tdd  ~0t  Write tests first')
  expect(tree.text).toContain('gmail  ~0t')
  expect(tree.text).not.toContain('Bash')
})

test('off leaves the listing and blocks a server tool; reset restores', async ($: any, on: any) => {
  await start($, on)

  const off = await run($, 'off tdd')
  expect(off.text).toContain('tdd is off')
  const listing = await $.prompt.attachment({ type: 'skill_listing', text: 'x\n- tdd: t\n- b: c', origin: { kind: 'engine' } })
  expect(listing.text).toBe('x\n- b: c')

  await run($, 'off gmail')
  const called = await $.tool.call({ tool: 'mcp__gmail__send' })
  expect(called.deny).toContain('turned off')

  await run($, 'reset')
  const back = await $.prompt.attachment({ type: 'skill_listing', text: '- tdd: t', origin: { kind: 'engine' } })
  expect(back.text).toBe('- tdd: t')
})

test('the tree prints with descriptions', async ($: any, on: any) => {
  await start($, on)
  const tree = await run($, 'tree')
  expect(tree.text).toContain('tdd  ~9t  Write tests first')
  expect(tree.text).toContain('gmail  ~7t')
})

test('a row toggles in the pane, on every surface', async ($: any, on: any) => {
  await start($, on)
  await run($, '')
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^tdd$/ })).toBeUndefined()
    await ui.press({ key: 'open:folder:skills' })
    await ui.press({ key: 'open:folder:skills:t' })
    expect((await ui.find({ type: 'Text', text: /^tdd$/ }))?.text).toBe('tdd')
    await ui.press({ key: 'toggle:skill:tdd' })
    expect((await ui.find({ type: 'Text', text: /about 9 tokens/ }))?.text).toContain('about 9 tokens')
    await ui.press({ key: 'toggle:skill:tdd' })
    await ui.press({ key: 'open:folder:skills:t' })
    await ui.press({ key: 'open:folder:skills' })
    await ui.unmount()
  }
})

test('presets save, list, switch and delete', async ($: any, on: any) => {
  await start($, on)
  expect((await run($, 'preset list')).text).toContain('No presets yet')
  await run($, 'off tdd')
  expect((await run($, 'preset save coding')).text).toContain('1 items off')
  await run($, 'reset')
  expect((await run($, 'preset save planning')).text).toContain('0 items off')
  expect((await run($, 'preset list')).text).toBe('  coding  (1 off)\n* planning  (0 off)')

  const used = await run($, 'preset use coding')
  expect(used.text).toContain('Switched to preset coding')
  expect(toasts).toContain('Loadout: switched to preset coding')
  const listing = await $.prompt.attachment({ type: 'skill_listing', text: '- tdd: t\n- b: c', origin: { kind: 'engine' } })
  expect(listing.text).toBe('- b: c')

  expect((await run($, 'preset use nope')).text).toContain('No preset is named')
  expect((await run($, 'preset save bad name')).text).toContain('1 to 32')
  expect((await run($, 'preset delete coding')).text).toBe('Deleted preset coding.')
  expect((await run($, 'preset list')).text).toBe('  planning  (0 off)')
})

test('the model tool switches presets and lists them in its description', async ($: any, on: any) => {
  await start($, on)
  expect(tools.at(-1).description).toContain('none saved yet')
  expect(tools.at(-1).isDeferred).toBe(false)
  await run($, 'off gmail')
  await run($, 'preset save coding')
  await run($, 'reset')
  expect(tools.at(-1).description).toContain('Presets: coding.')
  expect(tools.at(-1).description).toContain('planning to coding')

  // Mid-session the tool only suggests: a switch would rewrite sent text and drop the prompt cache.
  const suggested = await $.tool.call({ tool: 'mcp__loadout__use_preset', name: 'coding' })
  expect(suggested.result).toContain('/loadout preset use coding')
  expect(suggested.result).toContain('/loadout project coding')
  expect(toasts).toContain('Loadout: the model suggests preset coding. /loadout preset use coding switches now.')
  expect((await $.tool.call({ tool: 'mcp__gmail__send' })).deny).toBeUndefined()

  const missing = await $.tool.call({ tool: 'mcp__loadout__use_preset', name: 'nope' })
  expect(missing.deny).toContain('No preset is named')
})

test('SessionStart text of an off plugin is cut; engine text is not', async ($: any, on: any) => {
  await start($, on)
  const pony = 'PONYTAIL MODE ACTIVE - level: full\nrules'
  const fromHook = { type: 'hook_additional_context', origin: { kind: 'hook', event: 'SessionStart' } }
  expect((await $.prompt.attachment({ ...fromHook, text: pony })).text).toBe(pony)
  expect((await run($, 'off ponytail')).text).toContain('ponytail is off')
  expect((await $.prompt.attachment({ ...fromHook, text: pony })).text).toBeNull()
  expect((await $.prompt.attachment({ type: 'x', text: pony, origin: { kind: 'engine' } })).text).toBe(pony)
})

test('pane columns follow the body width', async ($: any, on: any) => {
  await start($, on)
  await run($, '')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'open:folder:skills' })
  await ui.press({ key: 'open:folder:skills:t' })
  expect((await ui.find({ type: 'Text', text: /~9t$/ }))?.text).toBe('    ~9t')
  expect(await ui.find({ type: 'Text', text: /No presets yet/ })).toBeDefined()
  await ui.unmount()
})

test('a big open folder stays under the row cap and collapse closes it', async ($: any, on: any) => {
  const many = Array.from({ length: 70 }, (_, i) => ({ name: `a${i}`, source: 'userSettings', tokens: 1 }))
  await start($, on, { ...BREAKDOWN, skills: { ...BREAKDOWN.skills, skillFrontmatter: many } })
  await run($, '')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'open:folder:skills' })
  await ui.press({ key: 'open:folder:skills:a' })
  expect((await ui.find({ type: 'Text', text: /more rows not drawn/ }))?.text).toContain('25 more rows not drawn')
  expect(await ui.find({ type: 'Text', text: /^a69$/ })).toBeUndefined()
  expect((await run($, 'collapse')).text).toContain('closed')
  expect(await ui.find({ type: 'Text', text: /more rows not drawn/ })).toBeUndefined()
  await ui.unmount()
})

test('basic skills are hidden until shown', async ($: any, on: any) => {
  await start($, on)
  await run($, '')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'open:folder:skills' })
  expect(await ui.find({ key: 'open:folder:skills:s' })).toBeUndefined()
  await ui.press({ key: 'basic' })
  await ui.press({ key: 'open:folder:skills:s' })
  expect((await ui.find({ type: 'Text', text: /^simplify$/ }))?.text).toBe('simplify')
  await ui.unmount()
  expect((await run($, 'basic hide')).text).toContain('hidden')
})

test('a starred item is marked and its folder moves up', async ($: any, on: any) => {
  await start($, on)
  expect((await run($, 'star tdd')).text).toBe('tdd is starred.')
  await run($, 'basic show')
  await run($, '')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'open:folder:skills' })
  const letters = (await ui.findAll({ type: 'Text', text: /^ [a-z]\/$/ })).map((n: any) => n.text)
  expect(letters).toEqual([' t/', ' s/'])
  await ui.press({ key: 'open:folder:skills:t' })
  expect((await ui.find({ type: 'Text', text: /^\[\*\]$/ }))?.text).toBe('[*]')
  await ui.press({ key: 'star:skill:tdd' })
  expect((await run($, 'star tdd')).text).toBe('tdd is starred.')
  await ui.unmount()
})

test('own descriptions from the command and the pane field', async ($: any, on: any) => {
  await start($, on)
  expect((await run($, 'desc tdd My red-green loop')).text).toBe('Description of tdd: My red-green loop')
  expect((await run($, 'tree')).text).toContain('tdd  ~9t  My red-green loop')
  expect((await run($, 'desc tdd')).text).toContain('cleared')
  expect((await run($, 'tree')).text).toContain('tdd  ~9t  Write tests first')

  await run($, '')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'desc', text: 'tdd From the pane' })
  expect(toasts).toContain('Loadout: description of tdd saved')
  expect((await run($, 'tree')).text).toContain('tdd  ~9t  From the pane')
  await ui.unmount()

  const phone = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect(await phone.find({ key: 'desc' })).toBeUndefined()
  await phone.unmount()
})

const RULES = '[응답 형식 규칙]\n- 표 필수\n- 응답 언어: 한국어'
const PREVIEW = 'No preview server is running. Call preview_start.'
const hookText = (event: string, text: string) =>
  ({ type: 'hook_additional_context', text, origin: { kind: 'hook', event } })

test('hookcut adds markers to a preset; only that preset cuts them, on any hook event', async ($: any, on: any) => {
  await start($, on)
  await run($, 'preset save quick')
  await run($, 'preset save full')
  expect((await run($, 'hookcut add quick [응답 형식 규칙]')).text).toContain('quick cuts hook text marked "[응답 형식 규칙]"')
  await run($, 'hookcut add quick No preview server')
  expect((await run($, 'hookcut add nope x')).text).toContain('No preset is named')
  expect((await run($, 'hookcut list quick')).text).toBe('quick cuts:\n  [응답 형식 규칙]\n  No preview server')

  expect((await $.prompt.attachment(hookText('UserPromptSubmit', RULES))).text).toBe(RULES)
  await run($, 'preset use quick')
  expect((await $.prompt.attachment(hookText('UserPromptSubmit', RULES))).text).toBeNull()
  expect((await $.prompt.attachment(hookText('PostToolUse', PREVIEW))).text).toBeNull()
  expect((await $.prompt.attachment({ type: 'x', text: RULES, origin: { kind: 'engine' } })).text).toBe(RULES)

  expect((await run($, 'hookcut remove quick No preview server')).text).toContain('no longer cuts')
  expect((await $.prompt.attachment(hookText('PostToolUse', PREVIEW))).text).toBe(PREVIEW)
  await run($, 'preset use full')
  expect((await $.prompt.attachment(hookText('UserPromptSubmit', RULES))).text).toBe(RULES)
})

test('an off skill is refused at the Skill tool, and an off agent type is not offered', async ($: any, on: any) => {
  await start($, on)
  await run($, 'off tdd')
  const denied = await $.tool.call({ tool: 'Skill', skill: 'tdd' })
  expect(denied.deny).toContain('tdd is turned off in Loadout')
  expect((await $.tool.call({ tool: 'Skill', skill: 'simplify' })).deny).toBeUndefined()

  expect((await run($, 'off agent:Plan')).text).toContain('agent:Plan is off')
  const offer = (agent: string) =>
    $.agent.offer({ agent, description: 'd', source: 'built-in', provider: { plugin: 'engine', tier: 'core' } })
  expect((await offer('Plan')).isOffered).toBe(false)
  expect((await offer('Explore')).isOffered).toBe(true)
  await run($, 'preset save quick')
  await run($, 'reset')
  expect((await offer('Plan')).isOffered).toBe(true)
})

test('doctor shows the per-turn cost of hook texts and invoked skills', async ($: any, on: any) => {
  await start($, on)
  await $.prompt.attachment(hookText('UserPromptSubmit', RULES))
  await $.prompt.attachment(hookText('SessionStart', 'Invoke the task-observer skill before the first tool call.'))
  await $.skill.prompt({ skill: 'task-observer', text: 'x'.repeat(400), frontmatter: {}, source: 'userSettings' })
  const text = (await run($, 'doctor')).text
  expect(text).toContain('Per-turn repeated cost')
  expect(text).toContain('every prompt (UserPromptSubmit): [응답 형식 규칙]')
  expect(text).toContain('task-observer ~100t [a hook text asks for it]')
})
