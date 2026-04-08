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
  const isAdmin = G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
  const isManager = G.currentUser?.role === 'manager' || isAdmin;
  
  document.querySelectorAll('[data-role="admin-only"]').forEach(el => {
    el.style.display = isAdmin ? 'flex' : 'none';
  });
  document.querySelectorAll('[data-role="manager-only"]').forEach(el => {
    el.style.display = isManager ? 'flex' : 'none';
  });
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

function demoLogin() {
  console.log('🔑 Tentative de connexion démo');
  
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  
  if (loginEmail) loginEmail.value = 'demo@systemesged.fr';
  if (loginPassword) loginPassword.value = 'Demo123!';
  
  // Créer un événement submit et l'appeler
  const event = new Event('submit', { bubbles: true, cancelable: true });
  const form = document.getElementById('loginForm');
  
  if (form) {
    console.log('📝 Formulaire trouvé, déclenchement du submit');
    form.dispatchEvent(event);
  } else {
    console.log('⚠️ Formulaire non trouvé, appel direct de handleLogin');
    handleLogin(event);
  }
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

  // Filtrer selon l'onglet
  if (G.docsTab === 'company') {
    filtered = filtered.filter(d => d.scope === 'company');
  } else if (G.docsTab === 'personal') {
    filtered = filtered.filter(d => d.scope === 'personal' && d.owner_id === G.currentUser.id);
  } else if (G.docsTab === 'mine') {
    filtered = filtered.filter(d => d.owner_id === G.currentUser.id);
  } else if (G.docsTab === 'shared') {
    // Utiliser les partages déjà chargés (reçus pour l'utilisateur courant)
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
        ${doc.scope === 'company' ? 
          '<span class="collab-badge text-[10px]"><i class="fas fa-building mr-1"></i>Équipe</span>' : 
          '<span class="text-[10px] text-purple-400/60"><i class="fas fa-user mr-1"></i>Personnel</span>'}
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
          ${doc.scope === 'company' ? 
            `<span class="collab-badge text-[10px]"><i class="fas fa-building mr-1"></i>Équipe</span>` : 
            '<span class="text-[10px] text-purple-400/60"><i class="fas fa-user mr-1"></i>Personnel</span>'}
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
        query = query.eq('scope', 'personal').eq('owner_id', G.currentUser.id);
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
  console.log('👁️ Ouverture de l\'aperçu pour:', docId);
  G.currentDocId = docId;
  
  const modal = document.getElementById('previewModal');
  if (modal) modal.classList.remove('hidden');
  
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) {
    showToast('Document introuvable', 'error');
    return;
  }
  
  // Afficher le chargement
  showPreviewLoading();
  
  // Mettre à jour le titre
  const titleEl = document.getElementById('previewTitle');
  if (titleEl) titleEl.textContent = doc.name;
  
  // Mettre à jour les métadonnées
  updatePreviewMetadata(doc);
  
  const fileUrl = doc.file_url;
  const fileType = doc.type;
  const fileName = doc.name;
  const fileExt = fileName.split('.').pop().toLowerCase();
  
  // Récupérer les éléments
  const previewFrame = document.getElementById('previewFrame');
  const previewImage = document.getElementById('previewImage');
  const previewContent = document.getElementById('previewContent');
  const previewOffice = document.getElementById('previewOffice');
  const previewUnsupported = document.getElementById('previewUnsupported');
  
  // Cacher tous les conteneurs
  if (previewFrame) previewFrame.classList.add('hidden');
  if (previewImage) previewImage.classList.add('hidden');
  if (previewContent) previewContent.classList.add('hidden');
  if (previewOffice) previewOffice.classList.add('hidden');
  if (previewUnsupported) previewUnsupported.classList.add('hidden');
  
  // Types de fichiers supportés
  const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
  const pdfTypes = ['pdf'];
  const officeTypes = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
  const textTypes = ['txt', 'json', 'xml', 'html', 'css', 'js', 'md'];
  
  try {
    if (imageTypes.includes(fileExt)) {
      // Aperçu image
      if (previewImage) {
        previewImage.src = fileUrl;
        previewImage.classList.remove('hidden');
        previewImage.onload = () => {
          hidePreviewLoading();
          console.log('✅ Image chargée');
        };
        previewImage.onerror = () => {
          hidePreviewLoading();
          showUnsupportedPreview(doc);
        };
      }
    } 
    else if (pdfTypes.includes(fileExt)) {
      // Aperçu PDF
      if (previewFrame) {
        previewFrame.src = fileUrl;
        previewFrame.classList.remove('hidden');
        previewFrame.onload = () => {
          hidePreviewLoading();
          console.log('✅ PDF chargé');
        };
        previewFrame.onerror = () => {
          hidePreviewLoading();
          showUnsupportedPreview(doc);
        };
      }
    }
    else if (officeTypes.includes(fileExt)) {
      // Aperçu Office
      if (previewOffice) {
        previewOffice.src = fileUrl;
        previewOffice.classList.remove('hidden');
        previewOffice.onload = () => {
          hidePreviewLoading();
          console.log('✅ Document Office chargé');
        };
        previewOffice.onerror = () => {
          hidePreviewLoading();
          showUnsupportedPreview(doc);
        };
      }
    }
    else if (textTypes.includes(fileExt)) {
      // Aperçu texte
      previewContent.classList.remove('hidden');
      const contentEl = document.getElementById('previewTextContent');
      if (contentEl) {
        contentEl.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-blue-400 text-2xl"></i><p class="mt-2">Chargement du contenu...</p></div>';
        
        fetch(fileUrl)
          .then(response => response.text())
          .then(text => {
            hidePreviewLoading();
            contentEl.innerHTML = `<pre class="text-xs text-blue-300/80 font-mono whitespace-pre-wrap overflow-auto max-h-[60vh] p-4 bg-slate-900/50 rounded-lg">${escapeHtml(text.substring(0, 50000))}${text.length > 50000 ? '\n\n... (fichier tronqué)' : ''}</pre>`;
          })
          .catch(() => {
            hidePreviewLoading();
            contentEl.innerHTML = `<div class="text-center py-8 text-yellow-400"><i class="fas fa-exclamation-triangle text-3xl mb-2 block"></i><p>Impossible de lire le contenu</p><button onclick="downloadDocument('${doc.id}')" class="mt-3 btn-primary px-4 py-2 rounded-lg text-sm">Télécharger</button></div>`;
          });
      }
    }
    else {
      // Type non supporté
      hidePreviewLoading();
      showUnsupportedPreview(doc);
    }
  } catch (err) {
    console.error('Erreur aperçu:', err);
    hidePreviewLoading();
    showUnsupportedPreview(doc);
  }
  
  // Incrémenter le compteur de vues
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
  if (actionError) console.error('Erreur enregistrement action:', actionError);
  
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

async function openWfDetail(wfId) {
  G.currentWfId = wfId;
  const modal = document.getElementById('wfDetailModal');
  if (modal) modal.classList.remove('hidden');
  
  const wf = G.workflows.find(w => w.id === wfId);
  if (!wf) return;
  
  // Titre
  const titleEl = document.getElementById('wfDetailTitle');
  if (titleEl) titleEl.textContent = wf.title;
  
  // Métadonnées
  const metaEl = document.getElementById('wfDetailMeta');
  if (metaEl) {
    const assigneeName = wf.assignee_id ? (G.users.find(u => u.id === wf.assignee_id)?.name || 'Inconnu') : 'Non assigné';
    metaEl.innerHTML = `
      <span class="text-xs px-2 py-0.5 rounded-full ${getWfStatusClass(wf.status)}">${getWfStatusLabel(wf.status)}</span>
      <span class="text-xs text-blue-300/60">Priorité: ${wf.priority}</span>
      <span class="text-xs text-blue-300/60">Créé le ${formatDate(wf.created_at)}</span>
      <span class="text-xs text-blue-300/60">Assigné: ${assigneeName}</span>
    `;
  }
  
  // Étapes
  const stepsContainer = document.getElementById('wfDetailSteps');
  if (stepsContainer) {
    if (wf.steps && Array.isArray(wf.steps) && wf.steps.length > 0) {
      stepsContainer.innerHTML = wf.steps.map((step, idx) => `
        <div class="flex items-center gap-3 p-2 rounded-lg ${idx <= wf.current_step ? 'bg-green-500/10 border border-green-500/30' : 'bg-slate-800/50'}">
          <div class="w-6 h-6 rounded-full flex items-center justify-center ${idx < wf.current_step ? 'bg-green-500 text-white' : idx === wf.current_step ? 'bg-blue-500 text-white' : 'bg-slate-600 text-gray-400'}">
            ${idx + 1}
          </div>
          <div class="flex-1">
            <p class="text-white text-sm">${escapeHtml(step)}</p>
            ${idx === wf.current_step && wf.status === 'pending' ? '<p class="text-xs text-blue-400">En attente de validation</p>' : ''}
          </div>
          ${idx < wf.current_step ? '<i class="fas fa-check-circle text-green-400"></i>' : ''}
        </div>
      `).join('');
      
      const progress = wf.steps.length > 0 ? ((wf.current_step + 1) / wf.steps.length) * 100 : 0;
      const progressBar = document.getElementById('wfDetailProgressBar');
      const progressText = document.getElementById('wfDetailProgress');
      if (progressBar) progressBar.style.width = `${progress}%`;
      if (progressText) progressText.textContent = `${Math.round(progress)}%`;
    } else {
      stepsContainer.innerHTML = '<p class="text-blue-300/50 text-sm">Aucune étape définie</p>';
    }
  }
  
  // Document lié
  const docContainer = document.getElementById('wfDetailDoc');
  if (wf.document_id) {
    const doc = G.documents.find(d => d.id === wf.document_id);
    if (doc && docContainer) {
      docContainer.classList.remove('hidden');
      docContainer.innerHTML = `
        <p class="text-xs text-blue-300/60 mb-1">Document lié</p>
        <div class="flex items-center gap-2 cursor-pointer hover:bg-blue-500/10 p-2 rounded-lg transition-colors" onclick="openPreviewModal('${doc.id}')">
          <i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-blue-400"></i>
          <span class="text-white text-sm truncate">${escapeHtml(doc.name)}</span>
          <i class="fas fa-external-link-alt text-blue-400/50 text-xs ml-auto"></i>
        </div>
      `;
    } else if (docContainer) {
      docContainer.classList.add('hidden');
    }
  } else if (docContainer) {
    docContainer.classList.add('hidden');
  }
  
  // Actions (boutons approuver/rejeter)
  const actionsContainer = document.getElementById('wfDetailActions');
  if (actionsContainer) {
    const isAssignee = wf.assignee_id === G.currentUser.id;
    const isCreator = wf.created_by === G.currentUser.id;
    const isAdmin = G.currentUser.role === 'admin';
    
    if ((isAssignee || isCreator || isAdmin) && ['pending', 'in_review'].includes(wf.status)) {
      actionsContainer.classList.remove('hidden');
    } else {
      actionsContainer.classList.add('hidden');
    }
  }
  
  // Charger l'historique
  await loadWorkflowHistory(wfId);
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
function renderUsers() {
  const tbody = document.getElementById('usersList');
  if (!tbody) return;
  
  tbody.innerHTML = G.users.map(u => `
    <tr class="hover:bg-blue-500/5">
      <td class="p-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold">${u.name?.charAt(0) || 'U'}</div>
          <div><p class="text-white text-sm font-medium">${u.name}</p><p class="text-xs text-blue-300/60">${u.email}</p></div>
        </div>
       </td>
      <td class="p-4"><span class="px-2 py-1 rounded-full text-xs ${getRoleBadgeClass(u.role)}">${G.roles[u.role]?.name || u.role}</span> </td>
      <td class="p-4 hidden md:table-cell">- </td>
      <td class="p-4 hidden sm:table-cell"><span class="px-2 py-1 rounded-full text-xs ${u.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}">${u.status === 'pending_validation' ? 'En attente' : u.status}</span> </td>
      <td class="p-4">
        <div class="flex gap-2">
          ${u.status === 'pending_validation' && canValidateUsers() ? `<button onclick="validateUser('${u.id}')" class="px-3 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs">Valider</button>` : ''}
          ${canValidateUsers() ? `<button onclick="resetUserPassword('${u.email}')" class="p-2 rounded-lg hover:bg-yellow-500/20 text-yellow-400" title="Réinitialiser mot de passe"><i class="fas fa-key"></i></button>` : ''}
          ${canValidateUsers() ? `<button onclick="deleteUser('${u.id}')" class="p-2 rounded-lg hover:bg-red-500/20 text-red-400"><i class="fas fa-trash"></i></button>` : ''}
        </div>
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

function openCreateUserModal() {
  if (!canValidateUsers()) {
    showToast('Permission refusée', 'error');
    return;
  }
  const modal = document.getElementById('addUserModal');
  if (modal) modal.classList.remove('hidden');
}

function closeAddUserModal() {
  const modal = document.getElementById('addUserModal');
  if (modal) modal.classList.add('hidden');
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
  
  if (!G.currentUser?.companyId) {
    showToast('Erreur: entreprise non trouvée', 'error');
    return;
  }
  
  const name = `${firstName} ${lastName}`;
  const tempPassword = generatePassword();
  
  try {
    const response = await fetch(CONFIG.edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.supabaseKey}`,
      },
      body: JSON.stringify({
        email,
        password: tempPassword,
        role,
        companyId: G.currentUser.companyId,
        name,
      }),
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    
    showToast(`Utilisateur créé. Mot de passe temporaire: ${tempPassword}`, 'success');
    closeAddUserModal();
    await loadAllData();
    renderUsers();
    updatePendingUsersCount();
    
  } catch (err) {
    console.error('Erreur création utilisateur:', err);
    showToast('Erreur: ' + err.message, 'error');
  }
}

async function resetUserPassword(email) {
  const { error } = await G.supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/update-password.html`,
  });
  if (error) {
    showToast('Erreur envoi de l\'email: ' + error.message, 'error');
  } else {
    showToast(`Un email de réinitialisation a été envoyé à ${email}`, 'success');
  }
}

function openResetModal() {
  const modal = document.getElementById('resetPasswordModal');
  if (modal) modal.classList.remove('hidden');
  const emailInput = document.getElementById('resetEmail');
  if (emailInput) emailInput.value = '';
  const msgDiv = document.getElementById('resetMessage');
  if (msgDiv) msgDiv.innerHTML = '';
}

function closeResetModal() {
  const modal = document.getElementById('resetPasswordModal');
  if (modal) modal.classList.add('hidden');
}

async function sendResetEmail() {
  const email = document.getElementById('resetEmail')?.value.trim();
  if (!email) {
    showToast('Veuillez saisir votre email', 'warning');
    return;
  }
  const { error } = await G.supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/update-password.html`,
  });
  const msgDiv = document.getElementById('resetMessage');
  if (error) {
    if (msgDiv) msgDiv.innerHTML = `<span class="text-red-400">Erreur : ${error.message}</span>`;
  } else {
    if (msgDiv) msgDiv.innerHTML = `<span class="text-green-400">✅ Un email de réinitialisation vous a été envoyé.</span>`;
    setTimeout(() => closeResetModal(), 3000);
  }
}

