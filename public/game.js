function bonsaBoot() {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  if (!window.THREE || !window.World) { $('err').style.display = 'flex'; $('auth').style.display = 'none'; return; }
  var W = window.World, LW = W.LW, LD = W.LD, LH = W.LH;

  /* ---------- 운영자가 나중에 바꿀 수 있는 문구 (8단계에서 관리자 화면으로 이동) ---------- */
  var RANKS = { owner: '총관리자', intern: '인턴', staff: '사원', deputy: '부팀장', lead: '팀장', manager: '부장', ceo: '사장' };
  var NPC_GREETING = '반갑습니다, 본사입니다';
  var GUIDE = [
    '반갑습니다, 본사입니다. 게임 방법을 간단히 안내해 드릴게요.',
    '이동: 폰에서는 화면 아래쪽을 누른 채 끌면 걷고, 위쪽을 끌면 시점이 돌아갑니다. PC에서는 WASD와 마우스 드래그를 씁니다.',
    '날씨: 바깥은 실제 대한민국 시각과 울산 날씨를 따라갑니다. 비나 눈이 오면 우산 버튼이 나타나요.',
    '엘리베이터: 층 사이는 엘리베이터로만 이동합니다. 타면 층 선택 화면이 뜨고, 이름이 등록된 층은 그 이름으로 보입니다.',
    '층 안내판: 각 층 엘리베이터 옆 안내판에서 그 층에 등록하거나 등록을 해제할 수 있습니다.',
    '층 등록: 2~11층 중 한 곳에 입장 등록을 할 수 있습니다. 한 사람은 한 층에만 등록할 수 있어요.',
    '꾸미기: 등록한 층에서 메뉴의 꾸미기를 누르면 가구를 놓고, 옮기고, 돌리고, 지울 수 있습니다. 의자와 소파에는 앉을 수 있어요.',
    '게시판: 로비 전체 게시판은 누구나 읽고, 층 게시판은 그 층에 등록한 사원이 글을 씁니다. 고정한 글은 게시판에 종이로 붙어요.',
    '직급: 인턴으로 시작해 사원, 부팀장, 팀장, 부장, 사장 순으로 올라갑니다. 팀장 이상이 아래 직급을 승진시킵니다.',
    '메뉴: 오른쪽 위 메뉴에서 프로필, 사원 명부, 게시판, 음악 설정, 로그아웃을 쓸 수 있어요. 캐릭터를 눌러도 프로필이 열립니다.',
    '이벤트: 메뉴의 이벤트에서 참가 신청을 하면 부팀장 이상이 성공을 판정하고, 성공하면 코인을 받습니다.',
    '상점: 메뉴의 상점에서 코인으로 몸 색과 모자를 사고, 꾸미기에서 가구를 삽니다. 처음에 200코인을 드려요.',
    '12층 사장실은 비밀번호가 걸려 있을 수 있습니다. 그럼 즐거운 회사 생활 되세요!'
  ];

  /* ---------- 렌더러 ---------- */
  var canvas = $('game');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd3f5);
  scene.fog = new THREE.Fog(0x9fd3f5, 45, 110);

  var camera = new THREE.PerspectiveCamera(58, 1, 0.1, 220);
  var hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f7a, 0.85);
  scene.add(hemi);
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
    // 색을 화면 출력 방식에 맞게 바꿔 넣어야 물 빠진 듯 뿌옇게 보이지 않는다
    if (!matCache[color]) matCache[color] = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).convertSRGBToLinear() });
    return matCache[color];
  }
  function box(w, h, d, color, x, y, z, parent) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  // 작은 무늬 텍스처 (잔디, 보도블록, 바닥 타일). 한 장을 반복해 써서 가볍다.
  function patternTexture(size, draw, rx, ry) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (t.repeat && t.repeat.set) t.repeat.set(rx, ry);
    return t;
  }
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  function grassTex(rx, ry) {
    return patternTexture(128, function (x, n) {
      x.fillStyle = '#86c56f'; x.fillRect(0, 0, n, n);
      for (var i = 0; i < 420; i++) {
        x.fillStyle = ['#7bbb66', '#93cf7c', '#74b060', '#9ad684'][i % 4];
        x.fillRect(rnd() * n, rnd() * n, 2, 3 + rnd() * 3);
      }
    }, rx, ry);
  }
  function tileTex(base, line, rx, ry) {
    return patternTexture(64, function (x, n) {
      x.fillStyle = base; x.fillRect(0, 0, n, n);
      x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(2, 2, n - 4, n / 2 - 3);
      x.strokeStyle = line; x.lineWidth = 2; x.strokeRect(0, 0, n, n);
    }, rx, ry);
  }
  function texMat(tex) { return new THREE.MeshLambertMaterial({ map: tex }); }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  var FONT = '"Maplestory","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif';
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
  var gBody = new THREE.SphereGeometry(0.5, 22, 16);
  var gHead = new THREE.SphereGeometry(0.4, 22, 16);
  var gEye = new THREE.SphereGeometry(0.055, 8, 8);
  var gFoot = new THREE.SphereGeometry(0.17, 12, 8);
  var gArm = new THREE.SphereGeometry(0.13, 10, 8);
  var gStrap = new THREE.TorusGeometry(0.31, 0.04, 8, 24);
  var gLan = new THREE.BoxGeometry(0.05, 0.26, 0.02);       // 목걸이 줄
  var gCard = new THREE.BoxGeometry(0.34, 0.42, 0.03), gCardTop = new THREE.BoxGeometry(0.34, 0.11, 0.036);
  var gPhoto = new THREE.BoxGeometry(0.13, 0.15, 0.036), gLine = new THREE.BoxGeometry(0.11, 0.028, 0.036);
  var gClip = new THREE.BoxGeometry(0.08, 0.07, 0.04);
  var gCheek = new THREE.SphereGeometry(0.075, 10, 8), gMouth = new THREE.TorusGeometry(0.06, 0.014, 5, 10, Math.PI);
  var LANYARD = 0x2f9bff;
  function part(geo, color, x, y, z, parent) {
    var m = new THREE.Mesh(geo, mat(color)); m.position.set(x, y, z); parent.add(m); return m;
  }
  var gShadow = new THREE.CircleGeometry(0.58, 20);
  var shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false });
  var gUmbTop = new THREE.ConeGeometry(1.05, 0.4, 12, 1, true);
  var gUmbPole = new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6);
  var UMB_COLORS = [0xe5534b, 0x3b82c4, 0xf2b441, 0x3fa56b, 0x8e6bd1, 0xf08aa8];
  var umbMats = UMB_COLORS.map(function (c) { return new THREE.MeshLambertMaterial({ color: new THREE.Color(c).convertSRGBToLinear(), side: THREE.DoubleSide }); });
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
  function makeCharacter(color, tagText, umbIndex) {
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
    // 얼굴: 볼과 입
    [-0.25, 0.25].forEach(function (x) {
      var ck = part(gCheek, 0xf59aa0, x, 1.36, 0.29, g); ck.scale.set(1, 0.7, 0.5);
    });
    var mouth = part(gMouth, 0x1c2430, 0, 1.36, 0.385, g); mouth.rotation.z = Math.PI;
    // 사원증: 목에 두른 줄이 앞으로 모여 내려오고, 그 끝에 큼직한 카드가 달린다
    var strap = part(gStrap, LANYARD, 0, 1.09, 0.04, g);
    strap.rotation.x = Math.PI / 2 - 0.22;
    var l1 = part(gLan, LANYARD, -0.1, 1.02, 0.4, g); l1.rotation.set(0.5, 0, -0.72);
    var l2 = part(gLan, LANYARD, 0.1, 1.02, 0.4, g); l2.rotation.set(0.5, 0, 0.72);
    part(gClip, 0xc9d0da, 0, 0.94, 0.47, g);
    var badge = new THREE.Group();
    part(gCard, 0xffffff, 0, 0, 0, badge);
    part(gCardTop, LANYARD, 0, 0.155, 0, badge);
    part(gPhoto, 0xffd9a8, -0.08, -0.03, 0, badge);
    part(gLine, 0x8a94a3, 0.08, 0.0, 0, badge); part(gLine, 0xb7bfca, 0.08, -0.06, 0, badge);
    part(gLine, 0xb7bfca, 0, -0.16, 0, badge).scale.x = 2.4;
    badge.position.set(0, 0.71, 0.5); badge.rotation.x = -0.08; g.add(badge);
    // 팔, 발밑 그림자, 우산(평소에는 숨김)
    var arms = [];
    [-0.52, 0.52].forEach(function (x) {
      var a = new THREE.Mesh(gArm, mat(color));
      a.scale.set(1, 1.5, 1); a.position.set(x, 0.78, 0.02); g.add(a); arms.push(a);
    });
    var sh = new THREE.Mesh(gShadow, shadowMat);
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; g.add(sh);
    var umb = new THREE.Group();
    var top = new THREE.Mesh(gUmbTop, umbMats[(umbIndex || 0) % umbMats.length]);
    top.position.set(0.4, 2.62, 0.05); umb.add(top);
    var pole = new THREE.Mesh(gUmbPole, mat(0x4a4f57));
    pole.position.set(0.4, 1.85, 0.05); umb.add(pole);
    umb.visible = false; g.add(umb);
    g.userData.feet = feet; g.userData.arms = arms; g.userData.shadow = sh; g.userData.umb = umb;
    g.userData.skin = [body, head, arms[0], arms[1]]; g.userData.hat = null;
    setTag(g, tagText);
    return g;
  }
  // 치장: 몸 색과 모자. 산 것이 없으면 번호에 따라 정해지는 기본 색을 쓴다.
  var crownMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0xf0c419).convertSRGBToLinear(), side: THREE.DoubleSide });
  function buildHat(key) {
    var g = new THREE.Group(), m;
    function add(geo, color, x, y, z) { m = new THREE.Mesh(geo, mat(color)); m.position.set(x, y, z); g.add(m); return m; }
    if (key === 'h_cap') {
      add(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xd9483b, 0, 1.5, 0);
      add(new THREE.BoxGeometry(0.5, 0.04, 0.34), 0xb83a2f, 0, 1.52, 0.5);
    } else if (key === 'h_beanie') {
      add(new THREE.SphereGeometry(0.43, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x3f6fb5, 0, 1.48, 0);
      add(new THREE.CylinderGeometry(0.44, 0.44, 0.12, 16), 0xe8ecf3, 0, 1.5, 0);
      add(new THREE.SphereGeometry(0.1, 10, 8), 0xe8ecf3, 0, 1.96, 0);
    } else if (key === 'h_party') {
      add(new THREE.ConeGeometry(0.22, 0.55, 14), 0xf2b441, 0, 2.04, 0);
      add(new THREE.SphereGeometry(0.07, 8, 6), 0xd9483b, 0, 2.33, 0);
    } else if (key === 'h_ribbon') {
      add(new THREE.BoxGeometry(0.2, 0.16, 0.08), 0xf06292, 0.14, 1.8, 0.12).rotation.z = 0.5;
      add(new THREE.BoxGeometry(0.2, 0.16, 0.08), 0xf06292, 0.34, 1.72, 0.12).rotation.z = -0.9;
      add(new THREE.SphereGeometry(0.06, 8, 6), 0xd81b60, 0.24, 1.76, 0.14);
    } else if (key === 'h_crown') {
      add(new THREE.CylinderGeometry(0.27, 0.25, 0.18, 14, 1, true), 0xf0c419, 0, 1.86, 0).material = crownMat;
      for (var i = 0; i < 6; i++) add(new THREE.ConeGeometry(0.07, 0.16, 6), 0xf0c419, Math.cos(i * Math.PI / 3) * 0.25, 2.02, Math.sin(i * Math.PI / 3) * 0.25);
      add(new THREE.SphereGeometry(0.05, 8, 6), 0xd9483b, 0, 1.88, 0.27);
    } else return null;
    return g;
  }
  function applyLook(g, id, c, h) {
    var u = g.userData, item = Object.prototype.hasOwnProperty.call(W.COSM, c) ? W.COSM[c] : null;
    var skin = mat(item && item.slot === 'color' ? item.hex : BODY_COLORS[id % BODY_COLORS.length]), i;
    for (i = 0; i < u.skin.length; i++) u.skin[i].material = skin;
    if (u.hatKey === h) return;
    if (u.hat) { g.remove(u.hat); for (i = 0; i < u.hat.children.length; i++) u.hat.children[i].geometry.dispose(); }
    u.hat = Object.prototype.hasOwnProperty.call(W.COSM, h) ? buildHat(h) : null; u.hatKey = h;
    if (u.hat) g.add(u.hat);
  }
  // 걷는 동작과 우산 든 자세
  function pose(g, moving, walk, umbOn, sitting) {
    var u = g.userData, s = moving ? Math.sin(walk) : 0;
    u.feet[0].position.z = sitting ? 0.34 : 0.05 + s * 0.16; u.feet[1].position.z = sitting ? 0.34 : 0.05 - s * 0.16;
    u.feet[0].position.y = u.feet[1].position.y = sitting ? 0.2 : 0.1;
    u.arms[0].position.z = 0.02 - s * 0.15;
    if (umbOn) u.arms[1].position.set(0.44, 1.12, 0.14); else u.arms[1].position.set(0.52, 0.78, 0.02 + s * 0.15);
    u.umb.visible = umbOn;
    u.shadow.position.y = 0.03 - g.position.y; u.shadow.visible = !sitting;
    if (u.tag) u.tag.position.y = umbOn ? 3.05 : 2.25;
    if (u.bubble) u.bubble.position.y = umbOn ? 3.7 : 2.9;
  }
  function tagOf(rank, name) { return '[' + (RANKS[rank] || rank) + '] ' + name; }

  /* ---------- 야외 ---------- */
  var outdoor = new THREE.Group(), lobby = new THREE.Group();
  scene.add(outdoor); scene.add(lobby);

  var env = { trees: [], clouds: [], lampGlows: [], lampPools: [] };   // 시간·날씨에 따라 바뀌는 것들
  (function buildOutdoor() {
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), texMat(grassTex(70, 70)));
    ground.rotation.x = -Math.PI / 2; outdoor.add(ground);
    var path = new THREE.Mesh(new THREE.PlaneGeometry(5, 34), texMat(tileTex('#d9d2c1', '#bdb5a2', 5, 34)));
    path.rotation.x = -Math.PI / 2; path.position.set(0, 0.02, 23); outdoor.add(path);
    var plaza = new THREE.Mesh(new THREE.PlaneGeometry(22, 5), texMat(tileTex('#d9d2c1', '#bdb5a2', 22, 5)));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.02, 8.5); outdoor.add(plaza);

    // 멀리 보이는 언덕 (안개에 섞여 원경이 된다)
    var gHill = new THREE.ConeGeometry(1, 1, 8);
    for (var hI = 0; hI < 14; hI++) {
      var ang = hI / 14 * Math.PI * 2 + 0.3, rad = 82 + (hI % 3) * 7;
      var hill = new THREE.Mesh(gHill, mat(hI % 2 ? 0x6fa27a : 0x7fb087));
      hill.scale.set(20 + (hI % 4) * 5, 10 + (hI % 5) * 3, 20 + (hI % 3) * 6);
      hill.position.set(Math.cos(ang) * rad, hill.scale.y / 2 - 0.5, Math.sin(ang) * rad); outdoor.add(hill);
    }

    // 12층 건물: 창문은 텍스처로 그리고, 밤에는 불 켜진 창만 따로 빛나게 한다
    function facade(cols, lit) {
      var c = document.createElement('canvas'); c.width = 512; c.height = 1024;
      var x = c.getContext('2d'), fh = 1024 / 12, cw = 512 / cols, f, i, wx0, wy0, ww, wh, on;
      x.fillStyle = lit ? '#000000' : '#e6eaf0'; x.fillRect(0, 0, 512, 1024);
      for (f = 0; f < 12; f++) {
        for (i = 0; i < cols; i++) {
          wx0 = i * cw + cw * 0.14; wy0 = f * fh + fh * 0.2; ww = cw * 0.72; wh = fh * 0.6;
          on = (f * 7 + i * 3 + cols) % 5 < 2;
          if (lit) {
            if (on) { x.fillStyle = (f + i) % 3 ? '#ffd98a' : '#fff1c9'; x.fillRect(wx0, wy0, ww, wh); }
            continue;
          }
          x.fillStyle = '#aab3bf'; x.fillRect(wx0 - 3, wy0 - 3, ww + 6, wh + 6);          // 창틀
          var g = x.createLinearGradient(0, wy0, 0, wy0 + wh);
          g.addColorStop(0, '#9cc6e8'); g.addColorStop(1, '#5f93c0');
          x.fillStyle = g; x.fillRect(wx0, wy0, ww, wh);
          x.fillStyle = 'rgba(255,255,255,0.28)'; x.fillRect(wx0 + ww * 0.08, wy0 + 3, ww * 0.18, wh - 6);   // 유리 반사
          if ((f + i * 2) % 4 === 0) { x.fillStyle = 'rgba(240,240,235,0.85)'; x.fillRect(wx0, wy0, ww, wh * 0.35); }  // 블라인드
          x.fillStyle = '#aab3bf'; x.fillRect(wx0 + ww / 2 - 1.5, wy0, 3, wh);
        }
        if (!lit) { x.fillStyle = '#c3cad4'; x.fillRect(0, f * fh, 512, 5); x.fillStyle = '#f4f6f9'; x.fillRect(0, f * fh + 5, 512, 2); }
      }
      var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
    }
    function facadeMat(cols) {
      return new THREE.MeshLambertMaterial({ map: facade(cols, false), emissive: 0xffffff, emissiveMap: facade(cols, true), emissiveIntensity: 0 });
    }
    var wide = facadeMat(6), narrow = facadeMat(4);
    env.windows = [wide, narrow];
    var roof = mat(0xb8c0cc);
    var tower = new THREE.Mesh(new THREE.BoxGeometry(16, 36, 12), [narrow, narrow, roof, roof, wide, wide]);
    tower.position.y = 18; outdoor.add(tower);
    box(16.3, 1.0, 12.3, 0x8d96a3, 0, 0.5, 0, outdoor);                 // 기단
    [[-8, 6], [8, 6], [-8, -6], [8, -6]].forEach(function (p) { box(0.7, 36, 0.7, 0xd3d9e1, p[0], 18, p[1], outdoor); });   // 모서리 기둥
    box(16.6, 0.7, 12.6, 0xc9d0da, 0, 36.35, 0, outdoor);               // 옥상 난간
    box(4, 1.6, 3, 0x9aa3b0, -4, 37.5, -2, outdoor);                    // 옥상 설비
    box(2.2, 1.1, 2.2, 0xaab3bf, 4.5, 37.25, -3, outdoor);
    var ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), mat(0x6b7480));
    ant.position.set(5.5, 39.2, 2); outdoor.add(ant);

    // 정문, 차양, 간판
    box(4.2, 3.6, 0.5, 0x4a5566, 0, 1.8, 6.1, outdoor);
    box(1.45, 3, 0.1, 0x9fd0ee, -0.78, 1.5, 6.38, outdoor);
    box(1.45, 3, 0.1, 0x9fd0ee, 0.78, 1.5, 6.38, outdoor);
    box(0.06, 0.9, 0.08, 0xe8ecf3, -0.14, 1.5, 6.45, outdoor);          // 손잡이
    box(0.06, 0.9, 0.08, 0xe8ecf3, 0.14, 1.5, 6.45, outdoor);
    box(6.2, 0.22, 2.6, 0x3a4352, 0, 3.78, 7.5, outdoor);               // 차양
    box(7.4, 2.2, 0.4, 0x2f6fed, 0, 5.2, 6.25, outdoor);
    var s1 = signPlane('본사', 1.9, { fs: 120, padX: 40, padY: 10 });
    s1.position.set(0, 5.2, 6.47); outdoor.add(s1);
    box(6, 2.4, 0.4, 0x2f6fed, 0, 38.2, 5.6, outdoor);
    var s2 = signPlane('본사', 2, { fs: 120, padX: 40, padY: 10 });
    s2.position.set(0, 38.2, 5.82); outdoor.add(s2);
    var enter = labelSprite('입구', 0.5, { bg: 'rgba(47,111,237,0.92)', fs: 44 });
    enter.position.set(0, 4.25, 8.85); outdoor.add(enter);
    // 건물 앞 화단 (건물 충돌 영역 안쪽이라 지나갈 수 없다)
    var gBush = new THREE.IcosahedronGeometry(0.55, 1);
    [-5.6, 5.6].forEach(function (px) {
      box(4.6, 0.5, 0.5, 0x8a6a4a, px, 0.25, 6.28, outdoor);
      for (var k = 0; k < 5; k++) {
        var bsh = new THREE.Mesh(gBush, mat(k % 2 ? 0x4c9a55 : 0x5fb062));
        bsh.scale.set(1, 0.8, 0.7); bsh.position.set(px - 1.8 + k * 0.9, 0.7, 6.3); outdoor.add(bsh);
      }
    });

    // 작은 가게 (배경 장식, 입장 불가)
    function stripes(col) {
      return patternTexture(64, function (x, n) {
        x.fillStyle = '#ffffff'; x.fillRect(0, 0, n, n);
        x.fillStyle = '#' + ('000000' + col.toString(16)).slice(-6); x.fillRect(0, 0, n / 2, n);
      }, 6, 1);
    }
    W.SHOPS.forEach(function (s) {
      var x = s[0], z = W.SHOP_Z;
      box(6, 3.4, 5, s[2], x, 1.7, z, outdoor);
      box(6.4, 0.3, 5.4, 0x6b7480, x, 3.55, z, outdoor);                // 지붕
      box(6.1, 0.5, 5.1, 0x7d6a58, x, 0.25, z, outdoor);                // 바닥 단
      var aw = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.12, 1.8), texMat(stripes(s[3])));
      aw.position.set(x, 3.0, z + 3.15); aw.rotation.x = 0.32; outdoor.add(aw);
      box(1.2, 2.2, 0.1, 0x5b4636, x - 1.6, 1.1, z + 2.52, outdoor);
      box(0.08, 0.3, 0.08, 0xe8d9a8, x - 1.2, 1.1, z + 2.6, outdoor);
      box(2.6, 1.5, 0.08, 0x5b4636, x + 1.2, 1.7, z + 2.5, outdoor);    // 창틀
      box(2.4, 1.3, 0.1, 0xbfe3f5, x + 1.2, 1.7, z + 2.52, outdoor);
      var sg = signPlane(s[1], 0.8, { fs: 72, bg: '#ffffff', color: '#1c2430', radius: 14 });
      sg.position.set(x, 4.3, z + 2.3); outdoor.add(sg);
    });

    // 나무: 잎 덩어리 여러 개를 겹치고, 바람에 흔들리도록 잎 부분만 따로 묶는다
    var gTrunk = new THREE.CylinderGeometry(0.16, 0.34, 2.4, 8);
    var gLeaf = new THREE.IcosahedronGeometry(1, 1);
    var gCone = new THREE.ConeGeometry(1, 1, 9);
    var GREENS = [0x4c9a55, 0x5fb062, 0x3f8a4f, 0x6cbb6a];
    W.TREES.forEach(function (p, i) {
      var tree = new THREE.Group(), crown = new THREE.Group(), s = 0.9 + (i % 4) * 0.12;
      tree.position.set(p[0], 0, p[1]); tree.rotation.y = i * 1.7;
      var t = new THREE.Mesh(gTrunk, mat(i % 2 ? 0x7a5a3c : 0x6b4c33)); t.position.y = 1.2; tree.add(t);
      crown.position.y = 2.0;
      if (i % 4 === 3) {                                                 // 침엽수
        [[1.5, 1.9, 0.9], [1.2, 1.7, 1.9], [0.85, 1.5, 2.8]].forEach(function (c, k) {
          var m = new THREE.Mesh(gCone, mat(k % 2 ? 0x3f8a4f : 0x357a45));
          m.scale.set(c[0] * s, c[1] * s, c[0] * s); m.position.y = c[2] * s; crown.add(m);
        });
      } else {
        [[0, 1.0, 0, 1.3], [0.75, 0.55, 0.3, 0.95], [-0.65, 0.6, -0.35, 1.0], [0.1, 0.5, -0.75, 0.85], [-0.15, 1.75, 0.15, 0.8]]
          .forEach(function (c, k) {
            var m = new THREE.Mesh(gLeaf, mat(GREENS[(i + k) % GREENS.length]));
            m.scale.set(c[3] * s, c[3] * s * 0.9, c[3] * s); m.position.set(c[0] * s, c[1] * s, c[2] * s);
            m.rotation.set(k, i, k * 2); crown.add(m);
          });
      }
      tree.add(crown); outdoor.add(tree);
      env.trees.push({ crown: crown, ph: i * 1.37, yaw: tree.rotation.y });
    });

    // 가로등: 밤이나 날이 어두우면 켜진다
    var glowTex = (function () {
      var c = document.createElement('canvas'); c.width = c.height = 64;
      var x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,236,170,1)'); g.addColorStop(0.35, 'rgba(255,220,130,0.45)'); g.addColorStop(1, 'rgba(255,210,110,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    env.lampMat = new THREE.MeshBasicMaterial({ color: 0x9aa3b0 });
    var gPole = new THREE.CylinderGeometry(0.07, 0.1, 3.8, 8), gBulb = new THREE.SphereGeometry(0.24, 12, 10);
    W.LAMPS.forEach(function (l) {
      var dir = l[0] < 0 ? 1 : -1;
      var pole = new THREE.Mesh(gPole, mat(0x39424f)); pole.position.set(l[0], 1.9, l[1]); outdoor.add(pole);
      box(0.9, 0.08, 0.08, 0x39424f, l[0] + dir * 0.4, 3.78, l[1], outdoor);
      var bulb = new THREE.Mesh(gBulb, env.lampMat); bulb.position.set(l[0] + dir * 0.8, 3.62, l[1]); outdoor.add(bulb);
      var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      glow.scale.set(2.6, 2.6, 1); glow.position.copy(bulb.position); outdoor.add(glow); env.lampGlows.push(glow);
      var pool = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24),
        new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(l[0] + dir * 0.8, 0.05, l[1]); outdoor.add(pool); env.lampPools.push(pool);
    });

    // 깃발: 바람 세기와 방향대로 펄럭인다 (꼭짓점을 매 프레임 직접 움직인다)
    var fp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 7, 8), mat(0xc9d0da));
    fp.position.set(W.FLAG[0], 3.5, W.FLAG[1]); outdoor.add(fp);
    var FN = 9, fpos = new Float32Array(FN * 2 * 3), fidx = [];
    for (var q = 0; q < FN - 1; q++) fidx.push(q * 2, q * 2 + 1, q * 2 + 2, q * 2 + 1, q * 2 + 3, q * 2 + 2);
    var fgeo = new THREE.BufferGeometry(), fattr = new THREE.BufferAttribute(fpos, 3);
    fgeo.setAttribute('position', fattr); fgeo.setIndex(fidx);
    env.flagMat = new THREE.MeshBasicMaterial({ color: 0x2f6fed, side: THREE.DoubleSide });
    var flag = new THREE.Mesh(fgeo, env.flagMat); flag.frustumCulled = false; outdoor.add(flag);
    env.flag = { n: FN, pos: fpos, attr: fattr };

    // 구름: 바람 방향으로 흘러가고, 구름양에 따라 개수가 달라진다
    env.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, fog: false });
    var gPuff = new THREE.SphereGeometry(1, 12, 9);
    for (var ci = 0; ci < 16; ci++) {
      var cl = new THREE.Group(), n = 4 + (ci % 3);
      for (var k2 = 0; k2 < n; k2++) {
        var puff = new THREE.Mesh(gPuff, env.cloudMat), ps = 3 + rnd() * 3.5;
        puff.scale.set(ps * 1.5, ps * 0.6, ps); puff.position.set((k2 - n / 2) * 4 + rnd() * 2, rnd() * 1.5, rnd() * 4 - 2);
        cl.add(puff);
      }
      cl.position.set(rnd() * 260 - 130, 46 + rnd() * 16, rnd() * 260 - 130);
      outdoor.add(cl);
      env.clouds.push({ g: cl, s: 0, speed: 0.7 + rnd() * 0.6 });
    }

    // 해, 달, 별 (카메라를 따라다녀 항상 하늘 멀리에 보인다)
    function orb(r, color) {
      var m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: color, fog: false, transparent: true, depthWrite: false }));
      m.frustumCulled = false; outdoor.add(m); return m;
    }
    env.sunOrb = orb(9, 0xfff3c4); env.moonOrb = orb(6, 0xe9eefc);
    var SN = 260, spos = new Float32Array(SN * 3);
    for (var si = 0; si < SN; si++) {
      var th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 0.95 + 0.03);    // 위쪽 반구
      spos[si * 3] = Math.sin(ph) * Math.cos(th) * 190; spos[si * 3 + 1] = Math.cos(ph) * 190; spos[si * 3 + 2] = Math.sin(ph) * Math.sin(th) * 190;
    }
    var sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    env.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false });
    env.stars = new THREE.Points(sgeo, env.starMat); env.stars.frustumCulled = false; outdoor.add(env.stars);
  })();

  /* ---------- 비, 눈, 날리는 잎 (내 주변에만 그려서 가볍다) ---------- */
  var SMALL = Math.min(window.innerWidth, window.innerHeight) < 700;
  function particles(n, lines, material) {
    var per = lines ? 2 : 1, pos = new Float32Array(n * per * 3), st = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { st[i * 3] = Math.random() * 36 - 18; st[i * 3 + 1] = Math.random() * 22; st[i * 3 + 2] = Math.random() * 36 - 18; }
    var geo = new THREE.BufferGeometry(), attr = new THREE.BufferAttribute(pos, 3);
    geo.setAttribute('position', attr);
    var obj = lines ? new THREE.LineSegments(geo, material) : new THREE.Points(geo, material);
    obj.frustumCulled = false; obj.visible = false; scene.add(obj);
    return { n: n, pos: pos, st: st, attr: attr, geo: geo, obj: obj };
  }
  var rain = particles(SMALL ? 450 : 900, true, new THREE.LineBasicMaterial({ color: 0xc4d6e6, transparent: true, opacity: 0.55, fog: false }));
  var snow = particles(SMALL ? 350 : 700, false, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
  var leaves = particles(40, false, new THREE.PointsMaterial({ color: 0xd9a441, size: 0.2, transparent: true, opacity: 0, depthWrite: false }));

  /* ---------- 1층 로비 ---------- */
  var npcs = [];
  (function buildLobby() {
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(LW, LD), texMat(tileTex('#e6dccb', '#cfc4b0', LW / 2, LD / 2)));
    floor.rotation.x = -Math.PI / 2; lobby.add(floor);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(LW, LD), mat(0xf7f7f4));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = LH; lobby.add(ceil);
    box(LW, LH, 0.3, 0xf3efe6, 0, LH / 2, -LD / 2 - 0.15, lobby);
    box(LW, LH, 0.3, 0xf3efe6, 0, LH / 2, LD / 2 + 0.15, lobby);
    box(0.3, LH, LD, 0xece6da, -LW / 2 - 0.15, LH / 2, 0, lobby);
    box(0.3, LH, LD, 0xece6da, LW / 2 + 0.15, LH / 2, 0, lobby);
    // 걸레받이, 천장 조명판
    box(LW, 0.25, 0.08, 0x8a7a66, 0, 0.125, -LD / 2 + 0.04, lobby);
    box(LW, 0.25, 0.08, 0x8a7a66, 0, 0.125, LD / 2 - 0.04, lobby);
    box(0.08, 0.25, LD, 0x8a7a66, -LW / 2 + 0.04, 0.125, 0, lobby);
    box(0.08, 0.25, LD, 0x8a7a66, LW / 2 - 0.04, 0.125, 0, lobby);
    var lightMat = new THREE.MeshBasicMaterial({ color: 0xfffbea });
    [[-6, -4], [6, -4], [-6, 4], [6, 4], [0, 0]].forEach(function (p) {
      var lp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 1.2), lightMat);
      lp.position.set(p[0], LH - 0.05, p[1]); lobby.add(lp);
    });
    // 벽시계: 실제 대한민국 시각을 보여 준다
    var cc = document.createElement('canvas'); cc.width = 256; cc.height = 128;
    env.clockCtx = cc.getContext('2d'); env.clockTex = new THREE.CanvasTexture(cc); env.clockMin = -1;
    var clock = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: env.clockTex }));
    clock.rotation.y = -Math.PI / 2; clock.position.set(LW / 2 - 0.05, 4.1, 0); lobby.add(clock);
    var rug = new THREE.Mesh(new THREE.PlaneGeometry(5, 9), mat(0x2f6fed));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.02, 3.2); lobby.add(rug);

    // 큰 간판
    box(9, 2.6, 0.2, 0x2f6fed, 0, 4.2, -LD / 2 + 0.1, lobby);
    var big = signPlane('본사', 2.2, { fs: 140, padX: 50, padY: 10 });
    big.position.set(0, 4.2, -LD / 2 + 0.22); lobby.add(big);

    // 안내 데스크와 NPC 2명
    box(7, 1.1, 1.2, 0x8a6a4a, 0, 0.55, -3, lobby);
    box(7.3, 0.12, 1.5, 0xf7f7f4, 0, 1.16, -3, lobby);
    box(6.6, 0.7, 0.06, 0x6f543a, 0, 0.6, -2.38, lobby);                // 데스크 앞판
    [-1.5, 1.5].forEach(function (mx) {                                  // 모니터
      box(0.7, 0.45, 0.05, 0x1c2430, mx, 1.55, -3.2, lobby); box(0.08, 0.2, 0.08, 0x39424f, mx, 1.3, -3.2, lobby);
    });
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
    var gPot = new THREE.CylinderGeometry(0.4, 0.3, 0.7, 12), gPlant = new THREE.IcosahedronGeometry(0.75, 1);
    W.PLANTS.forEach(function (p) {
      var pot = new THREE.Mesh(gPot, mat(0xc98b5e)); pot.position.set(p[0], 0.35, p[1]); lobby.add(pot);
      var pl = new THREE.Mesh(gPlant, mat(0x4c9a55)); pl.scale.y = 1.4; pl.position.set(p[0], 1.5, p[1]); lobby.add(pl);
    });
  })();
  lobby.visible = false;

  /* ---------- 2~11층 사무실, 12층 사장실 (방 크기와 엘리베이터 위치는 로비와 같다) ---------- */
  var office = new THREE.Group(), ceo = new THREE.Group();
  scene.add(office); scene.add(ceo);
  office.visible = false; ceo.visible = false;
  var roomLight = new THREE.MeshBasicMaterial({ color: 0xfffbea });
  var roomTops = [];                                   // 꾸미기 모드에서 위에서 내려다볼 때 숨길 것들 (천장, 조명)
  function roomShell(g, floorMat, wall, wall2) {
    var fl = new THREE.Mesh(new THREE.PlaneGeometry(LW, LD), floorMat);
    fl.rotation.x = -Math.PI / 2; g.add(fl);
    var ce = new THREE.Mesh(new THREE.PlaneGeometry(LW, LD), mat(0xf7f7f4));
    ce.rotation.x = Math.PI / 2; ce.position.y = LH; g.add(ce); roomTops.push(ce);
    box(LW, LH, 0.3, wall, 0, LH / 2, -LD / 2 - 0.15, g);
    box(LW, LH, 0.3, wall, 0, LH / 2, LD / 2 + 0.15, g);
    box(0.3, LH, LD, wall2, -LW / 2 - 0.15, LH / 2, 0, g);
    box(0.3, LH, LD, wall2, LW / 2 + 0.15, LH / 2, 0, g);
    box(LW, 0.25, 0.08, 0x6f6a62, 0, 0.125, -LD / 2 + 0.04, g);
    box(LW, 0.25, 0.08, 0x6f6a62, 0, 0.125, LD / 2 - 0.04, g);
    box(0.08, 0.25, LD, 0x6f6a62, -LW / 2 + 0.04, 0.125, 0, g);
    box(0.08, 0.25, LD, 0x6f6a62, LW / 2 - 0.04, 0.125, 0, g);
    [[-6, -4], [6, -4], [-6, 4], [6, 4], [0, 0]].forEach(function (p) {
      var lp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 1.2), roomLight);
      lp.position.set(p[0], LH - 0.05, p[1]); g.add(lp); roomTops.push(lp);
    });
    // 엘리베이터 문
    var ex = W.ELEV.x, ez = -LD / 2 + 0.12;
    box(3.2, 3.7, 0.24, 0x596375, ex, 1.85, ez, g);
    box(1.35, 3.2, 0.1, 0xc9d0da, ex - 0.7, 1.6, ez + 0.14, g);
    box(1.35, 3.2, 0.1, 0xc9d0da, ex + 0.7, 1.6, ez + 0.14, g);
    var el = signPlane('엘리베이터', 0.45, { fs: 56, bg: '#1c2430', radius: 12 });
    el.position.set(ex, 4.15, ez + 0.14); g.add(el);
    // 층 안내판 (등록, 층 이름, 12층 비밀번호)
    var kx = W.KIOSK[0], kz = W.KIOSK[1];
    box(0.8, 1.05, 0.5, 0x39424f, kx, 0.525, kz, g);
    var scr = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.04), new THREE.MeshBasicMaterial({ color: 0x9fe0ff }));
    scr.position.set(kx, 1.3, kz + 0.12); scr.rotation.x = -0.5; g.add(scr);
    var kl = labelSprite('층 안내판', 0.42, { bg: 'rgba(20,28,40,0.78)', fs: 44 });
    kl.position.set(kx, 2.1, kz); g.add(kl);
    // 창문 (동쪽, 서쪽 벽)
    [-LW / 2 + 0.03, LW / 2 - 0.03].forEach(function (wx0) {
      [-5, 0, 5].forEach(function (wz) {
        box(0.06, 2.2, 3.4, 0x8d96a3, wx0, 3.1, wz, g);
        box(0.08, 2.0, 3.2, 0xbfe3f5, wx0, 3.1, wz, g);
      });
    });
  }
  (function buildOffice() {
    roomShell(office, texMat(tileTex('#8fa3b8', '#7d90a5', LW / 2, LD / 2)), 0xf1f3f6, 0xe6eaef);
    // 층 게시판 자리 (북쪽 벽 왼쪽). 글쓰기는 5단계에서.
    box(4.6, 2.6, 0.12, 0x6b4f37, -6.5, 2.6, -LD / 2 + 0.08, office);
    box(4.2, 2.2, 0.06, 0xd9b98a, -6.5, 2.6, -LD / 2 + 0.15, office);
    var bl = signPlane('층 게시판', 0.45, { fs: 56, bg: '#1c2430', radius: 12 });
    bl.position.set(-6.5, 4.25, -LD / 2 + 0.16); office.add(bl);
  })();
  (function buildCeo() {
    roomShell(ceo, texMat(tileTex('#b98d5e', '#a57b4f', LW / 3, LD / 3)), 0xefe7da, 0xe5dccd);
    var rug = new THREE.Mesh(new THREE.PlaneGeometry(7, 8), mat(0x8c2f3c));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.02, 1.2); ceo.add(rug);
    box(4.2, 0.95, 1.4, 0x5b3d27, 0, 0.475, -3.6, ceo);                 // 사장 책상
    box(4.5, 0.1, 1.7, 0x3d281a, 0, 1.0, -3.6, ceo);
    box(0.9, 0.55, 0.05, 0x1c2430, 0.9, 1.45, -3.8, ceo); box(0.08, 0.2, 0.08, 0x39424f, 0.9, 1.15, -3.8, ceo);
    box(0.5, 0.18, 0.12, 0xd4af37, -1.1, 1.14, -3.1, ceo);              // 명패
    box(1.0, 0.5, 1.0, 0x2a2f38, 0, 0.45, -5.3, ceo); box(1.0, 1.5, 0.2, 0x2a2f38, 0, 1.2, -5.75, ceo);   // 의자
    box(0.7, 4.2, 5, 0x5b3d27, -11.55, 2.1, -3, ceo);                   // 책장
    [0.8, 1.9, 3.0].forEach(function (y, r) {
      [0x2f6fed, 0xc0392b, 0x2f8f6f, 0xd4af37, 0x6b4f9a, 0x39424f].forEach(function (col, k) {
        box(0.32, 0.8, 0.5, col, -11.3, y + 0.25, -5 + k * 0.72 + r * 0.1, ceo);
      });
    });
    var sofa = new THREE.Group();
    box(3, 0.55, 1.1, 0x4a3b34, 0, 0.3, 0, sofa); box(3, 0.9, 0.3, 0x3d302a, 0, 0.75, -0.42, sofa);
    sofa.position.set(-7.5, 0, 4.5); sofa.rotation.y = Math.PI / 2; ceo.add(sofa);
    box(1.6, 0.5, 1.6, 0x3d281a, -5.2, 0.25, 4.5, ceo);
    var gPot = new THREE.CylinderGeometry(0.4, 0.3, 0.7, 12), gPlant = new THREE.IcosahedronGeometry(0.75, 1);
    [[10.8, 7.8], [-10.8, 7.8]].forEach(function (p) {
      var pot = new THREE.Mesh(gPot, mat(0xc98b5e)); pot.position.set(p[0], 0.35, p[1]); ceo.add(pot);
      var pl = new THREE.Mesh(gPlant, mat(0x4c9a55)); pl.scale.y = 1.4; pl.position.set(p[0], 1.5, p[1]); ceo.add(pl);
    });
  })();
  /* ---------- 꾸미기 가구 (모양만 여기서 만들고, 놓을 수 있는지는 world.js 규칙으로 서버가 판정) ---------- */
  var furnGroup = new THREE.Group(); scene.add(furnGroup);
  var furnItems = {}, furnCols = [];
  var shadeMat = new THREE.MeshBasicMaterial({ color: 0xffe7a8 });
  function buildFurn(type) {
    var g = new THREE.Group(), m;
    function cyl(rt, rb, hh, color, x, y, z, seg) {
      var c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, hh, seg || 12), mat(color)); c.position.set(x, y, z); g.add(c); return c;
    }
    if (type === 'desk') {
      box(1.9, 0.08, 0.9, 0xc9a26b, 0, 0.76, 0, g); box(0.08, 0.72, 0.85, 0xb38a55, -0.88, 0.36, 0, g);
      box(0.08, 0.72, 0.85, 0xb38a55, 0.88, 0.36, 0, g); box(1.7, 0.45, 0.05, 0xb38a55, 0, 0.47, -0.4, g);
      box(0.6, 0.4, 0.04, 0x1c2430, 0.35, 1.08, -0.2, g); box(0.06, 0.12, 0.06, 0x39424f, 0.35, 0.86, -0.2, g);
    } else if (type === 'chair') {
      box(0.62, 0.1, 0.62, 0x4c6893, 0, 0.5, 0.02, g); box(0.62, 0.62, 0.1, 0x3f5a82, 0, 0.86, -0.27, g);
      cyl(0.05, 0.05, 0.45, 0x39424f, 0, 0.23, 0); cyl(0.3, 0.3, 0.05, 0x39424f, 0, 0.03, 0);
    } else if (type === 'sofa') {
      box(1.9, 0.45, 0.86, 0x5c7aa8, 0, 0.25, 0.04, g); box(1.9, 0.55, 0.24, 0x4c6893, 0, 0.72, -0.34, g);
      box(0.2, 0.62, 0.86, 0x4c6893, -0.86, 0.45, 0.04, g); box(0.2, 0.62, 0.86, 0x4c6893, 0.86, 0.45, 0.04, g);
    } else if (type === 'table') {
      cyl(0.46, 0.46, 0.07, 0xf1ece2, 0, 0.52, 0, 18); cyl(0.06, 0.06, 0.5, 0x8a94a3, 0, 0.26, 0); cyl(0.26, 0.26, 0.04, 0x8a94a3, 0, 0.02, 0);
    } else if (type === 'shelf') {
      box(1.9, 2.0, 0.5, 0x7a5a3c, 0, 1.0, -0.2, g);
      [0.35, 0.95, 1.55].forEach(function (y, r) {
        box(1.7, 0.45, 0.06, 0x5b4129, 0, y + 0.05, 0.03, g);
        [0x2f6fed, 0xc0392b, 0x2f8f6f, 0xd4af37, 0x6b4f9a].forEach(function (col, k) { box(0.22, 0.4, 0.1, col, -0.6 + k * 0.3 + r * 0.04, y + 0.03, 0.08, g); });
      });
    } else if (type === 'plant') {
      cyl(0.3, 0.22, 0.5, 0xc98b5e, 0, 0.25, 0);
      m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), mat(0x4c9a55)); m.scale.y = 1.35; m.position.y = 1.05; g.add(m);
    } else if (type === 'lamp') {
      cyl(0.22, 0.25, 0.06, 0x39424f, 0, 0.03, 0); cyl(0.03, 0.03, 1.5, 0x39424f, 0, 0.78, 0, 8);
      m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 0.36, 14, 1, true), shadeMat); m.position.y = 1.62; g.add(m);
    } else if (type === 'wall') {
      box(1.96, 1.5, 0.12, 0xaab3bf, 0, 0.75, 0, g); box(1.96, 0.08, 0.16, 0x6b7480, 0, 1.52, 0, g); box(1.96, 0.1, 0.16, 0x6b7480, 0, 0.05, 0, g);
    } else {                                                             // 러그
      box(2.9, 0.03, 1.9, 0xb5524a, 0, 0.02, 0, g); box(2.5, 0.035, 1.5, 0xd98a6e, 0, 0.022, 0, g);
    }
    return g;
  }
  function dropFurn(it) {
    furnGroup.remove(it.g);
    for (var i = 0; i < it.g.children.length; i++) if (it.g.children[i].geometry) it.g.children[i].geometry.dispose();
  }
  function placeFurn(it) { it.g.position.set(it.x, 0, it.z); it.g.rotation.y = it.rot * Math.PI / 2; }
  function rebuildFurnCols() {
    furnCols = [];
    for (var id in furnItems) if (W.FURN[furnItems[id].type].solid) furnCols.push(W.furnRect(furnItems[id]));
  }
  function addFurn(a) {
    if (!Array.isArray(a) || !Object.prototype.hasOwnProperty.call(W.FURN, a[1])) return;
    var it = furnItems[a[0]];
    if (!it) { it = furnItems[a[0]] = { id: a[0], type: a[1], g: buildFurn(a[1]) }; furnGroup.add(it.g); }
    it.x = Number(a[2]); it.z = Number(a[3]); it.rot = Number(a[4]) & 3;
    placeFurn(it);
  }
  function setFurn(list) {
    for (var id in furnItems) dropFurn(furnItems[id]);
    furnItems = {};
    if (Array.isArray(list)) list.forEach(addFurn);
    rebuildFurnCols();
  }

  // 지금 있는 층의 번호와 이름을 북쪽 벽에 크게 붙인다 (층을 옮기거나 이름이 바뀌면 다시 만든다)
  var floorSign = null;
  function dropPlane(m) {
    if (!m) return;
    if (m.parent) m.parent.remove(m);
    m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose();
  }
  var floors = {}, me = { r: 'intern', floor: null };
  function floorLabel(n) {
    if (n === 1) return '1층 로비';
    var f = floors[n], name = f && f.name ? f.name : (n === 12 ? '사장실' : '');
    return n + '층' + (name ? ' · ' + name : '');
  }
  function refreshFloorSign() {
    dropPlane(floorSign); floorSign = null;
    var n = W.floorOf(area);
    if (n < 2) return;
    floorSign = signPlane(floorLabel(n), 1.3, { fs: 110, padX: 44, padY: 14, bg: n === 12 ? '#3d281a' : '#2f6fed', radius: 20 });
    floorSign.position.set(0, 4.2, -LD / 2 + 0.05);
    (n === 12 ? ceo : office).add(floorSign);
  }

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
    var g = makeCharacter(BODY_COLORS[p.id % BODY_COLORS.length], tagOf(p.r, p.n), p.id);
    applyLook(g, p.id, p.c, p.h);
    g.position.set(p.x, 0, p.z); g.rotation.y = p.f;
    scene.add(g);
    others[p.id] = { g: g, x: p.x, z: p.z, f: p.f, walk: 0, umb: !!p.u, n: p.n, r: p.r, sit: !!p.s };
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
    outdoor.visible = next === 'out'; lobby.visible = next === 'in';
    ceo.visible = next === 'f12'; office.visible = !outdoor.visible && !lobby.visible && !ceo.visible;
    furnGroup.visible = ceo.visible || office.visible;
    P.x = x; P.z = z;
    refreshPlace();
  }
  function refreshPlace() {
    var n = W.floorOf(area), t = n ? floorLabel(n) : '야외';
    if ($('place').textContent !== t) $('place').textContent = t;
    refreshFloorSign();
  }
  function switchArea(next, x, z, list, face, pins, furn) {
    lockUntil = performance.now() + 700;
    $('fade').classList.add('on');
    setTimeout(function () {
      closeElev(); closeFinfo(); closeRoster(); closeProf(); closeBoard(); closeMenu(); closeDeco(); closeShop(); closeEvents();
      mySit = false;
      applyArea(next, x, z);
      setPapers(pins); setFurn(furn);
      P.face = typeof face === 'number' ? face : (next === 'in' ? Math.PI : 0);
      cam.yaw = next === 'out' ? Math.PI : 0; cam.pitch = next === 'out' ? 0.42 : 0.36;
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
  /* ---------- 게시판 (글은 항상 textContent 로만 넣는다) ----------
     전체 게시판(1)과 내가 등록한 층 게시판은 메뉴에서 어디서나 열 수 있고, 다른 층 게시판은 그 층에 가서 연다. */
  function pad2(v) { return (v < 10 ? '0' : '') + v; }
  function kstStamp(ms) {
    var d = new Date(ms + 9 * 3600000);
    return pad2(d.getUTCMonth() + 1) + '.' + pad2(d.getUTCDate()) + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
  }
  var curBoard = 0, editId = 0, postCache = {}, delArmed = 0;
  function boardOpen() { return $('board').style.display === 'flex'; }
  function setEdit(id) {
    editId = id || 0;
    var p = editId ? postCache[editId] : null;
    $('bT').value = p ? p[1] : ''; $('bB').value = p ? p[2] : '';
    $('bSubmit').textContent = editId ? '수정 저장' : '글 올리기';
    $('bCancel').style.display = editId ? '' : 'none';
    $('bPinRow').style.display = editId ? 'none' : 'flex';
    $('bPin').checked = false;
  }
  function renderPosts(m) {
    if (!boardOpen() || !Array.isArray(m.list) || m.b !== curBoard) return;
    var pinned = m.list.filter(function (p) { return p[7]; }).length;
    $('bForm').style.display = (m.w || editId) ? 'block' : 'none';
    $('bNote').textContent = (m.b === 1 ? '누구나 읽고, 글은 사장과 부장이 씁니다.' : '누구나 읽고, 글은 이 층에 등록한 사원이 씁니다.')
      + ' 고정한 글은 게시판에 종이로 붙습니다 (' + pinned + '/' + m.cap + ').';
    var box0 = $('posts');
    while (box0.firstChild) box0.removeChild(box0.firstChild);
    postCache = {}; delArmed = 0;
    if (!m.list.length) {
      var e0 = document.createElement('div'); e0.className = 'post';
      var eb = document.createElement('div'); eb.className = 'b'; eb.textContent = '아직 글이 없습니다.'; e0.appendChild(eb);
      box0.appendChild(e0); return;
    }
    m.list.forEach(function (p) {
      postCache[p[0]] = p;
      var d = document.createElement('div'); d.className = p[7] ? 'post pin' : 'post';
      [['t', String(p[1])], ['m', '글쓴이 ' + tagOf(p[4], String(p[3])) + ' · ' + kstStamp(Number(p[5])) + (p[9] ? ' · 수정됨' : '')], ['b', String(p[2])]].forEach(function (k) {
        var e = document.createElement('div'); e.className = k[0]; e.textContent = k[1]; d.appendChild(e);
      });
      var acts = document.createElement('div'); acts.className = 'acts';
      function btn(label, act, cls) {
        var x = document.createElement('button'); x.type = 'button'; x.textContent = label;
        x.setAttribute('data-act', act); x.setAttribute('data-id', p[0]); if (cls) x.className = cls; acts.appendChild(x);
      }
      if (p[7] ? p[8] : p[6]) btn(p[7] ? '고정 해제' : '고정', p[7] ? 'unpin' : 'pin');
      if (p[6]) { btn('수정', 'edit'); btn('삭제', 'del', 'del'); }
      if (acts.firstChild) d.appendChild(acts);
      box0.appendChild(d);
    });
  }
  function openBoard(b) {
    var n = b || W.floorOf(area);
    if (!n || n > W.FLOOR_REG_MAX) return;
    closeMenu();
    curBoard = n; uiOpen = true;
    $('bTitle').textContent = n === 1 ? '전체 게시판' : floorLabel(n) + ' 게시판';
    $('bNote').textContent = '불러오는 중…'; $('bForm').style.display = 'none'; setEdit(0);
    while ($('posts').firstChild) $('posts').removeChild($('posts').firstChild);
    $('board').style.display = 'flex';
    sendMsg({ t: 'posts', b: n });
  }
  $('bForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = $('bT').value.trim(), b = $('bB').value.trim();
    if (!t || !b) { toast('제목과 내용을 모두 써 주세요.'); return; }
    if (editId) sendMsg({ t: 'editpost', id: editId, title: t, body: b });
    else sendMsg({ t: 'post', b: curBoard, title: t, body: b, pin: $('bPin').checked });
  });
  $('bCancel').addEventListener('click', function () { setEdit(0); sendMsg({ t: 'posts', b: curBoard }); });
  $('posts').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    var id = Number(b.getAttribute('data-id')), act = b.getAttribute('data-act');
    if (act === 'pin') sendMsg({ t: 'pin', id: id, on: true });
    else if (act === 'unpin') sendMsg({ t: 'pin', id: id, on: false });
    else if (act === 'edit') { setEdit(id); $('bForm').style.display = 'block'; $('bT').focus(); }
    else if (act === 'del') {
      if (delArmed !== id) { delArmed = id; b.textContent = '한 번 더 누르면 지워집니다'; return; }   // 실수로 지우지 않게 두 번 눌러야 한다
      delArmed = 0; sendMsg({ t: 'delpost', id: id });
    }
  });
  function closeBoard() { if (!boardOpen()) return; $('board').style.display = 'none'; curBoard = 0; editId = 0; uiOpen = false; }

  // 게시판에 붙는 종이: 고정한 글의 제목과 글쓴이. 로비는 10장(5칸 2줄), 층은 5장.
  var papers = [];
  function paperTexture(title, who) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 288;
    var x = c.getContext('2d');
    x.fillStyle = '#fffdf2'; x.fillRect(0, 0, 256, 288);
    x.fillStyle = '#f1ead2'; x.fillRect(0, 240, 256, 48);
    x.fillStyle = '#d9483b'; x.beginPath(); x.arc(128, 22, 11, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1c2430'; x.font = '700 34px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
    var lines = [], line = '', i, ch;
    for (i = 0; i < title.length && lines.length < 4; i++) {            // 글자 단위로 줄바꿈
      ch = title.charAt(i);
      if (x.measureText(line + ch).width > 220) { lines.push(line); line = ch; } else line += ch;
    }
    if (line && lines.length < 4) lines.push(line);
    if (i < title.length || lines.length === 4 && x.measureText(lines[3]).width > 220) lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1) + '…';
    var y0 = 136 - (lines.length - 1) * 21;
    lines.forEach(function (l, k) { x.fillText(l, 128, y0 + k * 42); });
    x.fillStyle = '#5b6676'; x.font = '400 24px ' + FONT; x.fillText(who, 128, 264);
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function setPapers(list) {
    papers.forEach(dropPlane); papers = [];
    var n = W.floorOf(area);
    if (!Array.isArray(list) || n < 1 || n > W.FLOOR_REG_MAX) return;
    list.slice(0, n === 1 ? 10 : 5).forEach(function (p, i) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.81), new THREE.MeshBasicMaterial({ map: paperTexture(String(p[1]), String(p[2])) }));
      if (n === 1) {                                                     // 로비: 서쪽 벽
        m.rotation.y = Math.PI / 2;
        m.position.set(-LW / 2 + 0.2, i < 5 ? 2.85 : 1.85, -1.64 + (i % 5) * 0.82);
        m.rotation.z = ((i * 7) % 5 - 2) * 0.02; lobby.add(m);
      } else {                                                           // 층: 북쪽 벽 왼쪽
        m.position.set(-8.14 + i * 0.82, 2.6, -LD / 2 + 0.2);
        m.rotation.z = ((i * 7) % 5 - 2) * 0.02; office.add(m);
      }
      papers.push(m);
    });
  }

  /* ---------- 메뉴: 프로필, 명부, 게시판, 꾸미기, 설정, 로그아웃을 한곳에 ---------- */
  var quality = 'high';
  try { if (localStorage.getItem('bonsa_quality') === 'low') quality = 'low'; } catch (e) {}
  function applyQuality() { renderer.setPixelRatio(quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2)); resize(); }
  function renderMenu() {
    $('mnWho').textContent = tagOf(me.r, me.n || '') + (me.floor ? ' · ' + floorLabel(me.floor) + ' 등록' : ' · 등록한 층 없음') + ' · ' + moneyText();
    $('mnBoardF').style.display = me.floor ? '' : 'none';
    $('mnBoardF').firstChild.nodeValue = me.floor ? floorLabel(me.floor) + ' 게시판' : '내 층 게시판';
    $('mnDeco').style.display = typeof canDeco === 'function' && canDeco() ? '' : 'none';
    $('mnBgm').lastChild.textContent = bgm.on ? '켜짐' : '꺼짐';
    $('mnQuality').lastChild.textContent = quality === 'low' ? '낮음 (가볍게)' : '보통';
  }
  function menuOpen() { return $('menu').style.display === 'flex'; }
  function openMenu() { if (!playing || uiOpen) return; uiOpen = true; renderMenu(); $('menu').style.display = 'flex'; }
  function closeMenu() { if (!menuOpen()) return; $('menu').style.display = 'none'; uiOpen = false; }
  $('menuBtn').addEventListener('click', openMenu);
  $('mnClose').addEventListener('click', closeMenu);
  $('menu').addEventListener('click', function (e) { if (e.target === $('menu')) closeMenu(); });
  $('mnProfile').addEventListener('click', function () { closeMenu(); sendMsg({ t: 'who', id: myId }); });
  $('mnRoster').addEventListener('click', function () { closeMenu(); openRoster(); });
  $('mnBoard1').addEventListener('click', function () { openBoard(1); });
  $('mnBoardF').addEventListener('click', function () { if (me.floor) openBoard(me.floor); });
  $('mnDeco').addEventListener('click', function () { closeMenu(); if (typeof openDeco === 'function') openDeco(); });
  $('mnEvents').addEventListener('click', function () { closeMenu(); openEvents(); });
  $('mnShop').addEventListener('click', function () { closeMenu(); openShop(); });
  $('mnBgm').addEventListener('click', function () {
    bgm.on = !bgm.on;
    try { localStorage.setItem('bonsa_bgm', bgm.on ? '1' : '0'); } catch (e) {}
    if (bgm.on) bgmStart(); else bgmStop();
    renderMenu();
  });
  $('mnQuality').addEventListener('click', function () {
    quality = quality === 'low' ? 'high' : 'low';
    try { localStorage.setItem('bonsa_quality', quality); } catch (e) {}
    applyQuality(); renderMenu();
  });
  $('mnLogout').addEventListener('click', function () {
    closeMenu(); stopped = true; forget();
    if (ws) { try { ws.close(); } catch (e) {} }
    setOthers([]); bgmStop(); showAuth('로그아웃했습니다.');
  });
  $('bClose').addEventListener('click', closeBoard);
  $('board').addEventListener('click', function (e) { if (e.target === $('board')) closeBoard(); });

  var spots = [
    { x: W.NPCS[0][0], z: W.NPCS[0][1], r: 3.4, label: '말 걸기', run: function () { showDialog(npcs[0].name); } },
    { x: W.NPCS[1][0], z: W.NPCS[1][1], r: 3.4, label: '말 걸기', run: function () { showDialog(npcs[1].name); } },
    { x: -LW / 2, z: 0, r: 3.2, label: '게시판 보기', run: function () { openBoard(); } },
    { x: W.ELEV.x, z: W.ELEV.z, r: 3, label: '엘리베이터', run: function () { openElev(); } }
  ];
  var floorSpots = [
    { x: W.ELEV.x, z: W.ELEV.z, r: 3, label: '엘리베이터', run: function () { openElev(); } },
    { x: W.KIOSK[0], z: W.KIOSK[1], r: 2.2, label: '층 안내판', run: function () { openFinfo(); } },
    { x: -6.5, z: -LD / 2, r: 2.6, label: '층 게시판', run: function () { openBoard(); } }
  ];
  var ceoSpots = floorSpots.slice(0, 2);

  /* ---------- 엘리베이터와 층 안내판 ---------- */
  function setFloors(list) {
    if (!Array.isArray(list)) return;
    list.forEach(function (f) { floors[f[0]] = { name: String(f[1] || ''), c: Number(f[2]) || 0, lock: !!f[3] }; });
    refreshPlace();
    if ($('elev').style.display === 'flex') renderElev();
    if ($('finfo').style.display === 'flex') renderFinfo();
  }
  function isTop() { return me.r === 'owner' || me.r === 'ceo'; }
  function renderElev() {
    var box0 = $('floorList'), here = W.floorOf(area), n, b, sp;
    while (box0.firstChild) box0.removeChild(box0.firstChild);
    for (n = W.FLOOR_MAX; n >= 1; n--) {
      b = document.createElement('button'); b.type = 'button';
      b.appendChild(document.createTextNode(floorLabel(n)));           // 이름은 글자로만 넣는다
      sp = document.createElement('span');
      sp.textContent = n === here ? '현재 층' : n === 1 ? '' : n === 12 ? (floors[12] && floors[12].lock ? '잠김' : '')
        : ((floors[n] ? floors[n].c : 0) + '/' + W.FLOOR_CAP + (me.floor === n ? ' · 내 층' : ''));
      b.appendChild(sp);
      if (n === here) { b.className = 'here'; b.disabled = true; }
      else if (me.floor === n) b.className = 'mine';
      b.setAttribute('data-floor', n);
      box0.appendChild(b);
    }
  }
  function openElev() { uiOpen = true; $('pwRow').style.display = 'none'; renderElev(); $('elev').style.display = 'flex'; }
  function closeElev() { if ($('elev').style.display !== 'flex') return; $('elev').style.display = 'none'; $('pwIn').value = ''; uiOpen = false; }
  $('floorList').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b || b.disabled) return;
    $('pwRow').style.display = 'none';
    sendMsg({ t: 'elev', to: Number(b.getAttribute('data-floor')) });
  });
  $('pwRow').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('pwIn').value; $('pwIn').value = '';
    if (v) sendMsg({ t: 'elev', to: 12, pw: v });
  });
  $('elevClose').addEventListener('click', closeElev);
  $('elev').addEventListener('click', function (e) { if (e.target === $('elev')) closeElev(); });

  function renderFinfo() {
    var n = W.floorOf(area), f = floors[n] || { name: '', c: 0, lock: false };
    $('fiTitle').textContent = floorLabel(n);
    var reg = $('fiReg'), canName;
    if (n === 12) {
      $('fiNote').textContent = '사장실입니다. 이 층에는 등록할 수 없습니다.';
      reg.style.display = 'none';
      canName = isTop();
    } else {
      $('fiNote').textContent = '등록 사원 ' + f.c + ' / ' + W.FLOOR_CAP + '명. 등록한 층에서는 게시판에 글을 쓰고 메뉴의 꾸미기로 가구를 놓을 수 있습니다. 한 사람은 한 층에만 등록할 수 있습니다.'
        + (me.floor && me.floor !== n ? ' 지금은 ' + me.floor + '층에 등록되어 있습니다.' : '');
      reg.style.display = '';
      reg.textContent = me.floor === n ? '이 층 등록 해제' : me.floor ? me.floor + '층 등록 해제' : '이 층에 등록';
      reg.className = me.floor ? 'btn ghost' : 'btn';
      canName = isTop() || me.r === 'manager' || (me.r === 'lead' && me.floor === n);
    }
    $('fiNameRow').style.display = canName ? 'block' : 'none';
    $('fiPassRow').style.display = n === 12 && isTop() ? 'block' : 'none';
    $('fiPassNote').textContent = f.lock ? '지금 비밀번호가 걸려 있습니다.' : '지금은 누구나 들어올 수 있습니다.';
    $('fiPassOff').style.display = f.lock ? '' : 'none';
  }
  function openFinfo() { uiOpen = true; $('fiName').value = (floors[W.floorOf(area)] || {}).name || ''; $('fiPass').value = ''; renderFinfo(); $('finfo').style.display = 'flex'; }
  function closeFinfo() { if ($('finfo').style.display !== 'flex') return; $('finfo').style.display = 'none'; $('fiPass').value = ''; uiOpen = false; }
  $('fiReg').addEventListener('click', function () { sendMsg({ t: 'freg', on: !me.floor }); });
  $('fiNameRow').addEventListener('submit', function (e) { e.preventDefault(); sendMsg({ t: 'fname', name: $('fiName').value }); });
  $('fiPassRow').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('fiPass').value; $('fiPass').value = '';
    if (v) sendMsg({ t: 'fpass', pw: v });
  });
  $('fiPassOff').addEventListener('click', function () { sendMsg({ t: 'fpass', pw: '' }); });
  $('fiClose').addEventListener('click', closeFinfo);
  $('finfo').addEventListener('click', function (e) { if (e.target === $('finfo')) closeFinfo(); });

  /* ---------- 꾸미기 모드: 위에서 내려다보며 가구를 놓고, 옮기고, 돌리고, 지운다 ---------- */
  var deco = { on: false, type: null, sel: 0, rot: 0, H: 30, cz: 0 };
  var mySit = false, lastStand = 0;
  var selMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.5, depthWrite: false }));
  selMesh.rotation.x = -Math.PI / 2; selMesh.visible = false; scene.add(selMesh);
  function canDeco() {
    var n = W.floorOf(area);
    return n === 12 ? isTop() : (n >= W.FLOOR_MIN && (me.floor === n || me.r === 'owner'));
  }
  function renderDeco() {
    var it = deco.sel ? furnItems[deco.sel] : null, n = 0, id, txt;
    if (deco.sel && !it) deco.sel = 0;
    for (id in furnItems) n++;
    if (deco.type) txt = W.FURN[deco.type].n + '(' + W.FURN[deco.type].price + '코인): 놓을 자리를 누르세요. 회전 단추로 방향을 바꿉니다 (지금 ' + deco.rot * 90 + '도).';
    else if (it) txt = W.FURN[it.type].n + ' 선택됨: 옮길 자리를 누르거나 회전·삭제를 누르세요.';
    else txt = '아래에서 가구를 고르거나, 놓인 가구를 눌러 선택하세요.';
    $('decoInfo').textContent = '가구 ' + n + '/' + W.FURN_CAP + ' · ' + moneyText() + ' · ' + txt;
    var bs = $('decoTypes').children;
    for (var i = 0; i < bs.length; i++) bs[i].className = bs[i].getAttribute('data-type') === deco.type ? 'on' : '';
    $('dcRot').disabled = !deco.type && !it; $('dcDel').disabled = !it; $('dcNone').disabled = !deco.type && !it;
    if (it) {
      var sz = W.furnSize(it.type, it.rot);
      selMesh.scale.set(sz.w, sz.d, 1); selMesh.position.set(it.x, 0.08, it.z); selMesh.visible = true;
    } else selMesh.visible = false;
  }
  Object.keys(W.FURN).forEach(function (k) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = W.FURN[k].n + ' ' + W.FURN[k].price; b.setAttribute('data-type', k);
    $('decoTypes').appendChild(b);
  });
  function setTops(v) { for (var i = 0; i < roomTops.length; i++) roomTops[i].visible = v; }
  function openDeco() {
    if (!playing || uiOpen) return;
    if (!canDeco()) { toast(W.floorOf(area) >= 2 ? '이 층에 등록한 사원만 꾸밀 수 있습니다.' : '꾸미기는 2층부터 할 수 있습니다.'); return; }
    if (mySit) { toast('먼저 자리에서 일어나 주세요.'); return; }
    deco.on = true; deco.type = null; deco.sel = 0; deco.rot = 0; uiOpen = true;
    $('decoBar').style.display = 'block'; $('chatBtn').style.display = 'none'; $('stick').style.visibility = 'hidden';
    setTops(false); renderDeco();
  }
  function closeDeco() {
    if (!deco.on) return;
    deco.on = false; uiOpen = false; selMesh.visible = false;
    $('decoBar').style.display = 'none'; $('chatBtn').style.display = ''; $('stick').style.visibility = '';
    setTops(true); camera.up.set(0, 1, 0);
  }
  function decoCamera() {
    var t = Math.tan(camera.fov * Math.PI / 360), asp = camera.aspect;
    var H = Math.max((LD / 2 + 1) / t, (LW / 2 + 1) / (t * asp)) * 1.3;   // 방 전체가 보이는 높이 (아래 도구 막대만큼 여유)
    deco.H = H; deco.cz = H * t * 0.2;
    camera.up.set(0, 0, -1);
    camera.position.set(0, H, deco.cz); camera.lookAt(0, 0, deco.cz);
  }
  // 화면에서 누른 곳이 바닥의 어디인지 (똑바로 내려다보는 시점이라 직접 계산한다)
  function decoPoint(px, py) {
    var t = Math.tan(camera.fov * Math.PI / 360);
    return { x: (px / window.innerWidth * 2 - 1) * deco.H * t * camera.aspect, z: deco.cz - (1 - py / window.innerHeight * 2) * deco.H * t };
  }
  function decoTap(px, py) {
    var pt = decoPoint(px, py), id, it, r, hit = 0, sz;
    if (deco.type) {
      sz = W.furnSize(deco.type, deco.rot);
      sendMsg({ t: 'deco', op: 'add', type: deco.type, rot: deco.rot, x: W.snap(pt.x, sz.w), z: W.snap(pt.z, sz.d) });
      return;
    }
    for (id in furnItems) {                               // 가구가 러그보다 먼저 잡히게 한다
      it = furnItems[id]; r = W.furnRect(it);
      if (pt.x > r.x0 && pt.x < r.x1 && pt.z > r.z0 && pt.z < r.z1 && (!hit || W.FURN[it.type].solid)) hit = it.id;
    }
    if (hit && hit !== deco.sel) { deco.sel = hit; renderDeco(); return; }
    it = deco.sel ? furnItems[deco.sel] : null;
    if (it && !hit) {
      sz = W.furnSize(it.type, it.rot);
      sendMsg({ t: 'deco', op: 'mv', id: it.id, rot: it.rot, x: W.snap(pt.x, sz.w), z: W.snap(pt.z, sz.d) });
    }
  }
  $('decoTypes').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    var k = b.getAttribute('data-type');
    deco.type = deco.type === k ? null : k; deco.sel = 0; deco.rot = 0; renderDeco();
  });
  $('dcRot').addEventListener('click', function () {
    var it = deco.sel ? furnItems[deco.sel] : null;
    if (deco.type) { deco.rot = (deco.rot + 1) % 4; renderDeco(); }
    else if (it) {
      // 돌릴 때마다 반 칸씩 밀려나지 않도록, 격자에 다시 맞출 때 올림과 내림을 번갈아 쓰게 살짝 치우쳐 보낸다
      var nr = (it.rot + 1) % 4, nudge = nr % 2 ? 0.01 : -0.01;
      sendMsg({ t: 'deco', op: 'mv', id: it.id, rot: nr, x: it.x + nudge, z: it.z + nudge });
    }
  });
  $('dcDel').addEventListener('click', function () { if (deco.sel) sendMsg({ t: 'deco', op: 'del', id: deco.sel }); });
  $('dcNone').addEventListener('click', function () { deco.type = null; deco.sel = 0; renderDeco(); });
  $('dcDone').addEventListener('click', closeDeco);
  function onFurn(m) {
    if (m.op === 'del') { if (furnItems[m.id]) { dropFurn(furnItems[m.id]); delete furnItems[m.id]; } }
    else addFurn(m.it);
    rebuildFurnCols();
    if (deco.on) renderDeco();
  }
  // 앉을 수 있는 가장 가까운 빈 자리
  function nearSeat() {
    var best = 1.7, found = null, id, it, seats, k, pos, d, o, taken, oid;
    for (id in furnItems) {
      it = furnItems[id]; seats = W.FURN[it.type].seats;
      if (!seats) continue;
      for (k = 0; k < seats.length; k++) {
        pos = W.seatPos(it, k);
        d = Math.sqrt((pos.x - P.x) * (pos.x - P.x) + (pos.z - P.z) * (pos.z - P.z));
        if (d >= best) continue;
        taken = false;
        for (oid in others) { o = others[oid]; if (o.sit && Math.abs(o.x - pos.x) < 0.2 && Math.abs(o.z - pos.z) < 0.2) taken = true; }
        if (!taken) { best = d; found = { id: it.id, slot: k, d: d }; }
      }
    }
    return found;
  }

  /* ---------- 상점과 치장 (값과 보유 여부는 서버가 판정한다) ---------- */
  function moneyText() { return '내 돈 ' + (me.money || 0) + '코인'; }
  function shopOpen() { return $('shop').style.display === 'flex'; }
  var buyArmed = '';
  function renderShop(m) {
    if (!shopOpen() || !Array.isArray(m.own)) return;
    me.money = Number(m.money) || 0; buyArmed = '';
    $('shNote').textContent = moneyText();
    ['color', 'hat'].forEach(function (slot) {
      var box0 = $(slot === 'color' ? 'shColors' : 'shHats'), worn = slot === 'color' ? m.c : m.h;
      clear(box0);
      function row(key, name, hex, right, cls) {
        var b = document.createElement('button'), sp = document.createElement('span'), dot;
        b.type = 'button'; b.setAttribute('data-item', key); b.setAttribute('data-slot', slot);
        if (hex !== null) { dot = document.createElement('i'); dot.style.background = '#' + ('000000' + hex.toString(16)).slice(-6); b.appendChild(dot); }
        b.appendChild(document.createTextNode(name)); sp.textContent = right; b.appendChild(sp);
        if (cls) b.className = cls;
        box0.appendChild(b);
      }
      row('', slot === 'color' ? '기본 색' : '모자 없음', null, worn ? '바꾸기' : '착용 중', worn ? '' : 'here');
      Object.keys(W.COSM).forEach(function (k) {
        var it = W.COSM[k];
        if (it.slot !== slot) return;
        var own = m.own.indexOf(k) >= 0;
        row(k, it.n, slot === 'color' ? it.hex : null, worn === k ? '착용 중' : own ? '보유 · 착용하기' : it.price + '코인', worn === k ? 'here' : own ? 'mine' : '');
        if (own) box0.lastChild.setAttribute('data-own', '1');
      });
    });
  }
  function shopClick(e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b || b.className === 'here') return;
    var key = b.getAttribute('data-item');
    if (!key || b.getAttribute('data-own')) { sendMsg({ t: 'equip', slot: b.getAttribute('data-slot'), item: key }); return; }
    if (buyArmed !== key) { buyArmed = key; b.lastChild.textContent = '한 번 더 누르면 삽니다'; return; }   // 실수로 사지 않게 두 번 눌러야 한다
    buyArmed = ''; sendMsg({ t: 'buy', item: key });
  }
  $('shColors').addEventListener('click', shopClick); $('shHats').addEventListener('click', shopClick);
  function openShop() { if (!playing || uiOpen) return; uiOpen = true; $('shNote').textContent = '불러오는 중…'; $('shop').style.display = 'flex'; sendMsg({ t: 'shop' }); }
  function closeShop() { if (!shopOpen()) return; $('shop').style.display = 'none'; uiOpen = false; }
  $('shClose').addEventListener('click', closeShop);
  $('shop').addEventListener('click', function (e) { if (e.target === $('shop')) closeShop(); });

  /* ---------- 이벤트: 사장·부장이 만들고, 누구나 참가 신청하고, 부팀장 이상이 성공 판정을 하면 서버가 보상을 준다 ---------- */
  function eventsOpen() { return $('events').style.display === 'flex'; }
  function renderEvents(m) {
    if (!eventsOpen() || !Array.isArray(m.list)) return;
    $('evForm').style.display = m.mk ? 'block' : 'none';
    $('evR').max = m.max;
    $('evNote').textContent = '참가 신청을 하면 부팀장 이상이 성공 여부를 판정합니다. 보상은 이벤트마다 한 번만 받습니다. ' + moneyText() + '.';
    var box0 = $('evList'); clear(box0);
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
    if (!m.list.length) { var e0 = el('div', 'ev'); e0.appendChild(el('div', 'b', '진행 중인 이벤트가 없습니다.')); box0.appendChild(e0); return; }
    m.list.forEach(function (ev) {
      var d = el('div', 'ev'), acts = el('div', 'acts'), b;
      d.appendChild(el('div', 't', String(ev[1])));
      d.appendChild(el('div', 'm', '보상 ' + ev[3] + '코인 · 만든 사람 ' + String(ev[4])));
      d.appendChild(el('div', 'b', String(ev[2])));
      b = el('button', '', ev[5] === 2 ? '보상 받음' : ev[5] === 1 ? '신청함 · 판정 대기' : '참가 신청');
      b.type = 'button'; b.disabled = ev[5] !== 0; b.setAttribute('data-act', 'join'); b.setAttribute('data-id', ev[0]); acts.appendChild(b);
      if (ev[6]) { b = el('button', 'ghost', '이벤트 종료'); b.type = 'button'; b.setAttribute('data-act', 'close'); b.setAttribute('data-id', ev[0]); acts.appendChild(b); }
      d.appendChild(acts);
      (ev[7] || []).forEach(function (w) {
        var r = el('div', 'who'); r.appendChild(el('span', '', '신청: ' + String(w[1])));
        [['ok', '성공', ''], ['no', '반려', 'ghost']].forEach(function (k) {
          var x = el('button', k[2], k[1]); x.type = 'button';
          x.setAttribute('data-act', k[0]); x.setAttribute('data-id', ev[0]); x.setAttribute('data-uid', w[0]); r.appendChild(x);
        });
        d.appendChild(r);
      });
      box0.appendChild(d);
    });
  }
  var closeArmed = 0;
  $('evList').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b || b.disabled) return;
    var act = b.getAttribute('data-act'), id = Number(b.getAttribute('data-id')), uid = Number(b.getAttribute('data-uid'));
    if (act === 'join') sendMsg({ t: 'evjoin', id: id });
    else if (act === 'ok') sendMsg({ t: 'evok', id: id, uid: uid });
    else if (act === 'no') sendMsg({ t: 'evno', id: id, uid: uid });
    else if (act === 'close') {
      if (closeArmed !== id) { closeArmed = id; b.textContent = '한 번 더 누르면 종료됩니다'; return; }
      closeArmed = 0; sendMsg({ t: 'evclose', id: id });
    }
  });
  $('evForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = $('evT').value.trim(), b = $('evB').value.trim(), r = Number($('evR').value);
    if (!t || !b || !r) { toast('제목, 내용, 보상을 모두 써 주세요.'); return; }
    sendMsg({ t: 'evnew', title: t, body: b, reward: r });
    $('evT').value = ''; $('evB').value = ''; $('evR').value = '';
  });
  function openEvents() { if (!playing || uiOpen) return; uiOpen = true; closeArmed = 0; $('evNote').textContent = '불러오는 중…'; clear($('evList')); $('events').style.display = 'flex'; sendMsg({ t: 'events' }); }
  function closeEvents() { if (!eventsOpen()) return; $('events').style.display = 'none'; uiOpen = false; }
  $('evClose').addEventListener('click', closeEvents);
  $('events').addEventListener('click', function (e) { if (e.target === $('events')) closeEvents(); });

  /* ---------- 프로필 카드, 사원 명부, 승진·강등 (단추가 보여도 판정은 서버가 다시 한다) ---------- */
  var RANK_ORDER = ['intern', 'staff', 'deputy', 'lead', 'manager', 'ceo'];
  function level(r) { return r === 'owner' ? RANK_ORDER.length : RANK_ORDER.indexOf(r); }
  var prof = null, rosterList = null;
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function renderProf() {
    if (!prof) return;
    $('pfName').textContent = tagOf(prof.r, prof.n);
    $('pfNote').textContent = '직급: ' + (RANKS[prof.r] || prof.r) + ' · 등록 층: ' + (prof.floor ? floorLabel(prof.floor) : '없음') + ' · ' + (prof.on ? '접속 중' : '접속 안 함');
    var box0 = $('pfRanks'), a = level(me.r), t = level(prof.r), any = false;
    clear(box0);
    if (a >= level('lead') && prof.id !== myId && prof.r !== 'owner' && t < a) {
      for (var i = Math.min(a, RANK_ORDER.length) - 1; i >= 0; i--) {
        if (i === t) continue;
        var b = document.createElement('button'), sp = document.createElement('span');
        b.type = 'button'; b.setAttribute('data-rank', RANK_ORDER[i]);
        b.appendChild(document.createTextNode(RANKS[RANK_ORDER[i]]));
        sp.textContent = i > t ? '승진' : '강등'; b.appendChild(sp);
        box0.appendChild(b); any = true;
      }
    }
    $('pfRankSec').style.display = any ? 'block' : 'none';
  }
  function showProf(m) {
    if (!m || typeof m.n !== 'string' || !RANKS[m.r]) return;
    prof = { id: m.id, n: m.n, r: m.r, floor: m.floor || null, on: !!m.on };
    if (rosterList) rosterList.forEach(function (u) { if (u[0] === prof.id) u[2] = prof.r; });
    if ($('roster').style.display === 'flex') drawRoster();
    renderProf();
    if ($('prof').style.display !== 'flex') { $('prof').style.display = 'flex'; uiOpen = true; }
  }
  applyQuality();
  function closeProf() { if ($('prof').style.display !== 'flex') return; $('prof').style.display = 'none'; prof = null; uiOpen = $('roster').style.display === 'flex'; }
  $('pfRanks').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (b && prof) sendMsg({ t: 'setrank', id: prof.id, r: b.getAttribute('data-rank') });
  });
  $('pfClose').addEventListener('click', closeProf);
  $('prof').addEventListener('click', function (e) { if (e.target === $('prof')) closeProf(); });

  function drawRoster() {
    var box0 = $('rsList'); clear(box0);
    if (!rosterList) return;
    var on = 0;
    rosterList.forEach(function (u) {
      var b = document.createElement('button'), sp = document.createElement('span');
      b.type = 'button'; b.setAttribute('data-id', u[0]);
      b.appendChild(document.createTextNode(tagOf(u[2], u[1])));
      sp.textContent = (u[3] ? u[3] + '층' : '미등록') + (u[4] ? ' · 접속 중' : '');
      if (u[4]) on++;
      b.appendChild(sp); box0.appendChild(b);
    });
    $('rsNote').textContent = '전체 ' + rosterList.length + '명 · 접속 ' + on + '명. 이름을 누르면 프로필이 열립니다.';
  }
  function renderRoster(list) {
    if (!Array.isArray(list)) return;
    rosterList = list.filter(function (u) { return Array.isArray(u) && typeof u[1] === 'string' && RANKS[u[2]]; })
      .sort(function (x, y) { return level(y[2]) - level(x[2]) || x[0] - y[0]; });
    drawRoster();
  }
  function openRoster() {
    if (!playing || uiOpen) return;
    uiOpen = true; rosterList = null; clear($('rsList')); $('rsNote').textContent = '불러오는 중…';
    $('roster').style.display = 'flex';
    sendMsg({ t: 'roster' });
  }
  function closeRoster() { if ($('roster').style.display !== 'flex') return; $('roster').style.display = 'none'; closeProf(); uiOpen = false; }
  $('rsList').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (b) sendMsg({ t: 'who', id: Number(b.getAttribute('data-id')) });
  });
  $('rsClose').addEventListener('click', closeRoster);
  $('roster').addEventListener('click', function (e) { if (e.target === $('roster')) closeRoster(); });

  // 캐릭터를 짧게 누르면 그 사람의 프로필을 연다 (화면에 찍힌 위치로 가장 가까운 사람을 고른다)
  var pickV = new THREE.Vector3();
  function pick(px, py) {
    if (!playing || uiOpen || chatOpen) return;
    var best = 70 * 70, hit = null, w = window.innerWidth, h = window.innerHeight;
    function test(id, g) {
      pickV.set(g.position.x, 1.0, g.position.z).project(camera);
      if (!(pickV.z < 1)) return;
      var dx = (pickV.x * 0.5 + 0.5) * w - px, dy = (-pickV.y * 0.5 + 0.5) * h - py, d = dx * dx + dy * dy;
      if (d < best) { best = d; hit = id; }
    }
    for (var id in others) test(Number(id), others[id].g);
    test(myId, player);
    if (hit) sendMsg({ t: 'who', id: hit });
  }
  var tap = {};
  function tapStart(e) { tap[e.pointerId] = { x: e.clientX, y: e.clientY, t: performance.now() }; }
  function tapEnd(e) {
    var s0 = tap[e.pointerId]; delete tap[e.pointerId];
    if (s0 && performance.now() - s0.t < 350 && Math.abs(e.clientX - s0.x) < 10 && Math.abs(e.clientY - s0.y) < 10) { if (deco.on) decoTap(e.clientX, e.clientY); else pick(e.clientX, e.clientY); }
  }
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

  /* ---------- 배경 음악: 음원 파일 없이 브라우저가 직접 연주하는 짧은 자작 반복곡 ---------- */
  var bgm = { on: true, ctx: null, out: null, timer: 0, next: 0, step: 0 };
  try { bgm.on = localStorage.getItem('bonsa_bgm') !== '0'; } catch (e) {}
  var N = { G4: 392.0, A4: 440.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0 };
  var CHORDS = [[261.63, 329.63, 392.0], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 246.94, 293.66]];   // C Am F G
  var MELODY = [
    'E5', 0, 'G5', 0, 'E5', 'D5', 'C5', 0,   'A4', 0, 'C5', 0, 'E5', 0, 'D5', 0,
    'C5', 0, 'A4', 0, 'C5', 'D5', 'E5', 0,   'D5', 0, 'D5', 0, 'G4', 0, 'D5', 0,
    'G5', 0, 'E5', 0, 'C5', 0, 'E5', 'G5',   'A5', 0, 'G5', 0, 'E5', 0, 'C5', 0,
    'A4', 'C5', 0, 'E5', 0, 'D5', 'C5', 0,   'D5', 0, 'E5', 'D5', 0, 'G4', 0, 0];
  var BEAT = 60 / 86 / 2;
  function tone(freq, at, dur, type, vol) {
    var o = bgm.ctx.createOscillator(), g = bgm.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(bgm.out);
    o.start(at); o.stop(at + dur + 0.05);
  }
  function bgmSchedule() {
    if (!bgm.ctx) return;
    while (bgm.next < bgm.ctx.currentTime + 0.4) {
      var s = bgm.step % MELODY.length, inBar = s % 8, chord = CHORDS[Math.floor(s / 8) % 4], at = bgm.next;
      if (inBar === 0) chord.forEach(function (f) { tone(f, at, BEAT * 8, 'sine', 0.05); });
      if (inBar === 0 || inBar === 4) tone(chord[0] / 2, at, BEAT * 3, 'triangle', 0.11);
      if (MELODY[s]) tone(N[MELODY[s]], at, BEAT * 1.9, 'triangle', 0.085);
      bgm.next += BEAT; bgm.step++;
    }
  }
  function bgmStart() {
    if (!bgm.on || bgm.timer) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!bgm.ctx) {
        bgm.ctx = new AC();
        var lp = bgm.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
        bgm.out = bgm.ctx.createGain(); bgm.out.gain.value = 0.55;
        bgm.out.connect(lp); lp.connect(bgm.ctx.destination);
      }
      if (bgm.ctx.state === 'suspended') bgm.ctx.resume();
      bgm.next = bgm.ctx.currentTime + 0.1;
      bgm.timer = setInterval(bgmSchedule, 120);
    } catch (e) { bgm.ctx = null; }
  }
  function bgmStop() {
    clearInterval(bgm.timer); bgm.timer = 0;
    if (bgm.ctx && bgm.ctx.state === 'running') bgm.ctx.suspend();
  }
  // 브라우저는 사용자가 화면을 한 번 눌러야 소리를 허용한다
  document.addEventListener('pointerdown', function () { if (playing) bgmStart(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) bgmStop(); else if (playing) bgmStart(); });

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
      bgmStart();
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
        me.money = Number(m.me.money) || 0; me.c = m.me.c || ''; me.h = m.me.h || '';
        applyLook(player, myId, me.c, me.h);
        setTag(player, tagOf(m.me.r, m.me.n));
        me.r = m.me.r; me.n = m.me.n; me.floor = m.me.floor || null;
        if (m.floors) setFloors(m.floors);
        player.userData.umb.children[0].material = umbMats[myId % umbMats.length];
        if (typeof m.now === 'number') clockOffset = m.now - Date.now();
        if (m.wx) setWeather(m.wx, true);
        closeDeco(); mySit = false;
        applyArea(m.me.area, m.me.x, m.me.z);
        setPapers(m.pins); setFurn([]);
        setOthers(m.players);
        $('count').textContent = '접속 ' + m.online + '명';
        $('auth').style.display = 'none'; $('net').style.display = 'none';
        if (!playing) logLine(TOUCH ? '화면 아래쪽을 누른 채 끌면 이동, 위쪽을 끌면 시점 회전' : 'WASD 또는 왼쪽 조이스틱으로 이동, 화면을 드래그해 시점 회전');
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
      case 'wx': if (m.wx) setWeather(m.wx, false); break;
      case 'umb':
        if (m.id === myId) myUmb = !!m.on;
        else if (others[m.id]) others[m.id].umb = !!m.on;
        break;
      case 'area': switchArea(m.area, m.x, m.z, m.players, m.f, m.pins, m.furn); break;
      case 'floors': setFloors(m.floors); break;
      case 'me': me.floor = m.floor || null; if ($('finfo').style.display === 'flex') renderFinfo(); if ($('elev').style.display === 'flex') renderElev(); break;
      case 'needpw': $('pwRow').style.display = 'block'; $('pwIn').value = ''; $('pwIn').focus(); break;
      case 'toast': toast(m.m); break;
      case 'rank':
        if (!RANKS[m.r]) break;
        if (m.id === myId) { me.r = m.r; setTag(player, tagOf(me.r, me.n)); }
        else if (others[m.id]) { others[m.id].r = m.r; setTag(others[m.id].g, tagOf(m.r, others[m.id].n)); }
        if ($('finfo').style.display === 'flex') renderFinfo();
        if ($('prof').style.display === 'flex') renderProf();
        break;
      case 'who': showProf(m); break;
      case 'posts': renderPosts(m); break;
      case 'posted': setEdit(0); toast(m.edit ? '글을 고쳤습니다.' : '글을 올렸습니다.'); break;
      case 'bnew': if (boardOpen() && m.b === curBoard && !editId) sendMsg({ t: 'posts', b: curBoard }); break;
      case 'pins': if (m.b === W.floorOf(area)) setPapers(m.list); break;
      case 'furn': onFurn(m); break;
      case 'money': me.money = Number(m.v) || 0; if (deco.on) renderDeco(); if (menuOpen()) renderMenu(); if (shopOpen()) $('shNote').textContent = moneyText(); break;
      case 'look':
        if (m.id === myId) { me.c = m.c || ''; me.h = m.h || ''; applyLook(player, myId, me.c, me.h); }
        else if (others[m.id]) applyLook(others[m.id].g, m.id, m.c || '', m.h || '');
        break;
      case 'shop': renderShop(m); break;
      case 'events': renderEvents(m); break;
      case 'evdirty': if (eventsOpen()) sendMsg({ t: 'events' }); break;
      case 'sit':
        if (m.id === myId) { mySit = !!m.s; P.x = m.x; P.z = m.z; P.face = m.f; sent.x = P.x; sent.z = P.z; }
        else if (others[m.id]) { o = others[m.id]; o.sit = !!m.s; o.x = m.x; o.z = m.z; o.f = m.f; o.g.position.x = m.x; o.g.position.z = m.z; }
        break;
      case 'roster': renderRoster(m.list); break;
      case 'sys': logLine(m.m, true); break;
      case 'online': $('count').textContent = '접속 ' + m.n + '명'; break;
      case 'kick': stopped = true; setOthers([]); showAuth(m.m); break;
      case 'full': stopped = true; showAuth(m.m); break;
      case 'authfail': stopped = true; forget(); showAuth(m.m); break;
    }
  }

  /* ---------- 시간과 날씨: 대한민국 시각과 서울 날씨(서버가 알려 줌)를 배경에 반영 ---------- */
  var KIND_KO = { clear: '맑음', cloudy: '흐림', fog: '안개', rain: '비', snow: '눈', storm: '뇌우' };
  var wx = { k: 'clear', p: 0, c: 0.2, w: 2, d: 270, temp: null, sr: 6.5, ss: 18.5 };
  var clockOffset = 0, myUmb = false;
  // E: 화면에 실제로 쓰는 값. 날씨가 바뀌어도 뚝 끊기지 않게 목표값으로 천천히 따라간다.
  var E = { cover: 0.1, rain: 0, snow: 0, fog: 0, wind: 0.15, wet: 0, wxX: 1, wxZ: 0, flash: 0, nextFlash: 0, chipAt: 0 };
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function targets() {
    var k = wx.k, c = clamp01(wx.c);
    return {
      cover: k === 'clear' ? c * 0.3 : k === 'cloudy' ? 0.35 + c * 0.4 : k === 'fog' ? 0.7 : k === 'snow' ? 0.75 : k === 'rain' ? 0.82 : 0.95,
      rain: k === 'rain' || k === 'storm' ? Math.max(0.3, wx.p) : 0,
      snow: k === 'snow' ? Math.max(0.3, wx.p) : 0,
      fog: k === 'fog' ? 1 : 0,
      wind: clamp01(wx.w / 12)
    };
  }
  function setWeather(next, snap) {
    if (!next || typeof next !== 'object' || !KIND_KO[next.k]) return;
    ['p', 'c', 'w', 'd', 'sr', 'ss'].forEach(function (key) { if (typeof next[key] === 'number' && isFinite(next[key])) wx[key] = next[key]; });
    wx.k = next.k; wx.temp = typeof next.temp === 'number' ? next.temp : null;
    var rad = wx.d * Math.PI / 180;                      // 풍향은 '불어오는 쪽'이라 반대로 흐른다
    E.wxX = -Math.sin(rad); E.wxZ = Math.cos(rad);
    if (snap) { var t = targets(); E.cover = t.cover; E.rain = t.rain; E.snow = t.snow; E.fog = t.fog; E.wind = t.wind; }
    E.chipAt = 0;
  }
  function kstHours() { return ((Date.now() + clockOffset + 9 * 3600000) % 86400000) / 3600000; }
  function lin(v) { return Math.pow(v, 2.2); }
  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  var C_NIGHT = [0.035, 0.05, 0.13], C_DAY = [0.62, 0.83, 0.96], C_TWI = [0.97, 0.62, 0.4],
    C_GREY_N = [0.08, 0.09, 0.12], C_GREY_D = [0.62, 0.67, 0.72], C_IN = [0.17, 0.2, 0.26];
  function arcDir(t) {                                   // 하늘을 가로지르는 호 (t: 0 뜸 ~ 1 짐)
    var a = clamp01(t) * Math.PI, x = Math.cos(a) * 0.75, y = Math.sin(a) * 0.85 + 0.12, z = 0.42;
    var l = Math.sqrt(x * x + y * y + z * z);
    return [x / l, y / l, z / l];
  }
  function fall(ps, dt, speed, drift, px, pz, count, lines) {
    var i, a, st = ps.st, pos = ps.pos, dx = E.wxX * drift, dz = E.wxZ * drift, o;
    for (i = 0; i < count; i++) {
      a = i * 3;
      st[a + 1] -= speed * dt; st[a] += dx * dt; st[a + 2] += dz * dt;
      if (st[a + 1] < 0) { st[a + 1] += 22; st[a] = Math.random() * 36 - 18; st[a + 2] = Math.random() * 36 - 18; }
      if (st[a] > 18) st[a] -= 36; else if (st[a] < -18) st[a] += 36;
      if (st[a + 2] > 18) st[a + 2] -= 36; else if (st[a + 2] < -18) st[a + 2] += 36;
      o = lines ? i * 6 : a;
      pos[o] = px + st[a]; pos[o + 1] = st[a + 1]; pos[o + 2] = pz + st[a + 2];
      if (lines) { pos[o + 3] = pos[o] + dx * 0.035; pos[o + 4] = pos[o + 1] + 0.75; pos[o + 5] = pos[o + 2] + dz * 0.035; }
    }
    ps.geo.setDrawRange(0, count * (lines ? 2 : 1));
    ps.attr.needsUpdate = true;
  }
  function envTick(dt, t, cx, cy, cz) {
    var h = kstHours(), sr = wx.sr, ss = wx.ss, tg = targets(), k = Math.min(1, dt * 0.6), i;
    E.cover += (tg.cover - E.cover) * k; E.rain += (tg.rain - E.rain) * k; E.snow += (tg.snow - E.snow) * k;
    E.fog += (tg.fog - E.fog) * k; E.wind += (tg.wind - E.wind) * k;
    E.wet = Math.max(E.rain, E.snow);

    // 화면 위 표시: 서울 시각과 날씨 (1초에 한 번만 고친다)
    if (t > E.chipAt) {
      E.chipAt = t + 1;
      var hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
      var txt = '울산 ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + ' · ' + KIND_KO[wx.k] + (wx.temp === null ? '' : ' ' + wx.temp + '°');
      if ($('wx').textContent !== txt) $('wx').textContent = txt;
      if (env.clockMin !== mm && env.clockCtx) {
        env.clockMin = mm;
        var x = env.clockCtx;
        x.fillStyle = '#1c2430'; x.fillRect(0, 0, 256, 128);
        x.fillStyle = '#7fe0a8'; x.font = '700 72px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText((hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm, 128, 58);
        x.fillStyle = '#9aa3b0'; x.font = '600 22px ' + FONT; x.fillText('대한민국 표준시', 128, 106);
        env.clockTex.needsUpdate = true;
      }
    }

    var outside = area === 'out';
    rain.obj.visible = outside && E.rain > 0.02; snow.obj.visible = outside && E.snow > 0.02;
    leaves.obj.visible = outside && E.wind > 0.2;
    if (!outside) {                                      // 실내는 늘 같은 조명
      scene.background.setRGB(C_IN[0], C_IN[1], C_IN[2]);
      scene.fog.near = 200; scene.fog.far = 400;
      hemi.intensity = 0.85; hemi.color.setRGB(1, 1, 1);
      sun.intensity = 0.6; sun.color.setRGB(1, 1, 1); sun.position.set(18, 40, 26);
      return;
    }

    // 낮/밤: 해 뜨는 시각과 지는 시각 앞뒤로 서서히 바뀐다
    var dayF = clamp01((h - (sr - 0.6)) / 1.2) * clamp01(((ss + 0.6) - h) / 1.2);
    var tw = Math.max(0, 1 - Math.abs(h - sr) / 0.9, 1 - Math.abs(h - ss) / 0.9);
    var sky = mix3(C_NIGHT, C_DAY, dayF);
    sky = mix3(sky, C_TWI, tw * 0.5 * (1 - E.cover * 0.7));
    sky = mix3(sky, mix3(C_GREY_N, C_GREY_D, dayF), E.cover * 0.85);

    // 번개 (뇌우일 때만)
    if (wx.k === 'storm' && t > E.nextFlash) { E.flash = 1; E.nextFlash = t + 5 + Math.random() * 9; }
    E.flash = Math.max(0, E.flash - dt * 5);
    if (E.flash > 0) sky = mix3(sky, [0.9, 0.92, 1], E.flash * 0.6);

    scene.background.setRGB(sky[0], sky[1], sky[2]);
    scene.fog.color.setRGB(lin(sky[0]), lin(sky[1]), lin(sky[2]));
    scene.fog.near = 45 - 33 * E.fog - 15 * E.wet; scene.fog.far = 110 - 66 * E.fog - 28 * E.wet;

    var sunDir = arcDir((h - sr) / (ss - sr)), nh = h < sr ? h + 24 : h, moonDir = arcDir((nh - ss) / (sr + 24 - ss));
    var ld = dayF > 0.3 ? sunDir : moonDir;
    sun.position.set(ld[0] * 60, ld[1] * 60, ld[2] * 60);
    var sc = mix3([0.6, 0.68, 1], mix3([1, 1, 1], [1, 0.78, 0.55], tw * 0.8), dayF);
    sun.color.setRGB(sc[0], sc[1], sc[2]);
    sun.intensity = 0.12 + 0.68 * dayF * (1 - E.cover * 0.65);
    var hc = mix3([0.55, 0.62, 0.95], [1, 1, 1], dayF);
    hemi.color.setRGB(hc[0], hc[1], hc[2]);
    hemi.intensity = 0.32 + 0.53 * dayF * (1 - E.cover * 0.25) + E.flash * 0.8;

    env.sunOrb.position.set(cx + sunDir[0] * 175, cy + sunDir[1] * 175, cz + sunDir[2] * 175); env.sunOrb.lookAt(cx, cy, cz);
    env.sunOrb.material.opacity = clamp01(dayF * 1.4) * (1 - E.cover) * (1 - E.fog);
    env.sunOrb.visible = env.sunOrb.material.opacity > 0.02;
    env.moonOrb.position.set(cx + moonDir[0] * 175, cy + moonDir[1] * 175, cz + moonDir[2] * 175); env.moonOrb.lookAt(cx, cy, cz);
    env.moonOrb.material.opacity = clamp01((1 - dayF) * 1.4 - 0.2) * (1 - E.cover * 0.9);
    env.moonOrb.visible = env.moonOrb.material.opacity > 0.02;
    env.stars.position.set(cx, cy - 20, cz);
    env.starMat.opacity = clamp01(1 - dayF * 1.6) * (1 - E.cover) * 0.9;
    env.stars.visible = env.starMat.opacity > 0.02;

    // 창문 불빛과 가로등: 어두워지면 켜진다
    var dark = Math.max(1 - dayF, E.cover * 0.45);
    env.windows[0].emissiveIntensity = env.windows[1].emissiveIntensity = clamp01(dark * 1.3 - 0.2) * 0.95;
    var lampOn = clamp01((dark - 0.45) / 0.25), lc = mix3([0.6, 0.64, 0.69], [1, 0.93, 0.7], lampOn);
    env.lampMat.color.setRGB(lin(lc[0]), lin(lc[1]), lin(lc[2]));
    for (i = 0; i < env.lampGlows.length; i++) {
      env.lampGlows[i].material.opacity = lampOn * 0.9; env.lampGlows[i].visible = lampOn > 0.02;
      env.lampPools[i].material.opacity = lampOn * 0.3; env.lampPools[i].visible = lampOn > 0.02;
    }

    // 바람: 구름이 흐르고, 나뭇잎이 기울어 흔들리고, 깃발이 펄럭인다
    var w = E.wind, cs = (1.0 + w * 7) * dt, want = Math.round(2 + clamp01(Math.max(wx.c, E.cover)) * 14), c, cg;
    var cb = 1 - 0.5 * Math.max(E.rain, E.cover > 0.8 ? 0.5 : 0);
    env.cloudMat.color.setRGB(cb, cb, cb * 1.02 > 1 ? 1 : cb * 1.02);
    for (i = 0; i < env.clouds.length; i++) {
      c = env.clouds[i]; cg = c.g;
      c.s += ((i < want ? 1 : 0) - c.s) * Math.min(1, dt * 0.4);
      cg.visible = c.s > 0.03;
      if (cg.visible) cg.scale.set(c.s, c.s, c.s);
      cg.position.x += E.wxX * cs * c.speed; cg.position.z += E.wxZ * cs * c.speed;
      if (cg.position.x > 130) cg.position.x -= 260; else if (cg.position.x < -130) cg.position.x += 260;
      if (cg.position.z > 130) cg.position.z -= 260; else if (cg.position.z < -130) cg.position.z += 260;
    }
    var tr, sway, lx, lz, cyw, syw;
    for (i = 0; i < env.trees.length; i++) {
      tr = env.trees[i];
      sway = w * 0.07 + Math.sin(t * (1.1 + w * 2.2) + tr.ph) * (0.012 + w * 0.07);
      // 나무마다 돌려 세웠으므로 바람 방향을 나무 기준으로 바꿔 준다
      cyw = Math.cos(tr.yaw); syw = Math.sin(tr.yaw);
      lx = E.wxX * cyw - E.wxZ * syw; lz = E.wxX * syw + E.wxZ * cyw;
      tr.crown.rotation.z = -sway * lx + Math.sin(t * 0.9 + tr.ph * 2) * 0.008;
      tr.crown.rotation.x = sway * lz;
    }
    var f = env.flag, u, along, wave, droop, bx = W.FLAG[0], bz = W.FLAG[1], q;
    for (i = 0; i < f.n; i++) {
      u = i / (f.n - 1); along = u * 2.0 * (0.3 + 0.7 * w);
      wave = Math.sin(t * (3 + w * 7) - u * 5) * 0.2 * u * (0.35 + w);
      droop = (1 - w) * u * u * 1.0;
      q = i * 6;
      f.pos[q] = bx + E.wxX * along - E.wxZ * wave; f.pos[q + 1] = 6.85 - droop; f.pos[q + 2] = bz + E.wxZ * along + E.wxX * wave;
      f.pos[q + 3] = f.pos[q]; f.pos[q + 4] = 5.65 - droop * 1.25; f.pos[q + 5] = f.pos[q + 2];
    }
    f.attr.needsUpdate = true;
    var fb = 0.3 + 0.7 * dayF;
    env.flagMat.color.setRGB(lin(0.18 * fb), lin(0.44 * fb), lin(0.93 * fb));

    if (rain.obj.visible) fall(rain, dt, 24 + E.rain * 8, w * 10, P.x, P.z, Math.floor(rain.n * clamp01(E.rain)), true);
    if (snow.obj.visible) fall(snow, dt, 2.4, 1 + w * 6, P.x, P.z, Math.floor(snow.n * clamp01(E.snow)), false);
    if (leaves.obj.visible) {
      leaves.obj.material.opacity = clamp01((w - 0.2) * 2.5);
      fall(leaves, dt, 1.2, 3 + w * 9, P.x, P.z, leaves.n, false);
    }
  }
  $('umbBtn').addEventListener('click', function () {
    myUmb = !myUmb;
    sendMsg({ t: 'umb', on: myUmb });
  });

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

  // 터치 기기: 화면 아래쪽 절반을 누르면 그 자리에 조이스틱이 생기고, 위쪽 절반을 끌면 시점이 돈다.
  var TOUCH = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  if (TOUCH) document.body.classList.add('touch');
  function floatEnd(e) {
    if (e.pointerId !== joy.id) return false;
    joyEnd(e); stick.style.display = '';
    return true;
  }
  var look = { id: null, x: 0, y: 0 };
  canvas.addEventListener('pointerdown', function (e) {
    if (chatOpen) { closeChat(); return; }
    tapStart(e);
    if (e.pointerType === 'touch' && joy.id === null && playing && !uiOpen && e.clientY > window.innerHeight * 0.5) {
      joy.id = e.pointerId;
      stick.style.left = (e.clientX - 64) + 'px'; stick.style.top = (e.clientY - 64) + 'px'; stick.style.bottom = 'auto';
      stick.style.display = 'block';
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      joyMove(e); e.preventDefault();
      return;
    }
    if (look.id !== null) return;
    look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  });
  canvas.addEventListener('pointermove', function (e) {
    if (joy.id !== null && e.pointerId === joy.id) { joyMove(e); return; }
    if (e.pointerId !== look.id) return;
    cam.yaw -= (e.clientX - look.x) * 0.007;
    cam.pitch += (e.clientY - look.y) * 0.005;
    cam.pitch = Math.max(0.12, Math.min(1.05, cam.pitch));
    look.x = e.clientX; look.y = e.clientY;
  });
  function lookEnd(e) { if (e.type === 'pointerup') tapEnd(e); else delete tap[e.pointerId]; if (floatEnd(e)) return; if (e.pointerId === look.id) look.id = null; }
  canvas.addEventListener('pointerup', lookEnd);
  canvas.addEventListener('pointercancel', lookEnd);
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  var keys = {};
  function typing(e) { return e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'); }
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
    if (moving && mySit) {                               // 앉아 있을 때 움직이려 하면 먼저 일어선다
      moving = false;
      if (now - lastStand > 600) { lastStand = now; sendMsg({ t: 'stand' }); }
    }
    if (moving) {
      var sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
      var vx = (-sy * iy + cy * ix), vz = (-cy * iy - sy * ix);
      var nx = P.x + vx * W.SPEED * dt, nz = P.z + vz * W.SPEED * dt;
      if (!W.blocked(area, nx, P.z, furnCols)) P.x = nx;
      if (!W.blocked(area, P.x, nz, furnCols)) P.z = nz;
      P.face = turn(P.face, Math.atan2(vx, vz), Math.min(1, dt * 12));
      P.walk += dt * 11 * mag;
    }
    player.position.set(P.x, mySit ? 0.3 : (moving ? Math.abs(Math.sin(P.walk)) * 0.09 : 0), P.z);
    player.rotation.y = P.face;
    var umbShow = area === 'out' && E.wet > 0.02;       // 우산은 야외에서 비나 눈이 올 때만 보인다
    pose(player, moving, P.walk, myUmb && umbShow, mySit);
    expireBubble(player, now);
    var ub = $('umbBtn');
    if (playing && umbShow && !chatOpen) {
      var ul = myUmb ? '우산 접기' : '우산 쓰기';
      if (ub.textContent !== ul) ub.textContent = ul;
      ub.style.display = 'block';
    } else ub.style.display = 'none';

    // 내 위치를 초당 10번까지 서버로 보낸다
    if (playing && !mySit && now - lastSend > 100 && now > lockUntil &&
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
      o.g.position.y = o.sit ? 0.3 : (dd > 0.05 ? Math.abs(Math.sin(o.walk)) * 0.09 : 0);
      pose(o.g, dd > 0.05 && !o.sit, o.walk, o.umb && umbShow, o.sit);
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
        pose(n.g, false, 0, false);
        want = d < 6.5 ? Math.atan2(P.x - n.x, P.z - n.z) : 0;
        n.g.rotation.y = turn(n.g.rotation.y, want, Math.min(1, dt * 5));
      }
    }
    if (area !== 'out') {
      var sp = area === 'in' ? spots : (area === 'f12' ? ceoSpots : floorSpots), si, sd, sbest = 1e9;
      for (si = 0; si < sp.length; si++) {
        sd = Math.sqrt((P.x - sp[si].x) * (P.x - sp[si].x) + (P.z - sp[si].z) * (P.z - sp[si].z));
        if (sd < sp[si].r && sd < sbest) { sbest = sd; current = sp[si]; }
      }
      if (mySit) current = { label: '일어서기', run: function () { sendMsg({ t: 'stand' }); } };
      else if (area !== 'in') {
        var seat = nearSeat();
        if (seat && seat.d < sbest) current = { label: '앉기', run: function () { sendMsg({ t: 'sit', id: seat.id, slot: seat.slot }); } };
      }
    }
    var act = $('act');
    if (current && !uiOpen && !chatOpen && playing) {
      if (act.textContent !== current.label) act.textContent = current.label;
      act.style.display = 'block';
    } else act.style.display = 'none';

    if (deco.on) {                                       // 꾸미기 모드: 위에서 내려다본다
      decoCamera();
      envTick(dt, now / 1000, 0, deco.H, 0);
      renderer.render(scene, camera);
      return;
    }
    // 3인칭 카메라
    var dist = area !== 'out' ? 5.6 : 8;
    var h = Math.cos(cam.pitch) * dist;
    var cx = P.x + Math.sin(cam.yaw) * h, cz = P.z + Math.cos(cam.yaw) * h;
    var cyy = 1.3 + Math.sin(cam.pitch) * dist;
    if (area !== 'out') {
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
    envTick(dt, now / 1000, cx, cyy, cz);

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  if (token) connect(); else showAuth();
}
// 글꼴을 먼저 불러온 뒤 시작한다 (간판과 이름표 글씨를 그림으로 굽기 때문). 4초 안에 안 오면 그냥 시작.
(function () {
  var started = false;
  function go() { if (!started) { started = true; bonsaBoot(); } }
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 40px "Maplestory"', '본사'), document.fonts.load('400 20px "Maplestory"', '본사')]).then(go, go);
    setTimeout(go, 4000);
  } else go();
})();
