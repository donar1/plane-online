// ============================================================
// 打飞机联机版 · WebSocket 权威服务器
// 职责：房间管理、部署校验、回合管理、射击判定、击沉广播、断线重连
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// ---------- 兜底：单个定时器/回调出错不要整台服务器陪葬 ----------
process.on('uncaughtException', e => {
  console.error('[uncaughtException]', e && e.stack ? e.stack : e);
});
process.on('unhandledRejection', e => {
  console.error('[unhandledRejection]', e && e.stack ? e.stack : e);
});

// ---------- 常量 ----------
const PORT = process.env.PORT || 3000;
const N = 10;
const DEFAULT_PLANE_COUNT = 3;
// 房主可选难度：1 架 / 4 架 / 5 架（3 架为默认，保持向后兼容）
const ALLOWED_PLANE_COUNTS = [1, 3, 4, 5];
const DEPLOY_SECONDS = Number(process.env.DEPLOY_SECONDS) || 60;
const TURN_SECONDS = 30;
const DISCONNECT_GRACE = 120 * 1000;  // 断线保留 2 分钟

// 10 格胖十字飞机形状（机头朝上）
const SHAPE = [
  { dx: 0,  dy: 0,  part: 'head' },
  { dx: -2, dy: 1,  part: 'wing' },
  { dx: -1, dy: 1,  part: 'wing' },
  { dx: 0,  dy: 1,  part: 'body' },
  { dx: 1,  dy: 1,  part: 'wing' },
  { dx: 2,  dy: 1,  part: 'wing' },
  { dx: 0,  dy: 2,  part: 'body' },
  { dx: -1, dy: 3,  part: 'tail' },
  { dx: 0,  dy: 3,  part: 'tail' },
  { dx: 1,  dy: 3,  part: 'tail' },
];

const rooms = new Map();

// ============================================================
// 静态文件服务
// ============================================================
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(__dirname, 'public', urlPath);
  // 防目录穿越
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ============================================================
// WebSocket
// ============================================================
const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  ws.meta = { roomId: null, seat: null, token: null, alive: true, lastSeen: Date.now() };
  ws.on('pong', () => { ws.meta.alive = true; ws.meta.lastSeen = Date.now(); });
  ws.on('message', raw => {
    ws.meta.lastSeen = Date.now();
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    try { handle(ws, msg); } catch (e) { console.error('handle error:', e); }
  });
  ws.on('close', () => onDisconnect(ws));
});

// 心跳：每 20 秒 ping 一次；只有连续 60 秒毫无动静（既没 pong 也没消息）才判定掉线，
// 避免把只是暂时空闲的正常连接误杀，导致玩家侧反复“断开—重连”。
setInterval(() => {
  const now = Date.now();
  wss.clients.forEach(ws => {
    if (now - ws.meta.lastSeen > 60000) return ws.terminate();
    try { ws.ping(); } catch {}
  });
}, 20000);

// ============================================================
// 工具函数
// ============================================================
function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(room, obj) {
  for (const seat of [1, 2]) {
    const p = room.players[seat];
    if (p && p.ws && p.connected) send(p.ws, obj);
  }
}
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function genToken() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
function cellsFor(hx, hy, dir) {
  const out = [];
  for (const s of SHAPE) {
    let rx, ry;
    if (dir === 'up')         { rx = s.dx;      ry = s.dy; }
    else if (dir === 'down')  { rx = s.dx;      ry = -s.dy; }
    else if (dir === 'left')  { rx = -s.dy;     ry = s.dx; }
    else                      { rx = s.dy;      ry = -s.dx; }
    const ax = hx + rx, ay = hy + ry;
    if (ax < 0 || ax >= N || ay < 0 || ay >= N) return null;
    out.push({ x: ax, y: ay, part: s.part });
  }
  return out;
}
function buildPlaneMap(planes) {
  const m = new Map();
  for (const pl of planes) for (const c of pl.cells) m.set(c.x + ',' + c.y, c.part);
  return m;
}
function newPlayer(token, ws) {
  return {
    token, ws, connected: !!ws,
    ready: false,
    planes: [],
    planeMap: new Map(),
    shots: new Map(),
    heads: new Set(),
  };
}

