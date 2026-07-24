# `/play` — start a game from a URL

> **Status: beta.** This endpoint and its parameter format are still in beta
> and may change without notice. Do not rely on long-lived saved links yet.

`GET /play` starts a game immediately using options passed as query
parameters. It is a client-side route of the single-page app (the server
serves `index.html`; the app parses the query on load).

The New game and Custom game dialogs display the `/play` URL for the options
currently selected, so you can copy a link that reproduces them.

```
https://<host>/play?cho=left&han=inner&first=cho&mode=ai-cho&time=1000&rules=janggi&komi=han&komiPoints=1.5&orient=cho
```

Every parameter is optional. Opening `/play` with no parameters starts a
default game (both sides Inner Elephants, Cho first, vs AI as Cho, 1s,
tournament rules, Han komi 1.5).

## Parameters

| Param | Values | Default | Meaning |
|---|---|---|---|
| `cho` | `inner` \| `left` \| `right` \| `outer` | `inner` | Cho's opening setup (horse/elephant arrangement) |
| `han` | `inner` \| `left` \| `right` \| `outer` | `inner` | Han's opening setup, from Han's own seat |
| `first` | `cho` \| `han` | `cho` | Side that moves first |
| `mode` | `ai-cho` \| `ai-han` \| `manual` | `ai-cho` | vs AI (you play Cho / Han) or two-player local |
| `time` | integer `100`–`10000` | `1000` | AI thinking time in milliseconds |
| `rules` | `janggi` \| `janggitraditional` \| `janggimodern` \| `janggicasual` | `janggi` | Rule set (tournament / traditional / modern / casual) |
| `komi` | `han` \| `cho` \| `none` | `han` | Which side receives the komi (deom) |
| `komiPoints` | number `0`–`72` | `1.5` | Komi points |
| `orient` | `cho` \| `han` | my side (AI games) / `cho` | Which side sits at the bottom of the board |
| `fen` | URL-encoded janggi FEN | — | Custom start position; **overrides `cho`/`han`/`first`** (see below) |

Setup names: `inner` = Inner Elephants (마상상마), `left` = Left Elephant
(상마상마), `right` = Right Elephant (마상마상), `outer` = Outer Elephants
(상마마상).

## `fen` details

- Accepts a full FEN (`... w - - 0 1`) or just the board part (10 ranks
  separated by `/`); with a board-only FEN the side to move is taken from
  `first`.
- URL-encode it: spaces → `%20`, `/` may stay literal in a query string.

Example — bare kings plus one pawn each, two-player, no komi:

```
/play?mode=manual&komi=none&fen=4k4/9/9/4p4/9/9/4P4/9/9/4K4
```

## Validation

Parameters are validated before use; anything invalid falls back to its
default and the game still starts, with a `[/play]` warning logged to the
browser console for each problem.

| Check | Rule |
|---|---|
| Enum params | must match the listed values exactly |
| `time` | integer, `100 ≤ time ≤ 10000` |
| `komiPoints` | finite number, `0 ≤ n ≤ 72` |
| `fen` length | `19 ≤ length ≤ 120` characters (19 = minimal 10-rank board) |
| `fen` legality | must pass the Fairy-Stockfish FEN validator for the chosen `rules` |
| `fen` constraints | per-side piece limits (K1 A2 R2 C2 H2 E2 P5) and king/advisor confined to their own palace |

An invalid `fen` is ignored entirely (the game starts from the `cho`/`han`
setups instead).

## Behavior notes

- The link is **consumed once**: after the game starts, the URL is rewritten
  to `/`, so reloading the page resumes the auto-saved game rather than
  restarting from the link.
- `/play` always starts a **new** game — it takes precedence over (and
  overwrites the auto-save of) any unfinished saved game.
- Options given here do not change the saved preferences used by the
  New game / Custom game dialogs.

## Examples

| Goal | URL |
|---|---|
| Play Han vs AI, deep thinking | `/play?mode=ai-han&time=3000` |
| Gwima (left) vs Inner, Han first | `/play?cho=left&han=inner&first=han` |
| Two-player, casual rules, no komi | `/play?mode=manual&rules=janggicasual&komi=none` |
| Custom komi: Cho receives 3 | `/play?komi=cho&komiPoints=3` |
| Custom position, Han at bottom | `/play?fen=4k4/9/9/4p4/9/9/4P4/9/9/4K4&mode=manual&orient=han` |
