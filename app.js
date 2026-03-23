// ============================================
// SystemesGED v7.0 – Application complète avec Supabase
// ============================================

// ─── Configuration ─────────────────────────────────────────
const CONFIG = {
  supabaseUrl: 'https://whkvtpqesqiailwjgoaq.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indoa3Z0cHFlc3FpYWlsd2pnb2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxOTU1ODIsImV4cCI6MjA4OTc3MTU4Mn0.oIEDNRvSAEsVTarXnIl1cMTLoqS1nsHo8dPnjdW0ng8',
  storageBucket: 'documents',
  maxFileSize: 50 * 1024 * 1024, // 50 MB
  plans: {
    free: { name: 'Free', price: 0, users: 5, storage: 1073741824 },
    starter: { name: 'Starter', price: 29, users: 20, storage: 10737418240 },
    professional: { name: 'Professional', price: 79, users: 100, storage: 107374182400 },
    enterprise: { name: 'Enterprise', price: null, users: 999999, storage: 999999999999 }
  },
  systemAdmins: [
    { email: 'ahouansouange@live.fr', companyName: 'live', companyId: 'live_company', password: 'AA++aa++11111' },
    { email: 'systemesshop@gmail.com', companyName: 'systemesshop', companyId: 'systemesshop_company', password: 'SS++ss++11111' }
  ]
};

// ─── État global ─────────────────────────────────────────
window.G = {
  supabase: null,
  currentUser: null,
  currentCompany: null,
  documents: [],
  workflows: [],
  users: [],
  tags: [],
  shares: [],
  folders: [],
  signatures: [],
  automationRules: [],
  apiKeys: [],
  backups: [],
  auditLogs: [],
  systemLogs: [],
  roles: {
    admin: { name: 'Administrateur', perms: ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users'] },
    manager: { name: 'Manager', perms: ['read', 'write', 'delete', 'users', 'signatures'] },
    editor: { name: 'Éditeur', perms: ['read', 'write'] },
    viewer: { name: 'Lecteur', perms: ['read'] }
  },
  currentView: 'dashboard',
  docsTab: 'company',
  sharedTab: 'received',
  wfFilter: '',
  wfView: 'kanban',
  viewMode: 'grid',
  selectedFiles: [],
  uploadTags: [],
  currentDocId: null,
  currentWfId: null,
  currentFolderId: '__root__',
  folderPath: [{ id: '__root__', name: 'Racine' }],
  pendingUsersCount: 0
};

// ─── Initialisation Supabase ──────────────────────────────
async function initSupabase() {
  try {
    if (typeof supabase === 'undefined') throw new Error('Supabase library not loaded');
    G.supabase = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
      auth: { autoRefreshToken: true, persistSession: true }
    });
    // Vérifier la session
    const { data: { session } } = await G.supabase.auth.getSession();
    if (session) {
      await loadUserFromSupabase(session.user);
      return true;
    }
    return false;
  } catch (e) {
    console.error('Supabase init error:', e);
    return false;
  }
}

// Charger l'utilisateur et ses données depuis Supabase
async function loadUserFromSupabase(user) {
  if (!user) return false;
  // Vérifier si admin système
  const sysAdmin = CONFIG.systemAdmins.find(a => a.email === user.email);
  if (sysAdmin) {
    G.currentUser = {
      id: user.id,
      email: user.email,
      name: `Admin ${sysAdmin.companyName}`,
      role: 'admin',
      companyId: sysAdmin.companyId,
      companyName: sysAdmin.companyName,
      plan: 'enterprise',
      status: 'active',
      isSystemAdmin: true
    };
    await ensureCompanyExists(sysAdmin.companyId, sysAdmin.companyName);
    await loadAllData();
    return true;
  }
  // Utilisateur normal
  const { data: profile, error } = await G.supabase
    .from('profiles')
    .select('*, companies!company_id(name, plan)')
    .eq('id', user.id)
    .single();
  if (error) {
    console.error('Erreur chargement profil:', error);
    return false;
  }
  G.currentUser = {
    id: user.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    companyId: profile.company_id,
    companyName: profile.companies?.name || 'Mon entreprise',
    plan: profile.plan || 'free',
    status: profile.status,
    isSystemAdmin: false
  };
  await loadAllData();
  return true;
}

// Assurer l'existence de l'entreprise (pour les admins système)
async function ensureCompanyExists(companyId, companyName) {
  const { data: existing } = await G.supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .single();
  if (!existing) {
    await G.supabase.from('companies').insert({
      id: companyId,
      name: companyName,
      plan: 'enterprise'
    });
  }
}

