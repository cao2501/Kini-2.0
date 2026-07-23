document.addEventListener('DOMContentLoaded', async () => {
  let currentUser = null;
  let activeGuildId = null;
  let activeModuleName = null;
  let socket = null;
  let rawModulesData = [];
  let currentCategory = 'all';
  let searchQuery = '';

  // Toast Notification Helper
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // 1. Check Auth & Load User Profile
  try {
    const userRes = await fetch('/auth/user');
    currentUser = await userRes.json();
    if (!currentUser) {
      window.location.href = '/';
      return;
    }
    
    document.getElementById('user-name').innerText = currentUser.username;
    if (currentUser.avatar) {
      document.getElementById('user-avatar').src = currentUser.avatar;
    }
  } catch (err) {
    window.location.href = '/';
    return;
  }

  // 2. Fetch System Stats
  async function loadStats() {
    try {
      const statsRes = await fetch('/api/stats');
      const stats = await statsRes.json();
      
      document.getElementById('ping-val').innerText = stats.ping;
      document.getElementById('modules-val').innerText = stats.modulesCount;
      document.getElementById('commands-val').innerText = stats.commandsCount;
      document.getElementById('ram-val').innerText = stats.ram?.heapUsed || '--';

      // Top metrics bar
      document.getElementById('top-ping-val').innerText = `${stats.ping} ms`;
      document.getElementById('top-modules-val').innerText = `${stats.modulesCount} Active`;
      document.getElementById('top-commands-val').innerText = `${stats.commandsCount} Total`;

      const maintenanceBtn = document.getElementById('btn-maintenance');
      if (stats.maintenanceMode) {
        maintenanceBtn.innerText = '🔧 Bảo Trì: ĐANG BẬT';
        maintenanceBtn.classList.add('active-warn');
      } else {
        maintenanceBtn.innerText = '🔧 Chế Độ Bảo Trì';
        maintenanceBtn.classList.remove('active-warn');
      }
    } catch {}
  }
  loadStats();
  setInterval(loadStats, 10000);

  // 3. Populate Guild Selector
  try {
    const guildsRes = await fetch('/api/guilds');
    const guilds = await guildsRes.json();
    const select = document.getElementById('server-select');
    select.innerHTML = '<option value="" disabled selected>-- Chọn máy chủ quản lý --</option>';
    
    guilds.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.innerText = g.inGuild ? `🎮 ${g.name}` : `➕ ${g.name} (Chưa mời bot)`;
      opt.dataset.inGuild = g.inGuild;
      opt.dataset.inviteUrl = g.inviteUrl;
      select.appendChild(opt);
    });
  } catch {}

  function getActiveTab() {
    const activeItem = document.querySelector('.nav-item.active');
    return activeItem ? activeItem.dataset.tab : 'config';
  }

  function loadActiveTabData(guildId) {
    const activeTab = getActiveTab();
    if (activeTab === 'config') {
      loadModules(guildId);
    } else if (activeTab === 'prefix') {
      loadPrefixSettings(guildId);
    }
  }

  // 4. Tab Navigation
  const navItems = document.querySelectorAll('.nav-item[data-tab]');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      const tabId = item.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      const targetTab = document.getElementById(`tab-${tabId}`);
      if (targetTab) targetTab.classList.add('active');

      if (activeGuildId) {
        loadActiveTabData(activeGuildId);
      }
    });
  });

  // 5. Handle Guild Selection Change
  const select = document.getElementById('server-select');
  select.addEventListener('change', async (e) => {
    const selectedOpt = select.options[select.selectedIndex];
    const guildId = selectedOpt.value;
    const inGuild = selectedOpt.dataset.inGuild === 'true';

    if (!inGuild) {
      window.open(selectedOpt.dataset.inviteUrl, '_blank');
      select.value = activeGuildId || '';
      return;
    }

    activeGuildId = guildId;
    document.getElementById('current-server-title').innerText = `Cấu hình cho máy chủ: ${selectedOpt.innerText.replace('🎮 ', '')}`;
    loadActiveTabData(guildId);
  });

  // Category & Search Helpers for Modules
  function getModuleCategory(name) {
    const n = name.toLowerCase();
    if (n.includes('antinuke') || n.includes('scam') || n.includes('verification')) return 'security';
    if (n.includes('moderation') || n.includes('logging') || n.includes('starboard')) return 'moderation';
    if (n.includes('economy') || n.includes('shop') || n.includes('premium')) return 'economy';
    if (n.includes('ai') || n.includes('music')) return 'ai';
    return 'utility';
  }

  function filterAndRenderModules() {
    const container = document.getElementById('modules-list');
    if (!rawModulesData.length) return;

    const filtered = rawModulesData.filter(m => {
      const cat = getModuleCategory(m.name);
      const matchCat = currentCategory === 'all' || cat === currentCategory;
      const matchSearch = !searchQuery || m.displayName.toLowerCase().includes(searchQuery) || m.name.toLowerCase().includes(searchQuery) || m.description.toLowerCase().includes(searchQuery);
      return matchCat && matchSearch;
    });

    container.innerHTML = '';
    if (!filtered.length) {
      container.innerHTML = '<p class="placeholder-text" style="color:var(--text-muted); padding:16px;">Không tìm thấy module phù hợp.</p>';
      return;
    }

    filtered.forEach(m => {
      const item = document.createElement('div');
      item.className = `module-item glass-item ${m.name === activeModuleName ? 'active' : ''}`;
      
      item.innerHTML = `
        <div class="module-info-row">
          <div class="module-title-desc">
            <span class="m-title">${m.displayName} ${m.premium ? '💎' : ''}</span>
            <span class="m-desc">${m.description}</span>
          </div>
        </div>
        <label class="switch">
          <input type="checkbox" id="toggle-${m.name}" ${m.enabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      `;

      const cb = item.querySelector(`input[type="checkbox"]`);
      cb.addEventListener('change', async (evt) => {
        try {
          const toggleRes = await fetch(`/api/guilds/${activeGuildId}/modules/${m.name}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: evt.target.checked })
          });
          const data = await toggleRes.json();
          if (data.success) {
            m.enabled = evt.target.checked;
            showToast(`Module ${m.displayName} đã ${m.enabled ? 'BẬT' : 'TẮT'}.`, 'success');
          } else {
            evt.target.checked = !evt.target.checked;
            showToast('Không thể lưu trạng thái module.', 'error');
          }
        } catch {
          evt.target.checked = !evt.target.checked;
          showToast('Lỗi kết nối mạng.', 'error');
        }
      });

      item.addEventListener('click', (event) => {
        if (event.target.tagName === 'INPUT' || event.target.className === 'slider' || event.target.className === 'switch') return;
        document.querySelectorAll('.module-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        selectModuleForEditing(m);
      });

      container.appendChild(item);
    });
  }

  // 6. Load Modules List for Guild
  async function loadModules(guildId) {
    const container = document.getElementById('modules-list');
    container.innerHTML = '<div class="loader">Đang tải danh sách modules...</div>';

    activeModuleName = null;
    document.getElementById('editing-module-name').innerText = 'Chưa chọn';
    document.getElementById('config-textarea').value = '';
    document.getElementById('config-textarea').disabled = true;
    document.getElementById('btn-save-config').disabled = true;
    document.getElementById('btn-format-json').disabled = true;

    try {
      const res = await fetch(`/api/guilds/${guildId}/modules`);
      rawModulesData = await res.json();
      filterAndRenderModules();
    } catch {
      container.innerHTML = '<div class="error-text">❌ Không thể tải danh sách modules.</div>';
    }
  }

  // Category Filter Button Clicks
  document.querySelectorAll('.cat-pill[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-pill[data-cat]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.cat;
      filterAndRenderModules();
    });
  });

  // Search Input Handler
  const searchInput = document.getElementById('module-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      filterAndRenderModules();
    });
  }

  // 7. Select a Module to Edit JSON Config
  function selectModuleForEditing(mod) {
    activeModuleName = mod.name;
    document.getElementById('editing-module-name').innerText = mod.displayName;

    const textarea = document.getElementById('config-textarea');
    textarea.value = JSON.stringify(mod.config, null, 2);
    textarea.disabled = false;

    document.getElementById('btn-save-config').disabled = false;
    document.getElementById('btn-format-json').disabled = false;
    document.getElementById('config-status-msg').innerText = '';
  }

  // Format JSON Button
  const formatBtn = document.getElementById('btn-format-json');
  if (formatBtn) {
    formatBtn.addEventListener('click', () => {
      const textarea = document.getElementById('config-textarea');
      try {
        const parsed = JSON.parse(textarea.value);
        textarea.value = JSON.stringify(parsed, null, 2);
        showToast('Đã định dạng JSON đẹp mắt!', 'success');
      } catch {
        showToast('Lỗi cú pháp JSON, không thể định dạng.', 'error');
      }
    });
  }

  // 8. Save Module Config
  const saveBtn = document.getElementById('btn-save-config');
  saveBtn.addEventListener('click', async () => {
    const textarea = document.getElementById('config-textarea');
    const msgSpan = document.getElementById('config-status-msg');

    let parsedConfig;
    try {
      parsedConfig = JSON.parse(textarea.value);
    } catch (err) {
      msgSpan.innerText = '❌ JSON không đúng định dạng!';
      msgSpan.className = 'status-msg error';
      showToast('Cú pháp JSON không hợp lệ!', 'error');
      return;
    }

    msgSpan.innerText = '🔄 Đang lưu...';
    msgSpan.className = 'status-msg';

    try {
      const res = await fetch(`/api/guilds/${activeGuildId}/modules/${activeModuleName}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: parsedConfig })
      });
      const data = await res.json();
      if (data.success) {
        msgSpan.innerText = '✅ Đã lưu cấu hình!';
        msgSpan.className = 'status-msg success';
        showToast(`Đã lưu cấu hình module ${activeModuleName}!`, 'success');
        
        // Update local object config
        const target = rawModulesData.find(m => m.name === activeModuleName);
        if (target) target.config = parsedConfig;
      } else {
        msgSpan.innerText = `❌ Lỗi: ${data.error}`;
        msgSpan.className = 'status-msg error';
        showToast(`Lỗi: ${data.error}`, 'error');
      }
    } catch {
      msgSpan.innerText = '❌ Lỗi kết nối mạng.';
      msgSpan.className = 'status-msg error';
      showToast('Lỗi kết nối mạng.', 'error');
    }
  });

  // 9. Web Socket Live Log Terminal
  socket = io();
  const terminal = document.getElementById('log-terminal');
  let currentLogLevel = 'all';

  if (socket && terminal) {
    socket.on('log_message', (log) => {
      if (currentLogLevel !== 'all' && log.level.toLowerCase() !== currentLogLevel) return;

      const p = document.createElement('div');
      p.className = `log-line`;
      
      const timeStr = log.timestamp ? log.timestamp.slice(11, 19) : new Date().toLocaleTimeString();
      const levelClass = log.level === 'error' ? 'log-level-error' : log.level === 'warn' ? 'log-level-warn' : 'log-level-info';
      
      p.innerHTML = `
        <span class="log-time">[${timeStr}]</span>
        <span class="log-module">${log.module || 'system'}</span>
        <span class="log-level ${levelClass}">${(log.level || 'INFO').toUpperCase()}</span>
        <span class="log-msg">${log.message}</span>
      `;
      
      terminal.appendChild(p);

      const autoscroll = document.getElementById('chk-autoscroll');
      if (autoscroll && autoscroll.checked) {
        terminal.scrollTop = terminal.scrollHeight;
      }

      if (terminal.children.length > 300) {
        terminal.removeChild(terminal.firstChild);
      }
    });
  }

  document.querySelectorAll('.log-level-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.log-level-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentLogLevel = pill.dataset.level;
    });
  });

  const clearLogsBtn = document.getElementById('btn-clear-logs');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      terminal.innerHTML = '<div class="log-line"><span class="log-time">[System]</span><span class="log-module">dashboard</span><span class="log-level log-level-info">INFO</span><span class="log-msg">Terminal logs cleared.</span></div>';
      showToast('Đã xóa danh sách logs.', 'info');
    });
  }

  // 10. Toggle Maintenance Mode
  const maintenanceBtn = document.getElementById('btn-maintenance');
  if (maintenanceBtn) {
    maintenanceBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/owner/maintenance', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          loadStats();
          showToast(`Chế độ bảo trì đã ${data.maintenanceMode ? 'BẬT' : 'TẮT'}.`, 'success');
        } else {
          showToast(`Lỗi: ${data.error || 'Quyền hạn bị từ chối'}`, 'error');
        }
      } catch {
        showToast('Không thể kết nối đến server.', 'error');
      }
    });
  }

  // 11. Prefix Settings & Live Preview
  async function loadPrefixSettings(guildId) {
    try {
      const res = await fetch(`/api/guilds/${guildId}/prefix`);
      if (!res.ok) return;
      const data = await res.json();
      const prefixInput = document.getElementById('prefix-input');
      if (prefixInput) {
        prefixInput.value = data.globalPrefix || 'kn';
        updatePrefixPreview(prefixInput.value);
      }
    } catch {}
  }

  function updatePrefixPreview(val) {
    const pTag = document.getElementById('preview-prefix-tag');
    const pEx = document.getElementById('preview-cmd-example');
    if (pTag) pTag.innerText = val || 'kn';
    if (pEx) pEx.innerText = val || 'kn';
  }

  const prefixInput = document.getElementById('prefix-input');
  if (prefixInput) {
    prefixInput.addEventListener('input', (e) => {
      updatePrefixPreview(e.target.value);
    });
  }

  const savePrefixBtn = document.getElementById('btn-save-prefix');
  if (savePrefixBtn) {
    savePrefixBtn.addEventListener('click', async () => {
      const prefix = document.getElementById('prefix-input').value.trim();
      if (!prefix || !activeGuildId) return;
      try {
        const res = await fetch(`/api/guilds/${activeGuildId}/prefix/global`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Đã lưu Prefix mới: ${prefix}`, 'success');
        } else {
          showToast(`Lỗi: ${data.error}`, 'error');
        }
      } catch {
        showToast('Lỗi kết nối mạng khi lưu Prefix.', 'error');
      }
    });
  }

  // 12. Discord CDN Image Upload Helper Widget
  const fileInput = document.getElementById('upload-image-file');
  const triggerBtn = document.getElementById('btn-trigger-upload');
  const urlInput = document.getElementById('uploaded-image-url');
  const copyBtn = document.getElementById('btn-copy-uploaded-url');
  const uploadStatus = document.getElementById('upload-status-msg');

  if (triggerBtn && fileInput) {
    triggerBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
      if (!fileInput.files.length) return;
      const file = fileInput.files[0];

      uploadStatus.innerText = '🔄 Đang tải ảnh lên Discord CDN...';
      uploadStatus.className = 'status-msg';
      urlInput.value = '';
      copyBtn.disabled = true;
      triggerBtn.disabled = true;

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
          urlInput.value = data.url;
          copyBtn.disabled = false;
          triggerBtn.disabled = false;
          uploadStatus.innerText = '✅ Tải ảnh thành công!';
          uploadStatus.className = 'status-msg success';
          showToast('Đã tải ảnh lên Discord CDN thành công!', 'success');
        } else {
          triggerBtn.disabled = false;
          uploadStatus.innerText = `❌ Lỗi: ${data.error || 'Không rõ nguyên nhân'}`;
          uploadStatus.className = 'status-msg error';
          showToast(`Lỗi: ${data.error}`, 'error');
        }
      } catch {
        triggerBtn.disabled = false;
        uploadStatus.innerText = '❌ Lỗi kết nối mạng khi tải ảnh.';
        uploadStatus.className = 'status-msg error';
        showToast('Lỗi kết nối mạng.', 'error');
      }
    });
  }

  if (copyBtn && urlInput) {
    copyBtn.addEventListener('click', () => {
      urlInput.select();
      navigator.clipboard.writeText(urlInput.value);
      showToast('Đã copy Link ảnh Discord CDN vào bộ nhớ tạm!', 'success');
    });
  }
});
