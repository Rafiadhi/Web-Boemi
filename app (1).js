/* TATAKAS app.js - dibuat dari 5 bagian (core, ui, views) */
(() => {
'use strict';

/* =====================================================================
   TATAKAS - Penataan uang usaha: HPP, stok, bahan, penjualan, nota, invoice
   Bagian 1: util, penyimpanan data, hitungan, sinkron cloud, kode akses
   ===================================================================== */
const CFG = window.TATAKAS_CONFIG || {};
const CLOUD = !!(CFG.SUPABASE_URL && CFG.SUPABASE_KEY);
const PV = !!CFG.PREVIEW; /* pratinjau di dalam halaman Claude: tanpa hash-router, tanpa print */
const KINDS = ['pengaturan', 'bahan', 'produk', 'pelanggan', 'penjualan', 'pengeluaran', 'mutasi', 'produksi'];
const KAT = [
  { k: 'Belanja Bahan', inv: true }, { k: 'Kemasan', inv: true }, { k: 'Gaji / Upah' },
  { k: 'Listrik, Air, Gas' }, { k: 'Sewa' }, { k: 'Transport / Ongkir' },
  { k: 'Iklan / Promo' }, { k: 'Peralatan' }, { k: 'Lainnya' }
];
const METODE = ['Tunai', 'Transfer', 'QRIS', 'E-Wallet'];
const SATUAN = ['gram', 'kg', 'ml', 'liter', 'pcs', 'butir', 'pack', 'sachet', 'botol', 'cup'];
const DEFAULTS = {
  id: 'main', nama: 'Kedai Kopi Boemi', alamat: '', hp: '', email: '', ig: '', logo: 'logo.jpg', tplDone: false,
  bank: '', noRek: '', an: '', prefix: 'INV', pajak: 0,
  terima: 'TERIMA KASIH BANYAK\nATAS KEPERCAYAAN ANDA', kontak: 'CONTACT ME :',
  catatanInv: '', notaFooter: 'Terima kasih sudah berbelanja!', targetOmzet: 0, saldoAwal: 0
};

/* ---------- util ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const n0 = v => { const x = Number(v); return isFinite(x) ? x : 0; };
const r4 = v => Math.round(v * 10000) / 10000;
const rp = v => { v = Math.round(n0(v)); return (v < 0 ? '-' : '') + 'Rp ' + Math.abs(v).toLocaleString('id-ID'); };
const num = v => (n0(v)).toLocaleString('id-ID');
const rpNum = v => Number(String(v ?? '').replace(/\D/g, '')) || 0;        // "1.250.000" -> 1250000
const dec = v => { const x = parseFloat(String(v ?? '').trim().replace(',', '.')); return isFinite(x) ? x : 0; };
const fq = v => (+n0(v).toFixed(2)).toLocaleString('id-ID');               // qty maksimal 2 desimal
const short = v => { const a = Math.abs(v), s = v < 0 ? '-' : ''; if (a >= 1e9) return s + +(a / 1e9).toFixed(1) + 'M'; if (a >= 1e6) return s + +(a / 1e6).toFixed(1) + 'jt'; if (a >= 1e3) return s + Math.round(a / 1e3) + 'rb'; return s + Math.round(a); };
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const hm = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const parseYmd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const fdate = s => { if (!s) return '-'; const d = parseYmd(s); return `${d.getDate()} ${BLN[d.getMonth()]} ${d.getFullYear()}`; };
const fdateNum = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const fdayShort = s => { const d = parseYmd(s); return `${HARI[d.getDay()]}, ${d.getDate()} ${BLN[d.getMonth()]}`; };
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* abaikan */ } }
};
const phoneIntl = p => { p = String(p || '').replace(/\D/g, ''); if (!p) return ''; if (p.startsWith('0')) return '62' + p.slice(1); if (p.startsWith('8')) return '62' + p; return p; };

/* ---------- SHA-256 (murni JS, supaya jalan di http/https/file) ---------- */
function sha256(msg) {
  const bytes = unescape(encodeURIComponent(msg));
  const K = [], H = [];
  const comp = n => { for (let i = 2; i * i <= n; i++) if (n % i === 0) return true; return false; };
  for (let c = 2, n = 0; n < 64; c++) {
    if (!comp(c)) { if (n < 8) H[n] = (Math.pow(c, 1 / 2) * 4294967296) | 0; K[n++] = (Math.pow(c, 1 / 3) * 4294967296) | 0; }
  }
  const len = bytes.length, nW = (((len + 8) >> 6) + 1) * 16, w = new Array(nW).fill(0);
  for (let i = 0; i < len; i++) w[i >> 2] |= bytes.charCodeAt(i) << ((3 - (i & 3)) * 8);
  w[len >> 2] |= 0x80 << ((3 - (len & 3)) * 8);
  w[nW - 1] = len * 8;
  const ror = (x, n) => (x >>> n) | (x << (32 - n));
  let h = H.slice(0);
  for (let j = 0; j < nW; j += 16) {
    const ww = new Array(64), old = h.slice(0);
    for (let t = 0; t < 64; t++) {
      if (t < 16) ww[t] = w[j + t] | 0;
      else {
        const a = ww[t - 15], b = ww[t - 2];
        ww[t] = (ww[t - 16] + (ror(a, 7) ^ ror(a, 18) ^ (a >>> 3)) + ww[t - 7] + (ror(b, 17) ^ ror(b, 19) ^ (b >>> 10))) | 0;
      }
      const a = h[0], e = h[4];
      const t1 = (h[7] + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & h[5]) ^ (~e & h[6])) + K[t] + ww[t]) | 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]))) | 0;
      h = [(t1 + t2) | 0, a, h[1], h[2], (h[3] + t1) | 0, e, h[5], h[6]];
    }
    for (let i = 0; i < 8; i++) h[i] = (h[i] + old[i]) | 0;
  }
  return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

/* =====================================================================
   PENYIMPANAN DATA
   Semua catatan = { id, _u (waktu ubah), _d (true bila dihapus), ...isi }
   Sumber kebenaran = cloud. localStorage hanya cache supaya cepat & tahan offline.
   Stok TIDAK disimpan sebagai angka, tapi dihitung dari riwayat "mutasi"
   (catatan yang hanya bertambah) -> HP & laptop tidak bisa saling menimpa stok.
   ===================================================================== */
const DB = {}, dirty = new Set();
let WS = null, cursor = null, hold = 0, pending = false, pt = null;
const X = { stokBahan: {}, stokProduk: {} };
const hooks = { change() { }, remote() { }, sync() { } };
const SYNC = { state: CLOUD ? 'idle' : 'local', last: null, err: '', busy: false, again: false, timer: null, poll: null };

function resetDB() { KINDS.forEach(k => DB[k] = {}); dirty.clear(); cursor = null; recalc(); }
const ckey = () => 'tk_cache_' + String(WS).slice(0, 20);
function persistSoon() { clearTimeout(pt); pt = setTimeout(persist, 350); }
function persist() {
  if (!WS) return;
  LS.set(ckey(), JSON.stringify({ v: 1, recs: DB, cursor, dirty: [...dirty] }));
}
function loadCache() {
  const raw = LS.get(ckey()); if (!raw) return false;
  try {
    const j = JSON.parse(raw);
    KINDS.forEach(k => DB[k] = (j.recs && j.recs[k]) || {});
    cursor = j.cursor || null; dirty.clear(); (j.dirty || []).forEach(k => dirty.add(k)); recalc();
    return true;
  } catch (e) { return false; }
}
window.addEventListener('pagehide', persist);

const all = k => Object.values(DB[k]).filter(r => !r._d);
const get = (k, id) => { const r = DB[k][id]; return r && !r._d ? r : null; };
function put(kind, rec) {
  rec.id = rec.id || uid(); rec._u = Date.now(); delete rec._d;
  DB[kind][rec.id] = rec; dirty.add(kind + ':' + rec.id); changed(); return rec;
}
function del(kind, id) {
  if (!DB[kind][id]) return;
  DB[kind][id] = { id, _u: Date.now(), _d: true }; dirty.add(kind + ':' + id); changed();
}
function changed() {
  if (hold) { pending = true; return; }
  pending = false; recalc(); persistSoon(); syncSoon(); hooks.change();
}
function batch(fn) { hold++; try { fn(); } finally { hold--; if (!hold && pending) changed(); } }

function recalc() {
  const sb = {}, sp = {};
  for (const m of all('mutasi')) { const t = m.tipe === 'bahan' ? sb : sp; t[m.item] = (t[m.item] || 0) + n0(m.qty); }
  for (const k in sb) sb[k] = r4(sb[k]);
  for (const k in sp) sp[k] = r4(sp[k]);
  X.stokBahan = sb; X.stokProduk = sp;
}
const stokB = id => X.stokBahan[id] || 0;
const stokP = id => X.stokProduk[id] || 0;
const S = () => { const s = DB.pengaturan.main; return Object.assign({}, DEFAULTS, s && !s._d ? s : {}); };
const setS = patch => put('pengaturan', Object.assign({}, S(), patch, { id: 'main' }));

/* ---------- hitungan ---------- */
const hargaSat = b => n0(b.isi) > 0 ? n0(b.harga) / n0(b.isi) : 0;
const pname = p => p ? (p.nama + (p.rasa ? ' · ' + p.rasa : '')) : '';
const pdesc = p => p ? (p.nama + (p.rasa ? ' ' + p.rasa : '')) : '';
function hppRincian(p) {
  const rows = [];
  for (const r of p.resep || []) {
    const b = get('bahan', r.b); if (!b) continue;
    rows.push({ b, q: n0(r.q), biaya: n0(r.q) * hargaSat(b) });
  }
  const bahan = rows.reduce((a, r) => a + r.biaya, 0), y = n0(p.yield) > 0 ? n0(p.yield) : 1;
  return { rows, bahan, y, perUnit: bahan / y, lain: n0(p.biayaLain), hpp: bahan / y + n0(p.biayaLain) };
}
const hppProduk = p => hppRincian(p).hpp;

/* bahan -> bisa jadi berapa cup: isi manual (b.cup) atau perkiraan dari resep */
function cupDariResep(b) {
  const isi = n0(b.isi), qs = [];
  for (const p of all('produk')) { const r = (p.resep || []).find(x => x.b === b.id); if (r && n0(r.q) > 0) qs.push(n0(r.q) / (n0(p.yield) > 0 ? n0(p.yield) : 1)); }
  return qs.length && isi > 0 ? isi / (qs.reduce((a, c) => a + c, 0) / qs.length) : 0;
}
const cupKemasan = b => n0(b.cup) > 0 ? n0(b.cup) : cupDariResep(b);
const cupSisa = b => { const isi = n0(b.isi), c = cupKemasan(b); return isi > 0 && c > 0 ? Math.max(0, stokB(b.id)) / isi * c : 0; };
const cupTxt = v => v > 0 ? '≈ ' + Math.floor(v + 1e-9).toLocaleString('id-ID') + ' cup' : '-';
const statusStok = (stok, min) => stok <= 0 ? 'habis' : (n0(min) > 0 && stok <= n0(min) ? 'tipis' : 'aman');
const STOK_LABEL = { habis: 'Habis', tipis: 'Menipis', aman: 'Aman' };

function hitung(s) {
  const items = s.items || [];
  const sub = items.reduce((a, i) => a + n0(i.qty) * n0(i.harga), 0);
  const diskon = Math.min(n0(s.diskon), sub);
  const pajak = Math.round((sub - diskon) * n0(s.pajakPct) / 100);
  const ongkir = n0(s.ongkir);
  const omzet = sub - diskon + ongkir;
  const total = omzet + pajak;
  const paid = (s.bayar || []).reduce((a, b) => a + n0(b.jumlah), 0);
  const sisa = Math.max(0, total - paid);
  const hpp = items.reduce((a, i) => a + n0(i.qty) * n0(i.hpp), 0);
  let st = 'belum';
  if (s.batal) st = 'batal'; else if (sisa <= 0) st = 'lunas'; else if (paid > 0) st = 'cicil';
  return { sub, diskon, pajak, ongkir, omzet, total, paid, sisa, hpp, laba: omzet - hpp, st };
}
const ST_LABEL = { lunas: 'Lunas', cicil: 'DP / Cicil', belum: 'Belum Bayar', batal: 'Batal' };

function rangeOf(p) {
  const t = today(), d = parseYmd(t);
  if (p === 'hari') return [t, t];
  if (p === 'minggu') return [addDays(t, -6), t];
  if (p === 'bulan') return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), t];
  if (p === 'lalu') return [ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), ymd(new Date(d.getFullYear(), d.getMonth(), 0))];
  return ['0000-00-00', '9999-99-99'];
}
const PERIODE = [['hari', 'Hari ini'], ['minggu', '7 Hari'], ['bulan', 'Bulan ini'], ['lalu', 'Bulan lalu'], ['semua', 'Semua']];

function stats(from, to) {
  const inr = d => d >= from && d <= to;
  const st = { omzet: 0, hpp: 0, laba: 0, count: 0, kasMasuk: 0, kasKeluar: 0, biaya: 0, biayaBahan: 0, net: 0, qty: {}, perKat: {} };
  for (const s of all('penjualan')) {
    if (s.batal) continue;
    const c = hitung(s);
    if (inr(s.tgl)) {
      st.omzet += c.omzet; st.hpp += c.hpp; st.count++;
      for (const i of s.items || []) { const k = i.p || ('x:' + i.nama); st.qty[k] = st.qty[k] || { nama: i.nama, rasa: i.rasa, qty: 0, omzet: 0 }; st.qty[k].qty += n0(i.qty); st.qty[k].omzet += n0(i.qty) * n0(i.harga); }
    }
    for (const b of s.bayar || []) if (inr(b.tgl)) st.kasMasuk += n0(b.jumlah);
  }
  for (const e of all('pengeluaran')) {
    if (!inr(e.tgl)) continue;
    st.kasKeluar += n0(e.jumlah);
    const kat = KAT.find(k => k.k === e.kat);
    if (kat && kat.inv) st.biayaBahan += n0(e.jumlah); else st.biaya += n0(e.jumlah);
    st.perKat[e.kat || 'Lainnya'] = (st.perKat[e.kat || 'Lainnya'] || 0) + n0(e.jumlah);
  }
  st.laba = st.omzet - st.hpp; st.net = st.laba - st.biaya;
  return st;
}
function totalPiutang() { let t = 0; for (const s of all('penjualan')) if (!s.batal) t += hitung(s).sisa; return t; }
function nilaiStok() {
  let t = 0;
  for (const b of all('bahan')) t += Math.max(0, stokB(b.id)) * hargaSat(b);
  for (const p of all('produk')) t += Math.max(0, stokP(p.id)) * hppProduk(p);
  return t;
}
function saldoKas() {
  let t = n0(S().saldoAwal);
  for (const s of all('penjualan')) if (!s.batal) for (const b of s.bayar || []) t += n0(b.jumlah);
  for (const e of all('pengeluaran')) t -= n0(e.jumlah);
  return t;
}
const salesSorted = () => all('penjualan').sort((a, b) => (b.tgl + (b.jam || '')).localeCompare(a.tgl + (a.jam || '')) || b._u - a._u);

/* ---------- mutasi stok ---------- */
function mut(jenis, tipe, item, qty, ref, tgl, ket) {
  if (!qty) return null;
  return put('mutasi', { jenis, tipe, item, qty: r4(qty), ref: ref || '', tgl: tgl || today(), ket: ket || '' });
}
function delMutByRef(ref) { for (const m of all('mutasi')) if (m.ref === ref) del('mutasi', m.id); }
function rebuildSaleMut(s) {
  delMutByRef(s.id);
  if (s.batal) return;
  for (const i of s.items || []) if (i.p && get('produk', i.p)) mut('jual', 'produk', i.p, -n0(i.qty), s.id, s.tgl, 'Nota ' + (s.no || ''));
}
function nextNo(tgl) {
  const pre = (S().prefix || 'INV').trim() || 'INV';
  const ym = tgl.slice(2, 4) + tgl.slice(5, 7), have = new Set(all('penjualan').map(s => s.no));
  let n = all('penjualan').filter(s => (s.tgl || '').slice(0, 7) === tgl.slice(0, 7)).length + 1, no;
  do { no = `${pre}-${ym}-${String(n++).padStart(3, '0')}`; } while (have.has(no));
  return no;
}

/* =====================================================================
   SINKRON CLOUD (Supabase via fungsi rec_pull / rec_push)
   ===================================================================== */
const tsMs = s => Date.parse(String(s).replace(/(\.\d{3})\d+/, '$1'));
const shiftIso = (s, ms) => new Date(tsMs(s) + ms).toISOString();
const splitKey = k => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; };
function setSync(state, err) { SYNC.state = state; SYNC.err = err || ''; hooks.sync(); }
function apiHeaders() {
  const h = { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_KEY };
  if (/^eyJ/.test(CFG.SUPABASE_KEY)) h.Authorization = 'Bearer ' + CFG.SUPABASE_KEY;
  return h;
}
async function rpc(fn, body) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 25000);
  try {
    const res = await fetch(CFG.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers: apiHeaders(), body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) {
      let msg = ''; try { const j = await res.json(); msg = j.message || j.hint || ''; } catch (e) { /* abaikan */ }
      throw new Error(msg || ('HTTP ' + res.status));
    }
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Koneksi terlalu lama');
    throw e;
  } finally { clearTimeout(to); }
}
async function pushAll() {
  while (dirty.size) {
    const keys = [...dirty].slice(0, 100), snap = {}, rows = [];
    for (const k of keys) {
      const [kind, id] = splitKey(k), rec = DB[kind] && DB[kind][id];
      if (!rec) { dirty.delete(k); continue; }
      snap[k] = rec._u; rows.push({ kind, id, data: rec, deleted: !!rec._d });
    }
    if (!rows.length) continue;
    await rpc('rec_push', { p_ws: WS, p_rows: rows });
    for (const k of keys) { const [kind, id] = splitKey(k); if (DB[kind][id] && DB[kind][id]._u === snap[k]) dirty.delete(k); }
    persistSoon();
  }
}
function applyRemote(r) {
  if (!DB[r.kind]) return false;
  if (dirty.has(r.kind + ':' + r.id)) return false;            // perubahan lokal yang belum terkirim menang
  const cur = DB[r.kind][r.id], rec = r.data || {};
  rec.id = r.id; if (r.deleted) rec._d = true; else delete rec._d;
  if (cur && cur._u === rec._u && !!cur._d === !!rec._d) return false;
  DB[r.kind][r.id] = rec; return true;
}
async function pullAll(full) {
  let since = (!full && cursor) ? shiftIso(cursor, -15000) : null, applied = 0, maxTs = cursor;
  for (; ;) {
    const rows = await rpc('rec_pull', { p_ws: WS, p_since: since, p_limit: 500 });
    for (const r of rows) { if (applyRemote(r)) applied++; if (!maxTs || tsMs(r.updated_at) > tsMs(maxTs)) maxTs = r.updated_at; }
    if (rows.length < 500) break;
    since = rows[rows.length - 1].updated_at;
  }
  cursor = maxTs; return applied;
}
async function syncNow(opt) {
  if (!CLOUD || !WS) return 0;
  if (SYNC.busy) { SYNC.again = true; return 0; }
  SYNC.busy = true; setSync('sync');
  let n = 0;
  try {
    await pushAll();
    n = await pullAll(opt && opt.full);
    SYNC.last = Date.now(); setSync('ok');
    if (n) { recalc(); persistSoon(); hooks.remote(); }
    persistSoon();
  } catch (e) {
    setSync(navigator.onLine === false ? 'offline' : 'error', e.message);
  } finally {
    SYNC.busy = false;
    if (SYNC.again) { SYNC.again = false; syncSoon(400); }
  }
  return n;
}
function syncSoon(ms) { if (!CLOUD || !WS) return; clearTimeout(SYNC.timer); SYNC.timer = setTimeout(() => syncNow(), ms || 900); }
function startPolling() {
  clearInterval(SYNC.poll);
  SYNC.poll = setInterval(() => { if (!document.hidden) syncNow(); }, 20000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && WS) syncNow(); });
window.addEventListener('online', () => { if (WS) syncNow(); });
window.addEventListener('offline', () => { if (WS && CLOUD) setSync('offline'); });

