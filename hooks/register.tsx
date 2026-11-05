import type { Register } from 'claude-code'

import {
  filterDeferredTools,
  filterHookText,
  filterSkillListing,
  isPresetName,
  isSkillOff,
  isToolBlocked,
  readDescs,
  readPresets,
  readStrings,
  resolveName,
  savedTokens,
  treeText,
  wireServer,
} from './logic'
import { DAY, dateText, itemOfCall, usageText } from './usage'
import { cleanupText, doctor, doctorText, expiredTrials, readConflicts, readTrials, repeatedCostText, TRIAL_DAYS } from './doctor'
import { detectTask, drafts, preview, previewText, readCategories } from './recommend'
import { historyText } from './live'
import {
  allowOnce,
  buildNames,
  drawBand,
  readHistoryList,
  readOnce,
  showStatus,
  whileInFlight,
  classify,
  collapseAll,
  conflictCommand,
  countUse,
  hookcutCommand,
  noteHook,
  noteSkill,
  readSeen,
  suggestPreset,
  drawPane,
  loadState,
  PANE,
  presetCommand,
  readProjectUsage,
  readTranslated,
  refresh,
  registerTool,
  setDesc,
  setLanguage,
  setOff,
  setPresets,
  setShowBasic,
  setStarred,
  storedOff,
  toggled,
  TOOL_FULL,
  translate,
  USAGE,
  usePreset,
} from './store'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'loadout',
      description: 'See installed skills, plugins and MCP servers, and turn them on or off',
      argumentHint: '[tree | on <name> | off <name> | reset | lang <language> | preset save|use|list|delete <name>]',
    })
    const presets = await loadState($)
    await registerTool($, presets)
    await endTrials($)
    const project = readDescs(await $.store.get('projectPresets'))[e.cwd]
    if (project && project !== (await $.store.get('activePreset'))) await usePreset($, project, 'auto')
    await refresh($)
    await showStatus($)
    hinted = []
    return started
  })

  // Only suggests: the prompt passes on unchanged, and each preset is hinted once a session.
  let hinted: string[] = []
  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta) return next(e)
    const presets = Object.keys(readPresets(await $.store.get('presets')))
    const guess = detectTask(e.text, presets)
    if (guess && guess !== (await $.store.get('activePreset')) && !hinted.includes(guess)) {
      hinted = [...hinted, guess]
      $.ui.toast(`Loadout: this looks like ${guess} work. Switch with /loadout preset use ${guess}.`)
    }
    return next(e)
  })

  on('prompt.attachment', { type: 'skill_listing' }, async ($, e, next) => {
    const off = await storedOff($)
    const answer = await next(e)
    return off.length && answer.text ? { text: filterSkillListing(answer.text, off) } : answer
  })

  on('prompt.attachment', { type: 'deferred_tools_delta' }, async ($, e, next) => {
    const off = await storedOff($)
    const answer = await next(e)
    return off.length && answer.text ? { text: filterDeferredTools(answer.text, off) } : answer
  })

  // Settings-hook text (any event) of an off plugin or a hook marker is cut from what the model reads.
  on('prompt.attachment', async ($, e, next) => {
    const answer = await next(e)
    if (e.origin.kind !== 'hook' || !answer.text) return answer
    const text = filterHookText(answer.text, await storedOff($))
    await noteHook($, e.origin.event, answer.text, text !== answer.text)
    return { text }
  })

  on('skill.prompt', async ($, e, next) => {
    const answer = await next(e)
    await noteSkill($, e.skill, answer.text)
    return answer
  })

  on('tool.call', { tool: TOOL_FULL }, async ($, e) => {
    const name = (e as { name?: unknown }).name
    if (typeof name !== 'string' || !name) return { deny: 'Give the preset name as "name".' }
    const { isSwitched, text } = suggestPreset($, name, readPresets(await $.store.get('presets')))
    return isSwitched ? { result: text } : { deny: text }
  })

  on('tool.describe', async ($, e, next) => {
    if (!isToolBlocked(e.tool, await storedOff($), await readOnce($))) return next(e)
    return { description: 'Turned off in Loadout.', isDeferred: true }
  })

  on('tool.call', async ($, e, next) => {
    if (isToolBlocked(e.tool, await storedOff($), await readOnce($))) {
      const server = wireServer(e.tool)
      $.ui.toast(`Loadout: ${server} is off. /loadout once ${server} allows it for this session.`)
      return {
        deny: `${e.tool} is turned off in Loadout. Ask the person to run /loadout once ${server} (this session only) or /loadout on ${server}.`,
      }
    }
    const id = itemOfCall(e.tool, e as Record<string, unknown>)
    if (!id) return next(e)
    if (e.tool === 'Skill' && isSkillOff(id.slice(6), await storedOff($)))
      return { deny: `The skill ${id.slice(6)} is turned off in Loadout for this preset. Go on without it.` }
    await countUse($, id)
    return whileInFlight($, id, () => next(e))
  })

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => drawBand($, e, next))

  on('agent.offer', async ($, e, next) => {
    const off = await storedOff($)
    return off.includes(`plugin:${e.provider.plugin}`) || off.includes(`agent:${e.agent}`) ? { isOffered: false } : next(e)
  })

  on('command.run', { command: 'loadout' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ')
    const current = await refresh($)
    const translations = await readTranslated($)

    if (verb === '') {
      const opened = await $.ui.open({ id: PANE, title: 'Loadout' })
      return {
        text: opened.isPlaced
          ? 'Loadout pane opened.'
          : `The pane could not be drawn here (${opened.reason}). Use /loadout tree.\n${USAGE}`,
      }
    }
    if (verb === 'tree')
      return { text: treeText(current, await storedOff($), translations, readDescs(await $.store.get('descs'))) }
    if (verb === 'reset') {
      await setOff($, () => [])
      return { text: 'Everything is on again. Listings already sent stay until a new session.' }
    }
    if (verb === 'on' || verb === 'off') {
      // agent: and hook: ids name no tree item; they are kept in the off list as typed.
      const node = /^(agent|hook):./.test(arg) ? { id: arg, name: arg } : resolveName(current, arg)
      if (!node) return { text: `Nothing is named "${arg}". Use /loadout tree to see the names.` }
      const off = await setOff($, list =>
        verb === 'off' ? [...new Set([...list, node.id])] : list.filter(id => id !== node.id),
      )
      return {
        text: `${node.name} is ${verb}. About ${savedTokens(current, off)} tokens are off in total (estimate). Listings already sent stay until a new session.`,
      }
    }
    if (verb === 'lang' && arg && arg.length <= 40) {
      await setLanguage($, arg)
      const { total, missing } = await translate($, arg, current)
      return { text: `Descriptions in ${arg}: ${total - missing} written, ${missing} left in the original.` }
    }
    if (verb === 'preset') return { text: await presetCommand($, rest[0] ?? '', rest.slice(1).join(' ')) }
    if (verb === 'star' || verb === 'desc') {
      const node = resolveName(current, rest[0] ?? '')
      if (!node) return { text: `Nothing is named "${rest[0] ?? ''}". Use /loadout tree to see the names.` }
      if (verb === 'star') {
        const list = await setStarred($, toggled(node.id))
        return { text: `${node.name} is ${list.includes(node.id) ? 'starred' : 'no longer starred'}.` }
      }
      const text = await setDesc($, node.id, rest.slice(1).join(' '))
      return { text: text ? `Description of ${node.name}: ${text}` : `Own description of ${node.name} cleared.` }
    }
    if (verb === 'doctor') {
      const { now, usage } = await readProjectUsage($)
      const conflicts = readConflicts(await $.store.get('conflicts'))
      const report = doctor({ inventory: current, off: await storedOff($), usage, now, conflicts })
      const { hooks, skills } = await readSeen($)
      return {
        text: `${doctorText(report, { cwd: await $.session.cwd(), now, since: usage.since })}\n${repeatedCostText(hooks, skills)}`,
      }
    }
    if (verb === 'hookcut') return { text: await hookcutCommand($, rest[0] ?? '', rest[1] ?? '', rest.slice(2).join(' ')) }
    if (verb === 'conflict') return { text: await conflictCommand($, current, rest[0] ?? '', rest[1] ?? '', rest[2] ?? '') }
    if (verb === 'classify') {
      const { total, missing } = await classify($, current)
      return { text: `Sorted ${total - missing} of ${total} items into categories; ${missing} left unsorted. Run /loadout suggest.` }
    }
    if (verb === 'suggest') return { text: await suggestCommand($, current, rest) }
    if (verb === 'history') return { text: historyText(await readHistoryList($)) }
    if (verb === 'project') {
      const cwd: string = await $.session.cwd()
      const all = readDescs(await $.store.get('projectPresets'))
      if (arg === 'clear') {
        await $.store.set('projectPresets', Object.fromEntries(Object.entries(all).filter(([dir]) => dir !== cwd)))
        return { text: `${cwd} has no preset of its own now.` }
      }
      if (!readPresets(await $.store.get('presets'))[arg]) return { text: `No preset is named "${arg}". Use /loadout preset list.` }
      await $.store.set('projectPresets', { ...all, [cwd]: arg })
      return { text: `${cwd} uses preset ${arg} from the next session start.` }
    }
    if (verb === 'once') {
      const node = resolveName(current, arg)
      if (!node || !node.id.startsWith('mcp:')) return { text: `No MCP server is named "${arg}". Use /loadout tree to see the names.` }
      await allowOnce($, node.id)
      return { text: `${node.name} is allowed for this session; it stays off in Loadout.` }
    }
    if (verb === 'cleanup') {
      const { now, usage } = await readProjectUsage($)
      const conflicts = readConflicts(await $.store.get('conflicts'))
      return { text: cleanupText(doctor({ inventory: current, off: await storedOff($), usage, now, conflicts }), current) }
    }
    if (verb === 'trial') {
      const node = resolveName(current, arg)
      if (!node) return { text: `Nothing is named "${arg}". Use /loadout tree to see the names.` }
      const until = (await $.clock.now()) + TRIAL_DAYS * DAY
      await setOff($, list => [...new Set([...list, node.id])])
      await $.store.set('trials', { ...readTrials(await $.store.get('trials')), [node.id]: until })
      return { text: `${node.name} is off until ${dateText(until)} as a trial. Loadout reminds you then; nothing is uninstalled.` }
    }
    if (verb === 'usage') {
      const { usage } = await readProjectUsage($)
      return { text: usageText(usage, await $.session.cwd()) }
    }
    if (verb === 'collapse') {
      await collapseAll($)
      return { text: 'All folders in the pane are closed.' }
    }
    if (verb === 'basic' && (arg === 'show' || arg === 'hide')) {
      await setShowBasic($, arg === 'show')
      return { text: `Skills that ship with Claude Code are ${arg === 'show' ? 'shown' : 'hidden'} in the pane.` }
    }
    return { text: USAGE }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => drawPane($, e))
}

