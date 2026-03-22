// SystemesGED v7.0 - SYNCHRONISÉ SUPABASE (CORRIGÉ)
// ============================================

const CONFIG = {
  supabaseUrl: 'https://spgtflhprppeoidjguhs.supabase.co',
  
  // CLÉ ANON (publique) - pour l'authentification client
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwZ3RmbGhwcnBwZW9pZGpndWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzM1NjEsImV4cCI6MjA4ODg0OTU2MX0.v4-dTva3Tt85zHeU03eFS9kHuOFbHMMLLT5XdbA3vYY',
  
  // CLÉ SERVICE ROLE (secrète) - pour l'administration uniquement
  supabaseServiceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwZ3RmbGhwcnBwZW9pZGpndWhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzI3MzU2MSwiZXhwIjoyMDg4ODQ5NTYxfQ.sXmN9lEmJFx58ocxHOt2J2XhYBMn_P603AOqI1a-p4I',
  
  maxFileSize: 100 * 1024 * 1024,
  defaultPlan: 'free',
  plans: {
    free: { name: 'Free', price: 0, users: 5, storage: 1024 * 1024 * 1024, features: ['basic'] },
    starter: { name: 'Starter', price: 29, users: 20, storage: 10 * 1024 * 1024 * 1024, features: ['basic', 'versioning'] },
    professional: { name: 'Professional', price: 79, users: 100, storage: 100 * 1024 * 1024 * 1024, features: ['basic', 'versioning', 'rbac', 'audit'] },
    enterprise: { name: 'Enterprise', price: null, users: Infinity, storage: Infinity, features: ['all'] }
  },
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
    // Client standard (anon key) - pour les opérations utilisateur
    G.supabaseClient = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
    
    // Client admin (service_role key) - pour créer les admins système uniquement
    // IMPORTANT: Ce client ne doit PAS être utilisé pour les connexions utilisateur
    if (CONFIG.supabaseServiceKey && CONFIG.supabaseServiceKey.includes('service_role')) {
      G.supabaseAdmin = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey, {
        auth: { 
          autoRefreshToken: false, 
          persistSession: false,
          detectSessionInUrl: false
        }
      });
      console.log('✅ Client admin Supabase initialisé');
    } else {
      console.warn('⚠️  Clé service_role non configurée');
    }
    
    window.SB = G.supabaseClient;
    
    // Écouter les changements d'état d'authentification
    G.supabaseClient.auth.onAuthStateChange((event, session) => {
      console.log('🔐 Auth event:', event);
      if (event === 'SIGNED_IN' && session) {
        console.log('✅ Utilisateur connecté:', session.user.email);
      } else if (event === 'SIGNED_OUT') {
        console.log('👋 Utilisateur déconnecté');
        G.currentUser = null;
        G.currentCompany = null;
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('🔄 Token rafraîchi');
      }
    });
    
    return true;
  } catch (e) {
    console.error('❌ Erreur init Supabase:', e);
    showToast('Erreur de connexion', 'error');
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
  if (!container) { console.log(`[${type}] ${message}`); return; }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: 'fa-check-circle text-green-400', error: 'fa-times-circle text-red-400', warning: 'fa-exclamation-triangle text-yellow-400', info: 'fa-info-circle text-blue-400' };
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info} text-lg"></i><span class="flex-1 text-sm">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 300); }, duration);
}