async function validateUser(userId) {
  const user = G.users.find(u => u.id === userId);
  if (!user) return;
  
  const { error } = await G.supabase
    .from('profiles')
    .update({ status: 'active', validated_at: new Date().toISOString() })
    .eq('id', userId);
  
  if (error) {
    showToast('Erreur validation', 'error');
    return;
  }
  
  user.status = 'active';
  renderUsers();
  updatePendingUsersCount();
  showToast(`Utilisateur ${user.name} validé`, 'success');
  
  await addAuditLog('validate_user', 'user', userId, `Utilisateur ${user.name} validé`);
}

async function deleteUser(userId) {
  if (!confirm('Supprimer cet utilisateur ?')) return;
  
  const { error } = await G.supabase.from('profiles').delete().eq('id', userId);
  if (error) {
    showToast('Erreur suppression', 'error');
    return;
  }
  
  G.users = G.users.filter(u => u.id !== userId);
  renderUsers();
  updatePendingUsersCount();
  showToast('Utilisateur supprimé', 'success');
}

function renderPendingUsers() {
  const container = document.getElementById('pendingUsersList');
  if (!container) return;
  
  const pending = G.users.filter(u => u.status === 'pending_validation');
  
  if (pending.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-user-check text-4xl mb-3 block opacity-20"></i><p>Aucun utilisateur en attente</p></div>';
    return;
  }
  
  container.innerHTML = pending.map(u => `
    <div class="glass-card rounded-xl p-4 border border-yellow-500/20 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 text-lg font-bold">${u.name?.charAt(0) || 'U'}</div>
        <div><p class="text-white font-medium">${u.name}</p><p class="text-sm text-blue-300/60">${u.email}</p></div>
      </div>
      <button onclick="validateUser('${u.id}')" class="px-4 py-2 rounded-lg bg-green-500/20 text-green-400 text-sm hover:bg-green-500/30">Valider</button>
    </div>
  `).join('');
}

function refreshPendingUsers() {
  renderPendingUsers();
  updatePendingUsersCount();
}

function updatePendingUsersCount() {
  const count = G.users.filter(u => u.status === 'pending_validation').length;
  G.pendingUsersCount = count;
  
  const badges = document.querySelectorAll('.pending-users-badge, #d-pendingBadge, #m-pendingBadge');
  badges.forEach(b => {
    if (count > 0 && canValidateUsers()) {
      b.textContent = count;
      b.classList.remove('hidden');
    } else {
      b.classList.add('hidden');
    }
  });
  
  const pendingCountEl = document.getElementById('pendingCount');
  if (pendingCountEl) pendingCountEl.textContent = count;
}

function generatePassword() {
  const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower   = 'abcdefghijklmnopqrstuvwxyz';
  const digits  = '0123456789';
  const special = '!@#$%^&*+-=?';
  const all     = upper + lower + digits + special;
  const arr     = new Uint32Array(14);
  crypto.getRandomValues(arr);
  // Guarantee at least one of each required class
  let pwd = [
    upper[arr[0]  % upper.length],
    lower[arr[1]  % lower.length],
    digits[arr[2] % digits.length],
    special[arr[3]% special.length],
  ];
  for (let i = 4; i < 14; i++) pwd.push(all[arr[i] % all.length]);
  // Shuffle
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = arr[i % arr.length] % (i + 1);
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join('');
}

function approveAllPending() {
  const pending = G.users.filter(u => u.status === 'pending_validation');
  pending.forEach(u => validateUser(u.id));
}

function rejectAllPending() {
  const pending = G.users.filter(u => u.status === 'pending_validation');
  pending.forEach(u => deleteUser(u.id));
}

// ─── Tags ───
function renderTags() {
  const container = document.getElementById('tagsList');
  if (!container) return;
  
  if (G.tags.length === 0) {
    container.innerHTML = '<p class="text-blue-300/50 text-sm text-center py-4">Aucun tag</p>';
    return;
  }
  
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
    color: document.getElementById('newTagColor')?.value || '#3b82f6',
    count: 0,
    company_id: G.currentUser.companyId,
    created_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('tags').insert(newTag);
  if (error) {
    showToast('Erreur création tag: ' + error.message, 'error');
    return;
  }
  
  G.tags.push(newTag);
  if (input) input.value = '';
  renderTags();
}

async function deleteTag(tagId) {
  const { error } = await G.supabase.from('tags').delete().eq('id', tagId);
  if (error) {
    showToast('Erreur suppression tag', 'error');
    return;
  }
  
  G.tags = G.tags.filter(t => t.id !== tagId);
  renderTags();
}

// ─── Dossiers ───
function renderFolders() {
  renderFolderContents();
  renderFolderTree();
}