/* ---------- kode akses / ruang kerja ---------- */
const wsFromCode = code => sha256('tatakas|' + String(code).trim());
async function openWorkspace(code, askNew) {
  const ws = wsFromCode(code);
  resetDB(); WS = ws;
  const hadCache = loadCache();
  if (CLOUD) {
    try {
      await pushAll();
      await pullAll(!hadCache);
      SYNC.last = Date.now(); setSync('ok');
    } catch (e) {
      if (!hadCache) { WS = null; resetDB(); throw new Error('Tidak bisa terhubung ke cloud: ' + e.message); }
      setSync(navigator.onLine === false ? 'offline' : 'error', e.message);
    }
  }
  recalc();
  const total = KINDS.reduce((a, k) => a + Object.keys(DB[k]).length, 0);
  if (total === 0 && CLOUD && askNew && !(await askNew())) { WS = null; resetDB(); return false; }
  LS.set('tk_ws', ws);
  if (!DB.pengaturan.main || DB.pengaturan.main._d) put('pengaturan', Object.assign({}, DEFAULTS));
  persist(); startPolling();
  return true;
}
async function resumeWorkspace() {
  const ws = LS.get('tk_ws'); if (!ws || !/^[0-9a-f]{64}$/.test(ws)) return false;
  resetDB(); WS = ws;
  const had = loadCache();
  if (!had && CLOUD) {
    try { await pullAll(true); SYNC.last = Date.now(); setSync('ok'); }
    catch (e) { WS = null; resetDB(); return false; }
  }
  recalc(); startPolling(); if (CLOUD) syncSoon(300);
  return true;
}
function logout(wipe) {
  if (WS && wipe) LS.del(ckey());
  LS.del('tk_ws'); clearInterval(SYNC.poll); clearTimeout(SYNC.timer); WS = null; resetDB();
}

/* ---------- ekspor / impor ---------- */
function exportAll() {
  const data = {}; KINDS.forEach(k => data[k] = all(k));
  return { app: 'tatakas', v: 1, at: new Date().toISOString(), data };
}
function importAll(obj) {
  if (!obj || obj.app !== 'tatakas' || !obj.data) throw new Error('File bukan backup TATAKAS');
  let n = 0;
  batch(() => {
    for (const k of KINDS) for (const r of obj.data[k] || []) { if (!r || !r.id) continue; const x = Object.assign({}, r); put(k, x); n++; }
  });
  return n;
}
function csvSales() {
  const rows = [['No', 'Tanggal', 'Pelanggan', 'Item', 'Omzet', 'HPP', 'Laba', 'Total Tagihan', 'Dibayar', 'Sisa', 'Status']];
  for (const s of salesSorted()) {
    const c = hitung(s);
    rows.push([s.no, s.tgl, s.pelangganNama || 'Umum', (s.items || []).map(i => `${i.qty}x ${i.nama}${i.rasa ? ' ' + i.rasa : ''}`).join('; '), c.omzet, Math.round(c.hpp), Math.round(c.laba), c.total, c.paid, c.sisa, ST_LABEL[c.st]]);
  }
  return rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
}

/* ---------- data contoh ---------- */
/* ---------- data awal Kedai Kopi Boemi ---------- */
/* nama, satuan, harga/kemasan, isi/kemasan, jadi berapa cup (0 = otomatis dari resep), stok minimum, stok awal  -> angka hanya CONTOH */
const BOEMI_BAHAN = [
  ['Creamer', 'gram', 38000, 1000, 0, 300, 2500],
  ['Chi Forest', 'gram', 105000, 1000, 0, 500, 3200],
  ['Espresso', 'gram', 130000, 1000, 55, 400, 1600],
  ['Susu Kental Manis', 'gram', 17000, 370, 0, 370, 1850],
  ['Lemon Sirup', 'gram', 55000, 750, 25, 300, 1500],
  ['Strawberry Sirup', 'gram', 55000, 750, 0, 500, 450]
];
/* nama, rasa, harga jual, resep (gram per 1 cup) -> angka hanya CONTOH */
const BOEMI_MENU = [
  ['Kopi Susu', 'Original', 15000, { 'Espresso': 18, 'Susu Kental Manis': 30, 'Creamer': 10 }],
  ['Kopi Susu', 'Pisang', 18000, { 'Espresso': 18, 'Creamer': 10, 'Chi Forest': 50, 'Susu Kental Manis': 15 }],
  ['Kopi Susu', 'Strawberry', 18000, { 'Espresso': 18, 'Creamer': 10, 'Strawberry Sirup': 20, 'Susu Kental Manis': 20 }],
  ['Kopi Susu', 'Vanilla', 18000, { 'Espresso': 18, 'Creamer': 10, 'Chi Forest': 30, 'Susu Kental Manis': 20 }],
  ['Coconut', 'Latte', 18000, { 'Espresso': 18, 'Chi Forest': 80, 'Creamer': 10 }],
  ['Coconut', 'Black', 17000, { 'Espresso': 36, 'Chi Forest': 60 }],
  ['Americano', 'Original', 13000, { 'Espresso': 36 }],
  ['Mocktail', 'Lemon', 15000, { 'Lemon Sirup': 30 }]
];
/* withNum=false: hanya nama bahan & menu (angka kosong, diisi sendiri). withNum=true: + angka contoh, stok, nota & pengeluaran contoh. */
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/* id bahan/menu template dibuat tetap (tb-…, tp-…): kalau 2 perangkat sama-sama membuat template, hasilnya menyatu, tidak dobel */
function seedBoemi(withNum) {
  batch(() => {
    const t = today(), byName = {};
    for (const [nama, satuan, harga, isi, cup, min, awal] of BOEMI_BAHAN) {
      const bid = 'tb-' + slug(nama);
      let b = get('bahan', bid) || all('bahan').find(x => x.nama.toLowerCase() === nama.toLowerCase());
      if (!b) {
        b = put('bahan', { id: bid, nama, satuan, harga: withNum ? harga : 0, isi: withNum ? isi : 0, cup: withNum ? cup : 0, stokMin: withNum ? min : 0, catatan: '' });
        if (withNum && awal) mut('awal', 'bahan', b.id, awal, '', t, 'Stok awal');
      } else if (withNum) {
        b = put('bahan', Object.assign({}, b, { harga: n0(b.harga) || harga, isi: n0(b.isi) || isi, cup: n0(b.cup) || cup, stokMin: n0(b.stokMin) || min }));
        if (!stokB(b.id) && awal) mut('awal', 'bahan', b.id, awal, '', t, 'Stok awal');
      }
      byName[nama] = b;
    }
    const prods = [];
    for (const [nama, rasa, harga, resep] of BOEMI_MENU) {
      const rs = Object.keys(resep).map(n => ({ b: byName[n].id, q: resep[n] }));
      const pid = 'tp-' + slug(nama + ' ' + rasa);
      let p = get('produk', pid) || all('produk').find(x => x.nama === nama && (x.rasa || '') === rasa);
      if (!p) {
        p = put('produk', { id: pid, nama, rasa, satuan: 'cup', harga: withNum ? harga : 0, yield: 1, biayaLain: withNum ? 1500 : 0, stokMin: withNum ? 5 : 0, catatan: '', resep: withNum ? rs : [] });
        if (withNum) mut('awal', 'produk', p.id, 12, '', t, 'Stok awal');
      } else if (withNum) {
        p = put('produk', Object.assign({}, p, { harga: n0(p.harga) || harga, biayaLain: n0(p.biayaLain) || 1500, resep: (p.resep || []).length ? p.resep : rs }));
        if (!stokP(p.id)) mut('awal', 'produk', p.id, 12, '', t, 'Stok awal');
      }
      prods.push(p);
    }
    if (withNum && !all('penjualan').length) {
      const find = (n, r) => prods.find(p => p.nama === n && p.rasa === r), it = (p, q) => ({ p: p.id, nama: p.nama, rasa: p.rasa, qty: q, harga: p.harga, hpp: hppProduk(p) });
      const bu = put('pelanggan', { nama: 'Bu Sari', hp: '081234567890', alamat: 'Bandung', catatan: '' });
      const s = { no: nextNo(t), tgl: t, jam: '09:30', jatuhTempo: addDays(t, 7), pelangganId: bu.id, pelangganNama: bu.nama, diskon: 0, ongkir: 10000, pajakPct: 0, metode: 'Transfer', catatan: '', bayar: [], batal: false, items: [it(find('Kopi Susu', 'Strawberry'), 5), it(find('Mocktail', 'Lemon'), 4)] };
      put('penjualan', s); rebuildSaleMut(s);
      const k2 = find('Kopi Susu', 'Original'), k3 = find('Coconut', 'Latte');
      const s2 = { no: nextNo(t), tgl: t, jam: '13:10', jatuhTempo: '', pelangganId: '', pelangganNama: 'Umum', diskon: 0, ongkir: 0, pajakPct: 0, metode: 'Tunai', catatan: '', batal: false, items: [it(k2, 2), it(k3, 1)] };
      s2.bayar = [{ id: uid(), tgl: t, jumlah: hitung(s2).total, metode: 'Tunai', ket: '' }];
      put('penjualan', s2); rebuildSaleMut(s2);
      put('pengeluaran', { tgl: t, kat: 'Listrik, Air, Gas', ket: 'Token listrik', jumlah: 100000, metode: 'Tunai', ref: '' });
      put('pengeluaran', { tgl: t, kat: 'Belanja Bahan', ket: 'Belanja creamer & espresso', jumlah: 350000, metode: 'Tunai', ref: '' });
    }
    const set = S(), patch = { tplDone: true };
    if (withNum && !set.noRek) Object.assign(patch, { bank: 'BCA', noRek: '1234567890', an: 'Kedai Kopi Boemi', hp: set.hp || '081234567890' });
    setS(patch);
  });
}
/* ruang kerja baru -> langsung terisi nama bahan & menu Boemi (sekali saja, tercatat di pengaturan.tplDone) */
function autoTemplate(withNum) {
  if (S().tplDone) return;
  if (!all('bahan').length && !all('produk').length) seedBoemi(withNum); else setS({ tplDone: true });
}

/* =====================================================================
   Bagian 2: kerangka UI - ikon, router, sheet, toast, grafik, event
   ===================================================================== */
const ui = { key: '', form: false, sheet: false, nav: '', period: 'bulan', stokTab: 'produk', uangTab: 'pengeluaran', jualFilter: 'semua', navCount: 0, dirtyView: false };
const A = {}, F = {}, I = {};      // A: aksi klik (data-act) | F: submit form (data-f) | I: input (data-in)

const IC = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  cart: '<path d="M6 7h12l1 13H5z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  flask: '<path d="M10 3h4M11 3v6L5 19a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 19l-6-10V3"/><path d="M7.5 15h9"/>',
  pot: '<path d="M4 11h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M2 11h20M9 7c0-2 2-2 2-4M14 7c0-2 2-2 2-4"/>',
  sliders: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14 4l2-2"/><path d="M20 20v-5h-5"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 10a4 4 0 0 1-.5 8z"/>',
  'cloud-off': '<path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 2-2.6M17.5 18H7M18 10a4 4 0 0 1 1.5 7.7"/><path d="M3 3l18 18"/>',
  printer: '<path d="M7 9V3h10v6M7 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-3"/><rect x="7" y="14" width="10" height="7"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.5"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.5h-3a1.8 1.8 0 0 0 0 3.5h4.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  minus: '<path d="M5 12h14"/>'
};
const ic = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;

/* ---------- toast ---------- */
function toast(msg, kind) {
  const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg;
  $('#toast').appendChild(t); setTimeout(() => t.classList.add('out'), 2300); setTimeout(() => t.remove(), 2800);
}

/* ---------- bottom sheet / dialog ---------- */
let cfResolve = null;
function openSheet(title, body, o = {}) {
  const root = $('#sheets'); cfResolve = null;
  root.innerHTML = `<div class="scrim" data-act="sheet-close"></div><div class="sheet ${o.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="grab"></div><div class="sheet-h"><h2>${esc(title)}</h2><button type="button" class="icon-btn sm" data-act="sheet-close" aria-label="Tutup">${ic('x')}</button></div><div class="sheet-b">${body}</div></div>`;
  root.classList.add('open'); document.body.classList.add('lock'); ui.sheet = true;
  if (o.mount) o.mount(root);
}
function closeSheet() {
  const root = $('#sheets'); root.classList.remove('open'); root.innerHTML = ''; ui.sheet = false; document.body.classList.remove('lock');
  if (cfResolve) { const r = cfResolve; cfResolve = null; r(false); }
  if (ui.dirtyView) { ui.dirtyView = false; render(); }
}
function confirmBox(title, msg, okLabel, danger) {
  return new Promise(res => {
    openSheet(title, `<p class="cf-msg">${msg}</p><div class="row-btns"><button type="button" class="btn ghost" data-act="cf-no">Batal</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-act="cf-yes">${esc(okLabel || 'Ya')}</button></div>`);
    cfResolve = res;
  });
}
A['sheet-close'] = () => closeSheet();
A['cf-no'] = () => closeSheet();
A['cf-yes'] = () => { const r = cfResolve; cfResolve = null; closeSheet(); if (r) r(true); };

/* ---------- router ---------- */
const R = [];
const route = (re, nav, fn) => R.push({ re, nav, fn });
let mem = ['/']; /* riwayat halaman di memori (hanya mode pratinjau) */
function cur() { const h = PV ? mem[mem.length - 1] : (location.hash.replace(/^#/, '') || '/'); const [path, qs] = h.split('?'); return { path, q: new URLSearchParams(qs || '') }; }
function go(p) {
  if (PV) { if (mem[mem.length - 1] === p) { render(); return; } mem.push(p); ui.navCount++; if (ui.sheet) closeSheet(); render(); return; }
  if ('#' + p === location.hash) render(); else location.hash = p;
}
A.back = () => { if (PV) { if (mem.length > 1) { mem.pop(); if (ui.sheet) closeSheet(); render(); } else go('/'); return; } if (ui.navCount > 0) history.back(); else go('/'); };
if (!PV) window.addEventListener('hashchange', () => { ui.navCount++; if (ui.sheet) closeSheet(); render(); });

function render() {
  if (!WS) return;
  const { path, q } = cur();
  for (const r of R) {
    const m = path.match(r.re); if (!m) continue;
    const key = path + '?' + q.toString(), fresh = key !== ui.key, y = window.scrollY;
    ui.key = key; ui.nav = r.nav;
    let o; try { o = r.fn({ m, q, fresh }); } catch (e) { console.error(e); o = `<div class="bd"><div class="empty"><h3>Terjadi kesalahan</h3><p>${esc(e.message)}</p><button class="btn primary" data-go="/">Ke Beranda</button></div></div>`; }
    if (typeof o === 'string') o = { html: o };
    ui.form = !!o.form; ui.live = !!o.live;
    $('#view').innerHTML = o.html;
    window.scrollTo(0, fresh ? 0 : y);
    if (o.mount) o.mount();
    updateChrome(); return;
  }
  go('/');
}
hooks.change = () => { if (!WS) return; if (ui.form || ui.sheet) ui.dirtyView = true; else render(); };
hooks.remote = () => { if (!WS) return; const ae = document.activeElement; if (ui.live && !ui.sheet && !(ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName))) { render(); return; } if (ui.form || ui.sheet) { ui.dirtyView = ui.form ? false : true; } else render(); };
hooks.sync = () => { $$('.sync-chip').forEach(el => { el.outerHTML = chipHtml(); }); };
const refresh = () => { if (!ui.form && !ui.sheet) render(); };

/* ---------- chrome: sidebar, dock, status cloud ---------- */
const NAV_SIDE = [['home', '/', 'Beranda', 'home'], ['jual', '/jual', 'Penjualan', 'cart'], ['stok', '/stok', 'Stok & Bahan', 'box'], ['produk', '/produk', 'Resep & HPP', 'flask'], ['produksi', '/produksi', 'Produksi', 'pot'], ['pelanggan', '/pelanggan', 'Pelanggan & Nota', 'users'], ['invoice', '/invoice', 'Invoice', 'file'], ['uang', '/uang', 'Keuangan', 'wallet'], ['set', '/pengaturan', 'Pengaturan', 'sliders']];
const NAV_DOCK = [['home', '/', 'Beranda', 'home'], ['jual', '/jual', 'Jual', 'cart'], ['add'], ['uang', '/uang', 'Uang', 'wallet'], ['stok', '/stok', 'Stok', 'box']];
function chipHtml() {
  const n = dirty.size, st = SYNC.state;
  let ico = 'cloud', txt = 'Cloud', cls = 's-idle', tt = '';
  if (st === 'local') { ico = 'cloud-off'; txt = 'Belum ke cloud'; cls = 's-warn'; tt = 'Cloud belum dihubungkan - data hanya di perangkat ini'; }
  else if (st === 'sync') { ico = 'refresh'; txt = 'Sinkron…'; cls = 's-sync'; }
  else if (st === 'ok') { ico = 'cloud'; txt = n ? 'Mengirim…' : 'Tersimpan'; cls = 's-ok'; tt = 'Data aman di cloud'; }
  else if (st === 'offline') { ico = 'cloud-off'; txt = n ? `Offline · ${n} antre` : 'Offline'; cls = 's-warn'; }
  else if (st === 'error') { ico = 'alert'; txt = 'Gagal sinkron'; cls = 's-bad'; tt = SYNC.err; }
  return `<button type="button" class="sync-chip ${cls}" data-act="sync-info" title="${esc(tt)}">${ic(ico)}<span>${esc(txt)}</span></button>`;
}
function logoHtml(cls) {
  const s = S();
  return s.logo ? `<span class="av ${cls || ''}"><img src="${esc(s.logo)}" alt=""></span>` : `<span class="av ${cls || ''}">${esc((s.nama || 'T').trim().charAt(0).toUpperCase())}</span>`;
}
function renderChrome() {
  const s = S();
  $('#side').innerHTML = `<div class="side-brand">${logoHtml()}<div><b>${esc(s.nama || 'TATAKAS')}</b><small>Penataan uang usaha</small></div></div>
    <nav>${NAV_SIDE.map(([k, p, l, i]) => `<a href="#${p}" data-nav="${k}">${ic(i)}<span>${l}</span></a>`).join('')}</nav>
    <div class="side-foot"><div id="side-chip">${chipHtml()}</div><button type="button" class="side-out" data-act="logout">${ic('logout')}<span>Keluar</span></button></div>`;
  $('#dock').innerHTML = NAV_DOCK.map(([k, p, l, i]) => k === 'add'
    ? `<button type="button" class="dock-add" data-act="add" aria-label="Tambah baru">${ic('plus')}</button>`
    : `<a href="#${p}" data-nav="${k}" aria-label="${l}">${ic(i)}<span>${l}</span></a>`).join('');
}
function updateChrome() {
  const n = ui.nav;
  $$('#side nav a, #dock a').forEach(a => a.classList.toggle('on', a.dataset.nav === n));
  const sb = $('#side .side-brand'); if (sb) sb.innerHTML = `${logoHtml()}<div><b>${esc(S().nama || 'TATAKAS')}</b><small>Penataan uang usaha</small></div>`;
}

/* ---------- komponen kecil ---------- */
function page(title, body, o = {}) {
  return `<div class="hd">${o.back ? `<button type="button" class="icon-btn" data-act="back" aria-label="Kembali">${ic('back')}</button>` : ''}<div class="hd-t"><h1>${esc(title)}</h1>${o.sub ? `<p>${o.sub}</p>` : ''}</div><div class="hd-r">${o.right || ''}${chipHtml()}<button type="button" class="icon-btn menu-btn" data-go="/menu" aria-label="Menu">${ic('grid')}</button></div></div><div class="bd ${o.cls || ''}">${body}</div>${o.after || ''}`;
}
const pills = (list, on, act) => `<div class="pills" role="tablist">${list.map(([v, l]) => `<button type="button" class="pill ${v === on ? 'on' : ''}" role="tab" aria-selected="${v === on}" data-act="${act}" data-v="${v}">${esc(l)}</button>`).join('')}</div>`;
const badge = st => `<span class="chip st-${st}">${ic(st === 'lunas' ? 'check' : st === 'batal' ? 'x' : st === 'cicil' ? 'clock' : 'alert')}${ST_LABEL[st]}</span>`;
const empty = (icon, title, desc, action) => `<div class="empty">${ic(icon)}<h3>${esc(title)}</h3><p>${desc || ''}</p>${action || ''}</div>`;
const field = (label, inner, cls) => `<label class="fld ${cls || ''}"><span>${label}</span>${inner}</label>`;
const rpIn = (name, val, extra) => `<input class="rp" inputmode="numeric" autocomplete="off" name="${name}" value="${val ? num(val) : ''}" placeholder="0" ${extra || ''}>`;

/* ---------- grafik (HTML/CSS sederhana, 1 seri, ada tooltip + tabel) ---------- */
function barChart(items, o = {}) {
  const max = Math.max(0, ...items.map(i => i.v)), every = o.every || 1;
  const topK = items.findIndex(i => i.v === max), n = items.length;
  const bars = items.map((i, k) => {
    const edge = k >= n - 2 ? 'r' : k <= 1 ? 'l' : '';
    const hgt = i.v > 0 ? Math.max(i.v / max * 100, 4) : 0;
    return `<div class="bcol" tabindex="0" data-tip="${esc(i.tip)}"><div class="btrack"><div class="bar ${i.v > 0 ? '' : 'zero'}" style="height:${hgt}%">${k === topK && max > 0 ? `<span class="bval ${edge}">${short(i.v)}</span>` : ''}</div></div><span class="blab">${k % every === 0 ? esc(i.label) : ''}</span></div>`;
  }).join('');
  const rows = items.map(i => `<tr><td>${esc(i.tip.split(' · ')[0])}</td><td class="r">${rp(i.v)}</td></tr>`).join('');
  return `<div class="bars" role="img" aria-label="${esc(o.aria || 'Grafik batang')}">${bars}</div><details class="tbl"><summary>Lihat tabel</summary><table><tbody>${rows}</tbody></table></details>`;
}
function hBars(items, o = {}) {
  const max = Math.max(1, ...items.map(i => i.v));
  if (!items.length) return `<p class="muted">${o.empty || 'Belum ada data.'}</p>`;
  return `<div class="hbars">${items.map(i => `<div class="hrow" data-tip="${esc(i.tip || '')}" tabindex="0"><span class="hl">${esc(i.label)}</span><span class="ht"><i style="width:${Math.max(i.v / max * 100, 2)}%"></i></span><b class="hv">${esc(i.val)}</b></div>`).join('')}</div>`;
}
let tipT = null;
function showTip(el) {
  const t = $('#tip'); t.textContent = el.dataset.tip; if (!el.dataset.tip) return; t.classList.add('on');
  const r = el.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
  let x = r.left + r.width / 2 - w / 2; x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
  let y = r.top - h - 8; if (y < 8) y = r.bottom + 8;
  t.style.left = x + 'px'; t.style.top = y + 'px';
}
const hideTip = () => $('#tip').classList.remove('on');
document.addEventListener('pointerover', e => { const el = e.target.closest('[data-tip]'); if (el && e.pointerType === 'mouse') showTip(el); });
document.addEventListener('pointerout', e => { const el = e.target.closest('[data-tip]'); if (el && e.pointerType === 'mouse') hideTip(); });
document.addEventListener('focusin', e => { const el = e.target.closest('[data-tip]'); if (el) showTip(el); });
document.addEventListener('focusout', e => { if (e.target.closest('[data-tip]')) hideTip(); });

/* ---------- event global ---------- */
document.addEventListener('click', e => {
  if (PV) { const a = e.target.closest('a[href^="#/"]'); if (a) { e.preventDefault(); go(a.getAttribute('href').slice(1)); return; } }
  const tp = e.target.closest('[data-tip]');
  if (tp) { showTip(tp); clearTimeout(tipT); tipT = setTimeout(hideTip, 2500); } else hideTip();
  const el = e.target.closest('[data-act],[data-go]'); if (!el || el.disabled) return;
  if (el.dataset.go) { e.preventDefault(); go(el.dataset.go); return; }
  const fn = A[el.dataset.act]; if (fn) { if (el.tagName === 'A') e.preventDefault(); fn(el, e); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-f]'); if (!f) return;
  e.preventDefault(); const fn = F[f.dataset.f]; if (fn) fn(f, e);
});
function fmtInput(el) {
  const pos = el.selectionStart, before = el.value.slice(0, pos).replace(/\D/g, '').length;
  const d = el.value.replace(/\D/g, ''), f = d ? Number(d).toLocaleString('id-ID') : '';
  if (f === el.value) return;
  el.value = f; let c = 0, i = 0; for (; i < f.length && c < before; i++) if (/\d/.test(f[i])) c++;
  try { el.setSelectionRange(i, i); } catch (e) { /* abaikan */ }
}
document.addEventListener('input', e => {
  const el = e.target; if (el.classList && el.classList.contains('rp')) fmtInput(el);
  const n = el.dataset && el.dataset.in; if (n && I[n]) I[n](el, e);
});
document.addEventListener('change', e => { const n = e.target.dataset && e.target.dataset.ch; if (n && I[n]) I[n](e.target, e); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.sheet) closeSheet(); });

/* ---------- aksi umum ---------- */
A['set-period'] = el => { ui.period = el.dataset.v; render(); };
A['sync-info'] = async () => {
  if (!CLOUD) {
    openSheet('Cloud belum dihubungkan', `<p class="cf-msg">Saat ini data <b>hanya tersimpan di perangkat ini</b>. Supaya HP dan laptop memakai data yang sama, isi <code>SUPABASE_URL</code> dan <code>SUPABASE_KEY</code> di file <code>config.js</code>, lalu jalankan <code>supabase-setup.sql</code> di Supabase.</p><button type="button" class="btn primary wide" data-act="sheet-close">Mengerti</button>`);
    return;
  }
  const n = await syncNow();
  if (SYNC.state === 'ok') toast(n ? `${n} perubahan baru dari perangkat lain` : 'Sudah sinkron ✓'); else toast('Gagal sinkron: ' + SYNC.err, 'bad');
};
A.logout = async () => {
  const pend = dirty.size;
  const ok = await confirmBox('Keluar dari ruang kerja?', pend ? `Masih ada <b>${pend} perubahan</b> yang belum terkirim ke cloud. Pastikan online dulu agar tidak hilang.` : 'Data tetap aman di cloud. Masuk lagi dengan kode akses yang sama.', 'Keluar', true);
  if (!ok) return;
  logout(true); $('#shell').hidden = true; renderAuth(); if (PV) mem = ['/']; else location.hash = '';
};

/* ---------- layar masuk ---------- */
function renderAuth(msg) {
  $('#boot').hidden = true; $('#shell').hidden = true;
  const el = $('#auth'); el.hidden = false;
  el.innerHTML = `<div class="auth-card"><img class="auth-logo" src="logo.jpg" alt="Kedai Kopi Boemi" width="132" height="132"><h1>Kedai Kopi Boemi</h1><p class="auth-sub">TataKas · penataan uang usaha: HPP, stok bahan, penjualan, nota &amp; invoice.</p>
    <form data-f="login" class="stack" autocomplete="off" novalidate>
      <label class="fld"><span>Kode akses</span><input type="password" name="code" minlength="6" required placeholder="min. 6 karakter" autocomplete="current-password" enterkeyhint="go"></label>
      <p class="err" id="auth-err" role="alert">${esc(msg || '')}</p>
      <button class="btn dark wide" id="auth-btn">Masuk</button>
    </form>
    <p class="hint">Pakai <b>kode yang sama</b> di HP &amp; laptop agar melihat data yang sama. Kode baru = ruang kerja baru. Simpan kode ini baik-baik, siapa pun yang tahu kodenya bisa membuka datamu.</p>
    ${PV ? `<p class="hint warn">${ic('alert')}<span><b>Pratinjau.</b> Masukkan kode apa saja (min. 6 karakter). Berisi data contoh dan tidak tersimpan permanen. Versi GitHub-nya tersambung ke cloud.</span></p>` : CLOUD ? '' : `<p class="hint warn">${ic('alert')} Cloud belum dihubungkan (isi <code>config.js</code>). Data baru disimpan di perangkat ini saja.</p>`}</div>`;
  const lg = el.querySelector('.auth-logo'); if (lg) lg.addEventListener('error', () => lg.remove());
}
F.login = async f => {
  const code = f.code.value, btn = $('#auth-btn'), err = $('#auth-err');
  if (code.trim().length < 6) { err.textContent = 'Kode akses minimal 6 karakter.'; return; }
  btn.disabled = true; btn.textContent = 'Memeriksa…'; err.textContent = '';
  try {
    const ok = await openWorkspace(code, () => confirmBox('Buat ruang kerja baru?', 'Kode ini <b>belum punya data</b> di cloud. Kalau kamu sebelumnya sudah punya data, kemungkinan kode salah ketik. Lanjut buat ruang kerja baru?', 'Buat baru'));
    if (ok) enterApp(); else { btn.disabled = false; btn.textContent = 'Masuk'; }
  } catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = 'Masuk'; }
};
function enterApp() {
  $('#boot').hidden = true; $('#auth').hidden = true; $('#shell').hidden = false;
  renderChrome(); hooks.sync();
  autoTemplate(PV);
  if (PV) mem = ['/']; else if (!location.hash || location.hash === '#') location.hash = '/';
  ui.key = ''; render();
}
async function boot() {
  const ok = await resumeWorkspace();
  if (ok) enterApp(); else renderAuth();
}

