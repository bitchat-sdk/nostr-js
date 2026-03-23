/**
 * Nostr types for the BitChat-over-Nostr transport.
 *
 * Follows NIP-01 (basic protocol) and NIP-17 (private direct messages).
 */

/** A raw Nostr event as sent over WebSocket (NIP-01). */
export interface NostrEvent {
  /** 32-byte lowercase hex SHA-256 of the serialized event. */
  id: string;
  /** 32-byte lowercase hex public key of the event creator. */
  pubkey: string;
  /** Unix timestamp in seconds. */
  created_at: number;
  /** Event kind. */
  kind: number;
  /** Array of tag arrays. */
  tags: string[][];
  /** Event content. */
  content: string;
  /** 64-byte hex Schnorr signature. */
  sig: string;
}

/** Unsigned Nostr event (rumor) — no id or sig. */
export type NostrRumor = Omit<NostrEvent, 'id' | 'sig'>;

/** NIP-17 event kinds. */
export enum NostrKind {
  /** NIP-17 DM rumor (inner message, never published). */
  DM = 14,
  /** NIP-17 Seal (kind 13, signed by sender, not directly published). */
  Seal = 13,
  /** NIP-17 Gift Wrap (kind 1059, ephemeral key, published to relay). */
  GiftWrap = 1059,
  /** Ephemeral event for geohash-based presence. */
  EphemeralEvent = 20000,
  /** Geohash presence broadcast. */
  GeohashPresence = 20001,
}

/** A decoded BitChat-over-Nostr embedded payload. */
export interface EmbeddedBitChatPayload {
  /** The raw BitChat binary packet bytes. */
  packet: Uint8Array;
  /** The Nostr event that carried this payload. */
  event: NostrEvent;
  /** The senderID parsed from the inner BitChat packet (hex). */
  senderIDHex?: string;
}

/** Relay connection configuration. */
export interface RelayConfig {
  /** WebSocket URL of the relay. */
  url: string;
  /** Read operations enabled. Default: true. */
  read?: boolean;
  /** Write operations enabled. Default: true. */
  write?: boolean;
}

/** Subscription filter (NIP-01). */
export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  '#e'?: string[];
  '#p'?: string[];
  since?: number;
  until?: number;
  limit?: number;
}

/** Options for the relay client. */
export interface RelayClientOptions {
  /** How long to wait for a relay connection before giving up (ms). Default: 5000. */
  connectTimeoutMs?: number;
  /** How long to wait for an OK receipt after EVENT publish (ms). Default: 3000. */
  publishTimeoutMs?: number;
  /** Number of automatic reconnect attempts on disconnect. Default: 3. */
  maxReconnectAttempts?: number;
  /** Base delay for exponential backoff on reconnect (ms). Default: 1000. */
  reconnectBaseDelayMs?: number;
}
