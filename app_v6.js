/**
 * SystemesGED v6.0 — app_v6.js
 * Module d'extension — chargé APRÈS app.js
 *
 * Fonctionnalités ajoutées :
 *   1. Système de dossiers (arborescence)
 *   2. Éditeur riche (TipTap-like via contenteditable)
 *   3. API Keys management
 *   4. Facturation Stripe
 *   5. Audit sécurité avancé
 *
 * Intégration :
 *   <script src="app.js" defer></script>
 *   <script src="app_v6.js" defer></script>
 * ─────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // ══ Attendre que app.js soit chargé ══════════════════════
  function _ready(fn) {
    if (typeof window.G !== 'undefined' && typeof window.SB !== 'undefined') fn();
    else setTimeout(function () { _ready(fn); }, 60);
  }

  _ready(function () {

    var G  = window.G;
    var SB = window.SB;
    var esc        = window.escapeHtml || window.esc || function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    var showToast  = window.showToast;
    var set$       = function(id,v){ var e=document.getElementById(id); if(e) e.textContent=v; };
    var fmtDate    = window.fmtDate || function(iso){ return iso ? new Date(iso).toLocaleDateString('fr-FR') : ''; };
    var formatFileSize = window.formatFileSize || function(b){ if(!b) return '0 B'; var s=['B','KB','MB','GB'],i=Math.floor(Math.log(b)/Math.log(1024)); return parseFloat((b/Math.pow(1024,i)).toFixed(1))+' '+s[i]; };
    var avatarInitials = window.avatarInitials || function(n){ return (n||'?').split(' ').map(function(x){return x[0]||'';}).join('').toUpperCase().slice(0,2)||'?'; };

    // Extension de G pour v6
    G.folders     = [];
    G.currentFolder = null;   // UUID du dossier actif (null = racine)
    G.folderPath  = [];        // breadcrumb [{id,name}]
    G.subscription = null;
    G.apiKeysV6   = [];
    G.auditFilters = { severity: '', action: '', days: 7 };
    G.richEditor  = null;     // instance éditeur riche

    // ════════════════════════════════════════════════════
    // PLANS — configuration
    // ════════════════════════════════════════════════════
    var PLANS = {
      free:       { name:'Free',       price:0,   users:5,    storageGb:1,   docs:100,   color:'indigo',  badge:'badge-free' },
      starter:    { name:'Starter',    price:29,  users:20,   storageGb:10,  docs:1000,  color:'green',   badge:'badge-starter' },
      pro:        { name:'Pro',        price:79,  users:100,  storageGb:100, docs:null,  color:'yellow',  badge:'badge-pro' },
      enterprise: { name:'Enterprise', price:null,users:null, storageGb:null,docs:null,  color:'red',     badge:'badge-enterprise' },
    };

    // ════════════════════════════════════════════════════
    // CHARGEMENT INITIAL
    // ════════════════════════════════════════════════════
    var _origLoadAll = window._loadAllData;
    // Hooker _loadAllData pour charger aussi les dossiers et subscription
    var _origOnSignedIn = window._onSignedIn;

    // Surcharger switchView pour les nouvelles vues
    var _origSwitchView = window.switchView;
    window.switchView = function(v) {
      if (_origSwitchView) _origSwitchView(v);
      if (v === 'folders')  renderFoldersView();
      if (v === 'apikeys')  renderApiKeysView();
      if (v === 'billing2') renderBillingV6();
      if (v === 'auditv6')  renderAuditV6();
    };

    // Charger les données v6 après connexion
    document.addEventListener('ged:signed_in', async function() {
      await Promise.all([_loadFolders(), _loadSubscription(), _loadApiKeys()]);
      _updatePlanLimits();
    });

    // Fallback : surveiller G.user
    var _pollUser = setInterval(function() {
      if (G.user && G.profile) {
        clearInterval(_pollUser);
        setTimeout(async function() {
          await Promise.all([_loadFolders(), _loadSubscription(), _loadApiKeys()]);
          _updatePlanLimits();
        }, 800);
      }
    }, 500);

    // ════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════
    //  1. SYSTÈME DE DOSSIERS
    // ═══════════════════════════════════════════════════
    // ════════════════════════════════════════════════════

    async function _loadFolders() {
      if (!G.profile?.company_id) { G.folders=[]; return; }
      try {
        var { data } = await SB.rpc('get_folder_tree', { p_company_id: G.profile.company_id });
        G.folders = (data||[]).map(function(f){ return { id:f.id, name:f.name, parent_id:f.parent_id, depth:f.depth, path:f.path, doc_count:parseInt(f.doc_count)||0 }; });
        _renderFolderSidebar();
      } catch(err) {
        // Fallback sans RPC
        var { data } = await SB.from('folders').select('*').eq('company_id', G.profile.company_id).order('name');
        G.folders = (data||[]).map(function(f){ return { id:f.id, name:f.name, parent_id:f.parent_id, depth:0, path:f.name, doc_count:0 }; });
        _renderFolderSidebar();
      }
    }

    function _renderFolderSidebar() {
      var el = document.getElementById('folderSidebarTree'); if(!el) return;
      var roots = G.folders.filter(function(f){ return !f.parent_id; });
      if (!roots.length) {
        el.innerHTML = '<p class="text-blue-300/40 text-xs text-center py-3">Aucun dossier</p>';
        return;
      }
      el.innerHTML = _buildFolderTree(null, 0);
    }

    function _buildFolderTree(parentId, depth) {
      var items = G.folders.filter(function(f){ return f.parent_id === parentId; });
      if (!items.length) return '';
      return items.map(function(f) {
        var isActive = G.currentFolder === f.id;
        var children = _buildFolderTree(f.id, depth+1);
        var indent = depth * 12;
        return '<div>'+
          '<div class="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs '+(isActive?'bg-blue-500/20 text-blue-300':'text-blue-300/70 hover:bg-blue-500/10 hover:text-blue-300')+'" style="margin-left:'+indent+'px" onclick="openFolder(\''+f.id+'\',\''+esc(f.name)+'\')">'+
            '<i class="fas '+(isActive?'fa-folder-open text-yellow-400':'fa-folder text-blue-400')+' text-xs flex-shrink-0"></i>'+
            '<span class="truncate flex-1">'+esc(f.name)+'</span>'+
            (f.doc_count?'<span class="text-[10px] text-blue-400/40">'+f.doc_count+'</span>':'')+
          '</div>'+
          (children?'<div>'+children+'</div>':'')+
        '</div>';
      }).join('');
    }

    function renderFoldersView() {
      _renderFolderSidebar();
      _renderFolderContents(G.currentFolder);
      _renderBreadcrumb();
    }

    function openFolder(id, name) {
      if (id === '__root__') {
        G.currentFolder = null;
        G.folderPath = [];
      } else {
        G.currentFolder = id;
        // Reconstruire le path
        var path = [];
        var fid = id;
        while (fid) {
          var f = G.folders.find(function(x){ return x.id===fid; });
          if (!f) break;
          path.unshift({ id:f.id, name:f.name });
          fid = f.parent_id;
        }
        G.folderPath = path;
      }
      _renderFolderSidebar();
      _renderFolderContents(G.currentFolder);
      _renderBreadcrumb();
      // Filtrer les documents
      if (window.renderDocuments) {
        var filtered = G.companyDocs.filter(function(d){ return (d.folder_id||null) === G.currentFolder; });
        window.renderDocuments(filtered);
      }
    }

    function _renderBreadcrumb() {
      var el = document.getElementById('folderBreadcrumb'); if(!el) return;
      var crumbs = [{ id:'__root__', name:'Racine' }].concat(G.folderPath);
      el.innerHTML = crumbs.map(function(c, i) {
        var isLast = i === crumbs.length-1;
        return '<span class="flex items-center gap-1">'+
          (i>0?'<i class="fas fa-chevron-right text-blue-400/30 text-xs"></i>':'')+
          '<span class="'+(isLast?'text-white font-medium':'text-blue-400/60 hover:text-blue-300 cursor-pointer')+' text-sm" onclick="openFolder(\''+c.id+'\',\''+esc(c.name)+'\')">'+esc(c.name)+'</span>'+
        '</span>';
      }).join('');
    }

    function _renderFolderContents(folderId) {
      var el = document.getElementById('folderContentsGrid'); if(!el) return;
      var subfolders = G.folders.filter(function(f){ return f.parent_id === folderId; });
      if (!subfolders.length) { el.innerHTML=''; return; }
      el.innerHTML = '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-4">'+
        subfolders.map(function(f){
          return '<div class="glass-card rounded-xl p-3 border border-blue-500/20 cursor-pointer hover:border-yellow-400/40 hover:bg-yellow-500/5 transition-all group text-center" onclick="openFolder(\''+f.id+'\',\''+esc(f.name)+'\')">'+
            '<i class="fas fa-folder text-yellow-400 text-2xl mb-2 group-hover:scale-110 transition-transform block"></i>'+
            '<p class="text-white text-xs font-medium truncate">'+esc(f.name)+'</p>'+
            (f.doc_count?'<p class="text-blue-400/50 text-[10px]">'+f.doc_count+' doc(s)</p>':'')+
            '<div class="opacity-0 group-hover:opacity-100 transition-opacity flex justify-center gap-1 mt-2">'+
              '<button onclick="event.stopPropagation();openRenameFolderModal(\''+f.id+'\',\''+esc(f.name)+'\')" class="p-1 text-blue-400 hover:text-white rounded text-xs"><i class="fas fa-edit"></i></button>'+
              '<button onclick="event.stopPropagation();confirmDeleteFolder(\''+f.id+'\')" class="p-1 text-red-400 hover:text-white rounded text-xs"><i class="fas fa-trash"></i></button>'+
            '</div>'+
          '</div>';
        }).join('')+
      '</div>';
    }

    async function createFolder() {
      var name = document.getElementById('newFolderName')?.value.trim();
      if (!name) { showToast('Nom requis','error'); return; }
      if (!G.profile?.company_id) { showToast('Entreprise requise','error'); return; }
      try {
        var { data, error } = await SB.from('folders').insert({
          name: name, parent_id: G.currentFolder||null,
          company_id: G.profile.company_id, created_by: G.user.id
        }).select().single();
        if (error) throw error;
        G.folders.push({ id:data.id, name:data.name, parent_id:data.parent_id, depth:G.folderPath.length, doc_count:0 });
        showToast('Dossier "'+name+'" créé ✓','success');
        document.getElementById('newFolderName').value='';
        closeFolderModal();
        _renderFolderSidebar();
        _renderFolderContents(G.currentFolder);
      } catch(err) { showToast('Erreur : '+err.message,'error'); }
    }

    async function moveDocumentToFolder(docId, folderId) {
      try {
        await SB.from('documents').update({ folder_id: folderId||null }).eq('id', docId);
        var doc = G.docs.find(function(d){return d.id===docId;});
        if (doc) doc.folder_id = folderId||null;
        showToast('Document déplacé ✓','success');
        if (G.currentView==='documents') window.renderDocuments?.();
      } catch(err) { showToast('Erreur déplacement : '+err.message,'error'); }
    }

    async function confirmDeleteFolder(id) {
      if (!confirm('Supprimer ce dossier ? Les documents seront déplacés à la racine.')) return;
      await SB.from('documents').update({folder_id:null}).eq('folder_id',id);
      await SB.from('folders').delete().eq('id',id);
      G.folders = G.folders.filter(function(f){return f.id!==id;});
      showToast('Dossier supprimé','success');
      if (G.currentFolder===id) openFolder('__root__','Racine');
      _renderFolderSidebar();
    }

    async function openRenameFolderModal(id, name) {
      var newName = prompt('Nouveau nom du dossier :', name);
      if (!newName||newName===name) return;
      await SB.from('folders').update({name:newName}).eq('id',id);
      var f = G.folders.find(function(x){return x.id===id;}); if(f) f.name=newName;
      showToast('Dossier renommé ✓','success');
      _renderFolderSidebar();
      _renderFolderContents(G.currentFolder);
    }

    function openFolderModal() { document.getElementById('folderModal')?.classList.remove('hidden'); }
    function closeFolderModal() { document.getElementById('folderModal')?.classList.add('hidden'); }

    // ════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════
    //  2. ÉDITEUR RICHE (contenteditable + execCommand)
    // ═══════════════════════════════════════════════════
    // ════════════════════════════════════════════════════

    function openRichEditor(docId) {
      var doc = G.docs.find(function(d){return d.id===docId;}); if(!doc) return;
      G.collab.docId = docId;
      G.richEditor = { docId: docId, dirty: false, saveTimer: null };
      set$('richEditorTitle', doc.name||'Document');
      var editor = document.getElementById('richEditorContent');
      if (editor) {
        editor.innerHTML = doc.content || '<p>Commencez à écrire...</p>';
        editor.focus();
      }
      document.getElementById('richEditorModal')?.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      _trackDocViewV6(docId);
      // Rejoindre le canal collab si disponible
      if (window.openCollabEditor) window.openCollabEditor(docId);
    }

    function closeRichEditor() {
      _saveRichContent();
      document.getElementById('richEditorModal')?.classList.add('hidden');
      document.body.style.overflow = '';
      if (G.richEditor) { clearTimeout(G.richEditor.saveTimer); G.richEditor=null; }
    }

    function richCmd(cmd, value) {
      document.getElementById('richEditorContent')?.focus();
      document.execCommand(cmd, false, value||null);
      _onRichEditorInput();
    }

    function richInsertHeading(level) {
      document.getElementById('richEditorContent')?.focus();
      document.execCommand('formatBlock', false, 'h'+level);
      _onRichEditorInput();
    }

    function richInsertTable() {
      var html = '<table style="border-collapse:collapse;width:100%;margin:8px 0"><thead><tr>'+
        '<th style="border:1px solid rgba(96,165,250,0.3);padding:8px 12px;background:rgba(59,130,246,0.1);color:#93c5fd">Colonne 1</th>'+
        '<th style="border:1px solid rgba(96,165,250,0.3);padding:8px 12px;background:rgba(59,130,246,0.1);color:#93c5fd">Colonne 2</th>'+
        '<th style="border:1px solid rgba(96,165,250,0.3);padding:8px 12px;background:rgba(59,130,246,0.1);color:#93c5fd">Colonne 3</th>'+
        '</tr></thead><tbody>'+
        '<tr><td style="border:1px solid rgba(96,165,250,0.2);padding:8px 12px" contenteditable="true">Cellule</td><td style="border:1px solid rgba(96,165,250,0.2);padding:8px 12px" contenteditable="true">Cellule</td><td style="border:1px solid rgba(96,165,250,0.2);padding:8px 12px" contenteditable="true">Cellule</td></tr>'+
        '</tbody></table><p><br></p>';
      document.execCommand('insertHTML', false, html);
      _onRichEditorInput();
    }

    function richInsertCodeBlock() {
      var html = '<pre style="background:rgba(15,23,42,0.8);border:1px solid rgba(96,165,250,0.2);border-radius:8px;padding:12px 16px;font-family:monospace;font-size:13px;color:#86efac;margin:8px 0;overflow-x:auto"><code contenteditable="true">// Code ici</code></pre><p><br></p>';
      document.execCommand('insertHTML', false, html);
      _onRichEditorInput();
    }

    function richInsertLink() {
      var url = prompt('URL du lien :', 'https://');
      if (!url) return;
      var text = document.getSelection()?.toString()||url;
      document.execCommand('insertHTML', false, '<a href="'+esc(url)+'" target="_blank" style="color:#60a5fa;text-decoration:underline;">'+esc(text)+'</a>');
      _onRichEditorInput();
    }

    function richInsertMention() {
      var suggestions = G.users.map(function(u){ return u.name+' ('+u.email+')'; });
      var choice = prompt('Mentionner un utilisateur :\n'+suggestions.join('\n'));
      if (!choice) return;
      var user = G.users.find(function(u){ return choice.includes(u.email)||choice.includes(u.name); });
      if (user) {
        document.execCommand('insertHTML', false,
          '<span style="background:rgba(59,130,246,0.2);color:#93c5fd;border-radius:4px;padding:1px 6px;font-weight:600">@'+esc(user.name)+'</span>&nbsp;');
        _onRichEditorInput();
      }
    }

    function _onRichEditorInput() {
      if (!G.richEditor) return;
      G.richEditor.dirty = true;
      _updateRichSaveStatus('typing');
      clearTimeout(G.richEditor.saveTimer);
      G.richEditor.saveTimer = setTimeout(_saveRichContent, 1500);
      // Broadcast aux collaborateurs
      var editor = document.getElementById('richEditorContent');
      if (editor && G.collab?.channel) {
        var content = editor.innerHTML;
        G.collab.channel.send({ type:'broadcast', event:'rich_content_update', payload:{ user_id:G.user?.id, content:content } });
      }
    }

    async function _saveRichContent() {
      if (!G.richEditor?.docId) return;
      var editor = document.getElementById('richEditorContent'); if(!editor) return;
      var content = editor.innerHTML;
      try {
        await SB.from('documents').update({ content:content, content_type:'html', updated_at:new Date().toISOString() }).eq('id', G.richEditor.docId);
        _updateRichSaveStatus('saved');
        G.richEditor.dirty = false;
        var doc = G.docs.find(function(d){return d.id===G.richEditor.docId;}); if(doc) doc.content=content;
      } catch(_) { _updateRichSaveStatus('error'); }
    }

    function _updateRichSaveStatus(s) {
      var el = document.getElementById('richSaveStatus'); if(!el) return;
      var m = { typing:'<i class="fas fa-circle-notch fa-spin text-yellow-400 mr-1"></i><span class="text-yellow-400 text-xs">Sauvegarde...</span>', saved:'<i class="fas fa-check-circle text-green-400 mr-1"></i><span class="text-green-400 text-xs">Enregistré</span>', error:'<i class="fas fa-times-circle text-red-400 mr-1"></i><span class="text-red-400 text-xs">Erreur</span>' };
      el.innerHTML = m[s]||'';
    }

    function richSetFontSize(size) { document.execCommand('fontSize', false, size); _onRichEditorInput(); }
    function richAlign(dir) { document.execCommand('justify'+dir.charAt(0).toUpperCase()+dir.slice(1)); _onRichEditorInput(); }

    // Écouter les mises à jour riches des collaborateurs
    document.addEventListener('ged:collab_channel_ready', function(e) {
      if (!e.detail?.channel) return;
      e.detail.channel.on('broadcast',{event:'rich_content_update'}, function(payload) {
        if (payload.payload?.user_id === G.user?.id) return;
        var editor = document.getElementById('richEditorContent'); if(!editor) return;
        var sel = window.getSelection();
        editor.innerHTML = payload.payload?.content||editor.innerHTML;
      });
    });

    function _trackDocViewV6(docId) {
      if (!G.user||!docId) return;
      SB.from('document_views').insert({ document_id:docId, user_id:G.user.id, company_id:G.profile?.company_id||null }).then(function(){});
    }

    // ════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════
    //  3. API KEYS MANAGEMENT
    // ═══════════════════════════════════════════════════
    // ════════════════════════════════════════════════════

    async function _loadApiKeys() {
      if (!G.profile?.company_id) return;
      try {
        var { data } = await SB.from('api_keys').select('id,name,key_prefix,permissions,active,last_used,created_at,requests_count').eq('company_id', G.profile.company_id).order('created_at', {ascending:false});
        G.apiKeysV6 = data||[];
      } catch(_) {}
    }

    function renderApiKeysView() {
      _loadApiKeys().then(_renderApiKeysList);
    }

    function _renderApiKeysList() {
      var el = document.getElementById('apiKeysList2'); if(!el) return;
      if (!G.apiKeysV6.length) {
        el.innerHTML='<div class="text-center py-10 text-blue-300/50"><i class="fas fa-key text-4xl mb-3 block opacity-20"></i><p>Aucune clé API créée</p></div>'; return;
      }
      el.innerHTML = G.apiKeysV6.map(function(k){
        return '<div class="glass-card rounded-xl p-4 border border-blue-500/20 flex flex-col sm:flex-row sm:items-center gap-3">'+
          '<div class="flex items-center gap-3 flex-1 min-w-0">'+
            '<div class="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center text-yellow-400 flex-shrink-0"><i class="fas fa-key"></i></div>'+
            '<div class="min-w-0">'+
              '<p class="text-white font-semibold text-sm">'+esc(k.name)+'</p>'+
              '<code class="text-yellow-400 text-xs font-mono">'+esc(k.key_prefix)+'••••••••••••••••</code>'+
              '<p class="text-blue-400/50 text-xs mt-0.5">'+
                (k.last_used?'Utilisée '+fmtDate(k.last_used)+' · ':'Jamais utilisée · ')+
                (k.requests_count||0)+' requêtes'+
              '</p>'+
            '</div>'+
          '</div>'+
          '<div class="flex items-center gap-2 flex-shrink-0">'+
            '<span class="px-2 py-1 rounded-lg text-xs '+(k.active?'bg-green-500/20 text-green-400':'bg-red-500/20 text-red-400')+'">'+(k.active?'Active':'Révoquée')+'</span>'+
            (k.active?'<button onclick="revokeApiKey(\''+k.id+'\')" class="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30">Révoquer</button>':'')+
            '<button onclick="deleteApiKey(\''+k.id+'\')" class="p-1.5 text-red-400/60 hover:text-red-400 rounded-lg text-xs"><i class="fas fa-trash"></i></button>'+
          '</div>'+
        '</div>';
      }).join('');
    }

    async function generateApiKeyV6() {
      var name = document.getElementById('apiKeyName')?.value.trim()||'Clé API';
      var perms = {};
      ['documents','workflows','analytics','shares'].forEach(function(p){
        var el = document.getElementById('perm_api_'+p);
        if (el?.checked) perms[p] = ['read','write'];
        else perms[p] = [];
      });
      // Générer une clé sécurisée côté client
      var raw = 'ged_sk_' + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
      var prefix = raw.slice(0,12);
      // Hacher la clé avec SHA-256
      var buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      var hash = Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
      try {
        var { data, error } = await SB.from('api_keys').insert({
          company_id:  G.profile.company_id,
          created_by:  G.user.id,
          name:        name,
          key_hash:    hash,
          key_prefix:  prefix,
          permissions: perms,
        }).select().single();
        if (error) throw error;
        G.apiKeysV6.unshift(data);
        // Afficher la clé une seule fois
        var displayEl = document.getElementById('newApiKeyDisplay');
        if (displayEl) { displayEl.textContent=raw; displayEl.closest('.hidden')?.classList.remove('hidden'); }
        document.getElementById('apiKeyName').value='';
        showToast('Clé API générée — copiez-la maintenant, elle ne sera plus visible !','warning');
        _renderApiKeysList();
      } catch(err) { showToast('Erreur : '+err.message,'error'); }
    }

    async function revokeApiKey(id) {
      if (!confirm('Révoquer cette clé ? Toutes les intégrations qui l\'utilisent seront bloquées.')) return;
      await SB.from('api_keys').update({active:false}).eq('id',id);
      var k = G.apiKeysV6.find(function(x){return x.id===id;}); if(k) k.active=false;
      showToast('Clé révoquée','warning');
      _renderApiKeysList();
    }

    async function deleteApiKey(id) {
      if (!confirm('Supprimer définitivement cette clé ?')) return;
      await SB.from('api_keys').delete().eq('id',id);
      G.apiKeysV6 = G.apiKeysV6.filter(function(x){return x.id!==id;});
      showToast('Clé supprimée','success');
      _renderApiKeysList();
    }

    function copyApiKey(key) { navigator.clipboard?.writeText(key).then(function(){ showToast('Clé copiée !','success'); }); }

    // ════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════
    //  4. FACTURATION STRIPE
    // ═══════════════════════════════════════════════════
    // ════════════════════════════════════════════════════

    async function _loadSubscription() {
      if (!G.profile?.company_id) return;
      try {
        var { data } = await SB.from('subscriptions').select('*').eq('company_id', G.profile.company_id).single();
        G.subscription = data;
      } catch(_) {
        G.subscription = { plan:'free', status:'active', max_users:5, max_storage_gb:1, max_documents:100 };
      }
    }

    function _updatePlanLimits() {
      if (!G.subscription) return;
      G.MAX_STORAGE_MB = (G.subscription.max_storage_gb||1) * 1024;
      var plan = PLANS[G.subscription.plan]||PLANS.free;
      // Mettre à jour badge plan
      var badge = document.getElementById('planBadge');
      if (badge) { badge.textContent=(G.subscription.plan||'FREE').toUpperCase(); badge.className='hidden sm:inline badge-plan '+plan.badge; }
    }

    function renderBillingV6() {
      var el = document.getElementById('billingV6Content'); if(!el) return;
      var sub = G.subscription || { plan:'free', status:'active' };
      var plan = PLANS[sub.plan]||PLANS.free;
      var isActive = sub.status==='active'||sub.status==='trialing';
      el.innerHTML =
        // Plan actuel
        '<div class="glass-card rounded-2xl p-6 border-l-4 border-'+plan.color+'-500 mb-6">'+
          '<div class="flex items-start justify-between gap-4">'+
            '<div>'+
              '<p class="text-blue-300/70 text-xs font-semibold uppercase tracking-wider mb-1">Plan actuel</p>'+
              '<div class="flex items-center gap-3">'+
                '<h3 class="text-white text-2xl font-bold">'+plan.name+'</h3>'+
                '<span class="badge-plan '+plan.badge+'">'+(sub.plan||'free').toUpperCase()+'</span>'+
                '<span class="px-2 py-0.5 text-xs rounded-full '+(isActive?'bg-green-500/20 text-green-400':'bg-red-500/20 text-red-400')+'">'+sub.status+'</span>'+
              '</div>'+
              (sub.current_period_end?'<p class="text-blue-300/60 text-sm mt-2">Renouvellement : '+fmtDate(sub.current_period_end)+'</p>':'')+
            '</div>'+
            '<div class="text-right">'+
              '<p class="text-white text-3xl font-bold">'+(plan.price===null?'Sur devis':plan.price===0?'Gratuit':plan.price+'€')+'</p>'+
              (plan.price>0?'<p class="text-blue-400/60 text-sm">/mois</p>':'')+
            '</div>'+
          '</div>'+
          '<div class="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-'+plan.color+'-500/20">'+
            '<div class="text-center"><p class="text-white font-bold">'+(plan.users||'∞')+'</p><p class="text-xs text-blue-300/60">Utilisateurs</p></div>'+
            '<div class="text-center"><p class="text-white font-bold">'+(plan.storageGb||'∞')+' GB</p><p class="text-xs text-blue-300/60">Stockage</p></div>'+
            '<div class="text-center"><p class="text-white font-bold">'+(plan.docs||'∞')+'</p><p class="text-xs text-blue-300/60">Documents</p></div>'+
          '</div>'+
        '</div>'+
        // Grille des plans
        '<h3 class="text-white font-semibold mb-4">Changer de plan</h3>'+
        '<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">'+
        Object.entries(PLANS).map(function(entry){
          var key=entry[0], p=entry[1];
          var isCurrent = (sub.plan||'free')===key;
          return '<div class="glass-card rounded-2xl p-5 border-2 transition-all '+(isCurrent?'border-'+p.color+'-500 bg-'+p.color+'-500/10':'border-blue-500/20 hover:border-blue-400/40')+'" onclick="selectPlanV6(\''+key+'\',this)">'+
            '<div class="badge-plan '+p.badge+' mb-3 inline-block">'+key.toUpperCase()+'</div>'+
            '<p class="text-white text-2xl font-bold">'+(p.price===null?'Devis':p.price===0?'0€':p.price+'€')+'</p>'+
            (p.price>0?'<p class="text-blue-400/60 text-xs mb-3">/mois</p>':'<p class="text-blue-400/60 text-xs mb-3">Gratuit</p>')+
            '<ul class="space-y-1.5 text-xs text-blue-300/70">'+
              '<li><i class="fas fa-check text-green-400 mr-1"></i>'+(p.users||'∞')+' utilisateurs</li>'+
              '<li><i class="fas fa-check text-green-400 mr-1"></i>'+(p.storageGb||'∞')+' GB stockage</li>'+
              '<li><i class="fas fa-check text-green-400 mr-1"></i>'+(p.docs||'∞')+' documents</li>'+
              (key!=='free'?'<li><i class="fas fa-check text-green-400 mr-1"></i>Support prioritaire</li>':'')+
              (key==='pro'||key==='enterprise'?'<li><i class="fas fa-check text-green-400 mr-1"></i>API externe</li>':'')+
              (key==='enterprise'?'<li><i class="fas fa-check text-green-400 mr-1"></i>SSO + SLA</li>':'')+
            '</ul>'+
            (isCurrent?'<div class="mt-3 text-center text-xs text-'+p.color+'-400 font-medium">✓ Plan actuel</div>':'')+
          '</div>';
        }).join('')+
        '</div>'+
        '<div class="flex gap-3">'+
          '<button id="upgradeBtnV6" onclick="upgradeToStripe()" disabled class="btn-primary px-6 py-3 rounded-xl text-white font-semibold disabled:opacity-40"><i class="fas fa-credit-card mr-2"></i>Passer au plan sélectionné</button>'+
          (sub.stripe_subscription_id?'<button onclick="openStripePortal()" class="px-6 py-3 rounded-xl text-blue-400 border border-blue-500/30 hover:bg-blue-500/10 font-semibold"><i class="fas fa-external-link-alt mr-2"></i>Gérer via Stripe</button>':'')+
        '</div>';
    }

    var _selectedPlanV6 = null;
    function selectPlanV6(plan, el) {
      document.querySelectorAll('#billingV6Content .glass-card').forEach(function(c){
        c.classList.remove('ring-2','ring-blue-400');
      });
      el.classList.add('ring-2','ring-blue-400');
      _selectedPlanV6 = plan;
      var btn = document.getElementById('upgradeBtnV6');
      if (btn) { btn.disabled=(plan===(G.subscription?.plan||'free')); btn.textContent='Passer au plan '+plan.charAt(0).toUpperCase()+plan.slice(1)+' (Stripe)'; }
    }

    async function upgradeToStripe() {
      if (!_selectedPlanV6) return;
      if (!G.subscription?.stripe_customer_id) {
        // Simulation — en production appeler votre Edge Function Stripe Checkout
        showToast('Redirection vers Stripe Checkout... (simulation)', 'info');
        await _simulateUpgradeV6(_selectedPlanV6);
        return;
      }
      showToast('Ouverture Stripe Checkout...','info');
      // En production : window.location.href = await createStripeCheckoutSession(_selectedPlanV6);
      await _simulateUpgradeV6(_selectedPlanV6);
    }

    async function _simulateUpgradeV6(planKey) {
      var plan = PLANS[planKey]; if(!plan) return;
      var update = { plan:planKey, max_users:plan.users||9999, max_storage_gb:plan.storageGb||999, max_documents:plan.docs||999999, updated_at:new Date().toISOString() };
      if (G.profile?.company_id) {
        var { data } = await SB.from('subscriptions').upsert(Object.assign({ company_id:G.profile.company_id, status:'active' }, update), { onConflict:'company_id' }).select().single();
        G.subscription = data||Object.assign(G.subscription||{}, update);
      } else {
        G.subscription = Object.assign(G.subscription||{}, update);
      }
      _updatePlanLimits();
      showToast('✓ Plan '+plan.name+' activé !','success');
      renderBillingV6();
    }

    async function openStripePortal() {
      showToast('Ouverture du portail Stripe...','info');
      // En production : window.open(await createStripePortalSession(), '_blank');
    }

    // ════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════
    //  5. AUDIT SÉCURITÉ AVANCÉ
    // ═══════════════════════════════════════════════════
    // ════════════════════════════════════════════════════

    async function renderAuditV6() {
      var el = document.getElementById('auditV6Content'); if(!el) return;
      el.innerHTML = '<div class="text-blue-300/50 text-sm text-center py-4">Chargement...</div>';
      try {
        await Promise.all([_loadAuditStats(), _loadSecurityAlerts(), _loadAuditTimeline()]);
      } catch(err) {
        el.innerHTML='<p class="text-red-400 text-sm">Erreur : '+esc(err.message)+'</p>';
      }
    }

    async function _loadAuditStats() {
      if (!G.profile?.company_id) return;
      var days = G.auditFilters.days||7;
      var since = new Date(Date.now()-days*86400000).toISOString();
      var { data } = await SB.from('activity_logs').select('action,severity').eq('company_id',G.profile.company_id).gte('created_at',since);
      var stats = { total:0, critical:0, uploads:0, shares:0, deletes:0, logins:0 };
      (data||[]).forEach(function(l){
        stats.total++;
        if(l.severity==='critical') stats.critical++;
        if((l.action||'').includes('upload')) stats.uploads++;
        if((l.action||'').includes('share')) stats.shares++;
        if((l.action||'').includes('delete')) stats.deletes++;
        if((l.action||'').includes('login')) stats.logins++;
      });
      var el = document.getElementById('auditStatsGrid'); if(!el) return;
      var cards = [
        { icon:'fa-list', color:'blue', value:stats.total, label:'Actions ('+days+'j)' },
        { icon:'fa-exclamation-triangle', color:'red', value:stats.critical, label:'Alertes critiques' },
        { icon:'fa-upload', color:'green', value:stats.uploads, label:'Uploads' },
        { icon:'fa-share-alt', color:'purple', value:stats.shares, label:'Partages' },
        { icon:'fa-trash', color:'orange', value:stats.deletes, label:'Suppressions' },
        { icon:'fa-sign-in-alt', color:'cyan', value:stats.logins, label:'Connexions' },
      ];
      el.innerHTML = cards.map(function(c){
        return '<div class="glass-card rounded-xl p-4 border border-'+c.color+'-500/20">'+
          '<div class="flex items-center gap-3">'+
            '<div class="w-9 h-9 bg-'+c.color+'-500/20 rounded-lg flex items-center justify-center text-'+c.color+'-400"><i class="fas '+c.icon+'"></i></div>'+
            '<div><p class="text-white font-bold text-xl">'+c.value+'</p><p class="text-xs text-blue-300/60">'+esc(c.label)+'</p></div>'+
          '</div>'+
        '</div>';
      }).join('');
    }

    async function _loadSecurityAlerts() {
      if (!G.profile?.company_id) return;
      var el = document.getElementById('securityAlertsList'); if(!el) return;
      try {
        var { data, error } = await SB.rpc('get_security_alerts', { p_company_id:G.profile.company_id, p_hours:G.auditFilters.days*24 });
        if (error) throw error;
        if (!data?.length) { el.innerHTML='<p class="text-green-400/70 text-sm text-center py-4"><i class="fas fa-check-circle mr-2"></i>Aucune alerte sécurité</p>'; return; }
        el.innerHTML = data.map(function(a){
          return '<div class="flex items-start gap-3 p-3 rounded-xl bg-red-500/5 border border-red-500/20">'+
            '<i class="fas fa-exclamation-triangle text-red-400 mt-0.5 flex-shrink-0"></i>'+
            '<div class="flex-1">'+
              '<p class="text-white text-sm font-medium">'+esc(a.description)+'</p>'+
              '<p class="text-red-300/70 text-xs">'+esc(a.user_name||'?')+' · '+a.count+' fois · '+fmtDate(a.last_seen)+'</p>'+
            '</div>'+
            '<span class="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full flex-shrink-0">'+a.count+'x</span>'+
          '</div>';
        }).join('');
      } catch(_) {
        el.innerHTML='<p class="text-blue-300/50 text-sm text-center py-4">Données insuffisantes pour générer des alertes</p>';
      }
    }

    async function _loadAuditTimeline() {
      if (!G.profile?.company_id) return;
      var el = document.getElementById('auditTimelineList'); if(!el) return;
      var days = G.auditFilters.days||7;
      var since = new Date(Date.now()-days*86400000).toISOString();
      var q = SB.from('activity_logs')
        .select('id,action,description,severity,ip_address,created_at,user_id,users_profiles(name,email)')
        .eq('company_id',G.profile.company_id)
        .gte('created_at',since)
        .order('created_at',{ascending:false})
        .limit(50);
      if (G.auditFilters.severity) q = q.eq('severity', G.auditFilters.severity);
      if (G.auditFilters.action)   q = q.ilike('action','%'+G.auditFilters.action+'%');
      var { data } = await q;
      if (!data?.length) { el.innerHTML='<p class="text-blue-300/50 text-sm text-center py-6">Aucune entrée dans la période sélectionnée</p>'; return; }
      var SEV = { info:'text-blue-400', warning:'text-yellow-400', critical:'text-red-400' };
      var ACT_ICON = { login:'fa-sign-in-alt', upload:'fa-upload', share:'fa-share-alt', delete:'fa-trash', download:'fa-download', workflow:'fa-project-diagram', security:'fa-shield-alt', view:'fa-eye' };
      el.innerHTML = data.map(function(l){
        var icon = Object.keys(ACT_ICON).find(function(k){return (l.action||'').includes(k);})||'info-circle';
        var sevColor = SEV[l.severity]||SEV.info;
        return '<div class="flex items-start gap-3 py-2.5 border-b border-blue-500/10 last:border-0 hover:bg-blue-500/5 rounded-lg px-2 transition-all">'+
          '<i class="fas fa-'+(ACT_ICON[icon]||'info-circle')+' '+sevColor+' mt-0.5 w-4 text-center flex-shrink-0 text-sm"></i>'+
          '<div class="flex-1 min-w-0">'+
            '<p class="text-white text-xs font-medium">'+esc(l.description||l.action||'action')+'</p>'+
            '<p class="text-blue-400/50 text-[10px]">'+esc(l.users_profiles?.name||'Système')+
              (l.ip_address?' · IP: '+esc(l.ip_address):'')+'</p>'+
          '</div>'+
          '<div class="flex-shrink-0 text-right">'+
            '<p class="text-blue-400/40 text-[10px]">'+new Date(l.created_at).toLocaleString('fr-FR').replace(',',' ')+'</p>'+
            (l.severity&&l.severity!=='info'?'<span class="px-1.5 py-0.5 text-[10px] rounded bg-red-500/20 text-red-400">'+l.severity+'</span>':'')+
          '</div>'+
        '</div>';
      }).join('');
    }

    function setAuditFilter(key, val) {
      G.auditFilters[key] = val;
      renderAuditV6();
    }

    // ════════════════════════════════════════════════════
    // LOG AVANCÉ — enrichir _logActivity avec IP/UA
    // ════════════════════════════════════════════════════
    var _origLogActivity = window.logActivity;
    window.logActivity = function(action, docId, description, severity) {
      if (_origLogActivity) _origLogActivity(action, docId, description);
      // Enrichir avec IP/UA/severity en DB
      if (G.user && G.profile?.company_id) {
        SB.from('activity_logs').update({
          ip_address:  null,  // récupérée côté serveur uniquement
          user_agent:  navigator.userAgent?.slice(0,200)||null,
          severity:    severity||'info',
          resource_type: docId?'document':null,
          resource_id:   docId||null,
        }).eq('user_id', G.user.id).order('created_at',{ascending:false}).limit(1).then(function(){});
      }
    };

    // ════════════════════════════════════════════════════
    // EXPOSITION PUBLIQUE
    // ════════════════════════════════════════════════════
    var v6pub = {
      // Dossiers
      openFolder, createFolder, confirmDeleteFolder, openRenameFolderModal,
      openFolderModal, closeFolderModal, moveDocumentToFolder,
      renderFoldersView,
      // Éditeur riche
      openRichEditor, closeRichEditor,
      richCmd, richInsertHeading, richInsertTable, richInsertCodeBlock,
      richInsertLink, richInsertMention, richSetFontSize, richAlign,
      _onRichEditorInput, _saveRichContent,
      // API Keys
      renderApiKeysView, generateApiKeyV6, revokeApiKey, deleteApiKey, copyApiKey,
      // Billing
      renderBillingV6, selectPlanV6, upgradeToStripe, openStripePortal,
      // Audit
      renderAuditV6, setAuditFilter,
    };
    Object.keys(v6pub).forEach(function(k){ window[k]=v6pub[k]; });

  }); // fin _ready

})();
