// ============================================================
// SystemesGED v7.2 — missing-functions.js (CORRIGÉ)
// Fonctions appelées dans index.html mais absentes de tous
// les modules JS. À inclure APRÈS api.js dans index.html.
//
// CORRECTIONS APPLIQUÉES :
//  1. Suppression du Object.defineProperty(SB) non-writable
//  2. openDangerModal redéfini directement (sans IIFE chaîné)
//  3. onCollabEditorInput ajouté (manquait dans tous les fichiers)
//  4. saveEditUser implémentée (manquait dans tous les fichiers)
//  5. addCollaborator corrigé pour lire permCollabEmail / permCollabPermission
//  6. Exposition globale complète
// ============================================================

// ─── 1. ÉDITEUR RICHE (richEditorModal) ─────────────────────

function richCmd(cmd, value) {
  const editor = document.getElementById('richEditorContent');
  if (!editor) return;
  editor.focus();
  try {
    document.execCommand(cmd, false, value || null);
  } catch (e) {
    console.warn('richCmd error:', e);
  }
  _onRichEditorInput();
}

function richAlign(align) {
  const cmds = {
    left:    'justifyLeft',
    center:  'justifyCenter',
    right:   'justifyRight',
    justify: 'justifyFull'
  };
  richCmd(cmds[align] || 'justifyLeft');
}

function richInsertHeading(level) {
  richCmd('formatBlock', `h${level}`);
}

function richInsertLink() {
  const url = prompt('URL du lien :');
  if (!url) return;
  richCmd('createLink', url);
}

function richInsertCodeBlock() {
  const editor = document.getElementById('richEditorContent');
  if (!editor) return;
  editor.focus();
  const sel  = window.getSelection();
  const text = sel && sel.toString() ? sel.toString() : 'code';
  document.execCommand('insertHTML', false,
    `<pre style="background:rgba(15,23,42,0.8);border:1px solid rgba(96,165,250,0.2);border-radius:8px;padding:12px 16px;font-family:monospace;font-size:13px;color:#86efac;overflow-x:auto;margin:0.5rem 0;">${escapeHtml(text)}</pre>`
  );
  _onRichEditorInput();
}

function richInsertTable() {
  document.getElementById('richEditorContent')?.focus();
  document.execCommand('insertHTML', false,
    `<table style="border-collapse:collapse;width:100%;margin:0.75rem 0;">
      <tr>
        <th style="border:1px solid rgba(96,165,250,0.2);padding:8px 12px;background:rgba(15,23,42,0.5);">En-tête 1</th>
        <th style="border:1px solid rgba(96,165,250,0.2);padding:8px 12px;background:rgba(15,23,42,0.5);">En-tête 2</th>
        <th style="border:1px solid rgba(96,165,250,0.2);padding:8px 12px;background:rgba(15,23,42,0.5);">En-tête 3</th>
      </tr>
      <tr>
        <td style="border:1px solid rgba(96,165,250,0.2);padding:8px 12px;">Cellule</td>
        <td style="border:1px solid rgba(96,165,250,0.2);padding:8px 12px;">Cellule</td>
        <td style="border:1px solid rgba(96,165,250,0.2);padding:8px 12px;">Cellule</td>
      </tr>
    </table><br>`
  );
  _onRichEditorInput();
}

function richInsertMention() {
  const name = prompt('Nom de la personne à mentionner :');
  if (!name) return;
  document.getElementById('richEditorContent')?.focus();
  document.execCommand('insertHTML', false,
    `<span style="color:#60a5fa;font-weight:600;background:rgba(59,130,246,0.15);padding:1px 6px;border-radius:4px;">@${escapeHtml(name)}</span>&nbsp;`
  );
  _onRichEditorInput();
}

// ─── 2. ÉDITEUR COLLABORATIF — onCollabEditorInput ──────────
// CORRECTION : cette fonction était appelée dans le HTML mais
// n'était définie nulle part, causant un ReferenceError à chaque frappe.

function onCollabEditorInput(e) {
  // Mise à jour du compteur de mots
  if (typeof _collabUpdateWordCount === 'function') {
    _collabUpdateWordCount();
  }
  // Marquer comme non enregistré
  const statusEl = document.getElementById('collabSaveStatus');
  if (statusEl) {
    statusEl.innerHTML = '<i class="fas fa-circle text-yellow-400 mr-1" style="font-size:8px;"></i><span class="text-yellow-400/70 text-xs">Non enregistré</span>';
  }
}

// ─── 3. MODALE DANGER ────────────────────────────────────────

