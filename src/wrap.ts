/**
 * NIP-17 Gift Wrap helpers.
 *
 * NIP-17 provides private direct messages via a double-encryption scheme:
 *
 *   DM rumor (kind 14, unsigned) — the actual message
 *     └── Sealed (kind 13, signed by sender) — rumor encrypted to recipient
 *           └── Gift Wrap (kind 1059, ephemeral key) — seal encrypted to recipient
 *                 └── Published to relay
 *
 * This module provides the envelope operations for wrapping/unwrapping.
 * Actual NIP-44 encryption requires @noble/curves (secp256k1) and @noble/hashes.
 *
 * The encryption primitives are injected via the `CryptoProvider` interface
 * so this package does not hard-depend on a specific crypto library.
 */

import type { NostrEvent, NostrRumor } from './types.js';
import { NostrKind } from './types.js';

/**
 * Crypto provider interface — inject your preferred secp256k1 + NIP-44 implementation.
 *
 * @example Using @noble/curves:
 * ```ts
 * import { secp256k1 } from '@noble/curves/secp256k1';
 * import { sha256 } from '@noble/hashes/sha256';
 * // ... implement NIP-44 encrypt/decrypt using these
 * ```
 */
export interface CryptoProvider {
  /**
   * NIP-44 encrypt `plaintext` from `senderPrivkey` to `recipientPubkey`.
   * Returns base64-encoded ciphertext.
   */
  nip44Encrypt(
    plaintext: string,
    senderPrivkey: Uint8Array,
    recipientPubkey: string
  ): Promise<string>;

  /**
   * NIP-44 decrypt `ciphertext` using `recipientPrivkey` and `senderPubkey`.
   * Returns plaintext string, or null on failure.
   */
  nip44Decrypt(
    ciphertext: string,
    recipientPrivkey: Uint8Array,
    senderPubkey: string
  ): Promise<string | null>;

  /**
   * Derive the Nostr public key (64-char hex) from a 32-byte private key.
   */
  getPublicKey(privateKey: Uint8Array): string;

  /**
   * Sign a Nostr event. Returns the completed event with `id` and `sig` set.
   */
  signEvent(event: NostrRumor, privateKey: Uint8Array): Promise<NostrEvent>;

  /**
   * Generate a random 32-byte private key for ephemeral use.
   */
  generateEphemeralKey(): Uint8Array;
}

/**
 * Serialize a Nostr event for ID computation (NIP-01).
 * [0, pubkey, created_at, kind, tags, content]
 */
export function serializeEvent(event: NostrRumor): string {
  return JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
}

/**
 * Wrap a signed Seal (kind 13) into a Gift Wrap (kind 1059) using an ephemeral key.
 *
 * @param seal            The signed seal event to wrap
 * @param recipientPubkey Recipient's Nostr public key (64-char hex)
 * @param crypto          Injected crypto provider
 * @returns Signed gift-wrap event ready for relay publication
 */
export async function giftWrap(
  seal: NostrEvent,
  recipientPubkey: string,
  crypto: CryptoProvider
): Promise<NostrEvent> {
  const ephemeralKey = crypto.generateEphemeralKey();
  const ephemeralPubkey = crypto.getPublicKey(ephemeralKey);

  const content = await crypto.nip44Encrypt(
    JSON.stringify(seal),
    ephemeralKey,
    recipientPubkey
  );

  const rumor: NostrRumor = {
    pubkey: ephemeralPubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: NostrKind.GiftWrap,
    tags: [['p', recipientPubkey]],
    content,
  };

  return crypto.signEvent(rumor, ephemeralKey);
}

/**
 * Seal a DM rumor (kind 14) into a Seal (kind 13) signed by the sender.
 *
 * @param rumor           The unsigned DM rumor
 * @param senderPrivkey   Sender's Nostr private key
 * @param recipientPubkey Recipient's Nostr public key
 * @param crypto          Injected crypto provider
 * @returns Signed seal event (not published directly)
 */
