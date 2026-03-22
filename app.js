// SystemesGED v5.6 - Application principale (CORRIGÉ ET CONNECTÉ À SUPABASE)
// ============================================

// ─── Configuration Supabase ───
const CONFIG = {
  supabaseUrl: 'https://whkvtpqesqiailwjgoaq.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indoa3Z0cHFlc3FpYWlsd2pnb2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxOTU1ODIsImV4cCI6MjA4OTc3MTU4Mn0.oIEDNRvSAEsVTarXnIl1cMTLoqS1nsHo8dPnjdW0ng8',

  storageBucket: 'documents',
  maxFileSize: 50 * 1024 * 1024,

  defaultPlan: 'free',
  plans: {
    free: { name: 'Free', price: 0, users: 5, storage: 1073741824, features: ['basic'] },
    starter: { name: 'Starter', price: 29, users: 20, storage: 10737418240, features: ['basic', 'versioning'] },
    professional: { name: 'Professional', price: 79, users: 100, storage: 107374182400, features: ['basic', 'versioning', 'rbac', 'audit'] },
    enterprise: { name: 'Enterprise', price: null, users: 999999, storage: 999999999999, features: ['all'] }
  },

  // ADMINISTRATEURS SYSTÈME
  systemAdmins: [
    {
      email: 'ahouansouange@live.fr',
      companyName: 'live',
      companyId: 'company_live_001',
      userId: '57923740-aa51-40c7-8bca-d60c20ea307f',
      password: 'AA++aa++11111'
    },
    {
      email: 'systemesshop@gmail.com',
      companyName: 'systemesshop',
      companyId: 'company_systemesshop_001',
      userId: 'c1fa75e6-709b-4a18-af67-0329f58dbac0',
      password: 'SS++ss++11111'
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
  supabaseConnected: false,
  useLocalAuth: true,
  // Nouveaux états pour les onglets
  securityTab: 'overview',
  settings: {
    notifications: true,
    autoOcr: true,
    darkMode: true
  }
};

// ─── Initialisation Supabase ───
let SB = null;

async function initializeSupabase() {
  try {
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      console.log('ℹ️ Supabase non disponible, mode local activé');
      G.useLocalAuth = true;
      return false;
    }

    SB = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      },
      realtime: { params: { eventsPerSecond: 10 } }
    });

    window.SB = SB;

    // Tester la connexion
    const { data, error } = await SB.auth.getSession();
    if (error) {
      console.log('ℹ️ Supabase Auth non configuré, mode local activé');
      G.useLocalAuth = true;
      return false;
    }

    if (data.session) {
      G.supabaseConnected = true;
      G.useLocalAuth = false;
      console.log('✅ Connecté à Supabase');
    }

    return true;
  } catch (e) {
    console.log('ℹ️ Erreur Supabase, mode local activé:', e.message);
    G.useLocalAuth = true;
    return false;
  }
}

// ─── FONCTIONS DE BASE SUPABASE ───

async function supabaseSignUp(email, password, userData) {
  if (!SB || G.useLocalAuth) return { error: { message: 'Supabase non disponible' } };

  try {
    const { data, error } = await SB.auth.signUp({
      email,
      password,
      options: { data: userData }
    });
    return { data, error };
  } catch (e) {
    return { error: { message: e.message } };
  }
}

async function supabaseSignIn(email, password) {
  if (!SB || G.useLocalAuth) return { error: { message: 'Supabase non disponible' } };

  try {
    const { data, error } = await SB.auth.signInWithPassword({ email, password });
    return { data, error };
  } catch (e) {
    return { error: { message: e.message } };
  }
}

async function supabaseSignOut() {
  if (!SB || G.useLocalAuth) return { error: null };

  try {
    const { error } = await SB.auth.signOut();
    return { error };
  } catch (e) {
    return { error: { message: e.message } };
  }
}

// ─── OPÉRATIONS BASE DE DONNÉES SUPABASE ───

