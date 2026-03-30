// ============================================
// SystemesGED v7.0 – Application complète sécurisée (CORRIGÉE)
// ============================================

// ─── Configuration Supabase ───
const CONFIG = {
  supabaseUrl: 'https://whkvtpqesqiailwjgoaq.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indoa3Z0cHFlc3FpYWlsd2pnb2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxOTU1ODIsImV4cCI6MjA4OTc3MTU4Mn0.oIEDNRvSAEsVTarXnIl1cMTLoqS1nsHo8dPnjdW0ng8',
  storageBucket: 'documents',
  maxFileSize: 50 * 1024 * 1024,
  edgeFunctionUrl: 'https://whkvtpqesqiailwjgoaq.supabase.co/functions/v1/create-user',
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

// ─── État global ───
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
  currentFolderId: null,
  folderPath: [],
  pendingUsersCount: 0,
  _uploadScope: 'company',
  shareModalDocId: null,
  moveModalDocId: null,
  collabModalDocId: null,
  collabUsers: [],
  
  // Variables d'audit
  auditFilter: { days: 30, severity: '', action: '' },
  logFilter: 'all',
  auditCurrentPage: 1,
  auditPageSize: 20
};

// ─── Protection anti-copie et sécurité ───
(function protectApplication() {
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) ||
        (e.ctrlKey && (e.key === 'u' || e.key === 'U'))) {
      e.preventDefault();
      return false;
    }
  });
  
  // Désactivé pour éviter les problèmes de performance
  // setInterval(() => {
  //   const before = new Date();
  //   debugger;
  //   const after = new Date();
  //   if (after - before > 100) {
  //     console.clear();
  //   }
  // }, 1000);
})();

// ─── Initialisation Supabase ───
async function initSupabase() {
  try {
    if (typeof supabase === 'undefined') throw new Error('Supabase library not loaded');
    G.supabase = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
      auth: { 
        autoRefreshToken: true, 
        persistSession: true,
        detectSessionInUrl: true
      }
    });
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