export async function sealRumor(
  rumor: NostrRumor,
  senderPrivkey: Uint8Array,
  recipientPubkey: string,
  crypto: CryptoProvider
): Promise<NostrEvent> {
  const senderPubkey = crypto.getPublicKey(senderPrivkey);

  const content = await crypto.nip44Encrypt(
    JSON.stringify(rumor),
    senderPrivkey,
    recipientPubkey
  );

  const sealRumor: NostrRumor = {
    pubkey: senderPubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: NostrKind.Seal,
    tags: [],
    content,
  };

  return crypto.signEvent(sealRumor, senderPrivkey);
}

/**
 * Unwrap a Gift Wrap event to recover the inner Seal.
 *
 * @param giftWrapEvent   The kind 1059 gift-wrap event
 * @param recipientPrivkey Recipient's Nostr private key
 * @param crypto           Injected crypto provider
 * @returns The inner Seal event, or null on failure
 */
export async function unwrapGift(
  giftWrapEvent: NostrEvent,
  recipientPrivkey: Uint8Array,
  crypto: CryptoProvider
): Promise<NostrEvent | null> {
  if (giftWrapEvent.kind !== NostrKind.GiftWrap) return null;

  const plaintext = await crypto.nip44Decrypt(
    giftWrapEvent.content,
    recipientPrivkey,
    giftWrapEvent.pubkey
  );
  if (!plaintext) return null;

  try {
    return JSON.parse(plaintext) as NostrEvent;
  } catch {
    return null;
  }
}

/**
 * Unseal a Seal (kind 13) event to recover the inner DM rumor.
 *
 * @param sealEvent        The kind 13 seal event
 * @param recipientPrivkey Recipient's Nostr private key
 * @param crypto           Injected crypto provider
 * @returns The inner DM rumor, or null on failure
 */
export async function unsealRumor(
  sealEvent: NostrEvent,
  recipientPrivkey: Uint8Array,
  crypto: CryptoProvider
): Promise<NostrRumor | null> {
  if (sealEvent.kind !== NostrKind.Seal) return null;

  const plaintext = await crypto.nip44Decrypt(
    sealEvent.content,
    recipientPrivkey,
    sealEvent.pubkey
  );
  if (!plaintext) return null;

  try {
    return JSON.parse(plaintext) as NostrRumor;
  } catch {
    return null;
  }
}

/**
 * Full send flow: rumor → seal → gift wrap.
 *
 * @param rumor           The unsigned DM rumor (kind 14) containing the BitChat payload
 * @param senderPrivkey   Sender's Nostr private key
 * @param recipientPubkey Recipient's Nostr public key
 * @param crypto          Injected crypto provider
 * @returns Gift-wrap event ready for publication to a relay
 */
export async function wrapAndSend(
  rumor: NostrRumor,
  senderPrivkey: Uint8Array,
  recipientPubkey: string,
  crypto: CryptoProvider
): Promise<NostrEvent> {
  const seal = await sealRumor(rumor, senderPrivkey, recipientPubkey, crypto);
  return giftWrap(seal, recipientPubkey, crypto);
}

/**
 * Full receive flow: gift wrap → seal → rumor.
 *
 * @param giftWrapEvent   The kind 1059 gift-wrap event received from the relay
 * @param recipientPrivkey Recipient's Nostr private key
 * @param crypto           Injected crypto provider
 * @returns The inner DM rumor, or null on failure
 */
export async function receiveAndUnwrap(
  giftWrapEvent: NostrEvent,
  recipientPrivkey: Uint8Array,
  crypto: CryptoProvider
): Promise<NostrRumor | null> {
  const seal = await unwrapGift(giftWrapEvent, recipientPrivkey, crypto);
  if (!seal) return null;
  return unsealRumor(seal, recipientPrivkey, crypto);
}
