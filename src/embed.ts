/**
 * BitChat-over-Nostr embedding helpers.
 *
 * BitChat binary packets are embedded in Nostr events as base64-encoded content.
 * The outer Nostr event provides identity, relay routing, and timestamp.
 * The inner BitChat packet carries the mesh protocol payload.
 *
 * Embedding strategy (from NostrEmbeddedBitChat.swift):
 *   - The BitChat packet is base64-encoded and placed in the event `content`.
 *   - Event kind is typically kind 1059 (NIP-17 gift wrap) for private messages,
 *     or kind 20001 (GeohashPresence) for location-based broadcasts.
 *   - The `p` tag references the recipient's Nostr public key.
 *   - The `t` tag may carry a topic/channel hash.
 */

import { bytesToHex, decode as decodePacket, type BitchatPacket } from '@bitchat-sdk/protocol-core';
import type { NostrEvent, EmbeddedBitChatPayload, NostrRumor } from './types.js';
import { NostrKind } from './types.js';


/**
 * Encode a BitChat binary packet to base64 for embedding in a Nostr event content field.
 */
export function encodePacketToBase64(packet: Uint8Array): string {
  return Buffer.from(packet).toString('base64');
}

/**
 * Decode a base64-encoded BitChat packet from a Nostr event content field.
 * Returns `null` if the content is not valid base64 or decodes to an invalid packet.
 */
export async function decodePacketFromBase64(
  content: string
): Promise<BitchatPacket | null> {
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(Buffer.from(content, 'base64'));
  } catch {
    return null;
  }
  return await decodePacket(raw);
}

/**
 * Build an unsigned Nostr rumor (kind 14, NIP-17 DM) carrying a BitChat packet.
 *
 * The caller is responsible for sealing (kind 13) and gift-wrapping (kind 1059)
 * the rumor before publishing. See `wrap.ts` for those operations.
 *
 * @param packet        Encoded BitChat binary packet bytes
 * @param senderPubkey  Nostr public key of the sender (64-char hex)
 * @param recipientPubkey  Nostr public key of the recipient (64-char hex)
 */
export function buildDMRumor(
  packet: Uint8Array,
  senderPubkey: string,
  recipientPubkey: string
): NostrRumor {
  return {
    pubkey: senderPubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: NostrKind.DM,
    tags: [['p', recipientPubkey]],
    content: encodePacketToBase64(packet),
  };
}

/**
 * Build an unsigned Nostr event for GeohashPresence (kind 20001),
 * embedding a BitChat announce packet for relay-based peer discovery.
 *
 * @param packet        Encoded BitChat binary packet bytes
 * @param senderPubkey  Nostr public key of the sender
 * @param geohash       Geohash string (e.g. "u4pruyd") for location tagging
 */
export function buildGeohashPresenceEvent(
  packet: Uint8Array,
  senderPubkey: string,
  geohash: string
): NostrRumor {
  return {
    pubkey: senderPubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: NostrKind.GeohashPresence,
    tags: [['g', geohash]],
    content: encodePacketToBase64(packet),
  };
}

/**
 * Extract and decode a BitChat packet from a received Nostr event.
 *
 * Handles both direct content (plain base64) and gift-wrapped events
 * (where the caller has already decrypted the inner content).
 *
 * Returns `null` if the event content does not contain a valid BitChat packet.
 */
export async function extractPacketFromEvent(
  event: NostrEvent
): Promise<EmbeddedBitChatPayload | null> {
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(Buffer.from(event.content, 'base64'));
  } catch {
    return null;
  }
  const decoded = await decodePacket(raw);
  if (!decoded) return null;

  let senderIDHex: string | undefined;
  if (decoded.senderID.length >= 8) {
    senderIDHex = bytesToHex(decoded.senderID);
  }

  return { packet: raw, event, senderIDHex };
}
