/* 서버와 브라우저가 함께 쓰는 맵 정보. 벽과 가구의 충돌 영역이 양쪽에서 같아야
   서버가 벽 통과와 순간이동을 정확히 걸러 낼 수 있다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.World = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LW = 24, LD = 18, LH = 6;      // 로비 가로, 세로, 높이
  var R = 0.5, SPEED = 5.2, OUT_LIMIT = 38;

  var TREES = [[-7, 13], [7, 13], [-6, 22], [6, 22], [-6, 31], [6, 31], [-17, 26], [17, 26], [-28, 22], [28, 22],
    [-35, 8], [35, 8], [-14, -4], [14, -4], [-24, -10], [24, -10], [-8, -14], [8, -14], [0, -20],
    [-32, 32], [32, 32], [-18, 35], [18, 35]];
  var SHOPS = [[-22, '카페', 0xf2b279, 0xd9603b], [-13.5, '꽃집', 0xf4c6d7, 0x4fa36b],
    [13.5, '빵집', 0xf6e0a8, 0xb5713a], [22, '편의점', 0xdfe9f5, 0x2f8f6f]];
  var SHOP_Z = 15;
  var PLANTS = [[-10.8, -7.8], [10.8, 7.8], [-10.8, 7.8], [4.6, -7.8], [-4.6, -7.8]];
  var NPCS = [[-1.5, -4.5], [1.5, -4.5]];
  var LAMPS = [[-3.3, 17], [3.3, 17], [-3.3, 27], [3.3, 27]];   // 가로등
  var FLAG = [-9, 9.5];                                          // 깃대
  var BENCHES = [[-3.75, 22, 1], [3.75, 22, -1]];                // 벤치: x, z, 앉는 쪽 (+1 이면 +x 쪽을 본다)
  var PLANTERS = [[-5.6, 9.8], [5.6, 9.8]];                       // 광장의 둥근 화분
  var BINS = [[-3.75, 20.3], [3.75, 23.7]];                       // 쓰레기통
  // 크리스마스 꾸미기 소품 자리. 부딪힘 영역은 꾸미기를 켰을 때만 쓴다(서버와 화면이 같은 값을 쓴다).
  var XMAS = { tree: [-10.5, 21], sleigh: [10.6, 25.4], santa: [8.9, 25.6], snowmen: [[-9.6, 30.5, 1], [9.6, 33, -1]], lobbyTree: [-9.6, -5.4] };

  function c(x, z, w, d) { return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }; }
  var colOut = [c(0, 0, 16, 12)], colIn = [];
  SHOPS.forEach(function (s) { colOut.push(c(s[0], SHOP_Z, 6, 5)); });
  TREES.forEach(function (t) { colOut.push(c(t[0], t[1], 0.9, 0.9)); });
  LAMPS.forEach(function (l) { colOut.push(c(l[0], l[1], 0.3, 0.3)); });
  colOut.push(c(FLAG[0], FLAG[1], 0.3, 0.3));
  BENCHES.forEach(function (b) { colOut.push(c(b[0], b[1], 0.8, 1.8)); });
  PLANTERS.forEach(function (p) { colOut.push(c(p[0], p[1], 1.5, 1.5)); });
  BINS.forEach(function (p) { colOut.push(c(p[0], p[1], 0.5, 0.5)); });
  var XMAS_OUT = [c(XMAS.tree[0], XMAS.tree[1], 4.2, 4.2), c(10.6, 24.3, 2.0, 5.2), c(XMAS.santa[0], XMAS.santa[1], 1.0, 1.0)]
    .concat(XMAS.snowmen.map(function (s) { return c(s[0], s[1], 1.1, 1.1); }));
  var XMAS_IN = [c(XMAS.lobbyTree[0], XMAS.lobbyTree[1], 2.6, 2.6)];
  colIn.push(c(0, -3, 7, 1.2));                       // 안내 데스크
  NPCS.forEach(function (n) { colIn.push(c(n[0], n[1], 0.9, 0.9)); });
  colIn.push(c(8.6, 4.5, 1.1, 3), c(-8.6, 5.6, 3, 1.1), c(6.3, 4.5, 1.6, 1.6));   // 소파, 탁자
  PLANTS.forEach(function (p) { colIn.push(c(p[0], p[1], 0.9, 0.9)); });

  // 2~12층. 방 크기는 로비와 같고, 엘리베이터도 같은 자리에 있다.
  var FLOOR_MIN = 2, FLOOR_MAX = 12, FLOOR_REG_MAX = 11, FLOOR_CAP = 20;
  var ELEV = { x: 8.6, z: -LD / 2 }, ELEV_OUT = { x: 8.6, z: -LD / 2 + 1.8 };
  var KIOSK = [5.4, -8.3];                                       // 층 안내판
  // 1.9.0: 2~11층(1~10구역)마다 열매 기도 나무(앞쪽 오른편)와 전도 게시판(앞 벽 왼편)
  var FL_TREE = { x: 8, z: 4.4 }, FL_BOARD = { x: -5, z: LD / 2, w: 7, h: 3.5 };
  var colBase = [c(KIOSK[0], KIOSK[1], 0.9, 0.7)];
  var colFloor = colBase.concat([c(FL_TREE.x, FL_TREE.z, 2.4, 2.4)]);
  var col12 = colBase.concat([c(0, -3.6, 4.4, 1.5), c(0, -5.3, 1.1, 1.1),       // 사장 책상, 의자
    c(-11.55, -3, 0.9, 5.2),                                                       // 책장
    c(-7.5, 4.5, 1.1, 3), c(-5.2, 4.5, 1.6, 1.6),                                  // 소파, 탁자
    c(10.8, 7.8, 0.9, 0.9), c(-10.8, 7.8, 0.9, 0.9)]);                             // 화분
  // 장소 이름을 층 번호로: 'in' -> 1, 'f5' -> 5, 'out' -> 0
  function floorOf(area) {
    if (area === 'in') return 1;
    var m = /^f(\d{1,2})$/.exec(area || ''), n = m ? Number(m[1]) : 0;
    return n >= FLOOR_MIN && n <= FLOOR_MAX ? n : 0;
  }
  function areaOf(floor) { return floor === 1 ? 'in' : 'f' + floor; }
  function nearElev(area, x, z, slack) {
    if (!floorOf(area)) return false;
    var dx = x - ELEV.x, dz = z - ELEV.z;
    return Math.sqrt(dx * dx + dz * dz) < 3 + (slack || 0);
  }

  // ---- 꾸미기 가구 ----
  // w, d: 차지하는 칸 수(1칸 = 1m). solid: 지나갈 수 없음. seats: 앉는 자리(가구 기준 좌표, 앞쪽이 +z).
  var FURN = {
    desk:  { n: '책상', w: 2, d: 1, solid: true, price: 50 },
    chair: { n: '의자', w: 1, d: 1, solid: true, price: 20, seats: [[0, 0.02]] },
    sofa:  { n: '소파', w: 2, d: 1, solid: true, price: 80, seats: [[-0.48, 0.05], [0.48, 0.05]] },
    table: { n: '탁자', w: 1, d: 1, solid: true, price: 30 },
    shelf: { n: '책장', w: 2, d: 1, solid: true, price: 60 },
    plant: { n: '화분', w: 1, d: 1, solid: true, price: 20 },
    lamp:  { n: '스탠드', w: 1, d: 1, solid: true, price: 30 },
    wall:  { n: '칸막이', w: 2, d: 1, solid: true, price: 20 },
    rug:   { n: '러그', w: 3, d: 2, solid: false, price: 40 }
  };
  // 상점에서 사는 치장. slot: 털 색(color), 모자(hat), 자켓(jacket), 바지(pants), 넥타이(tie). 가격 단위는 코인.
  var COSM = {
    c_sky:    { slot: 'color', n: '하늘색', hex: 0x6fa8ff, price: 50 },
    c_orange: { slot: 'color', n: '귤색', hex: 0xf2a65a, price: 50 },
    c_mint:   { slot: 'color', n: '민트', hex: 0x7fc8a9, price: 50 },
    c_pink:   { slot: 'color', n: '분홍', hex: 0xe58fb1, price: 50 },
    c_purple: { slot: 'color', n: '연보라', hex: 0xb39ddb, price: 50 },
    c_lemon:  { slot: 'color', n: '레몬', hex: 0xf0d264, price: 50 },
    c_white:  { slot: 'color', n: '하양', hex: 0xf4f4f0, price: 120 },
    c_black:  { slot: 'color', n: '먹색', hex: 0x4a4f57, price: 120 },
    h_cap:    { slot: 'hat', n: '야구 모자', price: 80 },
    h_beanie: { slot: 'hat', n: '털모자', price: 80 },
    h_party:  { slot: 'hat', n: '고깔모자', price: 60 },
    h_ribbon: { slot: 'hat', n: '리본', price: 60 },
    h_crown:  { slot: 'hat', n: '왕관', price: 500 },
    h_santa:  { slot: 'hat', n: '산타 모자', price: 0 },
    // 정장. def: true 는 처음부터 입고 있는 기본 옷 (사지 않아도 입을 수 있다)
    j_navy:     { slot: 'jacket', n: '남색 자켓', hex: 0x2c3e66, price: 0, def: true },
    j_charcoal: { slot: 'jacket', n: '진회색 자켓', hex: 0x41454d, price: 100 },
    j_black:    { slot: 'jacket', n: '검정 자켓', hex: 0x24262b, price: 100 },
    j_grey:     { slot: 'jacket', n: '회색 자켓', hex: 0x8c929c, price: 100 },
    j_beige:    { slot: 'jacket', n: '베이지 자켓', hex: 0xcdb592, price: 120 },
    j_brown:    { slot: 'jacket', n: '갈색 자켓', hex: 0x7a5236, price: 120 },
    j_green:    { slot: 'jacket', n: '올리브 자켓', hex: 0x5e6b45, price: 120 },
    j_wine:     { slot: 'jacket', n: '와인 자켓', hex: 0x7a2636, price: 150 },
    j_sky:      { slot: 'jacket', n: '하늘색 자켓', hex: 0x86b4e0, price: 150 },
    j_pink:     { slot: 'jacket', n: '분홍 자켓', hex: 0xe8a2b8, price: 150 },
    j_white:    { slot: 'jacket', n: '흰색 자켓', hex: 0xefede6, price: 200 },
    p_charcoal: { slot: 'pants', n: '진회색 바지', hex: 0x3d4049, price: 0, def: true },
    p_navy:     { slot: 'pants', n: '남색 바지', hex: 0x2a3858, price: 60 },
    p_black:    { slot: 'pants', n: '검정 바지', hex: 0x222327, price: 60 },
    p_grey:     { slot: 'pants', n: '회색 바지', hex: 0x878d97, price: 60 },
    p_beige:    { slot: 'pants', n: '베이지 바지', hex: 0xc6ae8a, price: 80 },
    p_brown:    { slot: 'pants', n: '갈색 바지', hex: 0x6e4a31, price: 80 },
    p_white:    { slot: 'pants', n: '흰색 바지', hex: 0xebe9e2, price: 120 },
    t_red:      { slot: 'tie', n: '빨간 넥타이', hex: 0xd0343c, price: 0, def: true },
    t_navy:     { slot: 'tie', n: '남색 넥타이', hex: 0x24345e, price: 30 },
    t_blue:     { slot: 'tie', n: '파란 넥타이', hex: 0x2f7fe0, price: 30 },
    t_sky:      { slot: 'tie', n: '하늘색 넥타이', hex: 0x8cc6f0, price: 30 },
    t_green:    { slot: 'tie', n: '초록 넥타이', hex: 0x2f9a5b, price: 30 },
    t_yellow:   { slot: 'tie', n: '노란 넥타이', hex: 0xf2c230, price: 30 },
    t_orange:   { slot: 'tie', n: '주황 넥타이', hex: 0xf08a2c, price: 30 },
    t_pink:     { slot: 'tie', n: '분홍 넥타이', hex: 0xf08fb0, price: 30 },
    t_purple:   { slot: 'tie', n: '보라 넥타이', hex: 0x8a5cc9, price: 30 },
    t_black:    { slot: 'tie', n: '검정 넥타이', hex: 0x1f2024, price: 30 },
    t_gold:     { slot: 'tie', n: '금색 넥타이', hex: 0xd4a72c, price: 80 }
  };
  var SUIT_DEF = { jacket: 'j_navy', pants: 'p_charcoal', tie: 't_red' };
  // 확성기: 모든 접속자 화면 위쪽에 5초 동안 뜬다. 값은 관리자 화면에서 바꿀 수 있다.
  var MEGA = { n: '확성기 (한 번)', price: 0, len: 60, show: 5000, cooldown: 30000, queue: 10, replay: 60000 };
  var PASS_MIN = 4;
  var LOOK_SLOTS = ['color', 'hat', 'jacket', 'pants', 'tie'];
  var START_MONEY = 200, EVENT_REWARD_MAX = 1000, EVENT_OPEN_MAX = 10;
  var FURN_CAP = 60;                                   // 층마다 놓을 수 있는 개수 (모바일 성능)
  // 가구를 놓을 수 없는 자리: 엘리베이터 앞, 안내판 앞, 게시판 앞
  var KEEP_OUT = [c(8.6, -7.4, 4.4, 3.2), c(KIOSK[0], -7.4, 1.8, 1.6), c(-6.5, -8.2, 5, 1.6)];
  var KEEP_OUT_F = [c(FL_TREE.x, FL_TREE.z, 5.2, 5.6), c(FL_BOARD.x, LD / 2 - 1.1, 7.6, 2.2)];   // 2~11층: 나무 둘레, 전도 게시판 앞
  function furnSize(type, rot) {
    var f = FURN[type];
    return rot % 2 ? { w: f.d, d: f.w } : { w: f.w, d: f.d };
  }
  // 격자에 맞추기: 짝수 칸짜리는 정수 좌표, 홀수 칸짜리는 .5 좌표가 중심이 된다
  function snap(v, size) { return Math.round(v - size / 2) + size / 2; }
  function furnRect(it) {
    var s = furnSize(it.type, it.rot);
    return c(it.x, it.z, s.w - 0.04, s.d - 0.04);
  }
  function overlap(a, b) { return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0; }
  // 놓을 수 있는 자리인지. others 는 같은 층의 다른 가구들.
  function furnOk(floor, it, others) {
    var f = FURN[it.type], r, i, o, fixed;
    if (!f || !(it.rot === 0 || it.rot === 1 || it.rot === 2 || it.rot === 3)) return false;
    r = furnRect(it);
    if (r.x0 < -LW / 2 || r.x1 > LW / 2 || r.z0 < -LD / 2 || r.z1 > LD / 2) return false;
    for (i = 0; i < KEEP_OUT.length; i++) if (overlap(r, KEEP_OUT[i])) return false;
    if (floor !== 12) for (i = 0; i < KEEP_OUT_F.length; i++) if (overlap(r, KEEP_OUT_F[i])) return false;
    fixed = floor === 12 ? col12 : colFloor;
    if (f.solid) for (i = 0; i < fixed.length; i++) if (overlap(r, fixed[i])) return false;
    for (i = 0; i < others.length; i++) {
      o = others[i];
      if (o.id === it.id) continue;
      if (FURN[o.type].solid === f.solid && overlap(r, furnRect(o))) return false;   // 러그끼리, 가구끼리만 겹침 금지
    }
    return true;
  }
  // 앉는 자리의 실제 위치와 바라보는 방향
  function seatPos(it, slot) {
    var f = FURN[it.type], s = f && f.seats ? f.seats[slot] : null, a;
    if (!s) return null;
    a = it.rot * Math.PI / 2;
    return { x: it.x + s[0] * Math.cos(a) + s[1] * Math.sin(a), z: it.z - s[0] * Math.sin(a) + s[1] * Math.cos(a), f: a };
  }

  // extra: 그 층에 놓인 가구의 충돌 영역 (서버와 화면이 같은 목록을 넘긴다)
  function blocked(area, x, z, extra) {
    var list, i, b;
    if (isOut(area)) {
      if (x < -OUT_LIMIT || x > OUT_LIMIT || z < -OUT_LIMIT || z > OUT_LIMIT) return true;
    } else {
      if (x < -LW / 2 + R || x > LW / 2 - R || z < -LD / 2 + R || z > LD / 2 - R) return true;
    }
    list = colsOf(area);
    for (i = 0; i < list.length; i++) {
      b = list[i];
      if (x > b.x0 - R && x < b.x1 + R && z > b.z0 - R && z < b.z1 + R) return true;
    }
    if (extra) for (i = 0; i < extra.length; i++) {
      b = extra[i];
      if (x > b.x0 - R && x < b.x1 + R && z > b.z0 - R && z < b.z1 + R) return true;
    }
    return false;
  }
  // 문 앞에 서 있으면 이동할 장소를 돌려준다. slack 은 서버 검증용 여유.
  function door(area, x, z, slack) { return door2(area, x, z, slack); }
  var SPAWN = { start: { x: 0, z: 24 }, in: { x: 0, z: 6.6 }, out: { x: 0, z: 9.5 } };

  // ================= 마을 (무거마을, 게임마을) =================
  // 1.9.0: 본사가 있는 무거마을 야외 'out' 에 본투비헤븐(예전 나무 회사, 1층 'nm1_mu', 2층 'nm2_mu'),
  // 게임마을 야외 'o_gm' 에 플레이존('pz_gm'). 두 마을은 땅·나무·가게 배치가 같고, 게임마을 가운데에는
  // 본사 건물 대신 마을 엘리베이터와 분수가 있다.
  var VKEYS = ['mu', 'gm'];
  var VILLAGES = { mu: { n: '무거마을', out: 'out' }, gm: { n: '게임마을', out: 'o_gm' } };
  var BH_NAME = '본투비헤븐';
  var NAMU = { x: -28, z: -2, w: 12, d: 9 }, PLAY = { x: 28, z: -2, w: 12, d: 9 };   // 건물 자리와 크기 (문은 +z 쪽 가운데)
  var BOOTH = { x: 0, z: 3 }, FOUNTAIN = { x: 0, z: -4 }, VSIGN = { x: 0, z: -9.5 };   // 게임마을 가운데
  var colVillage = colOut.filter(function (b) { return !(b.x0 === -8 && b.x1 === 8 && b.z0 === -6 && b.z1 === 6); })   // 본사 자리를 비운다
    .concat([c(BOOTH.x, BOOTH.z, 3.4, 3.4), c(FOUNTAIN.x, FOUNTAIN.z, 4.6, 4.6), c(VSIGN.x, VSIGN.z, 8.4, 0.8), c(PLAY.x, PLAY.z, PLAY.w, PLAY.d)]);
  colOut.push(c(NAMU.x, NAMU.z, NAMU.w, NAMU.d));
  function isOut(a) { return a === 'out' || a === 'o_gm'; }
  function kindOf(a) {
    if (isOut(a)) return 'out';
    if (a === 'in') return 'in';
    if (a === 'nm1_mu' || a === 'nm2_mu') return a.slice(0, 3);
    if (a === 'pz_gm') return 'pz';
    return floorOf(a) ? 'floor' : '';
  }
  // 그 장소가 속한 마을 (본사 건물 안은 무거마을)
  function villageOf(a) {
    if (a === 'o_gm' || a === 'pz_gm') return 'gm';
    return a === 'out' || a === 'in' || a === 'nm1_mu' || a === 'nm2_mu' || floorOf(a) ? 'mu' : '';
  }
  function allAreas() {
    var list = ['out', 'in', 'o_gm', 'nm1_mu', 'nm2_mu', 'pz_gm'], n;
    for (n = FLOOR_MIN; n <= FLOOR_MAX; n++) list.push('f' + n);
    return list;
  }
  // 건물 안 (나무 회사, 플레이존). 방 크기는 로비와 같고, 문은 앞쪽(+z) 가운데에 있다.
  var NM_TREE = { x: 0, z: -1 };                                   // 1층 가운데 큰 나무
  var NM_STAIRS1 = { x: 9.2, z: -6.4 }, NM_STAIRS2 = { x: 9.2, z: 6.2 };   // 계단 앞 (1층 뒤 오른쪽, 2층 앞 오른쪽)
  var NM_BOOK = { x: -8.5, z: 6.2 }, NM_BOARD = { x: -5.5, z: -1.5 };       // 출입명부 책상, 열매 기록판
  var NM2_CAP = 20;
  var CUSHIONS = [];                                               // 2층 방석 20개
  [-3.2, -0.6, 2, 4.6].forEach(function (z) { [-6, -3, 0, 3, 6].forEach(function (x) { CUSHIONS.push([x, z]); }); });
  var colNm1 = [c(NM_TREE.x, NM_TREE.z, 3.4, 3.4), c(9.2, -8.2, 3.2, 1.6), c(NM_BOOK.x, NM_BOOK.z + 0.9, 1.4, 0.8), c(NM_BOARD.x - 0.5, NM_BOARD.z, 0.4, 1.8)];
  var colNm2 = [c(9.2, 8.2, 3.2, 1.6), c(0, -7.9, 3.4, 1.2)];       // 내려가는 계단, 단상
  var CABINETS = [{ g: 'mem', x: -6 }, { g: 'math', x: 0 }, { g: 't25', x: 6 }];   // 게임기 (뒤 벽 앞, z -7.8)
  var RANK_BOARD = { x: -10.6, z: 0 };                             // 랭킹판 (왼쪽 벽)
  var colPz = CABINETS.map(function (k) { return c(k.x, -8.0, 1.8, 1.6); }).concat([c(-11.6, 0, 0.6, 6)]);
  var GAMES = {
    mem: { n: '숫자 기억', unit: '단계', high: true, note: '숫자가 잠깐 보였다 사라지면 그대로 입력합니다. 단계마다 한 자리씩 늘어납니다.' },
    math: { n: '암산 60초', unit: '문제', high: true, note: '60초 동안 계산 문제를 최대한 많이 맞힙니다.' },
    t25: { n: '1부터 25까지', unit: '초', high: false, note: '흩어진 1~25를 순서대로 빨리 누릅니다. 시간이 짧을수록 높은 순위입니다.' }
  };
  var RANK_PRIZE = [300, 200, 100];                               // 매주 게임마다 1~3위 코인 (관리자 화면에서 바꿈)
  var FRUIT_SHOW = 20, FRUIT_NAME = 10, PRAY_LEN = 100, FRUIT_PRAY = 100;
  // 열매 나무가 있는 곳: 본투비헤븐 1층('mu')과 1~10구역('f2'~'f11'). 기록은 곳마다 따로.
  function treePlace(a) {
    if (a === 'nm1_mu') return 'mu';
    var n = floorOf(a);
    return n >= FLOOR_MIN && n <= FLOOR_REG_MAX ? 'f' + n : '';
  }
  function treePos(a) { return a === 'nm1_mu' ? NM_TREE : FL_TREE; }
  // 층 이름: 로비, 1~10구역(2~11층), 사장실(12층)
  function floorName(n) { return n === 1 ? '로비' : n === 12 ? '사장실' : n >= 2 && n <= 11 ? (n - 1) + '구역' : ''; }
  // 전도 게시판: 1~10구역. 메모·스티커·사진을 붙인다.
  var BOARD = { max: 40, photos: 15, memo: 40, colors: ['#fff59d', '#ffcdd2', '#c8e6c9', '#bbdefb', '#e1bee7', '#ffe0b2'],
    stickers: ['🙏', '✝️', '❤️', '⭐', '🌸', '🕊️', '🌈', '🔥', '📖', '☀️', '🎉', '👍', '💐', '😊', '🙌', '✨'] };
  var GUEST_LEN = 60, NOTICE_LEN = 300;
  var COIN_RULES = { attend: 100, game: 10, gameDay: 100 };      // 출석 코인, 게임 한 판 코인, 게임 코인 하루 최대 (관리자 화면에서 바꿈)
  var PRAISE = { vid: '09228ZOkddc' };                            // 본투비헤븐 2층 찬양 영상 (관리자 화면에서 바꿈)
  // 2층 음악 (모두가 같은 곡의 같은 부분을 듣도록 서버 시각으로 맞춘다). d 는 초.
  var MUSIC = [{ f: '/music/song1.mp3', d: 2417.06 }, { f: '/music/song2.mp3', d: 1995.68 }, { f: '/music/song3.mp3', d: 2171.12 }];

  // 장소별 부딪힘 판정 목록
  function colsOf(area) {
    var k = kindOf(area);
    if (k === 'out') return area === 'out' ? colOut : colVillage;
    if (k === 'in') return colIn;
    if (k === 'nm1') return colNm1;
    if (k === 'nm2') return colNm2;
    if (k === 'pz') return colPz;
    return area === 'f12' ? col12 : colFloor;
  }
  // 문 앞에 서 있으면 이동할 장소 (본사 정문, 나무 회사, 플레이존, 각 건물 안의 문)
  function door2(area, x, z, slack) {
    var k = kindOf(area), v = villageOf(area);
    slack = slack || 0;
    if (k === 'out') {
      if (area === 'out' && Math.abs(x) < 1.5 + slack && z > 6 - slack && z < 7.1 + slack) return 'in';
      var fz = NAMU.z + NAMU.d / 2;
      if (z > fz - slack && z < fz + 1.1 + slack) {
        if (area === 'out' && Math.abs(x - NAMU.x) < 1.4 + slack) return 'nm1_mu';
        if (area === 'o_gm' && Math.abs(x - PLAY.x) < 1.4 + slack) return 'pz_gm';
      }
      return null;
    }
    if ((k === 'in' || k === 'nm1' || k === 'pz') && Math.abs(x) < 1.5 + slack && z > LD / 2 - 0.85 - slack) return VILLAGES[v].out;
    return null;
  }
  // 들어갈 때 서는 자리
  function spawnOf(from, to) {
    var k = kindOf(to);
    if (k === 'out') {
      var fk = kindOf(from), fz = NAMU.z + NAMU.d / 2 + 1.9;
      if (fk === 'nm1') return { x: NAMU.x, z: fz, f: 0 };
      if (fk === 'pz') return { x: PLAY.x, z: fz, f: 0 };
      if (fk === 'in') return { x: SPAWN.out.x, z: SPAWN.out.z, f: 0 };
      return { x: BOOTH.x, z: BOOTH.z + 6, f: 0 };                 // 마을 엘리베이터에서 내림 (광장 쪽)
    }
    if (k === 'nm2') return { x: NM_STAIRS2.x - 1.8, z: NM_STAIRS2.z - 1.2, f: Math.PI };
    if (k === 'nm1' && kindOf(from) === 'nm2') return { x: NM_STAIRS1.x - 1.2, z: NM_STAIRS1.z + 0.6, f: 0 };
    return { x: 0, z: LD / 2 - 2.4, f: Math.PI };
  }
  function near(x, z, p, r) { var dx = x - p.x, dz = z - p.z; return dx * dx + dz * dz < r * r; }

  return { LW: LW, LD: LD, LH: LH, R: R, SPEED: SPEED, TREES: TREES, SHOPS: SHOPS, SHOP_Z: SHOP_Z,
    PLANTS: PLANTS, NPCS: NPCS, LAMPS: LAMPS, FLAG: FLAG, BENCHES: BENCHES, PLANTERS: PLANTERS, BINS: BINS, XMAS: XMAS, XMAS_OUT: XMAS_OUT, XMAS_IN: XMAS_IN,
    FLOOR_MIN: FLOOR_MIN, FLOOR_MAX: FLOOR_MAX, FLOOR_REG_MAX: FLOOR_REG_MAX, FLOOR_CAP: FLOOR_CAP,
    COSM: COSM, MEGA: MEGA, PASS_MIN: PASS_MIN, SUIT_DEF: SUIT_DEF, LOOK_SLOTS: LOOK_SLOTS, START_MONEY: START_MONEY, EVENT_REWARD_MAX: EVENT_REWARD_MAX, EVENT_OPEN_MAX: EVENT_OPEN_MAX,
    FURN: FURN, FURN_CAP: FURN_CAP, furnSize: furnSize, snap: snap, furnRect: furnRect, furnOk: furnOk, seatPos: seatPos,
    ELEV: ELEV, ELEV_OUT: ELEV_OUT, KIOSK: KIOSK, floorOf: floorOf, areaOf: areaOf, nearElev: nearElev, blocked: blocked, door: door, SPAWN: SPAWN,
    VKEYS: VKEYS, VILLAGES: VILLAGES, NAMU: NAMU, PLAY: PLAY, BOOTH: BOOTH, FOUNTAIN: FOUNTAIN, VSIGN: VSIGN, isOut: isOut, kindOf: kindOf, villageOf: villageOf,
    allAreas: allAreas, spawnOf: spawnOf, near: near, NM_TREE: NM_TREE, NM_STAIRS1: NM_STAIRS1, NM_STAIRS2: NM_STAIRS2, NM_BOOK: NM_BOOK, NM_BOARD: NM_BOARD,
    NM2_CAP: NM2_CAP, CUSHIONS: CUSHIONS, CABINETS: CABINETS, RANK_BOARD: RANK_BOARD, GAMES: GAMES, RANK_PRIZE: RANK_PRIZE,
    FRUIT_SHOW: FRUIT_SHOW, FRUIT_NAME: FRUIT_NAME, PRAY_LEN: PRAY_LEN, MUSIC: MUSIC,
    BH_NAME: BH_NAME, FL_TREE: FL_TREE, FL_BOARD: FL_BOARD, FRUIT_PRAY: FRUIT_PRAY, treePlace: treePlace, treePos: treePos, floorName: floorName,
    BOARD: BOARD, GUEST_LEN: GUEST_LEN, NOTICE_LEN: NOTICE_LEN, COIN_RULES: COIN_RULES, PRAISE: PRAISE };
});