// ─── CRÉATION AUTOMATIQUE DES ADMINS ───
async function initializeSystemAdmins() {
  console.log('🚀 Initialisation des administrateurs système...');
  
  if (!G.supabaseAdmin) {
    console.error('❌ Client admin non disponible - vérifiez la clé service_role');
    showToast('Erreur: clé service_role manquante', 'error');
    return;
  }

  const results = [];

  for (const adminConfig of CONFIG.systemAdmins) {
    console.log(`\n📝 Traitement: ${adminConfig.email}`);
    
    try {
      // 1. Vérifier si l'utilisateur existe déjà
      const { data: listData, error: listError } = await G.supabaseAdmin.auth.admin.listUsers();
      
      if (listError) {
        console.error(`❌ Erreur listUsers: ${listError.message}`);
        continue;
      }

      const existingUser = listData.users.find(u => u.email === adminConfig.email);
      let userId;

      if (existingUser) {
        console.log(`✅ Utilisateur existant: ${existingUser.id}`);
        userId = existingUser.id;
        
        // Mettre à jour le mot de passe si nécessaire
        try {
          const { error: updateError } = await G.supabaseAdmin.auth.admin.updateUserById(
            userId,
            { password: adminConfig.password }
          );
          if (updateError) console.warn(`⚠️  Erreur update password: ${updateError.message}`);
        } catch (e) {
          console.warn(`⚠️  Impossible de mettre à jour le mot de passe: ${e.message}`);
        }
      } else {
        // Créer l'utilisateur avec email confirmé
        console.log(`⏳ Création utilisateur...`);
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
          continue;
        }

        if (!newUserData || !newUserData.user) {
          console.error(`❌ Erreur: utilisateur non créé`);
          continue;
        }

        userId = newUserData.user.id;
        console.log(`✅ Utilisateur créé: ${userId}`);
      }

      // 2. Créer/récupérer l'entreprise
      let companyId;
      try {
        const { data: companies, error: compQueryError } = await G.supabaseAdmin
          .from('companies')
          .select('id')
          .eq('name', adminConfig.companyName);

        if (compQueryError) throw compQueryError;

        if (companies && companies.length > 0) {
          companyId = companies[0].id;
          console.log(`🏢 Entreprise existante: ${companyId}`);
        } else {
          const { data: newCompany, error: compError } = await G.supabaseAdmin
            .from('companies')
            .insert([{
              name: adminConfig.companyName,
              plan: 'enterprise',
              status: 'active',
              created_at: new Date().toISOString()
            }])
            .select()
            .single();

          if (compError) throw compError;
          companyId = newCompany.id;
          console.log(`🏢 Entreprise créée: ${companyId}`);
        }
      } catch (e) {
        console.error(`❌ Erreur entreprise: ${e.message}`);
        continue;
      }

      // 3. Créer/mettre à jour le profil
      try {
        const { data: existingProfile } = await G.supabaseAdmin
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
          const { error: updateError } = await G.supabaseAdmin
            .from('profiles')
            .update(profileData)
            .eq('id', userId);
            
          if (updateError) throw updateError;
          console.log(`👤 Profil mis à jour`);
        } else {
          profileData.created_at = new Date().toISOString();
          const { error: insertError } = await G.supabaseAdmin
            .from('profiles')
            .insert([profileData]);
            
          if (insertError) throw insertError;
          console.log(`👤 Profil créé`);
        }

        results.push({ email: adminConfig.email, userId, companyId, success: true });
        console.log(`\n📌 UID pour ${adminConfig.email}: ${userId}`);

      } catch (e) {
        console.error(`❌ Erreur profil: ${e.message}`);
        results.push({ email: adminConfig.email, success: false, error: e.message });
      }

    } catch (error) {
      console.error(`❌ Exception: ${error.message}`);
      results.push({ email: adminConfig.email, success: false, error: error.message });
    }
  }

  // Récapitulatif
  console.log('\n' + '='.repeat(60));
  console.log('📋 RÉCAPITULATIF');
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
    showToast('Administrateurs initialisés', 'success');
  }
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
  const icon = btn?.querySelector('i');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  if (icon) icon.className = input.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}

