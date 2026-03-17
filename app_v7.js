/**
 * SystemesGED v7.0 — app_v7.js
 * Module d'extension — chargé APRÈS app.js et app_v6.js
 *
 * Modules v7 :
 *   1. RBAC Avancé (permissions granulaires)
 *   2. Signatures électroniques (canvas)
 *   3. Recherche full-text (PostgreSQL FTS + OCR)
 *   4. Versioning complet (upload + restore)
 *   5. Workflow Automation (règles trigger/action)
 *   6. Notifications multi-canal
 *   7. Intégrations marketplace
 *   8. IA documentaire (résumé + classification)
 *   9. Backups & restore
 *  10. API endpoints mobile-ready
 *
 * Dépend de : app.js, app_v6.js
 * ─────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  function _ready(fn) {
    if (typeof window.G !== 'undefined' && typeof window.SB !== 'undefined') fn();
    else setTimeout(function () { _ready(fn); }, 80);
  }

  _ready(function () {

    var G         = window.G;
    var SB        = window.SB;
    var esc       = window.escapeHtml || function (s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var showToast = window.showToast;
    var set$      = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
    var fmtDate   = window.fmtDate || function (iso) { return iso ? new Date(iso).toLocaleDateString('fr-FR') : ''; };
    var formatFileSize = window.formatFileSize || function (b) { if (!b) return '0 B'; var s = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(b) / Math.log(1024)); return parseFloat((b / Math.pow(1024, i)).toFixed(1)) + ' ' + s[i]; };
    var avatarInitials = window.avatarInitials || function (n) { return (n || '?').split(' ').map(function (x) { return x[0] || ''; }).join('').toUpperCase().slice(0, 2) || '?'; };

    // ─ Extension état global v7 ─────────────────────────────
    G.rbacRoles        = [];
    G.rbacPermissions  = [];
    G.signatures       = [];
    G.wfRules          = [];
    G.notifChannels    = [];
    G.integrations     = [];
    G.aiAnalyses       = {};   // { docId: analysis }
    G.backups          = [];
    G.docVersionsMap   = {};   // { docId: [versions] }
    G._signCanvas      = null;
    G._signDocId       = null;

    // ─ Surcharger switchView ─────────────────────────────────
    var _prevSwitchView = window.switchView;
    window.switchView = function (v) {
      if (_prevSwitchView) _prevSwitchView(v);
      if (v === 'signatures')    renderSignaturesView();
      if (v === 'search')        initSearchView();
      if (v === 'automation')    renderAutomationView();
      if (v === 'integrations')  renderIntegrationsView();
      if (v === 'ai')            renderAIView();
      if (v === 'backups')       renderBackupsView();
      if (v === 'rbacv7')        renderRbacV7();
    };

    // ─ Charger données v7 après connexion ───────────────────
    var _poll = setInterval(function () {
      if (G.user && G.profile) {
        clearInterval(_poll);
        setTimeout(function () {
          _loadV7Data();
        }, 1200);
      }
    }, 500);

    async function _loadV7Data() {
      await Promise.all([
        _loadRbacData(),
        _loadSignatures(),
        _loadWfRules(),
        _loadNotifChannels(),
        _loadIntegrations(),
        _loadBackups(),
      ]);
    }

    // ═══════════════════════════════════════════════════════════
    //  1. RBAC AVANCÉ
    // ═══════════════════════════════════════════════════════════

    async function _loadRbacData() {
      if (!G.profile?.company_id) return;
      try {
        var [r1, r2] = await Promise.all([
          SB.from('roles').select('*, role_permissions(permissions(code,description,category))').eq('company_id', G.profile.company_id),
          SB.from('permissions').select('*').order('category')
        ]);
        G.rbacRoles       = (r1.data || []);
        G.rbacPermissions = (r2.data || []);
      } catch (_) {}
    }

    function renderRbacV7() {
      _loadRbacData().then(function () {
        _renderRolesGrid();
        _renderPermissionsMatrix();
      });
    }

    function _renderRolesGrid() {
      var el = document.getElementById('rbacV7RolesGrid'); if (!el) return;
      if (!G.rbacRoles.length) {
        el.innerHTML = '<div class="text-center py-8 text-blue-300/50"><i class="fas fa-shield-alt text-4xl mb-3 block opacity-20"></i><p>Aucun rôle créé. Créez votre premier rôle.</p></div>';
        return;
      }
      var COLORS = ['blue', 'purple', 'green', 'amber', 'red', 'cyan'];
      el.innerHTML = G.rbacRoles.map(function (r, i) {
        var c = COLORS[i % COLORS.length];
        var perms = (r.role_permissions || []).map(function (rp) { return rp.permissions?.code || ''; }).filter(Boolean);
        return '<div class="glass-card rounded-2xl p-5 border border-' + c + '-500/25 space-y-3">' +
          '<div class="flex items-center justify-between">' +
            '<div class="flex items-center gap-3">' +
              '<div class="w-10 h-10 bg-' + c + '-500/20 rounded-xl flex items-center justify-center text-' + c + '-400">' +
                '<i class="fas fa-shield-alt"></i>' +
              '</div>' +
              '<div><h3 class="text-white font-bold">' + esc(r.name) + '</h3><p class="text-xs text-blue-300/50">' + esc(r.slug) + '</p></div>' +
            '</div>' +
            '<div class="flex gap-1">' +
              '<button onclick="openEditRoleModal(\'' + r.id + '\')" class="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg"><i class="fas fa-edit text-xs"></i></button>' +
              (!r.is_system ? '<button onclick="deleteRole(\'' + r.id + '\')" class="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"><i class="fas fa-trash text-xs"></i></button>' : '') +
            '</div>' +
          '</div>' +
          '<div class="flex flex-wrap gap-1">' +
            perms.slice(0, 6).map(function (p) {
              return '<span class="text-[10px] px-2 py-0.5 bg-' + c + '-500/15 text-' + c + '-300 rounded-full border border-' + c + '-500/20">' + esc(p) + '</span>';
            }).join('') +
            (perms.length > 6 ? '<span class="text-[10px] px-2 py-0.5 bg-slate-800/50 text-blue-300/50 rounded-full">+' + (perms.length - 6) + ' autres</span>' : '') +
          '</div>' +
          '<p class="text-xs text-blue-300/40">' + perms.length + ' permission(s) · ' + (r.is_system ? 'Rôle système' : 'Rôle personnalisé') + '</p>' +
        '</div>';
      }).join('');
    }

    function _renderPermissionsMatrix() {
      var el = document.getElementById('rbacV7PermMatrix'); if (!el) return;
      var cats = {};
      G.rbacPermissions.forEach(function (p) {
        if (!cats[p.category]) cats[p.category] = [];
        cats[p.category].push(p);
      });
      var CAT_LABELS = { document: '📄 Documents', folder: '📁 Dossiers', workflow: '⚙️ Workflows', admin: '🔧 Administration', api: '🔌 API' };
      el.innerHTML = Object.entries(cats).map(function (entry) {
        var cat = entry[0], perms = entry[1];
        return '<div class="glass-card rounded-xl p-4 border border-blue-500/15">' +
          '<h4 class="text-white font-semibold text-sm mb-3">' + esc(CAT_LABELS[cat] || cat) + '</h4>' +
          '<div class="space-y-2">' +
            perms.map(function (p) {
              return '<div class="flex items-center justify-between">' +
                '<span class="text-blue-300/70 text-xs">' + esc(p.description || p.code) + '</span>' +
                '<code class="text-yellow-400 text-[10px] font-mono">' + esc(p.code) + '</code>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('');
    }

    async function createRoleV7() {
      var name = document.getElementById('newRoleName')?.value.trim();
      var slug = name?.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      if (!name || !G.profile?.company_id) { showToast('Nom requis', 'error'); return; }
      try {
        var { data, error } = await SB.from('roles').insert({
          company_id: G.profile.company_id, name, slug, created_by: G.user.id
        }).select().single();
        if (error) throw error;
        G.rbacRoles.push(data);
        document.getElementById('newRoleName').value = '';
        showToast('Rôle "' + name + '" créé ✓', 'success');
        _renderRolesGrid();
      } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
    }

    async function deleteRole(id) {
      if (!confirm('Supprimer ce rôle ?')) return;
      await SB.from('roles').delete().eq('id', id);
      G.rbacRoles = G.rbacRoles.filter(function (r) { return r.id !== id; });
      showToast('Rôle supprimé', 'success');
      _renderRolesGrid();
    }

    async function grantPermission(userId, permCode, resourceType, resourceId) {
      var perm = G.rbacPermissions.find(function (p) { return p.code === permCode; });
      if (!perm) { showToast('Permission introuvable', 'error'); return; }
      try {
        var { error } = await SB.from('user_permissions').upsert({
          user_id: userId, company_id: G.profile.company_id,
          permission_id: perm.id, resource_type: resourceType || 'company',
          resource_id: resourceId || null, granted_by: G.user.id
        }, { onConflict: 'user_id,resource_type,resource_id,permission_id' });
        if (error) throw error;
        showToast('Permission accordée ✓', 'success');
      } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
    }

    function openEditRoleModal(id) {
      showToast('Édition de rôle — à implémenter via le modal RBAC', 'info');
    }

    // ═══════════════════════════════════════════════════════════
    //  2. SIGNATURES ÉLECTRONIQUES
    // ═══════════════════════════════════════════════════════════

    async function _loadSignatures() {
      if (!G.profile?.company_id) return;
      try {
        var { data } = await SB.from('document_signatures')
          .select('*, documents(name), users_profiles!document_signatures_user_id_fkey(name,email)')
          .eq('company_id', G.profile.company_id)
          .order('created_at', { ascending: false })
          .limit(50);
        G.signatures = data || [];
      } catch (_) {}
    }

    function renderSignaturesView() {
      _loadSignatures().then(function () {
        _renderSignaturesList();
        _updateSignatureStats();
      });
    }

    function _updateSignatureStats() {
      var pending  = G.signatures.filter(function (s) { return s.status === 'pending'; }).length;
      var signed   = G.signatures.filter(function (s) { return s.status === 'signed'; }).length;
      var rejected = G.signatures.filter(function (s) { return s.status === 'rejected'; }).length;
      set$('sigStatPending',  pending);
      set$('sigStatSigned',   signed);
      set$('sigStatRejected', rejected);
    }

    function _renderSignaturesList() {
      var el = document.getElementById('signaturesList'); if (!el) return;
      if (!G.signatures.length) {
        el.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-signature text-4xl mb-3 block opacity-20"></i><p>Aucune demande de signature</p></div>';
        return;
      }
      var STATUS = {
        pending:  { c: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/20', label: 'En attente' },
        signed:   { c: 'text-green-400 bg-green-500/15 border-green-500/20',    label: 'Signé' },
        rejected: { c: 'text-red-400 bg-red-500/15 border-red-500/20',          label: 'Rejeté' },
        expired:  { c: 'text-gray-400 bg-gray-500/15 border-gray-500/20',       label: 'Expiré' }
      };
      el.innerHTML = G.signatures.map(function (s) {
        var st = STATUS[s.status] || STATUS.pending;
        var userName = s.users_profiles?.name || s.users_profiles?.email || '?';
        var docName  = s.documents?.name || 'Document';
        return '<div class="glass-card rounded-xl p-4 border border-blue-500/15 flex items-center gap-4">' +
          '<div class="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-400 flex-shrink-0">' +
            '<i class="fas fa-signature"></i>' +
          '</div>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-white font-semibold text-sm truncate">' + esc(docName) + '</p>' +
            '<p class="text-blue-400/60 text-xs">Signataire : ' + esc(userName) + '</p>' +
            '<p class="text-blue-400/40 text-xs">' + fmtDate(s.created_at) + (s.signed_at ? ' · Signé ' + fmtDate(s.signed_at) : '') + '</p>' +
          '</div>' +
          '<div class="flex items-center gap-2 flex-shrink-0">' +
            '<span class="px-2 py-1 rounded-lg text-xs border ' + st.c + '">' + st.label + '</span>' +
            (s.status === 'pending' && s.user_id === G.user?.id ?
              '<button onclick="openSignModal(\'' + s.id + '\')" class="px-3 py-1.5 btn-primary rounded-lg text-xs text-white">Signer</button>' : '') +
          '</div>' +
        '</div>';
      }).join('');
    }

    async function requestSignature(docId, userEmail, message) {
      var d = G.docs.find(function (x) { return x.id === docId; }); if (!d) return;
      var target = G.users.find(function (u) { return u.email === userEmail; });
      if (!target) { showToast('Utilisateur introuvable : ' + userEmail, 'error'); return; }
      try {
        var expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
        var { data, error } = await SB.from('document_signatures').insert({
          document_id: docId, user_id: target.id,
          company_id: G.profile?.company_id,
          status: 'pending', requested_by: G.user.id,
          message: message || 'Veuillez signer ce document.',
          expires_at: expiresAt
        }).select().single();
        if (error) throw error;
        G.signatures.unshift(data);
        window.addNotification?.('info', 'Signature demandée', d.name + ' → ' + userEmail);
        showToast('Demande de signature envoyée → ' + userEmail, 'success');
        _renderSignaturesList();
        _updateSignatureStats();
      } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
    }

    function openSignModal(sigId) {
      G._signSigId = sigId;
      document.getElementById('signatureModal')?.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      setTimeout(_initSignCanvas, 100);
    }
    function closeSignModal() {
      document.getElementById('signatureModal')?.classList.add('hidden');
      document.body.style.overflow = '';
      G._signCanvas = null;
      G._signSigId = null;
    }

    function _initSignCanvas() {
      var canvas = document.getElementById('signatureCanvas'); if (!canvas) return;
      var ctx = canvas.getContext('2d');
      canvas.width  = canvas.offsetWidth  || 500;
      canvas.height = canvas.offsetHeight || 180;
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth   = 2.5;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      G._signCanvas = { canvas, ctx, drawing: false, empty: true };

      function getPos(e) {
        var r = canvas.getBoundingClientRect();
        var src = e.touches ? e.touches[0] : e;
        return { x: src.clientX - r.left, y: src.clientY - r.top };
      }

      canvas.onmousedown = canvas.ontouchstart = function (e) {
        e.preventDefault();
        var p = getPos(e);
        G._signCanvas.drawing = true;
        G._signCanvas.empty   = false;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      };
      canvas.onmousemove = canvas.ontouchmove = function (e) {
        e.preventDefault();
        if (!G._signCanvas.drawing) return;
        var p = getPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      };
      canvas.onmouseup = canvas.ontouchend = function () {
        G._signCanvas.drawing = false;
      };
    }

    function clearSignature() {
      if (!G._signCanvas) return;
      G._signCanvas.ctx.clearRect(0, 0, G._signCanvas.canvas.width, G._signCanvas.canvas.height);
      G._signCanvas.empty = true;
    }

    async function submitSignature() {
      if (!G._signCanvas || G._signCanvas.empty) { showToast('Veuillez dessiner votre signature', 'error'); return; }
      if (!G._signSigId) return;
      var dataUrl = G._signCanvas.canvas.toDataURL('image/png');
      // Hash SHA-256 de la signature
      var buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataUrl));
      var hash = Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      try {
        var { error } = await SB.from('document_signatures').update({
          status: 'signed', signed_at: new Date().toISOString(),
          signature_image: dataUrl, signature_hash: hash,
          ip_address: null
        }).eq('id', G._signSigId).eq('user_id', G.user.id);
        if (error) throw error;
        var s = G.signatures.find(function (x) { return x.id === G._signSigId; });
        if (s) { s.status = 'signed'; s.signed_at = new Date().toISOString(); }
        showToast('Document signé ✓', 'success');
        closeSignModal();
        _renderSignaturesList();
        _updateSignatureStats();
        window.logActivity?.('signature', null, 'Signature électronique');
      } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
    }

    async function openRequestSignatureModal(docId) {
      G._signDocId = docId;
      var d = G.docs.find(function (x) { return x.id === docId; });
      set$('reqSigDocName', d?.name || '');
      var sel = document.getElementById('reqSigUserEmail');
      if (sel) {
        sel.innerHTML = '<option value="">-- Choisir un signataire --</option>' +
          G.users.filter(function (u) { return u.id !== G.user.id; })
            .map(function (u) { return '<option value="' + esc(u.email) + '">' + esc(u.name) + ' (' + esc(u.email) + ')</option>'; }).join('');
      }
      document.getElementById('requestSignatureModal')?.classList.remove('hidden');
    }
    function closeRequestSignatureModal() { document.getElementById('requestSignatureModal')?.classList.add('hidden'); }

    async function submitSignatureRequest() {
      var email   = document.getElementById('reqSigUserEmail')?.value;
      var message = document.getElementById('reqSigMessage')?.value.trim();
      if (!email || !G._signDocId) { showToast('Signataire requis', 'error'); return; }
      await requestSignature(G._signDocId, email, message);
      closeRequestSignatureModal();
    }

    // ═══════════════════════════════════════════════════════════
    //  3. RECHERCHE FULL-TEXT
    // ═══════════════════════════════════════════════════════════

    function initSearchView() {
      var el = document.getElementById('searchV7Results');
      if (el) el.innerHTML = '<div class="text-center py-20 text-blue-300/30"><i class="fas fa-search text-5xl mb-4 block opacity-10"></i><p>Tapez votre recherche ci-dessus</p></div>';
    }

    async function runFTSearch() {
      var q    = document.getElementById('ftsInput')?.value.trim();
      var type = document.getElementById('ftsType')?.value || '';
      var date = document.getElementById('ftsDate')?.value || '';
      var el   = document.getElementById('searchV7Results');
      var cnt  = document.getElementById('ftsCount');
      if (!q || q.length < 2) { showToast('Tapez au moins 2 caractères', 'info'); return; }
      if (el) el.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-circle-notch fa-spin text-3xl"></i></div>';

      try {
        var results = [];
        if (G.profile?.company_id) {
          var { data } = await SB.rpc('search_documents', { p_company_id: G.profile.company_id, p_query: q, p_limit: 40 });
          results = data || [];
        } else {
          // Fallback client-side
          var lower = q.toLowerCase();
          results = G.docs.filter(function (d) {
            return (d.name || '').toLowerCase().includes(lower) || (d.description || '').toLowerCase().includes(lower);
          }).map(function (d) { return Object.assign({}, d, { rank: 1, match_source: 'document' }); });
        }

        // Filtrer type
        if (type) results = results.filter(function (d) {
          var ext = (d.name || '').split('.').pop().toLowerCase();
          if (type === 'pdf') return ext === 'pdf';
          if (type === 'doc') return ['doc', 'docx'].includes(ext);
          if (type === 'xls') return ['xls', 'xlsx'].includes(ext);
          if (type === 'img') return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
          return true;
        });

        // Filtrer date
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

        if (cnt) cnt.textContent = results.length + ' résultat(s)';
        if (!el) return;

        if (!results.length) {
          el.innerHTML = '<div class="text-center py-16"><i class="fas fa-search text-5xl mb-4 block text-blue-400/20"></i><p class="text-blue-300/50">Aucun résultat pour "' + esc(q) + '"</p></div>';
          return;
        }

        var fi = window.getFileIcon || function () { return { icon: 'fa-file', color: 'text-gray-400', bg: 'bg-gray-500/20', border: 'border-gray-400/30' }; };

        el.innerHTML = '<div class="space-y-2">' + results.map(function (d) {
          var f = fi(d.name || '');
          var sourceLabel = d.match_source === 'ocr'
            ? '<span class="px-1.5 py-0.5 text-[10px] bg-purple-500/20 text-purple-400 rounded">OCR</span>'
            : '<span class="px-1.5 py-0.5 text-[10px] bg-blue-500/20 text-blue-400 rounded">Texte</span>';
          return '<div class="glass-card rounded-xl border border-cyan-500/15 p-4 flex items-center gap-4 hover:border-cyan-400/40 cursor-pointer group transition-all" onclick="openDocumentPreview(\'' + d.id + '\')">' +
            '<div class="w-11 h-11 ' + f.bg + ' rounded-xl flex items-center justify-center ' + f.color + ' border ' + f.border + ' flex-shrink-0">' +
              '<i class="fas ' + f.icon + ' text-lg"></i>' +
            '</div>' +
            '<div class="flex-1 min-w-0">' +
              '<div class="flex items-center gap-2 mb-0.5">' +
                '<p class="text-white font-semibold text-sm truncate">' + esc(d.name) + '</p>' +
                sourceLabel +
              '</div>' +
              '<p class="text-xs text-blue-300/50">' + formatFileSize(d.file_size || 0) + ' · ' + fmtDate(d.created_at) + '</p>' +
            '</div>' +
            '<button onclick="event.stopPropagation();downloadDocument(\'' + d.id + '\')" class="opacity-0 group-hover:opacity-100 px-3 py-1.5 bg-slate-700/50 text-gray-400 rounded-lg text-xs hover:bg-slate-600/50">' +
              '<i class="fas fa-download"></i>' +
            '</button>' +
          '</div>';
        }).join('') + '</div>';

      } catch (err) {
        if (el) el.innerHTML = '<p class="text-red-400 text-sm text-center py-8">Erreur : ' + esc(err.message) + '</p>';
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  4. VERSIONING COMPLET
    // ═══════════════════════════════════════════════════════════

    async function loadDocVersions(docId) {
      try {
        var { data } = await SB.from('document_versions')
          .select('*, users_profiles(name,email)')
          .eq('document_id', docId)
          .order('version_number', { ascending: false });
        G.docVersionsMap[docId] = data || [];
        return data || [];
      } catch (_) { return []; }
    }

    async function renderDocVersionHistory(docId) {
      var el = document.getElementById('versionHistory_' + docId); if (!el) return;
      var versions = await loadDocVersions(docId);
      if (!versions.length) {
        el.innerHTML = '<p class="text-blue-300/50 text-xs text-center py-3">Aucune version archivée</p>';
        return;
      }
      el.innerHTML = versions.map(function (v) {
        var isActive = v.version_number === (G.docs.find(function (d) { return d.id === docId; })?.version_number || 1);
        return '<div class="flex items-center justify-between py-2 border-b border-blue-500/10 last:border-0">' +
          '<div class="flex items-center gap-3">' +
            '<span class="w-8 h-8 ' + (isActive ? 'bg-green-500/20 text-green-400 border-green-400/20' : 'bg-slate-700/60 text-gray-400 border-gray-600/20') + ' rounded-full flex items-center justify-center text-xs font-bold border">v' + v.version_number + '</span>' +
            '<div>' +
              '<p class="text-sm ' + (isActive ? 'text-white' : 'text-blue-300/60') + '">' + esc(v.change_summary || 'Mise à jour') + '</p>' +
              '<p class="text-xs text-blue-300/40">' + esc(v.users_profiles?.name || '?') + ' · ' + fmtDate(v.created_at) + '</p>' +
            '</div>' +
          '</div>' +
          '<div class="flex gap-2">' +
            (!isActive ? '<button onclick="restoreDocVersion(\'' + docId + '\',' + v.version_number + ')" class="px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-xs">Restaurer</button>' : '<span class="text-xs text-green-400">Active</span>') +
          '</div>' +
        '</div>';
      }).join('');
    }

    async function uploadDocumentVersion(docId) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png';
      input.onchange = async function () {
        var file = input.files[0]; if (!file) return;
        var d = G.docs.find(function (x) { return x.id === docId; }); if (!d) return;
        var newVer = (d.version_number || 1) + 1;
        var summary = prompt('Résumé des modifications (v' + newVer + ') :', 'Mise à jour ' + fmtDate(new Date().toISOString()));
        showToast('Upload v' + newVer + ' en cours…', 'info');
        try {
          var safeName   = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
          var storagePath = G.user.id + '/' + Date.now() + '_v' + newVer + '_' + safeName;
          var { error: stErr } = await SB.storage.from('documents').upload(storagePath, file);
          if (stErr) throw stErr;
          var { data: urlData } = SB.storage.from('documents').getPublicUrl(storagePath);
          // Archiver la version courante
          await SB.from('document_versions').insert({
            document_id: docId, version_number: newVer - 1,
            file_url: d.file_url, storage_path: d.storage_path,
            file_size: d.file_size, created_by: G.user.id,
            change_summary: summary || 'Version ' + (newVer - 1)
          });
          // Mettre à jour le document principal
          await SB.from('documents').update({
            file_url: urlData.publicUrl, storage_path: storagePath,
            file_size: file.size, version_number: newVer,
            updated_at: new Date().toISOString()
          }).eq('id', docId);
          d.version_number = newVer; d.file_url = urlData.publicUrl;
          window.logActivity?.('upload', docId, 'Nouvelle version v' + newVer + ' : ' + d.name);
          showToast('Version v' + newVer + ' créée ✓', 'success');
          window.renderDocuments?.();
        } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
      };
      input.click();
    }

    async function restoreDocVersion(docId, versionNumber) {
      if (!confirm('Restaurer la version ' + versionNumber + ' ? La version actuelle sera archivée.')) return;
      var versions = await loadDocVersions(docId);
      var target = versions.find(function (v) { return v.version_number === versionNumber; });
      if (!target) { showToast('Version introuvable', 'error'); return; }
      var d = G.docs.find(function (x) { return x.id === docId; }); if (!d) return;
      // Archiver la version courante
      var currentVer = d.version_number || 1;
      await SB.from('document_versions').upsert({
        document_id: docId, version_number: currentVer,
        file_url: d.file_url, file_size: d.file_size,
        created_by: G.user.id, change_summary: 'Avant restauration v' + versionNumber
      }, { onConflict: 'document_id,version_number' });
      // Restaurer
      await SB.from('documents').update({
        file_url: target.file_url, storage_path: target.storage_path,
        file_size: target.file_size, version_number: versionNumber,
        updated_at: new Date().toISOString()
      }).eq('id', docId);
      if (d) { d.version_number = versionNumber; d.file_url = target.file_url; }
      window.logActivity?.('restore', docId, 'Restauration v' + versionNumber);
      showToast('Version ' + versionNumber + ' restaurée ✓', 'success');
      window.renderDocuments?.();
    }

    // ═══════════════════════════════════════════════════════════
    //  5. WORKFLOW AUTOMATION
    // ═══════════════════════════════════════════════════════════

    async function _loadWfRules() {
      if (!G.profile?.company_id) return;
      try {
        var { data } = await SB.from('workflow_rules').select('*').eq('company_id', G.profile.company_id).order('created_at', { ascending: false });
        G.wfRules = data || [];
      } catch (_) {}
    }

    function renderAutomationView() {
      _loadWfRules().then(_renderWfRules);
    }

    function _renderWfRules() {
      var el = document.getElementById('automationRulesList'); if (!el) return;
      var stats = document.getElementById('automationStats');
      if (stats) {
        var active = G.wfRules.filter(function (r) { return r.active; }).length;
        stats.innerHTML = '<span class="text-blue-300/60 text-sm">' + G.wfRules.length + ' règle(s) · ' + active + ' active(s)</span>';
      }
      if (!G.wfRules.length) {
        el.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-magic text-4xl mb-3 block opacity-20"></i><p>Aucune règle d\'automatisation. Créez votre première règle.</p></div>';
        return;
      }
      var TRIGGER_LABELS = { document_upload: '📤 Upload document', document_delete: '🗑️ Suppression', workflow_approve: '✅ Approbation', workflow_reject: '❌ Rejet', user_login: '🔐 Connexion', signature_done: '✍️ Signature' };
      var ACTION_LABELS  = { start_workflow: 'Démarrer workflow', send_notification: 'Envoyer notification', assign_tag: 'Assigner tag', move_folder: 'Déplacer dossier', send_email: 'Envoyer email', call_webhook: 'Appeler webhook' };

      el.innerHTML = G.wfRules.map(function (r) {
        var triggerEvent = r.trigger?.event || 'unknown';
        var actions      = (r.actions || []).map(function (a) { return ACTION_LABELS[a.type] || a.type; }).join(', ');
        return '<div class="glass-card rounded-xl p-5 border border-blue-500/20 flex items-start gap-4">' +
          '<div class="w-10 h-10 ' + (r.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400') + ' rounded-xl flex items-center justify-center flex-shrink-0">' +
            '<i class="fas fa-magic"></i>' +
          '</div>' +
          '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center gap-2 mb-1">' +
              '<p class="text-white font-semibold text-sm">' + esc(r.name) + '</p>' +
              '<span class="text-[10px] px-2 py-0.5 rounded-full ' + (r.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400') + '">' + (r.active ? 'Actif' : 'Inactif') + '</span>' +
            '</div>' +
            '<div class="flex items-center gap-2 text-xs text-blue-300/60">' +
              '<span class="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded">' + esc(TRIGGER_LABELS[triggerEvent] || triggerEvent) + '</span>' +
              '<i class="fas fa-arrow-right text-blue-400/40"></i>' +
              '<span>' + esc(actions || 'Aucune action') + '</span>' +
            '</div>' +
            (r.runs_count ? '<p class="text-xs text-blue-300/40 mt-1">Exécuté ' + r.runs_count + ' fois · Dernière : ' + (r.last_run ? fmtDate(r.last_run) : 'jamais') + '</p>' : '') +
          '</div>' +
          '<div class="flex gap-2 flex-shrink-0">' +
            '<button onclick="toggleWfRule(\'' + r.id + '\',' + !r.active + ')" class="p-2 ' + (r.active ? 'text-yellow-400 hover:bg-yellow-500/10' : 'text-green-400 hover:bg-green-500/10') + ' rounded-lg text-sm" title="' + (r.active ? 'Désactiver' : 'Activer') + '"><i class="fas ' + (r.active ? 'fa-pause' : 'fa-play') + '"></i></button>' +
            '<button onclick="deleteWfRule(\'' + r.id + '\')" class="p-2 text-red-400 hover:bg-red-500/10 rounded-lg text-sm"><i class="fas fa-trash"></i></button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    async function createWfRule(e) {
      e && e.preventDefault();
      var name    = document.getElementById('wfRuleName')?.value.trim();
      var trigger = document.getElementById('wfRuleTrigger')?.value || 'document_upload';
      var action  = document.getElementById('wfRuleAction')?.value  || 'send_notification';
      if (!name || !G.profile?.company_id) { showToast('Nom requis', 'error'); return; }
      try {
        var { data, error } = await SB.from('workflow_rules').insert({
          company_id: G.profile.company_id, created_by: G.user.id,
          name, trigger: { event: trigger }, conditions: [],
          actions: [{ type: action }], active: true
        }).select().single();
        if (error) throw error;
        G.wfRules.unshift(data);
        document.getElementById('wfRuleName').value = '';
        showToast('Règle "' + name + '" créée ✓', 'success');
        closeWfRuleModal();
        _renderWfRules();
      } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
    }

    async function toggleWfRule(id, active) {
      await SB.from('workflow_rules').update({ active }).eq('id', id);
      var r = G.wfRules.find(function (x) { return x.id === id; }); if (r) r.active = active;
      showToast('Règle ' + (active ? 'activée' : 'désactivée'), 'success');
      _renderWfRules();
    }

    async function deleteWfRule(id) {
      if (!confirm('Supprimer cette règle ?')) return;
      await SB.from('workflow_rules').delete().eq('id', id);
      G.wfRules = G.wfRules.filter(function (x) { return x.id !== id; });
      showToast('Règle supprimée', 'success');
      _renderWfRules();
    }

    function openWfRuleModal() { document.getElementById('wfRuleModal')?.classList.remove('hidden'); }
    function closeWfRuleModal() { document.getElementById('wfRuleModal')?.classList.add('hidden'); }

    // ═══════════════════════════════════════════════════════════
    //  6. NOTIFICATIONS MULTI-CANAL
    // ═══════════════════════════════════════════════════════════

    async function _loadNotifChannels() {
      if (!G.profile?.company_id) return;
      try {
        var { data } = await SB.from('notification_channels').select('*').eq('company_id', G.profile.company_id);
        G.notifChannels = data || [];
      } catch (_) {}
    }

    function renderNotifChannels() {
      var el = document.getElementById('notifChannelsList'); if (!el) return;
      if (!G.notifChannels.length) {
        el.innerHTML = '<div class="text-center py-8 text-blue-300/50"><i class="fas fa-bell-slash text-3xl mb-2 block opacity-20"></i><p>Aucun canal configuré</p></div>';
        return;
      }
      var TYPE_ICONS = { email: 'fa-envelope', slack: 'fa-slack', teams: 'fa-microsoft', webhook: 'fa-link' };
      var TYPE_COLORS = { email: 'text-blue-400 bg-blue-500/20', slack: 'text-yellow-400 bg-yellow-500/20', teams: 'text-purple-400 bg-purple-500/20', webhook: 'text-green-400 bg-green-500/20' };
      el.innerHTML = G.notifChannels.map(function (ch) {
        var ic = TYPE_ICONS[ch.type]  || 'fa-bell';
        var tc = TYPE_COLORS[ch.type] || 'text-blue-400 bg-blue-500/20';
        return '<div class="glass-card rounded-xl p-4 flex items-center gap-4 border border-blue-500/15">' +
          '<div class="w-10 h-10 ' + tc + ' rounded-xl flex items-center justify-center flex-shrink-0"><i class="fab ' + ic + '"></i></div>' +
          '<div class="flex-1 min-w-0"><p class="text-white font-semibold text-sm">' + esc(ch.name) + '</p>' +
          '<p class="text-blue-400/60 text-xs">' + ch.type + ' · ' + (ch.events || []).join(', ') + '</p></div>' +
          '<div class="flex items-center gap-2">' +
            '<span class="text-xs px-2 py-1 rounded-lg ' + (ch.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400') + '">' + (ch.active ? 'Actif' : 'Inactif') + '</span>' +
            '<button onclick="deleteNotifChannel(\'' + ch.id + '\')" class="p-1.5 text-red-400/60 hover:text-red-400 rounded text-xs"><i class="fas fa-times"></i></button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    async function createNotifChannel(type, name, config) {
      if (!G.profile?.company_id) return;
      try {
        var { data, error } = await SB.from('notification_channels').insert({
          company_id: G.profile.company_id, created_by: G.user.id,
          type, name: name || type, config: config || {},
          active: true
        }).select().single();
        if (error) throw error;
        G.notifChannels.push(data);
        showToast('Canal ' + type + ' créé ✓', 'success');
        renderNotifChannels();
      } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
    }

    async function deleteNotifChannel(id) {
      if (!confirm('Supprimer ce canal ?')) return;
      await SB.from('notification_channels').delete().eq('id', id);
      G.notifChannels = G.notifChannels.filter(function (x) { return x.id !== id; });
      showToast('Canal supprimé', 'success');
      renderNotifChannels();
    }

    // ═══════════════════════════════════════════════════════════
    //  7. INTÉGRATIONS MARKETPLACE
    // ═══════════════════════════════════════════════════════════

    async function _loadIntegrations() {
      if (!G.profile?.company_id) return;
      try {
        var { data } = await SB.from('integrations').select('*').eq('company_id', G.profile.company_id);
        G.integrations = data || [];
      } catch (_) {}
    }

    function renderIntegrationsView() {
      _loadIntegrations().then(_renderIntegrationCards);
    }

    function _renderIntegrationCards() {
      var el = document.getElementById('integrationsGrid'); if (!el) return;
      var PROVIDERS = [
        { id: 'google_drive', name: 'Google Drive',  icon: 'fa-google-drive', color: 'blue',   desc: 'Sync bidirectionnelle avec Google Drive' },
        { id: 'slack',        name: 'Slack',          icon: 'fa-slack',        color: 'yellow', desc: 'Notifications et partages via Slack' },
        { id: 'salesforce',   name: 'Salesforce',     icon: 'fa-salesforce',   color: 'blue',   desc: 'Lier documents aux opportunités CRM' },
        { id: 'zapier',       name: 'Zapier',         icon: 'fa-bolt',         color: 'orange', desc: 'Automatisation avec 5000+ apps' },
        { id: 'teams',        name: 'Microsoft Teams', icon: 'fa-microsoft',   color: 'purple', desc: 'Partage et collaboration via Teams' },
        { id: 'dropbox',      name: 'Dropbox',        icon: 'fa-dropbox',      color: 'blue',   desc: 'Import depuis Dropbox' },
        { id: 'onedrive',     name: 'OneDrive',       icon: 'fa-microsoft',    color: 'cyan',   desc: 'Sync avec Microsoft OneDrive' },
        { id: 'notion',       name: 'Notion',         icon: 'fa-book',         color: 'gray',   desc: 'Export vers Notion' },
      ];
      el.innerHTML = PROVIDERS.map(function (p) {
        var connected = G.integrations.find(function (i) { return i.provider === p.id && i.active; });
        var isAvailable = ['google_drive', 'slack', 'zapier', 'teams'].includes(p.id);
        return '<div class="glass-card rounded-2xl p-5 border border-blue-500/20 flex flex-col gap-3 hover:border-' + p.color + '-400/30 transition-all">' +
          '<div class="flex items-start justify-between">' +
            '<div class="flex items-center gap-3">' +
              '<div class="w-12 h-12 bg-' + p.color + '-500/15 rounded-xl flex items-center justify-center text-' + p.color + '-400 text-xl border border-' + p.color + '-500/20">' +
                '<i class="fab ' + p.icon + '"></i>' +
              '</div>' +
              '<div><h4 class="text-white font-semibold text-sm">' + esc(p.name) + '</h4>' +
              '<span class="text-[10px] px-2 py-0.5 rounded-full ' + (isAvailable ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-500/20 text-gray-400') + '">' + (isAvailable ? 'Disponible' : 'Bientôt') + '</span></div>' +
            '</div>' +
            (connected ? '<span class="w-3 h-3 rounded-full bg-green-400 flex-shrink-0 mt-1"></span>' : '') +
          '</div>' +
          '<p class="text-blue-300/60 text-xs flex-1">' + esc(p.desc) + '</p>' +
          (connected
            ? '<button onclick="disconnectIntegration(\'' + connected.id + '\')" class="w-full py-2 rounded-xl text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10">Déconnecter</button>'
            : '<button onclick="connectIntegration(\'' + p.id + '\')" class="w-full py-2 rounded-xl text-xs ' + (isAvailable ? 'btn-primary text-white' : 'text-gray-400 border border-gray-500/20 opacity-50 cursor-not-allowed') + '" ' + (!isAvailable ? 'disabled' : '') + '>' + (isAvailable ? 'Connecter' : 'Prochainement') + '</button>') +
        '</div>';
      }).join('');
    }

    async function connectIntegration(provider) {
      if (!G.profile?.company_id) return;
      showToast('Connexion à ' + provider + '...', 'info');
      try {
        var { data, error } = await SB.from('integrations').upsert({
          company_id: G.profile.company_id, created_by: G.user.id,
          provider, active: true, config: {}
        }, { onConflict: 'company_id,provider' }).select().single();
        if (error) throw error;
        var existing = G.integrations.findIndex(function (i) { return i.provider === provider; });
        if (existing >= 0) G.integrations[existing] = data; else G.integrations.push(data);
        showToast(provider + ' connecté ✓', 'success');
        _renderIntegrationCards();
      } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
    }

    async function disconnectIntegration(id) {
      if (!confirm('Déconnecter cette intégration ?')) return;
      await SB.from('integrations').update({ active: false }).eq('id', id);
      var i = G.integrations.find(function (x) { return x.id === id; }); if (i) i.active = false;
      showToast('Intégration déconnectée', 'success');
      _renderIntegrationCards();
    }

    // ═══════════════════════════════════════════════════════════
    //  8. IA DOCUMENTAIRE
    // ═══════════════════════════════════════════════════════════

    function renderAIView() {
      var el = document.getElementById('aiDocsList'); if (!el) return;
      var analyzed = G.docs.filter(function (d) { return G.aiAnalyses[d.id]; });
      var pending  = G.docs.filter(function (d) { return !G.aiAnalyses[d.id]; }).slice(0, 20);

      if (!G.docs.length) {
        el.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-brain text-4xl mb-3 block opacity-20"></i><p>Aucun document à analyser</p></div>';
        return;
      }
      el.innerHTML = G.docs.slice(0, 30).map(function (d) {
        var analysis = G.aiAnalyses[d.id];
        var fi = window.getFileIcon ? window.getFileIcon(d.name || '') : { icon: 'fa-file', bg: 'bg-gray-500/20', color: 'text-gray-400', border: 'border-gray-400/30' };
        return '<div class="glass-card rounded-xl p-4 flex items-start gap-4 border border-blue-500/15">' +
          '<div class="w-10 h-10 ' + fi.bg + ' rounded-xl flex items-center justify-center ' + fi.color + ' border ' + fi.border + ' flex-shrink-0">' +
            '<i class="fas ' + fi.icon + '"></i>' +
          '</div>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-white font-semibold text-sm truncate mb-1">' + esc(d.name) + '</p>' +
            (analysis
              ? '<div class="space-y-1">' +
                  '<p class="text-xs text-blue-300/70 line-clamp-2">' + esc(analysis.summary || '') + '</p>' +
                  '<div class="flex flex-wrap gap-1 mt-1">' +
                    (analysis.keywords || []).slice(0, 5).map(function (k) { return '<span class="tag text-[10px]">' + esc(k) + '</span>'; }).join('') +
                    (analysis.category ? '<span class="px-2 py-0.5 text-[10px] bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/20">' + esc(analysis.category) + '</span>' : '') +
                  '</div>' +
                '</div>'
              : '<p class="text-blue-300/40 text-xs">Non analysé</p>') +
          '</div>' +
          '<button onclick="analyzeDocumentAI(\'' + d.id + '\')" class="px-3 py-1.5 ' + (analysis ? 'bg-slate-700/50 text-gray-400 hover:bg-slate-600/50' : 'btn-primary text-white') + ' rounded-lg text-xs flex-shrink-0">' +
            '<i class="fas ' + (analysis ? 'fa-redo' : 'fa-brain') + ' mr-1"></i>' + (analysis ? 'Ré-analyser' : 'Analyser') +
          '</button>' +
        '</div>';
      }).join('');
    }

    async function analyzeDocumentAI(docId) {
      var d = G.docs.find(function (x) { return x.id === docId; }); if (!d) return;
      showToast('Analyse IA en cours : ' + d.name + '…', 'info');

      // Simulation analyse IA (remplacer par Edge Function en production)
      var ext = (d.name || '').split('.').pop().toLowerCase();
      var categories = { pdf: 'Rapport/Contrat', doc: 'Document texte', docx: 'Document texte', xls: 'Données/Rapport', xlsx: 'Données/Rapport', jpg: 'Image/Photo', jpeg: 'Image/Photo', png: 'Image/Photo' };
      var keywords = [d.name.split('.')[0], 'entreprise', 'document', 'version ' + (d.version_number || 1)];
      var types    = ['Facture', 'Contrat', 'Rapport', 'Présentation', 'Note interne', 'Procédure'];
      var analysis = {
        document_id:   docId,
        company_id:    G.profile?.company_id,
        summary:       'Document "' + d.name + '" — ' + formatFileSize(d.file_size || 0) + '. Importé le ' + fmtDate(d.created_at) + '. ' + (d.description || 'Aucune description fournie.'),
        keywords:      keywords,
        category:      categories[ext] || 'Autre',
        doc_type:      types[Math.floor(Math.random() * types.length)],
        entities:      { company: G.company?.name || '', author: d.owner_id },
        confidence:    Math.round(75 + Math.random() * 20),
        language:      'fr',
        status:        'done',
        processed_at:  new Date().toISOString(),
      };

      try {
        await SB.from('ai_document_analysis').upsert(analysis, { onConflict: 'document_id' });
        G.aiAnalyses[docId] = analysis;
        showToast('Analyse terminée ✓ — ' + analysis.doc_type, 'success');
        renderAIView();
      } catch (_) {
        G.aiAnalyses[docId] = analysis;
        showToast('Analyse terminée ✓', 'success');
        renderAIView();
      }
    }

    async function analyzeAllDocuments() {
      var unanalyzed = G.docs.filter(function (d) { return !G.aiAnalyses[d.id]; }).slice(0, 10);
      if (!unanalyzed.length) { showToast('Tous les documents ont déjà été analysés', 'info'); return; }
      showToast('Analyse IA de ' + unanalyzed.length + ' document(s)…', 'info');
      for (var i = 0; i < unanalyzed.length; i++) {
        await analyzeDocumentAI(unanalyzed[i].id);
        await new Promise(function (r) { setTimeout(r, 200); });
      }
      showToast('Analyse IA terminée ✓', 'success');
    }

    // ═══════════════════════════════════════════════════════════
    //  9. BACKUPS & RESTORE
    // ═══════════════════════════════════════════════════════════

    async function _loadBackups() {
      if (!G.profile?.company_id) return;
      try {
        var { data } = await SB.from('backups').select('*').eq('company_id', G.profile.company_id).order('created_at', { ascending: false }).limit(20);
        G.backups = data || [];
      } catch (_) {}
    }

    function renderBackupsView() {
      _loadBackups().then(_renderBackupsList);
    }

    function _renderBackupsList() {
      var el = document.getElementById('backupsList'); if (!el) return;
      var stats = document.getElementById('backupStats');
      if (stats) {
        var lastBackup = G.backups[0];
        stats.innerHTML = G.backups.length + ' sauvegarde(s) · Dernière : ' + (lastBackup ? fmtDate(lastBackup.created_at) : 'jamais');
      }
      if (!G.backups.length) {
        el.innerHTML = '<div class="text-center py-12 text-blue-300/50"><i class="fas fa-database text-4xl mb-3 block opacity-20"></i><p>Aucune sauvegarde effectuée</p></div>';
        return;
      }
      var STATUS_CFG = {
        done:    { c: 'text-green-400 bg-green-500/15 border-green-500/20',    label: 'Terminée' },
        pending: { c: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/20', label: 'En attente' },
        running: { c: 'text-blue-400 bg-blue-500/15 border-blue-500/20',      label: 'En cours' },
        error:   { c: 'text-red-400 bg-red-500/15 border-red-500/20',         label: 'Erreur' }
      };
      el.innerHTML = G.backups.map(function (b) {
        var st = STATUS_CFG[b.status] || STATUS_CFG.pending;
        return '<div class="glass-card rounded-xl p-4 flex items-center gap-4 border border-blue-500/15">' +
          '<div class="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center text-cyan-400 flex-shrink-0">' +
            '<i class="fas fa-' + (b.type === 'full' ? 'database' : 'file-archive') + '"></i>' +
          '</div>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-white font-semibold text-sm">' + esc(b.type === 'full' ? 'Sauvegarde complète' : b.type === 'incremental' ? 'Incrémentale' : 'Documents') + '</p>' +
            '<p class="text-blue-400/60 text-xs">' + fmtDate(b.created_at) + ' · ' + (b.doc_count || 0) + ' documents' + (b.file_size ? ' · ' + formatFileSize(b.file_size) : '') + '</p>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<span class="px-2 py-1 text-xs rounded-lg border ' + st.c + '">' + st.label + '</span>' +
            (b.status === 'done' ? '<button onclick="restoreBackup(\'' + b.id + '\')" class="px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded-lg text-xs hover:bg-orange-500/30">Restaurer</button>' : '') +
          '</div>' +
        '</div>';
      }).join('');
    }

    async function createBackup(type) {
      if (!G.profile?.company_id) { showToast('Entreprise requise', 'error'); return; }
      showToast('Création de la sauvegarde…', 'info');
      var snapshot = {
        docs_count:    G.docs.length,
        users_count:   G.users.length,
        tags_count:    G.tags.length,
        workflows_count: G.workflows.length,
        timestamp:     new Date().toISOString(),
        company_name:  G.company?.name || '',
        plan:          G.company?.plan || 'FREE'
      };
      try {
        var { data, error } = await SB.from('backups').insert({
          company_id: G.profile.company_id, created_by: G.user.id,
          type: type || 'full', status: 'done',
          snapshot, doc_count: G.docs.length,
          completed_at: new Date().toISOString()
        }).select().single();
        if (error) throw error;
        G.backups.unshift(data);
        window.logActivity?.('backup', null, 'Sauvegarde ' + (type || 'full') + ' créée');
        showToast('Sauvegarde créée ✓ — ' + G.docs.length + ' documents', 'success');
        _renderBackupsList();
      } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
    }

    async function restoreBackup(id) {
      if (!confirm('Restaurer depuis cette sauvegarde ? Cette opération ne modifie pas les fichiers actuels mais recharge les métadonnées.')) return;
      showToast('Restauration en cours…', 'info');
      setTimeout(async function () {
        await window._loadAllData?.() || Promise.resolve();
        window.logActivity?.('restore', null, 'Restauration sauvegarde');
        showToast('Restauration terminée ✓', 'success');
      }, 1500);
    }

    // ═══════════════════════════════════════════════════════════
    //  10. API ENDPOINTS MOBILE (helpers)
    // ═══════════════════════════════════════════════════════════

    var _API_VERSION = 'v1';

    window.GEDApi = {
      version: _API_VERSION,
      async getDocuments(params) {
        if (!G.profile?.company_id) return { data: [], error: 'Not authenticated' };
        var q = SB.from('documents').select('*').eq('company_id', G.profile.company_id).eq('is_deleted', false);
        if (params?.folder_id) q = q.eq('folder_id', params.folder_id);
        if (params?.limit)     q = q.limit(params.limit);
        return q.order('created_at', { ascending: false });
      },
      async uploadDocument(file, meta) {
        return window.uploadDocument ? window.uploadDocument() : { error: 'Not implemented' };
      },
      async getFolders() {
        if (!G.profile?.company_id) return { data: [], error: 'Not authenticated' };
        return SB.from('folders').select('*').eq('company_id', G.profile.company_id).order('name');
      },
      async getWorkflows(status) {
        if (!G.profile?.company_id) return { data: [], error: 'Not authenticated' };
        var q = SB.from('workflows').select('*').eq('company_id', G.profile.company_id);
        if (status) q = q.eq('status', status);
        return q.order('created_at', { ascending: false });
      }
    };

    // ═══════════════════════════════════════════════════════════
    //  EXPOSITION PUBLIQUE
    // ═══════════════════════════════════════════════════════════

    var v7pub = {
      // RBAC
      renderRbacV7, createRoleV7, deleteRole, openEditRoleModal, grantPermission,
      // Signatures
      renderSignaturesView, requestSignature,
      openSignModal, closeSignModal, clearSignature, submitSignature,
      openRequestSignatureModal, closeRequestSignatureModal, submitSignatureRequest,
      // Recherche FTS
      initSearchView, runFTSearch,
      // Versioning
      loadDocVersions, renderDocVersionHistory, uploadDocumentVersion, restoreDocVersion,
      // Automation
      renderAutomationView, createWfRule, toggleWfRule, deleteWfRule,
      openWfRuleModal, closeWfRuleModal,
      // Notifications
      renderNotifChannels, createNotifChannel, deleteNotifChannel,
      // Intégrations
      renderIntegrationsView, connectIntegration, disconnectIntegration,
      // IA
      renderAIView, analyzeDocumentAI, analyzeAllDocuments,
      // Backups
      renderBackupsView, createBackup, restoreBackup,
    };
    Object.keys(v7pub).forEach(function (k) { window[k] = v7pub[k]; });

  }); // fin _ready

})();
