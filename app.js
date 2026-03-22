/**
 * SystemesGED v7.0 - Application GED Collaborative Multi-Entreprise
 * Architecture modulaire avec Supabase
 * ============================================
 */

// ═══════════════════════════════════════════════════════════════
// MODULE DE CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  supabaseUrl: 'https://whkvtpqesqiailwjgoaq.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indoa3Z0cHFlc3FpYWlsd2pnb2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxOTU1ODIsImV4cCI6MjA4OTc3MTU4Mn0.oIEDNRvSAEsVTarXnIl1cMTLoqS1nsHo8dPnjdW0ng8',
  
  storageBucket: 'documents',
  maxFileSize: 50 * 1024 * 1024, // 50MB
  
  // Plans d'abonnement
  plans: {
    free: { 
      name: 'Free', 
      price: 0, 
      users: 5, 
      storage: 1073741824, // 1GB
      features: ['basic', 'upload', 'share'] 
    },
    starter: { 
      name: 'Starter', 
      price: 29, 
      users: 20, 
      storage: 10737418240, // 10GB
      features: ['basic', 'versioning', 'advanced_search'] 
    },
    professional: { 
      name: 'Professional', 
      price: 79, 
      users: 100, 
      storage: 107374182400, // 100GB
      features: ['basic', 'versioning', 'rbac', 'audit', 'workflows', 'signatures'] 
    },
    enterprise: { 
      name: 'Enterprise', 
      price: null, 
      users: 999999, 
      storage: 1099511627776, // 1TB
      features: ['all', 'api', 'sla', 'dedicated_support'] 
    }
  },

  // Rôles système
  ROLES: {
    SUPER_ADMIN: 'super_admin',    // Accès total système
    ADMIN: 'admin',                // Admin entreprise
    MANAGER: 'manager',            // Manager équipe
    EDITOR: 'editor',              // Éditeur documents
    VIEWER: 'viewer'               // Lecteur uniquement
  },

  // Permissions granulaires
  PERMISSIONS: {
    READ: 'read',
    WRITE: 'write',
    DELETE: 'delete',
    SHARE: 'share',
    VALIDATE_USERS: 'validate_users',
    MANAGE_ROLES: 'manage_roles',
    MANAGE_BILLING: 'manage_billing',
    MANAGE_API: 'manage_api',
    VIEW_AUDIT: 'view_audit',
    MANAGE_WORKFLOWS: 'manage_workflows',
    SIGN_DOCUMENTS: 'sign_documents'
  }
};

// ═══════════════════════════════════════════════════════════════
// MODULE D'ÉTAT GLOBAL (Store)
// ═══════════════════════════════════════════════════════════════

class AppStore {
  constructor() {
    this.state = {
      currentUser: null,
      currentCompany: null,
      session: null,
      
      // Données
      documents: [],
      folders: [],
      users: [],
      workflows: [],
      tags: [],
      shares: [],
      signatures: [],
      automationRules: [],
      apiKeys: [],
      backups: [],
      auditLog: [],
      messages: [], // Chat interne
      
      // UI State
      currentView: 'dashboard',
      selectedFiles: [],
      currentFolderId: '__root__',
      folderPath: [{ id: '__root__', name: 'Racine' }],
      viewMode: 'grid',
      
      // Collaboration
      onlineUsers: new Map(),
      activeCollaborations: new Map(),
      
      // Settings
      settings: {
        notifications: true,
        autoOcr: true,
        darkMode: true,
        realtimeEnabled: true
      }
    };
    
    this.listeners = new Map();
    this.subscriptions = [];
  }

  // Getters
  get(key) {
    return this.state[key];
  }

  // Setters avec notification
  set(key, value) {
    const oldValue = this.state[key];
    this.state[key] = value;
    this.notify(key, value, oldValue);
  }

  // Souscription aux changements
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    
    // Retourner fonction de désinscription
    return () => {
      this.listeners.get(key).delete(callback);
    };
  }

  // Notification des changements
  notify(key, newValue, oldValue) {
    if (this.listeners.has(key)) {
      this.listeners.get(key).forEach(cb => cb(newValue, oldValue));
    }
  }

  // Mise à jour partielle d'objet
  update(key, updates) {
    this.set(key, { ...this.state[key], ...updates });
  }

  // Ajouter à un tableau
  push(key, item) {
    this.set(key, [...this.state[key], item]);
  }

  // Supprimer d'un tableau
  remove(key, predicate) {
    this.set(key, this.state[key].filter(item => !predicate(item)));
  }

  // Nettoyage
  cleanup() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
    this.listeners.clear();
  }
}

// Instance globale du store
const store = new AppStore();

// ═══════════════════════════════════════════════════════════════
// MODULE SUPABASE - Client et Services
// ═══════════════════════════════════════════════════════════════

