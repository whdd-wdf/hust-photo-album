// 由 public/index.html 生成，勿手改。运行: node scripts/gen_home.mjs
export const HOME_HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>HUST电自814云相册</title>
  <style>
    :root { --primary: #3b82f6; --danger: #ef4444; --bg: #f3f4f6; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; background: var(--bg); color: #333; }
    
    /* 登录层 */
    #login-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); }
    .login-box { background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 400px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
    .login-box h2 { margin-top: 0; color: var(--primary); }
    .login-box input { width: 100%; padding: 12px; margin: 15px 0; border: 2px solid #ddd; border-radius: 8px; font-size: 16px; box-sizing: border-box; }
    .login-box button { width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; }
    .login-box button:active { transform: scale(0.98); }
    .error-msg { color: var(--danger); font-size: 14px; display: none; margin-bottom: 10px; }

    /* 主界面 */
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header { text-align: center; margin-bottom: 20px; }
    h1 { color: #1f2937; font-size: 1.5rem; margin-bottom: 5px; }
    .user-info { font-size: 0.9rem; color: #666; display: flex; justify-content: space-between; align-items: center; }
    .logout-btn { background: none; border: 1px solid #ccc; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }

    /* 相册选择 */
    .album-selector { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 10px; margin-bottom: 20px; -webkit-overflow-scrolling: touch; }
    .album-chip { padding: 8px 16px; background: white; border-radius: 20px; white-space: nowrap; cursor: pointer; border: 1px solid #ddd; font-size: 14px; transition: 0.2s; }
    .album-chip.active { background: var(--primary); color: white; border-color: var(--primary); }

    /* 上传区域 */
    .upload-area { border: 2px dashed #cbd5e1; padding: 30px 20px; text-align: center; background: white; border-radius: 12px; cursor: pointer; transition: 0.2s; position: relative; }
    .upload-area:hover { border-color: var(--primary); background: #eff6ff; }
    #fileInput { display: none; }
    .progress-container { margin-top: 15px; display: none; }
    .progress-bar { width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; background: var(--primary); width: 0%; transition: width 0.3s ease; }
    .progress-text { font-size: 13px; color: #666; margin-top: 5px; text-align: right; }

    /* 画廊网格 */
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px; }
    @media (min-width: 768px) { .gallery { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; } }
    
    .card { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.05); position: relative; transition: transform 0.2s; }
    .card:hover { transform: translateY(-3px); box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
    .media-wrapper { position: relative; width: 100%; padding-top: 100%; /* 1:1 Aspect Ratio */ background: #f9fafb; }
    .media-wrapper img, .media-wrapper video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
    
    .card-actions { padding: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #666; }
    .file-name { max-width: 70%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .action-btns { display: flex; gap: 5px; }
    .btn-sm { padding: 4px 8px; border-radius: 4px; border: none; font-size: 11px; cursor: pointer; background: #f3f4f6; color: #374151; }
    .btn-view { background: #e0e7ff; color: var(--primary); }
    .btn-save { background: #d1fae5; color: #065f46; }
    .btn-del { background: #fee2e2; color: var(--danger); }

    /* 提示框 */
    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: white; padding: 10px 20px; border-radius: 20px; font-size: 14px; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 10000; }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>

  <!-- 登录遮罩 -->
  <div id="login-overlay">
    <div class="login-box">
      <h2>HUST电自814<br>云相册登录</h2>
      <p style="font-size:13px; color:#666;">请输入访问密码或管理密码</p>
      <input type="password" id="passwordInput" placeholder="输入密码..." autocomplete="off">
      <div class="error-msg" id="loginError">密码错误，请重试</div>
      <button onclick="doLogin()" id="loginBtn">进入相册</button>
    </div>
  </div>

  <!-- 主内容 -->
  <div class="container" id="main-content" style="display:none; filter: blur(5px);">
    <header>
      <h1>HUST电自814云相册</h1>
      <div class="user-info">
        <span id="userRoleDisplay">身份：未知</span>
        <button class="logout-btn" onclick="logout()">退出登录</button>
      </div>
    </header>

    <!-- 相册切换 -->
    <div class="album-selector" id="albumList">
      <!-- 由 JS 生成 -->
    </div>

    <!-- 上传区 -->
    <div class="upload-area" onclick="document.getElementById('fileInput').click()">
      <div style="font-size:24px; margin-bottom:10px;">☁️</div>
      <div style="font-weight:bold; color:#4b5563;">点击上传 照片/视频</div>
      <div style="font-size:12px; color:#9ca3af; margin-top:5px;">当前相册：<span id="currentAlbumName" style="color:var(--primary); font-weight:bold;"></span></div>
      <input type="file" id="fileInput" multiple accept="image/*,video/*">
      
      <div class="progress-container" id="progressContainer">
        <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
        <div class="progress-text" id="progressText">准备上传...</div>
      </div>
    </div>

    <!-- 文件列表 -->
    <div class="gallery" id="gallery" style="margin-top:25px;">
      <!-- 文件卡片 -->
    </div>
  </div>

  <div class="toast" id="toast">操作成功</div>

  <script>
    const API_BASE = window.location.origin;
    let currentUserRole = 'none'; // 'user' or 'admin'
    let authToken = '';           // /api/auth 返回的 token，上传/删除时携带
    let currentAlbum = '很久以前'; // 默认第一个
    const allAlbums = ["很久以前","历经沧桑","刚刚发生","风趣见闻","动感地带"];

    // 初始化
    window.onload = function() {
      document.getElementById('passwordInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') doLogin();
      });
      renderAlbums();
    };

    // 登录逻辑
    async function doLogin() {
      const pwd = document.getElementById('passwordInput').value;
      const btn = document.getElementById('loginBtn');
      const err = document.getElementById('loginError');
      
      if(!pwd) return;
      
      btn.disabled = true;
      btn.textContent = '验证中...';
      err.style.display = 'none';

      try {
        const res = await fetch(API_BASE + '/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        });
        const data = await res.json();
        
        if (data.success) {
          currentUserRole = data.role;
          authToken = data.token || '';
          document.getElementById('login-overlay').style.display = 'none';
          document.getElementById('main-content').style.display = 'block';
          document.getElementById('main-content').style.filter = 'none';
          
          document.getElementById('userRoleDisplay').textContent = 
            currentUserRole === 'admin' ? '身份：管理员 (可删除)' : '身份：访客 (可上传/下载)';
          
          loadFiles();
          showToast('登录成功');
        } else {
          err.textContent = data.error || '密码错误，请重试';
          err.style.display = 'block';
          btn.disabled = false;
          btn.textContent = '进入相册';
        }
      } catch (e) {
        err.textContent = '网络错误: ' + e.message;
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '进入相册';
      }
    }

    function logout() {
      location.reload();
    }

    // 渲染相册标签
    function renderAlbums() {
      const container = document.getElementById('albumList');
      container.innerHTML = '';
      allAlbums.forEach(album => {
        const chip = document.createElement('div');
        chip.className = 'album-chip' + (album === currentAlbum ? ' active' : '');
        chip.textContent = album;
        chip.onclick = () => {
          currentAlbum = album;
          document.getElementById('currentAlbumName').textContent = album;
          renderAlbums(); // 重新渲染以更新高亮
          loadFiles();
        };
        container.appendChild(chip);
      });
      document.getElementById('currentAlbumName').textContent = currentAlbum;
    }

    // 加载文件
    async function loadFiles() {
      const gallery = document.getElementById('gallery');
      gallery.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#999;">加载中...</div>';
      
      try {
        const res = await fetch(API_BASE + '/api/list');
        const data = await res.json();
        
        // 过滤当前相册的文件（R2 key 格式 "相册名/文件名"）
        const files = data.objects.filter(obj => obj.key.startsWith(currentAlbum + '/'));
        
        gallery.innerHTML = '';
        if (files.length === 0) {
          gallery.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#999;">此相册暂无内容</div>';
          return;
        }

        files.forEach(obj => {
          const fileName = obj.key.split('/').pop();
          const encodedKey = encodeURIComponent(obj.key);
          const fileUrl = API_BASE + '/file/' + encodedKey;
          
          let mediaHtml = '';
          if (obj.type === 'image') {
            mediaHtml = \`<img src="\${fileUrl}" loading="lazy" onclick="window.open('\${fileUrl}')">\`;
          } else if (obj.type === 'video') {
            // 视频封面：hover 播放预览
            mediaHtml = \`
              <div style="width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center;">
                <span style="font-size:40px;">▶️</span>
              </div>
              <video src="\${fileUrl}" preload="metadata" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;" onmouseenter="this.style.opacity=1;this.play()" onmouseleave="this.style.opacity=0;this.pause()"></video>
            \`;
          } else {
            mediaHtml = \`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f3f4f6;font-size:36px;">📄</div>\`;
          }

          const deleteBtn = currentUserRole === 'admin' 
            ? \`<button class="btn-sm btn-del" onclick="deleteFile('\${encodedKey}')">删除</button>\` 
            : '';

          const card = document.createElement('div');
          card.className = 'card';
          card.innerHTML = \`
            <div class="media-wrapper">
              \${mediaHtml}
            </div>
            <div class="card-actions">
              <span class="file-name" title="\${fileName}">\${fileName}</span>
              <div class="action-btns">
                <a href="\${fileUrl}" target="_blank" class="btn-sm btn-view">查看</a>
                <a href="\${fileUrl}" download class="btn-sm btn-dl">下载</a>
                <button class="btn-sm btn-save" onclick="saveToAlbum(, )">存相册</button>
                \${deleteBtn}
              </div>
            </div>
          \`;
          gallery.appendChild(card);
        });
      } catch (e) {
        gallery.innerHTML = '<div style="color:red;text-align:center;">加载失败:' + e.message + '</div>';
      }
    }

    // 存到手机相册：用系统分享接口调起"保存图片"
    async function saveToAlbum(fileUrl, fileName) {
      try {
        const resp = await fetch(fileUrl);
        const blob = await resp.blob();
        const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: fileName });
        } else {
          // 不支持分享接口则新开标签页，用户长按保存
          window.open(fileUrl, '_blank');
        }
      } catch (e) {
        if (e.name !== 'AbortError') alert('保存失败：' + e.message);
      }
    }

    // 上传逻辑
    document.getElementById('fileInput').addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files.length) return;

      const progressContainer = document.getElementById('progressContainer');
      const progressFill = document.getElementById('progressFill');
      const progressText = document.getElementById('progressText');
      
      progressContainer.style.display = 'block';
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('album', currentAlbum);

        progressText.textContent = \`正在上传 (\${i+1}/\${files.length}): \${file.name}\`;
        progressFill.style.width = '0%';

        try {
          await uploadWithProgress(formData, (percent) => {
            progressFill.style.width = percent + '%';
            progressText.textContent = \`上传中... \${Math.round(percent)}%\`;
          });
          
          showToast(file.name + ' 上传成功');
        } catch (err) {
          alert('上传失败: ' + file.name + ' (' + err.message + ')');
          console.error(err);
          return;
        }
      }
      
      setTimeout(() => { progressContainer.style.display = 'none'; }, 1000);
      e.target.value = ''; // 重置
      loadFiles();
    });

    // 带进度的上传函数（携带登录 token）
    function uploadWithProgress(formData, onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', API_BASE + '/api/upload', true);
        if (authToken) xhr.setRequestHeader('Authorization', 'Bearer ' + authToken);
        
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            onProgress(percentComplete);
          }
        };
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            let msg = 'HTTP ' + xhr.status;
            try { msg = JSON.parse(xhr.responseText).error || msg; } catch (_) {}
            reject(new Error(msg));
          }
        };
        
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(formData);
      });
    }

    // 删除逻辑（携带 admin token）
    async function deleteFile(encodedKey) {
      if (!confirm('确定要删除这个文件吗？此操作不可恢复。')) return;
      
      try {
        const res = await fetch(API_BASE + '/file/' + encodedKey, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        if (res.ok) {
          showToast('删除成功');
          loadFiles();
        } else {
          let msg = '删除失败';
          try { msg = (await res.json()).error || msg; } catch (_) {}
          alert(msg);
        }
      } catch (e) {
        alert('出错: ' + e.message);
      }
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  </script>
</body>
</html>

`;
