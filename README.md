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

## 部署

1. Cloudflare Pages 项目 `my-photo-drive` → Settings → 连接本仓库 `whdd-wdf/hust-photo-album`
2. Build command 留空，Output directory 填 `public`
3. 之后 `git push` 即自动部署；也可在 Deployments 页手动 Redeploy
