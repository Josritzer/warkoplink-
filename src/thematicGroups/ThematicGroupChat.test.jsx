import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({
  memberExists: false,
  reactionDocs: [],
  usernameMap: {},
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  addDoc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  onSnapshot: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  addDoc: state.addDoc,
  collection: vi.fn((db, ...parts) => ({ path: parts.join('/') })),
  deleteDoc: state.deleteDoc,
  doc: vi.fn((db, ...parts) => ({ path: parts.join('/') })),
  getDoc: state.getDoc,
  limit: vi.fn((value) => ({ limit: value })),
  onSnapshot: state.onSnapshot,
  orderBy: vi.fn((...args) => ({ orderBy: args })),
  query: vi.fn((ref, ...args) => ({ path: ref.path, args })),
  serverTimestamp: vi.fn(() => 'server-time'),
  setDoc: state.setDoc,
  updateDoc: state.updateDoc
}));

import ThematicGroupChat from './ThematicGroupChat.jsx';

beforeEach(() => {
  state.memberExists = false;
  state.reactionDocs = [];
  state.usernameMap = {};
  state.setDoc.mockResolvedValue(undefined);
  state.deleteDoc.mockResolvedValue(undefined);
  state.addDoc.mockResolvedValue({ id: 'message-1' });
  state.getDoc.mockImplementation((ref) => {
    if (ref.path.startsWith('usernames/')) {
      const username = ref.path.split('/')[1];
      const uid = state.usernameMap[username];
      return Promise.resolve({ exists: () => Boolean(uid), data: () => ({ uid, username }) });
    }
    return Promise.resolve({ exists: () => true, data: () => ({ displayName: 'Alice' }) });
  });
  state.updateDoc.mockResolvedValue(undefined);
  state.onSnapshot.mockImplementation((ref, next) => {
    if (ref.path.endsWith('/members/alice')) {
      next({ exists: () => state.memberExists, data: () => ({ lastReadAt: null }) });
    } else if (ref.path.endsWith('/reactions')) {
      next({ docs: state.reactionDocs.map((item) => ({ id: item.id, data: () => item.data })) });
    } else if (ref.path.endsWith('/messages')) {
      next({ docs: state.memberExists ? [{
        id: 'hello-1',
        data: () => ({ senderUid: 'bob', senderName: 'Budi', text: 'Selamat datang!', createdAt: { toDate: () => new Date('2026-11-02T08:00:00Z') } })
      }] : [] });
    }
    return vi.fn();
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('thematic group conversation', () => {
  it('shows group information and lets a signed-in visitor join', async () => {
    render(<ThematicGroupChat db={{}} user={{ uid: 'alice', displayName: 'Alice' }} groupId="pemilik-warkop" onBack={vi.fn()} onNotice={vi.fn()} onRequestAuth={vi.fn()}/>);
    expect(screen.getByRole('heading', { name: 'Pemilik Warkop' })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Gabung grup' }));
    await waitFor(() => expect(state.setDoc).toHaveBeenCalledWith(
      { path: 'thematicGroups/pemilik-warkop/members/alice' },
      { uid: 'alice', joinedAt: 'server-time', lastReadAt: 'server-time' }
    ));
  });

  it('asks a visitor to sign in before joining', async () => {
    const onRequestAuth = vi.fn();
    const onNotice = vi.fn();
    render(<ThematicGroupChat db={{}} user={null} groupId="pemilik-warkop" onBack={vi.fn()} onNotice={onNotice} onRequestAuth={onRequestAuth}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Gabung grup' }));
    expect(onRequestAuth).toHaveBeenCalledOnce();
    expect(onNotice).toHaveBeenCalledWith('Masuk terlebih dahulu untuk bergabung dengan grup.');
  });

  it('shows realtime history and sends a text message for a member', async () => {
    state.memberExists = true;
    render(<ThematicGroupChat db={{}} user={{ uid: 'alice', displayName: 'Alice' }} groupId="pemilik-warkop" onBack={vi.fn()} onNotice={vi.fn()} onRequestAuth={vi.fn()}/>);
    expect(await screen.findByText('Selamat datang!')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Tulis pesan grup' }), { target: { value: 'Ada rekomendasi kopi?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim pesan' }));
    await waitFor(() => expect(state.addDoc).toHaveBeenCalledWith(
      { path: 'thematicGroups/pemilik-warkop/messages' },
      { senderUid: 'alice', senderName: 'Alice', text: 'Ada rekomendasi kopi?', createdAt: 'server-time' }
    ));
  });

  it('lets a member reply to a specific message with a visible quote', async () => {
    state.memberExists = true;
    render(<ThematicGroupChat db={{}} user={{ uid: 'alice', displayName: 'Alice' }} groupId="pemilik-warkop" onBack={vi.fn()} onNotice={vi.fn()} onRequestAuth={vi.fn()}/>);
    expect(await screen.findByText('Selamat datang!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Balas pesan Budi' }));
    expect(screen.getByText('Membalas Budi')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Tulis pesan grup' }), { target: { value: 'Saya punya rekomendasi.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim pesan' }));
    await waitFor(() => expect(state.addDoc).toHaveBeenCalledWith(
      { path: 'thematicGroups/pemilik-warkop/messages' },
      { senderUid: 'alice', senderName: 'Alice', text: 'Saya punya rekomendasi.', createdAt: 'server-time', replyToMessageId: 'hello-1' }
    ));
  });

  it('loads and highlights an older message opened from a mention notification', async () => {
    state.memberExists = true;
    state.getDoc.mockImplementation((ref) => {
      if (ref.path === 'thematicGroups/pemilik-warkop/messages/older-mentioned-message') {
        return Promise.resolve({
          exists: () => true,
          id: 'older-mentioned-message',
          data: () => ({
            senderUid: 'bob',
            senderName: 'Budi',
            text: 'Informasi khusus untuk @alice',
            createdAt: { toDate: () => new Date('2026-11-01T08:00:00Z') }
          })
        });
      }
      return Promise.resolve({ exists: () => true, data: () => ({ displayName: 'Alice' }) });
    });
    render(<ThematicGroupChat db={{}} user={{ uid: 'alice', displayName: 'Alice' }} groupId="pemilik-warkop" targetMessageId="older-mentioned-message" onBack={vi.fn()} onNotice={vi.fn()} onRequestAuth={vi.fn()}/>);
    const target = await screen.findByText('Informasi khusus untuk @alice');
    expect(target.closest('[data-message-id="older-mentioned-message"]')?.className).toContain('is-targeted');
  });

  it('lets a member add an emoji reaction to a message', async () => {
    state.memberExists = true;
    render(<ThematicGroupChat db={{}} user={{ uid: 'alice', displayName: 'Alice' }} groupId="pemilik-warkop" onBack={vi.fn()} onNotice={vi.fn()} onRequestAuth={vi.fn()}/>);
    expect(await screen.findByText('Selamat datang!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reaksi 👍 (0)' }));
    await waitFor(() => expect(state.setDoc).toHaveBeenCalledWith(
      { path: 'thematicGroups/pemilik-warkop/reactions/hello-1_alice' },
      { messageId: 'hello-1', uid: 'alice', emoji: '👍', updatedAt: 'server-time' }
    ));
  });

  it('stores parsed @username mentions and creates a notification for the mentioned member', async () => {
    state.memberExists = true;
    state.usernameMap = { budi: 'bob' };
    render(<ThematicGroupChat db={{}} user={{ uid: 'alice', displayName: 'Alice' }} groupId="pemilik-warkop" onBack={vi.fn()} onNotice={vi.fn()} onRequestAuth={vi.fn()}/>);
    expect(await screen.findByText('Selamat datang!')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Tulis pesan grup' }), { target: { value: 'Halo @budi, apa kabar?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim pesan' }));
    await waitFor(() => expect(state.addDoc).toHaveBeenCalledWith(
      { path: 'thematicGroups/pemilik-warkop/messages' },
      expect.objectContaining({ senderUid: 'alice', senderName: 'Alice', text: 'Halo @budi, apa kabar?', mentionedUsernames: ['budi'] })
    ));
    await waitFor(() => expect(state.setDoc).toHaveBeenCalledWith(
      { path: 'notifications/group_mention_message-1_bob' },
      expect.objectContaining({ recipientUid: 'bob', actorUid: 'alice', type: 'mention', groupId: 'pemilik-warkop', messageId: 'message-1', username: 'budi', readAt: null })
    ));
  });

});
