// SystemesGED v6.2 - AVEC CLÉS LEGACY (FONCTIONNEL)
// ============================================

const CONFIG = {
  supabaseUrl: 'https://spgtflhprppeoidjguhs.supabase.co',
  
  // CLÉS LEGACY (commencent par eyJhbGci...)
  // Remplacez par vos vraies clés depuis Settings → API → "Legacy anon, service_role API keys"
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwZ3RmbGhwcnBwZW9pZGpndWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzM1NjEsImV4cCI6MjA4ODg0OTU2MX0.v4-dTva3Tt85zHeU03eFS9kHuOFbHMMLLT5XdbA3vYY',
  
  // CLÉ SERVICE ROLE (secret) - MÊME PAGE, section "service_role"
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
    // Client standard (anon key)
    G.supabaseClient = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
    
    // Client admin (service_role key)
    if (CONFIG.supabaseServiceKey && CONFIG.supabaseServiceKey.includes('service_role')) {
      G.supabaseAdmin = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      console.log('✅ Client admin Supabase initialisé');
    } else {
      console.warn('⚠️  Clé service_role non configurée');
    }
    
    window.SB = G.supabaseClient;
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
  toast.className = 'toast';
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
      // 1. Vérifier si l'utilisateur existe
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
        
        // Mettre à jour le mot de passe
        const { error: updateError } = await G.supabaseAdmin.auth.admin.updateUserById(
          userId,
          { password: adminConfig.password }
        );
        
        if (updateError) console.error(`⚠️  Erreur update: ${updateError.message}`);
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
          continue;
        }

        userId = newUserData.user.id;
        console.log(`✅ Utilisateur créé: ${userId}`);
      }

      // 2. Créer/récupérer l'entreprise
      const { data: companies } = await G.supabaseClient
        .from('companies')
        .select('id')
        .eq('name', adminConfig.companyName);

      let companyId;
      if (companies && companies.length > 0) {
        companyId = companies[0].id;
        console.log(`🏢 Entreprise existante: ${companyId}`);
      } else {
        const { data: newCompany, error: compError } = await G.supabaseClient
          .from('companies')
          .insert([{
            name: adminConfig.companyName,
            plan: 'enterprise',
            status: 'active',
            created_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (compError) {
          console.error(`❌ Erreur entreprise: ${compError.message}`);
          continue;
        }
        companyId = newCompany.id;
        console.log(`🏢 Entreprise créée: ${companyId}`);
      }

      // 3. Créer/mettre à jour le profil
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
        await G.supabaseClient.from('profiles').update(profileData).eq('id', userId);
        console.log(`👤 Profil mis à jour`);
      } else {
        profileData.created_at = new Date().toISOString();
        await G.supabaseClient.from('profiles').insert([profileData]);
        console.log(`👤 Profil créé`);
      }

      results.push({ email: adminConfig.email, userId, companyId, success: true });
      console.log(`\n📌 UID pour ${adminConfig.email}: ${userId}`);

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
      console.log(`   SQL: SELECT * FROM auth.users WHERE email = '${r.email}';`);
    } else {
      console.log(`❌ ${r.email}: ${r.error}`);
    }
  });
  console.log('='.repeat(60));

  if (results.some(r => r.success)) {
    showToast('Administrateurs créés - vérifiez la console', 'success');
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
    const { data: authData, error: authError } = await G.supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData?.user) {
      showToast('Email ou mot de passe incorrect', 'error');
      return;
    }

    // Récupérer le profil
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
      showToast('Compte en attente de validation', 'warning');
      await G.supabaseClient.auth.signOut();
      return;
    }

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

    const { data: company } = await G.supabaseClient
      .from('companies')
      .select('*')
      .eq('id', profile.company_id)
      .single();

    if (company) G.currentCompany = company;

    await initializeApp();
    showToast('Connexion réussie', 'success');

  } catch (err) {
    console.error('Erreur login:', err);
    showToast('Erreur de connexion', 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
  }
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

    const { data: company, error: compError } = await G.supabaseClient
      .from('companies')
      .insert([{ name: data.company, plan: 'free', status: 'active' }])
      .select()
      .single();

    if (compError) throw compError;

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

  } catch (err) {
    showToast(err.message, 'error');
  }
}

function demoLogin() {
  document.getElementById('loginEmail').value = 'ahouansouange@live.fr';
  document.getElementById('loginPassword').value = 'AdminLive2024!';
  handleLogin(new Event('submit'));
}

async function handleLogout() {
  await G.supabaseClient.auth.signOut();
  G.currentUser = null;
  G.currentCompany = null;
  localStorage.removeItem('currentUser');
  localStorage.removeItem('currentCompany');
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'block';
  showToast('Déconnexion réussie', 'info');
}