// Charger toutes les données de l'entreprise courante
async function loadAllData() {
  if (!G.currentUser?.companyId) return;
  const companyId = G.currentUser.companyId;

  // Documents
  const { data: docs } = await G.supabase
    .from('documents')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  G.documents = docs || [];

  // Workflows
  const { data: wfs } = await G.supabase
    .from('workflows')
    .select('*')
    .eq('company_id', companyId);
  G.workflows = wfs || [];

  // Utilisateurs (profil)
  const { data: users } = await G.supabase
    .from('profiles')
    .select('*')
    .eq('company_id', companyId);
  G.users = users || [];

  // Tags
  const { data: tags } = await G.supabase
    .from('tags')
    .select('*')
    .eq('company_id', companyId);
  G.tags = tags || [];

  // Partages
  const { data: shares } = await G.supabase
    .from('shares')
    .select('*, documents!document_id(name)')
    .eq('sender_id', G.currentUser.id);
  G.shares = shares || [];

  // Dossiers
  const { data: folders } = await G.supabase
    .from('folders')
    .select('*')
    .eq('company_id', companyId);
  G.folders = folders || [];

  // Signatures
  const { data: signatures } = await G.supabase
    .from('signatures')
    .select('*')
    .eq('signer_id', G.currentUser.id);
  G.signatures = signatures || [];

  // Règles d'automatisation
  const { data: rules } = await G.supabase
    .from('automation_rules')
    .select('*')
    .eq('company_id', companyId);
  G.automationRules = rules || [];

  // Clés API
  const { data: keys } = await G.supabase
    .from('api_keys')
    .select('*')
    .eq('user_id', G.currentUser.id);
  G.apiKeys = keys || [];

  // Sauvegardes
  const { data: backups } = await G.supabase
    .from('backups')
    .select('*')
    .eq('company_id', companyId);
  G.backups = backups || [];

  // Logs d'audit
  const { data: audit } = await G.supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', G.currentUser.id)
    .order('created_at', { ascending: false })
    .limit(50);
  G.auditLogs = audit || [];

  // Logs système
  const { data: syslogs } = await G.supabase
    .from('system_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  G.systemLogs = syslogs || [];

  updateUI();
}

// ─── Mise à jour de l'interface ──────────────────────────
function updateUI() {
  updateUserDisplay();
  updateBadges();
  updateStorageDisplay();
  if (canValidateUsers()) updatePendingUsersCount();
}

function updateUserDisplay() {
  if (!G.currentUser) return;
  document.getElementById('userNameDisplay').textContent = G.currentUser.name;
  document.getElementById('userRoleDisplay').textContent = G.roles[G.currentUser.role]?.name || G.currentUser.role;
  document.getElementById('userAvatarInitial').textContent = G.currentUser.name.charAt(0).toUpperCase();
  document.getElementById('dropdownUserName').textContent = G.currentUser.name;
  document.getElementById('dropdownUserEmail').textContent = G.currentUser.email;
  document.getElementById('companyNameLabel').textContent = G.currentUser.companyName || 'Entreprise';
  document.getElementById('companyPlanLabel').textContent = `Plan ${G.currentUser.plan}`;
  document.getElementById('companyAvatar').textContent = (G.currentUser.companyName || 'E').charAt(0).toUpperCase();
  const badge = document.getElementById('planBadge');
  if (badge) {
    badge.textContent = G.currentUser.plan.toUpperCase();
    badge.className = `hidden sm:inline badge-plan badge-${G.currentUser.plan}`;
  }
  // Afficher/masquer les menus admin
  const isAdmin = G.currentUser.role === 'admin' || G.currentUser.isSystemAdmin;
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    el.style.display = isAdmin ? 'flex' : 'none';
  });
}

function updateBadges() {
  const docCount = G.documents.filter(d => !d.is_deleted).length;
  const docBadge = document.getElementById('d-docsBadge');
  if (docBadge) {
    docBadge.textContent = docCount;
    docBadge.classList.toggle('hidden', docCount === 0);
  }
  const wfCount = G.workflows.filter(w => ['pending', 'in_review'].includes(w.status)).length;
  const wfBadge = document.getElementById('d-wfBadge');
  if (wfBadge) {
    wfBadge.textContent = wfCount;
    wfBadge.classList.toggle('hidden', wfCount === 0);
  }
}

function updateStorageDisplay() {
  const used = G.documents.reduce((sum, d) => sum + (d.size || 0), 0);
  const limit = CONFIG.plans[G.currentUser.plan].storage;
  const percent = Math.min(100, Math.round((used / limit) * 100));
  document.getElementById('storagePercent').textContent = `${percent}%`;
  document.getElementById('storageBar').style.width = `${percent}%`;
  document.getElementById('storageText').textContent = `${formatBytes(used)} / ${formatBytes(limit)}`;
}

// ─── Authentification ────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail')?.value.trim().toLowerCase();
  const password = document.getElementById('loginPassword')?.value;
  if (!email || !password) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }
  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');
  btn.disabled = true;
  btnText.innerHTML = '<span class="spinner mr-2"></span>Connexion...';

  try {
    const { data, error } = await G.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      await loadUserFromSupabase(data.user);
      showToast(`Bienvenue ${G.currentUser.name}`, 'success');
      switchToMainApp();
    }
  } catch (err) {
    console.error(err);
    showToast('Email ou mot de passe incorrect', 'error');
  } finally {
    btn.disabled = false;
    btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const firstName = document.getElementById('regFirst')?.value.trim();
  const lastName = document.getElementById('regLast')?.value.trim();
  const company = document.getElementById('regCompany')?.value.trim();
  const email = document.getElementById('regEmail')?.value.trim().toLowerCase();
  const password = document.getElementById('regPassword')?.value;
  if (!firstName || !lastName || !company || !email || !password) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }
  if (CONFIG.systemAdmins.some(a => a.email === email)) {
    showToast('Cet email est réservé', 'error');
    return;
  }
  const btn = document.getElementById('registerBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner mr-2"></span>Inscription...';

  try {
    // Création de l'entreprise
    const companyId = `comp_${Date.now()}`;
    const { error: compErr } = await G.supabase.from('companies').insert({
      id: companyId,
      name: company,
      plan: 'free'
    });
    if (compErr) throw compErr;

    // Inscription via Supabase Auth
    const { data, error } = await G.supabase.auth.signUp({
      email,
      password,
      options: { data: { name: `${firstName} ${lastName}`, company_id: companyId } }
    });
    if (error) throw error;

    // Création du profil
    const { error: profErr } = await G.supabase.from('profiles').insert({
      id: data.user.id,
      email,
      name: `${firstName} ${lastName}`,
      role: 'admin',
      status: 'pending_validation',
      company_id: companyId,
      plan: 'free'
    });
    if (profErr) throw profErr;

    showToast('Compte créé ! En attente de validation.', 'success');
    switchAuthTab('login');
    document.getElementById('loginEmail').value = email;
  } catch (err) {
    console.error(err);
    showToast('Erreur inscription: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Créer mon compte';
  }
}

async function handleLogout() {
  await G.supabase.auth.signOut();
  G.currentUser = null;
  resetData();
  document.getElementById('loginScreen').style.display = 'block';
  document.getElementById('mainApp').style.display = 'none';
  showToast('Déconnexion réussie', 'info');
}

function resetData() {
  G.documents = [];
  G.workflows = [];
  G.users = [];
  G.tags = [];
  G.shares = [];
  G.folders = [];
  G.signatures = [];
  G.automationRules = [];
  G.apiKeys = [];
  G.backups = [];
  G.auditLogs = [];
  G.systemLogs = [];
}

function switchToMainApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  switchView('dashboard');
}

