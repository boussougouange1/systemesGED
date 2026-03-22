// SystemesGED v6.1 - CORRIGÉ pour nouvelles clés API
// ============================================

const CONFIG = {
  supabaseUrl: 'https://spgtflhprppeoidjguhs.supabase.co',
  // NOUVELLE clé publishable
  supabaseKey: 'sb_publishable_0TPq4MIBVDRBzS2CI5WxuA_SV7HkwMJ',
  // NOUVELLE clé secrète
  supabaseServiceKey: 'sb_secret_ovjskJG9MDqrmuhh_ENxVA_RR606S9J',
  // ...
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
    // Client standard avec la nouvelle clé publishable
    G.supabaseClient = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
    
    // Client admin avec la nouvelle clé secrète
    if (CONFIG.supabaseServiceKey && CONFIG.supabaseServiceKey.startsWith('sb_secret_')) {
      G.supabaseAdmin = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey, {
        auth: { 
          autoRefreshToken: false, 
          persistSession: false 
        }
      });
      console.log('✅ Client admin initialisé (nouvelle clé)');
    } else {
      console.warn('⚠️  Clé service role non configurée correctement');
    }
    
    window.SB = G.supabaseClient;
    console.log('✅ Supabase initialisé avec nouvelles clés');
    return true;
  } catch (e) {
    console.error('❌ Erreur init Supabase:', e);
    showToast('Erreur de connexion', 'error');
    return false;
  }
}

// ─── Utilitaires ───
function generateId() { 
  return Math.random().toString(36).substring(2) + Date.now().toString(36); 
}

function formatBytes(bytes) { 
  if (bytes === 0) return '0 Bytes'; 
  const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'], 
        i = Math.floor(Math.log(bytes) / Math.log(k)); 
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]; 
}

function formatDate(date) { 
  if (!date) return '-'; 
  const d = new Date(date); 
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); 
}

function getFileIcon(type) { 
  const icons = { 
    pdf: 'fa-file-pdf text-red-400', 
    doc: 'fa-file-word text-blue-400', 
    xls: 'fa-file-excel text-green-400', 
    img: 'fa-file-image text-purple-400', 
    txt: 'fa-file-alt text-gray-400', 
    zip: 'fa-file-archive text-yellow-400' 
  }; 
  return icons[type] || 'fa-file text-blue-400'; 
}

function getFileType(filename) { 
  const ext = filename.split('.').pop().toLowerCase(); 
  const types = { 
    pdf: ['pdf'], 
    doc: ['doc', 'docx', 'odt'], 
    xls: ['xls', 'xlsx', 'csv'], 
    img: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'], 
    txt: ['txt', 'md', 'json', 'xml'], 
    zip: ['zip', 'rar', '7z', 'tar', 'gz'] 
  }; 
  for (const [type, exts] of Object.entries(types)) {
    if (exts.includes(ext)) return type; 
  }
  return 'file'; 
}

// ─── Notifications ───
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) {
    console.log(`Toast (${type}): ${message}`);
    return;
  }
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  const icons = { 
    success: 'fa-check-circle text-green-400', 
    error: 'fa-times-circle text-red-400', 
    warning: 'fa-exclamation-triangle text-yellow-400', 
    info: 'fa-info-circle text-blue-400' 
  };
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info} text-lg"></i><span class="flex-1 text-sm">${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => { 
    toast.classList.add('hiding'); 
    setTimeout(() => toast.remove(), 300); 
  }, duration);
}

// ─── Logs ───
function addSysLog(level, message, meta = {}) {
  const entry = { 
    id: generateId(), 
    timestamp: new Date().toISOString(), 
    level, 
    message, 
    meta 
  };
  G.sysLogs.unshift(entry);
  if (G.sysLogs.length > 1000) G.sysLogs.pop();
  
  if (level === 'error' || level === 'security') {
    G.notifications.unshift({ 
      id: generateId(), 
      type: level, 
      message, 
      timestamp: entry.timestamp, 
      read: false 
    });
    G.unreadCount++;
    updateNotifBadge();
  }
}

function logInfo(msg, meta) { addSysLog('info', msg, meta); }
function logError(msg, meta) { addSysLog('error', msg, meta); }

