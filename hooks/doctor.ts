import type { HookSeen, Inventory } from '../types'
import type { Node } from './logic'
import { buildTree, savedTokens, serverId, skillId } from './logic'
import type { Usage } from './usage'
import { DAY, dateText, lastUse, unusedNodes } from './usage'

export type Conflict = [string, string]
export const DEFAULT_CONFLICTS: Conflict[] = [['plugin:ponytail', 'plugin:superpowers']]

export function readConflicts(value: unknown): Conflict[] {
  if (!Array.isArray(value)) return DEFAULT_CONFLICTS
  return value.filter(
    (pair): pair is Conflict =>
      Array.isArray(pair) && pair.length === 2 && pair.every(id => typeof id === 'string'),
  )
}

// Words that mark skills doing the same job; three or more sharing one is worth a look.
export const OVERLAP_WORDS = ['review', 'test', 'tdd', 'debug', 'plan', 'seo', 'security', 'refactor', 'commit', 'deploy', 'verify']
const OVERLAP_MIN = 3
const AUTH_ONLY = /^(authenticate|complete_authentication)$/
export const UNUSED_DAYS = 30
const HEAVIEST = 10

export type DoctorInput = { inventory: Inventory; off: readonly string[]; usage: Usage; now: number; conflicts: readonly Conflict[] }

export const topNodes = (inventory: Inventory) => {
  const tree = buildTree(inventory)
  return [...tree.plugins, ...tree.skills, ...tree.servers]
}

const allNodes = (inventory: Inventory) => topNodes(inventory).flatMap(n => [n, ...n.children])

// Tokens saved by turning `ids` off on top of what is off now.
export const extraSaved = (inventory: Inventory, off: readonly string[], ids: readonly string[]) =>
  savedTokens(inventory, [...off, ...ids]) - savedTokens(inventory, off)

const isOn = (node: Node, off: readonly string[], parents: Map<string, string>) =>
  !off.includes(node.id) && !off.includes(parents.get(node.id) ?? '')

// Most used first, then the heaviest: the one kept when a group does the same job.
const keepFirst = (usage: Usage) => (a: Node, b: Node) =>
  (lastUse(b, usage) ?? 0) - (lastUse(a, usage) ?? 0) || b.tokens - a.tokens || a.name.localeCompare(b.name)

export function doctor({ inventory, off, usage, now, conflicts }: DoctorInput) {
  const nodes = allNodes(inventory)
  const parents = new Map(topNodes(inventory).flatMap(p => p.children.map(c => [c.id, p.id] as const)))
  const on = (id: string) => nodes.some(n => n.id === id && isOn(n, off, parents))
  const byId = new Map(nodes.map(n => [n.id, n]))

  const groups = new Map<string, Node[]>()
  for (const server of inventory.servers) {
    const node = byId.get(serverId(server.server))
    if (!node || !server.tools.length || !on(node.id)) continue
    const key = [...server.tools].sort().join('|')
    groups.set(key, [...(groups.get(key) ?? []), node])
  }
  const duplicates = [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => {
      const [keep, ...drop] = [...list].sort(keepFirst(usage))
      const dropIds = drop.map(n => n.id)
      return { keep: keep!.id, drop: dropIds, tokens: extraSaved(inventory, off, dropIds), tools: key.split('|').length }
    })

  const needsAuth = inventory.servers
    .filter(s => s.tools.length > 0 && s.tools.every(t => AUTH_ONLY.test(t)) && on(serverId(s.server)))
    .map(s => ({ id: serverId(s.server), tokens: s.tokens }))

  const skills = inventory.skills.map(s => byId.get(skillId(s.name))).filter((n): n is Node => !!n && on(n.id))
  const overlaps = OVERLAP_WORDS.flatMap(word => {
    const list = skills.filter(n => (n.name.split(':').pop() ?? '').includes(word))
    if (list.length < OVERLAP_MIN) return []
    const [keep, ...drop] = [...list].sort(keepFirst(usage))
    const dropIds = drop.map(n => n.id).sort()
    return [{ word, keep: keep!.id, drop: dropIds, tokens: extraSaved(inventory, off, dropIds) }]
  })

  const conflictRows = conflicts
    .filter(([a, b]) => on(a) && on(b))
    .map(([a, b]) => ({ a, b, aTokens: byId.get(a)?.tokens ?? 0, bTokens: byId.get(b)?.tokens ?? 0 }))

  const tops = topNodes(inventory).filter(n => !off.includes(n.id))
  const heaviest = [...tops]
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, HEAVIEST)
    .map(n => ({ id: n.id, tokens: n.tokens }))

  const unusedIds = unusedNodes(tops, usage, now, UNUSED_DAYS).map(n => n.id)
  return {
    duplicates,
    needsAuth,
    overlaps,
    conflicts: conflictRows,
    heaviest,
    unused: { ids: unusedIds, tokens: extraSaved(inventory, off, unusedIds) },
    total: extraSaved(inventory, off, [
      ...new Set([
        ...duplicates.flatMap(d => d.drop),
        ...needsAuth.map(a => a.id),
        ...overlaps.flatMap(o => o.drop),
        ...unusedIds,
      ]),
    ]),
    names: Object.fromEntries(nodes.map(n => [n.id, n.name])),
  }
}

export type DoctorReport = ReturnType<typeof doctor>

export const TRIAL_DAYS = 14

export function readTrials(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null) return {}
  return Object.fromEntries(Object.entries(value).filter((pair): pair is [string, number] => typeof pair[1] === 'number'))
}