// ============================================================
// 消息路由
// ============================================================
function handle(ws, msg) {
  switch (msg.type) {
    case 'ping':        return send(ws, { type: 'pong', t: msg.t });
    case 'create_room': return createRoom(ws, msg);
    case 'join_room':   return joinRoom(ws, msg);
    case 'reconnect':   return reconnect(ws, msg);
    case 'ready':       return playerReady(ws, msg);
    case 'shoot':       return shoot(ws, msg);
    case 'leave_room':  return leaveRoom(ws);
    default:            return send(ws, { type: 'error', reason: 'unknown_type' });
  }
}

// ============================================================
// 房间
// ============================================================
function createRoom(ws, msg) {
  if (ws.meta.roomId) return send(ws, { type: 'error', reason: 'already_in_room' });
  let id;
  do { id = genCode(); } while (rooms.has(id));

  // 房主选的难度（飞机数量），非法或缺省时用默认 3 架
  const want = Number(msg && msg.planeCount);
  const planeCount = ALLOWED_PLANE_COUNTS.includes(want) ? want : DEFAULT_PLANE_COUNT;

  const token = genToken();
  const room = {
    id,
    planeCount,
    seq: 0,
    phase: 'deploy',
    deploySeat: 1,
    current: 1,
    round: 0,
    winner: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    players: {
      1: newPlayer(token, ws),
      2: newPlayer(null, null),
    },
    deployTimer: null,
    turnTimer: null,
    deployLeft: DEPLOY_SECONDS,
    turnLeft: 0,
  };
  rooms.set(id, room);
  ws.meta = { roomId: id, seat: 1, token };

  send(ws, { type: 'room_created', roomId: id, seat: 1, token, planeCount });
  broadcastState(room);
}

function joinRoom(ws, msg) {
  if (ws.meta.roomId) return send(ws, { type: 'error', reason: 'already_in_room' });
  const room = rooms.get((msg.roomId || '').toUpperCase().trim());
  if (!room) return send(ws, { type: 'error', reason: 'room_not_found' });
  if (room.players[2].token) return send(ws, { type: 'error', reason: 'room_full' });

  const token = genToken();
  room.players[2] = newPlayer(token, ws);
  room.lastActivity = Date.now();
  ws.meta = { roomId: room.id, seat: 2, token };

  send(ws, { type: 'room_joined', roomId: room.id, seat: 2, token });
  send(room.players[1].ws, { type: 'opponent_joined' });

  // 两人到齐，启动部署倒计时
  startDeployTimer(room);
  broadcastState(room);
}

function leaveRoom(ws) {
  const room = rooms.get(ws.meta.roomId);
  if (room) {
    const seat = ws.meta.seat;
    const other = seat === 1 ? 2 : 1;
    const o = room.players[other];

    room.players[seat].connected = false;
    room.players[seat].ws = null;

    if (room.phase === 'battle') {
      // 对战中离开：判对方胜，房间留着等清理
      stopTurnTimer(room);
      room.winner = other;
      if (o && o.ws) {
        send(o.ws, { type: 'game_over', winner: other, reason: 'opponent_left' });
        o.ws.meta = { roomId: null, seat: null, token: null, alive: true };
      }
      rooms.delete(room.id);
    } else {
      // 部署阶段离开：直接取消整个房间，并通知已加入的对手
      stopDeployTimer(room);
      rooms.delete(room.id);
      if (o && o.ws) {
        send(o.ws, { type: 'room_closed', reason: 'host_left' });
        o.ws.meta = { roomId: null, seat: null, token: null, alive: true };
      }
    }
  }
  ws.meta = { roomId: null, seat: null, token: null, alive: true };
  send(ws, { type: 'left_room' });
}

// ============================================================
// 部署阶段
// ============================================================
function startDeployTimer(room) {
  stopDeployTimer(room);
  room.deployLeft = DEPLOY_SECONDS;
  room.deployTimer = setInterval(() => {
    if (room.phase !== 'deploy') return;
    room.deployLeft--;
    broadcastState(room);
    if (room.deployLeft <= 0) {
      stopDeployTimer(room);
      room.deployLeft = 0;
      // 飞机一律由玩家自己排布：超时不再自动随机布阵，
      // 改为停表并提示，双方仍需各自手动放好飞机再点“准备完成”。
      broadcast(room, { type: 'deploy_overdue' });
      broadcastState(room);
    }
  }, 1000);
}
function stopDeployTimer(room) {
  if (room.deployTimer) { clearInterval(room.deployTimer); room.deployTimer = null; }
}

