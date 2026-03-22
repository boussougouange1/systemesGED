// SystemesGED v6.0 - Application avec Supabase Auth intégré
// ============================================

// ─── Configuration ───
const CONFIG = {
  supabaseUrl: 'https://spgtflhprppeoidjguhs.supabase.co',
  supabaseKey: 'sb_publishable_0TPq4MIBVDRBzS2CI5WxuA_SV7HkwMJ',
  // IMPORTANT: Remplacez par votre clé service role pour la création d'admins
  supabaseServiceKey: 'sb_secret_ovjskJG9MDqrmuhh_ENxVA_RR606S9J',
  maxFileSize: 100 * 1024 * 1024,
  defaultPlan: 'free',
  plans: {
    free: { name: 'Free', price: 0, users: 5, storage: 1024 * 1024 * 1024, features: ['basic'] },
    starter: { name: 'Starter', price: 29, users: 20, storage: 10 * 1024 * 1024 * 1024, features: ['basic', 'versioning'] },
    professional: { name: 'Professional', price: 79, users: 100, storage: 100 * 1024 * 1024 * 1024, features: ['basic', 'versioning', 'rbac', 'audit'] },
    enterprise: { name: 'Enterprise', price: null, users: Infinity, storage: Infinity, features: ['all'] }
  },
  // Configuration des administrateurs système
  systemAdmins: [
    {
      email: 'ahouansouange@live.fr',
      companyName: 'live',
      password: 'AdminLive2024!',
      fullName: 'Administrateur Live'
    },
    {
      email: 'systemesshop@gmail.com',
      companyName: 'systemesshop',
      password: 'AdminSystemesshop2024!',
      fullName: 'Administrateur Systemesshop'
    }
  ]
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
  pendingUsersCount: 0,
  supabaseClient: null,
  supabaseAdmin: null
};

// ─── Initialisation Supabase ───
function initSupabase() {
  try {
    // Client standard (anon key) pour les opérations utilisateur
    G.supabaseClient = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
    
    // Client admin (service role) pour créer des utilisateurs
    if (CONFIG.supabaseServiceKey && !CONFIG.supabaseServiceKey.includes('service_role_key')) {
      G.supabaseAdmin = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      console.log('✅ Client admin Supabase initialisé');
    } else {
      console.warn('⚠️  Clé service role non configurée - mode local uniquement');
    }
    
    window.SB = G.supabaseClient;
    return true;
  } catch (e) {
    console.error('❌ Erreur init Supabase:', e);
    showToast('Erreur de connexion au service', 'error');
    return false;
  }
}

