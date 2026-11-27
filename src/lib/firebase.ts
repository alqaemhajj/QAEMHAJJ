import { initializeApp, getApps } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
} from 'firebase/auth';
import { getFirestore, initializeFirestore, setLogLevel, Firestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';
import { safeStorage } from '../utils/safeStorage';

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

let firebaseAuth: Auth;
try {
  const canPersist = safeStorage.isPersistent();
  firebaseAuth = initializeAuth(app, {
    persistence: canPersist
      ? [browserLocalPersistence, inMemoryPersistence]
      : [inMemoryPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
} catch {
  firebaseAuth = getAuth(app);
}

export const db = firestoreDb;
export const auth = firebaseAuth;
export const storage = getStorage(app);
export { firebaseConfig };
