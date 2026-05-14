# Undernote — Spec

A fictional encrypted-messenger frontend designed as an interactive companion to a piece of fiction. Readers can "log in" and message characters from the story via known IDs, or stumble onto strangers and minor characters via random IDs. No real networking. No real crypto. Single-page web app.

The aesthetic is paranoid open-source terminal: green-on-black, monospace, blinking cursor, ephemeral by default. The fictional product is positioned as a French open-source encrypted messenger with no central registry, no accounts, no recovery — security through obscurity, identity through unique device + chosen username.

---

## Build plan

1. Build the engine, UI, persistence, and placeholder trees.
2. Test mechanics end-to-end with the placeholders.
3. Write the real trees (SE, accidental-discovery characters, strangers).

This spec covers steps 1–2. Real tree content is out of scope for v1 build.

---

## Core concepts

### Identity

- A **user ID** is a 12-character lowercase alphanumeric string (`[a-z0-9]{12}`). Example: `ajjrpx34l3qv`.
- A **display handle** is 2–3 uppercase letters (`[A-Z]{2,3}`). Example: `OC`, `SE`.
- A device "logs in" by combining a user ID with the local browser's localStorage. The same user ID on a different device/browser is effectively a different account — no sync, no central registry.
- Player can either **generate a new ID** (random 12-char string) or **reconnect to an existing ID** they've used on this device before. Reconnecting is only allowed for IDs that were previously generated/used on this device (tracked in localStorage). Attempting to "log in" as an ID never used here is rejected — flavored as "device mismatch, this account is bound to a different device."
- This blocks players from claiming to be `ajjrpx34l3qv` (OC) or `k6v63rlw5n4m` (SE) unless they got lucky enough to generate those exact strings (cosmically improbable).

### Contact requests

