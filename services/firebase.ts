/**
 * Firebase (Firestore) para sincronização em tempo real entre usuários.
 * Dados continuam criptografados antes de enviar ao servidor.
 */

import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

export const isFirebaseConfigured = Boolean(apiKey && projectId);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

function getOrInitApp() {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

let db: ReturnType<typeof getFirestore> | null = null;

export function getDb() {
  if (!db && isFirebaseConfigured) {
    db = getFirestore(getOrInitApp());
  }
  return db;
}

let auth: ReturnType<typeof getAuth> | null = null;

export function getFirebaseAuth() {
  if (!auth && isFirebaseConfigured) {
    auth = getAuth(getOrInitApp());
  }
  return auth;
}

export const BOARD_COLLECTION = 'board';
export const BOARD_DOC_ID = 'main';
export const USERS_COLLECTION = 'users';