// ─── Initialisation Application ───
async function initializeApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  
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
  return G.currentUser?.role === 'admin' || G.currentUser?.permissions?.includes('validate_users');
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
  
  const { data, error } = await G.supabaseClient
    .from('profiles')
    .select('id')
    .eq('company_id', G.currentUser.companyId)
    .eq('status', 'pending_validation');
  
  if (!error && data) {
    G.pendingUsersCount = data.length;
    updatePendingUsersBadge();
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
  await Promise.all([loadDocuments(), loadWorkflows(), loadUsers()]);
  updateStorageDisplay();
}

async function loadDocuments() {
  if (!G.currentUser?.companyId) { G.documents = []; return; }
  const { data, error } = await G.supabaseClient
    .from('documents').select('*').eq('company_id', G.currentUser.companyId).eq('is_deleted', false);
  G.documents = error ? [] : (data || []);
}

async function loadWorkflows() {
  if (!G.currentUser?.companyId) { G.workflows = []; return; }
  const { data, error } = await G.supabaseClient
    .from('workflows').select('*').eq('company_id', G.currentUser.companyId);
  G.workflows = error ? [] : (data || []);
}

async function loadUsers() {
  if (!G.currentUser?.companyId) { G.users = []; return; }
  const { data, error } = await G.supabaseClient
    .from('profiles').select('*').eq('company_id', G.currentUser.companyId);
  G.users = error ? [] : (data || []);
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
  document.getElementById('totalDocs').textContent = G.documents?.length || 0;
  document.getElementById('dashWorkflowCount').textContent = 
    G.workflows?.filter(w => ['pending', 'in_review'].includes(w.status))?.length || 0;
}

function renderDocuments() {
  const grid = document.getElementById('documentGrid');
  if (!grid) return;
  
  if (!G.documents?.length) {
    grid.innerHTML = '<div class="text-center py-12 text-blue-300/50">Aucun document</div>';
    return;
  }
  
  grid.innerHTML = G.documents.map(doc => `
    <div class="glass-card rounded-2xl p-4 border border-blue-500/20">
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
        <span class="px-2 py-1 rounded-full text-xs ${u.role === 'admin' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}">
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
  `).join('') || '<tr><td colspan="4" class="p-4 text-center text-blue-300/50">Aucun utilisateur</td></tr>';
}

async function validateUser(userId) {
  if (!canValidateUsers()) return;
  
  const { error } = await G.supabaseClient
    .from('profiles')
    .update({ status: 'active', validated_at: new Date().toISOString(), validated_by: G.currentUser?.id })
    .eq('id', userId);
  
  if (!error) {
    showToast('Utilisateur validé', 'success');
    await loadUsers();
    renderUsers();
    updatePendingUsersCount();
  }
}

async function renderPendingUsers() {
  const container = document.getElementById('pendingUsersList');
  if (!container) return;
  
  const { data, error } = await G.supabaseClient
    .from('profiles')
    .select('*')
    .eq('company_id', G.currentUser?.companyId)
    .eq('status', 'pending_validation');
  
  if (error || !data?.length) {
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
          </div>
        </div>
        <button onclick="validateUser('${u.id}')" class="px-4 py-2 rounded-lg bg-green-500/20 text-green-400">
          <i class="fas fa-check mr-2"></i>Valider
        </button>
      </div>
    </div>
  `).join('');
}

function updateStorageDisplay() {
  const used = (G.documents || []).reduce((sum, d) => sum + (d.size || 0), 0);
  const limit = CONFIG.plans[G.currentUser?.plan || 'free'].storage;
  const percent = Math.min(100, Math.round((used / limit) * 100));
  
  document.getElementById('storagePercent').textContent = `${percent}%`;
  document.getElementById('storageBar').style.width = `${percent}%`;
  document.getElementById('storageText').textContent = `${formatBytes(used)} / ${formatBytes(limit)}`;
}

// ─── Initialisation ───
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 SystemesGED v6.2 démarré');
  
  initSupabase();
  await initializeSystemAdmins();
  
  // Vérifier session existante
  const { data: { session } } = await G.supabaseClient.auth.getSession();
  if (session?.user) {
    const { data: profile } = await G.supabaseClient
      .from('profiles').select('*').eq('id', session.user.id).single();
    
    if (profile && profile.status !== 'pending_validation') {
      G.currentUser = {
        id: session.user.id,
        email: session.user.email,
        name: profile.full_name,
        role: profile.role,
        companyId: profile.company_id,
        plan: profile.plan || 'free',
        status: profile.status,
        isSystemAdmin: profile.is_company_admin
      };
      
      const { data: company } = await G.supabaseClient
        .from('companies').select('*').eq('id', profile.company_id).single();
      
      if (company) G.currentCompany = company;
      await initializeApp();
    }
  }
});

// Exposer globalement
Object.assign(window, {
  switchAuthTab, togglePwdInput, handleLogin, handleRegister, demoLogin, handleLogout,
  switchView, closeMobileSidebar, validateUser,
  renderDocuments, renderUsers, renderPendingUsers, initializeSystemAdmins
});
