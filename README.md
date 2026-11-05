# Loadout

Loadout은 Claude Code에 설치된 skill, plugin, MCP 서버를 짧은 설명이 붙은 파일 트리로 보여 줍니다.
지금 하는 일에 맞지 않는 항목을 꺼서 모델이 읽는 목록과 도구 설명을 줄입니다. 그만큼 토큰이 절약됩니다.

가방 정리에 비유할 수 있습니다. 등산 갈 때와 출장 갈 때 챙기는 짐이 다르듯,
코딩할 때와 기획할 때 켜 둘 도구가 다릅니다. Loadout은 짐 목록을 펼쳐 보여 주고,
작업 종류별 짐 꾸러미(프리셋)를 저장해 두었다가 바꿔 들게 해 줍니다.

## 설치

터미널의 Claude Code 프롬프트에서:

```
/plugin install loadout --marketplace Did-you-walk-today/loadout-tree
```

마켓플레이스를 추가할지 물으면 `y`, 범위(scope)는 user를 고르면 됩니다.

셸에서:

```bash
claude plugin install loadout --marketplace Did-you-walk-today/loadout-tree
```

데스크톱 앱에서는 `/plugin`이 동작하지 않습니다. 입력창 옆 + 를 누르고 Plugins, Add marketplace에 `Did-you-walk-today/loadout-tree`를 넣은 뒤 Add plugin을 누릅니다.

## 무엇을 하나

- 설치된 항목 전체를 `plugins/`, `skills/`, `mcp/` 세 폴더로 나눠 트리로 보여 줍니다.
  - skill은 첫 글자별 하위 폴더로 묶습니다.
  - 항목마다 대략적인 토큰 수(`~410t`)와 설명이 붙습니다.
- 항목을 끄면 다음이 적용됩니다.
  - **skill**: 모델에게 가는 skill 목록에서 빠지고, `Skill` 도구로 부르면 거절됩니다(사람이 `/이름`으로 부르는 것은 됩니다). 훅이 "task-observer를 먼저 부르라"고 해도 이 프리셋에서는 막힙니다.
  - **MCP 서버**: 도구가 deferred로 바뀌고, 호출하면 거절됩니다.
  - **plugin**: 그 plugin의 skill, 도구, 서브에이전트가 모두 빠집니다.
  - **ponytail, superpowers**: 이 둘을 끄면 SessionStart 훅이 넣는 안내문도 잘라 냅니다.
  - **서브에이전트 종류**(`agent:Plan` 등): 모델에게 그 종류를 보여 주지 않습니다.
  - **훅 문구**(`hook:<표시 글자>`): 설정 훅(SessionStart, UserPromptSubmit, PostToolUse 등 모든 이벤트)이 넣은 글 중 표시 글자가 든 덩어리를 잘라 냅니다. 덩어리는 표시 글자가 있는 줄부터 빈 줄이나 `<`로 시작하는 줄 앞까지입니다.
