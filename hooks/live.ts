import type { Node } from './logic'

export type Who = 'user' | 'model' | 'auto'
export type Switch = { at: number; preset: string; by: Who; off: number }

export const MAX_HISTORY = 20
export const BAND_MS = 5000
export const RECENT_MS = 60000
const WHO: readonly string[] = ['user', 'model', 'auto']

export const statusText = (preset: string, off: number, tokens: number) =>
  `Loadout: ${preset || 'no preset'} | ${off} off | ~${tokens}t saved (est.)`

export const bandText = (preset: string, by: Who, off: number, tokens: number) =>
  `Loadout: switched to ${preset} (by ${by}). ${off} off, ~${tokens}t saved (est.). Applies fully in a new session.`

type MarkerState = { inFlight: readonly string[]; recent: readonly string[]; pendingOff: readonly string[] }

const hits = (node: Node, ids: readonly string[]): boolean =>
  ids.includes(node.id) || node.children.some(child => hits(child, ids))

// One marker per row, the most immediate first; off-next-session marks only the toggled item.
export function markerOf(node: Node, state: MarkerState) {
  if (hits(node, state.inFlight)) return 'in use'
  if (state.recent.includes(node.id)) return 'just now'
  if (state.pendingOff.includes(node.id)) return 'off next session'
  return undefined
}

export const withHistory = (list: readonly Switch[], entry: Switch) => [entry, ...list].slice(0, MAX_HISTORY)

export function readHistory(value: unknown): Switch[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (s): s is Switch =>
      typeof s?.at === 'number' && typeof s?.preset === 'string' && WHO.includes(s?.by) && typeof s?.off === 'number',
  )
}

const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

export function historyText(list: readonly Switch[]) {
  if (!list.length) return 'No preset switches yet.'
  return ['Preset switches, newest first:', ...list.map(s => `  ${stamp(s.at)}  ${s.preset}  by ${s.by}  (${s.off} off)`)].join(
    '\n',
  )
}
