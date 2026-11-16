(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  if (!window.THREE || !window.World) { $('err').style.display = 'flex'; $('auth').style.display = 'none'; return; }
  var W = window.World, LW = W.LW, LD = W.LD, LH = W.LH;

  /* ---------- 운영자가 나중에 바꿀 수 있는 문구 (8단계에서 관리자 화면으로 이동) ---------- */
  var RANKS = { intern: '인턴', staff: '사원', deputy: '부팀장', lead: '팀장', manager: '부장', ceo: '사장' };
  var NPC_GREETING = '반갑습니다, 본사입니다';
  var GUIDE = [
    '반갑습니다, 본사입니다. 게임 방법을 간단히 안내해 드릴게요.',
    '이동: 화면 왼쪽 조이스틱으로 걷고, 화면을 드래그하면 시점이 돌아갑니다. PC에서는 WASD와 마우스 드래그를 씁니다.',
    '엘리베이터: 층 사이는 엘리베이터로만 이동합니다. 타면 층 선택 화면이 뜨고, 이름이 등록된 층은 그 이름으로 보입니다.',
    '층 등록: 2~11층 중 한 곳에 입장 등록을 할 수 있습니다. 한 사람은 한 층에만 등록할 수 있어요.',
    '꾸미기: 등록한 층에서는 가구와 소품을 놓고, 옮기고, 돌리고, 지울 수 있습니다.',
    '게시판: 로비 전체 게시판은 누구나 읽고, 층 게시판은 그 층에 등록한 사원이 글을 씁니다.',
    '직급: 인턴으로 시작해 사원, 부팀장, 팀장, 부장, 사장 순으로 올라갑니다. 팀장 이상이 아래 직급을 승진시킵니다.',
    '이벤트: 사장이나 부장이 이벤트를 열면 참여해서 보상금을 받습니다. 돈으로 가구와 치장 아이템을 살 수 있어요.',
    '12층 사장실은 비밀번호가 걸려 있을 수 있습니다. 그럼 즐거운 회사 생활 되세요!'
  ];
  var POSTS = [
    { t: '[공지] 본사에 오신 것을 환영합니다', m: '사장 · 오늘',
      b: '신규 입사자는 인턴으로 시작합니다. 안내 데스크에서 게임 방법을 들어 보세요.' },
    { t: '[공지] 엘리베이터 운행 안내', m: '부장 · 오늘',
      b: '엘리베이터는 현재 점검 중이며 3단계 업데이트에서 2~12층 운행을 시작합니다.' }
  ];

  /* ---------- 렌더러 ---------- */
  var canvas = $('game');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;

  var scene = new THREE.Scene();
  var SKY = new THREE.Color(0x9fd3f5), INDOOR = new THREE.Color(0x2b3442);
  scene.background = SKY.clone();
  scene.fog = new THREE.Fog(0x9fd3f5, 45, 110);

  var camera = new THREE.PerspectiveCamera(58, 1, 0.1, 220);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f7a, 0.85));
  var sun = new THREE.DirectionalLight(0xffffff, 0.75);
  sun.position.set(18, 40, 26);
  scene.add(sun);

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 72 : 56;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------- 도우미 ---------- */
  var matCache = {};
  function mat(color) {
    if (!matCache[color]) matCache[color] = new THREE.MeshLambertMaterial({ color: color });
    return matCache[color];
  }
  function box(w, h, d, color, x, y, z, parent) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  var FONT = '"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif';
  function textTexture(text, o) {
    o = o || {};
    var fs = o.fs || 56, padX = o.padX || 28, padY = o.padY || 16;
    var c = document.createElement('canvas'), ctx = c.getContext('2d');
    ctx.font = '700 ' + fs + 'px ' + FONT;
    var tw = Math.ceil(ctx.measureText(text).width);
    c.width = tw + padX * 2; c.height = fs + padY * 2;
    ctx = c.getContext('2d');
    ctx.font = '700 ' + fs + 'px ' + FONT;
    if (o.bg) { ctx.fillStyle = o.bg; rrect(ctx, 0, 0, c.width, c.height, o.radius == null ? 18 : o.radius); ctx.fill(); }
    ctx.fillStyle = o.color || '#ffffff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2 + fs * 0.04);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return { tex: tex, aspect: c.width / c.height };
  }
  function labelSprite(text, height, o) {
    var t = textTexture(text, o);
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, transparent: true, depthWrite: false }));
    s.scale.set(height * t.aspect, height, 1);
    return s;
  }
  function dropSprite(s) {
    if (!s) return;
    if (s.parent) s.parent.remove(s);
    if (s.material) { if (s.material.map) s.material.map.dispose(); s.material.dispose(); }
  }
  function signPlane(text, height, o) {
    var t = textTexture(text, o);
    return new THREE.Mesh(new THREE.PlaneGeometry(height * t.aspect, height),
      new THREE.MeshBasicMaterial({ map: t.tex, transparent: true }));
  }

  /* ---------- 캐릭터 (오리지널 디자인: 둥근 몸 + 사원증) ---------- */
  var gBody = new THREE.SphereGeometry(0.5, 14, 10);
  var gHead = new THREE.SphereGeometry(0.4, 14, 10);
  var gEye = new THREE.SphereGeometry(0.055, 6, 6);
  var gFoot = new THREE.SphereGeometry(0.17, 8, 6);
  var gStrap = new THREE.TorusGeometry(0.3, 0.025, 5, 14);
  var BODY_COLORS = [0x6fa8ff, 0xf2a65a, 0x7fc8a9, 0xe58fb1, 0xb39ddb, 0xf0d264, 0x80cbc4, 0xef9a9a];
  function setTag(g, text) {
    dropSprite(g.userData.tag);
    var tag = labelSprite(text, 0.42, { bg: 'rgba(20,28,40,0.78)', fs: 44, padX: 22, padY: 12 });
    tag.position.y = 2.25; g.add(tag); g.userData.tag = tag;
  }
  function say(g, text) {
    dropSprite(g.userData.bubble);
    var short = text.length > 28 ? text.slice(0, 28) + '…' : text;
    var b = labelSprite(short, 0.46, { bg: '#ffffff', color: '#1c2430', fs: 44, radius: 26 });
    b.position.y = 2.9; g.add(b);
    g.userData.bubble = b; g.userData.bubbleUntil = performance.now() + 5000;
  }
  function makeCharacter(color, tagText) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(gBody, mat(color));
    body.scale.set(1, 1.1, 0.92); body.position.y = 0.68; g.add(body);
    var head = new THREE.Mesh(gHead, mat(color));
    head.position.y = 1.42; g.add(head);
    [-0.14, 0.14].forEach(function (x) {
      var e = new THREE.Mesh(gEye, mat(0x1c2430));
      e.position.set(x, 1.47, 0.36); g.add(e);
    });
    var feet = [];
    [-0.2, 0.2].forEach(function (x) {
      var f = new THREE.Mesh(gFoot, mat(0x39424f));
      f.scale.set(1, 0.6, 1.3); f.position.set(x, 0.1, 0.05); g.add(f); feet.push(f);
    });
    var strap = new THREE.Mesh(gStrap, mat(0x2f6fed));
    strap.rotation.x = Math.PI / 2 - 0.5; strap.position.set(0, 1.08, 0.1); g.add(strap);
    box(0.2, 0.26, 0.03, 0xffffff, 0, 0.8, 0.49, g);
    box(0.2, 0.07, 0.035, 0x2f6fed, 0, 0.89, 0.49, g);
    g.userData.feet = feet;
    setTag(g, tagText);
    return g;
  }
  function tagOf(rank, name) { return '[' + (RANKS[rank] || rank) + '] ' + name; }

  /* ---------- 야외 ---------- */
  var outdoor = new THREE.Group(), lobby = new THREE.Group();
  scene.add(outdoor); scene.add(lobby);

  (function buildOutdoor() {
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), mat(0x8fcf7a));
    ground.rotation.x = -Math.PI / 2; outdoor.add(ground);
    var path = new THREE.Mesh(new THREE.PlaneGeometry(5, 34), mat(0xd9d2c1));
    path.rotation.x = -Math.PI / 2; path.position.set(0, 0.02, 23); outdoor.add(path);
    var plaza = new THREE.Mesh(new THREE.PlaneGeometry(22, 5), mat(0xd9d2c1));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.02, 8.5); outdoor.add(plaza);

    // 12층 건물: 창문은 텍스처 한 장으로 처리해 메시 수를 줄인다
    function facade(cols) {
      var c = document.createElement('canvas'); c.width = 256; c.height = 512;
      var x = c.getContext('2d');
      x.fillStyle = '#e9edf2'; x.fillRect(0, 0, 256, 512);
      var fh = 512 / 12, cw = 256 / cols;
      for (var f = 0; f < 12; f++) {
        for (var i = 0; i < cols; i++) {
          x.fillStyle = ((f * 7 + i * 3) % 5 === 0) ? '#ffe9a8' : '#7fb2dd';
          x.fillRect(i * cw + cw * 0.16, f * fh + fh * 0.22, cw * 0.68, fh * 0.56);
        }
        x.fillStyle = '#c9d0da'; x.fillRect(0, f * fh, 256, 2);
      }
      var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
    }
    var wide = new THREE.MeshLambertMaterial({ map: facade(6) });
    var narrow = new THREE.MeshLambertMaterial({ map: facade(4) });
    var roof = mat(0xb8c0cc);
    var tower = new THREE.Mesh(new THREE.BoxGeometry(16, 36, 12), [narrow, narrow, roof, roof, wide, wide]);
    tower.position.y = 18; outdoor.add(tower);

    // 정문과 간판
    box(4.2, 3.6, 0.5, 0x4a5566, 0, 1.8, 6.1, outdoor);
    box(1.45, 3, 0.1, 0x9fd0ee, -0.78, 1.5, 6.38, outdoor);
    box(1.45, 3, 0.1, 0x9fd0ee, 0.78, 1.5, 6.38, outdoor);
    box(7.4, 2.2, 0.4, 0x2f6fed, 0, 5.2, 6.25, outdoor);
    var s1 = signPlane('본사', 1.9, { fs: 120, padX: 40, padY: 10 });
    s1.position.set(0, 5.2, 6.47); outdoor.add(s1);
    box(6, 2.4, 0.4, 0x2f6fed, 0, 37.6, 5.6, outdoor);
    var s2 = signPlane('본사', 2, { fs: 120, padX: 40, padY: 10 });
    s2.position.set(0, 37.6, 5.82); outdoor.add(s2);
    var enter = labelSprite('입구', 0.5, { bg: 'rgba(47,111,237,0.92)', fs: 44 });
    enter.position.set(0, 3.95, 6.6); outdoor.add(enter);

    // 작은 가게 (배경 장식, 입장 불가)
    W.SHOPS.forEach(function (s) {
      var x = s[0], z = W.SHOP_Z;
      box(6, 3.4, 5, s[2], x, 1.7, z, outdoor);
      box(6.4, 0.5, 1.6, s[3], x, 3.3, z + 3, outdoor);
      box(1.2, 2.2, 0.1, 0x5b4636, x - 1.6, 1.1, z + 2.52, outdoor);
      box(2.4, 1.3, 0.1, 0xbfe3f5, x + 1.2, 1.7, z + 2.52, outdoor);
      var sg = signPlane(s[1], 0.9, { fs: 72, bg: '#ffffff', color: '#1c2430', radius: 14 });
      sg.position.set(x, 4.2, z + 2.3); outdoor.add(sg);
    });

    // 나무
    var gTrunk = new THREE.CylinderGeometry(0.25, 0.32, 1.8, 7);
    var gLeaf = new THREE.IcosahedronGeometry(1.5, 0);
    W.TREES.forEach(function (p, i) {
      var t = new THREE.Mesh(gTrunk, mat(0x7a5a3c)); t.position.set(p[0], 0.9, p[1]); outdoor.add(t);
      var l = new THREE.Mesh(gLeaf, mat(i % 3 === 0 ? 0x4c9a55 : (i % 3 === 1 ? 0x5fb062 : 0x3f8a4f)));
      var s = 0.85 + (i % 4) * 0.12;
      l.scale.set(s, s * 1.15, s); l.position.set(p[0], 2.9, p[1]); l.rotation.y = i; outdoor.add(l);
    });
  })();

  /* ---------- 1층 로비 ---------- */
  var npcs = [];
  (function buildLobby() {
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(LW, LD), mat(0xe6dccb));
    floor.rotation.x = -Math.PI / 2; lobby.add(floor);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(LW, LD), mat(0xf7f7f4));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = LH; lobby.add(ceil);
    box(LW, LH, 0.3, 0xf3efe6, 0, LH / 2, -LD / 2 - 0.15, lobby);
    box(LW, LH, 0.3, 0xf3efe6, 0, LH / 2, LD / 2 + 0.15, lobby);
    box(0.3, LH, LD, 0xece6da, -LW / 2 - 0.15, LH / 2, 0, lobby);
    box(0.3, LH, LD, 0xece6da, LW / 2 + 0.15, LH / 2, 0, lobby);
    var rug = new THREE.Mesh(new THREE.PlaneGeometry(5, 9), mat(0x2f6fed));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.02, 3.2); lobby.add(rug);

    // 큰 간판
    box(9, 2.6, 0.2, 0x2f6fed, 0, 4.2, -LD / 2 + 0.1, lobby);
    var big = signPlane('본사', 2.2, { fs: 140, padX: 50, padY: 10 });
    big.position.set(0, 4.2, -LD / 2 + 0.22); lobby.add(big);

    // 안내 데스크와 NPC 2명
    box(7, 1.1, 1.2, 0x8a6a4a, 0, 0.55, -3, lobby);
    box(7.3, 0.12, 1.5, 0xf7f7f4, 0, 1.16, -3, lobby);
    var info = labelSprite('안내 데스크', 0.5, { bg: 'rgba(20,28,40,0.78)', fs: 44 });
    info.position.set(0, 3.3, -3); lobby.add(info);
    [[0xf2a65a, '김대리'], [0x7fc8a9, '박주임']].forEach(function (n, i) {
      var pos = W.NPCS[i];
      var c = makeCharacter(n[0], '[안내] ' + n[1]);
      c.position.set(pos[0], 0, pos[1]); lobby.add(c);
      var bubble = labelSprite(NPC_GREETING, 0.5, { bg: '#ffffff', color: '#1c2430', fs: 44, radius: 26 });
      bubble.position.y = 2.95; bubble.visible = false; c.add(bubble);
      npcs.push({ g: c, bubble: bubble, name: '안내 ' + n[1], x: pos[0], z: pos[1], t: i * 2 });
    });

    // 전체 게시판 (서쪽 벽)
    var bx = -LW / 2 + 0.08;
    box(0.12, 2.8, 4.6, 0x6b4f37, bx, 2.3, 0, lobby);
    box(0.06, 2.4, 4.2, 0xd9b98a, bx + 0.07, 2.3, 0, lobby);
    [[-1.3, 2.7, 0xffffff], [0, 2.5, 0xfff2a8], [1.2, 2.8, 0xffffff], [-0.6, 1.8, 0xcfe6ff], [0.9, 1.8, 0xffffff]]
      .forEach(function (p) { box(0.02, 0.7, 0.9, p[2], bx + 0.11, p[1], p[0], lobby); });
    var bl = signPlane('전체 게시판', 0.5, { fs: 56, bg: '#1c2430', radius: 12 });
    bl.rotation.y = Math.PI / 2; bl.position.set(bx + 0.1, 4.1, 0); lobby.add(bl);

    // 엘리베이터 (북쪽 벽 오른쪽)
    var ex = 8.6, ez = -LD / 2 + 0.12;
    box(3.2, 3.7, 0.24, 0x596375, ex, 1.85, ez, lobby);
    box(1.35, 3.2, 0.1, 0xc9d0da, ex - 0.7, 1.6, ez + 0.14, lobby);
    box(1.35, 3.2, 0.1, 0xc9d0da, ex + 0.7, 1.6, ez + 0.14, lobby);
    var el = signPlane('엘리베이터', 0.45, { fs: 56, bg: '#1c2430', radius: 12 });
    el.position.set(ex, 4.15, ez + 0.14); lobby.add(el);

    // 출구 (남쪽 벽)
    var sz = LD / 2 - 0.02;
    box(3.6, 3.5, 0.2, 0x4a5566, 0, 1.75, sz, lobby);
    box(1.5, 3, 0.1, 0xbfe3f5, -0.8, 1.5, sz - 0.12, lobby);
    box(1.5, 3, 0.1, 0xbfe3f5, 0.8, 1.5, sz - 0.12, lobby);
    var out = signPlane('출구', 0.45, { fs: 56, bg: '#2f8f6f', radius: 12 });
    out.rotation.y = Math.PI; out.position.set(0, 4, sz - 0.14); lobby.add(out);

    // 소파와 화분 (충돌 영역은 world.js 와 같은 위치)
    function sofa(x, z, rot) {
      var g = new THREE.Group();
      box(3, 0.55, 1.1, 0x5c7aa8, 0, 0.3, 0, g);
      box(3, 0.9, 0.3, 0x4c6893, 0, 0.75, -0.42, g);
      g.position.set(x, 0, z); g.rotation.y = rot; lobby.add(g);
    }
    sofa(8.6, 4.5, -Math.PI / 2); sofa(-8.6, 5.6, 0);
    box(1.6, 0.5, 1.6, 0xf7f7f4, 6.3, 0.25, 4.5, lobby);
    var gPot = new THREE.CylinderGeometry(0.4, 0.3, 0.7, 8), gPlant = new THREE.IcosahedronGeometry(0.75, 0);
    W.PLANTS.forEach(function (p) {
      var pot = new THREE.Mesh(gPot, mat(0xc98b5e)); pot.position.set(p[0], 0.35, p[1]); lobby.add(pot);
      var pl = new THREE.Mesh(gPlant, mat(0x4c9a55)); pl.scale.y = 1.4; pl.position.set(p[0], 1.5, p[1]); lobby.add(pl);
    });
  })();
  lobby.visible = false;

  /* ---------- 플레이어 ---------- */
  var player = makeCharacter(BODY_COLORS[0], '[인턴] …');
  scene.add(player);
  var P = { x: 0, z: 24, face: Math.PI, walk: 0 };
  var cam = { yaw: 0, pitch: 0.42 };
  var area = 'out';
  var lockUntil = 0, uiOpen = false, playing = false;

  // 같은 장소에 있는 다른 사람들
  var others = {};
  function addOther(p) {
    if (others[p.id]) removeOther(p.id);
    var g = makeCharacter(BODY_COLORS[p.id % BODY_COLORS.length], tagOf(p.r, p.n));
    g.position.set(p.x, 0, p.z); g.rotation.y = p.f;
    scene.add(g);
    others[p.id] = { g: g, x: p.x, z: p.z, f: p.f, walk: 0 };
  }
  function removeOther(id) {
    var o = others[id];
    if (!o) return;
    dropSprite(o.g.userData.tag); dropSprite(o.g.userData.bubble);
    scene.remove(o.g);
    delete others[id];
  }
  function setOthers(list) {
    Object.keys(others).forEach(removeOther);
    list.forEach(addOther);
  }

  /* ---------- 장소 전환 (서버가 허락한 뒤에만 실행) ---------- */
  function applyArea(next, x, z) {
    area = next;
    var inside = next === 'in';
    outdoor.visible = !inside; lobby.visible = inside;
    scene.background.copy(inside ? INDOOR : SKY);
    scene.fog.near = inside ? 200 : 45; scene.fog.far = inside ? 400 : 110;
    P.x = x; P.z = z;
    $('place').textContent = inside ? '1층 로비' : '야외';
  }
  function switchArea(next, x, z, list) {
    lockUntil = performance.now() + 700;
    $('fade').classList.add('on');
    setTimeout(function () {
      applyArea(next, x, z);
      if (next === 'in') { P.face = Math.PI; cam.yaw = 0; cam.pitch = 0.36; }
      else { P.face = 0; cam.yaw = Math.PI; cam.pitch = 0.42; }
      setOthers(list);
      $('fade').classList.remove('on');
    }, 260);
  }

  /* ---------- UI ---------- */
  var toastTimer = 0;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }
  var dIdx = 0;
  function showDialog(who) {
    uiOpen = true; dIdx = 0; $('dWho').textContent = who; renderDialog();
    $('dialog').style.display = 'block';
  }
  function renderDialog() {
    $('dTxt').textContent = GUIDE[dIdx];
    $('dStep').textContent = (dIdx + 1) + ' / ' + GUIDE.length;
    $('dNext').textContent = dIdx === GUIDE.length - 1 ? '닫기' : '다음';
  }
  $('dNext').addEventListener('click', function () {
    if (dIdx >= GUIDE.length - 1) { $('dialog').style.display = 'none'; uiOpen = false; return; }
    dIdx++; renderDialog();
  });
  POSTS.forEach(function (p) {
    var d = document.createElement('div'); d.className = 'post';
    ['t', 'm', 'b'].forEach(function (k) {
      var e = document.createElement('div'); e.className = k; e.textContent = p[k]; d.appendChild(e);
    });
    $('posts').appendChild(d);
  });
  function closeBoard() { $('board').style.display = 'none'; uiOpen = false; }
  $('bClose').addEventListener('click', closeBoard);
  $('board').addEventListener('click', function (e) { if (e.target === $('board')) closeBoard(); });

  var spots = [
    { x: W.NPCS[0][0], z: W.NPCS[0][1], r: 3.4, label: '말 걸기', run: function () { showDialog(npcs[0].name); } },
    { x: W.NPCS[1][0], z: W.NPCS[1][1], r: 3.4, label: '말 걸기', run: function () { showDialog(npcs[1].name); } },
    { x: -LW / 2, z: 0, r: 3.2, label: '게시판 보기', run: function () { uiOpen = true; $('board').style.display = 'flex'; } },
    { x: 8.6, z: -LD / 2, r: 3, label: '엘리베이터', run: function () { toast('엘리베이터는 3단계에서 운행을 시작합니다.'); } }
  ];
  var current = null;
  function doAction() { if (current && !uiOpen) current.run(); }
  $('act').addEventListener('click', doAction);

  /* ---------- 채팅 (화면에는 항상 textContent 로만 넣어 스크립트 삽입을 막는다) ---------- */
  function logLine(text, sys) {
    var log = $('chatLog'), d = document.createElement('div');
    d.textContent = text; if (sys) d.className = 'sys';
    log.appendChild(d);
    while (log.children.length > 6) log.removeChild(log.firstChild);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 20000);
  }
  var chatOpen = false;
  function openChat() {
    if (!playing) return;
    chatOpen = true; $('chatBar').style.display = 'flex'; $('chatBtn').style.display = 'none';
    $('stick').style.display = 'none'; $('chatIn').focus();
  }
  function closeChat() {
    chatOpen = false; $('chatBar').style.display = 'none'; $('chatBtn').style.display = '';
    $('stick').style.display = ''; $('chatIn').blur();
  }
  $('chatBtn').addEventListener('click', openChat);
  $('chatBar').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('chatIn').value.trim();
    if (v) sendMsg({ t: 'chat', m: v.slice(0, 120) });
    $('chatIn').value = '';
    closeChat();
  });
  $('chatIn').addEventListener('keydown', function (e) { if (e.key === 'Escape') closeChat(); });

  /* ---------- 로그인과 회원가입 ---------- */
  var mode = 'login', token = null;
  try { token = localStorage.getItem('bonsa_token'); } catch (e) {}
  function setMode(m) {
    mode = m;
    $('tabLogin').className = m === 'login' ? 'on' : '';
    $('tabJoin').className = m === 'join' ? 'on' : '';
    $('nickRow').style.display = m === 'join' ? 'block' : 'none';
    $('authGo').textContent = m === 'join' ? '가입하고 입장' : '로그인';
    $('fPass').autocomplete = m === 'join' ? 'new-password' : 'current-password';
    $('authMsg').textContent = '';
  }
  $('tabLogin').addEventListener('click', function () { setMode('login'); });
  $('tabJoin').addEventListener('click', function () { setMode('join'); });
  function showAuth(msg) {
    playing = false; $('auth').style.display = 'flex'; $('authMsg').textContent = msg || '';
  }
  $('authForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var body = { username: $('fUser').value.trim().toLowerCase(), password: $('fPass').value };
    if (mode === 'join') body.nickname = $('fNick').value.trim();
    $('authGo').disabled = true; $('authMsg').textContent = '';
    fetch(mode === 'join' ? '/api/signup' : '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (j) {
      $('authGo').disabled = false;
      if (!j.ok) { $('authMsg').textContent = j.error || '실패했습니다.'; return; }
      token = j.token;
      try { localStorage.setItem('bonsa_token', token); } catch (err) {}
      $('fPass').value = '';
      connect();
    }).catch(function () {
      $('authGo').disabled = false; $('authMsg').textContent = '서버에 연결하지 못했습니다.';
    });
  });

  /* ---------- 실시간 연결 (끊기면 자동 재접속) ---------- */
  var ws = null, myId = null, retry = 0, stopped = false, retryTimer = 0;
  function sendMsg(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function forget() { token = null; try { localStorage.removeItem('bonsa_token'); } catch (e) {} }
  function connect() {
    if (!token) return showAuth();
    stopped = false;
    clearTimeout(retryTimer);
    var sock = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws = sock;
    sock.onopen = function () { sock.send(JSON.stringify({ t: 'auth', token: token })); };
    sock.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      onServer(m);
    };
    sock.onclose = function () {
      if (ws !== sock) return;
      ws = null;
      if (stopped) return;
      if (playing) $('net').style.display = 'block';
      retry = Math.min(retry + 1, 5);
      retryTimer = setTimeout(connect, 600 * Math.pow(2, retry - 1));
    };
  }
  function onServer(m) {
    var o;
    switch (m.t) {
      case 'hello':
        myId = m.id; retry = 0;
        player.children.forEach(function (c) { if (c.material === mat(BODY_COLORS[0])) c.material = mat(BODY_COLORS[myId % BODY_COLORS.length]); });
        setTag(player, tagOf(m.me.r, m.me.n));
        applyArea(m.me.area, m.me.x, m.me.z);
        setOthers(m.players);
        $('count').textContent = '접속 ' + m.online + '명';
        $('auth').style.display = 'none'; $('net').style.display = 'none';
        if (!playing) logLine('왼쪽 조이스틱으로 이동, 화면을 드래그해 시점 회전');
        playing = true;
        break;
      case 'join': addOther(m.p); break;
      case 'leave': removeOther(m.id); break;
      case 'state':
        m.ps.forEach(function (s) {
          o = others[s[0]];
          if (o) { o.x = s[1]; o.z = s[2]; o.f = s[3]; }
        });
        break;
      case 'chat':
        logLine(tagOf(m.r, m.n) + ': ' + m.m);
        if (m.id === myId) say(player, m.m);
        else if (others[m.id]) say(others[m.id].g, m.m);
        break;
      case 'fix': P.x = m.x; P.z = m.z; break;
      case 'area': switchArea(m.area, m.x, m.z, m.players); break;
      case 'sys': logLine(m.m, true); break;
      case 'online': $('count').textContent = '접속 ' + m.n + '명'; break;
      case 'kick': stopped = true; setOthers([]); showAuth(m.m); break;
      case 'full': stopped = true; showAuth(m.m); break;
      case 'authfail': stopped = true; forget(); showAuth(m.m); break;
    }
  }

  /* ---------- 입력 ---------- */
  var joy = { x: 0, y: 0, id: null };
  var stick = $('stick'), knob = $('knob');
  function joyMove(e) {
    var r = stick.getBoundingClientRect();
    var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    var max = r.width / 2 - 14, len = Math.sqrt(dx * dx + dy * dy);
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    joy.x = dx / max; joy.y = dy / max;
  }
  function joyEnd(e) {
    if (e.pointerId !== joy.id) return;
    joy.id = null; joy.x = 0; joy.y = 0; knob.style.transform = '';
  }
  stick.addEventListener('pointerdown', function (e) {
    joy.id = e.pointerId;
    try { stick.setPointerCapture(e.pointerId); } catch (err) {}
    joyMove(e); e.preventDefault();
  });
  stick.addEventListener('pointermove', function (e) { if (e.pointerId === joy.id) joyMove(e); });
  stick.addEventListener('pointerup', joyEnd);
  stick.addEventListener('pointercancel', joyEnd);

  var look = { id: null, x: 0, y: 0 };
  canvas.addEventListener('pointerdown', function (e) {
    if (chatOpen) { closeChat(); return; }
    if (look.id !== null) return;
    look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  });
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerId !== look.id) return;
    cam.yaw -= (e.clientX - look.x) * 0.007;
    cam.pitch += (e.clientY - look.y) * 0.005;
    cam.pitch = Math.max(0.12, Math.min(1.05, cam.pitch));
    look.x = e.clientX; look.y = e.clientY;
  });
  function lookEnd(e) { if (e.pointerId === look.id) look.id = null; }
  canvas.addEventListener('pointerup', lookEnd);
  canvas.addEventListener('pointercancel', lookEnd);
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  var keys = {};
  function typing(e) { return e.target && e.target.tagName === 'INPUT'; }
  window.addEventListener('keydown', function (e) {
    if (typing(e)) return;
    keys[e.code] = true;
    if (e.code === 'KeyE' || e.code === 'Space') { doAction(); e.preventDefault(); }
    if (e.code === 'Enter') { openChat(); e.preventDefault(); }
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; });

  /* ---------- 루프 ---------- */
  function turn(from, to, k) { return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k; }
  function expireBubble(g, now) {
    if (g.userData.bubble && now > g.userData.bubbleUntil) { dropSprite(g.userData.bubble); g.userData.bubble = null; }
  }
  var last = performance.now(), lastSend = 0, sent = { x: 0, z: 0, f: 0 };
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000); last = now;

    // 입력 → 이동 방향 (카메라 기준). 내 캐릭터는 먼저 움직이고 서버가 검사해 틀리면 되돌린다.
    var ix = joy.x, iy = -joy.y;
    if (keys.KeyW || keys.ArrowUp) iy += 1;
    if (keys.KeyS || keys.ArrowDown) iy -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    var mag = Math.sqrt(ix * ix + iy * iy);
    if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }
    var moving = playing && mag > 0.12 && !uiOpen && !chatOpen && now > lockUntil;
    if (moving) {
      var sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
      var vx = (-sy * iy + cy * ix), vz = (-cy * iy - sy * ix);
      var nx = P.x + vx * W.SPEED * dt, nz = P.z + vz * W.SPEED * dt;
      if (!W.blocked(area, nx, P.z)) P.x = nx;
      if (!W.blocked(area, P.x, nz)) P.z = nz;
      P.face = turn(P.face, Math.atan2(vx, vz), Math.min(1, dt * 12));
      P.walk += dt * 11 * mag;
    }
    player.position.set(P.x, moving ? Math.abs(Math.sin(P.walk)) * 0.09 : 0, P.z);
    player.rotation.y = P.face;
    var feet = player.userData.feet;
    feet[0].position.z = 0.05 + (moving ? Math.sin(P.walk) * 0.16 : 0);
    feet[1].position.z = 0.05 - (moving ? Math.sin(P.walk) * 0.16 : 0);
    expireBubble(player, now);

    // 내 위치를 초당 10번까지 서버로 보낸다
    if (playing && now - lastSend > 100 && now > lockUntil &&
        (Math.abs(P.x - sent.x) > 0.01 || Math.abs(P.z - sent.z) > 0.01 || Math.abs(P.face - sent.f) > 0.05)) {
      lastSend = now; sent.x = P.x; sent.z = P.z; sent.f = P.face;
      sendMsg({ t: 'move', x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100, f: Math.round(P.face * 100) / 100 });
    }

    // 문 앞에 서면 서버에 장소 이동을 요청한다
    if (playing && now > lockUntil) {
      var to = W.door(area, P.x, P.z);
      if (to) { lockUntil = now + 1500; sendMsg({ t: 'area', to: to }); }
    }

    // 다른 사람들: 서버가 알려 준 위치로 부드럽게 따라간다
    var id, o, ddx, ddz, dd, far;
    for (id in others) {
      o = others[id];
      ddx = o.x - o.g.position.x; ddz = o.z - o.g.position.z; dd = Math.sqrt(ddx * ddx + ddz * ddz);
      if (dd > 6) { o.g.position.x = o.x; o.g.position.z = o.z; }
      else if (dd > 0.01) {
        o.g.position.x += ddx * Math.min(1, dt * 10); o.g.position.z += ddz * Math.min(1, dt * 10);
        o.walk += dt * 11;
      }
      o.g.position.y = dd > 0.05 ? Math.abs(Math.sin(o.walk)) * 0.09 : 0;
      o.g.rotation.y = turn(o.g.rotation.y, o.f, Math.min(1, dt * 12));
      // 멀리 있는 사람의 이름표는 숨겨 그리는 양을 줄인다
      far = (o.g.position.x - P.x) * (o.g.position.x - P.x) + (o.g.position.z - P.z) * (o.g.position.z - P.z) > 900;
      if (o.g.userData.tag) o.g.userData.tag.visible = !far;
      expireBubble(o.g, now);
    }

    // NPC 인사와 상호작용 버튼
    current = null;
    if (area === 'in') {
      var i, n, d, best = 1e9, want;
      for (i = 0; i < npcs.length; i++) {
        n = npcs[i]; n.t += dt;
        d = Math.sqrt((P.x - n.x) * (P.x - n.x) + (P.z - n.z) * (P.z - n.z));
        n.bubble.visible = d < 6.5 && !uiOpen;
        n.g.position.y = Math.abs(Math.sin(n.t * 1.6)) * 0.04;
        want = d < 6.5 ? Math.atan2(P.x - n.x, P.z - n.z) : 0;
        n.g.rotation.y = turn(n.g.rotation.y, want, Math.min(1, dt * 5));
      }
      for (i = 0; i < spots.length; i++) {
        d = Math.sqrt((P.x - spots[i].x) * (P.x - spots[i].x) + (P.z - spots[i].z) * (P.z - spots[i].z));
        if (d < spots[i].r && d < best) { best = d; current = spots[i]; }
      }
    }
    var act = $('act');
    if (current && !uiOpen && !chatOpen && playing) {
      if (act.textContent !== current.label) act.textContent = current.label;
      act.style.display = 'block';
    } else act.style.display = 'none';

    // 3인칭 카메라
    var dist = area === 'in' ? 5.6 : 8;
    var h = Math.cos(cam.pitch) * dist;
    var cx = P.x + Math.sin(cam.yaw) * h, cz = P.z + Math.cos(cam.yaw) * h;
    var cyy = 1.3 + Math.sin(cam.pitch) * dist;
    if (area === 'in') {
      cx = Math.max(-LW / 2 + 0.4, Math.min(LW / 2 - 0.4, cx));
      cz = Math.max(-LD / 2 + 0.4, Math.min(LD / 2 - 0.4, cz));
      cyy = Math.min(LH - 0.4, cyy);
    } else if (cx > -8.6 && cx < 8.6 && cz > -6.6 && cz < 6.6) {
      // 카메라가 건물 안으로 파고들지 않게 가장 가까운 벽 밖으로 밀어낸다
      var px0 = cx + 8.6, px1 = 8.6 - cx, pz0 = cz + 6.6, pz1 = 6.6 - cz;
      var mn = Math.min(px0, px1, pz0, pz1);
      if (mn === pz1) cz = 6.6; else if (mn === pz0) cz = -6.6; else if (mn === px1) cx = 8.6; else cx = -8.6;
    }
    camera.position.set(cx, cyy, cz);
    camera.lookAt(P.x, 1.3, P.z);

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  if (token) connect(); else showAuth();
})();
