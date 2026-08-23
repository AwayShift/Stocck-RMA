/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FirebaseAppConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId?: string;
  measurementId?: string;
}

export interface DatabaseProfile {
  id: string;
  name: string;
  description: string;
  isProduction: boolean;
  badgeColor: 'emerald' | 'amber' | 'sky' | 'purple';
  config: FirebaseAppConfig;
}

const STORAGE_ACTIVE_PROFILE_KEY = 'rmaflow_active_db_profile';
const STORAGE_PROFILES_KEY = 'rmaflow_db_profiles_custom';

export const DEFAULT_DATABASE_PROFILES: DatabaseProfile[] = [
  {
    id: 'main',
    name: 'Banco Principal (Produção)',
    description: 'Base de dados oficial com todos os produtos de catálogo, histórico completo de RMA e movimentações diárias.',
    isProduction: true,
    badgeColor: 'emerald',
    config: {
      projectId: "gen-lang-client-0295225444",
      appId: "1:390124504284:web:e450040d8f0a2a82a5e019",
      apiKey: "AIzaSyAEoFGB4Vr94R4yvcFbYINhot8FHjuc8bo",
      authDomain: "gen-lang-client-0295225444.firebaseapp.com",
      firestoreDatabaseId: "ai-studio-rmaflowtriagemde-d03b31df-1846-46fc-a8b7-6171aa62d121",
      storageBucket: "gen-lang-client-0295225444.firebasestorage.app",
      messagingSenderId: "390124504284",
      measurementId: ""
    }
  },
  {
    id: 'test',
    name: 'Banco de Testes / Reserva',
    description: 'Base de contingência e testes para homologação rápida ou caso a cota diária da base principal seja atingida.',
    isProduction: false,
    badgeColor: 'amber',
    config: {
      projectId: "stocck-rma-test",
      appId: "1:69816100374:web:5d1d4c86092ff0c536b737",
      apiKey: "AIzaSyBPPNexb7chkBVRTcLd_jbqqvS8BkjGvPk",
      authDomain: "stocck-rma-test.firebaseapp.com",
      firestoreDatabaseId: "(default)",
      storageBucket: "stocck-rma-test.firebasestorage.app",
      messagingSenderId: "69816100374",
      measurementId: "G-DRJR1EMS02"
    }
  }
];

export const getDatabaseProfiles = (): DatabaseProfile[] => {
  try {
    const saved = localStorage.getItem(STORAGE_PROFILES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error reading custom DB profiles from storage:', err);
  }
  return DEFAULT_DATABASE_PROFILES;
};

export const saveDatabaseProfiles = (profiles: DatabaseProfile[]): void => {
  try {
    localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(profiles));
  } catch (err) {
    console.error('Error saving custom DB profiles:', err);
  }
};

export const getActiveDatabaseProfileId = (): string => {
  try {
    const active = localStorage.getItem(STORAGE_ACTIVE_PROFILE_KEY);
    if (active) return active;
  } catch (err) {
    console.error('Error reading active DB profile ID:', err);
  }
  return 'main'; // Default to main production base (gen-lang-client-0295225444)
};

export const getActiveDatabaseProfile = (): DatabaseProfile => {
  const activeId = getActiveDatabaseProfileId();
  const profiles = getDatabaseProfiles();
  const found = profiles.find(p => p.id === activeId);
  return found || profiles[0] || DEFAULT_DATABASE_PROFILES[0];
};

export const setActiveDatabaseProfile = (profileId: string): void => {
  try {
    localStorage.setItem(STORAGE_ACTIVE_PROFILE_KEY, profileId);
    // Dispatch custom event for reactive listeners in the app
    window.dispatchEvent(new CustomEvent('db-profile-changed', { detail: { profileId } }));
  } catch (err) {
    console.error('Error setting active DB profile ID:', err);
  }
};

export const updateDatabaseProfile = (updatedProfile: DatabaseProfile): void => {
  const profiles = getDatabaseProfiles();
  const index = profiles.findIndex(p => p.id === updatedProfile.id);
  if (index >= 0) {
    profiles[index] = updatedProfile;
  } else {
    profiles.push(updatedProfile);
  }
  saveDatabaseProfiles(profiles);
  window.dispatchEvent(new CustomEvent('db-profiles-updated', { detail: { profiles } }));
};

export const resetDatabaseProfilesToDefault = (): void => {
  localStorage.removeItem(STORAGE_PROFILES_KEY);
  saveDatabaseProfiles(DEFAULT_DATABASE_PROFILES);
  window.dispatchEvent(new CustomEvent('db-profiles-updated', { detail: { profiles: DEFAULT_DATABASE_PROFILES } }));
};
