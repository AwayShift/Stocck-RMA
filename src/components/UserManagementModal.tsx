/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  ShieldCheck, 
  ShieldAlert, 
  UserCheck, 
  UserPlus, 
  Trash2, 
  X, 
  Search, 
  KeyRound, 
  Mail, 
  User, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw,
  Info,
  ExternalLink
} from 'lucide-react';
import { UserAccount } from '../types';
import { 
  subscribeToUsers, 
  updateUserRoleInDb, 
  deleteUserDocumentFromDb 
} from '../lib/dbService';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail?: string;
  currentUserRole?: 'admin' | 'operator' | null;
}

export default function UserManagementModal({
  isOpen,
  onClose,
  currentUserEmail,
  currentUserRole
}: UserManagementModalProps) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'admin' | 'operator'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Manual User Registration Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newUid, setNewUid] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'operator'>('operator');
  const [isSubmittingNewUser, setIsSubmittingNewUser] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    const unsubscribe = subscribeToUsers((userList) => {
      setUsers(userList);
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRoleChange = async (user: UserAccount, targetRole: 'admin' | 'operator') => {
    if (user.role === 'admin' && targetRole === 'operator') {
      alert('Acesso negado: Contas com cargo de Administrador não podem ser rebaixadas para Operador.');
      return;
    }

    if (user.email === 'alessandro.away6@gmail.com' && targetRole !== 'admin') {
      alert('A conta do Administrador Primário não pode ser rebaixada.');
      return;
    }

    if (user.email === currentUserEmail && targetRole === 'operator') {
      alert('Você não pode rebaixar seu próprio cargo de Administrador.');
      return;
    }

    try {
      setActionLoadingId(user.uid);
      await updateUserRoleInDb(user.uid, targetRole, user.email);
      setFeedbackMessage({
        type: 'success',
        text: `Cargo do usuário ${user.email} promovido para Administrador com sucesso!`
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err: any) {
      console.error('Error updating user role:', err);
      setFeedbackMessage({
        type: 'error',
        text: `Erro ao alterar cargo: ${err.message || 'Permissão negada'}`
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteUser = async (user: UserAccount) => {
    if (user.email.toLowerCase().trim() === 'alessandro.away6@gmail.com') {
      alert('A conta mestre do Administrador não pode ser excluída.');
      return;
    }

    if (
      (currentUserEmail && user.email.toLowerCase().trim() === currentUserEmail.toLowerCase().trim()) ||
      user.uid === auth.currentUser?.uid
    ) {
      alert('Você não pode excluir sua própria conta enquanto estiver conectado ao sistema.');
      return;
    }

    const confirmed = window.confirm(
      `Atenção: Deseja realmente EXCLUIR permanentemente a conta de "${user.name}" (${user.email}) do Firestore?\n\nEsta ação removerá o perfil e o acesso do usuário no banco de dados.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setActionLoadingId(user.uid);
      await deleteUserDocumentFromDb(user.uid, user.email);
      setUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      setFeedbackMessage({
        type: 'success',
        text: `Conta de "${user.name}" (${user.email}) excluída com sucesso do Firestore!`
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err: any) {
      console.error('Error deleting user from Firestore:', err);
      setFeedbackMessage({
        type: 'error',
        text: `Falha ao excluir usuário: ${err.message || 'Erro de permissão no Firestore'}`
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCreateOrLinkUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newName.trim()) {
      alert('Preencha o Nome e o E-mail.');
      return;
    }

    setIsSubmittingNewUser(true);
    try {
      // Determine document ID (use provided UID or sanitize email)
      const docId = newUid.trim() ? newUid.trim() : `user-${newEmail.trim().replace(/[^a-zA-Z0-9]/g, '_')}`;
      const userRef = doc(db, 'users', docId);

      await setDoc(userRef, {
        uid: docId,
        email: newEmail.trim(),
        name: newName.trim(),
        role: newRole,
        createdAt: new Date().toISOString()
      }, { merge: true });

      setFeedbackMessage({
        type: 'success',
        text: `Perfil de usuário salvo com sucesso no Firestore com cargo de ${newRole === 'admin' ? 'Administrador' : 'Operador'}!`
      });
      setShowAddForm(false);
      setNewEmail('');
      setNewName('');
      setNewUid('');
      setNewRole('operator');
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err: any) {
      console.error('Error creating user profile:', err);
      setFeedbackMessage({
        type: 'error',
        text: `Erro ao criar perfil de usuário: ${err.message || err}`
      });
    } finally {
      setIsSubmittingNewUser(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch = 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.uid.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (roleFilter === 'ALL') return matchesSearch;
    return matchesSearch && u.role === roleFilter;
  });

  const totalAdmins = users.filter(u => u.role === 'admin').length;
  const totalOperators = users.filter(u => u.role === 'operator').length;

  return (
    <div className="fixed inset-0 z-[160] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200" id="user-management-modal">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/90 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                Gestão de Usuários & Controle RBAC
                <span className="text-[10px] uppercase tracking-wider bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2 py-0.5 rounded-full font-bold">
                  Admin
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Gerencie permissões, defina Administradores e sincronize contas cadastradas no Cloud Firestore.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
              id="btn-toggle-add-user"
            >
              <UserPlus className="w-4 h-4" />
              <span>{showAddForm ? 'Fechar Cadastro' : 'Adicionar / Vincular'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Diagnostic Banner */}
        <div className="px-6 py-3 bg-indigo-950/30 border-b border-indigo-900/30 flex items-start gap-3 text-xs text-indigo-200">
          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p>
              <strong>Como funciona a Autenticação e Cargos:</strong> O Firebase Authentication gerencia as senhas de login, enquanto o <strong>Cloud Firestore</strong> (coleção <code className="bg-indigo-900/50 px-1 py-0.5 rounded text-white font-mono">users</code>) armazena o cargo (Administrador ou Operador) e nome do colaborador.
            </p>
            <p className="text-[11px] text-indigo-300/80">
              Quando um usuário se cadastra pelo app ou faz login pela primeira vez, seu perfil é registrado automaticamente no Firestore e você pode promovê-lo a Administrador abaixo.
            </p>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedbackMessage && (
          <div className={`mx-6 mt-4 p-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-semibold animate-in fade-in ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="flex-1">{feedbackMessage.text}</span>
          </div>
        )}

        {/* Optional Add / Link User Form */}
        {showAddForm && (
          <form onSubmit={handleCreateOrLinkUser} className="mx-6 mt-4 p-5 bg-slate-950 border border-sky-500/30 rounded-2xl space-y-4 animate-in slide-in-from-top-3 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <UserPlus className="w-4 h-4 text-sky-400" />
                <span>Cadastrar / Sincronizar Perfil de Usuário no Firestore</span>
              </div>
              <span className="text-[11px] text-slate-400">Insira os dados da conta do colaborador</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos Oliveira"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">E-mail de Login *</label>
                <input
                  type="email"
                  required
                  placeholder="usuario@empresa.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Cargo no Sistema</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'admin' | 'operator')}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl text-xs text-white focus:outline-none"
                >
                  <option value="operator">Logística / Operador</option>
                  <option value="admin">Administrador (Total)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">UID do Firebase (Opcional)</label>
                <input
                  type="text"
                  placeholder="Deixe vazio para auto-gerar"
                  value={newUid}
                  onChange={(e) => setNewUid(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl text-xs text-slate-300 font-mono focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-semibold transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmittingNewUser}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-sky-950/40"
              >
                {isSubmittingNewUser ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                <span>Salvar Perfil no Banco</span>
              </button>
            </div>
          </form>
        )}

        {/* Filter and Stats Bar */}
        <div className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          {/* Search bar */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por nome, e-mail ou UID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-xs text-slate-200 focus:outline-none transition-all placeholder:text-slate-600"
            />
          </div>

          {/* Role filter tabs & counters */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setRoleFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  roleFilter === 'ALL' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Todos ({users.length})
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('admin')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  roleFilter === 'admin' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Admins ({totalAdmins})
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('operator')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  roleFilter === 'operator' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Operadores ({totalOperators})
              </button>
            </div>
          </div>
        </div>

        {/* User Table List */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-sky-500 animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-semibold">Carregando usuários do Firestore...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-slate-800 rounded-2xl space-y-2">
              <Users className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-300 font-semibold">Nenhum usuário localizado.</p>
              <p className="text-xs text-slate-500">
                {searchTerm ? 'Tente refinar os termos da busca.' : 'Clique em "Adicionar / Vincular" para registrar manualmente um usuário.'}
              </p>
            </div>
          ) : (
            <div className="border border-slate-800 rounded-2xl overflow-hidden shadow-sm bg-slate-950/60">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Usuário</th>
                    <th className="py-3 px-4">E-mail Corporativo</th>
                    <th className="py-3 px-4">Privilégio / Cargo</th>
                    <th className="py-3 px-4 hidden md:table-cell">UID do Firebase</th>
                    <th className="py-3 px-4 text-right">Alterar Cargo / Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredUsers.map((user) => {
                    const isCurrentUser = 
                      (currentUserEmail && user.email.toLowerCase().trim() === currentUserEmail.toLowerCase().trim()) ||
                      (auth.currentUser?.uid ? user.uid === auth.currentUser.uid : false);
                    const isMasterAdmin = user.email.toLowerCase().trim() === 'alessandro.away6@gmail.com';
                    const isActionLoading = actionLoadingId === user.uid;

                    return (
                      <tr key={user.uid} className="hover:bg-slate-900/60 transition-colors">
                        {/* Name & Avatar */}
                        <td className="py-3.5 px-4 font-semibold text-white">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                              user.role === 'admin'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            }`}>
                              {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span>{user.name}</span>
                                {isCurrentUser && (
                                  <span className="text-[10px] bg-slate-800 text-sky-400 px-1.5 py-0.5 rounded font-mono font-bold">
                                    Você
                                  </span>
                                )}
                                {isMasterAdmin && (
                                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-bold">
                                    Mestre
                                  </span>
                                )}
                              </div>
                              {user.createdAt && (
                                <span className="text-[10px] text-slate-500 block font-mono">
                                  Cadastrado: {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="py-3.5 px-4 font-mono text-slate-300">
                          {user.email}
                        </td>

                        {/* Current Role Badge */}
                        <td className="py-3.5 px-4">
                          {user.role === 'admin' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 font-bold text-[11px]">
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                              <span>Administrador</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/20 font-bold text-[11px]">
                              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                              <span>Logística (Operador)</span>
                            </span>
                          )}
                        </td>

                        {/* UID */}
                        <td className="py-3.5 px-4 font-mono text-[10px] text-slate-500 hidden md:table-cell truncate max-w-[140px]" title={user.uid}>
                          {user.uid}
                        </td>

                        {/* Actions / Role change selector & Delete Account */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isActionLoading ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                            ) : (
                              <>
                                {user.role === 'admin' ? (
                                  <span 
                                    className="px-2.5 py-1 text-[11px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg inline-flex items-center gap-1"
                                    title="Contas de Administrador possuem acesso total permanente e não podem ser rebaixadas"
                                  >
                                    <ShieldAlert className="w-3 h-3 text-rose-400" />
                                    <span>Admin Permanente</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleRoleChange(user, 'admin')}
                                    className="px-2.5 py-1.5 bg-rose-600/90 hover:bg-rose-600 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                                    title="Promover colaborador para Administrador com acesso total"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5 text-rose-200" />
                                    <span>Promover a Admin</span>
                                  </button>
                                )}

                                {!isMasterAdmin && !isCurrentUser ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(user)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 rounded-xl transition-all cursor-pointer shadow-sm"
                                    title="Excluir permanentemente esta conta do Firestore"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Excluir</span>
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-500 italic px-1 font-mono">
                                    {isMasterAdmin ? 'Mestre' : 'Sua Conta'}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>
            Total de <strong>{users.length}</strong> {users.length === 1 ? 'usuário cadastrado' : 'usuários cadastrados'} no Firestore
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-xl font-bold transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
