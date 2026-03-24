# Changelog — @bitchat-sdk/nostr

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — 2026-03-22

Initial GA release.

### Added
- `RelayClient` — async WebSocket Nostr relay client (NIP-01)
  - `connect()` / `close()` lifecycle
  - `publish(event)` → `Promise<boolean>` with configurable timeout and `OK` acknowledgement
  - `subscribe(id, filters, onEvent, onEose?)` / `unsubscribe(id)`
  - Exponential back-off reconnect with configurable max attempts
- Observability hooks on `RelayClient`:
  - `onConnect`, `onDisconnect`, `onNotice`, `onPublishOk`, `onEvent`, `onEose`, `onReconnect`, `onError`
  - `eventsReceived` and `eventsPublished` counters
- Handler type exports: `EventHandler`, `EoseHandler`, `NoticeHandler`, `PublishOkHandler`, `ReconnectHandler`, `ErrorHandler`
- `connectToRelay(url, options?)` — convenience factory
- `RelayConfig` / `RelayClientOptions` — typed configuration with `read`/`write` access flags
- NIP-17 Gift Wrap helpers: `sealRumor()`, `giftWrap()`, `unwrapGift()`, `unsealRumor()`
- `wrapAndSend()` / `receiveAndUnwrap()` — end-to-end send/receive with full NIP-17 flow
- `buildDMRumor()` — construct a kind-14 DM rumor embedding a BitChat packet
- `buildGeohashPresenceEvent()` — construct a geo-tagged presence event
- `encodePacketToBase64()` / `decodePacketFromBase64()` — Base64 transport encoding for BitChat packets
- `extractPacketFromEvent()` — decode a BitChat packet from a Nostr event; returns `EmbeddedBitChatPayload` with `packet` (raw bytes), `event`, and optional `senderIDHex`
- `serializeEvent()` — canonical NIP-01 JSON serialisation for signing
- `CryptoProvider` interface — inject your secp256k1 / Schnorr implementation
- `NostrEvent`, `NostrFilter`, `NostrKind`, `EmbeddedBitChatPayload` TypeScript types

### Protocol Compatibility
Compatible with NIP-01, NIP-17. Wire events are interoperable with any standard Nostr relay.

[0.1.0]: https://github.com/bitchat-sdk/nostr-js/releases/tag/v0.1.0

[Unreleased]: https://github.com/bitchat-sdk/nostr-js/compare/v0.1.0...HEAD