// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEMESGED v6.0 - Application GED Collaborative SaaS
// Architecture: Modular Monolith | Supabase Backend | Multi-Tenant | Realtime
// Date: 2026-03-23
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 1: CONFIGURATION & CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Supabase Configuration
  supabase: {
    url: 'https://whkvtpqesqiailwjgoaq.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indoa3Z0cHFlc3FpYWlsd2pnb2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxOTU1ODIsImV4cCI6MjA4OTc3MTU4Mn0.oIEDNRvSAEsVTarXnIl1cMTLoqS1nsHo8dPnjdW0ng8',
    storageBucket: 'documents',
    realtimeEnabled: true
  },
  
  // Plans SaaS
  plans: {
    free: { 
      name: 'Free', 
      price: 0, 
      maxUsers: 5, 
      maxStorage: 1 * 1024 * 1024 * 1024, // 1GB
      features: ['basic_upload', 'basic_share', '5_users'],
      maxFileSize: 10 * 1024 * 1024 // 10MB
    },
    starter: { 
      name: 'Starter', 
      price: 29, 
      maxUsers: 20, 
      maxStorage: 10 * 1024 * 1024 * 1024, // 10GB
      features: ['basic_upload', 'versioning', 'advanced_share', '20_users'],
      maxFileSize: 50 * 1024 * 1024 // 50MB
    },
    professional: { 
      name: 'Professional', 
      price: 79, 
      maxUsers: 100, 
      maxStorage: 100 * 1024 * 1024 * 1024, // 100GB
      features: ['all_features', 'api_access', 'advanced_analytics', '100_users'],
      maxFileSize: 100 * 1024 * 1024 // 100MB
    },
    enterprise: { 
      name: 'Enterprise', 
      price: null, 
      maxUsers: Infinity, 
      maxStorage: Infinity,
      features: ['all_features', 'dedicated_support', 'sla', 'unlimited'],
      maxFileSize: 500 * 1024 * 1024 // 500MB
    }
  },
  
  // Rôles et Permissions
  roles: {
    admin: {
      name: 'Administrateur',
      level: 100,
      permissions: [
        'read', 'write', 'delete', 'share', 
        'manage_users', 'manage_company', 'manage_billing',
        'manage_workflows', 'view_analytics', 'manage_api',
        'validate_users', 'manage_signatures', 'admin_panel'
      ]
    },
    manager: {
      name: 'Manager',
      level: 70,
      permissions: [
        'read', 'write', 'delete', 'share',
        'view_users', 'manage_workflows', 'view_analytics'
      ]
    },
    editor: {
      name: 'Éditeur',
      level: 40,
      permissions: ['read', 'write', 'share']
    },
    viewer: {
      name: 'Lecteur',
      level: 10,
      permissions: ['read', 'share']
    }
  },
  
  // Types de documents supportés
  allowedMimeTypes: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ],
  
  // Paramètres UI
  ui: {
    debounceDelay: 300,
    toastDuration: 4000,
    itemsPerPage: 20,
    maxUploadFiles: 10
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 2: ÉTAT GLOBAL (State Management)
// ═══════════════════════════════════════════════════════════════════════════════

const Store = {
  // Session
  session: null,
  user: null,
  company: null,
  
  // Données
  documents: [],
  folders: [],
  users: [],
  workflows: [],
  shares: [],
  notifications: [],
  messages: [],
  tags: [],
  
  // UI State
  ui: {
    currentView: 'dashboard',
    currentFolderId: 'root',
    selectedFiles: [],
    viewMode: 'grid', // 'grid' | 'list'
    filters: {
      type: null,
      scope: 'all', // 'all' | 'company' | 'personal'
      tag: null,
      search: ''
    },
    modals: {
      upload: false,
      preview: false,
      share: false,
      workflow: false,
      settings: false
    }
  },
  
  // Realtime
  subscriptions: {},
  onlineUsers: [],
  
  // Cache
  cache: new Map(),
  
  // Méthodes utilitaires
  getUserCompanyId() {
    return this.user?.company_id || this.user?.companyId;
  },
  
  hasPermission(permission) {
    if (!this.user) return false;
    const role = CONFIG.roles[this.user.role || 'viewer'];
    return role?.permissions.includes(permission) || this.user.is_system_admin;
  },
  
  isAdmin() {
    return this.hasPermission('manage_users');
  },
  
  canAccessDocument(doc) {
    if (!doc || !this.user) return false;
    const companyId = this.getUserCompanyId();
    
    // Admin système peut tout voir
    if (this.user.is_system_admin) return true;
    
    // Vérifier company_id
    if (doc.company_id !== companyId) return false;
    
    // Document personnel: seul le propriétaire peut voir
    if (doc.scope === 'personal') {
      return doc.owner_id === this.user.id;
    }
    
    // Document entreprise: tous les membres de l'entreprise peuvent voir
    return true;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 3: UTILITAIRES
// ═══════════════════════════════════════════════════════════════════════════════

const Utils = {
  // Génération ID
  generateId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  },
  
  uuid() {
    return crypto.randomUUID ? crypto.randomUUID() : this.generateId();
  },
  
  // Formatage
  formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },
  
  formatDate(dateString, options = {}) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const defaultOptions = { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return date.toLocaleDateString('fr-FR', { ...defaultOptions, ...options });
  },
  
  formatRelativeDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
    if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)} j`;
    return this.formatDate(dateString, { year: undefined });
  },
  
  // Validation
  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },
  
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input.replace(/[<>]/g, '').trim();
  },
  
  // Debounce/Throttle
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
  },
  
  // File helpers
  getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
  },
  
  getFileIcon(filename, mimeType) {
    const ext = this.getFileExtension(filename);
    const iconMap = {
      pdf: { icon: 'fa-file-pdf', color: 'text-red-400', bg: 'bg-red-500/10' },
      doc: { icon: 'fa-file-word', color: 'text-blue-400', bg: 'bg-blue-500/10' },
      docx: { icon: 'fa-file-word', color: 'text-blue-400', bg: 'bg-blue-500/10' },
      xls: { icon: 'fa-file-excel', color: 'text-green-400', bg: 'bg-green-500/10' },
      xlsx: { icon: 'fa-file-excel', color: 'text-green-400', bg: 'bg-green-500/10' },
      ppt: { icon: 'fa-file-powerpoint', color: 'text-orange-400', bg: 'bg-orange-500/10' },
      pptx: { icon: 'fa-file-powerpoint', color: 'text-orange-400', bg: 'bg-orange-500/10' },
      jpg: { icon: 'fa-file-image', color: 'text-purple-400', bg: 'bg-purple-500/10' },
      jpeg: { icon: 'fa-file-image', color: 'text-purple-400', bg: 'bg-purple-500/10' },
      png: { icon: 'fa-file-image', color: 'text-purple-400', bg: 'bg-purple-500/10' },
      gif: { icon: 'fa-file-image', color: 'text-purple-400', bg: 'bg-purple-500/10' },
      txt: { icon: 'fa-file-alt', color: 'text-gray-400', bg: 'bg-gray-500/10' },
      csv: { icon: 'fa-file-csv', color: 'text-green-400', bg: 'bg-green-500/10' }
    };
    return iconMap[ext] || { icon: 'fa-file', color: 'text-blue-400', bg: 'bg-blue-500/10' };
  },
  
  isAllowedFileType(file) {
    return CONFIG.allowedMimeTypes.includes(file.type) || 
           file.type === '' || // Fallback pour fichiers sans type
           CONFIG.allowedMimeTypes.some(type => file.name.toLowerCase().endsWith(type.split('/').pop()));
  },
  
  // Deep clone
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },
  
  // Merge objects
  mergeDeep(target, source) {
    const output = Object.assign({}, target);
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) Object.assign(output, { [key]: source[key] });
          else output[key] = this.mergeDeep(target[key], source[key]);
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  },
  
  isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 4: GESTION SUPABASE
// ═══════════════════════════════════════════════════════════════════════════════

const SupabaseManager = {
  client: null,
  initialized: false,
  
  // Initialisation
  async init() {
    if (this.initialized) return true;
    
    try {
      if (typeof supabase === 'undefined') {
        console.warn('⚠️ Supabase library not loaded');
        return false;
      }
      
      this.client = supabase.createClient(
        CONFIG.supabase.url,
        CONFIG.supabase.anonKey,
        {
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
        }
      );
      
      // Test connection
      const { data: { session }, error } = await this.client.auth.getSession();
      
      if (error) {
        console.warn('⚠️ Supabase auth error:', error.message);
        return false;
      }
      
      this.initialized = true;
      console.log('✅ Supabase initialized');
      
      if (session) {
        await this.loadSession(session);
      }
      
      // Auth state listener
      this.client.auth.onAuthStateChange(async (event, session) => {
        console.log('🔐 Auth state changed:', event);
        if (event === 'SIGNED_IN' && session) {
          await this.loadSession(session);
          UI.initializeApp();
        } else if (event === 'SIGNED_OUT') {
          Store.session = null;
          Store.user = null;
          Store.company = null;
          UI.showLoginScreen();
        }
      });
      
      return true;
    } catch (err) {
      console.error('❌ Supabase init error:', err);
      return false;
    }
  },
  
  // Charger session
  async loadSession(session) {
    Store.session = session;
    
    // Charger profil utilisateur
    const { data: profile, error: profileError } = await this.client
      .from('profiles')
      .select('*, companies(*)')
      .eq('id', session.user.id)
      .single();
    
    if (profileError) {
      console.error('❌ Error loading profile:', profileError);
      return;
    }
    
    Store.user = profile;
    Store.company = profile.companies;
    
    console.log('👤 User loaded:', profile.email, '| Company:', profile.companies?.name);
  },
  
  // ═══ AUTHENTIFICATION ═══
  
  async signUp(email, password, userData) {
    try {
      // 1. Créer l'utilisateur dans Auth
      const { data: authData, error: authError } = await this.client.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: `${userData.firstName} ${userData.lastName}`,
            company_name: userData.companyName
          }
        }
      });
      
      if (authError) throw authError;
      if (!authData.user) throw new Error('User creation failed');
      
      // 2. Créer ou récupérer l'entreprise
      let companyId = Utils.uuid();
      const { data: existingCompany } = await this.client
        .from('companies')
        .select('id')
        .eq('name', userData.companyName)
        .single();
      
      if (existingCompany) {
        companyId = existingCompany.id;
      } else {
        const { error: companyError } = await this.client
          .from('companies')
          .insert({
            id: companyId,
            name: userData.companyName,
            plan: 'free',
            status: 'active'
          });
        
        if (companyError) throw companyError;
      }
      
      // 3. Créer le profil (en attente de validation)
      const { error: profileError } = await this.client
        .from('profiles')
        .insert({
          id: authData.user.id,
          email: email,
          name: `${userData.firstName} ${userData.lastName}`,
          role: 'admin', // Premier utilisateur = admin
          status: 'pending_validation',
          company_id: companyId,
          is_system_admin: false
        });
      
      if (profileError) throw profileError;
      
      // 4. Créer notification pour les admins
      await this.notifyCompanyAdmins(companyId, {
        type: 'user_pending',
        title: 'Nouvel utilisateur en attente',
        message: `${userData.firstName} ${userData.lastName} demande l'accès`
      });
      
      return { success: true, user: authData.user, message: 'Compte créé. En attente de validation.' };
    } catch (error) {
      console.error('❌ SignUp error:', error);
      return { success: false, error: error.message };
    }
  },
  
  async signIn(email, password) {
    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      
      // Vérifier le statut
      const { data: profile } = await this.client
        .from('profiles')
        .select('status, role, company_id')
        .eq('id', data.user.id)
        .single();
      
      if (profile?.status === 'pending_validation') {
        await this.client.auth.signOut();
        return { 
          success: false, 
          error: 'Votre compte est en attente de validation par un administrateur' 
        };
      }
      
      if (profile?.status === 'suspended') {
        await this.client.auth.signOut();
        return { success: false, error: 'Compte suspendu. Contactez l\'administrateur.' };
      }
      
      await this.loadSession(data.session);
      
      // Log audit
      await this.logAudit('login', { method: 'password' });
      
      return { success: true, user: data.user, session: data.session };
    } catch (error) {
      console.error('❌ SignIn error:', error);
      return { success: false, error: error.message };
    }
  },
  
  async signOut() {
    await this.logAudit('logout', {});
    await this.client.auth.signOut();
    Store.session = null;
    Store.user = null;
    Store.company = null;
  },
  
  async resetPassword(email) {
    try {
      const { error } = await this.client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) throw error;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // ═══ DATABASE OPERATIONS ═══
  
  async query(table, options = {}) {
    const companyId = Store.getUserCompanyId();
    if (!companyId && !options.skipCompanyCheck) {
      throw new Error('No company context');
    }
    
    let query = this.client.from(table).select(options.select || '*');
    
    // Filtre company_id automatique (RLS backup)
    if (companyId && !options.skipCompanyCheck) {
      query = query.eq('company_id', companyId);
    }
    
    // Filtres additionnels
    if (options.eq) {
      Object.entries(options.eq).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
    }
    
    if (options.neq) {
      Object.entries(options.neq).forEach(([key, value]) => {
        query = query.neq(key, value);
      });
    }
    
    if (options.in) {
      Object.entries(options.in).forEach(([key, values]) => {
        query = query.in(key, values);
      });
    }
    
    if (options.is) {
      Object.entries(options.is).forEach(([key, value]) => {
        query = query.is(key, value);
      });
    }
    
    if (options.order) {
      query = query.order(options.order.column, { 
        ascending: options.order.ascending ?? false 
      });
    }
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  },
  
  async insert(table, data, options = {}) {
    const companyId = Store.getUserCompanyId();
    
    // Ajouter metadata automatique
    const enrichedData = {
      ...data,
      company_id: data.company_id || companyId,
      created_at: new Date().toISOString(),
      ...(!data.id && { id: Utils.uuid() })
    };
    
    const { data: result, error } = await this.client
      .from(table)
      .insert(enrichedData)
      .select(options.select || '*')
      .single();
    
    if (error) throw error;
    
    // Audit log
    await this.logAudit('create', { 
      target_type: table, 
      target_id: result.id,
      details: { table, name: result.name || result.title }
    });
    
    return result;
  },
  
  async update(table, id, data, options = {}) {
    const companyId = Store.getUserCompanyId();
    
    const enrichedData = {
      ...data,
      updated_at: new Date().toISOString()
    };
    
    let query = this.client
      .from(table)
      .update(enrichedData)
      .eq('id', id);
    
    if (companyId && !options.skipCompanyCheck) {
      query = query.eq('company_id', companyId);
    }
    
    const { data: result, error } = await query
      .select(options.select || '*')
      .single();
    
    if (error) throw error;
    
    await this.logAudit('update', { 
      target_type: table, 
      target_id: id,
      details: { table, changes: Object.keys(data) }
    });
    
    return result;
  },
  
  async delete(table, id, options = {}) {
    const companyId = Store.getUserCompanyId();
    
    let query = this.client
      .from(table)
      .delete()
      .eq('id', id);
    
    if (companyId && !options.skipCompanyCheck) {
      query = query.eq('company_id', companyId);
    }
    
    const { error } = await query;
    
    if (error) throw error;
    
    await this.logAudit('delete', { 
      target_type: table, 
      target_id: id 
    });
    
    return true;
  },
  
  async softDelete(table, id) {
    return this.update(table, id, {
      is_deleted: true,
      deleted_at: new Date().toISOString()
    });
  },
  
  async restore(table, id) {
    return this.update(table, id, {
      is_deleted: false,
      deleted_at: null
    });
  },
  
  // ═══ STORAGE ═══
  
  async uploadFile(file, path, options = {}) {
    const companyId = Store.getUserCompanyId();
    const fullPath = `${companyId}/${path}`;
    
    const { data, error } = await this.client.storage
      .from(CONFIG.supabase.storageBucket)
      .upload(fullPath, file, {
        cacheControl: '3600',
        upsert: options.upsert || false,
        contentType: file.type
      });
    
    if (error) throw error;
    
    // Get public URL
    const { data: { publicUrl } } = this.client.storage
      .from(CONFIG.supabase.storageBucket)
      .getPublicUrl(fullPath);
    
    return {
      path: fullPath,
      publicUrl,
      size: file.size,
      mimeType: file.type
    };
  },
  
  async deleteFile(path) {
    const { error } = await this.client.storage
      .from(CONFIG.supabase.storageBucket)
      .remove([path]);
    
    if (error) throw error;
    return true;
  },
  
  async getFileUrl(path) {
    const { data: { publicUrl } } = this.client.storage
      .from(CONFIG.supabase.storageBucket)
      .getPublicUrl(path);
    return publicUrl;
  },
  
  // ═══ REALTIME ═══
  
  subscribe(channel, table, callback, filter = {}) {
    if (!this.client) return null;
    
    const companyId = Store.getUserCompanyId();
    const channelName = `${channel}:${companyId}`;
    
    const subscription = this.client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
          filter: companyId ? `company_id=eq.${companyId}` : undefined
        },
        (payload) => {
          console.log('📡 Realtime update:', table, payload.eventType);
          callback(payload);
        }
      )
      .subscribe();
    
    Store.subscriptions[channel] = subscription;
    return subscription;
  },
  
  unsubscribe(channel) {
    if (Store.subscriptions[channel]) {
      Store.subscriptions[channel].unsubscribe();
      delete Store.subscriptions[channel];
    }
  },
  
  // ═══ NOTIFICATIONS ═══
  
  async notifyCompanyAdmins(companyId, notification) {
    const { data: admins } = await this.client
      .from('profiles')
      .select('id')
      .eq('company_id', companyId)
      .eq('role', 'admin')
      .neq('id', Store.user?.id);
    
    if (!admins?.length) return;
    
    const notifications = admins.map(admin => ({
      user_id: admin.id,
      company_id: companyId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      read: false
    }));
    
    await this.client.from('notifications').insert(notifications);
  },
  
  async notifyUser(userId, notification) {
    await this.client.from('notifications').insert({
      user_id: userId,
      company_id: Store.getUserCompanyId(),
      type: notification.type,
      title: notification.title,
      message: notification.message,
      read: false
    });
  },
  
  // ═══ AUDIT LOG ═══
  
  async logAudit(action, details) {
    try {
      await this.client.from('audit_logs').insert({
        user_id: Store.user?.id,
        user_email: Store.user?.email,
        action: action,
        target_type: details.target_type,
        target_id: details.target_id,
        details: details.details || {},
        company_id: Store.getUserCompanyId(),
        ip_address: await this.getIPAddress()
      });
    } catch (e) {
      console.error('Audit log error:', e);
    }
  },
  
  async getIPAddress() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return 'unknown';
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 5: SERVICES MÉTIER - GED (Document Management)
// ═══════════════════════════════════════════════════════════════════════════════

