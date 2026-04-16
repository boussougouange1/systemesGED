// ============================================
// SystemesGED v7.2 — MODULE : auth.js
// Responsabilités :
//   - Configuration (CONFIG)
//   - État global (G, _shared, _search, _sysLogs, _versioning, _rbac, _webhooks)
//   - Initialisation Supabase
//   - Authentification (login, register, logout, demo, oauth)
//   - Chargement des données (loadAllData, loadUserFromSupabase)
// ============================================

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



// ─── Exposition globale — auth.js ───
window.handleLogin       = handleLogin;
window.handleRegister    = handleRegister;
window.handleLogout      = handleLogout;
window.switchAuthTab     = switchAuthTab;
window.togglePwdInput    = togglePwdInput;
window.demoLogin         = demoLogin;
window.oauthLogin        = oauthLogin;
window.loadAllData       = loadAllData;
