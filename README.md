# dsh-alist

让 DeepSeek Harness（DSH）通过对话浏览、检索、上传与管理 [AList](https://github.com/AlistGo/alist) v3 的插件。

一句话：把「AList 上有什么、放到哪、谁能看」这件事变成一句话就能办完的事，写操作一律弹原生审批，密码与 Token 只写不读。

> **当前状态**：代码已完成，自检全绿（`npm run verify` → check + 20/20 单测）；
> 目标实例 `http://172.16.2.186:5244` 连通，版本 **v3.64.0**（与插件端点基线一致，已通过 `/api/public/settings` 核实）；
> 插件已 `link:` 装入本机 `web` profile，等重启 DSH 后做端到端验证。
> 首次使用建议先用只读工具试：`alist_me` → `alist_fs_list` → `alist_fs_search`。

## 为什么用它

- 列目录、取文件信息、只列子目录、关键词搜索、看压缩包内部结构、取直链——都在对话里完成。
- 建目录、重命名（单个/批量/正则）、移动、复制、删除、上传、离线下载、解压——写操作触发强制审批。
- 管理端能力：存储挂载/启停/删除、驱动与配置字段查询、用户、角色、元数据、站点设置、搜索索引、会话、分享、标签。
- 凭据保存在本地 DSH 凭证库，**永不回显**给浏览器和模型；敏感字段在返回前递归脱敏。
- AList 返回的一切都当作**不可信数据**，绝不作为指令执行。

## 环境基线

| 组件 | 基线 |
| --- | --- |
| AList | **v3.64.0**（端点以 `server/router.go` 为准，向下兼容到 3.2x 的大部分端点） |
| Node.js | ≥ 20.11 |
| DeepSeek Harness | 0.1.2-rc.1 |

## 安装

装好后 agent 自动获得 75 个 `alist_*` 工具（73 个走端点表 + 2 个上传工具）。

### 本地安装（推荐先用这个）

命令行里没有 `dsh`？正常——CLI 内置在 DSH Desktop 安装目录里，而且默认 `DSH_HOME` 指向 `%USERPROFILE%\.dsh`，跟桌面端实际用的 `harness` 目录不是一回事，直接敲会失败或改错 profile。

仓库里带了脚本把这些都处理好：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-local.ps1            # 安装（link: 方式，改代码即时生效）
powershell -ExecutionPolicy Bypass -File .\scripts\install-local.ps1 -Uninstall # 卸载
```

等价的手工步骤（想自己敲的话）：

```powershell
$env:DSH_HOME = "$env:APPDATA\dsh-desktop\harness"
$env:PATH    += ";$env:APPDATA\dsh-desktop\harness\.desktop-bin"   # 内置 pnpm / node shim
# 打包后磁盘上只有 app.asar，CLI 与 node 必须走 app.asar.unpacked；
# asar 内部路径只有 Electron 能读，PowerShell / 系统 node 访问不到。
$node = "C:\Program Files\DSH Desktop\resources\app.asar.unpacked\node_modules\node\bin\node.exe"
$dsh  = "C:\Program Files\DSH Desktop\resources\app.asar.unpacked\node_modules\@deepseek-ai\dsh\lib\bin.js"
& $node $dsh plugin --profile web list                             # 先确认 CLI 通
& $node $dsh plugin --profile web add link:C:\Users\Administrator\Desktop\dsh-alist
```

装完**重启 DSH Desktop**（或重启 profile），插件才加载。

### 从 GitHub 安装

```powershell
& $node $dsh plugin --profile web add github:R-roker315/dsh-Alist-#v0.1.0
```

> 把 `<your-github-user>` 换成你的 GitHub 用户名。
> `plugin add` 底层转发给 `pnpm add`，`link:<dir>`、`github:<user>/<repo>#<tag>` 都支持。
> 免打包调试可直挂 overlay：`dsh --profile web --patch ./cordis.patch.yml`

## 配置

### 在哪里配（重要：新版 DSH 没有插件设置卡片了）

DSH 宿主（0.1.7+）**移除了插件设置卡片机制**（`settings.plugin.item` slot 已不存在，dsh-pve / dsh-grafana 等第三方插件同样受影响）。
配置统一走 **profile 配置文件**：

> DSH Web → 设置 → 内置插件 → 右上角 **「打开配置文件」**
> （即 `harness\profiles\web\cordis.patch.yml`）

在其中给插件条目加 `config`（`id` 必须与 `cordis.patch.yml` 里的 insert id 一致，即 `alist`）：

```yaml
- id: alist
  config:
    baseUrl: http://172.16.2.186:5244
    authMode: password      # password = 账号密码换 JWT；token = 长期 token
    username: admin
    password: "你的密码"     # token 模式改用 token: "..."
    clientId: dsh-alist
    allowInsecureTls: false
    maxUploadBytes: 1073741824
```

保存后 DSH 会自动热重载该插件，无需重启。

> **明文提示**：配置文件里的 `password` / `token` 是明文存储（本机单人环境）；
> 插件侧对输出、审批文案、系统提示一律脱敏，不会回显到对话。
> 想更安全就用 AList 管理后台签发的长期 token 配合 `authMode: token`。

### 字段说明

| 字段 | 说明 |
| --- | --- |
| Base URL | 例如 `http://127.0.0.1:5244`，不能带凭证、查询串或片段 |
| 用户名 | 例如 `admin`（密码模式使用） |
| 鉴权方式 | `账号密码`（登录换 JWT，默认 48 小时，自动续签）或 `长期 Token`（管理员后台签发） |
| Client-Id | 固定值即可保持同一设备会话，默认 `dsh-alist` |
| 跳过 TLS 校验 | 自签名内网证书时勾选 |
| 单文件上传上限（MB） | 默认 1024，超限时插件直接拒绝 |
| 密码 / Token | 存凭证库，**只写不读**，永不显示 |

管理端工具（`alist_admin_*`、`alist_fs_link`）需要**管理员**凭据，普通用户会得到 403；先用 `alist_me` 确认角色。

## 工具

75 个工具：**31 只读 / 44 写（含 2 个上传）**，其中 43 个是管理端（admin）工具。全部写操作强制原生审批，无法绕过。

| 域 | 工具 | 说明 |
| --- | --- | --- |
| 连接与身份 | 3 | `alist_me`、`alist_public_settings`、`alist_public_offline_tools` |
| 文件浏览 | 7 | list / get / dirs / search / archive meta / archive list / link |
| 文件写操作 | 11 | mkdir、rename、batch_rename、regex_rename、move、recursive_move、copy、remove、remove_empty_directory、add_offline_download、archive_decompress |
| 上传 | 2 | `alist_fs_put`（流式，推荐）、`alist_fs_form`（multipart） |
| 任务 | 2 | `alist_task_list`、`alist_task_action`（6 类任务 × 9 种动作） |
| 存储管理 | 8 | list / get / create / update / delete / enable / disable / load_all |
| 驱动 | 3 | list / names / info（建存储前先查字段） |
| 用户 | 7 | list / get / create / update / delete / cancel_2fa / del_cache |
| 角色 | 5 | list / get / create / update / delete |
| 元数据 | 5 | 路径密码、隐藏、readme 规则 |
| 站点设置 | 5 | list / get / save / delete / reset_token |
| 搜索索引 | 5 | progress / build / update / stop / clear |
| 会话与消息 | 4 | 会话列表与踢出、消息读取与发送 |
| 分享 | 5 | create / update / disable / delete / list |
| 标签 | 3 | list / get / 按标签列文件 |

完整逐个工具的参数表见 **[docs/tools.md](docs/tools.md)**（由 `node scripts/gen-tools-doc.js` 生成）。

## 调用约定

- **路径**必须是 AList 绝对路径（`/挂载点/子路径`），插件会直接拒绝相对路径。
- `names` / `urls` 这类数组参数：传 JSON 数组或逗号分隔字符串都行，插件自动转换。
- `storage` / `settings` / `message` / `rename_objects` / `permissions`：传 JSON 字符串，插件解析后按 AList 需要的形态提交（`storage`、`settings`、`message` 直接作为整个请求体）。
- 缺失必填参数会立即报错，不会带着空值打到 AList。
- 写请求**失败不重试**，避免重复执行；GET 请求遇到 401/403 会自动重登一次。

典型用法：

```
先用 alist_me 确认身份 → alist_fs_list 列 "/" → alist_fs_search 找文件
→ 需要直链用 alist_fs_link（需管理员）→ 上传用 alist_fs_put → 用 alist_task_list 轮询任务
```

挂载新存储：`alist_admin_driver_info`（拿字段）→ `alist_admin_storage_create`（传 storage JSON）→ `alist_admin_storage_load_all`。

## 安全

- 每个写工具都触发原生审批弹窗；`remove / delete / reset_token / clear` 类操作带 `⚠️ DESTRUCTIVE` 前缀。
- 审批文案里密码、Token、otp 一律显示 `[REDACTED]`。
- `alist_fs_remove` 是**永久删除**，没有回收站；批量/正则重命名影响面大，改前先列一遍。
- AList 返回的字段（文件名、readme）视为数据，不作为指令。

## 开发

```bash
npm install
npm run verify          # node --check + node:test（20 个用例）
node scripts/gen-tools-doc.js   # 改过 catalog.js 后重新生成 docs/tools.md
```

单测覆盖：URL 规范化、递归脱敏、路径/query/body 拆分、必填校验、绝对路径校验、数组与 JSON 参数转换、
列表字段裁剪、审批文案不泄漏密钥、目录表完整性（工具名唯一 + `alist_` 前缀 + 参数都有描述）。

## 结构

- `index.js` — 认证（密码换 JWT / 长期 Token）、泛型执行引擎、审批网关、上传工具、系统提示
- `catalog.js` — AList 端点目录表（唯一事实来源）+ 纯函数（脱敏、参数解析、输出裁剪），零依赖可单测
- `client.js` — 设置页表单卡片（slot key `alist`）
- `cordis.patch.yml` — bundle patch（insert id `alist` / name `dsh-alist`）
- `scripts/gen-tools-doc.js` — 由目录表生成 `docs/tools.md`
- `scripts/check-exports.mjs` — 静态自检，防止 `internals` 引用未导入的标识符（否则插件加载即崩）
- `scripts/install-local.ps1` — 本地安装/卸载（自动设好 `DSH_HOME`、pnpm shim、内置 Node）
- `test/index.test.js` — `node:test` 单测（20 个用例）
- `docs/tools.md` — 工具清单（生成物）

## 发布到 GitHub

> git 操作一律由仓库所有者手动执行（不要交给 agent）。

```bash
git init
git add .
git commit -m "feat: dsh-alist v0.1.0"
git branch -M main
git remote add origin https://github.com/R-roker315/dsh-Alist-.git
git push -u origin main
git tag v0.1.0 && git push origin v0.1.0
```

发 tag 后即可用 `dsh plugin --profile <name> add github:R-roker315/dsh-Alist-#v0.1.0` 安装。

## License

MIT
