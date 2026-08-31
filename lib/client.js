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

// src/client/MessageSpeechAction.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/MessageSpeechAction.module.css
var css = '/* The read-aloud control mirrors the shared message IconActions chrome so the\n   strip reads as one row. */\n\n.action_9htqs8 {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  height: 28px;\n  padding: 6px;\n  border: none;\n  border-radius: 28px;\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  cursor: pointer;\n}\n\n.action_9htqs8:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* Active playback stays legible without hover, so the control still reads as\n   "this message is speaking" once the pointer leaves the row. */\n.active_9htqs8 {\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Synthesis of a long reply takes a moment; the pulse distinguishes waiting\n   from an unresponsive button without moving layout. */\n.loading_9htqs8 {\n  animation: speech-pulse 1.2s ease-in-out infinite;\n}\n\n.failed_9htqs8 {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n@keyframes speech-pulse {\n  0%, 100% { opacity: 1; }\n  50% { opacity: 0.45; }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .loading_9htqs8 {\n    animation: none;\n    opacity: 0.6;\n  }\n}\n';
var tagId = "@dsh-external/dsh-read-aloud/MessageSpeechAction.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "@dsh-external/dsh-read-aloud";
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
var MessageSpeechAction_default = { "action": "action_9htqs8", "active": "active_9htqs8", "loading": "loading_9htqs8", "failed": "failed_9htqs8" };

// src/client/MessageSpeechAction.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function MessageSpeechAction({ messageId, toggle, useSpeech, t }) {
  const status = useSpeech((view) => view.activeMessageId === messageId ? view.status : "idle");
  const onClick = (0, import_react.useCallback)(() => {
    toggle(messageId);
  }, [messageId, toggle]);
  const label = status === "loading" ? t("action.loading") : status === "error" ? t("error.generic") : status === "playing" ? t("action.stop") : t("action.play");
  const variant = status === "playing" ? MessageSpeechAction_default.active : status === "loading" ? MessageSpeechAction_default.loading : status === "error" ? MessageSpeechAction_default.failed : void 0;
  const className = variant === void 0 ? MessageSpeechAction_default.action : `${MessageSpeechAction_default.action} ${variant}`;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label, side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      className,
      "aria-label": label,
      "aria-pressed": status === "playing",
      onClick,
      children: status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconLoadingOutline16, {}) : status === "playing" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconStopFill16, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPlayOutline16, {})
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
var IDLE = Object.freeze({ activeMessageId: void 0, status: "idle" });
var SpeechPlayer = class {
  constructor(load) {
    this.load = load;
  }
  view = IDLE;
  listeners = /* @__PURE__ */ new Set();
  audio;
  objectUrl;
  /** Distinguishes a settled load from one superseded by a later request. */
  generation = 0;
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
   * Start reading one message aloud, or stop it when it is already active.
   * @param messageId - the message to read.
   */
  async toggle(messageId) {
    if (this.view.activeMessageId === messageId && this.view.status !== "error") {
      this.stop();
      return;
    }
    this.stop();
    const generation = ++this.generation;
    this.publish({ activeMessageId: messageId, status: "loading" });
    const audio = await this.load(messageId).catch(() => void 0);
    if (generation !== this.generation) return;
    if (audio === void 0) {
      this.publish({ activeMessageId: messageId, status: "error" });
      return;
    }
    this.objectUrl = toObjectUrl(audio.data, audio.mediaType);
    const element = new Audio(this.objectUrl);
    this.audio = element;
    element.addEventListener("ended", () => {
      if (generation === this.generation) this.stop();
    });
    element.addEventListener("error", () => {
      if (generation === this.generation) this.publish({ activeMessageId: messageId, status: "error" });
    });
    await Promise.resolve(element.play()).then(
      () => {
        if (generation === this.generation) this.publish({ activeMessageId: messageId, status: "playing" });
      },
      () => {
        if (generation === this.generation) this.publish({ activeMessageId: messageId, status: "error" });
      }
    );
  }
  /** Stop any active playback and release its resources. */
  stop() {
    this.generation += 1;
    this.audio?.pause();
    this.audio = void 0;
    if (this.objectUrl !== void 0) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = void 0;
    }
    this.publish(IDLE);
  }
  /** Release every resource; the player is unusable afterwards. */
  dispose() {
    this.stop();
    this.listeners.clear();
  }
  publish(view) {
    if (view.activeMessageId === this.view.activeMessageId && view.status === this.view.status) return;
    this.view = Object.freeze(view);
    for (const listener of this.listeners) listener();
  }
};

// src/client/locales.ts
var zh = {
  "action.play": "\u6717\u8BFB\u56DE\u7B54",
  "action.stop": "\u505C\u6B62\u6717\u8BFB",
  "action.loading": "\u6B63\u5728\u51C6\u5907\u8BED\u97F3\u2026",
  "error.generic": "\u8BED\u97F3\u64AD\u653E\u5931\u8D25"
};
var en = {
  "action.play": "Read aloud",
  "action.stop": "Stop reading",
  "action.loading": "Preparing audio\u2026",
  "error.generic": "Could not play audio"
};

// src/client/index.ts
var NS = "speech";
var CHANNEL = "/dsh-read-aloud";
var inject = ["slots", "connection", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "read-aloud: dictionaries");
  const players = /* @__PURE__ */ new Map();
  const playerFor = (sessionId) => {
    let player = players.get(sessionId);
    if (player === void 0) {
      player = new SpeechPlayer(async (messageId) => {
        const reply = await ctx.connection.rpc.call(CHANNEL, "audio", { sessionId, messageId });
        if (reply.ok !== true || reply.value?.ok !== true || reply.value.value === void 0) return void 0;
        return { data: reply.value.value.data, mediaType: reply.value.value.mediaType };
      });
      players.set(sessionId, player);
    }
    return player;
  };
  ctx.on("connection/reset", () => {
    for (const player of players.values()) player.stop();
  });
  ctx.slots.inject("conversation.chat.assistant-actions", () => {
    const dispose = ctx.slots.register({
      name: "conversation.chat.assistant-actions",
      id: "speech",
      order: 20,
      locale: NS,
      inject: (sessionId) => {
        const player = playerFor(sessionId);
        return {
          hooks: { speech: player },
          toggle: (messageId) => {
            void player.toggle(messageId);
          }
        };
      }
    }, MessageSpeechAction);
    return () => {
      dispose();
      for (const player of players.values()) player.dispose();
      players.clear();
    };
  });
}
return module.exports; } });
//# sourceMappingURL=client.js.map