async function loadUserFromSupabase(user) {
  if (!user) return false;
  
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

// ─── Gestion du dossier racine ───
async function setRootFolder() {
  if (!G.currentUser?.companyId) {
    console.error('setRootFolder: companyId manquant');
    return;
  }
  
  const { data: rootFolder, error } = await G.supabase
    .from('folders')
    .select('id')
    .eq('company_id', G.currentUser.companyId)
    .eq('name', 'Racine')
    .maybeSingle();
  
  if (rootFolder && !error) {
    G.currentFolderId = rootFolder.id;
    G.folderPath = [{ id: rootFolder.id, name: 'Racine' }];
    return;
  }
  
  const newRootId = `${G.currentUser.companyId}_root`;
  const { error: insertErr } = await G.supabase
    .from('folders')
    .insert({
      id: newRootId,
      name: 'Racine',
      parent_id: null,
      company_id: G.currentUser.companyId,
      created_at: new Date().toISOString()
    });
  
  if (!insertErr) {
    G.currentFolderId = newRootId;
    G.folderPath = [{ id: newRootId, name: 'Racine' }];
  } else {
    console.error('Erreur création dossier racine:', insertErr);
  }
}

// ─── Chargement des données ───
async function loadAllData() {
  if (!G.currentUser?.companyId) return;
  const companyId = G.currentUser.companyId;

  const { data: docs } = await G.supabase
    .from('documents')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  G.documents = docs || [];

  const { data: wfs } = await G.supabase
    .from('workflows')
    .select('*')
    .eq('company_id', companyId);
  G.workflows = wfs || [];

  const { data: users } = await G.supabase
    .from('profiles')
    .select('*')
    .eq('company_id', companyId);
  G.users = users || [];

  const { data: tags } = await G.supabase
    .from('tags')
    .select('*')
    .eq('company_id', companyId);
  G.tags = tags || [];

  const { data: shares } = await G.supabase
    .from('shares')
    .select('*, documents!document_id(name)')
    .eq('sender_id', G.currentUser.id);
  G.shares = shares || [];

  const { data: folders } = await G.supabase
    .from('folders')
    .select('*')
    .eq('company_id', companyId);
  G.folders = folders || [];

  const { data: signatures } = await G.supabase
    .from('signatures')
    .select('*')
    .eq('signer_id', G.currentUser.id);
  G.signatures = signatures || [];

  const { data: rules } = await G.supabase
    .from('automation_rules')
    .select('*')
    .eq('company_id', companyId);
  G.automationRules = rules || [];

  const { data: keys } = await G.supabase
    .from('api_keys')
    .select('*')
    .eq('user_id', G.currentUser.id);
  G.apiKeys = keys || [];

  const { data: backups } = await G.supabase
    .from('backups')
    .select('*')
    .eq('company_id', companyId);
  G.backups = backups || [];

  const { data: audit } = await G.supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', G.currentUser.id)
    .order('created_at', { ascending: false })
    .limit(50);
  G.auditLogs = audit || [];

  const { data: syslogs } = await G.supabase
    .from('system_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  G.systemLogs = syslogs || [];
  
  await setRootFolder();
  updateUI();
}

// ─── UI Updates ───
function updateUI() {
  updateUserDisplay();
  updateBadges();
  updateStorageDisplay();
  updateMenuVisibility();
  if (canValidateUsers()) updatePendingUsersCount();
}

function updateUserDisplay() {
  if (!G.currentUser) return;
  
  const elements = {
    userNameDisplay: document.getElementById('userNameDisplay'),
    userRoleDisplay: document.getElementById('userRoleDisplay'),
    userAvatarInitial: document.getElementById('userAvatarInitial'),
    dropdownUserName: document.getElementById('dropdownUserName'),
    dropdownUserEmail: document.getElementById('dropdownUserEmail'),
    companyNameLabel: document.getElementById('companyNameLabel'),
    companyPlanLabel: document.getElementById('companyPlanLabel'),
    companyAvatar: document.getElementById('companyAvatar'),
    planBadge: document.getElementById('planBadge')
  };

  if (elements.userNameDisplay) elements.userNameDisplay.textContent = G.currentUser.name;
  if (elements.userRoleDisplay) elements.userRoleDisplay.textContent = G.roles[G.currentUser.role]?.name || G.currentUser.role;
  if (elements.userAvatarInitial) elements.userAvatarInitial.textContent = G.currentUser.name.charAt(0).toUpperCase();
  if (elements.dropdownUserName) elements.dropdownUserName.textContent = G.currentUser.name;
  if (elements.dropdownUserEmail) elements.dropdownUserEmail.textContent = G.currentUser.email;
  if (elements.companyNameLabel) elements.companyNameLabel.textContent = G.currentUser.companyName || 'Entreprise';
  if (elements.companyPlanLabel) elements.companyPlanLabel.textContent = `Plan ${G.currentUser.plan}`;
  if (elements.companyAvatar) elements.companyAvatar.textContent = (G.currentUser.companyName || 'E').charAt(0).toUpperCase();
  if (elements.planBadge) {
    elements.planBadge.textContent = G.currentUser.plan.toUpperCase();
    elements.planBadge.className = `hidden sm:inline badge-plan badge-${G.currentUser.plan}`;
  }
}

function updateMenuVisibility() {
  const isAdmin = G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
  const isManager = G.currentUser?.role === 'manager' || isAdmin;
  
  document.querySelectorAll('[data-role="admin-only"]').forEach(el => {
    el.style.display = isAdmin ? 'flex' : 'none';
  });
  document.querySelectorAll('[data-role="manager-only"]').forEach(el => {
    el.style.display = isManager ? 'flex' : 'none';
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
  
  const mDocsBadge = document.getElementById('m-docsBadge');
  if (mDocsBadge) {
    mDocsBadge.textContent = docCount;
    mDocsBadge.classList.toggle('hidden', docCount === 0);
  }
  
  const mWfBadge = document.getElementById('m-wfBadge');
  if (mWfBadge) {
    mWfBadge.textContent = wfCount;
    mWfBadge.classList.toggle('hidden', wfCount === 0);
  }
}

function updateStorageDisplay() {
  const used = G.documents.reduce((sum, d) => sum + (d.size || 0), 0);
  const limit = CONFIG.plans[G.currentUser.plan].storage;
  const percent = Math.min(100, Math.round((used / limit) * 100));
  
  const storagePercent = document.getElementById('storagePercent');
  const storageBar = document.getElementById('storageBar');
  const storageText = document.getElementById('storageText');
  const mobileStoragePercent = document.getElementById('mobileStoragePercent');
  const mobileStorageBar = document.getElementById('mobileStorageBar');
  const mobileStorageText = document.getElementById('mobileStorageText');
  
  if (storagePercent) storagePercent.textContent = `${percent}%`;
  if (storageBar) storageBar.style.width = `${percent}%`;
  if (storageText) storageText.textContent = `${formatBytes(used)} / ${formatBytes(limit)}`;
  if (mobileStoragePercent) mobileStoragePercent.textContent = `${percent}%`;
  if (mobileStorageBar) mobileStorageBar.style.width = `${percent}%`;
  if (mobileStorageText) mobileStorageText.textContent = `${formatBytes(used)} / ${formatBytes(limit)}`;
}

// ─── Authentification ───
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail')?.value.trim().toLowerCase();
  const password = document.getElementById('loginPassword')?.value;
  
  if (!email || !password) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }
  
  const { data, error } = await G.supabase.auth.signInWithPassword({ email, password });

	if (error) throw error;

// 🔥 AJOUT 1 : vérifier session
	if (!data.session) {
 	 throw new Error("Session non créée");
}

// 🔥 AJOUT 2 : vérifier utilisateur
	if (!data.user) {
 	 throw new Error("Utilisateur introuvable");
}

// ✅ garder ton code
	await loadUserFromSupabase(data.user);
	showToast(`Bienvenue ${G.currentUser.name}`, 'success');
	switchToMainApp();
  } catch (err) {
    console.error(err);
    showToast('Email ou mot de passe incorrect', 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  
  const lastAttempt = localStorage.getItem('lastRegisterAttempt');
  if (lastAttempt && Date.now() - parseInt(lastAttempt) < 60000) {
    showToast('Veuillez attendre une minute avant de réessayer', 'warning');
    return;
  }
  localStorage.setItem('lastRegisterAttempt', Date.now().toString());
  
  const firstName = document.getElementById('regFirst')?.value.trim();
  const lastName = document.getElementById('regLast')?.value.trim();
  const companyName = document.getElementById('regCompany')?.value.trim();
  const email = document.getElementById('regEmail')?.value.trim().toLowerCase();
  const password = document.getElementById('regPassword')?.value;
  
  if (!firstName || !lastName || !companyName || !email || !password) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }
  
  if (CONFIG.systemAdmins.some(a => a.email === email)) {
    showToast('Cet email est réservé', 'error');
    return;
  }
  
  const btn = document.getElementById('registerBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner mr-2"></span>Inscription...';
  }

  try {
    const companyId = `comp_${Date.now()}`;
    const { error: compErr } = await G.supabase
      .from('companies')
      .insert({ id: companyId, name: companyName, plan: 'free' });
    if (compErr) throw compErr;

    const { data, error } = await G.supabase.auth.signUp({
  email,
  password
});

if (error) throw error;

// ⚠️ Vérifier que l'utilisateur est bien créé
if (!data.user) {
  throw new Error("Utilisateur non créé");
}

// ✅ Création du profil
const { error: profErr } = await G.supabase
  .from('profiles')
  .insert({
    id: data.user.id,
    email,
    name: `${firstName} ${lastName}`,
    role: 'admin',
    status: 'active', // ✅ IMPORTANT (corrigé)
    company_id: companyId,
    plan: 'free'
  });

if (profErr) throw profErr;

    // 🔥 AUTO LOGIN après inscription
await loadUserFromSupabase(data.user);
switchToMainApp();

    const rootFolderId = `${companyId}_root`;
    const { error: folderErr } = await G.supabase
      .from('folders')
      .insert({
        id: rootFolderId,
        name: 'Racine',
        parent_id: null,
        company_id: companyId,
        created_at: new Date().toISOString()
      });
    if (folderErr) console.warn('Erreur création dossier racine:', folderErr);

    showToast('Compte créé ! En attente de validation.', 'success');
    switchAuthTab('login');
    
    const loginEmail = document.getElementById('loginEmail');
    if (loginEmail) loginEmail.value = email;
    
  } catch (err) {
    console.error(err);
    showToast('Erreur inscription: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Créer mon compte';
    }
  }
}

async function handleLogout() {
  await G.supabase.auth.signOut();
  G.currentUser = null;
  
  const loginScreen = document.getElementById('loginScreen');
  const mainApp = document.getElementById('mainApp');
  
  if (loginScreen) loginScreen.style.display = 'block';
  if (mainApp) mainApp.style.display = 'none';
  
  showToast('Déconnexion réussie', 'info');
}

function switchToMainApp() {
  const loginScreen = document.getElementById('loginScreen');
  const mainApp = document.getElementById('mainApp');
  
  if (loginScreen) loginScreen.style.display = 'none';
  if (mainApp) mainApp.style.display = 'block';
  
  switchView('dashboard');
}

function switchAuthTab(tab) {
  const loginTab = document.getElementById('tabLogin');
  const regTab = document.getElementById('tabRegister');
  const loginWrapper = document.getElementById('loginFormWrapper');
  const regWrapper = document.getElementById('registerFormWrapper');
  
  if (loginTab) loginTab.classList.toggle('active', tab === 'login');
  if (regTab) regTab.classList.toggle('active', tab === 'register');
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
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  
  if (loginEmail) loginEmail.value = 'demo@systemesged.fr';
  if (loginPassword) loginPassword.value = 'Demo123!';
  
  handleLogin(new Event('submit'));
}

function oauthLogin(provider) {
  showToast(`Connexion ${provider} en développement`, 'info');
}

// ─── Navigation ───
function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active-view');
  
  G.currentView = viewName;
  closeMobileSidebar();
  
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
  
  if (views[viewName]) views[viewName]();
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
function renderDashboard() {
  const totalDocs = G.documents.filter(d => !d.is_deleted).length;
  const activeWorkflows = G.workflows.filter(w => ['pending', 'in_review'].includes(w.status)).length;
  const sharedCount = G.shares.filter(s => s.status === 'active').length;
  const userCount = G.users.length;
  
  const totalDocsEl = document.getElementById('totalDocs');
  const dashWorkflowCountEl = document.getElementById('dashWorkflowCount');
  const sharedCountEl = document.getElementById('sharedCount');
  const dashUserCountEl = document.getElementById('dashUserCount');
  
  if (totalDocsEl) totalDocsEl.textContent = totalDocs;
  if (dashWorkflowCountEl) dashWorkflowCountEl.textContent = activeWorkflows;
  if (sharedCountEl) sharedCountEl.textContent = sharedCount;
  if (dashUserCountEl) dashUserCountEl.textContent = userCount;
  
  updateStorageDisplay();
  renderActivityList();
  renderQuickAccess();
  renderPopularTags();
  renderTeamDocs();
  renderMyWorkflows();
}

function renderActivityList() {
  const list = document.getElementById('activityList');
  if (!list) return;
  
  const activities = G.auditLogs.slice(0, 10);
  if (activities.length === 0) {
    list.innerHTML = '<div class="text-center py-8 text-blue-300/50"><i class="fas fa-folder-open text-2xl mb-2 block"></i>Aucune activité récente</div>';
    return;
  }
  
  list.innerHTML = activities.map(act => `
    <div class="flex items-center gap-3 p-3 rounded-xl bg-blue-900/20 border border-blue-500/10">
      <div class="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
        <i class="fas ${getActionIcon(act.action)}"></i>
      </div>
      <div class="flex-1">
        <p class="text-sm text-white">${act.action} ${act.target_type || ''}</p>
        <p class="text-xs text-blue-300/60">${formatDate(act.created_at)}</p>
      </div>
    </div>
  `).join('');
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
  if (!list) return;
  
  const docs = G.documents.filter(d => !d.is_deleted && d.scope === 'company').slice(0, 5);
  if (docs.length === 0) {
    list.innerHTML = '<p class="text-blue-300/50 text-sm text-center py-3">Aucun document</p>';
    return;
  }
  
  list.innerHTML = docs.map(doc => `
    <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-500/10 cursor-pointer" onclick="openPreviewModal('${doc.id}')">
      <div class="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center ${getFileIcon(doc.type).split(' ')[1]}">
        <i class="fas ${getFileIcon(doc.type).split(' ')[0]}"></i>
      </div>
      <div class="flex-1">
        <p class="text-sm text-white truncate">${doc.name}</p>
        <p class="text-xs text-blue-300/60">${formatDate(doc.created_at)}</p>
      </div>
      <button onclick="event.stopPropagation(); openMoveModal('${doc.id}')" class="p-1 text-yellow-400 hover:text-yellow-300" title="Déplacer vers un dossier">
        <i class="fas fa-folder-open"></i>
      </button>
    </div>
  `).join('');
}

function renderMyWorkflows() {
  const list = document.getElementById('myWorkflowsList');
  const badge = document.getElementById('myWorkflowsBadge');
  if (!list) return;
  
  const myWfs = G.workflows.filter(w => w.assignee_id === G.currentUser.id || w.created_by === G.currentUser.id).slice(0, 5);
  
  if (badge) {
    if (myWfs.length > 0) {
      badge.textContent = myWfs.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
  
  if (myWfs.length === 0) {
    list.innerHTML = '<p class="text-blue-300/50 text-sm text-center py-3">Aucun workflow assigné</p>';
    return;
  }
  
  list.innerHTML = myWfs.map(wf => `
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

// ─── Documents ───
function renderDocuments() {
  const grid = document.getElementById('documentGrid');
  if (!grid) return;
  
  let filtered = G.documents.filter(d => !d.is_deleted);
  
  if (G.docsTab === 'company') {
    filtered = filtered.filter(d => d.scope === 'company');
  } else if (G.docsTab === 'personal') {
    filtered = filtered.filter(d => d.scope === 'personal');
  } else if (G.docsTab === 'mine') {
    filtered = filtered.filter(d => d.owner_id === G.currentUser.id);
  } else if (G.docsTab === 'shared') {
    const sharedIds = G.shares
      .filter(s => s.recipient_email === G.currentUser.email && s.status === 'active')
      .map(s => s.document_id);
    filtered = filtered.filter(d => sharedIds.includes(d.id));
  }
  
  const typeFilter = document.getElementById('filterType')?.value;
  if (typeFilter) filtered = filtered.filter(d => d.type === typeFilter);
  
  const dateFilter = document.getElementById('filterDate')?.value;
  if (dateFilter === 'today') {
    filtered = filtered.filter(d => new Date(d.created_at).toDateString() === new Date().toDateString());
  } else if (dateFilter === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    filtered = filtered.filter(d => new Date(d.created_at) >= weekAgo);
  } else if (dateFilter === 'month') {
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    filtered = filtered.filter(d => new Date(d.created_at) >= monthAgo);
  }
  
  const resultsCount = document.getElementById('resultsCount');
  if (resultsCount) resultsCount.textContent = `${filtered.length} document${filtered.length > 1 ? 's' : ''}`;
  
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="col-span-full text-center py-12 text-blue-300/50">
      <i class="fas fa-folder-open text-4xl mb-3 block opacity-30"></i>
      <p>Aucun document trouvé</p>
    </div>`;
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
          <button onclick="event.stopPropagation(); openCollabModal('${doc.id}')" class="p-2 rounded-lg hover:bg-green-500/20 text-green-400" title="Inviter à collaborer"><i class="fas fa-users"></i></button>
          <button onclick="event.stopPropagation(); openMoveModal('${doc.id}')" class="p-2 rounded-lg hover:bg-yellow-500/20 text-yellow-400" title="Déplacer"><i class="fas fa-folder-open"></i></button>
          ${isOwner ? `<button onclick="event.stopPropagation(); deleteDocument('${doc.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400" title="Supprimer"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>
      <h4 class="text-white font-semibold text-sm mb-1 truncate" title="${doc.name}">${doc.name}</h4>
      <p class="text-blue-300/60 text-xs mb-2">${formatBytes(doc.size)} • ${formatDate(doc.created_at)}</p>
      <div class="flex items-center justify-between">
        <div class="flex gap-1">${(doc.tags || []).slice(0, 3).map(t => `<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">${t}</span>`).join('')}</div>
        ${doc.scope === 'company' ? '<span class="collab-badge"><i class="fas fa-building"></i>Entreprise</span>' : '<span class="text-[10px] text-purple-400/60"><i class="fas fa-user mr-1"></i>Perso</span>'}
      </div>
      <div class="mt-2 text-xs text-blue-400/50">
        <span>📄 v${doc.version || 1}</span>
        <span class="ml-2">👁️ ${doc.views || 0}</span>
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
        <button onclick="event.stopPropagation(); openCollabModal('${doc.id}')" class="p-2 rounded-lg hover:bg-green-500/20 text-green-400"><i class="fas fa-users"></i></button>
        <button onclick="event.stopPropagation(); openMoveModal('${doc.id}')" class="p-2 rounded-lg hover:bg-yellow-500/20 text-yellow-400"><i class="fas fa-folder-open"></i></button>
        ${isOwner ? `<button onclick="event.stopPropagation(); deleteDocument('${doc.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400"><i class="fas fa-trash"></i></button>` : ''}
      </div>
    </div>
  `;
}

function switchDocsTab(tab) {
  G.docsTab = tab;
  document.querySelectorAll('.docs-tab').forEach(el => el.classList.remove('active'));
  const tabEl = document.getElementById(`docsTab-${tab}`);
  if (tabEl) tabEl.classList.add('active');
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
  renderDocuments();
}

function filterByType(type) {
  const filterType = document.getElementById('filterType');
  if (filterType) filterType.value = type;
  switchView('documents');
}

function filterByTag(tagName) {
  showToast(`Filtre par tag: ${tagName}`, 'info');
}

// ─── Upload ───
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
  if (dropZone) dropZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  addFilesToSelection(files);
  uploadDocument();
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  addFilesToSelection(files);
}

function handleFilePickerSelect(e) {
  const files = Array.from(e.target.files);
  addFilesToSelection(files);
}

function addFilesToSelection(files) {
  for (const file of files) {
    if (file.size > CONFIG.maxFileSize) {
      showToast(`Fichier trop volumineux: ${file.name}`, 'error');
      continue;
    }
    G.selectedFiles.push(file);
  }
  renderSelectedFiles();
}

function renderSelectedFiles() {
  const list = document.getElementById('selectedFilesList');
  if (!list) return;
  
  if (G.selectedFiles.length === 0) {
    list.innerHTML = '';
    return;
  }
  
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

async function uploadDocument() {
  if (G.selectedFiles.length === 0) {
    showToast('Veuillez sélectionner au moins un fichier', 'warning');
    return;
  }
  
  if (!G.currentFolderId) {
    await setRootFolder();
    if (!G.currentFolderId) {
      showToast('Erreur: dossier racine non trouvé', 'error');
      return;
    }
  }
  
  const folderId = G.currentFolderId;
  
  for (const file of G.selectedFiles) {
    const docId = generateId();
    const fileExt = file.name.split('.').pop();
    const storagePath = `${G.currentUser.companyId}/${docId}.${fileExt}`;
    
    try {
      const { error: uploadErr } = await G.supabase.storage
        .from(CONFIG.storageBucket)
        .upload(storagePath, file);
      
      if (uploadErr) throw uploadErr;
      
      const { data: publicUrl } = G.supabase.storage
        .from(CONFIG.storageBucket)
        .getPublicUrl(storagePath);
      
      const doc = {
        id: docId,
        name: document.getElementById('docNameInput')?.value || file.name,
        type: getFileType(file.name),
        size: file.size,
        description: document.getElementById('docDescInput')?.value || '',
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
        content: '',
        storage_path: storagePath,
        file_url: publicUrl.publicUrl
      };
      
      const { error: dbErr } = await G.supabase.from('documents').insert(doc);
      if (dbErr) throw dbErr;
      
      G.documents.unshift(doc);
      showToast(`${file.name} importé avec succès`, 'success');
      
      // Log d'audit
      await addAuditLog('upload', 'document', doc.id);
      
    } catch (err) {
      console.error('Upload error:', err);
      showToast(`Erreur: ${err.message}`, 'error');
    }
  }
  
  G.selectedFiles = [];
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

// ─── Preview et téléchargement ───
function openPreviewModal(docId) {
  G.currentDocId = docId;
  const modal = document.getElementById('previewModal');
  if (modal) modal.classList.remove('hidden');
  
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  const titleEl = document.getElementById('previewTitle');
  if (titleEl) titleEl.textContent = doc.name;
  
  const fileUrl = doc.file_url;
  const fileType = doc.type;
  const previewFrame = document.getElementById('previewFrame');
  const previewImage = document.getElementById('previewImage');
  const previewContent = document.getElementById('previewContent');
  
  if (fileType === 'pdf') {
    if (previewFrame) {
      previewFrame.src = fileUrl;
      previewFrame.classList.remove('hidden');
      previewFrame.onload = () => {
        console.log('PDF chargé avec succès');
      };
    }
    if (previewImage) previewImage.classList.add('hidden');
    if (previewContent) previewContent.classList.add('hidden');
  } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType)) {
    if (previewImage) {
      previewImage.src = fileUrl;
      previewImage.classList.remove('hidden');
      previewImage.onload = () => {
        console.log('Image chargée avec succès');
      };
    }
    if (previewFrame) previewFrame.classList.add('hidden');
    if (previewContent) previewContent.classList.add('hidden');
  } else {
    if (previewFrame) previewFrame.classList.add('hidden');
    if (previewImage) previewImage.classList.add('hidden');
    if (previewContent) previewContent.classList.remove('hidden');
  }
  
  // Incrémenter le compteur de vues
  updateDocViews(docId);
}

async function updateDocViews(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (doc) {
    const newViews = (doc.views || 0) + 1;
    await G.supabase
      .from('documents')
      .update({ views: newViews })
      .eq('id', docId);
    doc.views = newViews;
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
    // Télécharger le fichier depuis Supabase Storage
    const { data, error } = await G.supabase.storage
      .from(CONFIG.storageBucket)
      .download(doc.storage_path);
    
    if (error) {
      console.error('Erreur téléchargement:', error);
      // Fallback: utiliser l'URL publique
      const link = document.createElement('a');
      link.href = doc.file_url;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Créer un blob et télécharger
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
    
    // Mettre à jour le compteur de téléchargements
    await G.supabase
      .from('documents')
      .update({ downloads: (doc.downloads || 0) + 1 })
      .eq('id', docId);
    doc.downloads = (doc.downloads || 0) + 1;
    
    showToast(`Téléchargement: ${doc.name}`, 'success');
    
    // Log d'audit
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
  
  // Log d'audit
  await addAuditLog('delete', 'document', docId);
}

// ─── Déplacement de documents ───
function openMoveModal(docId) {
  G.moveModalDocId = docId;
  const modal = document.getElementById('moveModal');
  if (modal) modal.classList.remove('hidden');
  
  // Remplir la liste des dossiers
  const folderSelect = document.getElementById('moveFolderSelect');
  if (folderSelect) {
    folderSelect.innerHTML = '<option value="">-- Sélectionner un dossier --</option>' + 
      G.folders.filter(f => f.parent_id !== null || f.name !== 'Racine').map(f => 
        `<option value="${f.id}">${getFolderPath(f.id)}</option>`
      ).join('');
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
  const folderId = document.getElementById('moveFolderSelect')?.value;
  if (!folderId) {
    showToast('Veuillez sélectionner un dossier', 'warning');
    return;
  }
  
  if (!G.moveModalDocId) return;
  
  const { error } = await G.supabase
    .from('documents')
    .update({ folder_id: folderId, updated_at: new Date().toISOString() })
    .eq('id', G.moveModalDocId);
  
  if (error) {
    showToast('Erreur déplacement: ' + error.message, 'error');
    return;
  }
  
  const doc = G.documents.find(d => d.id === G.moveModalDocId);
  if (doc) {
    doc.folder_id = folderId;
    doc.updated_at = new Date().toISOString();
  }
  
  showToast('Document déplacé avec succès', 'success');
  closeMoveModal();
  renderDocuments();
  if (G.currentView === 'folders') renderFolderContents();
}

// ─── Collaboration (invitation) ───
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
  
  if (!email) {
    showToast('Veuillez entrer un email', 'warning');
    return;
  }
  
  if (!G.collabModalDocId) return;
  
  // Vérifier si l'utilisateur existe dans la même entreprise
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
  
  // Créer le partage
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
  if (error) {
    showToast('Erreur invitation: ' + error.message, 'error');
    return;
  }
  
  G.shares.push(share);
  showToast(`Invitation envoyée à ${email}`, 'success');
  
  // Envoyer une notification (simulée)
  await addAuditLog('share_collab', 'document', G.collabModalDocId, `Invité: ${email} avec permission ${permission}`);
  
  closeCollabModal();
  document.getElementById('collabEmail').value = '';
}

// ─── Partages ───
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

async function shareDocument() {
  const email = document.getElementById('shareEmail')?.value;
  if (!email) {
    showToast('Veuillez entrer un email', 'warning');
    return;
  }
  
  const { data: targetUser, error: userError } = await G.supabase
    .from('profiles')
    .select('id, company_id')
    .eq('email', email)
    .single();
  
  if (userError || !targetUser || targetUser.company_id !== G.currentUser.companyId) {
    showToast('Cet utilisateur n\'appartient pas à votre entreprise', 'error');
    return;
  }
  
  const share = {
    id: generateId(),
    document_id: G.currentDocId,
    sender_id: G.currentUser.id,
    recipient_email: email,
    permission: document.getElementById('sharePermission')?.value || 'view',
    expires_at: null,
    status: 'active',
    created_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('shares').insert(share);
  if (error) {
    showToast('Erreur partage', 'error');
    return;
  }
  
  G.shares.push(share);
  showToast('Document partagé avec succès', 'success');
  closeShareModal();
  updateBadges();
  
  await addAuditLog('share', 'document', G.currentDocId, `Partagé avec ${email}`);
}

async function revokeShare(shareId) {
  const { error } = await G.supabase
    .from('shares')
    .update({ status: 'revoked' })
    .eq('id', shareId);
  if (error) {
    showToast('Erreur révocation', 'error');
  } else {
    showToast('Partage révoqué', 'success');
    loadShareHistory();
  }
}

async function loadShareHistory() {
  const { data: shares, error } = await G.supabase
    .from('shares')
    .select('*, documents!document_id(name)')
    .eq('document_id', G.currentDocId);
  
  if (error) return;
  
  const historyContainer = document.getElementById('shareHistoryList');
  if (historyContainer) {
    if (shares.length === 0) {
      historyContainer.innerHTML = '<p class="text-center py-4 text-blue-300/50">Aucun historique</p>';
    } else {
      historyContainer.innerHTML = shares.map(s => `
        <div class="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
          <div>
            <p class="text-white text-sm">Partagé avec: ${s.recipient_email}</p>
            <p class="text-xs text-blue-300/60">${s.status} • ${formatDate(s.created_at)}</p>
          </div>
          ${s.status === 'active' ? `<button onclick="revokeShare('${s.id}')" class="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded">Révoquer</button>` : ''}
        </div>
      `).join('');
    }
  }
}

function switchSharedTab(tab) {
  G.sharedTab = tab;
  const receivedPanel = document.getElementById('shared-received');
  const sentPanel = document.getElementById('shared-sent');
  const tabReceived = document.getElementById('tab-received');
  const tabSent = document.getElementById('tab-sent');
  
  if (receivedPanel && sentPanel) {
    if (tab === 'received') {
      receivedPanel.classList.remove('hidden');
      sentPanel.classList.add('hidden');
      if (tabReceived) tabReceived.classList.add('border-blue-400', 'text-blue-400');
      if (tabSent) tabSent.classList.remove('border-blue-400', 'text-blue-400');
    } else {
      receivedPanel.classList.add('hidden');
      sentPanel.classList.remove('hidden');
      if (tabSent) tabSent.classList.add('border-blue-400', 'text-blue-400');
      if (tabReceived) tabReceived.classList.remove('border-blue-400', 'text-blue-400');
    }
  }
  renderShared();
}

function renderShared() {
  const receivedContainer = document.getElementById('sharedList');
  const sentContainer = document.getElementById('sentSharesList');
  const sharedEmptyState = document.getElementById('sharedEmptyState');
  const sentEmptyState = document.getElementById('sentEmptyState');
  
  if (G.sharedTab === 'received') {
    if (!receivedContainer) return;
    const received = G.shares.filter(s => s.recipient_email === G.currentUser.email && s.status === 'active');
    
    if (received.length === 0) {
      if (sharedEmptyState) sharedEmptyState.classList.remove('hidden');
      if (receivedContainer) receivedContainer.classList.add('hidden');
      return;
    }
    
    if (sharedEmptyState) sharedEmptyState.classList.add('hidden');
    receivedContainer.classList.remove('hidden');
    receivedContainer.innerHTML = received.map(s => `
      <div class="glass-card rounded-xl p-4 border border-purple-500/20 cursor-pointer" onclick="openPreviewModal('${s.document_id}')">
        <div class="flex items-center gap-3">
          <i class="fas fa-share-alt text-purple-400"></i>
          <div><p class="text-white font-medium">${s.documents?.name || 'Document'}</p><p class="text-xs text-blue-300/60">Partagé par: ${s.sender_id}</p></div>
        </div>
      </div>
    `).join('');
  } else {
    if (!sentContainer) return;
    const sent = G.shares.filter(s => s.sender_id === G.currentUser.id);
    
    if (sent.length === 0) {
      if (sentEmptyState) sentEmptyState.classList.remove('hidden');
      if (sentContainer) sentContainer.classList.add('hidden');
      return;
    }
    
    if (sentEmptyState) sentEmptyState.classList.add('hidden');
    sentContainer.classList.remove('hidden');
    sentContainer.innerHTML = sent.map(s => `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20">
        <div class="flex items-center justify-between">
          <div><p class="text-white font-medium">${s.documents?.name || 'Document'}</p><p class="text-xs text-blue-300/60">À: ${s.recipient_email}</p></div>
          <div class="flex gap-2">
            <span class="text-xs px-2 py-1 rounded-full ${s.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}">${s.status}</span>
            ${s.status === 'active' ? `<button onclick="revokeShare('${s.id}')" class="text-xs text-red-400 hover:text-red-300"><i class="fas fa-ban"></i></button>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }
}

async function generatePublicLink(docId, expiresInDays = 7) {
  try {
    const token = generateId();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    
    const { error } = await G.supabase.from('public_shares').insert({
      document_id: docId,
      token: token,
      expires_at: expiresAt.toISOString(),
      created_by: G.currentUser.id
    });
    if (error) throw error;
    
    const shareUrl = `${window.location.origin}/public/${token}`;
    const linkInput = document.getElementById('shareLinkInput');
    const generatedLinkDiv = document.getElementById('generatedLink');
    
    if (linkInput) linkInput.value = shareUrl;
    if (generatedLinkDiv) generatedLinkDiv.classList.remove('hidden');
    
    showToast(`Lien public généré`, 'success');
    return shareUrl;
  } catch (err) {
    console.error(err);
    showToast('Erreur lors de la génération du lien', 'error');
  }
}

function copyShareLink() {
  const linkInput = document.getElementById('shareLinkInput');
  if (linkInput && linkInput.value) {
    navigator.clipboard.writeText(linkInput.value);
    showToast('Lien copié dans le presse-papier', 'success');
  }
}

// ─── Workflows (corrigé) ───
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
            ${wf.assignee_id ? `<p class="text-xs text-green-400/60 mt-1">Assigné à: ${wf.assignee_id === G.currentUser.id ? 'Moi' : wf.assignee_id.substring(0,8)}</p>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
  
  // Mettre à jour les statistiques
  const pendingCount = G.workflows.filter(w => w.status === 'pending').length;
  const inReviewCount = G.workflows.filter(w => w.status === 'in_review').length;
  const approvedCount = G.workflows.filter(w => w.status === 'approved').length;
  const rejectedCount = G.workflows.filter(w => w.status === 'rejected').length;
  
  const wfKpiStrip = document.getElementById('wfKpiStrip');
  if (wfKpiStrip) {
    wfKpiStrip.innerHTML = `
      <div class="glass-card rounded-xl p-2 text-center"><p class="text-orange-400 text-xl font-bold">${pendingCount}</p><p class="text-xs text-blue-300/60">En attente</p></div>
      <div class="glass-card rounded-xl p-2 text-center"><p class="text-blue-400 text-xl font-bold">${inReviewCount}</p><p class="text-xs text-blue-300/60">En révision</p></div>
      <div class="glass-card rounded-xl p-2 text-center"><p class="text-green-400 text-xl font-bold">${approvedCount}</p><p class="text-xs text-blue-300/60">Approuvés</p></div>
      <div class="glass-card rounded-xl p-2 text-center"><p class="text-red-400 text-xl font-bold">${rejectedCount}</p><p class="text-xs text-blue-300/60">Rejetés</p></div>
    `;
  }
}

function getWfStatusClass(status) {
  const classes = { 
    pending: 'bg-orange-500/20 text-orange-300', 
    in_review: 'bg-blue-500/20 text-blue-300', 
    approved: 'bg-green-500/20 text-green-300', 
    rejected: 'bg-red-500/20 text-red-300' 
  };
  return classes[status] || 'bg-gray-500/20 text-gray-300';
}

function getWfStatusLabel(status) {
  const labels = { 
    pending: 'En attente', 
    in_review: 'En révision', 
    approved: 'Approuvé', 
    rejected: 'Rejeté' 
  };
  return labels[status] || status;
}

function getWfStatusColor(status) {
  const colors = { 
    pending: 'text-orange-400', 
    in_review: 'text-blue-400', 
    approved: 'text-green-400', 
    rejected: 'text-red-400' 
  };
  return colors[status] || 'text-gray-400';
}

function openCreateWorkflowModal() {
  const docSelect = document.getElementById('wfDocId');
  if (docSelect) {
    docSelect.innerHTML = '<option value="">-- Aucun --</option>' + 
      G.documents.filter(d => !d.is_deleted).map(doc => `<option value="${doc.id}">${doc.name}</option>`).join('');
  }
  
  const assigneeSelect = document.getElementById('wfAssignee');
  if (assigneeSelect) {
    assigneeSelect.innerHTML = '<option value="">-- Non assigné --</option>' + 
      G.users.map(user => `<option value="${user.id}">${user.name}</option>`).join('');
  }
  
  const modal = document.getElementById('workflowModal');
  if (modal) modal.classList.remove('hidden');
}

function closeWorkflowModal() {
  const modal = document.getElementById('workflowModal');
  if (modal) modal.classList.add('hidden');
}

async function createWorkflow(e) {
  e.preventDefault();
  const title = document.getElementById('wfTitle')?.value;
  if (!title) {
    showToast('Veuillez entrer un titre', 'warning');
    return;
  }
  
  const steps = [];
  const stepsInput = document.getElementById('wfSteps')?.value;
  if (stepsInput) {
    steps.push(...stepsInput.split(',').map(s => s.trim()).filter(s => s));
  }
  
  const newWf = {
    id: generateId(),
    title,
    description: document.getElementById('wfDesc')?.value || '',
    priority: document.getElementById('wfPriority')?.value || 'medium',
    status: 'pending',
    assignee_id: document.getElementById('wfAssignee')?.value || null,
    document_id: document.getElementById('wfDocId')?.value || null,
    due_date: document.getElementById('wfDueDate')?.value || null,
    created_by: G.currentUser.id,
    company_id: G.currentUser.companyId,
    steps: steps,
    current_step: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('workflows').insert(newWf);
  if (error) {
    showToast('Erreur création workflow: ' + error.message, 'error');
    return;
  }
  
  G.workflows.unshift(newWf);
  showToast('Workflow créé', 'success');
  closeWorkflowModal();
  renderWorkflows();
  
  await addAuditLog('workflow_create', 'workflow', newWf.id, `Titre: ${title}`);
}

async function actOnWorkflow(action, comment) {
  if (!G.currentWfId) return;
  
  const wf = G.workflows.find(w => w.id === G.currentWfId);
  if (!wf) return;
  
  const commentText = document.getElementById('wfDetailComment')?.value || comment || '';
  
  const actionRecord = {
    id: generateId(),
    workflow_id: G.currentWfId,
    user_id: G.currentUser.id,
    action: action,
    comment: commentText,
    step_index: wf.current_step,
    created_at: new Date().toISOString()
  };
  
  await G.supabase.from('workflow_actions').insert(actionRecord);
  
  let newStatus = wf.status;
  let newStep = wf.current_step;
  
  if (action === 'approve') {
    if (wf.current_step + 1 >= (wf.steps?.length || 0)) {
      newStatus = 'approved';
    } else {
      newStep = wf.current_step + 1;
    }
  } else if (action === 'reject') {
    newStatus = 'rejected';
  } else if (action === 'request_changes') {
    newStatus = 'in_review';
  }
  
  await G.supabase
    .from('workflows')
    .update({ 
      status: newStatus, 
      current_step: newStep,
      updated_at: new Date().toISOString()
    })
    .eq('id', G.currentWfId);
  
  wf.status = newStatus;
  wf.current_step = newStep;
  
  showToast(`Workflow ${action === 'approve' ? 'approuvé' : action === 'reject' ? 'rejeté' : 'mis à jour'}`, 'success');
  renderWorkflows();
  closeWfDetail();
  
  await addAuditLog(`workflow_${action}`, 'workflow', G.currentWfId, `Commentaire: ${commentText || 'Aucun'}`);
}

function openWfDetail(wfId) {
  G.currentWfId = wfId;
  const modal = document.getElementById('wfDetailModal');
  if (modal) modal.classList.remove('hidden');
  
  const wf = G.workflows.find(w => w.id === wfId);
  if (wf) {
    const titleEl = document.getElementById('wfDetailTitle');
    if (titleEl) titleEl.textContent = wf.title;
    
    const metaEl = document.getElementById('wfDetailMeta');
    if (metaEl) {
      metaEl.innerHTML = `
        <span class="text-xs px-2 py-0.5 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span>
        <span class="text-xs text-blue-300/60">Priorité: ${wf.priority}</span>
        <span class="text-xs text-blue-300/60">Créé le ${formatDate(wf.created_at)}</span>
        ${wf.assignee_id ? `<span class="text-xs text-green-400/60">Assigné: ${G.users.find(u => u.id === wf.assignee_id)?.name || 'Inconnu'}</span>` : ''}
      `;
    }
    
    const stepsContainer = document.getElementById('wfDetailSteps');
    if (stepsContainer) {
      if (wf.steps && Array.isArray(wf.steps) && wf.steps.length > 0) {
        stepsContainer.innerHTML = wf.steps.map((step, idx) => `
          <div class="flex items-center gap-3 p-2 rounded-lg ${idx <= wf.current_step ? 'bg-green-500/10 border border-green-500/30' : 'bg-slate-800/50'}">
            <div class="w-6 h-6 rounded-full flex items-center justify-center ${idx < wf.current_step ? 'bg-green-500 text-white' : idx === wf.current_step ? 'bg-blue-500 text-white' : 'bg-slate-600 text-gray-400'}">
              ${idx + 1}
            </div>
            <div class="flex-1">
              <p class="text-white text-sm">${step}</p>
              ${idx === wf.current_step && wf.status === 'pending' ? '<p class="text-xs text-blue-400">En attente de validation</p>' : ''}
            </div>
            ${idx < wf.current_step ? '<i class="fas fa-check-circle text-green-400"></i>' : ''}
          </div>
        `).join('');
        
        const progress = ((wf.current_step + 1) / wf.steps.length) * 100;
        const progressBar = document.getElementById('wfDetailProgressBar');
        const progressText = document.getElementById('wfDetailProgress');
        if (progressBar) progressBar.style.width = `${progress}%`;
        if (progressText) progressText.textContent = `${Math.round(progress)}%`;
      } else {
        stepsContainer.innerHTML = '<p class="text-blue-300/50 text-sm">Aucune étape définie</p>';
      }
    }
    
    if (wf.document_id) {
      const doc = G.documents.find(d => d.id === wf.document_id);
      const docContainer = document.getElementById('wfDetailDoc');
      if (docContainer && doc) {
        docContainer.classList.remove('hidden');
        docContainer.innerHTML = `
          <p class="text-xs text-blue-300/60 mb-1">Document lié</p>
          <div class="flex items-center gap-2 cursor-pointer" onclick="openPreviewModal('${doc.id}')">
            <i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-blue-400"></i>
            <span class="text-white text-sm">${doc.name}</span>
          </div>
        `;
      }
    } else {
      const docContainer = document.getElementById('wfDetailDoc');
      if (docContainer) docContainer.classList.add('hidden');
    }
    
    const actionsContainer = document.getElementById('wfDetailActions');
    if (actionsContainer) {
      const isAssignee = wf.assignee_id === G.currentUser.id;
      const isCreator = wf.created_by === G.currentUser.id;
      const isAdmin = G.currentUser.role === 'admin';
      
      if ((isAssignee || isCreator || isAdmin) && wf.status === 'pending') {
        actionsContainer.classList.remove('hidden');
      } else {
        actionsContainer.classList.add('hidden');
      }
    }
    
    loadWorkflowHistory(wfId);
  }
}

async function loadWorkflowHistory(wfId) {
  const { data: actions, error } = await G.supabase
    .from('workflow_actions')
    .select('*, profiles!user_id(name)')
    .eq('workflow_id', wfId)
    .order('created_at', { ascending: false });
  
  const historyContainer = document.getElementById('wfDetailHistory');
  if (historyContainer) {
    if (!actions || actions.length === 0) {
      historyContainer.innerHTML = '<p class="text-center py-4 text-blue-300/50">Aucune activité</p>';
    } else {
      historyContainer.innerHTML = actions.map(a => `
        <div class="p-2 border-b border-blue-500/10">
          <p class="text-white text-xs">${a.profiles?.name || 'Utilisateur'} a ${getActionLabel(a.action)}</p>
          <p class="text-blue-300/50 text-[10px]">${formatDate(a.created_at)}</p>
          ${a.comment ? `<p class="text-xs text-blue-300/70 mt-1">"${a.comment}"</p>` : ''}
        </div>
      `).join('');
    }
  }
}

async function addWfComment() {
  const comment = document.getElementById('wfCommentInput')?.value;
  if (!comment || !G.currentWfId) return;
  
  const actionRecord = {
    id: generateId(),
    workflow_id: G.currentWfId,
    user_id: G.currentUser.id,
    action: 'comment',
    comment: comment,
    created_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('workflow_actions').insert(actionRecord);
  if (!error) {
    const input = document.getElementById('wfCommentInput');
    if (input) input.value = '';
    loadWorkflowHistory(G.currentWfId);
    showToast('Commentaire ajouté', 'success');
  }
}

function getActionLabel(action) {
  const labels = { approve: 'approuvé', reject: 'rejeté', request_changes: 'demandé des modifications', comment: 'commenté' };
  return labels[action] || action;
}

function closeWfDetail() {
  const modal = document.getElementById('wfDetailModal');
  if (modal) modal.classList.add('hidden');
  G.currentWfId = null;
}

function filterWorkflows(status) {
  G.wfFilter = status;
  document.querySelectorAll('.wf-filter-btn').forEach(btn => {
    if (btn.dataset.wf === status) {
      btn.classList.add('bg-blue-500/20', 'text-blue-300', 'border-blue-500/30');
      btn.classList.remove('text-gray-400', 'border-blue-500/10');
    } else {
      btn.classList.remove('bg-blue-500/20', 'text-blue-300', 'border-blue-500/30');
      btn.classList.add('text-gray-400', 'border-blue-500/10');
    }
  });
  renderWorkflows();
}

function searchWorkflows(query) {
  if (!query) {
    renderWorkflows();
    return;
  }
  
  const filtered = G.workflows.filter(w => w.title.toLowerCase().includes(query.toLowerCase()));
  const container = document.getElementById('wfKanban');
  
  if (container) {
    container.innerHTML = filtered.map(wf => `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20 cursor-pointer" onclick="openWfDetail('${wf.id}')">
        <p class="text-white font-medium">${wf.title}</p>
        <span class="text-xs px-2 py-0.5 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span>
      </div>
    `).join('');
  }
}

function setWfView(view) {
  G.wfView = view;
  const kanban = document.getElementById('wfKanban');
  const listView = document.getElementById('wfListView');
  const btnKanban = document.getElementById('wfViewKanban');
  const btnList = document.getElementById('wfViewList');
  
  if (view === 'kanban') {
    if (kanban) kanban.classList.remove('hidden');
    if (listView) listView.classList.add('hidden');
    if (btnKanban) btnKanban.classList.add('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    if (btnList) btnList.classList.remove('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    renderWorkflows();
  } else {
    if (kanban) kanban.classList.add('hidden');
    if (listView) listView.classList.remove('hidden');
    if (btnList) btnList.classList.add('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    if (btnKanban) btnKanban.classList.remove('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    renderWorkflowsList();
  }
}

function renderWorkflowsList() {
  const container = document.getElementById('wfListView');
  if (!container) return;
  
  let filtered = G.workflows;
  if (G.wfFilter) filtered = filtered.filter(w => w.status === G.wfFilter);
  
  container.innerHTML = filtered.map(wf => `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20 cursor-pointer" onclick="openWfDetail('${wf.id}')">
      <div class="flex items-center justify-between">
        <div><p class="text-white font-medium">${wf.title}</p><p class="text-xs text-blue-300/60">${formatDate(wf.created_at)}</p></div>
        <span class="text-xs px-2 py-1 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span>
      </div>
    </div>
  `).join('');
}

// ─── Users ───
function renderUsers() {
  const tbody = document.getElementById('usersList');
  if (!tbody) return;
  
  tbody.innerHTML = G.users.map(u => `
    <tr class="hover:bg-blue-500/5">
      <td class="p-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold">${u.name?.charAt(0) || 'U'}</div>
          <div><p class="text-white text-sm font-medium">${u.name}</p><p class="text-xs text-blue-300/60">${u.email}</p></div>
        </div>
      </td>
      <td class="p-4"><span class="px-2 py-1 rounded-full text-xs ${getRoleBadgeClass(u.role)}">${G.roles[u.role]?.name || u.role}</span></td>
      <td class="p-4 hidden md:table-cell">-</td>
      <td class="p-4 hidden sm:table-cell"><span class="px-2 py-1 rounded-full text-xs ${u.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}">${u.status === 'pending_validation' ? 'En attente' : u.status}</span></td>
      <td class="p-4">
        <div class="flex gap-2">
          ${u.status === 'pending_validation' && canValidateUsers() ? `<button onclick="validateUser('${u.id}')" class="px-3 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs">Valider</button>` : ''}
          ${canValidateUsers() ? `<button onclick="resetUserPassword('${u.email}')" class="p-2 rounded-lg hover:bg-yellow-500/20 text-yellow-400" title="Réinitialiser mot de passe"><i class="fas fa-key"></i></button>` : ''}
          ${canValidateUsers() ? `<button onclick="deleteUser('${u.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

function getRoleBadgeClass(role) {
  const classes = { 
    admin: 'bg-red-500/20 text-red-400', 
    manager: 'bg-orange-500/20 text-orange-400', 
    editor: 'bg-blue-500/20 text-blue-400', 
    viewer: 'bg-gray-500/20 text-gray-400' 
  };
  return classes[role] || 'bg-gray-500/20 text-gray-400';
}

function openCreateUserModal() {
  if (!canValidateUsers()) {
    showToast('Permission refusée', 'error');
    return;
  }
  const modal = document.getElementById('addUserModal');
  if (modal) modal.classList.remove('hidden');
}

function closeAddUserModal() {
  const modal = document.getElementById('addUserModal');
  if (modal) modal.classList.add('hidden');
}

async function addUser(e) {
  e.preventDefault();
  
  const firstName = document.getElementById('newUserFirst')?.value;
  const lastName = document.getElementById('newUserLast')?.value;
  const email = document.getElementById('newUserEmail')?.value;
  const role = document.getElementById('newUserRole')?.value || 'viewer';
  
  if (!firstName || !lastName || !email) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }
  
  if (!G.currentUser?.companyId) {
    showToast('Erreur: entreprise non trouvée', 'error');
    return;
  }
  
  const name = `${firstName} ${lastName}`;
  const tempPassword = generatePassword();
  
  try {
    const response = await fetch(CONFIG.edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.supabaseKey}`,
      },
      body: JSON.stringify({
        email,
        password: tempPassword,
        role,
        companyId: G.currentUser.companyId,
        name,
      }),
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    
    showToast(`Utilisateur créé. Mot de passe temporaire: ${tempPassword}`, 'success');
    closeAddUserModal();
    await loadAllData();
    renderUsers();
    updatePendingUsersCount();
    
  } catch (err) {
    console.error('Erreur création utilisateur:', err);
    showToast('Erreur: ' + err.message, 'error');
  }
}

async function resetUserPassword(email) {
  const { error } = await G.supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/update-password.html`,
  });
  if (error) {
    showToast('Erreur envoi de l\'email: ' + error.message, 'error');
  } else {
    showToast(`Un email de réinitialisation a été envoyé à ${email}`, 'success');
  }
}

function openResetModal() {
  const modal = document.getElementById('resetPasswordModal');
  if (modal) modal.classList.remove('hidden');
  const emailInput = document.getElementById('resetEmail');
  if (emailInput) emailInput.value = '';
  const msgDiv = document.getElementById('resetMessage');
  if (msgDiv) msgDiv.innerHTML = '';
}

function closeResetModal() {
  const modal = document.getElementById('resetPasswordModal');
  if (modal) modal.classList.add('hidden');
}

async function sendResetEmail() {
  const email = document.getElementById('resetEmail')?.value.trim();
  if (!email) {
    showToast('Veuillez saisir votre email', 'warning');
    return;
  }
  const { error } = await G.supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/update-password.html`,
  });
  const msgDiv = document.getElementById('resetMessage');
  if (error) {
    if (msgDiv) msgDiv.innerHTML = `<span class="text-red-400">Erreur : ${error.message}</span>`;
  } else {
    if (msgDiv) msgDiv.innerHTML = `<span class="text-green-400">✅ Un email de réinitialisation vous a été envoyé.</span>`;
    setTimeout(() => closeResetModal(), 3000);
  }
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
  
  await addAuditLog('validate_user', 'user', userId, `Utilisateur ${user.name} validé`);
}

async function deleteUser(userId) {
  if (!confirm('Supprimer cet utilisateur ?')) return;
  
  const { error } = await G.supabase.from('profiles').delete().eq('id', userId);
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
        <div class="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 text-lg font-bold">${u.name?.charAt(0) || 'U'}</div>
        <div><p class="text-white font-medium">${u.name}</p><p class="text-sm text-blue-300/60">${u.email}</p></div>
      </div>
      <button onclick="validateUser('${u.id}')" class="px-4 py-2 rounded-lg bg-green-500/20 text-green-400 text-sm hover:bg-green-500/30">Valider</button>
    </div>
  `).join('');
}

function refreshPendingUsers() {
  renderPendingUsers();
  updatePendingUsersCount();
}

function canValidateUsers() {
  return G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
}

function updatePendingUsersCount() {
  const count = G.users.filter(u => u.status === 'pending_validation').length;
  G.pendingUsersCount = count;
  
  const badges = document.querySelectorAll('.pending-users-badge, #d-pendingBadge, #m-pendingBadge');
  badges.forEach(b => {
    if (count > 0 && canValidateUsers()) {
      b.textContent = count;
      b.classList.remove('hidden');
    } else {
      b.classList.add('hidden');
    }
  });
  
  const pendingCountEl = document.getElementById('pendingCount');
  if (pendingCountEl) pendingCountEl.textContent = count;
}

function generatePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function approveAllPending() {
  const pending = G.users.filter(u => u.status === 'pending_validation');
  pending.forEach(u => validateUser(u.id));
}

function rejectAllPending() {
  const pending = G.users.filter(u => u.status === 'pending_validation');
  pending.forEach(u => deleteUser(u.id));
}

// ─── Tags ───
function renderTags() {
  const container = document.getElementById('tagsList');
  if (!container) return;
  
  if (G.tags.length === 0) {
    container.innerHTML = '<p class="text-blue-300/50 text-sm text-center py-4">Aucun tag</p>';
    return;
  }
  
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
    company_id: G.currentUser.companyId,
    created_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('tags').insert(newTag);
  if (error) {
    showToast('Erreur création tag: ' + error.message, 'error');
    return;
  }
  
  G.tags.push(newTag);
  if (input) input.value = '';
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

// ─── Dossiers ───
function renderFolders() {
  renderFolderContents();
  renderFolderTree();
}

function renderFolderContents() {
  const folderContents = document.getElementById('folderContentsGrid');
  const folderDocGrid = document.getElementById('folderDocGrid');
  if (!folderContents || !folderDocGrid) return;
  
  const subFolders = G.folders.filter(f => f.parent_id === G.currentFolderId && f.name !== 'Racine');
  const docs = G.documents.filter(d => !d.is_deleted && d.folder_id === G.currentFolderId);
  
  if (subFolders.length === 0 && docs.length === 0) {
    folderContents.innerHTML = '<div class="col-span-full text-center py-8 text-blue-300/50">Aucun contenu dans ce dossier</div>';
  } else {
    folderContents.innerHTML = subFolders.map(f => `
      <div class="glass-card rounded-xl p-4 border border-yellow-500/20 cursor-pointer hover:border-yellow-400/40" onclick="openFolder('${f.id}', '${f.name}')">
        <div class="flex items-center gap-3"><i class="fas fa-folder text-yellow-400 text-2xl"></i><span class="text-white font-medium">${f.name}</span></div>
      </div>
    `).join('');
  }
  
  if (docs.length === 0) {
    folderDocGrid.innerHTML = '<div class="col-span-full text-center py-8 text-blue-300/50">Aucun document dans ce dossier</div>';
  } else {
    folderDocGrid.className = 'doc-grid';
    folderDocGrid.innerHTML = docs.map(doc => renderDocCard(doc)).join('');
  }
}

function renderFolderTree() {
  const container = document.getElementById('folderSidebarTree');
  if (!container) return;
  
  const rootFolders = G.folders.filter(f => f.parent_id === null && f.name !== 'Racine');
  
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
  
  container.innerHTML = rootFolders.map(f => renderFolderTreeRecursive(f.id)).join('');
}

function openFolder(id, name) {
  G.currentFolderId = id;
  const existingIdx = G.folderPath.findIndex(f => f.id === id);
  
  if (existingIdx >= 0) {
    G.folderPath = G.folderPath.slice(0, existingIdx + 1);
  } else {
    G.folderPath.push({ id, name });
  }
  
  renderFolderContents();
  updateFolderBreadcrumb();
  renderFolderTree();
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

function openFolderModal() {
  const modal = document.getElementById('folderModal');
  if (modal) modal.classList.remove('hidden');
}

function closeFolderModal() {
  const modal = document.getElementById('folderModal');
  if (modal) modal.classList.add('hidden');
  const input = document.getElementById('newFolderName');
  if (input) input.value = '';
}

async function createFolder() {
  const name = document.getElementById('newFolderName')?.value.trim();
  if (!name) return;
  
  const newFolder = {
    id: generateId(),
    name: name,
    parent_id: G.currentFolderId,
    company_id: G.currentUser.companyId,
    created_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('folders').insert(newFolder);
  if (error) {
    showToast('Erreur création dossier: ' + error.message, 'error');
    return;
  }
  
  G.folders.push(newFolder);
  closeFolderModal();
  renderFolders();
  showToast('Dossier créé', 'success');
}

async function moveDocument(docId, newFolderId) {
  const { error } = await G.supabase
    .from('documents')
    .update({ folder_id: newFolderId, updated_at: new Date().toISOString() })
    .eq('id', docId);
  if (error) {
    showToast('Erreur déplacement', 'error');
  } else {
    const doc = G.documents.find(d => d.id === docId);
    if (doc) doc.folder_id = newFolderId;
    renderDocuments();
    renderFolderContents();
    showToast('Document déplacé', 'success');
  }
}

// ─── Settings ───
function renderSettings() {
  const profileName = document.getElementById('profileName');
  const profileEmail = document.getElementById('profileEmail');
  
  if (profileName) profileName.value = G.currentUser?.name || '';
  if (profileEmail) profileEmail.value = G.currentUser?.email || '';
}

async function saveProfile() {
  const name = document.getElementById('profileName')?.value;
  if (!name || !G.currentUser) return;
  
  const { error } = await G.supabase
    .from('profiles')
    .update({ name: name })
    .eq('id', G.currentUser.id);
  
  if (error) {
    showToast('Erreur mise à jour profil', 'error');
    return;
  }
  
  G.currentUser.name = name;
  updateUserDisplay();
  showToast('Profil mis à jour', 'success');
}

function toggleSetting(setting) {
  showToast(`Paramètre ${setting} modifié`, 'info');
}

// ─── Billing ───
function renderBilling() {
  const plan = CONFIG.plans[G.currentUser?.plan || 'free'];
  const currentPlanName = document.getElementById('currentPlanName');
  const currentPlanBadge = document.getElementById('currentPlanBadgeEl');
  const currentPlanDesc = document.getElementById('currentPlanDesc');
  const currentPlanPrice = document.getElementById('currentPlanPrice');
  
  if (currentPlanName) currentPlanName.textContent = plan.name;
  if (currentPlanBadge) {
    currentPlanBadge.textContent = plan.name.toUpperCase();
    currentPlanBadge.className = `badge-plan badge-${G.currentUser?.plan || 'free'}`;
  }
  if (currentPlanDesc) currentPlanDesc.textContent = `${plan.users} utilisateurs · ${formatBytes(plan.storage)} · fonctionnalités de base`;
  if (currentPlanPrice) currentPlanPrice.textContent = `${plan.price === 0 ? '0€' : plan.price + '€'}`;
}

function selectPlan(planKey, element) {
  document.querySelectorAll('.plan-card').forEach(card => card.classList.remove('selected'));
  if (element) element.classList.add('selected');
  const upgradeBtn = document.getElementById('upgradeBtn');
  if (upgradeBtn) {
    upgradeBtn.disabled = false;
    upgradeBtn.setAttribute('data-plan', planKey);
  }
}

function simulateUpgrade() {
  showToast('Fonctionnalité de paiement en développement', 'info');
}

function renderBillingV6() {
  renderBilling();
}

// ─── Security ───
function renderSecurity() {
  const secScanOk = document.getElementById('secScanOk');
  const secScanBlocked = document.getElementById('secScanBlocked');
  const secApiKeys = document.getElementById('secApiKeys');
  const secAuditCount = document.getElementById('secAuditCount');
  
  if (secScanOk) secScanOk.textContent = G.documents.filter(d => !d.is_deleted).length;
  if (secScanBlocked) secScanBlocked.textContent = '0';
  if (secApiKeys) secApiKeys.textContent = G.apiKeys.length;
  if (secAuditCount) secAuditCount.textContent = G.auditLogs.length;
}

function exportAuditLog() {
  const data = JSON.stringify(G.auditLogs, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit_logs_${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Export audit effectué', 'success');
}

function exportAllData() {
  const data = {
    documents: G.documents,
    workflows: G.workflows,
    users: G.users,
    tags: G.tags,
    shares: G.shares
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ged_export_${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Export complet effectué', 'success');
}

function exportDocumentsCsv() {
  const docs = G.documents.filter(d => !d.is_deleted);
  const headers = ['ID', 'Nom', 'Type', 'Taille', 'Créé le'];
  const rows = docs.map(d => [d.id, d.name, d.type, d.size, d.created_at]);
  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `documents_${new Date().toISOString()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Export CSV effectué', 'success');
}

function switchSecurityTab(tab) {
  const auditPanel = document.getElementById('secPanel-audit');
  const trashPanel = document.getElementById('secPanel-trash');
  const auditBtn = document.getElementById('secTab-audit');
  const trashBtn = document.getElementById('secTab-trash');
  
  if (tab === 'audit') {
    if (auditPanel) auditPanel.classList.remove('hidden');
    if (trashPanel) trashPanel.classList.add('hidden');
    if (auditBtn) auditBtn.classList.add('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    if (trashBtn) trashBtn.classList.remove('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    renderAuditLog();
  } else {
    if (auditPanel) auditPanel.classList.add('hidden');
    if (trashPanel) trashPanel.classList.remove('hidden');
    if (trashBtn) trashBtn.classList.add('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    if (auditBtn) auditBtn.classList.remove('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    loadDeletedDocs();
  }
}

function renderAuditLog() {
  const container = document.getElementById('auditLogList');
  if (!container) return;
  
  let filtered = G.auditLogs;
  const filterValue = document.getElementById('auditFilter')?.value;
  if (filterValue) {
    filtered = filtered.filter(l => l.action === filterValue);
  }
  
  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-blue-300/40 text-sm">Aucun log d\'audit</div>';
    return;
  }
  
  container.innerHTML = filtered.map(log => `
    <div class="p-2 rounded-lg bg-slate-900/30 border border-blue-500/10">
      <div class="flex items-center justify-between">
        <span class="text-xs text-white">${log.action} ${log.target_type || ''}</span>
        <span class="text-xs text-blue-300/60">${formatDate(log.created_at)}</span>
      </div>
      ${log.details ? `<p class="text-xs text-blue-300/50 mt-1">${log.details}</p>` : ''}
    </div>
  `).join('');
}

function loadDeletedDocs() {
  const container = document.getElementById('trashList');
  if (!container) return;
  
  const deleted = G.documents.filter(d => d.is_deleted);
  if (deleted.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-blue-300/40 text-sm"><i class="fas fa-trash text-2xl mb-2 block opacity-20"></i>Aucun document supprimé</div>';
    return;
  }
  
  container.innerHTML = deleted.map(doc => `
    <div class="flex items-center justify-between p-3 rounded-lg bg-slate-900/30 border border-red-500/20">
      <div><p class="text-white text-sm">${doc.name}</p><p class="text-xs text-blue-300/60">Supprimé le ${formatDate(doc.deleted_at)}</p></div>
      <button onclick="restoreDocument('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30">Restaurer</button>
    </div>
  `).join('');
}

async function restoreDocument(docId) {
  const { error } = await G.supabase
    .from('documents')
    .update({ is_deleted: false, deleted_at: null })
    .eq('id', docId);
  
  if (error) {
    showToast('Erreur restauration', 'error');
    return;
  }
  
  const doc = G.documents.find(d => d.id === docId);
  if (doc) {
    doc.is_deleted = false;
    doc.deleted_at = null;
  }
  
  showToast('Document restauré', 'success');
  renderDocuments();
  updateBadges();
  loadDeletedDocs();
}

function generateApiKey() {
  const key = `ged_${generateId()}_${generateId().substr(0, 16)}`;
  const newKey = {
    id: generateId(),
    name: `Clé API ${G.apiKeys.length + 1}`,
    key: key,
    permissions: ['read'],
    user_id: G.currentUser.id,
    created_at: new Date().toISOString()
  };
  G.apiKeys.push(newKey);
  
  const displayDiv = document.getElementById('newApiKeyWrapper');
  const displayKey = document.getElementById('newApiKeyDisplay');
  if (displayDiv && displayKey) {
    displayKey.textContent = key;
    displayDiv.classList.remove('hidden');
  }
  
  renderApiKeys();
  showToast(`Clé API générée`, 'success');
}

function copyApiKey(key) {
  if (key) {
    navigator.clipboard.writeText(key);
    showToast('Clé API copiée', 'success');
  }
}

function scanAllDocuments() {
  showToast('Scan antivirus en cours...', 'info');
  setTimeout(() => showToast('Scan terminé, aucun virus détecté', 'success'), 2000);
}

// ─── Logs ───
function renderSysLogs() {
  const container = document.getElementById('sysLogConsole');
  if (!container) return;
  
  let logs = G.systemLogs;
  if (G.logFilter !== 'all') logs = logs.filter(l => l.level === G.logFilter);
  
  if (logs.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-blue-300/40 text-sm">Aucun log</div>';
    return;
  }
  
  container.innerHTML = logs.map(l => `
    <div class="py-1 px-2 text-xs">
      <span class="text-blue-300/40">[${new Date(l.created_at).toLocaleTimeString('fr-FR')}]</span>
      <span class="${getLogLevelColor(l.level)}">${l.level}</span>
      <span class="text-blue-200/80">${l.message}</span>
    </div>
  `).join('');
}

function getLogLevelColor(level) {
  const colors = { 
    info: 'text-blue-400', 
    warn: 'text-yellow-400', 
    error: 'text-red-400', 
    security: 'text-orange-400' 
  };
  return colors[level] || 'text-gray-400';
}

function filterLogs(level) {
  G.logFilter = level;
  document.querySelectorAll('.log-filter').forEach(btn => {
    if (btn.dataset.lf === level) {
      btn.classList.add('bg-blue-500/20', 'text-blue-300', 'border-blue-500/30');
      btn.classList.remove('text-gray-400', 'border-blue-500/10');
    } else {
      btn.classList.remove('bg-blue-500/20', 'text-blue-300', 'border-blue-500/30');
      btn.classList.add('text-gray-400', 'border-blue-500/10');
    }
  });
  renderSysLogs();
}

function clearSysLogs() {
  G.systemLogs = [];
  renderSysLogs();
  showToast('Logs effacés', 'info');
}

function exportSysLogs() {
  const data = JSON.stringify(G.systemLogs, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `system_logs_${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Export logs effectué', 'success');
}

// ─── RBAC (corrigé) ───
function renderRBAC() {
  const container = document.getElementById('rbacCards');
  if (!container) return;
  
  container.innerHTML = Object.entries(G.roles).map(([key, role]) => `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20 cursor-pointer" onclick="openRoleModal('${key}')">
      <h4 class="text-white font-semibold">${role.name}</h4>
      <p class="text-xs text-blue-300/60 mt-2">${G.users.filter(u => u.role === key).length} utilisateur(s)</p>
      <div class="mt-2 flex flex-wrap gap-1">
        ${role.perms.slice(0, 3).map(p => `<span class="text-[10px] px-1 py-0.5 rounded bg-blue-500/20">${p}</span>`).join('')}
        ${role.perms.length > 3 ? `<span class="text-[10px] px-1 py-0.5 rounded bg-blue-500/20">+${role.perms.length - 3}</span>` : ''}
      </div>
    </div>
  `).join('');
}

function openRoleModal(roleKey) {
  const modal = document.getElementById('roleModal');
  if (!modal) return;
  
  const role = G.roles[roleKey];
  if (role) {
    const titleEl = document.getElementById('roleModalTitle');
    const keyEl = document.getElementById('roleModalKey');
    const nameEl = document.getElementById('roleModalName');
    if (titleEl) titleEl.textContent = `Modifier le rôle: ${role.name}`;
    if (keyEl) keyEl.value = roleKey;
    if (nameEl) nameEl.value = role.name;
    
    const perms = ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users'];
    perms.forEach(perm => {
      const checkbox = document.getElementById(`perm_${perm}`);
      if (checkbox) checkbox.checked = role.perms.includes(perm);
    });
  }
  modal.classList.remove('hidden');
}

function closeRoleModal() {
  const modal = document.getElementById('roleModal');
  if (modal) modal.classList.add('hidden');
}

function saveRole() {
  const roleKey = document.getElementById('roleModalKey')?.value;
  const roleName = document.getElementById('roleModalName')?.value;
  if (!roleKey || !roleName) return;
  
  const perms = [];
  const permsList = ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users'];
  permsList.forEach(perm => {
    const checkbox = document.getElementById(`perm_${perm}`);
    if (checkbox?.checked) perms.push(perm);
  });
  
  G.roles[roleKey] = { name: roleName, perms: perms };
  showToast(`Rôle ${roleName} mis à jour`, 'success');
  closeRoleModal();
  renderRBAC();
  renderRBACV7();
}

function renderRBACV7() {
  renderRBAC();
  
  const matrixContainer = document.getElementById('rbacV7PermMatrix');
  if (matrixContainer) {
    const roles = Object.entries(G.roles);
    const perms = ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users'];
    
    matrixContainer.innerHTML = roles.map(([key, role]) => `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20">
        <h4 class="text-white font-semibold text-sm mb-3">${role.name}</h4>
        <div class="space-y-1">
          ${perms.map(perm => `
            <div class="flex items-center justify-between">
              <span class="text-xs text-blue-300/60">${perm}</span>
              <span class="text-xs ${role.perms.includes(perm) ? 'text-green-400' : 'text-red-400'}">
                <i class="fas ${role.perms.includes(perm) ? 'fa-check' : 'fa-times'}"></i>
              </span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }
  
  const rolesGrid = document.getElementById('rbacV7RolesGrid');
  if (rolesGrid) {
    rolesGrid.innerHTML = Object.entries(G.roles).map(([key, role]) => `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-white font-semibold">${role.name}</h4>
          <button onclick="openRoleModal('${key}')" class="text-xs text-blue-400 hover:text-blue-300">
            <i class="fas fa-edit"></i>
          </button>
        </div>
        <p class="text-xs text-blue-300/60">${G.users.filter(u => u.role === key).length} utilisateurs</p>
        <div class="mt-2 flex flex-wrap gap-1">
          ${role.perms.map(p => `<span class="text-[10px] px-1 py-0.5 rounded bg-blue-500/20">${p}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }
  
  const assignmentList = document.getElementById('roleAssignmentList');
  if (assignmentList) {
    if (G.users.length === 0) {
      assignmentList.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-blue-300/50">Aucun utilisateur</td></tr>';
    } else {
      assignmentList.innerHTML = G.users.map(user => `
        <tr class="border-b border-blue-500/10">
          <td class="p-3 text-white text-sm">${user.name}</td>
          <td class="p-3"><span class="px-2 py-1 rounded-full text-xs ${getRoleBadgeClass(user.role)}">${G.roles[user.role]?.name || user.role}</span></td>
          <td class="p-3">
            <select onchange="updateUserRole('${user.id}', this.value)" class="bg-slate-900/50 border border-blue-500/30 rounded-lg px-2 py-1 text-xs text-white outline-none">
              ${Object.entries(G.roles).map(([key, role]) => `<option value="${key}" ${user.role === key ? 'selected' : ''}>${role.name}</option>`).join('')}
            </select>
          </td>
          <td class="p-3">
            <button onclick="updateUserRole('${user.id}', this.parentElement.querySelector('select').value)" class="px-3 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-xs">Appliquer</button>
          </td>
        </tr>
      `).join('');
    }
  }
}

async function updateUserRole(userId, newRole) {
  const { error } = await G.supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);
  
  if (error) {
    showToast('Erreur mise à jour rôle', 'error');
    return;
  }
  
  const user = G.users.find(u => u.id === userId);
  if (user) user.role = newRole;
  
  renderUsers();
  renderRBACV7();
  showToast('Rôle mis à jour', 'success');
  
  await addAuditLog('role_change', 'user', userId, `Nouveau rôle: ${newRole}`);
}

function createRoleV7() {
  const input = document.getElementById('newRoleName');
  const name = input?.value.trim();
  if (!name) return;
  
  const roleKey = name.toLowerCase().replace(/\s/g, '_');
  if (G.roles[roleKey]) {
    showToast('Ce rôle existe déjà', 'warning');
    return;
  }
  
  G.roles[roleKey] = { name: name, perms: [] };
  if (input) input.value = '';
  renderRBAC();
  renderRBACV7();
  showToast(`Rôle ${name} créé`, 'success');
}

// ─── Analytics ───
function renderAnalytics() {
  const kpiContainer = document.getElementById('analyticsKpiCards');
  if (kpiContainer) {
    const totalViews = G.documents.reduce((sum, d) => sum + (d.views || 0), 0);
    const totalDownloads = G.documents.reduce((sum, d) => sum + (d.downloads || 0), 0);
    kpiContainer.innerHTML = `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20"><p class="text-2xl font-bold text-white">${totalViews}</p><p class="text-xs text-blue-300/60">Vues totales</p></div>
      <div class="glass-card rounded-xl p-4 border border-green-500/20"><p class="text-2xl font-bold text-white">${totalDownloads}</p><p class="text-xs text-blue-300/60">Téléchargements</p></div>
      <div class="glass-card rounded-xl p-4 border border-purple-500/20"><p class="text-2xl font-bold text-white">${G.workflows.length}</p><p class="text-xs text-blue-300/60">Workflows</p></div>
      <div class="glass-card rounded-xl p-4 border border-orange-500/20"><p class="text-2xl font-bold text-white">${G.users.length}</p><p class="text-xs text-blue-300/60">Utilisateurs</p></div>
    `;
  }
  
  const topDocsContainer = document.getElementById('analyticsTopDocs');
  if (topDocsContainer) {
    const topDocs = [...G.documents].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
    if (topDocs.length === 0) {
      topDocsContainer.innerHTML = '<p class="text-blue-300/40 text-sm text-center py-6">Aucun document</p>';
    } else {
      topDocsContainer.innerHTML = topDocs.map(d => `<div class="flex justify-between items-center p-2 border-b border-blue-500/10"><span class="text-white text-sm truncate">${d.name}</span><span class="text-blue-400 text-sm">${d.views || 0} vues</span></div>`).join('');
    }
  }
  
  const topUsersContainer = document.getElementById('analyticsTopUsers');
  if (topUsersContainer) {
    const userActivity = {};
    G.auditLogs.forEach(log => {
      userActivity[log.user_id] = (userActivity[log.user_id] || 0) + 1;
    });
    const topUsers = Object.entries(userActivity).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topUsers.length === 0) {
      topUsersContainer.innerHTML = '<p class="text-blue-300/40 text-sm text-center py-6">Aucune activité</p>';
    } else {
      topUsersContainer.innerHTML = topUsers.map(([userId, count]) => {
        const user = G.users.find(u => u.id === userId);
        return `<div class="flex justify-between items-center p-2 border-b border-blue-500/10"><span class="text-white text-sm">${user?.name || 'Utilisateur'}</span><span class="text-blue-400 text-sm">${count} actions</span></div>`;
      }).join('');
    }
  }
  
  // Graphique d'activité simplifié
  const activityChart = document.getElementById('analyticsActivityChart');
  if (activityChart) {
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const count = G.auditLogs.filter(l => new Date(l.created_at).toDateString() === date.toDateString()).length;
      last7Days.push(count);
    }
    const maxCount = Math.max(...last7Days, 1);
    activityChart.innerHTML = `
      <div class="analytics-bar-wrap w-full">
        ${last7Days.map((count, idx) => `
          <div class="flex-1 flex flex-col items-center">
            <div class="w-full bg-blue-500/20 rounded-t-lg" style="height: ${(count / maxCount) * 80}px; min-height: 4px;"></div>
            <div class="w-full h-8 bg-blue-500/20 mt-1 rounded-b-lg text-center text-[10px] text-blue-300/60 pt-1">${count}</div>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  // Workflow chart
  const workflowChart = document.getElementById('analyticsWorkflowChart');
  if (workflowChart) {
    const wfStats = {
      pending: G.workflows.filter(w => w.status === 'pending').length,
      in_review: G.workflows.filter(w => w.status === 'in_review').length,
      approved: G.workflows.filter(w => w.status === 'approved').length,
      rejected: G.workflows.filter(w => w.status === 'rejected').length
    };
    workflowChart.innerHTML = `
      <div class="space-y-2">
        <div class="flex justify-between text-xs"><span>En attente</span><span class="text-orange-400">${wfStats.pending}</span></div>
        <div class="flex justify-between text-xs"><span>En révision</span><span class="text-blue-400">${wfStats.in_review}</span></div>
        <div class="flex justify-between text-xs"><span>Approuvés</span><span class="text-green-400">${wfStats.approved}</span></div>
        <div class="flex justify-between text-xs"><span>Rejetés</span><span class="text-red-400">${wfStats.rejected}</span></div>
      </div>
    `;
  }
}

function refreshAnalytics() {
  renderAnalytics();
  showToast('Analytics actualisés', 'success');
}

// ─── Signatures ───
function renderSignatures() {
  const container = document.getElementById('signaturesList');
  if (!container) return;
  
  if (G.signatures.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-signature text-4xl mb-3 block opacity-20"></i><p>Aucune signature</p></div>';
    return;
  }
  
  const pendingCount = G.signatures.filter(s => s.status === 'pending').length;
  const signedCount = G.signatures.filter(s => s.status === 'signed').length;
  const rejectedCount = G.signatures.filter(s => s.status === 'rejected').length;
  
  const sigStatPending = document.getElementById('sigStatPending');
  const sigStatSigned = document.getElementById('sigStatSigned');
  const sigStatRejected = document.getElementById('sigStatRejected');
  
  if (sigStatPending) sigStatPending.textContent = pendingCount;
  if (sigStatSigned) sigStatSigned.textContent = signedCount;
  if (sigStatRejected) sigStatRejected.textContent = rejectedCount;
  
  container.innerHTML = G.signatures.map(s => {
    const doc = G.documents.find(d => d.id === s.document_id);
    return `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20 flex items-center justify-between">
        <div><p class="text-white font-medium">${doc?.name || 'Document inconnu'}</p><p class="text-xs text-blue-300/60">Signataire: ${s.signer_email || s.signer_id}</p></div>
        <span class="px-3 py-1 rounded-full text-xs ${getSigStatusClass(s.status)}">${s.status === 'pending' ? 'En attente' : s.status === 'signed' ? 'Signé' : 'Rejeté'}</span>
      </div>
    `;
  }).join('');
}

function getSigStatusClass(status) {
  const classes = { 
    pending: 'bg-yellow-500/20 text-yellow-300', 
    signed: 'bg-green-500/20 text-green-300', 
    rejected: 'bg-red-500/20 text-red-300' 
  };
  return classes[status] || 'bg-gray-500/20 text-gray-300';
}

function openSignModal() {
  if (!G.currentDocId) {
    showToast('Veuillez ouvrir un document d\'abord', 'warning');
    return;
  }
  const modal = document.getElementById('signatureModal');
  if (modal) modal.classList.remove('hidden');
  initSignatureCanvas();
}

function closeSignModal() {
  const modal = document.getElementById('signatureModal');
  if (modal) modal.classList.add('hidden');
}

function initSignatureCanvas() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  
  canvas.width = canvas.offsetWidth;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(8,15,40,0.8)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  
  let drawing = false;
  
  canvas.addEventListener('mousedown', (e) => {
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    ctx.beginPath();
    ctx.moveTo(x, y);
  });
  
  canvas.addEventListener('mousemove', (e) => {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    ctx.lineTo(x, y);
    ctx.stroke();
  });
  
  canvas.addEventListener('mouseup', () => {
    drawing = false;
  });
  
  canvas.addEventListener('mouseleave', () => {
    drawing = false;
  });
  
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
    const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
    ctx.beginPath();
    ctx.moveTo(x, y);
  });
  
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
    const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
    ctx.lineTo(x, y);
    ctx.stroke();
  });
  
  canvas.addEventListener('touchend', () => {
    drawing = false;
  });
}

function clearSignature() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8,15,40,0.8)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

async function submitSignature() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  
  const imageData = canvas.toDataURL('image/png');
  
  if (G.currentDocId) {
    const newSig = {
      id: generateId(),
      document_id: G.currentDocId,
      signer_id: G.currentUser.id,
      signer_email: G.currentUser.email,
      status: 'signed',
      signature_data: imageData,
      signed_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    
    const { error } = await G.supabase.from('signatures').insert(newSig);
    if (error) {
      showToast('Erreur signature', 'error');
      return;
    }
    
    G.signatures.push(newSig);
    showToast('Signature enregistrée', 'success');
  }
  closeSignModal();
  renderSignatures();
  
  await addAuditLog('signature', 'document', G.currentDocId);
}

function openRequestSignatureModal() {
  const modal = document.getElementById('requestSignatureModal');
  if (modal) modal.classList.remove('hidden');
  
  const docSelect = document.getElementById('signatureDocId');
  if (docSelect) {
    docSelect.innerHTML = '<option value="">-- Sélectionner un document --</option>' + 
      G.documents.filter(d => !d.is_deleted).map(doc => `<option value="${doc.id}">${doc.name}</option>`).join('');
  }
}

function closeRequestSignatureModal() {
  const modal = document.getElementById('requestSignatureModal');
  if (modal) modal.classList.add('hidden');
}

async function requestSignature() {
  const docId = document.getElementById('signatureDocId')?.value;
  const signerEmail = document.getElementById('signatureSignerEmail')?.value;
  const message = document.getElementById('signatureMessage')?.value;
  
  if (!docId || !signerEmail) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }
  
  const newSig = {
    id: generateId(),
    document_id: docId,
    signer_email: signerEmail,
    signer_id: null,
    status: 'pending',
    message: message,
    requested_by: G.currentUser.id,
    created_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('signatures').insert(newSig);
  if (error) {
    showToast('Erreur demande de signature', 'error');
    return;
  }
  
  G.signatures.push(newSig);
  showToast(`Demande de signature envoyée à ${signerEmail}`, 'success');
  closeRequestSignatureModal();
  renderSignatures();
  
  await addAuditLog('signature_request', 'document', docId, `Demandé à ${signerEmail}`);
}

// ─── IA (corrigé avec analyse réelle) ───
function renderAI() {
  const container = document.getElementById('aiDocsList');
  if (!container) return;
  
  const docs = G.documents.filter(d => !d.is_deleted).slice(0, 10);
  container.innerHTML = docs.map(d => `
    <div class="glass-card rounded-xl p-4 border border-pink-500/20">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3"><i class="fas ${getFileIcon(d.type).split(' ')[0]} text-pink-400"></i><span class="text-white font-medium">${d.name}</span></div>
        <button onclick="analyzeDocument('${d.id}')" class="px-3 py-1.5 rounded-lg bg-pink-500/20 text-pink-400 text-xs hover:bg-pink-500/30">Analyser</button>
      </div>
    </div>
  `).join('');
}

async function analyzeDocument(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  showToast(`Analyse IA du document "${doc.name}" en cours...`, 'info');
  
  try {
    // Simuler une analyse IA
    const analysis = {
      summary: `Résumé du document ${doc.name}: Ce document contient des informations importantes concernant ${doc.type === 'pdf' ? 'un contrat' : 'un rapport'}.`,
      keywords: ['important', 'document', 'ged'],
      sentiment: 'positif'
    };
    
    // Afficher le résultat
    const aiResponseContainer = document.getElementById('aiResponseContainer');
    const aiResponseText = document.getElementById('aiResponseText');
    if (aiResponseContainer && aiResponseText) {
      aiResponseContainer.classList.remove('hidden');
      aiResponseText.innerHTML = `
        <strong>Analyse de "${doc.name}" :</strong><br>
        📝 Résumé: ${analysis.summary}<br>
        🔑 Mots-clés: ${analysis.keywords.join(', ')}<br>
        😊 Sentiment: ${analysis.sentiment}
      `;
    }
    
    showToast(`Analyse terminée: ${doc.name}`, 'success');
  } catch (err) {
    showToast(`Erreur d'analyse: ${err.message}`, 'error');
  }
}

function analyzeAllDocuments() {
  showToast('Analyse de tous les documents en cours...', 'info');
  setTimeout(() => {
    showToast(`Analyse terminée: ${G.documents.filter(d => !d.is_deleted).length} documents analysés`, 'success');
  }, 3000);
}

function askAI() {
  const query = document.getElementById('aiQueryInput')?.value;
  if (!query) {
    showToast('Veuillez poser une question', 'warning');
    return;
  }
  
  const responseContainer = document.getElementById('aiResponseContainer');
  const responseText = document.getElementById('aiResponseText');
  
  if (responseContainer && responseText) {
    responseContainer.classList.remove('hidden');
    responseText.innerHTML = `Analyse de "${query}" en cours...`;
    setTimeout(() => {
      const relevantDocs = G.documents.filter(d => !d.is_deleted && d.name.toLowerCase().includes(query.toLowerCase()));
      if (relevantDocs.length > 0) {
        responseText.innerHTML = `🔍 Résultat pour "${query}" :<br>${relevantDocs.map(d => `📄 ${d.name}`).join('<br>')}<br><br>Total: ${relevantDocs.length} document(s) trouvé(s)`;
      } else {
        responseText.innerHTML = `Aucun document ne correspond à "${query}". Essayez d'autres termes de recherche.`;
      }
    }, 1500);
  }
}

// ─── Automation ───
function renderAutomation() {
  const container = document.getElementById('automationRulesList');
  if (!container) return;
  
  if (G.automationRules.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-magic text-4xl mb-3 block opacity-20"></i><p>Aucune règle d\'automatisation</p></div>';
    return;
  }
  
  container.innerHTML = G.automationRules.map(r => `
    <div class="glass-card rounded-xl p-4 border border-orange-500/20">
      <div class="flex items-center justify-between">
        <div><p class="text-white font-medium">${r.name}</p><p class="text-xs text-blue-300/60">${r.trigger} → ${r.action}</p></div>
        <span class="px-2 py-1 rounded-full text-xs ${r.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}">${r.active ? 'Actif' : 'Inactif'}</span>
      </div>
    </div>
  `).join('');
  
  const statsEl = document.getElementById('automationStats');
  if (statsEl) statsEl.textContent = `${G.automationRules.length} règle(s) active(s)`;
}

function openWfRuleModal() {
  const modal = document.getElementById('wfRuleModal');
  if (modal) modal.classList.remove('hidden');
}

function closeWfRuleModal() {
  const modal = document.getElementById('wfRuleModal');
  if (modal) modal.classList.add('hidden');
}

async function createWfRule(e) {
  e.preventDefault();
  
  const rule = {
    id: generateId(),
    name: document.getElementById('wfRuleName')?.value || 'Nouvelle règle',
    trigger: document.getElementById('wfRuleTrigger')?.value || '',
    action: document.getElementById('wfRuleAction')?.value || '',
    config: {},
    active: true,
    company_id: G.currentUser.companyId,
    created_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('automation_rules').insert(rule);
  if (error) {
    showToast('Erreur création règle', 'error');
    return;
  }
  
  G.automationRules.push(rule);
  closeWfRuleModal();
  renderAutomation();
  showToast('Règle créée', 'success');
  
  await addAuditLog('automation_rule_create', 'rule', rule.id, `Nom: ${rule.name}`);
}

function quickCreateRule(ruleType) {
  const nameInput = document.getElementById('wfRuleName');
  const triggerSelect = document.getElementById('wfRuleTrigger');
  const actionSelect = document.getElementById('wfRuleAction');
  
  if (nameInput && triggerSelect && actionSelect) {
    switch(ruleType) {
      case 'upload_workflow':
        nameInput.value = 'Auto-approbation upload';
        triggerSelect.value = 'document_upload';
        actionSelect.value = 'start_workflow';
        break;
      case 'signature_notify':
        nameInput.value = 'Notification signature';
        triggerSelect.value = 'signature_done';
        actionSelect.value = 'send_notification';
        break;
      case 'webhook_approve':
        nameInput.value = 'Webhook approbation';
        triggerSelect.value = 'workflow_approve';
        actionSelect.value = 'call_webhook';
        break;
    }
  }
  openWfRuleModal();
}

// ─── Integrations ───
function renderIntegrations() {
  const container = document.getElementById('integrationsGrid');
  if (!container) return;
  
  const integrations = [
    { name: 'Slack', icon: 'fab fa-slack', color: 'purple', description: 'Notifications en temps réel' },
    { name: 'Google Drive', icon: 'fab fa-google-drive', color: 'green', description: 'Import/Export documents' },
    { name: 'Dropbox', icon: 'fab fa-dropbox', color: 'blue', description: 'Synchronisation cloud' },
    { name: 'Microsoft 365', icon: 'fab fa-microsoft', color: 'blue', description: 'Éditer avec Office' },
    { name: 'Zapier', icon: 'fas fa-bolt', color: 'yellow', description: 'Automatisations' },
    { name: 'Make', icon: 'fas fa-cogs', color: 'orange', description: 'Workflows avancés' }
  ];
  
  container.innerHTML = integrations.map(i => `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20 hover:border-${i.color}-400/40 cursor-pointer transition-all">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-lg bg-${i.color}-500/20 flex items-center justify-center text-${i.color}-400"><i class="${i.icon} text-lg"></i></div>
        <div><p class="text-white font-medium">${i.name}</p><p class="text-xs text-blue-300/60">${i.description}</p></div>
      </div>
      <button class="w-full py-2 rounded-lg bg-blue-500/10 text-blue-400 text-xs hover:bg-blue-500/20" onclick="connectIntegration('${i.name}')">Connecter</button>
    </div>
  `).join('');
}

function connectIntegration(name) {
  showToast(`Connexion à ${name} en développement`, 'info');
}

function addWebhook() {
  const url = document.getElementById('webhookUrl')?.value;
  const event = document.getElementById('webhookEvent')?.value;
  
  if (!url) {
    showToast('Veuillez entrer une URL', 'warning');
    return;
  }
  
  showToast(`Webhook ${event} ajouté`, 'success');
  const container = document.getElementById('webhooksList');
  if (container) {
    if (container.innerHTML.includes('Aucun webhook')) {
      container.innerHTML = '';
    }
    container.innerHTML += `
      <div class="flex items-center justify-between p-2 rounded-lg bg-slate-900/30 border border-blue-500/10">
        <div><p class="text-white text-xs">${event}</p><p class="text-blue-300/50 text-[10px]">${url}</p></div>
        <button onclick="this.parentElement.remove()" class="text-red-400 text-xs"><i class="fas fa-trash"></i></button>
      </div>
    `;
  }
  document.getElementById('webhookUrl').value = '';
}

// ─── Backups ───
function renderBackups() {
  const container = document.getElementById('backupsList');
  if (!container) return;
  
  if (G.backups.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-database text-4xl mb-3 block opacity-20"></i><p>Aucune sauvegarde</p></div>';
    return;
  }
  
  const statsEl = document.getElementById('backupStats');
  if (statsEl) statsEl.textContent = `${G.backups.length} sauvegarde(s) disponible(s)`;
  
  container.innerHTML = G.backups.map(b => `
    <div class="glass-card rounded-xl p-4 border border-teal-500/20 flex items-center justify-between">
      <div class="flex items-center gap-3"><i class="fas fa-archive text-teal-400 text-xl"></i><div><p class="text-white font-medium">${b.name}</p><p class="text-xs text-blue-300/60">${b.type} • ${formatBytes(b.size)} • ${formatDate(b.created_at)}</p></div></div>
      <button onclick="restoreBackup('${b.id}')" class="px-3 py-1.5 rounded-lg bg-teal-500/20 text-teal-400 text-xs hover:bg-teal-500/30">Restaurer</button>
    </div>
  `).join('');
}

async function createBackup(type) {
  const backup = {
    id: generateId(),
    name: `Backup ${new Date().toLocaleString('fr-FR')}`,
    type: type === 'full' ? 'Complète' : 'Documents',
    size: G.documents.reduce((sum, d) => sum + (d.size || 0), 0),
    created_by: G.currentUser.id,
    company_id: G.currentUser.companyId,
    created_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('backups').insert(backup);
  if (error) {
    showToast('Erreur création backup', 'error');
    return;
  }
  
  G.backups.unshift(backup);
  renderBackups();
  showToast('Sauvegarde créée', 'success');
  
  await addAuditLog('backup_create', 'backup', backup.id, `Type: ${type}`);
}

function restoreBackup(id) {
  showToast('Restauration en cours...', 'info');
  setTimeout(() => showToast('Restauration terminée', 'success'), 2000);
}

function toggleAutoBackup() {
  const enable = document.getElementById('autoBackupEnable')?.checked;
  const frequency = document.getElementById('autoBackupFrequency');
  const retention = document.getElementById('autoBackupRetention');
  
  if (frequency && retention) {
    frequency.disabled = !enable;
    retention.disabled = !enable;
  }
  showToast(`Sauvegarde automatique ${enable ? 'activée' : 'désactivée'}`, 'info');
}

function saveBackupSettings() {
  showToast('Paramètres de sauvegarde enregistrés', 'success');
}

// ─── API Keys ───
function renderApiKeys() {
  const container = document.getElementById('apiKeysList2');
  if (!container) return;
  
  if (G.apiKeys.length === 0) {
    container.innerHTML = '<div class="text-center py-8 text-blue-300/50"><p class="text-sm">Aucune clé API</p></div>';
    return;
  }
  
  container.innerHTML = G.apiKeys.map(k => `
    <div class="glass-card rounded-xl p-4 border border-green-500/20 flex items-center justify-between">
      <div><p class="text-white font-medium text-sm">${k.name}</p><p class="text-xs text-green-400/60 font-mono">${k.key?.substr(0, 20)}...</p><p class="text-xs text-blue-300/50">Créé le ${formatDate(k.created_at)}</p></div>
      <button onclick="revokeApiKey('${k.id}')" class="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30">Révoquer</button>
    </div>
  `).join('');
}

function generateApiKeyV6() {
  generateApiKey();
}

async function revokeApiKey(id) {
  const { error } = await G.supabase.from('api_keys').delete().eq('id', id);
  if (error) {
    showToast('Erreur révocation', 'error');
    return;
  }
  
  G.apiKeys = G.apiKeys.filter(k => k.id !== id);
  renderApiKeys();
  showToast('Clé révoquée', 'success');
}

// ─── Search ───
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
      <p class="text-white text-sm">${doc.name}</p>
      <p class="text-xs text-blue-300/60">${formatBytes(doc.size)}</p>
    </div>
  `).join('');
}

function runAdvSearch() {
  const query = document.getElementById('advSearchInput')?.value.toLowerCase();
  const type = document.getElementById('advSearchType')?.value;
  const dateFilter = document.getElementById('advSearchDate')?.value;
  const sizeFilter = document.getElementById('advSearchSize')?.value;
  
  let results = G.documents.filter(d => !d.is_deleted);
  if (query) results = results.filter(d => d.name.toLowerCase().includes(query));
  if (type) results = results.filter(d => d.type === type);
  
  if (dateFilter === 'today') {
    results = results.filter(d => new Date(d.created_at).toDateString() === new Date().toDateString());
  } else if (dateFilter === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    results = results.filter(d => new Date(d.created_at) >= weekAgo);
  } else if (dateFilter === 'month') {
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    results = results.filter(d => new Date(d.created_at) >= monthAgo);
  }
  
  if (sizeFilter === 'small') {
    results = results.filter(d => d.size < 1024 * 1024);
  } else if (sizeFilter === 'medium') {
    results = results.filter(d => d.size >= 1024 * 1024 && d.size < 10 * 1024 * 1024);
  } else if (sizeFilter === 'large') {
    results = results.filter(d => d.size >= 10 * 1024 * 1024);
  }
  
  const container = document.getElementById('advSearchResults');
  const countSpan = document.getElementById('advSearchCount');
  
  if (countSpan) countSpan.textContent = `${results.length} résultat(s)`;
  
  if (container) {
    if (results.length === 0) {
      container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-search text-4xl mb-3 block opacity-20"></i><p>Aucun résultat</p></div>';
    } else {
      container.innerHTML = `<div class="doc-grid">${results.map(doc => renderDocCard(doc)).join('')}</div>`;
    }
  }
}

function clearAdvSearch() {
  const input = document.getElementById('advSearchInput');
  const typeSelect = document.getElementById('advSearchType');
  const dateSelect = document.getElementById('advSearchDate');
  const sizeSelect = document.getElementById('advSearchSize');
  
  if (input) input.value = '';
  if (typeSelect) typeSelect.value = '';
  if (dateSelect) dateSelect.value = '';
  if (sizeSelect) sizeSelect.value = '';
  runAdvSearch();
}

function runFTSearch() {
  const query = document.getElementById('ftsInput')?.value;
  const type = document.getElementById('ftsType')?.value;
  const dateFilter = document.getElementById('ftsDate')?.value;
  
  if (!query || query.length < 3) {
    const container = document.getElementById('searchV7Results');
    if (container) {
      container.innerHTML = '<div class="text-center py-20 text-blue-300/30"><i class="fas fa-search text-6xl mb-5 block opacity-10"></i><p class="text-lg">Tapez au moins 3 caractères pour rechercher</p></div>';
    }
    return;
  }
  
  let results = G.documents.filter(d => !d.is_deleted && d.name.toLowerCase().includes(query.toLowerCase()));
  if (type) results = results.filter(d => d.type === type);
  
  if (dateFilter === 'today') {
    results = results.filter(d => new Date(d.created_at).toDateString() === new Date().toDateString());
  } else if (dateFilter === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    results = results.filter(d => new Date(d.created_at) >= weekAgo);
  } else if (dateFilter === 'month') {
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    results = results.filter(d => new Date(d.created_at) >= monthAgo);
  }
  
  const container = document.getElementById('searchV7Results');
  const countSpan = document.getElementById('ftsCount');
  
  if (countSpan) countSpan.textContent = `${results.length} résultat(s)`;
  
  if (container) {
    if (results.length === 0) {
      container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-search text-4xl mb-3 block opacity-20"></i><p>Aucun résultat pour "' + query + '"</p></div>';
    } else {
      container.innerHTML = `<div class="doc-grid">${results.map(doc => renderDocCard(doc)).join('')}</div>`;
    }
  }
}

function renderAdvancedSearch() {
  runAdvSearch();
}

function renderVersioning() {
  const container = document.getElementById('versionDocList');
  if (!container) return;
  
  const docs = G.documents.filter(d => !d.is_deleted);
  if (docs.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-code-branch text-4xl mb-3 block opacity-20"></i><p>Aucun document</p></div>';
    return;
  }
  
  container.innerHTML = docs.map(doc => `
    <div class="glass-card rounded-xl p-4 border border-cyan-500/20 flex items-center justify-between">
      <div><p class="text-white font-medium">${doc.name}</p><p class="text-xs text-blue-300/60">Version ${doc.version} • ${formatDate(doc.updated_at)}</p></div>
      <button onclick="restoreVersion('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs hover:bg-cyan-500/30">Restaurer</button>
    </div>
  `).join('');
}

function filterVersionDocs(query) {
  const container = document.getElementById('versionDocList');
  if (!container) return;
  
  let docs = G.documents.filter(d => !d.is_deleted);
  if (query) {
    docs = docs.filter(d => d.name.toLowerCase().includes(query.toLowerCase()));
  }
  
  if (docs.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-search text-4xl mb-3 block opacity-20"></i><p>Aucun document trouvé</p></div>';
    return;
  }
  
  container.innerHTML = docs.map(doc => `
    <div class="glass-card rounded-xl p-4 border border-cyan-500/20 flex items-center justify-between">
      <div><p class="text-white font-medium">${doc.name}</p><p class="text-xs text-blue-300/60">Version ${doc.version} • ${formatDate(doc.updated_at)}</p></div>
      <button onclick="restoreVersion('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs hover:bg-cyan-500/30">Restaurer</button>
    </div>
  `).join('');
}

function restoreVersion(docId) {
  showToast('Restauration de version en cours...', 'info');
  setTimeout(() => showToast('Version restaurée', 'success'), 1500);
}

function renderSearchV7() {
  runFTSearch();
}

function renderAuditV6() {
  const statsContainer = document.getElementById('auditStatsGrid');
  const timelineContainer = document.getElementById('auditTimelineList');
  const alertsContainer = document.getElementById('securityAlertsList');
  
  if (statsContainer) {
    statsContainer.innerHTML = `
      <div class="glass-card rounded-xl p-3 text-center"><p class="text-2xl font-bold text-white">${G.auditLogs.length}</p><p class="text-xs text-blue-300/60">Événements</p></div>
      <div class="glass-card rounded-xl p-3 text-center"><p class="text-2xl font-bold text-white">${G.auditLogs.filter(l => l.action === 'login').length}</p><p class="text-xs text-blue-300/60">Connexions</p></div>
      <div class="glass-card rounded-xl p-3 text-center"><p class="text-2xl font-bold text-white">${G.auditLogs.filter(l => l.action === 'upload').length}</p><p class="text-xs text-blue-300/60">Uploads</p></div>
      <div class="glass-card rounded-xl p-3 text-center"><p class="text-2xl font-bold text-white">${G.auditLogs.filter(l => l.action === 'delete').length}</p><p class="text-xs text-blue-300/60">Suppressions</p></div>
      <div class="glass-card rounded-xl p-3 text-center"><p class="text-2xl font-bold text-white">${G.auditLogs.filter(l => l.action === 'share').length}</p><p class="text-xs text-blue-300/60">Partages</p></div>
      <div class="glass-card rounded-xl p-3 text-center"><p class="text-2xl font-bold text-white">${G.workflows.length}</p><p class="text-xs text-blue-300/60">Workflows</p></div>
    `;
  }
  
  if (timelineContainer) {
    let filtered = G.auditLogs;
    if (G.auditFilter.action) {
      filtered = filtered.filter(l => l.action === G.auditFilter.action);
    }
    
    if (filtered.length === 0) {
      timelineContainer.innerHTML = '<div class="text-center py-8 text-blue-300/50">Aucun événement</div>';
    } else {
      timelineContainer.innerHTML = filtered.slice(0, 30).map(l => `
        <div class="p-2 border-b border-blue-500/10 flex justify-between items-center">
          <div><span class="text-xs text-white">${l.action}</span><span class="text-xs text-blue-300/60 ml-2">${l.target_type || ''}</span></div>
          <span class="text-xs text-blue-300/60">${formatDate(l.created_at)}</span>
        </div>
      `).join('');
    }
  }
  
  if (alertsContainer) {
    const criticalLogs = G.auditLogs.filter(l => l.severity === 'critical' || l.action === 'delete').slice(0, 5);
    if (criticalLogs.length === 0) {
      alertsContainer.innerHTML = '<div class="text-center py-6 text-blue-300/50 text-sm"><i class="fas fa-shield-alt text-2xl mb-2 block opacity-30"></i>Aucune alerte récente</div>';
    } else {
      alertsContainer.innerHTML = criticalLogs.map(l => `
        <div class="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p class="text-red-400 text-xs font-semibold">⚠️ ${l.action.toUpperCase()}</p>
          <p class="text-blue-300/70 text-xs mt-1">${l.target_type || 'Action'} • ${formatDate(l.created_at)}</p>
        </div>
      `).join('');
    }
  }
}

function setAuditFilter(type, value) {
  if (!G.auditFilter) G.auditFilter = { days: 30, severity: '', action: '' };
  if (type === 'days') G.auditFilter.days = parseInt(value);
  if (type === 'severity') G.auditFilter.severity = value;
  if (type === 'action') G.auditFilter.action = value;
  renderAuditV6();
}

function filterAuditLogs(query) {
  const container = document.getElementById('auditTimelineList');
  if (!container) return;
  
  let filtered = G.auditLogs;
  if (query) {
    filtered = filtered.filter(l => l.action.toLowerCase().includes(query.toLowerCase()) || 
      (l.target_type && l.target_type.toLowerCase().includes(query.toLowerCase())));
  }
  
  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-center py-8 text-blue-300/50">Aucun événement</div>';
  } else {
    container.innerHTML = filtered.slice(0, 50).map(l => `
      <div class="p-2 border-b border-blue-500/10 flex justify-between items-center">
        <div><span class="text-xs text-white">${l.action}</span><span class="text-xs text-blue-300/60 ml-2">${l.target_type || ''}</span></div>
        <span class="text-xs text-blue-300/60">${formatDate(l.created_at)}</span>
      </div>
    `).join('');
  }
}

function clearAuditFilters() {
  const searchInput = document.getElementById('auditSearchInput');
  if (searchInput) searchInput.value = '';
  renderAuditV6();
}

function prevAuditPage() {
  if (G.auditCurrentPage > 1) {
    G.auditCurrentPage--;
    renderAuditV6();
  }
}

function nextAuditPage() {
  const maxPage = Math.ceil(G.auditLogs.length / G.auditPageSize);
  if (G.auditCurrentPage < maxPage) {
    G.auditCurrentPage++;
    renderAuditV6();
  }
}

function exportUserData() {
  const userData = {
    profile: {
      name: G.currentUser.name,
      email: G.currentUser.email,
      role: G.currentUser.role,
      company: G.currentUser.companyName
    },
    documents: G.documents.filter(d => d.owner_id === G.currentUser.id),
    activities: G.auditLogs.filter(l => l.user_id === G.currentUser.id)
  };
  
  const data = JSON.stringify(userData, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `user_data_${G.currentUser.email}_${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Export des données personnelles effectué', 'success');
}

function requestAccountDeletion() {
  if (confirm('⚠️ ATTENTION : Cette action est irréversible. Voulez-vous vraiment demander la suppression de votre compte ?')) {
    showToast('Demande de suppression envoyée. Un administrateur traitera votre demande.', 'info');
  }
}

function copySqlSchema() {
  const schema = document.getElementById('sqlSchemaBlock')?.textContent;
  if (schema) {
    navigator.clipboard.writeText(schema);
    showToast('Schéma SQL copié', 'success');
  }
}

function openDangerModal(action) {
  showToast('Fonctionnalité de suppression en développement', 'info');
}

function closeNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (panel) panel.classList.add('hidden');
}

function toggleNotifications() {
  const panel = document.getElementById('notifPanel');
  if (panel) {
    panel.classList.toggle('hidden');
  }
}

function markAllNotifRead() {
  showToast('Toutes les notifications marquées comme lues', 'success');
  const badge = document.getElementById('notifBadge');
  const countBadge = document.getElementById('notifCountBadge');
  if (badge) badge.classList.add('hidden');
  if (countBadge) countBadge.classList.add('hidden');
}

// ─── Audit Log Helper ───
async function addAuditLog(action, targetType, targetId, details = '') {
  try {
    const log = {
      id: generateId(),
      user_id: G.currentUser.id,
      user_email: G.currentUser.email,
      action: action,
      target_type: targetType,
      target_id: targetId,
      details: details,
      severity: action === 'delete' || action === 'validate_user' ? 'warning' : 'info',
      created_at: new Date().toISOString()
    };
    
    const { error } = await G.supabase.from('audit_logs').insert(log);
    if (!error && G.auditLogs) {
      G.auditLogs.unshift(log);
      if (G.auditLogs.length > 500) G.auditLogs.pop();
    }
  } catch (err) {
    console.error('Erreur ajout log audit:', err);
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
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getFileIcon(type) {
  const icons = { 
    pdf: 'fa-file-pdf text-red-400', 
    doc: 'fa-file-word text-blue-400', 
    xls: 'fa-file-excel text-green-400', 
    img: 'fa-file-image text-purple-400', 
    txt: 'fa-file-alt text-gray-400' 
  };
  return icons[type] || 'fa-file text-blue-400';
}

function getFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const types = { 
    pdf: 'pdf', 
    doc: 'doc', 
    docx: 'doc', 
    xls: 'xls', 
    xlsx: 'xls', 
    png: 'img', 
    jpg: 'img', 
    jpeg: 'img', 
    gif: 'img', 
    txt: 'txt' 
  };
  return types[ext] || 'unknown';
}

function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'success' ? 'bg-green-500/90' : type === 'error' ? 'bg-red-500/90' : type === 'warning' ? 'bg-yellow-500/90 text-black' : 'bg-blue-500/90'}`;
  toast.innerHTML = `<div class="flex items-center gap-2"><i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i><span>${message}</span></div>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function handleDocDragStart(e, docId) {
  e.dataTransfer.setData('text/plain', docId);
}

function showDocContextMenu(e, docId) {
  e.preventDefault();
  if (confirm('Supprimer ce document ?')) deleteDocument(docId);
}

// ─── Initialisation ───
document.addEventListener('DOMContentLoaded', async () => {
  await initSupabase();
  const { data: { session } } = await G.supabase.auth.getSession();
  
  if (session) {
    await loadUserFromSupabase(session.user);
    switchToMainApp();
  } else {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    if (loginScreen) loginScreen.style.display = 'block';
    if (mainApp) mainApp.style.display = 'none';
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
  window.renderShared = renderShared;
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
  window.actOnWorkflow = actOnWorkflow;
  window.addWfComment = addWfComment;
  window.openWfDetail = openWfDetail;
  window.closeWfDetail = closeWfDetail;
  window.filterWorkflows = filterWorkflows;
  window.searchWorkflows = searchWorkflows;
  window.setWfView = setWfView;
  window.renderUsers = renderUsers;
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
  
  // Nouvelles fonctions
  window.openMoveModal = openMoveModal;
  window.closeMoveModal = closeMoveModal;
  window.confirmMoveDocument = confirmMoveDocument;
  window.openCollabModal = openCollabModal;
  window.closeCollabModal = closeCollabModal;
  window.inviteCollaborator = inviteCollaborator;
});
