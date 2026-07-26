/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { 
  Layers, 
  Lock, 
  Mail, 
  User, 
  ShieldCheck, 
  AlertCircle, 
  ArrowRight,
  Eye,
  EyeOff
} from 'lucide-react';

interface LoginProps {
  onLoginSuccess: () => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'operator'>('operator');
  
  // Visual states
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('A senha deve conter pelo menos 6 caracteres.');
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        if (!name.trim()) {
          setErrorMessage('Por favor, insira o seu nome.');
          setIsLoading(false);
          return;
        }

        // Register new user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const user = userCredential.user;

        // Save custom metadata (Name & Role) in firestore 'users' collection
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          name: name.trim(),
          role: role,
          createdAt: new Date().toISOString()
        });

        setSuccessMessage('Sua conta foi criada com sucesso! Redirecionando...');
        setTimeout(() => {
          onLoginSuccess();
        }, 1500);

      } else {
        // Sign In existing user
        await signInWithEmailAndPassword(auth, email.trim(), password);
        onLoginSuccess();
      }
    } catch (err: any) {
      console.error('Authentication Error:', err);
      let translateError = 'Falha ao autenticar. Verifique suas credenciais.';
      if (err.code === 'auth/email-already-in-use') {
        translateError = 'Este endereço de e-mail já está sendo utilizado.';
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        translateError = 'Usuário ou senha incorretos.';
      } else if (err.code === 'auth/invalid-email') {
        translateError = 'E-mail inválido.';
      }
      setErrorMessage(translateError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans" id="login-container">
      {/* Decorative ambient background flares */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl -z-10 animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl -z-10 animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10 flex flex-col" id="login-card">
        {/* Branding header */}
        <div className="text-center space-y-3 mb-8">
          <div className="mx-auto w-12 h-12 bg-sky-500/10 text-sky-400 rounded-2xl flex items-center justify-center border border-sky-500/20 shadow-lg shadow-sky-500/5">
            <Layers className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-1.5">
              RMA<span className="text-sky-400 font-bold">Flow</span>
            </h1>
            <p className="text-xs text-slate-400">Portal Logístico de Devoluções & Triagem</p>
          </div>
        </div>

        {/* Dynamic header depending on signup mode */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-white">
            {isSignUp ? 'Criar Nova Conta' : 'Acesse o Sistema'}
          </h2>
          <p className="text-xs text-slate-450 mt-1">
            {isSignUp ? 'Cadastre seu usuário corporativo para triagem' : 'Insira suas credenciais blindadas de acesso'}
          </p>
        </div>

        {/* Error and Success states */}
        {errorMessage && (
          <div className="flex items-start gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-semibold mb-5">
            <AlertCircle className="w-4.5 h-4.5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2.5 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-semibold mb-5">
            <ShieldCheck className="w-4.5 h-4.5 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Main form */}
        <form onSubmit={handleSubmit} className="space-y-4" id="login-form">
          {/* Name Field (Sign Up only) */}
          {isSignUp && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-450">Nome Completo</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-500" />
                <input 
                  type="text"
                  placeholder="Seu nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  id="input-login-name"
                />
              </div>
            </div>
          )}

          {/* Email Field */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-450">E-mail Corporativo</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-500" />
              <input 
                type="email"
                placeholder="nome@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-sans"
                id="input-login-email"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-450">Senha Blindada</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-500" />
              <input 
                type={showPassword ? "text" : "password"}
                placeholder="Sua senha secreta"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-11 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-sans"
                id="input-login-password"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-slate-550 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
              </button>
            </div>
          </div>

          {/* Role Selection (Sign Up only) */}
          {isSignUp && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-450">Cargo de Acesso (RBAC)</label>
              <div className="grid grid-cols-2 gap-2" id="rbac-role-selector">
                <button
                  type="button"
                  onClick={() => setRole('operator')}
                  className={`py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    role === 'operator' 
                    ? 'bg-sky-500/10 text-sky-400 border-sky-500/30' 
                    : 'bg-slate-950 text-slate-450 border-slate-800 hover:text-white hover:border-slate-700'
                  }`}
                >
                  Operador (Triagem)
                </button>
                <button
                  type="button"
                  onClick={() => setRole('admin')}
                  className={`py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    role === 'admin' 
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' 
                    : 'bg-slate-950 text-slate-450 border-slate-800 hover:text-white hover:border-slate-700'
                  }`}
                >
                  Administrador
                </button>
              </div>
              <p className="text-[10px] text-slate-500 leading-normal">
                {role === 'admin' 
                  ? 'Controle total: pode excluir registros, auditar todos os logs e gerenciar produtos.' 
                  : 'Nível Operacional: pode preencher relatórios de triagem e gerenciar produtos.'
                }
              </p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 mt-2 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 flex items-center justify-center gap-2 cursor-pointer"
            id="btn-login-submit"
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <>
                {isSignUp ? 'Criar Conta e Entrar' : 'Entrar com Segurança'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Toggle Sign Up / Sign In link */}
        <div className="text-center mt-6">
          <button 
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMessage('');
              setSuccessMessage('');
            }}
            className="text-xs text-slate-450 hover:text-sky-450 font-semibold underline cursor-pointer"
            id="btn-toggle-signup"
          >
            {isSignUp ? 'Já tem conta? Faça o Login' : 'Não tem conta? Cadastre-se com Cargo'}
          </button>
        </div>
      </div>
    </div>
  );
}
