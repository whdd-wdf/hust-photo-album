// functions/[[path]].js — HUST电自814云相册 后端（Cloudflare Pages Functions）
//
// 路由（与线上 myrem.ccwu.cc Worker 契约一致，另加鉴权加固）：
//   POST   /api/auth        {password}        → {success, role, token}
//   GET    /api/list                             → {objects:[{key,size,type,hasCover}]}
//   POST   /api/upload      form: file+album    → {success, filename, url}   需登录(token)
//   GET    /file/{key}                             预览/下载（公开，<img>/<video> 要能直接加载）
//   DELETE /file/{key}                             删除（仅 admin token）
//   GET    / 及其他未匹配路径    先回落静态文件（ASSETS），无则函数直接伺服首页（home.js）
//
// 首页 HTML 来源：public/index.html 生成 functions/home.js（node gen_home.mjs 重新生成）。
// 这样即使 Pages 静态输出目录未配对，首页也能出。
//
// R2 绑定名固定 MY_BUCKET，必须与 Cloudflare Pages 后台 Settings→Functions 里的绑定一致。
// 环境变量：ACCESS_PASSWORD（访客密码）、ADMIN_PASSWORD（管理员密码）。
// 注意：若线上 my-photo-drive 用的变量名不同（如 PASSWORD），请在后台改名或同步修改本文件。

import { HOME_HTML } from './home.js';

// ---------- 工具 ----------

async function makeToken(role, password) {
  const data = new TextEncoder().encode(role + '|' + (password || ''));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function bearerToken(request) {
  const h = request.headers.get('Authorization') || '';
  return h.replace(/^Bearer\s+/i, '');
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function isMedia(key) {
  if (/\.(jpg|jpeg|png|gif|webp|bmp|heic)$/i.test(key)) return 'image';
  if (/\.(mp4|webm|mov|m4v)$/i.test(key)) return 'video';
  return 'file';
}

// ---------- Google Drive 备份 ----------
// 环境变量：GOOGLE_SA_EMAIL（服务账号邮箱）、GOOGLE_SA_KEY（私钥 PEM）、GOOGLE_DRIVE_FOLDER_ID（备份目标文件夹 ID）

function b64url(bytes) {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pemToKey(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const raw = Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', raw.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function googleAccessToken(env) {
  const email = env.GOOGLE_SA_EMAIL || '';
  let key = env.GOOGLE_SA_KEY || '';
  if (!email || !key) throw new Error('未配置 GOOGLE_SA_EMAIL / GOOGLE_SA_KEY');
  key = key.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({
    iss: email, scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })));
  const unsigned = header + '.' + payload;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await pemToKey(key), new TextEncoder().encode(unsigned));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + unsigned + '.' + b64url(sig),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Google 授权失败: ' + JSON.stringify(data));
  return data.access_token;
}

async function driveUpload(accessToken, folderId, name, mime, data) {
  // 初始化 resumable 上传
  const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parents: [folderId], mimeType: mime }),
  });
  const sessionUrl = init.headers.get('Location');
  if (!sessionUrl) throw new Error('Drive 上传初始化失败');
  const up = await fetch(sessionUrl, {
    method: 'PUT', headers: { 'Content-Type': mime, 'Content-Length': data.byteLength },
    body: data,
  });
  if (!up.ok) throw new Error('Drive 上传失败: ' + up.status);
  return up.json();
}

async function driveFileExists(accessToken, folderId, name) {
  const q = encodeURIComponent("'" + folderId + "' in parents and name = '" + name.replace(/'/g, "\\'") + "' and trashed = false");
  const res = await fetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id)', {
    headers: { 'Authorization': 'Bearer ' + accessToken },
  });
  const data = await res.json();
  return (data.files && data.files.length > 0);
}

