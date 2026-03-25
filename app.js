// ============================================
// SystemesGED v7.0 – Application complète corrigée
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
  _uploadScope: 'company'
};

// ─── Protection anti-copie et sécurité ───
(function protectApplication() {
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); return false; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) || (e.ctrlKey && (e.key === 'u' || e.key === 'U'))) {
      e.preventDefault();
      return false;
    }
  });
  setInterval(() => {
    const before = new Date();
    debugger;
    const after = new Date();
    if (after - before > 100) console.clear();
  }, 1000);
})();

// ─── Initialisation Supabase ───
async function initSupabase() {
  try {
    if (typeof supabase === 'undefined') throw new Error('Supabase library not loaded');
    G.supabase = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
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
  const { data: existing } = await G.supabase.from('companies').select('id').eq('id', companyId).single();
  if (!existing) {
    await G.supabase.from('companies').insert({ id: companyId, name: companyName, plan: 'enterprise' });
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
  const { error: insertErr } = await G.supabase.from('folders').insert({
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

  const { data: docs } = await G.supabase.from('documents').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
  G.documents = docs || [];
  const { data: wfs } = await G.supabase.from('workflows').select('*').eq('company_id', companyId);
  G.workflows = wfs || [];
  const { data: users } = await G.supabase.from('profiles').select('*').eq('company_id', companyId);
  G.users = users || [];
  const { data: tags } = await G.supabase.from('tags').select('*').eq('company_id', companyId);
  G.tags = tags || [];
  const { data: shares } = await G.supabase.from('shares').select('*, documents!document_id(name)').eq('sender_id', G.currentUser.id);
  G.shares = shares || [];
  const { data: folders } = await G.supabase.from('folders').select('*').eq('company_id', companyId);
  G.folders = folders || [];
  const { data: signatures } = await G.supabase.from('signatures').select('*').eq('signer_id', G.currentUser.id);
  G.signatures = signatures || [];
  const { data: rules } = await G.supabase.from('automation_rules').select('*').eq('company_id', companyId);
  G.automationRules = rules || [];
  const { data: keys } = await G.supabase.from('api_keys').select('*').eq('user_id', G.currentUser.id);
  G.apiKeys = keys || [];
  const { data: backups } = await G.supabase.from('backups').select('*').eq('company_id', companyId);
  G.backups = backups || [];
  const { data: audit } = await G.supabase.from('audit_logs').select('*').eq('user_id', G.currentUser.id).order('created_at', { ascending: false }).limit(50);
  G.auditLogs = audit || [];
  const { data: syslogs } = await G.supabase.from('system_logs').select('*').order('created_at', { ascending: false }).limit(50);
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
  document.querySelectorAll('[data-role="admin-only"]').forEach(el => { el.style.display = isAdmin ? 'flex' : 'none'; });
  document.querySelectorAll('[data-role="manager-only"]').forEach(el => { el.style.display = isManager ? 'flex' : 'none'; });
}

function updateBadges() {
  const docCount = G.documents.filter(d => !d.is_deleted).length;
  const docBadge = document.getElementById('d-docsBadge');
  if (docBadge) { docBadge.textContent = docCount; docBadge.classList.toggle('hidden', docCount === 0); }
  const wfCount = G.workflows.filter(w => ['pending', 'in_review'].includes(w.status)).length;
  const wfBadge = document.getElementById('d-wfBadge');
  if (wfBadge) { wfBadge.textContent = wfCount; wfBadge.classList.toggle('hidden', wfCount === 0); }
}

function updateStorageDisplay() {
  const used = G.documents.reduce((sum, d) => sum + (d.size || 0), 0);
  const limit = CONFIG.plans[G.currentUser.plan].storage;
  const percent = Math.min(100, Math.round((used / limit) * 100));
  const storagePercent = document.getElementById('storagePercent');
  const storageBar = document.getElementById('storageBar');
  const storageText = document.getElementById('storageText');
  if (storagePercent) storagePercent.textContent = `${percent}%`;
  if (storageBar) storageBar.style.width = `${percent}%`;
  if (storageText) storageText.textContent = `${formatBytes(used)} / ${formatBytes(limit)}`;
}

// ─── Authentification ───
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail')?.value.trim().toLowerCase();
  const password = document.getElementById('loginPassword')?.value;
  if (!email || !password) { showToast('Veuillez remplir tous les champs', 'warning'); return; }
  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');
  if (btn) btn.disabled = true;
  if (btnText) btnText.innerHTML = '<span class="spinner mr-2"></span>Connexion...';
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
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner mr-2"></span>Inscription...'; }
  try {
    const companyId = `comp_${Date.now()}`;
    const { error: compErr } = await G.supabase.from('companies').insert({ id: companyId, name: companyName, plan: 'free' });
    if (compErr) throw compErr;
    const { data, error } = await G.supabase.auth.signUp({ email, password, options: { data: { name: `${firstName} ${lastName}`, company_id: companyId } } });
    if (error) throw error;
    const { error: profErr } = await G.supabase.from('profiles').insert({ id: data.user.id, email, name: `${firstName} ${lastName}`, role: 'admin', status: 'pending_validation', company_id: companyId, plan: 'free' });
    if (profErr) throw profErr;
    const rootFolderId = `${companyId}_root`;
    const { error: folderErr } = await G.supabase.from('folders').insert({ id: rootFolderId, name: 'Racine', parent_id: null, company_id: companyId, created_at: new Date().toISOString() });
    if (folderErr) console.warn('Erreur création dossier racine:', folderErr);
    showToast('Compte créé ! En attente de validation.', 'success');
    switchAuthTab('login');
    const loginEmail = document.getElementById('loginEmail');
    if (loginEmail) loginEmail.value = email;
  } catch (err) {
    console.error(err);
    showToast('Erreur inscription: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Créer mon compte'; }
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

// ─── Dashboard (fonctions raccourcies pour lisibilité, inchangées)
function renderDashboard() { /* ... identique à votre version ... */ }
function renderActivityList() { /* ... */ }
function getActionIcon(action) { /* ... */ }
function renderQuickAccess() { /* ... */ }
function renderPopularTags() { /* ... */ }
function renderTeamDocs() { /* ... */ }
function renderMyWorkflows() { /* ... */ }

// ─── Documents (inchangé)
function renderDocuments() { /* ... */ }
function renderDocCard(doc) { /* ... */ }
function renderDocListItem(doc) { /* ... */ }
function switchDocsTab(tab) { /* ... */ }
function toggleViewMode() { /* ... */ }
function applyFilters() { /* ... */ }
function clearFilters() { /* ... */ }
function filterByType(type) { /* ... */ }
function filterByTag(tagName) { /* ... */ }

// ─── Upload (corrigé)
function openUploadModal() { /* ... identique */ }
function closeUploadModal() { /* ... */ }
function handleDragOver(e, zoneId) { /* ... */ }
function handleDragLeave(e, zoneId) { /* ... */ }
function handleDrop(e, zoneId) { /* ... */ }
function handleDocDrop(e) {
  e.preventDefault();
  const dropZone = document.getElementById('docDropZone');
  if (dropZone) dropZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  addFilesToSelection(files);
  uploadDocument(); // ← déclenche l'upload immédiatement
}
function handleFileSelect(e) { /* ... */ }
function handleFilePickerSelect(e) { /* ... */ }
function addFilesToSelection(files) { /* ... */ }
function renderSelectedFiles() { /* ... */ }
function removeFileFromSelection(idx) { /* ... */ }
function addUploadTag() { /* ... */ }
function renderUploadTags() { /* ... */ }
function removeUploadTag(idx) { /* ... */ */
}
async function uploadDocument() {
  if (G.selectedFiles.length === 0) {
    showToast('Veuillez sélectionner au moins un fichier', 'warning');
    return;
  }
  // Vérifier et recréer le dossier racine si nécessaire
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
      const { error: uploadErr } = await G.supabase.storage.from(CONFIG.storageBucket).upload(storagePath, file);
      if (uploadErr) throw uploadErr;
      const { data: publicUrl } = G.supabase.storage.from(CONFIG.storageBucket).getPublicUrl(storagePath);
      const doc = {
        id: docId, name: file.name, type: getFileType(file.name), size: file.size, description: '',
        scope: G._uploadScope || 'company', owner_id: G.currentUser.id, company_id: G.currentUser.companyId,
        folder_id: folderId, tags: G.uploadTags, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        version: 1, views: 0, downloads: 0, is_deleted: false, deleted_at: null, content: '',
        storage_path: storagePath, file_url: publicUrl.publicUrl
      };
      const { error: dbErr } = await G.supabase.from('documents').insert(doc);
      if (dbErr) throw dbErr;
      G.documents.unshift(doc);
      showToast(`${file.name} importé avec succès`, 'success');
    } catch (err) {
      console.error('Upload error:', err);
      showToast(`Erreur: ${err.message}`, 'error');
    }
  }
  G.selectedFiles = []; // vider la sélection
  closeUploadModal();
  renderDocuments();
  updateBadges();
  updateStorageDisplay();
}
function setDocScope(scope) { /* ... */ }

// ─── Preview (corrigé)
function openPreviewModal(docId) {
  G.currentDocId = docId;
  const modal = document.getElementById('previewModal');
  if (modal) modal.classList.remove('hidden');
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  document.getElementById('previewTitle').textContent = doc.name;
  const fileUrl = doc.file_url;
  const fileType = doc.type;
  const previewFrame = document.getElementById('previewFrame');
  const previewImage = document.getElementById('previewImage');
  const previewContent = document.getElementById('previewContent');
  if (fileType === 'pdf') {
    previewFrame.src = fileUrl;
    previewFrame.classList.remove('hidden');
    previewImage.classList.add('hidden');
    previewContent.classList.add('hidden');
  } else if (['jpg','jpeg','png','gif'].includes(fileType)) {
    previewImage.src = fileUrl;
    previewImage.classList.remove('hidden');
    previewFrame.classList.add('hidden');
    previewContent.classList.add('hidden');
  } else {
    previewFrame.classList.add('hidden');
    previewImage.classList.add('hidden');
    previewContent.classList.remove('hidden');
  }
}
function closePreviewModal() { /* ... */ }
async function downloadDocument(docId) { /* ... */ }
function downloadCurrentDocument() { /* ... */ }
function shareCurrentDocument() { /* ... */ }
async function deleteDocument(docId) { /* ... */ }

// ─── Partages (ajout partage externe)
function openShareModal(docId) { /* ... */ }
function closeShareModal() { /* ... */ }
async function shareDocument() { /* ... identique à votre version */ }
async function revokeShare(shareId) { /* ... */ }
async function loadShareHistory() { /* ... */ }
function switchSharedTab(tab) { /* ... */ }
function renderShared() { /* ... */ }
async function generatePublicLink(docId, expiresInDays = 7) {
  try {
    const token = generateId();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    // Créer une table public_shares si nécessaire (à exécuter une fois en SQL)
    const { error } = await G.supabase.from('public_shares').insert({
      document_id: docId,
      token: token,
      expires_at: expiresAt.toISOString(),
      created_by: G.currentUser.id
    });
    if (error) throw error;
    const shareUrl = `${window.location.origin}/public/${token}`;
    showToast(`Lien public : ${shareUrl}`, 'success');
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
// ─── Collaboration Realtime (fonctions)
let collabChannel = null;
function startCollaboration(docId) {
  if (collabChannel) collabChannel.unsubscribe();
  collabChannel = G.supabase.channel(`doc:${docId}`)
    .on('broadcast', { event: 'update' }, (payload) => {
      const editor = document.getElementById('collabEditorArea');
      if (editor && editor !== document.activeElement) {
        editor.value = payload.payload.content;
      }
    })
    .subscribe();
}
function broadcastContent(content) {
  if (collabChannel) {
    collabChannel.send({ type: 'broadcast', event: 'update', payload: { content } });
  }
}

// ─── Workflows (corrigé affichage étapes)
function renderWorkflows() { /* ... */ }
function getWfStatusClass(status) { /* ... */ }
function getWfStatusLabel(status) { /* ... */ }
function getWfStatusColor(status) { /* ... */ }
function openCreateWorkflowModal() { /* ... */ }
function closeWorkflowModal() { /* ... */ }
async function createWorkflow(e) { /* ... identique */ }
async function actOnWorkflow(action, comment) { /* ... */ }
function openWfDetail(wfId) {
  G.currentWfId = wfId;
  const modal = document.getElementById('wfDetailModal');
  if (modal) modal.classList.remove('hidden');
  const wf = G.workflows.find(w => w.id === wfId);
  if (wf) {
    document.getElementById('wfDetailTitle').textContent = wf.title;
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
          </div>
        `).join('');
        const progress = ((wf.current_step + 1) / wf.steps.length) * 100;
        document.getElementById('wfDetailProgressBar').style.width = `${progress}%`;
        document.getElementById('wfDetailProgress').textContent = `${Math.round(progress)}%`;
      } else {
        stepsContainer.innerHTML = '<p class="text-blue-300/50 text-sm">Aucune étape définie</p>';
      }
    }
    loadWorkflowHistory(wfId);
  }
}
async function loadWorkflowHistory(wfId) { /* ... */ }
async function addWfComment() { /* ... */ }
function getActionLabel(action) { /* ... */ }
function closeWfDetail() { /* ... */ }
function filterWorkflows(status) { /* ... */ }
function searchWorkflows(query) { /* ... */ }
function setWfView(view) { /* ... */ }
function renderWorkflowsList() { /* ... */ }

// ─── Users (avec reset password)
function renderUsers() { /* ... */ }
function getRoleBadgeClass(role) { /* ... */ }
function openCreateUserModal() { /* ... */ }
function closeAddUserModal() { /* ... */ }
async function addUser(e) { /* ... identique */ }
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
async function validateUser(userId) { /* ... */ }
async function deleteUser(userId) { /* ... */ }
function renderPendingUsers() { /* ... */ }
function refreshPendingUsers() { /* ... */ }
function canValidateUsers() { return G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin; }
function updatePendingUsersCount() { /* ... */ }
function generatePassword() { /* ... */ }

// ─── Modal réinitialisation
function openResetModal() {
  document.getElementById('resetPasswordModal').classList.remove('hidden');
  document.getElementById('resetEmail').value = '';
  document.getElementById('resetMessage').innerHTML = '';
}
function closeResetModal() {
  document.getElementById('resetPasswordModal').classList.add('hidden');
}
async function sendResetEmail() {
  const email = document.getElementById('resetEmail').value.trim();
  if (!email) {
    showToast('Veuillez saisir votre email', 'warning');
    return;
  }
  const { error } = await G.supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/update-password.html`,
  });
  const msgDiv = document.getElementById('resetMessage');
  if (error) {
    msgDiv.innerHTML = `<span class="text-red-400">Erreur : ${error.message}</span>`;
  } else {
    msgDiv.innerHTML = `<span class="text-green-400">✅ Un email de réinitialisation vous a été envoyé.</span>`;
    setTimeout(() => closeResetModal(), 3000);
  }
}

// ─── Tags (inchangé)
function renderTags() { /* ... */ }
async function createTag() { /* ... */ }
async function deleteTag(tagId) { /* ... */ }

// ─── Dossiers (inchangé)
function renderFolders() { /* ... */ }
function renderFolderContents() { /* ... */ }
function openFolder(id, name) { /* ... */ }
function updateFolderBreadcrumb() { /* ... */ }
function openFolderModal() { /* ... */ }
function closeFolderModal() { /* ... */ }
async function createFolder() { /* ... */ }
async function moveDocument(docId, newFolderId) { /* ... */ }

// ─── Settings, Billing, Security (inchangés)
function renderSettings() { /* ... */ }
async function saveProfile() { /* ... */ }
function toggleSetting(setting) { /* ... */ }
function renderBilling() { /* ... */ }
function selectPlan(planKey, element) { /* ... */ }
function simulateUpgrade() { /* ... */ }
function renderBillingV6() { renderBilling(); }
function renderSecurity() { /* ... */ }
function exportAuditLog() { /* ... */ }
function exportAllData() { /* ... */ }
function exportDocumentsCsv() { /* ... */ }
function switchSecurityTab(tab) { /* ... */ }
function loadDeletedDocs() { /* ... */ }
async function restoreDocument(docId) { /* ... */ }
function generateApiKey() { /* ... */ }

// ─── Logs
function renderSysLogs() { /* ... */ }
function getLogLevelColor(level) { /* ... */ }
function filterLogs(level) { /* ... */ }
function clearSysLogs() { /* ... */ }
function exportSysLogs() { /* ... */ }

// ─── RBAC
function renderRBAC() { /* ... */ }
function openRoleModal(roleKey) { /* ... */ }
function closeRoleModal() { /* ... */ }
function saveRole() { /* ... */ }
function renderRBACV7() { renderRBAC(); }
function createRoleV7() { /* ... */ }

// ─── Analytics, Signatures, AI, Automation, Integrations, Backups, API Keys
function renderAnalytics() { /* ... */ }
function refreshAnalytics() { /* ... */ }
function renderSignatures() { /* ... */ }
function getSigStatusClass(status) { /* ... */ }
function openSignModal() { /* ... */ }
function closeSignModal() { /* ... */ }
function clearSignature() { /* ... */ }
async function submitSignature() { /* ... */ }
function renderAI() { /* ... */ }
function analyzeDocument(docId) { /* ... */ }
function analyzeAllDocuments() { /* ... */ }
function renderAutomation() { /* ... */ }
function openWfRuleModal() { /* ... */ }
function closeWfRuleModal() { /* ... */ }
async function createWfRule(e) { /* ... */ }
function renderIntegrations() { /* ... */ }
function renderBackups() { /* ... */ }
async function createBackup(type) { /* ... */ }
function restoreBackup(id) { /* ... */ }
function renderApiKeys() { /* ... */ }
function generateApiKeyV6() { generateApiKey(); }
async function revokeApiKey(id) { /* ... */ }

// ─── Search
function handleGlobalSearch(query) { /* ... */ }
function runAdvSearch() { /* ... */ }
function clearAdvSearch() { /* ... */ }
function runFTSearch() { /* ... */ }
function renderAdvancedSearch() { runAdvSearch(); }
function renderVersioning() { /* ... */ }
function restoreVersion(docId) { /* ... */ }
function renderSearchV7() { runFTSearch(); }
function renderAuditV6() { /* ... */ }
function setAuditFilter(type, value) { /* ... */ }

// ─── Rich Editor
function openRichEditor(docId) { showToast('Éditeur riche en développement', 'info'); }
function closeRichEditor() { /* ... */ }
function _onRichEditorInput() {}
function _saveRichContent() {}

// ─── Utilitaires
function generateId() { return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15); }
function formatBytes(bytes, decimals = 2) { /* ... */ }
function formatDate(dateString) { /* ... */ }
function getFileIcon(type) { /* ... */ }
function getFileType(filename) { /* ... */ }
function showToast(message, type = 'info', duration = 3000) { /* ... */ }
function handleDocDragStart(e, docId) { e.dataTransfer.setData('text/plain', docId); }
function showDocContextMenu(e, docId) { e.preventDefault(); if (confirm('Supprimer ce document ?')) deleteDocument(docId); }

// ─── Notifications (placeholders)
function toggleNotifications() { /* ... */ }
function markAllNotifRead() { /* ... */ }

// ─── Fonctions pour menus non implémentés
function notImplementedYet(menuName) {
  showToast(`La fonctionnalité "${menuName}" est en développement.`, 'info');
}
function renderApiKeys() { notImplementedYet('Clés API'); }
function renderBackups() { notImplementedYet('Sauvegardes'); }
function renderAuditV6() { notImplementedYet('Audit Sécurité Avancé'); }
function renderBillingV6() { notImplementedYet('Abonnement v6'); }

// ─── Initialisation
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

  // Exposer globalement les fonctions essentielles
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
  window.shareDocument = shareDocument;
  window.revokeShare = revokeShare;
  window.loadShareHistory = loadShareHistory;
  window.switchSharedTab = switchSharedTab;
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
  window.renderAI = renderAI;
  window.analyzeDocument = analyzeDocument;
  window.analyzeAllDocuments = analyzeAllDocuments;
  window.renderAutomation = renderAutomation;
  window.openWfRuleModal = openWfRuleModal;
  window.closeWfRuleModal = closeWfRuleModal;
  window.createWfRule = createWfRule;
  window.renderIntegrations = renderIntegrations;
  window.renderBackups = renderBackups;
  window.createBackup = createBackup;
  window.restoreBackup = restoreBackup;
  window.renderApiKeys = renderApiKeys;
  window.generateApiKeyV6 = generateApiKeyV6;
  window.revokeApiKey = revokeApiKey;
  window.renderBillingV6 = renderBillingV6;
  window.renderAuditV6 = renderAuditV6;
  window.handleGlobalSearch = handleGlobalSearch;
  window.runAdvSearch = runAdvSearch;
  window.clearAdvSearch = clearAdvSearch;
  window.runFTSearch = runFTSearch;
  window.renderAdvancedSearch = renderAdvancedSearch;
  window.renderVersioning = renderVersioning;
  window.renderSearchV7 = renderSearchV7;
  window.renderRBACV7 = renderRBACV7;
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
  window.startCollaboration = startCollaboration;
  window.broadcastContent = broadcastContent;
  window.copyShareLink = copyShareLink;
});
