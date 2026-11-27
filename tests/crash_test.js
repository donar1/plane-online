// 复现崩溃场景：对端粗暴断开 -> 5 秒延迟通知 -> 旧代码在这里崩溃
const WebSocket = require('ws');
const A = new WebSocket('ws://127.0.0.1:3000');
const B = new WebSocket('ws://127.0.0.1:3000');
let code = null, gotDisc = false;
A.on('open', () => A.send(JSON.stringify({ type: 'create_room', planeCount: 1 })));
A.on('message', raw => {
  const m = JSON.parse(raw.toString());
  if (m.type === 'room_created') code = m.roomId;
  if (m.type === 'opponent_disconnected') gotDisc = true;
});
B.on('open', () => setTimeout(() => B.send(JSON.stringify({ type: 'join_room', roomId: code })), 300));
B.on('message', raw => {
  const m = JSON.parse(raw.toString());
  if (m.type === 'room_joined') {
    console.log('对端已加入，立刻粗暴断网');
    B.terminate();   // 不做 close 握手，模拟网线被拔
  }
});
setTimeout(() => {
  const alive = A.readyState === 1;
  console.log('5 秒后: 收到掉线通知=' + gotDisc + ' 自己连接存活=' + alive);
  A.send(JSON.stringify({ type: 'ping', t: 1 }));
  setTimeout(() => {
    console.log(gotDisc ? 'PASS 服务端未崩溃' : 'FAIL 未收到掉线通知（但服务可能仍活着）');
    process.exit(0);
  }, 1000);
}, 7000);