function playerReady(ws, msg) {
  const room = rooms.get(ws.meta.roomId);
  if (!room) return send(ws, { type: 'error', reason: 'no_room' });
  if (room.phase !== 'deploy') return send(ws, { type: 'reject', reason: 'not_in_deploy' });

  const seat = ws.meta.seat;
  const p = room.players[seat];
  if (p.ready) return;

  // 校验飞机布局
  const planes = msg.planes;
  if (!Array.isArray(planes) || planes.length !== room.planeCount) {
    return send(ws, { type: 'reject', reason: 'invalid_plane_count' });
  }
  const used = new Set();
  const validated = [];
  for (const pl of planes) {
    if (!Array.isArray(pl.cells) || pl.cells.length !== SHAPE.length) {
      return send(ws, { type: 'reject', reason: 'invalid_plane_shape' });
    }
    let headCount = 0;
    for (const c of pl.cells) {
      if (typeof c.x !== 'number' || typeof c.y !== 'number' ||
          c.x < 0 || c.x >= N || c.y < 0 || c.y >= N) {
        return send(ws, { type: 'reject', reason: 'out_of_bounds' });
      }
      const k = c.x + ',' + c.y;
      if (used.has(k)) return send(ws, { type: 'reject', reason: 'overlap' });
      used.add(k);
      if (c.part === 'head') headCount++;
    }
    if (headCount !== 1) return send(ws, { type: 'reject', reason: 'invalid_head' });
    validated.push({ cells: pl.cells, headKey: pl.headKey, dir: pl.dir || 'up', sunk: false });
  }

  p.planes = validated;
  p.planeMap = buildPlaneMap(validated);
  p.heads = new Set(validated.map(pl => pl.headKey));
  p.ready = true;
  room.lastActivity = Date.now();

  // 双方都准备好了？
  if (room.players[1].ready && room.players[2].ready) {
    stopDeployTimer(room);
    startBattle(room);
  } else {
    broadcastState(room);
  }
}

// ============================================================
// 对战阶段
// ============================================================
function startBattle(room) {
  room.phase = 'battle';
  room.current = 1;   // 房主先手
  room.round = 1;
  room.turnLeft = TURN_SECONDS;
  broadcast(room, { type: 'battle_start', current: room.current });
  broadcastState(room);
  startTurnTimer(room);
}

function startTurnTimer(room) {
  stopTurnTimer(room);
  room.turnLeft = TURN_SECONDS;
  room.turnTimer = setInterval(() => {
    if (room.phase !== 'battle') return;
    room.turnLeft--;
    broadcastState(room);
    if (room.turnLeft <= 0) {
      stopTurnTimer(room);
      onTurnTimeout(room);
    }
  }, 1000);
}
function stopTurnTimer(room) {
  if (room.turnTimer) { clearInterval(room.turnTimer); room.turnTimer = null; }
}

function onTurnTimeout(room) {
  const prev = room.current;
  room.current = 3 - room.current;
  room.turnLeft = TURN_SECONDS;
  broadcast(room, { type: 'turn_timeout', prev, next: room.current });
  broadcastState(room);
  startTurnTimer(room);
}

function shoot(ws, msg) {
  const room = rooms.get(ws.meta.roomId);
  if (!room) return send(ws, { type: 'error', reason: 'no_room' });
  if (room.phase !== 'battle') return send(ws, { type: 'reject', reason: 'not_in_battle' });

  const seat = ws.meta.seat;
  if (room.current !== seat) return send(ws, { type: 'reject', reason: 'not_your_turn' });

  const x = msg.x, y = msg.y;
  if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || x >= N || y < 0 || y >= N) {
    return send(ws, { type: 'reject', reason: 'out_of_bounds' });
  }

  const opp = seat === 1 ? 2 : 1;
  const oppP = room.players[opp];
  const me = room.players[seat];
  const k = x + ',' + y;

  if (me.shots.has(k)) return send(ws, { type: 'reject', reason: 'already_shot' });

  const part = oppP.planeMap.get(k);
  let result;
  if (!part) {
    result = 'miss';
    me.shots.set(k, 'miss');
  } else if (part === 'head') {
    result = 'sunk';
    me.shots.set(k, 'sunk');
    const plane = oppP.planes.find(pl => pl.headKey === k);
    if (plane) plane.sunk = true;
    oppP.heads.delete(k);
  } else {
    result = 'hit';
    me.shots.set(k, 'hit');
  }

  room.round++;
  room.lastActivity = Date.now();

  broadcast(room, {
    type: 'shot_result',
    by: seat,
    x, y, result,
    coord: String.fromCharCode(65 + x) + (y + 1),
  });

  // 胜负？
  if (oppP.heads.size === 0) {
    room.phase = 'ended';
    room.winner = seat;
    stopTurnTimer(room);
    broadcastState(room);
    broadcast(room, { type: 'game_over', winner: seat, reason: 'all_sunk' });
    return;
  }

  // 换人
  room.current = opp;
  stopTurnTimer(room);
  broadcastState(room);
  startTurnTimer(room);
}

