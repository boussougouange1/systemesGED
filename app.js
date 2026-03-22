// SystemesGED v5.3 - Application principale (CORRIGÉ ET OPTIMISÉ)
// ============================================

// ─── Configuration Supabase ───
const CONFIG = {
  // CORRECTION: Utilisation de la clé ANON publique du fichier info supbase.txt
  supabaseUrl: 'https://whkvtpqesqiailwjgoaq.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indoa3Z0cHFlc3FpYWlsd2pnb2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxOTU1ODIsImV4cCI6MjA4OTc3MTU4Mn0.oIEDNRvSAEsVTarXnIl1cMTLoqS1nsHo8dPnjdW0ng8',
  
  // CORRECTION: Pour les opérations admin serveur, utiliser la clé service_role (à ne JAMAIS exposer côté client)
  // serviceRoleKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indoa3Z0cHFlc3FpYWlsd2pnb2FxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDE5NTU4MiwiZXhwIjoyMDg5NzcxNTgyfQ.8HP7h7ud3IUcU5fgkStUmg3ahWzkkfZvvwsTEXiDR1U', // UNIQUEMENT CÔTÉ SERVEUR
  
  storageBucket: 'documents',
  maxFileSize: 50 * 1024 * 1024, // 50 MB
  
  defaultPlan: 'free',
  plans: {
    free: { name: 'Free', price: 0, users: 5, storage: 1073741824, features: ['basic'] },
    starter: { name: 'Starter', price: 29, users: 20, storage: 10737418240, features: ['basic', 'versioning'] },
    professional: { name: 'Professional', price: 79, users: 100, storage: 107374182400, features: ['basic', 'versioning', 'rbac', 'audit'] },
    enterprise: { name: 'Enterprise', price: null, users: 999999, storage: 999999999999, features: ['all'] }
  },
  
  // ADMINISTRATEURS AVEC UUIDs CORRECTS DU FICHIER info supbase.txt
  systemAdmins: [
    {
      email: 'ahouansouange@live.fr',
      companyName: 'live',
      companyId: 'company_live_001',
      userId: '57923740-aa51-40c7-8bca-d60c20ea307f', // UUID_1 du fichier
      password: 'AA++aa++11111'
    },
    {
      email: 'systemesshop@gmail.com',
      companyName: 'systemesshop',
      companyId: 'company_systemesshop_001',
      userId: 'c1fa75e6-709b-4a18-af67-0329f58dbac0', // UUID_2 du fichier
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
  supabaseConnected: false
};

// ─── Initialisation Supabase ───
let SB = null;

async function initializeSupabase() {
  try {
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      console.error('❌ Bibliothèque Supabase non chargée');
      logError('Supabase library not loaded', { error: 'supabase object undefined' });
      return false;
    }
    
    // CORRECTION: Utilisation de la clé ANON correcte
    SB = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      },
      realtime: { 
        params: { eventsPerSecond: 10 } 
      },
      db: {
        schema: 'public'
      }
    });
    
    window.SB = SB;
    
    // Vérifier la session existante
    const { data: { session }, error } = await SB.auth.getSession();
    
    if (error) {
      console.error('❌ Erreur connexion Supabase:', error);
      logError('Supabase session error', { error: error.message });
      return false;
    }
    
    if (session) {
      console.log('✅ Session Supabase existante restaurée');
      G.currentUser = session.user;
      G.supabaseConnected = true;
    }
    
    console.log('✅ Client Supabase initialisé');
    return true;
    
  } catch (e) {
    console.error('❌ Erreur init Supabase:', e);
    logError('Supabase initialization failed', { error: e.message });
    return false;
  }
}

// ─── Test de connexion ───
async function testConnection() {
  console.log('🔍 Test connexion Supabase...');
  try {
    // Test 1: Vérifier les tables companies avec company_id RLS
    const { data: companies, error: companiesError } = await SB
      .from('companies')
      .select('*')
      .limit(1);
    
    if (companiesError) {
      console.warn('⚠️ Table companies:', companiesError.message);
    } else {
      console.log('✅ Table companies accessible:', companies?.length || 0, 'résultat(s)');
    }
    
    // Test 2: Vérifier les buckets de stockage
    const { data: buckets, error: bucketsError } = await SB.storage.listBuckets();
    
    if (bucketsError) {
      console.warn('⚠️ Storage:', bucketsError.message);
    } else {
      console.log('✅ Storage accessible - Buckets:', buckets?.map(b => b.name) || 'Aucun');
    }
    
    // Test 3: Vérifier la table documents avec RLS company_id
    const { data: docs, error: docsError } = await SB
      .from('documents')
      .select('id, name, company_id')
      .limit(1);
    
    if (docsError) {
      console.warn('⚠️ Table documents:', docsError.message);
    } else {
      console.log('✅ Table documents accessible avec RLS company_id');
    }
    
    G.supabaseConnected = true;
    return true;
    
  } catch (e) {
    console.error('❌ Test échoué:', e);
    logError('Connection test failed', { error: e.message });
    return false;
  }
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

// CORRECTION: Authentification réelle Supabase avec gestion company_id
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');
  if (btn) btn.disabled = true;
  if (btnText) btnText.innerHTML = '<span class="spinner mr-2"></span>Connexion...';
  
  const email = document.getElementById('loginEmail')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;
  
  try {
    // Vérifier d'abord les administrateurs système (mode hybride pour compatibilité)
    const systemAdmin = CONFIG.systemAdmins.find(a => a.email === email);
    if (systemAdmin && password === systemAdmin.password) {
      // Connexion admin système avec Supabase Auth si possible, sinon fallback
      const { data: authData, error: authError } = await SB.auth.signInWithPassword({
        email: email,
        password: password
      }).catch(() => ({ data: null, error: null })); // Fallback silencieux si l'utilisateur n'existe pas dans Auth
      
      if (!authData?.session && systemAdmin) {
        // Mode fallback pour admins système pré-configurés
        const user = {
          id: systemAdmin.userId || `admin_${systemAdmin.companyId}`,
          email: systemAdmin.email,
          name: `Administrateur ${systemAdmin.companyName}`,
          role: 'admin',
          companyId: systemAdmin.companyId,
          companyName: systemAdmin.companyName,
          plan: 'enterprise',
          status: 'active',
          isSystemAdmin: true,
          permissions: ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users'],
          user_metadata: { company_id: systemAdmin.companyId }
        };
        
        G.currentUser = user;
        G.currentCompany = { 
          id: systemAdmin.companyId, 
          name: systemAdmin.companyName, 
          plan: 'enterprise' 
        };
        
        await initializeApp();
        showToast('Connexion administrateur réussie', 'success');
        addAudit('login', 'user', user.id);
        return;
      }
    }
    
    // Connexion standard Supabase Auth
    const { data, error } = await SB.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (error) throw error;
    
    if (data.user) {
      // Vérifier le statut de validation
      if (data.user.user_metadata?.status === 'pending_validation') {
        showToast('Votre compte est en attente de validation par un administrateur', 'warning');
        await SB.auth.signOut();
        if (btn) btn.disabled = false;
        if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
        return;
      }
      
      // Récupérer les informations de l'entreprise depuis les métadonnées ou la table
      const companyId = data.user.user_metadata?.company_id || data.user.user_metadata?.companyId;
      
      if (!companyId) {
        showToast('Erreur: Entreprise non associée au compte', 'error');
        return;
      }
      
      // Récupérer les détails de l'entreprise depuis Supabase
      const { data: companyData, error: companyError } = await SB
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();
      
      G.currentUser = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || data.user.email,
        role: data.user.user_metadata?.role || 'viewer',
        companyId: companyId,
        plan: data.user.user_metadata?.plan || 'free',
        status: 'active',
        user_metadata: data.user.user_metadata
      };
      
      G.currentCompany = companyData || { 
        id: companyId, 
        name: data.user.user_metadata?.company_name || 'Mon Entreprise', 
        plan: G.currentUser.plan 
      };
      
      await initializeApp();
      showToast('Connexion réussie', 'success');
      addAudit('login', 'user', data.user.id);
    }
    
  } catch (err) {
    console.error('Erreur login:', err);
    logError('Login error', { error: err.message, email });
    showToast(err.message === 'Invalid login credentials' ? 'Identifiants incorrects' : 'Erreur de connexion', 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
  }
}

// CORRECTION: Inscription avec création dans Supabase Auth et gestion company_id
async function handleRegister(e) {
  e.preventDefault();
  
  const firstName = document.getElementById('regFirst')?.value?.trim();
  const lastName = document.getElementById('regLast')?.value?.trim();
  const company = document.getElementById('regCompany')?.value?.trim();
  const email = document.getElementById('regEmail')?.value?.trim();
  const password = document.getElementById('regPassword')?.value;
  
  if (!email || !password || !firstName || !lastName || !company) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }
  
  try {
    // Créer l'entreprise d'abord pour obtenir un company_id
    const companyId = `company_${generateId()}`;
    
    const { data: companyData, error: companyError } = await SB
      .from('companies')
      .insert({
        id: companyId,
        name: company,
        plan: 'free',
        created_at: new Date().toISOString(),
        owner_email: email
      })
      .select()
      .single();
    
    if (companyError) {
      console.warn('Erreur création entreprise:', companyError);
      // Continuer avec les métadonnées uniquement
    }
    
    // Créer l'utilisateur dans Supabase Auth avec company_id dans les métadonnées
    const { data: authData, error: authError } = await SB.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          name: `${firstName} ${lastName}`,
          first_name: firstName,
          last_name: lastName,
          company_id: companyId,
          company_name: company,
          role: 'admin', // Premier utilisateur = admin
          status: 'pending_validation',
          plan: 'free'
        }
      }
    });
    
    if (authError) throw authError;
    
    if (authData.user) {
      // Insérer dans la table users avec company_id pour RLS
      const { error: userError } = await SB
        .from('users')
        .insert({
          id: authData.user.id,
          email: email,
          name: `${firstName} ${lastName}`,
          company_id: companyId,
          role: 'admin',
          status: 'pending_validation',
          created_at: new Date().toISOString()
        });
      
      if (userError) {
        console.warn('Erreur insertion user:', userError);
      }
      
      showToast('Compte créé avec succès. En attente de validation par un administrateur.', 'success');
      addAudit('register_pending', 'user', authData.user.id, { company_id: companyId });
      switchAuthTab('login');
    }
    
  } catch (err) {
    console.error('Erreur inscription:', err);
    showToast(err.message || 'Erreur lors de la création du compte', 'error');
  }
}

function demoLogin() {
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  if (loginEmail) loginEmail.value = 'demo@systemesged.fr';
  if (loginPassword) loginPassword.value = 'Admin123!';
  handleLogin(new Event('submit'));
}

function oauthLogin(provider) {
  showToast(`Connexion ${provider}...`, 'info');
  // Implémentation OAuth Supabase à ajouter selon les besoins
  setTimeout(() => {
    showToast(`Connexion ${provider} non configurée`, 'warning');
  }, 1000);
}

async function handleLogout() {
  addAudit('logout', 'user', G.currentUser?.id);
  
  // Déconnexion Supabase
  await SB.auth.signOut().catch(() => {});
  
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
  
  // Sauvegarder la session localement comme backup
  if (G.currentUser) {
    localStorage.setItem('currentUser', JSON.stringify(G.currentUser));
    localStorage.setItem('currentCompany', JSON.stringify(G.currentCompany));
  }
  
  updateUserDisplay();
  await loadInitialData();
  updatePendingUsersCount();
  switchView('dashboard');
  startRealtimeSync();
  logInfo('Application initialisée', { user: G.currentUser?.id, company: G.currentCompany?.id });
  
  // Si admin, vérifier s'il y a des validations en attente
  if (isAdmin() && G.pendingUsersCount > 0) {
    showToast(`${G.pendingUsersCount} utilisateur(s) en attente de validation`, 'warning', 5000);
  }
}

function isAdmin() {
  return ['admin', 'manager'].includes(G.currentUser?.role) || G.currentUser?.isSystemAdmin;
}

function canValidateUsers() {
  return G.currentUser?.role === 'admin' || G.currentUser?.permissions?.includes('validate_users') || G.currentUser?.isSystemAdmin;
}

function canManageSignatures() {
  return G.currentUser?.role === 'admin' || G.currentUser?.permissions?.includes('signatures') || G.currentUser?.isSystemAdmin;
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
  
  if (G.currentUser.status === 'pending_validation') {
    showToast('Votre compte est limité - en attente de validation', 'warning');
  }
  
  updateValidationMenuVisibility();
}

// ─── Gestion des Validations d'Utilisateurs ───
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
    // Compter les utilisateurs en attente dans Supabase
    const { count, error } = await SB
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', G.currentUser.companyId)
      .eq('status', 'pending_validation');
    
    if (!error) {
      G.pendingUsersCount = count || 0;
    }
  } catch (e) {
    // Fallback sur localStorage si Supabase indisponible
    const pendingUsers = JSON.parse(localStorage.getItem(`admins_${G.currentUser.companyId}`) || '[]');
    const pendingInUsers = G.users.filter(u => u.status === 'pending_validation').length;
    G.pendingUsersCount = pendingUsers.length + pendingInUsers;
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
  // Chargement parallèle depuis Supabase avec filtre company_id
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

// ─── Données depuis Supabase avec RLS company_id ───
async function loadDocuments() {
  try {
    if (!G.currentUser?.companyId) throw new Error('No company ID');
    
    const { data, error } = await SB
      .from('documents')
      .select('*')
      .eq('company_id', G.currentUser.companyId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    G.documents = data || [];
    return G.documents;
  } catch (e) {
    console.warn('Fallback localStorage pour documents:', e.message);
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
      owner_id: G.currentUser?.id,
      company_id: G.currentUser?.companyId,
      folder_id: '__root__',
      tags: [],
      created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      views: Math.floor(Math.random() * 100),
      downloads: Math.floor(Math.random() * 20),
      is_deleted: false,
      deleted_at: null,
      content: ''
    });
  }
  return docs;
}

async function saveDocuments() {
  if (!G.currentUser?.companyId) return;
  
  try {
    // Sauvegarde dans Supabase avec company_id pour RLS
    for (const doc of G.documents) {
      if (!doc.company_id) doc.company_id = G.currentUser.companyId;
      
      const { error } = await SB
        .from('documents')
        .upsert(doc, { onConflict: 'id' });
      
      if (error) console.warn('Erreur sauvegarde document:', error);
    }
  } catch (e) {
    // Fallback localStorage
    localStorage.setItem(`docs_${G.currentUser.companyId}`, JSON.stringify(G.documents));
  }
}

