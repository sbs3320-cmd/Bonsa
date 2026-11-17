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
    [-30, 6], [30, 6], [-14, -4], [14, -4], [-24, -10], [24, -10], [-8, -14], [8, -14], [0, -20],
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
  var XMAS = { tree: [-10.5, 21], sleigh: [10.6, 25.4], santa: [8.9, 25.6], snowmen: [[-9.6, 30.5, 1], [9.6, 33, -1]], lobbyTree: [-10.2, 0.8] };

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
  var colFloor = [c(KIOSK[0], KIOSK[1], 0.9, 0.7)];
  var col12 = colFloor.concat([c(0, -3.6, 4.4, 1.5), c(0, -5.3, 1.1, 1.1),       // 사장 책상, 의자
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
  // 상점에서 사는 치장. slot: 몸 색(color) 또는 모자(hat). 가격 단위는 코인.
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
    h_santa:  { slot: 'hat', n: '산타 모자', price: 0 }
  };
  var START_MONEY = 200, EVENT_REWARD_MAX = 1000, EVENT_OPEN_MAX = 10;
  var FURN_CAP = 60;                                   // 층마다 놓을 수 있는 개수 (모바일 성능)
  // 가구를 놓을 수 없는 자리: 엘리베이터 앞, 안내판 앞, 게시판 앞
  var KEEP_OUT = [c(8.6, -7.4, 4.4, 3.2), c(KIOSK[0], -7.4, 1.8, 1.6), c(-6.5, -8.2, 5, 1.6)];
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
    if (area === 'out') {
      if (x < -OUT_LIMIT || x > OUT_LIMIT || z < -OUT_LIMIT || z > OUT_LIMIT) return true;
      list = colOut;
    } else {
      if (x < -LW / 2 + R || x > LW / 2 - R || z < -LD / 2 + R || z > LD / 2 - R) return true;
      list = area === 'in' ? colIn : (area === 'f12' ? col12 : colFloor);
    }
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
  function door(area, x, z, slack) {
    slack = slack || 0;
    if (area === 'out' && Math.abs(x) < 1.5 + slack && z > 6 - slack && z < 7.1 + slack) return 'in';
    if (area === 'in' && Math.abs(x) < 1.5 + slack && z > LD / 2 - 0.85 - slack) return 'out';
    return null;
  }
  var SPAWN = { start: { x: 0, z: 24 }, in: { x: 0, z: 6.6 }, out: { x: 0, z: 9.5 } };

  return { LW: LW, LD: LD, LH: LH, R: R, SPEED: SPEED, TREES: TREES, SHOPS: SHOPS, SHOP_Z: SHOP_Z,
    PLANTS: PLANTS, NPCS: NPCS, LAMPS: LAMPS, FLAG: FLAG, BENCHES: BENCHES, PLANTERS: PLANTERS, BINS: BINS, XMAS: XMAS, XMAS_OUT: XMAS_OUT, XMAS_IN: XMAS_IN,
    FLOOR_MIN: FLOOR_MIN, FLOOR_MAX: FLOOR_MAX, FLOOR_REG_MAX: FLOOR_REG_MAX, FLOOR_CAP: FLOOR_CAP,
    COSM: COSM, START_MONEY: START_MONEY, EVENT_REWARD_MAX: EVENT_REWARD_MAX, EVENT_OPEN_MAX: EVENT_OPEN_MAX,
    FURN: FURN, FURN_CAP: FURN_CAP, furnSize: furnSize, snap: snap, furnRect: furnRect, furnOk: furnOk, seatPos: seatPos,
    ELEV: ELEV, ELEV_OUT: ELEV_OUT, KIOSK: KIOSK, floorOf: floorOf, areaOf: areaOf, nearElev: nearElev, blocked: blocked, door: door, SPAWN: SPAWN };
});