// ============================================================
// 状态广播
// ============================================================
function broadcastState(room) {
  room.seq++;
  for (const seat of [1, 2]) {
    const p = room.players[seat];
    if (p && p.ws && p.connected) {
      send(p.ws, { type: 'state', seq: room.seq, view: viewFor(room, seat) });
    }
  }
}

function viewFor(room, seat) {
  const me = room.players[seat];
  const opp = room.players[seat === 1 ? 2 : 1];
  return {
    phase: room.phase,
    seat,
    deploySeat: room.deploySeat,
    current: room.current,
    round: room.round,
    planeCount: room.planeCount,
    oppJoined: !!opp.token,
    deployLeft: room.phase === 'deploy' ? room.deployLeft : 0,
    turnLeft: room.phase === 'battle' ? room.turnLeft : 0,
    winner: room.winner,
    self: {
      planes: me.planes.map(pl => ({ cells: pl.cells, headKey: pl.headKey, sunk: !!pl.sunk })),
      incomingShots: Object.fromEntries(opp.shots),
      ready: me.ready,
      headsLeft: me.heads.size,
    },
    opp: {
      outgoingShots: Object.fromEntries(me.shots),
      sunkPlanes: opp.planes
        .filter(pl => pl.sunk)
        .map(pl => ({ cells: pl.cells, headKey: pl.headKey })),
      ready: opp.ready,
      headsLeft: opp.heads.size,
    },
  };
}

// ============================================================
// 断线重连
// ============================================================
function onDisconnect(ws) {
  const room = rooms.get(ws.meta.roomId);
  if (!room) return;
  const seat = ws.meta.seat;
  const p = room.players[seat];
  if (!p || p.ws !== ws) return;

  p.connected = false;
  p.ws = null;
  p.offlineAt = Date.now();

  const other = seat === 1 ? 2 : 1;

  // 掉线通知延迟 5 秒：只是网络抖一下、很快重连的情况不再提示“对手掉线/重连”，
  // 避免玩家侧被反复打扰。
  setTimeout(() => {
    const r = rooms.get(room.id);
    if (!r || r.players[seat] !== p || p.connected) return;
    if (r.players[other].ws) {
      send(r.players[other].ws, { type: 'opponent_disconnected' });
    }
  }, 5000);

  // 宽限期后清理
  setTimeout(() => {
    const r = rooms.get(room.id);
    if (!r) return;
    if (!r.players[seat].connected) {
      const o = r.players[other];
      if (o.ws) send(o.ws, { type: 'game_over', winner: other, reason: 'disconnect' });
      rooms.delete(r.id);
    }
  }, DISCONNECT_GRACE);
}

function reconnect(ws, msg) {
  const room = rooms.get((msg.roomId || '').toUpperCase().trim());
  if (!room) return send(ws, { type: 'error', reason: 'room_not_found' });
  const p = room.players[msg.seat];
  if (!p || p.token !== msg.token) return send(ws, { type: 'error', reason: 'auth_failed' });

  // 只有“真的掉线超过 5 秒又回来”才通知对手，网络抖动导致的秒断秒连不再刷屏
  const offlineMs = p.connected ? 0 : Date.now() - (p.offlineAt || Date.now());
  const wasOffline = offlineMs > 5000;

  p.ws = ws;
  p.connected = true;
  p.offlineAt = null;
  ws.meta = { roomId: room.id, seat: msg.seat, token: p.token };

  send(ws, { type: 'reconnected', seat: msg.seat, roomId: room.id });
  broadcastState(room);

  const other = msg.seat === 1 ? 2 : 1;
  if (wasOffline && room.players[other].ws) {
    send(room.players[other].ws, { type: 'opponent_reconnected' });
  }
}

// ============================================================
// 启动
// ============================================================
server.listen(PORT, () => {
  console.log('========================================');
  console.log('  ✈️  打飞机联机服务器已启动');
  console.log('========================================');
  console.log('  本机访问:  http://localhost:' + PORT);
  console.log('  局域网访问: http://<你的IP>:' + PORT);
  console.log('  查 IP:     Windows: ipconfig / Mac: ifconfig');
  console.log('========================================');
});
