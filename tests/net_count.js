// 两个 Node 客户端：确认第二个客户端是否持续收到每秒状态
const WebSocket = require('ws');
const A = new WebSocket('ws://127.0.0.1:3000');
const B = new WebSocket('ws://127.0.0.1:3000');
let code = null, nA = 0, nB = 0, t0 = Date.now();
A.on('open', () => A.send(JSON.stringify({ type: 'create_room', planeCount: 5 })));
A.on('message', raw => {
  const m = JSON.parse(raw.toString()); nA++;
  if (m.type === 'room_created') {
    code = m.roomId;
    console.log('房间=' + code + ' 架数=' + m.planeCount);
    B.on('open', () => B.send(JSON.stringify({ type: 'join_room', roomId: code })));
  }
});
B.on('message', raw => { nB++; });
setTimeout(() => {
  console.log(`10秒内 A收到=${nA} 条, B收到=${nB} 条（B 应≈10 条每秒状态）`);
  process.exit(0);
}, 10000);
