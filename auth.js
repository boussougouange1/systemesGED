// ============================================
// SystemesGED v7.2 — MODULE : auth.js (CORRIGÉ)
// ============================================

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

window._shared = window._shared || {
  currentTab:   'received',
  bulkSelected: new Set(),
  qsRecipients: [],
  qsCurrentTab: 'user',
  publicLinks:  [],
  filterQuery:  '',
  filterPerm:   '',
  filterStatus: '',
};

window._search = window._search || { lastQuery: '', lastResults: [] };
window._sysLogs = window._sysLogs || { filter: 'all', searchQuery: '', page: 1, pageSize: 50, autoRefresh: false, autoRefreshTimer: null, allLogs: [] };
window._versioning = window._versioning || { currentDocId: null, history: [], compareA: null, compareB: null };
window._rbac = window._rbac || { editingRole: null };
window._webhooks = window._webhooks || [];

window.G = {
  supabase: null,
  currentUser: null,
  currentCompany: null,
  currentTagFilter: null,
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
  auditFilter: { days: 30, severity: '', action: '' },
  logFilter: 'all',
  auditCurrentPage: 1,
  auditPageSize: 20,
  _isDemo: false
};

// ─── Protection anti-copie ───
(function protectApplication() {
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); return false; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) ||
        (e.ctrlKey && (e.key === 'u' || e.key === 'U'))) {
      e.preventDefault();
      return false;
    }
  });
})();

// ─── Initialisation Supabase ───
async function initSupabase() {
  try {
    if (typeof supabase === 'undefined') {
      console.error('Supabase library not loaded');
      showToast('Erreur de chargement de la bibliothèque Supabase', 'error');
      throw new Error('Supabase library not loaded');
    }
    console.log('🔄 Initialisation de Supabase...');
    G.supabase = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'pkce' }
    });
    const { data: { session }, error: sessionError } = await G.supabase.auth.getSession();
    if (sessionError) console.warn('Erreur session:', sessionError);
    if (session) {
      console.log('✅ Session existante trouvée');
      await loadUserFromSupabase(session.user);
      return true;
    }
    console.log('⚠️ Aucune session active');
    return false;
  } catch (e) {
    console.error('Supabase init error:', e);
    showToast('Erreur de connexion à la base de données', 'error');
    return false;
  }
}

async function loadUserFromSupabase(user) {
  if (!user) return false;
  const sysAdmin = CONFIG.systemAdmins.find(a => a.email === user.email);
  if (sysAdmin) {
    G.currentUser = {
      id: user.id, email: user.email, name: `Admin ${sysAdmin.companyName}`,
      role: 'admin', companyId: sysAdmin.companyId, companyName: sysAdmin.companyName,
      plan: 'enterprise', status: 'active', isSystemAdmin: true
    };
    await ensureCompanyExists(sysAdmin.companyId, sysAdmin.companyName);
    await loadAllData();
    return true;
  }
  try {
    const { data: profile, error } = await G.supabase
      .from('profiles')
      .select('*, companies!company_id(name, plan)')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    G.currentUser = {
      id: user.id, email: profile.email, name: profile.name, role: profile.role,
      companyId: profile.company_id, companyName: profile.companies?.name || 'Mon entreprise',
      plan: profile.plan || 'free', status: profile.status, isSystemAdmin: false
    };
    await loadAllData();
    return true;
  } catch (err) {
    console.error('Erreur chargement profil:', err);
    return false;
  }
}

