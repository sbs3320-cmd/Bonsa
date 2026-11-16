'use strict';
// 서울의 실제 날씨를 10분마다 받아 와 접속자 모두에게 같은 값을 알려 준다.
// 브라우저가 외부 주소에 직접 접속하지 않도록(보안 정책 유지) 서버가 대신 받아 온다.
// 출처: Open-Meteo (무료, 키 없음). 받아 온 값은 숫자 범위를 확인한 뒤에만 쓴다.
const URL_WX = 'https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978' +
  '&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover' +
  '&daily=sunrise,sunset&wind_speed_unit=ms&timezone=Asia%2FSeoul&forecast_days=1';
const REFRESH_MS = 10 * 60 * 1000;
const KINDS = ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'];

// k 종류, p 비·눈 세기(0~1), c 구름양(0~1), w 풍속(m/s), d 풍향(도), temp 기온, sr·ss 해 뜨는/지는 시각(시)
let current = { k: 'clear', p: 0, c: 0.2, w: 2, d: 270, temp: null, sr: 6.5, ss: 18.5 };
const listeners = [];

function num(v, lo, hi, dflt) {
  v = Number(v);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
}
function hourOf(iso, dflt) {                       // '2026-11-17T07:12' -> 7.2
  const m = typeof iso === 'string' ? /T(\d{2}):(\d{2})/.exec(iso) : null;
  return m ? Number(m[1]) + Number(m[2]) / 60 : dflt;
}
// WMO 날씨 코드를 게임에서 쓰는 여섯 가지로 줄인다
function classify(code) {
  if (code >= 95) return ['storm', 1];
  if (code === 85 || code === 86 || (code >= 71 && code <= 77)) return ['snow', code === 75 || code === 86 ? 1 : (code === 73 ? 0.7 : 0.45)];
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    const heavy = code === 65 || code === 67 || code === 82, mid = code === 55 || code === 57 || code === 63 || code === 81;
    return ['rain', heavy ? 1 : (mid ? 0.7 : 0.4)];
  }
  if (code === 45 || code === 48) return ['fog', 0];
  if (code === 2 || code === 3) return ['cloudy', 0];
  return ['clear', 0];
}

function set(next) {
  const changed = JSON.stringify(next) !== JSON.stringify(current);
  current = next;
  if (changed) listeners.forEach(fn => { try { fn(current); } catch (e) { console.error(e); } });
}

async function refresh() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(URL_WX, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const cur = j && j.current;
    if (!cur) throw new Error('응답 형식이 다릅니다');
    const kp = classify(num(cur.weather_code, 0, 99, 0));
    const day = j.daily || {};
    set({
      k: kp[0], p: kp[1],
      c: Math.round(num(cur.cloud_cover, 0, 100, 20)) / 100,
      w: Math.round(num(cur.wind_speed_10m, 0, 40, 2) * 10) / 10,
      d: Math.round(num(cur.wind_direction_10m, 0, 360, 270)),
      temp: Math.round(num(cur.temperature_2m, -50, 60, 15)),
      sr: Math.round(num(hourOf(day.sunrise && day.sunrise[0], 6.5), 3, 10, 6.5) * 100) / 100,
      ss: Math.round(num(hourOf(day.sunset && day.sunset[0], 18.5), 15, 22, 18.5) * 100) / 100
    });
  } catch (e) {
    console.warn('날씨를 받아 오지 못했습니다. 이전 값을 그대로 씁니다:', e.message);
  } finally {
    clearTimeout(timer);
  }
}

function start() {
  // 시험용: WEATHER_FORCE=rain 처럼 넣으면 실제 날씨 대신 그 날씨로 고정한다
  const force = process.env.WEATHER_FORCE;
  if (force && KINDS.includes(force)) {
    const wet = force === 'rain' || force === 'snow' || force === 'storm';
    current = { k: force, p: wet ? 0.8 : 0, c: force === 'clear' ? 0.1 : 0.9, w: force === 'storm' ? 11 : 4, d: 270, temp: 10, sr: 6.5, ss: 18.5 };
    return;
  }
  refresh();
  setInterval(refresh, REFRESH_MS).unref();
}

module.exports = { start, get: () => current, onChange: fn => listeners.push(fn) };
