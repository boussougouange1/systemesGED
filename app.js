// SystemesGED v5.5 - Application principale (CORRIGÉ ET CONNECTÉ À SUPABASE)
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
  useLocalAuth: true
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
      options: {
        data: userData
      }
    });
    return { data, error };
  } catch (e) {
    return { error: { message: e.message } };
  }
}

async function supabaseSignIn(email, password) {
  if (!SB || G.useLocalAuth) return { error: { message: 'Supabase non disponible' } };
  
  try {
    const { data, error } = await SB.auth.signInWithPassword({
      email,
      password
    });
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
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });
    return { data, error };
  } catch (e) {
    return { error: { message: e.message } };
  }
}

async function getStorageUrl(filePath) {
  if (!SB || G.useLocalAuth) return null;
  
  try {
    const { data } = SB.storage
      .from(CONFIG.storageBucket)
      .getPublicUrl(filePath);
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
        
        // Créer la session admin
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
        
        // Sauvegarder la session
        G.currentUser = adminUser;
        G.currentCompany = {
          id: systemAdmin.companyId,
          name: systemAdmin.companyName,
          plan: 'enterprise'
        };
        
        // Sauvegarder dans localStorage
        localStorage.setItem('currentUser', JSON.stringify(adminUser));
        localStorage.setItem('currentCompany', JSON.stringify(G.currentCompany));
        
        console.log('Connexion admin réussie, initialisation...');
        
        // Initialiser l'application
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
    
    // 2. VÉRIFICATION UTILISATEURS LOCAUX (localStorage)
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
    
    // 3. TENTATIVE SUPABASE (si disponible)
    if (!G.useLocalAuth && SB) {
      try {
        const { data, error } = await supabaseSignIn(email, password);
        
        if (error) throw error;
        
        if (data.user) {
          // Récupérer les données de l'utilisateur depuis Supabase
          const { data: userData, error: userError } = await dbGet('users', { eq: { id: data.user.id } });
          
          if (userError || !userData || userData.length === 0) {
            // Créer l'utilisateur dans la base si nécessaire
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
          
          // Récupérer l'entreprise
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
    
    // AUCUNE CORRESPONDANCE
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
  
  // Vérifier si l'email existe déjà
  if (localStorage.getItem(`user_${email}`)) {
    showToast('Cet email est déjà utilisé', 'error');
    return;
  }
  
  // Vérifier si c'est un admin système
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
    
    // Sauvegarder localement
    localStorage.setItem(`user_${email}`, JSON.stringify(newUser));
    localStorage.setItem(`company_${companyId}`, JSON.stringify(companyData));
    
    // Si Supabase est disponible, créer aussi dans Supabase
    if (!G.useLocalAuth && SB) {
      try {
        // Créer l'utilisateur dans Supabase Auth
        const { data: authData, error: authError } = await supabaseSignUp(email, password, {
          name: `${firstName} ${lastName}`,
          company_id: companyId,
          role: 'admin',
          plan: 'free'
        });
        
        if (!authError && authData.user) {
          // Créer l'entreprise dans Supabase
          await dbInsert('companies', {
            id: companyId,
            name: company,
            plan: 'free',
            owner_id: authData.user.id,
            created_at: new Date().toISOString()
          });
          
          // Créer l'utilisateur dans Supabase
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
    
    // Ajouter à la liste des utilisateurs en attente
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
    
    // Basculer vers l'onglet de connexion
    switchAuthTab('login');
    
    // Pré-remplir l'email
    const loginEmail = document.getElementById('loginEmail');
    if (loginEmail) loginEmail.value = email;
    
  } catch (err) {
    console.error('Erreur inscription:', err);
    showToast('Erreur lors de la création du compte: ' + err.message, 'error');
  }
}

// DÉCONNEXION
async function handleLogout() {
  // Déconnexion Supabase si connecté
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
  
  // Créer un utilisateur démo s'il n'existe pas
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

// CONNEXION OAUTH (CORRIGÉE)
function oauthLogin(provider) {
  showToast(`Connexion ${provider}...`, 'info');
  
  // Simulation de connexion OAuth pour le mode local
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
  
  // Compter les utilisateurs en attente pour cette entreprise
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
  
  // Essayer de charger depuis Supabase d'abord
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
  
  // Fallback localStorage
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
    
    // Sauvegarder dans Supabase si disponible
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
          // Si existe déjà, mettre à jour
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
  
  // Charger tous les utilisateurs de l'entreprise depuis localStorage
  const users = [];
  const companyId = G.currentUser?.companyId;
  
  if (companyId) {
    // Parcourir localStorage pour trouver les utilisateurs de cette entreprise
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
  
  // Essayer de charger depuis Supabase
  if (!G.useLocalAuth && SB && companyId) {
    try {
      const { data, error } = await dbGet('users', { eq: { company_id: companyId } });
      if (!error && data) {
        // Fusionner avec les données locales
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
  
  // Ajouter l'utilisateur courant s'il n'est pas dans la liste
  if (G.currentUser && !users.find(u => u.id === G.currentUser.id)) {
    users.push(G.currentUser);
  }
  
  G.users = users;
  return users;
}

async function saveUsers() {
  // Les utilisateurs sont sauvegardés individuellement dans localStorage
  G.users.forEach(user => {
    localStorage.setItem(`user_${user.email}`, JSON.stringify(user));
  });
  
  // Sauvegarder dans Supabase
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

// ─── Dashboard ───
function renderDashboard() {
  const totalDocs = G.documents.filter(d => !d.isDeleted).length;
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
  
  const storageUsed = G.documents.filter(d => !d.isDeleted).reduce((sum, d) => sum + (d.size || 0), 0);
  const storageLimit = CONFIG.plans[G.currentUser?.plan || 'free'].storage;
  const storagePercent = Math.min(100, Math.round((storageUsed / storageLimit) * 100));
  
  const storagePercentEl = document.getElementById('storagePercent');
  const storageBarEl = document.getElementById('storageBar');
  const storageTextEl = document.getElementById('storageText');
  
  if (storagePercentEl) storagePercentEl.textContent = `${storagePercent}%`;
  if (storageBarEl) storageBarEl.style.width = `${storagePercent}%`;
  if (storageTextEl) storageTextEl.textContent = `${formatBytes(storageUsed)} / ${formatBytes(storageLimit)}`;
  
  renderActivityList();
  renderQuickAccess();
  renderPopularTags();
  renderTeamDocs();
  renderMyWorkflows();
  
  if (canValidateUsers() && G.pendingUsersCount > 0) {
    showToast(`${G.pendingUsersCount} utilisateur(s) en attente de validation`, 'warning');
  }
}

function renderActivityList() {
  const list = document.getElementById('activityList');
  if (!list) return;
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
  const icons = { login: 'fa-sign-in-alt', logout: 'fa-sign-out-alt', upload: 'fa-upload', download: 'fa-download', share: 'fa-share', delete: 'fa-trash', restore: 'fa-undo', view_change: 'fa-eye', validate: 'fa-check', reject: 'fa-times' };
  return icons[action] || 'fa-circle';
}

function renderQuickAccess() {
  const pdfCount = G.documents.filter(d => !d.isDeleted && d.type === 'pdf').length;
  const docCount = G.documents.filter(d => !d.isDeleted && d.type === 'doc').length;
  const quickPdfCountEl = document.getElementById('quickPdfCount');
  const quickDocCountEl = document.getElementById('quickDocCount');
  if (quickPdfCountEl) quickPdfCountEl.textContent = `${pdfCount} fichier(s)`;
  if (quickDocCountEl) quickDocCountEl.textContent = `${docCount} fichier(s)`;
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
  const badge = document.getElementById('myWorkflowsBadge');
  if (!list) return;
  
  const myWfs = G.workflows.filter(w => w.assigneeId === G.currentUser?.id || w.createdBy === G.currentUser?.id).slice(0, 5);
  
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
  
  if (G.docsTab === 'company') docs = docs.filter(d => d.scope === 'company');
  else if (G.docsTab === 'personal') docs = docs.filter(d => d.scope === 'personal');
  else if (G.docsTab === 'mine') docs = docs.filter(d => d.ownerId === G.currentUser?.id);
  else if (G.docsTab === 'shared') {
    const sharedDocIds = G.shares.filter(s => s.recipientEmail === G.currentUser?.email && s.status === 'active').map(s => s.documentId);
    docs = docs.filter(d => sharedDocIds.includes(d.id));
  }
  
  const typeFilter = document.getElementById('filterType')?.value;
  if (typeFilter) docs = docs.filter(d => d.type === typeFilter);
  
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
  if (filterType) filterType.value = '';
  renderDocuments();
}

function filterByType(type) {
  const filterType = document.getElementById('filterType');
  if (filterType) filterType.value = type;
  switchView('documents');
  renderDocuments();
}

function filterByTag(tagName) {
  showToast(`Filtre par tag: ${tagName}`, 'info');
}

// ─── Upload ───
let _uploadScope = 'company';

function openUploadModal() {
  _uploadScope = 'company';
  const uploadModal = document.getElementById('uploadModal');
  if (uploadModal) uploadModal.classList.remove('hidden');
  
  G.selectedFiles = [];
  G.uploadTags = [];
  renderUploadTags();
}

function closeUploadModal() {
  const uploadModal = document.getElementById('uploadModal');
  if (uploadModal) uploadModal.classList.add('hidden');
  G.selectedFiles = [];
}

function handleDragOver(e, zoneId) {
  e.preventDefault();
  document.getElementById(zoneId)?.classList.add('drag-over');
}

function handleDragLeave(e, zoneId) {
  e.preventDefault();
  document.getElementById(zoneId)?.classList.remove('drag-over');
}

function handleDrop(e, zoneId) {
  e.preventDefault();
  document.getElementById(zoneId)?.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  addFilesToSelection(files);
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
  if (!list) return;
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
    input.value = '';
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
  
  for (let i = 0; i < G.selectedFiles.length; i++) {
    const file = G.selectedFiles[i];
    const docId = generateId();
    
    // Upload vers Supabase Storage si disponible
    let storagePath = null;
    let publicUrl = null;
    
    if (!G.useLocalAuth && SB) {
      try {
        const filePath = `${G.currentUser.companyId}/${docId}/${file.name}`;
        const { data: uploadData, error: uploadError } = await uploadToSupabaseStorage(filePath, file);
        
        if (!uploadError) {
          storagePath = filePath;
          publicUrl = await getStorageUrl(filePath);
        }
      } catch (e) {
        console.log('Erreur upload storage:', e.message);
      }
    }
    
    const doc = {
      id: docId,
      name: file.name,
      type: getFileType(file.name),
      size: file.size,
      description: '',
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
      storagePath: storagePath,
      publicUrl: publicUrl
    };
    
    G.originalFiles.set(docId, file);
    G.documents.unshift(doc);
  }
  
  await saveDocuments();
  updateStorageDisplay();
  updateBadges();
  
  showToast(`${G.selectedFiles.length} document(s) importé(s)`, 'success');
  closeUploadModal();
  renderDocuments();
}

// ─── Preview & Download ───
function openPreviewModal(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  G.currentDocId = docId;
  doc.views = (doc.views || 0) + 1;
  
  const previewModal = document.getElementById('previewModal');
  if (previewModal) previewModal.classList.remove('hidden');
  
  // Mettre à jour les informations du modal
  const previewTitle = document.getElementById('previewTitle');
  const previewMeta = document.getElementById('previewMeta');
  
  if (previewTitle) previewTitle.textContent = doc.name;
  if (previewMeta) previewMeta.textContent = `${formatBytes(doc.size)} • ${formatDate(doc.createdAt)} • v${doc.version}`;
}

function closePreviewModal() {
  const previewModal = document.getElementById('previewModal');
  if (previewModal) previewModal.classList.add('hidden');
  G.currentDocId = null;
}

// FONCTION CORRIGÉE : Télécharger le document courant
function downloadCurrentDocument() {
  if (G.currentDocId) {
    downloadDocument(G.currentDocId);
  }
}

// FONCTION CORRIGÉE : Partager le document courant
function shareCurrentDocument() {
  closePreviewModal();
  if (G.currentDocId) {
    openShareModal(G.currentDocId);
  }
}

// FONCTION CORRIGÉE : Ouvrir l'éditeur riche
function openRichEditor(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  G.richEditor.docId = docId;
  const richEditorModal = document.getElementById('richEditorModal');
  const richEditorTitle = document.getElementById('richEditorTitle');
  const richEditorContent = document.getElementById('richEditorContent');
  
  if (richEditorTitle) richEditorTitle.textContent = doc.name;
  if (richEditorContent) richEditorContent.innerHTML = doc.content || '<p>Commencez à écrire...</p>';
  if (richEditorModal) richEditorModal.classList.remove('hidden');
}

// FONCTION CORRIGÉE : Fermer l'éditeur riche
function closeRichEditor() {
  const richEditorModal = document.getElementById('richEditorModal');
  if (richEditorModal) richEditorModal.classList.add('hidden');
  G.richEditor.docId = null;
}

// FONCTION CORRIGÉE : Commandes de l'éditeur riche
function richCmd(command, value = null) {
  document.execCommand(command, false, value);
  document.getElementById('richEditorContent')?.focus();
}

function richAlign(align) {
  const command = 'justify' + align.charAt(0).toUpperCase() + align.slice(1);
  document.execCommand(command, false, null);
}

function richInsertHeading(level) {
  document.execCommand('formatBlock', false, `H${level}`);
}

function richInsertLink() {
  const url = prompt('URL du lien:');
  if (url) document.execCommand('createLink', false, url);
}

function _saveRichContent() {
  const doc = G.documents.find(d => d.id === G.richEditor.docId);
  const richEditorContent = document.getElementById('richEditorContent');
  
  if (doc && richEditorContent) {
    doc.content = richEditorContent.innerHTML;
    doc.updatedAt = new Date().toISOString();
    saveDocuments();
    showToast('Document enregistré', 'success');
  }
}

function downloadDocument(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  doc.downloads = (doc.downloads || 0) + 1;
  saveDocuments();
  
  const originalFile = G.originalFiles.get(docId);
  if (originalFile) {
    const url = URL.createObjectURL(originalFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Téléchargement: ${doc.name}`, 'success');
  } else if (doc.publicUrl) {
    // Télécharger depuis Supabase Storage
    const a = document.createElement('a');
    a.href = doc.publicUrl;
    a.download = doc.name;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Téléchargement: ${doc.name}`, 'success');
  }
}

function deleteDocument(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  if (doc.ownerId !== G.currentUser?.id && !isAdmin()) {
    showToast('Permission refusée', 'error');
    return;
  }
  
  doc.isDeleted = true;
  doc.deletedAt = new Date().toISOString();
  saveDocuments();
  
  showToast('Document déplacé vers la corbeille', 'success');
  renderDocuments();
  updateBadges();
}

// ─── Share ───
function openShareModal(docId) {
  G.currentDocId = docId;
  const shareModal = document.getElementById('shareModal');
  if (shareModal) shareModal.classList.remove('hidden');
}

function closeShareModal() {
  const shareModal = document.getElementById('shareModal');
  if (shareModal) shareModal.classList.add('hidden');
  G.currentDocId = null;
}

async function shareDocument() {
  const email = document.getElementById('shareEmail')?.value;
  if (!email) {
    showToast('Veuillez entrer un email', 'warning');
    return;
  }
  
  const share = {
    id: generateId(),
    documentId: G.currentDocId,
    senderId: G.currentUser?.id,
    recipientEmail: email,
    status: 'active',
    createdAt: new Date().toISOString()
  };
  
  G.shares.push(share);
  await saveShares();
  
  showToast('Document partagé avec succès', 'success');
  closeShareModal();
  updateBadges();
}

// ─── Workflows ───
function renderWorkflows() {
  const container = document.getElementById('wfKanban');
  if (!container) return;
  
  container.innerHTML = `
    <div class="glass-card rounded-xl p-4 border border-orange-500/20">
      <h4 class="text-sm font-semibold text-orange-400 mb-3">En attente</h4>
      <p class="text-xs text-blue-300/60">${G.workflows.filter(w => w.status === 'pending').length} workflow(s)</p>
    </div>
    <div class="glass-card rounded-xl p-4 border border-blue-500/20">
      <h4 class="text-sm font-semibold text-blue-400 mb-3">En révision</h4>
      <p class="text-xs text-blue-300/60">${G.workflows.filter(w => w.status === 'in_review').length} workflow(s)</p>
    </div>
    <div class="glass-card rounded-xl p-4 border border-green-500/20">
      <h4 class="text-sm font-semibold text-green-400 mb-3">Approuvés</h4>
      <p class="text-xs text-blue-300/60">${G.workflows.filter(w => w.status === 'approved').length} workflow(s)</p>
    </div>
  `;
}

function openCreateWorkflowModal() {
  const workflowModal = document.getElementById('workflowModal');
  if (workflowModal) workflowModal.classList.remove('hidden');
}

function closeWorkflowModal() {
  const workflowModal = document.getElementById('workflowModal');
  if (workflowModal) workflowModal.classList.add('hidden');
}

async function createWorkflow(e) {
  e.preventDefault();
  
  const wfTitle = document.getElementById('wfTitle')?.value;
  if (!wfTitle) {
    showToast('Veuillez entrer un titre', 'warning');
    return;
  }
  
  const wf = {
    id: generateId(),
    title: wfTitle,
    description: document.getElementById('wfDesc')?.value || '',
    priority: document.getElementById('wfPriority')?.value || 'medium',
    status: 'pending',
    assigneeId: document.getElementById('wfAssignee')?.value,
    createdBy: G.currentUser?.id,
    companyId: G.currentUser?.companyId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  G.workflows.unshift(wf);
  await saveWorkflows();
  
  showToast('Workflow créé avec succès', 'success');
  closeWorkflowModal();
  renderWorkflows();
}

function openWfDetail(wfId) {
  G.currentWfId = wfId;
  const wfDetailModal = document.getElementById('wfDetailModal');
  if (wfDetailModal) wfDetailModal.classList.remove('hidden');
}

function closeWfDetail() {
  const wfDetailModal = document.getElementById('wfDetailModal');
  if (wfDetailModal) wfDetailModal.classList.add('hidden');
  G.currentWfId = null;
}

function getWfStatusClass(status) {
  const classes = { pending: 'bg-orange-500/20 text-orange-300', in_review: 'bg-blue-500/20 text-blue-300', approved: 'bg-green-500/20 text-green-300', rejected: 'bg-red-500/20 text-red-300' };
  return classes[status] || 'bg-gray-500/20 text-gray-300';
}

function getWfStatusLabel(status) {
  const labels = { pending: 'En attente', in_review: 'En révision', approved: 'Approuvé', rejected: 'Rejeté' };
  return labels[status] || status;
}

// ─── Users ───
function renderUsers() {
  const tbody = document.getElementById('usersList');
  if (!tbody) return;
  
  tbody.innerHTML = G.users.map(u => `
    <tr class="hover:bg-blue-500/5">
      <td class="p-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold">${u.name.charAt(0)}</div>
          <div>
            <p class="text-white text-sm font-medium">${u.name}</p>
            <p class="text-xs text-blue-300/60">${u.email}</p>
          </div>
        </div>
      </td>
      <td class="p-4"><span class="px-2 py-1 rounded-full text-xs ${getRoleBadgeClass(u.role)}">${G.roles[u.role]?.name || u.role}</span></td>
      <td class="p-4 hidden sm:table-cell">
        <span class="px-2 py-1 rounded-full text-xs ${u.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}">
          ${u.status === 'pending_validation' ? 'En attente' : u.status}
        </span>
      </td>
      <td class="p-4">
        <div class="flex gap-2">
          ${u.status === 'pending_validation' && canValidateUsers() ? 
            `<button onclick="validateUser('${u.id}')" class="px-3 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs">Valider</button>` : ''}
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
  const u = G.users.find(user => user.id === userId);
  if (!u) return;
  
  u.status = 'active';
  u.validatedAt = new Date().toISOString();
  u.validatedBy = G.currentUser?.id;
  
  // Mettre à jour dans Supabase si disponible
  if (!G.useLocalAuth && SB) {
    await dbUpdate('users', userId, { status: 'active', validated_at: u.validatedAt, validated_by: u.validatedBy });
  }
  
  localStorage.setItem(`user_${u.email}`, JSON.stringify(u));
  await saveUsers();
  
  showToast(`Utilisateur ${u.name} validé`, 'success');
  renderUsers();
  updatePendingUsersCount();
}

async function deleteUser(userId) {
  if (!confirm('Supprimer cet utilisateur ?')) return;
  
  const u = G.users.find(user => user.id === userId);
  if (u) {
    // Supprimer de Supabase si disponible
    if (!G.useLocalAuth && SB) {
      await dbDelete('users', userId);
    }
    
    localStorage.removeItem(`user_${u.email}`);
    G.users = G.users.filter(user => user.id !== userId);
    await saveUsers();
    renderUsers();
    showToast('Utilisateur supprimé', 'success');
  }
}

function openCreateUserModal() {
  if (!canValidateUsers()) {
    showToast('Permission refusée', 'error');
    return;
  }
  const addUserModal = document.getElementById('addUserModal');
  if (addUserModal) addUserModal.classList.remove('hidden');
}

function closeAddUserModal() {
  const addUserModal = document.getElementById('addUserModal');
  if (addUserModal) addUserModal.classList.add('hidden');
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
  
  const newUser = {
    id: generateId(),
    name: `${firstName} ${lastName}`,
    email: email,
    role: role,
    status: 'pending_validation',
    companyId: G.currentUser?.companyId,
    createdAt: new Date().toISOString()
  };
  
  // Ajouter à Supabase si disponible
  if (!G.useLocalAuth && SB) {
    await dbInsert('users', {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      status: newUser.status,
      company_id: newUser.companyId,
      created_at: newUser.createdAt
    });
  }
  
  G.users.push(newUser);
  localStorage.setItem(`user_${email}`, JSON.stringify(newUser));
  await saveUsers();
  
  showToast('Utilisateur créé - en attente de validation', 'success');
  closeAddUserModal();
  renderUsers();
  updatePendingUsersCount();
}

function renderPendingUsers() {
  const container = document.getElementById('pendingUsersList');
  if (!container) return;
  
  const pendingUsers = G.users.filter(u => u.status === 'pending_validation');
  
  if (pendingUsers.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-blue-300/50">
        <i class="fas fa-user-check text-4xl mb-3 block opacity-20"></i>
        <p>Aucun utilisateur en attente</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = pendingUsers.map(u => `
    <div class="glass-card rounded-xl p-4 border border-yellow-500/20">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 text-lg font-bold">
            ${u.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p class="text-white font-medium text-lg">${u.name}</p>
            <p class="text-sm text-blue-300/60">${u.email}</p>
          </div>
        </div>
        <button onclick="validateUser('${u.id}')" class="px-4 py-2 rounded-lg bg-green-500/20 text-green-400 text-sm hover:bg-green-500/30">
          <i class="fas fa-check mr-2"></i>Valider
        </button>
      </div>
    </div>
  `).join('');
}

// ─── Autres fonctions essentielles ───
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
    color: '#3b82f6',
    count: 0,
    companyId: G.currentUser?.companyId
  };
  
  // Ajouter à Supabase si disponible
  if (!G.useLocalAuth && SB) {
    await dbInsert('tags', {
      id: newTag.id,
      name: newTag.name,
      color: newTag.color,
      count: 0,
      company_id: G.currentUser?.companyId
    });
  }
  
  G.tags.push(newTag);
  await saveTags();
  input.value = '';
  renderTags();
}

async function deleteTag(tagId) {
  G.tags = G.tags.filter(t => t.id !== tagId);
  await saveTags();
  
  // Supprimer de Supabase si disponible
  if (!G.useLocalAuth && SB) {
    await dbDelete('tags', tagId);
  }
  
  renderTags();
}

function renderBilling() {
  const plan = CONFIG.plans[G.currentUser?.plan || 'free'];
  const currentPlanName = document.getElementById('currentPlanName');
  if (currentPlanName) currentPlanName.textContent = plan.name;
}

function renderSettings() {
  const profileName = document.getElementById('profileName');
  if (profileName) profileName.value = G.currentUser?.name || '';
}

async function saveProfile() {
  const name = document.getElementById('profileName')?.value;
  if (name && G.currentUser) {
    G.currentUser.name = name;
    
    // Mettre à jour dans Supabase si disponible
    if (!G.useLocalAuth && SB) {
      await dbUpdate('users', G.currentUser.id, { name: name });
    }
    
    localStorage.setItem(`user_${G.currentUser.email}`, JSON.stringify(G.currentUser));
    localStorage.setItem('currentUser', JSON.stringify(G.currentUser));
    updateUserDisplay();
    showToast('Profil mis à jour', 'success');
  }
}

function renderSecurity() {
  const secScanOk = document.getElementById('secScanOk');
  if (secScanOk) secScanOk.textContent = G.documents.filter(d => !d.isDeleted).length;
}

function renderSysLogs() {
  const container = document.getElementById('sysLogConsole');
  if (!container) return;
  container.innerHTML = G.sysLogs.map(l => `
    <div class="py-1 px-2 text-xs">
      <span class="text-blue-300/40">[${new Date(l.timestamp).toLocaleTimeString('fr-FR')}]</span>
      <span class="${getLogLevelColor(l.level)}">${l.level}</span>
      <span class="text-blue-200/80">${l.message}</span>
    </div>
  `).join('');
}

function getLogLevelColor(level) {
  const colors = { info: 'text-blue-400', warn: 'text-yellow-400', error: 'text-red-400', security: 'text-orange-400' };
  return colors[level] || 'text-gray-400';
}

function renderRBAC() {
  const container = document.getElementById('rbacCards');
  if (!container) return;
  container.innerHTML = Object.entries(G.roles).map(([key, role]) => `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20">
      <h4 class="text-white font-semibold">${role.name}</h4>
      <p class="text-xs text-blue-300/60 mt-2">${G.users.filter(u => u.role === key).length} utilisateur(s)</p>
    </div>
  `).join('');
}

function renderAnalytics() {
  const container = document.getElementById('analyticsKpiCards');
  if (!container) return;
  container.innerHTML = `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20">
      <p class="text-2xl font-bold text-white">${G.documents.reduce((sum, d) => sum + (d.views || 0), 0)}</p>
      <p class="text-xs text-blue-300/60">Vues totales</p>
    </div>
    <div class="glass-card rounded-xl p-4 border border-green-500/20">
      <p class="text-2xl font-bold text-white">${G.documents.reduce((sum, d) => sum + (d.downloads || 0), 0)}</p>
      <p class="text-xs text-blue-300/60">Téléchargements</p>
    </div>
  `;
}

function renderFolders() { 
  renderFolderContents(); 
}

function renderSignatures() { 
  const container = document.getElementById('signaturesList');
  if (!container) return;
  
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
  const signatureModal = document.getElementById('signatureModal');
  if (signatureModal) signatureModal.classList.remove('hidden');
}

function closeSignModal() {
  const signatureModal = document.getElementById('signatureModal');
  if (signatureModal) signatureModal.classList.add('hidden');
}

function submitSignature() {
  showToast('Signature enregistrée', 'success');
  closeSignModal();
}

function renderAI() { 
  const container = document.getElementById('aiDocsList');
  if (!container) return;
  
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
    </div>
  `).join('');
}

function analyzeDocument(docId) {
  showToast('Analyse IA en cours...', 'info');
  setTimeout(() => {
    showToast('Analyse terminée', 'success');
  }, 2000);
}

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
        <div>
          <p class="text-white font-medium">${r.name}</p>
          <p class="text-xs text-blue-300/60">${r.trigger} → ${r.action}</p>
        </div>
        <span class="px-2 py-1 rounded-full text-xs ${r.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}">${r.active ? 'Actif' : 'Inactif'}</span>
      </div>
    </div>
  `).join('');
}

function openWfRuleModal() {
  const wfRuleModal = document.getElementById('wfRuleModal');
  if (wfRuleModal) wfRuleModal.classList.remove('hidden');
}

function closeWfRuleModal() {
  const wfRuleModal = document.getElementById('wfRuleModal');
  if (wfRuleModal) wfRuleModal.classList.add('hidden');
}

async function createWfRule(e) {
  e.preventDefault();
  
  const rule = {
    id: generateId(),
    name: document.getElementById('wfRuleName')?.value || 'Nouvelle règle',
    trigger: document.getElementById('wfRuleTrigger')?.value || '',
    action: document.getElementById('wfRuleAction')?.value || '',
    active: true,
    createdAt: new Date().toISOString()
  };
  
  // Ajouter à Supabase si disponible
  if (!G.useLocalAuth && SB) {
    await dbInsert('automation_rules', {
      id: rule.id,
      name: rule.name,
      trigger: rule.trigger,
      action: rule.action,
      active: rule.active,
      company_id: G.currentUser?.companyId,
      created_at: rule.createdAt
    });
  }
  
  G.automationRules.push(rule);
  await saveAutomationRules();
  closeWfRuleModal();
  renderAutomation();
  showToast('Règle créée', 'success');
}

function renderIntegrations() { 
  const container = document.getElementById('integrationsGrid');
  if (!container) return;
  
  const integrations = [
    { name: 'Slack', icon: 'fab fa-slack', color: 'purple' },
    { name: 'Google Drive', icon: 'fab fa-google-drive', color: 'green' },
    { name: 'Dropbox', icon: 'fab fa-dropbox', color: 'blue' },
    { name: 'Microsoft 365', icon: 'fab fa-microsoft', color: 'blue' }
  ];
  
  container.innerHTML = integrations.map(i => `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20 hover:border-${i.color}-400/40 cursor-pointer transition-all">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-lg bg-${i.color}-500/20 flex items-center justify-center text-${i.color}-400">
          <i class="${i.icon}"></i>
        </div>
        <div>
          <p class="text-white font-medium">${i.name}</p>
        </div>
      </div>
      <button class="w-full py-2 rounded-lg bg-blue-500/10 text-blue-400 text-xs hover:bg-blue-500/20">Connecter</button>
    </div>
  `).join('');
}

function renderBackups() { 
  const container = document.getElementById('backupsList');
  if (!container) return;
  
  if (G.backups.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-database text-4xl mb-3 block opacity-20"></i><p>Aucune sauvegarde</p></div>';
    return;
  }
  
  container.innerHTML = G.backups.map(b => `
    <div class="glass-card rounded-xl p-4 border border-teal-500/20 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <i class="fas fa-archive text-teal-400 text-xl"></i>
        <div>
          <p class="text-white font-medium">${b.name}</p>
          <p class="text-xs text-blue-300/60">${b.type} • ${formatBytes(b.size)}</p>
        </div>
      </div>
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
    createdAt: new Date().toISOString()
  };
  
  // Ajouter à Supabase si disponible
  if (!G.useLocalAuth && SB) {
    await dbInsert('backups', {
      id: backup.id,
      name: backup.name,
      type: backup.type,
      size: backup.size,
      company_id: G.currentUser?.companyId,
      created_at: backup.createdAt
    });
  }
  
  G.backups.unshift(backup);
  await saveBackups();
  renderBackups();
  showToast('Sauvegarde créée', 'success');
}

function restoreBackup(id) {
  showToast('Restauration en cours...', 'info');
}

function renderApiKeys() { 
  const container = document.getElementById('apiKeysList2');
  if (!container) return;
  
  if (G.apiKeys.length === 0) {
    container.innerHTML = '<div class="text-center py-8 text-blue-300/50"><p class="text-sm">Aucune clé API</p></div>';
    return;
  }
  
  container.innerHTML = G.apiKeys.map(k => `
    <div class="glass-card rounded-xl p-4 border border-green-500/20 flex items-center justify-between">
      <div>
        <p class="text-white font-medium text-sm">${k.name}</p>
        <p class="text-xs text-green-400/60 font-mono">${k.key?.substr(0, 20)}...</p>
      </div>
      <button onclick="revokeApiKey('${k.id}')" class="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30">Révoquer</button>
    </div>
  `).join('');
}

async function generateApiKeyV6() {
  const name = document.getElementById('apiKeyName')?.value || `Clé ${G.apiKeys.length + 1}`;
  const key = `ged_${generateId()}_${generateId().substr(0, 16)}`;
  
  const newKey = {
    id: generateId(),
    name: name,
    key: key,
    createdAt: new Date().toISOString(),
    lastUsed: null
  };
  
  // Ajouter à Supabase si disponible
  if (!G.useLocalAuth && SB) {
    await dbInsert('api_keys', {
      id: newKey.id,
      name: newKey.name,
      key_value: newKey.key,
      user_id: G.currentUser?.id,
      created_at: newKey.createdAt,
      last_used: null
    });
  }
  
  G.apiKeys.push(newKey);
  await saveApiKeys();
  renderApiKeys();
  showToast('Clé API générée', 'success');
}

async function revokeApiKey(id) {
  G.apiKeys = G.apiKeys.filter(k => k.id !== id);
  await saveApiKeys();
  
  // Supprimer de Supabase si disponible
  if (!G.useLocalAuth && SB) {
    await dbDelete('api_keys', id);
  }
  
  renderApiKeys();
  showToast('Clé révoquée', 'success');
}

function renderBillingV6() { 
  renderBilling(); 
}

function renderAuditV6() { 
  showToast('Audit - en développement', 'info'); 
}

function renderAdvancedSearch() { 
  renderDocuments(); 
}

function renderVersioning() { 
  showToast('Versioning - en développement', 'info'); 
}

function renderSearchV7() { 
  renderDocuments(); 
}

function renderRBACV7() { 
  renderRBAC(); 
}

function renderShared() {
  const container = document.getElementById('sharedList');
  if (!container) return;
  
  const received = G.shares.filter(s => s.recipientEmail === G.currentUser?.email && s.status === 'active');
  
  if (received.length === 0) {
    container.innerHTML = '<p class="text-center py-8 text-blue-300/50">Aucun document partagé avec vous</p>';
    return;
  }
  
  container.innerHTML = received.map(s => {
    const doc = G.documents.find(d => d.id === s.documentId);
    return `
      <div class="glass-card rounded-xl p-4 border border-purple-500/20 cursor-pointer" onclick="openPreviewModal('${s.documentId}')">
        <div class="flex items-center gap-3">
          <i class="fas fa-share-alt text-purple-400"></i>
          <div>
            <p class="text-white font-medium">${doc?.name || 'Document inconnu'}</p>
            <p class="text-xs text-blue-300/60">De: ${s.senderId}</p>
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
  
  // FONCTIONS CORRIGÉES
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
  generateApiKeyV6, revokeApiKey,
  
  // Folders
  openFolder, renderFolderContents
});