const GEDService = {
  // ═══ DOCUMENTS ═══
  
  async getDocuments(options = {}) {
    const filters = {
      select: '*, owner:profiles!owner_id(name, email), folder:folders!folder_id(name)',
      order: { column: 'created_at', ascending: false },
      is: { is_deleted: false }
    };
    
    // Filtre scope
    if (options.scope === 'personal') {
      filters.eq = { ...filters.eq, scope: 'personal', owner_id: Store.user?.id };
    } else if (options.scope === 'company') {
      filters.eq = { ...filters.eq, scope: 'company' };
    }
    
    // Filtre dossier
    if (options.folderId) {
      filters.eq = { ...filters.eq, folder_id: options.folderId };
    }
    
    // Filtre type
    if (options.type) {
      filters.eq = { ...filters.eq, type: options.type };
    }
    
    // Filtre recherche
    if (options.search) {
      // Utiliser la recherche textuelle de Supabase
      const { data, error } = await SupabaseManager.client
        .from('documents')
        .select(filters.select)
        .textSearch('name', options.search)
        .eq('company_id', Store.getUserCompanyId())
        .eq('is_deleted', false);
      
      if (error) throw error;
      return data || [];
    }
    
    const documents = await SupabaseManager.query('documents', filters);
    
    // Filtrer les documents personnels des autres
    return documents.filter(doc => {
      if (doc.scope === 'personal') {
        return doc.owner_id === Store.user?.id || Store.isAdmin();
      }
      return true;
    });
  },
  
  async uploadDocument(file, metadata = {}) {
    // Validation
    if (!Utils.isAllowedFileType(file)) {
      throw new Error('Type de fichier non autorisé');
    }
    
    const plan = CONFIG.plans[Store.company?.plan || 'free'];
    if (file.size > plan.maxFileSize) {
      throw new Error(`Fichier trop volumineux. Limite: ${Utils.formatBytes(plan.maxFileSize)}`);
    }
    
    // Vérifier quota stockage
    const currentUsage = await this.getStorageUsage();
    if (currentUsage + file.size > plan.maxStorage) {
      throw new Error('Quota de stockage dépassé');
    }
    
    const docId = Utils.uuid();
    const fileExt = Utils.getFileExtension(file.name);
    const storagePath = `${docId}/${file.name}`;
    
    // 1. Upload fichier
    const uploadResult = await SupabaseManager.uploadFile(file, storagePath);
    
    // 2. Créer enregistrement document
    const document = await SupabaseManager.insert('documents', {
      name: file.name,
      original_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      type: this.getDocumentType(fileExt),
      size: file.size,
      description: metadata.description || '',
      scope: metadata.scope || 'company',
      owner_id: Store.user?.id,
      folder_id: metadata.folderId || 'root',
      tags: metadata.tags || [],
      storage_path: uploadResult.path,
      version: 1,
      views: 0,
      downloads: 0
    });
    
    // 3. Créer version initiale
    await SupabaseManager.insert('document_versions', {
      document_id: document.id,
      version: 1,
      storage_path: uploadResult.path,
      size: file.size,
      created_by: Store.user?.id,
      change_log: 'Création initiale'
    });
    
    // 4. Notification si partagé
    if (metadata.scope === 'company') {
      await SupabaseManager.notifyCompanyAdmins(Store.getUserCompanyId(), {
        type: 'document_uploaded',
        title: 'Nouveau document',
        message: `${Store.user.name} a ajouté ${file.name}`
      });
    }
    
    return document;
  },
  
  async createNewVersion(documentId, file, changeLog = '') {
    const doc = await this.getDocumentById(documentId);
    if (!doc) throw new Error('Document non trouvé');
    
    // Vérifier permissions
    if (doc.owner_id !== Store.user?.id && !Store.hasPermission('write')) {
      throw new Error('Permission refusée');
    }
    
    const newVersion = (doc.version || 1) + 1;
    const storagePath = `${doc.id}/v${newVersion}_${file.name}`;
    
    // Upload nouvelle version
    const uploadResult = await SupabaseManager.uploadFile(file, storagePath);
    
    // Créer enregistrement version
    await SupabaseManager.insert('document_versions', {
      document_id: doc.id,
      version: newVersion,
      storage_path: uploadResult.path,
      size: file.size,
      created_by: Store.user?.id,
      change_log: changeLog
    });
    
    // Mettre à jour document
    const updated = await SupabaseManager.update('documents', doc.id, {
      version: newVersion,
      size: file.size,
      storage_path: uploadResult.path,
      mime_type: file.type
    });
    
    return updated;
  },
  
  async getDocumentVersions(documentId) {
    return SupabaseManager.query('document_versions', {
      eq: { document_id: documentId },
      order: { column: 'version', ascending: false }
    });
  },
  
  async restoreVersion(documentId, versionId) {
    const versions = await this.getDocumentVersions(documentId);
    const version = versions.find(v => v.id === versionId);
    if (!version) throw new Error('Version non trouvée');
    
    const newVersion = versions.length + 1;
    
    // Copier le fichier
    const { data: fileData } = await SupabaseManager.client.storage
      .from(CONFIG.supabase.storageBucket)
      .download(version.storage_path);
    
    const newPath = `${documentId}/v${newVersion}_restored_${Date.now()}`;
    await SupabaseManager.uploadFile(fileData, newPath, { upsert: true });
    
    // Créer nouvelle version
    await SupabaseManager.insert('document_versions', {
      document_id: documentId,
      version: newVersion,
      storage_path: newPath,
      size: version.size,
      created_by: Store.user?.id,
      change_log: `Restauration version ${version.version}`
    });
    
    return SupabaseManager.update('documents', documentId, {
      version: newVersion,
      storage_path: newPath,
      size: version.size
    });
  },
  
  async getDocumentById(id) {
    const { data, error } = await SupabaseManager.client
      .from('documents')
      .select('*, owner:profiles!owner_id(name, email)')
      .eq('id', id)
      .eq('company_id', Store.getUserCompanyId())
      .single();
    
    if (error) throw error;
    return data;
  },
  
  async updateDocument(id, updates) {
    const allowedFields = ['name', 'description', 'scope', 'folder_id', 'tags'];
    const filteredUpdates = {};
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    });
    
    return SupabaseManager.update('documents', id, filteredUpdates);
  },
  
  async deleteDocument(id, permanent = false) {
    if (permanent && Store.hasPermission('delete')) {
      // Suppression définitive
      const doc = await this.getDocumentById(id);
      if (doc?.storage_path) {
        await SupabaseManager.deleteFile(doc.storage_path);
      }
      return SupabaseManager.delete('documents', id);
    } else {
      // Soft delete
      return SupabaseManager.softDelete('documents', id);
    }
  },
  
  async restoreDocument(id) {
    return SupabaseManager.restore('documents', id);
  },
  
  async incrementViews(id) {
    const { error } = await SupabaseManager.client.rpc('increment_document_views', {
      doc_id: id
    });
    if (error) {
      // Fallback si la fonction RPC n'existe pas
      await SupabaseManager.client
        .from('documents')
        .update({ views: SupabaseManager.client.raw('views + 1') })
        .eq('id', id);
    }
  },
  
  async downloadDocument(id) {
    const doc = await this.getDocumentById(id);
    if (!doc) throw new Error('Document non trouvé');
    
    // Incrémenter compteur
    await SupabaseManager.update('documents', id, {
      downloads: (doc.downloads || 0) + 1
    });
    
    // Générer URL signée (valide 1 heure)
    const { data, error } = await SupabaseManager.client.storage
      .from(CONFIG.supabase.storageBucket)
      .createSignedUrl(doc.storage_path, 3600);
    
    if (error) throw error;
    
    // Téléchargement
    const response = await fetch(data.signedUrl);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    return true;
  },
  
  async shareDocument(documentId, recipientEmail, permission = 'view') {
    const doc = await this.getDocumentById(documentId);
    if (!doc) throw new Error('Document non trouvé');
    
    // Vérifier si destinataire existe dans l'entreprise
    const { data: recipient } = await SupabaseManager.client
      .from('profiles')
      .select('id')
      .eq('email', recipientEmail)
      .eq('company_id', Store.getUserCompanyId())
      .single();
    
    if (!recipient) {
      throw new Error('Destinataire non trouvé dans votre entreprise');
    }
    
    const share = await SupabaseManager.insert('shares', {
      document_id: documentId,
      document_name: doc.name,
      sender_id: Store.user?.id,
      recipient_email: recipientEmail,
      recipient_id: recipient.id,
      permission: permission,
      status: 'active'
    });
    
    // Notification
    await SupabaseManager.notifyUser(recipient.id, {
      type: 'document_shared',
      title: 'Document partagé',
      message: `${Store.user.name} a partagé "${doc.name}" avec vous`
    });
    
    return share;
  },
  
  async getSharedWithMe() {
    return SupabaseManager.query('shares', {
      eq: { recipient_id: Store.user?.id, status: 'active' },
      select: '*, document:documents!document_id(*)'
    });
  },
  
  async getStorageUsage() {
    const { data, error } = await SupabaseManager.client
      .from('documents')
      .select('size')
      .eq('company_id', Store.getUserCompanyId())
      .eq('is_deleted', false);
    
    if (error) return 0;
    return data.reduce((sum, doc) => sum + (doc.size || 0), 0);
  },
  
  getDocumentType(extension) {
    const typeMap = {
      pdf: 'pdf',
      doc: 'doc', docx: 'doc',
      xls: 'xls', xlsx: 'xls',
      ppt: 'ppt', pptx: 'ppt',
      jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image',
      txt: 'text', csv: 'csv'
    };
    return typeMap[extension] || 'unknown';
  },
  
  // ═══ FOLDERS ═══
  
  async getFolders(parentId = 'root') {
    return SupabaseManager.query('folders', {
      eq: { parent_id: parentId },
      order: { column: 'name', ascending: true }
    });
  },
  
  async createFolder(name, parentId = 'root') {
    return SupabaseManager.insert('folders', {
      name: Utils.sanitizeInput(name),
      parent_id: parentId,
      owner_id: Store.user?.id
    });
  },
  
  async updateFolder(id, updates) {
    return SupabaseManager.update('folders', id, {
      name: Utils.sanitizeInput(updates.name)
    });
  },
  
  async deleteFolder(id) {
    // Vérifier si dossier contient des documents
    const docs = await SupabaseManager.query('documents', {
      eq: { folder_id: id, is_deleted: false }
    });
    
    if (docs.length > 0) {
      throw new Error('Le dossier contient des documents. Déplacez-les d\'abord.');
    }
    
    // Vérifier sous-dossiers
    const subfolders = await this.getFolders(id);
    if (subfolders.length > 0) {
      throw new Error('Le dossier contient des sous-dossiers. Supprimez-les d\'abord.');
    }
    
    return SupabaseManager.delete('folders', id);
  },
  
  async getFolderPath(folderId) {
    const path = [];
    let currentId = folderId;
    
    while (currentId && currentId !== 'root') {
      const { data: folder } = await SupabaseManager.client
        .from('folders')
        .select('id, name, parent_id')
        .eq('id', currentId)
        .single();
      
      if (!folder) break;
      path.unshift(folder);
      currentId = folder.parent_id;
    }
    
    path.unshift({ id: 'root', name: 'Racine' });
    return path;
  },
  
  // ═══ TAGS ═══
  
  async getTags() {
    return SupabaseManager.query('tags', {
      order: { column: 'name', ascending: true }
    });
  },
  
  async createTag(name, color = '#3b82f6') {
    return SupabaseManager.insert('tags', {
      name: Utils.sanitizeInput(name),
      color: color
    });
  },
  
  async deleteTag(id) {
    return SupabaseManager.delete('tags', id);
  },
  
  // ═══ COMMENTAIRES ═══
  
  async getComments(documentId) {
    return SupabaseManager.query('document_comments', {
      eq: { document_id: documentId },
      select: '*, author:profiles!user_id(name, email)',
      order: { column: 'created_at', ascending: true }
    });
  },
  
  async addComment(documentId, content) {
    const comment = await SupabaseManager.insert('document_comments', {
      document_id: documentId,
      user_id: Store.user?.id,
      content: Utils.sanitizeInput(content)
    });
    
    // Notifier le propriétaire du document
    const doc = await this.getDocumentById(documentId);
    if (doc && doc.owner_id !== Store.user?.id) {
      await SupabaseManager.notifyUser(doc.owner_id, {
        type: 'comment_added',
        title: 'Nouveau commentaire',
        message: `${Store.user.name} a commenté "${doc.name}"`
      });
    }
    
    return comment;
  },
  
  async deleteComment(id) {
    return SupabaseManager.delete('document_comments', id);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 6: SERVICES MÉTIER - COLLABORATION & CHAT
// ═══════════════════════════════════════════════════════════════════════════════

const CollaborationService = {
  // ═══ CHAT ENTRE COLLÈGUES ═══
  
  async getConversations() {
    const companyId = Store.getUserCompanyId();
    
    const { data, error } = await SupabaseManager.client
      .from('conversations')
      .select(`
        *,
        participants:conversation_participants!conversation_id(
          user:profiles!user_id(id, name, email)
        ),
        last_message:messages!conversation_id(content, created_at, sender_id)
      `)
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },
  
  async getOrCreateConversation(userId) {
    const companyId = Store.getUserCompanyId();
    const currentUserId = Store.user?.id;
    
    // Chercher conversation existante
    const { data: existing } = await SupabaseManager.client
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', currentUserId)
      .in('conversation_id', SupabaseManager.client
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId)
      );
    
    if (existing?.length > 0) {
      return existing[0].conversation_id;
    }
    
    // Créer nouvelle conversation
    const { data: conversation } = await SupabaseManager.client
      .from('conversations')
      .insert({ company_id: companyId, type: 'direct' })
      .select()
      .single();
    
    // Ajouter participants
    await SupabaseManager.client.from('conversation_participants').insert([
      { conversation_id: conversation.id, user_id: currentUserId },
      { conversation_id: conversation.id, user_id: userId }
    ]);
    
    return conversation.id;
  },
  
  async getMessages(conversationId, options = {}) {
    const query = SupabaseManager.client
      .from('messages')
      .select('*, sender:profiles!sender_id(name, email)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(options.limit || 50);
    
    if (options.before) {
      query.lt('created_at', options.before);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data.reverse(); // Ordre chronologique
  },
  
  async sendMessage(conversationId, content, attachments = []) {
    const message = await SupabaseManager.insert('messages', {
      conversation_id: conversationId,
      sender_id: Store.user?.id,
      content: Utils.sanitizeInput(content),
      attachments: attachments
    });
    
    // Mettre à jour conversation
    await SupabaseManager.client
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);
    
    // Notifier autres participants
    const { data: participants } = await SupabaseManager.client
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', Store.user?.id);
    
    participants?.forEach(async (p) => {
      await SupabaseManager.notifyUser(p.user_id, {
        type: 'new_message',
        title: `Message de ${Store.user.name}`,
        message: content.substring(0, 100) + (content.length > 100 ? '...' : '')
      });
    });
    
    return message;
  },
  
  subscribeToMessages(conversationId, callback) {
    return SupabaseManager.subscribe(
      `chat:${conversationId}`,
      'messages',
      (payload) => {
        if (payload.eventType === 'INSERT') {
          callback(payload.new);
        }
      },
      { conversation_id: conversationId }
    );
  },
  
  // ═══ PRÉSENCE EN LIGNE ═══
  
  async updatePresence(status = 'online') {
    await SupabaseManager.client
      .from('user_presence')
      .upsert({
        user_id: Store.user?.id,
        company_id: Store.getUserCompanyId(),
        status: status,
        last_seen: new Date().toISOString()
      });
  },
  
  async getOnlineUsers() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data, error } = await SupabaseManager.client
      .from('user_presence')
      .select('*, user:profiles!user_id(name, email)')
      .eq('company_id', Store.getUserCompanyId())
      .eq('status', 'online')
      .gte('last_seen', fiveMinutesAgo);
    
    if (error) return [];
    return data || [];
  },
  
  subscribeToPresence(callback) {
    return SupabaseManager.subscribe(
      'presence',
      'user_presence',
      (payload) => {
        callback(payload);
      }
    );
  },
  
  // ═══ COLLABORATION DOCUMENTS ═══
  
  async lockDocument(documentId) {
    const { data, error } = await SupabaseManager.client
      .from('document_locks')
      .insert({
        document_id: documentId,
        user_id: Store.user?.id,
        locked_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      // Déjà verrouillé
      const { data: existing } = await SupabaseManager.client
        .from('document_locks')
        .select('*, user:profiles!user_id(name)')
        .eq('document_id', documentId)
        .single();
      
      throw new Error(`Document verrouillé par ${existing?.user?.name || 'un autre utilisateur'}`);
    }
    
    return data;
  },
  
  async unlockDocument(documentId) {
    await SupabaseManager.client
      .from('document_locks')
      .delete()
      .eq('document_id', documentId)
      .eq('user_id', Store.user?.id);
  },
  
  async getDocumentLock(documentId) {
    const { data } = await SupabaseManager.client
      .from('document_locks')
      .select('*, user:profiles!user_id(name, email)')
      .eq('document_id', documentId)
      .single();
    return data;
  },
  
  subscribeToDocumentChanges(documentId, callback) {
    return SupabaseManager.subscribe(
      `doc:${documentId}`,
      'documents',
      (payload) => {
        if (payload.eventType === 'UPDATE') {
          callback(payload.new);
        }
      },
      { id: documentId }
    );
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 7: SERVICES MÉTIER - WORKFLOWS & SIGNATURES
// ═══════════════════════════════════════════════════════════════════════════════

const WorkflowService = {
  // ═══ WORKFLOWS ═══
  
  async getWorkflows(options = {}) {
    const filters = {
      order: { column: 'created_at', ascending: false }
    };
    
    if (options.status) {
      filters.eq = { status: options.status };
    }
    
    if (options.assignee) {
      filters.eq = { ...filters.eq, assignee_id: options.assignee };
    }
    
    return SupabaseManager.query('workflows', {
      ...filters,
      select: '*, assignee:profiles!assignee_id(name, email), creator:profiles!created_by(name), document:documents!document_id(name)'
    });
  },
  
  async createWorkflow(data) {
    const workflow = await SupabaseManager.insert('workflows', {
      title: data.title,
      description: data.description,
      status: 'pending',
      priority: data.priority || 'medium',
      document_id: data.documentId,
      assignee_id: data.assigneeId,
      due_date: data.dueDate,
      steps: data.steps || [{ name: 'Créé', status: 'completed', completed_at: new Date().toISOString() }]
    });
    
    // Notifier assignee
    if (data.assigneeId) {
      await SupabaseManager.notifyUser(data.assigneeId, {
        type: 'workflow_assigned',
        title: 'Nouveau workflow assigné',
        message: `Vous avez été assigné à: ${data.title}`
      });
    }
    
    return workflow;
  },
  
  async updateWorkflowStatus(id, status, comment = '') {
    const workflow = await SupabaseManager.update('workflows', id, {
      status: status,
      updated_at: new Date().toISOString()
    });
    
    // Ajouter commentaire si fourni
    if (comment) {
      await SupabaseManager.insert('workflow_comments', {
        workflow_id: id,
        user_id: Store.user?.id,
        content: comment
      });
    }
    
    return workflow;
  },
  
  // ═══ SIGNATURES ÉLECTRONIQUES ═══
  
  async requestSignature(documentId, signers) {
    const doc = await GEDService.getDocumentById(documentId);
    if (!doc) throw new Error('Document non trouvé');
    
    const signatureRequest = await SupabaseManager.insert('signature_requests', {
      document_id: documentId,
      document_name: doc.name,
      requester_id: Store.user?.id,
      status: 'pending',
      signers: signers.map((s, index) => ({
        ...s,
        order: index + 1,
        status: 'pending'
      }))
    });
    
    // Notifier premier signataire
    if (signers.length > 0) {
      await this.notifySigner(signatureRequest.id, signers[0].email);
    }
    
    return signatureRequest;
  },
  
  async notifySigner(requestId, signerEmail) {
    // Envoyer email (via Edge Function ou service externe)
    const { error } = await SupabaseManager.client.functions.invoke('send-signature-email', {
      body: {
        requestId,
        signerEmail,
        documentName: Store.documents.find(d => d.id === requestId)?.name
      }
    });
    
    if (error) {
      console.error('Failed to send signature email:', error);
    }
  },
  
  async submitSignature(requestId, signatureData, signerEmail) {
    const { data: request } = await SupabaseManager.client
      .from('signature_requests')
      .select('*')
      .eq('id', requestId)
      .single();
    
    if (!request) throw new Error('Demande de signature non trouvée');
    
    // Mettre à jour le signataire
    const updatedSigners = request.signers.map(s => {
      if (s.email === signerEmail) {
        return {
          ...s,
          status: 'signed',
          signed_at: new Date().toISOString(),
          signature_data: signatureData
        };
      }
      return s;
    });
    
    // Vérifier si tous ont signé
    const allSigned = updatedSigners.every(s => s.status === 'signed');
    
    await SupabaseManager.update('signature_requests', requestId, {
      signers: updatedSigners,
      status: allSigned ? 'completed' : 'pending'
    });
    
    // Notifier suivant ou requester
    if (!allSigned) {
      const nextSigner = updatedSigners.find(s => s.status === 'pending');
      if (nextSigner) {
        await this.notifySigner(requestId, nextSigner.email);
      }
    } else {
      await SupabaseManager.notifyUser(request.requester_id, {
        type: 'signature_completed',
        title: 'Signature terminée',
        message: `Tous les signataires ont signé "${request.document_name}"`
      });
    }
    
    return { completed: allSigned };
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 8: SERVICES MÉTIER - UTILISATEURS & ADMIN
// ═══════════════════════════════════════════════════════════════════════════════

const UserService = {
  // ═══ GESTION UTILISATEURS ═══
  
  async getCompanyUsers(options = {}) {
    const filters = {};
    if (options.status) {
      filters.eq = { status: options.status };
    }
    if (options.role) {
      filters.eq = { ...filters.eq, role: options.role };
    }
    
    return SupabaseManager.query('profiles', {
      ...filters,
      order: { column: 'created_at', ascending: false },
      select: '*, company:companies!company_id(name, plan)'
    });
  },
  
  async getPendingUsers() {
    return this.getCompanyUsers({ status: 'pending_validation' });
  },
  
  async validateUser(userId) {
    if (!Store.hasPermission('validate_users')) {
      throw new Error('Permission refusée');
    }
    
    const user = await SupabaseManager.update('profiles', userId, {
      status: 'active',
      validated_at: new Date().toISOString(),
      validated_by: Store.user?.id
    });
    
    // Notifier l'utilisateur
    await SupabaseManager.notifyUser(userId, {
      type: 'account_approved',
      title: 'Compte approuvé',
      message: 'Votre compte a été validé. Vous pouvez maintenant vous connecter.'
    });
    
    return user;
  },
  
  async rejectUser(userId, reason = '') {
    if (!Store.hasPermission('validate_users')) {
      throw new Error('Permission refusée');
    }
    
    await SupabaseManager.update('profiles', userId, {
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_by: Store.user?.id,
      rejection_reason: reason
    });
    
    await SupabaseManager.notifyUser(userId, {
      type: 'account_rejected',
      title: 'Compte refusé',
      message: reason || 'Votre demande d\'accès a été refusée.'
    });
  },
  
  async inviteUser(email, role = 'viewer') {
    if (!Store.hasPermission('manage_users')) {
      throw new Error('Permission refusée');
    }
    
    // Vérifier limite utilisateurs
    const plan = CONFIG.plans[Store.company?.plan || 'free'];
    const currentUsers = await this.getCompanyUsers();
    
    if (currentUsers.length >= plan.maxUsers) {
      throw new Error(`Limite d'utilisateurs atteinte (${plan.maxUsers}). Passez à un plan supérieur.`);
    }
    
    // Créer invitation
    const invitation = await SupabaseManager.insert('user_invitations', {
      email: email,
      role: role,
      invited_by: Store.user?.id,
      company_id: Store.getUserCompanyId(),
      status: 'pending'
    });
    
    // Envoyer email d'invitation
    await SupabaseManager.client.functions.invoke('send-invitation-email', {
      body: {
        email,
        role,
        companyName: Store.company?.name,
        invitedBy: Store.user?.name
      }
    });
    
    return invitation;
  },
  
  async updateUserRole(userId, newRole) {
    if (!Store.hasPermission('manage_users')) {
      throw new Error('Permission refusée');
    }
    
    // Empêcher de se rétrograder soi-même si dernier admin
    if (newRole !== 'admin') {
      const admins = await this.getCompanyUsers({ role: 'admin' });
      const targetUser = admins.find(a => a.id === userId);
      
      if (targetUser && admins.length === 1) {
        throw new Error('Impossible de modifier le dernier administrateur');
      }
    }
    
    return SupabaseManager.update('profiles', userId, { role: newRole });
  },
  
  async suspendUser(userId) {
    if (!Store.hasPermission('manage_users')) {
      throw new Error('Permission refusée');
    }
    
    return SupabaseManager.update('profiles', userId, {
      status: 'suspended',
      suspended_at: new Date().toISOString(),
      suspended_by: Store.user?.id
    });
  },
  
  async deleteUser(userId) {
    if (!Store.hasPermission('manage_users')) {
      throw new Error('Permission refusée');
    }
    
    // Transférer documents à l'admin
    const { data: userDocs } = await SupabaseManager.client
      .from('documents')
      .select('id')
      .eq('owner_id', userId)
      .eq('company_id', Store.getUserCompanyId());
    
    for (const doc of (userDocs || [])) {
      await SupabaseManager.update('documents', doc.id, {
        owner_id: Store.user?.id
      });
    }
    
    // Supprimer profil (l'utilisateur Auth reste, désactivé)
    await SupabaseManager.delete('profiles', userId);
    
    return true;
  },
  
  // ═══ NOTIFICATIONS ═══
  
  async getNotifications(options = {}) {
    const filters = {
      eq: { read: false },
      order: { column: 'created_at', ascending: false }
    };
    
    if (options.all) {
      delete filters.eq.read;
    }
    
    if (options.limit) {
      filters.limit = options.limit;
    }
    
    return SupabaseManager.query('notifications', filters);
  },
  
  async markNotificationRead(id) {
    return SupabaseManager.update('notifications', id, { read: true });
  },
  
  async markAllNotificationsRead() {
    await SupabaseManager.client
      .from('notifications')
      .update({ read: true })
      .eq('user_id', Store.user?.id)
      .eq('read', false);
  },
  
  subscribeToNotifications(callback) {
    return SupabaseManager.subscribe(
      'notifications',
      'notifications',
      (payload) => {
        if (payload.eventType === 'INSERT') {
          callback(payload.new);
        }
      },
      { user_id: Store.user?.id }
    );
  },
  
  // ═══ ANALYTICS ═══
  
  async getDashboardStats() {
    const companyId = Store.getUserCompanyId();
    
    const [docs, workflows, users, storage] = await Promise.all([
      SupabaseManager.client.from('documents')
        .select('id', { count: 'exact' })
        .eq('company_id', companyId)
        .eq('is_deleted', false),
      SupabaseManager.client.from('workflows')
        .select('id', { count: 'exact' })
        .eq('company_id', companyId)
        .in('status', ['pending', 'in_progress']),
      SupabaseManager.client.from('profiles')
        .select('id', { count: 'exact' })
        .eq('company_id', companyId)
        .eq('status', 'active'),
      this.getStorageUsage()
    ]);
    
    return {
      totalDocuments: docs.count || 0,
      activeWorkflows: workflows.count || 0,
      activeUsers: users.count || 0,
      storageUsed: storage,
      storageLimit: CONFIG.plans[Store.company?.plan || 'free'].maxStorage
    };
  },
  
  async getStorageUsage() {
    const { data } = await SupabaseManager.client
      .from('documents')
      .select('size')
      .eq('company_id', Store.getUserCompanyId())
      .eq('is_deleted', false);
    
    return (data || []).reduce((sum, doc) => sum + (doc.size || 0), 0);
  },
  
  async getRecentActivity(limit = 10) {
    return SupabaseManager.query('audit_logs', {
      order: { column: 'created_at', ascending: false },
      limit: limit,
      select: '*, user:profiles!user_id(name)'
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 9: INTERFACE UTILISATEUR (UI Layer)
// ═══════════════════════════════════════════════════════════════════════════════

const UI = {
  // ═══ INITIALISATION ═══
  
  async init() {
    // Initialiser Supabase
    const supabaseReady = await SupabaseManager.init();
    
    if (!supabaseReady) {
      this.showToast('Erreur de connexion au serveur', 'error');
      return;
    }
    
    // Vérifier session existante
    const session = await SupabaseManager.client.auth.getSession();
    if (session.data.session) {
      await this.initializeApp();
    } else {
      this.showLoginScreen();
    }
    
    // Setup event listeners globaux
    this.setupGlobalListeners();
  },
  
  setupGlobalListeners() {
    // Fermer modals avec Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });
    
    // Gestion erreurs réseau
    window.addEventListener('online', () => {
      this.showToast('Connexion rétablie', 'success');
    });
    
    window.addEventListener('offline', () => {
      this.showToast('Mode hors ligne - Données en cache', 'warning');
    });
  },
  
  // ═══ AUTH SCREENS ═══
  
  showLoginScreen() {
    document.getElementById('loginScreen')?.classList.remove('hidden');
    document.getElementById('mainApp')?.classList.add('hidden');
    
    // Reset forms
    document.getElementById('loginForm')?.reset();
    document.getElementById('registerForm')?.reset();
  },
  
  showMainApp() {
    document.getElementById('loginScreen')?.classList.add('hidden');
    document.getElementById('mainApp')?.classList.remove('hidden');
  },
  
  async initializeApp() {
    this.showMainApp();
    
    // Charger données initiales
    await this.loadInitialData();
    
    // Setup subscriptions realtime
    this.setupRealtimeSubscriptions();
    
    // Rendu initial
    this.switchView('dashboard');
    
    // Update présence
    await CollaborationService.updatePresence('online');
    
    // Ping présence toutes les 30s
    setInterval(() => CollaborationService.updatePresence('online'), 30000);
  },
  
  async loadInitialData() {
    try {
      const [docs, folders, users, workflows, notifications, tags] = await Promise.all([
        GEDService.getDocuments(),
        GEDService.getFolders(),
        UserService.getCompanyUsers(),
        WorkflowService.getWorkflows(),
        UserService.getNotifications({ limit: 20 }),
        GEDService.getTags()
      ]);
      
      Store.documents = docs;
      Store.folders = folders;
      Store.users = users;
      Store.workflows = workflows;
      Store.notifications = notifications;
      Store.tags = tags;
      
      this.updateBadges();
    } catch (error) {
      console.error('Error loading initial data:', error);
      this.showToast('Erreur chargement données', 'error');
    }
  },
  
  setupRealtimeSubscriptions() {
    // Documents
    SupabaseManager.subscribe('documents', 'documents', (payload) => {
      if (payload.eventType === 'INSERT') {
        if (Store.canAccessDocument(payload.new)) {
          Store.documents.unshift(payload.new);
          this.updateDocumentsView();
        }
      } else if (payload.eventType === 'UPDATE') {
        const idx = Store.documents.findIndex(d => d.id === payload.new.id);
        if (idx >= 0) {
          Store.documents[idx] = { ...Store.documents[idx], ...payload.new };
          this.updateDocumentsView();
        }
      } else if (payload.eventType === 'DELETE') {
        Store.documents = Store.documents.filter(d => d.id !== payload.old.id);
        this.updateDocumentsView();
      }
    });
    
    // Notifications
    UserService.subscribeToNotifications((notification) => {
      Store.notifications.unshift(notification);
      this.updateNotificationBadge();
      this.showToast(notification.title, 'info');
    });
    
    // Présence
    CollaborationService.subscribeToPresence((payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const existing = Store.onlineUsers.find(u => u.user_id === payload.new.user_id);
        if (!existing) {
          Store.onlineUsers.push(payload.new);
        } else {
          existing.status = payload.new.status;
          existing.last_seen = payload.new.last_seen;
        }
        this.updateOnlineUsersIndicator();
      }
    });
  },
  
  // ═══ NAVIGATION ═══
  
  switchView(viewName, params = {}) {
    // Cacher toutes les vues
    document.querySelectorAll('.view-section').forEach(el => {
      el.classList.add('hidden');
    });
    
    // Afficher vue cible
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
      targetView.classList.remove('hidden');
    }
    
    // Update navigation active state
    document.querySelectorAll('[data-view]').forEach(el => {
      el.classList.toggle('active', el.dataset.view === viewName);
    });
    
    Store.ui.currentView = viewName;
    
    // Rendu spécifique à la vue
    switch(viewName) {
      case 'dashboard': this.renderDashboard(); break;
      case 'documents': this.renderDocuments(); break;
      case 'folders': this.renderFolders(); break;
      case 'shared': this.renderShared(); break;
      case 'workflows': this.renderWorkflows(); break;
      case 'users': this.renderUsers(); break;
      case 'chat': this.renderChat(); break;
      case 'notifications': this.renderNotifications(); break;
      case 'settings': this.renderSettings(); break;
      case 'admin': this.renderAdmin(); break;
    }
    
    // Fermer sidebar mobile
    this.closeMobileSidebar();
  },
  
  // ═══ RENDU VUES ═══
  
  async renderDashboard() {
    const stats = await UserService.getDashboardStats();
    const recentActivity = await UserService.getRecentActivity(10);
    
    const container = document.getElementById('dashboardContent');
    if (!container) return;
    
    const storagePercent = Math.round((stats.storageUsed / stats.storageLimit) * 100);
    
    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="stat-card">
          <div class="stat-icon bg-blue-500/20 text-blue-400">
            <i class="fas fa-file-alt"></i>
          </div>
          <div class="stat-info">
            <h3 class="stat-value">${stats.totalDocuments}</h3>
            <p class="stat-label">Documents</p>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon bg-orange-500/20 text-orange-400">
            <i class="fas fa-project-diagram"></i>
          </div>
          <div class="stat-info">
            <h3 class="stat-value">${stats.activeWorkflows}</h3>
            <p class="stat-label">Workflows actifs</p>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon bg-green-500/20 text-green-400">
            <i class="fas fa-users"></i>
          </div>
          <div class="stat-info">
            <h3 class="stat-value">${stats.activeUsers}</h3>
            <p class="stat-label">Utilisateurs</p>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon bg-purple-500/20 text-purple-400">
            <i class="fas fa-hdd"></i>
          </div>
          <div class="stat-info">
            <h3 class="stat-value">${storagePercent}%</h3>
            <p class="stat-label">Stockage utilisé</p>
          </div>
        </div>
      </div>
      
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2">
          <div class="panel">
            <div class="panel-header">
              <h3 class="panel-title"><i class="fas fa-clock mr-2"></i>Activité récente</h3>
            </div>
            <div class="panel-body">
              ${recentActivity.length === 0 ? 
                '<p class="text-center text-gray-400 py-8">Aucune activité récente</p>' :
                `<div class="activity-list">
                  ${recentActivity.map(act => `
                    <div class="activity-item">
                      <div class="activity-icon ${this.getActivityIconClass(act.action)}">
                        <i class="fas ${this.getActivityIcon(act.action)}"></i>
                      </div>
                      <div class="activity-content">
                        <p class="activity-text">${act.user?.name || 'Système'} ${this.formatActivityAction(act.action)} ${act.target_type}</p>
                        <p class="activity-time">${Utils.formatRelativeDate(act.created_at)}</p>
                      </div>
                    </div>
                  `).join('')}
                </div>`
              }
            </div>
          </div>
        </div>
        
        <div>
          <div class="panel">
            <div class="panel-header">
              <h3 class="panel-title"><i class="fas fa-users mr-2"></i>En ligne</h3>
            </div>
            <div class="panel-body" id="onlineUsersList">
              ${this.renderOnlineUsers()}
            </div>
          </div>
          
          ${Store.hasPermission('validate_users') ? `
            <div class="panel mt-4">
              <div class="panel-header">
                <h3 class="panel-title"><i class="fas fa-user-clock mr-2"></i>En attente</h3>
              </div>
              <div class="panel-body">
                ${await this.renderPendingUsersPreview()}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },
  
  async renderDocuments() {
    const container = document.getElementById('documentsContent');
    if (!container) return;
    
    const docs = Store.documents.filter(d => 
      Store.ui.filters.scope === 'all' ? true :
      Store.ui.filters.scope === 'personal' ? d.scope === 'personal' && d.owner_id === Store.user?.id :
      d.scope === 'company'
    );
    
    container.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-4">
          <h2 class="text-xl font-semibold">Documents</h2>
          <div class="scope-filter">
            <button class="scope-btn ${Store.ui.filters.scope === 'all' ? 'active' : ''}" 
                    onclick="UI.setScopeFilter('all')">Tous</button>
            <button class="scope-btn ${Store.ui.filters.scope === 'company' ? 'active' : ''}" 
                    onclick="UI.setScopeFilter('company')">Entreprise</button>
            <button class="scope-btn ${Store.ui.filters.scope === 'personal' ? 'active' : ''}" 
                    onclick="UI.setScopeFilter('personal')">Personnel</button>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn btn-secondary" onclick="UI.toggleViewMode()">
            <i class="fas ${Store.ui.viewMode === 'grid' ? 'fa-list' : 'fa-th-large'}"></i>
          </button>
          <button class="btn btn-primary" onclick="UI.openUploadModal()">
            <i class="fas fa-upload mr-2"></i>Importer
          </button>
        </div>
      </div>
      
      <div class="mb-4">
        <div class="search-box">
          <i class="fas fa-search search-icon"></i>
          <input type="text" 
                 class="search-input" 
                 placeholder="Rechercher des documents..."
                 value="${Store.ui.filters.search}"
                 oninput="UI.handleSearch(this.value)">
        </div>
      </div>
      
      <div id="documentsGrid" class="${Store.ui.viewMode === 'grid' ? 'doc-grid' : 'doc-list'}">
        ${docs.length === 0 ? 
          `<div class="empty-state">
            <i class="fas fa-folder-open text-4xl mb-4"></i>
            <p>Aucun document</p>
            <button class="btn btn-primary mt-4" onclick="UI.openUploadModal()">
              Importer votre premier document
            </button>
           </div>` :
          docs.map(doc => this.renderDocumentCard(doc)).join('')
        }
      </div>
    `;
  },
  
  renderDocumentCard(doc) {
    const icon = Utils.getFileIcon(doc.name, doc.mime_type);
    const isOwner = doc.owner_id === Store.user?.id;
    const canEdit = isOwner || Store.hasPermission('write');
    const canDelete = isOwner || Store.hasPermission('delete');
    
    return `
      <div class="document-card ${Store.ui.viewMode}" data-id="${doc.id}">
        <div class="doc-header">
          <div class="doc-icon ${icon.bg} ${icon.color}">
            <i class="fas ${icon.icon}"></i>
          </div>
          <div class="doc-actions-menu">
            <button class="action-btn" onclick="UI.showDocMenu(event, '${doc.id}')">
              <i class="fas fa-ellipsis-v"></i>
            </button>
          </div>
        </div>
        
        <div class="doc-body">
          <h4 class="doc-title" title="${doc.name}">${doc.name}</h4>
          <p class="doc-meta">${Utils.formatBytes(doc.size)} • ${Utils.formatDate(doc.created_at)}</p>
          <div class="doc-tags">
            ${(doc.tags || []).slice(0, 3).map(tag => 
              `<span class="doc-tag">${tag}</span>`
            ).join('')}
          </div>
        </div>
        
        <div class="doc-footer">
          <span class="scope-badge ${doc.scope}">
            <i class="fas ${doc.scope === 'company' ? 'fa-building' : 'fa-user'}"></i>
            ${doc.scope === 'company' ? 'Entreprise' : 'Personnel'}
          </span>
          <div class="doc-stats">
            <span title="Vues"><i class="fas fa-eye"></i> ${doc.views || 0}</span>
            <span title="Téléchargements"><i class="fas fa-download"></i> ${doc.downloads || 0}</span>
          </div>
        </div>
        
        <div class="doc-menu hidden" id="menu-${doc.id}">
          <button onclick="UI.previewDocument('${doc.id}')">
            <i class="fas fa-eye"></i> Prévisualiser
          </button>
          <button onclick="UI.downloadDocument('${doc.id}')">
            <i class="fas fa-download"></i> Télécharger
          </button>
          ${canEdit ? `
            <button onclick="UI.shareDocument('${doc.id}')">
              <i class="fas fa-share-alt"></i> Partager
            </button>
            <button onclick="UI.editDocument('${doc.id}')">
              <i class="fas fa-edit"></i> Modifier
            </button>
          ` : ''}
          ${canDelete ? `
            <button class="danger" onclick="UI.deleteDocument('${doc.id}')">
              <i class="fas fa-trash"></i> Supprimer
            </button>
          ` : ''}
        </div>
      </div>
    `;
  },
  
  async renderFolders() {
    const container = document.getElementById('foldersContent');
    if (!container) return;
    
    const folders = Store.folders;
    const currentPath = await GEDService.getFolderPath(Store.ui.currentFolderId);
    
    container.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold">Dossiers</h2>
        <button class="btn btn-primary" onclick="UI.createFolder()">
          <i class="fas fa-folder-plus mr-2"></i>Nouveau dossier
        </button>
      </div>
      
      <nav class="breadcrumb">
        ${currentPath.map((folder, idx) => `
          <button class="breadcrumb-item ${idx === currentPath.length - 1 ? 'active' : ''}" 
                  onclick="UI.openFolder('${folder.id}')">
            ${folder.name}
          </button>
        `).join('<span class="breadcrumb-separator">/</span>')}
      </nav>
      
      <div class="folders-grid">
        ${folders.map(folder => `
          <div class="folder-card" onclick="UI.openFolder('${folder.id}')">
            <i class="fas fa-folder folder-icon"></i>
            <span class="folder-name">${folder.name}</span>
            <button class="folder-menu-btn" onclick="event.stopPropagation(); UI.showFolderMenu(event, '${folder.id}')">
              <i class="fas fa-ellipsis-h"></i>
            </button>
          </div>
        `).join('')}
      </div>
      
      <div class="mt-6">
        <h3 class="text-lg font-semibold mb-3">Documents dans ce dossier</h3>
        <div id="folderDocuments">
          ${this.renderFolderDocuments()}
        </div>
      </div>
    `;
  },
  
  renderFolderDocuments() {
    const docs = Store.documents.filter(d => 
      d.folder_id === Store.ui.currentFolderId && !d.is_deleted
    );
    
    if (docs.length === 0) {
      return '<p class="text-gray-400 text-center py-8">Aucun document dans ce dossier</p>';
    }
    
    return `<div class="doc-grid">${docs.map(d => this.renderDocumentCard(d)).join('')}</div>`;
  },
  
  async renderChat() {
    const container = document.getElementById('chatContent');
    if (!container) return;
    
    const conversations = await CollaborationService.getConversations();
    
    container.innerHTML = `
      <div class="chat-layout">
        <div class="chat-sidebar">
          <div class="chat-header">
            <h3 class="font-semibold">Conversations</h3>
            <button class="btn btn-sm btn-primary" onclick="UI.newConversation()">
              <i class="fas fa-plus"></i>
            </button>
          </div>
          <div class="conversations-list">
            ${conversations.length === 0 ?
              '<p class="text-gray-400 text-center p-4">Aucune conversation</p>' :
              conversations.map(conv => {
                const otherParticipant = conv.participants?.find(
                  p => p.user?.id !== Store.user?.id
                );
                return `
                  <div class="conversation-item ${conv.id === Store.ui.currentConversationId ? 'active' : ''}"
                       onclick="UI.openConversation('${conv.id}')">
                    <div class="conversation-avatar">
                      ${otherParticipant?.user?.name?.charAt(0) || '?'}
                    </div>
                    <div class="conversation-info">
                      <h4 class="conversation-name">${otherParticipant?.user?.name || 'Inconnu'}</h4>
                      <p class="conversation-preview">${conv.last_message?.content || 'Nouvelle conversation'}</p>
                    </div>
                    ${conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : ''}
                  </div>
                `;
              }).join('')
            }
          </div>
        </div>
        
        <div class="chat-main" id="chatMain">
          ${Store.ui.currentConversationId ? 
            this.renderChatWindow(Store.ui.currentConversationId) :
            `<div class="chat-placeholder">
              <i class="fas fa-comments text-4xl mb-4"></i>
              <p>Sélectionnez une conversation pour commencer</p>
             </div>`
          }
        </div>
      </div>
    `;
  },
  
  renderChatWindow(conversationId) {
    const messages = Store.messages[conversationId] || [];
    
    return `
      <div class="chat-window" data-conversation="${conversationId}">
        <div class="chat-messages" id="messages-${conversationId}">
          ${messages.map(msg => this.renderMessage(msg)).join('')}
        </div>
        <div class="chat-input-area">
          <div class="chat-input-container">
            <button class="attach-btn" onclick="UI.attachFile()">
              <i class="fas fa-paperclip"></i>
            </button>
            <input type="text" 
                   class="chat-input" 
                   placeholder="Écrivez un message..."
                   onkeypress="UI.handleChatKeypress(event, '${conversationId}')">
            <button class="send-btn" onclick="UI.sendMessage('${conversationId}')">
              <i class="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  },
  
  renderMessage(msg) {
    const isMe = msg.sender_id === Store.user?.id;
    return `
      <div class="message ${isMe ? 'sent' : 'received'}">
        <div class="message-content">
          <p class="message-text">${msg.content}</p>
          <span class="message-time">${Utils.formatDate(msg.created_at, { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    `;
  },
  
  async renderUsers() {
    if (!Store.hasPermission('manage_users')) {
      this.showToast('Accès refusé', 'error');
      this.switchView('dashboard');
      return;
    }
    
    const container = document.getElementById('usersContent');
    if (!container) return;
    
    const users = await UserService.getCompanyUsers();
    const pending = users.filter(u => u.status === 'pending_validation');
    
    container.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold">Gestion des utilisateurs</h2>
        <button class="btn btn-primary" onclick="UI.inviteUser()">
          <i class="fas fa-user-plus mr-2"></i>Inviter
        </button>
      </div>
      
      ${pending.length > 0 ? `
        <div class="alert alert-warning mb-4">
          <i class="fas fa-exclamation-triangle mr-2"></i>
          ${pending.length} utilisateur(s) en attente de validation
          <button class="btn btn-sm btn-warning ml-4" onclick="UI.showPendingUsers()">Voir</button>
        </div>
      ` : ''}
      
      <div class="users-table-container">
        <table class="users-table">
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Inscrit le</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(user => `
              <tr>
                <td>
                  <div class="user-cell">
                    <div class="user-avatar">${user.name.charAt(0)}</div>
                    <div>
                      <p class="user-name">${user.name}</p>
                      <p class="user-email">${user.email}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <select class="role-select" 
                          onchange="UI.updateUserRole('${user.id}', this.value)"
                          ${user.id === Store.user?.id ? 'disabled' : ''}>
                    ${Object.entries(CONFIG.roles).map(([key, role]) => `
                      <option value="${key}" ${user.role === key ? 'selected' : ''}>${role.name}</option>
                    `).join('')}
                  </select>
                </td>
                <td>
                  <span class="status-badge ${user.status}">${user.status}</span>
                </td>
                <td>${Utils.formatDate(user.created_at)}</td>
                <td>
                  <div class="action-buttons">
                    ${user.status === 'pending_validation' ? `
                      <button class="btn btn-sm btn-success" onclick="UI.validateUser('${user.id}')">
                        <i class="fas fa-check"></i>
                      </button>
                      <button class="btn btn-sm btn-danger" onclick="UI.rejectUser('${user.id}')">
                        <i class="fas fa-times"></i>
                      </button>
                    ` : ''}
                    <button class="btn btn-sm btn-danger" 
                            onclick="UI.deleteUser('${user.id}')"
                            ${user.id === Store.user?.id ? 'disabled' : ''}>
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  // ═══ EVENT HANDLERS ═══
  
  async handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value;
    const password = document.getElementById('loginPassword')?.value;
    
    if (!email || !password) {
      this.showToast('Veuillez remplir tous les champs', 'warning');
      return;
    }
    
    const btn = e.target.querySelector('button[type="submit"]');
    btn?.classList.add('loading');
    
    const result = await SupabaseManager.signIn(email, password);
    
    btn?.classList.remove('loading');
    
    if (result.success) {
      this.showToast(`Bienvenue ${result.user.email}`, 'success');
      await this.initializeApp();
    } else {
      this.showToast(result.error, 'error');
    }
  },
  
  async handleRegister(e) {
    e.preventDefault();
    const firstName = document.getElementById('regFirstName')?.value;
    const lastName = document.getElementById('regLastName')?.value;
    const company = document.getElementById('regCompany')?.value;
    const email = document.getElementById('regEmail')?.value;
    const password = document.getElementById('regPassword')?.value;
    
    if (!firstName || !lastName || !company || !email || !password) {
      this.showToast('Veuillez remplir tous les champs', 'warning');
      return;
    }
    
    if (password.length < 8) {
      this.showToast('Le mot de passe doit faire au moins 8 caractères', 'warning');
      return;
    }
    
    const btn = e.target.querySelector('button[type="submit"]');
    btn?.classList.add('loading');
    
    const result = await SupabaseManager.signUp(email, password, {
      firstName,
      lastName,
      companyName: company
    });
    
    btn?.classList.remove('loading');
    
    if (result.success) {
      this.showToast(result.message, 'success');
      this.switchAuthTab('login');
    } else {
      this.showToast(result.error, 'error');
    }
  },
  
  async handleLogout() {
    await SupabaseManager.signOut();
    this.showLoginScreen();
    this.showToast('Déconnexion réussie', 'info');
  },
  
  // ═══ DOCUMENT ACTIONS ═══
  
  async openUploadModal() {
    const modal = document.getElementById('uploadModal');
    if (modal) {
      modal.classList.remove('hidden');
      Store.ui.selectedFiles = [];
      this.renderSelectedFiles();
    }
  },
  
  closeUploadModal() {
    document.getElementById('uploadModal')?.classList.add('hidden');
  },
  
  handleFileSelect(e) {
    const files = Array.from(e.target.files);
    this.addFilesToSelection(files);
  },
  
  handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  },
  
  handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  },
  
  handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    this.addFilesToSelection(files);
  },
  
  addFilesToSelection(files) {
    for (const file of files) {
      if (!Utils.isAllowedFileType(file)) {
        this.showToast(`Type non autorisé: ${file.name}`, 'error');
        continue;
      }
      
      const plan = CONFIG.plans[Store.company?.plan || 'free'];
      if (file.size > plan.maxFileSize) {
        this.showToast(`Fichier trop volumineux: ${file.name}`, 'error');
        continue;
      }
      
      Store.ui.selectedFiles.push(file);
    }
    this.renderSelectedFiles();
  },
  
  removeFileFromSelection(index) {
    Store.ui.selectedFiles.splice(index, 1);
    this.renderSelectedFiles();
  },
  
  renderSelectedFiles() {
    const container = document.getElementById('selectedFiles');
    if (!container) return;
    
    container.innerHTML = Store.ui.selectedFiles.map((file, idx) => `
      <div class="selected-file">
        <div class="file-info">
          <i class="fas fa-file"></i>
          <span class="file-name">${file.name}</span>
          <span class="file-size">${Utils.formatBytes(file.size)}</span>
        </div>
        <button class="remove-file" onclick="UI.removeFileFromSelection(${idx})">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');
  },
  
  async uploadDocuments() {
    if (Store.ui.selectedFiles.length === 0) {
      this.showToast('Aucun fichier sélectionné', 'warning');
      return;
    }
    
    const scope = document.querySelector('input[name="uploadScope"]:checked')?.value || 'company';
    const folderId = Store.ui.currentFolderId;
    
    const btn = document.getElementById('uploadBtn');
    btn?.classList.add('loading');
    
    try {
      for (const file of Store.ui.selectedFiles) {
        await GEDService.uploadDocument(file, {
          scope,
          folderId,
          description: document.getElementById('uploadDescription')?.value
        });
      }
      
      this.showToast(`${Store.ui.selectedFiles.length} document(s) importé(s)`, 'success');
      this.closeUploadModal();
      
      // Rafraîchir
      Store.documents = await GEDService.getDocuments();
      this.renderDocuments();
    } catch (error) {
      this.showToast(error.message, 'error');
    } finally {
      btn?.classList.remove('loading');
    }
  },
  
  async previewDocument(docId) {
    const doc = Store.documents.find(d => d.id === docId);
    if (!doc) return;
    
    // Incrémenter vues
    await GEDService.incrementViews(docId);
    
    const modal = document.getElementById('previewModal');
    const content = document.getElementById('previewContent');
    
    if (!modal || !content) return;
    
    content.innerHTML = `
      <div class="preview-header">
        <div class="preview-icon ${Utils.getFileIcon(doc.name).bg}">
          <i class="fas ${Utils.getFileIcon(doc.name).icon}"></i>
        </div>
        <div class="preview-info">
          <h3>${doc.name}</h3>
          <p>${Utils.formatBytes(doc.size)} • ${doc.mime_type}</p>
        </div>
      </div>
      <div class="preview-body">
        ${this.getPreviewContent(doc)}
      </div>
      <div class="preview-actions">
        <button class="btn btn-primary" onclick="UI.downloadDocument('${doc.id}')">
          <i class="fas fa-download mr-2"></i>Télécharger
        </button>
        <button class="btn btn-secondary" onclick="UI.shareDocument('${doc.id}')">
          <i class="fas fa-share-alt mr-2"></i>Partager
        </button>
        ${doc.scope === 'company' ? `
          <button class="btn btn-secondary" onclick="UI.requestSignature('${doc.id}')">
            <i class="fas fa-signature mr-2"></i>Demander signature
          </button>
        ` : ''}
      </div>
    `;
    
    modal.classList.remove('hidden');
  },
  
  getPreviewContent(doc) {
    // PDF
    if (doc.mime_type === 'application/pdf' && doc.public_url) {
      return `<iframe src="${doc.public_url}" class="preview-frame"></iframe>`;
    }
    
    // Images
    if (doc.mime_type?.startsWith('image/') && doc.public_url) {
      return `<img src="${doc.public_url}" class="preview-image" alt="${doc.name}">`;
    }
    
    // Text
    if (doc.mime_type?.startsWith('text/')) {
      return `<pre class="preview-text">${doc.content || 'Contenu non disponible'}</pre>`;
    }
    
    // Default
    return `
      <div class="preview-unavailable">
        <i class="fas fa-file-alt text-6xl mb-4"></i>
        <p>Prévisualisation non disponible pour ce type de fichier</p>
        <button class="btn btn-primary mt-4" onclick="UI.downloadDocument('${doc.id}')">
          Télécharger pour voir
        </button>
      </div>
    `;
  },
  
  closePreviewModal() {
    document.getElementById('previewModal')?.classList.add('hidden');
  },
  
  async downloadDocument(docId) {
    try {
      await GEDService.downloadDocument(docId);
      this.showToast('Téléchargement démarré', 'success');
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  },
  
  async deleteDocument(docId) {
    const doc = Store.documents.find(d => d.id === docId);
    if (!doc) return;
    
    if (!confirm(`Supprimer "${doc.name}" ?`)) return;
    
    try {
      await GEDService.deleteDocument(docId);
      Store.documents = Store.documents.filter(d => d.id !== docId);
      this.renderDocuments();
      this.showToast('Document supprimé', 'success');
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  },
  
  async shareDocument(docId) {
    const email = prompt('Email du destinataire:');
    if (!email) return;
    
    if (!Utils.isValidEmail(email)) {
      this.showToast('Email invalide', 'error');
      return;
    }
    
    try {
      await GEDService.shareDocument(docId, email);
      this.showToast('Document partagé', 'success');
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  },
  
  // ═══ FOLDER ACTIONS ═══
  
  async createFolder() {
    const name = prompt('Nom du nouveau dossier:');
    if (!name) return;
    
    try {
      await GEDService.createFolder(name, Store.ui.currentFolderId);
      Store.folders = await GEDService.getFolders(Store.ui.currentFolderId);
      this.renderFolders();
      this.showToast('Dossier créé', 'success');
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  },
  
  async openFolder(folderId) {
    Store.ui.currentFolderId = folderId;
    Store.folders = await GEDService.getFolders(folderId);
    this.renderFolders();
  },
  
  // ═══ CHAT ACTIONS ═══
  
  async openConversation(conversationId) {
    Store.ui.currentConversationId = conversationId;
    Store.messages[conversationId] = await CollaborationService.getMessages(conversationId);
    this.renderChat();
    
    // Subscribe to new messages
    CollaborationService.subscribeToMessages(conversationId, (message) => {
      if (!Store.messages[conversationId]) Store.messages[conversationId] = [];
      Store.messages[conversationId].push(message);
      this.appendMessage(message);
    });
  },
  
  async sendMessage(conversationId) {
    const input = document.querySelector('.chat-input');
    const content = input?.value.trim();
    if (!content) return;
    
    try {
      await CollaborationService.sendMessage(conversationId, content);
      input.value = '';
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  },
  
  handleChatKeypress(e, conversationId) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage(conversationId);
    }
  },
  
  appendMessage(message) {
    const container = document.getElementById(`messages-${message.conversation_id}`);
    if (container) {
      container.insertAdjacentHTML('beforeend', this.renderMessage(message));
      container.scrollTop = container.scrollHeight;
    }
  },
  
  // ═══ USER MANAGEMENT ═══
  
  async validateUser(userId) {
    try {
      await UserService.validateUser(userId);
      this.showToast('Utilisateur validé', 'success');
      this.renderUsers();
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  },
  
  async rejectUser(userId) {
    const reason = prompt('Raison du refus (optionnel):');
    try {
      await UserService.rejectUser(userId, reason);
      this.showToast('Utilisateur refusé', 'info');
      this.renderUsers();
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  },
  
  async updateUserRole(userId, newRole) {
    try {
      await UserService.updateUserRole(userId, newRole);
      this.showToast('Rôle mis à jour', 'success');
    } catch (error) {
      this.showToast(error.message, 'error');
      this.renderUsers(); // Reset
    }
  },
  
  async deleteUser(userId) {
    if (!confirm('Supprimer définitivement cet utilisateur ?')) return;
    
    try {
      await UserService.deleteUser(userId);
      this.showToast('Utilisateur supprimé', 'success');
      this.renderUsers();
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  },
  
  async inviteUser() {
    const email = prompt('Email de l\'utilisateur à inviter:');
    if (!email) return;
    
    const role = confirm('Donner les droits administrateur ?') ? 'admin' : 'viewer';
    
    try {
      await UserService.inviteUser(email, role);
      this.showToast('Invitation envoyée', 'success');
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  },
  
  // ═══ UI UTILITIES ═══
  
  setScopeFilter(scope) {
    Store.ui.filters.scope = scope;
    this.renderDocuments();
  },
  
  handleSearch(query) {
    Store.ui.filters.search = query;
    // Debounced search
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.performSearch(query);
    }, 300);
  },
  
  async performSearch(query) {
    if (!query) {
      Store.documents = await GEDService.getDocuments();
    } else {
      Store.documents = await GEDService.getDocuments({ search: query });
    }
    this.renderDocuments();
  },
  
  toggleViewMode() {
    Store.ui.viewMode = Store.ui.viewMode === 'grid' ? 'list' : 'grid';
    this.renderDocuments();
  },
  
  showDocMenu(event, docId) {
    event.stopPropagation();
    // Fermer autres menus
    document.querySelectorAll('.doc-menu').forEach(m => m.classList.add('hidden'));
    const menu = document.getElementById(`menu-${docId}`);
    menu?.classList.toggle('hidden');
  },
  
  closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.doc-menu').forEach(m => m.classList.add('hidden'));
  },
  
  openMobileSidebar() {
    document.getElementById('mobileSidebar')?.classList.add('open');
  },
  
  closeMobileSidebar() {
    document.getElementById('mobileSidebar')?.classList.remove('open');
  },
  
  switchAuthTab(tab) {
    document.getElementById('loginForm')?.classList.toggle('hidden', tab !== 'login');
    document.getElementById('registerForm')?.classList.toggle('hidden', tab !== 'register');
    
    document.querySelectorAll('.auth-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
  },
  
  togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  },
  
  // ═══ TOAST NOTIFICATIONS ═══
  
  showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fas ${this.getToastIcon(type)}"></i>
      <span>${message}</span>
    `;
    
    document.getElementById('toastContainer')?.appendChild(toast);
    
    // Animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  
  getToastIcon(type) {
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };
    return icons[type] || 'fa-info-circle';
  },
  
  // ═══ HELPERS ═══
  
  getActivityIcon(action) {
    const icons = {
      login: 'fa-sign-in-alt',
      logout: 'fa-sign-out-alt',
      create: 'fa-plus',
      update: 'fa-edit',
      delete: 'fa-trash',
      upload: 'fa-upload',
      download: 'fa-download',
      share: 'fa-share-alt'
    };
    return icons[action] || 'fa-circle';
  },
  
  getActivityIconClass(action) {
    const classes = {
      login: 'bg-green-500/20 text-green-400',
      logout: 'bg-gray-500/20 text-gray-400',
      create: 'bg-blue-500/20 text-blue-400',
      update: 'bg-yellow-500/20 text-yellow-400',
      delete: 'bg-red-500/20 text-red-400'
    };
    return classes[action] || 'bg-gray-500/20 text-gray-400';
  },
  
  formatActivityAction(action) {
    const actions = {
      login: 's\'est connecté',
      logout: 's\'est déconnecté',
      create: 'a créé',
      update: 'a modifié',
      delete: 'a supprimé',
      upload: 'a importé',
      download: 'a téléchargé',
      share: 'a partagé'
    };
    return actions[action] || action;
  },
  
  renderOnlineUsers() {
    const users = Store.onlineUsers.filter(u => u.user_id !== Store.user?.id);
    if (users.length === 0) {
      return '<p class="text-gray-400 text-center py-4">Aucun utilisateur en ligne</p>';
    }
    return users.map(u => `
      <div class="online-user">
        <div class="online-indicator"></div>
        <span>${u.user?.name || 'Inconnu'}</span>
      </div>
    `).join('');
  },
  
  async renderPendingUsersPreview() {
    const pending = await UserService.getPendingUsers();
    if (pending.length === 0) {
      return '<p class="text-gray-400">Aucun utilisateur en attente</p>';
    }
    return pending.slice(0, 3).map(u => `
      <div class="pending-user-item">
        <span>${u.name}</span>
        <button class="btn btn-sm btn-success" onclick="UI.validateUser('${u.id}')">Valider</button>
      </div>
    `).join('') + (pending.length > 3 ? `<p class="text-sm text-gray-400 mt-2">+${pending.length - 3} autres...</p>` : '');
  },
  
  updateBadges() {
    // Notifications
    const unreadCount = Store.notifications.filter(n => !n.read).length;
    const notifBadge = document.getElementById('notifBadge');
    if (notifBadge) {
      notifBadge.textContent = unreadCount;
      notifBadge.classList.toggle('hidden', unreadCount === 0);
    }
  },
  
  updateDocumentsView() {
    if (Store.ui.currentView === 'documents') {
      this.renderDocuments();
    }
  },
  
  updateNotificationBadge() {
    this.updateBadges();
  },
  
  updateOnlineUsersIndicator() {
    const container = document.getElementById('onlineUsersList');
    if (container) {
      container.innerHTML = this.renderOnlineUsers();
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 10: POINT D'ENTRÉE & INITIALISATION
// ═══════════════════════════════════════════════════════════════════════════════

// Exposer l'API globale pour les handlers inline
window.UI = UI;
window.Store = Store;
window.CONFIG = CONFIG;
window.Utils = Utils;
window.SupabaseManager = SupabaseManager;
window.GEDService = GEDService;
window.CollaborationService = CollaborationService;
window.WorkflowService = WorkflowService;
window.UserService = UserService;

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 SystemesGED v6.0 - Initialisation...');
  UI.init();
});

// Gestion erreurs globales
window.addEventListener('error', (e) => {
  console.error('Erreur globale:', e.error);
  UI.showToast('Une erreur est survenue', 'error');
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Promise rejetée:', e.reason);
  UI.showToast('Erreur de connexion', 'error');
});

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES CSS DYNAMIQUES (Injectés si nécessaire)
// ═══════════════════════════════════════════════════════════════════════════════

const APP_STYLES = `
  /* Toast Notifications */
  .toast-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .toast {
    background: white;
    border-radius: 8px;
    padding: 12px 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    display: flex;
    align-items: center;
    gap: 10px;
    transform: translateX(100%);
    opacity: 0;
    transition: all 0.3s ease;
    min-width: 300px;
  }
  
  .toast.show {
    transform: translateX(0);
    opacity: 1;
  }
  
  .toast-success { border-left: 4px solid #10b981; }
  .toast-error { border-left: 4px solid #ef4444; }
  .toast-warning { border-left: 4px solid #f59e0b; }
  .toast-info { border-left: 4px solid #3b82f6; }
  
  .toast-success i { color: #10b981; }
  .toast-error i { color: #ef4444; }
  .toast-warning i { color: #f59e0b; }
  .toast-info i { color: #3b82f6; }
  
  /* Document Cards */
  .doc-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 20px;
  }
  
  .doc-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .document-card {
    background: white;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    transition: all 0.2s;
    cursor: pointer;
    position: relative;
  }
  
  .document-card:hover {
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    transform: translateY(-2px);
  }
  
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }
  
  .doc-icon {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
  }
  
  .doc-actions-menu {
    opacity: 0;
    transition: opacity 0.2s;
  }
  
  .document-card:hover .doc-actions-menu {
    opacity: 1;
  }
  
  .doc-title {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .doc-meta {
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 8px;
  }
  
  .doc-tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  
  .doc-tag {
    font-size: 11px;
    padding: 2px 8px;
    background: #f3f4f6;
    border-radius: 12px;
    color: #4b5563;
  }
  
  .doc-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #f3f4f6;
  }
  
  .scope-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .scope-badge.company {
    background: #dbeafe;
    color: #1e40af;
  }
  
  .scope-badge.personal {
    background: #fce7f3;
    color: #9d174d;
  }
  
  .doc-stats {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: #9ca3af;
  }
  
  .doc-stats span {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  /* Chat Layout */
  .chat-layout {
    display: grid;
    grid-template-columns: 300px 1fr;
    height: calc(100vh - 200px);
    background: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  
  .chat-sidebar {
    border-right: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
  }
  
  .chat-header {
    padding: 16px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .conversations-list {
    flex: 1;
    overflow-y: auto;
  }
  
  .conversation-item {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .conversation-item:hover,
  .conversation-item.active {
    background: #f3f4f6;
  }
  
  .conversation-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #3b82f6;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
  }
  
  .conversation-info {
    flex: 1;
    min-width: 0;
  }
  
  .conversation-name {
    font-weight: 500;
    font-size: 14px;
    margin-bottom: 2px;
  }
  
  .conversation-preview {
    font-size: 12px;
    color: #6b7280;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .unread-badge {
    background: #ef4444;
    color: white;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 10px;
  }
  
  .chat-main {
    display: flex;
    flex-direction: column;
  }
  
  .chat-window {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  
  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .message {
    max-width: 70%;
    padding: 12px 16px;
    border-radius: 16px;
    position: relative;
  }
  
  .message.sent {
    align-self: flex-end;
    background: #3b82f6;
    color: white;
    border-bottom-right-radius: 4px;
  }
  
  .message.received {
    align-self: flex-start;
    background: #f3f4f6;
    color: #1f2937;
    border-bottom-left-radius: 4px;
  }
  
  .message-text {
    margin-bottom: 4px;
    line-height: 1.4;
  }
  
  .message-time {
    font-size: 11px;
    opacity: 0.7;
  }
  
  .chat-input-area {
    padding: 16px;
    border-top: 1px solid #e5e7eb;
  }
  
  .chat-input-container {
    display: flex;
    gap: 8px;
    background: #f3f4f6;
    padding: 8px;
    border-radius: 24px;
  }
  
  .chat-input {
    flex: 1;
    border: none;
    background: transparent;
    padding: 8px 12px;
    outline: none;
  }
  
  .attach-btn,
  .send-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  
  .send-btn {
    background: #3b82f6;
    color: white;
  }
  
  .send-btn:hover {
    background: #2563eb;
  }
  
  /* Stat Cards */
  .stat-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  
  .stat-icon {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
  }
  
  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: #111827;
    margin-bottom: 2px;
  }
  
  .stat-label {
    font-size: 14px;
    color: #6b7280;
  }
  
  /* Activity List */
  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .activity-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: #f9fafb;
    border-radius: 8px;
  }
  
  .activity-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  }
  
  .activity-content {
    flex: 1;
  }
  
  .activity-text {
    font-size: 14px;
    color: #374151;
    margin-bottom: 2px;
  }
  
  .activity-time {
    font-size: 12px;
    color: #9ca3af;
  }
  
  /* Users Table */
  .users-table-container {
    background: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  
  .users-table {
    width: 100%;
    border-collapse: collapse;
  }
  
  .users-table th {
    background: #f9fafb;
    padding: 12px 16px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    color: #6b7280;
  }
  
  .users-table td {
    padding: 16px;
    border-top: 1px solid #f3f4f6;
  }
  
  .user-cell {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .user-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #3b82f6;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
  }
  
  .user-name {
    font-weight: 500;
    margin-bottom: 2px;
  }
  
  .user-email {
    font-size: 13px;
    color: #6b7280;
  }
  
  .role-select {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    background: white;
    font-size: 13px;
  }
  
  .status-badge {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }
  
  .status-badge.active {
    background: #d1fae5;
    color: #065f46;
  }
  
  .status-badge.pending_validation {
    background: #fef3c7;
    color: #92400e;
  }
  
  .status-badge.suspended {
    background: #fee2e2;
    color: #991b1b;
  }
  
  /* Scope Filter */
  .scope-filter {
    display: flex;
    gap: 4px;
    background: #f3f4f6;
    padding: 4px;
    border-radius: 8px;
  }
  
  .scope-btn {
    padding: 6px 12px;
    border-radius: 6px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  }
  
  .scope-btn.active {
    background: white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    font-weight: 500;
  }
  
  /* Search Box */
  .search-box {
    position: relative;
  }
  
  .search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #9ca3af;
  }
  
  .search-input {
    width: 100%;
    padding: 10px 12px 10px 40px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    transition: all 0.2s;
  }
  
  .search-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  /* Breadcrumb */
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 20px;
    font-size: 14px;
  }
  
  .breadcrumb-item {
    padding: 6px 12px;
    border-radius: 6px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: #6b7280;
    transition: all 0.2s;
  }
  
  .breadcrumb-item:hover {
    background: #f3f4f6;
    color: #374151;
  }
  
  .breadcrumb-item.active {
    background: #3b82f6;
    color: white;
  }
  
  .breadcrumb-separator {
    color: #d1d5db;
  }
  
  /* Folder Cards */
  .folders-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
  }
  
  .folder-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
  }
  
  .folder-card:hover {
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  }
  
  .folder-icon {
    font-size: 32px;
    color: #f59e0b;
  }
  
  .folder-name {
    flex: 1;
    font-weight: 500;
  }
  
  .folder-menu-btn {
    opacity: 0;
    transition: opacity 0.2s;
    padding: 4px 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: #6b7280;
  }
  
  .folder-card:hover .folder-menu-btn {
    opacity: 1;
  }
  
  /* Empty State */
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #9ca3af;
  }
  
  .empty-state i {
    margin-bottom: 16px;
  }
  
  /* Loading State */
  .loading {
    position: relative;
    pointer-events: none;
    opacity: 0.7;
  }
  
  .loading::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    margin: -10px 0 0 -10px;
    border: 2px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* Modal */
  .modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }
  
  .modal.hidden {
    display: none;
  }
  
  .modal-content {
    background: white;
    border-radius: 16px;
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 40px rgba(0,0,0,0.2);
  }
  
  .modal-header {
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .modal-title {
    font-size: 18px;
    font-weight: 600;
  }
  
  .modal-close {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: #9ca3af;
  }
  
  .modal-body {
    padding: 24px;
  }
  
  .modal-footer {
    padding: 16px 24px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }
  
  /* Buttons */
  .btn {
    padding: 8px 16px;
    border-radius: 8px;
    border: none;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  
  .btn-primary {
    background: #3b82f6;
    color: white;
  }
  
  .btn-primary:hover {
    background: #2563eb;
  }
  
  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }
  
  .btn-secondary:hover {
    background: #e5e7eb;
  }
  
  .btn-success {
    background: #10b981;
    color: white;
  }
  
  .btn-danger {
    background: #ef4444;
    color: white;
  }
  
  .btn-sm {
    padding: 4px 10px;
    font-size: 12px;
  }
  
  /* Action Buttons */
  .action-buttons {
    display: flex;
    gap: 8px;
  }
  
  /* Alert */
  .alert {
    padding: 12px 16px;
    border-radius: 8px;
    display: flex;
    align-items: center;
  }
  
  .alert-warning {
    background: #fef3c7;
    color: #92400e;
  }
  
  /* Panel */
  .panel {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  
  .panel-header {
    padding: 16px 20px;
    border-bottom: 1px solid #f3f4f6;
  }
  
  .panel-title {
    font-weight: 600;
    font-size: 16px;
  }
  
  .panel-body {
    padding: 20px;
  }
  
  /* Online Users */
  .online-user {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
  }
  
  .online-indicator {
    width: 8px;
    height: 8px;
    background: #10b981;
    border-radius: 50%;
    box-shadow: 0 0 0 2px #fff, 0 0 0 4px #10b981;
  }
  
  /* Pending Users */
  .pending-user-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #f3f4f6;
  }
  
  .pending-user-item:last-child {
    border-bottom: none;
  }
  
  /* Upload Area */
  .upload-area {
    border: 2px dashed #e5e7eb;
    border-radius: 12px;
    padding: 40px;
    text-align: center;
    transition: all 0.2s;
  }
  
  .upload-area.drag-over {
    border-color: #3b82f6;
    background: #eff6ff;
  }
  
  .upload-icon {
    font-size: 48px;
    color: #d1d5db;
    margin-bottom: 16px;
  }
  
  /* Selected Files */
  .selected-file {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: #f9fafb;
    border-radius: 8px;
    margin-bottom: 8px;
  }
  
  .file-info {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }
  
  .file-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .file-size {
    font-size: 12px;
    color: #9ca3af;
    flex-shrink: 0;
  }
  
  .remove-file {
    background: none;
    border: none;
    color: #ef4444;
    cursor: pointer;
    padding: 4px;
  }
  
  /* Preview Modal */
  .preview-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
  }
  
  .preview-info h3 {
    font-weight: 600;
    margin-bottom: 4px;
  }
  
  .preview-info p {
    font-size: 13px;
    color: #6b7280;
  }
  
  .preview-body {
    min-height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .preview-frame {
    width: 100%;
    height: 500px;
    border: none;
    border-radius: 8px;
  }
  
  .preview-image {
    max-width: 100%;
    max-height: 500px;
    border-radius: 8px;
  }
  
  .preview-text {
    width: 100%;
    max-height: 500px;
    overflow: auto;
    background: #f9fafb;
    padding: 16px;
    border-radius: 8px;
    font-family: monospace;
    font-size: 13px;
  }
  
  .preview-unavailable {
    text-align: center;
    color: #9ca3af;
  }
  
  .preview-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #e5e7eb;
  }
  
  /* Doc Menu */
  .doc-menu {
    position: absolute;
    top: 50px;
    right: 16px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    min-width: 180px;
    z-index: 100;
  }
  
  .doc-menu button {
    width: 100%;
    padding: 10px 16px;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    transition: background 0.2s;
  }
  
  .doc-menu button:hover {
    background: #f3f4f6;
  }
  
  .doc-menu button.danger {
    color: #ef4444;
  }
  
  .doc-menu button.danger:hover {
    background: #fee2e2;
  }
  
  .doc-menu.hidden {
    display: none;
  }
  
  /* Action Btn */
  .action-btn {
    background: none;
    border: none;
    padding: 4px 8px;
    cursor: pointer;
    color: #9ca3af;
    border-radius: 4px;
    transition: all 0.2s;
  }
  
  .action-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }
`;

// Injecter les styles
const styleSheet = document.createElement('style');
styleSheet.textContent = APP_STYLES;
document.head.appendChild(styleSheet);

console.log('✅ SystemesGED v6.0 chargé avec succès');
console.log('📦 Modules: Config, Store, Utils, SupabaseManager, GEDService, CollaborationService, WorkflowService, UserService, UI');
console.log('🔒 Sécurité: RLS, Multi-tenant, Validation admin, Audit trail');
console.log('⚡ Temps réel: Documents, Notifications, Chat, Présence');
