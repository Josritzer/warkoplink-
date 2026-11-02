import { describe, expect, it } from 'vitest';
import { extractMentionUsernames, filterNotifications, isUnreadNotification, notificationLabel } from './notificationModel.js';

describe('extractMentionUsernames', () => {
  it('extracts unique case-insensitive usernames from message text', () => {
    expect(extractMentionUsernames('Hai @Kopi_Senja, cek @kopi_senja dan @admin123!')).toEqual(['kopi_senja', 'admin123']);
  });

  it('does not treat email addresses or longer invalid handles as mentions', () => {
    expect(extractMentionUsernames('mail admin@example.com and @ab and @username-that-is-too-long')).toEqual([]);
  });

  it('handles empty and non-string input safely', () => {
    expect(extractMentionUsernames(null)).toEqual([]);
    expect(extractMentionUsernames(42)).toEqual([]);
  });
});

describe('notification presentation', () => {
  it('labels supported notification types in Indonesian', () => {
    expect(notificationLabel({ type: 'mention' })).toBe('menyebut Anda dalam obrolan');
    expect(notificationLabel({ type: 'comment' })).toBe('mengomentari obrolan Anda');
    expect(notificationLabel({ type: 'reaction' })).toBe('memberi reaksi pada obrolan Anda');
    expect(notificationLabel({ type: 'follow' })).toBe('mulai mengikuti warkop Anda');
    expect(notificationLabel({ type: 'friend' })).toBe('sekarang menjadi teman Anda karena kalian saling mengikuti');
    expect(notificationLabel({ type: 'message' })).toBe('mengirim pesan pribadi kepada Anda');
  });

  it('treats null readAt as unread and a timestamp as read', () => {
    expect(isUnreadNotification({ readAt: null })).toBe(true);
    expect(isUnreadNotification({ readAt: { seconds: 1 } })).toBe(false);
  });

  it('filters notifications to unread items without changing the original order', () => {
    const items = [
      { id: 'read-new', readAt: { seconds: 3 } },
      { id: 'unread-old', readAt: null },
      { id: 'unread-new', readAt: undefined }
    ];

    expect(filterNotifications(items, 'all')).toEqual(items);
    expect(filterNotifications(items, 'unread').map(item => item.id)).toEqual(['unread-old', 'unread-new']);
    expect(filterNotifications(items, 'unknown')).toEqual(items);
  });
});
