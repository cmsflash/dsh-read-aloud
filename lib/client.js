window.__ModuleLoader__.load({ id: "@dsh-external/dsh-read-aloud", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/FileSpeechAction.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/speakable.ts
var KINDS = /* @__PURE__ */ new Map([
  ["md", "markdown"],
  ["markdown", "markdown"],
  ["mdx", "markdown"],
  ["txt", "plain"],
  ["text", "plain"]
]);
function speakableKind(path) {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  const name = normalized.slice(normalized.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? void 0 : KINDS.get(name.slice(dot + 1));
}

// src/client/FileSpeechAction.module.css
var css = ".tool_skt9f7 {\n  display: inline-flex;\n  flex: none;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  height: 28px;\n  padding: 6px;\n  border: none;\n  border-radius: var(--dsw-radius-sm);\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  line-height: 1;\n  cursor: pointer;\n}\n\n.tool_skt9f7 svg {\n  width: 15px;\n  height: 15px;\n}\n\n@media (hover: hover) {\n  .tool_skt9f7:hover {\n    background: var(--dsw-alias-interactive-bg-hover);\n    color: var(--dsw-alias-label-primary);\n  }\n}\n\n.active_skt9f7 {\n  color: var(--dsw-alias-label-primary);\n}\n\n.loading_skt9f7 {\n  animation: file-speech-pulse 1.2s ease-in-out infinite;\n}\n\n.failed_skt9f7,\n.failed_skt9f7:hover {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n@keyframes file-speech-pulse {\n  0%, 100% { opacity: 1; }\n  50% { opacity: 0.45; }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .loading_skt9f7 {\n    animation: none;\n    opacity: 0.6;\n  }\n}\n";
var tagId = "@dsh-external/dsh-read-aloud/FileSpeechAction.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "@dsh-external/dsh-read-aloud";
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
var FileSpeechAction_default = { "tool": "tool_skt9f7", "active": "active_skt9f7", "loading": "loading_skt9f7", "failed": "failed_skt9f7" };

// src/client/FileSpeechAction.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var FILE_KEY_PREFIX = "file:";
function FileSpeechAction({ absolutePath, toggle, useSpeech, t }) {
  const key = `${FILE_KEY_PREFIX}${absolutePath}`;
  const status = useSpeech((view) => view.activeMessageId === key ? view.status : "idle");
  const truncated = useSpeech((view) => view.activeMessageId === key && view.truncated);
  const onClick = (0, import_react.useCallback)(() => {
    toggle(absolutePath);
  }, [absolutePath, toggle]);
  if (speakableKind(absolutePath) === void 0) return null;
  const label = status === "loading" ? t("action.loading") : status === "error" ? t("error.generic") : status === "playing" ? t(truncated ? "file.stopTruncated" : "action.stop") : t("file.play");
  const variant = status === "playing" ? FileSpeechAction_default.active : status === "loading" ? FileSpeechAction_default.loading : status === "error" ? FileSpeechAction_default.failed : void 0;
  const className = variant === void 0 ? FileSpeechAction_default.tool : `${FileSpeechAction_default.tool} ${variant}`;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label, side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      className,
      "aria-label": label,
      "aria-pressed": status === "playing",
      "data-read-aloud-file": status,
      onClick,
      children: status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconLoadingOutlineRegular, {}) : status === "playing" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconStopFillRegular, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPlayOutlineRegular, {})
    }
  ) });
}

// src/client/MessageSpeechAction.tsx
var import_react2 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/MessageSpeechAction.module.css
var css2 = '/* The read-aloud control mirrors the shared message IconActions chrome so the\n   strip reads as one row. */\n\n.action_9htqs8 {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  height: 28px;\n  padding: 6px;\n  border: none;\n  border-radius: 28px;\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  cursor: pointer;\n}\n\n.action_9htqs8:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* Active playback stays legible without hover, so the control still reads as\n   "this message is speaking" once the pointer leaves the row. */\n.active_9htqs8 {\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Synthesis of a long reply takes a moment; the pulse distinguishes waiting\n   from an unresponsive button without moving layout. */\n.loading_9htqs8 {\n  animation: speech-pulse 1.2s ease-in-out infinite;\n}\n\n.failed_9htqs8 {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n@keyframes speech-pulse {\n  0%, 100% { opacity: 1; }\n  50% { opacity: 0.45; }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .loading_9htqs8 {\n    animation: none;\n    opacity: 0.6;\n  }\n}\n';
var tagId2 = "@dsh-external/dsh-read-aloud/MessageSpeechAction.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId2) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "@dsh-external/dsh-read-aloud";
  tag.dataset.pluginCss = tagId2;
  tag.textContent = css2;
  document.head.appendChild(tag);
}
var MessageSpeechAction_default = { "action": "action_9htqs8", "active": "active_9htqs8", "loading": "loading_9htqs8", "failed": "failed_9htqs8" };