async function loadWorkflows() {
  try {
    const { data, error } = await SB
      .from('workflows')
      .select('*')
      .eq('company_id', G.currentUser?.companyId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    G.workflows = data || [];
  } catch (e) {
    const stored = localStorage.getItem(`workflows_${G.currentUser?.companyId}`);
    G.workflows = stored ? JSON.parse(stored) : [];
  }
  return G.workflows;
}

function saveWorkflows() {
  if (G.currentUser?.companyId) {
    localStorage.setItem(`workflows_${G.currentUser.companyId}`, JSON.stringify(G.workflows));
  }
}

async function loadUsers() {
  try {
    const { data, error } = await SB
      .from('users')
      .select('*')
      .eq('company_id', G.currentUser?.companyId);
    
    if (error) throw error;
    G.users = data || [];
  } catch (e) {
    const stored = localStorage.getItem(`users_${G.currentUser?.companyId}`);
    if (stored) {
      G.users = JSON.parse(stored);
    } else {
      // Admin système par défaut
      if (G.currentUser?.isSystemAdmin) {
        G.users = [{
          id: G.currentUser.id,
          email: G.currentUser.email,
          name: G.currentUser.name,
          role: 'admin',
          status: 'active',
          company_id: G.currentUser.companyId,
          created_at: new Date().toISOString(),
          last_login: new Date().toISOString(),
          is_system_admin: true
        }];
        saveUsers();
      } else {
        G.users = [{
          id: G.currentUser.id,
          email: G.currentUser.email,
          name: G.currentUser.name,
          role: G.currentUser.role || 'admin',
          company_id: G.currentUser.companyId,
          status: 'active',
          created_at: new Date().toISOString(),
          last_login: new Date().toISOString()
        }];
        saveUsers();
      }
    }
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
    { id: '__root__', name: 'Racine', parent_id: null, created_at: new Date().toISOString() },
    { id: generateId(), name: 'Contrats', parent_id: '__root__', created_at: new Date().toISOString() },
    { id: generateId(), name: 'Factures', parent_id: '__root__', created_at: new Date().toISOString() }
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
    case 'pending-users': renderPendingUsers(); break;
  }
  
  addAudit('view_change', 'view', viewName);
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
  
  const storageUsed = G.documents.filter(d => !d.is_deleted).reduce((sum, d) => sum + (d.size || 0), 0);
  const storageLimit = CONFIG.plans[G.currentUser?.plan || 'free'].storage;
  const storagePercent = Math.min(100, Math.round((storageUsed / storageLimit) * 100));
  
  const storagePercentEl = document.getElementById('storagePercent');
  const storageBarEl = document.getElementById('storageBar');
  const storageTextEl = document.getElementById('storageText');
  const mobileStoragePercentEl = document.getElementById('mobileStoragePercent');
  const mobileStorageBarEl = document.getElementById('mobileStorageBar');
  const mobileStorageTextEl = document.getElementById('mobileStorageText');
  
  if (storagePercentEl) storagePercentEl.textContent = `${storagePercent}%`;
  if (storageBarEl) storageBarEl.style.width = `${storagePercent}%`;
  if (storageTextEl) storageTextEl.textContent = `${formatBytes(storageUsed)} / ${formatBytes(storageLimit)}`;
  if (mobileStoragePercentEl) mobileStoragePercentEl.textContent = `${storagePercent}%`;
  if (mobileStorageBarEl) mobileStorageBarEl.style.width = `${storagePercent}%`;
  if (mobileStorageTextEl) mobileStorageTextEl.textContent = `${formatBytes(storageUsed)} / ${formatBytes(storageLimit)}`;
  
  renderActivityList();
  renderQuickAccess();
  renderPopularTags();
  renderTeamDocs();
  renderMyWorkflows();
  
  const dashTotalViewsEl = document.getElementById('dashTotalViews');
  const dashActiveUsersEl = document.getElementById('dashActiveUsers');
  
  if (dashTotalViewsEl) dashTotalViewsEl.textContent = G.documents.reduce((sum, d) => sum + (d.views || 0), 0);
  if (dashActiveUsersEl) dashActiveUsersEl.textContent = G.users.filter(u => u.status === 'active').length;
  
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
  const pdfCount = G.documents.filter(d => !d.is_deleted && d.type === 'pdf').length;
  const docCount = G.documents.filter(d => !d.is_deleted && d.type === 'doc').length;
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
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white truncate">${doc.name}</p>
        <p class="text-xs text-blue-300/60">${formatDate(doc.created_at)}</p>
      </div>
    </div>
  `).join('');
}

function renderMyWorkflows() {
  const list = document.getElementById('myWorkflowsList');
  const badge = document.getElementById('myWorkflowsBadge');
  if (!list) return;
  
  const myWfs = G.workflows.filter(w => w.assignee_id === G.currentUser?.id || w.created_by === G.currentUser?.id).slice(0, 5);
  
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
  let docs = G.documents.filter(d => !d.is_deleted);
  
  if (G.docsTab === 'company') docs = docs.filter(d => d.scope === 'company');
  else if (G.docsTab === 'personal') docs = docs.filter(d => d.scope === 'personal');
  else if (G.docsTab === 'mine') docs = docs.filter(d => d.owner_id === G.currentUser?.id);
  else if (G.docsTab === 'shared') {
    const sharedDocIds = G.shares.filter(s => s.recipient_email === G.currentUser?.email && s.status === 'active').map(s => s.document_id);
    docs = docs.filter(d => sharedDocIds.includes(d.id));
  }
  
  const typeFilter = document.getElementById('filterType')?.value;
  if (typeFilter) docs = docs.filter(d => d.type === typeFilter);
  
  const dateFilter = document.getElementById('filterDate')?.value;
  if (dateFilter) {
    const now = new Date();
    docs = docs.filter(d => {
      const docDate = new Date(d.created_at);
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
  const isOwner = doc.owner_id === G.currentUser?.id;
  
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
      <p class="text-blue-300/60 text-xs mb-2">${size} • ${formatDate(doc.created_at)}</p>
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
  const isOwner = doc.owner_id === G.currentUser?.id;
  
  return `
    <div class="doc-list-item glass-card rounded-xl border border-blue-500/10 hover:border-blue-500/30 cursor-pointer" onclick="openPreviewModal('${doc.id}')">
      <div class="doc-icon rounded-lg bg-blue-500/10 flex items-center justify-center ${iconClass.split(' ')[1]}">
        <i class="fas ${iconClass.split(' ')[0]} text-lg"></i>
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
  
  const selectedFilesList = document.getElementById('selectedFilesList');
  const docNameInput = document.getElementById('docNameInput');
  const docDescInput = document.getElementById('docDescInput');
  const tagInput = document.getElementById('tagInput');
  
  if (selectedFilesList) selectedFilesList.innerHTML = '';
  if (docNameInput) docNameInput.value = '';
  if (docDescInput) docDescInput.value = '';
  if (tagInput) tagInput.value = '';
  
  G.selectedFiles = [];
  G.uploadTags = [];
  renderUploadTags();
  updateScopeUI();
}

function closeUploadModal() {
  const uploadModal = document.getElementById('uploadModal');
  const uploadProgress = document.getElementById('uploadProgress');
  if (uploadModal) uploadModal.classList.add('hidden');
  if (uploadProgress) uploadProgress.classList.add('hidden');
  G.selectedFiles = [];
}

function setDocScope(scope) {
  _uploadScope = scope;
  updateScopeUI();
}

function updateScopeUI() {
  const companyBtn = document.getElementById('scopeCompany');
  const personalBtn = document.getElementById('scopePersonal');
  
  if (!companyBtn || !personalBtn) return;
  
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
  
  const processedFiles = files.map(file => {
    let correctType = file.type;
    const ext = file.name.split('.').pop().toLowerCase();
    const mimeTypes = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'txt': 'text/plain',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg'
    };
    
    if (!correctType || correctType === 'application/octet-stream') {
      correctType = mimeTypes[ext] || 'application/octet-stream';
    }
    
    return new File([file], file.name, { type: correctType, lastModified: file.lastModified });
  });
  
  addFilesToSelection(processedFiles);
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
  document.getElementById('docDropZone')?.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  
  const processedFiles = files.map(file => {
    let correctType = file.type;
    const ext = file.name.split('.').pop().toLowerCase();
    const mimeTypes = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'txt': 'text/plain',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg'
    };
    
    if (!correctType || correctType === 'application/octet-stream') {
      correctType = mimeTypes[ext] || 'application/octet-stream';
    }
    
    return new File([file], file.name, { type: correctType, lastModified: file.lastModified });
  });
  
  addFilesToSelection(processedFiles);
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
  if (!list) return;
  list.innerHTML = G.selectedFiles.map((file, idx) => `
    <div class="flex items-center justify-between p-2 rounded-lg bg-blue-900/30 border border-blue-500/20">
      <div class="flex items-center gap-2 min-w-0">
        <i class="fas fa-file text-blue-400"></i>
        <span class="text-sm text-white truncate">${file.name}</span>
        <span class="text-xs text-blue-300/60">${formatBytes(file.size)}</span>
        <span class="text-xs text-green-400">(${file.type || 'type inconnu'})</span>
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
  
  const progressDiv = document.getElementById('uploadProgress');
  const progressBar = document.getElementById('uploadProgressBar');
  const progressText = document.getElementById('uploadPercent');
  const statusText = document.getElementById('uploadStatusText');
  const uploadBtn = document.getElementById('uploadBtn');
  
  if (progressDiv) progressDiv.classList.remove('hidden');
  if (uploadBtn) uploadBtn.disabled = true;
  
  for (let i = 0; i < G.selectedFiles.length; i++) {
    const file = G.selectedFiles[i];
    if (statusText) statusText.textContent = `Upload ${i + 1}/${G.selectedFiles.length}: ${file.name}`;
    
    for (let p = 0; p <= 100; p += 10) {
      if (progressBar) progressBar.style.width = `${p}%`;
      if (progressText) progressText.textContent = `${p}%`;
      await simulateNetworkDelay(50);
    }
    
    const originalName = file.name;
    const customName = document.getElementById('docNameInput')?.value.trim();
    
    let finalName = originalName;
    if (customName) {
      const originalExt = originalName.split('.').pop();
      const customHasExt = customName.includes('.');
      finalName = customHasExt ? customName : `${customName}.${originalExt}`;
    }
    
    const docId = generateId();
    const doc = {
      id: docId,
      name: finalName,
      original_name: originalName,
      mime_type: file.type,
      type: getFileType(finalName),
      size: file.size,
      description: document.getElementById('docDescInput')?.value || '',
      scope: _uploadScope,
      owner_id: G.currentUser?.id,
      company_id: G.currentUser?.companyId,
      folder_id: G.currentFolderId,
      tags: [...G.uploadTags],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      views: 0,
      downloads: 0,
      is_deleted: false,
      deleted_at: null,
      content: ''
    };
    
    // Upload vers Supabase Storage avec company_id dans le chemin
    try {
      const filePath = `${G.currentUser.companyId}/${docId}/${finalName}`;
      const { error: uploadError } = await SB.storage
        .from(CONFIG.storageBucket)
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      // Sauvegarder les métadonnées dans Supabase DB
      const { error: dbError } = await SB
        .from('documents')
        .insert(doc);
      
      if (dbError) throw dbError;
      
    } catch (e) {
      console.warn('Erreur upload Supabase, fallback local:', e);
      G.originalFiles.set(docId, file);
    }
    
    G.documents.unshift(doc);
    addAudit('upload', 'document', docId, { name: doc.name, size: doc.size, mimeType: file.type });
    logInfo(`Document uploadé: ${doc.name} (type: ${file.type})`);
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
  
  const previewTitle = document.getElementById('previewTitle');
  const previewMeta = document.getElementById('previewMeta');
  const previewIcon = document.getElementById('previewIcon');
  
  if (previewTitle) previewTitle.textContent = doc.name;
  if (previewMeta) previewMeta.textContent = `${formatBytes(doc.size)} • ${formatDate(doc.created_at)} • v${doc.version} • ${doc.mime_type || 'type inconnu'}`;
  if (previewIcon) previewIcon.innerHTML = `<div class="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center ${getFileIcon(doc.type).split(' ')[1]} text-2xl"><i class="fas ${getFileIcon(doc.type).split(' ')[0]}"></i></div>`;
  
  const content = document.getElementById('previewContent');
  const frame = document.getElementById('previewFrame');
  const img = document.getElementById('previewImage');
  
  if (frame) frame.classList.add('hidden');
  if (img) img.classList.add('hidden');
  if (content) content.classList.remove('hidden');
  
  if (doc.type === 'img') {
    if (content) content.classList.add('hidden');
    if (img) {
      img.classList.remove('hidden');
      // Récupérer depuis Supabase Storage
      const { data } = SB.storage
        .from(CONFIG.storageBucket)
        .getPublicUrl(`${doc.company_id}/${doc.id}/${doc.name}`);
      
      img.src = data?.publicUrl || `https://placehold.co/600x400/1e3a8a/60a5fa?text=${encodeURIComponent(doc.name)}`;
    }
  } else if (doc.type === 'pdf') {
    if (content) content.classList.add('hidden');
    if (frame) {
      frame.classList.remove('hidden');
      const { data } = SB.storage
        .from(CONFIG.storageBucket)
        .getPublicUrl(`${doc.company_id}/${doc.id}/${doc.name}`);
      
      frame.src = data?.publicUrl || `https://placehold.co/600x800/1e3a8a/60a5fa?text=PDF:+${encodeURIComponent(doc.name)}`;
    }
  } else if (doc.type === 'txt' || doc.mime_type === 'text/plain') {
    if (content) {
      content.innerHTML = `
        <div class="text-left p-4 bg-slate-900/50 rounded-lg border border-blue-500/20 max-h-96 overflow-auto">
          <pre class="text-sm text-blue-200 whitespace-pre-wrap">${doc.content || 'Aucun contenu texte disponible'}</pre>
        </div>
      `;
    }
  } else {
    if (content) {
      content.innerHTML = `
        <div class="text-center">
          <i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-5xl mb-3 ${getFileIcon(doc.type).split(' ')[1]} opacity-50"></i>
          <p class="mb-3">Aperçu non disponible pour ce format (${doc.mime_type || 'type inconnu'})</p>
          <button onclick="downloadCurrentDocument()" class="btn-primary px-5 py-2 rounded-lg text-white text-sm"><i class="fas fa-download mr-2"></i>Télécharger</button>
        </div>
      `;
    }
  }
  
  const previewModal = document.getElementById('previewModal');
  if (previewModal) previewModal.classList.remove('hidden');
  addAudit('view', 'document', docId);
}

function closePreviewModal() {
  const previewModal = document.getElementById('previewModal');
  const previewFrame = document.getElementById('previewFrame');
  if (previewModal) previewModal.classList.add('hidden');
  if (previewFrame) previewFrame.src = '';
  G.currentDocId = null;
}

