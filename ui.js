// ============================================
// SystemesGED v7.2 — MODULE : ui.js
// Responsabilités :
//   - Navigation (switchView, sidebar mobile)
//   - Tableau de bord (renderDashboard, renderActivityList)
//   - Mise à jour UI (updateUI, updateBadges, updateUserDisplay, updateMenuVisibility, updateStorageDisplay)
//   - Notifications, recherche globale
//   - Initialisation DOMContentLoaded
//   - Utilitaires UI (showToast, escapeHtml, formatBytes, formatDate, getFileIcon)
//   - Helpers (getRoleBadgeClass, generateId, handleGlobalSearch)
// ============================================

// Dépendances : auth.js (G, CONFIG)

// ─── Navigation ───
function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active-view');

  G.currentView = viewName;
  closeMobileSidebar();

  // Synchroniser le active state de tous les boutons sidebar
  document.querySelectorAll('.sidebar-item').forEach(el => {
    el.classList.remove('active');
  });
  document.querySelectorAll(`[data-view="${viewName}"]`).forEach(el => {
    el.classList.add('active');
  });

  const views = {
    dashboard: renderDashboard,
    documents: renderDocuments,
    workflows: renderWorkflows,
    shared: renderShared,
    users: renderUsers,
    tags: renderTags,
    billing: renderBilling,
    settings: renderSettings,
    security: renderSecurity,
    logs: renderSysLogs,
    rbac: renderRBAC,
    analytics: renderAnalytics,
    folders: renderFolders,
    signatures: renderSignatures,
    ai: renderAI,
    automation: renderAutomation,
    integrations: renderIntegrations,
    backups: renderBackups,
    apikeys: renderApiKeys,
    billing2: renderBillingV6,
    auditv6: renderAuditV6,
    'search-adv': renderAdvancedSearch,
    versioning: renderVersioning,
    search: renderSearchV7,
    rbacv7: renderRBACV7,
    'pending-users': renderPendingUsers
  };
  
  if (views[viewName]) { const r = views[viewName](); if (r instanceof Promise) r.catch(e => console.error('switchView error:', e)); }
}

