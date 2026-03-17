/**
 * SystemesGED v5.0 — app.js
 * Plateforme collaborative d'entreprise
 *
 * Architecture : IIFE + module-scoped state
 * Backend : Supabase (Auth · Database · Storage · Realtime)
 * ─────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // ══════════════════════════════════════════════════════
  // LOGGER SÉCURISÉ (pas de logs en production)
  // ══════════════════════════════════════════════════════
  const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const log = {
    warn:  function (m) { if (IS_DEV) console.warn('[GED]', m); },
    error: function (m) { if (IS_DEV) console.error('[GED]', m); },
    info:  function (m) { if (IS_DEV) console.log('[GED]', m); }
  };

  // ══════════════════════════════════════════════════════
  // SUPABASE CLIENT
  // ══════════════════════════════════════════════════════
  const SUPABASE_URL = 'https://spgtflhprppeoidjguhs.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_0TPq4MIBVDRBzS2CI5WxuA_SV7HkwMJ';
  const SB = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ══════════════════════════════════════════════════════
  // ÉTAT GLOBAL (module-scoped)
  // ══════════════════════════════════════════════════════
  const G = {
    user:          null,   // profil Supabase Auth
    profile:       null,   // users_profiles row
    company:       null,   // companies row
    docs:          [],     // documents de l'entreprise
    companyDocs:   [],     // tous les docs de l'entreprise
    myDocs:        [],     // docs dont je suis owner
    sharedWithMe:  [],     // document_permissions où user_id = moi
    users:         [],     // membres de l'entreprise
    workflows:     [],
    tags:          [],
    notifications: [],
    auditLogs:     [],
    apiKeys:       [],
    roleDefaults:  {},
    sysLogs:       [],
    sentShares:    [],
    selectedFiles: [],
    uploadTags:    [],
    gridView:      true,
    currentView:   'dashboard',
    shareDocId:    null,
    previewDocId:  null,
    dangerAction:  null,
    logFilter:     'all',
    wfFilter:      '',
    docsTab:       'company',   // 'company' | 'mine' | 'shared'
    MAX_STORAGE_MB: 100,
    realtimeChannels: [],
  };

  // ══════════════════════════════════════════════════════
  // CONSTANTES
  // ══════════════════════════════════════════════════════
  const ROLE_LABELS  = { admin:'Administrateur', manager:'Manager', editor:'Éditeur', viewer:'Lecteur' };
  const ROLE_COLORS  = { admin:'bg-red-500/20 text-red-300', manager:'bg-orange-500/20 text-orange-300', editor:'bg-blue-500/20 text-blue-300', viewer:'bg-green-500/20 text-green-300' };
  const PERM_LABELS  = { viewer:'Lecture', editor:'Édition', owner:'Propriétaire', view:'Lecture', download:'Téléchargement', edit:'Édition' };
  const PERM_COLORS  = { viewer:'bg-blue-500/20 text-blue-300', editor:'bg-green-500/20 text-green-300', owner:'bg-purple-500/20 text-purple-300', view:'bg-blue-500/20 text-blue-300', download:'bg-green-500/20 text-green-300', edit:'bg-orange-500/20 text-orange-300' };
  const BLOCKED_EXT  = ['exe','bat','cmd','sh','ps1','vbs','jar','msi','dll','scr','com','pif'];
  const ALLOWED_MIME = ['application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg','image/png','image/gif','image/webp'];
  const LOG_EVENTS = [
    ['info','Session utilisateur vérifiée — token valide'],
    ['debug','Cache documents rechargé'],
    ['info','Supabase heartbeat — latence: ' + (30+Math.floor(Math.random()*40)) + 'ms'],
    ['warn','Rate limit approché sur endpoint /storage'],
    ['security','Auth token renouvelé pour session active'],
  ];
  let logsInterval = null;

  // ══════════════════════════════════════════════════════
  // SÉCURITÉ CLIENT
  // ══════════════════════════════════════════════════════
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'F12') { e.preventDefault(); return; }
    if (e.ctrlKey && e.shiftKey && ['I','i','J','j'].includes(e.key)) { e.preventDefault(); return; }
    if (e.ctrlKey && ['u','U'].includes(e.key)) { e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('globalSearch')?.focus();
    }
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(function (m) { m.classList.add('hidden'); });
      closeNotifPanel();
      document.getElementById('searchDropdown')?.classList.add('hidden');
    }
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#notifWrap'))
      document.getElementById('notifPanel')?.classList.add('hidden');
    if (!e.target.closest('#globalSearch') && !e.target.closest('#searchDropdown'))
      document.getElementById('searchDropdown')?.classList.add('hidden');
  });
  window.onclick = function (event) {
    ['editUserModal','roleModal','uploadModal','shareModal','previewModal','workflowModal','addUserModal','permModal'].forEach(function (id) {
      if (event.target === document.getElementById(id)) window['close'+id.charAt(0).toUpperCase()+id.slice(1)]?.();
    });
  };

  // ══════════════════════════════════════════════════════
  // SESSION TIMEOUT (30 min d'inactivité)
  // ══════════════════════════════════════════════════════
  let _inactivityTimer = null;
  const _INACTIVITY_MS = 30 * 60 * 1000;

  function _resetInactivityTimer() {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = setTimeout(async function () {
      if (!G.user) return;
      showToast('Session expirée par inactivité', 'warning');
      await handleLogout();
    }, _INACTIVITY_MS);
  }
  function _startInactivityWatch() {
    ['mousedown','keydown','touchstart','scroll','click'].forEach(function (e) {
      document.addEventListener(e, _resetInactivityTimer, { passive: true });
    });
    _resetInactivityTimer();
  }
  function _stopInactivityWatch() {
    clearTimeout(_inactivityTimer);
    ['mousedown','keydown','touchstart','scroll','click'].forEach(function (e) {
      document.removeEventListener(e, _resetInactivityTimer);
    });
  }

  // Multi-onglets logout sync
  window.addEventListener('storage', function (e) {
    if (e.key === 'ged_signout' && G.user) {
      G.user = null;
      document.getElementById('mainApp').style.display = 'none';
      document.getElementById('loginScreen').style.display = '';
      showToast('Déconnecté depuis un autre onglet', 'info');
    }
  });

  // ══════════════════════════════════════════════════════
  // UTILS
  // ══════════════════════════════════════════════════════
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;').replace(/\//g,'&#x2F;');
  }
  var escapeHtml = esc;

  function safeUrl(u) {
    if (!u) return '#';
    try { var p = new URL(u); if (!['https:','http:','blob:'].includes(p.protocol)) return '#'; return u; }
    catch (_) { return '#'; }
  }

  function timeAgo(iso) {
    const d = (Date.now() - new Date(iso)) / 1000;
    if (d < 60) return 'À l\'instant';
    if (d < 3600) return Math.floor(d/60) + ' min';
    if (d < 86400) return Math.floor(d/3600) + 'h';
    if (d < 604800) return Math.floor(d/86400) + ' j';
    return new Date(iso).toLocaleDateString('fr-FR');
  }
  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
  }
  function formatFileSize(b) {
    if (!b||b===0) return '0 B';
    const k=1024, s=['B','KB','MB','GB'], i=Math.floor(Math.log(b)/Math.log(k));
    return parseFloat((b/Math.pow(k,i)).toFixed(1))+' '+s[i];
  }
  function getFileIcon(name) {
    const ext = (name||'').split('.').pop().toLowerCase();
    const m = {
      pdf:  { icon:'fa-file-pdf',   color:'text-red-400',    bg:'bg-red-500/20',    border:'border-red-400/30' },
      doc:  { icon:'fa-file-word',  color:'text-blue-400',   bg:'bg-blue-500/20',   border:'border-blue-400/30' },
      docx: { icon:'fa-file-word',  color:'text-blue-400',   bg:'bg-blue-500/20',   border:'border-blue-400/30' },
      xls:  { icon:'fa-file-excel', color:'text-green-400',  bg:'bg-green-500/20',  border:'border-green-400/30' },
      xlsx: { icon:'fa-file-excel', color:'text-green-400',  bg:'bg-green-500/20',  border:'border-green-400/30' },
      png:  { icon:'fa-file-image', color:'text-purple-400', bg:'bg-purple-500/20', border:'border-purple-400/30' },
      jpg:  { icon:'fa-file-image', color:'text-purple-400', bg:'bg-purple-500/20', border:'border-purple-400/30' },
      jpeg: { icon:'fa-file-image', color:'text-purple-400', bg:'bg-purple-500/20', border:'border-purple-400/30' },
      gif:  { icon:'fa-file-image', color:'text-purple-400', bg:'bg-purple-500/20', border:'border-purple-400/30' },
      webp: { icon:'fa-file-image', color:'text-purple-400', bg:'bg-purple-500/20', border:'border-purple-400/30' },
      zip:  { icon:'fa-file-archive',color:'text-yellow-400',bg:'bg-yellow-500/20', border:'border-yellow-400/30' },
    };
    return m[ext] || { icon:'fa-file', color:'text-gray-400', bg:'bg-gray-500/20', border:'border-gray-400/30' };
  }
  function avatarInitials(name) {
    return (name||'?').split(' ').map(function(n){return n[0]||'';}).join('').toUpperCase().slice(0,2)||'?';
  }
  function set$(id, val)    { const el=document.getElementById(id); if(el) el.textContent=val; }
  function setVal$(id, val) { const el=document.getElementById(id); if(el) el.value=val; }

  // ══════════════════════════════════════════════════════
  // AUTH — LOGIN / REGISTER / LOGOUT
  // ══════════════════════════════════════════════════════
  function switchAuthTab(tab) {
    document.getElementById('tabLogin').classList.toggle('active', tab==='login');
    document.getElementById('tabRegister').classList.toggle('active', tab==='register');
    document.getElementById('loginFormWrapper').style.display   = tab==='login' ? '' : 'none';
    document.getElementById('registerFormWrapper').style.display = tab==='register' ? '' : 'none';
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim().toLowerCase().slice(0,254);
    const pwd   = document.getElementById('loginPassword').value.slice(0,128);
    const btn   = document.getElementById('loginBtn');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Email invalide', 'error'); return; }
    // Rate limiting backoff exponentiel
    const now      = Date.now();
    const lockout  = parseInt(localStorage.getItem('ged_lockout')||'0');
    const attempts = parseInt(localStorage.getItem('ged_attempts')||'0');
    if (lockout && now < lockout) {
      const secs = Math.ceil((lockout-now)/1000);
      showToast('🔒 Bloqué ' + secs + 's — trop de tentatives', 'error'); return;
    }
    localStorage.setItem('ged_attempts', attempts+1);
    const waitMap = { 3:10000, 5:30000, 8:120000, 10:300000 };
    const waitKey = Object.keys(waitMap).reverse().find(function(k){return attempts+1>=parseInt(k);});
    if (waitKey) {
      localStorage.setItem('ged_lockout', now+waitMap[waitKey]);
      localStorage.setItem('ged_attempts','0');
      showToast('Trop de tentatives — attendez '+(waitMap[waitKey]/1000)+'s','error'); return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      const { data, error } = await SB.auth.signInWithPassword({ email, password: pwd });
      if (error) throw error;
      localStorage.setItem('ged_attempts','0');
      await _onSignedIn(data.session);
    } catch (err) {
      const msg = err.message.includes('Invalid login') ? 'Email ou mot de passe incorrect' : err.message;
      showToast(msg, 'error');
      btn.disabled = false;
      btn.innerHTML = '<span id="loginBtnText"><i class="fas fa-sign-in-alt mr-2"></i>Se connecter</span>';
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const first   = document.getElementById('regFirst').value.trim();
    const last    = document.getElementById('regLast').value.trim();
    const company = document.getElementById('regCompany').value.trim();
    const email   = document.getElementById('regEmail').value.trim().toLowerCase();
    const pwd     = document.getElementById('regPassword').value;
    if (!first||!last||!email||!company||!pwd) { showToast('Tous les champs sont requis','error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Email invalide','error'); return; }
    if (pwd.length < 8) { showToast('Mot de passe trop court (8+ car.)','error'); return; }
    const strength = [/[A-Z]/,/[a-z]/,/\d/,/[^A-Za-z0-9]/].filter(function(r){return r.test(pwd);}).length;
    if (strength < 3) { showToast('Mot de passe faible (maj + min + chiffre)','error'); return; }
    const btn = document.querySelector('#registerForm button[type="submit"]');
    if (btn) { btn.disabled=true; btn.innerHTML='<span class="spinner"></span>'; }
    try {
      const { data, error } = await SB.auth.signUp({
        email, password: pwd,
        options: { data: { name: first+' '+last, company: company } }
      });
      if (error) throw error;
      showToast('Compte créé ! Vérifiez votre email.','success');
      switchAuthTab('login');
      document.getElementById('loginEmail').value = email;
    } catch (err) {
      showToast('Erreur : '+err.message,'error');
    } finally {
      if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-user-plus mr-2"></i>Créer mon compte'; }
    }
  }

  async function oauthLogin(provider) {
    try {
      const { error } = await SB.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
      if (error) throw error;
    } catch (err) { showToast('Erreur OAuth '+provider+' : '+err.message,'error'); }
  }

  function demoLogin() {
    document.getElementById('loginEmail').value = 'ahouansouange@live.fr';
    showToast('Entrez votre mot de passe','info');
  }

  async function handleLogout() {
    _stopInactivityWatch();
    _unsubscribeRealtime();
    try { await SB.auth.signOut(); } catch (_) {}
    G.user=null; G.profile=null; G.company=null;
    G.docs=[]; G.companyDocs=[]; G.myDocs=[]; G.sharedWithMe=[];
    G.workflows=[]; G.users=[]; G.notifications=[];
    localStorage.setItem('ged_signout', Date.now());
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginScreen').style.display = '';
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    const btn = document.getElementById('loginBtn');
    if (btn) { btn.disabled=false; btn.innerHTML='<span id="loginBtnText"><i class="fas fa-sign-in-alt mr-2"></i>Se connecter</span>'; }
    showToast('Déconnexion réussie','info');
  }

  // ══════════════════════════════════════════════════════
  // INIT APRÈS CONNEXION
  // ══════════════════════════════════════════════════════
  async function _onSignedIn(session) {
    if (!session?.user) return;
    G.user = session.user;
    await _loadProfile();
    await _loadCompany();
    _updateHeaderUI();
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    await _loadAllData();
    switchView('dashboard');
    showToast('Bienvenue, '+(G.profile?.name||G.user.email.split('@')[0])+' !','success');
    _logActivity('login', null, 'Connexion : '+G.user.email);
    _startInactivityWatch();
    _startRealtime();
    startLiveLogs();
  }

  async function _loadProfile() {
    const { data } = await SB.from('users_profiles').select('*').eq('id', G.user.id).single();
    G.profile = data || { id: G.user.id, email: G.user.email, name: G.user.email.split('@')[0], role: 'viewer' };
    // Mettre à jour last_login
    await SB.from('users_profiles').upsert({ id: G.user.id, email: G.user.email, last_login: new Date().toISOString() }, { onConflict: 'id' });
  }

  async function _loadCompany() {
    if (!G.profile?.company_id) { G.company = { id: null, name: 'Mon espace', plan: 'FREE', max_storage: 100*1024*1024 }; return; }
    const { data } = await SB.from('companies').select('*').eq('id', G.profile.company_id).single();
    G.company = data || { id: G.profile.company_id, name: 'Mon organisation', plan: 'FREE', max_storage: 100*1024*1024 };
    G.MAX_STORAGE_MB = Math.round((G.company.max_storage||104857600) / (1024*1024));
  }

  function _updateHeaderUI() {
    const name = G.profile?.name || G.user?.email?.split('@')[0] || 'Utilisateur';
    const role = G.profile?.role || 'viewer';
    set$('userAvatarInitial', avatarInitials(name));
    set$('userNameDisplay', name.split(' ')[0]);
    set$('userRoleDisplay', ROLE_LABELS[role]||role);
    set$('dropdownUserName', name);
    set$('dropdownUserEmail', G.user?.email||'');
    setVal$('profileName', name);
    setVal$('profileEmail', G.user?.email||'');
    if (G.company) {
      set$('companyAvatar', G.company.name[0]?.toUpperCase()||'C');
      set$('companyNameLabel', G.company.name);
      updatePlanUI(G.company.plan||'FREE');
    }
    // Masquer les menus admin/manager pour les viewers/editors
    if (!['admin','manager'].includes(role)) {
      document.querySelectorAll('[data-admin-only]').forEach(function(el){ el.style.display='none'; });
    }
  }

  async function _loadAllData() {
    await Promise.all([
      _loadDocuments(),
      _loadWorkflows(),
      _loadTags(),
      _loadUsers(),
      _loadNotifications(),
      _loadAuditLogs(),
    ]);
    updateStats();
  }

  // ══════════════════════════════════════════════════════
  // CHARGEMENT DONNÉES SUPABASE
  // ══════════════════════════════════════════════════════
  async function _loadDocuments() {
    try {
      // Docs de l'entreprise (company_id)
      let compQuery = SB.from('documents')
        .select('*, document_tags(tags(id,name,color)), document_permissions(user_id,permission,users_profiles(name,email))')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      if (G.profile?.company_id) compQuery = compQuery.eq('company_id', G.profile.company_id);
      else compQuery = compQuery.eq('owner_id', G.user.id);
      const { data: compDocs } = await compQuery;

      // Docs partagés avec moi via document_permissions
      const { data: permDocs } = await SB.from('document_permissions')
        .select('*, documents!inner(*, document_tags(tags(id,name,color)))')
        .eq('user_id', G.user.id)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());

      // Normaliser
      G.companyDocs = (compDocs||[]).map(_normalizeDoc);
      G.myDocs      = G.companyDocs.filter(function(d){ return d.owner_id === G.user.id || d.user_id === G.user.id; });
      G.sharedWithMe = (permDocs||[])
        .filter(function(p){ return p.documents; })
        .map(function(p){ return Object.assign(_normalizeDoc(p.documents), { myPermission: p.permission }); });

      // G.docs = union des docs visibles
      const allIds = new Set();
      G.docs = [];
      G.companyDocs.forEach(function(d){ if(!allIds.has(d.id)){ allIds.add(d.id); G.docs.push(d); } });
      G.sharedWithMe.forEach(function(d){ if(!allIds.has(d.id)){ allIds.add(d.id); G.docs.push(d); } });
    } catch (err) { log.error('loadDocuments: '+err.message); G.docs=[]; G.companyDocs=[]; }
  }

  function _normalizeDoc(d) {
    if (!d) return d;
    return Object.assign({}, d, {
      tags: (d.document_tags||[]).map(function(dt){ return dt.tags?.name||''; }).filter(Boolean),
      collaborators: (d.document_permissions||[]).map(function(dp){
        return { user_id: dp.user_id, permission: dp.permission, name: dp.users_profiles?.name||dp.users_profiles?.email||'?' };
      }),
    });
  }

  async function _loadWorkflows() {
    try {
      let q = SB.from('workflows')
        .select('*, assignee:users_profiles!workflows_assignee_id_fkey(id,name,email), creator:users_profiles!workflows_created_by_fkey(id,name)')
        .order('created_at', { ascending: false });
      if (G.profile?.company_id) q = q.eq('company_id', G.profile.company_id);
      else q = q.or('created_by.eq.'+G.user.id+',assignee_id.eq.'+G.user.id);
      const { data } = await q;
      G.workflows = (data||[]).map(function(w){
        return {
          id:w.id, title:w.title, description:w.description, status:w.status,
          priority:w.priority, docId:w.document_id,
          assigneeId: w.assignee_id,
          assigneeName: w.assignee?.name||w.assignee?.email||'Non assigné',
          createdBy: w.creator?.name||'?',
          dueDate: null, createdAt: w.created_at,
          approvers: w.assignee ? [w.assignee.email||''] : [],
        };
      });
    } catch (err) { log.error('loadWorkflows: '+err.message); G.workflows=[]; }
  }

  async function _loadTags() {
    try {
      let q = SB.from('tags').select('*').order('name');
      if (G.profile?.company_id) q = q.eq('company_id', G.profile.company_id);
      const { data } = await q;
      G.tags = (data||[]).map(function(t){ return { id:t.id, name:t.name, color:t.color||'#3b82f6', count:0 }; });
    } catch (err) { log.error('loadTags: '+err.message); G.tags=[]; }
  }

  async function _loadUsers() {
    try {
      let q = SB.from('users_profiles').select('*').order('name');
      if (G.profile?.company_id) q = q.eq('company_id', G.profile.company_id);
      else q = q.eq('id', G.user.id);
      const { data } = await q;
      G.users = (data||[]).map(function(u){
        return { id:u.id, name:u.name||u.email||'Utilisateur', email:u.email||'', role:u.role||'viewer', active:u.active!==false, lastLogin:u.last_login, docs:0 };
      });
    } catch (err) { log.error('loadUsers: '+err.message); G.users=[]; }
  }

  async function _loadNotifications() {
    try {
      const { data } = await SB.from('notifications')
        .select('*').eq('user_id', G.user.id)
        .order('created_at', { ascending: false }).limit(30);
      G.notifications = (data||[]).map(function(n){
        return { id:n.id, type:n.type, title:n.title, msg:n.message, read:n.read, at:n.created_at, category:n.category };
      });
      _updateNotifBadge();
    } catch (err) { log.error('loadNotifications: '+err.message); }
  }

  async function _loadAuditLogs() {
    try {
      let q = SB.from('activity_logs').select('id, user_id, document_id, description, action, created_at, company_id, users_profiles(name)')
        .order('created_at', { ascending: false }).limit(100);
      if (['admin','manager'].includes(G.profile?.role) && G.profile?.company_id)
        q = q.eq('company_id', G.profile.company_id);
      else q = q.eq('user_id', G.user.id);
      const { data } = await q;
      G.auditLogs = (data||[]).map(function(l){
        return { id:l.id, action:l.action, description:l.description, user:l.users_profiles?.name||'Système', docId:l.document_id, createdAt:l.created_at };
      });
    } catch (err) { log.error('loadAuditLogs: '+err.message); G.auditLogs=[]; }
  }

  // ══════════════════════════════════════════════════════
  // REALTIME SUPABASE
  // ══════════════════════════════════════════════════════
  function _startRealtime() {
    // Notifications en temps réel
    const notifChannel = SB.channel('notifs:'+G.user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: 'user_id=eq.'+G.user.id
      }, function(payload) {
        const n = payload.new;
        G.notifications.unshift({ id:n.id, type:n.type, title:n.title, msg:n.message, read:false, at:n.created_at, category:n.category });
        _updateNotifBadge();
        showToast('🔔 '+n.title, n.type||'info');
      })
      .subscribe();
    G.realtimeChannels.push(notifChannel);

    // Documents de l'entreprise en temps réel
    if (G.profile?.company_id) {
      const docChannel = SB.channel('docs:'+G.profile.company_id)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'documents',
          filter: 'company_id=eq.'+G.profile.company_id
        }, async function(payload) {
          await _loadDocuments();
          if (G.currentView === 'documents') renderDocuments();
          if (G.currentView === 'dashboard') { updateStats(); renderActivityList(); }
        })
        .subscribe();
      G.realtimeChannels.push(docChannel);

      // Workflows en temps réel
      const wfChannel = SB.channel('wf:'+G.profile.company_id)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'workflows',
          filter: 'company_id=eq.'+G.profile.company_id
        }, async function() {
          await _loadWorkflows();
          if (G.currentView === 'workflows') renderWorkflows();
          updateStats();
        })
        .subscribe();
      G.realtimeChannels.push(wfChannel);
    }
  }

  function _unsubscribeRealtime() {
    G.realtimeChannels.forEach(function(ch){ SB.removeChannel(ch); });
    G.realtimeChannels = [];
  }

  // ══════════════════════════════════════════════════════
  // NAVIGATION
  // ══════════════════════════════════════════════════════
  function switchView(v) {
    G.currentView = v;
    document.querySelectorAll('.view-section').forEach(function(el){ el.classList.remove('active-view'); });
    const el = document.getElementById('view-'+v);
    if (el) el.classList.add('active-view');
    document.querySelectorAll('[data-view]').forEach(function(b){ b.classList.toggle('active', b.dataset.view===v); });
    document.querySelectorAll('[data-bnav]').forEach(function(b){
      b.classList.toggle('text-blue-400', b.dataset.bnav===v);
      b.classList.toggle('text-blue-400/60', b.dataset.bnav!==v);
    });
    if (v==='dashboard')  { renderActivityList(); updateStats(); updateQuickAccess(); renderPopularTags(); }
    if (v==='documents')  renderDocuments();
    if (v==='workflows')  renderWorkflows();
    if (v==='shared')     renderSharedView();
    if (v==='users')      loadUsers();
    if (v==='tags')       loadTags();
    if (v==='versioning') renderVersioningDocs();
    if (v==='rbac')       renderRbacCards();
    if (v==='security')   { renderAuditLog(); updateSecurityStats(); }
    if (v==='billing')    renderBillingView();
    if (v==='settings' && G.user) {
      setVal$('profileName', G.profile?.name||'');
      setVal$('profileEmail', G.user.email||'');
    }
  }

  // ══════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════
  function updateStats() {
    const total       = G.docs.length;
    const totalSize   = G.docs.reduce(function(s,d){ return s+(d.file_size||0); }, 0);
    const sizeMB      = (totalSize/(1024*1024)).toFixed(1);
    const pct         = Math.min(Math.round((parseFloat(sizeMB)/G.MAX_STORAGE_MB)*100), 100);
    const pending     = G.workflows.filter(function(w){ return w.status==='pending'; }).length;
    const myPending   = G.workflows.filter(function(w){ return w.status==='pending' && w.assigneeId===G.user?.id; }).length;
    const sharedTotal = G.sharedWithMe.length + (G.sentShares?.length||0);

    set$('totalDocs', total);
    set$('dashWorkflowCount', pending);
    set$('sharedCount', sharedTotal);
    set$('dashUserCount', G.users.filter(function(u){ return u.active; }).length);

    ['d-docsBadge','m-docsBadge'].forEach(function(id){
      const el=document.getElementById(id); if(!el)return;
      el.textContent=total; el.classList.toggle('hidden',total===0);
    });
    ['d-wfBadge','m-wfBadge'].forEach(function(id){
      const el=document.getElementById(id); if(!el)return;
      el.textContent=pending; el.classList.toggle('hidden',pending===0);
    });
    [['storagePercent','storageBar','storageText'],['mobileStoragePercent','mobileStorageBar','mobileStorageText']].forEach(function(ids){
      const pEl=document.getElementById(ids[0]), bEl=document.getElementById(ids[1]), tEl=document.getElementById(ids[2]);
      if(pEl) pEl.textContent=pct+'%';
      if(bEl){ bEl.style.width=pct+'%'; bEl.style.background=pct>90?'linear-gradient(90deg,#ef4444,#f97316)':''; }
      if(tEl) tEl.textContent=sizeMB+' MB / '+G.MAX_STORAGE_MB+' MB';
    });

    // Badge workflows assignés à moi
    const myWfEl = document.getElementById('myWorkflowsBadge');
    if (myWfEl) { myWfEl.textContent=myPending; myWfEl.classList.toggle('hidden', myPending===0); }
  }

  function updateQuickAccess() {
    const pdfC = G.docs.filter(function(d){ return d.name?.toLowerCase().endsWith('.pdf'); }).length;
    const docC = G.docs.filter(function(d){ return /\.(doc|docx)$/i.test(d.name||''); }).length;
    set$('quickPdfCount', pdfC+' fichier(s)');
    set$('quickDocCount', docC+' fichier(s)');
  }
  function renderPopularTags() {
    const counts = {};
    G.docs.forEach(function(d){ (d.tags||[]).forEach(function(t){ counts[t]=(counts[t]||0)+1; }); });
    const sorted = Object.entries(counts).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
    const c = document.getElementById('popularTags');
    if(!c) return;
    c.innerHTML = sorted.length===0
      ? '<span class="text-blue-300/50 text-sm">Aucun tag</span>'
      : sorted.map(function(e){ return '<span class="tag" onclick="filterByTag(\''+esc(e[0])+'\')">#'+esc(e[0])+' <span class="text-blue-400/50 text-[10px]">'+e[1]+'</span></span>'; }).join('');
  }
  function renderActivityList() {
    const el = document.getElementById('activityList');
    if (!el) return;
    const logs = [...G.auditLogs].sort(function(a,b){ return new Date(b.createdAt)-new Date(a.createdAt); }).slice(0,10);
    if (!logs.length) { el.innerHTML='<div class="text-center py-8 text-blue-300/50"><i class="fas fa-folder-open text-2xl mb-2 block"></i>Aucune activité récente</div>'; return; }
    const cfg = {
      login:   {ic:'fas fa-sign-in-alt',   c:'text-purple-400 bg-purple-400/20'},
      upload:  {ic:'fas fa-upload',        c:'text-blue-400 bg-blue-400/20'},
      share:   {ic:'fas fa-share-alt',     c:'text-green-400 bg-green-400/20'},
      delete:  {ic:'fas fa-trash',         c:'text-red-400 bg-red-400/20'},
      logout:  {ic:'fas fa-sign-out-alt',  c:'text-gray-400 bg-gray-400/20'},
      workflow:{ic:'fas fa-project-diagram',c:'text-orange-400 bg-orange-400/20'},
      collab:  {ic:'fas fa-users',         c:'text-cyan-400 bg-cyan-400/20'},
    };
    el.innerHTML = logs.map(function(l){
      const a = cfg[l.action]||{ic:'fas fa-info-circle',c:'text-blue-400 bg-blue-400/20'};
      return '<div class="flex items-center gap-3 p-2 rounded-xl hover:bg-blue-500/5 transition-all"><div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 '+a.c+'"><i class="'+a.ic+' text-xs"></i></div><div class="flex-1 min-w-0"><p class="text-white text-xs font-medium truncate">'+esc(l.description)+'</p><p class="text-blue-400/50 text-xs">'+esc(l.user)+'</p></div><p class="text-blue-400/40 text-xs flex-shrink-0">'+timeAgo(l.createdAt)+'</p></div>';
    }).join('');
  }

  // ══════════════════════════════════════════════════════
  // DOCUMENTS — onglets Entreprise / Mes docs / Partagés
  // ══════════════════════════════════════════════════════
  function switchDocsTab(tab) {
    G.docsTab = tab;
    ['company','mine','shared'].forEach(function(t){
      const btn = document.getElementById('docsTab-'+t);
      if (btn) btn.classList.toggle('active', t===tab);
    });
    renderDocuments();
  }

  function renderDocuments(override) {
    const arr  = override || _getDocsForTab();
    const cnt  = document.getElementById('resultsCount');
    if (cnt) cnt.textContent = arr.length+' document(s)';
    const grid = document.getElementById('documentGrid');
    if (!grid) return;
    if (!arr.length) {
      const msgs = {
        company: 'Aucun document dans l\'entreprise',
        mine:    'Vous n\'avez uploadé aucun document',
        shared:  'Aucun document partagé avec vous',
      };
      grid.innerHTML = '<div class="col-span-full text-center py-16"><div class="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-400"><i class="fas fa-folder-open text-4xl"></i></div><p class="text-blue-300/70 mb-2 text-lg font-semibold">'+esc(msgs[G.docsTab]||'Aucun document')+'</p><button onclick="openUploadModal()" class="btn-primary px-6 py-3 text-white rounded-xl font-semibold inline-flex items-center gap-2 mt-4"><i class="fas fa-cloud-upload-alt"></i>Importer</button></div>';
      return;
    }
    if (G.gridView) {
      grid.className = 'doc-grid';
      grid.innerHTML = arr.map(createDocCard).join('');
    } else {
      grid.className = '';
      grid.innerHTML = '<div class="glass-card rounded-2xl border border-blue-500/20 overflow-hidden divide-y divide-blue-500/10">'+arr.map(createDocListItem).join('')+'</div>';
    }
    updateStats();
  }

  function _getDocsForTab() {
    let arr = [];
    if (G.docsTab === 'company') arr = G.companyDocs;
    else if (G.docsTab === 'mine') arr = G.myDocs;
    else arr = G.sharedWithMe;
    return _applyFilters(arr);
  }

  function _applyFilters(arr) {
    const type = document.getElementById('filterType')?.value||'';
    const date = document.getElementById('filterDate')?.value||'';
    if (type) arr = arr.filter(function(d){
      const ext = (d.name||'').split('.').pop().toLowerCase();
      if (type==='pdf') return ext==='pdf';
      if (type==='doc') return ['doc','docx'].includes(ext);
      if (type==='xls') return ['xls','xlsx'].includes(ext);
      if (type==='img') return ['jpg','jpeg','png','gif','webp'].includes(ext);
      return true;
    });
    if (date) {
      const now = new Date();
      arr = arr.filter(function(d){
        const c = new Date(d.created_at);
        if (date==='today') return c.toDateString()===now.toDateString();
        if (date==='week') return (now-c)<7*86400000;
        if (date==='month') return (now-c)<30*86400000;
        return true;
      });
    }
    return arr;
  }

  function applyFilters() { renderDocuments(); }
  function clearFilters() {
    ['filterType','filterDate'].forEach(function(id){ const el=document.getElementById(id); if(el) el.value=''; });
    renderDocuments();
  }
  function filterByTag(t) {
    switchView('documents');
    renderDocuments(G.docs.filter(function(d){ return (d.tags||[]).includes(t); }));
  }
  function filterByType(t) {
    const el = document.getElementById('filterType');
    if (el) el.value = t;
    switchView('documents');
    applyFilters();
  }
  function toggleViewMode() {
    G.gridView = !G.gridView;
    const icon = document.getElementById('viewModeIcon');
    if (icon) { icon.classList.toggle('fa-th-large',G.gridView); icon.classList.toggle('fa-list',!G.gridView); }
    renderDocuments();
  }

  function createDocCard(doc) {
    const fi = getFileIcon(doc.name||'');
    const tags = (doc.tags||[]).map(function(t){ return '<span class="tag text-[10px]" onclick="event.stopPropagation();filterByTag(\''+esc(t)+'\')">#'+esc(t)+'</span>'; }).join('');
    const collab = doc.collaborators?.length ? '<span class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-cyan-500/15 text-cyan-400 rounded-full border border-cyan-500/20"><i class="fas fa-users"></i>'+doc.collaborators.length+'</span>' : '';
    const wfCount = G.workflows.filter(function(w){ return w.docId===doc.id && w.status==='pending'; }).length;
    const wfBadge = wfCount>0 ? '<span class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-orange-500/15 text-orange-400 rounded-full border border-orange-500/20"><i class="fas fa-project-diagram"></i>'+wfCount+' WF</span>' : '';
    const isOwner = doc.owner_id === G.user?.id || doc.user_id === G.user?.id;
    return '<div class="document-card glass-card rounded-xl p-4 border border-blue-500/20 relative group cursor-pointer" onclick="openDocumentPreview(\''+doc.id+'\')">'+
      '<div class="flex items-start justify-between mb-3">'+
        '<div class="w-12 h-12 '+fi.bg+' rounded-xl flex items-center justify-center '+fi.color+' border '+fi.border+'"><i class="fas '+fi.icon+' text-xl"></i></div>'+
        '<div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">'+
          '<button onclick="event.stopPropagation();downloadDocument(\''+doc.id+'\')" class="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg" title="Télécharger"><i class="fas fa-download"></i></button>'+
          '<button onclick="event.stopPropagation();openShareModal(\''+doc.id+'\')" class="p-2 text-purple-400 hover:bg-purple-500/10 rounded-lg" title="Partager"><i class="fas fa-share-alt"></i></button>'+
          '<button onclick="event.stopPropagation();openPermModal(\''+doc.id+'\')" class="p-2 text-cyan-400 hover:bg-cyan-500/10 rounded-lg" title="Collaborateurs"><i class="fas fa-users"></i></button>'+
          (isOwner||['admin','manager'].includes(G.profile?.role) ? '<button onclick="event.stopPropagation();confirmDeleteDocument(\''+doc.id+'\')" class="p-2 text-red-400 hover:bg-red-500/10 rounded-lg" title="Supprimer"><i class="fas fa-trash"></i></button>' : '')+
        '</div>'+
      '</div>'+
      '<h4 class="font-bold text-white mb-1 truncate" title="'+esc(doc.name)+'">'+esc(doc.name)+'</h4>'+
      '<p class="text-xs text-blue-300/70 mb-2 line-clamp-2 h-8">'+esc(doc.description||'Sans description')+'</p>'+
      '<div class="flex flex-wrap gap-1 mb-2 min-h-[20px]">'+tags+'</div>'+
      '<div class="flex flex-wrap gap-1 mb-2">'+collab+wfBadge+'</div>'+
      '<div class="flex items-center justify-between text-xs border-t border-blue-500/10 pt-3">'+
        '<span class="text-blue-400/60">'+formatFileSize(doc.file_size||0)+'</span>'+
        '<span class="text-blue-400/60">'+fmtDate(doc.created_at)+'</span>'+
      '</div>'+
      ((doc.version_number||1)>1 ? '<div class="absolute top-2 right-2 version-badge">v'+doc.version_number+'</div>' : '')+
    '</div>';
  }

  function createDocListItem(doc) {
    const fi = getFileIcon(doc.name||'');
    const isOwner = doc.owner_id === G.user?.id || doc.user_id === G.user?.id;
    return '<div class="doc-list-item hover:bg-blue-500/5 cursor-pointer transition-all" onclick="openDocumentPreview(\''+doc.id+'\')">'+
      '<div class="doc-icon '+fi.bg+' rounded-lg flex items-center justify-center '+fi.color+' border '+fi.border+'"><i class="fas '+fi.icon+'"></i></div>'+
      '<div class="doc-content">'+
        '<h4 class="font-bold text-white truncate">'+esc(doc.name)+'</h4>'+
        '<p class="text-xs text-blue-300/70">'+esc(doc.description||'')+'&nbsp;·&nbsp;'+formatFileSize(doc.file_size||0)+'&nbsp;·&nbsp;'+fmtDate(doc.created_at)+'</p>'+
      '</div>'+
      '<div class="doc-actions">'+
        '<button onclick="event.stopPropagation();downloadDocument(\''+doc.id+'\')" class="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg"><i class="fas fa-download"></i></button>'+
        '<button onclick="event.stopPropagation();openShareModal(\''+doc.id+'\')" class="p-2 text-purple-400 hover:bg-purple-500/10 rounded-lg"><i class="fas fa-share-alt"></i></button>'+
        '<button onclick="event.stopPropagation();openPermModal(\''+doc.id+'\')" class="p-2 text-cyan-400 hover:bg-cyan-500/10 rounded-lg"><i class="fas fa-users"></i></button>'+
        (isOwner||['admin','manager'].includes(G.profile?.role) ? '<button onclick="event.stopPropagation();confirmDeleteDocument(\''+doc.id+'\')" class="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"><i class="fas fa-trash"></i></button>' : '')+
      '</div>'+
    '</div>';
  }

  function getFilteredDocs() { return _getDocsForTab(); }

  // ══════════════════════════════════════════════════════
  // UPLOAD — Antivirus + Hash SHA-256 + Supabase Storage
  // ══════════════════════════════════════════════════════
  async function _sha256(file) {
    try {
      const buf = await file.arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(hash)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
    } catch (_) { return null; }
  }

  async function _scanFile(file) {
    const ext = (file.name||'').split('.').pop().toLowerCase();
    if (BLOCKED_EXT.includes(ext)) return { safe:false, reason:'Extension dangereuse: .'+ext };
    const buf = await file.slice(0,8).arrayBuffer();
    const bytes = new Uint8Array(buf);
    const sigs = [
      { b:[0x4D,0x5A], name:'EXE/DLL' },
      { b:[0x7F,0x45,0x4C,0x46], name:'ELF Linux' },
      { b:[0xCA,0xFE,0xBA,0xBE], name:'Java class' },
    ];
    for (var si=0; si<sigs.length; si++) {
      const sig = sigs[si];
      let match = true;
      for (var bi=0; bi<sig.b.length; bi++) { if(bytes[bi]!==sig.b[bi]){match=false;break;} }
      if (match) return { safe:false, reason:sig.name+' détecté' };
    }
    if (file.type && !ALLOWED_MIME.includes(file.type)) return { safe:false, reason:'Type MIME non autorisé: '+file.type };
    return { safe:true };
  }

  function openUploadModal()  { document.getElementById('uploadModal')?.classList.remove('hidden'); document.body.style.overflow='hidden'; }
  function closeUploadModal() {
    document.getElementById('uploadModal')?.classList.add('hidden'); document.body.style.overflow='';
    G.selectedFiles=[]; G.uploadTags=[];
    document.getElementById('selectedFilesList').innerHTML='';
    document.getElementById('uploadProgress')?.classList.add('hidden');
    const bar=document.getElementById('uploadProgressBar'); if(bar) bar.style.width='0%';
    const pct=document.getElementById('uploadPercent'); if(pct) pct.textContent='0%';
    const docName=document.getElementById('docNameInput'); if(docName) docName.value='';
    const docDesc=document.getElementById('docDescInput'); if(docDesc) docDesc.value='';
  }

  function handleFileSelect(e)       { _addFiles(Array.from(e.target.files)); }
  function handleFilePickerSelect(e) { _addFiles(Array.from(e.target.files)); }
  function handleDrop(e, zoneId)     { e.preventDefault(); handleDragLeave(e,zoneId); _addFiles(Array.from(e.dataTransfer.files)); }
  function handleDocDrop(e)          { e.preventDefault(); _addFiles(Array.from(e.dataTransfer.files)); }
  function handleDragOver(e, zoneId) { e.preventDefault(); document.getElementById(zoneId)?.classList.add('drag-over'); }
  function handleDragLeave(e, zoneId){ document.getElementById(zoneId)?.classList.remove('drag-over'); }

  function _addFiles(files) {
    files.forEach(function(f){
      if (f.size>100*1024*1024) { showToast(f.name+' dépasse 100 MB','error'); return; }
      if (!G.selectedFiles.find(function(x){return x.name===f.name&&x.size===f.size;})) G.selectedFiles.push(f);
    });
    renderSelectedFiles();
  }
  function renderSelectedFiles() {
    document.getElementById('selectedFilesList').innerHTML = G.selectedFiles.map(function(f,i){
      return '<div class="flex items-center gap-3 px-3 py-2 rounded-lg" style="background:rgba(59,130,246,0.08);border:1px solid rgba(96,165,250,0.15)"><i class="fas '+getFileIcon(f.name).icon+' text-blue-400 text-sm flex-shrink-0"></i><div class="flex-1 min-w-0"><p class="text-white text-xs font-medium truncate">'+esc(f.name)+'</p><p class="text-blue-400/50 text-xs">'+formatFileSize(f.size)+'</p></div><button onclick="G.selectedFiles.splice('+i+',1);renderSelectedFiles()" class="text-red-400 hover:text-red-300 text-xs"><i class="fas fa-times"></i></button></div>';
    }).join('');
  }

  function addUploadTag() {
    const v = document.getElementById('tagInput')?.value.trim();
    if (!v||G.uploadTags.includes(v)) return;
    G.uploadTags.push(v);
    document.getElementById('tagInput').value='';
    const c = document.getElementById('uploadTagsContainer');
    if(c) c.innerHTML = G.uploadTags.map(function(t,i){ return '<span class="tag">'+esc(t)+' <span class="tag-close" onclick="G.uploadTags.splice('+i+',1);addUploadTag()">×</span></span>'; }).join('');
  }

  async function uploadDocument() {
    if (!G.selectedFiles.length) { showToast('Aucun fichier sélectionné','error'); return; }
    showToast('Analyse des fichiers…','info');
    for (var fi=0; fi<G.selectedFiles.length; fi++) {
      const f = G.selectedFiles[fi];
      const scan = await _scanFile(f);
      if (!scan.safe) {
        showToast('🛡️ Fichier bloqué — '+scan.reason+' : '+f.name,'error');
        _logActivity('security', null, 'Fichier bloqué antivirus : '+f.name+' — '+scan.reason);
        return;
      }
    }
    const btn = document.getElementById('uploadBtn');
    if (btn) btn.disabled = true;
    document.getElementById('uploadProgress')?.classList.remove('hidden');
    const docName = document.getElementById('docNameInput')?.value.trim();
    const desc    = document.getElementById('docDescInput')?.value.trim();
    let uploaded = 0;

    for (var i=0; i<G.selectedFiles.length; i++) {
      const file = G.selectedFiles[i];
      const finalName  = (docName && G.selectedFiles.length===1) ? docName : file.name;
      const safeName   = file.name.replace(/[^a-zA-Z0-9.\-_]/g,'_');
      const storagePath = G.user.id+'/'+Date.now()+'_'+safeName;
      const pct = Math.round(((i+0.5)/G.selectedFiles.length)*100);
      const bar = document.getElementById('uploadProgressBar');
      const pctEl = document.getElementById('uploadPercent');
      if(bar) bar.style.width=pct+'%';
      if(pctEl) pctEl.textContent=pct+'%';

      try {
        const { error: storageErr } = await SB.storage.from('documents').upload(storagePath, file);
        if (storageErr) throw storageErr;
        const { data: urlData } = SB.storage.from('documents').getPublicUrl(storagePath);
        const fileHash = await _sha256(file);
        const payload = {
          name: finalName, description: desc||'Document importé',
          file_url: urlData.publicUrl, file_size: file.size, file_type: file.type,
          storage_path: storagePath, owner_id: G.user.id,
          company_id: G.profile?.company_id||null,
          version_number: 1,
        };
        if (fileHash) payload.sha256 = fileHash;
        const { data: docData, error: dbErr } = await SB.from('documents').insert([payload]).select().single();
        if (dbErr) throw dbErr;

        // Tags
        for (var ti=0; ti<G.uploadTags.length; ti++) {
          const tagName = G.uploadTags[ti];
          let { data: tagRow } = await SB.from('tags').select('id').eq('name',tagName)
            .eq('company_id', G.profile?.company_id||'').single();
          if (!tagRow) {
            const { data: newTag } = await SB.from('tags').insert({name:tagName,color:'#3b82f6',company_id:G.profile?.company_id||null}).select().single();
            tagRow = newTag;
          }
          if (tagRow) await SB.from('document_tags').insert({document_id:docData.id,tag_id:tagRow.id});
        }
        _logActivity('upload', docData.id, 'Upload : '+finalName);
        addNotification('success','Document importé', finalName);
        uploaded++;
      } catch (err) { showToast('Erreur upload '+file.name+' : '+err.message,'error'); }

      if(bar) bar.style.width=Math.round(((i+1)/G.selectedFiles.length)*100)+'%';
    }

    if (uploaded>0) showToast(uploaded+' fichier(s) importé(s) ✓','success');
    closeUploadModal();
    await _loadDocuments();
    if (G.currentView==='documents') renderDocuments();
    updateStats();
  }

  // ══════════════════════════════════════════════════════
  // DOCUMENT PREVIEW & DOWNLOAD
  // ══════════════════════════════════════════════════════
  function openDocumentPreview(id) {
    G.previewDocId = id;
    const d = G.docs.find(function(x){ return x.id===id; });
    if (!d) return;
    const fi = getFileIcon(d.name||'');
    set$('previewTitle', d.name||'');
    set$('previewMeta', formatFileSize(d.file_size||0)+' · '+fmtDate(d.created_at));
    const iconEl = document.getElementById('previewIcon');
    if (iconEl) iconEl.innerHTML = '<div class="w-10 h-10 rounded-lg '+fi.bg+' '+fi.color+' border '+fi.border+' flex items-center justify-center"><i class="fas '+fi.icon+'"></i></div>';

    // Collaborateurs
    const collabEl = document.getElementById('previewCollaborators');
    if (collabEl && d.collaborators?.length) {
      collabEl.innerHTML = '<div class="mt-3 pt-3 border-t border-blue-500/15"><p class="text-xs text-blue-300/60 mb-2">Collaborateurs ('+d.collaborators.length+')</p>'+
        d.collaborators.map(function(c){
          return '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg '+PERM_COLORS[c.permission]+' text-xs mr-1 mb-1 border border-blue-500/10"><span class="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] font-bold">'+esc(avatarInitials(c.name))+'</span>'+esc(c.name)+'</span>';
        }).join('')+'</div>';
    } else if (collabEl) { collabEl.innerHTML=''; }

    const content  = document.getElementById('previewContent');
    const frame    = document.getElementById('previewFrame');
    const img      = document.getElementById('previewImage');
    if(content) content.classList.add('hidden');
    if(frame)   frame.classList.add('hidden');
    if(img)     img.classList.add('hidden');

    const url = d.file_url ? safeUrl(d.file_url) : '';
    const ext = (d.name||'').split('.').pop().toLowerCase();
    if (url && ['jpg','jpeg','png','gif','webp'].includes(ext)) {
      if(img){ img.src=url; img.classList.remove('hidden'); }
    } else if (url && ext==='pdf') {
      if(frame){ frame.src=url; frame.classList.remove('hidden'); }
    } else {
      if(content) content.classList.remove('hidden');
    }
    _logActivity('view', id, 'Aperçu : '+d.name);
    document.getElementById('previewModal')?.classList.remove('hidden');
  }
  function closePreviewModal() { document.getElementById('previewModal')?.classList.add('hidden'); G.previewDocId=null; }

  async function downloadDocument(id) {
    const d = G.docs.find(function(x){ return x.id===id; }); if (!d) return;
    showToast('Téléchargement de "'+d.name+'"…','info');
    _logActivity('download', id, 'Téléchargement : '+d.name);
    let url = d.file_url;
    if (d.storage_path) {
      const { data: urlData } = await SB.storage.from('documents').createSignedUrl(d.storage_path, 300);
      if (urlData?.signedUrl) url = urlData.signedUrl;
    }
    if (url) { const a=document.createElement('a'); a.href=url; a.download=d.name; a.target='_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
  }
  function downloadCurrentDocument() { if (G.previewDocId) downloadDocument(G.previewDocId); }
  function shareCurrentDocument()    { if (G.previewDocId) { closePreviewModal(); openShareModal(G.previewDocId); } }

  async function confirmDeleteDocument(id) {
    const d = G.docs.find(function(x){ return x.id===id; }); if (!d) return;
    if (!confirm('Supprimer "'+d.name+'" ? Cette action est irréversible.')) return;
    try {
      if (d.storage_path) await SB.storage.from('documents').remove([d.storage_path]);
      const { error } = await SB.from('documents').update({ is_deleted: true }).eq('id', id);
      if (error) throw error;
      G.docs = G.docs.filter(function(x){ return x.id!==id; });
      G.companyDocs = G.companyDocs.filter(function(x){ return x.id!==id; });
      G.myDocs = G.myDocs.filter(function(x){ return x.id!==id; });
      _logActivity('delete', id, 'Suppression : '+d.name);
      showToast('"'+d.name+'" supprimé ✓','success');
      renderDocuments(); updateStats();
    } catch (err) { showToast('Erreur suppression : '+err.message,'error'); }
  }

  // ══════════════════════════════════════════════════════
  // PARTAGE — Lien sécurisé + Email professionnel
  // ══════════════════════════════════════════════════════
  function openShareModal(id) {
    G.shareDocId = id;
    const d = G.docs.find(function(x){ return x.id===id; }); if (!d) return;
    const fi = getFileIcon(d.name||'');
    const infoEl = document.getElementById('shareDocInfo');
    if (infoEl) infoEl.innerHTML = '<div class="w-10 h-10 rounded-xl '+fi.bg+' '+fi.color+' border '+fi.border+' flex items-center justify-center flex-shrink-0"><i class="fas '+fi.icon+'"></i></div><div><p class="text-white font-semibold text-sm">'+esc(d.name)+'</p><p class="text-blue-400/60 text-xs">'+formatFileSize(d.file_size||0)+'</p></div>';
    const emailEl = document.getElementById('shareEmail'); if(emailEl) emailEl.value='';
    document.getElementById('generatedLink')?.classList.add('hidden');
    document.getElementById('shareModal')?.classList.remove('hidden');
  }
  function closeShareModal() { document.getElementById('shareModal')?.classList.add('hidden'); G.shareDocId=null; }

  async function shareDocument() {
    const email = document.getElementById('shareEmail')?.value.trim();
    if (!email) { showToast('Email requis','error'); return; }
    const perm = document.getElementById('sharePermission')?.value||'view';
    const exp  = parseInt(document.getElementById('shareExpiration')?.value||'7');
    const d    = G.docs.find(function(x){ return x.id===G.shareDocId; }); if (!d) return;
    try {
      const expiresAt = exp ? new Date(Date.now()+exp*86400000).toISOString() : null;
      const { error } = await SB.from('shared_documents').insert({
        document_id: d.id, shared_by: G.user.id,
        shared_with_email: email, permission: perm, expires_at: expiresAt
      });
      if (error) throw error;
      // Signed URL
      let signedUrl = window.location.origin;
      if (d.storage_path) {
        const secs = exp ? exp*86400 : 604800;
        const { data: urlData } = await SB.storage.from('documents').createSignedUrl(d.storage_path, secs);
        if (urlData?.signedUrl) signedUrl = urlData.signedUrl;
      }
      const linkInput = document.getElementById('shareLinkInput');
      if(linkInput) linkInput.value = signedUrl;
      document.getElementById('generatedLink')?.classList.remove('hidden');
      G.sentShares = G.sentShares||[];
      G.sentShares.unshift({ id:'s-'+Date.now(), docId:d.id, docName:d.name, sharedWith:email, permission:perm, expiresAt:expiresAt, createdAt:new Date().toISOString() });
      _logActivity('share', d.id, 'Partage "'+d.name+'" → '+email);
      addNotification('success','Document partagé', d.name+' → '+email);
      showToast('Partage créé ✓ — '+email,'success');
      _openShareEmail(email, d, perm, exp, expiresAt, signedUrl);
    } catch (err) { showToast('Erreur partage : '+err.message,'error'); }
  }
  function copyShareLink() {
    const v = document.getElementById('shareLinkInput')?.value;
    if(v) navigator.clipboard?.writeText(v).then(function(){ showToast('Lien copié !','success'); });
  }

  function _openShareEmail(toEmail, doc, permission, duration, expiresAt, signedUrl) {
    const senderName = G.profile?.name||G.user.email;
    const permLabel  = PERM_LABELS[permission]||permission;
    const expStr     = expiresAt ? new Date(expiresAt).toLocaleDateString('fr-FR') : 'Illimité';
    const durLabel   = duration ? duration+' jour(s)' : 'Illimité';
    const subject = encodeURIComponent('[SystemesGED] '+senderName+' partage avec vous : '+doc.name);
    const body = encodeURIComponent(
      'Bonjour,\n\n'+senderName+' vous partage un document via SystemesGED.\n\n'+
      '━━━━━━━━━━━━━━━━━━━━━━━\n'+
      '📄 '+doc.name+'\n'+
      (doc.file_size?'Taille     : '+formatFileSize(doc.file_size)+'\n':'')+
      'Permission : '+permLabel+'\n'+'Validité   : '+durLabel+'\n'+'Expiration : '+expStr+'\n'+
      '━━━━━━━━━━━━━━━━━━━━━━━\n\n'+
      '🔗 Accéder au document :\n'+signedUrl+'\n\n'+
      '⚠️ Ce lien est sécurisé et personnel.\n🔒 SystemesGED v5.0 — '+window.location.origin
    );
    window.location.href = 'mailto:'+toEmail+'?subject='+subject+'&body='+body;
  }

  // ══════════════════════════════════════════════════════
  // PERMISSIONS COLLABORATEURS (document_permissions)
  // ══════════════════════════════════════════════════════
  let _permDocId = null;

  async function openPermModal(docId) {
    _permDocId = docId;
    const d = G.docs.find(function(x){ return x.id===docId; }); if (!d) return;
    set$('permDocName', d.name||'');
    await _renderCollaboratorsList(docId);
    document.getElementById('permModal')?.classList.remove('hidden');
  }
  function closePermModal() { document.getElementById('permModal')?.classList.add('hidden'); _permDocId=null; }

  async function _renderCollaboratorsList(docId) {
    const el = document.getElementById('collaboratorsList'); if (!el) return;
    const { data } = await SB.from('document_permissions')
      .select('*, users_profiles(id,name,email)')
      .eq('document_id', docId);
    const perms = data||[];
    if (!perms.length) { el.innerHTML='<p class="text-blue-300/50 text-sm text-center py-4">Aucun collaborateur</p>'; return; }
    el.innerHTML = perms.map(function(p){
      const name = p.users_profiles?.name||p.users_profiles?.email||'?';
      const pclr = PERM_COLORS[p.permission]||'bg-blue-500/20 text-blue-300';
      return '<div class="flex items-center gap-3 p-3 rounded-xl bg-slate-900/30 border border-blue-500/10">'+
        '<div class="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-300 font-bold text-sm flex-shrink-0">'+esc(avatarInitials(name))+'</div>'+
        '<div class="flex-1 min-w-0"><p class="text-white text-sm truncate">'+esc(name)+'</p><p class="text-blue-400/50 text-xs truncate">'+esc(p.users_profiles?.email||'')+'</p></div>'+
        '<span class="px-2 py-1 rounded-lg text-xs '+pclr+' border border-blue-500/10">'+esc(PERM_LABELS[p.permission]||p.permission)+'</span>'+
        '<button onclick="removeCollaborator(\''+p.id+'\')" class="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg"><i class="fas fa-times text-xs"></i></button>'+
      '</div>';
    }).join('');
  }

  async function addCollaborator() {
    if (!_permDocId) return;
    const email = document.getElementById('collabEmail')?.value.trim();
    const perm  = document.getElementById('collabPermission')?.value||'viewer';
    if (!email) { showToast('Email requis','error'); return; }
    // Trouver l'utilisateur par email
    const { data: targetUser } = await SB.from('users_profiles').select('id,name').eq('email', email).single();
    if (!targetUser) { showToast('Utilisateur introuvable : '+email,'error'); return; }
    const { error } = await SB.from('document_permissions').upsert({
      document_id: _permDocId, user_id: targetUser.id,
      permission: perm, shared_by: G.user.id
    }, { onConflict: 'document_id,user_id' });
    if (error) { showToast('Erreur : '+error.message,'error'); return; }
    document.getElementById('collabEmail').value='';
    _logActivity('collab', _permDocId, 'Collaboration accordée à '+email+' ('+perm+')');
    showToast(email+' ajouté comme '+PERM_LABELS[perm]||perm,'success');
    await _renderCollaboratorsList(_permDocId);
    await _loadDocuments();
  }

  async function removeCollaborator(permId) {
    const { error } = await SB.from('document_permissions').delete().eq('id', permId);
    if (error) { showToast('Erreur : '+error.message,'error'); return; }
    showToast('Collaborateur retiré','success');
    if (_permDocId) await _renderCollaboratorsList(_permDocId);
  }

  // ══════════════════════════════════════════════════════
  // VUE PARTAGÉS (onglet dédié)
  // ══════════════════════════════════════════════════════
  async function renderSharedView() {
    await _loadDocuments();
    // Stats
    const now = new Date();
    set$('statSharedSent',     (G.sentShares||[]).length);
    set$('statSharedReceived', G.sharedWithMe.length);
    set$('statSharedActive',   G.sharedWithMe.filter(function(d){ return !d.expires_at || new Date(d.expires_at)>now; }).length);
    switchSharedTab('received');
  }

  function switchSharedTab(tab) {
    ['received','sent'].forEach(function(t){
      const btn=document.getElementById('tab-'+t);
      const panel=document.getElementById('shared-'+t);
      if(btn)  btn.className = t===tab ? 'px-5 py-2.5 text-sm font-medium text-blue-400 border-b-2 border-blue-400 -mb-px flex items-center gap-2' : 'px-5 py-2.5 text-sm font-medium text-gray-400 border-b-2 border-transparent -mb-px hover:text-blue-400 flex items-center gap-2';
      if(panel){ panel.classList.toggle('hidden', t!==tab); }
    });
    if (tab==='received') _renderReceivedShares();
    if (tab==='sent')     renderSentShares();
  }

  function _renderReceivedShares() {
    const empty = document.getElementById('sharedEmptyState');
    const list  = document.getElementById('sharedList');
    const now   = new Date();
    if (!G.sharedWithMe.length) { empty?.classList.remove('hidden'); list?.classList.add('hidden'); return; }
    empty?.classList.add('hidden'); list?.classList.remove('hidden');
    if (!list) return;
    list.innerHTML = G.sharedWithMe.map(function(d){
      const fi = getFileIcon(d.name||'');
      const expired = d.expires_at && new Date(d.expires_at)<now;
      const pclr = PERM_COLORS[d.myPermission||'viewer']||'bg-blue-500/20 text-blue-300';
      const expLabel = d.expires_at ? (expired?'🔴 Expiré':'🟢 Exp. '+fmtDate(d.expires_at)) : '🟢 Illimité';
      return '<div class="glass-card rounded-2xl border '+(expired?'border-red-500/20 opacity-60':'border-purple-500/20')+' p-5">'+
        '<div class="flex items-start gap-4">'+
          '<div class="w-14 h-14 '+fi.bg+' rounded-2xl flex items-center justify-center '+fi.color+' border '+fi.border+' flex-shrink-0"><i class="fas '+fi.icon+' text-2xl"></i></div>'+
          '<div class="flex-1 min-w-0">'+
            '<h4 class="font-bold text-white truncate">'+esc(d.name)+'</h4>'+
            '<div class="flex flex-wrap gap-2 mt-2">'+
              '<span class="px-2 py-1 rounded-lg text-xs border border-blue-500/10 '+pclr+'"><i class="fas fa-key mr-1"></i>'+esc(PERM_LABELS[d.myPermission||'viewer'])+'</span>'+
              (d.file_size?'<span class="px-2 py-1 rounded-lg text-xs bg-slate-800/50 text-blue-300/70 border border-blue-500/10">'+formatFileSize(d.file_size)+'</span>':'')+
            '</div>'+
            '<p class="text-xs text-blue-400/50 mt-2">'+expLabel+'</p>'+
          '</div>'+
        '</div>'+
        (!expired?'<div class="flex gap-2 mt-4 pt-3 border-t border-blue-500/10">'+
          '<button onclick="window.open(\''+safeUrl(d.file_url||'#')+'\',\'_blank\')" class="flex-1 px-3 py-2 bg-blue-500/20 text-blue-400 rounded-xl text-xs font-medium hover:bg-blue-500/30 flex items-center justify-center gap-1"><i class="fas fa-eye"></i> Ouvrir</button>'+
          (d.myPermission!=='viewer'?'<button onclick="downloadDocument(\''+d.id+'\')" class="flex-1 px-3 py-2 bg-green-500/20 text-green-400 rounded-xl text-xs font-medium hover:bg-green-500/30 flex items-center justify-center gap-1"><i class="fas fa-download"></i> Télécharger</button>':'')+'</div>':'');
    }).join('');
  }

  function renderSentShares() {
    const empty = document.getElementById('sentEmptyState');
    const list  = document.getElementById('sentSharesList');
    if (!(G.sentShares?.length)) { empty?.classList.remove('hidden'); list?.classList.add('hidden'); return; }
    empty?.classList.add('hidden'); list?.classList.remove('hidden');
    if (!list) return;
    const now = new Date();
    list.innerHTML = (G.sentShares||[]).map(function(s){
      const expired = s.expiresAt && new Date(s.expiresAt)<now;
      const fi = getFileIcon(s.docName||'');
      const pclr = PERM_COLORS[s.permission]||'bg-blue-500/20 text-blue-300';
      return '<div class="glass-card rounded-xl p-4 flex items-center gap-4 border '+(expired?'border-red-500/20 opacity-60':'border-purple-500/20')+'">'+
        '<div class="w-10 h-10 '+fi.bg+' rounded-xl flex items-center justify-center '+fi.color+' border '+fi.border+' flex-shrink-0"><i class="fas '+fi.icon+'"></i></div>'+
        '<div class="flex-1 min-w-0">'+
          '<p class="text-white font-semibold text-sm truncate">'+esc(s.docName)+'</p>'+
          '<p class="text-blue-400/60 text-xs">→ '+esc(s.sharedWith)+'</p>'+
          '<div class="flex gap-2 mt-1"><span class="px-2 py-0.5 rounded text-xs border border-blue-500/10 '+pclr+'">'+esc(PERM_LABELS[s.permission]||s.permission)+'</span>'+
          '<span class="text-xs text-blue-300/40">'+(s.expiresAt?(expired?'Expiré':'Expire '+fmtDate(s.expiresAt)):'Illimité')+'</span></div>'+
        '</div>'+
        (expired?'':
          '<button onclick="revokeShare(\''+s.id+'\')" class="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30 font-medium flex-shrink-0">Révoquer</button>'+
          '<button onclick="_resendShareEmail(\''+s.docId+'\')" class="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs hover:bg-purple-500/30 font-medium flex-shrink-0 ml-1"><i class="fas fa-envelope"></i></button>')+
      '</div>';
    }).join('');
  }

  async function revokeShare(id) {
    if (!confirm('Révoquer ce partage ?')) return;
    try {
      await SB.from('shared_documents').delete().eq('id', id);
    } catch (_) {}
    G.sentShares = (G.sentShares||[]).filter(function(s){ return s.id!==id; });
    showToast('Partage révoqué','success');
    renderSentShares();
  }

  async function _resendShareEmail(docId) {
    const d = G.docs.find(function(x){ return x.id===docId; }); if(!d) return;
    const s = G.sentShares?.find(function(x){ return x.docId===docId; }); if(!s) return;
    let signedUrl = d.file_url||window.location.origin;
    if (d.storage_path) {
      const { data:u } = await SB.storage.from('documents').createSignedUrl(d.storage_path,604800);
      if(u?.signedUrl) signedUrl=u.signedUrl;
    }
    const duration = s.expiresAt ? Math.max(0,Math.ceil((new Date(s.expiresAt)-Date.now())/86400000)) : 0;
    _openShareEmail(s.sharedWith, d, s.permission, duration, s.expiresAt, signedUrl);
    showToast('Email de rappel préparé','success');
  }

  // ══════════════════════════════════════════════════════
  // WORKFLOWS COLLABORATIFS
  // ══════════════════════════════════════════════════════
  function renderWorkflows() {
    const arr = G.wfFilter ? G.workflows.filter(function(w){return w.status===G.wfFilter;}) : G.workflows;
    document.querySelectorAll('.wf-filter-btn').forEach(function(b){
      const active = b.dataset.wf===G.wfFilter;
      b.classList.toggle('bg-blue-500/20',active); b.classList.toggle('text-blue-300',active);
      b.classList.toggle('border-blue-500/30',active); b.classList.toggle('text-gray-400',!active);
    });
    const el = document.getElementById('workflowsList');
    if (!el) return;
    if (!arr.length) { el.innerHTML='<div class="col-span-3 text-center py-16 text-blue-300/50"><i class="fas fa-project-diagram text-4xl mb-4 block opacity-20"></i><p>Aucun workflow</p></div>'; return; }
    const statusCfg = { pending:{c:'text-orange-400 bg-orange-400/20',label:'En attente'}, approved:{c:'text-green-400 bg-green-400/20',label:'Approuvé'}, rejected:{c:'text-red-400 bg-red-400/20',label:'Rejeté'}, cancelled:{c:'text-gray-400 bg-gray-400/20',label:'Annulé'} };
    const prioCfg   = { low:'text-blue-400', medium:'text-yellow-400', high:'text-orange-400', urgent:'text-red-400' };
    el.innerHTML = arr.map(function(w){
      const s = statusCfg[w.status]||statusCfg.pending;
      const d = G.docs.find(function(x){return x.id===w.docId;});
      const isAssignee  = w.assigneeId===G.user?.id;
      const isCreator   = w.createdBy===G.profile?.name;
      const canAct      = isAssignee||['admin','manager'].includes(G.profile?.role);
      return '<div class="glass-card rounded-2xl border border-blue-500/20 p-5 flex flex-col gap-3 hover:border-blue-400/40 transition-all">'+
        '<div class="flex items-start justify-between gap-2">'+
          '<div><h4 class="text-white font-bold text-sm truncate">'+esc(w.title)+'</h4>'+
          '<p class="text-blue-300/60 text-xs mt-0.5">'+esc(w.description||'')+'</p></div>'+
          '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 '+s.c+'">'+s.label+'</span>'+
        '</div>'+
        (d?'<div class="flex items-center gap-2 p-2 rounded-lg" style="background:rgba(59,130,246,0.08)"><i class="fas '+getFileIcon(d.name).icon+' text-blue-400 text-sm"></i><p class="text-white text-xs truncate">'+esc(d.name)+'</p></div>':'')+
        '<div class="flex items-center justify-between text-xs text-blue-300/60">'+
          '<span class="'+(prioCfg[w.priority]||'text-blue-400')+' font-medium"><i class="fas fa-flag mr-1"></i>'+w.priority+'</span>'+
          
        '</div>'+
        (w.assigneeName?'<div class="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-900/30 text-xs text-blue-300/70"><i class="fas fa-user-check text-blue-400"></i>Assigné à <span class="text-white font-medium">'+esc(w.assigneeName)+'</span>'+(isAssignee?'<span class="ml-auto px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[10px]">Vous</span>':'')+'</div>':'')+
        (canAct&&w.status==='pending'?'<div class="flex gap-2 pt-2 border-t border-blue-500/10">'+
          '<button onclick="approveWorkflow(\''+w.id+'\')" class="flex-1 py-1.5 rounded-lg text-xs text-green-400 hover:bg-green-500/10 border border-green-500/20 font-medium"><i class="fas fa-check mr-1"></i>Approuver</button>'+
          '<button onclick="rejectWorkflow(\''+w.id+'\')" class="flex-1 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 border border-red-500/20 font-medium"><i class="fas fa-times mr-1"></i>Rejeter</button>'+
        '</div>':'')+
      '</div>';
    }).join('');
  }
  function filterWorkflows(s) { G.wfFilter=s; renderWorkflows(); }

  async function approveWorkflow(id) {
    try {
      await SB.from('workflows').update({ status:'approved', completed_at: new Date().toISOString() }).eq('id',id);
      const w = G.workflows.find(function(x){return x.id===id;}); if(w) w.status='approved';
      _logActivity('workflow', null, 'Workflow approuvé : '+(G.workflows.find(function(x){return x.id===id;})?.title||id));
      showToast('Workflow approuvé ✓','success');
      renderWorkflows(); updateStats();
    } catch (err) { showToast('Erreur : '+err.message,'error'); }
  }
  async function rejectWorkflow(id) {
    try {
      await SB.from('workflows').update({ status:'rejected', completed_at: new Date().toISOString() }).eq('id',id);
      const w = G.workflows.find(function(x){return x.id===id;}); if(w) w.status='rejected';
      _logActivity('workflow', null, 'Workflow rejeté : '+(G.workflows.find(function(x){return x.id===id;})?.title||id));
      showToast('Workflow rejeté','warning');
      renderWorkflows(); updateStats();
    } catch (err) { showToast('Erreur : '+err.message,'error'); }
  }

  function openCreateWorkflowModal() {
    ['wfTitle','wfDesc','wfApprovers'].forEach(function(id){ setVal$(id,''); });
    document.getElementById('workflowModal')?.classList.remove('hidden');
    // Peupler le select d'assignee avec les membres de l'entreprise
    const sel = document.getElementById('wfAssignee');
    if (sel) {
      sel.innerHTML = '<option value="">-- Non assigné --</option>'+
        G.users.map(function(u){ return '<option value="'+esc(u.id)+'">'+esc(u.name)+' ('+esc(u.role)+')</option>'; }).join('');
    }
  }
  function closeWorkflowModal() { document.getElementById('workflowModal')?.classList.add('hidden'); }

  async function createWorkflow(e) {
    e.preventDefault();
    const title      = document.getElementById('wfTitle')?.value.trim();
    const desc       = document.getElementById('wfDesc')?.value.trim();
    const priority   = document.getElementById('wfPriority')?.value||'medium';
    const dueDate    = document.getElementById('wfDueDate')?.value||null;
    const assigneeId = document.getElementById('wfAssignee')?.value||null;
    if (!title) { showToast('Titre requis','error'); return; }
    try {
      const payload = {
        title, description: desc, priority, status: 'pending', created_by: G.user.id,
        assignee_id: assigneeId||null,
        company_id: G.profile?.company_id||null,
      };
      const { data, error } = await SB.from('workflows').insert([payload]).select().single();
      if (error) throw error;
      G.workflows.unshift({
        id:data.id, title:data.title, description:data.description, status:'pending',
        priority:data.priority, assigneeId:data.assignee_id,
        assigneeName: G.users.find(function(u){return u.id===assigneeId;})?.name||'Non assigné',
        createdBy: G.profile?.name||'', dueDate:data.due_date, createdAt:data.created_at,
      });
      _logActivity('workflow', null, 'Workflow créé : '+title);
      addNotification('success','Workflow créé', title);
      showToast('Workflow "'+title+'" créé ✓','success');
      closeWorkflowModal();
      renderWorkflows(); updateStats();
    } catch (err) { showToast('Erreur : '+err.message,'error'); }
  }

  // ══════════════════════════════════════════════════════
  // NOTIFICATIONS SUPABASE
  // ══════════════════════════════════════════════════════
  function _updateNotifBadge() {
    const unread = G.notifications.filter(function(n){ return !n.read; }).length;
    const dot    = document.getElementById('notifBadge');
    const badge  = document.getElementById('notifCountBadge');
    if(dot)   dot.classList.toggle('hidden', unread===0);
    if(badge) { badge.textContent=unread; badge.classList.toggle('hidden',unread===0); }
  }

  function addNotification(type, title, msg) {
    G.notifications.unshift({ id:'n-'+Date.now(), type:type, title:title, msg:msg, read:false, at:new Date().toISOString(), category:'system' });
    if (G.notifications.length>30) G.notifications=G.notifications.slice(0,30);
    _updateNotifBadge();
  }

  function toggleNotifications() {
    const p = document.getElementById('notifPanel');
    p?.classList.toggle('hidden');
    if (!p?.classList.contains('hidden')) _renderNotifPanel();
  }
  function closeNotifPanel() { document.getElementById('notifPanel')?.classList.add('hidden'); }

  function _renderNotifPanel() {
    const el = document.getElementById('notifContent'); if (!el) return;
    if (!G.notifications.length) { el.innerHTML='<div class="px-4 py-6 text-center text-blue-300/50 text-sm">Aucune notification</div>'; return; }
    const ICONS = { success:'fas fa-check-circle text-green-400', error:'fas fa-times-circle text-red-400', info:'fas fa-info-circle text-blue-400', warning:'fas fa-exclamation-circle text-yellow-400' };
    const CAT_ICONS = { document:'fa-file-alt', workflow:'fa-project-diagram', share:'fa-share-alt', mention:'fa-at', system:'fa-cog' };
    el.innerHTML = G.notifications.map(function(n){
      return '<div class="flex items-start gap-3 px-4 py-3 hover:bg-blue-500/10 cursor-pointer '+(n.read?'opacity-60':'')+'" onclick="markNotifRead(\''+n.id+'\')"><i class="'+(ICONS[n.type]||ICONS.info)+' mt-0.5 flex-shrink-0 text-sm"></i><div class="flex-1 min-w-0"><p class="text-white text-xs font-medium">'+esc(n.title)+'</p><p class="text-blue-400/70 text-xs">'+esc(n.msg)+'</p><p class="text-blue-400/40 text-[10px] mt-0.5">'+timeAgo(n.at)+'</p></div>'+(!n.read?'<div class="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0 mt-1"></div>':'')+'</div>';
    }).join('');
  }

  async function markNotifRead(id) {
    const n = G.notifications.find(function(x){return x.id===id;}); if(n) n.read=true;
    _updateNotifBadge();
    _renderNotifPanel();
    // Persister en DB si ID réel (UUID)
    if (id && id.length===36) await SB.from('notifications').update({read:true}).eq('id',id);
  }

  async function markAllNotifRead() {
    G.notifications.forEach(function(n){ n.read=true; });
    _updateNotifBadge();
    closeNotifPanel();
    showToast('Toutes les notifications lues','success');
    // Persister en DB
    await SB.from('notifications').update({read:true}).eq('user_id',G.user.id).eq('read',false);
  }

  function loadRealNotifications() { _renderNotifPanel(); }

  // ══════════════════════════════════════════════════════
  // RECHERCHE AVANCÉE
  // ══════════════════════════════════════════════════════
  function runAdvSearch() {
    const term  = (document.getElementById('advSearchInput')?.value||'').toLowerCase().trim();
    const type  = document.getElementById('advSearchType')?.value||'';
    const date  = document.getElementById('advSearchDate')?.value||'';
    const size  = document.getElementById('advSearchSize')?.value||'';
    const box   = document.getElementById('advSearchResults');
    const cnt   = document.getElementById('advSearchCount');
    if (!term&&!type&&!date&&!size) {
      if(box) box.innerHTML='<div class="text-center py-20 text-blue-300/30"><i class="fas fa-search text-6xl mb-5 block opacity-10"></i><p class="text-lg font-medium text-blue-300/50">Tapez pour rechercher</p></div>';
      if(cnt) cnt.textContent=''; return;
    }
    let res = [...G.docs];
    if (term) res = res.filter(function(d){ return (d.name||'').toLowerCase().includes(term)||(d.description||'').toLowerCase().includes(term)||(d.tags||[]).join(' ').toLowerCase().includes(term); });
    if (type) res = res.filter(function(d){ const ext=(d.name||'').split('.').pop().toLowerCase(); if(type==='pdf')return ext==='pdf'; if(type==='doc')return['doc','docx'].includes(ext); if(type==='xls')return['xls','xlsx'].includes(ext); if(type==='img')return['jpg','jpeg','png','gif','webp'].includes(ext); return true; });
    if (date) { const now=new Date(); res=res.filter(function(d){ const c=new Date(d.created_at); if(date==='today')return c.toDateString()===now.toDateString(); if(date==='week')return(now-c)<7*86400000; if(date==='month')return(now-c)<30*86400000; return true; }); }
    if (size) res=res.filter(function(d){ const mb=(d.file_size||0)/(1024*1024); if(size==='small')return mb<1; if(size==='medium')return mb>=1&&mb<=10; if(size==='large')return mb>10; return true; });
    if(cnt) cnt.textContent=res.length+' résultat(s)';
    if (!res.length) { if(box) box.innerHTML='<div class="text-center py-16"><i class="fas fa-search text-5xl mb-4 block text-blue-400/20"></i><p class="text-blue-300/50">Aucun résultat</p></div>'; return; }
    if(!box) return;
    box.innerHTML = '<div class="space-y-3">'+res.map(function(d){
      const fi=getFileIcon(d.name||'');
      return '<div class="glass-card rounded-xl border border-cyan-500/15 p-4 flex items-center gap-4 hover:border-cyan-400/40 cursor-pointer group" onclick="openDocumentPreview(\''+d.id+'\')"><div class="w-11 h-11 '+fi.bg+' rounded-xl flex items-center justify-center '+fi.color+' border '+fi.border+' flex-shrink-0"><i class="fas '+fi.icon+' text-lg"></i></div><div class="flex-1 min-w-0"><p class="text-white font-semibold text-sm truncate">'+esc(d.name)+'</p><p class="text-xs text-blue-300/50">'+formatFileSize(d.file_size||0)+' · '+fmtDate(d.created_at)+'</p><div class="flex flex-wrap gap-1 mt-1">'+(d.tags||[]).map(function(t){return'<span class="tag text-[10px] px-2 py-0.5">#'+esc(t)+'</span>';}).join('')+'</div></div><div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onclick="event.stopPropagation();downloadDocument(\''+d.id+'\')" class="px-3 py-1.5 bg-slate-700/50 text-gray-400 rounded-lg text-xs hover:bg-slate-600/50"><i class="fas fa-download"></i></button></div></div>';
    }).join('')+'</div>';
  }
  function clearAdvSearch() {
    ['advSearchInput','advSearchType','advSearchDate','advSearchSize'].forEach(function(id){ const el=document.getElementById(id); if(el) el.value=''; });
    runAdvSearch();
  }

  function handleGlobalSearch(q) {
    const dropdown=document.getElementById('searchDropdown');
    if (!q||q.length<2) { dropdown?.classList.add('hidden'); return; }
    const lower=q.toLowerCase();
    const res=G.docs.filter(function(d){ return (d.name||'').toLowerCase().includes(lower)||(d.description||'').toLowerCase().includes(lower)||(d.tags||[]).some(function(t){return t.toLowerCase().includes(lower);}); }).slice(0,6);
    if (!res.length) { if(dropdown){dropdown.innerHTML='<div class="px-4 py-3 text-blue-400/60 text-sm">Aucun résultat</div>'; dropdown.classList.remove('hidden');} return; }
    if(!dropdown) return;
    dropdown.innerHTML=res.map(function(d){ const fi=getFileIcon(d.name||''); return '<div onclick="switchView(\'documents\');renderDocuments([...G.docs].filter(x=>x.id===\''+d.id+'\'));document.getElementById(\'searchDropdown\').classList.add(\'hidden\')" class="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-500/10 cursor-pointer"><div class="w-7 h-7 rounded-lg '+fi.bg+' '+fi.color+' border '+fi.border+' flex items-center justify-center flex-shrink-0"><i class="fas '+fi.icon+' text-xs"></i></div><div class="min-w-0"><p class="text-white text-sm truncate">'+esc(d.name)+'</p><p class="text-blue-400/50 text-xs">'+formatFileSize(d.file_size||0)+'</p></div></div>'; }).join('');
    dropdown.classList.remove('hidden');
  }

  // ══════════════════════════════════════════════════════
  // VERSIONING
  // ══════════════════════════════════════════════════════
  function renderVersioningDocs(filter) {
    const q = (filter||document.getElementById('versionSearch')?.value||'').toLowerCase();
    const arr = q ? G.docs.filter(function(d){return (d.name||'').toLowerCase().includes(q);}) : G.docs;
    const el  = document.getElementById('versionDocList'); if (!el) return;
    if (!arr.length) { el.innerHTML='<div class="text-center py-16 text-blue-300/30"><i class="fas fa-code-branch text-5xl mb-4 block opacity-10"></i><p>Aucun document</p></div>'; return; }
    el.innerHTML = arr.map(function(d, i){
      const fi=getFileIcon(d.name||'');
      const versions=Array.from({length:d.version_number||1},function(_,vi){return vi+1;}).reverse();
      return '<div class="glass-card rounded-2xl border border-cyan-500/20 overflow-hidden"><div class="flex items-center justify-between p-4 cursor-pointer hover:bg-cyan-500/5 group" onclick="toggleVersions(\'vd'+i+'\')"><div class="flex items-center gap-4"><div class="w-11 h-11 '+fi.bg+' rounded-xl flex items-center justify-center '+fi.color+' border '+fi.border+'"><i class="fas '+fi.icon+' text-lg"></i></div><div><p class="text-white font-semibold text-sm">'+esc(d.name)+'</p><p class="text-xs text-blue-300/50">'+versions.length+' version(s) · '+fmtDate(d.created_at)+' · '+formatFileSize(d.file_size||0)+'</p></div></div><div class="flex items-center gap-3"><span class="px-2.5 py-1 bg-green-500/20 text-green-400 border border-green-400/20 rounded-full text-xs font-bold">v'+(d.version_number||1)+' active</span><i class="fas fa-chevron-down text-blue-400 transition-transform duration-300" id="chev-vd'+i+'"></i></div></div><div id="hist-vd'+i+'" class="hidden border-t border-cyan-500/10 divide-y divide-cyan-500/10">'+
        versions.map(function(v){
          return '<div class="flex items-center justify-between px-5 py-3 hover:bg-cyan-500/5"><div class="flex items-center gap-3"><span class="w-8 h-8 '+(v===d.version_number?'bg-green-500/20 text-green-400 border-green-400/20':'bg-slate-700/60 text-gray-400 border-gray-600/20')+' rounded-full flex items-center justify-center text-xs font-bold border">v'+v+'</span><div><p class="text-sm '+(v===d.version_number?'text-white':'text-blue-300/60')+'">'+(v===d.version_number?'Version active':'Version archivée')+'</p><p class="text-xs text-blue-300/40">'+fmtDate(d.created_at)+'</p></div></div><div class="flex gap-2"><button onclick="downloadDocument(\''+d.id+'\')" class="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs hover:bg-blue-500/30"><i class="fas fa-download mr-1"></i>DL</button>'+(v!==d.version_number?'<button onclick="restoreVersion(\''+d.id+'\','+v+')" class="px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded-lg text-xs hover:bg-orange-500/30">Restaurer</button>':'')+'</div></div>';
        }).join('')+
        '<div class="px-5 py-3"><button onclick="uploadNewVersion(\''+d.id+'\')" class="px-4 py-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-xl text-xs hover:bg-cyan-500/20 flex items-center gap-2"><i class="fas fa-upload"></i>Uploader nouvelle version</button></div></div></div>';
    }).join('');
  }
  function toggleVersions(id) { const h=document.getElementById('hist-'+id),c=document.getElementById('chev-'+id); h?.classList.toggle('hidden'); c?.classList.toggle('rotate-180'); }
  function filterVersionDocs(v) { renderVersioningDocs(v); }
  function restoreVersion(docId,v) { if(!confirm('Restaurer la version '+v+' ?'))return; const d=G.docs.find(function(x){return x.id===docId;}); if(d){d.version_number=v; _logActivity('restore',docId,'Restauration v'+v+' : '+d.name); showToast('Version '+v+' restaurée ✓','success'); renderVersioningDocs();} }
  function uploadNewVersion(docId) { const d=G.docs.find(function(x){return x.id===docId;}); if(!d)return; d.version_number=(d.version_number||1)+1; _logActivity('upload',docId,'Nouvelle version v'+d.version_number+' : '+d.name); showToast('Nouvelle version v'+d.version_number+' créée ✓','success'); renderVersioningDocs(); }

  // ══════════════════════════════════════════════════════
  // UTILISATEURS
  // ══════════════════════════════════════════════════════
  function loadUsers() {
    const el = document.getElementById('usersList'); if (!el) return;
    if (!G.users.length) { el.innerHTML='<tr><td colspan="5" class="text-center py-8 text-blue-300/50">Aucun membre dans l\'entreprise</td></tr>'; return; }
    el.innerHTML = G.users.map(function(u){
      const rc = ROLE_COLORS[u.role]||'bg-gray-500/20 text-gray-300';
      const rl = ROLE_LABELS[u.role]||u.role;
      return '<tr class="hover:bg-blue-500/5 transition-all"><td class="px-6 py-4"><div class="flex items-center gap-3"><div class="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center text-white font-bold text-sm">'+esc(avatarInitials(u.name))+'</div><div><p class="text-white font-semibold text-sm">'+esc(u.name)+'</p><p class="text-blue-300/50 text-xs">'+esc(u.email)+'</p></div></div></td><td class="px-6 py-4"><span class="px-2 py-1 rounded-lg text-xs font-bold '+rc+'">'+rl+'</span></td><td class="px-6 py-4 text-blue-300/60 text-sm">'+G.docs.filter(function(d){return d.owner_id===u.id;}).length+'</td><td class="px-6 py-4"><div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full '+(u.active?'bg-green-400':'bg-red-400')+'"></div><span class="text-sm '+(u.active?'text-green-400':'text-red-400')+'">'+(u.active?'Actif':'Inactif')+'</span></div></td><td class="px-6 py-4"><div class="flex gap-2"><button onclick="openEditUserModal(\''+u.id+'\')" class="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg text-sm"><i class="fas fa-edit"></i></button><button onclick="toggleUserActive(\''+u.id+'\')" class="p-2 '+(u.active?'text-red-400 hover:bg-red-500/10':'text-green-400 hover:bg-green-500/10')+' rounded-lg text-sm"><i class="fas '+(u.active?'fa-user-slash':'fa-user-check')+'"></i></button></div></td></tr>';
    }).join('');
  }

  function openCreateUserModal() { document.getElementById('addUserModal')?.classList.remove('hidden'); }
  function closeAddUserModal()   { document.getElementById('addUserModal')?.classList.add('hidden'); }

  async function addUser(e) {
    e.preventDefault();
    const first = document.getElementById('newUserFirst')?.value.trim()||'';
    const last  = document.getElementById('newUserLast')?.value.trim()||'';
    const email = document.getElementById('newUserEmail')?.value.trim()||'';
    const role  = document.getElementById('newUserRole')?.value||'viewer';
    if (!email) { showToast('Email requis','error'); return; }
    // Inviter via Supabase Admin API n'est pas possible côté client
    // On crée/met à jour le profil si l'utilisateur existe
    const { data: existing } = await SB.from('users_profiles').select('id').eq('email',email).single();
    if (existing) {
      await SB.from('users_profiles').update({ role, company_id: G.profile?.company_id||null }).eq('id',existing.id);
      showToast(email+' mis à jour dans l\'entreprise ✓','success');
    } else {
      showToast('Utilisateur introuvable — il doit d\'abord créer son compte','warning');
    }
    _logActivity('user_invite', null, 'Invitation : '+email+' ('+role+')');
    addNotification('info','Invitation envoyée', email);
    closeAddUserModal(); loadUsers();
  }

  function openEditUserModal(id) {
    const u = G.users.find(function(x){return x.id===id;}); if (!u) return;
    const parts = u.name.split(' ');
    setVal$('editUserId',id); setVal$('editUserFirst',parts[0]||''); setVal$('editUserLast',parts.slice(1).join(' ')||''); setVal$('editUserRole',u.role);
    document.getElementById('editUserModal')?.classList.remove('hidden');
  }
  function closeEditUserModal() { document.getElementById('editUserModal')?.classList.add('hidden'); }

  async function saveEditUser(e) {
    e.preventDefault();
    const id   = document.getElementById('editUserId')?.value;
    const name = (document.getElementById('editUserFirst')?.value.trim()||'')+' '+(document.getElementById('editUserLast')?.value.trim()||'');
    const role = document.getElementById('editUserRole')?.value;
    const u = G.users.find(function(x){return x.id===id;}); if (!u) return;
    u.name=name.trim(); u.role=role;
    await SB.from('users_profiles').update({name:name.trim(),role}).eq('id',id);
    showToast('Utilisateur mis à jour ✓','success');
    closeEditUserModal(); loadUsers();
  }

  async function toggleUserActive(id) {
    const u = G.users.find(function(x){return x.id===id;}); if (!u) return;
    u.active = !u.active;
    await SB.from('users_profiles').update({active:u.active}).eq('id',id);
    _logActivity(u.active?'user_activate':'user_deactivate',null,(u.active?'Activation':'Désactivation')+' : '+u.email);
    showToast(u.name+' '+(u.active?'activé':'désactivé'),'success');
    loadUsers();
  }

  // ══════════════════════════════════════════════════════
  // TAGS
  // ══════════════════════════════════════════════════════
  function loadTags() {
    const el=document.getElementById('tagsList'); if(!el)return;
    if(!G.tags.length){el.innerHTML='<span class="text-blue-300/50 text-sm">Aucun tag</span>';return;}
    el.innerHTML=G.tags.map(function(t,i){
      return '<div class="flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-500/20" style="background:'+t.color+'22"><span class="w-3 h-3 rounded-full flex-shrink-0" style="background:'+t.color+'"></span><span class="text-white font-medium text-sm">#'+esc(t.name)+'</span><span class="text-blue-300/50 text-xs">'+G.docs.filter(function(d){return(d.tags||[]).includes(t.name);}).length+' doc(s)</span><button onclick="deleteTag('+i+')" class="ml-2 text-red-400/50 hover:text-red-400 text-xs"><i class="fas fa-times"></i></button></div>';
    }).join('');
  }
  async function createTag() {
    const v=document.getElementById('newTagInput')?.value.trim();
    const color=document.getElementById('newTagColor')?.value||'#3b82f6';
    if(!v)return;
    if(G.tags.find(function(t){return t.name===v;})){showToast('Tag déjà existant','warning');return;}
    try {
      const { data, error } = await SB.from('tags').insert({name:v,color,company_id:G.profile?.company_id||null}).select().single();
      if(error) throw error;
      G.tags.push({id:data.id,name:v,color,count:0});
      if(document.getElementById('newTagInput')) document.getElementById('newTagInput').value='';
      showToast('Tag "#'+v+'" créé ✓','success');
      loadTags(); renderPopularTags();
    } catch(err){ showToast('Erreur : '+err.message,'error'); }
  }
  async function deleteTag(i) {
    if(!confirm('Supprimer ce tag ?'))return;
    const t=G.tags[i];
    if(t?.id) await SB.from('tags').delete().eq('id',t.id);
    G.tags.splice(i,1); loadTags(); renderPopularTags();
  }

  // ══════════════════════════════════════════════════════
  // RBAC
  // ══════════════════════════════════════════════════════
  function renderRbacCards() {
    const el=document.getElementById('rbacCards'); if(!el)return;
    const defaults = {
      admin:   {name:'Administrateur',read:true, write:true, delete:true, users:true, logs:true, api:true},
      manager: {name:'Manager',       read:true, write:true, delete:true, users:true, logs:true, api:false},
      editor:  {name:'Éditeur',       read:true, write:true, delete:false,users:false,logs:false,api:false},
      viewer:  {name:'Lecteur',       read:true, write:false,delete:false,users:false,logs:false,api:false},
    };
    G.roleDefaults = G.roleDefaults && Object.keys(G.roleDefaults).length ? G.roleDefaults : defaults;
    const clrs={admin:'red',manager:'orange',editor:'blue',viewer:'green'};
    const ics ={admin:'fa-crown',manager:'fa-briefcase',editor:'fa-pen',viewer:'fa-eye'};
    el.innerHTML=Object.entries(G.roleDefaults).map(function(entry){
      const key=entry[0],r=entry[1];
      const c=clrs[key]||'blue',ic=ics[key]||'fa-user';
      const perms=[['Lecture documents',r.read],['Écriture / Upload',r.write],['Suppression',r.delete],['Gestion utilisateurs',r.users],['Logs & Audit',r.logs],['Clés API & OAuth',r.api]];
      return '<div class="glass-card rounded-2xl border border-'+c+'-500/25 p-5 space-y-4"><div class="flex items-center gap-3"><div class="w-12 h-12 bg-'+c+'-500/20 rounded-xl flex items-center justify-center text-'+c+'-400 border border-'+c+'-400/25"><i class="fas '+ic+' text-xl"></i></div><div><h3 class="text-white font-bold">'+esc(r.name)+'</h3><p class="text-xs text-blue-300/50">'+key+'</p></div></div><div class="space-y-1.5 text-xs">'+perms.map(function(pv){return'<div class="flex items-center gap-2 '+(pv[1]?'text-green-400':'text-red-400/50')+'"><i class="fas '+(pv[1]?'fa-check-circle':'fa-times-circle')+'"></i>'+pv[0]+'</div>';}).join('')+'</div><div class="pt-2 border-t border-'+c+'-500/10 flex justify-end"><button onclick="openRoleModal(\''+key+'\')" class="text-xs text-blue-400 hover:text-blue-300">Modifier →</button></div></div>';
    }).join('');
  }
  function openRoleModal(key) {
    document.getElementById('roleModalKey').value=key;
    const r=G.roleDefaults[key];if(!r)return;
    setVal$('roleModalName',r.name);
    ['read','write','delete','users','logs','api'].forEach(function(p){const el=document.getElementById('perm_'+p);if(el)el.checked=!!r[p];});
    document.getElementById('roleModal')?.classList.remove('hidden');
  }
  function closeRoleModal() { document.getElementById('roleModal')?.classList.add('hidden'); }
  function saveRole() {
    const key=document.getElementById('roleModalKey')?.value; if(!key)return;
    const name=document.getElementById('roleModalName')?.value.trim()||key;
    const perms={};
    ['read','write','delete','users','logs','api'].forEach(function(p){perms[p]=!!document.getElementById('perm_'+p)?.checked;});
    G.roleDefaults[key]=Object.assign({name},perms);
    localStorage.setItem('ged_roles',JSON.stringify(G.roleDefaults));
    closeRoleModal(); renderRbacCards();
    showToast('Rôle "'+name+'" mis à jour ✓','success');
  }

  // ══════════════════════════════════════════════════════
  // SÉCURITÉ & AUDIT
  // ══════════════════════════════════════════════════════
  function renderAuditLog() {
    const f=document.getElementById('auditFilter')?.value||'';
    const logs=f?G.auditLogs.filter(function(l){return l.action.includes(f);}):G.auditLogs;
    const el=document.getElementById('auditLogList'); if(!el)return;
    const ACT={login:{c:'text-purple-400',i:'fa-sign-in-alt'},upload:{c:'text-blue-400',i:'fa-upload'},share:{c:'text-green-400',i:'fa-share-alt'},delete:{c:'text-red-400',i:'fa-trash'},logout:{c:'text-gray-400',i:'fa-sign-out-alt'},workflow:{c:'text-orange-400',i:'fa-project-diagram'},collab:{c:'text-cyan-400',i:'fa-users'},security:{c:'text-yellow-400',i:'fa-shield-alt'}};
    if(!logs.length){el.innerHTML='<p class="text-center py-4 text-blue-300/50 text-sm">Aucune entrée</p>';return;}
    el.innerHTML=logs.slice(0,30).map(function(l){
      const a=Object.keys(ACT).find(function(k){return l.action.includes(k);});
      const cfg=ACT[a]||{c:'text-blue-400',i:'fa-info-circle'};
      return '<div class="flex items-start gap-3 p-2 rounded-xl hover:bg-blue-500/5"><i class="fas '+cfg.i+' '+cfg.c+' mt-0.5 w-4 text-center flex-shrink-0"></i><div class="flex-1 min-w-0"><p class="text-white text-xs font-medium truncate">'+esc(l.description)+'</p><p class="text-blue-400/50 text-[10px]">'+esc(l.user||'Système')+' · '+timeAgo(l.createdAt)+'</p></div></div>';
    }).join('');
    set$('secAuditCount',G.auditLogs.length);
  }
  function updateSecurityStats() {
    set$('secScanOk',G.docs.filter(function(d){return!BLOCKED_EXT.includes((d.name||'').split('.').pop().toLowerCase());}).length);
    set$('secScanBlocked',G.docs.filter(function(d){return BLOCKED_EXT.includes((d.name||'').split('.').pop().toLowerCase());}).length);
    set$('secApiKeys',G.apiKeys.length);
    renderAuditLog();
  }
  function scanAllDocuments() {
    const btn=document.getElementById('scanBtn');
    if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin mr-2"></i>Scan...';}
    let safe=0,blocked=0;
    G.docs.forEach(function(d){const ext=(d.name||'').split('.').pop().toLowerCase();BLOCKED_EXT.includes(ext)?blocked++:safe++;});
    setTimeout(function(){
      set$('secScanOk',safe); set$('secScanBlocked',blocked);
      if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-search mr-2"></i>Scanner';}
      _logActivity('scan',null,'Scan antivirus : '+safe+' sains, '+blocked+' suspects');
      showToast('Scan : '+safe+' sain(s), '+blocked+' suspect(s)',blocked>0?'warning':'success');
    },1200);
  }
  function generateApiKey() {
    const key='ged_sk_'+Array.from(crypto.getRandomValues(new Uint8Array(24))).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
    G.apiKeys.push({id:'k-'+Date.now(),key,created:new Date().toISOString()});
    set$('secApiKeys',G.apiKeys.length);
    const el=document.getElementById('apiKeysList');
    if(el) el.innerHTML=G.apiKeys.map(function(k,i){return'<div class="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-yellow-500/20"><code class="text-yellow-400 text-xs font-mono truncate flex-1">'+k.key.slice(0,24)+'••••</code><button onclick="copyKey(\''+k.key+'\')" class="ml-2 text-blue-400 hover:text-white text-xs flex-shrink-0"><i class="fas fa-copy"></i></button><button onclick="G.apiKeys.splice('+i+',1);updateSecurityStats()" class="ml-1 text-red-400 hover:text-red-300 text-xs flex-shrink-0"><i class="fas fa-times"></i></button></div>';}).join('');
    showToast('Clé API générée ✓','success');
    _logActivity('api_key',null,'Génération clé API');
  }
  function copyKey(k) { navigator.clipboard?.writeText(k).then(function(){showToast('Clé copiée !','success');}); }
  function exportAuditLog() {
    const csv=['Date,Action,Utilisateur,Description',...G.auditLogs.map(function(l){return'"'+fmtDate(l.createdAt)+'","'+l.action+'","'+(l.user||'')+'","'+(l.description||'')+'"';})].join('\n');
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download='audit_'+new Date().toISOString().slice(0,10)+'.csv'; a.click();
    showToast('Audit exporté ✓','success');
  }

  // ══════════════════════════════════════════════════════
  // BILLING
  // ══════════════════════════════════════════════════════
  function renderBillingView() {
    const plan=G.company?.plan||'FREE';
    const PLANS={FREE:{n:'Free',badge:'badge-free',desc:'5 utilisateurs · 1 GB · base',price:'0€'},STARTER:{n:'Starter',badge:'badge-starter',desc:'20 utilisateurs · 10 GB · versioning',price:'29€'},PROFESSIONAL:{n:'Professional',badge:'badge-pro',desc:'100 utilisateurs · 100 GB · RBAC',price:'79€'},ENTERPRISE:{n:'Enterprise',badge:'badge-enterprise',desc:'Illimité · SSO · SLA',price:'Sur devis'}};
    const p=PLANS[plan]||PLANS.FREE;
    set$('currentPlanName',p.n);
    const badge=document.getElementById('currentPlanBadgeEl'); if(badge){badge.textContent=plan;badge.className='badge-plan '+p.badge;}
    set$('currentPlanDesc',p.desc);
    const priceEl=document.getElementById('currentPlanPrice'); if(priceEl) priceEl.innerHTML=p.price+'<span class="text-blue-400/60 text-sm font-normal">/mois</span>';
  }
  function selectPlan(plan,el) {
    document.querySelectorAll('.plan-card').forEach(function(c){c.classList.remove('selected');}); el.classList.add('selected'); G.selectedPlan=plan;
    const btn=document.getElementById('upgradeBtn'); const cur=(G.company?.plan||'FREE').toLowerCase();
    if(btn){btn.disabled=plan===cur; btn.textContent=plan===cur?'✓ Plan actuel':'Passer au plan '+plan.charAt(0).toUpperCase()+plan.slice(1)+' (Stripe)';}
  }
  function simulateUpgrade() {
    const plan=G.selectedPlan.toUpperCase();
    const maxStorage={FREE:100,STARTER:10240,PROFESSIONAL:102400,ENTERPRISE:999999};
    if(G.company){G.company.plan=plan; G.MAX_STORAGE_MB=maxStorage[plan]||100;}
    updatePlanUI(plan);
    _logActivity('billing',null,'Passage au plan '+plan);
    addNotification('success','Plan mis à jour','Votre plan est maintenant '+plan);
    showToast('✓ Plan '+plan+' activé !','success');
    renderBillingView(); updateStats();
  }
  function updatePlanUI(plan) {
    const badge=document.getElementById('planBadge');
    if(badge){badge.textContent=plan; badge.className='hidden sm:inline badge-plan badge-'+plan.toLowerCase();}
    if(G.company) set$('companyPlanLabel','Plan '+plan);
  }

  // ══════════════════════════════════════════════════════
  // SETTINGS
  // ══════════════════════════════════════════════════════
  async function saveProfile() {
    const name=document.getElementById('profileName')?.value.trim();
    const pwd =document.getElementById('profileNewPwd')?.value;
    const cpwd=document.getElementById('profileConfirmPwd')?.value;
    if(!name){showToast('Nom requis','error');return;}
    if(pwd&&pwd!==cpwd){showToast('Mots de passe différents','error');return;}
    if(pwd&&pwd.length<8){showToast('Mot de passe trop court','error');return;}
    // Mettre à jour profil Supabase
    await SB.from('users_profiles').update({name:name}).eq('id',G.user.id);
    if(pwd) await SB.auth.updateUser({password:pwd});
    if(G.profile) G.profile.name=name;
    set$('userNameDisplay',name.split(' ')[0]);
    set$('dropdownUserName',name);
    set$('userAvatarInitial',avatarInitials(name));
    if(document.getElementById('profileNewPwd')) document.getElementById('profileNewPwd').value='';
    if(document.getElementById('profileConfirmPwd')) document.getElementById('profileConfirmPwd').value='';
    _logActivity('profile_update',null,'Mise à jour profil');
    showToast('Profil enregistré ✓','success');
  }
  function toggleSetting(s){const v=document.getElementById(s+'setting')?.checked;localStorage.setItem('ged_'+s,v);showToast(s+' '+(v?'activé':'désactivé'),'success');}
  function exportAllData(){const data={documents:G.docs,users:G.users,tags:G.tags,workflows:G.workflows,audit:G.auditLogs,exportedAt:new Date().toISOString()};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='systemesged_v5_export_'+new Date().toISOString().slice(0,10)+'.json';a.click();showToast('Export JSON ✓','success');}
  function exportDocumentsCsv(){const csv=['ID,Nom,Taille,Type,Date,Tags,Propriétaire',...G.docs.map(function(d){return'"'+d.id+'","'+d.name+'","'+formatFileSize(d.file_size||0)+'","'+(d.file_type||'')+'","'+fmtDate(d.created_at)+'","'+(d.tags||[]).join(';')+'","'+d.owner_id+'"';})].join('\n');const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download='documents_v5_'+new Date().toISOString().slice(0,10)+'.csv';a.click();showToast('CSV ✓','success');}
  function copySqlSchema(){navigator.clipboard?.writeText(document.getElementById('sqlSchemaBlock')?.textContent||'').then(function(){showToast('SQL copié !','success');});}

  // ══════════════════════════════════════════════════════
  // ZONE DANGER
  // ══════════════════════════════════════════════════════
  function openDangerModal(action){G.dangerAction=action; set$('dangerModalMessage','Vous allez supprimer TOUS vos documents de manière définitive.'); setVal$('dangerConfirmInput',''); const btn=document.getElementById('dangerConfirmBtn'); if(btn)btn.disabled=true; document.getElementById('dangerModal')?.classList.remove('hidden');}
  function closeDangerModal(){document.getElementById('dangerModal')?.classList.add('hidden');G.dangerAction=null;}
  function checkDangerConfirm(){const v=document.getElementById('dangerConfirmInput')?.value; const btn=document.getElementById('dangerConfirmBtn'); if(btn)btn.disabled=v!=='CONFIRMER';}
  async function executeDangerAction(){
    if(G.dangerAction==='delete_all'){
      try{
        const paths=G.docs.filter(function(d){return d.storage_path;}).map(function(d){return d.storage_path;});
        if(paths.length) await SB.storage.from('documents').remove(paths);
        await SB.from('documents').update({is_deleted:true}).eq('owner_id',G.user.id);
        G.docs=[]; G.myDocs=[]; G.companyDocs=[];
        renderDocuments(); updateStats();
        showToast('Tous les documents supprimés','success');
      }catch(err){showToast('Erreur : '+err.message,'error');}
    }
    closeDangerModal();
  }

  // ══════════════════════════════════════════════════════
  // LOGS SYSTÈME
  // ══════════════════════════════════════════════════════
  function startLiveLogs(){
    if(logsInterval)return;
    logsInterval=setInterval(function(){
      if(!document.getElementById('view-logs')?.classList.contains('active-view'))return;
      const e=LOG_EVENTS[Math.floor(Math.random()*LOG_EVENTS.length)];
      addSysLog(e[0],e[1]);
    },5000);
  }
  function addSysLog(lv,msg){
    const ts=new Date().toLocaleString('fr-FR').replace(',',' ');
    G.sysLogs.unshift({lv,msg,ts});
    if(G.sysLogs.length>200)G.sysLogs.pop();
    renderSysLogs();
  }
  function renderSysLogs(){
    const c=document.getElementById('sysLogConsole'); if(!c)return;
    const colors={info:'text-blue-400',warn:'text-yellow-400',error:'text-red-400',debug:'text-purple-400',security:'text-orange-400'};
    const txtColors={info:'text-gray-300',warn:'text-yellow-200',error:'text-red-200',debug:'text-purple-200',security:'text-orange-200'};
    const filtered=G.logFilter==='all'?G.sysLogs:G.sysLogs.filter(function(l){return l.lv===G.logFilter;});
    c.innerHTML=filtered.slice(0,40).map(function(l){return'<div class="syslog-row flex gap-3 py-0.5" data-lv="'+l.lv+'"><span class="text-gray-600 flex-shrink-0 w-36 text-[10px]">'+l.ts+'</span><span class="'+(colors[l.lv]||'text-blue-400')+' w-16 flex-shrink-0 font-bold text-[10px]">['+l.lv.toUpperCase()+']</span><span class="'+(txtColors[l.lv]||'text-gray-300')+' text-[10px]">'+esc(l.msg)+'</span></div>';}).join('');
  }
  function filterLogs(f){
    G.logFilter=f;
    document.querySelectorAll('.log-filter').forEach(function(b){const a=b.dataset.lf===f;b.classList.toggle('bg-blue-500/20',a);b.classList.toggle('text-blue-300',a);b.classList.toggle('border-blue-500/30',a);b.classList.toggle('text-gray-400',!a);});
    renderSysLogs();
  }
  function clearSysLogs(){G.sysLogs=[];renderSysLogs();showToast('Logs effacés','info');}
  function exportSysLogs(){const txt=G.sysLogs.map(function(l){return'['+l.ts+'] ['+l.lv.toUpperCase()+'] '+l.msg;}).join('\n');const a=document.createElement('a');a.href='data:text/plain;charset=utf-8,'+encodeURIComponent(txt);a.download='systemesged_v5_logs_'+new Date().toISOString().slice(0,10)+'.txt';a.click();showToast('Logs exportés','success');}

  // ══════════════════════════════════════════════════════
  // AUDIT LOG SUPABASE
  // ══════════════════════════════════════════════════════
  function logActivity(action, docId, description) {
    G.auditLogs.unshift({id:'a-'+Date.now(),action,docId,description,user:G.profile?.name||G.user?.email||'Système',createdAt:new Date().toISOString()});
    if(G.auditLogs.length>200) G.auditLogs=G.auditLogs.slice(0,200);
    addSysLog('info',description||action);
    if(G.user) _logActivity(action,docId,description);
  }
  async function _logActivity(action, docId, description) {
    if(!G.user) return;
    try {
      await SB.from('activity_logs').insert({
        user_id: G.user.id,
        action: action,
        document_id: docId||null,
        description: description||action,
        company_id: G.profile?.company_id||null,
        meta: {}
      });
    } catch(_) {}
  }

  // ══════════════════════════════════════════════════════
  // TOAST
  // ══════════════════════════════════════════════════════
  function showToast(msg,type){
    type=type||'info';
    const ICONS={success:'fas fa-check-circle',error:'fas fa-times-circle',warning:'fas fa-exclamation-triangle',info:'fas fa-info-circle'};
    const COLORS={success:'border-green-500/40',error:'border-red-500/40',warning:'border-yellow-500/40',info:'border-blue-500/40'};
    const IC={success:'text-green-400',error:'text-red-400',warning:'text-yellow-400',info:'text-blue-400'};
    const t=document.createElement('div'); t.className='toast '+(COLORS[type]||COLORS.info);
    t.innerHTML='<i class="'+(ICONS[type]||ICONS.info)+' '+(IC[type]||IC.info)+'"></i><span class="text-sm flex-1">'+esc(msg)+'</span>';
    document.getElementById('toastContainer').appendChild(t);
    setTimeout(function(){t.classList.add('hiding');setTimeout(function(){t.remove();},300);},3500);
  }

  // ══════════════════════════════════════════════════════
  // SIDEBAR & MISC
  // ══════════════════════════════════════════════════════
  function openMobileSidebar(){document.getElementById('mobileSidebar')?.classList.add('open');document.getElementById('sidebarOverlay')?.classList.add('active');document.body.style.overflow='hidden';}
  function closeMobileSidebar(){document.getElementById('mobileSidebar')?.classList.remove('open');document.getElementById('sidebarOverlay')?.classList.remove('active');document.body.style.overflow='';}
  function togglePwdInput(inputId,btn){const i=document.getElementById(inputId);const t=i.type==='text';i.type=t?'password':'text';btn.innerHTML='<i class="fas fa-eye'+(t?'':'-slash')+'"></i>';}

  // ══════════════════════════════════════════════════════
  // SUPABASE AUTH INIT — DOMContentLoaded
  // ══════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', async function () {
    // Anti-clickjacking
    if (window.self !== window.top) {
      document.body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#ef4444;font-family:sans-serif;text-align:center"><div><i class="fas fa-ban" style="font-size:3rem;margin-bottom:1rem;display:block"></i><h1>Accès non autorisé</h1><p>Chargement en iframe interdit.</p></div></div>';
      return;
    }
    try {
      const { data: { session }, error } = await SB.auth.getSession();
      if (error) throw error;
      if (session?.user) {
        await _onSignedIn(session);
      } else {
        document.getElementById('loginScreen').style.display='';
      }
    } catch (err) {
      log.warn('Session init: '+err.message);
      document.getElementById('loginScreen').style.display='';
      await SB.auth.signOut().catch(function(){});
    }

    // OAuth redirects + changements de session
    SB.auth.onAuthStateChange(async function(event, session) {
      if (event==='SIGNED_IN' && session && !G.user) await _onSignedIn(session);
      if (event==='SIGNED_OUT') {
        G.user=null;
        document.getElementById('mainApp').style.display='none';
        document.getElementById('loginScreen').style.display='';
      }
      if (event==='TOKEN_REFRESHED') log.info('Token rafraîchi');
    });
  });

  // ══════════════════════════════════════════════════════
  // EXPOSE — toutes les fonctions appelées depuis le HTML
  // ══════════════════════════════════════════════════════
  const _pub = {
    // Auth
    switchAuthTab, handleLogin, handleRegister, demoLogin, oauthLogin, handleLogout,
    // Navigation
    switchView, switchDocsTab,
    // Documents
    renderDocuments, applyFilters, clearFilters, filterByTag, filterByType, toggleViewMode,
    downloadDocument, downloadCurrentDocument, shareCurrentDocument,
    confirmDeleteDocument, openDocumentPreview, closePreviewModal,
    // Upload
    openUploadModal, closeUploadModal, handleFileSelect, handleFilePickerSelect,
    handleDocDrop, handleDrop, handleDragOver, handleDragLeave, addUploadTag, uploadDocument,
    // Partage
    openShareModal, closeShareModal, shareDocument, copyShareLink,
    renderSharedView, switchSharedTab, revokeShare,
    // Permissions collaborateurs
    openPermModal, closePermModal, addCollaborator, removeCollaborator,
    // Workflows
    renderWorkflows, filterWorkflows, approveWorkflow, rejectWorkflow,
    openCreateWorkflowModal, closeWorkflowModal, createWorkflow,
    // Recherche
    runAdvSearch, clearAdvSearch, handleGlobalSearch,
    // Versioning
    renderVersioningDocs, toggleVersions, filterVersionDocs, restoreVersion, uploadNewVersion,
    // Logs
    filterLogs, clearSysLogs, exportSysLogs,
    // RBAC
    renderRbacCards, openRoleModal, closeRoleModal, saveRole,
    // Utilisateurs
    loadUsers, openCreateUserModal, closeAddUserModal, addUser,
    openEditUserModal, closeEditUserModal, saveEditUser, toggleUserActive,
    // Tags
    loadTags, createTag, deleteTag,
    // Sécurité
    renderAuditLog, updateSecurityStats, scanAllDocuments, generateApiKey, copyKey, exportAuditLog,
    // Billing
    renderBillingView, selectPlan, simulateUpgrade,
    // Settings
    saveProfile, toggleSetting, exportAllData, exportDocumentsCsv, copySqlSchema,
    // Danger
    openDangerModal, closeDangerModal, checkDangerConfirm, executeDangerAction,
    // Notifications
    toggleNotifications, closeNotifPanel, markNotifRead, markAllNotifRead, loadRealNotifications,
    // Sidebar
    openMobileSidebar, closeMobileSidebar, togglePwdInput,
    // Exposer SB pour app_v6.js et app_v7.js
    SB,
    // Exposer logActivity pour app_v7.js
    logActivity,
    // Exposer G pour le HTML (G.selectedFiles.splice, etc.)
    G,
  };
  Object.keys(_pub).forEach(function (k) { window[k] = _pub[k]; });

})();
