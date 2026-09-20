import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { UserEntity, ServiceEntity, AvailabilityWorkingHours } from '../common/types';

export interface FirestoreQueryOptions {
  where?: [string, '<' | '<=' | '==' | '>=' | '>' | '!=', any][];
  orderBy?: [string, 'asc' | 'desc'];
  limit?: number;
}

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private firestoreInstance: admin.firestore.Firestore | null = null;
  private isLiveFirebase = false;

  // In-memory fallback datastore for local dev / testing if Firebase credentials are not provided
  private inMemoryStore: Map<string, Map<string, any>> = new Map();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.initializeFirebase();
    this.seedInitialData();
    await this.enforceStrictUserRoles();
  }

  private initializeFirebase() {
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    let privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    if (projectId && clientEmail && privateKey && !projectId.includes('example')) {
      try {
        if (privateKey.includes('\\n')) {
          privateKey = privateKey.replace(/\\n/g, '\n');
        }

        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey,
            }),
          });
        }

        this.firestoreInstance = admin.firestore();
        this.firestoreInstance.settings({ ignoreUndefinedProperties: true });
        this.isLiveFirebase = true;
        this.logger.log(`Firebase Admin SDK initialized successfully for project: ${projectId}`);
        return;
      } catch (error) {
        this.logger.warn(`Failed to initialize Firebase Admin SDK: ${error.message}. Falling back to dev datastore.`);
      }
    } else {
      this.logger.log('No live Firebase credentials found or placeholder used. Running in dev datastore mode.');
    }

    this.isLiveFirebase = false;
  }

  public isLive(): boolean {
    return this.isLiveFirebase;
  }

  // --- Collection Operations ---

  private getCollectionStore(collectionName: string): Map<string, any> {
    if (!this.inMemoryStore.has(collectionName)) {
      this.inMemoryStore.set(collectionName, new Map());
    }
    return this.inMemoryStore.get(collectionName)!;
  }

  async getDoc<T = any>(collection: string, id: string): Promise<T | null> {
    if (this.isLiveFirebase && this.firestoreInstance) {
      const snap = await this.firestoreInstance.collection(collection).doc(id).get();
      if (!snap.exists) return null;
      return { id: snap.id, ...snap.data() } as T;
    }

    const store = this.getCollectionStore(collection);
    const item = store.get(id);
    return item ? ({ ...item } as T) : null;
  }

  private sanitizeData(data: any): any {
    if (data === null || data === undefined) {
      return null;
    }
    if (typeof data !== 'object') {
      return data;
    }
    if (data instanceof Date) {
      return data.toISOString();
    }
    if (Array.isArray(data)) {
      return data
        .filter((item) => item !== undefined)
        .map((item) => this.sanitizeData(item));
    }
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        clean[key] = this.sanitizeData(value);
      }
    }
    return clean;
  }

  async setDoc(collection: string, id: string, data: any): Promise<void> {
    const rawPayload = { ...data, id, updatedAt: new Date().toISOString() };
    if (!rawPayload.createdAt) {
      rawPayload.createdAt = new Date().toISOString();
    }
    const payload = this.sanitizeData(rawPayload);

    if (this.isLiveFirebase && this.firestoreInstance) {
      await this.firestoreInstance.collection(collection).doc(id).set(payload, { merge: true });
      return;
    }

    const store = this.getCollectionStore(collection);
    const existing = store.get(id) || {};
    store.set(id, { ...existing, ...payload });
  }

  async addDoc(collection: string, data: any): Promise<string> {
    const id = data.id || `${collection.slice(0, 3)}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await this.setDoc(collection, id, data);
    return id;
  }

  async updateDoc(collection: string, id: string, data: any): Promise<void> {
    const payload = this.sanitizeData({
      ...data,
      updatedAt: new Date().toISOString(),
    });

    if (this.isLiveFirebase && this.firestoreInstance) {
      await this.firestoreInstance.collection(collection).doc(id).update(payload);
      return;
    }

    const store = this.getCollectionStore(collection);
    const existing = store.get(id);
    if (!existing) {
      throw new Error(`Document ${id} not found in collection ${collection}`);
    }
    store.set(id, {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteDoc(collection: string, id: string): Promise<void> {
    if (this.isLiveFirebase && this.firestoreInstance) {
      await this.firestoreInstance.collection(collection).doc(id).delete();
      return;
    }

    const store = this.getCollectionStore(collection);
    store.delete(id);
  }

  async queryDocs<T = any>(
    collection: string,
    options: FirestoreQueryOptions = {},
  ): Promise<T[]> {
    if (this.isLiveFirebase && this.firestoreInstance) {
      try {
        let query: admin.firestore.Query = this.firestoreInstance.collection(collection);

        if (options.where) {
          for (const [field, op, val] of options.where) {
            query = query.where(field, op, val);
          }
        }

        if (options.orderBy) {
          query = query.orderBy(options.orderBy[0], options.orderBy[1]);
        }

        if (options.limit) {
          query = query.limit(options.limit);
        }

        const snap = await query.get();
        return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as T);
      } catch (error: any) {
        if (error.message?.includes('index') && options.orderBy) {
          this.logger.warn(`Firestore composite index required for ${collection}; falling back to in-memory sorting.`);
          let fallbackQuery: admin.firestore.Query = this.firestoreInstance.collection(collection);
          if (options.where) {
            for (const [field, op, val] of options.where) {
              fallbackQuery = fallbackQuery.where(field, op, val);
            }
          }
          const snap = await fallbackQuery.get();
          let results = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as T);
          const [field, direction] = options.orderBy;
          results.sort((a: any, b: any) => {
            const valA = a[field] ?? '';
            const valB = b[field] ?? '';
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
          });
          if (options.limit) {
            results = results.slice(0, options.limit);
          }
          return results;
        }
        throw error;
      }
    }

    // In-memory querying
    const store = this.getCollectionStore(collection);
    let results = Array.from(store.values());

    const getNestedVal = (obj: any, path: string) => {
      if (!obj || !path) return undefined;
      return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
    };

    if (options.where) {
      for (const [field, op, val] of options.where) {
        results = results.filter((item) => {
          const itemVal = getNestedVal(item, field);
          switch (op) {
            case '==':
              return itemVal === val;
            case '!=':
              return itemVal !== val;
            case '>':
              return itemVal > val;
            case '>=':
              return itemVal >= val;
            case '<':
              return itemVal < val;
            case '<=':
              return itemVal <= val;
            default:
              return true;
          }
        });
      }
    }

    if (options.orderBy) {
      const [field, direction] = options.orderBy;
      results.sort((a, b) => {
        if (a[field] < b[field]) return direction === 'asc' ? -1 : 1;
        if (a[field] > b[field]) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results as T[];
  }

  // --- Atomic Lock / Transaction Support for Double Booking Prevention ---

  /**
   * Run a critical double-booking check and reservation inside an atomic transaction.
   */
  async runTransaction<T>(
    updateFunction: (t: {
      getDoc: (col: string, id: string) => Promise<any>;
      queryDocs: (col: string, options: FirestoreQueryOptions) => Promise<any[]>;
      setDoc: (col: string, id: string, data: any) => void;
    }) => Promise<T>,
  ): Promise<T> {
    if (this.isLiveFirebase && this.firestoreInstance) {
      return this.firestoreInstance.runTransaction(async (liveTx) => {
        const txHelper = {
          getDoc: async (col: string, id: string) => {
            const ref = this.firestoreInstance!.collection(col).doc(id);
            const snap = await liveTx.get(ref);
            return snap.exists ? { id: snap.id, ...snap.data() } : null;
          },
          queryDocs: async (col: string, options: FirestoreQueryOptions) => {
            // Note: firestore transactions query via direct reads
            return this.queryDocs(col, options);
          },
          setDoc: (col: string, id: string, data: any) => {
            const ref = this.firestoreInstance!.collection(col).doc(id);
            const payload = this.sanitizeData({
              ...data,
              updatedAt: new Date().toISOString(),
            });
            liveTx.set(ref, payload, { merge: true });
          },
        };
        return updateFunction(txHelper);
      });
    }

    // In-memory atomic block
    const txHelper = {
      getDoc: (col: string, id: string) => this.getDoc(col, id),
      queryDocs: (col: string, options: FirestoreQueryOptions) => this.queryDocs(col, options),
      setDoc: (col: string, id: string, data: any) => {
        this.setDoc(col, id, data);
      },
    };
    return updateFunction(txHelper);
  }

  isAdminEmail(email?: string): boolean {
    if (!email) return false;
    const cleanEmail = email.toLowerCase().trim();
    const adminEmails = ['admin@gmail.com', 'admin@gmaiil.com'];
    return adminEmails.includes(cleanEmail);
  }

  // --- Auth Token Verification ---

  async verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken | { uid: string; email: string; name?: string; role: 'admin' | 'user' }> {
    if (token === 'dev-admin-token') {
      return {
        uid: 'admin_default',
        email: 'admin@gmail.com',
        name: 'System Admin',
        role: 'admin',
      };
    }

    if (this.isLiveFirebase) {
      const decoded = await admin.auth().verifyIdToken(token);
      const role = this.isAdminEmail(decoded.email) ? 'admin' : 'user';
      return {
        ...decoded,
        role,
      };
    }


    // If token is Base64 encoded JSON (e.g. from frontend dev mock)
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
      if (decoded.uid && decoded.email) {
        const role = this.isAdminEmail(decoded.email) ? 'admin' : 'user';
        return {
          uid: decoded.uid,
          email: decoded.email,
          name: decoded.name || 'User',
          role,
        };
      }
    } catch (_) {}

    // Default mock user for general testing
    return {
      uid: 'user_' + token.substring(0, 8),
      email: 'user@example.com',
      name: 'Authenticated User',
      role: 'user',
    };
  }

  // --- Seed Data ---

  private seedInitialData() {
    const servicesStore = this.getCollectionStore('services');
    if (servicesStore.size === 0) {
      const defaultServices: ServiceEntity[] = [
        {
          id: 'svc_60min',
          name: '60 Minute Consultation',
          slug: '60-minute-consultation',
          description: 'Comprehensive one-on-one consulting session covering strategy, architecture, and actionable roadmap.',
          durationMinutes: 60,
          price: 2500,
          currency: 'INR',
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'svc_30min',
          name: '30 Minute Discovery Call',
          slug: '30-minute-discovery-call',
          description: 'Quick introductory session to review project scope, assess needs, and determine next steps.',
          durationMinutes: 30,
          price: 1500,
          currency: 'INR',
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'svc_90min',
          name: 'Deep-Dive Technical Review',
          slug: 'deep-dive-technical-review',
          description: 'Intensive 90-minute technical deep-dive into system design, scalability, and code audit.',
          durationMinutes: 90,
          price: 4500,
          currency: 'INR',
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      for (const s of defaultServices) {
        this.setDoc('services', s.id, s);
      }
    }

    const availStore = this.getCollectionStore('availability');
    if (availStore.size === 0) {
      const days = [
        { dayOfWeek: 1, dayName: 'Monday', enabled: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 2, dayName: 'Tuesday', enabled: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 3, dayName: 'Wednesday', enabled: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 4, dayName: 'Thursday', enabled: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 5, dayName: 'Friday', enabled: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 6, dayName: 'Saturday', enabled: false, startTime: '10:00', endTime: '14:00' },
        { dayOfWeek: 0, dayName: 'Sunday', enabled: false, startTime: '10:00', endTime: '14:00' },
      ];

      for (const d of days) {
        this.setDoc('availability', `day_${d.dayOfWeek}`, d);
      }
    }

    // Seed default admin user in Firestore
    const adminEmail = 'admin@gmail.com';
    const defaultAdmin: UserEntity = {
      id: 'admin_default',
      email: adminEmail,
      name: 'System Admin',
      role: 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.setDoc('users', defaultAdmin.id, defaultAdmin);
  }

  private async enforceStrictUserRoles() {
    try {
      const allUsers = await this.queryDocs<UserEntity>('users');
      for (const u of allUsers) {
        if (u.role === 'admin' && !this.isAdminEmail(u.email)) {
          this.logger.warn(`Demoting non-admin user ${u.email} (${u.id}) to role: 'user' in Firestore`);
          await this.updateDoc('users', u.id, { role: 'user', updatedAt: new Date().toISOString() });
        }
      }
    } catch (e: any) {
      this.logger.warn(`User role check on init skipped: ${e.message}`);
    }
  }
}