async function handleLogin(e) {
  e.preventDefault();
  
  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  
  const email = emailInput?.value?.trim();
  const password = passwordInput?.value;

  if (!email || !password) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }

  if (btn) btn.disabled = true;
  if (btnText) btnText.innerHTML = '<span class="spinner mr-2"></span>Connexion...';

  try {
    console.log('🔐 Tentative de connexion:', email);
    
    // Utiliser signInWithPassword (API moderne Supabase)
    const { data: authData, error: authError } = await G.supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (authError) {
      console.error('❌ Erreur auth:', authError);
      
      // Messages d'erreur plus précis
      if (authError.message.includes('Invalid login credentials')) {
        showToast('Email ou mot de passe incorrect', 'error');
      } else if (authError.message.includes('Email not confirmed')) {
        showToast('Email non confirmé - vérifiez votre boîte mail', 'warning');
      } else {
        showToast(authError.message, 'error');
      }
      return;
    }

    if (!authData || !authData.user) {
      showToast('Erreur lors de la connexion', 'error');
      return;
    }

    console.log('✅ Authentification réussie, récupération du profil...');

    // Récupérer le profil utilisateur
    const { data: profile, error: profileError } = await G.supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      console.error('❌ Erreur récupération profil:', profileError);
      
      // Si le profil n'existe pas, le créer
      if (profileError.code === 'PGRST116') {
        console.log('⚠️  Profil non trouvé, création...');
        
        // Déterminer la compagnie depuis les métadonnées ou créer une nouvelle
        const companyName = authData.user.user_metadata?.company_name || 'Default';
        
        // Créer ou récupérer l'entreprise
        let companyId;
        const { data: existingComp } = await G.supabaseClient
          .from('companies')
          .select('id')
          .eq('name', companyName)
          .single();
          
        if (existingComp) {
          companyId = existingComp.id;
        } else {
          const { data: newComp } = await G.supabaseClient
            .from('companies')
            .insert([{ name: companyName, plan: 'free', status: 'active' }])
            .select()
            .single();
          companyId = newComp?.id;
        }
        
        // Créer le profil
        const { data: newProfile, error: createProfileError } = await G.supabaseClient
          .from('profiles')
          .insert([{
            id: authData.user.id,
            email: authData.user.email,
            full_name: authData.user.user_metadata?.full_name || authData.user.email,
            role: 'viewer',
            status: 'active',
            company_id: companyId
          }])
          .select()
          .single();
          
        if (createProfileError) {
          showToast('Erreur création profil', 'error');
          return;
        }
        
        // Continuer avec le nouveau profil
        await finalizeLogin(authData.user, newProfile, companyId);
        return;
      }
      
      showToast('Profil non trouvé', 'error');
      return;
    }

    if (!profile) {
      showToast('Profil introuvable', 'error');
      return;
    }

    // Vérifier le statut du compte
    if (profile.status === 'pending_validation') {
      showToast('Compte en attente de validation par un administrateur', 'warning');
      await G.supabaseClient.auth.signOut();
      return;
    }

    if (profile.status === 'suspended' || profile.status === 'blocked') {
      showToast('Compte suspendu - contactez votre administrateur', 'error');
      await G.supabaseClient.auth.signOut();
      return;
    }

    // Récupérer les infos de l'entreprise
    let company = null;
    if (profile.company_id) {
      const { data: companyData } = await G.supabaseClient
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .single();
      company = companyData;
    }

    await finalizeLogin(authData.user, profile, company);

  } catch (err) {
    console.error('❌ Erreur login:', err);
    showToast('Erreur de connexion: ' + (err.message || 'Inconnue'), 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
  }
}

async function finalizeLogin(authUser, profile, company) {
  // Construire l'objet utilisateur
  G.currentUser = {
    id: authUser.id,
    email: authUser.email,
    name: profile.full_name || authUser.email,
    role: profile.role || 'viewer',
    companyId: profile.company_id,
    plan: profile.plan || company?.plan || 'free',
    status: profile.status,
    isSystemAdmin: profile.is_company_admin || profile.role === 'admin' || false,
    permissions: profile.admin_rights || [],
    userMetadata: authUser.user_metadata
  };

  G.currentCompany = company;

  console.log('✅ Connexion finalisée:', G.currentUser.email, 'Role:', G.currentUser.role);
  
  await initializeApp();
  showToast(`Bienvenue ${G.currentUser.name}!`, 'success');
}