// ─── Utilitaires ───
function generateId() { return Math.random().toString(36).substring(2) + Date.now().toString(36); }
function formatBytes(bytes) { if (bytes === 0) return '0 Bytes'; const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]; }
function formatDate(date) { if (!date) return '-'; const d = new Date(date); return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
function getFileIcon(type) { const icons = { pdf: 'fa-file-pdf text-red-400', doc: 'fa-file-word text-blue-400', xls: 'fa-file-excel text-green-400', img: 'fa-file-image text-purple-400', txt: 'fa-file-alt text-gray-400', zip: 'fa-file-archive text-yellow-400' }; return icons[type] || 'fa-file text-blue-400'; }
function getFileType(filename) { const ext = filename.split('.').pop().toLowerCase(); const types = { pdf: ['pdf'], doc: ['doc', 'docx', 'odt'], xls: ['xls', 'xlsx', 'csv'], img: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'], txt: ['txt', 'md', 'json', 'xml'], zip: ['zip', 'rar', '7z', 'tar', 'gz'] }; for (const [type, exts] of Object.entries(types)) if (exts.includes(ext)) return type; return 'file'; }

// ─── Notifications ───
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  const icons = { success: 'fa-check-circle text-green-400', error: 'fa-times-circle text-red-400', warning: 'fa-exclamation-triangle text-yellow-400', info: 'fa-info-circle text-blue-400' };
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info} text-lg"></i><span class="flex-1 text-sm">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 300); }, duration);
}

// ─── Logs ───
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

// ─── CRÉATION AUTOMATIQUE DES ADMINS ───
async function initializeSystemAdmins() {
  console.log('🚀 Initialisation des administrateurs système...');
  
  if (!G.supabaseAdmin) {
    console.warn('⚠️  Client admin non disponible');
    showToast('Mode sans création automatique - configurez la clé service role', 'warning');
    return;
  }

  const results = [];

  for (const adminConfig of CONFIG.systemAdmins) {
    console.log(`\n📝 Traitement de: ${adminConfig.email}`);
    
    try {
      // 1. Vérifier si l'utilisateur existe déjà
      const { data: existingUsers, error: listError } = await G.supabaseAdmin.auth.admin.listUsers();
      
      if (listError) {
        console.error(`❌ Erreur listUsers: ${listError.message}`);
        continue;
      }

      const existingUser = existingUsers.users.find(u => u.email === adminConfig.email);
      let userId;

      if (existingUser) {
        console.log(`✅ Utilisateur existant: ${existingUser.id}`);
        userId = existingUser.id;
        
        // Mettre à jour le mot de passe
        const { error: updateError } = await G.supabaseAdmin.auth.admin.updateUserById(
          userId,
          { password: adminConfig.password }
        );
        
        if (updateError) {
          console.error(`⚠️  Erreur update password: ${updateError.message}`);
        }
      } else {
        // 2. Créer l'utilisateur dans auth.users
        console.log(`⏳ Création du compte auth...`);
        const { data: newUser, error: createError } = await G.supabaseAdmin.auth.admin.createUser({
          email: adminConfig.email,
          password: adminConfig.password,
          email_confirm: true,
          user_metadata: {
            full_name: adminConfig.fullName,
            role: 'admin',
            is_system_admin: true
          }
        });

        if (createError) {
          console.error(`❌ Erreur création: ${createError.message}`);
          continue;
        }

        userId = newUser.user.id;
        console.log(`✅ Utilisateur créé: ${userId}`);
      }

      // 3. Créer ou récupérer l'entreprise
      const { data: companies, error: companyError } = await G.supabaseClient
        .from('companies')
        .select('id')
        .eq('name', adminConfig.companyName);

      let companyId;
      if (companyError || !companies || companies.length === 0) {
        // Créer l'entreprise
        const { data: newCompany, error: createCompanyError } = await G.supabaseClient
          .from('companies')
          .insert([{
            name: adminConfig.companyName,
            plan: 'enterprise',
            status: 'active',
            created_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (createCompanyError) {
          console.error(`❌ Erreur création entreprise: ${createCompanyError.message}`);
          continue;
        }
        companyId = newCompany.id;
        console.log(`🏢 Entreprise créée: ${companyId}`);
      } else {
        companyId = companies[0].id;
        console.log(`🏢 Entreprise existante: ${companyId}`);
      }

      // 4. Créer ou mettre à jour le profil
      const { data: existingProfile } = await G.supabaseClient
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();

      const profileData = {
        id: userId,
        email: adminConfig.email,
        full_name: adminConfig.fullName,
        role: 'admin',
        company_id: companyId,
        status: 'active',
        can_validate_requests: true,
        can_add_signatures: true,
        is_company_admin: true,
        admin_rights: {
          validate_pending_requests: true,
          manage_signatures: true,
          manage_users: true,
          manage_company_settings: true,
          view_all_documents: true,
          approve_workflows: true
        },
        updated_at: new Date().toISOString()
      };

      if (existingProfile) {
        const { error: updateProfileError } = await G.supabaseClient
          .from('profiles')
          .update(profileData)
          .eq('id', userId);

        if (updateProfileError) {
          console.error(`⚠️  Erreur update profil: ${updateProfileError.message}`);
        } else {
          console.log(`👤 Profil mis à jour`);
        }
      } else {
        profileData.created_at = new Date().toISOString();
        const { error: insertProfileError } = await G.supabaseClient
          .from('profiles')
          .insert([profileData]);

        if (insertProfileError) {
          console.error(`❌ Erreur création profil: ${insertProfileError.message}`);
        } else {
          console.log(`👤 Profil créé`);
        }
      }

      results.push({
        email: adminConfig.email,
        userId: userId,
        companyId: companyId,
        success: true
      });

    } catch (error) {
      console.error(`❌ Exception pour ${adminConfig.email}:`, error);
      results.push({
        email: adminConfig.email,
        success: false,
        error: error.message
      });
    }
  }

  // Afficher le récapitulatif
  console.log('\n' + '='.repeat(60));
  console.log('📋 RÉCAPITULATIF DES ADMINISTRATEURS');
  console.log('='.repeat(60));
  results.forEach(r => {
    if (r.success) {
      console.log(`✅ ${r.email}`);
      console.log(`   UID: ${r.userId}`);
      console.log(`   Company ID: ${r.companyId}`);
    } else {
      console.log(`❌ ${r.email}: ${r.error}`);
    }
  });
  console.log('='.repeat(60));

  if (results.some(r => r.success)) {
    showToast('Administrateurs initialisés - vérifiez la console pour les UID', 'success');
  }

  return results;
}

// ─── Authentification ───
function switchAuthTab(tab) {
  document.getElementById('tabLogin')?.classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister')?.classList.toggle('active', tab === 'register');
  const loginWrapper = document.getElementById('loginFormWrapper');
  const regWrapper = document.getElementById('registerFormWrapper');
  if (loginWrapper) loginWrapper.style.display = tab === 'login' ? 'block' : 'none';
  if (regWrapper) regWrapper.style.display = tab === 'register' ? 'block' : 'none';
}

function togglePwdInput(id, btn) {
  const input = document.getElementById(id);
  const icon = btn.querySelector('i');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  icon.className = input.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');
  if (btn) btn.disabled = true;
  if (btnText) btnText.innerHTML = '<span class="spinner mr-2"></span>Connexion...';
  
  const email = document.getElementById('loginEmail')?.value;
  const password = document.getElementById('loginPassword')?.value;
  
  try {
    // 1. Connexion Supabase Auth
    const { data: authData, error: authError } = await G.supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      showToast('Identifiants incorrects', 'error');
      return;
    }

    // 2. Récupérer le profil
    const { data: profile, error: profileError } = await G.supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      showToast('Profil non trouvé', 'error');
      return;
    }

    if (profile.status === 'pending_validation') {
      showToast('Votre compte est en attente de validation', 'warning');
      await G.supabaseClient.auth.signOut();
      return;
    }

    // 3. Mettre à jour l'état global
    G.currentUser = {
      id: authData.user.id,
      email: authData.user.email,
      name: profile.full_name || authData.user.email,
      role: profile.role || 'viewer',
      companyId: profile.company_id,
      plan: profile.plan || 'free',
      status: profile.status,
      isSystemAdmin: profile.is_company_admin || false,
      permissions: profile.admin_rights || []
    };

    // 4. Récupérer l'entreprise
    const { data: company } = await G.supabaseClient
      .from('companies')
      .select('*')
      .eq('id', profile.company_id)
      .single();

    if (company) {
      G.currentCompany = company;
    }

    await initializeApp();
    showToast('Connexion réussie', 'success');
    addAudit('login', 'user', G.currentUser.id);

  } catch (err) {
    logError('Erreur login', { error: err.message });
    showToast('Erreur de connexion', 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const data = {
    firstName: document.getElementById('regFirst')?.value,
    lastName: document.getElementById('regLast')?.value,
    company: document.getElementById('regCompany')?.value,
    email: document.getElementById('regEmail')?.value,
    password: document.getElementById('regPassword')?.value
  };
  
  try {
    // 1. Créer l'utilisateur dans auth.users
    const { data: authData, error: authError } = await G.supabaseClient.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: `${data.firstName} ${data.lastName}`,
          company_name: data.company
        }
      }
    });

    if (authError) throw authError;

    // 2. Créer l'entreprise
    const { data: company, error: companyError } = await G.supabaseClient
      .from('companies')
      .insert([{
        name: data.company,
        plan: 'free',
        status: 'active'
      }])
      .select()
      .single();

    if (companyError) throw companyError;

    // 3. Créer le profil en attente
    const { error: profileError } = await G.supabaseClient
      .from('profiles')
      .insert([{
        id: authData.user.id,
        email: data.email,
        full_name: `${data.firstName} ${data.lastName}`,
        role: 'viewer',
        status: 'pending_validation',
        company_id: company.id
      }]);

    if (profileError) throw profileError;

    showToast('Compte créé - en attente de validation', 'success');
    addAudit('register_pending', 'user', authData.user.id);
    switchAuthTab('login');

  } catch (err) {
    showToast(err.message, 'error');
  }
}