/* =====================================================================
   Bagian 3: Beranda, Stok, Bahan, Resep & HPP, Produksi
   ===================================================================== */
const MUT_LABEL = { awal: 'Stok awal', restock: 'Restock', produksi: 'Produksi', jual: 'Penjualan', opname: 'Penyesuaian' };
const opts = (arr, val, fn) => arr.map(x => { const [v, l] = fn(x); return `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
const itemsSummary = s => (s.items || []).map(i => `${fq(i.qty)}× ${i.nama}${i.rasa ? ' ' + i.rasa : ''}`).join(', ');
const sortName = (a, b) => pdesc(a).localeCompare(pdesc(b), 'id');
function historyHtml(tipe, id, n) {
  const ms = all('mutasi').filter(m => m.tipe === tipe && m.item === id).sort((a, b) => b.tgl.localeCompare(a.tgl) || b._u - a._u).slice(0, n || 12);
  if (!ms.length) return '<p class="muted">Belum ada riwayat.</p>';
  return `<ul class="hist">${ms.map(m => `<li><span>${fdate(m.tgl)}<small>${esc(MUT_LABEL[m.jenis] || m.jenis)}${m.ket ? ' · ' + esc(m.ket) : ''}</small></span><b class="${m.qty < 0 ? 'neg' : 'pos'}">${m.qty > 0 ? '+' : ''}${fq(m.qty)}</b></li>`).join('')}</ul>`;
}
function attention() {
  const out = [];
  for (const b of all('bahan')) { const s = stokB(b.id), st = statusStok(s, b.stokMin); if (st !== 'aman') out.push({ t: 'bahan', id: b.id, nama: b.nama, s, u: b.satuan, st }); }
  for (const p of all('produk')) { const s = stokP(p.id), st = statusStok(s, p.stokMin); if (st !== 'aman') out.push({ t: 'produk', id: p.id, nama: pname(p), s, u: p.satuan, st }); }
  return out.sort((a, b) => (a.st === 'habis' ? 0 : 1) - (b.st === 'habis' ? 0 : 1));
}
function salesSeries(p) {
  const by = {};
  for (const s of all('penjualan')) { if (s.batal) continue; const c = hitung(s); const o = by[s.tgl] || (by[s.tgl] = { v: 0, n: 0 }); o.v += c.omzet; o.n++; }
  if (p === 'semua') {
    const d = new Date(), out = [], byM = {};
    for (const k in by) { const m = k.slice(0, 7), o = byM[m] || (byM[m] = { v: 0, n: 0 }); o.v += by[k].v; o.n += by[k].n; }
    for (let i = 11; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1), m = x.getFullYear() + '-' + pad(x.getMonth() + 1), o = byM[m] || { v: 0, n: 0 }; out.push({ label: BLN[x.getMonth()], v: o.v, tip: `${BLN[x.getMonth()]} ${x.getFullYear()} · ${rp(o.v)} · ${o.n} nota` }); }
    return { items: out, every: 1, title: '12 bulan terakhir' };
  }
  let from, to; if (p === 'hari' || p === 'minggu') { from = addDays(today(), -6); to = today(); } else { [from, to] = rangeOf(p); }
  const out = []; for (let d = from; d <= to; d = addDays(d, 1)) { const o = by[d] || { v: 0, n: 0 }; out.push({ label: String(parseYmd(d).getDate()), v: o.v, tip: `${fdayShort(d)} · ${rp(o.v)} · ${o.n} nota` }); }
  return { items: out, every: out.length > 14 ? Math.ceil(out.length / 7) : 1, title: (p === 'hari' || p === 'minggu') ? '7 hari terakhir' : (p === 'bulan' ? 'Bulan ini' : 'Bulan lalu') };
}
function topRasa(st, n) {
  return Object.values(st.qty).sort((a, b) => b.qty - a.qty).slice(0, n || 6).map(x => ({ label: x.nama + (x.rasa ? ' · ' + x.rasa : ''), v: x.qty, val: fq(x.qty), tip: `${x.nama}${x.rasa ? ' ' + x.rasa : ''} · ${fq(x.qty)} terjual · ${rp(x.omzet)}` }));
}

/* ---------- BERANDA ---------- */
route(/^\/$/, 'home', () => {
  const s = S(), [from, to] = rangeOf(ui.period), st = stats(from, to), hr = new Date().getHours();
  const sapa = hr < 11 ? 'Selamat pagi' : hr < 15 ? 'Selamat siang' : hr < 18 ? 'Selamat sore' : 'Selamat malam';
  const label = (PERIODE.find(x => x[0] === ui.period) || [])[1];
  const hasSale = new Set(all('penjualan').filter(x => !x.batal).map(x => x.tgl)), t = today(), week = [];
  for (let i = 6; i >= 0; i--) { const d = addDays(t, -i); week.push(`<div class="wd ${hasSale.has(d) ? 'on' : ''} ${i === 0 ? 'now' : ''}"><span>${hasSale.has(d) ? ic('check') : ''}</span><small>${HARI[parseYmd(d).getDay()]}</small></div>`); }
  const attn = attention().slice(0, 5), recent = salesSorted().slice(0, 5), ser = salesSeries(ui.period), piut = totalPiutang();
  const nPiut = all('penjualan').filter(x => !x.batal && hitung(x).sisa > 0).length;
  const mon = stats(...rangeOf('bulan')), tgt = n0(s.targetOmzet), pct = tgt > 0 ? Math.min(100, Math.round(mon.omzet / tgt * 100)) : 0;
  const bhnAll = all('bahan').sort((a, b) => a.nama.localeCompare(b.nama, 'id')), setupNeeded = !bhnAll.length || bhnAll.some(b => !n0(b.harga)) || !all('produk').some(p => (p.resep || []).length);
  let h = '';
  if (!CLOUD) h += `<button type="button" class="banner warn" data-act="sync-info">${ic('cloud-off')}<span><b>Cloud belum terhubung.</b> Data baru tersimpan di perangkat ini saja. Ketuk untuk panduan.</span></button>`;
  if (!s.nama || (!s.noRek && !s.hp)) h += `<a class="banner" href="#/pengaturan">${ic('sliders')}<span><b>Lengkapi profil usaha</b> (nama, rekening, kontak) agar nota &amp; invoice tampil lengkap.</span></a>`;
  if (setupNeeded) h += `<div class="card start"><h3>Langkah awal</h3><ol><li><b>Tabel bahan</b>: isi harga, isi kemasan &amp; 1 kemasan jadi berapa cup</li><li><b>Tabel resep</b>: isi gram tiap bahan untuk setiap rasa</li><li><b>Stok awal</b>: restock bahan, lalu catat penjualan</li></ol><div class="row-btns"><button type="button" class="btn primary" data-go="/stok?t=bahan">Isi tabel bahan</button><button type="button" class="btn ghost" data-go="/produk">Tabel resep</button></div><p class="muted sm mt">Mau lihat contohnya dulu? <button type="button" class="linkbtn" data-act="demo">Isi contoh angka</button></p></div>`;
  h += `${pills(PERIODE, ui.period, 'set-period')}
  <section class="hero"><div class="notch"><span>${esc(label)}</span></div>
    <small>Laba bersih</small><div class="hero-n ${st.net < 0 ? 'neg' : ''}">${rp(st.net)}</div>
    <p class="hero-s">Omzet − HPP − biaya operasional</p>
    <div class="week" aria-label="Hari dengan penjualan dalam 7 hari terakhir">${week.join('')}</div></section>
  <div class="tiles">
    <a class="tile t-sage" href="#/uang"><small>Omzet</small><b>${rp(st.omzet)}</b><em>${st.count} nota</em></a>
    <a class="tile t-deep" href="#/uang"><small>HPP terjual</small><b>${rp(st.hpp)}</b><em>${st.omzet ? Math.round(st.hpp / st.omzet * 100) : 0}% dari omzet</em></a>
    <a class="tile t-cream" href="#/uang"><small>Biaya operasional</small><b>${rp(st.biaya)}</b><em>di luar belanja bahan</em></a>
    <a class="tile t-white" href="#/uang?tab=piutang"><small>Belum dibayar</small><b class="${piut ? 'warn' : ''}">${rp(piut)}</b><em>${nPiut} nota</em></a>
  </div>`;
  if (tgt > 0) h += `<div class="card goal"><div><small>Target omzet bulan ini</small><b>${rp(mon.omzet)} <span>/ ${rp(tgt)}</span></b></div><div class="goal-pct">${pct}%</div><div class="meter lg"><i style="width:${pct}%"></i></div></div>`;
  if (bhnAll.length) h += `<div class="card"><div class="card-title">Bahan baku <a href="#/stok?t=bahan" class="more">Lihat tabel</a></div><div class="bm">${bhnAll.map(b => { const sk = stokB(b.id), st = statusStok(sk, b.stokMin), mx = Math.max(n0(b.stokMin) * 3, sk, 1), pc = Math.max(0, Math.min(100, sk / mx * 100)); return `<a class="bm-row" href="#/stok?t=bahan"><span class="bm-n">${esc(b.nama)}<small>${fq(sk)} ${esc(b.satuan)}${st !== 'aman' ? ' · ' + STOK_LABEL[st] : ''}</small></span><span class="bm-c sk-${st}">${cupTxt(cupSisa(b))}</span><span class="meter sk-${st}"><i style="width:${pc}%"></i></span></a>`; }).join('')}</div></div>`;
  if (attn.length) h += `<div class="card"><div class="card-title">Stok perlu perhatian <a href="#/stok" class="more">Lihat semua</a></div><div class="stack-sm">${attn.map(a => `<button type="button" class="row sm" data-act="item" data-t="${a.t}" data-id="${a.id}"><div class="row-main"><b>${esc(a.nama)}</b><small>${a.t === 'bahan' ? 'Bahan' : 'Produk jadi'}</small></div><div class="row-end"><b>${fq(a.s)} <small>${esc(a.u || '')}</small></b><span class="chip sk-${a.st}">${STOK_LABEL[a.st]}</span></div></button>`).join('')}</div></div>`;
  h += `<div class="card"><div class="card-title">Penjualan <small>${ser.title}</small></div>${barChart(ser.items, { every: ser.every, aria: 'Omzet per hari' })}</div>`;
  const tr = topRasa(st);
  h += `<div class="card"><div class="card-title">Terlaris per rasa <small>${esc(label)}</small></div>${hBars(tr, { empty: 'Belum ada penjualan di periode ini.' })}</div>`;
  h += `<div class="sec-title">Aktivitas terbaru <a href="#/jual" class="more">Semua nota</a></div>`;
  h += recent.length ? `<div class="stack-sm">${recent.map(x => { const c = hitung(x); return `<a class="tl" href="#/jual/${x.id}"><span class="tl-t">${esc(x.jam || '--:--')}<small>${fdayShort(x.tgl)}</small></span><div class="tl-c"><b>${esc(x.pelangganNama || 'Umum')}</b><small>${esc(itemsSummary(x))}</small></div><div class="tl-r"><b>${rp(c.total)}</b>${badge(c.st)}</div></a>`; }).join('')}</div>` : empty('cart', 'Belum ada penjualan', 'Catat penjualan pertamamu lewat tombol + di bawah.');
  return { html: `<div class="hd hd-home">${logoHtml('lg')}<div class="hd-t"><p>${sapa}</p><h1>${esc(s.nama || 'Usahamu')}</h1></div><div class="hd-r">${chipHtml()}<button type="button" class="icon-btn menu-btn" data-go="/menu" aria-label="Menu">${ic('grid')}</button></div></div><div class="bd">${h}</div>` };
});
A.demo = async () => { seedBoemi(true); toast('Contoh angka Boemi dimuat'); };

/* ---------- STOK ---------- */
route(/^\/stok$/, 'stok', ({ q, fresh }) => {
  if (q.get('t') && fresh) ui.stokTab = q.get('t');
  const tab = ui.stokTab; let h = pills([['produk', 'Produk jadi'], ['bahan', 'Bahan baku']], tab, 'stok-tab');
  if (tab === 'produk') {
    const ps = all('produk').sort(sortName), cnt = { aman: 0, tipis: 0, habis: 0 };
    ps.forEach(p => cnt[statusStok(stokP(p.id), p.stokMin)]++);
    const tot = ps.reduce((a, p) => a + Math.max(0, stokP(p.id)), 0);
    h += `<section class="goalbox"><div class="gb-h"><small>Stok produk jadi</small><b>${fq(tot)} <span>total qty</span></b></div><div class="gb-tiles"><div class="gt"><b>${cnt.aman}</b><small>Aman</small></div><div class="gt"><b>${cnt.tipis}</b><small>Menipis</small></div><div class="gt"><b>${cnt.habis}</b><small>Habis</small></div></div></section>`;
    if (!ps.length) h += empty('box', 'Belum ada produk', 'Buat resep &amp; HPP dulu supaya stok tiap rasa bisa dicatat.', `<button type="button" class="btn primary" data-go="/produk/new">Buat produk / rasa</button>`);
    const groups = {}; ps.forEach(p => (groups[p.nama] = groups[p.nama] || []).push(p));
    for (const g of Object.keys(groups)) {
      h += `<div class="sec-title">${esc(g)}</div><div class="rasa-grid">${groups[g].map(p => { const s = stokP(p.id), st = statusStok(s, p.stokMin); return `<button type="button" class="rasa sk-${st}" data-act="item" data-t="produk" data-id="${p.id}"><span class="rasa-n">${fq(s)}</span><span class="rasa-u">${esc(p.satuan || 'pcs')}</span><span class="rasa-l">${esc(p.rasa || 'Original')}</span>${st !== 'aman' ? `<em>${STOK_LABEL[st]}</em>` : ''}</button>`; }).join('')}</div>`;
    }
    if (ps.length) h += `<button type="button" class="cta" data-go="/produksi/new">${ic('plus')} Produksi baru</button>`;
  } else {
    h += bahanTable();
  }
  const out = page('Stok', h, { sub: 'Qty tiap rasa &amp; bahan' });
  return tab === 'bahan' ? { html: out, form: true, live: true } : out;
});
A['stok-tab'] = el => { ui.stokTab = el.dataset.v; render(); };

/* ---------- TABEL BAHAN BAKU (stok + isi + harga + jadi berapa cup, bisa diedit langsung & tambah baris) ---------- */
const byNama = (a, b) => a.nama.localeCompare(b.nama, 'id');
const flash = el => { el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 900); };
function bahanTable() {
  const bs = all('bahan').sort(byNama), nilai = bs.reduce((a, b) => a + Math.max(0, stokB(b.id)) * hargaSat(b), 0);
  const rows = bs.map(b => {
    const s = stokB(b.id), st = statusStok(s, b.stokMin), est = cupDariResep(b);
    return `<tr data-id="${b.id}">
      <th class="sticky"><button type="button" class="xname" data-act="item" data-t="bahan" data-id="${b.id}"><b>${esc(b.nama)}</b><small>${esc(b.satuan)}</small></button></th>
      <td class="xs sk-${st}"><b>${fq(s)}</b><small>${st !== 'aman' ? STOK_LABEL[st] : esc(b.satuan)}</small></td>
      <td class="xc" id="bs-${b.id}">${cupTxt(cupSisa(b))}</td>
      <td><input class="xi" inputmode="decimal" data-ch="bt" data-id="${b.id}" data-k="isi" value="${n0(b.isi) ? fq(b.isi) : ''}" placeholder="isi" aria-label="Isi per kemasan ${esc(b.nama)}"></td>
      <td><input class="xi rp" inputmode="numeric" data-ch="bt" data-id="${b.id}" data-k="harga" value="${n0(b.harga) ? num(b.harga) : ''}" placeholder="0" aria-label="Harga per kemasan ${esc(b.nama)}"></td>
      <td><input class="xi" inputmode="decimal" data-ch="bt" data-id="${b.id}" data-k="cup" id="bc-${b.id}" value="${n0(b.cup) ? fq(b.cup) : ''}" placeholder="${est > 0 ? '≈ ' + Math.round(est) : '0'}" aria-label="Jadi berapa cup per kemasan ${esc(b.nama)}"></td></tr>`;
  }).join('');
  const add = `<tr class="xadd"><th class="sticky"><input class="xi" id="ba-nama" placeholder="+ Nama bahan baru" aria-label="Nama bahan baru" autocomplete="off"><input class="xi xu" id="ba-sat" list="dl-sat" value="gram" aria-label="Satuan"></th>
      <td><input class="xi" id="ba-stok" inputmode="decimal" placeholder="stok awal" aria-label="Stok awal"></td><td class="xc">-</td>
      <td><input class="xi" id="ba-isi" inputmode="decimal" placeholder="1000" aria-label="Isi per kemasan"></td>
      <td><input class="xi rp" id="ba-harga" inputmode="numeric" placeholder="0" aria-label="Harga per kemasan"></td>
      <td><input class="xi" id="ba-cup" inputmode="decimal" placeholder="0" aria-label="Jadi berapa cup"></td></tr>`;
  return `<div class="mini-sum"><span>Nilai stok bahan</span><b>${rp(nilai)}</b></div>
  <div class="xt-wrap"><table class="xt"><thead><tr><th class="sticky">Bahan</th><th>Stok</th><th>Cukup untuk</th><th>Isi / kemasan</th><th>Harga / kemasan</th><th>1 kemasan jadi</th></tr></thead><tbody>${rows}${add}</tbody></table></div>
  <datalist id="dl-sat">${SATUAN.map(x => `<option value="${x}">`).join('')}</datalist>
  <button type="button" class="cta" data-act="ba-add">${ic('plus')} Tambah bahan ke tabel</button>
  <p class="muted sm">Ketuk nama bahan untuk <b>restock</b> atau sesuaikan stok. Angka di kolom <b>Isi</b>, <b>Harga</b> dan <b>1 kemasan jadi (cup)</b> bisa diedit langsung. Kosongkan kolom cup dan angka <b>≈</b> dihitung otomatis dari resep.</p>
  <div class="row-btns mt"><button type="button" class="btn ghost" data-go="/produk">${ic('flask')} Isi resep tiap rasa</button></div>`;
}
I.bt = el => {
  const b = get('bahan', el.dataset.id); if (!b) return; const k = el.dataset.k;
  let v = k === 'harga' ? rpNum(el.value) : dec(el.value);
  if (k === 'isi' && v <= 0) { toast('Isi kemasan harus lebih dari 0', 'bad'); el.value = fq(b.isi); return; }
  const rec = put('bahan', Object.assign({}, b, { [k]: Math.max(0, v) }));
  el.value = k === 'harga' ? (rec.harga ? num(rec.harga) : '') : (rec[k] ? fq(rec[k]) : ''); flash(el);
  const c = $('#bs-' + rec.id); if (c) c.textContent = cupTxt(cupSisa(rec));
  const ci = $('#bc-' + rec.id); if (ci) { const est = cupDariResep(rec); ci.placeholder = est > 0 ? '≈ ' + Math.round(est) : '0'; }
};
A['ba-add'] = () => {
  const nama = ($('#ba-nama').value || '').trim(), isi = dec($('#ba-isi').value);
  if (!nama) { toast('Isi nama bahan dulu', 'bad'); $('#ba-nama').focus(); return; }
  if (isi <= 0) { toast('Isi kemasan harus lebih dari 0', 'bad'); $('#ba-isi').focus(); return; }
  if (all('bahan').some(b => b.nama.toLowerCase() === nama.toLowerCase())) { toast('Bahan itu sudah ada di tabel', 'bad'); return; }
  batch(() => {
    const rec = put('bahan', { nama, satuan: ($('#ba-sat').value || 'gram').trim(), harga: rpNum($('#ba-harga').value), isi, cup: dec($('#ba-cup').value), stokMin: 0, catatan: '' });
    const aw = dec($('#ba-stok').value); if (aw > 0) mut('awal', 'bahan', rec.id, aw, '', today(), 'Stok awal');
  });
  toast('Bahan ditambahkan'); render();
};
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest && e.target.closest('.xadd')) { e.preventDefault(); A['ba-add'](); } });

/* ---------- TABEL RESEP (baris = rasa, kolom = bahan, isi = gram/satuan bahan untuk 1 cup) ---------- */
const rtSub = p => `HPP ${rp(hppProduk(p))}${n0(p.harga) > 0 ? ' · margin ' + mrgTxt(p) : ''}`;
const mrgTxt = p => { const h = n0(p.harga); return h > 0 ? Math.round((h - hppProduk(p)) / h * 100) + '%' : '-'; };
const mrgCls = p => { const h = n0(p.harga); if (h <= 0) return ''; const m = (h - hppProduk(p)) / h * 100; return m < 0 ? 'neg' : m < 25 ? 'warn' : 'pos'; };
function resepTable() {
  const bs = all('bahan').sort(byNama), ps = all('produk').sort(sortName);
  if (!bs.length) return empty('flask', 'Belum ada bahan', 'Isi dulu bahan baku di tabel bahan, lalu resep tiap rasa bisa ditulis di sini.', `<button type="button" class="btn primary" data-go="/stok?t=bahan">Buka tabel bahan</button>`);
  if (!ps.length) return empty('flask', 'Belum ada menu / rasa', 'Tambah menu dulu, lalu isi gram tiap bahan di tabel ini.', `<button type="button" class="btn primary" data-go="/produk/new">Tambah menu / rasa</button>`);
  const head = bs.map(b => `<th class="xcol"><b>${esc(b.nama)}</b><small>${esc(b.satuan)} / cup</small></th>`).join('');
  const cups = bs.map(b => `<td class="xc" id="rc-c-${b.id}">${cupKemasanTxt(b)}</td>`).join('');
  const rows = ps.map(p => {
    const y = n0(p.yield) > 0 ? n0(p.yield) : 1;
    const cells = bs.map(b => { const r = (p.resep || []).find(x => x.b === b.id), v = r ? n0(r.q) / y : 0; return `<td><input class="xi" inputmode="decimal" data-ch="rt" data-p="${p.id}" data-b="${b.id}" value="${v ? fq(v) : ''}" placeholder="0" aria-label="${esc(pname(p))}: ${esc(b.nama)} per cup"></td>`; }).join('');
    return `<tr data-p="${p.id}"><th class="sticky"><a class="xname" href="#/produk/${p.id}"><b>${esc(pname(p))}</b><small id="rt-s-${p.id}">${rtSub(p)}</small></a></th>${cells}
      <td><input class="xi rp" inputmode="numeric" data-ch="rt-lain" data-p="${p.id}" value="${n0(p.biayaLain) ? num(p.biayaLain) : ''}" placeholder="0" aria-label="Biaya lain ${esc(pname(p))}"></td>
      <td class="xc strong" id="rt-hpp-${p.id}">${rp(hppProduk(p))}</td>
      <td><input class="xi rp" inputmode="numeric" data-ch="rt-harga" data-p="${p.id}" value="${n0(p.harga) ? num(p.harga) : ''}" placeholder="0" aria-label="Harga jual ${esc(pname(p))}"></td>
      <td class="xc strong ${mrgCls(p)}" id="rt-m-${p.id}">${mrgTxt(p)}</td></tr>`;
  }).join('');
  return `<div class="xt-wrap"><table class="xt xr"><thead><tr><th class="sticky">Rasa / menu</th>${head}<th class="xcol"><b>Biaya lain</b><small>Rp / cup</small></th><th class="xcol"><b>HPP</b><small>per cup</small></th><th class="xcol"><b>Harga jual</b><small>Rp</small></th><th class="xcol"><b>Margin</b><small>%</small></th></tr>
    <tr class="xsub"><th class="sticky">1 kemasan jadi</th>${cups}<td></td><td></td><td></td><td></td></tr></thead><tbody>${rows}</tbody></table></div>
  <div class="row-btns mt"><button type="button" class="btn primary" data-go="/produk/new">${ic('plus')} Tambah menu / rasa</button><button type="button" class="btn ghost" data-act="bahan-new">${ic('plus')} Bahan baru</button></div>
  <p class="muted sm">Tulis <b>berapa gram (atau satuan bahan)</b> yang dipakai untuk <b>1 cup</b> tiap rasa. Kosong = bahan itu tidak dipakai. Tersimpan otomatis. HPP, margin, dan perkiraan "1 kemasan jadi berapa cup" ikut terhitung dari harga di tabel bahan baku. Biaya lain: cup, es batu, sedotan, dll.</p>`;
}
const cupKemasanTxt = b => { const c = cupKemasan(b); return c > 0 ? `${n0(b.cup) > 0 ? '' : '≈ '}${Math.round(c)} cup` : '-'; };
function rtCalc(pid) {
  const p = get('produk', pid); if (!p) return;
  const h = $('#rt-hpp-' + pid), m = $('#rt-m-' + pid);
  if (h) h.textContent = rp(hppProduk(p));
  const sm = $('#rt-s-' + pid); if (sm) sm.textContent = rtSub(p);
  if (m) { m.textContent = mrgTxt(p); m.className = 'xc strong ' + mrgCls(p); }
  all('bahan').forEach(b => { const c = $('#rc-c-' + b.id); if (c) c.textContent = cupKemasanTxt(b); });
}
const rtPut = (el, patch) => { const p = get('produk', el.dataset.p); if (!p) return null; const rec = put('produk', Object.assign({}, p, patch(p))); flash(el); rtCalc(rec.id); return rec; };
I.rt = el => {
  const bid = el.dataset.b, v = Math.max(0, dec(el.value));
  rtPut(el, p => { const y = n0(p.yield) > 0 ? n0(p.yield) : 1, resep = (p.resep || []).filter(r => r.b !== bid); if (v > 0) resep.push({ b: bid, q: r4(v * y) }); return { resep }; });
  el.value = v ? fq(v) : '';
};
I['rt-lain'] = el => { rtPut(el, () => ({ biayaLain: rpNum(el.value) })); };
I['rt-harga'] = el => { rtPut(el, () => ({ harga: rpNum(el.value) })); };
A['resep-tab'] = el => { ui.resepTab = el.dataset.v; render(); };

/* ---------- ringkasan item (produk / bahan) ---------- */
A.item = el => sheetItem(el.dataset.t, el.dataset.id);
function sheetItem(tipe, id) {
  const it = get(tipe, id); if (!it) return;
  const isB = tipe === 'bahan', s = isB ? stokB(id) : stokP(id), st = statusStok(s, it.stokMin), u = isB ? it.satuan : (it.satuan || 'pcs');
  const info = isB ? `Harga ${rp(hargaSat(it))} / ${esc(u)} · ${rp(it.harga)} per ${fq(it.isi)} ${esc(u)}${cupKemasan(it) > 0 ? ` · 1 kemasan ${cupKemasanTxt(it)} · stok cukup ${cupTxt(cupSisa(it))}` : ''}` : `HPP ${rp(hppProduk(it))} · Harga jual ${rp(it.harga)}`;
  openSheet(isB ? it.nama : pname(it), `<div class="it-top"><div><small>Stok sekarang</small><b class="big">${fq(s)} <span>${esc(u)}</span></b></div><span class="chip sk-${st}">${STOK_LABEL[st]}</span></div><p class="muted">${info}</p>
    <div class="grid2 acts">${isB ? `<button type="button" class="btn primary" data-act="restock" data-id="${id}">${ic('plus')} Restock</button><button type="button" class="btn ghost" data-act="bahan-edit" data-id="${id}">${ic('pencil')} Edit bahan</button>` : `<button type="button" class="btn primary" data-go="/produksi/new?p=${id}">${ic('pot')} Produksi</button><button type="button" class="btn ghost" data-go="/produk/${id}">${ic('pencil')} Resep &amp; HPP</button>`}
    <button type="button" class="btn ghost" data-act="opname" data-t="${tipe}" data-id="${id}">${ic('check')} Sesuaikan stok</button>${isB ? '' : `<button type="button" class="btn ghost" data-go="/jual/new?p=${id}">${ic('cart')} Jual</button>`}</div>
    <div class="card-title mt">Riwayat stok</div>${historyHtml(tipe, id)}`);
}

/* ---------- BAHAN (sheet) ---------- */
A['bahan-new'] = () => sheetBahan();
A['bahan-edit'] = el => sheetBahan(el.dataset.id);
function sheetBahan(id) {
  const b = id ? get('bahan', id) : null; if (id && !b) return;
  openSheet(b ? 'Edit bahan' : 'Bahan baru', `<form data-f="bahan" class="stack" autocomplete="off"><input type="hidden" name="id" value="${id || ''}">
    ${field('Nama bahan', `<input name="nama" required value="${esc(b ? b.nama : '')}" placeholder="mis. Biji Kopi">`)}
    <div class="grid2">${field('Satuan pakai', `<input name="satuan" list="dl-sat" required value="${esc(b ? b.satuan : 'gram')}">`)}${field('Stok minimum', `<input name="stokMin" inputmode="decimal" value="${b ? fq(b.stokMin) : ''}" placeholder="0">`)}</div>
    <div class="grid2">${field('Harga beli / kemasan (Rp)', rpIn('harga', b ? b.harga : 0, 'data-in="bhn" required'))}${field('Isi / kemasan (satuan)', `<input name="isi" inputmode="decimal" data-in="bhn" required value="${b && n0(b.isi) ? fq(b.isi) : ''}" placeholder="mis. 1000">`)}</div>
    ${field('1 kemasan jadi berapa cup (perkiraan)', `<input name="cup" inputmode="decimal" value="${b && n0(b.cup) ? fq(b.cup) : ''}" placeholder="kosong = dihitung dari resep">`)}
    <div class="calc" id="bhn-calc"></div>
    ${b ? '' : field('Stok awal (opsional)', `<input name="stokAwal" inputmode="decimal" placeholder="0">`)}
    ${field('Catatan', `<input name="catatan" value="${esc(b ? b.catatan || '' : '')}" placeholder="supplier, dll (opsional)">`)}
    <datalist id="dl-sat">${SATUAN.map(x => `<option value="${x}">`).join('')}</datalist>
    <div class="row-btns">${b ? `<button type="button" class="btn danger-o" data-act="bahan-del" data-id="${id}">${ic('trash')}</button>` : ''}<button class="btn primary grow">Simpan</button></div></form>`, { mount: () => I.bhn() });
}
I.bhn = () => {
  const f = $('form[data-f="bahan"]'); if (!f) return;
  const h = rpNum(f.harga.value), isi = dec(f.isi.value), u = f.satuan.value || 'satuan';
  $('#bhn-calc').innerHTML = isi > 0 ? `Harga per ${esc(u)}: <b>${rp(h / isi)}</b>` : 'Isi harga beli &amp; isi kemasan untuk menghitung harga per satuan.';
};
F.bahan = f => {
  const id = f.id.value, nama = f.nama.value.trim(), isi = dec(f.isi.value); if (!nama) return;
  if (isi <= 0) { toast('Isi kemasan harus lebih dari 0', 'bad'); return; }
  batch(() => {
    const old = id ? get('bahan', id) : null;
    const rec = put('bahan', Object.assign({}, old || {}, { nama, satuan: f.satuan.value.trim() || 'pcs', harga: rpNum(f.harga.value), isi, cup: Math.max(0, dec(f.cup.value)), stokMin: dec(f.stokMin.value), catatan: f.catatan.value.trim() }));
    if (!old && f.stokAwal && dec(f.stokAwal.value) > 0) mut('awal', 'bahan', rec.id, dec(f.stokAwal.value), '', today(), 'Stok awal');
  });
  closeSheet(); toast('Bahan tersimpan');
};
A['bahan-del'] = async el => {
  const id = el.dataset.id, n = all('produk').filter(p => (p.resep || []).some(r => r.b === id)).length;
  const ok = await confirmBox('Hapus bahan?', n ? `Bahan ini dipakai di <b>${n} resep</b>. Hapus akan menghilangkannya dari perhitungan HPP.` : 'Bahan akan dihapus dari daftar.', 'Hapus', true);
  if (ok) { del('bahan', id); toast('Bahan dihapus'); }
};

/* ---------- RESTOCK & PENYESUAIAN ---------- */
A.restock = el => sheetRestock(el && el.dataset ? el.dataset.id : '');
function sheetRestock(id) {
  const bs = all('bahan').sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  if (!bs.length) { toast('Tambah bahan dulu', 'bad'); return; }
  const b = (id && get('bahan', id)) || bs[0];
  openSheet('Restock bahan', `<form data-f="restock" class="stack" autocomplete="off">
    ${field('Bahan', `<select name="b" data-ch="rs">${opts(bs, b.id, x => [x.id, `${x.nama} (${x.satuan})`])}</select>`)}
    <div class="grid2">${field('Beli (kemasan)', `<input name="n" inputmode="decimal" value="1" data-in="rs" required>`)}${field('Total harga (Rp)', rpIn('total', b.harga, 'data-in="rs" required'))}</div>
    <div class="calc" id="rs-calc"></div>
    <div class="grid2">${field('Tanggal', `<input type="date" name="tgl" value="${today()}" required>`)}${field('Dibayar dengan', `<select name="metode">${opts(METODE, 'Tunai', x => [x, x])}</select>`)}</div>
    <label class="chk"><input type="checkbox" name="catat" checked><span>Catat sebagai pengeluaran (Belanja Bahan)</span></label>
    <button class="btn primary wide">Tambah stok</button></form>`, { mount: () => I.rs() });
}
I.rs = (el) => {
  const f = $('form[data-f="restock"]'); if (!f) return;
  const b = get('bahan', f.b.value); if (!b) return;
  if (el && el.name === 'b') f.total.value = num(Math.round(b.harga * (dec(f.n.value) || 1)));
  if (el && el.name === 'n') f.total.value = num(Math.round(b.harga * dec(f.n.value)));
  const n = dec(f.n.value), total = rpNum(f.total.value);
  $('#rs-calc').innerHTML = n > 0 ? `Masuk stok: <b>${fq(n * b.isi)} ${esc(b.satuan)}</b> · harga ${rp(total / n / b.isi)} / ${esc(b.satuan)}` : '';
};
F.restock = f => {
  const b = get('bahan', f.b.value), n = dec(f.n.value), total = rpNum(f.total.value), tgl = f.tgl.value || today();
  if (!b || n <= 0) { toast('Isi jumlah kemasan', 'bad'); return; }
  batch(() => {
    const m = mut('restock', 'bahan', b.id, n * b.isi, '', tgl, `Beli ${fq(n)} kemasan`);
    const hb = Math.round(total / n); if (total > 0 && Math.abs(hb - b.harga) >= 1) put('bahan', Object.assign({}, b, { harga: hb }));
    if (f.catat.checked && total > 0) put('pengeluaran', { tgl, kat: 'Belanja Bahan', ket: 'Restock ' + b.nama, jumlah: total, metode: f.metode.value, ref: m.id });
  });
  closeSheet(); toast(`Stok ${b.nama} +${fq(n * b.isi)} ${b.satuan}`);
};
A.opname = el => {
  const tipe = el.dataset.t, id = el.dataset.id, it = get(tipe, id); if (!it) return;
  const s = tipe === 'bahan' ? stokB(id) : stokP(id), u = tipe === 'bahan' ? it.satuan : (it.satuan || 'pcs');
  openSheet('Sesuaikan stok', `<form data-f="opname" class="stack" autocomplete="off"><input type="hidden" name="t" value="${tipe}"><input type="hidden" name="id" value="${id}"><input type="hidden" name="cur" value="${s}">
    <p class="muted">${esc(tipe === 'bahan' ? it.nama : pname(it))}: stok tercatat <b>${fq(s)} ${esc(u)}</b>. Isi jumlah hasil hitung fisik.</p>
    ${field('Stok sebenarnya (' + esc(u) + ')', `<input name="baru" inputmode="decimal" required value="${fq(s)}" data-in="op">`)}<div class="calc" id="op-calc"></div>
    ${field('Alasan (opsional)', `<input name="ket" placeholder="mis. rusak, tumpah, salah hitung">`)}<button class="btn primary wide">Simpan penyesuaian</button></form>`, { mount: () => I.op() });
};
I.op = () => { const f = $('form[data-f="opname"]'); if (!f) return; const d = r4(dec(f.baru.value) - n0(f.cur.value)); $('#op-calc').innerHTML = d === 0 ? 'Tidak ada perubahan.' : `Selisih: <b class="${d < 0 ? 'neg' : 'pos'}">${d > 0 ? '+' : ''}${fq(d)}</b>`; };
F.opname = f => {
  const d = r4(dec(f.baru.value) - n0(f.cur.value)); if (d === 0) { closeSheet(); return; }
  mut('opname', f.t.value, f.id.value, d, '', today(), f.ket.value.trim() || 'Hitung fisik');
  closeSheet(); toast('Stok disesuaikan');
};

/* ---------- RESEP & HPP ---------- */
route(/^\/produk$/, 'produk', ({ q, fresh }) => {
  if (q.get('t') && fresh) ui.resepTab = q.get('t');
  const rtab = ui.resepTab || 'tabel', tabs = pills([['tabel', 'Tabel resep'], ['daftar', 'Daftar HPP']], rtab, 'resep-tab');
  if (rtab === 'tabel') return { html: page('Resep & HPP', tabs + resepTable(), { sub: 'Gram tiap bahan per rasa' }), form: true, live: true };
  const ps = all('produk').sort(sortName), groups = {};
  ps.forEach(p => (groups[p.nama] = groups[p.nama] || []).push(p));
  const mg = ps.filter(p => n0(p.harga) > 0).map(p => (p.harga - hppProduk(p)) / p.harga * 100), avg = mg.length ? mg.reduce((a, b) => a + b, 0) / mg.length : 0;
  let h = tabs + `<div class="mini-sum"><span>${ps.length} produk / rasa</span><b>Rata-rata margin ${Math.round(avg)}%</b></div>`;
  if (!ps.length) h += empty('flask', 'Belum ada resep', 'Susun resep tiap rasa. HPP dihitung otomatis dari harga bahan.', `<button type="button" class="btn primary" data-go="/produk/new">Buat produk / rasa</button>`);
  for (const g of Object.keys(groups)) {
    h += `<div class="sec-title">${esc(g)}</div><div class="stack-sm">${groups[g].map(p => { const hp = hppProduk(p), m = p.harga > 0 ? (p.harga - hp) / p.harga * 100 : 0; return `<a class="row" href="#/produk/${p.id}"><div class="row-main"><b>${esc(p.rasa || 'Original')}</b><small>HPP ${rp(hp)} · Harga ${rp(p.harga)}</small></div><div class="row-end"><b>${rp(p.harga - hp)}</b><span class="chip ${m < 0 ? 'st-batal' : m < 25 ? 'st-cicil' : 'st-lunas'}">margin ${Math.round(m)}%</span></div></a>`; }).join('')}</div>`;
  }
  h += `<a class="cta" href="#/produk/new">${ic('plus')} Tambah produk / rasa</a>`;
  return page('Resep & HPP', h, { sub: 'HPP tiap rasa' });
});

let PF = null;
const blankPF = () => ({ id: '', nama: '', rasa: '', satuan: 'cup', harga: 0, yield: 1, biayaLain: 0, stokMin: 0, catatan: '', resep: [{ b: '', q: '' }], stokAwal: 0 });
function initPF(id, q) {
  if (id !== 'new') { const p = get('produk', id); if (!p) return null; return Object.assign({}, p, { resep: (p.resep || []).map(r => Object.assign({}, r)), stokAwal: 0 }); }
  const d = q.get('dup') && get('produk', q.get('dup'));
  if (d) return Object.assign(blankPF(), { nama: d.nama, satuan: d.satuan, harga: d.harga, yield: d.yield, biayaLain: d.biayaLain, stokMin: d.stokMin, resep: (d.resep || []).map(r => Object.assign({}, r)) });
  return blankPF();
}
route(/^\/produk\/([\w-]+)$/, 'produk', ({ m, q, fresh }) => {
  if (fresh || !PF) PF = initPF(m[1], q);
  if (!PF) return empty('flask', 'Produk tidak ditemukan', '', `<button class="btn primary" data-go="/produk">Kembali</button>`);
  const isNew = !PF.id, names = [...new Set(all('produk').map(p => p.nama))];
  const body = `<form data-f="produk" class="stack" autocomplete="off">
    <div class="card"><div class="grid2">${field('Nama produk', `<input name="nama" data-in="pf" list="dl-pn" required value="${esc(PF.nama)}" placeholder="mis. Kopi Susu">`)}${field('Rasa / varian', `<input name="rasa" data-in="pf" value="${esc(PF.rasa)}" placeholder="mis. Aren">`)}</div>
    <div class="grid2">${field('Harga jual (Rp)', rpIn('harga', PF.harga, 'data-in="pf"'))}${field('Satuan jual', `<input name="satuan" data-in="pf" list="dl-sat" value="${esc(PF.satuan)}">`)}</div>
    <div class="grid2">${field('Stok minimum', `<input name="stokMin" data-in="pf" inputmode="decimal" value="${PF.stokMin ? fq(PF.stokMin) : ''}" placeholder="0">`)}${isNew ? field('Stok awal', `<input name="stokAwal" data-in="pf" inputmode="decimal" value="${PF.stokAwal ? fq(PF.stokAwal) : ''}" placeholder="0">`) : ''}</div>
    <datalist id="dl-pn">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist><datalist id="dl-sat">${SATUAN.map(x => `<option value="${x}">`).join('')}</datalist></div>
    <div class="card"><div class="card-title">Resep <small>bahan untuk 1 kali produksi (1 batch)</small></div><div id="pf-rows"></div>
      <button type="button" class="btn ghost sm" data-act="pf-add">${ic('plus')} Tambah bahan</button>
      <div class="grid2 mt">${field('Hasil per batch', `<input name="yield" data-in="pf" inputmode="decimal" value="${fq(PF.yield)}" placeholder="1">`)}${field('Biaya lain / unit (Rp)', rpIn('biayaLain', PF.biayaLain, 'data-in="pf"'))}</div>
      <p class="muted sm">Biaya lain: tenaga kerja, label, gas, dll yang tidak masuk daftar bahan.</p></div>
    <div class="card hppc" id="pf-hpp"></div>
    ${field('Catatan', `<input name="catatan" data-in="pf" value="${esc(PF.catatan || '')}" placeholder="opsional">`)}
    <div class="row-btns sticky">${!isNew ? `<button type="button" class="btn danger-o" data-act="pf-del" aria-label="Hapus">${ic('trash')}</button><a class="btn ghost" href="#/produk/new?dup=${PF.id}">${ic('copy')} Rasa baru</a>` : ''}<button class="btn primary grow">Simpan</button></div></form>`;
  return { html: page(isNew ? 'Produk baru' : pname(PF), body, { back: true, sub: 'Resep &amp; HPP' }), form: true, mount: () => { renderPFRows(); updPF(); } };
});
function renderPFRows() {
  const bs = all('bahan').sort((a, b) => a.nama.localeCompare(b.nama, 'id')), box = $('#pf-rows'); if (!box) return;
  box.innerHTML = bs.length ? PF.resep.map((r, i) => { const b = get('bahan', r.b); return `<div class="rrow"><select data-ch="pf-b" data-i="${i}" aria-label="Bahan">${'<option value="">Pilih bahan…</option>' + opts(bs, r.b, x => [x.id, x.nama])}</select><input data-in="pf-q" data-i="${i}" inputmode="decimal" value="${esc(r.q === '' ? '' : fq(r.q))}" placeholder="qty" aria-label="Jumlah"><span class="u">${esc(b ? b.satuan : '')}</span><b class="rc" id="rc-${i}">${b ? rp(n0(r.q) * hargaSat(b)) : ''}</b><button type="button" class="icon-btn sm" data-act="pf-rm" data-i="${i}" aria-label="Hapus baris">${ic('x')}</button></div>`; }).join('') : `<p class="muted">Belum ada bahan. <a href="#/stok?t=bahan">Tambah bahan dulu</a>.</p>`;
}
function updPF() {
  const hr = hppRincian(PF), hp = hr.hpp, lb = n0(PF.harga) - hp, m = n0(PF.harga) > 0 ? lb / PF.harga * 100 : 0;
  PF.resep.forEach((r, i) => { const el = $('#rc-' + i), b = get('bahan', r.b); if (el) el.textContent = b ? rp(n0(r.q) * hargaSat(b)) : ''; });
  const sug = [30, 40, 50].map(mm => { const v = Math.ceil(hp / (1 - mm / 100) / 500) * 500; return `<button type="button" class="chipbtn" data-act="pf-price" data-v="${v}">${mm}% → ${rp(v)}</button>`; }).join('');
  const el = $('#pf-hpp'); if (!el) return;
  el.innerHTML = `<div class="hpp-main"><small>HPP per ${esc(PF.satuan || 'unit')}</small><b>${rp(hp)}</b></div>
    <p class="muted sm">Bahan ${rp(hr.bahan)} ÷ hasil ${fq(hr.y)} = ${rp(hr.perUnit)} + biaya lain ${rp(hr.lain)}</p>
    <div class="hpp-row"><span>Harga jual</span><b>${rp(PF.harga)}</b></div><div class="hpp-row"><span>Laba per ${esc(PF.satuan || 'unit')}</span><b class="${lb < 0 ? 'neg' : 'pos'}">${rp(lb)} <em>(${Math.round(m)}%)</em></b></div>
    <div class="sug"><small>Saran harga untuk margin:</small><div>${sug}</div></div>`;
}
I.pf = el => {
  const n = el.name; if (!['nama', 'rasa', 'harga', 'satuan', 'stokMin', 'stokAwal', 'yield', 'biayaLain', 'catatan'].includes(n)) return;
  PF[n] = (n === 'harga' || n === 'biayaLain') ? rpNum(el.value) : (n === 'yield' || n === 'stokMin' || n === 'stokAwal') ? dec(el.value) : el.value;
  updPF();
};
I['pf-b'] = el => { PF.resep[+el.dataset.i].b = el.value; renderPFRows(); updPF(); };
I['pf-q'] = el => { PF.resep[+el.dataset.i].q = dec(el.value) || (el.value ? 0 : ''); updPF(); };
A['pf-add'] = () => { PF.resep.push({ b: '', q: '' }); renderPFRows(); };
A['pf-rm'] = el => { PF.resep.splice(+el.dataset.i, 1); if (!PF.resep.length) PF.resep.push({ b: '', q: '' }); renderPFRows(); updPF(); };
A['pf-price'] = el => { PF.harga = +el.dataset.v; const f = $('form[data-f="produk"]'); f.harga.value = num(PF.harga); updPF(); };
F.produk = f => {
  const nama = PF.nama.trim(); if (!nama) { toast('Isi nama produk', 'bad'); return; }
  const resep = PF.resep.filter(r => r.b && n0(r.q) > 0).map(r => ({ b: r.b, q: n0(r.q) }));
  let id = PF.id;
  batch(() => {
    const old = id ? get('produk', id) : null;
    const rec = put('produk', Object.assign({}, old || {}, { nama, rasa: PF.rasa.trim(), satuan: (PF.satuan || 'pcs').trim(), harga: n0(PF.harga), yield: n0(PF.yield) > 0 ? n0(PF.yield) : 1, biayaLain: n0(PF.biayaLain), stokMin: n0(PF.stokMin), catatan: (PF.catatan || '').trim(), resep }));
    id = rec.id; if (!old && n0(PF.stokAwal) > 0) mut('awal', 'produk', rec.id, n0(PF.stokAwal), '', today(), 'Stok awal');
  });
  PF = null; toast('Produk tersimpan'); go('/produk');
};
A['pf-del'] = async () => {
  const ok = await confirmBox('Hapus produk?', `<b>${esc(pname(PF))}</b> akan dihapus. Nota lama tetap aman.`, 'Hapus', true);
  if (ok) { const id = PF.id; PF = null; del('produk', id); toast('Produk dihapus'); go('/produk'); }
};

/* ---------- PRODUKSI ---------- */
route(/^\/produksi$/, 'produksi', () => {
  const ls = all('produksi').sort((a, b) => b.tgl.localeCompare(a.tgl) || b._u - a._u);
  let h = '';
  if (!ls.length) h += empty('pot', 'Belum ada produksi', 'Catat produksi agar stok bahan berkurang &amp; stok produk bertambah otomatis.');
  h += `<div class="stack-sm">${ls.map(x => { const p = get('produk', x.produkId); return `<button type="button" class="row" data-act="prod-open" data-id="${x.id}"><div class="row-main"><b>${esc(p ? pname(p) : (x.nama || 'Produk dihapus'))}</b><small>${fdate(x.tgl)} · ${fq(x.batch)} batch</small></div><div class="row-end"><b>+${fq(x.hasil)}</b><small>HPP ${rp(x.hppUnit)}</small></div></button>`; }).join('')}</div>
  <a class="cta" href="#/produksi/new">${ic('plus')} Produksi baru</a>`;
  return page('Produksi', h, { sub: 'Bahan jadi produk' });
});
A['prod-open'] = el => {
  const x = get('produksi', el.dataset.id); if (!x) return; const p = get('produk', x.produkId);
  const use = all('mutasi').filter(m => m.ref === x.id && m.tipe === 'bahan').map(m => { const b = get('bahan', m.item); return `<li><span>${esc(b ? b.nama : 'Bahan')}</span><b class="neg">${fq(m.qty)} ${esc(b ? b.satuan : '')}</b></li>`; }).join('');
  openSheet('Detail produksi', `<p><b>${esc(p ? pname(p) : x.nama || 'Produk')}</b><br><span class="muted">${fdate(x.tgl)} · ${fq(x.batch)} batch → ${fq(x.hasil)} ${esc(p ? p.satuan : '')} · HPP ${rp(x.hppUnit)} / unit</span></p><div class="card-title">Bahan terpakai</div><ul class="hist">${use || '<li>-</li>'}</ul>${x.catatan ? `<p class="muted">${esc(x.catatan)}</p>` : ''}<button type="button" class="btn danger-o wide" data-act="prod-del" data-id="${x.id}">${ic('trash')} Batalkan produksi ini</button>`);
};
A['prod-del'] = async el => {
  const ok = await confirmBox('Batalkan produksi?', 'Stok bahan dikembalikan dan stok produk dikurangi sebesar hasil produksi ini.', 'Batalkan produksi', true);
  if (!ok) return; const id = el.dataset.id; batch(() => { delMutByRef(id); del('produksi', id); }); toast('Produksi dibatalkan');
};
let QF = null;
route(/^\/produksi\/new$/, 'produksi', ({ q, fresh }) => {
  const ps = all('produk').sort(sortName);
  if (!ps.length) return page('Produksi baru', empty('flask', 'Belum ada produk', 'Buat resep dulu.', `<button class="btn primary" data-go="/produk/new">Buat produk</button>`), { back: true });
  if (fresh || !QF) { const p = (q.get('p') && get('produk', q.get('p'))) || ps[0]; QF = { p: p.id, batch: 1, hasil: n0(p.yield) || 1, hasilManual: false, tgl: today(), catatan: '' }; }
  const body = `<form data-f="produksi" class="stack" autocomplete="off">
    <div class="card">${field('Produk / rasa', `<select name="p" data-ch="qf">${opts(ps, QF.p, x => [x.id, pname(x)])}</select>`)}
    <div class="grid2">${field('Jumlah batch', `<input name="batch" data-in="qf" inputmode="decimal" value="${fq(QF.batch)}" required>`)}${field('Hasil jadi (qty)', `<input name="hasil" data-in="qf" inputmode="decimal" value="${fq(QF.hasil)}" required>`)}</div>
    ${field('Tanggal', `<input type="date" name="tgl" data-in="qf" value="${QF.tgl}" required>`)}</div>
    <div class="card" id="qf-need"></div>
    ${field('Catatan', `<input name="catatan" data-in="qf" value="${esc(QF.catatan)}" placeholder="opsional">`)}
    <div class="row-btns sticky"><button class="btn primary grow">Simpan produksi</button></div></form>`;
  return { html: page('Produksi baru', body, { back: true, sub: 'Kurangi bahan, tambah stok' }), form: true, mount: updQF };
});
function qfCalc() {
  const p = get('produk', QF.p); if (!p) return null;
  const y = n0(p.yield) > 0 ? n0(p.yield) : 1, rows = (p.resep || []).map(r => { const b = get('bahan', r.b); if (!b) return null; const need = n0(r.q) * n0(QF.batch), have = stokB(b.id); return { b, need, have, kurang: have < need - 1e-9, biaya: need * hargaSat(b) }; }).filter(Boolean);
  const bahan = rows.reduce((a, r) => a + r.biaya, 0), hasil = n0(QF.hasil), hppUnit = hasil > 0 ? bahan / hasil + n0(p.biayaLain) : 0;
  return { p, y, rows, bahan, hasil, hppUnit };
}
function updQF() {
  const c = qfCalc(), el = $('#qf-need'); if (!c || !el) return;
  el.innerHTML = `<div class="card-title">Bahan yang dipakai</div>${c.rows.length ? `<ul class="hist">${c.rows.map(r => `<li><span>${esc(r.b.nama)}<small>stok ${fq(r.have)} ${esc(r.b.satuan)}${r.kurang ? ' · <em class="neg">kurang ' + fq(r.need - r.have) + '</em>' : ''}</small></span><b>${fq(r.need)} ${esc(r.b.satuan)}</b></li>`).join('')}</ul>` : '<p class="muted">Resep belum punya bahan.</p>'}<div class="hpp-row"><span>Biaya bahan</span><b>${rp(c.bahan)}</b></div><div class="hpp-row"><span>HPP per ${esc(c.p.satuan || 'unit')}</span><b>${rp(c.hppUnit)}</b></div>`;
}
I.qf = el => {
  const n = el.name;
  if (n === 'p') { const p = get('produk', el.value); QF.p = el.value; QF.hasil = n0(p.yield || 1) * n0(QF.batch); QF.hasilManual = false; const f = el.form; f.hasil.value = fq(QF.hasil); }
  else if (n === 'batch') { QF.batch = dec(el.value); const p = get('produk', QF.p); if (!QF.hasilManual) { QF.hasil = n0(p.yield || 1) * QF.batch; el.form.hasil.value = fq(QF.hasil); } }
  else if (n === 'hasil') { QF.hasil = dec(el.value); QF.hasilManual = true; }
  else QF[n] = el.value;
  updQF();
};
F.produksi = async f => {
  const c = qfCalc(); if (!c || n0(QF.batch) <= 0 || n0(QF.hasil) <= 0) { toast('Isi jumlah batch & hasil', 'bad'); return; }
  const kurang = c.rows.filter(r => r.kurang);
  if (kurang.length && !(await confirmBox('Stok bahan kurang', `Bahan berikut tidak cukup: <b>${kurang.map(r => esc(r.b.nama)).join(', ')}</b>. Stok akan menjadi minus. Lanjutkan?`, 'Tetap simpan'))) return;
  let pid; batch(() => {
    const pr = put('produksi', { tgl: QF.tgl, produkId: c.p.id, nama: pname(c.p), batch: n0(QF.batch), hasil: n0(QF.hasil), hppUnit: Math.round(c.hppUnit), total: Math.round(c.bahan), catatan: (QF.catatan || '').trim() });
    pid = pr.id; c.rows.forEach(r => mut('produksi', 'bahan', r.b.id, -r.need, pr.id, QF.tgl, 'Produksi ' + pname(c.p)));
    mut('produksi', 'produk', c.p.id, n0(QF.hasil), pr.id, QF.tgl, fq(QF.batch) + ' batch');
  });
  QF = null; ui.stokTab = 'produk'; toast('Produksi tersimpan, stok diperbarui'); go('/stok');
};

/* =====================================================================
   Bagian 4: Penjualan, Nota, Invoice, Pelanggan
   ===================================================================== */
const blankItem = () => ({ p: '', nama: '', rasa: '', qty: 1, harga: 0, hpp: 0 });
const dayLabel = d => d === today() ? 'Hari ini' : d === addDays(today(), -1) ? 'Kemarin' : fdayShort(d) + ' ' + d.slice(0, 4);
function filterSales(f, q) {
  const qq = (q || '').toLowerCase().trim();
  return salesSorted().filter(s => {
    const c = hitung(s);
    if (f === 'belum' && !(c.st === 'belum' || c.st === 'cicil')) return false;
    if (f === 'lunas' && c.st !== 'lunas') return false;
    if (f === 'batal' && c.st !== 'batal') return false;
    if (qq && !((s.pelangganNama || '').toLowerCase().includes(qq) || (s.no || '').toLowerCase().includes(qq))) return false;
    return true;
  });
}
function saleRow(s, href) {
  const c = hitung(s);
  return `<a class="row sale ${c.st === 'batal' ? 'dim' : ''}" href="#${href}"><div class="row-main"><b>${esc(s.pelangganNama || 'Umum')}</b><small>${esc(s.no)} · ${esc(s.jam || '')}</small><small class="sum">${esc(itemsSummary(s))}</small></div><div class="row-end"><b>${rp(c.total)}</b>${badge(c.st)}</div></a>`;
}
function salesListHtml(list, base) {
  if (!list.length) return empty('receipt', 'Belum ada nota', 'Catat penjualan atau buat invoice baru lewat tombol di bawah.');
  let h = '', last = '';
  for (const s of list) { if (s.tgl !== last) { last = s.tgl; h += `<div class="sec-title">${dayLabel(s.tgl)}</div>`; } h += saleRow(s, base + '/' + s.id); }
  return h;
}
const FILTERS = [['semua', 'Semua'], ['belum', 'Belum lunas'], ['lunas', 'Lunas'], ['batal', 'Batal']];
const searchBox = (id, val) => `<div class="search">${ic('search')}<input type="search" id="${id}" data-in="${id}" placeholder="Cari nama pelanggan / no. nota" value="${esc(val || '')}" autocomplete="off" aria-label="Cari"></div>`;

route(/^\/jual$/, 'jual', () => {
  const body = `${searchBox('q-jual', ui.qJual)}${pills(FILTERS, ui.jualFilter, 'jual-filter')}<div id="jual-list">${salesListHtml(filterSales(ui.jualFilter, ui.qJual), '/jual')}</div><a class="cta" href="#/jual/new">${ic('plus')} Penjualan baru</a>`;
  return page('Penjualan', body, { sub: 'Semua nota' });
});
A['jual-filter'] = el => { ui.jualFilter = el.dataset.v; render(); };
I['q-jual'] = el => { ui.qJual = el.value; $('#jual-list').innerHTML = salesListHtml(filterSales(ui.jualFilter, ui.qJual), '/jual'); };

route(/^\/invoice$/, 'invoice', () => {
  const body = `${searchBox('q-inv', ui.qInv)}${pills(FILTERS.slice(0, 3), ui.invFilter || 'semua', 'inv-filter')}<div id="inv-list">${salesListHtml(filterSales(ui.invFilter || 'semua', ui.qInv), '/invoice')}</div><a class="cta" href="#/jual/new?inv=1">${ic('plus')} Invoice baru</a>`;
  return page('Invoice', body, { sub: 'Ketuk nota untuk membuka invoice' });
});
A['inv-filter'] = el => { ui.invFilter = el.dataset.v; render(); };
I['q-inv'] = el => { ui.qInv = el.value; $('#inv-list').innerHTML = salesListHtml(filterSales(ui.invFilter || 'semua', ui.qInv), '/invoice'); };

/* ---------- form penjualan ---------- */
let SF = null;
function initSF(id, q) {
  if (id) {
    const s = get('penjualan', id); if (!s) return null;
    const prev = {}; if (!s.batal) (s.items || []).forEach(i => { if (i.p) prev[i.p] = (prev[i.p] || 0) + n0(i.qty); });
    return { id, no: s.no, tgl: s.tgl, jam: s.jam, jatuhTempo: s.jatuhTempo || '', pel: s.pelangganNama === 'Umum' ? '' : (s.pelangganNama || ''), hp: (get('pelanggan', s.pelangganId) || {}).hp || '', items: JSON.parse(JSON.stringify(s.items || [])), diskon: n0(s.diskon), ongkir: n0(s.ongkir), pajakPct: n0(s.pajakPct), metode: s.metode || 'Tunai', status: null, dp: 0, catatan: s.catatan || '', bayar: s.bayar || [], batal: !!s.batal, prev };
  }
  const f = { id: '', no: '', tgl: today(), jam: hm(), jatuhTempo: '', pel: '', hp: '', items: [blankItem()], diskon: 0, ongkir: 0, pajakPct: n0(S().pajak), metode: 'Tunai', status: q.get('inv') ? 'belum' : 'lunas', dp: 0, catatan: '', bayar: [], batal: false, prev: {}, inv: !!q.get('inv') };
  if (q.get('inv')) f.jatuhTempo = addDays(today(), 7);
  const pc = q.get('pel') && get('pelanggan', q.get('pel')); if (pc) { f.pel = pc.nama; f.hp = pc.hp || ''; }
  const pp = q.get('p') && get('produk', q.get('p')); if (pp) f.items = [Object.assign(blankItem(), { p: pp.id, nama: pp.nama, rasa: pp.rasa, harga: pp.harga, hpp: hppProduk(pp) })];
  return f;
}
function sfItemsHtml() {
  const ps = all('produk').sort(sortName), groups = {};
  ps.forEach(p => (groups[p.nama] = groups[p.nama] || []).push(p));
  const sel = v => `<option value="">- Item bebas (tanpa stok) -</option>` + Object.keys(groups).map(g => `<optgroup label="${esc(g)}">${groups[g].map(p => `<option value="${p.id}" ${p.id === v ? 'selected' : ''}>${esc(p.rasa || 'Original')} · stok ${fq(stokP(p.id))}</option>`).join('')}</optgroup>`).join('');
  return SF.items.map((it, i) => `<div class="sfi"><div class="sfi-top"><select data-ch="sf-p" data-i="${i}" aria-label="Produk">${sel(it.p)}</select><button type="button" class="icon-btn sm" data-act="sf-del" data-i="${i}" aria-label="Hapus item">${ic('x')}</button></div>
    ${it.p ? '' : `<input class="sfi-nama" data-in="sf-nama" data-i="${i}" placeholder="Nama item / jasa" value="${esc(it.nama)}" aria-label="Nama item">`}
    <div class="sfi-row"><div class="qty"><button type="button" data-act="sf-q" data-i="${i}" data-d="-1" aria-label="Kurangi">${ic('minus')}</button><input data-in="sf-qty" data-i="${i}" inputmode="decimal" value="${fq(it.qty)}" aria-label="Jumlah"><button type="button" data-act="sf-q" data-i="${i}" data-d="1" aria-label="Tambah">${ic('plus')}</button></div><span class="x">×</span><input class="rp" inputmode="numeric" data-in="sf-harga" data-i="${i}" value="${it.harga ? num(it.harga) : ''}" placeholder="Harga" aria-label="Harga satuan"><b class="sub" id="sfs-${i}"></b></div><small class="stk" id="sfk-${i}"></small></div>`).join('');
}
function sfPayHtml() {
  if (SF.id) {
    const c = hitung({ items: SF.items, diskon: SF.diskon, ongkir: SF.ongkir, pajakPct: SF.pajakPct, bayar: SF.bayar });
    return `<div class="card-title">Pembayaran</div><p class="muted">Sudah dibayar <b>${rp(c.paid)}</b> dari ${rp(c.total)}. Tambah / ubah pembayaran lewat halaman detail nota.</p>`;
  }
  return `<div class="card-title">Pembayaran</div>${pills([['lunas', 'Lunas'], ['cicil', 'DP / Cicil'], ['belum', 'Belum bayar']], SF.status, 'sf-status')}
    ${SF.status !== 'belum' ? field('Dibayar dengan', `<select name="metode" data-in="sf-f">${opts(METODE, SF.metode, x => [x, x])}</select>`) : ''}
    ${SF.status === 'cicil' ? field('Jumlah DP / dibayar (Rp)', rpIn('dp', SF.dp, 'data-in="sf-f"')) : ''}`;
}
route(/^\/jual\/new$/, 'jual', ({ q, fresh }) => sfPage(null, q, fresh));
route(/^\/jual\/([\w-]+)\/edit$/, 'jual', ({ m, q, fresh }) => sfPage(m[1], q, fresh));
function sfPage(id, q, fresh) {
  if (fresh || !SF) SF = initSF(id, q);
  if (!SF) return page('Nota tidak ditemukan', empty('receipt', 'Nota tidak ditemukan', '', `<button class="btn primary" data-go="/jual">Kembali</button>`), { back: true });
  const pels = all('pelanggan').sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  const body = `<form data-f="jual" class="stack" autocomplete="off">
    <div class="card">${field('Pelanggan', `<input name="pel" data-in="sf-f" list="dl-pel" value="${esc(SF.pel)}" placeholder="Nama pelanggan (kosongkan = Umum)">`)}<datalist id="dl-pel">${pels.map(p => `<option value="${esc(p.nama)}">`).join('')}</datalist>
      <div class="grid2">${field('No. HP / WA', `<input name="hp" data-in="sf-f" inputmode="tel" value="${esc(SF.hp)}" placeholder="08xx (opsional)">`)}${field('Tanggal', `<input type="date" name="tgl" data-in="sf-f" value="${SF.tgl}" required>`)}</div></div>
    <div class="card"><div class="card-title">Item</div><div id="sf-items">${sfItemsHtml()}</div><button type="button" class="btn ghost sm" data-act="sf-add">${ic('plus')} Tambah item</button></div>
    <div class="card"><div class="card-title">Biaya &amp; total</div>
      <div class="grid2">${field('Diskon (Rp)', rpIn('diskon', SF.diskon, 'data-in="sf-f"'))}${field('Pengiriman (Rp)', rpIn('ongkir', SF.ongkir, 'data-in="sf-f"'))}</div>
      <div class="grid2">${field('Pajak (%)', `<input name="pajakPct" data-in="sf-f" inputmode="decimal" value="${SF.pajakPct ? fq(SF.pajakPct) : ''}" placeholder="0">`)}${field('Jatuh tempo', `<input type="date" name="jatuhTempo" data-in="sf-f" value="${SF.jatuhTempo}">`)}</div>
      <div class="hpp-row"><span>Subtotal</span><b id="sf-sub"></b></div><div class="hpp-row"><span>Pajak</span><b id="sf-pjk"></b></div><div class="hpp-row big"><span>Total tagihan</span><b id="sf-total"></b></div><div class="hpp-row"><span>Estimasi laba nota</span><b id="sf-laba"></b></div></div>
    <div class="card" id="sf-pay">${sfPayHtml()}</div>
    <div class="card">${field('Catatan nota / invoice', `<input name="catatan" data-in="sf-f" value="${esc(SF.catatan)}" placeholder="opsional">`)}</div>
    <div class="row-btns sticky"><div class="sf-tot"><small>Total</small><b id="sf-total2"></b></div><button class="btn primary grow">${SF.id ? 'Simpan perubahan' : 'Simpan nota'}</button></div></form>`;
  return { html: page(SF.id ? 'Edit nota' : (SF.inv ? 'Invoice baru' : 'Penjualan baru'), body, { back: true, sub: SF.id ? esc(SF.no) : 'Nota &amp; stok otomatis' }), form: true, mount: updSF };
}
function updSF() {
  if (!SF) return;
  const c = hitung({ items: SF.items, diskon: SF.diskon, ongkir: SF.ongkir, pajakPct: SF.pajakPct, bayar: SF.bayar });
  const set = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
  SF.items.forEach((it, i) => {
    set('sfs-' + i, rp(n0(it.qty) * n0(it.harga)));
    const k = document.getElementById('sfk-' + i); if (!k) return;
    if (it.p) {
      const p = get('produk', it.p), tot = SF.items.filter(x => x.p === it.p).reduce((a, x) => a + n0(x.qty), 0), av = stokP(it.p) + n0(SF.prev[it.p]);
      k.className = 'stk' + (tot > av + 1e-9 ? ' neg' : ''); k.textContent = p ? (tot > av + 1e-9 ? `Stok kurang: tersedia ${fq(av)} ${p.satuan || ''}` : `Stok tersedia ${fq(av)} ${p.satuan || ''} · HPP ${rp(hppProduk(p))}`) : '';
    } else k.textContent = '';
  });
  set('sf-sub', rp(c.sub)); set('sf-pjk', rp(c.pajak)); set('sf-total', rp(c.total)); set('sf-total2', rp(c.total)); set('sf-laba', rp(c.laba));
}
const sfRerender = () => { $('#sf-items').innerHTML = sfItemsHtml(); updSF(); };
A['sf-add'] = () => { SF.items.push(blankItem()); sfRerender(); };
A['sf-del'] = el => { SF.items.splice(+el.dataset.i, 1); if (!SF.items.length) SF.items.push(blankItem()); sfRerender(); };
A['sf-q'] = el => { const it = SF.items[+el.dataset.i], v = Math.max(0, r4(n0(it.qty) + (+el.dataset.d))); it.qty = v; const inp = el.parentNode.querySelector('input'); inp.value = fq(v); updSF(); };
A['sf-status'] = el => { SF.status = el.dataset.v; $('#sf-pay').innerHTML = sfPayHtml(); };
I['sf-p'] = el => {
  const it = SF.items[+el.dataset.i], p = get('produk', el.value);
  if (p) Object.assign(it, { p: p.id, nama: p.nama, rasa: p.rasa || '', harga: p.harga, hpp: hppProduk(p) }); else Object.assign(it, { p: '', rasa: '', hpp: 0, nama: '' });
  sfRerender();
};
I['sf-nama'] = el => { SF.items[+el.dataset.i].nama = el.value; };
I['sf-qty'] = el => { SF.items[+el.dataset.i].qty = dec(el.value); updSF(); };
I['sf-harga'] = el => { SF.items[+el.dataset.i].harga = rpNum(el.value); updSF(); };
I['sf-f'] = el => {
  const n = el.name, v = el.value;
  if (n === 'diskon' || n === 'ongkir' || n === 'dp') SF[n] = rpNum(v); else if (n === 'pajakPct') SF[n] = dec(v); else SF[n] = v;
  if (n === 'pel') { const c = all('pelanggan').find(x => x.nama.toLowerCase() === v.trim().toLowerCase()); if (c && c.hp) { SF.hp = c.hp; const h = el.form.hp; if (h) h.value = c.hp; } }
  updSF();
};
F.jual = async () => {
  const items = SF.items.filter(i => n0(i.qty) > 0 && (i.p || (i.nama || '').trim()));
  if (!items.length) { toast('Tambahkan minimal 1 item dengan jumlah > 0', 'bad'); return; }
  const c = hitung({ items, diskon: SF.diskon, ongkir: SF.ongkir, pajakPct: SF.pajakPct, bayar: SF.bayar });
  if (!SF.id && SF.status === 'cicil' && SF.dp <= 0) { toast('Isi jumlah DP', 'bad'); return; }
  const need = {}; items.forEach(i => { if (i.p) need[i.p] = (need[i.p] || 0) + n0(i.qty); });
  const kurang = Object.keys(need).filter(pid => get('produk', pid) && need[pid] > stokP(pid) + n0(SF.prev[pid]) + 1e-9).map(pid => esc(pname(get('produk', pid))));
  if (kurang.length && !(await confirmBox('Stok produk kurang', `Stok <b>${kurang.join(', ')}</b> tidak cukup. Stok akan menjadi minus (catat produksi untuk menambah). Tetap simpan nota?`, 'Tetap simpan'))) return;
  let sid = SF.id;
  batch(() => {
    const nm = (SF.pel || '').trim(); let pel = null;
    if (nm) {
      pel = all('pelanggan').find(x => x.nama.toLowerCase() === nm.toLowerCase());
      if (!pel) pel = put('pelanggan', { nama: nm, hp: (SF.hp || '').trim(), alamat: '', catatan: '' });
      else if ((SF.hp || '').trim() && pel.hp !== SF.hp.trim()) pel = put('pelanggan', Object.assign({}, pel, { hp: SF.hp.trim() }));
    }
    const old = sid ? get('penjualan', sid) : null;
    const rec = Object.assign({}, old || {}, { no: old ? old.no : nextNo(SF.tgl), tgl: SF.tgl, jam: SF.jam || hm(), jatuhTempo: SF.jatuhTempo || '', pelangganId: pel ? pel.id : '', pelangganNama: pel ? pel.nama : 'Umum', items: items.map(i => ({ p: i.p || '', nama: i.nama, rasa: i.rasa || '', qty: n0(i.qty), harga: n0(i.harga), hpp: Math.round(n0(i.hpp)) })), diskon: SF.diskon, ongkir: SF.ongkir, pajakPct: SF.pajakPct, catatan: (SF.catatan || '').trim(), batal: !!SF.batal });
    if (!old) {
      rec.metode = SF.metode; rec.bayar = [];
      if (SF.status === 'lunas') rec.bayar.push({ id: uid(), tgl: SF.tgl, jumlah: c.total, metode: SF.metode, ket: 'Pelunasan' });
      else if (SF.status === 'cicil') rec.bayar.push({ id: uid(), tgl: SF.tgl, jumlah: Math.min(SF.dp, c.total), metode: SF.metode, ket: 'DP' });
    }
    const saved = put('penjualan', rec); sid = saved.id; rebuildSaleMut(saved);
  });
  SF = null; toast('Nota tersimpan'); go('/jual/' + sid);
};

/* ---------- detail nota ---------- */
function shareText(s) {
  const c = hitung(s), b = S();
  let t = `*${(b.nama || 'NOTA').toUpperCase()}*\nNota: ${s.no}\nTanggal: ${fdateNum(s.tgl)}\nPelanggan: ${s.pelangganNama || 'Umum'}\n--------------------\n`;
  t += (s.items || []).map(i => `${i.nama}${i.rasa ? ' ' + i.rasa : ''}\n  ${fq(i.qty)} x ${num(i.harga)} = ${num(i.qty * i.harga)}`).join('\n') + '\n--------------------\n';
  t += `Subtotal: ${rp(c.sub)}\n`; if (c.diskon) t += `Diskon: -${rp(c.diskon)}\n`; if (c.pajak) t += `Pajak: ${rp(c.pajak)}\n`; if (c.ongkir) t += `Pengiriman: ${rp(c.ongkir)}\n`;
  t += `*TOTAL: ${rp(c.total)}*\n`; if (c.paid) t += `Dibayar: ${rp(c.paid)}\n`; t += c.sisa > 0 ? `*SISA TAGIHAN: ${rp(c.sisa)}*\n` : `Status: LUNAS\n`;
  if (c.sisa > 0 && (b.noRek || b.bank)) t += `\nTransfer ke: ${b.bank || ''} ${b.noRek || ''} a.n. ${b.an || ''}\n`;
  return t + `\nTerima kasih 🙏`;
}
route(/^\/jual\/([\w-]+)$/, 'jual', ({ m }) => {
  const s = get('penjualan', m[1]); if (!s) return page('Nota tidak ditemukan', empty('receipt', 'Nota tidak ditemukan', 'Mungkin sudah dihapus.', `<button class="btn primary" data-go="/jual">Kembali</button>`), { back: true });
  const c = hitung(s), pel = get('pelanggan', s.pelangganId);
  const items = (s.items || []).map(i => `<div class="li"><div><b>${esc(i.nama)}${i.rasa ? ' · ' + esc(i.rasa) : ''}</b><small>${fq(i.qty)} × ${rp(i.harga)}</small></div><b>${rp(i.qty * i.harga)}</b></div>`).join('');
  const pays = (s.bayar || []).map(b => `<div class="li"><div><b>${rp(b.jumlah)}</b><small>${fdate(b.tgl)} · ${esc(b.metode || '')}${b.ket ? ' · ' + esc(b.ket) : ''}</small></div><button type="button" class="icon-btn sm" data-act="bayar-del" data-id="${s.id}" data-b="${b.id}" aria-label="Hapus pembayaran">${ic('trash')}</button></div>`).join('');
  const body = `<section class="hero"><div class="notch"><span>${esc(s.no)}</span></div><small>Total tagihan</small><div class="hero-n">${rp(c.total)}</div><div class="hero-st">${badge(c.st)}${c.sisa > 0 && c.st !== 'batal' ? `<span class="hero-s">Sisa ${rp(c.sisa)}</span>` : ''}</div></section>
    <div class="acts4"><a class="act" href="#/nota/${s.id}">${ic('receipt')}<span>Nota</span></a><a class="act" href="#/invoice/${s.id}">${ic('file')}<span>Invoice</span></a><button type="button" class="act" data-act="wa" data-id="${s.id}">${ic('chat')}<span>WhatsApp</span></button><a class="act" href="#/jual/${s.id}/edit">${ic('pencil')}<span>Edit</span></a></div>
    <div class="card"><div class="card-title">Pelanggan</div><p class="who"><b>${esc(s.pelangganNama || 'Umum')}</b>${pel && pel.hp ? `<small>${esc(pel.hp)}</small>` : ''}</p><small class="muted">${fdate(s.tgl)} ${esc(s.jam || '')}${s.jatuhTempo ? ' · jatuh tempo ' + fdate(s.jatuhTempo) : ''}</small>${pel ? `<a class="more" href="#/pelanggan/${pel.id}">Lihat semua nota ${esc(pel.nama)}</a>` : ''}</div>
    <div class="card"><div class="card-title">Rincian</div>${items}<div class="sumrows"><div><span>Subtotal</span><b>${rp(c.sub)}</b></div>${c.diskon ? `<div><span>Diskon</span><b>-${rp(c.diskon)}</b></div>` : ''}${c.ongkir ? `<div><span>Pengiriman</span><b>${rp(c.ongkir)}</b></div>` : ''}${c.pajak ? `<div><span>Pajak ${fq(s.pajakPct)}%</span><b>${rp(c.pajak)}</b></div>` : ''}<div class="big"><span>Total</span><b>${rp(c.total)}</b></div></div>
      <div class="sumrows dim"><div><span>HPP</span><b>${rp(c.hpp)}</b></div><div><span>Laba kotor nota</span><b class="${c.laba < 0 ? 'neg' : 'pos'}">${rp(c.laba)}</b></div></div></div>
    <div class="card"><div class="card-title">Pembayaran <small>${rp(c.paid)} dari ${rp(c.total)}</small></div>${pays || '<p class="muted">Belum ada pembayaran.</p>'}${c.sisa > 0 && !s.batal ? `<button type="button" class="btn primary wide mt" data-act="bayar" data-id="${s.id}">${ic('plus')} Catat pembayaran</button>` : ''}</div>
    ${s.catatan ? `<div class="card"><div class="card-title">Catatan</div><p>${esc(s.catatan)}</p></div>` : ''}
    <div class="row-btns"><button type="button" class="btn ghost grow" data-act="sale-batal" data-id="${s.id}">${s.batal ? 'Aktifkan lagi' : 'Batalkan nota'}</button><button type="button" class="btn danger-o" data-act="sale-del" data-id="${s.id}" aria-label="Hapus nota">${ic('trash')}</button></div>`;
  return page('Nota ' + s.no, body, { back: true, sub: esc(s.pelangganNama || 'Umum') });
});
A.bayar = el => {
  const s = get('penjualan', el.dataset.id); if (!s) return; const c = hitung(s);
  openSheet('Catat pembayaran', `<form data-f="bayar" class="stack" autocomplete="off"><input type="hidden" name="id" value="${s.id}"><p class="muted">Sisa tagihan <b>${rp(c.sisa)}</b></p>
    ${field('Jumlah dibayar (Rp)', rpIn('jumlah', c.sisa, 'required'))}<div class="grid2">${field('Metode', `<select name="metode">${opts(METODE, 'Transfer', x => [x, x])}</select>`)}${field('Tanggal', `<input type="date" name="tgl" value="${today()}" required>`)}</div>
    ${field('Keterangan', `<input name="ket" placeholder="opsional">`)}<button class="btn primary wide">Simpan pembayaran</button></form>`);
};
F.bayar = f => {
  const s = get('penjualan', f.id.value), j = rpNum(f.jumlah.value); if (!s || j <= 0) { toast('Isi jumlah pembayaran', 'bad'); return; }
  put('penjualan', Object.assign({}, s, { bayar: [...(s.bayar || []), { id: uid(), tgl: f.tgl.value || today(), jumlah: j, metode: f.metode.value, ket: f.ket.value.trim() }] }));
  closeSheet(); toast('Pembayaran dicatat');
};
A['bayar-del'] = async el => {
  const s = get('penjualan', el.dataset.id); if (!s) return;
  if (await confirmBox('Hapus pembayaran?', 'Catatan pembayaran ini akan dihapus.', 'Hapus', true)) put('penjualan', Object.assign({}, s, { bayar: (s.bayar || []).filter(b => b.id !== el.dataset.b) }));
};
A['sale-batal'] = async el => {
  const s = get('penjualan', el.dataset.id); if (!s) return;
  if (!s.batal && !(await confirmBox('Batalkan nota?', 'Stok produk dikembalikan dan nota tidak dihitung di laporan. Nota tetap tersimpan.', 'Batalkan nota', true))) return;
  batch(() => { const n = put('penjualan', Object.assign({}, s, { batal: !s.batal })); rebuildSaleMut(n); }); toast(s.batal ? 'Nota diaktifkan lagi' : 'Nota dibatalkan');
};
A['sale-del'] = async el => {
  const s = get('penjualan', el.dataset.id); if (!s) return;
  if (!(await confirmBox('Hapus nota permanen?', `Nota <b>${esc(s.no)}</b> dihapus dan stok dikembalikan. Tidak bisa dibatalkan.`, 'Hapus', true))) return;
  batch(() => { delMutByRef(s.id); del('penjualan', s.id); }); toast('Nota dihapus'); go('/jual');
};
A.wa = el => {
  if (PV) { toast('WhatsApp aktif di versi GitHub (tidak bisa dibuka dari pratinjau)'); return; }
  const s = get('penjualan', el.dataset.id); if (!s) return; const pel = get('pelanggan', s.pelangganId) || {};
  window.open('https://wa.me/' + phoneIntl(pel.hp) + '?text=' + encodeURIComponent(shareText(s)), '_blank', 'noopener');
};

/* ---------- dokumen: nota & invoice ---------- */
function bizBlock() {
  const b = S(), line = [b.alamat, b.hp, b.email].filter(Boolean).join(' · ');
  return `<div class="biz">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : ''}<div><b>${esc(b.nama || 'Nama Usaha')}</b>${line ? `<small>${esc(line)}</small>` : ''}</div></div>`;
}
function notaHtml(s) {
  const c = hitung(s), b = S();
  return `<div class="paper nota" id="paper">${bizBlock()}<hr class="dash"><div class="kv"><span>No</span><b>${esc(s.no)}</b></div><div class="kv"><span>Tanggal</span><b>${fdateNum(s.tgl)} ${esc(s.jam || '')}</b></div><div class="kv"><span>Pelanggan</span><b>${esc(s.pelangganNama || 'Umum')}</b></div><hr class="dash">
    ${(s.items || []).map(i => `<div class="ni"><div>${esc(i.nama)}${i.rasa ? ` <i>${esc(i.rasa)}</i>` : ''}</div><div class="kv"><span>${fq(i.qty)} × ${num(i.harga)}</span><b>${num(i.qty * i.harga)}</b></div></div>`).join('')}<hr class="dash">
    <div class="kv"><span>Subtotal</span><b>${num(c.sub)}</b></div>${c.diskon ? `<div class="kv"><span>Diskon</span><b>-${num(c.diskon)}</b></div>` : ''}${c.ongkir ? `<div class="kv"><span>Pengiriman</span><b>${num(c.ongkir)}</b></div>` : ''}${c.pajak ? `<div class="kv"><span>Pajak ${fq(s.pajakPct)}%</span><b>${num(c.pajak)}</b></div>` : ''}
    <div class="kv tot"><span>TOTAL</span><b>${rp(c.total)}</b></div><div class="kv"><span>Dibayar</span><b>${rp(c.paid)}</b></div>
    ${c.st === 'batal' ? '<div class="stamp bad">DIBATALKAN</div>' : c.sisa > 0 ? `<div class="kv tot"><span>SISA</span><b>${rp(c.sisa)}</b></div>` : '<div class="stamp">LUNAS</div>'}
    <hr class="dash"><p class="foot">${esc(b.notaFooter || '')}</p></div>`;
}
function invoiceHtml(s) {
  const c = hitung(s), b = S(), pel = get('pelanggan', s.pelangganId) || {};
  const rows = (s.items || []).map(i => `<tr><td>${esc(i.nama)}${i.rasa ? ' ' + esc(i.rasa) : ''}</td><td class="c">${fq(i.qty)}</td><td class="c">${num(i.harga)}</td><td class="c">${num(i.qty * i.harga)}</td></tr>`).join('');
  const ig = (b.ig || '').trim(), contact = [ig ? `INSTAGRAM : ${(ig.startsWith('@') ? ig : '@' + ig).toUpperCase()}` : '', b.hp ? `WHATSAPP : ${b.hp}` : '', b.email ? `EMAIL : ${b.email.toUpperCase()}` : ''].filter(Boolean);
  const head = [b.alamat, b.hp].filter(Boolean).join(' · ');
  return `<div class="paper inv" id="paper">
    <div class="inv-top"><div class="inv-brand">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : ''}<div><b>${esc((b.nama || 'NAMA USAHA').toUpperCase())}</b>${head ? `<small>${esc(head)}</small>` : ''}</div></div><h2>INVOICE</h2></div>
    <div class="inv-meta"><div class="inv-to"><h4>TAGIHAN KEPADA</h4><b>${esc(s.pelangganNama || 'Umum')}</b>${pel.hp ? `<span>${esc(pel.hp)}</span>` : ''}${pel.alamat ? `<span>${esc(pel.alamat)}</span>` : ''}</div>
      <div class="inv-kv"><span>TAGIHAN</span><b>${esc(s.no)}</b><span>TANGGAL PEMBUATAN</span><b>${fdateNum(s.tgl)}</b>${s.jatuhTempo ? `<span>JATUH TEMPO</span><b>${fdateNum(s.jatuhTempo)}</b>` : ''}<span>STATUS</span><b class="stt ${c.st}">${c.st === 'lunas' ? 'LUNAS' : c.st === 'batal' ? 'BATAL' : 'BELUM LUNAS'}</b></div></div>
    <table class="inv-t"><thead><tr><th>DESKRIPSI</th><th>JUMLAH</th><th>HARGA SATUAN</th><th>TOTAL</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="inv-sum"><tbody><tr><td>SUB TOTAL</td><td>${num(c.sub)}</td></tr>${c.diskon ? `<tr><td>DISKON</td><td>-${num(c.diskon)}</td></tr>` : ''}${c.pajak ? `<tr><td>PAJAK ${fq(s.pajakPct)}%</td><td>${num(c.pajak)}</td></tr>` : ''}<tr><td>PENGIRIMAN</td><td>${num(c.ongkir)}</td></tr><tr class="t"><td>TOTAL</td><td>${num(c.total)}</td></tr>${c.paid ? `<tr><td>DIBAYAR</td><td>${num(c.paid)}</td></tr><tr class="t"><td>SISA TAGIHAN</td><td>${num(c.sisa)}</td></tr>` : ''}</tbody></table>
    ${(b.noRek || b.an) ? `<div class="inv-pay"><small>nomor rekening</small><div class="rek">${esc(b.noRek)}</div><b>${esc(((b.bank || '') + ' ' + (b.an || '')).trim().toLowerCase())}</b></div>` : ''}
    ${(s.catatan || b.catatanInv) ? `<div class="inv-note"><small>CATATAN</small><p>${esc(s.catatan || b.catatanInv).replace(/\n/g, '<br>')}</p></div>` : ''}
    <div class="inv-thanks">${esc(b.terima || '').split('\n').map(x => `<div>${x}</div>`).join('')}</div>
    <div class="inv-contact"><b>${esc(b.kontak || 'CONTACT ME :')}</b>${contact.map(x => `<div>${esc(x)}</div>`).join('')}</div></div>`;
}
function docPage(kind, s) {
  const html = kind === 'nota' ? notaHtml(s) : invoiceHtml(s);
  const other = kind === 'nota' ? `<a class="btn ghost" href="#/invoice/${s.id}">${ic('file')} Invoice</a>` : `<a class="btn ghost" href="#/nota/${s.id}">${ic('receipt')} Nota</a>`;
  return page(kind === 'nota' ? 'Nota' : 'Invoice', `<div class="doc">${html}</div><div class="doc-acts"><button type="button" class="btn primary" data-act="print" data-k="${kind}">${ic('printer')} Cetak / PDF</button><button type="button" class="btn ghost" data-act="wa" data-id="${s.id}">${ic('chat')} WhatsApp</button><button type="button" class="btn ghost" data-act="share" data-id="${s.id}">${ic('share')} Bagikan</button>${other}<a class="btn ghost" href="#/jual/${s.id}/edit">${ic('pencil')} Edit data</a></div>`, { back: true, sub: esc(s.no), cls: 'docpg' });
}
route(/^\/nota\/([\w-]+)$/, 'pelanggan', ({ m }) => { const s = get('penjualan', m[1]); return s ? docPage('nota', s) : page('Nota', empty('receipt', 'Nota tidak ditemukan'), { back: true }); });
route(/^\/invoice\/([\w-]+)$/, 'invoice', ({ m }) => { const s = get('penjualan', m[1]); return s ? docPage('invoice', s) : page('Invoice', empty('file', 'Invoice tidak ditemukan'), { back: true }); });
function printDoc(kind) {
  if (PV) { toast('Cetak/PDF aktif di versi GitHub (diblokir di pratinjau)'); return; }
  $('#pgstyle').textContent = kind === 'nota' ? '@page{size:80mm auto;margin:4mm}' : '@page{size:A4;margin:12mm}';
  document.body.dataset.print = kind; setTimeout(() => window.print(), 60);
}
window.addEventListener('afterprint', () => { delete document.body.dataset.print; });
A.print = el => printDoc(el.dataset.k);
A.share = async el => {
  const s = get('penjualan', el.dataset.id); if (!s) return; const text = shareText(s);
  try { if (navigator.share) { await navigator.share({ title: 'Nota ' + s.no, text }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('Teks nota disalin'); } catch (e) { toast('Tidak bisa membagikan di perangkat ini', 'bad'); }
};

/* ---------- pelanggan ---------- */
function custStats() {
  const m = {};
  for (const s of all('penjualan')) { if (s.batal || !s.pelangganId) continue; const c = hitung(s), o = m[s.pelangganId] || (m[s.pelangganId] = { n: 0, total: 0, sisa: 0, last: '' }); o.n++; o.total += c.total; o.sisa += c.sisa; if (s.tgl > o.last) o.last = s.tgl; }
  return m;
}
route(/^\/pelanggan$/, 'pelanggan', () => {
  const cs = custStats(), list = all('pelanggan').sort((a, b) => a.nama.localeCompare(b.nama, 'id')), q = (ui.qPel || '').toLowerCase();
  const rows = list.filter(p => !q || p.nama.toLowerCase().includes(q)).map(p => { const o = cs[p.id] || { n: 0, total: 0, sisa: 0 }; return `<a class="row" href="#/pelanggan/${p.id}"><span class="av sm">${esc(p.nama.charAt(0).toUpperCase())}</span><div class="row-main"><b>${esc(p.nama)}</b><small>${o.n} nota · belanja ${rp(o.total)}</small></div><div class="row-end">${o.sisa > 0 ? `<span class="chip st-belum">${ic('alert')}Sisa ${rp(o.sisa)}</span>` : (o.n ? `<span class="chip st-lunas">${ic('check')}Lunas</span>` : '')}</div></a>`; }).join('');
  const body = `${searchBox('q-pel', ui.qPel).replace('Cari nama pelanggan / no. nota', 'Cari pelanggan')}<div id="pel-list" class="stack-sm">${rows || empty('users', 'Belum ada pelanggan', 'Pelanggan otomatis tersimpan saat kamu mencatat penjualan.')}</div><button type="button" class="cta" data-act="pel-new">${ic('plus')} Pelanggan baru</button>`;
  return page('Pelanggan & Nota', body, { sub: 'Nota tiap orang' });
});
I['q-pel'] = el => { ui.qPel = el.value; render(); const i = $('#q-pel'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
A['pel-new'] = () => sheetPel();
A['pel-edit'] = el => sheetPel(el.dataset.id);
function sheetPel(id) {
  const p = id ? get('pelanggan', id) : null;
  openSheet(p ? 'Edit pelanggan' : 'Pelanggan baru', `<form data-f="pel" class="stack" autocomplete="off"><input type="hidden" name="id" value="${id || ''}">${field('Nama', `<input name="nama" required value="${esc(p ? p.nama : '')}">`)}${field('No. HP / WA', `<input name="hp" inputmode="tel" value="${esc(p ? p.hp || '' : '')}" placeholder="08xx">`)}${field('Alamat', `<input name="alamat" value="${esc(p ? p.alamat || '' : '')}" placeholder="opsional">`)}${field('Catatan', `<input name="catatan" value="${esc(p ? p.catatan || '' : '')}" placeholder="opsional">`)}<button class="btn primary wide">Simpan</button></form>`);
}
F.pel = f => {
  const id = f.id.value, nama = f.nama.value.trim(); if (!nama) return;
  batch(() => {
    const old = id ? get('pelanggan', id) : null;
    put('pelanggan', Object.assign({}, old || {}, { nama, hp: f.hp.value.trim(), alamat: f.alamat.value.trim(), catatan: f.catatan.value.trim() }));
    if (old && old.nama !== nama) for (const s of all('penjualan')) if (s.pelangganId === id) put('penjualan', Object.assign({}, s, { pelangganNama: nama }));
  });
  closeSheet(); toast('Pelanggan tersimpan');
};
route(/^\/pelanggan\/([\w-]+)$/, 'pelanggan', ({ m }) => {
  const p = get('pelanggan', m[1]); if (!p) return page('Pelanggan', empty('users', 'Pelanggan tidak ditemukan', '', `<button class="btn primary" data-go="/pelanggan">Kembali</button>`), { back: true });
  const sales = salesSorted().filter(s => s.pelangganId === p.id), o = custStats()[p.id] || { n: 0, total: 0, sisa: 0 };
  const cards = sales.map(s => { const c = hitung(s); return `<div class="card nota-card ${c.st === 'batal' ? 'dim' : ''}"><div class="nc-h"><div><b>${esc(s.no)}</b><small>${fdate(s.tgl)}</small></div>${badge(c.st)}</div><p class="sum">${esc(itemsSummary(s))}</p><div class="nc-f"><b>${rp(c.total)}</b>${c.sisa > 0 && c.st !== 'batal' ? `<small class="neg">sisa ${rp(c.sisa)}</small>` : ''}</div><div class="mini-links"><a href="#/nota/${s.id}">${ic('receipt')}Nota</a><a href="#/invoice/${s.id}">${ic('file')}Invoice</a><a href="#/jual/${s.id}">${ic('eye')}Detail</a></div></div>`; }).join('');
  const body = `<section class="hero"><div class="notch"><span>${o.n} nota</span></div><small>Total belanja</small><div class="hero-n">${rp(o.total)}</div><div class="hero-st">${o.sisa > 0 ? `<span class="chip st-belum">${ic('alert')}Belum dibayar ${rp(o.sisa)}</span>` : `<span class="chip st-lunas">${ic('check')}Tidak ada tunggakan</span>`}</div></section>
    <div class="acts4"><a class="act" href="#/jual/new?pel=${p.id}">${ic('plus')}<span>Nota baru</span></a><a class="act" href="#/rekap/${p.id}">${ic('file')}<span>Rekap</span></a>${p.hp ? `<a class="act" href="https://wa.me/${phoneIntl(p.hp)}" target="_blank" rel="noopener">${ic('chat')}<span>WhatsApp</span></a>` : `<button type="button" class="act" data-act="pel-edit" data-id="${p.id}">${ic('chat')}<span>Isi HP</span></button>`}<button type="button" class="act" data-act="pel-edit" data-id="${p.id}">${ic('pencil')}<span>Edit</span></button></div>
    ${p.hp || p.alamat ? `<div class="card"><p class="who">${p.hp ? `<small>${esc(p.hp)}</small>` : ''}${p.alamat ? `<small>${esc(p.alamat)}</small>` : ''}</p></div>` : ''}
    <div class="sec-title">Nota ${esc(p.nama)}</div>${cards || empty('receipt', 'Belum ada nota', 'Buat nota pertama untuk pelanggan ini.')}
    <button type="button" class="btn danger-o wide" data-act="pel-del" data-id="${p.id}">${ic('trash')} Hapus pelanggan</button>`;
  return page(p.nama, body, { back: true, sub: p.hp ? esc(p.hp) : 'Pelanggan' });
});
A['pel-del'] = async el => {
  if (!(await confirmBox('Hapus pelanggan?', 'Nota lama tetap tersimpan dengan nama pelanggan ini.', 'Hapus', true))) return;
  del('pelanggan', el.dataset.id); toast('Pelanggan dihapus'); go('/pelanggan');
};
route(/^\/rekap\/([\w-]+)$/, 'pelanggan', ({ m }) => {
  const p = get('pelanggan', m[1]); if (!p) return page('Rekap', empty('file', 'Pelanggan tidak ditemukan'), { back: true });
  const b = S(), sales = salesSorted().filter(s => s.pelangganId === p.id && !s.batal).reverse(), un = sales.filter(s => hitung(s).sisa > 0), use = un.length ? un : sales;
  const tot = use.reduce((a, s) => a + hitung(s).sisa, 0);
  const rows = use.map(s => { const c = hitung(s); return `<tr><td>${esc(s.no)}</td><td class="c">${fdateNum(s.tgl)}</td><td class="c">${num(c.total)}</td><td class="c">${num(c.paid)}</td><td class="c">${num(c.sisa)}</td></tr>`; }).join('');
  const paper = `<div class="paper inv" id="paper"><div class="inv-top"><div class="inv-brand">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : ''}<div><b>${esc((b.nama || 'NAMA USAHA').toUpperCase())}</b></div></div><h2>REKAP TAGIHAN</h2></div>
    <div class="inv-meta"><div class="inv-to"><h4>TAGIHAN KEPADA</h4><b>${esc(p.nama)}</b>${p.hp ? `<span>${esc(p.hp)}</span>` : ''}</div><div class="inv-kv"><span>TANGGAL CETAK</span><b>${fdateNum(today())}</b><span>JUMLAH NOTA</span><b>${use.length}</b></div></div>
    <table class="inv-t"><thead><tr><th>NO. NOTA</th><th>TANGGAL</th><th>TOTAL</th><th>DIBAYAR</th><th>SISA</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="c">Tidak ada nota</td></tr>'}</tbody></table>
    <table class="inv-sum"><tbody><tr class="t"><td>TOTAL SISA TAGIHAN</td><td>${rp(tot)}</td></tr></tbody></table>
    ${(b.noRek || b.an) ? `<div class="inv-pay"><small>nomor rekening</small><div class="rek">${esc(b.noRek)}</div><b>${esc(((b.bank || '') + ' ' + (b.an || '')).trim().toLowerCase())}</b></div>` : ''}
    <div class="inv-thanks">${esc(b.terima || '').split('\n').map(x => `<div>${x}</div>`).join('')}</div></div>`;
  return page('Rekap tagihan', `<div class="doc">${paper}</div><div class="doc-acts"><button type="button" class="btn primary" data-act="print" data-k="invoice">${ic('printer')} Cetak / PDF</button></div>`, { back: true, sub: esc(p.nama), cls: 'docpg' });
});

/* =====================================================================
   Bagian 5: Keuangan, Menu, Tambah cepat, Pengaturan, Backup, mulai aplikasi
   ===================================================================== */
route(/^\/uang$/, 'uang', ({ q, fresh }) => {
  if (q.get('tab') && fresh) ui.uangTab = q.get('tab');
  const [from, to] = rangeOf(ui.period), st = stats(from, to), label = (PERIODE.find(x => x[0] === ui.period) || [])[1];
  const mg = st.omzet ? Math.round(st.laba / st.omzet * 100) : 0, piut = totalPiutang();
  let h = pills(PERIODE, ui.period, 'set-period');
  h += `<section class="hero"><div class="notch"><span>${esc(label)}</span></div><small>Laba bersih</small><div class="hero-n ${st.net < 0 ? 'neg' : ''}">${rp(st.net)}</div>
    <div class="pl"><div><span>Omzet (${st.count} nota)</span><b>${rp(st.omzet)}</b></div><div><span>HPP barang terjual</span><b>− ${rp(st.hpp)}</b></div><div class="sub"><span>Laba kotor <em>${mg}%</em></span><b>${rp(st.laba)}</b></div><div><span>Biaya operasional</span><b>− ${rp(st.biaya)}</b></div></div></section>
  <div class="tiles"><div class="tile t-sage"><small>Kas masuk</small><b>${rp(st.kasMasuk)}</b><em>pembayaran diterima</em></div><div class="tile t-deep"><small>Kas keluar</small><b>${rp(st.kasKeluar)}</b><em>semua pengeluaran</em></div>
    <button type="button" class="tile t-cream" data-act="uang-tab" data-v="piutang"><small>Belum dibayar</small><b>${rp(piut)}</b><em>piutang pelanggan</em></button><div class="tile t-white"><small>Nilai persediaan</small><b>${rp(nilaiStok())}</b><em>bahan + produk jadi</em></div></div>
  <div class="mini-sum"><span>Saldo kas (perkiraan)</span><b>${rp(saldoKas())}</b></div>`;
  h += pills([['pengeluaran', 'Pengeluaran'], ['piutang', 'Piutang']], ui.uangTab, 'uang-tab');
  if (ui.uangTab === 'piutang') {
    const ls = all('penjualan').filter(s => !s.batal && hitung(s).sisa > 0).sort((a, b) => (a.jatuhTempo || a.tgl).localeCompare(b.jatuhTempo || b.tgl));
    h += ls.length ? `<div class="stack-sm">${ls.map(s => { const c = hitung(s), late = s.jatuhTempo && s.jatuhTempo < today(); return `<div class="row"><a class="row-main" href="#/jual/${s.id}"><b>${esc(s.pelangganNama || 'Umum')}</b><small>${esc(s.no)} · ${s.jatuhTempo ? 'jatuh tempo ' + fdate(s.jatuhTempo) : fdate(s.tgl)}</small>${late ? `<span class="chip st-batal">${ic('alert')}Lewat jatuh tempo</span>` : ''}</a><div class="row-end"><b class="neg">${rp(c.sisa)}</b><button type="button" class="btn sm primary" data-act="bayar" data-id="${s.id}">Bayar</button></div></div>`; }).join('')}</div>` : empty('check', 'Tidak ada tagihan tertunda', 'Semua nota sudah lunas.');
  } else {
    const kats = Object.keys(st.perKat).map(k => ({ label: k, v: st.perKat[k], val: rp(st.perKat[k]), tip: `${k} · ${rp(st.perKat[k])}` })).sort((a, b) => b.v - a.v);
    const ex = all('pengeluaran').filter(e => e.tgl >= from && e.tgl <= to).sort((a, b) => b.tgl.localeCompare(a.tgl) || b._u - a._u);
    h += `<div class="card"><div class="card-title">Pengeluaran per kategori</div>${hBars(kats, { empty: 'Belum ada pengeluaran di periode ini.' })}${st.biayaBahan ? `<p class="muted sm mt">Belanja bahan &amp; kemasan ${rp(st.biayaBahan)} tidak dihitung sebagai biaya operasional karena sudah masuk HPP.</p>` : ''}</div>`;
    h += ex.length ? `<div class="stack-sm">${ex.map(e => `<button type="button" class="row" data-act="exp-edit" data-id="${e.id}"><div class="row-main"><b>${esc(e.ket || e.kat)}</b><small>${esc(e.kat)} · ${fdate(e.tgl)} · ${esc(e.metode || '')}</small></div><div class="row-end"><b class="neg">−${rp(e.jumlah)}</b></div></button>`).join('')}</div>` : '';
    h += `<button type="button" class="cta" data-act="exp-new">${ic('plus')} Catat pengeluaran</button>`;
  }
  return page('Keuangan', h, { sub: 'Laba rugi, kas &amp; piutang' });
});
A['uang-tab'] = el => { ui.uangTab = el.dataset.v; render(); };
A['exp-new'] = () => sheetExp();
A['exp-edit'] = el => sheetExp(el.dataset.id);
function sheetExp(id) {
  const e = id ? get('pengeluaran', id) : null;
  openSheet(e ? 'Edit pengeluaran' : 'Catat pengeluaran', `<form data-f="exp" class="stack" autocomplete="off"><input type="hidden" name="id" value="${id || ''}">
    <div class="grid2">${field('Tanggal', `<input type="date" name="tgl" value="${e ? e.tgl : today()}" required>`)}${field('Kategori', `<select name="kat">${opts(KAT, e ? e.kat : 'Lainnya', x => [x.k, x.k])}</select>`)}</div>
    ${field('Keterangan', `<input name="ket" value="${esc(e ? e.ket || '' : '')}" placeholder="mis. Token listrik" required>`)}
    <div class="grid2">${field('Jumlah (Rp)', rpIn('jumlah', e ? e.jumlah : 0, 'required'))}${field('Dibayar dengan', `<select name="metode">${opts(METODE, e ? e.metode : 'Tunai', x => [x, x])}</select>`)}</div>
    <div class="row-btns">${e ? `<button type="button" class="btn danger-o" data-act="exp-del" data-id="${id}" aria-label="Hapus">${ic('trash')}</button>` : ''}<button class="btn primary grow">Simpan</button></div></form>`);
}
F.exp = f => {
  const j = rpNum(f.jumlah.value); if (j <= 0) { toast('Isi jumlah pengeluaran', 'bad'); return; }
  const old = f.id.value ? get('pengeluaran', f.id.value) : null;
  put('pengeluaran', Object.assign({}, old || {}, { tgl: f.tgl.value || today(), kat: f.kat.value, ket: f.ket.value.trim(), jumlah: j, metode: f.metode.value, ref: old ? old.ref || '' : '' }));
  closeSheet(); toast('Pengeluaran tersimpan');
};
A['exp-del'] = async el => { if (await confirmBox('Hapus pengeluaran?', 'Catatan ini akan dihapus dari laporan.', 'Hapus', true)) { del('pengeluaran', el.dataset.id); toast('Pengeluaran dihapus'); } };

/* ---------- menu & tombol tambah ---------- */
route(/^\/menu$/, 'menu', () => {
  const T = [['/pelanggan', 'Pelanggan & Nota', 'users', 'sage'], ['/invoice', 'Invoice', 'file', 'deep'], ['/produk', 'Resep & HPP', 'flask', 'cream'], ['/produksi', 'Produksi', 'pot', 'sage'], ['/stok?t=bahan', 'Bahan baku', 'box', 'deep'], ['/uang?tab=pengeluaran', 'Pengeluaran', 'wallet', 'cream'], ['/jual', 'Penjualan', 'cart', 'sage'], ['/pengaturan', 'Pengaturan', 'sliders', 'deep']];
  const h = `<div class="menu-grid">${T.map(([p, l, i, c]) => `<a class="mt t-${c}" href="#${p}">${ic(i)}<span>${l}</span></a>`).join('')}<button type="button" class="mt t-white" data-act="logout">${ic('logout')}<span>Keluar</span></button></div>`;
  return page('Menu', h, { sub: 'Semua fitur' });
});
A.add = () => {
  const T = [['go', '/jual/new', 'Penjualan baru', 'cart', 'deep'], ['go', '/jual/new?inv=1', 'Invoice baru', 'file', 'sage'], ['exp', '', 'Pengeluaran', 'wallet', 'cream'], ['go', '/produksi/new', 'Produksi', 'pot', 'sage'], ['rs', '', 'Restock bahan', 'box', 'cream'], ['bh', '', 'Bahan baru', 'flask', 'deep'], ['go', '/produk/new', 'Produk / rasa baru', 'plus', 'cream'], ['pel', '', 'Pelanggan baru', 'users', 'sage']];
  openSheet('Tambah baru', `<div class="menu-grid sm">${T.map(([k, p, l, i, c]) => `<button type="button" class="mt t-${c}" data-act="add-pick" data-k="${k}" data-to="${esc(p)}">${ic(i)}<span>${l}</span></button>`).join('')}</div>`);
};
A['add-pick'] = el => {
  const k = el.dataset.k; closeSheet();
  if (k === 'go') go(el.dataset.to); else if (k === 'exp') sheetExp(); else if (k === 'rs') sheetRestock(''); else if (k === 'bh') sheetBahan(); else if (k === 'pel') sheetPel();
};

/* ---------- pengaturan ---------- */
let SET_LOGO;
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
route(/^\/pengaturan$/, 'set', ({ fresh }) => {
  if (fresh) SET_LOGO = undefined;
  const s = S(), logo = SET_LOGO !== undefined ? SET_LOGO : s.logo;
  const last = SYNC.last ? new Date(SYNC.last).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
  const body = `<form data-f="set" class="stack" autocomplete="off">
    <div class="card"><div class="card-title">Profil usaha <small>tampil di nota &amp; invoice</small></div>
      <div class="logo-up"><span class="av lg" id="logo-prev">${logo ? `<img src="${esc(logo)}" alt="">` : esc((s.nama || 'T').charAt(0).toUpperCase())}</span><div><label class="btn ghost sm">${ic('image')} Pilih logo<input type="file" accept="image/*" data-ch="logo" hidden></label>${logo ? `<button type="button" class="btn danger-o sm" data-act="logo-rm">Hapus</button>` : ''}</div></div>
      ${field('Nama usaha', `<input name="nama" value="${esc(s.nama)}" placeholder="mis. Kedai Kopi">`)}${field('Alamat', `<input name="alamat" value="${esc(s.alamat)}">`)}
      <div class="grid2">${field('No. HP / WA', `<input name="hp" inputmode="tel" value="${esc(s.hp)}">`)}${field('Email', `<input name="email" type="email" value="${esc(s.email)}">`)}</div>${field('Instagram', `<input name="ig" value="${esc(s.ig)}" placeholder="@namausaha">`)}</div>
    <div class="card"><div class="card-title">Pembayaran <small>tampil di invoice</small></div><div class="grid2">${field('Bank / e-wallet', `<input name="bank" value="${esc(s.bank)}" placeholder="mis. BCA">`)}${field('Nomor rekening', `<input name="noRek" inputmode="numeric" value="${esc(s.noRek)}">`)}</div>${field('Atas nama', `<input name="an" value="${esc(s.an)}">`)}</div>
    <div class="card"><div class="card-title">Invoice &amp; nota</div><div class="grid2">${field('Awalan nomor', `<input name="prefix" value="${esc(s.prefix)}" maxlength="8">`)}${field('Pajak default (%)', `<input name="pajak" inputmode="decimal" value="${s.pajak ? fq(s.pajak) : ''}" placeholder="0">`)}</div>
      ${field('Ucapan penutup invoice', `<textarea name="terima" rows="2">${esc(s.terima)}</textarea>`)}${field('Judul kontak', `<input name="kontak" value="${esc(s.kontak)}">`)}${field('Catatan default invoice', `<textarea name="catatanInv" rows="2" placeholder="mis. Pembayaran maks. 7 hari setelah invoice">${esc(s.catatanInv)}</textarea>`)}${field('Penutup nota', `<input name="notaFooter" value="${esc(s.notaFooter)}">`)}</div>
    <div class="card"><div class="card-title">Keuangan</div><div class="grid2">${field('Saldo kas awal (Rp)', rpIn('saldoAwal', s.saldoAwal))}${field('Target omzet / bulan (Rp)', rpIn('targetOmzet', s.targetOmzet))}</div></div>
    <div class="row-btns sticky"><button class="btn primary grow">Simpan pengaturan</button></div></form>
    <div class="card"><div class="card-title">Cloud &amp; data</div>
      <div class="kvs"><div><span>Status</span><b>${CLOUD ? (SYNC.state === 'ok' ? 'Tersambung & tersimpan' : SYNC.state === 'error' ? 'Gagal: ' + esc(SYNC.err) : SYNC.state === 'offline' ? 'Offline' : 'Menyinkronkan…') : 'Belum terhubung (data lokal)'}</b></div><div><span>Sinkron terakhir</span><b>${last}</b></div><div><span>Menunggu kirim</span><b>${dirty.size} catatan</b></div><div><span>ID ruang kerja</span><b>${WS ? WS.slice(0, 8) : '-'}…</b></div></div>
      <div class="grid2 acts mt">${CLOUD ? `<button type="button" class="btn ghost" data-act="sync-info">${ic('refresh')} Sinkron sekarang</button><button type="button" class="btn ghost" data-act="cache-reset">${ic('download')} Tarik ulang dari cloud</button>` : `<button type="button" class="btn ghost" data-act="sync-info">${ic('cloud-off')} Cara hubungkan cloud</button>`}
        <button type="button" class="btn ghost" data-act="export-json">${ic('download')} Backup (JSON)</button><label class="btn ghost">${ic('upload')} Pulihkan backup<input type="file" accept="application/json,.json" data-ch="restore" hidden></label>
        <button type="button" class="btn ghost" data-act="export-csv">${ic('file')} Ekspor penjualan (CSV)</button><button type="button" class="btn ghost" data-act="demo">${ic('plus')} Isi contoh data</button></div></div>
    <button type="button" class="btn danger-o wide" data-act="logout">${ic('logout')} Keluar dari ruang kerja ini</button>`;
  return { html: page('Pengaturan', body, { sub: 'Profil, rekening &amp; data' }), form: true };
});
F.set = f => {
  const g = n => f[n].value.trim();
  const patch = { nama: g('nama'), alamat: g('alamat'), hp: g('hp'), email: g('email'), ig: g('ig'), bank: g('bank'), noRek: g('noRek'), an: g('an'), prefix: (g('prefix') || 'INV').toUpperCase(), pajak: dec(f.pajak.value), terima: f.terima.value.trim(), kontak: g('kontak'), catatanInv: f.catatanInv.value.trim(), notaFooter: g('notaFooter'), saldoAwal: rpNum(f.saldoAwal.value), targetOmzet: rpNum(f.targetOmzet.value) };
  if (SET_LOGO !== undefined) patch.logo = SET_LOGO;
  setS(patch); SET_LOGO = undefined; toast('Pengaturan tersimpan'); renderChrome(); updateChrome(); render();
};
I.logo = el => {
  const file = el.files && el.files[0]; if (!file) return;
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const sc = Math.min(1, 240 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * sc)); c.height = Math.max(1, Math.round(img.height * sc));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    SET_LOGO = c.toDataURL('image/png'); const p = $('#logo-prev'); if (p) p.innerHTML = `<img src="${SET_LOGO}" alt="">`; toast('Logo dipilih, tekan Simpan');
  };
  img.onerror = () => toast('File gambar tidak bisa dibaca', 'bad'); img.src = url;
};
A['logo-rm'] = () => { SET_LOGO = ''; const p = $('#logo-prev'); if (p) p.textContent = (S().nama || 'T').charAt(0).toUpperCase(); toast('Logo dihapus, tekan Simpan'); };
A['export-json'] = () => { download(`tatakas-backup-${today()}.json`, JSON.stringify(exportAll()), 'application/json'); toast('Backup diunduh'); };
A['export-csv'] = () => { download(`penjualan-${today()}.csv`, '﻿' + csvSales(), 'text/csv'); toast('CSV diunduh'); };
I.restore = el => {
  const file = el.files && el.files[0]; if (!file) return;
  const rd = new FileReader();
  rd.onload = async () => {
    try {
      const obj = JSON.parse(rd.result), n = KINDS.reduce((a, k) => a + ((obj.data && obj.data[k]) || []).length, 0);
      if (!(await confirmBox('Pulihkan backup?', `File berisi <b>${n} catatan</b>. Data dengan ID yang sama akan ditimpa, data lain tetap ada.`, 'Pulihkan'))) return;
      importAll(obj); toast('Backup dipulihkan'); render();
    } catch (e) { toast(e.message || 'File backup tidak valid', 'bad'); }
  };
  rd.readAsText(file); el.value = '';
};
A['cache-reset'] = async () => {
  const ok = await confirmBox('Tarik ulang dari cloud?', dirty.size ? `Ada <b>${dirty.size} perubahan belum terkirim</b>; kirim dulu dengan menekan Sinkron sekarang, kalau tidak perubahan itu hilang.` : 'Cache di perangkat ini dibuang dan diganti salinan terbaru dari cloud.', 'Tarik ulang');
  if (!ok) return;
  LS.del(ckey()); const code = WS; resetDB(); WS = code; cursor = null; setSync('sync');
  try { await pullAll(true); setSync('ok'); SYNC.last = Date.now(); recalc(); persist(); toast('Data dimuat ulang dari cloud'); } catch (e) { setSync('error', e.message); toast('Gagal: ' + e.message, 'bad'); }
  render();
};

/* ---------- mulai ---------- */
boot();

})();
