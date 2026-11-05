import { expect, test } from 'claude-code/testing'

import { cutMarkers, estimateTokens, filterHookText, hookId, isSkillOff } from './logic'
import { repeatedCostText } from './doctor'

const RULES = '[응답 형식 규칙]\n- 모든 응답 마지막에 표\n- 형식:\n  | 항목 | 상태 |\n- 응답 언어: 한국어'
const OBSERVER =
  'Invoke the task-observer skill before the first tool call and run its Session Start Protocol. 4 open observations.'
const SUPER = '<EXTREMELY_IMPORTANT>\nYou have superpowers.\n</EXTREMELY_IMPORTANT>'
const PREVIEW = 'No preview server is running. Before ending your turn, call preview_start.'

test('a hook: marker cuts its block: from its line to a blank line or a tag line', () => {
  expect(cutMarkers([hookId('[응답 형식 규칙]')])).toEqual(['[응답 형식 규칙]'])
  expect(filterHookText(RULES, [hookId('[응답 형식 규칙]')])).toBeNull()
  expect(filterHookText(`${OBSERVER}\n${SUPER}`, [hookId('Invoke the task-observer skill')])).toBe(SUPER)
  expect(filterHookText(PREVIEW, [hookId('No preview server is running')])).toBeNull()
  expect(filterHookText(`keep\n\n${PREVIEW}\n\nalso keep`, [hookId('No preview server')])).toBe('keep\n\nalso keep')
  expect(filterHookText(RULES, [hookId('not there')])).toBe(RULES)
  expect(filterHookText(RULES, [])).toBe(RULES)
})

test('hook markers and plugin markers apply together', () => {
  const both = `${OBSERVER}\n${SUPER}`
  expect(filterHookText(both, ['plugin:superpowers', hookId('Invoke the task-observer')])).toBeNull()
})

test('hook: ids are not skills, so they never hide a listing line', () => {
  expect(isSkillOff('hook', [hookId('x')])).toBe(false)
})

test('token estimate counts non-ASCII letters one each and ASCII by four', () => {
  expect(estimateTokens('abcdefgh')).toBe(2)
  expect(estimateTokens('한국어')).toBe(3)
  expect(estimateTokens('')).toBe(0)
})

test('per-turn cost names each hook text, how often it repeats, and mandatory skills', () => {
  const text = repeatedCostText(
    {
      'UserPromptSubmit|[응답 형식 규칙]': { event: 'UserPromptSubmit', head: '[응답 형식 규칙]', tokens: 120, isCut: false },
      'PostToolUse|No preview server': { event: 'PostToolUse', head: 'No preview server', tokens: 40, isCut: true },
      'SessionStart|Invoke the task-observer skill': {
        event: 'SessionStart',
        head: 'Invoke the task-observer skill',
        tokens: 50,
        isCut: false,
      },
    },
    { 'task-observer': 5000, tdd: 900 },
  )
  expect(text).toContain('~120t every prompt (UserPromptSubmit): [응답 형식 규칙]')
  expect(text).toContain('~40t every tool call (PostToolUse): No preview server [cut]')
  expect(text).toContain('~50t once, then in every request (SessionStart): Invoke the task-observer skill')
  expect(text).toContain('task-observer ~5000t [a hook text asks for it]')
  expect(text).toContain('tdd ~900t')
  expect(text).not.toContain('tdd ~900t [a hook')
  expect(text).toContain('/loadout hookcut add <preset> <marker>')
  expect(repeatedCostText({}, {})).toContain('No hook text or skill seen yet')
})
