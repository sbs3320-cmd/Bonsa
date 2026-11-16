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

  function c(x, z, w, d) { return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }; }
  var colOut = [c(0, 0, 16, 12)], colIn = [];
  SHOPS.forEach(function (s) { colOut.push(c(s[0], SHOP_Z, 6, 5)); });
  TREES.forEach(function (t) { colOut.push(c(t[0], t[1], 0.9, 0.9)); });
  LAMPS.forEach(function (l) { colOut.push(c(l[0], l[1], 0.3, 0.3)); });
  colOut.push(c(FLAG[0], FLAG[1], 0.3, 0.3));
  colIn.push(c(0, -3, 7, 1.2));                       // 안내 데스크
  NPCS.forEach(function (n) { colIn.push(c(n[0], n[1], 0.9, 0.9)); });
  colIn.push(c(8.6, 4.5, 1.1, 3), c(-8.6, 5.6, 3, 1.1), c(6.3, 4.5, 1.6, 1.6));   // 소파, 탁자
  PLANTS.forEach(function (p) { colIn.push(c(p[0], p[1], 0.9, 0.9)); });

  function blocked(area, x, z) {
    var list, i, b;
    if (area === 'out') {
      if (x < -OUT_LIMIT || x > OUT_LIMIT || z < -OUT_LIMIT || z > OUT_LIMIT) return true;
      list = colOut;
    } else {
      if (x < -LW / 2 + R || x > LW / 2 - R || z < -LD / 2 + R || z > LD / 2 - R) return true;
      list = colIn;
    }
    for (i = 0; i < list.length; i++) {
      b = list[i];
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
    PLANTS: PLANTS, NPCS: NPCS, LAMPS: LAMPS, FLAG: FLAG, blocked: blocked, door: door, SPAWN: SPAWN };
});