async function handleRegister(e) {
  e.preventDefault();
  
  const firstName = document.getElementById('regFirst')?.value?.trim();
  const lastName = document.getElementById('regLast')?.value?.trim();
  const company = document.getElementById('regCompany')?.value?.trim();
  const email = document.getElementById('regEmail')?.value?.trim();
  const password = document.getElementById('regPassword')?.value;

  if (!firstName || !lastName || !company || !email || !password) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }

  if (password.length < 6) {
    showToast('Le mot de passe doit contenir au moins 6 caractères', 'warning');
    return;
  }

  try {
    console.log('📝 Inscription:', email);
    
    // 1. Créer l'utilisateur dans Auth
    const { data: authData, error: authError } = await G.supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: `${firstName} ${lastName}`,
          company_name: company
        }
      }
    });

    if (authError) throw authError;

    if (!authData.user) {
      showToast('Erreur lors de la création du compte', 'error');
      return;
    }

    console.log('✅ Utilisateur auth créé:', authData.user.id);

    // 2. Créer l'entreprise
    const { data: companyData, error: compError } = await G.supabaseClient
      .from('companies')
      .insert([{ 
        name: company, 
        plan: 'free', 
        status: 'active',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (compError) {
      console.error('❌ Erreur création entreprise:', compError);
      // Ne pas bloquer - l'entreprise peut exister
    }

    const companyId = companyData?.id;

    // 3. Créer le profil utilisateur
    const { error: profileError } = await G.supabaseClient
      .from('profiles')
      .insert([{
        id: authData.user.id,
        email: email,
        full_name: `${firstName} ${lastName}`,
        role: 'viewer',
        status: 'pending_validation', // En attente de validation
        company_id: companyId,
        created_at: new Date().toISOString()
      }]);

    if (profileError) {
      console.error('❌ Erreur création profil:', profileError);
      throw profileError;
    }

    showToast('Compte créé avec succès - en attente de validation', 'success');
    switchAuthTab('login');
    
    // Pré-remplir le formulaire de login
    document.getElementById('loginEmail').value = email;
    document.getElementById('loginPassword').value = '';

  } catch (err) {
    console.error('❌ Erreur inscription:', err);
    
    if (err.message?.includes('User already registered')) {
      showToast('Cet email est déjà utilisé', 'error');
    } else {
      showToast(err.message || 'Erreur lors de l\'inscription', 'error');
    }
  }
}

function demoLogin() {
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  
  if (emailInput) emailInput.value = 'ahouansouange@live.fr';
  if (passwordInput) passwordInput.value = 'AdminLive2024!';
  
  // Déclencher la connexion
  handleLogin(new Event('submit'));
}

async function handleLogout() {
  try {
    const { error } = await G.supabaseClient.auth.signOut();
    if (error) throw error;
    
    G.currentUser = null;
    G.currentCompany = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentCompany');
    
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
    
    showToast('Déconnexion réussie', 'info');
  } catch (err) {
    console.error('❌ Erreur déconnexion:', err);
    showToast('Erreur lors de la déconnexion', 'error');
  }
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
}

function isAdmin() {
  return ['admin', 'manager'].includes(G.currentUser?.role) || G.currentUser?.isSystemAdmin;
}

function canValidateUsers() {
  return G.currentUser?.role === 'admin' || 
         G.currentUser?.permissions?.includes('validate_users') ||
         G.currentUser?.isSystemAdmin;
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

function updateValidationMenuVisibility() {
  const items = document.querySelectorAll('[data-view="pending-users"]');
  items.forEach(item => item.style.display = canValidateUsers() ? 'flex' : 'none');
  updatePendingUsersBadge();
}

async function updatePendingUsersCount() {
  if (!G.currentUser?.companyId) return;
  
  try {
    const { data, error, count } = await G.supabaseClient
      .from('profiles')
      .select('id', { count: 'exact' })
      .eq('company_id', G.currentUser.companyId)
      .eq('status', 'pending_validation');
    
    if (!error) {
      G.pendingUsersCount = count || 0;
      updatePendingUsersBadge();
    }
  } catch (e) {
    console.error('Erreur comptage utilisateurs:', e);
  }
}

function updatePendingUsersBadge() {
  document.querySelectorAll('.pending-users-badge').forEach(badge => {
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
    await Promise.all([loadDocuments(), loadWorkflows(), loadUsers()]);
    updateStorageDisplay();
  } catch (e) {
    console.error('❌ Erreur chargement données:', e);
  }
}

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
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
      
    G.documents = error ? [] : (data || []);
  } catch (e) {
    console.error('Erreur chargement documents:', e);
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
    console.error('Erreur chargement workflows:', e);
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
    console.error('Erreur chargement utilisateurs:', e);
    G.users = [];
  }
}

function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
  document.getElementById(`view-${viewName}`)?.classList.add('active-view');
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll(`[data-view="${viewName}"]`).forEach(el => el.classList.add('active'));
  G.currentView = viewName;
  
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

function renderDashboard() {
  const totalDocs = document.getElementById('totalDocs');
  const dashWorkflowCount = document.getElementById('dashWorkflowCount');
  
  if (totalDocs) totalDocs.textContent = G.documents?.length || 0;
  if (dashWorkflowCount) {
    dashWorkflowCount.textContent = G.workflows?.filter(w => ['pending', 'in_review'].includes(w.status))?.length || 0;
  }
}

function renderDocuments() {
  const grid = document.getElementById('documentGrid');
  if (!grid) return;
  
  if (!G.documents?.length) {
    grid.innerHTML = '<div class="text-center py-12 text-blue-300/50">Aucun document</div>';
    return;
  }
  
  grid.innerHTML = G.documents.map(doc => `
    <div class="glass-card rounded-2xl p-4 border border-blue-500/20 hover:border-blue-400/40 transition-all cursor-pointer">
      <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-2xl mb-3">
        <i class="fas ${getFileIcon(doc.type).split(' ')[0]} ${getFileIcon(doc.type).split(' ')[1]}"></i>
      </div>
      <h4 class="text-white font-semibold text-sm truncate">${doc.name}</h4>
      <p class="text-blue-300/60 text-xs">${formatBytes(doc.size)} • ${formatDate(doc.created_at)}</p>
    </div>
  `).join('');
}

async function renderUsers() {
  const tbody = document.getElementById('usersList');
  if (!tbody) return;
  
  await loadUsers();
  
  tbody.innerHTML = G.users?.map(u => `
    <tr class="hover:bg-blue-500/5 transition-colors">
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
        <span class="px-2 py-1 rounded-full text-xs ${u.role === 'admin' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}">
          ${G.roles[u.role]?.name || u.role}
        </span>
      </td>
      <td class="p-4">
        <span class="px-2 py-1 rounded-full text-xs ${u.status === 'active' ? 'bg-green-500/20 text-green-400' : u.status === 'pending_validation' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}">
          ${u.status === 'pending_validation' ? 'En attente' : u.status}
        </span>
      </td>
      <td class="p-4">
        ${u.status === 'pending_validation' && canValidateUsers() ? 
          `<button onclick="validateUser('${u.id}')" class="px-3 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30 transition-colors">Valider</button>` : 
          `<span class="text-blue-300/40 text-xs">-</span>`}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="p-4 text-center text-blue-300/50">Aucun utilisateur</td></tr>';
}

async function validateUser(userId) {
  if (!canValidateUsers()) {
    showToast('Vous n\'avez pas les droits pour valider', 'error');
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
    
    showToast('Utilisateur validé avec succès', 'success');
    await loadUsers();
    renderUsers();
    updatePendingUsersCount();
  } catch (e) {
    console.error('❌ Erreur validation:', e);
    showToast('Erreur lors de la validation', 'error');
  }
}

async function renderPendingUsers() {
  const container = document.getElementById('pendingUsersList');
  if (!container) return;
  
  try {
    const { data, error } = await G.supabaseClient
      .from('profiles')
      .select('*')
      .eq('company_id', G.currentUser?.companyId)
      .eq('status', 'pending_validation');
    
    if (error) throw error;
    
    if (!data?.length) {
      container.innerHTML = '<div class="text-center py-12 text-blue-300/50">Aucun utilisateur en attente</div>';
      return;
    }
    
    container.innerHTML = data.map(u => `
      <div class="glass-card rounded-xl p-4 border border-yellow-500/20">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center justify-center text-lg font-bold">
              ${u.full_name?.charAt(0) || 'U'}
            </div>
            <div>
              <p class="text-white font-medium">${u.full_name || u.email}</p>
              <p class="text-sm text-blue-300/60">${u.email}</p>
              <p class="text-xs text-yellow-400/70 mt-1">Inscrit le ${formatDate(u.created_at)}</p>
            </div>
          </div>
          <button onclick="validateUser('${u.id}')" class="px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors">
            <i class="fas fa-check mr-2"></i>Valider
          </button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('❌ Erreur chargement utilisateurs en attente:', e);
    container.innerHTML = '<div class="text-center py-12 text-red-400">Erreur de chargement</div>';
  }
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

// ─── Initialisation ───
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 SystemesGED v7.0 démarré');
  
  // Initialiser Supabase
  const initialized = initSupabase();
  if (!initialized) {
    showToast('Erreur d\'initialisation Supabase', 'error');
    return;
  }
  
  // Initialiser les admins système (en arrière-plan)
  initializeSystemAdmins().catch(e => console.error('Erreur init admins:', e));
  
  // Vérifier s'il existe une session active
  try {
    const { data: { session }, error: sessionError } = await G.supabaseClient.auth.getSession();
    
    if (sessionError) {
      console.error('❌ Erreur récupération session:', sessionError);
    }
    
    if (session?.user) {
      console.log('🔄 Session existante trouvée:', session.user.email);
      
      // Récupérer le profil
      const { data: profile, error: profileError } = await G.supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      if (profileError || !profile) {
        console.error('❌ Profil non trouvé pour la session existante');
        // Déconnecter si le profil est introuvable
        await G.supabaseClient.auth.signOut();
      } else if (profile.status !== 'pending_validation') {
        // Récupérer l'entreprise
        let company = null;
        if (profile.company_id) {
          const { data: companyData } = await G.supabaseClient
            .from('companies')
            .select('*')
            .eq('id', profile.company_id)
            .single();
          company = companyData;
        }
        
        // Restaurer l'état utilisateur
        G.currentUser = {
          id: session.user.id,
          email: session.user.email,
          name: profile.full_name || session.user.email,
          role: profile.role || 'viewer',
          companyId: profile.company_id,
          plan: profile.plan || company?.plan || 'free',
          status: profile.status,
          isSystemAdmin: profile.is_company_admin || profile.role === 'admin' || false,
          permissions: profile.admin_rights || []
        };
        
        G.currentCompany = company;
        
        console.log('✅ Session restaurée pour:', G.currentUser.email);
        await initializeApp();
        return;
      }
    }
    
    // Pas de session - afficher l'écran de login
    console.log('ℹ️  Aucune session active - affichage login');
    
  } catch (err) {
    console.error('❌ Erreur lors de la vérification de session:', err);
  }
});

// Exposer globalement
Object.assign(window, {
  switchAuthTab, togglePwdInput, handleLogin, handleRegister, demoLogin, handleLogout,
  switchView, closeMobileSidebar, validateUser,
  renderDocuments, renderUsers, renderPendingUsers, initializeSystemAdmins,
  G, CONFIG
});
