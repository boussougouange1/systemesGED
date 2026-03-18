/**
 * SystemesGED — app_fixes_v2.js
 * Correctifs JS ciblés — version 2
 * Remplace app_fixes.js (ou ajouter après dans index.html)
 *
 * Corrections :
 *  1. confirmDeleteDocument — ".catch is not a function" → try/catch
 *  2. _loadWorkflows         — FK nommée → requête sans jointure
 *  3. loadAnalytics          — timeout + fallback données locales
 *  4. renderBackupsView      — ne plus bloquer si company_id absent
 *  5. createFolder           — debug + fallback company_id null
 *  6. loadShareHistory       — afficher l'historique correctement
 *  7. renderAIView           — ne plus bloquer en chargement
 *  8. Suppression doc        — UI update immédiate sans rechargement
 */

(function () {
  'use strict';

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
    // FIX 1 : confirmDeleteDocument
    // Problème : ".catch is not a function" sur Supabase JS v2
    // Supabase v2 ne supporte PAS .catch() chaîné sur les queries
    // ──────────────────────────────────────────────────────
    window.confirmDeleteDocument = async function (id) {
      var d = G.docs.find(function (x) { return x.id === id; });
      if (!d) return;

      var role = G.profile?.role || 'viewer';
      var isAdmin = ['admin', 'manager'].includes(role);
      var isOwner = d.owner_id === G.user?.id || d.user_id === G.user?.id;
      var isCompanyDoc = !!d.company_id;

      if (isCompanyDoc && !isAdmin) {
        window.showToast('⛔ Documents entreprise : Admin/Manager requis', 'error');
        return;
      }
      if (!isCompanyDoc && !isOwner && !isAdmin) {
        window.showToast('⛔ Vous ne pouvez supprimer que vos propres documents', 'error');
        return;
      }

      var msg = isCompanyDoc
        ? 'Supprimer "' + d.name + '" ?\nDéplacé en corbeille (restaurable par Admin).'
        : 'Supprimer "' + d.name + '" ?\nDéplacé en corbeille.';
      if (!confirm(msg)) return;

      try {
        // Soft delete
        var { error } = await SB.from('documents').update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: G.user.id
        }).eq('id', id);

        if (error) {
          // Fallback sans les colonnes optionnelles
          var { error: e2 } = await SB.from('documents')
            .update({ is_deleted: true }).eq('id', id);
          if (e2) throw e2;
        }

        // Révoquer partages — try/catch individuel (pas .catch())
        try {
          await SB.from('document_permissions').delete().eq('document_id', id);
        } catch (_) {}
        try {
          await SB.from('shared_documents').delete().eq('document_id', id);
        } catch (_) {}

        // Retirer immédiatement de l'UI sans reload
        if (typeof window._removeDocLocal === 'function') {
          window._removeDocLocal(id);
        }

        if (typeof window._logActivity === 'function') {
          window._logActivity('delete', id, 'Suppression : ' + d.name);
        }
        window.showToast('"' + d.name + '" supprimé ✓', 'success');

        // Mettre à jour l'UI immédiatement
        if (typeof window.renderDocuments === 'function') window.renderDocuments();
        if (typeof window.updateStats === 'function') window.updateStats();

      } catch (err) {
        window.showToast('Erreur suppression : ' + err.message, 'error');
        console.error('[GED Fix v2] confirmDeleteDocument:', err);
      }
    };


    // ──────────────────────────────────────────────────────
    // FIX 2 : _loadWorkflows sans FK nommée
    // Problème : "column full_name does not exist" car les FK
    // workflows_assignee_id_fkey / workflows_created_by_fkey
    // n'existent pas encore ou pointent vers auth.users et non users_profiles
    // ──────────────────────────────────────────────────────
    window._loadWorkflows = async function () {
      try {
        // Requête simple SANS jointure FK nommée
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

        // Résoudre les noms depuis G.users (déjà en mémoire)
        G.workflows = (data || []).map(function (w) {
          var assignee = (G.users || []).find(function (u) { return u.id === w.assignee_id; });
          var creator  = (G.users || []).find(function (u) { return u.id === w.created_by; });
          var meta = w.meta || {};
          return {
            id:           w.id,
            title:        w.title,
            description:  w.description,
            status:       w.status || 'pending',
            priority:     w.priority || 'medium',
            docId:        w.document_id,
            assigneeId:   w.assignee_id,
            assigneeName: assignee ? (assignee.name || assignee.email || 'Non assigné') : 'Non assigné',
            createdBy:    creator  ? (creator.name  || creator.email  || '?') : '?',
            dueDate:      w.due_date || null,
            createdAt:    w.created_at,
            approvers:    w.approvers || [],
            steps:        meta.steps   || [],
            history:      meta.history || [],
          };
        });
        console.log('[GED Fix v2] workflows chargés:', G.workflows.length);
      } catch (err) {
        console.error('[GED Fix v2] _loadWorkflows:', err.message);
        G.workflows = G.workflows || [];
      }
    };


    // ──────────────────────────────────────────────────────
    // FIX 3 : loadAnalytics — débloquer le chargement infini
    // Problème : la requête SB échoue silencieusement si
    // company_id est null, laissant les spinners actifs
    // ──────────────────────────────────────────────────────
    window.loadAnalytics = async function () {
      var set$ = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
      var html$ = function (id, v) { var e = document.getElementById(id); if (e) e.innerHTML = v; };

      set$('analyticsLoading', 'Chargement…');

      // Toujours utiliser les données locales en premier (jamais de blocage)
      var docs  = G.docs        || [];
      var logs  = G.auditLogs   || [];
      var wfs   = G.workflows   || [];
      var users = G.users       || [];

      // Tentative DB en arrière-plan (non bloquant)
      if (G.profile?.company_id) {
        try {
          var since = new Date(Date.now() - 14 * 86400000).toISOString();
          var { data: freshLogs } = await Promise.race([
            SB.from('activity_logs')
              .select('action,created_at,user_id,document_id')
              .eq('company_id', G.profile.company_id)
              .gte('created_at', since)
              .order('created_at'),
            new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, 5000); })
          ]);
          if (freshLogs && freshLogs.length > 0) logs = freshLogs;
        } catch (err) {
          console.warn('[GED Fix v2] analytics DB timeout, données locales utilisées');
        }
      }

      // Calculs KPI
      var totalSize   = docs.reduce(function (s, d) { return s + (d.file_size || 0); }, 0);
      var uploads14   = logs.filter(function (l) { return l.action === 'upload'; }).length;
      var downloads14 = logs.filter(function (l) { return l.action === 'download'; }).length;
      var now7        = new Date(Date.now() - 7 * 86400000);
      var activeUsers = users.filter(function (u) { return u.last_login && new Date(u.last_login) > now7; }).length;
      var wfDone      = wfs.filter(function (w) { return w.status === 'approved'; }).length;
      var wfRate      = wfs.length ? Math.round(wfDone / wfs.length * 100) : 0;
      var pendingWf   = wfs.filter(function (w) { return w.status === 'pending'; }).length;

      var fmt = window.formatFileSize || function (b) { return b + ' B'; };

      // KPI cards
      html$('analyticsKpiCards',
        _kpi('fa-file-alt', 'blue',   docs.length,  'Documents',   fmt(totalSize)) +
        _kpi('fa-upload',   'green',  uploads14,    'Uploads 14j', 'importations') +
        _kpi('fa-users',    'cyan',   activeUsers + '/' + users.length, 'Actifs 7j', 'utilisateurs') +
        _kpi('fa-clock',    'orange', pendingWf,    'Workflows',   wfRate + '% approuvés')
      );

      // Graphique activité 14j
      var days = [];
      for (var i = 13; i >= 0; i--) {
        var d   = new Date(Date.now() - i * 86400000);
        var key = d.toISOString().slice(0, 10);
        var cnt = logs.filter(function (l) { return (l.created_at || '').startsWith(key); }).length;
        days.push({ label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), count: cnt });
      }
      var maxC = Math.max(1, Math.max.apply(null, days.map(function (d) { return d.count; })));
      html$('analyticsActivityChart',
        '<div style="display:flex;align-items:flex-end;gap:3px;height:96px;width:100%;padding:0 4px">' +
        days.map(function (d) {
          var h   = Math.max(4, Math.round(d.count / maxC * 88));
          var col = d.count > 0 ? '#3b82f6' : 'rgba(59,130,246,0.15)';
          return '<div style="display:flex;flex-direction:column;align-items:center;flex:1;gap:2px">' +
            '<span style="font-size:9px;color:rgba(147,197,253,0.5)">' + (d.count || '') + '</span>' +
            '<div style="width:100%;background:' + col + ';border-radius:2px 2px 0 0;height:' + h + 'px"></div>' +
            '<span style="font-size:9px;color:rgba(147,197,253,0.3)">' + d.label.split('/')[0] + '</span>' +
          '</div>';
        }).join('') + '</div>'
      );

      // Workflow stats
      var wfStats = [
        { label: 'En attente',  count: pendingWf, color: '#f97316' },
        { label: 'Approuvés',   count: wfDone,    color: '#22c55e' },
        { label: 'Rejetés',     count: wfs.filter(function (w) { return w.status === 'rejected'; }).length,  color: '#ef4444' },
        { label: 'En révision', count: wfs.filter(function (w) { return w.status === 'in_review'; }).length, color: '#3b82f6' },
      ];
      var wfTotal = Math.max(1, wfs.length);
      html$('analyticsWorkflowChart',
        !wfs.length
          ? '<p style="color:rgba(147,197,253,0.4);font-size:12px;text-align:center;padding:16px">Aucun workflow</p>'
          : wfStats.filter(function (s) { return s.count > 0; }).map(function (s) {
            var pct = Math.round(s.count / wfTotal * 100);
            return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
              '<div style="width:8px;height:8px;border-radius:50%;background:' + s.color + ';flex-shrink:0"></div>' +
              '<div style="flex:1"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">' +
              '<span style="color:rgba(147,197,253,0.6)">' + s.label + '</span>' +
              '<span style="color:#fff;font-weight:500">' + s.count + '</span></div>' +
              '<div style="height:4px;background:rgba(15,23,42,0.5);border-radius:2px">' +
              '<div style="height:4px;border-radius:2px;background:' + s.color + ';width:' + pct + '%"></div></div></div></div>';
          }).join('')
      );

      // Top docs
      var docAct = {};
      logs.forEach(function (l) { if (l.document_id) docAct[l.document_id] = (docAct[l.document_id] || 0) + 1; });
      var topDocs = docs.map(function (d) { return { doc: d, count: docAct[d.id] || 0 }; })
        .sort(function (a, b) { return b.count - a.count; }).slice(0, 6);
      var fi = window.getFileIcon || function () { return { icon: 'fa-file', color: 'text-gray-400', bg: 'bg-gray-500/20', border: 'border-gray-400/30' }; };
      var esc = window.escapeHtml || function (s) { return String(s || ''); };
      html$('analyticsTopDocs',
        !topDocs.length
          ? '<p style="color:rgba(147,197,253,0.4);font-size:12px;text-align:center;padding:16px">Aucun document</p>'
          : topDocs.map(function (item) {
            var icon = fi(item.doc.name || '');
            return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(59,130,246,0.06)">' +
              '<div style="width:28px;height:28px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center" class="' + icon.bg + ' ' + icon.color + '">' +
              '<i class="fas ' + icon.icon + '" style="font-size:11px"></i></div>' +
              '<div style="flex:1;min-width:0"><p style="color:#fff;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(item.doc.name) + '</p>' +
              '<div style="height:3px;background:rgba(15,23,42,0.5);border-radius:2px;margin-top:3px">' +
              '<div style="height:3px;border-radius:2px;background:linear-gradient(90deg,#3b82f6,#06b6d4);width:' + Math.round(item.count / Math.max(1, topDocs[0].count) * 100) + '%"></div></div></div>' +
              '<span style="color:rgba(147,197,253,0.4);font-size:10px">' + item.count + '</span></div>';
          }).join('')
      );

      // Top users
      var userAct = {};
      logs.forEach(function (l) { if (l.user_id) userAct[l.user_id] = (userAct[l.user_id] || 0) + 1; });
      var topUsers = users.map(function (u) { return { user: u, count: userAct[u.id] || 0 }; })
        .sort(function (a, b) { return b.count - a.count; }).slice(0, 6);
      var av = window.avatarInitials || function (n) { return (n || '?')[0].toUpperCase(); };
      html$('analyticsTopUsers',
        !topUsers.length
          ? '<p style="color:rgba(147,197,253,0.4);font-size:12px;text-align:center;padding:16px">Aucun utilisateur</p>'
          : topUsers.map(function (item, i) {
            var medals = ['🥇', '🥈', '🥉'];
            return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(59,130,246,0.06)">' +
              '<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,rgba(59,130,246,0.3),rgba(168,85,247,0.3));display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:500;flex-shrink:0">' +
              esc(av(item.user.name)) + '</div>' +
              '<div style="flex:1;min-width:0"><p style="color:#fff;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
              (medals[i] || '') + ' ' + esc(item.user.name) + '</p>' +
              '<div style="height:3px;background:rgba(15,23,42,0.5);border-radius:2px;margin-top:3px">' +
              '<div style="height:3px;border-radius:2px;background:linear-gradient(90deg,#a855f7,#ec4899);width:' + Math.round(item.count / Math.max(1, topUsers[0].count) * 100) + '%"></div></div></div>' +
              '<span style="color:rgba(147,197,253,0.4);font-size:10px">' + item.count + '</span></div>';
          }).join('')
      );

      // Mettre à jour les compteurs dashboard
      var dashTotalViews = document.getElementById('dashTotalViews');
      if (dashTotalViews) dashTotalViews.textContent = downloads14;
      var dashActiveUsers = document.getElementById('dashActiveUsers');
      if (dashActiveUsers) dashActiveUsers.textContent = activeUsers;

      set$('analyticsLoading', '');
    };

    function _kpi(icon, color, val, label, sub) {
      var clrs = { blue: '#3b82f6', green: '#22c55e', cyan: '#06b6d4', orange: '#f97316', purple: '#a855f7' };
      var c = clrs[color] || '#3b82f6';
      return '<div style="background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.15);border-radius:12px;padding:14px">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
        '<i class="fas ' + icon + '" style="color:' + c + ';font-size:13px"></i>' +
        '<span style="color:rgba(147,197,253,0.5);font-size:11px">' + label + '</span></div>' +
        '<p style="color:#fff;font-size:22px;font-weight:500;margin:0">' + val + '</p>' +
        '<p style="color:rgba(147,197,253,0.4);font-size:10px;margin:3px 0 0">' + sub + '</p></div>';
    }


    // ──────────────────────────────────────────────────────
    // FIX 4 : renderBackupsView — débloquer le chargement
    // ──────────────────────────────────────────────────────
    window.renderBackupsView = async function () {
      var set$ = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
      var html$ = function (id, v) { var e = document.getElementById(id); if (e) e.innerHTML = v; };

      G.backups = G.backups || [];

      try {
        var q = SB.from('backups').select('*').order('created_at', { ascending: false }).limit(20);
        // Ne filtrer par company_id que si l'utilisateur en a un
        if (G.profile?.company_id) {
          q = q.eq('company_id', G.profile.company_id);
        } else {
          q = q.eq('created_by', G.user.id);
        }
        var { data } = await q;
        if (data) G.backups = data;
      } catch (err) {
        console.warn('[GED Fix v2] renderBackupsView:', err.message);
      }

      var last = G.backups.find(function (b) { return b.status === 'completed'; });
      var fmtDate = window.fmtDate || function (iso) { return iso ? new Date(iso).toLocaleDateString('fr-FR') : ''; };
      set$('backupStats', G.backups.length + ' sauvegarde(s)' + (last ? ' · Dernière : ' + fmtDate(last.created_at) : ''));

      var el = document.getElementById('backupsList');
      if (!el) return;

      if (!G.backups.length) {
        el.innerHTML = '<div style="text-align:center;padding:48px;color:rgba(147,197,253,0.4)">' +
          '<i class="fas fa-database" style="font-size:36px;display:block;margin-bottom:12px;opacity:0.2"></i>' +
          '<p style="font-size:14px">Aucune sauvegarde</p>' +
          '<p style="font-size:12px;margin-top:6px">Cliquez "Sauvegarde complète" pour commencer</p></div>';
        return;
      }

      var SC = {
        completed: { c: 'color:#22c55e', icon: 'fa-check-circle', label: 'Réussie' },
        running:   { c: 'color:#3b82f6', icon: 'fa-spinner fa-spin', label: 'En cours' },
        failed:    { c: 'color:#ef4444', icon: 'fa-times-circle', label: 'Échec' }
      };
      var fmt = window.formatFileSize || function (b) { return b + ' B'; };
      var esc = window.escapeHtml || function (s) { return String(s || ''); };

      el.innerHTML = G.backups.map(function (b) {
        var sc = SC[b.status] || SC.completed;
        return '<div style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:12px;border:1px solid rgba(20,184,166,0.15);margin-bottom:8px">' +
          '<div style="width:40px;height:40px;background:rgba(20,184,166,0.15);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#14b8a6;flex-shrink:0">' +
          '<i class="fas fa-database"></i></div>' +
          '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">' +
          '<p style="color:#fff;font-size:13px;font-weight:500">' + (b.type === 'full' ? '📦 Complète' : '📄 Documents') + '</p>' +
          '<span style="' + sc.c + ';font-size:10px"><i class="fas ' + sc.icon + '"></i> ' + sc.label + '</span></div>' +
          '<p style="color:rgba(147,197,253,0.4);font-size:11px">' + fmtDate(b.created_at) +
          (b.size ? ' · ' + fmt(b.size) : '') + (b.doc_count ? ' · ' + b.doc_count + ' docs' : '') + '</p></div>' +
          (b.status === 'completed'
            ? '<button onclick="window.restoreBackup(\'' + b.id + '\')" style="padding:6px 12px;background:rgba(20,184,166,0.15);color:#14b8a6;border:1px solid rgba(20,184,166,0.2);border-radius:8px;font-size:11px;cursor:pointer">' +
              '<i class="fas fa-undo" style="margin-right:4px"></i>Restaurer</button>'
            : '') +
          '</div>';
      }).join('');
    };


    // ──────────────────────────────────────────────────────
    // FIX 5 : createFolder — déboguer et forcer l'ouverture
    // ──────────────────────────────────────────────────────
    window.createFolder = async function () {
      var nameEl = document.getElementById('newFolderName');
      var name = nameEl ? nameEl.value.trim() : '';
      if (!name) { window.showToast('Nom du dossier requis', 'error'); return; }

      try {
        var payload = {
          name: name,
          parent_id: G.currentFolderId || null,
          company_id: G.profile?.company_id || null,
          created_by: G.user.id
        };
        console.log('[GED Fix v2] createFolder payload:', payload);

        var { data, error } = await SB.from('folders').insert([payload]).select().single();
        if (error) throw error;

        G.folders = G.folders || [];
        G.folders.push(data);
        if (nameEl) nameEl.value = '';

        window.showToast('✅ Dossier "' + name + '" créé', 'success');

        // Fermer le modal
        var modal = document.getElementById('folderModal');
        if (modal) modal.classList.add('hidden');

        // Rafraîchir la vue
        if (typeof window.renderFoldersView === 'function') window.renderFoldersView();

      } catch (err) {
        window.showToast('Erreur création dossier : ' + err.message, 'error');
        console.error('[GED Fix v2] createFolder:', err);
      }
    };

    // S'assurer que openFolderModal est bien exposé
    window.openFolderModal = function () {
      var modal = document.getElementById('folderModal');
      if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        var nameEl = document.getElementById('newFolderName');
        if (nameEl) { nameEl.value = ''; nameEl.focus(); }
      } else {
        console.error('[GED Fix v2] folderModal introuvable dans le DOM');
      }
    };
    window.closeFolderModal = function () {
      var modal = document.getElementById('folderModal');
      if (modal) modal.classList.add('hidden');
      document.body.style.overflow = '';
    };


    // ──────────────────────────────────────────────────────
    // FIX 6 : loadShareHistory — afficher l'historique
    // ──────────────────────────────────────────────────────
    window.loadShareHistory = async function () {
      if (!G.shareDocId) return;
      var el = document.getElementById('shareHistoryList');
      if (el) el.innerHTML = '<div style="text-align:center;padding:24px;color:rgba(147,197,253,0.4);font-size:12px"><i class="fas fa-spinner fa-spin" style="font-size:18px;display:block;margin-bottom:8px"></i>Chargement…</div>';

      try {
        // Table document_permissions
        var { data: perms } = await SB.from('document_permissions')
          .select('id, user_id, permission, expires_at, created_at')
          .eq('document_id', G.shareDocId)
          .order('created_at', { ascending: false });

        // Table shared_documents
        var { data: sharedDocs } = await SB.from('shared_documents')
          .select('id, shared_with_email, permission, expires_at, created_at')
          .eq('document_id', G.shareDocId)
          .order('created_at', { ascending: false });

        var rows = [];
        var now = new Date();
        var fmtDate = window.fmtDate || function (iso) { return iso ? new Date(iso).toLocaleDateString('fr-FR') : ''; };
        var esc = window.escapeHtml || function (s) { return String(s || ''); };

        (perms || []).forEach(function (p) {
          var u = (G.users || []).find(function (x) { return x.id === p.user_id; });
          rows.push({
            id: p.id, table: 'document_permissions',
            name: u ? u.name : (p.user_id || '?'),
            email: u ? u.email : '',
            permission: p.permission,
            expiresAt: p.expires_at, createdAt: p.created_at,
            expired: !!(p.expires_at && new Date(p.expires_at) < now)
          });
        });

        (sharedDocs || []).forEach(function (s) {
          rows.push({
            id: s.id, table: 'shared_documents',
            name: s.shared_with_email, email: s.shared_with_email,
            permission: s.permission,
            expiresAt: s.expires_at, createdAt: s.created_at,
            expired: !!(s.expires_at && new Date(s.expires_at) < now)
          });
        });

        var countBadge = document.getElementById('shareHistoryCount');
        if (countBadge) { countBadge.textContent = rows.length; countBadge.classList.toggle('hidden', rows.length === 0); }

        if (!el) return;
        if (!rows.length) {
          el.innerHTML = '<div style="text-align:center;padding:32px;color:rgba(147,197,253,0.4)">' +
            '<i class="fas fa-share-alt" style="font-size:28px;display:block;margin-bottom:8px;opacity:0.2"></i>' +
            '<p style="font-size:13px">Aucun partage pour ce document</p></div>';
          return;
        }

        var PERM_LABELS = { view: 'Lecture', download: 'Téléchargement', edit: 'Édition', viewer: 'Lecture', editor: 'Édition', owner: 'Propriétaire' };

        el.innerHTML = rows.map(function (r) {
          var expLabel = r.expiresAt
            ? (r.expired
              ? '<span style="color:#ef4444;font-size:10px"><i class="fas fa-times-circle" style="margin-right:3px"></i>Expiré ' + fmtDate(r.expiresAt) + '</span>'
              : '<span style="color:#22c55e;font-size:10px"><i class="fas fa-clock" style="margin-right:3px"></i>' + fmtDate(r.expiresAt) + '</span>')
            : '<span style="color:rgba(147,197,253,0.4);font-size:10px">Illimité</span>';

          return '<div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;border:1px solid ' + (r.expired ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.1)') + ';margin-bottom:6px;background:' + (r.expired ? 'rgba(239,68,68,0.03)' : 'transparent') + '">' +
            '<div style="width:34px;height:34px;border-radius:50%;background:rgba(59,130,246,0.2);display:flex;align-items:center;justify-content:center;color:#93c5fd;font-size:12px;font-weight:500;flex-shrink:0">' +
            esc((window.avatarInitials || function (n) { return (n || '?')[0]; })(r.name)) + '</div>' +
            '<div style="flex:1;min-width:0">' +
            '<p style="color:#fff;font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.name) + '</p>' +
            '<p style="color:rgba(147,197,253,0.5);font-size:10px">' + esc(r.email) + '</p>' +
            '<div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap">' +
            '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(59,130,246,0.15);color:#93c5fd">' + esc(PERM_LABELS[r.permission] || r.permission) + '</span>' +
            expLabel + '</div></div>' +
            (!r.expired
              ? '<button onclick="window.revokeShareEntry(this)" data-id="' + r.id + '" data-table="' + r.table + '" style="padding:5px 10px;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.2);border-radius:6px;font-size:10px;cursor:pointer;flex-shrink:0"><i class="fas fa-ban" style="margin-right:3px"></i>Révoquer</button>'
              : '<span style="font-size:10px;color:rgba(239,68,68,0.4);flex-shrink:0">Révoqué</span>') +
            '</div>';
        }).join('');

      } catch (err) {
        if (el) el.innerHTML = '<div style="text-align:center;padding:16px;color:rgba(239,68,68,0.7);font-size:12px">Erreur : ' + (window.escapeHtml || function (s) { return s; })(err.message) + '</div>';
        console.error('[GED Fix v2] loadShareHistory:', err);
      }
    };


    // ──────────────────────────────────────────────────────
    // FIX 7 : renderAIView — ne plus bloquer en chargement
    // ──────────────────────────────────────────────────────
    window.renderAIView = function () {
      var html$ = function (id, v) { var e = document.getElementById(id); if (e) e.innerHTML = v; };
      var esc = window.escapeHtml || function (s) { return String(s || ''); };
      var fi = window.getFileIcon || function () { return { icon: 'fa-file', color: 'text-gray-400', bg: 'bg-gray-500/20', border: 'border-gray-400/30' }; };
      var fmt = window.formatFileSize || function (b) { return b + ' B'; };

      var docs = G.docs || [];
      if (!G.aiAnalyses) G.aiAnalyses = {};

      if (!docs.length) {
        html$('aiDocsList',
          '<div style="text-align:center;padding:48px;color:rgba(147,197,253,0.5)">' +
          '<i class="fas fa-brain" style="font-size:36px;display:block;margin-bottom:12px;opacity:0.2"></i>' +
          '<p style="font-size:14px">Importez des documents pour les analyser</p></div>'
        );
        return;
      }

      var analyzed = docs.filter(function (d) { return G.aiAnalyses[d.id]; }).length;
      var pct = Math.round(analyzed / Math.max(1, docs.length) * 100);

      html$('aiDocsList',
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-radius:12px;border:1px solid rgba(236,72,153,0.15);margin-bottom:12px">' +
        '<div><p style="color:#fff;font-weight:500;font-size:13px">' + analyzed + ' / ' + docs.length + ' documents analysés</p>' +
        '<div style="height:4px;background:rgba(15,23,42,0.5);border-radius:2px;margin-top:6px;width:180px">' +
        '<div style="height:4px;border-radius:2px;background:linear-gradient(90deg,#ec4899,#a855f7);width:' + pct + '%"></div></div></div>' +
        '<button onclick="window.analyzeAllDocuments()" style="padding:8px 14px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:none;border-radius:10px;font-size:12px;cursor:pointer">' +
        '<i class="fas fa-robot" style="margin-right:4px"></i>Analyser tous</button></div>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' +
        docs.slice(0, 30).map(function (d) {
          var a = G.aiAnalyses[d.id];
          var icon = fi(d.name || '');
          return '<div style="padding:14px;border-radius:12px;border:1px solid ' + (a ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.08)') + ';display:flex;align-items:flex-start;gap:12px">' +
            '<div style="width:40px;height:40px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center" class="' + icon.bg + ' ' + icon.color + '">' +
            '<i class="fas ' + icon.icon + '"></i></div>' +
            '<div style="flex:1;min-width:0">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">' +
            '<p style="color:#fff;font-weight:500;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(d.name) + '</p>' +
            (a ? '<span style="font-size:10px;font-weight:500;color:' + (a.confidence >= 85 ? '#22c55e' : a.confidence >= 70 ? '#eab308' : '#f97316') + '">' + a.confidence + '%</span>' : '') +
            '</div>' +
            (a ? '<p style="color:rgba(147,197,253,0.6);font-size:11px;margin-bottom:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">' + esc(a.summary) + '</p>' +
              '<div style="display:flex;flex-wrap:wrap;gap:4px">' +
              (a.keywords || []).slice(0, 4).map(function (k) { return '<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:rgba(59,130,246,0.1);color:#93c5fd">' + esc(k) + '</span>'; }).join('') +
              (a.doc_type ? '<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:rgba(168,85,247,0.15);color:#c084fc">' + esc(a.doc_type) + '</span>' : '') +
              '</div>'
              : '<p style="color:rgba(147,197,253,0.3);font-size:11px">Non analysé</p>') +
            '</div>' +
            '<button onclick="window.analyzeDocumentAI(\'' + d.id + '\')" style="padding:6px 12px;' +
            (a ? 'background:rgba(30,41,59,0.4);color:#9ca3af' : 'background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff') +
            ';border:none;border-radius:8px;font-size:11px;cursor:pointer;flex-shrink:0">' +
            '<i class="fas ' + (a ? 'fa-redo' : 'fa-brain') + '" style="margin-right:4px"></i>' + (a ? 'Ré-analyser' : 'Analyser') + '</button>' +
            '</div>';
        }).join('') + '</div>'
      );
    };

    console.log('[GED Fixes v2] ✅ 7 correctifs JS appliqués');
  });

})();
