// Hook kecil untuk panel obrolan. Tidak ada UI di sini.
import { useCallback, useEffect, useState } from 'react';
import { subscribeToPosts } from '../services/chatService.js';

// Mendengarkan obrolan terbaru. `reload` memulai ulang langganan setelah error.
export function useChatFeed(db) {
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState(db ? 'loading' : 'ready');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!db) return undefined;
    setStatus('loading');
    return subscribeToPosts(
      db,
      (rows) => { setPosts(rows); setStatus('ready'); },
      () => setStatus('error')
    );
  }, [db, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { posts, status, reload };
}

// Hitung mundur jeda antar pesan. `start(ms)` memulai, `remaining` dalam detik (0 = siap kirim).
export function useCooldown() {
  const [until, setUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!until) { setRemaining(0); return undefined; }
    const tick = () => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setUntil(0);
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [until]);

  const start = useCallback((ms) => setUntil(Date.now() + ms), []);
  return { remaining, start };
}

// Penanda waktu yang diperbarui tiap menit agar "5 menit lalu" tidak basi.
export function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