// src/client/MessageSpeechAction.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function MessageSpeechAction({ messageId, toggle, useSpeech, t }) {
  const status = useSpeech((view) => view.activeMessageId === messageId ? view.status : "idle");
  const onClick = (0, import_react2.useCallback)(() => {
    toggle(messageId);
  }, [messageId, toggle]);
  const label = status === "loading" ? t("action.loading") : status === "error" ? t("error.generic") : status === "playing" ? t("action.stop") : t("action.play");
  const variant = status === "playing" ? MessageSpeechAction_default.active : status === "loading" ? MessageSpeechAction_default.loading : status === "error" ? MessageSpeechAction_default.failed : void 0;
  const className = variant === void 0 ? MessageSpeechAction_default.action : `${MessageSpeechAction_default.action} ${variant}`;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label, side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "button",
    {
      type: "button",
      className,
      "aria-label": label,
      "aria-pressed": status === "playing",
      onClick,
      children: status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconLoadingOutlineRegular, {}) : status === "playing" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconStopFillRegular, {}) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPlayOutlineRegular, {})
    }
  ) });
}

// src/client/player.ts
function toObjectUrl(base64, mediaType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: mediaType }));
}
var IDLE = Object.freeze({ activeMessageId: void 0, status: "idle", truncated: false });
var SpeechPlayer = class {
  load;
  report;
  view = IDLE;
  listeners = /* @__PURE__ */ new Set();
  audio;
  objectUrl;
  /** Distinguishes the current reading from one superseded by a later request. */
  generation = 0;
  settle;
  resumeAt = /* @__PURE__ */ new Map();
  /**
   * @param load - fetches one part of a reading.
   * @param report - records a failure for the Host log.
   */
  constructor(load, report) {
    this.load = load;
    this.report = report;
  }
  /**
   * Subscribe to playback changes.
   * @param listener - called after every state change.
   * @returns the unsubscribe function.
   */
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /**
   * Read the current playback state.
   * @returns the snapshot, stable by reference until playback moves.
   */
  getSnapshot = () => this.view;
  /**
   * Start one reading, or stop it when it is already active. A multi-part
   * reading stopped midway starts again at the part it was playing.
   * @param key - the reading: a message id, or `file:<absolute path>`.
   * @returns once the reading ended, failed, or was superseded.
   */
  async toggle(key) {
    if (this.view.activeMessageId === key && this.view.status !== "error") {
      this.stop();
      return;
    }
    this.stop();
    const generation = ++this.generation;
    const element = new Audio();
    this.audio = element;
    this.publish({ activeMessageId: key, status: "loading", truncated: false });
    let index = this.resumeAt.get(key) ?? 0;
    let pending = this.load(key, index);
    for (; ; ) {
      let part;
      try {
        part = await pending;
      } catch (error) {
        if (generation === this.generation) {
          if (index > 0) this.resumeAt.set(key, index);
          this.fail(key, "request", String(error));
        }
        return;
      }
      if (generation !== this.generation) return;
      if (part === void 0) {
        this.resumeAt.delete(key);
        if (index === 0) this.fail(key, "request", "the host produced no audio for this reading");
        else this.stop();
        return;
      }
      const count = part.count ?? 1;
      this.releaseUrl();
      try {
        this.objectUrl = toObjectUrl(part.data, part.mediaType);
      } catch (error) {
        this.fail(key, "decode", String(error));
        return;
      }
      element.src = this.objectUrl;
      const outcome = new Promise((resolve) => {
        this.settle = resolve;
        element.onended = () => {
          resolve("ended");
        };
        element.onerror = () => {
          resolve("error");
        };
      });
      try {
        await Promise.resolve(element.play());
      } catch (error) {
        if (generation === this.generation) this.fail(key, "play", String(error));
        return;
      }
      if (generation !== this.generation) return;
      if (count > 1) this.resumeAt.set(key, index);
      this.publish({ activeMessageId: key, status: "playing", truncated: part.truncated === true });
      pending = index + 1 < count ? this.load(key, index + 1) : Promise.resolve(void 0);
      pending.catch(() => {
      });
      const result = await outcome;
      if (generation !== this.generation || result === "stopped") return;
      if (result === "error") {
        const error = element.error;
        this.fail(key, "play", error === null ? "media error" : `media error ${error.code}: ${error.message}`);
        return;
      }
      index += 1;
      if (index >= count) {
        this.resumeAt.delete(key);
        this.stop();
        return;
      }
    }
  }
  /**
   * Publish the error state and report why it happened.
   *
   * Every failing arm goes through here so the reader's generic tooltip and
   * the Host log can never disagree about whether playback failed.
   *
   * @param key - the reading that failed.
   * @param stage - which step failed.
   * @param reason - the failure text.
   */
  fail(key, stage, reason) {
    this.report(key, stage, reason);
    this.release();
    this.publish({ activeMessageId: key, status: "error", truncated: false });
  }
  /** Stop any active playback and release its resources. */
  stop() {
    this.release();
    this.publish(IDLE);
  }
  /** Release every resource; the player is unusable afterwards. */
  dispose() {
    this.stop();
    this.listeners.clear();
    this.resumeAt.clear();
  }
  release() {
    this.generation += 1;
    this.settle?.("stopped");
    this.settle = void 0;
    if (this.audio !== void 0) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio = void 0;
    }
    this.releaseUrl();
  }
  releaseUrl() {
    if (this.objectUrl === void 0) return;
    URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = void 0;
  }
  publish(view) {
    if (view.activeMessageId === this.view.activeMessageId && view.status === this.view.status && view.truncated === this.view.truncated) return;
    this.view = Object.freeze(view);
    for (const listener of this.listeners) listener();
  }
};

