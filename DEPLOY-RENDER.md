# 部署到 Render（免费层）

我在仓库里已经把 Render 需要的东西都配好了，你只需要在网页上做三件事：**建 GitHub 仓库 → 推送代码 → 在 Render 点部署**。

## 一、我已经准备好的

| 文件 | 作用 |
| --- | --- |
| `render.yaml` | Render 蓝图：免费实例、新加坡区域、Node 22，自动建设置 |
| `.gitignore` | 排除 `node_modules/`、`*.log`，避免把依赖和日志推上去 |
| `server.js` | 已支持 `process.env.PORT`，Render 分配的端口能直接用 |

已本地验证过 Render 的执行路径：干净检出 → `npm install` 成功（拉到 ws 8.23.0）→ `PORT=3200 node server.js` → 首页 200、WebSocket 建房成功（房间 TVT6AP、5 架难度）。

## 二、你需要做的（约 10 分钟）

### 步骤 1：在 GitHub 建一个仓库

打开 https://github.com/new → 仓库名填 `plane-online` → 选 Private 或 Public 都行 → **不要**勾选自动生成 README → Create。

建完拿到仓库地址，形如 `https://github.com/<你的用户名>/plane-online.git`。

### 步骤 2：把代码推上去

在本目录（`plane-online`）执行，把地址换成你自己的：

```powershell
git remote add origin https://github.com/<你的用户名>/plane-online.git
git push -u origin main
```

首次推送会弹 GitHub 登录/授权窗口，按提示登录即可。

### 步骤 3：在 Render 部署

注册 https://render.com（用 GitHub 账号登录最省事，省去后续授权），然后二选一：

**方式 A：蓝图（推荐，配置自动读 `render.yaml`）**

1. 控制台点 **New → Blueprint**
2. 选择 `plane-online` 仓库 → Apply
3. 等构建完成，拿到形如 `https://plane-online-xxxx.onrender.com` 的地址

**方式 B：手动建 Web Service**

1. **New → Web Service** → 连 GitHub → 选 `plane-online` 仓库
2. 按下表填写：

| 设置项 | 值 |
| --- | --- |
| Name | `plane-online` |
| Language / Runtime | Node |
| Region | Singapore（离国内最近） |
| Branch | `main` |
| Build Command | `npm install --no-audit --no-fund` |
| Start Command | `node server.js` |
| Instance Type | **Free** |

3. 环境变量加 `NODE_VERSION = 22`（可选，不加会用默认版本）
4. 点 Create Web Service

### 步骤 4：验证

1. 浏览器打开 Render 给你的 `https://xxx.onrender.com`
   - 第一次打开可能要等 **约 1 分钟**（免费实例在冷启动，页面会显示 Render 的加载页）
2. 看到「✈️ 打飞机 · 联机对战」标题说明部署成功
3. 选难度建房，记下房间码；手机或另一台电脑打开同一地址输入房间码加入
4. 双方各摆飞机 → 准备 → 开战，验证 WebSocket 正常

## 三、免费层的三个限制（心里有数就行）

| 限制 | 实际影响 |
| --- | --- |
| 15 分钟无任何流量 → 休眠 | 开局时 WS 消息算活跃流量，**对局中不会被休眠**；只是长期没人玩会被睡，下次打开等约 1 分钟 |
| 750 实例小时 / 月 | 一个服务 24 小时常驻约 744 小时，刚好用满；**别再开第二个免费服务** |
| 免费实例重启/休眠会丢内存状态 | 房间、飞机布局全部清空，和本机重启一样，重新建房即可（数据本来就不落盘） |

内存给 512 MB，这个项目常驻只占几十 MB，够用。

## 四、排错

- **构建失败**：在 Render 服务页的 Logs 看 `npm install` 的报错，多数是 `package-lock.json` 与依赖版本不一致，重新 `npm install` 生成锁文件再提交即可
- **502 / 一直转圈**：多半在冷启动，等 1 分钟；还是不行看 Logs 里有没有 `EADDRINUSE` 或启动异常
- **打开只有纯文本 / 页面空白**：确认 `public/index.html` 已推上去（`.gitignore` 没有误伤 `public/`）
- **能进页面但连不上对战**：确认访问的是 `https://`，客户端会自动用 `wss://`；混合内容会被浏览器拦
- **手机能开页面但建房失败**：先确认不是休眠中（连续刷新两次）