// ---------- 入口 ----------

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS 预检
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const accessPwd = env.ACCESS_PASSWORD || '';
    const adminPwd = env.ADMIN_PASSWORD || '';

    // 1. 登录：校验密码，返回派生 token
    if (path === '/api/auth' && method === 'POST') {
      const { password } = await request.json();
      if (!password) return json({ success: false, error: '请输入密码' }, 400);
      if (adminPwd && password === adminPwd) {
        return json({ success: true, role: 'admin', token: await makeToken('admin', adminPwd) });
      }
      if (accessPwd && password === accessPwd) {
        return json({ success: true, role: 'user', token: await makeToken('user', accessPwd) });
      }
      return json({ success: false, error: '密码错误' }, 401);
    }

    // 2. 文件列表（公开；前端按相册前缀过滤）
    if (path === '/api/list' && method === 'GET') {
      const listed = await env.MY_BUCKET.list({ limit: 1000 });
      const objects = listed.objects.map(obj => ({
        key: obj.key,
        size: obj.size,
        type: isMedia(obj.key),
        hasCover: null,
      }));
      return json({ objects });
    }

    // 3. 上传（需登录：user 或 admin token）
    if (path === '/api/upload' && method === 'POST') {
      const tok = bearerToken(request);
      const userTok = accessPwd ? await makeToken('user', accessPwd) : '';
      const adminTok = adminPwd ? await makeToken('admin', adminPwd) : '';
      if (!tok || (tok !== userTok && tok !== adminTok)) {
        return json({ success: false, error: '需要登录' }, 401);
      }

      const formData = await request.formData();
      const file = formData.get('file');
      if (!file) return json({ success: false, error: 'No file' }, 400);

      const rawAlbum = (formData.get('album') || '').toString().trim();
      const album = rawAlbum.replace(/[^\w\u4e00-\u9fa5-]/g, '_') || '未分类';
      const name = (file.name || 'file').replace(/[^\w.\u4e00-\u9fa5-]/g, '_');
      const objectKey = `${album}/${name}`;

      await env.MY_BUCKET.put(objectKey, file.stream(), {
        httpMetadata: { contentType: file.type || 'application/octet-stream' },
      });

      return json({ success: true, filename: objectKey, url: `/file/${encodeURIComponent(objectKey)}` });
    }

    // 4. 预览/下载（公开 —— 静态 <img>/<video> src 需要能直接访问）
    if (path.startsWith('/file/') && method === 'GET') {
      const key = decodeURIComponent(path.replace('/file/', ''));
      const object = await env.MY_BUCKET.get(key);
      if (!object) return new Response('Not found', { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      const type = isMedia(key);
      headers.set('Content-Disposition', type === 'file' ? `attachment; filename="${key.split('/').pop()}"` : 'inline');
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(object.body, { headers });
    }

    // 5. 删除（仅 admin token）
    if (path.startsWith('/file/') && method === 'DELETE') {
      const tok = bearerToken(request);
      const adminTok = adminPwd ? await makeToken('admin', adminPwd) : '';
      if (!tok || tok !== adminTok) {
        return json({ success: false, error: '需要管理员权限' }, 403);
      }
      const key = decodeURIComponent(path.replace('/file/', ''));
      await env.MY_BUCKET.delete(key);
      return json({ success: true });
    }

    // 备份到 Google Drive（仅 admin）：POST /api/backup
    if (path === '/api/backup' && method === 'POST') {
      const tok = bearerToken(request);
      const adminTok = await makeToken('admin', adminPwd);
      if (!tok || tok !== adminTok) return json({ success: false, error: '需要管理员权限' }, 403);
      const folderId = env.GOOGLE_DRIVE_FOLDER_ID || '';
      if (!folderId) return json({ success: false, error: '未配置 GOOGLE_DRIVE_FOLDER_ID' }, 500);
      try {
        const accessToken = await googleAccessToken(env);
        const listed = await env.MY_BUCKET.list({ limit: 1000 });
        let uploaded = 0, skipped = 0;
        const errors = [];
        for (const obj of listed.objects) {
          const fname = obj.key.split('/').pop();
          try {
            if (await driveFileExists(accessToken, folderId, obj.key)) { skipped++; continue; }
            const r2obj = await env.MY_BUCKET.get(obj.key);
            if (!r2obj) { errors.push(obj.key + ': R2 读取失败'); continue; }
            const buf = await r2obj.arrayBuffer();
            const mime = r2obj.httpMetadata?.contentType || 'application/octet-stream';
            await driveUpload(accessToken, folderId, obj.key, mime, buf);
            uploaded++;
          } catch (e) { errors.push(obj.key + ': ' + e.message); }
        }
        return json({ success: true, uploaded, skipped, total: listed.objects.length, errors });
      } catch (e) {
        return json({ success: false, error: e.message }, 500);
      }
    }

    // 6. 未匹配的 GET 请求：先回落静态文件（env.ASSETS），
    //    没有静态资产时 / 由函数直接返回首页（与旧 Worker 行为一致）
    if (method === 'GET') {
      try {
        const asset = await env.ASSETS.fetch(request);
        if (asset && asset.status !== 404) return asset;
      } catch (_) { /* ASSETS 不可用则继续 */ }
      if (path === '/') {
        return new Response(HOME_HTML, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      return new Response('Not Found', { status: 404 });
    }
    return new Response('Not Found', { status: 404 });
  } catch (e) {
    console.error(e);
    return json({ success: false, error: e.message }, 500);
  }
}
