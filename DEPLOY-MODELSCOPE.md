# 部署到魔搭创空间（ModelScope Studio）

**已部署成功并实测可对战。** 访问地址：https://modelscope.cn/studios/summen/plane-online

## 零、当前状态（2026-11-27）

| 项 | 结果 |
| --- | --- |
| 创空间 | `summen/plane-online`，默认分支 `master`，提交 `a133348` |
| SDK 类型 | `docker`，关联云资源「免费CPU，按需分配 / 2v CPU / 8G内存」 |
| 监听端口 | `7860`（页面字段值即是，Dockerfile 里 `ENV PORT=7860` 对齐） |
| 休眠时间 | 设为 `24 小时`（可选 10 分钟～1 周 / 不休眠） |
| 构建 | 从提交到「运行中」约 3 分钟，首次构建日志显示 `创空间构建-香港-linux/amd64` |
| HTTP | 页面正常渲染，难度选择、创建房间 UI 齐全 |
| **WebSocket** | **可用** —— 建房成功返回 `room_created`（房间 SJ5VK8、4 架），并持续收到 `state` 帧 |

WebSocket 的一个实测坑（重要）：网关会**按 User-Agent 拦截非浏览器客户端**。用纯脚本（默认 UA）直连 `wss://summen-plane-online.ms.show/` 会拿到 `403`；带上浏览器 UA 后立即连通。也就是说浏览器里玩没问题，但**别用裸脚本做自动化对战联调**，脚本要伪装 UA。

## 一、平台硬性规则（决定了能不能跑）

| 规则 | 我们的适配 |
| --- | --- |
| 服务必须暴露在 `0.0.0.0`，端口**固定 7860 且不可修改**（官方说明：https://www.modelscope.cn/docs/studios/docker.md） | `Dockerfile` 里 `ENV PORT=7860`，`server.js` 本来就读 `process.env.PORT`；`server.listen(PORT)` 默认绑定全部网卡 |
| 容器内 8080 被平台占用，不能占 | 我们只用 7860 |
| `Authorization`、`X-modelscope-*`、`X-studio-*` 请求头被平台占用 | 我们没有用这些头 |
| 低频时段/少人访问会自动休眠 | 和 Render 类似，开局时唤醒 |

**WebSocket（已回答）**：官方文档只规定端口和绑定地址，没写反向代理是否透传升级请求。实测结论是**可以透传**，但会按 User-Agent 拦非浏览器客户端（细节见上一节）。

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
   - License：`MIT License`（创空间生成的 README 元信息里已有，不用改）
4. 推代码到创空间仓库（推荐，本项目就是这么做的）：
   - 在「空间文件 → 通过Git上传」里复制完整 clone 地址（带 token，务必用复制按钮，截图容易截断）
   - 本地克隆 → 把 `Dockerfile`、`.dockerignore`、`server.js`、`package.json`、`package-lock.json`、`public/` 放进去
   - **保留创空间生成的 README 元信息块**（`license` / `tags` 等），只替换正文，否则空间配置会丢
   - `git push origin master`（创空间默认分支是 `master` 不是 `main`）
5. 「下一步：部署设置」→ 框架选 **docker**，云资源选 **免费CPU，按需分配 / 2v CPU / 8G内存**
6. 监听端口填 **7860**；休眠时间选 **24 小时**
7. 「确认并部署」→ 约 3 分钟变成「运行中」

部署成功后会拿到两个地址：

- `https://modelscope.cn/studios/<你的用户名>/plane-online`
- `https://<用户名>-plane-online.ms.show` ← **优先用这个**，它是独立域名，客户端会用 `wss://` 连，路径也更干净

## 四、WebSocket 实测记录

| 探测方式 | 结果 |
| --- | --- |
| `wss://summen-plane-online.ms.show/`（Node 默认 UA） | `403` 拒绝升级 |
| 同上 + `studio_token` 查询参数 | `403` |
| 同上 + `Origin: https://www.modelscope.cn` | `403` |
| 同上 + 浏览器 User-Agent | **连通**，收到 `room_created` 与后续 `state` |
| 浏览器里实际点击「创建房间」 | 正常出房间码，可对战 |

结论：网关不靠 token 鉴权，而是按 User-Agent 过滤非浏览器客户端。浏览器玩没问题；写自动化脚本联调时必须伪装 UA。

另外注意：直接访问 `https://summen-plane-online.ms.show` 现在会 302 到 `https://www.modelscope.cn/studios/summen/plane-online?mode=full` 的 iframe 外壳页。**发给朋友的链接用站内地址**，不要用 .ms.show。

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
