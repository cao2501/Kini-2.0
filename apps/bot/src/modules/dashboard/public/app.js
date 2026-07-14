document.addEventListener('DOMContentLoaded', async () => {
  let currentUser = null;
  let activeGuildId = null;
  let activeModuleName = null;
  let socket = null;

  // 1. Check Auth & Load profile
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
    } else {
      document.getElementById('user-avatar').src = 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
  } catch (err) {
    window.location.href = '/';
    return;
  }

  // 2. Fetch system stats
  async function loadStats() {
    try {
      const statsRes = await fetch('/api/stats');
      const stats = await statsRes.json();
      document.getElementById('ping-val').innerText = stats.ping;
      document.getElementById('modules-val').innerText = stats.modulesCount;
      document.getElementById('commands-val').innerText = stats.commandsCount;

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
  setInterval(loadStats, 10000); // refresh stats every 10s

  // 3. Populate Guild selector
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

  // Helper to get currently active tab
  function getActiveTab() {
    const activeItem = document.querySelector('.nav-item.active');
    return activeItem ? activeItem.dataset.tab : 'config';
  }

  // Helper to load data based on active tab
  function loadActiveTabData(guildId) {
    const activeTab = getActiveTab();
    if (activeTab === 'config') {
      loadModules(guildId);
    } else if (activeTab === 'prefix') {
      loadPrefixSettings(guildId);
    } else if (activeTab === 'permissions') {
      loadPermissionsSettings(guildId);
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
      document.getElementById(`tab-${tabId}`).classList.add('active');

      if (activeGuildId) {
        loadActiveTabData(activeGuildId);
      }
    });
  });

  // 5. Handle Guild change selection
  const select = document.getElementById('server-select');
  select.addEventListener('change', async (e) => {
    const selectedOpt = select.options[select.selectedIndex];
    const guildId = selectedOpt.value;
    const inGuild = selectedOpt.dataset.inGuild === 'true';

    if (!inGuild) {
      window.open(selectedOpt.dataset.inviteUrl, '_blank');
      select.value = activeGuildId || ''; // revert select state
      return;
    }

    activeGuildId = guildId;
    document.getElementById('current-server-title').innerText = `Cấu hình cho máy chủ: ${selectedOpt.innerText.replace('🎮 ', '')}`;
    
    // Dynamically load data for whichever tab is currently active
    loadActiveTabData(guildId);
  });

  // 6. Load modules lists for guild
  async function loadModules(guildId) {
    const container = document.getElementById('modules-list');
    container.innerHTML = '<div class="loader">Đang tải danh sách modules...</div>';

    // Reset editor
    activeModuleName = null;
    document.getElementById('editing-module-name').innerText = 'Chưa chọn';
    document.getElementById('config-textarea').value = '';
    document.getElementById('config-textarea').disabled = true;
    document.getElementById('btn-save-config').disabled = true;

    try {
      const res = await fetch(`/api/guilds/${guildId}/modules`);
      const modules = await res.json();
      
      container.innerHTML = '';
      modules.forEach(m => {
        const item = document.createElement('div');
        item.className = 'module-item glass-item';
        if (m.premium) item.classList.add('premium-module');

        item.innerHTML = `
          <div class="module-info-row">
            <div class="module-title-desc">
              <span class="m-title">${m.displayName} ${m.premium ? '💎' : ''}</span>
              <span class="m-desc">${m.description}</span>
            </div>
            <label class="switch">
              <input type="checkbox" id="toggle-${m.name}" ${m.enabled ? 'checked' : ''}>
              <span class="slider round"></span>
            </label>
          </div>
        `;

        // Checkbox toggle logic
        const cb = item.querySelector(`input[type="checkbox"]`);
        cb.addEventListener('change', async (evt) => {
          try {
            const toggleRes = await fetch(`/api/guilds/${guildId}/modules/${m.name}/toggle`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled: evt.target.checked })
            });
            const data = await toggleRes.json();
            if (!data.success) {
              evt.target.checked = !evt.target.checked; // revert
              alert('Không thể lưu cài đặt.');
            }
          } catch {
            evt.target.checked = !evt.target.checked; // revert
          }
        });

        // Click row to edit config (avoid trigger when clicking toggle)
        item.addEventListener('click', (event) => {
          if (event.target.tagName === 'INPUT' || event.target.className === 'slider round' || event.target.className === 'switch') {
            return;
          }
          
          document.querySelectorAll('.module-item').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          
          selectModuleForEditing(m);
        });

        container.appendChild(item);
      });
    } catch {
      container.innerHTML = '<div class="error-text">❌ Không thể tải danh sách modules.</div>';
    }
  }

  // 7. Select a module to show JSON config
  function selectModuleForEditing(mod) {
    activeModuleName = mod.name;
    document.getElementById('editing-module-name').innerText = mod.displayName;

    const textarea = document.getElementById('config-textarea');
    textarea.value = JSON.stringify(mod.config, null, 2);
    textarea.disabled = false;

    document.getElementById('btn-save-config').disabled = false;
    document.getElementById('config-status-msg').innerText = '';
  }

  // 8. Save module config
  const saveBtn = document.getElementById('btn-save-config');
  saveBtn.addEventListener('click', async () => {
    const textarea = document.getElementById('config-textarea');
    const msgSpan = document.getElementById('config-status-msg');

    let parsedConfig;
    try {
      parsedConfig = JSON.parse(textarea.value);
    } catch (err) {
      msgSpan.innerText = '❌ JSON không đúng định dạng!';
      msgSpan.className = 'status-msg err';
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
        msgSpan.className = 'status-msg ok';
        
        // Refresh local module data in list
        loadModules(activeGuildId);
      } else {
        msgSpan.innerText = `❌ Lỗi: ${data.error}`;
        msgSpan.className = 'status-msg err';
      }
    } catch {
      msgSpan.innerText = '❌ Lỗi kết nối mạng.';
      msgSpan.className = 'status-msg err';
    }
  });

  // 9. Web Socket Live Log Stream
  socket = io();
  const terminal = document.getElementById('terminal-output');
  
  socket.on('log_message', (log) => {
    const p = document.createElement('p');
    p.className = `log-line log-${log.level}`;
    
    const timeSpan = `<span class="log-time">[${log.timestamp.slice(11, 19)}]</span>`;
    const levelSpan = `<span class="log-lvl">${log.level.toUpperCase()}</span>`;
    const modSpan = `<span class="log-mod">[${log.module}]</span>`;
    
    p.innerHTML = `${timeSpan} ${levelSpan} ${modSpan} ${log.message}`;
    
    terminal.appendChild(p);
    
    // Auto-scroll to bottom if close
    terminal.scrollTop = terminal.scrollHeight;

    // Truncate screen if too many lines
    if (terminal.children.length > 500) {
      terminal.removeChild(terminal.firstChild);
    }
  });

  document.getElementById('btn-clear-logs').addEventListener('click', () => {
    terminal.innerHTML = '<span class="term-system">[Dashboard] Terminal cleared. Waiting for new logs...</span>';
  });

  // 10. Toggle Maintenance Mode (Owner only)
  document.getElementById('btn-maintenance').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/owner/maintenance', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        loadStats();
        alert(`Chế độ bảo trì đã ${data.maintenanceMode ? 'BẬT' : 'TẮT'}.`);
      } else {
        alert(`Lỗi: ${data.error || 'Quyền hạn bị từ chối'}`);
      }
    } catch {
      alert('Không thể kết nối đến server.');
    }
  });

  // 11. PREFIX / ALIAS PANEL ─────────────────────────────────────────────────

  let prefixData = null; // { globalPrefix, aliases, commands }

  // Load prefix settings for a guild
  async function loadPrefixSettings(guildId) {
    document.getElementById('alias-list').innerHTML = '<div class="loader">Đang tải...</div>';
    try {
      const res = await fetch(`/api/guilds/${guildId}/prefix`);
      if (!res.ok) return;
      prefixData = await res.json();

      // Update global prefix UI
      const globalInput = document.getElementById('global-prefix-input');
      const globalBadge = document.getElementById('global-prefix-badge');
      const aliasBadge  = document.getElementById('alias-prefix-preview');

      globalInput.value = prefixData.globalPrefix;
      globalBadge.textContent = prefixData.globalPrefix;
      aliasBadge.textContent = prefixData.globalPrefix;
      document.getElementById('current-global-prefix').textContent = prefixData.globalPrefix;
      document.getElementById('btn-save-global-prefix').disabled = false;

      // Populate command select
      const cmdSelect = document.getElementById('new-alias-command');
      cmdSelect.innerHTML = '<option value="">-- Chọn lệnh --</option>';
      prefixData.commands.forEach(cmd => {
        const opt = document.createElement('option');
        opt.value = cmd.name;
        opt.textContent = `/${cmd.name}`;
        opt.dataset.subcommands = JSON.stringify(cmd.subcommands);
        cmdSelect.appendChild(opt);
      });
      document.getElementById('btn-add-alias').disabled = false;

      // Render alias table
      renderAliasList();
    } catch {
      document.getElementById('alias-list').innerHTML = '<p class="placeholder-text">❌ Lỗi tải dữ liệu.</p>';
    }
  }

  // Render the alias rows
  function renderAliasList() {
    const container = document.getElementById('alias-list');
    const aliases = prefixData?.aliases ?? {};
    const keys = Object.keys(aliases);
    if (!keys.length) {
      container.innerHTML = '<p class="placeholder-text">Chưa có alias nào. Thêm alias ở form bên trên.</p>';
      return;
    }
    container.innerHTML = '';
    keys.sort().forEach(key => {
      const { command, subcommand } = aliases[key];
      const globalPrefix = prefixData.globalPrefix;
      const example = `${globalPrefix}${key}`;
      const slashEquiv = subcommand ? `/${command} ${subcommand}` : `/${command}`;

      const row = document.createElement('div');
      row.className = 'alias-row';
      row.innerHTML = `
        <span class="alias-key"><code>${globalPrefix}${key}</code></span>
        <span class="alias-sep">→</span>
        <span class="alias-cmd"><code>/${command}</code></span>
        <span class="alias-sub">${subcommand ? `<code>${subcommand}</code>` : '<span class="alias-none">—</span>'}</span>
        <span class="alias-example">
          <code>${example}</code>
          <span class="alias-equiv">≡ <code>${slashEquiv}</code></span>
        </span>
        <button class="alias-delete-btn" data-key="${key}" title="Xoá alias này">🗑️</button>
      `;

      row.querySelector('.alias-delete-btn').addEventListener('click', async () => {
        if (!confirm(`Xoá alias "${key}"?`)) return;
        try {
          const res = await fetch(`/api/guilds/${activeGuildId}/prefix/alias/${encodeURIComponent(key)}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            delete prefixData.aliases[key];
            renderAliasList();
            showAliasStatus(`✅ Đã xoá alias "${key}"`);
          } else {
            showAliasStatus('❌ ' + (data.error || 'Lỗi xoá'), true);
          }
        } catch { showAliasStatus('❌ Lỗi kết nối.', true); }
      });

      container.appendChild(row);
    });
  }

  function showAliasStatus(msg, isErr = false) {
    const span = document.getElementById('alias-form-status');
    span.textContent = msg;
    span.className = 'status-msg ' + (isErr ? 'err' : 'ok');
    setTimeout(() => { span.textContent = ''; span.className = 'status-msg'; }, 3500);
  }

  // ── Form interactions ──────────────────────────────────────────────────────

  // Global prefix live badge
  document.getElementById('global-prefix-input').addEventListener('input', () => {
    const val = document.getElementById('global-prefix-input').value || '!';
    document.getElementById('global-prefix-badge').textContent = val;
    document.getElementById('alias-prefix-preview').textContent = val;
  });

  // Save global prefix
  document.getElementById('btn-save-global-prefix').addEventListener('click', async () => {
    const prefix = document.getElementById('global-prefix-input').value.trim();
    if (!prefix || !activeGuildId) return;
    try {
      const res = await fetch(`/api/guilds/${activeGuildId}/prefix/global`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix })
      });
      const data = await res.json();
      if (data.success) {
        prefixData.globalPrefix = prefix;
        document.getElementById('current-global-prefix').textContent = prefix;
        document.getElementById('global-prefix-badge').textContent = prefix;
        document.getElementById('alias-prefix-preview').textContent = prefix;
        showAliasStatus(`✅ Đã lưu prefix tổng: "${prefix}"`);
        renderAliasList(); // re-render to update example column
      } else {
        showAliasStatus('❌ ' + (data.error || 'Lỗi'), true);
      }
    } catch { showAliasStatus('❌ Lỗi kết nối.', true); }
  });

  // Command select → populate subcommand select
  document.getElementById('new-alias-command').addEventListener('change', (e) => {
    const selected = e.target.options[e.target.selectedIndex];
    const subcmdSelect = document.getElementById('new-alias-subcommand');
    subcmdSelect.innerHTML = '<option value="">-- Không có --</option>';

    if (!selected.value) {
      subcmdSelect.disabled = true;
      return;
    }
    const subs = JSON.parse(selected.dataset.subcommands || '[]');
    if (subs.length > 0) {
      subs.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        subcmdSelect.appendChild(opt);
      });
      subcmdSelect.disabled = false;
    } else {
      subcmdSelect.disabled = true;
    }
  });

  // Add alias
  document.getElementById('btn-add-alias').addEventListener('click', async () => {
    const alias = document.getElementById('new-alias-text').value.trim().toLowerCase().replace(/\s+/g, '');
    const command = document.getElementById('new-alias-command').value;
    const subcommand = document.getElementById('new-alias-subcommand').value;

    if (!alias) { showAliasStatus('❌ Nhập tên alias.', true); return; }
    if (!command) { showAliasStatus('❌ Chọn lệnh slash.', true); return; }
    if (!activeGuildId) { showAliasStatus('❌ Chưa chọn server.', true); return; }

    try {
      const res = await fetch(`/api/guilds/${activeGuildId}/prefix/alias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias, command, subcommand: subcommand || undefined })
      });
      const data = await res.json();
      if (data.success) {
        prefixData.aliases[alias] = { command, ...(subcommand ? { subcommand } : {}) };
        renderAliasList();
        showAliasStatus(`✅ Đã thêm: ${prefixData.globalPrefix}${alias} → /${command}${subcommand ? ' ' + subcommand : ''}`);
        document.getElementById('new-alias-text').value = '';
        document.getElementById('new-alias-command').value = '';
        document.getElementById('new-alias-subcommand').innerHTML = '<option value="">-- Không có --</option>';
        document.getElementById('new-alias-subcommand').disabled = true;
      } else {
        showAliasStatus('❌ ' + (data.error || 'Lỗi'), true);
      }
    } catch { showAliasStatus('❌ Lỗi kết nối.', true); }
  });

  // 12. IMAGE UPLOAD CDN HELPER ───────────────────────────────────────────────

  const fileInput = document.getElementById('upload-image-file');
  const triggerBtn = document.getElementById('btn-trigger-upload');
  const urlInput = document.getElementById('uploaded-image-url');
  const copyBtn = document.getElementById('btn-copy-uploaded-url');
  const uploadStatus = document.getElementById('upload-status-msg');

  triggerBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    if (!fileInput.files.length) return;
    const file = fileInput.files[0];

    // Reset status and inputs
    uploadStatus.innerText = '🔄 Đang tải ảnh lên Discord CDN...';
    uploadStatus.className = 'status-msg';
    urlInput.value = '';
    copyBtn.disabled = true;
    triggerBtn.disabled = true;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        urlInput.value = data.url;
        copyBtn.disabled = false;
        triggerBtn.disabled = false;
        uploadStatus.innerText = '✅ Tải ảnh thành công!';
        uploadStatus.className = 'status-msg ok';
      } else {
        triggerBtn.disabled = false;
        uploadStatus.innerText = `❌ Lỗi: ${data.error || 'Không rõ nguyên nhân'}`;
        uploadStatus.className = 'status-msg err';
      }
    } catch {
      triggerBtn.disabled = false;
      uploadStatus.innerText = '❌ Lỗi kết nối mạng khi tải ảnh.';
      uploadStatus.className = 'status-msg err';
    }
  });

  copyBtn.addEventListener('click', () => {
    urlInput.select();
    urlInput.setSelectionRange(0, 99999); // for mobile devices
    navigator.clipboard.writeText(urlInput.value);

    const originalText = copyBtn.innerText;
    copyBtn.innerText = 'Copied!';
    setTimeout(() => {
      copyBtn.innerText = originalText;
    }, 2000);
  });

  // ── 13. PERMISSIONS TAB LOGIC ──────────────────────────────────────────────
  let guildRoles = [];
  let allCommands = [];
  let commandPermissions = {}; // commandName -> { allowedRoles: [], deniedRoles: [] }

  async function loadPermissionsSettings(guildId) {
    const selectMenu = document.getElementById('perm-command-select');
    selectMenu.innerHTML = '<option value="">-- Đang tải... --</option>';
    document.getElementById('permission-settings-area').style.display = 'none';

    try {
      // 1. Fetch roles
      const rolesRes = await fetch(`/api/guilds/${guildId}/roles`);
      guildRoles = await rolesRes.json();

      // 2. Fetch commands
      const cmdsRes = await fetch(`/api/guilds/${guildId}/commands`);
      allCommands = await cmdsRes.json();

      // 3. Fetch current permissions
      const permsRes = await fetch(`/api/guilds/${guildId}/permissions`);
      commandPermissions = await permsRes.json();

      // Populate command dropdown
      selectMenu.innerHTML = '<option value="">-- Chọn lệnh --</option>';
      allCommands.forEach(cmd => {
        const opt = document.createElement('option');
        opt.value = cmd;
        opt.textContent = `/${cmd}`;
        selectMenu.appendChild(opt);
      });
    } catch (err) {
      console.error(err);
      selectMenu.innerHTML = '<option value="">-- Lỗi tải dữ liệu --</option>';
    }
  }

  // Handle command change selection
  const permCmdSelect = document.getElementById('perm-command-select');
  permCmdSelect.addEventListener('change', () => {
    const commandName = permCmdSelect.value;
    if (!commandName) {
      document.getElementById('permission-settings-area').style.display = 'none';
      return;
    }

    document.getElementById('perm-editing-command-name').textContent = commandName;
    
    // Render the roles pickers for this command
    renderPermissionsRolesPickers(commandName);
    
    document.getElementById('permission-settings-area').style.display = 'block';
  });

  function renderPermissionsRolesPickers(commandName) {
    const rules = commandPermissions[commandName] || { allowedRoles: [], deniedRoles: [] };
    const allowedList = document.getElementById('allowed-roles-list');
    const deniedList = document.getElementById('denied-roles-list');

    allowedList.innerHTML = '';
    deniedList.innerHTML = '';

    if (guildRoles.length === 0) {
      allowedList.innerHTML = '<p class="placeholder-text">Không tìm thấy vai trò nào.</p>';
      deniedList.innerHTML = '<p class="placeholder-text">Không tìm thấy vai trò nào.</p>';
      return;
    }

    guildRoles.forEach(role => {
      // Color dot markup
      const dotHtml = role.color ? `<span class="role-color-dot" style="color: ${role.color}; background-color: ${role.color};"></span>` : '';

      // 1. Allowed roles checkbox
      const isAllowed = rules.allowedRoles?.includes(role.id) || false;
      const allowedItem = document.createElement('label');
      allowedItem.className = 'role-checkbox-item';
      allowedItem.innerHTML = `
        <input type="checkbox" data-role-id="${role.id}" class="allowed-checkbox" ${isAllowed ? 'checked' : ''} />
        <span class="role-checkbox-label">
          ${dotHtml}
          ${role.name}
        </span>
      `;
      allowedList.appendChild(allowedItem);

      // 2. Denied roles checkbox
      const isDenied = rules.deniedRoles?.includes(role.id) || false;
      const deniedItem = document.createElement('label');
      deniedItem.className = 'role-checkbox-item';
      deniedItem.innerHTML = `
        <input type="checkbox" data-role-id="${role.id}" class="denied-checkbox" ${isDenied ? 'checked' : ''} />
        <span class="role-checkbox-label">
          ${dotHtml}
          ${role.name}
        </span>
      `;
      deniedList.appendChild(deniedItem);

      // Mutual exclusion check: ticking Allowed should untick Denied, and vice versa!
      allowedItem.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) {
          deniedItem.querySelector('input').checked = false;
        }
      });
      deniedItem.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) {
          allowedItem.querySelector('input').checked = false;
        }
      });
    });
  }

  // Handle save permissions
  document.getElementById('btn-save-permissions').addEventListener('click', async () => {
    const commandName = permCmdSelect.value;
    if (!commandName || !activeGuildId) return;

    const saveBtn = document.getElementById('btn-save-permissions');
    const msgSpan = document.getElementById('permissions-status-msg');

    saveBtn.disabled = true;
    msgSpan.textContent = '🔄 Đang lưu cấu hình quyền...';
    msgSpan.className = 'status-msg';

    // Build the lists of checked roles
    const allowedRoles = [];
    document.querySelectorAll('.allowed-checkbox').forEach(cb => {
      if (cb.checked) allowedRoles.push(cb.dataset.roleId);
    });

    const deniedRoles = [];
    document.querySelectorAll('.denied-checkbox').forEach(cb => {
      if (cb.checked) deniedRoles.push(cb.dataset.roleId);
    });

    // Update local object copy
    commandPermissions[commandName] = { allowedRoles, deniedRoles };

    try {
      const res = await fetch(`/api/guilds/${activeGuildId}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: commandPermissions })
      });

      const data = await res.json();
      if (data.success) {
        msgSpan.textContent = '✅ Đã lưu cấu hình quyền thành công!';
        msgSpan.className = 'status-msg ok';
      } else {
        msgSpan.textContent = `❌ Lỗi: ${data.error || 'Không rõ nguyên nhân'}`;
        msgSpan.className = 'status-msg err';
      }
    } catch (err) {
      msgSpan.textContent = '❌ Lỗi kết nối mạng.';
      msgSpan.className = 'status-msg err';
    } finally {
      saveBtn.disabled = false;
      setTimeout(() => {
        msgSpan.textContent = '';
        msgSpan.className = 'status-msg';
      }, 4000);
    }
  });
});