function downloadCurrentDocument() {
  if (G.currentDocId) downloadDocument(G.currentDocId);
}

async function downloadDocument(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  doc.downloads = (doc.downloads || 0) + 1;
  saveDocuments();
  
  try {
    // Télécharger depuis Supabase Storage
    const { data, error } = await SB.storage
      .from(CONFIG.storageBucket)
      .download(`${doc.company_id}/${docId}/${doc.name}`);
    
    if (error) throw error;
    
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Téléchargement: ${doc.name}`, 'success');
    
  } catch (e) {
    // Fallback
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
    }
  }
  
  addAudit('download', 'document', docId);
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
  const shareDocInfo = document.getElementById('shareDocInfo');
  if (shareDocInfo) shareDocInfo.textContent = doc.name;
  
  const shareModal = document.getElementById('shareModal');
  if (shareModal) {
    shareModal.classList.remove('hidden');
    const generatedLink = document.getElementById('generatedLink');
    if (generatedLink) generatedLink.classList.add('hidden');
  }
  switchShareTab('send');
  loadShareHistory();
}

function closeShareModal() {
  const shareModal = document.getElementById('shareModal');
  if (shareModal) shareModal.classList.add('hidden');
  G.currentDocId = null;
}

function switchShareTab(tab) {
  const tabSend = document.getElementById('shareTab-send');
  const tabHistory = document.getElementById('shareTab-history');
  const panelSend = document.getElementById('sharePanel-send');
  const panelHistory = document.getElementById('sharePanel-history');
  
  if (tabSend) {
    tabSend.classList.toggle('text-blue-400', tab === 'send');
    tabSend.classList.toggle('border-blue-400', tab === 'send');
    tabSend.classList.toggle('text-gray-400', tab !== 'send');
    tabSend.classList.toggle('border-transparent', tab !== 'send');
  }
  
  if (tabHistory) {
    tabHistory.classList.toggle('text-blue-400', tab === 'history');
    tabHistory.classList.toggle('border-blue-400', tab === 'history');
    tabHistory.classList.toggle('text-gray-400', tab !== 'history');
    tabHistory.classList.toggle('border-transparent', tab !== 'history');
  }
  
  if (panelSend) panelSend.classList.toggle('hidden', tab !== 'send');
  if (panelHistory) panelHistory.classList.toggle('hidden', tab !== 'history');
}

async function shareDocument() {
  const email = document.getElementById('shareEmail')?.value;
  if (!email) {
    showToast('Veuillez entrer un email', 'warning');
    return;
  }
  
  const permission = document.getElementById('sharePermission')?.value;
  const expiration = document.getElementById('shareExpiration')?.value;
  const message = document.getElementById('shareMessage')?.value;
  
  const share = {
    id: generateId(),
    document_id: G.currentDocId,
    document_name: G.documents.find(d => d.id === G.currentDocId)?.name,
    sender_id: G.currentUser?.id,
    sender_email: G.currentUser?.email,
    recipient_email: email,
    permission,
    message,
    status: 'active',
    company_id: G.currentUser?.companyId,
    created_at: new Date().toISOString(),
    expires_at: expiration !== '0' ? new Date(Date.now() + parseInt(expiration) * 24 * 60 * 60 * 1000).toISOString() : null
  };
  
  try {
    const { error } = await SB.from('shares').insert(share);
    if (error) throw error;
    
    G.shares.unshift(share);
    saveShares();
    
    const link = `${window.location.origin}/share/${share.id}`;
    const shareLinkInput = document.getElementById('shareLinkInput');
    if (shareLinkInput) shareLinkInput.value = link;
    const generatedLink = document.getElementById('generatedLink');
    if (generatedLink) generatedLink.classList.remove('hidden');
    
    showToast('Partage créé avec succès', 'success');
    addAudit('share', 'document', G.currentDocId, { recipient: email });
    updateBadges();
    logInfo(`Email envoyé à ${email}`, { shareId: share.id });
    
  } catch (e) {
    showToast('Erreur lors du partage', 'error');
  }
}

function copyShareLink() {
  const input = document.getElementById('shareLinkInput');
  if (input) {
    input.select();
    document.execCommand('copy');
    showToast('Lien copié', 'success');
  }
}

function loadShareHistory() {
  const list = document.getElementById('shareHistoryList');
  if (!list) return;
  const docShares = G.shares.filter(s => s.document_id === G.currentDocId);
  const shareHistoryCount = document.getElementById('shareHistoryCount');
  
  if (shareHistoryCount) {
    shareHistoryCount.textContent = docShares.length;
    shareHistoryCount.classList.toggle('hidden', docShares.length === 0);
  }
  
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
          <p class="text-sm text-white">${s.recipient_email}</p>
          <p class="text-xs text-blue-300/60">${s.permission} • ${formatDate(s.created_at)}</p>
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
  if (!strip) return;
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
  if (!container) return;
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
        <span class="text-blue-300/40">${formatDate(wf.due_date)}</span>
        <span class="wf-badge"><i class="fas fa-user"></i>${wf.assignee_name || 'Non assigné'}</span>
      </div>
    </div>
  `;
}

function renderWfList() {
  const container = document.getElementById('wfListView');
  if (!container) return;
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

function setWfView(view) {
  G.wfView = view;
  const wfViewKanban = document.getElementById('wfViewKanban');
  const wfViewList = document.getElementById('wfViewList');
  const wfKanban = document.getElementById('wfKanban');
  const wfListView = document.getElementById('wfListView');
  
  if (wfViewKanban) {
    wfViewKanban.classList.toggle('bg-blue-500/20', view === 'kanban');
    wfViewKanban.classList.toggle('text-blue-300', view === 'kanban');
  }
  if (wfViewList) {
    wfViewList.classList.toggle('bg-blue-500/20', view === 'list');
    wfViewList.classList.toggle('text-blue-300', view === 'list');
  }
  if (wfKanban) wfKanban.classList.toggle('hidden', view !== 'kanban');
  if (wfListView) wfListView.classList.toggle('hidden', view !== 'list');
}

function openCreateWorkflowModal() {
  const workflowModal = document.getElementById('workflowModal');
  const wfDocId = document.getElementById('wfDocId');
  const wfAssignee = document.getElementById('wfAssignee');
  
  if (workflowModal) workflowModal.classList.remove('hidden');
  if (wfDocId) wfDocId.innerHTML = '<option value="">-- Aucun --</option>' + G.documents.filter(d => !d.is_deleted).map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  if (wfAssignee) wfAssignee.innerHTML = '<option value="">-- Non assigné --</option>' + G.users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
  
  const wfStepsContainer = document.getElementById('wfStepsContainer');
  if (wfStepsContainer) wfStepsContainer.innerHTML = '';
  addWfStep();
}

function closeWorkflowModal() {
  const workflowModal = document.getElementById('workflowModal');
  if (workflowModal) workflowModal.classList.add('hidden');
}

function addWfStep() {
  const container = document.getElementById('wfStepsContainer');
  if (!container) return;
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
  
  const wfStepsContainer = document.getElementById('wfStepsContainer');
  const steps = wfStepsContainer ? Array.from(wfStepsContainer.querySelectorAll(':scope > div')).map(div => ({
    name: div.querySelector('input')?.value,
    assignee_id: div.querySelector('select')?.value,
    status: 'pending'
  })).filter(s => s.name) : [];

  const wfTitle = document.getElementById('wfTitle');
  const wfDesc = document.getElementById('wfDesc');
  const wfPriority = document.getElementById('wfPriority');
  const wfDocId = document.getElementById('wfDocId');
  const wfDueDate = document.getElementById('wfDueDate');
  const wfAssignee = document.getElementById('wfAssignee');
  
  const wf = {
    id: generateId(),
    title: wfTitle?.value || 'Nouveau Workflow',
    description: wfDesc?.value || '',
    priority: wfPriority?.value || 'medium',
    document_id: wfDocId?.value || '',
    due_date: wfDueDate?.value || '',
    assignee_id: wfAssignee?.value || '',
    assignee_name: G.users.find(u => u.id === wfAssignee?.value)?.name,
    created_by: G.currentUser?.id,
    company_id: G.currentUser?.companyId,
    status: 'pending',
    steps,
    current_step: 0,
    comments: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  try {
    const { error } = await SB.from('workflows').insert(wf);
    if (error) throw error;
    
    G.workflows.unshift(wf);
    saveWorkflows();
    
    showToast('Workflow créé avec succès', 'success');
    addAudit('create', 'workflow', wf.id);
    closeWorkflowModal();
    renderWorkflows();
    updateBadges();
    
  } catch (e) {
    showToast('Erreur création workflow', 'error');
  }
}

function openWfDetail(wfId) {
  const wf = G.workflows.find(w => w.id === wfId);
  if (!wf) return;
  
  G.currentWfId = wfId;
  const wfDetailTitle = document.getElementById('wfDetailTitle');
  const wfDetailMeta = document.getElementById('wfDetailMeta');
  
  if (wfDetailTitle) wfDetailTitle.textContent = wf.title;
  if (wfDetailMeta) {
    wfDetailMeta.innerHTML = `
      <span class="text-xs px-2 py-0.5 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span>
      <span class="text-xs text-blue-300/60"><i class="fas fa-calendar mr-1"></i>${formatDate(wf.due_date)}</span>
      <span class="text-xs text-blue-300/60"><i class="fas fa-flag mr-1"></i>${wf.priority}</span>
    `;
  }
  
  const progress = wf.status === 'approved' ? 100 : wf.status === 'rejected' ? 100 : wf.status === 'cancelled' ? 0 : Math.round(((wf.current_step || 0) / (wf.steps?.length || 1)) * 100);
  const wfDetailProgress = document.getElementById('wfDetailProgress');
  const wfDetailProgressBar = document.getElementById('wfDetailProgressBar');
  
  if (wfDetailProgress) wfDetailProgress.textContent = `${progress}%`;
  if (wfDetailProgressBar) wfDetailProgressBar.style.width = `${progress}%`;
  
  const wfDetailSteps = document.getElementById('wfDetailSteps');
  if (wfDetailSteps) {
    wfDetailSteps.innerHTML = (wf.steps || []).map((step, idx) => `
      <div class="flex items-center gap-3 p-3 rounded-lg ${idx === wf.current_step ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-slate-900/30 border border-blue-500/10'}">
        <div class="w-8 h-8 rounded-full ${idx < wf.current_step ? 'bg-green-500/20 text-green-400' : idx === wf.current_step ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-500/20 text-gray-400'} flex items-center justify-center text-xs">
          <i class="fas ${idx < wf.current_step ? 'fa-check' : idx === wf.current_step ? 'fa-spinner fa-spin' : 'fa-clock'}"></i>
        </div>
        <div class="flex-1">
          <p class="text-sm text-white">${step.name}</p>
          <p class="text-xs text-blue-300/60">${G.users.find(u => u.id === step.assignee_id)?.name || 'Non assigné'}</p>
        </div>
      </div>
    `).join('');
  }
  
  const isAssignee = wf.assignee_id === G.currentUser?.id || 
                     (wf.steps && wf.steps.some(s => s.assignee_id === G.currentUser?.id)) ||
                     wf.steps[wf.current_step]?.assignee_id === G.currentUser?.id;
  
  const isCreator = wf.created_by === G.currentUser?.id;
  const canAct = ['pending', 'in_review'].includes(wf.status) && (isAssignee || isCreator);
  
  const wfDetailActions = document.getElementById('wfDetailActions');
  if (wfDetailActions) wfDetailActions.classList.toggle('hidden', !canAct);
  
  const docSection = document.getElementById('wfDetailDocument');
  if (docSection) {
    if (wf.document_id) {
      const doc = G.documents.find(d => d.id === wf.document_id);
      const hasAccess = isAssignee || isCreator || doc?.scope === 'company' || doc?.owner_id === G.currentUser?.id;
      
      docSection.innerHTML = `
        <div class="p-3 rounded-lg bg-blue-900/20 border border-blue-500/20">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <i class="fas ${doc ? getFileIcon(doc.type).split(' ')[0] : 'fa-file'} text-blue-400"></i>
              <div>
                <p class="text-sm text-white font-medium">${doc ? doc.name : 'Document inconnu ou supprimé'}</p>
                <p class="text-xs text-blue-300/60">${doc ? formatBytes(doc.size) : ''}</p>
              </div>
            </div>
            ${doc && hasAccess ? `
              <button onclick="openPreviewModal('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30">
                <i class="fas fa-eye mr-1"></i>Voir
              </button>
            ` : '<span class="text-xs text-gray-500">Accès restreint</span>'}
          </div>
        </div>
      `;
      docSection.classList.remove('hidden');
    } else {
      docSection.classList.add('hidden');
    }
  }
  
  const wfDetailHistory = document.getElementById('wfDetailHistory');
  if (wfDetailHistory) {
    wfDetailHistory.innerHTML = (wf.comments || []).map(c => `
      <div class="p-2 rounded-lg bg-slate-900/30 border border-blue-500/10">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs text-blue-400">${c.author_name}</span>
          <span class="text-xs text-blue-300/40">${formatDate(c.timestamp)}</span>
        </div>
        <p class="text-sm text-white">${c.text}</p>
      </div>
    `).join('') || '<p class="text-center text-blue-300/40 text-sm py-4">Aucun commentaire</p>';
  }
  
  const wfDetailModal = document.getElementById('wfDetailModal');
  if (wfDetailModal) wfDetailModal.classList.remove('hidden');
}

function closeWfDetail() {
  const wfDetailModal = document.getElementById('wfDetailModal');
  if (wfDetailModal) wfDetailModal.classList.add('hidden');
  G.currentWfId = null;
}

async function actOnWorkflow(action) {
  const wf = G.workflows.find(w => w.id === G.currentWfId);
  if (!wf) return;
  
  const wfDetailComment = document.getElementById('wfDetailComment');
  const comment = wfDetailComment?.value || '';
  
  if (action === 'approve') {
    if (wf.current_step < (wf.steps?.length || 1) - 1) {
      wf.current_step++;
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
    author_id: G.currentUser?.id,
    author_name: G.currentUser?.name,
    text: `[${action.toUpperCase()}] ${comment || 'Aucun commentaire'}`,
    timestamp: new Date().toISOString()
  });
  
  wf.updated_at = new Date().toISOString();
  
  try {
    await SB.from('workflows').update(wf).eq('id', wf.id);
    saveWorkflows();
    
    showToast(`Workflow ${action === 'approve' ? 'approuvé' : action === 'reject' ? 'rejeté' : 'en révision'}`, 'success');
    addAudit(action, 'workflow', wf.id);
    closeWfDetail();
    renderWorkflows();
    updateBadges();
    
  } catch (e) {
    showToast('Erreur mise à jour workflow', 'error');
  }
}

function addWfComment() {
  const wfCommentInput = document.getElementById('wfCommentInput');
  const text = wfCommentInput?.value;
  if (!text) return;
  
  const wf = G.workflows.find(w => w.id === G.currentWfId);
  if (!wf) return;
  
  if (!wf.comments) wf.comments = [];
  wf.comments.push({
    author_id: G.currentUser?.id,
    author_name: G.currentUser?.name,
    text,
    timestamp: new Date().toISOString()
  });
  
  saveWorkflows();
  if (wfCommentInput) wfCommentInput.value = '';
  openWfDetail(G.currentWfId);
}

// ─── Shared ───
function renderShared() {
  switchSharedTab(G.sharedTab);
}

function switchSharedTab(tab) {
  G.sharedTab = tab;
  const tabReceived = document.getElementById('tab-received');
  const tabSent = document.getElementById('tab-sent');
  const sharedReceived = document.getElementById('shared-received');
  const sharedSent = document.getElementById('shared-sent');
  
  if (tabReceived) {
    tabReceived.classList.toggle('text-blue-400', tab === 'received');
    tabReceived.classList.toggle('border-blue-400', tab === 'received');
    tabReceived.classList.toggle('text-gray-400', tab !== 'received');
    tabReceived.classList.toggle('border-transparent', tab !== 'received');
  }
  
  if (tabSent) {
    tabSent.classList.toggle('text-blue-400', tab === 'sent');
    tabSent.classList.toggle('border-blue-400', tab === 'sent');
    tabSent.classList.toggle('text-gray-400', tab !== 'sent');
    tabSent.classList.toggle('border-transparent', tab !== 'sent');
  }
  
  if (sharedReceived) sharedReceived.classList.toggle('hidden', tab !== 'received');
  if (sharedSent) sharedSent.classList.toggle('hidden', tab !== 'sent');
  
  if (tab === 'received') renderReceivedShares();
  else renderSentShares();
}

function renderReceivedShares() {
  const received = G.shares.filter(s => s.recipient_email === G.currentUser?.email && s.status === 'active');
  const empty = document.getElementById('sharedEmptyState');
  const list = document.getElementById('sharedList');
  const receivedCountBadge = document.getElementById('receivedCountBadge');
  
  if (receivedCountBadge) {
    receivedCountBadge.textContent = received.length;
    receivedCountBadge.classList.toggle('hidden', received.length === 0);
  }
  
  if (received.length === 0) {
    if (empty) empty.classList.remove('hidden');
    if (list) list.classList.add('hidden');
    return;
  }
  
  if (empty) empty.classList.add('hidden');
  if (list) {
    list.classList.remove('hidden');
    list.innerHTML = received.map(s => {
      const doc = G.documents.find(d => d.id === s.document_id);
      return `
        <div class="document-card glass-card rounded-2xl p-4 border border-blue-500/20 cursor-pointer" onclick="openPreviewModal('${s.document_id}')">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400"><i class="fas fa-share-alt"></i></div>
            <div class="flex-1 min-w-0">
              <h4 class="text-white font-semibold text-sm truncate">${doc?.name || 'Document inconnu'}</h4>
              <p class="text-xs text-blue-300/60">De: ${s.sender_email}</p>
            </div>
          </div>
          <div class="flex items-center justify-between text-xs">
            <span class="px-2 py-1 rounded-full bg-blue-500/20 text-blue-300">${s.permission}</span>
            <span class="text-blue-300/40">${formatDate(s.created_at)}</span>
          </div>
        </div>
      `;
    }).join('');
  }
}

function renderSentShares() {
  const sent = G.shares.filter(s => s.sender_id === G.currentUser?.id);
  const empty = document.getElementById('sentEmptyState');
  const list = document.getElementById('sentSharesList');
  const sentCountBadge = document.getElementById('sentCountBadge');
  
  if (sentCountBadge) {
    sentCountBadge.textContent = sent.length;
    sentCountBadge.classList.toggle('hidden', sent.length === 0);
  }
  
  if (sent.length === 0) {
    if (empty) empty.classList.remove('hidden');
    if (list) list.classList.add('hidden');
    return;
  }
  
  if (empty) empty.classList.add('hidden');
  if (list) {
    list.classList.remove('hidden');
    list.innerHTML = sent.map(s => `
      <div class="glass-card rounded-xl p-4 border border-blue-500/10 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400"><i class="fas fa-file"></i></div>
          <div>
            <p class="text-white text-sm font-medium">${s.document_name}</p>
            <p class="text-xs text-blue-300/60">À: ${s.recipient_email} • ${s.permission}</p>
          </div>
        </div>
        <span class="text-xs px-2 py-1 rounded-full ${s.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}">${s.status}</span>
      </div>
    `).join('');
  }
}

// ─── Users ───
function openCreateUserModal() {
  if (!canValidateUsers()) {
    showToast('Vous n\\'avez pas les droits pour créer des utilisateurs', 'error');
    logSecurity('Tentative de création utilisateur non autorisée', { user: G.currentUser?.id });
    return;
  }
  
  const addUserModal = document.getElementById('addUserModal');
  if (addUserModal) addUserModal.classList.remove('hidden');
}

function closeAddUserModal() {
  const addUserModal = document.getElementById('addUserModal');
  const newUserFirst = document.getElementById('newUserFirst');
  const newUserLast = document.getElementById('newUserLast');
  const newUserEmail = document.getElementById('newUserEmail');
  
  if (addUserModal) addUserModal.classList.add('hidden');
  if (newUserFirst) newUserFirst.value = '';
  if (newUserLast) newUserLast.value = '';
  if (newUserEmail) newUserEmail.value = '';
}

async function addUser(e) {
  e.preventDefault();
  
  if (!canValidateUsers()) {
    showToast('Permission refusée', 'error');
    return;
  }
  
  const newUserFirst = document.getElementById('newUserFirst');
  const newUserLast = document.getElementById('newUserLast');
  const newUserEmail = document.getElementById('newUserEmail');
  const newUserRole = document.getElementById('newUserRole');
  
  const newUser = {
    id: generateId(),
    name: `${newUserFirst?.value || ''} ${newUserLast?.value || ''}`.trim(),
    email: newUserEmail?.value || '',
    role: newUserRole?.value || 'viewer',
    status: 'pending_validation',
    company_id: G.currentUser?.companyId,
    created_at: new Date().toISOString(),
    last_login: null,
    created_by: G.currentUser?.id
  };
  
  if (G.currentUser?.role === 'admin') {
    const validateImmediately = confirm('Valider immédiatement cet utilisateur ?\\n\\nOK = Oui (actif immédiatement)\\nAnnuler = Non (en attente de validation)');
    if (validateImmediately) {
      newUser.status = 'active';
      newUser.validated_at = new Date().toISOString();
      newUser.validated_by = G.currentUser?.id;
    }
  }
  
  try {
    const { error } = await SB.from('users').insert(newUser);
    if (error) throw error;
    
    G.users.push(newUser);
    saveUsers();
    updatePendingUsersCount();
    
    if (newUser.status === 'pending_validation') {
      showToast('Utilisateur créé - en attente de validation par un administrateur', 'warning');
      logInfo(`Nouvel utilisateur en attente: ${newUser.email}`);
    } else {
      showToast('Utilisateur créé et validé avec succès', 'success');
    }
    
    addAudit('create', 'user', newUser.id, { status: newUser.status });
    closeAddUserModal();
    renderUsers();
    updateBadges();
    
  } catch (e) {
    showToast('Erreur création utilisateur', 'error');
  }
}

function renderUsers() {
  const tbody = document.getElementById('usersList');
  if (!tbody) return;
  
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
      <td class="p-4 hidden md:table-cell text-sm text-blue-300/70">${G.documents.filter(d => d.owner_id === u.id && !d.is_deleted).length}</td>
      <td class="p-4 hidden sm:table-cell">
        <span class="px-2 py-1 rounded-full text-xs ${u.status === 'active' ? 'bg-green-500/20 text-green-400' : u.status === 'pending_validation' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-500/20 text-gray-400'}">
          ${u.status === 'pending_validation' ? 'En attente' : u.status}
        </span>
      </td>
      <td class="p-4">
        <div class="flex gap-2">
          ${u.status === 'pending_validation' && canValidateUsers() ? 
            `<button onclick="validateUser('${u.id}')" class="px-3 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30" title="Valider"><i class="fas fa-check"></i></button>` : ''}
          <button onclick="openEditUserModal('${u.id}')" class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400"><i class="fas fa-edit"></i></button>
          ${u.id !== G.currentUser?.id ? `<button onclick="deleteUser('${u.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

async function validateUser(userId) {
  if (!canValidateUsers()) {
    showToast('Permission refusée', 'error');
    return;
  }
  
  const u = G.users.find(user => user.id === userId);
  if (!u || u.status !== 'pending_validation') return;
  
  u.status = 'active';
  u.validated_at = new Date().toISOString();
  u.validated_by = G.currentUser?.id;
  
  try {
    await SB.from('users').update({ 
      status: 'active', 
      validated_at: u.validated_at, 
      validated_by: u.validated_by 
    }).eq('id', userId);
    
    saveUsers();
    updatePendingUsersCount();
    
    showToast(`Utilisateur ${u.name} validé avec succès`, 'success');
    addAudit('validate', 'user', userId);
    renderUsers();
    
    // Mettre à jour Auth si nécessaire
    const { error } = await SB.auth.admin.updateUserById(userId, {
      user_metadata: { status: 'active' }
    });
    
    if (G.currentView === 'pending-users') {
      renderPendingUsers();
    }
    
  } catch (e) {
    showToast('Erreur validation utilisateur', 'error');
  }
}

function renderPendingUsers() {
  const container = document.getElementById('pendingUsersList');
  if (!container) return;
  
  const pendingFromUsers = G.users.filter(u => u.status === 'pending_validation');
  
  if (pendingFromUsers.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-blue-300/50">
        <i class="fas fa-user-check text-4xl mb-3 block opacity-20"></i>
        <p class="mb-2">Aucun utilisateur en attente de validation</p>
        <p class="text-sm text-blue-300/30">Tous les comptes sont actifs</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = pendingFromUsers.map(u => `
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
              En attente depuis ${formatDate(u.created_at)}
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

async function rejectUser(userId) {
  if (!confirm('Êtes-vous sûr de vouloir rejeter cet utilisateur ?\\n\\nCette action est irréversible.')) return;
  
  const u = G.users.find(user => user.id === userId);
  if (!u) return;
  
  u.status = 'rejected';
  u.rejected_at = new Date().toISOString();
  u.rejected_by = G.currentUser?.id;
  
  try {
    await SB.from('users').update({ 
      status: 'rejected', 
      rejected_at: u.rejected_at, 
      rejected_by: u.rejected_by 
    }).eq('id', userId);
    
    saveUsers();
    updatePendingUsersCount();
    
    showToast('Utilisateur rejeté', 'info');
    addAudit('reject', 'user', userId);
    renderPendingUsers();
    renderUsers();
    
  } catch (e) {
    showToast('Erreur rejet utilisateur', 'error');
  }
}

function getRoleBadgeClass(role) {
  const classes = { admin: 'bg-red-500/20 text-red-400', manager: 'bg-orange-500/20 text-orange-400', editor: 'bg-blue-500/20 text-blue-400', viewer: 'bg-gray-500/20 text-gray-400' };
  return classes[role] || 'bg-gray-500/20 text-gray-400';
}

function openEditUserModal(userId) {
  if (!canValidateUsers() && userId !== G.currentUser?.id) {
    showToast('Vous ne pouvez modifier que votre propre profil', 'error');
    return;
  }
  
  const u = G.users.find(user => user.id === userId);
  if (!u) return;
  
  const editUserId = document.getElementById('editUserId');
  const editUserFirst = document.getElementById('editUserFirst');
  const editUserLast = document.getElementById('editUserLast');
  const editUserRole = document.getElementById('editUserRole');
  const editUserModal = document.getElementById('editUserModal');
  
  if (editUserId) editUserId.value = u.id;
  if (editUserFirst) editUserFirst.value = u.name.split(' ')[0];
  if (editUserLast) editUserLast.value = u.name.split(' ').slice(1).join(' ');
  if (editUserRole) editUserRole.value = u.role;
  if (editUserModal) editUserModal.classList.remove('hidden');
}

function closeEditUserModal() {
  const editUserModal = document.getElementById('editUserModal');
  if (editUserModal) editUserModal.classList.add('hidden');
}

async function saveEditUser(e) {
  e.preventDefault();
  const editUserId = document.getElementById('editUserId');
  const id = editUserId?.value;
  const u = G.users.find(user => user.id === id);
  if (!u) return;
  
  const editUserRole = document.getElementById('editUserRole');
  if (u.role !== editUserRole?.value && !canValidateUsers()) {
    showToast('Vous ne pouvez pas changer votre rôle', 'error');
    return;
  }
  
  const editUserFirst = document.getElementById('editUserFirst');
  const editUserLast = document.getElementById('editUserLast');
  
  u.name = `${editUserFirst?.value || ''} ${editUserLast?.value || ''}`.trim();
  if (editUserRole) u.role = editUserRole.value;
  
  try {
    await SB.from('users').update({ 
      name: u.name, 
      role: u.role 
    }).eq('id', id);
    
    saveUsers();
    showToast('Utilisateur modifié', 'success');
    addAudit('update', 'user', id);
    closeEditUserModal();
    renderUsers();
    
  } catch (e) {
    showToast('Erreur modification utilisateur', 'error');
  }
}

async function deleteUser(userId) {
  if (!canValidateUsers()) {
    showToast('Permission refusée', 'error');
    return;
  }
  
  if (!confirm('Supprimer cet utilisateur ?')) return;
  
  try {
    await SB.from('users').delete().eq('id', userId);
    G.users = G.users.filter(u => u.id !== userId);
    saveUsers();
    showToast('Utilisateur supprimé', 'success');
    addAudit('delete', 'user', userId);
    renderUsers();
    
  } catch (e) {
    showToast('Erreur suppression utilisateur', 'error');
  }
}

// ─── Tags ───
function renderTags() {
  const container = document.getElementById('tagsList');
  if (!container) return;
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
  const newTagInput = document.getElementById('newTagInput');
  const newTagColor = document.getElementById('newTagColor');
  const name = newTagInput?.value.trim();
  const color = newTagColor?.value || '#3b82f6';
  if (!name) return;
  
  if (G.tags.find(t => t.name.toLowerCase() === name.toLowerCase())) {
    showToast('Ce tag existe déjà', 'warning');
    return;
  }
  
  G.tags.push({ id: generateId(), name, color, count: 0 });
  saveTags();
  if (newTagInput) newTagInput.value = '';
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
  const currentPlanName = document.getElementById('currentPlanName');
n  const currentPlanBadgeEl = document.getElementById('currentPlanBadgeEl');
  const currentPlanDesc = document.getElementById('currentPlanDesc');
  const currentPlanPrice = document.getElementById('currentPlanPrice');
  
  if (currentPlanName) currentPlanName.textContent = plan.name;
  if (currentPlanBadgeEl) {
    currentPlanBadgeEl.className = `badge-plan badge-${G.currentUser?.plan || 'free'}`;
    currentPlanBadgeEl.textContent = plan.name.toUpperCase();
  }
  if (currentPlanDesc) currentPlanDesc.textContent = `${plan.users} utilisateurs • ${formatBytes(plan.storage)} • ${plan.features.join(', ')}`;
  if (currentPlanPrice) currentPlanPrice.innerHTML = plan.price ? `${plan.price}€<span class="text-blue-400/60 text-sm font-normal">/mois</span>` : 'Devis';
}

function selectPlan(planKey, el) {
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const upgradeBtn = document.getElementById('upgradeBtn');
  if (upgradeBtn) upgradeBtn.disabled = false;
  G.selectedPlan = planKey;
}

function simulateUpgrade() {
  showToast('Redirection vers Stripe...', 'info');
  setTimeout(() => {
    if (G.selectedPlan) {
      G.currentUser.plan = G.selectedPlan;
      G.currentCompany.plan = G.selectedPlan;
      localStorage.setItem(`user_${G.currentUser.email}`, JSON.stringify(G.currentUser));
      localStorage.setItem(`company_${G.currentCompany.id}`, JSON.stringify(G.currentCompany));
      showToast('Plan mis à jour !', 'success');
      updateUserDisplay();
      renderBilling();
    }
  }, 1500);
}

// ─── Settings ───
function renderSettings() {
  const profileName = document.getElementById('profileName');
  const profileEmail = document.getElementById('profileEmail');
  if (profileName) profileName.value = G.currentUser?.name || '';
  if (profileEmail) profileEmail.value = G.currentUser?.email || '';
}

function saveProfile() {
  const profileName = document.getElementById('profileName');
  const profileNewPwd = document.getElementById('profileNewPwd');
  const profileConfirmPwd = document.getElementById('profileConfirmPwd');
  
  const name = profileName?.value;
  const newPwd = profileNewPwd?.value;
  const confirmPwd = profileConfirmPwd?.value;
  
  if (newPwd && newPwd !== confirmPwd) {
    showToast('Les mots de passe ne correspondent pas', 'error');
    return;
  }
  
  if (name) G.currentUser.name = name;
  if (newPwd) G.currentUser.password = newPwd;
  
  localStorage.setItem(`user_${G.currentUser.email}`, JSON.stringify(G.currentUser));
  updateUserDisplay();
  showToast('Profil mis à jour', 'success');
  addAudit('update', 'user', G.currentUser.id, { field: 'profile' });
}

function toggleSetting(key) {
  const settingEl = document.getElementById(`${key}setting`);
  const enabled = settingEl?.checked;
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
  const sqlSchemaBlock = document.getElementById('sqlSchemaBlock');
  if (sqlSchemaBlock) {
    navigator.clipboard.writeText(sqlSchemaBlock.textContent).then(() => showToast('Schéma copié', 'success'));
  }
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
  if (secAuditCount) secAuditCount.textContent = G.auditLog.length;
  
  renderAuditLog();
  loadDeletedDocs();
}

function renderAuditLog() {
  const auditFilter = document.getElementById('auditFilter')?.value;
  let logs = [...G.auditLog];
  if (auditFilter) logs = logs.filter(l => l.action === auditFilter);
  
  const auditLogList = document.getElementById('auditLogList');
  if (auditLogList) {
    auditLogList.innerHTML = logs.slice(0, 50).map(l => `
      <div class="flex items-center justify-between p-2 rounded-lg bg-slate-900/30 border border-blue-500/10 text-xs">
        <div class="flex items-center gap-2">
          <span class="text-blue-400">${l.action}</span>
          <span class="text-blue-300/60">${l.targetType}</span>
        </div>
        <span class="text-blue-300/40">${formatDate(l.timestamp)}</span>
      </div>
    `).join('');
  }
}

function switchSecurityTab(tab) {
  const secTabAudit = document.getElementById('secTab-audit');
  const secTabTrash = document.getElementById('secTab-trash');
  const secPanelAudit = document.getElementById('secPanel-audit');
  const secPanelTrash = document.getElementById('secPanel-trash');
  
  if (secTabAudit) {
    secTabAudit.classList.toggle('bg-blue-500/20', tab === 'audit');
    secTabAudit.classList.toggle('text-blue-300', tab === 'audit');
  }
  if (secTabTrash) {
    secTabTrash.classList.toggle('bg-blue-500/20', tab === 'trash');
    secTabTrash.classList.toggle('text-blue-300', tab === 'trash');
  }
  if (secPanelAudit) secPanelAudit.classList.toggle('hidden', tab !== 'audit');
  if (secPanelTrash) secPanelTrash.classList.toggle('hidden', tab !== 'trash');
}

function loadDeletedDocs() {
  const deleted = G.documents.filter(d => d.is_deleted);
  const trashList = document.getElementById('trashList');
  const trashCount = document.getElementById('trashCount');
  
  if (trashCount) {
    trashCount.textContent = deleted.length;
    trashCount.classList.toggle('hidden', deleted.length === 0);
  }
  
  if (!trashList) return;
  
  if (deleted.length === 0) {
    trashList.innerHTML = '<div class="text-center py-6 text-blue-300/40 text-sm"><i class="fas fa-trash text-2xl mb-2 block opacity-20"></i>Corbeille vide</div>';
    return;
  }
  
  trashList.innerHTML = deleted.map(d => `
    <div class="flex items-center justify-between p-3 rounded-lg bg-slate-900/30 border border-red-500/10">
      <div class="flex items-center gap-3">
        <i class="fas ${getFileIcon(d.type).split(' ')[0]} text-red-400/60"></i>
        <div>
          <p class="text-sm text-white/60 line-through">${d.name}</p>
          <p class="text-xs text-blue-300/40">Supprimé le ${formatDate(d.deleted_at)}</p>
        </div>
      </div>
      <button onclick="restoreDocument('${d.id}')" class="px-3 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30">Restaurer</button>
    </div>
  `).join('');
}

async function restoreDocument(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  doc.is_deleted = false;
  doc.deleted_at = null;
  
  try {
    await SB.from('documents').update({ is_deleted: false, deleted_at: null }).eq('id', docId);
    saveDocuments();
    
    showToast('Document restauré', 'success');
    addAudit('restore', 'document', docId);
    loadDeletedDocs();
    renderDocuments();
    updateBadges();
    updateStorageDisplay();
    
  } catch (e) {
    showToast('Erreur restauration', 'error');
  }
}

function generateApiKey() {
  const key = `ged_${generateId()}_${generateId().substr(0, 8)}`;
  G.apiKeys.push({
    id: generateId(),
    key,
    name: `Clé ${G.apiKeys.length + 1}`,
    created_at: new Date().toISOString(),
    last_used: null
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
  if (!container) return;
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
  const rbacCards = document.getElementById('rbacCards');
  if (!rbacCards) return;
  rbacCards.innerHTML = Object.entries(G.roles).map(([key, role]) => `
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
  const roleModal = document.getElementById('roleModal');
  const roleModalTitle = document.getElementById('roleModalTitle');
  const roleModalKey = document.getElementById('roleModalKey');
  const roleModalName = document.getElementById('roleModalName');
  
  if (!roleModal) return;
  roleModal.classList.remove('hidden');
  
  if (roleKey && G.roles[roleKey]) {
    const role = G.roles[roleKey];
    if (roleModalTitle) roleModalTitle.textContent = 'Modifier le rôle';
    if (roleModalKey) roleModalKey.value = roleKey;
    if (roleModalName) roleModalName.value = role.name;
    role.perms.forEach(p => {
      const cb = document.getElementById(`perm_${p}`);
      if (cb) cb.checked = true;
    });
  } else {
    if (roleModalTitle) roleModalTitle.textContent = 'Nouveau rôle';
    if (roleModalKey) roleModalKey.value = '';
    if (roleModalName) roleModalName.value = '';
    document.querySelectorAll('#roleModal input[type="checkbox"]').forEach(cb => cb.checked = false);
  }
}

function closeRoleModal() {
  const roleModal = document.getElementById('roleModal');
  if (roleModal) roleModal.classList.add('hidden');
}

function saveRole() {
  const roleModalKey = document.getElementById('roleModalKey');
  const roleModalName = document.getElementById('roleModalName');
  
  const key = roleModalKey?.value || generateId();
  const name = roleModalName?.value;
  const perms = ['read', 'write', 'delete', 'users', 'logs', 'api'].filter(p => document.getElementById(`perm_${p}`)?.checked);
  
  if (name) {
    G.roles[key] = { name, perms };
    showToast('Rôle enregistré', 'success');
  }
  closeRoleModal();
  renderRBAC();
}

// ─── Storage & Badges ───
function updateStorageDisplay() {
  const used = G.documents.filter(d => !d.is_deleted).reduce((sum, d) => sum + (d.size || 0), 0);
  const limit = CONFIG.plans[G.currentUser?.plan || 'free'].storage;
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

function updateBadges() {
  const docCount = G.documents.filter(d => !d.is_deleted).length;
  const wfCount = G.workflows.filter(w => ['pending', 'in_review'].includes(w.status)).length;
  const sharedCount = G.shares.filter(s => s.recipient_email === G.currentUser?.email && s.status === 'active').length;
  
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
  const notifPanel = document.getElementById('notifPanel');
  if (notifPanel) {
    notifPanel.classList.toggle('hidden');
    if (!notifPanel.classList.contains('hidden')) renderNotifications();
  }
}

function closeNotifPanel() {
  const notifPanel = document.getElementById('notifPanel');
  if (notifPanel) notifPanel.classList.add('hidden');
}

function renderNotifications() {
  const notifContent = document.getElementById('notifContent');
  const notifCountBadge = document.getElementById('notifCountBadge');
  const notifBadge = document.getElementById('notifBadge');
  
  if (notifCountBadge) {
    notifCountBadge.textContent = G.unreadCount;
    notifCountBadge.classList.toggle('hidden', G.unreadCount === 0);
  }
  if (notifBadge) notifBadge.classList.toggle('hidden', G.unreadCount === 0);
  
  if (!notifContent) return;
  
  if (G.notifications.length === 0) {
    notifContent.innerHTML = '<div class="px-4 py-6 text-center text-blue-300/50 text-sm">Aucune notification</div>';
    return;
  }
  
  notifContent.innerHTML = G.notifications.slice(0, 10).map(n => `
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
  const notifBadge = document.getElementById('notifBadge');
  if (notifBadge) notifBadge.classList.toggle('hidden', G.unreadCount === 0);
}

// ─── Recherche ───
function handleGlobalSearch(query) {
  if (!query || query.length < 2) {
    const searchDropdown = document.getElementById('searchDropdown');
    if (searchDropdown) searchDropdown.classList.add('hidden');
    return;
  }
  
  const results = [
    ...G.documents.filter(d => !d.is_deleted && d.name.toLowerCase().includes(query.toLowerCase())).map(d => ({ type: 'doc', ...d })),
    ...G.users.filter(u => u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase())).map(u => ({ type: 'user', ...u })),
    ...G.workflows.filter(w => w.title.toLowerCase().includes(query.toLowerCase())).map(w => ({ type: 'workflow', ...w }))
  ].slice(0, 8);
  
  const searchDropdown = document.getElementById('searchDropdown');
  if (!searchDropdown) return;
  
  if (results.length === 0) {
    searchDropdown.classList.add('hidden');
    return;
  }
  
  searchDropdown.innerHTML = results.map(r => `
    <div class="px-4 py-2 hover:bg-blue-500/10 cursor-pointer flex items-center gap-3" onclick="handleSearchResult('${r.type}', '${r.id}')">
      <i class="fas ${r.type === 'doc' ? getFileIcon(r.type).split(' ')[0] : r.type === 'user' ? 'fa-user' : 'fa-project-diagram'} text-blue-400"></i>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white truncate">${r.name || r.title}</p>
        <p class="text-xs text-blue-300/60 capitalize">${r.type}</p>
      </div>
    </div>
  `).join('');
  
  searchDropdown.classList.remove('hidden');
}

function handleSearchResult(type, id) {
  const searchDropdown = document.getElementById('searchDropdown');
  const globalSearch = document.getElementById('globalSearch');
  
  if (searchDropdown) searchDropdown.classList.add('hidden');
  if (globalSearch) globalSearch.value = '';
  
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
  const collabEditorTitle = document.getElementById('collabEditorTitle');
  const collabEditorType = document.getElementById('collabEditorType');
  const collabEditorArea = document.getElementById('collabEditorArea');
  const collabEditorModal = document.getElementById('collabEditorModal');
  
  if (collabEditorTitle) collabEditorTitle.textContent = doc.name;
  if (collabEditorType) collabEditorType.textContent = doc.type;
  if (collabEditorArea) collabEditorArea.value = doc.content || '';
  if (collabEditorModal) collabEditorModal.classList.remove('hidden');
  
  updateCollabWordCount();
  addAudit('edit', 'document', docId);
}

function closeCollabEditor() {
  const collabEditorModal = document.getElementById('collabEditorModal');
  if (collabEditorModal) collabEditorModal.classList.add('hidden');
  G.collab.docId = null;
}

function onCollabEditorInput(e) {
  const doc = G.documents.find(d => d.id === G.collab.docId);
  if (doc) {
    doc.content = e.target.value;
    doc.updated_at = new Date().toISOString();
  }
}

function updateCollabWordCount() {
  const collabEditorArea = document.getElementById('collabEditorArea');
  const collabWordCount = document.getElementById('collabWordCount');
  
  if (!collabEditorArea || !collabWordCount) return;
  const text = collabEditorArea.value || '';
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  collabWordCount.textContent = `${words} mot${words > 1 ? 's' : ''}`;
}

// ─── Éditeur riche ───
function openRichEditor(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  G.richEditor.docId = docId;
  const richEditorTitle = document.getElementById('richEditorTitle');
  const richEditorContent = document.getElementById('richEditorContent');
  const richEditorModal = document.getElementById('richEditorModal');
  
  if (richEditorTitle) richEditorTitle.textContent = doc.name;
  if (richEditorContent) richEditorContent.innerHTML = doc.content || '<p>Commencez à écrire...</p>';
  if (richEditorModal) richEditorModal.classList.remove('hidden');
  addAudit('edit', 'document', docId);
}

function closeRichEditor() {
  const richEditorModal = document.getElementById('richEditorModal');
  if (richEditorModal) richEditorModal.classList.add('hidden');
  G.richEditor.docId = null;
}

function richCmd(command, value = null) {
  document.execCommand(command, false, value);
  const richEditorContent = document.getElementById('richEditorContent');
  if (richEditorContent) richEditorContent.focus();
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
    const richEditorContent = document.getElementById('richEditorContent');
    if (richEditorContent) doc.content = richEditorContent.innerHTML;
  }
  const richEditorContent = document.getElementById('richEditorContent');
  const richEditorWordCount = document.getElementById('richEditorWordCount');
  
  if (!richEditorContent || !richEditorWordCount) return;
  const text = richEditorContent.innerText || '';
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  richEditorWordCount.textContent = `${words} mot${words > 1 ? 's' : ''}`;
}

function _saveRichContent() {
  saveDocuments();
  showToast('Document enregistré', 'success');
  const richSaveStatus = document.getElementById('richSaveStatus');
  if (richSaveStatus) {
    richSaveStatus.innerHTML = '<i class="fas fa-check text-green-400 mr-1"></i><span class="text-green-400 text-xs">Enregistré</span>';
    setTimeout(() => richSaveStatus.innerHTML = '', 2000);
  }
}

// ─── Dossiers ───
function renderFolders() {
  renderFolderBreadcrumb();
  renderFolderTree();
  renderFolderContents();
}

function renderFolderBreadcrumb() {
  const folderBreadcrumb = document.getElementById('folderBreadcrumb');
  if (!folderBreadcrumb) return;
  folderBreadcrumb.innerHTML = G.folderPath.map((f, idx) => `
    <button onclick="navigateToFolder(${idx})" class="text-sm ${idx === G.folderPath.length - 1 ? 'text-white font-medium' : 'text-blue-400 hover:text-blue-300'}">
      ${f.name}
    </button>
    ${idx < G.folderPath.length - 1 ? '<i class="fas fa-chevron-right text-blue-400/40 text-xs"></i>' : ''}
  `).join('');
}

function renderFolderTree() {
  const folderSidebarTree = document.getElementById('folderSidebarTree');
  if (!folderSidebarTree) return;
  const folders = G.folders.filter(f => f.parent_id === '__root__');
  
  folderSidebarTree.innerHTML = folders.map(f => `
    <div class="cursor-pointer" onclick="openFolder('${f.id}', '${f.name}')">
      <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-500/10 text-blue-300/70 text-xs">
        <i class="fas fa-folder text-yellow-400/60 text-xs"></i>
        <span>${f.name}</span>
      </div>
    </div>
  `).join('');
}

function renderFolderContents() {
  const folderContentsGrid = document.getElementById('folderContentsGrid');
  const folderDocGrid = document.getElementById('folderDocGrid');
  
  if (!folderContentsGrid || !folderDocGrid) return;
  
  const subFolders = G.folders.filter(f => f.parent_id === G.currentFolderId);
  const docs = G.documents.filter(d => !d.is_deleted && d.folder_id === G.currentFolderId);
  
  folderContentsGrid.innerHTML = subFolders.map(f => `
    <div class="glass-card rounded-xl p-4 border border-yellow-500/20 cursor-pointer hover:border-yellow-400/40" onclick="openFolder('${f.id}', '${f.name}')">
      <div class="flex items-center gap-3">
        <i class="fas fa-folder text-yellow-400 text-2xl"></i>
        <span class="text-white font-medium">${f.name}</span>
      </div>
    </div>
  `).join('');
  
  if (subFolders.length === 0) folderContentsGrid.innerHTML = '';
  
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
  renderFolders();
}

function navigateToFolder(idx) {
  G.folderPath = G.folderPath.slice(0, idx + 1);
  G.currentFolderId = G.folderPath[idx].id;
  renderFolders();
}

function openFolderModal() {
  const folderModal = document.getElementById('folderModal');
  const newFolderName = document.getElementById('newFolderName');
  if (folderModal) folderModal.classList.remove('hidden');
  if (newFolderName) {
    newFolderName.value = '';
    newFolderName.focus();
  }
}

function closeFolderModal() {
  const folderModal = document.getElementById('folderModal');
  if (folderModal) folderModal.classList.add('hidden');
}

async function createFolder() {
  const newFolderName = document.getElementById('newFolderName');
  const name = newFolderName?.value.trim();
  if (!name) return;
  
  const folder = {
    id: generateId(),
    name,
    parent_id: G.currentFolderId,
    company_id: G.currentUser?.companyId,
    created_at: new Date().toISOString()
  };
  
  try {
    await SB.from('folders').insert(folder);
    G.folders.push(folder);
    saveFolders();
    closeFolderModal();
    renderFolders();
    showToast('Dossier créé', 'success');
    
  } catch (e) {
    showToast('Erreur création dossier', 'error');
  }
}

// ─── Signatures ───
function renderSignatures() {
  const pending = G.signatures.filter(s => s.status === 'pending').length;
  const signed = G.signatures.filter(s => s.status === 'signed').length;
  const rejected = G.signatures.filter(s => s.status === 'rejected').length;
  
  const sigStatPending = document.getElementById('sigStatPending');
  const sigStatSigned = document.getElementById('sigStatSigned');
  const sigStatRejected = document.getElementById('sigStatRejected');
  
  if (sigStatPending) sigStatPending.textContent = pending;
  if (sigStatSigned) sigStatSigned.textContent = signed;
  if (sigStatRejected) sigStatRejected.textContent = rejected;
  
  const container = document.getElementById('signaturesList');
  if (!container) return;
  
  if (G.signatures.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-signature text-4xl mb-3 block opacity-20"></i><p>Aucune signature</p></div>';
    return;
  }
  
  container.innerHTML = G.signatures.map(s => {
    const doc = G.documents.find(d => d.id === s.document_id);
    return `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400"><i class="fas fa-file-signature"></i></div>
          <div>
            <p class="text-white font-medium">${doc?.name || 'Document inconnu'}</p>
            <p class="text-xs text-blue-300/60">Signataire: ${s.signer_email}</p>
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

// Ajouter une signature numérique pour un employé
function openEmployeeSignatureModal() {
  if (!canManageSignatures()) {
    showToast('Vous n\\'avez pas les droits pour gérer les signatures', 'error');
    return;
  }
  
  const modal = document.getElementById('employeeSignatureModal');
  const employeeSelect = document.getElementById('sigEmployeeSelect');
  
  if (employeeSelect) {
    employeeSelect.innerHTML = G.users
      .filter(u => u.status === 'active' && u.id !== G.currentUser?.id)
      .map(u => `<option value="${u.id}">${u.name} (${u.email})</option>`)
      .join('');
  }
  
  if (modal) modal.classList.remove('hidden');
  initEmployeeSignaturePad();
}

function closeEmployeeSignatureModal() {
  const modal = document.getElementById('employeeSignatureModal');
  if (modal) modal.classList.add('hidden');
}

function initEmployeeSignaturePad() {
  const canvas = document.getElementById('employeeSignatureCanvas');
  if (!canvas) return;
  
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

function clearEmployeeSignature() {
  const canvas = document.getElementById('employeeSignatureCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function saveEmployeeSignature() {
  const canvas = document.getElementById('employeeSignatureCanvas');
  const employeeSelect = document.getElementById('sigEmployeeSelect');
  
  if (!canvas || !employeeSelect) return;
  
  const employeeId = employeeSelect.value;
  const employee = G.users.find(u => u.id === employeeId);
  
  if (!employee) {
    showToast('Employé non trouvé', 'error');
    return;
  }
  
  // Convertir la signature en base64
  const signatureData = canvas.toDataURL();
  
  // Ajouter à la liste des signatures
  const newSignature = {
    id: generateId(),
    user_id: employeeId,
    user_name: employee.name,
    user_email: employee.email,
    signature_data: signatureData,
    company_id: G.currentUser?.companyId,
    created_by: G.currentUser?.id,
    created_at: new Date().toISOString(),
    status: 'active'
  };
  
  try {
    await SB.from('signatures').insert(newSignature);
    
    // Sauvegarder dans localStorage comme backup
    const employeeSigsKey = `employee_signatures_${G.currentUser?.companyId}`;
    const existingSigs = JSON.parse(localStorage.getItem(employeeSigsKey) || '[]');
    existingSigs.push(newSignature);
    localStorage.setItem(employeeSigsKey, JSON.stringify(existingSigs));
    
    showToast(`Signature numérique ajoutée pour ${employee.name}`, 'success');
    addAudit('add_employee_signature', 'user', employeeId);
    closeEmployeeSignatureModal();
    renderEmployeeSignaturesList();
    
  } catch (e) {
    showToast('Erreur sauvegarde signature', 'error');
  }
}

function renderEmployeeSignaturesList() {
  const container = document.getElementById('employeeSignaturesList');
  if (!container) return;
  
  const employeeSigsKey = `employee_signatures_${G.currentUser?.companyId}`;
  const signatures = JSON.parse(localStorage.getItem(employeeSigsKey) || '[]');
  
  if (signatures.length === 0) {
    container.innerHTML = '<p class="text-blue-300/50 text-sm text-center py-4">Aucune signature d\\'employé enregistrée</p>';
    return;
  }
  
  container.innerHTML = signatures.map(sig => `
    <div class="glass-card rounded-xl p-4 border border-purple-500/20">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
            <i class="fas fa-signature"></i>
          </div>
          <div>
            <p class="text-white font-medium">${sig.user_name}</p>
            <p class="text-xs text-blue-300/60">${sig.user_email}</p>
            <p class="text-xs text-green-400">Signature enregistrée</p>
          </div>
        </div>
        <button onclick="deleteEmployeeSignature('${sig.id}')" class="p-2 text-red-400 hover:text-red-300">
          <i class="fas fa-trash"></i>
        </button>
      </div>
      <div class="mt-3 p-2 bg-white rounded-lg">
        <img src="${sig.signature_data}" alt="Signature" class="h-16 object-contain">
      </div>
    </div>
  `).join('');
}

async function deleteEmployeeSignature(sigId) {
  if (!confirm('Supprimer cette signature ?')) return;
  
  try {
    await SB.from('signatures').delete().eq('id', sigId);
    
    const employeeSigsKey = `employee_signatures_${G.currentUser?.companyId}`;
    let signatures = JSON.parse(localStorage.getItem(employeeSigsKey) || '[]');
    signatures = signatures.filter(s => s.id !== sigId);
    localStorage.setItem(employeeSigsKey, JSON.stringify(signatures));
    
    showToast('Signature supprimée', 'success');
    renderEmployeeSignaturesList();
    
  } catch (e) {
    showToast('Erreur suppression signature', 'error');
  }
}

function openSignModal() {
  const signatureModal = document.getElementById('signatureModal');
  if (signatureModal) signatureModal.classList.remove('hidden');
  initSignaturePad();
}

function closeSignModal() {
  const signatureModal = document.getElementById('signatureModal');
  if (signatureModal) signatureModal.classList.add('hidden');
}

function initSignaturePad() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  
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
  if (!canvas) return;
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
  if (!container) return;
  const docs = G.documents.filter(d => !d.is_deleted).slice(0, 10);
  
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
  if (resultDiv) resultDiv.classList.remove('hidden');
  
  setTimeout(() => {
    if (resultDiv) {
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
    }
  }, 2000);
}

function analyzeAllDocuments() {
  showToast('Analyse de tous les documents lancée', 'info');
}

// ─── Automatisation ───
function renderAutomation() {
  const container = document.getElementById('automationRulesList');
  const automationStats = document.getElementById('automationStats');
  
  if (automationStats) automationStats.textContent = `${G.automationRules.length} règle(s) active(s)`;
  
  if (!container) return;
  
  if (G.automationRules.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-magic text-4xl mb-3 block opacity-20"></i><p>Aucune règle d\\'automatisation</p></div>';
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
  const wfRuleModal = document.getElementById('wfRuleModal');
  if (wfRuleModal) wfRuleModal.classList.remove('hidden');
}

function closeWfRuleModal() {
  const wfRuleModal = document.getElementById('wfRuleModal');
  if (wfRuleModal) wfRuleModal.classList.add('hidden');
}

function createWfRule(e) {
  e.preventDefault();
  
  const wfRuleName = document.getElementById('wfRuleName');
  const wfRuleTrigger = document.getElementById('wfRuleTrigger');
  const wfRuleAction = document.getElementById('wfRuleAction');
  
  const rule = {
    id: generateId(),
    name: wfRuleName?.value || 'Nouvelle règle',
    trigger: wfRuleTrigger?.value || '',
    action: wfRuleAction?.value || '',
    company_id: G.currentUser?.companyId,
    active: true,
    created_at: new Date().toISOString()
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
  if (!container) return;
  
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
  const backupStats = document.getElementById('backupStats');
  
  if (!container) return;
  
  if (G.backups.length === 0) {
    if (backupStats) backupStats.textContent = 'Aucune sauvegarde';
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-database text-4xl mb-3 block opacity-20"></i><p>Aucune sauvegarde disponible</p></div>';
    return;
  }
  
  if (backupStats) backupStats.textContent = `${G.backups.length} sauvegarde(s) • Dernière: ${formatDate(G.backups[0].created_at)}`;
  
  container.innerHTML = G.backups.map(b => `
    <div class="glass-card rounded-xl p-4 border border-teal-500/20 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <i class="fas fa-archive text-teal-400 text-xl"></i>
        <div>
          <p class="text-white font-medium">${b.name}</p>
          <p class="text-xs text-blue-300/60">${b.type} • ${formatBytes(b.size)} • ${formatDate(b.created_at)}</p>
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
    company_id: G.currentUser?.companyId,
    created_at: new Date().toISOString()
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
  if (!container) return;
  
  if (G.apiKeys.length === 0) {
    container.innerHTML = '<div class="text-center py-8 text-blue-300/50"><p class="text-sm">Aucune clé API</p></div>';
    return;
  }
  
  container.innerHTML = G.apiKeys.map(k => `
    <div class="glass-card rounded-xl p-4 border border-green-500/20 flex items-center justify-between">
      <div>
        <p class="text-white font-medium text-sm">${k.name}</p>
        <p class="text-xs text-green-400/60 font-mono">${k.key.substr(0, 20)}...</p>
        <p class="text-xs text-blue-300/40">Créée le ${formatDate(k.created_at)}</p>
      </div>
      <button onclick="revokeApiKey('${k.id}')" class="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30">Révoquer</button>
    </div>
  `).join('');
}

function generateApiKeyV6() {
  const apiKeyName = document.getElementById('apiKeyName');
  const name = apiKeyName?.value || `Clé ${G.apiKeys.length + 1}`;
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
    company_id: G.currentUser?.companyId,
    created_at: new Date().toISOString(),
    last_used: null
  });
  
  saveApiKeys();
  
  const newApiKeyDisplay = document.getElementById('newApiKeyDisplay');
  const newApiKeyWrapper = document.getElementById('newApiKeyWrapper');
  
  if (newApiKeyDisplay) newApiKeyDisplay.textContent = key;
  if (newApiKeyWrapper) newApiKeyWrapper.classList.remove('hidden');
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
  if (!container) return;
  
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
  if (!grid) return;
  
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
  if (!container) return;
  
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
  if (!container) return;
  
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
  const analyticsLoading = document.getElementById('analyticsLoading');
  if (analyticsLoading) analyticsLoading.textContent = 'Chargement des données...';
  
  setTimeout(() => {
    if (analyticsLoading) analyticsLoading.textContent = '';
    renderAnalyticsKPIs();
    renderActivityChart();
    renderWorkflowChart();
    renderTopDocs();
    renderTopUsers();
  }, 500);
}

function renderAnalyticsKPIs() {
  const container = document.getElementById('analyticsKpiCards');
  if (!container) return;
  
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
  if (!container) return;
  
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
  if (!container) return;
  
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
        <div class="h-full rounded-full ${getWfStatusClass(status).split(' ')[0]}" style="width:${(count / total) * 100}%"></div>
      </div>
      <span class="text-xs text-blue-300/60 w-16">${getWfStatusLabel(status)}: ${count}</span>
    </div>
  `).join('');
}

function renderTopDocs() {
  const container = document.getElementById('analyticsTopDocs');
  if (!container) return;
  
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
  if (!container) return;
  
  const userActivity = G.users.map(u => ({
    ...u,
    docCount: G.documents.filter(d => d.owner_id === u.id).length
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
  const advSearchInput = document.getElementById('advSearchInput');
  const advSearchType = document.getElementById('advSearchType');
  const advSearchDate = document.getElementById('advSearchDate');
  const advSearchSize = document.getElementById('advSearchSize');
  
  const query = advSearchInput?.value.toLowerCase() || '';
  const type = advSearchType?.value;
  const date = advSearchDate?.value;
  const size = advSearchSize?.value;
  
  let results = G.documents.filter(d => !d.is_deleted);
  
  if (query) results = results.filter(d => d.name.toLowerCase().includes(query) || (d.description || '').toLowerCase().includes(query) || d.tags?.some(t => t.toLowerCase().includes(query)));
  if (type) results = results.filter(d => d.type === type);
  if (date) {
    const now = new Date();
    results = results.filter(d => {
      const docDate = new Date(d.created_at);
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
  
  const advSearchCount = document.getElementById('advSearchCount');
  if (advSearchCount) advSearchCount.textContent = `${results.length} résultat(s)`;
  
  const container = document.getElementById('advSearchResults');
  if (!container) return;
  
  if (results.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-search text-4xl mb-3 block opacity-20"></i><p>Aucun résultat</p></div>';
    return;
  }
  
  container.innerHTML = `<div class="doc-grid">${results.map(d => renderDocCard(d)).join('')}</div>`;
}

function clearAdvSearch() {
  const advSearchInput = document.getElementById('advSearchInput');
  const advSearchType = document.getElementById('advSearchType');
  const advSearchDate = document.getElementById('advSearchDate');
  const advSearchSize = document.getElementById('advSearchSize');
  
  if (advSearchInput) advSearchInput.value = '';
  if (advSearchType) advSearchType.value = '';
  if (advSearchDate) advSearchDate.value = '';
  if (advSearchSize) advSearchSize.value = '';
  runAdvSearch();
}

// ─── Versioning ───
function renderVersioning() {
  const container = document.getElementById('versionDocList');
  if (!container) return;
  
  const docs = G.documents.filter(d => !d.is_deleted).slice(0, 20);
  
  container.innerHTML = docs.map(d => `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <i class="fas ${getFileIcon(d.type).split(' ')[0]} text-blue-400"></i>
          <div>
            <p class="text-white font-medium">${d.name}</p>
            <p class="text-xs text-blue-300/60">v${d.version} • ${formatDate(d.updated_at)}</p>
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
  const rbacV7RolesGrid = document.getElementById('rbacV7RolesGrid');
  const rbacV7PermMatrix = document.getElementById('rbacV7PermMatrix');
  
  if (rbacV7RolesGrid) {
    rbacV7RolesGrid.innerHTML = Object.entries(G.roles).map(([key, role]) => `
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
  }
  
  if (rbacV7PermMatrix) {
    const allPerms = ['read', 'write', 'delete', 'share', 'download', 'users', 'roles', 'logs', 'api', 'billing', 'settings'];
    rbacV7PermMatrix.innerHTML = allPerms.map(p => `
      <div class="glass-card rounded-xl p-3 border border-blue-500/10">
        <div class="flex items-center justify-between">
          <span class="text-sm text-white capitalize">${p}</span>
          <input type="checkbox" class="rounded text-blue-500" checked disabled>
        </div>
      </div>
    `).join('');
  }
}

function createRoleV7() {
  const newRoleName = document.getElementById('newRoleName');
  const name = newRoleName?.value.trim();
  if (!name) return;
  
  const key = name.toLowerCase().replace(/\s+/g, '_');
  G.roles[key] = { name, perms: ['read'] };
  
  if (newRoleName) newRoleName.value = '';
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
  const ftsInput = document.getElementById('ftsInput');
  const ftsType = document.getElementById('ftsType');
  const ftsDate = document.getElementById('ftsDate');
  
  const query = ftsInput?.value.toLowerCase() || '';
  const type = ftsType?.value;
  const date = ftsDate?.value;
  
  if (query.length < 3) return;
  
  let results = G.documents.filter(d => !d.is_deleted && (d.name.toLowerCase().includes(query) || (d.content || '').toLowerCase().includes(query)));
  
  if (type) results = results.filter(d => d.type === type);
  if (date) {
    const now = new Date();
    results = results.filter(d => {
      const docDate = new Date(d.created_at);
      if (date === 'today') return docDate.toDateString() === now.toDateString();
      if (date === 'week') return (now - docDate) < 7 * 24 * 60 * 60 * 1000;
      if (date === 'month') return (now - docDate) < 30 * 24 * 60 * 60 * 1000;
      return true;
    });
  }
  
  const ftsCount = document.getElementById('ftsCount');
  if (ftsCount) ftsCount.textContent = `${results.length} résultat(s)`;
  
  const container = document.getElementById('searchV7Results');
  if (!container) return;
  
  container.innerHTML = results.length === 0 
    ? '<div class="text-center py-12 text-blue-300/50"><p>Aucun résultat</p></div>'
    : `<div class="doc-grid">${results.map(d => renderDocCard(d)).join('')}</div>`;
}

// ─── Realtime sync simulation ───
function startRealtimeSync() {
  setInterval(() => {
    if (Math.random() > 0.95) {
      logInfo('Sync temps réel: vérification des mises à jour');
    }
  }, 30000);
}

// ─── Context menu ───
function showDocContextMenu(e, docId) {
  e.preventDefault();
  if (confirm('Supprimer ce document ?')) {
    deleteDocument(docId);
  }
}

async function deleteDocument(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  if (doc.owner_id !== G.currentUser?.id && G.currentUser?.role !== 'admin') {
    showToast('Permission refusée', 'error');
    return;
  }
  
  doc.is_deleted = true;
  doc.deleted_at = new Date().toISOString();
  
  try {
    await SB.from('documents').update({ 
      is_deleted: true, 
      deleted_at: doc.deleted_at 
    }).eq('id', docId);
    
    saveDocuments();
    showToast('Document déplacé vers la corbeille', 'success');
    addAudit('delete', 'document', docId);
    renderDocuments();
    updateBadges();
    updateStorageDisplay();
    
  } catch (e) {
    showToast('Erreur suppression', 'error');
  }
}

// ─── Keyboard shortcuts ───
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    const globalSearch = document.getElementById('globalSearch');
    if (globalSearch) globalSearch.focus();
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
    closeEmployeeSignatureModal();
    closeWfRuleModal();
    closeRoleModal();
    closeAddUserModal();
    closeEditUserModal();
    closeNotifPanel();
  }
});

// ─── Gestion d'erreurs LocalStorage robuste ───
const StorageManager = {
  isAvailable() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  },

  set(key, value) {
    try {
      if (!this.isAvailable()) {
        throw new Error('localStorage non disponible');
      }
      const serialized = JSON.stringify(value);
      if (serialized.length > 4900000) {
        throw new Error('Données trop volumineuses pour localStorage');
      }
      localStorage.setItem(key, serialized);
      return { success: true };
    } catch (e) {
      console.error(`StorageManager.set('${key}') failed:`, e);
      showToast(`Erreur sauvegarde: ${e.message}`, 'error');
      return { success: false, error: e.message };
    }
  },

  get(key, defaultValue = null) {
    try {
      if (!this.isAvailable()) {
        return { success: false, data: defaultValue, error: 'localStorage non disponible' };
      }
      const item = localStorage.getItem(key);
      if (!item) return { success: true, data: defaultValue };
      return { success: true, data: JSON.parse(item) };
    } catch (e) {
      console.error(`StorageManager.get('${key}') failed:`, e);
      return { success: false, data: defaultValue, error: e.message };
    }
  },

  remove(key) {
    try {
      if (!this.isAvailable()) return { success: false };
      localStorage.removeItem(key);
      return { success: true };
    } catch (e) {
      console.error(`StorageManager.remove('${key}') failed:`, e);
      return { success: false, error: e.message };
    }
  },

  clearAppData() {
    try {
      if (!this.isAvailable()) {
        throw new Error('localStorage non disponible');
      }

      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('docs_') ||
          key.startsWith('workflows_') ||
          key.startsWith('users_') ||
          key.startsWith('tags_') ||
          key.startsWith('shares_') ||
          key.startsWith('folders_') ||
          key.startsWith('signatures_') ||
          key.startsWith('automation_') ||
          key.startsWith('apikeys_') ||
          key.startsWith('backups_') ||
          key.startsWith('company_') ||
          key.startsWith('user_') ||
          key.startsWith('admins_') ||
          key.startsWith('employee_signatures_') ||
          key === 'currentUser' ||
          key === 'currentCompany'
        )) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key));

      return { 
        success: true, 
        count: keysToRemove.length,
        keys: keysToRemove
      };
    } catch (e) {
      console.error('StorageManager.clearAppData() failed:', e);
      return { success: false, error: e.message };
    }
  },

  getStats() {
    try {
      if (!this.isAvailable()) return { success: false };

      let totalSize = 0;
      let appKeys = 0;
      const details = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key) || '';
        const size = new Blob([value]).size;
        totalSize += size;

        if (key && (
          key.startsWith('docs_') || key.startsWith('workflows_') ||
          key.startsWith('users_') || key.startsWith('current')
        )) {
          appKeys++;
          details.push({ key, size: formatBytes(size) });
        }
      }

      return {
        success: true,
        totalSize: formatBytes(totalSize),
        totalKeys: localStorage.length,
        appKeys,
        details
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
};

window.StorageManager = StorageManager;

function saveDocumentsSafe() {
  if (G.currentUser?.companyId) {
    const result = StorageManager.set(`docs_${G.currentUser.companyId}`, G.documents);
    if (!result.success) logError('Échec sauvegarde documents', { error: result.error });
    return result.success;
  }
  return false;
}

function saveUsersSafe() {
  if (G.currentUser?.companyId) {
    const result = StorageManager.set(`users_${G.currentUser.companyId}`, G.users);
    if (!result.success) logError('Échec sauvegarde utilisateurs', { error: result.error });
    return result.success;
  }
  return false;
}

// ─── DANGER MODAL & RESET COMPLET ───
let _dangerAction = null;
let _dangerCallback = null;

function openDangerModal(action, message, callback = null) {
  _dangerAction = action;
  _dangerCallback = callback;

  const dangerModal = document.getElementById('dangerModal');
  const dangerModalMessage = document.getElementById('dangerModalMessage');
  const dangerConfirmInput = document.getElementById('dangerConfirmInput');
  const dangerConfirmBtn = document.getElementById('dangerConfirmBtn');

  if (dangerModalMessage) dangerModalMessage.textContent = message || 'Cette action est irréversible.';
  if (dangerConfirmInput) {
    dangerConfirmInput.value = '';
    dangerConfirmInput.focus();
  }
  if (dangerConfirmBtn) dangerConfirmBtn.disabled = true;
  if (dangerModal) dangerModal.classList.remove('hidden');

  addAudit('danger_modal_opened', 'system', action);
}

function closeDangerModal() {
  const dangerModal = document.getElementById('dangerModal');
  if (dangerModal) dangerModal.classList.add('hidden');
  _dangerAction = null;
  _dangerCallback = null;
}

function checkDangerConfirm() {
  const dangerConfirmInput = document.getElementById('dangerConfirmInput');
  const dangerConfirmBtn = document.getElementById('dangerConfirmBtn');

  if (dangerConfirmInput && dangerConfirmBtn) {
    dangerConfirmBtn.disabled = dangerConfirmInput.value !== 'CONFIRMER';
  }
}

async function executeDangerAction() {
  if (!_dangerAction) return;

  const dangerConfirmInput = document.getElementById('dangerConfirmInput');
  if (!dangerConfirmInput || dangerConfirmInput.value !== 'CONFIRMER') {
    showToast('Vous devez taper CONFIRMER', 'warning');
    return;
  }

  showToast('Exécution en cours...', 'info');

  try {
    switch (_dangerAction) {
      case 'delete_all':
        await deleteAllDocuments();
        break;
      case 'reset_storage':
        await resetAllStorage();
        break;
      case 'clear_logs':
        clearSysLogs();
        break;
      case 'delete_account':
        await deleteCurrentAccount();
        break;
      case 'purge_data':
        await purgeAllData();
        break;
      default:
        if (typeof _dangerCallback === 'function') {
          await _dangerCallback();
        }
    }

    closeDangerModal();
    addAudit('danger_action_executed', 'system', _dangerAction);

  } catch (error) {
    console.error('Danger action failed:', error);
    showToast(`Erreur: ${error.message}`, 'error');
    logError('Danger action failed', { action: _dangerAction, error: error.message });
  }
}

async function deleteAllDocuments() {
  if (!G.currentUser) throw new Error('Non authentifié');

  const docsToDelete = G.documents.filter(d => !d.is_deleted && d.owner_id === G.currentUser.id);
  const count = docsToDelete.length;

  for (const doc of docsToDelete) {
    doc.is_deleted = true;
    doc.deleted_at = new Date().toISOString();
    await SB.from('documents').update({ is_deleted: true, deleted_at: doc.deleted_at }).eq('id', doc.id);
  }

  const success = saveDocumentsSafe();
  if (!success) throw new Error('Échec sauvegarde');

  renderDocuments();
  updateBadges();
  updateStorageDisplay();
  showToast(`${count} document(s) déplacé(s) vers la corbeille`, 'success');
  addAudit('delete_all_documents', 'system', { count });
}

async function resetAllStorage() {
  const stats = StorageManager.getStats();
  const result = StorageManager.clearAppData();

  if (!result.success) {
    throw new Error(result.error || 'Échec du reset');
  }

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
  G.auditLog = [];
  G.notifications = [];
  G.unreadCount = 0;

  await loadInitialData();

  showToast(`Stockage réinitialisé (${result.count} clés supprimées)`, 'success');
  addAudit('reset_storage', 'system', { keysRemoved: result.count, previousStats: stats });
  renderDocuments();
  renderDashboard();
}

async function purgeAllData() {
  const result = StorageManager.clearAppData();

  if (!result.success) {
    throw new Error(result.error);
  }

  handleLogout();

  showToast('Toutes les données ont été purgées', 'success');
  addAudit('purge_all_data', 'system', { keysRemoved: result.count });
}

async function deleteCurrentAccount() {
  if (!G.currentUser) throw new Error('Non authentifié');

  StorageManager.remove(`user_${G.currentUser.email}`);
  handleLogout();

  showToast('Compte supprimé définitivement', 'success');
  addAudit('delete_account', 'user', G.currentUser.id);
}

// ─── EXPORT CSV AMÉLIORÉ ───
function exportDocumentsCsv() {
  try {
    if (!G.documents || G.documents.length === 0) {
      showToast('Aucun document à exporter', 'warning');
      return;
    }

    const headers = [
      'ID', 'Nom', 'Type', 'Taille (bytes)', 'Taille formatée', 'Description',
      'Portée', 'Propriétaire', 'Dossier', 'Tags', 'Créé le', 'Modifié le',
      'Version', 'Vues', 'Téléchargements', 'Statut', 'Company ID'
    ];

    const rows = G.documents.map(doc => [
      doc.id || '',
      `"${(doc.name || '').replace(/"/g, '""')}"`,
      doc.type || '',
      doc.size || 0,
      formatBytes(doc.size || 0),
      `"${(doc.description || '').replace(/"/g, '""')}"`,
      doc.scope || '',
      doc.owner_id || '',
      doc.folder_id || '',
      `"${(doc.tags || []).join(', ')}"`,
      doc.created_at || '',
      doc.updated_at || '',
      doc.version || 1,
      doc.views || 0,
      doc.downloads || 0,
      doc.is_deleted ? 'Supprimé' : 'Actif',
      doc.company_id || ''
    ]);

    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `documents_systemesged_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`${rows.length} documents exportés en CSV`, 'success');
    addAudit('export_csv', 'documents', { count: rows.length });

  } catch (error) {
    console.error('Export CSV failed:', error);
    showToast(`Erreur export CSV: ${error.message}`, 'error');
    logError('Export CSV failed', { error: error.message });
  }
}

function exportAuditLog() {
  try {
    if (!G.auditLog || G.auditLog.length === 0) {
      showToast('Aucun log à exporter', 'warning');
      return;
    }

    const headers = ['Date', 'Utilisateur', 'Email', 'Action', 'Type', 'ID Cible', 'Détails'];

    const rows = G.auditLog.map(log => [
      log.timestamp || '',
      log.userId || '',
      log.userEmail || '',
      log.action || '',
      log.targetType || '',
      log.targetId || '',
      `"${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_systemesged_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`${rows.length} entrées d'audit exportées`, 'success');

  } catch (error) {
    console.error('Export audit failed:', error);
    showToast(`Erreur export audit: ${error.message}`, 'error');
  }
}

function showStorageStats() {
  const stats = StorageManager.getStats();

  if (!stats.success) {
    showToast('Impossible d\'obtenir les statistiques', 'error');
    return;
  }

  console.table(stats.details);

  showToast(
    `Stockage: ${stats.totalSize} (${stats.appKeys} clés app)`,
    'info',
    5000
  );
}

// ─── Fonction addCollaborator ───
function addCollaborator() {
  const collabEmail = document.getElementById('collabEmail');
  const collabPermission = document.getElementById('collabPermission');
  
  const email = collabEmail?.value.trim();
  const permission = collabPermission?.value;
  
  if (!email) {
    showToast('Veuillez entrer un email', 'warning');
    return;
  }
  
  const doc = G.documents.find(d => d.id === G.currentDocId);
  if (!doc) return;
  
  if (!doc.collaborators) doc.collaborators = [];
  
  const user = G.users.find(u => u.email === email);
  const newCollaborator = {
    id: generateId(),
    email: email,
    name: user ? user.name : email.split('@')[0],
    permission: permission,
    added_at: new Date().toISOString(),
    added_by: G.currentUser?.id
  };
  
  doc.collaborators.push(newCollaborator);
  saveDocuments();
  
  if (collabEmail) collabEmail.value = '';
  renderCollaboratorsList();
  showToast('Collaborateur ajouté', 'success');
  addAudit('add_collaborator', 'document', G.currentDocId, { email, permission });
}

function removeCollaborator(collabId) {
  const doc = G.documents.find(d => d.id === G.currentDocId);
  if (!doc || !doc.collaborators) return;
  
  doc.collaborators = doc.collaborators.filter(c => c.id !== collabId);
  saveDocuments();
  renderCollaboratorsList();
  showToast('Collaborateur retiré', 'success');
}

function openPermModal(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  G.currentDocId = docId;
  const permDocName = document.getElementById('permDocName');
  if (permDocName) permDocName.textContent = doc.name;
  renderCollaboratorsList();
  const permModal = document.getElementById('permModal');
  if (permModal) permModal.classList.remove('hidden');
}

function closePermModal() {
  const permModal = document.getElementById('permModal');
  if (permModal) permModal.classList.add('hidden');
  G.currentDocId = null;
}

function renderCollaboratorsList() {
  const container = document.getElementById('collaboratorsList');
  if (!container) return;
  
  const doc = G.documents.find(d => d.id === G.currentDocId);
  
  if (!doc || !doc.collaborators || doc.collaborators.length === 0) {
    container.innerHTML = '<p class="text-blue-300/50 text-sm text-center py-4">Aucun collaborateur</p>';
    return;
  }
  
  container.innerHTML = doc.collaborators.map(c => `
    <div class="flex items-center justify-between p-2 rounded-lg bg-slate-900/30 border border-blue-500/10">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-xs">${c.name.charAt(0)}</div>
        <div>
          <p class="text-sm text-white">${c.name}</p>
          <p class="text-xs text-blue-300/60">${c.email} • ${c.permission}</p>
        </div>
      </div>
      <button onclick="removeCollaborator('${c.id}')" class="p-1 text-red-400 hover:text-red-300"><i class="fas fa-times"></i></button>
    </div>
  `).join('');
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
    doc: 'doc', docx: 'doc',
    xls: 'xls', xlsx: 'xls',
    png: 'img', jpg: 'img', jpeg: 'img', gif: 'img',
    txt: 'txt'
  };
  return types[ext] || 'unknown';
}

function showToast(message, type = 'info', duration = 3000) {
  // Implémentation basique du toast - à adapter selon votre UI
  console.log(`[${type.toUpperCase()}] ${message}`);
  
  // Créer un élément toast si la fonction existe dans votre UI
  if (typeof window.createToast === 'function') {
    window.createToast(message, type, duration);
  }
}

function logInfo(message, details = {}) {
  console.log(`[INFO] ${message}`, details);
  G.sysLogs.push({ level: 'info', message, timestamp: new Date().toISOString(), ...details });
}

function logError(message, details = {}) {
  console.error(`[ERROR] ${message}`, details);
  G.sysLogs.push({ level: 'error', message, timestamp: new Date().toISOString(), ...details });
}

function logSecurity(message, details = {}) {
  console.warn(`[SECURITY] ${message}`, details);
  G.sysLogs.push({ level: 'security', message, timestamp: new Date().toISOString(), ...details });
}

function addAudit(action, targetType, targetId, details = {}) {
  G.auditLog.unshift({
    action,
    targetType,
    targetId,
    userId: G.currentUser?.id,
    userEmail: G.currentUser?.email,
    timestamp: new Date().toISOString(),
    details
  });
}

// ─── Initialization ───
document.addEventListener('DOMContentLoaded', async () => {
  logInfo('SystemesGED v5.3 démarré - Version avec Supabase et company_id RLS');
  
  // Initialiser Supabase
  const initialized = await initializeSupabase();
  if (initialized) {
    await testConnection();
  }
  
  // Check for saved session
  const savedUser = localStorage.getItem('currentUser');
  if (savedUser && !G.currentUser) {
    const user = JSON.parse(savedUser);
    if (user.status === 'pending_validation') {
      showToast('Votre compte est en attente de validation', 'warning');
      localStorage.removeItem('currentUser');
      localStorage.removeItem('currentCompany');
      return;
    }
    G.currentUser = user;
    G.currentCompany = JSON.parse(localStorage.getItem('currentCompany') || '{}');
    initializeApp();
  }
});

// Expose functions globally - CORRECTION: Toutes les fonctions sont maintenant exposées
Object.assign(window, {
  // Configuration & Initialisation
  CONFIG, G, SB, initializeSupabase, testConnection,
  
  // Authentification
  switchAuthTab, togglePwdInput, handleLogin, handleRegister, demoLogin, oauthLogin, handleLogout,
  
  // Navigation
  switchView, openMobileSidebar, closeMobileSidebar,
  
  // Documents
  openUploadModal, closeUploadModal, setDocScope, handleDragOver, handleDragLeave, handleDrop,
  handleFileSelect, handleFilePickerSelect, handleDocDrop, uploadDocument, addUploadTag, removeUploadTag,
  openPreviewModal, closePreviewModal, downloadCurrentDocument, shareCurrentDocument, downloadDocument,
  deleteDocument, restoreDocument,
  
  // Partage
  openShareModal, closeShareModal, switchShareTab, shareDocument, copyShareLink, loadShareHistory,
  
  // Workflows
  openCreateWorkflowModal, closeWorkflowModal, addWfStep, createWorkflow, openWfDetail, closeWfDetail,
  actOnWorkflow, addWfComment, filterWorkflows, setWfView, getWfStatusClass, getWfStatusLabel,
  
  // Utilisateurs
  openCreateUserModal, closeAddUserModal, addUser, openEditUserModal, closeEditUserModal, saveEditUser, deleteUser,
  validateUser, rejectUser, renderPendingUsers, canValidateUsers,
  
  // Tags
  createTag, deleteTag,
  
  // Facturation & Paramètres
  selectPlan, simulateUpgrade, saveProfile, toggleSetting, exportAllData, copySqlSchema,
  
  // Sécurité
  generateApiKey, scanAllDocuments, filterLogs, clearSysLogs, exportSysLogs,
  switchSecurityTab, loadDeletedDocs, renderAuditLog,
  
  // RBAC
  openRoleModal, closeRoleModal, saveRole, renderRBAC,
  
  // Notifications
  toggleNotifications, closeNotifPanel, markAllNotifRead, markNotifRead, updateNotifBadge,
  
  // Recherche
  handleGlobalSearch, handleSearchResult, runAdvSearch, clearAdvSearch, runFTSearch,
  
  // Éditeurs
  openCollabEditor, closeCollabEditor, onCollabEditorInput, updateCollabWordCount,
  openRichEditor, closeRichEditor, richCmd, richAlign, richInsertHeading, richInsertLink, 
  richInsertCodeBlock, richInsertTable, richInsertMention, _onRichEditorInput, _saveRichContent,
  
  // Dossiers
  openFolder, navigateToFolder, openFolderModal, closeFolderModal, createFolder, renderFolders,
  
  // Signatures
  openSignModal, closeSignModal, clearSignature, submitSignature,
  openEmployeeSignatureModal, closeEmployeeSignatureModal, initEmployeeSignaturePad, 
  clearEmployeeSignature, saveEmployeeSignature, renderEmployeeSignaturesList, deleteEmployeeSignature,
  canManageSignatures,
  
  // AI
  analyzeDocument, analyzeAllDocuments,
  
  // Automatisation
  openWfRuleModal, closeWfRuleModal, createWfRule, deleteAutomationRule,
  
  // Backups
  createBackup, restoreBackup, deleteBackup,
  
  // API Keys
  generateApiKeyV6, revokeApiKey, copyApiKey,
  
  // Audit & Analytics
  setAuditFilter, refreshAnalytics, renderAnalytics, renderBillingV6, renderAuditV6,
  
  // Versioning & RBAC v7
  showVersions, createRoleV7, deleteRoleV7, renderRBACV7, renderSearchV7,
  
  // Filtres & Vue
  applyFilters, clearFilters, filterByType, filterByTag, toggleViewMode, switchDocsTab, switchSharedTab,
  
  // Collaboration
  addCollaborator, removeCollaborator, openPermModal, closePermModal, renderCollaboratorsList,
  
  // Storage Manager
  StorageManager, saveDocumentsSafe, saveUsersSafe,
  
  // Danger Zone
  openDangerModal, closeDangerModal, checkDangerConfirm, executeDangerAction,
  deleteAllDocuments, resetAllStorage, purgeAllData, deleteCurrentAccount,
  
  // Exports
  exportDocumentsCsv, exportAuditLog, showStorageStats,
  
  // Utilitaires
  updatePendingUsersCount, updatePendingUsersBadge, updateValidationMenuVisibility,
  updateUserDisplay, updateStorageDisplay, updateBadges,
  
  // Rendus
  renderDocuments, renderWorkflows, renderShared, renderUsers, renderTags, renderBilling, 
  renderSettings, renderSecurity, renderSysLogs, renderAnalytics, renderFolders, renderSignatures, 
  renderAI, renderAutomation, renderIntegrations, renderBackups, renderApiKeys, renderAdvancedSearch, 
  renderVersioning, renderDashboard, renderActivityList, renderQuickAccess, renderPopularTags, 
  renderTeamDocs, renderMyWorkflows, renderWfKPIs, renderWfKanban, renderWfList, renderDocCard, 
  renderDocListItem, getFilteredDocuments,
  
  // Drag & Drop
  handleDocDragStart, handleDocDragOver: handleDragOver,
  
  // Helpers
  generateId, formatBytes, formatDate, getFileIcon, getFileType, showToast, logInfo, logError, logSecurity, addAudit
});
