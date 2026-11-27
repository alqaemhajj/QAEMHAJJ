import { initializeApp, getApps } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, setLogLevel, Firestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

setLogLevel('silent');

let firestoreDb: Firestore;
try {
  firestoreDb = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

// Use canonical getAuth(app): works cleanly in both Node.js (server.ts) and browser/iframe runtimes
// without passing browser-only popupRedirectResolver to Node builds; Firebase Auth automatically
// falls back to inMemoryPersistence if IndexedDB/localStorage are restricted in sandboxed iframes.
const firebaseAuth: Auth = getAuth(app);

export const db = firestoreDb;
export const auth = firebaseAuth;
export const storage = getStorage(app);
export { firebaseConfig };
