// SystemesGED v5.0 - Application principale (CORRIGÉ)
// ============================================

// ─── Configuration & État global ───
const CONFIG = {
  supabaseUrl: 'https://spgtflhprppeoidjguhs.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwZ3RmbGhwcnBwZW9pZGpndWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDQwMDAwMDAsImV4cCI6MjAxOTU3NjAwMH0.demo_key',
  maxFileSize: 100 * 1024 * 1024, // 100 MB
  defaultPlan: 'free',
  plans: {
    free: { name: 'Free', price: 0, users: 5, storage: 1024 * 1024 * 1024, features: ['basic'] },
    starter: { name: 'Starter', price: 29, users: 20, storage: 10 * 1024 * 1024 * 1024, features: ['basic', 'versioning'] },
    professional: { name: 'Professional', price: 79, users: 100, storage: 100 * 1024 * 1024 * 1024, features: ['basic', 'versioning', 'rbac', 'audit'] },
    enterprise: { name: 'Enterprise', price: null, users: Infinity, storage: Infinity, features: ['all'] }
  }
};

// État global
window.G = {
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
  auditLog: [],
  sysLogs: [],
  roles: {
    admin: { name: 'Administrateur', perms: ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing'] },
    manager: { name: 'Manager', perms: ['read', 'write', 'delete', 'users'] },
    editor: { name: 'Éditeur', perms: ['read', 'write'] },
    viewer: { name: 'Lecteur', perms: ['read'] }
  },
  currentView: 'dashboard',
  docsTab: 'company',
  sharedTab: 'received',
  wfFilter: '',
  wfView: 'kanban',
  logFilter: 'all',
  auditFilter: { days: 30, severity: '', action: '' },
  viewMode: 'grid',
  selectedFiles: [],
  uploadTags: [],
  currentDocId: null,
  currentWfId: null,
  currentFolderId: '__root__',
  folderPath: [{ id: '__root__', name: 'Racine' }],
  collab: { docId: null, content: '', lastSaved: null, cursors: {} },
  richEditor: { docId: null, content: '' },
  signaturePad: null,
  dragState: { isDragging: false, sourceId: null, sourceType: null },
  notifications: [],
  unreadCount: 0,
  searchResults: [],
  analytics: { data: null, lastUpdate: null },
  aiAnalysis: { queue: [], results: {} }
};

// ─── Initialisation Supabase ───
let SB = null;
try {
  SB = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
  window.SB = SB;
} catch (e) {
  console.error('Erreur init Supabase:', e);
  showToast('Erreur de connexion au service', 'error');
}

// ─── Utilitaires ───
function generateId() { return Math.random().toString(36).substring(2) + Date.now().toString(36); }
function formatBytes(bytes) { if (bytes === 0) return '0 Bytes'; const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]; }
function formatDate(date) { if (!date) return '-'; const d = new Date(date); return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
function getFileIcon(type) { const icons = { pdf: 'fa-file-pdf text-red-400', doc: 'fa-file-word text-blue-400', xls: 'fa-file-excel text-green-400', img: 'fa-file-image text-purple-400', txt: 'fa-file-alt text-gray-400', zip: 'fa-file-archive text-yellow-400' }; return icons[type] || 'fa-file text-blue-400'; }
function getFileType(filename) { const ext = filename.split('.').pop().toLowerCase(); const types = { pdf: ['pdf'], doc: ['doc', 'docx', 'odt'], xls: ['xls', 'xlsx', 'csv'], img: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'], txt: ['txt', 'md', 'json', 'xml'], zip: ['zip', 'rar', '7z', 'tar', 'gz'] }; for (const [type, exts] of Object.entries(types)) if (exts.includes(ext)) return type; return 'file'; }
function sanitizeFilename(name) { return name.replace(/[^a-zA-Z0-9.-]/g, '_'); }
function debounce(fn, ms) { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => fn(...args), ms); }; }

// ─── Notifications (Toast) ───
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  const icons = { success: 'fa-check-circle text-green-400', error: 'fa-times-circle text-red-400', warning: 'fa-exclamation-triangle text-yellow-400', info: 'fa-info-circle text-blue-400' };
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info} text-lg"></i><span class="flex-1 text-sm">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 300); }, duration);
}

// ─── Gestion des logs système ───
function addSysLog(level, message, meta = {}) {
  const entry = { id: generateId(), timestamp: new Date().toISOString(), level, message, meta };
  G.sysLogs.unshift(entry);
  if (G.sysLogs.length > 1000) G.sysLogs.pop();
  if (document.getElementById('view-logs')?.classList.contains('active-view')) renderSysLogs();
  if (level === 'error' || level === 'security') {
    G.notifications.unshift({ id: generateId(), type: level, message, timestamp: entry.timestamp, read: false });
    G.unreadCount++;
    updateNotifBadge();
  }
}

function logInfo(msg, meta) { addSysLog('info', msg, meta); }
function logWarn(msg, meta) { addSysLog('warn', msg, meta); }
function logError(msg, meta) { addSysLog('error', msg, meta); }
function logSecurity(msg, meta) { addSysLog('security', msg, meta); }

// ─── Audit Log ───
function addAudit(action, targetType, targetId, details = {}) {
  const entry = { id: generateId(), userId: G.currentUser?.id, userEmail: G.currentUser?.email, action, targetType, targetId, details, timestamp: new Date().toISOString(), ip: 'client-side' };
  G.auditLog.unshift(entry);
  if (G.auditLog.length > 5000) G.auditLog.pop();
  logInfo(`Audit: ${action} ${targetType}`, { targetId });
}

// ─── Authentification ───
function switchAuthTab(tab) {
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
  document.getElementById('loginFormWrapper').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('registerFormWrapper').style.display = tab === 'register' ? 'block' : 'none';
}

function togglePwdInput(id, btn) {
  const input = document.getElementById(id);
  const icon = btn.querySelector('i');
  input.type = input.type === 'password' ? 'text' : 'password';
  icon.className = input.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');
  btn.disabled = true;
  btnText.innerHTML = '<span class="spinner mr-2"></span>Connexion...';
  
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  
  try {
    await simulateNetworkDelay(800);
    const user = await mockAuthLogin(email, password);
    if (user) {
      G.currentUser = user;
      G.currentCompany = await loadCompany(user.companyId);
      await initializeApp();
      showToast('Connexion réussie', 'success');
      addAudit('login', 'user', user.id);
    } else {
      showToast('Identifiants incorrects', 'error');
    }
  } catch (err) {
    logError('Erreur login', { error: err.message });
    showToast('Erreur de connexion', 'error');
  } finally {
    btn.disabled = false;
    btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const data = {
    firstName: document.getElementById('regFirst').value,
    lastName: document.getElementById('regLast').value,
    company: document.getElementById('regCompany').value,
    email: document.getElementById('regEmail').value,
    password: document.getElementById('regPassword').value
  };
  
  try {
    await simulateNetworkDelay(1000);
    const user = await mockAuthRegister(data);
    G.currentUser = user;
    G.currentCompany = await loadCompany(user.companyId);
    await initializeApp();
    showToast('Compte créé avec succès', 'success');
    addAudit('register', 'user', user.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function demoLogin() {
  document.getElementById('loginEmail').value = 'demo@systemesged.fr';
  document.getElementById('loginPassword').value = 'Admin123!';
  handleLogin(new Event('submit'));
}

function oauthLogin(provider) {
  showToast(`Connexion ${provider}...`, 'info');
  setTimeout(() => {
    const mockUser = { id: generateId(), email: `oauth_${provider}@demo.fr`, name: `User ${provider}`, role: 'admin', companyId: 'demo_company', plan: 'professional' };
    G.currentUser = mockUser;
    G.currentCompany = { id: 'demo_company', name: 'Entreprise Démo', plan: 'professional' };
    initializeApp();
    showToast(`Connecté via ${provider}`, 'success');
  }, 1500);
}

async function mockAuthLogin(email, password) {
  if (email === 'demo@systemesged.fr' && password === 'Admin123!') {
    return { id: 'user_demo', email, name: 'Administrateur Démo', role: 'admin', companyId: 'demo_company', plan: 'professional', createdAt: new Date().toISOString() };
  }
  const stored = localStorage.getItem(`user_${email}`);
  if (stored) {
    const user = JSON.parse(stored);
    if (user.password === password) return user;
  }
  return null;
}

async function mockAuthRegister(data) {
  const existing = localStorage.getItem(`user_${data.email}`);
  if (existing) throw new Error('Cet email est déjà utilisé');
  
  const user = {
    id: generateId(),
    email: data.email,
    name: `${data.firstName} ${data.lastName}`,
    role: 'admin',
    companyId: generateId(),
    plan: 'free',
    createdAt: new Date().toISOString(),
    password: data.password
  };
  
  localStorage.setItem(`user_${data.email}`, JSON.stringify(user));
  localStorage.setItem(`company_${user.companyId}`, JSON.stringify({
    id: user.companyId,
    name: data.company,
    plan: 'free',
    createdAt: new Date().toISOString()
  }));
  
  return user;
}

function handleLogout() {
  addAudit('logout', 'user', G.currentUser?.id);
  G.currentUser = null;
  G.currentCompany = null;
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'block';
  showToast('Déconnexion réussie', 'info');
}

async function loadCompany(companyId) {
  const stored = localStorage.getItem(`company_${companyId}`);
  if (stored) return JSON.parse(stored);
  return { id: companyId, name: 'Mon Entreprise', plan: 'free' };
}

// ─── Initialisation Application ───
async function initializeApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  
  updateUserDisplay();
  await loadInitialData();
  switchView('dashboard');
  startRealtimeSync();
  logInfo('Application initialisée', { user: G.currentUser?.id });
}

function updateUserDisplay() {
  if (!G.currentUser) return;
  document.getElementById('userNameDisplay').textContent = G.currentUser.name;
  document.getElementById('userRoleDisplay').textContent = G.roles[G.currentUser.role]?.name || G.currentUser.role;
  document.getElementById('userAvatarInitial').textContent = G.currentUser.name.charAt(0).toUpperCase();
  document.getElementById('dropdownUserName').textContent = G.currentUser.name;
  document.getElementById('dropdownUserEmail').textContent = G.currentUser.email;
  document.getElementById('companyNameLabel').textContent = G.currentCompany?.name || 'Entreprise';
  document.getElementById('companyPlanLabel').textContent = `Plan ${G.currentCompany?.plan || 'free'}`;
  document.getElementById('companyAvatar').textContent = (G.currentCompany?.name || 'E').charAt(0).toUpperCase();
  
  const planBadge = document.getElementById('planBadge');
  planBadge.className = `hidden sm:inline badge-plan badge-${G.currentUser.plan || 'free'}`;
  planBadge.textContent = (G.currentUser.plan || 'free').toUpperCase();
}

async function loadInitialData() {
  await Promise.all([loadDocuments(), loadWorkflows(), loadUsers(), loadTags(), loadShares(), loadFolders(), loadSignatures(), loadAutomationRules(), loadApiKeys(), loadBackups()]);
  updateStorageDisplay();
  updateBadges();
}

async function simulateNetworkDelay(ms = 500) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Données Mock ───
async function loadDocuments() {
  await simulateNetworkDelay(300);
  const stored = localStorage.getItem(`docs_${G.currentUser?.companyId}`);
  if (stored) {
    G.documents = JSON.parse(stored);
  } else {
    G.documents = generateMockDocuments();
    saveDocuments();
  }
  return G.documents;
}

function generateMockDocuments() {
  const docs = [];
  const types = ['pdf', 'doc', 'xls', 'img', 'txt'];
  const names = ['Contrat', 'Facture', 'Rapport', 'Présentation', 'Devis', 'Proposition', 'CV', 'Note', 'Réunion', 'Projet'];
  
  for (let i = 0; i < 12; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const name = `${names[Math.floor(Math.random() * names.length)]}_${i + 1}.${type === 'pdf' ? 'pdf' : type === 'doc' ? 'docx' : type === 'xls' ? 'xlsx' : type === 'img' ? 'png' : 'txt'}`;
    docs.push({
      id: generateId(),
      name,
      type,
      size: Math.floor(Math.random() * 10 * 1024 * 1024) + 1024,
      description: `Document ${i + 1}`,
      scope: Math.random() > 0.3 ? 'company' : 'personal',
      ownerId: G.currentUser?.id,
      companyId: G.currentUser?.companyId,
      folderId: '__root__',
      tags: [],
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      views: Math.floor(Math.random() * 100),
      downloads: Math.floor(Math.random() * 20),
      isDeleted: false,
      deletedAt: null
    });
  }
  return docs;
}

function saveDocuments() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`docs_${G.currentUser.companyId}`, JSON.stringify(G.documents));
  }
}

async function loadWorkflows() {
  await simulateNetworkDelay(200);
  const stored = localStorage.getItem(`workflows_${G.currentUser?.companyId}`);
  G.workflows = stored ? JSON.parse(stored) : [];
  return G.workflows;
}

function saveWorkflows() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`workflows_${G.currentUser.companyId}`, JSON.stringify(G.workflows));
  }
}

async function loadUsers() {
  await simulateNetworkDelay(200);
  const stored = localStorage.getItem(`users_${G.currentUser?.companyId}`);
  if (stored) {
    G.users = JSON.parse(stored);
  } else {
    G.users = [{
      id: G.currentUser.id,
      email: G.currentUser.email,
      name: G.currentUser.name,
      role: 'admin',
      status: 'active',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    }];
    saveUsers();
  }
  return G.users;
}

function saveUsers() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`users_${G.currentUser.companyId}`, JSON.stringify(G.users));
  }
}

async function loadTags() {
  await simulateNetworkDelay(100);
  const stored = localStorage.getItem(`tags_${G.currentUser?.companyId}`);
  G.tags = stored ? JSON.parse(stored) : [
    { id: generateId(), name: 'Important', color: '#ef4444', count: 0 },
    { id: generateId(), name: 'Urgent', color: '#f97316', count: 0 },
    { id: generateId(), name: 'Contrat', color: '#3b82f6', count: 0 },
    { id: generateId(), name: 'Archivé', color: '#6b7280', count: 0 }
  ];
  return G.tags;
}

function saveTags() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`tags_${G.currentUser.companyId}`, JSON.stringify(G.tags));
  }
}

async function loadShares() {
  await simulateNetworkDelay(200);
  const stored = localStorage.getItem(`shares_${G.currentUser?.companyId}`);
  G.shares = stored ? JSON.parse(stored) : [];
  return G.shares;
}

function saveShares() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`shares_${G.currentUser.companyId}`, JSON.stringify(G.shares));
  }
}

