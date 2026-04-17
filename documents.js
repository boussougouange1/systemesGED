// ============================================
// SystemesGED v7.2 — MODULE : documents.js (CORRIGÉ)
// Responsabilités : rendu des documents, filtres, upload, prévisualisation, suppression, déplacement, collaboration, partage
// ============================================

// Dépendances : auth.js (G, CONFIG), ui.js (showToast, formatBytes, formatDate, getFileIcon, escapeHtml, addAuditLog, generateId, renderDocCard, renderDocListItem)

// Sécurisation de l'éditeur riche : polyfill DOMPurify minimal
if (typeof DOMPurify === 'undefined') {
  window.DOMPurify = { sanitize: (dirty) => dirty.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') };
}

// ═══════════════════════════════════════════════════════════════════════
// 1. RENDU DES DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════

async function renderDocuments() {
  const grid = document.getElementById('documentGrid');
  if (!grid) { console.warn('documentGrid non trouvé'); return; }
  console.log('🔄 Rendu des documents, tab:', G.docsTab);

  // Recharger depuis Supabase avec try/catch
  try {
    if (G.supabase && G.currentUser?.companyId) {
      const { data, error } = await G.supabase
        .from('documents')
        .select('*')
        .eq('company_id', G.currentUser.companyId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      if (!error && data) G.documents = data;
    }
  } catch (err) {
    console.warn('renderDocuments: rechargement échoué', err);
  }

  let filtered = G.documents.filter(d => !d.is_deleted);

  if (G.currentTagFilter) {
    filtered = filtered.filter(d => Array.isArray(d.tags) && d.tags.includes(G.currentTagFilter));
  }

  const isAdmin   = G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
  const isManager = G.currentUser?.role === 'manager' || isAdmin;

  // Filtrer selon l'onglet
  if (G.docsTab === 'company') {
    filtered = filtered.filter(d => d.scope === 'company');
  } else if (G.docsTab === 'personal') {
    if (isManager) {
      filtered = filtered.filter(d => d.scope === 'personal');
    } else {
      filtered = filtered.filter(d => d.scope === 'personal' && d.owner_id === G.currentUser.id);
    }
  } else if (G.docsTab === 'mine') {
    filtered = filtered.filter(d => d.owner_id === G.currentUser.id);
  } else if (G.docsTab === 'all') {
    if (!isManager) filtered = filtered.filter(d => d.scope === 'company' || d.owner_id === G.currentUser.id);
  } else if (G.docsTab === 'shared') {
    const sharedIds = new Set(
      G.shares
        .filter(s => s.recipient_email === G.currentUser.email && s.status === 'active')
        .map(s => s.document_id)
    );
    filtered = filtered.filter(d => sharedIds.has(d.id));
  }

  // Filtre par type
  const typeFilter = document.getElementById('filterType')?.value;
  if (typeFilter) filtered = filtered.filter(d => d.type === typeFilter);

  // Filtre par date
  const dateFilter = document.getElementById('filterDate')?.value;
  if (dateFilter === 'today') {
    const today = new Date().toDateString();
    filtered = filtered.filter(d => new Date(d.created_at).toDateString() === today);
  } else if (dateFilter === 'week') {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    filtered = filtered.filter(d => new Date(d.created_at) >= weekAgo);
  } else if (dateFilter === 'month') {
    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
    filtered = filtered.filter(d => new Date(d.created_at) >= monthAgo);
  }

  const resultsCount = document.getElementById('resultsCount');
  if (resultsCount) resultsCount.textContent = `${filtered.length} document${filtered.length > 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    const msgs = {
      company:  'Aucun document d\'entreprise. Importez des documents pour les partager avec votre équipe.',
      personal: 'Aucun document personnel. Importez vos documents privés.',
      mine:     'Vous n\'avez pas encore importé de documents.',
      shared:   'Aucun document partagé avec vous.'
    };
    grid.innerHTML = `
      <div class="col-span-full text-center py-16">
        <i class="fas fa-folder-open text-5xl mb-4 block opacity-20 text-blue-400"></i>
        <p class="text-blue-300/60">${msgs[G.docsTab] || 'Aucun document trouvé.'}</p>
        <button onclick="openUploadModal()" class="mt-4 btn-primary px-5 py-2 rounded-xl text-white text-sm font-medium inline-flex items-center gap-2">
          <i class="fas fa-cloud-upload-alt"></i>Importer un document
        </button>
      </div>`;
    return;
  }

  grid.className = G.viewMode === 'grid' ? 'doc-grid' : 'space-y-2';
  grid.innerHTML = filtered.map(doc =>
    G.viewMode === 'grid' ? renderDocCard(doc) : renderDocListItem(doc)
  ).join('');

  console.log(`✅ ${filtered.length} documents affichés`);
}

// ── Badge scope cliquable (personnel ↔ entreprise) ──────
function buildScopeBadge(doc) {
  const isOwner   = doc.owner_id === G.currentUser.id;
  const isAdmin   = G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
  const isManager = G.currentUser?.role === 'manager' || isAdmin;
  const canChange = isOwner || isManager;
  if (doc.scope === 'company') {
    return canChange
      ? `<button onclick="event.stopPropagation(); changeDocScope('${doc.id}', 'personal')"
                 class="collab-badge text-[10px] hover:bg-blue-600/40 transition-colors cursor-pointer"
                 title="Passer en Personnel">
           <i class="fas fa-building mr-1"></i>Entreprise
           <i class="fas fa-exchange-alt ml-1 opacity-50"></i>
         </button>`
      : `<span class="collab-badge text-[10px]"><i class="fas fa-building mr-1"></i>Entreprise</span>`;
  } else {
    return canChange
      ? `<button onclick="event.stopPropagation(); changeDocScope('${doc.id}', 'company')"
                 class="text-[10px] text-purple-400/80 hover:text-purple-300 hover:bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20 transition-colors cursor-pointer"
                 title="Partager avec l'entreprise">
           <i class="fas fa-user mr-1"></i>Personnel
           <i class="fas fa-exchange-alt ml-1 opacity-50"></i>
         </button>`
      : `<span class="text-[10px] text-purple-400/60"><i class="fas fa-user mr-1"></i>Personnel</span>`;
  }
}

// ── Changer la portée d'un document ─────────────────────
async function changeDocScope(docId, newScope) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  const isOwner   = doc.owner_id === G.currentUser.id;
  const isAdmin   = G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
  const isManager = G.currentUser?.role === 'manager' || isAdmin;
  if (!isOwner && !isManager) {
    showToast('Permission refusée', 'error');
    return;
  }
  const label = newScope === 'company' ? 'Entreprise' : 'Personnel';
  const icon  = newScope === 'company' ? 'fa-building' : 'fa-user';
  if (!confirm(`Passer "${doc.name}" en mode ${label} ?\n\n${
    newScope === 'company'
      ? 'Ce document sera visible par tous les membres de l\'entreprise.'
      : 'Ce document ne sera plus visible que par vous (et les administrateurs).'
  }`)) return;
  try {
    const { error } = await G.supabase
      .from('documents')
      .update({ scope: newScope, updated_at: new Date().toISOString() })
      .eq('id', docId);
    if (error) throw error;
    doc.scope = newScope;
    await addAuditLog(
      'scope_change', 'document', docId,
      `Portée modifiée → ${label} par ${G.currentUser.email}`
    );
    showToast(`<i class="fas ${icon} mr-2"></i>"${doc.name}" → ${label}`, 'success');
    renderDocuments();
  } catch (err) {
    showToast('Erreur : ' + err.message, 'error');
  }
}

function filterDocuments(query) {
  if (!query || !query.trim()) { renderDocuments(); return; }
  const q = query.toLowerCase();
  const filtered = G.documents.filter(d =>
    !d.is_deleted && (
      d.name.toLowerCase().includes(q) ||
      (d.description||'').toLowerCase().includes(q) ||
      (Array.isArray(d.tags) && d.tags.some(t=>t.toLowerCase().includes(q)))
    )
  );
  const container = document.getElementById('docGrid') || document.getElementById('documentsGrid');
  if (container) {
    if (filtered.length === 0) {
      container.innerHTML = '<div class="col-span-full text-center py-12 text-blue-300/40"><i class="fas fa-search text-4xl mb-3 block opacity-20"></i><p>Aucun résultat pour \"'+escapeHtml(query)+'\"</p></div>';
    } else {
      container.innerHTML = filtered.map(doc => renderDocCard(doc)).join('');
    }
  }
}

function renderDocCard(doc) {
  const isOwner = doc.owner_id === G.currentUser.id;
  const canEdit = isOwner || G.currentUser.role === 'admin' || G.currentUser.role === 'manager';
  const fileIcon = getFileIcon(doc.type);
  const iconClass = fileIcon.split(' ')[0];
  const colorClass = fileIcon.split(' ')[1] || 'text-blue-400';
  
  return `
    <div class="document-card glass-card rounded-2xl p-4 border border-blue-500/20 cursor-pointer group hover:scale-[1.02] transition-all duration-200" 
         onclick="openPreviewModal('${doc.id}')" 
         draggable="true" 
         ondragstart="handleDocDragStart(event, '${doc.id}')" 
         oncontextmenu="showDocContextMenu(event, '${doc.id}')">
      
      <!-- En-tête avec icône et actions -->
      <div class="flex items-start justify-between mb-3">
        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center ${colorClass} text-2xl">
          <i class="fas ${iconClass}"></i>
        </div>
        <div class="opacity-0 group-hover:opacity-100 transition-all duration-200 flex gap-1">
          <button onclick="event.stopPropagation(); downloadDocument('${doc.id}')" 
                  class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors" 
                  title="Télécharger">
            <i class="fas fa-download"></i>
          </button>
          <button onclick="event.stopPropagation(); openShareModal('${doc.id}')" 
                  class="p-2 rounded-lg hover:bg-purple-500/20 text-purple-400 transition-colors" 
                  title="Partager">
            <i class="fas fa-share-alt"></i>
          </button>
          <button onclick="event.stopPropagation(); openCollabModal('${doc.id}')" 
                  class="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-colors" 
                  title="Inviter à collaborer">
            <i class="fas fa-users"></i>
          </button>
          <button onclick="event.stopPropagation(); openMoveModal('${doc.id}')" 
                  class="p-2 rounded-lg hover:bg-yellow-500/20 text-yellow-400 transition-colors" 
                  title="Déplacer">
            <i class="fas fa-folder-open"></i>
          </button>
          ${canEdit ? `
          <button onclick="event.stopPropagation(); deleteDocument('${doc.id}')" 
                  class="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors" 
                  title="Supprimer">
            <i class="fas fa-trash"></i>
          </button>
          ` : ''}
        </div>
      </div>
      
      <!-- Informations du document -->
      <h4 class="text-white font-semibold text-sm mb-1 truncate" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</h4>
      <p class="text-blue-300/60 text-xs mb-2">
        ${formatBytes(doc.size)} • ${formatDate(doc.created_at)}
      </p>
      
      <!-- Tags et scope -->
      <div class="flex items-center justify-between">
        <div class="flex gap-1 flex-wrap">
          ${(doc.tags || []).slice(0, 2).map(t => `<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 cursor-pointer hover:bg-blue-400/30" onclick="event.stopPropagation(); filterByTag('${escapeHtml(t)}')">${escapeHtml(t)}</span>`).join('')}
          ${(doc.tags || []).length > 2 ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">+${doc.tags.length - 2}</span>` : ''}
        </div>
        ${buildScopeBadge(doc)}
      </div>
      
      <!-- Métadonnées supplémentaires -->
      <div class="mt-2 pt-2 border-t border-blue-500/10 flex items-center justify-between text-xs">
        <span class="text-blue-400/50">
          <i class="fas fa-code-branch mr-1"></i>v${doc.version || 1}
        </span>
        <span class="text-blue-400/50">
          <i class="fas fa-eye mr-1"></i>${doc.views || 0}
        </span>
        <span class="text-blue-400/50">
          <i class="fas fa-download mr-1"></i>${doc.downloads || 0}
        </span>
      </div>
    </div>
  `;
}

function renderDocListItem(doc) {
  const isOwner = doc.owner_id === G.currentUser.id;
  const canEdit = isOwner || G.currentUser.role === 'admin' || G.currentUser.role === 'manager';
  const fileIcon = getFileIcon(doc.type);
  const iconClass = fileIcon.split(' ')[0];
  const colorClass = fileIcon.split(' ')[1] || 'text-blue-400';
  
  return `
    <div class="doc-list-item glass-card rounded-xl border border-blue-500/10 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all cursor-pointer group" 
         onclick="openPreviewModal('${doc.id}')">
      
      <!-- Icône -->
      <div class="doc-icon w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center ${colorClass} flex-shrink-0">
        <i class="fas ${iconClass} text-xl"></i>
      </div>
      
      <!-- Contenu principal -->
      <div class="doc-content flex-1 min-w-0">
        <h4 class="text-white font-medium text-sm truncate" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</h4>
        <div class="flex items-center gap-3 mt-1">
          <p class="text-blue-300/60 text-xs">${formatBytes(doc.size)}</p>
          <span class="text-blue-400/40">•</span>
          <p class="text-blue-300/60 text-xs">${formatDate(doc.created_at)}</p>
          ${buildScopeBadge(doc)}
        </div>
        <div class="flex gap-2 mt-1">
          ${(doc.tags || []).slice(0, 3).map(t => `<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 cursor-pointer hover:bg-blue-400/30" onclick="event.stopPropagation(); filterByTag('${escapeHtml(t)}')">${escapeHtml(t)}</span>`).join('')}
        </div>
      </div>
      
      <!-- Métadonnées supplémentaires -->
      <div class="hidden sm:flex items-center gap-4 text-xs text-blue-400/50 mr-4">
        <span><i class="fas fa-code-branch mr-1"></i>v${doc.version || 1}</span>
        <span><i class="fas fa-eye mr-1"></i>${doc.views || 0}</span>
        <span><i class="fas fa-download mr-1"></i>${doc.downloads || 0}</span>
      </div>
      
      <!-- Actions -->
      <div class="doc-actions flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <button onclick="event.stopPropagation(); downloadDocument('${doc.id}')" 
                class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors" 
                title="Télécharger">
          <i class="fas fa-download"></i>
        </button>
        <button onclick="event.stopPropagation(); openShareModal('${doc.id}')" 
                class="p-2 rounded-lg hover:bg-purple-500/20 text-purple-400 transition-colors" 
                title="Partager">
          <i class="fas fa-share-alt"></i>
        </button>
        <button onclick="event.stopPropagation(); openCollabModal('${doc.id}')" 
                class="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-colors" 
                title="Inviter à collaborer">
          <i class="fas fa-users"></i>
        </button>
        <button onclick="event.stopPropagation(); openMoveModal('${doc.id}')" 
                class="p-2 rounded-lg hover:bg-yellow-500/20 text-yellow-400 transition-colors" 
                title="Déplacer">
          <i class="fas fa-folder-open"></i>
        </button>
        ${canEdit ? `
        <button onclick="event.stopPropagation(); deleteDocument('${doc.id}')" 
                class="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors" 
                title="Supprimer">
          <i class="fas fa-trash"></i>
        </button>
        ` : ''}
      </div>
    </div>
  `;
}

async function switchDocsTab(tab) {
  console.log('🔄 Changement d\'onglet documents:', tab);
  G.docsTab = tab;

  // Mettre à jour l'interface des onglets
  document.querySelectorAll('.docs-tab').forEach(el => el.classList.remove('active'));
  const tabEl = document.getElementById(`docsTab-${tab}`);
  if (tabEl) tabEl.classList.add('active');

  const docTitle = document.getElementById('documentsTitle');
  if (docTitle) {
    const titles = {
      company: 'Documents de l\'entreprise',
      personal: 'Mes documents personnels',
      mine: 'Mes documents',
      shared: 'Documents partagés avec moi'
    };
    docTitle.textContent = titles[tab] || 'Documents';
  }

  // Afficher loader
  const grid = document.getElementById('documentGrid');
  if (grid) {
    grid.innerHTML = '<div class="col-span-full text-center py-12"><i class="fas fa-spinner fa-spin text-3xl text-blue-400"></i><p class="mt-2 text-blue-300/60">Chargement…</p></div>';
  }

  // Recharger depuis Supabase selon l'onglet
  try {
    if (G.supabase && G.currentUser?.companyId) {
      let query = G.supabase.from('documents').select('*')
        .eq('is_deleted', false)
        .eq('company_id', G.currentUser.companyId)
        .order('created_at', { ascending: false });

      if (tab === 'company') {
        query = query.eq('scope', 'company');
      } else if (tab === 'personal') {
        const isManager = G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin || G.currentUser?.role === 'manager';
        if (isManager) {
          query = query.eq('scope', 'personal');
        } else {
          query = query.eq('scope', 'personal').eq('owner_id', G.currentUser.id);
        }
      } else if (tab === 'all') {
        // Aucun filtre supplémentaire — tous les docs de l'entreprise
      } else if (tab === 'mine') {
        query = query.eq('owner_id', G.currentUser.id);
      } else if (tab === 'shared') {
        const { data: receivedShares } = await G.supabase
          .from('shares')
          .select('document_id')
          .eq('recipient_email', G.currentUser.email)
          .eq('status', 'active');
        const ids = (receivedShares || []).map(s => s.document_id).filter(Boolean);
        if (ids.length === 0) {
          G.documents = G.documents.filter(d => d.scope !== 'personal' || d.owner_id === G.currentUser.id);
          renderDocuments();
          return;
        }
        query = G.supabase.from('documents').select('*').in('id', ids).eq('is_deleted', false);
      }

      const { data, error } = await query;
      if (!error && data) {
        const newIds = new Set(data.map(d => d.id));
        G.documents = [
          ...data,
          ...G.documents.filter(d => !newIds.has(d.id))
        ];
      }
    }
  } catch (err) {
    console.warn('switchDocsTab: erreur Supabase', err);
  }

  renderDocuments();
}

function toggleViewMode() {
  G.viewMode = G.viewMode === 'grid' ? 'list' : 'grid';
  const viewModeIcon = document.getElementById('viewModeIcon');
  if (viewModeIcon) viewModeIcon.className = G.viewMode === 'grid' ? 'fas fa-th-large' : 'fas fa-list';
  renderDocuments();
}

function applyFilters() {
  renderDocuments();
}

function clearFilters() {
  const filterType = document.getElementById('filterType');
  const filterDate = document.getElementById('filterDate');
  if (filterType) filterType.value = '';
  if (filterDate) filterDate.value = '';
  G.currentTagFilter = null;
  renderDocuments();
}

function filterByType(type) {
  const filterType = document.getElementById('filterType');
  if (filterType) filterType.value = type;
  switchView('documents');
}

function filterByTag(tagName) {
  G.currentTagFilter = tagName;
  renderDocuments();
  showToast(`Filtre appliqué : ${tagName}`, 'info');
}

function clearTagFilter() {
  G.currentTagFilter = null;
  renderDocuments();
  showToast('Filtre tag réinitialisé', 'info');
}

// ═══════════════════════════════════════════════════════════════════════
// 2. UPLOAD (avec validation stricte des extensions)
// ═══════════════════════════════════════════════════════════════════════

function openUploadModal() {
  const modal = document.getElementById('uploadModal');
  if (modal) modal.classList.remove('hidden');
  G.selectedFiles = [];
  G.uploadTags = [];
  renderUploadTags();
  renderSelectedFiles();
}

function closeUploadModal() {
  const modal = document.getElementById('uploadModal');
  if (modal) modal.classList.add('hidden');
  G.selectedFiles = [];
}

function handleDragOver(e, zoneId) {
  e.preventDefault();
  const zone = document.getElementById(zoneId);
  if (zone) zone.classList.add('drag-over');
}

function handleDragLeave(e, zoneId) {
  e.preventDefault();
  const zone = document.getElementById(zoneId);
  if (zone) zone.classList.remove('drag-over');
}

function handleDrop(e, zoneId) {
  e.preventDefault();
  const zone = document.getElementById(zoneId);
  if (zone) zone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  addFilesToSelection(files);
}

function handleDocDrop(e) {
  e.preventDefault();
  const dropZone = document.getElementById('docDropZone');
  if (dropZone) {
    dropZone.classList.remove('drag-over');
    dropZone.style.backgroundColor = 'rgba(59,130,246,0.05)';
    setTimeout(() => { dropZone.style.backgroundColor = ''; }, 300);
  }
  const files = Array.from(e.dataTransfer.files);
  if (files.length === 0) { showToast('Aucun fichier détecté', 'warning'); return; }
  const validFiles = files.filter(f => f.size <= CONFIG.maxFileSize);
  const invalidFiles = files.filter(f => f.size > CONFIG.maxFileSize);
  if (invalidFiles.length > 0) showToast(`${invalidFiles.length} fichier(s) ignoré(s) (taille > ${formatBytes(CONFIG.maxFileSize)})`, 'warning');
  if (validFiles.length === 0) { showToast('Aucun fichier valide à importer', 'warning'); return; }
  addFilesToSelection(validFiles);
  setTimeout(() => { if (G.selectedFiles.length > 0) uploadDocument(); }, 100);
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  addFilesToSelection(files);
}

function handleFilePickerSelect(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;
  const validFiles = files.filter(f => f.size <= CONFIG.maxFileSize);
  const invalidFiles = files.filter(f => f.size > CONFIG.maxFileSize);
  if (invalidFiles.length > 0) showToast(`${invalidFiles.length} fichier(s) ignoré(s) (taille > ${formatBytes(CONFIG.maxFileSize)})`, 'warning');
  if (validFiles.length === 0) { showToast('Aucun fichier valide à importer', 'warning'); return; }
  addFilesToSelection(validFiles);
  setTimeout(() => { if (G.selectedFiles.length > 0) uploadDocument(); }, 100);
  e.target.value = '';
}

function renderSelectedFiles() {
  const list = document.getElementById('selectedFilesList');
  if (!list) return;
  if (G.selectedFiles.length === 0) { list.innerHTML = ''; return; }
  list.innerHTML = G.selectedFiles.map((file, idx) => `
    <div class="flex items-center justify-between p-2 rounded-lg bg-blue-900/30 border border-blue-500/20">
      <div class="flex items-center gap-2 min-w-0">
        <i class="fas fa-file text-blue-400"></i>
        <span class="text-sm text-white truncate">${file.name}</span>
        <span class="text-xs text-blue-300/60">${formatBytes(file.size)}</span>
      </div>
      <button onclick="removeFileFromSelection(${idx})" class="p-1 text-red-400 hover:text-red-300"><i class="fas fa-times"></i></button>
    </div>
  `).join('');
}

function removeFileFromSelection(idx) {
  G.selectedFiles.splice(idx, 1);
  renderSelectedFiles();
}

function addUploadTag() {
  const input = document.getElementById('tagInput');
  const tag = input?.value.trim();
  if (tag && !G.uploadTags.includes(tag)) {
    G.uploadTags.push(tag);
    if (input) input.value = '';
    renderUploadTags();
  }
}

function renderUploadTags() {
  const container = document.getElementById('uploadTagsContainer');
  if (!container) return;
  container.innerHTML = G.uploadTags.map((t, i) => `
    <span class="tag">
      ${t}
      <i class="fas fa-times tag-close" onclick="removeUploadTag(${i})"></i>
    </span>
  `).join('');
}

function removeUploadTag(idx) {
  G.uploadTags.splice(idx, 1);
  renderUploadTags();
}

// Upload avec vérification des extensions
async function uploadDocument() {
  if (G._isDemo) { showToast('Mode démo : import désactivé — rechargez la page pour créer un vrai compte', 'warning'); return; }
  if (G.selectedFiles.length === 0) { showToast('Aucun fichier sélectionné', 'warning'); return; }

  // Vérifier l'espace
  const used = G.documents.reduce((sum, d) => sum + (d.size || 0), 0);
  const limit = CONFIG.plans[G.currentUser.plan].storage;
  const newTotalSize = G.selectedFiles.reduce((sum, f) => sum + f.size, 0);
  if (used + newTotalSize > limit) {
    showToast(`Espace insuffisant. Libre : ${formatBytes(limit - used)}`, 'error');
    return;
  }

  if (!G.supabase) { showToast('Erreur de connexion à la base de données', 'error'); return; }
  if (!G.currentFolderId) {
    await setRootFolder();
    if (!G.currentFolderId) { showToast('Erreur: dossier racine non trouvé', 'error'); return; }
  }

  const folderId = G.currentFolderId;
  let successCount = 0, errorCount = 0;

  // Extensions autorisées (sécurité)
  const allowedExt = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'txt'];

  const progressContainer = document.getElementById('uploadProgress');
  const progressBar = document.getElementById('uploadProgressBar');
  const progressPercent = document.getElementById('uploadPercent');
  const statusText = document.getElementById('uploadStatusText');
  if (progressContainer) progressContainer.classList.remove('hidden');

  for (let i = 0; i < G.selectedFiles.length; i++) {
    const file = G.selectedFiles[i];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!allowedExt.includes(ext)) {
      showToast(`Type de fichier non autorisé : .${ext}`, 'error');
      errorCount++;
      continue;
    }

    const docId = generateId();
    const storagePath = `${G.currentUser.companyId}/${docId}.${ext}`;
    const percent = Math.round(((i + 1) / G.selectedFiles.length) * 100);
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (statusText) statusText.textContent = `Import de ${file.name}... (${i + 1}/${G.selectedFiles.length})`;

    try {
      const { error: uploadErr } = await G.supabase.storage
        .from(CONFIG.storageBucket)
        .upload(storagePath, file, { cacheControl: '3600', upsert: false });
      if (uploadErr) throw new Error(`Upload storage: ${uploadErr.message}`);

      const { data: publicUrlData } = G.supabase.storage.from(CONFIG.storageBucket).getPublicUrl(storagePath);
      if (!publicUrlData?.publicUrl) throw new Error("Impossible de récupérer l'URL publique");

      const doc = {
        id: docId,
        name: document.getElementById('docNameInput')?.value.trim() || file.name,
        type: getFileType(file.name),
        size: file.size,
        description: document.getElementById('docDescInput')?.value.trim() || '',
        scope: G._uploadScope || 'company',
        owner_id: G.currentUser.id,
        company_id: G.currentUser.companyId,
        folder_id: folderId,
        tags: G.uploadTags,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
        views: 0,
        downloads: 0,
        is_deleted: false,
        deleted_at: null,
        storage_path: storagePath,
        file_url: publicUrlData.publicUrl
      };

      const { error: dbErr } = await G.supabase.from('documents').insert(doc);
      if (dbErr) {
        await G.supabase.storage.from(CONFIG.storageBucket).remove([storagePath]);
        throw new Error(`Base de données: ${dbErr.message}`);
      }

      G.documents.unshift(doc);
      successCount++;
      await addAuditLog('upload', 'document', doc.id, `Fichier: ${file.name}, Taille: ${formatBytes(file.size)}`);
    } catch (err) {
      console.error(`Erreur upload ${file.name}:`, err);
      errorCount++;
      showToast(`Erreur: ${file.name} - ${err.message}`, 'error');
    }
  }

  if (progressContainer) setTimeout(() => progressContainer.classList.add('hidden'), 1000);
  if (successCount > 0) showToast(`${successCount} fichier(s) importé(s) avec succès${errorCount > 0 ? `, ${errorCount} erreur(s)` : ''}`, successCount > 0 ? 'success' : 'warning');
  G.selectedFiles = [];
  G.uploadTags = [];
  renderUploadTags();
  renderSelectedFiles();
  closeUploadModal();
  renderDocuments();
  updateBadges();
  updateStorageDisplay();
}

function setDocScope(scope) {
  G._uploadScope = scope;
  const scopeCompany = document.getElementById('scopeCompany');
  const scopePersonal = document.getElementById('scopePersonal');
  if (scopeCompany && scopePersonal) {
    if (scope === 'company') {
      scopeCompany.classList.add('bg-blue-500/15', 'border-blue-500/40', 'text-blue-300');
      scopePersonal.classList.remove('bg-blue-500/15', 'border-blue-500/40', 'text-blue-300');
      scopePersonal.classList.add('bg-slate-800/40', 'border-transparent', 'text-gray-400');
    } else {
      scopePersonal.classList.add('bg-purple-500/15', 'border-purple-500/40', 'text-purple-300');
      scopeCompany.classList.remove('bg-purple-500/15', 'border-purple-500/40', 'text-purple-300');
      scopeCompany.classList.add('bg-slate-800/40', 'border-transparent', 'text-gray-400');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 3. PRÉVISUALISATION ET TÉLÉCHARGEMENT
// ═══════════════════════════════════════════════════════════════════════

function openPreviewModal(docId) {
  G.currentDocId = docId;
  const modal = document.getElementById('previewModal');
  if (modal) modal.classList.remove('hidden');

  const doc = G.documents.find(d => d.id === docId);
  if (!doc) { showToast('Document introuvable', 'error'); return; }

  showPreviewLoading();

  const titleEl = document.getElementById('previewTitle');
  if (titleEl) titleEl.textContent = doc.name;
  updatePreviewMetadata(doc);

  const fileUrl = doc.file_url;
  if (!fileUrl) { hidePreviewLoading(); showUnsupportedPreview(doc); updateDocViews(docId); return; }

  const nameExt  = doc.name && doc.name.includes('.') ? doc.name.split('.').pop().toLowerCase() : '';
  const pathExt  = doc.storage_path ? doc.storage_path.split('.').pop().toLowerCase() : '';
  const fileExt  = nameExt || pathExt;
  const fileType = doc.type || '';
  const effectiveExt = fileExt;
  const isImage = fileType === 'img' || ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(effectiveExt);

  ['previewFrame','previewImage','previewContent','previewOffice','previewUnsupported'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  const previewFrame       = document.getElementById('previewFrame');
  const previewImage       = document.getElementById('previewImage');
  const previewContent     = document.getElementById('previewContent');

  const imageExts  = ['jpg','jpeg','png','gif','webp','svg','bmp'];
  const pdfExts    = ['pdf'];
  const officeExts = ['doc','docx','xls','xlsx','ppt','pptx'];
  const textExts   = ['txt','json','xml','html','css','js','md','csv'];

  try {
    if (isImage || imageExts.includes(effectiveExt)) {
      if (previewImage) {
        previewImage.classList.remove('hidden');
        previewImage.onload  = () => hidePreviewLoading();
        previewImage.onerror = () => {
          if (G.supabase && doc.storage_path) {
            G.supabase.storage.from(CONFIG.storageBucket)
              .createSignedUrl(doc.storage_path, 3600)
              .then(({ data, error }) => {
                if (!error && data?.signedUrl) previewImage.src = data.signedUrl;
                else { hidePreviewLoading(); showUnsupportedPreview(doc); }
              })
              .catch(() => { hidePreviewLoading(); showUnsupportedPreview(doc); });
          } else { hidePreviewLoading(); showUnsupportedPreview(doc); }
        };
        previewImage.src = fileUrl;
      }
    } else if (pdfExts.includes(effectiveExt)) {
      if (previewFrame) {
        previewFrame.classList.remove('hidden');
        const loadPdf = (url) => {
          previewFrame.src = url;
          previewFrame.onload  = () => hidePreviewLoading();
          previewFrame.onerror = () => { hidePreviewLoading(); showUnsupportedPreview(doc); };
        };
        fetch(fileUrl, { method: 'HEAD' })
          .then(r => {
            if (r.ok) loadPdf(fileUrl);
            else if (G.supabase && doc.storage_path) {
              G.supabase.storage.from(CONFIG.storageBucket)
                .createSignedUrl(doc.storage_path, 3600)
                .then(({ data, error }) => {
                  if (!error && data?.signedUrl) loadPdf(data.signedUrl);
                  else { hidePreviewLoading(); showUnsupportedPreview(doc); }
                });
            } else { hidePreviewLoading(); showUnsupportedPreview(doc); }
          })
          .catch(() => loadPdf(fileUrl));
      }
    } else if (officeExts.includes(effectiveExt)) {
      if (previewFrame) {
        previewFrame.classList.remove('hidden');
        const loadOffice = (url) => {
          const encodedUrl = encodeURIComponent(url);
          const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`;
          previewFrame.src = viewerUrl;
          previewFrame.onload  = () => hidePreviewLoading();
          previewFrame.onerror = () => { hidePreviewLoading(); showUnsupportedPreview(doc); };
        };
        fetch(fileUrl, { method: 'HEAD' })
          .then(r => {
            if (r.ok) loadOffice(fileUrl);
            else if (G.supabase && doc.storage_path) {
              G.supabase.storage.from(CONFIG.storageBucket)
                .createSignedUrl(doc.storage_path, 3600)
                .then(({ data, error }) => {
                  if (!error && data?.signedUrl) loadOffice(data.signedUrl);
                  else { hidePreviewLoading(); showUnsupportedPreview(doc); }
                });
            } else { hidePreviewLoading(); showUnsupportedPreview(doc); }
          })
          .catch(() => loadOffice(fileUrl));
      }
    } else if (textExts.includes(effectiveExt)) {
      if (previewContent) previewContent.classList.remove('hidden');
      const contentEl = document.getElementById('previewTextContent');
      if (contentEl) {
        contentEl.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-blue-400 text-2xl"></i></div>';
        fetch(fileUrl)
          .then(r => r.text())
          .then(text => {
            hidePreviewLoading();
            contentEl.innerHTML = '<pre class="text-xs text-blue-300/80 font-mono whitespace-pre-wrap break-words p-4 max-h-[55vh] overflow-y-auto">' + escapeHtml(text.slice(0, 50000)) + '</pre>';
          })
          .catch(() => {
            hidePreviewLoading();
            contentEl.innerHTML = '<div class="text-center py-8 text-yellow-400"><i class="fas fa-exclamation-triangle text-3xl mb-3 block"></i><p>Impossible de charger le contenu texte.</p></div>';
          });
      }
    } else {
      hidePreviewLoading();
      showUnsupportedPreview(doc);
    }
  } catch (err) {
    console.error('Erreur aperçu:', err);
    hidePreviewLoading();
    showUnsupportedPreview(doc);
  }

  updateDocViews(docId);
}

