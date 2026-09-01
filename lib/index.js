// src/index.ts
import z2 from "@deepseek-ai/schemastery";

// src/tts.ts
import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";

// src/tts-types.ts
var SpeechError = class extends Error {
  /**
   * @param message - human-readable description.
   * @param code - the stable failure code.
   */
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "SpeechError";
  }
};

// src/tts.ts
var TtsRuntime = class extends Service {
  static Config = z.object({
    model: z.string().required(),
    bitrate: z.number().step(1).min(1).required(),
    maxChars: z.number().step(1).min(1).required(),
    provider: z.string(),
    voice: z.string().required()
  });
  providers = /* @__PURE__ */ new Map();
  config;
  constructor(ctx, config) {
    super(ctx, "tts");
    this.config = config;
  }
  /**
   * Register a synthesis provider.
   * @param provider - the provider; its `id` is the registry key.
   * @returns the disposer that unregisters the provider.
   * @throws {@link SpeechError} `SPEECH_DUPLICATE_PROVIDER` when the id is taken.
   */
  registerProvider(provider) {
    if (this.providers.has(provider.id)) {
      throw new SpeechError(
        `a speech provider with id "${provider.id}" is already registered`,
        "SPEECH_DUPLICATE_PROVIDER"
      );
    }
    const providers = this.providers;
    const dispose = this.ctx.effect(function* () {
      providers.set(provider.id, provider);
      yield () => providers.delete(provider.id);
    }, "speech.registerProvider()");
    return () => void dispose();
  }
  /**
   * Apply deployment policy to one request. This is the only place defaults are
   * filled, so a provider always receives a complete spec.
   * @param request - the caller's text and optional voice.
   * @returns the resolved spec, with `truncated` set when text exceeded `maxChars`.
   * @throws {@link SpeechError} `SPEECH_EMPTY_TEXT` when the text is blank.
   */
  resolve(request) {
    const text = request.text.trim();
    if (text.length === 0) {
      throw new SpeechError("speech synthesis requires non-blank text", "SPEECH_EMPTY_TEXT");
    }
    const truncated = text.length > this.config.maxChars;
    return {
      text: truncated ? text.slice(0, this.config.maxChars) : text,
      model: this.config.model,
      bitrate: this.config.bitrate,
      voice: request.voice ?? this.config.voice,
      truncated
    };
  }
  /**
   * Resolve one request and synthesize it through the selected provider.
   *
   * Policy and selection failures surface as rejections rather than synchronous
   * throws, so one `catch` covers every way synthesis can fail.
   *
   * @param request - the caller's text and optional voice.
   * @param signal - optional cancellation forwarded to the provider.
   * @returns the encoded audio and any usage the backend reported.
   * @throws {@link SpeechError} when no provider can run or the backend fails.
   */
  async synthesize(request, signal) {
    const spec = this.resolve(request);
    return this.selectProvider().synthesize(spec, signal);
  }
  /** Resolve the selected provider or throw the matching {@link SpeechError}. */
  selectProvider() {
    const configuredId = this.config.provider;
    if (configuredId !== void 0) {
      const provider = this.providers.get(configuredId);
      if (provider === void 0) {
        throw new SpeechError(
          `configured speech provider "${configuredId}" is not registered`,
          "SPEECH_PROVIDER_CONFIGURED_MISSING"
        );
      }
      if (!provider.available()) {
        throw new SpeechError(
          `configured speech provider "${configuredId}" is registered but unavailable`,
          "SPEECH_PROVIDER_CONFIGURED_UNAVAILABLE"
        );
      }
      return provider;
    }
    const usable = [...this.providers.values()].filter((provider) => provider.available());
    const [single] = usable;
    if (single === void 0) {
      throw new SpeechError("no usable speech provider is registered", "SPEECH_PROVIDER_UNAVAILABLE");
    }
    if (usable.length > 1) {
      const ids = usable.map((provider) => provider.id).join(", ");
      throw new SpeechError(
        `multiple usable speech providers are registered (${ids}); configure one explicitly`,
        "SPEECH_PROVIDER_AMBIGUOUS"
      );
    }
    return single;
  }
};