- 작업 종류별 프리셋을 저장하고 바꿀 수 있습니다. 예를 들어 `coding`에는 superpowers를 끄고, `planning`에는 ponytail을 끕니다. 훅 문구 자르기와 skill, 서브에이전트 막기도 프리셋에 함께 저장됩니다. 내 규칙(응답 형식, task-observer 등)은 그 프리셋에 직접 넣었을 때만 잘립니다.
- 모델에게 `use_preset` 도구를 줍니다. 이 도구는 **제안만** 합니다(알림 표시). 세션 중간 전환은 이미 보낸 글을 다시 쓰게 해 prompt cache를 잃기 때문입니다. 전환은 사람이 `/loadout preset use`로 하거나, `/loadout project`로 다음 세션 시작부터 적용합니다.
- `doctor`에 **턴마다 반복되는 비용**이 붙습니다. 이 세션에서 본 훅 문구마다 대략 토큰 수와 반복 주기(프롬프트마다, 도구 호출마다, 세션 시작 1회)를, 불러온 skill마다 본문 토큰 수를 보여 주고, 훅 문구가 부르라고 한 skill에는 `[a hook text asks for it]`을 붙입니다.
- 자주 쓰는 항목에는 별표를 달 수 있습니다. 별표 항목과 그 폴더는 맨 위로 올라갑니다.
- 항목 설명을 내 말로 바꿔 쓸 수 있습니다.
- 설명 전체를 원하는 언어로 번역할 수 있습니다. 번역은 haiku 모델로 한 번 하고 저장해 둡니다.
- Claude Code에 기본 포함된 skill(`built-in`)은 기본으로 숨깁니다. 설정으로 다시 보이게 할 수 있습니다.
- **사용 기록**: MCP 도구 호출과 `Skill` 도구 호출을 프로젝트(작업 폴더)별로 셉니다. 항목마다 횟수와 마지막 사용 날짜를 남깁니다.
- **점검(`doctor`)**: 같은 도구 묶음을 가진 서버 중복(예: Gmail 두 개), 무거운 항목 상위 10개, 인증 도구만 있는 서버, 이름이 겹치는 skill 묶음(예: review가 들어간 skill 3개 이상), 충돌 쌍(기본 ponytail + superpowers), 30일 넘게 안 쓴 항목을 찾고, 끄면 줄어드는 토큰을 함께 보여 줍니다.
- **추천**: 사용 기록과 자동 분류(haiku, 결과는 저장)로 프리셋 초안을 만들고, 저장 전에 미리보기(끌 항목 수, 줄어드는 토큰, 최근 7일에 쓴 항목 중 꺼지는 것)를 보여 줍니다. 창에서 분류별 보기로 바꿀 수 있습니다.
- **삭제 후보**: 삭제 후보와 지우는 명령을 보여 주기만 합니다. Loadout은 아무것도 지우지 않습니다. 먼저 14일 동안 꺼 두는 `trial`을 권합니다.
- **자동화**: 폴더별 프리셋을 세션 시작 때 적용합니다. 입력한 글이 다른 프리셋 작업처럼 보이면 알림으로 제안만 합니다(바꾸지 않음). 꺼진 도구를 부르면 이번 세션만 허용하는 `once`를 알려 줍니다.
- **실시간 표시**: 상태줄(프리셋, 꺼진 수, 절약 추정), 프리셋을 바꾼 뒤 5초 동안 입력창 위 띠, 창의 표시(`in use`, `just now`, `off next session`), 누가 바꿨는지(user, model, auto) 남는 전환 기록.

## 화면 (pane)

`/loadout`을 실행하면 채팅 옆에 Loadout 창이 열립니다.

| 칸 | 의미 | 누르면 |
|----|------|--------|
| `[*]` / `[ ]` | 별표 있음 / 없음 | 별표를 켜고 끔 |
| `[on]` / `[off]` | 켜짐 / 꺼짐 | 켜고 끔 |
| `>` / `v` | 접힌 폴더 / 열린 폴더 | 펼치고 접음 |
| 이름 | 종류별 색 | - |
| `~123t` | 대략적인 토큰 수(금색) | - |
| 설명 | 내 설명, 번역, 원래 설명 순으로 표시 | - |

이름 색으로 종류를 구분합니다.

| 종류 | 색 |
|------|----|
| 폴더 | 주황 |
| plugin | 보라 |
| skill | 청록 |
| MCP 서버 | 파랑 |
| 꺼진 항목 | 빨강 + 취소선 |

- 설명 칸 앞에 붙는 표시입니다. 줄 수는 늘지 않습니다.

| 표시 | 뜻 |
|------|----|
| `[in use]` | 그 항목의 도구 호출이 지금 실행 중 (plugin은 안쪽 항목 하나라도) |
| `[just now]` | 1분 안에 켜거나 끈 항목 |
| `[off next session]` | 이 세션 중에 끈 항목. 이미 보낸 목록에는 남아 있고, 새 세션에서 빠집니다 |

- `View: tree` 버튼을 누르면 분류별 보기(`coding/`, `seo/`, ... `unsorted/`)로 바뀝니다. 분류는 `/loadout classify`로 만듭니다.
- 창 위쪽의 "Your description" 칸에 `이름 설명`을 입력하면 설명이 저장됩니다. 이름만 입력하면 설명이 지워집니다. 모바일에는 이 칸이 없습니다.
- 창은 한 번에 50줄까지만 그립니다. 넘치면 폴더를 접거나 `/loadout collapse`를 실행하세요.

## 명령