function openMobileSidebar() {
  const sidebar = document.getElementById('mobileSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.add('open');
  if (overlay) overlay.classList.add('active');
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('mobileSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
}

// ─── Dashboard ───
async function renderDashboard() {
  console.log('🔄 Rendu du tableau de bord...');

  // ── Recharger les données fraîches depuis Supabase ──────────────
  if (G.supabase && G.currentUser?.companyId) {
    try {
      const [docsRes, wfsRes, sharesRes, usersRes, auditRes] = await Promise.all([
        G.supabase.from('documents').select('*').eq('company_id', G.currentUser.companyId).order('created_at', { ascending: false }),
        G.supabase.from('workflows').select('*').eq('company_id', G.currentUser.companyId),
        G.supabase.from('shares').select('*').or(`sender_id.eq.${G.currentUser.id},recipient_email.eq.${G.currentUser.email}`),
        G.supabase.from('profiles').select('*').eq('company_id', G.currentUser.companyId),
        G.supabase.from('audit_logs').select('*').eq('user_id', G.currentUser.id).order('created_at', { ascending: false }).limit(50)
      ]);
      if (!docsRes.error)  G.documents  = docsRes.data  || [];
      if (!wfsRes.error)   G.workflows  = wfsRes.data   || [];
      if (!sharesRes.error) G.shares    = sharesRes.data || [];
      if (!usersRes.error) G.users      = usersRes.data  || [];
      if (!auditRes.error) G.auditLogs  = auditRes.data  || [];
    } catch (err) {
      console.warn('renderDashboard: rechargement partiel échoué', err);
    }
  }

  const totalDocs        = G.documents.filter(d => !d.is_deleted).length;
  const activeWorkflows  = G.workflows.filter(w => ['pending', 'in_review'].includes(w.status)).length;
  const sharedCount      = G.shares.filter(s => s.status === 'active').length;
  const userCount        = G.users.length;
  const totalViews       = G.documents.reduce((sum, d) => sum + (d.views || 0), 0);
  const today            = new Date().toDateString();
  const activeUsers      = new Set(
    G.auditLogs.filter(l => l.action === 'login' && new Date(l.created_at).toDateString() === today).map(l => l.user_id)
  ).size;

  // Mise à jour des compteurs
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('totalDocs',           totalDocs);
  set('dashWorkflowCount',   activeWorkflows);
  set('sharedCount',         sharedCount);
  set('dashUserCount',       userCount);
  set('dashTotalViews',      totalViews);
  set('dashActiveUsers',     activeUsers || userCount);

  updateBadges();
  updateStorageDisplay();
  renderActivityList();
  renderQuickAccess();
  renderPopularTags();
  renderTeamDocs();
  renderMyWorkflows();

  console.log('✅ Tableau de bord mis à jour');
}

function renderActivityList() {
  const list = document.getElementById('activityList');
  if (!list) { console.warn('activityList non trouvé'); return; }

  let activities = [];

  if (G.auditLogs && G.auditLogs.length > 0) {
    activities = G.auditLogs.slice(0, 10);
  } else {
    // Construire des activités synthétiques depuis les vraies données
    const recentDocs = G.documents.filter(d => !d.is_deleted).slice(0, 5);
    recentDocs.forEach(doc => activities.push({
      action: 'upload', target_type: 'document', target_id: doc.id,
      details: doc.name, created_at: doc.created_at
    }));
    const recentShares = G.shares.filter(s => s.sender_id === G.currentUser?.id).slice(0, 3);
    recentShares.forEach(share => activities.push({
      action: 'share', target_type: 'document', target_id: share.document_id,
      details: `Partagé avec ${share.recipient_email}`, created_at: share.created_at
    }));
    activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    activities = activities.slice(0, 10);
  }

  if (activities.length === 0) {
    list.innerHTML = `
      <div class="text-center py-8 text-blue-300/50">
        <i class="fas fa-folder-open text-2xl mb-2 block"></i>
        <p>Aucune activité récente</p>
        <p class="text-xs mt-2">Importez des documents pour voir l'activité</p>
      </div>`;
    return;
  }

  list.innerHTML = activities.map(act => `
    <div class="flex items-center gap-3 p-3 rounded-xl bg-blue-900/20 border border-blue-500/10 hover:bg-blue-900/30 transition-all group">
      <div class="w-8 h-8 rounded-lg ${getActionBgColor(act.action)} flex items-center justify-center flex-shrink-0">
        <i class="fas ${getActionIcon(act.action)} text-sm"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white">${getActionLabel(act.action)}${act.target_type ? ' · ' + act.target_type : ''}</p>
        <p class="text-xs text-blue-300/60 truncate">${act.details ? act.details.substring(0, 50) + (act.details.length > 50 ? '…' : '') : ''}</p>
        <p class="text-xs text-blue-400/50 mt-0.5">${formatDate(act.created_at)}</p>
      </div>
      ${act.target_id ? `<button onclick="openPreviewModal('${act.target_id}')" class="text-blue-400 hover:text-blue-300 text-xs opacity-0 group-hover:opacity-100 transition-opacity"><i class="fas fa-eye"></i></button>` : ''}
    </div>
  `).join('');
}

function getActionBgColor(action) {
  const colors = {
    login: 'bg-green-500/20',
    logout: 'bg-gray-500/20',
    upload: 'bg-blue-500/20',
    download: 'bg-purple-500/20',
    share: 'bg-cyan-500/20',
    delete: 'bg-red-500/20',
    restore: 'bg-green-500/20',
    view: 'bg-yellow-500/20',
    workflow: 'bg-orange-500/20',
    signature: 'bg-pink-500/20'
  };
  return colors[action] || 'bg-blue-500/20';
}

function getActionLabel(action) {
  const labels = {
    login: 'Connexion',
    logout: 'Déconnexion',
    upload: 'Import de document',
    download: 'Téléchargement',
    share: 'Partage de document',
    delete: 'Suppression',
    restore: 'Restauration',
    view: 'Consultation',
    workflow: 'Workflow',
    signature: 'Signature'
  };
  return labels[action] || action;
}

function getActionIcon(action) {
  const icons = { 
    login: 'fa-sign-in-alt', 
    logout: 'fa-sign-out-alt', 
    upload: 'fa-upload', 
    download: 'fa-download', 
    share: 'fa-share', 
    delete: 'fa-trash', 
    restore: 'fa-undo', 
    view_change: 'fa-eye', 
    validate: 'fa-check', 
    reject: 'fa-times' 
  };
  return icons[action] || 'fa-circle';
}

function renderQuickAccess() {
  const pdfCount = G.documents.filter(d => !d.is_deleted && d.type === 'pdf').length;
  const docCount = G.documents.filter(d => !d.is_deleted && d.type === 'doc').length;
  
  const quickPdfCount = document.getElementById('quickPdfCount');
  const quickDocCount = document.getElementById('quickDocCount');
  
  if (quickPdfCount) quickPdfCount.textContent = `${pdfCount} fichier(s)`;
  if (quickDocCount) quickDocCount.textContent = `${docCount} fichier(s)`;
}

function renderPopularTags() {
  const container = document.getElementById('popularTags');
  if (!container) return;
  
  const sorted = [...G.tags].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 8);
  if (sorted.length === 0) {
    container.innerHTML = '<span class="text-blue-300/50 text-sm">Aucun tag</span>';
    return;
  }
  
  container.innerHTML = sorted.map(t => `
    <span class="tag" style="background:${t.color}20;border-color:${t.color}40;color:${t.color}" onclick="filterByTag('${t.name}')">
      ${t.name}
    </span>
  `).join('');
}

function renderTeamDocs() {
  const list = document.getElementById('teamDocsList');
  if (!list) {
    console.warn('teamDocsList non trouvé');
    return;
  }
  
  // Afficher les documents de l'entreprise ou les documents récents
  let docs = G.documents.filter(d => !d.is_deleted);
  
  // Priorité aux documents d'entreprise
  const companyDocs = docs.filter(d => d.scope === 'company');
  if (companyDocs.length > 0) {
    docs = companyDocs;
  }
  
  docs = docs.slice(0, 5);
  
  if (docs.length === 0) {
    list.innerHTML = `
      <div class="text-center py-6">
        <i class="fas fa-folder-open text-blue-400/40 text-3xl mb-2 block"></i>
        <p class="text-blue-300/50 text-sm">Aucun document d'équipe</p>
        <button onclick="openUploadModal()" class="mt-2 text-xs text-blue-400 hover:text-blue-300">Importer un document →</button>
      </div>
    `;
    return;
  }
  
  list.innerHTML = docs.map(doc => `
    <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-500/10 cursor-pointer transition-all group" onclick="openPreviewModal('${doc.id}')">
      <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
        <i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-lg"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white font-medium truncate">${escapeHtml(doc.name)}</p>
        <div class="flex items-center gap-2 mt-0.5">
          <span class="text-xs text-blue-300/60">${formatBytes(doc.size)}</span>
          <span class="text-xs text-blue-400/50">•</span>
          <span class="text-xs text-blue-300/60">${formatDate(doc.created_at)}</span>
          ${doc.scope === 'company' ? `<span class="collab-badge text-[10px]"><i class="fas fa-building"></i>Équipe</span>` : ''}
        </div>
      </div>
      <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onclick="event.stopPropagation(); downloadDocument('${doc.id}')" class="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400" title="Télécharger">
          <i class="fas fa-download text-xs"></i>
        </button>
        <button onclick="event.stopPropagation(); openMoveModal('${doc.id}')" class="p-1.5 rounded-lg hover:bg-yellow-500/20 text-yellow-400" title="Déplacer">
          <i class="fas fa-folder-open text-xs"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function renderMyWorkflows() {
  const list = document.getElementById('myWorkflowsList');
  const badge = document.getElementById('myWorkflowsBadge');
  if (!list) return;
  
  const myWfs = G.workflows.filter(w => 
    (w.assignee_id === G.currentUser.id || w.created_by === G.currentUser.id) && 
    ['pending', 'in_review'].includes(w.status)
  ).slice(0, 5);
  
  if (badge) {
    if (myWfs.length > 0) {
      badge.textContent = myWfs.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
  
  if (myWfs.length === 0) {
    list.innerHTML = `
      <div class="text-center py-6">
        <i class="fas fa-project-diagram text-orange-400/40 text-3xl mb-2 block"></i>
        <p class="text-blue-300/50 text-sm">Aucun workflow assigné</p>
        <button onclick="openCreateWorkflowModal()" class="mt-2 text-xs text-orange-400 hover:text-orange-300">Créer un workflow →</button>
      </div>
    `;
    return;
  }
  
  list.innerHTML = myWfs.map(wf => `
    <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-orange-500/10 cursor-pointer transition-all group" onclick="openWfDetail('${wf.id}')">
      <div class="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-400 flex-shrink-0">
        <i class="fas fa-project-diagram text-lg"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white font-medium truncate">${escapeHtml(wf.title)}</p>
        <div class="flex items-center gap-2 mt-1">
          <span class="text-xs px-2 py-0.5 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span>
          <span class="text-xs text-blue-300/50">${formatDate(wf.created_at)}</span>
        </div>
      </div>
      <div class="opacity-0 group-hover:opacity-100 transition-opacity">
        <i class="fas fa-chevron-right text-blue-400/50"></i>
      </div>
    </div>
  `).join('');
}

// ─── Documents ───


// ─── Utilitaires ───
async function addAuditLog(action, targetType, targetId, details = '') {
 if (G._isDemo) return; // Mode démo : pas d'écriture Supabase
  try {
    const log = {
      id: generateId(),
      user_id: G.currentUser.id,
      user_email: G.currentUser.email,
      action: action,
      target_type: targetType,
      target_id: targetId,
      details: details,
      severity: ['delete', 'validate_user', 'account_deletion_request', 'role_change'].includes(action) ? 'warning' : 'info',
      created_at: new Date().toISOString()
    };

    const { error } = await G.supabase.from('audit_logs').insert(log);
    if (!error) {
      if (!G.auditLogs) G.auditLogs = [];
      G.auditLogs.unshift(log);
      if (G.auditLogs.length > 500) G.auditLogs.pop();
    }
  } catch (err) {
    console.warn('addAuditLog error (non-blocking):', err);
  }
}

// ─── Rich Editor ───
function openRichEditor(docId) {
  showToast('Éditeur riche en développement', 'info');
}

function closeRichEditor() {
  const modal = document.getElementById('richEditorModal');
  if (modal) modal.classList.add('hidden');
}

function _onRichEditorInput() {}
function _saveRichContent() {}

// ─── Utilitaires ───
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getFileIcon(type) {
  const map = {
    img:    { icon: 'fa-file-image',       color: 'text-purple-400' },
    image:  { icon: 'fa-file-image',       color: 'text-purple-400' },
    video:  { icon: 'fa-file-video',       color: 'text-pink-400' },
    audio:  { icon: 'fa-file-audio',       color: 'text-green-400' },
    code:   { icon: 'fa-file-code',        color: 'text-cyan-400' },
    zip:    { icon: 'fa-file-archive',     color: 'text-yellow-400' },
    txt:    { icon: 'fa-file-alt',         color: 'text-gray-400' },
    unknown:{ icon: 'fa-file',             color: 'text-blue-400/70' },
    pdf: { icon: 'fa-file-pdf', color: 'text-red-400' },
    doc: { icon: 'fa-file-word', color: 'text-blue-400' },
    docx: { icon: 'fa-file-word', color: 'text-blue-400' },
    xls: { icon: 'fa-file-excel', color: 'text-green-400' },
    xlsx: { icon: 'fa-file-excel', color: 'text-green-400' },
    ppt: { icon: 'fa-file-powerpoint', color: 'text-orange-400' },
    pptx: { icon: 'fa-file-powerpoint', color: 'text-orange-400' },
    png: { icon: 'fa-file-image', color: 'text-purple-400' },
    jpg: { icon: 'fa-file-image', color: 'text-purple-400' },
    jpeg: { icon: 'fa-file-image', color: 'text-purple-400' },
    gif: { icon: 'fa-file-image', color: 'text-purple-400' },
    txt: { icon: 'fa-file-alt', color: 'text-gray-400' },
    zip: { icon: 'fa-file-archive', color: 'text-yellow-400' },
    mp4: { icon: 'fa-file-video', color: 'text-pink-400' },
    mp3: { icon: 'fa-file-audio', color: 'text-green-400' },
    json: { icon: 'fa-file-code', color: 'text-cyan-400' },
    html: { icon: 'fa-file-code', color: 'text-cyan-400' },
    css: { icon: 'fa-file-code', color: 'text-cyan-400' },
    js: { icon: 'fa-file-code', color: 'text-cyan-400' }
  };
  const m = map[type] || { icon: 'fa-file', color: 'text-blue-400' };
  return `${m.icon} ${m.color}`;
}

function getFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const types = { 
    pdf: 'pdf',
    doc: 'doc',
    docx: 'doc',
    xls: 'xls',
    xlsx: 'xls',
    ppt: 'ppt',
    pptx: 'ppt',
    png: 'img',
    jpg: 'img',
    jpeg: 'img',
    gif: 'img',
    webp: 'img',
    svg: 'img',
    txt: 'txt',
    zip: 'zip',
    rar: 'zip',
    mp4: 'video',
    mp3: 'audio',
    json: 'code',
    xml: 'code',
    html: 'code',
    css: 'code',
    js: 'code'
  };
  return types[ext] || 'unknown';
}

function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const styles = {
    success: { bg: 'rgba(16,185,129,0.95)', icon: 'fa-check-circle',       border: 'rgba(16,185,129,0.4)' },
    error:   { bg: 'rgba(239,68,68,0.95)',  icon: 'fa-exclamation-circle',  border: 'rgba(239,68,68,0.4)'  },
    warning: { bg: 'rgba(245,158,11,0.95)', icon: 'fa-exclamation-triangle', border: 'rgba(245,158,11,0.4)' },
    info:    { bg: 'rgba(37,99,235,0.95)',  icon: 'fa-info-circle',          border: 'rgba(96,165,250,0.4)' }
  };
  const s = styles[type] || styles.info;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.cssText = `background:${s.bg};border-color:${s.border};`;
  toast.innerHTML = `<i class="fas ${s.icon}"></i><span>${escapeHtml(String(message))}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 320);
  }, duration);
}

