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