| 명령 | 하는 일 |
|------|---------|
| `/loadout` | 창을 엽니다 |
| `/loadout tree` | 트리를 텍스트로 출력합니다 (창을 그릴 수 없는 곳에서 사용) |
| `/loadout off <이름>` | 항목을 끕니다. `agent:<종류>`, `hook:<표시 글자>`도 됩니다 |
| `/loadout hookcut add\|remove <프리셋> <표시 글자>` | 그 프리셋이 켜져 있을 때 표시 글자가 든 훅 문구를 자릅니다 |
| `/loadout hookcut list <프리셋>` | 그 프리셋이 자르는 표시 글자 목록 |
| `/loadout on <이름>` | 항목을 켭니다 |
| `/loadout reset` | 전부 다시 켭니다 |
| `/loadout star <이름>` | 별표를 켜고 끕니다 |
| `/loadout desc <이름> <설명>` | 내 설명을 저장합니다. 설명을 비우면 지웁니다 |
| `/loadout lang <언어>` | 설명을 그 언어로 번역해 보여 줍니다 (예: `Korean`) |
| `/loadout basic show` / `hide` | 기본 skill을 보이거나 숨깁니다 |
| `/loadout collapse` | 창의 폴더를 모두 접습니다 |
| `/loadout preset list` | 프리셋 목록을 봅니다. `*`가 붙은 것이 현재 프리셋입니다 |
| `/loadout preset save <이름>` | 지금 꺼진 항목들을 프리셋으로 저장합니다 |
| `/loadout preset use <이름>` | 프리셋으로 바꿉니다 |
| `/loadout preset delete <이름>` | 프리셋을 지웁니다 |
| `/loadout usage` | 이 프로젝트의 사용 횟수와 마지막 사용일 |
| `/loadout doctor` | 중복, 무거운 항목, 인증 필요, 겹치는 skill, 충돌 쌍, 30일 미사용 점검 |
| `/loadout conflict add\|remove <a> <b>` / `conflict list` | doctor가 함께 켜져 있으면 알리는 충돌 쌍 |
| `/loadout classify` | 항목을 작업 종류로 분류합니다 (haiku 호출, 결과 저장) |
| `/loadout suggest` | 프리셋 초안과 미리보기. `suggest <초안>`은 끌 항목 목록 |
| `/loadout suggest save <초안> <이름>` | 초안을 프리셋으로 저장합니다 (바꾸지는 않음) |
| `/loadout cleanup` | 삭제 후보와 직접 실행할 명령 (Loadout은 실행하지 않음) |
| `/loadout trial <이름>` | 14일 동안 꺼 둡니다. 끝나면 알림 (꺼진 채 유지) |
| `/loadout project <프리셋>` / `project clear` | 이 폴더에서 세션이 시작될 때 쓸 프리셋 |
| `/loadout once <서버>` | 꺼진 MCP 서버를 이번 세션만 허용합니다 |
| `/loadout history` | 프리셋 전환 기록과 누가 바꿨는지 |

- `<이름>`에는 트리에 보이는 이름을 씁니다. plugin 이름(`ponytail`), skill 이름(`tdd`), MCP 서버 이름(`gmail`) 모두 됩니다.
- 프리셋 이름은 1~32자이고 공백은 쓸 수 없습니다.

## 프리셋 예시

```
/loadout off superpowers
/loadout preset save coding
/loadout reset
/loadout off ponytail
/loadout preset save planning
```

이후 `/loadout preset use coding`으로 바꾸면 됩니다. 모델은 `use_preset` 도구로 제안만 합니다.

반복 문구까지 줄이는 `quick` 예시입니다.

```
/loadout off superpowers
/loadout off task-observer
/loadout preset save quick
/loadout hookcut add quick [응답 형식 규칙]
/loadout hookcut add quick No preview server is running
/loadout hookcut add quick Invoke the task-observer skill
/loadout project quick
```

## 언제 적용되나

- 프리셋 전환의 기본 시점은 **세션 시작**입니다(`/loadout project <프리셋>`). 입력한 글이 다른 프리셋 작업처럼 보이거나 모델이 `use_preset`을 부르면 알림으로 제안만 합니다.
- 꺼진 MCP 도구의 호출 거절, 꺼진 skill의 `Skill` 호출 거절, 서브에이전트 숨김은 바로 적용됩니다.
- `hookcut`은 그 훅이 다음에 돌 때부터 적용되고, 이미 보낸 글은 다시 쓰지 않습니다(prompt cache 유지).
- 이미 모델에게 보낸 skill 목록과 도구 목록은 세션 중간에 다시 보내지지 않습니다. 그래서 세션 중간에 바꾸면 **일부만** 적용되고, **새 세션에서 완전히** 적용됩니다.
- 토큰 수는 Claude Code가 알려 주는 값을 바탕으로 한 추정치입니다. 실제로 줄어든 양은 아직 측정하지 않았습니다.

## 저장 위치

