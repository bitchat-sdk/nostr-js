/**
 * @bitchat/nostr
 *
 * BitChat-over-Nostr transport for Node.js.
 * Provides NIP-17 gift wrap, relay client, and BitChat packet embedding helpers.
 *
 * ```ts
 * import { RelayClient, buildDMRumor, wrapAndSend, extractPacketFromEvent } from '@bitchat/nostr';
 * ```
 */

export * from './types.js';
export {
  RelayClient,
  connectToRelay,
  type EventHandler,
  type EoseHandler,
  type NoticeHandler,
  type PublishOkHandler,
  type ReconnectHandler,
  type ErrorHandler,
} from './relay.js';
export {
  encodePacketToBase64,
  decodePacketFromBase64,
  buildDMRumor,
  buildGeohashPresenceEvent,
  extractPacketFromEvent,
} from './embed.js';
export {
  serializeEvent,
  giftWrap,
  sealRumor,
  unwrapGift,
  unsealRumor,
  wrapAndSend,
  receiveAndUnwrap,
  type CryptoProvider,
} from './wrap.js';
