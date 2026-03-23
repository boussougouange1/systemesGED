/**
 * SYSTEMESGED - Application GED SaaS Complète
 * Version corrigée avec authentification locale fallback
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    SUPABASE_URL: 'https://your-project.supabase.co',
    SUPABASE_KEY: 'your-anon-key',
    APP_NAME: 'SYSTEMESGED',
    VERSION: '2.0.0',
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    DEFAULT_COMPANY: 'default'
};

// ============================================
// ADMINISTRATEURS PRÉCONFIGURÉS
// ============================================
const SYSTEM_ADMINS = {
    'ahouansouange@live.fr': {
        id: '57923740-aa51-40c7-8bca-d60c20ea307f',
        email: 'ahouansouange@live.fr',
        name: 'Administrateur live',
        role: 'admin',
        status: 'active',
        company_id: 'company_live_001',
        company_name: 'live',
        is_system_admin: true,
        permissions: ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users']
    },
    'systemesshop@gmail.com': {
        id: 'c1fa75e6-709b-4a18-af67-0329f58dbac0',
        email: 'systemesshop@gmail.com',
        name: 'Administrateur systemesshop',
        role: 'admin',
        status: 'active',
        company_id: 'company_systemesshop_001',
        company_name: 'systemesshop',
        is_system_admin: true,
        permissions: ['read', 'write', 'delete', 'users', 'logs', 'api', 'billing', 'signatures', 'validate_users']
    }
};

// ============================================
// ÉTAT GLOBAL
// ============================================
const AppState = {
    currentUser: null,
    currentCompany: null,
    supabase: null,
    isOnline: navigator.onLine,
    useLocalAuth: false, // Mode authentification locale
    documents: [],
    users: [],
    workflows: [],
    notifications: [],
    currentView: 'dashboard',
    selectedDocuments: [],
    currentFolder: 'root',
    searchQuery: '',
    filters: {
        type: 'all',
        date: 'all',
        status: 'all'
    },
    realtimeChannels: [],
    pendingValidations: [],
    signatures: [],
    chatMessages: [],
    onlineUsers: [],
    lockedDocuments: []
};

// ============================================
// BASE DE DONNÉES LOCALE (Fallback)
// ============================================
const LocalDB = {
    db: null,
    
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('SystemesGED_Local', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Stores pour les données locales
                if (!db.objectStoreNames.contains('documents')) {
                    const docStore = db.createObjectStore('documents', { keyPath: 'id' });
                    docStore.createIndex('company_id', 'company_id', { unique: false });
                    docStore.createIndex('owner_id', 'owner_id', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('profiles')) {
                    const profStore = db.createObjectStore('profiles', { keyPath: 'id' });
                    profStore.createIndex('email', 'email', { unique: true });
                    profStore.createIndex('company_id', 'company_id', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('workflows')) {
                    db.createObjectStore('workflows', { keyPath: 'id' });
                }
                
                if (!db.objectStoreNames.contains('shares')) {
                    db.createObjectStore('shares', { keyPath: 'id' });
                }
                
                if (!db.objectStoreNames.contains('folders')) {
                    db.createObjectStore('folders', { keyPath: 'id' });
                }
                
                if (!db.objectStoreNames.contains('pending_users')) {
                    db.createObjectStore('pending_users', { keyPath: 'id' });
                }
                
                if (!db.objectStoreNames.contains('audit_logs')) {
                    db.createObjectStore('audit_logs', { keyPath: 'id', autoIncrement: true });
                }
                
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', { keyPath: 'id' });
                }
            };
        });
    },
    
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    async getById(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

// ============================================
// MODULE AUTHENTIFICATION
// ============================================
const Auth = {
    // Initialiser l'authentification
    async init() {
        try {
            // Vérifier si Supabase est disponible
            if (typeof supabase !== 'undefined' && supabase.createClient) {
                AppState.supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
                
                // Tester la connexion Supabase
                const { data, error } = await AppState.supabase.auth.getSession();
                
                if (error) {
                    console.warn('Supabase Auth non disponible, utilisation du mode local');
                    AppState.useLocalAuth = true;
                } else {
                    console.log('Supabase Auth connecté');
                    AppState.useLocalAuth = false;
                }
            } else {
                console.warn('Supabase non disponible, utilisation du mode local');
                AppState.useLocalAuth = true;
            }
        } catch (error) {
            console.warn('Erreur Supabase:', error);
            AppState.useLocalAuth = true;
        }
        
        // Initialiser la base locale
        await LocalDB.init();
        
        // Charger les admins système dans la base locale
        await this.initSystemAdmins();
        
        // Vérifier la session existante
        await this.checkSession();
    },
    
    // Initialiser les admins système dans la base locale
    async initSystemAdmins() {
        for (const [email, adminData] of Object.entries(SYSTEM_ADMINS)) {
            const existing = await LocalDB.getById('profiles', adminData.id);
            if (!existing) {
                await LocalDB.put('profiles', {
                    ...adminData,
                    password_hash: await this.hashPassword('admin123'), // Mot de passe par défaut
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            }
        }
    },
    
    // Hachage simple (à remplacer par bcrypt en production)
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },
    
    // Vérifier le mot de passe
    async verifyPassword(password, hash) {
        const passwordHash = await this.hashPassword(password);
        return passwordHash === hash;
    },
    
    // Connexion
    async login(email, password) {
        try {
            // Essayer d'abord Supabase si disponible
            if (!AppState.useLocalAuth && AppState.supabase) {
                const { data, error } = await AppState.supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (!error && data.user) {
                    // Récupérer le profil
                    const { data: profile, error: profileError } = await AppState.supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', data.user.id)
                        .single();
                    
                    if (!profileError && profile) {
                        AppState.currentUser = profile;
                        AppState.currentCompany = profile.company_id;
                        localStorage.setItem('currentUser', JSON.stringify(profile));
                        localStorage.setItem('sessionExpiry', Date.now() + (24 * 60 * 60 * 1000));
                        
                        await this.logAudit('login', 'user', data.user.id, { method: 'supabase' });
                        return { success: true, user: profile };
                    }
                }
            }
            
            // Fallback vers authentification locale
            return await this.localLogin(email, password);
            
        } catch (error) {
            console.error('Erreur login:', error);
            return await this.localLogin(email, password);
        }
    },
    
    // Connexion locale (fallback)
    async localLogin(email, password) {
        try {
            // Chercher l'utilisateur dans la base locale
            const profiles = await LocalDB.getAll('profiles');
            const user = profiles.find(p => p.email.toLowerCase() === email.toLowerCase());
            
            if (!user) {
                // Vérifier si c'est un admin système avec mot de passe par défaut
                const systemAdmin = SYSTEM_ADMINS[email.toLowerCase()];
                if (systemAdmin && password === 'AA++aa++11111') {
                    // Créer l'utilisateur local s'il n'existe pas
                    const newUser = {
                        ...systemAdmin,
                        password_hash: await this.hashPassword('SS++ss++11111'),
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    await LocalDB.put('profiles', newUser);
                    
                    AppState.currentUser = newUser;
                    AppState.currentCompany = newUser.company_id;
                    localStorage.setItem('currentUser', JSON.stringify(newUser));
                    localStorage.setItem('sessionExpiry', Date.now() + (24 * 60 * 60 * 1000));
                    
                    await this.logAudit('login', 'user', newUser.id, { method: 'local_admin_default' });
                    return { success: true, user: newUser };
                }
                
                return { success: false, error: 'Utilisateur non trouvé' };
            }
            
            // Vérifier le mot de passe
            const isValid = await this.verifyPassword(password, user.password_hash);
            
            if (!isValid) {
                return { success: false, error: 'Mot de passe incorrect' };
            }
            
            // Vérifier si le compte est actif
            if (user.status !== 'active') {
                return { success: false, error: 'Compte en attente de validation par un administrateur' };
            }
            
            AppState.currentUser = user;
            AppState.currentCompany = user.company_id;
            localStorage.setItem('currentUser', JSON.stringify(user));
            localStorage.setItem('sessionExpiry', Date.now() + (24 * 60 * 60 * 1000));
            
            await this.logAudit('login', 'user', user.id, { method: 'local' });
            return { success: true, user: user };
            
        } catch (error) {
            console.error('Erreur local login:', error);
            return { success: false, error: 'Erreur de connexion: ' + error.message };
        }
    },
    
    // Inscription
    async register(email, password, name, companyName) {
        try {
            // Vérifier si l'email existe déjà
            const existingProfiles = await LocalDB.getAll('profiles');
            if (existingProfiles.some(p => p.email.toLowerCase() === email.toLowerCase())) {
                return { success: false, error: 'Cet email est déjà utilisé' };
            }
            
            // Vérifier si c'est un admin système
            const systemAdmin = SYSTEM_ADMINS[email.toLowerCase()];
            if (systemAdmin) {
                return { success: false, error: 'Ce compte administrateur existe déjà. Veuillez vous connecter avec le mot de passe AA++aa++11111' };
            }
            
            // Créer l'entreprise si elle n'existe pas
            const companyId = `company_${companyName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
            
            // Créer l'utilisateur en mode "pending"
            const newUser = {
                id: crypto.randomUUID(),
                email: email,
                name: name,
                role: 'viewer',
                status: 'pending', // En attente de validation
                company_id: companyId,
                company_name: companyName,
                is_system_admin: false,
                permissions: ['read'],
                password_hash: await this.hashPassword(password),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            await LocalDB.put('profiles', newUser);
            await LocalDB.put('pending_users', newUser);
            
            // Notifier les admins de la company (si existe)
            await this.notifyAdminsNewUser(newUser);
            
            await this.logAudit('register', 'user', newUser.id, { email, company: companyName });
            
            return { 
                success: true, 
                message: 'Compte créé avec succès. En attente de validation par un administrateur.',
                user: newUser 
            };
            
        } catch (error) {
            console.error('Erreur inscription:', error);
            return { success: false, error: 'Erreur lors de l\'inscription: ' + error.message };
        }
    },
    
    // Notifier les admins d'un nouvel utilisateur
    async notifyAdminsNewUser(newUser) {
        // En mode local, on ajoute simplement une notification dans le store
        const notification = {
            id: crypto.randomUUID(),
            type: 'user_pending',
            title: 'Nouvel utilisateur en attente',
            message: `${newUser.name} (${newUser.email}) demande l'accès à ${newUser.company_name}`,
            user_id: null, // Pour tous les admins
            company_id: newUser.company_id,
            target_user_id: newUser.id,
            read: false,
            created_at: new Date().toISOString()
        };
        
        // Stocker localement
        const notifications = JSON.parse(localStorage.getItem('pending_notifications') || '[]');
        notifications.push(notification);
        localStorage.setItem('pending_notifications', JSON.stringify(notifications));
    },
    
    // Déconnexion
    async logout() {
        try {
            if (!AppState.useLocalAuth && AppState.supabase) {
                await AppState.supabase.auth.signOut();
            }
            
            await this.logAudit('logout', 'user', AppState.currentUser?.id);
            
            AppState.currentUser = null;
            AppState.currentCompany = null;
            localStorage.removeItem('currentUser');
            localStorage.removeItem('sessionExpiry');
            
            return { success: true };
        } catch (error) {
            console.error('Erreur logout:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Vérifier la session
    async checkSession() {
        try {
            const savedUser = localStorage.getItem('currentUser');
            const sessionExpiry = localStorage.getItem('sessionExpiry');
            
            if (savedUser && sessionExpiry && Date.now() < parseInt(sessionExpiry)) {
                AppState.currentUser = JSON.parse(savedUser);
                AppState.currentCompany = AppState.currentUser.company_id;
                return true;
            }
            
            // Session expirée ou inexistante
            localStorage.removeItem('currentUser');
            localStorage.removeItem('sessionExpiry');
            return false;
            
        } catch (error) {
            console.error('Erreur check session:', error);
            return false;
        }
    },
    
    // Logger l'audit
    async logAudit(action, targetType, targetId, details = {}) {
        const log = {
            id: crypto.randomUUID(),
            user_id: AppState.currentUser?.id || null,
            user_email: AppState.currentUser?.email || null,
            action: action,
            target_type: targetType,
            target_id: targetId,
            details: details,
            company_id: AppState.currentCompany,
            created_at: new Date().toISOString()
        };
        
        try {
            if (!AppState.useLocalAuth && AppState.supabase) {
                await AppState.supabase.from('audit_logs').insert(log);
            } else {
                await LocalDB.put('audit_logs', log);
            }
        } catch (error) {
            console.error('Erreur audit log:', error);
        }
    }
};

// ============================================
// MODULE GESTION DOCUMENTAIRE
// ============================================
const GED = {
    // Récupérer les documents
    async getDocuments(folderId = 'root', options = {}) {
        try {
            const companyId = AppState.currentCompany;
            
            if (!AppState.useLocalAuth && AppState.supabase) {
                let query = AppState.supabase
                    .from('documents')
                    .select('*')
                    .eq('company_id', companyId)
                    .eq('folder_id', folderId)
                    .eq('is_deleted', false);
                
                if (options.type && options.type !== 'all') {
                    query = query.eq('type', options.type);
                }
                
                const { data, error } = await query.order('created_at', { ascending: false });
                
                if (error) throw error;
                return data || [];
            } else {
                // Mode local
                const allDocs = await LocalDB.getAll('documents');
                return allDocs.filter(d => 
                    d.company_id === companyId && 
                    d.folder_id === folderId && 
                    !d.is_deleted
                );
            }
        } catch (error) {
            console.error('Erreur getDocuments:', error);
            return [];
        }
    },
    
    // Uploader un document
    async uploadDocument(file, metadata = {}) {
        try {
            const companyId = AppState.currentCompany;
            const userId = AppState.currentUser.id;
            const docId = crypto.randomUUID();
            
            // Lire le fichier
            const arrayBuffer = await file.arrayBuffer();
            const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            
            const document = {
                id: docId,
                name: metadata.name || file.name,
                original_name: file.name,
                mime_type: file.type,
                type: this.getFileType(file.type),
                size: file.size,
                description: metadata.description || '',
                scope: metadata.scope || 'company',
                owner_id: userId,
                company_id: companyId,
                folder_id: metadata.folder_id || 'root',
                tags: metadata.tags || [],
                storage_path: `local/${companyId}/${docId}`,
                version: 1,
                views: 0,
                downloads: 0,
                is_deleted: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            if (!AppState.useLocalAuth && AppState.supabase) {
                // Upload vers Supabase Storage
                const { error: uploadError } = await AppState.supabase.storage
                    .from('documents')
                    .upload(`${companyId}/${docId}`, file);
                
                if (uploadError) throw uploadError;
                
                const { error } = await AppState.supabase.from('documents').insert(document);
                if (error) throw error;
            } else {
                // Mode local - stocker dans IndexedDB
                await LocalDB.put('documents', document);
                await LocalDB.put('files', {
                    id: docId,
                    data: base64Data,
                    mime_type: file.type,
                    company_id: companyId
                });
            }
            
            await Auth.logAudit('upload', 'document', docId, { 
                name: document.name, 
                size: file.size 
            });
            
            return { success: true, document };
            
        } catch (error) {
            console.error('Erreur upload:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Télécharger un document
    async downloadDocument(docId) {
        try {
            if (!AppState.useLocalAuth && AppState.supabase) {
                const { data, error } = await AppState.supabase.storage
                    .from('documents')
                    .download(`${AppState.currentCompany}/${docId}`);
                
                if (error) throw error;
                return { success: true, data };
            } else {
                // Mode local
                const fileData = await LocalDB.getById('files', docId);
                if (!fileData) throw new Error('Fichier non trouvé');
                
                // Convertir base64 en Blob
                const byteCharacters = atob(fileData.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: fileData.mime_type });
                
                return { success: true, data: blob };
            }
        } catch (error) {
            console.error('Erreur download:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Supprimer un document (soft delete)
    async deleteDocument(docId) {
        try {
            if (!AppState.useLocalAuth && AppState.supabase) {
                const { error } = await AppState.supabase
                    .from('documents')
                    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                    .eq('id', docId);
                
                if (error) throw error;
            } else {
                const doc = await LocalDB.getById('documents', docId);
                if (doc) {
                    doc.is_deleted = true;
                    doc.deleted_at = new Date().toISOString();
                    await LocalDB.put('documents', doc);
                }
            }
            
            await Auth.logAudit('delete', 'document', docId);
            return { success: true };
            
        } catch (error) {
            console.error('Erreur delete:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Obtenir le type de fichier
    getFileType(mimeType) {
        if (mimeType.includes('pdf')) return 'pdf';
        if (mimeType.includes('word') || mimeType.includes('document')) return 'doc';
        if (mimeType.includes('excel') || mimeType.includes('sheet')) return 'xls';
        if (mimeType.includes('image')) return 'img';
        if (mimeType.includes('video')) return 'vid';
        if (mimeType.includes('audio')) return 'aud';
        return 'oth';
    },
    
    // Créer un dossier
    async createFolder(name, parentId = 'root') {
        try {
            const folder = {
                id: crypto.randomUUID(),
                name: name,
                parent_id: parentId,
                company_id: AppState.currentCompany,
                owner_id: AppState.currentUser.id,
                created_at: new Date().toISOString()
            };
            
            if (!AppState.useLocalAuth && AppState.supabase) {
                const { error } = await AppState.supabase.from('folders').insert(folder);
                if (error) throw error;
            } else {
                await LocalDB.put('folders', folder);
            }
            
            return { success: true, folder };
            
        } catch (error) {
            console.error('Erreur createFolder:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Partager un document
    async shareDocument(docId, recipientEmail, permission = 'view', expiresDays = 7) {
        try {
            const share = {
                id: crypto.randomUUID(),
                document_id: docId,
                document_name: (await this.getDocumentById(docId))?.name || '',
                sender_id: AppState.currentUser.id,
                recipient_email: recipientEmail,
                permission: permission,
                status: 'active',
                expires_at: new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString(),
                company_id: AppState.currentCompany,
                created_at: new Date().toISOString()
            };
            
            if (!AppState.useLocalAuth && AppState.supabase) {
                const { error } = await AppState.supabase.from('shares').insert(share);
                if (error) throw error;
            } else {
                await LocalDB.put('shares', share);
            }
            
            await Auth.logAudit('share', 'document', docId, { recipient: recipientEmail });
            return { success: true, share };
            
        } catch (error) {
            console.error('Erreur share:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Récupérer un document par ID
    async getDocumentById(docId) {
        try {
            if (!AppState.useLocalAuth && AppState.supabase) {
                const { data, error } = await AppState.supabase
                    .from('documents')
                    .select('*')
                    .eq('id', docId)
                    .single();
                
                if (error) throw error;
                return data;
            } else {
                return await LocalDB.getById('documents', docId);
            }
        } catch (error) {
            console.error('Erreur getDocumentById:', error);
            return null;
        }
    }
};

// ============================================
// MODULE ADMINISTRATION
// ============================================
const Admin = {
    // Récupérer les utilisateurs en attente de validation
    async getPendingUsers() {
        try {
            if (!AppState.currentUser?.permissions?.includes('validate_users')) {
                return { success: false, error: 'Permission refusée' };
            }
            
            const companyId = AppState.currentCompany;
            
            if (!AppState.useLocalAuth && AppState.supabase) {
                const { data, error } = await AppState.supabase
                    .from('profiles')
                    .select('*')
                    .eq('company_id', companyId)
                    .eq('status', 'pending');
                
                if (error) throw error;
                return { success: true, users: data || [] };
            } else {
                const allUsers = await LocalDB.getAll('profiles');
                const pending = allUsers.filter(u => 
                    u.company_id === companyId && u.status === 'pending'
                );
                return { success: true, users: pending };
            }
        } catch (error) {
            console.error('Erreur getPendingUsers:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Valider un utilisateur
    async validateUser(userId, role = 'viewer', permissions = ['read']) {
        try {
            if (!AppState.currentUser?.permissions?.includes('validate_users')) {
                return { success: false, error: 'Permission refusée' };
            }
            
            const updates = {
                status: 'active',
                role: role,
                permissions: permissions,
                updated_at: new Date().toISOString()
            };
            
            if (!AppState.useLocalAuth && AppState.supabase) {
                const { error } = await AppState.supabase
                    .from('profiles')
                    .update(updates)
                    .eq('id', userId);
                
                if (error) throw error;
            } else {
                const user = await LocalDB.getById('profiles', userId);
                if (user) {
                    Object.assign(user, updates);
                    await LocalDB.put('profiles', user);
                }
            }
            
            await Auth.logAudit('validate_user', 'user', userId, { role, permissions });
            return { success: true };
            
        } catch (error) {
            console.error('Erreur validateUser:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Rejeter un utilisateur
    async rejectUser(userId) {
        try {
            if (!AppState.currentUser?.permissions?.includes('validate_users')) {
                return { success: false, error: 'Permission refusée' };
            }
            
            if (!AppState.useLocalAuth && AppState.supabase) {
                const { error } = await AppState.supabase
                    .from('profiles')
                    .update({ status: 'rejected', updated_at: new Date().toISOString() })
                    .eq('id', userId);
                
                if (error) throw error;
            } else {
                const user = await LocalDB.getById('profiles', userId);
                if (user) {
                    user.status = 'rejected';
                    user.updated_at = new Date().toISOString();
                    await LocalDB.put('profiles', user);
                }
            }
            
            await Auth.logAudit('reject_user', 'user', userId);
            return { success: true };
            
        } catch (error) {
            console.error('Erreur rejectUser:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Récupérer tous les utilisateurs de l'entreprise
    async getCompanyUsers() {
        try {
            const companyId = AppState.currentCompany;
            
            if (!AppState.useLocalAuth && AppState.supabase) {
                const { data, error } = await AppState.supabase
                    .from('profiles')
                    .select('*')
                    .eq('company_id', companyId);
                
                if (error) throw error;
                return { success: true, users: data || [] };
            } else {
                const allUsers = await LocalDB.getByIndex('profiles', 'company_id', companyId);
                return { success: true, users: allUsers };
            }
        } catch (error) {
            console.error('Erreur getCompanyUsers:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Ajouter une signature électronique
    async addSignature(docId, signatureData) {
        try {
            if (!AppState.currentUser?.permissions?.includes('signatures')) {
                return { success: false, error: 'Permission refusée' };
            }
            
            const signature = {
                id: crypto.randomUUID(),
                document_id: docId,
                signer_id: AppState.currentUser.id,
                signer_email: AppState.currentUser.email,
                signature_data: signatureData,
                status: 'completed',
                signed_at: new Date().toISOString(),
                company_id: AppState.currentCompany,
                created_at: new Date().toISOString()
            };
            
            if (!AppState.useLocalAuth && AppState.supabase) {
                const { error } = await AppState.supabase.from('digital_signatures').insert(signature);
                if (error) throw error;
            } else {
                // Stocker localement
                const signatures = JSON.parse(localStorage.getItem('signatures') || '[]');
                signatures.push(signature);
                localStorage.setItem('signatures', JSON.stringify(signatures));
            }
            
            await Auth.logAudit('signature_added', 'document', docId);
            return { success: true, signature };
            
        } catch (error) {
            console.error('Erreur addSignature:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Récupérer les signatures d'un document
    async getDocumentSignatures(docId) {
        try {
            if (!AppState.useLocalAuth && AppState.supabase) {
                const { data, error } = await AppState.supabase
                    .from('digital_signatures')
                    .select('*')
                    .eq('document_id', docId);
                
                if (error) throw error;
                return { success: true, signatures: data || [] };
            } else {
                const signatures = JSON.parse(localStorage.getItem('signatures') || '[]');
                const docSignatures = signatures.filter(s => s.document_id === docId);
                return { success: true, signatures: docSignatures };
            }
        } catch (error) {
            console.error('Erreur getDocumentSignatures:', error);
            return { success: false, error: error.message };
        }
    }
};

// ============================================
// INTERFACE UTILISATEUR
// ============================================
const UI = {
    // Initialiser l'interface
    init() {
        this.setupEventListeners();
        this.checkAuthAndShowView();
    },
    
    // Configurer les écouteurs d'événements
    setupEventListeners() {
        // Formulaire de connexion
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value;
                const password = document.getElementById('login-password').value;
                
                const result = await Auth.login(email, password);
                if (result.success) {
                    this.showDashboard();
                } else {
                    this.showError(result.error);
                }
            });
        }
        
        // Formulaire d'inscription
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('reg-name').value;
                const email = document.getElementById('reg-email').value;
                const company = document.getElementById('reg-company').value;
                const password = document.getElementById('reg-password').value;
                
                const result = await Auth.register(email, password, name, company);
                if (result.success) {
                    this.showSuccess(result.message);
                    setTimeout(() => this.showLogin(), 2000);
                } else {
                    this.showError(result.error);
                }
            });
        }
        
        // Bouton de déconnexion
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await Auth.logout();
                this.showLogin();
            });
        }
        
        // Upload de fichier
        const fileInput = document.getElementById('file-upload');
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const files = e.target.files;
                for (const file of files) {
                    const result = await GED.uploadDocument(file);
                    if (result.success) {
                        this.showSuccess(`Document ${file.name} uploadé avec succès`);
                        this.refreshDocuments();
                    } else {
                        this.showError(result.error);
                    }
                }
            });
        }
        
        // Navigation
        document.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.target.dataset.view;
                this.switchView(view);
            });
        });
    },
    
    // Vérifier l'authentification et afficher la vue appropriée
    async checkAuthAndShowView() {
        const isAuthenticated = await Auth.checkSession();
        if (isAuthenticated) {
            this.showDashboard();
        } else {
            this.showLogin();
        }
    },
    
    // Afficher la page de connexion
    showLogin() {
        this.hideAllViews();
        const loginView = document.getElementById('login-view');
        if (loginView) {
            loginView.classList.remove('hidden');
        } else {
            this.renderLoginView();
        }
    },
    
    // Afficher le tableau de bord
    showDashboard() {
        this.hideAllViews();
        const dashboardView = document.getElementById('dashboard-view');
        if (dashboardView) {
            dashboardView.classList.remove('hidden');
            this.updateUserInfo();
            this.refreshDocuments();
        } else {
            this.renderDashboard();
        }
    },
    
    // Masquer toutes les vues
    hideAllViews() {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    },
    
    // Changer de vue
    switchView(viewName) {
        AppState.currentView = viewName;
        
        switch(viewName) {
            case 'dashboard':
                this.showDashboard();
                break;
            case 'documents':
                this.showDocumentsView();
                break;
            case 'workflows':
                this.showWorkflowsView();
                break;
            case 'admin':
                this.showAdminView();
                break;
            case 'profile':
                this.showProfileView();
                break;
            default:
                this.showDashboard();
        }
    },
    
    // Mettre à jour les infos utilisateur
    updateUserInfo() {
        const user = AppState.currentUser;
        if (!user) return;
        
        const userNameEl = document.getElementById('user-name');
        const userRoleEl = document.getElementById('user-role');
        const userCompanyEl = document.getElementById('user-company');
        
        if (userNameEl) userNameEl.textContent = user.name;
        if (userRoleEl) userRoleEl.textContent = user.role;
        if (userCompanyEl) userCompanyEl.textContent = user.company_name || user.company_id;
        
        // Afficher les éléments admin si applicable
        const adminElements = document.querySelectorAll('.admin-only');
        adminElements.forEach(el => {
            el.classList.toggle('hidden', !user.is_system_admin && user.role !== 'admin');
        });
    },
    
    // Rafraîchir la liste des documents
    async refreshDocuments() {
        const docs = await GED.getDocuments(AppState.currentFolder);
        AppState.documents = docs;
        this.renderDocumentsList(docs);
    },
    
    // Afficher un message d'erreur
    showError(message) {
        const errorEl = document.getElementById('error-message') || this.createMessageElement('error');
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        setTimeout(() => errorEl.classList.add('hidden'), 5000);
    },
    
    // Afficher un message de succès
    showSuccess(message) {
        const successEl = document.getElementById('success-message') || this.createMessageElement('success');
        successEl.textContent = message;
        successEl.classList.remove('hidden');
        setTimeout(() => successEl.classList.add('hidden'), 3000);
    },
    
    // Créer un élément de message
    createMessageElement(type) {
        const el = document.createElement('div');
        el.id = `${type}-message`;
        el.className = `alert alert-${type} hidden`;
        document.body.appendChild(el);
        return el;
    },
    
    // Rendu de la vue de connexion
    renderLoginView() {
        const main = document.getElementById('app') || document.body;
        main.innerHTML = `
            <div id="login-view" class="view login-container">
                <div class="login-box">
                    <h1>SYSTEMESGED</h1>
                    <h2>Connexion</h2>
                    
                    <div class="admin-info">
                        <p><strong>Admins préconfigurés:</strong></p>
                        <ul>
                            <li>ahouansouange@live.fr / AA++aa++11111</li>
                            <li>systemesshop@gmail.com / SS++ss++11111</li>
                        </ul>
                    </div>
                    
                    <form id="login-form">
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="login-email" required placeholder="votre@email.com">
                        </div>
                        <div class="form-group">
                            <label>Mot de passe</label>
                            <input type="password" id="login-password" required placeholder="••••••">
                        </div>
                        <button type="submit" class="btn btn-primary">Se connecter</button>
                    </form>
                    
                    <div class="login-links">
                        <a href="#" onclick="UI.showRegister()">Créer un compte</a>
                        <span class="divider">|</span>
                        <a href="#" onclick="UI.showForgotPassword()">Mot de passe oublié</a>
                    </div>
                    
                    <div id="error-message" class="alert alert-error hidden"></div>
                    <div id="success-message" class="alert alert-success hidden"></div>
                </div>
            </div>
        `;
        this.setupEventListeners();
    },
    
    // Afficher l'inscription
    showRegister() {
        const main = document.getElementById('app') || document.body;
        main.innerHTML = `
            <div id="register-view" class="view login-container">
                <div class="login-box">
                    <h1>SYSTEMESGED</h1>
                    <h2>Inscription</h2>
                    
                    <form id="register-form">
                        <div class="form-group">
                            <label>Nom complet</label>
                            <input type="text" id="reg-name" required placeholder="Jean Dupont">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="reg-email" required placeholder="votre@email.com">
                        </div>
                        <div class="form-group">
                            <label>Nom de l'entreprise</label>
                            <input type="text" id="reg-company" required placeholder="Ma Société">
                        </div>
                        <div class="form-group">
                            <label>Mot de passe</label>
                            <input type="password" id="reg-password" required placeholder="••••••" minlength="6">
                        </div>
                        <button type="submit" class="btn btn-primary">S'inscrire</button>
                    </form>
                    
                    <div class="login-links">
                        <a href="#" onclick="UI.showLogin()">Déjà un compte? Se connecter</a>
                    </div>
                    
                    <div id="error-message" class="alert alert-error hidden"></div>
                    <div id="success-message" class="alert alert-success hidden"></div>
                </div>
            </div>
        `;
        this.setupEventListeners();
    },
    
    // Afficher les documents oubliés
    showForgotPassword() {
        this.showSuccess('Contactez votre administrateur pour réinitialiser votre mot de passe');
    },
    
    // Rendre la liste des documents
    renderDocumentsList(docs) {
        const container = document.getElementById('documents-list');
        if (!container) return;
        
        if (docs.length === 0) {
            container.innerHTML = '<p class="empty-state">Aucun document. Commencez par en uploader un!</p>';
            return;
        }
        
        container.innerHTML = docs.map(doc => `
            <div class="document-card" data-id="${doc.id}">
                <div class="doc-icon">${this.getFileIcon(doc.type)}</div>
                <div class="doc-info">
                    <h4>${doc.name}</h4>
                    <p>${this.formatFileSize(doc.size)} • ${new Date(doc.created_at).toLocaleDateString()}</p>
                </div>
                <div class="doc-actions">
                    <button onclick="UI.downloadDoc('${doc.id}')" class="btn btn-sm">Télécharger</button>
                    <button onclick="UI.deleteDoc('${doc.id}')" class="btn btn-sm btn-danger">Supprimer</button>
                </div>
            </div>
        `).join('');
    },
    
    // Obtenir l'icône du fichier
    getFileIcon(type) {
        const icons = {
            pdf: '📄',
            doc: '📝',
            xls: '📊',
            img: '🖼️',
            vid: '🎥',
            aud: '🎵',
            oth: '📎'
        };
        return icons[type] || icons.oth;
    },
    
    // Formater la taille du fichier
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    // Télécharger un document
    async downloadDoc(docId) {
        const result = await GED.downloadDocument(docId);
        if (result.success) {
            const doc = await GED.getDocumentById(docId);
            const url = URL.createObjectURL(result.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = doc.name;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            this.showError(result.error);
        }
    },
    
    // Supprimer un document
    async deleteDoc(docId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce document?')) return;
        
        const result = await GED.deleteDocument(docId);
        if (result.success) {
            this.showSuccess('Document supprimé');
            this.refreshDocuments();
        } else {
            this.showError(result.error);
        }
    },
    
    // Rendre le tableau de bord complet
    renderDashboard() {
        const main = document.getElementById('app') || document.body;
        main.innerHTML = `
            <div class="app-container">
                <aside class="sidebar">
                    <div class="logo">
                        <h1>SYSTEMESGED</h1>
                    </div>
                    <nav>
                        <a href="#" data-view="dashboard" class="nav-item active">📊 Tableau de bord</a>
                        <a href="#" data-view="documents" class="nav-item">📁 Documents</a>
                        <a href="#" data-view="workflows" class="nav-item">🔄 Workflows</a>
                        <a href="#" data-view="admin" class="nav-item admin-only hidden">⚙️ Administration</a>
                        <a href="#" data-view="profile" class="nav-item">👤 Profil</a>
                    </nav>
                    <div class="user-info">
                        <p id="user-name"></p>
                        <p id="user-company" class="text-sm"></p>
                        <button id="logout-btn" class="btn btn-secondary">Déconnexion</button>
                    </div>
                </aside>
                
                <main class="main-content">
                    <div id="dashboard-view" class="view">
                        <h2>Tableau de bord</h2>
                        <div class="stats-grid">
                            <div class="stat-card">
                                <h3>Documents</h3>
                                <p id="stat-documents">0</p>
                            </div>
                            <div class="stat-card">
                                <h3>Workflows</h3>
                                <p id="stat-workflows">0</p>
                            </div>
                            <div class="stat-card">
                                <h3>Utilisateurs</h3>
                                <p id="stat-users">0</p>
                            </div>
                        </div>
                        
                        <div class="upload-section">
                            <h3>Uploader un document</h3>
                            <input type="file" id="file-upload" multiple>
                        </div>
                        
                        <div class="documents-section">
                            <h3>Mes documents récents</h3>
                            <div id="documents-list"></div>
                        </div>
                    </div>
                    
                    <div id="admin-view" class="view hidden">
                        <h2>Administration</h2>
                        <div id="admin-pending-users">
                            <h3>Utilisateurs en attente de validation</h3>
                            <div id="pending-users-list"></div>
                        </div>
                    </div>
                </main>
            </div>
            
            <div id="error-message" class="alert alert-error hidden"></div>
            <div id="success-message" class="alert alert-success hidden"></div>
        `;
        
        this.setupEventListeners();
        this.updateUserInfo();
        this.refreshDocuments();
        this.loadAdminData();
    },
    
    // Charger les données admin
    async loadAdminData() {
        if (!AppState.currentUser?.permissions?.includes('validate_users')) return;
        
        const result = await Admin.getPendingUsers();
        if (result.success && result.users.length > 0) {
            const container = document.getElementById('pending-users-list');
            if (container) {
                container.innerHTML = result.users.map(u => `
                    <div class="pending-user-card">
                        <p><strong>${u.name}</strong> (${u.email})</p>
                        <p>Entreprise: ${u.company_name || u.company_id}</p>
                        <button onclick="UI.validateUser('${u.id}')" class="btn btn-success">Valider</button>
                        <button onclick="UI.rejectUser('${u.id}')" class="btn btn-danger">Rejeter</button>
                    </div>
                `).join('');
            }
        }
    },
    
    // Valider un utilisateur (UI)
    async validateUser(userId) {
        const result = await Admin.validateUser(userId, 'viewer', ['read', 'write']);
        if (result.success) {
            this.showSuccess('Utilisateur validé');
            this.loadAdminData();
        } else {
            this.showError(result.error);
        }
    },
    
    // Rejeter un utilisateur (UI)
    async rejectUser(userId) {
        const result = await Admin.rejectUser(userId);
        if (result.success) {
            this.showSuccess('Utilisateur rejeté');
            this.loadAdminData();
        } else {
            this.showError(result.error);
        }
    },
    
    // Afficher la vue documents
    showDocumentsView() {
        this.switchView('dashboard'); // Pour l'instant, rediriger vers dashboard
        this.showSuccess('Vue Documents - utilisez le tableau de bord pour gérer vos documents');
    },
    
    // Afficher la vue workflows
    showWorkflowsView() {
        this.showSuccess('Module Workflows - en cours de développement');
    },
    
    // Afficher la vue admin
    showAdminView() {
        if (!AppState.currentUser?.permissions?.includes('validate_users')) {
            this.showError('Accès refusé');
            return;
        }
        this.hideAllViews();
        document.getElementById('admin-view').classList.remove('hidden');
        this.loadAdminData();
    },
    
    // Afficher la vue profil
    showProfileView() {
        this.showSuccess('Module Profil - en cours de développement');
    }
};

// ============================================
// STYLES CSS (Injecter dans le head)
// ============================================
const Styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #f5f7fa;
        color: #333;
        line-height: 1.6;
    }
    
    .hidden { display: none !important; }
    
    /* Login */
    .login-container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    
    .login-box {
        background: white;
        padding: 2rem;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        width: 100%;
        max-width: 400px;
    }
    
    .login-box h1 {
        text-align: center;
        color: #667eea;
        margin-bottom: 0.5rem;
    }
    
    .login-box h2 {
        text-align: center;
        color: #666;
        font-weight: 400;
        margin-bottom: 1.5rem;
    }
    
    .admin-info {
        background: #f0f4ff;
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1rem;
        font-size: 0.85rem;
    }
    
    .admin-info ul {
        margin-left: 1.2rem;
        margin-top: 0.5rem;
    }
    
    .form-group {
        margin-bottom: 1rem;
    }
    
    .form-group label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
        color: #555;
    }
    
    .form-group input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 1rem;
        transition: border-color 0.2s;
    }
    
    .form-group input:focus {
        outline: none;
        border-color: #667eea;
    }
    
    .btn {
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 1rem;
        transition: all 0.2s;
    }
    
    .btn-primary {
        background: #667eea;
        color: white;
        width: 100%;
    }
    
    .btn-primary:hover {
        background: #5568d3;
    }
    
    .btn-secondary {
        background: #6c757d;
        color: white;
    }
    
    .btn-success {
        background: #28a745;
        color: white;
    }
    
    .btn-danger {
        background: #dc3545;
        color: white;
    }
    
    .btn-sm {
        padding: 0.4rem 0.8rem;
        font-size: 0.875rem;
    }
    
    .login-links {
        text-align: center;
        margin-top: 1rem;
        color: #666;
    }
    
    .login-links a {
        color: #667eea;
        text-decoration: none;
    }
    
    .login-links a:hover {
        text-decoration: underline;
    }
    
    .divider {
        margin: 0 0.5rem;
        color: #ccc;
    }
    
    /* App Container */
    .app-container {
        display: flex;
        min-height: 100vh;
    }
    
    .sidebar {
        width: 260px;
        background: #1a1f37;
        color: white;
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
    }
    
    .logo h1 {
        font-size: 1.5rem;
        margin-bottom: 2rem;
        color: #667eea;
    }
    
    .sidebar nav {
        flex: 1;
    }
    
    .nav-item {
        display: block;
        padding: 0.75rem 1rem;
        color: #a0aec0;
        text-decoration: none;
        border-radius: 6px;
        margin-bottom: 0.5rem;
        transition: all 0.2s;
    }
    
    .nav-item:hover, .nav-item.active {
        background: #667eea;
        color: white;
    }
    
    .user-info {
        border-top: 1px solid #2d3748;
        padding-top: 1rem;
    }
    
    .user-info p {
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
    }
    
    .text-sm {
        font-size: 0.8rem;
        color: #a0aec0;
    }
    
    .main-content {
        flex: 1;
        padding: 2rem;
        overflow-y: auto;
    }
    
    /* Stats */
    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin-bottom: 2rem;
    }
    
    .stat-card {
        background: white;
        padding: 1.5rem;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .stat-card h3 {
        font-size: 0.875rem;
        color: #666;
        margin-bottom: 0.5rem;
    }
    
    .stat-card p {
        font-size: 2rem;
        font-weight: bold;
        color: #667eea;
    }
    
    /* Upload */
    .upload-section {
        background: white;
        padding: 1.5rem;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin-bottom: 2rem;
    }
    
    .upload-section h3 {
        margin-bottom: 1rem;
    }
    
    /* Documents */
    .documents-section {
        background: white;
        padding: 1.5rem;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .documents-section h3 {
        margin-bottom: 1rem;
    }
    
    .document-card {
        display: flex;
        align-items: center;
        padding: 1rem;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        margin-bottom: 0.75rem;
        transition: box-shadow 0.2s;
    }
    
    .document-card:hover {
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    
    .doc-icon {
        font-size: 2rem;
        margin-right: 1rem;
    }
    
    .doc-info {
        flex: 1;
    }
    
    .doc-info h4 {
        margin-bottom: 0.25rem;
    }
    
    .doc-info p {
        font-size: 0.875rem;
        color: #666;
    }
    
    .doc-actions {
        display: flex;
        gap: 0.5rem;
    }
    
    .empty-state {
        text-align: center;
        color: #666;
        padding: 2rem;
    }
    
    /* Alerts */
    .alert {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 6px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    }
    
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    .alert-error {
        background: #fee;
        color: #c33;
        border: 1px solid #fcc;
    }
    
    .alert-success {
        background: #efe;
        color: #3c3;
        border: 1px solid #cfc;
    }
    
    /* Admin */
    .pending-user-card {
        background: #f8f9fa;
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1rem;
        border-left: 4px solid #ffc107;
    }
    
    .pending-user-card button {
        margin-right: 0.5rem;
        margin-top: 0.5rem;
    }
    
    /* Responsive */
    @media (max-width: 768px) {
        .sidebar {
            width: 100%;
            position: fixed;
            bottom: 0;
            height: auto;
            flex-direction: row;
            padding: 0.5rem;
        }
        
        .sidebar nav {
            display: flex;
            overflow-x: auto;
        }
        
        .nav-item {
            white-space: nowrap;
            margin-bottom: 0;
            margin-right: 0.5rem;
        }
        
        .main-content {
            margin-bottom: 80px;
        }
    }
`;

// ============================================
// INITIALISATION DE L'APPLICATION
// ============================================
async function initApp() {
    // Injecter les styles
    const styleEl = document.createElement('style');
    styleEl.textContent = Styles;
    document.head.appendChild(styleEl);
    
    // Créer le conteneur de l'app si nécessaire
    if (!document.getElementById('app')) {
        const appDiv = document.createElement('div');
        appDiv.id = 'app';
        document.body.appendChild(appDiv);
    }
    
    // Initialiser l'authentification
    await Auth.init();
    
    // Initialiser l'interface
    UI.init();
}

// Démarrer l'application quand le DOM est prêt
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Exporter les modules pour l'accès global
window.AppState = AppState;
window.Auth = Auth;
window.GED = GED;
window.Admin = Admin;
window.UI = UI;