function handleDocDragStart(e, docId) {
  e.dataTransfer.setData('text/plain', docId);
}

function showDocContextMenu(e, docId) {
  e.preventDefault();
  e.stopPropagation();
  // Use the standard delete flow which includes its own confirm
  deleteDocument(docId);
}

// ─── Sécurité : Échappement HTML ───
function canValidateUsers() {
  if (!G.currentUser) return false;
  return G.currentUser.isSystemAdmin ||
    G.roles[G.currentUser.role]?.perms?.includes('validate_users') ||
    G.currentUser.role === 'admin';
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Initialisation ───



// ─── Helpers manquants ───

function getRoleBadgeClass(role) {
  const classes = { 
    admin: 'bg-red-500/20 text-red-400', 
    manager: 'bg-orange-500/20 text-orange-400', 
    editor: 'bg-blue-500/20 text-blue-400', 
    viewer: 'bg-gray-500/20 text-gray-400' 
  };
  return classes[role] || 'bg-gray-500/20 text-gray-400';
}

  function renderFolderTreeRecursive(folderId, level = 0) {
    const folder = G.folders.find(f => f.id === folderId);
    if (!folder) return '';
    const children = G.folders.filter(f => f.parent_id === folderId);
    const indent = level * 12;
    return `
      <div style="margin-left: ${indent}px" class="cursor-pointer hover:bg-blue-500/10 rounded-lg">
        <div class="flex items-center gap-2 px-2 py-1 text-blue-300/70 text-xs" onclick="openFolder('${folder.id}', '${folder.name}')">
          <i class="fas fa-folder text-yellow-400 text-xs"></i>
          <span>${folder.name}</span>
        </div>
        ${children.map(c => renderFolderTreeRecursive(c.id, level + 1)).join('')}
      </div>
    `;
  }

function updateFolderBreadcrumb() {
  const breadcrumb = document.getElementById('folderBreadcrumb');
  if (!breadcrumb) return;
  
  breadcrumb.innerHTML = G.folderPath.map((f, idx) => `
    <span class="flex items-center">
      ${idx > 0 ? '<i class="fas fa-chevron-right text-blue-400/40 text-xs mx-1"></i>' : ''}
      <button onclick="openFolder('${f.id}', '${f.name}')" class="text-sm ${idx === G.folderPath.length - 1 ? 'text-white font-semibold' : 'text-blue-400 hover:text-blue-300'}">${f.name}</button>
    </span>
  `).join('');
}

  function getCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    if (e.touches) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return { x: Math.max(0, Math.min(canvas.width, x)), y: Math.max(0, Math.min(canvas.height, y)) };
  }

  function startDrawing(e) {
    e.preventDefault();
    isDrawing = true;
    const { x, y } = getCoordinates(e);
    lastX = x;
    lastY = y;
    signatureCtx.beginPath();
    signatureCtx.moveTo(x, y);
  }

  function draw(e) {
    e.preventDefault();
    if (!isDrawing) return;
    const { x, y } = getCoordinates(e);
    signatureCtx.lineTo(x, y);
    signatureCtx.stroke();
    lastX = x;
    lastY = y;
  }

  function stopDrawing() {
    isDrawing = false;
    signatureCtx.beginPath();
  }

