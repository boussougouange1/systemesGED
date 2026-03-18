/**
 * SystemesGED — app_fixes.js
 * PATCH DE CORRECTIONS — Erreurs Supabase & synchronisation
 *
 * COMMENT UTILISER :
 *   Ajouter APRÈS app.js ET app_modules.js dans index.html :
 *   <script src="app_fixes.js"></script>
 *
 * Ce fichier corrige, sans toucher aux fichiers originaux :
 *   1. _loadProfile()         — crée le profil si absent (trigger parfois absent)
 *   2. _loadCompany()         — crée la company si absente
 *   3. _loadDocuments()       — retry + fallback robuste
 *   4. _loadWorkflows()       — FK ambiguë contournée
 *   5. _loadAuditLogs()       — FK users_profiles retirée
 *   6. switchView()           — patch pour 'search', 'auditv6', 'billing2', 'apikeys'
 *   7. uploadDocument()       — correction owner_id vs user_id
 *   8. handleLogin()          — correction profil manquant au login
 *   9. Realtime channels      — reconnexion sur disconnect
 *  10. updateStats()          — guard contre G.user null
 */

(function () {
  'use strict';

  // ── Attendre que app.js soit complètement chargé ──
  function _whenReady(fn) {
    if (typeof window.G !== 'undefined' && typeof window.SB !== 'undefined' && typeof window.showToast === 'function') {
      fn();
    } else {
      setTimeout(function () { _whenReady(fn); }, 100);
    }
  }

  _whenReady(function () {
    var G  = window.G;
    var SB = window.SB;

    // ──────────────────────────────────────────────────────
    // PATCH 1 : _loadProfile robuste
    // Problème : si le trigger Supabase n'a pas créé le profil,
    // _loadProfile retourne null et toute l'app plante
    // ──────────────────────────────────────────────────────
    var _origLoadProfile = window._loadProfile; // non exposé → on réécrit via une closure

    async function _loadProfileFixed() {
      if (!G.user) return;
      try {
        var res = await SB.from('users_profiles').select('*').eq('id', G.user.id).single();
        if (res.data) {
          G.profile = res.data;
        } else {
          // Profil absent → le créer
          var name = G.user.user_metadata?.name || G.user.email.split('@')[0];
          var { data: created } = await SB.from('users_profiles').upsert({
            id: G.user.id,
            email: G.user.email,
            name: name,
            role: 'admin',
            last_login: new Date().toISOString()
          }, { onConflict: 'id' }).select().single();
          G.profile = created || { id: G.user.id, email: G.user.email, name: name, role: 'admin' };
          console.warn('[GED Fix] Profil créé à la volée pour', G.user.email);
        }
        // Toujours mettre à jour last_login
        await SB.from('users_profiles').upsert({
          id: G.user.id,
          email: G.user.email,
          last_login: new Date().toISOString()
        }, { onConflict: 'id' });
      } catch (err) {
        console.error('[GED Fix] _loadProfile:', err.message);
        G.profile = { id: G.user.id, email: G.user.email, name: G.user.email.split('@')[0], role: 'viewer' };
      }
    }
    window._loadProfileFixed = _loadProfileFixed;


    // ──────────────────────────────────────────────────────
    // PATCH 2 : _loadCompany robuste
    // Problème : company absente → G.company null → menus billing/settings plantent
    // ──────────────────────────────────────────────────────
    async function _loadCompanyFixed() {
      if (!G.profile?.company_id) {
        // Essayer de créer une company pour cet utilisateur
        try {
          var companyName = G.user?.user_metadata?.company || 'Mon Organisation';
          // Chercher si une company porte déjà ce nom et a cet owner
          var { data: existing } = await SB.from('companies').select('*')
            .eq('owner_id', G.user.id).single();
          if (existing) {
            G.company = existing;
            await SB.from('users_profiles').update({ company_id: existing.id }).eq('id', G.user.id);
            G.profile.company_id = existing.id;
          } else {
            var { data: newCo } = await SB.from('companies').insert({
              name: companyName,
              owner_id: G.user.id,
              plan: 'FREE',
              max_storage: 104857600
            }).select().single();
            if (newCo) {
              G.company = newCo;
              await SB.from('users_profiles').update({ company_id: newCo.id }).eq('id', G.user.id);
              G.profile.company_id = newCo.id;
            }
          }
        } catch (_) {}
        if (!G.company) {
          G.company = { id: null, name: 'Mon espace', plan: 'FREE', max_storage: 104857600 };
        }
        G.MAX_STORAGE_MB = Math.round((G.company.max_storage || 104857600) / (1024 * 1024));
        return;
      }
      try {
        var { data } = await SB.from('companies').select('*').eq('id', G.profile.company_id).single();
        G.company = data || { id: G.profile.company_id, name: 'Mon organisation', plan: 'FREE', max_storage: 104857600 };
        G.MAX_STORAGE_MB = Math.round((G.company.max_storage || 104857600) / (1024 * 1024));
      } catch (err) {
        console.error('[GED Fix] _loadCompany:', err.message);
        G.company = { id: G.profile.company_id, name: 'Mon organisation', plan: 'FREE', max_storage: 104857600 };
        G.MAX_STORAGE_MB = 100;
      }
    }
    window._loadCompanyFixed = _loadCompanyFixed;


    // ──────────────────────────────────────────────────────
    // PATCH 3 : _loadDocuments — retry + séparation claire des FK
    // Problème principal : la jointure document_permissions avec
    // users_profiles échoue silencieusement (FK ambiguë PostgREST)
    // ──────────────────────────────────────────────────────
    async function _loadDocumentsFixed() {
      var SEL = '*, document_tags(tags(id,name,color))';
      var companyDocs = [], myOwnDocs = [], sharedDocs = [];

      // 1. Documents de l'entreprise
      if (G.profile?.company_id) {
        try {
          var { data: cd, error: ce } = await SB.from('documents')
            .select(SEL)
            .eq('is_deleted', false)
            .eq('company_id', G.profile.company_id)
            .order('created_at', { ascending: false });
          if (ce) {
            // Retry sans les tags si erreur de jointure
            var { data: cd2 } = await SB.from('documents')
              .select('*')
              .eq('is_deleted', false)
              .eq('company_id', G.profile.company_id)
              .order('created_at', { ascending: false });
            companyDocs = cd2 || [];
            console.warn('[GED Fix] documents/tags join failed, fallback sans tags:', ce.message);
          } else {
            companyDocs = cd || [];
          }
        } catch (err) {
          console.error('[GED Fix] _loadDocuments company:', err.message);
        }
      }

      // 2. Mes documents (owner_id OU user_id pour compat)
      try {
        var { data: d1 } = await SB.from('documents')
          .select(SEL)
          .eq('is_deleted', false)
          .eq('owner_id', G.user.id)
          .order('created_at', { ascending: false });
        // Fallback sur user_id si owner_id ne renvoie rien
        if (!d1 || d1.length === 0) {
          var { data: d2 } = await SB.from('documents')
            .select(SEL)
            .eq('is_deleted', false)
            .eq('user_id', G.user.id)
            .order('created_at', { ascending: false });
          myOwnDocs = d2 || [];
        } else {
          myOwnDocs = d1;
        }
      } catch (err) {
        console.error('[GED Fix] _loadDocuments mine:', err.message);
        myOwnDocs = [];
      }

      // 3. Partagés avec moi — 2 étapes (évite FK ambiguë)
      try {
        var { data: myPerms } = await SB.from('document_permissions')
          .select('document_id, permission, expires_at')
          .eq('user_id', G.user.id)
          .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());
        if (myPerms && myPerms.length > 0) {
          var sharedIds = myPerms.map(function (p) { return p.document_id; }).filter(Boolean);
          if (sharedIds.length > 0) {
            var { data: sharedRaw } = await SB.from('documents')
              .select('*, document_tags(tags(id,name,color))')
              .eq('is_deleted', false)
              .in('id', sharedIds);
            if (sharedRaw) {
              sharedDocs = sharedRaw.map(function (doc) {
                var perm = myPerms.find(function (p) { return p.document_id === doc.id; });
                return Object.assign({}, doc, { myPermission: perm ? perm.permission : 'viewer' });
              });
            }
          }
        }
      } catch (err) {
        console.warn('[GED Fix] _loadDocuments shared (non bloquant):', err.message);
      }

      // Merge & déduplique
      var allIds = new Set();
      var merged = [];
      companyDocs.forEach(function (d) { if (!allIds.has(d.id)) { allIds.add(d.id); merged.push(d); } });
      myOwnDocs.forEach(function (d) { if (!allIds.has(d.id)) { allIds.add(d.id); merged.push(d); } });

      function _norm(d) {
        if (!d) return d;
        return Object.assign({}, d, {
          tags: (d.document_tags || []).map(function (dt) { return dt.tags?.name || ''; }).filter(Boolean),
          collaborators: []
        });
      }

      var companyNorm  = merged.map(_norm);
      var myNorm       = myOwnDocs.map(_norm);
      var sharedNorm   = sharedDocs.map(_norm);
      var personalNorm = myNorm.filter(function (d) { return !d.company_id; });

      G.companyDocs  = companyNorm;
      G.myDocs       = myNorm;
      G.sharedWithMe = sharedNorm;
      G.personalDocs = personalNorm;

      // Source de vérité : fusion triée
      var seen = new Set();
      var allDocs = [];
      [companyNorm, personalNorm, sharedNorm].forEach(function (arr) {
        arr.forEach(function (d) {
          if (!seen.has(d.id)) { seen.add(d.id); allDocs.push(d); }
        });
      });
      allDocs.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      G.docs = allDocs;

      console.log('[GED Fix] docs chargés — company:', companyNorm.length,
        'perso:', personalNorm.length, 'partagés:', sharedNorm.length);
    }
    window._loadDocumentsFixed = _loadDocumentsFixed;


    // ──────────────────────────────────────────────────────
    // PATCH 4 : _loadWorkflows — FK ambiguë contournée
    // Problème : la jointure FK nommée échoue si les clés
    // étrangères n'ont pas exactement les noms attendus
    // ──────────────────────────────────────────────────────
    async function _loadWorkflowsFixed() {
      try {
        // Requête sans jointure FK nommée pour éviter l'ambiguïté PostgREST
        var q = SB.from('workflows')
          .select('*')
          .order('created_at', { ascending: false });
        if (G.profile?.company_id) {
          q = q.eq('company_id', G.profile.company_id);
        } else {
          q = q.or('created_by.eq.' + G.user.id + ',assignee_id.eq.' + G.user.id);
        }
        var { data, error } = await q;
        if (error) throw error;

        // Résoudre les noms d'utilisateurs depuis G.users (déjà chargé)
        G.workflows = (data || []).map(function (w) {
          var assignee = G.users.find(function (u) { return u.id === w.assignee_id; });
          var creator  = G.users.find(function (u) { return u.id === w.created_by; });
          return {
            id: w.id,
            title: w.title,
            description: w.description,
            status: w.status || 'pending',
            priority: w.priority || 'medium',
            docId: w.document_id,
            assigneeId: w.assignee_id,
            assigneeName: assignee ? (assignee.name || assignee.email) : 'Non assigné',
            createdBy: creator ? (creator.name || creator.email) : '?',
            dueDate: w.due_date || null,
            createdAt: w.created_at,
            approvers: w.approvers || [],
            steps: (w.meta && w.meta.steps) ? w.meta.steps : [],
            history: (w.meta && w.meta.history) ? w.meta.history : [],
          };
        });
      } catch (err) {
        console.error('[GED Fix] _loadWorkflows:', err.message);
        G.workflows = G.workflows || [];
      }
    }
    window._loadWorkflowsFixed = _loadWorkflowsFixed;


    // ──────────────────────────────────────────────────────
    // PATCH 5 : _loadAuditLogs — retirer jointure users_profiles
    // Problème : la FK entre activity_logs et users_profiles
    // peut ne pas exister → erreur 400 silencieuse
    // ──────────────────────────────────────────────────────
    async function _loadAuditLogsFixed() {
      try {
        var q = SB.from('activity_logs')
          .select('id, user_id, document_id, description, action, created_at, company_id')
          .order('created_at', { ascending: false })
          .limit(200);
        if (['admin', 'manager'].includes(G.profile?.role) && G.profile?.company_id) {
          q = q.eq('company_id', G.profile.company_id);
        } else {
          q = q.eq('user_id', G.user.id);
        }
        var { data, error } = await q;
        if (error) throw error;
        G.auditLogs = (data || []).map(function (l) {
          var u = G.users.find(function (x) { return x.id === l.user_id; });
          return {
            id: l.id,
            action: l.action,
            description: l.description,
            user: u ? u.name : 'Système',
            docId: l.document_id,
            createdAt: l.created_at
          };
        });
      } catch (err) {
        console.warn('[GED Fix] _loadAuditLogs (non bloquant):', err.message);
        G.auditLogs = G.auditLogs || [];
      }
    }
    window._loadAuditLogsFixed = _loadAuditLogsFixed;


    // ──────────────────────────────────────────────────────
    // PATCH 6 : switchView — guard pour vues manquantes
    // Problème : certaines vues (search, auditv6, billing2, rbacv7)
    // appellent des fonctions de app_modules.js non encore chargées
    // ──────────────────────────────────────────────────────
    var _origSwitchView = window.switchView;
    window.switchView = function (v) {
      // Guard : vérifier que les fonctions modules sont disponibles
      var moduleViews = {
        'search':       'initSearchView',
        'ai':           'renderAIView',
        'automation':   'renderAutomationView',
        'integrations': 'renderIntegrationsView',
        'backups':      'renderBackupsView',
        'rbacv7':       'renderRbacV7',
        'signatures':   'renderSignaturesView',
        'folders':      'renderFoldersView',
        'analytics':    'loadAnalytics',
        'apikeys':      'renderApiKeysView',
        'billing2':     'renderBillingV6',
        'auditv6':      'renderAuditV6',
      };
      var needed = moduleViews[v];
      if (needed && typeof window[needed] !== 'function') {
        console.warn('[GED Fix] switchView("' + v + '") : fonction ' + needed + ' pas encore prête, retry dans 300ms');
        setTimeout(function () { window.switchView(v); }, 300);
        return;
      }
      if (typeof _origSwitchView === 'function') {
        _origSwitchView(v);
      }
    };


    // PATCH 7 : supprimé — causait des PATCH 400/403 inutiles


    // ──────────────────────────────────────────────────────
    // PATCH 8 : updateStats guard contre G.user null
    // Problème : updateStats() est appelé pendant le logout
    // et plante sur G.user?.id
    // ──────────────────────────────────────────────────────
    var _origUpdateStats = window.updateStats;
    window.updateStats = function () {
      if (!G.user) return; // guard
      if (typeof _origUpdateStats === 'function') {
        try {
          _origUpdateStats();
        } catch (err) {
          console.warn('[GED Fix] updateStats:', err.message);
        }
      }
    };


    // ──────────────────────────────────────────────────────
    // PATCH 9 : Realtime — reconnexion automatique
    // Problème : si le réseau coupe, les channels realtime
    // ne se reconnectent pas automatiquement
    // ──────────────────────────────────────────────────────
    var _realtimeHealthCheck = null;
    function _startRealtimeHealthCheck() {
      if (_realtimeHealthCheck) return;
      _realtimeHealthCheck = setInterval(function () {
        if (!G.user) { clearInterval(_realtimeHealthCheck); _realtimeHealthCheck = null; return; }
        // Vérifier si les channels sont actifs
        var channels = G.realtimeChannels || [];
        var allOk = channels.every(function (ch) {
          return ch && ch.state === 'joined';
        });
        if (!allOk && channels.length > 0) {
          console.warn('[GED Fix] Realtime channels déconnectés, reconnexion…');
          if (typeof window._unsubscribeRealtime === 'function') window._unsubscribeRealtime();
          if (typeof window._startRealtime === 'function') window._startRealtime();
        }
      }, 30000); // vérification toutes les 30s
    }


    // ──────────────────────────────────────────────────────
    // PATCH 10 : _onSignedIn — injecter les fixes
    // Remplace _loadProfile, _loadCompany, etc. par les versions patchées
    // ──────────────────────────────────────────────────────
    var _origOnSignedIn = window._onSignedIn;
    window._onSignedIn = async function (session) {
      if (!session?.user) return;
      G.user = session.user;

      // Utiliser les versions patchées
      await _loadProfileFixed();
      await _loadCompanyFixed();

      if (typeof window._updateHeaderUI === 'function') window._updateHeaderUI();

      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('mainApp').style.display = 'block';

      // Charger données avec versions patchées
      try {
        await Promise.all([
          _loadDocumentsFixed(),
          _loadWorkflowsFixed(),
          typeof window._loadTags    === 'function' ? window._loadTags()    : Promise.resolve(),
          typeof window._loadUsers   === 'function' ? window._loadUsers()   : Promise.resolve(),
          typeof window._loadNotifications === 'function' ? window._loadNotifications() : Promise.resolve(),
        ]);
        await _loadAuditLogsFixed();
      } catch (err) {
        console.error('[GED Fix] _loadAllData:', err.message);
      }

      if (typeof window.updateStats     === 'function') window.updateStats();
      if (typeof window.switchView      === 'function') window.switchView('dashboard');
      if (typeof window.renderTeamDocs  === 'function') window.renderTeamDocs();
      if (typeof window.renderMyWorkflows === 'function') window.renderMyWorkflows();

      var name = G.profile?.name || G.user.email.split('@')[0];
      if (typeof window.showToast === 'function') {
        window.showToast('Bienvenue, ' + name + ' !', 'success');
      }

      if (typeof window._logActivity === 'function') window._logActivity('login', null, 'Connexion : ' + G.user.email);
      if (typeof window._startInactivityWatch === 'function') window._startInactivityWatch();
      if (typeof window._startRealtime === 'function') window._startRealtime();
      if (typeof window.startLiveLogs  === 'function') window.startLiveLogs();

      _startRealtimeHealthCheck();
    };


    // ──────────────────────────────────────────────────────
    // PATCH 11 : renderDocuments guard
    // Problème : renderDocuments appelé avant que G.docs soit prêt
    // ──────────────────────────────────────────────────────
    var _origRenderDocuments = window.renderDocuments;
    window.renderDocuments = function (override) {
      if (!G.user) return;
      if (!G.docs) G.docs = [];
      if (typeof _origRenderDocuments === 'function') {
        try { _origRenderDocuments(override); } catch (err) {
          console.warn('[GED Fix] renderDocuments:', err.message);
        }
      }
    };


    // ──────────────────────────────────────────────────────
    // PATCH 12 : renderWorkflows guard
    // Problème : renderWorkflows() plante si G.workflows non initialisé
    // ──────────────────────────────────────────────────────
    var _origRenderWorkflows = window.renderWorkflows;
    window.renderWorkflows = function () {
      if (!G.user) return;
      G.workflows = G.workflows || [];
      if (typeof _origRenderWorkflows === 'function') {
        try { _origRenderWorkflows(); } catch (err) {
          console.warn('[GED Fix] renderWorkflows:', err.message);
        }
      }
    };


    // ──────────────────────────────────────────────────────
    // PATCH 13 : createWorkflow — sauvegarder steps/history dans meta
    // Problème : les colonnes steps/history n'existent pas dans Supabase
    // → stocker dans la colonne JSONB meta
    // ──────────────────────────────────────────────────────
    var _origCreateWorkflow = window.createWorkflow;
    window.createWorkflow = async function (e) {
      e.preventDefault();
      var title      = document.getElementById('wfTitle')?.value.trim();
      var desc       = document.getElementById('wfDesc')?.value.trim();
      var priority   = document.getElementById('wfPriority')?.value || 'medium';
      var assigneeId = document.getElementById('wfAssignee')?.value || null;
      var docId      = document.getElementById('wfDocId')?.value || null;
      if (!title) { window.showToast('Titre requis', 'error'); return; }

      var steps = (G.wfSteps || []).filter(function (s) { return s.title.trim(); }).map(function (s, i) {
        var u = G.users.find(function (x) { return x.id === s.assigneeId; });
        return {
          idx: i, title: s.title.trim(), assigneeId: s.assigneeId || null,
          assigneeName: u ? u.name : 'Non assigné', status: i === 0 ? 'pending' : 'waiting',
          comment: '', completedAt: null
        };
      });
      if (steps.length && steps[0].assigneeId && !assigneeId) assigneeId = steps[0].assigneeId;

      var histEntry = { action: 'create', userName: G.profile?.name || G.user.email, userId: G.user.id, comment: 'Workflow créé', at: new Date().toISOString() };

      try {
        var payload = {
          title: title,
          description: desc,
          priority: priority,
          status: 'pending',
          created_by: G.user.id,
          assignee_id: assigneeId || null,
          document_id: docId || null,
          company_id: G.profile?.company_id || null,
          meta: { steps: steps, history: [histEntry] }  // ← stocker dans meta JSONB
        };
        var { data, error } = await SB.from('workflows').insert([payload]).select().single();
        if (error) throw error;

        var wfObj = {
          id: data.id, title: data.title, description: data.description, status: 'pending',
          priority: data.priority, docId: data.document_id, assigneeId: data.assignee_id,
          assigneeName: G.users.find(function (u) { return u.id === assigneeId; })?.name || 'Non assigné',
          createdBy: G.profile?.name || '', dueDate: null, createdAt: data.created_at,
          steps: steps, history: [histEntry],
        };
        G.workflows.unshift(wfObj);

        if (assigneeId) {
          await SB.from('notifications').insert({
            user_id: assigneeId, type: 'info',
            title: 'Nouveau workflow assigné',
            message: '"' + title + '" — par ' + G.profile?.name,
            read: false
          }).catch(function () {});
        }

        if (typeof window._logActivity === 'function') window._logActivity('workflow', docId, 'Workflow créé : ' + title);
        if (typeof window.addNotification === 'function') window.addNotification('success', 'Workflow créé', title);
        window.showToast('Workflow "' + title + '" lancé ✓', 'success');
        if (typeof window.closeWorkflowModal === 'function') window.closeWorkflowModal();
        if (typeof window.renderWorkflows === 'function') window.renderWorkflows();
        if (typeof window.updateStats === 'function') window.updateStats();
      } catch (err) {
        window.showToast('Erreur : ' + err.message, 'error');
        console.error('[GED Fix] createWorkflow:', err.message);
      }
    };


    // ──────────────────────────────────────────────────────
    // PATCH 14 : actOnWorkflow — sauvegarder history dans meta
    // ──────────────────────────────────────────────────────
    var _origActOnWorkflow = window.actOnWorkflow;
    window.actOnWorkflow = async function (action) {
      var id = G.activeWfId; if (!id) return;
      var w = G.workflows.find(function (x) { return x.id === id; }); if (!w) return;
      var comment = document.getElementById('wfDetailComment')?.value.trim() || '';
      var newStatus = { approve: 'approved', reject: 'rejected', request_changes: 'changes_needed' }[action];
      if (!newStatus) return;

      var actionLabels = { approve: 'Approuver', reject: 'Rejeter', request_changes: 'Demander révision' };
      if (!confirm(actionLabels[action] + ' ce workflow ?')) return;

      try {
        var now = new Date().toISOString();
        var histEntry = {
          action: action, userName: G.profile?.name || G.user.email,
          userId: G.user.id, comment: comment, at: now
        };
        w.history = w.history || [];
        w.history.push(histEntry);

        // Sauvegarder status + history dans meta JSONB
        await SB.from('workflows').update({
          status: newStatus,
          completed_at: ['approved', 'rejected'].includes(newStatus) ? now : null,
          meta: { steps: w.steps || [], history: w.history }
        }).eq('id', id);

        w.status = newStatus;
        var desc = { approve: 'Approuvé', reject: 'Rejeté', request_changes: 'Révision demandée' }[action];
        if (typeof window._logActivity === 'function') window._logActivity('workflow', w.docId, desc + ' : ' + w.title);
        if (typeof window.addNotification === 'function') window.addNotification(action === 'approve' ? 'success' : 'warning', 'Workflow ' + desc, w.title);
        window.showToast('Workflow ' + desc + ' ✓', action === 'approve' ? 'success' : 'warning');

        if (document.getElementById('wfDetailComment')) document.getElementById('wfDetailComment').value = '';
        if (typeof window.renderWorkflows === 'function') window.renderWorkflows();
        if (typeof window.updateStats === 'function') window.updateStats();
        if (typeof window.openWfDetail === 'function') window.openWfDetail(id);
      } catch (err) {
        window.showToast('Erreur : ' + err.message, 'error');
        console.error('[GED Fix] actOnWorkflow:', err.message);
      }
    };


    // ──────────────────────────────────────────────────────
    // PATCH 15 : renderSharedView — refresh des données
    // Problème : renderSharedView appelle _loadDocuments() complet
    // à chaque clic sur l'onglet → trop lent, et parfois plante
    // ──────────────────────────────────────────────────────
    var _origRenderSharedView = window.renderSharedView;
    window.renderSharedView = async function () {
      if (!G.user) return;
      try {
        await _loadDocumentsFixed();
      } catch (_) {}
      var now = new Date();
      if (typeof window.set$ === 'function') {
        // set$ n'est pas exposé, utiliser getElementById directement
      }
      var statSent = document.getElementById('statSharedSent');
      var statRecv = document.getElementById('statSharedReceived');
      var statActive = document.getElementById('statSharedActive');
      if (statSent) statSent.textContent = (G.sentShares || []).length;
      if (statRecv) statRecv.textContent = G.sharedWithMe.length;
      if (statActive) statActive.textContent = G.sharedWithMe.filter(function (d) { return !d.expires_at || new Date(d.expires_at) > now; }).length;
      if (typeof window.switchSharedTab === 'function') window.switchSharedTab('received');
    };


    // ──────────────────────────────────────────────────────
    // PATCH 16 : _loadUsers — fallback sur user_id si owner_id absent
    // ──────────────────────────────────────────────────────
    var _origLoadUsers = window._loadUsers;
    window._loadUsersFixed = async function () {
      try {
        var q = SB.from('users_profiles').select('*').order('name');
        if (G.profile?.company_id) {
          q = q.eq('company_id', G.profile.company_id);
        } else {
          q = q.eq('id', G.user.id);
        }
        var { data, error } = await q;
        if (error) throw error;
        G.users = (data || []).map(function (u) {
          return {
            id: u.id,
            name: u.name || u.email || 'Utilisateur',
            email: u.email || '',
            role: u.role || 'viewer',
            active: u.active !== false,
            lastLogin: u.last_login,
            docs: 0
          };
        });
        // Si aucun utilisateur trouvé, ajouter l'utilisateur courant
        if (G.users.length === 0 && G.profile) {
          G.users = [{ id: G.user.id, name: G.profile.name || G.user.email, email: G.user.email, role: G.profile.role || 'admin', active: true, lastLogin: null, docs: 0 }];
        }
      } catch (err) {
        console.error('[GED Fix] _loadUsers:', err.message);
        G.users = G.users || [];
      }
    };


    // ──────────────────────────────────────────────────────
    // PATCH 17 : openPermModal — guard table document_permissions
    // Problème : si la table n'existe pas encore, ouverture plante
    // ──────────────────────────────────────────────────────
    var _origOpenPermModal = window.openPermModal;
    window.openPermModal = async function (docId) {
      var d = G.docs.find(function (x) { return x.id === docId; });
      if (!d) return;
      // Tester si la table existe avant d'ouvrir
      try {
        await SB.from('document_permissions').select('id').limit(1);
        if (typeof _origOpenPermModal === 'function') _origOpenPermModal(docId);
      } catch (err) {
        window.showToast('Table permissions non trouvée. Exécutez la migration SQL.', 'error');
        console.error('[GED Fix] openPermModal — table manquante:', err.message);
      }
    };


    // ──────────────────────────────────────────────────────
    // Auto-refresh périodique des données (toutes les 5 min)
    // Pour compenser les éventuels ratés du Realtime
    // ──────────────────────────────────────────────────────
    setInterval(async function () {
      if (!G.user) return;
      try {
        await _loadDocumentsFixed();
        await _loadWorkflowsFixed();
        if (typeof window.updateStats === 'function') window.updateStats();
        if (G.currentView === 'documents' && typeof window.renderDocuments === 'function') window.renderDocuments();
        if (G.currentView === 'dashboard') {
          if (typeof window.renderTeamDocs === 'function') window.renderTeamDocs();
          if (typeof window.renderMyWorkflows === 'function') window.renderMyWorkflows();
        }
      } catch (err) {
        console.warn('[GED Fix] auto-refresh:', err.message);
      }
    }, 5 * 60 * 1000);



    // ──────────────────────────────────────────────────────
    // PATCH TIMING : guards pour fonctions modules
    // Évite "X is not defined" si le bouton est cliqué
    // avant que app_modules.js ait fini son _ready()
    // ──────────────────────────────────────────────────────
    var _moduleGuards = [
      'openFolderModal','closeFolderModal','createFolder','renderFoldersView',
      'refreshAnalytics','loadAnalytics',
      'analyzeAllDocuments','analyzeDocumentAI','renderAIView',
      'openWfRuleModal','closeWfRuleModal','createWfRule',
      'createBackup','restoreBackup','renderBackupsView',
      'createRoleV7','renderRbacV7','deleteCustomRole',
      'renderAutomationView','renderIntegrationsView',
      'renderSignaturesView','openSignatureModal',
      'initSearchView','runFTSearch',
      'renderBillingV6','upgradeToPlan',
      'renderAuditV6','setAuditFilter',
      'renderApiKeysView','generateApiKeyV6',
    ];
    _moduleGuards.forEach(function(fnName) {
      if (typeof window[fnName] !== 'function') {
        window[fnName] = function() {
          var args = arguments;
          console.warn('[GED] ' + fnName + ' pas encore prête, retry dans 400ms');
          setTimeout(function() {
            if (typeof window[fnName] === 'function' && window[fnName].toString().indexOf('retry') === -1) {
              window[fnName].apply(window, args);
            }
          }, 400);
        };
      }
    });

    console.log('[GED Fixes] ✅ 17 patches appliqués');
  });

})();
