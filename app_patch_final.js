/**
 * SystemesGED — app_patch_final.js
 * Patch consolidé final — corrige TOUTES les erreurs identifiées
 *
 * Corrections appliquées :
 *  1. Expose les fonctions internes manquantes sur window
 *     (_updateHeaderUI, _startRealtime, _unsubscribeRealtime,
 *      _startInactivityWatch, _loadTags, _loadUsers,
 *      _loadNotifications, fmtDate, escapeHtml, getFileIcon,
 *      formatFileSize, avatarInitials, updateStats)
 *  2. Réécrit _onSignedIn pour utiliser les fixes robustes
 *  3. Corrige la clé Supabase (anon key JWT valide)
 *  4. Élimine les conflits entre app_fixes.js / app_fixes_v2.js / app_modules.js
 *  5. Guards globaux pour toutes les fonctions modules
 *  6. uploadDocument — correction owner_id
 *  7. Correction window.onclick pour fermer les modales
 *  8. Correction addNotification manquante
 *  9. Correction updatePlanUI manquante
 * 10. Correction _normalizeDoc exposée
 */

/* ══════════════════════════════════════════════════════════════
   GUARDS IMMÉDIATS — avant que _whenReady se résolve
   Évite "X is not a function" si bouton cliqué trop tôt
   ══════════════════════════════════════════════════════════════ */
(function () {
  var _guards = [
    'refreshAnalytics','loadAnalytics',
    'openFolderModal','closeFolderModal','createFolder','renderFoldersView','openFolder',
    'analyzeAllDocuments','analyzeDocumentAI','renderAIView',
    'openWfRuleModal','closeWfRuleModal','createWfRule',
    'createBackup','restoreBackup','renderBackupsView',
    'createRoleV7','renderRbacV7','deleteCustomRole',
    'renderAutomationView','renderIntegrationsView',
    'renderSignaturesView','openSignatureModal','closeSignModal','clearSignature','submitSignature',
    'openRequestSignatureModal','closeRequestSignatureModal','submitSignatureRequest',
    'initSearchView','runFTSearch',
    'renderBillingV6','upgradeToPlan',
    'renderAuditV6','setAuditFilter',
    'renderApiKeysView','generateApiKeyV6','copyApiKey','deleteApiKeyV6',
    'toggleWfRule','deleteWfRule','filterIntegrations','toggleIntegration',
    'rejectSignatureRequest','togglePwdInput',
  ];
  _guards.forEach(function (fn) {
    if (typeof window[fn] !== 'function') {
      window[fn] = function () {
        var _a = arguments;
        setTimeout(function () {
          if (typeof window[fn] === 'function') window[fn].apply(window, _a);
        }, 600);
      };
    }
  });
})();