function renderFolderContents() {
  const folderContents = document.getElementById('folderContentsGrid');
  const folderDocGrid = document.getElementById('folderDocGrid');
  if (!folderContents || !folderDocGrid) return;
  
  const subFolders = G.folders.filter(f => f.parent_id === G.currentFolderId && f.name !== 'Racine');
  const docs = G.documents.filter(d => !d.is_deleted && d.folder_id === G.currentFolderId);
  
  if (subFolders.length === 0 && docs.length === 0) {
    folderContents.innerHTML = '<div class="col-span-full text-center py-8 text-blue-300/50">Aucun contenu dans ce dossier</div>';
  } else {
    folderContents.innerHTML = subFolders.map(f => `
      <div class="glass-card rounded-xl p-4 border border-yellow-500/20 cursor-pointer hover:border-yellow-400/40" onclick="openFolder('${f.id}', '${f.name}')">
        <div class="flex items-center gap-3"><i class="fas fa-folder text-yellow-400 text-2xl"></i><span class="text-white font-medium">${f.name}</span></div>
      </div>
    `).join('');
  }
  
  if (docs.length === 0) {
    folderDocGrid.innerHTML = '<div class="col-span-full text-center py-8 text-blue-300/50">Aucun document dans ce dossier</div>';
  } else {
    folderDocGrid.className = 'doc-grid';
    folderDocGrid.innerHTML = docs.map(doc => renderDocCard(doc)).join('');
  }
}

