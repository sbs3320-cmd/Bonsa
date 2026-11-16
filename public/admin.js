// 본사 관리자 화면. 권한 확인은 전부 서버가 하고, 여기서는 보여 주기만 한다.
// 서버에서 온 글자는 모두 textContent 로만 넣는다.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var RANKS = { owner: '총관리자', ceo: '사장', manager: '부장', lead: '팀장', deputy: '부팀장', staff: '사원', intern: '인턴' };
  var RANK_SET = ['intern', 'staff', 'deputy', 'lead', 'manager', 'ceo'];
  var TABS = [['overview', '개요'], ['users', '사용자'], ['floors', '층'], ['posts', '게시판'], ['events', '이벤트'], ['shop', '상점 값'], ['config', '안내원·공지·설정'], ['logs', '기록']];
  var cur = 'overview', msgTimer = 0;

  function say(t) { $('msg').textContent = t; $('msg').style.display = 'block'; clearTimeout(msgTimer); msgTimer = setTimeout(function () { $('msg').style.display = 'none'; }, 3200); }
  function post(path, body) {
    return fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Admin': '1' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json(); });
  }
  function act(op, body) {
    body = body || {}; body.op = op;
    return post('/admin/api/do', body).then(function (r) {
      if (r.relogin) { showLogin('시간이 지나 로그아웃되었습니다. 다시 들어와 주세요.'); throw new Error('relogin'); }
      if (!r.ok) { say(r.error || '처리하지 못했습니다.'); throw new Error(r.error); }
      return r;
    });
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in (attrs || {})) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'on') e.addEventListener('click', attrs[k]);
      else if (k === 'cls') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function table(heads, rows) {
    var t = el('table'), tr = el('tr');
    heads.forEach(function (h) { tr.appendChild(el('th', { text: h })); });
    t.appendChild(tr);
    rows.forEach(function (r) { var x = el('tr'); r.forEach(function (c) { x.appendChild(c instanceof Node ? (c.tagName === 'TD' ? c : el('td', {}, [c])) : el('td', { text: String(c) })); }); t.appendChild(x); });
    return el('div', { cls: 'scroll' }, [t]);
  }
  function stamp(ms) {
    if (!ms) return '';
    var d = new Date(ms + 9 * 3600000), p = function (v) { return (v < 10 ? '0' : '') + v; };
    return d.getUTCFullYear() + '.' + p(d.getUTCMonth() + 1) + '.' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  }
  function card(title, note, kids) { return el('div', { cls: 'card' }, [el('h2', { text: title }), note ? el('div', { cls: 'note', text: note }) : null].concat(kids || [])); }
  function show(nodes) { var v = $('view'); while (v.firstChild) v.removeChild(v.firstChild); nodes.forEach(function (n) { v.appendChild(n); }); }
  function twice(btn, label, fn) {                       // 되돌리기 어려운 일은 두 번 눌러야 한다
    var armed = false;
    btn.addEventListener('click', function () {
      if (!armed) { armed = true; btn.textContent = '한 번 더 누르면 ' + label; setTimeout(function () { armed = false; btn.textContent = label; }, 4000); return; }
      fn();
    });
    return btn;
  }
  function boardName(b) { return b === 1 ? '전체' : b + '층'; }

  var VIEWS = {
    overview: function () {
      return act('overview').then(function (r) {
        var stat = function (n, l) { return el('div', { cls: 'stat' }, [el('b', { text: String(n) }), l]); };
        show([card('개요', '저장소: ' + (r.storage === 'pg' ? 'PostgreSQL' : r.storage), [el('div', { cls: 'grid' }, [
          stat(r.users + ' / ' + r.maxUsers, '가입자'), stat(r.online + ' / ' + r.maxOnline, '지금 접속'), stat(r.banned, '정지된 계정'),
          stat(r.openEvents, '진행 중 이벤트'), stat(r.signupOpen ? '받는 중' : '닫힘', '새 가입')])]),
          card('공지', '', [el('div', { text: r.notice || '등록된 공지가 없습니다.' })])]);
      });
    },
    users: function () {
      return act('users').then(function (r) {
        var rows = r.list.map(function (u) {
          var isOwner = u[3] === 'owner';
          var sel = el('select');
          RANK_SET.forEach(function (k) { var o = el('option', { value: k, text: RANKS[k] }); if (k === u[3]) o.selected = true; sel.appendChild(o); });
          sel.addEventListener('change', function () { act('user.rank', { id: u[0], rank: sel.value }).then(function () { say(u[2] + ' → ' + RANKS[sel.value]); go('users'); }, function () { go('users'); }); });
          var amt = el('input', { type: 'number', placeholder: '±코인', style: 'width:96px' });
          var give = el('button', { cls: 'ghost', text: '적용', on: function () {
            var d = Number(amt.value);
            if (!d) return say('더하거나 뺄 코인을 넣어 주세요. 빼려면 -50 처럼 씁니다.');
            act('user.money', { id: u[0], delta: d, reason: '관리자 화면' }).then(function (x) { say(u[2] + ' 코인: ' + x.money); go('users'); });
          } });
          var ban = twice(el('button', { cls: u[6] ? 'ghost' : 'danger', text: u[6] ? '정지 해제' : '정지' }), u[6] ? '정지 해제' : '정지', function () {
            act('user.ban', { id: u[0], on: !u[6], reason: '관리자 화면' }).then(function () { say(u[2] + (u[6] ? ' 정지 해제' : ' 정지')); go('users'); });
          });
          return [u[0], u[1], u[2], isOwner ? RANKS.owner : sel, u[4] ? u[4] + '층' : '-', u[5],
            el('span', { cls: 'tag' + (u[6] ? ' bad' : u[7] ? ' on' : ''), text: u[6] ? '정지' : u[7] ? '접속 중' : '오프라인' }),
            stamp(u[8]), el('div', { cls: 'row', style: 'margin:0;flex-wrap:nowrap' }, [amt, give]), isOwner ? '' : ban];
        });
        show([card('사용자 (' + r.list.length + '명)', '직급은 고르는 즉시 바뀝니다. 정지하면 바로 접속이 끊기고 로그인할 수 없습니다. 모든 변경은 기록에 남습니다.',
          [table(['번호', '아이디', '닉네임', '직급', '층', '코인', '상태', '가입', '코인 주기/빼기', ''], rows)])]);
      });
    },
    floors: function () {
      return act('floors').then(function (r) {
        var rows = r.list.map(function (f) {
          var name = el('input', { value: f[1], maxlength: '12', placeholder: f[0] === 12 ? '사장실' : '이름 없음' });
          var save = el('button', { cls: 'ghost', text: '이름 저장', on: function () { act('floor.name', { floor: f[0], name: name.value }).then(function () { say(f[0] + '층 이름을 저장했습니다.'); }); } });
          var lock = f[0] === 12 && f[3] ? twice(el('button', { cls: 'danger', text: '비밀번호 해제' }), '비밀번호 해제', function () { act('floor.unlock').then(function () { say('12층 비밀번호를 해제했습니다.'); go('floors'); }); }) : '';
          return [f[0] + '층', name, f[0] === 12 ? '-' : f[2] + ' / 20', f[0] === 12 ? (f[3] ? '잠김' : '열림') : '', save, lock];
        });
        show([card('층', '층 이름은 한글, 영문, 숫자로 12자까지입니다.', [table(['층', '이름', '등록 인원', '12층 잠금', '', ''], rows)])]);
      });
    },
    posts: function () {
      return act('posts').then(function (r) {
        var rows = r.list.map(function (p) {
          var del = twice(el('button', { cls: 'danger', text: '삭제' }), '삭제', function () { act('post.del', { id: p[0] }).then(function () { say('글을 지웠습니다.'); go('posts'); }); });
          var unpin = p[6] ? el('button', { cls: 'ghost', text: '고정 해제', on: function () { act('post.unpin', { id: p[0] }).then(function () { go('posts'); }); } }) : '';
          return [boardName(p[1]), el('td', { cls: 'wrap' }, [el('b', { text: p[2] }), el('div', { text: p[3] })]), p[4], stamp(p[5]), p[6] ? '고정' : '', unpin, del];
        });
        show([card('게시판 (최근 ' + r.list.length + '개)', '게임 안에서는 글쓴이만 지울 수 있지만, 여기서는 총관리자가 어떤 글이든 지우거나 고정을 풀 수 있습니다.',
          [rows.length ? table(['게시판', '글', '글쓴이', '시각', '', '', ''], rows) : el('div', { text: '글이 없습니다.' })])]);
      });
    },
    events: function () {
      return act('events').then(function (r) {
        var rows = r.list.map(function (e) {
          var close = twice(el('button', { cls: 'danger', text: '종료' }), '종료', function () { act('event.close', { id: e[0] }).then(function () { say('이벤트를 종료했습니다.'); go('events'); }); });
          return [el('td', { cls: 'wrap' }, [el('b', { text: e[1] }), el('div', { text: e[2] })]), e[3] + '코인', e[4], e[5] + '명', e[6] + '명', close];
        });
        show([card('진행 중인 이벤트', '', [rows.length ? table(['이벤트', '보상', '만든 사람', '판정 대기', '보상 받음', ''], rows) : el('div', { text: '진행 중인 이벤트가 없습니다.' })])]);
      });
    },
    shop: function () {
      return act('shop').then(function (r) {
        var rows = r.list.map(function (s) {
          var price = el('input', { type: 'number', value: s[3], min: '0', max: '100000', style: 'width:110px' });
          var save = el('button', { cls: 'ghost', text: '저장', on: function () { act('shop.price', { item: s[0], price: Number(price.value) }).then(function () { say(s[2] + ' 값을 ' + price.value + '코인으로 바꿨습니다.'); }); } });
          return [s[1], s[2], price, s[4] + '코인', save];
        });
        show([card('상점 값', '바꾸면 접속 중인 모든 사람에게 바로 적용됩니다. 이미 놓인 가구의 환불 금액은 놓을 때 낸 값 그대로입니다.', [table(['종류', '품목', '지금 값(코인)', '처음 값', ''], rows)])]);
      });
    },
    config: function () {
      return act('config').then(function (r) {
        var hi = el('input', { value: r.npc.hi || '', maxlength: '60', placeholder: '비워 두면 기본 인사 "반갑습니다, 본사입니다"', style: 'width:100%' });
        var guide = el('textarea', { placeholder: '한 줄에 한 장면씩, 12줄까지. 비워 두면 기본 안내를 씁니다.' });
        guide.value = (r.npc.guide || []).join('\n');
        var notice = el('input', { value: r.notice || '', maxlength: '200', placeholder: '접속할 때 채팅창에 보이는 한 줄 공지 (비우면 없음)', style: 'width:100%' });
        var signup = el('select', {}, [el('option', { value: '1', text: '새 가입 받기' }), el('option', { value: '0', text: '새 가입 닫기' })]);
        signup.value = r.signupOpen ? '1' : '0';
        show([
          card('안내원 대사', '로비 안내원의 인사말과 게임 안내 문구입니다.', [hi, el('div', { style: 'height:8px' }), guide,
            el('div', { cls: 'row' }, [el('button', { text: '대사 저장', on: function () {
              act('config.set', { npc: { hi: hi.value, guide: guide.value.split('\n') } }).then(function () { say('안내원 대사를 저장했습니다.'); });
            } })])]),
          card('공지', '', [notice, el('div', { cls: 'row' }, [el('button', { text: '공지 저장', on: function () { act('config.set', { notice: notice.value }).then(function () { say('공지를 저장했습니다.'); }); } })])]),
          card('가입', '닫으면 새 계정을 만들 수 없습니다. 이미 가입한 사람은 그대로 들어올 수 있습니다.', [el('div', { cls: 'row' }, [signup,
            el('button', { text: '저장', on: function () { act('config.set', { signupOpen: signup.value === '1' }).then(function () { say('저장했습니다.'); }); } })])])
        ]);
      });
    },
    logs: function (filter) {
      return act('logs', { action: filter || '' }).then(function (r) {
        var sel = el('select');
        [['', '전체'], ['rank', '직급 변경'], ['money', '코인 이동'], ['admin_login', '관리자 로그인'], ['admin_rank', '관리자: 직급'], ['admin_money', '관리자: 코인'],
          ['admin_ban', '관리자: 정지'], ['admin_post', '관리자: 게시판'], ['admin_shop', '관리자: 값'], ['admin_config', '관리자: 설정'], ['floor_name', '층 이름'],
          ['floor12_pass', '12층 비밀번호'], ['event_new', '이벤트 생성'], ['event_close', '이벤트 종료']].forEach(function (o) {
          var x = el('option', { value: o[0], text: o[1] }); if (o[0] === (filter || '')) x.selected = true; sel.appendChild(x);
        });
        sel.addEventListener('change', function () { VIEWS.logs(sel.value); });
        var rows = r.list.map(function (l) { return [stamp(l[1]), l[2], l[4] || '-', el('td', { cls: 'wrap', text: l[3] || '' })]; });
        show([card('기록 (최근 ' + r.list.length + '건)', '직급 변경, 코인 이동, 관리자가 한 일이 모두 남습니다.', [el('div', { cls: 'row' }, [sel]),
          rows.length ? table(['시각', '종류', '한 사람', '내용'], rows) : el('div', { text: '기록이 없습니다.' })])]);
      });
    }
  };

  function go(name) {
    cur = name;
    var bs = $('tabs').children;
    for (var i = 0; i < bs.length; i++) bs[i].className = bs[i].getAttribute('data-tab') === name ? 'on' : '';
    VIEWS[name]().catch(function () {});
  }
  TABS.forEach(function (t) { $('tabs').appendChild(el('button', { type: 'button', 'data-tab': t[0], text: t[1], on: function () { go(t[0]); } })); });

  function showApp() { $('login').hidden = true; $('app').hidden = false; $('logout').hidden = false; go('overview'); }
  function showLogin(note) {
    $('app').hidden = true; $('logout').hidden = true; $('login').hidden = false;
    $('loginForm').hidden = false; $('setupForm').hidden = true; $('lCode').hidden = true; $('lCode').value = ''; $('lPass').value = '';
    if (note) $('loginNote').textContent = note;
  }
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    post('/admin/api/login', { username: $('lUser').value.trim(), password: $('lPass').value, code: $('lCode').value.trim() }).then(function (r) {
      if (r.setup) {
        $('loginForm').hidden = true; $('setupForm').hidden = false;
        $('sKey').textContent = r.setup.secret.replace(/(.{4})/g, '$1 ').trim();
        return;
      }
      if (r.ok) return showApp();
      if (r.need2fa) { $('lCode').hidden = false; $('lCode').focus(); if (r.error) say(r.error); else $('loginNote').textContent = '인증 앱에 보이는 6자리 코드를 넣어 주세요.'; return; }
      say(r.error || '들어갈 수 없습니다.');
    }).catch(function () { say('서버에 연결하지 못했습니다.'); });
  });
  $('setupForm').addEventListener('submit', function (e) {
    e.preventDefault();
    post('/admin/api/2fa', { code: $('sCode').value.trim() }).then(function (r) {
      if (r.ok) { $('sKey').textContent = ''; say('2단계 인증을 등록했습니다.'); return showApp(); }
      say(r.error || '등록하지 못했습니다.');
    }).catch(function () { say('서버에 연결하지 못했습니다.'); });
  });
  $('logout').addEventListener('click', function () { post('/admin/api/logout').then(function () { showLogin('로그아웃했습니다.'); }); });

  // 이미 들어와 있는지 확인 (새로고침했을 때)
  post('/admin/api/do', { op: 'overview' }).then(function (r) { if (r.ok) showApp(); }).catch(function () {});
})();
