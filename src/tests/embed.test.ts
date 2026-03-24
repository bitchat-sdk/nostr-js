import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encodePacketToBase64, decodePacketFromBase64, buildDMRumor } from '../embed.js';
import { encode as encodePacket, hexToBytes } from '@bitchat-sdk/protocol-core';
import { MessageType } from '@bitchat-sdk/protocol-core';

async function makeTestPacket(): Promise<Uint8Array> {
  return encodePacket({
    version: 1,
    type: MessageType.Message,
    ttl: 7,
    timestamp: 0n,
    flags: 0,
    senderID: hexToBytes('abcdef0123456789'),
    payload: new TextEncoder().encode('relay test'),
    isRSR: false,
  }, { padding: false });
}

describe('BitChat-over-Nostr embedding', () => {
  it('encodes and decodes a packet via base64', async () => {
    const packet = await makeTestPacket();
    const b64 = encodePacketToBase64(packet);
    assert.ok(b64.length > 0);

    const decoded = await decodePacketFromBase64(b64);
    assert.ok(decoded, 'should decode successfully');
    assert.equal(decoded.type, MessageType.Message);
    assert.equal(new TextDecoder().decode(decoded.payload), 'relay test');
  });

  it('returns null for invalid base64', async () => {
    const result = await decodePacketFromBase64('!!!not_base64!!!');
    // Invalid base64 may decode to garbage bytes which then fail packet decode
    assert.equal(result, null);
  });

  it('returns null for valid base64 but invalid packet', async () => {
    const garbage = Buffer.from('this is not a bitchat packet').toString('base64');
    const result = await decodePacketFromBase64(garbage);
    assert.equal(result, null);
  });

  it('builds a DM rumor with correct kind and p-tag', async () => {
    const packet = await makeTestPacket();
    const rumor = buildDMRumor(
      packet,
      'aabbccddeeff0011223344556677889900112233445566778899aabbccddeeff',
      '00112233445566778899aabbccddeeffaabbccddeeff0011223344556677889900'
    );
    assert.equal(rumor.kind, 14);
    assert.ok(rumor.tags.some(t => t[0] === 'p'));
    assert.ok(rumor.content.length > 0);

    // Content should decode back to the original packet
    const decoded = await decodePacketFromBase64(rumor.content);
    assert.ok(decoded);
    assert.equal(new TextDecoder().decode(decoded.payload), 'relay test');
  });
});
