import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const firestoreState = vi.hoisted(() => ({
  memberExists: false,
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getCountFromServer: vi.fn(),
  onSnapshot: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, ...parts) => ({ path: parts.join('/') })),
  deleteDoc: firestoreState.deleteDoc,
  doc: vi.fn((db, ...parts) => ({ path: parts.join('/') })),
  getCountFromServer: vi.fn(async () => ({ data: () => ({ count: firestoreState.count }) })),
  getDoc: firestoreState.getDoc,
  onSnapshot: firestoreState.onSnapshot,
  serverTimestamp: vi.fn(() => 'server-time'),
  setDoc: firestoreState.setDoc
}));

import { CommunityDirectory, CommunityGroupHeader, CommunityShortcuts } from './CommunityHub.jsx';

beforeEach(() => {
  firestoreState.getDoc.mockResolvedValue({ exists: () => firestoreState.memberExists });
  firestoreState.setDoc.mockResolvedValue(undefined);
  firestoreState.deleteDoc.mockResolvedValue(undefined);
  firestoreState.onSnapshot.mockImplementation((ref, next) => {
    if (ref.path.endsWith('/members/user-1')) next({ exists: () => firestoreState.memberExists });
    return vi.fn();
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  firestoreState.memberExists = false;
  firestoreState.getDoc.mockResolvedValue({ exists: () => firestoreState.memberExists });
  firestoreState.setDoc.mockResolvedValue(undefined);
  firestoreState.deleteDoc.mockResolvedValue(undefined);
  firestoreState.onSnapshot.mockImplementation((ref, next) => {
    if (ref.path.endsWith('/members/user-1')) next({ exists: () => firestoreState.memberExists });
    return vi.fn();
  });
});

describe('official community navigation', () => {
  it('shows seven shortcuts and opens the selected official group', () => {
    const onSelectCommunity = vi.fn();
    render(<CommunityShortcuts onSelectCommunity={onSelectCommunity} onViewAll={vi.fn()}/>);
    expect(screen.getByRole('heading', { name: 'Komunitas' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Buka komunitas/ })).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: 'Buka komunitas Ngopi Bareng' }));
    expect(onSelectCommunity).toHaveBeenCalledWith('ngopi-bareng');
  });

  it('shows all seven official groups in the Obrolan directory', () => {
    const onSelectCommunity = vi.fn();
    render(<CommunityDirectory onSelectCommunity={onSelectCommunity}/>);
    expect(screen.getByRole('heading', { name: 'Temukan komunitasmu.' })).toBeTruthy();
    expect(screen.getByText('Tanya Warkop')).toBeTruthy();
    expect(screen.getByText('Komunitas & Aktivitas')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Buka komunitas' })[0]);
    expect(onSelectCommunity).toHaveBeenCalledWith('ngopi-bareng');
  });
});

describe('community membership', () => {
  it('shows the real member count and lets a signed-in member join', async () => {
    const onMembershipChange = vi.fn();
    render(<CommunityGroupHeader
      db={{}} user={{ uid: 'user-1' }} communityId="ngopi-bareng"
      onBack={vi.fn()} onNotice={vi.fn()} onRequestAuth={vi.fn()}
      onMembershipChange={onMembershipChange}
    />);
    expect(await screen.findByRole('button', { name: 'Gabung komunitas' })).toBeTruthy();
    expect(firestoreState.getCountFromServer).not.toHaveBeenCalled();
    expect(screen.queryByText(/\\d+ anggota/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Gabung komunitas' }));
    await waitFor(() => expect(firestoreState.setDoc).toHaveBeenCalledWith(
      { path: 'communities/ngopi-bareng/members/user-1' },
      { uid: 'user-1', createdAt: 'server-time' }
    ));
    expect(onMembershipChange).toHaveBeenCalledWith(true);
  });

  it('asks a visitor to sign in before joining', async () => {
    const onRequestAuth = vi.fn();
    const onNotice = vi.fn();
    render(<CommunityGroupHeader
      db={{}} user={null} communityId="komunitas-aktivitas"
      onBack={vi.fn()} onNotice={onNotice} onRequestAuth={onRequestAuth}
      onMembershipChange={vi.fn()}
    />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gabung komunitas' }));
    expect(onRequestAuth).toHaveBeenCalledOnce();
    expect(onNotice).toHaveBeenCalledWith('Masuk terlebih dahulu untuk bergabung dengan komunitas.');
  });
});
