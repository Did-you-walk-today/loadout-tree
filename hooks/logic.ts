import type { Inventory, ServerEntry, SkillEntry, Translated } from '../types'

export type Node = {
  id: string
  name: string
  tokens: number
  source: string
  children: Node[]
}

export const skillId = (name: string) => `skill:${name}`
export const serverId = (server: string) => `mcp:${server}`
export const pluginId = (name: string) => `plugin:${name}`

export const pluginOfSkill = (name: string, plugin?: string) =>
  plugin ?? (name.includes(':') ? name.split(':')[0] : undefined)

export const wireServer = (tool: string) => tool.split('__')[1] ?? ''

export function isSkillOff(name: string, off: readonly string[]) {
  const plugin = pluginOfSkill(name)
  return off.includes(skillId(name)) || (plugin !== undefined && off.includes(pluginId(plugin)))
}

export function isToolOff(tool: string, off: readonly string[]) {
  if (!tool.startsWith('mcp__')) return false
  const server = wireServer(tool)
  return (
    off.includes(serverId(server)) ||
    off.some(id => id.startsWith('plugin:') && server.startsWith(`plugin_${id.slice(7)}_`))
  )
}

// An off tool stays blocked unless its server was allowed once for this session.
export const isToolBlocked = (tool: string, off: readonly string[], once: readonly string[]) =>
  isToolOff(tool, off) && !once.includes(serverId(wireServer(tool)))

// A bullet starts "- name: text"; its wrapped lines belong to it until the next bullet.
export function filterSkillListing(text: string, off: readonly string[]) {
  let dropping = false
  return text
    .split('\n')
    .filter(line => {
      const bullet = /^- ([^\s:]+(?::[^\s:]+)*)(?::\s|$)/.exec(line)
      if (bullet?.[1]) dropping = isSkillOff(bullet[1], off)
      return !dropping
    })
    .join('\n')
}

export function filterDeferredTools(text: string, off: readonly string[]) {
  return text
    .split('\n')
    .filter(line => !isToolOff(line.trim(), off))
    .join('\n')
}

const sum = (nodes: readonly Node[]) => nodes.reduce((total, node) => total + node.tokens, 0)

const skillNode = (skill: SkillEntry, descriptions: Inventory['descriptions']): Node => ({
  id: skillId(skill.name),
  name: skill.name,
  tokens: skill.tokens,
  source: descriptions[skill.name] ?? '',
  children: [],
})

const serverNode = (server: ServerEntry): Node => ({
  id: serverId(server.server),
  name: server.label,
  tokens: server.tokens,
  source: `${server.tools.length} tools: ${server.tools.slice(0, 6).join(', ')}`,
  children: [],
})

export function buildTree(inventory: Inventory): { plugins: Node[]; skills: Node[]; servers: Node[] } {
  const byName = (a: Node, b: Node) => a.name.localeCompare(b.name)
  const pluginNames = [
    ...new Set([
      ...inventory.skills.flatMap(s => pluginOfSkill(s.name, s.plugin) ?? []),
      ...inventory.servers.flatMap(s => s.plugin ?? []),
    ]),
  ].sort()
  const plugins = pluginNames.map(name => {
    const children = [
      ...inventory.skills
        .filter(s => pluginOfSkill(s.name, s.plugin) === name)
        .map(s => skillNode(s, inventory.descriptions)),
      ...inventory.servers.filter(s => s.plugin === name).map(serverNode),
    ].sort(byName)
    return {
      id: pluginId(name),
      name,
      tokens: sum(children),
      source: children.slice(0, 6).map(child => child.name.split(':').pop()).join(', '),
      children,
    }
  })
  return {
    plugins,
    skills: inventory.skills
      .filter(s => pluginOfSkill(s.name, s.plugin) === undefined)
      .map(s => skillNode(s, inventory.descriptions))
      .sort(byName),
    servers: inventory.servers.filter(s => s.plugin === undefined).map(serverNode).sort(byName),
  }
}

export const isFolder = (node: Node) => node.id.startsWith('folder:')

export const folder = (id: string, name: string, children: Node[]): Node => ({
  id: `folder:${id}`,
  name,
  tokens: sum(children),
  source: `${children.length} items`,
  children,
})

type PaneOptions = { hidden?: readonly string[]; starred?: readonly string[] }

const hasStar = (node: Node, starred: readonly string[]): boolean =>
  starred.includes(node.id) || node.children.some(child => hasStar(child, starred))

