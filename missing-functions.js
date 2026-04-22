// ============================================================
// SystemesGED v7.2 — missing-functions.js
// Fonctions appelées dans index.html mais absentes de tous
// les modules JS. À inclure APRÈS api.js dans index.html.
// ============================================================

// ─── 1. ÉDITEUR RICHE (richEditorModal) ─────────────────────
// Fonctions de la barre d'outils de richEditorModal

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
  const cmds = { left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' };
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
  const sel = window.getSelection();
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

// ─── 2. MODALE DANGER ────────────────────────────────────────

function closeDangerModal() {
  const modal = document.getElementById('dangerModal');
  if (modal) modal.classList.add('hidden');
  // Réinitialiser le bouton confirm
  const btn = document.getElementById('dangerConfirmBtn');
  const input = document.getElementById('dangerConfirmInput');
  if (btn) btn.disabled = true;
  if (input) input.value = '';
  window._dangerActionCallback = null;
}

function executeDangerAction() {
  if (typeof window._dangerActionCallback === 'function') {
    window._dangerActionCallback();
  }
  closeDangerModal();
}

// Exposer openDangerModal avec vrai comportement (remplace le stub dans api.js)
(function() {
  const originalOpen = window.openDangerModal;
  window.openDangerModal = function(actionLabel, confirmText, callback) {
    const modal = document.getElementById('dangerModal');
    if (!modal) { if (typeof callback === 'function') callback(); return; }

    // Remplir les champs si présents
    const labelEl   = document.getElementById('dangerActionLabel');
    const confirmEl = document.getElementById('dangerConfirmText');
    const input     = document.getElementById('dangerConfirmInput');
    const btn       = document.getElementById('dangerConfirmBtn');

    if (labelEl && actionLabel)   labelEl.textContent   = actionLabel;
    if (confirmEl && confirmText) confirmEl.textContent  = confirmText;
    if (input) {
      input.value = '';
      input.oninput = function() {
        if (btn) btn.disabled = input.value.trim().toLowerCase() !== (confirmText || 'confirmer').toLowerCase();
      };
    }
    if (btn) btn.disabled = true;

    window._dangerActionCallback = callback || null;
    modal.classList.remove('hidden');
  };
})();

// ─── 3. MODALE ÉDITION UTILISATEUR ──────────────────────────

function closeEditUserModal() {
  const modal = document.getElementById('editUserModal');
  if (modal) modal.classList.add('hidden');
}

// ─── 4. MODALE PERMISSIONS ──────────────────────────────────

function closePermModal() {
  const modal = document.getElementById('permModal') || document.getElementById('roleModal');
  if (modal) modal.classList.add('hidden');
}

// ─── 5. ÉDITEUR COLLABORATIF (collabEditorModal) ────────────

function closeCollabEditor() {
  const modal = document.getElementById('collabEditorModal');
  if (modal) modal.classList.add('hidden');
  // Exposer la fonction de nettoyage si elle existe
  if (typeof window._stopCollabSync === 'function') window._stopCollabSync();
  // Aliaser window.SB pour _saveContentNow
  if (!window.SB && window.G?.supabase) window.SB = window.G.supabase;
}

function addCollaborator() {
  const input = document.getElementById('collabInviteEmail') ||
                document.getElementById('collabEmail');
  const email = input?.value.trim();
  if (!email) { showToast('Veuillez entrer un email', 'warning'); return; }

  // Utiliser inviteCollaborator si disponible (documents.js)
  const docId = G.collabModalDocId || G.currentDocId;
  if (!docId) { showToast('Aucun document sélectionné', 'error'); return; }

  if (typeof inviteCollaborator === 'function') {
    // Temporarily set the modal doc id
    G.collabModalDocId = docId;
    inviteCollaborator();
  } else {
    showToast('Module de collaboration non chargé', 'error');
  }
}

// Alias SB → G.supabase pour le script inline dans index.html
document.addEventListener('DOMContentLoaded', function() {
  if (!window.SB && window.G?.supabase) window.SB = window.G.supabase;
  // Re-sync SB après login
  const origSwitchToMain = window.switchToMainApp;
  if (origSwitchToMain) {
    window.switchToMainApp = function() {
      origSwitchToMain();
      if (window.G?.supabase) window.SB = window.G.supabase;
    };
  }
});

// ─── 6. WORKFLOWS — ÉTAPES ──────────────────────────────────

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

// ─── 7. SIGNATURES — SOUMETTRE UNE DEMANDE ──────────────────

function submitSignatureRequest() {
  // Déléguer à requestSignature de api.js si disponible
  if (typeof requestSignature === 'function') {
    requestSignature();
  } else {
    showToast('Module signatures non chargé', 'error');
  }
}

// ─── 8. renderActivityList exposée globalement ───────────────
// renderActivityList est définie dans ui.js mais pas exposée à window

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    // Exposer après que ui.js ait fini de charger
    if (typeof renderActivityList === 'function' && !window.renderActivityList) {
      window.renderActivityList = renderActivityList;
    }
  }, 500);
});