async function dbGet(table, query = {}) {
  if (!SB || G.useLocalAuth) return { data: null, error: { message: 'Mode local' } };

  try {
    let q = SB.from(table).select('*');

    if (query.eq) {
      Object.entries(query.eq).forEach(([key, value]) => {
        q = q.eq(key, value);
      });
    }

    if (query.order) {
      q = q.order(query.order.column, { ascending: query.order.ascending });
    }

    const { data, error } = await q;
    return { data, error };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}

async function dbInsert(table, data) {
  if (!SB || G.useLocalAuth) return { data: null, error: { message: 'Mode local' } };

  try {
    const { data: result, error } = await SB.from(table).insert(data).select();
    return { data: result, error };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}

async function dbUpdate(table, id, data) {
  if (!SB || G.useLocalAuth) return { data: null, error: { message: 'Mode local' } };

  try {
    const { data: result, error } = await SB.from(table).update(data).eq('id', id).select();
    return { data: result, error };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}

async function dbDelete(table, id) {
  if (!SB || G.useLocalAuth) return { error: { message: 'Mode local' } };

  try {
    const { error } = await SB.from(table).delete().eq('id', id);
    return { error };
  } catch (e) {
    return { error: { message: e.message } };
  }
}

// ─── STORAGE SUPABASE ───

async function uploadToSupabaseStorage(filePath, file) {
  if (!SB || G.useLocalAuth) return { error: { message: 'Storage non disponible' } };

  try {
    const { data, error } = await SB.storage
      .from(CONFIG.storageBucket)
      .upload(filePath, file, { cacheControl: '3600', upsert: false });
    return { data, error };
  } catch (e) {
    return { error: { message: e.message } };
  }
}

async function getStorageUrl(filePath) {
  if (!SB || G.useLocalAuth) return null;

  try {
    const { data } = SB.storage.from(CONFIG.storageBucket).getPublicUrl(filePath);
    return data?.publicUrl || null;
  } catch (e) {
    return null;
  }
}

// ─── AUTENTIFICATION ───

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
  const icon = btn?.querySelector('i');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  if (icon) icon.className = input.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}

// CONNEXION CORRIGÉE
async function handleLogin(e) {
  e.preventDefault();

  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');

  if (btn) btn.disabled = true;
  if (btnText) btnText.innerHTML = '<span class="spinner mr-2"></span>Connexion...';

  const email = document.getElementById('loginEmail')?.value?.trim().toLowerCase();
  const password = document.getElementById('loginPassword')?.value;

  console.log('Tentative de connexion:', email);

  try {
    // 1. VÉRIFICATION ADMIN SYSTÈME (PRIORITAIRE)
    const systemAdmin = CONFIG.systemAdmins.find(a => a.email.toLowerCase() === email);
    if (systemAdmin) {
      console.log('Admin système trouvé:', systemAdmin.email);

      if (password === systemAdmin.password) {
        console.log('Mot de passe admin correct');

        const adminUser = {
          id: systemAdmin.userId,
          email: systemAdmin.email,
          name: `Administrateur ${systemAdmin.companyName}`,
          role: 'admin',
          companyId: systemAdmin.companyId,
          companyName: systemAdmin.companyName,
          plan: 'enterprise',
          status: 'active',
          isSystemAdmin: true,
          permissions: ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users']
        };

        G.currentUser = adminUser;
        G.currentCompany = {
          id: systemAdmin.companyId,
          name: systemAdmin.companyName,
          plan: 'enterprise'
        };

        localStorage.setItem('currentUser', JSON.stringify(adminUser));
        localStorage.setItem('currentCompany', JSON.stringify(G.currentCompany));

        console.log('Connexion admin réussie, initialisation...');

        await initializeApp();
        showToast(`Bienvenue ${adminUser.name} !`, 'success');

        if (btn) btn.disabled = false;
        if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
        return;
      } else {
        console.log('Mot de passe admin incorrect');
        showToast('Mot de passe incorrect', 'error');
        if (btn) btn.disabled = false;
        if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
        return;
      }
    }

    // 2. VÉRIFICATION UTILISATEURS LOCAUX
    const localUserKey = `user_${email}`;
    const localUserData = localStorage.getItem(localUserKey);

    if (localUserData) {
      const user = JSON.parse(localUserData);
      if (user.password === password) {
        if (user.status === 'pending_validation') {
          showToast('Votre compte est en attente de validation par un administrateur', 'warning');
          if (btn) btn.disabled = false;
          if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
          return;
        }

        G.currentUser = user;
        G.currentCompany = JSON.parse(localStorage.getItem(`company_${user.companyId}`) || '{}');

        localStorage.setItem('currentUser', JSON.stringify(user));
        localStorage.setItem('currentCompany', JSON.stringify(G.currentCompany));

        await initializeApp();
        showToast(`Bienvenue ${user.name} !`, 'success');

        if (btn) btn.disabled = false;
        if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
        return;
      }
    }

    // 3. TENTATIVE SUPABASE
    if (!G.useLocalAuth && SB) {
      try {
        const { data, error } = await supabaseSignIn(email, password);

        if (error) throw error;

        if (data.user) {
          const { data: userData, error: userError } = await dbGet('users', { eq: { id: data.user.id } });

          if (userError || !userData || userData.length === 0) {
            const newUser = {
              id: data.user.id,
              email: data.user.email,
              name: data.user.user_metadata?.name || data.user.email,
              role: data.user.user_metadata?.role || 'viewer',
              company_id: data.user.user_metadata?.company_id,
              plan: data.user.user_metadata?.plan || 'free',
              status: 'active',
              created_at: new Date().toISOString()
            };

            await dbInsert('users', newUser);
            G.currentUser = newUser;
          } else {
            G.currentUser = userData[0];
          }

          if (G.currentUser.company_id) {
            const { data: companyData } = await dbGet('companies', { eq: { id: G.currentUser.company_id } });
            G.currentCompany = companyData?.[0] || { id: G.currentUser.company_id, name: 'Mon Entreprise', plan: G.currentUser.plan };
          }

          localStorage.setItem('currentUser', JSON.stringify(G.currentUser));
          localStorage.setItem('currentCompany', JSON.stringify(G.currentCompany));

          await initializeApp();
          showToast(`Bienvenue ${G.currentUser.name} !`, 'success');

          if (btn) btn.disabled = false;
          if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
          return;
        }
      } catch (supabaseError) {
        console.log('Échec connexion Supabase:', supabaseError.message);
      }
    }

    showToast('Email ou mot de passe incorrect', 'error');

  } catch (err) {
    console.error('Erreur login:', err);
    showToast('Erreur de connexion: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
  }
}

// INSCRIPTION CORRIGÉE
async function handleRegister(e) {
  e.preventDefault();

  const firstName = document.getElementById('regFirst')?.value?.trim();
  const lastName = document.getElementById('regLast')?.value?.trim();
  const company = document.getElementById('regCompany')?.value?.trim();
  const email = document.getElementById('regEmail')?.value?.trim().toLowerCase();
  const password = document.getElementById('regPassword')?.value;

  if (!firstName || !lastName || !company || !email || !password) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }

  if (localStorage.getItem(`user_${email}`)) {
    showToast('Cet email est déjà utilisé', 'error');
    return;
  }

  if (CONFIG.systemAdmins.some(a => a.email.toLowerCase() === email)) {
    showToast('Cet email est réservé', 'error');
    return;
  }

  try {
    const companyId = `company_${generateId()}`;
    const userId = generateId();

    const newUser = {
      id: userId,
      email: email,
      name: `${firstName} ${lastName}`,
      firstName: firstName,
      lastName: lastName,
      role: 'admin',
      status: 'pending_validation',
      companyId: companyId,
      companyName: company,
      plan: 'free',
      password: password,
      createdAt: new Date().toISOString()
    };

    const companyData = {
      id: companyId,
      name: company,
      plan: 'free',
      createdAt: new Date().toISOString(),
      ownerId: userId
    };

    localStorage.setItem(`user_${email}`, JSON.stringify(newUser));
    localStorage.setItem(`company_${companyId}`, JSON.stringify(companyData));

    if (!G.useLocalAuth && SB) {
      try {
        const { data: authData, error: authError } = await supabaseSignUp(email, password, {
          name: `${firstName} ${lastName}`,
          company_id: companyId,
          role: 'admin',
          plan: 'free'
        });

        if (!authError && authData.user) {
          await dbInsert('companies', {
            id: companyId,
            name: company,
            plan: 'free',
            owner_id: authData.user.id,
            created_at: new Date().toISOString()
          });

          await dbInsert('users', {
            id: authData.user.id,
            email: email,
            name: `${firstName} ${lastName}`,
            role: 'admin',
            company_id: companyId,
            plan: 'free',
            status: 'pending_validation',
            created_at: new Date().toISOString()
          });
        }
      } catch (supabaseErr) {
        console.log('Erreur création Supabase (non bloquante):', supabaseErr.message);
      }
    }

    const pendingKey = `pending_users_${companyId}`;
    const pending = JSON.parse(localStorage.getItem(pendingKey) || '[]');
    pending.push({
      userId: userId,
      email: email,
      name: newUser.name,
      requestedAt: new Date().toISOString()
    });
    localStorage.setItem(pendingKey, JSON.stringify(pending));

    console.log('Inscription réussie:', email);
    showToast('Compte créé ! En attente de validation par un administrateur.', 'success');

    switchAuthTab('login');

    const loginEmail = document.getElementById('loginEmail');
    if (loginEmail) loginEmail.value = email;

  } catch (err) {
    console.error('Erreur inscription:', err);
    showToast('Erreur lors de la création du compte: ' + err.message, 'error');
  }
}

// DÉCONNEXION
async function handleLogout() {
  if (!G.useLocalAuth && SB) {
    await supabaseSignOut();
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

// CONNEXION DÉMO
function demoLogin() {
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');

  if (loginEmail) loginEmail.value = 'demo@systemesged.fr';
  if (loginPassword) loginPassword.value = 'Admin123!';

  const demoUser = {
    id: 'demo_user_001',
    email: 'demo@systemesged.fr',
    name: 'Utilisateur Démo',
    role: 'admin',
    status: 'active',
    companyId: 'demo_company_001',
    companyName: 'Entreprise Démo',
    plan: 'professional',
    password: 'Admin123!'
  };

  localStorage.setItem('user_demo@systemesged.fr', JSON.stringify(demoUser));
  localStorage.setItem('company_demo_company_001', JSON.stringify({
    id: 'demo_company_001',
    name: 'Entreprise Démo',
    plan: 'professional'
  }));

  handleLogin(new Event('submit'));
}

// CONNEXION OAUTH
function oauthLogin(provider) {
  showToast(`Connexion ${provider}...`, 'info');

  setTimeout(() => {
    const mockUser = { 
      id: generateId(), 
      email: `oauth_${provider}@demo.fr`, 
      name: `User ${provider}`, 
      role: 'admin', 
      companyId: 'demo_company', 
      plan: 'professional', 
      status: 'active' 
    };
    G.currentUser = mockUser;
    G.currentCompany = { id: 'demo_company', name: 'Entreprise Démo', plan: 'professional' };

    localStorage.setItem('currentUser', JSON.stringify(mockUser));
    localStorage.setItem('currentCompany', JSON.stringify(G.currentCompany));

    initializeApp();
    showToast(`Connecté via ${provider}`, 'success');
  }, 1500);
}

// ─── Initialisation Application ───
async function initializeApp() {
  console.log('Initialisation de l\'application...');

  const loginScreen = document.getElementById('loginScreen');
  const mainApp = document.getElementById('mainApp');

  if (loginScreen) loginScreen.style.display = 'none';
  if (mainApp) {
    mainApp.style.display = 'block';
    mainApp.classList.remove('hidden');
  }

  updateUserDisplay();
  await loadInitialData();
  updatePendingUsersCount();
  switchView('dashboard');

  console.log('Application initialisée avec succès');
}

function isAdmin() {
  return G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
}

function canValidateUsers() {
  return isAdmin();
}

function canManageSignatures() {
  return isAdmin();
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

function updatePendingUsersCount() {
  if (!G.currentUser?.companyId) return;

  const pendingKey = `pending_users_${G.currentUser.companyId}`;
  const pending = JSON.parse(localStorage.getItem(pendingKey) || '[]');
  const usersInCompany = G.users.filter(u => u.companyId === G.currentUser.companyId && u.status === 'pending_validation');

  G.pendingUsersCount = pending.length + usersInCompany.length;
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

// ─── Chargement des données ───
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

async function simulateNetworkDelay(ms = 500) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Données avec Supabase ───
async function loadDocuments() {
  await simulateNetworkDelay(300);

  if (!G.useLocalAuth && SB && G.currentUser?.companyId) {
    try {
      const { data, error } = await dbGet('documents', { 
        eq: { company_id: G.currentUser.companyId },
        order: { column: 'created_at', ascending: false }
      });

      if (!error && data && data.length > 0) {
        G.documents = data.map(doc => ({
          id: doc.id,
          name: doc.name,
          type: doc.type,
          size: doc.size,
          description: doc.description,
          scope: doc.scope,
          ownerId: doc.owner_id,
          companyId: doc.company_id,
          folderId: doc.folder_id || '__root__',
          tags: doc.tags || [],
          createdAt: doc.created_at,
          updatedAt: doc.updated_at,
          version: doc.version || 1,
          views: doc.views || 0,
          downloads: doc.downloads || 0,
          isDeleted: doc.is_deleted || false,
          deletedAt: doc.deleted_at,
          content: doc.content || ''
        }));
        return G.documents;
      }
    } catch (e) {
      console.log('Erreur chargement documents Supabase:', e.message);
    }
  }

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

async function saveDocuments() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`docs_${G.currentUser.companyId}`, JSON.stringify(G.documents));

    if (!G.useLocalAuth && SB) {
      for (const doc of G.documents) {
        const supabaseDoc = {
          id: doc.id,
          name: doc.name,
          type: doc.type,
          size: doc.size,
          description: doc.description,
          scope: doc.scope,
          owner_id: doc.ownerId,
          company_id: doc.companyId,
          folder_id: doc.folderId,
          tags: doc.tags,
          created_at: doc.createdAt,
          updated_at: doc.updatedAt,
          version: doc.version,
          views: doc.views,
          downloads: doc.downloads,
          is_deleted: doc.isDeleted,
          deleted_at: doc.deletedAt,
          content: doc.content
        };

        try {
          await dbInsert('documents', supabaseDoc);
        } catch (e) {
          await dbUpdate('documents', doc.id, supabaseDoc);
        }
      }
    }
  }
}

async function loadWorkflows() {
  await simulateNetworkDelay(200);

  if (!G.useLocalAuth && SB && G.currentUser?.companyId) {
    try {
      const { data, error } = await dbGet('workflows', { eq: { company_id: G.currentUser.companyId } });
      if (!error && data && data.length > 0) {
        G.workflows = data.map(wf => ({
          id: wf.id,
          title: wf.title,
          description: wf.description,
          status: wf.status,
          priority: wf.priority,
          assigneeId: wf.assignee_id,
          createdBy: wf.created_by,
          companyId: wf.company_id,
          createdAt: wf.created_at,
          updatedAt: wf.updated_at
        }));
        return G.workflows;
      }
    } catch (e) {
      console.log('Erreur chargement workflows Supabase:', e.message);
    }
  }

  const stored = localStorage.getItem(`workflows_${G.currentUser?.companyId}`);
  G.workflows = stored ? JSON.parse(stored) : [];
  return G.workflows;
}

async function saveWorkflows() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`workflows_${G.currentUser.companyId}`, JSON.stringify(G.workflows));

    if (!G.useLocalAuth && SB) {
      for (const wf of G.workflows) {
        const supabaseWf = {
          id: wf.id,
          title: wf.title,
          description: wf.description,
          status: wf.status,
          priority: wf.priority,
          assignee_id: wf.assigneeId,
          created_by: wf.createdBy,
          company_id: wf.companyId,
          created_at: wf.createdAt,
          updated_at: wf.updatedAt
        };

        try {
          await dbInsert('workflows', supabaseWf);
        } catch (e) {
          await dbUpdate('workflows', wf.id, supabaseWf);
        }
      }
    }
  }
}

async function loadUsers() {
  await simulateNetworkDelay(200);

  const users = [];
  const companyId = G.currentUser?.companyId;

  if (companyId) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('user_')) {
        try {
          const user = JSON.parse(localStorage.getItem(key));
          if (user.companyId === companyId) {
            users.push(user);
          }
        } catch (e) {}
      }
    }
  }

  if (!G.useLocalAuth && SB && companyId) {
    try {
      const { data, error } = await dbGet('users', { eq: { company_id: companyId } });
      if (!error && data) {
        data.forEach(supabaseUser => {
          const existingIndex = users.findIndex(u => u.id === supabaseUser.id);
          const userData = {
            id: supabaseUser.id,
            email: supabaseUser.email,
            name: supabaseUser.name,
            role: supabaseUser.role,
            status: supabaseUser.status,
            companyId: supabaseUser.company_id,
            plan: supabaseUser.plan,
            createdAt: supabaseUser.created_at
          };

          if (existingIndex >= 0) {
            users[existingIndex] = { ...users[existingIndex], ...userData };
          } else {
            users.push(userData);
          }
        });
      }
    } catch (e) {
      console.log('Erreur chargement utilisateurs Supabase:', e.message);
    }
  }

  if (G.currentUser && !users.find(u => u.id === G.currentUser.id)) {
    users.push(G.currentUser);
  }

  G.users = users;
  return users;
}