function demoLogin() {
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  if (loginEmail) loginEmail.value = 'demo@systemesged.fr';
  if (loginPassword) loginPassword.value = 'Admin123!';
  handleLogin(new Event('submit'));
}

async function handleLogout() {
  await G.supabaseClient.auth.signOut();
  addAudit('logout', 'user', G.currentUser?.id);
  G.currentUser = null;
  G.currentCompany = null;
  localStorage.removeItem('currentUser');
  localStorage.removeItem('currentCompany');
  const mainApp = document.getElementById('mainApp');
  const loginScreen = document.getElementById('loginScreen');
  if (mainApp) mainApp.style.display = 'none';
  if (loginScreen) loginScreen.style.display = 'block';
  showToast('Déconnexion réussie', 'info');
}

// ─── Initialisation Application ───
async function initializeApp() {
  const loginScreen = document.getElementById('loginScreen');
  const mainApp = document.getElementById('mainApp');
  
  if (loginScreen) loginScreen.style.display = 'none';
  if (mainApp) mainApp.style.display = 'block';
  
  localStorage.setItem('currentUser', JSON.stringify(G.currentUser));
  localStorage.setItem('currentCompany', JSON.stringify(G.currentCompany));
  
  updateUserDisplay();
  await loadInitialData();
  updatePendingUsersCount();
  switchView('dashboard');
  logInfo('Application initialisée', { user: G.currentUser?.id });
  
  if (isAdmin() && G.pendingUsersCount > 0) {
    showToast(`${G.pendingUsersCount} utilisateur(s) en attente de validation`, 'warning');
  }
}