// ─── 9. CORRECTIONS DIVERSES ────────────────────────────────

// SB alias — toujours synchronisé avec G.supabase
Object.defineProperty(window, 'SB', {
  get: function() { return window.G?.supabase || null; },
  set: function(v) { /* no-op — utiliser G.supabase directement */ },
  configurable: true
});

// ─── 10. BRIDGE wfHistoryList ↔ wfDetailHistory ──────────────────────
// api.js openWfDetail() writes to #wfHistoryList
// workflows.js loadWorkflowHistory() writes to #wfDetailHistory
// → on synchronise les deux en miroir via MutationObserver

document.addEventListener('DOMContentLoaded', function () {
  function _mirrorHistory() {
    const src  = document.getElementById('wfHistoryList');
    const dest = document.getElementById('wfDetailHistory');
    if (!src || !dest) return;
    // Quand api.js écrit dans wfHistoryList, on copie vers wfDetailHistory
    new MutationObserver(() => {
      if (src.innerHTML.trim()) {
        dest.innerHTML = src.innerHTML;
        dest.classList.remove('hidden');
        src.classList.add('hidden');   // On utilise dest comme affichage principal
      }
    }).observe(src, { childList: true, subtree: true, characterData: true });
  }
  _mirrorHistory();

  // Exposer _updateTeamPreview au scope global (défini dans workflows.js)
  setTimeout(function () {
    if (typeof _updateTeamPreview === 'function' && !window._updateTeamPreview) {
      window._updateTeamPreview = _updateTeamPreview;
    }
  }, 600);
});

// ─── 11. Correctif createWorkflow — lecture des steps depuis le container ──
// workflows.js createWorkflow() lit wfSteps (textarea) OR wfStepsContainer (divs)
// On s'assure que si wfStepsContainer est présent, on injecte ses valeurs dans wfSteps

(function () {
  const _origCreate = window.createWorkflow;
  if (typeof _origCreate !== 'function') return; // sera patché après DOMContentLoaded
  window.createWorkflow = function (e) {
    const container = document.getElementById('wfStepsContainer');
    const textarea  = document.getElementById('wfSteps');
    if (container && textarea) {
      const steps = Array.from(container.querySelectorAll('input[type=text]'))
        .map(i => i.value.trim()).filter(Boolean);
      if (steps.length) textarea.value = steps.join(',');
    }
    return _origCreate.call(this, e);
  };
})();

document.addEventListener('DOMContentLoaded', function () {
  setTimeout(function () {
    const _orig = window.createWorkflow;
    if (typeof _orig !== 'function') return;
    window.createWorkflow = function (e) {
      const container = document.getElementById('wfStepsContainer');
      const textarea  = document.getElementById('wfSteps');
      if (container && textarea) {
        const steps = Array.from(container.querySelectorAll('input[type=text]'))
          .map(i => i.value.trim()).filter(Boolean);
        if (steps.length) textarea.value = steps.join(',');
      }
      return _orig.call(this, e);
    };
  }, 800);
});

// Exposer tout globalement
Object.assign(window, {
  richCmd,
  richAlign,
  richInsertHeading,
  richInsertLink,
  richInsertCodeBlock,
  richInsertTable,
  richInsertMention,
  closeDangerModal,
  executeDangerAction,
  closeEditUserModal,
  closePermModal,
  closeCollabEditor,
  addCollaborator,
  addWfStep,
  submitSignatureRequest,
});
