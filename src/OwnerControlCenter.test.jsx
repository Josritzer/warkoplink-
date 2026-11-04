import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, name) => ({ name })),
  getCountFromServer: vi.fn(async (target) => {
    const name = target.args[0].name;
    const filteredVerified = target.args.some((part) => part.where?.[1] === 'verified');
    const values = { publicProfiles: 17, warungs: filteredVerified ? 3 : 5, posts: 31, postReports: 2 };
    return { data: () => ({ count: values[name] ?? 0 }) };
  }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  limit: vi.fn((value) => ({ limit: value })),
  orderBy: vi.fn((...args) => ({ orderBy: args })),
  query: vi.fn((...args) => ({ args })),
  where: vi.fn((...args) => ({ where: args })),
}));

vi.mock('./AdminPanel.jsx', () => ({
  default: () => <div>Panel verifikasi dan laporan lama</div>,
}));

import OwnerControlCenter from './OwnerControlCenter.jsx';

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('OwnerControlCenter', () => {
  it('menampilkan angka ringkasan dari hasil agregasi Firestore', async () => {
    render(<OwnerControlCenter db={{}} user={{ uid: 'owner-1', displayName: 'Pemilik' }} onNotice={vi.fn()}/>);

    expect(await screen.findByText('17')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('31')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('membuka modul verifikasi dan laporan yang sudah tersedia', async () => {
    render(<OwnerControlCenter db={{}} user={{ uid: 'owner-1' }} onNotice={vi.fn()}/>);
    await waitFor(() => expect(screen.getByText('Dashboard Utama')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Verifikasi & laporan/ }));
    expect(screen.getByText('Panel verifikasi dan laporan lama')).toBeTruthy();
  });
});
