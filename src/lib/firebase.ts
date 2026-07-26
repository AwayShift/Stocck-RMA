import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAEoFGB4Vr94R4yvcFbYINhot8FHjuc8bo",
  authDomain: "gen-lang-client-0295225444.firebaseapp.com",
  projectId: "gen-lang-client-0295225444",
  storageBucket: "gen-lang-client-0295225444.firebasestorage.app",
  messagingSenderId: "390124504284",
  appId: "1:390124504284:web:e450040d8f0a2a82a5e019"
};

export const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {}, "ai-studio-rmaflowtriagemde-d03b31df-1846-46fc-a8b7-6171aa62d121");
export const auth = getAuth(app);
export const storage = getStorage(app);
