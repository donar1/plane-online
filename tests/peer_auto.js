// 对端玩家：加入指定房间，等对手（浏览器）准备好后自己也准备好，用于验证真实客户端流程
const WebSocket = require('ws');
const code = process.argv[2];
const N = 10;
const SHAPE = [
  { dx: 0, dy: 0, part: 'head' }, { dx: -2, dy: 1, part: 'wing' }, { dx: -1, dy: 1, part: 'wing' },
  { dx: 0, dy: 1, part: 'body' }, { dx: 1, dy: 1, part: 'wing' }, { dx: 2, dy: 1, part: 'wing' },
  { dx: 0, dy: 2, part: 'body' }, { dx: -1, dy: 3, part: 'tail' }, { dx: 0, dy: 3, part: 'tail' },
  { dx: 1, dy: 3, part: 'tail' },
];
function cellsFor(hx, hy, dir) {
  const out = [];
  for (const s of SHAPE) {
    let rx, ry;
    if (dir === 'up') { rx = s.dx; ry = s.dy; }
    else if (dir === 'down') { rx = s.dx; ry = -s.dy; }
    else if (dir === 'left') { rx = -s.dy; ry = s.dx; }
    else { rx = s.dy; ry = -s.dx; }
    const ax = hx + rx, ay = hy + ry;
    if (ax < 0 || ax >= N || ay < 0 || ay >= N) return null;
    out.push({ x: ax, y: ay, part: s.part });
  }
  return out;
}
function makePlanes(count) {
  for (let a = 0; a < 500; a++) {
    const res = []; let t = 0;
    while (res.length < count && t < 400) {
      t++;
      const hx = Math.floor(Math.random() * N), hy = Math.floor(Math.random() * N);
      const dir = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
      const cells = cellsFor(hx, hy, dir);
      if (!cells) continue;
      let bad = false;
      for (const pl of res) for (const c1 of pl.cells) for (const c2 of cells)
        if (c1.x === c2.x && c1.y === c2.y) bad = true;
      if (!bad) res.push({ cells, headKey: hx + ',' + hy, dir });
    }
    if (res.length === count) return res;
  }
  return [];
}
const ws = new WebSocket('ws://127.0.0.1:3000');
let ready = false;
ws.on('open', () => { console.log('[peer] 连接'); ws.send(JSON.stringify({ type: 'join_room', roomId: code })); });
ws.on('message', raw => {
  let m; try { m = JSON.parse(raw.toString()); } catch { return; }
  if (m.type === 'room_joined') console.log('[peer] 已加入 seat=' + m.seat);
  if (m.type === 'state') {
    const v = m.view;
    console.log(`[peer] phase=${v.phase} planeCount=${v.planeCount} oppReady=${v.opp.ready} myReady=${v.self.ready}`);
    if (v.phase === 'deploy' && v.opp.ready && !ready) {
      ready = true;
      ws.send(JSON.stringify({ type: 'ready', planes: makePlanes(v.planeCount) }));
      console.log('[peer] 对手已就绪，我也提交 ' + v.planeCount + ' 架');
    }
  }
  if (m.type === 'battle_start') console.log('[peer] 对战开始 先手=' + m.current);
  if (m.type === 'reject') console.log('[peer] 被拒 ' + m.reason);
});
setTimeout(() => { console.log('[peer] 退出'); process.exit(0); }, 180000);