// Starred items, and folders holding one, move to the top; the order is otherwise kept.
export const starFirst = (nodes: readonly Node[], starred: readonly string[]): Node[] =>
  [...nodes.filter(n => hasStar(n, starred)), ...nodes.filter(n => !hasStar(n, starred))].map(n => ({
    ...n,
    children: starFirst(n.children, starred),
  }))

// The pane draws only what is opened, so 480 skills do not become 480 rows at once.
export function paneFolders(tree: ReturnType<typeof buildTree>, options: PaneOptions = {}): Node[] {
  const hidden = options.hidden ?? []
  const skills = tree.skills.filter(node => !hidden.includes(node.id))
  const letters = [...new Set(skills.map(node => node.name.charAt(0).toLowerCase()))].sort()
  const top = [
    folder('plugins', 'plugins/', tree.plugins),
    folder(
      'skills',
      'skills/',
      letters.map(letter =>
        folder(
          `skills:${letter}`,
          `${letter}/`,
          skills.filter(node => node.name.charAt(0).toLowerCase() === letter),
        ),
      ),
    ),
    folder('mcp', 'mcp/', tree.servers),
  ]
  return top.map(n => ({ ...n, children: starFirst(n.children, options.starred ?? []) }))
}

export const describeNode =(node: Node, translated: Translated, own: Record<string, string> = {}) => {
  const hit = translated[node.id]
  const text = own[node.id] ?? (hit?.source === node.source ? hit.text : node.source)
  return (text.split('\n')[0] ?? '').slice(0, 110)
}

export function savedTokens(inventory: Inventory, off: readonly string[]) {
  const tree = buildTree(inventory)
  const count = (nodes: readonly Node[]): number =>
    nodes.reduce(
      (total, node) => total + (off.includes(node.id) ? node.tokens : count(node.children)),
      0,
    )
  return count([...tree.plugins, ...tree.skills, ...tree.servers])
}

export function treeText(
  inventory: Inventory,
  off: readonly string[],
  translated: Translated,
  own: Record<string, string> = {},
) {
  const tree = buildTree(inventory)
  const lines: string[] = []
  const walk = (nodes: readonly Node[], indent: string, parentOff: boolean) =>
    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1
      const isOff = parentOff || off.includes(node.id)
      lines.push(
        `${indent}${isLast ? '└─' : '├─'} ${isOff ? '[off]' : '[on] '} ${node.name}  ~${node.tokens}t  ${describeNode(node, translated, own)}`,
      )
      walk(node.children, `${indent}${isLast ? '   ' : '│  '}`, isOff)
    })
  for (const [title, nodes] of [
    ['plugins/', tree.plugins],
    ['skills/', tree.skills],
    ['mcp/', tree.servers],
  ] as const) {
    lines.push(title)
    walk(nodes, '', false)
  }
  return lines.join('\n')
}

// Finds what a typed name means: an exact id first, then a plugin, skill or server name.
export function resolveName(inventory: Inventory, name: string) {
  const tree = buildTree(inventory)
  const all = [...tree.plugins, ...tree.skills, ...tree.servers].flatMap(node => [node, ...node.children])
  return (
    all.find(node => node.id === name) ??
    all.find(node => node.name === name) ??
    all.find(node => node.id === `mcp:${name}`)
  )
}

export function parseTranslation(reply: string): Record<string, string> {
  const json = /\{[\s\S]*\}/.exec(reply)?.[0]
  if (!json) return {}
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((pair): pair is [string, string] => typeof pair[1] === 'string'),
    )
  } catch {
    return {}
  }
}

// Fixed columns for the pane: tree glyphs, star, toggle, name, tokens, then the description takes the rest.
export function columnWidths(bodyColumns: number) {
  const glyph = 9
  const star = 4
  const toggle = 6
  const tokens = 8
  const name = Math.max(12, Math.min(40, Math.floor(bodyColumns * 0.35)))
  const description = Math.max(0, bodyColumns - glyph - star - toggle - name - tokens)
  return { glyph, star, toggle, name, tokens, description }
}

// shortcut: the desktop drew a 41.5 KB pane tree (32 rows) and refused a 137 KB one (107 rows); its real limit is undocumented, raise this only after measuring a bigger tree drawing.
export const MAX_PANE_ROWS = 50

export function capRows<T>(rows: readonly T[], max = MAX_PANE_ROWS) {
  return { shown: rows.slice(0, max), hidden: Math.max(0, rows.length - max) }
}

// Raw mid-tone hex: the desktop pane ignored most theme keys, and these read on light and dark.
export const COLORS = {
  folder: '#d97706',
  plugin: '#9333ea',
  skill: '#0d9488',
  mcp: '#2563eb',
  on: '#16a34a',
  off: '#dc2626',
  tokens: '#ca8a04',
  star: '#eab308',
} as const