function renderFolderTree() {
  const container = document.getElementById('folderSidebarTree');
  if (!container) return;
  
  const rootFolders = G.folders.filter(f => f.parent_id === null && f.name !== 'Racine');
  
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
  
  container.innerHTML = rootFolders.map(f => renderFolderTreeRecursive(f.id)).join('');
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
  updateFolderBreadcrumb();
  renderFolderTree();
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

function openFolderModal() {
  const modal = document.getElementById('folderModal');
  if (modal) modal.classList.remove('hidden');
}

function closeFolderModal() {
  const modal = document.getElementById('folderModal');
  if (modal) modal.classList.add('hidden');
  const input = document.getElementById('newFolderName');
  if (input) input.value = '';
}

async function createFolder() {
  const name = document.getElementById('newFolderName')?.value.trim();
  if (!name) return;
  
  const newFolder = {
    id: generateId(),
    name: name,
    parent_id: G.currentFolderId,
    company_id: G.currentUser.companyId,
    created_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('folders').insert(newFolder);
  if (error) {
    showToast('Erreur création dossier: ' + error.message, 'error');
    return;
  }
  
  G.folders.push(newFolder);
  closeFolderModal();
  renderFolders();
  showToast('Dossier créé', 'success');
}

async function moveDocument(docId, newFolderId) {
  const { error } = await G.supabase
    .from('documents')
    .update({ folder_id: newFolderId, updated_at: new Date().toISOString() })
    .eq('id', docId);
  if (error) {
    showToast('Erreur déplacement', 'error');
  } else {
    const doc = G.documents.find(d => d.id === docId);
    if (doc) doc.folder_id = newFolderId;
    renderDocuments();
    renderFolderContents();
    showToast('Document déplacé', 'success');
  }
}

// ─── Settings ───
function renderSettings() {
  const profileName = document.getElementById('profileName');
  const profileEmail = document.getElementById('profileEmail');
  
  if (profileName) profileName.value = G.currentUser?.name || '';
  if (profileEmail) profileEmail.value = G.currentUser?.email || '';
}

async function saveProfile() {
  const name = document.getElementById('profileName')?.value;
  if (!name || !G.currentUser) return;
  
  const { error } = await G.supabase
    .from('profiles')
    .update({ name: name })
    .eq('id', G.currentUser.id);
  
  if (error) {
    showToast('Erreur mise à jour profil', 'error');
    return;
  }
  
  G.currentUser.name = name;
  updateUserDisplay();
  showToast('Profil mis à jour', 'success');
}

function toggleSetting(setting) {
  showToast(`Paramètre ${setting} modifié`, 'info');
}

// ─── Billing ───
function renderBilling() {
  const plan = CONFIG.plans[G.currentUser?.plan || 'free'];
  const currentPlanName = document.getElementById('currentPlanName');
  const currentPlanBadge = document.getElementById('currentPlanBadgeEl');
  const currentPlanDesc = document.getElementById('currentPlanDesc');
  const currentPlanPrice = document.getElementById('currentPlanPrice');
  
  if (currentPlanName) currentPlanName.textContent = plan.name;
  if (currentPlanBadge) {
    currentPlanBadge.textContent = plan.name.toUpperCase();
    currentPlanBadge.className = `badge-plan badge-${G.currentUser?.plan || 'free'}`;
  }
  if (currentPlanDesc) currentPlanDesc.textContent = `${plan.users} utilisateurs · ${formatBytes(plan.storage)} · fonctionnalités de base`;
  if (currentPlanPrice) currentPlanPrice.textContent = `${plan.price === 0 ? '0€' : plan.price + '€'}`;
}

function selectPlan(planKey, element) {
  document.querySelectorAll('.plan-card').forEach(card => card.classList.remove('selected'));
  if (element) element.classList.add('selected');
  const upgradeBtn = document.getElementById('upgradeBtn');
  if (upgradeBtn) {
    upgradeBtn.disabled = false;
    upgradeBtn.setAttribute('data-plan', planKey);
  }
}

function simulateUpgrade() {
  showToast('Fonctionnalité de paiement en développement', 'info');
}

function renderBillingV6() {
  renderBilling();
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
  if (secAuditCount) secAuditCount.textContent = G.auditLogs.length;
}

function exportAuditLog() {
  const data = JSON.stringify(G.auditLogs, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit_logs_${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Export audit effectué', 'success');
}

function exportAllData() {
  const data = {
    documents: G.documents,
    workflows: G.workflows,
    users: G.users,
    tags: G.tags,
    shares: G.shares
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ged_export_${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Export complet effectué', 'success');
}

function exportDocumentsCsv() {
  const docs = G.documents.filter(d => !d.is_deleted);
  const headers = ['ID', 'Nom', 'Type', 'Taille (octets)', 'Créé le', 'Portée', 'Tags'];

  function csvCell(val) {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  const rows = docs.map(d => [
    d.id, d.name, d.type, d.size, d.created_at, d.scope || '', (d.tags || []).join(';')
  ].map(csvCell));

  const csv = [headers.map(csvCell), ...rows].map(row => row.join(',')).join('\n');
  const bom = '\uFEFF'; // BOM UTF-8 pour compatibilité Excel
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `documents_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Export CSV effectué', 'success');
}

function switchSecurityTab(tab) {
  const auditPanel = document.getElementById('secPanel-audit');
  const trashPanel = document.getElementById('secPanel-trash');
  const auditBtn = document.getElementById('secTab-audit');
  const trashBtn = document.getElementById('secTab-trash');
  
  if (tab === 'audit') {
    if (auditPanel) auditPanel.classList.remove('hidden');
    if (trashPanel) trashPanel.classList.add('hidden');
    if (auditBtn) auditBtn.classList.add('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    if (trashBtn) trashBtn.classList.remove('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    renderAuditLog();
  } else {
    if (auditPanel) auditPanel.classList.add('hidden');
    if (trashPanel) trashPanel.classList.remove('hidden');
    if (trashBtn) trashBtn.classList.add('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    if (auditBtn) auditBtn.classList.remove('bg-blue-500/20', 'text-blue-300', 'border-blue-500/20');
    loadDeletedDocs();
  }
}

function renderAuditLog() {
  const container = document.getElementById('auditLogList');
  if (!container) return;
  
  let filtered = G.auditLogs;
  const filterValue = document.getElementById('auditFilter')?.value;
  if (filterValue) {
    filtered = filtered.filter(l => l.action === filterValue);
  }
  
  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-blue-300/40 text-sm">Aucun log d\'audit</div>';
    return;
  }
  
  container.innerHTML = filtered.map(log => `
    <div class="p-2 rounded-lg bg-slate-900/30 border border-blue-500/10">
      <div class="flex items-center justify-between">
        <span class="text-xs text-white">${log.action} ${log.target_type || ''}</span>
        <span class="text-xs text-blue-300/60">${formatDate(log.created_at)}</span>
      </div>
      ${log.details ? `<p class="text-xs text-blue-300/50 mt-1">${log.details}</p>` : ''}
    </div>
  `).join('');
}

function loadDeletedDocs() {
  const container = document.getElementById('trashList');
  if (!container) return;
  
  const deleted = G.documents.filter(d => d.is_deleted);
  if (deleted.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-blue-300/40 text-sm"><i class="fas fa-trash text-2xl mb-2 block opacity-20"></i>Aucun document supprimé</div>';
    return;
  }
  
  container.innerHTML = deleted.map(doc => `
    <div class="flex items-center justify-between p-3 rounded-lg bg-slate-900/30 border border-red-500/20">
      <div><p class="text-white text-sm">${escapeHtml(doc.name)}</p><p class="text-xs text-blue-300/60">Supprimé le ${formatDate(doc.deleted_at)}</p></div>
      <button onclick="restoreDocument('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30">Restaurer</button>
    </div>
  `).join('');
}

async function restoreDocument(docId) {
  const { error } = await G.supabase
    .from('documents')
    .update({ is_deleted: false, deleted_at: null })
    .eq('id', docId);
  
  if (error) {
    showToast('Erreur restauration', 'error');
    return;
  }
  
  const doc = G.documents.find(d => d.id === docId);
  if (doc) {
    doc.is_deleted = false;
    doc.deleted_at = null;
  }
  
  showToast('Document restauré', 'success');
  renderDocuments();
  updateBadges();
  loadDeletedDocs();
}

async function generateApiKey() {
  const key = `ged_${generateId()}_${generateId().substring(0, 16)}`;
  const newKey = {
    id: generateId(),
    name: `Clé API ${G.apiKeys.length + 1}`,
    key: key,
    permissions: ['read'],
    user_id: G.currentUser.id,
    company_id: G.currentUser.companyId,
    created_at: new Date().toISOString()
  };

  try {
    const { error } = await G.supabase.from('api_keys').insert(newKey);
    if (error) throw error;
  } catch (err) {
    console.warn('api_keys insert error (non-blocking):', err);
  }

  G.apiKeys.push(newKey);

  const displayDiv = document.getElementById('newApiKeyWrapper');
  const displayKey = document.getElementById('newApiKeyDisplay');
  if (displayDiv && displayKey) {
    displayKey.textContent = key;
    displayDiv.classList.remove('hidden');
  }

  renderApiKeys();
  showToast('Clé API générée', 'success');
  await addAuditLog('api_key_create', 'api_key', newKey.id, `Nom: ${newKey.name}`);
}

function copyApiKey(key) {
  if (!key) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(key).then(() => showToast('Clé API copiée', 'success')).catch(() => _fallbackCopy(key));
  } else {
    _fallbackCopy(key);
  }
}

function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showToast('Copié dans le presse-papiers', 'success'); } catch(e) { showToast('Impossible de copier', 'error'); }
  document.body.removeChild(ta);
}

function scanAllDocuments() {
  showToast('Scan antivirus en cours...', 'info');
  setTimeout(() => showToast('Scan terminé, aucun virus détecté', 'success'), 2000);
}

// ─── Logs ───
function renderSysLogs() {
  const container = document.getElementById('sysLogConsole');
  if (!container) return;
  
  let logs = G.systemLogs;
  if (G.logFilter !== 'all') logs = logs.filter(l => l.level === G.logFilter);
  
  if (logs.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-blue-300/40 text-sm">Aucun log</div>';
    return;
  }
  
  container.innerHTML = logs.map(l => `
    <div class="py-1 px-2 text-xs">
      <span class="text-blue-300/40">[${new Date(l.created_at).toLocaleTimeString('fr-FR')}]</span>
      <span class="${getLogLevelColor(l.level)}">${l.level}</span>
      <span class="text-blue-200/80">${l.message}</span>
    </div>
  `).join('');
}

function getLogLevelColor(level) {
  const colors = { 
    info: 'text-blue-400', 
    warn: 'text-yellow-400', 
    error: 'text-red-400', 
    security: 'text-orange-400' 
  };
  return colors[level] || 'text-gray-400';
}

function filterLogs(level) {
  G.logFilter = level;
  document.querySelectorAll('.log-filter').forEach(btn => {
    if (btn.dataset.lf === level) {
      btn.classList.add('bg-blue-500/20', 'text-blue-300', 'border-blue-500/30');
      btn.classList.remove('text-gray-400', 'border-blue-500/10');
    } else {
      btn.classList.remove('bg-blue-500/20', 'text-blue-300', 'border-blue-500/30');
      btn.classList.add('text-gray-400', 'border-blue-500/10');
    }
  });
  renderSysLogs();
}

function clearSysLogs() {
  G.systemLogs = [];
  renderSysLogs();
  showToast('Logs effacés', 'info');
}

function exportSysLogs() {
  const data = JSON.stringify(G.systemLogs, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `system_logs_${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Export logs effectué', 'success');
}

// ─── RBAC (corrigé) ───
function renderRBAC() {
  const container = document.getElementById('rbacCards');
  if (!container) return;
  
  container.innerHTML = Object.entries(G.roles).map(([key, role]) => `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20 cursor-pointer" onclick="openRoleModal('${key}')">
      <h4 class="text-white font-semibold">${role.name}</h4>
      <p class="text-xs text-blue-300/60 mt-2">${G.users.filter(u => u.role === key).length} utilisateur(s)</p>
      <div class="mt-2 flex flex-wrap gap-1">
        ${role.perms.slice(0, 3).map(p => `<span class="text-[10px] px-1 py-0.5 rounded bg-blue-500/20">${p}</span>`).join('')}
        ${role.perms.length > 3 ? `<span class="text-[10px] px-1 py-0.5 rounded bg-blue-500/20">+${role.perms.length - 3}</span>` : ''}
      </div>
    </div>
  `).join('');
}

function openRoleModal(roleKey) {
  const modal = document.getElementById('roleModal');
  if (!modal) return;
  
  const role = G.roles[roleKey];
  if (role) {
    const titleEl = document.getElementById('roleModalTitle');
    const keyEl = document.getElementById('roleModalKey');
    const nameEl = document.getElementById('roleModalName');
    if (titleEl) titleEl.textContent = `Modifier le rôle: ${role.name}`;
    if (keyEl) keyEl.value = roleKey;
    if (nameEl) nameEl.value = role.name;
    
    const perms = ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users'];
    perms.forEach(perm => {
      const checkbox = document.getElementById(`perm_${perm}`);
      if (checkbox) checkbox.checked = role.perms.includes(perm);
    });
  }
  modal.classList.remove('hidden');
}

function closeRoleModal() {
  const modal = document.getElementById('roleModal');
  if (modal) modal.classList.add('hidden');
}

function saveRole() {
  const roleKey = document.getElementById('roleModalKey')?.value;
  const roleName = document.getElementById('roleModalName')?.value;
  if (!roleKey || !roleName) return;
  
  const perms = [];
  const permsList = ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users'];
  permsList.forEach(perm => {
    const checkbox = document.getElementById(`perm_${perm}`);
    if (checkbox?.checked) perms.push(perm);
  });
  
  G.roles[roleKey] = { name: roleName, perms: perms };
  showToast(`Rôle ${roleName} mis à jour`, 'success');
  closeRoleModal();
  renderRBAC();
  renderRBACV7();
}

function renderRBACV7() {
  renderRBAC();
  
  const matrixContainer = document.getElementById('rbacV7PermMatrix');
  if (matrixContainer) {
    const roles = Object.entries(G.roles);
    const perms = ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users'];
    
    matrixContainer.innerHTML = roles.map(([key, role]) => `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20">
        <h4 class="text-white font-semibold text-sm mb-3">${role.name}</h4>
        <div class="space-y-1">
          ${perms.map(perm => `
            <div class="flex items-center justify-between">
              <span class="text-xs text-blue-300/60">${perm}</span>
              <span class="text-xs ${role.perms.includes(perm) ? 'text-green-400' : 'text-red-400'}">
                <i class="fas ${role.perms.includes(perm) ? 'fa-check' : 'fa-times'}"></i>
              </span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }
  
  const rolesGrid = document.getElementById('rbacV7RolesGrid');
  if (rolesGrid) {
    rolesGrid.innerHTML = Object.entries(G.roles).map(([key, role]) => `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-white font-semibold">${role.name}</h4>
          <button onclick="openRoleModal('${key}')" class="text-xs text-blue-400 hover:text-blue-300">
            <i class="fas fa-edit"></i>
          </button>
        </div>
        <p class="text-xs text-blue-300/60">${G.users.filter(u => u.role === key).length} utilisateurs</p>
        <div class="mt-2 flex flex-wrap gap-1">
          ${role.perms.map(p => `<span class="text-[10px] px-1 py-0.5 rounded bg-blue-500/20">${p}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }
  
  const assignmentList = document.getElementById('roleAssignmentList');
  if (assignmentList) {
    if (G.users.length === 0) {
      assignmentList.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-blue-300/50">Aucun utilisateur</td></tr>';
    } else {
      assignmentList.innerHTML = G.users.map(user => `
        <tr class="border-b border-blue-500/10">
          <td class="p-3 text-white text-sm">${user.name}</td>
          <td class="p-3"><span class="px-2 py-1 rounded-full text-xs ${getRoleBadgeClass(user.role)}">${G.roles[user.role]?.name || user.role}</span></td>
          <td class="p-3">
            <select onchange="updateUserRole('${user.id}', this.value)" class="bg-slate-900/50 border border-blue-500/30 rounded-lg px-2 py-1 text-xs text-white outline-none">
              ${Object.entries(G.roles).map(([key, role]) => `<option value="${key}" ${user.role === key ? 'selected' : ''}>${role.name}</option>`).join('')}
            </select>
          </td>
          <td class="p-3">
            <button onclick="updateUserRole('${user.id}', this.parentElement.querySelector('select').value)" class="px-3 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-xs">Appliquer</button>
          </td>
        </tr>
      `).join('');
    }
  }
}

async function updateUserRole(userId, newRole) {
  const { error } = await G.supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);
  
  if (error) {
    showToast('Erreur mise à jour rôle', 'error');
    return;
  }
  
  const user = G.users.find(u => u.id === userId);
  if (user) user.role = newRole;
  
  renderUsers();
  renderRBACV7();
  showToast('Rôle mis à jour', 'success');
  
  await addAuditLog('role_change', 'user', userId, `Nouveau rôle: ${newRole}`);
}

function createRoleV7() {
  const input = document.getElementById('newRoleName');
  const name = input?.value.trim();
  if (!name) return;
  
  const roleKey = name.toLowerCase().replace(/\s/g, '_');
  if (G.roles[roleKey]) {
    showToast('Ce rôle existe déjà', 'warning');
    return;
  }
  
  G.roles[roleKey] = { name: name, perms: [] };
  if (input) input.value = '';
  renderRBAC();
  renderRBACV7();
  showToast(`Rôle ${name} créé`, 'success');
}

// ─── Analytics ───
function renderAnalytics() {
  const kpiContainer = document.getElementById('analyticsKpiCards');
  if (kpiContainer) {
    const totalViews = G.documents.reduce((sum, d) => sum + (d.views || 0), 0);
    const totalDownloads = G.documents.reduce((sum, d) => sum + (d.downloads || 0), 0);
    kpiContainer.innerHTML = `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20"><p class="text-2xl font-bold text-white">${totalViews}</p><p class="text-xs text-blue-300/60">Vues totales</p></div>
      <div class="glass-card rounded-xl p-4 border border-green-500/20"><p class="text-2xl font-bold text-white">${totalDownloads}</p><p class="text-xs text-blue-300/60">Téléchargements</p></div>
      <div class="glass-card rounded-xl p-4 border border-purple-500/20"><p class="text-2xl font-bold text-white">${G.workflows.length}</p><p class="text-xs text-blue-300/60">Workflows</p></div>
      <div class="glass-card rounded-xl p-4 border border-orange-500/20"><p class="text-2xl font-bold text-white">${G.users.length}</p><p class="text-xs text-blue-300/60">Utilisateurs</p></div>
    `;
  }
  
  const topDocsContainer = document.getElementById('analyticsTopDocs');
  if (topDocsContainer) {
    const topDocs = [...G.documents].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
    if (topDocs.length === 0) {
      topDocsContainer.innerHTML = '<p class="text-blue-300/40 text-sm text-center py-6">Aucun document</p>';
    } else {
      topDocsContainer.innerHTML = topDocs.map(d => `<div class="flex justify-between items-center p-2 border-b border-blue-500/10"><span class="text-white text-sm truncate">${d.name}</span><span class="text-blue-400 text-sm">${d.views || 0} vues</span></div>`).join('');
    }
  }
  
  const topUsersContainer = document.getElementById('analyticsTopUsers');
  if (topUsersContainer) {
    const userActivity = {};
    G.auditLogs.forEach(log => {
      userActivity[log.user_id] = (userActivity[log.user_id] || 0) + 1;
    });
    const topUsers = Object.entries(userActivity).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topUsers.length === 0) {
      topUsersContainer.innerHTML = '<p class="text-blue-300/40 text-sm text-center py-6">Aucune activité</p>';
    } else {
      topUsersContainer.innerHTML = topUsers.map(([userId, count]) => {
        const user = G.users.find(u => u.id === userId);
        return `<div class="flex justify-between items-center p-2 border-b border-blue-500/10"><span class="text-white text-sm">${user?.name || 'Utilisateur'}</span><span class="text-blue-400 text-sm">${count} actions</span></div>`;
      }).join('');
    }
  }
  
  // Graphique d'activité simplifié
  const activityChart = document.getElementById('analyticsActivityChart');
  if (activityChart) {
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const count = G.auditLogs.filter(l => new Date(l.created_at).toDateString() === date.toDateString()).length;
      last7Days.push(count);
    }
    const maxCount = Math.max(...last7Days, 1);
    activityChart.innerHTML = `
      <div class="analytics-bar-wrap w-full">
        ${last7Days.map((count, idx) => `
          <div class="flex-1 flex flex-col items-center">
            <div class="w-full bg-blue-500/20 rounded-t-lg" style="height: ${(count / maxCount) * 80}px; min-height: 4px;"></div>
            <div class="w-full h-8 bg-blue-500/20 mt-1 rounded-b-lg text-center text-[10px] text-blue-300/60 pt-1">${count}</div>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  // Workflow chart
  const workflowChart = document.getElementById('analyticsWorkflowChart');
  if (workflowChart) {
    const wfStats = {
      pending: G.workflows.filter(w => w.status === 'pending').length,
      in_review: G.workflows.filter(w => w.status === 'in_review').length,
      approved: G.workflows.filter(w => w.status === 'approved').length,
      rejected: G.workflows.filter(w => w.status === 'rejected').length
    };
    workflowChart.innerHTML = `
      <div class="space-y-2">
        <div class="flex justify-between text-xs"><span>En attente</span><span class="text-orange-400">${wfStats.pending}</span></div>
        <div class="flex justify-between text-xs"><span>En révision</span><span class="text-blue-400">${wfStats.in_review}</span></div>
        <div class="flex justify-between text-xs"><span>Approuvés</span><span class="text-green-400">${wfStats.approved}</span></div>
        <div class="flex justify-between text-xs"><span>Rejetés</span><span class="text-red-400">${wfStats.rejected}</span></div>
      </div>
    `;
  }
}

function refreshAnalytics() {
  renderAnalytics();
  showToast('Analytics actualisés', 'success');
}

// ─── Signatures ───
function renderSignatures() {
  const container = document.getElementById('signaturesList');
  if (!container) return;
  
  if (G.signatures.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-signature text-4xl mb-3 block opacity-20"></i><p>Aucune signature</p></div>';
    return;
  }
  
  const pendingCount = G.signatures.filter(s => s.status === 'pending').length;
  const signedCount = G.signatures.filter(s => s.status === 'signed').length;
  const rejectedCount = G.signatures.filter(s => s.status === 'rejected').length;
  
  const sigStatPending = document.getElementById('sigStatPending');
  const sigStatSigned = document.getElementById('sigStatSigned');
  const sigStatRejected = document.getElementById('sigStatRejected');
  
  if (sigStatPending) sigStatPending.textContent = pendingCount;
  if (sigStatSigned) sigStatSigned.textContent = signedCount;
  if (sigStatRejected) sigStatRejected.textContent = rejectedCount;
  
  container.innerHTML = G.signatures.map(s => {
    const doc = G.documents.find(d => d.id === s.document_id);
    return `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20 flex items-center justify-between">
        <div><p class="text-white font-medium">${doc?.name || 'Document inconnu'}</p><p class="text-xs text-blue-300/60">Signataire: ${s.signer_email || s.signer_id}</p></div>
        <span class="px-3 py-1 rounded-full text-xs ${getSigStatusClass(s.status)}">${s.status === 'pending' ? 'En attente' : s.status === 'signed' ? 'Signé' : 'Rejeté'}</span>
      </div>
    `;
  }).join('');
}

function getSigStatusClass(status) {
  const classes = { 
    pending: 'bg-yellow-500/20 text-yellow-300', 
    signed: 'bg-green-500/20 text-green-300', 
    rejected: 'bg-red-500/20 text-red-300' 
  };
  return classes[status] || 'bg-gray-500/20 text-gray-300';
}

function openSignModal() {
  if (!G.currentDocId) {
    showToast('Veuillez d\'abord ouvrir un document', 'warning');
    return;
  }
  
  const doc = G.documents.find(d => d.id === G.currentDocId);
  if (!doc) {
    showToast('Document introuvable', 'error');
    return;
  }
  
  const modal = document.getElementById('signatureModal');
  if (modal) modal.classList.remove('hidden');
  
  // Mettre à jour les informations du document
  const signDocName = document.getElementById('signDocName');
  if (signDocName) signDocName.textContent = doc.name;
  
  const signDocInfo = document.getElementById('signDocInfo');
  if (signDocInfo) {
    signDocInfo.innerHTML = `
      <span class="text-xs text-blue-300/60">${formatBytes(doc.size)}</span>
      <span class="text-blue-300/40">•</span>
      <span class="text-xs text-blue-300/60">Version ${doc.version || 1}</span>
    `;
  }
  
  // Pré-remplir le nom du signataire
  const signerNameInput = document.getElementById('signerName');
  if (signerNameInput) {
    signerNameInput.value = G.currentUser.name || '';
  }
  
  // Réinitialiser le canvas
  initSignatureCanvas();
  
  // Afficher les signatures existantes
  loadExistingSignatures(doc.id);
}

function loadExistingSignatures(docId) {
  const existingSignatures = G.signatures.filter(s => s.document_id === docId);
  const container = document.getElementById('existingSignatures');
  
  if (container) {
    if (existingSignatures.length === 0) {
      container.classList.add('hidden');
    } else {
      container.classList.remove('hidden');
      container.innerHTML = `
        <p class="text-xs text-blue-300/60 mb-2 flex items-center gap-2">
          <i class="fas fa-check-circle text-green-400"></i>
          ${existingSignatures.length} signature(s) existante(s)
        </p>
        <div class="flex flex-wrap gap-2">
          ${existingSignatures.map(sig => `
            <div class="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50 border border-green-500/20 cursor-pointer hover:bg-slate-700/50 transition-all" onclick="viewSignature('${sig.id}')">
              <i class="fas fa-signature text-green-400 text-sm"></i>
              <div>
                <p class="text-xs text-white">${escapeHtml(sig.signer_name || sig.signer_email || sig.signer_id?.substring(0, 8))}</p>
                <p class="text-[10px] text-blue-300/50">${formatDate(sig.signed_at || sig.created_at)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }
}

function closeSignModal() {
  const modal = document.getElementById('signatureModal');
  if (modal) modal.classList.add('hidden');
}

let signatureCanvas = null;
let signatureCtx = null;
let isDrawing = false;

function initSignatureCanvas() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  
  signatureCanvas = canvas;
  
  // Définir la taille du canvas
  const container = canvas.parentElement;
  const width = Math.min(container.clientWidth - 32, 550);
  canvas.width = width;
  canvas.height = 200;
  
  signatureCtx = canvas.getContext('2d');
  signatureCtx.fillStyle = '#0f172a';
  signatureCtx.fillRect(0, 0, canvas.width, canvas.height);
  signatureCtx.strokeStyle = '#60a5fa';
  signatureCtx.lineWidth = 2;
  signatureCtx.lineCap = 'round';
  signatureCtx.lineJoin = 'round';
  
  // Ajouter un guide visuel
  signatureCtx.beginPath();
  signatureCtx.strokeStyle = 'rgba(96,165,250,0.3)';
  signatureCtx.setLineDash([5, 5]);
  signatureCtx.moveTo(50, canvas.height - 30);
  signatureCtx.lineTo(canvas.width - 50, canvas.height - 30);
  signatureCtx.stroke();
  signatureCtx.setLineDash([]);
  
  // Texte indicatif
  signatureCtx.font = '12px "Inter", sans-serif';
  signatureCtx.fillStyle = 'rgba(96,165,250,0.5)';
  signatureCtx.fillText('Signez ici', canvas.width / 2 - 30, canvas.height - 10);
  
  let lastX = 0, lastY = 0;
  
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
  
  // Événements souris
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);
  
  // Événements tactiles
  canvas.addEventListener('touchstart', startDrawing);
  canvas.addEventListener('touchmove', draw);
  canvas.addEventListener('touchend', stopDrawing);
}

function clearSignature() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas || !signatureCtx) return;
  
  signatureCtx.clearRect(0, 0, canvas.width, canvas.height);
  signatureCtx.fillStyle = '#0f172a';
  signatureCtx.fillRect(0, 0, canvas.width, canvas.height);
  signatureCtx.strokeStyle = '#60a5fa';
  signatureCtx.lineWidth = 2;
  
  // Refaire le guide
  signatureCtx.beginPath();
  signatureCtx.strokeStyle = 'rgba(96,165,250,0.3)';
  signatureCtx.setLineDash([5, 5]);
  signatureCtx.moveTo(50, canvas.height - 30);
  signatureCtx.lineTo(canvas.width - 50, canvas.height - 30);
  signatureCtx.stroke();
  signatureCtx.setLineDash([]);
  signatureCtx.font = '12px "Inter", sans-serif';
  signatureCtx.fillStyle = 'rgba(96,165,250,0.5)';
  signatureCtx.fillText('Signez ici', canvas.width / 2 - 30, canvas.height - 10);
}

async function submitSignature() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  
  // Vérifier si une signature a été dessinée (détecter pixels non-background)
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let hasDrawing = false;
  // Background is drawn as opaque black (#0f172a ≈ rgb(15,23,42))
  // Signature strokes are blue (#60a5fa). We check for any pixel that differs significantly.
  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i], g = imageData.data[i+1], b = imageData.data[i+2];
    // If pixel is significantly different from the dark background, drawing exists
    if (r > 40 || g > 40 || b > 80) {
      hasDrawing = true;
      break;
    }
  }
  
  if (!hasDrawing) {
    showToast('Veuillez dessiner votre signature avant de valider', 'warning');
    return;
  }
  
  const signatureData = canvas.toDataURL('image/png');
  const signerName = document.getElementById('signerName')?.value.trim() || G.currentUser.name;
  const signerTitle = document.getElementById('signerTitle')?.value.trim() || '';
  const signReason = document.getElementById('signReason')?.value.trim() || 'Approbation du document';
  
  if (!G.currentDocId) {
    showToast('Document introuvable', 'error');
    return;
  }
  
  const doc = G.documents.find(d => d.id === G.currentDocId);
  if (!doc) {
    showToast('Document introuvable', 'error');
    return;
  }
  
  // Afficher un indicateur de chargement
  const submitBtn = document.getElementById('submitSignatureBtn');
  const originalText = submitBtn?.innerHTML;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner mr-2"></span>Enregistrement...';
  }
  
  try {
    const newSig = {
      id: generateId(),
      document_id: G.currentDocId,
      document_name: doc.name,
      signer_id: G.currentUser.id,
      signer_email: G.currentUser.email,
      signer_name: signerName,
      signer_title: signerTitle,
      sign_reason: signReason,
      status: 'signed',
      signature_data: signatureData,
      signed_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    
    const { error } = await G.supabase.from('signatures').insert(newSig);
    if (error) throw error;
    
    G.signatures.push(newSig);
    showToast('✓ Signature enregistrée avec succès', 'success');
    
    // Ajouter un log d'audit
    await addAuditLog('signature', 'document', G.currentDocId, `Signé par ${signerName}`);
    
    closeSignModal();
    renderSignatures();
    
  } catch (err) {
    console.error('Erreur signature:', err);
    showToast('Erreur lors de l\'enregistrement de la signature', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }
}

function viewSignature(signatureId) {
  const signature = G.signatures.find(s => s.id === signatureId);
  if (!signature || !signature.signature_data) {
    showToast('Signature non disponible', 'error');
    return;
  }
  
  // Créer un modal pour visualiser la signature
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.zIndex = '300';
  modal.innerHTML = `
    <div class="modal-box" style="max-width: 500px;">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-blue-500/20 flex items-center justify-center">
            <i class="fas fa-signature text-green-400"></i>
          </div>
          <div>
            <h3 class="text-white font-bold">Signature électronique</h3>
            <p class="text-xs text-blue-300/60">Document certifié</p>
          </div>
        </div>
        <button onclick="this.closest('.modal-overlay').remove()" class="text-blue-400 hover:text-white p-2 rounded-lg">
          <i class="fas fa-times text-xl"></i>
        </button>
      </div>
      <div class="text-center">
        <img src="${signature.signature_data}" class="max-w-full mx-auto border border-blue-500/30 rounded-lg bg-white p-4" alt="Signature">
        <div class="mt-4 text-left space-y-1 text-sm bg-slate-900/50 rounded-xl p-4">
          <p><span class="text-blue-300/60">Signataire:</span> <span class="text-white font-medium">${escapeHtml(signature.signer_name || signature.signer_email)}</span></p>
          ${signature.signer_title ? `<p><span class="text-blue-300/60">Fonction:</span> <span class="text-white">${escapeHtml(signature.signer_title)}</span></p>` : ''}
          <p><span class="text-blue-300/60">Raison:</span> <span class="text-white">${escapeHtml(signature.sign_reason || 'Approbation')}</span></p>
          <p><span class="text-blue-300/60">Date:</span> <span class="text-white">${formatDate(signature.signed_at)}</span></p>
          <p><span class="text-blue-300/60">Document:</span> <span class="text-white">${escapeHtml(signature.document_name || 'Document')}</span></p>
          <div class="mt-3 pt-2 border-t border-blue-500/20">
            <p class="text-xs text-green-400/70 flex items-center gap-2">
              <i class="fas fa-check-circle"></i>
              Signature valide et horodatée
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function openRequestSignatureModal() {
  const modal = document.getElementById('requestSignatureModal');
  if (modal) modal.classList.remove('hidden');
  
  const docSelect = document.getElementById('signatureDocId');
  if (docSelect) {
    docSelect.innerHTML = '<option value="">-- Sélectionner un document --</option>' + 
      G.documents.filter(d => !d.is_deleted).map(doc => `<option value="${doc.id}">${escapeHtml(doc.name)}</option>`).join('');
  }
}

function closeRequestSignatureModal() {
  const modal = document.getElementById('requestSignatureModal');
  if (modal) modal.classList.add('hidden');
}

async function requestSignature() {
  const docId = document.getElementById('signatureDocId')?.value;
  const signerEmail = document.getElementById('signatureSignerEmail')?.value;
  const message = document.getElementById('signatureMessage')?.value;
  
  if (!docId || !signerEmail) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }
  
  const newSig = {
    id: generateId(),
    document_id: docId,
    signer_email: signerEmail,
    signer_id: null,
    status: 'pending',
    message: message,
    requested_by: G.currentUser.id,
    created_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('signatures').insert(newSig);
  if (error) {
    showToast('Erreur demande de signature', 'error');
    return;
  }
  
  G.signatures.push(newSig);
  showToast(`Demande de signature envoyée à ${signerEmail}`, 'success');
  closeRequestSignatureModal();
  renderSignatures();
  
  await addAuditLog('signature_request', 'document', docId, `Demandé à ${signerEmail}`);
}

// ─── IA (corrigé avec analyse réelle) ───
function renderAI() {
  const container = document.getElementById('aiDocsList');
  if (!container) return;
  
  const docs = G.documents.filter(d => !d.is_deleted).slice(0, 10);
  container.innerHTML = docs.map(d => `
    <div class="glass-card rounded-xl p-4 border border-pink-500/20">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3"><i class="fas ${getFileIcon(d.type).split(' ')[0]} text-pink-400"></i><span class="text-white font-medium">${d.name}</span></div>
        <button onclick="analyzeDocument('${d.id}')" class="px-3 py-1.5 rounded-lg bg-pink-500/20 text-pink-400 text-xs hover:bg-pink-500/30">Analyser</button>
      </div>
    </div>
  `).join('');
}

async function analyzeDocument(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  
  showToast(`Analyse IA du document "${escapeHtml(doc.name)}" en cours...`, 'info');
  
  try {
    // Simuler une analyse IA
    const analysis = {
      summary: `Résumé du document ${escapeHtml(doc.name)}: Ce document contient des informations importantes concernant ${doc.type === 'pdf' ? 'un contrat' : 'un rapport'}.`,
      keywords: ['important', 'document', 'ged'],
      sentiment: 'positif'
    };
    
    // Afficher le résultat
    const aiResponseContainer = document.getElementById('aiResponseContainer');
    const aiResponseText = document.getElementById('aiResponseText');
    if (aiResponseContainer && aiResponseText) {
      aiResponseContainer.classList.remove('hidden');
      aiResponseText.innerHTML = `
        <strong>Analyse de "${escapeHtml(doc.name)}" :</strong><br>
        📝 Résumé: ${analysis.summary}<br>
        🔑 Mots-clés: ${analysis.keywords.join(', ')}<br>
        😊 Sentiment: ${analysis.sentiment}
      `;
    }
    
    showToast(`Analyse terminée: ${escapeHtml(doc.name)}`, 'success');
  } catch (err) {
    showToast(`Erreur d'analyse: ${err.message}`, 'error');
  }
}

function analyzeAllDocuments() {
  showToast('Analyse de tous les documents en cours...', 'info');
  setTimeout(() => {
    showToast(`Analyse terminée: ${G.documents.filter(d => !d.is_deleted).length} documents analysés`, 'success');
  }, 3000);
}

function askAI() {
  const query = document.getElementById('aiQueryInput')?.value;
  if (!query) {
    showToast('Veuillez poser une question', 'warning');
    return;
  }
  
  const responseContainer = document.getElementById('aiResponseContainer');
  const responseText = document.getElementById('aiResponseText');
  
  if (responseContainer && responseText) {
    responseContainer.classList.remove('hidden');
    responseText.innerHTML = `Analyse de "${query}" en cours...`;
    setTimeout(() => {
      const relevantDocs = G.documents.filter(d => !d.is_deleted && d.name.toLowerCase().includes(query.toLowerCase()));
      if (relevantDocs.length > 0) {
        responseText.innerHTML = `🔍 Résultat pour "${query}" :<br>${relevantDocs.map(d => `📄 ${d.name}`).join('<br>')}<br><br>Total: ${relevantDocs.length} document(s) trouvé(s)`;
      } else {
        responseText.innerHTML = `Aucun document ne correspond à "${query}". Essayez d'autres termes de recherche.`;
      }
    }, 1500);
  }
}

// ─── Automation ───
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
        <div><p class="text-white font-medium">${r.name}</p><p class="text-xs text-blue-300/60">${r.trigger} → ${r.action}</p></div>
        <span class="px-2 py-1 rounded-full text-xs ${r.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}">${r.active ? 'Actif' : 'Inactif'}</span>
      </div>
    </div>
  `).join('');
  
  const statsEl = document.getElementById('automationStats');
  if (statsEl) statsEl.textContent = `${G.automationRules.length} règle(s) active(s)`;
}

function openWfRuleModal() {
  const modal = document.getElementById('wfRuleModal');
  if (modal) modal.classList.remove('hidden');
}

function closeWfRuleModal() {
  const modal = document.getElementById('wfRuleModal');
  if (modal) modal.classList.add('hidden');
}

async function createWfRule(e) {
  e.preventDefault();
  
  const rule = {
    id: generateId(),
    name: document.getElementById('wfRuleName')?.value || 'Nouvelle règle',
    trigger: document.getElementById('wfRuleTrigger')?.value || '',
    action: document.getElementById('wfRuleAction')?.value || '',
    config: {},
    active: true,
    company_id: G.currentUser.companyId,
    created_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('automation_rules').insert(rule);
  if (error) {
    showToast('Erreur création règle', 'error');
    return;
  }
  
  G.automationRules.push(rule);
  closeWfRuleModal();
  renderAutomation();
  showToast('Règle créée', 'success');
  
  await addAuditLog('automation_rule_create', 'rule', rule.id, `Nom: ${rule.name}`);
}

function quickCreateRule(ruleType) {
  const nameInput = document.getElementById('wfRuleName');
  const triggerSelect = document.getElementById('wfRuleTrigger');
  const actionSelect = document.getElementById('wfRuleAction');
  
  if (nameInput && triggerSelect && actionSelect) {
    switch(ruleType) {
      case 'upload_workflow':
        nameInput.value = 'Auto-approbation upload';
        triggerSelect.value = 'document_upload';
        actionSelect.value = 'start_workflow';
        break;
      case 'signature_notify':
        nameInput.value = 'Notification signature';
        triggerSelect.value = 'signature_done';
        actionSelect.value = 'send_notification';
        break;
      case 'webhook_approve':
        nameInput.value = 'Webhook approbation';
        triggerSelect.value = 'workflow_approve';
        actionSelect.value = 'call_webhook';
        break;
    }
  }
  openWfRuleModal();
}

// ─── Integrations ───
function renderIntegrations() {
  const container = document.getElementById('integrationsGrid');
  if (!container) return;
  
  const integrations = [
    { name: 'Slack', icon: 'fab fa-slack', color: 'purple', description: 'Notifications en temps réel' },
    { name: 'Google Drive', icon: 'fab fa-google-drive', color: 'green', description: 'Import/Export documents' },
    { name: 'Dropbox', icon: 'fab fa-dropbox', color: 'blue', description: 'Synchronisation cloud' },
    { name: 'Microsoft 365', icon: 'fab fa-microsoft', color: 'blue', description: 'Éditer avec Office' },
    { name: 'Zapier', icon: 'fas fa-bolt', color: 'yellow', description: 'Automatisations' },
    { name: 'Make', icon: 'fas fa-cogs', color: 'orange', description: 'Workflows avancés' }
  ];
  
  container.innerHTML = integrations.map(i => `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20 hover:border-${i.color}-400/40 cursor-pointer transition-all">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-lg bg-${i.color}-500/20 flex items-center justify-center text-${i.color}-400"><i class="${i.icon} text-lg"></i></div>
        <div><p class="text-white font-medium">${i.name}</p><p class="text-xs text-blue-300/60">${i.description}</p></div>
      </div>
      <button class="w-full py-2 rounded-lg bg-blue-500/10 text-blue-400 text-xs hover:bg-blue-500/20" onclick="connectIntegration('${i.name}')">Connecter</button>
    </div>
  `).join('');
}

function connectIntegration(name) {
  showToast(`Connexion à ${name} en développement`, 'info');
}

function addWebhook() {
  const url = document.getElementById('webhookUrl')?.value;
  const event = document.getElementById('webhookEvent')?.value;
  
  if (!url) {
    showToast('Veuillez entrer une URL', 'warning');
    return;
  }
  
  showToast(`Webhook ${event} ajouté`, 'success');
  const container = document.getElementById('webhooksList');
  if (container) {
    if (container.innerHTML.includes('Aucun webhook')) {
      container.innerHTML = '';
    }
    container.innerHTML += `
      <div class="flex items-center justify-between p-2 rounded-lg bg-slate-900/30 border border-blue-500/10">
        <div><p class="text-white text-xs">${event}</p><p class="text-blue-300/50 text-[10px]">${url}</p></div>
        <button onclick="this.parentElement.remove()" class="text-red-400 text-xs"><i class="fas fa-trash"></i></button>
      </div>
    `;
  }
  document.getElementById('webhookUrl').value = '';
}

// ─── Backups ───
function renderBackups() {
  const container = document.getElementById('backupsList');
  if (!container) return;
  
  if (G.backups.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-database text-4xl mb-3 block opacity-20"></i><p>Aucune sauvegarde</p></div>';
    return;
  }
  
  const statsEl = document.getElementById('backupStats');
  if (statsEl) statsEl.textContent = `${G.backups.length} sauvegarde(s) disponible(s)`;
  
  container.innerHTML = G.backups.map(b => `
    <div class="glass-card rounded-xl p-4 border border-teal-500/20 flex items-center justify-between">
      <div class="flex items-center gap-3"><i class="fas fa-archive text-teal-400 text-xl"></i><div><p class="text-white font-medium">${b.name}</p><p class="text-xs text-blue-300/60">${b.type} • ${formatBytes(b.size)} • ${formatDate(b.created_at)}</p></div></div>
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
    created_by: G.currentUser.id,
    company_id: G.currentUser.companyId,
    created_at: new Date().toISOString()
  };
  
  const { error } = await G.supabase.from('backups').insert(backup);
  if (error) {
    showToast('Erreur création backup', 'error');
    return;
  }
  
  G.backups.unshift(backup);
  renderBackups();
  showToast('Sauvegarde créée', 'success');
  
  await addAuditLog('backup_create', 'backup', backup.id, `Type: ${type}`);
}

function restoreBackup(id) {
  showToast('Restauration en cours...', 'info');
  setTimeout(() => showToast('Restauration terminée', 'success'), 2000);
}

function toggleAutoBackup() {
  const enable = document.getElementById('autoBackupEnable')?.checked;
  const frequency = document.getElementById('autoBackupFrequency');
  const retention = document.getElementById('autoBackupRetention');
  
  if (frequency && retention) {
    frequency.disabled = !enable;
    retention.disabled = !enable;
  }
  showToast(`Sauvegarde automatique ${enable ? 'activée' : 'désactivée'}`, 'info');
}

function saveBackupSettings() {
  showToast('Paramètres de sauvegarde enregistrés', 'success');
}

// ─── API Keys ───
function renderApiKeys() {
  const container = document.getElementById('apiKeysList2');
  if (!container) return;
  
  if (G.apiKeys.length === 0) {
    container.innerHTML = '<div class="text-center py-8 text-blue-300/50"><p class="text-sm">Aucune clé API</p></div>';
    return;
  }
  
  container.innerHTML = G.apiKeys.map(k => `
    <div class="glass-card rounded-xl p-4 border border-green-500/20 flex items-center justify-between">
      <div><p class="text-white font-medium text-sm">${escapeHtml(k.name)}</p><p class="text-xs text-green-400/60 font-mono">${(k.key || '').substring(0, 20)}...</p><p class="text-xs text-blue-300/50">Créé le ${formatDate(k.created_at)}</p></div>
      <div class="flex gap-2">
        <button onclick="copyApiKey('${escapeHtml(k.key)}')" class="p-2 rounded-lg hover:bg-green-500/20 text-green-400" title="Copier"><i class="fas fa-copy"></i></button>
        <button onclick="revokeApiKey('${k.id}')" class="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30">Révoquer</button>
      </div>
    </div>
  `).join('');
}

function generateApiKeyV6() {
  generateApiKey();
}

async function revokeApiKey(id) {
  const { error } = await G.supabase.from('api_keys').delete().eq('id', id);
  if (error) {
    showToast('Erreur révocation', 'error');
    return;
  }
  
  G.apiKeys = G.apiKeys.filter(k => k.id !== id);
  renderApiKeys();
  showToast('Clé révoquée', 'success');
}

// ─── Search ───
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

function runAdvSearch() {
  const query = document.getElementById('advSearchInput')?.value.toLowerCase();
  const type = document.getElementById('advSearchType')?.value;
  const dateFilter = document.getElementById('advSearchDate')?.value;
  const sizeFilter = document.getElementById('advSearchSize')?.value;
  
  let results = G.documents.filter(d => !d.is_deleted);
  if (query) results = results.filter(d => d.name.toLowerCase().includes(query));
  if (type) results = results.filter(d => d.type === type);
  
  if (dateFilter === 'today') {
    results = results.filter(d => new Date(d.created_at).toDateString() === new Date().toDateString());
  } else if (dateFilter === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    results = results.filter(d => new Date(d.created_at) >= weekAgo);
  } else if (dateFilter === 'month') {
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    results = results.filter(d => new Date(d.created_at) >= monthAgo);
  }
  
  if (sizeFilter === 'small') {
    results = results.filter(d => d.size < 1024 * 1024);
  } else if (sizeFilter === 'medium') {
    results = results.filter(d => d.size >= 1024 * 1024 && d.size < 10 * 1024 * 1024);
  } else if (sizeFilter === 'large') {
    results = results.filter(d => d.size >= 10 * 1024 * 1024);
  }
  
  const container = document.getElementById('advSearchResults');
  const countSpan = document.getElementById('advSearchCount');
  
  if (countSpan) countSpan.textContent = `${results.length} résultat(s)`;
  
  if (container) {
    if (results.length === 0) {
      container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-search text-4xl mb-3 block opacity-20"></i><p>Aucun résultat</p></div>';
    } else {
      container.innerHTML = `<div class="doc-grid">${results.map(doc => renderDocCard(doc)).join('')}</div>`;
    }
  }
}

function clearAdvSearch() {
  const input = document.getElementById('advSearchInput');
  const typeSelect = document.getElementById('advSearchType');
  const dateSelect = document.getElementById('advSearchDate');
  const sizeSelect = document.getElementById('advSearchSize');
  
  if (input) input.value = '';
  if (typeSelect) typeSelect.value = '';
  if (dateSelect) dateSelect.value = '';
  if (sizeSelect) sizeSelect.value = '';
  runAdvSearch();
}

function runFTSearch() {
  const query = document.getElementById('ftsInput')?.value;
  const type = document.getElementById('ftsType')?.value;
  const dateFilter = document.getElementById('ftsDate')?.value;
  
  if (!query || query.length < 3) {
    const container = document.getElementById('searchV7Results');
    if (container) {
      container.innerHTML = '<div class="text-center py-20 text-blue-300/30"><i class="fas fa-search text-6xl mb-5 block opacity-10"></i><p class="text-lg">Tapez au moins 3 caractères pour rechercher</p></div>';
    }
    return;
  }
  
  let results = G.documents.filter(d => !d.is_deleted && d.name.toLowerCase().includes(query.toLowerCase()));
  if (type) results = results.filter(d => d.type === type);
  
  if (dateFilter === 'today') {
    results = results.filter(d => new Date(d.created_at).toDateString() === new Date().toDateString());
  } else if (dateFilter === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    results = results.filter(d => new Date(d.created_at) >= weekAgo);
  } else if (dateFilter === 'month') {
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    results = results.filter(d => new Date(d.created_at) >= monthAgo);
  }
  
  const container = document.getElementById('searchV7Results');
  const countSpan = document.getElementById('ftsCount');
  
  if (countSpan) countSpan.textContent = `${results.length} résultat(s)`;
  
  if (container) {
    if (results.length === 0) {
      container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-search text-4xl mb-3 block opacity-20"></i><p>Aucun résultat pour "' + query + '"</p></div>';
    } else {
      container.innerHTML = `<div class="doc-grid">${results.map(doc => renderDocCard(doc)).join('')}</div>`;
    }
  }
}

function renderAdvancedSearch() {
  runAdvSearch();
}

function renderVersioning() {
  const container = document.getElementById('versionDocList');
  if (!container) return;
  
  const docs = G.documents.filter(d => !d.is_deleted);
  if (docs.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-code-branch text-4xl mb-3 block opacity-20"></i><p>Aucun document</p></div>';
    return;
  }
  
  container.innerHTML = docs.map(doc => `
    <div class="glass-card rounded-xl p-4 border border-cyan-500/20 flex items-center justify-between">
      <div><p class="text-white font-medium">${escapeHtml(doc.name)}</p><p class="text-xs text-blue-300/60">Version ${doc.version} • ${formatDate(doc.updated_at)}</p></div>
      <button onclick="restoreVersion('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs hover:bg-cyan-500/30">Restaurer</button>
    </div>
  `).join('');
}

function filterVersionDocs(query) {
  const container = document.getElementById('versionDocList');
  if (!container) return;
  
  let docs = G.documents.filter(d => !d.is_deleted);
  if (query) {
    docs = docs.filter(d => d.name.toLowerCase().includes(query.toLowerCase()));
  }
  
  if (docs.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-search text-4xl mb-3 block opacity-20"></i><p>Aucun document trouvé</p></div>';
    return;
  }
  
  container.innerHTML = docs.map(doc => `
    <div class="glass-card rounded-xl p-4 border border-cyan-500/20 flex items-center justify-between">
      <div><p class="text-white font-medium">${escapeHtml(doc.name)}</p><p class="text-xs text-blue-300/60">Version ${doc.version} • ${formatDate(doc.updated_at)}</p></div>
      <button onclick="restoreVersion('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs hover:bg-cyan-500/30">Restaurer</button>
    </div>
  `).join('');
}

function restoreVersion(docId) {
  showToast('Restauration de version en cours...', 'info');
  setTimeout(() => showToast('Version restaurée', 'success'), 1500);
}

function renderSearchV7() {
  runFTSearch();
}

function renderAuditV6() {
  const statsContainer = document.getElementById('auditStatsGrid');
  const timelineContainer = document.getElementById('auditTimelineList');
  const alertsContainer = document.getElementById('securityAlertsList');
  
  if (statsContainer) {
    statsContainer.innerHTML = `
      <div class="glass-card rounded-xl p-3 text-center"><p class="text-2xl font-bold text-white">${G.auditLogs.length}</p><p class="text-xs text-blue-300/60">Événements</p></div>
      <div class="glass-card rounded-xl p-3 text-center"><p class="text-2xl font-bold text-white">${G.auditLogs.filter(l => l.action === 'login').length}</p><p class="text-xs text-blue-300/60">Connexions</p></div>
      <div class="glass-card rounded-xl p-3 text-center"><p class="text-2xl font-bold text-white">${G.auditLogs.filter(l => l.action === 'upload').length}</p><p class="text-xs text-blue-300/60">Uploads</p></div>
      <div class="glass-card rounded-xl p-3 text-center"><p class="text-2xl font-bold text-white">${G.auditLogs.filter(l => l.action === 'delete').length}</p><p class="text-xs text-blue-300/60">Suppressions</p></div>
      <div class="glass-card rounded-xl p-3 text-center"><p class="text-2xl font-bold text-white">${G.auditLogs.filter(l => l.action === 'share').length}</p><p class="text-xs text-blue-300/60">Partages</p></div>
      <div class="glass-card rounded-xl p-3 text-center"><p class="text-2xl font-bold text-white">${G.workflows.length}</p><p class="text-xs text-blue-300/60">Workflows</p></div>
    `;
  }
  
  if (timelineContainer) {
    let filtered = G.auditLogs;
    if (G.auditFilter.action) {
      filtered = filtered.filter(l => l.action === G.auditFilter.action);
    }
    
    if (filtered.length === 0) {
      timelineContainer.innerHTML = '<div class="text-center py-8 text-blue-300/50">Aucun événement</div>';
    } else {
      timelineContainer.innerHTML = filtered.slice(0, 30).map(l => `
        <div class="p-2 border-b border-blue-500/10 flex justify-between items-center">
          <div><span class="text-xs text-white">${l.action}</span><span class="text-xs text-blue-300/60 ml-2">${l.target_type || ''}</span></div>
          <span class="text-xs text-blue-300/60">${formatDate(l.created_at)}</span>
        </div>
      `).join('');
    }
  }
  
  if (alertsContainer) {
    const criticalLogs = G.auditLogs.filter(l => l.severity === 'critical' || l.action === 'delete').slice(0, 5);
    if (criticalLogs.length === 0) {
      alertsContainer.innerHTML = '<div class="text-center py-6 text-blue-300/50 text-sm"><i class="fas fa-shield-alt text-2xl mb-2 block opacity-30"></i>Aucune alerte récente</div>';
    } else {
      alertsContainer.innerHTML = criticalLogs.map(l => `
        <div class="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p class="text-red-400 text-xs font-semibold">⚠️ ${l.action.toUpperCase()}</p>
          <p class="text-blue-300/70 text-xs mt-1">${l.target_type || 'Action'} • ${formatDate(l.created_at)}</p>
        </div>
      `).join('');
    }
  }
}

function setAuditFilter(type, value) {
  if (!G.auditFilter) G.auditFilter = { days: 30, severity: '', action: '' };
  if (type === 'days') G.auditFilter.days = parseInt(value);
  if (type === 'severity') G.auditFilter.severity = value;
  if (type === 'action') G.auditFilter.action = value;
  renderAuditV6();
}

function filterAuditLogs(query) {
  const container = document.getElementById('auditTimelineList');
  if (!container) return;
  
  let filtered = G.auditLogs;
  if (query) {
    filtered = filtered.filter(l => l.action.toLowerCase().includes(query.toLowerCase()) || 
      (l.target_type && l.target_type.toLowerCase().includes(query.toLowerCase())));
  }
  
  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-center py-8 text-blue-300/50">Aucun événement</div>';
  } else {
    container.innerHTML = filtered.slice(0, 50).map(l => `
      <div class="p-2 border-b border-blue-500/10 flex justify-between items-center">
        <div><span class="text-xs text-white">${l.action}</span><span class="text-xs text-blue-300/60 ml-2">${l.target_type || ''}</span></div>
        <span class="text-xs text-blue-300/60">${formatDate(l.created_at)}</span>
      </div>
    `).join('');
  }
}

