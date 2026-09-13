// firebase.js
// Cole aqui os dados EXATOS do seu projeto no Firebase Console.
// Firebase Console > Configurações do projeto > Seus apps > Web app

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  where
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'COLE_SUA_API_KEY',
  authDomain: 'SEU-PROJETO.firebaseapp.com',
  projectId: 'SEU-PROJETO',
  storageBucket: 'COLE_O_STORAGE_BUCKET_DO_FIREBASE',
  messagingSenderId: 'COLE_SEU_MESSAGING_SENDER_ID',
  appId: 'COLE_SEU_APP_ID'
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
try {
  await setPersistence(auth, browserLocalPersistence);
} catch (e) {
  console.warn('Persistência local do Firebase Auth indisponível:', e);
}
export const db = getFirestore(app);
export const storage = getStorage(app);

export {
  signInAnonymously,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  where,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
};