// ─── CRÉATION AUTOMATIQUE DES ADMINS ───
async function initializeSystemAdmins() {
  console.log('🚀 Initialisation des administrateurs...');
  
  if (!G.supabaseAdmin) {
    console.warn('⚠️  Client admin non disponible');
    // Mode fallback: créer dans localStorage pour test
    createAdminsLocally();
    return;
  }

  const results = [];

  for (const adminConfig of CONFIG.systemAdmins) {
    console.log(`\n📝 Traitement: ${adminConfig.email}`);
    
    try {
      // Vérifier si l'utilisateur existe
      const { data: listData, error: listError } = await G.supabaseAdmin.auth.admin.listUsers();
      
      if (listError) {
        console.error(`❌ Erreur listUsers: ${listError.message}`);
        // Fallback local
        createAdminLocally(adminConfig);
        continue;
      }

      const existingUsers = listData?.users || [];
      const existingUser = existingUsers.find(u => u.email === adminConfig.email);
      let userId;

      if (existingUser) {
        console.log(`✅ Existant: ${existingUser.id}`);
        userId = existingUser.id;
        
        // Mettre à jour le mot de passe
        const { error: updateError } = await G.supabaseAdmin.auth.admin.updateUserById(
          userId,
          { password: adminConfig.password }
        );
        
        if (updateError) {
          console.error(`⚠️  Erreur update: ${updateError.message}`);
        }
      } else {
        // Créer l'utilisateur
        console.log(`⏳ Création...`);
        const { data: newUserData, error: createError } = await G.supabaseAdmin.auth.admin.createUser({
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
          createAdminLocally(adminConfig);
          continue;
        }

        userId = newUserData.user.id;
        console.log(`✅ Créé: ${userId}`);
      }

      // Créer/récupérer l'entreprise
      const companyId = await getOrCreateCompany(adminConfig.companyName);
      if (!companyId) continue;

      // Créer/mettre à jour le profil
      await createOrUpdateProfile(userId, adminConfig, companyId);

      results.push({
        email: adminConfig.email,
        userId: userId,
        companyId: companyId,
        success: true
      });

    } catch (error) {
      console.error(`❌ Exception: ${error.message}`);
      createAdminLocally(adminConfig);
      results.push({
        email: adminConfig.email,
        success: false,
        error: error.message
      });
    }
  }

  // Afficher récapitulatif
  console.log('\n' + '='.repeat(60));
  console.log('📋 RÉCAPITULATIF');
  console.log('='.repeat(60));
  results.forEach(r => {
    if (r.success) {
      console.log(`✅ ${r.email}`);
      console.log(`   UID: ${r.userId}`);
      console.log(`   Company: ${r.companyId}`);
    } else {
      console.log(`❌ ${r.email}: ${r.error}`);
    }
  });
  console.log('='.repeat(60));
}

async function getOrCreateCompany(companyName) {
  try {
    const { data: companies, error } = await G.supabaseClient
      .from('companies')
      .select('id')
      .eq('name', companyName);

    if (!error && companies && companies.length > 0) {
      console.log(`🏢 Entreprise existante: ${companies[0].id}`);
      return companies[0].id;
    }

    const { data: newCompany, error: createError } = await G.supabaseClient
      .from('companies')
      .insert([{
        name: companyName,
        plan: 'enterprise',
        status: 'active',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (createError) {
      console.error(`❌ Erreur création entreprise: ${createError.message}`);
      return null;
    }

    console.log(`🏢 Entreprise créée: ${newCompany.id}`);
    return newCompany.id;
  } catch (e) {
    console.error(`❌ Exception entreprise: ${e.message}`);
    return null;
  }
}

async function createOrUpdateProfile(userId, adminConfig, companyId) {
  try {
    const { data: existing } = await G.supabaseClient
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

    if (existing) {
      const { error } = await G.supabaseClient
        .from('profiles')
        .update(profileData)
        .eq('id', userId);

      if (error) console.error(`⚠️  Erreur update profil: ${error.message}`);
      else console.log(`👤 Profil mis à jour`);
    } else {
      profileData.created_at = new Date().toISOString();
      const { error } = await G.supabaseClient
        .from('profiles')
        .insert([profileData]);

      if (error) console.error(`❌ Erreur création profil: ${error.message}`);
      else console.log(`👤 Profil créé`);
    }
  } catch (e) {
    console.error(`❌ Exception profil: ${e.message}`);
  }
}

// ─── FALLBACK LOCAL ───
function createAdminsLocally() {
  console.log('💾 Création des admins en mode local (fallback)');
  CONFIG.systemAdmins.forEach(admin => createAdminLocally(admin));
}

function createAdminLocally(adminConfig) {
  const companyId = 'local_' + adminConfig.companyName;
  const userId = 'local_' + Math.random().toString(36).substring(2);
  
  // Sauvegarder dans localStorage
  localStorage.setItem(`company_${companyId}`, JSON.stringify({
    id: companyId,
    name: adminConfig.companyName,
    plan: 'enterprise'
  }));
  
  localStorage.setItem(`user_${adminConfig.email}`, JSON.stringify({
    id: userId,
    email: adminConfig.email,
    name: adminConfig.fullName,
    password: adminConfig.password,
    role: 'admin',
    companyId: companyId,
    status: 'active',
    isSystemAdmin: true
  }));
  
  console.log(`💾 Admin local créé: ${adminConfig.email} (ID: ${userId})`);
}

// ─── AUTHENTIFICATION ───
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
  const email = document.getElementById('loginEmail')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;

  if (!email || !password) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }

  if (btn) btn.disabled = true;
  if (btnText) btnText.innerHTML = '<span class="spinner mr-2"></span>Connexion...';

  try {
    // Tentative 1: Supabase Auth
    if (G.supabaseClient) {
      const { data: authData, error: authError } = await G.supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (!authError && authData?.user) {
        console.log('✅ Connecté via Supabase');
        await setupUserSession(authData.user);
        return;
      }
      
      console.log('⚠️  Supabase auth échouée, tentative locale...');
    }

    // Tentative 2: Fallback local
    const localUser = await localAuthLogin(email, password);
    if (localUser) {
      console.log('✅ Connecté via localStorage');
      G.currentUser = localUser;
      G.currentCompany = { 
        id: localUser.companyId, 
        name: localUser.companyId.replace('local_', ''),
        plan: 'enterprise'
      };
      await initializeApp();
      showToast('Connexion réussie (mode local)', 'success');
    } else {
      showToast('Email ou mot de passe incorrect', 'error');
    }

  } catch (err) {
    console.error('Erreur login:', err);
    showToast('Erreur de connexion', 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
  }
}

async function setupUserSession(authUser) {
  try {
    // Récupérer le profil
    const { data: profile, error: profileError } = await G.supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (profileError || !profile) {
      console.error('Profil non trouvé:', profileError);
      showToast('Profil utilisateur non trouvé', 'error');
      return;
    }

    if (profile.status === 'pending_validation') {
      showToast('Compte en attente de validation', 'warning');
      await G.supabaseClient.auth.signOut();
      return;
    }

    // Mettre à jour l'état
    G.currentUser = {
      id: authUser.id,
      email: authUser.email,
      name: profile.full_name || authUser.email,
      role: profile.role || 'viewer',
      companyId: profile.company_id,
      plan: profile.plan || 'free',
      status: profile.status,
      isSystemAdmin: profile.is_company_admin || false,
      permissions: profile.admin_rights || []
    };

    // Récupérer l'entreprise
    const { data: company } = await G.supabaseClient
      .from('companies')
      .select('*')
      .eq('id', profile.company_id)
      .single();

    if (company) G.currentCompany = company;

    await initializeApp();
    showToast('Connexion réussie', 'success');
    addAudit('login', 'user', G.currentUser.id);

  } catch (err) {
    console.error('Erreur setup session:', err);
    showToast('Erreur lors de la connexion', 'error');
  }
}

async function localAuthLogin(email, password) {
  // Vérifier les admins configurés
  const systemAdmin = CONFIG.systemAdmins.find(a => a.email === email);
  if (systemAdmin && password === systemAdmin.password) {
    return {
      id: 'local_admin_' + Date.now(),
      email: systemAdmin.email,
      name: systemAdmin.fullName,
      role: 'admin',
      companyId: 'local_' + systemAdmin.companyName,
      plan: 'enterprise',
      status: 'active',
      isSystemAdmin: true
    };
  }

  // Vérifier localStorage
  const stored = localStorage.getItem(`user_${email}`);
  if (stored) {
    const user = JSON.parse(stored);
    if (user.password === password) return user;
  }

  return null;
}

async function handleRegister(e) {
  e.preventDefault();
  
  const data = {
    firstName: document.getElementById('regFirst')?.value?.trim(),
    lastName: document.getElementById('regLast')?.value?.trim(),
    company: document.getElementById('regCompany')?.value?.trim(),
    email: document.getElementById('regEmail')?.value?.trim(),
    password: document.getElementById('regPassword')?.value
  };

  if (!data.firstName || !data.lastName || !data.company || !data.email || !data.password) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }

  try {
    // Tentative Supabase
    if (G.supabaseClient) {
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

      if (!authError && authData?.user) {
        // Créer l'entreprise
        const { data: company, error: compError } = await G.supabaseClient
          .from('companies')
          .insert([{
            name: data.company,
            plan: 'free',
            status: 'active'
          }])
          .select()
          .single();

        if (compError) throw compError;

        // Créer le profil
        await G.supabaseClient.from('profiles').insert([{
          id: authData.user.id,
          email: data.email,
          full_name: `${data.firstName} ${data.lastName}`,
          role: 'viewer',
          status: 'pending_validation',
          company_id: company.id
        }]);

        showToast('Compte créé - en attente de validation', 'success');
        switchAuthTab('login');
        return;
      }
    }

    // Fallback local
    const existing = localStorage.getItem(`user_${data.email}`);
    if (existing) {
      showToast('Cet email est déjà utilisé', 'error');
      return;
    }

    const companyId = 'local_' + generateId();
    const userId = 'local_' + generateId();

    localStorage.setItem(`company_${companyId}`, JSON.stringify({
      id: companyId,
      name: data.company,
      plan: 'free'
    }));

    localStorage.setItem(`user_${data.email}`, JSON.stringify({
      id: userId,
      email: data.email,
      name: `${data.firstName} ${data.lastName}`,
      password: data.password,
      role: 'viewer',
      companyId: companyId,
      status: 'pending_validation'
    }));

    showToast('Compte créé (mode local) - en attente', 'success');
    switchAuthTab('login');

  } catch (err) {
    console.error('Erreur inscription:', err);
    showToast(err.message || 'Erreur lors de l\'inscription', 'error');
  }
}

function demoLogin() {
  document.getElementById('loginEmail').value = 'ahouansouange@live.fr';
  document.getElementById('loginPassword').value = 'AdminLive2024!';
  handleLogin(new Event('submit'));
}

async function handleLogout() {
  try {
    await G.supabaseClient?.auth?.signOut();
  } catch (e) {
    console.log('Déconnexion Supabase ignorée');
  }
  
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
  
  if (G.currentUser) {
    localStorage.setItem('currentUser', JSON.stringify(G.currentUser));
    localStorage.setItem('currentCompany', JSON.stringify(G.currentCompany));
  }
  
  updateUserDisplay();
  await loadInitialData();
  updatePendingUsersCount();
  switchView('dashboard');
  logInfo('Application initialisée', { user: G.currentUser?.id });
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
  
  try {
    const { data: pendingUsers, error } = await G.supabaseClient
      .from('profiles')
      .select('id')
      .eq('company_id', G.currentUser.companyId)
      .eq('status', 'pending_validation');
    
    if (!error && pendingUsers) {
      G.pendingUsersCount = pendingUsers.length;
    } else {
      // Fallback: compter dans localStorage
      G.pendingUsersCount = 0;
    }
  } catch (e) {
    G.pendingUsersCount = 0;
  }
  
  updatePendingUsersBadge();
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
  try {
    await Promise.all([
      loadDocuments(), 
      loadWorkflows(), 
      loadUsers(), 
      loadTags(), 
      loadShares(), 
      loadFolders(), 
      loadSignatures()
    ]);
  } catch (e) {
    console.error('Erreur chargement données:', e);
  }
  updateStorageDisplay();
  updateBadges();
}

// ─── Chargement des données ───
async function loadDocuments() {
  if (!G.currentUser?.companyId) {
    G.documents = [];
    return;
  }
  
  try {
    const { data, error } = await G.supabaseClient
      .from('documents')
      .select('*')
      .eq('company_id', G.currentUser.companyId)
      .eq('is_deleted', false);
    
    G.documents = error ? [] : (data || []);
  } catch (e) {
    G.documents = [];
  }
}

async function loadWorkflows() {
  if (!G.currentUser?.companyId) {
    G.workflows = [];
    return;
  }
  
  try {
    const { data, error } = await G.supabaseClient
      .from('workflows')
      .select('*')
      .eq('company_id', G.currentUser.companyId);
    
    G.workflows = error ? [] : (data || []);
  } catch (e) {
    G.workflows = [];
  }
}

async function loadUsers() {
  if (!G.currentUser?.companyId) {
    G.users = [];
    return;
  }
  
  try {
    const { data, error } = await G.supabaseClient
      .from('profiles')
      .select('*')
      .eq('company_id', G.currentUser.companyId);
    
    G.users = error ? [] : (data || []);
  } catch (e) {
    G.users = [];
  }
}

async function loadTags() {
  G.tags = [
    { id: generateId(), name: 'Important', color: '#ef4444' },
    { id: generateId(), name: 'Urgent', color: '#f97316' },
    { id: generateId(), name: 'Contrat', color: '#3b82f6' }
  ];
}

async function loadShares() { G.shares = []; }
async function loadFolders() { G.folders = [{ id: '__root__', name: 'Racine' }]; }
async function loadSignatures() { G.signatures = []; }

// ─── Navigation ───
function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active-view');
  
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll(`[data-view="${viewName}"]`).forEach(el => el.classList.add('active'));
  
  G.currentView = viewName;
  closeMobileSidebar();
  
  // Appeler le renderer
  const renderers = {
    dashboard: renderDashboard,
    documents: renderDocuments,
    users: renderUsers,
    'pending-users': renderPendingUsers
  };
  
  if (renderers[viewName]) renderers[viewName]();
}

function closeMobileSidebar() {
  document.getElementById('mobileSidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('active');
}

// ─── Dashboard ───
function renderDashboard() {
  const totalDocs = G.documents?.length || 0;
  const activeWorkflows = G.workflows?.filter(w => ['pending', 'in_review'].includes(w.status))?.length || 0;
  
  const totalDocsEl = document.getElementById('totalDocs');
  const dashWorkflowCountEl = document.getElementById('dashWorkflowCount');
  
  if (totalDocsEl) totalDocsEl.textContent = totalDocs;
  if (dashWorkflowCountEl) dashWorkflowCountEl.textContent = activeWorkflows;
  
  renderActivityList();
}

function renderActivityList() {
  const list = document.getElementById('activityList');
  if (!list) return;
  
  if (!G.auditLog || G.auditLog.length === 0) {
    list.innerHTML = '<div class="text-center py-8 text-blue-300/50">Aucune activité récente</div>';
    return;
  }
  
  list.innerHTML = G.auditLog.slice(0, 10).map(act => `
    <div class="flex items-center gap-3 p-3 rounded-xl bg-blue-900/20">
      <div class="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
        <i class="fas fa-circle"></i>
      </div>
      <div>
        <p class="text-sm text-white">${act.action}</p>
        <p class="text-xs text-blue-300/60">${formatDate(act.timestamp)}</p>
      </div>
    </div>
  `).join('');
}

// ─── Documents ───
function renderDocuments() {
  const grid = document.getElementById('documentGrid');
  if (!grid) return;
  
  const docs = G.documents || [];
  
  if (docs.length === 0) {
    grid.innerHTML = '<div class="text-center py-12 text-blue-300/50">Aucun document</div>';
    return;
  }
  
  grid.innerHTML = docs.map(doc => `
    <div class="glass-card rounded-2xl p-4 border border-blue-500/20">
      <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-2xl mb-3">
        <i class="fas ${getFileIcon(doc.type).split(' ')[0]} ${getFileIcon(doc.type).split(' ')[1]}"></i>
      </div>
      <h4 class="text-white font-semibold text-sm mb-1 truncate">${doc.name}</h4>
      <p class="text-blue-300/60 text-xs">${formatBytes(doc.size)} • ${formatDate(doc.created_at)}</p>
    </div>
  `).join('');
}

// ─── Utilisateurs ───
async function renderUsers() {
  const tbody = document.getElementById('usersList');
  if (!tbody) return;
  
  await loadUsers();
  
  if (!G.users || G.users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-blue-300/50">Aucun utilisateur</td></tr>';
    return;
  }
  
  tbody.innerHTML = G.users.map(u => `
    <tr class="hover:bg-blue-500/5">
      <td class="p-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
            ${u.full_name?.charAt(0) || 'U'}
          </div>
          <div>
            <p class="text-white text-sm font-medium">${u.full_name || u.email}</p>
            <p class="text-xs text-blue-300/60">${u.email}</p>
          </div>
        </div>
      </td>
      <td class="p-4">
        <span class="px-2 py-1 rounded-full text-xs ${getRoleBadgeClass(u.role)}">
          ${G.roles[u.role]?.name || u.role}
        </span>
      </td>
      <td class="p-4">
        <span class="px-2 py-1 rounded-full text-xs ${u.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}">
          ${u.status === 'pending_validation' ? 'En attente' : u.status}
        </span>
      </td>
      <td class="p-4">
        ${u.status === 'pending_validation' && canValidateUsers() ? 
          `<button onclick="validateUser('${u.id}')" class="px-3 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs">Valider</button>` : ''}
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

async function validateUser(userId) {
  if (!canValidateUsers()) {
    showToast('Permission refusée', 'error');
    return;
  }
  
  try {
    const { error } = await G.supabaseClient
      .from('profiles')
      .update({ 
        status: 'active', 
        validated_at: new Date().toISOString(),
        validated_by: G.currentUser?.id 
      })
      .eq('id', userId);
    
    if (error) throw error;
    
    showToast('Utilisateur validé', 'success');
    await loadUsers();
    renderUsers();
    updatePendingUsersCount();
  } catch (e) {
    showToast('Erreur de validation', 'error');
  }
}

async function renderPendingUsers() {
  const container = document.getElementById('pendingUsersList');
  if (!container) return;
  
  try {
    const { data: pendingUsers, error } = await G.supabaseClient
      .from('profiles')
      .select('*')
      .eq('company_id', G.currentUser?.companyId)
      .eq('status', 'pending_validation');
    
    if (error || !pendingUsers || pendingUsers.length === 0) {
      container.innerHTML = '<div class="text-center py-12 text-blue-300/50">Aucun utilisateur en attente</div>';
      return;
    }
    
    container.innerHTML = pendingUsers.map(u => `
      <div class="glass-card rounded-xl p-4 border border-yellow-500/20">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center justify-center text-lg font-bold">
              ${u.full_name?.charAt(0) || 'U'}
            </div>
            <div>
              <p class="text-white font-medium">${u.full_name || u.email}</p>
              <p class="text-sm text-blue-300/60">${u.email}</p>
            </div>
          </div>
          <button onclick="validateUser('${u.id}')" class="px-4 py-2 rounded-lg bg-green-500/20 text-green-400">
            <i class="fas fa-check mr-2"></i>Valider
          </button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50">Erreur de chargement</div>';
  }
}

// ─── Audit & Stockage ───
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

function updateStorageDisplay() {
  const used = (G.documents || []).reduce((sum, d) => sum + (d.size || 0), 0);
  const limit = CONFIG.plans[G.currentUser?.plan || 'free'].storage;
  const percent = Math.min(100, Math.round((used / limit) * 100));
  
  const storagePercent = document.getElementById('storagePercent');
  const storageBar = document.getElementById('storageBar');
  const storageText = document.getElementById('storageText');
  
  if (storagePercent) storagePercent.textContent = `${percent}%`;
  if (storageBar) storageBar.style.width = `${percent}%`;
  if (storageText) storageText.textContent = `${formatBytes(used)} / ${formatBytes(limit)}`;
}

function updateBadges() {}

function updateNotifBadge() {
  const notifBadge = document.getElementById('notifBadge');
  if (notifBadge) notifBadge.classList.toggle('hidden', G.unreadCount === 0);
}

// ─── Initialisation ───
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 SystemesGED v6.1 démarré');
  
  // Initialiser Supabase
  initSupabase();
  
  // Créer les admins (avec fallback local si échec)
  await initializeSystemAdmins();
  
  // Vérifier session existante
  try {
    const { data: { session } } = await G.supabaseClient.auth.getSession();
    if (session?.user) {
      await setupUserSession(session.user);
    }
  } catch (e) {
    console.log('Pas de session active');
  }
});

// Exposer globalement
Object.assign(window, {
  switchAuthTab, togglePwdInput, handleLogin, handleRegister, demoLogin, handleLogout,
  switchView, closeMobileSidebar,
  validateUser, renderDocuments, renderUsers, renderPendingUsers,
  initializeSystemAdmins
});
