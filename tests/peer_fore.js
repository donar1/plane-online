// 前台对端：加入房间 -> 立即提交 N 架 -> 打印对战事件
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
  for (let a = 0; a < 800; a++) {
    const res = []; let t = 0;
    while (res.length < count && t < 500) {
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
  throw new Error('无法铺满 ' + count + ' 架');
}

const ws = new WebSocket('ws://127.0.0.1:3000');
const COUNT = Number(process.argv[3]) || 5;
ws.on('open', () => ws.send(JSON.stringify({ type: 'join_room', roomId: code })));
ws.on('message', raw => {
  let m; try { m = JSON.parse(raw.toString()); } catch { return; }
  if (m.type === 'room_joined') {
    console.log('加入成功 seat=' + m.seat);
    ws.send(JSON.stringify({ type: 'ready', planes: makePlanes(COUNT) }));
    console.log('已提交 ' + COUNT + ' 架');
  } else if (m.type === 'battle_start') {
    console.log('对战开始 先手=玩家' + m.current);
  } else if (m.type === 'state' && m.view.phase === 'battle') {
    console.log(`状态: phase=battle cur=${m.view.current} 我方被命中=${Object.keys(m.view.self.incomingShots).length} 我打中=${Object.keys(m.view.opp.outgoingShots).length}`);
  } else if (m.type === 'shot_result') {
    console.log('对方开炮 ' + m.coord + ' -> ' + m.result);
  } else if (m.type === 'reject' || m.type === 'error') {
    console.log('拒绝/错误: ' + m.reason);
  }
});
setTimeout(() => { console.log('退出'); process.exit(0); }, 40000);