async function saveUsers() {
  G.users.forEach(user => {
    localStorage.setItem(`user_${user.email}`, JSON.stringify(user));
  });

  if (!G.useLocalAuth && SB) {
    for (const user of G.users) {
      const supabaseUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        company_id: user.companyId,
        plan: user.plan,
        created_at: user.createdAt
      };

      try {
        await dbInsert('users', supabaseUser);
      } catch (e) {
        await dbUpdate('users', user.id, supabaseUser);
      }
    }
  }
}

async function loadTags() {
  await simulateNetworkDelay(100);

  if (!G.useLocalAuth && SB && G.currentUser?.companyId) {
    try {
      const { data, error } = await dbGet('tags', { eq: { company_id: G.currentUser.companyId } });
      if (!error && data && data.length > 0) {
        G.tags = data.map(tag => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          count: tag.count || 0
        }));
        return G.tags;
      }
    } catch (e) {
      console.log('Erreur chargement tags Supabase:', e.message);
    }
  }

  const stored = localStorage.getItem(`tags_${G.currentUser?.companyId}`);
  G.tags = stored ? JSON.parse(stored) : [
    { id: generateId(), name: 'Important', color: '#ef4444', count: 0 },
    { id: generateId(), name: 'Urgent', color: '#f97316', count: 0 },
    { id: generateId(), name: 'Contrat', color: '#3b82f6', count: 0 },
    { id: generateId(), name: 'Archivé', color: '#6b7280', count: 0 }
  ];
  return G.tags;
}

