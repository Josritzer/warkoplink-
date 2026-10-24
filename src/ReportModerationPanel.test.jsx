import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({ listeners: [], writes: [], batchCommit: vi.fn() }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, name) => ({ name })),
  doc: vi.fn((db, name, id) => { const collectionName = typeof name === 'string' ? name : db?.name; return { name: collectionName, id: id || 'generated', path: `${collectionName}/${id || 'generated'}` }; }),
  getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ body: 'Isi pesan yang dilaporkan' }) })),
  limit: vi.fn((n) => ({ limit: n })),
  onSnapshot: vi.fn((q, next, error) => {
    state.listeners.push({ q, next, error });
    if (q?.args?.[0]?.name === 'postReports') {
      next({ docs: [{ id: 'post-1-user-2', data: () => ({
        targetPostId: 'post-1', targetAuthorId: 'author-1', reporterUid: 'user-2',
        reason: 'Spam atau promosi berulang', createdAt: null,
      }) }] });
    } else if (q?.args?.[0]?.name === 'postReportModeration') {
      next({ docs: [] });
    } else {
      next({ docs: [] });
    }
    return vi.fn();
  }),
  orderBy: vi.fn((...args) => ({ orderBy: args })),
  query: vi.fn((...args) => ({ args })),
  serverTimestamp: vi.fn(() => '__SERVER_TS__'),
  writeBatch: vi.fn(() => ({
    set: (...args) => state.writes.push(args),
    commit: () => state.batchCommit(),
  })),
}));

import * as fs from 'firebase/firestore';
import ReportModerationPanel from './ReportModerationPanel.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  state.listeners = [];
  state.writes = [];
  state.batchCommit.mockResolvedValue(undefined);
  fs.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ body: 'Isi pesan yang dilaporkan' }) });
});

afterEach(() => cleanup());

describe('ReportModerationPanel', () => {
  it('menampilkan laporan, alasan, dan isi pesan asli', async () => {
    render(<ReportModerationPanel db={{}} user={{ uid: 'admin-1' }} onNotice={vi.fn()} />);
    expect(await screen.findByText('Spam atau promosi berulang')).toBeTruthy();
    expect(await screen.findByText('Isi pesan yang dilaporkan')).toBeTruthy();
    expect(screen.getByText('BARU')).toBeTruthy();
  });

  it('menyimpan perubahan status dan audit dalam satu batch', async () => {
    const onNotice = vi.fn();
    render(<ReportModerationPanel db={{}} user={{ uid: 'admin-1' }} onNotice={onNotice} />);
    fireEvent.click(await screen.findByRole('button', { name: /Tandai ditinjau/ }));
    await waitFor(() => expect(state.writes).toHaveLength(2));
    expect(state.writes[0][0].path).toContain('postReportModeration/');
    expect(state.writes[1][0].path).toContain('postReportAudit/');
    expect(state.writes[0][1]).toMatchObject({ status: 'Ditinjau', updatedBy: 'admin-1' });
    expect(state.writes[1][1]).toMatchObject({
      previousStatus: 'Baru', newStatus: 'Ditinjau', actorUid: 'admin-1', note: '',
    });
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith('Status laporan diperbarui dan catatan audit tersimpan.'));
  });

  it('menampilkan keterangan bila postingan asli tidak tersedia', async () => {
    fs.getDoc.mockResolvedValue({ exists: () => false });
    render(<ReportModerationPanel db={{}} user={{ uid: 'admin-1' }} onNotice={vi.fn()} />);
    expect(await screen.findByText(/Postingan asli sudah tidak tersedia/)).toBeTruthy();
  });
});
