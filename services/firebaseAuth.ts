import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  type User,
  type Unsubscribe,
  getAuth,
} from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  collection,
  deleteDoc,
} from 'firebase/firestore';
import { getFirebaseAuth, getDb, USERS_COLLECTION } from './firebase';
import type { UserProfile } from '../types/user';

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase Auth não configurado');
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

/**
 * Uses a temporary secondary Firebase app to avoid signing out the current admin
 * when creating a new user via createUserWithEmailAndPassword.
 */
export async function createUser(email: string, password: string): Promise<User> {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  };
  const tempApp = initializeApp(config, `temp-create-${Date.now()}`);
  try {
    const tempAuth = getAuth(tempApp);
    const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
    await signOut(tempAuth);
    return cred.user;
  } finally {
    await deleteApp(tempApp);
  }
}

export async function logoutFirebase(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}

export function onAuthChange(cb: (user: User | null) => void): Unsubscribe {
  const auth = getFirebaseAuth();
  if (!auth) return () => {};
  return onAuthStateChanged(auth, cb);
}

export async function resetPassword(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase Auth não configurado');
  await sendPasswordResetEmail(auth, email);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const db = getDb();
  if (!db) return null;
  const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('Firestore não configurado');
  await setDoc(doc(db, USERS_COLLECTION, profile.uid), profile);
}

export async function updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('Firestore não configurado');
  await updateDoc(doc(db, USERS_COLLECTION, uid), updates as Record<string, unknown>);
}

export async function deleteUserProfile(uid: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('Firestore não configurado');
  await deleteDoc(doc(db, USERS_COLLECTION, uid));
}

export async function listAllUsers(): Promise<UserProfile[]> {
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(collection(db, USERS_COLLECTION));
  return snap.docs.map((d) => d.data() as UserProfile);
}
