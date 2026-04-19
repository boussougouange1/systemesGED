// ============================================
// SystemesGED v7.2 — MODULE : workflows.js (CORRIGÉ)
// Responsabilités :
//   - Module Partagés (renderShared, switchSharedTab, liens publics, Quick Share)
//   - Actions sur partages (revokeShare, extendShare, renewShare, bulkRevoke)
//   - Workflows Kanban & liste (renderWorkflows, renderWorkflowsList)
//   - Création et actions workflow (createWorkflow, actOnWorkflow, addWfComment)
//   - Détail workflow (openWfDetail, closeWfDetail)
//   - Filtres et recherche workflows (filterWorkflows, searchWorkflows, setWfView)
// ============================================

// Dépendances : auth.js (G, CONFIG), ui.js (showToast, formatBytes, formatDate, getFileIcon, escapeHtml, addAuditLog)

// ═══════════════════════════════════════════════════════════════════════
// PARTIE 1 : PARTAGES (SHARED) — COMPLÈTE AVEC TRY/CATCH
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
    showToast('Erreur chargement historique', 'error');
  }
}

// ─── Navigation partagés ─────────────────────────────────────────────
function switchSharedTab(tab) {
  _shared.currentTab = tab;
  _shared.bulkSelected.clear();
  _updateBulkBar();

  // Mise à jour des onglets
  document.querySelectorAll('.shared-tab').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`sharedTab-${tab}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Panels
  document.querySelectorAll('.shared-panel').forEach(p => p.classList.add('hidden'));
  const panel = document.getElementById(`shared-panel-${tab}`);
  if (panel) panel.classList.remove('hidden');

  if (tab === 'links') _populatePublicLinkDocSelector();

  renderShared();
}

async function renderShared() {
  if (!G.currentUser) return;

  try {
    const [sentRes, receivedRes, linksRes] = await Promise.all([
      G.supabase.from('shares').select('*').eq('sender_id', G.currentUser.id),
      G.supabase.from('shares').select('*').eq('recipient_email', G.currentUser.email),
      G.supabase.from('public_shares').select('*').eq('created_by', G.currentUser.id)
    ]);

    const allShares = new Map();
    (sentRes.data || []).forEach(s => allShares.set(s.id, s));
    (receivedRes.data || []).forEach(s => allShares.set(s.id, s));
    G.shares = Array.from(allShares.values());

    if (!linksRes.error) _shared.publicLinks = linksRes.data || [];
  } catch (err) {
    console.warn('renderShared: erreur', err);
    showToast('Erreur chargement des partages', 'error');
  }

  _updateKPIs();
  switch (_shared.currentTab) {
    case 'received': _renderReceived(); break;
    case 'sent':     _renderSent();     break;
    case 'links':    _renderLinks();    break;
    case 'expired':  _renderExpired();  break;
  }
}

function _updateKPIs() {
  if (!G.currentUser) return;
  const email = G.currentUser.email;
  const userId = G.currentUser.id;

  const received = G.shares.filter(s => s.recipient_email === email && s.status === 'active' && !_isExpired(s)).length;
  const sent = G.shares.filter(s => s.sender_id === userId && s.status === 'active' && !_isExpired(s)).length;
  const links = (_shared.publicLinks || []).filter(l => l.created_by === userId && l.status === 'active' && !_isExpired(l)).length;
  const expired = G.shares.filter(s => s.sender_id === userId && (s.status === 'revoked' || _isExpired(s))).length;

  _setText('kpiReceivedCount', received);
  _setText('kpiSentCount', sent);
  _setText('kpiLinksCount', links);
  _setText('kpiExpiredCount', expired);

  _setBadge('receivedCountBadge', received);
  _setBadge('sentCountBadge', sent);
}

function filterSharedView() {
  _shared.filterQuery  = (document.getElementById('sharedSearchInput')?.value  || '').toLowerCase();
  _shared.filterPerm   = document.getElementById('sharedFilterPerm')?.value   || '';
  _shared.filterStatus = document.getElementById('sharedFilterStatus')?.value || '';
  renderShared();
}

function clearSharedFilters() {
  _shared.filterQuery = _shared.filterPerm = _shared.filterStatus = '';
  const q  = document.getElementById('sharedSearchInput');
  const fp = document.getElementById('sharedFilterPerm');
  const fs = document.getElementById('sharedFilterStatus');
  if (q)  q.value  = '';
  if (fp) fp.value = '';
  if (fs) fs.value = '';
  renderShared();
}

function _applyFilters(list) {
  const { filterQuery: q, filterPerm: p, filterStatus: s } = _shared;
  return list.filter(share => {
    const doc = G.documents.find(d => d.id === share.document_id);
    const docName = (doc?.name || '').toLowerCase();
    const email   = (share.recipient_email || '').toLowerCase();
    const matchQ  = !q || docName.includes(q) || email.includes(q);
    const matchP  = !p || share.permission === p;
    const status  = _shareStatus(share);
    const matchS  = !s || status === s;
    return matchQ && matchP && matchS;
  });
}

function _shareStatus(share) {
  if (share.status === 'revoked') return 'revoked';
  if (_isExpired(share)) return 'expired';
  return 'active';
}

function _isExpired(share) {
  if (!share.expires_at) return false;
  return new Date(share.expires_at) < new Date();
}

function _renderReceived() {
  const container = document.getElementById('sharedReceivedList');
  const empty = document.getElementById('sharedReceivedEmpty');
  if (!container || !empty) return;

  const email = G.currentUser?.email;
  let received = G.shares.filter(s =>
    s.recipient_email === email &&
    s.status !== 'revoked' &&
    !_isExpired(s)
  );
  received = _applyFilters(received);

  _setText('sharedResultCount', `${received.length} partage${received.length > 1 ? 's' : ''}`);

  if (received.length === 0) {
    empty.classList.remove('hidden');
    container.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  container.classList.remove('hidden');

  container.innerHTML = received.map(share => {
    const doc = G.documents.find(d => d.id === share.document_id);
    const docName = doc?.name || 'Document inconnu';
    const sender = G.users.find(u => u.id === share.sender_id);
    const senderLabel = sender?.name || share.sender_id?.substring(0, 8) || 'Inconnu';
    const expireLabel = share.expires_at ? `Expire le ${formatDate(share.expires_at)}` : 'Accès illimité';

    return `
    <div class="share-card glass-card rounded-xl border border-purple-500/20 p-4 hover:border-purple-400/40 group" data-share-id="${share.id}">
      <div class="flex items-start gap-3">
        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center text-xl flex-shrink-0">
          <i class="fas ${getFileIcon(doc?.type).split(' ')[0]} ${getFileIcon(doc?.type).split(' ')[1] || 'text-purple-400'}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-white font-semibold text-sm truncate">${escapeHtml(docName)}</p>
            <span class="text-[10px] px-2 py-0.5 rounded-full perm-badge-${share.permission || 'view'}">${_permLabel(share.permission)}</span>
          </div>
          <div class="flex items-center gap-3 mt-1 flex-wrap text-xs text-blue-300/60">
            <span><i class="fas fa-user mr-1"></i>${escapeHtml(senderLabel)}</span>
            <span><i class="fas fa-calendar mr-1"></i>${formatDate(share.created_at)}</span>
            <span class="${share.expires_at && _isExpired(share) ? 'text-orange-400' : ''}"><i class="fas fa-clock mr-1"></i>${expireLabel}</span>
            ${share.views ? `<span><i class="fas fa-eye mr-1"></i>${share.views} vue(s)</span>` : ''}
          </div>
        </div>
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onclick="openPreviewModal('${share.document_id}')" class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-all" title="Ouvrir"><i class="fas fa-eye text-sm"></i></button>
          ${share.permission !== 'view' ? `<button onclick="downloadDocument('${share.document_id}')" class="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-all" title="Télécharger"><i class="fas fa-download text-sm"></i></button>` : ''}
          <button onclick="openShareDetailModal('${share.id}')" class="p-2 rounded-lg hover:bg-purple-500/20 text-purple-400 transition-all" title="Détails"><i class="fas fa-circle-info text-sm"></i></button>
          <button onclick="revokeReceivedShare('${share.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-all" title="Masquer ce partage"><i class="fas fa-eye-slash text-sm"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function _renderSent() {
  const container = document.getElementById('sharedSentList');
  const empty = document.getElementById('sharedSentEmpty');
  if (!container || !empty) return;

  let sent = G.shares.filter(s => s.sender_id === G.currentUser?.id);
  sent = _applyFilters(sent);

  _setText('sharedResultCount', `${sent.length} partage${sent.length > 1 ? 's' : ''}`);

  if (sent.length === 0) {
    empty.classList.remove('hidden');
    container.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  container.classList.remove('hidden');

  container.innerHTML = sent.map(share => {
    const doc = G.documents.find(d => d.id === share.document_id);
    const docName = doc?.name || 'Document inconnu';
    const status = _shareStatus(share);
    const isSelected = _shared.bulkSelected.has(share.id);

    return `
    <div class="share-card glass-card rounded-xl border ${_cardBorderClass(status)} p-4 group ${isSelected ? 'selected' : ''}" data-share-id="${share.id}">
      <div class="flex items-start gap-3">
        <div class="share-checkbox flex-shrink-0 mt-0.5">
          <input type="checkbox" class="rounded" ${isSelected ? 'checked' : ''} onchange="toggleBulkSelect('${share.id}', this.checked)" onclick="event.stopPropagation()">
        </div>
        <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/15 to-purple-500/15 flex items-center justify-center text-lg flex-shrink-0">
          <i class="fas ${getFileIcon(doc?.type).split(' ')[0]} ${getFileIcon(doc?.type).split(' ')[1] || 'text-blue-400'}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-white font-semibold text-sm truncate">${escapeHtml(docName)}</p>
            <span class="text-[10px] px-2 py-0.5 rounded-full perm-badge-${share.permission || 'view'}">${_permLabel(share.permission)}</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full status-${status}">${_statusLabel(status)}</span>
          </div>
          <div class="flex items-center gap-3 mt-1 flex-wrap text-xs text-blue-300/60">
            <span><i class="fas fa-at mr-1"></i>${escapeHtml(share.recipient_email || '—')}</span>
            <span><i class="fas fa-calendar mr-1"></i>Envoyé le ${formatDate(share.created_at)}</span>
            ${share.expires_at ? `<span class="${_isExpired(share) ? 'text-orange-400' : ''}"><i class="fas fa-clock mr-1"></i>${_isExpired(share) ? 'Expiré' : 'Expire'} le ${formatDate(share.expires_at)}</span>` : '<span><i class="fas fa-infinity mr-1"></i>Illimité</span>'}
            ${share.views ? `<span><i class="fas fa-eye mr-1"></i>${share.views} vue(s)</span>` : ''}
            ${share.downloads ? `<span><i class="fas fa-download mr-1"></i>${share.downloads} dl</span>` : ''}
          </div>
        </div>
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onclick="openShareDetailModal('${share.id}')" class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-all" title="Détails & activité"><i class="fas fa-chart-line text-sm"></i></button>
          ${status === 'active' ? `
            <button onclick="extendShare('${share.id}', 7)" class="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-all" title="Prolonger 7 jours"><i class="fas fa-calendar-plus text-sm"></i></button>
            <button onclick="revokeShare('${share.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-all" title="Révoquer"><i class="fas fa-ban text-sm"></i></button>
          ` : `
            <button onclick="renewShare('${share.id}')" class="p-2 rounded-lg hover:bg-purple-500/20 text-purple-400 transition-all" title="Renouveler"><i class="fas fa-rotate text-sm"></i></button>
          `}
          <button onclick="deleteShareRecord('${share.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400/50 hover:text-red-400 transition-all" title="Supprimer de l'historique"><i class="fas fa-trash text-sm"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function _populatePublicLinkDocSelector() {
  const sel = document.getElementById('publicLinkDocId');
  const qsSel = document.getElementById('qsDocId');
  const docs = G.documents.filter(d => !d.is_deleted);
  const opts = '<option value="">— Sélectionner un document —</option>' + docs.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  if (sel)   sel.innerHTML = opts;
  if (qsSel) qsSel.innerHTML = opts;
}

function _renderLinks() {
  const list  = document.getElementById('publicLinksList');
  const empty = document.getElementById('publicLinksEmpty');
  if (!list || !empty) return;
  _populatePublicLinkDocSelector();
  const links = (_shared.publicLinks || []).filter(l => l.created_by === G.currentUser?.id);
  if (links.length === 0) {
    empty.classList.remove('hidden');
    list.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.classList.remove('hidden');
  list.innerHTML = links.map(link => {
    const doc = G.documents.find(d => d.id === link.document_id);
    const docName = doc?.name || 'Document';
    const expired = _isExpired(link);
    const url = `${window.location.origin}/public/${link.token}`;
    return `
    <div class="share-card glass-card rounded-xl border ${expired ? 'border-orange-500/20' : 'border-green-500/20'} p-4 group">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-lg ${expired ? 'bg-orange-500/15' : 'bg-green-500/15'} flex items-center justify-center flex-shrink-0">
          <i class="fas fa-link ${expired ? 'text-orange-400' : 'text-green-400'}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-white font-semibold text-sm truncate">${escapeHtml(docName)}</p>
            <span class="text-[10px] px-2 py-0.5 rounded-full ${expired ? 'status-expired' : 'status-active'}">${expired ? '⏰ Expiré' : '✅ Actif'}</span>
            ${link.password ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/25"><i class="fas fa-lock mr-1"></i>Protégé</span>' : ''}
            ${link.max_views ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25">${link.views || 0}/${link.max_views} vues</span>` : ''}
          </div>
          <div class="flex items-center gap-3 mt-1 text-xs text-blue-300/60 flex-wrap">
            <code class="text-green-400/70 truncate max-w-[200px]">${url}</code>
            ${link.expires_at ? `<span>${expired ? 'Expiré' : 'Expire'} le ${formatDate(link.expires_at)}</span>` : '<span>Illimité</span>'}
            ${link.views ? `<span>${link.views} vue(s)</span>` : ''}
          </div>
        </div>
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onclick="_copyText('${url}')" class="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-all" title="Copier le lien"><i class="fas fa-copy text-sm"></i></button>
          ${!expired ? `
            <button onclick="extendPublicLink('${link.id}', 7)" class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-all" title="Prolonger"><i class="fas fa-calendar-plus text-sm"></i></button>
            <button onclick="revokePublicLink('${link.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-all" title="Révoquer"><i class="fas fa-ban text-sm"></i></button>
          ` : ''}
          <button onclick="deletePublicLink('${link.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400/50 hover:text-red-400 transition-all" title="Supprimer"><i class="fas fa-trash text-sm"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function _renderExpired() {
  const list  = document.getElementById('expiredSharesList');
  const empty = document.getElementById('expiredSharesEmpty');
  if (!list || !empty) return;
  let expired = G.shares.filter(s => s.sender_id === G.currentUser?.id && (s.status === 'revoked' || _isExpired(s)));
  expired = _applyFilters(expired);
  if (expired.length === 0) {
    empty.classList.remove('hidden');
    list.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.classList.remove('hidden');
  list.innerHTML = expired.map(share => {
    const doc = G.documents.find(d => d.id === share.document_id);
    const docName = doc?.name || 'Document inconnu';
    const status = _shareStatus(share);
    return `
    <div class="share-card glass-card rounded-xl border border-orange-500/15 p-4 group opacity-75 hover:opacity-100">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
          <i class="fas ${getFileIcon(doc?.type).split(' ')[0]} text-orange-400/70"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-white/70 font-medium text-sm truncate">${escapeHtml(docName)}</p>
            <span class="text-[10px] px-2 py-0.5 rounded-full status-${status}">${_statusLabel(status)}</span>
          </div>
          <div class="flex items-center gap-3 mt-1 text-xs text-blue-300/50 flex-wrap">
            <span><i class="fas fa-at mr-1"></i>${escapeHtml(share.recipient_email || '—')}</span>
            <span><i class="fas fa-calendar mr-1"></i>${formatDate(share.created_at)}</span>
            ${share.expires_at ? `<span><i class="fas fa-clock mr-1"></i>${formatDate(share.expires_at)}</span>` : ''}
          </div>
        </div>
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onclick="renewShare('${share.id}')" class="px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 text-xs hover:bg-purple-500/30 transition-all flex items-center gap-1"><i class="fas fa-rotate"></i>Renouveler</button>
          <button onclick="deleteShareRecord('${share.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400/50 hover:text-red-400 transition-all" title="Supprimer"><i class="fas fa-trash text-sm"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function _renderActivityChart(days) {
  const container = document.getElementById('shareActivityChart');
  if (!container) return;
  const bars = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const ds = date.toDateString();
    const count = G.shares.filter(s => new Date(s.created_at).toDateString() === ds).length;
    bars.push({ count, label: date.toLocaleDateString('fr-FR', { month:'short', day:'numeric' }) });
  }
  const max = Math.max(...bars.map(b => b.count), 1);
  container.innerHTML = bars.map((b, i) => `<div class="activity-bar" style="height:${Math.max(4, (b.count/max)*56)}px;" data-tip="${b.label}: ${b.count} partage(s)" title="${b.label}: ${b.count}"></div>`).join('');
}

function loadShareActivity(days) { _renderActivityChart(parseInt(days)); }

async function revokeShare(shareId) {
  if (!confirm('Révoquer ce partage ? Le destinataire n\'aura plus accès au document.')) return;
  try {
    const { error } = await G.supabase.from('shares').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', shareId);
    if (error) throw error;
    const share = G.shares.find(s => s.id === shareId);
    if (share) share.status = 'revoked';
    showToast('Partage révoqué avec succès', 'success');
    renderShared();
    updateBadges();
    await addAuditLog('share_revoke', 'share', shareId, `Destinataire : ${share?.recipient_email}`);
  } catch (err) { showToast('Erreur révocation : ' + err.message, 'error'); }
}

async function revokeReceivedShare(shareId) {
  G.shares = G.shares.filter(s => s.id !== shareId);
  renderShared();
  updateBadges();
  showToast('Partage masqué de votre vue', 'info');
}

async function extendShare(shareId, days) {
  const share = G.shares.find(s => s.id === shareId);
  if (!share) return;
  const base = share.expires_at ? new Date(share.expires_at) : new Date();
  const newDate = new Date(base);
  newDate.setDate(newDate.getDate() + days);
  try {
    const { error } = await G.supabase.from('shares').update({ expires_at: newDate.toISOString() }).eq('id', shareId);
    if (error) throw error;
    share.expires_at = newDate.toISOString();
    showToast(`Partage prolongé de ${days} jour(s)`, 'success');
    renderShared();
  } catch (err) { showToast('Erreur prolongation', 'error'); }
}

async function renewShare(shareId) {
  const share = G.shares.find(s => s.id === shareId);
  if (!share) return;
  const newDate = new Date();
  newDate.setDate(newDate.getDate() + 7);
  try {
    const { error } = await G.supabase.from('shares').update({ status: 'active', expires_at: newDate.toISOString(), revoked_at: null }).eq('id', shareId);
    if (error) throw error;
    share.status = 'active'; share.expires_at = newDate.toISOString(); share.revoked_at = null;
    showToast('Partage renouvelé pour 7 jours', 'success');
    renderShared();
    updateBadges();
  } catch (err) { showToast('Erreur renouvellement', 'error'); }
}

async function deleteShareRecord(shareId) {
  if (!confirm('Supprimer définitivement cet enregistrement de partage ?')) return;
  try {
    const { error } = await G.supabase.from('shares').delete().eq('id', shareId);
    if (error) throw error;
    G.shares = G.shares.filter(s => s.id !== shareId);
    showToast('Partage supprimé de l\'historique', 'success');
    renderShared();
    updateBadges();
  } catch (err) { showToast('Erreur suppression', 'error'); }
}

async function purgeExpiredShares() {
  if (!confirm('Supprimer définitivement tous les partages expirés et révoqués ?')) return;
  const toDelete = G.shares.filter(s => s.sender_id === G.currentUser?.id && (s.status === 'revoked' || _isExpired(s)));
  for (const s of toDelete) await G.supabase.from('shares').delete().eq('id', s.id).catch(() => {});
  G.shares = G.shares.filter(s => !(s.sender_id === G.currentUser?.id && (s.status === 'revoked' || _isExpired(s))));
  showToast(`${toDelete.length} partage(s) purgé(s)`, 'success');
  renderShared();
  updateBadges();
}

function toggleBulkSelect(shareId, checked) {
  if (checked) _shared.bulkSelected.add(shareId);
  else _shared.bulkSelected.delete(shareId);
  _updateBulkBar();
}

function _updateBulkBar() {
  const bar = document.getElementById('sharedBulkBar');
  const count = document.getElementById('sharedBulkCount');
  const n = _shared.bulkSelected.size;
  if (bar) bar.classList.toggle('hidden', n === 0);
  if (count) count.textContent = `${n} sélectionné(s)`;
}

async function bulkRevokeSelected() {
  if (_shared.bulkSelected.size === 0) return;
  if (!confirm(`Révoquer ${_shared.bulkSelected.size} partage(s) ?`)) return;
  for (const id of _shared.bulkSelected) {
    await G.supabase.from('shares').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', id).catch(() => {});
    const s = G.shares.find(x => x.id === id);
    if (s) s.status = 'revoked';
  }
  showToast(`${_shared.bulkSelected.size} partage(s) révoqué(s)`, 'success');
  _shared.bulkSelected.clear();
  renderShared();
  updateBadges();
}

async function bulkExtendSelected(days) {
  if (_shared.bulkSelected.size === 0) return;
  const newDate = new Date();
  newDate.setDate(newDate.getDate() + days);
  for (const id of _shared.bulkSelected) {
    await G.supabase.from('shares').update({ expires_at: newDate.toISOString() }).eq('id', id).catch(() => {});
    const s = G.shares.find(x => x.id === id);
    if (s) s.expires_at = newDate.toISOString();
  }
  showToast(`${_shared.bulkSelected.size} partage(s) prolongé(s) de ${days}j`, 'success');
  _shared.bulkSelected.clear();
  renderShared();
}

function clearBulkSelection() {
  _shared.bulkSelected.clear();
  _updateBulkBar();
  renderShared();
}

async function createPublicLink() {
  const docId   = document.getElementById('publicLinkDocId')?.value;
  const expDays = parseInt(document.getElementById('publicLinkExpiry')?.value || '7');
  const perm    = document.getElementById('publicLinkPerm')?.value || 'view';
  const usePwd  = document.getElementById('publicLinkPassword')?.checked;
  const pwd     = document.getElementById('publicLinkPasswordVal')?.value;
  const useMax  = document.getElementById('publicLinkMaxViews')?.checked;
  const maxV    = parseInt(document.getElementById('publicLinkMaxViewsVal')?.value || '0');
  if (!docId) { showToast('Sélectionnez un document', 'warning'); return; }
  const url = await _doCreatePublicLink(docId, expDays, perm, usePwd ? pwd : null, useMax ? maxV : null);
  if (!url) return;
  const result = document.getElementById('generatedPublicLinkResult');
  const input  = document.getElementById('generatedPublicLinkInput');
  if (result) result.classList.remove('hidden');
  if (input)  input.value = url;
  renderShared();
}

async function _doCreatePublicLink(docId, expDays, perm, password, maxViews) {
  const token = generateId();
  const expires = expDays > 0 ? new Date(Date.now() + expDays * 86400000).toISOString() : null;
  const record = {
    id: generateId(), document_id: docId, token, permission: perm, expires_at: expires,
    password: password || null, max_views: maxViews || null, views: 0,
    created_by: G.currentUser.id, company_id: G.currentUser.companyId, status: 'active', created_at: new Date().toISOString()
  };
  try {
    const { error } = await G.supabase.from('public_shares').insert(record);
    if (error) throw error;
  } catch (err) { console.warn('public_shares insert (non-blocking):', err); }
  _shared.publicLinks.push(record);
  showToast('Lien public généré', 'success');
  await addAuditLog('public_link_create', 'document', docId, `Expire: ${expires || 'jamais'}`);
  return `${window.location.origin}/public/${token}`;
}

async function revokePublicLink(linkId) {
  if (!confirm('Révoquer ce lien public ?')) return;
  try { await G.supabase.from('public_shares').update({ status: 'revoked' }).eq('id', linkId); } catch (_) {}
  const link = _shared.publicLinks.find(l => l.id === linkId);
  if (link) link.status = 'revoked';
  showToast('Lien révoqué', 'success');
  _renderLinks();
}

async function deletePublicLink(linkId) {
  if (!confirm('Supprimer ce lien ?')) return;
  try { await G.supabase.from('public_shares').delete().eq('id', linkId); } catch (_) {}
  _shared.publicLinks = _shared.publicLinks.filter(l => l.id !== linkId);
  showToast('Lien supprimé', 'success');
  _renderLinks();
}

async function extendPublicLink(linkId, days) {
  const link = _shared.publicLinks.find(l => l.id === linkId);
  if (!link) return;
  const base = link.expires_at ? new Date(link.expires_at) : new Date();
  const newDate = new Date(base);
  newDate.setDate(newDate.getDate() + days);
  try { await G.supabase.from('public_shares').update({ expires_at: newDate.toISOString() }).eq('id', linkId); } catch (_) {}
  link.expires_at = newDate.toISOString();
  showToast(`Lien prolongé de ${days}j`, 'success');
  _renderLinks();
}

function copyPublicLink() {
  const val = document.getElementById('generatedPublicLinkInput')?.value;
  if (val) _copyText(val);
}

function copyQsLink() {
  const val = document.getElementById('qsLinkValue')?.value;
  if (val) _copyText(val);
}

function shareViaEmail() {
  const val = document.getElementById('generatedPublicLinkInput')?.value;
  if (val) window.open(`mailto:?subject=Accès document SystemesGED&body=Voici votre lien d'accès : ${encodeURIComponent(val)}`);
}

function openQuickShareModal() {
  _shared.qsRecipients = [];
  _shared.qsCurrentTab = 'user';
  _renderQsChips();
  _populatePublicLinkDocSelector();
  if (G.currentDocId) {
    const sel = document.getElementById('qsDocId');
    if (sel) sel.value = G.currentDocId;
  }
  switchQuickShareTab('user');
  const modal = document.getElementById('quickShareModal');
  if (modal) modal.classList.remove('hidden');
}

function closeQuickShareModal() {
  const modal = document.getElementById('quickShareModal');
  if (modal) modal.classList.add('hidden');
  _shared.qsRecipients = [];
  _renderQsChips();
}

function switchQuickShareTab(tab) {
  _shared.qsCurrentTab = tab;
  document.querySelectorAll('.qs-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.qs-tab').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById(`qsPanel-${tab}`);
  const btn   = document.getElementById(`qsTab-${tab}`);
  if (panel) panel.classList.remove('hidden');
  if (btn)   btn.classList.add('active');
  const labels = { user: 'Partager', link: 'Générer le lien', team: 'Partager avec l\'équipe' };
  const lbl = document.getElementById('qsSubmitLabel');
  if (lbl) lbl.textContent = labels[tab] || 'Partager';
  if (tab === 'team') _updateTeamPreview();
}

function addShareRecipient() {
  const input = document.getElementById('qsEmailInput');
  const email = input?.value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('E-mail invalide', 'warning'); return; }
  if (_shared.qsRecipients.includes(email)) { showToast('Déjà ajouté', 'warning'); return; }
  _shared.qsRecipients.push(email);
  if (input) input.value = '';
  const sugg = document.getElementById('qsEmailSuggestions');
  if (sugg) sugg.classList.add('hidden');
  _renderQsChips();
}

function _renderQsChips() {
  const container = document.getElementById('qsRecipientChips');
  if (!container) return;
  container.innerHTML = _shared.qsRecipients.map(email => `<span class="recipient-chip"><i class="fas fa-user text-[10px]"></i>${escapeHtml(email)}<button onclick="_removeQsRecipient('${escapeHtml(email)}')" class="ml-1 opacity-60 hover:opacity-100"><i class="fas fa-xmark text-[10px]"></i></button></span>`).join('');
}

window._removeQsRecipient = function(email) { _shared.qsRecipients = _shared.qsRecipients.filter(e => e !== email); _renderQsChips(); };

function handleShareEmailKeydown(e) {
  if (e.key === 'Enter') { e.preventDefault(); addShareRecipient(); }
  if (e.key === ',')     { e.preventDefault(); addShareRecipient(); }
}

function suggestShareRecipients(val) {
  const sugg = document.getElementById('qsEmailSuggestions');
  if (!sugg) return;
  if (!val || val.length < 2) { sugg.classList.add('hidden'); return; }
  const matches = G.users.filter(u => u.status === 'active' && !_shared.qsRecipients.includes(u.email) && (u.email.toLowerCase().includes(val.toLowerCase()) || u.name.toLowerCase().includes(val.toLowerCase()))).slice(0, 5);
  if (matches.length === 0) { sugg.classList.add('hidden'); return; }
  sugg.classList.remove('hidden');
  sugg.innerHTML = matches.map(u => `<div class="px-3 py-2 cursor-pointer hover:bg-blue-500/10 flex items-center gap-2 text-sm" onclick="selectQsSuggestion('${escapeHtml(u.email)}')"><div class="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-xs text-blue-300 font-bold">${u.name.charAt(0).toUpperCase()}</div><div><p class="text-white font-medium">${escapeHtml(u.name)}</p><p class="text-blue-300/60 text-xs">${escapeHtml(u.email)}</p></div></div>`).join('');
}

function selectQsSuggestion(email) {
  const input = document.getElementById('qsEmailInput');
  if (input) input.value = email;
  const sugg = document.getElementById('qsEmailSuggestions');
  if (sugg) sugg.classList.add('hidden');
  addShareRecipient();
}

function toggleQsLinkPwd() {
  const cb  = document.getElementById('qsLinkUsePwd');
  const inp = document.getElementById('qsLinkPwd');
  if (inp) inp.classList.toggle('hidden', !cb?.checked);
}

function toggleQsLinkMaxViews() {
  const cb  = document.getElementById('qsLinkUseMaxViews');
  const inp = document.getElementById('qsLinkMaxViews');
  if (inp) inp.classList.toggle('hidden', !cb?.checked);
}

function _updateTeamPreview() {
  const target = document.getElementById('qsTeamTarget')?.value;
  const preview = document.getElementById('qsTeamPreviewText');
  if (!preview) return;
  let count = 0;
  if (target === 'all') count = G.users.filter(u => u.status === 'active').length;
  else count = G.users.filter(u => u.status === 'active' && u.role === target).length;
  preview.textContent = `${count} membre(s) avec le rôle "${target}"`;
}

async function executeQuickShare() {
  const docId = document.getElementById('qsDocId')?.value;
  if (!docId) { showToast('Sélectionnez un document', 'warning'); return; }
  const btn = document.getElementById('qsSubmitBtn');
  const lbl = document.getElementById('qsSubmitLabel');
  if (btn) btn.disabled = true;
  if (lbl) lbl.innerHTML = '<span class="spinner"></span>';
  try {
    switch (_shared.qsCurrentTab) {
      case 'user': await _executeUserShare(docId); break;
      case 'link': await _executeLinkShare(docId); break;
      case 'team': await _executeTeamShare(docId); break;
    }
    closeQuickShareModal();
    renderShared();
    updateBadges();
    if (G.currentView === 'shared') renderShared();
  } catch (err) { showToast('Erreur : ' + (err.message || err), 'error'); }
  finally { if (btn) btn.disabled = false; if (lbl) lbl.textContent = ({ user:'Partager', link:'Générer le lien', team:"Partager avec l'équipe" }[_shared.qsCurrentTab] || 'Partager'); }
}

async function _executeUserShare(docId) {
  if (_shared.qsRecipients.length === 0) {
    const raw = document.getElementById('qsEmailInput')?.value.trim();
    if (raw) _shared.qsRecipients.push(raw);
  }
  if (_shared.qsRecipients.length === 0) throw new Error('Ajoutez au moins un destinataire');
  const perm    = document.getElementById('qsPermission')?.value    || 'view';
  const expDays = parseInt(document.getElementById('qsExpiration')?.value || '7');
  const message = document.getElementById('qsMessage')?.value?.trim() || '';
  const expires = expDays > 0 ? new Date(Date.now() + expDays * 86400000).toISOString() : null;
  let count = 0;
  for (const email of _shared.qsRecipients) {
    const share = {
      id: generateId(), document_id: docId, sender_id: G.currentUser.id, recipient_email: email,
      recipient_id: G.users.find(u => u.email === email)?.id || null, permission: perm, expires_at: expires,
      message: message, status: 'active', views: 0, downloads: 0, created_at: new Date().toISOString()
    };
    const { error } = await G.supabase.from('shares').insert(share);
    if (!error) { G.shares.push(share); count++; await addAuditLog('share', 'document', docId, `Partagé avec ${email} (${perm})`); }
  }
  const doc = G.documents.find(d => d.id === docId);
  showToast(`Document "${doc?.name || ''}" partagé avec ${count} destinataire(s)`, 'success');
}

async function _executeLinkShare(docId) {
  const expDays = parseInt(document.getElementById('qsLinkExpiry')?.value || '7');
  const perm    = document.getElementById('qsLinkPerm')?.value || 'view';
  const usePwd  = document.getElementById('qsLinkUsePwd')?.checked;
  const pwd     = document.getElementById('qsLinkPwd')?.value;
  const useMax  = document.getElementById('qsLinkUseMaxViews')?.checked;
  const maxV    = parseInt(document.getElementById('qsLinkMaxViews')?.value || '0');
  const url = await _doCreatePublicLink(docId, expDays, perm, usePwd ? pwd : null, useMax ? maxV : null);
  const result = document.getElementById('qsLinkResult');
  const input  = document.getElementById('qsLinkValue');
  if (result) result.classList.remove('hidden');
  if (input)  input.value = url;
  await navigator.clipboard.writeText(url).catch(() => {});
  showToast('Lien généré et copié !', 'success');
}

async function _executeTeamShare(docId) {
  const target = document.getElementById('qsTeamTarget')?.value || 'all';
  const perm   = document.getElementById('qsTeamPerm')?.value   || 'view';
  const targets = target === 'all' ? G.users.filter(u => u.status === 'active' && u.id !== G.currentUser.id) : G.users.filter(u => u.status === 'active' && u.role === target && u.id !== G.currentUser.id);
  if (targets.length === 0) throw new Error('Aucun utilisateur dans cette cible');
  if (!confirm(`Partager avec ${targets.length} membre(s) ?`)) return;
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  let count = 0;
  for (const user of targets) {
    const share = {
      id: generateId(), document_id: docId, sender_id: G.currentUser.id, recipient_email: user.email,
      recipient_id: user.id, permission: perm, expires_at: expires, status: 'active', views: 0, downloads: 0, created_at: new Date().toISOString()
    };
    const { error } = await G.supabase.from('shares').insert(share);
    if (!error) { G.shares.push(share); count++; }
  }
  showToast(`Document partagé avec ${count} membre(s) de l'équipe`, 'success');
  await addAuditLog('share_team', 'document', docId, `Cible: ${target}, permission: ${perm}`);
}

function openShareDetailModal(shareId) {
  const share = G.shares.find(s => s.id === shareId);
  if (!share) return;
  const doc    = G.documents.find(d => d.id === share.document_id);
  const sender = G.users.find(u => u.id === share.sender_id);
  const status = _shareStatus(share);
  const container = document.getElementById('shareDetailContent');
  if (container) {
    container.innerHTML = `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20">
        <p class="text-blue-300/60 text-xs mb-2">Document partagé</p>
        <div class="flex items-center gap-3 cursor-pointer hover:bg-blue-500/5 rounded-lg p-2 -m-2 transition-all" onclick="closeShareDetailModal();openPreviewModal('${share.document_id}')">
          <i class="fas ${getFileIcon(doc?.type).split(' ')[0]} ${getFileIcon(doc?.type).split(' ')[1] || 'text-blue-400'} text-xl"></i>
          <div><p class="text-white font-semibold">${escapeHtml(doc?.name || 'Document inconnu')}</p><p class="text-xs text-blue-300/50">${doc ? formatBytes(doc.size) : ''}</p></div>
          <i class="fas fa-external-link-alt text-blue-400/40 ml-auto"></i>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="glass-card rounded-xl p-3 border border-blue-500/15"><p class="text-blue-300/50 text-xs mb-1">Expéditeur</p><p class="text-white text-sm font-medium">${escapeHtml(sender?.name || share.sender_id?.substring(0,8) || '—')}</p></div>
        <div class="glass-card rounded-xl p-3 border border-blue-500/15"><p class="text-blue-300/50 text-xs mb-1">Destinataire</p><p class="text-white text-sm font-medium truncate">${escapeHtml(share.recipient_email || '—')}</p></div>
        <div class="glass-card rounded-xl p-3 border border-blue-500/15"><p class="text-blue-300/50 text-xs mb-1">Permission</p><span class="text-xs px-2 py-1 rounded-full perm-badge-${share.permission || 'view'}">${_permLabel(share.permission)}</span></div>
        <div class="glass-card rounded-xl p-3 border border-blue-500/15"><p class="text-blue-300/50 text-xs mb-1">Statut</p><span class="text-xs px-2 py-1 rounded-full status-${status}">${_statusLabel(status)}</span></div>
        <div class="glass-card rounded-xl p-3 border border-blue-500/15"><p class="text-blue-300/50 text-xs mb-1">Créé le</p><p class="text-white text-sm">${formatDate(share.created_at)}</p></div>
        <div class="glass-card rounded-xl p-3 border border-blue-500/15"><p class="text-blue-300/50 text-xs mb-1">Expiration</p><p class="text-white text-sm ${_isExpired(share) ? 'text-orange-400' : ''}">${share.expires_at ? formatDate(share.expires_at) : 'Illimitée'}</p></div>
      </div>
      <div class="glass-card rounded-xl p-4 border border-purple-500/15">
        <p class="text-white font-semibold text-sm mb-3 flex items-center gap-2"><i class="fas fa-chart-bar text-purple-400"></i>Statistiques d'accès</p>
        <div class="grid grid-cols-3 gap-3 text-center"><div><p class="text-2xl font-bold text-purple-300">${share.views || 0}</p><p class="text-[10px] text-blue-300/50">Vues</p></div><div><p class="text-2xl font-bold text-green-300">${share.downloads || 0}</p><p class="text-[10px] text-blue-300/50">Téléchargements</p></div><div><p class="text-2xl font-bold text-blue-300">${share.last_accessed ? formatDate(share.last_accessed) : '—'}</p><p class="text-[10px] text-blue-300/50">Dernier accès</p></div></div>
      </div>
      ${status === 'active' && share.sender_id === G.currentUser?.id ? `<div class="flex gap-3"><button onclick="extendShare('${share.id}', 7); closeShareDetailModal();" class="flex-1 py-2.5 rounded-xl text-sm text-green-400 border border-green-500/25 hover:bg-green-500/10 flex items-center justify-center gap-2"><i class="fas fa-calendar-plus"></i>Prolonger +7j</button><button onclick="revokeShare('${share.id}'); closeShareDetailModal();" class="flex-1 py-2.5 rounded-xl text-sm text-red-400 border border-red-500/25 hover:bg-red-500/10 flex items-center justify-center gap-2"><i class="fas fa-ban"></i>Révoquer</button></div>` : ''}
    `;
  }
  const modal = document.getElementById('shareDetailModal');
  if (modal) modal.classList.remove('hidden');
}

function closeShareDetailModal() {
  const modal = document.getElementById('shareDetailModal');
  if (modal) modal.classList.add('hidden');
}

async function refreshShares() {
  if (!G.currentUser || !G.supabase) return;
  showToast('Actualisation des partages…', 'info');
  try {
    const [sentRes, receivedRes] = await Promise.all([
      G.supabase.from('shares').select('*').eq('sender_id', G.currentUser.id),
      G.supabase.from('shares').select('*').eq('recipient_email', G.currentUser.email)
    ]);
    const allIds = new Set([...(sentRes.data || []).map(s => s.id), ...(receivedRes.data || []).map(s => s.id)]);
    const merged = G.shares.filter(s => !allIds.has(s.id));
    G.shares = [...merged, ...(sentRes.data || []), ...(receivedRes.data || [])];
    const seen = new Set();
    G.shares = G.shares.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
    const { data: links } = await G.supabase.from('public_shares').select('*').eq('created_by', G.currentUser.id);
    _shared.publicLinks = links || [];
    renderShared();
    updateBadges();
    showToast('Partages actualisés', 'success');
  } catch (err) { showToast('Erreur actualisation', 'error'); }
}

async function shareDocument() {
  const email = document.getElementById('shareEmail')?.value.trim();
  if (!email) { showToast('Veuillez entrer un email', 'warning'); return; }
  const docId = G.currentDocId;
  if (!docId) { showToast('Aucun document sélectionné', 'error'); return; }
  try {
    const { data: targetUser } = await G.supabase.from('profiles').select('id').eq('email', email).eq('company_id', G.currentUser.companyId).single();
    if (!targetUser) { showToast('Cet utilisateur n\'appartient pas à votre entreprise', 'error'); return; }
    const existing = G.shares.find(s => s.document_id === docId && s.recipient_email === email && s.status === 'active');
    if (existing) { showToast('Ce document est déjà partagé avec cet utilisateur', 'warning'); return; }
    const perm    = document.getElementById('sharePermission')?.value || 'view';
    const expDays = parseInt(document.getElementById('shareExpiration')?.value || '0');
    const expires = expDays > 0 ? new Date(Date.now() + expDays * 86400000).toISOString() : null;
    const share = {
      id: generateId(), document_id: docId, sender_id: G.currentUser.id, recipient_email: email,
      recipient_id: targetUser.id, permission: perm, expires_at: expires, status: 'active', views: 0, downloads: 0, created_at: new Date().toISOString()
    };
    const { error } = await G.supabase.from('shares').insert(share);
    if (error) throw error;
    G.shares.push(share);
    showToast(`Document partagé avec ${email}`, 'success');
    closeShareModal();
    updateBadges();
    await addAuditLog('share', 'document', docId, `Partagé avec ${email} (${perm})`);
    if (G.currentView === 'shared') renderShared();
  } catch (err) { showToast('Erreur partage : ' + err.message, 'error'); }
}

async function generatePublicLink(docId, expiresInDays = 7) {
  if (!docId) return;
  const url = await _doCreatePublicLink(docId, expiresInDays, 'view', null, null);
  if (!url) return;
  const linkInput = document.getElementById('shareLinkInput');
  const genDiv    = document.getElementById('generatedLink');
  if (linkInput) linkInput.value = url;
  if (genDiv)    genDiv.classList.remove('hidden');
  return url;
}

function copyShareLink() {
  const val = document.getElementById('shareLinkInput')?.value;
  if (val) _copyText(val);
}

function _setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function _setBadge(id, count) { const el = document.getElementById(id); if (!el) return; if (count > 0) { el.textContent = count; el.classList.remove('hidden'); } else el.classList.add('hidden'); }
function _permLabel(perm) { const m = { view: '👁 Lecture', download: '⬇ Téléchargement', edit: '✏ Modification' }; return m[perm] || perm || '—'; }
function _statusLabel(status) { const m = { active: '✅ Actif', revoked: '🚫 Révoqué', expired: '⏰ Expiré' }; return m[status] || status; }
function _cardBorderClass(status) { const m = { active: 'border-blue-500/20 hover:border-blue-400/40', revoked: 'border-red-500/15 hover:border-red-400/30', expired: 'border-orange-500/15 hover:border-orange-400/30' }; return m[status] || 'border-blue-500/20'; }
function _copyText(text) { if (navigator.clipboard) { navigator.clipboard.writeText(text).then(() => showToast('Copié dans le presse-papiers', 'success')).catch(() => _fallbackCopy(text)); } else { _fallbackCopy(text); } }

// ═══════════════════════════════════════════════════════════════════════
// PARTIE 2 : WORKFLOWS (avec try/catch)
// ═══════════════════════════════════════════════════════════════════════

async function renderWorkflows() {
  const container = document.getElementById('wfKanban');
  if (!container) return;
  try {
    if (G.supabase && G.currentUser?.companyId) {
      const { data, error } = await G.supabase.from('workflows').select('*').eq('company_id', G.currentUser.companyId).order('created_at', { ascending: false });
      if (!error && data) G.workflows = data;
    }
  } catch (err) { console.warn('renderWorkflows: erreur Supabase', err); }
  let wfs = G.workflows;
  if (G.wfFilter) wfs = wfs.filter(w => w.status === G.wfFilter);
  const statuses = ['pending', 'in_review', 'approved', 'rejected'];
  container.innerHTML = statuses.map(status => {
    const cards = wfs.filter(w => w.status === status);
    return `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20 min-h-[120px]">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-semibold ${getWfStatusColor(status)}">${getWfStatusLabel(status)}</h4>
        <span class="text-xs px-2 py-0.5 rounded-full ${getWfStatusClass(status)}">${cards.length}</span>
      </div>
      <div class="space-y-2">
        ${cards.length === 0 ? '<p class="text-xs text-blue-300/30 text-center py-4">Aucun workflow</p>' : cards.map(wf => {
          const assignee = wf.assignee_id ? G.users.find(u => u.id === wf.assignee_id) : null;
          const docName  = wf.document_id ? G.documents.find(d => d.id === wf.document_id)?.name : null;
          return `
          <div class="p-3 rounded-lg bg-slate-800/50 border border-blue-500/10 cursor-pointer hover:bg-slate-700/50 hover:border-blue-400/30 transition-all group" onclick="openWfDetail('${wf.id}')">
            <p class="text-white text-sm font-medium truncate">${escapeHtml(wf.title)}</p>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <span class="text-[10px] px-1.5 py-0.5 rounded ${wf.priority === 'high' ? 'bg-red-500/20 text-red-300' : wf.priority === 'low' ? 'bg-gray-500/20 text-gray-400' : 'bg-yellow-500/20 text-yellow-300'}">${wf.priority || 'medium'}</span>
              ${assignee ? `<span class="text-[10px] text-green-400/70"><i class="fas fa-user mr-1"></i>${escapeHtml(assignee.name)}</span>` : ''}
              ${docName  ? `<span class="text-[10px] text-blue-300/50 truncate max-w-[100px]"><i class="fas fa-file mr-1"></i>${escapeHtml(docName)}</span>` : ''}
            </div>
            ${wf.due_date ? `<p class="text-[10px] text-orange-400/70 mt-1"><i class="fas fa-calendar mr-1"></i>Échéance : ${formatDate(wf.due_date)}</p>` : ''}
            <p class="text-[10px] text-blue-400/40 mt-1">${formatDate(wf.created_at)}</p>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
  const counts = { pending: 0, in_review: 0, approved: 0, rejected: 0 };
  G.workflows.forEach(w => { if (counts[w.status] !== undefined) counts[w.status]++; });
  const wfKpiStrip = document.getElementById('wfKpiStrip');
  if (wfKpiStrip) {
    wfKpiStrip.innerHTML = `
      <div class="glass-card rounded-xl p-2 text-center cursor-pointer hover:bg-orange-500/10 transition-all" onclick="filterWorkflows('pending')"><p class="text-orange-400 text-xl font-bold">${counts.pending}</p><p class="text-xs text-blue-300/60">En attente</p></div>
      <div class="glass-card rounded-xl p-2 text-center cursor-pointer hover:bg-blue-500/10 transition-all" onclick="filterWorkflows('in_review')"><p class="text-blue-400 text-xl font-bold">${counts.in_review}</p><p class="text-xs text-blue-300/60">En révision</p></div>
      <div class="glass-card rounded-xl p-2 text-center cursor-pointer hover:bg-green-500/10 transition-all" onclick="filterWorkflows('approved')"><p class="text-green-400 text-xl font-bold">${counts.approved}</p><p class="text-xs text-blue-300/60">Approuvés</p></div>
      <div class="glass-card rounded-xl p-2 text-center cursor-pointer hover:bg-red-500/10 transition-all" onclick="filterWorkflows('rejected')"><p class="text-red-400 text-xl font-bold">${counts.rejected}</p><p class="text-xs text-blue-300/60">Rejetés</p></div>
    `;
  }
  if (G.wfView === 'list') renderWorkflowsList();
  updateBadges();
}

function closeWfDetailModal() { const modal = document.getElementById('wfDetailModal'); if (modal) modal.classList.add('hidden'); G.currentWfId = null; }
function switchWfView(view) { ['kanban','list'].forEach(v => { const el = document.getElementById(`wfView-${v}`); if (el) el.classList.toggle('hidden', v !== view); const btn = document.querySelector(`[data-wf-view="${v}"]`); if (btn) btn.classList.toggle('active', v === view); }); }
function getWfStatusClass(status) { const classes = { pending: 'bg-orange-500/20 text-orange-300', in_review: 'bg-blue-500/20 text-blue-300', approved: 'bg-green-500/20 text-green-300', rejected: 'bg-red-500/20 text-red-300' }; return classes[status] || 'bg-gray-500/20 text-gray-300'; }
function getWfStatusLabel(status) { const labels = { pending: 'En attente', in_review: 'En révision', approved: 'Approuvé', rejected: 'Rejeté' }; return labels[status] || status; }
function getWfStatusColor(status) { const colors = { pending: 'text-orange-400', in_review: 'text-blue-400', approved: 'text-green-400', rejected: 'text-red-400' }; return colors[status] || 'text-gray-400'; }
function closeWorkflowModal() { const modal = document.getElementById('workflowModal'); if (modal) modal.classList.add('hidden'); const fields = ['wfTitle', 'wfDesc', 'wfSteps']; fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); }

function openCreateWorkflowModal() {
  const docSelect = document.getElementById('wfDocId');
  if (docSelect) docSelect.innerHTML = '<option value="">-- Aucun --</option>' + G.documents.filter(d => !d.is_deleted).map(doc => `<option value="${doc.id}">${escapeHtml(doc.name)}</option>`).join('');
  const assigneeSelect = document.getElementById('wfAssignee');
  if (assigneeSelect) assigneeSelect.innerHTML = '<option value="">-- Non assigné --</option>' + G.users.filter(u => u.status === 'active').map(user => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join('');
  const titleInput = document.getElementById('wfTitle'); const descInput = document.getElementById('wfDesc'); const stepsInput = document.getElementById('wfSteps'); const prioritySelect = document.getElementById('wfPriority'); const dueDateInput = document.getElementById('wfDueDate');
  if (titleInput) titleInput.value = ''; if (descInput) descInput.value = ''; if (stepsInput) stepsInput.value = ''; if (prioritySelect) prioritySelect.value = 'medium'; if (dueDateInput) dueDateInput.value = '';
  const modal = document.getElementById('workflowModal'); if (modal) modal.classList.remove('hidden');
}

async function createWorkflow(e) {
  e.preventDefault();
  const title = document.getElementById('wfTitle')?.value.trim();
  if (!title) { showToast('Veuillez entrer un titre', 'warning'); return; }
  const steps = [];
  const stepsInput = document.getElementById('wfSteps')?.value;
  if (stepsInput) steps.push(...stepsInput.split(',').map(s => s.trim()).filter(s => s));
  const newWf = {
    id: generateId(), title, description: document.getElementById('wfDesc')?.value.trim() || '', priority: document.getElementById('wfPriority')?.value || 'medium',
    status: 'pending', assignee_id: document.getElementById('wfAssignee')?.value || null, document_id: document.getElementById('wfDocId')?.value || null,
    due_date: document.getElementById('wfDueDate')?.value || null, created_by: G.currentUser.id, company_id: G.currentUser.companyId,
    steps: steps, current_step: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  try {
    const { error } = await G.supabase.from('workflows').insert(newWf);
    if (error) throw error;
    G.workflows.unshift(newWf);
    showToast('Workflow créé avec succès', 'success');
    closeWorkflowModal();
    if (G.wfView === 'kanban') renderWorkflows();
    else renderWorkflowsList();
    await addAuditLog('workflow_create', 'workflow', newWf.id, `Titre: ${title}`);
  } catch (err) { showToast('Erreur création workflow: ' + err.message, 'error'); }
}

async function actOnWorkflow(action, comment) {
  if (!G.currentWfId) return;
  const wf = G.workflows.find(w => w.id === G.currentWfId);
  if (!wf) return;
  const commentText = document.getElementById('wfDetailComment')?.value || comment || '';
  const actionRecord = { id: generateId(), workflow_id: G.currentWfId, user_id: G.currentUser.id, action: action, comment: commentText, step_index: wf.current_step, created_at: new Date().toISOString() };
  try { await G.supabase.from('workflow_actions').insert(actionRecord); } catch(e) { console.warn('workflow_actions RLS:', e?.code); }
  let newStatus = wf.status, newStep = wf.current_step;
  if (action === 'approve') {
    if (wf.steps && wf.current_step + 1 >= (wf.steps?.length || 0)) newStatus = 'approved';
    else { newStep = (wf.current_step || 0) + 1; newStatus = 'in_review'; }
  } else if (action === 'reject') newStatus = 'rejected';
  else if (action === 'request_changes') newStatus = 'in_review';
  try {
    const { error } = await G.supabase.from('workflows').update({ status: newStatus, current_step: newStep, updated_at: new Date().toISOString() }).eq('id', G.currentWfId);
    if (error) throw error;
    wf.status = newStatus; wf.current_step = newStep;
    showToast(`Workflow ${action === 'approve' ? 'approuvé' : action === 'reject' ? 'rejeté' : 'mis à jour'}`, 'success');
    if (G.wfView === 'kanban') renderWorkflows();
    else renderWorkflowsList();
    closeWfDetail();
    await addAuditLog(`workflow_${action}`, 'workflow', G.currentWfId, `Commentaire: ${commentText || 'Aucun'}`);
  } catch (err) { showToast('Erreur mise à jour workflow: ' + err.message, 'error'); }
}

async function loadWorkflowHistory(wfId) {
  try {
    const { data: actions, error } = await G.supabase.from('workflow_actions').select('*, profiles!user_id(name)').eq('workflow_id', wfId).order('created_at', { ascending: false });
    const historyContainer = document.getElementById('wfDetailHistory');
    if (historyContainer) {
      if (!actions || actions.length === 0) historyContainer.innerHTML = '<p class="text-center py-4 text-blue-300/50">Aucune activité</p>';
      else historyContainer.innerHTML = actions.map(a => `<div class="p-2 border-b border-blue-500/10"><div class="flex items-center justify-between"><p class="text-white text-xs font-medium">${a.profiles?.name || 'Utilisateur'}</p><span class="text-blue-300/50 text-[10px]">${formatDate(a.created_at)}</span></div><p class="text-blue-300/70 text-xs mt-0.5">${getWfActionLabel(a.action)}</p>${a.comment ? `<p class="text-xs text-blue-300/50 mt-1 italic">"${escapeHtml(a.comment)}"</p>` : ''}</div>`).join('');
    }
  } catch (err) { console.warn('loadWorkflowHistory error:', err); }
}

async function addWfComment() {
  const comment = document.getElementById('wfCommentInput')?.value.trim();
  if (!comment || !G.currentWfId) { showToast('Veuillez écrire un commentaire', 'warning'); return; }
  const actionRecord = { id: generateId(), workflow_id: G.currentWfId, user_id: G.currentUser.id, action: 'comment', comment: comment, created_at: new Date().toISOString() };
  try {
    const { error } = await G.supabase.from('workflow_actions').insert(actionRecord);
    if (error) throw error;
    const input = document.getElementById('wfCommentInput');
    if (input) input.value = '';
    await loadWorkflowHistory(G.currentWfId);
    showToast('Commentaire ajouté', 'success');
  } catch (err) { showToast('Erreur ajout commentaire', 'error'); }
}

function getWfActionLabel(action) { const labels = { approve: 'approuvé', reject: 'rejeté', request_changes: 'demandé des modifications', comment: 'commenté' }; return labels[action] || action; }
function closeWfDetail() { const modal = document.getElementById('wfDetailModal'); if (modal) modal.classList.add('hidden'); G.currentWfId = null; }
function filterWorkflows(status) { G.wfFilter = G.wfFilter === status ? '' : status; document.querySelectorAll('.wf-filter-btn').forEach(btn => { const active = btn.dataset.wf === G.wfFilter; btn.classList.toggle('bg-blue-500/20', active); btn.classList.toggle('text-blue-300', active); btn.classList.toggle('border-blue-500/30', active); btn.classList.toggle('text-gray-400', !active); btn.classList.toggle('border-blue-500/10', !active); }); if (G.wfView === 'kanban') renderWorkflows(); else renderWorkflowsList(); }
function searchWorkflows(query) { if (!query || query.length < 2) { if (G.wfView === 'kanban') renderWorkflows(); else renderWorkflowsList(); return; } const filtered = G.workflows.filter(w => w.title.toLowerCase().includes(query.toLowerCase()) || (w.description && w.description.toLowerCase().includes(query.toLowerCase()))); const container = document.getElementById('wfKanban'); const listContainer = document.getElementById('wfListView'); if (G.wfView === 'kanban' && container) { if (filtered.length === 0) container.innerHTML = '<div class="col-span-full text-center py-12 text-blue-300/50">Aucun résultat</div>'; else container.innerHTML = filtered.map(wf => `<div class="glass-card rounded-xl p-4 border border-blue-500/20 cursor-pointer" onclick="openWfDetail('${wf.id}')"><p class="text-white font-medium">${escapeHtml(wf.title)}</p><span class="text-xs px-2 py-0.5 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span></div>`).join(''); } else if (listContainer) { if (filtered.length === 0) listContainer.innerHTML = '<div class="text-center py-12 text-blue-300/50">Aucun résultat</div>'; else listContainer.innerHTML = filtered.map(wf => `<div class="glass-card rounded-xl p-4 border border-blue-500/20 cursor-pointer" onclick="openWfDetail('${wf.id}')"><div class="flex justify-between"><span class="text-white font-medium">${escapeHtml(wf.title)}</span><span class="text-xs px-2 py-1 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span></div></div>`).join(''); } }
function setWfView(view) { G.wfView = view; const kanban = document.getElementById('wfKanban'); const listView = document.getElementById('wfListView'); const btnKanban = document.getElementById('wfViewKanban'); const btnList = document.getElementById('wfViewList'); if (view === 'kanban') { if (kanban) kanban.classList.remove('hidden'); if (listView) listView.classList.add('hidden'); if (btnKanban) btnKanban.classList.add('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20'); if (btnList) btnList.classList.remove('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20'); renderWorkflows(); } else { if (kanban) kanban.classList.add('hidden'); if (listView) listView.classList.remove('hidden'); if (btnList) btnList.classList.add('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20'); if (btnKanban) btnKanban.classList.remove('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20'); renderWorkflowsList(); } }
async function renderWorkflowsList() { const container = document.getElementById('wfListView'); if (!container) return; try { if (G.supabase && G.currentUser?.companyId && G.wfView === 'list') { const { data, error } = await G.supabase.from('workflows').select('*').eq('company_id', G.currentUser.companyId).order('created_at', { ascending: false }); if (!error && data) G.workflows = data; } } catch (err) { console.warn('renderWorkflowsList: erreur Supabase', err); } let filtered = G.workflows; if (G.wfFilter) filtered = filtered.filter(w => w.status === G.wfFilter); if (filtered.length === 0) { container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-tasks text-4xl mb-2 opacity-20"></i><p>Aucun workflow trouvé</p></div>'; return; } container.innerHTML = filtered.map(wf => { const assignee = wf.assignee_id ? G.users.find(u => u.id === wf.assignee_id) : null; const doc = wf.document_id ? G.documents.find(d => d.id === wf.document_id) : null; return `<div class="glass-card rounded-xl p-4 border border-blue-500/20 cursor-pointer hover:border-blue-400/40 transition-all group" onclick="openWfDetail('${wf.id}')"><div class="flex items-center justify-between flex-wrap gap-2"><div class="flex-1 min-w-0"><p class="text-white font-medium truncate">${escapeHtml(wf.title)}</p><div class="flex items-center gap-2 mt-1 flex-wrap"><span class="text-xs px-2 py-0.5 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span><span class="text-xs text-blue-300/60">Priorité : ${wf.priority || 'medium'}</span><span class="text-xs text-blue-300/60">${formatDate(wf.created_at)}</span></div>${assignee ? `<p class="text-xs text-green-400/60 mt-1"><i class="fas fa-user mr-1"></i>${escapeHtml(assignee.name)}</p>` : ''}${doc ? `<p class="text-xs text-blue-300/50 mt-1 truncate"><i class="fas fa-file mr-1"></i>${escapeHtml(doc.name)}</p>` : ''}${wf.due_date ? `<p class="text-xs text-orange-400/70 mt-1"><i class="fas fa-calendar mr-1"></i>Échéance : ${formatDate(wf.due_date)}</p>` : ''}</div><i class="fas fa-chevron-right text-blue-400/50 group-hover:text-blue-300 transition-colors"></i></div></div>`; }).join(''); }

// ═══════════════════════════════════════════════════════════════════════
// EXPOSITIONS GLOBALES
// ═══════════════════════════════════════════════════════════════════════

Object.assign(window, {
  // Shared
  renderShared, switchSharedTab, filterSharedView, clearSharedFilters,
  revokeShare, revokeReceivedShare, extendShare, renewShare, deleteShareRecord, purgeExpiredShares,
  toggleBulkSelect, bulkRevokeSelected, bulkExtendSelected, clearBulkSelection,
  createPublicLink, revokePublicLink, deletePublicLink, extendPublicLink,
  copyPublicLink, copyQsLink, shareViaEmail, loadShareActivity,
  openQuickShareModal, closeQuickShareModal, switchQuickShareTab, executeQuickShare,
  addShareRecipient, handleShareEmailKeydown, suggestShareRecipients, selectQsSuggestion,
  toggleQsLinkPwd, toggleQsLinkMaxViews,
  openShareDetailModal, closeShareDetailModal,
  shareDocument, generatePublicLink, copyShareLink, refreshShares,
  // Workflows
  renderWorkflows, openCreateWorkflowModal, closeWorkflowModal, createWorkflow,
  actOnWorkflow, addWfComment, openWfDetail, closeWfDetail, filterWorkflows,
  searchWorkflows, setWfView, closeWfDetailModal, switchWfView
});
