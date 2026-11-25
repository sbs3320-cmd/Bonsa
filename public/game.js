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
    '엘리베이터: 로비와 1~10구역, 사장실 사이는 엘리베이터로 오갑니다. 엘리베이터 앞에 서면 구역 고르는 창이 바로 떠요. 게임마을도 로비 엘리베이터에서 갑니다.',
    '구역 안내판: 각 구역 엘리베이터 옆 안내판에서 그 구역에 등록하거나 등록을 해제할 수 있습니다.',
    '구역 등록: 1~10구역 중 한 곳에 등록할 수 있습니다. 구역마다 열매 기도 나무와 구역원이 꾸미는 전도 게시판이 있어요.',
    '꾸미기: 등록한 구역에서 메뉴의 꾸미기를 누르면 가구를 놓고, 옮기고, 돌리고, 지울 수 있습니다. 의자와 소파에는 앉을 수 있어요.',
    '게시판: 로비 전체 게시판은 누구나 읽고, 구역 게시판은 그 구역에 등록한 구역원이 글을 씁니다. 고정한 글은 게시판에 종이로 붙어요.',
    '직급: 인턴으로 시작해 사원, 부팀장, 팀장, 부장, 사장 순으로 올라갑니다. 팀장 이상이 아래 직급을 승진시킵니다.',
    '메뉴: 오른쪽 위 메뉴에서 프로필, 사원 명부, 게시판, 음악 설정, 로그아웃을 쓸 수 있어요. 캐릭터를 눌러도 프로필이 열립니다.',
    '이벤트: 메뉴의 이벤트에서 참가 신청을 하면 부팀장 이상이 성공을 판정하고, 성공하면 코인을 받습니다.',
    '상점: 메뉴의 상점에서 코인으로 털 색과 모자를 사고, 꾸미기에서 가구를 삽니다. 처음에 200코인을 드려요.',
    '무거마을의 본투비헤븐에서는 방명록과 기도제목을, 게임마을 플레이존에서는 게임으로 코인을 받을 수 있어요. 매일 첫 접속에 출석 코인도 드려요!'
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
  // 해 그림자: 내 캐릭터 주변 60m 사각형만 그림자 지도에 담아 가볍게 한다. 화질 '낮음'에서는 끈다.
  var shadowsOn = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(Math.min(window.innerWidth, window.innerHeight) < 700 ? 1024 : 2048, Math.min(window.innerWidth, window.innerHeight) < 700 ? 1024 : 2048);
  (function (c) { c.left = -30; c.right = 30; c.top = 30; c.bottom = -30; c.near = 5; c.far = 150; c.updateProjectionMatrix(); })(sun.shadow.camera);
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun.target);

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
      x.fillStyle = '#62a14a'; x.fillRect(0, 0, n, n);
      for (var i = 0; i < 1100; i++) {
        x.fillStyle = ['#578f40', '#6daf53', '#4f8a3b', '#79ba5c', '#5c9a45'][i % 5];
        x.fillRect(rnd() * n, rnd() * n, 1.5, 2 + rnd() * 4);
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
  // 움직이지 않는 물체를 재질별로 하나로 합친다. 그리는 횟수(드로우 콜)가 크게 줄어 폰에서 빨라진다.
  // userData.dyn 이 붙은 것(흔들리는 나뭇잎, 깃발, 구름)과 그 아래는 건드리지 않는다.
  var mInv = new THREE.Matrix4(), mRel = new THREE.Matrix4();
  function joinArrays(list) {
    var n = 0, o = 0, out, i;
    for (i = 0; i < list.length; i++) n += list[i].length;
    out = new Float32Array(n);
    for (i = 0; i < list.length; i++) { out.set(list[i], o); o += list[i].length; }
    return out;
  }
  function mergeStatic(root, deep) {
    root.updateMatrixWorld(true);
    mInv.copy(root.matrixWorld).invert();
    var groups = {};
    (function walk(o) {
      o.children.slice().forEach(function (ch) {
        if (ch.userData.dyn) return;
        if (ch.isMesh && !ch.isInstancedMesh && !Array.isArray(ch.material) && ch.geometry.attributes.uv && ch.geometry.attributes.normal && !ch.geometry.attributes.color) {
          var k = ch.material.uuid + '|' + ch.castShadow + '|' + ch.receiveShadow;
          (groups[k] = groups[k] || []).push(ch);
        }
        if (deep) walk(ch);
      });
    })(root);
    Object.keys(groups).forEach(function (k) {
      var list = groups[k];
      if (list.length < 2) return;
      var pos = [], nor = [], uv = [];
      list.forEach(function (m) {
        var g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        mRel.multiplyMatrices(mInv, m.matrixWorld); g.applyMatrix4(mRel);
        pos.push(g.attributes.position.array); nor.push(g.attributes.normal.array); uv.push(g.attributes.uv.array);
        g.dispose(); m.parent.remove(m);
      });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(joinArrays(pos), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(joinArrays(nor), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(joinArrays(uv), 2));
      geo.computeBoundingSphere();
      var mm = new THREE.Mesh(geo, list[0].material);
      mm.castShadow = list[0].castShadow; mm.receiveShadow = list[0].receiveShadow;
      root.add(mm);
    });
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
  // 이름표·말풍선은 가로등이나 나무에 가려지지 않게 늘 맨 앞에 그린다
  function onTop(sp) { sp.material.depthTest = false; sp.renderOrder = 20; return sp; }
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


  /* ---------- 캐릭터 (오리지널 디자인: 머리가 큰 양 사원 + 정장 + 사원증) ---------- */
  // 몸통(자켓) 타원체의 크기. 셔츠·넥타이·옷깃은 이 표면을 따라 붙인다.
  var TOR = { y: 0.66, ax: 0.39, ay: 0.37, az: 0.35 };
  var HOOD = { y: 1.5, z: -0.06, r: 0.57 }, FACEC = { y: 1.43, z: 0.09, r: 0.47 };
  var gTorso = new THREE.SphereGeometry(0.5, 24, 16);
  var gHood = new THREE.SphereGeometry(HOOD.r, 24, 18);
  var gFace = new THREE.SphereGeometry(FACEC.r, 24, 18);
  var gEarS = new THREE.SphereGeometry(0.4, 12, 10);
  var gEye = new THREE.SphereGeometry(0.055, 10, 8), gShine = new THREE.SphereGeometry(0.02, 6, 5);
  var gPuff2 = new THREE.SphereGeometry(0.11, 8, 6);          // 작은 털뭉치
  var gSleeve = new THREE.SphereGeometry(0.12, 10, 8), gHand = new THREE.SphereGeometry(0.085, 10, 8);
  var gCuff = new THREE.CylinderGeometry(0.085, 0.085, 0.05, 10);
  var gLeg = new THREE.CylinderGeometry(0.115, 0.1, 0.3, 10), gShoe = new THREE.SphereGeometry(0.15, 12, 8);
  var gLan = new THREE.BoxGeometry(0.04, 1, 0.02);          // 목걸이 줄 (길이는 scale.y)
  var gCard = new THREE.BoxGeometry(0.3, 0.36, 0.03), gCardTop = new THREE.BoxGeometry(0.3, 0.09, 0.036);
  var gPhoto = new THREE.BoxGeometry(0.11, 0.13, 0.036), gLine = new THREE.BoxGeometry(0.1, 0.024, 0.036);
  var gClip = new THREE.BoxGeometry(0.07, 0.06, 0.04), gPocket = new THREE.BoxGeometry(0.085, 0.045, 0.02);
  var gCheek = new THREE.SphereGeometry(0.075, 10, 8), gMouth = new THREE.TorusGeometry(0.05, 0.013, 5, 10, Math.PI);
  var gKnot = new THREE.SphereGeometry(0.05, 10, 8);
  var LANYARD = 0x2f9bff, SHIRT = 0xfbfbf8, SHOE = 0x3a2f2c;
  // 몸통 표면에 붙는 얇은 조각 (셔츠의 V, 넥타이, 옷깃). v 는 위(0)에서 아래(1), 폭은 각도(라디안)로 준다.
  function torsoPatch(t0, t1, range, k, nv) {
    var nu = 6, pos = [], idx = [], i, j, v, th, r, ph;
    nv = nv || 12;
    for (j = 0; j <= nv; j++) {
      v = j / nv; th = t0 + (t1 - t0) * v; r = range(v);
      for (i = 0; i <= nu; i++) {
        ph = r[0] + (r[1] - r[0]) * i / nu;
        pos.push(Math.sin(th) * Math.sin(ph) * TOR.ax * k, TOR.y + Math.cos(th) * TOR.ay * k, Math.sin(th) * Math.cos(ph) * TOR.az * k);
      }
    }
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  function vHalf(v) { return 0.5 * (1 - v); }                        // 셔츠가 보이는 V의 반폭
  var V_T0 = 0.35, V_T1 = 1.62;
  var gShirt = torsoPatch(V_T0, V_T1, function (v) { return [-vHalf(v), vHalf(v)]; }, 1.012);
  var gLapelL = torsoPatch(V_T0, V_T1, function (v) { var h = vHalf(v); return [-h - 0.17 + v * 0.1, -h]; }, 1.007);
  var gLapelR = torsoPatch(V_T0, V_T1, function (v) { var h = vHalf(v); return [h, h + 0.17 - v * 0.1]; }, 1.007);
  // 넥타이: 매듭 아래가 좁았다가 점점 넓어지고 끝이 뾰족하다
  var gTie = torsoPatch(0.82, 1.5, function (v) {
    var w = v > 0.86 ? 0.13 * (1 - v) / 0.14 : 0.055 + 0.075 * v / 0.86;
    return [-w, w];
  }, 1.024, 16);
  function onTorso(th, ph, k) {
    return new THREE.Vector3(Math.sin(th) * Math.sin(ph) * TOR.ax * k, TOR.y + Math.cos(th) * TOR.ay * k, Math.sin(th) * Math.cos(ph) * TOR.az * k);
  }
  function part(geo, color, x, y, z, parent) {
    var m = new THREE.Mesh(geo, mat(color)); m.position.set(x, y, z); parent.add(m); return m;
  }
  // 두 점 사이를 잇는 막대 (목걸이 줄)
  var UP = new THREE.Vector3(0, 1, 0);
  function rod(geo, color, a, b, parent) {
    var m = new THREE.Mesh(geo, mat(color)), dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.scale.y = len; m.quaternion.setFromUnitVectors(UP, new THREE.Vector3(dx / len, dy / len, dz / len));
    parent.add(m); return m;
  }
  function shade(hex, k) {                                          // 같은 색을 조금 어둡게 (옷깃)
    var r = Math.round(((hex >> 16) & 255) * k), g = Math.round(((hex >> 8) & 255) * k), b = Math.round((hex & 255) * k);
    return (r << 16) | (g << 8) | b;
  }
  var gShadow = new THREE.CircleGeometry(0.58, 20);
  var shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false });
  var gUmbTop = new THREE.ConeGeometry(1.05, 0.4, 12, 1, true);
  var gUmbPole = new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6);
  var UMB_COLORS = [0xe5534b, 0x3b82c4, 0xf2b441, 0x3fa56b, 0x8e6bd1, 0xf08aa8];
  var umbMats = UMB_COLORS.map(function (c) { return new THREE.MeshLambertMaterial({ color: new THREE.Color(c).convertSRGBToLinear(), side: THREE.DoubleSide }); });
  // 기본 털 색 (상점에서 색을 사지 않았을 때 번호에 따라 정해진다)
  var BODY_COLORS = [0xfff6e6, 0xffe1e8, 0xe1eeff, 0xe6f6dc, 0xfff0c2, 0xece1ff, 0xdff5f1, 0xffe9d9];
  var FACE = 0xffe2cf, EAR = 0xf7c9b6;                          // 얼굴과 손, 귀
  var SIT_Y = 0.22, TAG_Y = 2.5, TAG_Y_UMB = 3.2, BUBBLE_Y = 3.15, BUBBLE_Y_UMB = 3.85;
  function setTag(g, text, rep) {
    dropSprite(g.userData.tag); dropSprite(g.userData.repTag); g.userData.repTag = null;
    var tag = labelSprite(text, 0.42, { bg: 'rgba(20,28,40,0.78)', fs: 44, padX: 22, padY: 12 });
    onTop(tag); tag.position.y = TAG_Y; g.add(tag); g.userData.tag = tag; g.userData.tagText = text;
    if (rep) {                                                     // 층 대표자: 이름표 위에 금색 띠
      var rt = labelSprite('★ ' + W.floorName(rep) + ' 대표', 0.32, { bg: 'rgba(214,160,30,0.95)', color: '#ffffff', fs: 40, padX: 18, padY: 8 });
      onTop(rt); rt.position.y = TAG_Y + 0.4; g.add(rt); g.userData.repTag = rt;
    }
    g.userData.rep = rep || 0;
  }
  function say(g, text) {
    dropSprite(g.userData.bubble);
    var short = text.length > 28 ? text.slice(0, 28) + '…' : text;
    var b = labelSprite(short, 0.46, { bg: '#ffffff', color: '#1c2430', fs: 44, radius: 26 });
    onTop(b); b.position.y = BUBBLE_Y + (g.userData.repTag ? 0.4 : 0); g.add(b);
    g.userData.bubble = b; g.userData.bubbleUntil = performance.now() + 5000;
  }
  // 캐릭터: 두 발로 서는 양 모양의 사원. 직접 디자인한 모습이다.
  // 큼직한 털 후드 속에 살구색 얼굴이 쏙 나와 있고, 반짝이는 큰 눈, 처진 귀, 분홍 코가 있다.
  // 몸에는 정장(자켓, 셔츠, 넥타이, 바지, 구두)을 입고 목에 사원증을 건다.
  // 털 색은 상점의 색 치장, 자켓·바지·넥타이 색은 상점의 정장 치장으로 바뀐다.
  function makeCharacter(color, tagText, umbIndex) {
    var g = new THREE.Group(), wool = [], detail = [];
    function fluff(geo, x, y, z, s) {                             // 털 조각: 색 치장이 적용되는 부분
      var m = new THREE.Mesh(geo, mat(color));
      m.position.set(x, y, z); if (s) m.scale.set(s, s, s); g.add(m); wool.push(m); return m;
    }
    function onHood(x, y) { var q = HOOD.r * HOOD.r - x * x - (y - HOOD.y) * (y - HOOD.y); return HOOD.z + Math.sqrt(Math.max(0.03, q)); }
    function onFace(x, y) { var q = FACEC.r * FACEC.r - x * x - (y - FACEC.y) * (y - FACEC.y); return FACEC.z + Math.sqrt(Math.max(0.01, q)); }
    // 머리: 털 후드 + 얼굴
    fluff(gHood, 0, HOOD.y, HOOD.z);
    part(gFace, FACE, 0, FACEC.y, FACEC.z, g);
    [-25, 15, 50, 90, 130, 165, 205].forEach(function (deg) {       // 얼굴 둘레 털뭉치
      var r = deg * Math.PI / 180, x = Math.cos(r) * 0.45, y = 1.45 + Math.sin(r) * 0.45;
      detail.push(fluff(gPuff2, x, y, onHood(x, y) - 0.05, 1.35));
    });
    detail.push(fluff(gPuff2, 0, 2.03, 0.06, 1.2), fluff(gPuff2, -0.13, 1.99, 0.14, 1.05), fluff(gPuff2, 0.13, 1.99, 0.14, 1.05));
    [-1, 1].forEach(function (sd) {                                // 옆으로 처진 귀
      var ear = part(gEarS, EAR, sd * 0.6, 1.42, 0.02, g);
      ear.scale.set(0.55, 0.26, 0.36); ear.rotation.z = sd * -0.55;
    });
    [-0.165, 0.165].forEach(function (x) {                          // 크고 반짝이는 눈
      var e = part(gEye, 0x2a2320, x, 1.47, onFace(x, 1.47) - 0.02, g); e.scale.set(1.5, 1.85, 1);
      var s = part(gShine, 0xffffff, x + 0.03, 1.51, onFace(x + 0.03, 1.51) + 0.03, g);
      detail.push(e, s);
    });
    var nose = part(gEye, 0xf08aa0, 0, 1.39, onFace(0, 1.39) - 0.01, g); nose.scale.set(1.2, 0.8, 0.8); detail.push(nose);
    [-0.27, 0.27].forEach(function (x) {
      var ck = part(gCheek, 0xf7a3ab, x, 1.36, onFace(x, 1.36) - 0.03, g); ck.scale.set(1.1, 0.7, 0.5); detail.push(ck);
    });
    var mouth = part(gMouth, 0x2a2320, 0, 1.335, onFace(0, 1.335) - 0.005, g); mouth.rotation.z = Math.PI; detail.push(mouth);
    // 몸: 자켓, 셔츠 V, 옷깃, 넥타이, 행커치프
    var torso = part(gTorso, 0x2c3e66, 0, TOR.y, 0, g); torso.scale.set(TOR.ax / 0.5, TOR.ay / 0.5, TOR.az / 0.5);
    var shirt = part(gShirt, SHIRT, 0, 0, 0, g);
    var lapL = part(gLapelL, 0x22314f, 0, 0, 0, g), lapR = part(gLapelR, 0x22314f, 0, 0, 0, g);
    var tie = part(gTie, 0xd0343c, 0, 0, 0, g);
    var kp = onTorso(0.86, 0, 1.03), knot = part(gKnot, 0xd0343c, kp.x, kp.y, kp.z, g); knot.scale.set(1.25, 1, 0.6);
    var pp = onTorso(1.2, 0.62, 1.01), pocket = part(gPocket, 0xffffff, pp.x, pp.y, pp.z, g); pocket.rotation.y = 0.55;
    detail.push(lapL, lapR, pocket);
    detail.push(fluff(gPuff2, 0, 0.42, -0.32, 1.15));              // 꼬리 (자켓 뒤로 쏙)
    // 사원증: 목에서 내려온 줄 두 가닥이 가슴 앞 클립에 모이고, 그 아래 카드가 달린다
    var clip = new THREE.Vector3(0, 0.675, 0.375);
    detail.push(rod(gLan, LANYARD, new THREE.Vector3(-0.15, 0.93, 0.25), new THREE.Vector3(-0.035, clip.y + 0.02, clip.z), g));
    detail.push(rod(gLan, LANYARD, new THREE.Vector3(0.15, 0.93, 0.25), new THREE.Vector3(0.035, clip.y + 0.02, clip.z), g));
    detail.push(part(gClip, 0xc9d0da, clip.x, clip.y, clip.z, g));
    var badge = new THREE.Group();
    part(gCard, 0xffffff, 0, 0, 0, badge);
    part(gCardTop, LANYARD, 0, 0.135, 0, badge);
    part(gPhoto, 0xffd9a8, -0.075, -0.03, 0, badge);
    part(gLine, 0x8a94a3, 0.07, 0.0, 0, badge); part(gLine, 0xb7bfca, 0.07, -0.05, 0, badge);
    part(gLine, 0xb7bfca, 0, -0.135, 0, badge).scale.x = 2.4;
    badge.position.set(0, 0.48, 0.39); badge.rotation.x = -0.1; g.add(badge); detail.push(badge);
    // 팔: 어깨에서 내려오는 소매 + 셔츠 소맷부리 + 손
    var arms = [], sleeves = [];
    [-1, 1].forEach(function (sd) {
      var a = new THREE.Group(); a.position.set(sd * 0.38, 0.85, 0.0);
      var sl = part(gSleeve, 0x2c3e66, 0, -0.15, 0, a); sl.scale.set(1, 1.75, 1); sleeves.push(sl);
      part(gCuff, SHIRT, 0, -0.33, 0, a);
      part(gHand, FACE, 0, -0.39, 0, a);
      a.rotation.z = sd * 0.2; a.userData.sd = sd;
      g.add(a); arms.push(a);
    });
    // 다리: 엉덩이에서 내려오는 바지 + 구두. 걸을 때는 엉덩이를 축으로 흔든다
    var legs = [], pants = [];
    [-1, 1].forEach(function (sd) {
      var l = new THREE.Group(); l.position.set(sd * 0.15, 0.4, 0);
      pants.push(part(gLeg, 0x3d4049, 0, -0.14, 0, l));
      var sh = part(gShoe, SHOE, 0, -0.31, 0.05, l); sh.scale.set(0.85, 0.6, 1.3);
      g.add(l); legs.push(l);
    });
    var shd = new THREE.Mesh(gShadow, shadowMat);
    shd.rotation.x = -Math.PI / 2; shd.position.y = 0.03; g.add(shd);
    var umb = new THREE.Group();
    var top = new THREE.Mesh(gUmbTop, umbMats[(umbIndex || 0) % umbMats.length]);
    top.position.set(0.47, 2.85, 0.2); umb.add(top);
    var pole = new THREE.Mesh(gUmbPole, mat(0x4a4f57));
    pole.position.set(0.47, 1.95, 0.2); umb.add(pole);
    umb.visible = false; g.add(umb);
    g.userData.legs = legs; g.userData.arms = arms; g.userData.shadow = shd; g.userData.umb = umb;
    g.userData.skin = wool; g.userData.hat = null;
    g.userData.suit = { jacket: [torso].concat(sleeves), lapel: [lapL, lapR], pants: pants, tie: [tie, knot] };
    g.userData.detail = detail; g.userData.far = false;
    g.traverse(function (o) { if (o.isMesh && o !== shd) o.castShadow = true; });
    setTag(g, tagText);
    return g;
  }
  // 치장: 털 색, 모자, 정장(자켓·바지·넥타이). 산 것이 없으면 기본값을 쓴다.
  var crownMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0xf0c419).convertSRGBToLinear(), side: THREE.DoubleSide });
  // 모자는 예전 머리 크기에 맞춰 만든 뒤, 커진 머리에 맞게 통째로 키워 얹는다
  var HAT_S = HOOD.r / 0.42;
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
    } else if (key === 'h_santa') {
      var sc0 = add(new THREE.ConeGeometry(0.36, 0.72, 14), 0xd62f2f, 0.05, 2.06, -0.04); sc0.rotation.z = -0.38;
      add(new THREE.TorusGeometry(0.37, 0.1, 8, 22), 0xf7f7f2, 0, 1.74, -0.02).rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(0.12, 10, 8), 0xf7f7f2, 0.2, 2.4, -0.04);
    } else if (key === 'h_crown') {
      add(new THREE.CylinderGeometry(0.27, 0.25, 0.18, 14, 1, true), 0xf0c419, 0, 1.86, 0).material = crownMat;
      for (var i = 0; i < 6; i++) add(new THREE.ConeGeometry(0.07, 0.16, 6), 0xf0c419, Math.cos(i * Math.PI / 3) * 0.25, 2.02, Math.sin(i * Math.PI / 3) * 0.25);
      add(new THREE.SphereGeometry(0.05, 8, 6), 0xd9483b, 0, 1.88, 0.27);
    } else return null;
    g.scale.setScalar(HAT_S);
    g.position.set(0, HOOD.y - 1.47 * HAT_S - 0.05, HOOD.z + 0.08 * HAT_S);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function cosmHex(key, slot, fallback) {
    var it = key && Object.prototype.hasOwnProperty.call(W.COSM, key) ? W.COSM[key] : null;
    return it && it.slot === slot ? it.hex : W.COSM[fallback].hex;
  }
  // L: { c: 털 색, h: 모자, j: 자켓, pa: 바지, ti: 넥타이 } (빈 값이면 기본)
  function applyLook(g, id, L) {
    L = L || {};
    var u = g.userData, item = L.c && Object.prototype.hasOwnProperty.call(W.COSM, L.c) ? W.COSM[L.c] : null;
    var skin = mat(item && item.slot === 'color' ? item.hex : BODY_COLORS[id % BODY_COLORS.length]), i, h = L.h || '';
    for (i = 0; i < u.skin.length; i++) u.skin[i].material = skin;
    var jx = cosmHex(L.j, 'jacket', W.SUIT_DEF.jacket), jm = mat(jx), lm = mat(shade(jx, 0.8));
    var pm = mat(cosmHex(L.pa, 'pants', W.SUIT_DEF.pants)), tm = mat(cosmHex(L.ti, 'tie', W.SUIT_DEF.tie));
    u.suit.jacket.forEach(function (m) { m.material = jm; });
    u.suit.lapel.forEach(function (m) { m.material = lm; });
    u.suit.pants.forEach(function (m) { m.material = pm; });
    u.suit.tie.forEach(function (m) { m.material = tm; });
    if (u.hatKey === h) return;
    if (u.hat) { g.remove(u.hat); for (i = 0; i < u.hat.children.length; i++) u.hat.children[i].geometry.dispose(); }
    u.hat = h && Object.prototype.hasOwnProperty.call(W.COSM, h) ? buildHat(h) : null; u.hatKey = h;
    u.hatLift = !u.hat ? 0 : (h === 'h_santa' || h === 'h_party') ? 0.4 : h === 'h_crown' ? 0.15 : 0.05;   // 모자 높이만큼 이름표를 올린다
    if (u.hat) g.add(u.hat);
  }
  function lookOf(o) { return { c: o.c || '', h: o.h || '', j: o.j || '', pa: o.pa || '', ti: o.ti || '' }; }
  // 거리별 표현(LOD): 멀리 있는 캐릭터는 눈, 입, 사원증 같은 작은 부품을 숨긴다.
  function setFar(g, far) {
    var u = g.userData;
    if (u.far === far) return;
    u.far = far;
    for (var i = 0; i < u.detail.length; i++) u.detail[i].visible = !far;
  }
  // 걷는 동작, 우산 든 자세, 앉은 자세
  function pose(g, moving, walk, umbOn, sitting) {
    var u = g.userData, s = moving ? Math.sin(walk) : 0;
    if (sitting) { u.legs[0].rotation.x = u.legs[1].rotation.x = -1.35; }
    else { u.legs[0].rotation.x = s * 0.6; u.legs[1].rotation.x = -s * 0.6; }
    u.arms[0].rotation.x = sitting ? -0.35 : -s * 0.55;
    if (umbOn) { u.arms[1].rotation.x = -2.5; u.arms[1].rotation.z = 0.05; }
    else { u.arms[1].rotation.x = sitting ? -0.35 : s * 0.55; u.arms[1].rotation.z = 0.2; }
    u.umb.visible = umbOn;
    u.shadow.position.y = 0.03 - g.position.y; u.shadow.visible = !sitting && !shadowsOn;
    var lift = umbOn ? 0 : (u.hatLift || 0), up = (u.repTag ? 0.4 : 0) + lift;
    if (u.tag) u.tag.position.y = (umbOn ? TAG_Y_UMB : TAG_Y) + lift;
    if (u.repTag) u.repTag.position.y = (umbOn ? TAG_Y_UMB : TAG_Y) + lift + 0.4;
    if (u.bubble) u.bubble.position.y = (umbOn ? BUBBLE_Y_UMB : BUBBLE_Y) + up;
  }
  function tagOf(rank, name) { return '[' + (RANKS[rank] || rank) + '] ' + name; }

  /* ---------- 야외 ---------- */
  var outdoor = new THREE.Group(), lobby = new THREE.Group();
  scene.add(outdoor); scene.add(lobby);
  // 무거마을에만 있는 본사 건물(hq)과 삼산·성남 가운데의 마을 엘리베이터·분수(vill). 나머지 야외는 세 마을이 같이 쓴다.
  var hq = new THREE.Group(), vill = new THREE.Group();
  hq.userData.dyn = true; vill.userData.dyn = true; vill.visible = false;
  outdoor.add(hq); outdoor.add(vill);

  var env = { trees: [], clouds: [], lampGlows: [], lampPools: [] };   // 시간·날씨에 따라 바뀌는 것들
  (function buildOutdoor() {
    // 땅: 잔디 무늬 위에 넓은 얼룩(꼭짓점 색)을 겹쳐 반복 무늬가 덜 보이게 한다
    var gGround = new THREE.PlaneGeometry(200, 200, 64, 64), gpos = gGround.attributes.position, gcol = [], gi, gx, gy, nz;
    for (gi = 0; gi < gpos.count; gi++) {
      gx = gpos.getX(gi); gy = gpos.getY(gi);
      nz = 0.5 + 0.28 * Math.sin(gx * 0.13 + 1.3) * Math.cos(gy * 0.11 - 0.4) + 0.22 * Math.sin(gx * 0.037 - gy * 0.053 + 2.1);
      gcol.push(0.8 + nz * 0.26, 0.86 + nz * 0.16, 0.74 + nz * 0.14);
    }
    gGround.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
    var ground = new THREE.Mesh(gGround, new THREE.MeshLambertMaterial({ map: grassTex(70, 70), vertexColors: true }));
    ground.rotation.x = -Math.PI / 2; ground.userData.rcv = true; outdoor.add(ground);
    var pave = tileTex('#c4b9a5', '#a39983', 1, 1);
    var path = new THREE.Mesh(new THREE.PlaneGeometry(5, 34), texMat(pave.clone()));
    path.material.map.repeat.set(5, 34); path.material.map.needsUpdate = true;
    path.rotation.x = -Math.PI / 2; path.position.set(0, 0.02, 23); path.userData.rcv = true; outdoor.add(path);
    var plaza = new THREE.Mesh(new THREE.PlaneGeometry(22, 5), texMat(pave.clone()));
    plaza.material.map.repeat.set(22, 5); plaza.material.map.needsUpdate = true;
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.02, 8.5); plaza.userData.rcv = true; outdoor.add(plaza);
    // 길 가장자리 돌 (발목 아래 높이라 걷는 데는 걸리지 않는다)
    var curb = 0x8f887a;
    box(0.22, 0.1, 29, curb, -2.6, 0.05, 25.5, outdoor); box(0.22, 0.1, 29, curb, 2.6, 0.05, 25.5, outdoor);
    box(8.6, 0.1, 0.22, curb, -6.8, 0.05, 11.1, outdoor); box(8.6, 0.1, 0.22, curb, 6.8, 0.05, 11.1, outdoor);
    box(0.22, 0.1, 5.2, curb, -11.1, 0.05, 8.5, outdoor); box(0.22, 0.1, 5.2, curb, 11.1, 0.05, 8.5, outdoor);

    // 하늘: 지평선은 밝고 위로 갈수록 짙어지는 둥근 하늘. 해 쪽은 살짝 환하다. (색은 envTick 이 시간·날씨대로 바꾼다)
    env.skyMat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunCol: { value: new THREE.Color(1, 0.95, 0.8) }, sunAmt: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunAmt; varying vec3 vDir;' +
        'void main() { vec3 d = normalize(vDir); float h = clamp(d.y, 0.0, 1.0);' +
        'vec3 c = mix(bottom, top, smoothstep(0.0, 0.6, h));' +
        'float s = max(dot(d, normalize(sunDir)), 0.0);' +
        'c += sunCol * (pow(s, 6.0) * 0.18 + pow(s, 60.0) * 0.35) * sunAmt;' +
        'gl_FragColor = vec4(c, 1.0); }',
      side: THREE.BackSide, depthWrite: false, fog: false
    });
    env.sky = new THREE.Mesh(new THREE.SphereGeometry(195, 24, 12), env.skyMat);
    env.sky.frustumCulled = false; env.sky.renderOrder = -10; env.sky.userData.ns = true; outdoor.add(env.sky);

    // 멀리 보이는 둥근 언덕 (안개에 섞여 원경이 된다)
    var gHill = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    for (var hI = 0; hI < 16; hI++) {
      var ang = hI / 16 * Math.PI * 2 + 0.3, rad = 84 + (hI % 3) * 8;
      var hill = new THREE.Mesh(gHill, mat(hI % 2 ? 0x6a9f5e : 0x79ab69));
      hill.scale.set(22 + (hI % 4) * 6, 7 + (hI % 5) * 2.5, 18 + (hI % 3) * 6);
      hill.rotation.y = -ang; hill.position.set(Math.cos(ang) * rad, -1, Math.sin(ang) * rad); hill.userData.ns = true; outdoor.add(hill);
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
    tower.position.y = 18; hq.add(tower);
    box(16.3, 1.0, 12.3, 0x8d96a3, 0, 0.5, 0, hq);                 // 기단
    [[-8, 6], [8, 6], [-8, -6], [8, -6]].forEach(function (p) { box(0.7, 36, 0.7, 0xd3d9e1, p[0], 18, p[1], hq); });   // 모서리 기둥
    box(16.6, 0.7, 12.6, 0xc9d0da, 0, 36.35, 0, hq);               // 옥상 난간
    box(4, 1.6, 3, 0x9aa3b0, -4, 37.5, -2, hq);                    // 옥상 설비
    box(2.2, 1.1, 2.2, 0xaab3bf, 4.5, 37.25, -3, hq);
    var ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), mat(0x6b7480));
    ant.position.set(5.5, 39.2, 2); hq.add(ant);
    // 층마다 바깥으로 살짝 튀어나온 띠와 세로 기둥: 그림자가 지면서 건물에 입체감이 생긴다
    for (var lv = 1; lv < 12; lv++) box(16.5, 0.16, 12.5, 0xeef1f5, 0, lv * 3, 0, hq);
    [-1, 1].forEach(function (sd) {
      for (var fi = 1; fi < 6; fi++) box(0.16, 32, 0.36, 0xdfe4ea, -8 + fi * 16 / 6, 20, sd * 6.12, hq);
      for (fi = 1; fi < 4; fi++) box(0.36, 32, 0.16, 0xdfe4ea, sd * 8.12, 20, -6 + fi * 3, hq);
    });
    var tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 16), mat(0xc9d0da));
    tank.position.set(-4.2, 39.1, 3.2); hq.add(tank);
    [[-4.9, 2.5], [-3.5, 2.5], [-4.9, 3.9], [-3.5, 3.9]].forEach(function (q) { box(0.12, 1.0, 0.12, 0x6b7480, q[0], 37.2, q[1], hq); });

    // 정문, 차양, 간판
    box(4.2, 3.6, 0.5, 0x4a5566, 0, 1.8, 6.1, hq);
    box(1.45, 3, 0.1, 0x9fd0ee, -0.78, 1.5, 6.38, hq);
    box(1.45, 3, 0.1, 0x9fd0ee, 0.78, 1.5, 6.38, hq);
    box(0.06, 0.9, 0.08, 0xe8ecf3, -0.14, 1.5, 6.45, hq);          // 손잡이
    box(0.06, 0.9, 0.08, 0xe8ecf3, 0.14, 1.5, 6.45, hq);
    box(6.2, 0.22, 2.6, 0x3a4352, 0, 3.78, 7.5, hq);               // 차양
    box(7.4, 2.2, 0.4, 0x2f6fed, 0, 5.2, 6.25, hq);
    var s1 = signPlane('본사', 1.9, { fs: 120, padX: 40, padY: 10 });
    s1.position.set(0, 5.2, 6.47); hq.add(s1);
    box(6, 2.4, 0.4, 0x2f6fed, 0, 38.2, 5.6, hq);
    var s2 = signPlane('본사', 2, { fs: 120, padX: 40, padY: 10 });
    s2.position.set(0, 38.2, 5.82); hq.add(s2);
    var enter = labelSprite('입구', 0.5, { bg: 'rgba(47,111,237,0.92)', fs: 44 });
    enter.position.set(0, 4.25, 8.85); hq.add(enter);
    // 건물 앞 화단 (건물 충돌 영역 안쪽이라 지나갈 수 없다)
    var gBush = new THREE.IcosahedronGeometry(0.55, 1);
    [-5.6, 5.6].forEach(function (px) {
      box(4.6, 0.5, 0.5, 0x8a6a4a, px, 0.25, 6.28, hq);
      for (var k = 0; k < 5; k++) {
        var bsh = new THREE.Mesh(gBush, mat(k % 2 ? 0x4c9a55 : 0x5fb062));
        bsh.scale.set(1, 0.8, 0.7); bsh.position.set(px - 1.8 + k * 0.9, 0.7, 6.3); hq.add(bsh);
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
    var gRoot = new THREE.CylinderGeometry(0.34, 0.55, 0.3, 8);
    var gBranch = new THREE.CylinderGeometry(0.05, 0.09, 0.9, 6);
    var gLeaf = new THREE.IcosahedronGeometry(1, 1); gLeaf.computeVertexNormals();         // 면마다 빛이 달라 보이는 각진 잎
    var gCone = new THREE.ConeGeometry(1, 1, 9).toNonIndexed(); gCone.computeVertexNormals();
    var GREENS = [0x3f803b, 0x4d9042, 0x58994a, 0x467f3c], TOPGREEN = 0x6aab52;
    W.TREES.forEach(function (p, i) {
      var tree = new THREE.Group(), crown = new THREE.Group(), s = 0.9 + (i % 4) * 0.12;
      tree.position.set(p[0], 0, p[1]); tree.rotation.y = i * 1.7;
      var bark = i % 2 ? 0x7a5a3c : 0x6b4c33;
      var t = new THREE.Mesh(gTrunk, mat(bark)); t.position.y = 1.2; tree.add(t);
      var rt = new THREE.Mesh(gRoot, mat(bark)); rt.position.y = 0.15; tree.add(rt);
      crown.position.y = 2.0;
      if (i % 4 === 3) {                                                 // 침엽수: 네 단
        [[1.65, 1.6, 0.6], [1.35, 1.5, 1.5], [1.05, 1.4, 2.35], [0.7, 1.2, 3.1]].forEach(function (c, k) {
          var m = new THREE.Mesh(gCone, mat([0x2f6b3d, 0x3a7a45, 0x33713f, 0x45874c][k]));
          m.scale.set(c[0] * s, c[1] * s, c[0] * s); m.position.y = c[2] * s; m.rotation.y = k * 0.7; crown.add(m);
        });
      } else {
        [-1, 1].forEach(function (sd) {                                    // 굵은 가지 두 개
          var br = new THREE.Mesh(gBranch, mat(bark)); br.position.set(sd * 0.28, 1.95, 0.05); br.rotation.z = -sd * 0.75; tree.add(br);
        });
        [[0, 1.05, 0, 1.25], [0.85, 0.6, 0.25, 0.95], [-0.8, 0.65, -0.3, 1.0], [0.15, 0.55, -0.85, 0.9], [-0.3, 0.5, 0.8, 0.85],
          [0.55, 1.55, -0.35, 0.8], [-0.45, 1.65, 0.3, 0.78], [0.05, 2.05, 0.05, 0.65]]
          .forEach(function (c, k) {
            var m = new THREE.Mesh(gLeaf, mat(k >= 5 ? (k === 7 ? TOPGREEN : GREENS[(i + k) % 2 + 1]) : GREENS[(i + k) % GREENS.length]));
            m.scale.set(c[3] * s, c[3] * s * 0.88, c[3] * s); m.position.set(c[0] * s, c[1] * s, c[2] * s);
            m.rotation.set(k, i, k * 2); crown.add(m);
          });
      }
      crown.userData.dyn = true;
      tree.add(crown); outdoor.add(tree);
      env.trees.push({ crown: crown, ph: i * 1.37, yaw: tree.rotation.y, conifer: i % 4 === 3, s: s });
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
    var gPole = new THREE.CylinderGeometry(0.07, 0.1, 3.8, 8), gBulb = new THREE.CylinderGeometry(0.15, 0.19, 0.36, 12);
    var gCap = new THREE.CylinderGeometry(0.05, 0.32, 0.16, 12), gBase = new THREE.CylinderGeometry(0.2, 0.26, 0.4, 10);
    W.LAMPS.forEach(function (l) {
      var dir = l[0] < 0 ? 1 : -1;
      var pole = new THREE.Mesh(gPole, mat(0x39424f)); pole.position.set(l[0], 1.9, l[1]); outdoor.add(pole);
      box(0.9, 0.08, 0.08, 0x39424f, l[0] + dir * 0.4, 3.78, l[1], outdoor);
      var bulb = new THREE.Mesh(gBulb, env.lampMat); bulb.position.set(l[0] + dir * 0.8, 3.5, l[1]); bulb.userData.ns = true; outdoor.add(bulb);
      var cap = new THREE.Mesh(gCap, mat(0x2b323c)); cap.position.set(l[0] + dir * 0.8, 3.74, l[1]); outdoor.add(cap);
      var lb = new THREE.Mesh(gBase, mat(0x2b323c)); lb.position.set(l[0], 0.2, l[1]); outdoor.add(lb);
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
    var flag = new THREE.Mesh(fgeo, env.flagMat); flag.frustumCulled = false; flag.userData.dyn = true; outdoor.add(flag);
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
    [env.sunOrb, env.moonOrb].forEach(function (o) { o.userData.ns = true; });
    env.clouds.forEach(function (c) { c.g.userData.dyn = true; c.g.traverse(function (o) { o.userData.ns = true; }); });
    env.lampPools.forEach(function (o) { o.userData.ns = true; });

    // 벤치, 화분, 쓰레기통 (부딪힘 영역은 world.js 에 같이 있다)
    W.BENCHES.forEach(function (b) {
      var g = new THREE.Group(); g.position.set(b[0], 0, b[1]); g.rotation.y = b[2] > 0 ? 0 : Math.PI;
      for (var k = 0; k < 3; k++) box(0.16, 0.06, 1.7, 0xb07a4a, -0.18 + k * 0.18, 0.46, 0, g);       // 앉는 판
      box(0.06, 0.16, 1.7, 0xa06c3f, -0.3, 0.68, 0, g); box(0.06, 0.16, 1.7, 0xa06c3f, -0.3, 0.88, 0, g);  // 등받이
      [-0.7, 0.7].forEach(function (zz) { box(0.5, 0.42, 0.08, 0x3a424d, -0.05, 0.22, zz, g); box(0.06, 0.6, 0.08, 0x3a424d, -0.3, 0.72, zz, g); });
      outdoor.add(g);
    });
    W.PLANTERS.forEach(function (p) {
      var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.66, 0.6, 18), mat(0xb9b2a5)); pot.position.set(p[0], 0.3, p[1]); outdoor.add(pot);
      var soil = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.04, 18), mat(0x5b4636)); soil.position.set(p[0], 0.6, p[1]); outdoor.add(soil);
      var bush = new THREE.Mesh(gLeaf, mat(0x4d9042)); bush.scale.set(0.6, 0.5, 0.6); bush.position.set(p[0], 0.95, p[1]); outdoor.add(bush);
    });
    W.BINS.forEach(function (p) {
      var bin = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.2, 0.78, 12), mat(0x3d5a47)); bin.position.set(p[0], 0.39, p[1]); outdoor.add(bin);
      var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 12), mat(0x2b3d31)); lid.position.set(p[0], 0.81, p[1]); outdoor.add(lid);
    });

    // 잔디밭 빈 곳 고르기: 길, 광장, 건물, 가게, 나무, 소품을 피한다
    function lawn(x, z) {
      if (Math.abs(x) < 3.1 && z > 5.5 && z < 40.6) return false;
      if (Math.abs(x) < 11.5 && z > 5.5 && z < 11.6) return false;
      var fz0 = W.NAMU.z + W.NAMU.d / 2;                                  // 본투비헤븐·플레이존 앞길
      if (Math.abs(Math.abs(x) - W.PLAY.x) < 2.6 && z > fz0 - 0.2 && z < fz0 + 5.6) return false;
      if (Math.abs(x) > 10.5 && Math.abs(x) < W.PLAY.x + 2.6 && z > 5.8 && z < 9) return false;
      return !W.blocked('out', x, z);
    }
    var m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3(), c4 = new THREE.Color();
    function put(im, k, x, y, z, ry, sx, sy, sz, color) {
      q4.setFromEuler(e4.set(0, ry, 0)); m4.compose(v4.set(x, y, z), q4, s4.set(sx, sy, sz)); im.setMatrixAt(k, m4);
      if (color !== undefined) im.setColorAt(k, c4.set(color).convertSRGBToLinear());
    }
    // 풀 포기: 가는 잎 다섯 장. 법선을 위로 두어 땅과 같은 밝기로 보이게 한다
    var tp = [], tn = [], tcl = [];
    for (var bl = 0; bl < 5; bl++) {
      var ba = bl * 1.26 + 0.3, ox = Math.cos(ba) * 0.05, oz = Math.sin(ba) * 0.05, hh = 0.24 + (bl % 3) * 0.07, px = -Math.sin(ba) * 0.035, pz = Math.cos(ba) * 0.035;
      tp.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox + Math.cos(ba) * 0.1, hh, oz + Math.sin(ba) * 0.1);
      tn.push(0, 1, 0, 0, 1, 0, 0, 1, 0); tcl.push(0.72, 0.82, 0.68, 0.72, 0.82, 0.68, 1.05, 1.08, 1);
    }
    var gTuft = new THREE.BufferGeometry();
    gTuft.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    gTuft.setAttribute('normal', new THREE.Float32BufferAttribute(tn, 3));
    gTuft.setAttribute('color', new THREE.Float32BufferAttribute(tcl, 3));
    var TUFTS = 2400, tufts = new THREE.InstancedMesh(gTuft, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), TUFTS), tn2 = 0, tx, tz, tr, ta;
    for (var tt = 0; tt < TUFTS * 6 && tn2 < TUFTS; tt++) {
      ta = rnd() * Math.PI * 2; tr = 2 + Math.sqrt(rnd()) * 46; tx = Math.cos(ta) * tr; tz = 14 + Math.sin(ta) * tr;
      if (!lawn(tx, tz)) continue;
      var ts = 0.45 + rnd() * 0.45;
      put(tufts, tn2++, tx, 0, tz, rnd() * 6.28, ts, ts * (0.7 + rnd() * 0.5), ts, ['#64a54c', '#5a9944', '#70b157', '#7cbc5e'][tn2 % 4]);
    }
    tufts.count = tn2; tufts.userData.rcv = true; outdoor.add(tufts);
    // 들꽃: 무더기로 핀다
    var FLOWERS = 420, flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 0), new THREE.MeshLambertMaterial(), FLOWERS), fn = 0;
    var FCOL = ['#ffffff', '#ffe066', '#ff9fb8', '#c9a7ff', '#ffb36b'];
    for (var fc = 0; fc < 120 && fn < FLOWERS; fc++) {
      ta = rnd() * Math.PI * 2; tr = 3 + Math.sqrt(rnd()) * 36;
      var cx0 = Math.cos(ta) * tr, cz0 = 14 + Math.sin(ta) * tr, col0 = FCOL[fc % FCOL.length];
      for (var fk = 0; fk < 7 && fn < FLOWERS; fk++) {
        tx = cx0 + (rnd() - 0.5) * 1.4; tz = cz0 + (rnd() - 0.5) * 1.4;
        if (lawn(tx, tz)) put(flowers, fn++, tx, 0.2 + rnd() * 0.08, tz, rnd() * 6, 1, 0.7, 1, col0);
      }
    }
    // 광장 화분의 꽃
    W.PLANTERS.forEach(function (p, pi) {
      for (var k = 0; k < 14 && fn < FLOWERS; k++) {
        var a = k / 14 * Math.PI * 2;
        put(flowers, fn++, p[0] + Math.cos(a) * 0.5, 0.72, p[1] + Math.sin(a) * 0.5, a, 1.1, 0.8, 1.1, FCOL[(k + pi) % FCOL.length]);
      }
    });
    flowers.count = fn; flowers.userData.rcv = true; outdoor.add(flowers);
    env.lowHide = [tufts, flowers];

    // 먼 숲: 나무 백여 그루를 한꺼번에 그린다 (그림자 없음)
    var RING = 110, gFar = new THREE.ConeGeometry(1, 1, 7).toNonIndexed(); gFar.computeVertexNormals();
    var farCone = new THREE.InstancedMesh(gFar, new THREE.MeshLambertMaterial(), RING), farBall = new THREE.InstancedMesh(gLeaf, new THREE.MeshLambertMaterial(), RING);
    var farTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 1, 6), mat(0x6b4c33), RING * 2), nC = 0, nB = 0, nT = 0;
    for (var ri = 0; ri < RING * 2; ri++) {
      ta = rnd() * Math.PI * 2; tr = 46 + rnd() * 26; tx = Math.cos(ta) * tr; tz = Math.sin(ta) * tr + 6;
      var fsz = 0.8 + rnd() * 0.7;
      put(farTrunk, nT++, tx, 0.8 * fsz, tz, 0, fsz, 1.6 * fsz, fsz);
      if (ri % 2) put(farCone, nC++, tx, 4 * fsz, tz, rnd() * 6, 2.2 * fsz, 5.5 * fsz, 2.2 * fsz, ['#2f6b3d', '#3a7a45', '#2c6338'][ri % 3]);
      else put(farBall, nB++, tx, 3.2 * fsz, tz, rnd() * 6, 2.4 * fsz, 2.2 * fsz, 2.4 * fsz, ['#3f803b', '#4d9042', '#467f3c'][ri % 3]);
    }
    farCone.count = nC; farBall.count = nB; farTrunk.count = nT;
    [farCone, farBall, farTrunk].forEach(function (o) { o.userData.ns = true; outdoor.add(o); });

    // 그림자 설정: 표시한 것 말고는 모두 그림자를 드리우고 받는다
    outdoor.traverse(function (o) {
      if (!o.isMesh || o.userData.ns) return;
      o.receiveShadow = true;
      o.castShadow = !o.userData.rcv;
    });
    env.trees.forEach(function (t) { mergeStatic(t.crown, false); });
    mergeStatic(outdoor, true);
    mergeStatic(hq, true);
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
    floor.receiveShadow = true;
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
      c.position.set(pos[0], 0, pos[1]); c.userData.dyn = true; lobby.add(c);
      var bubble = labelSprite(NPC_GREETING, 0.5, { bg: '#ffffff', color: '#1c2430', fs: 44, radius: 26 });
      bubble.position.y = 3.2; bubble.visible = false; c.add(bubble);
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
  var gGlass = new THREE.PlaneGeometry(3.2, 2.0);
  var glassMat = new THREE.MeshBasicMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.06, depthWrite: false });
  function roomShell(g, floorMat, wall, wall2, bare) {
    var fl = new THREE.Mesh(new THREE.PlaneGeometry(LW, LD), floorMat);
    fl.receiveShadow = true;
    fl.rotation.x = -Math.PI / 2; g.add(fl);
    var ce = new THREE.Mesh(new THREE.PlaneGeometry(LW, LD), mat(0xf7f7f4));
    ce.rotation.x = Math.PI / 2; ce.position.y = LH; ce.userData.dyn = true; g.add(ce); roomTops.push(ce);
    box(LW, LH, 0.3, wall, 0, LH / 2, -LD / 2 - 0.15, g);
    box(LW, LH, 0.3, wall, 0, LH / 2, LD / 2 + 0.15, g);
    // 동쪽·서쪽 벽은 창문 세 곳(높이 2.1~4.1m, 폭 3.2m)을 비워 두고 조각으로 세운다. 창밖에는 풍경이 보인다.
    [-1, 1].forEach(function (sd) {
      var wx = sd * (LW / 2 + 0.15), ix = sd * (LW / 2 - 0.02);
      box(0.3, 2.1, LD, wall2, wx, 1.05, 0, g);
      box(0.3, LH - 4.1, LD, wall2, wx, (4.1 + LH) / 2, 0, g);
      [[-7.8, 2.4], [-2.5, 1.8], [2.5, 1.8], [7.8, 2.4]].forEach(function (p) { box(0.3, 2.0, p[1], wall2, wx, 3.1, p[0], g); });
      [-5, 0, 5].forEach(function (wz) {
        box(0.2, 0.1, 3.4, 0xf2f4f7, ix, 2.06, wz, g);                    // 창턱
        box(0.12, 0.08, 3.3, 0x8d96a3, ix, 4.1, wz, g);
        box(0.12, 2.0, 0.08, 0x8d96a3, ix, 3.1, wz - 1.62, g);
        box(0.12, 2.0, 0.08, 0x8d96a3, ix, 3.1, wz + 1.62, g);
        box(0.08, 2.0, 0.06, 0x8d96a3, ix, 3.1, wz, g);                    // 가운데 창살
        var gl = new THREE.Mesh(gGlass, glassMat);
        gl.rotation.y = -sd * Math.PI / 2; gl.position.set(sd * (LW / 2 + 0.06), 3.1, wz); gl.userData.dyn = true; g.add(gl);
      });
    });
    box(LW, 0.25, 0.08, 0x6f6a62, 0, 0.125, -LD / 2 + 0.04, g);
    box(LW, 0.25, 0.08, 0x6f6a62, 0, 0.125, LD / 2 - 0.04, g);
    box(0.08, 0.25, LD, 0x6f6a62, -LW / 2 + 0.04, 0.125, 0, g);
    box(0.08, 0.25, LD, 0x6f6a62, LW / 2 - 0.04, 0.125, 0, g);
    [[-6, -4], [6, -4], [-6, 4], [6, 4], [0, 0]].forEach(function (p) {
      var lp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 1.2), roomLight);
      lp.position.set(p[0], LH - 0.05, p[1]); lp.userData.dyn = true; g.add(lp); roomTops.push(lp);
    });
    if (bare) return;                                  // 본투비헤븐·플레이존: 엘리베이터와 안내판이 없다
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
    var kl = labelSprite('구역 안내판', 0.42, { bg: 'rgba(20,28,40,0.78)', fs: 44 });
    kl.position.set(kx, 2.1, kz); g.add(kl);
  }
  // 1~10구역 전도 게시판(앞 벽): 메모·스티커·사진을 그린 그림을 벽에 붙인다
  var bdCanvas3 = document.createElement('canvas'); bdCanvas3.width = 1400; bdCanvas3.height = 700;
  var bdTex = new THREE.CanvasTexture(bdCanvas3); bdTex.encoding = THREE.sRGBEncoding;
  var bdItems = [], bdPhotos = {};
  var officeTree = new THREE.Group(); office.add(officeTree);
  var TREE_S = { nm1: 1, floor: 0.72 };                   // 열매 나무 크기 (본투비헤븐 1층, 구역)
  (function buildOffice() {
    roomShell(office, texMat(tileTex('#8fa3b8', '#7d90a5', LW / 2, LD / 2)), 0xf1f3f6, 0xe6eaef);
    // 구역 게시판 자리 (북쪽 벽 왼쪽)
    box(4.6, 2.6, 0.12, 0x6b4f37, -6.5, 2.6, -LD / 2 + 0.08, office);
    box(4.2, 2.2, 0.06, 0xd9b98a, -6.5, 2.6, -LD / 2 + 0.15, office);
    var bl = signPlane('구역 게시판', 0.45, { fs: 56, bg: '#1c2430', radius: 12 });
    bl.position.set(-6.5, 4.25, -LD / 2 + 0.16); office.add(bl);
    // 전도 게시판 (남쪽 벽 왼쪽, 방 안쪽을 본다)
    var B = W.FL_BOARD, bz = LD / 2;
    box(B.w + 0.4, B.h + 0.4, 0.14, 0x6b4f37, B.x, 2.55, bz - 0.08, office);
    var bp = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), new THREE.MeshBasicMaterial({ map: bdTex }));
    bp.rotation.y = Math.PI; bp.position.set(B.x, 2.55, bz - 0.16); bp.userData.dyn = true; office.add(bp);
    var bs = signPlane('✝ 전도 게시판', 0.5, { fs: 60, bg: '#c0392b', radius: 12 });
    bs.rotation.y = Math.PI; bs.position.set(B.x, 4.65, bz - 0.17); office.add(bs);
    // 열매 기도 나무 (앞쪽 오른편)
    buildTree(officeTree, W.FL_TREE, TREE_S.floor, '이름과 기도문을 적으면 열매가 맺혀요');
    officeTree.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
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
  /* ---------- 창밖 풍경: 사무실 창문으로 보이는 도시와 산. 하늘은 진짜 하늘(시간·날씨)이 그대로 보인다 ---------- */
  var skyGroup = new THREE.Group(); scene.add(skyGroup);
  [env.sky, env.sunOrb, env.moonOrb, env.stars].forEach(function (o) { skyGroup.add(o); });
  var viewGroup = new THREE.Group(); viewGroup.visible = false; scene.add(viewGroup);
  (function buildView() {
    var CW = 2048, CH = 640, R = 55, HH = 45, PXM = CW / (2 * Math.PI * R), PYM = CH / HH;
    var sd = 99;
    function pr() { sd = (sd * 16807) % 2147483647; return sd / 2147483647; }
    function Y(m) { return CH - m * PYM; }
    // 한 번 정한 배치를 낮, 눈, 밤 불빛 세 가지로 그린다
    var ridge1 = [], ridge2 = [], bld = [], trees = [], x;
    for (x = 0; x <= CW; x += 64) ridge1.push(24 + pr() * 16);
    for (x = 0; x <= CW; x += 48) ridge2.push(12 + pr() * 9);
    ridge1[ridge1.length - 1] = ridge1[0]; ridge2[ridge2.length - 1] = ridge2[0];     // 이음매가 맞게
    for (x = 10; x < CW - 40;) {
      var w = (6 + pr() * 12) * PXM, hgt = 6 + pr() * 15;
      bld.push({ x: x, w: w, h: hgt, c: ['#9aa7b6', '#c7b9a6', '#7f8fa3', '#b8a28c', '#d3d0c8', '#8a9a8c'][Math.floor(pr() * 6)], win: [] });
      for (var wy = 2.2; wy < hgt - 1.5; wy += 3) for (var wxm = 1.2; wxm < w / PXM - 1; wxm += 2.6) bld[bld.length - 1].win.push([wxm, wy, pr() < 0.4]);
      x += w + (5 + pr() * 16) * PXM;
    }
    for (x = 0; x < CW; x += 14 + pr() * 22) trees.push([x, 2 + pr() * 1.6, 2.6 + pr() * 2.4, pr() < 0.5]);
    function ridge(ctx, pts, step, col, cap) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, CH);
      pts.forEach(function (m, i) { ctx.lineTo(i * step, Y(m)); }); ctx.lineTo(CW, CH); ctx.fill();
      // 산비탈의 침엽수 숲 (점점이 작은 삼각형)
      var g = ctx.createLinearGradient(0, Y(40), 0, CH);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(20,50,35,0.35)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, CH);
      pts.forEach(function (m, i) { ctx.lineTo(i * step, Y(m)); }); ctx.lineTo(CW, CH); ctx.fill();
      var tc = cap ? ['#4d6e62', '#5a7d6c', '#435f55'] : ['#3d6b48', '#4a7a52', '#335c3e'];
      for (var k = 0; k < CW * 1.4; k++) {
        var tx0 = pr() * CW, i0 = Math.floor(tx0 / step), f = tx0 / step - i0;
        var top = pts[i0] + ((pts[i0 + 1] || pts[i0]) - pts[i0]) * f;
        var ty = 2 + pr() * (top - 5); if (ty > top - 2.5) continue;
        var th = (0.8 + pr() * 1.0) * PYM, tw = th * 0.45;
        ctx.fillStyle = tc[k % 3]; ctx.beginPath();
        ctx.moveTo(tx0, Y(ty) - th); ctx.lineTo(tx0 - tw, Y(ty)); ctx.lineTo(tx0 + tw, Y(ty)); ctx.fill();
        if (cap && pr() < 0.6) { ctx.fillStyle = '#eef3f7'; ctx.beginPath(); ctx.moveTo(tx0, Y(ty) - th); ctx.lineTo(tx0 - tw * 0.45, Y(ty) - th * 0.5); ctx.lineTo(tx0 + tw * 0.45, Y(ty) - th * 0.5); ctx.fill(); }
      }
      if (!cap) return;
      ctx.fillStyle = '#f4f7fb';                                           // 눈 덮인 봉우리
      pts.forEach(function (m, i) {
        if (i === 0 || m < pts[i - 1] || m < (pts[i + 1] || 0)) return;
        ctx.beginPath(); ctx.moveTo(i * step - step * 0.45, Y(m - 3)); ctx.lineTo(i * step, Y(m)); ctx.lineTo(i * step + step * 0.45, Y(m - 3)); ctx.fill();
      });
    }
    function draw(mode) {
      var c = document.createElement('canvas'); c.width = CW; c.height = CH;
      var ctx = c.getContext('2d'), snowy = mode === 'snow';
      if (mode === 'lit') {
        ctx.fillStyle = '#ffd98a';
        bld.forEach(function (b) { b.win.forEach(function (w) { if (w[2]) ctx.fillRect(b.x + w[0] * PXM, Y(w[1] + 1.4), 1.2 * PXM, 1.4 * PYM); }); });
      } else {
        ridge(ctx, ridge1, 64, snowy ? '#8ea3b6' : '#8fae9f', snowy);
        ridge(ctx, ridge2, 48, snowy ? '#5f8270' : '#6f9a78', snowy);
        bld.forEach(function (b) {
          ctx.fillStyle = b.c; ctx.fillRect(b.x, Y(b.h), b.w, b.h * PYM);
          ctx.fillStyle = 'rgba(40,70,110,0.75)';
          b.win.forEach(function (w) { ctx.fillRect(b.x + w[0] * PXM, Y(w[1] + 1.4), 1.2 * PXM, 1.4 * PYM); });
          if (snowy) { ctx.fillStyle = '#f4f7fb'; ctx.fillRect(b.x - 2, Y(b.h + 0.6), b.w + 4, 0.8 * PYM); }
        });
        trees.forEach(function (t) {
          ctx.fillStyle = '#6b4c33'; ctx.fillRect(t[0] - 3, Y(t[1]), 6, t[1] * PYM);
          ctx.fillStyle = t[3] ? '#4f8f45' : '#3f7d3a';
          ctx.beginPath(); ctx.ellipse(t[0], Y(t[1] + t[2] * 0.6), t[2] * 0.6 * PXM, t[2] * 0.6 * PYM, 0, 0, Math.PI * 2); ctx.fill();
          if (snowy) { ctx.fillStyle = '#f4f7fb'; ctx.beginPath(); ctx.ellipse(t[0], Y(t[1] + t[2] * 0.95), t[2] * 0.45 * PXM, t[2] * 0.22 * PYM, 0, Math.PI, Math.PI * 2); ctx.fill(); }
        });
        ctx.fillStyle = snowy ? '#e9eef3' : '#6aa84f'; ctx.fillRect(0, Y(1.6), CW, 1.6 * PYM);
      }
      var tx = new THREE.CanvasTexture(c); tx.encoding = THREE.sRGBEncoding; return tx;
    }
    var gPano = new THREE.CylinderGeometry(R, R, HH, 64, 1, true);
    var dayTex = draw('day'), snowTex = draw('snow');
    var pano = new THREE.Mesh(gPano, new THREE.MeshBasicMaterial({ map: dayTex, side: THREE.BackSide, alphaTest: 0.5, fog: false }));
    pano.position.y = HH / 2; viewGroup.add(pano);
    var lit = new THREE.Mesh(gPano, new THREE.MeshBasicMaterial({ map: draw('lit'), side: THREE.BackSide, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    lit.position.y = HH / 2; lit.scale.set(0.99, 1, 0.99); viewGroup.add(lit);
    var ground = new THREE.Mesh(new THREE.CircleGeometry(R + 1, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6aa84f).convertSRGBToLinear(), fog: false }));
    ground.rotation.x = -Math.PI / 2; viewGroup.add(ground);
    env.view = { pano: pano, lit: lit, ground: ground, dayTex: dayTex, snowTex: snowTex };
  })();
  function updateView(dayF) {
    if (!viewGroup.visible) return;
    var v = env.view, k = mix3([0.2, 0.23, 0.36], [1, 1, 1], dayF), cf = 1 - E.cover * 0.3 - E.fog * 0.2;
    v.pano.material.color.setRGB(k[0] * cf, k[1] * cf, k[2] * cf);
    var g0 = xmasOn ? [0.82, 0.86, 0.9] : [0.14, 0.39, 0.08];
    v.ground.material.color.setRGB(g0[0] * k[0] * cf, g0[1] * k[1] * cf, g0[2] * k[2] * cf);
    v.lit.material.opacity = clamp01((1 - dayF) * 1.3);
    v.lit.visible = v.lit.material.opacity > 0.02;
  }

  /* ---------- 크리스마스 꾸미기 (관리자 화면에서 켜고 끈다) ---------- */
  var xmasOn = false;
  env.xmasParts = []; env.bulbs = [];
  var WHITE = 0xf6f9fc, gSnowPuff = new THREE.IcosahedronGeometry(1, 1);
  var bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff }), gBulbS = new THREE.IcosahedronGeometry(0.075, 0);
  var BULB_COLORS = ['#ff4d4d', '#ffd23f', '#4dd36b', '#4da3ff', '#fff6d8', '#ff8ad1'];
  var wireMat = new THREE.LineBasicMaterial({ color: 0x1d3b2a });
  // 늘어진 줄 (두 점 사이를 포물선으로 처지게)
  function sagLine(a, b, n, sag) {
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
    }
    return pts;
  }
  // 알전구 줄: 전구 전부를 한 번에 그리고, 전선은 선 하나로
  function fairyLights(strings, parent, root, size, wire) {
    var all = [], wv = [];
    strings.forEach(function (pts) {
      pts.forEach(function (p) { all.push(p); });
      if (wire !== false) for (var i = 1; i < pts.length; i++) wv.push(pts[i - 1][0], pts[i - 1][1] + 0.06, pts[i - 1][2], pts[i][0], pts[i][1] + 0.06, pts[i][2]);
    });
    var im = new THREE.InstancedMesh(gBulbS, bulbMat, all.length), m = new THREE.Matrix4(), col = new THREE.Color(), base = [];
    all.forEach(function (p, i) {
      m.makeScale(size || 1, size || 1, size || 1); m.setPosition(p[0], p[1], p[2]); im.setMatrixAt(i, m);
      col.set(BULB_COLORS[i % BULB_COLORS.length]).convertSRGBToLinear(); im.setColorAt(i, col); base.push(col.clone());
    });
    im.userData.ns = true; im.frustumCulled = false; parent.add(im);
    if (wv.length) {
      var lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(wv, 3));
      var ln = new THREE.LineSegments(lg, wireMat); ln.frustumCulled = false; parent.add(ln);
    }
    env.bulbs.push({ im: im, base: base, dim: new Uint8Array(all.length), root: root });
  }
  function snowCap(parent, x, y, z, sx, sy, sz) {
    var m = new THREE.Mesh(gSnowPuff, mat(WHITE)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
  }
  function gift(parent, x, z, sz, col, ry) {
    var g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry || 0;
    box(sz, sz * 0.8, sz, col, 0, sz * 0.4, 0, g);
    box(sz + 0.02, sz * 0.8 + 0.02, sz * 0.16, 0xffd23f, 0, sz * 0.4, 0, g);
    box(sz * 0.16, sz * 0.8 + 0.02, sz + 0.02, 0xffd23f, 0, sz * 0.4, 0, g);
    var bow = new THREE.Mesh(new THREE.TorusGeometry(sz * 0.14, sz * 0.05, 6, 12), mat(0xffd23f));
    bow.position.y = sz * 0.85; g.add(bow);
    parent.add(g); return g;
  }
  function starGeo(r1, r2, depth) {
    var sh = new THREE.Shape();
    for (var i = 0; i < 10; i++) {
      var a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? r2 : r1;
      if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    var g = new THREE.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2); return g;
  }
  var xGlowTex = (function () {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,240,180,1)'); g.addColorStop(0.4, 'rgba(255,220,120,0.4)'); g.addColorStop(1, 'rgba(255,210,110,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  // 크리스마스트리: 다섯 단 잎, 장식 공, 나선 알전구, 꼭대기 별, 선물 상자
  function xmasTree(parent, root, x, z, s, snowy) {
    var g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
    var tk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.35 * s, 1.1 * s, 8), mat(0x6b4c33)); tk.position.y = 0.55 * s; g.add(tk);
    var gC = new THREE.ConeGeometry(1, 1, 12).toNonIndexed(); gC.computeVertexNormals();
    var tiers = [[2.3, 2.2, 1.75], [1.95, 2.0, 2.95], [1.55, 1.8, 4.05], [1.1, 1.6, 5.05], [0.68, 1.3, 5.95]];
    tiers.forEach(function (c, k) {
      var m = new THREE.Mesh(gC, mat(k % 2 ? 0x256b3d : 0x1f5a34)); m.scale.set(c[0] * s, c[1] * s, c[0] * s); m.position.y = c[2] * s; m.rotation.y = k * 0.5; g.add(m);
      if (snowy) { var sc = new THREE.Mesh(gC, mat(WHITE)); sc.scale.set(c[0] * s * 0.6, c[1] * s * 0.4, c[0] * s * 0.6); sc.position.y = (c[2] + c[1] * 0.3) * s; g.add(sc); }
    });
    // 장식 공
    var orn = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13 * s, 10, 8), new THREE.MeshLambertMaterial(), 44), m4 = new THREE.Matrix4(), cc = new THREE.Color(), n = 0;
    tiers.forEach(function (c, k) {
      var cnt = [12, 11, 9, 7, 5][k];
      for (var i = 0; i < cnt; i++) {
        var a = i / cnt * Math.PI * 2 + k, r = c[0] * 0.74 * s, y = (c[2] - c[1] * 0.25) * s;
        m4.makeTranslation(Math.cos(a) * r, y, Math.sin(a) * r); orn.setMatrixAt(n, m4);
        orn.setColorAt(n++, cc.set(['#d62f2f', '#ffd23f', '#3f7fe0', '#e8ecf3'][(i + k) % 4]).convertSRGBToLinear());
      }
    });
    orn.count = n; g.add(orn);
    // 나선 알전구
    var sp = [];
    for (var i = 0; i <= 130; i++) {
      var t = i / 130, a2 = t * Math.PI * 2 * 6.5, r2 = (2.25 - 1.95 * t) * s, y2 = (0.95 + t * 5.6) * s;
      sp.push([x + Math.cos(a2) * r2, y2, z + Math.sin(a2) * r2]);
    }
    fairyLights([sp], parent, root, s < 0.8 ? 0.8 : 1, false);
    // 별과 빛
    var st = new THREE.Mesh(starGeo(0.48 * s, 0.21 * s, 0.14 * s), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd54a).convertSRGBToLinear() }));
    st.position.y = 7.0 * s; st.userData.ns = true; g.add(st);
    var gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: xGlowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
    gl.scale.set(2.4 * s, 2.4 * s, 1); gl.position.y = 7.0 * s; g.add(gl);
    [[1.25, 0.6, 0xd62f2f], [-1.1, 0.9, 0x3f7fe0], [0.3, -1.3, 0x2f8f6f], [-0.9, -0.95, 0xb85ad6], [1.0, -0.8, 0xffffff]].forEach(function (q, k) {
      gift(g, q[0] * s, q[1] * s, (0.5 + (k % 3) * 0.12) * s, q[2], k);
    });
    return g;
  }
  // 산타: 우리 동네 사원들처럼 동글동글한 모습으로
  function makeSanta() {
    var g = new THREE.Group();
    function sp(r, col, x, y, z, sx, sy, sz) { var m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat(col)); m.position.set(x, y, z); if (sx) m.scale.set(sx, sy, sz); g.add(m); return m; }
    sp(0.58, 0xd32f2f, 0, 0.74, 0, 1, 1.05, 0.95);                       // 몸
    var belt = new THREE.Mesh(new THREE.CylinderGeometry(0.585, 0.585, 0.15, 20), mat(0x26221f)); belt.position.y = 0.7; belt.scale.z = 0.96; g.add(belt);
    box(0.22, 0.18, 0.06, 0xffd23f, 0, 0.7, 0.55, g);                     // 버클
    var hem = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.09, 8, 22), mat(0xf7f7f2)); hem.rotation.x = Math.PI / 2; hem.position.y = 0.26; g.add(hem);
    box(0.12, 0.42, 0.06, 0xf7f7f2, 0, 1.0, 0.53, g);                      // 앞섶 흰 털
    sp(0.37, 0xffd7c2, 0, 1.47, 0);                                        // 얼굴
    sp(0.34, 0xf7f7f2, 0, 1.25, 0.15, 1.05, 0.95, 0.72);                  // 수염
    sp(0.1, 0xf7f7f2, -0.09, 1.4, 0.32, 1.2, 0.7, 0.8); sp(0.1, 0xf7f7f2, 0.09, 1.4, 0.32, 1.2, 0.7, 0.8);   // 콧수염
    sp(0.065, 0xf2a0a0, 0, 1.46, 0.36);                                    // 코
    sp(0.045, 0x2a2320, -0.12, 1.55, 0.32); sp(0.045, 0x2a2320, 0.12, 1.55, 0.32);   // 눈
    sp(0.06, 0xf7a3ab, -0.22, 1.45, 0.28, 1, 0.7, 0.5); sp(0.06, 0xf7a3ab, 0.22, 1.45, 0.28, 1, 0.7, 0.5);
    var hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.75, 14), mat(0xd32f2f)); hat.position.set(0.05, 2.05, -0.04); hat.rotation.z = -0.4; g.add(hat);
    var brim = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.1, 8, 22), mat(0xf7f7f2)); brim.rotation.x = Math.PI / 2; brim.position.y = 1.74; g.add(brim);
    sp(0.12, 0xf7f7f2, 0.2, 2.4, -0.04);
    sp(0.17, 0x26221f, -0.22, 0.1, 0.06, 1, 0.7, 1.3); sp(0.17, 0x26221f, 0.22, 0.1, 0.06, 1, 0.7, 1.3);   // 장화
    sp(0.15, 0xd32f2f, -0.58, 0.85, 0.05, 1, 1.5, 1);                     // 왼팔
    sp(0.11, 0xf7f7f2, -0.6, 0.62, 0.06);
    var arm = new THREE.Group(); arm.position.set(0.5, 1.02, 0.05); g.add(arm);   // 흔드는 오른팔
    var ua = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), mat(0xd32f2f)); ua.scale.set(1, 1.6, 1); ua.position.y = 0.2; arm.add(ua);
    var mit = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), mat(0xf7f7f2)); mit.position.y = 0.44; arm.add(mit);
    g.userData.arm = arm;
    var tag = labelSprite('산타', 0.42, { bg: 'rgba(198,40,40,0.9)', fs: 44 }); tag.position.y = 2.75; g.add(tag);
    return g;
  }
  // 순록: 썰매를 끄는, 직접 디자인한 순록
  function makeReindeer() {
    var g = new THREE.Group();
    function sp(r, col, x, y, z, sx, sy, sz, par) { var m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(col)); m.position.set(x, y, z); if (sx) m.scale.set(sx, sy, sz); (par || g).add(m); return m; }
    sp(0.5, 0x9b6a43, 0, 1.0, 0, 0.72, 0.72, 1.25);                      // 몸
    sp(0.4, 0xd8b892, 0, 0.86, 0.05, 0.62, 0.5, 1.0);                     // 배
    sp(0.1, 0xf7f7f2, 0, 1.12, -0.62);                                     // 꼬리
    var gLeg = new THREE.CylinderGeometry(0.07, 0.06, 0.85, 8);
    [[-0.2, 0.36], [0.2, 0.36], [-0.2, -0.36], [0.2, -0.36]].forEach(function (p) {
      var l = new THREE.Mesh(gLeg, mat(0x7a5233)); l.position.set(p[0], 0.45, p[1]); g.add(l);
      var h = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.1, 8), mat(0x2b1d14)); h.position.set(p[0], 0.05, p[1]); g.add(h);
    });
    var col = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 16), mat(0xc62828)); col.position.set(0, 1.28, 0.46); col.rotation.x = 1.0; g.add(col);
    sp(0.07, 0xffd23f, 0, 1.16, 0.6);                                      // 방울
    var head = new THREE.Group(); head.position.set(0, 1.25, 0.45); g.add(head);
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.55, 10), mat(0x9b6a43)); neck.position.set(0, 0.2, 0.12); neck.rotation.x = 0.55; head.add(neck);
    sp(0.26, 0x9b6a43, 0, 0.48, 0.32, 0.85, 0.85, 1.2, head);             // 머리
    sp(0.15, 0xd8b892, 0, 0.42, 0.55, 0.9, 0.7, 0.8, head);               // 주둥이
    sp(0.055, 0x2b1d14, 0, 0.45, 0.66, 1.1, 0.8, 0.8, head);              // 코
    sp(0.04, 0x1c1410, -0.12, 0.56, 0.5, 1, 1, 1, head); sp(0.04, 0x1c1410, 0.12, 0.56, 0.5, 1, 1, 1, head);
    sp(0.09, 0x8a5c39, -0.22, 0.6, 0.28, 1.4, 0.6, 0.6, head); sp(0.09, 0x8a5c39, 0.22, 0.6, 0.28, 1.4, 0.6, 0.6, head);
    var gAnt = new THREE.CylinderGeometry(0.03, 0.04, 0.5, 6), gTine = new THREE.CylinderGeometry(0.022, 0.03, 0.22, 6);
    [-1, 1].forEach(function (sd) {
      var a = new THREE.Mesh(gAnt, mat(0xd9c39a)); a.position.set(sd * 0.17, 0.88, 0.22); a.rotation.z = -sd * 0.45; head.add(a);
      var t1 = new THREE.Mesh(gTine, mat(0xd9c39a)); t1.position.set(sd * 0.22, 0.95, 0.3); t1.rotation.set(0.6, 0, -sd * 0.1); head.add(t1);
      var t2 = new THREE.Mesh(gTine, mat(0xd9c39a)); t2.position.set(sd * 0.32, 1.08, 0.18); t2.rotation.z = -sd * 1.1; head.add(t2);
    });
    head.userData.dyn = true; g.userData.head = head;
    return g;
  }
  // 썰매 (앞이 +z)
  function makeSleigh() {
    var g = new THREE.Group(), RED = 0xc62828, GOLD = 0xe0b84a;
    [-0.62, 0.62].forEach(function (x) {
      box(0.08, 0.08, 2.5, 0x3a3a3a, x, 0.06, 0, g);                       // 날
      var tip = box(0.08, 0.08, 0.6, 0x3a3a3a, x, 0.25, 1.38, g); tip.rotation.x = -0.75;
      [-0.8, 0, 0.8].forEach(function (z) { box(0.06, 0.32, 0.06, GOLD, x, 0.25, z, g); });
    });
    box(1.5, 0.55, 2.1, RED, 0, 0.66, 0, g);                               // 몸통
    box(1.5, 0.95, 0.2, RED, 0, 1.1, -0.98, g);                            // 등받이
    box(1.5, 0.4, 0.16, RED, 0, 1.05, 0.98, g);                            // 앞판
    var curl = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 8, 14, Math.PI * 1.3), mat(RED)); curl.rotation.y = Math.PI / 2; curl.position.set(0, 1.28, 1.02); g.add(curl);
    [-0.77, 0.77].forEach(function (x) { box(0.05, 0.06, 2.1, GOLD, x, 0.95, 0, g); });
    box(1.52, 0.06, 0.22, GOLD, 0, 1.58, -0.98, g);
    box(1.3, 0.14, 0.7, 0x8e1b1b, 0, 0.98, -0.45, g);                      // 의자
    var sack = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), mat(0x8b5a3c)); sack.scale.set(0.95, 1.15, 0.85); sack.position.set(0.25, 1.48, -0.35); g.add(sack);
    var tie = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.25, 10), mat(0x8b5a3c)); tie.position.set(0.25, 2.06, -0.35); g.add(tie);
    gift(g, -0.35, 0.35, 0.42, 0x2f8f6f, 0.3).position.y = 0.93;
    gift(g, -0.3, -0.2, 0.36, 0x3f7fe0, 0.8).position.y = 0.93;
    return g;
  }
  function makeSnowman() {
    var g = new THREE.Group();
    function sp(r, col, x, y, z, sx, sy, sz) { var m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat(col)); m.position.set(x, y, z); if (sx) m.scale.set(sx, sy, sz); g.add(m); return m; }
    sp(0.56, WHITE, 0, 0.5, 0); sp(0.42, WHITE, 0, 1.18, 0); sp(0.31, WHITE, 0, 1.74, 0);
    sp(0.045, 0x26221f, -0.11, 1.8, 0.27); sp(0.045, 0x26221f, 0.11, 1.8, 0.27);
    var nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 8), mat(0xf08a24)); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.72, 0.42); g.add(nose);
    [1.3, 1.12, 0.94].forEach(function (y) { sp(0.045, 0x26221f, 0, y, 0.41); });
    var sc = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 8, 18), mat(0xd62f2f)); sc.rotation.x = Math.PI / 2; sc.position.y = 1.48; g.add(sc);
    box(0.14, 0.4, 0.06, 0xd62f2f, 0.18, 1.3, 0.28, g);
    var hb = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16), mat(0x26221f)); hb.position.y = 2.0; g.add(hb);
    var ht = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.36, 16), mat(0x26221f)); ht.position.y = 2.2; g.add(ht);
    var gArm = new THREE.CylinderGeometry(0.025, 0.035, 0.75, 6);
    [-1, 1].forEach(function (sd) { var a = new THREE.Mesh(gArm, mat(0x6b4c33)); a.position.set(sd * 0.62, 1.3, 0); a.rotation.z = sd * -1.0; g.add(a); });
    return g;
  }
  function wreath(parent, x, y, z, ry, s) {
    var g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0; g.scale.setScalar(s || 1);
    var w = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.17, 8, 22), mat(0x2f6b3d)); g.add(w);
    for (var i = 0; i < 9; i++) { var a = i / 9 * Math.PI * 2, b = new THREE.Mesh(gBulbS, mat(0xd62f2f)); b.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.15); g.add(b); }
    box(0.36, 0.16, 0.08, 0xd62f2f, 0, -0.52, 0.12, g);
    parent.add(g); return g;
  }
  // 방 천장 둘레의 알전구 (방 크기 LW x LD)
  function roomLights(parent, root, inset) {
    var y = LH - 0.35, x0 = -LW / 2 + inset, x1 = LW / 2 - inset, z0 = -LD / 2 + inset, z1 = LD / 2 - inset, strings = [], k;
    function side(a, b, segs) { for (k = 0; k < segs; k++) strings.push(sagLine([a[0] + (b[0] - a[0]) * k / segs, y, a[2] + (b[2] - a[2]) * k / segs], [a[0] + (b[0] - a[0]) * (k + 1) / segs, y, a[2] + (b[2] - a[2]) * (k + 1) / segs], 9, 0.3)); }
    side([x0, y, z0], [x1, y, z0], 8); side([x1, y, z0], [x1, y, z1], 6); side([x1, y, z1], [x0, y, z1], 8); side([x0, y, z1], [x0, y, z0], 6);
    fairyLights(strings, parent, root, 1);
  }

  (function buildXmas() {
    // ---- 야외 ----
    var xo = new THREE.Group(); outdoor.add(xo); env.xmasParts.push(xo);
    var xhq = new THREE.Group(); hq.add(xhq); env.xmasParts.push(xhq);          // 본사 건물에만 붙는 장식
    // 잔디 위 눈: 군데군데 쌓인 흰 얼룩 (길과 광장은 그 위에 있어 깨끗하다)
    var sc = document.createElement('canvas'); sc.width = sc.height = 512;
    var sx = sc.getContext('2d');
    for (var i = 0; i < 260; i++) {
      var px = rnd() * 512, py = rnd() * 512, r = 14 + rnd() * 46;
      [-512, 0, 512].forEach(function (ox) { [-512, 0, 512].forEach(function (oy) {
        var gr = sx.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
        gr.addColorStop(0, 'rgba(250,252,255,0.95)'); gr.addColorStop(0.6, 'rgba(250,252,255,0.7)'); gr.addColorStop(1, 'rgba(250,252,255,0)');
        sx.fillStyle = gr; sx.fillRect(px + ox - r, py + oy - r, r * 2, r * 2);
      }); });
    }
    var stex = new THREE.CanvasTexture(sc); stex.encoding = THREE.sRGBEncoding; stex.wrapS = stex.wrapT = THREE.RepeatWrapping; stex.repeat.set(9, 9);
    var snowG = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ map: stex, transparent: true, depthWrite: false }));
    snowG.rotation.x = -Math.PI / 2; snowG.position.y = 0.012; snowG.userData.rcv = true; snowG.renderOrder = 1; xo.add(snowG);
    // 길 가장자리에 치워 쌓은 눈
    var piles = new THREE.InstancedMesh(gSnowPuff, mat(WHITE), 80), pm = new THREE.Matrix4(), pn = 0, pq = new THREE.Quaternion(), pv = new THREE.Vector3(), ps = new THREE.Vector3();
    [-1, 1].forEach(function (sd) {
      for (var z = 12; z < 40; z += 1.15) {
        pm.compose(pv.set(sd * (2.95 + rnd() * 0.15), 0, z + rnd() * 0.3), pq, ps.set(0.35 + rnd() * 0.15, 0.16 + rnd() * 0.06, 0.55 + rnd() * 0.2)); piles.setMatrixAt(pn++, pm);
      }
    });
    piles.count = pn; piles.userData.rcv = true; xo.add(piles);
    // 지붕, 차양, 벤치, 화분, 가로등 위의 눈
    W.SHOPS.forEach(function (s0) { box(6.5, 0.16, 5.5, WHITE, s0[0], 3.79, W.SHOP_Z, xo); });
    box(16.6, 0.12, 12.6, WHITE, 0, 36.76, 0, xhq);
    box(6.2, 0.1, 2.6, WHITE, 0, 3.94, 7.5, xhq);
    W.BENCHES.forEach(function (b) { box(0.48, 0.05, 1.6, WHITE, b[0], 0.515, b[1], xo); });
    W.PLANTERS.forEach(function (p) { snowCap(xo, p[0], 1.17, p[1], 0.44, 0.16, 0.44); });
    W.LAMPS.forEach(function (l) { var dir = l[0] < 0 ? 1 : -1, cn = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.12, 12), mat(WHITE)); cn.position.set(l[0] + dir * 0.8, 3.86, l[1]); xo.add(cn); });
    // 먼 언덕 꼭대기의 눈 (언덕과 같은 계산으로 자리를 잡는다)
    var gHillCap = new THREE.SphereGeometry(1, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    for (var hI = 0; hI < 16; hI++) {
      var ang = hI / 16 * Math.PI * 2 + 0.3, rad = 84 + (hI % 3) * 8, hw = 22 + (hI % 4) * 6, hh = 7 + (hI % 5) * 2.5, hd = 18 + (hI % 3) * 6;
      var cap = new THREE.Mesh(gHillCap, mat(WHITE)); cap.scale.set(hw * 0.68, hh * 0.28, hd * 0.68); cap.rotation.y = -ang;
      cap.position.set(Math.cos(ang) * rad, -1 + hh * 0.75, Math.sin(ang) * rad); cap.userData.ns = true; xo.add(cap);
    }
    // 나무 위의 눈 (나뭇잎과 함께 흔들리도록 잎 묶음에 붙인다)
    env.trees.forEach(function (tr) {
      var cg = new THREE.Group(), s = tr.s; tr.crown.add(cg); env.xmasParts.push(cg);
      if (tr.conifer) {
        var gC = new THREE.ConeGeometry(1, 1, 9).toNonIndexed(); gC.computeVertexNormals();
        [[1.65, 1.6, 0.6], [1.35, 1.5, 1.5], [1.05, 1.4, 2.35], [0.7, 1.2, 3.1]].forEach(function (c, k) {
          var m = new THREE.Mesh(gC, mat(WHITE)); m.scale.set(c[0] * s * 0.62, c[1] * s * 0.42, c[0] * s * 0.62); m.position.y = (c[2] + c[1] * 0.3) * s; m.rotation.y = k * 0.7; cg.add(m);
        });
      } else {
        snowCap(cg, 0.05 * s, 2.47 * s, 0.05 * s, 0.55 * s, 0.2 * s, 0.55 * s);
        snowCap(cg, 0.55 * s, 2.08 * s, -0.35 * s, 0.6 * s, 0.18 * s, 0.6 * s);
        snowCap(cg, -0.45 * s, 2.18 * s, 0.3 * s, 0.58 * s, 0.18 * s, 0.58 * s);
        snowCap(cg, 0, 1.92 * s, 0, 0.9 * s, 0.16 * s, 0.9 * s);
      }
      cg.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    });
    // 큰 크리스마스트리
    xmasTree(xo, outdoor, W.XMAS.tree[0], W.XMAS.tree[1], 1, true);
    // 산타, 썰매, 순록 두 마리
    var sl = makeSleigh(); sl.position.set(W.XMAS.sleigh[0], 0, W.XMAS.sleigh[1]); sl.rotation.y = Math.PI; xo.add(sl);
    env.deer = [];
    [-0.48, 0.48].forEach(function (dx, k) {
      var d = makeReindeer(); d.position.set(dx, 0, 2.35); sl.add(d); env.deer.push({ head: d.userData.head, ph: k * 1.7 });
      box(0.035, 0.035, 1.45, 0x5b4129, dx * 0.9, 1.0, 1.35, sl);                                         // 끈
    });
    var santa = makeSanta(); santa.position.set(W.XMAS.santa[0], 0, W.XMAS.santa[1]); santa.rotation.y = -Math.PI / 2; santa.userData.dyn = true; xo.add(santa);
    env.santa = santa;
    // 눈사람
    W.XMAS.snowmen.forEach(function (p) { var sm = makeSnowman(); sm.position.set(p[0], 0, p[1]); sm.rotation.y = p[2] * Math.PI / 2; xo.add(sm); });
    // 건물 정문 옆 화환, 길 위 현수막
    wreath(xhq, -3.55, 2.3, 6.45, 0, 0.9); wreath(xhq, 3.55, 2.3, 6.45, 0, 0.9);
    var banner = signPlane('메리 크리스마스', 0.7, { fs: 96, bg: '#c62828', color: '#ffffff', radius: 18, padX: 36, padY: 12 });
    banner.position.set(0, 4.85, 17.02); banner.userData.ns = true; xo.add(banner);
    // 뒷면에도 글씨가 바로 읽히도록 같은 현수막을 뒤로 돌려 한 장 더 붙인다 (한 장을 양면으로 쓰면 뒤에서 글씨가 거꾸로 보인다)
    var bannerBack = new THREE.Mesh(banner.geometry, banner.material); bannerBack.rotation.y = Math.PI;
    bannerBack.position.set(0, 4.85, 16.99); bannerBack.userData.ns = true; xo.add(bannerBack);
    var bw = banner.geometry.parameters.width / 2;
    [[-bw + 0.1, W.LAMPS[0][0]], [bw - 0.1, W.LAMPS[1][0]]].forEach(function (q) {                                             // 현수막 끈
      var len = Math.hypot(q[1] - q[0], 3.85 - 5.15), rope = box(len, 0.03, 0.03, 0x3a3a3a, (q[0] + q[1]) / 2, 4.5, 17.02, xo);
      rope.rotation.z = Math.atan2(3.85 - 5.15, q[1] - q[0]);
    });
    // 알전구: 건물 모서리와 지붕선, 1층 위, 정문 차양, 가게 지붕선, 가로등 사이, 길 건너
    var strHq = [], str = [];
    [-1, 1].forEach(function (sd) { var v = []; for (var y = 1.2; y <= 36.3; y += 0.5) v.push([sd * 8.42, y, 6.42]); strHq.push(v); });
    strHq.push(sagLine([-8.4, 36.95, 6.45], [8.4, 36.95, 6.45], 36, 0.15));
    for (var fi = 0; fi < 6; fi++) { if (fi === 2 || fi === 3) continue; strHq.push(sagLine([-8 + fi * 16 / 6, 2.82, 6.45], [-8 + (fi + 1) * 16 / 6, 2.82, 6.45], 8, 0.3)); }
    strHq.push(sagLine([-3.1, 3.66, 8.82], [0, 3.66, 8.82], 8, 0.22)); strHq.push(sagLine([0, 3.66, 8.82], [3.1, 3.66, 8.82], 8, 0.22));
    fairyLights(strHq, xhq, hq, 1);
    W.SHOPS.forEach(function (s0) { for (var k = 0; k < 3; k++) str.push(sagLine([s0[0] - 3.2 + k * 6.4 / 3, 3.62, W.SHOP_Z + 2.75], [s0[0] - 3.2 + (k + 1) * 6.4 / 3, 3.62, W.SHOP_Z + 2.75], 7, 0.28)); });
    [-1, 1].forEach(function (sd) { str.push(sagLine([sd * 4.4, 3.86, 17], [sd * 4.4, 3.86, 27], 26, 0.9)); });
    str.push(sagLine([-4.4, 3.86, 27], [4.4, 3.86, 27], 16, 0.55));
    fairyLights(str, xo, outdoor, 1);
    // 그림자 설정과 묶기
    xo.traverse(function (o) { if (!o.isMesh || o.userData.ns || o.isInstancedMesh && !o.userData.rcv) return; o.receiveShadow = true; o.castShadow = !o.userData.rcv; });
    mergeStatic(xo, true);
    xhq.traverse(function (o) { if (o.isMesh && !o.isInstancedMesh) { o.receiveShadow = true; o.castShadow = true; } });
    mergeStatic(xhq, true);
    // ---- 로비 ----
    var xl = new THREE.Group(); xl.userData.dyn = true; lobby.add(xl); env.xmasParts.push(xl);
    xmasTree(xl, lobby, W.XMAS.lobbyTree[0], W.XMAS.lobbyTree[1], 0.52, false);
    wreath(xl, -6.4, 3.7, -LD / 2 + 0.2, 0, 1); wreath(xl, 5.6, 3.7, -LD / 2 + 0.2, 0, 1);
    var db = signPlane('메리 크리스마스', 0.36, { fs: 80, bg: '#c62828', color: '#ffffff', radius: 14, padX: 30, padY: 10 });
    db.position.set(0, 0.62, -2.33); xl.add(db);
    roomLights(xl, lobby, 0.25);
    xl.traverse(function (o) { if (o.isMesh && !o.isInstancedMesh && !o.userData.ns) o.castShadow = true; });
    mergeStatic(xl, true);
    // NPC 산타 모자
    npcs.forEach(function (n) { var h = buildHat('h_santa'); n.g.add(h); env.xmasParts.push(h); });
    // ---- 사무실, 사장실 ----
    [[office, 0], [ceo, 1]].forEach(function (q) {
      var xr = new THREE.Group(); xr.userData.dyn = true; q[0].add(xr); env.xmasParts.push(xr);
      roomLights(xr, q[0], 0.25);
      wreath(xr, 4.2, 3.7, -LD / 2 + 0.2, 0, 0.9);
      if (q[1]) xmasTree(xr, ceo, 10.5, 2.5, 0.45, false);
      mergeStatic(xr, true);
    });
    env.xmasParts.forEach(function (o) { o.visible = false; });
  })();
  // 실내도 움직이지 않는 것은 묶어서 그린다
  mergeStatic(lobby, true); mergeStatic(office, true); mergeStatic(ceo, true);

  function setTheme(on) {
    if (xmasOn === !!on && env.themeSet) return;
    env.themeSet = true; xmasOn = !!on;
    env.xmasParts.forEach(function (o) { o.visible = xmasOn; });
    npcs.forEach(function (n) { n.g.userData.hatLift = xmasOn ? 0.4 : 0; });      // 산타 모자 높이만큼 이름표를 올린다
    env.view.pano.material.map = xmasOn ? env.view.snowTex : env.view.dayTex; env.view.pano.material.needsUpdate = true;
  }
  function curCols() {
    if (W.isOut(area)) return xmasOn ? W.XMAS_OUT : null;
    if (area === 'in') return xmasOn ? W.XMAS_IN : null;
    return furnCols;
  }
  var SANTA_LINES = ['호호호, 메리 크리스마스!', '올해 착한 일 많이 했나요?', '선물은 이벤트에서 받을 수 있어요!', '순록들은 오늘 쉬는 날이에요.',
    '눈사람한테도 인사해 주세요!', '산타 모자는 상점에서 무료예요.', '따뜻하게 입고 다녀요!'];
  var santaN = 0;
  function santaTalk() { say(env.santa, SANTA_LINES[santaN++ % SANTA_LINES.length]); env.santa.userData.bubble.position.y = 3.3; }
  var twinkleAt = 0;
  function xmasTick(t, dt, outside) {
    if (outside && env.santa) {
      env.santa.userData.arm.rotation.z = 2.5 + Math.sin(t * 5) * 0.35;      // 손 흔들기
      env.santa.position.y = Math.abs(Math.sin(t * 2.2)) * 0.05;
      expireBubble(env.santa, performance.now());
      env.deer.forEach(function (d) { d.head.rotation.x = Math.sin(t * 1.3 + d.ph) * 0.12; });
    }
    if (t < twinkleAt) return;
    twinkleAt = t + 0.15;                                                       // 알전구 반짝임: 몇 개씩 껐다 켠다
    env.bulbs.forEach(function (b) {
      if (!b.root.visible) return;
      var n = b.base.length, k = Math.max(1, Math.floor(n * 0.05)), c = new THREE.Color();
      for (var i = 0; i < k; i++) {
        var j = Math.floor(Math.random() * n);
        b.dim[j] = b.dim[j] ? 0 : 1;
        b.im.setColorAt(j, b.dim[j] ? c.copy(b.base[j]).multiplyScalar(0.25) : b.base[j]);
      }
      b.im.instanceColor.needsUpdate = true;
    });
  }

  /* ---------- 마을: 무거마을의 본투비헤븐, 게임마을의 플레이존·마을 엘리베이터, 건물 안 ---------- */
  function vName(v) { return W.VILLAGES[v] ? W.VILLAGES[v].n : ''; }
  var nm1G = new THREE.Group(), nm2G = new THREE.Group(), pzG = new THREE.Group();
  [nm1G, nm2G, pzG].forEach(function (g) { g.visible = false; scene.add(g); });
  (function buildVillageOutside() {
    var extN = new THREE.Group(), extP = new THREE.Group(), ext;      // 본투비헤븐은 무거마을(본사와 함께), 플레이존은 게임마을에만
    hq.add(extN); vill.add(extP);
    var N = W.NAMU, Pz = W.PLAY, fz = N.z + N.d / 2;
    var pave = tileTex('#c4b9a5', '#a39983', 1, 1);
    function pad(x, z, w, d) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), texMat(pave.clone()));
      m.material.map.repeat.set(w, d); m.material.map.needsUpdate = true;
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.021, z); m.userData.rcv = true; ext.add(m);
    }
    // 광장에서 건물 문까지 이어지는 길
    [N, Pz].forEach(function (B) {
      ext = B === N ? extN : extP;
      pad(B.x, fz + 2.6, 4.4, 5.2);
      var x0 = B.x < 0 ? B.x + 2.2 : 11.1, x1 = B.x < 0 ? -11.1 : B.x - 2.2;
      pad((x0 + x1) / 2, 7.4, Math.abs(x1 - x0), 2.6);
    });
    function door(B, frame) {
      box(3.0, 3.0, 0.3, frame, B.x, 1.5, fz + 0.05, ext);
      box(1.2, 2.6, 0.08, 0x9fd0ee, B.x - 0.62, 1.3, fz + 0.24, ext);
      box(1.2, 2.6, 0.08, 0x9fd0ee, B.x + 0.62, 1.3, fz + 0.24, ext);
      var en = labelSprite('입구', 0.5, { bg: 'rgba(47,111,237,0.92)', fs: 44 });
      en.position.set(B.x, 3.45, fz + 1.2); ext.add(en);
    }
    function windows(B, y, col, frame) {
      [-4, -1.6, 1.6, 4].forEach(function (dx) {
        if (y < 3 && Math.abs(dx) < 2) return;                          // 1층 가운데는 문
        box(1.6, 1.3, 0.1, frame, B.x + dx, y, fz + 0.02, ext);
        box(1.4, 1.1, 0.12, col, B.x + dx, y, fz + 0.04, ext);
      });
    }
    // 본투비헤븐: 2층짜리 따뜻한 크림색 건물, 하늘빛 간판
    ext = extN;
    box(N.w, 7.2, N.d, 0xf3e6cf, N.x, 3.6, N.z, ext);
    box(N.w + 0.3, 0.35, N.d + 0.3, 0x7a5236, N.x, 3.6, N.z, ext);          // 층 띠
    box(N.w + 0.6, 0.5, N.d + 0.6, 0x6b4a32, N.x, 7.45, N.z, ext);          // 지붕
    box(N.w + 0.1, 0.6, N.d + 0.1, 0x8d7a64, N.x, 0.3, N.z, ext);           // 기단
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { box(0.45, 7.2, 0.45, 0x7a5236, N.x + sx * N.w / 2, 3.6, N.z + sz * N.d / 2, ext); }); });
    windows(N, 1.9, 0xbfe3f5, 0x7a5236); windows(N, 5.4, 0xbfe3f5, 0x7a5236);
    door(N, 0x6b4a32);
    box(8.4, 1.5, 0.25, 0x3d6fb5, N.x, 4.55, fz + 0.15, ext);
    var nsg = signPlane(W.BH_NAME, 1.1, { fs: 104, bg: '#3d6fb5', padX: 30, padY: 6 });
    nsg.position.set(N.x, 4.55, fz + 0.3); ext.add(nsg);
    var gBush2 = new THREE.IcosahedronGeometry(0.7, 1);
    [-1, 1].forEach(function (sd) {
      var px = N.x + sd * 3.6;
      var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.5, 0.6, 14), mat(0x8d7a64)); pot.position.set(px, 0.3, fz + 1.0); ext.add(pot);
      var bu = new THREE.Mesh(gBush2, mat(0x4d9042)); bu.scale.set(0.8, 1.3, 0.8); bu.position.set(px, 1.35, fz + 1.0); ext.add(bu);
    });
    extN.traverse(function (o) { if (o.isMesh && !o.userData.ns) { o.castShadow = !o.userData.rcv; o.receiveShadow = true; } });
    mergeStatic(extN, true);
    // 플레이존: 보랏빛 건물에 반짝이는 줄무늬와 간판
    ext = extP;
    box(Pz.w, 6.4, Pz.d, 0x3b2a6b, Pz.x, 3.2, Pz.z, ext);
    box(Pz.w + 0.6, 0.45, Pz.d + 0.6, 0x241947, Pz.x, 6.6, Pz.z, ext);
    box(Pz.w + 0.1, 0.6, Pz.d + 0.1, 0x6c6480, Pz.x, 0.3, Pz.z, ext);
    var neon = [0xff5fa2, 0xffd23f, 0x4fd1ff, 0x7cff6b];
    neon.forEach(function (c, k) {
      var st = new THREE.Mesh(new THREE.BoxGeometry(Pz.w + 0.12, 0.14, 0.12), new THREE.MeshBasicMaterial({ color: c }));
      st.position.set(Pz.x, 0.9 + k * 0.32, fz + 0.06); st.userData.ns = true; ext.add(st);
    });
    windows(Pz, 4.0, 0x7fd8ff, 0x241947);
    door(Pz, 0x241947);
    var psg = signPlane('플레이존', 1.25, { fs: 110, bg: '#ff5fa2', padX: 34, padY: 6 });
    psg.position.set(Pz.x, 5.25, fz + 0.3); ext.add(psg);

    // 게임마을 가운데: 마을 엘리베이터, 분수, 마을 이름 간판
    var B = W.BOOTH;
    box(3.4, 0.3, 3.4, 0x6b7480, B.x, 0.15, B.z, vill);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { box(0.22, 3.8, 0.22, 0x39424f, B.x + q[0] * 1.55, 2.05, B.z + q[1] * 1.55, vill); });
    box(3.5, 0.5, 3.5, 0x2f6fed, B.x, 4.1, B.z, vill);
    var gl = new THREE.MeshBasicMaterial({ color: 0xbfe3f5, transparent: true, opacity: 0.35, depthWrite: false });
    [[0, -1.55, 0], [-1.55, 0, Math.PI / 2], [1.55, 0, Math.PI / 2]].forEach(function (q) {
      var pl = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.5), gl); pl.position.set(B.x + q[0], 2.05, B.z + q[1]); pl.rotation.y = q[2]; pl.userData.dyn = true; vill.add(pl);
    });
    box(2.6, 3.3, 0.08, 0xc9d0da, B.x, 1.95, B.z - 1.2, vill);                 // 안쪽 문
    var bl = signPlane('마을 엘리베이터', 0.42, { fs: 56, bg: '#2f6fed', radius: 10 });
    bl.position.set(B.x, 4.1, B.z + 1.77); vill.add(bl);
    var F = W.FOUNTAIN;
    var basin = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.35, 0.6, 28), mat(0xb9b2a5)); basin.position.set(F.x, 0.3, F.z); vill.add(basin);
    var water = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 1.95, 0.05, 28), new THREE.MeshLambertMaterial({ color: 0x6fb7e8, transparent: true, opacity: 0.85 }));
    water.position.set(F.x, 0.55, F.z); water.userData.ns = true; vill.add(water);
    var pil = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 12), mat(0xc9c2b4)); pil.position.set(F.x, 1.1, F.z); vill.add(pil);
    var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.4, 0.3, 20), mat(0xc9c2b4)); bowl.position.set(F.x, 1.95, F.z); vill.add(bowl);
    var spray = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 12), new THREE.MeshLambertMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.7 }));
    spray.position.set(F.x, 2.5, F.z); spray.userData.dyn = true; spray.userData.ns = true; vill.add(spray); env.spray = spray;
    var S = W.VSIGN;
    [-3.9, 3.9].forEach(function (dx) { box(0.3, 4.2, 0.3, 0x6b4a32, S.x + dx, 2.1, S.z, vill); });
    box(8.4, 1.9, 0.3, 0x6b4a32, S.x, 3.4, S.z, vill);
    [1, -1].forEach(function (sd) {
      var sg = signPlane('🎮 ' + vName('gm'), 1.5, { fs: 120, bg: '#ff5fa2', color: '#ffffff', padX: 40, padY: 6 });
      sg.position.set(S.x, 3.4, S.z + sd * 0.17); if (sd < 0) sg.rotation.y = Math.PI; vill.add(sg);
    });
    vill.traverse(function (o) { if (o.isMesh && !o.userData.ns && !o.userData.dyn) { o.castShadow = !o.userData.rcv; o.receiveShadow = true; } });
    mergeStatic(vill, true);
  })();

  // ---- 열매 나무: 본투비헤븐 1층(큰 나무)과 1~10구역(작은 나무). 열매는 지금 있는 곳의 나무에 단다 ----
  var fruitG = new THREE.Group(); fruitG.visible = false; scene.add(fruitG);
  var gFruit = new THREE.SphereGeometry(0.2, 14, 10), gStem = new THREE.CylinderGeometry(0.02, 0.02, 0.18, 5);
  var fruitMat = new THREE.MeshPhongMaterial({ color: new THREE.Color(0xd62828).convertSRGBToLinear(), shininess: 80, specular: 0x553333 });
  var fruits = [];                                                    // { id, name, f, slot, g }
  function treeSlots() {                                               // 잎 덩어리 아랫면과 옆면을 고르게 돌아가며
    var T = W.treePos(area), s0 = area === 'nm1_mu' ? TREE_S.nm1 : TREE_S.floor, out = [];
    for (var i = 0; i < W.FRUIT_SHOW; i++) {
      var a = i * 2.39996, ring = i % 3, r = [2.5, 2.9, 3.2][ring] * s0, y = ([3.0, 3.55, 4.05][ring] - (i % 2) * 0.25) * s0;
      out.push([T.x + Math.cos(a) * r, y, T.z + Math.sin(a) * r]);
    }
    return out;
  }
  function buildTree(g, T, s0, label) {
    var ring = new THREE.Mesh(new THREE.CylinderGeometry(1.7 * s0, 1.8 * s0, 0.45 * s0, 24), mat(0xa39983)); ring.position.set(T.x, 0.22 * s0, T.z); g.add(ring);
    var soil = new THREE.Mesh(new THREE.CylinderGeometry(1.55 * s0, 1.55 * s0, 0.05, 24), mat(0x5b4636)); soil.position.set(T.x, 0.45 * s0, T.z); g.add(soil);
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * s0, 0.85 * s0, 3.4 * s0, 12), mat(0x6b4c33)); trunk.position.set(T.x, 1.9 * s0, T.z); g.add(trunk);
    [0, 2.1, 4.2].forEach(function (a) {
      var br = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s0, 0.25 * s0, 1.9 * s0, 8), mat(0x6b4c33));
      br.position.set(T.x + Math.cos(a) * 0.7 * s0, 3.5 * s0, T.z + Math.sin(a) * 0.7 * s0); br.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); g.add(br);
    });
    var gL = new THREE.IcosahedronGeometry(1, 1);
    [[0, 4.6, 0, 2.2], [1.9, 4.2, 0.6, 1.6], [-1.8, 4.3, -0.5, 1.6], [0.5, 4.2, -1.9, 1.5], [-0.6, 4.1, 1.9, 1.5],
      [1.4, 4.9, -1.2, 1.2], [-1.3, 5.0, 1.1, 1.2], [2.3, 3.9, -1.2, 1.1], [-2.2, 3.9, 1.3, 1.1]].forEach(function (c, k) {
      var m = new THREE.Mesh(gL, mat([0x3f803b, 0x4d9042, 0x58994a, 0x467f3c][k % 4]));
      m.scale.set(c[3] * s0, c[3] * 0.75 * s0, c[3] * s0); m.position.set(T.x + c[0] * s0, Math.min(c[1], 5.2) * s0, T.z + c[2] * s0); m.rotation.set(k, k * 2, 0); g.add(m);
    });
    var tl = labelSprite(label, 0.34, { bg: 'rgba(63,143,78,0.92)', fs: 44 });
    tl.position.set(T.x, 1.25 * Math.max(s0, 0.9), T.z + 2.2 * s0); g.add(tl);
  }
  function fruitMesh(f, slot, slots) {
    var g = new THREE.Group(), p = slots[slot];
    g.position.set(p[0], p[1], p[2]);
    var b = new THREE.Mesh(gFruit, fruitMat); g.add(b);
    var st = new THREE.Mesh(gStem, mat(0x5b3a1e)); st.position.y = 0.24; g.add(st);
    var lf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), mat(0x3f8f4e)); lf.scale.set(1.6, 0.4, 0.8); lf.position.set(0.08, 0.3, 0); g.add(lf);
    var lb = labelSprite(f[1] + (f[2] ? ' 🙏' : ''), 0.24, { bg: 'rgba(255,255,255,0.9)', color: '#7a1f1f', fs: 44, padX: 14, padY: 6 });
    lb.position.y = -0.36; g.add(lb);
    fruitG.add(g);
    return { id: f[0], name: f[1], f: f, slot: slot, g: g };
  }
  function dropFruit(fr) { fruitG.remove(fr.g); fr.g.children.forEach(function (c) { if (c.isSprite) dropSprite(c); }); }
  function setFruits(list) {                                          // list: 최근 것부터
    fruits.forEach(dropFruit); fruits = [];
    fruitG.visible = !!W.treePlace(area);
    if (!fruitG.visible) return;
    var slots = treeSlots();
    (list || []).slice(0, W.FRUIT_SHOW).reverse().forEach(function (f, i) { fruits.push(fruitMesh(f, i, slots)); });
  }
  function addFruit(f) {
    var slot = fruits.length;
    if (fruits.length >= W.FRUIT_SHOW) { var old = fruits.shift(); slot = old.slot; dropFruit(old); }   // 가장 오래된 열매가 떨어진다
    var fr = fruitMesh(f, slot, treeSlots()); fr.g.scale.setScalar(0.01); fr.grow = 0; fruits.push(fr);
  }
  (function buildNm1() {
    roomShell(nm1G, texMat(tileTex('#c9a27a', '#b88f66', LW / 3, LD / 3)), 0xf4ead8, 0xeadcc4, true);
    // 정문
    box(3.4, 3.4, 0.2, 0x6b4a32, 0, 1.7, LD / 2 - 0.05, nm1G);
    box(1.4, 3.0, 0.06, 0x9fd0ee, -0.72, 1.5, LD / 2 - 0.16, nm1G); box(1.4, 3.0, 0.06, 0x9fd0ee, 0.72, 1.5, LD / 2 - 0.16, nm1G);
    // 큰 나무: 돌 화단, 굵은 줄기, 넓게 퍼진 잎
    buildTree(nm1G, W.NM_TREE, TREE_S.nm1, '이름과 기도문을 적으면 열매가 맺혀요 · 열매를 누르면 기도문');
    // 열매 기록판, 출입명부 책상, 2층 계단
    var Bd = W.NM_BOARD;
    box(0.2, 2.2, 1.8, 0x6b4a32, Bd.x - 0.5, 1.1, Bd.z, nm1G);
    var bs = signPlane('열매 기록', 0.4, { fs: 56, bg: '#7a1f1f', radius: 10 }); bs.rotation.y = Math.PI / 2; bs.position.set(Bd.x - 0.38, 1.9, Bd.z); nm1G.add(bs);
    var Bk = W.NM_BOOK;
    box(1.3, 1.0, 0.7, 0x7a5236, Bk.x, 0.5, Bk.z + 0.9, nm1G);
    box(0.7, 0.06, 0.5, 0xf7f3e8, Bk.x, 1.04, Bk.z + 0.85, nm1G);
    var bkl = labelSprite('📖 방명록', 0.4, { bg: 'rgba(61,111,181,0.92)', fs: 44 }); bkl.position.set(Bk.x, 1.8, Bk.z + 0.9); nm1G.add(bkl);
    for (var k = 0; k < 6; k++) box(3.0, 0.22, 0.42, 0x8d6a4a, 9.2, 0.11 + k * 0.22, -7.4 - k * 0.3, nm1G);   // 올라가는 계단
    box(0.08, 1.0, 2.0, 0x39424f, 7.7, 1.4, -8.0, nm1G);
    var sl = signPlane('계단 · 2층', 0.5, { fs: 60, bg: '#1c2430', radius: 12 }); sl.position.set(9.2, 3.2, -LD / 2 + 0.17); nm1G.add(sl);
    var logo = signPlane(W.BH_NAME, 0.9, { fs: 100, bg: '#3d6fb5', padX: 30, padY: 6 }); logo.position.set(-4, 3.6, -LD / 2 + 0.17); nm1G.add(logo);
    [[-10.8, -7.8], [10.8, 7.8], [-10.8, 7.8]].forEach(function (p) {
      var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.7, 12), mat(0xc98b5e)); pot.position.set(p[0], 0.35, p[1]); nm1G.add(pot);
      var pl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), mat(0x4c9a55)); pl.scale.y = 1.4; pl.position.set(p[0], 1.5, p[1]); nm1G.add(pl);
    });
    nm1G.traverse(function (o) { if (o.isMesh) o.receiveShadow = true; });
    mergeStatic(nm1G, false);
  })();

  // ---- 본투비헤븐 2층: 방석, 단상, 벽 화면(기도제목), 찬양 영상·음악 ----
  var prayCanvas = document.createElement('canvas'); prayCanvas.width = 1400; prayCanvas.height = 420;
  var prayTex = new THREE.CanvasTexture(prayCanvas); prayTex.encoding = THREE.sRGBEncoding;
  var prayers = [], prayPage = 0, prayFlip = 0;
  function wrapText(x, text, maxW) {
    var lines = [], line = '';
    for (var i = 0; i < text.length; i++) {
      var t = line + text[i];
      if (x.measureText(t).width > maxW && line) { lines.push(line); line = text[i]; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  function drawPray() {
    var x = prayCanvas.getContext('2d'), W0 = prayCanvas.width, H0 = prayCanvas.height;
    var g = x.createLinearGradient(0, 0, 0, H0); g.addColorStop(0, '#1d2a44'); g.addColorStop(1, '#0f1626');
    x.fillStyle = g; x.fillRect(0, 0, W0, H0);
    x.textBaseline = 'top';
    x.fillStyle = '#ffd98a'; x.font = 'bold 50px Maplestory, sans-serif'; x.fillText('✦ 기도제목', 40, 22);
    x.fillStyle = 'rgba(255,255,255,0.55)'; x.font = '28px Maplestory, sans-serif';
    x.textAlign = 'right'; x.fillText('방석에 앉으면 기도제목을 쓸 수 있어요', W0 - 40, 36); x.textAlign = 'left';
    if (!prayers.length) { x.fillStyle = 'rgba(255,255,255,0.75)'; x.font = '42px Maplestory, sans-serif'; x.fillText('아직 올라온 기도제목이 없습니다.', 40, 170); prayTex.needsUpdate = true; return; }
    var per = 3, pages = Math.ceil(prayers.length / per), list = prayers.slice((prayPage % pages) * per, (prayPage % pages) * per + per), y = 104;
    list.forEach(function (p) {
      x.font = '42px Maplestory, sans-serif';
      var lines = wrapText(x, p[2], W0 - 330).slice(0, 2);
      x.fillStyle = '#9fd0ff'; x.font = 'bold 34px Maplestory, sans-serif';
      var nm = String(p[1]); x.fillText(nm.length > 8 ? nm.slice(0, 8) + '…' : nm, 40, y + 5);
      x.fillStyle = '#ffffff'; x.font = '42px Maplestory, sans-serif';
      lines.forEach(function (ln, i) { x.fillText(ln, 270, y + i * 48); });
      y += Math.max(1, lines.length) * 48 + rowGap(lines.length);
    });
    if (pages > 1) { x.fillStyle = 'rgba(255,255,255,0.5)'; x.font = '26px Maplestory, sans-serif'; x.textAlign = 'right'; x.fillText((prayPage % pages + 1) + ' / ' + pages, W0 - 40, H0 - 40); x.textAlign = 'left'; }
    prayTex.needsUpdate = true;
  }
  function rowGap(n) { return n > 1 ? 12 : 22; }
  (function buildNm2() {
    roomShell(nm2G, texMat(tileTex('#d8c8a8', '#ccbb98', LW / 3, LD / 3)), 0xf6efe2, 0xece2cf, true);
    var rug = new THREE.Mesh(new THREE.PlaneGeometry(17, 11.5), mat(0x7a2f3a)); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.015, 0.7); nm2G.add(rug);
    var gC = new THREE.CylinderGeometry(0.46, 0.5, 0.14, 18), gCt = new THREE.CylinderGeometry(0.1, 0.1, 0.02, 10);
    W.CUSHIONS.forEach(function (c, i) {
      var m = new THREE.Mesh(gC, mat(i % 2 ? 0xc9a227 : 0xb8862b)); m.position.set(c[0], 0.07, c[1]); nm2G.add(m);
      var t = new THREE.Mesh(gCt, mat(0x7a2f3a)); t.position.set(c[0], 0.15, c[1]); nm2G.add(t);
    });
    box(3.2, 0.6, 1.0, 0x6b4a32, 0, 0.3, -7.9, nm2G);                              // 단상
    box(3.4, 0.08, 1.2, 0x8d6a4a, 0, 0.64, -7.9, nm2G);
    box(14.6, 4.6, 0.2, 0x1c2430, 0, 3.1, -LD / 2 + 0.12, nm2G);                    // 화면 틀
    var scr = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.2), new THREE.MeshBasicMaterial({ map: prayTex }));
    scr.position.set(0, 3.1, -LD / 2 + 0.23); scr.userData.dyn = true; nm2G.add(scr);
    for (var k = 0; k < 6; k++) box(3.0, 0.22, 0.42, 0x8d6a4a, 9.2, 0.11 + k * 0.22, 7.6 + k * 0.3, nm2G);   // 내려가는 계단(아래층에서 올라온 모양)
    var sl = signPlane('계단 · 1층', 0.5, { fs: 60, bg: '#1c2430', radius: 12 }); sl.position.set(9.2, 3.2, LD / 2 - 0.17); sl.rotation.y = Math.PI; nm2G.add(sl);
    [[-10.8, -7.8], [10.8, -7.8]].forEach(function (p) {
      var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.7, 12), mat(0xc98b5e)); pot.position.set(p[0], 0.35, p[1]); nm2G.add(pot);
      var pl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), mat(0x4c9a55)); pl.scale.y = 1.4; pl.position.set(p[0], 1.5, p[1]); nm2G.add(pl);
    });
    nm2G.traverse(function (o) { if (o.isMesh) o.receiveShadow = true; });
    mergeStatic(nm2G, false);
    drawPray();
  })();

  // ---- 플레이존: 게임기 세 대와 랭킹판 ----
  var rankCanvas = document.createElement('canvas'); rankCanvas.width = 1024; rankCanvas.height = 640;
  var rankTex = new THREE.CanvasTexture(rankCanvas); rankTex.encoding = THREE.sRGBEncoding;
  var ranks = null;
  function fmtScore(g, v) { return g === 't25' ? (v / 1000).toFixed(2) + '초' : v + W.GAMES[g].unit; }
  function drawRanks() {
    var x = rankCanvas.getContext('2d'), w = rankCanvas.width, h = rankCanvas.height;
    var g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a1b55'); g.addColorStop(1, '#140d2e');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.textBaseline = 'top'; x.fillStyle = '#ffd23f'; x.font = 'bold 44px Maplestory, sans-serif';
    x.fillText('🏆 이번 주 랭킹', 36, 24);
    x.fillStyle = 'rgba(255,255,255,0.6)'; x.font = '24px Maplestory, sans-serif';
    x.fillText('매주 월요일 0시 마감 · 1~3위 코인 ' + (ranks ? ranks.prize.join('/') : W.RANK_PRIZE.join('/')), 400, 40);
    Object.keys(W.GAMES).forEach(function (k, ci) {
      var cx = 36 + ci * 330, y = 110;
      x.fillStyle = ['#ff5fa2', '#4fd1ff', '#7cff6b'][ci]; x.font = 'bold 32px Maplestory, sans-serif'; x.fillText(W.GAMES[k].n, cx, y);
      y += 52;
      var list = ranks && ranks.games[k] ? ranks.games[k].slice(0, 7) : [];
      if (!list.length) { x.fillStyle = 'rgba(255,255,255,0.5)'; x.font = '26px Maplestory, sans-serif'; x.fillText('아직 기록 없음', cx, y); }
      list.forEach(function (r, i) {
        x.fillStyle = i < 3 ? ['#ffd23f', '#d9e2ec', '#e0a96d'][i] : '#ffffff'; x.font = (i < 3 ? 'bold ' : '') + '26px Maplestory, sans-serif';
        var nm = String(r[0]); if (nm.length > 7) nm = nm.slice(0, 7) + '…';
        x.fillText((i + 1) + '. ' + nm, cx, y);
        x.textAlign = 'right'; x.fillText(fmtScore(k, r[1]), cx + 300, y); x.textAlign = 'left';
        y += 46;
      });
    });
    rankTex.needsUpdate = true;
  }
  (function buildPz() {
    roomShell(pzG, texMat(tileTex('#2b2347', '#352c57', LW / 2, LD / 2)), 0x3b2a6b, 0x33245e, true);
    box(3.4, 3.4, 0.2, 0x241947, 0, 1.7, LD / 2 - 0.05, pzG);
    box(1.4, 3.0, 0.06, 0x9fd0ee, -0.72, 1.5, LD / 2 - 0.16, pzG); box(1.4, 3.0, 0.06, 0x9fd0ee, 0.72, 1.5, LD / 2 - 0.16, pzG);
    var cols = [0xff5fa2, 0x4fd1ff, 0x7cff6b];
    W.CABINETS.forEach(function (c, i) {
      var g = new THREE.Group(); g.position.set(c.x, 0, -8.0);
      box(1.6, 2.3, 1.2, 0x1c1633, 0, 1.15, 0, g);
      box(1.62, 0.25, 1.22, cols[i], 0, 2.2, 0, g);
      box(1.5, 0.12, 0.6, 0x2a2147, 0, 1.05, 0.62, g);                              // 조작판
      var st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), mat(0x111111)); st.position.set(-0.35, 1.2, 0.65); g.add(st);
      var bt = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat(cols[i])); bt.position.set(-0.35, 1.32, 0.65); g.add(bt);
      [0.15, 0.4].forEach(function (bx0) { var b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), mat(0xffd23f)); b2.position.set(bx0, 1.13, 0.68); g.add(b2); });
      box(1.4, 0.8, 0.04, 0x0b0820, 0, 1.65, 0.6, g);                               // 화면
      var sc = signPlane(W.GAMES[c.g].n, 0.3, { fs: 64, bg: '#0b0820', color: '#' + ('000000' + cols[i].toString(16)).slice(-6), padX: 12, padY: 8 });
      if (sc.geometry.parameters.width > 1.3) sc.scale.setScalar(1.3 / sc.geometry.parameters.width);
      sc.position.set(0, 1.65, 0.63); g.add(sc);
      pzG.add(g);
      var lb = labelSprite('게임 · ' + W.GAMES[c.g].n, 0.38, { bg: 'rgba(20,28,40,0.78)', fs: 44 }); lb.position.set(c.x, 2.9, -7.4); pzG.add(lb);
    });
    var R = W.RANK_BOARD;
    box(0.2, 3.6, 5.8, 0x0b0820, -LW / 2 + 0.1, 2.3, R.z, pzG);
    var rb = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.375), new THREE.MeshBasicMaterial({ map: rankTex }));
    rb.rotation.y = Math.PI / 2; rb.position.set(-LW / 2 + 0.22, 2.3, R.z); rb.userData.dyn = true; pzG.add(rb);
    [0xff5fa2, 0xffd23f, 0x4fd1ff].forEach(function (c, k) {
      var st = new THREE.Mesh(new THREE.BoxGeometry(LW - 0.4, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: c }));
      st.position.set(0, 4.9 + k * 0.25, -LD / 2 + 0.2); pzG.add(st);
    });
    var logo = signPlane('플레이존', 0.8, { fs: 100, bg: '#ff5fa2', padX: 30, padY: 6 }); logo.position.set(-8, 4.0, LD / 2 - 0.17); logo.rotation.y = Math.PI; pzG.add(logo);
    pzG.traverse(function (o) { if (o.isMesh) o.receiveShadow = true; });
    mergeStatic(pzG, true);
    drawRanks();
  })();

  // 건물 안의 상호작용 자리
  var nm1Spots = [
    { x: W.NM_TREE.x, z: W.NM_TREE.z + 2.4, r: 3.4, label: '열매 맺기', run: function () { openFruit(); } },
    { x: W.NM_BOARD.x + 0.6, z: W.NM_BOARD.z, r: 1.6, label: '열매 기록 보기', run: function () { openFruitLog(); } },
    { x: W.NM_BOOK.x, z: W.NM_BOOK.z, r: 1.9, label: '방명록 쓰기·보기', run: function () { openGuest(); } },
    { x: W.NM_STAIRS1.x, z: W.NM_STAIRS1.z, r: 1.9, label: '2층으로 올라가기', run: function () { sendMsg({ t: 'stairs' }); } }
  ];
  var nm2Spots = [
    { x: W.NM_STAIRS2.x, z: W.NM_STAIRS2.z, r: 1.9, label: '1층으로 내려가기', run: function () { sendMsg({ t: 'stairs' }); } },
    { x: 0, z: -6.4, r: 2.2, label: '기도제목 모두 보기', run: function () { openPrays(); } }
  ];
  var pzSpots = W.CABINETS.map(function (c) {
    return { x: c.x, z: -6.3, r: 1.5, label: W.GAMES[c.g].n + ' 하기', run: function () { openGame(c.g); } };
  }).concat([{ x: W.RANK_BOARD.x + 0.8, z: W.RANK_BOARD.z, r: 2.4, label: '랭킹 보기', run: function () { openRanks(); } }]);
  function nearCushion() {
    var best = 1.4, found = -1, i, c, d, oid, o, taken;
    for (i = 0; i < W.CUSHIONS.length; i++) {
      c = W.CUSHIONS[i]; d = Math.hypot(c[0] - P.x, c[1] - P.z);
      if (d >= best) continue;
      taken = false;
      for (oid in others) { o = others[oid]; if (o.sit && Math.abs(o.x - c[0]) < 0.2 && Math.abs(o.z - c[1]) < 0.2) taken = true; }
      if (!taken) { best = d; found = i; }
    }
    return found;
  }
  function sitY(a) { return W.kindOf(a || area) === 'nm2' ? -0.2 : SIT_Y; }

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
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = type !== 'rug'; o.receiveShadow = true; } });
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
  function floorLabel(n) {                             // 로비, 1~10구역(2~11층), 사장실(12층)
    if (n === 1) return '로비';
    var f = floors[n], name = f && f.name ? f.name : '';
    return W.floorName(n) + (name && name !== W.floorName(n) ? ' · ' + name : '');
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
  var ZOOM_MIN = 0.5, ZOOM_MAX = 3.6;                  // 시점 거리 배율 (야외 기본 8m × 배율 → 약 4~29m)
  var cam = { yaw: 0, pitch: 0.42, zoom: 1.3, follow: true, manualT: 0, entry: null };
  // 시점 따라가기(기본 켜짐): 걸으면 카메라가 천천히 캐릭터 뒤로 돌아간다
  try { cam.follow = localStorage.getItem('bonsa_follow') !== '0'; } catch (err) {}
  // 시점 거리 배율은 기기에 기억해 둔다.
  try { var zs = parseFloat(localStorage.getItem('bonsa_zoom')); if (zs >= ZOOM_MIN && zs <= ZOOM_MAX) cam.zoom = zs; } catch (err) {}
  var zoomSaveT = 0;
  function setZoom(z) {
    cam.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    clearTimeout(zoomSaveT);
    zoomSaveT = setTimeout(function () { try { localStorage.setItem('bonsa_zoom', cam.zoom.toFixed(2)); } catch (err) {} }, 400);
  }
  var area = 'out';
  var lockUntil = 0, uiOpen = false, playing = false;

  // 같은 장소에 있는 다른 사람들
  var others = {};
  function addOther(p) {
    if (others[p.id]) removeOther(p.id);
    var g = makeCharacter(BODY_COLORS[p.id % BODY_COLORS.length], tagOf(p.r, p.n), p.id);
    setTag(g, tagOf(p.r, p.n), repFloorOf(p.id));
    applyLook(g, p.id, lookOf(p));
    g.position.set(p.x, 0, p.z); g.rotation.y = p.f;
    scene.add(g);
    others[p.id] = { g: g, x: p.x, z: p.z, f: p.f, walk: 0, umb: !!p.u, n: p.n, r: p.r, sit: !!p.s };
  }
  function removeOther(id) {
    var o = others[id];
    if (!o) return;
    dropSprite(o.g.userData.tag); dropSprite(o.g.userData.repTag); dropSprite(o.g.userData.bubble);
    scene.remove(o.g);
    delete others[id];
  }
  function setOthers(list) {
    Object.keys(others).forEach(removeOther);
    list.forEach(addOther);
  }

  /* ---------- 장소 전환 (서버가 허락한 뒤에만 실행) ---------- */
  var elevNear = true;
  function applyArea(next, x, z) {
    area = next; elevNear = true;
    var k = W.kindOf(next), v = W.villageOf(next);
    outdoor.visible = k === 'out'; lobby.visible = k === 'in';
    hq.visible = next === 'out'; vill.visible = next === 'o_gm';      // 무거마을엔 본사·본투비헤븐, 게임마을엔 마을 엘리베이터·플레이존
    nm1G.visible = k === 'nm1'; nm2G.visible = k === 'nm2'; pzG.visible = k === 'pz';
    ceo.visible = next === 'f12'; office.visible = k === 'floor' && next !== 'f12';
    furnGroup.visible = ceo.visible || office.visible;
    skyGroup.visible = k !== 'in';                                 // 사무실·본투비헤븐·플레이존에서도 창밖으로 하늘이 보인다
    viewGroup.visible = k === 'floor' || k === 'nm1' || k === 'nm2' || k === 'pz';
    viewGroup.position.y = k === 'nm2' ? -4 : k === 'floor' ? -3 * (W.floorOf(next) - 1) : -1;   // 높은 층일수록 바깥 땅이 아래로 (1층 건물도 바닥과 겹치지 않게 조금 아래)
    P.x = x; P.z = z;
    refreshPlace();
  }
  function refreshPlace() {
    var n = W.floorOf(area), k = W.kindOf(area), v = vName(W.villageOf(area));
    var t = n ? floorLabel(n) : k === 'out' ? v : k === 'nm1' ? W.BH_NAME + ' 1층' : k === 'nm2' ? W.BH_NAME + ' 2층' : k === 'pz' ? v + ' · 플레이존' : '';
    if ($('place').textContent !== t) $('place').textContent = t;
    refreshFloorSign();
  }
  function switchArea(next, x, z, list, face, pins, furn) {
    lockUntil = performance.now() + 700;
    $('fade').classList.add('on');
    setTimeout(function () {
      closeElev(); closeFinfo(); closeRoster(); closeProf(); closeBoard(); closeMenu(); closeDeco(); closeShop(); closeEvents(); closeVillageUi();
      mySit = false;
      applyArea(next, x, z);
      setFruits([]); bdItems = []; drawBoard3();
      if (W.kindOf(next) === 'nm2') { bgmStop(); videoOpen(); } else { videoClose(true); musicStop(); if (playing) bgmStart(); }
      setPapers(pins); setFurn(furn);
      P.face = typeof face === 'number' ? face : (next === 'in' ? Math.PI : 0);
      // 1.9.2 (사용자 요청): 건물·계단으로 들어가면 카메라가 캐릭터 앞에서 얼굴을 비추고(뒤가 벽이라 답답하지 않게),
      // 움직이기 시작하면 천천히 캐릭터 뒤로 돌아간다. 야외로 나오면 바로 캐릭터 뒤.
      if (W.isOut(next)) { cam.yaw = P.face + Math.PI; cam.entry = null; }
      else { cam.yaw = P.face; cam.entry = { yaw: P.face + Math.PI }; }
      cam.pitch = W.isOut(next) ? 0.42 : 0.36;
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
    $('bNote').textContent = (m.b === 1 ? '누구나 읽고, 글은 사장과 부장이 씁니다.' : '누구나 읽고, 글은 이 구역에 등록한 구역원이 씁니다.')
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
  var quality = 'high', qualityChosen = false;
  try { var savedQ = localStorage.getItem('bonsa_quality'); if (savedQ) { qualityChosen = true; if (savedQ === 'low') quality = 'low'; } } catch (e) {}
  function applyQuality() {
    renderer.setPixelRatio(quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    var on = quality !== 'low';
    if (renderer.shadowMap.enabled !== on) {                 // 그림자를 켜고 끄면 재질을 다시 만들어야 한다
      renderer.shadowMap.enabled = on;
      scene.traverse(function (o) { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.needsUpdate = true; }); });
    }
    shadowsOn = on;
    if (env.lowHide) env.lowHide.forEach(function (o) { o.visible = on; });
    resize();
  }
  function renderMenu() {
    $('mnWho').textContent = tagOf(me.r, me.n || '') + (me.floor ? ' · ' + floorLabel(me.floor) + ' 등록' + (repFloorOf(myId) ? ' (★ 대표자)' : '') : ' · 등록한 구역 없음') + ' · ' + moneyText();
    $('mnBoardF').style.display = me.floor ? '' : 'none';
    $('mnBoardF').firstChild.nodeValue = me.floor ? floorLabel(me.floor) + ' 게시판' : '내 구역 게시판';
    $('mnDeco').style.display = typeof canDeco === 'function' && canDeco() ? '' : 'none';
    $('mnBgm').lastChild.textContent = bgm.on ? '켜짐' : '꺼짐';
    $('mnNotice').textContent = canNotice() ? '한 주 공지 쓰기' : '한 주 공지 보기';
    $('mnQuality').lastChild.textContent = quality === 'low' ? '낮음 (가볍게)' : '보통';
    $('mnFollow').lastChild.textContent = cam.follow ? '켜짐' : '꺼짐';
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
  $('mnMega').addEventListener('click', function () { closeMenu(); openMega(); });
  /* ---------- 홈 화면 앱 (PWA) ---------- */
  // 안드로이드 크롬 등은 설치 창을 직접 띄우고, 아이폰 Safari 는 '홈 화면에 추가' 방법을 안내한다.
  var installEvt = null;
  function isStandalone() {
    try { return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true; }
    catch (e) { return false; }
  }
  var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function refreshInstall() {
    var show = !isStandalone();
    $('mnInstall').style.display = show ? '' : 'none';
    $('authInstall').style.display = show ? 'block' : 'none';
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; refreshInstall(); });
  window.addEventListener('appinstalled', function () { installEvt = null; refreshInstall(); toast('홈 화면에 「본사」 앱을 설치했습니다.'); });
  function doInstall() {
    if (installEvt) {
      var ev = installEvt; installEvt = null;
      ev.prompt();
      if (ev.userChoice) ev.userChoice.then(function () { refreshInstall(); });
      return;
    }
    var t = isIOS
      ? (/CriOS|FxiOS|EdgiOS|KAKAOTALK|NAVER|Instagram|FBAN/.test(navigator.userAgent)
        ? '아이폰은 Safari 에서만 설치할 수 있습니다.\n\n1. 이 주소를 Safari 로 엽니다.\n2. 아래쪽 공유 버튼(네모에서 화살표가 나온 모양)을 누릅니다.\n3. "홈 화면에 추가"를 누릅니다.'
        : '1. 화면 아래쪽(아이패드는 위쪽)의 공유 버튼(네모에서 화살표가 나온 모양)을 누릅니다.\n2. 목록을 올려 "홈 화면에 추가"를 누릅니다.\n3. 오른쪽 위 "추가"를 누르면 홈 화면에 「본사」 아이콘이 생깁니다.')
      : /KAKAOTALK|NAVER|Instagram|FBAN|FB_IAB/.test(navigator.userAgent)
        ? '카카오톡·네이버 같은 앱 안의 브라우저에서는 설치가 안 됩니다.\n\n오른쪽 위 메뉴에서 "다른 브라우저로 열기"(크롬, 삼성 인터넷)를 누른 뒤 다시 설치해 주세요.'
        : '브라우저 메뉴(오른쪽 위 ⋮ 또는 아래쪽 ≡)를 열고 "앱 설치" 또는 "홈 화면에 추가"를 누릅니다.\n\n삼성 인터넷은 주소창 옆 설치 아이콘(↓)을 눌러도 됩니다.';
    $('instText').textContent = t;
    $('inst').style.display = 'flex';
  }
  $('mnInstall').addEventListener('click', function () { closeMenu(); doInstall(); });
  $('authInstall').addEventListener('click', doInstall);
  $('instClose').addEventListener('click', function () { $('inst').style.display = 'none'; });
  $('inst').addEventListener('click', function (e) { if (e.target === $('inst')) $('inst').style.display = 'none'; });
  refreshInstall();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    var regSW = function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); };
    if (document.readyState === 'complete') regSW(); else window.addEventListener('load', regSW);
  }

  /* ---------- 마을 화면: 열매, 열매 기록, 출입명부, 기도 글, 랭킹, 게임, 음악, 마을 이동 ---------- */
  function modalOpen(id) { return $(id).style.display === 'flex'; }
  function showModal(id) { uiOpen = true; $(id).style.display = 'flex'; }
  function hideModal(id) { if (!modalOpen(id)) return; $(id).style.display = 'none'; uiOpen = false; }
  ['fruitM', 'fruitLogM', 'entryM', 'prayM', 'rankM', 'fruitDetM', 'guestM', 'praysM', 'noticeM', 'noticeEdM', 'bdM'].forEach(function (id) {
    $(id).addEventListener('click', function (e) { if (e.target === $(id) || (e.target.getAttribute && e.target.getAttribute('data-close') === '1')) hideModal(id); });
  });
  function closeVillageUi() { ['fruitM', 'fruitLogM', 'entryM', 'prayM', 'rankM', 'fruitDetM', 'guestM', 'praysM', 'noticeEdM', 'bdM'].forEach(hideModal); closeGame(true); }
  function timeText(ms) {
    var d = new Date(ms + 9 * 3600000);
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
  }
  function placeShort(a) {
    var n = W.floorOf(a), k = W.kindOf(a);
    if (n) return W.floorName(n);
    if (k === 'out') return vName(W.villageOf(a));
    if (k === 'nm1' || k === 'nm2') return W.BH_NAME;
    if (k === 'pz') return '플레이존';
    return '';
  }
  function placeName(a) {
    var k = W.kindOf(a), v = W.villageOf(a);
    if (a === 'in') return '본사';
    if (k === 'nm1') return W.BH_NAME + ' 1층';
    if (k === 'nm2') return W.BH_NAME + ' 2층';
    if (k === 'pz') return vName(v) + ' 플레이존';
    return a;
  }
  // 열매 맺기: 기도할 사람의 이름과 기도문
  function openFruit() {
    if (!playing || uiOpen || !W.treePlace(area)) return;
    $('fruitName').value = ''; $('fruitPr').value = '';
    var box0 = $('fruitNow'); clear(box0);
    fruits.slice().reverse().slice(0, 20).forEach(function (fr) {           // 지금 달린 열매: 누르면 기도문
      var b = document.createElement('button'); b.type = 'button'; b.textContent = '🍎 ' + fr.name;
      b.addEventListener('click', function () { hideModal('fruitM'); openFruitDet(fr.id); });
      box0.appendChild(b);
    });
    showModal('fruitM'); setTimeout(function () { try { $('fruitName').focus(); } catch (e) {} }, 50);
  }
  $('fruitGo').addEventListener('click', function () {
    var v = $('fruitName').value.replace(/\s+/g, ' ').trim(), pr = $('fruitPr').value.replace(/\s+/g, ' ').trim();
    if (!v) { toast('이름을 적어 주세요.'); return; }
    sendMsg({ t: 'fruit', name: v.slice(0, W.FRUIT_NAME), pr: pr.slice(0, W.FRUIT_PRAY) }); hideModal('fruitM');
  });
  $('fruitName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('fruitPr').focus(); } });
  // 열매 하나: 기도문과 함께 기도한 사람
  var fdet = null;
  function openFruitDet(id) {
    if (!playing || (uiOpen && !modalOpen('fruitLogM'))) return;
    hideModal('fruitLogM');
    fdet = { id: id }; $('fdName').textContent = '🍎 …'; $('fdPr').textContent = '불러오는 중…'; $('fdBy').textContent = ''; $('fdWho').textContent = '';
    $('fdAmen').disabled = true; showModal('fruitDetM'); sendMsg({ t: 'fdet', id: id });
  }
  function renderFruitDet(f) {
    if (!modalOpen('fruitDetM') || !fdet || fdet.id !== f.id) return;
    fdet = f;
    $('fdName').textContent = '🍎 ' + f.name;
    $('fdPr').textContent = f.pr || '(기도문 없이 이름만 맺힌 열매예요)';
    $('fdBy').textContent = (f.by ? f.by + ' 님이 맺은 열매 · ' : '') + timeText(f.at);
    $('fdAmen').disabled = !!f.mine;
    $('fdAmen').textContent = f.mine ? '🙏 함께 기도했어요 (' + f.n + '명)' : '🙏 이 사람을 위해 함께 기도했어요 (' + f.n + '명)';
    $('fdWho').textContent = f.who && f.who.length ? '함께 기도한 사람: ' + f.who.join(', ') + (f.n > f.who.length ? ' 외 ' + (f.n - f.who.length) + '명' : '') : '아직 함께 기도한 사람이 없어요. 첫 번째로 기도해 주세요.';
  }
  $('fdAmen').addEventListener('click', function () { if (fdet && fdet.id) { $('fdAmen').disabled = true; sendMsg({ t: 'amen', id: fdet.id }); } });
  // 열매 기록 (전부 남는다)
  var fruitLog = { page: 0, list: [] };
  function openFruitLog() {
    if (!playing || uiOpen) return;
    fruitLog = { page: 0, list: [] }; clear($('fruitLogList')); $('fruitLogNote').textContent = '불러오는 중…'; $('fruitMore').style.display = 'none';
    showModal('fruitLogM'); sendMsg({ t: 'fruits', page: 0 });
  }
  $('fruitMore').addEventListener('click', function () { sendMsg({ t: 'fruits', page: fruitLog.page + 1 }); });
  function treeName() { return area === 'nm1_mu' ? W.BH_NAME : W.floorName(W.floorOf(area)); }
  function renderFruitLog(m) {
    if (!modalOpen('fruitLogM') || !Array.isArray(m.list)) return;
    fruitLog.page = m.page;
    if (m.page === 0) clear($('fruitLogList'));
    $('fruitLogNote').textContent = treeName() + ' 나무에 지금까지 맺힌 열매 ' + m.total + '개. 나무에는 최근 ' + W.FRUIT_SHOW + '개만 달리고 기록은 모두 남습니다. 누르면 기도문을 볼 수 있어요.';
    m.list.forEach(function (f) {
      var row = document.createElement('div'); row.className = 'lrow'; row.style.cursor = 'pointer';
      var a = document.createElement('b'); a.textContent = '🍎 ' + f[1] + (f[4] ? ' 🙏' + (f[5] || '') : '');
      var b = document.createElement('span'); b.textContent = (f[2] ? f[2] + ' · ' : '') + timeText(f[3]);
      row.appendChild(a); row.appendChild(b); $('fruitLogList').appendChild(row);
      row.addEventListener('click', function () { openFruitDet(f[0]); });
    });
    $('fruitMore').style.display = (m.page + 1) * 50 < m.total ? '' : 'none';
  }
  // 방명록 (본투비헤븐 1층 책상) + 출입명부
  var gbData = { list: [], entries: [], tab: 1 };
  function openGuest() {
    if (!playing || uiOpen) return;
    $('guestIn').value = ''; gbData.tab = 1; renderGuest();
    showModal('guestM'); sendMsg({ t: 'gb' });
  }
  function renderGuest() {
    var box0 = $('guestList'); clear(box0);
    $('gbTab1').className = gbData.tab === 1 ? 'on' : ''; $('gbTab2').className = gbData.tab === 2 ? 'on' : '';
    var list = gbData.tab === 1 ? gbData.list : gbData.entries;
    if (!list.length) { var e0 = document.createElement('div'); e0.className = 'lrow'; e0.textContent = '아직 기록이 없습니다.'; box0.appendChild(e0); }
    list.forEach(function (r) {
      var row = document.createElement('div'); row.className = 'lrow';
      var a = document.createElement('b'), b = document.createElement('span');
      if (gbData.tab === 1) { a.textContent = r[1] + ' : ' + r[2]; b.textContent = timeText(r[3]); }
      else { a.textContent = r[0]; b.textContent = placeName(r[1]) + ' · ' + timeText(r[2]); }
      row.appendChild(a); row.appendChild(b); box0.appendChild(row);
    });
  }
  $('gbTab1').addEventListener('click', function () { gbData.tab = 1; renderGuest(); });
  $('gbTab2').addEventListener('click', function () { gbData.tab = 2; renderGuest(); });
  $('guestGo').addEventListener('click', function () {
    var v = $('guestIn').value.replace(/\s+/g, ' ').trim();
    if (!v) { toast('남길 말을 써 주세요.'); return; }
    sendMsg({ t: 'gb_add', m: v.slice(0, W.GUEST_LEN) }); $('guestIn').value = '';
  });
  $('guestIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('guestGo').click(); } });
  function renderEntries(list) { gbData.entries = list; if (modalOpen('guestM')) renderGuest(); }
  // 기도제목 모두 보기
  function openPrays() { if (!playing || uiOpen) return; clear($('praysList')); $('praysList').textContent = '불러오는 중…'; showModal('praysM'); sendMsg({ t: 'prays' }); }
  function renderPrays(list) {
    if (!modalOpen('praysM')) return;
    var box0 = $('praysList'); clear(box0);
    if (!list.length) box0.textContent = '아직 올라온 기도제목이 없습니다.';
    list.forEach(function (r) {
      var row = document.createElement('div'); row.className = 'lrow';
      var a = document.createElement('b'); a.textContent = r[1] + ' : ' + r[2];
      var b = document.createElement('span'); b.textContent = timeText(r[3]);
      row.appendChild(a); row.appendChild(b); box0.appendChild(row);
    });
  }
  // 2층: 방석에 앉으면 글 쓰기
  function openPray() {
    if (!playing || uiOpen || !mySit) return;
    $('prayText').value = ''; prayCount(); showModal('prayM');
    setTimeout(function () { try { $('prayText').focus(); } catch (e) {} }, 50);
  }
  function prayCount() { $('prayCount').textContent = $('prayText').value.length + ' / ' + W.PRAY_LEN; }
  $('prayText').addEventListener('input', prayCount);
  $('prayGo').addEventListener('click', function () {
    var v = $('prayText').value.replace(/\s+/g, ' ').trim();
    if (!v) return;
    sendMsg({ t: 'pray', m: v.slice(0, W.PRAY_LEN) }); hideModal('prayM');
  });
  $('prayBtn').addEventListener('click', openPray);
  // 랭킹
  function openRanks() { if (!playing || uiOpen) return; renderRanks(); showModal('rankM'); sendMsg({ t: 'ranks' }); }
  function renderRanks() {
    var box0 = $('rankList'); clear(box0);
    if (!ranks) { box0.textContent = '불러오는 중…'; return; }
    $('rankNote').textContent = '이번 주(' + ranks.week + ' 월요일부터) 기록입니다. 매주 월요일 0시에 마감하고 게임마다 1~3위에게 ' + ranks.prize.join(', ') + '코인을 줍니다. 게임은 무료입니다.';
    Object.keys(W.GAMES).forEach(function (k) {
      var sec = document.createElement('div'); sec.className = 'sec';
      var h = document.createElement('b'); h.textContent = W.GAMES[k].n + (ranks.mine[k] !== null && ranks.mine[k] !== undefined ? ' · 내 기록 ' + fmtScore(k, ranks.mine[k]) : ''); sec.appendChild(h);
      var list = ranks.games[k] || [];
      if (!list.length) { var e = document.createElement('div'); e.className = 'lrow'; e.textContent = '아직 기록이 없습니다.'; sec.appendChild(e); }
      list.forEach(function (r, i) {
        var row = document.createElement('div'); row.className = 'lrow';
        var a = document.createElement('b'); a.textContent = (i < 3 ? ['🥇', '🥈', '🥉'][i] : (i + 1) + '.') + ' ' + r[0];
        var b = document.createElement('span'); b.textContent = fmtScore(k, r[1]);
        row.appendChild(a); row.appendChild(b); sec.appendChild(row);
      });
      var prev = ranks.prev[k] || [];
      if (prev.length) { var pv = document.createElement('div'); pv.className = 'small'; pv.textContent = '지난주 1~3위: ' + prev.map(function (r) { return r[0] + '(' + fmtScore(k, r[1]) + ')'; }).join(', '); sec.appendChild(pv); }
      box0.appendChild(sec);
    });
  }

  // ---- 게임 화면 (판정과 시간은 서버가 한다. 화면은 보여 주고 누른 것을 보낼 뿐) ----
  var gm = { on: false, g: '', sid: 0, input: '', timer: 0, t0: 0, left: 0, leftAt: 0, hideAt: 0 };
  function openGame(g) {
    if (!playing || uiOpen) return;
    uiOpen = true; gm.on = true; gm.g = g; gm.sid = 0;
    $('gameUi').style.display = 'flex'; $('gTitle').textContent = W.GAMES[g].n;
    gShowIntro();
  }
  function closeGame(silent) {
    if (!gm.on) return;
    if (gm.sid) sendMsg({ t: 'g_quit' });
    gm.on = false; gm.sid = 0; clearInterval(gm.timer); gm.timer = 0;
    $('gameUi').style.display = 'none'; uiOpen = false;
    if (!silent) sendMsg({ t: 'ranks' });
  }
  $('gClose').addEventListener('click', function () { closeGame(false); });
  function gBody() { var b = $('gBody'); clear(b); return b; }
  function el2(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function gShowIntro() {
    $('gInfo').textContent = '';
    var b = gBody();
    b.appendChild(el2('div', 'gNote', W.GAMES[gm.g].note));
    if (ranks && ranks.mine && ranks.mine[gm.g] !== null && ranks.mine[gm.g] !== undefined) b.appendChild(el2('div', 'gNote', '이번 주 내 기록: ' + fmtScore(gm.g, ranks.mine[gm.g])));
    var go = el2('button', 'btn gBig', '시작'); go.type = 'button';
    go.addEventListener('click', gCountdown); b.appendChild(go);
  }
  function gCountdown() {
    var b = gBody(), n = 3, c = el2('div', 'gHuge', '3'); b.appendChild(c);
    var t = setInterval(function () {
      if (!gm.on) return clearInterval(t);
      n--; if (n > 0) { c.textContent = n; return; }
      clearInterval(t); c.textContent = '…'; sendMsg({ t: 'g_start', g: gm.g });
    }, 650);
  }
  function keypad(onKey) {
    var pad = el2('div', 'gPad');
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '확인'].forEach(function (k) {
      var b = el2('button', k === '확인' ? 'ok' : '', k); b.type = 'button';
      b.addEventListener('click', function () { onKey(k); }); pad.appendChild(b);
    });
    return pad;
  }
  function gIn(m) {
    if (!gm.on || m.g !== gm.g) return;
    if (m.st !== 'end') gm.sid = m.sid;
    if (m.sid && m.sid !== gm.sid && m.st !== 'end') return;
    clearInterval(gm.timer); gm.timer = 0;
    if (m.st === 'end') return gEnd(m);
    if (m.g === 'mem') {
      $('gInfo').textContent = m.lv + '단계 · ' + m.seq.length + '자리';
      var b = gBody(), show = el2('div', 'gHuge mono', m.seq); b.appendChild(show);
      var hint = el2('div', 'gNote', '외우세요!'); b.appendChild(hint);
      setTimeout(function () {
        if (!gm.on || gm.sid !== m.sid) return;
        gm.input = '';
        var b2 = gBody(), disp = el2('div', 'gHuge mono', '_'); b2.appendChild(disp);
        b2.appendChild(el2('div', 'gNote', '본 숫자를 그대로 입력하세요'));
        b2.appendChild(keypad(function (k) {
          if (k === '←') gm.input = gm.input.slice(0, -1);
          else if (k === '확인') { if (gm.input) sendMsg({ t: 'g_ans', a: gm.input, sid: gm.sid }); return; }
          else if (gm.input.length < 45) gm.input += k;
          disp.textContent = gm.input || '_';
        }));
      }, m.show);
    } else if (m.g === 'math') {
      gm.left = m.left; gm.leftAt = performance.now();
      var info = function () { var l = Math.max(0, gm.left - (performance.now() - gm.leftAt)); $('gInfo').textContent = '맞힌 문제 ' + m.score + ' · 남은 시간 ' + Math.ceil(l / 1000) + '초'; };
      info(); gm.timer = setInterval(info, 200);
      gm.input = '';
      var bb = gBody();
      if (m.last !== null) bb.appendChild(el2('div', m.last ? 'gOk' : 'gNo', m.last ? '정답!' : '틀렸어요'));
      bb.appendChild(el2('div', 'gHuge', m.q + ' = ?'));
      var d2 = el2('div', 'gHuge mono', '_'); bb.appendChild(d2);
      bb.appendChild(keypad(function (k) {
        if (k === '←') gm.input = gm.input.slice(0, -1);
        else if (k === '확인') { if (gm.input) sendMsg({ t: 'g_ans', a: gm.input, sid: gm.sid }); return; }
        else if (gm.input.length < 6) gm.input += k;
        d2.textContent = gm.input || '_';
      }));
    } else if (m.g === 't25') {
      if (m.st === 'grid') {
        gm.t0 = performance.now(); gm.next = 1;
        var tick = function () { $('gInfo').textContent = '다음 숫자 ' + Math.min(25, gm.next) + ' · ' + ((performance.now() - gm.t0) / 1000).toFixed(1) + '초'; };
        tick(); gm.timer = setInterval(tick, 100);
        var g5 = el2('div', 'gGrid'); gBody().appendChild(g5);
        m.grid.forEach(function (n) {
          var b = el2('button', '', String(n)); b.type = 'button'; b.setAttribute('data-n', n);
          b.addEventListener('pointerdown', function (e) { e.preventDefault(); if (!b.disabled) sendMsg({ t: 'g_ans', a: n, sid: gm.sid }); });
          g5.appendChild(b);
        });
      } else {
        var t = setInterval(function () { $('gInfo').textContent = '다음 숫자 ' + Math.min(25, gm.next) + ' · ' + ((performance.now() - gm.t0) / 1000).toFixed(1) + '초'; }, 100);
        gm.timer = t;
        var btn = $('gBody').querySelector('[data-n="' + m.n + '"]');
        if (m.st === 'ok') { gm.next = m.n + 1; if (btn) { btn.disabled = true; btn.className = 'done'; } }
        else if (btn) { btn.className = 'miss'; setTimeout(function () { if (btn.className === 'miss') btn.className = ''; }, 250); }
      }
    }
  }
  function gEnd(m) {
    gm.sid = 0;
    var b = gBody();
    $('gInfo').textContent = '';
    if (m.quit) { gShowIntro(); return; }
    var sc = m.g === 't25' ? (m.score ? fmtScore('t25', m.score) : '기록 없음') : fmtScore(m.g, m.score);
    b.appendChild(el2('div', 'gNote', m.g === 'mem' ? '틀렸어요! 통과한 단계' : m.g === 'math' ? '시간 끝! 맞힌 문제' : '완료! 걸린 시간'));
    b.appendChild(el2('div', 'gHuge', sc));
    if (m.best !== undefined) b.appendChild(el2('div', 'gNote', (m.newBest ? '이번 주 최고 기록! ' : '') + '이번 주 내 최고 ' + fmtScore(m.g, m.best) + ' · 현재 ' + m.rank + '위'));
    else b.appendChild(el2('div', 'gNote', '기록은 1점 이상(1~25는 끝까지)일 때 남습니다.'));
    if (m.coin > 0) b.appendChild(el2('div', 'gNote gCoin', '🪙 +' + m.coin + '코인'));
    else if (m.coin === -1) b.appendChild(el2('div', 'gNote', '오늘 받을 수 있는 게임 코인을 모두 받았어요. 내일 또 와요!'));
    var again = el2('button', 'btn gBig', '다시 하기'); again.type = 'button'; again.addEventListener('click', gCountdown); b.appendChild(again);
  }

  // ---- 2층 음악: 모두가 같은 곡의 같은 부분을 듣는다 (서버 시각 기준으로 자리를 맞춘다) ----
  var music = { el: null, on: true, idx: -1 };
  try { music.on = localStorage.getItem('bonsa_music') !== 'off'; } catch (e) {}
  function musicPos() {
    var total = 0, i, t;
    W.MUSIC.forEach(function (s) { total += s.d; });
    t = ((Date.now() + clockOffset) / 1000) % total;
    for (i = 0; i < W.MUSIC.length; i++) { if (t < W.MUSIC[i].d) return { i: i, t: t }; t -= W.MUSIC[i].d; }
    return { i: 0, t: 0 };
  }
  function musicPlay() {
    if (!music.on || W.kindOf(area) !== 'nm2' || !playing || (video.open && !video.fb)) return;
    if (!music.el) {
      music.el = new Audio(); music.el.preload = 'auto'; music.el.volume = 0.8;
      music.el.addEventListener('ended', function () { music.idx = -1; musicPlay(); });
    }
    var p = musicPos(), a = music.el;
    if (music.idx !== p.i) { music.idx = p.i; a.src = W.MUSIC[p.i].f; }
    var seek = function () { try { if (Math.abs(a.currentTime - p.t) > 3) a.currentTime = p.t; } catch (e) {} };
    if (a.readyState >= 1) seek(); else a.addEventListener('loadedmetadata', seek, { once: true });
    var pr = a.play();
    if (pr && pr.catch) pr.catch(function () { $('musicBtn').textContent = '♪ 눌러서 음악 듣기'; });
    musicUi();
  }
  function musicStop() { if (music.el) { music.el.pause(); } musicUi(); }
  function musicUi() {
    var show = W.kindOf(area) === 'nm2' && playing && (!video.open || video.fb);
    $('musicBtn').style.display = show ? 'block' : 'none';
    $('videoBtn').style.display = W.kindOf(area) === 'nm2' && playing && !video.open ? 'block' : 'none';
    if (show) $('musicBtn').textContent = music.on && music.el && !music.el.paused ? '♪ 음악 끄기' : '♪ 음악 켜기';
  }
  $('musicBtn').addEventListener('click', function () {
    var playingNow = music.on && music.el && !music.el.paused;
    music.on = !playingNow;
    try { localStorage.setItem('bonsa_music', music.on ? 'on' : 'off'); } catch (e) {}
    if (music.on) { music.idx = -1; musicPlay(); } else musicStop();
    musicUi();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) musicStop(); else musicPlay(); });

  // ---- 마을 이동 (본사 1층 엘리베이터, 삼산·성남 마을 엘리베이터) ----
  function renderVillages() {
    var box0 = $('villList'); clear(box0);
    var here = W.villageOf(area);
    W.VKEYS.forEach(function (v) {
      var b = document.createElement('button'); b.type = 'button';
      b.appendChild(document.createTextNode(vName(v)));
      var sp = document.createElement('span'); sp.textContent = v === here ? '지금 마을' : v === 'mu' ? '본사 로비' : '플레이존 · 마을 엘리베이터';
      b.appendChild(sp);
      if (v === here) { b.className = 'here'; b.disabled = true; }
      b.setAttribute('data-v', v); box0.appendChild(b);
    });
    var canTravel = area === 'in' || area === 'o_gm';
    $('villRow').style.display = canTravel ? '' : 'none';
    $('floorBox').style.display = W.floorOf(area) ? '' : 'none';
  }
  $('villList').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b || b.disabled) return;
    sendMsg({ t: 'travel', to: b.getAttribute('data-v') });
  });
  function villageMsg(m) {
    switch (m.t) {
      case 'fruitset': setFruits(m.list); return true;
      case 'fruitnew': if (W.treePlace(area)) addFruit(m.f); if (m.by) logLine('🍎 ' + m.by + ' 님이 "' + m.f[1] + '" 열매를 맺었습니다.', true); return true;
      case 'fruitlog': renderFruitLog(m); return true;
      case 'fdet': if (m.f) renderFruitDet(m.f); return true;
      case 'amen':
        fruits.forEach(function (fr) { if (fr.id === m.id) fr.f[4] = m.n; });
        if (m.by && m.by !== me.n) { var af = fruits.filter(function (fr) { return fr.id === m.id; })[0]; logLine('🙏 ' + m.by + ' 님이 ' + (af ? '"' + af.name + '"' : '') + ' 열매를 위해 함께 기도했습니다.', true); }
        return true;
      case 'entries': renderEntries(m.list || []); return true;
      case 'gb': gbData.list = m.list || []; gbData.entries = m.entries || []; if (modalOpen('guestM')) renderGuest(); return true;
      case 'prays': renderPrays(m.list || []); return true;
      case 'prayset': prayers = m.list || []; prayPage = 0; drawPray(); if (m.praise) setPraise(m.praise); return true;
      case 'praise': setPraise(m.praise); return true;
      case 'wnotice': wnotice = m.n || { m: '' }; if (m.pop && wnotice.m) showNotice(true); return true;
      case 'attend': toast('출석 보상 ' + m.n + '코인을 받았습니다! 오늘도 반가워요.'); logLine('✅ 오늘 출석 +' + m.n + '코인', true); return true;
      case 'bdset': bdItems = m.list || []; drawBoard3(); if (modalOpen('bdM')) drawBd(); return true;
      case 'praynew': prayers.unshift(m.it); prayers = prayers.slice(0, 30); prayPage = 0; prayFlip = 0; drawPray(); return true;
      case 'ranks': ranks = m; drawRanks(); if (modalOpen('rankM')) renderRanks(); return true;
      case 'g': gIn(m); return true;
    }
    return false;
  }
  // 매 프레임: 화면 넘기기, 열매 자라기, 분수
  function villageTick(dt, t) {
    if (W.kindOf(area) === 'nm2' && prayers.length > 3) {
      prayFlip += dt;
      if (prayFlip > 8) { prayFlip = 0; prayPage++; drawPray(); }
    }
    fruits.forEach(function (f) { if (f.grow !== undefined && f.grow < 1) { f.grow = Math.min(1, f.grow + dt * 1.6); f.g.scale.setScalar(0.01 + f.grow * 0.99); } });
    if (env.spray && vill.visible) { env.spray.scale.y = 1 + Math.sin(t * 6) * 0.08; env.spray.rotation.y += dt; }
    $('prayBtn').style.display = W.kindOf(area) === 'nm2' && mySit && !uiOpen && playing ? 'block' : 'none';
  }

  /* ---------- 한 주 공지: 접속하면 10초 동안 화면 가운데에. 총관리자·사장·부장이 쓴다 ---------- */
  var wnotice = { m: '' }, noticeTimer = 0, noticeShown = false;
  function canNotice() { return me.r === 'owner' || me.r === 'ceo' || me.r === 'manager'; }
  function showNotice(auto) {
    if (!wnotice || !wnotice.m) { if (!auto) toast('지금 올라온 한 주 공지가 없습니다.'); return; }
    if (uiOpen && !modalOpen('noticeM')) { if (auto) logLine('📢 한 주 공지: ' + wnotice.m.replace(/\s+/g, ' ').slice(0, 60), true); return; }
    $('ntText').textContent = wnotice.m;
    $('ntBy').textContent = (wnotice.by ? wnotice.by + ' · ' : '') + (wnotice.at ? timeText(wnotice.at) : '');
    showModal('noticeM');
    clearInterval(noticeTimer); $('ntLeft').textContent = '';
    if (!auto) return;
    var left = 10;
    $('ntLeft').textContent = left + '초 뒤에 닫혀요';
    noticeTimer = setInterval(function () {
      left--;
      if (!modalOpen('noticeM')) { clearInterval(noticeTimer); return; }
      if (left <= 0) { clearInterval(noticeTimer); hideModal('noticeM'); return; }
      $('ntLeft').textContent = left + '초 뒤에 닫혀요';
    }, 1000);
  }
  function openNoticeEd() {
    if (!playing || uiOpen) return;
    $('neText').value = wnotice.m || ''; neCount(); showModal('noticeEdM');
  }
  function neCount() { $('neCount').textContent = $('neText').value.length + ' / ' + W.NOTICE_LEN; }
  $('neText').addEventListener('input', neCount);
  $('neGo').addEventListener('click', function () { sendMsg({ t: 'wnotice', m: $('neText').value.slice(0, W.NOTICE_LEN) }); hideModal('noticeEdM'); });
  $('mnNotice').addEventListener('click', function () { closeMenu(); if (canNotice()) openNoticeEd(); else showNotice(false); });

  /* ---------- 전도 게시판 (1~10구역): 메모·스티커·사진. 구역원이 붙이고, 붙인 사람은 끌어서 옮긴다 ---------- */
  var bd = { sel: 0, drag: null, color: 0, busy: false };
  var BD_W = 1400, BD_H = 700;
  function bdImg(pid) {
    var im = bdPhotos[pid];
    if (!im) {
      im = bdPhotos[pid] = new Image();
      im.onload = function () { drawBoard3(); if (modalOpen('bdM')) drawBd(); };
      im.src = '/photo/' + pid;
    }
    return im.complete && im.naturalWidth ? im : null;
  }
  function bdSize(it) {                                  // 판 위에서 차지하는 크기 (픽셀)
    if (it[1] === 'memo') return { w: 230, h: 180 };
    if (it[1] === 'stk') return { w: 130, h: 130 };
    var im = bdImg(it[8]), ar = im ? im.naturalWidth / im.naturalHeight : 4 / 3, w = 290, h = Math.max(170, Math.min(330, w / ar));
    return { w: w + 20, h: h + (it[6] ? 52 : 24) };
  }
  function drawBoardTo(cv, items, sel) {
    var x = cv.getContext('2d');
    var g = x.createLinearGradient(0, 0, BD_W, BD_H); g.addColorStop(0, '#c99a66'); g.addColorStop(1, '#b07f4c');
    x.fillStyle = g; x.fillRect(0, 0, BD_W, BD_H);
    x.fillStyle = 'rgba(80,50,20,0.16)';
    for (var i = 0; i < 260; i++) { var px = (i * 397) % BD_W, py = (i * 211 + (i % 7) * 53) % BD_H; x.fillRect(px, py, 3, 3); }
    x.textBaseline = 'top'; x.textAlign = 'left';
    x.fillStyle = 'rgba(255,255,255,0.92)'; x.font = 'bold 44px Maplestory, sans-serif';
    x.fillText('✝ ' + floorLabel(W.floorOf(area) || 2) + ' 전도 게시판', 30, 22);
    if (!items.length) {
      x.fillStyle = 'rgba(255,255,255,0.8)'; x.font = '38px Maplestory, sans-serif'; x.textAlign = 'center';
      x.fillText('구역원들이 메모·스티커·사진으로 꾸며요', BD_W / 2, BD_H / 2 - 20); x.textAlign = 'left';
    }
    items.forEach(function (it) {
      var sz = bdSize(it), cx = it[2] * BD_W, cy = it[3] * BD_H;
      x.save(); x.translate(cx, cy); x.rotate(it[4] || 0);
      x.shadowColor = 'rgba(0,0,0,0.3)'; x.shadowBlur = 10; x.shadowOffsetY = 4;
      if (it[1] === 'memo') {
        x.fillStyle = W.BOARD.colors[it[5]] || W.BOARD.colors[0]; x.fillRect(-sz.w / 2, -sz.h / 2, sz.w, sz.h);
        x.shadowColor = 'transparent';
        x.fillStyle = '#2b2b2b'; x.font = '30px Maplestory, sans-serif';
        wrapText(x, it[6], sz.w - 30).slice(0, 4).forEach(function (ln, k) { x.fillText(ln, -sz.w / 2 + 15, -sz.h / 2 + 24 + k * 36); });
        x.fillStyle = 'rgba(0,0,0,0.45)'; x.font = '20px Maplestory, sans-serif'; x.textAlign = 'right';
        x.fillText(it[9] || '', sz.w / 2 - 10, sz.h / 2 - 28); x.textAlign = 'left';
        x.fillStyle = '#d62828'; x.beginPath(); x.arc(0, -sz.h / 2 + 8, 9, 0, Math.PI * 2); x.fill();
      } else if (it[1] === 'stk') {
        x.shadowColor = 'transparent';
        x.font = '110px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(W.BOARD.stickers[it[7]] || '⭐', 0, 4);
      } else {
        x.fillStyle = '#ffffff'; x.fillRect(-sz.w / 2, -sz.h / 2, sz.w, sz.h);
        x.shadowColor = 'transparent';
        var im = bdImg(it[8]), iw = sz.w - 20, ih = sz.h - (it[6] ? 52 : 24);
        if (im) x.drawImage(im, -sz.w / 2 + 10, -sz.h / 2 + 10, iw, ih);
        else { x.fillStyle = '#d9dde3'; x.fillRect(-sz.w / 2 + 10, -sz.h / 2 + 10, iw, ih); }
        if (it[6]) { x.fillStyle = '#333'; x.font = '24px Maplestory, sans-serif'; x.fillText(it[6], -sz.w / 2 + 12, sz.h / 2 - 38); }
        x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillRect(-36, -sz.h / 2 - 10, 72, 22);         // 테이프
      }
      if (sel && it[0] === sel) { x.strokeStyle = '#2f6fed'; x.lineWidth = 6; x.setLineDash([14, 10]); x.strokeRect(-sz.w / 2 - 8, -sz.h / 2 - 8, sz.w + 16, sz.h + 16); x.setLineDash([]); }
      x.restore();
    });
  }
  function drawBoard3() { if (W.floorOf(area) < 2 || W.floorOf(area) > 11) return; drawBoardTo(bdCanvas3, bdItems, 0); bdTex.needsUpdate = true; }
  function bdHigh() { return me.r === 'owner' || me.r === 'ceo' || me.r === 'manager'; }
  function bdCanAdd() { var n = W.floorOf(area); return me.floor === n || bdHigh(); }
  function bdCanEdit(it) { var n = W.floorOf(area); return it[10] === myId || bdHigh() || (floors[n] && floors[n].rep === myId); }
  function bdFind(id) { for (var i = 0; i < bdItems.length; i++) if (bdItems[i][0] === id) return bdItems[i]; return null; }
  function drawBd() {
    drawBoardTo($('bdCanvas'), bdItems, bd.sel);
    var it = bd.sel ? bdFind(bd.sel) : null;
    if (!it) { bd.sel = 0; $('bdSel').style.display = 'none'; return; }
    $('bdSel').style.display = 'flex';
    $('bdSelText').textContent = (it[9] || '누군가') + ' 님이 붙인 ' + ({ memo: '메모', stk: '스티커', photo: '사진' })[it[1]] + (bdCanEdit(it) ? ' · 끌어서 옮길 수 있어요' : '');
    $('bdDel').style.display = bdCanEdit(it) ? '' : 'none';
  }
  function openBd() {
    var n = W.floorOf(area);
    if (!playing || uiOpen || n < 2 || n > 11) return;
    bd.sel = 0; bd.drag = null;
    $('bdTitle').textContent = '✝ ' + floorLabel(n) + ' 전도 게시판';
    $('bdNote').textContent = bdCanAdd() ? '메모·스티커·사진을 붙여 꾸며요. 내가 붙인 것은 끌어서 옮기고, 눌러서 뗄 수 있어요. (최대 ' + W.BOARD.max + '개, 사진 ' + W.BOARD.photos + '장)'
      : '이 구역에 등록한 구역원만 꾸밀 수 있어요. 구경은 누구나 할 수 있어요.';
    $('bdTools').style.display = bdCanAdd() ? 'flex' : 'none';
    $('bdMemo').style.display = 'none'; $('bdStk').style.display = 'none';
    showModal('bdM'); drawBd();
  }
  function bdPos() { return { x: 0.14 + Math.random() * 0.72, y: 0.32 + Math.random() * 0.5, rot: (Math.random() - 0.5) * 0.24 }; }
  (function () {
    var cb = $('bdColors');
    W.BOARD.colors.forEach(function (c, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'cl' + (i === 0 ? ' sel' : ''); b.style.background = c;
      b.addEventListener('click', function () { bd.color = i; Array.prototype.forEach.call(cb.children, function (x, k) { x.className = 'cl' + (k === i ? ' sel' : ''); }); });
      cb.appendChild(b);
    });
    var sg = $('bdStk');
    W.BOARD.stickers.forEach(function (e, i) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = e;
      b.addEventListener('click', function () { var p0 = bdPos(); sendMsg({ t: 'bd_add', k: 'stk', s: i, x: p0.x, y: p0.y, rot: p0.rot }); sg.style.display = 'none'; });
      sg.appendChild(b);
    });
  })();
  $('bdMemoBtn').addEventListener('click', function () { $('bdStk').style.display = 'none'; $('bdMemo').style.display = $('bdMemo').style.display === 'none' ? 'block' : 'none'; });
  $('bdStkBtn').addEventListener('click', function () { $('bdMemo').style.display = 'none'; $('bdStk').style.display = $('bdStk').style.display === 'none' ? 'grid' : 'none'; });
  $('bdMemoGo').addEventListener('click', function () {
    var v = $('bdMemoIn').value.replace(/\s+/g, ' ').trim();
    if (!v) { toast('메모 내용을 써 주세요.'); return; }
    var p0 = bdPos(); sendMsg({ t: 'bd_add', k: 'memo', m: v.slice(0, W.BOARD.memo), c: bd.color, x: p0.x, y: p0.y, rot: p0.rot });
    $('bdMemoIn').value = ''; $('bdMemo').style.display = 'none';
  });
  $('bdDel').addEventListener('click', function () { if (bd.sel) { sendMsg({ t: 'bd_del', id: bd.sel }); bd.sel = 0; drawBd(); } });
  // 사진: 폰 사진을 1000px 이하 JPG로 줄여서 올린 뒤 받은 번호로 붙인다
  $('bdPhotoBtn').addEventListener('click', function () { if (!bd.busy) $('bdFile').click(); });
  $('bdFile').addEventListener('change', function () {
    var file = this.files && this.files[0]; this.value = '';
    if (!file || !/^image\//.test(file.type)) return;
    bd.busy = true; $('bdPhotoBtn').textContent = '📷 올리는 중…';
    var done = function (msg) { bd.busy = false; $('bdPhotoBtn').textContent = '📷 사진'; if (msg) toast(msg); };
    var url = URL.createObjectURL(file), im = new Image();
    im.onerror = function () { URL.revokeObjectURL(url); done('사진을 읽지 못했습니다.'); };
    im.onload = function () {
      URL.revokeObjectURL(url);
      var k = Math.min(1, 1000 / Math.max(im.naturalWidth, im.naturalHeight)), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(im.naturalWidth * k)); cv.height = Math.max(1, Math.round(im.naturalHeight * k));
      var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);
      var send = function (q) {
        cv.toBlob(function (blob) {
          if (!blob) return done('사진을 만들지 못했습니다.');
          if (blob.size > 440 * 1024 && q > 0.45) return send(q - 0.15);
          fetch('/api/photo', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Authorization: 'Bearer ' + token }, body: blob })
            .then(function (r) { return r.json(); })
            .then(function (j) {
              if (!j.ok) return done(j.error || '사진을 올리지 못했습니다.');
              var p0 = bdPos(); sendMsg({ t: 'bd_add', k: 'photo', pid: j.id, x: p0.x, y: p0.y, rot: p0.rot * 0.6 }); done('');
            })
            .catch(function () { done('사진을 올리지 못했습니다.'); });
        }, 'image/jpeg', q);
      };
      send(0.82);
    };
    im.src = url;
  });
  // 판 위에서 누르기·끌기
  function bdPoint(e) { var r = $('bdCanvas').getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * BD_W, y: (e.clientY - r.top) / r.height * BD_H }; }
  $('bdCanvas').addEventListener('pointerdown', function (e) {
    var p0 = bdPoint(e), hit = null;
    for (var i = bdItems.length - 1; i >= 0; i--) {
      var it = bdItems[i], sz = bdSize(it);
      if (Math.abs(p0.x - it[2] * BD_W) < sz.w / 2 && Math.abs(p0.y - it[3] * BD_H) < sz.h / 2) { hit = it; break; }
    }
    bd.sel = hit ? hit[0] : 0;
    bd.drag = hit && bdCanEdit(hit) ? { id: hit[0], dx: p0.x - hit[2] * BD_W, dy: p0.y - hit[3] * BD_H, moved: false } : null;
    if (bd.drag) { try { this.setPointerCapture(e.pointerId); } catch (er) {} }
    drawBd();
  });
  $('bdCanvas').addEventListener('pointermove', function (e) {
    if (!bd.drag) return;
    var p0 = bdPoint(e), it = bdFind(bd.drag.id);
    if (!it) { bd.drag = null; return; }
    it[2] = Math.max(0.04, Math.min(0.96, (p0.x - bd.drag.dx) / BD_W)); it[3] = Math.max(0.04, Math.min(0.96, (p0.y - bd.drag.dy) / BD_H));
    bd.drag.moved = true; drawBd();
  });
  function bdUp() {
    if (!bd.drag) return;
    var it = bdFind(bd.drag.id);
    if (bd.drag.moved && it) { sendMsg({ t: 'bd_move', id: it[0], x: it[2], y: it[3] }); drawBoard3(); }
    bd.drag = null;
  }
  $('bdCanvas').addEventListener('pointerup', bdUp);
  $('bdCanvas').addEventListener('pointercancel', bdUp);

  /* ---------- 본투비헤븐 2층 찬양 영상 (유튜브). 안 되면 사진과 음악 ---------- */
  var praise = { vid: W.PRAISE.vid, photo: 0 }, video = { open: false, ok: false, fb: false, t: 0 };
  function setPraise(p) {
    if (!p || !/^[\w-]{11}$/.test(p.vid)) return;
    var changed = p.vid !== praise.vid || (p.photo | 0) !== praise.photo;
    praise = { vid: p.vid, photo: p.photo | 0 };
    if (changed && video.open) { videoClose(true); videoOpen(); }
  }
  function videoOpen() {
    if (!playing || W.kindOf(area) !== 'nm2') return;
    video.open = true; video.ok = false; video.fb = false; musicStop();
    var f = $('vFrame'); clear(f);
    var ifr = document.createElement('iframe');
    ifr.src = 'https://www.youtube-nocookie.com/embed/' + praise.vid + '?autoplay=1&playsinline=1&rel=0&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
    ifr.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; ifr.title = '찬양 영상';
    ifr.addEventListener('load', function () { try { ifr.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); } catch (e) {} });
    f.appendChild(ifr);
    $('videoBox').className = ''; $('videoBox').style.display = 'block'; $('vMin').textContent = '작게';
    clearTimeout(video.t);
    video.t = setTimeout(function () {                    // 영상 소식이 없으면 사진으로 바꿀 수 있는 단추를 보여 준다 (영상은 그대로 둔다)
      if (!video.open || video.ok || video.fb) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'vCap'; b.style.border = '0'; b.style.textAlign = 'left'; b.style.fontFamily = 'inherit';
      b.textContent = '영상이 안 나오나요? 눌러서 사진과 음악으로 보기'; b.addEventListener('click', videoFallback); f.appendChild(b);
    }, 9000);
    musicUi();
  }
  function videoFallback() {
    if (!video.open) return;
    video.fb = true; clearTimeout(video.t);
    var f = $('vFrame'); clear(f);
    var im = document.createElement('img'); im.alt = '찬양기도회'; im.src = praise.photo ? '/photo/' + praise.photo : '/img/praise.jpg';
    f.appendChild(im);
    var cap = document.createElement('div'); cap.className = 'vCap'; cap.textContent = '찬양기도회 · 음악이 함께 나와요'; f.appendChild(cap);
    music.idx = -1; musicPlay();
  }
  function videoClose(silent) {
    clearTimeout(video.t);
    if (video.open) { clear($('vFrame')); $('videoBox').style.display = 'none'; }
    video.open = false; video.fb = false;
    if (!silent && W.kindOf(area) === 'nm2') { music.idx = -1; musicPlay(); }
    musicUi();
  }
  window.addEventListener('message', function (e) {
    if (!video.open || !/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
    var d = null; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (er) { return; }
    if (!d || typeof d !== 'object') return;
    if (d.event === 'onError') videoFallback();
    else if (d.event === 'onReady' || d.event === 'infoDelivery' || d.event === 'initialDelivery') video.ok = true;
  });
  $('vClose').addEventListener('click', function () { videoClose(false); });
  $('vMin').addEventListener('click', function () { var b = $('videoBox'); b.className = b.className === 'min' ? '' : 'min'; $('vMin').textContent = b.className === 'min' ? '크게' : '작게'; });
  $('videoBtn').addEventListener('click', function () { musicStop(); videoOpen(); });

  /* ---------- 확성기 ---------- */
  // 쓰기: 메뉴 → 확성기. 코인을 내면 모든 접속자 화면 위쪽에 5초 동안 뜬다.
  function megaRefresh() {
    var n = $('megaText').value.trim().length, price = W.MEGA.price, money = me.money || 0;
    $('megaCount').textContent = n + ' / ' + W.MEGA.len;
    $('megaGo').textContent = price ? price + '코인으로 외치기' : '외치기';
    $('megaGo').disabled = !n || money < price;
    $('megaNote').textContent = '지금 접속한 모든 사람의 화면 위쪽에 ' + Math.round(W.MEGA.show / 1000) + '초 동안 뜹니다. 방금 들어온 사람에게도 1분 안의 확성기는 보입니다. '
      + (price ? '한 번에 ' + price + '코인, ' : '') + Math.round(W.MEGA.cooldown / 1000) + '초에 한 번 쓸 수 있습니다. ' + moneyText()
      + (money < price ? ' (코인이 모자랍니다)' : '');
  }
  function openMega() {
    if (!playing || uiOpen) return;
    uiOpen = true; $('mega').style.display = 'flex'; megaRefresh();
    setTimeout(function () { try { $('megaText').focus(); } catch (e) {} }, 50);
  }
  function closeMega() { if ($('mega').style.display !== 'flex') return; $('mega').style.display = 'none'; uiOpen = false; }
  $('megaText').addEventListener('input', megaRefresh);
  $('megaText').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('megaGo').click(); } });
  $('megaClose').addEventListener('click', closeMega);
  $('mega').addEventListener('click', function (e) { if (e.target === $('mega')) closeMega(); });
  $('megaGo').addEventListener('click', function () {
    var v = $('megaText').value.replace(/\s+/g, ' ').trim();
    if (!v) return;
    sendMsg({ t: 'mega', m: v.slice(0, W.MEGA.len) });
    $('megaText').value = ''; closeMega();
  });
  // 보이기: 서버가 5초 간격으로 보내지만, 들어올 때 다시 받은 것이 겹치면 여기서 줄을 세운다
  var megaQueue = [], megaTimer = 0;
  function megaShow() {
    if (megaTimer || !megaQueue.length) return;
    var it = megaQueue.shift();
    $('megaWho').textContent = tagOf(it.r, it.n) + ' :';
    $('megaMsg').textContent = it.m;
    $('megaBar').className = 'on';
    megaTimer = setTimeout(function () {
      $('megaBar').className = '';
      megaTimer = setTimeout(function () { megaTimer = 0; megaShow(); }, 300);
    }, W.MEGA.show);
  }
  function megaIn(m) {
    if (typeof m.m !== 'string' || typeof m.n !== 'string') return;
    megaQueue.push({ n: m.n, r: m.r, m: m.m.slice(0, W.MEGA.len) });
    if (megaQueue.length > 5) megaQueue.shift();
    megaShow();
  }
  $('mnBgm').addEventListener('click', function () {
    bgm.on = !bgm.on;
    try { localStorage.setItem('bonsa_bgm', bgm.on ? '1' : '0'); } catch (e) {}
    if (bgm.on) bgmStart(); else bgmStop();
    renderMenu();
  });
  $('mnFollow').addEventListener('click', function () {
    cam.follow = !cam.follow;
    try { localStorage.setItem('bonsa_follow', cam.follow ? '1' : '0'); } catch (e) {}
    renderMenu();
  });
  $('mnQuality').addEventListener('click', function () {
    quality = quality === 'low' ? 'high' : 'low'; qualityChosen = true;
    try { localStorage.setItem('bonsa_quality', quality); } catch (e) {}
    applyQuality(); renderMenu();
  });
  function closePass() { if ($('pass').style.display !== 'flex') return; $('pass').style.display = 'none'; $('pwOld').value = $('pwNew').value = $('pwNew2').value = ''; uiOpen = false; }
  $('mnPass').addEventListener('click', function () { closeMenu(); uiOpen = true; $('pass').style.display = 'flex'; });
  $('pwClose').addEventListener('click', closePass);
  $('pwForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var o = $('pwOld').value, n = $('pwNew').value;
    if (n.length < W.PASS_MIN) { toast('새 비밀번호는 ' + W.PASS_MIN + '자 이상이어야 합니다.'); return; }
    if (n !== $('pwNew2').value) { toast('새 비밀번호 두 칸이 서로 다릅니다.'); return; }
    fetch('/api/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token, old: o, next: n }) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (!r.ok) return toast(r.error || '바꾸지 못했습니다.');
        if (r.token) keepToken(r.token);
        closePass(); toast('비밀번호를 바꿨습니다. 다른 기기의 자동 로그인은 풀렸습니다.');
      })
      .catch(function () { toast('서버에 연결하지 못했습니다.'); });
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
    { x: W.KIOSK[0], z: W.KIOSK[1], r: 2.2, label: '구역 안내판', run: function () { openFinfo(); } },
    { x: -6.5, z: -LD / 2, r: 2.6, label: '구역 게시판', run: function () { openBoard(); } },
    { x: W.FL_TREE.x - 2.2, z: W.FL_TREE.z, r: 2.6, label: '열매 맺기', run: function () { openFruit(); } },
    { x: W.FL_TREE.x, z: W.FL_TREE.z - 2.2, r: 2.4, label: '열매 맺기', run: function () { openFruit(); } },
    { x: W.FL_BOARD.x, z: W.FL_BOARD.z - 1.4, r: 2.8, label: '전도 게시판 꾸미기', run: function () { openBd(); } }
  ];
  var ceoSpots = floorSpots.slice(0, 2);

  /* ---------- 엘리베이터와 층 안내판 ---------- */
  function setFloors(list) {
    if (!Array.isArray(list)) return;
    list.forEach(function (f) { floors[f[0]] = { name: String(f[1] || ''), c: Number(f[2]) || 0, lock: !!f[3], rep: Number(f[4]) || 0, repName: String(f[5] || '') }; });
    refreshRepTags();
    refreshPlace();
    if ($('elev').style.display === 'flex') renderElev();
    if ($('finfo').style.display === 'flex') renderFinfo();
  }
  function isTop() { return me.r === 'owner' || me.r === 'ceo'; }
  // 층 대표자: 그 사람이 대표인 층 번호 (없으면 0)
  function repFloorOf(id) {
    for (var n = W.FLOOR_MIN; n <= W.FLOOR_REG_MAX; n++) if (floors[n] && floors[n].rep === id) return n;
    return 0;
  }
  function refreshRepTags() {
    if (myId && (player.userData.rep || 0) !== repFloorOf(myId) && me.n) setTag(player, tagOf(me.r, me.n), repFloorOf(myId));
    for (var id in others) {
      var o = others[id], rf = repFloorOf(Number(id));
      if ((o.g.userData.rep || 0) !== rf) setTag(o.g, tagOf(o.r, o.n), rf);
    }
  }
  function renderElev() {
    var box0 = $('floorList'), here = W.floorOf(area), n, b, sp;
    while (box0.firstChild) box0.removeChild(box0.firstChild);
    for (n = W.FLOOR_MAX; n >= 1; n--) {
      b = document.createElement('button'); b.type = 'button';
      b.appendChild(document.createTextNode(floorLabel(n)));           // 이름은 글자로만 넣는다
      sp = document.createElement('span');
      sp.textContent = n === here ? '지금 여기' : n === 1 ? '' : n === 12 ? (floors[12] && floors[12].lock ? '잠김' : '')
        : ((floors[n] ? floors[n].c : 0) + '/' + W.FLOOR_CAP + (me.floor === n ? ' · 내 구역' : ''));
      b.appendChild(sp);
      if (n === here) { b.className = 'here'; b.disabled = true; }
      else if (me.floor === n) b.className = 'mine';
      b.setAttribute('data-floor', n);
      box0.appendChild(b);
    }
  }
  function openElev() { uiOpen = true; $('pwRow').style.display = 'none'; renderElev(); renderVillages(); $('elev').style.display = 'flex'; }
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
      $('fiNote').textContent = '사장실입니다. 여기에는 등록할 수 없습니다.';
      reg.style.display = 'none';
      canName = isTop();
    } else {
      $('fiNote').textContent = '구역원 ' + f.c + ' / ' + W.FLOOR_CAP + '명. 등록한 구역에서는 게시판에 글을 쓰고, 전도 게시판을 꾸미고, 메뉴의 꾸미기로 가구를 놓을 수 있습니다. 한 사람은 한 구역에만 등록할 수 있습니다.'
        + (me.floor && me.floor !== n ? ' 지금은 ' + W.floorName(me.floor) + '에 등록되어 있습니다.' : '');
      reg.style.display = '';
      reg.textContent = me.floor === n ? '이 구역 등록 해제' : me.floor ? W.floorName(me.floor) + ' 등록 해제' : '이 구역에 등록';
      reg.className = me.floor ? 'btn ghost' : 'btn';
      canName = isTop() || me.r === 'manager' || (me.floor === n && (me.r === 'lead' || f.rep === myId));
    }
    renderRep(n, f);
    $('fiNameRow').style.display = canName ? 'block' : 'none';
    $('fiPassRow').style.display = n === 12 && isTop() ? 'block' : 'none';
    $('fiPassNote').textContent = f.lock ? '지금 비밀번호가 걸려 있습니다.' : '지금은 누구나 들어올 수 있습니다.';
    $('fiPassOff').style.display = f.lock ? '' : 'none';
  }
  // 층 대표자 칸: 부장 이상은 등록자 중에서 정하거나 비우고, 지금 대표자는 물려주거나 내려놓는다
  var repMembers = { floor: 0, list: [] };
  function canPickRep(n, f) { return n >= W.FLOOR_MIN && n <= W.FLOOR_REG_MAX && (level(me.r) >= level('manager') || f.rep === myId); }
  function renderRep(n, f) {
    var row = $('fiRepRow');
    if (n < W.FLOOR_MIN || n > W.FLOOR_REG_MAX) { row.style.display = 'none'; return; }
    row.style.display = '';
    var boss = level(me.r) >= level('manager'), mine = f.rep && f.rep === myId;
    $('fiRepNote').textContent = (f.rep ? '대표자: ' + f.repName + (mine ? ' (나).' : '.') : '아직 대표자가 없습니다.')
      + ' 구역마다 한 명이고, 이 구역 등록자 중에서 부장 이상이 정합니다. 대표자는 구역 이름을 바꾸고 구역 게시판의 고정을 풀고, 전도 게시판 정리를 할 수 있습니다.';
    var pick = canPickRep(n, f), sel = $('fiRepSel');
    $('fiRepPick').style.display = pick ? 'flex' : 'none';
    $('fiRepQuitRow').style.display = mine || (boss && f.rep) ? 'flex' : 'none';
    $('fiRepQuit').textContent = mine ? '대표 내려놓기' : '대표자 비우기';
    $('fiRepSet').textContent = boss ? '대표로 정하기' : '대표 물려주기';
    if (!pick) return;
    clear(sel);
    var list = repMembers.floor === n ? repMembers.list : [], added = 0;
    list.forEach(function (u) {
      if (u[0] === f.rep) return;                                    // 지금 대표자는 목록에서 뺀다
      var o = document.createElement('option'); o.value = String(u[0]);
      o.textContent = tagOf(u[2], u[1]) + (u[3] ? ' · 접속 중' : ''); sel.appendChild(o); added++;
    });
    if (!added) {
      var o0 = document.createElement('option'); o0.value = ''; o0.textContent = repMembers.floor === n ? '고를 수 있는 등록자가 없습니다' : '불러오는 중…';
      sel.appendChild(o0);
    }
    $('fiRepSet').disabled = !added;
  }
  $('fiRepSet').addEventListener('click', function () { var v = Number($('fiRepSel').value); if (v) sendMsg({ t: 'frep', id: v }); });
  $('fiRepQuit').addEventListener('click', function () { sendMsg({ t: 'frep', id: 0 }); });
  function openFinfo() {
    var n0 = W.floorOf(area);
    repMembers = { floor: 0, list: [] };
    if (canPickRep(n0, floors[n0] || {})) sendMsg({ t: 'fmembers' });
    uiOpen = true; $('fiName').value = (floors[W.floorOf(area)] || {}).name || ''; $('fiPass').value = ''; renderFinfo(); $('finfo').style.display = 'flex'; }
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
    if (!canDeco()) { toast(W.floorOf(area) >= 2 ? '이 구역에 등록한 구역원만 꾸밀 수 있습니다.' : '꾸미기는 1구역부터 할 수 있습니다.'); return; }
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

  /* ---------- 총관리자가 바꾸는 설정: 값표, 안내원 대사, 공지 ---------- */
  var GUIDE_DEFAULT = GUIDE.slice(), HI_DEFAULT = NPC_GREETING, lastNotice = '';
  function applyCfg(cfg, first) {
    if (!cfg || typeof cfg !== 'object') return;
    var k, v, bs, i;
    if (cfg.prices && typeof cfg.prices === 'object') {
      for (k in cfg.prices) {
        v = Number(cfg.prices[k]);
        if (!(v >= 0)) continue;
        if (Object.prototype.hasOwnProperty.call(W.FURN, k)) W.FURN[k].price = v;
        else if (Object.prototype.hasOwnProperty.call(W.COSM, k)) W.COSM[k].price = v;
        else if (k === 'megaphone') W.MEGA.price = v;
      }
      bs = $('decoTypes').children;
      for (i = 0; i < bs.length; i++) { k = bs[i].getAttribute('data-type'); bs[i].textContent = W.FURN[k].n + ' ' + W.FURN[k].price; }
      if (deco.on) renderDeco();
      if (shopOpen()) sendMsg({ t: 'shop' });
    }
    if (cfg.npc && typeof cfg.npc === 'object') {
      NPC_GREETING = typeof cfg.npc.hi === 'string' && cfg.npc.hi ? cfg.npc.hi : HI_DEFAULT;
      GUIDE = Array.isArray(cfg.npc.guide) && cfg.npc.guide.length ? cfg.npc.guide.map(String) : GUIDE_DEFAULT;
    }
    if (cfg.theme === 'christmas' || cfg.theme === 'none') setTheme(cfg.theme === 'christmas');
    if (typeof cfg.notice === 'string' && cfg.notice && (first || cfg.notice !== lastNotice)) logLine('[공지] ' + cfg.notice);
    if (typeof cfg.notice === 'string') lastNotice = cfg.notice;
  }

  /* ---------- 상점과 치장 (값과 보유 여부는 서버가 판정한다) ---------- */
  function moneyText() { return '내 돈 ' + (me.money || 0) + '코인'; }
  function shopOpen() { return $('shop').style.display === 'flex'; }
  // 탭: 털 색, 모자, 자켓, 바지, 넥타이. 하나를 누르면 내 캐릭터에 먼저 입혀 보고, 아래 버튼으로 사거나 입는다.
  var SHOP_TABS = [['jacket', '자켓'], ['pants', '바지'], ['tie', '넥타이'], ['color', '털 색'], ['hat', '모자']];
  var LOOK_KEY = { color: 'c', hat: 'h', jacket: 'j', pants: 'pa', tie: 'ti' };
  var shop = { tab: 'jacket', sel: null, data: null };
  function hexCss(hex) { return '#' + ('000000' + hex.toString(16)).slice(-6); }
  function wornKey(slot) {                                   // 지금 입고 있는 것 (기본 옷이면 그 기본 키)
    var k = (shop.data && shop.data[LOOK_KEY[slot]]) || '';
    return k || (W.SUIT_DEF[slot] || '');
  }
  function owns(k) { return !k || (W.COSM[k] && W.COSM[k].def) || (shop.data && shop.data.own.indexOf(k) >= 0); }
  function shopPreview() {                                   // 고른 것을 내 캐릭터에만 미리 입혀 본다
    var L = lookOf(me);
    if (shop.sel !== null) L[LOOK_KEY[shop.tab]] = shop.sel;
    applyLook(player, myId, L);
  }
  function renderShop(m) {
    if (m) {
      if (!shopOpen() || !Array.isArray(m.own)) return;
      shop.data = m; me.money = Number(m.money) || 0;
    }
    if (!shop.data) return;
    $('shNote').textContent = moneyText();
    var tabs = $('shTabs'), grid = $('shGrid'), slot = shop.tab, worn = wornKey(slot);
    clear(tabs);
    SHOP_TABS.forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = t[1]; b.setAttribute('data-tab', t[0]);
      if (t[0] === slot) b.className = 'on';
      tabs.appendChild(b);
    });
    clear(grid);
    function cell(key, name, hex, status, cls) {
      var b = document.createElement('button'), dot = document.createElement('i'), nb = document.createElement('b'), st = document.createElement('small');
      b.type = 'button'; b.setAttribute('data-item', key);
      if (hex === null) dot.className = 'none'; else dot.style.background = hexCss(hex);
      nb.textContent = name; st.textContent = status;
      b.appendChild(dot); b.appendChild(nb); b.appendChild(st);
      b.className = cls + ((shop.sel === null ? worn : shop.sel) === key ? ' sel' : '');
      grid.appendChild(b);
    }
    if (slot === 'color' || slot === 'hat') cell('', slot === 'color' ? '기본 털 색' : '모자 없음', slot === 'color' ? BODY_COLORS[myId % BODY_COLORS.length] : null, worn === '' ? '착용 중' : '기본', worn === '' ? 'here' : 'mine');
    Object.keys(W.COSM).forEach(function (k) {
      var it = W.COSM[k];
      if (it.slot !== slot) return;
      var own = owns(k), name = it.n.replace(/ (자켓|바지|넥타이)$/, '');
      var hex = it.hex !== undefined ? it.hex : (k === 'h_santa' ? 0xd62f2f : k === 'h_crown' ? 0xf0c419 : k === 'h_cap' ? 0xd9483b : k === 'h_beanie' ? 0x3f6fb5 : k === 'h_party' ? 0xf2b441 : 0xf06292);
      cell(k, name, hex, worn === k ? '착용 중' : it.def ? '기본' : own ? '보유' : (it.price ? it.price + '코인' : '무료'), worn === k ? 'here' : own ? 'mine' : '');
    });
    // 아래 막대: 고른 것의 이름과 할 일
    var key = shop.sel === null ? worn : shop.sel, act = $('shAct'), it0 = key ? W.COSM[key] : null;
    var nm = it0 ? it0.n : (slot === 'color' ? '기본 털 색' : '모자 없음');
    act.disabled = false;
    if (key === worn) { $('shSel').textContent = nm + ' · 착용 중'; act.textContent = '착용 중'; act.disabled = true; act.setAttribute('data-do', ''); }
    else if (owns(key)) { $('shSel').textContent = nm + (it0 && !it0.def ? ' · 보유' : ''); act.textContent = '입기'; act.setAttribute('data-do', 'equip'); }
    else {
      var price = it0.price || 0;
      $('shSel').textContent = nm + ' · 입어 보는 중';
      if ((me.money || 0) < price) { act.textContent = price + '코인 (코인 부족)'; act.disabled = true; act.setAttribute('data-do', ''); }
      else { act.textContent = price ? price + '코인에 사기' : '무료로 받기'; act.setAttribute('data-do', 'buy'); }
    }
    shopPreview();
  }
  $('shTabs').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    shop.tab = b.getAttribute('data-tab'); shop.sel = null; renderShop();
  });
  $('shGrid').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    shop.sel = b.getAttribute('data-item'); renderShop();
  });
  $('shAct').addEventListener('click', function () {
    var d = $('shAct').getAttribute('data-do'), key = shop.sel === null ? wornKey(shop.tab) : shop.sel;
    if (d === 'buy') { sendMsg({ t: 'buy', item: key }); $('shAct').disabled = true; }
    else if (d === 'equip') { sendMsg({ t: 'equip', slot: shop.tab, item: key }); $('shAct').disabled = true; }
  });
  function openShop() {
    if (!playing || uiOpen) return;
    uiOpen = true; shop.sel = null; shop.data = null;
    $('shNote').textContent = '불러오는 중…'; clear($('shGrid')); clear($('shTabs')); $('shSel').textContent = ''; $('shAct').textContent = ''; $('shAct').disabled = true;
    $('shop').style.display = 'flex'; sendMsg({ t: 'shop' });
  }
  function closeShop() {
    if (!shopOpen()) return;
    $('shop').style.display = 'none'; uiOpen = false; shop.sel = null;
    applyLook(player, myId, lookOf(me));                       // 입어 보던 것을 벗고 실제로 입은 옷으로
  }
  $('shClose').addEventListener('click', closeShop);

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
    $('pfNote').textContent = '직급: ' + (RANKS[prof.r] || prof.r) + ' · 등록 구역: ' + (prof.floor ? floorLabel(prof.floor) : '없음') + (repFloorOf(prof.id) ? ' (★ 대표자)' : '') + ' · ' + (prof.on ? '접속 중' : '접속 안 함');
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
      sp.textContent = (u[3] ? W.floorName(u[3]) + (repFloorOf(u[0]) === u[3] ? ' ★대표' : '') : '미등록') + (u[4] ? ' · 접속 중' : '');
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
    // 열매를 누르면 기도문 (사람보다 가까우면 열매)
    var fbest = Math.min(best, 46 * 46), fhit = 0, fw = new THREE.Vector3();
    fruits.forEach(function (fr) {
      fr.g.getWorldPosition(fw); pickV.copy(fw).project(camera);
      if (!(pickV.z < 1)) return;
      var dx = (pickV.x * 0.5 + 0.5) * w - px, dy = (-pickV.y * 0.5 + 0.5) * h - py, d = dx * dx + dy * dy;
      if (d < fbest) { fbest = d; fhit = fr.id; }
    });
    if (fhit) { openFruitDet(fhit); return; }
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
    d.textContent = text; if (sys) d.className = sys === 'mega' ? 'mega' : 'sys';
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
    if (!bgm.on || bgm.timer || W.kindOf(area) === 'nm2') return;      // 본투비헤븐 2층에서는 찬양 영상·음악이 나온다
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
  // 자동 로그인을 켜면 토큰을 기기에 저장하고(30일, 접속할 때마다 연장), 끄면 앱·탭을 닫을 때까지만 기억한다
  var mode = 'login', token = null, remember = true;
  try { token = localStorage.getItem('bonsa_token'); } catch (e) {}
  if (!token) { try { token = sessionStorage.getItem('bonsa_token'); if (token) remember = false; } catch (e) {} }
  function keepToken(t) {
    token = t;
    try {
      if (remember) { localStorage.setItem('bonsa_token', t); sessionStorage.removeItem('bonsa_token'); }
      else { sessionStorage.setItem('bonsa_token', t); localStorage.removeItem('bonsa_token'); }
    } catch (e) {}
  }
  function setMode(m) {
    mode = m;
    $('tabLogin').className = m === 'login' ? 'on' : '';
    $('tabJoin').className = m === 'join' ? 'on' : '';
    // 닉네임이 곧 로그인 이름이다. 가입할 때만 글자 규칙을 보여 준다.
    $('nickLabel').textContent = m === 'join' ? '닉네임 (한글·영문·숫자 2~10자, 로그인할 때 씀)' : '닉네임';
    $('passLabel').textContent = m === 'join' ? '비밀번호 (' + W.PASS_MIN + '자 이상)' : '비밀번호';
    $('fNick').maxLength = m === 'join' ? 10 : 16;
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
    remember = $('fRemember').checked;
    var body = { nickname: $('fNick').value.trim(), password: $('fPass').value, remember: remember };
    $('authGo').disabled = true; $('authMsg').textContent = '';
    fetch(mode === 'join' ? '/api/signup' : '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (j) {
      $('authGo').disabled = false;
      if (!j.ok) { $('authMsg').textContent = j.error || '실패했습니다.'; return; }
      keepToken(j.token);
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
  function forget() { token = null; try { localStorage.removeItem('bonsa_token'); sessionStorage.removeItem('bonsa_token'); } catch (e) {} }
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
    if (villageMsg(m)) return;
    switch (m.t) {
      case 'hello':
        myId = m.id; retry = 0;
        me.money = Number(m.me.money) || 0; me.c = m.me.c || ''; me.h = m.me.h || '';
        me.j = m.me.j || ''; me.pa = m.me.pa || ''; me.ti = m.me.ti || '';
        applyLook(player, myId, lookOf(me));
        me.r = m.me.r; me.n = m.me.n; me.floor = m.me.floor || null;
        if (m.floors) setFloors(m.floors);
        setTag(player, tagOf(m.me.r, m.me.n), repFloorOf(myId));
        applyCfg(m.cfg, true);
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
        if (m.wnotice) wnotice = m.wnotice;
        if (!noticeShown) { noticeShown = true; if (wnotice.m) setTimeout(function () { showNotice(true); }, 700); }   // 접속할 때 한 번 (다시 연결될 때는 안 띄운다)
        break;
      case 'join': addOther(m.p); break;
      case 'leave': removeOther(m.id); break;
      case 'state':
        m.ps.forEach(function (s) {
          o = others[s[0]];
          if (o) { o.x = s[1] / 100; o.z = s[2] / 100; o.f = s[3] / 10; }
        });
        break;
      case 'mega': megaIn(m); break;
      case 'chat':                                       // 채팅창은 모든 접속자, 말풍선은 같은 장소에서만
        logLine((m.a && m.a !== area ? '[' + placeShort(m.a) + '] ' : '') + tagOf(m.r, m.n) + ': ' + m.m);
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
      case 'fmembers':
        if (Array.isArray(m.list)) { repMembers = { floor: Number(m.floor) || 0, list: m.list }; if ($('finfo').style.display === 'flex') renderFinfo(); }
        break;
      case 'me': me.floor = m.floor || null; if ($('finfo').style.display === 'flex') renderFinfo(); if ($('elev').style.display === 'flex') renderElev(); break;
      case 'needpw': $('pwRow').style.display = 'block'; $('pwIn').value = ''; $('pwIn').focus(); break;
      case 'toast': toast(m.m); break;
      case 'rank':
        if (!RANKS[m.r]) break;
        if (m.id === myId) { me.r = m.r; setTag(player, tagOf(me.r, me.n), repFloorOf(myId)); }
        else if (others[m.id]) { others[m.id].r = m.r; setTag(others[m.id].g, tagOf(m.r, others[m.id].n), repFloorOf(m.id)); }
        if ($('finfo').style.display === 'flex') renderFinfo();
        if ($('prof').style.display === 'flex') renderProf();
        break;
      case 'who': showProf(m); break;
      case 'posts': renderPosts(m); break;
      case 'posted': setEdit(0); toast(m.edit ? '글을 고쳤습니다.' : '글을 올렸습니다.'); break;
      case 'bnew': if (boardOpen() && m.b === curBoard && !editId) sendMsg({ t: 'posts', b: curBoard }); break;
      case 'pins': if (m.b === W.floorOf(area)) setPapers(m.list); break;
      case 'furn': onFurn(m); break;
      case 'money': me.money = Number(m.v) || 0; if (deco.on) renderDeco(); if (menuOpen()) renderMenu(); if (shopOpen()) renderShop(); break;
      case 'look':
        if (m.id === myId) { me.c = m.c || ''; me.h = m.h || ''; me.j = m.j || ''; me.pa = m.pa || ''; me.ti = m.ti || ''; if (!shopOpen()) applyLook(player, myId, lookOf(me)); }
        else if (others[m.id]) applyLook(others[m.id].g, m.id, lookOf(m));
        break;
      case 'shop': renderShop(m); break;
      case 'cfg': applyCfg(m.cfg, false); break;
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
      case 'token': if (typeof m.token === 'string' && remember) keepToken(m.token); break;
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

    var outside = W.isOut(area);
    // 크리스마스 꾸미기 중에는 비가 오지 않으면 가벼운 눈이 흩날린다 (우산은 진짜 날씨에만 나온다)
    var snowAmt = Math.max(E.snow, xmasOn ? 0.3 * (1 - clamp01(E.rain * 3)) : 0);
    rain.obj.visible = outside && E.rain > 0.02; snow.obj.visible = outside && snowAmt > 0.02;
    leaves.obj.visible = outside && E.wind > 0.2;

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
    // 그림자 범위가 내 캐릭터를 따라다니도록 빛의 과녁을 캐릭터에 둔다
    sun.target.position.set(P.x, 0, P.z);
    sun.position.set(P.x + ld[0] * 60, Math.max(ld[1], 0.25) * 60, P.z + ld[2] * 60);
    var sc = mix3([0.6, 0.68, 1], mix3([1, 0.97, 0.9], [1, 0.74, 0.5], tw * 0.8), dayF);
    sun.color.setRGB(sc[0], sc[1], sc[2]);
    // 햇빛은 세게, 하늘빛은 약하게 해서 그늘이 생기게 한다. 흐리면 햇빛이 줄고 하늘빛이 조금 는다.
    sun.intensity = 0.1 + 0.8 * dayF * (1 - E.cover * 0.92);
    var hc = mix3([0.55, 0.62, 0.95], [0.92, 0.96, 1], dayF);
    hemi.color.setRGB(hc[0], hc[1], hc[2]);
    hemi.groundColor.setRGB(0.42, 0.45, 0.36);
    hemi.intensity = 0.32 + 0.4 * dayF + 0.3 * dayF * E.cover + E.flash * 0.8;
    // 하늘: 지평선은 안개와 같은 색, 위쪽은 더 짙게
    var topC = mix3([sky[0] * 0.5, sky[1] * 0.55, sky[2] * 0.8], [sky[0] * 0.55, sky[1] * 0.72, Math.min(1, sky[2] * 1.02)], dayF);
    topC = mix3(topC, sky, E.cover * 0.7 + E.fog * 0.3);
    env.skyMat.uniforms.bottom.value.setRGB(sky[0], sky[1], sky[2]);
    env.skyMat.uniforms.top.value.setRGB(topC[0], topC[1], topC[2]);
    env.skyMat.uniforms.sunDir.value.set(sunDir[0], sunDir[1], sunDir[2]);
    env.skyMat.uniforms.sunCol.value.setRGB(sc[0], sc[1] * 0.95, sc[2] * 0.85);
    env.skyMat.uniforms.sunAmt.value = clamp01(dayF * 1.2) * (1 - E.cover) * (1 - E.fog);
    env.sky.position.set(cx, cy, cz);

    env.sunOrb.position.set(cx + sunDir[0] * 175, cy + sunDir[1] * 175, cz + sunDir[2] * 175); env.sunOrb.lookAt(cx, cy, cz);
    env.sunOrb.material.opacity = clamp01(dayF * 1.4) * (1 - E.cover) * (1 - E.fog);
    env.sunOrb.visible = env.sunOrb.material.opacity > 0.02;
    env.moonOrb.position.set(cx + moonDir[0] * 175, cy + moonDir[1] * 175, cz + moonDir[2] * 175); env.moonOrb.lookAt(cx, cy, cz);
    env.moonOrb.material.opacity = clamp01((1 - dayF) * 1.4 - 0.2) * (1 - E.cover * 0.9);
    env.moonOrb.visible = env.moonOrb.material.opacity > 0.02;
    env.stars.position.set(cx, cy - 20, cz);
    env.starMat.opacity = clamp01(1 - dayF * 1.6) * (1 - E.cover) * 0.9;
    env.stars.visible = env.starMat.opacity > 0.02;

    updateView(dayF);
    if (xmasOn) xmasTick(t, dt, outside);
    if (!outside) {                                      // 실내는 늘 같은 조명
      scene.background.setRGB(C_IN[0], C_IN[1], C_IN[2]);
      scene.fog.near = 200; scene.fog.far = 400;
      hemi.intensity = 0.8; hemi.color.setRGB(1, 1, 1);
      sun.intensity = 0.5; sun.color.setRGB(1, 1, 1);
      sun.target.position.set(P.x, 0, P.z); sun.position.set(P.x + 9, 40, P.z + 12);     // 실내: 천장 조명처럼 거의 위에서
      return;
    }
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
    if (snow.obj.visible) fall(snow, dt, 2.4, 1 + w * 6, P.x, P.z, Math.floor(snow.n * clamp01(snowAmt)), false);
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
  // 두 손가락 벌리기·오므리기 = 확대·축소, PC는 마우스 휠
  var pinch = { pts: {}, d: 0 };
  function pinchDist() { var k = Object.keys(pinch.pts); if (k.length < 2) return 0; var a = pinch.pts[k[0]], b = pinch.pts[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y); }
  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'touch' || e.pointerId === joy.id) return;
    pinch.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (Object.keys(pinch.pts).length === 2) { pinch.d = pinchDist(); look.id = null; }
  });
  function pinchEnd(e) { delete pinch.pts[e.pointerId]; if (Object.keys(pinch.pts).length < 2) pinch.d = 0; }
  canvas.addEventListener('pointerup', pinchEnd);
  canvas.addEventListener('pointercancel', pinchEnd);
  canvas.addEventListener('wheel', function (e) {
    if (!playing || uiOpen) return;
    e.preventDefault();
    setZoom(cam.zoom * Math.exp(Math.max(-60, Math.min(60, e.deltaY)) * 0.004));
  }, { passive: false });
  $('zoomIn').addEventListener('click', function () { setZoom(cam.zoom / 1.2); });
  $('zoomOut').addEventListener('click', function () { setZoom(cam.zoom * 1.2); });
  canvas.addEventListener('pointermove', function (e) {
    if (pinch.pts[e.pointerId]) {
      pinch.pts[e.pointerId].x = e.clientX; pinch.pts[e.pointerId].y = e.clientY;
      if (pinch.d > 0) { var nd = pinchDist(); if (nd > 10) { setZoom(cam.zoom * pinch.d / nd); pinch.d = nd; } return; }
    }
    if (joy.id !== null && e.pointerId === joy.id) { joyMove(e); return; }
    if (e.pointerId !== look.id) return;
    cam.yaw -= (e.clientX - look.x) * 0.007; cam.manualT = performance.now();
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
  var fpsT = 0, fpsN = 0, fpsWarm = 0, zoomShown = '';
  var last = performance.now(), lastSend = 0, sent = { x: 0, z: 0, f: 0 };
  function frame(now) {
    requestAnimationFrame(frame);
    var rawDt = (now - last) / 1000, dt = Math.min(0.05, rawDt); last = now;

    // 입력 → 이동 방향 (카메라 기준). 내 캐릭터는 먼저 움직이고 서버가 검사해 틀리면 되돌린다.
    var ix = joy.x, iy = -joy.y;
    if (keys.KeyW || keys.ArrowUp) iy += 1;
    if (keys.KeyS || keys.ArrowDown) iy -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    var mag = Math.sqrt(ix * ix + iy * iy);
    if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }
    // 느린 기기 자동 감지: 게임 시작 5초 뒤부터 4초 동안 평균 24프레임이 안 나오면 화질을 한 번 낮춘다 (직접 고른 설정은 건드리지 않는다)
    if (playing && !qualityChosen && quality === 'high') {
      fpsT += Math.min(rawDt, 1); fpsN++;                 // 실제 걸린 시간으로 잰다 (dt 는 0.05초로 잘려 있어 느린 기기를 못 알아본다)
      if (fpsWarm < 5) { fpsWarm += Math.min(rawDt, 1); fpsT = 0; fpsN = 0; }
      else if (fpsT >= 4) {
        if (fpsN / fpsT < 24) { quality = 'low'; applyQuality(); toast('기기가 느려 화질을 낮췄습니다. 메뉴의 설정에서 바꿀 수 있어요.'); }
        fpsT = 0; fpsN = 0;
      }
    }
    var moving = playing && mag > 0.12 && !uiOpen && !chatOpen && now > lockUntil;
    if (moving && mySit) {                               // 앉아 있을 때 움직이려 하면 먼저 일어선다
      moving = false;
      if (now - lastStand > 600) { lastStand = now; sendMsg({ t: 'stand' }); }
    }
    if (moving) {
      if (cam.entry && look.id !== null) cam.entry = null;          // 손으로 시점을 돌리면 그때부터는 손으로 정한 대로
      var by = cam.entry ? cam.entry.yaw : cam.yaw;                  // 앞에서 비추는 동안에는 "위로 = 캐릭터가 보는 쪽"
      var sy = Math.sin(by), cy = Math.cos(by);
      var vx = (-sy * iy + cy * ix), vz = (-cy * iy - sy * ix);
      var nx = P.x + vx * W.SPEED * dt, nz = P.z + vz * W.SPEED * dt;
      var cols = curCols();
      if (!W.blocked(area, nx, P.z, cols)) P.x = nx;
      if (!W.blocked(area, P.x, nz, cols)) P.z = nz;
      P.face = turn(P.face, Math.atan2(vx, vz), Math.min(1, dt * 12));
      // 앞으로 걸을수록 강하게, 옆으로는 약하게 따라가고, 뒤로(카메라 쪽으로) 걸을 때와 방금 손으로 돌렸을 때는 따라가지 않는다
      if (cam.entry) {                                               // 들어온 뒤 처음 움직일 때: 캐릭터 뒤로 돌아간다
        cam.yaw = turn(cam.yaw, P.face + Math.PI, Math.min(1, dt * 3.2));
        var dd = Math.atan2(Math.sin(P.face + Math.PI - cam.yaw), Math.cos(P.face + Math.PI - cam.yaw));
        if (Math.abs(dd) < 0.06) { cam.entry = null; cam.manualT = 0; }
      } else if (cam.follow && look.id === null && now - cam.manualT > 1200 && !shopOpen()) {
        var fw = Math.max(0, Math.min(1, (iy / (mag || 1) + 0.35) / 1.35));
        cam.yaw = turn(cam.yaw, P.face + Math.PI, Math.min(1, dt * 2.4 * fw * Math.min(1, mag)));
      }
      P.walk += dt * 11 * mag;
    }
    player.position.set(P.x, mySit ? sitY() : (moving ? Math.abs(Math.sin(P.walk)) * 0.09 : 0), P.z);
    player.rotation.y = shopOpen() ? cam.yaw : P.face;   // 상점에서는 카메라 쪽으로 돌아서서 앞모습을 보여 준다
    var umbShow = W.isOut(area) && E.wet > 0.02;       // 우산은 야외에서 비나 눈이 올 때만 보인다
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
      o.g.position.y = o.sit ? sitY() : (dd > 0.05 ? Math.abs(Math.sin(o.walk)) * 0.09 : 0);
      pose(o.g, dd > 0.05 && !o.sit, o.walk, o.umb && umbShow, o.sit);
      setFar(o.g, (o.g.position.x - P.x) * (o.g.position.x - P.x) + (o.g.position.z - P.z) * (o.g.position.z - P.z) > (quality === 'low' ? 100 : 256));
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
    var kd = W.kindOf(area);
    if (kd !== 'out') {
      var sp = area === 'in' ? spots : area === 'f12' ? ceoSpots : kd === 'nm1' ? nm1Spots : kd === 'nm2' ? nm2Spots : kd === 'pz' ? pzSpots : floorSpots, si, sd, sbest = 1e9;
      for (si = 0; si < sp.length; si++) {
        sd = Math.sqrt((P.x - sp[si].x) * (P.x - sp[si].x) + (P.z - sp[si].z) * (P.z - sp[si].z));
        if (sd < sp[si].r && sd < sbest) { sbest = sd; current = sp[si]; }
      }
      if (mySit) current = { label: '일어서기', run: function () { sendMsg({ t: 'stand' }); } };
      else if (kd === 'nm2') {
        var ci = nearCushion();
        if (ci >= 0 && !current) current = { label: '방석에 앉기', run: function () { sendMsg({ t: 'sitc', i: ci }); } };
      } else if (kd === 'floor') {
        var seat = nearSeat();
        if (seat && seat.d < sbest) current = { label: '앉기', run: function () { sendMsg({ t: 'sit', id: seat.id, slot: seat.slot }); } };
      }
    } else {
      if (area === 'o_gm' && W.near(P.x, P.z, { x: W.BOOTH.x, z: W.BOOTH.z + 2.6 }, 2.4)) current = { label: '마을 엘리베이터', run: function () { openElev(); } };
      else if (xmasOn && env.santa) {
        var sdx = P.x - W.XMAS.santa[0], sdz = P.z - W.XMAS.santa[1];
        if (sdx * sdx + sdz * sdz < 9) current = { label: '산타에게 말 걸기', run: santaTalk };
      }
    }
    villageTick(dt, now / 1000);
    // 엘리베이터 앞에 걸어 들어오면 층(구역) 고르는 창이 저절로 열린다 (내린 자리에서는 열지 않고, 한 번 벗어났다 다시 와야 또 열린다)
    var nearEl = (W.floorOf(area) && Math.hypot(P.x - W.ELEV.x, P.z - W.ELEV.z) < 2.5) || (area === 'o_gm' && W.near(P.x, P.z, { x: W.BOOTH.x, z: W.BOOTH.z + 2.6 }, 1.8));
    if (nearEl && !elevNear && playing && !uiOpen && !chatOpen && !deco.on && now > lockUntil) openElev();
    elevNear = !!nearEl;
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
    var inShop = shopOpen(), dist = inShop ? 5.2 : (!W.isOut(area) ? 5.6 : 8) * cam.zoom, pitch = inShop ? 0.1 : cam.pitch;
    var h = Math.cos(pitch) * dist;
    var cx = P.x + Math.sin(cam.yaw) * h, cz = P.z + Math.cos(cam.yaw) * h;
    var cyy = 1.3 + Math.sin(pitch) * dist;
    if (!W.isOut(area)) {
      // 벽에 막히면 그 벽 앞까지 당기고, 높이는 당긴 만큼 낮추되 예전 기본 높이 아래로는 내리지 않는다 (머리 위로 꺾이지 않게)
      var h0 = Math.hypot(cx - P.x, cz - P.z) || 1;
      cx = Math.max(-LW / 2 + 0.4, Math.min(LW / 2 - 0.4, cx));
      cz = Math.max(-LD / 2 + 0.4, Math.min(LD / 2 - 0.4, cz));
      var hr = Math.hypot(cx - P.x, cz - P.z) / h0;
      cyy = Math.min(LH - 0.4, 1.3 + Math.max((cyy - 1.3) * hr, Math.sin(pitch) * 5.6));
    }
    // 1.9.1 (사용자 요청): 야외에서는 사이에 물체가 끼어도 카메라를 당기지 않는다. 늘 고른 거리의 3인칭.
    var zb = playing && !uiOpen && !inShop ? 'flex' : 'none';
    if (zoomShown !== zb) { zoomShown = zb; $('zoomBox').style.display = zb; }
    camera.position.set(cx, cyy, cz);
    camera.lookAt(P.x, inShop ? -0.34 : 1.3, P.z);
    if (player.userData.tag) player.userData.tag.visible = !inShop;
    if (player.userData.repTag) player.userData.repTag.visible = !inShop;      // 상점: 캐릭터가 화면 위쪽(시트 위)에 오도록 아래를 본다
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
