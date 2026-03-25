# @bitchat-sdk/nostr

[![npm](https://img.shields.io/npm/v/@bitchat-sdk/nostr)](https://www.npmjs.com/package/@bitchat-sdk/nostr)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](https://unlicense.org)

BitChat-over-Nostr transport for Node.js.

Implements the relay transport layer used in the BitChat mesh app:
NIP-17 gift-wrap private messages, relay client (NIP-01), and helpers
for embedding BitChat binary packets inside Nostr events.

## Installation

```bash
npm install @bitchat-sdk/nostr @bitchat-sdk/protocol-core
# NIP-17 encryption requires a secp256k1 library (optional):
npm install @noble/curves @noble/hashes
```

## Quick Start

### Listen for BitChat packets via Nostr relay

```ts
import { RelayClient, extractPacketFromEvent } from '@bitchat-sdk/nostr';
import { NostrKind } from '@bitchat-sdk/nostr';

const relay = new RelayClient({ url: 'wss://relay.example.com' });
await relay.connect();

relay.subscribe('bitchat-dm', [{ kinds: [NostrKind.GiftWrap] }], async (event) => {
  // After decrypting the gift wrap (see NIP-17 section), extract the BitChat packet:
  const embedded = await extractPacketFromEvent(event);
  if (embedded) {
    console.log('Received BitChat packet from', embedded.senderIDHex);
  }
});
```

### Send a BitChat packet via NIP-17

```ts
import { encode } from '@bitchat-sdk/protocol-core';
import { buildDMRumor, wrapAndSend } from '@bitchat-sdk/nostr';
import type { CryptoProvider } from '@bitchat-sdk/nostr';

// 1. Encode your BitChat packet
const wire = await encode(myPacket, { padding: false });

// 2. Build a NIP-17 DM rumor carrying the packet
const rumor = buildDMRumor(wire, senderNostrPubkey, recipientNostrPubkey);

// 3. Wrap and publish (requires your CryptoProvider implementation)
const giftWrapEvent = await wrapAndSend(rumor, senderPrivkey, recipientPubkey, crypto);
const ok = await relay.publish(giftWrapEvent);
console.log('Published:', ok);
```

## API

### RelayClient

```ts
new RelayClient(config: RelayConfig, options?: RelayClientOptions)
client.connect(): Promise<void>
client.close(): void
client.publish(event: NostrEvent): Promise<boolean>
client.subscribe(id, filters, onEvent, onEose?)
client.unsubscribe(id)
```

### Embedding Helpers

```ts
encodePacketToBase64(packet: Uint8Array): string
decodePacketFromBase64(content: string): Promise<BitchatPacket | null>
buildDMRumor(packet, senderPubkey, recipientPubkey): NostrRumor
buildGeohashPresenceEvent(packet, senderPubkey, geohash): NostrRumor
extractPacketFromEvent(event: NostrEvent): Promise<EmbeddedBitChatPayload | null>
```

### NIP-17 Gift Wrap

```ts
wrapAndSend(rumor, senderPrivkey, recipientPubkey, crypto): Promise<NostrEvent>
receiveAndUnwrap(giftWrapEvent, recipientPrivkey, crypto): Promise<NostrRumor | null>
// Individual operations:
sealRumor(rumor, senderPrivkey, recipientPubkey, crypto): Promise<NostrEvent>
giftWrap(seal, recipientPubkey, crypto): Promise<NostrEvent>
unwrapGift(giftWrapEvent, recipientPrivkey, crypto): Promise<NostrEvent | null>
unsealRumor(sealEvent, recipientPrivkey, crypto): Promise<NostrRumor | null>
```

### CryptoProvider Interface

`wrapAndSend` / `receiveAndUnwrap` require a `CryptoProvider`:

```ts
interface CryptoProvider {
  nip44Encrypt(plaintext, senderPrivkey, recipientPubkey): Promise<string>
  nip44Decrypt(ciphertext, recipientPrivkey, senderPubkey): Promise<string | null>
  getPublicKey(privateKey: Uint8Array): string
  signEvent(event, privateKey): Promise<NostrEvent>
  generateEphemeralKey(): Uint8Array
}
```

Implement using `@noble/curves` (secp256k1) + NIP-44 spec.

## BitChat-over-Nostr Protocol

BitChat packets are base64-encoded and placed in the `content` field of Nostr events.

- **Private messages**: kind 14 rumor → kind 13 seal → kind 1059 gift-wrap
- **Peer announcements**: kind 20001 (GeohashPresence), no encryption
- The inner BitChat packet carries all mesh-protocol metadata (sender ID, TTL, type)

## Supported Relays

Any NIP-01 compliant relay. Tested with:
- `wss://relay.damus.io`
- `wss://relay.nostr.band`
- `wss://nos.lol`

## Known Limitations

- NIP-44 encryption is not bundled — inject your own `CryptoProvider`.
- Relay rate limiting is not automatically enforced; add your own throttling for high-volume use cases.
- Browser support requires a `WebSocket` polyfill in environments without native WS.

## License

Unlicense — public domain.
