/**
 * Loopback-only Host RPC adapter for the read-aloud Web client.
 *
 * An external plugin cannot join `@deepseek-ai/dsh-api-remotes`, whose generated
 * Remote imports are a fixed in-repo list, so this channel replaces the Typert
 * Remote with a hand-validated JSON route. The endpoint set stays deliberately
 * narrow: identity in, audio out.
 * @module @dsh-external/dsh-read-aloud/rpc
 */
import type { ReadAloudService } from './service.ts';
/** Channel the browser half calls; one route per plugin. */
export declare const CHANNEL = "/dsh-read-aloud";
interface RpcContext {
    readonly connection: {
        readonly rpc: {
            handle(channel: string, handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>, options: {
                readonly authority: 'loopback' | 'trusted-host';
            }): () => Promise<void>;
        };
    };
}
/**
 * Register the read-aloud RPC channel.
 *
 * Trusted-host authority, the same grant `/api` applies. The audio route
 * speaks Session prose that `session.history` already returns verbatim to any
 * caller passing that fence, so pinning this channel to loopback withheld no
 * secret — it only made the play control dead on every non-loopback client
 * (phones and tablets reaching the deployment over Tailscale), because the
 * `playback-failed` route was refused by the same fence and the failure went
 * unlogged.
 *
 * The narrower grant belongs to the configuration plane, which `/api` pins to
 * loopback by method. Reading a reply aloud is not part of it.
 *
 * @param ctx - Host context carrying `connection.rpc`.
 * @param service - the cache service answering the audio request.
 * @returns the disposer that unregisters the channel.
 */
export declare function registerReadAloudRpc(ctx: RpcContext, service: ReadAloudService): () => Promise<void>;
export {};
