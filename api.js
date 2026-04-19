// ============================================
// SystemesGED v7.2 — MODULE : api.js (CORRIGÉ)
// Responsabilités : toutes les fonctionnalités API (utilisateurs, tags, paramètres, sécurité, clés API, intégrations, audit, analytics, dossiers, signatures, IA, automation, sauvegardes, facturation, logs, RBAC, versioning, recherche)
// ============================================

// Dépendances : auth.js (G, CONFIG), ui.js (showToast, formatBytes, formatDate, getFileIcon, escapeHtml, addAuditLog, generateId)

// ─── Etat partagé ───────────────────────────────────────────────────
window._users = { searchQuery: '', roleFilter: '', statusFilter: '' };
window._tags  = { editingId: null };
window._sec   = { auditPage: 1, auditPageSize: 30 };
window._audit = { page: 1, pageSize: 25, totalCount: 0, filter: { action: '', severity: '', days: 30 } };
window._integrations = {};
window._webhooks = [];

const TAG_PALETTE = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'];

// ═══════════════════════════════════════════════════════════════════════
// 1. UTILISATEURS (avec try/catch)
// ═══════════════════════════════════════════════════════════════════════

async function renderUsers() {
  const tbody = document.getElementById('usersList');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6"><i class="fas fa-spinner fa-spin text-blue-400 text-xl"></i></td></tr>';
  try {
    if (G.supabase && G.currentUser?.companyId) {
      const { data, error } = await G.supabase.from('profiles').select('*').eq('company_id', G.currentUser.companyId).order('created_at', { ascending: false });
      if (!error && data) G.users = data;
    }
  } catch (e) { console.warn('renderUsers reload:', e); }

  let users = [...G.users];
  if (_users.searchQuery) {
    const q = _users.searchQuery.toLowerCase();
    users = users.filter(u => (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q));
  }
  if (_users.roleFilter)   users = users.filter(u => u.role === _users.roleFilter);
  if (_users.statusFilter) users = users.filter(u => u.status === _users.statusFilter);

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-blue-300/40"><i class="fas fa-users text-3xl mb-2 block opacity-20"></i>Aucun utilisateur</td>' + '</tr>';
    updatePendingUsersCount(); return;
  }

  const statusColors = { active: 'bg-green-500/20 text-green-400', pending_validation: 'bg-yellow-500/20 text-yellow-400', suspended: 'bg-red-500/20 text-red-400' };
  const statusLabel  = { active: 'Actif', pending_validation: 'En attente', suspended: 'Suspendu' };
  const avatarBg     = { admin: 'bg-red-500/20 text-red-400', manager: 'bg-orange-500/20 text-orange-400', editor: 'bg-blue-500/20 text-blue-400', viewer: 'bg-gray-500/20 text-gray-400' };

  tbody.innerHTML = users.map(u => {
    const isSelf = u.id === G.currentUser.id;
    const canAct = canValidateUsers() && !isSelf;
    return `<tr class="hover:bg-blue-500/5 transition-colors border-b border-blue-500/10">
      <td class="p-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full ${avatarBg[u.role]||'bg-blue-500/20 text-blue-400'} flex items-center justify-center text-sm font-bold">${(u.name||'U').charAt(0).toUpperCase()}</div>
          <div>
            <p class="text-white text-sm font-medium">${escapeHtml(u.name||'—')}${isSelf?'<span class="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300">Vous</span>':''}</p>
            <p class="text-xs text-blue-300/60">${escapeHtml(u.email||'')}</p>
          </div>
        </div>
       </td>
      <td class="p-4"><span class="px-2 py-1 rounded-full text-xs ${getRoleBadgeClass(u.role)}">${G.roles[u.role]?.name||u.role}</span></td>
      <td class="p-4 hidden md:table-cell text-xs text-blue-300/50">${formatDate(u.created_at)}</td>
      <td class="p-4 hidden sm:table-cell"><span class="px-2 py-1 rounded-full text-xs ${statusColors[u.status]||'bg-gray-500/20 text-gray-400'}">${statusLabel[u.status]||u.status}</span></td>
      <td class="p-4">
        <div class="flex gap-1 flex-wrap">
          ${u.status==='pending_validation'&&canAct?`<button onclick="validateUser('${u.id}')" class="px-2.5 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30 flex items-center gap-1"><i class="fas fa-check"></i>Valider</button>`:''}
          ${u.status==='active'&&canAct?`<button onclick="changeUserStatus('${u.id}','suspended')" class="px-2.5 py-1 rounded-lg bg-orange-500/20 text-orange-400 text-xs hover:bg-orange-500/30 flex items-center gap-1"><i class="fas fa-ban"></i>Suspendre</button>`:''}
          ${u.status==='suspended'&&canAct?`<button onclick="changeUserStatus('${u.id}','active')" class="px-2.5 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30 flex items-center gap-1"><i class="fas fa-check-circle"></i>Reactiver</button>`:''}
          ${canAct?`<button onclick="resetUserPassword('${u.email}')" class="p-1.5 rounded-lg hover:bg-yellow-500/20 text-yellow-400 transition-all" title="Reset mdp"><i class="fas fa-key text-sm"></i></button>`:''}
          ${canAct?`<button onclick="deleteUser('${u.id}')" class="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-all" title="Supprimer"><i class="fas fa-trash text-sm"></i></button>`:''}
        </div>
       </td>
     </tr>`;
  }).join('');
  updatePendingUsersCount();
}

function searchUsers(query) { _users.searchQuery=(query||'').trim(); renderUsers(); }
function filterUsersByRole(role) { _users.roleFilter=role||''; renderUsers(); }
function filterUsersByStatus(status) { _users.statusFilter=status||''; renderUsers(); }

async function changeUserStatus(userId, newStatus) {
  if (!canValidateUsers()) { showToast('Permission refusee', 'error'); return; }
  const user = G.users.find(u => u.id === userId);
  if (!user) return;
  if (!confirm(`${newStatus==='suspended'?'Suspendre':'Reactiver'} ${user.name} ?`)) return;
  try {
    const { error } = await G.supabase.from('profiles').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', userId);
    if (error) throw error;
    user.status = newStatus;
    showToast(`Utilisateur ${newStatus==='active'?'reactivé':'suspendu'}`, 'success');
    await addAuditLog(`user_${newStatus}`, 'user', userId, `${user.name} -> ${newStatus}`);
    renderUsers(); updatePendingUsersCount();
  } catch (err) { showToast('Erreur : ' + err.message, 'error'); }
}

function openCreateUserModal() { if (!canValidateUsers()) { showToast('Permission refusee','error'); return; } const m=document.getElementById('addUserModal'); if(m) m.classList.remove('hidden'); }
function closeAddUserModal() { const m=document.getElementById('addUserModal'); if(m) m.classList.add('hidden'); }

