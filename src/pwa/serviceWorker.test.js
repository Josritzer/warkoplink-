import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceWorker = readFileSync('public/sw.js', 'utf8');
const appSource = readFileSync('src/App.jsx', 'utf8');

describe('PWA cache freshness', () => {
  it('uses a new cache namespace so previously cached shell assets are discarded', () => {
    expect(serviceWorker).toContain("const CACHE_NAME = 'warkoplink-shell-v2';");
    expect(serviceWorker).toContain("keys.filter((key) => key !== CACHE_NAME)");
  });

  it('fetches JavaScript and CSS from the network first with cache fallback for offline use', () => {
    expect(serviceWorker).toContain("['script', 'style'].includes(request.destination)");
    expect(serviceWorker).toContain("fetch(request)");
    expect(serviceWorker).toContain("caches.match(request)");
    expect(serviceWorker).toContain("request.destination === 'image' || request.destination === 'font'");
  });

  it('asks the browser to bypass HTTP cache when checking for service worker updates', () => {
    expect(appSource).toContain("register('/sw.js', { updateViaCache: 'none' })");
    expect(appSource).toContain('registration.update()');
  });

  it('reloads a controlled page once when the new service worker takes control', () => {
    expect(appSource).toContain("addEventListener('controllerchange'");
    expect(appSource).toContain('let refreshing = false');
    expect(appSource).toContain('if (!refreshing) {');
  });
});
