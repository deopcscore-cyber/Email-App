# 04 — User Flows

Written as the sequences we will build and test against. Keyboard path is the
primary path; pointer is the fallback.

## 1. Onboarding & account connect

```
Landing → "Continue with Google / Microsoft"
  → provider consent (mail scopes)
  → callback: create User + EmailAccount, start backfill job
  → redirect to /inbox
      · first ~100 threads appear within ~1s (first backfill batch)
      · slim progress bar in sidebar: "Syncing… 34%" (SSE sync.progress)
      · empty-state skeletons, never a blank screen
Add second account: Sidebar avatar → "Add account" → same OAuth loop
  → unified inbox ON by default; per-account filter via account switcher
```

**Edge cases:** consent denied → return to login with soft toast; token revoked
later → account badge turns amber, "Reconnect" re-runs OAuth; backfill failure
→ retry with backoff, status visible in Settings → Accounts.

## 2. Daily triage (the core loop)

```
Open app → Inbox, first row focused
  j / k  or ↓ / ↑ ......... move focus (list scrolls, focused row elevated)
  Enter or o ............... open thread in right column (reading pane)
  e ........................ archive  → row slides out, next row focused, undo toast
  # ........................ trash
  ! ........................ mark spam
  s ........................ star      ⇧p ....... pin to top
  u ........................ toggle read/unread
  h ........................ snooze popover (Tomorrow 8am / This weekend /
                             Next week / natural language: "friday 3pm")
  l ........................ label picker (fuzzy)
  x ........................ select; x on more rows = multi-select → bulk actions
  z ........................ undo last action
```

Every action is optimistic: UI responds in the same frame, server writes
follow, provider write-back is async. Failures roll back with a toast.

## 3. Reading a thread

```
Open thread → messages render newest-expanded, older collapsed
  · AI thread summary appears at top when thread > 2 messages (pre-computed)
  · attachments as chips: click = preview, hover = download
  n / p .... next / previous message in thread
  r ........ reply        a ........ reply all       f ........ forward
  ⇧u ....... mark unread & return to list            Esc ...... back to list
```

Reply opens an inline quick-reply at the thread bottom (not a modal) —
full compose available via "expand" (⇧Enter).

## 4. Compose & send (undo / schedule)

```
c → compose modal (spring-in, bottom-right docked; ⇧c full-screen)
  To field: contact autocomplete ranked by interaction count
  Cc/Bcc revealed via buttons or ⌘⇧c / ⌘⇧b
  Tiptap rich text; ⌘k link, markdown-style shortcuts
  Attachments: drag-and-drop anywhere on modal (dropzone glow), or paperclip
  Draft autosaves 1.5s after last keystroke ("Saved" whisper in footer)

⌘Enter → Send
  → modal closes, toast: "Sending… Undo (10s)" with progress ring
  → Undo clicked → message reopens as draft, nothing was sent
  → window elapses → worker dispatches → toast fades to "Sent"

⌘⇧Enter (or split-button ▾) → Schedule send
  → popover: Tomorrow 8am / Monday 9am / custom / natural language
  → thread shows "Scheduled · Mon 9:00" chip; editable/cancelable until dispatch
```

**Edge cases:** send failure → `FAILED` status, thread pinned in Drafts with
retry banner; attachment upload in flight → send button disabled with reason;
offline → compose kept locally, banner "Reconnecting…".

## 5. Search & command palette

```
⌘K (or /) → palette overlays center (backdrop blur, spring)
  Type → instant results grouped: Threads · Contacts · Actions · Labels
         (< 50ms, Postgres FTS, as-you-type)
  Operators supported inline: from:sarah has:attachment after:2026-06-01
  Natural language detected ("invoice from john last month")
      → "Ask AI" row highlighted → Enter
      → compiled filter rendered as chips  [from: John Doe] [last month] [invoice]
      → chips removable/editable; results are ordinary search results
  ↑↓ navigate · Enter open · ⌘Enter open in split · Esc close
Palette also executes commands: "snooze", "label: Q3", "go to drafts",
"compose to sarah" — same fuzzy index as shortcuts.
```

## 6. AI panel

```
Thread open → ⌘J or sparkle button toggles far-right AI panel (slide + fade)
  Quick actions: Summarize · Reply · Rewrite · Action items · Explain ·
                 Translate · Follow-up
  Summarize ....... streams bullet summary; cached → instant on revisit
  Reply ........... 3 suggested replies (short/neutral/detailed) → click
                    inserts into quick-reply, fully editable
  Rewrite ......... acts on current draft: tone chips (Professional / Friendly /
                    Concise / Assertive) + free-form instruction
  Action items .... checklist with deadlines; "Add reminder" per item
  Ask anything .... chat scoped to this thread's content, streaming
Panel remembers open/closed per breakpoint; Esc closes.
```

**AI trust rules:** AI output is always labeled, always editable, never
auto-sent. Failures degrade silently to a retry affordance — never block email
functionality.

## 7. Daily briefing & follow-ups

```
Morning (user-set hour, worker cron):
  → briefing generated: unread-important digest, deadlines today,
    meetings detected, threads awaiting your reply
  → appears as dismissible card at top of inbox + sidebar dot
Follow-up: sent thread with no reply after N days (AI-judged "expects reply")
  → reminder surfaces in Priority with "Nudge" (AI-drafted follow-up) or Dismiss
```

## 8. Responsive behavior

| Breakpoint | Layout |
|---|---|
| ≥ 1440px | 4 columns possible: sidebar · list · reading pane · AI panel |
| 1024–1439px | 3 columns; AI panel overlays reading pane when opened |
| 768–1023px (tablet) | sidebar collapses to icon rail; list ↔ thread as 2 columns |
| < 768px (mobile) | single column stack: folders → list → thread (slide navigation), compose full-screen, AI panel bottom sheet, swipe right = archive, swipe left = snooze |

## 9. Keyboard map (global reference — `?` opens this in-app)

| Key | Action | | Key | Action |
|---|---|---|---|---|
| `c` | compose | | `⌘K` `/` | palette / search |
| `r` `a` `f` | reply / reply all / forward | | `j` `k` | next / prev thread |
| `e` | archive | | `o` `Enter` | open thread |
| `#` | trash | | `u` | read / unread |
| `!` | spam | | `s` | star |
| `h` | snooze | | `⇧p` | pin |
| `l` | label | | `x` | select |
| `z` | undo | | `g then i/t/d/s` | go to inbox/starred/drafts/sent |
| `⌘Enter` | send | | `⌘J` | AI panel |
| `Esc` | close / back | | `?` | shortcut help |

Scope stack resolves conflicts: palette > compose > thread > list. Single-key
shortcuts are suppressed while any text input is focused.