// A trial that ran out stays off; the person decides whether to uninstall or turn it on.
async function endTrials($: any) {
  const trials = readTrials(await $.store.get('trials'))
  const ended = expiredTrials(trials, await $.clock.now())
  if (!ended.length) return
  await $.store.set('trials', Object.fromEntries(Object.entries(trials).filter(([id]) => !ended.includes(id))))
  const names = buildNames(await refresh($))
  for (const id of ended)
    $.ui.toast(`Loadout: the trial of ${names[id] ?? id} ended. It stays off: see /loadout cleanup, or /loadout on ${names[id] ?? id}.`)
}

// Drafts are previewed first; only `suggest save <draft> <name>` writes a preset.
async function suggestCommand($: any, current: any, rest: string[]) {
  const { now, usage } = await readProjectUsage($)
  const categories = readCategories(await $.store.get('categories'))
  const starred = readStrings(await $.store.get('starred'))
  const list = drafts({ inventory: current, usage, now, categories, starred })
  const names = buildNames(current)
  const [first = '', second = '', third = ''] = rest
  if (first === 'save') {
    const draft = list.find(d => d.name === second)
    if (!draft) return `No draft is named "${second}". Run /loadout suggest to see them.`
    if (!isPresetName(third)) return 'A preset name is 1 to 32 letters, digits, _ or -.'
    await setPresets($, all => ({ ...all, [third]: { off: draft.off } }))
    return `Saved preset ${third} from draft ${draft.name} (${draft.off.length} items off). Switch with /loadout preset use ${third}.`
  }
  if (first) {
    const draft = list.find(d => d.name === first)
    if (!draft) return `No draft is named "${first}". Run /loadout suggest to see them.`
    const p = preview(current, draft, usage, now)
    return [previewText(p, names), ...draft.off.map(id => `  off  ${names[id] ?? id}`)].join('\n')
  }
  const sorted = Object.keys(categories).length ? '' : '\nNo categories yet: run /loadout classify for drafts by kind of work.'
  return [
    'Preset drafts (nothing is saved until you run /loadout suggest save <draft> <name>):',
    ...list.map(d => `  ${previewText(preview(current, d, usage, now), names)}`),
  ].join('\n') + sorted
}