- Adding a contact = sending a request to a 12-char ID. The fictional product's "security" claim: requests succeed silently regardless of whether the ID exists — only acceptance reveals existence.
- UI feedback on request: `"Contact request sent (if user exists)"`. No confirmation either way until the contact accepts (or doesn't).
- An "acceptance" is the first `status: online` event in that contact's tree. Acceptance delay is part of the tree (a `wait` event before the status flip).
- Some IDs map to **silence trees** — silence forever, the request never resolves. The contact appears in the list with status `pending` (or just `offline`?) indefinitely. (Decision: use `offline` to keep the status enum small; `pending` adds nothing functional.)
- A **DELETED** contact never accepts new requests. (Only reachable as a tree outcome — see Status enum below.)

### Messaging

- Player can only send messages to contacts whose status is `online`.
- Sending is disabled (input blocked / send button greyed) for `offline` and `deleted` contacts.
- Empty/whitespace-only input is rejected. `"..."`, single emoji, etc. are valid.
- Hard 500-character cap. Input stops accepting keystrokes at 500 — no warning, no overflow.

### Ephemerality

- Messages are wiped on `KILL SESSION` button press OR tab close.
- **Persisted across sessions** (per player ID, in localStorage):
  - Contact list (IDs and their handles)
  - Per-contact status and current tree node ID
  - The world's ID→tree assignments (global, not per-player)
  - The list of IDs this device has used (for reconnect)
  - The player's display handle for each of their IDs
- **Not persisted**: message history, pending event queues. Branches are authored to end in idle loops so there is no in-flight playback to resume.

---

## Status enum

A contact's status is one of:

- `offline` — contact exists in list but is not reachable. Player cannot send. Used as initial state after a contact request, and during between-branch lulls.
- `online` — contact is reachable. Player can send. The green indicator dot is lit.
- `deleted` — account has been deleted. Permanent. Player cannot send. Cannot view chat history (it's gone). Labeled `[DELETED]` in the contact list. Only reachable from specific tree branches as a hard dead-end.

---

## Tree engine

### Node shape

```json
{
  "id": "se_intro",
  "events": [
    { "wait": 3000 },
    { "status": "online" },
    { "send": "Prove it's you." }
  ],
  "patterns": [
    { "pattern": "yes|yeah|it'?s me", "next": "se_believes" },
    { "pattern": ".*", "next": "se_doubts" }
  ]
}
```

- **Events fire on entering the node.** The runtime plays them in order.
- **Patterns match the next player message** after events finish.
- First matching pattern wins. Patterns are regex, case-insensitive (`/i` flag).
- Convention: include a catchall `.*` as the last pattern. If no pattern matches and no catchall exists, the player's message is effectively swallowed and the node stays put (player can try again). Recommended: always include catchall.
- Trees must end in idle loops, not dead ends. An idle loop is a node whose events cycle status between online/offline with `wait`s, and whose patterns route back into the tree. The only acceptable terminal node is one with `status: deleted` in its events.

### Event types (v1)

| Event | Shape | Effect |
|-------|-------|--------|
| `wait` | `{ "wait": <ms> }` | Pause playback for N milliseconds. |
| `send` | `{ "send": "<text>" }` | Deliver a message from the contact. Plays the ping if applicable. Supports interpolation. |
| `status` | `{ "status": "online" \| "offline" \| "deleted" }` | Change the contact's status. Updates contact list and chat UI. |

### Interpolation in `send` text

- `{message}` — the player's last message in full.
- `{1}`, `{2}`, ... — regex capture groups from the pattern that triggered transition into this node.

Interpolation happens at `send` time, using whatever the player's most recent message was when the node was entered.

### Interruption semantics

- If the player sends a message while a node's events are still playing:
  - The **current** event finishes (a `wait` is not aborted mid-wait; a `send` completes its delivery).
  - **All subsequent queued events for that node are cancelled.**
  - The player's message is matched against the node's patterns and the tree advances to the matching `next` node.
- This means a fast-typing player can skip later events in a sequence. This is intended.

### Parallel conversations

- Each contact has its own independent conversation state: `{ currentNodeId, status, eventQueue }`.
- All contacts' trees run in parallel. Events fire regardless of which chat the player has open.
- A non-focused contact receiving events shows an activity indicator (see UI section).

---

## ID → tree assignment

### Canonical (hardcoded)

- `ajjrpx34l3qv` → `tree:OC` (the protagonist; treated as "this is you" if entered as a player's own ID, but if messaged from another player's session, plays the OC tree)
- `k6v63rlw5n4m` → `tree:SE`

### Accidental discovery (character trees not on a canonical ID)

- A pool of additional character trees. v1: author 0 of these for the build; placeholder trees in test data. Add real ones later.
- Each character tree can only be "discovered" once globally per browser. After assignment, marked as used and never re-rolled.

### Stranger trees

- v1: 3 stranger trees (placeholders for build, real content authored later).
- Reusable: multiple random IDs can be assigned to the same stranger tree. The assignment for any specific ID is stable once made.

### Silence

- The majority outcome. Contact request never resolves. Contact stays at `offline` forever.

### Assignment algorithm

On first contact request to an ID not already in `world.assignments`:

1. If the ID is a canonical hardcoded ID, use that mapping. (No roll, no storage needed — but cache the result in `world.assignments` for consistency.)
2. Otherwise, roll a random number 0–99:
   - `0–4` (5%): try to assign an unused character tree. If all character trees are used, fall through to step 3.
   - `5–19` (15%): assign a stranger tree. Pick a stranger tree (random, with repetition allowed across IDs).
   - `20–99` (80%): silence.
3. Persist the mapping in `world.assignments`.
4. If a character tree was assigned, also append it to `world.usedCharacterTrees`.

Random + stored (not deterministic-hash-based). Tunable percentages live in a constants module.

---

## localStorage schema

Namespace everything under `undernote.`.

```
undernote.world.assignments              JSON: { "<id>": "<treeKey>" | "silence" }
undernote.world.usedCharacterTrees       JSON: ["tree:characterA", ...]

undernote.device.ids                     JSON: ["<id>", "<id>", ...]   // IDs this device has used

undernote.player.<playerId>.handle       string: "OC"
undernote.player.<playerId>.contacts     JSON: [
                                           {
                                             "id": "<id>",
                                             "handle": "SE",
                                             "status": "online" | "offline" | "deleted",
                                             "currentNodeId": "se_intro"
                                           },
                                           ...
                                         ]
```

Notes:

- Stranger handles are generated when their tree is assigned and stored on the contact record so they don't regenerate.
- A "fresh login" as a new player ID gets an empty contacts array. Other players' contacts on the same device remain in their own keys.
- `world.assignments` and `world.usedCharacterTrees` are shared across all players on this device, modeling "the world" as global per-browser.

---

## Boot sequence

1. Page loads.
2. Show splash: `Connecting to undernote mesh...` with brief fake-loading delay (~1–2 seconds).
3. Show login prompt with two options:
   - **`> NEW IDENTITY`** — generates a random 12-char ID, prompts for a 2–3 char handle.
   - **`> RECONNECT`** — shows list of IDs this device has used (from `undernote.device.ids`). Player picks one. If none exist, this option is disabled or absent.
4. After login, enter the main app: contact list + (empty or last-opened) chat panel.
5. All contacts' tree states load and resume from their persisted `currentNodeId`. Because nodes are designed as idle loops, this means contacts immediately resume idle behavior.

---

## UI

### Layout

- **Desktop:** two-pane. Contact list on the left (~25% width), chat panel on the right.
- **Mobile:** single-pane. Show contact list OR chat panel, with back navigation between them.

### Visuals

- Background: black (`#000` or near-black).
- Foreground: green (specific shade TBD — start with `#33ff33` or similar; tune later).
- Font: web-safe monospace stack to start (e.g., `ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`). Swap to a web font like JetBrains Mono or VT323 in v2.
- Cursor: 1s on / 1s off blink, block style (▮ or filled rect).
- CRT effects (scanlines, glow, flicker): **v2 only.** v1 is flat green-on-black.

### Header / status line

- Bottom or top status line showing:
  - Player's handle and ID (e.g., `[OC | ajjrpx34l3qv]`)
  - Contact count
  - `MESSAGES WILL BE ERASED ON EXIT` warning
- `[KILL SESSION]` button (or `Ctrl+K` shortcut) — wipes messages, returns to login.

### Contact list

Each row shows:

- Status indicator (left): `●` green for online, `○` grey/dim for offline, `[DEL]` for deleted.
- Handle (e.g., `SE`).
- The 12-char ID (smaller / dimmer).
- Activity indicator (right): blinking asterisk `*` when there's new activity on a non-focused contact. Cleared when player opens that chat.

Deleted contacts are visually struck-through or otherwise dimmed. Clicking them opens an empty chat panel that shows `[CHAT ERASED]` and disables input.

### Chat panel

- Header: `[<handle> | <id>] — <status>`
- Message log: scrolling messages, infinite scroll within session.
  - Player messages: right-aligned or prefixed with player's handle.
  - Contact messages: left-aligned or prefixed with contact's handle.
  - Timestamps optional in v1; skip for simplicity unless they fit the aesthetic.
- Input row at bottom: `> ` prompt, 500-char cap, send on Enter.
- If contact is `offline` or `deleted`: input disabled with placeholder like `[CONTACT UNREACHABLE]`.

### Add-contact UI

- A `+ ADD CONTACT` button (or `Ctrl+N`) opens a small modal/prompt.
- Player enters a 12-char ID.
- Validation: must match `[a-z0-9]{12}`. Reject malformed with `INVALID ID FORMAT — 12 alphanumeric characters required`.
- Reject if it matches the player's own current ID: `CANNOT SEND TO SELF`.
- Reject if the ID is already in the player's contact list.
- Otherwise: add contact at `offline` status, start its tree's root events, show `Contact request sent (if user exists)`.

---

## Audio

- A soft, hushed, slightly distorted ping on every `send` event from a contact.
- Generate procedurally via Web Audio API. Rough recipe:
  - ~800Hz sine wave, 60–100ms duration.
  - Low-pass filter (~1500Hz cutoff).
  - Slight detune or chorus for warmth.
  - Low gain (~0.05–0.1).
  - Optional: mix a hint of filtered noise for "distortion" texture.
- Tune by ear during build.
- Audio is unlocked by the player's interaction during boot (clicking NEW IDENTITY / RECONNECT counts). No autoplay before first interaction.

---

## Placeholder trees for build/test

Author at least the following minimal trees so all mechanics are exercised:

1. **`tree:SE`** — canonical, on `k6v63rlw5n4m`. Should exercise: acceptance delay, online status, a `send` with `{message}` interpolation, multiple patterns including a catchall, capture group interpolation, and an idle loop with online/offline cycling.
2. **`tree:OC`** — canonical, on `ajjrpx34l3qv`. Minimal — maybe just accepts and sits in an idle loop saying nothing. (Real content TBD.)
3. **`tree:stranger1`** — quick paranoid response, goes offline, never comes back online. Idle loop terminates in `offline`-forever cycle.
4. **`tree:stranger2`** — exchanges a few lines, then triggers `status: deleted`. Exercises the DELETED terminal.
5. **`tree:stranger3`** — accepts but only ever sends `...` regardless of player input. Tests catchall + interpolation-free responses.
6. **`tree:characterA`** — placeholder accidental-discovery character. Empty idle tree is fine for build; just confirms the assignment mechanic works.

These can be JSON files in a `trees/` directory, loaded at startup.

---

## Out of scope for v1

- Real encryption / real networking.
- Account recovery, password protection.
- File transfer, group chats, voice.
- CRT visual effects (scanlines, glow, flicker).
- Custom web font.
- Per-conversation memory/flags beyond `currentNodeId`.
- In-app hints for discovering hidden IDs.
- Timestamps in chat log.
- Mobile haptics.
- Multi-language.

---

## Open items to revisit after v1 testing

- Whether character trees should reset to a different entry node on re-login vs. resume from persisted node.
- Exact assignment percentages (5/15/80) — may need tuning.
- Whether `pending` deserves to be its own status separate from `offline`.
- Sound design beyond the ping (boot sounds, KILL SESSION sound, error beep on invalid input).
- Whether to add a `tree:idle` shared library of common idle-loop fragments to reduce authoring repetition.
- Whether captures from earlier nodes should remain accessible in later nodes (currently: no, only the most recent match's captures are live).
