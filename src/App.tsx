/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Database, 
  FolderMinus, 
  Package, 
  ShieldAlert, 
  LogOut,
  RefreshCw,
  User,
  Info,
  Boxes,
  Layers,
  FileText,
  Download
} from 'lucide-react';

import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './lib/firebase';

import { BaseProduct, TriageUnit, CaseTracking } from './types';
import { 
  subscribeBaseProducts,
  subscribeTriageUnits,
  subscribeCaseTracking,
  saveBaseProduct,
  deleteBaseProduct,
  saveTriageUnit,
  deleteTriageUnit,
  checkoutTriageUnit,
  saveCaseTracking,
  deleteCaseTracking,
  resetDatabaseToDefaults,
  createAuditLog
} from './lib/dbService';

import Dashboard from './components/Dashboard';
import BaseCatalog from './components/BaseCatalog';
import RmaEntry from './components/RmaEntry';
import PhysicalStock from './components/PhysicalStock';
import LogsAudit from './components/LogsAudit';
import Login from './components/Login';
import ProductMovements from './components/ProductMovements';
import CaseTrackingComponent from './components/CaseTracking';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rma' | 'catalog' | 'stock' | 'logs' | 'movement' | 'cases'>('dashboard');
  
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'operator' | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Database states
  const [products, setProducts] = useState<BaseProduct[]>([]);
  const [triageUnits, setTriageUnits] = useState<TriageUnit[]>([]);
  const [cases, setCases] = useState<CaseTracking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Cross-component communication
  const [selectedTriageUnit, setSelectedTriageUnit] = useState<TriageUnit | null>(null);

  // Listen for Authentication state
  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setIsAuthLoading(true);

      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (currentUser) {
        setUser(currentUser);
        // Listen to custom user profile from Firestore users collection in real-time
        const userDocRef = doc(db, 'users', currentUser.uid);
        unsubscribeUserDoc = onSnapshot(userDocRef, async (userSnap) => {
          if (userSnap.exists()) {
            const userData = userSnap.data();
            let role = userData.role || 'operator';
            
            // Bootstrapped Admin: Include User email from runtime as an admin
            if (currentUser.email === 'alessandro.away6@gmail.com' && userData.role !== 'admin') {
              role = 'admin';
              try {
                await updateDoc(userDocRef, { role: 'admin' });
              } catch (e) {
                console.error('Failed to auto-upgrade to admin:', e);
              }
            }
            
            setUserRole(role);
            setUserName(userData.name || 'Operador Corporativo');
          } else {
            // Document might not exist if created externally or during race-condition of signup
            // We wait 2 seconds for signup flow to write it, else fallback to auto-creating.
            setTimeout(async () => {
              if (auth.currentUser?.uid === currentUser.uid) {
                const freshSnap = await getDoc(userDocRef);
                if (!freshSnap.exists()) {
                  const defaultProfile = {
                    uid: currentUser.uid,
                    email: currentUser.email,
                    name: currentUser.displayName || 'Operador Corporativo',
                    role: currentUser.email === 'alessandro.away6@gmail.com' ? 'admin' : 'operator',
                    createdAt: new Date().toISOString()
                  };
                  try {
                    await setDoc(userDocRef, defaultProfile);
                    setUserRole(defaultProfile.role as 'admin' | 'operator');
                    setUserName(defaultProfile.name);
                  } catch (err) {
                    console.error('Error creating fallback user profile:', err);
                  }
                }
              }
            }, 2000);
          }
          setIsAuthLoading(false);
        }, (err) => {
          console.error('Error in user profile subscription:', err);
          setUserRole(currentUser.email === 'alessandro.away6@gmail.com' ? 'admin' : 'operator'); // safe fallback
          setUserName(currentUser.displayName || 'Operador Corporativo');
          setIsAuthLoading(false);
        });
      } else {
        setUser(null);
        setUserRole(null);
        setUserName('');
        setIsAuthLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
    };
  }, []);

  // Listen for real-time Firestore database collections when authenticated
  useEffect(() => {
    if (!user) return;

    setIsLoading(true);
    setSyncError(null);
    
    // Subscribe to products in real-time
    const unsubscribeProducts = subscribeBaseProducts((fetchedProducts) => {
      setProducts(fetchedProducts);
    }, (err) => {
      console.error('Error syncing products:', err);
      setSyncError(err?.message || String(err));
      setIsLoading(false);
    });

    // Subscribe to triage units in real-time
    const unsubscribeTriage = subscribeTriageUnits((fetchedUnits) => {
      setTriageUnits(fetchedUnits);
    }, (err) => {
      console.error('Error syncing triage units:', err);
      setSyncError(err?.message || String(err));
      setIsLoading(false);
    });

    // Subscribe to case tracking in real-time
    const unsubscribeCases = subscribeCaseTracking((fetchedCases) => {
      setCases(fetchedCases);
      setIsLoading(false);
    }, (err) => {
      console.error('Error syncing case tracking:', err);
      setSyncError(err?.message || String(err));
      setIsLoading(false);
    });

    return () => {
      unsubscribeProducts();
      unsubscribeTriage();
      unsubscribeCases();
    };
  }, [user]);

  // Catálogo de Base actions
  const handleSaveProduct = async (product: BaseProduct) => {
    await saveBaseProduct(product);
  };

  const handleDeleteProduct = async (id: string) => {
    if (userRole !== 'admin') {
      alert('Apenas administradores possuem privilégios para excluir produtos do catálogo.');
      return;
    }
    await deleteBaseProduct(id);
  };

  // Triage actions
  const handleSaveTriage = async (unit: TriageUnit) => {
    await saveTriageUnit(unit);
  };

  const handleDeleteTriage = async (id: string) => {
    if (userRole !== 'admin') {
      alert('Acesso negado: Apenas administradores podem apagar permanentemente registros de triagem.');
      return;
    }
    await deleteTriageUnit(id);
  };

  const handleCheckoutTriage = async (id: string) => {
    await checkoutTriageUnit(id);
  };

  // Case actions
  const handleSaveCase = async (caseData: CaseTracking) => {
    await saveCaseTracking(caseData);
  };

  const handleDeleteCase = async (id: string) => {
    if (userRole !== 'admin') {
      alert('Acesso negado: Apenas administradores podem apagar permanentemente registros de acompanhamento de casos.');
      return;
    }
    await deleteCaseTracking(id);
  };

  // Reset database back to default seed
  const handleResetData = async () => {
    if (userRole !== 'admin') {
      if (window.confirm('Acesso negado: Apenas administradores possuem privilégios para resetar o banco de dados.\n\nDeseja alternar temporariamente o seu cargo de demonstração para Administrador agora para executar o reset?')) {
        await handleToggleDemoRole();
        setTimeout(async () => {
          if (window.confirm('Seu cargo foi atualizado para Administrador com sucesso!\n\nIsso resetará o banco de dados Firestore remoto para os dados iniciais padrão do fluxo. Confirmar?')) {
            try {
              await resetDatabaseToDefaults();
            } catch (err: any) {
              alert(`Erro ao resetar banco de dados: ${err?.message || err}`);
            }
          }
        }, 500);
      }
      return;
    }
    if (window.confirm('Isso resetará o banco de dados Firestore remoto para os dados iniciais padrão do fluxo. Suas alterações customizadas serão sobrescritas pelos dados de teste logísticos. Confirmar?')) {
      try {
        await resetDatabaseToDefaults();
      } catch (err: any) {
        alert(`Erro ao resetar banco de dados: ${err?.message || err}`);
      }
    }
  };

  // Helper to toggle role instantly inside DB for testing/evaluating RBAC constraints
  const handleToggleDemoRole = async () => {
    if (!user) return;
    const newRole = userRole === 'admin' ? 'operator' : 'admin';
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, { role: newRole });
      setUserRole(newRole);
      await createAuditLog('TOGGLE_DEMO_ROLE', `Alterou próprio cargo de demonstração para: ${newRole === 'admin' ? 'Administrador' : 'Operador'}`);
    } catch (err) {
      console.error('Failed to toggle demo role:', err);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Deseja realmente encerrar sua sessão corporativa segura?')) {
      await signOut(auth);
    }
  };

  // Navigate to detailed unit specs from Dashboard
  const handleViewUnitDetails = (unit: TriageUnit) => {
    setSelectedTriageUnit(unit);
    setActiveTab('stock');
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4" id="auth-loading-screen">
        <svg className="animate-spin h-8 w-8 text-sky-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-slate-400 text-sm font-semibold tracking-wider">Verificando credenciais corporativas seguras...</p>
      </div>
    );
  }

  // Render Login screen if not authenticated
  if (!user) {
    return <Login onLoginSuccess={() => setActiveTab('dashboard')} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans" id="app-root">
      
      {/* Top Main Navigation Bar */}
      <header className="bg-slate-900/80 border-b border-slate-800 backdrop-blur-sm sticky top-0 z-40 shadow-lg" id="main-header">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            
            {/* Logo and title (Clickable to access Dashboard) */}
            <button
              onClick={() => { setActiveTab('dashboard'); setSelectedTriageUnit(null); }}
              className="flex items-center gap-3 text-left focus:outline-none cursor-pointer group hover:opacity-90 transition-opacity"
              title="Ir para o Dashboard"
            >
              <div className="p-2.5 bg-sky-500 rounded-xl shadow-lg shadow-sky-500/20 text-white group-hover:scale-105 transition-all duration-200">
                <ShieldAlert className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
                  RMA<span className="text-sky-400 font-bold group-hover:text-sky-300 transition-colors">Flow</span>
                </h1>
                <p className="text-[11px] text-slate-400 tracking-wider uppercase font-extrabold">Web Logística & Segurança</p>
              </div>
            </button>

            {/* Desktop Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1.5">
              
              <button
                onClick={() => { setActiveTab('rma'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  activeTab === 'rma' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
                id="nav-rma"
              >
                <FolderMinus className="w-4.5 h-4.5" />
                Entrada de RMA
              </button>

              <button
                onClick={() => { setActiveTab('catalog'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  activeTab === 'catalog' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
                id="nav-catalog"
              >
                <Database className="w-4.5 h-4.5" />
                Catálogo de Base
              </button>

              <button
                onClick={() => { setActiveTab('stock'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  activeTab === 'stock' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
                id="nav-stock"
              >
                <Package className="w-4.5 h-4.5" />
                Estoque Físico
              </button>

              <button
                onClick={() => { setActiveTab('movement'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  activeTab === 'movement' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
                id="nav-movement"
              >
                <Boxes className="w-4.5 h-4.5" />
                Fluxo de Entradas
              </button>

              <button
                onClick={() => { setActiveTab('cases'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  activeTab === 'cases' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
                id="nav-cases"
              >
                <Layers className="w-4.5 h-4.5" />
                Acompanhamento
              </button>

              <button
                onClick={() => { setActiveTab('logs'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  activeTab === 'logs' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
                id="nav-logs"
              >
                <ShieldAlert className="w-4.5 h-4.5" />
                Auditoria & Logs
              </button>
            </nav>

            {/* Authenticated user profile, PRD download, and toggle helper */}
            <div className="flex items-center gap-3">
              {/* PRD Download for QA & Security Testing */}
              <a
                href="/PRD_RMA_FLOW.md"
                download="PRD_RMA_FLOW.md"
                className="hidden lg:flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-500/50 rounded-lg text-xs font-black text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer shadow-sm"
                title="Baixar o arquivo PRD completo (.MD) para testes de segurança e automação QA"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                Baixar PRD (QA)
              </a>

              {/* Quick RBAC role switcher for testing */}
              <button
                onClick={handleToggleDemoRole}
                className="hidden lg:flex items-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-xs font-black text-slate-400 hover:text-white cursor-pointer transition-all"
                title="Troca instantaneamente o seu cargo de teste corporativo no Firestore para avaliar as regras de segurança"
              >
                <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" style={{ animationDuration: '6s' }} />
                Alternar Cargo (RBAC)
              </button>

              <div className="flex items-center gap-2.5 text-right">
                <div className="hidden sm:block">
                  <span className="text-sm font-bold text-white block leading-tight">{userName}</span>
                  <span className={`text-[10px] font-black uppercase tracking-wider ${userRole === 'admin' ? 'text-rose-400' : 'text-sky-400'}`}>
                    {userRole === 'admin' ? 'Admin' : 'Operador'}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950 border border-slate-850 rounded-xl">
                  <User className="w-5 h-5 text-slate-400" />
                </div>
              </div>

              {/* Secure logout */}
              <button 
                onClick={handleLogout}
                className="p-2.5 bg-slate-950 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-850 hover:border-rose-500/20 transition-all cursor-pointer"
                title="Sair do Sistema"
                id="btn-logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Tabs (Secondary top bar) */}
      <div className="md:hidden bg-slate-900 border-b border-slate-800 overflow-x-auto whitespace-nowrap scrollbar-none py-2 px-4 flex gap-1 shadow-inner items-center" id="mobile-navigation">
        <a
          href="/PRD_RMA_FLOW.md"
          download="PRD_RMA_FLOW.md"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          PRD (QA)
        </a>
        <button
          onClick={() => { setActiveTab('dashboard'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'dashboard' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'text-slate-405'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Dashboard
        </button>
        <button
          onClick={() => { setActiveTab('rma'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'rma' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'text-slate-405'
          }`}
        >
          <FolderMinus className="w-3.5 h-3.5" />
          RMA
        </button>
        <button
          onClick={() => { setActiveTab('catalog'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'catalog' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'text-slate-405'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          Catálogo
        </button>
        <button
          onClick={() => { setActiveTab('stock'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'stock' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'text-slate-405'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          Estoque
        </button>
        <button
          onClick={() => { setActiveTab('movement'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'movement' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'text-slate-405'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          Entradas
        </button>
        <button
          onClick={() => { setActiveTab('cases'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'cases' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'text-slate-405'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Acompanhamento
        </button>
        <button
          onClick={() => { setActiveTab('logs'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'logs' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'text-slate-455'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          Auditoria
        </button>
      </div>

      {/* Mobile Demo Switcher */}
      <div className="md:hidden bg-slate-950 px-4 py-2 flex justify-between items-center border-b border-slate-900 text-xs text-slate-400">
        <span>Cargo de Teste: <strong className="uppercase text-sky-400">{userRole}</strong></span>
        <button
          onClick={handleToggleDemoRole}
          className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-bold"
        >
          Alternar Cargo
        </button>
      </div>

      {/* Main Container Content */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8" id="main-content">
        {syncError ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 max-w-md mx-auto text-center space-y-4 bg-slate-900 border border-rose-500/30 rounded-2xl shadow-xl" id="sync-error-state">
            <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20">
              <ShieldAlert className="w-8 h-8 animate-bounce" />
            </div>
            <h3 className="text-lg font-bold text-white">Falha na Sincronização em Tempo Real</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Ocorreu um erro de permissão ou conexão ao se comunicar com o banco de dados Firestore remoto.
            </p>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[10px] font-mono text-rose-400 max-w-full overflow-x-auto w-full break-all">
              {syncError}
            </div>
            <p className="text-[11px] text-slate-500">
              Isso pode ocorrer se as regras do Firestore não estiverem prontas ou se houver um atraso na propagação das políticas.
            </p>
            <div className="flex gap-2.5 w-full">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-lg text-xs transition-all cursor-pointer"
              >
                Recarregar Página
              </button>
              {userRole === 'admin' && (
                <button
                  onClick={handleResetData}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-350 font-bold rounded-lg text-xs transition-all cursor-pointer"
                >
                  Forçar Reset / Seed
                </button>
              )}
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4" id="app-loading-state">
            <svg className="animate-spin h-8 w-8 text-sky-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-slate-400 text-sm font-semibold tracking-wider font-mono">Carregando sincronização de dados remotos em tempo real...</p>
          </div>
        ) : (
          <div className="animate-in fade-in duration-200">
            {activeTab === 'dashboard' && (
              <Dashboard 
                units={triageUnits}
                onViewUnit={handleViewUnitDetails}
                onNavigateToStock={() => setActiveTab('stock')}
                onResetData={handleResetData}
              />
            )}

            {activeTab === 'catalog' && (
              <BaseCatalog 
                products={products}
                onSaveProduct={handleSaveProduct}
                onDeleteProduct={handleDeleteProduct}
              />
            )}

            {activeTab === 'rma' && (
              <RmaEntry 
                products={products}
                onSaveTriage={handleSaveTriage}
                onNavigateToStock={() => setActiveTab('stock')}
              />
            )}

            {activeTab === 'stock' && (
              <PhysicalStock 
                units={triageUnits}
                onUpdateUnit={handleSaveTriage}
                onDeleteUnit={handleDeleteTriage}
                onCheckoutUnit={handleCheckoutTriage}
                initialSelectedUnit={selectedTriageUnit}
                onClearSelectedUnit={() => setSelectedTriageUnit(null)}
              />
            )}

            {activeTab === 'logs' && (
              <LogsAudit userRole={userRole} />
            )}

            {activeTab === 'movement' && (
              <ProductMovements 
                products={products}
                units={triageUnits}
                onSaveTriage={handleSaveTriage}
                userRole={userRole}
              />
            )}

            {activeTab === 'cases' && (
              <CaseTrackingComponent 
                cases={cases}
                onSaveCase={handleSaveCase}
                onDeleteCase={handleDeleteCase}
                userRole={userRole}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer copyright */}
      <footer className="bg-slate-900/50 border-t border-slate-800 py-6 mt-16 text-center text-sm text-slate-400" id="main-footer">
        <div className="max-w-[1600px] mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-3">
          <span>RMA Flow v2.0.0 (Web) • Sistema de Triagem Logística & Rastreabilidade</span>
          <div className="flex gap-4">
            <span className="flex items-center gap-1 font-semibold text-emerald-400">
              <Info className="w-3.5 h-3.5" />
              Sincronizado com Firebase Cloud DB (Firestore)
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
