# hust-photo-album · HUST电自814云相册

基于 **Cloudflare Pages + Functions + R2** 的自建云相册（照片/视频，按相册分类）。

- 线上地址：https://myrem.ccwu.cc （Pages 项目 `my-photo-drive`，自定义域名 `myrem.ccwu.cc`）
- 部署方式：GitHub 仓库连接 Pages，push 自动部署

## 目录结构

```
public/index.html        # 前端页面（登录/相册切换/上传/预览/下载/删除）
functions/[[path]].js    # 后端全部路由（auth/list/upload/file 预览/删除）
wrangler.jsonc           # Pages 项目配置（R2 绑定 MY_BUCKET）
```

## API

| 路由 | 方法 | 说明 | 鉴权 |
|------|------|------|------|
| `/api/auth` | POST | `{password}` → `{success, role, token}` | 后端校验密码 |
| `/api/list` | GET | `{objects:[{key,size,type,hasCover}]}` | 公开 |
| `/api/upload` | POST | formData: `file` + `album` | 需 Bearer token（user/admin） |
| `/file/{key}` | GET | 预览/下载 | 公开（`<img>`/`<video>` 需直接可访问） |
| `/file/{key}` | DELETE | 删除 | 仅 admin token |

token = `SHA-256(role|密码)` 派生，登录时下发；**改密码后旧 token 失效需重新登录**。

## Cloudflare 配置（改密码/相册名在这里做）

1. **R2 桶**：`my-media-bucket`，在 Pages 项目 Settings → Functions 里绑定，变量名 **`MY_BUCKET`**
2. **环境变量**（Settings → Functions → Environment variables）：
   - `ACCESS_PASSWORD` — 访客密码（可上传/下载，不能删）
   - `ADMIN_PASSWORD` — 管理员密码（可删除）
3. **相册名**：写死在前端 `public/index.html` 的 `allAlbums` 数组里（R2 按 key 前缀 `相册名/文件名` 分类），改相册名 = 改数组 + push

> 注意：线上 `my-photo-drive` 项目原有的环境变量名如果与上面不一致（比如叫 `PASSWORD`），部署前请在后台统一改成 `ACCESS_PASSWORD` / `ADMIN_PASSWORD`。

## 本地测试（可选）

`npx wrangler pages dev` 起本地环境（R2 需要本地 mock，或临时绑定真实桶）。

## 部署（当前方案：新建 Pages 项目，废弃旧 Worker）

现状：`myrem.ccwu.cc` 挂在旧 **Worker `my-photo-drive`** 上（代码手动维护、无鉴权）；
本仓库已连着一个 Pages 项目 `hust-photo-album`（新代码会自动部署，但静态输出目录未配对，页面 404）。

标准操作流程（一次性，完成后即进入"push 即部署"状态）：

1. **新建 Pages 项目**：Cloudflare → Workers & Pages → Create → **Pages** → **Connect to Git** → 选 `whdd-wdf/hust-photo-album`
   - 项目名：`myrem`（`my-photo-drive` 名字被旧 Worker 占用，废弃 Worker 后可再改名）
   - Build command：**留空**
   - Output directory：**`public`**
2. **配置后端资源**（新项目的 Settings → Functions）：
   - **R2 绑定**：变量名 `MY_BUCKET` → 桶 `my-media-bucket`（在旧 Worker 的 Settings → R2 里确认桶名）
   - **环境变量**：`ACCESS_PASSWORD` / `ADMIN_PASSWORD`（值从旧 Worker 的 Settings → Variables 抄过来；旧变量名不同也没关系，值照抄、名用新的）
3. **验证**：部署完成后访问 `https://<项目名>.pages.dev`，登录、上传、删除都正常后再切域名
4. **切域名**：新项目 → **Custom domains** → 添加 `myrem.ccwu.cc`（CF 会自动从旧 Worker 迁移）
5. **废弃 Worker**：确认 myrem 正常后删除 Worker `my-photo-drive`
6. （可选）Pages 项目改名 `my-photo-drive`；旧 Pages 项目 `hust-photo-album` 可一并删除

之后改相册 = 改本仓库文件 → `git push` → 自动部署。