// src/provider.ts
var USER_AGENT = "deepseek-harness";
var OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
var OpenAiTtsProvider = class {
  constructor(options) {
    this.options = options;
    this.id = options.id;
  }
  id;
  /**
   * Whether a route credential is present.
   * @returns true when the route holds a non-empty API key.
   */
  available() {
    return this.options.apiKey.length > 0;
  }
  /**
   * Synthesize one resolved spec through this route.
   * @param spec - the seam-resolved request.
   * @param signal - optional cancellation forwarded to the route.
   * @returns the encoded audio; usage fields stay absent because the
   *   OpenAI-shaped response body carries audio bytes and no usage envelope.
   * @throws {@link SpeechError} `SPEECH_REQUEST_FAILED` on a non-2xx reply,
   *   an empty body, or a transport failure.
   */
  async synthesize(spec, signal) {
    const url = `${this.options.baseURL.replace(/\/+$/, "")}/audio/speech`;
    const timeout = AbortSignal.timeout(this.options.timeoutMs);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
        "user-agent": USER_AGENT
      },
      // `voice` is required by this route: OpenAI and a gateway alike answer a
      // request without it with an opaque 500 rather than a 4xx.
      body: JSON.stringify({
        model: spec.model,
        input: spec.text,
        voice: spec.voice,
        response_format: "mp3",
        extra_body: { bitrate: spec.bitrate }
      }),
      signal: signal === void 0 ? timeout : AbortSignal.any([signal, timeout])
    }).catch((cause) => {
      throw new SpeechError(`speech route request failed: ${String(cause)}`, "SPEECH_REQUEST_FAILED");
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new SpeechError(
        `speech route returned ${response.status}${detail.length > 0 ? `: ${detail}` : ""}`,
        "SPEECH_REQUEST_FAILED"
      );
    }
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength === 0) {
      throw new SpeechError("speech route returned an empty audio body", "SPEECH_REQUEST_FAILED");
    }
    return { data, mediaType: "audio/mpeg" };
  }
};

// src/service.ts
import { Buffer } from "node:buffer";
import { homedir } from "node:os";
import { join as join2 } from "node:path";
import { Service as Service2 } from "@deepseek-ai/cordis";

// src/store.ts
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
var EXTENSION = ".mp3";
var ReadAloudStore = class {
  constructor(directory, ttlMs) {
    this.directory = directory;
    this.ttlMs = ttlMs;
  }
  /** Resolve one message id to its artifact path. */
  pathFor(messageId) {
    return join(this.directory, `${encodeURIComponent(messageId)}${EXTENSION}`);
  }
  /**
   * Read one cached artifact.
   * @param messageId - the message whose audio is wanted.
   * @returns the audio, or `undefined` on a miss or an expired entry.
   */
  async read(messageId) {
    const path = this.pathFor(messageId);
    const stats = await stat(path).catch(() => void 0);
    if (stats === void 0) return void 0;
    if (Date.now() - stats.mtimeMs > this.ttlMs) return void 0;
    const data = await readFile(path).catch(() => void 0);
    return data === void 0 ? void 0 : { data: new Uint8Array(data), mediaType: "audio/mpeg" };
  }
  /**
   * Publish one artifact atomically, so a concurrent read never observes a
   * partially written file.
   * @param messageId - the message the audio belongs to.
   * @param data - encoded audio bytes.
   */
  async write(messageId, data) {
    await mkdir(this.directory, { recursive: true, mode: 448 });
    const staging = join(this.directory, `.${randomUUID()}.tmp`);
    await writeFile(staging, data, { mode: 384 });
    await rename(staging, this.pathFor(messageId)).catch(async (cause) => {
      await unlink(staging).catch(() => {
      });
      throw cause;
    });
  }
  /**
   * Delete every artifact older than the retention window.
   * @returns the number of files removed.
   */
  async sweep() {
    const entries = await readdir(this.directory).catch(() => void 0);
    if (entries === void 0) return 0;
    const cutoff = Date.now() - this.ttlMs;
    let removed = 0;
    for (const entry of entries) {
      if (!entry.endsWith(EXTENSION)) continue;
      const path = join(this.directory, entry);
      const stats = await stat(path).catch(() => void 0);
      if (stats === void 0 || stats.mtimeMs >= cutoff) continue;
      const gone = await unlink(path).then(() => true).catch(() => false);
      if (gone) removed += 1;
    }
    return removed;
  }
};