// src/client/locales.ts
var zh = {
  "action.play": "\u6717\u8BFB\u56DE\u7B54",
  "action.stop": "\u505C\u6B62\u6717\u8BFB",
  "action.loading": "\u6B63\u5728\u51C6\u5907\u8BED\u97F3\u2026",
  "error.generic": "\u8BED\u97F3\u64AD\u653E\u5931\u8D25",
  "file.play": "\u6717\u8BFB\u6587\u4EF6",
  "file.stopTruncated": "\u505C\u6B62\u6717\u8BFB\uFF08\u6587\u4EF6\u8F83\u957F\uFF0C\u4EC5\u6717\u8BFB\u5F00\u5934\u90E8\u5206\uFF09"
};
var en = {
  "action.play": "Read aloud",
  "action.stop": "Stop reading",
  "action.loading": "Preparing audio\u2026",
  "error.generic": "Could not play audio",
  "file.play": "Read file aloud",
  "file.stopTruncated": "Stop reading (long file: only the beginning is read)"
};

// src/client/index.ts
var NS = "speech";
var CHANNEL = "/dsh-read-aloud";
var inject = ["slots", "connection", "locale"];
function refusalOf(reply) {
  if (reply.ok !== true) return "the read-aloud channel rejected the request";
  const result = reply.value;
  if (result === void 0) return "the channel returned no result";
  if (result.ok === true) return "the host reported success but sent no audio";
  const code = result.code ?? "unknown";
  return result.detail === void 0 ? `host refused: ${code}` : `host refused: ${code}: ${result.detail}`;
}
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "read-aloud: dictionaries");
  const players = /* @__PURE__ */ new Map();
  const playerFor = (sessionId) => {
    let player = players.get(sessionId);
    if (player === void 0) {
      const report = (messageId, stage, reason) => {
        void Promise.resolve(
          ctx.connection.rpc.call(CHANNEL, "playback-failed", { sessionId, messageId, stage, reason })
        ).catch(() => {
        });
      };
      player = new SpeechPlayer(async (key, index) => {
        const file = key.startsWith(FILE_KEY_PREFIX);
        const reply = file ? await ctx.connection.rpc.call(CHANNEL, "file-audio", { sessionId, path: key.slice(FILE_KEY_PREFIX.length), index }) : await ctx.connection.rpc.call(CHANNEL, "audio", { sessionId, messageId: key });
        if (file && reply.ok === true && reply.value?.ok === false && reply.value.code === "segment-out-of-range") {
          return void 0;
        }
        if (reply.ok !== true || reply.value?.ok !== true || reply.value.value === void 0) {
          throw new Error(refusalOf(reply));
        }
        const { data, mediaType, count, truncated } = reply.value.value;
        return {
          data,
          mediaType,
          ...count === void 0 ? {} : { count },
          ...truncated === void 0 ? {} : { truncated }
        };
      }, report);
      players.set(sessionId, player);
    }
    return player;
  };
  ctx.on("connection/reset", () => {
    for (const player of players.values()) player.stop();
  });
  const toggle = (sessionId, key) => {
    const player = playerFor(sessionId);
    for (const other of players.values()) {
      if (other !== player) other.stop();
    }
    void player.toggle(key);
  };
  ctx.effect(() => () => {
    for (const player of players.values()) player.dispose();
    players.clear();
  }, "read-aloud: players");
  ctx.slots.inject("conversation.chat.assistant-actions", () => ctx.slots.register({
    name: "conversation.chat.assistant-actions",
    id: "speech",
    order: 20,
    locale: NS,
    inject: (sessionId) => ({
      hooks: { speech: playerFor(sessionId) },
      toggle: (messageId) => {
        toggle(sessionId, messageId);
      }
    })
  }, MessageSpeechAction));
  ctx.slots.inject("sidebar.right.tab.document.actions", () => ctx.slots.register({
    name: "sidebar.right.tab.document.actions",
    id: "speech",
    order: -10,
    locale: NS,
    inject: (sessionId) => ({
      hooks: { speech: playerFor(sessionId) },
      toggle: (absolutePath) => {
        toggle(sessionId, `${FILE_KEY_PREFIX}${absolutePath}`);
      }
    })
  }, FileSpeechAction));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