설정은 mod의 `$.store`에 저장되어 세션이 바뀌어도 남습니다.
저장되는 값은 꺼진 항목, 프리셋, 현재 프리셋, 별표, 내 설명, 언어, 번역, 기본 skill 표시 여부,
프로젝트별 사용 기록(`usage:<폴더>`), 분류, 충돌 쌍, trial 만료일, 폴더별 프리셋, 전환 기록(최근 20개)입니다.
`once` 허용과 창 표시는 세션 동안만 남습니다.
`settings.json`과 `CLAUDE.md`는 건드리지 않습니다.

## 파일 구성

| 파일 | 내용 |
|------|------|
| `.claude-plugin/plugin.json` | mod 이름, 버전, 설명 |
| `hooks/hooks.json` | 훅 모듈 경로 |
| `hooks/register.tsx` | 훅과 `/loadout` 명령 |
| `hooks/store.tsx` | 상태(atom), 저장 도우미, 창과 띠 그리기 (atom을 읽고 쓰는 코드는 엔진 규칙상 이 파일에 모입니다) |
| `hooks/logic.ts` | 트리 만들기, 목록 필터, 색, 프리셋 읽기 같은 순수 함수 |
| `hooks/usage.ts` | 사용 기록 |
| `hooks/doctor.ts` | 점검, 삭제 후보, trial |
| `hooks/recommend.ts` | 분류, 프리셋 초안, 작업 종류 추정 |
| `hooks/live.ts` | 상태줄, 띠, 창 표시, 전환 기록 문구 |
| `hooks/*.test.ts(x)` | 테스트 |
| `types/index.d.ts` | 상태 타입 계약 |

## 개발과 검증

```bash
claude plugin test .
claude plugin validate .
npx -y -p typescript@5.9.3 tsc -p . --noEmit
```

## 측정 결과 (2026-11-05)

헤드리스 `claude -p` 실행으로 측정했습니다. 결과물 품질(테스트 통과, 코드 줄 수)은 모든 조건에서 같았습니다.

| 실험 | 결과 |
|------|------|
| Loadout 자체 비용 | 호출당 약 +190 토큰 (2회 측정) |
| 코딩 프리셋 (plugin 13개 끔) | 첫 호출 입력 -8.1% (69,008 -> 63,401, 2회 같음) |
| superpowers만 끔 (sonnet, 3회씩 2차례) | 첫 호출 약 -1,200 토큰. 총 토큰과 시간은 차례마다 뒤집혀 오차 범위 |
| quick 프리셋 (sonnet, 5회씩, 큰 과제 포함) | 첫 호출 -9%, 총 입력 -25%, 비용 -30~31% |

- 큰 절감은 skill 목록을 줄여서가 아니라, 매 턴 반복되는 훅 안내문을 자르고 과제와 무관한 skill 호출을 막아서 나온 것으로 봅니다.
- quick 프리셋은 응답 형식 규칙과 task-observer 안내문도 자릅니다. 그 규칙이 필요한 작업에서는 쓰지 마세요.

## 알려진 한계

- Desktop은 Button을 기본 버튼 모양으로 그립니다. 그래서 `[on]`/`[off]`와 `[*]` 글자에는 색이 들어가지 않습니다. 대신 이름의 색과 취소선으로 상태를 보여 줍니다.
- 사용 기록은 MCP 도구와 `Skill` 도구 호출만 셉니다. 사람이 `/스킬이름`으로 직접 부른 것은 세지 않습니다. 기록은 이 버전부터 쌓이므로 30일 미사용 목록은 처음 30일 동안 이릅니다.
- "인증 필요"는 도구가 `authenticate`류뿐인 서버로 추정합니다. Claude Code가 인증 상태를 직접 알려 주지는 않습니다.
- 작업 종류 추정은 단어 목록(`hooks/recommend.ts` `TASK_WORDS`)으로 합니다. 프리셋 이름이 그 종류 이름(`coding`, `planning` 등)이거나 글에 프리셋 이름이 있을 때만 제안합니다.
- `once` 허용은 mod를 다시 불러오면(hot reload) 지워집니다.
- 훅 문구 덩어리는 빈 줄에서 끝납니다. 중간에 빈 줄이 있는 훅 문구는 첫 빈 줄까지만 잘리므로 표시 글자를 하나 더 넣어야 합니다.
- `doctor`의 반복 비용 토큰 수는 글자 수로 어림합니다(ASCII 4자에 1, 그 밖의 글자 1자에 1). 이 세션에서 실제로 들어온 훅 문구와 skill만 보이고, mod를 다시 불러오면 비워집니다.
- ponytail과 superpowers의 안내문 잘라내기는 두 plugin이 지금 넣는 글자 패턴에 맞춰져 있습니다. 두 plugin이 문구를 바꾸면 다시 맞춰야 합니다.