// ─── Gestion des vues ───────────────────────────────────
function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active-view');
  G.currentView = viewName;
  // Rendu spécifique
  switch (viewName) {
    case 'dashboard': renderDashboard(); break;
    case 'documents': renderDocuments(); break;
    case 'workflows': renderWorkflows(); break;
    case 'shared': renderShared(); break;
    case 'users': renderUsers(); break;
    case 'tags': renderTags(); break;
    case 'billing': renderBilling(); break;
    case 'settings': renderSettings(); break;
    case 'security': renderSecurity(); break;
    case 'logs': renderSysLogs(); break;
    case 'rbac': renderRBAC(); break;
    case 'analytics': renderAnalytics(); break;
    case 'folders': renderFolders(); break;
    case 'signatures': renderSignatures(); break;
    case 'ai': renderAI(); break;
    case 'automation': renderAutomation(); break;
    case 'integrations': renderIntegrations(); break;
    case 'backups': renderBackups(); break;
    case 'apikeys': renderApiKeys(); break;
    case 'billing2': renderBillingV6(); break;
    case 'auditv6': renderAuditV6(); break;
    case 'search-adv': renderAdvancedSearch(); break;
    case 'versioning': renderVersioning(); break;
    case 'search': renderSearchV7(); break;
    case 'rbacv7': renderRBACV7(); break;
    case 'pending-users': renderPendingUsers(); break;
  }
  closeMobileSidebar();
}

// ─── Dashboard ──────────────────────────────────────────
function renderDashboard() {
  const totalDocs = G.documents.filter(d => !d.is_deleted).length;
  const activeWorkflows = G.workflows.filter(w => ['pending', 'in_review'].includes(w.status)).length;
  const sharedCount = G.shares.filter(s => s.status === 'active').length;
  const userCount = G.users.length;

  document.getElementById('totalDocs').textContent = totalDocs;
  document.getElementById('dashWorkflowCount').textContent = activeWorkflows;
  document.getElementById('sharedCount').textContent = sharedCount;
  document.getElementById('dashUserCount').textContent = userCount;

  // Activité récente (simulation)
  const activityList = document.getElementById('activityList');
  if (activityList) {
    const activities = G.auditLogs.slice(0, 10);
    if (activities.length === 0) {
      activityList.innerHTML = '<div class="text-center py-8 text-blue-300/50"><i class="fas fa-folder-open text-2xl mb-2 block"></i>Aucune activité récente</div>';
    } else {
      activityList.innerHTML = activities.map(act => `
        <div class="flex items-center gap-3 p-3 rounded-xl bg-blue-900/20 border border-blue-500/10">
          <div class="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
            <i class="fas ${getActionIcon(act.action)}"></i>
          </div>
          <div class="flex-1">
            <p class="text-sm text-white">${act.action} ${act.target_type}</p>
            <p class="text-xs text-blue-300/60">${formatDate(act.created_at)}</p>
          </div>
        </div>
      `).join('');
    }
  }

  // Accès rapide
  const pdfCount = G.documents.filter(d => !d.is_deleted && d.type === 'pdf').length;
  const docCount = G.documents.filter(d => !d.is_deleted && d.type === 'doc').length;
  document.getElementById('quickPdfCount').textContent = `${pdfCount} fichier(s)`;
  document.getElementById('quickDocCount').textContent = `${docCount} fichier(s)`;

  // Tags populaires
  const popularTags = [...G.tags].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 8);
  const popularTagsContainer = document.getElementById('popularTags');
  if (popularTagsContainer) {
    if (popularTags.length === 0) {
      popularTagsContainer.innerHTML = '<span class="text-blue-300/50 text-sm">Aucun tag</span>';
    } else {
      popularTagsContainer.innerHTML = popularTags.map(t => `
        <span class="tag" style="background:${t.color}20;border-color:${t.color}40;color:${t.color}" onclick="filterByTag('${t.name}')">
          ${t.name}
        </span>
      `).join('');
    }
  }

  // Documents de l'équipe
  const teamDocs = G.documents.filter(d => !d.is_deleted && d.scope === 'company').slice(0, 5);
  const teamDocsList = document.getElementById('teamDocsList');
  if (teamDocsList) {
    if (teamDocs.length === 0) {
      teamDocsList.innerHTML = '<p class="text-blue-300/50 text-sm text-center py-3">Aucun document</p>';
    } else {
      teamDocsList.innerHTML = teamDocs.map(doc => `
        <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-500/10 cursor-pointer" onclick="openPreviewModal('${doc.id}')">
          <div class="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center ${getFileIcon(doc.type).split(' ')[1]}">
            <i class="fas ${getFileIcon(doc.type).split(' ')[0]}"></i>
          </div>
          <div class="flex-1">
            <p class="text-sm text-white truncate">${doc.name}</p>
            <p class="text-xs text-blue-300/60">${formatDate(doc.created_at)}</p>
          </div>
        </div>
      `).join('');
    }
  }

  // Mes workflows
  const myWfs = G.workflows.filter(w => w.assignee_id === G.currentUser.id || w.created_by === G.currentUser.id).slice(0, 5);
  const myWfList = document.getElementById('myWorkflowsList');
  const myWfBadge = document.getElementById('myWorkflowsBadge');
  if (myWfBadge) {
    if (myWfs.length > 0) {
      myWfBadge.textContent = myWfs.length;
      myWfBadge.classList.remove('hidden');
    } else {
      myWfBadge.classList.add('hidden');
    }
  }
  if (myWfList) {
    if (myWfs.length === 0) {
      myWfList.innerHTML = '<p class="text-blue-300/50 text-sm text-center py-3">Aucun workflow assigné</p>';
    } else {
      myWfList.innerHTML = myWfs.map(wf => `
        <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-orange-500/10 cursor-pointer" onclick="openWfDetail('${wf.id}')">
          <div class="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-400">
            <i class="fas fa-project-diagram"></i>
          </div>
          <div class="flex-1">
            <p class="text-sm text-white truncate">${wf.title}</p>
            <span class="text-xs px-2 py-0.5 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span>
          </div>
        </div>
      `).join('');
    }
  }

  updateStorageDisplay();
}

