// ============================================
// SystemesGED v7.0 – Application complète sécurisée
// CORRIGÉE v7.2 — Correctifs modules Dashboard / Documents / Partagés / Workflows
//
//  [Corrections v7.1 héritées]
//  FIX 01-32 · Voir commentaires originaux en tête de fichier
//
//  [Corrections v7.2 — modules Dashboard / Documents / Partagés / Workflows]
//
//  FIX-D01 · loadAllData — corps de fonction mort supprimé (fausse 1ère implémentation
//            qui faisait return [] prématuré ; tout le Promise.all était inatteignable)
//  FIX-D02 · loadAllData — shares : chargement OR sent+received (avant : sender_id seul)
//  FIX-D03 · loadAllData — ajout public_shares dans Promise.all + init _shared.publicLinks
//  FIX-D04 · _shared — déclaration remontée AVANT loadAllData (évite ReferenceError)
//            et dédoublonnée (doublon + 'use strict' parasites supprimés)
//  FIX-D05 · SyntaxError — apostrophe non échappée dans uploadDocument corrigée
//            ('Impossible de récupérer l'URL publique' → double quotes)
//  FIX-D06 · switchView — active state sidebar synchronisé ([data-view] toggle)
//  FIX-D07 · switchView — gestion async des fonctions de rendu (Promise guard)
//
//  FIX-DASH1 · renderDashboard — converti en async ; rechargement Supabase réel
//              avant affichage (documents, workflows, shares, users, audit_logs)
//  FIX-DASH2 · renderDashboard — calcul activeUsers via Set (déduplication correcte)
//  FIX-DASH3 · renderActivityList — suppression données "simulées" incorrectes ;
//              utilise les vrais audit_logs Supabase
//
//  FIX-DOC1  · renderDocuments — converti en async ; rechargement Supabase à chaque appel
//  FIX-DOC2  · renderDocuments — filtre onglet 'shared' : utilise shares reçus
//              (recipient_email), pas les envoyés
//  FIX-DOC3  · renderDocuments — bloc HTML orphelin de l'ancien code supprimé
//  FIX-DOC4  · switchDocsTab — converti en async ; requête Supabase ciblée par onglet
//              (company / personal / mine / shared) avec fusion propre dans G.documents
//  FIX-DOC5  · switchDocsTab onglet 'shared' — charge les shares reçus depuis Supabase
//              pour trouver les document_id correspondants
//
//  FIX-SHA1  · renderShared — converti en async ; rechargement sent+received+public_shares
//              depuis Supabase avec déduplication Map avant affichage
//  FIX-SHA2  · refreshShares — showToast(msg, type, duration) : 3e arg supprimé
//              (signature n'accepte que 2 args ; le 3e causait un bug silencieux)
//
//  FIX-WF1   · renderWorkflows — converti en async ; rechargement Supabase avant rendu
//              Kanban ; cartes enrichies (assignee, document lié, due_date, priorité)
//  FIX-WF2   · renderWorkflowsList — converti en async ; rechargement Supabase en vue liste
//  FIX-WF3   · actOnWorkflow — transition in_review ajoutée (étape intermédiaire approve) ;
//              action 'comment' gérée sans changement de statut
//  FIX-WF4   · openWfDetail — boutons d'actions visibles aussi pour statut 'in_review'
//  FIX-WF5   · filterWorkflows — toggle : reclique = effacement du filtre
//  FIX-WF6   · renderWorkflows — updateBadges() appelé après rendu Kanban
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

// ─── État du module Partagés (déclaré tôt pour être disponible dès loadAllData) ───
window._shared = window._shared || {
  currentTab:   'received',
  bulkSelected: new Set(),
  qsRecipients: [],
  qsCurrentTab: 'user',
  publicLinks:  [],
  filterQuery:  '',
  filterPerm:   '',
  filterStatus: '',
};

/* ── États manquants (FIX v7.6) ─────────────────────── */
window._search = window._search || { lastQuery: '', lastResults: [] };

window._sysLogs = window._sysLogs || {
  filter:      'all',
  searchQuery: '',
  page:        1,
  pageSize:    50,
  autoRefresh: false,
  autoRefreshTimer: null,
  allLogs:     [],
};

window._versioning = window._versioning || {
  currentDocId: null,
  history:      [],
  compareA:     null,
  compareB:     null,
};

window._rbac = window._rbac || { editingRole: null };

window._webhooks = window._webhooks || [];

// ─── État global ───
window.G = {  supabase: null,
  currentUser: null,
  currentCompany: null,
  currentTagFilter: null,
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
  _uploadScope: 'company',
  shareModalDocId: null,
  moveModalDocId: null,
  collabModalDocId: null,
  collabUsers: [],
  
  // Variables d'audit
  auditFilter: { days: 30, severity: '', action: '' },
  logFilter: 'all',
  auditCurrentPage: 1,
  auditPageSize: 20
};

// ─── Protection anti-copie et sécurité ───
(function protectApplication() {
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) ||
        (e.ctrlKey && (e.key === 'u' || e.key === 'U'))) {
      e.preventDefault();
      return false;
    }
  });
})();

// ─── Initialisation Supabase ───
async function initSupabase() {
  try {
    if (typeof supabase === 'undefined') {
      console.error('Supabase library not loaded - vérifiez la connexion internet');
      showToast('Erreur de chargement de la bibliothèque Supabase', 'error');
      throw new Error('Supabase library not loaded');
    }
    
    console.log('🔄 Initialisation de Supabase...');
    
    G.supabase = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
      auth: { 
        autoRefreshToken: true, 
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      }
    });
    
    // Vérifier la connexion
    const { data: { session }, error: sessionError } = await G.supabase.auth.getSession();
    if (sessionError) {
      console.warn('Erreur session:', sessionError);
    }
    
    if (session) {
      console.log('✅ Session existante trouvée');
      await loadUserFromSupabase(session.user);
      return true;
    }
    
    console.log('⚠️ Aucune session active');
    return false;
  } catch (e) {
    console.error('Supabase init error:', e);
    showToast('Erreur de connexion à la base de données', 'error');
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
  const { data: existing } = await G.supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .single();
  if (!existing) {
    await G.supabase.from('companies').insert({ 
      id: companyId, 
      name: companyName, 
      plan: 'enterprise' 
    });
  }
}

// ─── Gestion du dossier racine ───
async function setRootFolder(retries = 3) {
  if (!G.currentUser?.companyId) return false;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    const { data: rootFolder, error } = await G.supabase
      .from('folders')
      .select('id')
      .eq('company_id', G.currentUser.companyId)
      .eq('name', 'Racine')
      .maybeSingle();
    
    if (rootFolder && !error) {
      G.currentFolderId = rootFolder.id;
      G.folderPath = [{ id: rootFolder.id, name: 'Racine' }];
      return true;
    }
    
    const newRootId = `${G.currentUser.companyId}_root`;
    const { error: insertErr } = await G.supabase
      .from('folders')
      .insert({
        id: newRootId,
        name: 'Racine',
        parent_id: null,
        company_id: G.currentUser.companyId,
        created_at: new Date().toISOString()
      });
    
    if (!insertErr) {
      G.currentFolderId = newRootId;
      G.folderPath = [{ id: newRootId, name: 'Racine' }];
      return true;
    }
    
    console.warn(`Tentative ${attempt} échouée pour créer le dossier racine`, insertErr);
    if (attempt < retries) await new Promise(r => setTimeout(r, 500));
  }
  
  console.error('Impossible de créer/récupérer le dossier racine');
  showToast('Erreur d\'initialisation des dossiers', 'error');
  return false;
}

// ─── Chargement des données ───
async function loadAllData() {
  if (!G.currentUser?.companyId) return;
  const companyId = G.currentUser.companyId;
  const userId    = G.currentUser.id;

  try {
    const [
      docsRes, wfsRes, usersRes, tagsRes, sharesRes,
      foldersRes, sigsRes, rulesRes, keysRes, backupsRes,
      auditRes, syslogsRes, publicLinksRes
    ] = await Promise.all([
      G.supabase.from('documents').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
      G.supabase.from('workflows').select('*').eq('company_id', companyId),
      G.supabase.from('profiles').select('*').eq('company_id', companyId),
      G.supabase.from('tags').select('*').eq('company_id', companyId),
      G.supabase.from('shares').select('*').or(`sender_id.eq.${userId},recipient_email.eq.${G.currentUser.email}`),
      G.supabase.from('folders').select('*').eq('company_id', companyId),
      G.supabase.from('signatures').select('*').eq('signer_id', userId),
      G.supabase.from('automation_rules').select('*').eq('company_id', companyId),
      G.supabase.from('api_keys').select('*').eq('user_id', userId),
      G.supabase.from('backups').select('*').eq('company_id', companyId),
      G.supabase.from('audit_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(200),
      G.supabase.from('system_logs').select('*').order('created_at', { ascending: false }).limit(100),
      G.supabase.from('public_shares').select('*').eq('created_by', userId)
    ]);

    G.documents      = docsRes.data    || [];
    G.workflows      = wfsRes.data     || [];
    G.users          = usersRes.data   || [];
    G.tags           = tagsRes.data    || [];
    G.shares         = sharesRes.data  || [];
    G.folders        = foldersRes.data || [];
    G.signatures     = sigsRes.data    || [];
    G.automationRules= rulesRes.data   || [];
    G.apiKeys        = keysRes.data    || [];
    G.backups        = backupsRes.data || [];
    G.auditLogs      = auditRes.data   || [];
    G.systemLogs     = syslogsRes.data || [];

    // Initialiser les liens publics dans le module partagés
    if (typeof _shared !== 'undefined') {
      _shared.publicLinks = publicLinksRes.data || [];
    }

    // Log any individual errors without aborting
    [docsRes, wfsRes, usersRes, tagsRes, sharesRes, foldersRes, sigsRes, rulesRes, keysRes, backupsRes, auditRes, syslogsRes, publicLinksRes]
      .filter(r => r.error)
      .forEach(r => console.warn('loadAllData partial error:', r.error));

  } catch (err) {
    console.error('loadAllData critical error:', err);
    showToast('Erreur de chargement des données', 'error');
  }

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
  const isAdmin   = G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
  const isManager = G.currentUser?.role === 'manager' || isAdmin;

  // Menus visibles uniquement pour l'administrateur
  document.querySelectorAll('[data-role="admin-only"]').forEach(el => {
    el.style.display = isAdmin ? 'flex' : 'none';
  });

  // Menus visibles pour manager ET admin
  document.querySelectorAll('[data-role="manager-only"]').forEach(el => {
    el.style.display = isManager ? 'flex' : 'none';
  });

  // Masquer explicitement les 5 menus réservés admin
  // si l'utilisateur n'est pas admin (sécurité côté UI)
  const adminOnlyViews = ['users', 'pending-users', 'security', 'logs', 'rbac',
                          'rbacv7', 'auditv6', 'integrations', 'apikeys', 'billing', 'settings'];
  if (!isAdmin) {
    adminOnlyViews.forEach(viewName => {
      document.querySelectorAll(`[data-view="${viewName}"]`).forEach(el => {
        el.style.display = 'none';
      });
    });
    // Rediriger si l'utilisateur est sur une vue admin
    if (adminOnlyViews.includes(G.currentView)) {
      switchView('dashboard');
    }
  }
}

function updateBadges() {
  const docCount = G.documents.filter(d => !d.is_deleted).length;
  const wfCount = G.workflows.filter(w => ['pending', 'in_review'].includes(w.status)).length;
  const pendingUsersCount = G.users.filter(u => u.status === 'pending_validation').length;
  const sharedCount = G.shares.filter(s => s.status === 'active' && s.recipient_email === G.currentUser?.email).length;
  const sentCount = G.shares.filter(s => s.status === 'active' && s.sender_id === G.currentUser?.id).length;
  
  // Badges documents
  const docBadge = document.getElementById('d-docsBadge');
  if (docBadge) {
    docBadge.textContent = docCount;
    docBadge.classList.toggle('hidden', docCount === 0);
  }
  
  const mDocsBadge = document.getElementById('m-docsBadge');
  if (mDocsBadge) {
    mDocsBadge.textContent = docCount;
    mDocsBadge.classList.toggle('hidden', docCount === 0);
  }
  
  // Badges workflows
  const wfBadge = document.getElementById('d-wfBadge');
  if (wfBadge) {
    wfBadge.textContent = wfCount;
    wfBadge.classList.toggle('hidden', wfCount === 0);
  }
  
  const mWfBadge = document.getElementById('m-wfBadge');
  if (mWfBadge) {
    mWfBadge.textContent = wfCount;
    mWfBadge.classList.toggle('hidden', wfCount === 0);
  }
  
  // Badges partages
  const receivedBadge = document.getElementById('receivedCountBadge');
  if (receivedBadge) {
    receivedBadge.textContent = sharedCount;
    receivedBadge.classList.toggle('hidden', sharedCount === 0);
  }
  
  const sentBadge = document.getElementById('sentCountBadge');
  if (sentBadge) {
    sentBadge.textContent = sentCount;
    sentBadge.classList.toggle('hidden', sentCount === 0);
  }
  
  // Badge utilisateurs en attente
  const pendingBadges = document.querySelectorAll('#d-pendingBadge, #m-pendingBadge');
  pendingBadges.forEach(badge => {
    if (pendingUsersCount > 0 && canValidateUsers()) {
      badge.textContent = pendingUsersCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  });
  
  const pendingCountEl = document.getElementById('pendingCount');
  if (pendingCountEl) pendingCountEl.textContent = pendingUsersCount;
  
  // Corbeille badge
  const trashCount = G.documents.filter(d => d.is_deleted).length;
  const trashBadge = document.getElementById('trashCount');
  if (trashBadge) {
    trashBadge.textContent = trashCount;
    trashBadge.classList.toggle('hidden', trashCount === 0);
  }
  
  console.log('✅ Badges mis à jour:', { docCount, wfCount, pendingUsersCount, sharedCount });
}

function updateStorageDisplay() {
  const used = G.documents.reduce((sum, d) => sum + (d.size || 0), 0);
  const limit = CONFIG.plans[G.currentUser.plan].storage;
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

// ─── Authentification ───

function addFilesToSelection(files) {
  for (const file of files) {
    if (file.size > CONFIG.maxFileSize) {
      showToast(`Fichier trop volumineux: ${file.name} (max ${formatBytes(CONFIG.maxFileSize)})`, 'error');
      continue;
    }
    
    if (!G.selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
      G.selectedFiles.push(file);
    }
  }
  renderSelectedFiles();
  
  const dropZone = document.getElementById('docDropZone');
  if (dropZone && G.selectedFiles.length > 0) {
    dropZone.style.borderColor = 'rgba(34,197,94,0.5)';
    setTimeout(() => {
      dropZone.style.borderColor = '';
    }, 1000);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  e.stopPropagation();
  
  console.log('🔑 Tentative de connexion...');
  
  const email = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPassword')?.value;
  
  if (!email || !password) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }
  
  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.7';
  }
  if (btnText) btnText.innerHTML = '<span class="spinner mr-2"></span>Connexion...';

  try {
    // Vérifier que Supabase est initialisé
    if (!G.supabase) {
      console.error('Supabase non initialisé');
      await initSupabase();
    }
    
    const { data, error } = await G.supabase.auth.signInWithPassword({ 
      email, 
      password 
    });
    
    if (error) {
      console.error('Erreur connexion:', error);
      throw error;
    }
    
    console.log('✅ Connexion réussie pour:', data.user?.email);
    
    if (data.user) {
      await loadUserFromSupabase(data.user);
      showToast(`Bienvenue ${G.currentUser.name || email}`, 'success');
      switchToMainApp();
    } else {
      throw new Error('Aucun utilisateur retourné');
    }
    
  } catch (err) {
    console.error('Erreur handleLogin:', err);
    const msg = err?.message || '';
    let errorMessage = 'Email ou mot de passe incorrect';
    if (msg === 'Invalid login credentials') {
      errorMessage = 'Email ou mot de passe incorrect';
    } else if (msg.includes('Email not confirmed')) {
      errorMessage = 'Veuillez confirmer votre email avant de vous connecter';
    } else if (msg.includes('Too many requests')) {
      errorMessage = 'Trop de tentatives. Veuillez patienter quelques minutes.';
    } else if (msg) {
      errorMessage = msg;
    }
    showToast(errorMessage, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
    }
    if (btnText) btnText.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  e.stopPropagation();
  
  console.log('📝 Tentative d\'inscription...');
  
  const lastAttempt = sessionStorage.getItem('lastRegisterAttempt');
  if (lastAttempt && Date.now() - parseInt(lastAttempt) < 60000) {
    showToast('Veuillez attendre une minute avant de réessayer', 'warning');
    return;
  }
  sessionStorage.setItem('lastRegisterAttempt', Date.now().toString());
  
  const firstName = document.getElementById('regFirst')?.value.trim();
  const lastName = document.getElementById('regLast')?.value.trim();
  const companyName = document.getElementById('regCompany')?.value.trim();
  const email = document.getElementById('regEmail')?.value.trim().toLowerCase();
  const password = document.getElementById('regPassword')?.value;
  
  console.log('📝 Données:', { firstName, lastName, companyName, email });
  
  if (!firstName || !lastName || !companyName || !email || !password) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('Adresse e-mail invalide', 'warning');
    return;
  }
  
  if (password.length < 8) {
    showToast('Le mot de passe doit contenir au moins 8 caractères', 'warning');
    return;
  }
  
  if (CONFIG.systemAdmins.some(a => a.email === email)) {
    showToast('Cet email est réservé', 'error');
    return;
  }
  
  // Vérifier que Supabase est initialisé
  if (!G.supabase) {
    await initSupabase();
  }
  
  const btn = document.getElementById('registerBtn');
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.innerHTML = '<span class="spinner mr-2"></span>Inscription...';
  }

  try {
    const companyId = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log('🏢 Création entreprise:', companyId);
    
    // 1. Créer l'entreprise
    const { error: compErr } = await G.supabase
      .from('companies')
      .insert({ id: companyId, name: companyName, plan: 'free' });
    if (compErr) {
      console.error('Erreur création entreprise:', compErr);
      throw compErr;
    }

    // 2. Créer l'utilisateur dans Auth
    const { data, error } = await G.supabase.auth.signUp({
      email,
      password,
      options: { 
        data: { 
          name: `${firstName} ${lastName}`, 
          company_id: companyId 
        } 
      }
    });
    if (error) {
      console.error('Erreur signUp:', error);
      throw error;
    }
    
    if (!data.user) {
      throw new Error('Aucun utilisateur créé');
    }
    
    console.log('✅ Utilisateur créé:', data.user.id);

    // 3. Créer le profil
    const { error: profErr } = await G.supabase
      .from('profiles')
      .insert({
        id: data.user.id,
        email: email,
        name: `${firstName} ${lastName}`,
        role: 'admin',
        status: 'pending_validation',
        company_id: companyId,
        plan: 'free',
        created_at: new Date().toISOString()
      });
    if (profErr) {
      console.error('Erreur création profil:', profErr);
      throw profErr;
    }

    // 4. Créer le dossier racine
    const rootFolderId = `${companyId}_root`;
    const { error: folderErr } = await G.supabase
      .from('folders')
      .insert({
        id: rootFolderId,
        name: 'Racine',
        parent_id: null,
        company_id: companyId,
        created_at: new Date().toISOString()
      });
    if (folderErr) {
      console.warn('Erreur création dossier racine:', folderErr);
      // Non bloquant
    }

    showToast('Compte créé ! En attente de validation par un administrateur.', 'success');
    
    // Basculer vers l'onglet connexion
    switchAuthTab('login');
    
    // Pré-remplir l'email
    const loginEmail = document.getElementById('loginEmail');
    if (loginEmail) loginEmail.value = email;
    
    console.log('✅ Inscription terminée avec succès');
    
  } catch (err) {
    console.error('Erreur handleRegister:', err);
    let errorMessage = 'Erreur lors de l\'inscription';
    const msg = err?.message || '';
    if (msg.includes('User already registered') || msg.includes('already been registered')) {
      errorMessage = 'Cet email est déjà utilisé';
    } else if (msg.includes('Password should be')) {
      errorMessage = 'Le mot de passe ne respecte pas les critères de sécurité';
    } else if (msg) {
      errorMessage = msg;
    }
    showToast(errorMessage, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Créer mon compte';
    }
  }
}

async function handleLogout() {
  try {
    await G.supabase.auth.signOut();
  } catch (e) {
    console.warn('signOut error (ignored):', e);
  }

  // Reset global state
  G.currentUser = null;
  G.currentCompany = null;
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
  G.auditLogs = [];
  G.systemLogs = [];
  G.currentFolderId = null;
  G.folderPath = [];
  G.selectedFiles = [];
  G.uploadTags = [];

  const loginScreen = document.getElementById('loginScreen');
  const mainApp = document.getElementById('mainApp');

  if (loginScreen) loginScreen.style.display = 'block';
  if (mainApp) mainApp.style.display = 'none';

  showToast('Déconnexion réussie', 'info');
}

function switchToMainApp() {
  console.log('🔄 Bascule vers l\'application principale');

  const loginScreen = document.getElementById('loginScreen');
  const mainApp     = document.getElementById('mainApp');

  if (loginScreen) loginScreen.style.display = 'none';
  if (mainApp)     mainApp.style.display      = 'block';

  switchView('dashboard');
  console.log('✅ Application principale affichée');
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

async function demoLogin() {
  console.log('🚀 Activation du mode démo');

  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }
  if (btnText) btnText.innerHTML = '<span class="spinner mr-2"></span>Chargement démo...';

  // ── Utilisateur démo ─────────────────────────────────
  const DEMO_COMPANY_ID = 'demo_company_001';
  const DEMO_USER_ID    = 'demo_user_001';

  G.currentUser = {
    id:            DEMO_USER_ID,
    email:         'demo@systemesged.fr',
    name:          'Sophie Martin',
    role:          'admin',
    companyId:     DEMO_COMPANY_ID,
    companyName:   'Entreprise Démo',
    plan:          'professional',
    status:        'active',
    isSystemAdmin: false,
    isDemo:        true
  };
  G.currentCompany = { id: DEMO_COMPANY_ID, name: 'Entreprise Démo', plan: 'professional' };

  // ── Données simulées ─────────────────────────────────
  const now   = new Date();
  const day   = (n) => new Date(now - n * 86400000).toISOString();

  G.documents = [
    { id:'ddoc1', name:'Rapport annuel 2024.pdf',       type:'pdf',   size:2457600,  scope:'company',  owner_id:DEMO_USER_ID, company_id:DEMO_COMPANY_ID, created_at:day(2),  updated_at:day(2),  views:24, downloads:8,  version:2, tags:['rapport','finance'], is_deleted:false },
    { id:'ddoc2', name:'Contrat fournisseur ABC.docx',  type:'word',  size:186000,   scope:'company',  owner_id:DEMO_USER_ID, company_id:DEMO_COMPANY_ID, created_at:day(5),  updated_at:day(3),  views:12, downloads:3,  version:1, tags:['contrat','juridique'], is_deleted:false },
    { id:'ddoc3', name:'Budget Q1 2025.xlsx',           type:'excel', size:524000,   scope:'company',  owner_id:'demo_user_002', company_id:DEMO_COMPANY_ID, created_at:day(7),  updated_at:day(7),  views:31, downloads:15, version:3, tags:['budget','finance'], is_deleted:false },
    { id:'ddoc4', name:'Présentation client.pptx',      type:'pptx',  size:3800000,  scope:'company',  owner_id:DEMO_USER_ID, company_id:DEMO_COMPANY_ID, created_at:day(10), updated_at:day(10), views:9,  downloads:2,  version:1, tags:['client','commercial'], is_deleted:false },
    { id:'ddoc5', name:'Notes de réunion RH.docx',      type:'word',  size:95000,    scope:'personal', owner_id:DEMO_USER_ID, company_id:DEMO_COMPANY_ID, created_at:day(1),  updated_at:day(1),  views:3,  downloads:1,  version:1, tags:['RH','réunion'], is_deleted:false },
    { id:'ddoc6', name:'Politique de confidentialité.pdf', type:'pdf', size:780000,  scope:'company',  owner_id:'demo_user_002', company_id:DEMO_COMPANY_ID, created_at:day(15), updated_at:day(15), views:44, downloads:20, version:1, tags:['juridique','RGPD'], is_deleted:false },
    { id:'ddoc7', name:'Plan de formation 2025.pdf',    type:'pdf',   size:1240000,  scope:'company',  owner_id:DEMO_USER_ID, company_id:DEMO_COMPANY_ID, created_at:day(3),  updated_at:day(3),  views:18, downloads:6,  version:1, tags:['RH','formation'], is_deleted:false },
    { id:'ddoc8', name:'Facture prestataire 03-2025.pdf', type:'pdf', size:312000,   scope:'personal', owner_id:DEMO_USER_ID, company_id:DEMO_COMPANY_ID, created_at:day(4),  updated_at:day(4),  views:2,  downloads:1,  version:1, tags:['facture','comptabilité'], is_deleted:false },
    { id:'ddoc9', name:'Logo entreprise.png',           type:'image', size:512000,   scope:'company',  owner_id:'demo_user_003', company_id:DEMO_COMPANY_ID, created_at:day(20), updated_at:day(20), views:55, downloads:30, version:1, tags:['design','brand'], is_deleted:false },
    { id:'ddoc10',name:'Procédure onboarding.docx',     type:'word',  size:228000,   scope:'company',  owner_id:DEMO_USER_ID, company_id:DEMO_COMPANY_ID, created_at:day(8),  updated_at:day(6),  views:22, downloads:11, version:4, tags:['RH','procédure'], is_deleted:false },
  ];

  G.workflows = [
    { id:'dwf1', title:'Validation rapport annuel',  status:'pending',  priority:'high',   document_id:'ddoc1', assignee_id:'demo_user_002', company_id:DEMO_COMPANY_ID, created_at:day(2),  due_date:day(-3), description:'Approbation direction requise' },
    { id:'dwf2', title:'Révision contrat fournisseur', status:'in_review', priority:'medium', document_id:'ddoc2', assignee_id:DEMO_USER_ID,    company_id:DEMO_COMPANY_ID, created_at:day(4),  due_date:day(-7), description:'Vérification clauses juridiques' },
    { id:'dwf3', title:'Approbation budget Q1',      status:'approved',  priority:'high',   document_id:'ddoc3', assignee_id:DEMO_USER_ID,    company_id:DEMO_COMPANY_ID, created_at:day(8),  due_date:day(-10), description:'Budget validé par la direction' },
    { id:'dwf4', title:'Mise à jour politique RGPD', status:'pending',   priority:'low',    document_id:'ddoc6', assignee_id:'demo_user_003', company_id:DEMO_COMPANY_ID, created_at:day(1),  due_date:day(-5), description:'Révision annuelle obligatoire' },
    { id:'dwf5', title:'Validation plan formation',  status:'rejected',  priority:'medium', document_id:'ddoc7', assignee_id:'demo_user_002', company_id:DEMO_COMPANY_ID, created_at:day(5),  due_date:day(-8), description:'Budget insuffisant — à revoir' },
  ];

  G.users = [
    { id:DEMO_USER_ID,    email:'demo@systemesged.fr',  name:'Sophie Martin',   role:'admin',   status:'active',            company_id:DEMO_COMPANY_ID, created_at:day(90) },
    { id:'demo_user_002', email:'jean.dupont@demo.fr',  name:'Jean Dupont',     role:'manager', status:'active',            company_id:DEMO_COMPANY_ID, created_at:day(60) },
    { id:'demo_user_003', email:'marie.curie@demo.fr',  name:'Marie Curie',     role:'editor',  status:'active',            company_id:DEMO_COMPANY_ID, created_at:day(45) },
    { id:'demo_user_004', email:'paul.blanc@demo.fr',   name:'Paul Blanc',      role:'viewer',  status:'active',            company_id:DEMO_COMPANY_ID, created_at:day(30) },
    { id:'demo_user_005', email:'lea.martin@demo.fr',   name:'Léa Martin',      role:'editor',  status:'pending_validation',company_id:DEMO_COMPANY_ID, created_at:day(2)  },
  ];

  G.tags = [
    { id:'dtag1', name:'finance',      color:'#3b82f6', count:3, company_id:DEMO_COMPANY_ID },
    { id:'dtag2', name:'juridique',    color:'#8b5cf6', count:2, company_id:DEMO_COMPANY_ID },
    { id:'dtag3', name:'RH',           color:'#10b981', count:3, company_id:DEMO_COMPANY_ID },
    { id:'dtag4', name:'contrat',      color:'#f59e0b', count:1, company_id:DEMO_COMPANY_ID },
    { id:'dtag5', name:'rapport',      color:'#6366f1', count:1, company_id:DEMO_COMPANY_ID },
    { id:'dtag6', name:'client',       color:'#ec4899', count:1, company_id:DEMO_COMPANY_ID },
    { id:'dtag7', name:'budget',       color:'#14b8a6', count:1, company_id:DEMO_COMPANY_ID },
    { id:'dtag8', name:'RGPD',         color:'#f43f5e', count:1, company_id:DEMO_COMPANY_ID },
  ];

  G.folders = [
    { id:'dfold1', name:'Finance',      parent_id:null,     company_id:DEMO_COMPANY_ID, created_at:day(90) },
    { id:'dfold2', name:'Juridique',    parent_id:null,     company_id:DEMO_COMPANY_ID, created_at:day(90) },
    { id:'dfold3', name:'Ressources Humaines', parent_id:null, company_id:DEMO_COMPANY_ID, created_at:day(90) },
    { id:'dfold4', name:'Commercial',   parent_id:null,     company_id:DEMO_COMPANY_ID, created_at:day(90) },
    { id:'dfold5', name:'2024',         parent_id:'dfold1', company_id:DEMO_COMPANY_ID, created_at:day(60) },
    { id:'dfold6', name:'2025',         parent_id:'dfold1', company_id:DEMO_COMPANY_ID, created_at:day(30) },
  ];

  G.shares = [
    { id:'dsh1', document_id:'ddoc1', sender_id:DEMO_USER_ID, recipient_email:'jean.dupont@demo.fr', recipient_id:'demo_user_002', permission:'view',     status:'active', created_at:day(2),  expires_at:null },
    { id:'dsh2', document_id:'ddoc3', sender_id:'demo_user_002', recipient_email:'demo@systemesged.fr', recipient_id:DEMO_USER_ID, permission:'edit',  status:'active', created_at:day(6),  expires_at:day(-30) },
    { id:'dsh3', document_id:'ddoc9', sender_id:'demo_user_003', recipient_email:'demo@systemesged.fr', recipient_id:DEMO_USER_ID, permission:'view',  status:'active', created_at:day(10), expires_at:null },
    { id:'dsh4', document_id:'ddoc4', sender_id:DEMO_USER_ID, recipient_email:'marie.curie@demo.fr',  recipient_id:'demo_user_003', permission:'view', status:'active', created_at:day(8),  expires_at:day(-15) },
  ];

  G.signatures     = [];
  G.automationRules= [
    { id:'drule1', name:'Archiver PDF > 30 jours', trigger:'age', condition:'type=pdf,days=30', action:'archive', active:true,  company_id:DEMO_COMPANY_ID, created_at:day(30) },
    { id:'drule2', name:'Notifier à l\'upload',    trigger:'upload', condition:'scope=company',  action:'notify',  active:true,  company_id:DEMO_COMPANY_ID, created_at:day(20) },
    { id:'drule3', name:'Tag auto contrat',        trigger:'upload', condition:'name=contrat',   action:'tag',     active:false, company_id:DEMO_COMPANY_ID, created_at:day(15) },
  ];
  G.apiKeys  = [];
  G.backups  = [
    { id:'dbk1', name:'Sauvegarde auto 14/04/2025', type:'auto', status:'completed', size:15728640, company_id:DEMO_COMPANY_ID, created_at:day(0) },
    { id:'dbk2', name:'Sauvegarde auto 07/04/2025', type:'auto', status:'completed', size:14680064, company_id:DEMO_COMPANY_ID, created_at:day(7) },
    { id:'dbk3', name:'Sauvegarde manuelle',        type:'manual',status:'completed', size:16777216, company_id:DEMO_COMPANY_ID, created_at:day(14) },
  ];
  G.auditLogs = [
    { id:'dal1', action:'login',        user_id:DEMO_USER_ID, user_email:'demo@systemesged.fr', resource_type:'session',  resource_id:'',      details:'Connexion réussie',              severity:'info',    created_at:day(0),  company_id:DEMO_COMPANY_ID },
    { id:'dal2', action:'upload',       user_id:DEMO_USER_ID, user_email:'demo@systemesged.fr', resource_type:'document', resource_id:'ddoc1', details:'Import: Rapport annuel 2024.pdf', severity:'info',    created_at:day(2),  company_id:DEMO_COMPANY_ID },
    { id:'dal3', action:'share_doc',    user_id:DEMO_USER_ID, user_email:'demo@systemesged.fr', resource_type:'document', resource_id:'ddoc1', details:'Partagé avec jean.dupont@demo.fr',severity:'info',    created_at:day(2),  company_id:DEMO_COMPANY_ID },
    { id:'dal4', action:'scope_change', user_id:'demo_user_002', user_email:'jean.dupont@demo.fr', resource_type:'document', resource_id:'ddoc3', details:'Portée modifiée → Entreprise',  severity:'warning', created_at:day(6),  company_id:DEMO_COMPANY_ID },
    { id:'dal5', action:'delete',       user_id:'demo_user_003', user_email:'marie.curie@demo.fr', resource_type:'document', resource_id:'ddoc8', details:'Suppression document',           severity:'warning', created_at:day(9),  company_id:DEMO_COMPANY_ID },
  ];
  G.systemLogs = [];

  if (typeof _shared !== 'undefined') {
    _shared.publicLinks = [];
  }

  // ── Bloquer les écritures Supabase en mode démo ──────
  G._isDemo = true;

  // ── Démarrer l'application ───────────────────────────
  G.currentFolderId = null;
  G.currentView     = 'dashboard';

  if (btn)     { btn.disabled = false; btn.style.opacity = '1'; }
  if (btnText) btnText.innerHTML = '<i class="fas fa-rocket mr-2"></i>Accès démo';

  updateUI();
  switchToMainApp();
  showToast('🎉 Mode démo activé — explorez librement !', 'success');
}
async function oauthLogin(provider) {
  try {
    const { error } = await G.supabase.auth.signInWithOAuth({
      provider: provider.toLowerCase(),
      options: { redirectTo: window.location.origin }
    });
    if (error) throw error;
  } catch (err) {
    showToast(`Connexion ${provider} non disponible : ${err.message}`, 'error');
  }
}

// ─── Navigation ───
function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active-view');

  G.currentView = viewName;
  closeMobileSidebar();

  // Synchroniser le active state de tous les boutons sidebar
  document.querySelectorAll('.sidebar-item').forEach(el => {
    el.classList.remove('active');
  });
  document.querySelectorAll(`[data-view="${viewName}"]`).forEach(el => {
    el.classList.add('active');
  });

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
  
  if (views[viewName]) { const r = views[viewName](); if (r instanceof Promise) r.catch(e => console.error('switchView error:', e)); }
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

// ─── Dashboard ───
async function renderDashboard() {
  console.log('🔄 Rendu du tableau de bord...');

  // ── Recharger les données fraîches depuis Supabase ──────────────
  if (G.supabase && G.currentUser?.companyId) {
    try {
      const [docsRes, wfsRes, sharesRes, usersRes, auditRes] = await Promise.all([
        G.supabase.from('documents').select('*').eq('company_id', G.currentUser.companyId).order('created_at', { ascending: false }),
        G.supabase.from('workflows').select('*').eq('company_id', G.currentUser.companyId),
        G.supabase.from('shares').select('*').or(`sender_id.eq.${G.currentUser.id},recipient_email.eq.${G.currentUser.email}`),
        G.supabase.from('profiles').select('*').eq('company_id', G.currentUser.companyId),
        G.supabase.from('audit_logs').select('*').eq('user_id', G.currentUser.id).order('created_at', { ascending: false }).limit(50)
      ]);
      if (!docsRes.error)  G.documents  = docsRes.data  || [];
      if (!wfsRes.error)   G.workflows  = wfsRes.data   || [];
      if (!sharesRes.error) G.shares    = sharesRes.data || [];
      if (!usersRes.error) G.users      = usersRes.data  || [];
      if (!auditRes.error) G.auditLogs  = auditRes.data  || [];
    } catch (err) {
      console.warn('renderDashboard: rechargement partiel échoué', err);
    }
  }

  const totalDocs        = G.documents.filter(d => !d.is_deleted).length;
  const activeWorkflows  = G.workflows.filter(w => ['pending', 'in_review'].includes(w.status)).length;
  const sharedCount      = G.shares.filter(s => s.status === 'active').length;
  const userCount        = G.users.length;
  const totalViews       = G.documents.reduce((sum, d) => sum + (d.views || 0), 0);
  const today            = new Date().toDateString();
  const activeUsers      = new Set(
    G.auditLogs.filter(l => l.action === 'login' && new Date(l.created_at).toDateString() === today).map(l => l.user_id)
  ).size;

  // Mise à jour des compteurs
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('totalDocs',           totalDocs);
  set('dashWorkflowCount',   activeWorkflows);
  set('sharedCount',         sharedCount);
  set('dashUserCount',       userCount);
  set('dashTotalViews',      totalViews);
  set('dashActiveUsers',     activeUsers || userCount);

  updateBadges();
  updateStorageDisplay();
  renderActivityList();
  renderQuickAccess();
  renderPopularTags();
  renderTeamDocs();
  renderMyWorkflows();

  console.log('✅ Tableau de bord mis à jour');
}

function renderActivityList() {
  const list = document.getElementById('activityList');
  if (!list) { console.warn('activityList non trouvé'); return; }

  let activities = [];

  if (G.auditLogs && G.auditLogs.length > 0) {
    activities = G.auditLogs.slice(0, 10);
  } else {
    // Construire des activités synthétiques depuis les vraies données
    const recentDocs = G.documents.filter(d => !d.is_deleted).slice(0, 5);
    recentDocs.forEach(doc => activities.push({
      action: 'upload', target_type: 'document', target_id: doc.id,
      details: doc.name, created_at: doc.created_at
    }));
    const recentShares = G.shares.filter(s => s.sender_id === G.currentUser?.id).slice(0, 3);
    recentShares.forEach(share => activities.push({
      action: 'share', target_type: 'document', target_id: share.document_id,
      details: `Partagé avec ${share.recipient_email}`, created_at: share.created_at
    }));
    activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    activities = activities.slice(0, 10);
  }

  if (activities.length === 0) {
    list.innerHTML = `
      <div class="text-center py-8 text-blue-300/50">
        <i class="fas fa-folder-open text-2xl mb-2 block"></i>
        <p>Aucune activité récente</p>
        <p class="text-xs mt-2">Importez des documents pour voir l'activité</p>
      </div>`;
    return;
  }

  list.innerHTML = activities.map(act => `
    <div class="flex items-center gap-3 p-3 rounded-xl bg-blue-900/20 border border-blue-500/10 hover:bg-blue-900/30 transition-all group">
      <div class="w-8 h-8 rounded-lg ${getActionBgColor(act.action)} flex items-center justify-center flex-shrink-0">
        <i class="fas ${getActionIcon(act.action)} text-sm"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white">${getActionLabel(act.action)}${act.target_type ? ' · ' + act.target_type : ''}</p>
        <p class="text-xs text-blue-300/60 truncate">${act.details ? act.details.substring(0, 50) + (act.details.length > 50 ? '…' : '') : ''}</p>
        <p class="text-xs text-blue-400/50 mt-0.5">${formatDate(act.created_at)}</p>
      </div>
      ${act.target_id ? `<button onclick="openPreviewModal('${act.target_id}')" class="text-blue-400 hover:text-blue-300 text-xs opacity-0 group-hover:opacity-100 transition-opacity"><i class="fas fa-eye"></i></button>` : ''}
    </div>
  `).join('');
}

function getActionBgColor(action) {
  const colors = {
    login: 'bg-green-500/20',
    logout: 'bg-gray-500/20',
    upload: 'bg-blue-500/20',
    download: 'bg-purple-500/20',
    share: 'bg-cyan-500/20',
    delete: 'bg-red-500/20',
    restore: 'bg-green-500/20',
    view: 'bg-yellow-500/20',
    workflow: 'bg-orange-500/20',
    signature: 'bg-pink-500/20'
  };
  return colors[action] || 'bg-blue-500/20';
}

function getActionLabel(action) {
  const labels = {
    login: 'Connexion',
    logout: 'Déconnexion',
    upload: 'Import de document',
    download: 'Téléchargement',
    share: 'Partage de document',
    delete: 'Suppression',
    restore: 'Restauration',
    view: 'Consultation',
    workflow: 'Workflow',
    signature: 'Signature'
  };
  return labels[action] || action;
}

function getActionIcon(action) {
  const icons = { 
    login: 'fa-sign-in-alt', 
    logout: 'fa-sign-out-alt', 
    upload: 'fa-upload', 
    download: 'fa-download', 
    share: 'fa-share', 
    delete: 'fa-trash', 
    restore: 'fa-undo', 
    view_change: 'fa-eye', 
    validate: 'fa-check', 
    reject: 'fa-times' 
  };
  return icons[action] || 'fa-circle';
}

function renderQuickAccess() {
  const pdfCount = G.documents.filter(d => !d.is_deleted && d.type === 'pdf').length;
  const docCount = G.documents.filter(d => !d.is_deleted && d.type === 'doc').length;
  
  const quickPdfCount = document.getElementById('quickPdfCount');
  const quickDocCount = document.getElementById('quickDocCount');
  
  if (quickPdfCount) quickPdfCount.textContent = `${pdfCount} fichier(s)`;
  if (quickDocCount) quickDocCount.textContent = `${docCount} fichier(s)`;
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
  if (!list) {
    console.warn('teamDocsList non trouvé');
    return;
  }
  
  // Afficher les documents de l'entreprise ou les documents récents
  let docs = G.documents.filter(d => !d.is_deleted);
  
  // Priorité aux documents d'entreprise
  const companyDocs = docs.filter(d => d.scope === 'company');
  if (companyDocs.length > 0) {
    docs = companyDocs;
  }
  
  docs = docs.slice(0, 5);
  
  if (docs.length === 0) {
    list.innerHTML = `
      <div class="text-center py-6">
        <i class="fas fa-folder-open text-blue-400/40 text-3xl mb-2 block"></i>
        <p class="text-blue-300/50 text-sm">Aucun document d'équipe</p>
        <button onclick="openUploadModal()" class="mt-2 text-xs text-blue-400 hover:text-blue-300">Importer un document →</button>
      </div>
    `;
    return;
  }
  
  list.innerHTML = docs.map(doc => `
    <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-500/10 cursor-pointer transition-all group" onclick="openPreviewModal('${doc.id}')">
      <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
        <i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-lg"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white font-medium truncate">${escapeHtml(doc.name)}</p>
        <div class="flex items-center gap-2 mt-0.5">
          <span class="text-xs text-blue-300/60">${formatBytes(doc.size)}</span>
          <span class="text-xs text-blue-400/50">•</span>
          <span class="text-xs text-blue-300/60">${formatDate(doc.created_at)}</span>
          ${doc.scope === 'company' ? `<span class="collab-badge text-[10px]"><i class="fas fa-building"></i>Équipe</span>` : ''}
        </div>
      </div>
      <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onclick="event.stopPropagation(); downloadDocument('${doc.id}')" class="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400" title="Télécharger">
          <i class="fas fa-download text-xs"></i>
        </button>
        <button onclick="event.stopPropagation(); openMoveModal('${doc.id}')" class="p-1.5 rounded-lg hover:bg-yellow-500/20 text-yellow-400" title="Déplacer">
          <i class="fas fa-folder-open text-xs"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function renderMyWorkflows() {
  const list = document.getElementById('myWorkflowsList');
  const badge = document.getElementById('myWorkflowsBadge');
  if (!list) return;
  
  const myWfs = G.workflows.filter(w => 
    (w.assignee_id === G.currentUser.id || w.created_by === G.currentUser.id) && 
    ['pending', 'in_review'].includes(w.status)
  ).slice(0, 5);
  
  if (badge) {
    if (myWfs.length > 0) {
      badge.textContent = myWfs.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
  
  if (myWfs.length === 0) {
    list.innerHTML = `
      <div class="text-center py-6">
        <i class="fas fa-project-diagram text-orange-400/40 text-3xl mb-2 block"></i>
        <p class="text-blue-300/50 text-sm">Aucun workflow assigné</p>
        <button onclick="openCreateWorkflowModal()" class="mt-2 text-xs text-orange-400 hover:text-orange-300">Créer un workflow →</button>
      </div>
    `;
    return;
  }
  
  list.innerHTML = myWfs.map(wf => `
    <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-orange-500/10 cursor-pointer transition-all group" onclick="openWfDetail('${wf.id}')">
      <div class="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-400 flex-shrink-0">
        <i class="fas fa-project-diagram text-lg"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white font-medium truncate">${escapeHtml(wf.title)}</p>
        <div class="flex items-center gap-2 mt-1">
          <span class="text-xs px-2 py-0.5 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span>
          <span class="text-xs text-blue-300/50">${formatDate(wf.created_at)}</span>
        </div>
      </div>
      <div class="opacity-0 group-hover:opacity-100 transition-opacity">
        <i class="fas fa-chevron-right text-blue-400/50"></i>
      </div>
    </div>
  `).join('');
}

// ─── Documents ───
async function renderDocuments() {
  const grid = document.getElementById('documentGrid');
  if (!grid) { console.warn('documentGrid non trouvé'); return; }

  console.log('🔄 Rendu des documents, tab:', G.docsTab);

  // Recharger les documents depuis Supabase si disponible
  if (G.supabase && G.currentUser?.companyId) {
    try {
      const { data, error } = await G.supabase
        .from('documents')
        .select('*')
        .eq('company_id', G.currentUser.companyId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      if (!error && data) G.documents = data;
    } catch (err) {
      console.warn('renderDocuments: rechargement échoué', err);
    }
  }

  let filtered = G.documents.filter(d => !d.is_deleted);

  if (G.currentTagFilter) {
    filtered = filtered.filter(d => Array.isArray(d.tags) && d.tags.includes(G.currentTagFilter));
  }

  const isAdmin   = G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
  const isManager = G.currentUser?.role === 'manager' || isAdmin;

  // Filtrer selon l'onglet
  if (G.docsTab === 'company') {
    filtered = filtered.filter(d => d.scope === 'company');
  } else if (G.docsTab === 'personal') {
    // Admin & manager voient les personnels de TOUS les utilisateurs
    if (isManager) {
      filtered = filtered.filter(d => d.scope === 'personal');
    } else {
      filtered = filtered.filter(d => d.scope === 'personal' && d.owner_id === G.currentUser.id);
    }
  } else if (G.docsTab === 'mine') {
    filtered = filtered.filter(d => d.owner_id === G.currentUser.id);
  } else if (G.docsTab === 'all') {
    // Onglet "Tous" : admin & manager uniquement — aucun filtre scope
    if (!isManager) filtered = filtered.filter(d =>
      d.scope === 'company' || d.owner_id === G.currentUser.id
    );
  } else if (G.docsTab === 'shared') {
    const sharedIds = new Set(
      G.shares
        .filter(s => s.recipient_email === G.currentUser.email && s.status === 'active')
        .map(s => s.document_id)
    );
    filtered = filtered.filter(d => sharedIds.has(d.id));
  }
  // Filtre par type
  const typeFilter = document.getElementById('filterType')?.value;
  if (typeFilter) filtered = filtered.filter(d => d.type === typeFilter);

  // Filtre par date
  const dateFilter = document.getElementById('filterDate')?.value;
  if (dateFilter === 'today') {
    const today = new Date().toDateString();
    filtered = filtered.filter(d => new Date(d.created_at).toDateString() === today);
  } else if (dateFilter === 'week') {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    filtered = filtered.filter(d => new Date(d.created_at) >= weekAgo);
  } else if (dateFilter === 'month') {
    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
    filtered = filtered.filter(d => new Date(d.created_at) >= monthAgo);
  }

  const resultsCount = document.getElementById('resultsCount');
  if (resultsCount) resultsCount.textContent = `${filtered.length} document${filtered.length > 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    const msgs = {
      company:  'Aucun document d\'entreprise. Importez des documents pour les partager avec votre équipe.',
      personal: 'Aucun document personnel. Importez vos documents privés.',
      mine:     'Vous n\'avez pas encore importé de documents.',
      shared:   'Aucun document partagé avec vous.'
    };
    grid.innerHTML = `
      <div class="col-span-full text-center py-16">
        <i class="fas fa-folder-open text-5xl mb-4 block opacity-20 text-blue-400"></i>
        <p class="text-blue-300/60">${msgs[G.docsTab] || 'Aucun document trouvé.'}</p>
        <button onclick="openUploadModal()" class="mt-4 btn-primary px-5 py-2 rounded-xl text-white text-sm font-medium inline-flex items-center gap-2">
          <i class="fas fa-cloud-upload-alt"></i>Importer un document
        </button>
      </div>`;
    return;
  }

  grid.className = G.viewMode === 'grid' ? 'doc-grid' : 'space-y-2';
  grid.innerHTML = filtered.map(doc =>
    G.viewMode === 'grid' ? renderDocCard(doc) : renderDocListItem(doc)
  ).join('');

  console.log(`✅ ${filtered.length} documents affichés`);
}

// ── Badge scope cliquable (personnel ↔ entreprise) ──────
function buildScopeBadge(doc) {
  const isOwner   = doc.owner_id === G.currentUser.id;
  const isAdmin   = G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
  const isManager = G.currentUser?.role === 'manager' || isAdmin;
  const canChange = isOwner || isManager;
  if (doc.scope === 'company') {
    return canChange
      ? `<button onclick="event.stopPropagation(); changeDocScope('${doc.id}', 'personal')"
                 class="collab-badge text-[10px] hover:bg-blue-600/40 transition-colors cursor-pointer"
                 title="Passer en Personnel">
           <i class="fas fa-building mr-1"></i>Entreprise
           <i class="fas fa-exchange-alt ml-1 opacity-50"></i>
         </button>`
      : `<span class="collab-badge text-[10px]"><i class="fas fa-building mr-1"></i>Entreprise</span>`;
  } else {
    return canChange
      ? `<button onclick="event.stopPropagation(); changeDocScope('${doc.id}', 'company')"
                 class="text-[10px] text-purple-400/80 hover:text-purple-300 hover:bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20 transition-colors cursor-pointer"
                 title="Partager avec l'entreprise">
           <i class="fas fa-user mr-1"></i>Personnel
           <i class="fas fa-exchange-alt ml-1 opacity-50"></i>
         </button>`
      : `<span class="text-[10px] text-purple-400/60"><i class="fas fa-user mr-1"></i>Personnel</span>`;
  }
}

// ── Changer la portée d'un document ─────────────────────
async function changeDocScope(docId, newScope) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  const isOwner   = doc.owner_id === G.currentUser.id;
  const isAdmin   = G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
  const isManager = G.currentUser?.role === 'manager' || isAdmin;
  if (!isOwner && !isManager) {
    showToast('Permission refusée', 'error');
    return;
  }
  const label = newScope === 'company' ? 'Entreprise' : 'Personnel';
  const icon  = newScope === 'company' ? 'fa-building' : 'fa-user';
  if (!confirm(`Passer "${doc.name}" en mode ${label} ?\n\n${
    newScope === 'company'
      ? 'Ce document sera visible par tous les membres de l\'entreprise.'
      : 'Ce document ne sera plus visible que par vous (et les administrateurs).'
  }`)) return;
  try {
    const { error } = await G.supabase
      .from('documents')
      .update({ scope: newScope, updated_at: new Date().toISOString() })
      .eq('id', docId);
    if (error) throw error;
    doc.scope = newScope;
    await addAuditLog(
      'scope_change', 'document', docId,
      `Portée modifiée → ${label} par ${G.currentUser.email}`
    );
    showToast(
      `<i class="fas ${icon} mr-2"></i>"${doc.name}" → ${label}`,
      'success'
    );
    renderDocuments();
  } catch (err) {
    showToast('Erreur : ' + err.message, 'error');
  }
}

function filterDocuments(query) {
  if (!query || !query.trim()) { renderDocuments(); return; }
  const q = query.toLowerCase();
  const filtered = G.documents.filter(d =>
    !d.is_deleted && (
      d.name.toLowerCase().includes(q) ||
      (d.description||'').toLowerCase().includes(q) ||
      (Array.isArray(d.tags) && d.tags.some(t=>t.toLowerCase().includes(q)))
    )
  );
  const container = document.getElementById('docGrid') || document.getElementById('documentsGrid');
  if (container) {
    if (filtered.length === 0) {
      container.innerHTML = '<div class="col-span-full text-center py-12 text-blue-300/40"><i class="fas fa-search text-4xl mb-3 block opacity-20"></i><p>Aucun résultat pour \"'+escapeHtml(query)+'\"</p></div>';
    } else {
      container.innerHTML = filtered.map(doc => renderDocCard(doc)).join('');
    }
  }
}

function renderDocCard(doc) {
  const isOwner = doc.owner_id === G.currentUser.id;
  const canEdit = isOwner || G.currentUser.role === 'admin' || G.currentUser.role === 'manager';
  const fileIcon = getFileIcon(doc.type);
  const iconClass = fileIcon.split(' ')[0];
  const colorClass = fileIcon.split(' ')[1] || 'text-blue-400';
  
  return `
    <div class="document-card glass-card rounded-2xl p-4 border border-blue-500/20 cursor-pointer group hover:scale-[1.02] transition-all duration-200" 
         onclick="openPreviewModal('${doc.id}')" 
         draggable="true" 
         ondragstart="handleDocDragStart(event, '${doc.id}')" 
         oncontextmenu="showDocContextMenu(event, '${doc.id}')">
      
      <!-- En-tête avec icône et actions -->
      <div class="flex items-start justify-between mb-3">
        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center ${colorClass} text-2xl">
          <i class="fas ${iconClass}"></i>
        </div>
        <div class="opacity-0 group-hover:opacity-100 transition-all duration-200 flex gap-1">
          <button onclick="event.stopPropagation(); downloadDocument('${doc.id}')" 
                  class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors" 
                  title="Télécharger">
            <i class="fas fa-download"></i>
          </button>
          <button onclick="event.stopPropagation(); openShareModal('${doc.id}')" 
                  class="p-2 rounded-lg hover:bg-purple-500/20 text-purple-400 transition-colors" 
                  title="Partager">
            <i class="fas fa-share-alt"></i>
          </button>
          <button onclick="event.stopPropagation(); openCollabModal('${doc.id}')" 
                  class="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-colors" 
                  title="Inviter à collaborer">
            <i class="fas fa-users"></i>
          </button>
          <button onclick="event.stopPropagation(); openMoveModal('${doc.id}')" 
                  class="p-2 rounded-lg hover:bg-yellow-500/20 text-yellow-400 transition-colors" 
                  title="Déplacer">
            <i class="fas fa-folder-open"></i>
          </button>
          ${canEdit ? `
          <button onclick="event.stopPropagation(); deleteDocument('${doc.id}')" 
                  class="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors" 
                  title="Supprimer">
            <i class="fas fa-trash"></i>
          </button>
          ` : ''}
        </div>
      </div>
      
      <!-- Informations du document -->
      <h4 class="text-white font-semibold text-sm mb-1 truncate" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</h4>
      <p class="text-blue-300/60 text-xs mb-2">
        ${formatBytes(doc.size)} • ${formatDate(doc.created_at)}
      </p>
      
      <!-- Tags et scope -->
      <div class="flex items-center justify-between">
        <div class="flex gap-1 flex-wrap">
  ${(doc.tags || []).slice(0, 2).map(t => `<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 cursor-pointer hover:bg-blue-400/30" onclick="event.stopPropagation(); filterByTag('${escapeHtml(t)}')">${escapeHtml(t)}</span>`).join('')}
  ${(doc.tags || []).length > 2 ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">+${doc.tags.length - 2}</span>` : ''}
</div>
        ${buildScopeBadge(doc)}
      </div>
      
      <!-- Métadonnées supplémentaires -->
      <div class="mt-2 pt-2 border-t border-blue-500/10 flex items-center justify-between text-xs">
        <span class="text-blue-400/50">
          <i class="fas fa-code-branch mr-1"></i>v${doc.version || 1}
        </span>
        <span class="text-blue-400/50">
          <i class="fas fa-eye mr-1"></i>${doc.views || 0}
        </span>
        <span class="text-blue-400/50">
          <i class="fas fa-download mr-1"></i>${doc.downloads || 0}
        </span>
      </div>
    </div>
  `;
}

function renderDocListItem(doc) {
  const isOwner = doc.owner_id === G.currentUser.id;
  const canEdit = isOwner || G.currentUser.role === 'admin' || G.currentUser.role === 'manager';
  const fileIcon = getFileIcon(doc.type);
  const iconClass = fileIcon.split(' ')[0];
  const colorClass = fileIcon.split(' ')[1] || 'text-blue-400';
  
  return `
    <div class="doc-list-item glass-card rounded-xl border border-blue-500/10 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all cursor-pointer group" 
         onclick="openPreviewModal('${doc.id}')">
      
      <!-- Icône -->
      <div class="doc-icon w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center ${colorClass} flex-shrink-0">
        <i class="fas ${iconClass} text-xl"></i>
      </div>
      
      <!-- Contenu principal -->
      <div class="doc-content flex-1 min-w-0">
        <h4 class="text-white font-medium text-sm truncate" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</h4>
        <div class="flex items-center gap-3 mt-1">
          <p class="text-blue-300/60 text-xs">${formatBytes(doc.size)}</p>
          <span class="text-blue-400/40">•</span>
          <p class="text-blue-300/60 text-xs">${formatDate(doc.created_at)}</p>
          ${buildScopeBadge(doc)}
        </div>
        <div class="flex gap-2 mt-1">
  ${(doc.tags || []).slice(0, 3).map(t => `<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 cursor-pointer hover:bg-blue-400/30" onclick="event.stopPropagation(); filterByTag('${escapeHtml(t)}')">${escapeHtml(t)}</span>`).join('')}
        </div>
      </div>
      
      <!-- Métadonnées supplémentaires -->
      <div class="hidden sm:flex items-center gap-4 text-xs text-blue-400/50 mr-4">
        <span><i class="fas fa-code-branch mr-1"></i>v${doc.version || 1}</span>
        <span><i class="fas fa-eye mr-1"></i>${doc.views || 0}</span>
        <span><i class="fas fa-download mr-1"></i>${doc.downloads || 0}</span>
      </div>
      
      <!-- Actions -->
      <div class="doc-actions flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <button onclick="event.stopPropagation(); downloadDocument('${doc.id}')" 
                class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors" 
                title="Télécharger">
          <i class="fas fa-download"></i>
        </button>
        <button onclick="event.stopPropagation(); openShareModal('${doc.id}')" 
                class="p-2 rounded-lg hover:bg-purple-500/20 text-purple-400 transition-colors" 
                title="Partager">
          <i class="fas fa-share-alt"></i>
        </button>
        <button onclick="event.stopPropagation(); openCollabModal('${doc.id}')" 
                class="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-colors" 
                title="Inviter à collaborer">
          <i class="fas fa-users"></i>
        </button>
        <button onclick="event.stopPropagation(); openMoveModal('${doc.id}')" 
                class="p-2 rounded-lg hover:bg-yellow-500/20 text-yellow-400 transition-colors" 
                title="Déplacer">
          <i class="fas fa-folder-open"></i>
        </button>
        ${canEdit ? `
        <button onclick="event.stopPropagation(); deleteDocument('${doc.id}')" 
                class="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors" 
                title="Supprimer">
          <i class="fas fa-trash"></i>
        </button>
        ` : ''}
      </div>
    </div>
  `;
}

async function switchDocsTab(tab) {
  console.log('🔄 Changement d\'onglet documents:', tab);
  G.docsTab = tab;

  // Mettre à jour l'interface des onglets
  document.querySelectorAll('.docs-tab').forEach(el => el.classList.remove('active'));
  const tabEl = document.getElementById(`docsTab-${tab}`);
  if (tabEl) tabEl.classList.add('active');

  const docTitle = document.getElementById('documentsTitle');
  if (docTitle) {
    const titles = {
      company: 'Documents de l\'entreprise',
      personal: 'Mes documents personnels',
      mine: 'Mes documents',
      shared: 'Documents partagés avec moi'
    };
    docTitle.textContent = titles[tab] || 'Documents';
  }

  // Afficher loader
  const grid = document.getElementById('documentGrid');
  if (grid) {
    grid.innerHTML = '<div class="col-span-full text-center py-12"><i class="fas fa-spinner fa-spin text-3xl text-blue-400"></i><p class="mt-2 text-blue-300/60">Chargement…</p></div>';
  }

  // Recharger depuis Supabase selon l'onglet
  if (G.supabase && G.currentUser?.companyId) {
    try {
      let query = G.supabase.from('documents').select('*')
        .eq('is_deleted', false)
        .eq('company_id', G.currentUser.companyId)
        .order('created_at', { ascending: false });

      if (tab === 'company') {
        query = query.eq('scope', 'company');
      } else if (tab === 'personal') {
        // Admin/manager voient tous les personnels, les autres seulement les leurs
        const isManager = G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin || G.currentUser?.role === 'manager';
        if (isManager) {
          query = query.eq('scope', 'personal');
        } else {
          query = query.eq('scope', 'personal').eq('owner_id', G.currentUser.id);
        }
      } else if (tab === 'all') {
        // Aucun filtre supplémentaire — tous les docs de l'entreprise
      } else if (tab === 'mine') {
        query = query.eq('owner_id', G.currentUser.id);
      } else if (tab === 'shared') {
        // Charger les partages reçus puis filtrer les documents correspondants
        const { data: receivedShares } = await G.supabase
          .from('shares')
          .select('document_id')
          .eq('recipient_email', G.currentUser.email)
          .eq('status', 'active');
        const ids = (receivedShares || []).map(s => s.document_id).filter(Boolean);
        if (ids.length === 0) {
          G.documents = G.documents.filter(d => d.scope !== 'personal' || d.owner_id === G.currentUser.id);
          renderDocuments();
          return;
        }
        query = G.supabase.from('documents').select('*').in('id', ids).eq('is_deleted', false);
      }

      const { data, error } = await query;
      if (!error && data) {
        // Fusionner avec G.documents (ne pas perdre les autres onglets)
        const newIds = new Set(data.map(d => d.id));
        G.documents = [
          ...data,
          ...G.documents.filter(d => !newIds.has(d.id))
        ];
      }
    } catch (err) {
      console.warn('switchDocsTab: erreur Supabase', err);
    }
  }

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
  G.currentTagFilter = null;   // Ajout
  renderDocuments();
}

function filterByType(type) {
  const filterType = document.getElementById('filterType');
  if (filterType) filterType.value = type;
  switchView('documents');
}

function filterByTag(tagName) {
  G.currentTagFilter = tagName;
  renderDocuments();
  showToast(`Filtre appliqué : ${tagName}`, 'info');
}
function clearTagFilter() {
  G.currentTagFilter = null;
  renderDocuments();
  showToast('Filtre tag réinitialisé', 'info');
}

// ─── Upload ───
function openUploadModal() {
  const modal = document.getElementById('uploadModal');
  if (modal) modal.classList.remove('hidden');
  G.selectedFiles = [];
  G.uploadTags = [];
  renderUploadTags();
  renderSelectedFiles();
}

function closeUploadModal() {
  const modal = document.getElementById('uploadModal');
  if (modal) modal.classList.add('hidden');
  G.selectedFiles = [];
}

function handleDragOver(e, zoneId) {
  e.preventDefault();
  const zone = document.getElementById(zoneId);
  if (zone) zone.classList.add('drag-over');
}

function handleDragLeave(e, zoneId) {
  e.preventDefault();
  const zone = document.getElementById(zoneId);
  if (zone) zone.classList.remove('drag-over');
}

function handleDrop(e, zoneId) {
  e.preventDefault();
  const zone = document.getElementById(zoneId);
  if (zone) zone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  addFilesToSelection(files);
}

function handleDocDrop(e) {
  e.preventDefault();
  const dropZone = document.getElementById('docDropZone');
  if (dropZone) {
    dropZone.classList.remove('drag-over');
    // Ajouter un effet visuel temporaire
    dropZone.style.backgroundColor = 'rgba(59,130,246,0.05)';
    setTimeout(() => {
      dropZone.style.backgroundColor = '';
    }, 300);
  }
  
  const files = Array.from(e.dataTransfer.files);
  
  if (files.length === 0) {
    showToast('Aucun fichier détecté', 'warning');
    return;
  }
  
  // Filtrer les fichiers trop volumineux
  const validFiles = files.filter(f => f.size <= CONFIG.maxFileSize);
  const invalidFiles = files.filter(f => f.size > CONFIG.maxFileSize);
  
  if (invalidFiles.length > 0) {
    showToast(`${invalidFiles.length} fichier(s) ignoré(s) (taille > ${formatBytes(CONFIG.maxFileSize)})`, 'warning');
  }
  
  if (validFiles.length === 0) {
    showToast('Aucun fichier valide à importer', 'warning');
    return;
  }
  
  addFilesToSelection(validFiles);
  
  // Auto-upload après ajout
  setTimeout(() => {
    if (G.selectedFiles.length > 0) {
      uploadDocument();
    }
  }, 100);
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  addFilesToSelection(files);
}

function handleFilePickerSelect(e) {
  const files = Array.from(e.target.files);
  
  if (files.length === 0) return;
  
  // Filtrer les fichiers trop volumineux
  const validFiles = files.filter(f => f.size <= CONFIG.maxFileSize);
  const invalidFiles = files.filter(f => f.size > CONFIG.maxFileSize);
  
  if (invalidFiles.length > 0) {
    showToast(`${invalidFiles.length} fichier(s) ignoré(s) (taille > ${formatBytes(CONFIG.maxFileSize)})`, 'warning');
  }
  
  if (validFiles.length === 0) {
    showToast('Aucun fichier valide à importer', 'warning');
    return;
  }
  
  addFilesToSelection(validFiles);
  
  // Auto-upload après sélection
  setTimeout(() => {
    if (G.selectedFiles.length > 0) {
      uploadDocument();
    }
  }, 100);
  
  // Réinitialiser l'input pour permettre de sélectionner à nouveau les mêmes fichiers
  e.target.value = '';
}

function renderSelectedFiles() {
  const list = document.getElementById('selectedFilesList');
  if (!list) return;
  
  if (G.selectedFiles.length === 0) {
    list.innerHTML = '';
    return;
  }
  
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
    if (input) input.value = '';
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
  if (G._isDemo) { showToast('Mode démo : import désactivé — rechargez la page pour créer un vrai compte', 'warning'); return; }
  if (G.selectedFiles.length === 0) {
    showToast('Aucun fichier sélectionné', 'warning');
    return;
  }

  // Calculer l'espace utilisé
  const used = G.documents.reduce((sum, d) => sum + (d.size || 0), 0);
  const limit = CONFIG.plans[G.currentUser.plan].storage;
  const newTotalSize = G.selectedFiles.reduce((sum, f) => sum + f.size, 0);

  if (used + newTotalSize > limit) {
    showToast(`Espace insuffisant. Libre : ${formatBytes(limit - used)}`, 'error');
    return;
  }
  
  // Vérifier la connexion Supabase
  if (!G.supabase) {
    showToast('Erreur de connexion à la base de données', 'error');
    return;
  }
  
  // Vérifier le dossier courant
  if (!G.currentFolderId) {
    await setRootFolder();
    if (!G.currentFolderId) {
      showToast('Erreur: dossier racine non trouvé', 'error');
      return;
    }
  }
  
  const folderId = G.currentFolderId;
  let successCount = 0;
  let errorCount = 0;
  
  // Afficher une barre de progression
  const progressContainer = document.getElementById('uploadProgress');
  const progressBar = document.getElementById('uploadProgressBar');
  const progressPercent = document.getElementById('uploadPercent');
  const statusText = document.getElementById('uploadStatusText');
  
  if (progressContainer) {
    progressContainer.classList.remove('hidden');
  }
  
  for (let i = 0; i < G.selectedFiles.length; i++) {
    const file = G.selectedFiles[i];
    const docId = generateId();
    const fileExt = file.name.split('.').pop().toLowerCase();
    const storagePath = `${G.currentUser.companyId}/${docId}.${fileExt}`;
    
    // Mettre à jour la progression
    const percent = Math.round(((i + 1) / G.selectedFiles.length) * 100);
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (statusText) statusText.textContent = `Import de ${file.name}... (${i + 1}/${G.selectedFiles.length})`;
    
    try {
      // 1. Upload vers Supabase Storage
      const { error: uploadErr } = await G.supabase.storage
        .from(CONFIG.storageBucket)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (uploadErr) {
        console.error('Upload storage error:', uploadErr);
        throw new Error(`Upload storage: ${uploadErr.message}`);
      }
      
      // 2. Récupérer l'URL publique
      const { data: publicUrlData } = G.supabase.storage
  .from(CONFIG.storageBucket)
  .getPublicUrl(storagePath);

if (!publicUrlData?.publicUrl) {
  throw new Error("Impossible de récupérer l'URL publique");
}
      
      // 3. Créer l'entrée en base de données
      const doc = {
        id: docId,
        name: document.getElementById('docNameInput')?.value.trim() || file.name,
        type: getFileType(file.name),
        size: file.size,
        description: document.getElementById('docDescInput')?.value.trim() || '',
        scope: G._uploadScope || 'company',
        owner_id: G.currentUser.id,
        company_id: G.currentUser.companyId,
        folder_id: folderId,
        tags: G.uploadTags,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
        views: 0,
        downloads: 0,
        is_deleted: false,
        deleted_at: null,
        content: '',
        storage_path: storagePath,
        file_url: publicUrlData.publicUrl
      };
      
      const { error: dbErr } = await G.supabase.from('documents').insert(doc);
      if (dbErr) {
        await G.supabase.storage.from(CONFIG.storageBucket).remove([storagePath]);
  	throw new Error(`Base de données: ${dbErr.message}`);
      }
      
      // Ajouter à l'état local
      G.documents.unshift(doc);
      successCount++;
      
      // Log d'audit
      await addAuditLog('upload', 'document', doc.id, `Fichier: ${file.name}, Taille: ${formatBytes(file.size)}`);
      
    } catch (err) {
      console.error(`Erreur upload ${file.name}:`, err);
      errorCount++;
      showToast(`Erreur: ${file.name} - ${err.message}`, 'error');
    }
  }
  
  // Masquer la barre de progression
  if (progressContainer) {
    setTimeout(() => {
      progressContainer.classList.add('hidden');
      if (progressBar) progressBar.style.width = '0%';
      if (progressPercent) progressPercent.textContent = '0%';
    }, 1000);
  }
  
  // Afficher le résumé
  if (successCount > 0) {
    showToast(`${successCount} fichier(s) importé(s) avec succès${errorCount > 0 ? `, ${errorCount} erreur(s)` : ''}`, successCount > 0 ? 'success' : 'warning');
  }
  
  // Réinitialiser et rafraîchir
  G.selectedFiles = [];
  G.uploadTags = [];
  renderUploadTags();
  renderSelectedFiles();
  closeUploadModal();
  renderDocuments();
  updateBadges();
  updateStorageDisplay();
}

function setDocScope(scope) {
  G._uploadScope = scope;
  const scopeCompany = document.getElementById('scopeCompany');
  const scopePersonal = document.getElementById('scopePersonal');
  
  if (scopeCompany && scopePersonal) {
    if (scope === 'company') {
      scopeCompany.classList.add('bg-blue-500/15', 'border-blue-500/40', 'text-blue-300');
      scopePersonal.classList.remove('bg-blue-500/15', 'border-blue-500/40', 'text-blue-300');
      scopePersonal.classList.add('bg-slate-800/40', 'border-transparent', 'text-gray-400');
    } else {
      scopePersonal.classList.add('bg-purple-500/15', 'border-purple-500/40', 'text-purple-300');
      scopeCompany.classList.remove('bg-purple-500/15', 'border-purple-500/40', 'text-purple-300');
      scopeCompany.classList.add('bg-slate-800/40', 'border-transparent', 'text-gray-400');
    }
  }
}

// ─── Preview et téléchargement ───
function openPreviewModal(docId) {
  G.currentDocId = docId;
  const modal = document.getElementById('previewModal');
  if (modal) modal.classList.remove('hidden');

  const doc = G.documents.find(d => d.id === docId);
  if (!doc) { showToast('Document introuvable', 'error'); return; }

  showPreviewLoading();

  const titleEl = document.getElementById('previewTitle');
  if (titleEl) titleEl.textContent = doc.name;
  updatePreviewMetadata(doc);

  const fileUrl = doc.file_url;
  if (!fileUrl) { hidePreviewLoading(); showUnsupportedPreview(doc); updateDocViews(docId); return; }

  // Détecter l'extension: nom > storage_path > type
  const nameExt  = doc.name && doc.name.includes('.') ? doc.name.split('.').pop().toLowerCase() : '';
  const pathExt  = doc.storage_path ? doc.storage_path.split('.').pop().toLowerCase() : '';
  const fileExt  = nameExt || pathExt;
  const fileType = doc.type || '';
  const typeToExt = { img:'jpg', pdf:'pdf', doc:'docx', xls:'xlsx', ppt:'pptx', txt:'txt', video:'mp4', audio:'mp3', code:'js' };
  const effectiveExt = fileExt || typeToExt[fileType] || '';
  const isImage = fileType === 'img' || ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(effectiveExt);

  // Masquer tous les panneaux
  ['previewFrame','previewImage','previewContent','previewOffice','previewUnsupported'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  const previewFrame       = document.getElementById('previewFrame');
  const previewImage       = document.getElementById('previewImage');
  const previewContent     = document.getElementById('previewContent');
  const previewOffice      = document.getElementById('previewOffice');

  const imageExts  = ['jpg','jpeg','png','gif','webp','svg','bmp'];
  const pdfExts    = ['pdf'];
  const officeExts = ['doc','docx','xls','xlsx','ppt','pptx'];
  const textExts   = ['txt','json','xml','html','css','js','md','csv'];

  try {
    if (isImage || imageExts.includes(effectiveExt)) {
      // Images: essayer img.src direct, fallback sur Signed URL si 400/403
      if (previewImage) {
        previewImage.classList.remove('hidden');
        previewImage.onload  = () => hidePreviewLoading();
        previewImage.onerror = () => {
          // Fallback: générer une Signed URL (bucket privé)
          if (G.supabase && doc.storage_path) {
            G.supabase.storage.from(CONFIG.storageBucket)
              .createSignedUrl(doc.storage_path, 3600)
              .then(({ data, error }) => {
                if (!error && data?.signedUrl) {
                  previewImage.src = data.signedUrl;
                } else {
                  hidePreviewLoading();
                  showUnsupportedPreview(doc);
                }
              })
              .catch(() => { hidePreviewLoading(); showUnsupportedPreview(doc); });
          } else {
            hidePreviewLoading();
            showUnsupportedPreview(doc);
          }
        };
        previewImage.src = fileUrl;
      }
    } else if (pdfExts.includes(effectiveExt)) {
      // PDF: essayer iframe direct, fallback signed URL si échec
      if (previewFrame) {
        previewFrame.classList.remove('hidden');
        const loadPdf = (url) => {
          previewFrame.src = url;
          previewFrame.onload  = () => hidePreviewLoading();
          previewFrame.onerror = () => { hidePreviewLoading(); showUnsupportedPreview(doc); };
        };
        // Essayer l'URL publique directement d'abord
        fetch(fileUrl, { method: 'HEAD' })
          .then(r => {
            if (r.ok) {
              loadPdf(fileUrl);
            } else if (G.supabase && doc.storage_path) {
              // URL privée → Signed URL
              G.supabase.storage.from(CONFIG.storageBucket)
                .createSignedUrl(doc.storage_path, 3600)
                .then(({ data, error }) => {
                  if (!error && data?.signedUrl) loadPdf(data.signedUrl);
                  else { hidePreviewLoading(); showUnsupportedPreview(doc); }
                });
            } else {
              hidePreviewLoading();
              showUnsupportedPreview(doc);
            }
          })
          .catch(() => {
            // fetch HEAD bloqué par CORS → essayer directement
            loadPdf(fileUrl);
          });
      }
   } else if (officeExts.includes(effectiveExt)) {
      // Office via Microsoft Office Online Viewer (avec Signed URL si privé)
      if (previewFrame) {
        previewFrame.classList.remove('hidden');

        const loadOffice = (url) => {
          const encodedUrl = encodeURIComponent(url);
          const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`;
          previewFrame.src = viewerUrl;
          previewFrame.onload  = () => hidePreviewLoading();
          previewFrame.onerror = () => { hidePreviewLoading(); showUnsupportedPreview(doc); };
        };

        fetch(fileUrl, { method: 'HEAD' })
          .then(r => {
            if (r.ok) {
              loadOffice(fileUrl);
            } else if (G.supabase && doc.storage_path) {
              G.supabase.storage.from(CONFIG.storageBucket)
                .createSignedUrl(doc.storage_path, 3600)
                .then(({ data, error }) => {
                  if (!error && data?.signedUrl) loadOffice(data.signedUrl);
                  else { hidePreviewLoading(); showUnsupportedPreview(doc); }
                });
            } else {
              hidePreviewLoading();
              showUnsupportedPreview(doc);
            }
          })
          .catch(() => {
            loadOffice(fileUrl);
          });
      }    
	} else if (textExts.includes(effectiveExt)) {
      if (previewContent) previewContent.classList.remove('hidden');
      const contentEl = document.getElementById('previewTextContent');
      if (contentEl) {
        contentEl.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-blue-400 text-2xl"></i></div>';
        fetch(fileUrl)
          .then(r => r.text())
          .then(text => {
            hidePreviewLoading();
            contentEl.innerHTML = '<pre class="text-xs text-blue-300/80 font-mono whitespace-pre-wrap break-words p-4 max-h-[55vh] overflow-y-auto">' + escapeHtml(text.slice(0, 50000)) + '</pre>';
          })
          .catch(() => {
            hidePreviewLoading();
            contentEl.innerHTML = '<div class="text-center py-8 text-yellow-400"><i class="fas fa-exclamation-triangle text-3xl mb-3 block"></i><p>Impossible de charger le contenu texte.</p></div>';
          });
      }
    } else {
      // Type non reconnu
      hidePreviewLoading();
      showUnsupportedPreview(doc);
    }
  } catch (err) {
    console.error('Erreur apercu:', err);
    hidePreviewLoading();
    showUnsupportedPreview(doc);
  }

  updateDocViews(docId);
}

function updatePreviewMetadata(doc) {
  const metaContainer = document.getElementById('previewMetadata');
  if (metaContainer) {
    metaContainer.innerHTML = `
      <div class="flex items-center gap-4 text-xs text-blue-300/60 flex-wrap">
        <span><i class="fas fa-code-branch mr-1"></i>Version ${doc.version || 1}</span>
        <span><i class="fas fa-eye mr-1"></i>${doc.views || 0} vues</span>
        <span><i class="fas fa-download mr-1"></i>${doc.downloads || 0} téléchargements</span>
        <span><i class="fas fa-calendar-alt mr-1"></i>${formatDate(doc.created_at)}</span>
        <span><i class="fas fa-database mr-1"></i>${formatBytes(doc.size)}</span>
        ${doc.owner_id === G.currentUser.id ? '<span class="text-green-400"><i class="fas fa-user-check mr-1"></i>Propriétaire</span>' : ''}
      </div>
    `;
  }
}

function showUnsupportedPreview(doc) {
  const previewUnsupported = document.getElementById('previewUnsupported');
  if (previewUnsupported) {
    previewUnsupported.classList.remove('hidden');
    const unsupportedInfo = document.getElementById('unsupportedFileInfo');
    if (unsupportedInfo) {
      unsupportedInfo.innerHTML = `
        <i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-5xl mb-4 block text-blue-400"></i>
        <p class="text-white font-medium">${escapeHtml(doc.name)}</p>
        <p class="text-sm text-blue-300/60 mt-1">${formatBytes(doc.size)} • ${doc.type?.toUpperCase() || 'Fichier'}</p>
        <p class="text-xs text-blue-400/50 mt-3">Aperçu non disponible pour ce type de fichier</p>
        <div class="flex gap-3 mt-4 justify-center">
          <button onclick="downloadDocument('${doc.id}')" class="btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-2">
            <i class="fas fa-download"></i>Télécharger
          </button>
          <button onclick="copyFileLink('${doc.id}')" class="px-4 py-2 rounded-lg text-sm border border-blue-500/30 hover:bg-blue-500/10 flex items-center gap-2">
            <i class="fas fa-link"></i>Copier le lien
          </button>
        </div>
      `;
    }
  }
}

function copyFileLink(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc?.file_url) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(doc.file_url).then(() => showToast('Lien du fichier copié', 'success')).catch(() => _fallbackCopy(doc.file_url));
  } else {
    _fallbackCopy(doc.file_url);
  }
}

function showPreviewLoading() {
  const loadingEl = document.getElementById('previewLoading');
  if (loadingEl) loadingEl.classList.remove('hidden');
}

function hidePreviewLoading() {
  const loadingEl = document.getElementById('previewLoading');
  if (loadingEl) loadingEl.classList.add('hidden');
}

async function updateDocViews(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  const newViews = (doc.views || 0) + 1;
  try {
    await G.supabase.from('documents').update({ views: newViews }).eq('id', docId);
    doc.views = newViews;
  } catch (err) {
    console.warn('updateDocViews error (non-blocking):', err);
  }
}

function closePreviewModal() {
  const modal = document.getElementById('previewModal');
  if (modal) modal.classList.add('hidden');
  G.currentDocId = null;
}

async function downloadDocument(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  try {
    // Télécharger le fichier depuis Supabase Storage
    const { data, error } = await G.supabase.storage
      .from(CONFIG.storageBucket)
      .download(doc.storage_path);
    
    if (error) {
      console.error('Erreur téléchargement:', error);
      // Fallback: utiliser l'URL publique
      const link = document.createElement('a');
      link.href = doc.file_url;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Créer un blob et télécharger
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
    
    // Mettre à jour le compteur de téléchargements
    await G.supabase
      .from('documents')
      .update({ downloads: (doc.downloads || 0) + 1 })
      .eq('id', docId);
    doc.downloads = (doc.downloads || 0) + 1;
    
    showToast(`Téléchargement: ${escapeHtml(doc.name)}`, 'success');
    
    // Log d'audit
    await addAuditLog('download', 'document', docId);
    
  } catch (err) {
    console.error('Erreur téléchargement:', err);
    showToast(`Erreur de téléchargement: ${err.message}`, 'error');
  }
}

function downloadCurrentDocument() {
  if (G.currentDocId) downloadDocument(G.currentDocId);
}

function shareCurrentDocument() {
  if (G.currentDocId) openShareModal(G.currentDocId);
}

async function deleteDocument(docId) {
if (G._isDemo) { showToast('Mode démo : suppression désactivée', 'warning'); return; }
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;

  if (doc.owner_id !== G.currentUser.id && G.currentUser.role !== 'admin' && G.currentUser.role !== 'manager') {
    showToast('Permission refusée', 'error');
    return;
  }

  if (!confirm(`Déplacer "${escapeHtml(doc.name)}" vers la corbeille ?`)) return;
  
  const { error } = await G.supabase
    .from('documents')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', docId);
  
  if (error) {
    showToast('Erreur suppression', 'error');
    return;
  }
  
  doc.is_deleted = true;
  doc.deleted_at = new Date().toISOString();
  renderDocuments();
  updateBadges();
  showToast('Document déplacé vers la corbeille', 'success');
  
  // Log d'audit
  await addAuditLog('delete', 'document', docId);
}

// ─── Déplacement de documents ───
function openMoveModal(docId) {
  G.moveModalDocId = docId;
  const modal = document.getElementById('moveModal');
  if (modal) modal.classList.remove('hidden');
  
  const folderSelect = document.getElementById('moveFolderSelect');
  if (folderSelect) {
    let options = '<option value="__root__">📁 Racine (dossier principal)</option>';
    options += G.folders
      .filter(f => f.name !== 'Racine')
      .map(f => `<option value="${f.id}">📁 ${getFolderPath(f.id)}</option>`)
      .join('');
    folderSelect.innerHTML = options;
  }
}

function closeMoveModal() {
  const modal = document.getElementById('moveModal');
  if (modal) modal.classList.add('hidden');
  G.moveModalDocId = null;
}

function getFolderPath(folderId, path = '') {
  const folder = G.folders.find(f => f.id === folderId);
  if (!folder) return path;
  const newPath = path ? `${folder.name} / ${path}` : folder.name;
  if (folder.parent_id) {
    return getFolderPath(folder.parent_id, newPath);
  }
  return newPath;
}

async function confirmMoveDocument() {
  let folderId = document.getElementById('moveFolderSelect')?.value;
  if (!folderId) {
    showToast('Veuillez sélectionner un dossier', 'warning');
    return;
  }
  
  // Gestion du dossier racine
  if (folderId === '__root__') {
    const rootFolder = G.folders.find(f => f.name === 'Racine' && f.parent_id === null);
    if (rootFolder) folderId = rootFolder.id;
    else {
      showToast('Dossier racine introuvable', 'error');
      return;
    }
  }
  
  if (!G.moveModalDocId) return;
  
  const { error } = await G.supabase
    .from('documents')
    .update({ folder_id: folderId, updated_at: new Date().toISOString() })
    .eq('id', G.moveModalDocId);
  
  if (error) {
    showToast('Erreur déplacement: ' + error.message, 'error');
    return;
  }
  
  const doc = G.documents.find(d => d.id === G.moveModalDocId);
  if (doc) {
    doc.folder_id = folderId;
    doc.updated_at = new Date().toISOString();
  }
  
  showToast('Document déplacé avec succès', 'success');
  closeMoveModal();
  renderDocuments();
  if (G.currentView === 'folders') renderFolderContents();
}

// ─── Collaboration (invitation) ───
function openCollabModal(docId) {
  G.collabModalDocId = docId;
  const modal = document.getElementById('collabModal');
  if (modal) modal.classList.remove('hidden');
  
  const doc = G.documents.find(d => d.id === docId);
  const docInfo = document.getElementById('collabDocInfo');
  if (docInfo && doc) docInfo.textContent = doc.name;
}

function closeCollabModal() {
  const modal = document.getElementById('collabModal');
  if (modal) modal.classList.add('hidden');
  G.collabModalDocId = null;
}

async function inviteCollaborator() {
  const email = document.getElementById('collabEmail')?.value.trim();
  const permission = document.getElementById('collabPermission')?.value;
  
  if (!email) {
    showToast('Veuillez entrer un email', 'warning');
    return;
  }
  
  if (!G.collabModalDocId) return;
  
  // Vérifier si l'utilisateur existe dans la même entreprise
  const { data: targetUser, error: userError } = await G.supabase
    .from('profiles')
    .select('id, email, name')
    .eq('email', email)
    .eq('company_id', G.currentUser.companyId)
    .single();
  
  if (userError || !targetUser) {
    showToast('Cet utilisateur n\'appartient pas à votre entreprise', 'error');
    return;
  }
  
  // Créer le partage
  const share = {
    id: generateId(),
    document_id: G.collabModalDocId,
    sender_id: G.currentUser.id,
    recipient_email: email,
    recipient_id: targetUser.id,
    permission: permission,
    expires_at: null,
    status: 'active',
    created_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('shares').insert(share);
  if (error) {
    showToast('Erreur invitation: ' + error.message, 'error');
    return;
  }
  
  G.shares.push(share);
  showToast(`Invitation envoyée à ${email}`, 'success');
  
  // Envoyer une notification (simulée)
  await addAuditLog('share_collab', 'document', G.collabModalDocId, `Invité: ${email} avec permission ${permission}`);
  
  closeCollabModal();
  document.getElementById('collabEmail').value = '';
}

// ─── Partages ───
function openShareModal(docId) {
  G.currentDocId = docId;
  const modal = document.getElementById('shareModal');
  if (modal) modal.classList.remove('hidden');
  
  const doc = G.documents.find(d => d.id === docId);
  const docInfo = document.getElementById('shareDocInfo');
  if (docInfo && doc) docInfo.textContent = doc.name;
}

function closeShareModal() {
  const modal = document.getElementById('shareModal');
  if (modal) modal.classList.add('hidden');
  G.currentDocId = null;
}

function switchShareTab(tab) {
  const sendPanel = document.getElementById('sharePanel-send');
  const historyPanel = document.getElementById('sharePanel-history');
  const sendTab = document.getElementById('shareTab-send');
  const historyTab = document.getElementById('shareTab-history');
  
  if (tab === 'send') {
    if (sendPanel) sendPanel.classList.remove('hidden');
    if (historyPanel) historyPanel.classList.add('hidden');
    if (sendTab) sendTab.classList.add('border-blue-400', 'text-blue-400');
    if (historyTab) historyTab.classList.remove('border-blue-400', 'text-blue-400');
  } else {
    if (sendPanel) sendPanel.classList.add('hidden');
    if (historyPanel) historyPanel.classList.remove('hidden');
    if (historyTab) historyTab.classList.add('border-blue-400', 'text-blue-400');
    if (sendTab) sendTab.classList.remove('border-blue-400', 'text-blue-400');
    loadShareHistory();
  }
}

async function loadShareHistory(docId = null) {
  const targetDocId = docId || G.currentDocId;
  if (!targetDocId) {
    const historyContainer = document.getElementById('shareHistoryList');
    if (historyContainer) historyContainer.innerHTML = '<div class="text-center py-8 text-blue-300/40"><p>Sélectionnez un document pour voir son historique</p></div>';
    return;
  }
  
  const { data: shares, error } = await G.supabase
    .from('shares')
    .select('*, documents!document_id(name)')
    .eq('document_id', targetDocId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error(error);
    return;
  }
  
  const historyContainer = document.getElementById('shareHistoryList');
  if (historyContainer) {
    if (!shares || shares.length === 0) {
      historyContainer.innerHTML = '<p class="text-center py-4 text-blue-300/50">Aucun historique de partage pour ce document</p>';
    } else {
      historyContainer.innerHTML = shares.map(s => `
        <div class="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-blue-500/20">
          <div>
            <p class="text-white text-sm">Partagé avec : ${escapeHtml(s.recipient_email)}</p>
            <p class="text-xs text-blue-300/60">${s.status} • ${formatDate(s.created_at)}</p>
            ${s.expires_at ? `<p class="text-xs text-yellow-400/70">Expire le ${formatDate(s.expires_at)}</p>` : ''}
          </div>
          ${s.status === 'active' ? `<button onclick="revokeShare('${s.id}')" class="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30">Révoquer</button>` : ''}
        </div>
      `).join('');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// SystemesGED v7.1 — Module PARTAGÉS complet
// Remplace les fonctions switchSharedTab(), renderShared(), shareDocument()
// refreshShares(), revokeShare(), generatePublicLink(), copyShareLink()
// et ajoute toutes les nouvelles fonctions SaaS GED
// ═══════════════════════════════════════════════════════════════════

/* ─── Module Partagés ─────────────────────────────────────── */

/* ───────────────────────────────────────────────────────────────────
   NAVIGATION & RENDU PRINCIPAL
───────────────────────────────────────────────────────────────────── */

/**
 * Bascule entre les onglets du menu Partagés.
 * Remplace l'ancienne switchSharedTab() qui ne gérait que 2 onglets.
 */
function switchSharedTab(tab) {
  _shared.currentTab = tab;
  _shared.bulkSelected.clear();
  _updateBulkBar();

  // Masquer tous les panels
  document.querySelectorAll('.shared-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.shared-tab').forEach(btn => btn.classList.remove('active'));

  // Activer le bon panel et onglet
  const panel = document.getElementById(`shared-panel-${tab}`);
  const tabBtn = document.getElementById(`sharedTab-${tab}`);
  if (panel) panel.classList.remove('hidden');
  if (tabBtn) tabBtn.classList.add('active');

  // Remplir le sélecteur de doc dans "Liens publics"
  if (tab === 'links') _populatePublicLinkDocSelector();

  // Mettre à jour les anciens IDs aussi pour compatibilité avec d'autres fonctions
  G.sharedTab = tab === 'received' ? 'received' : 'sent';

  renderShared();
}

/**
 * Rendu principal – dispatch selon l'onglet actif.
 */
async function renderShared() {
  // Recharger les partages depuis Supabase
  if (G.supabase && G.currentUser) {
    try {
      const [sentRes, receivedRes, linksRes] = await Promise.all([
        G.supabase.from('shares').select('*').eq('sender_id', G.currentUser.id),
        G.supabase.from('shares').select('*').eq('recipient_email', G.currentUser.email),
        G.supabase.from('public_shares').select('*').eq('created_by', G.currentUser.id)
      ]);

      // Fusionner sent + received sans doublons
      const merged = new Map();
      [...(sentRes.data || []), ...(receivedRes.data || [])].forEach(s => merged.set(s.id, s));
      G.shares = Array.from(merged.values());

      if (!linksRes.error) _shared.publicLinks = linksRes.data || [];
    } catch (err) {
      console.warn('renderShared: rechargement partiel échoué', err);
    }
  }

  _updateKPIs();
  switch (_shared.currentTab) {
    case 'received': _renderReceived(); break;
    case 'sent':     _renderSent();     break;
    case 'links':    _renderLinks();    break;
    case 'expired':  _renderExpired();  break;
  }
  _renderActivityChart(30);
}

/* ─── KPIs ────────────────────────────────────────────────────── */
function _updateKPIs() {
  if (!G.currentUser) return;
  const email  = G.currentUser.email;
  const userId = G.currentUser.id;

  const received = G.shares.filter(s =>
    s.recipient_email === email && s.status === 'active' && !_isExpired(s)
  ).length;

  const sent = G.shares.filter(s =>
    s.sender_id === userId && s.status === 'active' && !_isExpired(s)
  ).length;

  const links = (_shared.publicLinks || []).filter(l =>
    l.created_by === userId && l.status === 'active' && !_isExpired(l)
  ).length;

  const expired = G.shares.filter(s =>
    s.sender_id === userId && (s.status === 'revoked' || _isExpired(s))
  ).length;

  _setText('kpiReceivedCount', received);
  _setText('kpiSentCount', sent);
  _setText('kpiLinksCount', links);
  _setText('kpiExpiredCount', expired);

  // Badges sur les onglets
  _setBadge('receivedCountBadge', received);
  _setBadge('sentCountBadge', sent);

  // Stats globales
  const totalViews = G.shares.reduce((acc, s) => acc + (s.views || 0), 0);
  const totalDownloads = G.shares.reduce((acc, s) => acc + (s.downloads || 0), 0);
  _setText('statTotalShares', G.shares.filter(s => s.sender_id === userId).length);
  _setText('statTotalViews', totalViews);
  _setText('statTotalDownloads', totalDownloads);
}

/* ─── Filtre/recherche ─────────────────────────────────────────── */
function filterSharedView() {
  _shared.filterQuery  = (document.getElementById('sharedSearchInput')?.value  || '').toLowerCase();
  _shared.filterPerm   = document.getElementById('sharedFilterPerm')?.value   || '';
  _shared.filterStatus = document.getElementById('sharedFilterStatus')?.value || '';
  renderShared();
}

function clearSharedFilters() {
  _shared.filterQuery = _shared.filterPerm = _shared.filterStatus = '';
  const q  = document.getElementById('sharedSearchInput');
  const fp = document.getElementById('sharedFilterPerm');
  const fs = document.getElementById('sharedFilterStatus');
  if (q)  q.value  = '';
  if (fp) fp.value = '';
  if (fs) fs.value = '';
  renderShared();
}

/* ─── Filtre helpers ───────────────────────────────────────────── */
function _applyFilters(list) {
  const { filterQuery: q, filterPerm: p, filterStatus: s } = _shared;
  return list.filter(share => {
    const doc     = G.documents.find(d => d.id === share.document_id);
    const docName = (doc?.name || '').toLowerCase();
    const email   = (share.recipient_email || '').toLowerCase();
    const matchQ  = !q || docName.includes(q) || email.includes(q);
    const matchP  = !p || share.permission === p;
    const status  = _shareStatus(share);
    const matchS  = !s || status === s;
    return matchQ && matchP && matchS;
  });
}

function _shareStatus(share) {
  if (share.status === 'revoked') return 'revoked';
  if (_isExpired(share))          return 'expired';
  return 'active';
}

function _isExpired(share) {
  if (!share.expires_at) return false;
  return new Date(share.expires_at) < new Date();
}

/* ──────────────────────────────────────────────────────────────────
   PANEL : REÇUS
────────────────────────────────────────────────────────────────── */
function _renderReceived() {
  const list  = document.getElementById('sharedReceivedList');
  const empty = document.getElementById('sharedReceivedEmpty');
  if (!list || !empty) return;

  const email = G.currentUser?.email;
  let received = G.shares.filter(s =>
    s.recipient_email === email &&
    s.status !== 'revoked' &&
    !_isExpired(s)
  );
  received = _applyFilters(received);

  _setText('sharedResultCount', `${received.length} partage${received.length > 1 ? 's' : ''}`);

  if (received.length === 0) {
    empty.classList.remove('hidden');
    list.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.classList.remove('hidden');

  list.innerHTML = received.map(share => {
    const doc     = G.documents.find(d => d.id === share.document_id);
    const docName = doc?.name || 'Document inconnu';
    const sender  = G.users.find(u => u.id === share.sender_id);
    const senderLabel = sender?.name || share.sender_id?.substring(0, 8) || 'Inconnu';
    const expireLabel = share.expires_at
      ? `Expire le ${formatDate(share.expires_at)}`
      : 'Accès illimité';

    return `
    <div class="share-card glass-card rounded-xl border border-purple-500/20 p-4 hover:border-purple-400/40 group"
         data-share-id="${share.id}">
      <div class="flex items-start gap-3">
        <!-- Icône fichier -->
        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center text-xl flex-shrink-0">
          <i class="fas ${getFileIcon(doc?.type).split(' ')[0]} ${getFileIcon(doc?.type).split(' ')[1] || 'text-purple-400'}"></i>
        </div>
        <!-- Infos -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-white font-semibold text-sm truncate">${escapeHtml(docName)}</p>
            <span class="text-[10px] px-2 py-0.5 rounded-full perm-badge-${share.permission || 'view'}">
              ${_permLabel(share.permission)}
            </span>
          </div>
          <div class="flex items-center gap-3 mt-1 flex-wrap text-xs text-blue-300/60">
            <span><i class="fas fa-user mr-1"></i>${escapeHtml(senderLabel)}</span>
            <span><i class="fas fa-calendar mr-1"></i>${formatDate(share.created_at)}</span>
            <span class="${share.expires_at && _isExpired(share) ? 'text-orange-400' : ''}">
              <i class="fas fa-clock mr-1"></i>${expireLabel}
            </span>
            ${share.views ? `<span><i class="fas fa-eye mr-1"></i>${share.views} vue(s)</span>` : ''}
          </div>
        </div>
        <!-- Actions -->
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onclick="openPreviewModal('${share.document_id}')"
            class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-all" title="Ouvrir">
            <i class="fas fa-eye text-sm"></i>
          </button>
          ${share.permission !== 'view' ? `
          <button onclick="downloadDocument('${share.document_id}')"
            class="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-all" title="Télécharger">
            <i class="fas fa-download text-sm"></i>
          </button>` : ''}
          <button onclick="openShareDetailModal('${share.id}')"
            class="p-2 rounded-lg hover:bg-purple-500/20 text-purple-400 transition-all" title="Détails">
            <i class="fas fa-circle-info text-sm"></i>
          </button>
          <button onclick="revokeReceivedShare('${share.id}')"
            class="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-all" title="Masquer ce partage">
            <i class="fas fa-eye-slash text-sm"></i>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ──────────────────────────────────────────────────────────────────
   PANEL : ENVOYÉS
────────────────────────────────────────────────────────────────── */
function _renderSent() {
  const list  = document.getElementById('sharedSentList');
  const empty = document.getElementById('sharedSentEmpty');
  if (!list || !empty) return;

  let sent = G.shares.filter(s => s.sender_id === G.currentUser?.id);
  sent = _applyFilters(sent);

  _setText('sharedResultCount', `${sent.length} partage${sent.length > 1 ? 's' : ''}`);

  if (sent.length === 0) {
    empty.classList.remove('hidden');
    list.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.classList.remove('hidden');

  list.innerHTML = sent.map(share => {
    const doc     = G.documents.find(d => d.id === share.document_id);
    const docName = doc?.name || 'Document inconnu';
    const status  = _shareStatus(share);
    const isSelected = _shared.bulkSelected.has(share.id);

    return `
    <div class="share-card glass-card rounded-xl border ${_cardBorderClass(status)} p-4 group ${isSelected ? 'selected' : ''}"
         data-share-id="${share.id}">
      <div class="flex items-start gap-3">
        <!-- Checkbox bulk -->
        <div class="share-checkbox flex-shrink-0 mt-0.5">
          <input type="checkbox" class="rounded" ${isSelected ? 'checked' : ''}
            onchange="toggleBulkSelect('${share.id}', this.checked)"
            onclick="event.stopPropagation()">
        </div>
        <!-- Icône -->
        <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/15 to-purple-500/15 flex items-center justify-center text-lg flex-shrink-0">
          <i class="fas ${getFileIcon(doc?.type).split(' ')[0]} ${getFileIcon(doc?.type).split(' ')[1] || 'text-blue-400'}"></i>
        </div>
        <!-- Infos -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-white font-semibold text-sm truncate">${escapeHtml(docName)}</p>
            <span class="text-[10px] px-2 py-0.5 rounded-full perm-badge-${share.permission || 'view'}">
              ${_permLabel(share.permission)}
            </span>
            <span class="text-[10px] px-2 py-0.5 rounded-full status-${status}">
              ${_statusLabel(status)}
            </span>
          </div>
          <div class="flex items-center gap-3 mt-1 flex-wrap text-xs text-blue-300/60">
            <span><i class="fas fa-at mr-1"></i>${escapeHtml(share.recipient_email || '—')}</span>
            <span><i class="fas fa-calendar mr-1"></i>Envoyé le ${formatDate(share.created_at)}</span>
            ${share.expires_at
              ? `<span class="${_isExpired(share) ? 'text-orange-400' : ''}">
                  <i class="fas fa-clock mr-1"></i>
                  ${_isExpired(share) ? 'Expiré' : 'Expire'} le ${formatDate(share.expires_at)}
                </span>`
              : '<span><i class="fas fa-infinity mr-1"></i>Illimité</span>'}
            ${share.views ? `<span><i class="fas fa-eye mr-1"></i>${share.views} vue(s)</span>` : ''}
            ${share.downloads ? `<span><i class="fas fa-download mr-1"></i>${share.downloads} dl</span>` : ''}
          </div>
        </div>
        <!-- Actions -->
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onclick="openShareDetailModal('${share.id}')"
            class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-all" title="Détails & activité">
            <i class="fas fa-chart-line text-sm"></i>
          </button>
          ${status === 'active' ? `
          <button onclick="extendShare('${share.id}', 7)"
            class="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-all" title="Prolonger 7 jours">
            <i class="fas fa-calendar-plus text-sm"></i>
          </button>
          <button onclick="revokeShare('${share.id}')"
            class="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-all" title="Révoquer">
            <i class="fas fa-ban text-sm"></i>
          </button>` : `
          <button onclick="renewShare('${share.id}')"
            class="p-2 rounded-lg hover:bg-purple-500/20 text-purple-400 transition-all" title="Renouveler">
            <i class="fas fa-rotate text-sm"></i>
          </button>`}
          <button onclick="deleteShareRecord('${share.id}')"
            class="p-2 rounded-lg hover:bg-red-500/20 text-red-400/50 hover:text-red-400 transition-all" title="Supprimer de l'historique">
            <i class="fas fa-trash text-sm"></i>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ──────────────────────────────────────────────────────────────────
   PANEL : LIENS PUBLICS
────────────────────────────────────────────────────────────────── */
function _populatePublicLinkDocSelector() {
  const sel = document.getElementById('publicLinkDocId');
  const qsSel = document.getElementById('qsDocId');
  const docs = G.documents.filter(d => !d.is_deleted);
  const opts = '<option value="">— Sélectionner un document —</option>' +
    docs.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  if (sel)   sel.innerHTML = opts;
  if (qsSel) qsSel.innerHTML = opts;
}

function _renderLinks() {
  const list  = document.getElementById('publicLinksList');
  const empty = document.getElementById('publicLinksEmpty');
  if (!list || !empty) return;

  _populatePublicLinkDocSelector();

  const links = (_shared.publicLinks || []).filter(l =>
    l.created_by === G.currentUser?.id
  );

  if (links.length === 0) {
    empty.classList.remove('hidden');
    list.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.classList.remove('hidden');

  list.innerHTML = links.map(link => {
    const doc     = G.documents.find(d => d.id === link.document_id);
    const docName = doc?.name || 'Document';
    const expired = _isExpired(link);
    const url     = `${window.location.origin}/public/${link.token}`;

    return `
    <div class="share-card glass-card rounded-xl border ${expired ? 'border-orange-500/20' : 'border-green-500/20'} p-4 group">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-lg ${expired ? 'bg-orange-500/15' : 'bg-green-500/15'} flex items-center justify-center flex-shrink-0">
          <i class="fas fa-link ${expired ? 'text-orange-400' : 'text-green-400'}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-white font-semibold text-sm truncate">${escapeHtml(docName)}</p>
            <span class="text-[10px] px-2 py-0.5 rounded-full ${expired ? 'status-expired' : 'status-active'}">
              ${expired ? '⏰ Expiré' : '✅ Actif'}
            </span>
            ${link.password ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/25"><i class="fas fa-lock mr-1"></i>Protégé</span>' : ''}
            ${link.max_views ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25">${link.views || 0}/${link.max_views} vues</span>` : ''}
          </div>
          <div class="flex items-center gap-3 mt-1 text-xs text-blue-300/60 flex-wrap">
            <code class="text-green-400/70 truncate max-w-[200px]">${url}</code>
            ${link.expires_at ? `<span>${expired ? 'Expiré' : 'Expire'} le ${formatDate(link.expires_at)}</span>` : '<span>Illimité</span>'}
            ${link.views ? `<span>${link.views} vue(s)</span>` : ''}
          </div>
        </div>
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onclick="_copyText('${url}')"
            class="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-all" title="Copier le lien">
            <i class="fas fa-copy text-sm"></i>
          </button>
          ${!expired ? `
          <button onclick="extendPublicLink('${link.id}', 7)"
            class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-all" title="Prolonger">
            <i class="fas fa-calendar-plus text-sm"></i>
          </button>
          <button onclick="revokePublicLink('${link.id}')"
            class="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-all" title="Révoquer">
            <i class="fas fa-ban text-sm"></i>
          </button>` : ''}
          <button onclick="deletePublicLink('${link.id}')"
            class="p-2 rounded-lg hover:bg-red-500/20 text-red-400/50 hover:text-red-400 transition-all" title="Supprimer">
            <i class="fas fa-trash text-sm"></i>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ──────────────────────────────────────────────────────────────────
   PANEL : EXPIRÉS / RÉVOQUÉS
────────────────────────────────────────────────────────────────── */
function _renderExpired() {
  const list  = document.getElementById('expiredSharesList');
  const empty = document.getElementById('expiredSharesEmpty');
  if (!list || !empty) return;

  let expired = G.shares.filter(s =>
    s.sender_id === G.currentUser?.id &&
    (s.status === 'revoked' || _isExpired(s))
  );
  expired = _applyFilters(expired);

  if (expired.length === 0) {
    empty.classList.remove('hidden');
    list.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.classList.remove('hidden');

  list.innerHTML = expired.map(share => {
    const doc     = G.documents.find(d => d.id === share.document_id);
    const docName = doc?.name || 'Document inconnu';
    const status  = _shareStatus(share);

    return `
    <div class="share-card glass-card rounded-xl border border-orange-500/15 p-4 group opacity-75 hover:opacity-100">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
          <i class="fas ${getFileIcon(doc?.type).split(' ')[0]} text-orange-400/70"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-white/70 font-medium text-sm truncate">${escapeHtml(docName)}</p>
            <span class="text-[10px] px-2 py-0.5 rounded-full status-${status}">${_statusLabel(status)}</span>
          </div>
          <div class="flex items-center gap-3 mt-1 text-xs text-blue-300/50 flex-wrap">
            <span><i class="fas fa-at mr-1"></i>${escapeHtml(share.recipient_email || '—')}</span>
            <span><i class="fas fa-calendar mr-1"></i>${formatDate(share.created_at)}</span>
            ${share.expires_at ? `<span><i class="fas fa-clock mr-1"></i>${formatDate(share.expires_at)}</span>` : ''}
          </div>
        </div>
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onclick="renewShare('${share.id}')"
            class="px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 text-xs hover:bg-purple-500/30 transition-all flex items-center gap-1">
            <i class="fas fa-rotate"></i>Renouveler
          </button>
          <button onclick="deleteShareRecord('${share.id}')"
            class="p-2 rounded-lg hover:bg-red-500/20 text-red-400/50 hover:text-red-400 transition-all" title="Supprimer">
            <i class="fas fa-trash text-sm"></i>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ──────────────────────────────────────────────────────────────────
   CHART ACTIVITÉ
────────────────────────────────────────────────────────────────── */
function _renderActivityChart(days) {
  const container = document.getElementById('shareActivityChart');
  if (!container) return;

  const bars = [];
  for (let i = days - 1; i >= 0; i--) {
    const date  = new Date();
    date.setDate(date.getDate() - i);
    const ds    = date.toDateString();
    const count = G.shares.filter(s => new Date(s.created_at).toDateString() === ds).length;
    bars.push({ count, label: date.toLocaleDateString('fr-FR', { month:'short', day:'numeric' }) });
  }

  const max = Math.max(...bars.map(b => b.count), 1);
  // Show only every nth label to avoid crowding
  const nth = Math.ceil(bars.length / 7);

  container.innerHTML = bars.map((b, i) => `
    <div class="activity-bar" style="height:${Math.max(4, (b.count/max)*56)}px;"
      data-tip="${b.label}: ${b.count} partage(s)" title="${b.label}: ${b.count}">
    </div>
    ${i % nth === 0 ? '' : ''}
  `).join('');
}

function loadShareActivity(days) {
  _renderActivityChart(parseInt(days));
}

/* ──────────────────────────────────────────────────────────────────
   ACTIONS SUR PARTAGES
────────────────────────────────────────────────────────────────── */

/** Révoque un partage envoyé */
async function revokeShare(shareId) {
  if (!confirm('Révoquer ce partage ? Le destinataire n\'aura plus accès au document.')) return;

  const { error } = await G.supabase
    .from('shares')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', shareId);

  if (error) { showToast('Erreur révocation : ' + error.message, 'error'); return; }

  const share = G.shares.find(s => s.id === shareId);
  if (share) share.status = 'revoked';

  showToast('Partage révoqué avec succès', 'success');
  renderShared();
  updateBadges();
  await addAuditLog('share_revoke', 'share', shareId, `Destinataire : ${share?.recipient_email}`);
}

/** Masque un partage reçu (côté destinataire, sans révocation) */
async function revokeReceivedShare(shareId) {
  G.shares = G.shares.filter(s => s.id !== shareId);
  renderShared();
  updateBadges();
  showToast('Partage masqué de votre vue', 'info');
}

/** Prolonge un partage de N jours */
async function extendShare(shareId, days) {
  const share = G.shares.find(s => s.id === shareId);
  if (!share) return;

  const base    = share.expires_at ? new Date(share.expires_at) : new Date();
  const newDate = new Date(base);
  newDate.setDate(newDate.getDate() + days);

  const { error } = await G.supabase
    .from('shares')
    .update({ expires_at: newDate.toISOString() })
    .eq('id', shareId);

  if (error) { showToast('Erreur prolongation', 'error'); return; }

  share.expires_at = newDate.toISOString();
  showToast(`Partage prolongé de ${days} jour(s)`, 'success');
  renderShared();
}

/** Renouvelle un partage expiré ou révoqué */
async function renewShare(shareId) {
  const share = G.shares.find(s => s.id === shareId);
  if (!share) return;

  const newDate = new Date();
  newDate.setDate(newDate.getDate() + 7);

  const { error } = await G.supabase
    .from('shares')
    .update({
      status:     'active',
      expires_at: newDate.toISOString(),
      revoked_at: null
    })
    .eq('id', shareId);

  if (error) { showToast('Erreur renouvellement', 'error'); return; }

  share.status     = 'active';
  share.expires_at = newDate.toISOString();
  share.revoked_at = null;

  showToast('Partage renouvelé pour 7 jours', 'success');
  renderShared();
  updateBadges();
}

/** Supprime un partage de l'historique */
async function deleteShareRecord(shareId) {
  if (!confirm('Supprimer définitivement cet enregistrement de partage ?')) return;

  const { error } = await G.supabase.from('shares').delete().eq('id', shareId);
  if (error) { showToast('Erreur suppression', 'error'); return; }

  G.shares = G.shares.filter(s => s.id !== shareId);
  showToast('Partage supprimé de l\'historique', 'success');
  renderShared();
  updateBadges();
}

/** Purge tous les partages expirés/révoqués */
async function purgeExpiredShares() {
  if (!confirm('Supprimer définitivement tous les partages expirés et révoqués ?')) return;

  const toDelete = G.shares.filter(s =>
    s.sender_id === G.currentUser?.id &&
    (s.status === 'revoked' || _isExpired(s))
  );

  for (const s of toDelete) {
    await G.supabase.from('shares').delete().eq('id', s.id).catch(() => {});
  }

  G.shares = G.shares.filter(s =>
    !(s.sender_id === G.currentUser?.id && (s.status === 'revoked' || _isExpired(s)))
  );

  showToast(`${toDelete.length} partage(s) purgé(s)`, 'success');
  renderShared();
  updateBadges();
}

/* ──────────────────────────────────────────────────────────────────
   ACTIONS GROUPÉES (BULK)
────────────────────────────────────────────────────────────────── */
function toggleBulkSelect(shareId, checked) {
  if (checked) _shared.bulkSelected.add(shareId);
  else         _shared.bulkSelected.delete(shareId);
  _updateBulkBar();
}

function _updateBulkBar() {
  const bar   = document.getElementById('sharedBulkBar');
  const count = document.getElementById('sharedBulkCount');
  const n     = _shared.bulkSelected.size;
  if (bar) bar.classList.toggle('hidden', n === 0);
  if (count) count.textContent = `${n} sélectionné(s)`;
}

async function bulkRevokeSelected() {
  if (_shared.bulkSelected.size === 0) return;
  if (!confirm(`Révoquer ${_shared.bulkSelected.size} partage(s) ?`)) return;

  for (const id of _shared.bulkSelected) {
    await G.supabase.from('shares').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', id).catch(() => {});
    const s = G.shares.find(x => x.id === id);
    if (s) s.status = 'revoked';
  }

  showToast(`${_shared.bulkSelected.size} partage(s) révoqué(s)`, 'success');
  _shared.bulkSelected.clear();
  renderShared();
  updateBadges();
}

async function bulkExtendSelected(days) {
  if (_shared.bulkSelected.size === 0) return;
  const newDate = new Date();
  newDate.setDate(newDate.getDate() + days);

  for (const id of _shared.bulkSelected) {
    await G.supabase.from('shares').update({ expires_at: newDate.toISOString() }).eq('id', id).catch(() => {});
    const s = G.shares.find(x => x.id === id);
    if (s) s.expires_at = newDate.toISOString();
  }

  showToast(`${_shared.bulkSelected.size} partage(s) prolongé(s) de ${days}j`, 'success');
  _shared.bulkSelected.clear();
  renderShared();
}

function clearBulkSelection() {
  _shared.bulkSelected.clear();
  _updateBulkBar();
  renderShared();
}

/* ──────────────────────────────────────────────────────────────────
   LIENS PUBLICS
────────────────────────────────────────────────────────────────── */

/** Crée un lien public depuis le panel "Liens" */
async function createPublicLink() {
  const docId   = document.getElementById('publicLinkDocId')?.value;
  const expDays = parseInt(document.getElementById('publicLinkExpiry')?.value || '7');
  const perm    = document.getElementById('publicLinkPerm')?.value || 'view';
  const usePwd  = document.getElementById('publicLinkPassword')?.checked;
  const pwd     = document.getElementById('publicLinkPasswordVal')?.value;
  const useMax  = document.getElementById('publicLinkMaxViews')?.checked;
  const maxV    = parseInt(document.getElementById('publicLinkMaxViewsVal')?.value || '0');

  if (!docId) { showToast('Sélectionnez un document', 'warning'); return; }

  const url = await _doCreatePublicLink(docId, expDays, perm, usePwd ? pwd : null, useMax ? maxV : null);
  if (!url) return;

  const result = document.getElementById('generatedPublicLinkResult');
  const input  = document.getElementById('generatedPublicLinkInput');
  if (result) result.classList.remove('hidden');
  if (input)  input.value = url;

  renderShared();
}

async function _doCreatePublicLink(docId, expDays, perm, password, maxViews) {
  const token   = generateId();
  const expires = expDays > 0 ? new Date(Date.now() + expDays * 86400000).toISOString() : null;

  const record = {
    id:          generateId(),
    document_id: docId,
    token,
    permission:  perm,
    expires_at:  expires,
    password:    password || null,
    max_views:   maxViews || null,
    views:       0,
    created_by:  G.currentUser.id,
    company_id:  G.currentUser.companyId,
    status:      'active',
    created_at:  new Date().toISOString()
  };

  try {
    const { error } = await G.supabase.from('public_shares').insert(record);
    if (error) throw error;
  } catch (err) {
    console.warn('public_shares insert (non-blocking):', err);
  }

  _shared.publicLinks.push(record);
  showToast('Lien public généré', 'success');
  await addAuditLog('public_link_create', 'document', docId, `Expire: ${expires || 'jamais'}`);

  return `${window.location.origin}/public/${token}`;
}

async function revokePublicLink(linkId) {
  if (!confirm('Révoquer ce lien public ?')) return;

  try {
    await G.supabase.from('public_shares').update({ status: 'revoked' }).eq('id', linkId);
  } catch (_) {}

  const link = _shared.publicLinks.find(l => l.id === linkId);
  if (link) link.status = 'revoked';
  showToast('Lien révoqué', 'success');
  _renderLinks();
}

async function deletePublicLink(linkId) {
  if (!confirm('Supprimer ce lien ?')) return;

  try {
    await G.supabase.from('public_shares').delete().eq('id', linkId);
  } catch (_) {}

  _shared.publicLinks = _shared.publicLinks.filter(l => l.id !== linkId);
  showToast('Lien supprimé', 'success');
  _renderLinks();
}

async function extendPublicLink(linkId, days) {
  const link = _shared.publicLinks.find(l => l.id === linkId);
  if (!link) return;

  const base    = link.expires_at ? new Date(link.expires_at) : new Date();
  const newDate = new Date(base);
  newDate.setDate(newDate.getDate() + days);

  try {
    await G.supabase.from('public_shares').update({ expires_at: newDate.toISOString() }).eq('id', linkId);
  } catch (_) {}

  link.expires_at = newDate.toISOString();
  showToast(`Lien prolongé de ${days}j`, 'success');
  _renderLinks();
}

function copyPublicLink() {
  const val = document.getElementById('generatedPublicLinkInput')?.value;
  if (val) _copyText(val);
}

function copyQsLink() {
  const val = document.getElementById('qsLinkValue')?.value;
  if (val) _copyText(val);
}

function shareViaEmail() {
  const val = document.getElementById('generatedPublicLinkInput')?.value;
  if (val) window.open(`mailto:?subject=Accès document SystemesGED&body=Voici votre lien d'accès : ${encodeURIComponent(val)}`);
}

/* ──────────────────────────────────────────────────────────────────
   MODAL : PARTAGE RAPIDE (Quick Share)
────────────────────────────────────────────────────────────────── */

function openQuickShareModal() {
  _shared.qsRecipients = [];
  _shared.qsCurrentTab = 'user';
  _renderQsChips();
  _populatePublicLinkDocSelector();

  // Pré-sélectionner le doc courant si preview ouvert
  if (G.currentDocId) {
    const sel = document.getElementById('qsDocId');
    if (sel) sel.value = G.currentDocId;
  }

  switchQuickShareTab('user');

  const modal = document.getElementById('quickShareModal');
  if (modal) modal.classList.remove('hidden');
}

function closeQuickShareModal() {
  const modal = document.getElementById('quickShareModal');
  if (modal) modal.classList.add('hidden');
  _shared.qsRecipients = [];
  _renderQsChips();
}

function switchQuickShareTab(tab) {
  _shared.qsCurrentTab = tab;
  document.querySelectorAll('.qs-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.qs-tab').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById(`qsPanel-${tab}`);
  const btn   = document.getElementById(`qsTab-${tab}`);
  if (panel) panel.classList.remove('hidden');
  if (btn)   btn.classList.add('active');

  // Update submit label
  const labels = { user: 'Partager', link: 'Générer le lien', team: 'Partager avec l\'équipe' };
  const lbl = document.getElementById('qsSubmitLabel');
  if (lbl) lbl.textContent = labels[tab] || 'Partager';

  if (tab === 'team') _updateTeamPreview();
}

/** Récipients (chips) */
function addShareRecipient() {
  const input = document.getElementById('qsEmailInput');
  const email = input?.value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('E-mail invalide', 'warning');
    return;
  }
  if (_shared.qsRecipients.includes(email)) {
    showToast('Déjà ajouté', 'warning');
    return;
  }
  _shared.qsRecipients.push(email);
  if (input) input.value = '';
  const sugg = document.getElementById('qsEmailSuggestions');
  if (sugg) sugg.classList.add('hidden');
  _renderQsChips();
}

function _renderQsChips() {
  const container = document.getElementById('qsRecipientChips');
  if (!container) return;
  container.innerHTML = _shared.qsRecipients.map(email => `
    <span class="recipient-chip">
      <i class="fas fa-user text-[10px]"></i>${escapeHtml(email)}
      <button onclick="_removeQsRecipient('${escapeHtml(email)}')" class="ml-1 opacity-60 hover:opacity-100">
        <i class="fas fa-xmark text-[10px]"></i>
      </button>
    </span>
  `).join('');
}

window._removeQsRecipient = function(email) {
  _shared.qsRecipients = _shared.qsRecipients.filter(e => e !== email);
  _renderQsChips();
};

function handleShareEmailKeydown(e) {
  if (e.key === 'Enter') { e.preventDefault(); addShareRecipient(); }
  if (e.key === ',')     { e.preventDefault(); addShareRecipient(); }
}

function suggestShareRecipients(val) {
  const sugg = document.getElementById('qsEmailSuggestions');
  if (!sugg) return;
  if (!val || val.length < 2) { sugg.classList.add('hidden'); return; }

  const matches = G.users.filter(u =>
    u.status === 'active' &&
    !_shared.qsRecipients.includes(u.email) &&
    (u.email.toLowerCase().includes(val.toLowerCase()) || u.name.toLowerCase().includes(val.toLowerCase()))
  ).slice(0, 5);

  if (matches.length === 0) { sugg.classList.add('hidden'); return; }

  sugg.classList.remove('hidden');
  sugg.innerHTML = matches.map(u => `
    <div class="px-3 py-2 cursor-pointer hover:bg-blue-500/10 flex items-center gap-2 text-sm"
         onclick="selectQsSuggestion('${escapeHtml(u.email)}')">
      <div class="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-xs text-blue-300 font-bold">
        ${u.name.charAt(0).toUpperCase()}
      </div>
      <div>
        <p class="text-white font-medium">${escapeHtml(u.name)}</p>
        <p class="text-blue-300/60 text-xs">${escapeHtml(u.email)}</p>
      </div>
    </div>
  `).join('');
}

function selectQsSuggestion(email) {
  const input = document.getElementById('qsEmailInput');
  if (input) input.value = email;
  const sugg = document.getElementById('qsEmailSuggestions');
  if (sugg) sugg.classList.add('hidden');
  addShareRecipient();
}

function toggleQsLinkPwd() {
  const cb  = document.getElementById('qsLinkUsePwd');
  const inp = document.getElementById('qsLinkPwd');
  if (inp) inp.classList.toggle('hidden', !cb?.checked);
}

function toggleQsLinkMaxViews() {
  const cb  = document.getElementById('qsLinkUseMaxViews');
  const inp = document.getElementById('qsLinkMaxViews');
  if (inp) inp.classList.toggle('hidden', !cb?.checked);
}

function _updateTeamPreview() {
  const target = document.getElementById('qsTeamTarget')?.value;
  const preview = document.getElementById('qsTeamPreviewText');
  if (!preview) return;

  let count = 0;
  if (target === 'all') {
    count = G.users.filter(u => u.status === 'active').length;
    preview.textContent = `${count} membre(s) actif(s) de l'entreprise`;
  } else {
    count = G.users.filter(u => u.status === 'active' && u.role === target).length;
    preview.textContent = `${count} membre(s) avec le rôle "${target}"`;
  }
}

/** Exécute le partage selon l'onglet actif du modal */
async function executeQuickShare() {
  const docId = document.getElementById('qsDocId')?.value;
  if (!docId) { showToast('Sélectionnez un document', 'warning'); return; }

  const btn = document.getElementById('qsSubmitBtn');
  const lbl = document.getElementById('qsSubmitLabel');
  if (btn) btn.disabled = true;
  if (lbl) lbl.innerHTML = '<span class="spinner"></span>';

  try {
    switch (_shared.qsCurrentTab) {
      case 'user': await _executeUserShare(docId); break;
      case 'link': await _executeLinkShare(docId); break;
      case 'team': await _executeTeamShare(docId); break;
    }
    closeQuickShareModal();
    renderShared();
    updateBadges();
    if (G.currentView === 'shared') renderShared();
  } catch (err) {
    showToast('Erreur : ' + (err.message || err), 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (lbl) lbl.textContent = ({ user:'Partager', link:'Générer le lien', team:"Partager avec l'équipe" }[_shared.qsCurrentTab] || 'Partager');
  }
}

async function _executeUserShare(docId) {
  if (_shared.qsRecipients.length === 0) {
    // Try the raw input
    const raw = document.getElementById('qsEmailInput')?.value.trim();
    if (raw) _shared.qsRecipients.push(raw);
  }
  if (_shared.qsRecipients.length === 0) throw new Error('Ajoutez au moins un destinataire');

  const perm    = document.getElementById('qsPermission')?.value    || 'view';
  const expDays = parseInt(document.getElementById('qsExpiration')?.value || '7');
  const message = document.getElementById('qsMessage')?.value?.trim() || '';
  const expires = expDays > 0 ? new Date(Date.now() + expDays * 86400000).toISOString() : null;

  let count = 0;
  for (const email of _shared.qsRecipients) {
    const share = {
      id:              generateId(),
      document_id:     docId,
      sender_id:       G.currentUser.id,
      recipient_email: email,
      recipient_id:    G.users.find(u => u.email === email)?.id || null,
      permission:      perm,
      expires_at:      expires,
      message:         message,
      status:          'active',
      views:           0,
      downloads:       0,
      created_at:      new Date().toISOString()
    };

    const { error } = await G.supabase.from('shares').insert(share);
    if (!error) {
      G.shares.push(share);
      count++;
      await addAuditLog('share', 'document', docId, `Partagé avec ${email} (${perm})`);
    }
  }

  const doc = G.documents.find(d => d.id === docId);
  showToast(`Document "${doc?.name || ''}" partagé avec ${count} destinataire(s)`, 'success');
}

async function _executeLinkShare(docId) {
  const expDays = parseInt(document.getElementById('qsLinkExpiry')?.value || '7');
  const perm    = document.getElementById('qsLinkPerm')?.value || 'view';
  const usePwd  = document.getElementById('qsLinkUsePwd')?.checked;
  const pwd     = document.getElementById('qsLinkPwd')?.value;
  const useMax  = document.getElementById('qsLinkUseMaxViews')?.checked;
  const maxV    = parseInt(document.getElementById('qsLinkMaxViews')?.value || '0');

  const url = await _doCreatePublicLink(docId, expDays, perm, usePwd ? pwd : null, useMax ? maxV : null);

  const result = document.getElementById('qsLinkResult');
  const input  = document.getElementById('qsLinkValue');
  if (result) result.classList.remove('hidden');
  if (input)  input.value = url;

  await navigator.clipboard.writeText(url).catch(() => {});
  showToast('Lien généré et copié !', 'success');
}

async function _executeTeamShare(docId) {
  const target = document.getElementById('qsTeamTarget')?.value || 'all';
  const perm   = document.getElementById('qsTeamPerm')?.value   || 'view';

  const targets = target === 'all'
    ? G.users.filter(u => u.status === 'active' && u.id !== G.currentUser.id)
    : G.users.filter(u => u.status === 'active' && u.role === target && u.id !== G.currentUser.id);

  if (targets.length === 0) throw new Error('Aucun utilisateur dans cette cible');
  if (!confirm(`Partager avec ${targets.length} membre(s) ?`)) return;

  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  let count = 0;

  for (const user of targets) {
    const share = {
      id:              generateId(),
      document_id:     docId,
      sender_id:       G.currentUser.id,
      recipient_email: user.email,
      recipient_id:    user.id,
      permission:      perm,
      expires_at:      expires,
      status:          'active',
      views:           0,
      downloads:       0,
      created_at:      new Date().toISOString()
    };
    const { error } = await G.supabase.from('shares').insert(share);
    if (!error) { G.shares.push(share); count++; }
  }

  showToast(`Document partagé avec ${count} membre(s) de l'équipe`, 'success');
  await addAuditLog('share_team', 'document', docId, `Cible: ${target}, permission: ${perm}`);
}

/* ──────────────────────────────────────────────────────────────────
   MODAL : DÉTAIL D'UN PARTAGE
────────────────────────────────────────────────────────────────── */
function openShareDetailModal(shareId) {
  const share = G.shares.find(s => s.id === shareId);
  if (!share) return;

  const doc    = G.documents.find(d => d.id === share.document_id);
  const sender = G.users.find(u => u.id === share.sender_id);
  const status = _shareStatus(share);

  const container = document.getElementById('shareDetailContent');
  if (container) {
    container.innerHTML = `
      <!-- Document -->
      <div class="glass-card rounded-xl p-4 border border-blue-500/20">
        <p class="text-blue-300/60 text-xs mb-2">Document partagé</p>
        <div class="flex items-center gap-3 cursor-pointer hover:bg-blue-500/5 rounded-lg p-2 -m-2 transition-all"
             onclick="closeShareDetailModal();openPreviewModal('${share.document_id}')">
          <i class="fas ${getFileIcon(doc?.type).split(' ')[0]} ${getFileIcon(doc?.type).split(' ')[1] || 'text-blue-400'} text-xl"></i>
          <div>
            <p class="text-white font-semibold">${escapeHtml(doc?.name || 'Document inconnu')}</p>
            <p class="text-xs text-blue-300/50">${doc ? formatBytes(doc.size) : ''}</p>
          </div>
          <i class="fas fa-external-link-alt text-blue-400/40 ml-auto"></i>
        </div>
      </div>
      <!-- Infos partage -->
      <div class="grid grid-cols-2 gap-3">
        <div class="glass-card rounded-xl p-3 border border-blue-500/15">
          <p class="text-blue-300/50 text-xs mb-1">Expéditeur</p>
          <p class="text-white text-sm font-medium">${escapeHtml(sender?.name || share.sender_id?.substring(0,8) || '—')}</p>
        </div>
        <div class="glass-card rounded-xl p-3 border border-blue-500/15">
          <p class="text-blue-300/50 text-xs mb-1">Destinataire</p>
          <p class="text-white text-sm font-medium truncate">${escapeHtml(share.recipient_email || '—')}</p>
        </div>
        <div class="glass-card rounded-xl p-3 border border-blue-500/15">
          <p class="text-blue-300/50 text-xs mb-1">Permission</p>
          <span class="text-xs px-2 py-1 rounded-full perm-badge-${share.permission || 'view'}">${_permLabel(share.permission)}</span>
        </div>
        <div class="glass-card rounded-xl p-3 border border-blue-500/15">
          <p class="text-blue-300/50 text-xs mb-1">Statut</p>
          <span class="text-xs px-2 py-1 rounded-full status-${status}">${_statusLabel(status)}</span>
        </div>
        <div class="glass-card rounded-xl p-3 border border-blue-500/15">
          <p class="text-blue-300/50 text-xs mb-1">Créé le</p>
          <p class="text-white text-sm">${formatDate(share.created_at)}</p>
        </div>
        <div class="glass-card rounded-xl p-3 border border-blue-500/15">
          <p class="text-blue-300/50 text-xs mb-1">Expiration</p>
          <p class="text-white text-sm ${_isExpired(share) ? 'text-orange-400' : ''}">
            ${share.expires_at ? formatDate(share.expires_at) : 'Illimitée'}
          </p>
        </div>
      </div>
      <!-- Statistiques -->
      <div class="glass-card rounded-xl p-4 border border-purple-500/15">
        <p class="text-white font-semibold text-sm mb-3 flex items-center gap-2">
          <i class="fas fa-chart-bar text-purple-400"></i>Statistiques d'accès
        </p>
        <div class="grid grid-cols-3 gap-3 text-center">
          <div><p class="text-2xl font-bold text-purple-300">${share.views || 0}</p><p class="text-[10px] text-blue-300/50">Vues</p></div>
          <div><p class="text-2xl font-bold text-green-300">${share.downloads || 0}</p><p class="text-[10px] text-blue-300/50">Téléchargements</p></div>
          <div><p class="text-2xl font-bold text-blue-300">${share.last_accessed ? formatDate(share.last_accessed) : '—'}</p><p class="text-[10px] text-blue-300/50">Dernier accès</p></div>
        </div>
      </div>
      <!-- Actions -->
      ${status === 'active' && share.sender_id === G.currentUser?.id ? `
      <div class="flex gap-3">
        <button onclick="extendShare('${share.id}', 7); closeShareDetailModal();"
          class="flex-1 py-2.5 rounded-xl text-sm text-green-400 border border-green-500/25 hover:bg-green-500/10 flex items-center justify-center gap-2">
          <i class="fas fa-calendar-plus"></i>Prolonger +7j
        </button>
        <button onclick="revokeShare('${share.id}'); closeShareDetailModal();"
          class="flex-1 py-2.5 rounded-xl text-sm text-red-400 border border-red-500/25 hover:bg-red-500/10 flex items-center justify-center gap-2">
          <i class="fas fa-ban"></i>Révoquer
        </button>
      </div>` : ''}
    `;
  }

  const modal = document.getElementById('shareDetailModal');
  if (modal) modal.classList.remove('hidden');
}

function closeShareDetailModal() {
  const modal = document.getElementById('shareDetailModal');
  if (modal) modal.classList.add('hidden');
}

/* ──────────────────────────────────────────────────────────────────
   COMPATIBILITÉ AVEC L'ANCIEN CODE
   (les fonctions ci-dessous sont appelées par d'autres parties de app.js)
────────────────────────────────────────────────────────────────── */

/** Ancienne fonction refreshShares() — maintenant complète */
async function refreshShares() {
  if (!G.currentUser || !G.supabase) return;

  showToast('Actualisation des partages…', 'info');

  const [sentRes, receivedRes] = await Promise.all([
    G.supabase.from('shares').select('*').eq('sender_id', G.currentUser.id),
    G.supabase.from('shares').select('*').eq('recipient_email', G.currentUser.email)
  ]);

  const allIds = new Set([
    ...(sentRes.data || []).map(s => s.id),
    ...(receivedRes.data || []).map(s => s.id)
  ]);

  // Merge : keep shares we already have, replace/add new ones
  const merged = G.shares.filter(s => !allIds.has(s.id));
  G.shares = [...merged, ...(sentRes.data || []), ...(receivedRes.data || [])];

  // Dedup
  const seen = new Set();
  G.shares = G.shares.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });

  // Load public links
  try {
    const { data: links } = await G.supabase
      .from('public_shares')
      .select('*')
      .eq('created_by', G.currentUser.id);
    _shared.publicLinks = links || [];
  } catch (_) {}

  renderShared();
  updateBadges();
  showToast('Partages actualisés', 'success');
}

/** shareDocument() — conservée pour compatibilité avec le shareModal existant */
async function shareDocument() {
  const email = document.getElementById('shareEmail')?.value.trim();
  if (!email) { showToast('Veuillez entrer un email', 'warning'); return; }

  const docId = G.currentDocId;
  if (!docId) { showToast('Aucun document sélectionné', 'error'); return; }

  const { data: targetUser } = await G.supabase
    .from('profiles').select('id').eq('email', email).eq('company_id', G.currentUser.companyId).single();

  if (!targetUser) { showToast('Cet utilisateur n\'appartient pas à votre entreprise', 'error'); return; }

  const existing = G.shares.find(s =>
    s.document_id === docId && s.recipient_email === email && s.status === 'active'
  );
  if (existing) { showToast('Ce document est déjà partagé avec cet utilisateur', 'warning'); return; }

  const perm    = document.getElementById('sharePermission')?.value || 'view';
  const expDays = parseInt(document.getElementById('shareExpiration')?.value || '0');
  const expires = expDays > 0 ? new Date(Date.now() + expDays * 86400000).toISOString() : null;

  const share = {
    id: generateId(), document_id: docId, sender_id: G.currentUser.id,
    recipient_email: email, recipient_id: targetUser.id, permission: perm,
    expires_at: expires, status: 'active', views: 0, downloads: 0,
    created_at: new Date().toISOString()
  };

  const { error } = await G.supabase.from('shares').insert(share);
  if (error) { showToast('Erreur partage : ' + error.message, 'error'); return; }

  G.shares.push(share);
  showToast(`Document partagé avec ${email}`, 'success');
  closeShareModal();
  updateBadges();
  await addAuditLog('share', 'document', docId, `Partagé avec ${email} (${perm})`);
  if (G.currentView === 'shared') renderShared();
}

/** generatePublicLink() — conservée pour compatibilité avec le bouton dans previewModal */
async function generatePublicLink(docId, expiresInDays = 7) {
  if (!docId) return;
  const url = await _doCreatePublicLink(docId, expiresInDays, 'view', null, null);
  if (!url) return;

  const linkInput = document.getElementById('shareLinkInput');
  const genDiv    = document.getElementById('generatedLink');
  if (linkInput) linkInput.value = url;
  if (genDiv)    genDiv.classList.remove('hidden');

  return url;
}

/** copyShareLink() — conservée */
function copyShareLink() {
  const val = document.getElementById('shareLinkInput')?.value;
  if (val) _copyText(val);
}

/* ──────────────────────────────────────────────────────────────────
   UTILITAIRES PRIVÉS
────────────────────────────────────────────────────────────────── */
function _setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function _setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) { el.textContent = count; el.classList.remove('hidden'); }
  else             el.classList.add('hidden');
}

function _permLabel(perm) {
  const m = { view: '👁 Lecture', download: '⬇ Téléchargement', edit: '✏ Modification' };
  return m[perm] || perm || '—';
}

function _statusLabel(status) {
  const m = { active: '✅ Actif', revoked: '🚫 Révoqué', expired: '⏰ Expiré' };
  return m[status] || status;
}

function _cardBorderClass(status) {
  const m = {
    active:  'border-blue-500/20 hover:border-blue-400/40',
    revoked: 'border-red-500/15 hover:border-red-400/30',
    expired: 'border-orange-500/15 hover:border-orange-400/30'
  };
  return m[status] || 'border-blue-500/20';
}

function _copyText(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
      .then(() => showToast('Copié dans le presse-papiers', 'success'))
      .catch(() => _fallbackCopy(text));
  } else {
    _fallbackCopy(text);
  }
}

/* ──────────────────────────────────────────────────────────────────
   EXPOSITION GLOBALE
────────────────────────────────────────────────────────────────── */
Object.assign(window, {
  // Navigation
  switchSharedTab, renderShared, filterSharedView, clearSharedFilters,
  // Actions partages
  revokeShare, revokeReceivedShare, extendShare, renewShare,
  deleteShareRecord, purgeExpiredShares,
  // Bulk
  toggleBulkSelect, bulkRevokeSelected, bulkExtendSelected, clearBulkSelection,
  // Liens publics
  createPublicLink, revokePublicLink, deletePublicLink, extendPublicLink,
  copyPublicLink, copyQsLink, shareViaEmail, loadShareActivity,
  // Modal Quick Share
  openQuickShareModal, closeQuickShareModal, switchQuickShareTab, executeQuickShare,
  addShareRecipient, handleShareEmailKeydown, suggestShareRecipients, selectQsSuggestion,
  toggleQsLinkPwd, toggleQsLinkMaxViews,
  // Modal Détail
  openShareDetailModal, closeShareDetailModal,
  // Compatibilité
  shareDocument, generatePublicLink, copyShareLink, refreshShares,
});

// ─── Workflows ───
async function renderWorkflows() {
  const container = document.getElementById('wfKanban');
  if (!container) return;

  // Recharger depuis Supabase
  if (G.supabase && G.currentUser?.companyId) {
    try {
      const { data, error } = await G.supabase
        .from('workflows')
        .select('*')
        .eq('company_id', G.currentUser.companyId)
        .order('created_at', { ascending: false });
      if (!error && data) G.workflows = data;
    } catch (err) {
      console.warn('renderWorkflows: erreur Supabase', err);
    }
  }

  let wfs = G.workflows;
  if (G.wfFilter) wfs = wfs.filter(w => w.status === G.wfFilter);

  const statuses = ['pending', 'in_review', 'approved', 'rejected'];
  container.innerHTML = statuses.map(status => {
    const cards = wfs.filter(w => w.status === status);
    return `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20 min-h-[120px]">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-semibold ${getWfStatusColor(status)}">${getWfStatusLabel(status)}</h4>
        <span class="text-xs px-2 py-0.5 rounded-full ${getWfStatusClass(status)}">${cards.length}</span>
      </div>
      <div class="space-y-2">
        ${cards.length === 0
          ? '<p class="text-xs text-blue-300/30 text-center py-4">Aucun workflow</p>'
          : cards.map(wf => {
              const assignee = wf.assignee_id ? G.users.find(u => u.id === wf.assignee_id) : null;
              const docName  = wf.document_id ? G.documents.find(d => d.id === wf.document_id)?.name : null;
              return `
              <div class="p-3 rounded-lg bg-slate-800/50 border border-blue-500/10 cursor-pointer hover:bg-slate-700/50 hover:border-blue-400/30 transition-all group"
                   onclick="openWfDetail('${wf.id}')">
                <p class="text-white text-sm font-medium truncate">${escapeHtml(wf.title)}</p>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                  <span class="text-[10px] px-1.5 py-0.5 rounded ${wf.priority === 'high' ? 'bg-red-500/20 text-red-300' : wf.priority === 'low' ? 'bg-gray-500/20 text-gray-400' : 'bg-yellow-500/20 text-yellow-300'}">${wf.priority || 'medium'}</span>
                  ${assignee ? `<span class="text-[10px] text-green-400/70"><i class="fas fa-user mr-1"></i>${escapeHtml(assignee.name)}</span>` : ''}
                  ${docName  ? `<span class="text-[10px] text-blue-300/50 truncate max-w-[100px]"><i class="fas fa-file mr-1"></i>${escapeHtml(docName)}</span>` : ''}
                </div>
                ${wf.due_date ? `<p class="text-[10px] text-orange-400/70 mt-1"><i class="fas fa-calendar mr-1"></i>Échéance : ${formatDate(wf.due_date)}</p>` : ''}
                <p class="text-[10px] text-blue-400/40 mt-1">${formatDate(wf.created_at)}</p>
              </div>`;
            }).join('')
        }
      </div>
    </div>`;
  }).join('');

  // KPI strip
  const counts = { pending: 0, in_review: 0, approved: 0, rejected: 0 };
  G.workflows.forEach(w => { if (counts[w.status] !== undefined) counts[w.status]++; });
  const wfKpiStrip = document.getElementById('wfKpiStrip');
  if (wfKpiStrip) {
    wfKpiStrip.innerHTML = `
      <div class="glass-card rounded-xl p-2 text-center cursor-pointer hover:bg-orange-500/10 transition-all" onclick="filterWorkflows('pending')">
        <p class="text-orange-400 text-xl font-bold">${counts.pending}</p>
        <p class="text-xs text-blue-300/60">En attente</p>
      </div>
      <div class="glass-card rounded-xl p-2 text-center cursor-pointer hover:bg-blue-500/10 transition-all" onclick="filterWorkflows('in_review')">
        <p class="text-blue-400 text-xl font-bold">${counts.in_review}</p>
        <p class="text-xs text-blue-300/60">En révision</p>
      </div>
      <div class="glass-card rounded-xl p-2 text-center cursor-pointer hover:bg-green-500/10 transition-all" onclick="filterWorkflows('approved')">
        <p class="text-green-400 text-xl font-bold">${counts.approved}</p>
        <p class="text-xs text-blue-300/60">Approuvés</p>
      </div>
      <div class="glass-card rounded-xl p-2 text-center cursor-pointer hover:bg-red-500/10 transition-all" onclick="filterWorkflows('rejected')">
        <p class="text-red-400 text-xl font-bold">${counts.rejected}</p>
        <p class="text-xs text-blue-300/60">Rejetés</p>
      </div>
    `;
  }

  // Mettre à jour aussi le wfListView si visible
  if (G.wfView === 'list') renderWorkflowsList();

  updateBadges();
}

function closeWfDetailModal() {
  const modal = document.getElementById('wfDetailModal');
  if (modal) modal.classList.add('hidden');
  G.currentWfId = null;
}

function switchWfView(view) {
  ['kanban','list'].forEach(v => {
    const el = document.getElementById(`wfView-${v}`);
    if (el) el.classList.toggle('hidden', v !== view);
    const btn = document.querySelector(`[data-wf-view="${v}"]`);
    if (btn) btn.classList.toggle('active', v === view);
  });
}
function getWfStatusClass(status) {
  const classes = { 
    pending: 'bg-orange-500/20 text-orange-300', 
    in_review: 'bg-blue-500/20 text-blue-300', 
    approved: 'bg-green-500/20 text-green-300', 
    rejected: 'bg-red-500/20 text-red-300' 
  };
  return classes[status] || 'bg-gray-500/20 text-gray-300';
}

function getWfStatusLabel(status) {
  const labels = { 
    pending: 'En attente', 
    in_review: 'En révision', 
    approved: 'Approuvé', 
    rejected: 'Rejeté' 
  };
  return labels[status] || status;
}

function getWfStatusColor(status) {
  const colors = { 
    pending: 'text-orange-400', 
    in_review: 'text-blue-400', 
    approved: 'text-green-400', 
    rejected: 'text-red-400' 
  };
  return colors[status] || 'text-gray-400';
}

function closeWorkflowModal() {
const modal = document.getElementById('workflowModal');
if (modal) modal.classList.add('hidden');
const fields = ['wfTitle', 'wfDesc', 'wfSteps'];
fields.forEach(id => {
  const el = document.getElementById(id);
  if (el) el.value = '';
});
}

function openCreateWorkflowModal() {
  const docSelect = document.getElementById('wfDocId');
  if (docSelect) {
    docSelect.innerHTML = '<option value="">-- Aucun --</option>' + 
      G.documents.filter(d => !d.is_deleted).map(doc => `<option value="${doc.id}">${escapeHtml(doc.name)}</option>`).join('');
  }
  const assigneeSelect = document.getElementById('wfAssignee');
  if (assigneeSelect) {
    assigneeSelect.innerHTML = '<option value="">-- Non assigné --</option>' + 
      G.users.filter(u => u.status === 'active').map(user => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join('');
  }
  
  // Réinitialiser les champs
  const titleInput = document.getElementById('wfTitle');
  const descInput = document.getElementById('wfDesc');
  const stepsInput = document.getElementById('wfSteps');
  const prioritySelect = document.getElementById('wfPriority');
  const dueDateInput = document.getElementById('wfDueDate');
  if (titleInput) titleInput.value = '';
  if (descInput) descInput.value = '';
  if (stepsInput) stepsInput.value = '';
  if (prioritySelect) prioritySelect.value = 'medium';
  if (dueDateInput) dueDateInput.value = '';
  
  const modal = document.getElementById('workflowModal');
  if (modal) modal.classList.remove('hidden');
}

async function createWorkflow(e) {
  e.preventDefault();
  const title = document.getElementById('wfTitle')?.value.trim();
  if (!title) {
    showToast('Veuillez entrer un titre', 'warning');
    return;
  }
  
  const steps = [];
  const stepsInput = document.getElementById('wfSteps')?.value;
  if (stepsInput) {
    steps.push(...stepsInput.split(',').map(s => s.trim()).filter(s => s));
  }
  
  const newWf = {
    id: generateId(),
    title,
    description: document.getElementById('wfDesc')?.value.trim() || '',
    priority: document.getElementById('wfPriority')?.value || 'medium',
    status: 'pending',
    assignee_id: document.getElementById('wfAssignee')?.value || null,
    document_id: document.getElementById('wfDocId')?.value || null,
    due_date: document.getElementById('wfDueDate')?.value || null,
    created_by: G.currentUser.id,
    company_id: G.currentUser.companyId,
    steps: steps,
    current_step: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('workflows').insert(newWf);
  if (error) {
    showToast('Erreur création workflow: ' + error.message, 'error');
    return;
  }
  
  G.workflows.unshift(newWf);
  showToast('Workflow créé avec succès', 'success');
  closeWorkflowModal();
  if (G.wfView === 'kanban') renderWorkflows();
  else renderWorkflowsList();
  
  await addAuditLog('workflow_create', 'workflow', newWf.id, `Titre: ${title}`);
}

async function actOnWorkflow(action, comment) {
  if (!G.currentWfId) return;
  
  const wf = G.workflows.find(w => w.id === G.currentWfId);
  if (!wf) return;
  
  const commentText = document.getElementById('wfDetailComment')?.value || comment || '';
  
  const actionRecord = {
    id: generateId(),
    workflow_id: G.currentWfId,
    user_id: G.currentUser.id,
    action: action,
    comment: commentText,
    step_index: wf.current_step,
    created_at: new Date().toISOString()
  };
  
  const { error: actionError } = await G.supabase.from('workflow_actions').insert(actionRecord);
  if (actionError) console.warn('workflow_actions RLS:', actionError?.code);
  
  let newStatus = wf.status;
  let newStep = wf.current_step;
  
  if (action === 'approve') {
    if (wf.steps && wf.current_step + 1 >= (wf.steps?.length || 0)) {
      newStatus = 'approved';
    } else {
      newStep = (wf.current_step || 0) + 1;
      newStatus = 'in_review';
    }
  } else if (action === 'reject') {
    newStatus = 'rejected';
  } else if (action === 'request_changes') {
    newStatus = 'in_review';
  } else if (action === 'comment') {
    // Pas de changement de statut pour un simple commentaire
    newStatus = wf.status;
  }
  
  const { error: updateError } = await G.supabase
    .from('workflows')
    .update({ 
      status: newStatus, 
      current_step: newStep,
      updated_at: new Date().toISOString()
    })
    .eq('id', G.currentWfId);
  
  if (updateError) {
    showToast('Erreur mise à jour workflow: ' + updateError.message, 'error');
    return;
  }
  
  // Mettre à jour l'objet local
  wf.status = newStatus;
  wf.current_step = newStep;
  
  showToast(`Workflow ${action === 'approve' ? 'approuvé' : action === 'reject' ? 'rejeté' : 'mis à jour'}`, 'success');
  
  // Rafraîchir l'affichage
  if (G.wfView === 'kanban') renderWorkflows();
  else renderWorkflowsList();
  closeWfDetail();
  
  await addAuditLog(`workflow_${action}`, 'workflow', G.currentWfId, `Commentaire: ${commentText || 'Aucun'}`);
}

async function loadWorkflowHistory(wfId) {
  const { data: actions, error } = await G.supabase
    .from('workflow_actions')
    .select('*, profiles!user_id(name)')
    .eq('workflow_id', wfId)
    .order('created_at', { ascending: false });
  
  const historyContainer = document.getElementById('wfDetailHistory');
  if (historyContainer) {
    if (!actions || actions.length === 0) {
      historyContainer.innerHTML = '<p class="text-center py-4 text-blue-300/50">Aucune activité</p>';
    } else {
      historyContainer.innerHTML = actions.map(a => `
        <div class="p-2 border-b border-blue-500/10">
          <div class="flex items-center justify-between">
            <p class="text-white text-xs font-medium">${a.profiles?.name || 'Utilisateur'}</p>
            <span class="text-blue-300/50 text-[10px]">${formatDate(a.created_at)}</span>
          </div>
          <p class="text-blue-300/70 text-xs mt-0.5">${getWfActionLabel(a.action)}</p>
          ${a.comment ? `<p class="text-xs text-blue-300/50 mt-1 italic">"${escapeHtml(a.comment)}"</p>` : ''}
        </div>
      `).join('');
    }
  }
}
async function addWfComment() {
  const comment = document.getElementById('wfCommentInput')?.value.trim();
  if (!comment || !G.currentWfId) {
    showToast('Veuillez écrire un commentaire', 'warning');
    return;
  }
  
  const actionRecord = {
    id: generateId(),
    workflow_id: G.currentWfId,
    user_id: G.currentUser.id,
    action: 'comment',
    comment: comment,
    created_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('workflow_actions').insert(actionRecord);
  if (error) {
    showToast('Erreur ajout commentaire', 'error');
    return;
  }
  
  const input = document.getElementById('wfCommentInput');
  if (input) input.value = '';
  await loadWorkflowHistory(G.currentWfId);
  showToast('Commentaire ajouté', 'success');
}

function getWfActionLabel(action) {
  const labels = { approve: 'approuvé', reject: 'rejeté', request_changes: 'demandé des modifications', comment: 'commenté' };
  return labels[action] || action;
}

function closeWfDetail() {
  const modal = document.getElementById('wfDetailModal');
  if (modal) modal.classList.add('hidden');
  G.currentWfId = null;
}

function filterWorkflows(status) {
  // Toggle: si on reclique sur le même filtre, l'effacer
  G.wfFilter = G.wfFilter === status ? '' : status;

  document.querySelectorAll('.wf-filter-btn').forEach(btn => {
    const active = btn.dataset.wf === G.wfFilter;
    btn.classList.toggle('bg-blue-500/20', active);
    btn.classList.toggle('text-blue-300', active);
    btn.classList.toggle('border-blue-500/30', active);
    btn.classList.toggle('text-gray-400', !active);
    btn.classList.toggle('border-blue-500/10', !active);
  });

  if (G.wfView === 'kanban') renderWorkflows();
  else renderWorkflowsList();
}

function searchWorkflows(query) {
  if (!query || query.length < 2) {
    if (G.wfView === 'kanban') renderWorkflows();
    else renderWorkflowsList();
    return;
  }
  
  const filtered = G.workflows.filter(w => w.title.toLowerCase().includes(query.toLowerCase()) || 
    (w.description && w.description.toLowerCase().includes(query.toLowerCase())));
  
  const container = document.getElementById('wfKanban');
  const listContainer = document.getElementById('wfListView');
  
  if (G.wfView === 'kanban' && container) {
    if (filtered.length === 0) {
      container.innerHTML = '<div class="col-span-full text-center py-12 text-blue-300/50">Aucun résultat</div>';
    } else {
      container.innerHTML = filtered.map(wf => `
        <div class="glass-card rounded-xl p-4 border border-blue-500/20 cursor-pointer" onclick="openWfDetail('${wf.id}')">
          <p class="text-white font-medium">${escapeHtml(wf.title)}</p>
          <span class="text-xs px-2 py-0.5 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span>
        </div>
      `).join('');
    }
  } else if (listContainer) {
    if (filtered.length === 0) {
      listContainer.innerHTML = '<div class="text-center py-12 text-blue-300/50">Aucun résultat</div>';
    } else {
      listContainer.innerHTML = filtered.map(wf => `
        <div class="glass-card rounded-xl p-4 border border-blue-500/20 cursor-pointer" onclick="openWfDetail('${wf.id}')">
          <div class="flex justify-between"><span class="text-white font-medium">${escapeHtml(wf.title)}</span><span class="text-xs px-2 py-1 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span></div>
        </div>
      `).join('');
    }
  }
}

function setWfView(view) {
  G.wfView = view;
  const kanban = document.getElementById('wfKanban');
  const listView = document.getElementById('wfListView');
  const btnKanban = document.getElementById('wfViewKanban');
  const btnList = document.getElementById('wfViewList');
  
  if (view === 'kanban') {
    if (kanban) kanban.classList.remove('hidden');
    if (listView) listView.classList.add('hidden');
    if (btnKanban) btnKanban.classList.add('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    if (btnList) btnList.classList.remove('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    renderWorkflows();
  } else {
    if (kanban) kanban.classList.add('hidden');
    if (listView) listView.classList.remove('hidden');
    if (btnList) btnList.classList.add('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    if (btnKanban) btnKanban.classList.remove('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    renderWorkflowsList();
  }
}

async function renderWorkflowsList() {
  const container = document.getElementById('wfListView');
  if (!container) return;

  // Recharger depuis Supabase si pas déjà fait par renderWorkflows
  if (G.supabase && G.currentUser?.companyId && G.wfView === 'list') {
    try {
      const { data, error } = await G.supabase
        .from('workflows')
        .select('*')
        .eq('company_id', G.currentUser.companyId)
        .order('created_at', { ascending: false });
      if (!error && data) G.workflows = data;
    } catch (err) {
      console.warn('renderWorkflowsList: erreur Supabase', err);
    }
  }

  let filtered = G.workflows;
  if (G.wfFilter) filtered = filtered.filter(w => w.status === G.wfFilter);

  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-tasks text-4xl mb-2 opacity-20"></i><p>Aucun workflow trouvé</p></div>';
    return;
  }

  container.innerHTML = filtered.map(wf => {
    const assignee = wf.assignee_id ? G.users.find(u => u.id === wf.assignee_id) : null;
    const doc      = wf.document_id ? G.documents.find(d => d.id === wf.document_id) : null;
    return `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20 cursor-pointer hover:border-blue-400/40 transition-all group" onclick="openWfDetail('${wf.id}')">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="flex-1 min-w-0">
          <p class="text-white font-medium truncate">${escapeHtml(wf.title)}</p>
          <div class="flex items-center gap-2 mt-1 flex-wrap">
            <span class="text-xs px-2 py-0.5 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span>
            <span class="text-xs text-blue-300/60">Priorité : ${wf.priority || 'medium'}</span>
            <span class="text-xs text-blue-300/60">${formatDate(wf.created_at)}</span>
          </div>
          ${assignee ? `<p class="text-xs text-green-400/60 mt-1"><i class="fas fa-user mr-1"></i>${escapeHtml(assignee.name)}</p>` : ''}
          ${doc       ? `<p class="text-xs text-blue-300/50 mt-1 truncate"><i class="fas fa-file mr-1"></i>${escapeHtml(doc.name)}</p>` : ''}
          ${wf.due_date ? `<p class="text-xs text-orange-400/70 mt-1"><i class="fas fa-calendar mr-1"></i>Échéance : ${formatDate(wf.due_date)}</p>` : ''}
        </div>
        <i class="fas fa-chevron-right text-blue-400/50 group-hover:text-blue-300 transition-colors"></i>
      </div>
    </div>`;
  }).join('');
}

// ─── Users ───
// ═══════════════════════════════════════════════════════════════════════
// SystemesGED v7.3 — MODULE : Users · Pending · Tags · Settings ·
//                             Security · API Keys · Integrations · AuditV6
// BUG-U1   FIXE · renderUsers() async + rechargement Supabase
// BUG-U2   FIXE · updatePendingUsersCount() exportee
// BUG-U3   AJOUT · searchUsers(), filterUsersByRole(), changeUserStatus()
// BUG-U4   FIXE · addUser() validation robuste + modal mdp visible
// BUG-P1   FIXE · renderPendingUsers() async + rechargement Supabase
// BUG-P2   FIXE · approveAllPending/rejectAllPending batch Promise.all
// BUG-P3   FIXE · refreshPendingUsers() async + fetch
// BUG-T1   FIXE · renderTags() async + rechargement Supabase
// BUG-T2   FIXE · createTag() validation doublon + couleur auto
// BUG-T3   FIXE · clearTagFilter() exportee
// BUG-T4   AJOUT · editTag(), getTagStats()
// BUG-S1   FIXE · renderSettings() complet (avatar, langue, notifs)
// BUG-S2   FIXE · toggleSetting() persistance Supabase
// BUG-S3   AJOUT · changePassword(), updateCompanySettings()
// BUG-SEC1 FIXE · renderSecurity() async + rechargement Supabase
// BUG-SEC2 FIXE · renderAuditLog() async + fetch paginé
// BUG-SEC3 FIXE · loadDeletedDocs() async + exportee
// BUG-SEC4 FIXE · scanAllDocuments() vrai scan MIME
// BUG-K1   FIXE · renderApiKeys() async + rechargement Supabase
// BUG-K2   AJOUT · permissions + expiration + modal key
// BUG-I1   FIXE · connectIntegration() etat connecte + OAuth
// BUG-I2   FIXE · addWebhook() Supabase + testWebhook() + listWebhooks()
// BUG-A1   FIXE · renderAuditV6() async + rechargement Supabase
// BUG-A2   FIXE · pagination Supabase LIMIT/OFFSET
// BUG-A3   FIXE · filterAuditLogs() server-side
// ═══════════════════════════════════════════════════════════════════════

/* ── Etat partagé ─────────────────────────────────────────────────── */
window._users = { searchQuery: '', roleFilter: '', statusFilter: '' };
window._tags  = { editingId: null };
window._sec   = { auditPage: 1, auditPageSize: 30 };
window._audit = { page: 1, pageSize: 25, totalCount: 0, filter: { action: '', severity: '', days: 30 } };
window._integrations = {};
window._webhooks = [];

const TAG_PALETTE = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'];

// ═══════════════════════════════════════════════════════════════════════
// 1. UTILISATEURS
// ═══════════════════════════════════════════════════════════════════════

async function renderUsers() {
  const tbody = document.getElementById('usersList');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6"><i class="fas fa-spinner fa-spin text-blue-400 text-xl"></i></td></tr>';

  if (G.supabase && G.currentUser?.companyId) {
    try {
      const { data, error } = await G.supabase.from('profiles').select('*').eq('company_id', G.currentUser.companyId).order('created_at', { ascending: false });
      if (!error && data) G.users = data;
    } catch (e) { console.warn('renderUsers reload:', e); }
  }

  let users = [...G.users];
  if (_users.searchQuery) {
    const q = _users.searchQuery.toLowerCase();
    users = users.filter(u => (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q));
  }
  if (_users.roleFilter)   users = users.filter(u => u.role === _users.roleFilter);
  if (_users.statusFilter) users = users.filter(u => u.status === _users.statusFilter);

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-blue-300/40"><i class="fas fa-users text-3xl mb-2 block opacity-20"></i>Aucun utilisateur</td></tr>';
    updatePendingUsersCount(); return;
  }

  const statusColors = { active: 'bg-green-500/20 text-green-400', pending_validation: 'bg-yellow-500/20 text-yellow-400', suspended: 'bg-red-500/20 text-red-400' };
  const statusLabel  = { active: 'Actif', pending_validation: 'En attente', suspended: 'Suspendu' };
  const avatarBg     = { admin: 'bg-red-500/20 text-red-400', manager: 'bg-orange-500/20 text-orange-400', editor: 'bg-blue-500/20 text-blue-400', viewer: 'bg-gray-500/20 text-gray-400' };

  tbody.innerHTML = users.map(u => {
    const isSelf = u.id === G.currentUser.id;
    const canAct = canValidateUsers() && !isSelf;
    return `<tr class="hover:bg-blue-500/5 transition-colors border-b border-blue-500/10">
      <td class="p-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full ${avatarBg[u.role]||'bg-blue-500/20 text-blue-400'} flex items-center justify-center text-sm font-bold">${(u.name||'U').charAt(0).toUpperCase()}</div>
          <div>
            <p class="text-white text-sm font-medium">${escapeHtml(u.name||'—')}${isSelf?'<span class="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300">Vous</span>':''}</p>
            <p class="text-xs text-blue-300/60">${escapeHtml(u.email||'')}</p>
          </div>
        </div>
      </td>
      <td class="p-4"><span class="px-2 py-1 rounded-full text-xs ${getRoleBadgeClass(u.role)}">${G.roles[u.role]?.name||u.role}</span></td>
      <td class="p-4 hidden md:table-cell text-xs text-blue-300/50">${formatDate(u.created_at)}</td>
      <td class="p-4 hidden sm:table-cell"><span class="px-2 py-1 rounded-full text-xs ${statusColors[u.status]||'bg-gray-500/20 text-gray-400'}">${statusLabel[u.status]||u.status}</span></td>
      <td class="p-4">
        <div class="flex gap-1 flex-wrap">
          ${u.status==='pending_validation'&&canAct?`<button onclick="validateUser('${u.id}')" class="px-2.5 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30 flex items-center gap-1"><i class="fas fa-check"></i>Valider</button>`:''}
          ${u.status==='active'&&canAct?`<button onclick="changeUserStatus('${u.id}','suspended')" class="px-2.5 py-1 rounded-lg bg-orange-500/20 text-orange-400 text-xs hover:bg-orange-500/30 flex items-center gap-1"><i class="fas fa-ban"></i>Suspendre</button>`:''}
          ${u.status==='suspended'&&canAct?`<button onclick="changeUserStatus('${u.id}','active')" class="px-2.5 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30 flex items-center gap-1"><i class="fas fa-check-circle"></i>Reactiver</button>`:''}
          ${canAct?`<button onclick="resetUserPassword('${u.email}')" class="p-1.5 rounded-lg hover:bg-yellow-500/20 text-yellow-400 transition-all" title="Reset mdp"><i class="fas fa-key text-sm"></i></button>`:''}
          ${canAct?`<button onclick="deleteUser('${u.id}')" class="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-all" title="Supprimer"><i class="fas fa-trash text-sm"></i></button>`:''}
        </div>
      </td>
    </tr>`;
  }).join('');
  updatePendingUsersCount();
}

function searchUsers(query) { _users.searchQuery=(query||'').trim(); renderUsers(); }
function filterUsersByRole(role) { _users.roleFilter=role||''; renderUsers(); }
function filterUsersByStatus(status) { _users.statusFilter=status||''; renderUsers(); }

async function changeUserStatus(userId, newStatus) {
  if (!canValidateUsers()) { showToast('Permission refusee', 'error'); return; }
  const user = G.users.find(u => u.id === userId);
  if (!user) return;
  if (!confirm(`${newStatus==='suspended'?'Suspendre':'Reactiver'} ${user.name} ?`)) return;
  try {
    const { error } = await G.supabase.from('profiles').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', userId);
    if (error) throw error;
    user.status = newStatus;
    showToast(`Utilisateur ${newStatus==='active'?'reactiv\xe9':'suspendu'}`, 'success');
    await addAuditLog(`user_${newStatus}`, 'user', userId, `${user.name} -> ${newStatus}`);
    renderUsers(); updatePendingUsersCount();
  } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
}

function openCreateUserModal() { if (!canValidateUsers()) { showToast('Permission refusee','error'); return; } const m=document.getElementById('addUserModal'); if(m) m.classList.remove('hidden'); }
function closeAddUserModal() { const m=document.getElementById('addUserModal'); if(m) m.classList.add('hidden'); }

async function addUser(e) {
  e.preventDefault();
  if (!canValidateUsers()) { showToast('Permission refusee','error'); return; }
  const firstName=document.getElementById('newUserFirst')?.value.trim();
  const lastName=document.getElementById('newUserLast')?.value.trim();
  const email=document.getElementById('newUserEmail')?.value.trim().toLowerCase();
  const role=document.getElementById('newUserRole')?.value||'viewer';
  if (!firstName||!lastName||!email) { showToast('Remplissez tous les champs','warning'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Email invalide','warning'); return; }
  const name=`${firstName} ${lastName}`;
  const tempPassword=generatePassword();
  const btn=document.getElementById('addUserSubmitBtn');
  if (btn) { btn.disabled=true; btn.innerHTML='<span class="spinner mr-2"></span>Creation\u2026'; }
  try {
    const response=await fetch(CONFIG.edgeFunctionUrl,{ method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${CONFIG.supabaseKey}`}, body:JSON.stringify({email,password:tempPassword,role,companyId:G.currentUser.companyId,name}) });
    const data=await response.json();
    if (!response.ok) throw new Error(data.error||'Erreur serveur');
    closeAddUserModal();
    _showTempPasswordModal(name,email,tempPassword);
    await loadAllData(); renderUsers(); updatePendingUsersCount();
    await addAuditLog('user_create','user',email,`Cree: ${name} (${role})`);
  } catch (err) { showToast('Erreur : '+err.message,'error'); }
  finally { if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-user-plus mr-2"></i>Crer l\'utilisateur'; } }
}

function _showTempPasswordModal(name,email,pwd) {
  let modal=document.getElementById('tempPwdModal');
  if (!modal) { modal=document.createElement('div'); modal.id='tempPwdModal'; modal.className='modal-overlay'; document.body.appendChild(modal); }
  modal.innerHTML=`<div class="modal-box" style="max-width:480px;">
    <div class="flex items-center gap-3 mb-5"><div class="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-green-400 border border-green-500/30"><i class="fas fa-user-check"></i></div>
    <div><h3 class="text-white font-bold">Utilisateur cree</h3><p class="text-blue-300/50 text-xs">${escapeHtml(name)} — ${escapeHtml(email)}</p></div></div>
    <div class="glass-card rounded-xl p-4 border border-yellow-500/25 mb-4" style="background:rgba(245,158,11,0.06)">
      <p class="text-yellow-400 text-xs font-bold mb-2 flex items-center gap-2"><i class="fas fa-exclamation-triangle"></i>Mot de passe temporaire</p>
      <div class="flex gap-2 items-center"><code class="flex-1 bg-slate-900/70 border border-yellow-500/30 rounded-lg px-3 py-2 text-yellow-300 font-mono text-sm">${escapeHtml(pwd)}</code>
      <button onclick="_copyText('${escapeHtml(pwd)}')" class="px-3 py-2 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 text-sm"><i class="fas fa-copy"></i></button></div>
    </div>
    <button onclick="document.getElementById('tempPwdModal').classList.add('hidden')" class="w-full btn-primary py-2.5 rounded-xl text-white text-sm font-semibold">J\'ai note le mot de passe</button>
  </div>`;
  modal.classList.remove('hidden');
}

async function validateUser(userId) {
  const user=G.users.find(u=>u.id===userId); if(!user) return;
  try {
    const {error}=await G.supabase.from('profiles').update({status:'active',validated_at:new Date().toISOString()}).eq('id',userId);
    if (error) throw error;
    user.status='active'; renderUsers(); renderPendingUsers(); updatePendingUsersCount();
    showToast(`${user.name} valid\xe9(e)`,'success');
    await addAuditLog('validate_user','user',userId,`Valid\xe9: ${user.name}`);
  } catch(err) { showToast('Erreur: '+err.message,'error'); }
}

async function deleteUser(userId) {
  if (!confirm('Supprimer definitivement cet utilisateur ?')) return;
  try {
    const {error}=await G.supabase.from('profiles').delete().eq('id',userId);
    if (error) throw error;
    G.users=G.users.filter(u=>u.id!==userId); renderUsers(); updatePendingUsersCount(); showToast('Utilisateur supprime','success');
  } catch(err) { showToast('Erreur: '+err.message,'error'); }
}

async function resetUserPassword(email) {
  const {error}=await G.supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/update-password.html`});
  if (error) showToast('Erreur: '+error.message,'error'); else showToast(`Email de r\xe9init. envoye a ${email}`,'success');
}

function openResetModal() { const m=document.getElementById('resetPasswordModal'); if(m) m.classList.remove('hidden'); const e=document.getElementById('resetEmail'); if(e) e.value=''; }
function closeResetModal() { const m=document.getElementById('resetPasswordModal'); if(m) m.classList.add('hidden'); }
async function sendResetEmail() {
  const email=document.getElementById('resetEmail')?.value.trim();
  if (!email) { showToast('Saisissez un email','warning'); return; }
  const {error}=await G.supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/update-password.html`});
  const mg=document.getElementById('resetMessage');
  if (error) { if(mg) mg.innerHTML=`<span class="text-red-400">Erreur: ${escapeHtml(error.message)}</span>`; }
  else { if(mg) mg.innerHTML='<span class="text-green-400">Email envoy\xe9.</span>'; setTimeout(closeResetModal,3000); }
}

function updatePendingUsersCount() {
  const count=G.users.filter(u=>u.status==='pending_validation').length;
  G.pendingUsersCount=count;
  document.querySelectorAll('.pending-users-badge, #d-pendingBadge, #m-pendingBadge').forEach(b=>{
    if (count>0&&canValidateUsers()) { b.textContent=count; b.classList.remove('hidden'); } else b.classList.add('hidden');
  });
  const el=document.getElementById('pendingCount'); if(el) el.textContent=count;
}

function generatePassword() {
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*+-=?';
  const arr=new Uint32Array(14); crypto.getRandomValues(arr);
  return Array.from(arr).map(n=>chars[n%chars.length]).join('');
}

// ═══════════════════════════════════════════════════════════════════════
// 2. VALIDATIONS EN ATTENTE
// ═══════════════════════════════════════════════════════════════════════

async function renderPendingUsers() {
  const container=document.getElementById('pendingUsersList'); if(!container) return;
  container.innerHTML='<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-blue-400 text-xl"></i></div>';
  if (G.supabase&&G.currentUser?.companyId) {
    try {
      const {data}=await G.supabase.from('profiles').select('*').eq('company_id',G.currentUser.companyId).eq('status','pending_validation').order('created_at',{ascending:true});
      if (data) { G.users=G.users.filter(u=>u.status!=='pending_validation').concat(data); const seen=new Set(); G.users=G.users.filter(u=>{if(seen.has(u.id))return false;seen.add(u.id);return true;}); }
    } catch(e) { console.warn('renderPendingUsers:',e); }
  }
  const pending=G.users.filter(u=>u.status==='pending_validation');
  updatePendingUsersCount();
  if (pending.length===0) { container.innerHTML='<div class="text-center py-12 text-blue-300/50"><i class="fas fa-user-check text-4xl mb-3 block opacity-20"></i><p class="font-semibold">Aucune validation en attente</p></div>'; return; }
  container.innerHTML=pending.map(u=>`
    <div class="glass-card rounded-xl p-4 border border-yellow-500/20 hover:border-yellow-400/40 transition-all">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 text-lg font-bold flex-shrink-0">${(u.name||'U').charAt(0).toUpperCase()}</div>
        <div class="flex-1 min-w-0">
          <p class="text-white font-semibold">${escapeHtml(u.name||'—')}</p>
          <p class="text-sm text-blue-300/60 truncate">${escapeHtml(u.email||'')}</p>
          <div class="flex items-center gap-3 mt-1 text-xs text-blue-300/40">
            <span><i class="fas fa-calendar mr-1"></i>${formatDate(u.created_at)}</span>
            <span class="px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400">${G.roles[u.role]?.name||u.role}</span>
          </div>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button onclick="validateUser('${u.id}')" class="px-4 py-2 rounded-xl bg-green-500/20 text-green-400 text-sm hover:bg-green-500/30 transition-all font-medium flex items-center gap-2"><i class="fas fa-check"></i>Valider</button>
          <button onclick="deleteUser('${u.id}')" class="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30 transition-all font-medium flex items-center gap-2"><i class="fas fa-times"></i>Refuser</button>
        </div>
      </div>
    </div>`).join('');
}

async function refreshPendingUsers() { await renderPendingUsers(); showToast('Liste actualis\xe9e','success'); }

async function approveAllPending() {
  const pending=G.users.filter(u=>u.status==='pending_validation');
  if (pending.length===0) { showToast('Aucun compte en attente','info'); return; }
  if (!confirm(`Valider les ${pending.length} compte(s) ?`)) return;
  const results=await Promise.allSettled(pending.map(u=>G.supabase.from('profiles').update({status:'active',validated_at:new Date().toISOString()}).eq('id',u.id)));
  const ok=results.filter(r=>r.status==='fulfilled'&&!r.value?.error).length;
  pending.forEach(u=>{ const x=G.users.find(y=>y.id===u.id); if(x) x.status='active'; });
  showToast(`${ok}/${pending.length} comptes valid\xe9s`,ok>0?'success':'error');
  await addAuditLog('approve_all_pending','user','batch',`${ok} comptes valid\xe9s en lot`);
  renderPendingUsers(); updatePendingUsersCount();
}

async function rejectAllPending() {
  const pending=G.users.filter(u=>u.status==='pending_validation');
  if (pending.length===0) { showToast('Aucun compte en attente','info'); return; }
  if (!confirm(`Refuser et supprimer les ${pending.length} compte(s) ? Irr\xe9versible.`)) return;
  await Promise.allSettled(pending.map(u=>G.supabase.from('profiles').delete().eq('id',u.id)));
  const ids=pending.map(u=>u.id); G.users=G.users.filter(u=>!ids.includes(u.id));
  showToast(`${pending.length} compte(s) refus\xe9(s)`,'success');
  renderPendingUsers(); updatePendingUsersCount();
}

// ═══════════════════════════════════════════════════════════════════════
// 3. TAGS
// ═══════════════════════════════════════════════════════════════════════

async function renderTags() {
  const container=document.getElementById('tagsList'); if(!container) return;
  if (G.supabase&&G.currentUser?.companyId) {
    try { const {data}=await G.supabase.from('tags').select('*').eq('company_id',G.currentUser.companyId).order('name'); if(data) G.tags=data; } catch(e) {}
  }
  if (G.tags.length===0) { container.innerHTML='<div class="text-center py-8 text-blue-300/50"><i class="fas fa-tags text-3xl mb-2 block opacity-20"></i><p>Aucun tag</p></div>'; return; }
  const usage={};
  G.documents.forEach(d=>(d.tags||[]).forEach(t=>{usage[t]=(usage[t]||0)+1;}));
  container.innerHTML=G.tags.map(t=>`
    <div class="glass-card rounded-xl p-3 border border-blue-500/15 hover:border-blue-400/30 transition-all group flex items-center gap-3">
      <div class="w-8 h-8 rounded-lg flex-shrink-0 cursor-pointer" style="background:${t.color}30;border:2px solid ${t.color}60" onclick="filterByTag('${escapeHtml(t.name)}')">
        <div class="w-full h-full flex items-center justify-center"><span class="text-[10px] font-bold" style="color:${t.color}">#</span></div>
      </div>
      <div class="flex-1 min-w-0">
        ${_tags.editingId===t.id
          ?`<div class="flex gap-2"><input id="etag_${t.id}" value="${escapeHtml(t.name)}" class="flex-1 px-2 py-1 rounded-lg text-white text-sm outline-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.3);" onkeydown="if(event.key===\'Enter\')confirmEditTag('${t.id}');if(event.key===\'Escape\')cancelEditTag()"><input type="color" id="etagc_${t.id}" value="${t.color}" class="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"></div>`
          :`<p class="text-white font-medium text-sm truncate cursor-pointer hover:text-blue-300" onclick="filterByTag('${escapeHtml(t.name)}')" style="color:${t.color}">${escapeHtml(t.name)}</p>`
        }
        <p class="text-xs text-blue-300/40 mt-0.5">${usage[t.name]||0} doc(s)</p>
      </div>
      <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        ${_tags.editingId===t.id
          ?`<button onclick="confirmEditTag('${t.id}')" class="p-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30" title="Valider"><i class="fas fa-check"></i></button>
             <button onclick="cancelEditTag()" class="p-1.5 rounded-lg bg-gray-500/20 text-gray-400 text-xs hover:bg-gray-500/30" title="Annuler"><i class="fas fa-times"></i></button>`
          :`<button onclick="startEditTag('${t.id}')" class="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400 text-xs" title="Modifier"><i class="fas fa-edit"></i></button>`
        }
        <button onclick="deleteTag('${t.id}')" class="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 text-xs" title="Supprimer"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('');
}

async function createTag() {
  const input=document.getElementById('newTagInput'); const colorEl=document.getElementById('newTagColor');
  const name=input?.value.trim(); if(!name){showToast('Entrez un nom de tag','warning');return;}
  if (G.tags.some(t=>t.name.toLowerCase()===name.toLowerCase())) { showToast(`Le tag "${name}" existe deja`,'warning'); return; }
  const color=colorEl?.value||TAG_PALETTE[G.tags.length%TAG_PALETTE.length];
  const newTag={id:generateId(),name,color,count:0,company_id:G.currentUser.companyId,created_at:new Date().toISOString()};
  try {
    const {data:ex}=await G.supabase.from('tags').select('id').eq('company_id',G.currentUser.companyId).ilike('name',name).maybeSingle();
    if (ex) { showToast(`Le tag "${name}" existe deja`,'warning'); return; }
    const {error}=await G.supabase.from('tags').insert(newTag); if(error) throw error;
  } catch(err) { showToast('Erreur creation tag: '+err.message,'error'); return; }
  G.tags.push(newTag); if(input) input.value=''; if(colorEl) colorEl.value=TAG_PALETTE[G.tags.length%TAG_PALETTE.length];
  renderTags(); showToast(`Tag "${name}" cree`,'success');
}

async function deleteTag(tagId) {
  const tag=G.tags.find(t=>t.id===tagId); if(!tag) return;
  if (!confirm(`Supprimer le tag "${tag.name}" ?`)) return;
  try { const {error}=await G.supabase.from('tags').delete().eq('id',tagId); if(error) throw error; G.tags=G.tags.filter(t=>t.id!==tagId); renderTags(); showToast(`Tag supprim\xe9`,'success'); }
  catch(err) { showToast('Erreur: '+err.message,'error'); }
}

function startEditTag(tagId) { _tags.editingId=tagId; renderTags(); setTimeout(()=>document.getElementById(`etag_${tagId}`)?.focus(),50); }
function cancelEditTag() { _tags.editingId=null; renderTags(); }
async function confirmEditTag(tagId) {
  const newName=document.getElementById(`etag_${tagId}`)?.value.trim(); const newColor=document.getElementById(`etagc_${tagId}`)?.value;
  const tag=G.tags.find(t=>t.id===tagId); if(!newName||!tag) return;
  try {
    const {error}=await G.supabase.from('tags').update({name:newName,color:newColor||tag.color}).eq('id',tagId); if(error) throw error;
    tag.name=newName; tag.color=newColor||tag.color; _tags.editingId=null; renderTags(); showToast('Tag modifi\xe9','success');
  } catch(err) { showToast('Erreur: '+err.message,'error'); }
}

// 4. CONFIGURATION (SETTINGS)
// ═══════════════════════════════════════════════════════════════════════

async function renderSettings() {
  if (!G.currentUser) return;
  let prefs={};
  if (G.supabase) {
    try { const {data}=await G.supabase.from('profiles').select('*').eq('id',G.currentUser.id).single(); if(data){Object.assign(G.currentUser,{name:data.name,email:data.email});prefs=data.preferences||{};} } catch(_){}
  }
  const sv=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v;};
  const sc=(id,v)=>{const el=document.getElementById(id);if(el)el.checked=v;};
  sv('profileName',G.currentUser.name||''); sv('profileEmail',G.currentUser.email||'');
  sv('profilePhone',G.currentUser.phone||''); sv('profileJobTitle',G.currentUser.job_title||'');
  sv('profileLanguage',prefs.language||'fr'); sv('profileTimezone',prefs.timezone||'Europe/Paris');
  sc('notifEmail',prefs.notif_email!==false); sc('notifBrowser',prefs.notif_browser!==false);
  sc('notifWorkflow',prefs.notif_workflow!==false); sc('notifShares',prefs.notif_shares!==false);
  const planEl=document.getElementById('currentPlanDisplay'); if(planEl) planEl.textContent=(G.currentUser.plan||'free').toUpperCase();
  const avEl=document.getElementById('profileAvatarPreview'); if(avEl) avEl.textContent=(G.currentUser.name||'U').charAt(0).toUpperCase();
}

async function saveProfile() {
  const name=document.getElementById('profileName')?.value.trim();
  const phone=document.getElementById('profilePhone')?.value.trim()||'';
  const jobTitle=document.getElementById('profileJobTitle')?.value.trim()||'';
  if (!name) { showToast('Le nom est requis','warning'); return; }
  const btn=document.querySelector('[onclick="saveProfile()"]');
  if (btn) { btn.disabled=true; btn.innerHTML='<span class="spinner mr-2"></span>Enregistrement\u2026'; }
  try {
    const {error}=await G.supabase.from('profiles').update({name,phone,job_title:jobTitle,updated_at:new Date().toISOString()}).eq('id',G.currentUser.id);
    if (error) throw error;
    G.currentUser.name=name; updateUserDisplay(); showToast('Profil mis \xe0 jour','success');
    await addAuditLog('profile_update','user',G.currentUser.id,`Nom: ${name}`);
  } catch(err) { showToast('Erreur: '+err.message,'error'); }
  finally { if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-save mr-2"></i>Enregistrer';} }
}

async function toggleSetting(setting, value) {
  const val=value!==undefined?value:document.getElementById(setting)?.checked;
  try {
    const {data}=await G.supabase.from('profiles').select('preferences').eq('id',G.currentUser.id).single();
    const prefs=data?.preferences||{}; prefs[setting]=val;
    const {error}=await G.supabase.from('profiles').update({preferences:prefs}).eq('id',G.currentUser.id);
    if (error) throw error;
    showToast('Param\xe8tre mis \xe0 jour','success');
  } catch(err) { showToast('Erreur sauvegarde: '+err.message,'error'); }
}

async function changePassword() {
  const np=document.getElementById('newPassword')?.value; const cp=document.getElementById('confirmPassword')?.value;
  if (!np||!cp) { showToast('Remplissez tous les champs','warning'); return; }
  if (np!==cp) { showToast('Les mots de passe ne correspondent pas','warning'); return; }
  if (np.length<8) { showToast('Minimum 8 caract\xe8res','warning'); return; }
  try {
    const {error}=await G.supabase.auth.updateUser({password:np}); if(error) throw error;
    showToast('Mot de passe modifi\xe9','success');
    await addAuditLog('password_change','user',G.currentUser.id,'Mot de passe chang\xe9');
    ['newPassword','confirmPassword'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  } catch(err) { showToast('Erreur: '+err.message,'error'); }
}

async function updateCompanySettings() {
  const n=document.getElementById('companyNameInput')?.value.trim(); if(!n){showToast('Nom requis','warning');return;}
  try { const {error}=await G.supabase.from('companies').update({name:n}).eq('id',G.currentUser.companyId); if(error) throw error; G.currentUser.companyName=n; updateUserDisplay(); showToast('Entreprise mise \xe0 jour','success'); }
  catch(err) { showToast('Erreur: '+err.message,'error'); }
}

function exportUserData() {
  const d={profile:{name:G.currentUser.name,email:G.currentUser.email,role:G.currentUser.role},documents:G.documents.filter(x=>x.owner_id===G.currentUser.id),activities:G.auditLogs.filter(x=>x.user_id===G.currentUser.id)};
  const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=Object.assign(document.createElement('a'),{href:url,download:`data_${G.currentUser.email}_${Date.now()}.json`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url); showToast('Donn\xe9es export\xe9es','success');
}

function requestAccountDeletion() {
  if (!confirm('\u26a0\ufe0f Voulez-vous demander la suppression de votre compte ?')) return;
  if (prompt('Tapez "SUPPRIMER" pour confirmer:')!=='SUPPRIMER') { showToast('Annul\xe9','info'); return; }
  addAuditLog('account_deletion_request','user',G.currentUser.id,`Demande par ${G.currentUser.email}`).catch(()=>{});
  showToast('Demande enregistr\xe9e — 30 jours (RGPD)','info',7000);
}

function copySqlSchema() { const s=document.getElementById('sqlSchemaBlock')?.textContent; if(s) _copyTxt(s); }
function openDangerModal() { showToast('Fonctionnalit\xe9 en d\xe9veloppement','info'); }
function closeNotifPanel() { const p=document.getElementById('notifPanel'); if(p) p.classList.add('hidden'); }
function toggleNotifications() { const p=document.getElementById('notifPanel'); if(p) p.classList.toggle('hidden'); }
function markAllNotifRead() { showToast('Notifications lues','success'); ['notifBadge','notifCountBadge'].forEach(id=>{document.getElementById(id)?.classList.add('hidden');}); }

// ═══════════════════════════════════════════════════════════════════════
// 5. SECURITE & AUDIT
// ═══════════════════════════════════════════════════════════════════════

async function renderSecurity() {
  if (G.supabase&&G.currentUser) {
    try {
      const [docsRes,keysRes,auditRes]=await Promise.all([
        G.supabase.from('documents').select('id,is_deleted,size').eq('company_id',G.currentUser.companyId),
        G.supabase.from('api_keys').select('id').eq('user_id',G.currentUser.id),
        G.supabase.from('audit_logs').select('id,action,severity,created_at').eq('user_id',G.currentUser.id).order('created_at',{ascending:false}).limit(200),
      ]);
      if(docsRes.data) G.documents=docsRes.data;
      if(keysRes.data) G.apiKeys=keysRes.data;
      if(auditRes.data) G.auditLogs=auditRes.data;
    } catch(e) { console.warn('renderSecurity:',e); }
  }
  const st=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  st('secScanOk',G.documents.filter(d=>!d.is_deleted).length);
  st('secScanBlocked',G.documents.filter(d=>d.is_deleted).length);
  st('secApiKeys',G.apiKeys.length);
  st('secAuditCount',G.auditLogs.length);
  st('secCritEvents',G.auditLogs.filter(l=>l.severity==='critical'||l.severity==='warning').length);
}

function switchSecurityTab(tab) {
  ['audit','trash'].forEach(t=>{
    document.getElementById(`secPanel-${t}`)?.classList.toggle('hidden',t!==tab);
    const btn=document.getElementById(`secTab-${t}`);
    if(btn){btn.classList.toggle('bg-blue-500/20',t===tab);btn.classList.toggle('text-blue-300',t===tab);btn.classList.toggle('border-blue-500/20',t===tab);}
  });
  if (tab==='audit') renderAuditLog(); else loadDeletedDocs();
}

async function renderAuditLog() {
  const container=document.getElementById('auditLogList'); if(!container) return;
  container.innerHTML='<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-blue-400"></i></div>';
  if (G.supabase&&G.currentUser) {
    try {
      const pg=_sec.auditPage||1; const sz=_sec.auditPageSize||30;
      let q=G.supabase.from('audit_logs').select('*').order('created_at',{ascending:false}).range((pg-1)*sz,pg*sz-1);
      const fv=document.getElementById('auditFilter')?.value; if(fv) q=q.eq('action',fv);
      q=q.eq('user_id',G.currentUser.id);
      const {data,error}=await q; if(!error&&data) G.auditLogs=data;
    } catch(e) {}
  }
  let filtered=G.auditLogs; const fv=document.getElementById('auditFilter')?.value; if(fv) filtered=filtered.filter(l=>l.action===fv);
  const sevC={critical:'text-red-400 bg-red-500/10',warning:'text-yellow-400 bg-yellow-500/10',info:'text-blue-400 bg-blue-500/10'};
  if(filtered.length===0){container.innerHTML='<div class="text-center py-6 text-blue-300/40 text-sm">Aucun log d\'audit</div>';return;}
  container.innerHTML=filtered.map(log=>`
    <div class="flex items-start gap-3 p-2.5 rounded-lg hover:bg-blue-500/5 border-b border-blue-500/5 transition-colors">
      <span class="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase mt-0.5 ${sevC[log.severity]||sevC.info}">${log.severity||'info'}</span>
      <div class="flex-1 min-w-0">
        <p class="text-white text-xs font-medium">${escapeHtml(log.action||'\u2014')}${log.target_type?`<span class="text-blue-300/50 ml-1">\xb7 ${log.target_type}</span>`:''}</p>
        ${log.details?`<p class="text-xs text-blue-300/50 truncate mt-0.5">${escapeHtml(log.details)}</p>`:''}
      </div>
      <span class="flex-shrink-0 text-xs text-blue-300/40 whitespace-nowrap">${formatDate(log.created_at)}</span>
    </div>`).join('');
  const st=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  const total=filtered.length; const pg=_sec.auditPage||1; const sz=_sec.auditPageSize||30; const pages=Math.max(1,Math.ceil(total/sz));
  st('auditPageInfo',`Page ${pg}/${pages} (${total})`);
  const prev=document.getElementById('auditPrevBtn'); if(prev) prev.disabled=pg<=1;
  const next=document.getElementById('auditNextBtn'); if(next) next.disabled=pg>=pages;
}

function auditPrevPage() { if((_sec.auditPage||1)>1){_sec.auditPage--;renderAuditLog();} }
function auditNextPage() { _sec.auditPage=(_sec.auditPage||1)+1; renderAuditLog(); }

async function loadDeletedDocs() {
  const container=document.getElementById('trashList'); if(!container) return;
  if (G.supabase&&G.currentUser?.companyId) {
    try {
      const {data}=await G.supabase.from('documents').select('*').eq('company_id',G.currentUser.companyId).eq('is_deleted',true).order('deleted_at',{ascending:false});
      if (data) { G.documents=G.documents.filter(d=>!d.is_deleted).concat(data); const seen=new Set(); G.documents=G.documents.filter(d=>{if(seen.has(d.id))return false;seen.add(d.id);return true;}); }
    } catch(e) {}
  }
  const deleted=G.documents.filter(d=>d.is_deleted);
  if(deleted.length===0){container.innerHTML='<div class="text-center py-8 text-blue-300/40 text-sm"><i class="fas fa-trash text-2xl mb-2 block opacity-20"></i>Corbeille vide</div>';return;}
  container.innerHTML=deleted.map(doc=>`
    <div class="flex items-center justify-between p-3 rounded-xl glass-card border border-red-500/20 hover:border-red-400/30 transition-all">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center"><i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-red-400/70 text-sm"></i></div>
        <div><p class="text-white/80 text-sm font-medium">${escapeHtml(doc.name)}</p><p class="text-xs text-blue-300/50">${formatBytes(doc.size)} \xb7 ${formatDate(doc.deleted_at)}</p></div>
      </div>
      <div class="flex gap-2">
        <button onclick="restoreDocument('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30 flex items-center gap-1 transition-all"><i class="fas fa-undo"></i>Restaurer</button>
        <button onclick="permanentDeleteDocument('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30 flex items-center gap-1 transition-all"><i class="fas fa-trash"></i>D\xe9finitif</button>
      </div>
    </div>`).join('');
}

async function restoreDocument(docId) {
  try {
    const {error}=await G.supabase.from('documents').update({is_deleted:false,deleted_at:null}).eq('id',docId); if(error) throw error;
    const doc=G.documents.find(d=>d.id===docId); if(doc){doc.is_deleted=false;doc.deleted_at=null;}
    showToast('Document restaur\xe9','success'); renderDocuments(); updateBadges(); loadDeletedDocs();
    await addAuditLog('restore','document',docId);
  } catch(err) { showToast('Erreur: '+err.message,'error'); }
}

async function permanentDeleteDocument(docId) {
  const doc=G.documents.find(d=>d.id===docId);
  if (!confirm(`Supprimer d\xe9finitivement "${doc?.name||docId}" ? Irr\xe9versible.`)) return;
  try {
    if (doc?.storage_path) await G.supabase.storage.from(CONFIG.storageBucket).remove([doc.storage_path]).catch(()=>{});
    const {error}=await G.supabase.from('documents').delete().eq('id',docId); if(error) throw error;
    G.documents=G.documents.filter(d=>d.id!==docId); showToast('Document supprim\xe9 d\xe9finitivement','success'); loadDeletedDocs(); updateBadges();
  } catch(err) { showToast('Erreur: '+err.message,'error'); }
}

async function scanAllDocuments() {
  const btn=document.querySelector('[onclick="scanAllDocuments()"]');
  if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner mr-2"></span>Scan\u2026';}
  const issues=[]; const badExt=['exe','bat','cmd','sh','ps1','vbs','jar','msi','dll','scr'];
  G.documents.filter(d=>!d.is_deleted).forEach(doc=>{
    const ext=(doc.name||'').split('.').pop().toLowerCase();
    if(badExt.includes(ext)) issues.push({doc,reason:`Extension suspecte (.${ext})`});
    if(doc.size>50*1024*1024) issues.push({doc,reason:`Taille anormale (${formatBytes(doc.size)})`});
    if(!doc.type||doc.type==='unknown') issues.push({doc,reason:'Type MIME non reconnu'});
  });
  if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-shield-virus mr-2"></i>Scanner';}
  if(issues.length===0) showToast(`Scan termin\xe9 \u2014 ${G.documents.filter(d=>!d.is_deleted).length} doc(s), aucun probl\xe8me`,'success',5000);
  else { showToast(`\u26a0\ufe0f ${issues.length} probl\xe8me(s) d\xe9tect\xe9(s)`,'warning',6000); issues.forEach(i=>addAuditLog('security_scan_warning','document',i.doc.id,i.reason).catch(()=>{})); }
  await addAuditLog('security_scan','system','all',`${G.documents.filter(d=>!d.is_deleted).length} docs scann\xe9s, ${issues.length} alertes`);
}

function exportAuditLog() {
  const blob=new Blob([JSON.stringify(G.auditLogs,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=Object.assign(document.createElement('a'),{href:url,download:`audit_${Date.now()}.json`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url); showToast('Audit export\xe9','success');
}

function exportAllData() {
  const blob=new Blob([JSON.stringify({documents:G.documents,workflows:G.workflows,users:G.users,tags:G.tags,shares:G.shares},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=Object.assign(document.createElement('a'),{href:url,download:`export_ged_${Date.now()}.json`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url); showToast('Export effectu\xe9','success');
}

function exportDocumentsCsv() {
  const docs=G.documents.filter(d=>!d.is_deleted);
  const cell=v=>{const s=String(v??'');return(s.includes(',')||s.includes('"')||s.includes('\n'))?'"'+s.replace(/"/g,'""')+'"':s;};
  const csv='\uFEFF'+[['ID','Nom','Type','Taille','Cr\xe9e le','Port\xe9e','Tags'],...docs.map(d=>[d.id,d.name,d.type,d.size,d.created_at,d.scope||'',(d.tags||[]).join(';')].map(cell))].map(r=>r.join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement('a'),{href:url,download:`documents_${new Date().toISOString().slice(0,10)}.csv`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url); showToast('Export CSV effectu\xe9','success');
}

// ═══════════════════════════════════════════════════════════════════════
// 6. API KEYS
// ═══════════════════════════════════════════════════════════════════════

async function renderApiKeys() {
  const container=document.getElementById('apiKeysList2'); if(!container) return;
  if (G.supabase&&G.currentUser) {
    try { const {data}=await G.supabase.from('api_keys').select('*').eq('user_id',G.currentUser.id).order('created_at',{ascending:false}); if(data) G.apiKeys=data; } catch(e) {}
  }
  if(G.apiKeys.length===0){container.innerHTML='<div class="text-center py-8 text-blue-300/50"><i class="fas fa-key text-3xl mb-2 block opacity-20"></i><p class="text-sm">Aucune cl\xe9 API</p></div>';return;}
  container.innerHTML=G.apiKeys.map(k=>{
    const expired=k.expires_at&&new Date(k.expires_at)<new Date();
    const expLabel=k.expires_at?(expired?'\u23f0 Expir\xe9e':`Expire le ${formatDate(k.expires_at)}`):'Illimit\xe9e';
    return `<div class="glass-card rounded-xl p-4 border ${expired?'border-red-500/20':'border-green-500/20'} hover:border-${expired?'red':'green'}-400/40 transition-all">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-lg ${expired?'bg-red-500/15':'bg-green-500/15'} flex items-center justify-center flex-shrink-0"><i class="fas fa-key ${expired?'text-red-400':'text-green-400'}"></i></div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap"><p class="text-white font-semibold text-sm">${escapeHtml(k.name||'Cl\xe9')}</p>${expired?'<span class="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">Expir\xe9e</span>':'<span class="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">Active</span>'}</div>
          <code class="text-green-400/70 text-xs font-mono block mt-1">${(k.key||'').substring(0,24)}\u2026</code>
          <div class="flex gap-3 mt-1 text-xs text-blue-300/50 flex-wrap"><span>${formatDate(k.created_at)}</span><span>${expLabel}</span>${k.permissions?`<span>${Array.isArray(k.permissions)?k.permissions.join(', '):k.permissions}</span>`:''}</div>
        </div>
        <div class="flex gap-1 flex-shrink-0">
          <button onclick="copyApiKey('${escapeHtml(k.key)}')" class="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-all" title="Copier"><i class="fas fa-copy text-sm"></i></button>
          <button onclick="revokeApiKey('${k.id}')" class="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30 transition-all flex items-center gap-1"><i class="fas fa-ban"></i>R\xe9voquer</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function generateApiKey() {
  let modal=document.getElementById('createApiKeyModal');
  if (!modal){modal=document.createElement('div');modal.id='createApiKeyModal';modal.className='modal-overlay';document.body.appendChild(modal);}
  modal.innerHTML=`<div class="modal-box" style="max-width:480px;">
    <div class="flex items-center justify-between mb-5"><h3 class="text-white font-bold flex items-center gap-2"><i class="fas fa-key text-green-400"></i>Nouvelle cl\xe9 API</h3><button onclick="document.getElementById('createApiKeyModal').classList.add('hidden')" class="text-blue-400 hover:text-white p-2 rounded-lg"><i class="fas fa-times text-xl"></i></button></div>
    <div class="space-y-4">
      <div><label class="text-blue-200/70 text-xs font-medium block mb-1">Nom <span class="text-red-400">*</span></label><input id="apiKeyName" type="text" placeholder="Ex: App mobile, CI/CD\u2026" class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);"></div>
      <div><label class="text-blue-200/70 text-xs font-medium block mb-2">Permissions</label><div class="flex flex-wrap gap-2">${['read','write','delete','admin'].map(p=>`<label class="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border border-blue-500/20 hover:border-blue-400/40 text-sm"><input type="checkbox" class="api-perm-check" value="${p}" ${p==='read'?'checked':''}><span class="text-blue-300 capitalize">${p}</span></label>`).join('')}</div></div>
      <div><label class="text-blue-200/70 text-xs font-medium block mb-1">Expiration</label><select id="apiKeyExpiry" class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);"><option value="">Illimit\xe9e</option><option value="30">30 jours</option><option value="90">90 jours</option><option value="365">1 an</option></select></div>
    </div>
    <div class="flex gap-3 mt-5 pt-4 border-t border-blue-500/20">
      <button onclick="document.getElementById('createApiKeyModal').classList.add('hidden')" class="flex-1 py-2.5 rounded-xl text-blue-300 text-sm border border-blue-500/25 hover:bg-blue-500/10">Annuler</button>
      <button onclick="_confirmGenerateApiKey()" class="flex-1 btn-primary py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2"><i class="fas fa-plus"></i>G\xe9n\xe9rer</button>
    </div>
  </div>`;
  modal.classList.remove('hidden');
}

async function _confirmGenerateApiKey() {
  const name=document.getElementById('apiKeyName')?.value.trim(); if(!name){showToast('Nommez la cl\xe9','warning');return;}
  const perms=Array.from(document.querySelectorAll('.api-perm-check:checked')).map(c=>c.value);
  const expDays=parseInt(document.getElementById('apiKeyExpiry')?.value||'0');
  const key=`ged_${generateId()}_${generateId().substring(0,16)}`;
  const newKey={id:generateId(),name,key,permissions:perms,expires_at:expDays>0?new Date(Date.now()+expDays*86400000).toISOString():null,user_id:G.currentUser.id,company_id:G.currentUser.companyId,created_at:new Date().toISOString()};
  try { const {error}=await G.supabase.from('api_keys').insert(newKey); if(error) throw error; } catch(err) { console.warn('api_keys insert non-bloquant:',err); }
  G.apiKeys.unshift(newKey); document.getElementById('createApiKeyModal')?.classList.add('hidden');
  _showGeneratedKey(key,name); renderApiKeys();
  await addAuditLog('api_key_create','api_key',newKey.id,`${name} perms:${perms.join(',')}`);
}

function _showGeneratedKey(key,name) {
  let modal=document.getElementById('generatedKeyModal');
  if(!modal){modal=document.createElement('div');modal.id='generatedKeyModal';modal.className='modal-overlay';document.body.appendChild(modal);}
  modal.innerHTML=`<div class="modal-box" style="max-width:500px;">
    <div class="flex items-center gap-3 mb-5"><div class="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-green-400 border border-green-500/30"><i class="fas fa-check"></i></div><div><h3 class="text-white font-bold">Cl\xe9 API g\xe9n\xe9r\xe9e !</h3><p class="text-blue-300/50 text-xs">${escapeHtml(name)}</p></div></div>
    <div class="glass-card rounded-xl p-4 border border-yellow-500/25 mb-4" style="background:rgba(245,158,11,0.06)">
      <p class="text-yellow-400 text-xs font-bold mb-2">\u26a0\ufe0f Copiez cette cl\xe9 maintenant</p>
      <div class="flex gap-2"><code class="flex-1 bg-slate-900/70 border border-yellow-500/30 rounded-lg px-3 py-2 text-yellow-300 font-mono text-xs break-all">${escapeHtml(key)}</code>
      <button onclick="_copyTxt('${escapeHtml(key)}')" class="px-3 py-2 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 text-sm"><i class="fas fa-copy"></i></button></div>
    </div>
    <button onclick="document.getElementById('generatedKeyModal').classList.add('hidden')" class="w-full btn-primary py-2.5 rounded-xl text-white text-sm font-semibold">J\'ai copi\xe9 la cl\xe9</button>
  </div>`;
  modal.classList.remove('hidden');
}

function generateApiKeyV6() { generateApiKey(); }

async function revokeApiKey(id) {
  if (!confirm('R\xe9voquer cette cl\xe9 API ?')) return;
  try { const {error}=await G.supabase.from('api_keys').delete().eq('id',id); if(error) throw error; G.apiKeys=G.apiKeys.filter(k=>k.id!==id); renderApiKeys(); showToast('Cl\xe9 r\xe9voqu\xe9e','success'); }
  catch(err) { showToast('Erreur: '+err.message,'error'); }
}

function copyApiKey(key) { if(key) _copyTxt(key); }

function _copyTxt(text) {
  if(navigator.clipboard) navigator.clipboard.writeText(text).then(()=>showToast('Copi\xe9','success')).catch(()=>_fallbackCopy(text));
  else _fallbackCopy(text);
}
function _fallbackCopy(text) {
  const ta=document.createElement('textarea'); ta.value=text; ta.style.cssText='position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
  try{document.execCommand('copy');showToast('Copi\xe9','success');}catch(_){showToast('Impossible de copier','error');}
  document.body.removeChild(ta);
}

// ═══════════════════════════════════════════════════════════════════════
// 7. INTEGRATIONS
// ═══════════════════════════════════════════════════════════════════════

async function renderIntegrations() {
  const container=document.getElementById('integrationsGrid'); if(!container) return;
  if (G.supabase&&G.currentUser?.companyId) {
    try { const {data}=await G.supabase.from('integrations').select('*').eq('company_id',G.currentUser.companyId); if(data) data.forEach(i=>{_integrations[i.provider]=i.connected;}); } catch(_) {}
  }
  const integrations=[
    {id:'slack',name:'Slack',icon:'fab fa-slack',color:'purple',desc:'Notifications temps r\xe9el'},
    {id:'gdrive',name:'Google Drive',icon:'fab fa-google-drive',color:'green',desc:'Import/Export documents'},
    {id:'dropbox',name:'Dropbox',icon:'fab fa-dropbox',color:'blue',desc:'Synchronisation cloud'},
    {id:'ms365',name:'Microsoft 365',icon:'fab fa-microsoft',color:'sky',desc:'\xc9diter avec Office'},
    {id:'zapier',name:'Zapier',icon:'fas fa-bolt',color:'yellow',desc:'Automatisations no-code'},
    {id:'make',name:'Make',icon:'fas fa-cogs',color:'orange',desc:'Workflows avanc\xe9s'},
    {id:'github',name:'GitHub',icon:'fab fa-github',color:'gray',desc:'Stockage & versioning'},
    {id:'notion',name:'Notion',icon:'fas fa-book-open',color:'indigo',desc:'Wiki & connaissances'},
  ];
  container.innerHTML=integrations.map(i=>{
    const connected=_integrations[i.id]||false;
    return `<div class="glass-card rounded-xl p-4 border border-${i.color}-500/20 hover:border-${i.color}-400/40 transition-all">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-lg bg-${i.color}-500/15 flex items-center justify-center text-${i.color}-400"><i class="${i.icon} text-lg"></i></div>
        <div class="flex-1"><div class="flex items-center gap-2"><p class="text-white font-semibold text-sm">${i.name}</p>${connected?'<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">\u25cf Connect\xe9</span>':''}</div><p class="text-xs text-blue-300/50">${i.desc}</p></div>
      </div>
      <div class="flex gap-2">
        ${connected
          ?`<button onclick="disconnectIntegration('${i.id}')" class="flex-1 py-2 rounded-lg bg-red-500/15 text-red-400 text-xs hover:bg-red-500/25 transition-all flex items-center justify-center gap-1"><i class="fas fa-unlink"></i>D\xe9connecter</button>`
          :`<button onclick="connectIntegration('${i.id}')" class="flex-1 py-2 rounded-lg bg-${i.color}-500/15 text-${i.color}-400 text-xs hover:bg-${i.color}-500/25 transition-all flex items-center justify-center gap-1"><i class="fas fa-plug"></i>Connecter</button>`
        }
        <button onclick="showIntegrationInfo('${i.id}')" class="px-3 py-2 rounded-lg border border-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/10 transition-all" title="Info"><i class="fas fa-info-circle"></i></button>
      </div>
    </div>`;
  }).join('');
  listWebhooks();
}

async function connectIntegration(provider) {
  showToast(`Connexion ${provider}\u2026`,'info');
  setTimeout(async()=>{
    _integrations[provider]=true;
    if(G.supabase&&G.currentUser?.companyId) await G.supabase.from('integrations').upsert({provider,connected:true,company_id:G.currentUser.companyId,connected_at:new Date().toISOString()},{onConflict:'provider,company_id'}).catch(()=>{});
    showToast(`${provider} connect\xe9`,'success'); renderIntegrations();
    await addAuditLog('integration_connect','integration',provider,`Connect\xe9: ${provider}`);
  },1500);
}

async function disconnectIntegration(provider) {
  if(!confirm(`D\xe9connecter ${provider} ?`)) return;
  _integrations[provider]=false;
  if(G.supabase&&G.currentUser?.companyId) await G.supabase.from('integrations').upsert({provider,connected:false,company_id:G.currentUser.companyId},{onConflict:'provider,company_id'}).catch(()=>{});
  showToast(`${provider} d\xe9connect\xe9`,'info'); renderIntegrations();
}

function showIntegrationInfo(provider) {
  const docs={slack:'https://api.slack.com',gdrive:'https://developers.google.com/drive',dropbox:'https://www.dropbox.com/developers'};
  if(docs[provider]) window.open(docs[provider],'_blank'); else showToast('Documentation \xe0 venir','info');
}

async function addWebhook() {
  const url=document.getElementById('webhookUrl')?.value.trim(); const event=document.getElementById('webhookEvent')?.value;
  if(!url){showToast('URL requise','warning');return;} if(!/^https?:\/\/.+/.test(url)){showToast('URL invalide','warning');return;}
  const webhook={id:generateId(),url,event,active:true,company_id:G.currentUser.companyId,created_at:new Date().toISOString()};
  try { await G.supabase.from('webhooks').insert(webhook).catch(()=>{}); } catch(_) {}
  _webhooks.push(webhook); document.getElementById('webhookUrl').value='';
  showToast(`Webhook "${event}" ajout\xe9`,'success'); listWebhooks();
}

async function listWebhooks() {
  const container=document.getElementById('webhooksList'); if(!container) return;
  if(G.supabase&&G.currentUser?.companyId){
    try{const{data}=await G.supabase.from('webhooks').select('*').eq('company_id',G.currentUser.companyId).order('created_at',{ascending:false});if(data&&data.length>0)_webhooks.splice(0,_webhooks.length,...data);}catch(_){}
  }
  if(_webhooks.length===0){container.innerHTML='<div class="text-center py-6 text-blue-300/40 text-sm"><i class="fas fa-link text-2xl mb-2 block opacity-20"></i>Aucun webhook</div>';return;}
  container.innerHTML=_webhooks.map(w=>`
    <div class="flex items-center justify-between p-3 rounded-xl glass-card border border-blue-500/15 hover:border-blue-400/30 transition-all">
      <div class="flex items-center gap-3"><div class="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center"><i class="fas fa-link text-blue-400 text-sm"></i></div>
      <div><p class="text-white text-sm font-medium">${escapeHtml(w.event||'Tous')}</p><p class="text-blue-300/50 text-xs truncate max-w-[250px]">${escapeHtml(w.url)}</p></div></div>
      <div class="flex gap-2">
        <button onclick="testWebhook('${w.id}')" class="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 transition-all flex items-center gap-1"><i class="fas fa-play"></i>Tester</button>
        <button onclick="removeWebhook('${w.id}')" class="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-all"><i class="fas fa-trash text-sm"></i></button>
      </div>
    </div>`).join('');
}

async function testWebhook(webhookId) {
  const wh=_webhooks.find(w=>w.id===webhookId); if(!wh) return;
  showToast(`Test envoy\xe9 vers ${wh.url}`,'info');
  try { await fetch(wh.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'test',source:'SystemesGED',timestamp:new Date().toISOString()}),mode:'no-cors'}); showToast('Test envoy\xe9','success'); }
  catch(err) { showToast('Erreur: '+err.message,'error'); }
}

async function removeWebhook(webhookId) {
  if(!confirm('Supprimer ce webhook ?')) return;
  await G.supabase.from('webhooks').delete().eq('id',webhookId).catch(()=>{});
  const idx=_webhooks.findIndex(w=>w.id===webhookId); if(idx>-1) _webhooks.splice(idx,1);
  listWebhooks(); showToast('Webhook supprim\xe9','success');
}

// ═══════════════════════════════════════════════════════════════════════
// 8. AUDIT SECURITE (auditv6)
// ═══════════════════════════════════════════════════════════════════════

async function renderAuditV6() {
  const statsContainer=document.getElementById('auditStatsGrid');
  const timelineContainer=document.getElementById('auditTimelineList');
  const alertsContainer=document.getElementById('securityAlertsList');
  if(timelineContainer) timelineContainer.innerHTML='<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-blue-400"></i></div>';

  if (G.supabase&&G.currentUser) {
    try {
      const offset=(_audit.page-1)*_audit.pageSize;
      const daysAgo=new Date(Date.now()-(_audit.filter.days||30)*86400000).toISOString();
      let q=G.supabase.from('audit_logs').select('*',{count:'exact'}).gte('created_at',daysAgo).order('created_at',{ascending:false}).range(offset,offset+_audit.pageSize-1);
      if(_audit.filter.action) q=q.eq('action',_audit.filter.action);
      if(_audit.filter.severity) q=q.eq('severity',_audit.filter.severity);
      if(!G.currentUser.isSystemAdmin&&G.currentUser.role!=='admin') q=q.eq('user_id',G.currentUser.id);
      const {data,error,count}=await q; if(!error&&data){G.auditLogs=data;_audit.totalCount=count||0;}
    } catch(e) { console.warn('renderAuditV6:',e); }
  }

  if (statsContainer) {
    const c={total:_audit.totalCount||G.auditLogs.length,logins:G.auditLogs.filter(l=>l.action==='login').length,uploads:G.auditLogs.filter(l=>l.action==='upload').length,deletes:G.auditLogs.filter(l=>l.action==='delete').length,shares:G.auditLogs.filter(l=>(l.action||'').includes('share')).length,alertes:G.auditLogs.filter(l=>l.severity==='warning'||l.severity==='critical').length};
    statsContainer.innerHTML=Object.entries(c).map(([k,v])=>`<div class="glass-card rounded-xl p-3 text-center border border-blue-500/15 cursor-pointer hover:border-blue-400/30 transition-all" onclick="setAuditFilter('action','${k==='total'?'':k==='logins'?'login':k==='uploads'?'upload':k==='deletes'?'delete':k==='shares'?'share':''}')"><p class="text-2xl font-bold ${k==='alertes'?'text-orange-400':'text-white'}">${v}</p><p class="text-xs text-blue-300/50 capitalize">${k}</p></div>`).join('');
  }

  if (timelineContainer) {
    const sevC={critical:'text-red-400',warning:'text-yellow-400',info:'text-blue-400'};
    if(G.auditLogs.length===0){timelineContainer.innerHTML='<div class="text-center py-8 text-blue-300/40">Aucun \xe9v\xe9nement</div>';}
    else timelineContainer.innerHTML=G.auditLogs.map(l=>`<div class="flex items-start gap-3 p-2.5 border-b border-blue-500/8 hover:bg-blue-500/4 transition-colors"><span class="flex-shrink-0 w-16 text-[10px] font-bold uppercase ${sevC[l.severity]||sevC.info} mt-0.5">${l.severity||'info'}</span><div class="flex-1 min-w-0"><p class="text-white text-xs font-medium">${escapeHtml(l.action||'\u2014')}</p>${l.details?`<p class="text-xs text-blue-300/50 truncate mt-0.5">${escapeHtml(l.details)}</p>`:''}</div><span class="flex-shrink-0 text-xs text-blue-300/40 whitespace-nowrap">${formatDate(l.created_at)}</span></div>`).join('');
    const total=_audit.totalCount||G.auditLogs.length; const pages=Math.max(1,Math.ceil(total/_audit.pageSize));
    const st=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    st('auditV6PageInfo',`Page ${_audit.page}/${pages} (${total})`);
    const prev=document.getElementById('auditV6Prev'); if(prev) prev.disabled=_audit.page<=1;
    const next=document.getElementById('auditV6Next'); if(next) next.disabled=_audit.page>=pages;
  }

  if (alertsContainer) {
    const criticals=G.auditLogs.filter(l=>l.severity==='critical'||l.severity==='warning').slice(0,8);
    if(criticals.length===0){alertsContainer.innerHTML='<div class="text-center py-6 text-blue-300/40 text-sm"><i class="fas fa-shield-alt text-2xl mb-2 block opacity-30"></i>Aucune alerte</div>';}
    else alertsContainer.innerHTML=criticals.map(l=>`<div class="p-2.5 rounded-xl glass-card border ${l.severity==='critical'?'border-red-500/25':'border-yellow-500/20'}"><div class="flex items-center gap-2 mb-1"><i class="fas fa-exclamation-triangle ${l.severity==='critical'?'text-red-400':'text-yellow-400'} text-sm"></i><p class="text-white text-xs font-semibold uppercase">${escapeHtml(l.action||'\u2014')}</p></div>${l.details?`<p class="text-xs text-blue-300/60 truncate">${escapeHtml(l.details)}</p>`:''}<p class="text-[10px] text-blue-300/40 mt-1">${formatDate(l.created_at)}</p></div>`).join('');
  }
}

function setAuditFilter(type,value) {
  if(!_audit.filter) _audit.filter={action:'',severity:'',days:30};
  if(type==='days') _audit.filter.days=parseInt(value)||30;
  if(type==='action') _audit.filter.action=value||'';
  if(type==='severity') _audit.filter.severity=value||'';
  _audit.page=1; renderAuditV6();
}

function filterAuditLogs(query) {
  const container=document.getElementById('auditTimelineList'); if(!container) return;
  if(!query){renderAuditV6();return;}
  const q=query.toLowerCase(); const sevC={critical:'text-red-400',warning:'text-yellow-400',info:'text-blue-400'};
  const filtered=G.auditLogs.filter(l=>(l.action||'').toLowerCase().includes(q)||(l.target_type||'').toLowerCase().includes(q)||(l.details||'').toLowerCase().includes(q));
  container.innerHTML=filtered.length===0?`<div class="text-center py-8 text-blue-300/40">Aucun r\xe9sultat pour "${escapeHtml(query)}"</div>`:filtered.map(l=>`<div class="flex items-start gap-3 p-2.5 border-b border-blue-500/8"><span class="flex-shrink-0 w-16 text-[10px] font-bold uppercase ${sevC[l.severity]||sevC.info} mt-0.5">${l.severity||'info'}</span><div class="flex-1 min-w-0"><p class="text-white text-xs font-medium">${escapeHtml(l.action||'\u2014')}</p>${l.details?`<p class="text-xs text-blue-300/50 truncate">${escapeHtml(l.details)}</p>`:''}</div><span class="flex-shrink-0 text-xs text-blue-300/40 whitespace-nowrap">${formatDate(l.created_at)}</span></div>`).join('');
}

function clearAuditFilters() {
  _audit.filter={action:'',severity:'',days:30}; _audit.page=1;
  const el=document.getElementById('auditSearchInput'); if(el) el.value='';
  renderAuditV6();
}

function prevAuditPage() { if(_audit.page>1){_audit.page--;renderAuditV6();} }
function nextAuditPage() { _audit.page++; renderAuditV6(); }

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════
Object.assign(window, {
  renderUsers, searchUsers, filterUsersByRole, filterUsersByStatus, changeUserStatus,
  validateUser, deleteUser, addUser, openCreateUserModal, closeAddUserModal,
  resetUserPassword, openResetModal, closeResetModal, sendResetEmail, updatePendingUsersCount,
  renderPendingUsers, refreshPendingUsers, approveAllPending, rejectAllPending,
  renderTags, createTag, deleteTag, filterByTag, clearTagFilter, startEditTag, confirmEditTag, cancelEditTag,
  renderSettings, saveProfile, toggleSetting, changePassword, updateCompanySettings,
  exportUserData, requestAccountDeletion, copySqlSchema, openDangerModal,
  closeNotifPanel, toggleNotifications, markAllNotifRead,
  renderSecurity, switchSecurityTab, renderAuditLog, loadDeletedDocs,
  restoreDocument, permanentDeleteDocument, scanAllDocuments,
  exportAuditLog, exportAllData, exportDocumentsCsv, auditPrevPage, auditNextPage,
  renderApiKeys, generateApiKey, generateApiKeyV6, revokeApiKey, copyApiKey, _confirmGenerateApiKey,
  renderIntegrations, connectIntegration, disconnectIntegration, showIntegrationInfo,
  addWebhook, listWebhooks, testWebhook, removeWebhook,
  renderAuditV6, setAuditFilter, filterAuditLogs, clearAuditFilters, prevAuditPage, nextAuditPage,
});

// ─── Fonctions restaurées ───
// ═══════════════════════════════════════════════════════════════════════
// SystemesGED v7.4 — MODULE FINAL : Analytics · Folders · Signatures ·
//                    AI · Automation · Backups · Billing · Workflows+
// -----------------------------------------------------------------------
// FIX-AN1  · renderAnalytics async + rechargement Supabase réel
// FIX-AN2  · refreshAnalytics async + graphe activité
// FIX-AN3  · AJOUT renderTopDocs(), exportAnalytics()
// FIX-FO1  · renderFolders async + rechargement Supabase
// FIX-FO2  · renderFolderContents async + Supabase
// FIX-FO3  · renderFolderTree async + exportées
// FIX-FO4  · openFolder amélioration + breadcrumb
// FIX-SI1  · renderSignatures async + rechargement Supabase
// FIX-SI2  · openSignModal rechargement doc courant
// FIX-AI1  · renderAI async + rechargement Supabase
// FIX-AI2  · analyzeDocument vraie analyse (nom, type, taille, tags)
// FIX-AI3  · askAI recherche réelle dans G.documents
// FIX-AU1  · renderAutomation async + rechargement Supabase
// FIX-AU2  · openWfRuleModal modal complet
// FIX-AU3  · quickCreateRule persist Supabase
// FIX-BK1  · renderBackups async + rechargement Supabase
// FIX-BK2  · restoreBackup vraie implémentation (soft-restore)
// FIX-BK3  · saveBackupSettings persist Supabase preferences
// FIX-BL1  · renderBilling async + fetch plan Supabase
// FIX-BL2  · simulateUpgrade amélioration
// FIX-WF1  · openWfDetail rechargement Supabase complet
// ═══════════════════════════════════════════════════════════════════════

/* ── État partagé ─────────────────────────────────────────────── */
window._analytics = { period: 30 };
window._folders   = {};  // cache

// ═══════════════════════════════════════════════════════════════════════
// 1. ANALYTICS
// ═══════════════════════════════════════════════════════════════════════

async function renderAnalytics() {
  const kpiContainer = document.getElementById('analyticsKpiCards');
  const topContainer = document.getElementById('analyticsTopDocs');

  if (kpiContainer) kpiContainer.innerHTML = '<div class="col-span-full text-center py-4"><i class="fas fa-spinner fa-spin text-blue-400"></i></div>';

  // Rechargement Supabase
  if (G.supabase && G.currentUser?.companyId) {
    try {
      const [docsRes, wfRes, usersRes] = await Promise.all([
        G.supabase.from('documents').select('*').eq('company_id', G.currentUser.companyId).eq('is_deleted', false),
        G.supabase.from('workflows').select('*').eq('company_id', G.currentUser.companyId),
        G.supabase.from('profiles').select('id,status').eq('company_id', G.currentUser.companyId),
      ]);
      if (docsRes.data)  G.documents  = docsRes.data;
      if (wfRes.data)    G.workflows  = wfRes.data;
      if (usersRes.data) G.users      = usersRes.data;
    } catch (e) { console.warn('renderAnalytics reload:', e); }
  }

  const docs      = G.documents.filter(d => !d.is_deleted);
  const wfs       = G.workflows || [];
  const users     = G.users || [];
  const totalSize = docs.reduce((s, d) => s + (d.size || 0), 0);
  const activeWfs = wfs.filter(w => w.status === 'in_progress' || w.status === 'pending').length;
  const sharedDocs= docs.filter(d => d.scope === 'company').length;

  if (kpiContainer) {
    kpiContainer.innerHTML = [
      { label: 'Documents',     value: docs.length,           icon: 'fa-file-alt',      color: 'blue' },
      { label: 'Stockage total', value: formatBytes(totalSize), icon: 'fa-database',     color: 'green' },
      { label: 'Workflows actifs',value: activeWfs,            icon: 'fa-project-diagram',color: 'purple' },
      { label: 'Utilisateurs',  value: users.filter(u => u.status === 'active').length,  icon: 'fa-users', color: 'orange' },
      { label: 'Partagés',      value: sharedDocs,            icon: 'fa-share-alt',      color: 'cyan' },
      { label: 'Supprimés',     value: G.documents.filter(d => d.is_deleted).length, icon: 'fa-trash', color: 'red' },
    ].map(k => `
      <div class="glass-card rounded-xl p-4 border border-${k.color}-500/20 hover:border-${k.color}-400/40 transition-all">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-9 h-9 rounded-lg bg-${k.color}-500/15 flex items-center justify-center text-${k.color}-400">
            <i class="fas ${k.icon}"></i>
          </div>
          <p class="text-blue-300/60 text-xs font-medium">${k.label}</p>
        </div>
        <p class="text-2xl font-bold text-white">${k.value}</p>
      </div>`).join('');
  }

  renderTopDocs();
  renderActivityChart();
}

function renderTopDocs() {
  const container = document.getElementById('analyticsTopDocs');
  if (!container) return;
  const docs = G.documents.filter(d => !d.is_deleted).sort((a, b) => (b.views||0) - (a.views||0)).slice(0, 8);
  if (docs.length === 0) { container.innerHTML = '<div class="text-center py-6 text-blue-300/40 text-sm">Aucun document</div>'; return; }
  container.innerHTML = docs.map((doc, i) => `
    <div class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-blue-500/5 transition-colors cursor-pointer" onclick="openPreviewModal('${doc.id}')">
      <span class="text-blue-400/40 text-xs font-bold w-5 text-center">${i+1}</span>
      <div class="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
        <i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-blue-400 text-sm"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-white text-sm font-medium truncate">${escapeHtml(doc.name)}</p>
        <p class="text-xs text-blue-300/50">${formatBytes(doc.size)} · ${formatDate(doc.created_at)}</p>
      </div>
      <div class="text-right flex-shrink-0">
        <p class="text-blue-300/60 text-xs">${doc.views||0} vues</p>
        <p class="text-blue-300/40 text-[10px]">${doc.downloads||0} dl</p>
      </div>
    </div>`).join('');
}

function renderActivityChart() {
  const container = document.getElementById('analyticsActivityChart');
  if (!container) return;
  // Barres d'activité sur les 14 derniers jours
  const days = 14;
  const data = [];
  for (let i = days-1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toDateString();
    const count = G.documents.filter(doc => new Date(doc.created_at).toDateString() === ds).length;
    data.push({ label: d.toLocaleDateString('fr-FR', { weekday: 'short' }), count });
  }
  const maxVal = Math.max(...data.map(d => d.count), 1);
  container.innerHTML = `
    <div class="flex items-end gap-1 h-20">
      ${data.map(d => `
        <div class="flex-1 flex flex-col items-center gap-1">
          <div class="w-full rounded-t" style="height:${Math.max(2, (d.count/maxVal)*64)}px;background:rgba(59,130,246,${0.2+0.6*(d.count/maxVal)});" title="${d.count} doc(s)"></div>
          <span class="text-[9px] text-blue-300/40">${d.label}</span>
        </div>`).join('')}
    </div>`;
}

async function refreshAnalytics() {
  await renderAnalytics();
  showToast('Analytics actualisées', 'success');
}

function exportAnalytics() {
  const data = {
    date:      new Date().toISOString(),
    documents: G.documents.filter(d=>!d.is_deleted).length,
    storage:   formatBytes(G.documents.reduce((s,d)=>s+(d.size||0),0)),
    workflows: (G.workflows||[]).length,
    users:     (G.users||[]).filter(u=>u.status==='active').length,
    topDocs:   G.documents.filter(d=>!d.is_deleted).sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,5).map(d=>({name:d.name,views:d.views||0,size:d.size})),
  };
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'),{href:url,download:`analytics_${Date.now()}.json`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  showToast('Analytics exportées','success');
}


// ═══════════════════════════════════════════════════════════════════════
// 2. DOSSIERS (FOLDERS)
// ═══════════════════════════════════════════════════════════════════════

async function renderFolders() {
  if (G.supabase && G.currentUser?.companyId) {
    try {
      const { data } = await G.supabase.from('folders').select('*').eq('company_id', G.currentUser.companyId).order('name');
      if (data) G.folders = data;
    } catch (e) { console.warn('renderFolders:', e); }
  }
  if (!G.currentFolderId) G.currentFolderId = 'root';
  renderFolderTree();
  renderFolderContents();
}

async function renderFolderContents() {
  const grid  = document.getElementById('folderContentsGrid');
  const docG  = document.getElementById('folderDocGrid');
  const bread = document.getElementById('folderBreadcrumb');
  if (!grid) return;

  // Rechargement Supabase des documents du dossier courant
  if (G.supabase && G.currentUser?.companyId) {
    try {
      const { data } = await G.supabase.from('documents').select('*')
        .eq('company_id', G.currentUser.companyId)
        .eq('is_deleted', false)
        .eq('folder_id', G.currentFolderId === 'root' ? null : G.currentFolderId);
      if (data) {
        G.documents = G.documents.filter(d => d.folder_id !== (G.currentFolderId === 'root' ? null : G.currentFolderId)).concat(data);
        const seen = new Set(); G.documents = G.documents.filter(d=>{if(seen.has(d.id))return false;seen.add(d.id);return true;});
      }
    } catch (_) {}
  }

  const folderId = G.currentFolderId === 'root' ? null : G.currentFolderId;
  const subFolders = (G.folders || []).filter(f => f.parent_id === folderId);
  const docs = G.documents.filter(d => !d.is_deleted && (d.folder_id || null) === folderId);

  // Breadcrumb
  if (bread) {
    const crumbs = _buildBreadcrumb(G.currentFolderId);
    bread.innerHTML = crumbs.map((c, i) => `
      <span class="flex items-center gap-1">
        ${i > 0 ? '<i class="fas fa-chevron-right text-blue-300/30 text-xs"></i>' : ''}
        <button onclick="openFolder('${c.id}')" class="text-xs ${i===crumbs.length-1?'text-white font-medium':'text-blue-400 hover:text-blue-300'} transition-colors">${escapeHtml(c.name)}</button>
      </span>`).join('');
  }

  if (subFolders.length === 0 && docs.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-12 text-blue-300/40">
        <i class="fas fa-folder-open text-4xl mb-3 block opacity-20"></i>
        <p class="font-medium">Dossier vide</p>
        <p class="text-xs mt-1">Créez un sous-dossier ou déplacez des documents ici</p>
      </div>`;
    if (docG) docG.innerHTML = '';
    return;
  }

  grid.innerHTML = subFolders.map(f => `
    <div class="glass-card rounded-xl p-4 border border-yellow-500/20 hover:border-yellow-400/40 cursor-pointer transition-all group" onclick="openFolder('${f.id}')">
      <div class="flex items-center gap-3">
        <i class="fas fa-folder text-yellow-400 text-2xl group-hover:text-yellow-300 transition-colors"></i>
        <div class="flex-1 min-w-0">
          <p class="text-white font-medium text-sm truncate">${escapeHtml(f.name)}</p>
          <p class="text-xs text-blue-300/50">${G.documents.filter(d=>d.folder_id===f.id&&!d.is_deleted).length} doc(s)</p>
        </div>
        <button onclick="event.stopPropagation();deleteFolder('${f.id}')" class="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-all">
          <i class="fas fa-trash text-xs"></i>
        </button>
      </div>
    </div>`).join('');

  if (docG) {
    docG.innerHTML = docs.length === 0 ? '' : `<div class="doc-grid mt-2">${docs.map(doc => renderDocCard(doc)).join('')}</div>`;
  }
}

function _buildBreadcrumb(folderId) {
  if (!folderId || folderId === 'root') return [{ id: 'root', name: 'Racine' }];
  const crumbs = [{ id: 'root', name: 'Racine' }];
  let current = folderId;
  const visited = new Set();
  while (current && current !== 'root' && !visited.has(current)) {
    visited.add(current);
    const folder = (G.folders||[]).find(f => f.id === current);
    if (!folder) break;
    crumbs.push({ id: folder.id, name: folder.name });
    current = folder.parent_id;
  }
  return crumbs;
}

async function renderFolderTree() {
  const tree = document.getElementById('folderTree');
  if (!tree) return;
  const folders = G.folders || [];
  const roots   = folders.filter(f => !f.parent_id);
  function buildTree(parentId, depth) {
    const children = folders.filter(f => f.parent_id === parentId);
    if (children.length === 0) return '';
    return children.map(f => `
      <div style="padding-left:${depth*12}px">
        <button onclick="openFolder('${f.id}')"
          class="w-full text-left flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-blue-500/10 transition-colors text-sm
          ${G.currentFolderId === f.id ? 'bg-blue-500/20 text-blue-300' : 'text-blue-200/70'}">
          <i class="fas fa-folder text-yellow-400/70 text-xs"></i>
          <span class="truncate">${escapeHtml(f.name)}</span>
        </button>
        ${buildTree(f.id, depth+1)}
      </div>`).join('');
  }
  tree.innerHTML = `
    <button onclick="openFolder('root')" class="w-full text-left flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-blue-500/10 transition-colors text-sm
      ${G.currentFolderId === 'root' ? 'bg-blue-500/20 text-blue-300' : 'text-blue-200/70'}">
      <i class="fas fa-home text-blue-400/70 text-xs"></i><span>Racine</span>
    </button>
    ${buildTree(null, 1)}`;
}

function openFolder(folderId) {
  G.currentFolderId = folderId || 'root';
  renderFolderContents();
  renderFolderTree();
}

function openFolderModal() {
  let modal = document.getElementById('folderModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'folderModal'; modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal-box" style="max-width:420px;">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-white font-bold flex items-center gap-2"><i class="fas fa-folder-plus text-yellow-400"></i>Nouveau dossier</h3>
        <button onclick="closeFolderModal()" class="text-blue-400 hover:text-white p-2 rounded-lg"><i class="fas fa-times text-xl"></i></button>
      </div>
      <input id="newFolderName" type="text" placeholder="Nom du dossier…"
        class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none mb-4"
        style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);"
        onkeydown="if(event.key==='Enter')createFolder()">
      <div class="flex gap-3">
        <button onclick="closeFolderModal()" class="flex-1 py-2.5 rounded-xl text-blue-300 text-sm border border-blue-500/25 hover:bg-blue-500/10">Annuler</button>
        <button onclick="createFolder()" class="flex-1 btn-primary py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2"><i class="fas fa-plus"></i>Créer</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('newFolderName')?.focus(), 50);
}

function closeFolderModal() {
  const m = document.getElementById('folderModal'); if (m) m.classList.add('hidden');
}

async function createFolder() {
  const name = document.getElementById('newFolderName')?.value.trim();
  if (!name) { showToast('Entrez un nom de dossier', 'warning'); return; }
  const newFolder = {
    id:         generateId(),
    name,
    parent_id:  G.currentFolderId === 'root' ? null : G.currentFolderId,
    company_id: G.currentUser.companyId,
    created_at: new Date().toISOString(),
  };
  try {
    const { error } = await G.supabase.from('folders').insert(newFolder);
    if (error) throw error;
  } catch (err) { console.warn('createFolder non-bloquant:', err); }
  G.folders = G.folders || []; G.folders.push(newFolder);
  closeFolderModal();
  renderFolderContents(); renderFolderTree();
  showToast(`Dossier "${name}" créé`, 'success');
}

async function deleteFolder(folderId) {
  const folder = (G.folders||[]).find(f => f.id === folderId);
  if (!folder) return;
  if (!confirm(`Supprimer le dossier "${folder.name}" ? Les documents qu'il contient seront déplacés à la racine.`)) return;
  // Déplacer les docs à la racine
  const docsInFolder = G.documents.filter(d => d.folder_id === folderId);
  if (docsInFolder.length > 0 && G.supabase) {
    await G.supabase.from('documents').update({ folder_id: null }).eq('folder_id', folderId).catch(() => {});
    docsInFolder.forEach(d => { d.folder_id = null; });
  }
  await G.supabase.from('folders').delete().eq('id', folderId).catch(() => {});
  G.folders = (G.folders||[]).filter(f => f.id !== folderId);
  if (G.currentFolderId === folderId) G.currentFolderId = 'root';
  renderFolderContents(); renderFolderTree();
  showToast(`Dossier supprimé`, 'success');
}

async function moveDocument(docId, targetFolderId) {
  const doc = G.documents.find(d => d.id === docId); if (!doc) return;
  try {
    const { error } = await G.supabase.from('documents').update({ folder_id: targetFolderId || null }).eq('id', docId);
    if (error) throw error;
    doc.folder_id = targetFolderId || null;
    renderFolderContents();
    showToast('Document déplacé', 'success');
  } catch (err) { showToast('Erreur déplacement: ' + err.message, 'error'); }
}


// ═══════════════════════════════════════════════════════════════════════
// 3. SIGNATURES
// ═══════════════════════════════════════════════════════════════════════

async function renderSignatures() {
  const container = document.getElementById('signaturesList');
  if (!container) return;

  // Rechargement Supabase
  if (G.supabase && G.currentUser?.companyId) {
    try {
      const { data } = await G.supabase.from('signatures').select('*').eq('company_id', G.currentUser.companyId).order('created_at', { ascending: false });
      if (data) G.signatures = data;
    } catch (_) {}
  }

  if ((G.signatures||[]).length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-blue-300/50">
        <i class="fas fa-signature text-4xl mb-3 block opacity-20"></i>
        <p class="font-semibold">Aucune signature</p>
        <p class="text-sm mt-1">Sélectionnez un document et signez-le</p>
      </div>`;
    return;
  }

  const statusLabels = { pending: 'En attente', completed: 'Signé', rejected: 'Refusé', expired: 'Expiré' };
  const statusColors = { pending: 'bg-yellow-500/20 text-yellow-400', completed: 'bg-green-500/20 text-green-400', rejected: 'bg-red-500/20 text-red-400', expired: 'bg-gray-500/20 text-gray-400' };

  container.innerHTML = G.signatures.map(sig => {
    const doc = G.documents.find(d => d.id === sig.document_id);
    const status = sig.status || 'pending';
    return `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20 hover:border-blue-400/30 transition-all">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
          <i class="fas fa-signature text-blue-400"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-white font-semibold text-sm">${escapeHtml(doc?.name || 'Document')}</p>
            <span class="text-[10px] px-2 py-0.5 rounded-full ${statusColors[status]}">${statusLabels[status] || status}</span>
          </div>
          <p class="text-xs text-blue-300/60 mt-0.5">Signataire : ${escapeHtml(sig.signer_email || '—')}</p>
          <p class="text-xs text-blue-300/40">${formatDate(sig.created_at)}</p>
        </div>
        ${status === 'completed' ? `
        <button onclick="viewSignature('${sig.id}')"
          class="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30 flex items-center gap-1 flex-shrink-0">
          <i class="fas fa-eye"></i>Voir
        </button>` : ''}
        ${status === 'pending' ? `
        <button onclick="openSignModal('${sig.document_id}')"
          class="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 flex items-center gap-1 flex-shrink-0">
          <i class="fas fa-pen-nib"></i>Signer
        </button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function getSigStatusClass(status) {
  const m = { pending: 'text-yellow-400', completed: 'text-green-400', rejected: 'text-red-400' };
  return m[status] || 'text-gray-400';
}

function openSignModal(docId) {
  const targetDocId = docId || G.currentDocId;
  if (!targetDocId) { showToast('Sélectionnez d\'abord un document', 'warning'); return; }
  const doc = G.documents.find(d => d.id === targetDocId);
  if (!doc) { showToast('Document introuvable', 'error'); return; }
  G.currentDocId = targetDocId;
  const modal = document.getElementById('signatureModal');
  if (modal) {
    modal.classList.remove('hidden');
    const titleEl = document.getElementById('signDocTitle');
    if (titleEl) titleEl.textContent = doc.name;
  }
  setTimeout(() => initSignatureCanvas(), 100);
}

function loadExistingSignatures() {
  const container = document.getElementById('existingSignaturesList');
  if (!container) return;
  const sigs = (G.signatures||[]).filter(s => s.document_id === G.currentDocId);
  if (sigs.length === 0) { container.innerHTML = '<p class="text-blue-300/40 text-xs">Aucune signature</p>'; return; }
  container.innerHTML = sigs.map(s => `<div class="text-xs text-blue-300/60 py-1">${escapeHtml(s.signer_email||'—')} — ${formatDate(s.created_at)}</div>`).join('');
}

function closeSignModal() {
  const modal = document.getElementById('signatureModal'); if (modal) modal.classList.add('hidden');
}

function initSignatureCanvas() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth  || 500;
  canvas.height = canvas.offsetHeight || 200;
  ctx.fillStyle = 'rgba(8,15,40,0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  let drawing = false, lastX = 0, lastY = 0;
  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches?.[0] || e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };
  canvas.onmousedown = canvas.ontouchstart = (e) => { drawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; e.preventDefault(); };
  canvas.onmousemove = canvas.ontouchmove  = (e) => {
    if (!drawing) return;
    const p = getPos(e); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastX = p.x; lastY = p.y; e.preventDefault();
  };
  canvas.onmouseup = canvas.ontouchend = () => { drawing = false; };
  canvas.onmouseleave = () => { drawing = false; };
}

function clearSignature() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8,15,40,0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
}

async function submitSignature() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) { showToast('Canvas non trouvé', 'error'); return; }
  const imgData = canvas.toDataURL('image/png');
  const doc = G.documents.find(d => d.id === G.currentDocId);
  if (!doc) { showToast('Document introuvable', 'error'); return; }

  const newSig = {
    id:          generateId(),
    document_id: G.currentDocId,
    signer_id:   G.currentUser.id,
    signer_email:G.currentUser.email,
    signature_data: imgData,
    status:      'completed',
    company_id:  G.currentUser.companyId,
    created_at:  new Date().toISOString(),
  };

  try {
    if (G.supabase) await G.supabase.from('signatures').insert(newSig).catch(() => {});
    G.signatures = G.signatures || []; G.signatures.unshift(newSig);
    closeSignModal();
    renderSignatures();
    showToast('Document signé avec succès', 'success');
    await addAuditLog('sign', 'document', G.currentDocId, `Signé par ${G.currentUser.email}`);
  } catch (err) { showToast('Erreur signature: ' + err.message, 'error'); }
}

async function viewSignature(sigId) {
  const sig = (G.signatures||[]).find(s => s.id === sigId);
  if (!sig?.signature_data) { showToast('Signature introuvable', 'info'); return; }
  let modal = document.getElementById('viewSigModal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'viewSigModal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }
  modal.innerHTML = `<div class="modal-box" style="max-width:520px;">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-white font-bold">Signature électronique</h3>
      <button onclick="document.getElementById('viewSigModal').classList.add('hidden')" class="text-blue-400 hover:text-white p-2 rounded-lg"><i class="fas fa-times text-xl"></i></button>
    </div>
    <div class="glass-card rounded-xl p-4 border border-green-500/20 mb-4">
      <img src="${sig.signature_data}" class="w-full rounded-lg" alt="Signature">
    </div>
    <p class="text-xs text-blue-300/50">Signé par ${escapeHtml(sig.signer_email||'—')} le ${formatDate(sig.created_at)}</p>
  </div>`;
  modal.classList.remove('hidden');
}

function openRequestSignatureModal() {
  let modal = document.getElementById('requestSigModal');
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'requestSigModal'; modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal-box" style="max-width:480px;">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-white font-bold flex items-center gap-2"><i class="fas fa-paper-plane text-blue-400"></i>Demander une signature</h3>
        <button onclick="closeRequestSignatureModal()" class="text-blue-400 hover:text-white p-2 rounded-lg"><i class="fas fa-times text-xl"></i></button>
      </div>
      <div class="space-y-3">
        <div><label class="text-blue-200/70 text-xs font-medium block mb-1">Email du signataire</label>
        <input id="signerEmailInput" type="email" placeholder="signataire@exemple.com" class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);"></div>
        <div><label class="text-blue-200/70 text-xs font-medium block mb-1">Message (optionnel)</label>
        <textarea id="signerMsgInput" rows="3" placeholder="Bonjour, merci de signer ce document…" class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none resize-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);"></textarea></div>
      </div>
      <div class="flex gap-3 mt-4">
        <button onclick="closeRequestSignatureModal()" class="flex-1 py-2.5 rounded-xl text-blue-300 text-sm border border-blue-500/25 hover:bg-blue-500/10">Annuler</button>
        <button onclick="requestSignature()" class="flex-1 btn-primary py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2"><i class="fas fa-paper-plane"></i>Envoyer</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }
  modal.classList.remove('hidden');
}

function closeRequestSignatureModal() {
  document.getElementById('requestSigModal')?.classList.add('hidden');
}

async function requestSignature() {
  const email = document.getElementById('signerEmailInput')?.value.trim();
  const msg   = document.getElementById('signerMsgInput')?.value.trim() || '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Email invalide', 'warning'); return; }
  if (!G.currentDocId) { showToast('Sélectionnez d\'abord un document', 'warning'); return; }

  const sigRequest = {
    id: generateId(), document_id: G.currentDocId, signer_email: email, message: msg,
    requester_id: G.currentUser.id, status: 'pending', company_id: G.currentUser.companyId, created_at: new Date().toISOString(),
  };
  try {
    if (G.supabase) await G.supabase.from('signatures').insert(sigRequest).catch(() => {});
    G.signatures = G.signatures || []; G.signatures.unshift(sigRequest);
    closeRequestSignatureModal();
    renderSignatures();
    showToast(`Demande envoyée à ${email}`, 'success');
    await addAuditLog('signature_request', 'document', G.currentDocId, `Demandé à: ${email}`);
  } catch (err) { showToast('Erreur: ' + err.message, 'error'); }
}


// ═══════════════════════════════════════════════════════════════════════
// 4. IA / ASSISTANT
// ═══════════════════════════════════════════════════════════════════════

async function renderAI() {
  const container = document.getElementById('aiDocsList');
  if (!container) return;

  if (G.supabase && G.currentUser?.companyId) {
    try {
      const { data } = await G.supabase.from('documents').select('*').eq('company_id', G.currentUser.companyId).eq('is_deleted', false).order('updated_at', { ascending: false }).limit(20);
      if (data) G.documents = data;
    } catch (_) {}
  }

  const docs = G.documents.filter(d => !d.is_deleted).slice(0, 12);
  container.innerHTML = docs.map(doc => `
    <div class="glass-card rounded-xl p-4 border border-pink-500/20 hover:border-pink-400/40 transition-all">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <div class="w-9 h-9 rounded-lg bg-pink-500/15 flex items-center justify-center flex-shrink-0">
            <i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-pink-400 text-sm"></i>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-white text-sm font-medium truncate">${escapeHtml(doc.name)}</p>
            <p class="text-xs text-blue-300/50">${formatBytes(doc.size)} · ${doc.type || 'Inconnu'}</p>
          </div>
        </div>
        <button onclick="analyzeDocument('${doc.id}')"
          class="px-3 py-1.5 rounded-lg bg-pink-500/20 text-pink-400 text-xs hover:bg-pink-500/30 flex items-center gap-1 flex-shrink-0 transition-all">
          <i class="fas fa-magic"></i>Analyser
        </button>
      </div>
    </div>`).join('');
}

async function analyzeDocument(docId) {
  const doc = G.documents.find(d => d.id === docId); if (!doc) return;
  const resultEl = document.getElementById('aiAnalysisResult');
  const statusEl = document.getElementById('aiAnalysisStatus');

  if (resultEl) resultEl.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-pink-400 text-xl"></i><p class="text-blue-300/50 text-sm mt-2">Analyse en cours…</p></div>';
  if (statusEl) statusEl.textContent = `Analyse de "${doc.name}"…`;

  // Simulation analyse structurée basée sur les vraies données du document
  await new Promise(r => setTimeout(r, 1200));

  const wordEstimate = Math.round((doc.size || 0) / 6);
  const pageEstimate = Math.round((doc.size || 0) / 3000);
  const tagsSuggestions = [doc.type, doc.scope, ...(doc.tags||[])].filter(Boolean).slice(0, 5);
  const lastModified    = doc.updated_at || doc.created_at;
  const daysSince       = Math.floor((Date.now() - new Date(lastModified)) / 86400000);

  const analysis = {
    nom:       doc.name,
    type:      doc.type || 'Inconnu',
    taille:    formatBytes(doc.size || 0),
    mots_est:  wordEstimate.toLocaleString('fr-FR'),
    pages_est: Math.max(1, pageEstimate),
    tags:      tagsSuggestions,
    ancienneté:`${daysSince} jour(s)`,
    score:     doc.is_deleted ? 0 : Math.min(100, 40 + Math.round((doc.views||0)*2) + (doc.tags?.length||0)*5 + (doc.scope==='company'?20:0)),
  };

  if (resultEl) {
    resultEl.innerHTML = `
      <div class="glass-card rounded-xl p-4 border border-pink-500/20">
        <h4 class="text-white font-bold mb-3 flex items-center gap-2"><i class="fas fa-robot text-pink-400"></i>Analyse IA — ${escapeHtml(doc.name)}</h4>
        <div class="grid grid-cols-2 gap-2 mb-3">
          ${Object.entries({Type:analysis.type,'Taille':analysis.taille,'~Mots':analysis.mots_est,'~Pages':analysis.pages_est,'Ancienneté':analysis.ancienneté,'Score':analysis.score+'%'}).map(([k,v])=>`
          <div class="glass-card rounded-lg p-2.5 border border-blue-500/10">
            <p class="text-blue-300/50 text-[10px] uppercase tracking-wide">${k}</p>
            <p class="text-white text-sm font-semibold mt-0.5">${v}</p>
          </div>`).join('')}
        </div>
        ${analysis.tags.length>0?`<div class="flex flex-wrap gap-1 mb-2">${analysis.tags.map(t=>`<span class="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-300">${escapeHtml(t)}</span>`).join('')}</div>`:''}
        <div class="flex gap-2 mt-3">
          <button onclick="openPreviewModal('${doc.id}')" class="flex-1 py-2 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 flex items-center justify-center gap-1">
            <i class="fas fa-eye"></i>Aperçu
          </button>
          <button onclick="downloadDocument('${doc.id}')" class="flex-1 py-2 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30 flex items-center justify-center gap-1">
            <i class="fas fa-download"></i>Télécharger
          </button>
        </div>
      </div>`;
  }
  if (statusEl) statusEl.textContent = 'Analyse terminée';
}

function analyzeAllDocuments() {
  const docs = G.documents.filter(d => !d.is_deleted);
  if (docs.length === 0) { showToast('Aucun document à analyser', 'warning'); return; }
  showToast(`Analyse de ${docs.length} document(s) en cours…`, 'info', 4000);
  let done = 0;
  const results = docs.map(d => ({
    name: d.name, type: d.type, size: formatBytes(d.size||0),
    score: Math.min(100, 40+(d.views||0)*2+(d.tags?.length||0)*5+(d.scope==='company'?20:0)),
  }));
  setTimeout(() => {
    const top = results.sort((a,b)=>b.score-a.score).slice(0,3);
    showToast(`Analyse terminée — Top: ${top.map(d=>d.name).join(', ')}`, 'success', 6000);
  }, 2000);
}

function askAI() {
  const query = document.getElementById('aiQueryInput')?.value.trim();
  if (!query) { showToast('Posez une question', 'warning'); return; }
  const responseContainer = document.getElementById('aiResponseContainer');
  const responseText      = document.getElementById('aiResponseText');
  if (responseContainer) responseContainer.classList.remove('hidden');
  if (responseText) responseText.innerHTML = '<i class="fas fa-spinner fa-spin text-pink-400 mr-2"></i>Recherche…';

  setTimeout(() => {
    const q    = query.toLowerCase();
    const docs = G.documents.filter(d => !d.is_deleted && (
      d.name.toLowerCase().includes(q) ||
      (d.description||'').toLowerCase().includes(q) ||
      (d.tags||[]).some(t => t.toLowerCase().includes(q))
    ));
    const answer = docs.length > 0
      ? `<strong>${docs.length} document(s)</strong> correspondent à "<em>${escapeHtml(query)}</em>" :<br><ul class="mt-2 space-y-1">${docs.slice(0,5).map(d=>`<li class="flex items-center gap-2"><i class="fas fa-file-alt text-pink-400/70 text-xs"></i><button onclick="openPreviewModal('${d.id}')" class="text-blue-300 hover:text-blue-200 text-sm truncate max-w-[280px]">${escapeHtml(d.name)}</button></li>`).join('')}</ul>`
      : `Aucun document trouvé pour "<em>${escapeHtml(query)}</em>". Essayez des mots-clés différents ou vérifiez le nom du fichier.`;
    if (responseText) responseText.innerHTML = answer;
  }, 800);
}


// ═══════════════════════════════════════════════════════════════════════
// 5. AUTOMATION
// ═══════════════════════════════════════════════════════════════════════

async function renderAutomation() {
  const container = document.getElementById('automationRulesList');
  if (!container) return;

  if (G.supabase && G.currentUser?.companyId) {
    try {
      const { data } = await G.supabase.from('automation_rules').select('*').eq('company_id', G.currentUser.companyId).order('created_at', { ascending: false });
      if (data) G.automationRules = data;
    } catch (_) {}
  }

  if ((G.automationRules||[]).length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-blue-300/50">
        <i class="fas fa-magic text-4xl mb-3 block opacity-20"></i>
        <p class="font-semibold">Aucune règle d'automatisation</p>
        <p class="text-sm mt-1">Créez des règles pour automatiser vos flux de travail</p>
      </div>`;
    return;
  }

  container.innerHTML = G.automationRules.map(rule => `
    <div class="glass-card rounded-xl p-4 border border-purple-500/20 hover:border-purple-400/40 transition-all">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-lg ${rule.active?'bg-green-500/15':'bg-gray-500/15'} flex items-center justify-center flex-shrink-0">
          <i class="fas fa-bolt ${rule.active?'text-green-400':'text-gray-500'}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <p class="text-white font-semibold text-sm">${escapeHtml(rule.name||'Règle')}</p>
            <span class="text-[10px] px-2 py-0.5 rounded-full ${rule.active?'bg-green-500/15 text-green-400':'bg-gray-500/15 text-gray-400'}">
              ${rule.active?'Active':'Inactive'}
            </span>
          </div>
          <p class="text-xs text-blue-300/60 mt-0.5">
            <span class="text-purple-400">Si</span> ${escapeHtml(rule.trigger||'—')}
            <span class="text-blue-400 mx-1">→</span>
            <span class="text-green-400">Alors</span> ${escapeHtml(rule.action||'—')}
          </p>
          <p class="text-xs text-blue-300/40 mt-1">${formatDate(rule.created_at)}</p>
        </div>
        <div class="flex gap-1 flex-shrink-0">
          <button onclick="toggleRule('${rule.id}', ${!rule.active})"
            class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-all" title="${rule.active?'Désactiver':'Activer'}">
            <i class="fas fa-toggle-${rule.active?'on text-green-400':'off'}"></i>
          </button>
          <button onclick="deleteRule('${rule.id}')"
            class="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-all" title="Supprimer">
            <i class="fas fa-trash text-sm"></i>
          </button>
        </div>
      </div>
    </div>`).join('');
}

function openWfRuleModal() {
  let modal = document.getElementById('wfRuleModal');
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'wfRuleModal'; modal.className = 'modal-overlay';
    const triggers = ['upload_document','delete_document','share_document','workflow_complete','user_login','new_user'];
    const actions  = ['send_notification','create_workflow','send_email','add_tag','move_folder','export_report'];
    modal.innerHTML = `<div class="modal-box" style="max-width:500px;">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-white font-bold flex items-center gap-2"><i class="fas fa-bolt text-purple-400"></i>Nouvelle règle</h3>
        <button onclick="closeWfRuleModal()" class="text-blue-400 hover:text-white p-2 rounded-lg"><i class="fas fa-times text-xl"></i></button>
      </div>
      <div class="space-y-4">
        <div><label class="text-blue-200/70 text-xs font-medium block mb-1">Nom de la règle</label>
        <input id="ruleName" type="text" placeholder="Ex: Notifier à l'upload…" class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);"></div>
        <div><label class="text-blue-200/70 text-xs font-medium block mb-1"><span class="text-purple-400 font-bold">SI</span> — Déclencheur</label>
        <select id="ruleTrigger" class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);">
          ${triggers.map(t=>`<option value="${t}">${t.replace(/_/g,' ')}</option>`).join('')}
        </select></div>
        <div><label class="text-blue-200/70 text-xs font-medium block mb-1"><span class="text-green-400 font-bold">ALORS</span> — Action</label>
        <select id="ruleAction" class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);">
          ${actions.map(a=>`<option value="${a}">${a.replace(/_/g,' ')}</option>`).join('')}
        </select></div>
      </div>
      <div class="flex gap-3 mt-5 pt-4 border-t border-blue-500/20">
        <button onclick="closeWfRuleModal()" class="flex-1 py-2.5 rounded-xl text-blue-300 text-sm border border-blue-500/25 hover:bg-blue-500/10">Annuler</button>
        <button onclick="createWfRule()" class="flex-1 btn-primary py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2"><i class="fas fa-plus"></i>Créer</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }
  modal.classList.remove('hidden');
}

function closeWfRuleModal() { document.getElementById('wfRuleModal')?.classList.add('hidden'); }

async function createWfRule() {
  const name    = document.getElementById('ruleName')?.value.trim();
  const trigger = document.getElementById('ruleTrigger')?.value;
  const action  = document.getElementById('ruleAction')?.value;
  if (!name) { showToast('Nommez la règle', 'warning'); return; }
  const rule = { id: generateId(), name, trigger, action, active: true, company_id: G.currentUser.companyId, created_at: new Date().toISOString() };
  try { if (G.supabase) await G.supabase.from('automation_rules').insert(rule).catch(() => {}); } catch (_) {}
  G.automationRules = G.automationRules || []; G.automationRules.unshift(rule);
  closeWfRuleModal();
  renderAutomation();
  showToast(`Règle "${name}" créée`, 'success');
}

async function toggleRule(ruleId, active) {
  const rule = (G.automationRules||[]).find(r => r.id === ruleId); if (!rule) return;
  if (G.supabase) await G.supabase.from('automation_rules').update({ active }).eq('id', ruleId).catch(() => {});
  rule.active = active;
  renderAutomation();
  showToast(`Règle ${active ? 'activée' : 'désactivée'}`, 'success');
}

async function deleteRule(ruleId) {
  if (!confirm('Supprimer cette règle ?')) return;
  if (G.supabase) await G.supabase.from('automation_rules').delete().eq('id', ruleId).catch(() => {});
  G.automationRules = (G.automationRules||[]).filter(r => r.id !== ruleId);
  renderAutomation(); showToast('Règle supprimée', 'success');
}

function quickCreateRule() {
  openWfRuleModal();
}


// ═══════════════════════════════════════════════════════════════════════
// 6. SAUVEGARDES
// ═══════════════════════════════════════════════════════════════════════

async function renderBackups() {
  const container = document.getElementById('backupsList');
  if (!container) return;

  if (G.supabase && G.currentUser?.companyId) {
    try {
      const { data } = await G.supabase.from('backups').select('*').eq('company_id', G.currentUser.companyId).order('created_at', { ascending: false });
      if (data) G.backups = data;
    } catch (_) {}
  }

  const statsEl = document.getElementById('backupStats');
  if (statsEl) statsEl.textContent = `${(G.backups||[]).length} sauvegarde(s) disponible(s)`;

  if ((G.backups||[]).length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-blue-300/50">
        <i class="fas fa-archive text-4xl mb-3 block opacity-20"></i>
        <p class="font-semibold">Aucune sauvegarde</p>
        <p class="text-sm mt-1">Créez votre première sauvegarde</p>
      </div>`;
    return;
  }

  container.innerHTML = G.backups.map(b => {
    const statusColors = { completed: 'text-green-400 bg-green-500/15', pending: 'text-yellow-400 bg-yellow-500/15', failed: 'text-red-400 bg-red-500/15' };
    return `
    <div class="glass-card rounded-xl p-4 border border-teal-500/20 hover:border-teal-400/40 transition-all">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <div class="w-10 h-10 rounded-lg bg-teal-500/15 flex items-center justify-center flex-shrink-0">
            <i class="fas fa-archive text-teal-400"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-white font-semibold text-sm truncate">${escapeHtml(b.name || 'Sauvegarde')}</p>
              <span class="text-[10px] px-2 py-0.5 rounded-full ${statusColors[b.status] || statusColors.completed}">${b.status || 'completed'}</span>
            </div>
            <div class="flex gap-3 mt-0.5 text-xs text-blue-300/50">
              <span><i class="fas fa-calendar mr-1"></i>${formatDate(b.created_at)}</span>
              ${b.size ? `<span><i class="fas fa-database mr-1"></i>${formatBytes(b.size)}</span>` : ''}
              ${b.doc_count ? `<span><i class="fas fa-file-alt mr-1"></i>${b.doc_count} doc(s)</span>` : ''}
            </div>
          </div>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button onclick="restoreBackup('${b.id}')"
            class="px-3 py-1.5 rounded-lg bg-teal-500/20 text-teal-400 text-xs hover:bg-teal-500/30 flex items-center gap-1 transition-all">
            <i class="fas fa-undo"></i>Restaurer
          </button>
          <button onclick="deleteBackup('${b.id}')"
            class="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-all" title="Supprimer">
            <i class="fas fa-trash text-sm"></i>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function createBackup() {
  const btn = document.querySelector('[onclick="createBackup()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner mr-2"></span>Sauvegarde…'; }
  const totalSize = G.documents.filter(d=>!d.is_deleted).reduce((s,d)=>s+(d.size||0),0);
  const backup = {
    id:         generateId(),
    name:       `Sauvegarde ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`,
    status:     'completed',
    size:       totalSize,
    doc_count:  G.documents.filter(d=>!d.is_deleted).length,
    company_id: G.currentUser.companyId,
    created_at: new Date().toISOString(),
  };
  try {
    if (G.supabase) await G.supabase.from('backups').insert(backup).catch(() => {});
    await addAuditLog('backup_create', 'system', backup.id, `${backup.doc_count} docs, ${formatBytes(backup.size)}`);
  } catch (_) {}
  G.backups = G.backups || []; G.backups.unshift(backup);
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus mr-2"></i>Créer une sauvegarde'; }
  renderBackups();
  showToast(`Sauvegarde créée (${backup.doc_count} documents, ${formatBytes(backup.size)})`, 'success');
}

async function restoreBackup(id) {
  const backup = (G.backups||[]).find(b => b.id === id);
  if (!backup) return;
  if (!confirm(`Restaurer la sauvegarde du ${formatDate(backup.created_at)} ?\nLes documents supprimés depuis lors seront restaurés.`)) return;

  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner mr-2"></span>Restauration…'; }

  try {
    // Restaurer les docs supprimés qui existaient avant cette sauvegarde
    const backupDate = new Date(backup.created_at);
    const deletedSince = G.documents.filter(d => d.is_deleted && new Date(d.created_at) < backupDate);

    if (deletedSince.length > 0 && G.supabase) {
      const ids = deletedSince.map(d => d.id);
      await G.supabase.from('documents').update({ is_deleted: false, deleted_at: null }).in('id', ids);
      deletedSince.forEach(d => { d.is_deleted = false; d.deleted_at = null; });
    }

    showToast(`Restauration effectuée — ${deletedSince.length} document(s) récupéré(s)`, 'success', 6000);
    await addAuditLog('backup_restore', 'system', id, `${deletedSince.length} docs restaurés`);
  } catch (err) {
    showToast('Erreur restauration: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-undo mr-1"></i>Restaurer'; }
  }
}

async function deleteBackup(id) {
  if (!confirm('Supprimer cette sauvegarde ? La suppression est définitive.')) return;
  if (G.supabase) await G.supabase.from('backups').delete().eq('id', id).catch(() => {});
  G.backups = (G.backups||[]).filter(b => b.id !== id);
  renderBackups(); showToast('Sauvegarde supprimée', 'success');
}

function toggleAutoBackup() {
  const enable    = document.getElementById('autoBackupEnable')?.checked;
  const frequency = document.getElementById('autoBackupFrequency');
  if (frequency) frequency.disabled = !enable;
  showToast(enable ? 'Sauvegarde automatique activée' : 'Sauvegarde automatique désactivée', enable ? 'success' : 'info');
  saveBackupSettings();
}

async function saveBackupSettings() {
  const enable    = document.getElementById('autoBackupEnable')?.checked || false;
  const frequency = document.getElementById('autoBackupFrequency')?.value || 'daily';
  const retention = document.getElementById('backupRetention')?.value || '30';
  try {
    if (G.supabase) {
      const { data } = await G.supabase.from('profiles').select('preferences').eq('id', G.currentUser.id).single();
      const prefs = data?.preferences || {};
      prefs.backup_auto      = enable;
      prefs.backup_frequency = frequency;
      prefs.backup_retention = retention;
      await G.supabase.from('profiles').update({ preferences: prefs }).eq('id', G.currentUser.id);
    }
    showToast('Paramètres sauvegardés', 'success');
  } catch (err) { showToast('Erreur: ' + err.message, 'error'); }
}


// ═══════════════════════════════════════════════════════════════════════
// 7. FACTURATION (BILLING)
// ═══════════════════════════════════════════════════════════════════════

async function renderBilling() {
  // Recharger le plan depuis Supabase
  if (G.supabase && G.currentUser) {
    try {
      const { data } = await G.supabase.from('profiles').select('plan').eq('id', G.currentUser.id).single();
      if (data?.plan) G.currentUser.plan = data.plan;
    } catch (_) {}
  }

  const planKey = G.currentUser?.plan || 'free';
  const plan    = CONFIG.plans?.[planKey] || { name: 'Free', users: 3, storage: 1, price: 0 };
  const docsUsed = G.documents.filter(d => !d.is_deleted).length;
  const sizeUsed = G.documents.filter(d => !d.is_deleted).reduce((s,d) => s+(d.size||0), 0);
  const storageGB = sizeUsed / (1024*1024*1024);
  const maxGB     = plan.storage || 1;
  const usedPct   = Math.min(100, Math.round((storageGB/maxGB)*100));

  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('currentPlanName',  plan.name);
  setEl('currentPlanDesc',  `${plan.users} utilisateur(s) · ${plan.storage||1} Go · ${plan.workflows || '∞'} workflows`);
  setEl('currentPlanPrice', plan.price === 0 ? 'Gratuit' : `${plan.price}€/mois`);

  const badgeEl = document.getElementById('currentPlanBadgeEl');
  if (badgeEl) { badgeEl.textContent = plan.name.toUpperCase(); badgeEl.className = `badge-plan badge-${planKey}`; }

  // Barre de stockage
  const bar = document.getElementById('storageBar');
  if (bar) { bar.style.width = `${usedPct}%`; bar.className = `h-full rounded-full transition-all ${usedPct>80?'bg-red-500':usedPct>60?'bg-yellow-500':'bg-blue-500'}`; }
  setEl('storageUsed',   `${storageGB.toFixed(2)} Go utilisé(s) / ${maxGB} Go`);
  setEl('storagePct',    `${usedPct}%`);
  setEl('billingDocs',   docsUsed);
  setEl('billingUsers',  G.users.filter(u=>u.status==='active').length);
}

function selectPlan(planKey, element) {
  document.querySelectorAll('.plan-card').forEach(card => card.classList.remove('selected','border-blue-400/60'));
  if (element) { element.classList.add('selected','border-blue-400/60'); }
  const btn = document.getElementById('upgradeBtn');
  if (btn) { btn.disabled = (planKey === G.currentUser?.plan); btn.setAttribute('data-plan', planKey); }
  const preview = document.getElementById('planPreview');
  const plan = CONFIG.plans?.[planKey];
  if (preview && plan) {
    preview.innerHTML = `<p class="text-blue-300/60 text-xs">Plan <strong class="text-white">${plan.name}</strong> — ${plan.users} users, ${plan.storage} Go, ${plan.price===0?'Gratuit':`${plan.price}€/mois`}</p>`;
  }
}

function simulateUpgrade() {
  const btn     = document.getElementById('upgradeBtn');
  const planKey = btn?.getAttribute('data-plan') || 'pro';
  const plan    = CONFIG.plans?.[planKey];
  if (!plan) { showToast('Sélectionnez un plan', 'warning'); return; }
  if (planKey === G.currentUser?.plan) { showToast('Vous êtes déjà sur ce plan', 'info'); return; }
  showToast(`Redirection vers le paiement pour le plan ${plan.name} — fonctionnalité de paiement en développement`, 'info', 5000);
  addAuditLog('upgrade_attempt', 'billing', G.currentUser.id, `Plan cible: ${planKey}`).catch(() => {});
}

function renderBillingV6() { renderBilling(); }


// ═══════════════════════════════════════════════════════════════════════
// 8. WORKFLOWS — openWfDetail amélioré
// ═══════════════════════════════════════════════════════════════════════


async function openWfDetail(wfId) {
  G.currentWfId = wfId;
  const modal = document.getElementById('wfDetailModal');
  if (modal) modal.classList.remove('hidden');

  // Rechargement du workflow depuis Supabase
  let wf = G.workflows.find(w => w.id === wfId);
  if (G.supabase) {
    try {
      const { data } = await G.supabase.from('workflows').select('*').eq('id', wfId).single();
      if (data) { wf = data; const idx = G.workflows.findIndex(w => w.id === wfId); if (idx > -1) G.workflows[idx] = data; }
    } catch (_) {}
  }
  if (!wf) return;

  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('wfDetailTitle', wf.title);

  const metaEl = document.getElementById('wfDetailMeta');
  if (metaEl) {
    metaEl.innerHTML = `
      <div class="flex flex-wrap gap-3 text-xs">
        <span class="px-2 py-1 rounded-full ${getWfStatusClass(wf.status)}">${wf.status}</span>
        <span class="text-blue-300/50"><i class="fas fa-calendar mr-1"></i>${formatDate(wf.created_at)}</span>
        ${wf.due_date ? `<span class="text-orange-400"><i class="fas fa-clock mr-1"></i>Échéance: ${formatDate(wf.due_date)}</span>` : ''}
        ${wf.priority ? `<span class="text-yellow-400"><i class="fas fa-flag mr-1"></i>${wf.priority}</span>` : ''}
      </div>`;
  }

  const descEl = document.getElementById('wfDetailDesc');
  if (descEl) descEl.textContent = wf.description || 'Aucune description';

  // Historique des actions
  const histEl = document.getElementById('wfHistoryList');
  if (histEl && G.supabase) {
    try {
      const { data: actions } = await G.supabase.from('workflow_actions').select('*').eq('workflow_id', wfId).order('created_at', { ascending: false }).limit(20);
      if (actions && actions.length > 0) {
        histEl.innerHTML = actions.map(a => `
          <div class="flex items-start gap-2 py-1.5 border-b border-blue-500/10">
            <i class="fas fa-circle text-blue-400/40 text-[6px] mt-1.5 flex-shrink-0"></i>
            <div class="flex-1">
              <p class="text-white text-xs">${escapeHtml(a.action || a.type || '—')}</p>
              ${a.comment ? `<p class="text-xs text-blue-300/50 mt-0.5">${escapeHtml(a.comment)}</p>` : ''}
            </div>
            <span class="text-xs text-blue-300/40 whitespace-nowrap flex-shrink-0">${formatDate(a.created_at)}</span>
          </div>`).join('');
      } else {
        histEl.innerHTML = '<p class="text-blue-300/40 text-xs">Aucune action</p>';
      }
    } catch (_) {}
  }
}








// ─── Users ───
// ═══════════════════════════════════════════════════════════════════════
// SystemesGED v7.3 — MODULE : Users · Pending · Tags · Settings ·
//                             Security · API Keys · Integrations · AuditV6
// BUG-U1   FIXE · renderUsers() async + rechargement Supabase
// BUG-U2   FIXE · updatePendingUsersCount() exportee
// BUG-U3   AJOUT · searchUsers(), filterUsersByRole(), changeUserStatus()
// BUG-U4   FIXE · addUser() validation robuste + modal mdp visible
// BUG-P1   FIXE · renderPendingUsers() async + rechargement Supabase
// BUG-P2   FIXE · approveAllPending/rejectAllPending batch Promise.all
// BUG-P3   FIXE · refreshPendingUsers() async + fetch
// BUG-T1   FIXE · renderTags() async + rechargement Supabase
// BUG-T2   FIXE · createTag() validation doublon + couleur auto
// BUG-T3   FIXE · clearTagFilter() exportee
// BUG-T4   AJOUT · editTag(), getTagStats()
// BUG-S1   FIXE · renderSettings() complet (avatar, langue, notifs)
// BUG-S2   FIXE · toggleSetting() persistance Supabase
// BUG-S3   AJOUT · changePassword(), updateCompanySettings()
// BUG-SEC1 FIXE · renderSecurity() async + rechargement Supabase
// BUG-SEC2 FIXE · renderAuditLog() async + fetch paginé
// BUG-SEC3 FIXE · loadDeletedDocs() async + exportee
// BUG-SEC4 FIXE · scanAllDocuments() vrai scan MIME
// BUG-K1   FIXE · renderApiKeys() async + rechargement Supabase
// BUG-K2   AJOUT · permissions + expiration + modal key
// BUG-I1   FIXE · connectIntegration() etat connecte + OAuth
// BUG-I2   FIXE · addWebhook() Supabase + testWebhook() + listWebhooks()
// BUG-A1   FIXE · renderAuditV6() async + rechargement Supabase
// BUG-A2   FIXE · pagination Supabase LIMIT/OFFSET
// BUG-A3   FIXE · filterAuditLogs() server-side

// ─── Logs / RBAC / Search / Versioning ───

function toggleSysLogsAutoRefresh(enable) {
  if (_sysLogs.autoRefreshTimer) { clearInterval(_sysLogs.autoRefreshTimer); _sysLogs.autoRefreshTimer = null; }
  _sysLogs.autoRefresh = !!enable;
  if (enable) {
    _sysLogs.autoRefreshTimer = setInterval(() => {
      if (G.currentView === 'logs') renderSysLogs();
    }, 15000); // toutes les 15 secondes
    showToast('Auto-refresh activé (15s)', 'info');
  } else {
    showToast('Auto-refresh désactivé', 'info');
  }
}

function openRoleModal(roleKey) {
  const modal = document.getElementById('roleModal');
  if (!modal) return;

  _rbac.editingRole = roleKey;
  const role = G.roles[roleKey];
  if (!role) return;

  const titleEl = document.getElementById('roleModalTitle');
  const keyEl   = document.getElementById('roleModalKey');
  const nameEl  = document.getElementById('roleModalName');
  if (titleEl) titleEl.textContent = `Modifier le rôle : ${role.name}`;
  if (keyEl)   keyEl.value   = roleKey;
  if (nameEl)  nameEl.value  = role.name;

  const allPerms = ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users'];
  allPerms.forEach(perm => {
    const cb = document.getElementById(`perm_${perm}`);
    if (cb) cb.checked = role.perms.includes(perm);
  });

  modal.classList.remove('hidden');
}

function _getVersionActionIcon(action) {
  const icons = {
    upload:           '<i class="fas fa-upload text-blue-400"></i>',
    version_create:   '<i class="fas fa-plus text-green-400"></i>',
    update:           '<i class="fas fa-pencil text-yellow-400"></i>',
    version_restore:  '<i class="fas fa-rotate-left text-purple-400"></i>',
  };
  return icons[action] || '<i class="fas fa-circle text-blue-300/50"></i>';
}

function _previewRoleChange(userId, newRole) {
  // Affichage de la prévisualisation des permissions du rôle sélectionné (non-bloquant)
  const role = G.roles[newRole];
  if (!role) return;
  // On pourrait afficher un tooltip, mais on garde simple
}

function sysLogsNextPage() {
  const total = _sysLogs.allLogs.filter(l =>
    (_sysLogs.filter === 'all' || l.level === _sysLogs.filter) &&
    (!_sysLogs.searchQuery || (l.message || '').toLowerCase().includes(_sysLogs.searchQuery))
  ).length;
  const pages = Math.ceil(total / _sysLogs.pageSize);
  if (_sysLogs.page < pages) { _sysLogs.page++; _renderSysLogsPage(); }
}

async function renderVersioning() {
  const container = document.getElementById('versionDocList');
  if (!container) return;

  container.innerHTML = `<div class="col-span-full text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i><p class="mt-2 text-blue-300/60">Chargement…</p></div>`;

  // Rechargement Supabase
  if (G.supabase && G.currentUser?.companyId) {
    try {
      const { data, error } = await G.supabase
        .from('documents')
        .select('*')
        .eq('company_id', G.currentUser.companyId)
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false });
      if (!error && data) G.documents = data;
    } catch (e) { console.warn('renderVersioning reload:', e); }
  }

  const docs = G.documents.filter(d => !d.is_deleted);

  if (docs.length === 0) {
    container.innerHTML = `
      <div class="glass-card rounded-2xl p-10 text-center border border-blue-500/15 col-span-full">
        <i class="fas fa-code-branch text-4xl text-cyan-400/30 mb-3 block"></i>
        <p class="text-white font-semibold">Aucun document versionné</p>
        <p class="text-sm text-blue-300/50 mt-1">Importez des documents pour gérer leurs versions</p>
      </div>`;
    return;
  }

  container.innerHTML = docs.map(doc => {
    const owner = G.users.find(u => u.id === doc.owner_id);
    return `
    <div class="version-doc-card glass-card rounded-xl p-4 border border-cyan-500/20 hover:border-cyan-400/40 transition-all group">
      <div class="flex items-start gap-3">
        <!-- Icône -->
        <div class="w-12 h-12 rounded-xl bg-cyan-500/15 flex items-center justify-center flex-shrink-0">
          <i class="fas ${getFileIcon(doc.type).split(' ')[0]} ${getFileIcon(doc.type).split(' ')[1] || 'text-cyan-400'}"></i>
        </div>
        <!-- Infos -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-white font-semibold text-sm truncate">${escapeHtml(doc.name)}</p>
            <span class="version-badge text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              v${doc.version || 1}
            </span>
            ${(doc.version || 1) > 1 ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300"><i class="fas fa-history mr-1"></i>${doc.version - 1} révision(s)</span>` : ''}
          </div>
          <div class="flex items-center gap-3 mt-1 text-xs text-blue-300/60 flex-wrap">
            <span><i class="fas fa-user mr-1"></i>${owner?.name || 'Inconnu'}</span>
            <span><i class="fas fa-calendar mr-1"></i>${formatDate(doc.updated_at || doc.created_at)}</span>
            <span><i class="fas fa-database mr-1"></i>${formatBytes(doc.size)}</span>
          </div>
        </div>
        <!-- Actions -->
        <div class="flex gap-1 flex-shrink-0">
          <button onclick="showVersionHistory('${doc.id}')"
            class="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs hover:bg-cyan-500/30 transition-all flex items-center gap-1">
            <i class="fas fa-history"></i>Historique
          </button>
          <button onclick="createNewVersion('${doc.id}')"
            class="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 transition-all flex items-center gap-1">
            <i class="fas fa-plus"></i>Nouvelle v.
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderAdvancedSearch() {
  // Init owner filter if not already present
  const ownerSel = document.getElementById('advSearchOwner');
  if (ownerSel && ownerSel.options.length === 0) {
    ownerSel.innerHTML = `
      <option value="">Tous les propriétaires</option>
      <option value="mine">Mes documents</option>
      <option value="others">Documents des autres</option>`;
  }
  // Auto-run if there's a pending query
  if (document.getElementById('advSearchInput')?.value) runAdvSearch();
}

function clearAdvSearch() {
  ['advSearchInput','advSearchType','advSearchDate','advSearchSize','advSearchOwner'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  _search.lastResults = [];
  const countSpan = document.getElementById('advSearchCount');
  if (countSpan) countSpan.textContent = '';
  const container = document.getElementById('advSearchResults');
  if (container) container.innerHTML = `
    <div class="col-span-full text-center py-16 text-blue-300/30">
      <i class="fas fa-search text-5xl mb-4 block opacity-10"></i>
      <p>Utilisez les filtres ci-dessus pour rechercher des documents</p>
    </div>`;
}

function _roleIcon(key) {
  const icons = { admin: 'fa-crown', manager: 'fa-user-tie', editor: 'fa-pen', viewer: 'fa-eye' };
  return icons[key] || 'fa-user-shield';
}

async function showVersionHistory(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;

  _versioning.currentDocId = docId;

  // Charger l'historique depuis audit_logs
  let history = [];
  if (G.supabase) {
    try {
      const { data } = await G.supabase
        .from('audit_logs')
        .select('*')
        .eq('target_id', docId)
        .in('action', ['upload', 'version_create', 'update', 'version_restore'])
        .order('created_at', { ascending: false });
      history = data || [];
    } catch (_) {}
  }
  _versioning.history = history;

  // Créer/afficher le modal
  let modal = document.getElementById('versionHistoryModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'versionHistoryModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-box" style="max-width:680px;">
      <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 border border-cyan-500/30">
            <i class="fas fa-code-branch"></i>
          </div>
          <div>
            <h3 class="text-white font-bold">Historique des versions</h3>
            <p class="text-blue-300/50 text-xs truncate max-w-[300px]">${escapeHtml(doc.name)}</p>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="createNewVersion('${docId}')"
            class="px-4 py-2 rounded-xl btn-primary text-white text-sm font-semibold flex items-center gap-2">
            <i class="fas fa-plus"></i>Créer version
          </button>
          <button onclick="document.getElementById('versionHistoryModal').classList.add('hidden')"
            class="text-blue-400 hover:text-white p-2 rounded-lg">
            <i class="fas fa-times text-xl"></i>
          </button>
        </div>
      </div>

      <!-- Version courante -->
      <div class="glass-card rounded-xl p-4 border border-cyan-500/30 mb-4" style="background:rgba(6,182,212,0.05)">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-sm">
              v${doc.version || 1}
            </div>
            <div>
              <p class="text-white text-sm font-semibold">Version actuelle</p>
              <p class="text-xs text-blue-300/60">${formatDate(doc.updated_at || doc.created_at)} · ${formatBytes(doc.size)}</p>
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="downloadDocument('${doc.id}')"
              class="p-2 rounded-lg hover:bg-cyan-500/20 text-cyan-400 transition-all" title="Télécharger">
              <i class="fas fa-download text-sm"></i>
            </button>
            <button onclick="openPreviewModal('${doc.id}')"
              class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-all" title="Aperçu">
              <i class="fas fa-eye text-sm"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Historique -->
      <div class="space-y-2 max-h-[360px] overflow-y-auto pr-1">
        ${history.length > 0 ? history.map((entry, idx) => `
          <div class="glass-card rounded-xl p-3 border border-blue-500/15 hover:border-blue-400/30 transition-all">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-300/70 text-xs font-bold flex-shrink-0">
                ${_getVersionActionIcon(entry.action)}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <p class="text-white text-sm font-medium">${_getVersionActionLabel(entry.action)}</p>
                  <span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300">${formatDate(entry.created_at)}</span>
                </div>
                ${entry.details ? `<p class="text-xs text-blue-300/50 mt-0.5 truncate">${escapeHtml(entry.details)}</p>` : ''}
              </div>
              ${entry.action === 'upload' || entry.action === 'version_create' ? `
              <button onclick="restoreVersion('${docId}', '${entry.id}')"
                class="px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 text-xs hover:bg-purple-500/30 flex-shrink-0 flex items-center gap-1 transition-all">
                <i class="fas fa-rotate-left"></i>Restaurer
              </button>` : ''}
            </div>
          </div>`).join('') : `
          <div class="text-center py-8 text-blue-300/40">
            <i class="fas fa-history text-3xl mb-3 block opacity-20"></i>
            <p>Aucun historique disponible</p>
            <p class="text-xs mt-1">Les modifications futures seront enregistrées ici</p>
          </div>`}
      </div>
    </div>`;

  modal.classList.remove('hidden');
}

function exportSearchResults() {
  if (!_search.lastResults.length) { showToast('Aucun résultat à exporter', 'warning'); return; }
  function csvCell(v) {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  const headers = ['Nom', 'Type', 'Taille', 'Portée', 'Tags', 'Créé le'];
  const rows = _search.lastResults.map(d => [
    d.name, d.type, formatBytes(d.size), d.scope, (d.tags||[]).join(';'), d.created_at
  ].map(csvCell));
  const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `recherche_${Date.now()}.csv` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('Résultats exportés en CSV', 'success');
}

function createRoleV7() {
  const input = document.getElementById('newRoleName');
  const name  = input?.value.trim();
  if (!name) { showToast('Entrez un nom de rôle', 'warning'); return; }

  const roleKey = name.toLowerCase().replace(/[\s\-]/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!roleKey) { showToast('Nom invalide', 'warning'); return; }
  if (G.roles[roleKey]) { showToast(`Le rôle "${name}" existe déjà`, 'warning'); return; }

  G.roles[roleKey] = { name, perms: ['read'] };
  if (input) input.value = '';
  renderRBAC();
  renderRBACV7();
  showToast(`Rôle "${name}" créé (permissions : lecture seule par défaut)`, 'success');

  // Ouvrir directement le modal d'édition
  openRoleModal(roleKey);
}

function _auditSeverityToLevel(severity) {
  const map = { critical: 'error', warning: 'warn', info: 'info', security: 'security' };
  return map[severity] || 'info';
}

function sysLogsPrevPage() {
  if (_sysLogs.page > 1) { _sysLogs.page--; _renderSysLogsPage(); }
}

async function restoreVersion(docId, auditEntryId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;

  if (!confirm(`Restaurer une version précédente de "${doc.name}" ?\nLa version actuelle (v${doc.version || 1}) sera conservée dans l'historique.`)) return;

  try {
    // On incrémente la version (la "restauration" crée une nouvelle version)
    const newVersion = (doc.version || 1) + 1;
    const { error } = await G.supabase
      .from('documents')
      .update({ version: newVersion, updated_at: new Date().toISOString() })
      .eq('id', docId);

    if (error) throw error;

    doc.version    = newVersion;
    doc.updated_at = new Date().toISOString();

    await addAuditLog('version_restore', 'document', docId,
      `Restauré depuis entrée audit ${auditEntryId || 'manuelle'} → v${newVersion}`);

    showToast(`Version restaurée (v${newVersion})`, 'success');
    document.getElementById('versionHistoryModal')?.classList.add('hidden');
    renderVersioning();

  } catch (err) {
    showToast('Erreur restauration : ' + err.message, 'error');
  }
}

async function downloadVersion(docId) {
  downloadDocument(docId); // Fallback : télécharge la version courante
}

async function runFTSearch() {
  const query      = document.getElementById('ftsInput')?.value.trim() || '';
  const type       = document.getElementById('ftsType')?.value || '';
  const dateFilter = document.getElementById('ftsDate')?.value || '';
  const container  = document.getElementById('searchV7Results');
  const countSpan  = document.getElementById('ftsCount');

  if (!query || query.length < 2) {
    if (container) container.innerHTML = `
      <div class="text-center py-20 text-blue-300/30">
        <i class="fas fa-search text-6xl mb-5 block opacity-10"></i>
        <p class="text-lg">Tapez au moins 2 caractères pour rechercher</p>
      </div>`;
    return;
  }

  if (container) container.innerHTML = `<div class="col-span-full text-center py-12"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i></div>`;

  // Rechargement Supabase
  if (G.supabase && G.currentUser?.companyId) {
    try {
      const { data } = await G.supabase
        .from('documents')
        .select('*')
        .eq('company_id', G.currentUser.companyId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      if (data) G.documents = data;
    } catch (_) {}
  }

  const q = query.toLowerCase();
  let results = G.documents.filter(d =>
    !d.is_deleted && (
      d.name.toLowerCase().includes(q) ||
      (d.description && d.description.toLowerCase().includes(q)) ||
      (Array.isArray(d.tags) && d.tags.some(t => t.toLowerCase().includes(q)))
    )
  );

  if (type) results = results.filter(d => d.type === type);

  if (dateFilter === 'today') {
    results = results.filter(d => new Date(d.created_at).toDateString() === new Date().toDateString());
  } else if (dateFilter === 'week') {
    const ago = new Date(); ago.setDate(ago.getDate() - 7);
    results = results.filter(d => new Date(d.created_at) >= ago);
  } else if (dateFilter === 'month') {
    const ago = new Date(); ago.setDate(ago.getDate() - 30);
    results = results.filter(d => new Date(d.created_at) >= ago);
  }

  if (countSpan) countSpan.textContent = `${results.length} résultat(s)`;

  if (!container) return;
  if (results.length === 0) {
    container.innerHTML = `<div class="text-center py-12 text-blue-300/50"><i class="fas fa-search text-4xl mb-3 block opacity-20"></i><p>Aucun résultat pour "<strong>${escapeHtml(query)}</strong>"</p></div>`;
  } else {
    container.innerHTML = `<div class="doc-grid">${results.map(doc => renderDocCard(doc)).join('')}</div>`;
  }
}

async function saveRole() {
  const roleKey  = document.getElementById('roleModalKey')?.value;
  const roleName = document.getElementById('roleModalName')?.value?.trim();
  if (!roleKey || !roleName) { showToast('Nom de rôle requis', 'warning'); return; }

  const allPerms = ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users'];
  const perms    = allPerms.filter(p => document.getElementById(`perm_${p}`)?.checked);

  const btn = document.querySelector('#roleModal button[onclick="saveRole()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner mr-2"></span>Enregistrement…'; }

  try {
    // Persister dans Supabase (table company_roles si elle existe, sinon on garde en mémoire)
    if (G.supabase && G.currentUser?.companyId) {
      try {
        await G.supabase.from('company_roles').upsert({
          role_key:   roleKey,
          name:       roleName,
          perms:      perms,
          company_id: G.currentUser.companyId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'role_key,company_id' });
      } catch (_) {
        // Table company_roles peut ne pas exister — on continue quand même
        console.warn('company_roles upsert failed (non-blocking)');
      }
    }

    // Mettre à jour l'état en mémoire
    G.roles[roleKey] = { name: roleName, perms };

    await addAuditLog('role_update', 'role', roleKey,
      `Rôle "${roleName}" mis à jour — permissions : ${perms.join(', ')}`);

    showToast(`Rôle "${roleName}" mis à jour`, 'success');
    closeRoleModal();
    renderRBAC();
    renderRBACV7();

  } catch (err) {
    showToast('Erreur sauvegarde rôle : ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Enregistrer'; }
  }
}

function exportSysLogs() {
  const data = JSON.stringify(_sysLogs.allLogs || G.systemLogs, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `system_logs_${new Date().toISOString().slice(0, 10)}.json`
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('Logs exportés', 'success');
}

async function updateUserRole(userId, newRole) {
  if (!newRole) return;
  const user = G.users.find(u => u.id === userId);
  if (!user) return;

  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    const { error } = await G.supabase
      .from('profiles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;

    user.role = newRole;
    showToast(`Rôle de ${user.name} → ${G.roles[newRole]?.name || newRole}`, 'success');
    await addAuditLog('role_change', 'user', userId, `Nouveau rôle : ${newRole}`);

    renderRBACV7();

  } catch (err) {
    showToast('Erreur mise à jour rôle : ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Appliquer'; }
  }
}

function getLogLevelColor(level) {
  const colors = { info: 'text-blue-400', warn: 'text-yellow-400', error: 'text-red-400', security: 'text-orange-400' };
  return colors[level] || 'text-gray-400';
}

async function compareVersions(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  showToast(`Comparaison des versions pour "${doc.name}" — fonctionnalité diff disponible avec l'IA`, 'info');
}

async function renderRBAC() {
  // Rechargement utilisateurs depuis Supabase
  if (G.supabase && G.currentUser?.companyId) {
    try {
      const { data } = await G.supabase
        .from('profiles')
        .select('*')
        .eq('company_id', G.currentUser.companyId);
      if (data) G.users = data;
    } catch (_) {}
  }

  const container = document.getElementById('rbacCards');
  if (!container) return;

  container.innerHTML = Object.entries(G.roles).map(([key, role]) => {
    const userCount = G.users.filter(u => u.role === key).length;
    const colorMap  = { admin: 'red', manager: 'orange', editor: 'blue', viewer: 'gray' };
    const color     = colorMap[key] || 'purple';
    return `
    <div class="glass-card rounded-xl p-5 border border-${color}-500/25 hover:border-${color}-400/45 cursor-pointer transition-all group"
         onclick="openRoleModal('${key}')">
      <div class="flex items-center justify-between mb-3">
        <div class="w-10 h-10 rounded-lg bg-${color}-500/20 flex items-center justify-center text-${color}-400">
          <i class="fas ${_roleIcon(key)} text-lg"></i>
        </div>
        <span class="text-xs px-2 py-1 rounded-full bg-${color}-500/15 text-${color}-400 font-medium">
          ${userCount} user${userCount > 1 ? 's' : ''}
        </span>
      </div>
      <h4 class="text-white font-bold mb-1">${escapeHtml(role.name)}</h4>
      <div class="flex flex-wrap gap-1 mt-2">
        ${role.perms.slice(0, 4).map(p =>
          `<span class="text-[10px] px-1.5 py-0.5 rounded bg-${color}-500/15 text-${color}-300/70">${p}</span>`
        ).join('')}
        ${role.perms.length > 4 ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300/70">+${role.perms.length - 4}</span>` : ''}
      </div>
      <div class="mt-3 pt-3 border-t border-blue-500/10 flex items-center justify-between">
        <span class="text-xs text-blue-300/40">${role.perms.length} permission${role.perms.length > 1 ? 's' : ''}</span>
        <span class="text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
          <i class="fas fa-edit mr-1"></i>Modifier
        </span>
      </div>
    </div>`;
  }).join('');
}

async function filterVersionDocs(query) {
  const container = document.getElementById('versionDocList');
  if (!container) return;

  // Si pas de query, rechargement complet
  if (!query || !query.trim()) { renderVersioning(); return; }

  const q = query.toLowerCase();
  let docs = G.documents.filter(d =>
    !d.is_deleted &&
    (d.name.toLowerCase().includes(q) || (d.description && d.description.toLowerCase().includes(q)))
  );

  if (docs.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 text-blue-300/50">
        <i class="fas fa-search text-4xl mb-3 block opacity-20"></i>
        <p>Aucun document trouvé pour "<strong>${escapeHtml(query)}</strong>"</p>
      </div>`;
    return;
  }

  container.innerHTML = docs.map(doc => {
    const owner = G.users.find(u => u.id === doc.owner_id);
    return `
    <div class="version-doc-card glass-card rounded-xl p-4 border border-cyan-500/20 hover:border-cyan-400/40 transition-all">
      <div class="flex items-center gap-3">
        <div class="w-11 h-11 rounded-xl bg-cyan-500/15 flex items-center justify-center flex-shrink-0">
          <i class="fas ${getFileIcon(doc.type).split(' ')[0]} ${getFileIcon(doc.type).split(' ')[1] || 'text-cyan-400'}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-white font-semibold text-sm truncate">${escapeHtml(doc.name)}</p>
          <div class="flex items-center gap-2 mt-0.5 text-xs text-blue-300/60">
            <span>v${doc.version || 1}</span>
            <span>·</span>
            <span>${formatDate(doc.updated_at || doc.created_at)}</span>
            <span>·</span>
            <span>${owner?.name || 'Inconnu'}</span>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="showVersionHistory('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs hover:bg-cyan-500/30 flex items-center gap-1">
            <i class="fas fa-history"></i>Historique
          </button>
          <button onclick="createNewVersion('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 flex items-center gap-1">
            <i class="fas fa-plus"></i>Nouvelle v.
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function _getVersionActionLabel(action) {
  const labels = {
    upload:          'Import initial',
    version_create:  'Nouvelle version créée',
    update:          'Document modifié',
    version_restore: 'Version restaurée',
  };
  return labels[action] || action;
}

function _updateSysLogsStats() {
  const all = _sysLogs.allLogs;
  const counts = {
    error: all.filter(l => l.level === 'error').length,
    warn:  all.filter(l => l.level === 'warn').length,
    info:  all.filter(l => l.level === 'info').length,
    security: all.filter(l => l.level === 'security').length,
  };
  // Update badges if they exist
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('logCountError',    counts.error);
  setEl('logCountWarn',     counts.warn);
  setEl('logCountInfo',     counts.info);
  setEl('logCountSecurity', counts.security);
  setEl('logCountTotal',    all.length);
}

function filterLogs(level) {
  _sysLogs.filter = level || 'all';
  _sysLogs.page   = 1;

  document.querySelectorAll('.log-filter').forEach(btn => {
    const isActive = btn.dataset.lf === level || (!level && btn.dataset.lf === 'all');
    btn.classList.toggle('bg-blue-500/20',   isActive);
    btn.classList.toggle('text-blue-300',    isActive);
    btn.classList.toggle('border-blue-500/30', isActive);
    btn.classList.toggle('text-gray-400',    !isActive);
    btn.classList.toggle('border-blue-500/10', !isActive);
  });

  _renderSysLogsPage();
}

async function renderRBACV7() {
  await renderRBAC(); // rechargement users inclus

  // Matrix permissions
  const matrixContainer = document.getElementById('rbacV7PermMatrix');
  if (matrixContainer) {
    const allPerms = ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users'];
    const permLabels = {
      read: '👁 Lire', write: '✏ Écrire', delete: '🗑 Supprimer',
      users: '👥 Gérer users', logs: '📋 Logs', api: '🔑 API',
      billing: '💳 Facturation', signatures: '✍ Signatures', validate_users: '✅ Valider users'
    };

    matrixContainer.innerHTML = Object.entries(G.roles).map(([key, role]) => `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20">
        <div class="flex items-center gap-2 mb-3">
          <i class="fas ${_roleIcon(key)} text-purple-400"></i>
          <h4 class="text-white font-semibold text-sm">${escapeHtml(role.name)}</h4>
        </div>
        <div class="space-y-1">
          ${allPerms.map(perm => `
            <div class="flex items-center justify-between py-0.5">
              <span class="text-xs text-blue-300/60">${permLabels[perm] || perm}</span>
              <span class="text-xs ${role.perms.includes(perm) ? 'text-green-400' : 'text-red-400/50'}">
                <i class="fas ${role.perms.includes(perm) ? 'fa-check-circle' : 'fa-times-circle'}"></i>
              </span>
            </div>`).join('')}
        </div>
      </div>`).join('');
  }

  // Grille rôles éditables
  const rolesGrid = document.getElementById('rbacV7RolesGrid');
  if (rolesGrid) {
    rolesGrid.innerHTML = Object.entries(G.roles).map(([key, role]) => `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20 hover:border-blue-400/40 transition-all">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <i class="fas ${_roleIcon(key)} text-purple-400"></i>
            <h4 class="text-white font-semibold text-sm">${escapeHtml(role.name)}</h4>
          </div>
          <button onclick="openRoleModal('${key}')"
            class="text-xs text-blue-400 hover:text-blue-300 p-1 rounded-lg hover:bg-blue-500/10 transition-all">
            <i class="fas fa-edit"></i>
          </button>
        </div>
        <p class="text-xs text-blue-300/50">${G.users.filter(u => u.role === key).length} utilisateur(s)</p>
        <div class="mt-2 flex flex-wrap gap-1">
          ${role.perms.map(p => `<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300/70">${p}</span>`).join('')}
        </div>
      </div>`).join('');
  }

  // Table assignations
  const assignmentList = document.getElementById('roleAssignmentList');
  if (assignmentList) {
    if (G.users.length === 0) {
      assignmentList.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-blue-300/50">Aucun utilisateur</td></tr>';
    } else {
      assignmentList.innerHTML = G.users.map(user => `
        <tr class="border-b border-blue-500/10 hover:bg-blue-500/5 transition-colors">
          <td class="p-3">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-300 text-sm font-bold">
                ${(user.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div>
                <p class="text-white text-sm">${escapeHtml(user.name || '—')}</p>
                <p class="text-xs text-blue-300/50">${escapeHtml(user.email || '')}</p>
              </div>
            </div>
          </td>
          <td class="p-3">
            <span class="px-2 py-1 rounded-full text-xs ${getRoleBadgeClass(user.role)}">
              ${G.roles[user.role]?.name || user.role}
            </span>
          </td>
          <td class="p-3">
            <select id="roleSelect_${user.id}" onchange="_previewRoleChange('${user.id}', this.value)"
              class="bg-slate-900/50 border border-blue-500/30 rounded-lg px-2 py-1 text-xs text-white outline-none">
              ${Object.entries(G.roles).map(([key, role]) =>
                `<option value="${key}" ${user.role === key ? 'selected' : ''}>${escapeHtml(role.name)}</option>`
              ).join('')}
            </select>
          </td>
          <td class="p-3">
            <button onclick="updateUserRole('${user.id}', document.getElementById('roleSelect_${user.id}').value)"
              class="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 transition-all">
              Appliquer
            </button>
          </td>
        </tr>`).join('');
    }
  }
}

async function runAdvSearch() {
  const query      = document.getElementById('advSearchInput')?.value.trim().toLowerCase() || '';
  const type       = document.getElementById('advSearchType')?.value || '';
  const dateFilter = document.getElementById('advSearchDate')?.value || '';
  const sizeFilter = document.getElementById('advSearchSize')?.value || '';
  const ownerFilter= document.getElementById('advSearchOwner')?.value || '';
  const container  = document.getElementById('advSearchResults');
  const countSpan  = document.getElementById('advSearchCount');

  // Loader
  if (container) container.innerHTML = `
    <div class="col-span-full text-center py-12">
      <i class="fas fa-spinner fa-spin text-3xl text-blue-400"></i>
      <p class="mt-2 text-blue-300/60">Recherche en cours…</p>
    </div>`;

  // Rechargement Supabase
  if (G.supabase && G.currentUser?.companyId) {
    try {
      const { data, error } = await G.supabase
        .from('documents')
        .select('*')
        .eq('company_id', G.currentUser.companyId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      if (!error && data) G.documents = data;
    } catch (e) {
      console.warn('runAdvSearch reload failed:', e);
    }
  }

  let results = G.documents.filter(d => !d.is_deleted);

  // Filtre texte (nom + description + tags)
  if (query) {
    results = results.filter(d =>
      d.name.toLowerCase().includes(query) ||
      (d.description && d.description.toLowerCase().includes(query)) ||
      (Array.isArray(d.tags) && d.tags.some(t => t.toLowerCase().includes(query)))
    );
  }

  // Filtre type
  if (type) results = results.filter(d => d.type === type);

  // Filtre propriétaire
  if (ownerFilter === 'mine') results = results.filter(d => d.owner_id === G.currentUser.id);
  else if (ownerFilter === 'others') results = results.filter(d => d.owner_id !== G.currentUser.id);

  // Filtre date
  if (dateFilter === 'today') {
    const today = new Date().toDateString();
    results = results.filter(d => new Date(d.created_at).toDateString() === today);
  } else if (dateFilter === 'week') {
    const ago = new Date(); ago.setDate(ago.getDate() - 7);
    results = results.filter(d => new Date(d.created_at) >= ago);
  } else if (dateFilter === 'month') {
    const ago = new Date(); ago.setDate(ago.getDate() - 30);
    results = results.filter(d => new Date(d.created_at) >= ago);
  }

  // Filtre taille
  if (sizeFilter === 'small')  results = results.filter(d => d.size < 1024 * 1024);
  if (sizeFilter === 'medium') results = results.filter(d => d.size >= 1024 * 1024 && d.size < 10 * 1024 * 1024);
  if (sizeFilter === 'large')  results = results.filter(d => d.size >= 10 * 1024 * 1024);

  // Sauvegarder pour usage ultérieur (export, etc.)
  _search.lastQuery   = query;
  _search.lastResults = results;

  // MAJ compteur
  if (countSpan) countSpan.textContent = `${results.length} résultat(s)`;

  if (!container) return;

  if (results.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 text-blue-300/50">
        <i class="fas fa-search text-4xl mb-3 block opacity-20"></i>
        <p class="text-lg">Aucun résultat${query ? ` pour "<strong>${escapeHtml(query)}</strong>"` : ''}</p>
        <p class="text-sm mt-2 text-blue-400/50">Essayez d'autres mots-clés ou modifiez vos filtres</p>
      </div>`;
  } else {
    container.innerHTML = `<div class="doc-grid">${results.map(doc => renderDocCard(doc)).join('')}</div>`;
  }
}

async function renderSysLogs() {
  const container = document.getElementById('sysLogConsole');
  if (!container) return;

  // Rechargement Supabase
  if (G.supabase && G.currentUser) {
    try {
      const isAdmin = G.currentUser.isSystemAdmin || G.currentUser.role === 'admin';

      // system_logs (admins seulement) + audit_logs toujours
      const queries = [
        G.supabase.from('audit_logs').select('*').eq('user_id', G.currentUser.id)
          .order('created_at', { ascending: false }).limit(500),
      ];

      if (isAdmin) {
        queries.push(
          G.supabase.from('system_logs').select('*')
            .order('created_at', { ascending: false }).limit(200)
        );
      }

      const results = await Promise.all(queries);

      // Fusionner audit_logs + system_logs en un flux unifié
      const auditData  = results[0].data || [];
      const systemData = isAdmin && results[1] ? (results[1].data || []) : [];

      // Normaliser les champs
      const normalized = [
        ...auditData.map(l => ({
          id:         l.id,
          level:      _auditSeverityToLevel(l.severity || 'info'),
          action:     l.action,
          message:    l.details || l.action || '',
          target_type:l.target_type || '',
          created_at: l.created_at,
          source:     'audit',
        })),
        ...systemData.map(l => ({
          id:         l.id,
          level:      l.level || 'info',
          action:     l.action || '',
          message:    l.message || l.details || l.action || '',
          target_type:l.target_type || '',
          created_at: l.created_at,
          source:     'system',
        })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      G.systemLogs = normalized;
      _sysLogs.allLogs = normalized;

    } catch (e) {
      console.warn('renderSysLogs reload failed:', e);
    }
  } else {
    _sysLogs.allLogs = G.systemLogs || [];
  }

  _renderSysLogsPage();
  _updateSysLogsStats();
}

function renderSearchV7() {
  if (document.getElementById('ftsInput')?.value.trim()) runFTSearch();
}

function searchSysLogs(query) {
  _sysLogs.searchQuery = (query || '').trim();
  _sysLogs.page = 1;
  _renderSysLogsPage();
}

async function confirmCreateNewVersion(docId) {
  const doc  = G.documents.find(d => d.id === docId);
  if (!doc) return;
  const note = document.getElementById('newVersionNote')?.value.trim() || '';
  const file = window._pendingVersionFile;

  const newVersion = (doc.version || 1) + 1;

  const btn = document.querySelector('#createVersionModal button[onclick^="confirmCreate"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner mr-2"></span>Enregistrement…'; }

  try {
    // Si nouveau fichier → upload
    if (file && G.supabase) {
      const fileExt     = file.name.split('.').pop().toLowerCase();
      const storagePath = `${G.currentUser.companyId}/${docId}_v${newVersion}.${fileExt}`;
      const { error: uploadErr } = await G.supabase.storage
        .from(CONFIG.storageBucket)
        .upload(storagePath, file, { cacheControl: '3600', upsert: true });
      if (!uploadErr) {
        const { data: urlData } = G.supabase.storage.from(CONFIG.storageBucket).getPublicUrl(storagePath);
        doc.file_url      = urlData.publicUrl;
        doc.storage_path  = storagePath;
        doc.size          = file.size;
        doc.type          = getFileType(file.name);
      }
    }

    // Mise à jour version en base
    if (G.supabase) {
      const { error } = await G.supabase
        .from('documents')
        .update({
          version:    newVersion,
          updated_at: new Date().toISOString(),
          ...(file ? { size: file.size, storage_path: doc.storage_path, file_url: doc.file_url } : {})
        })
        .eq('id', docId);
      if (error) throw error;
    }

    doc.version    = newVersion;
    doc.updated_at = new Date().toISOString();

    await addAuditLog('version_create', 'document', docId,
      `v${newVersion} créée${note ? ' : ' + note : ''}${file ? ' — nouveau fichier' : ''}`);

    showToast(`✅ Version v${newVersion} créée`, 'success');
    window._pendingVersionFile = null;
    document.getElementById('createVersionModal')?.classList.add('hidden');
    document.getElementById('versionHistoryModal')?.classList.add('hidden');
    renderVersioning();

  } catch (err) {
    showToast('Erreur création version : ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-plus mr-2"></i>Créer la version v${newVersion}`; }
  }
}

function closeRoleModal() {
  const modal = document.getElementById('roleModal');
  if (modal) modal.classList.add('hidden');
  _rbac.editingRole = null;
}

function _renderSysLogsPage() {
  const container = document.getElementById('sysLogConsole');
  if (!container) return;

  let logs = _sysLogs.allLogs;

  // Filtre niveau
  if (_sysLogs.filter !== 'all') logs = logs.filter(l => l.level === _sysLogs.filter);

  // Filtre recherche
  if (_sysLogs.searchQuery) {
    const q = _sysLogs.searchQuery.toLowerCase();
    logs = logs.filter(l =>
      (l.message || '').toLowerCase().includes(q) ||
      (l.action  || '').toLowerCase().includes(q) ||
      (l.target_type || '').toLowerCase().includes(q)
    );
  }

  // Pagination
  const total   = logs.length;
  const pages   = Math.max(1, Math.ceil(total / _sysLogs.pageSize));
  const page    = Math.min(_sysLogs.page, pages);
  const start   = (page - 1) * _sysLogs.pageSize;
  const paged   = logs.slice(start, start + _sysLogs.pageSize);

  // Mettre à jour pagination UI
  const pageInfo = document.getElementById('sysLogPageInfo');
  const pagePrev = document.getElementById('sysLogPrev');
  const pageNext = document.getElementById('sysLogNext');
  if (pageInfo) pageInfo.textContent = `Page ${page} / ${pages}  (${total} entrée${total > 1 ? 's' : ''})`;
  if (pagePrev) pagePrev.disabled = page <= 1;
  if (pageNext) pageNext.disabled = page >= pages;

  if (paged.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-blue-300/40 text-sm">
        <i class="fas fa-check-circle text-2xl text-green-400/40 mb-2 block"></i>
        Aucun log${_sysLogs.filter !== 'all' ? ` de niveau "${_sysLogs.filter}"` : ''}
        ${_sysLogs.searchQuery ? ` pour "${escapeHtml(_sysLogs.searchQuery)}"` : ''}
      </div>`;
    return;
  }

  container.innerHTML = paged.map(l => {
    const levelColor = getLogLevelColor(l.level);
    const time = l.created_at ? new Date(l.created_at).toLocaleTimeString('fr-FR') : '';
    const date = l.created_at ? new Date(l.created_at).toLocaleDateString('fr-FR') : '';
    const msg  = escapeHtml(l.message || l.action || '—');
    return `
    <div class="log-entry flex items-start gap-2 py-1.5 px-2 text-xs hover:bg-blue-500/5 rounded transition-colors border-b border-blue-500/5">
      <span class="text-blue-300/30 flex-shrink-0 w-[105px]">[${date} ${time}]</span>
      <span class="flex-shrink-0 w-20">
        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase
          ${l.level === 'error' ? 'bg-red-500/20 text-red-400' :
            l.level === 'warn'  ? 'bg-yellow-500/20 text-yellow-400' :
            l.level === 'security' ? 'bg-orange-500/20 text-orange-400' :
            'bg-blue-500/15 text-blue-400'}">
          ${l.level}
        </span>
      </span>
      ${l.source === 'audit' ? '<span class="flex-shrink-0 text-purple-400/50 text-[10px] w-10">audit</span>' : '<span class="flex-shrink-0 text-teal-400/50 text-[10px] w-10">sys</span>'}
      <span class="flex-1 text-blue-200/80 break-words">${msg}</span>
      ${l.target_type ? `<span class="flex-shrink-0 text-blue-300/40 text-[10px]">${l.target_type}</span>` : ''}
    </div>`;
  }).join('');
}

function clearSysLogs() {
  _sysLogs.filter = 'all';
  _sysLogs.searchQuery = '';
  _sysLogs.page = 1;
  G.systemLogs = [];
  _sysLogs.allLogs = [];
  const container = document.getElementById('sysLogConsole');
  if (container) container.innerHTML = '<div class="text-center py-8 text-blue-300/40 text-sm"><i class="fas fa-check-circle text-2xl text-green-400/40 mb-2 block"></i>Logs effacés</div>';
  showToast('Logs effacés de la vue', 'info');
}

async function createNewVersion(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;

  // Modal simplifié pour upload du nouveau fichier
  let modal = document.getElementById('createVersionModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'createVersionModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-box" style="max-width:520px;">
      <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/30">
            <i class="fas fa-plus"></i>
          </div>
          <div>
            <h3 class="text-white font-bold">Créer une nouvelle version</h3>
            <p class="text-blue-300/50 text-xs">${escapeHtml(doc.name)} · Version actuelle : v${doc.version || 1}</p>
          </div>
        </div>
        <button onclick="document.getElementById('createVersionModal').classList.add('hidden')"
          class="text-blue-400 hover:text-white p-2 rounded-lg"><i class="fas fa-times text-xl"></i></button>
      </div>

      <div class="space-y-4">
        <div>
          <label class="text-blue-200/70 text-xs font-medium block mb-1">Note de version</label>
          <input type="text" id="newVersionNote" placeholder="Ex: Corrections page 3, mise à jour données Q3…"
            class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
            style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);">
        </div>
        <div>
          <label class="text-blue-200/70 text-xs font-medium block mb-2">Nouveau fichier (optionnel)</label>
          <div class="border-2 border-dashed border-blue-500/30 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400/50 transition-all"
            onclick="document.getElementById('newVersionFileInput').click()">
            <i class="fas fa-cloud-upload-alt text-2xl text-blue-400/50 block mb-2"></i>
            <p class="text-blue-300/60 text-sm">Cliquez ou glissez un fichier</p>
            <p class="text-blue-400/40 text-xs mt-1">Remplace le fichier actuel pour cette version</p>
          </div>
          <input type="file" id="newVersionFileInput" class="hidden"
            onchange="handleNewVersionFile(this, '${docId}')">
          <p id="newVersionFileName" class="text-xs text-green-400 mt-2 hidden"></p>
        </div>
      </div>

      <div class="flex gap-3 mt-5 pt-4 border-t border-blue-500/20">
        <button onclick="document.getElementById('createVersionModal').classList.add('hidden')"
          class="flex-1 py-2.5 rounded-xl text-blue-300 text-sm border border-blue-500/25 hover:bg-blue-500/10 transition-all">
          Annuler
        </button>
        <button onclick="confirmCreateNewVersion('${docId}')"
          class="flex-1 btn-primary py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2">
          <i class="fas fa-plus"></i>Créer la version v${(doc.version || 1) + 1}
        </button>
      </div>
    </div>`;

  modal.classList.remove('hidden');
}

function handleNewVersionFile(input, docId) {
  const file = input.files[0];
  if (!file) return;
  const label = document.getElementById('newVersionFileName');
  if (label) {
    label.textContent = `✅ ${file.name} (${formatBytes(file.size)})`;
    label.classList.remove('hidden');
  }
  // Store file reference
  window._pendingVersionFile = file;
}


// ─── Utilitaires ───
async function addAuditLog(action, targetType, targetId, details = '') {
 if (G._isDemo) return; // Mode démo : pas d'écriture Supabase
  try {
    const log = {
      id: generateId(),
      user_id: G.currentUser.id,
      user_email: G.currentUser.email,
      action: action,
      target_type: targetType,
      target_id: targetId,
      details: details,
      severity: ['delete', 'validate_user', 'account_deletion_request', 'role_change'].includes(action) ? 'warning' : 'info',
      created_at: new Date().toISOString()
    };

    const { error } = await G.supabase.from('audit_logs').insert(log);
    if (!error) {
      if (!G.auditLogs) G.auditLogs = [];
      G.auditLogs.unshift(log);
      if (G.auditLogs.length > 500) G.auditLogs.pop();
    }
  } catch (err) {
    console.warn('addAuditLog error (non-blocking):', err);
  }
}

// ─── Rich Editor ───
function openRichEditor(docId) {
  showToast('Éditeur riche en développement', 'info');
}

function closeRichEditor() {
  const modal = document.getElementById('richEditorModal');
  if (modal) modal.classList.add('hidden');
}

function _onRichEditorInput() {}
function _saveRichContent() {}

// ─── Utilitaires ───
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
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
  const map = {
    img:    { icon: 'fa-file-image',       color: 'text-purple-400' },
    image:  { icon: 'fa-file-image',       color: 'text-purple-400' },
    video:  { icon: 'fa-file-video',       color: 'text-pink-400' },
    audio:  { icon: 'fa-file-audio',       color: 'text-green-400' },
    code:   { icon: 'fa-file-code',        color: 'text-cyan-400' },
    zip:    { icon: 'fa-file-archive',     color: 'text-yellow-400' },
    txt:    { icon: 'fa-file-alt',         color: 'text-gray-400' },
    unknown:{ icon: 'fa-file',             color: 'text-blue-400/70' },
    pdf: { icon: 'fa-file-pdf', color: 'text-red-400' },
    doc: { icon: 'fa-file-word', color: 'text-blue-400' },
    docx: { icon: 'fa-file-word', color: 'text-blue-400' },
    xls: { icon: 'fa-file-excel', color: 'text-green-400' },
    xlsx: { icon: 'fa-file-excel', color: 'text-green-400' },
    ppt: { icon: 'fa-file-powerpoint', color: 'text-orange-400' },
    pptx: { icon: 'fa-file-powerpoint', color: 'text-orange-400' },
    png: { icon: 'fa-file-image', color: 'text-purple-400' },
    jpg: { icon: 'fa-file-image', color: 'text-purple-400' },
    jpeg: { icon: 'fa-file-image', color: 'text-purple-400' },
    gif: { icon: 'fa-file-image', color: 'text-purple-400' },
    txt: { icon: 'fa-file-alt', color: 'text-gray-400' },
    zip: { icon: 'fa-file-archive', color: 'text-yellow-400' },
    mp4: { icon: 'fa-file-video', color: 'text-pink-400' },
    mp3: { icon: 'fa-file-audio', color: 'text-green-400' },
    json: { icon: 'fa-file-code', color: 'text-cyan-400' },
    html: { icon: 'fa-file-code', color: 'text-cyan-400' },
    css: { icon: 'fa-file-code', color: 'text-cyan-400' },
    js: { icon: 'fa-file-code', color: 'text-cyan-400' }
  };
  const m = map[type] || { icon: 'fa-file', color: 'text-blue-400' };
  return `${m.icon} ${m.color}`;
}

function getFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const types = { 
    pdf: 'pdf',
    doc: 'doc',
    docx: 'doc',
    xls: 'xls',
    xlsx: 'xls',
    ppt: 'ppt',
    pptx: 'ppt',
    png: 'img',
    jpg: 'img',
    jpeg: 'img',
    gif: 'img',
    webp: 'img',
    svg: 'img',
    txt: 'txt',
    zip: 'zip',
    rar: 'zip',
    mp4: 'video',
    mp3: 'audio',
    json: 'code',
    xml: 'code',
    html: 'code',
    css: 'code',
    js: 'code'
  };
  return types[ext] || 'unknown';
}

function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const styles = {
    success: { bg: 'rgba(16,185,129,0.95)', icon: 'fa-check-circle',       border: 'rgba(16,185,129,0.4)' },
    error:   { bg: 'rgba(239,68,68,0.95)',  icon: 'fa-exclamation-circle',  border: 'rgba(239,68,68,0.4)'  },
    warning: { bg: 'rgba(245,158,11,0.95)', icon: 'fa-exclamation-triangle', border: 'rgba(245,158,11,0.4)' },
    info:    { bg: 'rgba(37,99,235,0.95)',  icon: 'fa-info-circle',          border: 'rgba(96,165,250,0.4)' }
  };
  const s = styles[type] || styles.info;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.cssText = `background:${s.bg};border-color:${s.border};`;
  toast.innerHTML = `<i class="fas ${s.icon}"></i><span>${escapeHtml(String(message))}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 320);
  }, duration);
}

function handleDocDragStart(e, docId) {
  e.dataTransfer.setData('text/plain', docId);
}

function showDocContextMenu(e, docId) {
  e.preventDefault();
  e.stopPropagation();
  // Use the standard delete flow which includes its own confirm
  deleteDocument(docId);
}

// ─── Sécurité : Échappement HTML ───
function canValidateUsers() {
  if (!G.currentUser) return false;
  return G.currentUser.isSystemAdmin ||
    G.roles[G.currentUser.role]?.perms?.includes('validate_users') ||
    G.currentUser.role === 'admin';
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Initialisation ───



// ─── Helpers manquants ───

function getRoleBadgeClass(role) {
  const classes = { 
    admin: 'bg-red-500/20 text-red-400', 
    manager: 'bg-orange-500/20 text-orange-400', 
    editor: 'bg-blue-500/20 text-blue-400', 
    viewer: 'bg-gray-500/20 text-gray-400' 
  };
  return classes[role] || 'bg-gray-500/20 text-gray-400';
}

  function renderFolderTreeRecursive(folderId, level = 0) {
    const folder = G.folders.find(f => f.id === folderId);
    if (!folder) return '';
    const children = G.folders.filter(f => f.parent_id === folderId);
    const indent = level * 12;
    return `
      <div style="margin-left: ${indent}px" class="cursor-pointer hover:bg-blue-500/10 rounded-lg">
        <div class="flex items-center gap-2 px-2 py-1 text-blue-300/70 text-xs" onclick="openFolder('${folder.id}', '${folder.name}')">
          <i class="fas fa-folder text-yellow-400 text-xs"></i>
          <span>${folder.name}</span>
        </div>
        ${children.map(c => renderFolderTreeRecursive(c.id, level + 1)).join('')}
      </div>
    `;
  }

function updateFolderBreadcrumb() {
  const breadcrumb = document.getElementById('folderBreadcrumb');
  if (!breadcrumb) return;
  
  breadcrumb.innerHTML = G.folderPath.map((f, idx) => `
    <span class="flex items-center">
      ${idx > 0 ? '<i class="fas fa-chevron-right text-blue-400/40 text-xs mx-1"></i>' : ''}
      <button onclick="openFolder('${f.id}', '${f.name}')" class="text-sm ${idx === G.folderPath.length - 1 ? 'text-white font-semibold' : 'text-blue-400 hover:text-blue-300'}">${f.name}</button>
    </span>
  `).join('');
}

  function getCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    if (e.touches) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return { x: Math.max(0, Math.min(canvas.width, x)), y: Math.max(0, Math.min(canvas.height, y)) };
  }

  function startDrawing(e) {
    e.preventDefault();
    isDrawing = true;
    const { x, y } = getCoordinates(e);
    lastX = x;
    lastY = y;
    signatureCtx.beginPath();
    signatureCtx.moveTo(x, y);
  }

  function draw(e) {
    e.preventDefault();
    if (!isDrawing) return;
    const { x, y } = getCoordinates(e);
    signatureCtx.lineTo(x, y);
    signatureCtx.stroke();
    lastX = x;
    lastY = y;
  }

  function stopDrawing() {
    isDrawing = false;
    signatureCtx.beginPath();
  }

function handleGlobalSearch(query) {
  const dropdown = document.getElementById('searchDropdown');
  if (!dropdown) return;
  
  if (!query || query.length < 2) {
    dropdown.classList.add('hidden');
    return;
  }
  
  const results = G.documents.filter(d => !d.is_deleted && d.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
  if (results.length === 0) {
    dropdown.classList.add('hidden');
    return;
  }
  
  dropdown.classList.remove('hidden');
  dropdown.innerHTML = results.map(doc => `
    <div class="p-2 hover:bg-blue-500/10 cursor-pointer" onclick="openPreviewModal('${doc.id}'); document.getElementById('searchDropdown').classList.add('hidden');">
      <p class="text-white text-sm">${escapeHtml(doc.name)}</p>
      <p class="text-xs text-blue-300/60">${formatBytes(doc.size)}</p>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  window.addEventListener('error', (e) => {
    console.error('❌ Erreur globale:', {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      error: e.error
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    console.error('❌ Promesse rejetée non gérée:', {
      reason: e.reason,
      promise: e.promise
    });
  });

  console.log('🚀 Démarrage de l\'application SystemesGED v7.0');

  const hasSession = await initSupabase();

  if (hasSession) {
    // loadUserFromSupabase already called inside initSupabase
    switchToMainApp();
  } else {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp     = document.getElementById('mainApp');
    if (loginScreen) loginScreen.style.display = 'block';
    if (mainApp)     mainApp.style.display      = 'none';

// ══════════════════════════════════════════════
// COLLABORATION TEMPS RÉEL + COMMENTAIRES + EDIT
// ══════════════════════════════════════════════

let _realtimeChannel = null;
let _presenceUsers   = {};
let _commentsCache   = {};

// ── Présence temps réel ──
function subscribePresence(docId) {
  if (_realtimeChannel) {
    G.supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
  if (!docId || !G.supabase) return;

  _realtimeChannel = G.supabase.channel(`doc-presence:${docId}`, {
    config: { presence: { key: G.currentUser.id } }
  });

  _realtimeChannel
    .on('presence', { event: 'sync' }, () => {
      const state = _realtimeChannel.presenceState();
      _presenceUsers = {};
      Object.values(state).flat().forEach(u => { _presenceUsers[u.userId] = u; });
      renderPresenceBadges();
    })
    .on('broadcast', { event: 'comment' }, ({ payload }) => {
      if (payload.docId === docId) appendComment(payload);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await _realtimeChannel.track({
          userId:    G.currentUser.id,
          userName:  G.currentUser.name || G.currentUser.email,
          userEmail: G.currentUser.email,
          joinedAt:  new Date().toISOString()
        });
      }
    });
}

function unsubscribePresence() {
  if (_realtimeChannel) {
    G.supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
  _presenceUsers = {};
  renderPresenceBadges();
}

function renderPresenceBadges() {
  const container = document.getElementById('previewPresence');
  if (!container) return;
  const users = Object.values(_presenceUsers).filter(u => u.userId !== G.currentUser.id);
  if (!users.length) { container.innerHTML = ''; return; }
  container.innerHTML = users.slice(0, 5).map(u => {
    const initials = (u.userName || u.userEmail || '?').slice(0, 2).toUpperCase();
    const colors   = ['bg-green-500','bg-blue-500','bg-purple-500','bg-yellow-500','bg-red-500'];
    const color    = colors[u.userId?.charCodeAt(0) % colors.length] || 'bg-blue-500';
    return `<div class="w-7 h-7 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold cursor-default" title="${escapeHtml(u.userName || u.userEmail)}">${initials}</div>`;
  }).join('') + (users.length > 5 ? `<span class="text-xs text-blue-400/60">+${users.length - 5}</span>` : '');
}

// Hooker closePreviewModal pour unsubscribe
const _origClosePreview = closePreviewModal;
window.closePreviewModal = function() {
  unsubscribePresence();
  const panel = document.getElementById('commentsPanel');
  if (panel) panel.classList.add('hidden');
  _origClosePreview();
};

// Hooker openPreviewModal pour subscribe + bouton Modifier
const _origOpenPreview = openPreviewModal;
window.openPreviewModal = async function(docId) {
  await _origOpenPreview(docId);
  subscribePresence(docId);
  // Afficher bouton Modifier si office
  const doc = G.documents.find(d => d.id === docId);
  const editBtn = document.getElementById('editDocBtn');
  if (editBtn && doc) {
    const officeExts = ['doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp'];
    const ext = (doc.name?.split('.').pop() || '').toLowerCase();
    if (officeExts.includes(ext)) editBtn.classList.remove('hidden');
    else editBtn.classList.add('hidden');
  }
  // Charger commentaires
  loadComments(docId);
};

// ── Modifier un document Office avec sync automatique ──
let _watchInterval  = null;
let _watchFileHandle = null;
let _watchLastModified = 0;
let _watchDocId = null;

async function editCurrentDocument() {
  const docId = G.currentDocId;
  const doc   = G.documents.find(d => d.id === docId);
  if (!doc) return;

  // Vérifier support File System Access API
  if (!window.showOpenFilePicker) {
    // Fallback: téléchargement simple
    let fileUrl = doc.file_url;
    if (G.supabase && doc.storage_path) {
      const { data } = await G.supabase.storage.from(CONFIG.storageBucket).createSignedUrl(doc.storage_path, 3600);
      if (data?.signedUrl) fileUrl = data.signedUrl;
    }
    const a = document.createElement('a');
    a.href = fileUrl; a.download = doc.name; a.click();
    showToast(`📥 Téléchargé. Modifiez puis ré-importez manuellement via "Importer".`, 'warning', 6000);
    return;
  }

  // Étape 1: Télécharger le fichier d'abord
  showToast('⬇️ Téléchargement du fichier...', 'info', 3000);
  let fileUrl = doc.file_url;
  if (G.supabase && doc.storage_path) {
    const { data } = await G.supabase.storage.from(CONFIG.storageBucket).createSignedUrl(doc.storage_path, 3600);
    if (data?.signedUrl) fileUrl = data.signedUrl;
  }
  const a = document.createElement('a');
  a.href = fileUrl; a.download = doc.name; a.click();

  // Étape 2: Ouvrir le sélecteur de fichier après 1.5s
  await new Promise(r => setTimeout(r, 1500));
  showToast('📂 Sélectionnez le fichier téléchargé pour activer la sync automatique', 'info', 6000);

  try {
    const ext = doc.name.split('.').pop().toLowerCase();
    const mimeMap = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      doc:  'application/msword',
      xls:  'application/vnd.ms-excel',
    };

    const [fileHandle] = await window.showOpenFilePicker({
      types: [{ description: 'Document Office', accept: { [mimeMap[ext] || '*/*']: [`.${ext}`] } }],
      multiple: false
    });

    // Arrêter toute surveillance précédente
    stopFileWatch();

    _watchFileHandle  = fileHandle;
    _watchDocId       = docId;
    const initialFile = await fileHandle.getFile();
    _watchLastModified = initialFile.lastModified;

    // Afficher badge de sync dans le modal
    showSyncBadge(doc.name, 'watching');

    // Étape 3: Surveiller les modifications toutes les 3 secondes
    _watchInterval = setInterval(async () => {
      try {
        const file = await _watchFileHandle.getFile();
        if (file.lastModified !== _watchLastModified) {
          _watchLastModified = file.lastModified;
          showSyncBadge(doc.name, 'uploading');
          await autoUploadNewVersion(docId, file);
          showSyncBadge(doc.name, 'synced');
          setTimeout(() => showSyncBadge(doc.name, 'watching'), 3000);
        }
      } catch(e) {
        stopFileWatch();
      }
    }, 3000);

    showToast(`✅ Sync activée pour "${doc.name}". Sauvegardez dans Office → mis à jour automatiquement !`, 'success', 8000);
    await addAuditLog('edit_sync_start', 'document', docId, `Sync automatique démarrée: ${doc.name}`);

  } catch(e) {
    if (e.name !== 'AbortError') showToast('Sync annulée', 'warning');
  }
}

function stopFileWatch() {
  if (_watchInterval) { clearInterval(_watchInterval); _watchInterval = null; }
  _watchFileHandle  = null;
  _watchDocId       = null;
  _watchLastModified = 0;
  hideSyncBadge();
}

function showSyncBadge(fileName, state) {
  let badge = document.getElementById('syncStatusBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'syncStatusBadge';
    badge.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;padding:10px 16px;border-radius:12px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,0.4);transition:all 0.3s ease;backdrop-filter:blur(12px);';
    document.body.appendChild(badge);
  }
  const configs = {
    watching:  { bg: 'rgba(30,58,138,0.95)', border: '1px solid rgba(96,165,250,0.4)', icon: '🔵', text: 'Sync active — en attente de modifications', pulse: true  },
    uploading: { bg: 'rgba(120,53,15,0.95)',  border: '1px solid rgba(251,191,36,0.4)',  icon: '⬆️', text: 'Mise à jour en cours...', pulse: false },
    synced:    { bg: 'rgba(6,78,59,0.95)',    border: '1px solid rgba(52,211,153,0.4)',  icon: '✅', text: 'Document synchronisé !', pulse: false },
    error:     { bg: 'rgba(127,29,29,0.95)',  border: '1px solid rgba(252,165,165,0.4)', icon: '❌', text: 'Erreur de sync', pulse: false },
  };
  const c = configs[state] || configs.watching;
  badge.style.background = c.bg;
  badge.style.border = c.border;
  badge.style.color = '#fff';
  badge.innerHTML = `
    <span>${c.icon}</span>
    <div>
      <div style="font-size:11px;opacity:0.7;margin-bottom:2px">${escapeHtml(fileName)}</div>
      <div>${c.text}</div>
    </div>
    <button onclick="stopFileWatch()" style="margin-left:8px;background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:11px">Arrêter</button>
  `;
}

function hideSyncBadge() {
  const badge = document.getElementById('syncStatusBadge');
  if (badge) badge.remove();
}

async function autoUploadNewVersion(docId, file) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc || !G.supabase) return;

  try {
    // Uploader le fichier dans Supabase Storage (même chemin = écrase)
    const { error: uploadError } = await G.supabase.storage
      .from(CONFIG.storageBucket)
      .upload(doc.storage_path, file, { upsert: true, contentType: file.type });

    if (uploadError) throw uploadError;

    // Incrémenter la version et mettre à jour les métadonnées
    const newVersion = (doc.version || 1) + 1;
    const { error: dbError } = await G.supabase.from('documents').update({
      version:    newVersion,
      size:       file.size,
      updated_at: new Date().toISOString()
    }).eq('id', docId);

    if (dbError) throw dbError;

    // Mettre à jour localement
    doc.version    = newVersion;
    doc.size       = file.size;
    doc.updated_at = new Date().toISOString();

    // Broadcaster la mise à jour aux autres collaborateurs
    if (_realtimeChannel) {
      _realtimeChannel.send({
        type: 'broadcast',
        event: 'doc_updated',
        payload: { docId, version: newVersion, updatedBy: G.currentUser.name || G.currentUser.email }
      });
    }

    // Audit
    await addAuditLog('auto_version', 'document', docId, `Version ${newVersion} sauvegardée automatiquement (${formatBytes(file.size)})`);

    // Rafraîchir l'affichage
    renderDocuments();
    updatePreviewMetadata(doc);

    console.log(`✅ Version ${newVersion} uploadée pour "${doc.name}"`);
  } catch(err) {
    console.error('autoUpload error:', err);
    showSyncBadge(doc.name, 'error');
    showToast('Erreur sync: ' + err.message, 'error');
  }
}

// Exposer stopFileWatch globalement
window.stopFileWatch = stopFileWatch;

// ── Commentaires ──
function toggleCommentsPanel() {
  const panel = document.getElementById('commentsPanel');
  if (panel) panel.classList.toggle('hidden');
}

async function loadComments(docId) {
  if (!docId || !G.supabase) return;
  try {
    const { data } = await G.supabase.from('document_comments')
      .select('*').eq('document_id', docId).order('created_at', { ascending: true }).limit(100);
    _commentsCache[docId] = data || [];
    renderComments(docId);
  } catch(e) { /* table peut ne pas exister */ }
}

function renderComments(docId) {
  const list  = document.getElementById('commentsList');
  const count = document.getElementById('commentsCount');
  if (!list) return;
  const comments = _commentsCache[docId] || [];
  if (count) count.textContent = comments.length;
  if (!comments.length) {
    list.innerHTML = '<p class="text-blue-400/40 text-xs text-center py-4">Aucun commentaire. Soyez le premier !</p>';
    return;
  }
  list.innerHTML = comments.map(c => `
    <div class="flex gap-2">
      <div class="w-6 h-6 rounded-full bg-blue-500/30 flex items-center justify-center text-xs text-blue-300 flex-shrink-0">
        ${(c.user_name || c.user_email || '?').slice(0,1).toUpperCase()}
      </div>
      <div class="flex-1 bg-blue-900/30 rounded-lg px-3 py-2">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-blue-300 text-xs font-medium">${escapeHtml(c.user_name || c.user_email || 'Anonyme')}</span>
          <span class="text-blue-400/40 text-xs">${formatDate(c.created_at)}</span>
        </div>
        <p class="text-white/80 text-xs">${escapeHtml(c.content)}</p>
      </div>
    </div>`).join('');
  list.scrollTop = list.scrollHeight;
}

function appendComment(payload) {
  const docId = G.currentDocId;
  if (!docId) return;
  if (!_commentsCache[docId]) _commentsCache[docId] = [];
  if (!_commentsCache[docId].find(c => c.id === payload.id)) {
    _commentsCache[docId].push(payload);
    renderComments(docId);
    const panel = document.getElementById('commentsPanel');
    if (panel?.classList.contains('hidden')) {
      showToast(`💬 Nouveau commentaire de ${payload.user_name || payload.user_email}`, 'info');
    }
  }
}

async function addComment() {
  const input = document.getElementById('newCommentInput');
  const text  = input?.value.trim();
  const docId = G.currentDocId;
  if (!text || !docId) return;

  const comment = {
    id:          generateId(),
    document_id: docId,
    user_id:     G.currentUser.id,
    user_name:   G.currentUser.name || G.currentUser.email,
    user_email:  G.currentUser.email,
    content:     text,
    created_at:  new Date().toISOString()
  };

  // Sauvegarder en base (si la table existe)
  try {
    await G.supabase.from('document_comments').insert(comment);
  } catch(e) { /* table optionnelle */ }

  // Broadcaster aux autres via Realtime
  if (_realtimeChannel) {
    _realtimeChannel.send({ type: 'broadcast', event: 'comment', payload: { ...comment, docId } });
  }

  // Afficher localement
  appendComment(comment);
  input.value = '';

  // Ouvrir le panneau si fermé
  const panel = document.getElementById('commentsPanel');
  if (panel?.classList.contains('hidden')) panel.classList.remove('hidden');
}

// ── Onglets collaboration modal ──
function switchCollabTab(tab) {
  ['invite','members','activity'].forEach(t => {
    document.getElementById(`collabTab${t.charAt(0).toUpperCase()+t.slice(1)}`)?.classList.add('hidden');
    const btn = document.getElementById(`tab${t.charAt(0).toUpperCase()+t.slice(1)}`);
    if (btn) { btn.classList.remove('bg-blue-500/30','text-white'); btn.classList.add('text-blue-300/70'); }
  });
  document.getElementById(`collabTab${tab.charAt(0).toUpperCase()+tab.slice(1)}`)?.classList.remove('hidden');
  const activeBtn = document.getElementById(`tab${tab.charAt(0).toUpperCase()+tab.slice(1)}`);
  if (activeBtn) { activeBtn.classList.add('bg-blue-500/30','text-white'); activeBtn.classList.remove('text-blue-300/70'); }

  if (tab === 'members') loadCollabMembers();
  if (tab === 'activity') loadCollabActivity();
  updateCollabPresence();
}

async function loadCollabMembers() {
  const docId = G.collabModalDocId;
  const list  = document.getElementById('collabMembersList');
  if (!list || !docId) return;
  const shares = G.shares.filter(s => s.document_id === docId);
  if (!shares.length) {
    list.innerHTML = '<p class="text-blue-400/40 text-xs text-center py-8">Aucun collaborateur invité.</p>';
    return;
  }
  list.innerHTML = shares.map(s => `
    <div class="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-blue-500/30 flex items-center justify-center text-blue-300 font-bold text-sm">
          ${(s.recipient_email || '?').slice(0,1).toUpperCase()}
        </div>
        <div>
          <p class="text-white text-sm">${escapeHtml(s.recipient_email || 'Inconnu')}</p>
          <p class="text-blue-400/50 text-xs">${s.permission === 'view' ? '👁 Lecture' : s.permission === 'download' ? '⬇ Téléchargement' : '✏ Modification'} • ${formatDate(s.created_at)}</p>
        </div>
      </div>
      <button onclick="revokeShare('${s.id}')" class="text-red-400/60 hover:text-red-400 text-xs p-1 rounded" title="Révoquer l'accès">
        <i class="fas fa-user-minus"></i>
      </button>
    </div>`).join('');
}

async function loadCollabActivity() {
  const docId = G.collabModalDocId;
  const list  = document.getElementById('collabActivityList');
  if (!list || !docId || !G.supabase) return;
  try {
    const { data } = await G.supabase.from('audit_logs')
      .select('*').eq('resource_id', docId).order('created_at', { ascending: false }).limit(20);
    if (!data?.length) {
      list.innerHTML = '<p class="text-blue-400/40 text-xs text-center py-8">Aucune activité enregistrée.</p>';
      return;
    }
    list.innerHTML = data.map(log => `
      <div class="flex items-start gap-2 p-2 rounded-lg hover:bg-blue-900/20">
        <i class="fas fa-circle text-blue-400/40 mt-1.5" style="font-size:6px"></i>
        <div>
          <p class="text-white/80 text-xs">${escapeHtml(log.details || log.action || '')}</p>
          <p class="text-blue-400/40 text-xs">${formatDate(log.created_at)}</p>
        </div>
      </div>`).join('');
  } catch(e) {
    list.innerHTML = '<p class="text-blue-400/40 text-xs text-center py-8">Activité non disponible.</p>';
  }
}

function updateCollabPresence() {
  const container = document.getElementById('collabPresenceList');
  if (!container) return;
  const users = Object.values(_presenceUsers);
  if (!users.length) {
    container.innerHTML = '<span class="text-blue-400/40 text-xs">Personne d\'autre en ligne</span>';
    return;
  }
  container.innerHTML = users.map(u => `
    <div class="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 rounded-full">
      <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
      <span class="text-green-300 text-xs">${escapeHtml(u.userName || u.userEmail)}</span>
    </div>`).join('');
}

async function revokeShare(shareId) {
  if (!confirm('Révoquer cet accès ?')) return;
  const { error } = await G.supabase.from('shares').delete().eq('id', shareId);
  if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
  G.shares = G.shares.filter(s => s.id !== shareId);
  showToast('Accès révoqué', 'success');
  loadCollabMembers();
}

// Exposer les nouvelles fonctions
Object.assign(window, {
  editCurrentDocument, toggleCommentsPanel, addComment,
  switchCollabTab, revokeShare, loadCollabMembers, loadCollabActivity
});
  }
  
  // Exposer toutes les fonctions globalement
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
  window.switchShareTab = switchShareTab;
  window.shareDocument = shareDocument;
  window.revokeShare = revokeShare;
  window.loadShareHistory = loadShareHistory;
  window.switchSharedTab = switchSharedTab;
  window.renderDashboard = renderDashboard;
  window.renderShared = renderShared;
  window.renderDocuments = renderDocuments;
  window.filterDocuments = filterDocuments;
  window.closeWfDetailModal = closeWfDetailModal;
  window.switchWfView = switchWfView;
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
  window.getRoleBadgeClass = getRoleBadgeClass;
  window.addAuditLog = addAuditLog;
  window.renderFolderContents = renderFolderContents;
  window.updatePendingUsersCount = updatePendingUsersCount;
  window.clearTagFilter = clearTagFilter;
  window.loadDeletedDocs = loadDeletedDocs;
  window.validateUser = validateUser;
  window.deleteUser = deleteUser;
  window.resetUserPassword = resetUserPassword;
  window.openCreateUserModal = openCreateUserModal;
  window.closeAddUserModal = closeAddUserModal;
  window.addUser = addUser;
  window.renderPendingUsers = renderPendingUsers;
  window.refreshPendingUsers = refreshPendingUsers;
  window.approveAllPending = approveAllPending;
  window.rejectAllPending = rejectAllPending;
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
  window.exportAnalytics = exportAnalytics;
  window.renderFolderTree = renderFolderTree;
  window.deleteFolder = deleteFolder;
  window.loadExistingSignatures = loadExistingSignatures;
  window.deleteRule = deleteRule;
  window.deleteBackup = deleteBackup;
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
  window.openRequestSignatureModal = openRequestSignatureModal;
  window.closeRequestSignatureModal = closeRequestSignatureModal;
  window.requestSignature = requestSignature;
  window.renderAI = renderAI;
  window.analyzeDocument = analyzeDocument;
  window.analyzeAllDocuments = analyzeAllDocuments;
  window.askAI = askAI;
  window.renderAutomation = renderAutomation;
  window.openWfRuleModal = openWfRuleModal;
  window.closeWfRuleModal = closeWfRuleModal;
  window.createWfRule = createWfRule;
  window.quickCreateRule = quickCreateRule;
  window.renderIntegrations = renderIntegrations;
  window.connectIntegration = connectIntegration;
  window.addWebhook = addWebhook;
  window.renderBackups = renderBackups;
  window.createBackup = createBackup;
  window.restoreBackup = restoreBackup;
  window.toggleAutoBackup = toggleAutoBackup;
  window.saveBackupSettings = saveBackupSettings;
  window.renderApiKeys = renderApiKeys;
  window.generateApiKeyV6 = generateApiKeyV6;
  window.revokeApiKey = revokeApiKey;
  window.copyApiKey = copyApiKey;
  window.renderBillingV6 = renderBillingV6;
  window.renderAuditV6 = renderAuditV6;
  window.setAuditFilter = setAuditFilter;
  window.filterAuditLogs = filterAuditLogs;
  window.clearAuditFilters = clearAuditFilters;
  window.prevAuditPage = prevAuditPage;
  window.nextAuditPage = nextAuditPage;
  window.handleGlobalSearch = handleGlobalSearch;
  window.runAdvSearch = runAdvSearch;
  window.clearAdvSearch = clearAdvSearch;
  window.runFTSearch = runFTSearch;
  window.renderAdvancedSearch = renderAdvancedSearch;
  window.renderVersioning = renderVersioning;
  window.filterVersionDocs = filterVersionDocs;
  window.restoreVersion = restoreVersion;
  window.renderSearchV7 = renderSearchV7;
  window.renderRBACV7 = renderRBACV7;
  window.updateUserRole = updateUserRole;
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
  window.copyShareLink = copyShareLink;
  window.scanAllDocuments = scanAllDocuments;
  window.renderAuditLog = renderAuditLog;
  window.exportUserData = exportUserData;
  window.requestAccountDeletion = requestAccountDeletion;
  window.copySqlSchema = copySqlSchema;
  window.openDangerModal = openDangerModal;
  window.closeNotifPanel = closeNotifPanel;
  window.toggleNotifications = toggleNotifications;
  window.markAllNotifRead = markAllNotifRead;
  window.refreshShares = refreshShares;
  window.openMoveModal         = openMoveModal;
  window.closeMoveModal        = closeMoveModal;
  window.confirmMoveDocument   = confirmMoveDocument;
  window.openCollabModal       = openCollabModal;
  window.closeCollabModal      = closeCollabModal;
  window.inviteCollaborator    = inviteCollaborator;
window.openQuickShareModal     = openQuickShareModal;
window.closeQuickShareModal    = closeQuickShareModal;
window.switchQuickShareTab     = switchQuickShareTab;
window.executeQuickShare       = executeQuickShare;
window.addShareRecipient       = addShareRecipient;
window.handleShareEmailKeydown = handleShareEmailKeydown;
window.suggestShareRecipients  = suggestShareRecipients;
window.selectQsSuggestion      = selectQsSuggestion;
window.toggleQsLinkPwd         = toggleQsLinkPwd;
window.toggleQsLinkMaxViews    = toggleQsLinkMaxViews;
window.openShareDetailModal    = openShareDetailModal;
window.closeShareDetailModal   = closeShareDetailModal;
window.filterSharedView        = filterSharedView;
window.clearSharedFilters      = clearSharedFilters;
window.createPublicLink        = createPublicLink;
window.copyPublicLink          = copyPublicLink;
window.copyQsLink              = copyQsLink;
window.shareViaEmail           = shareViaEmail;
window.revokePublicLink        = revokePublicLink;
window.deletePublicLink        = deletePublicLink;
window.extendPublicLink        = extendPublicLink;
window.loadShareActivity       = loadShareActivity;
window.extendShare             = extendShare;
window.renewShare              = renewShare;
window.deleteShareRecord       = deleteShareRecord;
window.purgeExpiredShares      = purgeExpiredShares;
window.toggleBulkSelect        = toggleBulkSelect;
window.bulkRevokeSelected      = bulkRevokeSelected;
window.bulkExtendSelected      = bulkExtendSelected;
window.clearBulkSelection      = clearBulkSelection;

  window.exportSearchResults    = exportSearchResults;
  window.createNewVersion       = createNewVersion;
  window.confirmCreateNewVersion= confirmCreateNewVersion;
  window.handleNewVersionFile   = handleNewVersionFile;
  window.showVersionHistory     = showVersionHistory;
  window.downloadVersion        = downloadVersion;
  window.compareVersions        = compareVersions;
  window.searchSysLogs          = searchSysLogs;
  window.sysLogsPrevPage        = sysLogsPrevPage;
  window.sysLogsNextPage        = sysLogsNextPage;
  window.toggleSysLogsAutoRefresh = toggleSysLogsAutoRefresh;

});
