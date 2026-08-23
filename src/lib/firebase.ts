import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import firebaseConfigFile from '../../firebase-applet-config.json';
import { getActiveDatabaseProfile } from './firebaseConfigManager';

const activeProfile = getActiveDatabaseProfile();
const currentConfig = activeProfile?.config || firebaseConfigFile;

// Initialize app with distinct name or default
export const app = getApps().length === 0
  ? initializeApp({
      apiKey: currentConfig.apiKey,
      authDomain: currentConfig.authDomain,
      projectId: currentConfig.projectId,
      storageBucket: currentConfig.storageBucket,
      messagingSenderId: currentConfig.messagingSenderId,
      appId: currentConfig.appId,
    })
  : getApp();

const rawDatabaseId = currentConfig.firestoreDatabaseId;
const databaseId = (rawDatabaseId && rawDatabaseId !== '(default)') 
  ? rawDatabaseId 
  : undefined;

export const db = databaseId 
  ? initializeFirestore(app, {}, databaseId) 
  : getFirestore(app);

export const auth = getAuth(app);
export const storage = getStorage(app);
export const activeDbProfile = activeProfile;