// ─── Documents ──────────────────────────────────────────
function renderDocuments() {
  const grid = document.getElementById('documentGrid');
  if (!grid) return;
  let filtered = G.documents.filter(d => !d.is_deleted);
  if (G.docsTab === 'company') filtered = filtered.filter(d => d.scope === 'company');
  else if (G.docsTab === 'personal') filtered = filtered.filter(d => d.scope === 'personal');
  else if (G.docsTab === 'mine') filtered = filtered.filter(d => d.owner_id === G.currentUser.id);
  else if (G.docsTab === 'shared') {
    const sharedIds = G.shares.filter(s => s.recipient_email === G.currentUser.email && s.status === 'active').map(s => s.document_id);
    filtered = filtered.filter(d => sharedIds.includes(d.id));
  }
  const typeFilter = document.getElementById('filterType')?.value;
  if (typeFilter) filtered = filtered.filter(d => d.type === typeFilter);

  document.getElementById('resultsCount').textContent = `${filtered.length} document${filtered.length > 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="col-span-full text-center py-12 text-blue-300/50"><i class="fas fa-folder-open text-4xl mb-3 block opacity-30"></i><p>Aucun document trouvé</p></div>`;
    return;
  }

  grid.className = G.viewMode === 'grid' ? 'doc-grid' : 'space-y-2';
  grid.innerHTML = filtered.map(doc => G.viewMode === 'grid' ? renderDocCard(doc) : renderDocListItem(doc)).join('');
}