async function ensureCompanyExists(companyId, companyName) {
  const { data: existing } = await G.supabase.from('companies').select('id').eq('id', companyId).single();
  if (!existing) {
    await G.supabase.from('companies').insert({ id: companyId, name: companyName, plan: 'enterprise' });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CORRECTION : setRootFolder avec upsert et vérification préalable
// ═══════════════════════════════════════════════════════════════════════
async function setRootFolder(retries = 3) {
  if (!G.currentUser?.companyId) return false;

  // 1. Vérifier si le dossier racine existe déjà
  const { data: rootFolder, error: selectError } = await G.supabase
    .from('folders')
    .select('id')
    .eq('company_id', G.currentUser.companyId)
    .eq('name', 'Racine')
    .maybeSingle();

  if (rootFolder && !selectError) {
    G.currentFolderId = rootFolder.id;
    G.folderPath = [{ id: rootFolder.id, name: 'Racine' }];
    console.log('✅ Dossier racine déjà existant :', rootFolder.id);
    return true;
  }

  // 2. Sinon, tenter de le créer avec upsert pour éviter les conflits de clé
  const newRootId = `${G.currentUser.companyId}_root`;
  const { error: upsertError } = await G.supabase
    .from('folders')
    .upsert({
      id: newRootId,
      name: 'Racine',
      parent_id: null,
      company_id: G.currentUser.companyId,
      created_at: new Date().toISOString()
    }, { onConflict: 'id' });

  if (!upsertError) {
    G.currentFolderId = newRootId;
    G.folderPath = [{ id: newRootId, name: 'Racine' }];
    console.log('✅ Dossier racine créé avec succès :', newRootId);
    return true;
  }

  console.error('Impossible de créer/récupérer le dossier racine', upsertError);
  showToast('Erreur d\'initialisation des dossiers', 'error');
  return false;
}

async function loadAllData() {
  if (!G.currentUser?.companyId) return;
  const companyId = G.currentUser.companyId;
  const userId    = G.currentUser.id;
  try {
    const [
      docsRes, wfsRes, usersRes, tagsRes, sharesRes,
      foldersRes, sigsRes, rulesRes, keysRes, backupsRes,
      auditRes, syslogsRes, publicLinksRes
    ] = await Promise.all([
      G.supabase.from('documents').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
      G.supabase.from('workflows').select('*').eq('company_id', companyId),
      G.supabase.from('profiles').select('*').eq('company_id', companyId),
      G.supabase.from('tags').select('*').eq('company_id', companyId),
      G.supabase.from('shares').select('*').or(`sender_id.eq.${userId},recipient_email.eq.${G.currentUser.email}`),
      G.supabase.from('folders').select('*').eq('company_id', companyId),
      G.supabase.from('signatures').select('*').eq('signer_id', userId),
      G.supabase.from('automation_rules').select('*').eq('company_id', companyId),
      G.supabase.from('api_keys').select('*').eq('user_id', userId),
      G.supabase.from('backups').select('*').eq('company_id', companyId),
      G.supabase.from('audit_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(200),
      G.supabase.from('system_logs').select('*').order('created_at', { ascending: false }).limit(100),
      G.supabase.from('public_shares').select('*').eq('created_by', userId)
    ]);
    G.documents      = docsRes.data    || [];
    G.workflows      = wfsRes.data     || [];
    G.users          = usersRes.data   || [];
    G.tags           = tagsRes.data    || [];
    G.shares         = sharesRes.data  || [];
    G.folders        = foldersRes.data || [];
    G.signatures     = sigsRes.data    || [];
    G.automationRules= rulesRes.data   || [];
    G.apiKeys        = keysRes.data    || [];
    G.backups        = backupsRes.data || [];
    G.auditLogs      = auditRes.data   || [];
    G.systemLogs     = syslogsRes.data || [];
    if (typeof _shared !== 'undefined') _shared.publicLinks = publicLinksRes.data || [];
  } catch (err) {
    console.error('loadAllData critical error:', err);
    showToast('Erreur de chargement des données', 'error');
  }
  await setRootFolder();
  updateUI();
}

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
  const isAdmin   = G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
  const isManager = G.currentUser?.role === 'manager' || isAdmin;
  document.querySelectorAll('[data-role="admin-only"]').forEach(el => el.style.display = isAdmin ? 'flex' : 'none');
  document.querySelectorAll('[data-role="manager-only"]').forEach(el => el.style.display = isManager ? 'flex' : 'none');
  const adminOnlyViews = ['users', 'pending-users', 'security', 'logs', 'rbac', 'rbacv7', 'auditv6', 'integrations', 'apikeys', 'billing', 'settings'];
  if (!isAdmin) {
    adminOnlyViews.forEach(viewName => {
      document.querySelectorAll(`[data-view="${viewName}"]`).forEach(el => el.style.display = 'none');
    });
    if (adminOnlyViews.includes(G.currentView)) switchView('dashboard');
  }
}

function updateBadges() {
  const docCount = G.documents.filter(d => !d.is_deleted).length;
  const wfCount = G.workflows.filter(w => ['pending', 'in_review'].includes(w.status)).length;
  const pendingUsersCount = G.users.filter(u => u.status === 'pending_validation').length;
  const sharedCount = G.shares.filter(s => s.status === 'active' && s.recipient_email === G.currentUser?.email).length;
  const sentCount = G.shares.filter(s => s.status === 'active' && s.sender_id === G.currentUser?.id).length;
  const docBadge = document.getElementById('d-docsBadge');
  if (docBadge) { docBadge.textContent = docCount; docBadge.classList.toggle('hidden', docCount === 0); }
  const mDocsBadge = document.getElementById('m-docsBadge');
  if (mDocsBadge) { mDocsBadge.textContent = docCount; mDocsBadge.classList.toggle('hidden', docCount === 0); }
  const wfBadge = document.getElementById('d-wfBadge');
  if (wfBadge) { wfBadge.textContent = wfCount; wfBadge.classList.toggle('hidden', wfCount === 0); }
  const mWfBadge = document.getElementById('m-wfBadge');
  if (mWfBadge) { mWfBadge.textContent = wfCount; mWfBadge.classList.toggle('hidden', wfCount === 0); }
  const receivedBadge = document.getElementById('receivedCountBadge');
  if (receivedBadge) { receivedBadge.textContent = sharedCount; receivedBadge.classList.toggle('hidden', sharedCount === 0); }
  const sentBadge = document.getElementById('sentCountBadge');
  if (sentBadge) { sentBadge.textContent = sentCount; sentBadge.classList.toggle('hidden', sentCount === 0); }
  const pendingBadges = document.querySelectorAll('#d-pendingBadge, #m-pendingBadge');
  pendingBadges.forEach(badge => {
    if (pendingUsersCount > 0 && canValidateUsers()) {
      badge.textContent = pendingUsersCount;
      badge.classList.remove('hidden');
    } else badge.classList.add('hidden');
  });
  const pendingCountEl = document.getElementById('pendingCount');
  if (pendingCountEl) pendingCountEl.textContent = pendingUsersCount;
  const trashCount = G.documents.filter(d => d.is_deleted).length;
  const trashBadge = document.getElementById('trashCount');
  if (trashBadge) { trashBadge.textContent = trashCount; trashBadge.classList.toggle('hidden', trashCount === 0); }
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

function addFilesToSelection(files) {
  for (const file of files) {
    if (file.size > CONFIG.maxFileSize) {
      showToast(`Fichier trop volumineux: ${file.name} (max ${formatBytes(CONFIG.maxFileSize)})`, 'error');
      continue;
    }
    if (!G.selectedFiles.some(f => f.name === file.name && f.size === file.size)) G.selectedFiles.push(file);
  }
  renderSelectedFiles();
  const dropZone = document.getElementById('docDropZone');
  if (dropZone && G.selectedFiles.length > 0) {
    dropZone.style.borderColor = 'rgba(34,197,94,0.5)';
    setTimeout(() => { dropZone.style.borderColor = ''; }, 1000);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPassword')?.value;
  if (!email || !password) { showToast('Veuillez remplir tous les champs', 'warning'); return; }
  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }
  if (btnText) btnText.innerHTML = '<span class="spinner mr-2"></span>Connexion...';
  try {
    if (!G.supabase) await initSupabase();
    const { data, error } = await G.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      await loadUserFromSupabase(data.user);
      showToast(`Bienvenue ${G.currentUser.name || email}`, 'success');
      switchToMainApp();
    } else throw new Error('Aucun utilisateur retourné');
  } catch (err) {
    let errorMessage = 'Email ou mot de passe incorrect';
    const msg = err?.message || '';
    if (msg === 'Invalid login credentials') errorMessage = 'Email ou mot de passe incorrect';
    else if (msg.includes('Email not confirmed')) errorMessage = 'Veuillez confirmer votre email avant de vous connecter';
    else if (msg.includes('Too many requests')) errorMessage = 'Trop de tentatives. Veuillez patienter quelques minutes.';
    else if (msg) errorMessage = msg;
    showToast(errorMessage, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const lastAttempt = sessionStorage.getItem('lastRegisterAttempt');
  if (lastAttempt && Date.now() - parseInt(lastAttempt) < 60000) {
    showToast('Veuillez attendre une minute avant de réessayer', 'warning');
    return;
  }
  sessionStorage.setItem('lastRegisterAttempt', Date.now().toString());
  const firstName = document.getElementById('regFirst')?.value.trim();
  const lastName = document.getElementById('regLast')?.value.trim();
  const companyName = document.getElementById('regCompany')?.value.trim();
  const email = document.getElementById('regEmail')?.value.trim().toLowerCase();
  const password = document.getElementById('regPassword')?.value;
  if (!firstName || !lastName || !companyName || !email || !password) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Adresse e-mail invalide', 'warning'); return; }
  if (password.length < 8) { showToast('Le mot de passe doit contenir au moins 8 caractères', 'warning'); return; }
  if (CONFIG.systemAdmins.some(a => a.email === email)) { showToast('Cet email est réservé', 'error'); return; }
  if (!G.supabase) await initSupabase();
  const btn = document.getElementById('registerBtn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; btn.innerHTML = '<span class="spinner mr-2"></span>Inscription...'; }
  try {
    const companyId = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const { error: compErr } = await G.supabase.from('companies').insert({ id: companyId, name: companyName, plan: 'free' });
    if (compErr) throw compErr;
    const { data, error } = await G.supabase.auth.signUp({
      email, password,
      options: { data: { name: `${firstName} ${lastName}`, company_id: companyId } }
    });
    if (error) throw error;
    if (!data.user) throw new Error('Aucun utilisateur créé');
    const { error: profErr } = await G.supabase.from('profiles').insert({
      id: data.user.id, email: email, name: `${firstName} ${lastName}`,
      role: 'admin', status: 'pending_validation', company_id: companyId, plan: 'free', created_at: new Date().toISOString()
    });
    if (profErr) throw profErr;
    const rootFolderId = `${companyId}_root`;
    await G.supabase.from('folders').insert({ id: rootFolderId, name: 'Racine', parent_id: null, company_id: companyId, created_at: new Date().toISOString() }).catch(() => {});
    showToast('Compte créé ! En attente de validation par un administrateur.', 'success');
    switchAuthTab('login');
    const loginEmail = document.getElementById('loginEmail');
    if (loginEmail) loginEmail.value = email;
  } catch (err) {
    let errorMessage = 'Erreur lors de l\'inscription';
    const msg = err?.message || '';
    if (msg.includes('User already registered') || msg.includes('already been registered')) errorMessage = 'Cet email est déjà utilisé';
    else if (msg.includes('Password should be')) errorMessage = 'Le mot de passe ne respecte pas les critères de sécurité';
    else if (msg) errorMessage = msg;
    showToast(errorMessage, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Créer mon compte'; }
  }
}

async function handleLogout() {
  try { await G.supabase.auth.signOut(); } catch (e) { console.warn(e); }
  G.currentUser = null;
  G.currentCompany = null;
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
  G.currentFolderId = null;
  G.folderPath = [];
  G.selectedFiles = [];
  G.uploadTags = [];
  G._isDemo = false;
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

async function demoLogin() {
  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }
  if (btnText) btnText.innerHTML = '<span class="spinner mr-2"></span>Chargement démo...';
  const DEMO_COMPANY_ID = 'demo_company_001';
  const DEMO_USER_ID = 'demo_user_001';
  G.currentUser = {
    id: DEMO_USER_ID, email: 'demo@systemesged.fr', name: 'Sophie Martin', role: 'admin',
    companyId: DEMO_COMPANY_ID, companyName: 'Entreprise Démo', plan: 'professional',
    status: 'active', isSystemAdmin: false, isDemo: true
  };
  G.currentCompany = { id: DEMO_COMPANY_ID, name: 'Entreprise Démo', plan: 'professional' };
  // Données démo simulées (conserver l'existant)
  const now = new Date();
  const day = (n) => new Date(now - n * 86400000).toISOString();
  G.documents = [
    { id:'ddoc1', name:'Rapport annuel 2024.pdf', type:'pdf', size:2457600, scope:'company', owner_id:DEMO_USER_ID, company_id:DEMO_COMPANY_ID, created_at:day(2), updated_at:day(2), views:24, downloads:8, version:2, tags:['rapport','finance'], is_deleted:false },
    { id:'ddoc2', name:'Contrat fournisseur ABC.docx', type:'word', size:186000, scope:'company', owner_id:DEMO_USER_ID, company_id:DEMO_COMPANY_ID, created_at:day(5), updated_at:day(3), views:12, downloads:3, version:1, tags:['contrat','juridique'], is_deleted:false },
    { id:'ddoc3', name:'Budget Q1 2025.xlsx', type:'excel', size:524000, scope:'company', owner_id:'demo_user_002', company_id:DEMO_COMPANY_ID, created_at:day(7), updated_at:day(7), views:31, downloads:15, version:3, tags:['budget','finance'], is_deleted:false }
  ];
  G.workflows = [
    { id:'dwf1', title:'Validation rapport annuel', status:'pending', priority:'high', document_id:'ddoc1', assignee_id:'demo_user_002', company_id:DEMO_COMPANY_ID, created_at:day(2), due_date:day(-3), description:'Approbation direction requise' }
  ];
  G.users = [
    { id:DEMO_USER_ID, email:'demo@systemesged.fr', name:'Sophie Martin', role:'admin', status:'active', company_id:DEMO_COMPANY_ID, created_at:day(90) },
    { id:'demo_user_002', email:'jean.dupont@demo.fr', name:'Jean Dupont', role:'manager', status:'active', company_id:DEMO_COMPANY_ID, created_at:day(60) }
  ];
  G.tags = [{ id:'dtag1', name:'finance', color:'#3b82f6', count:3, company_id:DEMO_COMPANY_ID }];
  G.folders = [{ id:'dfold1', name:'Finance', parent_id:null, company_id:DEMO_COMPANY_ID, created_at:day(90) }];
  G.shares = [];
  G.signatures = [];
  G.automationRules = [];
  G.apiKeys = [];
  G.backups = [];
  G.auditLogs = [];
  G.systemLogs = [];
  if (typeof _shared !== 'undefined') _shared.publicLinks = [];
  G._isDemo = true;
  G.currentFolderId = null;
  G.currentView = 'dashboard';
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  if (btnText) btnText.innerHTML = '<i class="fas fa-rocket mr-2"></i>Accès démo';
  updateUI();
  switchToMainApp();
  showToast('🎉 Mode démo activé — explorez librement !', 'success');
}

async function oauthLogin(provider) {
  try {
    const { error } = await G.supabase.auth.signInWithOAuth({
      provider: provider.toLowerCase(),
      options: { redirectTo: window.location.origin + '/' }
    });
    if (error) throw error;
  } catch (err) {
    showToast(`Connexion ${provider} non disponible : ${err.message}`, 'error');
  }
}

// Expositions globales
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
window.switchAuthTab = switchAuthTab;
window.togglePwdInput = togglePwdInput;
window.demoLogin = demoLogin;
window.oauthLogin = oauthLogin;
window.loadAllData = loadAllData;
