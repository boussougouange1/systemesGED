// SystemesGED v5.2 - Application principale (CORRIGÉ ET AMÉLIORÉ)
// ============================================
// CONFIGURATION: Deux administrateurs principaux
// 1. ahouansouange@live.fr -> Entreprise "live" (admin)
// 2. systemesshop@gmail.com -> Entreprise "systemesshop" (admin)

// ─── Configuration & État global ───
const CONFIG = {
  supabaseUrl: 'https://spgtflhprppeoidjguhs.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo_key',
  maxFileSize: 100 * 1024 * 1024,
  defaultPlan: 'free',
  plans: {
    free: { name: 'Free', price: 0, users: 5, storage: 1024 * 1024 * 1024, features: ['basic'] },
    starter: { name: 'Starter', price: 29, users: 20, storage: 10 * 1024 * 1024 * 1024, features: ['basic', 'versioning'] },
    professional: { name: 'Professional', price: 79, users: 100, storage: 100 * 1024 * 1024 * 1024, features: ['basic', 'versioning', 'rbac', 'audit'] },
    enterprise: { name: 'Enterprise', price: null, users: Infinity, storage: Infinity, features: ['all'] }
  }
};

// ADMINISTRATEURS PRÉCONFIGURÉS
const PREDEFINED_ADMINS = [
  {
    email: 'ahouansouange@live.fr',
    companyName: 'live',
    role: 'admin',
    password: 'Admin123!',
    status: 'active'
  },
  {
    email: 'systemesshop@gmail.com', 
    companyName: 'systemesshop',
    role: 'admin',
    password: 'Admin123!',
    status: 'active'
  }
];

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
    admin: { name: 'Administrateur', perms: ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users'] },
    manager: { name: 'Manager', perms: ['read', 'write', 'delete', 'users', 'validate_users'] },
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
  aiAnalysis: { queue: [], results: {} },
  originalFiles: new Map(),
  pendingUsersCount: 0
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
  if (level === 'error' || level === 'security') {
    G.notifications.unshift({ id: generateId(), type: level, message, timestamp: entry.timestamp, read: false });
    G.unreadCount++;
    updateNotifBadge();
  }
}

function logInfo(msg, meta) { addSysLog('info', msg, meta); }
function logError(msg, meta) { addSysLog('error', msg, meta); }

// ─── Initialisation des administrateurs prédéfinis ───
function initializePredefinedAdmins() {
  PREDEFINED_ADMINS.forEach(admin => {
    const existing = localStorage.getItem(`user_${admin.email}`);
    if (!existing) {
      const companyId = `company_${admin.companyName.toLowerCase()}_${generateId().substr(0, 8)}`;
      const userId = `user_${generateId()}`;
      
      const company = {
        id: companyId,
        name: admin.companyName,
        plan: 'enterprise',
        createdAt: new Date().toISOString(),
        admins: [userId]
      };
      localStorage.setItem(`company_${companyId}`, JSON.stringify(company));
      
      const user = {
        id: userId,
        email: admin.email,
        name: `Administrateur ${admin.companyName}`,
        role: admin.role,
        status: admin.status,
        companyId: companyId,
        plan: 'enterprise',
        createdAt: new Date().toISOString(),
        password: admin.password,
        canSign: true,
        signatureLimit: 100
      };
      localStorage.setItem(`user_${admin.email}`, JSON.stringify(user));
      logInfo(`Administrateur initialisé: ${admin.email} pour ${admin.companyName}`);
    }
  });
}

// ─── Authentification ───
async function mockAuthLogin(email, password) {
  // Vérifier les admins prédéfinis d'abord
  const predefined = PREDEFINED_ADMINS.find(a => a.email === email && a.password === password);
  if (predefined) {
    const stored = localStorage.getItem(`user_${email}`);
    if (stored) return JSON.parse(stored);
  }
  
  if (email === 'demo@systemesged.fr' && password === 'Admin123!') {
    return { id: 'user_demo', email, name: 'Administrateur Démo', role: 'admin', companyId: 'demo_company', plan: 'professional', createdAt: new Date().toISOString(), status: 'active' };
  }
  const stored = localStorage.getItem(`user_${email}`);
  if (stored) {
    const user = JSON.parse(stored);
    if (user.password === password) return user;
  }
  return null;
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
      if (user.status === 'pending_validation') {
        showToast('Votre compte est en attente de validation par un administrateur', 'warning');
        btn.disabled = false;
        btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
        return;
      }
      
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
  updatePendingUsersCount();
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
  
  updateValidationMenuVisibility();
}