// src/text.ts
function spokenText(content) {
  return content.filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
}
function closingMessageOf(events, turn) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === void 0 || event.type !== "assistant/message") continue;
    if (event.data.turn !== turn) continue;
    const message = event.data.message;
    const text = spokenText(message.content).trim();
    return text.length === 0 ? void 0 : { messageId: message.id, text };
  }
  return void 0;
}
function spokenTextOf(events, messageId) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === void 0 || event.type !== "assistant/message") continue;
    if (event.data.message.id !== messageId) continue;
    const closing = closingMessageOf(events, event.data.turn);
    return closing?.messageId === messageId ? closing.text : void 0;
  }
  return void 0;
}

// src/service.ts
var DAY_MS = 864e5;
var ReadAloudService = class extends Service2 {
  static inject = ["sessions", "tts"];
  store;
  synthesizeOnTurnEnd;
  /** In-flight synthesis per message, so a turn-end job and a play request share one call. */
  inFlight = /* @__PURE__ */ new Map();
  /**
   * @param ctx - Host context carrying the Session store and the tts seam.
   * @param config - Required retention and trigger policy.
   */
  constructor(ctx, config) {
    super(ctx, "readAloud");
    const home = process.env.DSH_HOME ?? join2(homedir(), ".dsh");
    this.store = new ReadAloudStore(join2(home, "cache", "read-aloud"), config.ttlDays * DAY_MS);
    this.synthesizeOnTurnEnd = config.synthesizeOnTurnEnd;
  }
  /** Sweep expired artifacts once at startup, then follow completed turns. */
  [Service2.init]() {
    void this.store.sweep();
    if (!this.synthesizeOnTurnEnd) return;
    this.ctx.on("session/event", (session, event) => {
      if (event.type !== "turn/end") return;
      if (event.data.reason.kind !== "completed") return;
      if (session.header.origin === "subagent") return;
      const closing = closingMessageOf(session.events, event.data.turn);
      if (closing === void 0) return;
      void this.ensureAudio(closing.messageId, closing.text);
    });
  }
  /**
   * Read one message's audio, synthesizing it when the cache does not hold it.
   * @param request - the Session and message to read aloud.
   * @returns base64 audio, or an explicit failure.
   */
  async audio(request) {
    const cached = await this.store.read(request.messageId);
    if (cached !== void 0) return success(cached.data, false);
    const session = this.ctx.sessions.get(request.sessionId);
    if (session === void 0) return { ok: false, code: "session-not-found" };
    const text = spokenTextOf(session.events, request.messageId);
    if (text === void 0) return { ok: false, code: "message-not-found" };
    try {
      return success(await this.ensureAudio(request.messageId, text), true);
    } catch (error) {
      return { ok: false, code: "synthesis-failed", detail: String(error) };
    }
  }
  /**
   * Synthesize and cache one message's audio, joining any in-flight call for
   * the same message so a turn-end job and a playback request never bill twice.
   * @param messageId - the message the audio belongs to.
   * @param text - the prose to speak.
   * @returns the synthesized audio bytes.
   */
  ensureAudio(messageId, text) {
    const existing = this.inFlight.get(messageId);
    if (existing !== void 0) return existing;
    const pending = this.synthesizeAndStore(messageId, text).finally(() => this.inFlight.delete(messageId));
    this.inFlight.set(messageId, pending);
    return pending;
  }
  async synthesizeAndStore(messageId, text) {
    const audio = await this.ctx.tts.synthesize({ text });
    await this.store.write(messageId, audio.data);
    return audio.data;
  }
};
function success(data, regenerated) {
  return {
    ok: true,
    value: { data: Buffer.from(data).toString("base64"), mediaType: "audio/mpeg", regenerated }
  };
}