function closeDangerModal() {
  const modal = document.getElementById('dangerModal');
  if (modal) modal.classList.add('hidden');
  const btn   = document.getElementById('dangerConfirmBtn');
  const input = document.getElementById('dangerConfirmInput');
  if (btn)   btn.disabled  = true;
  if (input) input.value   = '';
  window._dangerActionCallback = null;
}

function executeDangerAction() {
  if (typeof window._dangerActionCallback === 'function') {
    window._dangerActionCallback();
  }
  closeDangerModal();
}

// CORRECTION : définition directe sans chaîner l'ancienne version stub
// (l'IIFE précédente capturait le stub de api.js et le ré-appelait)
function openDangerModal(actionLabel, confirmText, callback) {
  const modal = document.getElementById('dangerModal');
  if (!modal) {
    // Si pas de modale dans le DOM, exécuter directement (fallback)
    if (typeof callback === 'function') callback();
    return;
  }

  const labelEl   = document.getElementById('dangerActionLabel');
  const msgEl     = document.getElementById('dangerModalMessage');
  const confirmEl = document.getElementById('dangerConfirmText');
  const input     = document.getElementById('dangerConfirmInput');
  const btn       = document.getElementById('dangerConfirmBtn');

  const label   = actionLabel  || 'cette action';
  const confirm = confirmText  || 'CONFIRMER';

  if (labelEl)   labelEl.textContent  = label;
  if (confirmEl) confirmEl.textContent = confirm;
  if (msgEl)     msgEl.textContent    = `Vous êtes sur le point d'effectuer : "${label}". Cette action est irréversible.`;

  if (input) {
    input.value       = '';
    input.placeholder = confirm;
    input.oninput     = function () {
      if (btn) btn.disabled = input.value.trim().toUpperCase() !== confirm.toUpperCase();
    };
  }
  if (btn) btn.disabled = true;

  window._dangerActionCallback = callback || null;
  modal.classList.remove('hidden');
}

// Fonction utilitaire de vérification dans la modale (appelée par oninput inline)
function checkDangerConfirm() {
  const input = document.getElementById('dangerConfirmInput');
  const btn   = document.getElementById('dangerConfirmBtn');
  if (!input || !btn) return;
  btn.disabled = input.value.trim().toUpperCase() !== 'CONFIRMER';
}

// ─── 4. MODALE ÉDITION UTILISATEUR ──────────────────────────

function closeEditUserModal() {
  const modal = document.getElementById('editUserModal');
  if (modal) modal.classList.add('hidden');
}

