import type { Company } from '../types';

export interface SavedSearch {
    id: string;
    name: string;
    timestamp: number;
    searchParams: {
        categories: string[];
        radius: number;
        location: {
            latitude: number;
            longitude: number;
            name?: string;
        };
        limit: number;
    };
    companies: Company[];
    filters?: {
        minRating: number;
        hasWebsite: boolean;
        hasGoogleProfile: boolean;
    };
}

const DB_NAME = 'KenyaBusinessFinderDB';
const DB_VERSION = 1;
const STORE_NAME = 'savedSearches';

let db: IDBDatabase | null = null;

/**
 * Initialize the IndexedDB database
 */
export const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            reject(new Error('Failed to open IndexedDB'));
        };

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result;

            // Create object store if it doesn't exist
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                objectStore.createIndex('name', 'name', { unique: false });
            }
        };
    });
};

/**
 * Save a search to IndexedDB
 */
export const saveSearch = async (search: SavedSearch): Promise<void> => {
    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(search);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to save search'));
    });
};

/**
 * Get all saved searches from IndexedDB
 */
export const getSavedSearches = async (): Promise<SavedSearch[]> => {
    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const searches = request.result as SavedSearch[];
            // Sort by timestamp, newest first
            searches.sort((a, b) => b.timestamp - a.timestamp);
            resolve(searches);
        };
        request.onerror = () => reject(new Error('Failed to get saved searches'));
    });
};

/**
 * Get a single saved search by ID
 */
export const getSavedSearch = async (id: string): Promise<SavedSearch | null> => {
    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(new Error('Failed to get saved search'));
    });
};

/**
 * Update an existing saved search
 */
export const updateSearch = async (id: string, search: SavedSearch): Promise<void> => {
    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ ...search, id });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to update search'));
    });
};

/**
 * Delete a saved search by ID
 */
export const deleteSearch = async (id: string): Promise<void> => {
    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to delete search'));
    });
};

/**
 * Get all saved company names for exclusion filtering
 */
export const getAllSavedCompanyNames = async (): Promise<string[]> => {
    const searches = await getSavedSearches();
    const names = new Set<string>();

    searches.forEach(search => {
        search.companies.forEach(company => {
            names.add(company.name);
        });
    });

    return Array.from(names);
};

/**
 * Clear all saved searches (for testing/debugging)
 */
export const clearAllSearches = async (): Promise<void> => {
    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to clear searches'));
    });
};
