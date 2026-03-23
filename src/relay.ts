/**
 * Nostr relay client for BitChat-over-Nostr transport.
 *
 * Implements NIP-01 WebSocket protocol:
 *   CLIENT → ["EVENT", {...}]           — publish an event
 *   CLIENT → ["REQ", subId, ...filters] — subscribe
 *   CLIENT → ["CLOSE", subId]           — unsubscribe
 *   RELAY  → ["EVENT", subId, {...}]    — received event
 *   RELAY  → ["EOSE", subId]            — end of stored events
 *   RELAY  → ["OK", eventId, bool, msg] — publish acknowledgement
 *   RELAY  → ["NOTICE", msg]            — relay notice
 */

import WebSocket from 'ws';
import type {
  NostrEvent,
  NostrFilter,
  RelayConfig,
  RelayClientOptions,
} from './types.js';

export type EventHandler = (event: NostrEvent, subscriptionID: string) => void;
export type EoseHandler = (subscriptionID: string) => void;
export type NoticeHandler = (message: string) => void;
export type PublishOkHandler = (eventID: string, ok: boolean, message: string) => void;
export type ReconnectHandler = (attempt: number, delayMs: number) => void;
export type ErrorHandler = (error: Error) => void;

export class RelayClient {
  private ws: WebSocket | null = null;
  private readonly config: RelayConfig;
  private readonly options: Required<RelayClientOptions>;
  private subscriptions = new Map<string, EventHandler>();
  private eoseHandlers = new Map<string, EoseHandler>();
  private pendingOk = new Map<string, { resolve: (ok: boolean) => void; reject: (e: Error) => void }>();
  private reconnectAttempts = 0;
  private closed = false;

  /** Called when the WebSocket connection opens. */
  onConnect: (() => void) | null = null;
  /** Called when the WebSocket connection closes. `code` is the WS close code. */
  onDisconnect: ((code: number) => void) | null = null;
  /** Called when the relay sends a NOTICE message. */
  onNotice: NoticeHandler | null = null;
  /** Called when the relay acknowledges a published event (OK verb). */
  onPublishOk: PublishOkHandler | null = null;
  /** Called for every inbound EVENT before routing to subscription handlers. */
  onEvent: EventHandler | null = null;
  /** Called for every EOSE before invoking the per-subscription handler. */
  onEose: EoseHandler | null = null;
  /** Called when a reconnect is scheduled. `attempt` is 1-based. */
  onReconnect: ReconnectHandler | null = null;
  /** Called on unhandled errors (receive loop errors, JSON parse failures on critical paths). */
  onError: ErrorHandler | null = null;

  /** Running count of events received across all subscriptions since construction. */
  eventsReceived = 0;
  /** Running count of events published since construction. */
  eventsPublished = 0;

  constructor(config: RelayConfig, options: RelayClientOptions = {}) {
    this.config = config;
    this.options = {
      connectTimeoutMs: options.connectTimeoutMs ?? 5000,
      publishTimeoutMs: options.publishTimeoutMs ?? 3000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 3,
      reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? 1000,
    };
  }

  /**
   * Connect to the relay. Resolves when the WebSocket connection is open.
   * Rejects if the connection times out or cannot be established.
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Relay connection timed out: ${this.config.url}`));
        this.ws?.terminate();
      }, this.options.connectTimeoutMs);

      this.ws = new WebSocket(this.config.url);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.reconnectAttempts = 0;
        this.onConnect?.();
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.ws.on('close', (code) => {
        this.onDisconnect?.(code);
        this.scheduleReconnect();
      });
    });
  }

  /**
   * Close the connection. No automatic reconnect after this.
   */
  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }

  /**
   * Publish an event to the relay.
   *
   * Resolves with `true` if the relay acknowledges with `["OK", id, true, ...]`.
   * Resolves with `false` if the relay rejects the event.
   * Rejects on timeout or connection error.
   */
  publish(event: NostrEvent): Promise<boolean> {
    if (!(this.config.write ?? true)) {
      return Promise.reject(new Error('This relay connection is read-only'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingOk.delete(event.id);
        reject(new Error(`Publish timed out for event ${event.id}`));
      }, this.options.publishTimeoutMs);

      this.pendingOk.set(event.id, {
        resolve: (ok) => { clearTimeout(timer); resolve(ok); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });

      this.send(['EVENT', event]);
      this.eventsPublished++;
    });
  }

  /**
   * Subscribe to events matching the given filters.
   *
   * @param subscriptionID  Stable string ID for this subscription
   * @param filters         One or more NIP-01 filter objects
   * @param onEvent         Called for each received event
   * @param onEose          Called when the relay sends EOSE (end of stored events)
   */
  subscribe(
    subscriptionID: string,
    filters: NostrFilter[],
    onEvent: EventHandler,
    onEose?: EoseHandler
  ): void {
    if (!(this.config.read ?? true)) {
      throw new Error('This relay connection is write-only');
    }
    this.subscriptions.set(subscriptionID, onEvent);
    if (onEose) this.eoseHandlers.set(subscriptionID, onEose);
    this.send(['REQ', subscriptionID, ...filters]);
  }

  /**
   * Unsubscribe from a subscription.
   */
  unsubscribe(subscriptionID: string): void {
    this.subscriptions.delete(subscriptionID);
    this.eoseHandlers.delete(subscriptionID);
    this.send(['CLOSE', subscriptionID]);
  }

  private send(message: unknown[]): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(raw: string): void {
    let msg: unknown[];
    try {
      msg = JSON.parse(raw) as unknown[];
    } catch {
      return;
    }
    if (!Array.isArray(msg) || msg.length < 2) return;

    const verb = msg[0] as string;

    switch (verb) {
      case 'EVENT': {
        const [, subID, event] = msg as [string, string, NostrEvent];
        if (event) {
          this.eventsReceived++;
          this.onEvent?.(event, subID);
          const handler = this.subscriptions.get(subID);
          if (handler) handler(event, subID);
        }
        break;
      }
      case 'EOSE': {
        const [, subID] = msg as [string, string];
        this.onEose?.(subID);
        const handler = this.eoseHandlers.get(subID);
        if (handler) handler(subID);
        break;
      }
      case 'OK': {
        const [, eventID, ok, okMsg = ''] = msg as [string, string, boolean, string?];
        this.onPublishOk?.(eventID, ok, okMsg);
        const pending = this.pendingOk.get(eventID);
        if (pending) {
          this.pendingOk.delete(eventID);
          pending.resolve(ok);
        }
        break;
      }
      case 'NOTICE': {
        const [, notice] = msg as [string, string];
        this.onNotice?.(notice);
        break;
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectAttempts >= this.options.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    const delay = this.options.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts - 1);
    this.onReconnect?.(this.reconnectAttempts, delay);
    setTimeout(() => {
      this.connect().catch((err: Error) => {
        this.onError?.(err);
      });
    }, delay);
  }
}

/**
 * Create and connect a relay client.
 * Convenience function that returns a connected client.
 */
export async function connectToRelay(
  url: string,
  options?: RelayClientOptions
): Promise<RelayClient> {
  const client = new RelayClient({ url }, options);
  await client.connect();
  return client;
}