export const kindColor = (id: string) =>
  id.startsWith('folder:')
    ? COLORS.folder
    : id.startsWith('plugin:')
      ? COLORS.plugin
      : id.startsWith('mcp:')
        ? COLORS.mcp
        : COLORS.skill

// "Basic" means shipped with Claude Code itself (skill source `built-in`); the person installed everything else.
export const BASIC_SOURCES: readonly string[] = ['built-in']

export const basicIds = (inventory: Inventory) =>
  inventory.skills.filter(s => BASIC_SOURCES.includes(s.source) && !pluginOfSkill(s.name, s.plugin)).map(s => skillId(s.name))

export const readStrings = (value: unknown) =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []

export function readDescs(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {}
  return Object.fromEntries(Object.entries(value).filter((pair): pair is [string, string] => typeof pair[1] === 'string'))
}

export const MAX_DESC = 200

// `<name> <text>` sets an own description; `<name>` alone clears it.
export function withDesc(descs: Record<string, string>, id: string, text: string) {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_DESC)
  const rest = Object.fromEntries(Object.entries(descs).filter(([key]) => key !== id))
  return clean ? { ...rest, [id]: clean } : rest
}

export const fit = (text: string, width: number) =>
  text.length <= width ? text : width <= 1 ? text.slice(0, width) : `${text.slice(0, width - 1)}…`

export const tokenCell = (tokens: number, width: number) => `~${tokens}t`.padStart(width - 1)

export type Presets = Record<string, { off: string[] }>

export const isPresetName = (name: string) => /^[\w-]{1,32}$/.test(name)

export function readPresets(value: unknown): Presets {
  if (typeof value !== 'object' || value === null) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([name, preset]) => {
      const off = (preset as { off?: unknown })?.off
      return isPresetName(name) && Array.isArray(off)
        ? [[name, { off: off.filter((id): id is string => typeof id === 'string') }]]
        : []
    }),
  )
}

export const presetToolDescription = (names: readonly string[]) =>
  'Suggest a Loadout preset to the person: a saved set of skills, plugins and MCP servers turned off. ' +
  'Call it when the kind of work changes, for example from planning to coding or back, ' +
  'and the current preset does not fit. ' +
  `Presets: ${names.length ? names.join(', ') : 'none saved yet'}. ` +
  'It does not switch: a switch mid-session drops the prompt cache, so the person decides.'

// shortcut: matched by the text each plugin injects today; a changed marker in ponytail or superpowers breaks it, re-read their SessionStart output then.
export const HOOK_MARKERS: readonly { plugin: string; pattern: RegExp }[] = [
  { plugin: 'ponytail', pattern: /PONYTAIL MODE ACTIVE[\s\S]*$/ },
  { plugin: 'superpowers', pattern: /<EXTREMELY_IMPORTANT>\s*You have superpowers[\s\S]*?<\/EXTREMELY_IMPORTANT>/g },
]

// A `hook:<marker>` id in the off list cuts settings-hook text holding that marker.
export const hookId = (marker: string) => `hook:${marker}`
export const cutMarkers = (off: readonly string[]) =>
  off.filter(id => id.startsWith('hook:')).map(id => id.slice(5)).filter(Boolean)

// One hook's output may be joined to the next by a single newline, so a block ends at a blank line or a tag line.
// shortcut: a hook whose text has blank lines inside is cut only up to the first one; add a second marker then.
function cutBlocks(text: string, markers: readonly string[]) {
  if (!markers.length) return text
  let dropping = false
  const kept = text.split('\n').filter(line => {
    if (markers.some(m => line.includes(m))) dropping = true
    else if (!line.trim() || line.startsWith('<')) dropping = false
    return !dropping
  })
  return kept.join('\n').replace(/\n{3,}/g, '\n\n')
}

// Cuts the text an off plugin or a hook marker names; null when nothing is left.
export function filterHookText(text: string, off: readonly string[]) {
  const cut = cutBlocks(
    HOOK_MARKERS.filter(m => off.includes(pluginId(m.plugin))).reduce((rest, m) => rest.replace(m.pattern, ''), text),
    cutMarkers(off),
  )
  if (cut === text) return text
  return cut.trim() ? cut.trim() : null
}

// shortcut: a rough count (ASCII by four, other letters one each), not the model's tokenizer.
export function estimateTokens(text: string) {
  const ascii = text.replace(/[^\x00-\x7f]/g, '').length
  return Math.ceil(ascii / 4) + (text.length - ascii)
}
