// 验证“取消房间”：房主取消 -> 自己收到 left_room、对手收到 room_closed、房间确实被删除
const WebSocket = require('ws');
const A = new WebSocket('ws://127.0.0.1:3000');
const B = new WebSocket('ws://127.0.0.1:3000');
let code = null, aLeft = false, bClosed = false;

A.on('open', () => A.send(JSON.stringify({ type: 'create_room', planeCount: 1 })));
A.on('message', raw => {
  const m = JSON.parse(raw.toString());
  if (m.type === 'room_created') {
    code = m.roomId;
    console.log('房主建房: ' + code);
    B.on('open', () => B.send(JSON.stringify({ type: 'join_room', roomId: code })));
  }
  if (m.type === 'left_room') { aLeft = true; console.log('房主收到 left_room'); }
  if (m.type === 'opponent_joined') {
    console.log('对手已加入，房主点“取消房间”');
    A.send(JSON.stringify({ type: 'leave_room' }));
  }
});
B.on('message', raw => {
  const m = JSON.parse(raw.toString());
  if (m.type === 'room_joined') console.log('对手加入成功: ' + m.roomId + ' 座位=' + m.seat);
  if (m.type === 'room_closed') { bClosed = true; console.log('对手收到 room_closed，reason=' + m.reason); }
});

// 取消后再试图加入同一个房间，应该 room_not_found
setTimeout(() => {
  const C = new WebSocket('ws://127.0.0.1:3000');
  C.on('open', () => C.send(JSON.stringify({ type: 'join_room', roomId: code })));
  C.on('message', raw => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'error') {
      const pass = aLeft && bClosed && m.reason === 'room_not_found';
      console.log('旧房间码再加入: ' + m.reason);
      console.log((pass ? 'PASS' : 'FAIL') + ' 取消房间功能' +
        '（房主 left_room=' + aLeft + ' 对手 room_closed=' + bClosed + '）');
      process.exit(pass ? 0 : 1);
    }
  });
  C.on('error', e => { console.log('连接失败: ' + e.message); process.exit(1); });
}, 3000);
setTimeout(() => { console.log('FAIL 超时'); process.exit(1); }, 9000);
