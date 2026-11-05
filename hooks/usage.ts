import type { Node } from './logic'
import { serverId, skillId, wireServer } from './logic'

export const DAY = 24 * 60 * 60 * 1000

export type Use = { count: number; last: number }
export type Usage = { since: number; items: Record<string, Use> }

// Usage is kept per project, so a project's own habits drive its suggestions.
export const usageKey = (cwd: string) => `usage:${cwd}`

// Names the Loadout item a tool call uses: an MCP server, or a skill run through the Skill tool.
export function itemOfCall(tool: string, input: Record<string, unknown>) {
  if (tool === 'Skill') {
    const name = typeof input.skill === 'string' ? input.skill.replace(/^\//, '').trim() : ''
    return name ? skillId(name) : undefined
  }
  if (!tool.startsWith('mcp__') || tool.startsWith('mcp__loadout__')) return undefined
  const server = wireServer(tool)
  return server ? serverId(server) : undefined
}

export function readUsage(value: unknown, now: number): Usage {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as { since?: unknown; items?: unknown }
  const items = typeof raw.items === 'object' && raw.items !== null ? raw.items : {}
  return {
    since: typeof raw.since === 'number' ? raw.since : now,
    items: Object.fromEntries(
      Object.entries(items).filter(
        (pair): pair is [string, Use] =>
          typeof (pair[1] as Use)?.count === 'number' && typeof (pair[1] as Use)?.last === 'number',
      ),
    ),
  }
}

export const recordUse = (usage: Usage, id: string, now: number): Usage => ({
  ...usage,
  items: { ...usage.items, [id]: { count: (usage.items[id]?.count ?? 0) + 1, last: now } },
})

// The latest use of a node or anything inside it (a plugin is used when one of its skills or servers is).
export function lastUse(node: Node, usage: Usage): number | undefined {
  const own = usage.items[node.id]?.last
  const inner = node.children.map(child => lastUse(child, usage)).filter((t): t is number => t !== undefined)
  const all = own === undefined ? inner : [own, ...inner]
  return all.length ? Math.max(...all) : undefined
}

export const unusedNodes = (nodes: readonly Node[], usage: Usage, now: number, days: number) =>
  nodes.filter(node => (lastUse(node, usage) ?? -Infinity) < now - days * DAY)

export const dateText = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function usageText(usage: Usage, cwd: string) {
  const rows = Object.entries(usage.items).sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
  if (!rows.length) return `No calls counted yet in ${cwd} (counting since ${dateText(usage.since)}).`
  return [
    `Usage in ${cwd} (since ${dateText(usage.since)}):`,
    ...rows.map(([id, use]) => `  ${use.count}  ${id}  last ${dateText(use.last)}`),
  ].join('\n')
}
