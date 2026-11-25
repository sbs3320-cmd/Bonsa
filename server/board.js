'use strict';
// 1~10구역(2~11층) 전도 게시판. 그 구역에 등록한 사람(구역원)이 메모·스티커·사진을 붙여 꾸민다.
// - 붙이기: 구역원, 부장 이상, 총관리자. 게시판 앞(4m 안)에서만
// - 옮기기·떼기: 붙인 사람, 그 구역 대표자, 부장 이상, 총관리자
// - 구역마다 최대 40개, 사진은 15장. 사진 파일은 /api/photo 로 먼저 올리고 받은 번호로 붙인다
const World = require('../public/world.js');
const db = require('./db');

const B = World.BOARD;
const clean = (t, n) => String(t || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const HIGH = ['owner', 'ceo', 'manager'];
const num01 = v => { const n = Number(v); return Number.isFinite(n) ? Math.max(0.04, Math.min(0.96, n)) : null; };

class Boards {
  constructor(game) { this.g = game; this.items = new Map(); }       // 층 -> [item]
  async init() {
    for (let n = World.FLOOR_MIN; n <= World.FLOOR_REG_MAX; n++) this.items.set(n, []);
    (await db.loadBoard()).forEach(r => { const l = this.items.get(r.floor); if (l) l.push(this.norm(r)); });
  }
  norm(r) { return { id: r.id, uid: r.uid, by: r.by || '', kind: r.kind, x: r.x, y: r.y, rot: r.rot || 0, color: r.color | 0, body: r.body || '', sticker: r.sticker | 0, photo: r.photo || 0 }; }
  row(it) { return [it.id, it.kind, Math.round(it.x * 1000) / 1000, Math.round(it.y * 1000) / 1000, Math.round(it.rot * 100) / 100, it.color, it.body, it.sticker, it.photo, it.by, it.uid]; }
  list(n) { return (this.items.get(n) || []).map(it => this.row(it)); }
  floorOf(p) { const n = World.floorOf(p.area); return n >= World.FLOOR_MIN && n <= World.FLOOR_REG_MAX ? n : 0; }
  canAdd(p, n) { return p.floor === n || HIGH.includes(p.rank); }
  canEdit(p, n, it) { return it.uid === p.id || HIGH.includes(p.rank) || (this.g.floors.get(n) || {}).rep === p.id; }
  nearBoard(p) { return World.near(p.x, p.z, { x: World.FL_BOARD.x, z: World.FL_BOARD.z - 1 }, 4.5); }
  push(n) { this.g.broadcast('f' + n, { t: 'bdset', list: this.list(n) }); }

  // 처리했으면 true
  handle(p, m) {
    if (!['bd_add', 'bd_move', 'bd_del'].includes(m.t)) return false;
    if (p.busy || !this.g.actOk(p)) return true;
    p.busy = true;
    const run = m.t === 'bd_add' ? this.add(p, m) : m.t === 'bd_move' ? this.move(p, m) : this.del(p, m);
    Promise.resolve(run).catch(e => { console.error(e); if (this.g.alive(p)) this.g.toast(p, '요청을 처리하지 못했습니다.'); })
      .then(() => { p.busy = false; });
    return true;
  }
  async add(p, m) {
    const n = this.floorOf(p);
    if (!n) return;
    if (!this.canAdd(p, n)) return this.g.toast(p, World.floorName(n) + '에 등록한 구역원만 꾸밀 수 있습니다.');
    if (!this.nearBoard(p)) return this.g.toast(p, '전도 게시판 앞에서 꾸밀 수 있습니다.');
    const list = this.items.get(n);
    if (list.length >= B.max) return this.g.toast(p, '게시판이 가득 찼습니다 (' + B.max + '개). 오래된 것을 떼고 붙여 주세요.');
    const x = num01(m.x), y = num01(m.y);
    if (x === null || y === null) return;
    const it = { floor: n, uid: p.id, kind: m.k, x, y, rot: Math.max(-0.3, Math.min(0.3, Number(m.rot) || 0)), color: 0, body: '', sticker: 0, photo: null };
    if (m.k === 'memo') {
      it.body = clean(m.m, B.memo);
      if (!it.body) return this.g.toast(p, '메모 내용을 써 주세요.');
      it.color = Math.max(0, Math.min(B.colors.length - 1, Number(m.c) | 0));
    } else if (m.k === 'stk') {
      it.sticker = Number(m.s) | 0;
      if (it.sticker < 0 || it.sticker >= B.stickers.length) return;
    } else if (m.k === 'photo') {
      if (list.filter(x => x.kind === 'photo').length >= B.photos) return this.g.toast(p, '사진은 한 구역에 ' + B.photos + '장까지 붙일 수 있습니다.');
      const pid = Number(m.pid) | 0, ph = pid > 0 ? await db.getPhoto(pid) : null;
      if (!ph || ph.uid !== p.id) return this.g.toast(p, '사진을 다시 올려 주세요.');
      for (const l of this.items.values()) if (l.some(x => x.photo === pid)) return this.g.toast(p, '이미 붙인 사진입니다.');
      it.photo = pid;
      it.body = clean(m.m, 20);
    } else return;
    it.id = await db.addBoardItem(it);
    it.by = p.name;
    list.push(this.norm(it));
    await db.audit(p.id, 'board', World.floorName(n) + ' 전도 게시판 ' + ({ memo: '메모', stk: '스티커', photo: '사진' })[m.k] + ' 붙임 #' + it.id + (it.body ? ' ' + it.body : ''));
    this.push(n);
  }
  async move(p, m) {
    const n = this.floorOf(p), list = n ? this.items.get(n) : null, it = list && list.find(x => x.id === (Number(m.id) | 0));
    if (!it) return;
    if (!this.canEdit(p, n, it)) return this.g.toast(p, '붙인 사람이나 구역 대표자, 부장 이상만 옮길 수 있습니다.');
    if (!this.nearBoard(p)) return;
    const x = num01(m.x), y = num01(m.y);
    if (x === null || y === null) return;
    it.x = x; it.y = y;
    await db.moveBoardItem(it.id, x, y);
    this.push(n);
  }
  async del(p, m) {
    const n = this.floorOf(p), list = n ? this.items.get(n) : null, i = list ? list.findIndex(x => x.id === (Number(m.id) | 0)) : -1;
    if (i < 0) return;
    const it = list[i];
    if (!this.canEdit(p, n, it)) return this.g.toast(p, '붙인 사람이나 구역 대표자, 부장 이상만 뗄 수 있습니다.');
    list.splice(i, 1);
    await db.delBoardItem(it.id);
    await db.audit(p.id, 'board', World.floorName(n) + ' 전도 게시판 #' + it.id + ' 뗌');
    this.push(n);
  }
  // 총관리자 화면
  adminList() {
    const out = [];
    for (const [n, l] of this.items) l.forEach(it => out.push([it.id, n, World.floorName(n), it.kind, it.body, it.sticker, it.photo, it.by]));
    return out.sort((a, b) => b[0] - a[0]);
  }
  async adminDel(id) {
    for (const [n, l] of this.items) {
      const i = l.findIndex(x => x.id === id);
      if (i >= 0) { l.splice(i, 1); await db.delBoardItem(id); this.push(n); return true; }
    }
    return false;
  }
}

// 올라온 파일이 정말 그림인지 앞부분 바이트로 확인한다 (JPEG, PNG, WebP 만)
function sniffImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}
const PHOTO_MAX = 450 * 1024, PHOTO_PER_HOUR = 20;

module.exports = { Boards, sniffImage, PHOTO_MAX, PHOTO_PER_HOUR };
