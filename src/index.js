import { JSZip } from 'https://cdn.skypack.dev/jszip@3.10.1';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS 处理
    if (method === 'OPTIONS') {
      return handleCORS(new Response(null, { status: 204 }));
    }

    try {
      // 1. 首页 (包含登录逻辑)
      if (path === '/' && method === 'GET') {
        return handleCORS(new Response(getHTML(env), {
          headers: { 'Content-Type': 'text/html' }
        }));
      }

      // 2. 获取配置 (相册名等)
      if (path === '/api/config' && method === 'GET') {
        const albums = [
          env.ALBUM_1 || '相册一',
          env.ALBUM_2 || '相册二',
          env.ALBUM_3 || '相册三',
          env.ALBUM_4 || '相册四',
          env.ALBUM_5 || '相册五'
        ];
        return handleCORS(new Response(JSON.stringify({ albums }), {
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      // 3. 验证密码
      if (path === '/api/login' && method === 'POST') {
        const { password } = await request.json();
        const accessPwd = env.ACCESS_PASSWORD;
        const adminPwd = env.ADMIN_PASSWORD;

        if (!password) return handleCORS(new Response(JSON.stringify({ error: '请输入密码' }), { status: 400 }));
        
        if (password === adminPwd) {
          return handleCORS(new Response(JSON.stringify({ role: 'admin', token: await makeToken('admin', adminPwd) })));
        } else if (password === accessPwd) {
          return handleCORS(new Response(JSON.stringify({ role: 'user', token: await makeToken('user', accessPwd) })));
        } else {
          return handleCORS(new Response(JSON.stringify({ error: '密码错误' }), { status: 401 }));
        }
      }

      // 4. 获取文件列表 (支持按相册过滤)
      if (path === '/api/list' && method === 'GET') {
        const albumFilter = url.searchParams.get('album');
        const listed = await env.MY_BUCKET.list();
        
        let objects = listed.objects.map(obj => {
          // 解析路径：albumName/filename
          const parts = obj.key.split('/');
          const fileAlbum = parts.length > 1 ? parts[0] : '未分类';
          const fileName = parts.length > 1 ? parts.slice(1).join('/') : obj.key;
          
          return {
            key: obj.key,
            name: fileName,
            album: fileAlbum,
            size: obj.size,
            uploaded: obj.uploaded,
            type: obj.key.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 
                  obj.key.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'file'
          };
        });

        if (albumFilter) {
          objects = objects.filter(o => o.album === albumFilter);
        }

        return handleCORS(new Response(JSON.stringify({ objects }), {
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      // 5. 上传文件
      if (path === '/api/upload' && method === 'POST') {
        const formData = await request.formData();
        const file = formData.get('file');
        const album = formData.get('album');
        
        if (!file) return handleCORS(new Response(JSON.stringify({ error: 'No file' }), { status: 400 }));

        // 鉴权：上传需要有效的登录 token（普通用户或管理员）
        const upTok = bearerToken(request);
        const userTok = await makeToken('user', env.ACCESS_PASSWORD);
        const adminTok = await makeToken('admin', env.ADMIN_PASSWORD);
        if (upTok !== userTok && upTok !== adminTok) {
          return handleCORS(new Response(JSON.stringify({ error: '需要登录' }), { status: 401 }));
        }

        // 构建路径：AlbumName/filename
        const safeAlbum = album ? album.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_') : '未分类';
        const filename = file.name.replace(/[^a-zA-Z0-9.\u4e00-\u9fa5_-]/g, '_');
        const objectKey = `${safeAlbum}/${filename}`;

        await env.MY_BUCKET.put(objectKey, file.stream(), {
          httpMetadata: { contentType: file.type }
        });

        return handleCORS(new Response(JSON.stringify({ success: true, key: objectKey })));
      }

      // 6. 下载/预览文件
      if (path.startsWith('/file/') && method === 'GET') {
        const filename = decodeURIComponent(path.replace('/file/', ''));
        const object = await env.MY_BUCKET.get(filename);

        if (!object) return handleCORS(new Response('Not found', { status: 404 }));

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        
        // 如果是视频或图片，允许浏览器预览 (不设置 attachment)，但保留下载按钮由前端控制
        // 如果用户想强制下载所有，可取消下面这行注释
        // headers.set('Content-Disposition', `attachment; filename="${filename.split('/').pop()}"`);

        return new Response(object.body, { headers });
      }

      // 7. 删除文件 (仅管理员)
      if (path.startsWith('/file/') && method === 'DELETE') {
        // 鉴权：删除必须是管理员 token
        const delTok = bearerToken(request);
        const adminTok = await makeToken('admin', env.ADMIN_PASSWORD);
        if (delTok !== adminTok) {
          return handleCORS(new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403 }));
        }
        const filename = decodeURIComponent(path.replace('/file/', ''));
        await env.MY_BUCKET.delete(filename);
        return handleCORS(new Response(JSON.stringify({ success: true })));
      }

      return handleCORS(new Response('Not Found', { status: 404 }));

    } catch (e) {
      console.error(e);
      return handleCORS(new Response(JSON.stringify({ error: e.message }), { status: 500 }));
    }
  },
};

async function makeToken(role, password) {
  const data = new TextEncoder().encode(role + '|' + (password || ''));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function bearerToken(request) {
  const h = request.headers.get('Authorization') || '';
  return h.replace(/^Bearer\s+/i, '');
}

function handleCORS(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

function getHTML(env) {
  const title = "HUST电自814云相册";
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title}</title>
  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js"></script>
  <style>
    :root { --primary: #0070f3; --bg: #f5f5f5; --card: #ffffff; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; background: var(--bg); color: #333; }
    
    /* 登录层 */
    #login-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); }
    .login-box { background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 400px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
    .login-box h2 { margin-top: 0; color: var(--primary); }
    .login-box input { width: 100%; padding: 12px; margin: 15px 0; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; font-size: 16px; }
    .login-box button { width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; transition: 0.2s; }
    .login-box button:hover { opacity: 0.9; }

    /* 主界面 */
    header { background: white; padding: 15px 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; }
    h1 { margin: 0; font-size: 1.2rem; color: #333; }
    .header-actions { display: flex; gap: 10px; }
    .btn { padding: 8px 15px; border-radius: 6px; border: none; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 5px; }
    .btn-primary { background: var(--primary); color: white; }
    .btn-danger { background: #ff4444; color: white; }
    .btn-backup { background: #28a745; color: white; }

    /* 相册导航 */
    .album-nav { display: flex; overflow-x: auto; padding: 15px; gap: 10px; background: var(--bg); -webkit-overflow-scrolling: touch; }
    .album-tab { padding: 8px 16px; background: white; border-radius: 20px; white-space: nowrap; cursor: pointer; border: 1px solid #eee; transition: 0.2s; }
    .album-tab.active { background: var(--primary); color: white; border-color: var(--primary); }

    /* 上传区域 */
    .upload-area { margin: 15px; padding: 30px 20px; border: 2px dashed #ccc; background: white; border-radius: 12px; text-align: center; position: relative; }
    .upload-area.dragover { border-color: var(--primary); background: #f0f7ff; }
    #fileInput { display: none; }
    .progress-container { margin-top: 15px; display: none; }
    .progress-bar { width: 100%; height: 6px; background: #eee; border-radius: 3px; overflow: hidden; }
    .progress-fill { height: 100%; background: var(--primary); width: 0%; transition: width 0.3s; }
    .progress-text { font-size: 12px; color: #666; margin-top: 5px; }

    /* 网格布局 */
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 15px; padding: 15px; }
    @media (max-width: 600px) { .gallery { grid-template-columns: repeat(2, 1fr); } }
    
    .card { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.05); position: relative; aspect-ratio: 1; display: flex; flex-direction: column; }
    .media-wrapper { flex: 1; position: relative; overflow: hidden; background: #000; cursor: pointer; }
    .media-wrapper img, .media-wrapper video { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s; }
    .media-wrapper:hover img { transform: scale(1.05); }
    .video-icon { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 30px; color: white; opacity: 0.8; pointer-events: none; text-shadow: 0 2px 4px rgba(0,0,0,0.5); }
    
    .card-info { padding: 8px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #eee; }
    .card-actions { display: flex; gap: 5px; }
    .icon-btn { background: none; border: none; cursor: pointer; padding: 4px; color: #666; font-size: 16px; }
    .icon-btn:hover { color: var(--primary); }
    .icon-btn.delete:hover { color: #ff4444; }

    /* 全屏查看 */
    #viewer { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 2000; display: none; justify-content: center; align-items: center; flex-direction: column; }
    #viewer img, #viewer video { max-width: 100%; max-height: 80vh; object-fit: contain; }
    .viewer-controls { margin-top: 20px; display: flex; gap: 15px; }
    .close-viewer { position: absolute; top: 20px; right: 20px; color: white; font-size: 30px; cursor: pointer; }
  </style>
</head>
<body>

  <!-- 登录遮罩 -->
  <div id="login-overlay">
    <div class="login-box">
      <h2>🔐 ${title}</h2>
      <p style="color:#666;font-size:14px">请输入访问密码</p>
      <input type="password" id="passwordInput" placeholder="密码" />
      <button onclick="handleLogin()">进入相册</button>
      <p id="loginError" style="color:red;font-size:12px;display:none">密码错误</p>
    </div>
  </div>

  <!-- 主界面 -->
  <header>
    <h1>📸 ${title}</h1>
    <div class="header-actions">
      <button id="backupBtn" class="btn btn-backup" style="display:none" onclick="backupAll()">📦 一键备份</button>
      <button class="btn btn-primary" onclick="document.getElementById('fileInput').click()">☁️ 上传</button>
      <button class="btn" onclick="logout()">退出</button>
    </div>
  </header>

  <div class="album-nav" id="albumNav"></div>

  <div class="upload-area">
    <p style="margin:0;color:#666">点击或拖拽文件到此处上传至当前相册</p>
    <input type="file" id="fileInput" multiple accept="image/*,video/*" onchange="handleFiles(this.files)">
    <div class="progress-container" id="progressContainer">
      <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
      <div class="progress-text" id="progressText">准备上传...</div>
    </div>
  </div>

  <div class="gallery" id="gallery">
    <div style="grid-column:1/-1;text-align:center;padding:40px;color:#999">加载中...</div>
  </div>

  <!-- 全屏查看器 -->
  <div id="viewer">
    <span class="close-viewer" onclick="closeViewer()">&times;</span>
    <div id="viewerContent"></div>
    <div class="viewer-controls">
      <a id="downloadLink" class="btn btn-primary" download>⬇️ 下载原图</a>
    </div>
  </div>

<script>
  const API = '';
  let currentAlbum = '';
  let userRole = ''; // 'user' or 'admin'
  let userToken = '';
  let albums = [];

  // 初始化
  async function init() {
    const res = await fetch(API + '/api/config');
    const data = await res.json();
    albums = data.albums;
    renderAlbums();
    if(albums.length > 0) {
      currentAlbum = albums[0];
      loadFiles();
    }
  }

  function renderAlbums() {
    const nav = document.getElementById('albumNav');
    nav.innerHTML = albums.map((name, idx) => 
      \`<div class="album-tab \${idx===0?'active':''}" onclick="switchAlbum('\${name}', this)">\${name}</div>\`
    ).join('');
  }

  function switchAlbum(name, el) {
    currentAlbum = name;
    document.querySelectorAll('.album-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    loadFiles();
  }

  async function handleLogin() {
    const pwd = document.getElementById('passwordInput').value;
    try {
      const res = await fetch(API + '/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();
      if (res.ok) {
        userRole = data.role;
        userToken = data.token || '';
        document.getElementById('login-overlay').style.display = 'none';
        if (userRole === 'admin') {
          document.getElementById('backupBtn').style.display = 'flex';
        }
        init();
      } else {
        document.getElementById('loginError').style.display = 'block';
      }
    } catch (e) { alert('网络错误'); }
  }

  function logout() { location.reload(); }

  async function loadFiles() {
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px">加载中...</div>';
    
    try {
      const res = await fetch(API + '/api/list?album=' + encodeURIComponent(currentAlbum));
      const data = await res.json();
      gallery.innerHTML = '';
      
      if (data.objects.length === 0) {
        gallery.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#999;padding:20px">暂无文件</div>';
        return;
      }

      data.objects.forEach(obj => {
        const card = document.createElement('div');
        card.className = 'card';
        
        let mediaHtml = '';
        const viewUrl = API + '/file/' + encodeURIComponent(obj.key);
        
        if (obj.type === 'image') {
          mediaHtml = \`<div class="media-wrapper" onclick="openViewer('\${viewUrl}', 'image')">
            <img src="\${viewUrl}" loading="lazy" />
          </div>\`;
        } else if (obj.type === 'video') {
          mediaHtml = \`<div class="media-wrapper" onclick="openViewer('\${viewUrl}', 'video')">
            <video src="\${viewUrl}" preload="metadata"></video>
            <div class="video-icon">▶</div>
          </div>\`;
        } else {
          mediaHtml = \`<div class="media-wrapper" style="display:flex;align-items:center;justify-content:center;background:#eee;color:#666">📄 \${obj.name}</div>\`;
        }

        const deleteBtn = userRole === 'admin' ? \`<button class="icon-btn delete" onclick="deleteFile('\${encodeURIComponent(obj.key)}')">🗑️</button>\` : '';

        card.innerHTML = \`
          \${mediaHtml}
          <div class="card-info">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%" title="\${obj.name}">\${obj.name}</span>
            <div class="card-actions">
              <a href="\${viewUrl}" target="_blank" class="icon-btn">⬇️</a>
              \${deleteBtn}
            </div>
          </div>
        \`;
        gallery.appendChild(card);
      });
    } catch (e) { gallery.innerHTML = '加载失败'; }
  }

  function openViewer(url, type) {
    const viewer = document.getElementById('viewer');
    const content = document.getElementById('viewerContent');
    const dlLink = document.getElementById('downloadLink');
    
    content.innerHTML = type === 'image' 
      ? \`<img src="\${url}" />\` 
      : \`<video src="\${url}" controls autoplay />\`;
    
    dlLink.href = url;
    dlLink.download = ''; // 让浏览器决定文件名
    viewer.style.display = 'flex';
  }

  function closeViewer() { document.getElementById('viewer').style.display = 'none'; }

  async function deleteFile(key) {
    if (!confirm('确定删除？')) return;
    try {
      await fetch(API + '/file/' + key, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + userToken } });
      loadFiles();
    } catch (e) { alert('删除失败'); }
  }

  // 上传逻辑
  const dropZone = document.querySelector('.upload-area');
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });
  function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
  dropZone.addEventListener('dragover', () => dropZone.classList.add('dragover'));
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  async function handleFiles(files) {
    if (!files.length) return;
    const container = document.getElementById('progressContainer');
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    
    container.style.display = 'block';
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      text.innerText = \`正在上传 (\${i+1}/\${files.length}): \${file.name}\`;
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('album', currentAlbum);

      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', API + '/api/upload', true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + userToken);
        
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            fill.style.width = percent + '%';
            text.innerText = \`上传中: \${percent}% (\${file.name})\`;
          }
        };

        await new Promise((resolve, reject) => {
          xhr.onload = () => resolve();
          xhr.onerror = () => reject();
          xhr.send(formData);
        });
      } catch (err) {
        alert(\`上传失败: \${file.name}\`);
      }
    }
    
    fill.style.width = '100%';
    setTimeout(() => { container.style.display = 'none'; fill.style.width = '0%'; loadFiles(); }, 1000);
  }

  // 一键备份功能
  async function backupAll() {
    if (!confirm('开始备份所有文件到本地？大文件可能需要几分钟。')) return;
    
    const zip = new JSZip();
    const folderRoot = zip.folder("HUST_电自814_备份");
    
    alert('开始拉取文件列表...');
    
    try {
      // 获取所有文件
      const res = await fetch(API + '/api/list');
      const data = await res.json();
      const files = data.objects;
      
      if (files.length === 0) { alert('没有文件可备份'); return; }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const percent = Math.round(((i + 1) / files.length) * 100);
        document.getElementById('progressText').innerText = \`正在打包: \${file.name} (\${percent}%)\`;
        document.getElementById('progressContainer').style.display = 'block';
        document.getElementById('progressFill').style.width = percent + '%';

        // 获取文件二进制
        const blobRes = await fetch(API + '/file/' + encodeURIComponent(file.key));
        const blob = await blobRes.blob();
        
        // 添加到ZIP (保持相册文件夹结构)
        folderRoot.folder(file.album).file(file.name, blob);
      }

      document.getElementById('progressText').innerText = '生成压缩包中...';
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "HUST_电自814_备份_" + new Date().toISOString().slice(0,10) + ".zip");
      
      alert('备份完成！');
      document.getElementById('progressContainer').style.display = 'none';
    } catch (e) {
      alert('备份失败: ' + e.message);
      document.getElementById('progressContainer').style.display = 'none';
    }
  }
</script>
</body>
</html>
  `;
}