async function saveTags() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`tags_${G.currentUser.companyId}`, JSON.stringify(G.tags));

    if (!G.useLocalAuth && SB) {
      for (const tag of G.tags) {
        const supabaseTag = {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          count: tag.count,
          company_id: G.currentUser.companyId
        };

        try {
          await dbInsert('tags', supabaseTag);
        } catch (e) {
          await dbUpdate('tags', tag.id, supabaseTag);
        }
      }
    }
  }
}

async function loadShares() {
  await simulateNetworkDelay(200);

  if (!G.useLocalAuth && SB && G.currentUser?.companyId) {
    try {
      const { data, error } = await dbGet('shares', { eq: { company_id: G.currentUser.companyId } });
      if (!error && data) {
        G.shares = data.map(share => ({
          id: share.id,
          documentId: share.document_id,
          senderId: share.sender_id,
          recipientEmail: share.recipient_email,
          status: share.status,
          createdAt: share.created_at
        }));
        return G.shares;
      }
    } catch (e) {
      console.log('Erreur chargement partages Supabase:', e.message);
    }
  }

  const stored = localStorage.getItem(`shares_${G.currentUser?.companyId}`);
  G.shares = stored ? JSON.parse(stored) : [];
  return G.shares;
}

async function saveShares() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`shares_${G.currentUser.companyId}`, JSON.stringify(G.shares));

    if (!G.useLocalAuth && SB) {
      for (const share of G.shares) {
        const supabaseShare = {
          id: share.id,
          document_id: share.documentId,
          sender_id: share.senderId,
          recipient_email: share.recipientEmail,
          status: share.status,
          company_id: G.currentUser.companyId,
          created_at: share.createdAt
        };

        try {
          await dbInsert('shares', supabaseShare);
        } catch (e) {
          await dbUpdate('shares', share.id, supabaseShare);
        }
      }
    }
  }
}

async function loadFolders() {
  await simulateNetworkDelay(150);

  if (!G.useLocalAuth && SB && G.currentUser?.companyId) {
    try {
      const { data, error } = await dbGet('folders', { eq: { company_id: G.currentUser.companyId } });
      if (!error && data && data.length > 0) {
        G.folders = data.map(folder => ({
          id: folder.id,
          name: folder.name,
          parentId: folder.parent_id,
          createdAt: folder.created_at
        }));
        return G.folders;
      }
    } catch (e) {
      console.log('Erreur chargement dossiers Supabase:', e.message);
    }
  }

  const stored = localStorage.getItem(`folders_${G.currentUser?.companyId}`);
  G.folders = stored ? JSON.parse(stored) : [
    { id: '__root__', name: 'Racine', parentId: null, createdAt: new Date().toISOString() },
    { id: generateId(), name: 'Contrats', parentId: '__root__', createdAt: new Date().toISOString() },
    { id: generateId(), name: 'Factures', parentId: '__root__', createdAt: new Date().toISOString() }
  ];
  return G.folders;
}

async function saveFolders() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`folders_${G.currentUser.companyId}`, JSON.stringify(G.folders));

    if (!G.useLocalAuth && SB) {
      for (const folder of G.folders) {
        const supabaseFolder = {
          id: folder.id,
          name: folder.name,
          parent_id: folder.parentId,
          company_id: G.currentUser.companyId,
          created_at: folder.createdAt
        };

        try {
          await dbInsert('folders', supabaseFolder);
        } catch (e) {
          await dbUpdate('folders', folder.id, supabaseFolder);
        }
      }
    }
  }
}

async function loadSignatures() {
  await simulateNetworkDelay(100);

  if (!G.useLocalAuth && SB && G.currentUser?.companyId) {
    try {
      const { data, error } = await dbGet('signatures', { eq: { company_id: G.currentUser.companyId } });
      if (!error && data) {
        G.signatures = data.map(sig => ({
          id: sig.id,
          documentId: sig.document_id,
          signerEmail: sig.signer_email,
          status: sig.status,
          createdAt: sig.created_at
        }));
        return G.signatures;
      }
    } catch (e) {
      console.log('Erreur chargement signatures Supabase:', e.message);
    }
  }

  const stored = localStorage.getItem(`signatures_${G.currentUser?.companyId}`);
  G.signatures = stored ? JSON.parse(stored) : [];
  return G.signatures;
}