async function loadFolders() {
  await simulateNetworkDelay(150);
  const stored = localStorage.getItem(`folders_${G.currentUser?.companyId}`);
  G.folders = stored ? JSON.parse(stored) : [
    { id: '__root__', name: 'Racine', parentId: null, createdAt: new Date().toISOString() },
    { id: generateId(), name: 'Contrats', parentId: '__root__', createdAt: new Date().toISOString() },
    { id: generateId(), name: 'Factures', parentId: '__root__', createdAt: new Date().toISOString() }
  ];
  return G.folders;
}

function saveFolders() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`folders_${G.currentUser.companyId}`, JSON.stringify(G.folders));
  }
}

async function loadSignatures() {
  await simulateNetworkDelay(100);
  const stored = localStorage.getItem(`signatures_${G.currentUser?.companyId}`);
  G.signatures = stored ? JSON.parse(stored) : [];
  return G.signatures;
}

function saveSignatures() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`signatures_${G.currentUser.companyId}`, JSON.stringify(G.signatures));
  }
}

async function loadAutomationRules() {
  await simulateNetworkDelay(100);
  const stored = localStorage.getItem(`automation_${G.currentUser?.companyId}`);
  G.automationRules = stored ? JSON.parse(stored) : [];
  return G.automationRules;
}

function saveAutomationRules() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`automation_${G.currentUser.companyId}`, JSON.stringify(G.automationRules));
  }
}

async function loadApiKeys() {
  await simulateNetworkDelay(100);
  const stored = localStorage.getItem(`apikeys_${G.currentUser?.id}`);
  G.apiKeys = stored ? JSON.parse(stored) : [];
  return G.apiKeys;
}

function saveApiKeys() {
  if (G.currentUser?.id) {
    localStorage.setItem(`apikeys_${G.currentUser.id}`, JSON.stringify(G.apiKeys));
  }
}

async function loadBackups() {
  await simulateNetworkDelay(100);
  const stored = localStorage.getItem(`backups_${G.currentUser?.companyId}`);
  G.backups = stored ? JSON.parse(stored) : [];
  return G.backups;
}

function saveBackups() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`backups_${G.currentUser.companyId}`, JSON.stringify(G.backups));
  }
}

// ─── Navigation ───
function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active-view');
  
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll(`[data-view="${viewName}"]`).forEach(el => el.classList.add('active'));
  
  document.querySelectorAll('[data-bnav]').forEach(el => {
    el.classList.toggle('text-blue-400', el.dataset.bnav === viewName);
    el.classList.toggle('text-blue-400/60', el.dataset.bnav !== viewName);
  });
  
  G.currentView = viewName;
  closeMobileSidebar();
  
  switch(viewName) {
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
  }
  
  addAudit('view_change', 'view', viewName);
}

