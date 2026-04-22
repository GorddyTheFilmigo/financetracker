// =============================================
// db.js — IndexedDB offline-first storage
// Syncs to Firebase when online
// =============================================

const DB_NAME = 'pesa-tracker';
const DB_VERSION = 1;
const STORES = { transactions: 'transactions', budgets: 'budgets', settings: 'settings' };

let db = null;

// === OPEN DB ===
export function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('transactions')) {
        const store = d.createObjectStore('transactions', { keyPath: 'id' });
        store.createIndex('date',   'date',   { unique: false });
        store.createIndex('source', 'source', { unique: false });
        store.createIndex('cat',    'cat',    { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }
      if (!d.objectStoreNames.contains('budgets')) {
        d.createObjectStore('budgets', { keyPath: 'cat' });
      }
      if (!d.objectStoreNames.contains('settings')) {
        d.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = e => reject(e.target.error);
  });
}

// === GENERIC HELPERS ===
function tx(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function wrap(req) {
  return new Promise((res, rej) => {
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

// === TRANSACTIONS ===
export async function saveTransaction(t) {
  await openDB();
  const record = {
    ...t,
    id:        t.id || `tx_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    createdAt: t.createdAt || new Date().toISOString(),
    synced:    false
  };
  await wrap(tx('transactions', 'readwrite').put(record));
  return record;
}

export async function getAllTransactions() {
  await openDB();
  return wrap(tx('transactions').getAll());
}

export async function getTransactionsBySource(source) {
  await openDB();
  return wrap(tx('transactions').index('source').getAll(source));
}

export async function deleteTransaction(id) {
  await openDB();
  return wrap(tx('transactions', 'readwrite').delete(id));
}

export async function getUnsynced() {
  await openDB();
  return wrap(tx('transactions').index('synced').getAll(false));
}

export async function markSynced(id) {
  await openDB();
  const store = tx('transactions', 'readwrite');
  const record = await wrap(store.get(id));
  if (record) { record.synced = true; await wrap(store.put(record)); }
}

// === BUDGETS ===
export async function saveBudget(cat, limit) {
  await openDB();
  return wrap(tx('budgets', 'readwrite').put({ cat, limit }));
}

export async function getAllBudgets() {
  await openDB();
  return wrap(tx('budgets').getAll());
}

// === SETTINGS ===
export async function getSetting(key, fallback = null) {
  await openDB();
  const r = await wrap(tx('settings').get(key));
  return r ? r.value : fallback;
}

export async function setSetting(key, value) {
  await openDB();
  return wrap(tx('settings', 'readwrite').put({ key, value }));
}

// === SEED DEMO DATA ===
export async function seedDemoData() {
  const existing = await getAllTransactions();
  if (existing.length > 0) return;

  const demos = [
    { name:'Salary — TechCo Ltd',     amount:85000, type:'income',  source:'bank',  cat:'salary',        icon:'💼', date:'2025-04-14', desc:'Monthly salary' },
    { name:'Kenchic Restaurant',       amount:-350,  type:'expense', source:'mpesa', cat:'food',          icon:'🍔', date:'2025-04-15', desc:'Lunch' },
    { name:'Sent to MARY WANJIKU',     amount:-1500, type:'expense', source:'mpesa', cat:'transfer',      icon:'📤', date:'2025-04-14', desc:'Personal' },
    { name:'Kenya Power Paybill',      amount:-2800, type:'expense', source:'mpesa', cat:'utilities',     icon:'💡', date:'2025-04-13', desc:'Electricity' },
    { name:'Matatu — CBD to Westlands',amount:-50,   type:'expense', source:'cash',  cat:'transport',     icon:'🚐', date:'2025-04-13', desc:'Fare' },
    { name:'Naivas Supermarket',       amount:-1240, type:'expense', source:'mpesa', cat:'food',          icon:'🛒', date:'2025-04-12', desc:'Groceries' },
    { name:'Freelance — Web project',  amount:12000, type:'income',  source:'mpesa', cat:'freelance',     icon:'💻', date:'2025-04-11', desc:'Website design' },
    { name:'Equity Bank ATM',          amount:-5000, type:'expense', source:'bank',  cat:'cash',          icon:'🏧', date:'2025-04-11', desc:'Withdrawal' },
    { name:'Netflix via M-Pesa',       amount:-950,  type:'expense', source:'mpesa', cat:'entertainment', icon:'🎬', date:'2025-04-10', desc:'Subscription' },
    { name:'Cash lunch',               amount:-200,  type:'expense', source:'cash',  cat:'food',          icon:'🍽️', date:'2025-04-09', desc:'Manual entry' },
    { name:'Airtime top-up',           amount:-100,  type:'expense', source:'mpesa', cat:'utilities',     icon:'📱', date:'2025-04-09', desc:'Safaricom' },
    { name:'Java House — Coffee',      amount:-480,  type:'expense', source:'mpesa', cat:'food',          icon:'☕', date:'2025-04-08', desc:'Meeting' },
  ];

  for (const d of demos) {
    await saveTransaction({ ...d, id: `demo_${Math.random().toString(36).slice(2,10)}`, synced: true, createdAt: d.date + 'T10:00:00Z' });
  }

  // Seed budgets
  const budgets = [
    { cat:'food', limit:20000 }, { cat:'transport', limit:15000 },
    { cat:'utilities', limit:5000 }, { cat:'entertainment', limit:3000 }, { cat:'health', limit:4000 }
  ];
  for (const b of budgets) await saveBudget(b.cat, b.limit);
}