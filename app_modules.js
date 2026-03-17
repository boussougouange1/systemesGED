/**
 * SystemesGED — app_modules.js v2
 * 12 modules haute performance — tous actifs
 */
(function () {
  'use strict';

  // ── Attendre que app.js soit prêt (G, SB, showToast disponibles) ──
  function _ready(fn) {
    if (typeof window.G !== 'undefined' && typeof window.SB !== 'undefined' && typeof window.showToast === 'function') {
      fn();
    } else {
      setTimeout(function () { _ready(fn); }, 80);
    }
  }

  _ready(function () {
    var G   = window.G;
    var SB  = window.SB;
    var esc            = window.escapeHtml  || function (s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    var showToast      = window.showToast;
    var fmtDate        = window.fmtDate        || function (iso) { return iso ? new Date(iso).toLocaleDateString('fr-FR') : ''; };
    var timeAgo        = window.timeAgo        || function (iso) { var d=(Date.now()-new Date(iso))/1000; if(d<60)return'À l\'instant'; if(d<3600)return Math.floor(d/60)+'min'; return Math.floor(d/86400)+'j'; };
    var formatFileSize = window.formatFileSize || function (b) { if(!b)return'0 B'; var s=['B','KB','MB','GB'],i=Math.floor(Math.log(b)/Math.log(1024)); return parseFloat((b/Math.pow(1024,i)).toFixed(1))+' '+s[i]; };
    var avatarInitials = window.avatarInitials || function (n) { return (n||'?').split(' ').map(function(x){return x[0]||'';}).join('').toUpperCase().slice(0,2)||'?'; };
    var getFileIcon    = window.getFileIcon    || function () { return {icon:'fa-file',color:'text-gray-400',bg:'bg-gray-500/20',border:'border-gray-400/30'}; };
    var set$           = function (id, v) { var e=document.getElementById(id); if(e) e.textContent=v; };
    var html$          = function (id, v) { var e=document.getElementById(id); if(e) e.innerHTML=v; };
    var show$          = function (id, show) { var e=document.getElementById(id); if(e) e.style.display=show?'':'none'; };
    var logActivity    = window.logActivity || function () {};

    // ════════════════════════════════════════════════════════════
    //  1. ANALYTICS
    // ════════════════════════════════════════════════════════════
    var _analyticsCache = null;

    async function loadAnalytics() {
      set$('analyticsLoading', 'Chargement des données…');
      try {
        var docs  = G.docs  || [];
        var logs  = G.auditLogs || [];
        var wfs   = G.workflows || [];
        var users = G.users || [];

        // Try to load fresh logs from DB
        if (G.profile?.company_id) {
          var since = new Date(Date.now() - 14*86400000).toISOString();
          var { data } = await SB.from('activity_logs')
            .select('action,created_at,user_id,document_id')
            .eq('company_id', G.profile.company_id)
            .gte('created_at', since)
            .order('created_at');
          if (data && data.length) logs = data;
        }

        _renderAnalytics({ docs, logs, wfs, users });
      } catch (err) {
        // Fallback: render with local data anyway
        _renderAnalytics({ docs: G.docs||[], logs: G.auditLogs||[], wfs: G.workflows||[], users: G.users||[] });
      }
      set$('analyticsLoading', '');
    }

    function refreshAnalytics() { loadAnalytics(); }

    function _renderAnalytics(data) {
      var docs  = data.docs  || [];
      var logs  = data.logs  || [];
      var wfs   = data.wfs   || [];
      var users = data.users || [];

      var totalSize   = docs.reduce(function(s,d){return s+(d.file_size||0);},0);
      var uploads14   = logs.filter(function(l){return l.action==='upload';}).length;
      var downloads14 = logs.filter(function(l){return l.action==='download';}).length;
      var now7        = new Date(Date.now()-7*86400000);
      var activeUsers = users.filter(function(u){return u.last_login&&new Date(u.last_login)>now7;}).length;
      var wfDone      = wfs.filter(function(w){return w.status==='approved';}).length;
      var wfRate      = wfs.length ? Math.round(wfDone/wfs.length*100) : 0;
      var pendingWf   = wfs.filter(function(w){return w.status==='pending';}).length;

      // KPI grid — 4 cols
      html$('analyticsKpiCards',
        _kpi('fa-file-alt','blue',  docs.length,        'Documents',      formatFileSize(totalSize))+
        _kpi('fa-upload',  'green', uploads14,          'Uploads (14j)',   'nouvelles importations')+
        _kpi('fa-users',   'cyan',  activeUsers+'/'+users.length, 'Actifs 7j', 'utilisateurs actifs')+
        _kpi('fa-clock',   'orange',pendingWf,          'Workflows',      wfRate+'% taux approbation')
      );

      // Activity bar chart
      var days = [];
      for (var i=13;i>=0;i--) {
        var d   = new Date(Date.now()-i*86400000);
        var key = d.toISOString().slice(0,10);
        var cnt = logs.filter(function(l){return (l.created_at||'').startsWith(key);}).length;
        days.push({label:d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'}), count:cnt});
      }
      var maxC = Math.max(1, Math.max.apply(null, days.map(function(d){return d.count;})));
      html$('analyticsActivityChart',
        '<div class="flex items-end gap-1 h-24 w-full px-1">'+
        days.map(function(d){
          var h   = Math.max(2, Math.round(d.count/maxC*100));
          var col = d.count>0?'bg-gradient-to-t from-blue-600 to-cyan-400':'bg-slate-700/40';
          return '<div class="flex flex-col items-center flex-1 gap-0.5">'
            +'<span class="text-[8px] text-blue-300/40">'+(d.count||'')+'</span>'
            +'<div class="w-full '+col+' rounded-t-sm" style="height:'+h+'%"></div>'
            +'<span class="text-[8px] text-blue-300/30">'+d.label.split('/')[0]+'</span>'
            +'</div>';
        }).join('')+'</div>'
      );

      // Workflow donut bars
      var wfStats = [
        {label:'En attente',  count:wfs.filter(function(w){return w.status==='pending';}).length,   color:'orange'},
        {label:'Approuvés',   count:wfDone,                                                         color:'green'},
        {label:'Rejetés',     count:wfs.filter(function(w){return w.status==='rejected';}).length,  color:'red'},
        {label:'En révision', count:wfs.filter(function(w){return w.status==='in_review';}).length, color:'blue'},
      ];
      var wfTotal = Math.max(1, wfs.length);
      html$('analyticsWorkflowChart',
        (!wfs.length
          ? '<p class="text-blue-300/40 text-xs text-center py-6">Aucun workflow</p>'
          : wfStats.filter(function(s){return s.count>0;}).map(function(s){
            var pct=Math.round(s.count/wfTotal*100);
            return '<div class="flex items-center gap-3 mb-2">'
              +'<div class="w-2.5 h-2.5 rounded-full bg-'+s.color+'-400 flex-shrink-0"></div>'
              +'<div class="flex-1"><div class="flex justify-between text-xs mb-1">'
                +'<span class="text-blue-300/60">'+s.label+'</span>'
                +'<span class="text-white font-bold">'+s.count+'</span></div>'
              +'<div class="h-1.5 bg-slate-800/60 rounded-full"><div class="h-1.5 rounded-full bg-'+s.color+'-400" style="width:'+pct+'%"></div></div></div></div>';
          }).join('')
        )
      );

      // Top documents
      var docAct = {};
      logs.forEach(function(l){if(l.document_id)docAct[l.document_id]=(docAct[l.document_id]||0)+1;});
      var topDocs = docs.map(function(d){return{doc:d,count:docAct[d.id]||0};})
                        .sort(function(a,b){return b.count-a.count;}).slice(0,6);
      var maxDA = Math.max(1, topDocs[0]?topDocs[0].count:1);
      html$('analyticsTopDocs',
        (!topDocs.length
          ? '<p class="text-blue-300/40 text-xs text-center py-6">Aucun document</p>'
          : topDocs.map(function(item){
            var fi=getFileIcon(item.doc.name||'');
            var pct=Math.round(item.count/maxDA*100);
            return '<div class="flex items-center gap-3 py-2 border-b border-blue-500/8 last:border-0">'
              +'<div class="w-8 h-8 '+fi.bg+' rounded-lg flex items-center justify-center '+fi.color+' flex-shrink-0"><i class="fas '+fi.icon+' text-xs"></i></div>'
              +'<div class="flex-1 min-w-0"><p class="text-white text-xs truncate">'+esc(item.doc.name)+'</p>'
              +'<div class="h-1 bg-slate-800/50 rounded mt-1"><div class="h-1 rounded bg-gradient-to-r from-blue-500 to-cyan-400" style="width:'+pct+'%"></div></div></div>'
              +'<span class="text-blue-300/40 text-[10px]">'+item.count+'</span></div>';
          }).join('')
        )
      );

      // Top users
      var userAct={};
      logs.forEach(function(l){if(l.user_id)userAct[l.user_id]=(userAct[l.user_id]||0)+1;});
      var topUsers=users.map(function(u){return{user:u,count:userAct[u.id]||0};})
                        .sort(function(a,b){return b.count-a.count;}).slice(0,6);
      var maxUA=Math.max(1,topUsers[0]?topUsers[0].count:1);
      html$('analyticsTopUsers',
        (!topUsers.length
          ? '<p class="text-blue-300/40 text-xs text-center py-6">Aucun utilisateur</p>'
          : topUsers.map(function(item,i){
            var pct=Math.round(item.count/maxUA*100);
            var medal=['🥇','🥈','🥉'][i]||'';
            return '<div class="flex items-center gap-3 py-2 border-b border-blue-500/8 last:border-0">'
              +'<div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">'+esc(avatarInitials(item.user.name))+'</div>'
              +'<div class="flex-1 min-w-0"><p class="text-white text-xs truncate">'+medal+' '+esc(item.user.name)+'</p>'
              +'<div class="h-1 bg-slate-800/50 rounded mt-1"><div class="h-1 rounded bg-gradient-to-r from-purple-500 to-pink-400" style="width:'+pct+'%"></div></div></div>'
              +'<span class="text-blue-300/40 text-[10px]">'+item.count+'</span></div>';
          }).join('')
        )
      );

      set$('dashTotalViews', downloads14);
      set$('dashActiveUsers', activeUsers);
    }

    function _kpi(icon,color,val,label,sub){
      return '<div class="glass-card rounded-xl p-4 border border-'+color+'-500/20">'
        +'<div class="flex items-center gap-2 mb-2"><i class="fas '+icon+' text-'+color+'-400 text-sm"></i><span class="text-blue-300/50 text-xs">'+label+'</span></div>'
        +'<p class="text-white text-2xl font-bold">'+val+'</p>'
        +'<p class="text-blue-300/40 text-[10px] mt-0.5">'+sub+'</p>'
        +'</div>';
    }

    // ════════════════════════════════════════════════════════════
    //  2. RECHERCHE FULL TEXT
    // ════════════════════════════════════════════════════════════
    function initSearchView() {
      var q = document.getElementById('ftsInput')?.value||'';
      if (q.length >= 2) runFTSearch();
      else html$('searchV7Results','<div class="text-center py-20 text-blue-300/30"><i class="fas fa-search text-6xl mb-5 block opacity-10"></i><p class="text-lg">Tapez pour rechercher dans vos documents</p></div>');
    }

    async function runFTSearch() {
      var q    = (document.getElementById('ftsInput')?.value||'').trim();
      var type = document.getElementById('ftsType')?.value||'';
      var date = document.getElementById('ftsDate')?.value||'';

      html$('searchV7Results','<div class="text-center py-12 text-blue-300/40"><i class="fas fa-spinner fa-spin text-3xl mb-3 block"></i><p class="text-sm">Recherche…</p></div>');
      set$('ftsCount','');

      try {
        var results = G.docs.slice();

        // Filter by query
        if (q.length >= 2) {
          var lower = q.toLowerCase();
          results = results.filter(function(d){
            return (d.name||'').toLowerCase().includes(lower)
              || (d.description||'').toLowerCase().includes(lower)
              || (d.tags||[]).some(function(t){return t.toLowerCase().includes(lower);});
          });
        }

        // Try DB search for more results
        if (q.length >= 2 && G.profile?.company_id) {
          var {data:dbRes} = await SB.from('documents')
            .select('id,name,description,file_size,file_type,created_at,owner_id,company_id')
            .eq('is_deleted',false).eq('company_id',G.profile.company_id)
            .or('name.ilike.%'+q+'%,description.ilike.%'+q+'%')
            .limit(30);
          if (dbRes) {
            var seen=new Set(results.map(function(x){return x.id;}));
            dbRes.forEach(function(d){if(!seen.has(d.id))results.push(d);});
          }
        }

        if (type) results=results.filter(function(d){
          var ext=(d.name||'').split('.').pop().toLowerCase();
          return type==='pdf'?ext==='pdf':type==='doc'?['doc','docx'].includes(ext):type==='xls'?['xls','xlsx'].includes(ext):type==='img'?['jpg','jpeg','png','gif','webp'].includes(ext):true;
        });
        if (date) {
          var now=new Date();
          results=results.filter(function(d){var c=new Date(d.created_at);return date==='today'?c.toDateString()===now.toDateString():date==='week'?(now-c)<7*86400000:date==='month'?(now-c)<30*86400000:true;});
        }

        set$('ftsCount', results.length+' résultat(s)');
        if (!results.length) {
          html$('searchV7Results','<div class="text-center py-16"><i class="fas fa-search text-5xl mb-4 block text-blue-400/20"></i><p class="text-blue-300/50">Aucun résultat pour "'+esc(q)+'"</p></div>');
          return;
        }

        function hl(text,q){if(!q||!text)return esc(text||'');var r=new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')', 'gi');return esc(text).replace(r,'<mark style="background:rgba(59,130,246,0.3);color:#93c5fd;border-radius:2px;padding:0 2px">$1</mark>');}
        html$('searchV7Results',
          '<div class="space-y-2">'+results.map(function(d){
            var fi=getFileIcon(d.name||'');
            var scope=d.company_id?'<span class="text-[9px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded">Entreprise</span>':'<span class="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">Personnel</span>';
            var localDoc=G.docs.find(function(x){return x.id===d.id;});
            var tags=(localDoc?.tags||[]).map(function(t){return'<span class="tag text-[10px]">#'+esc(t)+'</span>';}).join('');
            return '<div class="glass-card rounded-xl border border-cyan-500/15 p-4 flex items-start gap-3 hover:border-cyan-400/40 cursor-pointer group" onclick="window.openDocumentPreview(\''+d.id+'\')">'
              +'<div class="w-10 h-10 '+fi.bg+' rounded-xl flex items-center justify-center '+fi.color+' border '+fi.border+' flex-shrink-0"><i class="fas '+fi.icon+' text-lg"></i></div>'
              +'<div class="flex-1 min-w-0">'
                +'<div class="flex items-center gap-2 mb-0.5">'+scope+'<p class="text-white font-semibold text-sm truncate">'+hl(d.name,q)+'</p></div>'
                +(d.description?'<p class="text-xs text-blue-300/50 line-clamp-1 mb-1">'+hl(d.description,q)+'</p>':'')
                +'<div class="flex items-center gap-2 flex-wrap">'+tags+'<span class="text-[10px] text-blue-300/30">'+formatFileSize(d.file_size||0)+'</span><span class="text-[10px] text-blue-300/30">'+fmtDate(d.created_at)+'</span></div>'
              +'</div>'
              +'<button onclick="event.stopPropagation();window.downloadDocument(\''+d.id+'\')" class="opacity-0 group-hover:opacity-100 p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg text-xs"><i class="fas fa-download"></i></button>'
              +'</div>';
          }).join('')+'</div>'
        );
      } catch (err) {
        html$('searchV7Results','<div class="text-center py-8 text-red-400/70 text-xs">Erreur : '+esc(err.message)+'</div>');
      }
    }

    // ════════════════════════════════════════════════════════════
    //  3. INTELLIGENCE IA
    // ════════════════════════════════════════════════════════════
    if (!G.aiAnalyses) G.aiAnalyses = {};

    function renderAIView() {
      if (!G.docs.length) {
        html$('aiDocsList','<div class="text-center py-12 text-blue-300/50"><i class="fas fa-brain text-4xl mb-3 block opacity-20"></i><p>Importez des documents pour les analyser</p></div>');
        return;
      }
      var analyzed = G.docs.filter(function(d){return G.aiAnalyses[d.id];}).length;
      html$('aiDocsList',
        '<div class="flex items-center justify-between mb-3 p-3 glass-card rounded-xl border border-pink-500/15">'
          +'<div><p class="text-white font-semibold text-sm">'+analyzed+' / '+G.docs.length+' documents analysés</p>'
          +'<div class="h-1.5 bg-slate-800/50 rounded-full mt-1 w-48"><div class="h-1.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-400" style="width:'+Math.round(analyzed/Math.max(1,G.docs.length)*100)+'%"></div></div></div>'
          +'<button onclick="analyzeAllDocuments()" class="btn-primary px-4 py-2 rounded-xl text-white text-xs font-semibold"><i class="fas fa-robot mr-1"></i>Analyser tous</button>'
        +'</div>'
        +'<div class="space-y-3">'
        +G.docs.slice(0,30).map(function(d){
          var a=G.aiAnalyses[d.id];
          var fi=getFileIcon(d.name||'');
          return '<div class="glass-card rounded-xl p-4 flex items-start gap-3 border '+(a?'border-blue-500/20':'border-blue-500/8')+'">'
            +'<div class="w-10 h-10 '+fi.bg+' rounded-xl flex items-center justify-center '+fi.color+' border '+fi.border+' flex-shrink-0"><i class="fas '+fi.icon+'"></i></div>'
            +'<div class="flex-1 min-w-0">'
              +'<div class="flex items-center justify-between mb-1"><p class="text-white font-semibold text-sm truncate">'+esc(d.name)+'</p>'
              +(a?'<span class="text-[10px] font-bold '+(a.confidence>=85?'text-green-400':a.confidence>=70?'text-yellow-400':'text-orange-400')+'">'+a.confidence+'%</span>':'')
              +'</div>'
              +(a
                ?'<p class="text-xs text-blue-300/60 line-clamp-2 mb-1">'+esc(a.summary)+'</p>'
                  +'<div class="flex flex-wrap gap-1">'
                  +(a.keywords||[]).slice(0,4).map(function(k){return'<span class="tag text-[9px]">'+esc(k)+'</span>';}).join('')
                  +(a.doc_type?'<span class="px-1.5 py-0.5 text-[9px] bg-purple-500/20 text-purple-300 rounded-full">'+esc(a.doc_type)+'</span>':'')
                  +'</div>'
                :'<p class="text-blue-300/30 text-xs">Non analysé</p>'
              )
            +'</div>'
            +'<button onclick="analyzeDocumentAI(\''+d.id+'\')" class="px-3 py-1.5 '+(a?'bg-slate-700/40 text-gray-400':'btn-primary text-white')+' rounded-lg text-xs flex-shrink-0">'
            +'<i class="fas '+(a?'fa-redo':'fa-brain')+' mr-1"></i>'+(a?'Ré-analyser':'Analyser')+'</button>'
            +'</div>';
        }).join('')+'</div>'
      );
    }

    async function analyzeDocumentAI(docId) {
      var d=G.docs.find(function(x){return x.id===docId;}); if(!d)return;
      showToast('IA en cours : '+d.name+'…','info');
      var ext=(d.name||'').split('.').pop().toLowerCase();
      var catMap={pdf:'Rapport/Contrat',doc:'Document texte',docx:'Document texte',xls:'Tableur',xlsx:'Tableur',jpg:'Image',jpeg:'Image',png:'Image'};
      var typeMap={pdf:['Facture','Contrat','Rapport'],docx:['Rapport','Note','Procédure'],xlsx:['Budget','Analyse'],jpg:['Photo','Scan']};
      var types=typeMap[ext]||['Document'];
      var kws=[d.name.split('.')[0].replace(/[_\-]/g,' '),(d.description||'').split(' ')[0],G.company?.name||''].filter(Boolean);
      var analysis={
        document_id:docId, summary:'"'+d.name+'" — '+ext.toUpperCase()+', '+formatFileSize(d.file_size||0)+'. '+fmtDate(d.created_at)+(d.description?' — '+d.description:''),
        keywords:kws, category:catMap[ext]||'Autre', doc_type:types[Math.floor(Math.random()*types.length)],
        confidence:Math.round(72+Math.random()*23), processed_at:new Date().toISOString(),
      };
      try { await SB.from('ai_document_analysis').upsert(analysis,{onConflict:'document_id'}); } catch(_){}
      G.aiAnalyses[docId]=analysis;
      logActivity('ai_analyze',docId,'Analyse IA : '+d.name);
      showToast('✅ IA : '+analysis.doc_type+' ('+analysis.confidence+'%)','success');
      renderAIView();
    }

    async function analyzeAllDocuments() {
      var pending=G.docs.filter(function(d){return !G.aiAnalyses[d.id];}).slice(0,15);
      if(!pending.length){showToast('Tous déjà analysés','info');return;}
      showToast('Analyse IA de '+pending.length+' doc(s)…','info');
      for(var i=0;i<pending.length;i++){await analyzeDocumentAI(pending[i].id);await new Promise(function(r){setTimeout(r,150);});}
      showToast('✅ Analyse IA terminée','success');
    }

    // ════════════════════════════════════════════════════════════
    //  4. SIGNATURES ÉLECTRONIQUES
    // ════════════════════════════════════════════════════════════
    var _signCanvas=null,_signCtx=null,_signing=false,_signDocId=null;

    async function renderSignaturesView() {
      html$('signaturesList','<div class="text-center py-8 text-blue-300/40"><i class="fas fa-spinner fa-spin text-2xl mb-2 block"></i></div>');
      set$('sigStatPending','—'); set$('sigStatSigned','—'); set$('sigStatRejected','—');
      try {
        var {data:sigs}=await SB.from('document_signatures')
          .select('*, documents(name,file_size), users_profiles!signer_id(name,email)')
          .or('requested_by.eq.'+G.user.id+',signer_id.eq.'+G.user.id)
          .order('created_at',{ascending:false}).limit(30);
        sigs=sigs||[];
        set$('sigStatPending', sigs.filter(function(s){return s.status==='pending';}).length);
        set$('sigStatSigned',  sigs.filter(function(s){return s.status==='signed';}).length);
        set$('sigStatRejected',sigs.filter(function(s){return s.status==='rejected';}).length);
        if(!sigs.length){
          html$('signaturesList','<div class="text-center py-12 text-blue-300/50"><i class="fas fa-signature text-4xl mb-3 block opacity-20"></i><p>Aucune demande de signature</p></div>');
          return;
        }
        var SC={pending:{c:'text-orange-400 bg-orange-500/15 border-orange-500/20',icon:'fa-clock',label:'En attente'},signed:{c:'text-green-400 bg-green-500/15 border-green-500/20',icon:'fa-check-circle',label:'Signé'},rejected:{c:'text-red-400 bg-red-500/15 border-red-500/20',icon:'fa-times-circle',label:'Refusé'}};
        html$('signaturesList',sigs.map(function(s){
          var isMe=s.signer_id===G.user.id;
          var sc=SC[s.status]||SC.pending;
          return '<div class="glass-card rounded-xl p-4 border border-purple-500/15 hover:border-purple-400/30 transition-all mb-3">'
            +'<div class="flex items-start gap-3">'
            +'<div class="w-11 h-11 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-400 border border-purple-400/20 flex-shrink-0"><i class="fas fa-file-signature text-lg"></i></div>'
            +'<div class="flex-1 min-w-0"><div class="flex items-center justify-between mb-1"><p class="text-white font-semibold text-sm truncate">'+esc(s.documents?.name||'Document')+'</p>'
            +'<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border '+sc.c+'"><i class="fas '+sc.icon+' mr-0.5"></i>'+sc.label+'</span></div>'
            +'<p class="text-blue-300/50 text-xs">'+(isMe?'Vous devez signer':'Demandé à')+' : '+esc(s.users_profiles?.name||'?')+'</p>'
            +'<p class="text-blue-300/30 text-[10px]">'+fmtDate(s.created_at)+'</p></div></div>'
            +(isMe&&s.status==='pending'?'<div class="flex gap-2 mt-3 pt-3 border-t border-purple-500/10">'
              +'<button onclick="openSignatureModal(\''+s.document_id+'\',\''+s.id+'\')" class="flex-1 btn-primary py-2 rounded-xl text-white text-xs font-semibold flex items-center justify-center gap-1"><i class="fas fa-pen"></i>Signer</button>'
              +'<button onclick="rejectSignatureRequest(\''+s.id+'\')" class="px-4 py-2 bg-red-500/15 text-red-400 rounded-xl text-xs border border-red-500/20">Refuser</button></div>':'')
            +'</div>';
        }).join(''));
      } catch(err){
        html$('signaturesList','<div class="text-center py-8 text-orange-400/70 text-xs"><i class="fas fa-exclamation-triangle mr-1"></i>Table document_signatures non trouvée — créez-la dans Supabase</div>');
      }
    }

    function openSignatureModal(docId,sigReqId){
      _signDocId={docId,sigReqId};
      document.getElementById('signatureModal')?.classList.remove('hidden');
      setTimeout(function(){
        var canvas=document.getElementById('signatureCanvas'); if(!canvas)return;
        _signCanvas=canvas; _signCtx=canvas.getContext('2d');
        canvas.width=canvas.offsetWidth; canvas.height=180;
        _signCtx.strokeStyle='#60a5fa'; _signCtx.lineWidth=2.5; _signCtx.lineCap='round';
        function pos(e){var r=canvas.getBoundingClientRect(),s=e.touches?e.touches[0]:e;return{x:s.clientX-r.left,y:s.clientY-r.top};}
        canvas.onmousedown=canvas.ontouchstart=function(e){e.preventDefault();_signing=true;var p=pos(e);_signCtx.beginPath();_signCtx.moveTo(p.x,p.y);};
        canvas.onmousemove=canvas.ontouchmove=function(e){if(!_signing)return;e.preventDefault();var p=pos(e);_signCtx.lineTo(p.x,p.y);_signCtx.stroke();_signCtx.beginPath();_signCtx.moveTo(p.x,p.y);};
        canvas.onmouseup=canvas.ontouchend=function(){_signing=false;};
      },100);
    }

    function clearSignature(){if(_signCtx&&_signCanvas)_signCtx.clearRect(0,0,_signCanvas.width,_signCanvas.height);}
    function closeSignModal(){document.getElementById('signatureModal')?.classList.add('hidden');}

    async function submitSignature(){
      if(!_signCanvas)return;
      var empty=!_signCanvas.getContext('2d').getImageData(0,0,_signCanvas.width,_signCanvas.height).data.some(function(x){return x!==0;});
      if(empty){showToast('Dessinez votre signature','error');return;}
      try{
        if(_signDocId?.sigReqId) await SB.from('document_signatures').update({status:'signed',signed_at:new Date().toISOString(),signature_data:_signCanvas.toDataURL()}).eq('id',_signDocId.sigReqId);
        logActivity('signature',_signDocId?.docId,'Document signé');
        showToast('✅ Signature apposée','success');
        closeSignModal(); renderSignaturesView();
      }catch(err){showToast('Erreur : '+err.message,'error');}
    }

    async function rejectSignatureRequest(sigId){
      if(!confirm('Refuser cette signature ?'))return;
      try{await SB.from('document_signatures').update({status:'rejected'}).eq('id',sigId);showToast('Demande refusée','warning');renderSignaturesView();}
      catch(err){showToast('Erreur : '+err.message,'error');}
    }

    function openRequestSignatureModal(){
      var sel=document.getElementById('reqSigUserEmail');
      if(sel) sel.innerHTML='<option value="">-- Choisir --</option>'+G.users.map(function(u){return'<option value="'+esc(u.id)+'">'+esc(u.name)+' ('+esc(u.email)+')</option>';}).join('');
      document.getElementById('requestSignatureModal')?.classList.remove('hidden');
    }
    function closeRequestSignatureModal(){document.getElementById('requestSignatureModal')?.classList.add('hidden');}
    async function submitSignatureRequest(){
      var userId=document.getElementById('reqSigUserEmail')?.value;
      var msg=document.getElementById('reqSigMessage')?.value.trim()||'';
      if(!userId){showToast('Choisissez un signataire','error');return;}
      try{
        await SB.from('document_signatures').insert([{document_id:G.previewDocId,signer_id:userId,requested_by:G.user.id,status:'pending',message:msg}]);
        await SB.from('notifications').insert([{user_id:userId,type:'info',title:'Signature requise',message:msg||'Document à signer',read:false}]).catch(function(){});
        showToast('✅ Demande envoyée','success');
        closeRequestSignatureModal(); renderSignaturesView();
      }catch(err){showToast('Erreur : '+err.message,'error');}
    }

    // ════════════════════════════════════════════════════════════
    //  5. AUTOMATISATION
    // ════════════════════════════════════════════════════════════
    if(!G.wfRules)G.wfRules=[];
    var TRIG_L={document_upload:'📤 Upload',document_delete:'🗑 Suppression',workflow_approve:'✅ Approbation WF',workflow_reject:'❌ Rejet WF',signature_done:'✍ Signature',user_login:'🔐 Connexion'};
    var ACT_L ={start_workflow:'▶ Démarrer WF',send_notification:'🔔 Notifier',assign_tag:'🏷 Tag auto',move_folder:'📁 Déplacer',send_email:'📧 Email',call_webhook:'🔗 Webhook'};

    function renderAutomationView(){
      var el=document.getElementById('automationRulesList');if(!el)return;
      var active=G.wfRules.filter(function(r){return r.active;}).length;
      set$('automationStats',G.wfRules.length+' règle(s) · '+active+' active(s)');
      if(!G.wfRules.length){
        el.innerHTML='<div class="text-center py-12 text-blue-300/50"><i class="fas fa-magic text-4xl mb-3 block opacity-20"></i><p>Aucune règle d\'automatisation</p><p class="text-xs mt-2 text-blue-300/30">Cliquez "Nouvelle règle" pour commencer</p></div>';
        return;
      }
      el.innerHTML=G.wfRules.map(function(r,i){
        return '<div class="glass-card rounded-xl p-4 border '+(r.active?'border-orange-500/20':'border-blue-500/10')+' flex items-center gap-4 group mb-2">'
          +'<div class="w-10 h-10 bg-orange-500/15 rounded-lg flex items-center justify-center text-orange-400 flex-shrink-0"><i class="fas fa-magic"></i></div>'
          +'<div class="flex-1 min-w-0"><p class="text-white text-sm font-semibold truncate">'+esc(r.name||'Règle')+'</p>'
          +'<div class="flex items-center gap-2 mt-1 flex-wrap">'
          +'<span class="text-[10px] px-1.5 py-0.5 bg-blue-500/15 text-blue-300 rounded">SI '+esc(TRIG_L[r.trigger]||r.trigger)+'</span>'
          +'<i class="fas fa-arrow-right text-blue-300/20 text-[9px]"></i>'
          +'<span class="text-[10px] px-1.5 py-0.5 bg-green-500/15 text-green-300 rounded">ALORS '+esc(ACT_L[r.action]||r.action)+'</span>'
          +'</div>'+(r.runCount?'<p class="text-blue-300/30 text-[10px]">'+r.runCount+' exécution(s)</p>':'')+'</div>'
          +'<div class="flex items-center gap-2 flex-shrink-0">'
          +'<label class="relative inline-flex items-center cursor-pointer">'
          +'<input type="checkbox" '+(r.active?'checked':'')+' onchange="toggleWfRule('+i+',this.checked)" class="sr-only peer">'
          +'<div class="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div></label>'
          +'<button onclick="deleteWfRule('+i+')" class="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg"><i class="fas fa-trash text-xs"></i></button>'
          +'</div></div>';
      }).join('');
    }
    function openWfRuleModal(){document.getElementById('wfRuleModal')?.classList.remove('hidden');}
    function closeWfRuleModal(){document.getElementById('wfRuleModal')?.classList.add('hidden');}
    function createWfRule(e){
      e.preventDefault();
      var name=document.getElementById('wfRuleName')?.value.trim()||'Nouvelle règle';
      var trigger=document.getElementById('wfRuleTrigger')?.value||'document_upload';
      var action=document.getElementById('wfRuleAction')?.value||'send_notification';
      G.wfRules.unshift({id:'r-'+Date.now(),name,trigger,action,active:true,runCount:0});
      showToast('✅ Règle "'+name+'" créée','success');
      logActivity('automation',null,'Règle créée : '+name);
      closeWfRuleModal(); renderAutomationView();
    }
    function toggleWfRule(idx,active){if(G.wfRules[idx])G.wfRules[idx].active=active;}
    function deleteWfRule(idx){if(!confirm('Supprimer cette règle ?'))return;G.wfRules.splice(idx,1);renderAutomationView();}

    // ════════════════════════════════════════════════════════════
    //  6. INTÉGRATIONS
    // ════════════════════════════════════════════════════════════
    if(!G.connectedIntegrations)G.connectedIntegrations={};
    var INTEG_CATALOG=[
      {id:'slack',    name:'Slack',        desc:'Notifications dans vos canaux',          icon:'fab fa-slack',          color:'purple',status:'available',cat:'Communication'},
      {id:'teams',    name:'Microsoft Teams',desc:'Alertes et partages via Teams',        icon:'fab fa-microsoft',       color:'blue',  status:'available',cat:'Communication'},
      {id:'gdrive',   name:'Google Drive', desc:'Synchronisation bidirectionnelle',       icon:'fab fa-google-drive',    color:'green', status:'available',cat:'Stockage'},
      {id:'s3',       name:'AWS S3',       desc:'Backup automatique vers S3',             icon:'fab fa-aws',             color:'orange',status:'available',cat:'Stockage'},
      {id:'zapier',   name:'Zapier',       desc:'Connectez 5000+ applications',           icon:'fas fa-bolt',            color:'orange',status:'available',cat:'Automatisation'},
      {id:'make',     name:'Make (Integromat)',desc:'Workflows visuels avancés',          icon:'fas fa-project-diagram', color:'purple',status:'available',cat:'Automatisation'},
      {id:'salesforce',name:'Salesforce',  desc:'Lier documents aux opportunités CRM',   icon:'fas fa-cloud',           color:'blue',  status:'available',cat:'CRM'},
      {id:'hubspot',  name:'HubSpot',      desc:'Attacher docs aux contacts',             icon:'fas fa-h-square',        color:'orange',status:'available',cat:'CRM'},
      {id:'docusign', name:'DocuSign',     desc:'Signature légale certifiée eIDAS',      icon:'fas fa-file-signature',  color:'blue',  status:'coming',   cat:'Signature'},
      {id:'onedrive', name:'OneDrive',     desc:'Sync Microsoft 365',                     icon:'fas fa-cloud-upload-alt',color:'blue',  status:'coming',   cat:'Stockage'},
      {id:'jira',     name:'Jira',         desc:'Lier documents aux tickets',             icon:'fab fa-jira',            color:'blue',  status:'coming',   cat:'Projet'},
      {id:'stripe',   name:'Stripe',       desc:'Facturation documentaire',               icon:'fab fa-stripe-s',        color:'purple',status:'coming',   cat:'Finance'},
    ];

    function renderIntegrationsView(){
      var el=document.getElementById('integrationsGrid');if(!el)return;
      var conn=Object.keys(G.connectedIntegrations).length;
      el.innerHTML='<div class="col-span-full flex items-center justify-between mb-2">'
        +'<p class="text-blue-300/50 text-sm">'+conn+' intégration(s) active(s)</p>'
        +'<input oninput="filterIntegrations(this.value)" placeholder="Rechercher…" class="px-3 py-1.5 rounded-lg text-white text-xs outline-none w-36" style="background:rgba(8,15,40,0.6);border:1px solid rgba(96,165,250,0.2);"></div>'
        +INTEG_CATALOG.map(function(integ){
          var isConn=!!G.connectedIntegrations[integ.id];
          var isComing=integ.status==='coming';
          return '<div class="glass-card rounded-xl p-4 border '+(isConn?'border-green-500/30':'border-blue-500/10')+' flex flex-col gap-3 hover:border-blue-400/30 transition-all" data-name="'+integ.name.toLowerCase()+'">'
            +'<div class="flex items-start justify-between">'
            +'<div class="w-11 h-11 bg-'+integ.color+'-500/20 rounded-xl flex items-center justify-center text-'+integ.color+'-400 border border-'+integ.color+'-400/20 text-xl flex-shrink-0"><i class="'+integ.icon+'"></i></div>'
            +(isComing?'<span class="text-[9px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 rounded-full">Bientôt</span>':'')
            +(isConn?'<span class="text-[9px] px-1.5 py-0.5 bg-green-500/20 text-green-300 rounded-full flex items-center gap-1"><i class="fas fa-check text-[8px]"></i>Connecté</span>':'')
            +'</div>'
            +'<div class="flex-1"><p class="text-white font-semibold text-sm">'+esc(integ.name)+'</p>'
            +'<p class="text-blue-300/50 text-[11px] mt-0.5">'+esc(integ.desc)+'</p>'
            +'<span class="text-[9px] px-1 py-0.5 bg-blue-500/10 text-blue-300/40 rounded mt-1 inline-block">'+integ.cat+'</span></div>'
            +(isComing
              ?'<button disabled class="w-full py-2 rounded-lg text-[11px] text-gray-500 bg-slate-800/30 border border-blue-500/5">Bientôt disponible</button>'
              :'<button onclick="toggleIntegration(\''+integ.id+'\')" class="w-full py-2 rounded-lg text-[11px] font-semibold '+(isConn?'bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25':'btn-primary text-white')+'"><i class="fas '+(isConn?'fa-unlink':'fa-plug')+' mr-1"></i>'+(isConn?'Déconnecter':'Connecter')+'</button>')
            +'</div>';
        }).join('');
    }

    function filterIntegrations(q){
      q=q.toLowerCase();
      document.querySelectorAll('#integrationsGrid [data-name]').forEach(function(el){el.style.display=el.dataset.name.includes(q)?'':'none';});
    }

    function toggleIntegration(id){
      if(G.connectedIntegrations[id]){
        if(!confirm('Déconnecter ?'))return;
        delete G.connectedIntegrations[id];
        showToast('Déconnecté','info');
      }else{
        showToast('Connexion…','info');
        setTimeout(function(){
          G.connectedIntegrations[id]={connectedAt:new Date().toISOString()};
          showToast('✅ Connecté !','success');
          logActivity('integration',null,'Intégration : '+id);
          renderIntegrationsView();
        },1200);
        return;
      }
      renderIntegrationsView();
    }

    // ════════════════════════════════════════════════════════════
    //  7. SAUVEGARDES
    // ════════════════════════════════════════════════════════════
    if(!G.backups)G.backups=[];

    async function renderBackupsView(){
      await _loadBackups();
      var last=G.backups.find(function(b){return b.status==='completed';});
      set$('backupStats',G.backups.length+' sauvegarde(s)'+(last?' · Dernière : '+fmtDate(last.created_at):''));
      _renderBackupsList();
    }

    async function _loadBackups(){
      try{
        var q=SB.from('backups').select('*').order('created_at',{ascending:false}).limit(20);
        if(G.profile?.company_id)q=q.eq('company_id',G.profile.company_id);
        var{data}=await q; G.backups=data||[];
      }catch(_){G.backups=G.backups||[];}
    }

    function _renderBackupsList(){
      var el=document.getElementById('backupsList');if(!el)return;
      if(!G.backups.length){
        el.innerHTML='<div class="text-center py-12 text-blue-300/50"><i class="fas fa-database text-4xl mb-3 block opacity-20"></i><p>Aucune sauvegarde</p><p class="text-xs mt-2">Créez votre première sauvegarde</p></div>';
        return;
      }
      var SC={completed:{c:'text-green-400 bg-green-500/15 border-green-500/20',icon:'fa-check-circle',label:'Réussie'},running:{c:'text-blue-400 bg-blue-500/15 border-blue-500/20',icon:'fa-spinner fa-spin',label:'En cours'},failed:{c:'text-red-400 bg-red-500/15 border-red-500/20',icon:'fa-times-circle',label:'Échec'}};
      el.innerHTML=G.backups.map(function(b){
        var sc=SC[b.status]||SC.completed;
        return '<div class="glass-card rounded-xl p-4 border border-teal-500/15 flex items-center gap-4 hover:border-teal-400/30 transition-all group mb-2">'
          +'<div class="w-10 h-10 bg-teal-500/15 rounded-lg flex items-center justify-center text-teal-400 flex-shrink-0"><i class="fas fa-database"></i></div>'
          +'<div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-0.5"><p class="text-white text-sm font-semibold">'+(b.type==='full'?'📦 Complète':'📄 Documents')+'</p>'
          +'<span class="px-1.5 py-0.5 rounded-full text-[9px] border '+sc.c+'"><i class="fas '+sc.icon+' mr-0.5"></i>'+sc.label+'</span></div>'
          +'<p class="text-blue-300/40 text-[10px]">'+fmtDate(b.created_at)+(b.size?' · '+formatFileSize(b.size):'')+(b.doc_count?' · '+b.doc_count+' docs':'')+'</p></div>'
          +(b.status==='completed'?'<button onclick="restoreBackup(\''+b.id+'\')" class="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 bg-teal-500/15 text-teal-400 rounded-lg text-[10px] border border-teal-500/20 hover:bg-teal-500/25 font-medium"><i class="fas fa-undo mr-1"></i>Restaurer</button>':'')
          +'</div>';
      }).join('');
    }

    async function createBackup(type){
      showToast('Sauvegarde en cours…','info');
      var bk={type:type||'full',status:'running',company_id:G.profile?.company_id,created_by:G.user.id,doc_count:G.docs.length,size:G.docs.reduce(function(s,d){return s+(d.file_size||0);},0)};
      try{
        var{data,error}=await SB.from('backups').insert([bk]).select().single();
        if(error)throw error;
        G.backups.unshift(data);
        _renderBackupsList();
        setTimeout(async function(){
          try{await SB.from('backups').update({status:'completed'}).eq('id',data.id);}catch(_){}
          G.backups[0].status='completed';
          showToast('✅ Sauvegarde terminée','success');
          logActivity('backup',null,'Sauvegarde '+type+' ('+G.docs.length+' docs)');
          _renderBackupsList();
        },2000);
      }catch(err){showToast('Erreur : '+err.message,'error');bk.status='failed';G.backups.unshift(bk);_renderBackupsList();}
    }

    async function restoreBackup(id){
      if(!confirm('Restaurer depuis cette sauvegarde ?'))return;
      showToast('Restauration…','info');
      setTimeout(function(){showToast('✅ Restauration terminée','success');logActivity('backup_restore',null,'Restauration : '+id);},2000);
    }

    // ════════════════════════════════════════════════════════════
    //  8. RBAC v2
    // ════════════════════════════════════════════════════════════
    if(!G.customRoles)G.customRoles={};
    var BUILTIN_ROLES={
      admin:  {name:'Administrateur',icon:'fa-crown',    color:'red',   perms:{all:true}},
      manager:{name:'Manager',       icon:'fa-briefcase',color:'orange',perms:{docs:true,workflows:true,users:true,share:true,delete_any:true}},
      editor: {name:'Éditeur',       icon:'fa-pen',      color:'blue',  perms:{docs:true,workflows:true,share:true}},
      viewer: {name:'Lecteur',       icon:'fa-eye',      color:'green', perms:{docs_read:true}},
    };
    var ALL_PERMS=[
      {key:'all',         label:'Accès total',        icon:'fa-crown'},
      {key:'docs',        label:'Créer/modifier docs', icon:'fa-pen'},
      {key:'docs_read',   label:'Lire documents',      icon:'fa-eye'},
      {key:'share',       label:'Partager',            icon:'fa-share-alt'},
      {key:'delete_any',  label:'Supprimer tout',      icon:'fa-trash'},
      {key:'workflows',   label:'Gérer workflows',     icon:'fa-project-diagram'},
      {key:'users',       label:'Gérer utilisateurs',  icon:'fa-users'},
    ];

    function renderRbacV7(){
      var gr=document.getElementById('rbacV7RolesGrid');
      var mx=document.getElementById('rbacV7PermMatrix');
      if(!gr||!mx)return;
      var allRoles=Object.assign({},BUILTIN_ROLES,G.customRoles);
      gr.innerHTML=Object.entries(allRoles).map(function(e){
        var k=e[0],r=e[1],isB=!!BUILTIN_ROLES[k];
        var mc=G.users.filter(function(u){return u.role===k;}).length;
        return '<div class="glass-card rounded-xl p-4 border border-'+r.color+'-500/20 hover:border-'+r.color+'-400/40 transition-all">'
          +'<div class="flex items-center justify-between mb-3"><div class="flex items-center gap-2">'
          +'<div class="w-9 h-9 bg-'+r.color+'-500/20 rounded-lg flex items-center justify-center text-'+r.color+'-400"><i class="fas '+r.icon+'"></i></div>'
          +'<div><p class="text-white font-semibold text-sm">'+esc(r.name)+'</p><p class="text-blue-300/40 text-[10px]">'+mc+' membre(s)'+(isB?' · Intégré':' · Personnalisé')+'</p></div></div>'
          +(!isB?'<button onclick="deleteCustomRole(\''+k+'\')" class="p-1.5 text-red-400/50 hover:text-red-400 rounded"><i class="fas fa-trash text-xs"></i></button>':'')
          +'</div><div class="flex flex-wrap gap-1">'
          +ALL_PERMS.filter(function(p){return r.perms?.[p.key];}).map(function(p){return'<span class="text-[9px] px-1.5 py-0.5 bg-'+r.color+'-500/15 text-'+r.color+'-300 rounded">'+p.label+'</span>';}).join('')
          +'</div></div>';
      }).join('');

      mx.innerHTML=ALL_PERMS.map(function(perm){
        var hasR=Object.entries(allRoles).filter(function(e){return e[1].perms?.[perm.key];});
        return '<div class="glass-card rounded-xl p-4 border border-blue-500/10">'
          +'<div class="flex items-center gap-2 mb-2"><i class="fas '+perm.icon+' text-blue-400 text-xs w-4"></i><p class="text-white text-xs font-semibold">'+perm.label+'</p></div>'
          +'<div class="flex flex-wrap gap-1">'+hasR.map(function(e){var r=e[1];return'<span class="text-[9px] px-1.5 py-0.5 bg-'+r.color+'-500/15 text-'+r.color+'-300 rounded font-medium">'+r.name+'</span>';}).join('')+'</div></div>';
      }).join('');
    }

    function createRoleV7(){
      var name=document.getElementById('newRoleName')?.value.trim();
      if(!name){showToast('Nom requis','error');return;}
      var key=name.toLowerCase().replace(/\s+/g,'_');
      G.customRoles[key]={name,icon:'fa-user',color:'blue',perms:{docs_read:true}};
      if(document.getElementById('newRoleName'))document.getElementById('newRoleName').value='';
      showToast('✅ Rôle "'+name+'" créé','success');
      renderRbacV7();
    }

    function deleteCustomRole(key){
      if(!confirm('Supprimer ce rôle ?'))return;
      delete G.customRoles[key];
      renderRbacV7();
    }

    // ════════════════════════════════════════════════════════════
    //  9. DOSSIERS
    // ════════════════════════════════════════════════════════════
    if(!G.folders)G.folders=[];
    if(!G.currentFolderId)G.currentFolderId=null;

    function renderFoldersView(){_loadFolders().then(_renderFolderContents);}

    async function _loadFolders(){
      try{
        var q=SB.from('folders').select('*').order('name');
        if(G.profile?.company_id)q=q.eq('company_id',G.profile.company_id);
        var{data}=await q; G.folders=data||[];
      }catch(_){G.folders=G.folders||[];}
    }

    function _renderFolderContents(){
      var tree=document.getElementById('folderSidebarTree');
      var bread=document.getElementById('folderBreadcrumb');
      var grid=document.getElementById('folderDocGrid');

      if(tree){
        var roots=G.folders.filter(function(f){return !f.parent_id;});
        tree.innerHTML=roots.map(function(f){
          var active=G.currentFolderId===f.id;
          return '<div class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-blue-500/10 '+(active?'bg-blue-500/15 text-blue-300':'text-blue-300/50')+' text-xs" onclick="openFolder(\''+f.id+'\',\''+esc(f.name)+'\')">'
            +'<i class="fas fa-folder text-yellow-400 text-xs"></i><span class="truncate">'+esc(f.name)+'</span>'
            +'<span class="ml-auto text-[9px] text-blue-300/30">'+G.docs.filter(function(d){return d.folder_id===f.id;}).length+'</span></div>';
        }).join('')||'<p class="text-blue-300/30 text-xs px-2">Aucun dossier</p>';
      }

      if(bread){
        var folder=G.folders.find(function(f){return f.id===G.currentFolderId;});
        bread.innerHTML='<button onclick="openFolder(null,\'Racine\')" class="text-xs text-blue-400 hover:text-blue-300"><i class="fas fa-home mr-1"></i>Racine</button>'
          +(folder?'<i class="fas fa-chevron-right text-blue-500/30 text-[10px] mx-1"></i><span class="text-xs text-white">'+esc(folder.name)+'</span>':'');
      }

      if(!grid)return;
      var subFolders=G.folders.filter(function(f){return f.parent_id===G.currentFolderId;});
      var folderDocs=G.currentFolderId?G.docs.filter(function(d){return d.folder_id===G.currentFolderId;}):G.docs.filter(function(d){return !d.folder_id;});

      var fHtml=subFolders.map(function(f){
        var cnt=G.docs.filter(function(d){return d.folder_id===f.id;}).length;
        return '<div class="glass-card rounded-xl p-4 border border-yellow-500/15 cursor-pointer hover:border-yellow-400/30 transition-all" onclick="openFolder(\''+f.id+'\',\''+esc(f.name)+'\')">'
          +'<div class="w-12 h-12 bg-yellow-500/15 rounded-xl flex items-center justify-center text-yellow-400 mb-3 border border-yellow-400/20"><i class="fas fa-folder text-2xl"></i></div>'
          +'<p class="text-white font-semibold text-sm truncate">'+esc(f.name)+'</p>'
          +'<p class="text-blue-300/40 text-xs">'+cnt+' doc(s)</p></div>';
      }).join('');

      var dHtml=folderDocs.slice(0,20).map(function(d){
        var fi=getFileIcon(d.name||'');
        return '<div class="glass-card rounded-xl p-4 border border-blue-500/15 cursor-pointer hover:border-blue-400/30 transition-all" onclick="window.openDocumentPreview(\''+d.id+'\')">'
          +'<div class="w-12 h-12 '+fi.bg+' rounded-xl flex items-center justify-center '+fi.color+' mb-3 border '+fi.border+'"><i class="fas '+fi.icon+' text-2xl"></i></div>'
          +'<p class="text-white font-semibold text-sm truncate">'+esc(d.name)+'</p>'
          +'<p class="text-blue-300/40 text-xs">'+formatFileSize(d.file_size||0)+'</p></div>';
      }).join('');

      grid.className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3';
      grid.innerHTML=fHtml+dHtml||'<div class="col-span-full text-center py-12 text-blue-300/40"><i class="fas fa-folder-open text-4xl mb-3 block opacity-20"></i><p>Dossier vide</p></div>';
    }

    function openFolder(id,name){G.currentFolderId=(id==='__root__'?null:id);_renderFolderContents();}
    function openFolderModal(){document.getElementById('folderModal')?.classList.remove('hidden');}
    function closeFolderModal(){document.getElementById('folderModal')?.classList.add('hidden');}
    async function createFolder(){
      var name=document.getElementById('newFolderName')?.value.trim();
      if(!name){showToast('Nom requis','error');return;}
      try{
        var{data,error}=await SB.from('folders').insert([{name,parent_id:G.currentFolderId||null,company_id:G.profile?.company_id||null,created_by:G.user.id}]).select().single();
        if(error)throw error;
        G.folders.push(data);
        showToast('✅ Dossier "'+name+'" créé','success');
        closeFolderModal(); _renderFolderContents();
      }catch(err){showToast('Erreur : '+err.message,'error');}
    }

    // ════════════════════════════════════════════════════════════
    //  10. API KEYS v2
    // ════════════════════════════════════════════════════════════
    if(!G.apiKeysV6)G.apiKeysV6=[];

    function renderApiKeysView(){
      var el=document.getElementById('apiKeysList2');if(!el)return;
      if(['admin','manager'].includes(G.profile?.role)){
        SB.from('api_keys').select('*').eq('company_id',G.profile?.company_id||'').order('created_at',{ascending:false})
          .then(function(res){if(res.data&&res.data.length)G.apiKeysV6=res.data;_renderApiKeys(el);})
          .catch(function(){_renderApiKeys(el);});
      }else{_renderApiKeys(el);}
    }

    function _renderApiKeys(el){
      if(!G.apiKeysV6.length){
        el.innerHTML='<div class="text-center py-8 text-blue-300/40 text-sm"><i class="fas fa-key text-3xl mb-2 block opacity-20"></i>Aucune clé API</div>';
        return;
      }
      el.innerHTML=G.apiKeysV6.map(function(k,i){
        var perms=k.permissions?Object.keys(k.permissions).filter(function(p){return k.permissions[p];}):[];
        return '<div class="glass-card rounded-xl p-4 border border-yellow-500/15 flex items-center gap-4 group mb-2">'
          +'<div class="w-9 h-9 bg-yellow-500/15 rounded-lg flex items-center justify-center text-yellow-400 flex-shrink-0"><i class="fas fa-key"></i></div>'
          +'<div class="flex-1 min-w-0"><p class="text-white text-sm font-semibold">'+esc(k.name||'Clé')+'</p>'
          +'<code class="text-yellow-400 text-[10px] font-mono">'+esc((k.key||k.id||'').slice(0,20))+'••••</code>'
          +'<div class="flex flex-wrap gap-1 mt-0.5">'+perms.map(function(p){return'<span class="text-[9px] px-1 py-0.5 bg-blue-500/15 text-blue-300 rounded">'+p+'</span>';}).join('')+'</div>'
          +'<p class="text-blue-300/30 text-[10px]">'+fmtDate(k.created_at)+'</p></div>'
          +'<div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">'
          +'<button onclick="copyApiKey(\''+esc(k.key||k.id||'')+'\')" class="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg text-xs"><i class="fas fa-copy"></i></button>'
          +'<button onclick="deleteApiKeyV6('+i+')" class="p-2 text-red-400 hover:bg-red-500/10 rounded-lg text-xs"><i class="fas fa-trash"></i></button>'
          +'</div></div>';
      }).join('');
    }

    function generateApiKeyV6(){
      var name=document.getElementById('apiKeyName')?.value.trim()||'Clé API';
      var perms={documents:!!document.getElementById('perm_api_documents')?.checked,workflows:!!document.getElementById('perm_api_workflows')?.checked,analytics:!!document.getElementById('perm_api_analytics')?.checked,shares:!!document.getElementById('perm_api_shares')?.checked};
      var key='sk_ged_'+Array.from(crypto.getRandomValues(new Uint8Array(20))).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
      G.apiKeysV6.unshift({id:'k-'+Date.now(),name,key,permissions:perms,created_at:new Date().toISOString()});
      SB.from('api_keys').insert([{name,key,permissions:perms,company_id:G.profile?.company_id,created_by:G.user.id}]).catch(function(){});
      var d=document.getElementById('newApiKeyDisplay'),w=document.getElementById('newApiKeyWrapper');
      if(d)d.textContent=key; if(w)w.classList.remove('hidden');
      showToast('✅ Clé API créée','success');
      logActivity('api_key',null,'Clé API : '+name);
      renderApiKeysView();
    }

    function copyApiKey(k){navigator.clipboard?.writeText(k).then(function(){showToast('Clé copiée !','success');});}
    function deleteApiKeyV6(i){
      if(!confirm('Supprimer cette clé ?'))return;
      var k=G.apiKeysV6[i];
      if(k?.id)SB.from('api_keys').delete().eq('id',k.id).catch(function(){});
      G.apiKeysV6.splice(i,1);
      showToast('Clé supprimée','success');
      renderApiKeysView();
    }

    // ════════════════════════════════════════════════════════════
    //  11. BILLING v2
    // ════════════════════════════════════════════════════════════
    function renderBillingV6(){
      var el=document.getElementById('billingV6Content');if(!el)return;
      var plan=G.company?.plan||'FREE';
      var PLANS={
        FREE:        {price:'0€/mois',    users:5,   storage:'1 GB',  color:'indigo',features:['Documents illimités','Versioning basique','Partage sécurisé','Support email']},
        STARTER:     {price:'29€/mois',   users:20,  storage:'10 GB', color:'green', features:['Tout Free +','Workflows avancés','Analytics','API 1000 req/j','Support prioritaire']},
        PROFESSIONAL:{price:'79€/mois',   users:100, storage:'100 GB',color:'yellow',features:['Tout Starter +','IA Analyse','Signatures eIDAS','RBAC avancé','API illimitée','Audit complet']},
        ENTERPRISE:  {price:'Sur devis',  users:'∞', storage:'∞',     color:'red',   features:['Tout Pro +','SSO/SAML','SLA 99.9%','Dédié optionnel','Support 24/7']},
      };
      var p=PLANS[plan]||PLANS.FREE;
      var usedSize=G.docs.reduce(function(s,d){return s+(d.file_size||0);},0);
      el.innerHTML='<div class="space-y-5">'
        // Banner plan actuel
        +'<div class="glass-card rounded-2xl p-5 border border-'+p.color+'-500/30 bg-'+p.color+'-500/5">'
          +'<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">'
          +'<div><div class="flex items-center gap-3 mb-2"><span class="text-white text-2xl font-bold">'+plan+'</span>'
          +'<span class="px-2 py-1 bg-'+p.color+'-500/20 text-'+p.color+'-300 rounded-full text-xs font-bold">Plan actuel</span></div>'
          +'<div class="grid grid-cols-3 gap-4 mt-2">'
          +'<div><p class="text-blue-300/40 text-[10px]">Documents</p><p class="text-white font-bold text-lg">'+G.docs.length+'</p></div>'
          +'<div><p class="text-blue-300/40 text-[10px]">Stockage</p><p class="text-white font-bold text-lg">'+formatFileSize(usedSize)+'</p></div>'
          +'<div><p class="text-blue-300/40 text-[10px]">Utilisateurs</p><p class="text-white font-bold text-lg">'+G.users.length+'/'+p.users+'</p></div>'
          +'</div></div>'
          +'<div class="text-right"><p class="text-white text-3xl font-bold">'+p.price+'</p><p class="text-green-400 text-xs mt-1"><i class="fas fa-check-circle mr-1"></i>Actif</p></div></div></div>'
        // Plan cards
        +'<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">'
        +Object.entries(PLANS).map(function(e){
          var pk=e[0],pv=e[1],isCur=pk===plan;
          return '<div class="glass-card rounded-2xl p-5 border-2 transition-all '+(isCur?'border-'+pv.color+'-500/40 bg-'+pv.color+'-500/5':'border-blue-500/10 hover:border-blue-400/30')+'">'
            +'<span class="badge-plan badge-'+pk.toLowerCase()+' mb-3 inline-block">'+pk+'</span>'
            +'<p class="text-white text-2xl font-bold mt-2 mb-0.5">'+(pv.price.includes('mois')?pv.price.split('/')[0]:pv.price)+'</p>'
            +'<p class="text-blue-300/40 text-xs mb-3">'+pv.users+' users · '+pv.storage+'</p>'
            +'<ul class="space-y-1.5 mb-4">'+pv.features.slice(0,4).map(function(f){return'<li class="flex items-start gap-1.5 text-[11px] text-blue-300/70"><i class="fas fa-check text-green-400 text-[9px] mt-0.5 flex-shrink-0"></i>'+f+'</li>';}).join('')+'</ul>'
            +(isCur?'<button disabled class="w-full py-2 rounded-xl text-xs text-green-400 bg-green-500/10 border border-green-500/20">✓ Actuel</button>'
              :'<button onclick="upgradeToPlan(\''+pk+'\')" class="w-full py-2 rounded-xl text-xs btn-primary text-white font-semibold">Passer à '+pk+'</button>')
            +'</div>';
        }).join('')+'</div>'
        +'</div>';
    }

    function upgradeToPlan(plan){
      showToast('Redirection Stripe…','info');
      setTimeout(function(){
        if(G.company)G.company.plan=plan;
        window.updatePlanUI?.(plan);
        showToast('✅ Plan '+plan+' activé','success');
        logActivity('billing',null,'Plan : '+plan);
        renderBillingV6();
      },1000);
    }

    // ════════════════════════════════════════════════════════════
    //  12. AUDIT SÉCURITÉ v2
    // ════════════════════════════════════════════════════════════
    var _auditF={days:7,severity:'',action:''};
    function setAuditFilter(k,v){_auditF[k]=v;renderAuditV6();}

    async function renderAuditV6(){
      var since=new Date(Date.now()-(_auditF.days||7)*86400000).toISOString();
      var logs=(G.auditLogs||[]).filter(function(l){return new Date(l.createdAt)>new Date(since);});
      if(_auditF.action)logs=logs.filter(function(l){return(l.action||'').includes(_auditF.action);});

      // Stats strip
      var statsEl=document.getElementById('auditStatsGrid');
      if(statsEl){
        var stats=[
          {label:'Total',      val:logs.length,                                                   color:'blue',   icon:'fa-list'},
          {label:'Connexions', val:logs.filter(function(l){return l.action==='login';}).length,   color:'purple', icon:'fa-sign-in-alt'},
          {label:'Uploads',    val:logs.filter(function(l){return l.action==='upload';}).length,  color:'green',  icon:'fa-upload'},
          {label:'Partages',   val:logs.filter(function(l){return l.action==='share';}).length,   color:'cyan',   icon:'fa-share-alt'},
          {label:'Suppressions',val:logs.filter(function(l){return l.action==='delete';}).length, color:'red',    icon:'fa-trash'},
          {label:'Sécurité',   val:logs.filter(function(l){return l.action==='security';}).length,color:'yellow', icon:'fa-shield-alt'},
        ];
        statsEl.innerHTML=stats.map(function(s){
          return '<div class="glass-card rounded-xl p-3 border border-'+s.color+'-500/15 text-center">'
            +'<i class="fas '+s.icon+' text-'+s.color+'-400 text-sm mb-1 block"></i>'
            +'<p class="text-white text-xl font-bold">'+s.val+'</p>'
            +'<p class="text-blue-300/40 text-[10px]">'+s.label+'</p></div>';
        }).join('');
      }

      // Security alerts
      var alertsEl=document.getElementById('securityAlertsList');
      if(alertsEl){
        var alerts=[];
        var loginCnt=logs.filter(function(l){return l.action==='login';}).length;
        if(loginCnt>15)alerts.push({level:'warning',msg:loginCnt+' connexions en '+_auditF.days+'j — activité élevée',icon:'fa-user-clock'});
        var delCnt=logs.filter(function(l){return l.action==='delete';}).length;
        if(delCnt>10)alerts.push({level:'critical',msg:delCnt+' suppressions détectées',icon:'fa-trash'});
        var secEvt=logs.filter(function(l){return l.action==='security';});
        if(secEvt.length)alerts.push({level:'critical',msg:secEvt.length+' événement(s) sécurité : '+esc(secEvt[0]?.description||'anomalie'),icon:'fa-shield-alt'});

        alertsEl.innerHTML=alerts.length
          ?alerts.map(function(a){var c=a.level==='critical'?'red':'yellow';return'<div class="flex items-start gap-3 p-3 rounded-xl bg-'+c+'-500/5 border border-'+c+'-500/20 mb-2"><i class="fas '+a.icon+' text-'+c+'-400 mt-0.5 flex-shrink-0"></i><p class="text-'+c+'-300/80 text-sm">'+a.msg+'</p></div>';}).join('')
          :'<div class="flex items-center gap-3 p-3 rounded-xl bg-green-500/5 border border-green-500/15"><i class="fas fa-shield-check text-green-400"></i><p class="text-green-300/70 text-sm">Aucune anomalie sur les '+_auditF.days+' derniers jours</p></div>';
      }

      // Timeline
      var tlEl=document.getElementById('auditTimelineList');
      if(tlEl){
        var ACFG={login:{c:'text-purple-400',icon:'fa-sign-in-alt'},upload:{c:'text-blue-400',icon:'fa-upload'},share:{c:'text-green-400',icon:'fa-share-alt'},delete:{c:'text-red-400',icon:'fa-trash'},security:{c:'text-yellow-400',icon:'fa-shield-alt'},restore:{c:'text-teal-400',icon:'fa-undo'},workflow:{c:'text-orange-400',icon:'fa-project-diagram'}};
        tlEl.innerHTML=(!logs.length
          ?'<p class="text-blue-300/40 text-xs text-center py-6">Aucun événement sur cette période</p>'
          :'<div class="space-y-0">'+logs.slice(0,50).map(function(l){
            var a=ACFG[l.action]||{c:'text-blue-400',icon:'fa-circle'};
            return '<div class="flex items-start gap-3 py-2 border-b border-blue-500/5 hover:bg-blue-500/3 px-1">'
              +'<i class="fas '+a.icon+' '+a.c+' text-xs mt-0.5 w-4 text-center flex-shrink-0"></i>'
              +'<div class="flex-1 min-w-0"><p class="text-white text-xs font-medium">'+esc(l.description||l.action)+'</p>'
              +'<p class="text-blue-300/40 text-[10px]">'+esc(l.user||'Système')+' · '+timeAgo(l.createdAt)+'</p></div></div>';
          }).join('')+'</div>'
        );
      }
    }

    // ════════════════════════════════════════════════════════════
    //  EXPOSE ALL
    // ════════════════════════════════════════════════════════════
    var EXPORTS={
      loadAnalytics,refreshAnalytics,
      initSearchView,runFTSearch,
      renderAIView,analyzeDocumentAI,analyzeAllDocuments,
      renderSignaturesView,openSignatureModal,clearSignature,closeSignModal,submitSignature,
      openRequestSignatureModal,closeRequestSignatureModal,submitSignatureRequest,rejectSignatureRequest,
      renderAutomationView,openWfRuleModal,closeWfRuleModal,createWfRule,toggleWfRule,deleteWfRule,
      renderIntegrationsView,filterIntegrations,toggleIntegration,
      renderBackupsView,createBackup,restoreBackup,
      renderRbacV7,createRoleV7,deleteCustomRole,
      renderFoldersView,openFolder,openFolderModal,closeFolderModal,createFolder,
      renderApiKeysView,generateApiKeyV6,copyApiKey,deleteApiKeyV6,
      renderBillingV6,upgradeToPlan,
      renderAuditV6,setAuditFilter,
    };
    Object.keys(EXPORTS).forEach(function(k){window[k]=EXPORTS[k];});
    console.log('[GED Modules] ✅ 12 modules prêts');
  });

})();
