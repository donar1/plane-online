# 部署到魔搭创空间（ModelScope Studio）

魔搭创空间支持 Docker 类型部署，**CPU 资源完全免费**，不需要信用卡。但要先知道它的两条硬性规则和一个待验证点。

## 一、平台硬性规则（决定了能不能跑）

| 规则 | 我们的适配 |
| --- | --- |
| 服务必须暴露在 `0.0.0.0`，端口**固定 7860 且不可修改**（官方说明：https://www.modelscope.cn/docs/studios/docker.md） | `Dockerfile` 里 `ENV PORT=7860`，`server.js` 本来就读 `process.env.PORT`；`server.listen(PORT)` 默认绑定全部网卡 |
| 容器内 8080 被平台占用，不能占 | 我们只用 7860 |
| `Authorization`、`X-modelscope-*`、`X-studio-*` 请求头被平台占用 | 我们没有用这些头 |
| 低频时段/少人访问会自动休眠 | 和 Render 类似，开局时唤醒 |

**待验证点**：魔搭官方文档只规定了端口和绑定地址，**没有明确写反向代理是否透传 WebSocket 升级请求**。所以能不能玩，最终取决于部署后实测。`Dockerfile` 和端口都已按它的要求配好，剩下的是验证。

## 二、已经准备好的文件

| 文件 | 说明 |
| --- | --- |
| `Dockerfile` | `node:22-slim` 基础镜像，`npm ci --omit=dev` 装依赖，`PORT=7860`，`CMD node server.js` |
| `.dockerignore` | 排除 `node_modules`、日志、`tests`、文档，镜像更小 |

**已本地验证**（模拟 Dockerfile 的执行步骤，不是空想）：

| 检查 | 结果 |
| --- | --- |
| `npm ci --omit=dev` | 成功，装到 ws |
| `PORT=7860 node server.js` | 首页 HTTP 200 |
| 7860 上 WebSocket 建房 | 成功，`room_created`、房间 FCUZKZ、4 架难度 |

本机没装 Docker，所以**镜像构建本身没跑过**，但构建命令逐条在宿主机上等价验证过。

## 三、部署步骤（约 10 分钟）

1. **登录魔搭** https://www.modelscope.cn ，用你的账号（不需要实名以外的额外绑定）
2. 进入 **创空间 → 新建创空间** https://modelscope.cn/studios/create
3. 填写基本信息：
   - 空间名称：`plane-online`
   - 可见性：公开 / 私有都行（要给别人玩就选公开）
   - **SDK 类型选 `Docker`**
4. 上传文件：把以下 4 个推上去（可以直接用「从 Git 仓库导入」指向 `https://github.com/donar1/plane-online`，或用网页上传）
   - `Dockerfile`
   - `server.js`
   - `package.json`
   - `package-lock.json`
   - `public/index.html`
5. 资源配置选 **免费 CPU**（2 vCPU / 16GB 内存的免费档）
6. 端口填 **7860**（Docker 类型必填，且只能是这个值）
7. 提交部署，等构建完成

部署成功后会拿到两个地址：

- `https://modelscope.cn/studios/<你的用户名>/plane-online`
- `https://<用户名>-plane-online.ms.show` ← **优先用这个**，它是独立域名，客户端会用 `wss://` 连，路径也更干净

## 四、部署后必须验证的一件事

打开页面看到「✈️ 打飞机 · 联机对战」只说明 HTTP 通了，**WebSocket 才是关键**。两种验证方式：

**方式一（推荐，让我来跑）**：把 `.ms.show` 地址发我，我用 Node 客户端从本机连 `wss://<地址>` 发一次建房请求，能收到 `room_created` 就说明平台透传了 WS，可以直接开玩。

**方式二（自己看）**：浏览器打开页面 → 按 F12 → Console → 点「创建房间」。如果出现房间码，说明 WS 正常；如果刷 `WebSocket connection failed` 或一直转圈，就是代理没透传 WS。

## 五、如果 WS 不通怎么办

魔搭创空间本质是给 AI 应用做 Demo 的，长连接支持不在它的文档承诺里。真不通的话按这个顺序换：

1. **国内低延迟首选：腾讯云轻量 / 阿里云 ECS 免费试用**（1–3 个月），到期一年几十块，3000 端口直连可免备案，最接近“正经服务器”
2. **完全不花钱：Cloudflare Tunnel + 本机**，不用任何账号绑卡
3. **阿里云函数计算 FC**：支持 WebSocket，但有冷启动和实例内存状态不共享的问题，房间逻辑要调整，改造量最大

## 六、和 Render 的对比

| 项 | 魔搭创空间 | Render 免费层 |
| --- | --- | --- |
| 信用卡 | 不要 | 不要（但你账号被要求验证了） |
| 国内访问速度 | **快**（阿里云机房） | 一般（新加坡区域稍好） |
| 端口限制 | 只能 7860 | 任意（读 `PORT`） |
| WebSocket | **未验证** | 明确支持 |
| 休眠 | 低频/少访问自动休眠 | 15 分钟无流量休眠 |
| 免费额度 | CPU 长期免费 | 750 实例小时/月 |