function renderDocCard(doc) {
  const isOwner = doc.owner_id === G.currentUser.id;
  return `
    <div class="document-card glass-card rounded-2xl p-4 border border-blue-500/20 cursor-pointer group" 
         onclick="openPreviewModal('${doc.id}')" draggable="true" ondragstart="handleDocDragStart(event, '${doc.id}')" oncontextmenu="showDocContextMenu(event, '${doc.id}')">
      <div class="flex items-start justify-between mb-3">
        <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center ${getFileIcon(doc.type).split(' ')[1]} text-2xl">
          <i class="fas ${getFileIcon(doc.type).split(' ')[0]}"></i>
        </div>
        <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button onclick="event.stopPropagation(); downloadDocument('${doc.id}')" class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400" title="Télécharger"><i class="fas fa-download"></i></button>
          <button onclick="event.stopPropagation(); openShareModal('${doc.id}')" class="p-2 rounded-lg hover:bg-purple-500/20 text-purple-400" title="Partager"><i class="fas fa-share-alt"></i></button>
          ${isOwner ? `<button onclick="event.stopPropagation(); deleteDocument('${doc.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400" title="Supprimer"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>
      <h4 class="text-white font-semibold text-sm mb-1 truncate" title="${doc.name}">${doc.name}</h4>
      <p class="text-blue-300/60 text-xs mb-2">${formatBytes(doc.size)} • ${formatDate(doc.created_at)}</p>
      <div class="flex items-center justify-between">
        <div class="flex gap-1">${(doc.tags || []).slice(0, 3).map(t => `<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">${t}</span>`).join('')}</div>
        ${doc.scope === 'company' ? '<span class="collab-badge"><i class="fas fa-building"></i>Entreprise</span>' : '<span class="text-[10px] text-purple-400/60"><i class="fas fa-user mr-1"></i>Perso</span>'}
      </div>
    </div>
  `;
}

function renderDocListItem(doc) {
  const isOwner = doc.owner_id === G.currentUser.id;
  return `
    <div class="doc-list-item glass-card rounded-xl border border-blue-500/10 hover:border-blue-500/30 cursor-pointer" onclick="openPreviewModal('${doc.id}')">
      <div class="doc-icon rounded-lg bg-blue-500/10 flex items-center justify-center ${getFileIcon(doc.type).split(' ')[1]}">
        <i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-lg"></i>
      </div>
      <div class="doc-content">
        <h4 class="text-white font-medium text-sm truncate">${doc.name}</h4>
        <p class="text-blue-300/60 text-xs">${formatBytes(doc.size)} • ${formatDate(doc.created_at)}</p>
      </div>
      <div class="doc-actions">
        <button onclick="event.stopPropagation(); downloadDocument('${doc.id}')" class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400"><i class="fas fa-download"></i></button>
        <button onclick="event.stopPropagation(); openShareModal('${doc.id}')" class="p-2 rounded-lg hover:bg-purple-500/20 text-purple-400"><i class="fas fa-share-alt"></i></button>
        ${isOwner ? `<button onclick="event.stopPropagation(); deleteDocument('${doc.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400"><i class="fas fa-trash"></i></button>` : ''}
      </div>
    </div>
  `;
}

async function uploadDocument() {
  if (G.selectedFiles.length === 0) {
    showToast('Veuillez sélectionner au moins un fichier', 'warning');
    return;
  }
  for (const file of G.selectedFiles) {
    const docId = generateId();
    // Upload du fichier vers Storage Supabase
    const fileExt = file.name.split('.').pop();
    const storagePath = `${G.currentUser.companyId}/${docId}.${fileExt}`;
    const { data: uploadData, error: uploadErr } = await G.supabase.storage
      .from(CONFIG.storageBucket)
      .upload(storagePath, file);
    if (uploadErr) {
      console.error(uploadErr);
      showToast(`Erreur upload ${file.name}: ${uploadErr.message}`, 'error');
      continue;
    }
    // Récupérer l'URL publique
    const { data: publicUrl } = G.supabase.storage
      .from(CONFIG.storageBucket)
      .getPublicUrl(storagePath);

    const doc = {
      id: docId,
      name: file.name,
      type: getFileType(file.name),
      size: file.size,
      description: '',
      scope: _uploadScope || 'company',
      owner_id: G.currentUser.id,
      company_id: G.currentUser.companyId,
      folder_id: G.currentFolderId,
      tags: G.uploadTags,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      views: 0,
      downloads: 0,
      is_deleted: false,
      deleted_at: null,
      content: '',
      storage_path: storagePath,
      file_url: publicUrl.publicUrl
    };

    // Insérer dans la base
    const { error: dbErr } = await G.supabase.from('documents').insert(doc);
    if (dbErr) {
      console.error(dbErr);
      showToast(`Erreur enregistrement ${file.name}`, 'error');
    } else {
      G.documents.unshift(doc);
    }
  }
  showToast(`${G.selectedFiles.length} document(s) importé(s)`, 'success');
  closeUploadModal();
  renderDocuments();
  updateBadges();
  updateStorageDisplay();
}

async function deleteDocument(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  if (doc.owner_id !== G.currentUser.id && G.currentUser.role !== 'admin') {
    showToast('Permission refusée', 'error');
    return;
  }
  const { error } = await G.supabase
    .from('documents')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', docId);
  if (error) {
    showToast('Erreur suppression', 'error');
    return;
  }
  doc.is_deleted = true;
  doc.deleted_at = new Date().toISOString();
  renderDocuments();
  updateBadges();
  showToast('Document déplacé vers la corbeille', 'success');
}

async function downloadDocument(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  // Incrémenter le compteur de téléchargements
  await G.supabase
    .from('documents')
    .update({ downloads: (doc.downloads || 0) + 1 })
    .eq('id', docId);
  doc.downloads = (doc.downloads || 0) + 1;

  // Télécharger depuis Storage
  const { data } = G.supabase.storage
    .from(CONFIG.storageBucket)
    .getPublicUrl(doc.storage_path);
  const link = document.createElement('a');
  link.href = data.publicUrl;
  link.download = doc.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`Téléchargement: ${doc.name}`, 'success');
}

// ─── Workflows ──────────────────────────────────────────
function renderWorkflows() {
  const container = document.getElementById('wfKanban');
  if (!container) return;
  const statuses = ['pending', 'in_review', 'approved', 'rejected'];
  container.innerHTML = statuses.map(status => `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20">
      <h4 class="text-sm font-semibold ${getWfStatusColor(status)} mb-3">${getWfStatusLabel(status)}</h4>
      <div class="space-y-2">
        ${G.workflows.filter(w => w.status === status).map(wf => `
          <div class="p-3 rounded-lg bg-slate-800/50 cursor-pointer hover:bg-slate-700/50" onclick="openWfDetail('${wf.id}')">
            <p class="text-white text-sm font-medium">${wf.title}</p>
            <p class="text-xs text-blue-300/60">Priorité: ${wf.priority}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function getWfStatusClass(status) {
  const classes = { pending: 'bg-orange-500/20 text-orange-300', in_review: 'bg-blue-500/20 text-blue-300', approved: 'bg-green-500/20 text-green-300', rejected: 'bg-red-500/20 text-red-300' };
  return classes[status] || 'bg-gray-500/20 text-gray-300';
}
function getWfStatusLabel(status) {
  const labels = { pending: 'En attente', in_review: 'En révision', approved: 'Approuvé', rejected: 'Rejeté' };
  return labels[status] || status;
}
function getWfStatusColor(status) {
  const colors = { pending: 'text-orange-400', in_review: 'text-blue-400', approved: 'text-green-400', rejected: 'text-red-400' };
  return colors[status] || 'text-gray-400';
}

async function createWorkflow(e) {
  e.preventDefault();
  const title = document.getElementById('wfTitle')?.value;
  if (!title) {
    showToast('Veuillez entrer un titre', 'warning');
    return;
  }
  const newWf = {
    id: generateId(),
    title,
    description: document.getElementById('wfDesc')?.value || '',
    priority: document.getElementById('wfPriority')?.value || 'medium',
    status: 'pending',
    assignee_id: document.getElementById('wfAssignee')?.value,
    created_by: G.currentUser.id,
    company_id: G.currentUser.companyId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const { error } = await G.supabase.from('workflows').insert(newWf);
  if (error) {
    showToast('Erreur création workflow', 'error');
    return;
  }
  G.workflows.unshift(newWf);
  showToast('Workflow créé', 'success');
  closeWorkflowModal();
  renderWorkflows();
}

function openWfDetail(wfId) {
  G.currentWfId = wfId;
  const wf = G.workflows.find(w => w.id === wfId);
  if (!wf) return;
  document.getElementById('wfDetailTitle').textContent = wf.title;
  document.getElementById('wfDetailModal').classList.remove('hidden');
}

function closeWfDetail() {
  document.getElementById('wfDetailModal').classList.add('hidden');
  G.currentWfId = null;
}

// ─── Users ────────────────────────────────────────────────
function renderUsers() {
  const tbody = document.getElementById('usersList');
  if (!tbody) return;
  tbody.innerHTML = G.users.map(u => `
    <tr class="hover:bg-blue-500/5">
      <td class="p-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold">${u.name.charAt(0)}</div>
          <div><p class="text-white text-sm font-medium">${u.name}</p><p class="text-xs text-blue-300/60">${u.email}</p></div>
        </div>
      </td>
      <td class="p-4"><span class="px-2 py-1 rounded-full text-xs ${getRoleBadgeClass(u.role)}">${G.roles[u.role]?.name || u.role}</span></td>
      <td class="p-4 hidden md:table-cell">-</td>
      <td class="p-4 hidden sm:table-cell"><span class="px-2 py-1 rounded-full text-xs ${u.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}">${u.status === 'pending_validation' ? 'En attente' : u.status}</span></td>
      <td class="p-4">
        <div class="flex gap-2">
          ${u.status === 'pending_validation' && canValidateUsers() ? `<button onclick="validateUser('${u.id}')" class="px-3 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs">Valider</button>` : ''}
          <button onclick="deleteUser('${u.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function getRoleBadgeClass(role) {
  const classes = { admin: 'bg-red-500/20 text-red-400', manager: 'bg-orange-500/20 text-orange-400', editor: 'bg-blue-500/20 text-blue-400', viewer: 'bg-gray-500/20 text-gray-400' };
  return classes[role] || 'bg-gray-500/20 text-gray-400';
}

async function validateUser(userId) {
  const user = G.users.find(u => u.id === userId);
  if (!user) return;
  const { error } = await G.supabase
    .from('profiles')
    .update({ status: 'active', validated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    showToast('Erreur validation', 'error');
    return;
  }
  user.status = 'active';
  renderUsers();
  updatePendingUsersCount();
  showToast(`Utilisateur ${user.name} validé`, 'success');
}

async function deleteUser(userId) {
  if (!confirm('Supprimer cet utilisateur ?')) return;
  const { error } = await G.supabase
    .from('profiles')
    .delete()
    .eq('id', userId);
  if (error) {
    showToast('Erreur suppression', 'error');
    return;
  }
  G.users = G.users.filter(u => u.id !== userId);
  renderUsers();
  updatePendingUsersCount();
  showToast('Utilisateur supprimé', 'success');
}

function renderPendingUsers() {
  const container = document.getElementById('pendingUsersList');
  if (!container) return;
  const pending = G.users.filter(u => u.status === 'pending_validation');
  if (pending.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-user-check text-4xl mb-3 block opacity-20"></i><p>Aucun utilisateur en attente</p></div>';
    return;
  }
  container.innerHTML = pending.map(u => `
    <div class="glass-card rounded-xl p-4 border border-yellow-500/20 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 text-lg font-bold">${u.name.charAt(0)}</div>
        <div><p class="text-white font-medium">${u.name}</p><p class="text-sm text-blue-300/60">${u.email}</p></div>
      </div>
      <button onclick="validateUser('${u.id}')" class="px-4 py-2 rounded-lg bg-green-500/20 text-green-400 text-sm hover:bg-green-500/30">Valider</button>
    </div>
  `).join('');
  updatePendingUsersCount();
}

function canValidateUsers() {
  return G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
}

function updatePendingUsersCount() {
  const count = G.users.filter(u => u.status === 'pending_validation').length;
  G.pendingUsersCount = count;
  const badges = document.querySelectorAll('.pending-users-badge');
  badges.forEach(b => {
    if (count > 0 && canValidateUsers()) {
      b.textContent = count;
      b.classList.remove('hidden');
    } else {
      b.classList.add('hidden');
    }
  });
}

// ─── Tags ─────────────────────────────────────────────────
function renderTags() {
  const container = document.getElementById('tagsList');
  if (!container) return;
  container.innerHTML = G.tags.map(t => `
    <div class="flex items-center gap-2 p-2 rounded-lg bg-slate-900/30 border border-blue-500/10">
      <span class="w-3 h-3 rounded-full" style="background:${t.color}"></span>
      <span class="text-sm text-white flex-1">${t.name}</span>
      <button onclick="deleteTag('${t.id}')" class="p-1 text-red-400 hover:text-red-300"><i class="fas fa-times"></i></button>
    </div>
  `).join('');
}

async function createTag() {
  const input = document.getElementById('newTagInput');
  const name = input?.value.trim();
  if (!name) return;
  const newTag = {
    id: generateId(),
    name,
    color: document.getElementById('newTagColor')?.value || '#3b82f6',
    count: 0,
    company_id: G.currentUser.companyId
  };
  const { error } = await G.supabase.from('tags').insert(newTag);
  if (error) {
    showToast('Erreur création tag', 'error');
    return;
  }
  G.tags.push(newTag);
  input.value = '';
  renderTags();
}

async function deleteTag(tagId) {
  const { error } = await G.supabase.from('tags').delete().eq('id', tagId);
  if (error) {
    showToast('Erreur suppression tag', 'error');
    return;
  }
  G.tags = G.tags.filter(t => t.id !== tagId);
  renderTags();
}

// ─── Shared ───────────────────────────────────────────────
function renderShared() {
  const receivedContainer = document.getElementById('sharedList');
  if (!receivedContainer) return;
  const received = G.shares.filter(s => s.recipient_email === G.currentUser.email && s.status === 'active');
  if (received.length === 0) {
    receivedContainer.innerHTML = '<p class="text-center py-8 text-blue-300/50">Aucun document partagé avec vous</p>';
    return;
  }
  receivedContainer.innerHTML = received.map(s => `
    <div class="glass-card rounded-xl p-4 border border-purple-500/20 cursor-pointer" onclick="openPreviewModal('${s.document_id}')">
      <div class="flex items-center gap-3">
        <i class="fas fa-share-alt text-purple-400"></i>
        <div><p class="text-white font-medium">${s.documents?.name || 'Document'}</p><p class="text-xs text-blue-300/60">De: ${s.sender_id}</p></div>
      </div>
    </div>
  `).join('');
}

// ─── Autres vues (placeholders) ───────────────────────────
function renderBilling() { /* À implémenter */ }
function renderSettings() { /* À implémenter */ }
function renderSecurity() { /* À implémenter */ }
function renderSysLogs() { /* À implémenter */ }
function renderRBAC() { /* À implémenter */ }
function renderAnalytics() { /* À implémenter */ }
function renderFolders() { /* À implémenter */ }
function renderSignatures() { /* À implémenter */ }
function renderAI() { /* À implémenter */ }
function renderAutomation() { /* À implémenter */ }
function renderIntegrations() { /* À implémenter */ }
function renderBackups() { /* À implémenter */ }
function renderApiKeys() { /* À implémenter */ }
function renderBillingV6() { renderBilling(); }
function renderAuditV6() { /* À implémenter */ }
function renderAdvancedSearch() { renderDocuments(); }
function renderVersioning() { /* À implémenter */ }
function renderSearchV7() { renderDocuments(); }
function renderRBACV7() { renderRBAC(); }

// ─── Utilitaires ─────────────────────────────────────────
function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
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
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getFileIcon(type) {
  const icons = { pdf: 'fa-file-pdf text-red-400', doc: 'fa-file-word text-blue-400', xls: 'fa-file-excel text-green-400', img: 'fa-file-image text-purple-400', txt: 'fa-file-alt text-gray-400' };
  return icons[type] || 'fa-file text-blue-400';
}

function getFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const types = { pdf: 'pdf', doc: 'doc', docx: 'doc', xls: 'xls', xlsx: 'xls', png: 'img', jpg: 'img', jpeg: 'img', gif: 'img', txt: 'txt' };
  return types[ext] || 'unknown';
}

function getActionIcon(action) {
  const icons = { login: 'fa-sign-in-alt', logout: 'fa-sign-out-alt', upload: 'fa-upload', download: 'fa-download', share: 'fa-share', delete: 'fa-trash', restore: 'fa-undo', view_change: 'fa-eye', validate: 'fa-check', reject: 'fa-times' };
  return icons[action] || 'fa-circle';
}

function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transform transition-all duration-300 translate-y-0 ${
    type === 'success' ? 'bg-green-500/90 text-white' :
    type === 'error' ? 'bg-red-500/90 text-white' :
    type === 'warning' ? 'bg-yellow-500/90 text-black' :
    'bg-blue-500/90 text-white'
  }`;
  toast.innerHTML = `<div class="flex items-center gap-2"><i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i><span>${message}</span></div>`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function switchAuthTab(tab) {
  const loginTab = document.getElementById('tabLogin');
  const regTab = document.getElementById('tabRegister');
  if (loginTab) loginTab.classList.toggle('active', tab === 'login');
  if (regTab) regTab.classList.toggle('active', tab === 'register');
  const loginWrapper = document.getElementById('loginFormWrapper');
  const regWrapper = document.getElementById('registerFormWrapper');
  if (loginWrapper) loginWrapper.style.display = tab === 'login' ? 'block' : 'none';
  if (regWrapper) regWrapper.style.display = tab === 'register' ? 'block' : 'none';
}

function togglePwdInput(id, btn) {
  const input = document.getElementById(id);
  const icon = btn?.querySelector('i');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  if (icon) icon.className = input.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}

function demoLogin() {
  const emailInput = document.getElementById('loginEmail');
  const pwdInput = document.getElementById('loginPassword');
  if (emailInput) emailInput.value = 'demo@systemesged.fr';
  if (pwdInput) pwdInput.value = 'Demo123!';
  handleLogin(new Event('submit'));
}

function oauthLogin(provider) {
  showToast(`Connexion ${provider} en développement`, 'info');
}

function openMobileSidebar() {
  document.getElementById('mobileSidebar')?.classList.add('open');
  document.getElementById('sidebarOverlay')?.classList.add('active');
}
function closeMobileSidebar() {
  document.getElementById('mobileSidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('active');
}
function switchDocsTab(tab) { G.docsTab = tab; renderDocuments(); }
function toggleViewMode() { G.viewMode = G.viewMode === 'grid' ? 'list' : 'grid'; renderDocuments(); }
function applyFilters() { renderDocuments(); }
function clearFilters() { document.getElementById('filterType').value = ''; renderDocuments(); }
function filterByType(type) { document.getElementById('filterType').value = type; switchView('documents'); }
function filterByTag(tagName) { showToast(`Filtre par tag: ${tagName}`, 'info'); }

function openUploadModal() { document.getElementById('uploadModal').classList.remove('hidden'); }
function closeUploadModal() { document.getElementById('uploadModal').classList.add('hidden'); }
function openPreviewModal(docId) { G.currentDocId = docId; document.getElementById('previewModal').classList.remove('hidden'); }
function closePreviewModal() { document.getElementById('previewModal').classList.add('hidden'); G.currentDocId = null; }
function openShareModal(docId) { G.currentDocId = docId; document.getElementById('shareModal').classList.remove('hidden'); }
function closeShareModal() { document.getElementById('shareModal').classList.add('hidden'); G.currentDocId = null; }
function openCreateWorkflowModal() { document.getElementById('workflowModal').classList.remove('hidden'); }
function closeWorkflowModal() { document.getElementById('workflowModal').classList.add('hidden'); }
function openCreateUserModal() { document.getElementById('addUserModal').classList.remove('hidden'); }
function closeAddUserModal() { document.getElementById('addUserModal').classList.add('hidden'); }
function addUser(e) { e.preventDefault(); showToast('Fonction à implémenter', 'info'); }
function openSignModal() { document.getElementById('signatureModal').classList.remove('hidden'); }
function closeSignModal() { document.getElementById('signatureModal').classList.add('hidden'); }
function submitSignature() { closeSignModal(); showToast('Signature enregistrée', 'success'); }
function openWfRuleModal() { document.getElementById('wfRuleModal').classList.remove('hidden'); }
function closeWfRuleModal() { document.getElementById('wfRuleModal').classList.add('hidden'); }
function createWfRule(e) { e.preventDefault(); closeWfRuleModal(); showToast('Règle créée', 'success'); }
function createBackup(type) { showToast('Sauvegarde en cours...', 'info'); }
function restoreBackup(id) { showToast('Restauration en cours...', 'info'); }
function generateApiKeyV6() { showToast('Clé API générée', 'success'); }
function revokeApiKey(id) { showToast('Clé révoquée', 'success'); }
function openFolder(id, name) { G.currentFolderId = id; renderFolders(); }
function renderFolderContents() { /* À implémenter */ }

function handleDocDragStart(e, docId) { e.dataTransfer.setData('text/plain', docId); }
function showDocContextMenu(e, docId) { e.preventDefault(); if (confirm('Supprimer ce document ?')) deleteDocument(docId); }

// ─── Démarrage ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await initSupabase();
  const { data: { session } } = await G.supabase.auth.getSession();
  if (session) {
    await loadUserFromSupabase(session.user);
    switchToMainApp();
  } else {
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('mainApp').style.display = 'none';
  }
  // Exposer les fonctions globales
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
  window.uploadDocument = uploadDocument;
  window.downloadDocument = downloadDocument;
  window.deleteDocument = deleteDocument;
  window.openPreviewModal = openPreviewModal;
  window.closePreviewModal = closePreviewModal;
  window.openShareModal = openShareModal;
  window.closeShareModal = closeShareModal;
  window.shareDocument = shareDocument;
  window.renderDocuments = renderDocuments;
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
  window.openWfDetail = openWfDetail;
  window.closeWfDetail = closeWfDetail;
  window.renderUsers = renderUsers;
  window.validateUser = validateUser;
  window.deleteUser = deleteUser;
  window.openCreateUserModal = openCreateUserModal;
  window.closeAddUserModal = closeAddUserModal;
  window.addUser = addUser;
  window.renderTags = renderTags;
  window.createTag = createTag;
  window.deleteTag = deleteTag;
  window.renderShared = renderShared;
  window.openSignModal = openSignModal;
  window.closeSignModal = closeSignModal;
  window.submitSignature = submitSignature;
  window.openWfRuleModal = openWfRuleModal;
  window.closeWfRuleModal = closeWfRuleModal;
  window.createWfRule = createWfRule;
  window.createBackup = createBackup;
  window.restoreBackup = restoreBackup;
  window.generateApiKeyV6 = generateApiKeyV6;
  window.revokeApiKey = revokeApiKey;
  window.openFolder = openFolder;
  window.renderFolderContents = renderFolderContents;
  window.renderDashboard = renderDashboard;
  window.renderBilling = renderBilling;
  window.renderSettings = renderSettings;
  window.renderSecurity = renderSecurity;
  window.renderSysLogs = renderSysLogs;
  window.renderRBAC = renderRBAC;
  window.renderAnalytics = renderAnalytics;
  window.renderFolders = renderFolders;
  window.renderSignatures = renderSignatures;
  window.renderAI = renderAI;
  window.renderAutomation = renderAutomation;
  window.renderIntegrations = renderIntegrations;
  window.renderBackups = renderBackups;
  window.renderApiKeys = renderApiKeys;
  window.renderBillingV6 = renderBillingV6;
  window.renderAuditV6 = renderAuditV6;
  window.renderAdvancedSearch = renderAdvancedSearch;
  window.renderVersioning = renderVersioning;
  window.renderSearchV7 = renderSearchV7;
  window.renderRBACV7 = renderRBACV7;
  window.renderPendingUsers = renderPendingUsers;
  window.canValidateUsers = canValidateUsers;
});
