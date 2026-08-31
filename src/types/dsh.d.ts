/** Minimal compile-time declarations for DSH packages supplied by the Host at runtime. */

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '@deepseek-ai/cordis' {
  export interface Context {
    readonly sessions: any
    readonly connection: any
    readonly logger: { warn(message: string): void }
    /**
     * Registers a teardown-bound effect. The factory returns a disposer, a
     * generator yielding disposers, or nothing; the returned disposer settles
     * once teardown completes.
     */
    effect(factory: () => unknown, label?: string): () => Promise<void>
    on(name: string, listener: (...args: any[]) => any): () => void
    get(name: string): unknown
    plugin(plugin: any, config?: any): any
    inject(names: readonly string[], callback: (ctx: Context) => void): void
  }

  /** The Host supplies `Context` as a class, so it is importable as a value. */
  export class Context {}

  /** Base class for services that expose a named API on `ctx`. */
  export abstract class Service<T = never> {
    /** Symbol key of an instance method run after construction. */
    static readonly init: unique symbol
    /** Symbol key of the availability predicate passed to `ctx.provide()`. */
    static readonly check: unique symbol
    /** The context this instance is registered in. */
    protected ctx: Context
    /** The service name this instance is registered under. */
    name: string
    /**
     * @param ctx - the context to register in.
     * @param name - the service name.
     */
    constructor(ctx: Context, name: string)
  }
}

declare module '@deepseek-ai/schemastery' {
  /**
   * A schema over `T`. The validator members are not modeled: schemastery
   * builds them through a runtime-extended method table that no hand-written
   * restatement can track, so only the type parameter is load-bearing here.
   */
  interface Schema<T = any> {
    (data?: any): T
  }
  const Schema: any
  export default Schema
}

declare module '@deepseek-ai/dsh-llm/brand' {
  /** Stable identity of one message; an opaque string across every boundary carrying it. */
  export type MessageId = string
}

declare module '@deepseek-ai/dsh-session/types' {
  /** Stable identity of one session; an opaque string across every boundary carrying it. */
  export type SessionId = string
  /**
   * One appended session-log record. `data` stays `any`: its member type is
   * selected by `type` through a merge-extensible map the Host owns, and a
   * standalone restatement of that map cannot stay correct.
   */
  export interface SessionEvent {
    readonly type: string
    readonly seq: number
    readonly time: number
    readonly data: any
  }
}

declare module '@deepseek-ai/dsh-client-connection/client' {
  /** Stable identity of one message, as the browser half receives it. */
  export type MessageId = string
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  /** Minimal observable API for host-provided standard-kit data sources. */
  export interface HostObservable<T> {
    getSnapshot(): T
    subscribe(fn: () => void): () => void
  }

  /**
   * Declared locale namespaces, keyed by namespace name to that namespace's
   * dictionary key union. Each owning package merges its own seat.
   */
  export interface LocaleNamespaceMap {}

  /**
   * Declared slots, keyed by slot name; `owner` is the props share the render
   * site passes. Each declaring package merges its own entry.
   */
  export interface SlotMap {
    /**
     * Action strip attached to one finalized assistant message, rendered
     * inside that message's IconActions row. Declared and typed by
     * ui-conversation; the render site passes the addressed message identity.
     */
    'conversation.chat.assistant-actions': { owner: { messageId: string } }
  }

  /** Owner props of one declared slot. */
  type OwnerOf<K extends keyof SlotMap> = SlotMap[K] extends { owner: infer O } ? O : object

  /**
   * Runtime props share for a slot key: the owner share plus the session
   * standard kit. Every slot this package occupies is session-scoped.
   */
  export type PropsRuntime<K extends keyof SlotMap & string> = OwnerOf<K> & { sessionId: string }

  /** Locale share: the framework-injected `t` seat of a declared namespace. */
  export type PropsLocale<N> = N extends keyof LocaleNamespaceMap & string
    ? { t: (key: LocaleNamespaceMap[N] & string, params?: Record<string, unknown>) => string }
    : object

  /** Selector hook bound from one observable source. */
  type SnapshotSelectorHook<T> = <Selected>(selector: (value: T) => Selected) => Selected

  /** Selector-hook share synthesized from an entry's hooks compartment. */
  type PropsHooks<HS extends object> = {
    [N in keyof HS & string as `use${Capitalize<N>}`]:
    SnapshotSelectorHook<HS[N] extends HostObservable<infer T> ? T : never>
  }

  /**
   * The component-side view of an inject face: the reserved `hooks`
   * compartment arrives as bound `use<Name>` selector hooks; every other
   * member passes through verbatim.
   */
  export type InjectFace<I extends object> =
    I extends { hooks: infer HS extends object } ? Omit<I, 'hooks'> & PropsHooks<HS> : I
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  /** Owner props of the per-message action strip. */
  export interface AssistantActionOwnerProps {
    /** Stable identity carried from the `assistant/message` event. */
    messageId: string
  }
}

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactElement, ReactNode } from 'react'

  /** Sizing and class props common to every primitive icon. */
  export interface IconProps {
    size?: number
    className?: string
  }

  /** Indeterminate-progress glyph, 16px. */
  export function IconLoadingOutline16(props?: IconProps): ReactElement
  /** Play glyph, 16px. */
  export function IconPlayOutline16(props?: IconProps): ReactElement
  /** Stop glyph, 16px. */
  export function IconStopFill16(props?: IconProps): ReactElement

  /** Where the bubble sits relative to its anchor. */
  export type TooltipSide = 'top' | 'right' | 'bottom' | 'left'

  /**
   * Hover/focus label attached to a single anchor element.
   * @param props - the label, the requested side, and the anchor element.
   * @returns the cloned anchor plus its bubble while hovered or focused.
   */
  export function Tooltip(props: {
    label: ReactNode | (() => ReactNode)
    side?: TooltipSide
    delayMs?: number
    disabled?: boolean
    maxWidth?: number
    children: ReactElement
  }): ReactElement
}