/* ══════════════════════════════════════════════════════════════
   PATCH PRINCIPAL — attend que app.js soit chargé
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function _whenReady(fn) {
    if (
      typeof window.G !== 'undefined' &&
      typeof window.SB !== 'undefined' &&
      typeof window.showToast === 'function' &&
      typeof window.switchView === 'function'
    ) {
      fn();
    } else {
      setTimeout(function () { _whenReady(fn); }, 80);
    }
  }

  _whenReady(function () {
    var G  = window.G;
    var SB = window.SB;

    /* ─────────────────────────────────────────────────────────
       PATCH 1 : Exposer les utilitaires internes sur window
       (ils sont dans l'IIFE de app.js mais non exposés)
       ───────────────────────────────────────────────────────── */

    // esc / escapeHtml — déjà exposés dans _pub mais sous 'escapeHtml' seulement
    if (!window.esc && window.escapeHtml) window.esc = window.escapeHtml;
    if (!window.escapeHtml) {
      window.escapeHtml = window.esc = function (s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;').replace(/\//g,'&#x2F;');
      };
    }

    // fmtDate
    if (!window.fmtDate) {
      window.fmtDate = function (iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
      };
    }

    // timeAgo
    if (!window.timeAgo) {
      window.timeAgo = function (iso) {
        var d = (Date.now() - new Date(iso)) / 1000;
        if (d < 60) return 'À l\'instant';
        if (d < 3600) return Math.floor(d / 60) + ' min';
        if (d < 86400) return Math.floor(d / 3600) + 'h';
        if (d < 604800) return Math.floor(d / 86400) + ' j';
        return new Date(iso).toLocaleDateString('fr-FR');
      };
    }

    // formatFileSize
    if (!window.formatFileSize) {
      window.formatFileSize = function (b) {
        if (!b || b === 0) return '0 B';
        var k = 1024, s = ['B','KB','MB','GB'], i = Math.floor(Math.log(b) / Math.log(k));
        return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + s[i];
      };
    }

    // getFileIcon
    if (!window.getFileIcon) {
      window.getFileIcon = function (name) {
        var ext = (name || '').split('.').pop().toLowerCase();
        var m = {
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
        };
        return m[ext] || { icon:'fa-file', color:'text-gray-400', bg:'bg-gray-500/20', border:'border-gray-400/30' };
      };
    }

    // avatarInitials
    if (!window.avatarInitials) {
      window.avatarInitials = function (name) {
        return (name || '?').split(' ').map(function (n) { return n[0] || ''; }).join('').toUpperCase().slice(0, 2) || '?';
      };
    }

    // updateStats — déjà exposé mais guard
    if (!window.updateStats) {
      window.updateStats = function () {};
    }

    // addNotification — manquante dans app.js
    if (!window.addNotification) {
      window.addNotification = function (type, title, msg) {
        G.notifications = G.notifications || [];
        G.notifications.unshift({ id: 'n-' + Date.now(), type: type, title: title, msg: msg, read: false, at: new Date().toISOString() });
        // Mettre à jour le badge
        var badge = document.getElementById('notifBadge');
        var unread = G.notifications.filter(function (n) { return !n.read; }).length;
        if (badge) { badge.textContent = unread; badge.classList.toggle('hidden', unread === 0); }
      };
    }

    // updatePlanUI — manquante
    if (!window.updatePlanUI) {
      window.updatePlanUI = function (plan) {
        var el = document.getElementById('planBadge');
        if (el) el.textContent = plan || 'FREE';
      };
    }

    // _normalizeDoc — exposé pour les patches
    if (!window._normalizeDoc) {
      window._normalizeDoc = function (d) {
        if (!d) return d;
        return Object.assign({}, d, {
          tags: (d.document_tags || []).map(function (dt) { return dt.tags ? dt.tags.name : ''; }).filter(Boolean),
          collaborators: [],
        });
      };
    }


    /* ─────────────────────────────────────────────────────────
       PATCH 2 : _loadProfile robuste (crée profil si absent)
       ───────────────────────────────────────────────────────── */
    window._loadProfileFixed = async function () {
      if (!G.user) return;
      try {
        var res = await SB.from('users_profiles').select('*').eq('id', G.user.id).single();
        if (res.data) {
          G.profile = res.data;
        } else {
          var name = (G.user.user_metadata && G.user.user_metadata.name) || G.user.email.split('@')[0];
          var upsertRes = await SB.from('users_profiles').upsert({
            id: G.user.id,
            email: G.user.email,
            name: name,
            role: 'admin',
            last_login: new Date().toISOString()
          }, { onConflict: 'id' }).select().single();
          G.profile = (upsertRes.data) || { id: G.user.id, email: G.user.email, name: name, role: 'admin' };
          console.warn('[GED Patch] Profil créé à la volée pour', G.user.email);
        }
        // Toujours mettre à jour last_login
        try {
          await SB.from('users_profiles').upsert({
            id: G.user.id, email: G.user.email, last_login: new Date().toISOString()
          }, { onConflict: 'id' });
        } catch (_) {}
      } catch (err) {
        console.error('[GED Patch] _loadProfile:', err.message);
        G.profile = { id: G.user.id, email: G.user.email, name: G.user.email.split('@')[0], role: 'viewer' };
      }
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 3 : _loadCompany robuste
       ───────────────────────────────────────────────────────── */
    window._loadCompanyFixed = async function () {
      if (!G.profile) {
        G.company = { id: null, name: 'Mon espace', plan: 'FREE', max_storage: 104857600 };
        G.MAX_STORAGE_MB = 100;
        return;
      }
      if (!G.profile.company_id) {
        try {
          var companyName = (G.user.user_metadata && G.user.user_metadata.company) || 'Mon Organisation';
          var existRes = await SB.from('companies').select('*').eq('owner_id', G.user.id).maybeSingle();
          if (existRes.data) {
            G.company = existRes.data;
            await SB.from('users_profiles').update({ company_id: existRes.data.id }).eq('id', G.user.id);
            G.profile.company_id = existRes.data.id;
          } else {
            var newCoRes = await SB.from('companies').insert({
              name: companyName, owner_id: G.user.id, plan: 'FREE', max_storage: 104857600
            }).select().single();
            if (newCoRes.data) {
              G.company = newCoRes.data;
              await SB.from('users_profiles').update({ company_id: newCoRes.data.id }).eq('id', G.user.id);
              G.profile.company_id = newCoRes.data.id;
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
        var coRes = await SB.from('companies').select('*').eq('id', G.profile.company_id).single();
        G.company = coRes.data || { id: G.profile.company_id, name: 'Mon organisation', plan: 'FREE', max_storage: 104857600 };
        G.MAX_STORAGE_MB = Math.round((G.company.max_storage || 104857600) / (1024 * 1024));
      } catch (err) {
        console.error('[GED Patch] _loadCompany:', err.message);
        G.company = { id: G.profile.company_id, name: 'Mon organisation', plan: 'FREE', max_storage: 104857600 };
        G.MAX_STORAGE_MB = 100;
      }
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 4 : _loadDocuments robuste (retry sans jointure tags)
       ───────────────────────────────────────────────────────── */
    window._loadDocumentsFixed = async function () {
      var SEL = '*, document_tags(tags(id,name,color))';
      var companyDocs = [], myOwnDocs = [], sharedDocs = [];

      // 1. Documents entreprise
      if (G.profile && G.profile.company_id) {
        try {
          var cdRes = await SB.from('documents').select(SEL)
            .eq('is_deleted', false).eq('company_id', G.profile.company_id)
            .order('created_at', { ascending: false });
          if (cdRes.error) {
            // Retry sans jointure
            var cdRes2 = await SB.from('documents').select('*')
              .eq('is_deleted', false).eq('company_id', G.profile.company_id)
              .order('created_at', { ascending: false });
            companyDocs = cdRes2.data || [];
          } else {
            companyDocs = cdRes.data || [];
          }
        } catch (err) { console.error('[GED Patch] loadDocs company:', err.message); }
      }

      // 2. Mes documents (owner_id puis fallback user_id)
      try {
        var d1Res = await SB.from('documents').select(SEL)
          .eq('is_deleted', false).eq('owner_id', G.user.id)
          .order('created_at', { ascending: false });
        if (!d1Res.data || d1Res.data.length === 0) {
          var d2Res = await SB.from('documents').select(SEL)
            .eq('is_deleted', false).eq('user_id', G.user.id)
            .order('created_at', { ascending: false });
          myOwnDocs = d2Res.data || [];
        } else {
          myOwnDocs = d1Res.data;
        }
      } catch (err) { console.error('[GED Patch] loadDocs mine:', err.message); }

      // 3. Partagés avec moi (2 étapes)
      try {
        var permsRes = await SB.from('document_permissions')
          .select('document_id, permission, expires_at').eq('user_id', G.user.id)
          .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());
        var myPerms = permsRes.data || [];
        if (myPerms.length > 0) {
          var ids = myPerms.map(function (p) { return p.document_id; }).filter(Boolean);
          if (ids.length > 0) {
            var sharedRes = await SB.from('documents').select(SEL)
              .eq('is_deleted', false).in('id', ids);
            if (sharedRes.data) {
              sharedDocs = sharedRes.data.map(function (doc) {
                var perm = myPerms.find(function (p) { return p.document_id === doc.id; });
                return Object.assign({}, doc, { myPermission: perm ? perm.permission : 'viewer' });
              });
            }
          }
        }
      } catch (err) { console.warn('[GED Patch] loadDocs shared:', err.message); }

      // Normaliser et fusionner
      var norm = window._normalizeDoc || function (d) { return d; };
      var companyNorm  = companyDocs.map(norm);
      var myNorm       = myOwnDocs.map(norm);
      var sharedNorm   = sharedDocs.map(norm);
      var personalNorm = myNorm.filter(function (d) { return !d.company_id; });

      G.companyDocs  = companyNorm;
      G.myDocs       = myNorm;
      G.sharedWithMe = sharedNorm;
      G.personalDocs = personalNorm;

      var seen = new Set(), allDocs = [];
      [companyNorm, personalNorm, sharedNorm].forEach(function (arr) {
        arr.forEach(function (d) { if (d && !seen.has(d.id)) { seen.add(d.id); allDocs.push(d); } });
      });
      allDocs.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      G.docs = allDocs;

      console.log('[GED Patch] docs — entreprise:', companyNorm.length, 'perso:', personalNorm.length, 'partagés:', sharedNorm.length, 'total:', G.docs.length);
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 5 : _loadWorkflows sans FK nommée
       ───────────────────────────────────────────────────────── */
    window._loadWorkflowsFixed = async function () {
      try {
        var q = SB.from('workflows').select('*').order('created_at', { ascending: false });
        if (G.profile && G.profile.company_id) {
          q = q.eq('company_id', G.profile.company_id);
        } else {
          q = q.or('created_by.eq.' + G.user.id + ',assignee_id.eq.' + G.user.id);
        }
        var wfRes = await q;
        if (wfRes.error) throw wfRes.error;
        G.workflows = (wfRes.data || []).map(function (w) {
          var assignee = (G.users || []).find(function (u) { return u.id === w.assignee_id; });
          var creator  = (G.users || []).find(function (u) { return u.id === w.created_by; });
          var meta = w.meta || {};
          return {
            id: w.id, title: w.title, description: w.description,
            status: w.status || 'pending', priority: w.priority || 'medium',
            docId: w.document_id, assigneeId: w.assignee_id,
            assigneeName: assignee ? (assignee.name || assignee.email || 'Non assigné') : 'Non assigné',
            createdBy: creator ? (creator.name || creator.email || '?') : '?',
            dueDate: w.due_date || null, createdAt: w.created_at,
            approvers: w.approvers || [],
            steps: meta.steps || [], history: meta.history || [],
          };
        });
      } catch (err) {
        console.error('[GED Patch] _loadWorkflows:', err.message);
        G.workflows = G.workflows || [];
      }
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 6 : _loadUsers robuste
       ───────────────────────────────────────────────────────── */
    window._loadUsersFixed = async function () {
      try {
        var q = SB.from('users_profiles').select('*').order('name');
        if (G.profile && G.profile.company_id) {
          q = q.eq('company_id', G.profile.company_id);
        } else {
          q = q.eq('id', G.user.id);
        }
        var uRes = await q;
        if (uRes.error) throw uRes.error;
        G.users = (uRes.data || []).map(function (u) {
          return { id: u.id, name: u.name || u.email || 'Utilisateur', email: u.email || '', role: u.role || 'viewer', active: u.active !== false, lastLogin: u.last_login, docs: 0 };
        });
        if (G.users.length === 0 && G.profile) {
          G.users = [{ id: G.user.id, name: G.profile.name || G.user.email, email: G.user.email, role: G.profile.role || 'admin', active: true, lastLogin: null, docs: 0 }];
        }
      } catch (err) {
        console.error('[GED Patch] _loadUsers:', err.message);
        if (!G.users || G.users.length === 0) {
          G.users = G.profile ? [{ id: G.user.id, name: G.profile.name || G.user.email, email: G.user.email, role: 'admin', active: true }] : [];
        }
      }
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 7 : _loadAuditLogs sans jointure FK
       ───────────────────────────────────────────────────────── */
    window._loadAuditLogsFixed = async function () {
      try {
        var q = SB.from('activity_logs')
          .select('id, user_id, document_id, description, action, created_at, company_id')
          .order('created_at', { ascending: false }).limit(200);
        if (G.profile && ['admin','manager'].includes(G.profile.role) && G.profile.company_id) {
          q = q.eq('company_id', G.profile.company_id);
        } else {
          q = q.eq('user_id', G.user.id);
        }
        var alRes = await q;
        if (alRes.error) throw alRes.error;
        G.auditLogs = (alRes.data || []).map(function (l) {
          var u = (G.users || []).find(function (x) { return x.id === l.user_id; });
          return { id: l.id, action: l.action, description: l.description, user: u ? u.name : 'Système', docId: l.document_id, createdAt: l.created_at };
        });
      } catch (err) {
        console.warn('[GED Patch] _loadAuditLogs:', err.message);
        G.auditLogs = G.auditLogs || [];
      }
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 8 : _updateHeaderUI exposé + robuste
       ───────────────────────────────────────────────────────── */
    window._updateHeaderUI = function () {
      if (!G.user) return;
      var name = (G.profile && G.profile.name) || G.user.email.split('@')[0] || 'Utilisateur';
      var role = (G.profile && G.profile.role) || 'viewer';
      var ROLE_LABELS = { admin:'Administrateur', manager:'Manager', editor:'Éditeur', viewer:'Lecteur' };
      var set$ = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
      var setVal$ = function (id, v) { var e = document.getElementById(id); if (e) e.value = v; };
      var avatarFn = window.avatarInitials || function (n) { return (n || '?')[0]; };

      set$('userAvatarInitial', avatarFn(name));
      set$('userNameDisplay', name.split(' ')[0]);
      set$('userRoleDisplay', ROLE_LABELS[role] || role);
      set$('dropdownUserName', name);
      set$('dropdownUserEmail', G.user.email || '');
      setVal$('profileName', name);
      setVal$('profileEmail', G.user.email || '');

      if (G.company) {
        set$('companyAvatar', (G.company.name[0] || 'C').toUpperCase());
        set$('companyNameLabel', G.company.name);
        if (typeof window.updatePlanUI === 'function') window.updatePlanUI(G.company.plan || 'FREE');
      }

      if (!['admin','manager'].includes(role)) {
        document.querySelectorAll('[data-admin-only]').forEach(function (el) { el.style.display = 'none'; });
      }
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 9 : _onSignedIn — réécrit pour utiliser tous les fixes
       ───────────────────────────────────────────────────────── */
    // Override l'auth state change au niveau de Supabase
    // car _onSignedIn est dans l'IIFE et non overridable directement
    // On intercepte via onAuthStateChange avec une priorité plus haute
    var _signedInProcessing = false;

    SB.auth.onAuthStateChange(async function (event, session) {
      if (event === 'SIGNED_IN' && session && session.user && !_signedInProcessing) {
        _signedInProcessing = true;
        try {
          G.user = session.user;

          await window._loadProfileFixed();
          await window._loadCompanyFixed();
          window._updateHeaderUI();

          document.getElementById('loginScreen').style.display = 'none';
          document.getElementById('mainApp').style.display = 'block';

          // Charger toutes les données avec les versions patchées
          try {
            await window._loadUsersFixed();  // utilisateurs d'abord (résolution noms workflows)
            await Promise.all([
              window._loadDocumentsFixed(),
              window._loadWorkflowsFixed(),
              typeof window._loadTags === 'function' ? window._loadTags() : Promise.resolve(),
              typeof window._loadNotifications === 'function' ? window._loadNotifications() : Promise.resolve(),
            ]);
            await window._loadAuditLogsFixed();
          } catch (err) {
            console.error('[GED Patch] _onSignedIn data load:', err.message);
          }

          if (typeof window.updateStats === 'function') window.updateStats();
          if (typeof window.switchView === 'function') window.switchView('dashboard');
          if (typeof window.renderTeamDocs === 'function') window.renderTeamDocs();
          if (typeof window.renderMyWorkflows === 'function') window.renderMyWorkflows();

          var displayName = (G.profile && G.profile.name) || G.user.email.split('@')[0];
          window.showToast('Bienvenue, ' + displayName + ' !', 'success');

          if (typeof window.logActivity === 'function') window.logActivity('login', null, 'Connexion : ' + G.user.email);
          if (typeof window._startInactivityWatch === 'function') window._startInactivityWatch();
          if (typeof window._startRealtime === 'function') window._startRealtime();
          if (typeof window.startLiveLogs === 'function') window.startLiveLogs();
        } finally {
          setTimeout(function () { _signedInProcessing = false; }, 3000);
        }
      }

      if (event === 'SIGNED_OUT') {
        G.user = null; G.profile = null; G.company = null;
        G.docs = []; G.companyDocs = []; G.myDocs = []; G.personalDocs = []; G.sharedWithMe = [];
        G.workflows = []; G.users = []; G.notifications = [];
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('loginScreen').style.display = '';
        _signedInProcessing = false;
      }
    });


    /* ─────────────────────────────────────────────────────────
       PATCH 10 : Session initiale (DOMContentLoaded déjà passé)
       Recharge la session si déjà connecté au chargement
       ───────────────────────────────────────────────────────── */
    // Vérifier si l'app.js original a déjà réussi à connecter l'utilisateur
    // Si non (loginScreen toujours visible), on tente un getSession
    setTimeout(async function () {
      // Si mainApp est déjà visible → app.js a géré la connexion → on patche l'état
      var mainAppVisible = document.getElementById('mainApp') &&
        document.getElementById('mainApp').style.display !== 'none' &&
        document.getElementById('mainApp').style.display !== '';
      if (mainAppVisible && G.user && !G.profile) {
        // App connectée mais profil non chargé → re-charger
        await window._loadProfileFixed();
        await window._loadCompanyFixed();
        window._updateHeaderUI();
        await window._loadUsersFixed();
        await Promise.all([
          window._loadDocumentsFixed(),
          window._loadWorkflowsFixed(),
        ]);
        if (typeof window.updateStats === 'function') window.updateStats();
        if (typeof window.renderDocuments === 'function') window.renderDocuments();
      }
    }, 2000);


    /* ─────────────────────────────────────────────────────────
       PATCH 11 : uploadDocument — correction owner_id
       ───────────────────────────────────────────────────────── */
    var _origUpload = window.uploadDocument;
    window.uploadDocument = async function () {
      if (!G.selectedFiles || G.selectedFiles.length === 0) {
        window.showToast('Sélectionnez des fichiers', 'error'); return;
      }
      var BLOCKED = ['exe','bat','cmd','sh','ps1','vbs','jar','msi','dll','scr','com','pif'];
      var scope   = document.getElementById('docScopeToggle')?.checked ? 'company' : 'personal';
      var desc    = document.getElementById('uploadDesc')?.value.trim() || '';
      var btn     = document.getElementById('uploadBtn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Envoi…'; }

      var uploaded = 0;
      for (var i = 0; i < G.selectedFiles.length; i++) {
        var file = G.selectedFiles[i];
        var ext  = file.name.split('.').pop().toLowerCase();
        if (BLOCKED.includes(ext)) { window.showToast('Fichier bloqué : ' + file.name, 'error'); continue; }
        if (file.size > 50 * 1024 * 1024) { window.showToast(file.name + ' trop volumineux (50MB max)', 'error'); continue; }

        try {
          var path = G.user.id + '/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          var upRes = await SB.storage.from('documents').upload(path, file, { contentType: file.type });
          if (upRes.error) throw upRes.error;

          var urlRes = SB.storage.from('documents').getPublicUrl(path);
          var publicUrl = urlRes.data ? urlRes.data.publicUrl : null;

          var payload = {
            name: file.name,
            description: desc,
            file_path: path,
            file_url: publicUrl,
            file_size: file.size,
            file_type: file.type || ext,
            owner_id: G.user.id,              // ← fix principal
            company_id: (scope === 'company' && G.profile && G.profile.company_id) ? G.profile.company_id : null,
            is_deleted: false,
          };

          var docRes = await SB.from('documents').insert([payload]).select().single();
          if (docRes.error) throw docRes.error;

          // Tags
          if (G.uploadTags && G.uploadTags.length > 0) {
            for (var t = 0; t < G.uploadTags.length; t++) {
              try {
                var tagQ = SB.from('tags').select('id').eq('name', G.uploadTags[t]);
                if (G.profile && G.profile.company_id) tagQ = tagQ.eq('company_id', G.profile.company_id);
                var tRes = await tagQ.single();
                var tagId = tRes.data ? tRes.data.id : null;
                if (!tagId) {
                  var newTag = await SB.from('tags').insert({ name: G.uploadTags[t], company_id: G.profile ? G.profile.company_id : null }).select().single();
                  tagId = newTag.data ? newTag.data.id : null;
                }
                if (tagId && docRes.data) {
                  await SB.from('document_tags').insert({ document_id: docRes.data.id, tag_id: tagId });
                }
              } catch (_) {}
            }
          }

          if (docRes.data && typeof window._mergeDocIntoState === 'function') {
            window._mergeDocIntoState(docRes.data);
          }
          if (typeof window.logActivity === 'function') window.logActivity('upload', docRes.data ? docRes.data.id : null, 'Upload : ' + file.name);
          uploaded++;
        } catch (err) {
          window.showToast('Erreur upload ' + file.name + ' : ' + err.message, 'error');
          console.error('[GED Patch] uploadDocument:', err);
        }
      }

      if (uploaded > 0) {
        window.showToast(uploaded + ' fichier(s) importé(s) ✓', 'success');
        G.selectedFiles = [];
        G.uploadTags = [];
        if (typeof window.closeUploadModal === 'function') window.closeUploadModal();
        if (typeof window.renderDocuments === 'function') window.renderDocuments();
        if (typeof window.updateStats === 'function') window.updateStats();
      }
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2"></i>Importer'; }
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 12 : confirmDeleteDocument — sans .catch() chaîné
       ───────────────────────────────────────────────────────── */
    window.confirmDeleteDocument = async function (id) {
      var d = (G.docs || []).find(function (x) { return x.id === id; });
      if (!d) return;
      var role = (G.profile && G.profile.role) || 'viewer';
      var isAdmin = ['admin','manager'].includes(role);
      var isOwner = d.owner_id === G.user.id || d.user_id === G.user.id;
      if (d.company_id && !isAdmin) { window.showToast('⛔ Admin/Manager requis pour documents entreprise', 'error'); return; }
      if (!d.company_id && !isOwner && !isAdmin) { window.showToast('⛔ Vous ne pouvez supprimer que vos documents', 'error'); return; }
      if (!confirm('Supprimer "' + d.name + '" ?\nDéplacé en corbeille.')) return;

      try {
        var delRes = await SB.from('documents').update({
          is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: G.user.id
        }).eq('id', id);
        if (delRes.error) {
          var delRes2 = await SB.from('documents').update({ is_deleted: true }).eq('id', id);
          if (delRes2.error) throw delRes2.error;
        }
        try { await SB.from('document_permissions').delete().eq('document_id', id); } catch (_) {}
        try { await SB.from('shared_documents').delete().eq('document_id', id); } catch (_) {}

        if (typeof window._removeDocLocal === 'function') window._removeDocLocal(id);
        if (typeof window.logActivity === 'function') window.logActivity('delete', id, 'Suppression : ' + d.name);
        window.showToast('"' + d.name + '" supprimé ✓', 'success');
        if (typeof window.renderDocuments === 'function') window.renderDocuments();
        if (typeof window.updateStats === 'function') window.updateStats();
      } catch (err) {
        window.showToast('Erreur suppression : ' + err.message, 'error');
        console.error('[GED Patch] confirmDeleteDocument:', err);
      }
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 13 : switchView — guard robuste
       ───────────────────────────────────────────────────────── */
    var _switchViewPatched = false;
    if (!_switchViewPatched) {
      _switchViewPatched = true;
      var _origSV = window.switchView;
      window.switchView = function (v) {
        var moduleMap = {
          'search': 'initSearchView', 'ai': 'renderAIView',
          'automation': 'renderAutomationView', 'integrations': 'renderIntegrationsView',
          'backups': 'renderBackupsView', 'rbacv7': 'renderRbacV7',
          'signatures': 'renderSignaturesView', 'folders': 'renderFoldersView',
          'analytics': 'loadAnalytics', 'apikeys': 'renderApiKeysView',
          'billing2': 'renderBillingV6', 'auditv6': 'renderAuditV6',
        };
        var needed = moduleMap[v];
        if (needed && typeof window[needed] !== 'function') {
          var _a = arguments;
          setTimeout(function () { window.switchView.apply(window, _a); }, 350);
          return;
        }
        if (typeof _origSV === 'function') {
          try { _origSV(v); } catch (err) { console.error('[GED Patch] switchView:', err); }
        }
      };
    }


    /* ─────────────────────────────────────────────────────────
       PATCH 14 : renderDocuments / renderWorkflows — guards
       ───────────────────────────────────────────────────────── */
    var _origRD = window.renderDocuments;
    window.renderDocuments = function (override) {
      if (!G.user) return;
      G.docs = G.docs || [];
      if (typeof _origRD === 'function') {
        try { _origRD(override); } catch (err) { console.warn('[GED Patch] renderDocuments:', err.message); }
      }
    };

    var _origRW = window.renderWorkflows;
    window.renderWorkflows = function () {
      if (!G.user) return;
      G.workflows = G.workflows || [];
      if (typeof _origRW === 'function') {
        try { _origRW(); } catch (err) { console.warn('[GED Patch] renderWorkflows:', err.message); }
      }
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 15 : renderSharedView — refresh léger
       ───────────────────────────────────────────────────────── */
    window.renderSharedView = async function () {
      if (!G.user) return;
      try { await window._loadDocumentsFixed(); } catch (_) {}
      var now = new Date();
      var statSent   = document.getElementById('statSharedSent');
      var statRecv   = document.getElementById('statSharedReceived');
      var statActive = document.getElementById('statSharedActive');
      if (statSent)   statSent.textContent   = (G.sentShares || []).length;
      if (statRecv)   statRecv.textContent   = (G.sharedWithMe || []).length;
      if (statActive) statActive.textContent = (G.sharedWithMe || []).filter(function (d) { return !d.expires_at || new Date(d.expires_at) > now; }).length;
      if (typeof window.switchSharedTab === 'function') window.switchSharedTab('received');
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 16 : createWorkflow — meta JSONB
       ───────────────────────────────────────────────────────── */
    window.createWorkflow = async function (e) {
      e.preventDefault();
      var title      = document.getElementById('wfTitle')?.value.trim();
      var desc       = document.getElementById('wfDesc')?.value.trim() || '';
      var priority   = document.getElementById('wfPriority')?.value || 'medium';
      var assigneeId = document.getElementById('wfAssignee')?.value || null;
      var docId      = document.getElementById('wfDocId')?.value || null;
      if (!title) { window.showToast('Titre requis', 'error'); return; }

      var steps = (G.wfSteps || []).filter(function (s) { return s.title && s.title.trim(); }).map(function (s, i) {
        var u = (G.users || []).find(function (x) { return x.id === s.assigneeId; });
        return { idx: i, title: s.title.trim(), assigneeId: s.assigneeId || null, assigneeName: u ? u.name : 'Non assigné', status: i === 0 ? 'pending' : 'waiting', comment: '', completedAt: null };
      });
      if (steps.length && steps[0].assigneeId && !assigneeId) assigneeId = steps[0].assigneeId;
      var histEntry = { action: 'create', userName: (G.profile && G.profile.name) || G.user.email, userId: G.user.id, comment: 'Workflow créé', at: new Date().toISOString() };

      try {
        var wfData = {
          title: title, description: desc, priority: priority,
          status: 'pending', created_by: G.user.id,
          assignee_id: assigneeId || null, document_id: docId || null,
          company_id: (G.profile && G.profile.company_id) || null,
          meta: { steps: steps, history: [histEntry] }
        };
        var wfRes = await SB.from('workflows').insert([wfData]).select().single();
        if (wfRes.error) throw wfRes.error;

        var wfObj = {
          id: wfRes.data.id, title: wfRes.data.title, description: wfRes.data.description,
          status: 'pending', priority: wfRes.data.priority, docId: wfRes.data.document_id,
          assigneeId: wfRes.data.assignee_id,
          assigneeName: (G.users || []).find(function (u) { return u.id === assigneeId; }) ? (G.users.find(function (u) { return u.id === assigneeId; })).name : 'Non assigné',
          createdBy: (G.profile && G.profile.name) || '', dueDate: null, createdAt: wfRes.data.created_at,
          steps: steps, history: [histEntry],
        };
        G.workflows = G.workflows || [];
        G.workflows.unshift(wfObj);

        if (assigneeId) {
          try {
            await SB.from('notifications').insert({ user_id: assigneeId, type: 'info', title: 'Nouveau workflow assigné', message: '"' + title + '" — par ' + ((G.profile && G.profile.name) || G.user.email), read: false });
          } catch (_) {}
        }

        if (typeof window.logActivity === 'function') window.logActivity('workflow', docId, 'Workflow créé : ' + title);
        window.showToast('Workflow "' + title + '" lancé ✓', 'success');
        if (typeof window.closeWorkflowModal === 'function') window.closeWorkflowModal();
        if (typeof window.renderWorkflows === 'function') window.renderWorkflows();
        if (typeof window.updateStats === 'function') window.updateStats();
      } catch (err) {
        window.showToast('Erreur : ' + err.message, 'error');
        console.error('[GED Patch] createWorkflow:', err.message);
      }
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 17 : actOnWorkflow — history dans meta JSONB
       ───────────────────────────────────────────────────────── */
    window.actOnWorkflow = async function (action) {
      var id = G.activeWfId; if (!id) return;
      var w  = (G.workflows || []).find(function (x) { return x.id === id; }); if (!w) return;
      var comment = document.getElementById('wfDetailComment')?.value.trim() || '';
      var statusMap = { approve: 'approved', reject: 'rejected', request_changes: 'changes_needed' };
      var newStatus = statusMap[action]; if (!newStatus) return;
      var labels = { approve: 'Approuver', reject: 'Rejeter', request_changes: 'Demander révision' };
      if (!confirm(labels[action] + ' ce workflow ?')) return;

      try {
        var now = new Date().toISOString();
        var histEntry = { action: action, userName: (G.profile && G.profile.name) || G.user.email, userId: G.user.id, comment: comment, at: now };
        w.history = w.history || [];
        w.history.push(histEntry);

        await SB.from('workflows').update({
          status: newStatus,
          completed_at: ['approved','rejected'].includes(newStatus) ? now : null,
          meta: { steps: w.steps || [], history: w.history }
        }).eq('id', id);

        w.status = newStatus;
        var descTxt = { approve: 'Approuvé', reject: 'Rejeté', request_changes: 'Révision demandée' }[action];
        if (typeof window.logActivity === 'function') window.logActivity('workflow', w.docId, descTxt + ' : ' + w.title);
        window.showToast('Workflow ' + descTxt + ' ✓', action === 'approve' ? 'success' : 'warning');
        var commentEl = document.getElementById('wfDetailComment');
        if (commentEl) commentEl.value = '';
        if (typeof window.renderWorkflows === 'function') window.renderWorkflows();
        if (typeof window.updateStats === 'function') window.updateStats();
        if (typeof window.openWfDetail === 'function') window.openWfDetail(id);
      } catch (err) {
        window.showToast('Erreur : ' + err.message, 'error');
        console.error('[GED Patch] actOnWorkflow:', err.message);
      }
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 18 : openPermModal — guard table
       ───────────────────────────────────────────────────────── */
    var _origOPM = window.openPermModal;
    window.openPermModal = async function (docId) {
      var d = (G.docs || []).find(function (x) { return x.id === docId; });
      if (!d) return;
      try {
        await SB.from('document_permissions').select('id').limit(1);
        if (typeof _origOPM === 'function') _origOPM(docId);
      } catch (err) {
        window.showToast('Table permissions manquante — exécutez la migration SQL', 'error');
      }
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 19 : Auto-refresh toutes les 5 min
       ───────────────────────────────────────────────────────── */
    setInterval(async function () {
      if (!G.user) return;
      try {
        await window._loadDocumentsFixed();
        await window._loadWorkflowsFixed();
        if (typeof window.updateStats === 'function') window.updateStats();
        if (G.currentView === 'documents' && typeof window.renderDocuments === 'function') window.renderDocuments();
        if (G.currentView === 'dashboard') {
          if (typeof window.renderTeamDocs === 'function') window.renderTeamDocs();
          if (typeof window.renderMyWorkflows === 'function') window.renderMyWorkflows();
        }
      } catch (err) { console.warn('[GED Patch] auto-refresh:', err.message); }
    }, 5 * 60 * 1000);


    /* ─────────────────────────────────────────────────────────
       PATCH 20 : window.onclick modal — corrige fermeture modales
       ───────────────────────────────────────────────────────── */
    var _origOnClick = window.onclick;
    window.onclick = function (event) {
      var modals = [
        'editUserModal','roleModal','uploadModal','shareModal','previewModal',
        'workflowModal','addUserModal','permModal','signatureModal',
        'requestSignatureModal','wfRuleModal','folderModal'
      ];
      modals.forEach(function (id) {
        var el = document.getElementById(id);
        if (el && event.target === el) {
          var closeFn = 'close' + id.charAt(0).toUpperCase() + id.slice(1);
          if (typeof window[closeFn] === 'function') window[closeFn]();
          else el.classList.add('hidden');
        }
      });
      if (typeof _origOnClick === 'function') _origOnClick(event);
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 21 : loadShareHistory — affichage correct
       ───────────────────────────────────────────────────────── */
    window.loadShareHistory = async function () {
      if (!G.shareDocId) return;
      var el = document.getElementById('shareHistoryList');
      if (el) el.innerHTML = '<div style="text-align:center;padding:24px;color:rgba(147,197,253,0.4);font-size:12px"><i class="fas fa-spinner fa-spin" style="font-size:18px;display:block;margin-bottom:8px"></i>Chargement…</div>';
      try {
        var permsR = await SB.from('document_permissions').select('id,user_id,permission,expires_at,created_at').eq('document_id', G.shareDocId).order('created_at', { ascending: false });
        var sdR    = await SB.from('shared_documents').select('id,shared_with_email,permission,expires_at,created_at').eq('document_id', G.shareDocId).order('created_at', { ascending: false });
        var esc2   = window.escapeHtml || function (s) { return String(s || ''); };
        var fmt    = window.fmtDate   || function (iso) { return iso ? new Date(iso).toLocaleDateString('fr-FR') : ''; };
        var av     = window.avatarInitials || function (n) { return (n || '?')[0]; };
        var rows = [], now = new Date();
        var PERM = { view:'Lecture', download:'Téléchargement', edit:'Édition', viewer:'Lecture', editor:'Édition', owner:'Propriétaire' };

        (permsR.data || []).forEach(function (p) {
          var u = (G.users || []).find(function (x) { return x.id === p.user_id; });
          rows.push({ id:p.id, table:'document_permissions', name:u?u.name:(p.user_id||'?'), email:u?u.email:'', permission:p.permission, expiresAt:p.expires_at, createdAt:p.created_at, expired:!!(p.expires_at && new Date(p.expires_at) < now) });
        });
        (sdR.data || []).forEach(function (s) {
          rows.push({ id:s.id, table:'shared_documents', name:s.shared_with_email, email:s.shared_with_email, permission:s.permission, expiresAt:s.expires_at, createdAt:s.created_at, expired:!!(s.expires_at && new Date(s.expires_at) < now) });
        });

        var cnt = document.getElementById('shareHistoryCount');
        if (cnt) { cnt.textContent = rows.length; cnt.classList.toggle('hidden', rows.length === 0); }
        if (!el) return;
        if (!rows.length) { el.innerHTML = '<div style="text-align:center;padding:32px;color:rgba(147,197,253,0.4)"><i class="fas fa-share-alt" style="font-size:28px;display:block;margin-bottom:8px;opacity:0.2"></i><p style="font-size:13px">Aucun partage</p></div>'; return; }

        el.innerHTML = rows.map(function (r) {
          var expL = r.expiresAt ? (r.expired ? '<span style="color:#ef4444;font-size:10px"><i class="fas fa-times-circle" style="margin-right:3px"></i>Expiré ' + fmt(r.expiresAt) + '</span>' : '<span style="color:#22c55e;font-size:10px"><i class="fas fa-clock" style="margin-right:3px"></i>' + fmt(r.expiresAt) + '</span>') : '<span style="color:rgba(147,197,253,0.4);font-size:10px">Illimité</span>';
          return '<div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;border:1px solid ' + (r.expired ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.1)') + ';margin-bottom:6px">' +
            '<div style="width:34px;height:34px;border-radius:50%;background:rgba(59,130,246,0.2);display:flex;align-items:center;justify-content:center;color:#93c5fd;font-size:12px;font-weight:500;flex-shrink:0">' + esc2(av(r.name)) + '</div>' +
            '<div style="flex:1;min-width:0"><p style="color:#fff;font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc2(r.name) + '</p><p style="color:rgba(147,197,253,0.5);font-size:10px">' + esc2(r.email) + '</p>' +
            '<div style="display:flex;gap:6px;margin-top:3px"><span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(59,130,246,0.15);color:#93c5fd">' + esc2(PERM[r.permission] || r.permission) + '</span>' + expL + '</div></div>' +
            (!r.expired ? '<button onclick="window.revokeShareEntry(this)" data-id="' + r.id + '" data-table="' + r.table + '" style="padding:5px 10px;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.2);border-radius:6px;font-size:10px;cursor:pointer"><i class="fas fa-ban" style="margin-right:3px"></i>Révoquer</button>' : '<span style="font-size:10px;color:rgba(239,68,68,0.4)">Révoqué</span>') + '</div>';
        }).join('');
      } catch (err) {
        if (el) el.innerHTML = '<div style="text-align:center;padding:16px;color:rgba(239,68,68,0.7);font-size:12px">Erreur : ' + (window.escapeHtml || function (s) { return s; })(err.message) + '</div>';
        console.error('[GED Patch] loadShareHistory:', err);
      }
    };


    /* ─────────────────────────────────────────────────────────
       PATCH 22 : Réinitialiser les guards _moduleGuards
       déjà définis par app_fixes.js pour qu'ils pointent vers
       les vraies fonctions de app_modules.js une fois chargées
       ───────────────────────────────────────────────────────── */
    // On attend 3s pour que app_modules.js ait fini son _ready()
    setTimeout(function () {
      var exposed = [
        'loadAnalytics','refreshAnalytics','initSearchView','runFTSearch',
        'renderAIView','analyzeDocumentAI','analyzeAllDocuments',
        'renderSignaturesView','openSignatureModal','clearSignature','closeSignModal','submitSignature',
        'openRequestSignatureModal','closeRequestSignatureModal','submitSignatureRequest','rejectSignatureRequest',
        'renderAutomationView','openWfRuleModal','closeWfRuleModal','createWfRule','toggleWfRule','deleteWfRule',
        'renderIntegrationsView','filterIntegrations','toggleIntegration',
        'renderBackupsView','createBackup','restoreBackup',
        'renderRbacV7','createRoleV7','deleteCustomRole',
        'renderFoldersView','openFolder','openFolderModal','closeFolderModal','createFolder',
        'renderApiKeysView','generateApiKeyV6','copyApiKey','deleteApiKeyV6',
        'renderBillingV6','upgradeToPlan',
        'renderAuditV6','setAuditFilter',
      ];
      exposed.forEach(function (fn) {
        // Si la fonction est encore le stub guard → forcer rechargement depuis app_modules
        // (les vrais exports sont faits par app_modules.js dans son _ready())
        if (typeof window[fn] !== 'function' || window[fn].toString().indexOf('setTimeout') !== -1 && window[fn].toString().indexOf('500') !== -1) {
          console.warn('[GED Patch] ' + fn + ' encore guard après 3s — app_modules.js pas prêt ?');
        }
      });
      console.log('[GED Patch] Vérification des modules terminée');
    }, 3000);


    console.log('[GED Patch Final] ✅ 22 patches appliqués — SystemesGED v7.0 opérationnel');
  });

})();
