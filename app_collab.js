/**
 * SystemesGED v5.1 — MODULE COLLABORATIF
 * ─────────────────────────────────────────────────────────────────────────────
 * Ajoute à app.js :
 *   1. Édition collaborative temps réel  (Supabase Realtime + présence)
 *   2. Analytics entreprise              (document_views + requêtes SQL)
 *
 * INTÉGRATION :
 *   Remplacez la ligne   Object.keys(_pub).forEach(...)
 *   par le contenu de ce fichier inséré JUSTE AVANT cette ligne dans app.js.
 *
 *   OU chargez ce fichier APRÈS app.js dans index.html :
 *   <script src="app.js" defer></script>
 *   <script src="app_collab.js" defer></script>
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════
  // ATTENDRE QUE app.js soit chargé (G et SB disponibles sur window)
  // ══════════════════════════════════════════════════════════════════
  function _ready(fn) {
    if (typeof window.G !== 'undefined' && typeof window.SB !== 'undefined') {
      fn();
    } else {
      setTimeout(function () { _ready(fn); }, 50);
    }
  }

  _ready(function () {

    // Raccourcis vers les globaux de app.js
    var G  = window.G;
    var SB = window.SB;
    var esc        = window.escapeHtml || function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    var showToast  = window.showToast;
    var set$       = function(id,v){ var e=document.getElementById(id); if(e) e.textContent=v; };
    var fmtDate    = window.fmtDate || function(iso){ return iso ? new Date(iso).toLocaleDateString('fr-FR') : ''; };
    var timeAgo    = window.timeAgo || function(iso){ var d=(Date.now()-new Date(iso))/1000; if(d<60)return'À l\'instant'; if(d<3600)return Math.floor(d/60)+'min'; if(d<86400)return Math.floor(d/3600)+'h'; return Math.floor(d/86400)+'j'; };
    var avatarInitials = window.avatarInitials || function(n){ return (n||'?').split(' ').map(function(x){return x[0]||'';}).join('').toUpperCase().slice(0,2)||'?'; };
    var logActivity = window.logActivity || function(){};

    // ══════════════════════════════════════════════════════════════════
    // PALETTES COULEURS COLLABORATEURS
    // ══════════════════════════════════════════════════════════════════
    var COLLAB_COLORS = [
      '#3b82f6','#8b5cf6','#10b981','#f59e0b',
      '#ef4444','#06b6d4','#ec4899','#84cc16',
    ];

    function _getUserColor(userId) {
      if (!userId) return COLLAB_COLORS[0];
      var hash = 0;
      for (var i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
      return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
    }

    // ══════════════════════════════════════════════════════════════════
    // ÉTAT COLLABORATIF (ajouté à G)
    // ══════════════════════════════════════════════════════════════════
    G.collab = {
      docId:        null,   // document en cours d'édition
      sessions:     [],     // sessions actives sur ce document
      channel:      null,   // canal Supabase Realtime
      saveTimer:    null,   // debounce sauvegarde
      lastContent:  '',     // dernier contenu envoyé
      analyticsData: null,  // cache analytics
      viewStart:    null,   // timestamp d'ouverture document
    };

    // ══════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════
    //  PARTIE 1 — ÉDITION COLLABORATIVE TEMPS RÉEL
    // ═══════════════════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════════════

    // ── Ouvrir l'éditeur collaboratif ────────────────────────────────
    async function openCollabEditor(docId) {
      var doc = G.docs.find(function(d){ return d.id === docId; });
      if (!doc) return;

      G.collab.docId    = docId;
      G.collab.viewStart = Date.now();

      // Enregistrer la vue (analytics)
      _trackDocView(docId);

      // Construire la modal
      var modal = document.getElementById('collabEditorModal');
      if (!modal) { showToast('Éditeur collaboratif non disponible', 'error'); return; }

      // Titre + type
      set$('collabEditorTitle', doc.name || 'Document');
      set$('collabEditorType',  doc.content_type || 'text');

      // Charger le contenu depuis Supabase
      var content = doc.content || '';
      if (!content) {
        var { data: fresh } = await SB.from('documents').select('content,content_type').eq('id', docId).single();
        if (fresh) { content = fresh.content || ''; doc.content = content; }
      }

      // Remplir l'éditeur
      var editor = document.getElementById('collabEditorArea');
      if (editor) { editor.value = content; G.collab.lastContent = content; }

      // Badges présence
      _renderPresenceBadges([]);
      document.getElementById('collabEditorModal')?.classList.remove('hidden');
      document.body.style.overflow = 'hidden';

      // Joindre la session Realtime
      _joinCollabSession(docId);
    }

    function closeCollabEditor() {
      // Sauvegarder avant de fermer
      _saveContentNow();
      // Quitter la session
      _leaveCollabSession();
      document.getElementById('collabEditorModal')?.classList.add('hidden');
      document.body.style.overflow = '';
      G.collab.docId = null;
    }

    // ── Rejoindre le canal Realtime du document ───────────────────────
    function _joinCollabSession(docId) {
      _leaveCollabSession(); // nettoyer l'ancien canal

      var channelName = 'collab:' + docId;
      var myColor = _getUserColor(G.user?.id || '');
      var myName  = G.profile?.name || G.user?.email?.split('@')[0] || 'Moi';

      G.collab.channel = SB.channel(channelName, {
        config: { presence: { key: G.user?.id || 'anon' } }
      });

      // ── Présence (qui est en train d'éditer) ──────────────────────
      G.collab.channel
        .on('presence', { event: 'sync' }, function () {
          var state = G.collab.channel.presenceState();
          var sessions = [];
          Object.keys(state).forEach(function (key) {
            var presences = state[key];
            presences.forEach(function (p) {
              if (p.user_id !== G.user?.id) {
                sessions.push({
                  userId:   p.user_id,
                  name:     p.name,
                  color:    p.color,
                  cursor:   p.cursor || 0,
                });
              }
            });
          });
          G.collab.sessions = sessions;
          _renderPresenceBadges(sessions);
          _renderRemoteCursors(sessions);
        })
        .on('presence', { event: 'join' }, function (payload) {
          if (payload.key !== G.user?.id) {
            showToast('👤 ' + (payload.newPresences[0]?.name || 'Utilisateur') + ' a rejoint l\'édition', 'info');
          }
        })
        .on('presence', { event: 'leave' }, function (payload) {
          if (payload.key !== G.user?.id) {
            showToast('👤 ' + (payload.leftPresences[0]?.name || 'Utilisateur') + ' a quitté', 'info');
          }
        });

      // ── Broadcast — synchronisation contenu ───────────────────────
      G.collab.channel
        .on('broadcast', { event: 'content_update' }, function (payload) {
          if (payload.payload?.user_id === G.user?.id) return; // ignorer mes propres msgs
          var editor = document.getElementById('collabEditorArea');
          if (!editor) return;
          var pos = editor.selectionStart;
          editor.value = payload.payload?.content || editor.value;
          // Restaurer la position du curseur
          try { editor.setSelectionRange(pos, pos); } catch (_) {}
          G.collab.lastContent = editor.value;
        })
        .on('broadcast', { event: 'cursor_update' }, function (payload) {
          var p = payload.payload;
          if (!p || p.user_id === G.user?.id) return;
          // Mettre à jour la session de cet utilisateur
          var existing = G.collab.sessions.find(function(s){ return s.userId === p.user_id; });
          if (existing) { existing.cursor = p.cursor; _renderRemoteCursors(G.collab.sessions); }
        });

      // ── S'abonner et diffuser ma présence ─────────────────────────
      G.collab.channel.subscribe(async function (status) {
        if (status === 'SUBSCRIBED') {
          await G.collab.channel.track({
            user_id: G.user?.id,
            name:    myName,
            color:   myColor,
            cursor:  0,
          });
          // Enregistrer/mettre à jour ma session en DB
          await SB.from('document_sessions').upsert({
            document_id:     docId,
            user_id:         G.user.id,
            cursor_position: 0,
            color:           myColor,
            last_activity:   new Date().toISOString(),
          }, { onConflict: 'document_id,user_id' });
        }
      });

      G.realtimeChannels.push(G.collab.channel);
    }

    function _leaveCollabSession() {
      if (G.collab.channel) {
        SB.removeChannel(G.collab.channel);
        G.collab.channel = null;
        // Supprimer ma session en DB
        if (G.user && G.collab.docId) {
          SB.from('document_sessions')
            .delete()
            .eq('document_id', G.collab.docId)
            .eq('user_id', G.user.id)
            .then(function(){});
        }
      }
      clearTimeout(G.collab.saveTimer);
    }

    // ── Handler input éditeur — debounce 800ms ────────────────────────
    function onCollabEditorInput(e) {
      var content = e.target.value;
      var cursor  = e.target.selectionStart;

      // Broadcast immédiat du curseur
      if (G.collab.channel) {
        G.collab.channel.send({
          type: 'broadcast', event: 'cursor_update',
          payload: { user_id: G.user?.id, cursor: cursor }
        });
      }

      // Debounce 800ms pour le contenu
      clearTimeout(G.collab.saveTimer);
      G.collab.saveTimer = setTimeout(function () {
        if (content !== G.collab.lastContent) {
          G.collab.lastContent = content;
          // Broadcast aux autres
          if (G.collab.channel) {
            G.collab.channel.send({
              type: 'broadcast', event: 'content_update',
              payload: { user_id: G.user?.id, content: content }
            });
          }
          // Sauvegarder en DB (debounce 2s pour la DB)
          clearTimeout(G.collab._dbTimer);
          G.collab._dbTimer = setTimeout(function () {
            _saveContentDB(G.collab.docId, content);
          }, 2000);
        }
      }, 800);

      // Mettre à jour indicateur
      _updateCollabSaveStatus('typing');
    }

    async function _saveContentDB(docId, content) {
      if (!docId) return;
      try {
        await SB.from('documents').update({
          content: content,
          updated_at: new Date().toISOString()
        }).eq('id', docId);
        _updateCollabSaveStatus('saved');
        // Mettre à jour last_activity
        await SB.from('document_sessions').update({
          last_activity: new Date().toISOString()
        }).eq('document_id', docId).eq('user_id', G.user.id);
      } catch (err) {
        _updateCollabSaveStatus('error');
      }
    }

    function _saveContentNow() {
      var editor = document.getElementById('collabEditorArea');
      if (!editor || !G.collab.docId) return;
      clearTimeout(G.collab._dbTimer);
      _saveContentDB(G.collab.docId, editor.value);
    }

    function _updateCollabSaveStatus(status) {
      var el = document.getElementById('collabSaveStatus');
      if (!el) return;
      var msgs = {
        typing: '<i class="fas fa-circle-notch fa-spin text-yellow-400 mr-1"></i><span class="text-yellow-400">Modification...</span>',
        saved:  '<i class="fas fa-check-circle text-green-400 mr-1"></i><span class="text-green-400">Enregistré</span>',
        error:  '<i class="fas fa-exclamation-circle text-red-400 mr-1"></i><span class="text-red-400">Erreur</span>',
      };
      el.innerHTML = msgs[status] || '';
    }

    // ── Rendre les avatars de présence ────────────────────────────────
    function _renderPresenceBadges(sessions) {
      var container = document.getElementById('collabPresenceAvatars');
      if (!container) return;
      var myName  = G.profile?.name || 'Moi';
      var myColor = _getUserColor(G.user?.id || '');
      var html = '<div title="'+ esc(myName) + ' (vous)" style="width:32px;height:32px;border-radius:50%;background:'+myColor+';display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700;border:2px solid rgba(255,255,255,0.3);flex-shrink:0;">'+esc(avatarInitials(myName))+'</div>';
      sessions.forEach(function (s) {
        html += '<div title="'+ esc(s.name || '?') + '" style="width:32px;height:32px;border-radius:50%;background:'+esc(s.color||'#3b82f6')+';display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700;border:2px solid rgba(255,255,255,0.3);flex-shrink:0;margin-left:-8px;">'+esc(avatarInitials(s.name||'?'))+'</div>';
      });
      container.innerHTML = html;

      // Badge "édition en cours"
      var badge = document.getElementById('collabEditingBadge');
      if (badge) {
        var total = sessions.length + 1;
        badge.textContent = total + ' éditeur' + (total > 1 ? 's' : '');
        badge.className   = 'text-xs px-2 py-1 rounded-full font-medium ' + (sessions.length > 0 ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30');
      }
    }

    // ── Indicateurs de curseur distants (overlay simplifié) ───────────
    function _renderRemoteCursors(sessions) {
      var overlay = document.getElementById('collabCursorOverlay');
      if (!overlay || !sessions.length) { if (overlay) overlay.innerHTML = ''; return; }
      var editor = document.getElementById('collabEditorArea');
      if (!editor) return;
      overlay.innerHTML = sessions.map(function (s) {
        if (s.cursor === undefined) return '';
        return '<div class="collab-cursor-label" style="background:'+esc(s.color||'#3b82f6')+'">'+esc(s.name||'?')+'</div>';
      }).join('');
    }

    // ── Bouton Éditer sur les cartes document ─────────────────────────
    function openCollabEditorFromCard(docId) {
      openCollabEditor(docId);
    }

    // ══════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════
    //  PARTIE 2 — ANALYTICS ENTREPRISE
    // ═══════════════════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════════════

    // ── Enregistrer une vue de document ──────────────────────────────
    async function _trackDocView(docId) {
      if (!G.user || !docId) return;
      try {
        await SB.from('document_views').insert({
          document_id: docId,
          user_id:     G.user.id,
          company_id:  G.profile?.company_id || null,
        });
      } catch (_) {}
    }

    // ── Charger toutes les données analytics ─────────────────────────
    async function loadAnalytics() {
      var companyId = G.profile?.company_id;
      if (!companyId) {
        _renderAnalyticsNoCompany();
        return;
      }
      set$('analyticsLoading', 'Chargement...');
      try {
        var [topDocs, topUsers, dailyActivity, wfStats, storageStats] = await Promise.all([
          _fetchTopDocuments(companyId),
          _fetchTopUsers(companyId),
          _fetchDailyActivity(companyId),
          _fetchWorkflowStats(companyId),
          _fetchStorageStats(companyId),
        ]);
        G.collab.analyticsData = { topDocs, topUsers, dailyActivity, wfStats, storageStats };
        _renderAnalyticsDashboard();
      } catch (err) {
        set$('analyticsLoading', 'Erreur : ' + err.message);
      }
    }

    async function _fetchTopDocuments(companyId) {
      var { data, error } = await SB.rpc('get_top_documents', {
        p_company_id: companyId, p_limit: 10, p_days: 30
      });
      if (error) {
        // Fallback si la fonction RPC n'existe pas encore
        var { data: fallback } = await SB.from('document_views')
          .select('document_id, documents(name)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(100);
        var counts = {};
        (fallback||[]).forEach(function(v){
          var id = v.document_id;
          counts[id] = counts[id] || { document_id: id, doc_name: v.documents?.name||'?', view_count: 0 };
          counts[id].view_count++;
        });
        return Object.values(counts).sort(function(a,b){return b.view_count - a.view_count;}).slice(0,10);
      }
      return data || [];
    }

    async function _fetchTopUsers(companyId) {
      var { data, error } = await SB.rpc('get_top_users', {
        p_company_id: companyId, p_limit: 10, p_days: 30
      });
      if (error) {
        var { data: fallback } = await SB.from('activity_logs')
          .select('user_id, users_profiles(name,email)')
          .eq('company_id', companyId)
          .limit(200);
        var counts = {};
        (fallback||[]).forEach(function(l){
          var id = l.user_id;
          counts[id] = counts[id] || { user_id:id, user_name: l.users_profiles?.name||'?', user_email: l.users_profiles?.email||'', action_count:0 };
          counts[id].action_count++;
        });
        return Object.values(counts).sort(function(a,b){return b.action_count - a.action_count;}).slice(0,10);
      }
      return data || [];
    }

    async function _fetchDailyActivity(companyId) {
      var { data, error } = await SB.rpc('get_daily_activity', {
        p_company_id: companyId, p_days: 14
      });
      if (error) {
        var { data: fallback } = await SB.from('activity_logs')
          .select('created_at, action, description')
          .eq('company_id', companyId)
          .gte('created_at', new Date(Date.now() - 14*86400000).toISOString())
          .order('created_at', { ascending: true });
        var byDay = {};
        (fallback||[]).forEach(function(l){
          var day = new Date(l.created_at).toISOString().slice(0,10);
          byDay[day] = byDay[day] || { day:day, uploads:0, views:0, shares:0 };
          var act = l.action || (l.description||'').toLowerCase();
          if (act.includes('upload') || act.includes('import')) byDay[day].uploads++;
          else if (act.includes('view') || act.includes('aperçu')) byDay[day].views++;
          else if (act.includes('share') || act.includes('partag')) byDay[day].shares++;
        });
        return Object.values(byDay);
      }
      return data || [];
    }

    async function _fetchWorkflowStats(companyId) {
      var { data } = await SB.from('workflows')
        .select('status')
        .eq('company_id', companyId);
      var stats = { pending:0, approved:0, rejected:0, cancelled:0 };
      (data||[]).forEach(function(w){ if(stats[w.status]!==undefined) stats[w.status]++; });
      return stats;
    }

    async function _fetchStorageStats(companyId) {
      var { data } = await SB.from('documents')
        .select('file_size')
        .eq('company_id', companyId)
        .eq('is_deleted', false);
      var total = (data||[]).reduce(function(s,d){ return s+(d.file_size||0); }, 0);
      return { totalBytes: total, totalMB: (total/(1024*1024)).toFixed(1) };
    }

    // ── Rendre le tableau de bord analytics ──────────────────────────
    function _renderAnalyticsDashboard() {
      var d = G.collab.analyticsData;
      if (!d) return;
      set$('analyticsLoading', '');

      // KPI Cards
      _renderKpiCards(d);
      // Top documents
      _renderTopDocuments(d.topDocs);
      // Top utilisateurs
      _renderTopUsers(d.topUsers);
      // Graphique activité
      _renderActivityChart(d.dailyActivity);
      // Workflows donut
      _renderWorkflowChart(d.wfStats);
    }

    function _renderKpiCards(d) {
      var el = document.getElementById('analyticsKpiCards');
      if (!el) return;
      var totalViews   = (d.topDocs||[]).reduce(function(s,x){return s+(parseInt(x.view_count)||0);},0);
      var activeUsers  = G.users.filter(function(u){ return u.active; }).length;
      var pendingWf    = d.wfStats?.pending || 0;
      var storageMB    = d.storageStats?.totalMB || '0';
      el.innerHTML = [
        { icon:'fa-eye',          color:'blue',   value: totalViews,          label:'Vues documents (30j)' },
        { icon:'fa-users',        color:'green',  value: activeUsers,         label:'Utilisateurs actifs' },
        { icon:'fa-project-diagram',color:'orange',value: pendingWf,          label:'Workflows en attente' },
        { icon:'fa-hdd',          color:'purple', value: storageMB+' MB',     label:'Stockage utilisé' },
      ].map(function(k){
        return '<div class="glass-card rounded-2xl p-5 border border-'+k.color+'-500/20 hover:border-'+k.color+'-400/40 transition-all">'+
          '<div class="flex items-center justify-between mb-3">'+
            '<div class="w-12 h-12 bg-'+k.color+'-500/20 rounded-xl flex items-center justify-center text-'+k.color+'-400 border border-'+k.color+'-400/20">'+
              '<i class="fas '+k.icon+' text-xl"></i></div>'+
          '</div>'+
          '<p class="text-3xl font-bold text-white mb-1">'+esc(String(k.value))+'</p>'+
          '<p class="text-sm text-blue-300/70">'+esc(k.label)+'</p>'+
        '</div>';
      }).join('');
    }

    function _renderTopDocuments(docs) {
      var el = document.getElementById('analyticsTopDocs');
      if (!el) return;
      if (!docs || !docs.length) {
        el.innerHTML = '<p class="text-blue-300/50 text-sm text-center py-6">Aucune donnée disponible</p>'; return;
      }
      var max = Math.max.apply(null, docs.map(function(d){return parseInt(d.view_count)||0;})) || 1;
      el.innerHTML = docs.map(function(d,i){
        var pct = Math.round(((parseInt(d.view_count)||0)/max)*100);
        return '<div class="flex items-center gap-3 py-2 border-b border-blue-500/10 last:border-0">'+
          '<span class="w-6 text-center text-xs font-bold text-blue-400/50">'+(i+1)+'</span>'+
          '<div class="flex-1 min-w-0">'+
            '<p class="text-white text-sm font-medium truncate">'+esc(d.doc_name||'?')+'</p>'+
            '<div class="mt-1 h-1.5 rounded-full bg-slate-700/50 overflow-hidden">'+
              '<div class="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all" style="width:'+pct+'%"></div>'+
            '</div>'+
          '</div>'+
          '<span class="text-sm font-bold text-blue-300 flex-shrink-0">'+(d.view_count||0)+' vues</span>'+
        '</div>';
      }).join('');
    }

    function _renderTopUsers(users) {
      var el = document.getElementById('analyticsTopUsers');
      if (!el) return;
      if (!users || !users.length) {
        el.innerHTML = '<p class="text-blue-300/50 text-sm text-center py-6">Aucune donnée disponible</p>'; return;
      }
      var max = Math.max.apply(null, users.map(function(u){return parseInt(u.action_count)||0;})) || 1;
      el.innerHTML = users.map(function(u,i){
        var color = _getUserColor(u.user_id||'');
        var pct   = Math.round(((parseInt(u.action_count)||0)/max)*100);
        return '<div class="flex items-center gap-3 py-2 border-b border-blue-500/10 last:border-0">'+
          '<div style="width:32px;height:32px;border-radius:50%;background:'+color+';display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700;flex-shrink:0;">'+
            esc(avatarInitials(u.user_name||'?'))+'</div>'+
          '<div class="flex-1 min-w-0">'+
            '<p class="text-white text-sm font-medium truncate">'+esc(u.user_name||'?')+'</p>'+
            '<div class="mt-1 h-1.5 rounded-full bg-slate-700/50 overflow-hidden">'+
              '<div class="h-full rounded-full transition-all" style="width:'+pct+'%;background:'+color+'"></div>'+
            '</div>'+
          '</div>'+
          '<span class="text-sm font-bold text-blue-300 flex-shrink-0">'+(u.action_count||0)+' actions</span>'+
        '</div>';
      }).join('');
    }

    function _renderActivityChart(days) {
      var el = document.getElementById('analyticsActivityChart');
      if (!el) return;
      if (!days || !days.length) {
        el.innerHTML = '<p class="text-blue-300/50 text-sm text-center py-10">Aucune activité sur 14 jours</p>'; return;
      }
      var maxVal = 1;
      days.forEach(function(d){
        var tot = (parseInt(d.uploads)||0)+(parseInt(d.views)||0)+(parseInt(d.shares)||0);
        if (tot > maxVal) maxVal = tot;
      });
      var bars = days.map(function(d){
        var uploads = parseInt(d.uploads)||0;
        var views   = parseInt(d.views)||0;
        var shares  = parseInt(d.shares)||0;
        var total   = uploads+views+shares;
        var pct     = Math.round((total/maxVal)*100);
        var label   = d.day ? new Date(d.day).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'}) : '';
        return '<div class="flex flex-col items-center gap-1 flex-1" title="'+label+' — '+total+' actions">'+
          '<div class="w-full flex flex-col-reverse rounded-t overflow-hidden" style="height:80px;">'+
            '<div style="height:'+Math.round((uploads/maxVal)*100)+'%;background:#3b82f6;min-height:'+(uploads>0?'2px':'0')+';"></div>'+
            '<div style="height:'+Math.round((views/maxVal)*100)+'%;background:#8b5cf6;min-height:'+(views>0?'2px':'0')+';"></div>'+
            '<div style="height:'+Math.round((shares/maxVal)*100)+'%;background:#10b981;min-height:'+(shares>0?'2px':'0')+';"></div>'+
          '</div>'+
          '<span class="text-[9px] text-blue-400/60 truncate w-full text-center">'+esc(label)+'</span>'+
        '</div>';
      }).join('');

      el.innerHTML =
        '<div class="flex items-end gap-1 w-full px-2 pb-2">'+bars+'</div>'+
        '<div class="flex items-center gap-4 justify-center mt-2 text-xs">'+
          '<span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-blue-500 inline-block"></span>Uploads</span>'+
          '<span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-purple-500 inline-block"></span>Vues</span>'+
          '<span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-green-500 inline-block"></span>Partages</span>'+
        '</div>';
    }

    function _renderWorkflowChart(stats) {
      var el = document.getElementById('analyticsWorkflowChart');
      if (!el) return;
      if (!stats) return;
      var data = [
        { label:'En attente', value: stats.pending||0,   color:'#f59e0b' },
        { label:'Approuvés',  value: stats.approved||0,  color:'#10b981' },
        { label:'Rejetés',    value: stats.rejected||0,  color:'#ef4444' },
        { label:'Annulés',    value: stats.cancelled||0, color:'#6b7280' },
      ];
      var total = data.reduce(function(s,d){return s+d.value;},0) || 1;
      el.innerHTML = '<div class="space-y-2">'+
        data.map(function(d){
          var pct = Math.round((d.value/total)*100);
          return '<div class="flex items-center gap-3">'+
            '<span class="w-3 h-3 rounded-full flex-shrink-0" style="background:'+d.color+'"></span>'+
            '<span class="text-sm text-blue-300/80 flex-1">'+esc(d.label)+'</span>'+
            '<div class="flex-1 h-2 rounded-full bg-slate-700/50 overflow-hidden">'+
              '<div class="h-full rounded-full" style="width:'+pct+'%;background:'+d.color+'"></div>'+
            '</div>'+
            '<span class="text-sm font-bold text-white w-8 text-right">'+d.value+'</span>'+
          '</div>';
        }).join('')+
      '</div>';
    }

    function _renderAnalyticsNoCompany() {
      var el = document.getElementById('analyticsContent');
      if (el) el.innerHTML = '<div class="text-center py-16 text-blue-300/50"><i class="fas fa-chart-bar text-5xl mb-4 block opacity-20"></i><p>Créez ou rejoignez une entreprise pour accéder aux analytics</p></div>';
    }

    function refreshAnalytics() {
      G.collab.analyticsData = null;
      loadAnalytics();
    }

    // ── Hook sur openDocumentPreview existant ─────────────────────────
    // On surcharge pour tracker les vues
    var _origOpenPreview = window.openDocumentPreview;
    window.openDocumentPreview = function(id) {
      _trackDocView(id);
      if (_origOpenPreview) _origOpenPreview(id);
    };

    // ── Hook switchView pour charger analytics ────────────────────────
    var _origSwitchView = window.switchView;
    window.switchView = function(v) {
      if (_origSwitchView) _origSwitchView(v);
      if (v === 'analytics') {
        loadAnalytics();
      }
    };

    // ── Patcher createDocCard pour ajouter bouton Éditer ─────────────
    var _origCreateDocCard = window.createDocCard;
    if (typeof _origCreateDocCard === 'undefined') {
      // Patch via G après init
      setTimeout(function(){
        if (window.renderDocuments) {
          // Ajouter bouton édition via délegation
          document.addEventListener('click', function(e) {
            var btn = e.target.closest('[data-collab-edit]');
            if (btn) {
              e.stopPropagation();
              openCollabEditor(btn.dataset.collabEdit);
            }
          });
        }
      }, 1000);
    }

    // ══════════════════════════════════════════════════════════════════
    // EXPOSITION PUBLIQUE
    // ══════════════════════════════════════════════════════════════════
    var collabPub = {
      openCollabEditor:        openCollabEditor,
      closeCollabEditor:       closeCollabEditor,
      onCollabEditorInput:     onCollabEditorInput,
      openCollabEditorFromCard:openCollabEditorFromCard,
      loadAnalytics:           loadAnalytics,
      refreshAnalytics:        refreshAnalytics,
      _trackDocView:           _trackDocView,
    };
    Object.keys(collabPub).forEach(function(k){ window[k] = collabPub[k]; });

  }); // fin _ready

})();
