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
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js';

// CONFIGURAÇÃO DO PROJETO VIBEAPP (copiada do Firebase Console)
// Projeto: vibeapp-53553
// Se você usar este pacote em outro projeto, substitua apenas este bloco
// pela configuração exibida em: Configurações do projeto > Seus apps > Web.
const firebaseConfig = {
  apiKey: 'AIzaSyAusA6dZbXj07ZA2Kq8nKTXwq0sqxp2A38',
  authDomain: 'vibeapp-53553.firebaseapp.com',
  projectId: 'vibeapp-53553',
  storageBucket: 'vibeapp-53553.firebasestorage.app',
  messagingSenderId: '58335475243',
  appId: '1:58335475243:web:172650ea4c1e6db43ebd6e',
  measurementId: 'G-XCP9RX1X7'
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((e) => {
  console.warn('Persistência local do Firebase Auth indisponível:', e);
});
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
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
};
