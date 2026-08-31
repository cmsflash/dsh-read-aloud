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
 * Loopback authority only: the audio route reads Session prose, so a
 * trusted-host caller must not reach it.
 *
 * @param ctx - Host context carrying `connection.rpc`.
 * @param service - the cache service answering the audio request.
 * @returns the disposer that unregisters the channel.
 */
export declare function registerReadAloudRpc(ctx: RpcContext, service: ReadAloudService): () => Promise<void>;
export {};
