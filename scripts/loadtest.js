'use strict';
// 부하 시험: 가짜 접속자 N명을 만들어 같은 장소에서 계속 움직이고 채팅하게 한 뒤 서버 상태를 잰다.
// 쓰는 법 (시험용 서버에서만!):
//   서버:  SIGNUP_PER_HOUR=1000 SIGNUP_PER_HOUR_ALL=1000 API_PER_MIN=5000 WS_PER_MIN=5000 node server/index.js
//   시험:  node scripts/loadtest.js http://localhost:3000 100 30 [서버 프로세스 번호]
const WebSocket = require('ws');
const fs = require('fs');
const base = process.argv[2] || 'http://localhost:3000';
const N = Number(process.argv[3]) || 100, SECS = Number(process.argv[4]) || 30, PID = process.argv[5];
const MOVING = Number(process.env.MOVING || 1);          // 움직이는 사람 비율 (1 = 전원)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
const tag = Date.now().toString(36).slice(-5);
function cpuTicks() { if (!PID) return null; const f = fs.readFileSync('/proc/' + PID + '/stat', 'utf8').split(' '); return Number(f[13]) + Number(f[14]); }
function rssMb() { if (!PID) return null; const m = /VmRSS:\s+(\d+)/.exec(fs.readFileSync('/proc/' + PID + '/status', 'utf8')); return m ? Math.round(m[1] / 1024) : null; }
const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;

(async () => {
  const stat = { bytes: 0, msgs: 0, fixes: 0, rtt: [], gaps: [], closed: 0, sent: 0 };
  const clients = [];
  console.log('가입과 접속: ' + N + '명 …');
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const r = await post('/api/signup', { username: 'lt' + tag + i, nickname: '부하' + tag + i, password: 'loadtest-pass' });
    if (!r.ok) { console.error('가입 실패:', r.error); process.exit(1); }
    const c = { i, ws: new WebSocket(base.replace(/^http/, 'ws') + '/ws'), ready: false, x: 0, z: 0, cx: 0, cz: 0, a: Math.random() * 6.28, lastState: 0, pending: {} };
    c.ws.on('open', () => c.ws.send(JSON.stringify({ t: 'auth', token: r.token })));
    c.ws.on('close', () => { if (c.ready) stat.closed++; });
    c.ws.on('message', d => {
      stat.bytes += d.length; stat.msgs++;
      const m = JSON.parse(d);
      if (m.t === 'hello') { c.ready = true; c.id = m.id; c.x = c.cx = m.me.x; c.z = c.cz = m.me.z; }
      else if (m.t === 'fix') { stat.fixes++; c.x = m.x; c.z = m.z; c.cx = m.x; c.cz = m.z; }
      else if (m.t === 'state') { const now = Date.now(); if (c.i === 0 && c.lastState) stat.gaps.push(now - c.lastState); c.lastState = now; }
      else if (m.t === 'chat' && m.id === c.id && c.pending[m.m]) { stat.rtt.push(Date.now() - c.pending[m.m]); delete c.pending[m.m]; }
    });
    clients.push(c);
  }
  await sleep(1500);
  console.log('접속 완료: ' + clients.filter(c => c.ready).length + '/' + N + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + '초)');
  stat.bytes = 0; stat.msgs = 0;
  const cpu0 = cpuTicks(), start = Date.now();
  const mover = setInterval(() => {
    for (const c of clients) {
      if (!c.ready || c.ws.readyState !== 1 || c.i >= N * MOVING) continue;
      c.a += 0.5;                                          // 반지름 0.6m 원을 그리며 계속 걷는다
      c.x = c.cx + Math.cos(c.a) * 0.6; c.z = c.cz + Math.sin(c.a) * 0.6;
      c.ws.send(JSON.stringify({ t: 'move', x: c.x, z: c.z, f: c.a })); stat.sent++;
    }
  }, 100);
  const chatter = setInterval(() => {                      // 한 사람이 10초에 한 번꼴로 말한다
    const c = clients[Math.floor(Math.random() * N)];
    if (!c.ready || c.ws.readyState !== 1) return;
    const text = 'p' + Date.now() + Math.random().toString(36).slice(2, 6);
    c.pending[text] = Date.now(); c.ws.send(JSON.stringify({ t: 'chat', m: text }));
  }, 10000 / N);
  await sleep(SECS * 1000);
  clearInterval(mover); clearInterval(chatter);
  const secs = (Date.now() - start) / 1000, cpu1 = cpuTicks();
  console.log('--- 결과 (' + N + '명, 움직이는 비율 ' + Math.round(MOVING * 100) + '%, ' + secs.toFixed(0) + '초) ---');
  if (cpu0 !== null) console.log('서버 CPU: 코어 하나의 ' + ((cpu1 - cpu0) / 100 / secs * 100).toFixed(1) + '% · 메모리 ' + rssMb() + 'MB');
  console.log('한 사람이 받는 양: ' + (stat.bytes / N / secs / 1024).toFixed(1) + ' KB/초, ' + (stat.msgs / N / secs).toFixed(1) + '개/초 · 서버 전체 송신 ' + (stat.bytes / secs / 1024 / 1024 * 8).toFixed(1) + ' Mbit/초');
  console.log('위치 방송 간격(목표 100ms): 중간 ' + pct(stat.gaps, 0.5) + 'ms, 95% ' + pct(stat.gaps, 0.95) + 'ms, 최대 ' + Math.max.apply(null, stat.gaps.concat([0])) + 'ms');
  console.log('채팅 왕복: ' + stat.rtt.length + '건, 중간 ' + pct(stat.rtt, 0.5) + 'ms, 95% ' + pct(stat.rtt, 0.95) + 'ms, 최대 ' + Math.max.apply(null, stat.rtt.concat([0])) + 'ms');
  console.log('되돌림(fix) ' + stat.fixes + '건 / 이동 ' + stat.sent + '건 · 끊긴 연결 ' + stat.closed + '개');
  process.exit(0);
})();