function handleGlobalSearch(query) {
  const dropdown = document.getElementById('searchDropdown');
  if (!dropdown) return;
  
  if (!query || query.length < 2) {
    dropdown.classList.add('hidden');
    return;
  }
  
  const results = G.documents.filter(d => !d.is_deleted && d.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
  if (results.length === 0) {
    dropdown.classList.add('hidden');
    return;
  }
  
  dropdown.classList.remove('hidden');
  dropdown.innerHTML = results.map(doc => `
    <div class="p-2 hover:bg-blue-500/10 cursor-pointer" onclick="openPreviewModal('${doc.id}'); document.getElementById('searchDropdown').classList.add('hidden');">
      <p class="text-white text-sm">${escapeHtml(doc.name)}</p>
      <p class="text-xs text-blue-300/60">${formatBytes(doc.size)}</p>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  window.addEventListener('error', (e) => {
    console.error('❌ Erreur globale:', {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      error: e.error
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    console.error('❌ Promesse rejetée non gérée:', {
      reason: e.reason,
      promise: e.promise
    });
  });

  console.log('🚀 Démarrage de l\'application SystemesGED v7.0');

  const hasSession = await initSupabase();

  if (hasSession) {
    // loadUserFromSupabase already called inside initSupabase
    switchToMainApp();
  } else {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp     = document.getElementById('mainApp');
    if (loginScreen) loginScreen.style.display = 'block';
    if (mainApp)     mainApp.style.display      = 'none';

// ══════════════════════════════════════════════
// COLLABORATION TEMPS RÉEL + COMMENTAIRES + EDIT
// ══════════════════════════════════════════════

let _realtimeChannel = null;
let _presenceUsers   = {};
let _commentsCache   = {};

// ── Présence temps réel ──
function subscribePresence(docId) {
  if (_realtimeChannel) {
    G.supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
  if (!docId || !G.supabase) return;

  _realtimeChannel = G.supabase.channel(`doc-presence:${docId}`, {
    config: { presence: { key: G.currentUser.id } }
  });

  _realtimeChannel
    .on('presence', { event: 'sync' }, () => {
      const state = _realtimeChannel.presenceState();
      _presenceUsers = {};
      Object.values(state).flat().forEach(u => { _presenceUsers[u.userId] = u; });
      renderPresenceBadges();
    })
    .on('broadcast', { event: 'comment' }, ({ payload }) => {
      if (payload.docId === docId) appendComment(payload);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await _realtimeChannel.track({
          userId:    G.currentUser.id,
          userName:  G.currentUser.name || G.currentUser.email,
          userEmail: G.currentUser.email,
          joinedAt:  new Date().toISOString()
        });
      }
    });
}

function unsubscribePresence() {
  if (_realtimeChannel) {
    G.supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
  _presenceUsers = {};
  renderPresenceBadges();
}

function renderPresenceBadges() {
  const container = document.getElementById('previewPresence');
  if (!container) return;
  const users = Object.values(_presenceUsers).filter(u => u.userId !== G.currentUser.id);
  if (!users.length) { container.innerHTML = ''; return; }
  container.innerHTML = users.slice(0, 5).map(u => {
    const initials = (u.userName || u.userEmail || '?').slice(0, 2).toUpperCase();
    const colors   = ['bg-green-500','bg-blue-500','bg-purple-500','bg-yellow-500','bg-red-500'];
    const color    = colors[u.userId?.charCodeAt(0) % colors.length] || 'bg-blue-500';
    return `<div class="w-7 h-7 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold cursor-default" title="${escapeHtml(u.userName || u.userEmail)}">${initials}</div>`;
  }).join('') + (users.length > 5 ? `<span class="text-xs text-blue-400/60">+${users.length - 5}</span>` : '');
}

// Hooker closePreviewModal pour unsubscribe
const _origClosePreview = closePreviewModal;
window.closePreviewModal = function() {
  unsubscribePresence();
  const panel = document.getElementById('commentsPanel');
  if (panel) panel.classList.add('hidden');
  _origClosePreview();
};

// Hooker openPreviewModal pour subscribe + bouton Modifier
const _origOpenPreview = openPreviewModal;
window.openPreviewModal = async function(docId) {
  await _origOpenPreview(docId);
  subscribePresence(docId);
  // Afficher bouton Modifier si office
  const doc = G.documents.find(d => d.id === docId);
  const editBtn = document.getElementById('editDocBtn');
  if (editBtn && doc) {
    const officeExts = ['doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp'];
    const ext = (doc.name?.split('.').pop() || '').toLowerCase();
    if (officeExts.includes(ext)) editBtn.classList.remove('hidden');
    else editBtn.classList.add('hidden');
  }
  // Charger commentaires
  loadComments(docId);
};

// ── Modifier un document Office avec sync automatique ──
let _watchInterval  = null;
let _watchFileHandle = null;
let _watchLastModified = 0;
let _watchDocId = null;

async function editCurrentDocument() {
  const docId = G.currentDocId;
  const doc   = G.documents.find(d => d.id === docId);
  if (!doc) return;

  // Vérifier support File System Access API
  if (!window.showOpenFilePicker) {
    // Fallback: téléchargement simple
    let fileUrl = doc.file_url;
    if (G.supabase && doc.storage_path) {
      const { data } = await G.supabase.storage.from(CONFIG.storageBucket).createSignedUrl(doc.storage_path, 3600);
      if (data?.signedUrl) fileUrl = data.signedUrl;
    }
    const a = document.createElement('a');
    a.href = fileUrl; a.download = doc.name; a.click();
    showToast(`📥 Téléchargé. Modifiez puis ré-importez manuellement via "Importer".`, 'warning', 6000);
    return;
  }

  // Étape 1: Télécharger le fichier d'abord
  showToast('⬇️ Téléchargement du fichier...', 'info', 3000);
  let fileUrl = doc.file_url;
  if (G.supabase && doc.storage_path) {
    const { data } = await G.supabase.storage.from(CONFIG.storageBucket).createSignedUrl(doc.storage_path, 3600);
    if (data?.signedUrl) fileUrl = data.signedUrl;
  }
  const a = document.createElement('a');
  a.href = fileUrl; a.download = doc.name; a.click();

  // Étape 2: Ouvrir le sélecteur de fichier après 1.5s
  await new Promise(r => setTimeout(r, 1500));
  showToast('📂 Sélectionnez le fichier téléchargé pour activer la sync automatique', 'info', 6000);

  try {
    const ext = doc.name.split('.').pop().toLowerCase();
    const mimeMap = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      doc:  'application/msword',
      xls:  'application/vnd.ms-excel',
    };

    const [fileHandle] = await window.showOpenFilePicker({
      types: [{ description: 'Document Office', accept: { [mimeMap[ext] || '*/*']: [`.${ext}`] } }],
      multiple: false
    });

    // Arrêter toute surveillance précédente
    stopFileWatch();

    _watchFileHandle  = fileHandle;
    _watchDocId       = docId;
    const initialFile = await fileHandle.getFile();
    _watchLastModified = initialFile.lastModified;

    // Afficher badge de sync dans le modal
    showSyncBadge(doc.name, 'watching');

    // Étape 3: Surveiller les modifications toutes les 3 secondes
    _watchInterval = setInterval(async () => {
      try {
        const file = await _watchFileHandle.getFile();
        if (file.lastModified !== _watchLastModified) {
          _watchLastModified = file.lastModified;
          showSyncBadge(doc.name, 'uploading');
          await autoUploadNewVersion(docId, file);
          showSyncBadge(doc.name, 'synced');
          setTimeout(() => showSyncBadge(doc.name, 'watching'), 3000);
        }
      } catch(e) {
        stopFileWatch();
      }
    }, 3000);

    showToast(`✅ Sync activée pour "${doc.name}". Sauvegardez dans Office → mis à jour automatiquement !`, 'success', 8000);
    await addAuditLog('edit_sync_start', 'document', docId, `Sync automatique démarrée: ${doc.name}`);

  } catch(e) {
    if (e.name !== 'AbortError') showToast('Sync annulée', 'warning');
  }
}

function stopFileWatch() {
  if (_watchInterval) { clearInterval(_watchInterval); _watchInterval = null; }
  _watchFileHandle  = null;
  _watchDocId       = null;
  _watchLastModified = 0;
  hideSyncBadge();
}

function showSyncBadge(fileName, state) {
  let badge = document.getElementById('syncStatusBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'syncStatusBadge';
    badge.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;padding:10px 16px;border-radius:12px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,0.4);transition:all 0.3s ease;backdrop-filter:blur(12px);';
    document.body.appendChild(badge);
  }
  const configs = {
    watching:  { bg: 'rgba(30,58,138,0.95)', border: '1px solid rgba(96,165,250,0.4)', icon: '🔵', text: 'Sync active — en attente de modifications', pulse: true  },
    uploading: { bg: 'rgba(120,53,15,0.95)',  border: '1px solid rgba(251,191,36,0.4)',  icon: '⬆️', text: 'Mise à jour en cours...', pulse: false },
    synced:    { bg: 'rgba(6,78,59,0.95)',    border: '1px solid rgba(52,211,153,0.4)',  icon: '✅', text: 'Document synchronisé !', pulse: false },
    error:     { bg: 'rgba(127,29,29,0.95)',  border: '1px solid rgba(252,165,165,0.4)', icon: '❌', text: 'Erreur de sync', pulse: false },
  };
  const c = configs[state] || configs.watching;
  badge.style.background = c.bg;
  badge.style.border = c.border;
  badge.style.color = '#fff';
  badge.innerHTML = `
    <span>${c.icon}</span>
    <div>
      <div style="font-size:11px;opacity:0.7;margin-bottom:2px">${escapeHtml(fileName)}</div>
      <div>${c.text}</div>
    </div>
    <button onclick="stopFileWatch()" style="margin-left:8px;background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:11px">Arrêter</button>
  `;
}

function hideSyncBadge() {
  const badge = document.getElementById('syncStatusBadge');
  if (badge) badge.remove();
}

async function autoUploadNewVersion(docId, file) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc || !G.supabase) return;

  try {
    // Uploader le fichier dans Supabase Storage (même chemin = écrase)
    const { error: uploadError } = await G.supabase.storage
      .from(CONFIG.storageBucket)
      .upload(doc.storage_path, file, { upsert: true, contentType: file.type });

    if (uploadError) throw uploadError;

    // Incrémenter la version et mettre à jour les métadonnées
    const newVersion = (doc.version || 1) + 1;
    const { error: dbError } = await G.supabase.from('documents').update({
      version:    newVersion,
      size:       file.size,
      updated_at: new Date().toISOString()
    }).eq('id', docId);

    if (dbError) throw dbError;

    // Mettre à jour localement
    doc.version    = newVersion;
    doc.size       = file.size;
    doc.updated_at = new Date().toISOString();

    // Broadcaster la mise à jour aux autres collaborateurs
    if (_realtimeChannel) {
      _realtimeChannel.send({
        type: 'broadcast',
        event: 'doc_updated',
        payload: { docId, version: newVersion, updatedBy: G.currentUser.name || G.currentUser.email }
      });
    }

    // Audit
    await addAuditLog('auto_version', 'document', docId, `Version ${newVersion} sauvegardée automatiquement (${formatBytes(file.size)})`);

    // Rafraîchir l'affichage
    renderDocuments();
    updatePreviewMetadata(doc);

    console.log(`✅ Version ${newVersion} uploadée pour "${doc.name}"`);
  } catch(err) {
    console.error('autoUpload error:', err);
    showSyncBadge(doc.name, 'error');
    showToast('Erreur sync: ' + err.message, 'error');
  }
}

// Exposer stopFileWatch globalement
window.stopFileWatch = stopFileWatch;

// ── Commentaires ──
function toggleCommentsPanel() {
  const panel = document.getElementById('commentsPanel');
  if (panel) panel.classList.toggle('hidden');
}

async function loadComments(docId) {
  if (!docId || !G.supabase) return;
  try {
    const { data } = await G.supabase.from('document_comments')
      .select('*').eq('document_id', docId).order('created_at', { ascending: true }).limit(100);
    _commentsCache[docId] = data || [];
    renderComments(docId);
  } catch(e) { /* table peut ne pas exister */ }
}

function renderComments(docId) {
  const list  = document.getElementById('commentsList');
  const count = document.getElementById('commentsCount');
  if (!list) return;
  const comments = _commentsCache[docId] || [];
  if (count) count.textContent = comments.length;
  if (!comments.length) {
    list.innerHTML = '<p class="text-blue-400/40 text-xs text-center py-4">Aucun commentaire. Soyez le premier !</p>';
    return;
  }
  list.innerHTML = comments.map(c => `
    <div class="flex gap-2">
      <div class="w-6 h-6 rounded-full bg-blue-500/30 flex items-center justify-center text-xs text-blue-300 flex-shrink-0">
        ${(c.user_name || c.user_email || '?').slice(0,1).toUpperCase()}
      </div>
      <div class="flex-1 bg-blue-900/30 rounded-lg px-3 py-2">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-blue-300 text-xs font-medium">${escapeHtml(c.user_name || c.user_email || 'Anonyme')}</span>
          <span class="text-blue-400/40 text-xs">${formatDate(c.created_at)}</span>
        </div>
        <p class="text-white/80 text-xs">${escapeHtml(c.content)}</p>
      </div>
    </div>`).join('');
  list.scrollTop = list.scrollHeight;
}

function appendComment(payload) {
  const docId = G.currentDocId;
  if (!docId) return;
  if (!_commentsCache[docId]) _commentsCache[docId] = [];
  if (!_commentsCache[docId].find(c => c.id === payload.id)) {
    _commentsCache[docId].push(payload);
    renderComments(docId);
    const panel = document.getElementById('commentsPanel');
    if (panel?.classList.contains('hidden')) {
      showToast(`💬 Nouveau commentaire de ${payload.user_name || payload.user_email}`, 'info');
    }
  }
}

async function addComment() {
  const input = document.getElementById('newCommentInput');
  const text  = input?.value.trim();
  const docId = G.currentDocId;
  if (!text || !docId) return;

  const comment = {
    id:          generateId(),
    document_id: docId,
    user_id:     G.currentUser.id,
    user_name:   G.currentUser.name || G.currentUser.email,
    user_email:  G.currentUser.email,
    content:     text,
    created_at:  new Date().toISOString()
  };

  // Sauvegarder en base (si la table existe)
  try {
    await G.supabase.from('document_comments').insert(comment);
  } catch(e) { /* table optionnelle */ }

  // Broadcaster aux autres via Realtime
  if (_realtimeChannel) {
    _realtimeChannel.send({ type: 'broadcast', event: 'comment', payload: { ...comment, docId } });
  }

  // Afficher localement
  appendComment(comment);
  input.value = '';

  // Ouvrir le panneau si fermé
  const panel = document.getElementById('commentsPanel');
  if (panel?.classList.contains('hidden')) panel.classList.remove('hidden');
}

// ── Onglets collaboration modal ──
function switchCollabTab(tab) {
  ['invite','members','activity'].forEach(t => {
    document.getElementById(`collabTab${t.charAt(0).toUpperCase()+t.slice(1)}`)?.classList.add('hidden');
    const btn = document.getElementById(`tab${t.charAt(0).toUpperCase()+t.slice(1)}`);
    if (btn) { btn.classList.remove('bg-blue-500/30','text-white'); btn.classList.add('text-blue-300/70'); }
  });
  document.getElementById(`collabTab${tab.charAt(0).toUpperCase()+tab.slice(1)}`)?.classList.remove('hidden');
  const activeBtn = document.getElementById(`tab${tab.charAt(0).toUpperCase()+tab.slice(1)}`);
  if (activeBtn) { activeBtn.classList.add('bg-blue-500/30','text-white'); activeBtn.classList.remove('text-blue-300/70'); }

  if (tab === 'members') loadCollabMembers();
  if (tab === 'activity') loadCollabActivity();
  updateCollabPresence();
}

async function loadCollabMembers() {
  const docId = G.collabModalDocId;
  const list  = document.getElementById('collabMembersList');
  if (!list || !docId) return;
  const shares = G.shares.filter(s => s.document_id === docId);
  if (!shares.length) {
    list.innerHTML = '<p class="text-blue-400/40 text-xs text-center py-8">Aucun collaborateur invité.</p>';
    return;
  }
  list.innerHTML = shares.map(s => `
    <div class="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-blue-500/30 flex items-center justify-center text-blue-300 font-bold text-sm">
          ${(s.recipient_email || '?').slice(0,1).toUpperCase()}
        </div>
        <div>
          <p class="text-white text-sm">${escapeHtml(s.recipient_email || 'Inconnu')}</p>
          <p class="text-blue-400/50 text-xs">${s.permission === 'view' ? '👁 Lecture' : s.permission === 'download' ? '⬇ Téléchargement' : '✏ Modification'} • ${formatDate(s.created_at)}</p>
        </div>
      </div>
      <button onclick="revokeShare('${s.id}')" class="text-red-400/60 hover:text-red-400 text-xs p-1 rounded" title="Révoquer l'accès">
        <i class="fas fa-user-minus"></i>
      </button>
    </div>`).join('');
}

async function loadCollabActivity() {
  const docId = G.collabModalDocId;
  const list  = document.getElementById('collabActivityList');
  if (!list || !docId || !G.supabase) return;
  try {
    const { data } = await G.supabase.from('audit_logs')
      .select('*').eq('resource_id', docId).order('created_at', { ascending: false }).limit(20);
    if (!data?.length) {
      list.innerHTML = '<p class="text-blue-400/40 text-xs text-center py-8">Aucune activité enregistrée.</p>';
      return;
    }
    list.innerHTML = data.map(log => `
      <div class="flex items-start gap-2 p-2 rounded-lg hover:bg-blue-900/20">
        <i class="fas fa-circle text-blue-400/40 mt-1.5" style="font-size:6px"></i>
        <div>
          <p class="text-white/80 text-xs">${escapeHtml(log.details || log.action || '')}</p>
          <p class="text-blue-400/40 text-xs">${formatDate(log.created_at)}</p>
        </div>
      </div>`).join('');
  } catch(e) {
    list.innerHTML = '<p class="text-blue-400/40 text-xs text-center py-8">Activité non disponible.</p>';
  }
}

function updateCollabPresence() {
  const container = document.getElementById('collabPresenceList');
  if (!container) return;
  const users = Object.values(_presenceUsers);
  if (!users.length) {
    container.innerHTML = '<span class="text-blue-400/40 text-xs">Personne d\'autre en ligne</span>';
    return;
  }
  container.innerHTML = users.map(u => `
    <div class="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 rounded-full">
      <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
      <span class="text-green-300 text-xs">${escapeHtml(u.userName || u.userEmail)}</span>
    </div>`).join('');
}

async function revokeShare(shareId) {
  if (!confirm('Révoquer cet accès ?')) return;
  const { error } = await G.supabase.from('shares').delete().eq('id', shareId);
  if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
  G.shares = G.shares.filter(s => s.id !== shareId);
  showToast('Accès révoqué', 'success');
  loadCollabMembers();
}

// Exposer les nouvelles fonctions
Object.assign(window, {
  editCurrentDocument, toggleCommentsPanel, addComment,
  switchCollabTab, revokeShare, loadCollabMembers, loadCollabActivity
});
  }
  
  // Exposer toutes les fonctions globalement
  window.handleLogin = handleLogin;
  window.handleRegister = handleRegister;
  window.handleLogout = handleLogout;
  window.switchView = switchView;
  window.switchAuthTab = switchAuthTab;
  window.togglePwdInput = togglePwdInput;
  window.demoLogin = demoLogin;
  window.oauthLogin = oauthLogin;
  window.openMobileSidebar = openMobileSidebar;
  window.closeMobileSidebar = closeMobileSidebar;
  window.openUploadModal = openUploadModal;
  window.closeUploadModal = closeUploadModal;
  window.handleDragOver = handleDragOver;
  window.handleDragLeave = handleDragLeave;
  window.handleDrop = handleDrop;
  window.handleDocDrop = handleDocDrop;
  window.handleFileSelect = handleFileSelect;
  window.handleFilePickerSelect = handleFilePickerSelect;
  window.addFilesToSelection = addFilesToSelection;
  window.removeFileFromSelection = removeFileFromSelection;
  window.addUploadTag = addUploadTag;
  window.removeUploadTag = removeUploadTag;
  window.uploadDocument = uploadDocument;
  window.setDocScope = setDocScope;
  window.downloadDocument = downloadDocument;
  window.downloadCurrentDocument = downloadCurrentDocument;
  window.shareCurrentDocument = shareCurrentDocument;
  window.deleteDocument = deleteDocument;
  window.openPreviewModal = openPreviewModal;
  window.closePreviewModal = closePreviewModal;
  window.openShareModal = openShareModal;
  window.closeShareModal = closeShareModal;
  window.switchShareTab = switchShareTab;
  window.shareDocument = shareDocument;
  window.revokeShare = revokeShare;
  window.loadShareHistory = loadShareHistory;
  window.switchSharedTab = switchSharedTab;
  window.renderDashboard = renderDashboard;
  window.renderShared = renderShared;
  window.renderDocuments = renderDocuments;
  window.filterDocuments = filterDocuments;
  window.closeWfDetailModal = closeWfDetailModal;
  window.switchWfView = switchWfView;
  window.switchDocsTab = switchDocsTab;
  window.toggleViewMode = toggleViewMode;
  window.applyFilters = applyFilters;
  window.clearFilters = clearFilters;
  window.filterByType = filterByType;
  window.filterByTag = filterByTag;
  window.renderWorkflows = renderWorkflows;
  window.openCreateWorkflowModal = openCreateWorkflowModal;
  window.closeWorkflowModal = closeWorkflowModal;
  window.createWorkflow = createWorkflow;
  window.actOnWorkflow = actOnWorkflow;
  window.addWfComment = addWfComment;
  window.openWfDetail = openWfDetail;
  window.closeWfDetail = closeWfDetail;
  window.filterWorkflows = filterWorkflows;
  window.searchWorkflows = searchWorkflows;
  window.setWfView = setWfView;
  window.renderUsers = renderUsers;
  window.getRoleBadgeClass = getRoleBadgeClass;
  window.addAuditLog = addAuditLog;
  window.renderFolderContents = renderFolderContents;
  window.updatePendingUsersCount = updatePendingUsersCount;
  window.clearTagFilter = clearTagFilter;
  window.loadDeletedDocs = loadDeletedDocs;
  window.validateUser = validateUser;
  window.deleteUser = deleteUser;
  window.resetUserPassword = resetUserPassword;
  window.openCreateUserModal = openCreateUserModal;
  window.closeAddUserModal = closeAddUserModal;
  window.addUser = addUser;
  window.renderPendingUsers = renderPendingUsers;
  window.refreshPendingUsers = refreshPendingUsers;
  window.approveAllPending = approveAllPending;
  window.rejectAllPending = rejectAllPending;
  window.renderTags = renderTags;
  window.createTag = createTag;
  window.deleteTag = deleteTag;
  window.renderSettings = renderSettings;
  window.saveProfile = saveProfile;
  window.toggleSetting = toggleSetting;
  window.renderBilling = renderBilling;
  window.selectPlan = selectPlan;
  window.simulateUpgrade = simulateUpgrade;
  window.renderSecurity = renderSecurity;
  window.exportAuditLog = exportAuditLog;
  window.exportAllData = exportAllData;
  window.exportDocumentsCsv = exportDocumentsCsv;
  window.switchSecurityTab = switchSecurityTab;
  window.restoreDocument = restoreDocument;
  window.generateApiKey = generateApiKey;
  window.renderSysLogs = renderSysLogs;
  window.filterLogs = filterLogs;
  window.clearSysLogs = clearSysLogs;
  window.exportSysLogs = exportSysLogs;
  window.renderRBAC = renderRBAC;
  window.openRoleModal = openRoleModal;
  window.closeRoleModal = closeRoleModal;
  window.saveRole = saveRole;
  window.renderAnalytics = renderAnalytics;
  window.exportAnalytics = exportAnalytics;
  window.renderFolderTree = renderFolderTree;
  window.deleteFolder = deleteFolder;
  window.loadExistingSignatures = loadExistingSignatures;
  window.deleteRule = deleteRule;
  window.deleteBackup = deleteBackup;
  window.refreshAnalytics = refreshAnalytics;
  window.renderFolders = renderFolders;
  window.openFolder = openFolder;
  window.openFolderModal = openFolderModal;
  window.closeFolderModal = closeFolderModal;
  window.createFolder = createFolder;
  window.moveDocument = moveDocument;
  window.renderSignatures = renderSignatures;
  window.openSignModal = openSignModal;
  window.closeSignModal = closeSignModal;
  window.clearSignature = clearSignature;
  window.submitSignature = submitSignature;
  window.openRequestSignatureModal = openRequestSignatureModal;
  window.closeRequestSignatureModal = closeRequestSignatureModal;
  window.requestSignature = requestSignature;
  window.renderAI = renderAI;
  window.analyzeDocument = analyzeDocument;
  window.analyzeAllDocuments = analyzeAllDocuments;
  window.askAI = askAI;
  window.renderAutomation = renderAutomation;
  window.openWfRuleModal = openWfRuleModal;
  window.closeWfRuleModal = closeWfRuleModal;
  window.createWfRule = createWfRule;
  window.quickCreateRule = quickCreateRule;
  window.renderIntegrations = renderIntegrations;
  window.connectIntegration = connectIntegration;
  window.addWebhook = addWebhook;
  window.renderBackups = renderBackups;
  window.createBackup = createBackup;
  window.restoreBackup = restoreBackup;
  window.toggleAutoBackup = toggleAutoBackup;
  window.saveBackupSettings = saveBackupSettings;
  window.renderApiKeys = renderApiKeys;
  window.generateApiKeyV6 = generateApiKeyV6;
  window.revokeApiKey = revokeApiKey;
  window.copyApiKey = copyApiKey;
  window.renderBillingV6 = renderBillingV6;
  window.renderAuditV6 = renderAuditV6;
  window.setAuditFilter = setAuditFilter;
  window.filterAuditLogs = filterAuditLogs;
  window.clearAuditFilters = clearAuditFilters;
  window.prevAuditPage = prevAuditPage;
  window.nextAuditPage = nextAuditPage;
  window.handleGlobalSearch = handleGlobalSearch;
  window.runAdvSearch = runAdvSearch;
  window.clearAdvSearch = clearAdvSearch;
  window.runFTSearch = runFTSearch;
  window.renderAdvancedSearch = renderAdvancedSearch;
  window.renderVersioning = renderVersioning;
  window.filterVersionDocs = filterVersionDocs;
  window.restoreVersion = restoreVersion;
  window.renderSearchV7 = renderSearchV7;
  window.renderRBACV7 = renderRBACV7;
  window.updateUserRole = updateUserRole;
  window.createRoleV7 = createRoleV7;
  window.openRichEditor = openRichEditor;
  window.closeRichEditor = closeRichEditor;
  window._onRichEditorInput = _onRichEditorInput;
  window._saveRichContent = _saveRichContent;
  window.handleDocDragStart = handleDocDragStart;
  window.showDocContextMenu = showDocContextMenu;
  window.canValidateUsers = canValidateUsers;
  window.formatBytes = formatBytes;
  window.formatDate = formatDate;
  window.getFileIcon = getFileIcon;
  window.showToast = showToast;
  window.openResetModal = openResetModal;
  window.closeResetModal = closeResetModal;
  window.sendResetEmail = sendResetEmail;
  window.generatePublicLink = generatePublicLink;
  window.copyShareLink = copyShareLink;
  window.scanAllDocuments = scanAllDocuments;
  window.renderAuditLog = renderAuditLog;
  window.exportUserData = exportUserData;
  window.requestAccountDeletion = requestAccountDeletion;
  window.copySqlSchema = copySqlSchema;
  window.openDangerModal = openDangerModal;
  window.closeNotifPanel = closeNotifPanel;
  window.toggleNotifications = toggleNotifications;
  window.markAllNotifRead = markAllNotifRead;
  window.refreshShares = refreshShares;
  window.openMoveModal         = openMoveModal;
  window.closeMoveModal        = closeMoveModal;
  window.confirmMoveDocument   = confirmMoveDocument;
  window.openCollabModal       = openCollabModal;
  window.closeCollabModal      = closeCollabModal;
  window.inviteCollaborator    = inviteCollaborator;
window.openQuickShareModal     = openQuickShareModal;
window.closeQuickShareModal    = closeQuickShareModal;
window.switchQuickShareTab     = switchQuickShareTab;
window.executeQuickShare       = executeQuickShare;
window.addShareRecipient       = addShareRecipient;
window.handleShareEmailKeydown = handleShareEmailKeydown;
window.suggestShareRecipients  = suggestShareRecipients;
window.selectQsSuggestion      = selectQsSuggestion;
window.toggleQsLinkPwd         = toggleQsLinkPwd;
window.toggleQsLinkMaxViews    = toggleQsLinkMaxViews;
window.openShareDetailModal    = openShareDetailModal;
window.closeShareDetailModal   = closeShareDetailModal;
window.filterSharedView        = filterSharedView;
window.clearSharedFilters      = clearSharedFilters;
window.createPublicLink        = createPublicLink;
window.copyPublicLink          = copyPublicLink;
window.copyQsLink              = copyQsLink;
window.shareViaEmail           = shareViaEmail;
window.revokePublicLink        = revokePublicLink;
window.deletePublicLink        = deletePublicLink;
window.extendPublicLink        = extendPublicLink;
window.loadShareActivity       = loadShareActivity;
window.extendShare             = extendShare;
window.renewShare              = renewShare;
window.deleteShareRecord       = deleteShareRecord;
window.purgeExpiredShares      = purgeExpiredShares;
window.toggleBulkSelect        = toggleBulkSelect;
window.bulkRevokeSelected      = bulkRevokeSelected;
window.bulkExtendSelected      = bulkExtendSelected;
window.clearBulkSelection      = clearBulkSelection;

  window.exportSearchResults    = exportSearchResults;
  window.createNewVersion       = createNewVersion;
  window.confirmCreateNewVersion= confirmCreateNewVersion;
  window.handleNewVersionFile   = handleNewVersionFile;
  window.showVersionHistory     = showVersionHistory;
  window.downloadVersion        = downloadVersion;
  window.compareVersions        = compareVersions;
  window.searchSysLogs          = searchSysLogs;
  window.sysLogsPrevPage        = sysLogsPrevPage;
  window.sysLogsNextPage        = sysLogsNextPage;
  window.toggleSysLogsAutoRefresh = toggleSysLogsAutoRefresh;

});


// ─── Exposition globale — ui.js ───
window.switchView              = switchView;
window.openMobileSidebar       = openMobileSidebar;
window.closeMobileSidebar      = closeMobileSidebar;
window.renderDashboard         = renderDashboard;
window.updateBadges            = updateBadges;
window.updateUI                = updateUI;
window.updateUserDisplay       = updateUserDisplay;
window.updateMenuVisibility    = updateMenuVisibility;
window.updateStorageDisplay    = updateStorageDisplay;
window.formatBytes             = formatBytes;
window.formatDate              = formatDate;
window.getFileIcon             = getFileIcon;
window.showToast               = showToast;
window.escapeHtml              = escapeHtml;
window.getRoleBadgeClass       = getRoleBadgeClass;
window.generateId              = generateId;
window.canValidateUsers        = canValidateUsers;
window.addAuditLog             = addAuditLog;
window.handleGlobalSearch      = handleGlobalSearch;
window.openResetModal          = openResetModal;
window.closeResetModal         = closeResetModal;
window.sendResetEmail          = sendResetEmail;
window.closeNotifPanel         = closeNotifPanel;
window.toggleNotifications     = toggleNotifications;
window.markAllNotifRead        = markAllNotifRead;
window.openRichEditor          = openRichEditor;
window.closeRichEditor         = closeRichEditor;
window._onRichEditorInput      = _onRichEditorInput;
window._saveRichContent        = _saveRichContent;
window.renderAdvancedSearch    = renderAdvancedSearch;
window.runAdvSearch            = runAdvSearch;
window.clearAdvSearch          = clearAdvSearch;
window.runFTSearch             = runFTSearch;
window.renderSearchV7          = renderSearchV7;
window.renderVersioning        = renderVersioning;
window.filterVersionDocs       = filterVersionDocs;
window.restoreVersion          = restoreVersion;
window.createNewVersion        = createNewVersion;
window.confirmCreateNewVersion = confirmCreateNewVersion;
window.handleNewVersionFile    = handleNewVersionFile;
window.showVersionHistory      = showVersionHistory;
window.downloadVersion         = downloadVersion;
window.compareVersions         = compareVersions;
window.exportSearchResults     = exportSearchResults;
window.searchSysLogs           = searchSysLogs;
window.sysLogsPrevPage         = sysLogsPrevPage;
window.sysLogsNextPage         = sysLogsNextPage;
window.toggleSysLogsAutoRefresh = toggleSysLogsAutoRefresh;
