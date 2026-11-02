import { describe, expect, it } from 'vitest';
import { conversationIdFor, friendNotificationId, isMutualFollow, messagePreview } from './messageModel.js';
describe('message relationship model', () => {
  it('requires both follow directions before treating members as friends', () => {
    expect(isMutualFollow('a','b',['a_b'])).toBe(false);
    expect(isMutualFollow('a','b',['b_a'])).toBe(false);
    expect(isMutualFollow('a','b',['a_b','b_a'])).toBe(true);
  });
  it('uses a stable conversation id regardless of who starts the chat', () => {
    expect(conversationIdFor('b','a')).toBe('a__b');
    expect(conversationIdFor('a','a')).toBe('');
  });
  it('creates one stable friend notification key per recipient', () => {
    expect(friendNotificationId('b','a','a')).toBe(friendNotificationId('a','b','a'));
    expect(friendNotificationId('a','b','a')).not.toBe(friendNotificationId('a','b','b'));
  });
  it('keeps message previews compact', () => {
    expect(messagePreview('halo')).toBe('halo');
    expect(messagePreview('x'.repeat(100),10)).toBe('xxxxxxxxx…');
  });
});