function updateValidationMenuVisibility() {
  const validationMenuItems = document.querySelectorAll('[data-view="pending-users"]');
  const hasAccess = ['admin', 'manager'].includes(G.currentUser?.role);
  
  validationMenuItems.forEach(item => {
    item.style.display = hasAccess ? 'flex' : 'none';
  });
  
  updatePendingUsersBadge();
}

function updatePendingUsersCount() {
  if (!G.currentUser?.companyId) return;
  
  const pendingUsers = JSON.parse(localStorage.getItem(`admins_${G.currentUser.companyId}`) || '[]');
  const pendingInUsers = G.users.filter(u => u.status === 'pending_validation').length;
  
  G.pendingUsersCount = pendingUsers.length + pendingInUsers;
  updatePendingUsersBadge();
}

function updatePendingUsersBadge() {
  const badges = document.querySelectorAll('.pending-users-badge');
  badges.forEach(badge => {
    if (G.pendingUsersCount > 0 && ['admin', 'manager'].includes(G.currentUser?.role)) {
      badge.textContent = G.pendingUsersCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  });
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
      deletedAt: null,
      content: ''
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

// ─── Navigation ───
function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active-view');
  
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll(`[data-view="${viewName}"]`).forEach(el => el.classList.add('active'));
  
  G.currentView = viewName;
  
  switch(viewName) {
    case 'dashboard': renderDashboard(); break;
    case 'documents': renderDocuments(); break;
    case 'workflows': renderWorkflows(); break;
    case 'users': renderUsers(); break;
    case 'signatures': renderSignatures(); break;
    case 'pending-users': renderPendingUsers(); break;
  }
  
  addAudit('view_change', 'view', viewName);
}

// ─── Dashboard ───
function renderDashboard() {
  const totalDocs = G.documents.filter(d => !d.isDeleted).length;
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
  
  if (['admin', 'manager'].includes(G.currentUser?.role)) {
    updatePendingUsersCount();
    if (G.pendingUsersCount > 0) {
      showToast(`${G.pendingUsersCount} utilisateur(s) en attente de validation`, 'warning');
    }
  }
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
  
  grid.innerHTML = filtered.map(doc => renderDocCard(doc)).join('');
}

function getFilteredDocuments() {
  let docs = G.documents.filter(d => !d.isDeleted);
  
  if (G.docsTab === 'company') docs = docs.filter(d => d.scope === 'company');
  else if (G.docsTab === 'personal') docs = docs.filter(d => d.scope === 'personal');
  else if (G.docsTab === 'mine') docs = docs.filter(d => d.ownerId === G.currentUser?.id);
  
  return docs;
}

function renderDocCard(doc) {
  const iconClass = getFileIcon(doc.type);
  const size = formatBytes(doc.size);
  const isOwner = doc.ownerId === G.currentUser?.id;
  
  return `
    <div class="document-card glass-card rounded-2xl p-4 border border-blue-500/20 cursor-pointer group" 
         onclick="openPreviewModal('${doc.id}')"
         draggable="true">
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

// ─── Upload ───
let _uploadScope = 'company';

function openUploadModal() {
  _uploadScope = 'company';
  document.getElementById('uploadModal').classList.remove('hidden');
  document.getElementById('selectedFilesList').innerHTML = '';
  document.getElementById('docNameInput').value = '';
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

function handleFileSelect(e) {
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
  
  progressDiv.classList.remove('hidden');
  document.getElementById('uploadBtn').disabled = true;
  
  for (let i = 0; i < G.selectedFiles.length; i++) {
    const file = G.selectedFiles[i];
    
    for (let p = 0; p <= 100; p += 10) {
      progressBar.style.width = `${p}%`;
      progressText.textContent = `${p}%`;
      await simulateNetworkDelay(50);
    }
    
    const originalName = file.name;
    const customName = document.getElementById('docNameInput').value.trim();
    
    let finalName = originalName;
    if (customName) {
      const originalExt = originalName.split('.').pop();
      const customHasExt = customName.includes('.');
      finalName = customHasExt ? customName : `${customName}.${originalExt}`;
    }
    
    const doc = {
      id: generateId(),
      name: finalName,
      originalName: originalName,
      mimeType: file.type,
      type: getFileType(finalName),
      size: file.size,
      description: document.getElementById('docDescInput').value,
      scope: _uploadScope,
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
    
    G.originalFiles.set(doc.id, file);
    G.documents.unshift(doc);
    addAudit('upload', 'document', doc.id, { name: doc.name, size: doc.size, mimeType: file.type });
  }
  
  saveDocuments();
  updateStorageDisplay();
  updateBadges();
  
  showToast(`${G.selectedFiles.length} document(s) importé(s)`, 'success');
  closeUploadModal();
  
  if (G.currentView === 'documents') renderDocuments();
  else if (G.currentView === 'dashboard') renderDashboard();
}

// ─── Users ───
function openCreateUserModal() {
  if (!['admin', 'manager'].includes(G.currentUser?.role)) {
    showToast('Vous n\'avez pas les droits pour créer des utilisateurs', 'error');
    return;
  }
  
  document.getElementById('addUserModal').classList.remove('hidden');
}

function closeAddUserModal() {
  document.getElementById('addUserModal').classList.add('hidden');
}

async function addUser(e) {
  e.preventDefault();
  
  if (!['admin', 'manager'].includes(G.currentUser?.role)) {
    showToast('Permission refusée', 'error');
    return;
  }
  
  const newUser = {
    id: generateId(),
    name: `${document.getElementById('newUserFirst').value} ${document.getElementById('newUserLast').value}`,
    email: document.getElementById('newUserEmail').value,
    role: document.getElementById('newUserRole').value,
    status: 'pending_validation',
    createdAt: new Date().toISOString(),
    lastLogin: null,
    createdBy: G.currentUser?.id
  };
  
  if (G.currentUser?.role === 'admin') {
    const validateImmediately = confirm('Valider immédiatement cet utilisateur ?\n\nOK = Oui (actif immédiatement)\nAnnuler = Non (en attente de validation)');
    if (validateImmediately) {
      newUser.status = 'active';
      newUser.validatedAt = new Date().toISOString();
      newUser.validatedBy = G.currentUser?.id;
    }
  }
  
  G.users.push(newUser);
  saveUsers();
  
  updatePendingUsersCount();
  
  if (newUser.status === 'pending_validation') {
    showToast('Utilisateur créé - en attente de validation par un administrateur', 'warning');
  } else {
    showToast('Utilisateur créé et validé avec succès', 'success');
  }
  
  addAudit('create', 'user', newUser.id, { status: newUser.status });
  closeAddUserModal();
  renderUsers();
  updateBadges();
}

function renderUsers() {
  const tbody = document.getElementById('usersList');
  
  tbody.innerHTML = G.users.map(u => `
    <tr class="hover:bg-blue-500/5 ${u.status === 'pending_validation' ? 'bg-yellow-500/5' : ''}">
      <td class="p-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full ${u.status === 'pending_validation' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'} flex items-center justify-center text-sm font-bold">${u.name.charAt(0)}</div>
          <div>
            <p class="text-white text-sm font-medium">${u.name}</p>
            <p class="text-xs text-blue-300/60">${u.email}</p>
          </div>
        </div>
      </td>
      <td class="p-4"><span class="px-2 py-1 rounded-full text-xs ${getRoleBadgeClass(u.role)}">${G.roles[u.role]?.name || u.role}</span></td>
      <td class="p-4 hidden md:table-cell text-sm text-blue-300/70">${G.documents.filter(d => d.ownerId === u.id && !d.isDeleted).length}</td>
      <td class="p-4 hidden sm:table-cell">
        <span class="px-2 py-1 rounded-full text-xs ${u.status === 'active' ? 'bg-green-500/20 text-green-400' : u.status === 'pending_validation' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-500/20 text-gray-400'}">
          ${u.status === 'pending_validation' ? 'En attente' : u.status}
        </span>
      </td>
      <td class="p-4">
        <div class="flex gap-2">
          ${u.status === 'pending_validation' && ['admin', 'manager'].includes(G.currentUser?.role) ? 
            `<button onclick="validateUser('${u.id}')" class="px-3 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30" title="Valider"><i class="fas fa-check"></i></button>` : ''}
          <button onclick="openEditUserModal('${u.id}')" class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400"><i class="fas fa-edit"></i></button>
          ${u.id !== G.currentUser?.id ? `<button onclick="deleteUser('${u.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

function validateUser(userId) {
  if (!['admin', 'manager'].includes(G.currentUser?.role)) {
    showToast('Permission refusée', 'error');
    return;
  }
  
  const u = G.users.find(user => user.id === userId);
  if (!u || u.status !== 'pending_validation') return;
  
  u.status = 'active';
  u.validatedAt = new Date().toISOString();
  u.validatedBy = G.currentUser?.id;
  
  saveUsers();
  updatePendingUsersCount();
  
  showToast(`Utilisateur ${u.name} validé avec succès`, 'success');
  addAudit('validate', 'user', userId);
  renderUsers();
  
  const userKey = `user_${u.email}`;
  const stored = localStorage.getItem(userKey);
  if (stored) {
    const userData = JSON.parse(stored);
    userData.status = 'active';
    localStorage.setItem(userKey, JSON.stringify(userData));
  }
  
  if (G.currentView === 'pending-users') {
    renderPendingUsers();
  }
}

function renderPendingUsers() {
  const container = document.getElementById('pendingUsersList');
  if (!container) return;
  
  const pendingFromUsers = G.users.filter(u => u.status === 'pending_validation');
  const pendingFromStorage = JSON.parse(localStorage.getItem(`admins_${G.currentUser?.companyId}`) || '[]');
  
  const allPending = [...pendingFromUsers];
  pendingFromStorage.forEach(stored => {
    if (!allPending.find(u => u.id === stored.userId)) {
      allPending.push({
        id: stored.userId,
        name: stored.name,
        email: stored.email,
        status: 'pending_validation',
        createdAt: stored.requestedAt,
        source: 'registration'
      });
    }
  });
  
  allPending.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  if (allPending.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-blue-300/50">
        <i class="fas fa-user-check text-4xl mb-3 block opacity-20"></i>
        <p class="mb-2">Aucun utilisateur en attente de validation</p>
        <p class="text-sm text-blue-300/30">Tous les comptes sont actifs</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = allPending.map(u => `
    <div class="glass-card rounded-xl p-4 border border-yellow-500/20 hover:border-yellow-400/40 transition-all">
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 text-lg font-bold">
            ${u.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p class="text-white font-medium text-lg">${u.name}</p>
            <p class="text-sm text-blue-300/60">${u.email}</p>
            <p class="text-xs text-yellow-400/60 mt-1">
              <i class="fas fa-clock mr-1"></i>
              En attente depuis ${formatDate(u.createdAt)}
            </p>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="validateUser('${u.id}')" class="px-4 py-2 rounded-lg bg-green-500/20 text-green-400 text-sm hover:bg-green-500/30 flex items-center gap-2">
            <i class="fas fa-check"></i>
            <span>Valider</span>
          </button>
          <button onclick="rejectUser('${u.id}')" class="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30 flex items-center gap-2">
            <i class="fas fa-times"></i>
            <span>Rejeter</span>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function rejectUser(userId) {
  if (!confirm('Êtes-vous sûr de vouloir rejeter cet utilisateur ?\n\nCette action est irréversible.')) return;
  
  const u = G.users.find(user => user.id === userId);
  if (!u) return;
  
  u.status = 'rejected';
  u.rejectedAt = new Date().toISOString();
  u.rejectedBy = G.currentUser?.id;
  
  saveUsers();
  updatePendingUsersCount();
  
  showToast('Utilisateur rejeté', 'info');
  addAudit('reject', 'user', userId);
  renderPendingUsers();
  renderUsers();
}

function getRoleBadgeClass(role) {
  const classes = { admin: 'bg-red-500/20 text-red-400', manager: 'bg-orange-500/20 text-orange-400', editor: 'bg-blue-500/20 text-blue-400', viewer: 'bg-gray-500/20 text-gray-400' };
  return classes[role] || 'bg-gray-500/20 text-gray-400';
}

function deleteUser(userId) {
  if (!['admin', 'manager'].includes(G.currentUser?.role)) {
    showToast('Permission refusée', 'error');
    return;
  }
  
  if (!confirm('Supprimer cet utilisateur ?')) return;
  G.users = G.users.filter(u => u.id !== userId);
  saveUsers();
  showToast('Utilisateur supprimé', 'success');
  addAudit('delete', 'user', userId);
  renderUsers();
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

// Fonction pour ajouter une signature numérique (admin uniquement)
function addDigitalSignature(docId, signatureData) {
  if (!G.currentUser?.canSign && G.currentUser?.role !== 'admin') {
    showToast('Vous n\'avez pas les droits pour ajouter des signatures numériques', 'error');
    return false;
  }
  
  const signature = {
    id: generateId(),
    documentId: docId,
    signerId: G.currentUser?.id,
    signerEmail: G.currentUser?.email,
    signerName: G.currentUser?.name,
    signatureData: signatureData,
    status: 'signed',
    createdAt: new Date().toISOString(),
    companyId: G.currentUser?.companyId
  };
  
  G.signatures.push(signature);
  saveSignatures();
  
  addAudit('signature_added', 'document', docId, { signatureId: signature.id });
  showToast('Signature numérique ajoutée avec succès', 'success');
  return true;
}

// ─── Stockage & Badges ───
function updateStorageDisplay() {
  const used = G.documents.filter(d => !d.isDeleted).reduce((sum, d) => sum + (d.size || 0), 0);
  const limit = CONFIG.plans[G.currentUser?.plan || 'free'].storage;
  const percent = Math.min(100, Math.round((used / limit) * 100));
  
  document.getElementById('storagePercent').textContent = `${percent}%`;
  document.getElementById('storageBar').style.width = `${percent}%`;
  document.getElementById('storageText').textContent = `${formatBytes(used)} / ${formatBytes(limit)}`;
}

function updateBadges() {
  const docCount = G.documents.filter(d => !d.isDeleted).length;
  const wfCount = G.workflows.filter(w => ['pending', 'in_review'].includes(w.status)).length;
  
  const docBadge = document.getElementById('d-docsBadge');
  const wfBadge = document.getElementById('d-wfBadge');
  
  if (docBadge) {
    docBadge.textContent = docCount;
    docBadge.classList.toggle('hidden', docCount === 0);
  }
  if (wfBadge) {
    wfBadge.textContent = wfCount;
    wfBadge.classList.toggle('hidden', wfCount === 0);
  }
}

// ─── Realtime sync simulation ───
function startRealtimeSync() {
  setInterval(() => {
    if (Math.random() > 0.95) {
      logInfo('Sync temps réel: vérification des mises à jour');
    }
  }, 30000);
}

// ─── Keyboard shortcuts ───
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    document.getElementById('globalSearch')?.focus();
  }
  if (e.key === 'Escape') {
    closeUploadModal();
    closeAddUserModal();
  }
});

// ─── Initialization ───
document.addEventListener('DOMContentLoaded', () => {
  // Initialiser les administrateurs prédéfinis
  initializePredefinedAdmins();
  
  logInfo('SystemesGED v5.2 démarré - Version avec validation des comptes');
  
  const savedUser = localStorage.getItem('currentUser');
  if (savedUser) {
    const user = JSON.parse(savedUser);
    if (user.status === 'pending_validation') {
      showToast('Votre compte est en attente de validation', 'warning');
      localStorage.removeItem('currentUser');
      return;
    }
    G.currentUser = user;
    G.currentCompany = JSON.parse(localStorage.getItem('currentCompany') || '{}');
    initializeApp();
  }
});

// Expose functions globally
Object.assign(window, {
  switchAuthTab, togglePwdInput, handleLogin, handleLogout,
  switchView, openUploadModal, closeUploadModal, setDocScope, updateScopeUI,
  handleFileSelect, addFilesToSelection, renderSelectedFiles, removeFileFromSelection,
  addUploadTag, renderUploadTags, removeUploadTag, uploadDocument,
  openCreateUserModal, closeAddUserModal, addUser, renderUsers,
  validateUser, rejectUser, renderPendingUsers, deleteUser,
  renderSignatures, addDigitalSignature,
  updateStorageDisplay, updateBadges, updatePendingUsersCount,
  getRoleBadgeClass, getSigStatusClass
});