function isAdmin() {
  return ['admin', 'manager'].includes(G.currentUser?.role) || G.currentUser?.isSystemAdmin;
}

function canValidateUsers() {
  return G.currentUser?.role === 'admin' || G.currentUser?.permissions?.includes('validate_users');
}

function canManageSignatures() {
  return G.currentUser?.role === 'admin' || G.currentUser?.permissions?.includes('signatures');
}

function updateUserDisplay() {
  if (!G.currentUser) return;
  
  const els = {
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

  if (els.userNameDisplay) els.userNameDisplay.textContent = G.currentUser.name;
  if (els.userRoleDisplay) els.userRoleDisplay.textContent = G.roles[G.currentUser.role]?.name || G.currentUser.role;
  if (els.userAvatarInitial) els.userAvatarInitial.textContent = G.currentUser.name.charAt(0).toUpperCase();
  if (els.dropdownUserName) els.dropdownUserName.textContent = G.currentUser.name;
  if (els.dropdownUserEmail) els.dropdownUserEmail.textContent = G.currentUser.email;
  if (els.companyNameLabel) els.companyNameLabel.textContent = G.currentCompany?.name || 'Entreprise';
  if (els.companyPlanLabel) els.companyPlanLabel.textContent = `Plan ${G.currentCompany?.plan || 'free'}`;
  if (els.companyAvatar) els.companyAvatar.textContent = (G.currentCompany?.name || 'E').charAt(0).toUpperCase();
  
  if (els.planBadge) {
    els.planBadge.className = `hidden sm:inline badge-plan badge-${G.currentUser.plan || 'free'}`;
    els.planBadge.textContent = (G.currentUser.plan || 'free').toUpperCase();
  }
  
  updateValidationMenuVisibility();
}

// ─── Gestion des Validations ───
function updateValidationMenuVisibility() {
  const validationMenuItems = document.querySelectorAll('[data-view="pending-users"]');
  const hasAccess = canValidateUsers();
  validationMenuItems.forEach(item => {
    item.style.display = hasAccess ? 'flex' : 'none';
  });
  updatePendingUsersBadge();
}

async function updatePendingUsersCount() {
  if (!G.currentUser?.companyId) return;
  
  const { data: pendingUsers, error } = await G.supabaseClient
    .from('profiles')
    .select('id')
    .eq('company_id', G.currentUser.companyId)
    .eq('status', 'pending_validation');
  
  if (!error && pendingUsers) {
    G.pendingUsersCount = pendingUsers.length;
    updatePendingUsersBadge();
  }
}

function updatePendingUsersBadge() {
  const badges = document.querySelectorAll('.pending-users-badge');
  badges.forEach(badge => {
    if (G.pendingUsersCount > 0 && canValidateUsers()) {
      badge.textContent = G.pendingUsersCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  });
}

async function loadInitialData() {
  await Promise.all([
    loadDocuments(), 
    loadWorkflows(), 
    loadUsers(), 
    loadTags(), 
    loadShares(), 
    loadFolders(), 
    loadSignatures(), 
    loadAutomationRules(), 
    loadApiKeys(), 
    loadBackups()
  ]);
  updateStorageDisplay();
  updateBadges();
}

// ─── Chargement des données depuis Supabase ───
async function loadDocuments() {
  if (!G.currentUser?.companyId) return;
  
  const { data, error } = await G.supabaseClient
    .from('documents')
    .select('*')
    .eq('company_id', G.currentUser.companyId)
    .eq('is_deleted', false);
  
  if (error) {
    console.error('Erreur chargement documents:', error);
    G.documents = [];
  } else {
    G.documents = data || [];
  }
}

async function loadWorkflows() {
  if (!G.currentUser?.companyId) return;
  
  const { data, error } = await G.supabaseClient
    .from('workflows')
    .select('*')
    .eq('company_id', G.currentUser.companyId);
  
  G.workflows = data || [];
}

async function loadUsers() {
  if (!G.currentUser?.companyId) return;
  
  const { data, error } = await G.supabaseClient
    .from('profiles')
    .select('*')
    .eq('company_id', G.currentUser.companyId);
  
  G.users = data || [];
}

async function loadTags() {
  if (!G.currentUser?.companyId) return;
  
  const { data, error } = await G.supabaseClient
    .from('tags')
    .select('*')
    .eq('company_id', G.currentUser.companyId);
  
  G.tags = data || [
    { id: generateId(), name: 'Important', color: '#ef4444', count: 0 },
    { id: generateId(), name: 'Urgent', color: '#f97316', count: 0 },
    { id: generateId(), name: 'Contrat', color: '#3b82f6', count: 0 },
    { id: generateId(), name: 'Archivé', color: '#6b7280', count: 0 }
  ];
}

async function loadShares() {
  if (!G.currentUser?.companyId) return;
  
  const { data, error } = await G.supabaseClient
    .from('shares')
    .select('*')
    .eq('company_id', G.currentUser.companyId);
  
  G.shares = data || [];
}

async function loadFolders() {
  if (!G.currentUser?.companyId) return;
  
  const { data, error } = await G.supabaseClient
    .from('folders')
    .select('*')
    .eq('company_id', G.currentUser.companyId);
  
  G.folders = data || [
    { id: '__root__', name: 'Racine', parent_id: null, created_at: new Date().toISOString() }
  ];
}

async function loadSignatures() {
  if (!G.currentUser?.companyId) return;
  
  const { data, error } = await G.supabaseClient
    .from('signatures')
    .select('*')
    .eq('company_id', G.currentUser.companyId);
  
  G.signatures = data || [];
}

async function loadAutomationRules() {
  if (!G.currentUser?.companyId) return;
  
  const { data, error } = await G.supabaseClient
    .from('automation_rules')
    .select('*')
    .eq('company_id', G.currentUser.companyId);
  
  G.automationRules = data || [];
}

async function loadApiKeys() {
  const { data, error } = await G.supabaseClient
    .from('api_keys')
    .select('*')
    .eq('user_id', G.currentUser?.id);
  
  G.apiKeys = data || [];
}

async function loadBackups() {
  if (!G.currentUser?.companyId) return;
  
  const { data, error } = await G.supabaseClient
    .from('backups')
    .select('*')
    .eq('company_id', G.currentUser.companyId);
  
  G.backups = data || [];
}

// ─── Navigation ───
function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active-view');
  
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll(`[data-view="${viewName}"]`).forEach(el => el.classList.add('active'));
  
  G.currentView = viewName;
  closeMobileSidebar();
  
  // Appeler le renderer approprié
  const renderers = {
    dashboard: renderDashboard,
    documents: renderDocuments,
    workflows: renderWorkflows,
    shared: renderShared,
    users: renderUsers,
    'pending-users': renderPendingUsers,
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
    apikeys: renderApiKeys
  };
  
  if (renderers[viewName]) renderers[viewName]();
  
  addAudit('view_change', 'view', viewName);
}

function closeMobileSidebar() {
  document.getElementById('mobileSidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('active');
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
  
  renderActivityList();
}

function renderActivityList() {
  const list = document.getElementById('activityList');
  if (!list) return;
  
  if (G.auditLog.length === 0) {
    list.innerHTML = '<div class="text-center py-8 text-blue-300/50"><i class="fas fa-folder-open text-2xl mb-2 block"></i>Aucune activité récente</div>';
    return;
  }
  
  list.innerHTML = G.auditLog.slice(0, 10).map(act => `
    <div class="flex items-center gap-3 p-3 rounded-xl bg-blue-900/20 border border-blue-500/10">
      <div class="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 text-xs">
        <i class="fas fa-circle"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white truncate">${act.action} ${act.targetType}</p>
        <p class="text-xs text-blue-300/60">${formatDate(act.timestamp)}</p>
      </div>
    </div>
  `).join('');
}

// ─── Documents ───
function renderDocuments() {
  const grid = document.getElementById('documentGrid');
  if (!grid) return;
  
  const filtered = getFilteredDocuments();
  
  const resultsCountEl = document.getElementById('resultsCount');
  if (resultsCountEl) resultsCountEl.textContent = `${filtered.length} document${filtered.length > 1 ? 's' : ''}`;
  
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
  let docs = G.documents.filter(d => !d.is_deleted);
  
  if (G.docsTab === 'company') docs = docs.filter(d => d.scope === 'company');
  else if (G.docsTab === 'personal') docs = docs.filter(d => d.scope === 'personal');
  
  return docs;
}

function renderDocCard(doc) {
  const iconClass = getFileIcon(doc.type);
  const size = formatBytes(doc.size);
  
  return `
    <div class="document-card glass-card rounded-2xl p-4 border border-blue-500/20 cursor-pointer group" 
         onclick="openPreviewModal('${doc.id}')">
      <div class="flex items-start justify-between mb-3">
        <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center ${iconClass.split(' ')[1]} text-2xl">
          <i class="fas ${iconClass.split(' ')[0]}"></i>
        </div>
        <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button onclick="event.stopPropagation(); downloadDocument('${doc.id}')" class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400" title="Télécharger"><i class="fas fa-download"></i></button>
        </div>
      </div>
      <h4 class="text-white font-semibold text-sm mb-1 truncate" title="${doc.name}">${doc.name}</h4>
      <p class="text-blue-300/60 text-xs mb-2">${size} • ${formatDate(doc.created_at)}</p>
    </div>
  `;
}

// ─── Gestion des utilisateurs ───
async function renderUsers() {
  const tbody = document.getElementById('usersList');
  if (!tbody) return;
  
  // Recharger les utilisateurs
  await loadUsers();
  
  tbody.innerHTML = G.users.map(u => `
    <tr class="hover:bg-blue-500/5 ${u.status === 'pending_validation' ? 'bg-yellow-500/5' : ''}">
      <td class="p-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full ${u.status === 'pending_validation' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'} flex items-center justify-center text-sm font-bold">${u.full_name?.charAt(0) || 'U'}</div>
          <div>
            <p class="text-white text-sm font-medium">${u.full_name || u.email}</p>
            <p class="text-xs text-blue-300/60">${u.email}</p>
          </div>
        </div>
      </td>
      <td class="p-4"><span class="px-2 py-1 rounded-full text-xs ${getRoleBadgeClass(u.role)}">${G.roles[u.role]?.name || u.role}</span></td>
      <td class="p-4 hidden sm:table-cell">
        <span class="px-2 py-1 rounded-full text-xs ${u.status === 'active' ? 'bg-green-500/20 text-green-400' : u.status === 'pending_validation' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-500/20 text-gray-400'}">
          ${u.status === 'pending_validation' ? 'En attente' : u.status}
        </span>
      </td>
      <td class="p-4">
        <div class="flex gap-2">
          ${u.status === 'pending_validation' && canValidateUsers() ? 
            `<button onclick="validateUser('${u.id}')" class="px-3 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30"><i class="fas fa-check"></i></button>` : ''}
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
  if (!canValidateUsers()) {
    showToast('Permission refusée', 'error');
    return;
  }
  
  const { error } = await G.supabaseClient
    .from('profiles')
    .update({ 
      status: 'active', 
      validated_at: new Date().toISOString(),
      validated_by: G.currentUser?.id 
    })
    .eq('id', userId);
  
  if (error) {
    showToast('Erreur de validation', 'error');
    return;
  }
  
  showToast('Utilisateur validé', 'success');
  addAudit('validate', 'user', userId);
  await loadUsers();
  renderUsers();
  updatePendingUsersCount();
}

async function renderPendingUsers() {
  const container = document.getElementById('pendingUsersList');
  if (!container) return;
  
  // Recharger les utilisateurs en attente
  const { data: pendingUsers, error } = await G.supabaseClient
    .from('profiles')
    .select('*')
    .eq('company_id', G.currentUser?.companyId)
    .eq('status', 'pending_validation');
  
  if (error || !pendingUsers || pendingUsers.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-blue-300/50">
        <i class="fas fa-user-check text-4xl mb-3 block opacity-20"></i>
        <p>Aucun utilisateur en attente de validation</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = pendingUsers.map(u => `
    <div class="glass-card rounded-xl p-4 border border-yellow-500/20">
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 text-lg font-bold">
            ${u.full_name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div>
            <p class="text-white font-medium text-lg">${u.full_name || u.email}</p>
            <p class="text-sm text-blue-300/60">${u.email}</p>
            <p class="text-xs text-yellow-400/60 mt-1">
              <i class="fas fa-clock mr-1"></i>
              En attente depuis ${formatDate(u.created_at)}
            </p>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="validateUser('${u.id}')" class="px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30">
            <i class="fas fa-check mr-2"></i>Valider
          </button>
          <button onclick="rejectUser('${u.id}')" class="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30">
            <i class="fas fa-times mr-2"></i>Rejeter
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

async function rejectUser(userId) {
  if (!confirm('Rejeter cet utilisateur ?')) return;
  
  const { error } = await G.supabaseClient
    .from('profiles')
    .update({ status: 'rejected', rejected_at: new Date().toISOString() })
    .eq('id', userId);
  
  if (!error) {
    showToast('Utilisateur rejeté', 'info');
    renderPendingUsers();
  }
}

async function deleteUser(userId) {
  if (!confirm('Supprimer cet utilisateur ?')) return;
  
  const { error } = await G.supabaseClient
    .from('profiles')
    .delete()
    .eq('id', userId);
  
  if (!error) {
    showToast('Utilisateur supprimé', 'success');
    await loadUsers();
    renderUsers();
  }
}

// ─── Autres fonctions (simplifiées) ───
function renderWorkflows() { /* Implémentation similaire */ }
function renderShared() { /* Implémentation similaire */ }
function renderTags() { /* Implémentation similaire */ }
function renderBilling() { /* Implémentation similaire */ }
function renderSettings() { /* Implémentation similaire */ }
function renderSecurity() { /* Implémentation similaire */ }
function renderSysLogs() { /* Implémentation similaire */ }
function renderRBAC() { /* Implémentation similaire */ }
function renderAnalytics() { /* Implémentation similaire */ }
function renderFolders() { /* Implémentation similaire */ }
function renderSignatures() { /* Implémentation similaire */ }
function renderAI() { /* Implémentation similaire */ }
function renderAutomation() { /* Implémentation similaire */ }
function renderIntegrations() { /* Implémentation similaire */ }
function renderBackups() { /* Implémentation similaire */ }
function renderApiKeys() { /* Implémentation similaire */ }

// ─── Audit Log ───
function addAudit(action, targetType, targetId, details = {}) {
  const entry = { 
    id: generateId(), 
    userId: G.currentUser?.id, 
    userEmail: G.currentUser?.email, 
    action, 
    targetType, 
    targetId, 
    details, 
    timestamp: new Date().toISOString()
  };
  G.auditLog.unshift(entry);
  if (G.auditLog.length > 5000) G.auditLog.pop();
}

// ─── Stockage & Badges ───
function updateStorageDisplay() {
  const used = G.documents.reduce((sum, d) => sum + (d.size || 0), 0);
  const limit = CONFIG.plans[G.currentUser?.plan || 'free'].storage;
  const percent = Math.min(100, Math.round((used / limit) * 100));
  
  const storagePercent = document.getElementById('storagePercent');
  const storageBar = document.getElementById('storageBar');
  const storageText = document.getElementById('storageText');
  
  if (storagePercent) storagePercent.textContent = `${percent}%`;
  if (storageBar) storageBar.style.width = `${percent}%`;
  if (storageText) storageText.textContent = `${formatBytes(used)} / ${formatBytes(limit)}`;
}

function updateBadges() {
  // Mise à jour des badges de notification
}

function updateNotifBadge() {
  const notifBadge = document.getElementById('notifBadge');
  if (notifBadge) notifBadge.classList.toggle('hidden', G.unreadCount === 0);
}

// ─── Initialisation au chargement ───
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 SystemesGED v6.0 démarré');
  
  // 1. Initialiser Supabase
  initSupabase();
  
  // 2. Créer les administrateurs automatiquement
  await initializeSystemAdmins();
  
  // 3. Vérifier la session existante
  const { data: { session } } = await G.supabaseClient.auth.getSession();
  if (session) {
    const { data: profile } = await G.supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    
    if (profile && profile.status !== 'pending_validation') {
      G.currentUser = {
        id: session.user.id,
        email: session.user.email,
        name: profile.full_name,
        role: profile.role,
        companyId: profile.company_id,
        plan: profile.plan || 'free',
        status: profile.status
      };
      
      const { data: company } = await G.supabaseClient
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .single();
      
      if (company) G.currentCompany = company;
      await initializeApp();
    }
  }
});

// Exposer les fonctions globalement
Object.assign(window, {
  switchAuthTab, togglePwdInput, handleLogin, handleRegister, demoLogin, handleLogout,
  switchView, closeMobileSidebar,
  validateUser, rejectUser, deleteUser,
  renderDocuments, renderUsers, renderPendingUsers,
  initializeSystemAdmins
});
