/* ============================================================
   ClipVault — Application Logic (Electron + Browser compatible)
   ============================================================ */

(function () {
  'use strict';

  // ---- Detect Electron ----
  const isElectron = typeof process !== 'undefined' && process.versions && process.versions.electron;
  let ipcRenderer = null;

  if (isElectron) {
    try {
      ipcRenderer = require('electron').ipcRenderer;
    } catch (e) { /* fallback to browser mode */ }
  }

  // ---- Constants ----
  const STORAGE_KEYS = {
    clips: 'clipvault_clips',
    settings: 'clipvault_settings',
  };

  const DEFAULT_SETTINGS = {
    maxClips: 100,
    pollInterval: 1000,
    showTimestamps: true,
    enableSound: false,
  };

  // ---- Utility Helpers ----
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function timeAgo(date) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escaped.replace(regex, '<span class="highlight">$1</span>');
  }

  function truncate(str, max = 300) {
    if (str.length <= max) return str;
    return str.slice(0, max) + '…';
  }

  // ---- Sound Effect (tiny click) ----
  function playClickSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1200;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) { /* silent fail */ }
  }

  // ---- Clipboard Abstraction ----
  const ClipboardAPI = {
    async read() {
      if (ipcRenderer) {
        return await ipcRenderer.invoke('clipboard-read');
      }
      try {
        return await navigator.clipboard.readText();
      } catch {
        return null;
      }
    },
    async write(text) {
      if (ipcRenderer) {
        return await ipcRenderer.invoke('clipboard-write', text);
      }
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }
  };

  // ---- Clipboard Manager ----
  class ClipboardManager {
    constructor() {
      this.clips = this.loadClips();
      this.settings = this.loadSettings();
      this.lastClipText = '';
      this.pollTimer = null;
      this.filter = 'all'; // 'all' | 'pinned'
      this.searchQuery = '';
      this.editingClipId = null;
      this.hasClipboardAccess = null; // null = unknown

      this.cacheElements();
      this.bindEvents();
      this.applySettings();
      this.render();

      // In Electron, clipboard is watched by main process
      if (isElectron && ipcRenderer) {
        this.setupElectronListeners();
        this.hasClipboardAccess = true;
        this.els.permissionBanner.style.display = 'none';
        this.initLoginItemToggle();
      } else {
        this.startPolling();
        this.checkClipboardAccess();
      }
    }

    // ---- Electron IPC ----
    setupElectronListeners() {
      ipcRenderer.on('clipboard-change', (event, text) => {
        if (text && text !== this.lastClipText) {
          this.lastClipText = text;
          this.addClip(text);
        }
      });

      ipcRenderer.on('window-shown', () => {
        this.els.searchInput.focus();
      });
    }

    // ---- Login Item Toggle (Electron only) ----
    async initLoginItemToggle() {
      if (!ipcRenderer) return;
      // Show the setting row
      this.els.startAtLoginItem.style.display = '';
      // Get current state
      try {
        const settings = await ipcRenderer.invoke('login-item-get');
        this.els.startAtLogin.checked = settings.openAtLogin;
      } catch (e) {
        this.els.startAtLogin.checked = false;
      }

      // Fetch app version
      try {
        const version = await ipcRenderer.invoke('app-version');
        if (this.els.appVersion) {
          this.els.appVersion.textContent = `v${version}`;
        }
      } catch (e) {
        console.error('Failed to fetch app version', e);
      }

      // Bind toggle
      this.els.startAtLogin.addEventListener('change', async () => {
        const val = this.els.startAtLogin.checked;
        try {
          await ipcRenderer.invoke('login-item-set', val);
          this.showToast(val ? 'Will start at login' : 'Removed from login items', 'success');
        } catch (e) {
          this.showToast('Failed to update login settings', 'error');
          this.els.startAtLogin.checked = !val;
        }
      });
    }

    // ---- DOM Cache ----
    cacheElements() {
      this.els = {
        clipList: document.getElementById('clipList'),
        emptyState: document.getElementById('emptyState'),
        emptyTitle: document.getElementById('emptyTitle'),
        emptySubtitle: document.getElementById('emptySubtitle'),
        clipCount: document.getElementById('clipCount'),
        searchInput: document.getElementById('searchInput'),
        searchClear: document.getElementById('searchClear'),
        tabAll: document.getElementById('tabAll'),
        tabPinned: document.getElementById('tabPinned'),
        clearAllBtn: document.getElementById('clearAllBtn'),
        settingsBtn: document.getElementById('settingsBtn'),
        settingsOverlay: document.getElementById('settingsOverlay'),
        settingsClose: document.getElementById('settingsClose'),
        maxClips: document.getElementById('maxClips'),
        maxClipsValue: document.getElementById('maxClipsValue'),
        pollInterval: document.getElementById('pollInterval'),
        showTimestamps: document.getElementById('showTimestamps'),
        enableSound: document.getElementById('enableSound'),
        deleteAllDataBtn: document.getElementById('deleteAllDataBtn'),
        editModal: document.getElementById('editModal'),
        editTextarea: document.getElementById('editTextarea'),
        editModalClose: document.getElementById('editModalClose'),
        editCancel: document.getElementById('editCancel'),
        editSave: document.getElementById('editSave'),
        toastContainer: document.getElementById('toastContainer'),
        permissionBanner: document.getElementById('permissionBanner'),
        requestPermission: document.getElementById('requestPermission'),
        dismissBanner: document.getElementById('dismissBanner'),
        addManualBtn: document.getElementById('addManualBtn'),
        startAtLoginItem: document.getElementById('startAtLoginItem'),
        startAtLogin: document.getElementById('startAtLogin'),
        appVersion: document.getElementById('appVersion'),
        exitBtn: document.getElementById('exitBtn'),
      };
    }

    // ---- Event Bindings ----
    bindEvents() {
      // Search
      this.els.searchInput.addEventListener('input', () => {
        this.searchQuery = this.els.searchInput.value.trim();
        this.els.searchClear.style.display = this.searchQuery ? 'flex' : 'none';
        this.render();
      });
      this.els.searchClear.addEventListener('click', () => {
        this.els.searchInput.value = '';
        this.searchQuery = '';
        this.els.searchClear.style.display = 'none';
        this.els.searchInput.focus();
        this.render();
      });

      // Keyboard shortcut
      document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
          e.preventDefault();
          this.els.searchInput.focus();
          this.els.searchInput.select();
        }
        if (e.key === 'Escape') {
          if (this.els.editModal.classList.contains('open')) {
            this.closeEditModal();
          } else if (this.els.settingsOverlay.classList.contains('open')) {
            this.closeSettings();
          } else if (isElectron && ipcRenderer) {
            // In Electron, Escape hides the window
            ipcRenderer.send('hide-window');
          }
        }
      });

      // Tabs
      this.els.tabAll.addEventListener('click', () => this.setFilter('all'));
      this.els.tabPinned.addEventListener('click', () => this.setFilter('pinned'));

      // Clear all
      this.els.clearAllBtn.addEventListener('click', () => this.clearAll());

      // Settings
      this.els.settingsBtn.addEventListener('click', () => this.openSettings());
      this.els.settingsClose.addEventListener('click', () => this.closeSettings());
      this.els.settingsOverlay.addEventListener('click', (e) => {
        if (e.target === this.els.settingsOverlay) this.closeSettings();
      });

      this.els.maxClips.addEventListener('input', () => {
        this.settings.maxClips = parseInt(this.els.maxClips.value);
        this.els.maxClipsValue.textContent = this.settings.maxClips;
        this.saveSettings();
      });
      this.els.pollInterval.addEventListener('change', () => {
        this.settings.pollInterval = parseInt(this.els.pollInterval.value);
        this.saveSettings();
        if (!isElectron) this.startPolling();
      });
      this.els.showTimestamps.addEventListener('change', () => {
        this.settings.showTimestamps = this.els.showTimestamps.checked;
        this.saveSettings();
        this.render();
      });
      this.els.enableSound.addEventListener('change', () => {
        this.settings.enableSound = this.els.enableSound.checked;
        this.saveSettings();
      });

      this.els.deleteAllDataBtn.addEventListener('click', () => {
        if (confirm('⚠️ This will permanently delete ALL clips and reset settings. Continue?')) {
          localStorage.removeItem(STORAGE_KEYS.clips);
          localStorage.removeItem(STORAGE_KEYS.settings);
          this.clips = [];
          this.settings = { ...DEFAULT_SETTINGS };
          this.applySettings();
          this.render();
          this.closeSettings();
          this.showToast('All data deleted', 'error');
        }
      });

      // Edit modal
      this.els.editModalClose.addEventListener('click', () => this.closeEditModal());
      this.els.editCancel.addEventListener('click', () => this.closeEditModal());
      this.els.editSave.addEventListener('click', () => this.saveEdit());
      this.els.editModal.addEventListener('click', (e) => {
        if (e.target === this.els.editModal) this.closeEditModal();
      });

      // Permission
      this.els.requestPermission.addEventListener('click', () => this.requestClipboardPermission());
      this.els.dismissBanner.addEventListener('click', () => {
        this.els.permissionBanner.style.display = 'none';
      });

      // Manual add
      this.els.addManualBtn.addEventListener('click', () => this.addManualClip());

      // Exit app
      this.els.exitBtn.addEventListener('click', () => {
        if (isElectron && ipcRenderer) {
          ipcRenderer.send('app-quit');
        }
      });

      // Clip list delegation
      this.els.clipList.addEventListener('click', (e) => this.handleClipAction(e));

      // Update timestamps periodically
      setInterval(() => this.updateTimestamps(), 30000);
    }

    // ---- Clipboard Access (browser-only) ----
    async checkClipboardAccess() {
      try {
        const result = await navigator.permissions.query({ name: 'clipboard-read' });
        if (result.state === 'denied') {
          this.hasClipboardAccess = false;
          this.els.permissionBanner.style.display = 'flex';
        } else if (result.state === 'granted') {
          this.hasClipboardAccess = true;
        } else {
          this.hasClipboardAccess = null;
        }
        result.addEventListener('change', () => {
          this.hasClipboardAccess = result.state === 'granted';
          if (this.hasClipboardAccess) {
            this.els.permissionBanner.style.display = 'none';
          }
        });
      } catch {
        // permissions API not supported
      }
    }

    async requestClipboardPermission() {
      try {
        const text = await ClipboardAPI.read();
        this.hasClipboardAccess = true;
        this.els.permissionBanner.style.display = 'none';
        this.showToast('Clipboard access granted!', 'success');
        if (text && text !== this.lastClipText) {
          this.addClip(text);
          this.lastClipText = text;
        }
      } catch {
        this.showToast('Permission denied. Try your browser settings.', 'error');
      }
    }

    // ---- Polling (browser-only fallback) ----
    startPolling() {
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => this.pollClipboard(), this.settings.pollInterval);
    }

    async pollClipboard() {
      try {
        if (this.hasClipboardAccess === false) return;
        const text = await ClipboardAPI.read();
        if (text && text !== this.lastClipText) {
          this.lastClipText = text;
          this.addClip(text);
        }
      } catch {
        // silently fail
      }
    }

    // ---- CRUD ----
    addClip(text) {
      if (this.clips.length > 0 && this.clips[0].text === text) return;

      const clip = {
        id: generateId(),
        text: text,
        timestamp: new Date().toISOString(),
        pinned: false,
      };

      this.clips.unshift(clip);
      this.enforceMaxClips();
      this.saveClips();
      this.render();
      if (this.settings.enableSound) playClickSound();
    }

    deleteClip(id) {
      const card = document.querySelector(`[data-id="${id}"]`);
      if (card) {
        card.classList.add('deleting');
        setTimeout(() => {
          this.clips = this.clips.filter(c => c.id !== id);
          this.saveClips();
          this.render();
        }, 250);
      } else {
        this.clips = this.clips.filter(c => c.id !== id);
        this.saveClips();
        this.render();
      }
      this.showToast('Clip deleted', 'success');
    }

    togglePin(id) {
      const clip = this.clips.find(c => c.id === id);
      if (clip) {
        clip.pinned = !clip.pinned;
        this.saveClips();
        this.render();
        this.showToast(clip.pinned ? 'Clip pinned' : 'Clip unpinned', 'success');
      }
    }

    async copyClip(id) {
      const clip = this.clips.find(c => c.id === id);
      if (!clip) return;
      try {
        await ClipboardAPI.write(clip.text);
        this.lastClipText = clip.text; // prevent re-adding
        const card = document.querySelector(`[data-id="${id}"]`);
        if (card) {
          card.classList.add('copied');
          setTimeout(() => card.classList.remove('copied'), 600);
        }
        this.showToast('Copied to clipboard', 'success');
        if (this.settings.enableSound) playClickSound();
      } catch {
        this.showToast('Failed to copy', 'error');
      }
    }

    openEditModal(id) {
      const clip = this.clips.find(c => c.id === id);
      if (!clip) return;
      this.editingClipId = id;
      this.els.editTextarea.value = clip.text;
      this.els.editModal.classList.add('open');
      setTimeout(() => this.els.editTextarea.focus(), 200);
    }

    closeEditModal() {
      this.els.editModal.classList.remove('open');
      this.editingClipId = null;
    }

    saveEdit() {
      if (!this.editingClipId) return;
      const clip = this.clips.find(c => c.id === this.editingClipId);
      if (clip) {
        const newText = this.els.editTextarea.value.trim();
        if (newText) {
          clip.text = newText;
          this.saveClips();
          this.render();
          this.showToast('Clip updated', 'success');
        }
      }
      this.closeEditModal();
    }

    clearAll() {
      const unpinned = this.clips.filter(c => !c.pinned);
      if (unpinned.length === 0) {
        this.showToast('No clips to clear (pinned clips are kept)', 'error');
        return;
      }
      if (confirm(`Delete ${unpinned.length} unpinned clip(s)? Pinned clips will be kept.`)) {
        this.clips = this.clips.filter(c => c.pinned);
        this.saveClips();
        this.render();
        this.showToast(`${unpinned.length} clip(s) cleared`, 'success');
      }
    }

    addManualClip() {
      const text = prompt('Enter text to add as a clip:');
      if (text && text.trim()) {
        this.addClip(text.trim());
        this.showToast('Clip added manually', 'success');
      }
    }

    enforceMaxClips() {
      const pinned = this.clips.filter(c => c.pinned);
      const unpinned = this.clips.filter(c => !c.pinned);
      const maxUnpinned = Math.max(0, this.settings.maxClips - pinned.length);
      this.clips = [...pinned, ...unpinned.slice(0, maxUnpinned)];
    }

    // ---- Persistence ----
    loadClips() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.clips);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }

    saveClips() {
      try {
        localStorage.setItem(STORAGE_KEYS.clips, JSON.stringify(this.clips));
      } catch {
        this.showToast('Storage is full — old clips removed', 'error');
        this.clips = this.clips.slice(0, 50);
        localStorage.setItem(STORAGE_KEYS.clips, JSON.stringify(this.clips));
      }
    }

    loadSettings() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.settings);
        return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    }

    saveSettings() {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(this.settings));
    }

    applySettings() {
      this.els.maxClips.value = this.settings.maxClips;
      this.els.maxClipsValue.textContent = this.settings.maxClips;
      this.els.pollInterval.value = this.settings.pollInterval;
      this.els.showTimestamps.checked = this.settings.showTimestamps;
      this.els.enableSound.checked = this.settings.enableSound;
    }

    // ---- Settings Panel ----
    openSettings() {
      this.els.settingsOverlay.classList.add('open');
    }

    closeSettings() {
      this.els.settingsOverlay.classList.remove('open');
    }

    // ---- Filtering ----
    setFilter(filter) {
      this.filter = filter;
      this.els.tabAll.classList.toggle('active', filter === 'all');
      this.els.tabPinned.classList.toggle('active', filter === 'pinned');
      this.render();
    }

    getFilteredClips() {
      let clips = [...this.clips];

      if (this.filter === 'pinned') {
        clips = clips.filter(c => c.pinned);
      }

      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        clips = clips.filter(c => c.text.toLowerCase().includes(q));
      }

      clips.sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
        return new Date(b.timestamp) - new Date(a.timestamp);
      });

      return clips;
    }

    // ---- Rendering ----
    render() {
      const clips = this.getFilteredClips();

      this.els.clipCount.textContent = `${this.clips.length} clip${this.clips.length !== 1 ? 's' : ''}`;

      if (clips.length === 0) {
        this.els.clipList.style.display = 'none';
        this.els.emptyState.style.display = 'flex';

        if (this.searchQuery) {
          this.els.emptyTitle.textContent = 'No matches';
          this.els.emptySubtitle.textContent = `No clips match "${this.searchQuery}"`;
        } else if (this.filter === 'pinned') {
          this.els.emptyTitle.textContent = 'No pinned clips';
          this.els.emptySubtitle.textContent = 'Pin important clips to access them quickly.';
        } else {
          this.els.emptyTitle.textContent = 'No clips yet';
          this.els.emptySubtitle.textContent = 'Copy some text and it will appear here automatically.';
        }
        return;
      }

      this.els.clipList.style.display = 'flex';
      this.els.emptyState.style.display = 'none';

      this.els.clipList.innerHTML = clips.map((clip, i) => `
        <div class="clip-card ${clip.pinned ? 'pinned' : ''}" data-id="${clip.id}" style="animation-delay: ${Math.min(i * 30, 300)}ms">
          <div class="clip-content">
            <div class="clip-text-wrapper">
              <div class="clip-text">${highlightText(truncate(clip.text), this.searchQuery)}</div>
              <div class="clip-meta">
                ${this.settings.showTimestamps ? `<span class="timestamp" data-time="${clip.timestamp}">${timeAgo(clip.timestamp)}</span>` : ''}
                <span class="char-count">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
                  ${clip.text.length.toLocaleString()} chars
                </span>
              </div>
            </div>
            <div class="clip-actions">
              <button class="clip-action-btn ${clip.pinned ? 'pinned-active' : ''}" data-action="pin" title="${clip.pinned ? 'Unpin' : 'Pin'}">
                <svg viewBox="0 0 24 24" fill="${clip.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2l2.09 6.26L21 9.27l-5 4.87L17.18 21 12 17.27 6.82 21 8 14.14l-5-4.87 6.91-1.01z"/>
                </svg>
              </button>
              <button class="clip-action-btn" data-action="edit" title="Edit">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="clip-action-btn" data-action="copy" title="Copy">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
              <button class="clip-action-btn delete" data-action="delete" title="Delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `).join('');
    }

    updateTimestamps() {
      document.querySelectorAll('.timestamp[data-time]').forEach(el => {
        el.textContent = timeAgo(el.dataset.time);
      });
    }

    // ---- Clip Action Delegation ----
    handleClipAction(e) {
      const actionBtn = e.target.closest('[data-action]');
      const card = e.target.closest('.clip-card');
      if (!card) return;
      const id = card.dataset.id;

      if (actionBtn) {
        const action = actionBtn.dataset.action;
        if (action === 'copy') this.copyClip(id);
        else if (action === 'delete') this.deleteClip(id);
        else if (action === 'pin') this.togglePin(id);
        else if (action === 'edit') this.openEditModal(id);
      } else {
        this.copyClip(id);
      }
    }

    // ---- Toast ----
    showToast(message, type = 'success') {
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      const iconSvg = type === 'success'
        ? '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
      toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
      this.els.toastContainer.appendChild(toast);

      setTimeout(() => {
        toast.classList.add('out');
        setTimeout(() => toast.remove(), 200);
      }, 2500);
    }
  }

  // ---- Initialize ----
  document.addEventListener('DOMContentLoaded', () => {
    window.clipVault = new ClipboardManager();
  });
})();
