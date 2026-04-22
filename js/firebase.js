// =============================================
// firebase.js — Firebase integration
// Replace config values with your own project
// =============================================

// INSTRUCTIONS:
// 1. Go to https://console.firebase.google.com
// 2. Create project → Add web app
// 3. Copy your config below (replace the placeholder values)
// 4. Enable: Authentication (Email/Google), Firestore, Cloud Messaging

const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

let firebaseReady = false;
let auth = null;
let db = null;

// Dynamically load Firebase SDKs
export async function initFirebase() {
  try {
    if (firebaseReady) return { auth, db };

    // Firebase v9+ modular SDK via CDN
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js');
    const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } =
      await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js');
    const { getFirestore, collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc, deleteDoc, serverTimestamp } =
      await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');

    const app = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);
    firebaseReady = true;

    return { auth, db, getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
             onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
             getFirestore, collection, addDoc, getDocs, query, where, orderBy,
             doc, updateDoc, deleteDoc, serverTimestamp };
  } catch (err) {
    console.warn('[Firebase] Not configured yet:', err.message);
    return null;
  }
}

// === FIRESTORE: Save transaction ===
// Path: users/{uid}/transactions/{txId}
export async function saveToFirestore(uid, transaction) {
  const firebase = await initFirebase();
  if (!firebase || !firebase.db) {
    console.warn('[Firebase] Offline — saved to IndexedDB only');
    return null;
  }
  const { db, collection, addDoc, serverTimestamp } = firebase;
  return addDoc(collection(db, 'users', uid, 'transactions'), {
    ...transaction,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// === FIRESTORE: Get all transactions ===
export async function getFromFirestore(uid) {
  const firebase = await initFirebase();
  if (!firebase) return [];
  const { db, collection, getDocs, query, orderBy } = firebase;
  const q = query(collection(db, 'users', uid, 'transactions'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// === FIRESTORE RULES (paste in Firebase console) ===
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
*/