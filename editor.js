// ============================================
// SystemesGED v7.2 — MODULE : editor.js
// Responsabilités : édition en temps réel de documents Word/Excel
//   - Ouverture d'un éditeur embarqué (docx via mammoth + quill, xlsx via SheetJS)
//   - Sauvegarde automatique dans Supabase Storage + table documents
//   - Collaboration temps réel via Supabase Realtime (présence + broadcast)
//   - Contrôle scope (entreprise / personnel)
//   - Invitation de collaborateurs (membres de la même entreprise)
// ============================================
// Dépendances : auth.js (G, CONFIG), ui.js (showToast, formatBytes, formatDate, escapeHtml, addAuditLog, generateId)

'use strict';

// ─── État interne du module ──────────────────────────────────────────────────
const _editor = {
  docId: null,
  type: null,               // 'word' | 'excel'
  quill: null,
  workbook: null,
  activeSheet: 0,
  channel: null,
  saveTimer: null,
  saving: false,
  collaborators: {},
  myColor: null,
  isDirty: false,
  originalArrayBuffer: null
};

const SAVE_DEBOUNCE_MS = 2000;
const CURSOR_COLORS = [
  '#f97316','#8b5cf6','#10b981','#ef4444','#06b6d4',
  '#ec4899','#84cc16','#f59e0b','#6366f1','#14b8a6'
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. POINT D'ENTRÉE
// ─────────────────────────────────────────────────────────────────────────────

async function openDocumentEditor(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) { showToast('Document introuvable', 'error'); return; }

  const ext = (doc.name || '').split('.').pop().toLowerCase();
  const isWord  = ['doc', 'docx'].includes(ext);
  const isExcel = ['xls', 'xlsx'].includes(ext);

  if (!isWord && !isExcel) {
    showToast("L'édition n'est disponible que pour les fichiers Word (.docx) et Excel (.xlsx)", 'warning');
    return;
  }

  const isOwner        = doc.owner_id === G.currentUser.id;
  const isAdmin        = G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
  const isManager      = G.currentUser?.role === 'manager' || isAdmin;
  const isCollaborator = (G.shares || []).some(
    s => s.document_id === docId &&
         s.recipient_id === G.currentUser.id &&
         s.status === 'active' &&
         ['edit','write'].includes(s.permission)
  );

  if (!isOwner && !isAdmin && !isManager && !isCollaborator) {
    showToast("Vous n'avez pas la permission de modifier ce document", 'error');
    return;
  }

  _editor.docId   = docId;
  _editor.type    = isWord ? 'word' : 'excel';
  _editor.myColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
  _editor.isDirty = false;

  _buildEditorModal(doc);
  await _loadLibraries(_editor.type);
  await _loadDocumentContent(doc);
  _setupRealtimeChannel(docId);
  _setupAutoSave();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MODALE ÉDITEUR
// ─────────────────────────────────────────────────────────────────────────────

function _buildEditorModal(doc) {
  let modal = document.getElementById('documentEditorModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'documentEditorModal';
    document.body.appendChild(modal);
  }

  const ext    = (doc.name || '').split('.').pop().toLowerCase();
  const isWord = ['doc','docx'].includes(ext);

  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.85);
    display:flex;align-items:center;justify-content:center;
    z-index:9999;`;

  modal.innerHTML = `
  <div id="editorBox" style="
    width:96vw;max-width:1200px;height:92vh;
    background:rgba(8,15,40,0.97);
    border:1px solid rgba(96,165,250,0.25);border-radius:20px;
    display:flex;flex-direction:column;overflow:hidden;
    box-shadow:0 40px 80px rgba(0,0,0,0.7);position:relative;">

    <!-- Barre de titre -->
    <div style="display:flex;align-items:center;justify-content:space-between;
                padding:14px 20px;border-bottom:1px solid rgba(96,165,250,0.15);
                background:rgba(15,23,42,0.8);flex-shrink:0;gap:12px;flex-wrap:wrap;">

      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:38px;height:38px;border-radius:10px;flex-shrink:0;
                    background:${isWord ? 'rgba(37,99,235,0.25)' : 'rgba(16,185,129,0.25)'};
                    display:flex;align-items:center;justify-content:center;
                    font-size:18px;color:${isWord ? '#60a5fa' : '#34d399'};">
          <i class="fas ${isWord ? 'fa-file-word' : 'fa-file-excel'}"></i>
        </div>
        <div>
          <p style="color:white;font-weight:600;font-size:15px;margin:0;">${escapeHtml(doc.name)}</p>
          <p style="color:rgba(148,163,184,0.6);font-size:11px;margin:0;">
            ${isWord ? 'Éditeur Word' : 'Éditeur Excel'} &middot; v${doc.version || 1}
            &middot; <span id="editorScopeDisplay" style="color:${doc.scope === 'company' ? '#60a5fa' : '#a78bfa'};">
              <i class="fas ${doc.scope === 'company' ? 'fa-building' : 'fa-user'} mr-1"></i>${doc.scope === 'company' ? 'Entreprise' : 'Personnel'}
            </span>
          </p>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <div id="editorCollabAvatars" style="display:flex;align-items:center;gap:4px;"></div>

        <div id="editorSaveIndicator" style="display:flex;align-items:center;gap:6px;
              font-size:12px;color:rgba(148,163,184,0.5);padding:6px 12px;
              border-radius:8px;background:rgba(255,255,255,0.03);">
          <i class="fas fa-check-circle" style="color:#10b981;"></i>
          <span id="editorSaveText">Sauvegardé</span>
        </div>

        <button onclick="editorToggleScope()" id="editorScopeBtn"
          style="padding:7px 14px;border-radius:10px;font-size:12px;font-weight:500;
                 border:1px solid rgba(96,165,250,0.3);background:rgba(37,99,235,0.15);
                 color:#93c5fd;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <i id="editorScopeIcon" class="fas ${doc.scope === 'company' ? 'fa-building' : 'fa-user'}"></i>
          <span id="editorScopeLabel">${doc.scope === 'company' ? 'Entreprise' : 'Personnel'}</span>
        </button>

        <button onclick="editorOpenInvitePanel()"
          style="padding:7px 14px;border-radius:10px;font-size:12px;font-weight:500;
                 border:1px solid rgba(16,185,129,0.3);background:rgba(16,185,129,0.15);
                 color:#34d399;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <i class="fas fa-user-plus"></i>Inviter
        </button>

        <button onclick="editorSaveNow()"
          style="padding:7px 14px;border-radius:10px;font-size:12px;font-weight:600;
                 background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;
                 cursor:pointer;display:flex;align-items:center;gap:6px;border:none;
                 box-shadow:0 4px 12px rgba(37,99,235,0.4);">
          <i class="fas fa-save"></i>Enregistrer
        </button>

        <button onclick="closeDocumentEditor()"
          style="padding:8px 10px;border-radius:10px;color:rgba(148,163,184,0.7);
                 background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);
                 cursor:pointer;" title="Fermer">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>

    <!-- Barre d'outils Word -->
    ${isWord ? `
    <div id="editorToolbar" style="
      padding:8px 16px;border-bottom:1px solid rgba(96,165,250,0.1);
      background:rgba(15,23,42,0.5);flex-shrink:0;
      display:flex;align-items:center;gap:2px;flex-wrap:wrap;">
      <button class="ql-bold" title="Gras"></button>
      <button class="ql-italic" title="Italique"></button>
      <button class="ql-underline" title="Souligné"></button>
      <button class="ql-strike" title="Barré"></button>
      <span class="ql-formats">
        <select class="ql-header">
          <option selected></option>
          <option value="1">Titre 1</option>
          <option value="2">Titre 2</option>
          <option value="3">Titre 3</option>
        </select>
      </span>
      <button class="ql-list" value="ordered"></button>
      <button class="ql-list" value="bullet"></button>
      <button class="ql-indent" value="-1"></button>
      <button class="ql-indent" value="+1"></button>
      <span class="ql-formats">
        <select class="ql-align"></select>
      </span>
      <span class="ql-formats">
        <select class="ql-color"></select>
        <select class="ql-background"></select>
      </span>
      <button class="ql-link"></button>
      <button class="ql-image"></button>
      <button class="ql-clean"></button>
    </div>` : ''}

    <!-- Onglets Excel -->
    ${!isWord ? `
    <div id="excelSheetTabs" style="
      display:flex;align-items:flex-end;gap:2px;padding:8px 16px 0;
      border-bottom:1px solid rgba(96,165,250,0.1);
      background:rgba(15,23,42,0.4);flex-shrink:0;overflow-x:auto;min-height:38px;">
    </div>` : ''}

    <!-- Zone contenu -->
    <div style="flex:1;overflow:hidden;position:relative;">

      <!-- Overlay de chargement -->
      <div id="editorLoadingOverlay" style="
        position:absolute;inset:0;background:rgba(8,15,40,0.95);
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        z-index:20;gap:14px;">
        <div style="width:44px;height:44px;border:3px solid rgba(96,165,250,0.15);
                    border-top-color:#3b82f6;border-radius:50%;
                    animation:editorSpin 0.8s linear infinite;"></div>
        <p style="color:rgba(148,163,184,0.7);font-size:13px;" id="editorLoadingText">
          Chargement du document…
        </p>
      </div>

      <!-- Quill (Word) -->
      ${isWord ? '<div id="quillEditor" style="height:100%;"></div>' : ''}

      <!-- Excel -->
      ${!isWord ? `
      <div id="excelEditor" style="height:100%;overflow:auto;background:rgba(8,15,40,0.5);">
        <div id="excelTableWrapper"></div>
      </div>` : ''}
    </div>

    <!-- Panneau d'invitation -->
    <div id="editorInvitePanel" style="
      display:none;position:absolute;top:64px;right:16px;width:320px;
      background:rgba(12,20,56,0.98);border:1px solid rgba(96,165,250,0.3);
      border-radius:16px;padding:20px;z-index:100;
      box-shadow:0 24px 48px rgba(0,0,0,0.7);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <h4 style="color:white;font-size:14px;font-weight:600;margin:0;">
          <i class="fas fa-users mr-2" style="color:#34d399;"></i>Collaborer en temps réel
        </h4>
        <button onclick="editorCloseInvitePanel()"
          style="color:rgba(148,163,184,0.6);background:none;border:none;cursor:pointer;font-size:16px;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <p style="color:rgba(148,163,184,0.45);font-size:11px;margin:0 0 12px;line-height:1.5;">
        Seuls les membres de votre entreprise peuvent être invités.<br>
        Les modifications sont synchronisées en temps réel.
      </p>
      <input id="editorInviteEmail" type="email" placeholder="Email du collaborateur"
        style="width:100%;padding:10px 12px;background:rgba(8,15,40,0.8);
               border:1px solid rgba(96,165,250,0.25);border-radius:10px;
               color:white;font-size:13px;outline:none;box-sizing:border-box;margin-bottom:8px;">
      <select id="editorInvitePermission"
        style="width:100%;padding:10px 12px;background:rgba(8,15,40,0.8);
               border:1px solid rgba(96,165,250,0.25);border-radius:10px;
               color:white;font-size:13px;outline:none;margin-bottom:12px;box-sizing:border-box;">
        <option value="edit">Peut modifier</option>
        <option value="view">Peut consulter uniquement</option>
      </select>
      <button onclick="editorSendInvite()"
        style="width:100%;padding:10px;background:linear-gradient(135deg,#2563eb,#1d4ed8);
               color:white;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;">
        <i class="fas fa-paper-plane mr-2"></i>Envoyer l'invitation
      </button>
      <div id="editorCollabList" style="margin-top:16px;"></div>
    </div>

  </div>

  <style>
    @keyframes editorSpin { to { transform:rotate(360deg); } }
    #quillEditor .ql-toolbar { background:rgba(15,23,42,0.9) !important; border:none !important; }
    #quillEditor .ql-toolbar .ql-stroke { stroke:#94a3b8 !important; }
    #quillEditor .ql-toolbar .ql-fill { fill:#94a3b8 !important; }
    #quillEditor .ql-toolbar button:hover .ql-stroke { stroke:#60a5fa !important; }
    #quillEditor .ql-toolbar button.ql-active .ql-stroke { stroke:#3b82f6 !important; }
    #quillEditor .ql-toolbar select { color:#94a3b8 !important; }
    #quillEditor .ql-container { border:none !important; background:#ffffff; height:calc(100% - 42px); }
    #quillEditor .ql-editor { padding:40px 64px; font-size:14px; line-height:1.8; min-height:100%; font-family:Georgia,serif; }
    #quillEditor .ql-editor.ql-blank::before { color:#94a3b8; font-style:italic; }
    .excel-cell { min-width:90px; height:26px; padding:2px 6px; border:1px solid rgba(96,165,250,0.12);
      font-size:12px; color:rgba(226,232,240,0.9); background:transparent; outline:none;
      font-family:'Courier New',monospace; box-sizing:border-box; transition:all 0.15s; }
    .excel-cell:focus { background:rgba(37,99,235,0.12); border-color:#3b82f6;
      color:white; z-index:1; position:relative; box-shadow:0 0 0 2px rgba(59,130,246,0.3); }
    .excel-header-cell { background:rgba(15,23,42,0.9); color:rgba(148,163,184,0.6);
      font-size:11px; font-weight:700; text-align:center; padding:5px 6px;
      border:1px solid rgba(96,165,250,0.18); min-width:90px; user-select:none; }
    .excel-row-header { background:rgba(15,23,42,0.9); color:rgba(148,163,184,0.5);
      font-size:11px; font-weight:600; text-align:center; padding:4px 8px;
      border:1px solid rgba(96,165,250,0.18); min-width:40px; user-select:none; }
    .excel-sheet-tab { padding:5px 16px; font-size:12px; border-radius:6px 6px 0 0;
      cursor:pointer; border:1px solid transparent; border-bottom:none; transition:all 0.2s; white-space:nowrap; }
    .excel-sheet-tab.active { background:rgba(37,99,235,0.2); border-color:rgba(96,165,250,0.3); color:#93c5fd; }
    .excel-sheet-tab:not(.active) { color:rgba(148,163,184,0.5); }
    .excel-sheet-tab:not(.active):hover { color:rgba(148,163,184,0.8); background:rgba(255,255,255,0.04); }
  </style>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CHARGEMENT DES LIBRAIRIES DYNAMIQUES
// ─────────────────────────────────────────────────────────────────────────────

function _loadLibraries(type) {
  return new Promise(resolve => {
    const libs = type === 'word'
      ? [
          { tag:'link',   href:'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css' },
          { tag:'script', src:'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js',               check:'Quill'   },
          { tag:'script', src:'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js', check:'mammoth' }
        ]
      : [
          { tag:'script', src:'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js', check:'XLSX' }
        ];

    const scripts = libs.filter(l => l.tag === 'script');
    if (scripts.length === 0) { resolve(); return; }

    // Injecter les CSS
    libs.filter(l => l.tag === 'link').forEach(l => {
      if (!document.querySelector(`link[href="${l.href}"]`)) {
        const el = document.createElement('link');
        el.rel = 'stylesheet'; el.href = l.href;
        document.head.appendChild(el);
      }
    });

    let done = 0;
    scripts.forEach(l => {
      if (l.check && window[l.check]) { done++; if (done >= scripts.length) resolve(); return; }
      const el = document.createElement('script');
      el.src = l.src;
      el.onload = el.onerror = () => { done++; if (done >= scripts.length) resolve(); };
      document.head.appendChild(el);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CHARGEMENT DU CONTENU
// ─────────────────────────────────────────────────────────────────────────────

async function _loadDocumentContent(doc) {
  _setLoadingText('Téléchargement depuis Supabase Storage…');
  try {
    const { data: blob, error } = await G.supabase.storage
      .from(CONFIG.storageBucket)
      .download(doc.storage_path);
    if (error) throw error;

    const arrayBuffer = await blob.arrayBuffer();
    _editor.originalArrayBuffer = arrayBuffer;

    if (_editor.type === 'word') {
      await _initWordEditor(arrayBuffer, doc);
    } else {
      _initExcelEditor(arrayBuffer);
    }
    _hideLoadingOverlay();
  } catch (err) {
    console.error('Erreur chargement document:', err);
    _setLoadingText('Erreur : ' + err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ÉDITEUR WORD (Quill + mammoth)
// ─────────────────────────────────────────────────────────────────────────────

async function _initWordEditor(arrayBuffer, doc) {
  _setLoadingText('Conversion du document Word en cours…');

  if (!window.Quill) { _setLoadingText('Éditeur non chargé. Vérifiez votre connexion.'); return; }

  // Initialiser Quill en premier (nécessaire pour clipboard)
  _editor.quill = new window.Quill('#quillEditor', {
    theme: 'snow',
    modules: {
      toolbar: '#editorToolbar',
      history: { delay: 500, maxStack: 200, userOnly: true }
    },
    placeholder: 'Commencez à rédiger…'
  });

  // Convertir .docx → HTML via mammoth, ou utiliser le content DB
  let html = '';
  if (window.mammoth) {
    try {
      _setLoadingText('Décompression du fichier Word…');
      const result = await window.mammoth.convertToHtml({ arrayBuffer });
      html = result.value || '';
    } catch (e) {
      console.warn('mammoth error:', e);
      // Fallback : charger depuis le champ content de la BD
      html = doc.content || '';
    }
  } else {
    html = doc.content || '';
  }

  if (html) {
    const delta = _editor.quill.clipboard.convert(html);
    _editor.quill.setContents(delta, 'silent');
  }

  // Écouter les modifications
  _editor.quill.on('text-change', (delta, oldDelta, source) => {
    if (source !== 'user') return;
    _markDirty();
    _broadcastCursorPosition();
  });

  _editor.quill.on('selection-change', range => {
    if (range) _broadcastCursorPosition();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ÉDITEUR EXCEL (SheetJS)
// ─────────────────────────────────────────────────────────────────────────────

function _initExcelEditor(arrayBuffer) {
  if (!window.XLSX) { _setLoadingText('SheetJS non chargé. Vérifiez votre connexion.'); return; }
  _editor.workbook = window.XLSX.read(arrayBuffer, { type: 'array', cellStyles: true });
  _renderExcelSheetTabs();
  _renderExcelSheet(_editor.activeSheet);
}

function _renderExcelSheetTabs() {
  const tabBar = document.getElementById('excelSheetTabs');
  if (!tabBar || !_editor.workbook) return;
  tabBar.innerHTML = _editor.workbook.SheetNames.map((name, idx) => `
    <div class="excel-sheet-tab ${idx === _editor.activeSheet ? 'active' : ''}"
         onclick="editorSwitchSheet(${idx})">
      <i class="fas fa-table" style="font-size:10px;margin-right:5px;"></i>${escapeHtml(name)}
    </div>
  `).join('');
}

function editorSwitchSheet(idx) {
  _saveCurrentExcelSheetToWorkbook();
  _editor.activeSheet = idx;
  _renderExcelSheetTabs();
  _renderExcelSheet(idx);
}

function _renderExcelSheet(sheetIdx) {
  if (!_editor.workbook || !window.XLSX) return;
  const sheetName = _editor.workbook.SheetNames[sheetIdx];
  const sheet     = _editor.workbook.Sheets[sheetName];
  const wrapper   = document.getElementById('excelTableWrapper');
  if (!wrapper) return;

  const range  = sheet && sheet['!ref'] ? window.XLSX.utils.decode_range(sheet['!ref']) : { s:{r:0,c:0}, e:{r:49,c:25} };
  const maxRow = Math.max(range.e.r, 49);
  const maxCol = Math.max(range.e.c, 25);

  let html = '<table style="border-collapse:collapse;"><thead><tr>';
  html += '<th class="excel-row-header"></th>';
  for (let c = 0; c <= maxCol; c++) html += `<th class="excel-header-cell">${_colName(c)}</th>`;
  html += '</tr></thead><tbody>';

  for (let r = 0; r <= maxRow; r++) {
    html += `<tr><td class="excel-row-header">${r + 1}</td>`;
    for (let c = 0; c <= maxCol; c++) {
      const addr = window.XLSX.utils.encode_cell({ r, c });
      const cell = sheet ? sheet[addr] : null;
      const val  = cell && cell.v !== undefined ? String(cell.v) : '';
      const safe = val.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      html += `<td><input class="excel-cell"
        data-row="${r}" data-col="${c}" data-sheet="${sheetIdx}"
        value="${safe}"
        oninput="_onExcelCellChange(this)"
        onfocus="_onExcelCellFocus(this)"></td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  wrapper.innerHTML = html;
}

function _colName(c) {
  let name = ''; c++;
  while (c > 0) { c--; name = String.fromCharCode(65 + (c % 26)) + name; c = Math.floor(c / 26); }
  return name;
}

function _onExcelCellChange(input) {
  _markDirty();
  if (_editor.channel) {
    _editor.channel.send({
      type: 'broadcast', event: 'cell_change',
      payload: {
        userId: G.currentUser.id,
        row: +input.dataset.row, col: +input.dataset.col,
        sheet: +input.dataset.sheet, value: input.value
      }
    });
  }
}

function _onExcelCellFocus(input) {
  if (_editor.channel) {
    _editor.channel.send({
      type: 'broadcast', event: 'cell_focus',
      payload: {
        userId: G.currentUser.id,
        userName: G.currentUser.name || G.currentUser.email,
        color: _editor.myColor,
        row: +input.dataset.row, col: +input.dataset.col
      }
    });
  }
}

function _saveCurrentExcelSheetToWorkbook() {
  if (!_editor.workbook || !window.XLSX) return;
  const sheetName = _editor.workbook.SheetNames[_editor.activeSheet];
  const inputs    = document.querySelectorAll('#excelTableWrapper .excel-cell');
  if (!inputs.length) return;
  const sheetData = {}; let maxR = 0, maxC = 0;
  inputs.forEach(inp => {
    const r = +inp.dataset.row, c = +inp.dataset.col;
    const v = inp.value;
    if (v !== '') {
      const addr = window.XLSX.utils.encode_cell({ r, c });
      const n    = parseFloat(v);
      sheetData[addr] = isNaN(n) ? { t:'s', v } : { t:'n', v: n };
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    }
  });
  sheetData['!ref'] = window.XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:maxR,c:maxC} });
  _editor.workbook.Sheets[sheetName] = sheetData;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SAUVEGARDE DANS SUPABASE
// ─────────────────────────────────────────────────────────────────────────────

function _setupAutoSave() {
  if (_editor.saveTimer) clearInterval(_editor.saveTimer);
  _editor.saveTimer = setInterval(() => {
    if (_editor.isDirty && !_editor.saving) _performSave();
  }, SAVE_DEBOUNCE_MS);
}

function _markDirty() {
  _editor.isDirty = true;
  _setSaveStatus('modified');
}

async function _performSave() {
  if (!_editor.docId || _editor.saving) return;
  _editor.saving = true;
  _setSaveStatus('saving');

  try {
    const doc = G.documents.find(d => d.id === _editor.docId);
    if (!doc) throw new Error('Document introuvable en mémoire');

    let fileBlob;
    if (_editor.type === 'word') {
      fileBlob = await _exportWordBlob(doc);
    } else {
      fileBlob = _exportExcelBlob();
    }
    if (!fileBlob) throw new Error('Export du fichier échoué');

    // Écraser le fichier dans Supabase Storage
    const contentType = _editor.type === 'word'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const { error: storageErr } = await G.supabase.storage
      .from(CONFIG.storageBucket)
      .upload(doc.storage_path, fileBlob, { contentType, upsert: true, cacheControl: '3600' });
    if (storageErr) throw storageErr;

    // Mettre à jour les métadonnées dans la table documents
    const { error: dbErr } = await G.supabase
      .from('documents')
      .update({ size: fileBlob.size, updated_at: new Date().toISOString() })
      .eq('id', _editor.docId);
    if (dbErr) throw dbErr;

    // Mise à jour locale
    doc.size       = fileBlob.size;
    doc.updated_at = new Date().toISOString();

    await addAuditLog('edit_save', 'document', _editor.docId,
      `Sauvegarde auto par ${G.currentUser.email}`);

    _editor.isDirty = false;
    _setSaveStatus('saved');

    // Notifier les collaborateurs
    if (_editor.channel) {
      _editor.channel.send({
        type: 'broadcast', event: 'doc_saved',
        payload: { userId: G.currentUser.id, userName: G.currentUser.name || G.currentUser.email }
      });
    }
  } catch (err) {
    console.error('Erreur sauvegarde:', err);
    _setSaveStatus('error');
    showToast('Erreur de sauvegarde : ' + err.message, 'error');
  } finally {
    _editor.saving = false;
  }
}

async function _exportWordBlob(doc) {
  if (!_editor.quill) return null;
  const html = _editor.quill.root.innerHTML;

  // Sauvegarder également le HTML dans le champ content (lecture rapide sans re-conversion)
  try {
    await G.supabase.from('documents')
      .update({ content: html })
      .eq('id', _editor.docId);
  } catch (e) { console.warn('content save:', e); }

  // Retourner le blob (HTML encodé dans un conteneur .docx MIME)
  // Note : pour une vraie génération .docx native, intégrer docx.js ou pizzip.
  // Cette implémentation garantit la compatibilité de lecture avec le champ content.
  return new Blob([new TextEncoder().encode(html)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function _exportExcelBlob() {
  if (!_editor.workbook || !window.XLSX) return null;
  _saveCurrentExcelSheetToWorkbook();
  const wbout = window.XLSX.write(_editor.workbook, { bookType:'xlsx', type:'array' });
  return new Blob([wbout], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. COLLABORATION TEMPS RÉEL (Supabase Realtime)
// ─────────────────────────────────────────────────────────────────────────────

function _setupRealtimeChannel(docId) {
  if (_editor.channel) {
    try { G.supabase.removeChannel(_editor.channel); } catch(e) {}
    _editor.channel = null;
  }
  if (!G.supabase?.channel) return;

  _editor.channel = G.supabase.channel(`ged_collab_${docId}`, {
    config: { presence: { key: G.currentUser.id } }
  });

  // Présence
  _editor.channel.on('presence', { event: 'sync' }, () => {
    _updateCollaboratorAvatars(_editor.channel.presenceState());
  });

  _editor.channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
    if (key !== G.currentUser.id) {
      const u = newPresences[0];
      showToast(`<i class="fas fa-user-circle mr-2" style="color:${u?.color||'#60a5fa'}"></i>${escapeHtml(u?.name||'Quelqu\'un')} a rejoint le document`, 'info');
    }
    _updateCollaboratorAvatars(_editor.channel.presenceState());
  });

  _editor.channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
    if (key !== G.currentUser.id) {
      const u = leftPresences[0];
      showToast(`${escapeHtml(u?.name||'Un collaborateur')} a quitté`, 'info');
    }
    _removeCollaboratorCursor(key);
    _updateCollaboratorAvatars(_editor.channel.presenceState());
  });

  // Broadcast — modification cellule Excel
  _editor.channel.on('broadcast', { event: 'cell_change' }, ({ payload }) => {
    if (payload.userId === G.currentUser.id) return;
    if (_editor.type !== 'excel' || payload.sheet !== _editor.activeSheet) return;
    const inp = document.querySelector(
      `.excel-cell[data-row="${payload.row}"][data-col="${payload.col}"]`);
    if (inp && document.activeElement !== inp) {
      inp.value = payload.value;
      inp.style.background = 'rgba(249,115,22,0.12)';
      setTimeout(() => { if(inp) inp.style.background = ''; }, 1500);
    }
  });

  // Broadcast — focus cellule Excel (curseur collaborateur)
  _editor.channel.on('broadcast', { event: 'cell_focus' }, ({ payload }) => {
    if (payload.userId === G.currentUser.id) return;
    document.querySelectorAll(`[data-collab-uid="${payload.userId}"]`).forEach(el => {
      el.style.outline = ''; delete el.dataset.collabUid;
    });
    const inp = document.querySelector(
      `.excel-cell[data-row="${payload.row}"][data-col="${payload.col}"]`);
    if (inp) {
      inp.style.outline = `2px solid ${payload.color}`;
      inp.dataset.collabUid = payload.userId;
    }
  });

  // Broadcast — position curseur Word
  _editor.channel.on('broadcast', { event: 'cursor_position' }, ({ payload }) => {
    if (payload.userId === G.currentUser.id || _editor.type !== 'word') return;
    _showTypingBadge(payload);
  });

  // Broadcast — document sauvegardé par un collaborateur
  _editor.channel.on('broadcast', { event: 'doc_saved' }, ({ payload }) => {
    if (payload.userId === G.currentUser.id) return;
    showToast(`<i class="fas fa-save mr-2" style="color:#34d399;"></i>${escapeHtml(payload.userName)} a sauvegardé le document`, 'success');
  });

  // Abonnement + présence
  _editor.channel.subscribe(async status => {
    if (status === 'SUBSCRIBED') {
      await _editor.channel.track({
        userId: G.currentUser.id,
        name:   G.currentUser.name || G.currentUser.email,
        color:  _editor.myColor,
        joinedAt: new Date().toISOString()
      });
    }
  });
}

function _updateCollaboratorAvatars(state) {
  const container = document.getElementById('editorCollabAvatars');
  if (!container) return;

  const all    = Object.values(state).flat();
  const others = all.filter(u => u.userId !== G.currentUser.id);

  if (others.length === 0) {
    container.innerHTML = `<span style="font-size:11px;color:rgba(148,163,184,0.35);">
      <i class="fas fa-user-circle mr-1"></i>Seul dans ce document</span>`;
    return;
  }

  container.innerHTML =
    others.map(u => `
      <div title="${escapeHtml(u.name||'')}" style="
        width:28px;height:28px;border-radius:50%;
        background:${u.color||'#3b82f6'};color:white;font-size:11px;font-weight:700;
        display:flex;align-items:center;justify-content:center;
        border:2px solid rgba(8,15,40,0.8);cursor:default;">
        ${(u.name||'U')[0].toUpperCase()}
      </div>`).join('') +
    `<span style="font-size:11px;color:rgba(148,163,184,0.5);margin-left:6px;">
      ${others.length} collabo${others.length>1?'s':''} en ligne
    </span>`;

  _renderCollabListInPanel(others);
}

function _renderCollabListInPanel(users) {
  const list = document.getElementById('editorCollabList');
  if (!list || !users.length) return;
  list.innerHTML = `
    <p style="color:rgba(148,163,184,0.45);font-size:11px;margin:0 0 8px;">En ligne maintenant :</p>
    ${users.map(u => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;
                  border-bottom:1px solid rgba(96,165,250,0.07);">
        <div style="width:24px;height:24px;border-radius:50%;background:${u.color||'#3b82f6'};
                    display:flex;align-items:center;justify-content:center;
                    color:white;font-size:10px;font-weight:700;flex-shrink:0;">
          ${(u.name||'U')[0].toUpperCase()}
        </div>
        <span style="color:rgba(226,232,240,0.8);font-size:12px;flex:1;">
          ${escapeHtml(u.name||u.email||'Utilisateur')}
        </span>
        <span style="width:7px;height:7px;border-radius:50%;background:#10b981;flex-shrink:0;"></span>
      </div>`).join('')}
  `;
}

function _showTypingBadge(payload) {
  const existing = document.getElementById(`typing-badge-${payload.userId}`);
  if (existing) { existing.remove(); }
  const badge = document.createElement('div');
  badge.id = `typing-badge-${payload.userId}`;
  badge.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:${payload.color};color:white;padding:5px 14px;border-radius:20px;
    font-size:12px;z-index:10000;pointer-events:none;
    box-shadow:0 4px 12px rgba(0,0,0,0.4);animation:slideIn 0.3s ease;`;
  badge.textContent = `✏️  ${payload.userName} est en train d'écrire…`;
  document.body.appendChild(badge);
  setTimeout(() => { if (badge.parentNode) badge.remove(); }, 2200);
}

function _removeCollaboratorCursor(userId) {
  document.querySelectorAll(`[data-collab-uid="${userId}"]`).forEach(el => {
    el.style.outline = ''; delete el.dataset.collabUid;
  });
  const badge = document.getElementById(`typing-badge-${userId}`);
  if (badge) badge.remove();
}

function _broadcastCursorPosition() {
  if (!_editor.channel || _editor.type !== 'word' || !_editor.quill) return;
  const range = _editor.quill.getSelection();
  if (!range) return;
  _editor.channel.send({
    type:'broadcast', event:'cursor_position',
    payload:{
      userId: G.currentUser.id,
      userName: G.currentUser.name || G.currentUser.email,
      color: _editor.myColor,
      index: range.index, length: range.length
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. SCOPE (Entreprise / Personnel)
// ─────────────────────────────────────────────────────────────────────────────

async function editorToggleScope() {
  const doc = G.documents.find(d => d.id === _editor.docId);
  if (!doc) return;

  const isOwner   = doc.owner_id === G.currentUser.id;
  const isAdmin   = G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
  const isManager = G.currentUser?.role === 'manager' || isAdmin;
  if (!isOwner && !isManager) { showToast('Seul le propriétaire peut changer la portée', 'error'); return; }

  const newScope = doc.scope === 'company' ? 'personal' : 'company';
  const label    = newScope === 'company' ? 'Entreprise' : 'Personnel';
  const msg      = newScope === 'company'
    ? "Ce document sera visible par tous les membres de l'entreprise."
    : 'Ce document ne sera plus visible que par vous (et les administrateurs).';

  if (!confirm(`Passer en mode ${label} ?\n\n${msg}`)) return;

  try {
    const { error } = await G.supabase
      .from('documents')
      .update({ scope: newScope, updated_at: new Date().toISOString() })
      .eq('id', _editor.docId);
    if (error) throw error;

    doc.scope = newScope;
    await addAuditLog('scope_change', 'document', _editor.docId,
      `Portée → ${label} par ${G.currentUser.email}`);
    showToast(`Document passé en mode ${label}`, 'success');

    // UI
    const lbl  = document.getElementById('editorScopeLabel');
    const icon = document.getElementById('editorScopeIcon');
    const disp = document.getElementById('editorScopeDisplay');
    if (lbl)  lbl.textContent = label;
    if (icon) icon.className  = `fas ${newScope === 'company' ? 'fa-building' : 'fa-user'}`;
    if (disp) {
      disp.style.color = newScope === 'company' ? '#60a5fa' : '#a78bfa';
      disp.innerHTML   = `<i class="fas ${newScope === 'company' ? 'fa-building' : 'fa-user'} mr-1"></i>${label}`;
    }
  } catch (err) {
    showToast('Erreur : ' + err.message, 'error');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. INVITATION DE COLLABORATEURS
// ─────────────────────────────────────────────────────────────────────────────

function editorOpenInvitePanel() {
  const panel = document.getElementById('editorInvitePanel');
  if (panel) panel.style.display = 'block';
  _loadExistingCollaborators();
}

function editorCloseInvitePanel() {
  const panel = document.getElementById('editorInvitePanel');
  if (panel) panel.style.display = 'none';
}

async function _loadExistingCollaborators() {
  const list = document.getElementById('editorCollabList');
  if (!list || !_editor.docId) return;
  try {
    const { data: shares } = await G.supabase
      .from('shares')
      .select('id, recipient_email, permission, recipient_id, profiles!recipient_id(name, email)')
      .eq('document_id', _editor.docId)
      .eq('status', 'active');

    if (!shares || shares.length === 0) {
      list.innerHTML = '<p style="color:rgba(148,163,184,0.4);font-size:11px;margin-top:12px;">Aucun collaborateur invité pour l\'instant.</p>';
      return;
    }
    list.innerHTML = `
      <p style="color:rgba(148,163,184,0.45);font-size:11px;margin:14px 0 8px;">Collaborateurs invités :</p>
      ${shares.map(s => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;
                    border-bottom:1px solid rgba(96,165,250,0.07);">
          <div style="width:26px;height:26px;border-radius:50%;background:#3b82f6;
                      display:flex;align-items:center;justify-content:center;
                      color:white;font-size:11px;font-weight:700;flex-shrink:0;">
            ${((s.profiles?.name || s.recipient_email || 'U')[0]).toUpperCase()}
          </div>
          <div style="flex:1;min-width:0;">
            <p style="color:rgba(226,232,240,0.85);font-size:12px;margin:0;truncate;">
              ${escapeHtml(s.profiles?.name || s.recipient_email || '')}</p>
            <p style="color:rgba(148,163,184,0.4);font-size:10px;margin:0;">
              ${s.permission === 'edit' ? '✏️ Peut modifier' : '👁 Peut consulter'}</p>
          </div>
          <button onclick="editorRevokeCollaborator('${s.id}')"
            style="font-size:11px;color:#f87171;background:rgba(239,68,68,0.1);
                   border:1px solid rgba(239,68,68,0.2);border-radius:6px;
                   padding:3px 8px;cursor:pointer;flex-shrink:0;">Révoquer</button>
        </div>`).join('')}
    `;
  } catch (err) { console.warn('_loadExistingCollaborators:', err); }
}

async function editorSendInvite() {
  const email = document.getElementById('editorInviteEmail')?.value.trim();
  const perm  = document.getElementById('editorInvitePermission')?.value;
  if (!email) { showToast('Veuillez entrer un email', 'warning'); return; }

  try {
    // 1. Vérifier appartenance à la même entreprise
    const { data: targetUser, error: ue } = await G.supabase
      .from('profiles')
      .select('id, email, name')
      .eq('email', email)
      .eq('company_id', G.currentUser.companyId)
      .single();

    if (ue || !targetUser) {
      showToast("Cet utilisateur n'appartient pas à votre entreprise", 'error'); return;
    }

    // 2. Vérifier doublon
    const { data: dup } = await G.supabase
      .from('shares')
      .select('id')
      .eq('document_id', _editor.docId)
      .eq('recipient_id', targetUser.id)
      .eq('status', 'active')
      .maybeSingle();
    if (dup) { showToast('Cet utilisateur est déjà collaborateur', 'warning'); return; }

    // 3. Insérer le partage
    const share = {
      id: generateId(),
      document_id: _editor.docId,
      sender_id: G.currentUser.id,
      recipient_email: email,
      recipient_id: targetUser.id,
      permission: perm,
      expires_at: null,
      status: 'active',
      created_at: new Date().toISOString()
    };

    const { error } = await G.supabase.from('shares').insert(share);
    if (error) throw error;

    G.shares.push(share);
    showToast(`<i class="fas fa-check-circle mr-2" style="color:#34d399;"></i>Invitation envoyée à ${email}`, 'success');
    await addAuditLog('collab_invite', 'document', _editor.docId, `Invité: ${email} (${perm})`);

    const inp = document.getElementById('editorInviteEmail');
    if (inp) inp.value = '';
    _loadExistingCollaborators();
  } catch (err) {
    showToast('Erreur invitation : ' + err.message, 'error');
  }
}

async function editorRevokeCollaborator(shareId) {
  if (!confirm("Révoquer l'accès de ce collaborateur ?")) return;
  try {
    const { error } = await G.supabase
      .from('shares').update({ status:'revoked' }).eq('id', shareId);
    if (error) throw error;
    const idx = (G.shares || []).findIndex(s => s.id === shareId);
    if (idx !== -1) G.shares[idx].status = 'revoked';
    showToast('Accès révoqué', 'success');
    _loadExistingCollaborators();
  } catch (err) {
    showToast('Erreur : ' + err.message, 'error');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. ACTIONS UTILISATEUR
// ─────────────────────────────────────────────────────────────────────────────

async function editorSaveNow() {
  await _performSave();
  if (!_editor.saving) {
    showToast('<i class="fas fa-check-circle mr-2" style="color:#34d399;"></i>Document enregistré avec succès', 'success');
  }
}

function closeDocumentEditor() {
  if (_editor.isDirty) {
    if (!confirm('Des modifications non sauvegardées seront perdues. Fermer quand même ?')) return;
  }
  if (_editor.saveTimer) { clearInterval(_editor.saveTimer); _editor.saveTimer = null; }
  if (_editor.channel) {
    try { G.supabase.removeChannel(_editor.channel); } catch(e) {}
    _editor.channel = null;
  }
  _editor.quill    = null;
  _editor.workbook = null;
  _editor.docId    = null;
  _editor.isDirty  = false;
  _editor.saving   = false;

  const modal = document.getElementById('documentEditorModal');
  if (modal) modal.style.display = 'none';

  if (typeof renderDocuments === 'function') renderDocuments();
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. HELPERS UI
// ─────────────────────────────────────────────────────────────────────────────

function _setSaveStatus(status) {
  const ind  = document.getElementById('editorSaveIndicator');
  const text = document.getElementById('editorSaveText');
  if (!ind || !text) return;
  const cfg = {
    saved:    { icon:'fa-check-circle',      color:'#10b981', label:'Sauvegardé'                   },
    saving:   { icon:'fa-spinner fa-spin',   color:'#60a5fa', label:'Sauvegarde en cours…'          },
    modified: { icon:'fa-circle',            color:'#f59e0b', label:'Modifications non sauvegardées'},
    error:    { icon:'fa-exclamation-circle',color:'#ef4444', label:'Erreur de sauvegarde'          }
  };
  const c = cfg[status] || cfg.saved;
  const i = ind.querySelector('i');
  if (i) { i.className = `fas ${c.icon}`; i.style.color = c.color; }
  text.textContent = c.label;
}

function _setLoadingText(msg) {
  const el = document.getElementById('editorLoadingText');
  if (el) el.textContent = msg;
}

function _hideLoadingOverlay() {
  const ol = document.getElementById('editorLoadingOverlay');
  if (ol) ol.style.display = 'none';
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. HELPER : bouton "Éditer" pour les cartes document
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne le HTML du bouton "Éditer" à insérer dans renderDocCard / renderDocListItem.
 * Ajouter  ${buildEditButton(doc)}  dans les actions des cartes.
 */
function buildEditButton(doc) {
  const ext = (doc.name || '').split('.').pop().toLowerCase();
  if (!['doc','docx','xls','xlsx'].includes(ext)) return '';

  const isOwner        = doc.owner_id === G.currentUser.id;
  const isAdmin        = G.currentUser?.role === 'admin' || G.currentUser?.isSystemAdmin;
  const isManager      = G.currentUser?.role === 'manager' || isAdmin;
  const isCollaborator = (G.shares || []).some(
    s => s.document_id === doc.id && s.recipient_id === G.currentUser.id &&
         s.status === 'active' && ['edit','write'].includes(s.permission));

  if (!isOwner && !isAdmin && !isManager && !isCollaborator) return '';

  const isW   = ['doc','docx'].includes(ext);
  const color = isW ? '#60a5fa' : '#34d399';
  const bg    = isW ? 'rgba(37,99,235,0.15)' : 'rgba(16,185,129,0.15)';
  const icon  = isW ? 'fa-file-word' : 'fa-file-excel';
  const label = isW ? 'Éditer Word' : 'Éditer Excel';

  return `
    <button onclick="event.stopPropagation(); openDocumentEditor('${doc.id}')"
      class="p-2 rounded-lg transition-colors"
      style="background:${bg};color:${color};border:1px solid ${color}33;cursor:pointer;
             display:flex;align-items:center;gap:5px;font-size:12px;"
      title="${label}">
      <i class="fas ${icon}"></i>
      <span style="font-size:11px;">${label}</span>
    </button>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPOSITIONS GLOBALES
// ─────────────────────────────────────────────────────────────────────────────

Object.assign(window, {
  openDocumentEditor,
  closeDocumentEditor,
  editorSaveNow,
  editorToggleScope,
  editorOpenInvitePanel,
  editorCloseInvitePanel,
  editorSendInvite,
  editorRevokeCollaborator,
  editorSwitchSheet,
  buildEditButton,
  _onExcelCellChange,
  _onExcelCellFocus
});
