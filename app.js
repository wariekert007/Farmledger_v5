/* FarmLedger — offline farm money & management app.
 * Everything is stored on this device only (IndexedDB in the browser). Nothing is uploaded.
 * Excel and PDF files are built on the device by export.js.
 */
(function () {
  'use strict';

  var VERSION = '1.2.0';
  var I18N = window.FL_I18N;
  var FX = window.FX;
  var app = document.getElementById('app');

  var D = null;          // all data
  var TAB = 'home';      // current main tab
  var V = 'home';        // current view (a tab, or a sub view: form, reports, settings)
  var F = null;          // state for the current form / sub view
  var LS = { money: { ym: null, dir: 'all' }, fuel: { ym: null }, rain: { n: 30 }, diary: { n: 20, q: '' }, stock: { n: 15 }, health: { n: 10 }, workdays: { n: 15 }, cash: { ym: null }, bank: { ym: null } };
  var confirmKey = '';   // "tap again" confirmations

  /* ================================================================ */
  /* Farm types, categories                                            */
  /* ================================================================ */
  var TYPES = [
    { k: 'beef', animal: 1 }, { k: 'dairy', animal: 1 }, { k: 'sheep', animal: 1 }, { k: 'goats', animal: 1 },
    { k: 'pigs', animal: 1 }, { k: 'poultry', animal: 1 }, { k: 'game', animal: 1 },
    { k: 'grain', crop: 1 }, { k: 'veg', crop: 1 }, { k: 'fruit', crop: 1 }, { k: 'fodder', crop: 1 }, { k: 'other' }
  ];
  var CATS = {
    'in': [
      { k: 'sale_stock', need: 'animal' }, { k: 'sale_milk', need: ['dairy'] }, { k: 'sale_wool', need: ['sheep', 'goats'] },
      { k: 'sale_eggs', need: ['poultry'] }, { k: 'sale_game', need: ['game'] }, { k: 'sale_crops', need: 'crop' },
      { k: 'contract_in' }, { k: 'rent_in' }, { k: 'diesel_refund' }, { k: 'insurance_in' }, { k: 'grants' },
      { k: 'interest_in' }, { k: 'other_in' }
    ],
    out: [
      { k: 'feed', need: 'animal' }, { k: 'vet', need: 'animal' }, { k: 'stock_buy', need: 'animal' },
      { k: 'seed', need: 'crop' }, { k: 'fert', need: 'crop' }, { k: 'chem', need: 'crop' },
      { k: 'wages' }, { k: 'contract_out' }, { k: 'repairs' }, { k: 'power' }, { k: 'packaging' }, { k: 'transport' },
      { k: 'insurance' }, { k: 'rent_out' }, { k: 'bank' }, { k: 'admin' }, { k: 'equipment' }, { k: 'other_out' }
    ]
  };
  var NO_VAT_DEFAULT = { wages: 1, bank: 1, insurance: 1, grants: 1, interest_in: 1, diesel_refund: 1, insurance_in: 1 };
  var TAGS = ['weather', 'animals', 'crops', 'veld', 'water', 'repairs', 'staff', 'visitors', 'other'];
  var STOCK_EV = ['count', 'born', 'bought', 'sold', 'died', 'slaughter', 'lost', 'moved'];
  var STOCK_SIGN = { born: 1, bought: 1, sold: -1, died: -1, slaughter: -1, lost: -1 };
  var JOBS = ['plough', 'plant', 'spray', 'fert', 'harvest', 'bale', 'cart', 'feed', 'pump', 'roads', 'fence', 'generator', 'other'];
  var HEALTH_TYPES = ['sick', 'dose', 'vacc', 'dip', 'other'];
  var CAMP_KINDS = ['camp', 'land', 'other'];
  var PAYS = ['cash', 'eft', 'card'];
  var CASH_TYPES = ['bank', 'draw', 'count'];
  var UNITS = ['t', 'kg', 'bales', 'bags'];
  var CROP_SUGG = {
    grain: ['maize', 'wheat', 'soy', 'sunflower', 'sorghum'],
    fodder: ['lucerne', 'oats', 'teff', 'ryegrass', 'silage'],
    veg: ['potatoes', 'cabbage', 'tomatoes', 'onions'],
    fruit: ['citrus', 'apples', 'grapes', 'macadamias']
  };

  /* ================================================================ */
  /* Language                                                          */
  /* ================================================================ */
  function L() { return (D && D.settings.lang) || 'en'; }
  function t(key, vars) {
    var s = (I18N[L()] || I18N.en)[key];
    if (s == null) s = I18N.en[key];
    if (s == null) s = key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }
  function typeLabel(k) { return t('type_' + k); }
  function animalLabel(k) { return t('animal_' + k); }
  function catLabel(k) { return !k ? '' : k.indexOf('c:') === 0 ? k.slice(2) : t('cat_' + k); }
  function branchLabel(k) { return !k || k === 'general' ? t('branch_general') : typeLabel(k); }
  function cropLabel(k) { return I18N.en['crop_' + k] ? t('crop_' + k) : k; }
  function jobLabel(k) { return I18N.en['job_' + k] ? t('job_' + k) : k; }
  function keyFor(prefix, text) {   // turn a typed / chosen label back into a translation key, if it is one
    var low = String(text || '').toLowerCase();
    var k = Object.keys(I18N.en).filter(function (x) {
      return x.indexOf(prefix) === 0 && (I18N.en[x].toLowerCase() === low || (I18N.af[x] || '').toLowerCase() === low);
    })[0];
    return k ? k.slice(prefix.length) : text;
  }

  /* ================================================================ */
  /* Storage (IndexedDB, with localStorage fallback)                   */
  /* ================================================================ */
  var DB_NAME = 'farmledger', STORE = 'kv', PHOTOS = 'photos', LS_KEY = 'farmledger.data', useLS = false, dbp = null;
  function getDB() {
    if (!dbp) dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no indexedDB'));
      var r = indexedDB.open(DB_NAME, 2);
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function loadData() {
    return getDB().then(function (db) {
      return new Promise(function (res, rej) {
        var q = db.transaction(STORE, 'readonly').objectStore(STORE).get('data');
        q.onsuccess = function () { res(q.result); };
        q.onerror = function () { rej(q.error); };
      });
    }).catch(function () {
      useLS = true;
      try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { return null; }
    });
  }
  function save() {
    var copy = JSON.parse(JSON.stringify(D));
    if (useLS) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(copy)); return Promise.resolve(true); }
      catch (e) { toast(t('err_save') + ' ' + e.message); return Promise.resolve(false); }
    }
    return getDB().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(copy, 'data');
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    }).catch(function (e) { toast(t('err_save') + ' ' + (e && e.message || '')); return false; });
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  /* Slip photos: kept in their own store, the records only hold the photo id */
  function photoTx(mode, fn) {
    return getDB().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(PHOTOS, mode), st = tx.objectStore(PHOTOS), out;
        var q = fn(st);
        if (q) q.onsuccess = function () { out = q.result; };
        tx.oncomplete = function () { res(out); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function photoPut(id, blob) { return photoTx('readwrite', function (st) { st.put(blob, id); }); }
  function photoGet(id) { return photoTx('readonly', function (st) { return st.get(id); }); }
  function photoDel(id) { return id ? photoTx('readwrite', function (st) { st.delete(id); }).catch(function () {}) : Promise.resolve(); }
  function photoClear() { return photoTx('readwrite', function (st) { st.clear(); }).catch(function () {}); }
  function photoAll() {
    return getDB().then(function (db) {
      return new Promise(function (res, rej) {
        var out = {}, tx = db.transaction(PHOTOS, 'readonly'), q = tx.objectStore(PHOTOS).openCursor();
        q.onsuccess = function () { var c = q.result; if (c) { out[c.key] = c.value; c.continue(); } };
        tx.oncomplete = function () { res(out); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  var photoUrls = {};   // id -> object URL (cache for showing thumbnails)
  function photoUrl(id) {
    if (photoUrls[id]) return Promise.resolve(photoUrls[id]);
    return photoGet(id).then(function (b) { if (!b) return null; photoUrls[id] = URL.createObjectURL(b); return photoUrls[id]; });
  }
  // Shrink a camera photo to max 1600 px JPEG (~150-350 KB) so the phone doesn't fill up
  function shrinkPhoto(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('photo')); }, 'image/jpeg', 0.72);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('photo')); };
      img.src = url;
    });
  }

  function blank() {
    var lang = /^af/i.test(navigator.language || '') ? 'af' : 'en';
    return {
      app: 'FarmLedger', v: 1,
      settings: { setup: false, lang: lang, farm: '', owner: '', types: [], vat: false, vatRate: 15, vatNo: '',
                  yearEnd: 2, rainStart: 7, remind: true, remindTime: '18:00', cats: { 'in': [], out: [] }, lastBackup: '' },
      money: [], fuel: [], rain: [], diary: [], crops: [], stock: [],
      fuse: [], camps: [], health: [], recur: [], workers: [], workdays: [], cashmoves: []
    };
  }
  function normalise(d) {
    var b = blank();
    if (!d || typeof d !== 'object') return b;
    d.settings = Object.assign(b.settings, d.settings || {});
    if (!d.settings.cats || !d.settings.cats.out) d.settings.cats = { 'in': [], out: [] };
    LISTS.forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
    d.app = 'FarmLedger'; d.v = 1;
    return d;
  }
  var LISTS = ['money', 'fuel', 'rain', 'diary', 'crops', 'stock', 'fuse', 'camps', 'health', 'recur', 'workers', 'workdays', 'cashmoves'];
  var COLL = { money: 'money', fuel: 'fuel', rain: 'rain', diary: 'diary', crop: 'crops', stock: 'stock',
               fuse: 'fuse', camp: 'camps', health: 'health', recur: 'recur', worker: 'workers', workday: 'workdays', cashmove: 'cashmoves' };

  /* ================================================================ */
  /* Helpers                                                           */
  /* ================================================================ */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return dateStr(new Date()); }
  function parseD(s) { var p = String(s || '').split('-'); return new Date(+p[0], +p[1] - 1, +(p[2] || 1)); }
  function addMonths(ym, n) { var d = parseD(ym + '-01'); d.setMonth(d.getMonth() + n); return dateStr(d).slice(0, 7); }
  function monthName(m, short) { return t(short ? 'mon' : 'months').split(',')[m - 1]; }
  function ymLabel(ym) { var p = ym.split('-'); return monthName(+p[1]) + ' ' + p[0]; }
  function niceDate(s, noYear) {
    if (!s) return '';
    var d = parseD(s);
    return t('days').split(',')[d.getDay()] + ' ' + d.getDate() + ' ' + monthName(d.getMonth() + 1, true) + (noYear ? '' : ' ' + d.getFullYear());
  }
  function shortDate(s) { if (!s) return ''; var d = parseD(s); return d.getDate() + ' ' + monthName(d.getMonth() + 1, true) + ' ' + d.getFullYear(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) {
    var s = String(v == null ? '' : v).replace(/[\s R]/gi, '');
    if (!s) return NaN;
    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
    return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  function fmtNum(n, dec) {
    n = Number(n) || 0;
    var neg = n < 0, s = Math.abs(n).toFixed(dec).split('.');
    var i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '-' : '') + i + (dec ? (L() === 'af' ? ',' : '.') + s[1] : '');
  }
  function fmtR(n) { n = Number(n) || 0; return (n < 0 ? '-' : '') + 'R ' + fmtNum(Math.abs(n), 2); }
  function fmtL(n) { return fmtNum(n, n % 1 ? 1 : 0) + ' L'; }
  function fmtMm(n) { return fmtNum(n, n % 1 ? 1 : 0) + ' mm'; }
  function numIn(n) { return n == null || n === '' || isNaN(n) ? '' : (L() === 'af' ? String(n).replace('.', ',') : String(n)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clean(s, max) { return String(s == null ? '' : s).replace(/[ \t]+/g, ' ').trim().slice(0, max || 200); }
  function inRange(d, from, to) { return (!from || d >= from) && (!to || d <= to); }
  function byDateDesc(a, b) { return (b.date || '').localeCompare(a.date || '') || (b.ts || 0) - (a.ts || 0); }
  function byDateAsc(a, b) { return -byDateDesc(a, b); }
  function uniq(list, max) {
    var seen = {}, out = [];
    list.forEach(function (x) {
      var s = String(x || '').trim(), k = s.toLowerCase();
      if (s && !seen[k] && out.length < max) { seen[k] = 1; out.push(s); }
    });
    return out;
  }
  function hasAnimals() { return D.settings.types.some(function (k) { return TYPES.some(function (x) { return x.k === k && x.animal; }); }); }
  function hasCrops() { return D.settings.types.some(function (k) { return TYPES.some(function (x) { return x.k === k && x.crop; }); }); }
  function animalTypes() {
    var list = TYPES.filter(function (x) { return x.animal && D.settings.types.indexOf(x.k) > -1; }).map(function (x) { return x.k; });
    D.stock.forEach(function (s) { if (list.indexOf(s.an) < 0) list.push(s.an); });
    return list;
  }
  function catsFor(dir, keep) {
    var types = D.settings.types;
    var list = CATS[dir].filter(function (c) {
      if (!c.need) return true;
      if (c.need === 'animal') return hasAnimals();
      if (c.need === 'crop') return hasCrops();
      return c.need.some(function (k) { return types.indexOf(k) > -1; });
    }).map(function (c) { return c.k; });
    (D.settings.cats[dir] || []).forEach(function (n) { list.push('c:' + n); });
    if (keep && list.indexOf(keep) < 0) list.push(keep);
    return list;
  }
  function branches() { return D.settings.types.concat(['general']); }
  function defaultBranch() { return D.settings.types.length === 1 ? D.settings.types[0] : 'general'; }
  function vatOf(amt, incl) { var r = Number(D.settings.vatRate) || 15; return incl ? r2(amt * r / (100 + r)) : 0; }

  var toastT;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('on'); }, 2800);
  }

  /* Periods ------------------------------------------------------------ */
  function taxYear(offset) {
    var m = Number(D.settings.yearEnd) || 2, now = new Date();
    var endY = (now.getMonth() + 1 <= m ? now.getFullYear() : now.getFullYear() + 1) + (offset || 0);
    var start = new Date(endY - 1, m, 1), end = new Date(endY, m, 0);
    return [dateStr(start), dateStr(end)];
  }
  function rainSeason() {
    var s = Number(D.settings.rainStart) || 7, now = new Date();
    var y = now.getMonth() + 1 >= s ? now.getFullYear() : now.getFullYear() - 1;
    return dateStr(new Date(y, s - 1, 1));
  }
  function presets() {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth();
    var ty = taxYear(0), ly = taxYear(-1);
    return [
      ['p_this_month', dateStr(new Date(y, m, 1)), dateStr(new Date(y, m + 1, 0))],
      ['p_last_month', dateStr(new Date(y, m - 1, 1)), dateStr(new Date(y, m, 0))],
      ['p_this_tax', ty[0], ty[1]],
      ['p_last_tax', ly[0], ly[1]],
      ['p_last12', dateStr(new Date(y, m - 11, 1)), dateStr(new Date(y, m + 1, 0))],
      ['p_all', '', '']
    ];
  }
  function periodText(from, to) {
    if (!from && !to) return t('p_all');
    return (from ? shortDate(from) : '…') + ' – ' + (to ? shortDate(to) : '…');
  }

  /* Calculations ------------------------------------------------------- */
  function herd() {
    var c = {};
    D.stock.slice().sort(byDateAsc).forEach(function (s) {
      if (s.ev === 'count') c[s.an] = s.n;
      else c[s.an] = (c[s.an] || 0) + (STOCK_SIGN[s.ev] || 0) * s.n;
    });
    return c;
  }
  function summary(from, to) {
    var s = { inT: 0, outT: 0, fuelT: 0, vatOut: 0, vatIn: 0, cin: {}, cout: {}, br: {},
              dL: 0, dAmt: 0, dFarm: 0, pL: 0, pAmt: 0, rain: 0, rainM: {}, rainDays: 0,
              money: [], fuel: [], rainL: [], diary: [], stock: [], crops: [],
              fuse: [], uD: 0, uP: 0, byMach: {}, byJob: {}, health: [], workdays: [], dayPay: {}, inPay: {}, outPay: {} };
    D.money.forEach(function (m) {
      if (!inRange(m.date, from, to)) return;
      s.money.push(m);
      var b = s.br[m.br || 'general'] || (s.br[m.br || 'general'] = { 'in': 0, out: 0 });
      if (m.dir === 'in') { s.inT += m.amt; s.cin[m.cat] = (s.cin[m.cat] || 0) + m.amt; s.vatOut += m.vat || 0; b['in'] += m.amt; s.inPay[m.pay || ''] = (s.inPay[m.pay || ''] || 0) + m.amt; }
      else { s.outT += m.amt; s.cout[m.cat] = (s.cout[m.cat] || 0) + m.amt; s.vatIn += m.vat || 0; b.out += m.amt; s.outPay[m.pay || ''] = (s.outPay[m.pay || ''] || 0) + m.amt; }
    });
    D.fuel.forEach(function (f) {
      if (!inRange(f.date, from, to)) return;
      s.fuel.push(f);
      s.fuelT += f.amt; s.vatIn += f.vat || 0; s.outPay[f.pay || ''] = (s.outPay[f.pay || ''] || 0) + f.amt;
      if (f.kind === 'petrol') { s.pL += f.l; s.pAmt += f.amt; }
      else { s.dL += f.l; s.dAmt += f.amt; if (f.use === 'farm') s.dFarm += f.l; }
    });
    var days = {};
    D.rain.forEach(function (r) {
      if (!inRange(r.date, from, to)) return;
      s.rainL.push(r); s.rain += r.mm;
      var ym = r.date.slice(0, 7);
      s.rainM[ym] = (s.rainM[ym] || 0) + r.mm;
      if (r.mm > 0) days[r.date] = 1;
    });
    s.rainDays = Object.keys(days).length;
    D.diary.forEach(function (d) { if (inRange(d.date, from, to)) s.diary.push(d); });
    D.stock.forEach(function (x) { if (inRange(x.date, from, to)) s.stock.push(x); });
    D.crops.forEach(function (c) {
      var start = c.planted || '0000', end = c.harvest || '9999';
      if ((!to || start <= to) && (!from || end >= from)) s.crops.push(c);
    });
    D.fuse.forEach(function (u) {
      if (!inRange(u.date, from, to)) return;
      s.fuse.push(u);
      if (u.kind === 'petrol') s.uP += u.l; else s.uD += u.l;
      var mk = (u.mach || '?') + ' (' + t(u.kind) + ')';
      s.byMach[mk] = (s.byMach[mk] || 0) + u.l;
      var jk = jobLabel(u.job) || '?';
      s.byJob[jk] = (s.byJob[jk] || 0) + u.l;
    });
    D.health.forEach(function (h) { if (inRange(h.date, from, to)) s.health.push(h); });
    D.workdays.forEach(function (w) {
      if (!inRange(w.date, from, to)) return;
      s.workdays.push(w);
      w.people.forEach(function (p) {
        var x = s.dayPay[p.w] || (s.dayPay[p.w] = { days: 0, amt: 0, paid: 0 });
        x.days += p.d; x.amt += p.d * p.rate; if (p.paid) x.paid += p.d * p.rate;
      });
    });
    ['money', 'fuel', 'rainL', 'diary', 'stock', 'fuse', 'health', 'workdays'].forEach(function (k) { s[k].sort(byDateAsc); });
    s.outAll = s.outT + s.fuelT;
    s.net = s.inT - s.outAll;
    return s;
  }
  function campStats(c, from, to) {
    var x = { inT: 0, outT: 0, fuseL: 0, rain: 0, rainN: 0, crops: [], moves: [], health: [] };
    var nm = c.name.toLowerCase();
    D.money.forEach(function (m) { if (m.camp === c.id && inRange(m.date, from, to)) { if (m.dir === 'in') x.inT += m.amt; else x.outT += m.amt; } });
    D.fuse.forEach(function (u) { if (u.camp === c.id && inRange(u.date, from, to)) x.fuseL += u.l; });
    D.rain.forEach(function (r) { if (r.g && r.g.toLowerCase() === nm && inRange(r.date, from, to)) { x.rain += r.mm; x.rainN++; } });
    D.crops.forEach(function (cr) { if (cr.camp === c.id || (cr.field && cr.field.toLowerCase() === nm)) x.crops.push(cr); });
    D.stock.forEach(function (st) { if (st.ev === 'moved' && st.camp === c.id) x.moves.push(st); });
    x.moves.sort(byDateDesc);
    x.crops.sort(function (a, b) { return (b.planted || '').localeCompare(a.planted || ''); });
    return x;
  }
  function wroteDiaryToday() { var d = today(); return D.diary.some(function (x) { return x.date === d; }); }
  function totalEntries() { return LISTS.reduce(function (s, k) { return s + D[k].length; }, 0); }
  function campById(id) { return D.camps.filter(function (c) { return c.id === id; })[0]; }
  function campName(id) { var c = campById(id); return c ? c.name : ''; }
  function campOpts() { return [['', t('none_choose')]].concat(D.camps.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (c) { return [c.id, c.name]; })); }
  function workerById(id) { return D.workers.filter(function (w) { return w.id === id; })[0]; }
  function workerName(id) { var w = workerById(id); return w ? w.name : '?'; }
  function addDays(d, n) { var x = parseD(d); x.setDate(x.getDate() + n); return dateStr(x); }
  function needPhoto() { return D.money.concat(D.fuel).filter(function (x) { return x.photoLater && !x.photo; }); }
  function sickNow() { return D.health.filter(function (h) { return h.type === 'sick' && !h.healed; }).sort(byDateDesc); }
  function withdrawals() {   // treatments whose withdrawal period has not ended yet
    var tdy = today();
    return D.health.filter(function (h) { return h.wd > 0 && addDays(h.date, h.wd) >= tdy; })
      .map(function (h) { return { h: h, until: addDays(h.date, h.wd) }; }).sort(function (a, b) { return b.until.localeCompare(a.until); });
  }
  function dueTreatments(days) {   // next treatments due soon / overdue (not yet followed up)
    var lim = addDays(today(), days == null ? 7 : days);
    return D.health.filter(function (h) {
      if (!h.next || h.next > lim || (h.type === 'sick' && h.healed)) return false;
      var p = String(h.product || '').toLowerCase();
      return !D.health.some(function (o) { return o !== h && o.type === h.type && o.an === h.an && String(o.product || '').toLowerCase() === p && o.date > h.date; });
    }).sort(function (a, b) { return a.next.localeCompare(b.next); });
  }
  function lastPay(dir) {
    var m = D.money.filter(function (x) { return x.dir === dir && x.pay; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })[0];
    return m ? m.pay : 'eft';
  }
  function payLabel(p) { return p ? t('pay_' + p) : t('pay_none'); }
  function payLow(p) { return p === 'eft' ? payLabel(p) : payLabel(p).toLowerCase(); }
  // Every cash movement in date order: cash income (+), cash expenses and fuel (-), banked (-), drawn (+), counted (= set)
  function cashEvents() {
    var ev = [];
    D.money.forEach(function (m) { if (m.pay === 'cash') ev.push({ k: 'money', x: m, d: m.dir === 'in' ? m.amt : -m.amt }); });
    D.fuel.forEach(function (f) { if (f.pay === 'cash') ev.push({ k: 'fuel', x: f, d: -f.amt }); });
    D.cashmoves.forEach(function (c) { ev.push({ k: 'cashmove', x: c, d: c.type === 'bank' ? -c.amt : c.type === 'draw' ? c.amt : 0, set: c.type === 'count' }); });
    ev.sort(function (a, b) { return byDateAsc(a.x, b.x); });
    var bal = 0;
    ev.forEach(function (e) { bal = e.set ? e.x.amt : r2(bal + e.d); e.bal = bal; });
    return ev;
  }
  function cashOnHand(upto) {
    var ev = cashEvents(), bal = 0;
    ev.forEach(function (e) { if (!upto || e.x.date <= upto) bal = e.bal; });
    return bal;
  }
  // Everything that should appear on the bank statement: EFT / card income & expenses, fuel paid by EFT / card, cash banked or drawn
  function bankItems(from, to) {
    var out = [];
    D.money.forEach(function (m) { if ((m.pay === 'eft' || m.pay === 'card') && inRange(m.date, from, to)) out.push({ k: 'money', x: m, amt: m.dir === 'in' ? m.amt : -m.amt }); });
    D.fuel.forEach(function (f) { if ((f.pay === 'eft' || f.pay === 'card') && inRange(f.date, from, to)) out.push({ k: 'fuel', x: f, amt: -f.amt }); });
    D.cashmoves.forEach(function (c) { if (c.type !== 'count' && inRange(c.date, from, to)) out.push({ k: 'cashmove', x: c, amt: c.type === 'bank' ? c.amt : -c.amt }); });
    return out.sort(function (a, b) { return byDateAsc(a.x, b.x); });
  }
  function cashTitle(c) { return t('ct_' + c.type); }
  function owedByWorker() {
    var o = {};
    D.workdays.forEach(function (wd) { wd.people.forEach(function (p) { if (!p.paid) { var x = o[p.w] || (o[p.w] = { days: 0, amt: 0 }); x.days += p.d; x.amt += p.d * p.rate; } }); });
    return o;
  }

  /* ================================================================ */
  /* Icons                                                             */
  /* ================================================================ */
  function ico(p, s) {
    return '<svg width="' + (s || 22) + '" height="' + (s || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }
  var IC = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M3 21h13"/><path d="M7 8h5"/><path d="M15 10h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
    rain: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    diary: '<path d="M5 4a2 2 0 0 1 2-2h12v17H7a2 2 0 0 0-2 2z"/><path d="M5 21V4"/><path d="M9 7h6M9 11h6"/>',
    farm: '<path d="M3 21V10l9-6 9 6v11"/><path d="M9 21v-6h6v6"/><path d="M3 21h18"/>',
    reports: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    next: '<path d="M9 18l6-6-6-6"/>',
    down: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
    share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>',
    cow: '<path d="M6 8c-2 0-3-1-3-3M18 8c2 0 3-1 3-3"/><path d="M6 8h12v6a6 6 0 0 1-12 0z"/><circle cx="10" cy="16" r=".6"/><circle cx="14" cy="16" r=".6"/>',
    sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4-3-6-7-6 0 4 3 6 7 6z"/><path d="M12 12c0-3 2-6 7-6 0 4-3 6-7 6z"/>',
    cam: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    clip: '<path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
    med: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M12 10v7M8.5 13.5h7"/>',
    tractor: '<circle cx="7" cy="17" r="3"/><circle cx="18" cy="18" r="2"/><path d="M4 14V8h7l2 6"/><path d="M11 8V5h4v9h6v4h-1"/><path d="M10 17h6"/>',
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5A5 5 0 0 1 21 19"/>',
    repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
    alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>',
    coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3"/>',
    bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 21h18"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'
  };

  /* ================================================================ */
  /* Small HTML builders                                               */
  /* ================================================================ */
  function fld(label, inner, hint) {
    return '<div class="fw"><label class="f">' + esc(label) + '</label>' + inner + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
  }
  function inp(k, o) {
    o = o || {};
    var v = F[k] == null ? '' : F[k];
    return '<input class="in' + (o.cls ? ' ' + o.cls : '') + '" data-k="' + k + '" type="' + (o.type || 'text') + '"' +
      (o.mode ? ' inputmode="' + o.mode + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') +
      (o.list ? ' list="' + o.list + '"' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') +
      (o.id ? ' id="' + o.id + '"' : '') + ' autocomplete="off" value="' + esc(v) + '">';
  }
  function area(k, ph, rows) {
    return '<textarea class="in" data-k="' + k + '" rows="' + (rows || 5) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '>' + esc(F[k] || '') + '</textarea>';
  }
  function sel(k, opts, rr) {
    return '<select class="in" data-k="' + k + '"' + (rr ? ' data-rr="1"' : '') + '>' + opts.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(F[k]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }
  function seg(k, opts, cls) {
    return '<div class="seg' + (cls ? ' ' + cls : '') + '">' + opts.map(function (o) {
      return '<button type="button" class="' + (String(F[k]) === String(o[0]) ? 'on' : '') + '" data-chip="' + k + '" data-v="' + esc(o[0]) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function chips(k, list, labelFn) {   // single value suggestions that fill a text field
    if (!list || !list.length) return '';
    return '<div class="chips">' + list.map(function (v) {
      var on = F[k] != null && String(F[k]).toLowerCase() === String(labelFn ? labelFn(v) : v).toLowerCase();
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-chip="' + k + '" data-v="' + esc(labelFn ? labelFn(v) : v) + '">' + esc(labelFn ? labelFn(v) : v) + '</button>';
    }).join('') + '</div>';
  }
  function multi(k, list, labelFn) {
    var cur = F[k] || [];
    return '<div class="chips">' + list.map(function (v) {
      return '<button type="button" class="chip' + (cur.indexOf(v) > -1 ? ' on' : '') + '" data-multi="' + k + '" data-v="' + esc(v) + '">' + esc(labelFn(v)) + '</button>';
    }).join('') + '</div>';
  }
  function check(k, label) {
    return '<label class="chk"><input type="checkbox" data-k="' + k + '" data-rr="1"' + (F[k] ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  }
  function msg(kind, text) { return text ? '<div class="msg ' + kind + '">' + text + '</div>' : ''; }
  function stat(label, value, cls) { return '<div class="stat"><span>' + esc(label) + '</span><b class="' + (cls || '') + '">' + value + '</b></div>'; }
  function monthNav(view, ym) {
    return '<div class="mnav"><button class="icon" data-act="mprev" data-view="' + view + '" aria-label="' + esc(t('prev')) + '">' + ico(IC.back) + '</button>' +
      '<strong>' + esc(ymLabel(ym)) + '</strong>' +
      '<button class="icon" data-act="mnext" data-view="' + view + '" aria-label="' + esc(t('next')) + '"' + (ym >= today().slice(0, 7) ? ' disabled' : '') + '>' + ico(IC.next) + '</button></div>';
  }
  function confirmBtn(key, act, label, again) {
    return '<button class="text danger" data-act="' + act + '">' + esc(confirmKey === key ? again : label) + '</button>';
  }

  /* ================================================================ */
  /* Navigation                                                        */
  /* ================================================================ */
  var TABS = ['home', 'money', 'fuel', 'rain', 'diary', 'farm'];
  function isTab(v) { return TABS.indexOf(v) > -1; }
  function showTab(tab) {
    TAB = tab || TAB; V = TAB; F = null; confirmKey = '';
    render(); window.scrollTo(0, 0);
  }
  function openSub(view, state) {
    state = state || {};
    if (view === 'form' && !isTab(V) && V !== 'form' && V !== 'reports' && V !== 'settings') state.back = { v: V, f: F };
    V = view; F = state; confirmKey = '';
    if (!(history.state && history.state.sub)) history.pushState({ sub: 1 }, '');
    render(); window.scrollTo(0, 0);
  }
  function closeSub() {
    if (F && F.back) { var b = F.back; V = b.v; F = b.f; confirmKey = ''; render(); window.scrollTo(0, 0); return; }
    if (history.state && history.state.sub) history.back();   // popstate -> showTab()
    else showTab();
  }
  window.addEventListener('popstate', function () {
    if (!D || isTab(V)) return;
    if (F && F.back) { history.pushState({ sub: 1 }, ''); closeSub(); }   // phone back button: step back to camp / workers screen
    else showTab();
  });

  /* ================================================================ */
  /* Render                                                            */
  /* ================================================================ */
  function render() {
    document.documentElement.lang = L();
    var setup = !D.settings.setup;
    document.body.classList.toggle('nonav', setup);
    renderHeader(setup);
    renderNav(setup);
    if (setup) return setupScreen();
    switch (V) {
      case 'home': return home();
      case 'money': return moneyList();
      case 'fuel': return fuelList();
      case 'rain': return rainScreen();
      case 'diary': return diaryList();
      case 'farm': return farmScreen();
      case 'form': return formScreen();
      case 'camp': return campScreen();
      case 'workers': return workersScreen();
      case 'pending': return pendingScreen();
      case 'cash': return cashScreen();
      case 'bank': return bankScreen();
      case 'reports': return reportsScreen();
      case 'settings': return settingsScreen();
    }
  }
  function renderHeader(setup) {
    var title = setup ? 'FarmLedger' : (isTab(V) ? (V === 'home' ? (D.settings.farm || 'FarmLedger') : t('tab_' + V)) : subTitle());
    var h = '';
    if (!isTab(V) && !setup) h += '<button class="icon" data-act="close" aria-label="' + esc(t('back')) + '">' + ico(IC.back) + '</button>';
    h += '<h1>' + esc(title) + '</h1><div class="hbtns">';
    h += '<button id="installBtn" class="secondary small' + (installEvt ? '' : ' hidden') + '" type="button" data-act="install">' + esc(t('install')) + '</button>';
    if (!setup && isTab(V)) {
      h += '<button class="secondary small" data-act="reports">' + ico(IC.reports, 18) + '<span class="hide-xs">' + esc(t('reports')) + '</span></button>';
      h += '<button class="icon" data-act="settings" aria-label="' + esc(t('settings')) + '">' + ico(IC.settings) + '</button>';
    }
    document.getElementById('hdr').innerHTML = h + '</div>';
  }
  function subTitle() {
    if (V === 'reports') return t('reports');
    if (V === 'settings') return t('settings');
    if (V === 'form') return t((F.id ? 'edit_' : 'new_') + F.kind + (F.kind === 'money' || F.kind === 'recur' ? '_' + F.dir : '') + (F.kind === 'health' ? '_' + F.type : ''));
    if (V === 'camp') { var c = campById(F.id); return c ? c.name : t('camps'); }
    if (V === 'workers') return t('day_workers');
    if (V === 'pending') return t('slips_needed');
    if (V === 'cash') return t('cash_tracker');
    if (V === 'bank') return t('bank_check');
    return 'FarmLedger';
  }
  function renderNav(setup) {
    var nav = document.getElementById('nav');
    if (setup) { nav.innerHTML = ''; return; }
    nav.innerHTML = '<div class="brand">FarmLedger</div>' + TABS.map(function (k) {
      return '<button data-act="tab" data-tab="' + k + '" class="' + (TAB === k ? 'on' : '') + '"' + (TAB === k ? ' aria-current="page"' : '') + '>' + ico(IC[k]) + '<span>' + esc(t('tab_' + k)) + '</span></button>';
    }).join('') + '<div class="side-extra"><button data-act="reports" class="' + (V === 'reports' ? 'on' : '') + '">' + ico(IC.reports) + '<span>' + esc(t('reports')) + '</span></button>' +
      '<button data-act="settings" class="' + (V === 'settings' ? 'on' : '') + '">' + ico(IC.settings) + '<span>' + esc(t('settings')) + '</span></button></div>';
  }

  /* ---------------- Setup (first run) ---------------- */
  function setupScreen() {
    if (!F || !F.setup) F = { setup: 1, lang: D.settings.lang, farm: D.settings.farm, owner: D.settings.owner, types: D.settings.types.slice(), vat: D.settings.vat ? '1' : '0' };
    var h = '<div class="card hero"><div class="logo">' + ico(IC.sprout, 34) + '</div>' +
      '<h2>' + esc(t('welcome')) + '</h2><p class="muted">' + esc(t('welcome_sub')) + '</p>' +
      fld(t('language'), seg('lang', [['en', 'English'], ['af', 'Afrikaans']])) +
      fld(t('farm_name'), inp('farm', { ph: t('farm_name_ph'), max: 60 })) +
      fld(t('your_name'), inp('owner', { max: 60 })) +
      fld(t('farm_types'), multi('types', TYPES.map(function (x) { return x.k; }), typeLabel), esc(t('farm_types_hint'))) +
      fld(t('vat_registered'), seg('vat', [['0', t('no')], ['1', t('yes')]]), esc(t('vat_hint'))) +
      msg('err', F.err) +
      '<div style="margin-top:22px"><button class="primary" data-act="finishSetup">' + esc(t('start_using')) + '</button></div>' +
      '<p class="muted center" style="margin-top:16px">' + esc(t('stored_here')) + '</p>' +
      '<button class="text" data-act="restorePick">' + esc(t('restore_backup')) + '</button>' +
      '</div>';
    app.innerHTML = h;
  }
  function finishSetup() {
    if (!F.types.length) { F.err = esc(t('err_types')); return render(); }
    var s = D.settings;
    s.lang = F.lang; s.farm = clean(F.farm, 60); s.owner = clean(F.owner, 60); s.types = F.types.slice(); s.vat = F.vat === '1'; s.setup = true;
    save(); F = null; TAB = 'home'; showTab('home');
    toast(t('ready'));
  }

  /* ---------------- Home ---------------- */
  function home() {
    var now = new Date(), ym = today().slice(0, 7);
    var m = summary(ym + '-01', dateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
    var h = '';
    if (D.settings.remind && !wroteDiaryToday()) {
      h += '<div class="card nudge">' + ico(IC.diary, 26) + '<div class="grow"><strong>' + esc(t('diary_nudge')) + '</strong>' +
        '<div class="muted">' + esc(t('diary_nudge_sub')) + '</div></div>' +
        '<button class="primary small" data-act="new" data-kind="diary">' + esc(t('write')) + '</button></div>';
    }
    var last = D.settings.lastBackup, days = last ? Math.floor((Date.now() - parseD(last).getTime()) / 864e5) : 999;
    if (totalEntries() >= 10 && days > 30) {
      h += '<div class="card warnc"><div class="grow"><strong>' + esc(t('backup_nudge')) + '</strong><div class="muted">' +
        esc(last ? t('backup_last', { d: shortDate(last) }) : t('backup_never')) + '</div></div>' +
        '<button class="secondary small" data-act="backup">' + esc(t('backup_now')) + '</button></div>';
    }
    h += alertsHtml();
    h += '<div class="quick">' +
      qa('money', 'in', IC.plus, t('q_income'), 'g') + qa('money', 'out', IC.minus, t('q_expense'), 'r') +
      qa('fuel', '', IC.fuel, t('q_fuel')) + qa('fuse', '', IC.tractor, t('q_fuse')) + qa('rain', '', IC.rain, t('q_rain'), 'b') + qa('diary', '', IC.diary, t('q_diary')) +
      (hasAnimals() ? qa('stock', '', IC.cow, t('q_stock')) + qa('health', '', IC.med, t('q_health'), 'r', 'sick') : '') +
      (hasCrops() ? qa('crop', '', IC.sprout, t('q_crop')) : '') +
      '</div>';

    h += '<div class="grid">';
    h += '<div class="card tap" data-act="tab" data-tab="money"><div class="row"><span class="step">' + esc(ymLabel(ym)) + '</span><span class="pill">' + esc(t('tab_money')) + '</span></div>' +
      '<div class="stats">' + stat(t('income'), fmtR(m.inT), 'pos') + stat(t('expenses_incl_fuel'), fmtR(m.outAll), 'neg') +
      stat(t('net'), fmtR(m.net), m.net >= 0 ? 'pos' : 'neg') + '</div></div>';

    var season = summary(rainSeason(), '');
    var lastRain = D.rain.slice().sort(byDateDesc).filter(function (r) { return r.mm > 0; })[0];
    h += '<div class="card tap" data-act="tab" data-tab="rain"><div class="row"><span class="step">' + esc(t('rainfall')) + '</span><span class="pill">' + esc(t('tab_rain')) + '</span></div>' +
      '<div class="stats">' + stat(t('this_month'), fmtMm(m.rain)) + stat(t('season_since', { m: monthName(+D.settings.rainStart, true) }), fmtMm(season.rain)) +
      stat(t('last_rain'), lastRain ? esc(shortDate(lastRain.date)) : '–') + '</div></div>';

    h += '<div class="card tap" data-act="tab" data-tab="fuel"><div class="row"><span class="step">' + esc(t('fuel_month')) + '</span><span class="pill">' + esc(t('tab_fuel')) + '</span></div>' +
      '<div class="stats">' + stat(t('diesel'), fmtL(m.dL)) + stat(t('petrol'), fmtL(m.pL)) + stat(t('spent'), fmtR(m.fuelT)) + '</div></div>';

    if (hasAnimals()) {
      var hc = herd(), an = animalTypes();
      h += '<div class="card tap" data-act="tab" data-tab="farm"><div class="row"><span class="step">' + esc(t('livestock')) + '</span><span class="pill">' + esc(t('tab_farm')) + '</span></div>' +
        '<div class="stats">' + an.map(function (a) { return stat(animalLabel(a), fmtNum(hc[a] || 0, 0)); }).join('') + '</div></div>';
    }
    if (hasCrops()) {
      var growing = D.crops.filter(function (c) { return !c.harvest || c.harvest > today(); });
      var ha = growing.reduce(function (s, c) { return s + (c.ha || 0); }, 0);
      h += '<div class="card tap" data-act="tab" data-tab="farm"><div class="row"><span class="step">' + esc(t('crops_in_ground')) + '</span><span class="pill">' + esc(t('tab_farm')) + '</span></div>' +
        (growing.length ? '<div class="stats">' + stat(t('plantings'), growing.length) + stat(t('hectares'), fmtNum(ha, ha % 1 ? 1 : 0) + ' ha') + '</div>' +
          '<div class="muted" style="margin-top:8px">' + esc(uniq(growing.map(function (c) { return cropLabel(c.crop); }), 6).join(', ')) + '</div>'
          : '<p class="muted" style="margin:10px 0 0">' + esc(t('no_crops')) + '</p>') + '</div>';
    }
    h += '</div>';

    var recent = [].concat(
      D.money.map(function (x) { return { k: 'money', x: x }; }), D.fuel.map(function (x) { return { k: 'fuel', x: x }; }),
      D.rain.map(function (x) { return { k: 'rain', x: x }; }), D.diary.map(function (x) { return { k: 'diary', x: x }; }),
      D.stock.map(function (x) { return { k: 'stock', x: x }; })
    ).sort(function (a, b) { return (b.x.ts || 0) - (a.x.ts || 0); }).slice(0, 6);
    h += '<div class="card"><strong>' + esc(t('recent')) + '</strong>';
    if (!recent.length) h += '<p class="muted" style="margin:8px 0 0">' + esc(t('recent_empty')) + '</p>';
    else h += '<div class="list">' + recent.map(function (r) { return itemHtml(r.k, r.x, true); }).join('') + '</div>';
    h += '</div>';
    h += '<p class="muted center foot">' + esc(t('stored_here')) + '</p>';
    app.innerHTML = h;
  }
  function qa(kind, dir, icon, label, color, type) {
    return '<button class="qa' + (color ? ' ' + color : '') + '" data-act="new" data-kind="' + kind + '"' + (dir ? ' data-dir="' + dir + '"' : '') +
      (type ? ' data-type="' + type + '"' : '') + '>' + ico(icon, 24) + '<span>' + esc(label) + '</span></button>';
  }
  function alertsHtml() {
    var rows = [], sick = sickNow(), due = dueTreatments(7), wd = withdrawals(), np = needPhoto(), owed = owedByWorker();
    var owedN = Object.keys(owed).length, owedR = Object.keys(owed).reduce(function (s, k) { return s + owed[k].amt; }, 0), tdy = today();
    if (sick.length) rows.push(['tab', 'farm', IC.heart, t('alert_sick', { n: sick.length }), sick.slice(0, 3).map(function (h) { return h.who; }).join(', '), 'r']);
    due.forEach(function (h) {
      rows.push(['edit', 'health', IC.med, h.type === 'sick' ? t('alert_followup', { who: h.who || animalLabel(h.an) }) :
        t(h.next < tdy ? 'alert_overdue' : 'alert_due', { what: t('ht_' + h.type).toLowerCase(), an: animalLabel(h.an).toLowerCase() }),
        (h.product ? h.product + ' · ' : '') + shortDate(h.next), h.next < tdy ? 'r' : '', h.id]);
    });
    if (wd.length) rows.push(['tab', 'farm', IC.alert, t('alert_withdrawal', { n: wd.length }),
      wd.slice(0, 2).map(function (x) { return animalLabel(x.h.an) + ' – ' + t('until', { d: shortDate(x.until) }); }).join(' · '), 'r']);
    if (np.length) rows.push(['pending', '', IC.cam, t('alert_photos', { n: np.length }), t('alert_photos_sub'), '']);
    if (owedN) rows.push(['workers', '', IC.people, t('alert_owed', { r: fmtR(owedR) }), t('alert_owed_sub', { n: owedN }), '']);
    if (!rows.length) return '';
    return '<div class="card alerts">' + rows.map(function (r) {
      var attrs = r[0] === 'tab' ? 'data-act="tab" data-tab="' + r[1] + '"' : r[0] === 'edit' ? 'data-act="edit" data-kind="' + r[1] + '" data-id="' + esc(r[6]) + '"' : 'data-act="' + r[0] + '"';
      return '<button class="arow ' + r[5] + '" ' + attrs + '>' + ico(r[2], 22) + '<span class="grow"><b>' + esc(r[3]) + '</b><span class="muted">' + esc(r[4]) + '</span></span>' + ico(IC.next, 18) + '</button>';
    }).join('') + '</div>';
  }

  /* List items (shared) ------------------------------------------------ */
  function itemHtml(kind, x, withKind) {
    var title = '', sub = [], right = '', cls = '';
    if (kind === 'money') {
      title = x.desc || catLabel(x.cat);
      sub = [niceDate(x.date), x.pay ? t('pay_' + x.pay) : '', x.desc ? catLabel(x.cat) : '', D.settings.types.length > 1 ? branchLabel(x.br) : '', x.party];
      right = (x.dir === 'in' ? '+' : '−') + fmtR(x.amt); cls = x.dir === 'in' ? 'pos' : 'neg';
    } else if (kind === 'fuel') {
      title = fmtL(x.l) + ' ' + t(x.kind).toLowerCase();
      sub = [niceDate(x.date), x.pay ? t('pay_' + x.pay) : '', x.mach, t('use_' + x.use)];
      right = fmtR(x.amt);
    } else if (kind === 'rain') {
      title = fmtMm(x.mm); sub = [niceDate(x.date), x.g]; right = '';
    } else if (kind === 'diary') {
      title = x.text.length > 70 ? x.text.slice(0, 70) + '…' : x.text; sub = [niceDate(x.date)];
    } else if (kind === 'stock') {
      title = (x.ev === 'count' || x.ev === 'moved' ? '' : (STOCK_SIGN[x.ev] > 0 ? '+' : '−')) + fmtNum(x.n, 0) + ' ' + animalLabel(x.an).toLowerCase();
      sub = [niceDate(x.date), t('ev_' + x.ev) + (x.ev === 'moved' && x.camp ? ': ' + campName(x.camp) : ''), x.notes];
    } else if (kind === 'fuse') {
      title = fmtL(x.l) + ' ' + t(x.kind).toLowerCase() + ' → ' + (x.mach || '?');
      sub = [niceDate(x.date), jobLabel(x.job), x.camp ? campName(x.camp) : '', x.hrs ? t('hours_short', { h: x.hrs }) : ''];
    } else if (kind === 'health') {
      title = x.type === 'sick' ? (x.who || animalLabel(x.an)) + (x.problem ? ' – ' + x.problem : '') : t('ht_' + x.type) + ': ' + animalLabel(x.an).toLowerCase() + (x.n ? ' (' + x.n + ')' : '');
      sub = [niceDate(x.date), x.type === 'sick' ? animalLabel(x.an) : '', x.product, x.healed ? t('healed_on', { d: shortDate(x.healed) }) : '',
        x.next ? t('next_on', { d: shortDate(x.next) }) : ''];
      if (x.type === 'sick') { right = x.healed ? t('healthy') : t('sick'); cls = x.healed ? 'pos' : 'neg'; }
    }
    var label = withKind ? '<span class="kind">' + esc(t('kind_' + kind)) + '</span>' : '';
    var mark = (kind === 'money' || kind === 'fuel') ? (x.photo ? '<span class="pmark" title="' + esc(t('has_photo')) + '">' + ico(IC.clip, 15) + '</span>'
      : x.photoLater ? '<span class="pmark need" title="' + esc(t('photo_needed')) + '">' + ico(IC.cam, 15) + '</span>' : '') : '';
    return '<button class="item" data-act="edit" data-kind="' + kind + '" data-id="' + esc(x.id) + '"><div class="row"><span class="ttl">' + label + esc(title) + mark + '</span>' +
      (right ? '<span class="amt ' + cls + '">' + esc(right) + '</span>' : '') + '</div>' +
      '<div class="muted">' + esc(sub.filter(Boolean).join(' · ')) + '</div></button>';
  }

  /* ---------------- Money ---------------- */
  function moneyList() {
    var st = LS.money, ym = st.ym || (st.ym = today().slice(0, 7));
    var list = D.money.filter(function (m) { return m.date.slice(0, 7) === ym; }).sort(byDateDesc);
    var tin = 0, tout = 0;
    list.forEach(function (m) { if (m.dir === 'in') tin += m.amt; else tout += m.amt; });
    var shown = list.filter(function (m) { return st.dir === 'all' || m.dir === st.dir; });
    var h = '<div class="two-btn"><button class="primary g" data-act="new" data-kind="money" data-dir="in">' + ico(IC.plus) + esc(t('q_income')) + '</button>' +
      '<button class="primary r" data-act="new" data-kind="money" data-dir="out">' + ico(IC.minus) + esc(t('q_expense')) + '</button></div>';
    var np = needPhoto().length, owed = owedByWorker(), owedN = Object.keys(owed).length;
    h += '<div class="two-btn"><button class="secondary" data-act="workers">' + ico(IC.people, 20) + esc(t('day_workers')) + (owedN ? ' <span class="badge">' + owedN + '</span>' : '') + '</button>' +
      '<button class="secondary" data-act="pending"' + (np ? '' : ' disabled') + '>' + ico(IC.cam, 20) + esc(t('slips_needed')) + (np ? ' <span class="badge">' + np + '</span>' : '') + '</button></div>';
    h += '<div class="two-btn"><button class="secondary" data-act="cash">' + ico(IC.coins, 20) + esc(t('cash_tracker')) + '</button>' +
      '<button class="secondary" data-act="bank">' + ico(IC.bank, 20) + esc(t('bank_check')) + '</button></div>';
    h += '<div class="card">' + monthNav('money', ym) +
      '<div class="stats">' + stat(t('income'), fmtR(tin), 'pos') + stat(t('expenses'), fmtR(tout), 'neg') + stat(t('net'), fmtR(tin - tout), tin - tout >= 0 ? 'pos' : 'neg') + '</div>' +
      '<div class="filter">' + [['all', t('all')], ['in', t('income')], ['out', t('expenses')]].map(function (o) {
        return '<button class="chip' + (st.dir === o[0] ? ' on' : '') + '" data-act="mfilter" data-v="' + o[0] + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div>';
    if (!shown.length) h += '<p class="muted" style="margin:12px 0 0">' + esc(t('money_empty')) + '</p>';
    else h += '<div class="list">' + shown.map(function (m) { return itemHtml('money', m); }).join('') + '</div>';
    h += '</div>';
    // repeating every month
    var rules = D.recur.slice().sort(function (a, b) { return (b.on - a.on) || a.day - b.day; });
    h += '<div class="card"><div class="row"><strong>' + esc(t('repeating')) + '</strong>' +
      '<button class="secondary small" data-act="new" data-kind="recur">' + ico(IC.plus, 18) + esc(t('add')) + '</button></div>' +
      '<div class="hint">' + esc(t('repeating_hint')) + '</div>';
    if (rules.length) h += '<div class="list">' + rules.map(function (r) {
      return '<button class="item" data-act="edit" data-kind="recur" data-id="' + esc(r.id) + '"><div class="row"><span class="ttl">' + esc(r.desc || catLabel(r.cat)) + '</span>' +
        '<span class="amt ' + (r.dir === 'in' ? 'pos' : 'neg') + '">' + (r.dir === 'in' ? '+' : '−') + esc(fmtR(r.amt)) + '</span></div>' +
        '<div class="muted">' + esc((r.on ? t('every_month_on', { d: r.day }) : t('stopped')) + ' · ' + catLabel(r.cat) + (r.party ? ' · ' + r.party : '')) + '</div></button>';
    }).join('') + '</div>';
    h += '</div><p class="muted center foot">' + esc(t('fuel_separate')) + '</p>';
    app.innerHTML = h;
  }

  /* ---------------- Fuel ---------------- */
  function fuelList() {
    var st = LS.fuel, ym = st.ym || (st.ym = today().slice(0, 7));
    var list = D.fuel.filter(function (f) { return f.date.slice(0, 7) === ym; }).sort(byDateDesc);
    var used = D.fuse.filter(function (u) { return u.date.slice(0, 7) === ym; }).sort(byDateDesc);
    var dl = 0, pl = 0, amt = 0, ud = 0, up = 0;
    list.forEach(function (f) { if (f.kind === 'petrol') pl += f.l; else dl += f.l; amt += f.amt; });
    used.forEach(function (u) { if (u.kind === 'petrol') up += u.l; else ud += u.l; });
    var h = '<div class="two-btn"><button class="primary" data-act="new" data-kind="fuel">' + ico(IC.plus) + esc(t('fuel_bought_btn')) + '</button>' +
      '<button class="primary b" data-act="new" data-kind="fuse">' + ico(IC.tractor) + esc(t('fuel_used_btn')) + '</button></div>';
    h += '<div class="card">' + monthNav('fuel', ym) +
      '<div class="stats">' + stat(t('diesel_bought'), fmtL(dl)) + stat(t('diesel_used'), fmtL(ud)) + stat(t('spent'), fmtR(amt)) + '</div>' +
      (pl || up ? '<div class="stats">' + stat(t('petrol_bought'), fmtL(pl)) + stat(t('petrol_used'), fmtL(up)) + '<div></div></div>' : '') + '</div>';
    h += '<div class="card"><strong>' + esc(t('fuel_bought')) + '</strong>';
    h += list.length ? '<div class="list">' + list.map(function (f) { return itemHtml('fuel', f); }).join('') + '</div>' : '<p class="muted" style="margin:8px 0 0">' + esc(t('fuel_empty')) + '</p>';
    h += '</div><div class="card"><strong>' + esc(t('fuel_used')) + '</strong>';
    h += used.length ? '<div class="list">' + used.map(function (u) { return itemHtml('fuse', u); }).join('') + '</div>' : '<p class="muted" style="margin:8px 0 0">' + esc(t('fuse_empty')) + '</p>';
    if (used.length) {
      var bm = {};
      used.forEach(function (u) { bm[u.mach || '?'] = (bm[u.mach || '?'] || 0) + u.l; });
      h += '<div class="step" style="margin-top:14px">' + esc(t('per_machine')) + '</div><table class="kv">' + Object.keys(bm).sort(function (a, b) { return bm[b] - bm[a]; }).map(function (k) {
        return '<tr><td>' + esc(k) + '</td><td>' + esc(fmtL(bm[k])) + '</td></tr>';
      }).join('') + '</table>';
    }
    h += '</div><p class="muted center foot">' + esc(t('fuel_note2')) + '</p>';
    app.innerHTML = h;
  }

  /* ---------------- Rain ---------------- */
  function rainScreen() {
    var now = new Date(), ym = today().slice(0, 7);
    var monthTot = 0, months = [];
    for (var i = 11; i >= 0; i--) months.push([addMonths(ym, -i), 0]);
    D.rain.forEach(function (r) {
      var k = r.date.slice(0, 7);
      months.forEach(function (m) { if (m[0] === k) m[1] += r.mm; });
      if (k === ym) monthTot += r.mm;
    });
    var season = summary(rainSeason(), ''), year = summary(now.getFullYear() + '-01-01', '');
    var max = Math.max.apply(null, months.map(function (m) { return m[1]; }).concat([1]));
    var h = '<button class="primary b" data-act="new" data-kind="rain">' + ico(IC.rain) + esc(t('add_rain')) + '</button>';
    h += '<div class="card" style="margin-top:14px"><div class="stats">' + stat(t('this_month'), fmtMm(monthTot)) +
      stat(t('season_since', { m: monthName(+D.settings.rainStart, true) }), fmtMm(season.rain)) + stat(t('this_year', { y: now.getFullYear() }), fmtMm(year.rain)) + '</div>' +
      '<div class="chart" role="img" aria-label="' + esc(t('rain_chart')) + '">' + months.map(function (m) {
        var hgt = Math.round(100 * m[1] / max);
        return '<div class="bar"><span class="v">' + (m[1] ? fmtNum(m[1], 0) : '') + '</span><div class="b" style="height:' + hgt + '%"></div><span class="l">' + esc(monthName(+m[0].slice(5), true)) + '</span></div>';
      }).join('') + '</div><div class="muted center" style="font-size:13px">' + esc(t('rain_chart')) + '</div></div>';
    var list = D.rain.slice().sort(byDateDesc);
    h += '<div class="card"><strong>' + esc(t('readings')) + '</strong>';
    if (!list.length) h += '<p class="muted" style="margin:8px 0 0">' + esc(t('rain_empty')) + '</p>';
    else {
      h += '<div class="list">' + list.slice(0, LS.rain.n).map(function (r) { return itemHtml('rain', r); }).join('') + '</div>';
      if (list.length > LS.rain.n) h += '<button class="text" data-act="more" data-view="rain">' + esc(t('show_more')) + '</button>';
    }
    app.innerHTML = h + '</div>';
  }

  /* ---------------- Diary ---------------- */
  function diaryList() {
    var st = LS.diary, q = (st.q || '').toLowerCase();
    var list = D.diary.filter(function (d) {
      return !q || d.text.toLowerCase().indexOf(q) > -1 || (d.tags || []).some(function (g) { return t('tag_' + g).toLowerCase().indexOf(q) > -1; });
    }).sort(byDateDesc);
    var h = '<button class="primary" data-act="new" data-kind="diary">' + ico(IC.plus) + esc(t('write_today')) + '</button>';
    h += '<div class="card" style="margin-top:14px"><input class="in" id="dsearch" type="search" placeholder="' + esc(t('search_diary')) + '" value="' + esc(st.q || '') + '">';
    if (!list.length) h += '<p class="muted" style="margin:12px 0 0">' + esc(q ? t('no_results') : t('diary_empty')) + '</p>';
    else {
      var lastDate = '';
      h += '<div class="list">' + list.slice(0, st.n).map(function (d) {
        var head = d.date !== lastDate ? '<div class="dhead">' + esc(niceDate(d.date)) + '</div>' : '';
        lastDate = d.date;
        return head + '<button class="item diary" data-act="edit" data-kind="diary" data-id="' + esc(d.id) + '">' +
          '<div class="dtext">' + esc(d.text) + '</div>' +
          ((d.tags || []).length ? '<div class="tags">' + d.tags.map(function (g) { return '<span class="pill">' + esc(t('tag_' + g)) + '</span>'; }).join('') + '</div>' : '') +
          '</button>';
      }).join('') + '</div>';
      if (list.length > st.n) h += '<button class="text" data-act="more" data-view="diary">' + esc(t('show_more')) + '</button>';
    }
    h += '</div>';
    if (D.settings.remind) h += '<p class="muted center foot">' + esc(t('reminder_where')) + ' <a href="#" data-act="settings">' + esc(t('settings')) + '</a></p>';
    app.innerHTML = h;
  }

  /* ---------------- Farm: livestock + crops ---------------- */
  function farmScreen() {
    var h = '';
    if (!hasAnimals() && !hasCrops()) h += '<div class="card"><p style="margin-top:0">' + esc(t('farm_none')) + '</p><button class="secondary" data-act="settings">' + esc(t('settings')) + '</button></div>';
    if (hasAnimals()) {
      var hc = herd(), an = animalTypes();
      h += '<div class="card"><div class="row"><strong>' + esc(t('livestock')) + '</strong>' +
        '<button class="secondary small" data-act="new" data-kind="stock">' + ico(IC.plus, 18) + esc(t('record')) + '</button></div>' +
        '<div class="herd">' + an.map(function (a) {
          return '<button class="hc" data-act="new" data-kind="stock" data-an="' + a + '"><b>' + fmtNum(hc[a] || 0, 0) + '</b><span>' + esc(animalLabel(a)) + '</span></button>';
        }).join('') + '</div><div class="hint">' + esc(t('herd_hint')) + '</div>';
      var mv = D.stock.slice().sort(byDateDesc);
      if (mv.length) {
        h += '<div class="list" style="margin-top:6px">' + mv.slice(0, LS.stock.n).map(function (x) { return itemHtml('stock', x); }).join('') + '</div>';
        if (mv.length > LS.stock.n) h += '<button class="text" data-act="more" data-view="stock">' + esc(t('show_more')) + '</button>';
      }
      h += '</div>';
      h += healthCard();
    }
    h += campsCard();
    if (hasCrops()) {
      var tdy = today();
      var growing = D.crops.filter(function (c) { return !c.harvest || c.harvest > tdy; }).sort(function (a, b) { return (b.planted || '').localeCompare(a.planted || ''); });
      var done = D.crops.filter(function (c) { return c.harvest && c.harvest <= tdy; }).sort(function (a, b) { return b.harvest.localeCompare(a.harvest); });
      h += '<div class="card"><div class="row"><strong>' + esc(t('crops')) + '</strong>' +
        '<button class="secondary small" data-act="new" data-kind="crop">' + ico(IC.plus, 18) + esc(t('plant')) + '</button></div>';
      h += '<div class="step" style="margin-top:12px">' + esc(t('in_ground')) + '</div>';
      h += growing.length ? '<div class="list">' + growing.map(cropItem).join('') + '</div>' : '<p class="muted" style="margin:6px 0 0">' + esc(t('no_crops')) + '</p>';
      if (done.length) h += '<div class="step" style="margin-top:16px">' + esc(t('harvested')) + '</div><div class="list">' + done.slice(0, 20).map(cropItem).join('') + '</div>';
      h += '</div>';
    }
    app.innerHTML = h;
  }

  /* ---------------- Animal health ---------------- */
  function healthCard() {
    var sick = sickNow(), due = dueTreatments(30), wd = withdrawals(), tdy = today();
    var h = '<div class="card" id="health"><div class="row"><strong>' + esc(t('animal_health')) + '</strong></div>' +
      '<div class="two" style="margin-top:12px"><button class="primary r" data-act="new" data-kind="health" data-type="sick">' + ico(IC.heart, 20) + esc(t('sick_animal')) + '</button>' +
      '<button class="secondary" data-act="new" data-kind="health" data-type="dose">' + ico(IC.med, 20) + esc(t('treatment')) + '</button></div>';
    if (sick.length) {
      h += '<div class="step" style="margin-top:16px">' + esc(t('sick_now')) + '</div><div class="list">' + sick.map(function (x) {
        return '<div class="item static sickrow"><button class="plain grow" data-act="edit" data-kind="health" data-id="' + esc(x.id) + '"><span class="ttl">' + esc(x.who) + '</span>' +
          '<span class="muted">' + esc([animalLabel(x.an), x.problem, x.product, t('since', { d: shortDate(x.date) })].filter(Boolean).join(' · ')) + '</span></button>' +
          '<button class="secondary small g" data-act="healed" data-id="' + esc(x.id) + '">' + ico(IC.heart, 18) + esc(t('healthy_again')) + '</button></div>';
      }).join('') + '</div>';
    }
    if (wd.length) {
      h += '<div class="step" style="margin-top:16px">' + esc(t('withdrawal_now')) + '</div>' + wd.map(function (x) {
        return '<div class="msg warn">' + ico(IC.alert, 18) + ' ' + esc(t('withdrawal_line', { an: animalLabel(x.h.an), p: x.h.product || t('ht_' + x.h.type).toLowerCase(), d: shortDate(x.until) })) +
          (x.h.who ? ' (' + esc(x.h.who) + ')' : '') + '</div>';
      }).join('');
    }
    if (due.length) {
      h += '<div class="step" style="margin-top:16px">' + esc(t('coming_up')) + '</div><div class="list">' + due.map(function (x) {
        return '<button class="item" data-act="repeatHealth" data-id="' + esc(x.id) + '"><div class="row"><span class="ttl">' + esc(x.type === 'sick' ? t('alert_followup', { who: x.who || animalLabel(x.an) }) : t('ht_' + x.type) + ': ' + animalLabel(x.an).toLowerCase()) + '</span>' +
          '<span class="amt ' + (x.next < tdy ? 'neg' : '') + '">' + esc(shortDate(x.next)) + '</span></div><div class="muted">' + esc([x.product, x.next < tdy ? t('overdue') : t('tap_when_done')].filter(Boolean).join(' · ')) + '</div></button>';
      }).join('') + '</div>';
    }
    var recent = D.health.slice().sort(byDateDesc).filter(function (x) { return !(x.type === 'sick' && !x.healed); });
    if (recent.length) {
      h += '<div class="step" style="margin-top:16px">' + esc(t('health_history')) + '</div><div class="list">' + recent.slice(0, LS.health.n).map(function (x) { return itemHtml('health', x); }).join('') + '</div>';
      if (recent.length > LS.health.n) h += '<button class="text" data-act="more" data-view="health">' + esc(t('show_more')) + '</button>';
    }
    if (!sick.length && !recent.length) h += '<p class="muted" style="margin:12px 0 0">' + esc(t('health_empty')) + '</p>';
    return h + '</div>';
  }
  function markHealed(id) {
    var x = D.health.filter(function (h) { return h.id === id; })[0];
    if (!x) return;
    var d = today();
    x.healed = d;
    var line = t('healthy_diary', { who: x.who || animalLabel(x.an), an: animalLabel(x.an).toLowerCase(), since: shortDate(x.date) }) +
      (x.product ? ' ' + t('healthy_diary_med', { p: x.product }) : '');
    var entry = D.diary.filter(function (e) { return e.date === d; }).sort(byDateDesc)[0];
    if (entry) {
      entry.text = entry.text + '\n' + line;
      if ((entry.tags || []).indexOf('animals') < 0) (entry.tags = entry.tags || []).push('animals');
    } else D.diary.push({ id: uid(), ts: Date.now(), date: d, text: line, tags: ['animals'] });
    save(); toast(t('healed_saved'));
  }

  /* ---------------- Camps & lands ---------------- */
  function campsCard() {
    var ty = taxYear(0), list = D.camps.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    var h = '<div class="card"><div class="row"><strong>' + esc(t('camps')) + '</strong>' +
      '<button class="secondary small" data-act="new" data-kind="camp">' + ico(IC.plus, 18) + esc(t('add')) + '</button></div>';
    if (!list.length) h += '<p class="muted" style="margin:10px 0 0">' + esc(t('camps_empty')) + '</p>';
    else h += '<div class="list">' + list.map(function (c) {
      var x = campStats(c, ty[0], ty[1]), lastMove = x.moves[0];
      var sub = [t('ck_' + c.kind), c.ha ? fmtNum(c.ha, c.ha % 1 ? 1 : 0) + ' ha' : '', x.outT ? t('costs_short', { r: fmtR(x.outT) }) : '',
        lastMove ? t('animals_in', { n: lastMove.n, an: animalLabel(lastMove.an).toLowerCase(), d: shortDate(lastMove.date) }) : ''];
      return '<button class="item" data-act="camp" data-id="' + esc(c.id) + '"><div class="row"><span class="ttl">' + esc(c.name) + '</span>' + ico(IC.next, 18) + '</div>' +
        '<div class="muted">' + esc(sub.filter(Boolean).join(' · ')) + '</div></button>';
    }).join('') + '</div>';
    return h + '</div>';
  }
  function campScreen() {
    var c = campById(F.id);
    if (!c) { app.innerHTML = ''; return closeSub(); }
    var ty = taxYear(0), x = campStats(c, ty[0], ty[1]), all = campStats(c, '', '');
    var h = '<div class="card"><div class="row"><span class="pill">' + esc(t('ck_' + c.kind)) + '</span>' +
      '<button class="secondary small" data-act="edit" data-kind="camp" data-id="' + esc(c.id) + '">' + esc(t('edit')) + '</button></div>' +
      (c.notes ? '<p class="muted" style="margin:10px 0 0;white-space:pre-wrap">' + esc(c.notes) + '</p>' : '') +
      '<div class="step" style="margin-top:14px">' + esc(t('p_this_tax')) + '</div>' +
      '<div class="stats">' + stat(t('hectares'), c.ha ? fmtNum(c.ha, c.ha % 1 ? 1 : 0) : '–') + stat(t('costs'), fmtR(x.outT), 'neg') +
      stat(t('cost_per_ha'), c.ha ? fmtR(x.outT / c.ha) : '–') + stat(t('income'), fmtR(x.inT), 'pos') +
      stat(t('diesel_used'), fmtL(x.fuseL)) + stat(t('rainfall'), x.rainN ? fmtMm(x.rain) : '–') + '</div>' +
      (x.rainN ? '' : '<div class="hint">' + esc(t('camp_rain_hint', { name: c.name })) + '</div>') + '</div>';
    h += '<div class="quick">' +
      '<button class="qa r" data-act="campNew" data-kind="money" data-id="' + esc(c.id) + '">' + ico(IC.minus, 22) + '<span>' + esc(t('q_expense')) + '</span></button>' +
      '<button class="qa" data-act="campNew" data-kind="fuse" data-id="' + esc(c.id) + '">' + ico(IC.tractor, 22) + '<span>' + esc(t('q_fuse')) + '</span></button>' +
      (hasAnimals() ? '<button class="qa" data-act="campNew" data-kind="stock" data-id="' + esc(c.id) + '">' + ico(IC.cow, 22) + '<span>' + esc(t('move_here')) + '</span></button>' : '') +
      '<button class="qa b" data-act="campNew" data-kind="rain" data-id="' + esc(c.id) + '">' + ico(IC.rain, 22) + '<span>' + esc(t('q_rain')) + '</span></button>' +
      (hasCrops() ? '<button class="qa" data-act="campNew" data-kind="crop" data-id="' + esc(c.id) + '">' + ico(IC.sprout, 22) + '<span>' + esc(t('q_crop')) + '</span></button>' : '') +
      '</div>';
    if (all.moves.length) {
      h += '<div class="card"><strong>' + esc(t('grazing')) + '</strong><div class="list">' + all.moves.slice(0, 10).map(function (m) {
        var days = Math.round((parseD(today()) - parseD(m.date)) / 864e5);
        return '<button class="item" data-act="edit" data-kind="stock" data-id="' + esc(m.id) + '"><div class="row"><span class="ttl">' + esc(fmtNum(m.n, 0) + ' ' + animalLabel(m.an).toLowerCase()) + '</span>' +
          '<span class="muted">' + esc(t('days_ago', { n: days })) + '</span></div><div class="muted">' + esc(t('moved_in_on', { d: niceDate(m.date) }) + (m.notes ? ' · ' + m.notes : '')) + '</div></button>';
      }).join('') + '</div></div>';
    }
    if (all.crops.length) h += '<div class="card"><strong>' + esc(t('crops')) + '</strong><div class="list">' + all.crops.map(cropItem).join('') + '</div></div>';
    var costs = D.money.filter(function (m) { return m.camp === c.id; }).sort(byDateDesc);
    if (costs.length) h += '<div class="card"><strong>' + esc(t('camp_money')) + '</strong><div class="list">' + costs.slice(0, 30).map(function (m) { return itemHtml('money', m); }).join('') + '</div></div>';
    var fu = D.fuse.filter(function (u) { return u.camp === c.id; }).sort(byDateDesc);
    if (fu.length) h += '<div class="card"><strong>' + esc(t('fuel_used')) + '</strong><div class="list">' + fu.slice(0, 30).map(function (u) { return itemHtml('fuse', u); }).join('') + '</div></div>';
    app.innerHTML = h;
  }

  /* ---------------- Day workers ---------------- */
  function workersScreen() {
    var owed = owedByWorker(), act = D.workers.filter(function (w) { return w.on !== false; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var old = D.workers.filter(function (w) { return w.on === false; });
    var h = '<button class="primary" data-act="new" data-kind="workday"' + (act.length ? '' : ' disabled') + '>' + ico(IC.plus) + esc(t('record_workday')) + '</button>';
    h += '<div class="card" style="margin-top:14px"><div class="row"><strong>' + esc(t('workers')) + '</strong>' +
      '<button class="secondary small" data-act="new" data-kind="worker">' + ico(IC.plus, 18) + esc(t('add_worker')) + '</button></div>';
    if (!act.length) h += '<p class="muted" style="margin:10px 0 0">' + esc(t('workers_empty')) + '</p>';
    else h += '<div class="list">' + act.map(function (w) {
      var o = owed[w.id];
      return '<div class="item static sickrow"><button class="plain grow" data-act="edit" data-kind="worker" data-id="' + esc(w.id) + '"><span class="ttl">' + esc(w.name) + '</span>' +
        '<span class="muted">' + esc(t('per_day', { r: fmtR(w.rate) }) + (o ? ' · ' + t('owed_line', { n: fmtNum(o.days, o.days % 1 ? 1 : 0), r: fmtR(o.amt) }) : ' · ' + t('nothing_owed'))) + '</span></button>' +
        (o ? '<button class="secondary small g" data-act="payWorker" data-id="' + esc(w.id) + '">' + esc(confirmKey === 'pay:' + w.id ? t('pay_confirm', { r: fmtR(o.amt) }) : t('pay')) + '</button>' : '') + '</div>';
    }).join('') + '</div>';
    if (old.length) h += '<div class="hint">' + esc(t('former_workers')) + ': ' + old.map(function (w) { return w.name; }).join(', ') + '</div>';
    h += '</div>';
    var days = D.workdays.slice().sort(byDateDesc);
    h += '<div class="card"><strong>' + esc(t('workdays')) + '</strong>';
    if (!days.length) h += '<p class="muted" style="margin:8px 0 0">' + esc(t('workdays_empty')) + '</p>';
    else {
      h += '<div class="list">' + days.slice(0, LS.workdays.n).map(function (d) {
        var tot = d.people.reduce(function (s, p) { return s + p.d * p.rate; }, 0), unpaid = d.people.some(function (p) { return !p.paid; });
        return '<button class="item" data-act="edit" data-kind="workday" data-id="' + esc(d.id) + '"><div class="row"><span class="ttl">' + esc(d.job || t('workday')) + '</span>' +
          '<span class="amt neg">' + esc(fmtR(tot)) + '</span></div><div class="muted">' + esc([niceDate(d.date), d.people.map(function (p) { return workerName(p.w) + (p.d === 0.5 ? ' (½)' : ''); }).join(', '),
          unpaid ? t('not_paid') : t('paid')].join(' · ')) + '</div></button>';
      }).join('') + '</div>';
      if (days.length > LS.workdays.n) h += '<button class="text" data-act="more" data-view="workdays">' + esc(t('show_more')) + '</button>';
    }
    h += '</div><p class="muted center foot">' + esc(t('salary_hint')) + '</p>';
    app.innerHTML = h;
  }
  function payWorker(id) {
    var owed = owedByWorker()[id];
    if (!owed) return;
    if (confirmKey !== 'pay:' + id) { confirmKey = 'pay:' + id; return render(); }
    confirmKey = '';
    D.workdays.forEach(function (wd) { wd.people.forEach(function (p) { if (p.w === id && !p.paid) p.paid = true; }); });
    D.money.push({ id: uid(), ts: Date.now(), date: today(), dir: 'out', amt: r2(owed.amt), cat: 'wages', br: defaultBranch(), pay: 'cash',
      desc: t('day_wages_desc', { n: fmtNum(owed.days, owed.days % 1 ? 1 : 0) }), party: workerName(id), ref: '', vat: 0 });
    save(); toast(t('paid_saved', { r: fmtR(owed.amt) })); render();
  }

  /* ---------------- Cash tracker ---------------- */
  function evTitle(e) {
    if (e.k === 'cashmove') return cashTitle(e.x) + (e.x.notes ? ' – ' + e.x.notes : '');
    if (e.k === 'fuel') return fmtL(e.x.l) + ' ' + t(e.x.kind).toLowerCase() + (e.x.mach ? ' – ' + e.x.mach : '');
    return e.x.desc || catLabel(e.x.cat);
  }
  function cashScreen() {
    var st = LS.cash, ym = st.ym || (st.ym = today().slice(0, 7));
    var all = cashEvents(), month = all.filter(function (e) { return e.x.date.slice(0, 7) === ym; });
    var rec = 0, spent = 0, banked = 0, drawn = 0;
    month.forEach(function (e) {
      if (e.k === 'cashmove') { if (e.x.type === 'bank') banked += e.x.amt; else if (e.x.type === 'draw') drawn += e.x.amt; }
      else if (e.d > 0) rec += e.d; else spent -= e.d;
    });
    var onHand = all.length ? all[all.length - 1].bal : 0;
    var h = '<div class="card"><div class="step">' + esc(t('cash_on_hand')) + '</div><div class="big ' + (onHand < 0 ? 'neg' : '') + '">' + esc(fmtR(onHand)) + '</div>' +
      (onHand < 0 ? msg('err', esc(t('cash_negative'))) : '<div class="hint">' + esc(t('cash_on_hand_hint')) + '</div>') + '</div>';
    h += '<div class="quick">' +
      '<button class="qa g" data-act="new" data-kind="money" data-dir="in" data-pay="cash">' + ico(IC.plus, 22) + '<span>' + esc(t('cb_in')) + '</span></button>' +
      '<button class="qa r" data-act="new" data-kind="money" data-dir="out" data-pay="cash">' + ico(IC.minus, 22) + '<span>' + esc(t('cb_out')) + '</span></button>' +
      '<button class="qa" data-act="new" data-kind="cashmove" data-type="bank">' + ico(IC.bank, 22) + '<span>' + esc(t('cb_bank')) + '</span></button>' +
      '<button class="qa" data-act="new" data-kind="cashmove" data-type="draw">' + ico(IC.coins, 22) + '<span>' + esc(t('cb_draw')) + '</span></button>' +
      '<button class="qa b" data-act="new" data-kind="cashmove" data-type="count">' + ico(IC.check, 22) + '<span>' + esc(t('cb_count')) + '</span></button></div>';
    h += '<div class="card">' + monthNav('cash', ym) +
      '<div class="stats">' + stat(t('cash_received'), fmtR(rec), 'pos') + stat(t('cash_spent'), fmtR(spent), 'neg') +
      stat(t('cash_banked'), fmtR(banked)) + stat(t('cash_drawn'), fmtR(drawn)) + '</div>';
    if (!month.length) h += '<p class="muted" style="margin:12px 0 0">' + esc(t('cash_empty')) + '</p>';
    else h += '<div class="list">' + month.slice().reverse().map(function (e) {
      var amt = e.set ? '= ' + fmtR(e.x.amt) : (e.d >= 0 ? '+' : '−') + fmtR(Math.abs(e.d));
      return '<button class="item" data-act="edit" data-kind="' + e.k + '" data-id="' + esc(e.x.id) + '"><div class="row"><span class="ttl">' + esc(evTitle(e)) + '</span>' +
        '<span class="amt ' + (e.set ? '' : e.d >= 0 ? 'pos' : 'neg') + '">' + esc(amt) + '</span></div>' +
        '<div class="muted">' + esc(niceDate(e.x.date) + ' · ' + t('balance_after', { r: fmtR(e.bal) })) + '</div></button>';
    }).join('') + '</div>';
    app.innerHTML = h + '</div>';
  }

  /* ---------------- Bank check list ---------------- */
  function bankScreen() {
    var st = LS.bank, ym = st.ym || (st.ym = today().slice(0, 7));
    var from = ym + '-01', to = dateStr(new Date(+ym.slice(0, 4), +ym.slice(5), 0));
    var list = bankItems(from, to), tin = 0, tout = 0, ok = 0;
    list.forEach(function (b) { if (b.amt >= 0) tin += b.amt; else tout -= b.amt; if (b.x.bankOk) ok++; });
    var unset = D.money.filter(function (m) { return !m.pay && inRange(m.date, from, to); }).length + D.fuel.filter(function (f) { return !f.pay && inRange(f.date, from, to); }).length;
    var h = '<div class="card">' + monthNav('bank', ym) +
      '<div class="stats">' + stat(t('bank_in'), fmtR(tin), 'pos') + stat(t('bank_out'), fmtR(tout), 'neg') + stat(t('bank_ticked'), ok + ' / ' + list.length, ok === list.length && list.length ? 'pos' : '') + '</div>' +
      '<div class="hint">' + esc(t('bank_hint')) + '</div>';
    if (unset) h += msg('warn', ico(IC.alert, 18) + ' ' + esc(t('bank_unset', { n: unset })));
    if (!list.length) h += '<p class="muted" style="margin:12px 0 0">' + esc(t('bank_empty')) + '</p>';
    else h += '<div class="list">' + list.map(function (b) {
      return '<div class="item static sickrow"><button class="tick' + (b.x.bankOk ? ' on' : '') + '" data-act="bankTick" data-kind="' + b.k + '" data-id="' + esc(b.x.id) + '" aria-pressed="' + !!b.x.bankOk + '" aria-label="' + esc(t('bank_tick')) + '">' + ico(IC.check, 20) + '</button>' +
        '<button class="plain grow" data-act="edit" data-kind="' + b.k + '" data-id="' + esc(b.x.id) + '"><span class="row"><span class="ttl">' + esc(evTitle(b)) + '</span>' +
        '<span class="amt ' + (b.amt >= 0 ? 'pos' : 'neg') + '">' + esc((b.amt >= 0 ? '+' : '−') + fmtR(Math.abs(b.amt))) + '</span></span>' +
        '<span class="muted">' + esc([niceDate(b.x.date), b.k === 'cashmove' ? '' : t('pay_' + b.x.pay), b.x.party || b.x.sup || '', b.x.ref].filter(Boolean).join(' · ')) + '</span></button></div>';
    }).join('') + '</div>';
    app.innerHTML = h + '</div>';
  }

  /* ---------------- Slips still needing a photo ---------------- */
  function pendingScreen() {
    var list = needPhoto().map(function (x) { return { k: D.money.indexOf(x) > -1 ? 'money' : 'fuel', x: x }; }).sort(function (a, b) { return byDateDesc(a.x, b.x); });
    var h = '<div class="card"><p class="muted" style="margin:0">' + esc(t('pending_hint')) + '</p>';
    h += list.length ? '<div class="list">' + list.map(function (r) { return itemHtml(r.k, r.x); }).join('') + '</div>' : '<p>' + esc(t('pending_none')) + '</p>';
    app.innerHTML = h + '</div>';
  }

  function cropItem(c) {
    var sub = [c.ha ? fmtNum(c.ha, c.ha % 1 ? 1 : 0) + ' ha' : '', c.planted ? t('planted_on', { d: shortDate(c.planted) }) : '',
      c.harvest ? t('harvest_on', { d: shortDate(c.harvest) }) : '', c.yield ? fmtNum(c.yield, c.yield % 1 ? 1 : 0) + ' ' + t('unit_' + (c.unit || 't')) : ''];
    var badge = c.purpose === 'feed' ? '<span class="pill feed">' + esc(t('purpose_feed_short')) + '</span>' : c.purpose === 'both' ? '<span class="pill feed">' + esc(t('purpose_both_short')) + '</span>' : '';
    return '<button class="item" data-act="edit" data-kind="crop" data-id="' + esc(c.id) + '"><div class="row"><span class="ttl">' + esc(cropLabel(c.crop)) +
      (c.field ? ' <span class="muted">· ' + esc(c.field) + '</span>' : '') + '</span>' + badge + '</div><div class="muted">' + esc(sub.filter(Boolean).join(' · ')) + '</div></button>';
  }

  /* ================================================================ */
  /* Forms                                                             */
  /* ================================================================ */
  function openNew(kind, opts) {
    opts = opts || {};
    var s = { kind: kind, date: today() };
    if (kind === 'money' || kind === 'recur') {
      s.dir = opts.dir || 'out'; s.cat = catsFor(s.dir)[0]; s.br = defaultBranch(); s.vatIncl = !NO_VAT_DEFAULT[s.cat]; s.pay = lastPay(s.dir);
      if (kind === 'recur') { s.day = String(Math.min(28, new Date().getDate())); s.on = true; }
      if (opts.prefill) Object.assign(s, opts.prefill);
    } else if (kind === 'fuel') {
      var lastF = D.fuel.slice().sort(byDateDesc)[0];
      s.fkind = lastF ? lastF.kind : 'diesel'; s.use = 'farm'; s.vatIncl = true; s.pay = lastF && lastF.pay ? lastF.pay : 'eft';
    } else if (kind === 'fuse') { s.fkind = 'diesel'; }
    else if (kind === 'diary') { s.tags = []; }
    else if (kind === 'crop') { s.purpose = D.settings.types.indexOf('fodder') > -1 && D.settings.types.length === 1 ? 'feed' : 'sale'; s.unit = 't'; s.planted = today(); s.date = undefined; }
    else if (kind === 'stock') { var an = animalTypes(); s.an = opts.an || an[0]; s.ev = D.stock.some(function (x) { return x.an === s.an; }) ? 'born' : 'count'; }
    else if (kind === 'health') { s.type = opts.type || 'sick'; s.an = opts.an || animalTypes()[0]; }
    else if (kind === 'camp') { s.ckind = 'camp'; s.date = undefined; }
    else if (kind === 'worker') { s.on = true; s.date = undefined; var lw = D.workers[D.workers.length - 1]; s.rate = lw ? numIn(lw.rate) : ''; }
    else if (kind === 'workday') { s.people = {}; s.paidNow = true; }
    else if (kind === 'cashmove') { s.ctype = opts.type || 'bank'; }
    if (opts.camp) {
      var c = campById(opts.camp);
      if (kind === 'stock') s.ev = 'moved';
      if (kind === 'rain') s.g = c ? c.name : '';
      if (kind === 'crop') s.field = c ? c.name : '';
      s.camp = opts.camp;
    }
    openSub('form', s);
  }
  function openEdit(kind, id) {
    var x = D[COLL[kind]].filter(function (r) { return r.id === id; })[0];
    if (!x) return;
    var s = { kind: kind, id: id, date: x.date };
    if (kind === 'money') Object.assign(s, { dir: x.dir, amt: numIn(x.amt), cat: x.cat, br: x.br || 'general', desc: x.desc, party: x.party, ref: x.ref, vatIncl: !!x.vat, pay: x.pay || '',
      camp: x.camp || '', photo: x.photo || '', photoLater: !!x.photoLater });
    else if (kind === 'recur') Object.assign(s, { dir: x.dir, amt: numIn(x.amt), cat: x.cat, br: x.br || 'general', desc: x.desc, party: x.party, vatIncl: !!x.vatIncl, day: String(x.day), on: x.on !== false, camp: x.camp || '', pay: x.pay || '' });
    else if (kind === 'cashmove') Object.assign(s, { ctype: x.type, amt: numIn(x.amt), notes: x.notes });
    else if (kind === 'fuel') Object.assign(s, { fkind: x.kind, l: numIn(x.l), amt: numIn(x.amt), use: x.use, mach: x.mach, sup: x.sup, ref: x.ref, vatIncl: !!x.vat, pay: x.pay || '',
      photo: x.photo || '', photoLater: !!x.photoLater });
    else if (kind === 'fuse') Object.assign(s, { fkind: x.kind, l: numIn(x.l), mach: x.mach, job: jobLabel(x.job), camp: x.camp || '', hrs: x.hrs || '', notes: x.notes });
    else if (kind === 'rain') Object.assign(s, { mm: numIn(x.mm), g: x.g });
    else if (kind === 'diary') Object.assign(s, { text: x.text, tags: (x.tags || []).slice() });
    else if (kind === 'crop') Object.assign(s, { field: x.field, crop: cropLabel(x.crop), purpose: x.purpose, ha: numIn(x.ha), planted: x.planted, harvest: x.harvest, yield: numIn(x.yield), unit: x.unit || 't', notes: x.notes, camp: x.camp || '' });
    else if (kind === 'stock') Object.assign(s, { an: x.an, ev: x.ev, n: numIn(x.n), notes: x.notes, camp: x.camp || '' });
    else if (kind === 'health') Object.assign(s, { type: x.type, an: x.an, who: x.who, problem: x.problem, product: x.product, n: numIn(x.n), wd: numIn(x.wd), next: x.next || '', notes: x.notes, healed: x.healed || '' });
    else if (kind === 'camp') Object.assign(s, { name: x.name, ckind: x.kind, ha: numIn(x.ha), notes: x.notes });
    else if (kind === 'worker') Object.assign(s, { name: x.name, rate: numIn(x.rate), phone: x.phone, on: x.on !== false });
    else if (kind === 'workday') {
      var ppl = {}; x.people.forEach(function (p) { ppl[p.w] = p.d; });
      Object.assign(s, { job: x.job, camp: x.camp || '', people: ppl, paidNow: x.people.every(function (p) { return p.paid; }) });
    }
    openSub('form', s);
  }

  var FORMS = {};
  function formScreen() {
    var k = F.kind, h = '<div class="card form">';
    h += FORMS[k]();
    h += msg('err', F.err);
    h += '<div class="stack" style="margin-top:22px"><button class="primary" data-act="saveForm">' + esc(t('save')) + '</button>';
    if (F.id) h += confirmBtn('del', 'deleteForm', k === 'recur' ? t('delete_rule') : t('delete'), t('delete_again'));
    else h += '<button class="text" data-act="close">' + esc(t('cancel')) + '</button>';
    h += '</div></div>';
    if (F.after) h = msg('info', F.after) + h;
    app.innerHTML = h;
    if (F.photo && !F.photoSrc) photoUrl(F.photo).then(function (u) { if (u && V === 'form' && F) { F.photoSrc = u; render(); } });
    var first = app.querySelector('[data-focus]');
    if (first && !F.id && window.matchMedia('(min-width: 900px)').matches) first.focus();
  }

  // Slip photo block for money & fuel purchases
  function photoBlock() {
    if (useLS) return '';
    var h = '<div class="fw"><label class="f">' + esc(t('slip_photo')) + '</label>';
    if (F.photoSrc && !F.photoRemoved) {
      h += '<div class="photo"><img src="' + F.photoSrc + '" alt="' + esc(t('slip_photo')) + '" data-act="viewPhoto"></div>' +
        '<div class="two" style="margin-top:8px"><label class="btn secondary small wide" for="camIn">' + ico(IC.cam, 18) + esc(t('retake')) + '</label>' +
        '<button class="text danger" data-act="rmPhoto">' + esc(t('remove_photo')) + '</button></div>';
    } else {
      h += '<div class="two"><label class="btn secondary" for="camIn">' + ico(IC.cam, 20) + esc(t('take_photo')) + '</label>' +
        '<label class="btn secondary" for="galIn">' + ico(IC.image, 20) + esc(t('choose_photo')) + '</label></div>' +
        '<div style="margin-top:12px">' + check('photoLater', t('photo_later')) + '</div>';
    }
    h += '<input type="file" accept="image/*" capture="environment" id="camIn" class="hidden"><input type="file" accept="image/*" id="galIn" class="hidden">';
    return h + '</div>';
  }

  FORMS.money = function () { return moneyForm(); };
  FORMS.recur = function () { return moneyForm(); };
  function moneyForm() {
    var rec = F.kind === 'recur';
    var cats = catsFor(F.dir, F.cat).map(function (c) { return [c, catLabel(c)]; }).concat([['__new', t('new_category')]]);
    var amtN = num(F.amt), days = [];
    for (var d = 1; d <= 28; d++) days.push([String(d), String(d)]);
    var h = seg('dir', [['in', t('income')], ['out', t('expense')]], 'big2') +
      '<div class="two">' + fld(t('amount'), inp('amt', { mode: 'decimal', ph: '0.00', cls: 'money', id: 'f-amt' }).replace('<input', '<input data-focus="1"')) +
      (rec ? fld(t('day_of_month'), sel('day', days)) : fld(t('date'), inp('date', { type: 'date' }))) + '</div>' +
      fld(t(F.dir === 'in' ? 'paid_how_in' : 'paid_how_out'), seg('pay', PAYS.map(function (p) { return [p, esc(t('pay_' + p))]; }))) +
      fld(t('category'), sel('cat', cats, true));
    if (F.cat === '__new') h += fld(t('new_category_name'), inp('newCat', { max: 40 }));
    if (D.settings.types.length > 1) h += fld(t('branch'), sel('br', branches().map(function (b) { return [b, branchLabel(b)]; })));
    h += fld(t('description'), inp('desc', { ph: t(rec ? 'desc_rec_ph' : F.dir === 'in' ? 'desc_in_ph' : 'desc_out_ph'), max: 120 }));
    var parties = uniq(D.money.slice().sort(byDateDesc).filter(function (m) { return m.dir === F.dir; }).map(function (m) { return m.party; }), 6);
    h += fld(t(F.dir === 'in' ? 'party_in' : 'party_out'), inp('party', { max: 80 }) + chips('party', parties));
    if (D.camps.length) h += fld(t('camp_land'), sel('camp', campOpts()), esc(t('camp_money_hint')));
    if (!rec) h += fld(t('reference'), inp('ref', { max: 40, ph: t('reference_ph') }));
    if (D.settings.vat) {
      h += '<div style="margin-top:16px">' + check('vatIncl', t('includes_vat', { r: D.settings.vatRate })) + '</div>' +
        '<div class="hint" id="live-vat">' + vatLine(amtN) + '</div>';
    }
    if (rec) {
      h += '<div style="margin-top:16px">' + check('on', t('repeat_on')) + '</div><div class="hint">' + esc(t('repeat_rule_hint')) + '</div>';
    } else {
      h += photoBlock();
      if (!F.id && !F.wdLink) h += '<div style="margin-top:16px">' + check('repeat', t('repeat_monthly')) + '</div>' +
        (F.repeat ? '<div class="hint">' + esc(t('repeat_monthly_hint', { d: Math.min(28, parseD(F.date || today()).getDate()) })) + '</div>' : '');
    }
    return h;
  }
  function vatLine(amtN) {
    if (!F.vatIncl) return esc(t('vat_none'));
    if (isNaN(amtN)) return '&nbsp;';
    var v = vatOf(amtN, true);
    return esc(t('vat_line', { v: fmtR(v), x: fmtR(amtN - v) }));
  }
  function fuelForm() {
    var lN = num(F.l), aN = num(F.amt);
    var mach = uniq(D.fuel.slice().sort(byDateDesc).map(function (f) { return f.mach; }), 6);
    var sup = uniq(D.fuel.slice().sort(byDateDesc).map(function (f) { return f.sup; }), 4);
    var h = seg('fkind', [['diesel', t('diesel')], ['petrol', t('petrol')]], 'big2') +
      '<div class="two">' + fld(t('litres'), inp('l', { mode: 'decimal', ph: '0', cls: 'money', id: 'f-l' }).replace('<input', '<input data-focus="1"')) +
      fld(t('total_paid'), inp('amt', { mode: 'decimal', ph: '0.00', cls: 'money', id: 'f-amt' })) + '</div>' +
      '<div class="hint" id="live-ppl">' + pplLine(lN, aN) + '</div>' +
      fld(t('date'), inp('date', { type: 'date' })) +
      fld(t('paid_how_out'), seg('pay', PAYS.map(function (p) { return [p, esc(t('pay_' + p))]; }))) +
      fld(t('used_for'), seg('use', [['farm', t('use_farm')], ['road', t('use_road')], ['other', t('use_other')]], 'wrap3'),
        F.fkind === 'diesel' ? esc(t('use_hint')) : '') +
      fld(t('machine'), inp('mach', { max: 60, ph: t('machine_ph') }) + chips('mach', mach)) +
      fld(t('supplier'), inp('sup', { max: 60 }) + chips('sup', sup)) +
      fld(t('reference'), inp('ref', { max: 40, ph: t('reference_ph') }));
    if (D.settings.vat) h += '<div style="margin-top:16px">' + check('vatIncl', t('includes_vat', { r: D.settings.vatRate })) + '</div><div class="hint" id="live-vat">' + vatLine(aN) + '</div>';
    return h + photoBlock();
  }
  function machines() {
    return uniq(D.fuse.slice().sort(byDateDesc).map(function (u) { return u.mach; })
      .concat(D.fuel.slice().sort(byDateDesc).map(function (f) { return f.mach; })), 8);
  }
  function fuseForm() {
    var used = uniq(D.fuse.slice().sort(byDateDesc).map(function (u) { return jobLabel(u.job); }), 12);
    var jobs = uniq(used.concat(JOBS.map(jobLabel)), 16);
    var h = msg('info', esc(t('fuse_intro'))).replace('margin: 0 0 14px', '') +
      seg('fkind', [['diesel', t('diesel')], ['petrol', t('petrol')]], 'big2') +
      '<div class="two">' + fld(t('litres'), inp('l', { mode: 'decimal', ph: '0', cls: 'money' }).replace('<input', '<input data-focus="1"')) +
      fld(t('date'), inp('date', { type: 'date' })) + '</div>' +
      fld(t('poured_into'), inp('mach', { max: 60, ph: t('poured_into_ph') }) + chips('mach', machines())) +
      fld(t('main_job'), inp('job', { max: 60, ph: t('main_job_ph') }) + chips('job', jobs));
    if (D.camps.length) h += fld(t('camp_land'), sel('camp', campOpts()));
    h += fld(t('hour_meter'), inp('hrs', { max: 12, mode: 'decimal', ph: t('optional') })) +
      fld(t('notes'), inp('notes', { max: 120, ph: t('optional') }));
    return h;
  }
  function pplLine(lN, aN) {
    if (isNaN(lN) || isNaN(aN) || !lN) return '&nbsp;';
    return esc(t('per_litre', { p: fmtR(aN / lN) }));
  }
  function rainForm() {
    var gauges = uniq(D.rain.slice().sort(byDateDesc).map(function (r) { return r.g; }).concat(D.camps.map(function (c) { return c.name; })), 10);
    return '<div class="center">' + fld(t('rain_mm'), inp('mm', { mode: 'decimal', ph: '0', cls: 'big', id: 'f-mm' }).replace('<input', '<input data-focus="1"')) + '</div>' +
      fld(t('date'), inp('date', { type: 'date' }), esc(t('rain_date_hint'))) +
      fld(t('gauge'), inp('g', { max: 40, ph: t('gauge_ph') }) + chips('g', gauges));
  }
  function diaryForm() {
    return fld(t('date'), inp('date', { type: 'date' })) +
      fld(t('what_happened'), area('text', t('diary_ph'), 7).replace('<textarea', '<textarea data-focus="1"')) +
      fld(t('tags'), multi('tags', TAGS, function (g) { return t('tag_' + g); }));
  }
  function cropForm() {
    var sugg = [];
    D.settings.types.forEach(function (k) { (CROP_SUGG[k] || []).forEach(function (c) { sugg.push(c); }); });
    var used = uniq(D.crops.map(function (c) { return cropLabel(c.crop); }), 8);
    var fields = uniq(D.camps.filter(function (c) { return c.kind !== 'camp'; }).map(function (c) { return c.name; })
      .concat(D.crops.slice().reverse().map(function (c) { return c.field; })).concat(D.camps.map(function (c) { return c.name; })), 10);
    var list = uniq(used.concat(sugg.map(cropLabel)), 10);
    return fld(t('crop'), inp('crop', { max: 50 }).replace('<input', '<input data-focus="1"') + chips('crop', list)) +
      fld(t('field'), inp('field', { max: 50, ph: t('field_ph') }) + chips('field', fields)) +
      fld(t('purpose'), seg('purpose', [['sale', t('purpose_sale')], ['feed', t('purpose_feed')], ['both', t('purpose_both')]], 'wrap3')) +
      '<div class="two">' + fld(t('hectares'), inp('ha', { mode: 'decimal', ph: '0' })) + fld(t('planted'), inp('planted', { type: 'date' })) + '</div>' +
      '<div class="two">' + fld(t('harvested_date'), inp('harvest', { type: 'date' })) +
      fld(t('yield'), '<div class="yield">' + inp('yield', { mode: 'decimal', ph: '0' }) + sel('unit', UNITS.map(function (u) { return [u, t('unit_' + u)]; })) + '</div>') + '</div>' +
      fld(t('notes'), area('notes', t('crop_notes_ph'), 3));
  }
  function stockForm() {
    var an = animalTypes(), cur = herd()[F.an] || 0;
    var h = fld(t('animal'), seg('an', an.map(function (a) { return [a, esc(animalLabel(a))]; }), 'wrap3')) +
      '<div class="hint">' + esc(t('herd_now', { n: fmtNum(cur, 0) })) + '</div>' +
      fld(t('what_happened'), seg('ev', STOCK_EV.map(function (e) { return [e, esc(t('ev_' + e))]; }), 'wrap3'),
        F.ev === 'count' ? esc(t('count_hint')) : F.ev === 'moved' ? esc(t('moved_hint')) : '');
    if (F.ev === 'sold' || F.ev === 'slaughter') {
      var w = withdrawals().filter(function (x) { return x.h.an === F.an; })[0];
      if (w) h += msg('err', ico(IC.alert, 18) + ' ' + esc(t('withdrawal_warn', { p: w.h.product || t('ht_' + w.h.type).toLowerCase(), d: shortDate(w.until) })));
    }
    if (F.ev === 'moved') h += D.camps.length ? fld(t('to_camp'), sel('camp', campOpts())) : msg('err', esc(t('no_camps_yet')));
    h += '<div class="two">' + fld(F.ev === 'count' ? t('total_now') : t('how_many'), inp('n', { mode: 'numeric', ph: '0', cls: 'money' }).replace('<input', '<input data-focus="1"')) +
      fld(t('date'), inp('date', { type: 'date' })) + '</div>' +
      fld(t('notes'), inp('notes', { max: 120, ph: t('stock_notes_ph') }));
    return h;
  }
  function healthForm() {
    var an = animalTypes(), sick = F.type === 'sick';
    var prods = uniq(D.health.slice().sort(byDateDesc).map(function (x) { return x.product; }), 8);
    var h = '';
    if (!F.id || !sick) h += fld(t('what_kind'), seg('type', HEALTH_TYPES.map(function (k) { return [k, esc(t('ht_' + k))]; }), 'wrap3'));
    h += fld(t('animal'), seg('an', an.map(function (a) { return [a, esc(animalLabel(a))]; }), 'wrap3'));
    if (sick) {
      h += fld(t('animal_who'), inp('who', { max: 60, ph: t('animal_who_ph') }).replace('<input', '<input data-focus="1"')) +
        fld(t('problem'), inp('problem', { max: 120, ph: t('problem_ph') }));
    } else {
      h += fld(t('how_many_treated'), inp('n', { mode: 'numeric', ph: t('optional') })) +
        fld(t('which_animals'), inp('who', { max: 60, ph: t('which_animals_ph') }));
    }
    h += fld(sick ? t('medicine_given') : t('product'), inp('product', { max: 60, ph: sick ? t('medicine_ph') : t('product_ph') }) + chips('product', prods)) +
      '<div class="two">' + fld(t('date'), inp('date', { type: 'date' })) + fld(t('withdrawal_days'), inp('wd', { mode: 'numeric', ph: '0' })) + '</div>' +
      '<div class="hint">' + esc(t('withdrawal_hint')) + '</div>' +
      fld(sick ? t('next_treatment') : t('next_due'), inp('next', { type: 'date' }), esc(t('next_hint'))) +
      fld(t('notes'), area('notes', t('optional'), 2));
    if (sick && F.id) {
      h += F.healed ? msg('info', esc(t('healed_on', { d: shortDate(F.healed) }))) :
        '<div style="margin-top:18px"><button class="secondary g" data-act="healed" data-id="' + esc(F.id) + '">' + ico(IC.heart, 20) + esc(t('healthy_again')) + '</button><div class="hint">' + esc(t('healthy_again_hint')) + '</div></div>';
    }
    return h;
  }
  function campForm() {
    return fld(t('camp_name'), inp('name', { max: 50, ph: t('camp_name_ph') }).replace('<input', '<input data-focus="1"')) +
      fld(t('camp_kind'), seg('ckind', CAMP_KINDS.map(function (k) { return [k, esc(t('ck_' + k))]; }), 'wrap3')) +
      fld(t('hectares'), inp('ha', { mode: 'decimal', ph: '0' })) +
      fld(t('notes'), area('notes', t('camp_notes_ph'), 3));
  }
  function workerForm() {
    return fld(t('worker_name'), inp('name', { max: 60 }).replace('<input', '<input data-focus="1"')) +
      fld(t('day_rate'), inp('rate', { mode: 'decimal', ph: '0.00', cls: 'money' })) +
      fld(t('phone'), inp('phone', { max: 20, mode: 'tel', ph: t('optional') })) +
      (F.id ? '<div style="margin-top:16px">' + check('on', t('still_works')) + '</div>' : '');
  }
  function workdayForm() {
    var ws = D.workers.filter(function (w) { return w.on !== false || F.people[w.id]; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var used = uniq(D.workdays.slice().sort(byDateDesc).map(function (d) { return d.job; }), 8);
    var h = fld(t('date'), inp('date', { type: 'date' })) +
      fld(t('who_worked'), '<div class="chips">' + ws.map(function (w) {
        var d = F.people[w.id] || 0;
        return '<button type="button" class="chip' + (d ? ' on' : '') + '" data-act="wpick" data-id="' + esc(w.id) + '">' + esc(w.name) + (d === 0.5 ? ' · ½' : '') + '</button>';
      }).join('') + '</div>', esc(t('who_worked_hint'))) +
      '<div class="hint" id="live-wd"><b>' + esc(workdayTotal()) + '</b></div>' +
      fld(t('job_done'), inp('job', { max: 80, ph: t('job_done_ph') }) + chips('job', used));
    if (D.camps.length) h += fld(t('camp_land'), sel('camp', campOpts()));
    var locked = F.id && D.workdays.some(function (x) { return x.id === F.id && x.people.some(function (p) { return p.paid; }); });
    h += locked ? msg('info', esc(t('workday_paid_note'))) : '<div style="margin-top:16px">' + check('paidNow', t('paid_today')) + '</div><div class="hint">' + esc(t('paid_today_hint')) + '</div>';
    return h;
  }
  function workdayTotal() {
    var tot = 0, n = 0;
    Object.keys(F.people || {}).forEach(function (id) { var w = workerById(id); if (w && F.people[id]) { tot += F.people[id] * w.rate; n++; } });
    return t('workday_total', { n: n, r: fmtR(tot) });
  }
  function cashmoveForm() {
    return fld(t('what_kind'), seg('ctype', CASH_TYPES.map(function (k) { return [k, esc(t('ct_' + k))]; }), 'wrap3'),
        esc(t('cth_' + F.ctype, { r: fmtR(cashOnHand()) }))) +
      '<div class="two">' + fld(F.ctype === 'count' ? t('cash_counted') : t('amount'), inp('amt', { mode: 'decimal', ph: '0.00', cls: 'money' }).replace('<input', '<input data-focus="1"')) +
      fld(t('date'), inp('date', { type: 'date' })) + '</div>' +
      fld(t('notes'), inp('notes', { max: 120, ph: t('optional') }));
  }
  FORMS.cashmove = cashmoveForm;
  FORMS.fuel = fuelForm; FORMS.fuse = fuseForm; FORMS.rain = rainForm; FORMS.diary = diaryForm; FORMS.crop = cropForm;
  FORMS.stock = stockForm; FORMS.health = healthForm; FORMS.camp = campForm; FORMS.worker = workerForm; FORMS.workday = workdayForm;

  function saveForm() {
    var k = F.kind, rec = { id: F.id || uid(), ts: Date.now() }, e = '';
    var old = F.id ? D[COLL[k]].filter(function (r) { return r.id === F.id; })[0] : null;
    if (old) rec.ts = old.ts || rec.ts;
    if (['crop', 'camp', 'worker', 'recur'].indexOf(k) < 0) { if (!F.date) e = t('err_date'); rec.date = F.date; }
    var extra = [];   // follow-up records (e.g. wages paid)

    if (k === 'money' || k === 'recur') {
      var a = num(F.amt);
      if (isNaN(a) || a <= 0) e = t('err_amount');
      var cat = F.cat;
      if (cat === '__new') {
        var name = clean(F.newCat, 40);
        if (!name) e = t('err_newcat');
        else {
          cat = 'c:' + name;
          var list = D.settings.cats[F.dir];
          if (!list.some(function (n) { return n.toLowerCase() === name.toLowerCase(); })) list.push(name);
        }
      }
      Object.assign(rec, { dir: F.dir, amt: r2(a), cat: cat, br: F.br || defaultBranch(), desc: clean(F.desc, 120), party: clean(F.party, 80), camp: F.camp || '', pay: F.pay || '' });
      if (!e && !F.pay) e = t('err_pay');
      if (k === 'money') {
        Object.assign(rec, { ref: clean(F.ref, 40), vat: D.settings.vat ? vatOf(r2(a), !!F.vatIncl) : 0 });
        if (old && old.rid) rec.rid = old.rid;
        if (old && old.wd) rec.wd = old.wd;
        if (old && old.bankOk && old.pay === rec.pay && old.amt === rec.amt) rec.bankOk = true;
      } else {
        var day = Math.max(1, Math.min(28, +F.day || 1)), cur = today().slice(0, 7);
        Object.assign(rec, { vatIncl: !!F.vatIncl, day: day, on: !!F.on,
          last: old ? old.last : (day < new Date().getDate() ? cur : addMonths(cur, -1)) });
      }
    } else if (k === 'fuel') {
      var l = num(F.l), amt = num(F.amt);
      if (isNaN(l) || l <= 0) e = t('err_litres');
      else if (isNaN(amt) || amt < 0) e = t('err_amount');
      if (!e && !F.pay) e = t('err_pay');
      if (old && old.bankOk && old.pay === F.pay && old.amt === r2(amt)) rec.bankOk = true;
      Object.assign(rec, { pay: F.pay || '', kind: F.fkind, l: r2(l), amt: r2(amt), use: F.use, mach: clean(F.mach, 60), sup: clean(F.sup, 60), ref: clean(F.ref, 40),
        vat: D.settings.vat ? vatOf(r2(amt), !!F.vatIncl) : 0 });
    } else if (k === 'cashmove') {
      var ca = num(F.amt);
      if (isNaN(ca) || ca < 0 || (F.ctype !== 'count' && ca === 0)) e = t('err_amount');
      Object.assign(rec, { type: F.ctype, amt: r2(ca), notes: clean(F.notes, 120) });
      if (old && old.bankOk && old.amt === rec.amt) rec.bankOk = true;
    } else if (k === 'fuse') {
      var ul = num(F.l);
      if (isNaN(ul) || ul <= 0) e = t('err_litres');
      else if (!clean(F.mach)) e = t('err_mach');
      else if (!clean(F.job)) e = t('err_job');
      Object.assign(rec, { kind: F.fkind, l: r2(ul), mach: clean(F.mach, 60), job: keyFor('job_', clean(F.job, 60)), camp: F.camp || '', hrs: clean(F.hrs, 12), notes: clean(F.notes, 120) });
    } else if (k === 'rain') {
      var mm = num(F.mm);
      if (isNaN(mm) || mm < 0 || mm > 1000) e = t('err_mm');
      Object.assign(rec, { mm: Math.round(mm * 10) / 10, g: clean(F.g, 40) });
    } else if (k === 'diary') {
      var tx = String(F.text || '').replace(/\r/g, '').trim().slice(0, 5000);
      if (!tx) e = t('err_text');
      Object.assign(rec, { text: tx, tags: (F.tags || []).slice() });
    } else if (k === 'crop') {
      var c = clean(F.crop, 50), ha = F.ha ? num(F.ha) : 0, y = F.yield ? num(F.yield) : 0;
      if (!c) e = t('err_crop');
      else if (isNaN(ha) || ha < 0) e = t('err_ha');
      else if (isNaN(y) || y < 0) e = t('err_yield');
      else if (F.planted && F.harvest && F.harvest < F.planted) e = t('err_harvest');
      var field = clean(F.field, 50), fc = D.camps.filter(function (x) { return x.name.toLowerCase() === field.toLowerCase(); })[0];
      Object.assign(rec, { crop: keyFor('crop_', c), field: field, camp: fc ? fc.id : '', purpose: F.purpose, ha: r2(ha || 0), planted: F.planted || '', harvest: F.harvest || '',
        yield: r2(y || 0), unit: F.unit || 't', notes: clean(F.notes, 500), date: F.planted || F.harvest || today() });
    } else if (k === 'stock') {
      var n = num(F.n);
      if (isNaN(n) || n < 0 || n % 1 || (F.ev !== 'count' && n === 0)) e = t('err_count');
      else if (F.ev === 'moved' && !F.camp) e = t('err_camp');
      Object.assign(rec, { an: F.an, ev: F.ev, n: n, notes: clean(F.notes, 120) });
      if (F.ev === 'moved') rec.camp = F.camp;
    } else if (k === 'health') {
      var hn = F.n ? num(F.n) : 0, wdays = F.wd ? num(F.wd) : 0;
      if (!F.an) e = t('err_animal');
      else if (F.type === 'sick' && !clean(F.who)) e = t('err_who');
      else if (isNaN(hn) || hn < 0 || hn % 1) e = t('err_count');
      else if (isNaN(wdays) || wdays < 0 || wdays > 400) e = t('err_wd');
      else if (F.next && F.next < F.date) e = t('err_next');
      Object.assign(rec, { type: F.type, an: F.an, who: clean(F.who, 60), problem: F.type === 'sick' ? clean(F.problem, 120) : '', product: clean(F.product, 60),
        n: F.type === 'sick' ? 1 : hn, wd: Math.round(wdays || 0), next: F.next || '', notes: clean(F.notes, 300), healed: old ? old.healed || '' : '' });
    } else if (k === 'camp') {
      var cn = clean(F.name, 50), cha = F.ha ? num(F.ha) : 0;
      if (!cn) e = t('err_camp_name');
      else if (D.camps.some(function (x) { return x.id !== rec.id && x.name.toLowerCase() === cn.toLowerCase(); })) e = t('err_camp_dup');
      else if (isNaN(cha) || cha < 0) e = t('err_ha');
      Object.assign(rec, { name: cn, kind: F.ckind || 'camp', ha: r2(cha || 0), notes: clean(F.notes, 500) });
    } else if (k === 'worker') {
      var rate = num(F.rate);
      if (!clean(F.name)) e = t('err_worker_name');
      else if (isNaN(rate) || rate <= 0) e = t('err_rate');
      Object.assign(rec, { name: clean(F.name, 60), rate: r2(rate), phone: clean(F.phone, 20), on: F.id ? !!F.on : true });
    } else if (k === 'workday') {
      var ids = Object.keys(F.people || {}).filter(function (id) { return F.people[id] && workerById(id); });
      if (!ids.length) e = t('err_people');
      var prev = {}; if (old) old.people.forEach(function (p) { prev[p.w] = p; });
      var locked = old && old.people.some(function (p) { return p.paid; });
      var people = ids.map(function (id) {
        var p0 = prev[id], w = workerById(id);
        return { w: id, d: F.people[id], rate: p0 ? p0.rate : w.rate, paid: locked ? !!(p0 && p0.paid) : !!F.paidNow };
      });
      Object.assign(rec, { job: clean(F.job, 80), camp: F.camp || '', people: people, moneyId: old ? old.moneyId || '' : '' });
      if (!e && !locked && F.paidNow) {
        var tot = r2(people.reduce(function (s2, p) { return s2 + p.d * p.rate; }, 0));
        var mid = rec.moneyId || uid();
        var mrec = { id: mid, ts: Date.now(), date: rec.date, dir: 'out', amt: tot, cat: 'wages', br: defaultBranch(), camp: rec.camp, pay: 'cash',
          desc: t('day_wages_desc2', { job: rec.job || t('workday') }), party: people.map(function (p) { return workerName(p.w); }).join(', '), ref: '', vat: 0, wd: rec.id };
        rec.moneyId = mid;
        extra.push(['money', mrec]);
      }
    }
    if (e) { F.err = esc(e); render(); return; }

    // slip photo
    if (k === 'money' || k === 'fuel') {
      var oldPhoto = old ? old.photo || '' : '';
      rec.photo = F.photoRemoved ? '' : oldPhoto;
      if (F.newPhoto) {
        var pid = 'p' + uid();
        rec.photo = pid;
        photoPut(pid, F.newPhoto).catch(function () { toast(t('err_photo_save')); });
        photoUrls[pid] = F.photoSrc;
      }
      if (oldPhoto && oldPhoto !== rec.photo) photoDel(oldPhoto);
      rec.photoLater = !rec.photo && !!F.photoLater;
    }

    upsert(COLL[k], rec);
    extra.forEach(function (x) { upsert(COLL[x[0]], x[1]); });
    if (k === 'money' && F.repeat && !F.id) {
      D.recur.push({ id: uid(), ts: Date.now(), dir: rec.dir, amt: rec.amt, cat: rec.cat, br: rec.br, desc: rec.desc, party: rec.party, camp: rec.camp, pay: rec.pay,
        vatIncl: !!F.vatIncl, day: Math.min(28, parseD(rec.date).getDate()), on: true, last: rec.date.slice(0, 7) });
      rec.rid = D.recur[D.recur.length - 1].id;
    }
    save();
    toast(t('saved'));
    // after selling / buying animals, offer to record the money
    if (k === 'stock' && !F.id && (rec.ev === 'sold' || rec.ev === 'bought')) {
      var dir = rec.ev === 'sold' ? 'in' : 'out';
      V = 'form';
      F = { kind: 'money', date: rec.date, dir: dir, cat: dir === 'in' ? 'sale_stock' : 'stock_buy', br: brForAnimal(rec.an),
            desc: rec.n + ' ' + animalLabel(rec.an).toLowerCase(), vatIncl: true,
            after: esc(t('stock_money_prompt', { what: t('ev_' + rec.ev).toLowerCase() })) };
      render(); window.scrollTo(0, 0);
      return;
    }
    closeSub();
  }
  function upsert(coll, rec) {
    var list = D[coll], i = list.findIndex(function (r) { return r.id === rec.id; });
    if (i > -1) list[i] = rec; else list.push(rec);
  }
  function brForAnimal(an) { return D.settings.types.indexOf(an) > -1 ? an : defaultBranch(); }
  function deleteForm() {
    var coll = COLL[F.kind], x = D[coll].filter(function (r) { return r.id === F.id; })[0];
    if (F.kind === 'worker' && D.workdays.some(function (d) { return d.people.some(function (p) { return p.w === F.id; }); })) {
      F.err = esc(t('err_worker_used')); return render();
    }
    if (confirmKey !== 'del') { confirmKey = 'del'; return render(); }
    D[coll] = D[coll].filter(function (r) { return r.id !== F.id; });
    if (x && x.photo) photoDel(x.photo);
    if (F.kind === 'workday' && x && x.moneyId) D.money = D.money.filter(function (m) { return m.id !== x.moneyId; });
    if (F.kind === 'camp') ['money', 'fuse', 'stock', 'crops', 'workdays', 'recur'].forEach(function (k) { D[k].forEach(function (r) { if (r.camp === F.id) r.camp = ''; }); });
    save(); toast(t('deleted'));
    closeSub();
  }

  /* Repeating entries: add any that are due (runs when the app opens) */
  function runRecurring() {
    var cur = today().slice(0, 7), dnow = new Date().getDate(), added = 0;
    D.recur.forEach(function (r) {
      if (!r.on) return;
      var m = addMonths(r.last || addMonths(cur, -1), 1), guard = 0;
      while (m <= cur && guard++ < 60) {
        if (m === cur && r.day > dnow) break;
        D.money.push({ id: uid(), ts: Date.now() + added, date: m + '-' + pad(r.day), dir: r.dir, amt: r.amt, cat: r.cat, br: r.br, desc: r.desc, party: r.party, pay: r.pay || 'eft',
          camp: r.camp || '', ref: '', vat: D.settings.vat ? vatOf(r.amt, !!r.vatIncl) : 0, rid: r.id });
        r.last = m; added++;
        m = addMonths(m, 1);
      }
    });
    if (added) { save(); toast(t('recur_added', { n: added })); }
    return added;
  }

  /* ================================================================ */
  /* Reports & export                                                  */
  /* ================================================================ */
  function openReports() {
    var p = presets()[2];
    openSub('reports', { preset: 2, from: p[1], to: p[2] });
  }
  function reportsScreen() {
    var s = summary(F.from, F.to), vat = D.settings.vat;
    var h = '<div class="card"><strong>' + esc(t('period')) + '</strong><div class="chips" style="margin-top:10px">' +
      presets().map(function (p, i) { return '<button class="chip' + (F.preset === i ? ' on' : '') + '" data-preset="' + i + '">' + esc(t(p[0])) + '</button>'; }).join('') + '</div>' +
      '<div class="two">' + fld(t('from'), inp('from', { type: 'date' })) + fld(t('to'), inp('to', { type: 'date' })) + '</div>' +
      '<div class="muted" style="margin-top:10px">' + esc(periodText(F.from, F.to)) + '</div></div>';

    h += '<div class="card" id="rsum">' + reportSummaryHtml(s, vat) + '</div>';

    var none = !hasAny(s);
    h += '<div class="card"><strong>' + esc(t('export')) + '</strong><p class="muted" style="margin:6px 0 14px">' + esc(t('export_sub')) + '</p><div class="stack">' +
      '<button class="primary" data-act="xls"' + (none ? ' disabled' : '') + '>' + ico(IC.down) + esc(t('save_excel')) + '</button>' +
      '<button class="primary" data-act="pdf"' + (none ? ' disabled' : '') + '>' + ico(IC.down) + esc(t('save_pdf')) + '</button>' +
      (canShare ? '<div class="two"><button class="secondary" data-act="shareXls"' + (none ? ' disabled' : '') + '>' + ico(IC.share, 18) + esc(t('share_excel')) + '</button>' +
        '<button class="secondary" data-act="sharePdf"' + (none ? ' disabled' : '') + '>' + ico(IC.share, 18) + esc(t('share_pdf')) + '</button></div>' : '') +
      '</div>' + (none ? '<p class="muted" style="margin:12px 0 0">' + esc(t('nothing_in_period')) + '</p>' : '') + '</div>';

    h += '<div class="card"><strong>' + esc(t('backup')) + '</strong><p class="muted" style="margin:6px 0 14px">' + esc(t('backup_sub')) + '</p>' +
      '<div class="two"><button class="secondary" data-act="backup">' + esc(t('backup_now')) + '</button><button class="secondary" data-act="restorePick">' + esc(t('restore_backup')) + '</button></div>' +
      '<div class="muted" style="margin-top:10px">' + esc(D.settings.lastBackup ? t('backup_last', { d: shortDate(D.settings.lastBackup) }) : t('backup_never')) + '</div></div>';
    app.innerHTML = h;
  }
  function hasAny(s) { return !!(D.cashmoves.length + s.money.length + s.fuel.length + s.rainL.length + s.diary.length + s.stock.length + s.crops.length + s.fuse.length + s.health.length + s.workdays.length); }
  function photoMark(x) { return x.photo ? t('yes') : x.photoLater ? t('photo_later_short') : ''; }
  function cashSummary(from, to) {
    var x = { start: 0, rec: 0, spent: 0, banked: 0, drawn: 0, end: 0 }, seen = false;
    cashEvents().forEach(function (e) {
      if (from && e.x.date < from) { x.start = e.bal; return; }
      if (to && e.x.date > to) return;
      if (e.k === 'cashmove') { if (e.x.type === 'bank') x.banked += e.x.amt; else if (e.x.type === 'draw') x.drawn += e.x.amt; }
      else if (e.d > 0) x.rec += e.d; else x.spent -= e.d;
      x.end = e.bal; seen = true;
    });
    if (!seen) x.end = x.start;
    return x;
  }
  function payKeys(o) { return PAYS.concat(['']).filter(function (p) { return o[p]; }); }
  function reportSummaryHtml(s, vat) {
    var h = '<strong>' + esc(t('summary')) + '</strong><div class="stats">' + stat(t('income'), fmtR(s.inT), 'pos') +
      stat(t('expenses_incl_fuel'), fmtR(s.outAll), 'neg') + stat(t('net'), fmtR(s.net), s.net >= 0 ? 'pos' : 'neg') + '</div>';
    var rows = payKeys(s.inPay).map(function (p) { return [t('income') + ' – ' + payLow(p), fmtR(s.inPay[p])]; });
    if (vat) rows.push([t('vat_out'), fmtR(s.vatOut)], [t('vat_in'), fmtR(s.vatIn)], [t('vat_net'), fmtR(s.vatOut - s.vatIn)]);
    rows.push([t('diesel'), fmtL(s.dL) + ' · ' + fmtR(s.dAmt)], [t('diesel_farm'), fmtL(s.dFarm)], [t('diesel_used_logged'), fmtL(s.uD)], [t('petrol'), fmtL(s.pL) + ' · ' + fmtR(s.pAmt)],
      [t('rainfall'), fmtMm(s.rain) + ' · ' + t('rain_days', { n: s.rainDays })], [t('diary_entries'), String(s.diary.length)]);
    h += '<table class="kv">' + rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table>';
    return h;
  }

  function fileBase() {
    var farm = (D.settings.farm || 'Farm').replace(/[\\\/:*?"<>|]+/g, ' ').trim();
    return 'FarmLedger ' + farm + ' ' + (F.from || F.to ? (F.from || 'start') + ' to ' + (F.to || today()) : 'all ' + today());
  }

  function buildExcel() {
    var s = summary(F.from, F.to), vat = D.settings.vat, multiBr = D.settings.types.length > 1;
    var sumRows = [];
    var M = function (v) { return { v: r2(v), f: 'money' }; };
    sumRows.push({ c: [D.settings.farm || 'FarmLedger'], sec: true });
    sumRows.push([t('period'), periodText(F.from, F.to)]);
    if (D.settings.owner) sumRows.push([t('your_name'), D.settings.owner]);
    if (vat && D.settings.vatNo) sumRows.push([t('vat_no'), D.settings.vatNo]);
    sumRows.push([t('generated'), shortDate(today())]);
    sumRows.push([]);
    sumRows.push({ c: [t('income')], sec: true });
    Object.keys(s.cin).sort().forEach(function (c) { sumRows.push([catLabel(c), M(s.cin[c])]); });
    sumRows.push({ c: [t('total_income'), M(s.inT)], b: true });
    payKeys(s.inPay).forEach(function (p) { sumRows.push(['   ' + t('of_which', { p: payLow(p) }), M(s.inPay[p])]); });
    sumRows.push([]);
    sumRows.push({ c: [t('expenses')], sec: true });
    Object.keys(s.cout).sort().forEach(function (c) { sumRows.push([catLabel(c), M(s.cout[c])]); });
    if (s.dAmt) sumRows.push([t('fuel_diesel'), M(s.dAmt)]);
    if (s.pAmt) sumRows.push([t('fuel_petrol'), M(s.pAmt)]);
    sumRows.push({ c: [t('total_expenses'), M(s.outAll)], b: true });
    payKeys(s.outPay).forEach(function (p) { sumRows.push(['   ' + t('of_which', { p: payLow(p) }), M(s.outPay[p])]); });
    sumRows.push([]);
    sumRows.push({ c: [t('net'), M(s.net)], b: true });
    if (multiBr) {
      sumRows.push([]);
      sumRows.push({ c: [t('by_branch')], sec: true });
      Object.keys(s.br).forEach(function (b) { sumRows.push([branchLabel(b) + ' – ' + t('income').toLowerCase(), M(s.br[b]['in'])], [branchLabel(b) + ' – ' + t('expenses').toLowerCase(), M(s.br[b].out)]); });
      if (s.fuelT) sumRows.push([t('fuel_all_branches'), M(s.fuelT)]);
    }
    if (vat) {
      sumRows.push([]);
      sumRows.push({ c: [t('vat')], sec: true });
      sumRows.push([t('vat_out'), M(s.vatOut)], [t('vat_in'), M(s.vatIn)], { c: [t('vat_net'), M(s.vatOut - s.vatIn)], b: true });
    }
    var cs = cashSummary(F.from, F.to);
    sumRows.push([]);
    sumRows.push({ c: [t('cash_tracker')], sec: true });
    sumRows.push([t('cash_start'), M(cs.start)], [t('cash_received'), M(cs.rec)], [t('cash_spent'), M(cs.spent)], [t('cash_banked'), M(cs.banked)], [t('cash_drawn'), M(cs.drawn)],
      { c: [t('cash_end'), M(cs.end)], b: true });
    sumRows.push([]);
    sumRows.push({ c: [t('tab_fuel')], sec: true });
    sumRows.push([t('diesel_litres'), { v: s.dL, f: 'num1' }], [t('diesel_farm'), { v: s.dFarm, f: 'num1' }], [t('petrol_litres'), { v: s.pL, f: 'num1' }],
      [t('diesel_used_logged'), { v: s.uD, f: 'num1' }], [t('petrol_used'), { v: s.uP, f: 'num1' }]);
    if (s.fuse.length) {
      sumRows.push([]);
      sumRows.push({ c: [t('used_per_machine')], sec: true });
      Object.keys(s.byMach).sort(function (a, b) { return s.byMach[b] - s.byMach[a]; }).forEach(function (k) { sumRows.push([k, { v: s.byMach[k], f: 'num1' }]); });
      sumRows.push([]);
      sumRows.push({ c: [t('used_per_job')], sec: true });
      Object.keys(s.byJob).sort(function (a, b) { return s.byJob[b] - s.byJob[a]; }).forEach(function (k) { sumRows.push([k, { v: s.byJob[k], f: 'num1' }]); });
    }
    sumRows.push([]);
    sumRows.push({ c: [t('rainfall_mm')], sec: true });
    Object.keys(s.rainM).sort().forEach(function (ym) { sumRows.push([ymLabel(ym), { v: s.rainM[ym], f: 'num1' }]); });
    sumRows.push({ c: [t('total'), { v: s.rain, f: 'num1' }], b: true });
    if (hasAnimals() || D.stock.length) {
      var hc = herd();
      sumRows.push([]);
      sumRows.push({ c: [t('herd_today')], sec: true });
      animalTypes().forEach(function (a) { sumRows.push([animalLabel(a), { v: hc[a] || 0, f: 'int' }]); });
    }

    var sheets = [{ name: t('summary'), plain: true, cols: [{ w: 44, f: 'text' }, { w: 24, f: 'money' }], rows: sumRows }];

    var mCols = [{ h: t('date'), w: 12, f: 'date' }, { h: t('type'), w: 10 }, { h: t('category'), w: 26 }];
    if (multiBr) mCols.push({ h: t('branch'), w: 16 });
    mCols.push({ h: t('description'), w: 34 }, { h: t('party_col'), w: 24 }, { h: t('reference'), w: 14 },
      { h: t('income_r'), w: 15, f: 'money' }, { h: t('expense_r'), w: 15, f: 'money' });
    if (vat) mCols.push({ h: t('vat_r'), w: 13, f: 'money' }, { h: t('excl_vat_r'), w: 15, f: 'money' });
    mCols.push({ h: t('camp_land'), w: 16 }, { h: t('slip_photo'), w: 12 }, { h: t('paid_by'), w: 10 });
    var mRows = s.money.map(function (m) {
      var r = [m.date, m.dir === 'in' ? t('income') : t('expense'), catLabel(m.cat)];
      if (multiBr) r.push(branchLabel(m.br));
      r.push(m.desc, m.party, m.ref, m.dir === 'in' ? m.amt : null, m.dir === 'out' ? m.amt : null);
      if (vat) r.push(m.vat || 0, r2(m.amt - (m.vat || 0)));
      r.push(campName(m.camp), photoMark(m), payLabel(m.pay));
      return r;
    });
    var off = multiBr ? 1 : 0;
    sheets.push({ name: t('sheet_money'), cols: mCols, rows: mRows, sumCols: vat ? [6 + off, 7 + off, 8 + off, 9 + off] : [6 + off, 7 + off], totalLabel: t('total') });

    var fCols = [{ h: t('date'), w: 12, f: 'date' }, { h: t('fuel'), w: 10 }, { h: t('litres'), w: 11, f: 'num2' }, { h: t('amount_r'), w: 15, f: 'money' },
      { h: t('r_per_litre'), w: 12, f: 'money' }, { h: t('used_for'), w: 26 }, { h: t('machine'), w: 22 }, { h: t('supplier'), w: 20 }, { h: t('reference'), w: 14 }];
    if (vat) fCols.push({ h: t('vat_r'), w: 13, f: 'money' });
    fCols.push({ h: t('slip_photo'), w: 12 }, { h: t('paid_by'), w: 10 });
    var fRows = s.fuel.map(function (f) {
      var r = [f.date, t(f.kind), f.l, f.amt, f.l ? r2(f.amt / f.l) : null, t('use_' + f.use), f.mach, f.sup, f.ref];
      if (vat) r.push(f.vat || 0);
      r.push(photoMark(f), payLabel(f.pay));
      return r;
    });
    sheets.push({ name: t('tab_fuel'), cols: fCols, rows: fRows, sumCols: vat ? [2, 3, 9] : [2, 3], totalLabel: t('total') });

    var bi = bankItems(F.from, F.to);
    sheets.push({ name: t('bank_check'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('description'), w: 36 }, { h: t('paid_by'), w: 12 }, { h: t('party_col'), w: 24 },
      { h: t('reference'), w: 14 }, { h: t('bank_in_r'), w: 15, f: 'money' }, { h: t('bank_out_r'), w: 15, f: 'money' }, { h: t('bank_ticked_col'), w: 12 }],
      rows: bi.map(function (b) {
        return [b.x.date, evTitle(b), b.k === 'cashmove' ? t('pay_cash') : payLabel(b.x.pay), b.x.party || b.x.sup || '', b.x.ref || '',
          b.amt >= 0 ? b.amt : null, b.amt < 0 ? -b.amt : null, b.x.bankOk ? t('yes') : ''];
      }), sumCols: [5, 6], totalLabel: t('total') });
    var ce = cashEvents().filter(function (e) { return inRange(e.x.date, F.from, F.to); });
    sheets.push({ name: t('cash_tracker'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('description'), w: 38 }, { h: t('type'), w: 16 },
      { h: t('cash_in_r'), w: 15, f: 'money' }, { h: t('cash_out_r'), w: 15, f: 'money' }, { h: t('cash_balance_r'), w: 16, f: 'money' }],
      rows: [[F.from || '', t('cash_start'), '', null, null, cs.start]].concat(ce.map(function (e) {
        var ty = e.k === 'cashmove' ? t('ct_' + e.x.type) : e.k === 'fuel' ? t('fuel') : (e.x.dir === 'in' ? t('income') : t('expense'));
        return [e.x.date, evTitle(e), ty, !e.set && e.d > 0 ? e.d : null, !e.set && e.d < 0 ? -e.d : null, e.bal];
      })), sumCols: [3, 4], totalLabel: t('total') });

    sheets.push({ name: t('sheet_fuse'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('fuel'), w: 10 }, { h: t('litres'), w: 11, f: 'num2' },
      { h: t('poured_into'), w: 24 }, { h: t('main_job'), w: 24 }, { h: t('camp_land'), w: 16 }, { h: t('hour_meter'), w: 14 }, { h: t('notes'), w: 30 }],
      rows: s.fuse.map(function (u) { return [u.date, t(u.kind), u.l, u.mach, jobLabel(u.job), campName(u.camp), u.hrs, u.notes]; }), sumCols: [2], totalLabel: t('total') });

    sheets.push({ name: t('tab_rain'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('rain_mm_col'), w: 10, f: 'num1' }, { h: t('gauge'), w: 24 }],
      rows: s.rainL.map(function (r) { return [r.date, r.mm, r.g]; }), sumCols: [1], totalLabel: t('total') });

    sheets.push({ name: t('tab_diary'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('tags'), w: 20, f: 'wrap' }, { h: t('entry'), w: 90, f: 'wrap' }],
      rows: s.diary.map(function (d) { return [d.date, (d.tags || []).map(function (g) { return t('tag_' + g); }).join(', '), d.text]; }) });

    if (hasCrops() || D.crops.length) {
      sheets.push({ name: t('crops'), cols: [{ h: t('crop'), w: 18 }, { h: t('field'), w: 18 }, { h: t('purpose'), w: 22 }, { h: t('hectares'), w: 10, f: 'num2' },
        { h: t('planted'), w: 12, f: 'date' }, { h: t('harvested_date'), w: 12, f: 'date' }, { h: t('yield'), w: 10, f: 'num2' }, { h: t('unit'), w: 8 }, { h: t('notes'), w: 40, f: 'wrap' }],
        rows: s.crops.map(function (c) { return [cropLabel(c.crop), c.field, t('purpose_' + c.purpose), c.ha || null, c.planted, c.harvest, c.yield || null, t('unit_' + (c.unit || 't')), c.notes]; }) });
    }
    if (hasAnimals() || D.stock.length) {
      sheets.push({ name: t('livestock'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('animal'), w: 16 }, { h: t('event'), w: 26 }, { h: t('number'), w: 10, f: 'int' }, { h: t('camp_land'), w: 16 }, { h: t('notes'), w: 40 }],
        rows: s.stock.map(function (x) { return [x.date, animalLabel(x.an), t('ev_' + x.ev), x.n, campName(x.camp), x.notes]; }) });
    }
    if (hasAnimals() || D.health.length) {
      sheets.push({ name: t('animal_health'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('what_kind'), w: 16 }, { h: t('animal'), w: 14 }, { h: t('animal_who_col'), w: 22 },
        { h: t('number'), w: 9, f: 'int' }, { h: t('problem'), w: 26, f: 'wrap' }, { h: t('product'), w: 22 }, { h: t('withdrawal_until'), w: 14, f: 'date' },
        { h: t('next_due'), w: 13, f: 'date' }, { h: t('healthy_again'), w: 14, f: 'date' }, { h: t('notes'), w: 30, f: 'wrap' }],
        rows: s.health.map(function (x) {
          return [x.date, t('ht_' + x.type), animalLabel(x.an), x.who, x.n || null, x.problem, x.product, x.wd ? addDays(x.date, x.wd) : '', x.next, x.healed, x.notes];
        }) });
    }
    if (D.workers.length || s.workdays.length) {
      var wRows = [];
      s.workdays.forEach(function (d) { d.people.forEach(function (p) { wRows.push([d.date, workerName(p.w), p.d, p.rate, r2(p.d * p.rate), p.paid ? t('yes') : t('no'), d.job, campName(d.camp)]); }); });
      sheets.push({ name: t('sheet_daywork'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('worker_name'), w: 22 }, { h: t('days_col'), w: 8, f: 'num1' }, { h: t('day_rate'), w: 14, f: 'money' },
        { h: t('amount_r'), w: 14, f: 'money' }, { h: t('paid'), w: 8 }, { h: t('job_done'), w: 30 }, { h: t('camp_land'), w: 16 }], rows: wRows, sumCols: [2, 4], totalLabel: t('total') });
    }
    if (D.camps.length) {
      sheets.push({ name: t('camps'), cols: [{ h: t('camp_name'), w: 22 }, { h: t('camp_kind'), w: 14 }, { h: t('hectares'), w: 10, f: 'num2' }, { h: t('income_r'), w: 15, f: 'money' },
        { h: t('costs_r'), w: 15, f: 'money' }, { h: t('cost_per_ha'), w: 14, f: 'money' }, { h: t('diesel_used'), w: 12, f: 'num1' }, { h: t('rain_mm_col'), w: 11, f: 'num1' }, { h: t('notes'), w: 30, f: 'wrap' }],
        rows: D.camps.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (c) {
          var x = campStats(c, F.from, F.to);
          return [c.name, t('ck_' + c.kind), c.ha || null, x.inT, x.outT, c.ha ? r2(x.outT / c.ha) : null, x.fuseL, x.rainN ? x.rain : null, c.notes];
        }) });
    }
    return FX.xlsx(sheets);
  }

  function buildPdf() {
    var s = summary(F.from, F.to), vat = D.settings.vat, multiBr = D.settings.types.length > 1;
    var doc = new FX.PDF({ footer: 'FarmLedger · ' + (D.settings.farm || '') + ' · ' + periodText(F.from, F.to), pageLabel: t('page') });
    var subs = [t('period') + ': ' + periodText(F.from, F.to)];
    if (D.settings.owner) subs.push(D.settings.owner + (vat && D.settings.vatNo ? ' · ' + t('vat_no') + ' ' + D.settings.vatNo : ''));
    subs.push(t('generated') + ': ' + shortDate(today()));
    doc.title((D.settings.farm || 'FarmLedger') + ' – ' + t('farm_report'), subs);

    doc.heading(t('summary'));
    var kv = [[t('total_income'), fmtR(s.inT)]];
    payKeys(s.inPay).forEach(function (p) { kv.push(['   ' + t('of_which', { p: payLow(p) }), fmtR(s.inPay[p])]); });
    kv.push([t('total_expenses'), fmtR(s.outAll)]);
    payKeys(s.outPay).forEach(function (p) { kv.push(['   ' + t('of_which', { p: payLow(p) }), fmtR(s.outPay[p])]); });
    kv.push([t('net'), fmtR(s.net), true]);
    doc.kv(kv);

    var cin = Object.keys(s.cin).sort(function (a, b) { return s.cin[b] - s.cin[a]; });
    doc.heading(t('income_by_cat'));
    doc.table([{ h: t('category') }, { h: t('amount_r'), w: 110, a: 'r' }], cin.map(function (c) { return [catLabel(c), fmtR(s.cin[c])]; }),
      { total: [t('total'), fmtR(s.inT)], empty: t('none') });
    var cout = Object.keys(s.cout).sort(function (a, b) { return s.cout[b] - s.cout[a]; }).map(function (c) { return [catLabel(c), s.cout[c]]; });
    if (s.dAmt) cout.push([t('fuel_diesel'), s.dAmt]);
    if (s.pAmt) cout.push([t('fuel_petrol'), s.pAmt]);
    doc.heading(t('expenses_by_cat'));
    doc.table([{ h: t('category') }, { h: t('amount_r'), w: 110, a: 'r' }], cout.map(function (c) { return [c[0], fmtR(c[1])]; }),
      { total: [t('total'), fmtR(s.outAll)], empty: t('none') });

    if (multiBr && Object.keys(s.br).length) {
      doc.heading(t('by_branch'));
      var brs = Object.keys(s.br);
      doc.table([{ h: t('branch') }, { h: t('income_r'), w: 100, a: 'r' }, { h: t('expense_r'), w: 100, a: 'r' }, { h: t('net'), w: 100, a: 'r' }],
        brs.map(function (b) { return [branchLabel(b), fmtR(s.br[b]['in']), fmtR(s.br[b].out), fmtR(s.br[b]['in'] - s.br[b].out)]; }));
      if (s.fuelT) doc.note(t('fuel_not_in_branch', { r: fmtR(s.fuelT) }));
    }
    if (vat) {
      doc.heading(t('vat'));
      doc.kv([[t('vat_out'), fmtR(s.vatOut)], [t('vat_in'), fmtR(s.vatIn)], [t('vat_net'), fmtR(s.vatOut - s.vatIn), true]]);
      doc.note(t('vat_note'));
    }
    var pcs = cashSummary(F.from, F.to);
    if (pcs.rec || pcs.spent || pcs.banked || pcs.drawn || pcs.start) {
      doc.heading(t('cash_tracker'));
      doc.kv([[t('cash_start'), fmtR(pcs.start)], [t('cash_received'), fmtR(pcs.rec)], [t('cash_spent'), fmtR(pcs.spent)],
        [t('cash_banked'), fmtR(pcs.banked)], [t('cash_drawn'), fmtR(pcs.drawn)], [t('cash_end'), fmtR(pcs.end), true]]);
    }
    doc.heading(t('tab_fuel'));
    doc.kv([[t('diesel'), fmtL(s.dL) + '  ·  ' + fmtR(s.dAmt)], [t('diesel_farm'), fmtL(s.dFarm)], [t('petrol'), fmtL(s.pL) + '  ·  ' + fmtR(s.pAmt)]]);

    doc.heading(t('rainfall'));
    var rm = Object.keys(s.rainM).sort();
    if (rm.length) doc.bars(rm.map(function (ym) { return [ymLabel(ym), s.rainM[ym], fmtMm(s.rainM[ym])]; }), { labelW: 90 });
    doc.kv([[t('total'), fmtMm(s.rain), true], [t('rain_days_label'), String(s.rainDays)]]);

    if (hasAnimals() || D.stock.length) {
      var hc = herd();
      doc.heading(t('livestock'));
      var mv = {};
      s.stock.forEach(function (x) { var k = x.an; mv[k] = mv[k] || {}; mv[k][x.ev] = (mv[k][x.ev] || 0) + x.n; });
      var evs = ['born', 'bought', 'sold', 'died', 'slaughter', 'lost'];
      doc.table([{ h: t('animal') }].concat(evs.map(function (e) { return { h: t('ev_' + e + '_short'), w: 52, a: 'r' }; })).concat([{ h: t('herd_today'), w: 62, a: 'r' }]),
        animalTypes().map(function (a) { return [animalLabel(a)].concat(evs.map(function (e) { return mv[a] && mv[a][e] ? fmtNum(mv[a][e], 0) : '–'; })).concat([fmtNum(hc[a] || 0, 0)]); }),
        { size: 8 });
    }
    if (s.crops.length) {
      doc.heading(t('crops'));
      doc.table([{ h: t('crop') }, { h: t('field'), w: 80 }, { h: t('purpose'), w: 90 }, { h: 'ha', w: 40, a: 'r' }, { h: t('planted'), w: 62 }, { h: t('harvested_date'), w: 62 }, { h: t('yield'), w: 60, a: 'r' }],
        s.crops.map(function (c) {
          return [cropLabel(c.crop), c.field, t('purpose_' + c.purpose), c.ha ? fmtNum(c.ha, c.ha % 1 ? 1 : 0) : '', c.planted ? shortDate(c.planted) : '', c.harvest ? shortDate(c.harvest) : '',
            c.yield ? fmtNum(c.yield, c.yield % 1 ? 1 : 0) + ' ' + t('unit_' + (c.unit || 't')) : ''];
        }), { size: 8 });
    }
    if (s.money.length) {
      doc.heading(t('sheet_money'));
      doc.table([{ h: t('date'), w: 58 }, { h: t('description'), wrap: true }, { h: t('category'), w: 100 }, { h: t('paid_by'), w: 40 }, { h: t('income_r'), w: 70, a: 'r' }, { h: t('expense_r'), w: 70, a: 'r' }],
        s.money.map(function (m) {
          return [shortDate(m.date), (m.desc || catLabel(m.cat)) + (m.party ? ' – ' + m.party : '') + (multiBr ? ' [' + branchLabel(m.br) + ']' : ''), catLabel(m.cat),
            m.pay ? t('pay_' + m.pay) : '', m.dir === 'in' ? fmtR(m.amt) : '', m.dir === 'out' ? fmtR(m.amt) : ''];
        }), { size: 8, total: [t('total'), '', '', '', fmtR(s.inT), fmtR(s.outT)] });
    }
    if (s.fuel.length) {
      doc.heading(t('fuel_purchases'));
      doc.table([{ h: t('date'), w: 58 }, { h: t('fuel'), w: 58 }, { h: t('litres'), w: 50, a: 'r' }, { h: t('amount_r'), w: 72, a: 'r' }, { h: t('used_for'), w: 110 }, { h: t('machine') }],
        s.fuel.map(function (f) { return [shortDate(f.date), t(f.kind), fmtNum(f.l, f.l % 1 ? 1 : 0), fmtR(f.amt), t('use_' + f.use), f.mach]; }),
        { size: 8, total: [t('total'), '', fmtNum(s.dL + s.pL, (s.dL + s.pL) % 1 ? 1 : 0), fmtR(s.fuelT), '', ''] });
    }
    if (s.fuse.length) {
      doc.heading(t('fuse_log'));
      doc.note(t('fuse_log_note'));
      doc.table([{ h: t('date'), w: 58 }, { h: t('fuel'), w: 48 }, { h: t('litres'), w: 46, a: 'r' }, { h: t('poured_into'), w: 110 }, { h: t('main_job') }, { h: t('camp_land'), w: 64 }, { h: t('hour_meter'), w: 66, a: 'r' }],
        s.fuse.map(function (u) { return [shortDate(u.date), t(u.kind), fmtNum(u.l, u.l % 1 ? 1 : 0), u.mach, jobLabel(u.job), campName(u.camp), u.hrs]; }),
        { size: 8, total: [t('total'), '', fmtNum(s.uD + s.uP, (s.uD + s.uP) % 1 ? 1 : 0), '', '', '', ''] });
      var bm = Object.keys(s.byMach).sort(function (a, b) { return s.byMach[b] - s.byMach[a]; });
      doc.table([{ h: t('used_per_machine') }, { h: t('litres'), w: 90, a: 'r' }], bm.map(function (k) { return [k, fmtL(s.byMach[k])]; }), { size: 8.5 });
    }
    if (s.health.length) {
      doc.heading(t('animal_health'));
      doc.table([{ h: t('date'), w: 58 }, { h: t('what_kind'), w: 70 }, { h: t('animal'), w: 62 }, { h: t('details'), wrap: true }, { h: t('withdrawal_until'), w: 78 }, { h: t('healthy_again'), w: 66 }],
        s.health.map(function (x) {
          return [shortDate(x.date), t('ht_' + x.type), animalLabel(x.an) + (x.n > 1 ? ' (' + x.n + ')' : ''),
            [x.who, x.problem, x.product, x.next ? t('next_on', { d: shortDate(x.next) }) : '', x.notes].filter(Boolean).join(' · '),
            x.wd ? shortDate(addDays(x.date, x.wd)) : '', x.healed ? shortDate(x.healed) : (x.type === 'sick' ? t('sick') : '')];
        }), { size: 8 });
    }
    if (s.workdays.length) {
      doc.heading(t('sheet_daywork'));
      var ws = Object.keys(s.dayPay);
      doc.table([{ h: t('worker_name') }, { h: t('days_col'), w: 60, a: 'r' }, { h: t('amount_r'), w: 90, a: 'r' }, { h: t('paid'), w: 90, a: 'r' }, { h: t('owed'), w: 90, a: 'r' }],
        ws.map(function (w) { var x = s.dayPay[w]; return [workerName(w), fmtNum(x.days, x.days % 1 ? 1 : 0), fmtR(x.amt), fmtR(x.paid), fmtR(x.amt - x.paid)]; }),
        { size: 8.5 });
    }
    if (D.camps.length) {
      doc.heading(t('camps'));
      doc.table([{ h: t('camp_name') }, { h: 'ha', w: 44, a: 'r' }, { h: t('income_r'), w: 74, a: 'r' }, { h: t('costs_r'), w: 74, a: 'r' }, { h: t('cost_per_ha'), w: 70, a: 'r' }, { h: t('diesel_used'), w: 60, a: 'r' }, { h: t('rain_mm_col'), w: 54, a: 'r' }],
        D.camps.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (c) {
          var x = campStats(c, F.from, F.to);
          return [c.name, c.ha ? fmtNum(c.ha, c.ha % 1 ? 1 : 0) : '', fmtR(x.inT), fmtR(x.outT), c.ha ? fmtR(x.outT / c.ha) : '', fmtL(x.fuseL), x.rainN ? fmtNum(x.rain, x.rain % 1 ? 1 : 0) : ''];
        }), { size: 8 });
    }
    if (s.diary.length) {
      doc.heading(t('tab_diary'));
      doc.table([{ h: t('date'), w: 62 }, { h: t('entry'), wrap: true }],
        s.diary.map(function (d) { return [shortDate(d.date), d.text + ((d.tags || []).length ? '  [' + d.tags.map(function (g) { return t('tag_' + g); }).join(', ') + ']' : '')]; }),
        { size: 8.5 });
    }
    return doc.blob();
  }

  function deliver(blob, name, share) {
    if (share && canShare) {
      var file = new File([blob], name, { type: blob.type });
      navigator.share({ files: [file], title: name }).catch(function (e) { if (e && e.name !== 'AbortError') toast(t('share_failed')); });
      return;
    }
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    toast(t('file_saved'));
  }
  function exportFile(type, share) {
    try {
      var blob = type === 'pdf' ? buildPdf() : buildExcel();
      deliver(blob, fileBase() + (type === 'pdf' ? '.pdf' : '.xlsx'), share);
    } catch (e) {
      console.error(e);
      toast(t('export_failed') + ' ' + e.message);
    }
  }
  var canShare = (function () {
    try {
      var probe = new File([new Blob(['x'])], 'x.pdf', { type: 'application/pdf' });
      return !!(navigator.canShare && navigator.canShare({ files: [probe] }));
    } catch (e) { return false; }
  })();

  /* Backup / restore --------------------------------------------------- */
  function blobToDataUrl(b) {
    return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { res(null); }; r.readAsDataURL(b); });
  }
  function dataUrlToBlob(u) {
    var m = /^data:([^;,]+);base64,(.*)$/.exec(u || '');
    if (!m) return null;
    var bin = atob(m[2]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m[1] });
  }
  function backup() {
    D.settings.lastBackup = today();
    save();
    var name = 'FarmLedger backup ' + (D.settings.farm || '').replace(/[\\\/:*?"<>|]+/g, ' ').trim() + ' ' + today() + '.json';
    var used = {};
    D.money.concat(D.fuel).forEach(function (x) { if (x.photo) used[x.photo] = 1; });
    var getPhotos = useLS || !Object.keys(used).length ? Promise.resolve({}) : photoAll();
    getPhotos.then(function (all) {
      var ids = Object.keys(all).filter(function (k) { return used[k]; });
      return Promise.all(ids.map(function (k) { return blobToDataUrl(all[k]); })).then(function (urls) {
        var photos = {}; ids.forEach(function (k, i) { if (urls[i]) photos[k] = urls[i]; });
        return photos;
      });
    }).catch(function () { return {}; }).then(function (photos) {
      var out = Object.assign({}, D, { photos: photos });
      deliver(new Blob([JSON.stringify(out)], { type: 'application/json' }), name);
      if (V === 'home' || V === 'reports' || V === 'settings') render();
    });
  }
  function restorePick() {
    var input = document.getElementById('restoreFile');
    input.value = ''; input.click();
  }
  var pendingRestore = null, pendingPhotos = {};
  function restoreFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var d;
      try { d = JSON.parse(reader.result); } catch (e) { d = null; }
      if (!d || d.app !== 'FarmLedger' || !d.settings) { toast(t('restore_bad')); return; }
      var photos = d.photos || {};
      delete d.photos;
      pendingRestore = normalise(d);
      pendingPhotos = photos;
      var n = LISTS.reduce(function (s2, k) { return s2 + pendingRestore[k].length; }, 0);
      if (!D.settings.setup || totalEntries() === 0) return applyRestore();
      openSub('settings', { restoreN: n, restoreFarm: pendingRestore.settings.farm });
      var el = document.getElementById('restoreBox');
      if (el) el.scrollIntoView({ block: 'center' });
    };
    reader.readAsText(file);
  }
  function applyRestore() {
    if (!pendingRestore) return;
    D = pendingRestore; pendingRestore = null;
    D.settings.setup = true;
    var photos = pendingPhotos; pendingPhotos = {};
    photoUrls = {};
    var ph = useLS ? Promise.resolve() : photoClear().then(function () {
      return Promise.all(Object.keys(photos).map(function (k) { var b = dataUrlToBlob(photos[k]); return b ? photoPut(k, b) : null; }));
    }).catch(function () {});
    Promise.all([save(), ph]).then(function () { toast(t('restored')); });
    if (history.state && history.state.sub) history.back();
    showTab('home');
  }

  /* Calendar reminder -------------------------------------------------- */
  function appUrl() { return location.href.split('#')[0].split('?')[0]; }
  function reminderIcs() {
    var blob = FX.ics({ time: D.settings.remindTime || '18:00', title: t('ics_title'), desc: t('ics_desc'), url: appUrl() });
    deliver(blob, 'FarmLedger diary reminder.ics');
  }
  function reminderGoogle() {
    var hm = (D.settings.remindTime || '18:00').split(':'), d = new Date();
    d.setHours(+hm[0], +hm[1] || 0, 0, 0);
    var e = new Date(d.getTime() + 10 * 60000);
    var f = function (x) { return x.getFullYear() + pad(x.getMonth() + 1) + pad(x.getDate()) + 'T' + pad(x.getHours()) + pad(x.getMinutes()) + '00'; };
    var url = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(t('ics_title')) +
      '&details=' + encodeURIComponent(t('ics_desc') + '\n' + appUrl()) + '&dates=' + f(d) + '/' + f(e) +
      '&ctz=Africa/Johannesburg&recur=' + encodeURIComponent('RRULE:FREQ=DAILY');
    window.open(url, '_blank', 'noopener');
  }

  /* ================================================================ */
  /* Settings                                                          */
  /* ================================================================ */
  function settingsScreen() {
    var s = D.settings;
    if (!F.loaded) Object.assign(F, { loaded: 1, lang: s.lang, farm: s.farm, owner: s.owner, types: s.types.slice(), vat: s.vat, vatNo: s.vatNo, vatRate: numIn(s.vatRate),
      yearEnd: String(s.yearEnd), rainStart: String(s.rainStart), remind: s.remind, remindTime: s.remindTime });
    var months = []; for (var m = 1; m <= 12; m++) months.push([String(m), monthName(m)]);
    var h = '';
    if (F.restoreN != null) {
      h += '<div class="card warnc" id="restoreBox"><div class="grow"><strong>' + esc(t('restore_confirm_title')) + '</strong><div class="muted">' +
        esc(t('restore_confirm', { n: F.restoreN, farm: F.restoreFarm || '–' })) + '</div>' +
        '<div class="two" style="margin-top:12px"><button class="primary" data-act="applyRestore">' + esc(t('restore_yes')) + '</button><button class="secondary" data-act="cancelRestore">' + esc(t('cancel')) + '</button></div></div></div>';
    }
    h += '<div class="card"><strong>' + esc(t('farm')) + '</strong>' +
      fld(t('language'), seg('lang', [['en', 'English'], ['af', 'Afrikaans']])) +
      fld(t('farm_name'), inp('farm', { max: 60 })) + fld(t('your_name'), inp('owner', { max: 60 })) +
      fld(t('farm_types'), multi('types', TYPES.map(function (x) { return x.k; }), typeLabel), esc(t('farm_types_hint'))) + '</div>';
    h += '<div class="card"><strong>' + esc(t('tax_vat')) + '</strong>' +
      '<div style="margin-top:12px">' + check('vat', t('vat_registered')) + '</div>' +
      (F.vat ? '<div class="two">' + fld(t('vat_no'), inp('vatNo', { max: 20, mode: 'numeric' })) + fld(t('vat_rate'), inp('vatRate', { mode: 'decimal', max: 5 })) + '</div>' : '') +
      fld(t('year_end'), sel('yearEnd', months), esc(t('year_end_hint'))) +
      fld(t('rain_start'), sel('rainStart', months), esc(t('rain_start_hint'))) + '</div>';
    h += '<div class="card"><strong>' + esc(t('diary_reminder')) + '</strong>' +
      '<div style="margin-top:12px">' + check('remind', t('remind_in_app')) + '</div>' +
      fld(t('remind_time'), inp('remindTime', { type: 'time' })) +
      '<p class="muted" style="margin:12px 0">' + esc(t('remind_calendar_sub')) + '</p>' +
      '<div class="two"><button class="secondary" data-act="icsGoogle">' + esc(t('remind_google')) + '</button><button class="secondary" data-act="icsFile">' + esc(t('remind_ics')) + '</button></div></div>';
    h += msg('err', F.err);
    h += '<div class="stack"><button class="primary" data-act="saveSettings">' + esc(t('save')) + '</button></div>';

    var cats = (s.cats['in'] || []).map(function (n) { return ['in', n]; }).concat((s.cats.out || []).map(function (n) { return ['out', n]; }));
    if (cats.length) {
      h += '<div class="card" style="margin-top:14px"><strong>' + esc(t('my_categories')) + '</strong><div class="list">' + cats.map(function (c) {
        return '<div class="item static"><div class="row"><span>' + esc(c[1]) + ' <span class="muted">· ' + esc(c[0] === 'in' ? t('income') : t('expense')) + '</span></span>' +
          '<button class="text small danger" data-act="delCat" data-dir="' + c[0] + '" data-v="' + esc(c[1]) + '">' + esc(confirmKey === 'cat:' + c[0] + c[1] ? t('delete_again') : t('remove')) + '</button></div></div>';
      }).join('') + '</div><div class="hint">' + esc(t('cat_remove_hint')) + '</div></div>';
    }
    h += '<div class="card" style="margin-top:14px"><strong>' + esc(t('backup')) + '</strong><p class="muted" style="margin:6px 0 14px">' + esc(t('backup_sub')) + '</p>' +
      '<div class="two"><button class="secondary" data-act="backup">' + esc(t('backup_now')) + '</button><button class="secondary" data-act="restorePick">' + esc(t('restore_backup')) + '</button></div>' +
      '<div class="muted" style="margin-top:10px">' + esc(s.lastBackup ? t('backup_last', { d: shortDate(s.lastBackup) }) : t('backup_never')) + '</div></div>';
    h += '<div class="card"><strong>' + esc(t('danger')) + '</strong><p class="muted" style="margin:6px 0 8px">' + esc(t('wipe_sub')) + '</p>' +
      confirmBtn('wipe', 'wipe', t('wipe'), t('wipe_again')) + '</div>';
    h += '<p class="muted center foot">FarmLedger ' + VERSION + ' · ' + esc(t('stored_here')) + '</p>';
    app.innerHTML = h;
  }
  function saveSettings() {
    if (!F.types.length) { F.err = esc(t('err_types')); return render(); }
    var rate = num(F.vatRate);
    if (F.vat && (isNaN(rate) || rate <= 0 || rate > 50)) { F.err = esc(t('err_vat_rate')); return render(); }
    var s = D.settings;
    Object.assign(s, { lang: F.lang, farm: clean(F.farm, 60), owner: clean(F.owner, 60), types: F.types.slice(), vat: !!F.vat, vatNo: clean(F.vatNo, 20),
      vatRate: F.vat ? rate : s.vatRate, yearEnd: +F.yearEnd, rainStart: +F.rainStart, remind: !!F.remind, remindTime: F.remindTime || '18:00' });
    save(); toast(t('saved')); closeSub();
  }

  /* ================================================================ */
  /* Events                                                            */
  /* ================================================================ */
  function liveUpdate(k) {
    if (V === 'form' && F) {
      var amtN = num(F.amt), el;
      if ((k === 'amt') && (el = document.getElementById('live-vat'))) el.innerHTML = vatLine(amtN);
      if ((k === 'amt' || k === 'l') && (el = document.getElementById('live-ppl'))) el.innerHTML = pplLine(num(F.l), amtN);
    }
    if (V === 'reports' && (k === 'from' || k === 'to')) {
      F.preset = -1;
      document.querySelectorAll('[data-preset]').forEach(function (b) { b.classList.remove('on'); });
      var s = summary(F.from, F.to);
      document.getElementById('rsum').innerHTML = reportSummaryHtml(s, D.settings.vat);
      var none = !hasAny(s);
      document.querySelectorAll('[data-act=xls],[data-act=pdf],[data-act=shareXls],[data-act=sharePdf]').forEach(function (b) { b.disabled = none; });
    }
  }
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.id === 'dsearch') {
      LS.diary.q = el.value;
      var pos = el.selectionStart;
      diaryList();
      var n = document.getElementById('dsearch'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {}
      return;
    }
    var k = el.getAttribute && el.getAttribute('data-k');
    if (!k || !F || el.type === 'checkbox' || el.tagName === 'SELECT') return;
    F[k] = el.value;
    liveUpdate(k);
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.id === 'restoreFile') { restoreFile(el.files && el.files[0]); return; }
    if ((el.id === 'camIn' || el.id === 'galIn') && F) {
      var file = el.files && el.files[0];
      if (!file) return;
      shrinkPhoto(file).then(function (b) {
        F.newPhoto = b; F.photoSrc = URL.createObjectURL(b); F.photoRemoved = false; F.photoLater = false;
        render(); toast(t('photo_added'));
      }).catch(function () { toast(t('err_photo')); });
      return;
    }
    var k = el.getAttribute && el.getAttribute('data-k');
    if (!k || !F) return;
    if (el.type === 'checkbox') F[k] = el.checked;
    else F[k] = el.value;
    if (k === 'cat' && F.kind === 'money' && F.cat !== '__new' && !F.id) F.vatIncl = !NO_VAT_DEFAULT[F.cat];
    if (el.getAttribute('data-rr')) render();
    else liveUpdate(k);
  });
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-chip]');
    if (chip && F) {
      var k = chip.getAttribute('data-chip');
      F[k] = chip.getAttribute('data-v');
      if (k === 'dir' && F.kind === 'money') { var cs = catsFor(F.dir); if (cs.indexOf(F.cat) < 0) F.cat = cs[0]; F.vatIncl = !NO_VAT_DEFAULT[F.cat]; }
      if (k === 'an' && F.kind === 'stock' && !F.id) F.ev = D.stock.some(function (x) { return x.an === F.an; }) ? (F.ev === 'count' ? 'born' : F.ev) : 'count';
      if (k === 'lang') { D.settings.lang = F.lang; if (D.settings.setup) save(); }
      return render();
    }
    var mul = e.target.closest('[data-multi]');
    if (mul && F) {
      var mk = mul.getAttribute('data-multi'), v = mul.getAttribute('data-v'), arr = F[mk] || (F[mk] = []), i = arr.indexOf(v);
      if (i > -1) arr.splice(i, 1); else arr.push(v);
      return render();
    }
    var pre = e.target.closest('[data-preset]');
    if (pre && F) {
      var p = presets()[+pre.getAttribute('data-preset')];
      F.preset = +pre.getAttribute('data-preset'); F.from = p[1]; F.to = p[2];
      return render();
    }
    var btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    if (btn.tagName === 'A') e.preventDefault();
    var act = btn.getAttribute('data-act');
    var keepConfirm = act === 'deleteForm' || act === 'wipe' || act === 'delCat' || act === 'payWorker';
    if (!keepConfirm) confirmKey = '';
    switch (act) {
      case 'tab': if (!isTab(V) && history.state && history.state.sub) { TAB = btn.getAttribute('data-tab'); history.back(); } else showTab(btn.getAttribute('data-tab')); break;
      case 'close': closeSub(); break;
      case 'new':
        openNew(btn.getAttribute('data-kind'), { dir: btn.getAttribute('data-dir'), an: btn.getAttribute('data-an'), type: btn.getAttribute('data-type') });
        if (btn.getAttribute('data-pay') && F) { F.pay = btn.getAttribute('data-pay'); render(); }
        break;
      case 'campNew': openNew(btn.getAttribute('data-kind'), { camp: btn.getAttribute('data-id'), dir: 'out' }); break;
      case 'camp': openSub('camp', { id: btn.getAttribute('data-id') }); break;
      case 'workers': if (V !== 'workers') openSub('workers', {}); break;
      case 'pending': if (V !== 'pending') openSub('pending', {}); break;
      case 'cash': if (V !== 'cash') openSub('cash', {}); break;
      case 'bank': if (V !== 'bank') openSub('bank', {}); break;
      case 'bankTick':
        var bx = D[COLL[btn.getAttribute('data-kind')]].filter(function (r) { return r.id === btn.getAttribute('data-id'); })[0];
        if (bx) { bx.bankOk = !bx.bankOk; save(); render(); }
        break;
      case 'payWorker': payWorker(btn.getAttribute('data-id')); break;
      case 'healed':
        markHealed(btn.getAttribute('data-id'));
        if (V === 'form') closeSub(); else render();
        break;
      case 'repeatHealth':
        var hx = D.health.filter(function (x) { return x.id === btn.getAttribute('data-id'); })[0];
        if (hx && hx.type === 'sick') { openEdit('health', hx.id); break; }
        if (hx) openNew('health', { type: hx.type, an: hx.an });
        if (hx && F) { F.product = hx.product; F.who = hx.who; F.n = numIn(hx.n || ''); F.wd = numIn(hx.wd || ''); render(); }
        break;
      case 'wpick':
        var wid = btn.getAttribute('data-id'), cur = F.people[wid] || 0;
        F.people[wid] = cur === 0 ? 1 : cur === 1 ? 0.5 : 0;
        render(); break;
      case 'rmPhoto': F.photoRemoved = true; F.newPhoto = null; F.photoSrc = null; render(); break;
      case 'viewPhoto': showPhoto(btn.getAttribute('src')); break;
      case 'edit': openEdit(btn.getAttribute('data-kind'), btn.getAttribute('data-id')); break;
      case 'saveForm': saveForm(); break;
      case 'deleteForm': deleteForm(); break;
      case 'finishSetup': finishSetup(); break;
      case 'mprev': case 'mnext':
        var view = btn.getAttribute('data-view');
        LS[view].ym = addMonths(LS[view].ym, act === 'mprev' ? -1 : 1); render(); break;
      case 'mfilter': LS.money.dir = btn.getAttribute('data-v'); render(); break;
      case 'more': var mv = btn.getAttribute('data-view'); LS[mv].n += 30; render(); break;
      case 'reports': if (V !== 'reports') openReports(); break;
      case 'settings': if (V === 'settings') break; openSub('settings', {}); break;
      case 'saveSettings': saveSettings(); break;
      case 'xls': exportFile('xlsx'); break;
      case 'pdf': exportFile('pdf'); break;
      case 'shareXls': exportFile('xlsx', true); break;
      case 'sharePdf': exportFile('pdf', true); break;
      case 'backup': backup(); break;
      case 'restorePick': restorePick(); break;
      case 'applyRestore': applyRestore(); break;
      case 'cancelRestore': pendingRestore = null; F.restoreN = null; render(); break;
      case 'icsFile': reminderIcs(); break;
      case 'icsGoogle': reminderGoogle(); break;
      case 'delCat':
        var key = 'cat:' + btn.getAttribute('data-dir') + btn.getAttribute('data-v');
        if (confirmKey !== key) { confirmKey = key; return render(); }
        var dir = btn.getAttribute('data-dir'), name = btn.getAttribute('data-v');
        D.settings.cats[dir] = D.settings.cats[dir].filter(function (n) { return n !== name; });
        confirmKey = ''; save(); render(); break;
      case 'wipe':
        if (confirmKey !== 'wipe') { confirmKey = 'wipe'; return render(); }
        D = blank(); save(); photoClear(); photoUrls = {}; confirmKey = '';
        if (history.state && history.state.sub) history.back();
        F = null; V = 'home'; TAB = 'home'; render(); break;
      case 'install': doInstall(); break;
    }
  });

  function showPhoto(src) {
    var v = document.createElement('div');
    v.className = 'viewer';
    v.innerHTML = '<img src="' + src + '" alt=""><button class="icon close" aria-label="' + esc(t('close')) + '">✕</button>';
    v.addEventListener('click', function () { v.remove(); });
    document.body.appendChild(v);
  }

  /* Install button (Android Chrome / desktop Chrome & Edge) */
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); installEvt = e;
    var b = document.getElementById('installBtn'); if (b) b.classList.remove('hidden');
  });
  function doInstall() {
    if (!installEvt) return;
    installEvt.prompt();
    installEvt.userChoice.finally(function () {
      installEvt = null;
      var b = document.getElementById('installBtn'); if (b) b.classList.add('hidden');
    });
  }
  window.addEventListener('appinstalled', function () { toast(t('installed')); });

  /* Offline support */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  /* Re-check the diary reminder when the app comes back to the front */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !D || !D.settings.setup) return;
    var n = runRecurring();
    if (V === 'home' || (n && isTab(V))) render();
  });

  /* ================================================================ */
  /* Start                                                             */
  /* ================================================================ */
  loadData().then(function (d) {
    D = normalise(d);
    history.replaceState({ root: 1 }, '');
    if (D.settings.setup) runRecurring();
    render();
  });

  // for automated tests only
  window.__FL = { get: function () { return D; } };
})();
