import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, name) => ({ name })),
  getDocs: vi.fn(async (target) => ({
    docs: target.args[0].name === 'verificationAudit' ? [] : [
      { id: 'warung-1', data: () => ({ name: 'Kopi Maduran', verificationStatus: 'verified', villageName: 'Maduran', specialties: ['Kopi susu'], createdAt: null }) },
      { id: 'warung-2', data: () => ({ name: 'Warkop Paciran', verificationStatus: 'pending', villageName: 'Paciran', createdAt: null }) },
    ],
  })),
  limit: vi.fn((value) => ({ limit: value })),
  orderBy: vi.fn((...args) => ({ orderBy: args })),
  query: vi.fn((...args) => ({ args })),
  startAfter: vi.fn((value) => ({ startAfter: value })),
  where: vi.fn((...args) => ({ where: args })),
}));

import OwnerWarungManagement from './OwnerWarungManagement.jsx';

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('OwnerWarungManagement', () => {
  it('menampilkan direktori dan status dari koleksi warungs', async () => {
    render(<OwnerWarungManagement db={{}}/>);
    expect(await screen.findByText('Kopi Maduran')).toBeTruthy();
    expect(screen.getByText('Warkop Paciran')).toBeTruthy();
    expect(screen.getAllByText('Terverifikasi').some((element) => element.classList.contains('owner-warung-status'))).toBe(true);
  });

  it('membuka detail baca-saja dan riwayat verifikasi', async () => {
    render(<OwnerWarungManagement db={{}}/>);
    fireEvent.click(await screen.findByText('Kopi Maduran'));
    expect(screen.getByText('DETAIL DIREKTORI')).toBeTruthy();
    expect(screen.getByText('Kopi susu')).toBeTruthy();
    expect(screen.getByText('Riwayat verifikasi')).toBeTruthy();
  });

  it('mendukung pencarian pada halaman yang dimuat', async () => {
    render(<OwnerWarungManagement db={{}}/>);
    await screen.findByText('Kopi Maduran');
    fireEvent.change(screen.getByRole('textbox', { name: 'Cari warkop' }), { target: { value: 'Paciran' } });
    expect(screen.getByText('Warkop Paciran')).toBeTruthy();
    expect(screen.queryByText('Kopi Maduran')).toBeNull();
  });
});