// CORRECTION : saveEditUser était appelée dans le HTML mais n'existait
// dans aucun fichier JS, rendant le formulaire d'édition inopérant.
async function saveEditUser(e) {
  if (e) e.preventDefault();
  const userId    = document.getElementById('editUserId')?.value;
  const firstName = document.getElementById('editUserFirst')?.value.trim();
  const lastName  = document.getElementById('editUserLast')?.value.trim();
  const role      = document.getElementById('editUserRole')?.value;

  if (!userId)              { showToast('ID utilisateur manquant', 'error');   return; }
  if (!firstName || !lastName) { showToast('Prénom et nom requis', 'warning'); return; }

  const name = `${firstName} ${lastName}`;
  const btn  = document.querySelector('#editUserModal button[type="submit"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner mr-2"></span>Enregistrement…'; }

  try {
    const { error } = await G.supabase
      .from('profiles')
      .update({ name, role, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;

    // Mettre à jour le cache local
    const user = G.users.find(u => u.id === userId);
    if (user) { user.name = name; user.role = role; }

    showToast(`Utilisateur "${name}" mis à jour`, 'success');
    await addAuditLog('user_edit', 'user', userId, `Nom: ${name}, Rôle: ${role}`);
    closeEditUserModal();
    if (typeof renderUsers === 'function') renderUsers();
  } catch (err) {
    showToast('Erreur mise à jour : ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled  = false;
      btn.innerHTML = 'Sauvegarder';
    }
  }
}

// Ouvrir la modale d'édition et pré-remplir les champs
function openEditUserModal(userId) {
  const user = G.users.find(u => u.id === userId);
  if (!user) { showToast('Utilisateur introuvable', 'error'); return; }

  const modal = document.getElementById('editUserModal');
  if (!modal) return;

  const parts = (user.name || '').split(' ');
  const first = parts[0]            || '';
  const last  = parts.slice(1).join(' ') || '';

  const idEl    = document.getElementById('editUserId');
  const firstEl = document.getElementById('editUserFirst');
  const lastEl  = document.getElementById('editUserLast');
  const roleEl  = document.getElementById('editUserRole');

  if (idEl)    idEl.value    = userId;
  if (firstEl) firstEl.value = first;
  if (lastEl)  lastEl.value  = last;
  if (roleEl)  roleEl.value  = user.role || 'viewer';

  modal.classList.remove('hidden');
}

// ─── 5. MODALE PERMISSIONS ──────────────────────────────────

function closePermModal() {
  const modal = document.getElementById('permModal') || document.getElementById('roleModal');
  if (modal) modal.classList.add('hidden');
}

// ─── 6. ÉDITEUR COLLABORATIF (collabEditorModal) ────────────

function closeCollabEditor() {
  const modal = document.getElementById('collabEditorModal');
  if (modal) modal.classList.add('hidden');
  if (typeof window._stopCollabSync === 'function') window._stopCollabSync();
}

// CORRECTION : lecture des IDs dupliqués résolue.
// collabModal  → collabEmail / collabPermission  (inchangés)
// permModal    → permCollabEmail / permCollabPermission  (renommés dans index.html)
function addCollaborator() {
  // Détecter la modale active pour lire le bon champ email
  const permModal  = document.getElementById('permModal');
  const isPermOpen = permModal && !permModal.classList.contains('hidden');

  const emailInput = isPermOpen
    ? document.getElementById('permCollabEmail')
    : (document.getElementById('collabInviteEmail') || document.getElementById('collabEmail'));

  const permInput = isPermOpen
    ? document.getElementById('permCollabPermission')
    : document.getElementById('collabPermission');

  const email = emailInput?.value.trim();
  if (!email) { showToast('Veuillez entrer un email', 'warning'); return; }

  const docId = G.collabModalDocId || G.currentDocId;
  if (!docId) { showToast('Aucun document sélectionné', 'error'); return; }

  // Synchroniser la permission si on passe par permModal
  if (isPermOpen && permInput) {
    const mainPermInput = document.getElementById('collabPermission');
    if (mainPermInput) mainPermInput.value = permInput.value;
    if (emailInput !== document.getElementById('collabEmail')) {
      const mainEmailInput = document.getElementById('collabEmail');
      if (mainEmailInput) mainEmailInput.value = email;
    }
  }

  G.collabModalDocId = docId;
  if (typeof inviteCollaborator === 'function') {
    inviteCollaborator();
  } else {
    showToast('Module de collaboration non chargé', 'error');
  }
}

// ─── 7. WORKFLOWS — ÉTAPES ──────────────────────────────────

function addWfStep() {
  const container = document.getElementById('wfStepsContainer');
  if (!container) return;
  const idx = container.children.length + 1;
  const div = document.createElement('div');
  div.className = 'flex items-center gap-2 mt-2';
  div.innerHTML = `
    <span class="text-blue-400/50 text-xs w-5">${idx}.</span>
    <input type="text" placeholder="Étape ${idx}" maxlength="100"
      class="flex-1 px-3 py-2 rounded-lg text-white text-sm outline-none"
      style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);">
    <button type="button" onclick="this.parentElement.remove()"
      class="p-1.5 text-red-400/60 hover:text-red-400 transition-colors">
      <i class="fas fa-times text-xs"></i>
    </button>`;
  container.appendChild(div);
  div.querySelector('input')?.focus();
}

// ─── 8. SIGNATURES ──────────────────────────────────────────

function submitSignatureRequest() {
  if (typeof requestSignature === 'function') {
    requestSignature();
  } else {
    showToast('Module signatures non chargé', 'error');
  }
}

// ─── 9. ALIAS SB → G.supabase (simple variable, NON Object.defineProperty) ──
// CORRECTION : l'ancienne version utilisait Object.defineProperty avec un setter
// no-op, ce qui rendait window.SB = ... silencieusement inefficace et causait
// des TypeError dans les scripts inline (collabEditorModal, etc.).
// Ici on maintient SB comme variable normale synchronisée aux bons moments.

function _syncSB() {
  if (window.G && window.G.supabase) {
    window.SB = window.G.supabase;
  }
}

document.addEventListener('DOMContentLoaded', function () {
  // Sync initial
  _syncSB();

  // Exposer renderActivityList après chargement de ui.js
  setTimeout(function () {
    if (typeof renderActivityList === 'function' && !window.renderActivityList) {
      window.renderActivityList = renderActivityList;
    }
  }, 500);

  // Re-sync SB après login sans briser switchToMainApp
  const origSwitch = window.switchToMainApp;
  if (typeof origSwitch === 'function') {
    window.switchToMainApp = function () {
      origSwitch.call(this);
      _syncSB();
    };
  }
});

// ─── 11. ÉDITEUR COLLABORATIF — fonctions internes ──────────
// CORRECTION : _collabFormat, _saveContentNow, _collabUpdateWordCount
// étaient appelées dans le HTML (collabEditorModal) mais définies nulle part.

function _collabFormat(cmd) {
  const textarea = document.getElementById('collabEditorArea');
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end   = textarea.selectionEnd;
  const sel   = textarea.value.substring(start, end);

  const formats = {
    bold:   { before: '**', after: '**' },
    italic: { before: '_',  after: '_'  },
    code:   { before: '`',  after: '`'  },
    h1:     { before: '# ', after: ''   },
    h2:     { before: '## ', after: ''  },
    ul:     { before: '- ', after: ''   },
    link:   { before: '[',  after: '](url)' },
  };

  const fmt = formats[cmd];
  if (!fmt) return;

  const newText = fmt.before + (sel || (cmd === 'link' ? 'texte' : 'texte')) + fmt.after;
  textarea.setRangeText(newText, start, end, 'end');
  textarea.focus();
  _collabUpdateWordCount();
  onCollabEditorInput();
}

async function _saveContentNow() {
  const textarea = document.getElementById('collabEditorArea');
  const docId    = G.collabModalDocId || G.currentDocId;
  if (!textarea || !docId) return;

  const content = textarea.value;
  const statusEl = document.getElementById('collabSaveStatus');

  if (statusEl) {
    statusEl.innerHTML = '<span class="spinner mr-1" style="width:10px;height:10px;"></span><span class="text-blue-300/70 text-xs">Enregistrement…</span>';
  }

  try {
    const supabase = G.supabase || window.SB;
    if (!supabase) throw new Error('Supabase non initialisé');

    if (G._isDemo) {
      // Mode démo : simulation
      await new Promise(r => setTimeout(r, 400));
    } else {
      const { error } = await supabase
        .from('documents')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', docId);
      if (error) throw error;
    }

    // Mettre à jour le cache local
    const doc = (G.documents || []).find(d => d.id === docId);
    if (doc) { doc.content = content; doc.updated_at = new Date().toISOString(); }

    if (statusEl) {
      statusEl.innerHTML = '<i class="fas fa-check-circle text-green-400 mr-1" style="font-size:10px;"></i><span class="text-green-400/70 text-xs">Enregistré</span>';
      setTimeout(() => {
        if (statusEl) statusEl.innerHTML = '';
      }, 3000);
    }

    if (typeof addAuditLog === 'function') {
      await addAuditLog('edit', 'document', docId, 'Contenu mis à jour via éditeur collaboratif');
    }
  } catch (err) {
    console.error('_saveContentNow error:', err);
    if (statusEl) {
      statusEl.innerHTML = '<i class="fas fa-exclamation-circle text-red-400 mr-1" style="font-size:10px;"></i><span class="text-red-400/70 text-xs">Erreur</span>';
    }
    if (typeof showToast === 'function') showToast('Erreur de sauvegarde : ' + err.message, 'error');
  }
}

function _collabUpdateWordCount() {
  const textarea  = document.getElementById('collabEditorArea');
  const countEl   = document.getElementById('collabWordCount');
  if (!textarea || !countEl) return;

  const text  = textarea.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const chars = textarea.value.length;

  countEl.textContent = words === 1
    ? `1 mot · ${chars} car.`
    : `${words} mots · ${chars} car.`;
}

// Auto-save toutes les 30 secondes si l'éditeur est ouvert
let _collabAutoSaveTimer = null;

function _startCollabAutoSave() {
  _stopCollabAutoSave();
  _collabAutoSaveTimer = setInterval(function() {
    const modal = document.getElementById('collabEditorModal');
    if (modal && !modal.classList.contains('hidden')) {
      _saveContentNow();
    }
  }, 30000);
}

function _stopCollabAutoSave() {
  if (_collabAutoSaveTimer) {
    clearInterval(_collabAutoSaveTimer);
    _collabAutoSaveTimer = null;
  }
}

// Exposer stopCollabSync pour closeCollabEditor
window._stopCollabSync = _stopCollabAutoSave;

// ─── 10. EXPOSITIONS GLOBALES ────────────────────────────────
Object.assign(window, {
  // Éditeur riche
  richCmd,
  richAlign,
  richInsertHeading,
  richInsertLink,
  richInsertCodeBlock,
  richInsertTable,
  richInsertMention,
  // Éditeur collaboratif
  onCollabEditorInput,
  // Modale danger
  openDangerModal,
  closeDangerModal,
  executeDangerAction,
  checkDangerConfirm,
  // Utilisateurs
  closeEditUserModal,
  openEditUserModal,
  saveEditUser,
  // Permissions
  closePermModal,
  // Collaboratif
  closeCollabEditor,
  addCollaborator,
  // Workflows
  addWfStep,
  // Signatures
  submitSignatureRequest,
  // SB sync
  _syncSB,
});