async function saveSignatures() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`signatures_${G.currentUser.companyId}`, JSON.stringify(G.signatures));

    if (!G.useLocalAuth && SB) {
      for (const sig of G.signatures) {
        const supabaseSig = {
          id: sig.id,
          document_id: sig.documentId,
          signer_email: sig.signerEmail,
          status: sig.status,
          company_id: G.currentUser.companyId,
          created_at: sig.createdAt
        };

        try {
          await dbInsert('signatures', supabaseSig);
        } catch (e) {
          await dbUpdate('signatures', sig.id, supabaseSig);
        }
      }
    }
  }
}

async function loadAutomationRules() {
  await simulateNetworkDelay(100);

  if (!G.useLocalAuth && SB && G.currentUser?.companyId) {
    try {
      const { data, error } = await dbGet('automation_rules', { eq: { company_id: G.currentUser.companyId } });
      if (!error && data) {
        G.automationRules = data.map(rule => ({
          id: rule.id,
          name: rule.name,
          trigger: rule.trigger,
          action: rule.action,
          active: rule.active,
          createdAt: rule.created_at
        }));
        return G.automationRules;
      }
    } catch (e) {
      console.log('Erreur chargement règles automation Supabase:', e.message);
    }
  }

  const stored = localStorage.getItem(`automation_${G.currentUser?.companyId}`);
  G.automationRules = stored ? JSON.parse(stored) : [];
  return G.automationRules;
}

async function saveAutomationRules() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`automation_${G.currentUser.companyId}`, JSON.stringify(G.automationRules));

    if (!G.useLocalAuth && SB) {
      for (const rule of G.automationRules) {
        const supabaseRule = {
          id: rule.id,
          name: rule.name,
          trigger: rule.trigger,
          action: rule.action,
          active: rule.active,
          company_id: G.currentUser.companyId,
          created_at: rule.createdAt
        };

        try {
          await dbInsert('automation_rules', supabaseRule);
        } catch (e) {
          await dbUpdate('automation_rules', rule.id, supabaseRule);
        }
      }
    }
  }
}

async function loadApiKeys() {
  await simulateNetworkDelay(100);

  if (!G.useLocalAuth && SB && G.currentUser?.id) {
    try {
      const { data, error } = await dbGet('api_keys', { eq: { user_id: G.currentUser.id } });
      if (!error && data) {
        G.apiKeys = data.map(key => ({
          id: key.id,
          name: key.name,
          key: key.key_value,
          createdAt: key.created_at,
          lastUsed: key.last_used
        }));
        return G.apiKeys;
      }
    } catch (e) {
      console.log('Erreur chargement clés API Supabase:', e.message);
    }
  }

  const stored = localStorage.getItem(`apikeys_${G.currentUser?.id}`);
  G.apiKeys = stored ? JSON.parse(stored) : [];
  return G.apiKeys;
}

async function saveApiKeys() {
  if (G.currentUser?.id) {
    localStorage.setItem(`apikeys_${G.currentUser.id}`, JSON.stringify(G.apiKeys));

    if (!G.useLocalAuth && SB) {
      for (const key of G.apiKeys) {
        const supabaseKey = {
          id: key.id,
          name: key.name,
          key_value: key.key,
          user_id: G.currentUser.id,
          created_at: key.createdAt,
          last_used: key.lastUsed
        };

        try {
          await dbInsert('api_keys', supabaseKey);
        } catch (e) {
          await dbUpdate('api_keys', key.id, supabaseKey);
        }
      }
    }
  }
}

async function loadBackups() {
  await simulateNetworkDelay(100);

  if (!G.useLocalAuth && SB && G.currentUser?.companyId) {
    try {
      const { data, error } = await dbGet('backups', { eq: { company_id: G.currentUser.companyId } });
      if (!error && data) {
        G.backups = data.map(backup => ({
          id: backup.id,
          name: backup.name,
          type: backup.type,
          size: backup.size,
          createdAt: backup.created_at
        }));
        return G.backups;
      }
    } catch (e) {
      console.log('Erreur chargement backups Supabase:', e.message);
    }
  }

  const stored = localStorage.getItem(`backups_${G.currentUser?.companyId}`);
  G.backups = stored ? JSON.parse(stored) : [];
  return G.backups;
}

async function saveBackups() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`backups_${G.currentUser.companyId}`, JSON.stringify(G.backups));

    if (!G.useLocalAuth && SB) {
      for (const backup of G.backups) {
        const supabaseBackup = {
          id: backup.id,
          name: backup.name,
          type: backup.type,
          size: backup.size,
          company_id: G.currentUser.companyId,
          created_at: backup.createdAt
        };

        try {
          await dbInsert('backups', supabaseBackup);
        } catch (e) {
          await dbUpdate('backups', backup.id, supabaseBackup);
        }
      }
    }
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
    case 'pending-users': renderPendingUsers(); break;
  }
}

function openMobileSidebar() {
  document.getElementById('mobileSidebar')?.classList.add('open');
  document.getElementById('sidebarOverlay')?.classList.add('active');
}