// src/rpc.ts
var CHANNEL = "/dsh-read-aloud";
function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}
function id(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}
function registerReadAloudRpc(ctx, service) {
  return ctx.connection.rpc.handle(CHANNEL, async (endpoint, rawPayload, signal) => {
    if (signal.aborted) throw new Error("The request was cancelled.");
    const payload = record(rawPayload, "payload");
    switch (endpoint) {
      case "audio": {
        const result = await service.audio({
          sessionId: id(payload.sessionId, "sessionId"),
          messageId: id(payload.messageId, "messageId")
        });
        return { ok: true, value: result };
      }
      default:
        throw new Error(`unknown read-aloud endpoint: ${endpoint}`);
    }
  }, { authority: "loopback" });
}

// src/index.ts
var name = "read-aloud";
var inject = ["sessions", "connection"];
var Config = z2.object({
  model: z2.string().required(),
  voice: z2.string().required(),
  bitrate: z2.number().step(1).min(1).required(),
  maxChars: z2.number().step(1).min(1).required(),
  provider: z2.string(),
  providers: z2.dict(z2.object({
    apiKeyEnv: z2.string(),
    apiKey: z2.string(),
    baseURL: z2.string(),
    baseURLEnv: z2.string(),
    timeoutMs: z2.number().step(1).min(1)
  })).required(),
  ttlDays: z2.number().step(1).min(1).required(),
  synthesizeOnTurnEnd: z2.boolean().required()
});
var DEFAULT_TIMEOUT_MS = 12e4;
function apply(ctx, config) {
  ctx.plugin(TtsRuntime, {
    model: config.model,
    voice: config.voice,
    bitrate: config.bitrate,
    maxChars: config.maxChars,
    ...config.provider === void 0 ? {} : { provider: config.provider }
  });
  ctx.inject(["tts"], async (tts) => {
    const credentials = tts.get("credentials");
    const secret = async (ref) => {
      if (ref === void 0) return void 0;
      const stored = credentials === void 0 ? void 0 : (await credentials.resolve(ref))?.value;
      return stored ?? process.env[ref];
    };
    for (const [id2, route] of Object.entries(config.providers)) {
      tts.tts.registerProvider(new OpenAiTtsProvider({
        id: id2,
        apiKey: route.apiKey ?? await secret(route.apiKeyEnv) ?? "",
        baseURL: route.baseURL ?? await secret(route.baseURLEnv) ?? OPENAI_DEFAULT_BASE_URL,
        timeoutMs: route.timeoutMs ?? DEFAULT_TIMEOUT_MS
      }));
    }
  });
  ctx.plugin(ReadAloudService, {
    ttlDays: config.ttlDays,
    synthesizeOnTurnEnd: config.synthesizeOnTurnEnd
  });
  ctx.inject(["readAloud", "connection"], (scoped) => {
    scoped.effect(() => {
      const dispose = registerReadAloudRpc(scoped, scoped.readAloud);
      return () => void dispose();
    }, "read-aloud: rpc channel");
  });
}
export {
  CHANNEL,
  Config,
  OPENAI_DEFAULT_BASE_URL,
  OpenAiTtsProvider,
  ReadAloudService,
  TtsRuntime,
  apply,
  inject,
  name
};
