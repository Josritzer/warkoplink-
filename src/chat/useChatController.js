// Pengendali panel obrolan: semua state dan aksi (kirim, laporkan, hapus) ada di sini.
// ChatPanel hanya menampilkan apa yang dikembalikan hook ini, sehingga tampilan bisa diuji
// tanpa Firebase dan logika bisa diubah tanpa menyentuh JSX.
//
// Hook dipanggil di App (bukan di ChatPanel) agar draf, filter, dan langganan data tetap ada
// saat pengguna berpindah menu lalu kembali ke Obrolan.
import { useMemo, useState } from 'react';
import {
  DEFAULT_REPORT_REASON, POST_COOLDOWN_MS, POST_TOPICS, deleteErrorMessage, filterPosts, isOwnPost,
  postErrorMessage, reportErrorMessage, validatePostBody, validateReportReason
} from '../lib.js';
import { deletePost, publishPost, reportPost } from '../services/chatService.js';
import { ensureProfile } from '../services/profileService.js';
import { useChatFeed, useCooldown } from './hooks.js';

export function useChatController({ db, user, onRequestAuth, onNotice }) {
  const feed = useChatFeed(db);
  const cooldown = useCooldown();

  const [topic, setTopic] = useState('Semua');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [composerTopic, setComposerTopic] = useState(POST_TOPICS[0]);
  const [posting, setPosting] = useState(false);
  const [reportingPostId, setReportingPostId] = useState('');
  const [reportReason, setReportReason] = useState(DEFAULT_REPORT_REASON);
  const [reporting, setReporting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState('');
  const [deletingId, setDeletingId] = useState('');

  const visiblePosts = useMemo(() => filterPosts(feed.posts, topic, search), [feed.posts, topic, search]);

  // Mengarahkan pengunjung ke dialog masuk bila belum login.
  function requireSignIn(message) {
    if (user) return true;
    onRequestAuth();
    onNotice(message);
    return false;
  }

  async function submitPost(event) {
    event.preventDefault();
    // Penjaga untuk pengiriman lewat papan ketik (Ctrl/Cmd+Enter), yang tidak melewati tombol nonaktif.
    if (posting || cooldown.remaining > 0) return;
    if (!requireSignIn('Masuk atau buat akun terlebih dahulu untuk mengirim obrolan.')) return;
    const bodyCheck = validatePostBody(draft);
    if (!bodyCheck.ok) return onNotice(bodyCheck.error);
    if (!db) return onNotice('Firebase belum dikonfigurasi.');
    setPosting(true);
    try {
      // Aturan keamanan mencocokkan nama penulis dengan profil, jadi pastikan profil ada.
      const hasProfile = await ensureProfile(db, user);
      if (!hasProfile) {
        onNotice('Profil Anda belum tersimpan sehingga pesan belum dapat dikirim. Coba lagi sebentar lagi.');
        return;
      }
      await publishPost(db, user, { body: bodyCheck.value, topic: composerTopic });
      setDraft('');
      cooldown.start(POST_COOLDOWN_MS);
      onNotice('Obrolan berhasil dipublikasikan. Tunggu 10 detik sebelum mengirim pesan berikutnya.');
    } catch (error) {
      onNotice(postErrorMessage(error));
    } finally {
      setPosting(false);
    }
  }

  function toggleReport(post) {
    if (!requireSignIn('Masuk terlebih dahulu untuk melaporkan obrolan.')) return;
    setConfirmDeleteId('');
    setReportingPostId((current) => (current === post.id ? '' : post.id));
    setReportReason(DEFAULT_REPORT_REASON);
  }

  function closeReport() {
    setReportingPostId('');
  }

  async function submitReport(event, post) {
    event.preventDefault();
    if (!requireSignIn('Masuk terlebih dahulu untuk melaporkan obrolan.')) return;
    if (!db || !post?.id || !validateReportReason(reportReason)) {
      onNotice('Laporan belum dapat dikirim. Periksa pilihan alasan lalu coba lagi.');
      return;
    }
    setReporting(true);
    try {
      await reportPost(db, user, post, reportReason);
      setReportingPostId('');
      setReportReason(DEFAULT_REPORT_REASON);
      onNotice('Laporan terkirim kepada admin untuk ditinjau.');
    } catch (error) {
      onNotice(reportErrorMessage(error));
    } finally {
      setReporting(false);
    }
  }

  function askDelete(post) {
    setReportingPostId('');
    setConfirmDeleteId(post.id);
  }

  function cancelDelete() {
    setConfirmDeleteId('');
  }

  async function confirmDelete(post) {
    if (!user || !db || deletingId || !isOwnPost(post, user)) return;
    setDeletingId(post.id);
    try {
      await deletePost(db, post.id);
      setConfirmDeleteId('');
      onNotice('Obrolan Anda sudah dihapus.');
    } catch (error) {
      onNotice(deleteErrorMessage(error));
    } finally {
      setDeletingId('');
    }
  }

  return {
    // data
    status: feed.status,
    visiblePosts,
    totalPosts: feed.posts.length,
    reload: feed.reload,
    // filter
    topic, setTopic, search, setSearch,
    // penulisan
    draft, setDraft, composerTopic, setComposerTopic, posting,
    cooldownRemaining: cooldown.remaining, submitPost,
    // laporan
    reportingPostId, reportReason, setReportReason, reporting, toggleReport, closeReport, submitReport,
    // hapus
    confirmDeleteId, deletingId, askDelete, cancelDelete, confirmDelete
  };
}