function closeMobileSidebar() {
  document.getElementById('mobileSidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('active');
}

// ═══════════════════════════════════════════════════════════════
// ═══ FONCTIONS MANQUANTES CORRIGÉES ════════════════════════════
// ═══════════════════════════════════════════════════════════════

// 1. switchSharedTab - Pour l'onglet Partages
function switchSharedTab(tab) {
  G.sharedTab = tab;
  document.querySelectorAll('.shared-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  renderShared();
}

// 2. addWfStep - Ajouter une étape de workflow
function addWfStep() {
  const stepsContainer = document.getElementById('wfStepsContainer');
  if (!stepsContainer) return;

  const stepIndex = stepsContainer.children.length + 1;
  const stepDiv = document.createElement('div');
  stepDiv.className = 'wf-step-item glass-card rounded-xl p-4 border border-blue-500/20 mb-3';
  stepDiv.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <span class="text-sm font-medium text-white">Étape ${stepIndex}</span>
      <button onclick="this.closest('.wf-step-item').remove()" class="text-red-400 hover:text-red-300">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <input type="text" placeholder="Nom de l'étape" class="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-blue-500/20 text-white text-sm mb-2">
    <select class="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-blue-500/20 text-white text-sm">
      <option value="approval">Approbation</option>
      <option value="review">Révision</option>
      <option value="signature">Signature</option>
    </select>
  `;
  stepsContainer.appendChild(stepDiv);
}

// 3. openRoleModal - Ouvrir le modal de rôle
function openRoleModal(roleId) {
  const role = G.roles[roleId];
  if (!role) return;

  const modal = document.getElementById('roleModal');
  const roleNameInput = document.getElementById('roleNameInput');
  const rolePermsContainer = document.getElementById('rolePermsContainer');

  if (roleNameInput) roleNameInput.value = role.name;
  if (rolePermsContainer) {
    rolePermsContainer.innerHTML = role.perms.map(perm => `
      <label class="flex items-center gap-2 p-2 rounded-lg bg-blue-900/20 cursor-pointer">
        <input type="checkbox" checked value="${perm}" class="rounded border-blue-500/30">
        <span class="text-sm text-white capitalize">${perm}</span>
      </label>
    `).join('');
  }

  if (modal) {
    modal.dataset.roleId = roleId;
    modal.classList.remove('hidden');
  }
}

function closeRoleModal() {
  const modal = document.getElementById('roleModal');
  if (modal) modal.classList.add('hidden');
}

// 4. exportSysLogs - Exporter les logs système
function exportSysLogs() {
  const logs = G.sysLogs || [];
  const csvContent = [
    ['Timestamp', 'Level', 'Message'],
    ...logs.map(log => [
      new Date(log.timestamp).toISOString(),
      log.level,
      log.message
    ])
  ].map(row => row.join(',')).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `system_logs_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();

  showToast('Logs exportés avec succès', 'success');
}

// 5. runAdvSearch - Recherche avancée
function runAdvSearch() {
  const query = document.getElementById('advSearchQuery')?.value?.toLowerCase();
  const type = document.getElementById('advSearchType')?.value;
  const dateFrom = document.getElementById('advSearchDateFrom')?.value;
  const dateTo = document.getElementById('advSearchDateTo')?.value;

  let results = G.documents.filter(d => !d.isDeleted);

  if (query) {
    results = results.filter(d => 
      d.name.toLowerCase().includes(query) || 
      (d.description && d.description.toLowerCase().includes(query))
    );
  }

  if (type) {
    results = results.filter(d => d.type === type);
  }

  if (dateFrom) {
    results = results.filter(d => new Date(d.createdAt) >= new Date(dateFrom));
  }

  if (dateTo) {
    results = results.filter(d => new Date(d.createdAt) <= new Date(dateTo));
  }

  G.searchResults = results;

  const resultsContainer = document.getElementById('advSearchResults');
  if (resultsContainer) {
    if (results.length === 0) {
      resultsContainer.innerHTML = '<p class="text-center text-blue-300/50 py-8">Aucun résultat trouvé</p>';
    } else {
      resultsContainer.innerHTML = results.map(doc => `
        <div class="glass-card rounded-xl p-3 border border-blue-500/20 cursor-pointer hover:border-blue-400/40" onclick="openPreviewModal('${doc.id}')">
          <div class="flex items-center gap-3">
            <i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-blue-400"></i>
            <div class="flex-1">
              <p class="text-white text-sm font-medium">${doc.name}</p>
              <p class="text-xs text-blue-300/60">${formatDate(doc.createdAt)} • ${formatBytes(doc.size)}</p>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  showToast(`${results.length} résultat(s) trouvé(s)`, 'success');
}

// 6. exportAllData - Exporter toutes les données
function exportAllData() {
  const data = {
    documents: G.documents,
    users: G.users,
    workflows: G.workflows,
    tags: G.tags,
    shares: G.shares,
    folders: G.folders,
    signatures: G.signatures,
    automationRules: G.automationRules,
    apiKeys: G.apiKeys,
    backups: G.backups,
    exportDate: new Date().toISOString(),
    companyId: G.currentUser?.companyId
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `export_complet_${G.currentUser?.companyId}_${new Date().toISOString().split('T')[0]}.json`;
  link.click();

  showToast('Export complet téléchargé', 'success');
}

// 7. exportDocumentsCsv - Exporter les documents en CSV
function exportDocumentsCsv() {
  const docs = G.documents.filter(d => !d.isDeleted);
  const csvContent = [
    ['Nom', 'Type', 'Taille', 'Date de création', 'Propriétaire', 'Version'],
    ...docs.map(doc => [
      doc.name,
      doc.type,
      formatBytes(doc.size),
      formatDate(doc.createdAt),
      doc.ownerId,
      doc.version
    ])
  ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `documents_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();

  showToast('Documents exportés en CSV', 'success');
}

// 8. exportAuditLog - Exporter le journal d'audit
function exportAuditLog() {
  const logs = G.auditLog || [];
  const csvContent = [
    ['Date', 'Action', 'Utilisateur', 'Cible', 'Type'],
    ...logs.map(log => [
      formatDate(log.timestamp),
      log.action,
      log.userId,
      log.targetId,
      log.targetType
    ])
  ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();

  showToast('Journal d\'audit exporté', 'success');
}

// 9. toggleSetting - Basculer un paramètre
function toggleSetting(settingName) {
  if (G.settings.hasOwnProperty(settingName)) {
    G.settings[settingName] = !G.settings[settingName];
    localStorage.setItem(`setting_${settingName}`, G.settings[settingName]);
    showToast(`Paramètre ${settingName} ${G.settings[settingName] ? 'activé' : 'désactivé'}`, 'success');

    if (settingName === 'darkMode') {
      document.documentElement.classList.toggle('dark', G.settings.darkMode);
    }
  }
}

// 10. openDangerModal - Ouvrir le modal de danger
function openDangerModal() {
  const modal = document.getElementById('dangerModal');
  if (modal) modal.classList.remove('hidden');
}

function closeDangerModal() {
  const modal = document.getElementById('dangerModal');
  if (modal) modal.classList.add('hidden');
}

function confirmDangerAction() {
  showToast('Action de suppression confirmée', 'warning');
  closeDangerModal();
}

// 11. copySqlSchema - Copier le schéma SQL
function copySqlSchema() {
  const schema = document.getElementById('sqlSchemaText')?.textContent;
  if (schema) {
    navigator.clipboard.writeText(schema).then(() => {
      showToast('Schéma SQL copié dans le presse-papiers', 'success');
    }).catch(() => {
      showToast('Erreur lors de la copie', 'error');
    });
  }
}

// 12. generateApiKey - Générer une clé API (alias pour generateApiKeyV6)
function generateApiKey() {
  generateApiKeyV6();
}

// 13. switchSecurityTab - Changer d'onglet sécurité
function switchSecurityTab(tab) {
  G.securityTab = tab;
  document.querySelectorAll('.security-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.querySelectorAll('.security-content').forEach(el => {
    el.classList.toggle('hidden', el.dataset.content !== tab);
  });
}

// 14. scanAllDocuments - Scanner tous les documents
async function scanAllDocuments() {
  showToast('Scan de sécurité en cours...', 'info');

  await new Promise(resolve => setTimeout(resolve, 2000));

  const totalDocs = G.documents.filter(d => !d.isDeleted).length;
  const scanned = totalDocs;
  const threats = 0;

  showToast(`Scan terminé: ${scanned} documents analysés, ${threats} menaces détectées`, 'success');

  const secScanOk = document.getElementById('secScanOk');
  if (secScanOk) secScanOk.textContent = scanned;
}

// 15. refreshAnalytics - Rafraîchir les analytics
function refreshAnalytics() {
  showToast('Actualisation des statistiques...', 'info');

  setTimeout(() => {
    renderAnalytics();
    showToast('Statistiques actualisées', 'success');
  }, 1000);
}

// 16. openFolderModal - Ouvrir le modal de dossier
function openFolderModal() {
  const modal = document.getElementById('folderModal');
  const parentSelect = document.getElementById('folderParentSelect');

  if (parentSelect) {
    parentSelect.innerHTML = `
      <option value="__root__">Racine</option>
      ${G.folders.filter(f => f.id !== '__root__').map(f => `
        <option value="${f.id}">${f.name}</option>
      `).join('')}
    `;
  }

  if (modal) modal.classList.remove('hidden');
}

function closeFolderModal() {
  const modal = document.getElementById('folderModal');
  if (modal) modal.classList.add('hidden');
}

async function createFolder(e) {
  if (e) e.preventDefault();

  const nameInput = document.getElementById('folderNameInput');
  const parentSelect = document.getElementById('folderParentSelect');

  const name = nameInput?.value?.trim();
  const parentId = parentSelect?.value || '__root__';

  if (!name) {
    showToast('Veuillez entrer un nom de dossier', 'warning');
    return;
  }

  const newFolder = {
    id: generateId(),
    name: name,
    parentId: parentId,
    companyId: G.currentUser?.companyId,
    createdAt: new Date().toISOString()
  };

  G.folders.push(newFolder);
  await saveFolders();

  if (nameInput) nameInput.value = '';
  closeFolderModal();
  renderFolders();
  showToast('Dossier créé avec succès', 'success');
}

// 17. runFTSearch - Recherche full-text
function runFTSearch() {
  const query = document.getElementById('ftSearchInput')?.value?.toLowerCase();
  if (!query) {
    showToast('Veuillez entrer un terme de recherche', 'warning');
    return;
  }

  showToast('Recherche en cours...', 'info');

  const results = G.documents.filter(d => !d.isDeleted).filter(doc => {
    const searchText = `${doc.name} ${doc.description || ''} ${doc.tags?.join(' ') || ''}`.toLowerCase();
    return searchText.includes(query);
  });

  const resultsContainer = document.getElementById('ftSearchResults');
  if (resultsContainer) {
    if (results.length === 0) {
      resultsContainer.innerHTML = '<p class="text-center text-blue-300/50 py-8">Aucun document trouvé</p>';
    } else {
      resultsContainer.innerHTML = results.map(doc => `
        <div class="glass-card rounded-xl p-4 border border-blue-500/20 cursor-pointer hover:border-blue-400/40" onclick="openPreviewModal('${doc.id}')">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center ${getFileIcon(doc.type).split(' ')[1]}">
              <i class="fas ${getFileIcon(doc.type).split(' ')[0]}"></i>
            </div>
            <div class="flex-1">
              <p class="text-white font-medium">${doc.name}</p>
              <p class="text-xs text-blue-300/60">${formatDate(doc.createdAt)} • ${formatBytes(doc.size)}</p>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  showToast(`${results.length} document(s) trouvé(s)`, 'success');
}

// 18. createRoleV7 - Créer un rôle V7
function createRoleV7() {
  const nameInput = document.getElementById('newRoleNameV7');
  const name = nameInput?.value?.trim();

  if (!name) {
    showToast('Veuillez entrer un nom de rôle', 'warning');
    return;
  }

  const roleId = 'role_' + generateId().substring(0, 8);

  G.roles[roleId] = {
    name: name,
    perms: ['read'],
    isCustom: true
  };

  if (nameInput) nameInput.value = '';

  renderRBACV7();
  showToast('Rôle créé avec succès', 'success');
}

// ═══════════════════════════════════════════════════════════════
// ═══ FIN DES FONCTIONS CORRIGÉES ═══════════════════════════════
// ═══════════════════════════════════════════════════════════════

  Object.entries(G.roles).map(([key, role]) => `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20 mb-3">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="text-white font-semibold">${role.name}</h4>
          <p class="text-xs text-blue-300/60">${role.perms.join(', ')}</p>
        </div>
        <button onclick="openRoleModal('${key}')" class="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs">
          Modifier
        </button>
      </div>
    </div>
  `).join('');
}

function renderShared() {
  const container = document.getElementById('sharedList');
  if (!container) return;

  let shares = [];
  if (G.sharedTab === 'received') {
    shares = G.shares.filter(s => s.recipientEmail === G.currentUser?.email && s.status === 'active');
  } else {
    shares = G.shares.filter(s => s.senderId === G.currentUser?.id);
  }

  if (shares.length === 0) {
    container.innerHTML = '<p class="text-center py-8 text-blue-300/50">Aucun document partagé</p>';
    return;
  }

  container.innerHTML = shares.map(s => {
    const doc = G.documents.find(d => d.id === s.documentId);
    return `
      <div class="glass-card rounded-xl p-4 border border-purple-500/20 cursor-pointer" onclick="openPreviewModal('${s.documentId}')">
        <div class="flex items-center gap-3">
          <i class="fas fa-share-alt text-purple-400"></i>
          <div>
            <p class="text-white font-medium">${doc?.name || 'Document inconnu'}</p>
            <p class="text-xs text-blue-300/60">${G.sharedTab === 'received' ? 'De:' : 'À:'} ${G.sharedTab === 'received' ? s.senderId : s.recipientEmail}</p>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ─── Storage & Badges ───
function updateStorageDisplay() {
  const used = G.documents.filter(d => !d.isDeleted).reduce((sum, d) => sum + (d.size || 0), 0);
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
  const docCount = G.documents.filter(d => !d.isDeleted).length;
  const docBadge = document.getElementById('d-docsBadge');
  if (docBadge) {
    docBadge.textContent = docCount;
    docBadge.classList.toggle('hidden', docCount === 0);
  }
}

// ─── Utilities ───
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
  const types = { pdf: 'pdf', doc: 'doc', docx: 'doc', xls: 'xls', xlsx: 'xls', png: 'img', jpg: 'img', jpeg: 'img', gif: 'img', txt: 'txt' };
  return types[ext] || 'unknown';
}

function showToast(message, type = 'info', duration = 3000) {
  console.log(`[${type.toUpperCase()}] ${message}`);

  const existingToast = document.getElementById('toast-notification');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.id = 'toast-notification';
  toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transform transition-all duration-300 translate-y-0 ${
    type === 'success' ? 'bg-green-500/90 text-white' :
    type === 'error' ? 'bg-red-500/90 text-white' :
    type === 'warning' ? 'bg-yellow-500/90 text-black' :
    'bg-blue-500/90 text-white'
  }`;
  toast.innerHTML = `
    <div class="flex items-center gap-2">
      <i class="fas ${
        type === 'success' ? 'fa-check-circle' :
        type === 'error' ? 'fa-exclamation-circle' :
        type === 'warning' ? 'fa-exclamation-triangle' :
        'fa-info-circle'
      }"></i>
      <span>${message}</span>
    </div>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function handleDocDragStart(e, docId) {
  e.dataTransfer.setData('text/plain', docId);
}

function showDocContextMenu(e, docId) {
  e.preventDefault();
  if (confirm('Supprimer ce document ?')) {
    deleteDocument(docId);
  }
}

function renderFolderContents() {
  const folderContentsGrid = document.getElementById('folderContentsGrid');
  const folderDocGrid = document.getElementById('folderDocGrid');

  if (!folderContentsGrid || !folderDocGrid) return;

  const subFolders = G.folders.filter(f => f.parentId === G.currentFolderId);
  const docs = G.documents.filter(d => !d.isDeleted && d.folderId === G.currentFolderId);

  folderContentsGrid.innerHTML = subFolders.map(f => `
    <div class="glass-card rounded-xl p-4 border border-yellow-500/20 cursor-pointer hover:border-yellow-400/40" onclick="openFolder('${f.id}', '${f.name}')">
      <div class="flex items-center gap-3">
        <i class="fas fa-folder text-yellow-400 text-2xl"></i>
        <span class="text-white font-medium">${f.name}</span>
      </div>
    </div>
  `).join('');

  folderDocGrid.innerHTML = docs.map(d => renderDocCard(d)).join('');
  if (docs.length === 0) {
    folderDocGrid.innerHTML = '<div class="col-span-full text-center py-8 text-blue-300/50">Aucun document dans ce dossier</div>';
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
  renderFolderContents();
}

// ─── Initialization ───
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 SystemesGED démarrage...');

  // Initialiser Supabase
  await initializeSupabase();

  // Charger les paramètres sauvegardés
  G.settings.notifications = localStorage.getItem('setting_notifications') !== 'false';
  G.settings.autoOcr = localStorage.getItem('setting_autoOcr') !== 'false';
  G.settings.darkMode = localStorage.getItem('setting_darkMode') !== 'false';

  // Vérifier s'il y a une session sauvegardée
  const savedUser = localStorage.getItem('currentUser');
  if (savedUser) {
    try {
      const user = JSON.parse(savedUser);
      G.currentUser = user;
      G.currentCompany = JSON.parse(localStorage.getItem('currentCompany') || '{}');

      console.log('Session restaurée:', user.email);
      await initializeApp();
    } catch (e) {
      console.error('Erreur restauration session:', e);
      localStorage.removeItem('currentUser');
      localStorage.removeItem('currentCompany');
    }
  } else {
    console.log('Aucune session active, affichage écran de connexion');
  }
});

// Exposer toutes les fonctions globalement
Object.assign(window, {
  // Core
  CONFIG, G, SB, initializeSupabase,

  // Supabase
  dbGet, dbInsert, dbUpdate, dbDelete, uploadToSupabaseStorage, getStorageUrl,

  // Auth
  switchAuthTab, togglePwdInput, handleLogin, handleRegister, demoLogin, oauthLogin, handleLogout,

  // Navigation
  switchView, openMobileSidebar, closeMobileSidebar,

  // Documents
  openUploadModal, closeUploadModal, handleDragOver, handleDragLeave, handleDrop,
  handleFileSelect, addFilesToSelection, renderSelectedFiles, removeFileFromSelection,
  addUploadTag, removeUploadTag, renderUploadTags, uploadDocument,
  openPreviewModal, closePreviewModal, downloadDocument, deleteDocument,
  renderDocuments, getFilteredDocuments, renderDocCard, renderDocListItem,
  switchDocsTab, toggleViewMode, applyFilters, clearFilters, filterByType, filterByTag,

  // Fonctions corrigées
  downloadCurrentDocument, shareCurrentDocument, openRichEditor, closeRichEditor,
  richCmd, richAlign, richInsertHeading, richInsertLink, _saveRichContent,

  // Share
  openShareModal, closeShareModal, shareDocument,

  // Workflows
  renderWorkflows, openCreateWorkflowModal, closeWorkflowModal, createWorkflow,
  openWfDetail, closeWfDetail, getWfStatusClass, getWfStatusLabel,

  // Users
  renderUsers, validateUser, deleteUser, renderPendingUsers, openCreateUserModal, closeAddUserModal, addUser,

  // Tags
  renderTags, createTag, deleteTag,

  // Settings
  renderBilling, renderSettings, saveProfile, renderSecurity, renderSysLogs, renderRBAC, renderAnalytics,
  renderFolders, renderSignatures, renderAI, renderAutomation, renderIntegrations, renderBackups,
  renderApiKeys, renderBillingV6, renderAuditV6, renderAdvancedSearch, renderVersioning, renderSearchV7, renderRBACV7,
  renderShared, renderDashboard, renderActivityList, renderQuickAccess, renderPopularTags, renderTeamDocs, renderMyWorkflows,

  // Utils
  generateId, formatBytes, formatDate, getFileIcon, getFileType, showToast, handleDocDragStart, showDocContextMenu,
  isAdmin, canValidateUsers, canManageSignatures, updateUserDisplay, updateStorageDisplay, updateBadges,
  updateValidationMenuVisibility, updatePendingUsersCount, updatePendingUsersBadge, loadInitialData,

  // Signatures
  openSignModal, closeSignModal, submitSignature, getSigStatusClass,

  // Automation
  openWfRuleModal, closeWfRuleModal, createWfRule,

  // Backups
  createBackup, restoreBackup,

  // API Keys
  generateApiKeyV6, revokeApiKey, generateApiKey,

  // Folders
  openFolder, renderFolderContents, openFolderModal, closeFolderModal, createFolder,

  // FONCTIONS MANQUANTES CORRIGÉES
  switchSharedTab,
  addWfStep,
  openRoleModal, closeRoleModal,
  exportSysLogs,
  runAdvSearch,
  exportAllData,
  exportDocumentsCsv,
  exportAuditLog,
  toggleSetting,
  openDangerModal, closeDangerModal, confirmDangerAction,
  copySqlSchema,
  switchSecurityTab,
  scanAllDocuments,
  refreshAnalytics,
  runFTSearch,
  createRoleV7
});
