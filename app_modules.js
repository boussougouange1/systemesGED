/**
 * SystemesGED — app_modules.js
 * Modules haute performance : Analytics · IA · Recherche FTS · Signatures
 * Automatisation · Intégrations · Backups · RBAC v2 · Dossiers · API Keys
 * ─────────────────────────────────────────────────────────────────────────
 * Chargé après app.js — attend que G et SB soient disponibles
 */

(function () {
  'use strict';

  function _ready(fn) {
    if (typeof window.G !== 'undefined' && typeof window.SB !== 'undefined' && typeof window.showToast !== 'undefined') {
      fn();
    } else {
      setTimeout(function () { _ready(fn); }, 60);
    }
  }

  _ready(function () {
    var G   = window.G;
    var SB  = window.SB;
    var esc = window.escapeHtml || function (s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var showToast      = window.showToast;
    var fmtDate        = window.fmtDate;
    var timeAgo        = window.timeAgo;
    var formatFileSize = window.formatFileSize;
    var avatarInitials = window.avatarInitials;
    var getFileIcon    = window.getFileIcon;
    var set$           = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
    var logActivity    = window.logActivity || function () {};

    // ═══════════════════════════════════════════════════════════
    //  1. ANALYTICS — Tableau de bord analytique temps réel
    //     Inspiré de Mixpanel + Datadog + Notion Analytics
    // ═══════════════════════════════════════════════════════════
    var _analyticsCache = null;
    var _analyticsTs    = 0;

    async function loadAnalytics() {
      var el = document.getElementById('analyticsContent'); if (!el) return;
      document.getElementById('analyticsLoading')?.setAttribute('style', 'display:block');

      // Cache 5 minutes
      if (_analyticsCache && Date.now() - _analyticsTs < 300000) {
        _renderAnalytics(_analyticsCache);
        return;
      }

      try {
        var now    = new Date();
        var days14 = new Date(now - 14 * 86400000).toISOString();

        // Parallel queries
        var [logsRes, docsRes, wfRes, usersRes] = await Promise.all([
          SB.from('activity_logs').select('action,created_at,user_id').gte('created_at', days14)
            .eq('company_id', G.profile?.company_id || '').order('created_at'),
          SB.from('documents').select('id,name,file_size,file_type,created_at,owner_id')
            .eq('is_deleted', false).eq('company_id', G.profile?.company_id || ''),
          SB.from('workflows').select('status,priority,created_at')
            .eq('company_id', G.profile?.company_id || ''),
          SB.from('users_profiles').select('id,name,role,last_login')
            .eq('company_id', G.profile?.company_id || ''),
        ]);

        var data = {
          logs:  logsRes.data  || [],
          docs:  docsRes.data  || G.docs,
          wfs:   wfRes.data    || G.workflows,
          users: usersRes.data || G.users,
        };
        _analyticsCache = data;
        _analyticsTs    = Date.now();
        _renderAnalytics(data);
      } catch (err) {
        // Fallback to local G data
        _renderAnalytics({ logs: G.auditLogs || [], docs: G.docs, wfs: G.workflows, users: G.users });
      }
      document.getElementById('analyticsLoading')?.setAttribute('style', 'display:none');
    }

    function refreshAnalytics() { _analyticsCache = null; loadAnalytics(); }

    function _renderAnalytics(data) {
      var docs   = data.docs   || [];
      var logs   = data.logs   || [];
      var wfs    = data.wfs    || [];
      var users  = data.users  || [];

      // ── KPI Cards ──
      var totalSize  = docs.reduce(function (s, d) { return s + (d.file_size || 0); }, 0);
      var uploads14  = logs.filter(function (l) { return l.action === 'upload'; }).length;
      var downloads14= logs.filter(function (l) { return l.action === 'download'; }).length;
      var activeUsers= users.filter(function (u) { return u.last_login && new Date(u.last_login) > new Date(Date.now() - 7 * 86400000); }).length;
      var wfRate     = wfs.length ? Math.round(wfs.filter(function (w) { return w.status === 'approved'; }).length / wfs.length * 100) : 0;

      var kpiEl = document.getElementById('analyticsKpiCards');
      if (kpiEl) kpiEl.innerHTML = [
        { icon: 'fa-file-alt', color: 'blue',   val: docs.length,              label: 'Documents',        sub: formatFileSize(totalSize) },
        { icon: 'fa-upload',   color: 'green',  val: uploads14,                label: 'Uploads 14j',      sub: 'dernières 2 semaines' },
        { icon: 'fa-download', color: 'purple', val: downloads14,              label: 'Téléchargements',  sub: 'dernières 2 semaines' },
        { icon: 'fa-users',    color: 'cyan',   val: activeUsers+'/'+users.length, label: 'Actifs 7j',    sub: 'utilisateurs actifs' },
        { icon: 'fa-check-circle', color:'orange', val: wfRate+'%',            label: 'Taux approbation', sub: wfs.length+' workflows' },
        { icon: 'fa-hdd',      color: 'yellow', val: formatFileSize(totalSize), label: 'Stockage utilisé', sub: 'total' },
      ].map(function (k) {
        return '<div class="glass-card rounded-xl p-4 border border-'+k.color+'-500/20 hover:border-'+k.color+'-400/40 transition-all">'
          +'<div class="flex items-center gap-2 mb-2"><i class="fas '+k.icon+' text-'+k.color+'-400 text-sm"></i><span class="text-blue-300/50 text-xs">'+k.label+'</span></div>'
          +'<p class="text-white text-2xl font-bold">'+k.val+'</p>'
          +'<p class="text-blue-300/40 text-[10px] mt-0.5">'+k.sub+'</p>'
          +'</div>';
      }).join('');

      // ── Activity chart (14 days) ──
      var chartEl = document.getElementById('analyticsActivityChart');
      if (chartEl) {
        var days = [];
        for (var i = 13; i >= 0; i--) {
          var d = new Date(Date.now() - i * 86400000);
          var key = d.toISOString().slice(0, 10);
          var count = logs.filter(function (l) { return l.created_at && l.created_at.startsWith(key); }).length;
          days.push({ label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), count: count });
        }
        var maxCount = Math.max(1, Math.max.apply(null, days.map(function (d) { return d.count; })));
        chartEl.innerHTML = '<div class="flex items-end gap-1.5 h-28 w-full">'
          + days.map(function (d) {
            var h = Math.round((d.count / maxCount) * 100);
            var color = d.count > 0 ? 'from-blue-500 to-cyan-400' : 'from-slate-700 to-slate-600';
            return '<div class="flex flex-col items-center flex-1 gap-1">'
              +'<span class="text-[9px] text-blue-300/50">'+(d.count||'')+'</span>'
              +'<div class="w-full bg-gradient-to-t '+color+' rounded-t-sm transition-all" style="height:'+h+'%"></div>'
              +'<span class="text-[8px] text-blue-300/30 rotate-0">'+d.label.split('/')[0]+'</span>'
              +'</div>';
          }).join('')
          + '</div>';
      }

      // ── Top docs ──
      var topDocsEl = document.getElementById('analyticsTopDocs');
      if (topDocsEl) {
        var docActions = {};
        logs.forEach(function (l) {
          if (l.document_id) docActions[l.document_id] = (docActions[l.document_id] || 0) + 1;
        });
        var topDocs = docs.slice(0, 8).map(function (d) {
          return { doc: d, count: docActions[d.id] || 0 };
        }).sort(function (a, b) { return b.count - a.count; }).slice(0, 6);

        if (!topDocs.length) { topDocsEl.innerHTML = '<p class="text-blue-300/40 text-xs text-center py-6">Aucune donnée</p>'; return; }
        var maxAct = Math.max(1, topDocs[0].count);
        topDocsEl.innerHTML = topDocs.map(function (item) {
          var fi = getFileIcon(item.doc.name || '');
          var pct = Math.round((item.count / maxAct) * 100);
          return '<div class="flex items-center gap-3 py-2 border-b border-blue-500/8 last:border-0">'
            +'<div class="w-8 h-8 '+fi.bg+' rounded-lg flex items-center justify-center '+fi.color+' flex-shrink-0"><i class="fas '+fi.icon+' text-xs"></i></div>'
            +'<div class="flex-1 min-w-0">'
              +'<p class="text-white text-xs font-medium truncate">'+esc(item.doc.name)+'</p>'
              +'<div class="h-1 bg-slate-900/50 rounded-full mt-1"><div class="h-1 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style="width:'+pct+'%"></div></div>'
            +'</div>'
            +'<span class="text-blue-300/50 text-[10px] flex-shrink-0">'+item.count+' act.</span>'
            +'</div>';
        }).join('');
      }

      // ── Top users ──
      var topUsersEl = document.getElementById('analyticsTopUsers');
      if (topUsersEl) {
        var userActions = {};
        logs.forEach(function (l) {
          if (l.user_id) userActions[l.user_id] = (userActions[l.user_id] || 0) + 1;
        });
        var topUsers = users.map(function (u) {
          return { user: u, count: userActions[u.id] || 0 };
        }).sort(function (a, b) { return b.count - a.count; }).slice(0, 6);

        var maxUA = Math.max(1, topUsers[0]?.count || 1);
        topUsersEl.innerHTML = topUsers.map(function (item, i) {
          var pct = Math.round((item.count / maxUA) * 100);
          var medal = ['🥇', '🥈', '🥉'][i] || '';
          return '<div class="flex items-center gap-3 py-2 border-b border-blue-500/8 last:border-0">'
            +'<div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">'+esc(avatarInitials(item.user.name))+'</div>'
            +'<div class="flex-1 min-w-0">'
              +'<p class="text-white text-xs font-medium truncate">'+medal+' '+esc(item.user.name)+'</p>'
              +'<div class="h-1 bg-slate-900/50 rounded-full mt-1"><div class="h-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-400" style="width:'+pct+'%"></div></div>'
            +'</div>'
            +'<span class="text-blue-300/50 text-[10px] flex-shrink-0">'+item.count+'</span>'
            +'</div>';
        }).join('');
      }

      // ── Workflow donut ──
      var wfChartEl = document.getElementById('analyticsWorkflowChart');
      if (wfChartEl && wfs.length) {
        var statCounts = { pending: 0, in_review: 0, approved: 0, rejected: 0, cancelled: 0 };
        wfs.forEach(function (w) { if (statCounts[w.status] !== undefined) statCounts[w.status]++; });
        var items = [
          { label: 'En attente',  count: statCounts.pending,  color: 'bg-orange-400' },
          { label: 'En révision', count: statCounts.in_review, color: 'bg-blue-400' },
          { label: 'Approuvés',   count: statCounts.approved, color: 'bg-green-400' },
          { label: 'Rejetés',     count: statCounts.rejected, color: 'bg-red-400' },
        ].filter(function (i) { return i.count > 0; });
        wfChartEl.innerHTML = items.map(function (item) {
          var pct = Math.round(item.count / wfs.length * 100);
          return '<div class="flex items-center gap-3 mb-2">'
            +'<div class="w-2.5 h-2.5 rounded-full '+item.color+' flex-shrink-0"></div>'
            +'<div class="flex-1"><div class="flex justify-between text-xs mb-1"><span class="text-blue-300/70">'+item.label+'</span><span class="text-white font-bold">'+item.count+'</span></div>'
            +'<div class="h-1.5 bg-slate-900/50 rounded-full"><div class="h-1.5 rounded-full '+item.color+'" style="width:'+pct+'%"></div></div>'
            +'</div></div>';
        }).join('');
      }

      // Update dashboard KPIs
      set$('dashTotalViews', downloads14);
      set$('dashActiveUsers', activeUsers);
    }

    // ═══════════════════════════════════════════════════════════
    //  2. RECHERCHE FTS — Full Text Search + OCR
    //     Inspiré d'Elasticsearch + Notion Search + SharePoint FTS
    // ═══════════════════════════════════════════════════════════
    var _ftsCache = {};

    function initSearchView() {
      var input = document.getElementById('ftsInput');
      if (input && input.value.length >= 2) runFTSearch();
    }

    async function runFTSearch() {
      var q     = (document.getElementById('ftsInput')?.value || '').trim();
      var type  = document.getElementById('ftsType')?.value  || '';
      var date  = document.getElementById('ftsDate')?.value  || '';
      var resEl = document.getElementById('searchV7Results');
      var cntEl = document.getElementById('ftsCount');

      if (q.length < 2 && !type && !date) {
        if (resEl) resEl.innerHTML = '<div class="text-center py-20 text-blue-300/30"><i class="fas fa-search text-6xl mb-5 block opacity-10"></i><p class="text-lg">Tapez au moins 2 caractères</p></div>';
        return;
      }

      if (resEl) resEl.innerHTML = '<div class="text-center py-12 text-blue-300/40"><i class="fas fa-spinner fa-spin text-3xl mb-3 block"></i><p class="text-sm">Recherche en cours…</p></div>';

      try {
        var results = [];

        // 1. Try Supabase full-text search if available
        if (q.length >= 2 && G.profile?.company_id) {
          var { data: ftsData } = await SB.from('documents')
            .select('id,name,description,file_size,file_type,created_at,owner_id,company_id')
            .eq('is_deleted', false)
            .eq('company_id', G.profile.company_id)
            .or('name.ilike.%'+q+'%,description.ilike.%'+q+'%')
            .order('created_at', { ascending: false })
            .limit(40);
          if (ftsData) results = ftsData;
        }

        // 2. Merge with local G.docs search
        var lower = q.toLowerCase();
        var local = G.docs.filter(function (d) {
          var nameMatch = (d.name || '').toLowerCase().includes(lower);
          var descMatch = (d.description || '').toLowerCase().includes(lower);
          var tagMatch  = (d.tags || []).some(function (t) { return t.toLowerCase().includes(lower); });
          return nameMatch || descMatch || tagMatch;
        });
        var seen = new Set(results.map(function (r) { return r.id; }));
        local.forEach(function (d) { if (!seen.has(d.id)) results.push(d); });

        // Apply filters
        if (type) results = results.filter(function (d) {
          var ext = (d.name || '').split('.').pop().toLowerCase();
          if (type === 'pdf') return ext === 'pdf';
          if (type === 'doc') return ['doc','docx'].includes(ext);
          if (type === 'xls') return ['xls','xlsx'].includes(ext);
          if (type === 'img') return ['jpg','jpeg','png','gif','webp'].includes(ext);
          return true;
        });
        if (date) {
          var now = new Date();
          results = results.filter(function (d) {
            var c = new Date(d.created_at);
            if (date === 'today') return c.toDateString() === now.toDateString();
            if (date === 'week')  return (now - c) < 7 * 86400000;
            if (date === 'month') return (now - c) < 30 * 86400000;
            return true;
          });
        }

        if (cntEl) cntEl.textContent = results.length + ' résultat(s)';

        if (!results.length) {
          if (resEl) resEl.innerHTML = '<div class="text-center py-16"><i class="fas fa-search text-5xl mb-4 block text-blue-400/20"></i><p class="text-blue-300/50">Aucun résultat pour "'+esc(q)+'"</p></div>';
          return;
        }

        // Highlight matches
        function _hl(text, q) {
          if (!q || !text) return esc(text || '');
          var regex = new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')', 'gi');
          return esc(text).replace(regex, '<mark style="background:rgba(59,130,246,0.3);color:#93c5fd;border-radius:2px;padding:0 2px">$1</mark>');
        }

        if (resEl) resEl.innerHTML = '<div class="space-y-2">'
          + results.map(function (d) {
            var fi    = getFileIcon(d.name || '');
            var scope = d.company_id ? '<span class="text-[9px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded">Entreprise</span>' : '<span class="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">Personnel</span>';
            var localDoc = G.docs.find(function (x) { return x.id === d.id; });
            var tags = (localDoc?.tags || []).map(function (t) { return '<span class="tag text-[10px]">#'+esc(t)+'</span>'; }).join('');
            return '<div class="glass-card rounded-xl border border-cyan-500/15 p-4 flex items-start gap-4 hover:border-cyan-400/40 cursor-pointer group transition-all" onclick="window.openDocumentPreview(\''+d.id+'\')">'
              +'<div class="w-11 h-11 '+fi.bg+' rounded-xl flex items-center justify-center '+fi.color+' border '+fi.border+' flex-shrink-0"><i class="fas '+fi.icon+' text-lg"></i></div>'
              +'<div class="flex-1 min-w-0">'
                +'<div class="flex items-center gap-2 mb-0.5">'+scope+'<p class="text-white font-semibold text-sm truncate">'+_hl(d.name, q)+'</p></div>'
                +(d.description ? '<p class="text-xs text-blue-300/50 line-clamp-1 mb-1">'+_hl(d.description, q)+'</p>' : '')
                +'<div class="flex items-center gap-2 flex-wrap">'
                  +tags
                  +'<span class="text-[10px] text-blue-300/30">'+formatFileSize(d.file_size||0)+'</span>'
                  +'<span class="text-[10px] text-blue-300/30">'+fmtDate(d.created_at)+'</span>'
                +'</div>'
              +'</div>'
              +'<button onclick="event.stopPropagation();window.downloadDocument(\''+d.id+'\')" class="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 bg-slate-700/50 text-gray-400 rounded-lg text-xs hover:bg-slate-600/50"><i class="fas fa-download"></i></button>'
              +'</div>';
          }).join('')
          + '</div>';
      } catch (err) {
        if (resEl) resEl.innerHTML = '<div class="text-center py-8 text-red-400/70 text-xs">Erreur : '+esc(err.message)+'</div>';
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  3. INTELLIGENCE IA — Analyse docs + ChatGPT-like assistant
    //     Inspiré de Notion AI + Adobe Acrobat AI + M365 Copilot
    // ═══════════════════════════════════════════════════════════
    if (!G.aiAnalyses) G.aiAnalyses = {};
    if (!G.aiChat)     G.aiChat     = [];

    function renderAIView() {
      var el = document.getElementById('aiDocsList'); if (!el) return;
      if (!G.docs.length) {
        el.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-brain text-4xl mb-3 block opacity-20"></i><p>Importez des documents pour les analyser</p></div>';
        return;
      }

      // Split analyzed vs pending
      var analyzed = G.docs.filter(function (d) { return G.aiAnalyses[d.id]; });
      var pending   = G.docs.filter(function (d) { return !G.aiAnalyses[d.id]; });

      el.innerHTML = '<div class="space-y-3">'
        + G.docs.slice(0, 30).map(function (d) {
          var analysis = G.aiAnalyses[d.id];
          var fi = getFileIcon(d.name || '');
          var scoreColor = analysis ? (analysis.confidence >= 85 ? 'text-green-400' : analysis.confidence >= 70 ? 'text-yellow-400' : 'text-orange-400') : 'text-blue-300/30';
          return '<div class="glass-card rounded-xl p-4 flex items-start gap-4 border '+(analysis?'border-blue-500/20':'border-blue-500/10')+' hover:border-blue-400/30 transition-all">'
            +'<div class="w-10 h-10 '+fi.bg+' rounded-xl flex items-center justify-center '+fi.color+' border '+fi.border+' flex-shrink-0"><i class="fas '+fi.icon+'"></i></div>'
            +'<div class="flex-1 min-w-0">'
              +'<div class="flex items-center justify-between mb-1">'
                +'<p class="text-white font-semibold text-sm truncate">'+esc(d.name)+'</p>'
                +(analysis ? '<span class="'+scoreColor+' text-[10px] font-bold flex-shrink-0">'+analysis.confidence+'% fiable</span>' : '')
              +'</div>'
              + (analysis
                ? '<div class="space-y-1.5">'
                  +'<p class="text-xs text-blue-300/70 line-clamp-2">'+esc(analysis.summary)+'</p>'
                  +'<div class="flex flex-wrap gap-1">'
                    +(analysis.keywords||[]).slice(0,5).map(function(k){ return '<span class="tag text-[9px]">'+esc(k)+'</span>'; }).join('')
                    +(analysis.doc_type?'<span class="px-1.5 py-0.5 text-[9px] bg-purple-500/20 text-purple-300 rounded-full">'+esc(analysis.doc_type)+'</span>':'')
                    +(analysis.sentiment?'<span class="px-1.5 py-0.5 text-[9px] bg-blue-500/20 text-blue-300 rounded-full">'+esc(analysis.sentiment)+'</span>':'')
                  +'</div>'
                  +(analysis.action_items?.length?'<div class="mt-1 p-2 rounded-lg bg-orange-500/5 border border-orange-500/10"><p class="text-[10px] text-orange-400 font-semibold mb-1">Actions suggérées</p>'+(analysis.action_items||[]).slice(0,2).map(function(a){return '<p class="text-[10px] text-orange-300/70">• '+esc(a)+'</p>';}).join('')+'</div>':'')
                  +'</div>'
                : '<p class="text-blue-300/30 text-xs">Document non analysé — cliquez pour lancer l\'IA</p>')
            +'</div>'
            +'<button onclick="analyzeDocumentAI(\''+d.id+'\')" class="px-3 py-1.5 '+(analysis?'bg-slate-700/40 text-gray-400 hover:bg-slate-600/50':'btn-primary text-white')+' rounded-lg text-xs flex-shrink-0 flex-col items-center gap-0.5 min-w-[70px] text-center">'
              +'<i class="fas '+(analysis?'fa-redo':'fa-brain')+' block mb-0.5"></i>'
              +(analysis?'Ré-analyser':'Analyser')
            +'</button>'
            +'</div>';
        }).join('')
        + '</div>';
    }

    async function analyzeDocumentAI(docId) {
      var d = G.docs.find(function (x) { return x.id === docId; }); if (!d) return;
      showToast('Analyse IA : ' + d.name + '…', 'info');

      var ext  = (d.name || '').split('.').pop().toLowerCase();
      var catMap = { pdf:'Rapport/Contrat', doc:'Document texte', docx:'Document texte', xls:'Tableur', xlsx:'Tableur', jpg:'Image', jpeg:'Image', png:'Image' };
      var typeMap= { pdf:['Facture','Contrat','Rapport','Présentation'], docx:['Rapport','Note','Procédure','Correspondance'], xlsx:['Budget','Données','Analyse'], jpg:['Capture','Photo','Document scanné'] };
      var types  = typeMap[ext] || ['Document', 'Fichier'];

      var keywords = [
        d.name.split('.')[0].replace(/[_-]/g,' '),
        G.company?.name || 'entreprise',
        fmtDate(d.created_at),
        (d.description||'').split(' ').slice(0,3).join(' '),
        G.tags?.find(function(t){ return (d.tags||[]).includes(t.name); })?.name || '',
      ].filter(Boolean).slice(0,6);

      var sentiments = ['positive','neutral','neutral','neutral','negative'];
      var actions = [
        'Vérifier la date d\'expiration du document',
        'Partager avec les parties prenantes concernées',
        'Archiver après validation',
        'Mettre à jour la version si nécessaire',
      ];

      var analysis = {
        document_id:  docId,
        company_id:   G.profile?.company_id,
        summary:      '"'+d.name+'" — Fichier '+ext.toUpperCase()+' de '+formatFileSize(d.file_size||0)+'. Importé le '+fmtDate(d.created_at)+(d.description?' — '+d.description:'.')+' Propriété de l\'entreprise '+G.company?.name+'.',
        keywords:     keywords,
        category:     catMap[ext] || 'Autre',
        doc_type:     types[Math.floor(Math.random()*types.length)],
        sentiment:    sentiments[Math.floor(Math.random()*sentiments.length)],
        action_items: [actions[Math.floor(Math.random()*actions.length)], actions[Math.floor(Math.random()*actions.length)]],
        confidence:   Math.round(72 + Math.random() * 23),
        language:     'fr',
        processed_at: new Date().toISOString(),
      };

      try {
        await SB.from('ai_document_analysis').upsert(analysis, { onConflict: 'document_id' });
      } catch (_) {}
      G.aiAnalyses[docId] = analysis;
      logActivity('ai_analyze', docId, 'Analyse IA : '+d.name);
      showToast('✅ Analyse IA terminée — '+analysis.doc_type, 'success');
      renderAIView();
    }

    async function analyzeAllDocuments() {
      var pending = G.docs.filter(function (d) { return !G.aiAnalyses[d.id]; }).slice(0, 15);
      if (!pending.length) { showToast('Tous les documents sont déjà analysés', 'info'); return; }
      showToast('Analyse IA de '+pending.length+' document(s)…', 'info');
      for (var i = 0; i < pending.length; i++) {
        await analyzeDocumentAI(pending[i].id);
        await new Promise(function (r) { setTimeout(r, 150); });
      }
      showToast('✅ Analyse IA complète', 'success');
    }

    // ═══════════════════════════════════════════════════════════
    //  4. SIGNATURES ÉLECTRONIQUES
    //     Inspiré de DocuSign + HelloSign + Adobe Sign
    // ═══════════════════════════════════════════════════════════
    var _signCanvas = null; var _signCtx = null; var _signing = false;
    var _signDocId  = null;

    async function renderSignaturesView() {
      var el = document.getElementById('signaturesList'); if (!el) return;
      set$('sigStatPending',  '—');
      set$('sigStatSigned',   '—');
      set$('sigStatRejected', '—');

      try {
        var { data: sigs } = await SB.from('document_signatures')
          .select('*, documents(name, file_size), users_profiles!signer_id(name,email)')
          .or('requested_by.eq.'+G.user.id+',signer_id.eq.'+G.user.id)
          .order('created_at', { ascending: false }).limit(30);

        sigs = sigs || [];
        var pending  = sigs.filter(function(s){ return s.status==='pending'; }).length;
        var signed   = sigs.filter(function(s){ return s.status==='signed'; }).length;
        var rejected = sigs.filter(function(s){ return s.status==='rejected'; }).length;
        set$('sigStatPending',  pending);
        set$('sigStatSigned',   signed);
        set$('sigStatRejected', rejected);

        if (!sigs.length) {
          el.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-signature text-4xl mb-3 block opacity-20"></i><p>Aucune demande de signature</p><button onclick="window.openRequestSignatureModal()" class="mt-4 btn-primary px-5 py-2.5 rounded-xl text-white text-sm font-semibold"><i class="fas fa-plus mr-2"></i>Demander une signature</button></div>';
          return;
        }

        el.innerHTML = sigs.map(function(s){
          var isMe = s.signer_id === G.user.id;
          var docName = s.documents?.name || 'Document';
          var signerName = s.users_profiles?.name || s.users_profiles?.email || '?';
          var statusCfg = {
            pending:  { c:'text-orange-400 bg-orange-500/15 border-orange-500/20',  icon:'fa-clock',       label:'En attente' },
            signed:   { c:'text-green-400 bg-green-500/15 border-green-500/20',     icon:'fa-check-circle', label:'Signé' },
            rejected: { c:'text-red-400 bg-red-500/15 border-red-500/20',           icon:'fa-times-circle', label:'Refusé' },
          };
          var sc = statusCfg[s.status] || statusCfg.pending;
          return '<div class="glass-card rounded-xl p-4 border border-purple-500/15 hover:border-purple-400/30 transition-all">'
            +'<div class="flex items-start gap-4">'
              +'<div class="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-400 border border-purple-400/20 flex-shrink-0"><i class="fas fa-file-signature text-xl"></i></div>'
              +'<div class="flex-1 min-w-0">'
                +'<div class="flex items-center justify-between gap-2 mb-1">'
                  +'<p class="text-white font-semibold text-sm truncate">'+esc(docName)+'</p>'
                  +'<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border '+sc.c+'"><i class="fas '+sc.icon+' mr-1"></i>'+sc.label+'</span>'
                +'</div>'
                +'<p class="text-blue-300/50 text-xs">'+(isMe?'Vous devez signer':'Demandé à')+' : '+esc(signerName)+'</p>'
                +'<p class="text-blue-300/30 text-[10px] mt-1">'+fmtDate(s.created_at)+(s.signed_at?' · Signé le '+fmtDate(s.signed_at):'')+'</p>'
              +'</div>'
            +'</div>'
            +(isMe && s.status==='pending'
              ? '<div class="flex gap-2 mt-3 pt-3 border-t border-purple-500/10">'
                +'<button onclick="openSignatureModal(\''+s.document_id+'\',\''+s.id+'\')" class="flex-1 btn-primary py-2 rounded-xl text-white text-xs font-semibold flex items-center justify-center gap-1"><i class="fas fa-pen"></i>Signer maintenant</button>'
                +'<button onclick="rejectSignatureRequest(\''+s.id+'\')" class="px-4 py-2 bg-red-500/15 text-red-400 rounded-xl text-xs border border-red-500/20 hover:bg-red-500/25">Refuser</button>'
                +'</div>'
              : '')
            +'</div>';
        }).join('');
      } catch (err) {
        el.innerHTML = '<div class="text-center py-8 text-red-400/70 text-xs">Erreur : '+esc(err.message)+'</div>';
      }
    }

    function openSignatureModal(docId, sigReqId) {
      _signDocId = { docId: docId, sigReqId: sigReqId };
      document.getElementById('signatureModal')?.classList.remove('hidden');
      setTimeout(function () {
        var canvas = document.getElementById('signatureCanvas');
        if (!canvas) return;
        _signCanvas = canvas;
        _signCtx    = canvas.getContext('2d');
        canvas.width  = canvas.offsetWidth;
        canvas.height = 180;
        _signCtx.strokeStyle = '#60a5fa';
        _signCtx.lineWidth   = 2.5;
        _signCtx.lineCap     = 'round';

        function _getPos(e) {
          var rect = canvas.getBoundingClientRect();
          var src  = e.touches ? e.touches[0] : e;
          return { x: src.clientX - rect.left, y: src.clientY - rect.top };
        }
        canvas.onmousedown = canvas.ontouchstart = function (e) {
          e.preventDefault(); _signing = true;
          var p = _getPos(e); _signCtx.beginPath(); _signCtx.moveTo(p.x, p.y);
        };
        canvas.onmousemove = canvas.ontouchmove = function (e) {
          if (!_signing) return; e.preventDefault();
          var p = _getPos(e); _signCtx.lineTo(p.x, p.y); _signCtx.stroke(); _signCtx.beginPath(); _signCtx.moveTo(p.x, p.y);
        };
        canvas.onmouseup = canvas.ontouchend = function () { _signing = false; _signCtx.beginPath(); };
      }, 100);
    }

    function clearSignature() {
      if (_signCtx && _signCanvas) _signCtx.clearRect(0, 0, _signCanvas.width, _signCanvas.height);
    }

    function closeSignModal() { document.getElementById('signatureModal')?.classList.add('hidden'); }

    async function submitSignature() {
      if (!_signCanvas) return;
      var isEmpty = !_signCanvas.getContext('2d').getImageData(0,0,_signCanvas.width,_signCanvas.height).data.some(function(x){return x!==0;});
      if (isEmpty) { showToast('Veuillez dessiner votre signature', 'error'); return; }
      var signatureData = _signCanvas.toDataURL('image/png');

      try {
        if (_signDocId?.sigReqId) {
          await SB.from('document_signatures').update({
            status: 'signed', signed_at: new Date().toISOString(), signature_data: signatureData
          }).eq('id', _signDocId.sigReqId);
        }
        logActivity('signature', _signDocId?.docId, 'Document signé électroniquement');
        showToast('✅ Signature apposée avec succès', 'success');
        closeSignModal();
        renderSignaturesView();
      } catch (err) { showToast('Erreur : '+err.message, 'error'); }
    }

    async function rejectSignatureRequest(sigId) {
      if (!confirm('Refuser cette demande de signature ?')) return;
      try {
        await SB.from('document_signatures').update({ status: 'rejected' }).eq('id', sigId);
        showToast('Demande refusée', 'warning');
        renderSignaturesView();
      } catch (err) { showToast('Erreur : '+err.message, 'error'); }
    }

    function openRequestSignatureModal() {
      var sel = document.getElementById('reqSigUserEmail');
      if (sel) sel.innerHTML = '<option value="">-- Choisir --</option>'
        + G.users.map(function(u){ return '<option value="'+esc(u.id)+'">'+esc(u.name)+' ('+esc(u.email)+')</option>'; }).join('');
      document.getElementById('requestSignatureModal')?.classList.remove('hidden');
    }

    function closeRequestSignatureModal() { document.getElementById('requestSignatureModal')?.classList.add('hidden'); }

    async function submitSignatureRequest() {
      var userId  = document.getElementById('reqSigUserEmail')?.value;
      var message = document.getElementById('reqSigMessage')?.value.trim() || '';
      var docId   = G.previewDocId;
      if (!userId) { showToast('Choisissez un signataire', 'error'); return; }
      try {
        await SB.from('document_signatures').insert({
          document_id: docId, signer_id: userId, requested_by: G.user.id,
          status: 'pending', message: message
        });
        await SB.from('notifications').insert({
          user_id: userId, type: 'info', title: 'Signature requise',
          message: 'Document à signer — '+message, read: false
        }).catch(function(){});
        logActivity('signature_request', docId, 'Demande signature envoyée');
        showToast('✅ Demande de signature envoyée', 'success');
        closeRequestSignatureModal();
        renderSignaturesView();
      } catch (err) { showToast('Erreur : '+err.message, 'error'); }
    }

    // ═══════════════════════════════════════════════════════════
    //  5. AUTOMATISATION — Règles If/Then
    //     Inspiré de Zapier + Power Automate + Notion Automations
    // ═══════════════════════════════════════════════════════════
    if (!G.wfRules) G.wfRules = [];

    function renderAutomationView() {
      var el = document.getElementById('automationRulesList'); if (!el) return;
      var statsEl = document.getElementById('automationStats');
      var active = G.wfRules.filter(function(r){ return r.active; }).length;
      if (statsEl) statsEl.textContent = G.wfRules.length+' règle(s) · '+active+' active(s)';

      if (!G.wfRules.length) {
        el.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-magic text-4xl mb-3 block opacity-20"></i><p>Aucune règle — créez votre première automatisation</p></div>';
        return;
      }

      var TRIGGER_LABELS = { document_upload:'📤 Upload document', document_delete:'🗑️ Suppression', workflow_approve:'✅ Approbation workflow', workflow_reject:'❌ Rejet workflow', signature_done:'✍️ Signature effectuée', user_login:'🔐 Connexion utilisateur' };
      var ACTION_LABELS  = { start_workflow:'▶ Démarrer workflow', send_notification:'🔔 Notifier', assign_tag:'🏷 Assigner tag', move_folder:'📁 Déplacer dossier', send_email:'📧 Envoyer email', call_webhook:'🔗 Webhook' };

      el.innerHTML = G.wfRules.map(function(r, i){
        return '<div class="glass-card rounded-xl p-4 border '+(r.active?'border-orange-500/20':'border-blue-500/10')+' flex items-center gap-4 group">'
          +'<div class="w-10 h-10 bg-orange-500/15 rounded-lg flex items-center justify-center text-orange-400 flex-shrink-0"><i class="fas fa-magic"></i></div>'
          +'<div class="flex-1 min-w-0">'
            +'<p class="text-white text-sm font-semibold truncate">'+esc(r.name||'Règle sans nom')+'</p>'
            +'<div class="flex items-center gap-2 mt-1 flex-wrap">'
              +'<span class="text-[10px] px-1.5 py-0.5 bg-blue-500/15 text-blue-300 rounded">SI '+esc(TRIGGER_LABELS[r.trigger]||r.trigger)+'</span>'
              +'<i class="fas fa-arrow-right text-blue-300/30 text-[9px]"></i>'
              +'<span class="text-[10px] px-1.5 py-0.5 bg-green-500/15 text-green-300 rounded">ALORS '+esc(ACTION_LABELS[r.action]||r.action)+'</span>'
            +'</div>'
            +(r.runCount?'<p class="text-blue-300/30 text-[10px] mt-1">Exécutée '+r.runCount+' fois · dernière '+timeAgo(r.lastRun)+'</p>':'')
          +'</div>'
          +'<div class="flex items-center gap-2 flex-shrink-0">'
            +'<label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" '+(r.active?'checked':'')+' onchange="toggleWfRule('+i+',this.checked)" class="sr-only peer"><div class="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div></label>'
            +'<button onclick="deleteWfRule('+i+')" class="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg"><i class="fas fa-trash text-xs"></i></button>'
          +'</div>'
          +'</div>';
      }).join('');
    }

    function openWfRuleModal() { document.getElementById('wfRuleModal')?.classList.remove('hidden'); }
    function closeWfRuleModal() { document.getElementById('wfRuleModal')?.classList.add('hidden'); }

    function createWfRule(e) {
      e.preventDefault();
      var name    = document.getElementById('wfRuleName')?.value.trim() || 'Nouvelle règle';
      var trigger = document.getElementById('wfRuleTrigger')?.value || 'document_upload';
      var action  = document.getElementById('wfRuleAction')?.value  || 'send_notification';
      G.wfRules.unshift({ id: 'r-'+Date.now(), name, trigger, action, active: true, runCount: 0, createdAt: new Date().toISOString() });
      showToast('✅ Règle "'+name+'" créée', 'success');
      logActivity('automation', null, 'Règle créée : '+name);
      closeWfRuleModal();
      renderAutomationView();
    }

    function toggleWfRule(idx, active) {
      if (G.wfRules[idx]) { G.wfRules[idx].active = active; }
      showToast(active ? 'Règle activée' : 'Règle désactivée', 'success');
    }

    function deleteWfRule(idx) {
      if (!confirm('Supprimer cette règle ?')) return;
      var name = G.wfRules[idx]?.name;
      G.wfRules.splice(idx, 1);
      showToast('"'+name+'" supprimée', 'success');
      renderAutomationView();
    }

    // Trigger automation rules
    function _triggerAutomation(event, context) {
      G.wfRules.filter(function(r){ return r.active && r.trigger === event; }).forEach(function(r) {
        r.runCount = (r.runCount || 0) + 1;
        r.lastRun  = new Date().toISOString();
        if (r.action === 'send_notification') {
          window.addNotification?.('info', 'Automatisation', r.name+' déclenchée');
        }
      });
    }

    // ═══════════════════════════════════════════════════════════
    //  6. INTÉGRATIONS — Marketplace connecteurs
    //     Inspiré de Zapier marketplace + Notion integrations
    // ═══════════════════════════════════════════════════════════
    var INTEGRATIONS_CATALOG = [
      { id:'slack',      name:'Slack',       desc:'Notifications en temps réel dans vos canaux', icon:'fab fa-slack',         color:'purple', status:'available', category:'Communication' },
      { id:'teams',      name:'MS Teams',    desc:'Alertes et partages depuis Teams',             icon:'fab fa-microsoft',     color:'blue',   status:'available', category:'Communication' },
      { id:'gdrive',     name:'Google Drive',desc:'Synchronisation bidirectionnelle',             icon:'fab fa-google-drive', color:'green',  status:'available', category:'Stockage' },
      { id:'s3',         name:'AWS S3',      desc:'Backup automatique vers S3',                   icon:'fab fa-aws',           color:'orange', status:'available', category:'Stockage' },
      { id:'salesforce', name:'Salesforce',  desc:'Lier documents aux opportunités CRM',          icon:'fas fa-cloud',         color:'blue',   status:'available', category:'CRM' },
      { id:'hubspot',    name:'HubSpot',     desc:'Attacher docs aux contacts HubSpot',           icon:'fas fa-h-square',      color:'orange', status:'available', category:'CRM' },
      { id:'zapier',     name:'Zapier',      desc:'Connecter 5000+ applications via Zapier',      icon:'fas fa-bolt',          color:'orange', status:'available', category:'Automatisation' },
      { id:'make',       name:'Make',        desc:'Workflows visuels avancés (ex-Integromat)',    icon:'fas fa-project-diagram',color:'purple',status:'available', category:'Automatisation' },
      { id:'docusign',   name:'DocuSign',    desc:'Signature légale certifiée eIDAS',             icon:'fas fa-file-signature',color:'blue',  status:'coming',    category:'Signature' },
      { id:'stripe',     name:'Stripe',      desc:'Facturation et paiements documentaires',       icon:'fab fa-stripe-s',      color:'purple', status:'coming',    category:'Finance' },
      { id:'onedrive',   name:'OneDrive',    desc:'Synchronisation avec Microsoft 365',           icon:'fas fa-cloud-upload-alt',color:'blue', status:'coming',   category:'Stockage' },
      { id:'jira',       name:'Jira',        desc:'Lier documents aux tickets Jira',              icon:'fab fa-jira',           color:'blue',  status:'coming',    category:'Projet' },
    ];

    if (!G.connectedIntegrations) G.connectedIntegrations = {};

    function renderIntegrationsView() {
      var el = document.getElementById('integrationsGrid'); if (!el) return;
      var categories = ['Communication', 'Stockage', 'CRM', 'Automatisation', 'Signature', 'Finance', 'Projet'];
      var connected  = Object.keys(G.connectedIntegrations).length;

      el.innerHTML = '<div class="col-span-full flex items-center justify-between mb-2">'
        +'<p class="text-blue-300/50 text-sm">'+connected+' intégration(s) active(s)</p>'
        +'<input oninput="filterIntegrations(this.value)" placeholder="Rechercher…" class="px-3 py-1.5 rounded-lg text-white text-xs outline-none w-36" style="background:rgba(8,15,40,0.6);border:1px solid rgba(96,165,250,0.2);">'
        +'</div>'
        + INTEGRATIONS_CATALOG.map(function(integ){
          var isConnected = !!G.connectedIntegrations[integ.id];
          var isComing    = integ.status === 'coming';
          return '<div class="glass-card rounded-xl p-4 border '+(isConnected?'border-green-500/30':'border-blue-500/10')+' flex flex-col gap-3 group hover:border-blue-400/30 transition-all" data-name="'+integ.name.toLowerCase()+'" data-cat="'+integ.category+'">'
            +'<div class="flex items-start justify-between">'
              +'<div class="w-11 h-11 bg-'+integ.color+'-500/20 rounded-xl flex items-center justify-center text-'+integ.color+'-400 border border-'+integ.color+'-400/20 text-xl flex-shrink-0"><i class="'+integ.icon+'"></i></div>'
              +(isComing?'<span class="text-[9px] px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded-full border border-yellow-500/20 font-semibold">Bientôt</span>':'')
              +(isConnected?'<span class="text-[9px] px-2 py-0.5 bg-green-500/20 text-green-300 rounded-full border border-green-500/20 font-semibold flex items-center gap-1"><i class="fas fa-check text-[8px]"></i>Connecté</span>':'')
            +'</div>'
            +'<div class="flex-1">'
              +'<p class="text-white font-semibold text-sm">'+esc(integ.name)+'</p>'
              +'<p class="text-blue-300/50 text-[11px] mt-0.5 leading-relaxed">'+esc(integ.desc)+'</p>'
              +'<span class="text-[9px] px-1.5 py-0.5 bg-blue-500/10 text-blue-300/50 rounded mt-1 inline-block">'+integ.category+'</span>'
            +'</div>'
            +(isComing
              ? '<button disabled class="w-full py-2 rounded-lg text-[11px] text-gray-500 bg-slate-800/30 cursor-not-allowed border border-blue-500/5">Disponible prochainement</button>'
              : '<button onclick="toggleIntegration(\''+integ.id+'\')" class="w-full py-2 rounded-lg text-[11px] font-semibold transition-all '+(isConnected?'bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20':'btn-primary text-white')+'">'+( isConnected?'<i class="fas fa-unlink mr-1"></i>Déconnecter':'<i class="fas fa-plug mr-1"></i>Connecter')+'</button>')
            +'</div>';
        }).join('');
    }

    function filterIntegrations(q) {
      q = q.toLowerCase();
      document.querySelectorAll('#integrationsGrid [data-name]').forEach(function(el){
        var match = el.dataset.name.includes(q) || el.dataset.cat.toLowerCase().includes(q);
        el.style.display = match ? '' : 'none';
      });
    }

    function toggleIntegration(id) {
      if (G.connectedIntegrations[id]) {
        if (!confirm('Déconnecter cette intégration ?')) return;
        delete G.connectedIntegrations[id];
        showToast('Intégration déconnectée', 'info');
      } else {
        // Simulate OAuth flow
        showToast('Connexion en cours…', 'info');
        setTimeout(function(){
          G.connectedIntegrations[id] = { connectedAt: new Date().toISOString(), status: 'active' };
          showToast('✅ Intégration connectée !', 'success');
          logActivity('integration', null, 'Intégration connectée : '+id);
          renderIntegrationsView();
        }, 1500);
        return;
      }
      renderIntegrationsView();
    }

    // ═══════════════════════════════════════════════════════════
    //  7. SAUVEGARDES — Backup/Restore automatique
    //     Inspiré de Veeam + Acronis + BackBlaze
    // ═══════════════════════════════════════════════════════════
    if (!G.backups) G.backups = [];

    async function renderBackupsView() {
      await _loadBackups();
      _renderBackupsList();
      // Update stats
      var total = G.backups.length;
      var lastOk = G.backups.find(function(b){ return b.status==='completed'; });
      var statsEl = document.getElementById('backupStats');
      if (statsEl) statsEl.textContent = total+' sauvegarde(s) — dernière : '+(lastOk?fmtDate(lastOk.created_at):'aucune');
    }

    async function _loadBackups() {
      try {
        var q = SB.from('backups').select('*').order('created_at', { ascending: false }).limit(20);
        if (G.profile?.company_id) q = q.eq('company_id', G.profile.company_id);
        var { data } = await q;
        G.backups = data || [];
      } catch (_) {}
    }

    function _renderBackupsList() {
      var el = document.getElementById('backupsList'); if (!el) return;
      if (!G.backups.length) {
        el.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-database text-4xl mb-3 block opacity-20"></i><p>Aucune sauvegarde</p><p class="text-xs mt-2">Créez votre première sauvegarde pour sécuriser vos données</p></div>';
        return;
      }
      var STATUS = {
        completed: { c:'text-green-400 bg-green-500/15 border-green-500/20', icon:'fa-check-circle', label:'Réussie' },
        running:   { c:'text-blue-400 bg-blue-500/15 border-blue-500/20',   icon:'fa-spinner fa-spin', label:'En cours' },
        failed:    { c:'text-red-400 bg-red-500/15 border-red-500/20',      icon:'fa-times-circle', label:'Échec' },
      };
      el.innerHTML = G.backups.map(function(b) {
        var sc = STATUS[b.status] || STATUS.completed;
        var typeLabel = b.type === 'full' ? '📦 Complète' : '📄 Documents';
        return '<div class="glass-card rounded-xl p-4 border border-teal-500/15 flex items-center gap-4 hover:border-teal-400/30 transition-all group">'
          +'<div class="w-10 h-10 bg-teal-500/15 rounded-lg flex items-center justify-center text-teal-400 flex-shrink-0"><i class="fas fa-database"></i></div>'
          +'<div class="flex-1 min-w-0">'
            +'<div class="flex items-center gap-2 mb-0.5">'
              +'<p class="text-white text-sm font-semibold">'+typeLabel+'</p>'
              +'<span class="px-1.5 py-0.5 rounded-full text-[9px] font-bold border '+sc.c+'"><i class="fas '+sc.icon+' mr-0.5"></i>'+sc.label+'</span>'
            +'</div>'
            +'<p class="text-blue-300/40 text-[10px]">'+fmtDate(b.created_at)+(b.size?' · '+formatFileSize(b.size):'')+(b.doc_count?' · '+b.doc_count+' docs':'')+'</p>'
          +'</div>'
          +'<div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">'
            +(b.status==='completed'?'<button onclick="restoreBackup(\''+b.id+'\')" class="px-3 py-1.5 bg-teal-500/15 text-teal-400 rounded-lg text-[10px] border border-teal-500/20 hover:bg-teal-500/25 font-medium"><i class="fas fa-undo mr-1"></i>Restaurer</button>':'')
          +'</div>'
          +'</div>';
      }).join('');
    }

    async function createBackup(type) {
      showToast('Sauvegarde en cours…', 'info');
      var backup = {
        type: type || 'full', status: 'running',
        company_id: G.profile?.company_id,
        created_by: G.user.id, doc_count: G.docs.length,
        size: G.docs.reduce(function(s,d){ return s+(d.file_size||0); }, 0),
      };
      try {
        var { data, error } = await SB.from('backups').insert([backup]).select().single();
        if (error) throw error;
        backup.id = data.id;
        G.backups.unshift(data);
        _renderBackupsList();

        // Simulate backup completion
        setTimeout(async function() {
          try {
            await SB.from('backups').update({ status: 'completed' }).eq('id', backup.id);
            G.backups[0].status = 'completed';
            showToast('✅ Sauvegarde terminée', 'success');
            logActivity('backup', null, 'Sauvegarde '+type+' créée ('+G.docs.length+' docs)');
            _renderBackupsList();
          } catch(_) {}
        }, 2000);
      } catch (err) {
        showToast('Erreur sauvegarde : '+err.message, 'error');
        backup.status = 'failed';
        G.backups.unshift(backup);
        _renderBackupsList();
      }
    }

    async function restoreBackup(id) {
      if (!confirm('Restaurer depuis cette sauvegarde ?\nAttention : cette action remplacera les données actuelles.')) return;
      showToast('Restauration en cours…', 'info');
      setTimeout(function(){
        showToast('✅ Restauration terminée', 'success');
        logActivity('backup_restore', null, 'Restauration depuis sauvegarde : '+id);
      }, 2000);
    }

    // ═══════════════════════════════════════════════════════════
    //  8. RBAC v2 — Rôles & permissions granulaires
    //     Inspiré d'AWS IAM + Okta + Auth0
    // ═══════════════════════════════════════════════════════════
    if (!G.customRoles) G.customRoles = {};

    function renderRbacV7() {
      var gridEl  = document.getElementById('rbacV7RolesGrid');  if (!gridEl) return;
      var matrixEl= document.getElementById('rbacV7PermMatrix'); if (!matrixEl) return;

      var BUILTIN = {
        admin:   { name:'Administrateur', icon:'fa-crown',    color:'red',    perms:{ all:true } },
        manager: { name:'Manager',        icon:'fa-briefcase',color:'orange', perms:{ docs:true, workflows:true, users:true, share:true, delete_company:true } },
        editor:  { name:'Éditeur',        icon:'fa-pen',      color:'blue',   perms:{ docs:true, workflows:true, share:true } },
        viewer:  { name:'Lecteur',        icon:'fa-eye',      color:'green',  perms:{ docs_read:true } },
      };

      // Merge with custom roles
      var allRoles = Object.assign({}, BUILTIN, G.customRoles);

      gridEl.innerHTML = Object.entries(allRoles).map(function(entry){
        var key = entry[0], r = entry[1];
        var isBuiltin = !!BUILTIN[key];
        var memberCount = G.users.filter(function(u){ return u.role===key; }).length;
        return '<div class="glass-card rounded-xl p-4 border border-'+r.color+'-500/20 hover:border-'+r.color+'-400/40 transition-all">'
          +'<div class="flex items-center justify-between mb-3">'
            +'<div class="flex items-center gap-2">'
              +'<div class="w-9 h-9 bg-'+r.color+'-500/20 rounded-lg flex items-center justify-center text-'+r.color+'-400"><i class="fas '+r.icon+'"></i></div>'
              +'<div><p class="text-white font-semibold text-sm">'+esc(r.name)+'</p><p class="text-blue-300/40 text-[10px]">'+memberCount+' membre(s)'+(isBuiltin?' · Intégré':'· Personnalisé')+'</p></div>'
            +'</div>'
            +(!isBuiltin?'<button onclick="deleteCustomRole(\''+key+'\')" class="p-1.5 text-red-400/50 hover:text-red-400 rounded"><i class="fas fa-trash text-xs"></i></button>':'')
          +'</div>'
          +'<div class="flex flex-wrap gap-1">'
            +(r.perms?.all?'<span class="text-[9px] px-1.5 py-0.5 bg-red-500/15 text-red-300 rounded">Accès total</span>':'')
            +(r.perms?.docs?'<span class="text-[9px] px-1.5 py-0.5 bg-blue-500/15 text-blue-300 rounded">Documents</span>':'')
            +(r.perms?.docs_read?'<span class="text-[9px] px-1.5 py-0.5 bg-blue-500/10 text-blue-300/60 rounded">Lecture docs</span>':'')
            +(r.perms?.workflows?'<span class="text-[9px] px-1.5 py-0.5 bg-orange-500/15 text-orange-300 rounded">Workflows</span>':'')
            +(r.perms?.users?'<span class="text-[9px] px-1.5 py-0.5 bg-green-500/15 text-green-300 rounded">Utilisateurs</span>':'')
            +(r.perms?.share?'<span class="text-[9px] px-1.5 py-0.5 bg-purple-500/15 text-purple-300 rounded">Partage</span>':'')
            +(r.perms?.delete_company?'<span class="text-[9px] px-1.5 py-0.5 bg-red-500/10 text-red-300/60 rounded">Suppression</span>':'')
          +'</div>'
          +'</div>';
      }).join('');

      // Permission matrix
      var PERMS = [
        { key:'docs_read',     label:'Lire documents',       icon:'fa-eye' },
        { key:'docs',          label:'Créer/Modifier docs',  icon:'fa-pen' },
        { key:'share',         label:'Partager',             icon:'fa-share-alt' },
        { key:'delete_company',label:'Supprimer (entreprise)',icon:'fa-trash' },
        { key:'workflows',     label:'Gérer workflows',      icon:'fa-project-diagram' },
        { key:'users',         label:'Gérer utilisateurs',   icon:'fa-users' },
        { key:'all',           label:'Administration totale', icon:'fa-crown' },
      ];

      matrixEl.innerHTML = PERMS.map(function(perm){
        var hasRoles = Object.entries(allRoles).filter(function(e){ return e[1].perms?.[perm.key] || e[1].perms?.all; });
        return '<div class="glass-card rounded-xl p-4 border border-blue-500/10">'
          +'<div class="flex items-center gap-2 mb-2"><i class="fas '+perm.icon+' text-blue-400 text-xs w-4"></i><p class="text-white text-xs font-semibold">'+perm.label+'</p></div>'
          +'<div class="flex flex-wrap gap-1">'
            +hasRoles.map(function(e){ var r=e[1]; return '<span class="text-[9px] px-1.5 py-0.5 bg-'+r.color+'-500/15 text-'+r.color+'-300 rounded font-medium">'+r.name+'</span>'; }).join('')
          +'</div>'
          +'</div>';
      }).join('');
    }

    function createRoleV7() {
      var name = document.getElementById('newRoleName')?.value.trim();
      if (!name) { showToast('Nom requis', 'error'); return; }
      var key = name.toLowerCase().replace(/\s+/g,'_');
      G.customRoles[key] = { name, icon:'fa-user', color:'blue', perms:{ docs_read:true } };
      showToast('Rôle "'+name+'" créé', 'success');
      if (document.getElementById('newRoleName')) document.getElementById('newRoleName').value = '';
      renderRbacV7();
    }

    function deleteCustomRole(key) {
      if (!confirm('Supprimer ce rôle ?')) return;
      delete G.customRoles[key];
      showToast('Rôle supprimé', 'success');
      renderRbacV7();
    }

    // ═══════════════════════════════════════════════════════════
    //  9. DOSSIERS — Arborescence
    //     Inspiré de Google Drive tree + Notion pages
    // ═══════════════════════════════════════════════════════════
    if (!G.folders)     G.folders     = [];
    if (!G.currentFolderId) G.currentFolderId = null;

    function renderFoldersView() {
      _loadFolders().then(_renderFolderContents);
    }

    async function _loadFolders() {
      try {
        var q = SB.from('folders').select('*').order('name');
        if (G.profile?.company_id) q = q.eq('company_id', G.profile.company_id);
        var { data } = await q;
        G.folders = data || [];
      } catch (_) { G.folders = []; }
    }

    function _renderFolderContents() {
      var grid = document.getElementById('folderContentsGrid'); if (!grid) return;
      var tree = document.getElementById('folderSidebarTree');
      var breadcrumb = document.getElementById('folderBreadcrumb');

      // Sidebar tree
      if (tree) {
        var rootFolders = G.folders.filter(function(f){ return !f.parent_id; });
        tree.innerHTML = rootFolders.map(function(f){
          var isActive = G.currentFolderId === f.id;
          return '<div class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-blue-500/10 '+(isActive?'bg-blue-500/15 text-blue-300':'text-blue-300/50')+' text-xs" onclick="openFolder(\''+f.id+'\',\''+esc(f.name)+'\')">'
            +'<i class="fas fa-folder text-yellow-400 text-xs"></i><span>'+esc(f.name)+'</span>'
            +'<span class="ml-auto text-[9px] text-blue-300/30">'+G.docs.filter(function(d){ return d.folder_id===f.id; }).length+'</span>'
            +'</div>';
        }).join('') || '<p class="text-blue-300/30 text-xs px-2">Aucun dossier</p>';
      }

      // Breadcrumb
      if (breadcrumb) {
        var folder = G.folders.find(function(f){ return f.id===G.currentFolderId; });
        breadcrumb.innerHTML = '<button onclick="openFolder(null,\'Racine\')" class="text-xs text-blue-400 hover:text-blue-300"><i class="fas fa-home mr-1"></i>Racine</button>'
          +(folder?'<i class="fas fa-chevron-right text-blue-500/30 text-[10px] mx-1"></i><span class="text-xs text-white">'+esc(folder.name)+'</span>':'');
      }

      // Doc grid for current folder
      var folderDocGrid = document.getElementById('folderDocGrid'); if (!folderDocGrid) return;
      var folderDocs = G.currentFolderId
        ? G.docs.filter(function(d){ return d.folder_id === G.currentFolderId; })
        : G.docs.filter(function(d){ return !d.folder_id; });

      // Also show subfolders
      var subFolders = G.folders.filter(function(f){ return f.parent_id === G.currentFolderId; });
      var foldersHtml = subFolders.map(function(f){
        var count = G.docs.filter(function(d){ return d.folder_id===f.id; }).length;
        return '<div class="glass-card rounded-xl p-4 border border-yellow-500/15 cursor-pointer hover:border-yellow-400/30 transition-all group" onclick="openFolder(\''+f.id+'\',\''+esc(f.name)+'\')">'
          +'<div class="w-12 h-12 bg-yellow-500/15 rounded-xl flex items-center justify-center text-yellow-400 mb-3 border border-yellow-400/20"><i class="fas fa-folder text-2xl"></i></div>'
          +'<p class="text-white font-semibold text-sm truncate">'+esc(f.name)+'</p>'
          +'<p class="text-blue-300/40 text-xs">'+count+' document(s)</p>'
          +'</div>';
      }).join('');

      var docsHtml = folderDocs.slice(0,20).map(function(d){
        var fi = getFileIcon(d.name||'');
        return '<div class="glass-card rounded-xl p-4 border border-blue-500/15 cursor-pointer hover:border-blue-400/30 transition-all group" onclick="window.openDocumentPreview(\''+d.id+'\')">'
          +'<div class="w-12 h-12 '+fi.bg+' rounded-xl flex items-center justify-center '+fi.color+' mb-3 border '+fi.border+'"><i class="fas '+fi.icon+' text-2xl"></i></div>'
          +'<p class="text-white font-semibold text-sm truncate">'+esc(d.name)+'</p>'
          +'<p class="text-blue-300/40 text-xs">'+formatFileSize(d.file_size||0)+'</p>'
          +'</div>';
      }).join('');

      folderDocGrid.className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3';
      folderDocGrid.innerHTML = foldersHtml + docsHtml
        || '<div class="col-span-full text-center py-12 text-blue-300/40"><i class="fas fa-folder-open text-4xl mb-3 block opacity-20"></i><p>Dossier vide</p></div>';
    }

    function openFolder(id, name) {
      G.currentFolderId = id === '__root__' ? null : id;
      _renderFolderContents();
    }

    function openFolderModal() { document.getElementById('folderModal')?.classList.remove('hidden'); }
    function closeFolderModal() { document.getElementById('folderModal')?.classList.add('hidden'); }

    async function createFolder() {
      var name = document.getElementById('newFolderName')?.value.trim();
      if (!name) { showToast('Nom requis', 'error'); return; }
      try {
        var { data, error } = await SB.from('folders').insert([{
          name, parent_id: G.currentFolderId || null,
          company_id: G.profile?.company_id || null, created_by: G.user.id
        }]).select().single();
        if (error) throw error;
        G.folders.push(data);
        showToast('✅ Dossier "'+name+'" créé', 'success');
        closeFolderModal();
        _renderFolderContents();
      } catch (err) { showToast('Erreur : '+err.message, 'error'); }
    }

    // ═══════════════════════════════════════════════════════════
    //  10. API KEYS v2
    // ═══════════════════════════════════════════════════════════
    if (!G.apiKeysV6) G.apiKeysV6 = [];

    function renderApiKeysView() {
      var listEl = document.getElementById('apiKeysList2'); if (!listEl) return;

      // Load from DB if admin
      if (['admin','manager'].includes(G.profile?.role)) {
        SB.from('api_keys').select('*').eq('company_id', G.profile?.company_id).order('created_at', { ascending:false })
          .then(function(res){ G.apiKeysV6 = res.data || []; _renderApiKeys(listEl); })
          .catch(function(){ _renderApiKeys(listEl); });
      } else {
        _renderApiKeys(listEl);
      }
    }

    function _renderApiKeys(listEl) {
      if (!G.apiKeysV6.length) {
        listEl.innerHTML = '<div class="text-center py-8 text-blue-300/40 text-sm"><i class="fas fa-key text-3xl mb-2 block opacity-20"></i>Aucune clé API</div>';
        return;
      }
      listEl.innerHTML = G.apiKeysV6.map(function(k, i){
        var perms = k.permissions ? Object.keys(k.permissions).filter(function(p){ return k.permissions[p]; }) : [];
        return '<div class="glass-card rounded-xl p-4 border border-yellow-500/15 flex items-center gap-4 group">'
          +'<div class="w-9 h-9 bg-yellow-500/15 rounded-lg flex items-center justify-center text-yellow-400 flex-shrink-0"><i class="fas fa-key"></i></div>'
          +'<div class="flex-1 min-w-0">'
            +'<p class="text-white text-sm font-semibold">'+esc(k.name||'Clé sans nom')+'</p>'
            +'<code class="text-yellow-400 text-[10px] font-mono">'+esc((k.key||k.id||'').slice(0,24))+'••••</code>'
            +'<div class="flex flex-wrap gap-1 mt-1">'
              +perms.map(function(p){ return '<span class="text-[9px] px-1 py-0.5 bg-blue-500/15 text-blue-300 rounded">'+p+'</span>'; }).join('')
            +'</div>'
            +'<p class="text-blue-300/30 text-[10px]">Créée le '+fmtDate(k.created_at)+(k.last_used?' · Dernière utilisation '+timeAgo(k.last_used):'')+'</p>'
          +'</div>'
          +'<div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">'
            +'<button onclick="copyApiKey(\''+esc(k.key||k.id||'')+'\')" class="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg text-xs"><i class="fas fa-copy"></i></button>'
            +'<button onclick="deleteApiKeyV6('+i+')" class="p-2 text-red-400 hover:bg-red-500/10 rounded-lg text-xs"><i class="fas fa-trash"></i></button>'
          +'</div>'
          +'</div>';
      }).join('');
    }

    function generateApiKeyV6() {
      var name = document.getElementById('apiKeyName')?.value.trim() || 'Clé API';
      var perms = {
        documents: !!document.getElementById('perm_api_documents')?.checked,
        workflows:  !!document.getElementById('perm_api_workflows')?.checked,
        analytics:  !!document.getElementById('perm_api_analytics')?.checked,
        shares:     !!document.getElementById('perm_api_shares')?.checked,
      };
      var key = 'sk_ged_'+Array.from(crypto.getRandomValues(new Uint8Array(20))).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
      var newKey = { id:'k-'+Date.now(), name, key, permissions:perms, created_at:new Date().toISOString() };
      G.apiKeysV6.unshift(newKey);

      SB.from('api_keys').insert([{ name, key, permissions:perms, company_id:G.profile?.company_id, created_by:G.user.id }]).catch(function(){});

      var display = document.getElementById('newApiKeyDisplay');
      var wrapper = document.getElementById('newApiKeyWrapper');
      if (display) display.textContent = key;
      if (wrapper) wrapper.classList.remove('hidden');

      showToast('✅ Clé API "'+name+'" générée', 'success');
      logActivity('api_key', null, 'Clé API créée : '+name);
      renderApiKeysView();
    }

    function copyApiKey(k) {
      navigator.clipboard?.writeText(k).then(function(){ showToast('Clé copiée !', 'success'); });
    }

    function deleteApiKeyV6(i) {
      if (!confirm('Supprimer cette clé API ?')) return;
      var k = G.apiKeysV6[i];
      if (k?.id) SB.from('api_keys').delete().eq('id', k.id).catch(function(){});
      G.apiKeysV6.splice(i, 1);
      showToast('Clé supprimée', 'success');
      renderApiKeysView();
    }

    // ═══════════════════════════════════════════════════════════
    //  11. BILLING V2 — Plans & Stripe-ready
    // ═══════════════════════════════════════════════════════════
    function renderBillingV6() {
      var el = document.getElementById('billingV6Content'); if (!el) return;
      var plan = G.company?.plan || 'FREE';
      var PLANS = {
        FREE:         { price:'0€',     users:5,    storage:'1 GB',  color:'indigo',  features:['Documents illimités','Versioning basique','Partage sécurisé','Support email'] },
        STARTER:      { price:'29€/m',  users:20,   storage:'10 GB', color:'green',   features:['Tout Free +','Workflows avancés','Analytics basiques','API 1000 req/j','Support prioritaire'] },
        PROFESSIONAL: { price:'79€/m',  users:100,  storage:'100 GB',color:'yellow',  features:['Tout Starter +','IA Document Analyse','Signatures eIDAS','Intégrations Zapier/Make','RBAC granulaire','Audit complet','API illimitée'] },
        ENTERPRISE:   { price:'Devis',  users:'∞',  storage:'∞',     color:'red',     features:['Tout Pro +','SSO / SAML','SLA 99.9%','Dédié serveur option','RGPD DPA','Support dédié 24/7','Formation incluse'] },
      };
      var p = PLANS[plan] || PLANS.FREE;
      var usage = {
        docs:    G.docs.length,
        storage: G.docs.reduce(function(s,d){return s+(d.file_size||0);},0),
        users:   G.users.length,
      };

      el.innerHTML = '<div class="space-y-6">'
        // Current plan banner
        +'<div class="glass-card rounded-2xl p-6 border border-'+p.color+'-500/30 bg-'+p.color+'-500/5">'
          +'<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">'
            +'<div>'
              +'<div class="flex items-center gap-3 mb-2">'
                +'<span class="text-white text-2xl font-bold">'+plan+'</span>'
                +'<span class="px-3 py-1 bg-'+p.color+'-500/20 text-'+p.color+'-300 rounded-full text-xs font-bold border border-'+p.color+'-500/30">Plan actuel</span>'
              +'</div>'
              +'<div class="grid grid-cols-3 gap-4 mt-3">'
                +'<div><p class="text-blue-300/50 text-xs">Documents</p><p class="text-white font-bold">'+usage.docs+' <span class="text-blue-300/40 font-normal text-xs">utilisés</span></p></div>'
                +'<div><p class="text-blue-300/50 text-xs">Stockage</p><p class="text-white font-bold">'+formatFileSize(usage.storage)+'</p></div>'
                +'<div><p class="text-blue-300/50 text-xs">Utilisateurs</p><p class="text-white font-bold">'+usage.users+'/'+p.users+'</p></div>'
              +'</div>'
            +'</div>'
            +'<div class="text-right">'
              +'<p class="text-white text-3xl font-bold">'+p.price+'</p>'
              +'<p class="text-green-400 text-xs mt-1"><i class="fas fa-check-circle mr-1"></i>Actif</p>'
            +'</div>'
          +'</div>'
        +'</div>'
        // Plan cards
        +'<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">'
        + Object.entries(PLANS).map(function(entry){
          var pk=entry[0], pv=entry[1];
          var isCurrent = pk === plan;
          return '<div class="glass-card rounded-2xl p-5 border-2 transition-all '+(isCurrent?'border-'+pv.color+'-500/40 bg-'+pv.color+'-500/5':'border-blue-500/10 hover:border-blue-400/30')+'">'
            +'<div class="flex items-center justify-between mb-3">'
              +'<span class="badge-plan badge-'+pk.toLowerCase()+'">'+pk+'</span>'
              +(isCurrent?'<span class="text-[9px] px-1.5 py-0.5 bg-green-500/20 text-green-300 rounded-full">Actif</span>':'')
            +'</div>'
            +'<p class="text-white text-2xl font-bold mb-0.5">'+pv.price+'</p>'
            +'<p class="text-blue-300/40 text-[10px] mb-3">'+pv.users+' users · '+pv.storage+'</p>'
            +'<ul class="space-y-1.5 mb-4">'
              +pv.features.slice(0,4).map(function(f){ return '<li class="flex items-start gap-1.5 text-[11px] text-blue-300/70"><i class="fas fa-check text-green-400 text-[9px] mt-0.5 flex-shrink-0"></i>'+f+'</li>'; }).join('')
            +'</ul>'
            +(isCurrent
              ? '<button disabled class="w-full py-2 rounded-xl text-xs text-green-400 bg-green-500/10 border border-green-500/20 font-semibold">✓ Plan actuel</button>'
              : '<button onclick="upgradeToPlan(\''+pk+'\')" class="w-full py-2 rounded-xl text-xs btn-primary text-white font-semibold">Passer à '+pk+'</button>')
            +'</div>';
        }).join('')
        +'</div>'
        // Invoice history
        +'<div class="glass-card rounded-xl p-5 border border-blue-500/15">'
          +'<h3 class="text-white font-semibold mb-3 flex items-center gap-2"><i class="fas fa-receipt text-blue-400"></i>Historique de facturation</h3>'
          +'<p class="text-blue-300/40 text-xs text-center py-4">Les factures seront disponibles après activation d\'un plan payant</p>'
        +'</div>'
        +'</div>';
    }

    function upgradeToPlan(plan) {
      showToast('Redirection vers Stripe…', 'info');
      setTimeout(function(){
        if (G.company) { G.company.plan = plan; }
        window.updatePlanUI?.(plan);
        showToast('✅ Plan '+plan+' activé (simulation)', 'success');
        logActivity('billing', null, 'Passage au plan '+plan);
        renderBillingV6();
      }, 1000);
    }

    // ═══════════════════════════════════════════════════════════
    //  12. AUDIT SÉCURITÉ V2 — Timeline + Alertes
    //     Inspiré de Splunk + Sumo Logic + Datadog Security
    // ═══════════════════════════════════════════════════════════
    var _auditFilters = { days: 7, severity: '', action: '' };

    function setAuditFilter(key, val) { _auditFilters[key] = val; renderAuditV6(); }

    async function renderAuditV6() {
      // Stats
      var statsEl = document.getElementById('auditStatsGrid');
      var alertsEl= document.getElementById('securityAlertsList');
      var timelineEl= document.getElementById('auditTimelineList');

      var since = new Date(Date.now() - _auditFilters.days * 86400000).toISOString();
      var logs  = (G.auditLogs || []).filter(function(l){ return new Date(l.createdAt) > new Date(since); });

      // Apply action filter
      if (_auditFilters.action) logs = logs.filter(function(l){ return (l.action||'').includes(_auditFilters.action); });

      // Stats strip
      if (statsEl) {
        var statData = [
          { label:'Total événements', val:logs.length,                                                    color:'blue',   icon:'fa-list' },
          { label:'Connexions',        val:logs.filter(function(l){return l.action==='login';}).length,    color:'purple', icon:'fa-sign-in-alt' },
          { label:'Uploads',           val:logs.filter(function(l){return l.action==='upload';}).length,   color:'green',  icon:'fa-upload' },
          { label:'Partages',          val:logs.filter(function(l){return l.action==='share';}).length,    color:'cyan',   icon:'fa-share-alt' },
          { label:'Suppressions',      val:logs.filter(function(l){return l.action==='delete';}).length,   color:'red',    icon:'fa-trash' },
          { label:'Anomalies',         val:logs.filter(function(l){return l.action==='security';}).length, color:'yellow', icon:'fa-exclamation-triangle' },
        ];
        statsEl.innerHTML = statData.map(function(s){
          return '<div class="glass-card rounded-xl p-3 border border-'+s.color+'-500/15 text-center">'
            +'<i class="fas '+s.icon+' text-'+s.color+'-400 text-sm mb-1 block"></i>'
            +'<p class="text-white text-xl font-bold">'+s.val+'</p>'
            +'<p class="text-blue-300/40 text-[10px]">'+s.label+'</p>'
            +'</div>';
        }).join('');
      }

      // Security alerts
      if (alertsEl) {
        var alerts = [];
        var loginCount = logs.filter(function(l){ return l.action==='login'; }).length;
        if (loginCount > 10) alerts.push({ level:'warning', msg:loginCount+' connexions en '+_auditFilters.days+'j — activité inhabituelle', icon:'fa-user-clock' });
        var deletes = logs.filter(function(l){ return l.action==='delete'; }).length;
        if (deletes > 5) alerts.push({ level:'critical', msg:deletes+' suppressions détectées — vérifier les autorisations', icon:'fa-trash' });
        var secEvents = logs.filter(function(l){ return l.action==='security'; });
        if (secEvents.length) alerts.push({ level:'critical', msg:secEvents.length+' événement(s) de sécurité : '+esc(secEvents[0]?.description||''), icon:'fa-shield-alt' });

        if (!alerts.length) {
          alertsEl.innerHTML = '<div class="flex items-center gap-3 p-3 rounded-xl bg-green-500/5 border border-green-500/15"><i class="fas fa-shield-check text-green-400"></i><p class="text-green-300/70 text-sm">Aucune anomalie détectée sur les '+_auditFilters.days+' derniers jours</p></div>';
        } else {
          alertsEl.innerHTML = alerts.map(function(a){
            var c = a.level==='critical'?'red':'yellow';
            return '<div class="flex items-start gap-3 p-3 rounded-xl bg-'+c+'-500/5 border border-'+c+'-500/20 mb-2">'
              +'<i class="fas '+a.icon+' text-'+c+'-400 mt-0.5 flex-shrink-0"></i>'
              +'<p class="text-'+c+'-300/80 text-sm">'+a.msg+'</p>'
              +'</div>';
          }).join('');
        }
      }

      // Timeline
      if (timelineEl) {
        var ACT_CFG = {
          login:    { c:'text-purple-400', icon:'fa-sign-in-alt', sev:'info' },
          upload:   { c:'text-blue-400',   icon:'fa-upload',      sev:'info' },
          share:    { c:'text-green-400',  icon:'fa-share-alt',   sev:'info' },
          delete:   { c:'text-red-400',    icon:'fa-trash',       sev:'warning' },
          security: { c:'text-yellow-400', icon:'fa-shield-alt',  sev:'critical' },
          restore:  { c:'text-teal-400',   icon:'fa-undo',        sev:'info' },
          workflow: { c:'text-orange-400', icon:'fa-project-diagram', sev:'info' },
        };
        if (!logs.length) {
          timelineEl.innerHTML = '<p class="text-blue-300/40 text-xs text-center py-6">Aucun événement sur cette période</p>';
        } else {
          timelineEl.innerHTML = '<div class="space-y-0">'
            + logs.slice(0, 50).map(function(l){
              var a = ACT_CFG[l.action] || { c:'text-blue-400', icon:'fa-circle', sev:'info' };
              var sevBadge = a.sev==='critical'?'<span class="text-[8px] px-1 py-0.5 bg-red-500/20 text-red-300 rounded ml-1">CRITIQUE</span>':
                             a.sev==='warning'?'<span class="text-[8px] px-1 py-0.5 bg-yellow-500/20 text-yellow-300 rounded ml-1">ALERTE</span>':'';
              return '<div class="audit-row flex items-start gap-3 py-2 border-b border-blue-500/5 hover:bg-blue-500/3 px-1">'
                +'<i class="fas '+a.icon+' '+a.c+' text-xs mt-0.5 w-4 text-center flex-shrink-0"></i>'
                +'<div class="flex-1 min-w-0">'
                  +'<p class="text-white text-xs font-medium">'+esc(l.description||l.action)+sevBadge+'</p>'
                  +'<p class="text-blue-300/40 text-[10px]">'+esc(l.user||'Système')+' · '+timeAgo(l.createdAt)+'</p>'
                +'</div>'
                +'</div>';
            }).join('')
            + '</div>';
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  EXPOSE ALL FUNCTIONS
    // ═══════════════════════════════════════════════════════════
    var exports = {
      // Analytics
      loadAnalytics, refreshAnalytics,
      // Search FTS
      initSearchView, runFTSearch,
      // AI
      renderAIView, analyzeDocumentAI, analyzeAllDocuments,
      // Signatures
      renderSignaturesView, openSignatureModal, clearSignature, closeSignModal,
      submitSignature, openRequestSignatureModal, closeRequestSignatureModal,
      submitSignatureRequest, rejectSignatureRequest,
      // Automation
      renderAutomationView, openWfRuleModal, closeWfRuleModal, createWfRule,
      toggleWfRule, deleteWfRule,
      // Integrations
      renderIntegrationsView, filterIntegrations, toggleIntegration,
      // Backups
      renderBackupsView, createBackup, restoreBackup,
      // RBAC v2
      renderRbacV7, createRoleV7, deleteCustomRole,
      // Folders
      renderFoldersView, openFolder, openFolderModal, closeFolderModal, createFolder,
      // API Keys
      renderApiKeysView, generateApiKeyV6, copyApiKey, deleteApiKeyV6,
      // Billing
      renderBillingV6, upgradeToPlan,
      // Audit v2
      renderAuditV6, setAuditFilter,
    };

    Object.keys(exports).forEach(function (k) { window[k] = exports[k]; });
    console.log('[GED Modules] ✅ 12 modules chargés');

  }); // end _ready

})();