function updatePreviewMetadata(doc) {
  const metaContainer = document.getElementById('previewMetadata');
  if (metaContainer) {
    metaContainer.innerHTML = `
      <div class="flex items-center gap-4 text-xs text-blue-300/60 flex-wrap">
        <span><i class="fas fa-code-branch mr-1"></i>Version ${doc.version || 1}</span>
        <span><i class="fas fa-eye mr-1"></i>${doc.views || 0} vues</span>
        <span><i class="fas fa-download mr-1"></i>${doc.downloads || 0} téléchargements</span>
        <span><i class="fas fa-calendar-alt mr-1"></i>${formatDate(doc.created_at)}</span>
        <span><i class="fas fa-database mr-1"></i>${formatBytes(doc.size)}</span>
        ${doc.owner_id === G.currentUser.id ? '<span class="text-green-400"><i class="fas fa-user-check mr-1"></i>Propriétaire</span>' : ''}
      </div>
    `;
  }
}

function showUnsupportedPreview(doc) {
  const previewUnsupported = document.getElementById('previewUnsupported');
  if (previewUnsupported) {
    previewUnsupported.classList.remove('hidden');
    const unsupportedInfo = document.getElementById('unsupportedFileInfo');
    if (unsupportedInfo) {
      unsupportedInfo.innerHTML = `
        <i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-5xl mb-4 block text-blue-400"></i>
        <p class="text-white font-medium">${escapeHtml(doc.name)}</p>
        <p class="text-sm text-blue-300/60 mt-1">${formatBytes(doc.size)} • ${doc.type?.toUpperCase() || 'Fichier'}</p>
        <p class="text-xs text-blue-400/50 mt-3">Aperçu non disponible pour ce type de fichier</p>
        <div class="flex gap-3 mt-4 justify-center">
          <button onclick="downloadDocument('${doc.id}')" class="btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-2">
            <i class="fas fa-download"></i>Télécharger
          </button>
          <button onclick="copyFileLink('${doc.id}')" class="px-4 py-2 rounded-lg text-sm border border-blue-500/30 hover:bg-blue-500/10 flex items-center gap-2">
            <i class="fas fa-link"></i>Copier le lien
          </button>
        </div>
      `;
    }
  }
}