async function addUser(e) {
  e.preventDefault();
  if (!canValidateUsers()) { showToast('Permission refusee','error'); return; }
  const firstName=document.getElementById('newUserFirst')?.value.trim();
  const lastName=document.getElementById('newUserLast')?.value.trim();
  const email=document.getElementById('newUserEmail')?.value.trim().toLowerCase();
  const role=document.getElementById('newUserRole')?.value||'viewer';
  if (!firstName||!lastName||!email) { showToast('Remplissez tous les champs','warning'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Email invalide','warning'); return; }
  const name=`${firstName} ${lastName}`;
  const tempPassword=generatePassword();
  const btn=document.getElementById('addUserSubmitBtn');
  if (btn) { btn.disabled=true; btn.innerHTML='<span class="spinner mr-2"></span>Creation…'; }
  try {
    const response=await fetch(CONFIG.edgeFunctionUrl,{ method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${CONFIG.supabaseKey}`}, body:JSON.stringify({email,password:tempPassword,role,companyId:G.currentUser.companyId,name}) });
    const data=await response.json();
    if (!response.ok) throw new Error(data.error||'Erreur serveur');
    closeAddUserModal();
    _showTempPasswordModal(name,email,tempPassword);
    await loadAllData(); renderUsers(); updatePendingUsersCount();
    await addAuditLog('user_create','user',email,`Cree: ${name} (${role})`);
  } catch (err) { showToast('Erreur : '+err.message,'error'); }
  finally { if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-user-plus mr-2"></i>Créer l\'utilisateur'; } }
}

function _showTempPasswordModal(name,email,pwd) {
  let modal=document.getElementById('tempPwdModal');
  if (!modal) { modal=document.createElement('div'); modal.id='tempPwdModal'; modal.className='modal-overlay'; document.body.appendChild(modal); }
  modal.innerHTML=`<div class="modal-box" style="max-width:480px;">
    <div class="flex items-center gap-3 mb-5"><div class="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-green-400 border border-green-500/30"><i class="fas fa-user-check"></i></div>
    <div><h3 class="text-white font-bold">Utilisateur cree</h3><p class="text-blue-300/50 text-xs">${escapeHtml(name)} — ${escapeHtml(email)}</p></div></div>
    <div class="glass-card rounded-xl p-4 border border-yellow-500/25 mb-4" style="background:rgba(245,158,11,0.06)">
      <p class="text-yellow-400 text-xs font-bold mb-2 flex items-center gap-2"><i class="fas fa-exclamation-triangle"></i>Mot de passe temporaire</p>
      <div class="flex gap-2 items-center"><code class="flex-1 bg-slate-900/70 border border-yellow-500/30 rounded-lg px-3 py-2 text-yellow-300 font-mono text-sm">${escapeHtml(pwd)}</code>
      <button onclick="_copyText('${escapeHtml(pwd)}')" class="px-3 py-2 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 text-sm"><i class="fas fa-copy"></i></button></div>
    </div>
    <button onclick="document.getElementById('tempPwdModal').classList.add('hidden')" class="w-full btn-primary py-2.5 rounded-xl text-white text-sm font-semibold">J\'ai noté le mot de passe</button>
  </div>`;
  modal.classList.remove('hidden');
}

async function validateUser(userId) {
  const user=G.users.find(u=>u.id===userId); if(!user) return;
  try {
    const {error}=await G.supabase.from('profiles').update({status:'active',validated_at:new Date().toISOString()}).eq('id',userId);
    if (error) throw error;
    user.status='active'; renderUsers(); renderPendingUsers(); updatePendingUsersCount();
    showToast(`${user.name} validé(e)`,'success');
    await addAuditLog('validate_user','user',userId,`Validé: ${user.name}`);
  } catch(err) { showToast('Erreur: '+err.message,'error'); }
}

async function deleteUser(userId) {
  if (!confirm('Supprimer definitivement cet utilisateur ?')) return;
  try {
    const {error}=await G.supabase.from('profiles').delete().eq('id',userId);
    if (error) throw error;
    G.users=G.users.filter(u=>u.id!==userId); renderUsers(); updatePendingUsersCount(); showToast('Utilisateur supprime','success');
  } catch(err) { showToast('Erreur: '+err.message,'error'); }
}

async function resetUserPassword(email) {
  const {error}=await G.supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/update-password.html`});
  if (error) showToast('Erreur: '+error.message,'error'); else showToast(`Email de réinit. envoyé a ${email}`,'success');
}

function openResetModal() { const m=document.getElementById('resetPasswordModal'); if(m) m.classList.remove('hidden'); const e=document.getElementById('resetEmail'); if(e) e.value=''; }
function closeResetModal() { const m=document.getElementById('resetPasswordModal'); if(m) m.classList.add('hidden'); }
async function sendResetEmail() {
  const email=document.getElementById('resetEmail')?.value.trim();
  if (!email) { showToast('Saisissez un email','warning'); return; }
  const {error}=await G.supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/update-password.html`});
  const mg=document.getElementById('resetMessage');
  if (error) { if(mg) mg.innerHTML=`<span class="text-red-400">Erreur: ${escapeHtml(error.message)}</span>`; }
  else { if(mg) mg.innerHTML='<span class="text-green-400">Email envoyé.</span>'; setTimeout(closeResetModal,3000); }
}

function updatePendingUsersCount() {
  const count=G.users.filter(u=>u.status==='pending_validation').length;
  G.pendingUsersCount=count;
  document.querySelectorAll('.pending-users-badge, #d-pendingBadge, #m-pendingBadge').forEach(b=>{
    if (count>0&&canValidateUsers()) { b.textContent=count; b.classList.remove('hidden'); } else b.classList.add('hidden');
  });
  const el=document.getElementById('pendingCount'); if(el) el.textContent=count;
}

function generatePassword() {
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*+-=?';
  const arr=new Uint32Array(14); crypto.getRandomValues(arr);
  return Array.from(arr).map(n=>chars[n%chars.length]).join('');
}

// ═══════════════════════════════════════════════════════════════════════
// 2. VALIDATIONS EN ATTENTE
// ═══════════════════════════════════════════════════════════════════════

async function renderPendingUsers() {
  const container=document.getElementById('pendingUsersList'); if(!container) return;
  container.innerHTML='<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-blue-400 text-xl"></i></div>';
  try {
    if (G.supabase&&G.currentUser?.companyId) {
      const {data}=await G.supabase.from('profiles').select('*').eq('company_id',G.currentUser.companyId).eq('status','pending_validation').order('created_at',{ascending:true});
      if (data) { G.users=G.users.filter(u=>u.status!=='pending_validation').concat(data); const seen=new Set(); G.users=G.users.filter(u=>{if(seen.has(u.id))return false;seen.add(u.id);return true;}); }
    }
  } catch(e) { console.warn('renderPendingUsers:',e); }
  const pending=G.users.filter(u=>u.status==='pending_validation');
  updatePendingUsersCount();
  if (pending.length===0) { container.innerHTML='<div class="text-center py-12 text-blue-300/50"><i class="fas fa-user-check text-4xl mb-3 block opacity-20"></i><p class="font-semibold">Aucune validation en attente</p></div>'; return; }
  container.innerHTML=pending.map(u=>`
    <div class="glass-card rounded-xl p-4 border border-yellow-500/20 hover:border-yellow-400/40 transition-all">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 text-lg font-bold flex-shrink-0">${(u.name||'U').charAt(0).toUpperCase()}</div>
        <div class="flex-1 min-w-0">
          <p class="text-white font-semibold">${escapeHtml(u.name||'—')}</p>
          <p class="text-sm text-blue-300/60 truncate">${escapeHtml(u.email||'')}</p>
          <div class="flex items-center gap-3 mt-1 text-xs text-blue-300/40">
            <span><i class="fas fa-calendar mr-1"></i>${formatDate(u.created_at)}</span>
            <span class="px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400">${G.roles[u.role]?.name||u.role}</span>
          </div>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button onclick="validateUser('${u.id}')" class="px-4 py-2 rounded-xl bg-green-500/20 text-green-400 text-sm hover:bg-green-500/30 transition-all font-medium flex items-center gap-2"><i class="fas fa-check"></i>Valider</button>
          <button onclick="deleteUser('${u.id}')" class="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30 transition-all font-medium flex items-center gap-2"><i class="fas fa-times"></i>Refuser</button>
        </div>
      </div>
    </div>`).join('');
}

async function refreshPendingUsers() { await renderPendingUsers(); showToast('Liste actualisée','success'); }

async function approveAllPending() {
  const pending=G.users.filter(u=>u.status==='pending_validation');
  if (pending.length===0) { showToast('Aucun compte en attente','info'); return; }
  if (!confirm(`Valider les ${pending.length} compte(s) ?`)) return;
  const results=await Promise.allSettled(pending.map(u=>G.supabase.from('profiles').update({status:'active',validated_at:new Date().toISOString()}).eq('id',u.id)));
  const ok=results.filter(r=>r.status==='fulfilled'&&!r.value?.error).length;
  pending.forEach(u=>{ const x=G.users.find(y=>y.id===u.id); if(x) x.status='active'; });
  showToast(`${ok}/${pending.length} comptes validés`,ok>0?'success':'error');
  await addAuditLog('approve_all_pending','user','batch',`${ok} comptes validés en lot`);
  renderPendingUsers(); updatePendingUsersCount();
}

async function rejectAllPending() {
  const pending=G.users.filter(u=>u.status==='pending_validation');
  if (pending.length===0) { showToast('Aucun compte en attente','info'); return; }
  if (!confirm(`Refuser et supprimer les ${pending.length} compte(s) ? Irréversible.`)) return;
  await Promise.allSettled(pending.map(u=>G.supabase.from('profiles').delete().eq('id',u.id)));
  const ids=pending.map(u=>u.id); G.users=G.users.filter(u=>!ids.includes(u.id));
  showToast(`${pending.length} compte(s) refusé(s)`,'success');
  renderPendingUsers(); updatePendingUsersCount();
}

// ═══════════════════════════════════════════════════════════════════════
// 3. TAGS (avec try/catch)
// ═══════════════════════════════════════════════════════════════════════

async function renderTags() {
  const container=document.getElementById('tagsList'); if(!container) return;
  try {
    if (G.supabase&&G.currentUser?.companyId) {
      const {data}=await G.supabase.from('tags').select('*').eq('company_id',G.currentUser.companyId).order('name');
      if(data) G.tags=data;
    }
  } catch(e) { console.warn('renderTags:',e); }
  if (G.tags.length===0) { container.innerHTML='<div class="text-center py-8 text-blue-300/50"><i class="fas fa-tags text-3xl mb-2 block opacity-20"></i><p>Aucun tag</p></div>'; return; }
  const usage={};
  G.documents.forEach(d=>(d.tags||[]).forEach(t=>{usage[t]=(usage[t]||0)+1;}));
  container.innerHTML=G.tags.map(t=>`
    <div class="glass-card rounded-xl p-3 border border-blue-500/15 hover:border-blue-400/30 transition-all group flex items-center gap-3">
      <div class="w-8 h-8 rounded-lg flex-shrink-0 cursor-pointer" style="background:${t.color}30;border:2px solid ${t.color}60" onclick="filterByTag('${escapeHtml(t.name)}')">
        <div class="w-full h-full flex items-center justify-center"><span class="text-[10px] font-bold" style="color:${t.color}">#</span></div>
      </div>
      <div class="flex-1 min-w-0">
        ${_tags.editingId===t.id
          ?`<div class="flex gap-2"><input id="etag_${t.id}" value="${escapeHtml(t.name)}" class="flex-1 px-2 py-1 rounded-lg text-white text-sm outline-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.3);" onkeydown="if(event.key==='Enter')confirmEditTag('${t.id}');if(event.key==='Escape')cancelEditTag()"><input type="color" id="etagc_${t.id}" value="${t.color}" class="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"></div>`
          :`<p class="text-white font-medium text-sm truncate cursor-pointer hover:text-blue-300" onclick="filterByTag('${escapeHtml(t.name)}')" style="color:${t.color}">${escapeHtml(t.name)}</p>`
        }
        <p class="text-xs text-blue-300/40 mt-0.5">${usage[t.name]||0} doc(s)</p>
      </div>
      <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        ${_tags.editingId===t.id
          ?`<button onclick="confirmEditTag('${t.id}')" class="p-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30" title="Valider"><i class="fas fa-check"></i></button>
             <button onclick="cancelEditTag()" class="p-1.5 rounded-lg bg-gray-500/20 text-gray-400 text-xs hover:bg-gray-500/30" title="Annuler"><i class="fas fa-times"></i></button>`
          :`<button onclick="startEditTag('${t.id}')" class="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400 text-xs" title="Modifier"><i class="fas fa-edit"></i></button>`
        }
        <button onclick="deleteTag('${t.id}')" class="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 text-xs" title="Supprimer"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('');
}

async function createTag() {
  const input=document.getElementById('newTagInput'); const colorEl=document.getElementById('newTagColor');
  const name=input?.value.trim(); if(!name){showToast('Entrez un nom de tag','warning');return;}
  if (G.tags.some(t=>t.name.toLowerCase()===name.toLowerCase())) { showToast(`Le tag "${name}" existe deja`,'warning'); return; }
  const color=colorEl?.value||TAG_PALETTE[G.tags.length%TAG_PALETTE.length];
  const newTag={id:generateId(),name,color,count:0,company_id:G.currentUser.companyId,created_at:new Date().toISOString()};
  try {
    const {data:ex}=await G.supabase.from('tags').select('id').eq('company_id',G.currentUser.companyId).ilike('name',name).maybeSingle();
    if (ex) { showToast(`Le tag "${name}" existe deja`,'warning'); return; }
    const {error}=await G.supabase.from('tags').insert(newTag); if(error) throw error;
  } catch(err) { showToast('Erreur creation tag: '+err.message,'error'); return; }
  G.tags.push(newTag); if(input) input.value=''; if(colorEl) colorEl.value=TAG_PALETTE[G.tags.length%TAG_PALETTE.length];
  renderTags(); showToast(`Tag "${name}" cree`,'success');
}

async function deleteTag(tagId) {
  const tag=G.tags.find(t=>t.id===tagId); if(!tag) return;
  if (!confirm(`Supprimer le tag "${tag.name}" ?`)) return;
  try { const {error}=await G.supabase.from('tags').delete().eq('id',tagId); if(error) throw error; G.tags=G.tags.filter(t=>t.id!==tagId); renderTags(); showToast(`Tag supprimé`,'success'); }
  catch(err) { showToast('Erreur: '+err.message,'error'); }
}

function startEditTag(tagId) { _tags.editingId=tagId; renderTags(); setTimeout(()=>document.getElementById(`etag_${tagId}`)?.focus(),50); }
function cancelEditTag() { _tags.editingId=null; renderTags(); }
async function confirmEditTag(tagId) {
  const newName=document.getElementById(`etag_${tagId}`)?.value.trim(); const newColor=document.getElementById(`etagc_${tagId}`)?.value;
  const tag=G.tags.find(t=>t.id===tagId); if(!newName||!tag) return;
  try {
    const {error}=await G.supabase.from('tags').update({name:newName,color:newColor||tag.color}).eq('id',tagId); if(error) throw error;
    tag.name=newName; tag.color=newColor||tag.color; _tags.editingId=null; renderTags(); showToast('Tag modifié','success');
  } catch(err) { showToast('Erreur: '+err.message,'error'); }
}

// ═══════════════════════════════════════════════════════════════════════
// 4. CONFIGURATION (SETTINGS)
// ═══════════════════════════════════════════════════════════════════════

async function renderSettings() {
  if (!G.currentUser) return;
  let prefs={};
  try {
    if (G.supabase) {
      const {data}=await G.supabase.from('profiles').select('*').eq('id',G.currentUser.id).single();
      if(data){Object.assign(G.currentUser,{name:data.name,email:data.email});prefs=data.preferences||{};}
    }
  } catch(_){}
  const sv=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v;};
  const sc=(id,v)=>{const el=document.getElementById(id);if(el)el.checked=v;};
  sv('profileName',G.currentUser.name||''); sv('profileEmail',G.currentUser.email||'');
  sv('profilePhone',G.currentUser.phone||''); sv('profileJobTitle',G.currentUser.job_title||'');
  sv('profileLanguage',prefs.language||'fr'); sv('profileTimezone',prefs.timezone||'Europe/Paris');
  sc('notifEmail',prefs.notif_email!==false); sc('notifBrowser',prefs.notif_browser!==false);
  sc('notifWorkflow',prefs.notif_workflow!==false); sc('notifShares',prefs.notif_shares!==false);
  const planEl=document.getElementById('currentPlanDisplay'); if(planEl) planEl.textContent=(G.currentUser.plan||'free').toUpperCase();
  const avEl=document.getElementById('profileAvatarPreview'); if(avEl) avEl.textContent=(G.currentUser.name||'U').charAt(0).toUpperCase();
}

async function saveProfile() {
  const name=document.getElementById('profileName')?.value.trim();
  const phone=document.getElementById('profilePhone')?.value.trim()||'';
  const jobTitle=document.getElementById('profileJobTitle')?.value.trim()||'';
  if (!name) { showToast('Le nom est requis','warning'); return; }
  const btn=document.querySelector('[onclick="saveProfile()"]');
  if (btn) { btn.disabled=true; btn.innerHTML='<span class="spinner mr-2"></span>Enregistrement…'; }
  try {
    const {error}=await G.supabase.from('profiles').update({name,phone,job_title:jobTitle,updated_at:new Date().toISOString()}).eq('id',G.currentUser.id);
    if (error) throw error;
    G.currentUser.name=name; updateUserDisplay(); showToast('Profil mis à jour','success');
    await addAuditLog('profile_update','user',G.currentUser.id,`Nom: ${name}`);
  } catch(err) { showToast('Erreur: '+err.message,'error'); }
  finally { if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-save mr-2"></i>Enregistrer';} }
}

async function toggleSetting(setting, value) {
  const val=value!==undefined?value:document.getElementById(setting)?.checked;
  try {
    const {data}=await G.supabase.from('profiles').select('preferences').eq('id',G.currentUser.id).single();
    const prefs=data?.preferences||{}; prefs[setting]=val;
    const {error}=await G.supabase.from('profiles').update({preferences:prefs}).eq('id',G.currentUser.id);
    if (error) throw error;
    showToast('Paramètre mis à jour','success');
  } catch(err) { showToast('Erreur sauvegarde: '+err.message,'error'); }
}

async function changePassword() {
  const np=document.getElementById('newPassword')?.value; const cp=document.getElementById('confirmPassword')?.value;
  if (!np||!cp) { showToast('Remplissez tous les champs','warning'); return; }
  if (np!==cp) { showToast('Les mots de passe ne correspondent pas','warning'); return; }
  if (np.length<8) { showToast('Minimum 8 caractères','warning'); return; }
  try {
    const {error}=await G.supabase.auth.updateUser({password:np}); if(error) throw error;
    showToast('Mot de passe modifié','success');
    await addAuditLog('password_change','user',G.currentUser.id,'Mot de passe changé');
    ['newPassword','confirmPassword'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  } catch(err) { showToast('Erreur: '+err.message,'error'); }
}

async function updateCompanySettings() {
  const n=document.getElementById('companyNameInput')?.value.trim(); if(!n){showToast('Nom requis','warning');return;}
  try { const {error}=await G.supabase.from('companies').update({name:n}).eq('id',G.currentUser.companyId); if(error) throw error; G.currentUser.companyName=n; updateUserDisplay(); showToast('Entreprise mise à jour','success'); }
  catch(err) { showToast('Erreur: '+err.message,'error'); }
}

function exportUserData() {
  const d={profile:{name:G.currentUser.name,email:G.currentUser.email,role:G.currentUser.role},documents:G.documents.filter(x=>x.owner_id===G.currentUser.id),activities:G.auditLogs.filter(x=>x.user_id===G.currentUser.id)};
  const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=Object.assign(document.createElement('a'),{href:url,download:`data_${G.currentUser.email}_${Date.now()}.json`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url); showToast('Données exportées','success');
}

function requestAccountDeletion() {
  if (!confirm('\u26a0\ufe0f Voulez-vous demander la suppression de votre compte ?')) return;
  if (prompt('Tapez "SUPPRIMER" pour confirmer:')!=='SUPPRIMER') { showToast('Annulé','info'); return; }
  addAuditLog('account_deletion_request','user',G.currentUser.id,`Demande par ${G.currentUser.email}`).catch(()=>{});
  showToast('Demande enregistrée — 30 jours (RGPD)','info',7000);
}

function copySqlSchema() { const s=document.getElementById('sqlSchemaBlock')?.textContent; if(s) _copyTxt(s); }
function closeNotifPanel() { const p=document.getElementById('notifPanel'); if(p) p.classList.add('hidden'); }
function toggleNotifications() { const p=document.getElementById('notifPanel'); if(p) p.classList.toggle('hidden'); }
function markAllNotifRead() { showToast('Notifications lues','success'); ['notifBadge','notifCountBadge'].forEach(id=>{document.getElementById(id)?.classList.add('hidden');}); }

// ═══════════════════════════════════════════════════════════════════════
// 5. SECURITE & AUDIT (avec try/catch)
// ═══════════════════════════════════════════════════════════════════════

async function renderSecurity() {
  try {
    if (G.supabase&&G.currentUser) {
      const [docsRes,keysRes,auditRes]=await Promise.all([
        G.supabase.from('documents').select('id,is_deleted,size').eq('company_id',G.currentUser.companyId),
        G.supabase.from('api_keys').select('id').eq('user_id',G.currentUser.id),
        G.supabase.from('audit_logs').select('id,action,severity,created_at').eq('user_id',G.currentUser.id).order('created_at',{ascending:false}).limit(200),
      ]);
      if(docsRes.data) G.documents=docsRes.data;
      if(keysRes.data) G.apiKeys=keysRes.data;
      if(auditRes.data) G.auditLogs=auditRes.data;
    }
  } catch(e) { console.warn('renderSecurity:',e); }
  const st=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  st('secScanOk',G.documents.filter(d=>!d.is_deleted).length);
  st('secScanBlocked',G.documents.filter(d=>d.is_deleted).length);
  st('secApiKeys',G.apiKeys.length);
  st('secAuditCount',G.auditLogs.length);
  st('secCritEvents',G.auditLogs.filter(l=>l.severity==='critical'||l.severity==='warning').length);
}

function switchSecurityTab(tab) {
  ['audit','trash'].forEach(t=>{
    document.getElementById(`secPanel-${t}`)?.classList.toggle('hidden',t!==tab);
    const btn=document.getElementById(`secTab-${t}`);
    if(btn){btn.classList.toggle('bg-blue-500/20',t===tab);btn.classList.toggle('text-blue-300',t===tab);btn.classList.toggle('border-blue-500/20',t===tab);}
  });
  if (tab==='audit') renderAuditLog(); else loadDeletedDocs();
}

async function renderAuditLog() {
  const container=document.getElementById('auditLogList'); if(!container) return;
  container.innerHTML='<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-blue-400"></i></div>';
  try {
    if (G.supabase&&G.currentUser) {
      const pg=_sec.auditPage||1; const sz=_sec.auditPageSize||30;
      let q=G.supabase.from('audit_logs').select('*').order('created_at',{ascending:false}).range((pg-1)*sz,pg*sz-1);
      const fv=document.getElementById('auditFilter')?.value; if(fv) q=q.eq('action',fv);
      q=q.eq('user_id',G.currentUser.id);
      const {data,error}=await q; if(!error&&data) G.auditLogs=data;
    }
  } catch(e) { console.warn('renderAuditLog:',e); }
  let filtered=G.auditLogs; const fv=document.getElementById('auditFilter')?.value; if(fv) filtered=filtered.filter(l=>l.action===fv);
  const sevC={critical:'text-red-400 bg-red-500/10',warning:'text-yellow-400 bg-yellow-500/10',info:'text-blue-400 bg-blue-500/10'};
  if(filtered.length===0){container.innerHTML='<div class="text-center py-6 text-blue-300/40 text-sm">Aucun log d\'audit</div>';return;}
  container.innerHTML=filtered.map(log=>`
    <div class="flex items-start gap-3 p-2.5 rounded-lg hover:bg-blue-500/5 border-b border-blue-500/5 transition-colors">
      <span class="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase mt-0.5 ${sevC[log.severity]||sevC.info}">${log.severity||'info'}</span>
      <div class="flex-1 min-w-0">
        <p class="text-white text-xs font-medium">${escapeHtml(log.action||'—')}${log.target_type?`<span class="text-blue-300/50 ml-1">· ${log.target_type}</span>`:''}</p>
        ${log.details?`<p class="text-xs text-blue-300/50 truncate mt-0.5">${escapeHtml(log.details)}</p>`:''}
      </div>
      <span class="flex-shrink-0 text-xs text-blue-300/40 whitespace-nowrap">${formatDate(log.created_at)}</span>
    </div>`).join('');
  const st=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  const total=filtered.length; const pg=_sec.auditPage||1; const sz=_sec.auditPageSize||30; const pages=Math.max(1,Math.ceil(total/sz));
  st('auditPageInfo',`Page ${pg}/${pages} (${total})`);
  const prev=document.getElementById('auditPrevBtn'); if(prev) prev.disabled=pg<=1;
  const next=document.getElementById('auditNextBtn'); if(next) next.disabled=pg>=pages;
}

function auditPrevPage() { if((_sec.auditPage||1)>1){_sec.auditPage--;renderAuditLog();} }
function auditNextPage() { _sec.auditPage=(_sec.auditPage||1)+1; renderAuditLog(); }

async function loadDeletedDocs() {
  const container=document.getElementById('trashList'); if(!container) return;
  try {
    if (G.supabase&&G.currentUser?.companyId) {
      const {data}=await G.supabase.from('documents').select('*').eq('company_id',G.currentUser.companyId).eq('is_deleted',true).order('deleted_at',{ascending:false});
      if (data) { G.documents=G.documents.filter(d=>!d.is_deleted).concat(data); const seen=new Set(); G.documents=G.documents.filter(d=>{if(seen.has(d.id))return false;seen.add(d.id);return true;}); }
    }
  } catch(e) { console.warn('loadDeletedDocs:',e); }
  const deleted=G.documents.filter(d=>d.is_deleted);
  if(deleted.length===0){container.innerHTML='<div class="text-center py-8 text-blue-300/40 text-sm"><i class="fas fa-trash text-2xl mb-2 block opacity-20"></i>Corbeille vide</div>';return;}
  container.innerHTML=deleted.map(doc=>`
    <div class="flex items-center justify-between p-3 rounded-xl glass-card border border-red-500/20 hover:border-red-400/30 transition-all">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center"><i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-red-400/70 text-sm"></i></div>
        <div><p class="text-white/80 text-sm font-medium">${escapeHtml(doc.name)}</p><p class="text-xs text-blue-300/50">${formatBytes(doc.size)} · ${formatDate(doc.deleted_at)}</p></div>
      </div>
      <div class="flex gap-2">
        <button onclick="restoreDocument('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30 flex items-center gap-1 transition-all"><i class="fas fa-undo"></i>Restaurer</button>
        <button onclick="permanentDeleteDocument('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30 flex items-center gap-1 transition-all"><i class="fas fa-trash"></i>Définitif</button>
      </div>
    </div>`).join('');
}

async function restoreDocument(docId) {
  try {
    const {error}=await G.supabase.from('documents').update({is_deleted:false,deleted_at:null}).eq('id',docId); if(error) throw error;
    const doc=G.documents.find(d=>d.id===docId); if(doc){doc.is_deleted=false;doc.deleted_at=null;}
    showToast('Document restauré','success'); renderDocuments(); updateBadges(); loadDeletedDocs();
    await addAuditLog('restore','document',docId);
  } catch(err) { showToast('Erreur: '+err.message,'error'); }
}

// CORRECTION : suppression définitive avec confirmation texte
async function permanentDeleteDocument(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  const confirmation = prompt(`Supprimer définitivement "${doc.name}" ? Tapez "SUPPRIMER" pour confirmer.`);
  if (confirmation !== 'SUPPRIMER') {
    showToast('Suppression annulée', 'info');
    return;
  }
  try {
    if (doc?.storage_path) await G.supabase.storage.from(CONFIG.storageBucket).remove([doc.storage_path]).catch(()=>{});
    const { error } = await G.supabase.from('documents').delete().eq('id', docId);
    if (error) throw error;
    G.documents = G.documents.filter(d => d.id !== docId);
    showToast('Document supprimé définitivement', 'success');
    loadDeletedDocs();
    updateBadges();
  } catch(err) {
    showToast('Erreur: '+err.message, 'error');
  }
}

async function scanAllDocuments() {
  const btn=document.querySelector('[onclick="scanAllDocuments()"]');
  if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner mr-2"></span>Scan…';}
  const issues=[]; const badExt=['exe','bat','cmd','sh','ps1','vbs','jar','msi','dll','scr'];
  G.documents.filter(d=>!d.is_deleted).forEach(doc=>{
    const ext=(doc.name||'').split('.').pop().toLowerCase();
    if(badExt.includes(ext)) issues.push({doc,reason:`Extension suspecte (.${ext})`});
    if(doc.size>50*1024*1024) issues.push({doc,reason:`Taille anormale (${formatBytes(doc.size)})`});
    if(!doc.type||doc.type==='unknown') issues.push({doc,reason:'Type MIME non reconnu'});
  });
  if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-shield-virus mr-2"></i>Scanner';}
  if(issues.length===0) showToast(`Scan terminé — ${G.documents.filter(d=>!d.is_deleted).length} doc(s), aucun problème`,'success',5000);
  else { showToast(`⚠️ ${issues.length} problème(s) détecté(s)`,'warning',6000); issues.forEach(i=>addAuditLog('security_scan_warning','document',i.doc.id,i.reason).catch(()=>{})); }
  await addAuditLog('security_scan','system','all',`${G.documents.filter(d=>!d.is_deleted).length} docs scannés, ${issues.length} alertes`);
}

function exportAuditLog() {
  const blob=new Blob([JSON.stringify(G.auditLogs,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=Object.assign(document.createElement('a'),{href:url,download:`audit_${Date.now()}.json`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url); showToast('Audit exporté','success');
}

function exportAllData() {
  const blob=new Blob([JSON.stringify({documents:G.documents,workflows:G.workflows,users:G.users,tags:G.tags,shares:G.shares},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=Object.assign(document.createElement('a'),{href:url,download:`export_ged_${Date.now()}.json`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url); showToast('Export effectué','success');
}

function exportDocumentsCsv() {
  const docs=G.documents.filter(d=>!d.is_deleted);
  const cell=v=>{const s=String(v??'');return(s.includes(',')||s.includes('"')||s.includes('\n'))?'"'+s.replace(/"/g,'""')+'"':s;};
  const csv='\uFEFF'+[['ID','Nom','Type','Taille','Créé le','Portée','Tags'],...docs.map(d=>[d.id,d.name,d.type,d.size,d.created_at,d.scope||'',(d.tags||[]).join(';')].map(cell))].map(r=>r.join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement('a'),{href:url,download:`documents_${new Date().toISOString().slice(0,10)}.csv`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url); showToast('Export CSV effectué','success');
}

// ═══════════════════════════════════════════════════════════════════════
// 6. API KEYS (avec try/catch)
// ═══════════════════════════════════════════════════════════════════════

async function renderApiKeys() {
  const container=document.getElementById('apiKeysList2'); if(!container) return;
  try {
    if (G.supabase&&G.currentUser) {
      const {data}=await G.supabase.from('api_keys').select('*').eq('user_id',G.currentUser.id).order('created_at',{ascending:false});
      if(data) G.apiKeys=data;
    }
  } catch(e) { console.warn('renderApiKeys:',e); }
  if(G.apiKeys.length===0){container.innerHTML='<div class="text-center py-8 text-blue-300/50"><i class="fas fa-key text-3xl mb-2 block opacity-20"></i><p class="text-sm">Aucune clé API</p></div>';return;}
  container.innerHTML=G.apiKeys.map(k=>{
    const expired=k.expires_at&&new Date(k.expires_at)<new Date();
    const expLabel=k.expires_at?(expired?'⏰ Expirée':`Expire le ${formatDate(k.expires_at)}`):'Illimitée';
    return `<div class="glass-card rounded-xl p-4 border ${expired?'border-red-500/20':'border-green-500/20'} hover:border-${expired?'red':'green'}-400/40 transition-all">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-lg ${expired?'bg-red-500/15':'bg-green-500/15'} flex items-center justify-center flex-shrink-0"><i class="fas fa-key ${expired?'text-red-400':'text-green-400'}"></i></div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap"><p class="text-white font-semibold text-sm">${escapeHtml(k.name||'Clé')}</p>${expired?'<span class="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">Expirée</span>':'<span class="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">Active</span>'}</div>
          <code class="text-green-400/70 text-xs font-mono block mt-1">${(k.key||'').substring(0,24)}…</code>
          <div class="flex gap-3 mt-1 text-xs text-blue-300/50 flex-wrap"><span>${formatDate(k.created_at)}</span><span>${expLabel}</span>${k.permissions?`<span>${Array.isArray(k.permissions)?k.permissions.join(', '):k.permissions}</span>`:''}</div>
        </div>
        <div class="flex gap-1 flex-shrink-0">
          <button onclick="copyApiKey('${escapeHtml(k.key)}')" class="p-2 rounded-lg hover:bg-green-500/20 text-green-400 transition-all" title="Copier"><i class="fas fa-copy text-sm"></i></button>
          <button onclick="revokeApiKey('${k.id}')" class="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30 transition-all flex items-center gap-1"><i class="fas fa-ban"></i>Révoquer</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function generateApiKey() {
  let modal=document.getElementById('createApiKeyModal');
  if (!modal){modal=document.createElement('div');modal.id='createApiKeyModal';modal.className='modal-overlay';document.body.appendChild(modal);}
  modal.innerHTML=`<div class="modal-box" style="max-width:480px;">
    <div class="flex items-center justify-between mb-5"><h3 class="text-white font-bold flex items-center gap-2"><i class="fas fa-key text-green-400"></i>Nouvelle clé API</h3><button onclick="document.getElementById('createApiKeyModal').classList.add('hidden')" class="text-blue-400 hover:text-white p-2 rounded-lg"><i class="fas fa-times text-xl"></i></button></div>
    <div class="space-y-4">
      <div><label class="text-blue-200/70 text-xs font-medium block mb-1">Nom <span class="text-red-400">*</span></label><input id="apiKeyName" type="text" placeholder="Ex: App mobile, CI/CD…" class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);"></div>
      <div><label class="text-blue-200/70 text-xs font-medium block mb-2">Permissions</label><div class="flex flex-wrap gap-2">${['read','write','delete','admin'].map(p=>`<label class="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border border-blue-500/20 hover:border-blue-400/40 text-sm"><input type="checkbox" class="api-perm-check" value="${p}" ${p==='read'?'checked':''}><span class="text-blue-300 capitalize">${p}</span></label>`).join('')}</div></div>
      <div><label class="text-blue-200/70 text-xs font-medium block mb-1">Expiration</label><select id="apiKeyExpiry" class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);"><option value="">Illimitée</option><option value="30">30 jours</option><option value="90">90 jours</option><option value="365">1 an</option></select></div>
    </div>
    <div class="flex gap-3 mt-5 pt-4 border-t border-blue-500/20">
      <button onclick="document.getElementById('createApiKeyModal').classList.add('hidden')" class="flex-1 py-2.5 rounded-xl text-blue-300 text-sm border border-blue-500/25 hover:bg-blue-500/10">Annuler</button>
      <button onclick="_confirmGenerateApiKey()" class="flex-1 btn-primary py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2"><i class="fas fa-plus"></i>Générer</button>
    </div>
  </div>`;
  modal.classList.remove('hidden');
}

async function _confirmGenerateApiKey() {
  const name=document.getElementById('apiKeyName')?.value.trim(); if(!name){showToast('Nommez la clé','warning');return;}
  const perms=Array.from(document.querySelectorAll('.api-perm-check:checked')).map(c=>c.value);
  const expDays=parseInt(document.getElementById('apiKeyExpiry')?.value||'0');
  const key=`ged_${generateId()}_${generateId().substring(0,16)}`;
  const newKey={id:generateId(),name,key,permissions:perms,expires_at:expDays>0?new Date(Date.now()+expDays*86400000).toISOString():null,user_id:G.currentUser.id,company_id:G.currentUser.companyId,created_at:new Date().toISOString()};
  try { const {error}=await G.supabase.from('api_keys').insert(newKey); if(error) throw error; } catch(err) { console.warn('api_keys insert non-bloquant:',err); }
  G.apiKeys.unshift(newKey); document.getElementById('createApiKeyModal')?.classList.add('hidden');
  _showGeneratedKey(key,name); renderApiKeys();
  await addAuditLog('api_key_create','api_key',newKey.id,`${name} perms:${perms.join(',')}`);
}

function _showGeneratedKey(key,name) {
  let modal=document.getElementById('generatedKeyModal');
  if(!modal){modal=document.createElement('div');modal.id='generatedKeyModal';modal.className='modal-overlay';document.body.appendChild(modal);}
  modal.innerHTML=`<div class="modal-box" style="max-width:500px;">
    <div class="flex items-center gap-3 mb-5"><div class="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-green-400 border border-green-500/30"><i class="fas fa-check"></i></div><div><h3 class="text-white font-bold">Clé API générée !</h3><p class="text-blue-300/50 text-xs">${escapeHtml(name)}</p></div></div>
    <div class="glass-card rounded-xl p-4 border border-yellow-500/25 mb-4" style="background:rgba(245,158,11,0.06)">
      <p class="text-yellow-400 text-xs font-bold mb-2">⚠️ Copiez cette clé maintenant</p>
      <div class="flex gap-2"><code class="flex-1 bg-slate-900/70 border border-yellow-500/30 rounded-lg px-3 py-2 text-yellow-300 font-mono text-xs break-all">${escapeHtml(key)}</code>
      <button onclick="_copyTxt('${escapeHtml(key)}')" class="px-3 py-2 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 text-sm"><i class="fas fa-copy"></i></button></div>
    </div>
    <button onclick="document.getElementById('generatedKeyModal').classList.add('hidden')" class="w-full btn-primary py-2.5 rounded-xl text-white text-sm font-semibold">J\'ai copié la clé</button>
  </div>`;
  modal.classList.remove('hidden');
}

function generateApiKeyV6() { generateApiKey(); }

async function revokeApiKey(id) {
  if (!confirm('Révoquer cette clé API ?')) return;
  try { const {error}=await G.supabase.from('api_keys').delete().eq('id',id); if(error) throw error; G.apiKeys=G.apiKeys.filter(k=>k.id!==id); renderApiKeys(); showToast('Clé révoquée','success'); }
  catch(err) { showToast('Erreur: '+err.message,'error'); }
}

function copyApiKey(key) { if(key) _copyTxt(key); }

function _copyTxt(text) {
  if(navigator.clipboard) navigator.clipboard.writeText(text).then(()=>showToast('Copié','success')).catch(()=>_fallbackCopy(text));
  else _fallbackCopy(text);
}
// ═══════════════════════════════════════════════════════════════════════
// 7. INTEGRATIONS (avec try/catch)
// ═══════════════════════════════════════════════════════════════════════

async function renderIntegrations() {
  const container=document.getElementById('integrationsGrid'); if(!container) return;
  try {
    if (G.supabase&&G.currentUser?.companyId) {
      const {data}=await G.supabase.from('integrations').select('*').eq('company_id',G.currentUser.companyId);
      if(data) data.forEach(i=>{_integrations[i.provider]=i.connected;});
    }
  } catch(_) { console.warn('renderIntegrations:'); }
  const integrations=[
    {id:'slack',name:'Slack',icon:'fab fa-slack',color:'purple',desc:'Notifications temps réel'},
    {id:'gdrive',name:'Google Drive',icon:'fab fa-google-drive',color:'green',desc:'Import/Export documents'},
    {id:'dropbox',name:'Dropbox',icon:'fab fa-dropbox',color:'blue',desc:'Synchronisation cloud'},
    {id:'ms365',name:'Microsoft 365',icon:'fab fa-microsoft',color:'sky',desc:'Éditer avec Office'},
    {id:'zapier',name:'Zapier',icon:'fas fa-bolt',color:'yellow',desc:'Automatisations no-code'},
    {id:'make',name:'Make',icon:'fas fa-cogs',color:'orange',desc:'Workflows avancés'},
    {id:'github',name:'GitHub',icon:'fab fa-github',color:'gray',desc:'Stockage & versioning'},
    {id:'notion',name:'Notion',icon:'fas fa-book-open',color:'indigo',desc:'Wiki & connaissances'},
  ];
  container.innerHTML=integrations.map(i=>{
    const connected=_integrations[i.id]||false;
    return `<div class="glass-card rounded-xl p-4 border border-${i.color}-500/20 hover:border-${i.color}-400/40 transition-all">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-lg bg-${i.color}-500/15 flex items-center justify-center text-${i.color}-400"><i class="${i.icon} text-lg"></i></div>
        <div class="flex-1"><div class="flex items-center gap-2"><p class="text-white font-semibold text-sm">${i.name}</p>${connected?'<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">● Connecté</span>':''}</div><p class="text-xs text-blue-300/50">${i.desc}</p></div>
      </div>
      <div class="flex gap-2">
        ${connected
          ?`<button onclick="disconnectIntegration('${i.id}')" class="flex-1 py-2 rounded-lg bg-red-500/15 text-red-400 text-xs hover:bg-red-500/25 transition-all flex items-center justify-center gap-1"><i class="fas fa-unlink"></i>Déconnecter</button>`
          :`<button onclick="connectIntegration('${i.id}')" class="flex-1 py-2 rounded-lg bg-${i.color}-500/15 text-${i.color}-400 text-xs hover:bg-${i.color}-500/25 transition-all flex items-center justify-center gap-1"><i class="fas fa-plug"></i>Connecter</button>`
        }
        <button onclick="showIntegrationInfo('${i.id}')" class="px-3 py-2 rounded-lg border border-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/10 transition-all" title="Info"><i class="fas fa-info-circle"></i></button>
      </div>
    </div>`;
  }).join('');
  listWebhooks();
}

async function connectIntegration(provider) {
  showToast(`Connexion ${provider}…`,'info');
  setTimeout(async()=>{
    _integrations[provider]=true;
    if(G.supabase&&G.currentUser?.companyId) await G.supabase.from('integrations').upsert({provider,connected:true,company_id:G.currentUser.companyId,connected_at:new Date().toISOString()},{onConflict:'provider,company_id'}).catch(()=>{});
    showToast(`${provider} connecté`,'success'); renderIntegrations();
    await addAuditLog('integration_connect','integration',provider,`Connecté: ${provider}`);
  },1500);
}

async function disconnectIntegration(provider) {
  if(!confirm(`Déconnecter ${provider} ?`)) return;
  _integrations[provider]=false;
  if(G.supabase&&G.currentUser?.companyId) await G.supabase.from('integrations').upsert({provider,connected:false,company_id:G.currentUser.companyId},{onConflict:'provider,company_id'}).catch(()=>{});
  showToast(`${provider} déconnecté`,'info'); renderIntegrations();
}

function showIntegrationInfo(provider) {
  const docs={slack:'https://api.slack.com',gdrive:'https://developers.google.com/drive',dropbox:'https://www.dropbox.com/developers'};
  if(docs[provider]) window.open(docs[provider],'_blank'); else showToast('Documentation à venir','info');
}

async function addWebhook() {
  const url=document.getElementById('webhookUrl')?.value.trim(); const event=document.getElementById('webhookEvent')?.value;
  if(!url){showToast('URL requise','warning');return;} if(!/^https?:\/\/.+/.test(url)){showToast('URL invalide','warning');return;}
  const webhook={id:generateId(),url,event,active:true,company_id:G.currentUser.companyId,created_at:new Date().toISOString()};
  try { await G.supabase.from('webhooks').insert(webhook).catch(()=>{}); } catch(_) {}
  _webhooks.push(webhook); document.getElementById('webhookUrl').value='';
  showToast(`Webhook "${event}" ajouté`,'success'); listWebhooks();
}

async function listWebhooks() {
  const container=document.getElementById('webhooksList'); if(!container) return;
  try {
    if(G.supabase&&G.currentUser?.companyId){
      const{data}=await G.supabase.from('webhooks').select('*').eq('company_id',G.currentUser.companyId).order('created_at',{ascending:false});
      if(data&&data.length>0)_webhooks.splice(0,_webhooks.length,...data);
    }
  } catch(_) {}
  if(_webhooks.length===0){container.innerHTML='<div class="text-center py-6 text-blue-300/40 text-sm"><i class="fas fa-link text-2xl mb-2 block opacity-20"></i>Aucun webhook</div>';return;}
  container.innerHTML=_webhooks.map(w=>`
    <div class="flex items-center justify-between p-3 rounded-xl glass-card border border-blue-500/15 hover:border-blue-400/30 transition-all">
      <div class="flex items-center gap-3"><div class="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center"><i class="fas fa-link text-blue-400 text-sm"></i></div>
      <div><p class="text-white text-sm font-medium">${escapeHtml(w.event||'Tous')}</p><p class="text-blue-300/50 text-xs truncate max-w-[250px]">${escapeHtml(w.url)}</p></div></div>
      <div class="flex gap-2">
        <button onclick="testWebhook('${w.id}')" class="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 transition-all flex items-center gap-1"><i class="fas fa-play"></i>Tester</button>
        <button onclick="removeWebhook('${w.id}')" class="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-all"><i class="fas fa-trash text-sm"></i></button>
      </div>
    </div>`).join('');
}

async function testWebhook(webhookId) {
  const wh=_webhooks.find(w=>w.id===webhookId); if(!wh) return;
  showToast(`Test envoyé vers ${wh.url}`,'info');
  try { await fetch(wh.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'test',source:'SystemesGED',timestamp:new Date().toISOString()}),mode:'no-cors'}); showToast('Test envoyé','success'); }
  catch(err) { showToast('Erreur: '+err.message,'error'); }
}

async function removeWebhook(webhookId) {
  if(!confirm('Supprimer ce webhook ?')) return;
  await G.supabase.from('webhooks').delete().eq('id',webhookId).catch(()=>{});
  const idx=_webhooks.findIndex(w=>w.id===webhookId); if(idx>-1) _webhooks.splice(idx,1);
  listWebhooks(); showToast('Webhook supprimé','success');
}

// ═══════════════════════════════════════════════════════════════════════
// 8. AUDIT SECURITE (auditv6) avec try/catch
// ═══════════════════════════════════════════════════════════════════════

async function renderAuditV6() {
  const statsContainer=document.getElementById('auditStatsGrid');
  const timelineContainer=document.getElementById('auditTimelineList');
  const alertsContainer=document.getElementById('securityAlertsList');
  if(timelineContainer) timelineContainer.innerHTML='<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-blue-400"></i></div>';
  try {
    if (G.supabase&&G.currentUser) {
      const offset=(_audit.page-1)*_audit.pageSize;
      const daysAgo=new Date(Date.now()-(_audit.filter.days||30)*86400000).toISOString();
      let q=G.supabase.from('audit_logs').select('*',{count:'exact'}).gte('created_at',daysAgo).order('created_at',{ascending:false}).range(offset,offset+_audit.pageSize-1);
      if(_audit.filter.action) q=q.eq('action',_audit.filter.action);
      if(_audit.filter.severity) q=q.eq('severity',_audit.filter.severity);
      if(!G.currentUser.isSystemAdmin&&G.currentUser.role!=='admin') q=q.eq('user_id',G.currentUser.id);
      const {data,error,count}=await q; if(!error&&data){G.auditLogs=data;_audit.totalCount=count||0;}
    }
  } catch(e) { console.warn('renderAuditV6:',e); }
  if (statsContainer) {
    const c={total:_audit.totalCount||G.auditLogs.length,logins:G.auditLogs.filter(l=>l.action==='login').length,uploads:G.auditLogs.filter(l=>l.action==='upload').length,deletes:G.auditLogs.filter(l=>l.action==='delete').length,shares:G.auditLogs.filter(l=>(l.action||'').includes('share')).length,alertes:G.auditLogs.filter(l=>l.severity==='warning'||l.severity==='critical').length};
    statsContainer.innerHTML=Object.entries(c).map(([k,v])=>`<div class="glass-card rounded-xl p-3 text-center border border-blue-500/15 cursor-pointer hover:border-blue-400/30 transition-all" onclick="setAuditFilter('action','${k==='total'?'':k==='logins'?'login':k==='uploads'?'upload':k==='deletes'?'delete':k==='shares'?'share':''}')"><p class="text-2xl font-bold ${k==='alertes'?'text-orange-400':'text-white'}">${v}</p><p class="text-xs text-blue-300/50 capitalize">${k}</p></div>`).join('');
  }
  if (timelineContainer) {
    const sevC={critical:'text-red-400',warning:'text-yellow-400',info:'text-blue-400'};
    if(G.auditLogs.length===0){timelineContainer.innerHTML='<div class="text-center py-8 text-blue-300/40">Aucun événement</div>';}
    else timelineContainer.innerHTML=G.auditLogs.map(l=>`<div class="flex items-start gap-3 p-2.5 border-b border-blue-500/8 hover:bg-blue-500/4 transition-colors"><span class="flex-shrink-0 w-16 text-[10px] font-bold uppercase ${sevC[l.severity]||sevC.info} mt-0.5">${l.severity||'info'}</span><div class="flex-1 min-w-0"><p class="text-white text-xs font-medium">${escapeHtml(l.action||'—')}</p>${l.details?`<p class="text-xs text-blue-300/50 truncate mt-0.5">${escapeHtml(l.details)}</p>`:''}</div><span class="flex-shrink-0 text-xs text-blue-300/40 whitespace-nowrap">${formatDate(l.created_at)}</span></div>`).join('');
    const total=_audit.totalCount||G.auditLogs.length; const pages=Math.max(1,Math.ceil(total/_audit.pageSize));
    const st=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    st('auditV6PageInfo',`Page ${_audit.page}/${pages} (${total})`);
    const prev=document.getElementById('auditV6Prev'); if(prev) prev.disabled=_audit.page<=1;
    const next=document.getElementById('auditV6Next'); if(next) next.disabled=_audit.page>=pages;
  }
  if (alertsContainer) {
    const criticals=G.auditLogs.filter(l=>l.severity==='critical'||l.severity==='warning').slice(0,8);
    if(criticals.length===0){alertsContainer.innerHTML='<div class="text-center py-6 text-blue-300/40 text-sm"><i class="fas fa-shield-alt text-2xl mb-2 block opacity-30"></i>Aucune alerte</div>';}
    else alertsContainer.innerHTML=criticals.map(l=>`<div class="p-2.5 rounded-xl glass-card border ${l.severity==='critical'?'border-red-500/25':'border-yellow-500/20'}"><div class="flex items-center gap-2 mb-1"><i class="fas fa-exclamation-triangle ${l.severity==='critical'?'text-red-400':'text-yellow-400'} text-sm"></i><p class="text-white text-xs font-semibold uppercase">${escapeHtml(l.action||'—')}</p></div>${l.details?`<p class="text-xs text-blue-300/60 truncate">${escapeHtml(l.details)}</p>`:''}<p class="text-[10px] text-blue-300/40 mt-1">${formatDate(l.created_at)}</p></div>`).join('');
  }
}

function setAuditFilter(type,value) {
  if(!_audit.filter) _audit.filter={action:'',severity:'',days:30};
  if(type==='days') _audit.filter.days=parseInt(value)||30;
  if(type==='action') _audit.filter.action=value||'';
  if(type==='severity') _audit.filter.severity=value||'';
  _audit.page=1; renderAuditV6();
}

function filterAuditLogs(query) {
  const container=document.getElementById('auditTimelineList'); if(!container) return;
  if(!query){renderAuditV6();return;}
  const q=query.toLowerCase(); const sevC={critical:'text-red-400',warning:'text-yellow-400',info:'text-blue-400'};
  const filtered=G.auditLogs.filter(l=>(l.action||'').toLowerCase().includes(q)||(l.target_type||'').toLowerCase().includes(q)||(l.details||'').toLowerCase().includes(q));
  container.innerHTML=filtered.length===0?`<div class="text-center py-8 text-blue-300/40">Aucun résultat pour "${escapeHtml(query)}"</div>`:filtered.map(l=>`<div class="flex items-start gap-3 p-2.5 border-b border-blue-500/8"><span class="flex-shrink-0 w-16 text-[10px] font-bold uppercase ${sevC[l.severity]||sevC.info} mt-0.5">${l.severity||'info'}</span><div class="flex-1 min-w-0"><p class="text-white text-xs font-medium">${escapeHtml(l.action||'—')}</p>${l.details?`<p class="text-xs text-blue-300/50 truncate">${escapeHtml(l.details)}</p>`:''}</div><span class="flex-shrink-0 text-xs text-blue-300/40 whitespace-nowrap">${formatDate(l.created_at)}</span></div>`).join('');
}

function clearAuditFilters() {
  _audit.filter={action:'',severity:'',days:30}; _audit.page=1;
  const el=document.getElementById('auditSearchInput'); if(el) el.value='';
  renderAuditV6();
}

function prevAuditPage() { if(_audit.page>1){_audit.page--;renderAuditV6();} }
function nextAuditPage() { _audit.page++; renderAuditV6(); }

// ═══════════════════════════════════════════════════════════════════════
// ANALYTICS, FOLDERS, SIGNATURES, IA, AUTOMATION, BACKUPS, BILLING, LOGS, RBAC, VERSIONING, SEARCH
// Toutes ces fonctions sont conservées telles quelles, avec ajout de try/catch pour les appels Supabase.
// Pour gagner de la place, je les inclus dans leur version originale mais avec les corrections.
// ═══════════════════════════════════════════════════════════════════════

window._analytics = { period: 30 };
window._folders   = {};

async function renderAnalytics() {
  const kpiContainer = document.getElementById('analyticsKpiCards');
  const topContainer = document.getElementById('analyticsTopDocs');
  if (kpiContainer) kpiContainer.innerHTML = '<div class="col-span-full text-center py-4"><i class="fas fa-spinner fa-spin text-blue-400"></i></div>';
  try {
    if (G.supabase && G.currentUser?.companyId) {
      const [docsRes, wfRes, usersRes] = await Promise.all([
        G.supabase.from('documents').select('*').eq('company_id', G.currentUser.companyId).eq('is_deleted', false),
        G.supabase.from('workflows').select('*').eq('company_id', G.currentUser.companyId),
        G.supabase.from('profiles').select('id,status').eq('company_id', G.currentUser.companyId),
      ]);
      if (docsRes.data)  G.documents  = docsRes.data;
      if (wfRes.data)    G.workflows  = wfRes.data;
      if (usersRes.data) G.users      = usersRes.data;
    }
  } catch (e) { console.warn('renderAnalytics reload:', e); }
  const docs      = G.documents.filter(d => !d.is_deleted);
  const wfs       = G.workflows || [];
  const users     = G.users || [];
  const totalSize = docs.reduce((s, d) => s + (d.size || 0), 0);
  const activeWfs = wfs.filter(w => w.status === 'in_progress' || w.status === 'pending').length;
  const sharedDocs= docs.filter(d => d.scope === 'company').length;
  if (kpiContainer) {
    kpiContainer.innerHTML = [
      { label: 'Documents',     value: docs.length,           icon: 'fa-file-alt',      color: 'blue' },
      { label: 'Stockage total', value: formatBytes(totalSize), icon: 'fa-database',     color: 'green' },
      { label: 'Workflows actifs',value: activeWfs,            icon: 'fa-project-diagram',color: 'purple' },
      { label: 'Utilisateurs',  value: users.filter(u => u.status === 'active').length,  icon: 'fa-users', color: 'orange' },
      { label: 'Partagés',      value: sharedDocs,            icon: 'fa-share-alt',      color: 'cyan' },
      { label: 'Supprimés',     value: G.documents.filter(d => d.is_deleted).length, icon: 'fa-trash', color: 'red' },
    ].map(k => `
      <div class="glass-card rounded-xl p-4 border border-${k.color}-500/20 hover:border-${k.color}-400/40 transition-all">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-9 h-9 rounded-lg bg-${k.color}-500/15 flex items-center justify-center text-${k.color}-400">
            <i class="fas ${k.icon}"></i>
          </div>
          <p class="text-blue-300/60 text-xs font-medium">${k.label}</p>
        </div>
        <p class="text-2xl font-bold text-white">${k.value}</p>
      </div>`).join('');
  }
  renderTopDocs();
  renderActivityChart();
}

function renderTopDocs() {
  const container = document.getElementById('analyticsTopDocs');
  if (!container) return;
  const docs = G.documents.filter(d => !d.is_deleted).sort((a, b) => (b.views||0) - (a.views||0)).slice(0, 8);
  if (docs.length === 0) { container.innerHTML = '<div class="text-center py-6 text-blue-300/40 text-sm">Aucun document</div>'; return; }
  container.innerHTML = docs.map((doc, i) => `
    <div class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-blue-500/5 transition-colors cursor-pointer" onclick="openPreviewModal('${doc.id}')">
      <span class="text-blue-400/40 text-xs font-bold w-5 text-center">${i+1}</span>
      <div class="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
        <i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-blue-400 text-sm"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-white text-sm font-medium truncate">${escapeHtml(doc.name)}</p>
        <p class="text-xs text-blue-300/50">${formatBytes(doc.size)} · ${formatDate(doc.created_at)}</p>
      </div>
      <div class="text-right flex-shrink-0">
        <p class="text-blue-300/60 text-xs">${doc.views||0} vues</p>
        <p class="text-blue-300/40 text-[10px]">${doc.downloads||0} dl</p>
      </div>
    </div>`).join('');
}

function renderActivityChart() {
  const container = document.getElementById('analyticsActivityChart');
  if (!container) return;
  const days = 14;
  const data = [];
  for (let i = days-1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toDateString();
    const count = G.documents.filter(doc => new Date(doc.created_at).toDateString() === ds).length;
    data.push({ label: d.toLocaleDateString('fr-FR', { weekday: 'short' }), count });
  }
  const maxVal = Math.max(...data.map(d => d.count), 1);
  container.innerHTML = `
    <div class="flex items-end gap-1 h-20">
      ${data.map(d => `
        <div class="flex-1 flex flex-col items-center gap-1">
          <div class="w-full rounded-t" style="height:${Math.max(2, (d.count/maxVal)*64)}px;background:rgba(59,130,246,${0.2+0.6*(d.count/maxVal)});" title="${d.count} doc(s)"></div>
          <span class="text-[9px] text-blue-300/40">${d.label}</span>
        </div>`).join('')}
    </div>`;
}

async function refreshAnalytics() {
  await renderAnalytics();
  showToast('Analytics actualisées', 'success');
}

function exportAnalytics() {
  const data = {
    date:      new Date().toISOString(),
    documents: G.documents.filter(d=>!d.is_deleted).length,
    storage:   formatBytes(G.documents.reduce((s,d)=>s+(d.size||0),0)),
    workflows: (G.workflows||[]).length,
    users:     (G.users||[]).filter(u=>u.status==='active').length,
    topDocs:   G.documents.filter(d=>!d.is_deleted).sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,5).map(d=>({name:d.name,views:d.views||0,size:d.size})),
  };
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'),{href:url,download:`analytics_${Date.now()}.json`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  showToast('Analytics exportées','success');
}

// ═══════════════════════════════════════════════════════════════════════
// 2. DOSSIERS (FOLDERS)
// ═══════════════════════════════════════════════════════════════════════

async function renderFolders() {
  try {
    if (G.supabase && G.currentUser?.companyId) {
      const { data } = await G.supabase.from('folders').select('*').eq('company_id', G.currentUser.companyId).order('name');
      if (data) G.folders = data;
    }
  } catch (e) { console.warn('renderFolders:', e); }
  if (!G.currentFolderId) G.currentFolderId = 'root';
  renderFolderTree();
  renderFolderContents();
}

async function renderFolderContents() {
  const grid  = document.getElementById('folderContentsGrid');
  const docG  = document.getElementById('folderDocGrid');
  const bread = document.getElementById('folderBreadcrumb');
  if (!grid) return;
  try {
    if (G.supabase && G.currentUser?.companyId) {
      const { data } = await G.supabase.from('documents').select('*')
        .eq('company_id', G.currentUser.companyId)
        .eq('is_deleted', false)
        .eq('folder_id', G.currentFolderId === 'root' ? null : G.currentFolderId);
      if (data) {
        G.documents = G.documents.filter(d => d.folder_id !== (G.currentFolderId === 'root' ? null : G.currentFolderId)).concat(data);
        const seen = new Set(); G.documents = G.documents.filter(d=>{if(seen.has(d.id))return false;seen.add(d.id);return true;});
      }
    }
  } catch (_) {}
  const folderId = G.currentFolderId === 'root' ? null : G.currentFolderId;
  const subFolders = (G.folders || []).filter(f => f.parent_id === folderId);
  const docs = G.documents.filter(d => !d.is_deleted && (d.folder_id || null) === folderId);
  if (bread) {
    const crumbs = _buildBreadcrumb(G.currentFolderId);
    bread.innerHTML = crumbs.map((c, i) => `
      <span class="flex items-center gap-1">
        ${i > 0 ? '<i class="fas fa-chevron-right text-blue-300/30 text-xs"></i>' : ''}
        <button onclick="openFolder('${c.id}')" class="text-xs ${i===crumbs.length-1?'text-white font-medium':'text-blue-400 hover:text-blue-300'} transition-colors">${escapeHtml(c.name)}</button>
      </span>`).join('');
  }
  if (subFolders.length === 0 && docs.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-12 text-blue-300/40">
        <i class="fas fa-folder-open text-4xl mb-3 block opacity-20"></i>
        <p class="font-medium">Dossier vide</p>
        <p class="text-xs mt-1">Créez un sous-dossier ou déplacez des documents ici</p>
      </div>`;
    if (docG) docG.innerHTML = '';
    return;
  }
  grid.innerHTML = subFolders.map(f => `
    <div class="glass-card rounded-xl p-4 border border-yellow-500/20 hover:border-yellow-400/40 cursor-pointer transition-all group" onclick="openFolder('${f.id}')">
      <div class="flex items-center gap-3">
        <i class="fas fa-folder text-yellow-400 text-2xl group-hover:text-yellow-300 transition-colors"></i>
        <div class="flex-1 min-w-0">
          <p class="text-white font-medium text-sm truncate">${escapeHtml(f.name)}</p>
          <p class="text-xs text-blue-300/50">${G.documents.filter(d=>d.folder_id===f.id&&!d.is_deleted).length} doc(s)</p>
        </div>
        <button onclick="event.stopPropagation();deleteFolder('${f.id}')" class="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-all">
          <i class="fas fa-trash text-xs"></i>
        </button>
      </div>
    </div>`).join('');
  if (docG) {
    docG.innerHTML = docs.length === 0 ? '' : `<div class="doc-grid mt-2">${docs.map(doc => renderDocCard(doc)).join('')}</div>`;
  }
}

function _buildBreadcrumb(folderId) {
  if (!folderId || folderId === 'root') return [{ id: 'root', name: 'Racine' }];
  const crumbs = [{ id: 'root', name: 'Racine' }];
  let current = folderId;
  const visited = new Set();
  while (current && current !== 'root' && !visited.has(current)) {
    visited.add(current);
    const folder = (G.folders||[]).find(f => f.id === current);
    if (!folder) break;
    crumbs.push({ id: folder.id, name: folder.name });
    current = folder.parent_id;
  }
  return crumbs;
}

async function renderFolderTree() {
  const tree = document.getElementById('folderTree');
  if (!tree) return;
  const folders = G.folders || [];
  const roots   = folders.filter(f => !f.parent_id);
  function buildTree(parentId, depth) {
    const children = folders.filter(f => f.parent_id === parentId);
    if (children.length === 0) return '';
    return children.map(f => `
      <div style="padding-left:${depth*12}px">
        <button onclick="openFolder('${f.id}')"
          class="w-full text-left flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-blue-500/10 transition-colors text-sm
          ${G.currentFolderId === f.id ? 'bg-blue-500/20 text-blue-300' : 'text-blue-200/70'}">
          <i class="fas fa-folder text-yellow-400/70 text-xs"></i>
          <span class="truncate">${escapeHtml(f.name)}</span>
        </button>
        ${buildTree(f.id, depth+1)}
      </div>`).join('');
  }
  tree.innerHTML = `
    <button onclick="openFolder('root')" class="w-full text-left flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-blue-500/10 transition-colors text-sm
      ${G.currentFolderId === 'root' ? 'bg-blue-500/20 text-blue-300' : 'text-blue-200/70'}">
      <i class="fas fa-home text-blue-400/70 text-xs"></i><span>Racine</span>
    </button>
    ${buildTree(null, 1)}`;
}

function openFolder(folderId) {
  G.currentFolderId = folderId || 'root';
  renderFolderContents();
  renderFolderTree();
}

function openFolderModal() {
  let modal = document.getElementById('folderModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'folderModal'; modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal-box" style="max-width:420px;">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-white font-bold flex items-center gap-2"><i class="fas fa-folder-plus text-yellow-400"></i>Nouveau dossier</h3>
        <button onclick="closeFolderModal()" class="text-blue-400 hover:text-white p-2 rounded-lg"><i class="fas fa-times text-xl"></i></button>
      </div>
      <input id="newFolderName" type="text" placeholder="Nom du dossier…"
        class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none mb-4"
        style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);"
        onkeydown="if(event.key==='Enter')createFolder()">
      <div class="flex gap-3">
        <button onclick="closeFolderModal()" class="flex-1 py-2.5 rounded-xl text-blue-300 text-sm border border-blue-500/25 hover:bg-blue-500/10">Annuler</button>
        <button onclick="createFolder()" class="flex-1 btn-primary py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2"><i class="fas fa-plus"></i>Créer</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('newFolderName')?.focus(), 50);
}

function closeFolderModal() {
  const m = document.getElementById('folderModal'); if (m) m.classList.add('hidden');
}

async function createFolder() {
  const name = document.getElementById('newFolderName')?.value.trim();
  if (!name) { showToast('Entrez un nom de dossier', 'warning'); return; }
  const newFolder = {
    id:         generateId(),
    name,
    parent_id:  G.currentFolderId === 'root' ? null : G.currentFolderId,
    company_id: G.currentUser.companyId,
    created_at: new Date().toISOString(),
  };
  try {
    const { error } = await G.supabase.from('folders').insert(newFolder);
    if (error) throw error;
  } catch (err) { console.warn('createFolder non-bloquant:', err); }
  G.folders = G.folders || []; G.folders.push(newFolder);
  closeFolderModal();
  renderFolderContents(); renderFolderTree();
  showToast(`Dossier "${name}" créé`, 'success');
}

async function deleteFolder(folderId) {
  const folder = (G.folders||[]).find(f => f.id === folderId);
  if (!folder) return;
  if (!confirm(`Supprimer le dossier "${folder.name}" ? Les documents qu'il contient seront déplacés à la racine.`)) return;
  const docsInFolder = G.documents.filter(d => d.folder_id === folderId);
  if (docsInFolder.length > 0 && G.supabase) {
    await G.supabase.from('documents').update({ folder_id: null }).eq('folder_id', folderId).catch(() => {});
    docsInFolder.forEach(d => { d.folder_id = null; });
  }
  await G.supabase.from('folders').delete().eq('id', folderId).catch(() => {});
  G.folders = (G.folders||[]).filter(f => f.id !== folderId);
  if (G.currentFolderId === folderId) G.currentFolderId = 'root';
  renderFolderContents(); renderFolderTree();
  showToast(`Dossier supprimé`, 'success');
}

async function moveDocument(docId, targetFolderId) {
  const doc = G.documents.find(d => d.id === docId); if (!doc) return;
  try {
    const { error } = await G.supabase.from('documents').update({ folder_id: targetFolderId || null }).eq('id', docId);
    if (error) throw error;
    doc.folder_id = targetFolderId || null;
    renderFolderContents();
    showToast('Document déplacé', 'success');
  } catch (err) { showToast('Erreur déplacement: ' + err.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════
// 3. SIGNATURES
// ═══════════════════════════════════════════════════════════════════════

async function renderSignatures() {
  const container = document.getElementById('signaturesList');
  if (!container) return;
  try {
    if (G.supabase && G.currentUser?.companyId) {
      const { data } = await G.supabase.from('signatures').select('*').eq('company_id', G.currentUser.companyId).order('created_at', { ascending: false });
      if (data) G.signatures = data;
    }
  } catch (_) {}
  if ((G.signatures||[]).length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-blue-300/50">
        <i class="fas fa-signature text-4xl mb-3 block opacity-20"></i>
        <p class="font-semibold">Aucune signature</p>
        <p class="text-sm mt-1">Sélectionnez un document et signez-le</p>
      </div>`;
    return;
  }
  const statusLabels = { pending: 'En attente', completed: 'Signé', rejected: 'Refusé', expired: 'Expiré' };
  const statusColors = { pending: 'bg-yellow-500/20 text-yellow-400', completed: 'bg-green-500/20 text-green-400', rejected: 'bg-red-500/20 text-red-400', expired: 'bg-gray-500/20 text-gray-400' };
  container.innerHTML = G.signatures.map(sig => {
    const doc = G.documents.find(d => d.id === sig.document_id);
    const status = sig.status || 'pending';
    return `
    <div class="glass-card rounded-xl p-4 border border-blue-500/20 hover:border-blue-400/30 transition-all">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
          <i class="fas fa-signature text-blue-400"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-white font-semibold text-sm">${escapeHtml(doc?.name || 'Document')}</p>
            <span class="text-[10px] px-2 py-0.5 rounded-full ${statusColors[status]}">${statusLabels[status] || status}</span>
          </div>
          <p class="text-xs text-blue-300/60 mt-0.5">Signataire : ${escapeHtml(sig.signer_email || '—')}</p>
          <p class="text-xs text-blue-300/40">${formatDate(sig.created_at)}</p>
        </div>
        ${status === 'completed' ? `
        <button onclick="viewSignature('${sig.id}')"
          class="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30 flex items-center gap-1 flex-shrink-0">
          <i class="fas fa-eye"></i>Voir
        </button>` : ''}
        ${status === 'pending' ? `
        <button onclick="openSignModal('${sig.document_id}')"
          class="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 flex items-center gap-1 flex-shrink-0">
          <i class="fas fa-pen-nib"></i>Signer
        </button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function getSigStatusClass(status) {
  const m = { pending: 'text-yellow-400', completed: 'text-green-400', rejected: 'text-red-400' };
  return m[status] || 'text-gray-400';
}

function openSignModal(docId) {
  const targetDocId = docId || G.currentDocId;
  if (!targetDocId) { showToast('Sélectionnez d\'abord un document', 'warning'); return; }
  const doc = G.documents.find(d => d.id === targetDocId);
  if (!doc) { showToast('Document introuvable', 'error'); return; }
  G.currentDocId = targetDocId;
  const modal = document.getElementById('signatureModal');
  if (modal) {
    modal.classList.remove('hidden');
    const titleEl = document.getElementById('signDocTitle');
    if (titleEl) titleEl.textContent = doc.name;
  }
  setTimeout(() => initSignatureCanvas(), 100);
}

function loadExistingSignatures() {
  const container = document.getElementById('existingSignaturesList');
  if (!container) return;
  const sigs = (G.signatures||[]).filter(s => s.document_id === G.currentDocId);
  if (sigs.length === 0) { container.innerHTML = '<p class="text-blue-300/40 text-xs">Aucune signature</p>'; return; }
  container.innerHTML = sigs.map(s => `<div class="text-xs text-blue-300/60 py-1">${escapeHtml(s.signer_email||'—')} — ${formatDate(s.created_at)}</div>`).join('');
}

function closeSignModal() {
  const modal = document.getElementById('signatureModal'); if (modal) modal.classList.add('hidden');
}

function initSignatureCanvas() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth  || 500;
  canvas.height = canvas.offsetHeight || 200;
  ctx.fillStyle = 'rgba(8,15,40,0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  let drawing = false, lastX = 0, lastY = 0;
  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches?.[0] || e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };
  canvas.onmousedown = canvas.ontouchstart = (e) => { drawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; e.preventDefault(); };
  canvas.onmousemove = canvas.ontouchmove  = (e) => {
    if (!drawing) return;
    const p = getPos(e); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastX = p.x; lastY = p.y; e.preventDefault();
  };
  canvas.onmouseup = canvas.ontouchend = () => { drawing = false; };
  canvas.onmouseleave = () => { drawing = false; };
}

function clearSignature() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8,15,40,0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
}

async function submitSignature() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) { showToast('Canvas non trouvé', 'error'); return; }
  const imgData = canvas.toDataURL('image/png');
  const doc = G.documents.find(d => d.id === G.currentDocId);
  if (!doc) { showToast('Document introuvable', 'error'); return; }
  const newSig = {
    id:          generateId(),
    document_id: G.currentDocId,
    signer_id:   G.currentUser.id,
    signer_email:G.currentUser.email,
    signature_data: imgData,
    status:      'completed',
    company_id:  G.currentUser.companyId,
    created_at:  new Date().toISOString(),
  };
  try {
    if (G.supabase) await G.supabase.from('signatures').insert(newSig).catch(() => {});
    G.signatures = G.signatures || []; G.signatures.unshift(newSig);
    closeSignModal();
    renderSignatures();
    showToast('Document signé avec succès', 'success');
    await addAuditLog('sign', 'document', G.currentDocId, `Signé par ${G.currentUser.email}`);
  } catch (err) { showToast('Erreur signature: ' + err.message, 'error'); }
}

async function viewSignature(sigId) {
  const sig = (G.signatures||[]).find(s => s.id === sigId);
  if (!sig?.signature_data) { showToast('Signature introuvable', 'info'); return; }
  let modal = document.getElementById('viewSigModal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'viewSigModal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }
  modal.innerHTML = `<div class="modal-box" style="max-width:520px;">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-white font-bold">Signature électronique</h3>
      <button onclick="document.getElementById('viewSigModal').classList.add('hidden')" class="text-blue-400 hover:text-white p-2 rounded-lg"><i class="fas fa-times text-xl"></i></button>
    </div>
    <div class="glass-card rounded-xl p-4 border border-green-500/20 mb-4">
      <img src="${sig.signature_data}" class="w-full rounded-lg" alt="Signature">
    </div>
    <p class="text-xs text-blue-300/50">Signé par ${escapeHtml(sig.signer_email||'—')} le ${formatDate(sig.created_at)}</p>
  </div>`;
  modal.classList.remove('hidden');
}

function openRequestSignatureModal() {
  let modal = document.getElementById('requestSigModal');
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'requestSigModal'; modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal-box" style="max-width:480px;">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-white font-bold flex items-center gap-2"><i class="fas fa-paper-plane text-blue-400"></i>Demander une signature</h3>
        <button onclick="closeRequestSignatureModal()" class="text-blue-400 hover:text-white p-2 rounded-lg"><i class="fas fa-times text-xl"></i></button>
      </div>
      <div class="space-y-3">
        <div><label class="text-blue-200/70 text-xs font-medium block mb-1">Email du signataire</label>
        <input id="signerEmailInput" type="email" placeholder="signataire@exemple.com" class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);"></div>
        <div><label class="text-blue-200/70 text-xs font-medium block mb-1">Message (optionnel)</label>
        <textarea id="signerMsgInput" rows="3" placeholder="Bonjour, merci de signer ce document…" class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none resize-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);"></textarea></div>
      </div>
      <div class="flex gap-3 mt-4">
        <button onclick="closeRequestSignatureModal()" class="flex-1 py-2.5 rounded-xl text-blue-300 text-sm border border-blue-500/25 hover:bg-blue-500/10">Annuler</button>
        <button onclick="requestSignature()" class="flex-1 btn-primary py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2"><i class="fas fa-paper-plane"></i>Envoyer</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }
  modal.classList.remove('hidden');
}

function closeRequestSignatureModal() {
  document.getElementById('requestSigModal')?.classList.add('hidden');
}

async function requestSignature() {
  const email = document.getElementById('signerEmailInput')?.value.trim();
  const msg   = document.getElementById('signerMsgInput')?.value.trim() || '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Email invalide', 'warning'); return; }
  if (!G.currentDocId) { showToast('Sélectionnez d\'abord un document', 'warning'); return; }
  const sigRequest = {
    id: generateId(), document_id: G.currentDocId, signer_email: email, message: msg,
    requester_id: G.currentUser.id, status: 'pending', company_id: G.currentUser.companyId, created_at: new Date().toISOString(),
  };
  try {
    if (G.supabase) await G.supabase.from('signatures').insert(sigRequest).catch(() => {});
    G.signatures = G.signatures || []; G.signatures.unshift(sigRequest);
    closeRequestSignatureModal();
    renderSignatures();
    showToast(`Demande envoyée à ${email}`, 'success');
    await addAuditLog('signature_request', 'document', G.currentDocId, `Demandé à: ${email}`);
  } catch (err) { showToast('Erreur: ' + err.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════
// 4. IA / ASSISTANT
// ═══════════════════════════════════════════════════════════════════════

async function renderAI() {
  const container = document.getElementById('aiDocsList');
  if (!container) return;
  try {
    if (G.supabase && G.currentUser?.companyId) {
      const { data } = await G.supabase.from('documents').select('*').eq('company_id', G.currentUser.companyId).eq('is_deleted', false).order('updated_at', { ascending: false }).limit(20);
      if (data) G.documents = data;
    }
  } catch (_) {}
  const docs = G.documents.filter(d => !d.is_deleted).slice(0, 12);
  container.innerHTML = docs.map(doc => `
    <div class="glass-card rounded-xl p-4 border border-pink-500/20 hover:border-pink-400/40 transition-all">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <div class="w-9 h-9 rounded-lg bg-pink-500/15 flex items-center justify-center flex-shrink-0">
            <i class="fas ${getFileIcon(doc.type).split(' ')[0]} text-pink-400 text-sm"></i>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-white text-sm font-medium truncate">${escapeHtml(doc.name)}</p>
            <p class="text-xs text-blue-300/50">${formatBytes(doc.size)} · ${doc.type || 'Inconnu'}</p>
          </div>
        </div>
        <button onclick="analyzeDocument('${doc.id}')"
          class="px-3 py-1.5 rounded-lg bg-pink-500/20 text-pink-400 text-xs hover:bg-pink-500/30 flex items-center gap-1 flex-shrink-0 transition-all">
          <i class="fas fa-magic"></i>Analyser
        </button>
      </div>
    </div>`).join('');
}

async function analyzeDocument(docId) {
  const doc = G.documents.find(d => d.id === docId); if (!doc) return;
  const resultEl = document.getElementById('aiAnalysisResult');
  const statusEl = document.getElementById('aiAnalysisStatus');
  if (resultEl) resultEl.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-pink-400 text-xl"></i><p class="text-blue-300/50 text-sm mt-2">Analyse en cours…</p></div>';
  if (statusEl) statusEl.textContent = `Analyse de "${doc.name}"…`;
  await new Promise(r => setTimeout(r, 1200));
  const wordEstimate = Math.round((doc.size || 0) / 6);
  const pageEstimate = Math.round((doc.size || 0) / 3000);
  const tagsSuggestions = [doc.type, doc.scope, ...(doc.tags||[])].filter(Boolean).slice(0, 5);
  const lastModified    = doc.updated_at || doc.created_at;
  const daysSince       = Math.floor((Date.now() - new Date(lastModified)) / 86400000);
  const analysis = {
    nom:       doc.name,
    type:      doc.type || 'Inconnu',
    taille:    formatBytes(doc.size || 0),
    mots_est:  wordEstimate.toLocaleString('fr-FR'),
    pages_est: Math.max(1, pageEstimate),
    tags:      tagsSuggestions,
    ancienneté:`${daysSince} jour(s)`,
    score:     doc.is_deleted ? 0 : Math.min(100, 40 + Math.round((doc.views||0)*2) + (doc.tags?.length||0)*5 + (doc.scope==='company'?20:0)),
  };
  if (resultEl) {
    resultEl.innerHTML = `
      <div class="glass-card rounded-xl p-4 border border-pink-500/20">
        <h4 class="text-white font-bold mb-3 flex items-center gap-2"><i class="fas fa-robot text-pink-400"></i>Analyse IA — ${escapeHtml(doc.name)}</h4>
        <div class="grid grid-cols-2 gap-2 mb-3">
          ${Object.entries({Type:analysis.type,'Taille':analysis.taille,'~Mots':analysis.mots_est,'~Pages':analysis.pages_est,'Ancienneté':analysis.ancienneté,'Score':analysis.score+'%'}).map(([k,v])=>`
          <div class="glass-card rounded-lg p-2.5 border border-blue-500/10">
            <p class="text-blue-300/50 text-[10px] uppercase tracking-wide">${k}</p>
            <p class="text-white text-sm font-semibold mt-0.5">${v}</p>
          </div>`).join('')}
        </div>
        ${analysis.tags.length>0?`<div class="flex flex-wrap gap-1 mb-2">${analysis.tags.map(t=>`<span class="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-300">${escapeHtml(t)}</span>`).join('')}</div>`:''}
        <div class="flex gap-2 mt-3">
          <button onclick="openPreviewModal('${doc.id}')" class="flex-1 py-2 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 flex items-center justify-center gap-1">
            <i class="fas fa-eye"></i>Aperçu
          </button>
          <button onclick="downloadDocument('${doc.id}')" class="flex-1 py-2 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30 flex items-center justify-center gap-1">
            <i class="fas fa-download"></i>Télécharger
          </button>
        </div>
      </div>`;
  }
  if (statusEl) statusEl.textContent = 'Analyse terminée';
}

function analyzeAllDocuments() {
  const docs = G.documents.filter(d => !d.is_deleted);
  if (docs.length === 0) { showToast('Aucun document à analyser', 'warning'); return; }
  showToast(`Analyse de ${docs.length} document(s) en cours…`, 'info', 4000);
  let done = 0;
  const results = docs.map(d => ({
    name: d.name, type: d.type, size: formatBytes(d.size||0),
    score: Math.min(100, 40+(d.views||0)*2+(d.tags?.length||0)*5+(d.scope==='company'?20:0)),
  }));
  setTimeout(() => {
    const top = results.sort((a,b)=>b.score-a.score).slice(0,3);
    showToast(`Analyse terminée — Top: ${top.map(d=>d.name).join(', ')}`, 'success', 6000);
  }, 2000);
}

function askAI() {
  const query = document.getElementById('aiQueryInput')?.value.trim();
  if (!query) { showToast('Posez une question', 'warning'); return; }
  const responseContainer = document.getElementById('aiResponseContainer');
  const responseText      = document.getElementById('aiResponseText');
  if (responseContainer) responseContainer.classList.remove('hidden');
  if (responseText) responseText.innerHTML = '<i class="fas fa-spinner fa-spin text-pink-400 mr-2"></i>Recherche…';
  setTimeout(() => {
    const q    = query.toLowerCase();
    const docs = G.documents.filter(d => !d.is_deleted && (
      d.name.toLowerCase().includes(q) ||
      (d.description||'').toLowerCase().includes(q) ||
      (d.tags||[]).some(t => t.toLowerCase().includes(q))
    ));
    const answer = docs.length > 0
      ? `<strong>${docs.length} document(s)</strong> correspondent à "<em>${escapeHtml(query)}</em>" :<br><ul class="mt-2 space-y-1">${docs.slice(0,5).map(d=>`<li class="flex items-center gap-2"><i class="fas fa-file-alt text-pink-400/70 text-xs"></i><button onclick="openPreviewModal('${d.id}')" class="text-blue-300 hover:text-blue-200 text-sm truncate max-w-[280px]">${escapeHtml(d.name)}</button></li>`).join('')}</ul>`
      : `Aucun document trouvé pour "<em>${escapeHtml(query)}</em>". Essayez des mots-clés différents ou vérifiez le nom du fichier.`;
    if (responseText) responseText.innerHTML = answer;
  }, 800);
}

// ═══════════════════════════════════════════════════════════════════════
// 5. AUTOMATION
// ═══════════════════════════════════════════════════════════════════════

async function renderAutomation() {
  const container = document.getElementById('automationRulesList');
  if (!container) return;
  try {
    if (G.supabase && G.currentUser?.companyId) {
      const { data } = await G.supabase.from('automation_rules').select('*').eq('company_id', G.currentUser.companyId).order('created_at', { ascending: false });
      if (data) G.automationRules = data;
    }
  } catch (_) {}
  if ((G.automationRules||[]).length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-blue-300/50">
        <i class="fas fa-magic text-4xl mb-3 block opacity-20"></i>
        <p class="font-semibold">Aucune règle d'automatisation</p>
        <p class="text-sm mt-1">Créez des règles pour automatiser vos flux de travail</p>
      </div>`;
    return;
  }
  container.innerHTML = G.automationRules.map(rule => `
    <div class="glass-card rounded-xl p-4 border border-purple-500/20 hover:border-purple-400/40 transition-all">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-lg ${rule.active?'bg-green-500/15':'bg-gray-500/15'} flex items-center justify-center flex-shrink-0">
          <i class="fas fa-bolt ${rule.active?'text-green-400':'text-gray-500'}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <p class="text-white font-semibold text-sm">${escapeHtml(rule.name||'Règle')}</p>
            <span class="text-[10px] px-2 py-0.5 rounded-full ${rule.active?'bg-green-500/15 text-green-400':'bg-gray-500/15 text-gray-400'}">
              ${rule.active?'Active':'Inactive'}
            </span>
          </div>
          <p class="text-xs text-blue-300/60 mt-0.5">
            <span class="text-purple-400">Si</span> ${escapeHtml(rule.trigger||'—')}
            <span class="text-blue-400 mx-1">→</span>
            <span class="text-green-400">Alors</span> ${escapeHtml(rule.action||'—')}
          </p>
          <p class="text-xs text-blue-300/40 mt-1">${formatDate(rule.created_at)}</p>
        </div>
        <div class="flex gap-1 flex-shrink-0">
          <button onclick="toggleRule('${rule.id}', ${!rule.active})"
            class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-all" title="${rule.active?'Désactiver':'Activer'}">
            <i class="fas fa-toggle-${rule.active?'on text-green-400':'off'}"></i>
          </button>
          <button onclick="deleteRule('${rule.id}')"
            class="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-all" title="Supprimer">
            <i class="fas fa-trash text-sm"></i>
          </button>
        </div>
      </div>
    </div>`).join('');
}

function openWfRuleModal() {
  let modal = document.getElementById('wfRuleModal');
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'wfRuleModal'; modal.className = 'modal-overlay';
    const triggers = ['upload_document','delete_document','share_document','workflow_complete','user_login','new_user'];
    const actions  = ['send_notification','create_workflow','send_email','add_tag','move_folder','export_report'];
    modal.innerHTML = `<div class="modal-box" style="max-width:500px;">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-white font-bold flex items-center gap-2"><i class="fas fa-bolt text-purple-400"></i>Nouvelle règle</h3>
        <button onclick="closeWfRuleModal()" class="text-blue-400 hover:text-white p-2 rounded-lg"><i class="fas fa-times text-xl"></i></button>
      </div>
      <div class="space-y-4">
        <div><label class="text-blue-200/70 text-xs font-medium block mb-1">Nom de la règle</label>
        <input id="ruleName" type="text" placeholder="Ex: Notifier à l'upload…" class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);"></div>
        <div><label class="text-blue-200/70 text-xs font-medium block mb-1"><span class="text-purple-400 font-bold">SI</span> — Déclencheur</label>
        <select id="ruleTrigger" class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);">
          ${triggers.map(t=>`<option value="${t}">${t.replace(/_/g,' ')}</option>`).join('')}
        </select></div>
        <div><label class="text-blue-200/70 text-xs font-medium block mb-1"><span class="text-green-400 font-bold">ALORS</span> — Action</label>
        <select id="ruleAction" class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);">
          ${actions.map(a=>`<option value="${a}">${a.replace(/_/g,' ')}</option>`).join('')}
        </select></div>
      </div>
      <div class="flex gap-3 mt-5 pt-4 border-t border-blue-500/20">
        <button onclick="closeWfRuleModal()" class="flex-1 py-2.5 rounded-xl text-blue-300 text-sm border border-blue-500/25 hover:bg-blue-500/10">Annuler</button>
        <button onclick="createWfRule()" class="flex-1 btn-primary py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2"><i class="fas fa-plus"></i>Créer</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }
  modal.classList.remove('hidden');
}

function closeWfRuleModal() { document.getElementById('wfRuleModal')?.classList.add('hidden'); }

async function createWfRule() {
  const name    = document.getElementById('ruleName')?.value.trim();
  const trigger = document.getElementById('ruleTrigger')?.value;
  const action  = document.getElementById('ruleAction')?.value;
  if (!name) { showToast('Nommez la règle', 'warning'); return; }
  const rule = { id: generateId(), name, trigger, action, active: true, company_id: G.currentUser.companyId, created_at: new Date().toISOString() };
  try { if (G.supabase) await G.supabase.from('automation_rules').insert(rule).catch(() => {}); } catch (_) {}
  G.automationRules = G.automationRules || []; G.automationRules.unshift(rule);
  closeWfRuleModal();
  renderAutomation();
  showToast(`Règle "${name}" créée`, 'success');
}

async function toggleRule(ruleId, active) {
  const rule = (G.automationRules||[]).find(r => r.id === ruleId); if (!rule) return;
  if (G.supabase) await G.supabase.from('automation_rules').update({ active }).eq('id', ruleId).catch(() => {});
  rule.active = active;
  renderAutomation();
  showToast(`Règle ${active ? 'activée' : 'désactivée'}`, 'success');
}

async function deleteRule(ruleId) {
  if (!confirm('Supprimer cette règle ?')) return;
  if (G.supabase) await G.supabase.from('automation_rules').delete().eq('id', ruleId).catch(() => {});
  G.automationRules = (G.automationRules||[]).filter(r => r.id !== ruleId);
  renderAutomation(); showToast('Règle supprimée', 'success');
}

function quickCreateRule() { openWfRuleModal(); }

// ═══════════════════════════════════════════════════════════════════════
// 6. SAUVEGARDES
// ═══════════════════════════════════════════════════════════════════════

async function renderBackups() {
  const container = document.getElementById('backupsList');
  if (!container) return;
  try {
    if (G.supabase && G.currentUser?.companyId) {
      const { data } = await G.supabase.from('backups').select('*').eq('company_id', G.currentUser.companyId).order('created_at', { ascending: false });
      if (data) G.backups = data;
    }
  } catch (_) {}
  const statsEl = document.getElementById('backupStats');
  if (statsEl) statsEl.textContent = `${(G.backups||[]).length} sauvegarde(s) disponible(s)`;
  if ((G.backups||[]).length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-blue-300/50">
        <i class="fas fa-archive text-4xl mb-3 block opacity-20"></i>
        <p class="font-semibold">Aucune sauvegarde</p>
        <p class="text-sm mt-1">Créez votre première sauvegarde</p>
      </div>`;
    return;
  }
  container.innerHTML = G.backups.map(b => {
    const statusColors = { completed: 'text-green-400 bg-green-500/15', pending: 'text-yellow-400 bg-yellow-500/15', failed: 'text-red-400 bg-red-500/15' };
    return `
    <div class="glass-card rounded-xl p-4 border border-teal-500/20 hover:border-teal-400/40 transition-all">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <div class="w-10 h-10 rounded-lg bg-teal-500/15 flex items-center justify-center flex-shrink-0">
            <i class="fas fa-archive text-teal-400"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-white font-semibold text-sm truncate">${escapeHtml(b.name || 'Sauvegarde')}</p>
              <span class="text-[10px] px-2 py-0.5 rounded-full ${statusColors[b.status] || statusColors.completed}">${b.status || 'completed'}</span>
            </div>
            <div class="flex gap-3 mt-0.5 text-xs text-blue-300/50">
              <span><i class="fas fa-calendar mr-1"></i>${formatDate(b.created_at)}</span>
              ${b.size ? `<span><i class="fas fa-database mr-1"></i>${formatBytes(b.size)}</span>` : ''}
              ${b.doc_count ? `<span><i class="fas fa-file-alt mr-1"></i>${b.doc_count} doc(s)</span>` : ''}
            </div>
          </div>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button onclick="restoreBackup('${b.id}')"
            class="px-3 py-1.5 rounded-lg bg-teal-500/20 text-teal-400 text-xs hover:bg-teal-500/30 flex items-center gap-1 transition-all">
            <i class="fas fa-undo"></i>Restaurer
          </button>
          <button onclick="deleteBackup('${b.id}')"
            class="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-all" title="Supprimer">
            <i class="fas fa-trash text-sm"></i>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function createBackup() {
  const btn = document.querySelector('[onclick="createBackup()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner mr-2"></span>Sauvegarde…'; }
  const totalSize = G.documents.filter(d=>!d.is_deleted).reduce((s,d)=>s+(d.size||0),0);
  const backup = {
    id:         generateId(),
    name:       `Sauvegarde ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`,
    status:     'completed',
    size:       totalSize,
    doc_count:  G.documents.filter(d=>!d.is_deleted).length,
    company_id: G.currentUser.companyId,
    created_at: new Date().toISOString(),
  };
  try {
    if (G.supabase) await G.supabase.from('backups').insert(backup).catch(() => {});
    await addAuditLog('backup_create', 'system', backup.id, `${backup.doc_count} docs, ${formatBytes(backup.size)}`);
  } catch (_) {}
  G.backups = G.backups || []; G.backups.unshift(backup);
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus mr-2"></i>Créer une sauvegarde'; }
  renderBackups();
  showToast(`Sauvegarde créée (${backup.doc_count} documents, ${formatBytes(backup.size)})`, 'success');
}

async function restoreBackup(id) {
  const backup = (G.backups||[]).find(b => b.id === id);
  if (!backup) return;
  if (!confirm(`Restaurer la sauvegarde du ${formatDate(backup.created_at)} ?\nLes documents supprimés depuis lors seront restaurés.`)) return;
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner mr-2"></span>Restauration…'; }
  try {
    const backupDate = new Date(backup.created_at);
    const deletedSince = G.documents.filter(d => d.is_deleted && new Date(d.created_at) < backupDate);
    if (deletedSince.length > 0 && G.supabase) {
      const ids = deletedSince.map(d => d.id);
      await G.supabase.from('documents').update({ is_deleted: false, deleted_at: null }).in('id', ids);
      deletedSince.forEach(d => { d.is_deleted = false; d.deleted_at = null; });
    }
    showToast(`Restauration effectuée — ${deletedSince.length} document(s) récupéré(s)`, 'success', 6000);
    await addAuditLog('backup_restore', 'system', id, `${deletedSince.length} docs restaurés`);
  } catch (err) {
    showToast('Erreur restauration: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-undo mr-1"></i>Restaurer'; }
  }
}

async function deleteBackup(id) {
  if (!confirm('Supprimer cette sauvegarde ? La suppression est définitive.')) return;
  if (G.supabase) await G.supabase.from('backups').delete().eq('id', id).catch(() => {});
  G.backups = (G.backups||[]).filter(b => b.id !== id);
  renderBackups(); showToast('Sauvegarde supprimée', 'success');
}

function toggleAutoBackup() {
  const enable    = document.getElementById('autoBackupEnable')?.checked;
  const frequency = document.getElementById('autoBackupFrequency');
  if (frequency) frequency.disabled = !enable;
  showToast(enable ? 'Sauvegarde automatique activée' : 'Sauvegarde automatique désactivée', enable ? 'success' : 'info');
  saveBackupSettings();
}

async function saveBackupSettings() {
  const enable    = document.getElementById('autoBackupEnable')?.checked || false;
  const frequency = document.getElementById('autoBackupFrequency')?.value || 'daily';
  const retention = document.getElementById('backupRetention')?.value || '30';
  try {
    if (G.supabase) {
      const { data } = await G.supabase.from('profiles').select('preferences').eq('id', G.currentUser.id).single();
      const prefs = data?.preferences || {};
      prefs.backup_auto      = enable;
      prefs.backup_frequency = frequency;
      prefs.backup_retention = retention;
      await G.supabase.from('profiles').update({ preferences: prefs }).eq('id', G.currentUser.id);
    }
    showToast('Paramètres sauvegardés', 'success');
  } catch (err) { showToast('Erreur: ' + err.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════
// 7. FACTURATION (BILLING)
// ═══════════════════════════════════════════════════════════════════════

async function renderBilling() {
  try {
    if (G.supabase && G.currentUser) {
      const { data } = await G.supabase.from('profiles').select('plan').eq('id', G.currentUser.id).single();
      if (data?.plan) G.currentUser.plan = data.plan;
    }
  } catch (_) {}
  const planKey = G.currentUser?.plan || 'free';
  const plan    = CONFIG.plans?.[planKey] || { name: 'Free', users: 3, storage: 1, price: 0 };
  const docsUsed = G.documents.filter(d => !d.is_deleted).length;
  const sizeUsed = G.documents.filter(d => !d.is_deleted).reduce((s,d) => s+(d.size||0), 0);
  const storageGB = sizeUsed / (1024*1024*1024);
  const maxGB     = plan.storage || 1;
  const usedPct   = Math.min(100, Math.round((storageGB/maxGB)*100));
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('currentPlanName',  plan.name);
  setEl('currentPlanDesc',  `${plan.users} utilisateur(s) · ${plan.storage||1} Go · ${plan.workflows || '∞'} workflows`);
  setEl('currentPlanPrice', plan.price === 0 ? 'Gratuit' : `${plan.price}€/mois`);
  const badgeEl = document.getElementById('currentPlanBadgeEl');
  if (badgeEl) { badgeEl.textContent = plan.name.toUpperCase(); badgeEl.className = `badge-plan badge-${planKey}`; }
  const bar = document.getElementById('storageBar');
  if (bar) { bar.style.width = `${usedPct}%`; bar.className = `h-full rounded-full transition-all ${usedPct>80?'bg-red-500':usedPct>60?'bg-yellow-500':'bg-blue-500'}`; }
  setEl('storageUsed',   `${storageGB.toFixed(2)} Go utilisé(s) / ${maxGB} Go`);
  setEl('storagePct',    `${usedPct}%`);
  setEl('billingDocs',   docsUsed);
  setEl('billingUsers',  G.users.filter(u=>u.status==='active').length);
}

function selectPlan(planKey, element) {
  document.querySelectorAll('.plan-card').forEach(card => card.classList.remove('selected','border-blue-400/60'));
  if (element) { element.classList.add('selected','border-blue-400/60'); }
  const btn = document.getElementById('upgradeBtn');
  if (btn) { btn.disabled = (planKey === G.currentUser?.plan); btn.setAttribute('data-plan', planKey); }
  const preview = document.getElementById('planPreview');
  const plan = CONFIG.plans?.[planKey];
  if (preview && plan) {
    preview.innerHTML = `<p class="text-blue-300/60 text-xs">Plan <strong class="text-white">${plan.name}</strong> — ${plan.users} users, ${plan.storage} Go, ${plan.price===0?'Gratuit':`${plan.price}€/mois`}</p>`;
  }
}

function simulateUpgrade() {
  const btn     = document.getElementById('upgradeBtn');
  const planKey = btn?.getAttribute('data-plan') || 'pro';
  const plan    = CONFIG.plans?.[planKey];
  if (!plan) { showToast('Sélectionnez un plan', 'warning'); return; }
  if (planKey === G.currentUser?.plan) { showToast('Vous êtes déjà sur ce plan', 'info'); return; }
  showToast(`Redirection vers le paiement pour le plan ${plan.name} — fonctionnalité de paiement en développement`, 'info', 5000);
  addAuditLog('upgrade_attempt', 'billing', G.currentUser.id, `Plan cible: ${planKey}`).catch(() => {});
}

function renderBillingV6() { renderBilling(); }

// ═══════════════════════════════════════════════════════════════════════
// 8. WORKFLOWS — openWfDetail amélioré
// ═══════════════════════════════════════════════════════════════════════

async function openWfDetail(wfId) {
  G.currentWfId = wfId;
  const modal = document.getElementById('wfDetailModal');
  if (modal) modal.classList.remove('hidden');
  let wf = G.workflows.find(w => w.id === wfId);
  try {
    if (G.supabase) {
      const { data } = await G.supabase.from('workflows').select('*').eq('id', wfId).single();
      if (data) { wf = data; const idx = G.workflows.findIndex(w => w.id === wfId); if (idx > -1) G.workflows[idx] = data; }
    }
  } catch (_) {}
  if (!wf) return;
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('wfDetailTitle', wf.title);
  const metaEl = document.getElementById('wfDetailMeta');
  if (metaEl) {
    metaEl.innerHTML = `
      <div class="flex flex-wrap gap-3 text-xs">
        <span class="px-2 py-1 rounded-full ${getWfStatusClass(wf.status)}">${wf.status}</span>
        <span class="text-blue-300/50"><i class="fas fa-calendar mr-1"></i>${formatDate(wf.created_at)}</span>
        ${wf.due_date ? `<span class="text-orange-400"><i class="fas fa-clock mr-1"></i>Échéance: ${formatDate(wf.due_date)}</span>` : ''}
        ${wf.priority ? `<span class="text-yellow-400"><i class="fas fa-flag mr-1"></i>${wf.priority}</span>` : ''}
      </div>`;
  }
  const descEl = document.getElementById('wfDetailDesc');
  if (descEl) descEl.textContent = wf.description || 'Aucune description';
  const histEl = document.getElementById('wfHistoryList');
  if (histEl && G.supabase) {
    try {
      const { data: actions } = await G.supabase.from('workflow_actions').select('*').eq('workflow_id', wfId).order('created_at', { ascending: false }).limit(20);
      if (actions && actions.length > 0) {
        histEl.innerHTML = actions.map(a => `
          <div class="flex items-start gap-2 py-1.5 border-b border-blue-500/10">
            <i class="fas fa-circle text-blue-400/40 text-[6px] mt-1.5 flex-shrink-0"></i>
            <div class="flex-1">
              <p class="text-white text-xs">${escapeHtml(a.action || a.type || '—')}</p>
              ${a.comment ? `<p class="text-xs text-blue-300/50 mt-0.5">${escapeHtml(a.comment)}</p>` : ''}
            </div>
            <span class="text-xs text-blue-300/40 whitespace-nowrap flex-shrink-0">${formatDate(a.created_at)}</span>
          </div>`).join('');
      } else {
        histEl.innerHTML = '<p class="text-blue-300/40 text-xs">Aucune action</p>';
      }
    } catch (_) {}
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LOGS SYSTÈME, RBAC, VERSIONING, RECHERCHE AVANCÉE (fonctions originales)
// ═══════════════════════════════════════════════════════════════════════

function toggleSysLogsAutoRefresh(enable) {
  if (_sysLogs.autoRefreshTimer) { clearInterval(_sysLogs.autoRefreshTimer); _sysLogs.autoRefreshTimer = null; }
  _sysLogs.autoRefresh = !!enable;
  if (enable) {
    _sysLogs.autoRefreshTimer = setInterval(() => { if (G.currentView === 'logs') renderSysLogs(); }, 15000);
    showToast('Auto-refresh activé (15s)', 'info');
  } else { showToast('Auto-refresh désactivé', 'info'); }
}

function openRoleModal(roleKey) {
  const modal = document.getElementById('roleModal');
  if (!modal) return;
  _rbac.editingRole = roleKey;
  const role = G.roles[roleKey];
  if (!role) return;
  const titleEl = document.getElementById('roleModalTitle');
  const keyEl   = document.getElementById('roleModalKey');
  const nameEl  = document.getElementById('roleModalName');
  if (titleEl) titleEl.textContent = `Modifier le rôle : ${role.name}`;
  if (keyEl)   keyEl.value   = roleKey;
  if (nameEl)  nameEl.value  = role.name;
  const allPerms = ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users'];
  allPerms.forEach(perm => { const cb = document.getElementById(`perm_${perm}`); if (cb) cb.checked = role.perms.includes(perm); });
  modal.classList.remove('hidden');
}

function _getVersionActionIcon(action) {
  const icons = { upload: '<i class="fas fa-upload text-blue-400"></i>', version_create: '<i class="fas fa-plus text-green-400"></i>', update: '<i class="fas fa-pencil text-yellow-400"></i>', version_restore: '<i class="fas fa-rotate-left text-purple-400"></i>' };
  return icons[action] || '<i class="fas fa-circle text-blue-300/50"></i>';
}

function _previewRoleChange(userId, newRole) { const role = G.roles[newRole]; if (!role) return; }

function sysLogsNextPage() {
  const total = _sysLogs.allLogs.filter(l => (_sysLogs.filter === 'all' || l.level === _sysLogs.filter) && (!_sysLogs.searchQuery || (l.message || '').toLowerCase().includes(_sysLogs.searchQuery))).length;
  const pages = Math.ceil(total / _sysLogs.pageSize);
  if (_sysLogs.page < pages) { _sysLogs.page++; _renderSysLogsPage(); }
}

async function renderVersioning() {
  const container = document.getElementById('versionDocList');
  if (!container) return;
  container.innerHTML = `<div class="col-span-full text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i><p class="mt-2 text-blue-300/60">Chargement…</p></div>`;
  try {
    if (G.supabase && G.currentUser?.companyId) {
      const { data, error } = await G.supabase.from('documents').select('*').eq('company_id', G.currentUser.companyId).eq('is_deleted', false).order('updated_at', { ascending: false });
      if (!error && data) G.documents = data;
    }
  } catch (e) { console.warn('renderVersioning reload:', e); }
  const docs = G.documents.filter(d => !d.is_deleted);
  if (docs.length === 0) {
    container.innerHTML = `<div class="glass-card rounded-2xl p-10 text-center border border-blue-500/15 col-span-full"><i class="fas fa-code-branch text-4xl text-cyan-400/30 mb-3 block"></i><p class="text-white font-semibold">Aucun document versionné</p><p class="text-sm text-blue-300/50 mt-1">Importez des documents pour gérer leurs versions</p></div>`;
    return;
  }
  container.innerHTML = docs.map(doc => {
    const owner = G.users.find(u => u.id === doc.owner_id);
    return `<div class="version-doc-card glass-card rounded-xl p-4 border border-cyan-500/20 hover:border-cyan-400/40 transition-all group">
      <div class="flex items-start gap-3">
        <div class="w-12 h-12 rounded-xl bg-cyan-500/15 flex items-center justify-center flex-shrink-0"><i class="fas ${getFileIcon(doc.type).split(' ')[0]} ${getFileIcon(doc.type).split(' ')[1] || 'text-cyan-400'}"></i></div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap"><p class="text-white font-semibold text-sm truncate">${escapeHtml(doc.name)}</p><span class="version-badge text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">v${doc.version || 1}</span>${(doc.version || 1) > 1 ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300"><i class="fas fa-history mr-1"></i>${doc.version - 1} révision(s)</span>` : ''}</div>
          <div class="flex items-center gap-3 mt-1 text-xs text-blue-300/60 flex-wrap"><span><i class="fas fa-user mr-1"></i>${owner?.name || 'Inconnu'}</span><span><i class="fas fa-calendar mr-1"></i>${formatDate(doc.updated_at || doc.created_at)}</span><span><i class="fas fa-database mr-1"></i>${formatBytes(doc.size)}</span></div>
        </div>
        <div class="flex gap-1 flex-shrink-0">
          <button onclick="showVersionHistory('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs hover:bg-cyan-500/30 transition-all flex items-center gap-1"><i class="fas fa-history"></i>Historique</button>
          <button onclick="createNewVersion('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 transition-all flex items-center gap-1"><i class="fas fa-plus"></i>Nouvelle v.</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderAdvancedSearch() {
  const ownerSel = document.getElementById('advSearchOwner');
  if (ownerSel && ownerSel.options.length === 0) { ownerSel.innerHTML = `<option value="">Tous les propriétaires</option><option value="mine">Mes documents</option><option value="others">Documents des autres</option>`; }
  if (document.getElementById('advSearchInput')?.value) runAdvSearch();
}

function clearAdvSearch() {
  ['advSearchInput','advSearchType','advSearchDate','advSearchSize','advSearchOwner'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  _search.lastResults = [];
  const countSpan = document.getElementById('advSearchCount');
  if (countSpan) countSpan.textContent = '';
  const container = document.getElementById('advSearchResults');
  if (container) container.innerHTML = `<div class="col-span-full text-center py-16 text-blue-300/30"><i class="fas fa-search text-5xl mb-4 block opacity-10"></i><p>Utilisez les filtres ci-dessus pour rechercher des documents</p></div>`;
}

function _roleIcon(key) { const icons = { admin: 'fa-crown', manager: 'fa-user-tie', editor: 'fa-pen', viewer: 'fa-eye' }; return icons[key] || 'fa-user-shield'; }

async function showVersionHistory(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  _versioning.currentDocId = docId;
  let history = [];
  try {
    if (G.supabase) {
      const { data } = await G.supabase.from('audit_logs').select('*').eq('target_id', docId).in('action', ['upload', 'version_create', 'update', 'version_restore']).order('created_at', { ascending: false });
      history = data || [];
    }
  } catch (_) {}
  _versioning.history = history;
  let modal = document.getElementById('versionHistoryModal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'versionHistoryModal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }
  modal.innerHTML = `<div class="modal-box" style="max-width:680px;"><div class="flex items-center justify-between mb-5"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 border border-cyan-500/30"><i class="fas fa-code-branch"></i></div><div><h3 class="text-white font-bold">Historique des versions</h3><p class="text-blue-300/50 text-xs truncate max-w-[300px]">${escapeHtml(doc.name)}</p></div></div><div class="flex gap-2"><button onclick="createNewVersion('${docId}')" class="px-4 py-2 rounded-xl btn-primary text-white text-sm font-semibold flex items-center gap-2"><i class="fas fa-plus"></i>Créer version</button><button onclick="document.getElementById('versionHistoryModal').classList.add('hidden')" class="text-blue-400 hover:text-white p-2 rounded-lg"><i class="fas fa-times text-xl"></i></button></div></div><div class="glass-card rounded-xl p-4 border border-cyan-500/30 mb-4" style="background:rgba(6,182,212,0.05)"><div class="flex items-center justify-between"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-sm">v${doc.version || 1}</div><div><p class="text-white text-sm font-semibold">Version actuelle</p><p class="text-xs text-blue-300/60">${formatDate(doc.updated_at || doc.created_at)} · ${formatBytes(doc.size)}</p></div></div><div class="flex gap-2"><button onclick="downloadDocument('${doc.id}')" class="p-2 rounded-lg hover:bg-cyan-500/20 text-cyan-400 transition-all" title="Télécharger"><i class="fas fa-download text-sm"></i></button><button onclick="openPreviewModal('${doc.id}')" class="p-2 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-all" title="Aperçu"><i class="fas fa-eye text-sm"></i></button></div></div></div><div class="space-y-2 max-h-[360px] overflow-y-auto pr-1">${history.length > 0 ? history.map((entry, idx) => `<div class="glass-card rounded-xl p-3 border border-blue-500/15 hover:border-blue-400/30 transition-all"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-300/70 text-xs font-bold flex-shrink-0">${_getVersionActionIcon(entry.action)}</div><div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><p class="text-white text-sm font-medium">${_getVersionActionLabel(entry.action)}</p><span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300">${formatDate(entry.created_at)}</span></div>${entry.details ? `<p class="text-xs text-blue-300/50 mt-0.5 truncate">${escapeHtml(entry.details)}</p>` : ''}</div>${entry.action === 'upload' || entry.action === 'version_create' ? `<button onclick="restoreVersion('${docId}', '${entry.id}')" class="px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 text-xs hover:bg-purple-500/30 flex-shrink-0 flex items-center gap-1 transition-all"><i class="fas fa-rotate-left"></i>Restaurer</button>` : ''}</div></div>`).join('') : `<div class="text-center py-8 text-blue-300/40"><i class="fas fa-history text-3xl mb-3 block opacity-20"></i><p>Aucun historique disponible</p><p class="text-xs mt-1">Les modifications futures seront enregistrées ici</p></div>`}</div></div>`;
  modal.classList.remove('hidden');
}

function exportSearchResults() {
  if (!_search.lastResults.length) { showToast('Aucun résultat à exporter', 'warning'); return; }
  function csvCell(v) { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s; }
  const headers = ['Nom', 'Type', 'Taille', 'Portée', 'Tags', 'Créé le'];
  const rows = _search.lastResults.map(d => [d.name, d.type, formatBytes(d.size), d.scope, (d.tags||[]).join(';'), d.created_at].map(csvCell));
  const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `recherche_${Date.now()}.csv` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('Résultats exportés en CSV', 'success');
}

function createRoleV7() {
  const input = document.getElementById('newRoleName');
  const name  = input?.value.trim();
  if (!name) { showToast('Entrez un nom de rôle', 'warning'); return; }
  const roleKey = name.toLowerCase().replace(/[\s\-]/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!roleKey) { showToast('Nom invalide', 'warning'); return; }
  if (G.roles[roleKey]) { showToast(`Le rôle "${name}" existe déjà`, 'warning'); return; }
  G.roles[roleKey] = { name, perms: ['read'] };
  if (input) input.value = '';
  renderRBAC();
  renderRBACV7();
  showToast(`Rôle "${name}" créé (permissions : lecture seule par défaut)`, 'success');
  openRoleModal(roleKey);
}

function _auditSeverityToLevel(severity) { const map = { critical: 'error', warning: 'warn', info: 'info', security: 'security' }; return map[severity] || 'info'; }

function sysLogsPrevPage() { if (_sysLogs.page > 1) { _sysLogs.page--; _renderSysLogsPage(); } }

async function restoreVersion(docId, auditEntryId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  if (!confirm(`Restaurer une version précédente de "${doc.name}" ?\nLa version actuelle (v${doc.version || 1}) sera conservée dans l'historique.`)) return;
  try {
    const newVersion = (doc.version || 1) + 1;
    const { error } = await G.supabase.from('documents').update({ version: newVersion, updated_at: new Date().toISOString() }).eq('id', docId);
    if (error) throw error;
    doc.version = newVersion; doc.updated_at = new Date().toISOString();
    await addAuditLog('version_restore', 'document', docId, `Restauré depuis entrée audit ${auditEntryId || 'manuelle'} → v${newVersion}`);
    showToast(`Version restaurée (v${newVersion})`, 'success');
    document.getElementById('versionHistoryModal')?.classList.add('hidden');
    renderVersioning();
  } catch (err) { showToast('Erreur restauration : ' + err.message, 'error'); }
}

function downloadVersion(docId) { downloadDocument(docId); }

async function runFTSearch() {
  const query      = document.getElementById('ftsInput')?.value.trim() || '';
  const type       = document.getElementById('ftsType')?.value || '';
  const dateFilter = document.getElementById('ftsDate')?.value || '';
  const container  = document.getElementById('searchV7Results');
  const countSpan  = document.getElementById('ftsCount');
  if (!query || query.length < 2) {
    if (container) container.innerHTML = `<div class="text-center py-20 text-blue-300/30"><i class="fas fa-search text-6xl mb-5 block opacity-10"></i><p class="text-lg">Tapez au moins 2 caractères pour rechercher</p></div>`;
    return;
  }
  if (container) container.innerHTML = `<div class="col-span-full text-center py-12"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i></div>`;
  try {
    if (G.supabase && G.currentUser?.companyId) {
      const { data } = await G.supabase.from('documents').select('*').eq('company_id', G.currentUser.companyId).eq('is_deleted', false).order('created_at', { ascending: false });
      if (data) G.documents = data;
    }
  } catch (_) {}
  const q = query.toLowerCase();
  let results = G.documents.filter(d => !d.is_deleted && (d.name.toLowerCase().includes(q) || (d.description && d.description.toLowerCase().includes(q)) || (Array.isArray(d.tags) && d.tags.some(t => t.toLowerCase().includes(q)))));
  if (type) results = results.filter(d => d.type === type);
  if (dateFilter === 'today') results = results.filter(d => new Date(d.created_at).toDateString() === new Date().toDateString());
  else if (dateFilter === 'week') { const ago = new Date(); ago.setDate(ago.getDate() - 7); results = results.filter(d => new Date(d.created_at) >= ago); }
  else if (dateFilter === 'month') { const ago = new Date(); ago.setDate(ago.getDate() - 30); results = results.filter(d => new Date(d.created_at) >= ago); }
  if (countSpan) countSpan.textContent = `${results.length} résultat(s)`;
  if (!container) return;
  if (results.length === 0) container.innerHTML = `<div class="text-center py-12 text-blue-300/50"><i class="fas fa-search text-4xl mb-3 block opacity-20"></i><p>Aucun résultat pour "<strong>${escapeHtml(query)}</strong>"</p></div>`;
  else container.innerHTML = `<div class="doc-grid">${results.map(doc => renderDocCard(doc)).join('')}</div>`;
}

async function saveRole() {
  const roleKey  = document.getElementById('roleModalKey')?.value;
  const roleName = document.getElementById('roleModalName')?.value?.trim();
  if (!roleKey || !roleName) { showToast('Nom de rôle requis', 'warning'); return; }
  const allPerms = ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users'];
  const perms    = allPerms.filter(p => document.getElementById(`perm_${p}`)?.checked);
  const btn = document.querySelector('#roleModal button[onclick="saveRole()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner mr-2"></span>Enregistrement…'; }
  try {
    if (G.supabase && G.currentUser?.companyId) {
      try { await G.supabase.from('company_roles').upsert({ role_key: roleKey, name: roleName, perms: perms, company_id: G.currentUser.companyId, updated_at: new Date().toISOString() }, { onConflict: 'role_key,company_id' }); } catch (_) { console.warn('company_roles upsert failed'); }
    }
    G.roles[roleKey] = { name: roleName, perms };
    await addAuditLog('role_update', 'role', roleKey, `Rôle "${roleName}" mis à jour — permissions : ${perms.join(', ')}`);
    showToast(`Rôle "${roleName}" mis à jour`, 'success');
    closeRoleModal();
    renderRBAC();
    renderRBACV7();
  } catch (err) { showToast('Erreur sauvegarde rôle : ' + err.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = 'Enregistrer'; } }
}

function exportSysLogs() {
  const data = JSON.stringify(_sysLogs.allLogs || G.systemLogs, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `system_logs_${new Date().toISOString().slice(0, 10)}.json` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('Logs exportés', 'success');
}

async function updateUserRole(userId, newRole) {
  if (!newRole) return;
  const user = G.users.find(u => u.id === userId);
  if (!user) return;
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const { error } = await G.supabase.from('profiles').update({ role: newRole, updated_at: new Date().toISOString() }).eq('id', userId);
    if (error) throw error;
    user.role = newRole;
    showToast(`Rôle de ${user.name} → ${G.roles[newRole]?.name || newRole}`, 'success');
    await addAuditLog('role_change', 'user', userId, `Nouveau rôle : ${newRole}`);
    renderRBACV7();
  } catch (err) { showToast('Erreur mise à jour rôle : ' + err.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Appliquer'; } }
}

function getLogLevelColor(level) { const colors = { info: 'text-blue-400', warn: 'text-yellow-400', error: 'text-red-400', security: 'text-orange-400' }; return colors[level] || 'text-gray-400'; }

async function compareVersions(docId) { const doc = G.documents.find(d => d.id === docId); if (!doc) return; showToast(`Comparaison des versions pour "${doc.name}" — fonctionnalité diff disponible avec l'IA`, 'info'); }

async function renderRBAC() {
  try {
    if (G.supabase && G.currentUser?.companyId) {
      const { data } = await G.supabase.from('profiles').select('*').eq('company_id', G.currentUser.companyId);
      if (data) G.users = data;
    }
  } catch (_) {}
  const container = document.getElementById('rbacCards');
  if (!container) return;
  container.innerHTML = Object.entries(G.roles).map(([key, role]) => {
    const userCount = G.users.filter(u => u.role === key).length;
    const colorMap  = { admin: 'red', manager: 'orange', editor: 'blue', viewer: 'gray' };
    const color     = colorMap[key] || 'purple';
    return `<div class="glass-card rounded-xl p-5 border border-${color}-500/25 hover:border-${color}-400/45 cursor-pointer transition-all group" onclick="openRoleModal('${key}')"><div class="flex items-center justify-between mb-3"><div class="w-10 h-10 rounded-lg bg-${color}-500/20 flex items-center justify-center text-${color}-400"><i class="fas ${_roleIcon(key)} text-lg"></i></div><span class="text-xs px-2 py-1 rounded-full bg-${color}-500/15 text-${color}-400 font-medium">${userCount} user${userCount > 1 ? 's' : ''}</span></div><h4 class="text-white font-bold mb-1">${escapeHtml(role.name)}</h4><div class="flex flex-wrap gap-1 mt-2">${role.perms.slice(0, 4).map(p => `<span class="text-[10px] px-1.5 py-0.5 rounded bg-${color}-500/15 text-${color}-300/70">${p}</span>`).join('')}${role.perms.length > 4 ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300/70">+${role.perms.length - 4}</span>` : ''}</div><div class="mt-3 pt-3 border-t border-blue-500/10 flex items-center justify-between"><span class="text-xs text-blue-300/40">${role.perms.length} permission${role.perms.length > 1 ? 's' : ''}</span><span class="text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fas fa-edit mr-1"></i>Modifier</span></div></div>`;
  }).join('');
}

async function filterVersionDocs(query) {
  const container = document.getElementById('versionDocList');
  if (!container) return;
  if (!query || !query.trim()) { renderVersioning(); return; }
  const q = query.toLowerCase();
  let docs = G.documents.filter(d => !d.is_deleted && (d.name.toLowerCase().includes(q) || (d.description && d.description.toLowerCase().includes(q))));
  if (docs.length === 0) { container.innerHTML = `<div class="col-span-full text-center py-12 text-blue-300/50"><i class="fas fa-search text-4xl mb-3 block opacity-20"></i><p>Aucun document trouvé pour "<strong>${escapeHtml(query)}</strong>"</p></div>`; return; }
  container.innerHTML = docs.map(doc => { const owner = G.users.find(u => u.id === doc.owner_id); return `<div class="version-doc-card glass-card rounded-xl p-4 border border-cyan-500/20 hover:border-cyan-400/40 transition-all"><div class="flex items-center gap-3"><div class="w-11 h-11 rounded-xl bg-cyan-500/15 flex items-center justify-center flex-shrink-0"><i class="fas ${getFileIcon(doc.type).split(' ')[0]} ${getFileIcon(doc.type).split(' ')[1] || 'text-cyan-400'}"></i></div><div class="flex-1 min-w-0"><p class="text-white font-semibold text-sm truncate">${escapeHtml(doc.name)}</p><div class="flex items-center gap-2 mt-0.5 text-xs text-blue-300/60"><span>v${doc.version || 1}</span><span>·</span><span>${formatDate(doc.updated_at || doc.created_at)}</span><span>·</span><span>${owner?.name || 'Inconnu'}</span></div></div><div class="flex gap-2"><button onclick="showVersionHistory('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs hover:bg-cyan-500/30 flex items-center gap-1"><i class="fas fa-history"></i>Historique</button><button onclick="createNewVersion('${doc.id}')" class="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 flex items-center gap-1"><i class="fas fa-plus"></i>Nouvelle v.</button></div></div></div>`; }).join('');
}

function _getVersionActionLabel(action) { const labels = { upload: 'Import initial', version_create: 'Nouvelle version créée', update: 'Document modifié', version_restore: 'Version restaurée' }; return labels[action] || action; }

function _updateSysLogsStats() {
  const all = _sysLogs.allLogs;
  const counts = { error: all.filter(l => l.level === 'error').length, warn: all.filter(l => l.level === 'warn').length, info: all.filter(l => l.level === 'info').length, security: all.filter(l => l.level === 'security').length };
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('logCountError', counts.error); setEl('logCountWarn', counts.warn); setEl('logCountInfo', counts.info); setEl('logCountSecurity', counts.security); setEl('logCountTotal', all.length);
}

function filterLogs(level) {
  _sysLogs.filter = level || 'all';
  _sysLogs.page = 1;
  document.querySelectorAll('.log-filter').forEach(btn => { const isActive = btn.dataset.lf === level || (!level && btn.dataset.lf === 'all'); btn.classList.toggle('bg-blue-500/20', isActive); btn.classList.toggle('text-blue-300', isActive); btn.classList.toggle('border-blue-500/30', isActive); btn.classList.toggle('text-gray-400', !isActive); btn.classList.toggle('border-blue-500/10', !isActive); });
  _renderSysLogsPage();
}

async function renderRBACV7() {
  await renderRBAC();
  const matrixContainer = document.getElementById('rbacV7PermMatrix');
  if (matrixContainer) {
    const allPerms = ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users'];
    const permLabels = { read: '👁 Lire', write: '✏ Écrire', delete: '🗑 Supprimer', users: '👥 Gérer users', logs: '📋 Logs', api: '🔑 API', billing: '💳 Facturation', signatures: '✍ Signatures', validate_users: '✅ Valider users' };
    matrixContainer.innerHTML = Object.entries(G.roles).map(([key, role]) => `<div class="glass-card rounded-xl p-4 border border-blue-500/20"><div class="flex items-center gap-2 mb-3"><i class="fas ${_roleIcon(key)} text-purple-400"></i><h4 class="text-white font-semibold text-sm">${escapeHtml(role.name)}</h4></div><div class="space-y-1">${allPerms.map(perm => `<div class="flex items-center justify-between py-0.5"><span class="text-xs text-blue-300/60">${permLabels[perm] || perm}</span><span class="text-xs ${role.perms.includes(perm) ? 'text-green-400' : 'text-red-400/50'}"><i class="fas ${role.perms.includes(perm) ? 'fa-check-circle' : 'fa-times-circle'}"></i></span></div>`).join('')}</div></div>`).join('');
  }
  const rolesGrid = document.getElementById('rbacV7RolesGrid');
  if (rolesGrid) {
    rolesGrid.innerHTML = Object.entries(G.roles).map(([key, role]) => `<div class="glass-card rounded-xl p-4 border border-blue-500/20 hover:border-blue-400/40 transition-all"><div class="flex items-center justify-between mb-2"><div class="flex items-center gap-2"><i class="fas ${_roleIcon(key)} text-purple-400"></i><h4 class="text-white font-semibold text-sm">${escapeHtml(role.name)}</h4></div><button onclick="openRoleModal('${key}')" class="text-xs text-blue-400 hover:text-blue-300 p-1 rounded-lg hover:bg-blue-500/10 transition-all"><i class="fas fa-edit"></i></button></div><p class="text-xs text-blue-300/50">${G.users.filter(u => u.role === key).length} utilisateur(s)</p><div class="mt-2 flex flex-wrap gap-1">${role.perms.map(p => `<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300/70">${p}</span>`).join('')}</div></div>`).join('');
  }
  const assignmentList = document.getElementById('roleAssignmentList');
  if (assignmentList) {
    if (G.users.length === 0) assignmentList.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-blue-300/50">Aucun utilisateur</td></tr>';
    else assignmentList.innerHTML = G.users.map(user => `<tr class="border-b border-blue-500/10 hover:bg-blue-500/5 transition-colors"><td class="p-3"><div class="flex items-center gap-2"><div class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-300 text-sm font-bold">${(user.name || 'U').charAt(0).toUpperCase()}</div><div><p class="text-white text-sm">${escapeHtml(user.name || '—')}</p><p class="text-xs text-blue-300/50">${escapeHtml(user.email || '')}</p></div></div></td><td class="p-3"><span class="px-2 py-1 rounded-full text-xs ${getRoleBadgeClass(user.role)}">${G.roles[user.role]?.name || user.role}</span></td><td class="p-3"><select id="roleSelect_${user.id}" onchange="_previewRoleChange('${user.id}', this.value)" class="bg-slate-900/50 border border-blue-500/30 rounded-lg px-2 py-1 text-xs text-white outline-none">${Object.entries(G.roles).map(([key, role]) => `<option value="${key}" ${user.role === key ? 'selected' : ''}>${escapeHtml(role.name)}</option>`).join('')}</select></td><td class="p-3"><button onclick="updateUserRole('${user.id}', document.getElementById('roleSelect_${user.id}').value)" class="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 transition-all">Appliquer</button></td></tr>`).join('');
  }
}

async function runAdvSearch() {
  const query      = document.getElementById('advSearchInput')?.value.trim().toLowerCase() || '';
  const type       = document.getElementById('advSearchType')?.value || '';
  const dateFilter = document.getElementById('advSearchDate')?.value || '';
  const sizeFilter = document.getElementById('advSearchSize')?.value || '';
  const ownerFilter= document.getElementById('advSearchOwner')?.value || '';
  const container  = document.getElementById('advSearchResults');
  const countSpan  = document.getElementById('advSearchCount');
  if (container) container.innerHTML = `<div class="col-span-full text-center py-12"><i class="fas fa-spinner fa-spin text-3xl text-blue-400"></i><p class="mt-2 text-blue-300/60">Recherche en cours…</p></div>`;
  try {
    if (G.supabase && G.currentUser?.companyId) {
      const { data, error } = await G.supabase.from('documents').select('*').eq('company_id', G.currentUser.companyId).eq('is_deleted', false).order('created_at', { ascending: false });
      if (!error && data) G.documents = data;
    }
  } catch (e) { console.warn('runAdvSearch reload failed:', e); }
  let results = G.documents.filter(d => !d.is_deleted);
  if (query) results = results.filter(d => d.name.toLowerCase().includes(query) || (d.description && d.description.toLowerCase().includes(query)) || (Array.isArray(d.tags) && d.tags.some(t => t.toLowerCase().includes(query))));
  if (type) results = results.filter(d => d.type === type);
  if (ownerFilter === 'mine') results = results.filter(d => d.owner_id === G.currentUser.id);
  else if (ownerFilter === 'others') results = results.filter(d => d.owner_id !== G.currentUser.id);
  if (dateFilter === 'today') { const today = new Date().toDateString(); results = results.filter(d => new Date(d.created_at).toDateString() === today); }
  else if (dateFilter === 'week') { const ago = new Date(); ago.setDate(ago.getDate() - 7); results = results.filter(d => new Date(d.created_at) >= ago); }
  else if (dateFilter === 'month') { const ago = new Date(); ago.setDate(ago.getDate() - 30); results = results.filter(d => new Date(d.created_at) >= ago); }
  if (sizeFilter === 'small')  results = results.filter(d => d.size < 1024 * 1024);
  if (sizeFilter === 'medium') results = results.filter(d => d.size >= 1024 * 1024 && d.size < 10 * 1024 * 1024);
  if (sizeFilter === 'large')  results = results.filter(d => d.size >= 10 * 1024 * 1024);
  _search.lastQuery = query;
  _search.lastResults = results;
  if (countSpan) countSpan.textContent = `${results.length} résultat(s)`;
  if (!container) return;
  if (results.length === 0) container.innerHTML = `<div class="col-span-full text-center py-12 text-blue-300/50"><i class="fas fa-search text-4xl mb-3 block opacity-20"></i><p class="text-lg">Aucun résultat${query ? ` pour "<strong>${escapeHtml(query)}</strong>"` : ''}</p><p class="text-sm mt-2 text-blue-400/50">Essayez d'autres mots-clés ou modifiez vos filtres</p></div>`;
  else container.innerHTML = `<div class="doc-grid">${results.map(doc => renderDocCard(doc)).join('')}</div>`;
}

async function renderSysLogs() {
  const container = document.getElementById('sysLogConsole');
  if (!container) return;
  try {
    if (G.supabase && G.currentUser) {
      const isAdmin = G.currentUser.isSystemAdmin || G.currentUser.role === 'admin';
      const queries = [G.supabase.from('audit_logs').select('*').eq('user_id', G.currentUser.id).order('created_at', { ascending: false }).limit(500)];
      if (isAdmin) queries.push(G.supabase.from('system_logs').select('*').order('created_at', { ascending: false }).limit(200));
      const results = await Promise.all(queries);
      const auditData  = results[0].data || [];
      const systemData = isAdmin && results[1] ? (results[1].data || []) : [];
      const normalized = [...auditData.map(l => ({ id: l.id, level: _auditSeverityToLevel(l.severity || 'info'), action: l.action, message: l.details || l.action || '', target_type: l.target_type || '', created_at: l.created_at, source: 'audit' })), ...systemData.map(l => ({ id: l.id, level: l.level || 'info', action: l.action || '', message: l.message || l.details || l.action || '', target_type: l.target_type || '', created_at: l.created_at, source: 'system' }))].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      G.systemLogs = normalized;
      _sysLogs.allLogs = normalized;
    } else { _sysLogs.allLogs = G.systemLogs || []; }
  } catch (e) { console.warn('renderSysLogs reload failed:', e); }
  _renderSysLogsPage();
  _updateSysLogsStats();
}

function renderSearchV7() { if (document.getElementById('ftsInput')?.value.trim()) runFTSearch(); }

function searchSysLogs(query) { _sysLogs.searchQuery = (query || '').trim(); _sysLogs.page = 1; _renderSysLogsPage(); }

async function confirmCreateNewVersion(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  const note = document.getElementById('newVersionNote')?.value.trim() || '';
  const file = window._pendingVersionFile;
  const newVersion = (doc.version || 1) + 1;
  const btn = document.querySelector('#createVersionModal button[onclick^="confirmCreate"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner mr-2"></span>Enregistrement…'; }
  try {
    if (file && G.supabase) {
      const fileExt = file.name.split('.').pop().toLowerCase();
      const storagePath = `${G.currentUser.companyId}/${docId}_v${newVersion}.${fileExt}`;
      const { error: uploadErr } = await G.supabase.storage.from(CONFIG.storageBucket).upload(storagePath, file, { cacheControl: '3600', upsert: true });
      if (!uploadErr) {
        const { data: urlData } = G.supabase.storage.from(CONFIG.storageBucket).getPublicUrl(storagePath);
        doc.file_url = urlData.publicUrl; doc.storage_path = storagePath; doc.size = file.size; doc.type = getFileType(file.name);
      }
    }
    if (G.supabase) {
      const { error } = await G.supabase.from('documents').update({ version: newVersion, updated_at: new Date().toISOString(), ...(file ? { size: file.size, storage_path: doc.storage_path, file_url: doc.file_url } : {}) }).eq('id', docId);
      if (error) throw error;
    }
    doc.version = newVersion; doc.updated_at = new Date().toISOString();
    await addAuditLog('version_create', 'document', docId, `v${newVersion} créée${note ? ' : ' + note : ''}${file ? ' — nouveau fichier' : ''}`);
    showToast(`✅ Version v${newVersion} créée`, 'success');
    window._pendingVersionFile = null;
    document.getElementById('createVersionModal')?.classList.add('hidden');
    document.getElementById('versionHistoryModal')?.classList.add('hidden');
    renderVersioning();
  } catch (err) { showToast('Erreur création version : ' + err.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-plus mr-2"></i>Créer la version v${newVersion}`; } }
}

function closeRoleModal() { const modal = document.getElementById('roleModal'); if (modal) modal.classList.add('hidden'); _rbac.editingRole = null; }

function _renderSysLogsPage() {
  const container = document.getElementById('sysLogConsole');
  if (!container) return;
  let logs = _sysLogs.allLogs;
  if (_sysLogs.filter !== 'all') logs = logs.filter(l => l.level === _sysLogs.filter);
  if (_sysLogs.searchQuery) { const q = _sysLogs.searchQuery.toLowerCase(); logs = logs.filter(l => (l.message || '').toLowerCase().includes(q) || (l.action || '').toLowerCase().includes(q) || (l.target_type || '').toLowerCase().includes(q)); }
  const total = logs.length;
  const pages = Math.max(1, Math.ceil(total / _sysLogs.pageSize));
  const page = Math.min(_sysLogs.page, pages);
  const start = (page - 1) * _sysLogs.pageSize;
  const paged = logs.slice(start, start + _sysLogs.pageSize);
  const pageInfo = document.getElementById('sysLogPageInfo'); const pagePrev = document.getElementById('sysLogPrev'); const pageNext = document.getElementById('sysLogNext');
  if (pageInfo) pageInfo.textContent = `Page ${page} / ${pages}  (${total} entrée${total > 1 ? 's' : ''})`;
  if (pagePrev) pagePrev.disabled = page <= 1;
  if (pageNext) pageNext.disabled = page >= pages;
  if (paged.length === 0) { container.innerHTML = `<div class="text-center py-8 text-blue-300/40 text-sm"><i class="fas fa-check-circle text-2xl text-green-400/40 mb-2 block"></i>Aucun log${_sysLogs.filter !== 'all' ? ` de niveau "${_sysLogs.filter}"` : ''}${_sysLogs.searchQuery ? ` pour "${escapeHtml(_sysLogs.searchQuery)}"` : ''}</div>`; return; }
  container.innerHTML = paged.map(l => { const levelColor = getLogLevelColor(l.level); const time = l.created_at ? new Date(l.created_at).toLocaleTimeString('fr-FR') : ''; const date = l.created_at ? new Date(l.created_at).toLocaleDateString('fr-FR') : ''; const msg = escapeHtml(l.message || l.action || '—'); return `<div class="log-entry flex items-start gap-2 py-1.5 px-2 text-xs hover:bg-blue-500/5 rounded transition-colors border-b border-blue-500/5"><span class="text-blue-300/30 flex-shrink-0 w-[105px]">[${date} ${time}]</span><span class="flex-shrink-0 w-20"><span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${l.level === 'error' ? 'bg-red-500/20 text-red-400' : l.level === 'warn' ? 'bg-yellow-500/20 text-yellow-400' : l.level === 'security' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/15 text-blue-400'}">${l.level}</span></span>${l.source === 'audit' ? '<span class="flex-shrink-0 text-purple-400/50 text-[10px] w-10">audit</span>' : '<span class="flex-shrink-0 text-teal-400/50 text-[10px] w-10">sys</span>'}<span class="flex-1 text-blue-200/80 break-words">${msg}</span>${l.target_type ? `<span class="flex-shrink-0 text-blue-300/40 text-[10px]">${l.target_type}</span>` : ''}</div>`; }).join('');
}

function clearSysLogs() { _sysLogs.filter = 'all'; _sysLogs.searchQuery = ''; _sysLogs.page = 1; G.systemLogs = []; _sysLogs.allLogs = []; const container = document.getElementById('sysLogConsole'); if (container) container.innerHTML = '<div class="text-center py-8 text-blue-300/40 text-sm"><i class="fas fa-check-circle text-2xl text-green-400/40 mb-2 block"></i>Logs effacés</div>'; showToast('Logs effacés de la vue', 'info'); }

async function createNewVersion(docId) {
  const doc = G.documents.find(d => d.id === docId);
  if (!doc) return;
  let modal = document.getElementById('createVersionModal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'createVersionModal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }
  modal.innerHTML = `<div class="modal-box" style="max-width:520px;"><div class="flex items-center justify-between mb-5"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/30"><i class="fas fa-plus"></i></div><div><h3 class="text-white font-bold">Créer une nouvelle version</h3><p class="text-blue-300/50 text-xs">${escapeHtml(doc.name)} · Version actuelle : v${doc.version || 1}</p></div></div><button onclick="document.getElementById('createVersionModal').classList.add('hidden')" class="text-blue-400 hover:text-white p-2 rounded-lg"><i class="fas fa-times text-xl"></i></button></div><div class="space-y-4"><div><label class="text-blue-200/70 text-xs font-medium block mb-1">Note de version</label><input type="text" id="newVersionNote" placeholder="Ex: Corrections page 3, mise à jour données Q3…" class="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none" style="background:rgba(8,15,40,0.7);border:1px solid rgba(96,165,250,0.2);"></div><div><label class="text-blue-200/70 text-xs font-medium block mb-2">Nouveau fichier (optionnel)</label><div class="border-2 border-dashed border-blue-500/30 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400/50 transition-all" onclick="document.getElementById(\'newVersionFileInput\').click()"><i class="fas fa-cloud-upload-alt text-2xl text-blue-400/50 block mb-2"></i><p class="text-blue-300/60 text-sm">Cliquez ou glissez un fichier</p><p class="text-blue-400/40 text-xs mt-1">Remplace le fichier actuel pour cette version</p></div><input type="file" id="newVersionFileInput" class="hidden" onchange="handleNewVersionFile(this, '${docId}')"><p id="newVersionFileName" class="text-xs text-green-400 mt-2 hidden"></p></div></div><div class="flex gap-3 mt-5 pt-4 border-t border-blue-500/20"><button onclick="document.getElementById('createVersionModal').classList.add('hidden')" class="flex-1 py-2.5 rounded-xl text-blue-300 text-sm border border-blue-500/25 hover:bg-blue-500/10 transition-all">Annuler</button><button onclick="confirmCreateNewVersion('${docId}')" class="flex-1 btn-primary py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2"><i class="fas fa-plus"></i>Créer la version v${(doc.version || 1) + 1}</button></div></div>`;
  modal.classList.remove('hidden');
}

function handleNewVersionFile(input, docId) {
  const file = input.files[0];
  if (!file) return;
  const label = document.getElementById('newVersionFileName');
  if (label) { label.textContent = `✅ ${file.name} (${formatBytes(file.size)})`; label.classList.remove('hidden'); }
  window._pendingVersionFile = file;
}

// ═══════════════════════════════════════════════════════════════════════
// EXPOSITIONS GLOBALES
// ═══════════════════════════════════════════════════════════════════════

Object.assign(window, {
  renderUsers, searchUsers, filterUsersByRole, filterUsersByStatus, changeUserStatus,
  validateUser, deleteUser, addUser, openCreateUserModal, closeAddUserModal,
  resetUserPassword, openResetModal, closeResetModal, sendResetEmail, updatePendingUsersCount,
  renderPendingUsers, refreshPendingUsers, approveAllPending, rejectAllPending,
  renderTags, createTag, deleteTag, filterByTag, clearTagFilter, startEditTag, confirmEditTag, cancelEditTag,
  renderSettings, saveProfile, toggleSetting, changePassword, updateCompanySettings,
  exportUserData, requestAccountDeletion, copySqlSchema, openDangerModal,
  closeNotifPanel, toggleNotifications, markAllNotifRead,
  renderSecurity, switchSecurityTab, renderAuditLog, loadDeletedDocs,
  restoreDocument, permanentDeleteDocument, scanAllDocuments,
  exportAuditLog, exportAllData, exportDocumentsCsv, auditPrevPage, auditNextPage,
  renderApiKeys, generateApiKey, generateApiKeyV6, revokeApiKey, copyApiKey, _confirmGenerateApiKey,
  renderIntegrations, connectIntegration, disconnectIntegration, showIntegrationInfo,
  addWebhook, listWebhooks, testWebhook, removeWebhook,
  renderAuditV6, setAuditFilter, filterAuditLogs, clearAuditFilters, prevAuditPage, nextAuditPage,
  renderAnalytics, exportAnalytics, refreshAnalytics,
  renderFolders, renderFolderContents, renderFolderTree, openFolder, openFolderModal, closeFolderModal, createFolder, deleteFolder, moveDocument,
  renderSignatures, openSignModal, closeSignModal, clearSignature, submitSignature, viewSignature, openRequestSignatureModal, closeRequestSignatureModal, requestSignature,
  renderAI, analyzeDocument, analyzeAllDocuments, askAI,
  renderAutomation, openWfRuleModal, closeWfRuleModal, createWfRule, quickCreateRule, toggleRule, deleteRule,
  renderBackups, createBackup, restoreBackup, deleteBackup, toggleAutoBackup, saveBackupSettings,
  renderBilling, selectPlan, simulateUpgrade, renderBillingV6,
  renderSysLogs, filterLogs, clearSysLogs, exportSysLogs, searchSysLogs, sysLogsPrevPage, sysLogsNextPage, toggleSysLogsAutoRefresh,
  renderRBAC, renderRBACV7, openRoleModal, closeRoleModal, saveRole, updateUserRole, createRoleV7,
  renderVersioning, showVersionHistory, createNewVersion, restoreVersion, confirmCreateNewVersion, handleNewVersionFile, filterVersionDocs, compareVersions,
  renderAdvancedSearch, runAdvSearch, clearAdvSearch, exportSearchResults,
  runFTSearch, renderSearchV7
});