class SupabaseService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.realtimeChannels = new Map();
  }

  async initialize() {
    try {
      if (typeof supabase === 'undefined') {
        console.warn('⚠️ Supabase SDK non chargé');
        return false;
      }

      this.client = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });

      // Vérifier la session existante
      const { data: { session }, error } = await this.client.auth.getSession();
      
      if (error) throw error;
      
      if (session) {
        store.set('session', session);
        await this.loadUserProfile(session.user.id);
      }

      this.initialized = true;
      console.log('✅ Supabase initialisé');
      return true;

    } catch (error) {
      console.error('❌ Erreur initialisation Supabase:', error);
      return false;
    }
  }

  // ═══ AUTHENTIFICATION ═══

  async signUp(email, password, userData) {
    try {
      // Vérifier si l'entreprise existe déjà
      const { data: existingCompany } = await this.client
        .from('companies')
        .select('id')
        .eq('name', userData.companyName)
        .single();

      let companyId;

      if (existingCompany) {
        // L'entreprise existe, l'utilisateur doit être validé par un admin
        companyId = existingCompany.id;
      } else {
        // Créer une nouvelle entreprise
        const { data: newCompany, error: companyError } = await this.client
          .from('companies')
          .insert({
            name: userData.companyName,
            plan: 'free',
            status: 'active',
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (companyError) throw companyError;
        companyId = newCompany.id;
      }

      // Créer l'utilisateur dans auth
      const { data: authData, error: authError } = await this.client.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: userData.firstName,
            last_name: userData.lastName,
            company_id: companyId,
            company_name: userData.companyName
          }
        }
      });

      if (authError) throw authError;

      // Créer le profil utilisateur
      const { error: profileError } = await this.client
        .from('users_profiles')
        .insert({
          id: authData.user.id,
          email: email,
          first_name: userData.firstName,
          last_name: userData.lastName,
          company_id: companyId,
          role: existingCompany ? 'viewer' : 'admin', // Premier admin si nouvelle entreprise
          status: existingCompany ? 'pending_validation' : 'active',
          plan: 'free',
          created_at: new Date().toISOString()
        });

      if (profileError) throw profileError;

      // Si c'est une nouvelle entreprise, créer les dossiers par défaut
      if (!existingCompany) {
        await this.createDefaultFolders(companyId);
      }

      return { 
        success: true, 
        user: authData.user,
        requiresValidation: !!existingCompany 
      };

    } catch (error) {
      console.error('Erreur inscription:', error);
      return { success: false, error: error.message };
    }
  }

  async signIn(email, password) {
    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      // Vérifier le statut de l'utilisateur
      const { data: profile, error: profileError } = await this.client
        .from('users_profiles')
        .select('*, companies(*)')
        .eq('id', data.user.id)
        .single();

      if (profileError) throw profileError;

      if (profile.status === 'pending_validation') {
        await this.client.auth.signOut();
        return { 
          success: false, 
          error: 'Votre compte est en attente de validation par un administrateur',
          code: 'PENDING_VALIDATION'
        };
      }

      if (profile.status === 'suspended') {
        await this.client.auth.signOut();
        return { 
          success: false, 
          error: 'Votre compte a été suspendu. Contactez votre administrateur.',
          code: 'SUSPENDED'
        };
      }

      store.set('session', data.session);
      store.set('currentUser', this.formatUser(profile));
      store.set('currentCompany', profile.companies);

      return { success: true, user: profile };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async signOut() {
    try {
      // Déconnecter des canaux realtime
      this.realtimeChannels.forEach(channel => {
        this.client.removeChannel(channel);
      });
      this.realtimeChannels.clear();

      await this.client.auth.signOut();
      store.cleanup();
      store.set('session', null);
      store.set('currentUser', null);
      store.set('currentCompany', null);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async loadUserProfile(userId) {
    try {
      const { data: profile, error } = await this.client
        .from('users_profiles')
        .select('*, companies(*)')
        .eq('id', userId)
        .single();

      if (error) throw error;

      store.set('currentUser', this.formatUser(profile));
      store.set('currentCompany', profile.companies);

      return profile;
    } catch (error) {
      console.error('Erreur chargement profil:', error);
      return null;
    }
  }

  formatUser(profile) {
    return {
      id: profile.id,
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      fullName: `${profile.first_name} ${profile.last_name}`,
      role: profile.role,
      status: profile.status,
      companyId: profile.company_id,
      companyName: profile.companies?.name,
      plan: profile.plan || profile.companies?.plan,
      avatarUrl: profile.avatar_url,
      permissions: this.getRolePermissions(profile.role),
      createdAt: profile.created_at,
      lastLogin: profile.last_login
    };
  }

  getRolePermissions(role) {
    const permissions = {
      [CONFIG.ROLES.SUPER_ADMIN]: Object.values(CONFIG.PERMISSIONS),
      [CONFIG.ROLES.ADMIN]: [
        CONFIG.PERMISSIONS.READ, CONFIG.PERMISSIONS.WRITE, CONFIG.PERMISSIONS.DELETE,
        CONFIG.PERMISSIONS.SHARE, CONFIG.PERMISSIONS.VALIDATE_USERS,
        CONFIG.PERMISSIONS.MANAGE_ROLES, CONFIG.PERMISSIONS.MANAGE_BILLING,
        CONFIG.PERMISSIONS.VIEW_AUDIT, CONFIG.PERMISSIONS.MANAGE_WORKFLOWS,
        CONFIG.PERMISSIONS.SIGN_DOCUMENTS
      ],
      [CONFIG.ROLES.MANAGER]: [
        CONFIG.PERMISSIONS.READ, CONFIG.PERMISSIONS.WRITE, CONFIG.PERMISSIONS.DELETE,
        CONFIG.PERMISSIONS.SHARE, CONFIG.PERMISSIONS.VALIDATE_USERS,
        CONFIG.PERMISSIONS.MANAGE_WORKFLOWS, CONFIG.PERMISSIONS.SIGN_DOCUMENTS
      ],
      [CONFIG.ROLES.EDITOR]: [
        CONFIG.PERMISSIONS.READ, CONFIG.PERMISSIONS.WRITE, CONFIG.PERMISSIONS.SHARE,
        CONFIG.PERMISSIONS.SIGN_DOCUMENTS
      ],
      [CONFIG.ROLES.VIEWER]: [CONFIG.PERMISSIONS.READ]
    };
    return permissions[role] || permissions[CONFIG.ROLES.VIEWER];
  }

  // ═══ GESTION DES UTILISATEURS ═══

  async getCompanyUsers(companyId) {
    try {
      const { data, error } = await this.client
        .from('users_profiles')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { success: true, data: data.map(u => this.formatUser(u)) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async validateUser(userId) {
    try {
      const currentUser = store.get('currentUser');
      if (!currentUser?.permissions?.includes(CONFIG.PERMISSIONS.VALIDATE_USERS)) {
        return { success: false, error: 'Permission refusée' };
      }

      const { error } = await this.client
        .from('users_profiles')
        .update({ 
          status: 'active',
          validated_by: currentUser.id,
          validated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .eq('company_id', currentUser.companyId);

      if (error) throw error;

      // Envoyer notification à l'utilisateur
      await this.createNotification({
        userId: userId,
        type: 'account_validated',
        title: 'Compte validé',
        message: 'Votre compte a été validé par un administrateur'
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateUserRole(userId, newRole) {
    try {
      const currentUser = store.get('currentUser');
      if (!currentUser?.permissions?.includes(CONFIG.PERMISSIONS.MANAGE_ROLES)) {
        return { success: false, error: 'Permission refusée' };
      }

      const { error } = await this.client
        .from('users_profiles')
        .update({ role: newRole })
        .eq('id', userId)
        .eq('company_id', currentUser.companyId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ═══ DOCUMENTS ═══

  async uploadDocument(file, metadata) {
    try {
      const currentUser = store.get('currentUser');
      const company = store.get('currentCompany');

      // Vérifier l'espace de stockage
      const { data: usage } = await this.getStorageUsage(company.id);
      const newSize = usage.total + file.size;
      const maxStorage = CONFIG.plans[company.plan].storage;

      if (newSize > maxStorage) {
        return { success: false, error: 'Espace de stockage insuffisant' };
      }

      // Upload vers Supabase Storage
      const filePath = `${company.id}/${currentUser.id}/${Date.now()}_${file.name}`;
      
      const { data: uploadData, error: uploadError } = await this.client
        .storage
        .from(CONFIG.storageBucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type
        });

      if (uploadError) throw uploadError;

      // Obtenir l'URL publique
      const { data: { publicUrl } } = this.client
        .storage
        .from(CONFIG.storageBucket)
        .getPublicUrl(filePath);

      // Créer l'enregistrement dans la base
      const { data: doc, error: docError } = await this.client
        .from('documents')
        .insert({
          name: file.name,
          original_name: file.name,
          type: this.getFileType(file.name),
          mime_type: file.type,
          size: file.size,
          storage_path: filePath,
          public_url: publicUrl,
          description: metadata.description || '',
          scope: metadata.scope || 'company', // 'personal' ou 'company'
          owner_id: currentUser.id,
          company_id: company.id,
          folder_id: metadata.folderId || '__root__',
          tags: metadata.tags || [],
          version: 1,
          is_deleted: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (docError) throw docError;

      // Créer la première version
      await this.client.from('document_versions').insert({
        document_id: doc.id,
        version_number: 1,
        storage_path: filePath,
        size: file.size,
        created_by: currentUser.id,
        created_at: new Date().toISOString(),
        change_notes: 'Version initiale'
      });

      // Logger l'action
      await this.logAudit('document_created', doc.id, 'document', {
        name: doc.name,
        size: doc.size
      });

      return { success: true, data: doc };

    } catch (error) {
      console.error('Erreur upload:', error);
      return { success: false, error: error.message };
    }
  }

  async getDocuments(options = {}) {
    try {
      const currentUser = store.get('currentUser');
      const company = store.get('currentCompany');

      let query = this.client
        .from('documents')
        .select(`
          *,
          owner:owner_id(id, first_name, last_name, email),
          versions:document_versions(*),
          shares:document_shares(*)
        `)
        .eq('company_id', company.id)
        .eq('is_deleted', false);

      // Filtre par scope
      if (options.scope === 'personal') {
        query = query.eq('scope', 'personal').eq('owner_id', currentUser.id);
      } else if (options.scope === 'company') {
        query = query.eq('scope', 'company');
      } else {
        // Par défaut: documents company + documents personnels de l'utilisateur
        query = query.or(`scope.eq.company,and(scope.eq.personal,owner_id.eq.${currentUser.id})`);
      }

      // Filtre par dossier
      if (options.folderId) {
        query = query.eq('folder_id', options.folderId);
      }

      // Recherche
      if (options.search) {
        query = query.or(`name.ilike.%${options.search}%,description.ilike.%${options.search}%`);
      }

      // Filtre par tags
      if (options.tags && options.tags.length > 0) {
        query = query.contains('tags', options.tags);
      }

      // Tri
      const orderBy = options.orderBy || 'created_at';
      const order = options.order || 'desc';
      query = query.order(orderBy, { ascending: order === 'asc' });

      // Pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }

      const { data, error } = await query;

      if (error) throw error;

      return { success: true, data };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteDocument(documentId, permanent = false) {
    try {
      const currentUser = store.get('currentUser');
      
      if (permanent) {
        // Suppression définitive - vérifier les permissions
        const { data: doc } = await this.client
          .from('documents')
          .select('owner_id, storage_path')
          .eq('id', documentId)
          .single();

        const canDelete = doc.owner_id === currentUser.id || 
                         currentUser.permissions.includes(CONFIG.PERMISSIONS.DELETE);

        if (!canDelete) {
          return { success: false, error: 'Permission refusée' };
        }

        // Supprimer du storage
        await this.client.storage
          .from(CONFIG.storageBucket)
          .remove([doc.storage_path]);

        // Supprimer les versions
        await this.client
          .from('document_versions')
          .delete()
          .eq('document_id', documentId);

        // Supprimer le document
        await this.client
          .from('documents')
          .delete()
          .eq('id', documentId);

      } else {
        // Mise à la corbeille
        await this.client
          .from('documents')
          .update({ 
            is_deleted: true, 
            deleted_at: new Date().toISOString(),
            deleted_by: currentUser.id
          })
          .eq('id', documentId);
      }

      await this.logAudit('document_deleted', documentId, 'document', { permanent });
      return { success: true };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async shareDocument(documentId, recipientEmail, permissions = { read: true }) {
    try {
      const currentUser = store.get('currentUser');

      // Vérifier si le destinataire existe dans la même entreprise
      const { data: recipient } = await this.client
        .from('users_profiles')
        .select('id')
        .eq('email', recipientEmail)
        .eq('company_id', currentUser.companyId)
        .single();

      if (!recipient) {
        return { success: false, error: 'Utilisateur non trouvé dans votre entreprise' };
      }

      const { data: share, error } = await this.client
        .from('document_shares')
        .insert({
          document_id: documentId,
          owner_id: currentUser.id,
          recipient_id: recipient.id,
          recipient_email: recipientEmail,
          permissions: permissions,
          status: 'active',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Notification au destinataire
      await this.createNotification({
        userId: recipient.id,
        type: 'document_shared',
        title: 'Document partagé',
        message: `${currentUser.fullName} a partagé un document avec vous`,
        data: { documentId, shareId: share.id }
      });

      return { success: true, data: share };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ═══ DOSSIERS ═══

  async createFolder(name, parentId = '__root__') {
    try {
      const currentUser = store.get('currentUser');
      const company = store.get('currentCompany');

      const { data, error } = await this.client
        .from('folders')
        .insert({
          name,
          parent_id: parentId,
          company_id: company.id,
          created_by: currentUser.id,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getFolders(parentId = '__root__') {
    try {
      const company = store.get('currentCompany');

      const { data, error } = await this.client
        .from('folders')
        .select('*')
        .eq('company_id', company.id)
        .eq('parent_id', parentId)
        .order('name');

      if (error) throw error;
      return { success: true, data };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createDefaultFolders(companyId) {
    const defaultFolders = ['Contrats', 'Factures', 'Rapports', 'Ressources Humaines'];
    
    for (const folderName of defaultFolders) {
      await this.client.from('folders').insert({
        name: folderName,
        parent_id: '__root__',
        company_id: companyId,
        created_at: new Date().toISOString()
      });
    }
  }

  // ═══ WORKFLOWS ═══

  async createWorkflow(workflowData) {
    try {
      const currentUser = store.get('currentUser');
      const company = store.get('currentCompany');

      const { data, error } = await this.client
        .from('workflows')
        .insert({
          title: workflowData.title,
          description: workflowData.description,
          document_id: workflowData.documentId,
          company_id: company.id,
          created_by: currentUser.id,
          status: 'pending',
          priority: workflowData.priority || 'medium',
          steps: workflowData.steps || [],
          current_step: 0,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Créer les tâches pour chaque étape
      for (let i = 0; i < workflowData.steps.length; i++) {
        await this.client.from('workflow_tasks').insert({
          workflow_id: data.id,
          step_index: i,
          assignee_id: workflowData.steps[i].assigneeId,
          status: i === 0 ? 'pending' : 'waiting',
          due_date: workflowData.steps[i].dueDate
        });
      }

      return { success: true, data };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ═══ REALTIME / COLLABORATION ═══

  subscribeToDocuments(callback) {
    const company = store.get('currentCompany');
    if (!company) return;

    const channel = this.client
      .channel(`documents:${company.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'documents',
        filter: `company_id=eq.${company.id}`
      }, (payload) => {
        callback(payload);
      })
      .subscribe();

    this.realtimeChannels.set('documents', channel);
  }

  subscribeToMessages(callback) {
    const company = store.get('currentCompany');
    if (!company) return;

    const channel = this.client
      .channel(`messages:${company.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `company_id=eq.${company.id}`
      }, (payload) => {
        callback(payload.new);
      })
      .subscribe();

    this.realtimeChannels.set('messages', channel);
  }

  async sendMessage(content, attachments = []) {
    try {
      const currentUser = store.get('currentUser');
      const company = store.get('currentCompany');

      const { data, error } = await this.client
        .from('messages')
        .insert({
          company_id: company.id,
          sender_id: currentUser.id,
          content,
          attachments,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ═══ NOTIFICATIONS ═══

  async createNotification(notification) {
    try {
      const { error } = await this.client
        .from('notifications')
        .insert({
          user_id: notification.userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data || {},
          read: false,
          created_at: new Date().toISOString()
        });

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Erreur notification:', error);
      return { success: false };
    }
  }

  async getUnreadNotifications() {
    const currentUser = store.get('currentUser');
    
    const { data, error } = await this.client
      .from('notifications')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('read', false)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  // ═══ AUDIT & LOGS ═══

  async logAudit(action, targetId, targetType, metadata = {}) {
    try {
      const currentUser = store.get('currentUser');
      
      await this.client.from('audit_logs').insert({
        user_id: currentUser?.id,
        company_id: currentUser?.companyId,
        action,
        target_id: targetId,
        target_type: targetType,
        metadata,
        ip_address: await this.getClientIP(),
        user_agent: navigator.userAgent,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Erreur audit log:', error);
    }
  }

  async getAuditLogs(options = {}) {
    try {
      const company = store.get('currentCompany');
      
      let query = this.client
        .from('audit_logs')
        .select('*, user:user_id(email, first_name, last_name)')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false });

      if (options.days) {
        const since = new Date();
        since.setDate(since.getDate() - options.days);
        query = query.gte('created_at', since.toISOString());
      }

      const { data, error } = await query.limit(options.limit || 100);

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ═══ UTILITAIRES ═══

  async getStorageUsage(companyId) {
    try {
      const { data, error } = await this.client
        .from('documents')
        .select('size')
        .eq('company_id', companyId)
        .eq('is_deleted', false);

      if (error) throw error;

      const total = data.reduce((sum, doc) => sum + (doc.size || 0), 0);
      return { success: true, total, count: data.length };
    } catch (error) {
      return { success: false, total: 0, count: 0 };
    }
  }

  getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const types = {
      pdf: 'pdf',
      doc: 'doc', docx: 'doc',
      xls: 'xls', xlsx: 'xls',
      ppt: 'ppt', pptx: 'ppt',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
      mp4: 'video', mov: 'video', avi: 'video',
      mp3: 'audio', wav: 'audio',
      txt: 'text', md: 'text', json: 'text', xml: 'text',
      zip: 'archive', rar: 'archive', '7z': 'archive'
    };
    return types[ext] || 'unknown';
  }

  async getClientIP() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return 'unknown';
    }
  }
}

// Instance globale du service Supabase
const supabaseService = new SupabaseService();

// ═══════════════════════════════════════════════════════════════
// MODULE UI - Gestion de l'Interface
// ═══════════════════════════════════════════════════════════════

class UIManager {
  constructor() {
    this.modals = new Map();
    this.toastContainer = null;
    this.initToastContainer();
  }

  initToastContainer() {
    this.toastContainer = document.createElement('div');
    this.toastContainer.id = 'toast-container';
    this.toastContainer.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2';
    document.body.appendChild(this.toastContainer);
  }

  // ═══ NAVIGATION ═══

  initNavigation() {
    // Sidebar navigation
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const view = el.dataset.nav;
        this.switchView(view);
      });
    });

    // Mobile sidebar toggle
    const mobileToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (mobileToggle) {
      mobileToggle.addEventListener('click', () => {
        sidebar?.classList.toggle('open');
        overlay?.classList.toggle('active');
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar?.classList.remove('open');
        overlay.classList.remove('active');
      });
    }
  }

  switchView(viewName) {
    // Masquer toutes les vues
    document.querySelectorAll('.view-section').forEach(el => {
      el.classList.add('hidden');
    });

    // Afficher la vue demandée
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
      targetView.classList.remove('hidden');
    }

    // Mettre à jour la navigation active
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.classList.toggle('active', el.dataset.nav === viewName);
    });

    store.set('currentView', viewName);

    // Rendu spécifique à la vue
    this.renderView(viewName);

    // Fermer sidebar mobile
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('active');
  }

  renderView(viewName) {
    const renderers = {
      'dashboard': () => this.renderDashboard(),
      'documents': () => this.renderDocuments(),
      'folders': () => this.renderFolders(),
      'workflows': () => this.renderWorkflows(),
      'shared': () => this.renderShared(),
      'users': () => this.renderUsers(),
      'pending-users': () => this.renderPendingUsers(),
      'tags': () => this.renderTags(),
      'signatures': () => this.renderSignatures(),
      'chat': () => this.renderChat(),
      'settings': () => this.renderSettings(),
      'security': () => this.renderSecurity(),
      'audit': () => this.renderAudit(),
      'analytics': () => this.renderAnalytics()
    };

    if (renderers[viewName]) {
      renderers[viewName]();
    }
  }

  // ═══ RENDU DES VUES ═══

  async renderDashboard() {
    const company = store.get('currentCompany');
    const user = store.get('currentUser');

    // Mettre à jour les statistiques
    const stats = {
      documents: store.get('documents').length,
      users: store.get('users').length,
      storage: await supabaseService.getStorageUsage(company.id)
    };

    // Mettre à jour le DOM
    const updateElement = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    updateElement('statDocuments', stats.documents.total || 0);
    updateElement('statUsers', stats.users || 0);
    updateElement('statStorage', this.formatBytes(stats.storage.total || 0));

    // Documents récents
    this.renderRecentDocuments();
  }

  async renderDocuments() {
    const grid = document.getElementById('documentsGrid');
    if (!grid) return;

    const { success, data, error } = await supabaseService.getDocuments({
      scope: store.get('docsTab') || 'company',
      folderId: store.get('currentFolderId')
    });

    if (!success) {
      this.showToast(error, 'error');
      return;
    }

    store.set('documents', data || []);

    if (!data || data.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-12">
          <i class="fas fa-folder-open text-6xl text-blue-500/20 mb-4"></i>
          <p class="text-blue-300/60">Aucun document</p>
          <button onclick="uiManager.openModal('upload')" class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg">
            <i class="fas fa-plus mr-2"></i>Ajouter un document
          </button>
        </div>
      `;
      return;
    }

    grid.innerHTML = data.map(doc => this.createDocumentCard(doc)).join('');
  }

  createDocumentCard(doc) {
    const isOwner = doc.owner_id === store.get('currentUser')?.id;
    const icon = this.getFileIcon(doc.type);
    
    return `
      <div class="glass-card rounded-xl p-4 border border-blue-500/20 hover:border-blue-400/40 transition-all group relative" 
           data-doc-id="${doc.id}">
        <div class="flex items-start justify-between mb-3">
          <div class="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center ${icon.color}">
            <i class="fas ${icon.icon} text-2xl"></i>
          </div>
          <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
            <button onclick="app.downloadDocument('${doc.id}')" class="p-2 text-blue-400 hover:text-white" title="Télécharger">
              <i class="fas fa-download"></i>
            </button>
            <button onclick="app.shareDocument('${doc.id}')" class="p-2 text-blue-400 hover:text-white" title="Partager">
              <i class="fas fa-share-alt"></i>
            </button>
            ${isOwner ? `
              <button onclick="app.deleteDocument('${doc.id}')" class="p-2 text-red-400 hover:text-red-300" title="Supprimer">
                <i class="fas fa-trash"></i>
              </button>
            ` : ''}
          </div>
        </div>
        <h3 class="text-white font-medium truncate mb-1" title="${doc.name}">${doc.name}</h3>
        <p class="text-xs text-blue-300/60 mb-2">
          ${this.formatBytes(doc.size)} • ${this.formatDate(doc.created_at)}
        </p>
        <div class="flex items-center justify-between">
          <div class="flex flex-wrap gap-1">
            ${(doc.tags || []).map(tag => `
              <span class="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">${tag}</span>
            `).join('')}
          </div>
          <span class="text-xs ${doc.scope === 'personal' ? 'text-purple-400' : 'text-green-400'}">
            ${doc.scope === 'personal' ? '<i class="fas fa-lock"></i> Perso' : '<i class="fas fa-building"></i> Entreprise'}
          </span>
        </div>
      </div>
    `;
  }

  async renderFolders() {
    const container = document.getElementById('foldersList');
    if (!container) return;

    const { success, data } = await supabaseService.getFolders(store.get('currentFolderId'));
    
    if (success && data) {
      container.innerHTML = data.map(folder => `
        <div class="glass-card rounded-xl p-4 border border-yellow-500/20 cursor-pointer hover:border-yellow-400/40"
             onclick="app.openFolder('${folder.id}', '${folder.name}')">
          <div class="flex items-center gap-3">
            <i class="fas fa-folder text-yellow-400 text-2xl"></i>
            <span class="text-white font-medium">${folder.name}</span>
          </div>
        </div>
      `).join('');
    }
  }

  async renderUsers() {
    const container = document.getElementById('usersList');
    if (!container) return;

    const company = store.get('currentCompany');
    const { success, data } = await supabaseService.getCompanyUsers(company.id);

    if (success && data) {
      store.set('users', data);
      
      container.innerHTML = data.map(user => `
        <div class="glass-card rounded-xl p-4 border border-blue-500/20 mb-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
                ${user.fullName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 class="text-white font-semibold">${user.fullName}</h3>
                <p class="text-sm text-blue-300/60">${user.email}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-1 rounded text-xs ${this.getRoleBadgeClass(user.role)}">
                ${user.role}
              </span>
              <span class="px-2 py-1 rounded text-xs ${user.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}">
                ${user.status}
              </span>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  async renderPendingUsers() {
    const container = document.getElementById('pendingUsersList');
    if (!container) return;

    const company = store.get('currentCompany');
    const { success, data } = await supabaseService.getCompanyUsers(company.id);
    
    const pendingUsers = data?.filter(u => u.status === 'pending_validation') || [];

    if (pendingUsers.length === 0) {
      container.innerHTML = '<div class="text-center py-8 text-blue-300/50">Aucun utilisateur en attente</div>';
      return;
    }

    container.innerHTML = pendingUsers.map(user => `
      <div class="glass-card rounded-xl p-4 border border-yellow-500/20 mb-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-white font-semibold">${user.fullName}</h3>
            <p class="text-sm text-blue-300/60">${user.email}</p>
            <p class="text-xs text-yellow-400 mt-1">
              <i class="fas fa-clock mr-1"></i>En attente depuis ${this.formatDate(user.createdAt)}
            </p>
          </div>
          <div class="flex gap-2">
            <button onclick="app.validateUser('${user.id}')" class="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30">
              <i class="fas fa-check mr-2"></i>Valider
            </button>
            <button onclick="app.rejectUser('${user.id}')" class="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30">
              <i class="fas fa-times mr-2"></i>Refuser
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  async renderChat() {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    // S'abonner aux nouveaux messages
    supabaseService.subscribeToMessages((message) => {
      this.appendChatMessage(message);
    });

    // Charger l'historique
    const { data: messages } = await supabaseService.client
      .from('messages')
      .select('*, sender:sender_id(first_name, last_name)')
      .eq('company_id', store.get('currentCompany').id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (messages) {
      container.innerHTML = messages.reverse().map(msg => this.createChatMessage(msg)).join('');
      container.scrollTop = container.scrollHeight;
    }
  }

  createChatMessage(msg) {
    const isMe = msg.sender_id === store.get('currentUser')?.id;
    
    return `
      <div class="flex ${isMe ? 'justify-end' : 'justify-start'} mb-3">
        <div class="max-w-[70%] ${isMe ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-200'} rounded-lg px-4 py-2">
          ${!isMe ? `<p class="text-xs opacity-70 mb-1">${msg.sender?.first_name} ${msg.sender?.last_name}</p>` : ''}
          <p>${msg.content}</p>
          <p class="text-xs opacity-50 mt-1">${this.formatTime(msg.created_at)}</p>
        </div>
      </div>
    `;
  }

  appendChatMessage(msg) {
    const container = document.getElementById('chatMessages');
    if (container) {
      container.insertAdjacentHTML('beforeend', this.createChatMessage(msg));
      container.scrollTop = container.scrollHeight;
    }
  }

  // ═══ MODALS ═══

  openModal(modalId) {
    const modal = document.getElementById(`${modalId}Modal`);
    if (modal) {
      modal.classList.remove('hidden');
      this.modals.set(modalId, modal);
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(`${modalId}Modal`);
    if (modal) {
      modal.classList.add('hidden');
      this.modals.delete(modalId);
    }
  }

  // ═══ TOASTS ═══

  showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 ${
      type === 'success' ? 'bg-green-500 text-white' :
      type === 'error' ? 'bg-red-500 text-white' :
      type === 'warning' ? 'bg-yellow-500 text-black' :
      'bg-blue-500 text-white'
    }`;
    
    toast.innerHTML = `
      <div class="flex items-center gap-2">
        <i class="fas ${
          type === 'success' ? 'fa-check-circle' :
          type === 'error' ? 'fa-exclamation-circle' :
          type === 'warning' ? 'fa-exclamation-triangle' :
          'fa-info-circle'
        }"></i>
        <span>${message}</span>
      </div>
    `;

    this.toastContainer.appendChild(toast);

    // Animation d'entrée
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    });

    // Suppression automatique
    setTimeout(() => {
      toast.style.transform = 'translateX(100%)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ═══ UTILITAIRES ═══

  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatTime(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getFileIcon(type) {
    const icons = {
      pdf: { icon: 'fa-file-pdf', color: 'text-red-400' },
      doc: { icon: 'fa-file-word', color: 'text-blue-400' },
      xls: { icon: 'fa-file-excel', color: 'text-green-400' },
      ppt: { icon: 'fa-file-powerpoint', color: 'text-orange-400' },
      image: { icon: 'fa-file-image', color: 'text-purple-400' },
      video: { icon: 'fa-file-video', color: 'text-pink-400' },
      audio: { icon: 'fa-file-audio', color: 'text-yellow-400' },
      archive: { icon: 'fa-file-archive', color: 'text-gray-400' },
      text: { icon: 'fa-file-alt', color: 'text-gray-400' }
    };
    return icons[type] || { icon: 'fa-file', color: 'text-blue-400' };
  }

  getRoleBadgeClass(role) {
    const classes = {
      [CONFIG.ROLES.SUPER_ADMIN]: 'bg-purple-500/20 text-purple-400',
      [CONFIG.ROLES.ADMIN]: 'bg-red-500/20 text-red-400',
      [CONFIG.ROLES.MANAGER]: 'bg-orange-500/20 text-orange-400',
      [CONFIG.ROLES.EDITOR]: 'bg-blue-500/20 text-blue-400',
      [CONFIG.ROLES.VIEWER]: 'bg-gray-500/20 text-gray-400'
    };
    return classes[role] || 'bg-gray-500/20 text-gray-400';
  }
}

const uiManager = new UIManager();

// ═══════════════════════════════════════════════════════════════
// MODULE APPLICATION PRINCIPALE
// ═══════════════════════════════════════════════════════════════

class GEDApplication {
  constructor() {
    this.initialized = false;
  }

  async init() {
    try {
      console.log('🚀 Initialisation SystemesGED v7.0...');

      // Initialiser Supabase
      const supabaseReady = await supabaseService.initialize();
      
      if (!supabaseReady) {
        console.warn('⚠️ Mode hors-ligne activé');
      }

      // Initialiser l'UI
      uiManager.initNavigation();

      // Vérifier la session
      const session = store.get('session');
      if (session) {
        await this.loadApp();
      } else {
        this.showLoginScreen();
      }

      // Setup event listeners globaux
      this.setupEventListeners();

      this.initialized = true;
      console.log('✅ Application initialisée');

    } catch (error) {
      console.error('❌ Erreur initialisation:', error);
      uiManager.showToast('Erreur de démarrage', 'error');
    }
  }

  setupEventListeners() {
    // Formulaire de login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    // Formulaire d'inscription
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
      registerForm.addEventListener('submit', (e) => this.handleRegister(e));
    }

    // Upload de fichiers
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
      uploadForm.addEventListener('submit', (e) => this.handleUpload(e));
    }

    // Drag & drop
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
      
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
      });
      
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        this.handleFileDrop(e.dataTransfer.files);
      });
    }

    // Recherche
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', this.debounce((e) => {
        this.searchDocuments(e.target.value);
      }, 300));
    }
  }

  // ═══ AUTHENTIFICATION ═══

  async handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Connexion...';
    }

    const result = await supabaseService.signIn(email, password);

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Se connecter';
    }

    if (result.success) {
      uiManager.showToast(`Bienvenue ${result.user.first_name} !`, 'success');
      await this.loadApp();
    } else {
      uiManager.showToast(result.error, 'error');
    }
  }

  async handleRegister(e) {
    e.preventDefault();

    const userData = {
      firstName: document.getElementById('regFirstName').value.trim(),
      lastName: document.getElementById('regLastName').value.trim(),
      companyName: document.getElementById('regCompany').value.trim()
    };
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    const result = await supabaseService.signUp(email, password, userData);

    if (result.success) {
      if (result.requiresValidation) {
        uiManager.showToast('Compte créé ! En attente de validation par un administrateur.', 'warning');
      } else {
        uiManager.showToast('Compte créé avec succès !', 'success');
      }
      this.switchAuthTab('login');
    } else {
      uiManager.showToast(result.error, 'error');
    }
  }

  async handleLogout() {
    const result = await supabaseService.signOut();
    if (result.success) {
      this.showLoginScreen();
      uiManager.showToast('Déconnexion réussie', 'info');
    }
  }

  switchAuthTab(tab) {
    document.getElementById('loginForm')?.classList.toggle('hidden', tab !== 'login');
    document.getElementById('registerForm')?.classList.toggle('hidden', tab !== 'register');
    document.getElementById('tabLogin')?.classList.toggle('active', tab === 'login');
    document.getElementById('tabRegister')?.classList.toggle('active', tab === 'register');
  }

  // ═══ CHARGEMENT DE L'APPLICATION ═══

  async loadApp() {
    // Masquer login, afficher app
    document.getElementById('loginScreen')?.classList.add('hidden');
    document.getElementById('mainApp')?.classList.remove('hidden');

    // Mettre à jour l'affichage utilisateur
    this.updateUserDisplay();

    // Charger les données initiales
    await this.loadInitialData();

    // S'abonner aux mises à jour realtime
    this.setupRealtimeSubscriptions();

    // Aller au dashboard
    uiManager.switchView('dashboard');
  }

  showLoginScreen() {
    document.getElementById('loginScreen')?.classList.remove('hidden');
    document.getElementById('mainApp')?.classList.add('hidden');
  }

  updateUserDisplay() {
    const user = store.get('currentUser');
    const company = store.get('currentCompany');

    if (!user) return;

    // Mettre à jour les éléments du DOM
    const elements = {
      'userName': user.fullName,
      'userEmail': user.email,
      'userRole': user.role,
      'companyName': company?.name,
      'companyPlan': company?.plan?.toUpperCase()
    };

    Object.entries(elements).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });

    // Avatar
    const avatar = document.getElementById('userAvatar');
    if (avatar) {
      avatar.textContent = user.fullName.charAt(0).toUpperCase();
    }

    // Afficher/masquer les éléments selon les permissions
    const adminElements = document.querySelectorAll('[data-require-admin]');
    adminElements.forEach(el => {
      el.style.display = user.permissions.includes(CONFIG.PERMISSIONS.VALIDATE_USERS) ? '' : 'none';
    });
  }

  async loadInitialData() {
    const company = store.get('currentCompany');
    if (!company) return;

    // Charger en parallèle
    await Promise.all([
      this.loadDocuments(),
      this.loadUsers(),
      this.loadFolders()
    ]);
  }

  setupRealtimeSubscriptions() {
    // Documents
    supabaseService.subscribeToDocuments((payload) => {
      console.log('Realtime update:', payload);
      this.handleRealtimeUpdate(payload);
    });
  }

  handleRealtimeUpdate(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    switch (eventType) {
      case 'INSERT':
        store.push('documents', newRecord);
        break;
      case 'UPDATE':
        const docs = store.get('documents');
        const idx = docs.findIndex(d => d.id === newRecord.id);
        if (idx >= 0) {
          docs[idx] = { ...docs[idx], ...newRecord };
          store.set('documents', [...docs]);
        }
        break;
      case 'DELETE':
        store.remove('documents', d => d.id === oldRecord.id);
        break;
    }

    // Rafraîchir l'affichage si on est sur la vue documents
    if (store.get('currentView') === 'documents') {
      uiManager.renderDocuments();
    }
  }

  // ═══ DOCUMENTS ═══

  async loadDocuments() {
    const { success, data } = await supabaseService.getDocuments();
    if (success) {
      store.set('documents', data || []);
    }
  }

  async handleUpload(e) {
    e.preventDefault();
    
    const files = document.getElementById('fileInput').files;
    const scope = document.getElementById('uploadScope').value;
    const description = document.getElementById('uploadDescription').value;
    const tags = Array.from(document.querySelectorAll('.upload-tag')).map(el => el.dataset.tag);

    if (files.length === 0) {
      uiManager.showToast('Veuillez sélectionner un fichier', 'warning');
      return;
    }

    const progressBar = document.getElementById('uploadProgress');
    if (progressBar) progressBar.classList.remove('hidden');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (progressBar) {
        progressBar.style.width = `${((i + 0.5) / files.length) * 100}%`;
      }

      const result = await supabaseService.uploadDocument(file, {
        scope,
        description,
        tags,
        folderId: store.get('currentFolderId')
      });

      if (!result.success) {
        uiManager.showToast(`Erreur upload ${file.name}: ${result.error}`, 'error');
      }
    }

    if (progressBar) {
      progressBar.style.width = '100%';
      setTimeout(() => progressBar.classList.add('hidden'), 500);
    }

    uiManager.closeModal('upload');
    uiManager.showToast(`${files.length} document(s) uploadé(s)`, 'success');
    await this.loadDocuments();
    uiManager.renderDocuments();
  }

  handleFileDrop(files) {
    document.getElementById('fileInput').files = files;
    uiManager.openModal('upload');
  }

  async downloadDocument(docId) {
    const doc = store.get('documents').find(d => d.id === docId);
    if (!doc) return;

    try {
      const { data, error } = await supabaseService.client
        .storage
        .from(CONFIG.storageBucket)
        .download(doc.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      a.click();
      URL.revokeObjectURL(url);

      uiManager.showToast('Téléchargement démarré', 'success');
    } catch (error) {
      uiManager.showToast('Erreur de téléchargement', 'error');
    }
  }

  async deleteDocument(docId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce document ?')) return;

    const result = await supabaseService.deleteDocument(docId);
    
    if (result.success) {
      uiManager.showToast('Document supprimé', 'success');
      await this.loadDocuments();
      uiManager.renderDocuments();
    } else {
      uiManager.showToast(result.error, 'error');
    }
  }

  async shareDocument(docId) {
    const email = prompt('Email du destinataire:');
    if (!email) return;

    const result = await supabaseService.shareDocument(docId, email);
    
    if (result.success) {
      uiManager.showToast('Document partagé avec succès', 'success');
    } else {
      uiManager.showToast(result.error, 'error');
    }
  }

  searchDocuments(query) {
    if (!query) {
      uiManager.renderDocuments();
      return;
    }

    const docs = store.get('documents').filter(doc => 
      doc.name.toLowerCase().includes(query.toLowerCase()) ||
      doc.description?.toLowerCase().includes(query.toLowerCase())
    );

    // Mettre à jour l'affichage avec les résultats filtrés
    const grid = document.getElementById('documentsGrid');
    if (grid) {
      grid.innerHTML = docs.map(doc => uiManager.createDocumentCard(doc)).join('');
    }
  }

  // ═══ UTILISATEURS ═══

  async loadUsers() {
    const company = store.get('currentCompany');
    const { success, data } = await supabaseService.getCompanyUsers(company.id);
    if (success) {
      store.set('users', data || []);
    }
  }

  async validateUser(userId) {
    const result = await supabaseService.validateUser(userId);
    if (result.success) {
      uiManager.showToast('Utilisateur validé', 'success');
      await this.loadUsers();
      uiManager.renderPendingUsers();
    } else {
      uiManager.showToast(result.error, 'error');
    }
  }

  // ═══ DOSSIERS ═══

  async loadFolders() {
    const { success, data } = await supabaseService.getFolders(store.get('currentFolderId'));
    if (success) {
      store.set('folders', data || []);
    }
  }

  openFolder(id, name) {
    store.set('currentFolderId', id);
    
    const path = store.get('folderPath');
    const existingIdx = path.findIndex(p => p.id === id);
    
    if (existingIdx >= 0) {
      store.set('folderPath', path.slice(0, existingIdx + 1));
    } else {
      store.push('folderPath', { id, name });
    }

    this.loadDocuments();
    this.loadFolders();
    uiManager.renderFolders();
  }

  // ═══ CHAT ═══

  async sendChatMessage() {
    const input = document.getElementById('chatInput');
    const content = input?.value.trim();
    
    if (!content) return;

    const result = await supabaseService.sendMessage(content);
    
    if (result.success) {
      input.value = '';
    } else {
      uiManager.showToast('Erreur envoi message', 'error');
    }
  }

  // ═══ UTILITAIRES ═══

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}

// Instance globale de l'application
const app = new GEDApplication();

// ═══════════════════════════════════════════════════════════════
// INITIALISATION AU DÉMARRAGE
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});

// Exposer les fonctions globales nécessaires
window.app = app;
window.uiManager = uiManager;
window.store = store;
window.supabaseService = supabaseService;
window.CONFIG = CONFIG;
