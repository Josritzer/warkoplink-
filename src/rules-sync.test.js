// Menjaga konstanta di kode tetap sama dengan firestore.rules. Rules adalah batas keamanan
// sebenarnya; bila daftar di kode berbeda, pengguna akan melihat error "ditolak" yang membingungkan.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_POST_LENGTH, POST_COOLDOWN_MS, POST_TOPICS, REPORT_REASONS } from './lib.js';

const rules = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../firestore.rules'), 'utf8');
const asRulesList = (items) => `[${items.map((item) => `'${item}'`).join(', ')}]`;

describe('konstanta kode sama dengan firestore.rules', () => {
  it('kategori obrolan', () => {
    expect(rules).toContain(asRulesList(POST_TOPICS));
  });
  it('alasan laporan', () => {
    expect(rules).toContain(asRulesList(REPORT_REASONS));
  });
  it('batas panjang pesan', () => {
    expect(rules).toContain(`data.body.size() <= ${MAX_POST_LENGTH}`);
  });
  it('jeda antar pesan', () => {
    expect(rules).toContain(`duration.value(${POST_COOLDOWN_MS / 1000}, 's')`);
  });
});