function openMobileSidebar() {
  document.getElementById('mobileSidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('active');
}

function closeMobileSidebar() {
  document.getElementById('mobileSidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}

// ─── Dashboard ───
function renderDashboard() {
  const totalDocs = G.documents.filter(d => !d.isDeleted).length;
  const companyDocs = G.documents.filter(d => !d.isDeleted && d.scope === 'company').length;
  const personalDocs = G.documents.filter(d => !d.isDeleted && d.scope === 'personal').length;
  const activeWorkflows = G.workflows.filter(w => ['pending', 'in_review'].includes(w.status)).length;
  const sharedCount = G.shares.filter(s => s.status === 'active').length;
  const userCount = G.users.length;
  
  document.getElementById('totalDocs').textContent = totalDocs;
  document.getElementById('dashWorkflowCount').textContent = activeWorkflows;
  document.getElementById('sharedCount').textContent = sharedCount;
  document.getElementById('dashUserCount').textContent = userCount;
  
  const storageUsed = G.documents.filter(d => !d.isDeleted).reduce((sum, d) => sum + (d.size || 0), 0);
  const storageLimit = CONFIG.plans[G.currentUser?.plan || 'free'].storage;
  const storagePercent = Math.min(100, Math.round((storageUsed / storageLimit) * 100));
  
  document.getElementById('storagePercent').textContent = `${storagePercent}%`;
  document.getElementById('storageBar').style.width = `${storagePercent}%`;
  document.getElementById('storageText').textContent = `${formatBytes(storageUsed)} / ${formatBytes(storageLimit)}`;
  
  document.getElementById('mobileStoragePercent').textContent = `${storagePercent}%`;
  document.getElementById('mobileStorageBar').style.width = `${storagePercent}%`;
  document.getElementById('mobileStorageText').textContent = `${formatBytes(storageUsed)} / ${formatBytes(storageLimit)}`;
  
  renderActivityList();
  renderQuickAccess();
  renderPopularTags();
  renderTeamDocs();
  renderMyWorkflows();
  
  document.getElementById('dashTotalViews').textContent = G.documents.reduce((sum, d) => sum + (d.views || 0), 0);
  document.getElementById('dashActiveUsers').textContent = G.users.filter(u => u.status === 'active').length;
}

function renderActivityList() {
  const list = document.getElementById('activityList');
  const activities = G.auditLog.slice(0, 10);
  
  if (activities.length === 0) {
    list.innerHTML = '<div class="text-center py-8 text-blue-300/50"><i class="fas fa-folder-open text-2xl mb-2 block"></i>Aucune activité récente</div>';
    return;
  }
  
  list.innerHTML = activities.map(act => `
    <div class="flex items-center gap-3 p-3 rounded-xl bg-blue-900/20 border border-blue-500/10">
      <div class="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 text-xs">
        <i class="fas ${getActionIcon(act.action)}"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white truncate">${act.action} ${act.targetType}</p>
        <p class="text-xs text-blue-300/60">${formatDate(act.timestamp)}</p>
      </div>
    </div>
  `).join('');
}

function getActionIcon(action) {
  const icons = { login: 'fa-sign-in-alt', logout: 'fa-sign-out-alt', upload: 'fa-upload', download: 'fa-download', share: 'fa-share', delete: 'fa-trash', restore: 'fa-undo', view_change: 'fa-eye' };
  return icons[action] || 'fa-circle';
}

function renderQuickAccess() {
  const pdfCount = G.documents.filter(d => !d.isDeleted && d.type === 'pdf').length;
  const docCount = G.documents.filter(d => !d.isDeleted && d.type === 'doc').length;
  document.getElementById('quickPdfCount').textContent = `${pdfCount} fichier(s)`;
  document.getElementById('quickDocCount').textContent = `${docCount} fichier(s)`;
}

function renderPopularTags() {
  const container = document.getElementById('popularTags');
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
  const docs = G.documents.filter(d => !d.isDeleted && d.scope === 'company').slice(0, 5);
  
  if (docs.length === 0) {
    list.innerHTML = '<p class="text-blue-300/50 text-sm text-center py-3">Aucun document</p>';
    return;
  }
  
  list.innerHTML = docs.map(doc => `
    <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-500/10 cursor-pointer" onclick="openPreviewModal('${doc.id}')">
      <div class="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center ${getFileIcon(doc.type).split(' ')[1]}">
        <i class="fas ${getFileIcon(doc.type).split(' ')[0]}"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white truncate">${doc.name}</p>
        <p class="text-xs text-blue-300/60">${formatDate(doc.createdAt)}</p>
      </div>
    </div>
  `).join('');
}

function renderMyWorkflows() {
  const list = document.getElementById('myWorkflowsList');
  const myWfs = G.workflows.filter(w => w.assigneeId === G.currentUser?.id || w.createdBy === G.currentUser?.id).slice(0, 5);
  const badge = document.getElementById('myWorkflowsBadge');
  
  if (myWfs.length > 0) {
    badge.textContent = myWfs.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
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
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white truncate">${wf.title}</p>
        <span class="text-xs px-2 py-0.5 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span>
      </div>
    </div>
  `).join('');
}

// ─── Documents ───
function renderDocuments() {
  const grid = document.getElementById('documentGrid');
  const filtered = getFilteredDocuments();
  
  document.getElementById('resultsCount').textContent = `${filtered.length} document${filtered.length > 1 ? 's' : ''}`;
  
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-12 text-blue-300/50">
        <i class="fas fa-folder-open text-4xl mb-3 block opacity-30"></i>
        <p>Aucun document trouvé</p>
      </div>
    `;
    return;
  }
  
  if (G.viewMode === 'list') {
    grid.className = 'space-y-2';
    grid.innerHTML = filtered.map(doc => renderDocListItem(doc)).join('');
  } else {
    grid.className = 'doc-grid';
    grid.innerHTML = filtered.map(doc => renderDocCard(doc)).join('');
  }
}

function getFilteredDocuments() {
  let docs = G.documents.filter(d => !d.isDeleted);
  
  // Filtre par onglet
  if (G.docsTab === 'company') docs = docs.filter(d => d.scope === 'company');
  else if (G.docsTab === 'personal') docs = docs.filter(d => d.scope === 'personal');
  else if (G.docsTab === 'mine') docs = docs.filter(d => d.ownerId === G.currentUser?.id);
  else if (G.docsTab === 'shared') {
    const sharedDocIds = G.shares.filter(s => s.recipientEmail === G.currentUser?.email && s.status === 'active').map(s => s.documentId);
    docs = docs.filter(d => sharedDocIds.includes(d.id));
  }
  
  // Filtre type
  const typeFilter = document.getElementById('filterType')?.value;
  if (typeFilter) docs = docs.filter(d => d.type === typeFilter);
  
  // Filtre date
  const dateFilter = document.getElementById('filterDate')?.value;
  if (dateFilter) {
    const now = new Date();
    docs = docs.filter(d => {
      const docDate = new Date(d.createdAt);
      if (dateFilter === 'today') return docDate.toDateString() === now.toDateString();
      if (dateFilter === 'week') return (now - docDate) < 7 * 24 * 60 * 60 * 1000;
      if (dateFilter === 'month') return (now - docDate) < 30 * 24 * 60 * 60 * 1000;
      return true;
    });
  }
  
  return docs;
}

function renderDocCard(doc) {
  const iconClass = getFileIcon(doc.type);
  const size = formatBytes(doc.size);
  const isOwner = doc.ownerId === G.currentUser?.id;
  
  return `
    <div class="document-card glass-card rounded-2xl p-4 border border-blue-500/20 cursor-pointer group" 
         onclick="openPreviewModal('${doc.id}')"
         draggable="true"
         ondragstart="handleDocDragStart(event, '${doc.id}')"
         oncontextmenu="showDocContextMenu(event, '${doc.id}')">
      <div class="flex items-start justify-between mb-3">
        <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center ${iconClass.split(' ')[1]} text-2xl">
          <i class="fas ${iconClass.split(' ')[0]}"></i>
        </div>
        <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button onclick="event.stopPropagation(); downloadDocument('${doc.id}')" class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400" title="Télécharger"><i class="fas fa-download"></i></button>
          <button onclick="event.stopPropagation(); openShareModal('${doc.id}')" class="p-2 rounded-lg hover:bg-purple-500/20 text-purple-400" title="Partager"><i class="fas fa-share-alt"></i></button>
          ${isOwner ? `<button onclick="event.stopPropagation(); deleteDocument('${doc.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400" title="Supprimer"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>
      <h4 class="text-white font-semibold text-sm mb-1 truncate" title="${doc.name}">${doc.name}</h4>
      <p class="text-blue-300/60 text-xs mb-2">${size} • ${formatDate(doc.createdAt)}</p>
      <div class="flex items-center justify-between">
        <div class="flex gap-1">
          ${(doc.tags || []).slice(0, 3).map(t => `<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">${t}</span>`).join('')}
        </div>
        ${doc.scope === 'company' ? '<span class="collab-badge"><i class="fas fa-building"></i>Entreprise</span>' : '<span class="text-[10px] text-purple-400/60"><i class="fas fa-user mr-1"></i>Perso</span>'}
      </div>
    </div>
  `;
}

function renderDocListItem(doc) {
  const iconClass = getFileIcon(doc.type);
  const isOwner = doc.ownerId === G.currentUser?.id;
  
  return `
    <div class="doc-list-item glass-card rounded-xl border border-blue-500/10 hover:border-blue-500/30 cursor-pointer" onclick="openPreviewModal('${doc.id}')">
      <div class="doc-icon rounded-lg bg-blue-500/10 flex items-center justify-center ${iconClass.split(' ')[1]}">
        <i class="fas ${iconClass.split(' ')[0]} text-lg"></i>
      </div>
      <div class="doc-content">
        <h4 class="text-white font-medium text-sm truncate">${doc.name}</h4>
        <p class="text-blue-300/60 text-xs">${formatBytes(doc.size)} • ${formatDate(doc.createdAt)}</p>
      </div>
      <div class="doc-actions">
        <button onclick="event.stopPropagation(); downloadDocument('${doc.id}')" class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400"><i class="fas fa-download"></i></button>
        <button onclick="event.stopPropagation(); openShareModal('${doc.id}')" class="p-2 rounded-lg hover:bg-purple-500/20 text-purple-400"><i class="fas fa-share-alt"></i></button>
        ${isOwner ? `<button onclick="event.stopPropagation(); deleteDocument('${doc.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400"><i class="fas fa-trash"></i></button>` : ''}
      </div>
    </div>
  `;
}

function switchDocsTab(tab) {
  G.docsTab = tab;
  document.querySelectorAll('.docs-tab').forEach(el => el.classList.remove('active'));
  document.getElementById(`docsTab-${tab}`)?.classList.add('active');
  renderDocuments();
}

function toggleViewMode() {
  G.viewMode = G.viewMode === 'grid' ? 'list' : 'grid';
  document.getElementById('viewModeIcon').className = G.viewMode === 'grid' ? 'fas fa-th-large' : 'fas fa-list';
  renderDocuments();
}

function applyFilters() {
  renderDocuments();
}

function clearFilters() {
  document.getElementById('filterType').value = '';
  document.getElementById('filterDate').value = '';
  renderDocuments();
}

function filterByType(type) {
  document.getElementById('filterType').value = type;
  switchView('documents');
  renderDocuments();
}

function filterByTag(tagName) {
  // Implémentation du filtre par tag
  showToast(`Filtre par tag: ${tagName}`, 'info');
}

// ─── Upload ───
// CORRECTION: Variable _uploadScope déclarée au début de la portée
let _uploadScope = 'company';

function openUploadModal() {
  _uploadScope = 'company'; // Réinitialisation par défaut
  document.getElementById('uploadModal').classList.remove('hidden');
  document.getElementById('selectedFilesList').innerHTML = '';
  document.getElementById('docNameInput').value = '';
  document.getElementById('docDescInput').value = '';
  document.getElementById('tagInput').value = '';
  G.selectedFiles = [];
  G.uploadTags = [];
  renderUploadTags();
  updateScopeUI();
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.add('hidden');
  document.getElementById('uploadProgress').classList.add('hidden');
  G.selectedFiles = [];
}

function setDocScope(scope) {
  _uploadScope = scope;
  updateScopeUI();
}

function updateScopeUI() {
  const companyBtn = document.getElementById('scopeCompany');
  const personalBtn = document.getElementById('scopePersonal');
  
  if (_uploadScope === 'company') {
    companyBtn.classList.add('border-blue-500/40', 'bg-blue-500/15', 'text-blue-300');
    companyBtn.classList.remove('border-transparent', 'bg-slate-800/40', 'text-gray-400');
    personalBtn.classList.remove('border-purple-500/40', 'bg-purple-500/15', 'text-purple-300');
    personalBtn.classList.add('border-transparent', 'bg-slate-800/40', 'text-gray-400');
  } else {
    personalBtn.classList.add('border-purple-500/40', 'bg-purple-500/15', 'text-purple-300');
    personalBtn.classList.remove('border-transparent', 'bg-slate-800/40', 'text-gray-400');
    companyBtn.classList.remove('border-blue-500/40', 'bg-blue-500/15', 'text-blue-300');
    companyBtn.classList.add('border-transparent', 'bg-slate-800/40', 'text-gray-400');
  }
}

function handleDragOver(e, zoneId) {
  e.preventDefault();
  document.getElementById(zoneId).classList.add('drag-over');
}

function handleDragLeave(e, zoneId) {
  e.preventDefault();
  document.getElementById(zoneId).classList.remove('drag-over');
}

function handleDrop(e, zoneId) {
  e.preventDefault();
  document.getElementById(zoneId).classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  addFilesToSelection(files);
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  addFilesToSelection(files);
}

function handleFilePickerSelect(e) {
  const files = Array.from(e.target.files);
  addFilesToSelection(files);
  uploadDocument();
}

function handleDocDrop(e) {
  e.preventDefault();
  document.getElementById('docDropZone').classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  addFilesToSelection(files);
  uploadDocument();
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
  const tag = input.value.trim();
  if (tag && !G.uploadTags.includes(tag)) {
    G.uploadTags.push(tag);
    input.value = '';
    renderUploadTags();
  }
}

function renderUploadTags() {
  const container = document.getElementById('uploadTagsContainer');
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
  
  const progressDiv = document.getElementById('uploadProgress');
  const progressBar = document.getElementById('uploadProgressBar');
  const progressText = document.getElementById('uploadPercent');
  const statusText = document.getElementById('uploadStatusText');
  
  progressDiv.classList.remove('hidden');
  document.getElementById('uploadBtn').disabled = true;
  
  for (let i = 0; i < G.selectedFiles.length; i++) {
    const file = G.selectedFiles[i];
    statusText.textContent = `Upload ${i + 1}/${G.selectedFiles.length}: ${file.name}`;
    
    // Simulation progression
    for (let p = 0; p <= 100; p += 10) {
      progressBar.style.width = `${p}%`;
      progressText.textContent = `${p}%`;
      await simulateNetworkDelay(50);
    }
    
    const doc = {
      id: generateId(),
      name: document.getElementById('docNameInput').value || file.name,
      type: getFileType(file.name),
      size: file.size,
      description: document.getElementById('docDescInput').value,
      scope: _uploadScope, // Utilisation de la variable corrigée
      ownerId: G.currentUser?.id,
      companyId: G.currentUser?.companyId,
      folderId: G.currentFolderId,
      tags: [...G.uploadTags],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      views: 0,
      downloads: 0,
      isDeleted: false,
      deletedAt: null,
      content: ''
    };
    
    G.documents.unshift(doc);
    addAudit('upload', 'document', doc.id, { name: doc.name, size: doc.size });
    logInfo(`Document uploadé: ${doc.name}`);
  }
  
  saveDocuments();
  updateStorageDisplay();
  updateBadges();
  
  showToast(`${G.selectedFiles.length} document(s) importé(s)`, 'success');
  closeUploadModal();
  
  if (G.currentView === 'documents') renderDocuments();
  else if (G.currentView === 'dashboard') renderDashboard();
}

// ─── Preview ───
function openPreviewModal(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  G.currentDocId = docId;
  doc.views = (doc.views || 0) + 1;
  saveDocuments();
  
  document.getElementById('previewTitle').textContent = doc.name;
  document.getElementById('previewMeta').textContent = `${formatBytes(doc.size)} • ${formatDate(doc.createdAt)} • v${doc.version}`;
  document.getElementById('previewIcon').innerHTML = `<div class="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center ${getFileIcon(doc.type).split(' ')[1]} text-2xl"><i class="fas ${getFileIcon(doc.type).split(' ')[0]}"></i></div>`;
  
  const content = document.getElementById('previewContent');
  const frame = document.getElementById('previewFrame');
  const img = document.getElementById('previewImage');
  
  frame.classList.add('hidden');
  img.classList.add('hidden');
  content.classList.remove('hidden');
  
  if (doc.type === 'img') {
    content.classList.add('hidden');
    img.classList.remove('hidden');
    img.src = `https://placehold.co/600x400/1e3a8a/60a5fa?text=${encodeURIComponent(doc.name)}`;
  } else if (doc.type === 'pdf') {
    content.classList.add('hidden');
    frame.classList.remove('hidden');
    frame.src = `https://placehold.co/600x800/1e3a8a/60a5fa?text=PDF:+${encodeURIComponent(doc.name)}`;
  } else {
    content.innerHTML = `
      <div class="text-center">
        <i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-5xl mb-3 ${getFileIcon(doc.type).split(' ')[1]} opacity-50"></i>
        <p class="mb-3">Aperçu non disponible pour ce format</p>
        <button onclick="downloadCurrentDocument()" class="btn-primary px-5 py-2 rounded-lg text-white text-sm"><i class="fas fa-download mr-2"></i>Télécharger</button>
      </div>
    `;
  }
  
  document.getElementById('previewModal').classList.remove('hidden');
  addAudit('view', 'document', docId);
}

function closePreviewModal() {
  document.getElementById('previewModal').classList.add('hidden');
  document.getElementById('previewFrame').src = '';
  G.currentDocId = null;
}

function downloadCurrentDocument() {
  if (G.currentDocId) downloadDocument(G.currentDocId);
}

function downloadDocument(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  doc.downloads = (doc.downloads || 0) + 1;
  saveDocuments();
  
  showToast(`Téléchargement: ${doc.name}`, 'success');
  addAudit('download', 'document', docId);
  
  // Simulation téléchargement
  const a = document.createElement('a');
  a.href = `data:text/plain;charset=utf-8,Contenu simulé du fichier: ${encodeURIComponent(doc.name)}`;
  a.download = doc.name;
  a.click();
}

function shareCurrentDocument() {
  closePreviewModal();
  if (G.currentDocId) openShareModal(G.currentDocId);
}

// ─── Share ───
function openShareModal(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  G.currentDocId = docId;
  document.getElementById('shareDocInfo').textContent = doc.name;
  document.getElementById('shareModal').classList.remove('hidden');
  document.getElementById('generatedLink').classList.add('hidden');
  switchShareTab('send');
  loadShareHistory();
}

function closeShareModal() {
  document.getElementById('shareModal').classList.add('hidden');
  G.currentDocId = null;
}

function switchShareTab(tab) {
  document.getElementById('shareTab-send').classList.toggle('text-blue-400', tab === 'send');
  document.getElementById('shareTab-send').classList.toggle('border-blue-400', tab === 'send');
  document.getElementById('shareTab-send').classList.toggle('text-gray-400', tab !== 'send');
  document.getElementById('shareTab-send').classList.toggle('border-transparent', tab !== 'send');
  
  document.getElementById('shareTab-history').classList.toggle('text-blue-400', tab === 'history');
  document.getElementById('shareTab-history').classList.toggle('border-blue-400', tab === 'history');
  document.getElementById('shareTab-history').classList.toggle('text-gray-400', tab !== 'history');
  document.getElementById('shareTab-history').classList.toggle('border-transparent', tab !== 'history');
  
  document.getElementById('sharePanel-send').classList.toggle('hidden', tab !== 'send');
  document.getElementById('sharePanel-history').classList.toggle('hidden', tab !== 'history');
}

async function shareDocument() {
  const email = document.getElementById('shareEmail').value;
  if (!email) {
    showToast('Veuillez entrer un email', 'warning');
    return;
  }
  
  const permission = document.getElementById('sharePermission').value;
  const expiration = document.getElementById('shareExpiration').value;
  const message = document.getElementById('shareMessage').value;
  
  const share = {
    id: generateId(),
    documentId: G.currentDocId,
    documentName: G.documents.find(d => d.id === G.currentDocId)?.name,
    senderId: G.currentUser?.id,
    senderEmail: G.currentUser?.email,
    recipientEmail: email,
    permission,
    message,
    status: 'active',
    createdAt: new Date().toISOString(),
    expiresAt: expiration !== '0' ? new Date(Date.now() + parseInt(expiration) * 24 * 60 * 60 * 1000).toISOString() : null
  };
  
  G.shares.unshift(share);
  saveShares();
  
  // Générer lien
  const link = `${window.location.origin}/share/${share.id}`;
  document.getElementById('shareLinkInput').value = link;
  document.getElementById('generatedLink').classList.remove('hidden');
  
  showToast('Partage créé avec succès', 'success');
  addAudit('share', 'document', G.currentDocId, { recipient: email });
  updateBadges();
  
  // Envoi email simulé
  logInfo(`Email envoyé à ${email}`, { shareId: share.id });
}

function copyShareLink() {
  const input = document.getElementById('shareLinkInput');
  input.select();
  document.execCommand('copy');
  showToast('Lien copié', 'success');
}

function loadShareHistory() {
  const list = document.getElementById('shareHistoryList');
  const docShares = G.shares.filter(s => s.documentId === G.currentDocId);
  
  document.getElementById('shareHistoryCount').textContent = docShares.length;
  document.getElementById('shareHistoryCount').classList.toggle('hidden', docShares.length === 0);
  
  if (docShares.length === 0) {
    list.innerHTML = '<div class="text-center py-6 text-blue-300/40"><p class="text-sm">Aucun partage pour ce document</p></div>';
    return;
  }
  
  list.innerHTML = docShares.map(s => `
    <div class="flex items-center justify-between p-3 rounded-lg bg-blue-900/20 border border-blue-500/10">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-xs">
          <i class="fas fa-user"></i>
        </div>
        <div>
          <p class="text-sm text-white">${s.recipientEmail}</p>
          <p class="text-xs text-blue-300/60">${s.permission} • ${formatDate(s.createdAt)}</p>
        </div>
      </div>
      <span class="text-xs px-2 py-1 rounded-full ${s.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}">${s.status}</span>
    </div>
  `).join('');
}

// ─── Workflows ───
function renderWorkflows() {
  renderWfKPIs();
  renderWfKanban();
  renderWfList();
}

function renderWfKPIs() {
  const strip = document.getElementById('wfKpiStrip');
  const stats = {
    total: G.workflows.length,
    pending: G.workflows.filter(w => w.status === 'pending').length,
    in_review: G.workflows.filter(w => w.status === 'in_review').length,
    approved: G.workflows.filter(w => w.status === 'approved').length,
    rejected: G.workflows.filter(w => w.status === 'rejected').length
  };
  
  strip.innerHTML = `
    <div class="glass-card rounded-xl p-3 border border-blue-500/20"><p class="text-2xl font-bold text-white">${stats.total}</p><p class="text-xs text-blue-300/60">Total</p></div>
    <div class="glass-card rounded-xl p-3 border border-orange-500/20"><p class="text-2xl font-bold text-orange-400">${stats.pending}</p><p class="text-xs text-blue-300/60">En attente</p></div>
    <div class="glass-card rounded-xl p-3 border border-blue-500/20"><p class="text-2xl font-bold text-blue-400">${stats.in_review}</p><p class="text-xs text-blue-300/60">En révision</p></div>
    <div class="glass-card rounded-xl p-3 border border-green-500/20"><p class="text-2xl font-bold text-green-400">${stats.approved}</p><p class="text-xs text-blue-300/60">Approuvés</p></div>
  `;
}

function renderWfKanban() {
  const container = document.getElementById('wfKanban');
  const filtered = getFilteredWorkflows();
  
  const columns = [
    { id: 'pending', title: 'En attente', color: 'orange' },
    { id: 'in_review', title: 'En révision', color: 'blue' },
    { id: 'approved', title: 'Approuvés', color: 'green' },
    { id: 'rejected', title: 'Rejetés', color: 'red' },
    { id: 'cancelled', title: 'Annulés', color: 'gray' }
  ];
  
  container.innerHTML = columns.map(col => `
    <div class="glass-card rounded-xl border border-${col.color}-500/20 p-3 min-h-[200px]">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-semibold text-${col.color}-400">${col.title}</h4>
        <span class="text-xs bg-${col.color}-500/20 text-${col.color}-300 px-2 py-0.5 rounded-full">${filtered.filter(w => w.status === col.id).length}</span>
      </div>
      <div class="space-y-2">
        ${filtered.filter(w => w.status === col.id).map(w => renderWfCard(w)).join('')}
      </div>
    </div>
  `).join('');
}

function renderWfCard(wf) {
  const priorityColors = { low: 'blue', medium: 'yellow', high: 'orange', urgent: 'red' };
  return `
    <div class="p-3 rounded-lg bg-slate-900/50 border border-blue-500/10 cursor-pointer hover:border-blue-500/30 transition-all" onclick="openWfDetail('${wf.id}')">
      <div class="flex items-start justify-between mb-2">
        <h5 class="text-sm text-white font-medium truncate">${wf.title}</h5>
        <span class="w-2 h-2 rounded-full bg-${priorityColors[wf.priority]}-400"></span>
      </div>
      <p class="text-xs text-blue-300/60 mb-2 line-clamp-2">${wf.description || 'Aucune description'}</p>
      <div class="flex items-center justify-between text-xs">
        <span class="text-blue-300/40">${formatDate(wf.dueDate)}</span>
        <span class="wf-badge"><i class="fas fa-user"></i>${wf.assigneeName || 'Non assigné'}</span>
      </div>
    </div>
  `;
}

function renderWfList() {
  const container = document.getElementById('wfListView');
  const filtered = getFilteredWorkflows();
  
  container.innerHTML = filtered.map(wf => `
    <div class="glass-card rounded-xl p-4 border border-blue-500/10 flex items-center gap-4 cursor-pointer hover:border-blue-500/30" onclick="openWfDetail('${wf.id}')">
      <div class="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-400"><i class="fas fa-project-diagram"></i></div>
      <div class="flex-1 min-w-0">
        <h4 class="text-white font-medium truncate">${wf.title}</h4>
        <p class="text-sm text-blue-300/60 truncate">${wf.description || 'Aucune description'}</p>
      </div>
      <span class="px-3 py-1 rounded-full text-xs ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span>
    </div>
  `).join('');
}

function getFilteredWorkflows() {
  let wfs = [...G.workflows];
  if (G.wfFilter) wfs = wfs.filter(w => w.status === G.wfFilter);
  const search = document.getElementById('wfSearch')?.value;
  if (search) wfs = wfs.filter(w => w.title.toLowerCase().includes(search.toLowerCase()));
  return wfs;
}

function getWfStatusClass(status) {
  const classes = { pending: 'bg-orange-500/20 text-orange-300', in_review: 'bg-blue-500/20 text-blue-300', approved: 'bg-green-500/20 text-green-300', rejected: 'bg-red-500/20 text-red-300', cancelled: 'bg-gray-500/20 text-gray-300' };
  return classes[status] || 'bg-gray-500/20 text-gray-300';
}

function getWfStatusLabel(status) {
  const labels = { pending: 'En attente', in_review: 'En révision', approved: 'Approuvé', rejected: 'Rejeté', cancelled: 'Annulé' };
  return labels[status] || status;
}

function filterWorkflows(status) {
  G.wfFilter = status;
  document.querySelectorAll('.wf-filter-btn').forEach(btn => {
    const isActive = btn.dataset.wf === status;
    btn.classList.toggle('bg-blue-500/20', isActive);
    btn.classList.toggle('text-blue-300', isActive);
    btn.classList.toggle('border-blue-500/30', isActive);
    btn.classList.toggle('text-gray-400', !isActive);
    btn.classList.toggle('border-blue-500/10', !isActive);
  });
  renderWorkflows();
}

function searchWorkflows(query) {
  renderWorkflows();
}

function setWfView(view) {
  G.wfView = view;
  document.getElementById('wfViewKanban').classList.toggle('bg-blue-500/20', view === 'kanban');
  document.getElementById('wfViewKanban').classList.toggle('text-blue-300', view === 'kanban');
  document.getElementById('wfViewList').classList.toggle('bg-blue-500/20', view === 'list');
  document.getElementById('wfViewList').classList.toggle('text-blue-300', view === 'list');
  document.getElementById('wfKanban').classList.toggle('hidden', view !== 'kanban');
  document.getElementById('wfListView').classList.toggle('hidden', view !== 'list');
}

function openCreateWorkflowModal() {
  document.getElementById('workflowModal').classList.remove('hidden');
  document.getElementById('wfDocId').innerHTML = '<option value="">-- Aucun --</option>' + G.documents.filter(d => !d.isDeleted).map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  document.getElementById('wfAssignee').innerHTML = '<option value="">-- Non assigné --</option>' + G.users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
  document.getElementById('wfStepsContainer').innerHTML = '';
  addWfStep();
}

function closeWorkflowModal() {
  document.getElementById('workflowModal').classList.add('hidden');
}

function addWfStep() {
  const container = document.getElementById('wfStepsContainer');
  const idx = container.children.length + 1;
  const div = document.createElement('div');
  div.className = 'flex gap-2 items-center';
  div.innerHTML = `
    <span class="text-xs text-blue-400 w-6">${idx}.</span>
    <input type="text" placeholder="Nom de l'étape" class="flex-1 px-3 py-2 rounded-lg text-white text-sm bg-slate-900/50 border border-blue-500/30 outline-none">
    <select class="px-3 py-2 rounded-lg text-white text-sm bg-slate-900/50 border border-blue-500/30 outline-none">
      ${G.users.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
    </select>
    <button onclick="this.parentElement.remove()" class="p-2 text-red-400 hover:text-red-300"><i class="fas fa-times"></i></button>
  `;
  container.appendChild(div);
}

async function createWorkflow(e) {
  e.preventDefault();
  
  const steps = Array.from(document.querySelectorAll('#wfStepsContainer > div')).map(div => ({
    name: div.querySelector('input').value,
    assigneeId: div.querySelector('select').value,
    status: 'pending'
  }));
  
  const wf = {
    id: generateId(),
    title: document.getElementById('wfTitle').value,
    description: document.getElementById('wfDesc').value,
    priority: document.getElementById('wfPriority').value,
    documentId: document.getElementById('wfDocId').value,
    dueDate: document.getElementById('wfDueDate').value,
    assigneeId: document.getElementById('wfAssignee').value,
    assigneeName: G.users.find(u => u.id === document.getElementById('wfAssignee').value)?.name,
    createdBy: G.currentUser?.id,
    status: 'pending',
    steps,
    currentStep: 0,
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  G.workflows.unshift(wf);
  saveWorkflows();
  
  showToast('Workflow créé avec succès', 'success');
  addAudit('create', 'workflow', wf.id);
  closeWorkflowModal();
  renderWorkflows();
  updateBadges();
}

function openWfDetail(wfId) {
  const wf = G.workflows.find(w => w.id === wfId);
  if (!wf) return;
  
  G.currentWfId = wfId;
  document.getElementById('wfDetailTitle').textContent = wf.title;
  document.getElementById('wfDetailMeta').innerHTML = `
    <span class="text-xs px-2 py-0.5 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span>
    <span class="text-xs text-blue-300/60"><i class="fas fa-calendar mr-1"></i>${formatDate(wf.dueDate)}</span>
    <span class="text-xs text-blue-300/60"><i class="fas fa-flag mr-1"></i>${wf.priority}</span>
  `;
  
  const progress = wf.status === 'approved' ? 100 : wf.status === 'rejected' ? 100 : wf.status === 'cancelled' ? 0 : Math.round(((wf.currentStep || 0) / (wf.steps?.length || 1)) * 100);
  document.getElementById('wfDetailProgress').textContent = `${progress}%`;
  document.getElementById('wfDetailProgressBar').style.width = `${progress}%`;
  
  document.getElementById('wfDetailSteps').innerHTML = (wf.steps || []).map((step, idx) => `
    <div class="flex items-center gap-3 p-3 rounded-lg ${idx === wf.currentStep ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-slate-900/30 border border-blue-500/10'}">
      <div class="w-8 h-8 rounded-full ${idx < wf.currentStep ? 'bg-green-500/20 text-green-400' : idx === wf.currentStep ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-500/20 text-gray-400'} flex items-center justify-center text-xs">
        <i class="fas ${idx < wf.currentStep ? 'fa-check' : idx === wf.currentStep ? 'fa-spinner fa-spin' : 'fa-clock'}"></i>
      </div>
      <div class="flex-1">
        <p class="text-sm text-white">${step.name}</p>
        <p class="text-xs text-blue-300/60">${G.users.find(u => u.id === step.assigneeId)?.name || 'Non assigné'}</p>
      </div>
    </div>
  `).join('');
  
  const isAssignee = wf.assigneeId === G.currentUser?.id || (wf.steps[wf.currentStep]?.assigneeId === G.currentUser?.id);
  const canAct = ['pending', 'in_review'].includes(wf.status) && isAssignee;
  document.getElementById('wfDetailActions').classList.toggle('hidden', !canAct);
  
  document.getElementById('wfDetailHistory').innerHTML = (wf.comments || []).map(c => `
    <div class="p-2 rounded-lg bg-slate-900/30 border border-blue-500/10">
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs text-blue-400">${c.authorName}</span>
        <span class="text-xs text-blue-300/40">${formatDate(c.timestamp)}</span>
      </div>
      <p class="text-sm text-white">${c.text}</p>
    </div>
  `).join('') || '<p class="text-center text-blue-300/40 text-sm py-4">Aucun commentaire</p>';
  
  document.getElementById('wfDetailModal').classList.remove('hidden');
}

function closeWfDetail() {
  document.getElementById('wfDetailModal').classList.add('hidden');
  G.currentWfId = null;
}

function actOnWorkflow(action) {
  const wf = G.workflows.find(w => w.id === G.currentWfId);
  if (!wf) return;
  
  const comment = document.getElementById('wfDetailComment').value;
  
  if (action === 'approve') {
    if (wf.currentStep < (wf.steps?.length || 1) - 1) {
      wf.currentStep++;
      wf.status = 'in_review';
    } else {
      wf.status = 'approved';
    }
  } else if (action === 'reject') {
    wf.status = 'rejected';
  } else if (action === 'request_changes') {
    wf.status = 'pending';
  }
  
  if (!wf.comments) wf.comments = [];
  wf.comments.push({
    authorId: G.currentUser?.id,
    authorName: G.currentUser?.name,
    text: `[${action.toUpperCase()}] ${comment || 'Aucun commentaire'}`,
    timestamp: new Date().toISOString()
  });
  
  wf.updatedAt = new Date().toISOString();
  saveWorkflows();
  
  showToast(`Workflow ${action === 'approve' ? 'approuvé' : action === 'reject' ? 'rejeté' : 'en révision'}`, 'success');
  addAudit(action, 'workflow', wf.id);
  closeWfDetail();
  renderWorkflows();
  updateBadges();
}

function addWfComment() {
  const text = document.getElementById('wfCommentInput').value;
  if (!text) return;
  
  const wf = G.workflows.find(w => w.id === G.currentWfId);
  if (!wf) return;
  
  if (!wf.comments) wf.comments = [];
  wf.comments.push({
    authorId: G.currentUser?.id,
    authorName: G.currentUser?.name,
    text,
    timestamp: new Date().toISOString()
  });
  
  saveWorkflows();
  document.getElementById('wfCommentInput').value = '';
  openWfDetail(G.currentWfId);
}

// ─── Shared ───
function renderShared() {
  switchSharedTab(G.sharedTab);
}

function switchSharedTab(tab) {
  G.sharedTab = tab;
  document.getElementById('tab-received').classList.toggle('text-blue-400', tab === 'received');
  document.getElementById('tab-received').classList.toggle('border-blue-400', tab === 'received');
  document.getElementById('tab-received').classList.toggle('text-gray-400', tab !== 'received');
  document.getElementById('tab-received').classList.toggle('border-transparent', tab !== 'received');
  
  document.getElementById('tab-sent').classList.toggle('text-blue-400', tab === 'sent');
  document.getElementById('tab-sent').classList.toggle('border-blue-400', tab === 'sent');
  document.getElementById('tab-sent').classList.toggle('text-gray-400', tab !== 'sent');
  document.getElementById('tab-sent').classList.toggle('border-transparent', tab !== 'sent');
  
  document.getElementById('shared-received').classList.toggle('hidden', tab !== 'received');
  document.getElementById('shared-sent').classList.toggle('hidden', tab !== 'sent');
  
  if (tab === 'received') renderReceivedShares();
  else renderSentShares();
}

function renderReceivedShares() {
  const received = G.shares.filter(s => s.recipientEmail === G.currentUser?.email && s.status === 'active');
  const empty = document.getElementById('sharedEmptyState');
  const list = document.getElementById('sharedList');
  
  document.getElementById('receivedCountBadge').textContent = received.length;
  document.getElementById('receivedCountBadge').classList.toggle('hidden', received.length === 0);
  
  if (received.length === 0) {
    empty.classList.remove('hidden');
    list.classList.add('hidden');
    return;
  }
  
  empty.classList.add('hidden');
  list.classList.remove('hidden');
  
  list.innerHTML = received.map(s => {
    const doc = G.documents.find(d => d.id === s.documentId);
    return `
      <div class="document-card glass-card rounded-2xl p-4 border border-blue-500/20 cursor-pointer" onclick="openPreviewModal('${s.documentId}')">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400"><i class="fas fa-share-alt"></i></div>
          <div class="flex-1 min-w-0">
            <h4 class="text-white font-semibold text-sm truncate">${doc?.name || 'Document inconnu'}</h4>
            <p class="text-xs text-blue-300/60">De: ${s.senderEmail}</p>
          </div>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="px-2 py-1 rounded-full bg-blue-500/20 text-blue-300">${s.permission}</span>
          <span class="text-blue-300/40">${formatDate(s.createdAt)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderSentShares() {
  const sent = G.shares.filter(s => s.senderId === G.currentUser?.id);
  const empty = document.getElementById('sentEmptyState');
  const list = document.getElementById('sentSharesList');
  
  document.getElementById('sentCountBadge').textContent = sent.length;
  document.getElementById('sentCountBadge').classList.toggle('hidden', sent.length === 0);
  
  if (sent.length === 0) {
    empty.classList.remove('hidden');
    list.classList.add('hidden');
    return;
  }
  
  empty.classList.add('hidden');
  list.classList.remove('hidden');
  
  list.innerHTML = sent.map(s => `
    <div class="glass-card rounded-xl p-4 border border-blue-500/10 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400"><i class="fas fa-file"></i></div>
        <div>
          <p class="text-white text-sm font-medium">${s.documentName}</p>
          <p class="text-xs text-blue-300/60">À: ${s.recipientEmail} • ${s.permission}</p>
        </div>
      </div>
      <span class="text-xs px-2 py-1 rounded-full ${s.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}">${s.status}</span>
    </div>
  `).join('');
}

// ─── Users ───
function renderUsers() {
  const tbody = document.getElementById('usersList');
  tbody.innerHTML = G.users.map(u => `
    <tr class="hover:bg-blue-500/5">
      <td class="p-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-bold">${u.name.charAt(0)}</div>
          <div>
            <p class="text-white text-sm font-medium">${u.name}</p>
            <p class="text-xs text-blue-300/60">${u.email}</p>
          </div>
        </div>
      </td>
      <td class="p-4"><span class="px-2 py-1 rounded-full text-xs ${getRoleBadgeClass(u.role)}">${G.roles[u.role]?.name || u.role}</span></td>
      <td class="p-4 hidden md:table-cell text-sm text-blue-300/70">${G.documents.filter(d => d.ownerId === u.id && !d.isDeleted).length}</td>
      <td class="p-4 hidden sm:table-cell"><span class="px-2 py-1 rounded-full text-xs ${u.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}">${u.status}</span></td>
      <td class="p-4">
        <div class="flex gap-2">
          <button onclick="openEditUserModal('${u.id}')" class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400"><i class="fas fa-edit"></i></button>
          ${u.id !== G.currentUser?.id ? `<button onclick="deleteUser('${u.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

function getRoleBadgeClass(role) {
  const classes = { admin: 'bg-red-500/20 text-red-400', manager: 'bg-orange-500/20 text-orange-400', editor: 'bg-blue-500/20 text-blue-400', viewer: 'bg-gray-500/20 text-gray-400' };
  return classes[role] || 'bg-gray-500/20 text-gray-400';
}

function openCreateUserModal() {
  document.getElementById('addUserModal').classList.remove('hidden');
}

function closeAddUserModal() {
  document.getElementById('addUserModal').classList.add('hidden');
  document.getElementById('newUserFirst').value = '';
  document.getElementById('newUserLast').value = '';
  document.getElementById('newUserEmail').value = '';
}

async function addUser(e) {
  e.preventDefault();
  
  const user = {
    id: generateId(),
    name: `${document.getElementById('newUserFirst').value} ${document.getElementById('newUserLast').value}`,
    email: document.getElementById('newUserEmail').value,
    role: document.getElementById('newUserRole').value,
    status: 'active',
    createdAt: new Date().toISOString(),
    lastLogin: null
  };
  
  G.users.push(user);
  saveUsers();
  
  showToast('Utilisateur ajouté', 'success');
  addAudit('create', 'user', user.id);
  closeAddUserModal();
  renderUsers();
  updateBadges();
}

function openEditUserModal(userId) {
  const u = G.users.find(user => user.id === userId);
  if (!u) return;
  
  document.getElementById('editUserId').value = u.id;
  document.getElementById('editUserFirst').value = u.name.split(' ')[0];
  document.getElementById('editUserLast').value = u.name.split(' ').slice(1).join(' ');
  document.getElementById('editUserRole').value = u.role;
  document.getElementById('editUserModal').classList.remove('hidden');
}

function closeEditUserModal() {
  document.getElementById('editUserModal').classList.add('hidden');
}

function saveEditUser(e) {
  e.preventDefault();
  const id = document.getElementById('editUserId').value;
  const u = G.users.find(user => user.id === id);
  if (!u) return;
  
  u.name = `${document.getElementById('editUserFirst').value} ${document.getElementById('editUserLast').value}`;
  u.role = document.getElementById('editUserRole').value;
  
  saveUsers();
  showToast('Utilisateur modifié', 'success');
  addAudit('update', 'user', id);
  closeEditUserModal();
  renderUsers();
}

function deleteUser(userId) {
  if (!confirm('Supprimer cet utilisateur ?')) return;
  G.users = G.users.filter(u => u.id !== userId);
  saveUsers();
  showToast('Utilisateur supprimé', 'success');
  addAudit('delete', 'user', userId);
  renderUsers();
  updateBadges();
}

// ─── Tags ───
function renderTags() {
  const container = document.getElementById('tagsList');
  container.innerHTML = G.tags.map(t => `
    <div class="flex items-center gap-2 p-2 rounded-lg bg-slate-900/30 border border-blue-500/10">
      <span class="w-3 h-3 rounded-full" style="background:${t.color}"></span>
      <span class="text-sm text-white flex-1">${t.name}</span>
      <span class="text-xs text-blue-300/60">${t.count || 0}</span>
      <button onclick="deleteTag('${t.id}')" class="p-1 text-red-400 hover:text-red-300"><i class="fas fa-times"></i></button>
    </div>
  `).join('');
}

function createTag() {
  const name = document.getElementById('newTagInput').value.trim();
  const color = document.getElementById('newTagColor').value;
  if (!name) return;
  
  if (G.tags.find(t => t.name.toLowerCase() === name.toLowerCase())) {
    showToast('Ce tag existe déjà', 'warning');
    return;
  }
  
  G.tags.push({ id: generateId(), name, color, count: 0 });
  saveTags();
  document.getElementById('newTagInput').value = '';
  renderTags();
  showToast('Tag créé', 'success');
}

function deleteTag(tagId) {
  G.tags = G.tags.filter(t => t.id !== tagId);
  saveTags();
  renderTags();
}

// ─── Billing ───
function renderBilling() {
  const plan = CONFIG.plans[G.currentUser?.plan || 'free'];
  document.getElementById('currentPlanName').textContent = plan.name;
  document.getElementById('currentPlanBadgeEl').className = `badge-plan badge-${G.currentUser?.plan || 'free'}`;
  document.getElementById('currentPlanBadgeEl').textContent = plan.name.toUpperCase();
  document.getElementById('currentPlanDesc').textContent = `${plan.users} utilisateurs • ${formatBytes(plan.storage)} • ${plan.features.join(', ')}`;
  document.getElementById('currentPlanPrice').innerHTML = plan.price ? `${plan.price}€<span class="text-blue-400/60 text-sm font-normal">/mois</span>` : 'Devis';
}

function selectPlan(planKey, el) {
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('upgradeBtn').disabled = false;
  G.selectedPlan = planKey;
}

function simulateUpgrade() {
  showToast('Redirection vers Stripe...', 'info');
  setTimeout(() => {
    G.currentUser.plan = G.selectedPlan;
    G.currentCompany.plan = G.selectedPlan;
    localStorage.setItem(`user_${G.currentUser.email}`, JSON.stringify(G.currentUser));
    localStorage.setItem(`company_${G.currentCompany.id}`, JSON.stringify(G.currentCompany));
    showToast('Plan mis à jour !', 'success');
    updateUserDisplay();
    renderBilling();
  }, 1500);
}

// ─── Settings ───
function renderSettings() {
  document.getElementById('profileName').value = G.currentUser?.name || '';
  document.getElementById('profileEmail').value = G.currentUser?.email || '';
}

function saveProfile() {
  const name = document.getElementById('profileName').value;
  const newPwd = document.getElementById('profileNewPwd').value;
  const confirmPwd = document.getElementById('profileConfirmPwd').value;
  
  if (newPwd && newPwd !== confirmPwd) {
    showToast('Les mots de passe ne correspondent pas', 'error');
    return;
  }
  
  G.currentUser.name = name;
  if (newPwd) {
    G.currentUser.password = newPwd;
  }
  
  localStorage.setItem(`user_${G.currentUser.email}`, JSON.stringify(G.currentUser));
  updateUserDisplay();
  showToast('Profil mis à jour', 'success');
  addAudit('update', 'user', G.currentUser.id, { field: 'profile' });
}

function toggleSetting(key) {
  const enabled = document.getElementById(`${key}setting`)?.checked;
  logInfo(`Paramètre ${key} ${enabled ? 'activé' : 'désactivé'}`);
  showToast(`${key} ${enabled ? 'activé' : 'désactivé'}`, 'success');
}

function exportAllData() {
  const data = {
    user: G.currentUser,
    company: G.currentCompany,
    documents: G.documents,
    workflows: G.workflows,
    users: G.users,
    tags: G.tags,
    shares: G.shares,
    exportDate: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `export_systemesged_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('Export téléchargé', 'success');
  addAudit('export', 'data', 'all');
}

function copySqlSchema() {
  const schema = document.getElementById('sqlSchemaBlock').textContent;
  navigator.clipboard.writeText(schema).then(() => showToast('Schéma copié', 'success'));
}

// ─── Security ───
function renderSecurity() {
  document.getElementById('secScanOk').textContent = G.documents.filter(d => !d.isDeleted).length;
  document.getElementById('secScanBlocked').textContent = '0';
  document.getElementById('secApiKeys').textContent = G.apiKeys.length;
  document.getElementById('secAuditCount').textContent = G.auditLog.length;
  renderAuditLog();
  loadDeletedDocs();
}

function renderAuditLog() {
  const filter = document.getElementById('auditFilter')?.value;
  let logs = [...G.auditLog];
  if (filter) logs = logs.filter(l => l.action === filter);
  
  const list = document.getElementById('auditLogList');
  list.innerHTML = logs.slice(0, 50).map(l => `
    <div class="flex items-center justify-between p-2 rounded-lg bg-slate-900/30 border border-blue-500/10 text-xs">
      <div class="flex items-center gap-2">
        <span class="text-blue-400">${l.action}</span>
        <span class="text-blue-300/60">${l.targetType}</span>
      </div>
      <span class="text-blue-300/40">${formatDate(l.timestamp)}</span>
    </div>
  `).join('');
}

function switchSecurityTab(tab) {
  document.getElementById('secTab-audit').classList.toggle('bg-blue-500/20', tab === 'audit');
  document.getElementById('secTab-audit').classList.toggle('text-blue-300', tab === 'audit');
  document.getElementById('secTab-trash').classList.toggle('bg-blue-500/20', tab === 'trash');
  document.getElementById('secTab-trash').classList.toggle('text-blue-300', tab === 'trash');
  document.getElementById('secPanel-audit').classList.toggle('hidden', tab !== 'audit');
  document.getElementById('secPanel-trash').classList.toggle('hidden', tab !== 'trash');
}

function loadDeletedDocs() {
  const deleted = G.documents.filter(d => d.isDeleted);
  const list = document.getElementById('trashList');
  
  document.getElementById('trashCount').textContent = deleted.length;
  document.getElementById('trashCount').classList.toggle('hidden', deleted.length === 0);
  
  if (deleted.length === 0) {
    list.innerHTML = '<div class="text-center py-6 text-blue-300/40 text-sm"><i class="fas fa-trash text-2xl mb-2 block opacity-20"></i>Corbeille vide</div>';
    return;
  }
  
  list.innerHTML = deleted.map(d => `
    <div class="flex items-center justify-between p-3 rounded-lg bg-slate-900/30 border border-red-500/10">
      <div class="flex items-center gap-3">
        <i class="fas ${getFileIcon(d.type).split(' ')[0]} text-red-400/60"></i>
        <div>
          <p class="text-sm text-white/60 line-through">${d.name}</p>
          <p class="text-xs text-blue-300/40">Supprimé le ${formatDate(d.deletedAt)}</p>
        </div>
      </div>
      <button onclick="restoreDocument('${d.id}')" class="px-3 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30">Restaurer</button>
    </div>
  `).join('');
}

function restoreDocument(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  doc.isDeleted = false;
  doc.deletedAt = null;
  saveDocuments();
  
  showToast('Document restauré', 'success');
  addAudit('restore', 'document', docId);
  loadDeletedDocs();
  renderDocuments();
  updateBadges();
}

function generateApiKey() {
  const key = `ged_${generateId()}_${generateId().substr(0, 8)}`;
  G.apiKeys.push({
    id: generateId(),
    key,
    name: `Clé ${G.apiKeys.length + 1}`,
    createdAt: new Date().toISOString(),
    lastUsed: null
  });
  saveApiKeys();
  renderSecurity();
  showToast('Clé API générée', 'success');
}

function scanAllDocuments() {
  showToast('Scan antivirus en cours...', 'info');
  setTimeout(() => {
    showToast('Scan terminé: aucun virus détecté', 'success');
  }, 2000);
}

// ─── Logs ───
function renderSysLogs() {
  const container = document.getElementById('sysLogConsole');
  let logs = [...G.sysLogs];
  if (G.logFilter !== 'all') logs = logs.filter(l => l.level === G.logFilter);
  
  container.innerHTML = logs.map(l => `
    <div class="syslog-row py-1 px-2 rounded hover:bg-blue-500/5 flex gap-2">
      <span class="text-blue-300/40">[${new Date(l.timestamp).toLocaleTimeString('fr-FR')}]</span>
      <span class="uppercase text-xs font-bold ${getLogLevelColor(l.level)}">${l.level}</span>
      <span class="text-blue-200/80">${l.message}</span>
    </div>
  `).join('');
}

function getLogLevelColor(level) {
  const colors = { info: 'text-blue-400', warn: 'text-yellow-400', error: 'text-red-400', debug: 'text-purple-400', security: 'text-orange-400' };
  return colors[level] || 'text-gray-400';
}

function filterLogs(level) {
  G.logFilter = level;
  document.querySelectorAll('.log-filter').forEach(btn => {
    const isActive = btn.dataset.lf === level;
    btn.classList.toggle('bg-blue-500/20', isActive);
    btn.classList.toggle('text-blue-300', isActive);
    btn.classList.toggle('border-blue-500/30', isActive);
  });
  renderSysLogs();
}

function clearSysLogs() {
  if (!confirm('Effacer tous les logs ?')) return;
  G.sysLogs = [];
  renderSysLogs();
  showToast('Logs effacés', 'success');
}

function exportSysLogs() {
  const blob = new Blob([G.sysLogs.map(l => `[${l.timestamp}] ${l.level}: ${l.message}`).join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `logs_systemesged_${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── RBAC ───
function renderRBAC() {
  const container = document.getElementById('rbacCards');
  container.innerHTML = Object.entries(G.roles).map(([key, role]) => `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-white font-semibold">${role.name}</h4>
        <button onclick="openRoleModal('${key}')" class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400"><i class="fas fa-edit"></i></button>
      </div>
      <div class="flex flex-wrap gap-2">
        ${role.perms.map(p => `<span class="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-300">${p}</span>`).join('')}
      </div>
      <p class="text-xs text-blue-300/60 mt-2">${G.users.filter(u => u.role === key).length} utilisateur(s)</p>
    </div>
  `).join('');
}

function openRoleModal(roleKey) {
  document.getElementById('roleModal').classList.remove('hidden');
  if (roleKey) {
    const role = G.roles[roleKey];
    document.getElementById('roleModalTitle').textContent = 'Modifier le rôle';
    document.getElementById('roleModalKey').value = roleKey;
    document.getElementById('roleModalName').value = role.name;
    role.perms.forEach(p => {
      const cb = document.getElementById(`perm_${p}`);
      if (cb) cb.checked = true;
    });
  } else {
    document.getElementById('roleModalTitle').textContent = 'Nouveau rôle';
    document.getElementById('roleModalKey').value = '';
    document.getElementById('roleModalName').value = '';
    document.querySelectorAll('#roleModal input[type="checkbox"]').forEach(cb => cb.checked = false);
  }
}

function closeRoleModal() {
  document.getElementById('roleModal').classList.add('hidden');
}

function saveRole() {
  const key = document.getElementById('roleModalKey').value || generateId();
  const name = document.getElementById('roleModalName').value;
  const perms = ['read', 'write', 'delete', 'users', 'logs', 'api'].filter(p => document.getElementById(`perm_${p}`)?.checked);
  
  G.roles[key] = { name, perms };
  showToast('Rôle enregistré', 'success');
  closeRoleModal();
  renderRBAC();
}

// ─── Storage & Badges ───
function updateStorageDisplay() {
  const used = G.documents.filter(d => !d.isDeleted).reduce((sum, d) => sum + (d.size || 0), 0);
  const limit = CONFIG.plans[G.currentUser?.plan || 'free'].storage;
  const percent = Math.min(100, Math.round((used / limit) * 100));
  
  document.getElementById('storagePercent').textContent = `${percent}%`;
  document.getElementById('storageBar').style.width = `${percent}%`;
  document.getElementById('storageText').textContent = `${formatBytes(used)} / ${formatBytes(limit)}`;
  
  document.getElementById('mobileStoragePercent').textContent = `${percent}%`;
  document.getElementById('mobileStorageBar').style.width = `${percent}%`;
  document.getElementById('mobileStorageText').textContent = `${formatBytes(used)} / ${formatBytes(limit)}`;
}

function updateBadges() {
  const docCount = G.documents.filter(d => !d.isDeleted).length;
  const wfCount = G.workflows.filter(w => ['pending', 'in_review'].includes(w.status)).length;
  const sharedCount = G.shares.filter(s => s.recipientEmail === G.currentUser?.email && s.status === 'active').length;
  
  ['d', 'm'].forEach(prefix => {
    const docBadge = document.getElementById(`${prefix}-docsBadge`);
    const wfBadge = document.getElementById(`${prefix}-wfBadge`);
    const sharedBadge = document.getElementById(`${prefix}-sharedBadge`);
    
    if (docBadge) {
      docBadge.textContent = docCount;
      docBadge.classList.toggle('hidden', docCount === 0);
    }
    if (wfBadge) {
      wfBadge.textContent = wfCount;
      wfBadge.classList.toggle('hidden', wfCount === 0);
    }
    if (sharedBadge) {
      sharedBadge.textContent = sharedCount;
      sharedBadge.classList.toggle('hidden', sharedCount === 0);
    }
  });
}

// ─── Notifications ───
function toggleNotifications() {
  const panel = document.getElementById('notifPanel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) renderNotifications();
}

function closeNotifPanel() {
  document.getElementById('notifPanel').classList.add('hidden');
}

function renderNotifications() {
  const container = document.getElementById('notifContent');
  const badge = document.getElementById('notifCountBadge');
  
  badge.textContent = G.unreadCount;
  badge.classList.toggle('hidden', G.unreadCount === 0);
  document.getElementById('notifBadge').classList.toggle('hidden', G.unreadCount === 0);
  
  if (G.notifications.length === 0) {
    container.innerHTML = '<div class="px-4 py-6 text-center text-blue-300/50 text-sm">Aucune notification</div>';
    return;
  }
  
  container.innerHTML = G.notifications.slice(0, 10).map(n => `
    <div class="px-4 py-3 hover:bg-blue-500/5 cursor-pointer ${n.read ? 'opacity-60' : ''}" onclick="markNotifRead('${n.id}')">
      <div class="flex items-start gap-3">
        <div class="w-8 h-8 rounded-full ${getNotifColor(n.type)} flex items-center justify-center flex-shrink-0">
          <i class="fas ${getNotifIcon(n.type)} text-xs"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-white truncate">${n.message}</p>
          <p class="text-xs text-blue-300/50">${formatDate(n.timestamp)}</p>
        </div>
        ${!n.read ? '<span class="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0 mt-1"></span>' : ''}
      </div>
    </div>
  `).join('');
}

function getNotifColor(type) {
  const colors = { success: 'bg-green-500/20 text-green-400', error: 'bg-red-500/20 text-red-400', warning: 'bg-yellow-500/20 text-yellow-400', info: 'bg-blue-500/20 text-blue-400', security: 'bg-orange-500/20 text-orange-400' };
  return colors[type] || 'bg-blue-500/20 text-blue-400';
}

function getNotifIcon(type) {
  const icons = { success: 'fa-check', error: 'fa-times', warning: 'fa-exclamation', info: 'fa-info', security: 'fa-shield-alt' };
  return icons[type] || 'fa-info';
}

function markNotifRead(id) {
  const n = G.notifications.find(x => x.id === id);
  if (n && !n.read) {
    n.read = true;
    G.unreadCount = Math.max(0, G.unreadCount - 1);
    renderNotifications();
    updateNotifBadge();
  }
}

function markAllNotifRead() {
  G.notifications.forEach(n => n.read = true);
  G.unreadCount = 0;
  renderNotifications();
  updateNotifBadge();
}

function updateNotifBadge() {
  document.getElementById('notifBadge').classList.toggle('hidden', G.unreadCount === 0);
}

// ─── Recherche ───
function handleGlobalSearch(query) {
  if (!query || query.length < 2) {
    document.getElementById('searchDropdown').classList.add('hidden');
    return;
  }
  
  const results = [
    ...G.documents.filter(d => !d.isDeleted && d.name.toLowerCase().includes(query.toLowerCase())).map(d => ({ type: 'doc', ...d })),
    ...G.users.filter(u => u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase())).map(u => ({ type: 'user', ...u })),
    ...G.workflows.filter(w => w.title.toLowerCase().includes(query.toLowerCase())).map(w => ({ type: 'workflow', ...w }))
  ].slice(0, 8);
  
  const dropdown = document.getElementById('searchDropdown');
  if (results.length === 0) {
    dropdown.classList.add('hidden');
    return;
  }
  
  dropdown.innerHTML = results.map(r => `
    <div class="px-4 py-2 hover:bg-blue-500/10 cursor-pointer flex items-center gap-3" onclick="handleSearchResult('${r.type}', '${r.id}')">
      <i class="fas ${r.type === 'doc' ? getFileIcon(r.type).split(' ')[0] : r.type === 'user' ? 'fa-user' : 'fa-project-diagram'} text-blue-400"></i>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white truncate">${r.name || r.title}</p>
        <p class="text-xs text-blue-300/60 capitalize">${r.type}</p>
      </div>
    </div>
  `).join('');
  
  dropdown.classList.remove('hidden');
}

function handleSearchResult(type, id) {
  document.getElementById('searchDropdown').classList.add('hidden');
  document.getElementById('globalSearch').value = '';
  
  if (type === 'doc') openPreviewModal(id);
  else if (type === 'user') { switchView('users'); }
  else if (type === 'workflow') openWfDetail(id);
}

// ─── Drag & Drop ───
function handleDocDragStart(e, docId) {
  G.dragState = { isDragging: true, sourceId: docId, sourceType: 'document' };
  e.dataTransfer.effectAllowed = 'move';
}

// ─── Éditeur collaboratif ───
function openCollabEditor(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  G.collab.docId = docId;
  document.getElementById('collabEditorTitle').textContent = doc.name;
  document.getElementById('collabEditorType').textContent = doc.type;
  document.getElementById('collabEditorArea').value = doc.content || '';
  document.getElementById('collabEditorModal').classList.remove('hidden');
  
  updateCollabWordCount();
  addAudit('edit', 'document', docId);
}

function closeCollabEditor() {
  document.getElementById('collabEditorModal').classList.add('hidden');
  G.collab.docId = null;
}

function onCollabEditorInput(e) {
  const doc = G.documents.find(d => d.id === G.collab.docId);
  if (doc) {
    doc.content = e.target.value;
    doc.updatedAt = new Date().toISOString();
  }
}

function updateCollabWordCount() {
  const text = document.getElementById('collabEditorArea')?.value || '';
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  document.getElementById('collabWordCount').textContent = `${words} mot${words > 1 ? 's' : ''}`;
}

// ─── Éditeur riche ───
function openRichEditor(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  G.richEditor.docId = docId;
  document.getElementById('richEditorTitle').textContent = doc.name;
  document.getElementById('richEditorContent').innerHTML = doc.content || '<p>Commencez à écrire...</p>';
  document.getElementById('richEditorModal').classList.remove('hidden');
  addAudit('edit', 'document', docId);
}

function closeRichEditor() {
  document.getElementById('richEditorModal').classList.add('hidden');
  G.richEditor.docId = null;
}

function richCmd(command, value = null) {
  document.execCommand(command, false, value);
  document.getElementById('richEditorContent').focus();
}

function richAlign(align) {
  document.execCommand('justify' + align.charAt(0).toUpperCase() + align.slice(1), false, null);
}

function richInsertHeading(level) {
  document.execCommand('formatBlock', false, `H${level}`);
}

function richInsertLink() {
  const url = prompt('URL du lien:');
  if (url) document.execCommand('createLink', false, url);
}

function richInsertCodeBlock() {
  document.execCommand('formatBlock', false, 'PRE');
}

function richInsertTable() {
  const html = '<table class="w-full border-collapse"><tr><td class="border border-blue-500/30 p-2">Cellule 1</td><td class="border border-blue-500/30 p-2">Cellule 2</td></tr></table>';
  document.execCommand('insertHTML', false, html);
}

function richInsertMention() {
  const user = prompt('@Utilisateur:');
  if (user) document.execCommand('insertHTML', false, `<span class="text-blue-400">@${user}</span>`);
}

function _onRichEditorInput() {
  const doc = G.documents.find(d => d.id === G.richEditor.docId);
  if (doc) {
    doc.content = document.getElementById('richEditorContent').innerHTML;
  }
  const text = document.getElementById('richEditorContent').innerText || '';
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  document.getElementById('richEditorWordCount').textContent = `${words} mot${words > 1 ? 's' : ''}`;
}

function _saveRichContent() {
  saveDocuments();
  showToast('Document enregistré', 'success');
  document.getElementById('richSaveStatus').innerHTML = '<i class="fas fa-check text-green-400 mr-1"></i><span class="text-green-400 text-xs">Enregistré</span>';
  setTimeout(() => document.getElementById('richSaveStatus').innerHTML = '', 2000);
}

// ─── Dossiers ───
function renderFolders() {
  renderFolderBreadcrumb();
  renderFolderTree();
  renderFolderContents();
}

function renderFolderBreadcrumb() {
  const container = document.getElementById('folderBreadcrumb');
  container.innerHTML = G.folderPath.map((f, idx) => `
    <button onclick="navigateToFolder(${idx})" class="text-sm ${idx === G.folderPath.length - 1 ? 'text-white font-medium' : 'text-blue-400 hover:text-blue-300'}">
      ${f.name}
    </button>
    ${idx < G.folderPath.length - 1 ? '<i class="fas fa-chevron-right text-blue-400/40 text-xs"></i>' : ''}
  `).join('');
}

function renderFolderTree() {
  const container = document.getElementById('folderSidebarTree');
  const folders = G.folders.filter(f => f.parentId === '__root__');
  
  container.innerHTML = folders.map(f => `
    <div class="cursor-pointer" onclick="openFolder('${f.id}', '${f.name}')">
      <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-500/10 text-blue-300/70 text-xs">
        <i class="fas fa-folder text-yellow-400/60 text-xs"></i>
        <span>${f.name}</span>
      </div>
    </div>
  `).join('');
}

function renderFolderContents() {
  const folderGrid = document.getElementById('folderContentsGrid');
  const docGrid = document.getElementById('folderDocGrid');
  
  const subFolders = G.folders.filter(f => f.parentId === G.currentFolderId);
  const docs = G.documents.filter(d => !d.isDeleted && d.folderId === G.currentFolderId);
  
  folderGrid.innerHTML = subFolders.map(f => `
    <div class="glass-card rounded-xl p-4 border border-yellow-500/20 cursor-pointer hover:border-yellow-400/40" onclick="openFolder('${f.id}', '${f.name}')">
      <div class="flex items-center gap-3">
        <i class="fas fa-folder text-yellow-400 text-2xl"></i>
        <span class="text-white font-medium">${f.name}</span>
      </div>
    </div>
  `).join('');
  
  if (subFolders.length === 0) folderGrid.innerHTML = '';
  
  docGrid.innerHTML = docs.map(d => renderDocCard(d)).join('');
  if (docs.length === 0) {
    docGrid.innerHTML = '<div class="col-span-full text-center py-8 text-blue-300/50">Aucun document dans ce dossier</div>';
  }
}

function openFolder(id, name) {
  G.currentFolderId = id;
  const existingIdx = G.folderPath.findIndex(f => f.id === id);
  if (existingIdx >= 0) {
    G.folderPath = G.folderPath.slice(0, existingIdx + 1);
  } else {
    G.folderPath.push({ id, name });
  }
  renderFolders();
}

function navigateToFolder(idx) {
  G.folderPath = G.folderPath.slice(0, idx + 1);
  G.currentFolderId = G.folderPath[idx].id;
  renderFolders();
}

function openFolderModal() {
  document.getElementById('folderModal').classList.remove('hidden');
  document.getElementById('newFolderName').value = '';
  document.getElementById('newFolderName').focus();
}

function closeFolderModal() {
  document.getElementById('folderModal').classList.add('hidden');
}

function createFolder() {
  const name = document.getElementById('newFolderName').value.trim();
  if (!name) return;
  
  G.folders.push({
    id: generateId(),
    name,
    parentId: G.currentFolderId,
    createdAt: new Date().toISOString()
  });
  
  saveFolders();
  closeFolderModal();
  renderFolders();
  showToast('Dossier créé', 'success');
}

// ─── Signatures ───
function renderSignatures() {
  const pending = G.signatures.filter(s => s.status === 'pending').length;
  const signed = G.signatures.filter(s => s.status === 'signed').length;
  const rejected = G.signatures.filter(s => s.status === 'rejected').length;
  
  document.getElementById('sigStatPending').textContent = pending;
  document.getElementById('sigStatSigned').textContent = signed;
  document.getElementById('sigStatRejected').textContent = rejected;
  
  const container = document.getElementById('signaturesList');
  if (G.signatures.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-signature text-4xl mb-3 block opacity-20"></i><p>Aucune signature</p></div>';
    return;
  }
  
  container.innerHTML = G.signatures.map(s => {
    const doc = G.documents.find(d => d.id === s.documentId);
    return `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400"><i class="fas fa-file-signature"></i></div>
          <div>
            <p class="text-white font-medium">${doc?.name || 'Document inconnu'}</p>
            <p class="text-xs text-blue-300/60">Signataire: ${s.signerEmail}</p>
          </div>
        </div>
        <span class="px-3 py-1 rounded-full text-xs ${getSigStatusClass(s.status)}">${s.status}</span>
      </div>
    `;
  }).join('');
}

function getSigStatusClass(status) {
  const classes = { pending: 'bg-yellow-500/20 text-yellow-300', signed: 'bg-green-500/20 text-green-300', rejected: 'bg-red-500/20 text-red-300' };
  return classes[status] || 'bg-gray-500/20 text-gray-300';
}

function openSignModal() {
  document.getElementById('signatureModal').classList.remove('hidden');
  initSignaturePad();
}

function closeSignModal() {
  document.getElementById('signatureModal').classList.add('hidden');
}

function initSignaturePad() {
  const canvas = document.getElementById('signatureCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 2;
  
  let drawing = false;
  
  canvas.onmousedown = (e) => {
    drawing = true;
    ctx.beginPath();
    ctx.moveTo(e.offsetX, e.offsetY);
  };
  
  canvas.onmousemove = (e) => {
    if (!drawing) return;
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
  };
  
  canvas.onmouseup = () => drawing = false;
  canvas.onmouseleave = () => drawing = false;
}

function clearSignature() {
  const canvas = document.getElementById('signatureCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function submitSignature() {
  showToast('Signature enregistrée', 'success');
  closeSignModal();
}

// ─── AI ───
function renderAI() {
  const container = document.getElementById('aiDocsList');
  const docs = G.documents.filter(d => !d.isDeleted).slice(0, 10);
  
  container.innerHTML = docs.map(d => `
    <div class="glass-card rounded-xl p-4 border border-pink-500/20">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <i class="fas ${getFileIcon(d.type).split(' ')[0]} text-pink-400"></i>
          <span class="text-white font-medium">${d.name}</span>
        </div>
        <button onclick="analyzeDocument('${d.id}')" class="px-3 py-1.5 rounded-lg bg-pink-500/20 text-pink-400 text-xs hover:bg-pink-500/30">
          <i class="fas fa-robot mr-1"></i>Analyser
        </button>
      </div>
      <div id="ai-result-${d.id}" class="mt-3 hidden">
        <div class="p-3 rounded-lg bg-pink-500/5 border border-pink-500/10">
          <p class="text-xs text-pink-300/70"><i class="fas fa-spinner fa-spin mr-1"></i>Analyse en cours...</p>
        </div>
      </div>
    </div>
  `).join('');
}

function analyzeDocument(docId) {
  const resultDiv = document.getElementById(`ai-result-${docId}`);
  resultDiv.classList.remove('hidden');
  
  setTimeout(() => {
    resultDiv.innerHTML = `
      <div class="p-3 rounded-lg bg-pink-500/5 border border-pink-500/10">
        <p class="text-xs text-pink-300 font-medium mb-2">Résumé IA:</p>
        <p class="text-sm text-white/80">Document analysé. Contenu principal identifié avec 95% de confiance.</p>
        <div class="flex gap-2 mt-2">
          <span class="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-300">Contrat</span>
          <span class="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-300">Confiance: 95%</span>
        </div>
      </div>
    `;
  }, 2000);
}

function analyzeAllDocuments() {
  showToast('Analyse de tous les documents lancée', 'info');
}

// ─── Automatisation ───
function renderAutomation() {
  const container = document.getElementById('automationRulesList');
  document.getElementById('automationStats').textContent = `${G.automationRules.length} règle(s) active(s)`;
  
  if (G.automationRules.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-magic text-4xl mb-3 block opacity-20"></i><p>Aucune règle d\'automatisation</p></div>';
    return;
  }
  
  container.innerHTML = G.automationRules.map(r => `
    <div class="glass-card rounded-xl p-4 border border-orange-500/20">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-white font-medium">${r.name}</p>
          <p class="text-xs text-blue-300/60">${r.trigger} → ${r.action}</p>
        </div>
        <div class="flex gap-2">
          <span class="px-2 py-1 rounded-full text-xs ${r.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}">${r.active ? 'Actif' : 'Inactif'}</span>
          <button onclick="deleteAutomationRule('${r.id}')" class="p-2 text-red-400 hover:text-red-300"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>
  `).join('');
}

function openWfRuleModal() {
  document.getElementById('wfRuleModal').classList.remove('hidden');
}

function closeWfRuleModal() {
  document.getElementById('wfRuleModal').classList.add('hidden');
}

function createWfRule(e) {
  e.preventDefault();
  
  const rule = {
    id: generateId(),
    name: document.getElementById('wfRuleName').value,
    trigger: document.getElementById('wfRuleTrigger').value,
    action: document.getElementById('wfRuleAction').value,
    active: true,
    createdAt: new Date().toISOString()
  };
  
  G.automationRules.push(rule);
  saveAutomationRules();
  closeWfRuleModal();
  renderAutomation();
  showToast('Règle créée', 'success');
}

function deleteAutomationRule(id) {
  G.automationRules = G.automationRules.filter(r => r.id !== id);
  saveAutomationRules();
  renderAutomation();
}

// ─── Intégrations ───
function renderIntegrations() {
  const container = document.getElementById('integrationsGrid');
  const integrations = [
    { name: 'Slack', icon: 'fab fa-slack', color: 'purple', desc: 'Notifications' },
    { name: 'Zapier', icon: 'fas fa-bolt', color: 'orange', desc: 'Automatisation' },
    { name: 'Google Drive', icon: 'fab fa-google-drive', color: 'green', desc: 'Stockage' },
    { name: 'Dropbox', icon: 'fab fa-dropbox', color: 'blue', desc: 'Stockage' },
    { name: 'Salesforce', icon: 'fab fa-salesforce', color: 'blue', desc: 'CRM' },
    { name: 'HubSpot', icon: 'fas fa-hubspot', color: 'orange', desc: 'CRM' },
    { name: 'Microsoft 365', icon: 'fab fa-microsoft', color: 'blue', desc: 'Bureautique' },
    { name: 'Notion', icon: 'fas fa-sticky-note', color: 'gray', desc: 'Notes' }
  ];
  
  container.innerHTML = integrations.map(i => `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20 hover:border-${i.color}-400/40 cursor-pointer transition-all">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-lg bg-${i.color}-500/20 flex items-center justify-center text-${i.color}-400">
          <i class="${i.icon}"></i>
        </div>
        <div>
          <p class="text-white font-medium">${i.name}</p>
          <p class="text-xs text-blue-300/60">${i.desc}</p>
        </div>
      </div>
      <button class="w-full py-2 rounded-lg bg-blue-500/10 text-blue-400 text-xs hover:bg-blue-500/20">Connecter</button>
    </div>
  `).join('');
}

// ─── Backups ───
function renderBackups() {
  const container = document.getElementById('backupsList');
  
  if (G.backups.length === 0) {
    document.getElementById('backupStats').textContent = 'Aucune sauvegarde';
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-database text-4xl mb-3 block opacity-20"></i><p>Aucune sauvegarde disponible</p></div>';
    return;
  }
  
  document.getElementById('backupStats').textContent = `${G.backups.length} sauvegarde(s) • Dernière: ${formatDate(G.backups[0].createdAt)}`;
  
  container.innerHTML = G.backups.map(b => `
    <div class="glass-card rounded-xl p-4 border border-teal-500/20 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <i class="fas fa-archive text-teal-400 text-xl"></i>
        <div>
          <p class="text-white font-medium">${b.name}</p>
          <p class="text-xs text-blue-300/60">${b.type} • ${formatBytes(b.size)} • ${formatDate(b.createdAt)}</p>
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick="restoreBackup('${b.id}')" class="px-3 py-1.5 rounded-lg bg-teal-500/20 text-teal-400 text-xs hover:bg-teal-500/30">Restaurer</button>
        <button onclick="deleteBackup('${b.id}')" class="p-2 text-red-400 hover:text-red-300"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

function createBackup(type) {
  const backup = {
    id: generateId(),
    name: `Backup ${new Date().toLocaleString('fr-FR')}`,
    type: type === 'full' ? 'Complète' : 'Documents',
    size: G.documents.reduce((sum, d) => sum + (d.size || 0), 0),
    createdAt: new Date().toISOString()
  };
  
  G.backups.unshift(backup);
  saveBackups();
  renderBackups();
  showToast('Sauvegarde créée', 'success');
}

function restoreBackup(id) {
  showToast('Restauration en cours...', 'info');
}

function deleteBackup(id) {
  G.backups = G.backups.filter(b => b.id !== id);
  saveBackups();
  renderBackups();
}

// ─── API Keys v6 ───
function renderApiKeys() {
  const container = document.getElementById('apiKeysList2');
  
  if (G.apiKeys.length === 0) {
    container.innerHTML = '<div class="text-center py-8 text-blue-300/50"><p class="text-sm">Aucune clé API</p></div>';
    return;
  }
  
  container.innerHTML = G.apiKeys.map(k => `
    <div class="glass-card rounded-xl p-4 border border-green-500/20 flex items-center justify-between">
      <div>
        <p class="text-white font-medium text-sm">${k.name}</p>
        <p class="text-xs text-green-400/60 font-mono">${k.key.substr(0, 20)}...</p>
        <p class="text-xs text-blue-300/40">Créée le ${formatDate(k.createdAt)}</p>
      </div>
      <button onclick="revokeApiKey('${k.id}')" class="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30">Révoquer</button>
    </div>
  `).join('');
}

function generateApiKeyV6() {
  const name = document.getElementById('apiKeyName').value || `Clé ${G.apiKeys.length + 1}`;
  const key = `ged_${generateId()}_${generateId().substr(0, 16)}`;
  
  const perms = [];
  if (document.getElementById('perm_api_documents')?.checked) perms.push('documents');
  if (document.getElementById('perm_api_workflows')?.checked) perms.push('workflows');
  if (document.getElementById('perm_api_analytics')?.checked) perms.push('analytics');
  if (document.getElementById('perm_api_shares')?.checked) perms.push('shares');
  
  G.apiKeys.push({
    id: generateId(),
    name,
    key,
    permissions: perms,
    createdAt: new Date().toISOString(),
    lastUsed: null
  });
  
  saveApiKeys();
  
  document.getElementById('newApiKeyDisplay').textContent = key;
  document.getElementById('newApiKeyWrapper').classList.remove('hidden');
  renderApiKeys();
  showToast('Clé API générée', 'success');
}

function revokeApiKey(id) {
  G.apiKeys = G.apiKeys.filter(k => k.id !== id);
  saveApiKeys();
  renderApiKeys();
  showToast('Clé révoquée', 'success');
}

function copyApiKey(key) {
  navigator.clipboard.writeText(key).then(() => showToast('Clé copiée', 'success'));
}

// ─── Billing v6 ───
function renderBillingV6() {
  const container = document.getElementById('billingV6Content');
  const plan = CONFIG.plans[G.currentUser?.plan || 'free'];
  
  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="glass-card rounded-2xl p-6 border border-blue-500/20">
        <h3 class="text-white font-bold mb-4">Plan actuel</h3>
        <div class="flex items-center justify-between mb-4">
          <span class="text-3xl font-bold text-white">${plan.name}</span>
          <span class="badge-plan badge-${G.currentUser?.plan || 'free'}">${plan.name.toUpperCase()}</span>
        </div>
        <p class="text-blue-300/70 mb-4">${plan.users} utilisateurs • ${formatBytes(plan.storage)}</p>
        <ul class="space-y-2 text-sm text-blue-300/60">
          ${plan.features.map(f => `<li><i class="fas fa-check text-green-400 mr-2"></i>${f}</li>`).join('')}
        </ul>
      </div>
      <div class="lg:col-span-2 glass-card rounded-2xl p-6 border border-blue-500/20">
        <h3 class="text-white font-bold mb-4">Historique de facturation</h3>
        <div class="space-y-3">
          <div class="flex items-center justify-between p-3 rounded-lg bg-slate-900/30">
            <div>
              <p class="text-white text-sm">Facture #001</p>
              <p class="text-xs text-blue-300/60">01/01/2024</p>
            </div>
            <span class="text-green-400 text-sm">Payée</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── Audit v6 ───
function renderAuditV6() {
  renderAuditStats();
  renderSecurityAlerts();
  renderAuditTimeline();
}

function renderAuditStats() {
  const grid = document.getElementById('auditStatsGrid');
  const days = G.auditFilter.days || 30;
  const filtered = G.auditLog.filter(l => new Date(l.timestamp) > new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  
  const stats = {
    total: filtered.length,
    login: filtered.filter(l => l.action === 'login').length,
    upload: filtered.filter(l => l.action === 'upload').length,
    share: filtered.filter(l => l.action === 'share').length,
    delete: filtered.filter(l => l.action === 'delete').length,
    security: filtered.filter(l => l.level === 'security').length
  };
  
  grid.innerHTML = [
    { label: 'Total', value: stats.total, color: 'blue' },
    { label: 'Connexions', value: stats.login, color: 'green' },
    { label: 'Uploads', value: stats.upload, color: 'purple' },
    { label: 'Partages', value: stats.share, color: 'cyan' },
    { label: 'Suppressions', value: stats.delete, color: 'red' },
    { label: 'Sécurité', value: stats.security, color: 'orange' }
  ].map(s => `
    <div class="glass-card rounded-xl p-3 border border-${s.color}-500/20 text-center">
      <p class="text-2xl font-bold text-${s.color}-400">${s.value}</p>
      <p class="text-xs text-blue-300/60">${s.label}</p>
    </div>
  `).join('');
}

function renderSecurityAlerts() {
  const container = document.getElementById('securityAlertsList');
  const alerts = G.sysLogs.filter(l => l.level === 'security').slice(0, 5);
  
  if (alerts.length === 0) {
    container.innerHTML = '<p class="text-blue-300/50 text-sm text-center py-4">Aucune alerte sécurité</p>';
    return;
  }
  
  container.innerHTML = alerts.map(a => `
    <div class="flex items-center gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
      <i class="fas fa-exclamation-triangle text-red-400"></i>
      <div class="flex-1">
        <p class="text-sm text-white">${a.message}</p>
        <p class="text-xs text-blue-300/60">${formatDate(a.timestamp)}</p>
      </div>
    </div>
  `).join('');
}

function renderAuditTimeline() {
  const container = document.getElementById('auditTimelineList');
  const days = G.auditFilter.days || 30;
  let filtered = G.auditLog.filter(l => new Date(l.timestamp) > new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  
  if (G.auditFilter.severity) filtered = filtered.filter(l => l.level === G.auditFilter.severity);
  if (G.auditFilter.action) filtered = filtered.filter(l => l.action.includes(G.auditFilter.action));
  
  container.innerHTML = filtered.slice(0, 100).map(l => `
    <div class="flex items-start gap-3 p-3 border-b border-blue-500/10 hover:bg-blue-500/5">
      <div class="w-2 h-2 rounded-full mt-2 ${getLogLevelColor(l.level).replace('text-', 'bg-')}"></div>
      <div class="flex-1">
        <p class="text-sm text-white">${l.action} ${l.targetType}</p>
        <p class="text-xs text-blue-300/60">${l.userEmail} • ${formatDate(l.timestamp)}</p>
      </div>
    </div>
  `).join('');
}

function setAuditFilter(key, value) {
  G.auditFilter[key] = value;
  renderAuditV6();
}

// ─── Analytics ───
function renderAnalytics() {
  document.getElementById('analyticsLoading').textContent = 'Chargement des données...';
  
  setTimeout(() => {
    document.getElementById('analyticsLoading').textContent = '';
    renderAnalyticsKPIs();
    renderActivityChart();
    renderWorkflowChart();
    renderTopDocs();
    renderTopUsers();
  }, 500);
}

function renderAnalyticsKPIs() {
  const container = document.getElementById('analyticsKpiCards');
  const stats = {
    totalViews: G.documents.reduce((sum, d) => sum + (d.views || 0), 0),
    totalDownloads: G.documents.reduce((sum, d) => sum + (d.downloads || 0), 0),
    activeUsers: G.users.filter(u => u.status === 'active').length,
    avgProcessTime: '2.5j'
  };
  
  container.innerHTML = [
    { label: 'Vues totales', value: stats.totalViews, icon: 'fa-eye', color: 'blue' },
    { label: 'Téléchargements', value: stats.totalDownloads, icon: 'fa-download', color: 'green' },
    { label: 'Utilisateurs actifs', value: stats.activeUsers, icon: 'fa-users', color: 'purple' },
    { label: 'Temps moyen', value: stats.avgProcessTime, icon: 'fa-clock', color: 'orange' }
  ].map(s => `
    <div class="glass-card rounded-xl p-4 border border-${s.color}-500/20">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-2xl font-bold text-white">${s.value}</p>
          <p class="text-xs text-blue-300/60">${s.label}</p>
        </div>
        <div class="w-10 h-10 rounded-lg bg-${s.color}-500/20 flex items-center justify-center text-${s.color}-400">
          <i class="fas ${s.icon}"></i>
        </div>
      </div>
    </div>
  `).join('');
}

function renderActivityChart() {
  const container = document.getElementById('analyticsActivityChart');
  const days = 14;
  const data = Array.from({ length: days }, (_, i) => ({
    day: new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR', { weekday: 'short' }),
    value: Math.floor(Math.random() * 50) + 10
  }));
  
  const max = Math.max(...data.map(d => d.value));
  
  container.innerHTML = `
    <div class="analytics-bar-wrap h-24 items-end">
      ${data.map(d => `
        <div class="flex-1 flex flex-col items-center gap-1">
          <div class="w-full bg-blue-500/30 rounded-t" style="height:${(d.value / max) * 100}%"></div>
          <span class="text-[10px] text-blue-300/60">${d.day}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderWorkflowChart() {
  const container = document.getElementById('analyticsWorkflowChart');
  const stats = {
    pending: G.workflows.filter(w => w.status === 'pending').length,
    in_review: G.workflows.filter(w => w.status === 'in_review').length,
    approved: G.workflows.filter(w => w.status === 'approved').length,
    rejected: G.workflows.filter(w => w.status === 'rejected').length
  };
  const total = Object.values(stats).reduce((a, b) => a + b, 0) || 1;
  
  container.innerHTML = Object.entries(stats).map(([status, count]) => `
    <div class="flex items-center gap-2">
      <div class="flex-1 h-2 bg-slate-900/50 rounded-full overflow-hidden">
        <div class="h-full rounded-full ${getWfStatusClass(status).split(' ')[0].replace('bg-', 'bg-')}" style="width:${(count / total) * 100}%"></div>
      </div>
      <span class="text-xs text-blue-300/60 w-16">${getWfStatusLabel(status)}: ${count}</span>
    </div>
  `).join('');
}

function renderTopDocs() {
  const container = document.getElementById('analyticsTopDocs');
  const topDocs = [...G.documents].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
  
  container.innerHTML = topDocs.map((d, i) => `
    <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-500/5">
      <span class="text-lg font-bold text-blue-400/40 w-6">${i + 1}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white truncate">${d.name}</p>
        <p class="text-xs text-blue-300/60">${d.views || 0} vues</p>
      </div>
    </div>
  `).join('');
}

function renderTopUsers() {
  const container = document.getElementById('analyticsTopUsers');
  const userActivity = G.users.map(u => ({
    ...u,
    docCount: G.documents.filter(d => d.ownerId === u.id).length
  })).sort((a, b) => b.docCount - a.docCount).slice(0, 5);
  
  container.innerHTML = userActivity.map((u, i) => `
    <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-500/5">
      <span class="text-lg font-bold text-blue-400/40 w-6">${i + 1}</span>
      <div class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-xs">${u.name.charAt(0)}</div>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white truncate">${u.name}</p>
        <p class="text-xs text-blue-300/60">${u.docCount} documents</p>
      </div>
    </div>
  `).join('');
}

function refreshAnalytics() {
  renderAnalytics();
  showToast('Données actualisées', 'success');
}

// ─── Recherche avancée ───
function renderAdvancedSearch() {
  runAdvSearch();
}

function runAdvSearch() {
  const query = document.getElementById('advSearchInput')?.value.toLowerCase() || '';
  const type = document.getElementById('advSearchType')?.value;
  const date = document.getElementById('advSearchDate')?.value;
  const size = document.getElementById('advSearchSize')?.value;
  
  let results = G.documents.filter(d => !d.isDeleted);
  
  if (query) results = results.filter(d => d.name.toLowerCase().includes(query) || (d.description || '').toLowerCase().includes(query) || d.tags?.some(t => t.toLowerCase().includes(query)));
  if (type) results = results.filter(d => d.type === type);
  if (date) {
    const now = new Date();
    results = results.filter(d => {
      const docDate = new Date(d.createdAt);
      if (date === 'today') return docDate.toDateString() === now.toDateString();
      if (date === 'week') return (now - docDate) < 7 * 24 * 60 * 60 * 1000;
      if (date === 'month') return (now - docDate) < 30 * 24 * 60 * 60 * 1000;
      return true;
    });
  }
  if (size) {
    results = results.filter(d => {
      if (size === 'small') return d.size < 1024 * 1024;
      if (size === 'medium') return d.size >= 1024 * 1024 && d.size <= 10 * 1024 * 1024;
      if (size === 'large') return d.size > 10 * 1024 * 1024;
      return true;
    });
  }
  
  document.getElementById('advSearchCount').textContent = `${results.length} résultat(s)`;
  
  const container = document.getElementById('advSearchResults');
  if (results.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-search text-4xl mb-3 block opacity-20"></i><p>Aucun résultat</p></div>';
    return;
  }
  
  container.innerHTML = `<div class="doc-grid">${results.map(d => renderDocCard(d)).join('')}</div>`;
}

function clearAdvSearch() {
  document.getElementById('advSearchInput').value = '';
  document.getElementById('advSearchType').value = '';
  document.getElementById('advSearchDate').value = '';
  document.getElementById('advSearchSize').value = '';
  runAdvSearch();
}

// ─── Versioning ───
function renderVersioning() {
  const container = document.getElementById('versionDocList');
  const docs = G.documents.filter(d => !d.isDeleted).slice(0, 20);
  
  container.innerHTML = docs.map(d => `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <i class="fas ${getFileIcon(d.type).split(' ')[0]} text-blue-400"></i>
          <div>
            <p class="text-white font-medium">${d.name}</p>
            <p class="text-xs text-blue-300/60">v${d.version} • ${formatDate(d.updatedAt)}</p>
          </div>
        </div>
        <button onclick="showVersions('${d.id}')" class="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30">Versions</button>
      </div>
    </div>
  `).join('');
}

function showVersions(docId) {
  showToast('Historique des versions', 'info');
}

// ─── RBAC v7 ───
function renderRBACV7() {
  const rolesGrid = document.getElementById('rbacV7RolesGrid');
  const permMatrix = document.getElementById('rbacV7PermMatrix');
  
  rolesGrid.innerHTML = Object.entries(G.roles).map(([key, role]) => `
    <div class="glass-card rounded-xl p-4 border border-red-500/20">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-white font-semibold">${role.name}</h4>
        <button onclick="deleteRoleV7('${key}')" class="p-1 text-red-400 hover:text-red-300"><i class="fas fa-trash"></i></button>
      </div>
      <div class="flex flex-wrap gap-1">
        ${role.perms.map(p => `<span class="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">${p}</span>`).join('')}
      </div>
    </div>
  `).join('');
  
  const allPerms = ['read', 'write', 'delete', 'share', 'download', 'users', 'roles', 'logs', 'api', 'billing', 'settings'];
  permMatrix.innerHTML = allPerms.map(p => `
    <div class="glass-card rounded-xl p-3 border border-blue-500/10">
      <div class="flex items-center justify-between">
        <span class="text-sm text-white capitalize">${p}</span>
        <input type="checkbox" class="rounded text-blue-500" checked disabled>
      </div>
    </div>
  `).join('');
}

function createRoleV7() {
  const name = document.getElementById('newRoleName').value.trim();
  if (!name) return;
  
  const key = name.toLowerCase().replace(/\s+/g, '_');
  G.roles[key] = { name, perms: ['read'] };
  
  document.getElementById('newRoleName').value = '';
  renderRBACV7();
  showToast('Rôle créé', 'success');
}

function deleteRoleV7(key) {
  if (key === 'admin' || key === 'viewer') {
    showToast('Ce rôle ne peut pas être supprimé', 'error');
    return;
  }
  delete G.roles[key];
  renderRBACV7();
}

// ─── Recherche v7 ───
function renderSearchV7() {
  // Initialisation de la recherche FTS
}

function runFTSearch() {
  const query = document.getElementById('ftsInput')?.value.toLowerCase() || '';
  const type = document.getElementById('ftsType')?.value;
  const date = document.getElementById('ftsDate')?.value;
  
  if (query.length < 3) return;
  
  let results = G.documents.filter(d => !d.isDeleted && (d.name.toLowerCase().includes(query) || (d.content || '').toLowerCase().includes(query)));
  
  if (type) results = results.filter(d => d.type === type);
  if (date) {
    const now = new Date();
    results = results.filter(d => {
      const docDate = new Date(d.createdAt);
      if (date === 'today') return docDate.toDateString() === now.toDateString();
      if (date === 'week') return (now - docDate) < 7 * 24 * 60 * 60 * 1000;
      if (date === 'month') return (now - docDate) < 30 * 24 * 60 * 60 * 1000;
      return true;
    });
  }
  
  document.getElementById('ftsCount').textContent = `${results.length} résultat(s)`;
  
  const container = document.getElementById('searchV7Results');
  container.innerHTML = results.length === 0 
    ? '<div class="text-center py-12 text-blue-300/50"><p>Aucun résultat</p></div>'
    : `<div class="doc-grid">${results.map(d => renderDocCard(d)).join('')}</div>`;
}

// ─── Realtime sync simulation ───
function startRealtimeSync() {
  setInterval(() => {
    // Simulation de mises à jour temps réel
    if (Math.random() > 0.95) {
      logInfo('Sync temps réel: vérification des mises à jour');
    }
  }, 30000);
}

// ─── Context menu ───
function showDocContextMenu(e, docId) {
  e.preventDefault();
  // Menu contextuel simplifié
  if (confirm('Supprimer ce document ?')) {
    deleteDocument(docId);
  }
}

function deleteDocument(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  if (doc.ownerId !== G.currentUser?.id && G.currentUser?.role !== 'admin') {
    showToast('Permission refusée', 'error');
    return;
  }
  
  doc.isDeleted = true;
  doc.deletedAt = new Date().toISOString();
  saveDocuments();
  
  showToast('Document déplacé vers la corbeille', 'success');
  addAudit('delete', 'document', docId);
  renderDocuments();
  updateBadges();
  updateStorageDisplay();
}

// ─── Keyboard shortcuts ───
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    document.getElementById('globalSearch')?.focus();
  }
  if (e.key === 'Escape') {
    closeUploadModal();
    closeShareModal();
    closePreviewModal();
    closeWorkflowModal();
    closeWfDetail();
    closeCollabEditor();
    closeRichEditor();
    closeFolderModal();
    closeSignModal();
    closeRequestSignatureModal();
    closeWfRuleModal();
    closeRoleModal();
    closeAddUserModal();
    closeEditUserModal();
    closeDangerModal();
    closePermModal();
    closeNotifPanel();
  }
});

// ─── Initialization ───
document.addEventListener('DOMContentLoaded', () => {
  logInfo('SystemesGED v5.0 démarré');
  
  // Check for saved session
  const savedUser = localStorage.getItem('currentUser');
  if (savedUser) {
    G.currentUser = JSON.parse(savedUser);
    G.currentCompany = JSON.parse(localStorage.getItem('currentCompany') || '{}');
    initializeApp();
  }
});

// Expose functions globally for HTML onclick handlers
Object.assign(window, {
  switchAuthTab, togglePwdInput, handleLogin, handleRegister, demoLogin, oauthLogin, handleLogout,
  switchView, openMobileSidebar, closeMobileSidebar,
  openUploadModal, closeUploadModal, setDocScope, handleDragOver, handleDragLeave, handleDrop,
  handleFileSelect, handleFilePickerSelect, handleDocDrop, uploadDocument, addUploadTag, removeUploadTag,
  openPreviewModal, closePreviewModal, downloadCurrentDocument, shareCurrentDocument, downloadDocument,
  openShareModal, closeShareModal, switchShareTab, shareDocument, copyShareLink, loadShareHistory,
  openCreateWorkflowModal, closeWorkflowModal, addWfStep, createWorkflow, openWfDetail, closeWfDetail,
  actOnWorkflow, addWfComment, filterWorkflows, searchWorkflows, setWfView,
  openCreateUserModal, closeAddUserModal, addUser, openEditUserModal, closeEditUserModal, saveEditUser, deleteUser,
  createTag, deleteTag, selectPlan, simulateUpgrade, saveProfile, toggleSetting, exportAllData, copySqlSchema,
  generateApiKey, scanAllDocuments, filterLogs, clearSysLogs, exportSysLogs,
  openRoleModal, closeRoleModal, saveRole,
  toggleNotifications, closeNotifPanel, markAllNotifRead, markNotifRead,
  handleGlobalSearch, handleSearchResult,
  openCollabEditor, closeCollabEditor, onCollabEditorInput,
  openRichEditor, closeRichEditor, richCmd, richAlign, richInsertHeading, richInsertLink, richInsertCodeBlock, richInsertTable, richInsertMention, _onRichEditorInput, _saveRichContent,
  openFolder, navigateToFolder, openFolderModal, closeFolderModal, createFolder,
  openSignModal, closeSignModal, clearSignature, submitSignature,
  analyzeDocument, analyzeAllDocuments,
  openWfRuleModal, closeWfRuleModal, createWfRule, deleteAutomationRule,
  createBackup, restoreBackup, deleteBackup,
  generateApiKeyV6, revokeApiKey, copyApiKey,
  setAuditFilter,
  refreshAnalytics,
  runAdvSearch, clearAdvSearch,
  showVersions,
  createRoleV7, deleteRoleV7,
  runFTSearch,
  renderDocuments, renderWorkflows, renderShared, renderUsers, renderTags, renderBilling, renderSettings, renderSecurity, renderSysLogs, renderRBAC, renderAnalytics, renderFolders, renderSignatures, renderAI, renderAutomation, renderIntegrations, renderBackups, renderApiKeys, renderBillingV6, renderAuditV6, renderAdvancedSearch, renderVersioning, renderSearchV7, renderRBACV7,
  applyFilters, clearFilters, filterByType, filterByTag, toggleViewMode, switchDocsTab, switchSharedTab,
  deleteDocument, restoreDocument, addCollaborator, removeCollaborator, openPermModal, closePermModal,
  switchSecurityTab, loadDeletedDocs, renderAuditLog,
  renderDocContextMenu: showDocContextMenu
});