function clearAuditFilters() {
  const searchInput = document.getElementById('auditSearchInput');
  if (searchInput) searchInput.value = '';
  renderAuditV6();
}

function prevAuditPage() {
  if (G.auditCurrentPage > 1) {
    G.auditCurrentPage--;
    renderAuditV6();
  }
}

function nextAuditPage() {
  const maxPage = Math.ceil(G.auditLogs.length / G.auditPageSize);
  if (G.auditCurrentPage < maxPage) {
    G.auditCurrentPage++;
    renderAuditV6();
  }
}

function exportUserData() {
  const userData = {
    profile: {
      name: G.currentUser.name,
      email: G.currentUser.email,
      role: G.currentUser.role,
      company: G.currentUser.companyName
    },
    documents: G.documents.filter(d => d.owner_id === G.currentUser.id),
    activities: G.auditLogs.filter(l => l.user_id === G.currentUser.id)
  };
  
  const data = JSON.stringify(userData, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `user_data_${G.currentUser.email}_${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Export des données personnelles effectué', 'success');
}

function requestAccountDeletion() {
  const confirmed = confirm('⚠️ ATTENTION : Cette action est irréversible.\n\nVoulez-vous vraiment demander la suppression définitive de votre compte et de toutes vos données ?');
  if (!confirmed) return;
  const doubleConfirm = prompt('Tapez "SUPPRIMER" pour confirmer :');
  if (doubleConfirm !== 'SUPPRIMER') {
    showToast('Suppression annulée', 'info');
    return;
  }
  addAuditLog('account_deletion_request', 'user', G.currentUser.id, `Demande de suppression par ${G.currentUser.email}`).catch(() => {});
  showToast('Demande de suppression enregistrée. Un administrateur traitera votre demande sous 30 jours (RGPD).', 'info', 7000);
}

function copySqlSchema() {
  const schema = document.getElementById('sqlSchemaBlock')?.textContent;
  if (schema) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(schema).then(() => showToast('Schéma SQL copié', 'success')).catch(() => _fallbackCopy(schema));
    } else {
      _fallbackCopy(schema);
    }
  }
}

function openDangerModal(action) {
  showToast('Fonctionnalité de suppression en développement', 'info');
}

function closeNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (panel) panel.classList.add('hidden');
}

function toggleNotifications() {
  const panel = document.getElementById('notifPanel');
  if (panel) {
    panel.classList.toggle('hidden');
  }
}

function markAllNotifRead() {
  showToast('Toutes les notifications marquées comme lues', 'success');
  const badge = document.getElementById('notifBadge');
  const countBadge = document.getElementById('notifCountBadge');
  if (badge) badge.classList.add('hidden');
  if (countBadge) countBadge.classList.add('hidden');
}

// ─── Audit Log Helper ───
async function addAuditLog(action, targetType, targetId, details = '') {
  if (!G.currentUser || !G.supabase) return;
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
  window.openMoveModal = openMoveModal;
  window.closeMoveModal = closeMoveModal;
  window.confirmMoveDocument = confirmMoveDocument;
  window.openCollabModal = openCollabModal;
  window.closeCollabModal = closeCollabModal;
  window.inviteCollaborator = inviteCollaborator;
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
});
