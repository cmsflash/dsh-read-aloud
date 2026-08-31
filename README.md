# @dsh-external/dsh-read-aloud

Read-aloud of assistant replies for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): each completed turn's closing prose is synthesized, cached, and played from a button in the assistant-message action strip.

## Install

```sh
dsh plugin --profile web add @dsh-external/dsh-read-aloud
```

Restart the profile afterwards; host plugins mount at boot.

## What it mounts

One bundle row, four Cordis roles:

| Role | Owns | Responsibility |
|---|---|---|
| `TtsRuntime` | `ctx.tts` | provider registry, selection, and the resolve-then-synthesize policy |
| `OpenAiTtsProvider` | registers into `ctx.tts` | one synthesis route per configured entry |
| `ReadAloudService` | `ctx.readAloud` | the `turn/end` trigger, the audio cache, and the RPC channel |
| browser half | — | the play/stop control |

They ship together because they change together: a voice or model change touches the seam, the route, and the control at once.

## Config

| Field | Semantics |
|---|---|
| `model` | Provider-routed model identifier, for example `minimax/speech-2.6-hd`. |
| `voice` | Required. An OpenAI-shaped `/audio/speech` route rejects a request carrying no voice, and answers it with an opaque 500 rather than a 4xx. |
| `bitrate` | Requested mp3 bitrate. Advisory: MiniMax honors it, OpenAI's own models ignore it and return 128 kbps regardless. |
| `maxChars` | Maximum characters per request; longer text is truncated rather than split, because a partial reading is a better failure than an unbounded bill. |
| `provider` | Explicit route id. Omitted = auto-select when exactly one route is usable. |
| `providers` | Map of route id to `{ apiKey, apiKeyEnv, baseURL, baseURLEnv, timeoutMs }`. |
| `ttlDays` | Days a synthesized artifact is served before it is swept. |
| `synthesizeOnTurnEnd` | Synthesize every completed turn as it ends. `false` defers synthesis to first playback, trading latency for spend on turns nobody plays. |

`model`, `voice`, and `provider` move together: a `minimax/*` model resolves only through a gateway route, so pinning the provider is correctness rather than tie-breaking.

## Cost

Always-on synthesis bills every completed turn whether or not anyone presses play. Vendors bill by input characters, so `bitrate` is a storage lever and not a spend lever. Set `synthesizeOnTurnEnd: false` to pay only for what is played.

## Storage

Audio is a regenerable cache under `$DSH_HOME/cache/read-aloud/`, keyed by `messageId` and swept by age at startup. Nothing is appended to the Session log, so the Session format and replay are untouched and a cache miss simply synthesizes again.

## Transport

The browser sends message identity, never prose: the Host resolves spoken text from its own Session log. Audio crosses a loopback-only `/dsh-read-aloud` RPC channel with hand-written payload validation, because an external plugin cannot contribute to the Harness's generated Remote assembly.

## Known limitations

- **`bitrate` is not portable.** It reaches the vendor through `extra_body`; only vendors that read a bitrate field honor it.
- **Voice and model identifiers are unvalidated and vendor-specific.** A voice valid on one route may be rejected by another, and the failure surfaces only at synthesis.
- **No usage passthrough.** The OpenAI-shaped reply is audio bytes with no usage envelope, so billed characters and duration are unavailable even when the vendor tracks them.
- **Unattended synthesis failures are silent.** The `turn/end` job discards its error; a broken route shows up as a play button that does nothing.

## Development

```sh
pnpm install
pnpm run check    # typecheck + build
```

The build keeps every `@deepseek-ai/*` import external: the running Harness supplies them, and bundling a second copy would fork the Cordis service registry. Compile-time resolution needs `@deepseek-ai/cordis` and `@deepseek-ai/schemastery` linked into `node_modules` from a Harness checkout.
