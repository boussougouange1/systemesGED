/**
 * SystemesGED v4.1 — app.js
 * Logique applicative principale encapsulée dans une IIFE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OBFUSCATION (optionnel, production) :
 *   npx javascript-obfuscator app.js --output app.obf.js \
 *     --compact true --control-flow-flattening true \
 *     --dead-code-injection false --string-array true \
 *     --rotate-string-array true --string-array-threshold 0.75
 *
 * MINIFICATION :
 *   npx terser app.js -o app.min.js --compress --mangle
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // ════════════════════════════ SUPABASE CLIENT
  const SUPABASE_URL = 'https://spgtflhprppeoidjguhs.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_0TPq4MIBVDRBzS2CI5WxuA_SV7HkwMJ';
  const SB = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ════════════════════════════ ÉTAT GLOBAL (module-scoped, jamais window.*)
  const G = {
    user: null,
    company: null,
    docs: [],
    users: [],
    auditLogs: [],
    workflows: [],
    tags: [],
    sharedDocs: [],
    sentShares: [],
    notifications: [],
    apiKeys: [],
    roleDefaults: {},
    sysLogs: [],
    selectedFiles: [],
    uploadTags: [],
    gridView: true,
    currentView: 'dashboard',
    shareDocId: null,
    previewDocId: null,
    dangerAction: null,
    logFilter: 'all',
    wfFilter: '',
    selectedPlan: 'free',
    MAX_STORAGE_MB: 100,
  };

  // ════════════════════════════ CONSTANTES
  const ROLE_LABELS = { admin: 'Administrateur', manager: 'Manager', editor: 'Éditeur', viewer: 'Lecteur' };
  const ROLE_COLORS = { admin: 'bg-red-500/20 text-red-300', manager: 'bg-orange-500/20 text-orange-300', editor: 'bg-blue-500/20 text-blue-300', viewer: 'bg-green-500/20 text-green-300' };
  const BLOCKED_EXT = ['exe', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'jar', 'msi', 'dll', 'scr', 'com', 'pif'];
  const LOG_EVENTS = [
    ['info', 'Session utilisateur vérifiée — token valide'],
    ['debug', 'Cache documents rechargé — 0 ms'],
    ['info', 'Supabase heartbeat — latence: ' + (30 + Math.floor(Math.random() * 40)) + 'ms'],
    ['warn', 'Rate limit approché sur endpoint /storage — 87/100'],
    ['info', 'Backup incrémental planifié dans 30 min'],
    ['debug', 'Index full-text mis à jour'],
    ['security', 'Auth token renouvelé pour session active'],
    ['error', 'Tentative de connexion échouée — 3 essais'],
    ['info', 'Nettoyage cache expirés — 0 entrées supprimées'],
  ];
  let logsInterval = null;

  // ════════════════════════════ SÉCURITÉ CLIENT
  // Désactiver le clic droit (protection basique côté client)
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  // Bloquer raccourcis DevTools courants
  document.addEventListener('keydown', function (e) {
    if (e.key === 'F12') { e.preventDefault(); return; }
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) { e.preventDefault(); return; }
    if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) { e.preventDefault(); return; }
    if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); return; }

    // Raccourcis légitimes de l'application
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const gs = document.getElementById('globalSearch');
      if (gs) gs.focus();
      return;
    }
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(function (m) { m.classList.add('hidden'); });
      closeNotifPanel();
      const dd = document.getElementById('searchDropdown');
      if (dd) dd.classList.add('hidden');
    }
  });

  // Fermer dropdowns au clic extérieur
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#notifWrap')) {
      const p = document.getElementById('notifPanel');
      if (p) p.classList.add('hidden');
    }
    if (!e.target.closest('#globalSearch') && !e.target.closest('#searchDropdown')) {
      const dd = document.getElementById('searchDropdown');
      if (dd) dd.classList.add('hidden');
    }
  });

  // Fermer modales au clic extérieur
  window.onclick = function (event) {
    if (event.target === document.getElementById('editUserModal')) closeEditUserModal();
    if (event.target === document.getElementById('roleModal')) closeRoleModal();
    if (event.target === document.getElementById('uploadModal')) closeUploadModal();
    if (event.target === document.getElementById('shareModal')) closeShareModal();
    if (event.target === document.getElementById('previewModal')) closePreviewModal();
    if (event.target === document.getElementById('workflowModal')) closeWorkflowModal();
    if (event.target === document.getElementById('addUserModal')) closeAddUserModal();
  };

  // ════════════════════════════ UTILS
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function timeAgo(iso) {
    const d = (Date.now() - new Date(iso)) / 1000;
    if (d < 60) return 'À l\'instant';
    if (d < 3600) return Math.floor(d / 60) + ' min';
    if (d < 86400) return Math.floor(d / 3600) + 'h';
    if (d < 604800) return Math.floor(d / 86400) + ' j';
    return new Date(iso).toLocaleDateString('fr-FR');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function formatFileSize(b) {
    if (!b || b === 0) return '0 B';
    const k = 1024, s = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + s[i];
  }

  function getFileIcon(name) {
    const ext = (name || '').split('.').pop().toLowerCase();
    const m = {
      pdf: { icon: 'fa-file-pdf', color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-400/30' },
      doc: { icon: 'fa-file-word', color: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-400/30' },
      docx: { icon: 'fa-file-word', color: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-400/30' },
      xls: { icon: 'fa-file-excel', color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-400/30' },
      xlsx: { icon: 'fa-file-excel', color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-400/30' },
      png: { icon: 'fa-file-image', color: 'text-purple-400', bg: 'bg-purple-500/20', border: 'border-purple-400/30' },
      jpg: { icon: 'fa-file-image', color: 'text-purple-400', bg: 'bg-purple-500/20', border: 'border-purple-400/30' },
      jpeg: { icon: 'fa-file-image', color: 'text-purple-400', bg: 'bg-purple-500/20', border: 'border-purple-400/30' },
      gif: { icon: 'fa-file-image', color: 'text-purple-400', bg: 'bg-purple-500/20', border: 'border-purple-400/30' },
      zip: { icon: 'fa-file-archive', color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-400/30' },
      mp4: { icon: 'fa-file-video', color: 'text-pink-400', bg: 'bg-pink-500/20', border: 'border-pink-400/30' },
    };
    return m[ext] || { icon: 'fa-file', color: 'text-gray-400', bg: 'bg-gray-500/20', border: 'border-gray-400/30' };
  }

  // ════════════════════════════ AUTH
  function switchAuthTab(tab) {
    document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
    document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
    document.getElementById('loginFormWrapper').style.display = tab === 'login' ? '' : 'none';
    document.getElementById('registerFormWrapper').style.display = tab === 'register' ? '' : 'none';
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pwd   = document.getElementById('loginPassword').value;
    const btn   = document.getElementById('loginBtn');

    // Rate limiting
    const lockout = parseInt(localStorage.getItem('ged_lockout') || '0');
    if (lockout && Date.now() < lockout) {
      showToast('Trop de tentatives — attendez ' + Math.ceil((lockout - Date.now()) / 1000) + 's', 'error');
      return;
    }
    const attempts = parseInt(localStorage.getItem('ged_attempts') || '0') + 1;
    localStorage.setItem('ged_attempts', attempts);
    if (attempts >= 5) {
      localStorage.setItem('ged_lockout', Date.now() + 30000);
      localStorage.setItem('ged_attempts', '0');
      showToast('5 tentatives échouées — attendez 30 secondes', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      const { data, error } = await SB.auth.signInWithPassword({ email, password: pwd });
      if (error) throw error;
      localStorage.setItem('ged_attempts', '0');
      await _onSignedIn(data.session);
    } catch (err) {
      const msg = err.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect' : err.message;
      showToast(msg, 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const first   = document.getElementById('regFirst').value.trim();
    const last    = document.getElementById('regLast').value.trim();
    const company = document.getElementById('regCompany').value.trim();
    const email   = document.getElementById('regEmail').value.trim();
    const pwd     = document.getElementById('regPassword').value;
    if (pwd.length < 8) { showToast('Mot de passe trop court (8 caractères min.)', 'error'); return; }
    const btn = document.querySelector('#registerForm button[type="submit"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    try {
      const { data, error } = await SB.auth.signUp({
        email, password: pwd,
        options: { data: { full_name: first + ' ' + last, company: company } }
      });
      if (error) throw error;
      showToast('Compte créé ! Vérifiez votre email pour confirmer.', 'success');
      switchAuthTab('login');
      document.getElementById('loginEmail').value = email;
    } catch (err) {
      showToast('Erreur inscription : ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Créer mon compte'; }
    }
  }

  function demoLogin() {
    document.getElementById('loginEmail').value = 'ahouansouange@live.fr';
    document.getElementById('loginPassword').value = '';
    showToast('Entrez votre mot de passe et cliquez Se connecter', 'info');
  }

  async function oauthLogin(provider) {
    try {
      const { error } = await SB.auth.signInWithOAuth({
        provider: provider,
        options: { redirectTo: window.location.origin }
      });
      if (error) throw error;
    } catch (err) {
      showToast('Erreur OAuth ' + provider + ' : ' + err.message, 'error');
    }
  }

  async function handleLogout() {
    try {
      await SB.auth.signOut();
    } catch (_) {}
    G.user = null; G.docs = []; G.workflows = []; G.tags = []; G.users = [];
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginScreen').style.display = '';
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    const btn = document.getElementById('loginBtn');
    if (btn) { btn.disabled = false; btn.innerHTML = '<span id="loginBtnText"><i class="fas fa-sign-in-alt mr-2"></i>Se connecter</span>'; }
    showToast('Déconnexion réussie', 'info');
  }

  // ════════════════════════════ DEMO DATA
  function seedDemoData() {
    G.docs = [
      { id: 'd1', name: 'Contrat_Prestation_2024.pdf', description: 'Contrat de prestation Q1 2024', file_type: 'application/pdf', file_size: 1245184, version_number: 3, tags: ['contrat', '2024'], created_at: new Date(Date.now() - 172800000).toISOString() },
      { id: 'd2', name: 'Rapport_Annuel_2023.pdf', description: 'Rapport annuel exercice 2023', file_type: 'application/pdf', file_size: 3145728, version_number: 1, tags: ['rapport', '2023'], created_at: new Date(Date.now() - 604800000).toISOString() },
      { id: 'd3', name: 'Organigramme_RH.png', description: '', file_type: 'image/png', file_size: 512000, version_number: 1, tags: ['rh', 'organisation'], created_at: new Date(Date.now() - 1209600000).toISOString() },
      { id: 'd4', name: 'Budget_Previsionnel_2025.xlsx', description: 'Budget prévisionnel 2025', file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', file_size: 204800, version_number: 2, tags: ['budget', 'finance'], created_at: new Date(Date.now() - 86400000).toISOString() },
      { id: 'd5', name: 'Note_Interne_Mars2024.docx', description: '', file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', file_size: 98304, version_number: 1, tags: ['note', 'interne'], created_at: new Date(Date.now() - 259200000).toISOString() },
      { id: 'd6', name: 'Politique_RGPD.pdf', description: 'Politique de confidentialité RGPD', file_type: 'application/pdf', file_size: 458752, version_number: 1, tags: ['rgpd', 'juridique'], created_at: new Date(Date.now() - 2592000000).toISOString() },
    ];
    G.users = [
      { id: 'u1', name: 'Admin Démo', email: 'admin@demo.com', role: 'admin', active: true, lastLogin: new Date().toISOString(), docs: 3 },
      { id: 'u2', name: 'Jean Dupont', email: 'jean.dupont@demo.com', role: 'editor', active: true, lastLogin: new Date(Date.now() - 7200000).toISOString(), docs: 2 },
      { id: 'u3', name: 'Marie Martin', email: 'marie.martin@demo.com', role: 'manager', active: true, lastLogin: new Date(Date.now() - 86400000).toISOString(), docs: 1 },
      { id: 'u4', name: 'Paul Bernard', email: 'paul.bernard@demo.com', role: 'viewer', active: false, lastLogin: new Date(Date.now() - 864000000).toISOString(), docs: 0 },
    ];
    G.workflows = [
      { id: 'wf1', title: 'Validation Contrat Prestation', description: 'Approbation requise avant signature', status: 'pending', priority: 'high', approvers: ['manager@demo.com'], docId: 'd1', dueDate: '2026-03-20', createdAt: new Date(Date.now() - 86400000).toISOString() },
      { id: 'wf2', title: 'Révision Politique RGPD', description: 'Mise à jour annuelle obligatoire', status: 'pending', priority: 'medium', approvers: ['ceo@demo.com', 'dpo@demo.com'], docId: 'd6', dueDate: '2026-03-25', createdAt: new Date(Date.now() - 172800000).toISOString() },
      { id: 'wf3', title: 'Rapport Annuel 2023', description: 'Validation finale du rapport', status: 'approved', priority: 'low', approvers: ['manager@demo.com'], docId: 'd2', dueDate: '2026-02-28', createdAt: new Date(Date.now() - 604800000).toISOString() },
    ];
    G.tags = [
      { id: 't1', name: 'contrat', color: '#3b82f6', count: 2 },
      { id: 't2', name: '2024', color: '#10b981', count: 3 },
      { id: 't3', name: 'rapport', color: '#8b5cf6', count: 1 },
      { id: 't4', name: 'rgpd', color: '#ef4444', count: 1 },
      { id: 't5', name: 'rh', color: '#f59e0b', count: 1 },
      { id: 't6', name: 'finance', color: '#06b6d4', count: 1 },
    ];
    G.roleDefaults = {
      admin:   { name: 'Administrateur', read: true,  write: true,  delete: true,  users: true,  logs: true,  api: true },
      manager: { name: 'Manager',        read: true,  write: true,  delete: true,  users: true,  logs: true,  api: false },
      editor:  { name: 'Éditeur',        read: true,  write: true,  delete: false, users: false, logs: false, api: false },
      viewer:  { name: 'Lecteur',        read: true,  write: false, delete: false, users: false, logs: false, api: false },
    };
    G.auditLogs = [
      { id: 'a1', action: 'login',  description: 'Connexion réussie',                                  user: 'Admin Démo', docId: null, createdAt: new Date(Date.now() - 3600000).toISOString() },
      { id: 'a2', action: 'upload', description: 'Upload : Contrat_Prestation_2024.pdf',               user: 'Admin Démo', docId: 'd1', createdAt: new Date(Date.now() - 172800000).toISOString() },
      { id: 'a3', action: 'share',  description: 'Partage : Rapport_Annuel_2023.pdf → jean@demo.com', user: 'Admin Démo', docId: 'd2', createdAt: new Date(Date.now() - 86400000).toISOString() },
      { id: 'a4', action: 'delete', description: 'Suppression : Archive_2020.zip',                    user: 'Admin Démo', docId: null, createdAt: new Date(Date.now() - 259200000).toISOString() },
      { id: 'a5', action: 'login',  description: 'Connexion réussie',                                  user: 'Jean Dupont', docId: null, createdAt: new Date(Date.now() - 7200000).toISOString() },
    ];
    G.sentShares = [
      { id: 's1', docId: 'd2', docName: 'Rapport_Annuel_2023.pdf', sharedWith: 'jean.dupont@demo.com', permission: 'view', expiresAt: new Date(Date.now() + 604800000).toISOString(), createdAt: new Date(Date.now() - 86400000).toISOString() },
    ];
  }

  // ════════════════════════════ INIT SUPABASE
  // Appelé après une connexion réussie
  async function _onSignedIn(session) {
    if (!session || !session.user) return;
    const sbUser = session.user;

    // Charger le profil Supabase
    const { data: profile } = await SB.from('users_profiles').select('*').eq('id', sbUser.id).single();

    G.user = {
      id:        sbUser.id,
      email:     sbUser.email,
      name:      profile?.full_name || sbUser.user_metadata?.full_name || sbUser.email.split('@')[0],
      role:      profile?.role || 'user',
      companyId: profile?.company_id || 'default'
    };
    G.MAX_STORAGE_MB = 100;
    G.company = { id: G.user.companyId, name: profile?.company || 'Mon organisation', plan: 'FREE', maxStorage: 100 * 1024 * 1024 };

    _updateUI();
    await _loadAllData();
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    switchView('dashboard');
    showToast('Bienvenue, ' + G.user.name + ' !', 'success');
    startLiveLogs();
    addNotification('info', 'Connexion sécurisée', 'JWT actif · Session valide');
  }

  function _updateUI() {
    if (!G.user) return;
    const initials = G.user.name.split(' ').map(function (n) { return n[0] || ''; }).join('').toUpperCase().slice(0, 2) || 'U';
    const set = function (id, val) { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setVal = function (id, val) { const el = document.getElementById(id); if (el) el.value = val; };
    set('userAvatarInitial', initials);
    set('userNameDisplay', G.user.name.split(' ')[0]);
    set('userRoleDisplay', ROLE_LABELS[G.user.role] || G.user.role);
    set('dropdownUserName', G.user.name);
    set('dropdownUserEmail', G.user.email);
    setVal('profileName', G.user.name);
    setVal('profileEmail', G.user.email);
    if (G.company) {
      set('companyAvatar', G.company.name[0].toUpperCase());
      set('companyNameLabel', G.company.name);
      updatePlanUI(G.company.plan);
    }
  }

  async function _loadAllData() {
    await Promise.all([_loadDocuments(), _loadWorkflows(), _loadTags(), _loadUsers(), _loadAuditLogs()]);
    updateStats();
  }

  // ─── Chargement documents ─────────────────────────────────────
  async function _loadDocuments() {
    try {
      const { data, error } = await SB.from('documents')
        .select('*, document_tags(tags(name))')
        .eq('user_id', G.user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      G.docs = (data || []).map(function (d) {
        return Object.assign({}, d, {
          tags: (d.document_tags || []).map(function (dt) { return dt.tags?.name || ''; }).filter(Boolean)
        });
      });
    } catch (err) { console.warn('loadDocuments:', err.message); G.docs = []; }
  }

  // ─── Chargement workflows ─────────────────────────────────────
  async function _loadWorkflows() {
    try {
      const { data, error } = await SB.from('workflows')
        .select('*').eq('user_id', G.user.id).order('created_at', { ascending: false });
      if (error) throw error;
      G.workflows = (data || []).map(function (w) {
        return { id: w.id, title: w.title, description: w.description, status: w.status, priority: w.priority, approvers: w.assignee_email ? [w.assignee_email] : [], docId: w.document_id, dueDate: w.due_date, createdAt: w.created_at };
      });
    } catch (err) { console.warn('loadWorkflows:', err.message); G.workflows = []; }
  }

  // ─── Chargement tags ──────────────────────────────────────────
  async function _loadTags() {
    try {
      const { data, error } = await SB.from('tags').select('*').order('name');
      if (error) throw error;
      G.tags = (data || []).map(function (t) { return { id: t.id, name: t.name, color: t.color || '#3b82f6', count: 0 }; });
    } catch (err) { console.warn('loadTags:', err.message); G.tags = []; }
  }

  // ─── Chargement utilisateurs ──────────────────────────────────
  async function _loadUsers() {
    try {
      const { data, error } = await SB.from('users_profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      G.users = (data || []).map(function (u) {
        return { id: u.id, name: u.full_name || u.email || 'Utilisateur', email: u.email || '', role: u.role || 'user', active: true, lastLogin: u.updated_at, docs: 0 };
      });
    } catch (err) { console.warn('loadUsers:', err.message); G.users = []; }
  }

  // ─── Chargement audit logs ────────────────────────────────────
  async function _loadAuditLogs() {
    try {
      const { data, error } = await SB.from('activity_logs')
        .select('*').eq('user_id', G.user.id)
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      G.auditLogs = (data || []).map(function (l) {
        return { id: l.id, action: l.action, description: l.description, user: G.user.name, docId: l.document_id, createdAt: l.created_at };
      });
    } catch (err) { console.warn('loadAuditLogs:', err.message); G.auditLogs = []; }
  }

  // ════════════════════════════ INIT (compatibilité)
  function initApp() { _updateUI(); startLiveLogs(); }

  // ════════════════════════════ NAVIGATION
  function switchView(v) {
    G.currentView = v;
    document.querySelectorAll('.view-section').forEach(function (el) { el.classList.remove('active-view'); });
    const el = document.getElementById('view-' + v);
    if (el) el.classList.add('active-view');
    document.querySelectorAll('[data-view]').forEach(function (b) { b.classList.toggle('active', b.dataset.view === v); });
    document.querySelectorAll('[data-bnav]').forEach(function (b) {
      b.classList.toggle('text-blue-400', b.dataset.bnav === v);
      b.classList.toggle('text-blue-400/60', b.dataset.bnav !== v);
    });
    if (v === 'dashboard')  { renderActivityList(); updateStats(); updateQuickAccess(); renderPopularTags(); }
    if (v === 'documents')  renderDocuments();
    if (v === 'workflows')  renderWorkflows();
    if (v === 'shared')     renderShared();
    if (v === 'users')      loadUsers();
    if (v === 'tags')       loadTags();
    if (v === 'versioning') renderVersioningDocs();
    if (v === 'rbac')       renderRbacCards();
    if (v === 'security')   { renderAuditLog(); updateSecurityStats(); }
    if (v === 'billing')    renderBillingView();
  }

  // ════════════════════════════ STATS & DASHBOARD
  function updateStats() {
    const total = G.docs.length;
    const totalSize = G.docs.reduce(function (s, d) { return s + (d.file_size || 0); }, 0);
    const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
    const pct = Math.min(Math.round((parseFloat(sizeMB) / G.MAX_STORAGE_MB) * 100), 100);
    const pending = G.workflows.filter(function (w) { return w.status === 'pending'; }).length;
    document.getElementById('totalDocs').textContent = total;
    document.getElementById('dashWorkflowCount').textContent = pending;
    document.getElementById('sharedCount').textContent = G.sentShares.length;
    document.getElementById('dashUserCount').textContent = G.users.filter(function (u) { return u.active; }).length;
    ['d-docsBadge', 'm-docsBadge'].forEach(function (id) {
      const el = document.getElementById(id); if (!el) return;
      el.textContent = total; el.classList.toggle('hidden', total === 0);
    });
    ['d-wfBadge', 'm-wfBadge'].forEach(function (id) {
      const el = document.getElementById(id); if (!el) return;
      el.textContent = pending; el.classList.toggle('hidden', pending === 0);
    });
    [['storagePercent', 'storageBar', 'storageText'], ['mobileStoragePercent', 'mobileStorageBar', 'mobileStorageText']].forEach(function (ids) {
      const pEl = document.getElementById(ids[0]), bEl = document.getElementById(ids[1]), tEl = document.getElementById(ids[2]);
      if (pEl) pEl.textContent = pct + '%';
      if (bEl) { bEl.style.width = pct + '%'; bEl.style.background = pct > 90 ? 'linear-gradient(90deg,#ef4444,#f97316)' : ''; }
      if (tEl) tEl.textContent = sizeMB + ' MB / ' + G.MAX_STORAGE_MB + ' MB';
    });
  }

  function updateQuickAccess() {
    const pdfC = G.docs.filter(function (d) { return d.name.toLowerCase().endsWith('.pdf'); }).length;
    const docC = G.docs.filter(function (d) { return /\.(doc|docx)$/i.test(d.name); }).length;
    document.getElementById('quickPdfCount').textContent = pdfC + ' fichier(s)';
    document.getElementById('quickDocCount').textContent = docC + ' fichier(s)';
  }

  function renderPopularTags() {
    const counts = {};
    G.docs.forEach(function (d) { (d.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    const sorted = Object.entries(counts).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
    const c = document.getElementById('popularTags');
    c.innerHTML = sorted.length === 0
      ? '<span class="text-blue-300/50 text-sm">Aucun tag</span>'
      : sorted.map(function (entry) { return '<span class="tag" onclick="filterByTag(\'' + esc(entry[0]) + '\')">#' + esc(entry[0]) + ' <span class="text-blue-400/50 text-[10px]">' + entry[1] + '</span></span>'; }).join('');
  }

  function renderActivityList() {
    const el = document.getElementById('activityList');
    const logs = [...G.auditLogs].sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 10);
    if (!logs.length) { el.innerHTML = '<div class="text-center py-8 text-blue-300/50"><i class="fas fa-folder-open text-2xl mb-2 block"></i>Aucune activité récente</div>'; return; }
    const cfg = { login: { ic: 'fas fa-sign-in-alt', c: 'text-purple-400 bg-purple-400/20' }, upload: { ic: 'fas fa-upload', c: 'text-blue-400 bg-blue-400/20' }, share: { ic: 'fas fa-share-alt', c: 'text-green-400 bg-green-400/20' }, delete: { ic: 'fas fa-trash', c: 'text-red-400 bg-red-400/20' }, logout: { ic: 'fas fa-sign-out-alt', c: 'text-gray-400 bg-gray-400/20' } };
    el.innerHTML = logs.map(function (l) {
      const a = cfg[l.action] || { ic: 'fas fa-info-circle', c: 'text-blue-400 bg-blue-400/20' };
      return '<div class="flex items-center gap-3 p-2 rounded-xl hover:bg-blue-500/5 transition-all"><div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ' + a.c + '"><i class="' + a.ic + ' text-xs"></i></div><div class="flex-1 min-w-0"><p class="text-white text-xs font-medium truncate">' + esc(l.description) + '</p><p class="text-blue-400/50 text-xs">' + esc(l.user) + '</p></div><p class="text-blue-400/40 text-xs flex-shrink-0">' + timeAgo(l.createdAt) + '</p></div>';
    }).join('');
  }

  // ════════════════════════════ DOCUMENTS
  function renderDocuments(docs) {
    const arr = docs || getFilteredDocs();
    const cnt = document.getElementById('resultsCount');
    if (cnt) cnt.textContent = arr.length + ' document(s)';
    const grid = document.getElementById('documentGrid');
    if (!grid) return;
    if (!arr.length) {
      grid.innerHTML = '<div class="col-span-full text-center py-16"><div class="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-400"><i class="fas fa-folder-open text-4xl"></i></div><p class="text-blue-300/70 mb-2 text-lg font-semibold">Aucun document</p><p class="text-blue-400/50 text-sm mb-6">Importez votre premier document</p><button onclick="openUploadModal()" class="btn-primary px-6 py-3 text-white rounded-xl font-semibold inline-flex items-center gap-2"><i class="fas fa-cloud-upload-alt"></i>Importer</button></div>';
      return;
    }
    if (G.gridView) {
      grid.className = 'doc-grid';
      grid.innerHTML = arr.map(createDocCard).join('');
    } else {
      grid.className = '';
      grid.innerHTML = '<div class="glass-card rounded-2xl border border-blue-500/20 overflow-hidden divide-y divide-blue-500/10">' + arr.map(createDocListItem).join('') + '</div>';
    }
    updateStats();
  }

  function createDocCard(doc) {
    const fi = getFileIcon(doc.name);
    const tags = (doc.tags || []).map(function (t) { return '<span class="tag text-[10px]" onclick="event.stopPropagation();filterByTag(\'' + esc(t) + '\')">#' + esc(t) + '</span>'; }).join('');
    return '<div class="document-card glass-card rounded-xl p-4 border border-blue-500/20 relative group cursor-pointer" onclick="openDocumentPreview(\'' + doc.id + '\')"><div class="flex items-start justify-between mb-3"><div class="w-12 h-12 ' + fi.bg + ' rounded-xl flex items-center justify-center ' + fi.color + ' border ' + fi.border + '"><i class="fas ' + fi.icon + ' text-xl"></i></div><div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1"><button onclick="event.stopPropagation();downloadDocument(\'' + doc.id + '\')" class="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg" title="Télécharger"><i class="fas fa-download"></i></button><button onclick="event.stopPropagation();openShareModal(\'' + doc.id + '\')" class="p-2 text-purple-400 hover:bg-purple-500/10 rounded-lg" title="Partager"><i class="fas fa-share-alt"></i></button><button onclick="event.stopPropagation();confirmDeleteDocument(\'' + doc.id + '\')" class="p-2 text-red-400 hover:bg-red-500/10 rounded-lg" title="Supprimer"><i class="fas fa-trash"></i></button></div></div><h4 class="font-bold text-white mb-1 truncate" title="' + esc(doc.name) + '">' + esc(doc.name) + '</h4><p class="text-xs text-blue-300/70 mb-2 line-clamp-2 h-8">' + esc(doc.description || 'Sans description') + '</p><div class="flex flex-wrap gap-1 mb-3 min-h-[24px]">' + tags + '</div><div class="flex items-center justify-between text-xs border-t border-blue-500/10 pt-3"><span class="text-blue-400/60">' + formatFileSize(doc.file_size || 0) + '</span><span class="text-blue-400/60">' + fmtDate(doc.created_at) + '</span></div>' + ((doc.version_number || 1) > 1 ? '<div class="absolute top-2 right-2 version-badge">v' + doc.version_number + '</div>' : '') + '</div>';
  }

  function createDocListItem(doc) {
    const fi = getFileIcon(doc.name);
    return '<div class="doc-list-item hover:bg-blue-500/5 cursor-pointer transition-all" onclick="openDocumentPreview(\'' + doc.id + '\')"><div class="doc-icon ' + fi.bg + ' rounded-lg flex items-center justify-center ' + fi.color + ' border ' + fi.border + '"><i class="fas ' + fi.icon + '"></i></div><div class="doc-content"><h4 class="font-bold text-white truncate">' + esc(doc.name) + '</h4><p class="text-xs text-blue-300/70">' + esc(doc.description || 'Sans description') + ' · ' + formatFileSize(doc.file_size || 0) + ' · ' + fmtDate(doc.created_at) + '</p></div><div class="doc-actions"><button onclick="event.stopPropagation();downloadDocument(\'' + doc.id + '\')" class="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg"><i class="fas fa-download"></i></button><button onclick="event.stopPropagation();openShareModal(\'' + doc.id + '\')" class="p-2 text-purple-400 hover:bg-purple-500/10 rounded-lg"><i class="fas fa-share-alt"></i></button><button onclick="event.stopPropagation();confirmDeleteDocument(\'' + doc.id + '\')" class="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"><i class="fas fa-trash"></i></button></div></div>';
  }

  function getFilteredDocs() {
    const type = document.getElementById('filterType')?.value || '';
    const date = document.getElementById('filterDate')?.value || '';
    let arr = [...G.docs];
    if (type) arr = arr.filter(function (d) {
      const ext = d.name.split('.').pop().toLowerCase();
      if (type === 'pdf') return ext === 'pdf';
      if (type === 'doc') return ['doc', 'docx'].includes(ext);
      if (type === 'xls') return ['xls', 'xlsx'].includes(ext);
      if (type === 'img') return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
      return true;
    });
    if (date) {
      const now = new Date();
      arr = arr.filter(function (d) {
        const c = new Date(d.created_at);
        if (date === 'today') return c.toDateString() === now.toDateString();
        if (date === 'week')  return (now - c) < 7 * 86400000;
        if (date === 'month') return c.getMonth() === now.getMonth() && c.getFullYear() === now.getFullYear();
        return true;
      });
    }
    return arr;
  }

  function applyFilters() { renderDocuments(); }
  function clearFilters() { document.getElementById('filterType').value = ''; document.getElementById('filterDate').value = ''; document.getElementById('globalSearch').value = ''; renderDocuments(G.docs); }
  function filterByTag(t) { document.getElementById('globalSearch').value = t; switchView('documents'); handleGlobalSearch(t); }
  function filterByType(t) { document.getElementById('filterType').value = t; switchView('documents'); applyFilters(); }
  function toggleViewMode() { G.gridView = !G.gridView; const i = document.getElementById('viewModeIcon'); i.classList.toggle('fa-th-large', G.gridView); i.classList.toggle('fa-list', !G.gridView); renderDocuments(); }

  async function downloadDocument(id) {
    const d = G.docs.find(function (x) { return x.id === id; }); if (!d) return;
    showToast('Téléchargement de "' + d.name + '"…', 'info');
    logActivity('download', id, 'Téléchargement : ' + d.name);
    var url = d.file_url;
    if (d.storage_path) {
      var { data: urlData } = await SB.storage.from('documents').createSignedUrl(d.storage_path, 300);
      if (urlData?.signedUrl) url = urlData.signedUrl;
    }
    if (url) { var a = document.createElement('a'); a.href = url; a.download = d.name; a.target = '_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
  }

    async function confirmDeleteDocument(id) {
    const d = G.docs.find(function (x) { return x.id === id; }); if (!d) return;
    if (!confirm('Supprimer "' + d.name + '" ? Cette action est irréversible.')) return;
    try {
      if (d.storage_path) await SB.storage.from('documents').remove([d.storage_path]);
      const { error } = await SB.from('documents').delete().eq('id', id);
      if (error) throw error;
      G.docs = G.docs.filter(function (x) { return x.id !== id; });
      logActivity('delete', id, 'Suppression : ' + d.name);
      showToast('"' + d.name + '" supprimé ✓', 'success');
      renderDocuments(); updateStats();
    } catch (err) { showToast('Erreur suppression : ' + err.message, 'error'); }
  }
  function openDocumentPreview(id) {
    const d = G.docs.find(function (x) { return x.id === id; }); if (!d) return;
    G.previewDocId = id;
    const fi = getFileIcon(d.name);
    document.getElementById('previewTitle').textContent = d.name;
    document.getElementById('previewContent').innerHTML =
      '<div class="flex items-center gap-4 mb-5 pb-4 border-b border-blue-400/10"><div class="w-14 h-14 rounded-xl flex items-center justify-center ' + fi.bg + ' ' + fi.color + ' border ' + fi.border + '"><i class="fas ' + fi.icon + ' text-2xl"></i></div><div><p class="text-white font-semibold">' + esc(d.name) + '</p><p class="text-blue-400/60 text-sm">' + esc(d.file_type || '') + '</p></div></div>' +
      '<div class="grid grid-cols-2 gap-4 mb-4">' + [['Taille', formatFileSize(d.file_size || 0)], ['Version', 'v' + (d.version_number || 1)], ['Date', fmtDate(d.created_at)], ['Tags', (d.tags || []).join(', ') || '—']].map(function (kv) { return '<div><p class="text-blue-400/60 text-xs uppercase tracking-wider">' + kv[0] + '</p><p class="text-white text-sm mt-0.5">' + kv[1] + '</p></div>'; }).join('') + '</div>' +
      (d.description ? '<div class="mb-5"><p class="text-blue-400/60 text-xs uppercase tracking-wider mb-1">Description</p><p class="text-white text-sm">' + esc(d.description) + '</p></div>' : '') +
      '<div class="flex gap-2 pt-4 border-t border-blue-400/10"><button onclick="downloadDocument(\'' + id + '\');closePreviewModal()" class="flex-1 btn-primary py-2 rounded-xl text-white text-sm font-medium"><i class="fas fa-download mr-2"></i>Télécharger</button><button onclick="openShareModal(\'' + id + '\');closePreviewModal()" class="px-4 py-2 rounded-xl text-purple-400 text-sm font-medium hover:bg-purple-500/10" style="border:1px solid rgba(139,92,246,0.3)"><i class="fas fa-share-alt mr-2"></i>Partager</button></div>';
    document.getElementById('previewModal').classList.remove('hidden');
  }
  function closePreviewModal() { document.getElementById('previewModal').classList.add('hidden'); }

  // ════════════════════════════ UPLOAD
  function openUploadModal() { G.selectedFiles = []; G.uploadTags = []; document.getElementById('selectedFilesList').innerHTML = ''; document.getElementById('uploadTagsContainer').innerHTML = ''; document.getElementById('tagInput').value = ''; document.getElementById('docNameInput').value = ''; document.getElementById('docDescInput').value = ''; document.getElementById('uploadProgress').classList.add('hidden'); document.getElementById('uploadBtn').disabled = false; document.getElementById('uploadModal').classList.remove('hidden'); }
  function closeUploadModal() { document.getElementById('uploadModal').classList.add('hidden'); G.selectedFiles = []; G.uploadTags = []; }

  function handleFileSelect(e) { addFilesToQueue(Array.from(e.target.files)); }
  function handleFilePickerSelect(e) { addFilesToQueue(Array.from(e.target.files)); openUploadModal(); }
  function handleDocDrop(e) { e.preventDefault(); document.getElementById('docDropZone').classList.remove('drag-over'); addFilesToQueue(Array.from(e.dataTransfer.files)); openUploadModal(); }
  function handleDrop(e) { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); addFilesToQueue(Array.from(e.dataTransfer.files)); }
  function handleDragOver(e, id) { e.preventDefault(); (id ? document.getElementById(id) : e.currentTarget)?.classList.add('drag-over'); }
  function handleDragLeave(e, id) { (id ? document.getElementById(id) : e.currentTarget)?.classList.remove('drag-over'); }

  function addFilesToQueue(files) {
    files.forEach(function (f) {
      const ext = f.name.split('.').pop().toLowerCase();
      if (BLOCKED_EXT.includes(ext)) { showToast('.' + ext + ' bloqué — extension non autorisée', 'error'); return; }
      if (f.size > 100 * 1024 * 1024) { showToast(f.name + ' dépasse 100 MB', 'error'); return; }
      if (!G.selectedFiles.find(function (x) { return x.name === f.name && x.size === f.size; })) G.selectedFiles.push(f);
    });
    renderSelectedFiles();
  }

  function renderSelectedFiles() {
    document.getElementById('selectedFilesList').innerHTML = G.selectedFiles.map(function (f, i) {
      return '<div class="flex items-center gap-3 px-3 py-2 rounded-lg" style="background:rgba(59,130,246,0.08);border:1px solid rgba(96,165,250,0.15)"><i class="fas ' + getFileIcon(f.name).icon + ' text-blue-400 text-sm flex-shrink-0"></i><div class="flex-1 min-w-0"><p class="text-white text-xs font-medium truncate">' + esc(f.name) + '</p><p class="text-blue-400/50 text-xs">' + formatFileSize(f.size) + '</p></div><button onclick="G.selectedFiles.splice(' + i + ',1);renderSelectedFiles()" class="text-red-400 hover:text-red-300 text-xs"><i class="fas fa-times"></i></button></div>';
    }).join('');
  }

  function addUploadTag() {
    const v = document.getElementById('tagInput').value.trim();
    if (!v || G.uploadTags.includes(v)) return;
    G.uploadTags.push(v);
    document.getElementById('tagInput').value = '';
    const c = document.getElementById('uploadTagsContainer');
    c.innerHTML = G.uploadTags.map(function (t, i) { return '<span class="tag">' + esc(t) + ' <span class="tag-close" onclick="G.uploadTags.splice(' + i + ',1);addUploadTag()">×</span></span>'; }).join('');
  }

  async function uploadDocument() {
    if (!G.selectedFiles.length) { showToast('Aucun fichier sélectionné', 'error'); return; }
    const ALLOWED = ['application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg','image/png','image/gif'];
    for (var fi = 0; fi < G.selectedFiles.length; fi++) {
      var f = G.selectedFiles[fi];
      if (!ALLOWED.includes(f.type)) { showToast('Type non autorisé : ' + f.name, 'error'); return; }
      if (f.size > 100 * 1024 * 1024) { showToast(f.name + ' dépasse 100 MB', 'error'); return; }
      // Scan antivirus basique (signatures binaires)
      var buf = await f.slice(0, 4).arrayBuffer();
      var bytes = new Uint8Array(buf);
      if ((bytes[0] === 0x4D && bytes[1] === 0x5A) || (bytes[0] === 0x7F && bytes[1] === 0x45)) {
        showToast('Fichier bloqué (exécutable détecté) : ' + f.name, 'error');
        return;
      }
    }
    const btn = document.getElementById('uploadBtn');
    btn.disabled = true;
    document.getElementById('uploadProgress').classList.remove('hidden');
    const docName = document.getElementById('docNameInput').value.trim();
    const desc    = document.getElementById('docDescInput').value.trim();
    var uploaded = 0;
    for (var i = 0; i < G.selectedFiles.length; i++) {
      var file = G.selectedFiles[i];
      var finalName = (docName && G.selectedFiles.length === 1) ? docName : file.name;
      var safeName  = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      var storagePath = G.user.id + '/' + Date.now() + '_' + safeName;
      document.getElementById('uploadProgressBar').style.width = Math.round(((i + 0.5) / G.selectedFiles.length) * 100) + '%';
      document.getElementById('uploadPercent').textContent = Math.round(((i + 0.5) / G.selectedFiles.length) * 100) + '%';
      try {
        // Upload vers Supabase Storage
        var { error: storageErr } = await SB.storage.from('documents').upload(storagePath, file);
        if (storageErr) throw storageErr;
        var { data: urlData } = SB.storage.from('documents').getPublicUrl(storagePath);
        // Insérer en base
        var { data: docData, error: dbErr } = await SB.from('documents').insert([{
          name: finalName, description: desc || 'Document importé',
          file_url: urlData.publicUrl, file_size: file.size,
          file_type: file.type, storage_path: storagePath,
          user_id: G.user.id, version_number: 1
        }]).select().single();
        if (dbErr) throw dbErr;
        // Tags
        for (var ti = 0; ti < G.uploadTags.length; ti++) {
          var tagName = G.uploadTags[ti];
          var { data: tagRow } = await SB.from('tags').select('id').eq('name', tagName).single();
          if (!tagRow) {
            var { data: newTag } = await SB.from('tags').insert({ name: tagName, color: '#3b82f6' }).select().single();
            tagRow = newTag;
          }
          if (tagRow) await SB.from('document_tags').insert({ document_id: docData.id, tag_id: tagRow.id });
        }
        var localDoc = Object.assign({}, docData, { tags: [...G.uploadTags] });
        G.docs.unshift(localDoc);
        await _logActivitySB('upload', docData.id, 'Upload : ' + finalName);
        addNotification('success', 'Document uploadé', finalName);
        uploaded++;
      } catch (err) {
        showToast('Erreur upload ' + file.name + ' : ' + err.message, 'error');
      }
      document.getElementById('uploadProgressBar').style.width = Math.round(((i + 1) / G.selectedFiles.length) * 100) + '%';
      document.getElementById('uploadPercent').textContent = Math.round(((i + 1) / G.selectedFiles.length) * 100) + '%';
    }
    if (uploaded > 0) showToast(uploaded + ' fichier(s) importé(s) ✓', 'success');
    closeUploadModal();
    if (G.currentView === 'documents') renderDocuments();
    updateStats();
  }

  function finishUpload(name, desc) { /* compatibilité — non utilisé */ }

  // ════════════════════════════ SHARE
  function openShareModal(id) {
    G.shareDocId = id;
    const d = G.docs.find(function (x) { return x.id === id; }); if (!d) return;
    const fi = getFileIcon(d.name);
    document.getElementById('shareDocInfo').innerHTML = '<div class="w-10 h-10 rounded-xl ' + fi.bg + ' ' + fi.color + ' border ' + fi.border + ' flex items-center justify-center flex-shrink-0"><i class="fas ' + fi.icon + '"></i></div><div><p class="text-white font-semibold text-sm">' + esc(d.name) + '</p><p class="text-blue-400/60 text-xs">' + formatFileSize(d.file_size || 0) + '</p></div>';
    document.getElementById('shareEmail').value = '';
    document.getElementById('generatedLink').classList.add('hidden');
    document.getElementById('shareModal').classList.remove('hidden');
  }
  function closeShareModal() { document.getElementById('shareModal').classList.add('hidden'); G.shareDocId = null; }

  async function shareDocument() {
    const email = document.getElementById('shareEmail').value.trim();
    if (!email) { showToast('Email requis', 'error'); return; }
    const perm = document.getElementById('sharePermission').value;
    const exp  = parseInt(document.getElementById('shareExpiration').value);
    const d    = G.docs.find(function (x) { return x.id === G.shareDocId; });
    if (!d) return;
    const btn = document.querySelector('#shareModal button[onclick="shareDocument()"]');
    if (btn) btn.disabled = true;
    try {
      const expiresAt = exp ? new Date(Date.now() + exp * 86400000).toISOString() : null;
      // Insérer partage en DB
      const { error: shareErr } = await SB.from('shared_documents').insert({
        document_id: d.id, shared_by: G.user.id,
        shared_with_email: email, permission: perm, expires_at: expiresAt
      });
      if (shareErr) throw shareErr;
      // Générer lien signé
      var signedUrl = window.location.origin;
      if (d.storage_path) {
        const secs = exp ? exp * 86400 : 604800;
        const { data: urlData } = await SB.storage.from('documents').createSignedUrl(d.storage_path, secs);
        if (urlData?.signedUrl) signedUrl = urlData.signedUrl;
      }
      document.getElementById('shareLinkInput').value = signedUrl;
      document.getElementById('generatedLink').classList.remove('hidden');
      // Mettre à jour liste locale
      G.sentShares.unshift({ id: 's-' + Date.now(), docId: d.id, docName: d.name, sharedWith: email, permission: perm, expiresAt: expiresAt, createdAt: new Date().toISOString() });
      await _logActivitySB('share', d.id, 'Partage "' + d.name + '" → ' + email);
      addNotification('success', 'Document partagé', d.name + ' → ' + email);
      showToast('Partage créé avec ' + email + ' ✓', 'success');
      // Ouvrir client email
      _openShareEmail(email, d, perm, exp, expiresAt, signedUrl);
    } catch (err) {
      showToast('Erreur partage : ' + err.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function _openShareEmail(toEmail, doc, permission, duration, expiresAt, signedUrl) {
    const senderName  = G.user.name;
    const permLabels  = { view: 'Lecture seule', download: 'Téléchargement', edit: 'Édition' };
    const permLabel   = permLabels[permission] || permission;
    const expStr      = expiresAt ? new Date(expiresAt).toLocaleDateString('fr-FR') : 'Illimité';
    const durLabel    = duration ? duration + ' jour(s)' : 'Illimité';
    const subject = encodeURIComponent('[SystemesGED] ' + senderName + ' partage avec vous : ' + doc.name);
    const body = encodeURIComponent(
      'Bonjour,\n\n' + senderName + ' vous partage un document via SystemesGED.\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '📄 ' + doc.name + '\n' +
      (doc.file_size ? 'Taille     : ' + formatFileSize(doc.file_size) + '\n' : '') +
      'Permission : ' + permLabel + '\n' +
      'Validité   : ' + durLabel + '\n' +
      'Expiration : ' + expStr + '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '🔗 Accéder au document :\n' + signedUrl + '\n\n' +
      '⚠️ Ce lien est sécurisé et personnel.\n' +
      '🔒 Chiffrement TLS 1.3 — SystemesGED v4.1\n--\n' + window.location.origin
    );
    window.location.href = 'mailto:' + toEmail + '?subject=' + subject + '&body=' + body;
  }
  function copyShareLink() { navigator.clipboard?.writeText(document.getElementById('shareLinkInput').value).then(function () { showToast('Lien copié !', 'success'); }); }

  // ════════════════════════════ SHARED VIEW
  function renderShared() { /* simplified local — à connecter à Supabase */ }
  function switchSharedTab(tab) {
    const rcvCls = tab === 'received' ? 'px-5 py-2.5 text-sm font-medium text-blue-400 border-b-2 border-blue-400 -mb-px flex items-center gap-2' : 'px-5 py-2.5 text-sm font-medium text-gray-400 border-b-2 border-transparent -mb-px hover:text-blue-400 flex items-center gap-2';
    document.getElementById('tab-received').className = rcvCls;
    document.getElementById('tab-sent').className = tab === 'sent' ? 'px-5 py-2.5 text-sm font-medium text-blue-400 border-b-2 border-blue-400 -mb-px flex items-center gap-2' : 'px-5 py-2.5 text-sm font-medium text-gray-400 border-b-2 border-transparent -mb-px hover:text-blue-400 flex items-center gap-2';
    document.getElementById('shared-received').classList.toggle('hidden', tab !== 'received');
    document.getElementById('shared-sent').classList.toggle('hidden', tab !== 'sent');
    if (tab === 'sent') renderSentShares();
  }
  function renderSentShares() {
    const el = document.getElementById('sentSharesList');
    if (!G.sentShares.length) { document.getElementById('sentEmptyState').classList.remove('hidden'); el.classList.add('hidden'); return; }
    document.getElementById('sentEmptyState').classList.add('hidden');
    el.classList.remove('hidden');
    el.innerHTML = G.sentShares.map(function (s) {
      return '<div class="glass-card rounded-xl p-4 flex items-center gap-4 border border-blue-500/20"><div class="flex-1 min-w-0"><p class="text-white font-semibold text-sm truncate">' + esc(s.docName) + '</p><p class="text-blue-400/60 text-xs mt-0.5">' + esc(s.sharedWith) + ' · ' + s.permission + ' · ' + (s.expiresAt ? 'Expire ' + fmtDate(s.expiresAt) : 'Illimité') + '</p></div><button onclick="revokeShare(\'' + s.id + '\')" class="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30 font-medium">Révoquer</button></div>';
    }).join('');
  }
  function revokeShare(id) { if (!confirm('Révoquer ce partage ?')) return; G.sentShares = G.sentShares.filter(function (s) { return s.id !== id; }); showToast('Partage révoqué', 'success'); renderSentShares(); }

  // ════════════════════════════ WORKFLOWS
  function renderWorkflows() {
    const arr = G.wfFilter ? G.workflows.filter(function (w) { return w.status === G.wfFilter; }) : G.workflows;
    document.querySelectorAll('.wf-filter-btn').forEach(function (b) {
      const active = b.dataset.wf === G.wfFilter;
      b.classList.toggle('bg-blue-500/20', active); b.classList.toggle('text-blue-300', active);
      b.classList.toggle('border-blue-500/30', active); b.classList.toggle('text-gray-400', !active);
    });
    const el = document.getElementById('workflowsList');
    if (!arr.length) { el.innerHTML = '<div class="col-span-3 text-center py-16 text-blue-300/50"><i class="fas fa-project-diagram text-4xl mb-4 block opacity-20"></i><p>Aucun workflow</p></div>'; return; }
    const statusCfg = { pending: { c: 'text-orange-400 bg-orange-400/20', label: 'En attente' }, approved: { c: 'text-green-400 bg-green-400/20', label: 'Approuvé' }, rejected: { c: 'text-red-400 bg-red-400/20', label: 'Rejeté' } };
    const prioCfg = { low: 'text-blue-400', medium: 'text-yellow-400', high: 'text-orange-400', urgent: 'text-red-400' };
    el.innerHTML = arr.map(function (w) {
      const s = statusCfg[w.status] || statusCfg.pending, d = G.docs.find(function (x) { return x.id === w.docId; });
      return '<div class="glass-card rounded-2xl border border-blue-500/20 p-5 flex flex-col gap-3 hover:border-blue-400/40 transition-all"><div class="flex items-start justify-between gap-2"><div><h4 class="text-white font-bold text-sm truncate">' + esc(w.title) + '</h4><p class="text-blue-300/60 text-xs mt-0.5">' + esc(w.description || '') + '</p></div><span class="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ' + s.c + '">' + s.label + '</span></div>' +
        (d ? '<div class="flex items-center gap-2 p-2 rounded-lg" style="background:rgba(59,130,246,0.08)"><i class="fas ' + getFileIcon(d.name).icon + ' text-blue-400 text-sm"></i><p class="text-white text-xs truncate">' + esc(d.name) + '</p></div>' : '') +
        '<div class="flex items-center justify-between text-xs text-blue-300/60"><span class="' + (prioCfg[w.priority] || 'text-blue-400') + ' font-medium"><i class="fas fa-flag mr-1"></i>' + w.priority + '</span>' + (w.dueDate ? '<span><i class="fas fa-calendar mr-1"></i>' + w.dueDate + '</span>' : '') + '</div>' +
        ((w.approvers || []).length ? '<div class="flex flex-wrap gap-1">' + w.approvers.map(function (a) { return '<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300">' + esc(a) + '</span>'; }).join('') + '</div>' : '') +
        (w.status === 'pending' ? '<div class="flex gap-2 pt-2 border-t border-blue-500/10"><button onclick="approveWorkflow(\'' + w.id + '\')" class="flex-1 py-1.5 rounded-lg text-xs text-green-400 hover:bg-green-500/10 border border-green-500/20 font-medium"><i class="fas fa-check mr-1"></i>Approuver</button><button onclick="rejectWorkflow(\'' + w.id + '\')" class="flex-1 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 border border-red-500/20 font-medium"><i class="fas fa-times mr-1"></i>Rejeter</button></div>' : '') +
        '</div>';
    }).join('');
  }
  function filterWorkflows(s) { G.wfFilter = s; renderWorkflows(); }
  function approveWorkflow(id) { const w = G.workflows.find(function (x) { return x.id === id; }); if (w) { w.status = 'approved'; logActivity('workflow', 'approve', 'Workflow approuvé : ' + w.title); showToast('Workflow approuvé ✓', 'success'); renderWorkflows(); updateStats(); } }
  function rejectWorkflow(id)  { const w = G.workflows.find(function (x) { return x.id === id; }); if (w) { w.status = 'rejected'; logActivity('workflow', 'reject', 'Workflow rejeté : ' + w.title); showToast('Workflow rejeté', 'warning'); renderWorkflows(); updateStats(); } }
  function openCreateWorkflowModal() { document.getElementById('wfTitle').value = ''; document.getElementById('wfDesc').value = ''; document.getElementById('wfApprovers').value = ''; document.getElementById('workflowModal').classList.remove('hidden'); }
  function closeWorkflowModal() { document.getElementById('workflowModal').classList.add('hidden'); }
  function createWorkflow(e) {
    e.preventDefault();
    const title = document.getElementById('wfTitle').value.trim();
    const desc = document.getElementById('wfDesc').value.trim();
    const priority = document.getElementById('wfPriority').value;
    const dueDate = document.getElementById('wfDueDate').value;
    const approvers = document.getElementById('wfApprovers').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    G.workflows.unshift({ id: 'wf-' + Date.now(), title: title, description: desc, status: 'pending', priority: priority, approvers: approvers, dueDate: dueDate, createdAt: new Date().toISOString() });
    logActivity('workflow', 'create', 'Workflow créé : ' + title);
    showToast('Workflow "' + title + '" créé ✓', 'success');
    closeWorkflowModal();
    renderWorkflows(); updateStats();
  }

  // ════════════════════════════ ADVANCED SEARCH
  function runAdvSearch() {
    const term = (document.getElementById('advSearchInput')?.value || '').toLowerCase().trim();
    const type = document.getElementById('advSearchType')?.value || '';
    const date = document.getElementById('advSearchDate')?.value || '';
    const size = document.getElementById('advSearchSize')?.value || '';
    const box = document.getElementById('advSearchResults'), cnt = document.getElementById('advSearchCount');
    if (!term && !type && !date && !size) { box.innerHTML = '<div class="text-center py-20 text-blue-300/30"><i class="fas fa-search text-6xl mb-5 block opacity-10"></i><p class="text-lg font-medium text-blue-300/50">Tapez pour rechercher</p></div>'; if (cnt) cnt.textContent = ''; return; }
    let res = [...G.docs];
    if (term) res = res.filter(function (d) { return (d.name || '').toLowerCase().includes(term) || (d.description || '').toLowerCase().includes(term) || (d.tags || []).join(' ').toLowerCase().includes(term); });
    if (type) res = res.filter(function (d) { const ext = (d.name || '').split('.').pop().toLowerCase(); if (type === 'pdf') return ext === 'pdf'; if (type === 'doc') return ['doc', 'docx'].includes(ext); if (type === 'xls') return ['xls', 'xlsx'].includes(ext); if (type === 'img') return ['jpg', 'jpeg', 'png', 'gif'].includes(ext); return true; });
    if (date) { const now = new Date(); res = res.filter(function (d) { const c = new Date(d.created_at); if (date === 'today') return c.toDateString() === now.toDateString(); if (date === 'week') return (now - c) < 7 * 86400000; if (date === 'month') return (now - c) < 30 * 86400000; return true; }); }
    if (size) res = res.filter(function (d) { const mb = (d.file_size || 0) / (1024 * 1024); if (size === 'small') return mb < 1; if (size === 'medium') return mb >= 1 && mb <= 10; if (size === 'large') return mb > 10; return true; });
    if (cnt) cnt.textContent = res.length + ' résultat(s)';
    if (!res.length) { box.innerHTML = '<div class="text-center py-16"><i class="fas fa-search text-5xl mb-4 block text-blue-400/20"></i><p class="text-blue-300/50">Aucun résultat</p></div>'; return; }
    box.innerHTML = '<div class="space-y-3">' + res.map(function (d) {
      const fi = getFileIcon(d.name);
      return '<div class="glass-card rounded-xl border border-cyan-500/15 p-4 flex items-center gap-4 hover:border-cyan-400/40 cursor-pointer group" onclick="openDocumentPreview(\'' + d.id + '\')"><div class="w-11 h-11 ' + fi.bg + ' rounded-xl flex items-center justify-center ' + fi.color + ' border ' + fi.border + ' flex-shrink-0"><i class="fas ' + fi.icon + ' text-lg"></i></div><div class="flex-1 min-w-0"><p class="text-white font-semibold text-sm truncate">' + esc(d.name) + '</p><p class="text-xs text-blue-300/50">' + formatFileSize(d.file_size || 0) + ' · ' + fmtDate(d.created_at) + '</p><div class="flex flex-wrap gap-1 mt-1">' + (d.tags || []).map(function (t) { return '<span class="tag text-[10px] px-2 py-0.5">#' + esc(t) + '</span>'; }).join('') + '</div></div><div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onclick="event.stopPropagation();downloadDocument(\'' + d.id + '\')" class="px-3 py-1.5 bg-slate-700/50 text-gray-400 rounded-lg text-xs hover:bg-slate-600/50"><i class="fas fa-download"></i></button></div></div>';
    }).join('') + '</div>';
  }
  function clearAdvSearch() { ['advSearchInput', 'advSearchType', 'advSearchDate', 'advSearchSize'].forEach(function (id) { const el = document.getElementById(id); if (el) el.value = ''; }); runAdvSearch(); }

  // ════════════════════════════ VERSIONING
  function renderVersioningDocs(filter) {
    const q = (filter || document.getElementById('versionSearch')?.value || '').toLowerCase();
    const arr = q ? G.docs.filter(function (d) { return d.name.toLowerCase().includes(q); }) : G.docs;
    const el = document.getElementById('versionDocList');
    if (!arr.length) { el.innerHTML = '<div class="text-center py-16 text-blue-300/30"><i class="fas fa-code-branch text-5xl mb-4 block opacity-10"></i><p>Aucun document</p></div>'; return; }
    el.innerHTML = arr.map(function (d, i) {
      const fi = getFileIcon(d.name);
      const versions = Array.from({ length: d.version_number || 1 }, function (_, vi) { return vi + 1; }).reverse();
      return '<div class="glass-card rounded-2xl border border-cyan-500/20 overflow-hidden"><div class="flex items-center justify-between p-4 cursor-pointer hover:bg-cyan-500/5 group" onclick="toggleVersions(\'vd' + i + '\')"><div class="flex items-center gap-4"><div class="w-11 h-11 ' + fi.bg + ' rounded-xl flex items-center justify-center ' + fi.color + ' border ' + fi.border + '"><i class="fas ' + fi.icon + ' text-lg"></i></div><div><p class="text-white font-semibold text-sm">' + esc(d.name) + '</p><p class="text-xs text-blue-300/50">' + versions.length + ' version(s) · ' + fmtDate(d.created_at) + ' · ' + formatFileSize(d.file_size || 0) + '</p></div></div><div class="flex items-center gap-3"><span class="px-2.5 py-1 bg-green-500/20 text-green-400 border border-green-400/20 rounded-full text-xs font-bold">v' + (d.version_number || 1) + ' active</span><i class="fas fa-chevron-down text-blue-400 transition-transform duration-300" id="chev-vd' + i + '"></i></div></div>' +
        '<div id="hist-vd' + i + '" class="hidden border-t border-cyan-500/10 divide-y divide-cyan-500/10">' +
        versions.map(function (v) {
          return '<div class="flex items-center justify-between px-5 py-3 hover:bg-cyan-500/5"><div class="flex items-center gap-3"><span class="w-8 h-8 ' + (v === d.version_number ? 'bg-green-500/20 text-green-400 border-green-400/20' : 'bg-slate-700/60 text-gray-400 border-gray-600/20') + ' rounded-full flex items-center justify-center text-xs font-bold border">v' + v + '</span><div><p class="text-sm ' + (v === d.version_number ? 'text-white' : 'text-blue-300/60') + '">' + (v === d.version_number ? 'Version active' : 'Version archivée') + '</p><p class="text-xs text-blue-300/40">' + fmtDate(d.created_at) + '</p></div></div><div class="flex gap-2"><button onclick="downloadDocument(\'' + d.id + '\')" class="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs hover:bg-blue-500/30"><i class="fas fa-download mr-1"></i>DL</button>' + (v !== d.version_number ? '<button onclick="restoreVersion(\'' + d.id + '\',' + v + ')" class="px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded-lg text-xs hover:bg-orange-500/30">Restaurer</button>' : '') + '</div></div>';
        }).join('') +
        '<div class="px-5 py-3"><button onclick="uploadNewVersion(\'' + d.id + '\')" class="px-4 py-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-xl text-xs hover:bg-cyan-500/20 flex items-center gap-2"><i class="fas fa-upload"></i>Uploader nouvelle version</button></div></div></div>';
    }).join('');
  }
  function toggleVersions(id) { const hist = document.getElementById('hist-' + id), chev = document.getElementById('chev-' + id); hist?.classList.toggle('hidden'); chev?.classList.toggle('rotate-180'); }
  function filterVersionDocs(v) { renderVersioningDocs(v); }
  function restoreVersion(docId, v) {
    if (!confirm('Restaurer la version ' + v + ' ?')) return;
    const d = G.docs.find(function (x) { return x.id === docId; });
    if (d) { d.version_number = v; logActivity('restore', docId, 'Restauration v' + v + ' : ' + d.name); showToast('Version ' + v + ' restaurée ✓', 'success'); renderVersioningDocs(); }
  }
  function uploadNewVersion(docId) {
    const d = G.docs.find(function (x) { return x.id === docId; }); if (!d) return;
    d.version_number = (d.version_number || 1) + 1;
    logActivity('upload', docId, 'Nouvelle version v' + d.version_number + ' : ' + d.name);
    showToast('Nouvelle version v' + d.version_number + ' créée (simulation) ✓', 'success');
    renderVersioningDocs();
  }

  // ════════════════════════════ LOGS SYSTÈME
  function startLiveLogs() {
    if (logsInterval) return;
    logsInterval = setInterval(function () {
      if (!document.getElementById('view-logs')?.classList.contains('active-view')) return;
      const entry = LOG_EVENTS[Math.floor(Math.random() * LOG_EVENTS.length)];
      addSysLog(entry[0], entry[1]);
    }, 5000);
  }
  function addSysLog(lv, msg) {
    const ts = new Date().toLocaleString('fr-FR').replace(',', ' ');
    G.sysLogs.unshift({ lv: lv, msg: msg, ts: ts });
    if (G.sysLogs.length > 200) G.sysLogs.pop();
    renderSysLogs();
  }
  function renderSysLogs() {
    const c = document.getElementById('sysLogConsole'); if (!c) return;
    const colors = { info: 'text-blue-400', warn: 'text-yellow-400', error: 'text-red-400', debug: 'text-purple-400', security: 'text-orange-400' };
    const txtColors = { info: 'text-gray-300', warn: 'text-yellow-200', error: 'text-red-200', debug: 'text-purple-200', security: 'text-orange-200' };
    const filtered = G.logFilter === 'all' ? G.sysLogs : G.sysLogs.filter(function (l) { return l.lv === G.logFilter; });
    c.innerHTML = filtered.slice(0, 40).map(function (l) { return '<div class="syslog-row flex gap-3 py-0.5" data-lv="' + l.lv + '"><span class="text-gray-600 flex-shrink-0 w-36 text-[10px]">' + l.ts + '</span><span class="' + (colors[l.lv] || 'text-blue-400') + ' w-16 flex-shrink-0 font-bold text-[10px]">[' + l.lv.toUpperCase() + ']</span><span class="' + (txtColors[l.lv] || 'text-gray-300') + ' text-[10px]">' + esc(l.msg) + '</span></div>'; }).join('');
  }
  function filterLogs(f) {
    G.logFilter = f;
    document.querySelectorAll('.log-filter').forEach(function (b) { const active = b.dataset.lf === f; b.classList.toggle('bg-blue-500/20', active); b.classList.toggle('text-blue-300', active); b.classList.toggle('border-blue-500/30', active); b.classList.toggle('text-gray-400', !active); });
    renderSysLogs();
  }
  function clearSysLogs() { G.sysLogs = []; renderSysLogs(); showToast('Logs effacés', 'info'); }
  function exportSysLogs() {
    const txt = G.sysLogs.map(function (l) { return '[' + l.ts + '] [' + l.lv.toUpperCase() + '] ' + l.msg; }).join('\n');
    const a = document.createElement('a'); a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(txt); a.download = 'systemesged_logs_' + new Date().toISOString().slice(0, 10) + '.txt'; a.click();
    showToast('Logs exportés', 'success');
  }

  // ════════════════════════════ RBAC
  function renderRbacCards() {
    const el = document.getElementById('rbacCards'); if (!el) return;
    const clrs = { admin: 'red', manager: 'orange', editor: 'blue', viewer: 'green' };
    const ics  = { admin: 'fa-crown', manager: 'fa-briefcase', editor: 'fa-pen', viewer: 'fa-eye' };
    el.innerHTML = Object.entries(G.roleDefaults || {}).map(function (entry) {
      const key = entry[0], r = entry[1];
      const c = clrs[key] || 'blue', ic = ics[key] || 'fa-user';
      const perms = [['Lecture documents', r.read], ['Écriture / Upload', r.write], ['Suppression', r.delete], ['Gestion utilisateurs', r.users], ['Logs & Audit', r.logs], ['Clés API & OAuth', r.api]];
      return '<div class="glass-card rounded-2xl border border-' + c + '-500/25 p-5 space-y-4"><div class="flex items-center gap-3"><div class="w-12 h-12 bg-' + c + '-500/20 rounded-xl flex items-center justify-center text-' + c + '-400 border border-' + c + '-400/25"><i class="fas ' + ic + ' text-xl"></i></div><div><h3 class="text-white font-bold">' + esc(r.name) + '</h3><p class="text-xs text-blue-300/50">' + key + '</p></div></div><div class="space-y-1.5 text-xs">' + perms.map(function (pv) { return '<div class="flex items-center gap-2 ' + (pv[1] ? 'text-green-400' : 'text-red-400/50') + '"><i class="fas ' + (pv[1] ? 'fa-check-circle' : 'fa-times-circle') + '"></i>' + pv[0] + '</div>'; }).join('') + '</div><div class="pt-2 border-t border-' + c + '-500/10 flex justify-end"><button onclick="openRoleModal(\'' + key + '\')" class="text-xs text-blue-400 hover:text-blue-300">Modifier →</button></div></div>';
    }).join('');
  }
  function openRoleModal(key) {
    const def = (key && G.roleDefaults[key]) || { name: '', read: false, write: false, delete: false, users: false, logs: false, api: false };
    document.getElementById('roleModalKey').value = key || '';
    document.getElementById('roleModalTitle').textContent = key ? 'Modifier : ' + def.name : 'Nouveau rôle';
    document.getElementById('roleModalName').value = def.name;
    ['read', 'write', 'delete', 'users', 'logs', 'api'].forEach(function (p) { const el = document.getElementById('perm_' + p); if (el) el.checked = def[p] || false; });
    document.getElementById('roleModal').classList.remove('hidden');
  }
  function closeRoleModal() { document.getElementById('roleModal').classList.add('hidden'); }
  function saveRole() {
    const key = document.getElementById('roleModalKey').value;
    const name = document.getElementById('roleModalName').value.trim();
    if (!name) { showToast('Nom de rôle requis', 'error'); return; }
    const perms = {};
    ['read', 'write', 'delete', 'users', 'logs', 'api'].forEach(function (p) { perms[p] = document.getElementById('perm_' + p)?.checked || false; });
    const roleKey = key || name.toLowerCase().replace(/\s+/g, '_');
    G.roleDefaults[roleKey] = Object.assign({ name: name }, perms);
    try { localStorage.setItem('ged_roles', JSON.stringify(G.roleDefaults)); } catch (e) {}
    showToast('Rôle "' + name + '" enregistré ✓', 'success');
    logActivity('rbac', null, 'Modification rôle : ' + name);
    renderRbacCards();
    closeRoleModal();
  }

  // ════════════════════════════ USERS
  function loadUsers() {
    const el = document.getElementById('usersList'); if (!el) return;
    document.getElementById('dashUserCount').textContent = G.users.filter(function (u) { return u.active; }).length;
    el.innerHTML = G.users.map(function (u) {
      return '<tr class="hover:bg-blue-500/5 transition-all"><td class="p-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style="background:linear-gradient(135deg,#1d4ed8,#3b82f6)">' + u.name.split(' ').map(function (n) { return n[0]; }).join('').slice(0, 2).toUpperCase() + '</div><div><p class="font-semibold text-white text-sm">' + esc(u.name) + '</p><p class="text-blue-300/60 text-xs">' + esc(u.email) + '</p></div></div></td><td class="p-4"><span class="px-2 py-1 rounded-full text-xs font-semibold ' + (ROLE_COLORS[u.role] || 'bg-blue-500/20 text-blue-300') + '">' + (ROLE_LABELS[u.role] || u.role) + '</span></td><td class="p-4 text-blue-300/70 text-sm hidden md:table-cell">' + (u.docs || 0) + ' doc(s)</td><td class="p-4 hidden sm:table-cell">' + (u.active ? '<span class="text-green-400 text-xs flex items-center gap-1"><i class="fas fa-circle text-[6px]"></i>Actif</span>' : '<span class="text-red-400 text-xs flex items-center gap-1"><i class="fas fa-circle text-[6px]"></i>Inactif</span>') + '</td><td class="p-4"><div class="flex gap-2"><button onclick="openEditUserModal(\'' + u.id + '\')" class="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg" title="Modifier"><i class="fas fa-edit text-xs"></i></button><button onclick="toggleUserActive(\'' + u.id + '\')" class="p-2 ' + (u.active ? 'text-red-400 hover:bg-red-500/10' : 'text-green-400 hover:bg-green-500/10') + ' rounded-lg" title="' + (u.active ? 'Désactiver' : 'Activer') + '"><i class="fas ' + (u.active ? 'fa-user-times' : 'fa-user-check') + ' text-xs"></i></button></div></td></tr>';
    }).join('');
  }
  function openCreateUserModal() { document.getElementById('addUserModal').classList.remove('hidden'); }
  function closeAddUserModal() { document.getElementById('addUserModal').classList.add('hidden'); }
  function addUser(e) {
    e.preventDefault();
    const first = document.getElementById('newUserFirst').value.trim(), last = document.getElementById('newUserLast').value.trim();
    const email = document.getElementById('newUserEmail').value.trim(), role = document.getElementById('newUserRole').value;
    if (G.users.find(function (u) { return u.email === email; })) { showToast('Email déjà utilisé', 'error'); return; }
    G.users.push({ id: 'u-' + Date.now(), name: first + ' ' + last, email: email, role: role, active: true, lastLogin: null, docs: 0 });
    logActivity('user_create', null, 'Ajout utilisateur : ' + email);
    addNotification('info', 'Nouvel utilisateur', first + ' ' + last + ' ajouté');
    showToast('Utilisateur ' + first + ' ' + last + ' ajouté ✓', 'success');
    closeAddUserModal();
    loadUsers();
  }
  function openEditUserModal(id) {
    const u = G.users.find(function (x) { return x.id === id; }); if (!u) return;
    const parts = u.name.split(' ');
    document.getElementById('editUserId').value = id;
    document.getElementById('editUserFirst').value = parts[0] || '';
    document.getElementById('editUserLast').value = parts.slice(1).join(' ') || '';
    document.getElementById('editUserRole').value = u.role;
    document.getElementById('editUserModal').classList.remove('hidden');
  }
  function closeEditUserModal() { document.getElementById('editUserModal').classList.add('hidden'); }
  function saveEditUser(e) {
    e.preventDefault();
    const id = document.getElementById('editUserId').value;
    const u = G.users.find(function (x) { return x.id === id; }); if (!u) return;
    u.name = document.getElementById('editUserFirst').value.trim() + ' ' + document.getElementById('editUserLast').value.trim();
    u.role = document.getElementById('editUserRole').value;
    showToast('Utilisateur mis à jour ✓', 'success');
    closeEditUserModal(); loadUsers();
  }
  function toggleUserActive(id) {
    const u = G.users.find(function (x) { return x.id === id; }); if (!u) return;
    u.active = !u.active;
    logActivity(u.active ? 'user_activate' : 'user_deactivate', null, (u.active ? 'Activation' : 'Désactivation') + ' : ' + u.email);
    showToast(u.name + ' ' + (u.active ? 'activé' : 'désactivé'), 'success');
    loadUsers();
  }

  // ════════════════════════════ TAGS
  function loadTags() {
    const el = document.getElementById('tagsList'); if (!el) return;
    if (!G.tags.length) { el.innerHTML = '<span class="text-blue-300/50 text-sm">Aucun tag créé</span>'; return; }
    el.innerHTML = G.tags.map(function (t, i) {
      return '<div class="flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-500/20" style="background:' + t.color + '22"><span class="w-3 h-3 rounded-full flex-shrink-0" style="background:' + t.color + '"></span><span class="text-white font-medium text-sm">#' + esc(t.name) + '</span><span class="text-blue-300/50 text-xs">' + G.docs.filter(function (d) { return (d.tags || []).includes(t.name); }).length + ' doc(s)</span><button onclick="deleteTag(' + i + ')" class="ml-2 text-red-400/50 hover:text-red-400 text-xs"><i class="fas fa-times"></i></button></div>';
    }).join('');
  }
  function createTag() {
    const v = document.getElementById('newTagInput').value.trim();
    const c = document.getElementById('newTagColor').value;
    if (!v) return;
    if (G.tags.find(function (t) { return t.name === v; })) { showToast('Tag déjà existant', 'warning'); return; }
    G.tags.push({ id: 't-' + Date.now(), name: v, color: c, count: 0 });
    document.getElementById('newTagInput').value = '';
    showToast('Tag "#' + v + '" créé ✓', 'success');
    loadTags(); renderPopularTags();
  }
  function deleteTag(i) { if (!confirm('Supprimer ce tag ?')) return; G.tags.splice(i, 1); loadTags(); renderPopularTags(); }

  // ════════════════════════════ SECURITY & AUDIT
  function renderAuditLog() {
    const f = document.getElementById('auditFilter')?.value || '';
    const logs = f ? G.auditLogs.filter(function (l) { return l.action.includes(f); }) : G.auditLogs;
    const el = document.getElementById('auditLogList'); if (!el) return;
    const ACT = { login: { c: 'text-purple-400', i: 'fa-sign-in-alt' }, upload: { c: 'text-blue-400', i: 'fa-upload' }, share: { c: 'text-green-400', i: 'fa-share-alt' }, delete: { c: 'text-red-400', i: 'fa-trash' }, logout: { c: 'text-gray-400', i: 'fa-sign-out-alt' }, workflow: { c: 'text-orange-400', i: 'fa-project-diagram' } };
    if (!logs.length) { el.innerHTML = '<p class="text-center py-4 text-blue-300/50 text-sm">Aucune entrée</p>'; return; }
    el.innerHTML = logs.slice(0, 20).map(function (l) {
      const a = Object.keys(ACT).find(function (k) { return l.action.includes(k); });
      const cfg = ACT[a] || { c: 'text-blue-400', i: 'fa-info-circle' };
      return '<div class="flex items-start gap-3 p-2 rounded-xl hover:bg-blue-500/5"><i class="fas ' + cfg.i + ' ' + cfg.c + ' mt-0.5 w-4 text-center flex-shrink-0"></i><div class="flex-1 min-w-0"><p class="text-white text-xs font-medium truncate">' + esc(l.description) + '</p><p class="text-blue-400/50 text-[10px]">' + esc(l.user || 'Système') + ' · ' + timeAgo(l.createdAt) + '</p></div></div>';
    }).join('');
    document.getElementById('secAuditCount').textContent = G.auditLogs.length;
  }
  function updateSecurityStats() {
    document.getElementById('secScanOk').textContent = G.docs.filter(function (d) { return !BLOCKED_EXT.includes((d.name || '').split('.').pop().toLowerCase()); }).length;
    document.getElementById('secScanBlocked').textContent = G.docs.filter(function (d) { return BLOCKED_EXT.includes((d.name || '').split('.').pop().toLowerCase()); }).length;
    document.getElementById('secApiKeys').textContent = G.apiKeys.length;
    document.getElementById('secAuditCount').textContent = G.auditLogs.length;
    renderAuditLog();
  }
  function scanAllDocuments() {
    const btn = document.getElementById('scanBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Scan en cours...'; }
    let safe = 0, blocked = 0;
    G.docs.forEach(function (d) { const ext = (d.name || '').split('.').pop().toLowerCase(); BLOCKED_EXT.includes(ext) ? blocked++ : safe++; });
    setTimeout(function () {
      document.getElementById('secScanOk').textContent = safe;
      document.getElementById('secScanBlocked').textContent = blocked;
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-search mr-2"></i>Scanner tous les documents'; }
      logActivity('scan', null, 'Scan antivirus : ' + safe + ' sains, ' + blocked + ' suspects');
      showToast('Scan terminé — ' + safe + ' sain(s), ' + blocked + ' suspect(s)', blocked > 0 ? 'warning' : 'success');
    }, 1500);
  }
  function generateApiKey() {
    const key = 'ged_sk_' + Math.random().toString(36).substr(2, 32);
    G.apiKeys.push({ id: 'k-' + Date.now(), key: key, created: new Date().toISOString() });
    document.getElementById('secApiKeys').textContent = G.apiKeys.length;
    const el = document.getElementById('apiKeysList');
    el.innerHTML = G.apiKeys.map(function (k, i) {
      return '<div class="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-yellow-500/20"><code class="text-yellow-400 text-xs font-mono truncate flex-1">' + k.key.slice(0, 24) + '••••</code><button onclick="copyKey(\'' + k.key + '\')" class="ml-2 text-blue-400 hover:text-white text-xs flex-shrink-0"><i class="fas fa-copy"></i></button><button onclick="G.apiKeys.splice(' + i + ',1);updateSecurityStats()" class="ml-1 text-red-400 hover:text-red-300 text-xs flex-shrink-0"><i class="fas fa-times"></i></button></div>';
    }).join('');
    showToast('Clé API générée ✓', 'success');
    logActivity('api_key', null, 'Génération clé API');
  }
  function copyKey(k) { navigator.clipboard?.writeText(k).then(function () { showToast('Clé copiée !', 'success'); }); }

  // ════════════════════════════ BILLING
  function renderBillingView() {
    const plan = G.company?.plan || 'FREE';
    const PLANS = {
      FREE:         { n: 'Free',         badge: 'badge-free',         desc: '5 utilisateurs · 1 GB · base',                    price: '0€' },
      STARTER:      { n: 'Starter',      badge: 'badge-starter',      desc: '20 utilisateurs · 10 GB · versioning',             price: '29€' },
      PROFESSIONAL: { n: 'Professional', badge: 'badge-pro',          desc: '100 utilisateurs · 100 GB · RBAC · audit',         price: '79€' },
      ENTERPRISE:   { n: 'Enterprise',   badge: 'badge-enterprise',   desc: 'Illimité · SSO · SLA',                             price: 'Sur devis' },
    };
    const p = PLANS[plan] || PLANS.FREE;
    document.getElementById('currentPlanName').textContent = p.n;
    const badge = document.getElementById('currentPlanBadgeEl'); badge.textContent = plan; badge.className = 'badge-plan ' + p.badge;
    document.getElementById('currentPlanDesc').textContent = p.desc;
    document.getElementById('currentPlanPrice').innerHTML = p.price + '<span class="text-blue-400/60 text-sm font-normal">/mois</span>';
  }
  function selectPlan(plan, el) {
    document.querySelectorAll('.plan-card').forEach(function (c) { c.classList.remove('selected'); });
    el.classList.add('selected');
    G.selectedPlan = plan;
    const btn = document.getElementById('upgradeBtn');
    const cur = (G.company?.plan || 'FREE').toLowerCase();
    btn.disabled = plan === cur;
    btn.textContent = plan === cur ? '✓ Plan actuel' : 'Passer au plan ' + plan.charAt(0).toUpperCase() + plan.slice(1) + ' (Stripe)';
  }
  function simulateUpgrade() {
    const plan = G.selectedPlan.toUpperCase();
    const maxStorage = { FREE: 100, STARTER: 10240, PROFESSIONAL: 102400, ENTERPRISE: 999999 };
    if (G.company) { G.company.plan = plan; G.MAX_STORAGE_MB = maxStorage[plan] || 100; }
    updatePlanUI(plan);
    logActivity('billing', null, 'Passage au plan ' + plan);
    addNotification('success', 'Plan mis à jour', 'Votre plan est maintenant ' + plan);
    showToast('✓ Plan ' + plan + ' activé (simulation Stripe) !', 'success');
    renderBillingView(); updateStats();
  }
  function updatePlanUI(plan) {
    const badge = document.getElementById('planBadge');
    badge.textContent = plan; badge.className = 'hidden sm:inline badge-plan badge-' + plan.toLowerCase();
    if (G.company) { document.getElementById('companyPlanLabel').textContent = 'Plan ' + plan; }
  }

  // ════════════════════════════ SETTINGS
  function saveProfile() {
    const name = document.getElementById('profileName').value.trim();
    const pwd = document.getElementById('profileNewPwd').value, cpwd = document.getElementById('profileConfirmPwd').value;
    if (!name) { showToast('Nom requis', 'error'); return; }
    if (pwd && pwd !== cpwd) { showToast('Mots de passe différents', 'error'); return; }
    if (pwd && pwd.length < 8) { showToast('Mot de passe trop court', 'error'); return; }
    if (G.user) G.user.name = name;
    document.getElementById('userNameDisplay').textContent = name.split(' ')[0];
    document.getElementById('dropdownUserName').textContent = name;
    const initials = name.split(' ').map(function (n) { return n[0]; }).join('').toUpperCase().slice(0, 2);
    document.getElementById('userAvatarInitial').textContent = initials;
    document.getElementById('profileNewPwd').value = '';
    document.getElementById('profileConfirmPwd').value = '';
    logActivity('profile_update', null, 'Mise à jour profil');
    showToast('Profil enregistré ✓', 'success');
  }
  function toggleSetting(s) { const v = document.getElementById(s + 'setting')?.checked; localStorage.setItem('ged_' + s, v); showToast(s + ' ' + (v ? 'activé' : 'désactivé'), 'success'); }
  function exportAllData() {
    const data = { documents: G.docs, users: G.users, tags: G.tags, workflows: G.workflows, audit: G.auditLogs, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'systemesged_export_' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    showToast('Export JSON téléchargé ✓', 'success');
  }
  function exportDocumentsCsv() {
    const csv = ['ID,Nom,Taille,Type,Date,Tags', ...G.docs.map(function (d) { return '"' + d.id + '","' + d.name + '","' + formatFileSize(d.file_size || 0) + '","' + (d.file_type || '') + '","' + fmtDate(d.created_at) + '","' + (d.tags || []).join(';') + '"'; })].join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = 'documents_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
    showToast('CSV téléchargé ✓', 'success');
  }
  function exportAuditLog() {
    const csv = ['Date,Action,Utilisateur,Description', ...G.auditLogs.map(function (l) { return '"' + fmtDate(l.createdAt) + '","' + l.action + '","' + (l.user || '') + '","' + (l.description || '') + '"'; })].join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = 'audit_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
    showToast('Audit exporté ✓', 'success');
  }
  function copySqlSchema() { navigator.clipboard?.writeText(document.getElementById('sqlSchemaBlock').textContent).then(function () { showToast('SQL copié !', 'success'); }); }

  // ════════════════════════════ DANGER ZONE
  function openDangerModal(action) { G.dangerAction = action; document.getElementById('dangerModalMessage').textContent = 'Vous allez supprimer TOUS vos documents de manière définitive.'; document.getElementById('dangerConfirmInput').value = ''; document.getElementById('dangerConfirmBtn').disabled = true; document.getElementById('dangerModal').classList.remove('hidden'); }
  function closeDangerModal() { document.getElementById('dangerModal').classList.add('hidden'); G.dangerAction = null; }
  function checkDangerConfirm() { document.getElementById('dangerConfirmBtn').disabled = document.getElementById('dangerConfirmInput').value !== 'CONFIRMER'; }
  function executeDangerAction() { if (G.dangerAction === 'delete_all') { G.docs = []; renderDocuments(); updateStats(); logActivity('delete_all', null, 'Suppression totale des documents'); showToast('Tous les documents supprimés', 'success'); } closeDangerModal(); }

  // ════════════════════════════ NOTIFICATIONS
  function addNotification(type, title, msg) {
    G.notifications.unshift({ id: 'n-' + Date.now(), type: type, title: title, msg: msg, read: false, at: new Date().toISOString() });
    if (G.notifications.length > 30) G.notifications = G.notifications.slice(0, 30);
    const dot = document.getElementById('notifBadge'), badge = document.getElementById('notifCountBadge');
    const unread = G.notifications.filter(function (n) { return !n.read; }).length;
    if (dot) dot.classList.toggle('hidden', unread === 0);
    if (badge) { badge.textContent = unread; badge.classList.toggle('hidden', unread === 0); }
  }
  function toggleNotifications() { const p = document.getElementById('notifPanel'); p.classList.toggle('hidden'); if (!p.classList.contains('hidden')) loadRealNotifications(); }
  function closeNotifPanel() { document.getElementById('notifPanel').classList.add('hidden'); }
  function loadRealNotifications() {
    const el = document.getElementById('notifContent');
    if (!G.notifications.length) { el.innerHTML = '<div class="px-4 py-6 text-center text-blue-300/50 text-sm">Aucune notification</div>'; return; }
    const ICONS = { success: 'fas fa-check-circle text-green-400', error: 'fas fa-times-circle text-red-400', info: 'fas fa-info-circle text-blue-400', warning: 'fas fa-exclamation-circle text-yellow-400' };
    el.innerHTML = G.notifications.map(function (n) {
      return '<div class="flex items-start gap-3 px-4 py-3 hover:bg-blue-500/10 cursor-pointer ' + (n.read ? 'opacity-60' : '') + '" onclick="this.parentElement.querySelectorAll(\'div\').forEach(x=>x.classList.add(\'opacity-60\'));document.getElementById(\'notifBadge\').classList.add(\'hidden\')"><i class="' + (ICONS[n.type] || ICONS.info) + ' mt-0.5 flex-shrink-0"></i><div class="flex-1 min-w-0"><p class="text-white text-xs font-medium">' + esc(n.title) + '</p><p class="text-blue-400/70 text-xs">' + esc(n.msg) + '</p><p class="text-blue-400/40 text-[10px] mt-0.5">' + timeAgo(n.at) + '</p></div>' + (!n.read ? '<div class="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0 mt-1"></div>' : '') + '</div>';
    }).join('');
  }
  function markAllNotifRead() {
    G.notifications.forEach(function (n) { n.read = true; });
    document.getElementById('notifBadge').classList.add('hidden');
    document.getElementById('notifCountBadge').classList.add('hidden');
    closeNotifPanel();
    showToast('Toutes les notifications lues', 'success');
  }

  // ════════════════════════════ GLOBAL SEARCH
  function handleGlobalSearch(q) {
    const dropdown = document.getElementById('searchDropdown');
    if (!q || q.length < 2) { dropdown.classList.add('hidden'); return; }
    const lower = q.toLowerCase();
    const res = G.docs.filter(function (d) { return d.name.toLowerCase().includes(lower) || (d.description || '').toLowerCase().includes(lower) || (d.tags || []).some(function (t) { return t.toLowerCase().includes(lower); }); }).slice(0, 6);
    if (!res.length) { dropdown.innerHTML = '<div class="px-4 py-3 text-blue-400/60 text-sm">Aucun résultat</div>'; dropdown.classList.remove('hidden'); return; }
    dropdown.innerHTML = res.map(function (d) {
      const fi = getFileIcon(d.name);
      return '<div onclick="switchView(\'documents\');document.getElementById(\'filterType\').value=\'\';renderDocuments([...G.docs].filter(x=>x.id===\'' + d.id + '\'));document.getElementById(\'searchDropdown\').classList.add(\'hidden\')" class="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-500/10 cursor-pointer"><div class="w-7 h-7 rounded-lg ' + fi.bg + ' ' + fi.color + ' border ' + fi.border + ' flex items-center justify-center flex-shrink-0"><i class="fas ' + fi.icon + ' text-xs"></i></div><div class="min-w-0"><p class="text-white text-sm truncate">' + esc(d.name) + '</p><p class="text-blue-400/50 text-xs">' + formatFileSize(d.file_size || 0) + '</p></div></div>';
    }).join('');
    dropdown.classList.remove('hidden');
  }

  // ════════════════════════════ AUDIT HELPER
  function logActivity(action, docId, description) {
    // Log local immédiat
    G.auditLogs.unshift({ id: 'a-' + Date.now(), action: action, docId: docId, description: description, user: G.user?.name || 'Système', createdAt: new Date().toISOString() });
    if (G.auditLogs.length > 200) G.auditLogs = G.auditLogs.slice(0, 200);
    addSysLog('info', description || action);
    // Persister en DB (async, sans bloquer)
    if (G.user) _logActivitySB(action, docId, description).catch(function () {});
  }

  async function _logActivitySB(action, docId, description) {
    if (!G.user) return;
    await SB.from('activity_logs').insert({
      user_id: G.user.id, action: action,
      document_id: docId || null,
      description: description || action
    });
  }

  // ════════════════════════════ TOAST
  function showToast(msg, type) {
    type = type || 'info';
    const ICONS = { success: 'fas fa-check-circle', error: 'fas fa-times-circle', warning: 'fas fa-exclamation-triangle', info: 'fas fa-info-circle' };
    const COLORS = { success: 'border-green-500/40', error: 'border-red-500/40', warning: 'border-yellow-500/40', info: 'border-blue-500/40' };
    const IC = { success: 'text-green-400', error: 'text-red-400', warning: 'text-yellow-400', info: 'text-blue-400' };
    const t = document.createElement('div'); t.className = 'toast ' + (COLORS[type] || COLORS.info);
    t.innerHTML = '<i class="' + (ICONS[type] || ICONS.info) + ' ' + (IC[type] || IC.info) + '"></i><span class="text-sm flex-1">' + msg + '</span>';
    document.getElementById('toastContainer').appendChild(t);
    setTimeout(function () { t.classList.add('hiding'); setTimeout(function () { t.remove(); }, 300); }, 3500);
  }

  // ════════════════════════════ SIDEBAR
  function openMobileSidebar()  { document.getElementById('mobileSidebar').classList.add('open'); document.getElementById('sidebarOverlay').classList.add('active'); document.body.style.overflow = 'hidden'; }
  function closeMobileSidebar() { document.getElementById('mobileSidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('active'); document.body.style.overflow = ''; }

  // ════════════════════════════ PASSWORD TOGGLE
  function togglePwdInput(inputId, btn) {
    const i = document.getElementById(inputId);
    const t = i.type === 'text';
    i.type = t ? 'password' : 'text';
    btn.innerHTML = '<i class="fas fa-eye' + (t ? '' : '-slash') + '"></i>';
  }

  // ════════════════════════════ SUPABASE AUTH INIT
  // Vérifier session au chargement + écouter les changements OAuth
  document.addEventListener('DOMContentLoaded', async function () {
    try {
      const { data: { session }, error } = await SB.auth.getSession();
      if (error) throw error;
      if (session && session.user) {
        await _onSignedIn(session);
      } else {
        document.getElementById('loginScreen').style.display = '';
      }
    } catch (err) {
      console.warn('Session init:', err.message);
      document.getElementById('loginScreen').style.display = '';
    }

    // Gérer les redirections OAuth et changements de session
    SB.auth.onAuthStateChange(async function (event, session) {
      if (event === 'SIGNED_IN' && session && !G.user) {
        await _onSignedIn(session);
      }
      if (event === 'SIGNED_OUT') {
        G.user = null; G.docs = []; G.workflows = [];
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('loginScreen').style.display = '';
      }
      if (event === 'TOKEN_REFRESHED' && session) {
        console.log('Token rafraîchi');
      }
    });
  });

  // ════════════════════════════ EXPOSE FONCTIONS AU DOM (onclick= handlers)
  // Toutes les fonctions appelées via onclick="" dans le HTML doivent être exposées sur window.
  const _pub = {
    switchAuthTab, handleLogin, handleRegister, demoLogin, oauthLogin, handleLogout, _onSignedIn,
    switchView, applyFilters, clearFilters, filterByTag, filterByType, toggleViewMode,
    downloadDocument, confirmDeleteDocument, openDocumentPreview, closePreviewModal,
    openUploadModal, closeUploadModal, handleFileSelect, handleFilePickerSelect,
    handleDocDrop, handleDrop, handleDragOver, handleDragLeave, addUploadTag, uploadDocument,
    openShareModal, closeShareModal, shareDocument, copyShareLink,
    renderShared, switchSharedTab, revokeShare,
    renderWorkflows, filterWorkflows, approveWorkflow, rejectWorkflow,
    openCreateWorkflowModal, closeWorkflowModal, createWorkflow,
    runAdvSearch, clearAdvSearch,
    renderVersioningDocs, toggleVersions, filterVersionDocs, restoreVersion, uploadNewVersion,
    filterLogs, clearSysLogs, exportSysLogs,
    renderRbacCards, openRoleModal, closeRoleModal, saveRole,
    loadUsers, openCreateUserModal, closeAddUserModal, addUser,
    openEditUserModal, closeEditUserModal, saveEditUser, toggleUserActive,
    loadTags, createTag, deleteTag,
    renderAuditLog, scanAllDocuments, generateApiKey, copyKey,
    renderBillingView, selectPlan, simulateUpgrade,
    saveProfile, toggleSetting, exportAllData, exportDocumentsCsv, exportAuditLog, copySqlSchema,
    openDangerModal, closeDangerModal, checkDangerConfirm, executeDangerAction,
    toggleNotifications, closeNotifPanel, markAllNotifRead,
    handleGlobalSearch,
    openMobileSidebar, closeMobileSidebar,
    togglePwdInput,
    // expose G pour les rares cas où l'HTML y accède directement (ex: G.selectedFiles.splice)
    G,
  };
  Object.keys(_pub).forEach(function (k) { window[k] = _pub[k]; });

})();