export const expiredTrials = (trials: Record<string, number>, now: number) =>
  Object.entries(trials)
    .filter(([, until]) => until <= now)
    .map(([id]) => id)

// The command the person runs to remove an item; Loadout only prints it.
export function uninstallHint(node: Node, inventory: Inventory) {
  if (node.id.startsWith('plugin:')) return `claude plugin uninstall ${node.name}`
  if (node.id.startsWith('mcp:'))
    return node.name.startsWith('claude.ai ')
      ? 'remove the connector in claude.ai Settings, Connectors'
      : `claude mcp remove "${node.name}"`
  const source = inventory.skills.find(s => skillId(s.name) === node.id)?.source
  if (source === 'userSettings') return `delete the folder ~/.claude/skills/${node.name}`
  if (source === 'projectSettings') return `delete the folder .claude/skills/${node.name}`
  return `comes with ${source ?? 'Claude Code'}; turn it off instead`
}

export function cleanupText(report: DoctorReport, inventory: Inventory) {
  const byId = new Map(allNodes(inventory).map(n => [n.id, n]))
  const ids = [
    ...new Set([...report.duplicates.flatMap(d => d.drop), ...report.needsAuth.map(a => a.id), ...report.unused.ids]),
  ]
  const rows = ids.flatMap(id => {
    const node = byId.get(id)
    return node ? [`  ${node.name}  ~${node.tokens}t  ${uninstallHint(node, inventory)}`] : []
  })
  return [
    rows.length ? 'Delete candidates (duplicates, auth-only and unused items):' : 'No delete candidates right now.',
    ...rows,
    'Loadout never runs these; run them yourself if you decide to remove an item.',
    `Try /loadout trial <name> first: it turns the item off for ${TRIAL_DAYS} days, then reminds you to decide.`,
  ].join('\n')
}

const SHOWN = 10

export function doctorText(report: DoctorReport, where: { cwd: string; now: number; since: number }) {
  const name = (id: string) => report.names[id] ?? id
  const list = (ids: readonly string[]) =>
    ids.slice(0, SHOWN).map(name).join(', ') + (ids.length > SHOWN ? `, and ${ids.length - SHOWN} more` : '')
  const section = (title: string, rows: string[]) => (rows.length ? [title, ...rows.map(r => `  ${r}`)] : [])
  const days = Math.floor((where.now - where.since) / DAY)
  return [
    'Loadout doctor. Token numbers are estimates; listings already sent stay until a new session.',
    ...section(
      'Duplicates:',
      report.duplicates.map(
        d => `${[d.keep, ...d.drop].map(name).sort().join(' = ')} (same ${d.tools} tools): keep ${name(d.keep)}, off the rest saves ~${d.tokens}t`,
      ),
    ),
    ...section('Needs auth:', report.needsAuth.map(a => `${name(a.id)}: only an authenticate tool, off saves ~${a.tokens}t`)),
    ...section(
      'Overlapping skills:',
      report.overlaps.map(
        o => `${o.word}: ${list([o.keep, ...o.drop].sort())}. Keep ${name(o.keep)}, off the rest saves ~${o.tokens}t`,
      ),
    ),
    ...section(
      'Conflicts:',
      report.conflicts.map(
        c => `${name(c.a)} + ${name(c.b)} are both on: off ${name(c.a)} saves ~${c.aTokens}t, off ${name(c.b)} ~${c.bTokens}t`,
      ),
    ),
    ...section('Heaviest:', report.heaviest.map(h => `~${h.tokens}t  ${name(h.id)}`)),
    `Unused ${UNUSED_DAYS}+ days in ${where.cwd} (counting since ${dateText(where.since)}, ${days} days):`,
    report.unused.ids.length
      ? `  ${report.unused.ids.length} items, off all saves ~${report.unused.tokens}t: ${list(report.unused.ids)}`
      : '  none',
    ...(days < UNUSED_DAYS ? [`  Counting started under ${UNUSED_DAYS} days ago, so this list is early.`] : []),
    `If you take every suggestion above: ~${report.total}t saved (conflicts and heaviest not included).`,
  ].join('\n')
}


const HOW_OFTEN: Record<string, string> = {
  UserPromptSubmit: 'every prompt',
  PostToolUse: 'every tool call',
  PreToolUse: 'every tool call',
  SessionStart: 'once, then in every request',
}

// What repeats: hook text per prompt or tool call, and skills a hook text makes the model load.
export function repeatedCostText(hooks: Record<string, HookSeen>, skills: Record<string, number>) {
  const rows = Object.values(hooks).sort((a, b) => b.tokens - a.tokens)
  const loaded = Object.entries(skills).sort((a, b) => b[1] - a[1])
  if (!rows.length && !loaded.length) return 'Per-turn repeated cost: No hook text or skill seen yet in this session.'
  const asked = (skill: string) => rows.some(r => r.head.includes(skill.split(':').pop() ?? skill))
  return [
    'Per-turn repeated cost (seen in this session; estimates):',
    ...rows.map(r => `  ~${r.tokens}t ${HOW_OFTEN[r.event] ?? 'when it fires'} (${r.event}): ${r.head}${r.isCut ? ' [cut]' : ''}`),
    ...(loaded.length ? ['  Skills loaded:'] : []),
    ...loaded.map(([skill, tokens]) => `    ${skill} ~${tokens}t${asked(skill) ? ' [a hook text asks for it]' : ''}`),
    '  Cut a hook text with /loadout hookcut add <preset> <marker>; block a skill with /loadout off <skill>, then save the preset.',
  ].join('\n')
}
