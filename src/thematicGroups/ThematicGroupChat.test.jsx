import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({
  memberExists: false,
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
  state.setDoc.mockResolvedValue(undefined);
  state.deleteDoc.mockResolvedValue(undefined);
  state.addDoc.mockResolvedValue({ id: 'message-1' });
  state.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ displayName: 'Alice' }) });
  state.updateDoc.mockResolvedValue(undefined);
  state.onSnapshot.mockImplementation((ref, next) => {
    if (ref.path.endsWith('/members/alice')) {
      next({ exists: () => state.memberExists });
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
});