function copyFileLink(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc?.file_url) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(doc.file_url).then(() => showToast('Lien du fichier copié', 'success')).catch(() => _fallbackCopy(doc.file_url));
  } else {
    _fallbackCopy(doc.file_url);
  }
}

function showPreviewLoading() {
  const loadingEl = document.getElementById('previewLoading');
  if (loadingEl) loadingEl.classList.remove('hidden');
}

function hidePreviewLoading() {
  const loadingEl = document.getElementById('previewLoading');
  if (loadingEl) loadingEl.classList.add('hidden');
}

async function updateDocViews(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  const newViews = (doc.views || 0) + 1;
  try {
    await G.supabase.from('documents').update({ views: newViews }).eq('id', docId);
    doc.views = newViews;
  } catch (err) {
    console.warn('updateDocViews error (non-blocking):', err);
  }
}

function closePreviewModal() {
  const modal = document.getElementById('previewModal');
  if (modal) modal.classList.add('hidden');
  G.currentDocId = null;
}

async function downloadDocument(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  try {
    const { data, error } = await G.supabase.storage
      .from(CONFIG.storageBucket)
      .download(doc.storage_path);
    if (error) {
      const link = document.createElement('a');
      link.href = doc.file_url;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
    await G.supabase.from('documents').update({ downloads: (doc.downloads || 0) + 1 }).eq('id', docId);
    doc.downloads = (doc.downloads || 0) + 1;
    showToast(`Téléchargement: ${escapeHtml(doc.name)}`, 'success');
    await addAuditLog('download', 'document', docId);
  } catch (err) {
    console.error('Erreur téléchargement:', err);
    showToast(`Erreur de téléchargement: ${err.message}`, 'error');
  }
}

function downloadCurrentDocument() {
  if (G.currentDocId) downloadDocument(G.currentDocId);
}

function shareCurrentDocument() {
  if (G.currentDocId) openShareModal(G.currentDocId);
}

async function deleteDocument(docId) {
  if (G._isDemo) { showToast('Mode démo : suppression désactivée', 'warning'); return; }
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  if (doc.owner_id !== G.currentUser.id && G.currentUser.role !== 'admin' && G.currentUser.role !== 'manager') {
    showToast('Permission refusée', 'error');
    return;
  }
  if (!confirm(`Déplacer "${escapeHtml(doc.name)}" vers la corbeille ?`)) return;
  try {
    const { error } = await G.supabase
      .from('documents')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', docId);
    if (error) throw error;
    doc.is_deleted = true;
    doc.deleted_at = new Date().toISOString();
    renderDocuments();
    updateBadges();
    showToast('Document déplacé vers la corbeille', 'success');
    await addAuditLog('delete', 'document', docId);
  } catch (err) {
    showToast('Erreur suppression', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 4. DÉPLACEMENT DE DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════

function openMoveModal(docId) {
  G.moveModalDocId = docId;
  const modal = document.getElementById('moveModal');
  if (modal) modal.classList.remove('hidden');
  const folderSelect = document.getElementById('moveFolderSelect');
  if (folderSelect) {
    let options = '<option value="__root__">📁 Racine (dossier principal)</option>';
    options += G.folders
      .filter(f => f.name !== 'Racine')
      .map(f => `<option value="${f.id}">📁 ${getFolderPath(f.id)}</option>`)
      .join('');
    folderSelect.innerHTML = options;
  }
}

function closeMoveModal() {
  const modal = document.getElementById('moveModal');
  if (modal) modal.classList.add('hidden');
  G.moveModalDocId = null;
}

function getFolderPath(folderId, path = '') {
  const folder = G.folders.find(f => f.id === folderId);
  if (!folder) return path;
  const newPath = path ? `${folder.name} / ${path}` : folder.name;
  if (folder.parent_id) {
    return getFolderPath(folder.parent_id, newPath);
  }
  return newPath;
}

async function confirmMoveDocument() {
  let folderId = document.getElementById('moveFolderSelect')?.value;
  if (!folderId) { showToast('Veuillez sélectionner un dossier', 'warning'); return; }
  if (folderId === '__root__') {
    const rootFolder = G.folders.find(f => f.name === 'Racine' && f.parent_id === null);
    if (rootFolder) folderId = rootFolder.id;
    else { showToast('Dossier racine introuvable', 'error'); return; }
  }
  if (!G.moveModalDocId) return;
  try {
    const { error } = await G.supabase
      .from('documents')
      .update({ folder_id: folderId, updated_at: new Date().toISOString() })
      .eq('id', G.moveModalDocId);
    if (error) throw error;
    const doc = G.documents.find(d => d.id === G.moveModalDocId);
    if (doc) { doc.folder_id = folderId; doc.updated_at = new Date().toISOString(); }
    showToast('Document déplacé avec succès', 'success');
    closeMoveModal();
    renderDocuments();
    if (G.currentView === 'folders') renderFolderContents();
  } catch (err) {
    showToast('Erreur déplacement: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 5. COLLABORATION (invitation)
// ═══════════════════════════════════════════════════════════════════════

function openCollabModal(docId) {
  G.collabModalDocId = docId;
  const modal = document.getElementById('collabModal');
  if (modal) modal.classList.remove('hidden');
  const doc = G.documents.find(d => d.id === docId);
  const docInfo = document.getElementById('collabDocInfo');
  if (docInfo && doc) docInfo.textContent = doc.name;
}

function closeCollabModal() {
  const modal = document.getElementById('collabModal');
  if (modal) modal.classList.add('hidden');
  G.collabModalDocId = null;
}

async function inviteCollaborator() {
  const email = document.getElementById('collabEmail')?.value.trim();
  const permission = document.getElementById('collabPermission')?.value;
  if (!email) { showToast('Veuillez entrer un email', 'warning'); return; }
  if (!G.collabModalDocId) return;
  try {
    const { data: targetUser, error: userError } = await G.supabase
      .from('profiles')
      .select('id, email, name')
      .eq('email', email)
      .eq('company_id', G.currentUser.companyId)
      .single();
    if (userError || !targetUser) {
      showToast('Cet utilisateur n\'appartient pas à votre entreprise', 'error');
      return;
    }
    const share = {
      id: generateId(),
      document_id: G.collabModalDocId,
      sender_id: G.currentUser.id,
      recipient_email: email,
      recipient_id: targetUser.id,
      permission: permission,
      expires_at: null,
      status: 'active',
      created_at: new Date().toISOString()
    };
    const { error } = await G.supabase.from('shares').insert(share);
    if (error) throw error;
    G.shares.push(share);
    showToast(`Invitation envoyée à ${email}`, 'success');
    await addAuditLog('share_collab', 'document', G.collabModalDocId, `Invité: ${email} avec permission ${permission}`);
    closeCollabModal();
    document.getElementById('collabEmail').value = '';
  } catch (err) {
    showToast('Erreur invitation: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 6. PARTAGES (fonctions de base)
// ═══════════════════════════════════════════════════════════════════════

function openShareModal(docId) {
  G.currentDocId = docId;
  const modal = document.getElementById('shareModal');
  if (modal) modal.classList.remove('hidden');
  const doc = G.documents.find(d => d.id === docId);
  const docInfo = document.getElementById('shareDocInfo');
  if (docInfo && doc) docInfo.textContent = doc.name;
}

function closeShareModal() {
  const modal = document.getElementById('shareModal');
  if (modal) modal.classList.add('hidden');
  G.currentDocId = null;
}

function switchShareTab(tab) {
  const sendPanel = document.getElementById('sharePanel-send');
  const historyPanel = document.getElementById('sharePanel-history');
  const sendTab = document.getElementById('shareTab-send');
  const historyTab = document.getElementById('shareTab-history');
  if (tab === 'send') {
    if (sendPanel) sendPanel.classList.remove('hidden');
    if (historyPanel) historyPanel.classList.add('hidden');
    if (sendTab) sendTab.classList.add('border-blue-400', 'text-blue-400');
    if (historyTab) historyTab.classList.remove('border-blue-400', 'text-blue-400');
  } else {
    if (sendPanel) sendPanel.classList.add('hidden');
    if (historyPanel) historyPanel.classList.remove('hidden');
    if (historyTab) historyTab.classList.add('border-blue-400', 'text-blue-400');
    if (sendTab) sendTab.classList.remove('border-blue-400', 'text-blue-400');
    loadShareHistory();
  }
}

async function loadShareHistory(docId = null) {
  const targetDocId = docId || G.currentDocId;
  if (!targetDocId) {
    const historyContainer = document.getElementById('shareHistoryList');
    if (historyContainer) historyContainer.innerHTML = '<div class="text-center py-8 text-blue-300/40"><p>Sélectionnez un document pour voir son historique</p></div>';
    return;
  }
  try {
    const { data: shares, error } = await G.supabase
      .from('shares')
      .select('*, documents!document_id(name)')
      .eq('document_id', targetDocId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const historyContainer = document.getElementById('shareHistoryList');
    if (historyContainer) {
      if (!shares || shares.length === 0) {
        historyContainer.innerHTML = '<p class="text-center py-4 text-blue-300/50">Aucun historique de partage pour ce document</p>';
      } else {
        historyContainer.innerHTML = shares.map(s => `
          <div class="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-blue-500/20">
            <div>
              <p class="text-white text-sm">Partagé avec : ${escapeHtml(s.recipient_email)}</p>
              <p class="text-xs text-blue-300/60">${s.status} • ${formatDate(s.created_at)}</p>
              ${s.expires_at ? `<p class="text-xs text-yellow-400/70">Expire le ${formatDate(s.expires_at)}</p>` : ''}
            </div>
            ${s.status === 'active' ? `<button onclick="revokeShare('${s.id}')" class="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30">Révoquer</button>` : ''}
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error('loadShareHistory error:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 7. ÉDITEUR RICHE SÉCURISÉ (avec DOMPurify)
// ═══════════════════════════════════════════════════════════════════════

function openRichEditor(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  const modal = document.getElementById('richEditorModal');
  if (!modal) return;
  const textarea = document.getElementById('richEditorTextarea');
  if (textarea) textarea.value = doc.content || '';
  modal.classList.remove('hidden');
  showToast('Éditeur sécurisé (mode texte)', 'info');
}

function closeRichEditor() {
  const modal = document.getElementById('richEditorModal');
  if (modal) modal.classList.add('hidden');
}

function _onRichEditorInput() {}

function _saveRichContent() {
  const textarea = document.getElementById('richEditorTextarea');
  if (!textarea) return;
  const raw = textarea.value;
  const sanitized = DOMPurify.sanitize(raw);
  const docId = G.currentDocId;
  if (docId && G.supabase) {
    G.supabase.from('documents').update({ content: sanitized, updated_at: new Date().toISOString() }).eq('id', docId)
      .then(() => showToast('Document enregistré', 'success'))
      .catch(err => showToast('Erreur sauvegarde', 'error'));
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 8. FONCTIONS UTILITAIRES
// ═══════════════════════════════════════════════════════════════════════

function handleDocDragStart(e, docId) {
  e.dataTransfer.setData('text/plain', docId);
}

function showDocContextMenu(e, docId) {
  e.preventDefault();
  e.stopPropagation();
  deleteDocument(docId);
}

function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast('Copié', 'success');
  } catch (_) {
    showToast('Impossible de copier', 'error');
  }
  document.body.removeChild(ta);
}

// ═══════════════════════════════════════════════════════════════════════
// EXPOSITIONS GLOBALES
// ═══════════════════════════════════════════════════════════════════════

window.openUploadModal          = openUploadModal;
window.closeUploadModal         = closeUploadModal;
window.handleDragOver           = handleDragOver;
window.handleDragLeave          = handleDragLeave;
window.handleDrop               = handleDrop;
window.handleDocDrop            = handleDocDrop;
window.handleFileSelect         = handleFileSelect;
window.handleFilePickerSelect   = handleFilePickerSelect;
window.addFilesToSelection      = addFilesToSelection;
window.removeFileFromSelection  = removeFileFromSelection;
window.addUploadTag             = addUploadTag;
window.removeUploadTag          = removeUploadTag;
window.uploadDocument           = uploadDocument;
window.setDocScope              = setDocScope;
window.downloadDocument         = downloadDocument;
window.downloadCurrentDocument  = downloadCurrentDocument;
window.shareCurrentDocument     = shareCurrentDocument;
window.deleteDocument           = deleteDocument;
window.openPreviewModal         = openPreviewModal;
window.closePreviewModal        = closePreviewModal;
window.openShareModal           = openShareModal;
window.closeShareModal          = closeShareModal;
window.switchShareTab           = switchShareTab;
window.shareDocument            = shareDocument;
window.loadShareHistory         = loadShareHistory;
window.renderDocuments          = renderDocuments;
window.filterDocuments          = filterDocuments;
window.switchDocsTab            = switchDocsTab;
window.toggleViewMode           = toggleViewMode;
window.applyFilters             = applyFilters;
window.clearFilters             = clearFilters;
window.filterByType             = filterByType;
window.filterByTag              = filterByTag;
window.clearTagFilter           = clearTagFilter;
window.loadDeletedDocs          = loadDeletedDocs;
window.restoreDocument          = restoreDocument;
window.generatePublicLink       = generatePublicLink;
window.copyShareLink            = copyShareLink;
window.scanAllDocuments         = scanAllDocuments;
window.exportAuditLog           = exportAuditLog;
window.exportAllData            = exportAllData;
window.exportDocumentsCsv       = exportDocumentsCsv;
window.openMoveModal            = openMoveModal;
window.closeMoveModal           = closeMoveModal;
window.confirmMoveDocument      = confirmMoveDocument;
window.openCollabModal          = openCollabModal;
window.closeCollabModal         = closeCollabModal;
window.inviteCollaborator       = inviteCollaborator;
window.handleDocDragStart       = handleDocDragStart;
window.showDocContextMenu       = showDocContextMenu;
window.changeDocScope           = changeDocScope;
window.openRichEditor           = openRichEditor;
window.closeRichEditor          = closeRichEditor;
window._onRichEditorInput       = _onRichEditorInput;
window._saveRichContent         = _saveRichContent;
