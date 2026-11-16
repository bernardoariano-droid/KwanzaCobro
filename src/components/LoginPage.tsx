import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  KeyRound,
  ArrowLeft,
  Database,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';
import { AuthUser, CompanySettings } from '../types/debt';
import {
  signInWithSupabaseAuth,
  sendPasswordResetEmail,
  updateAuthenticatedPassword,
  testSupabaseConnection,
  fetchSupabaseSchemaSql,
  SupabaseHealthResult,
} from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { LanguageSelector } from './LanguageSelector';
import { TempSuperAdminPasswordModal } from './TempSuperAdminPasswordModal';

interface LoginPageProps {
  company: CompanySettings;
  onLoginSuccess: (user: AuthUser, matchedCompany?: CompanySettings) => void;
  initialMode?: 'login' | 'forgot' | 'reset';
  externalError?: string | null;
  onPasswordResetDone?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  company,
  onLoginSuccess,
  initialMode = 'login',
  externalError = null,
  onPasswordResetDone,
}) => {
  const { t } = useLanguage();
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(externalError);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTempResetOpen, setIsTempResetOpen] = useState(false);
  const [supabaseHealth, setSupabaseHealth] = useState<SupabaseHealthResult | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [schemaSql, setSchemaSql] = useState('');
  const [isCopiedSql, setIsCopiedSql] = useState(false);

  const checkSupabaseSchemaHealth = async () => {
    setIsCheckingHealth(true);
    try {
      const health = await testSupabaseConnection();
      setSupabaseHealth(health);
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleOpenSqlModal = async () => {
    setShowSqlModal(true);
    const sql = await fetchSupabaseSchemaSql();
    if (sql) {
      setSchemaSql(sql);
    }
  };

  const handleCopySql = () => {
    if (!schemaSql) return;
    navigator.clipboard.writeText(schemaSql);
    setIsCopiedSql(true);
    setTimeout(() => setIsCopiedSql(false), 2500);
  };

  useEffect(() => {
    checkSupabaseSchemaHealth();
  }, []);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (externalError) setError(externalError);
  }, [externalError]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      const result = await signInWithSupabaseAuth(email, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onLoginSuccess(result.user, result.company);
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao autenticar.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      const result = await sendPasswordResetEmail(email);
      if (!result.ok) {
        setError(result.error || 'Não foi possível enviar o e-mail de recuperação.');
        return;
      }
      setSuccessMsg(
        'E-mail de recuperação enviado! Verifique a sua caixa de entrada e siga a ligação segura para redefinir a palavra-passe.'
      );
    } catch (err: any) {
      setError(err?.message || 'Erro ao solicitar recuperação.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (password.length < 6) {
      setError('A nova palavra-passe deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As palavras-passe não coincidem.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await updateAuthenticatedPassword(password);
      if (!result.ok) {
        setError(result.error || 'Erro ao atualizar palavra-passe.');
        return;
      }
      setSuccessMsg('Palavra-passe redefinida com sucesso! A concluir o acesso...');
      setPassword('');
      setConfirmPassword('');
      if (onPasswordResetDone) {
        setTimeout(() => onPasswordResetDone(), 800);
      } else {
        setMode('login');
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao redefinir palavra-passe.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-950 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-900 selection:bg-emerald-600 selection:text-white">
      {/* Background Decor Elements */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      <div className="relative w-full max-w-md md:max-w-2xl mx-auto transition-all">
        {/* Seletor de Idiomas no Topo da Página de Login */}
        <div className="flex items-center justify-between mb-4 px-1">
          <span className="text-xs font-semibold text-emerald-300">
            KwanzaCobro · Gestão de Dívidas
          </span>
          <LanguageSelector />
        </div>

        {/* Brand Card - Modern Green and White */}
        <div className="bg-white rounded-3xl shadow-2xl border border-emerald-500/20 overflow-hidden">
          {/* Header com Logomarca Oficial em Verde e Branco */}
          <div className="p-6 sm:p-8 bg-gradient-to-b from-emerald-50/80 to-white border-b border-emerald-100 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white font-mono font-black text-2xl shadow-md shadow-emerald-700/20 mb-3 overflow-hidden p-1.5 bg-white border border-emerald-200">
              <img
                src={company?.logoUrl || '/assets/aistudio/IMG-20261010-WA0062_2b38905c.jpg'}
                alt="KwanzaCobro"
                className="w-full h-full object-contain"
              />
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              Kwanza<span className="text-emerald-700">Cobro</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-semibold uppercase tracking-wider mt-1">
              {t('app.slogan', 'Gestão e Controlo de Dívidas Empresariais')}
            </p>
            <p className="text-[11px] sm:text-xs text-emerald-800 font-medium mt-1">
              {mode === 'forgot'
                ? 'Recuperação de Palavra-Passe Segura'
                : mode === 'reset'
                ? 'Definir Nova Palavra-Passe de Acesso'
                : 'Recuperação de Crédito, Comprovativos Oficiais e Avisos de Vencimento'}
            </p>
          </div>

          {/* Aviso de Inicialização / Atualização das Tabelas no Supabase */}
          {supabaseHealth && supabaseHealth.connected && (supabaseHealth.tableExists === false || supabaseHealth.schemaUpdateRequired) && (
            <div className="mx-6 sm:mx-8 mt-5 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <Database className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">
                    {supabaseHealth.schemaUpdateRequired
                      ? 'Atualização de coluna necessária no Supabase'
                      : 'Base de dados Supabase por inicializar'}
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                    {supabaseHealth.schemaUpdateRequired
                      ? `${supabaseHealth.message} Clique abaixo para copiar o script atualizado (seguro, não apaga dados).`
                      : `O projeto Supabase (${supabaseHealth.projectId}) está online, mas as tabelas (company_settings, utilizadores) ainda não foram criadas. Execute supabase-schema.sql no SQL Editor do Supabase antes de registar empresas.`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-6">
                <button
                  type="button"
                  onClick={handleOpenSqlModal}
                  className="px-3 py-1.5 text-[11px] font-bold bg-amber-700 hover:bg-amber-800 text-white rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Ver / Copiar SQL (supabase-schema.sql)</span>
                </button>
                <button
                  type="button"
                  onClick={checkSupabaseSchemaHealth}
                  disabled={isCheckingHealth}
                  className="px-3 py-1.5 text-[11px] font-bold bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingHealth ? 'animate-spin' : ''}`} />
                  <span>{isCheckingHealth ? 'A verificar...' : 'Verificar Novamente'}</span>
                </button>
              </div>
            </div>
          )}

          {/* MODO 1: LOGIN PRINCIPAL */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="p-6 sm:p-8 space-y-5">
              {error && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start justify-between gap-2.5 text-xs text-rose-800">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                  {(error.toLowerCase().includes('supabase-schema.sql') || error.toLowerCase().includes('sql editor')) && (
                    <button
                      type="button"
                      onClick={handleOpenSqlModal}
                      className="shrink-0 px-2.5 py-1 text-[11px] font-bold bg-rose-700 hover:bg-rose-800 text-white rounded-lg cursor-pointer"
                    >
                      Ver SQL
                    </button>
                  )}
                </div>
              )}

              {successMsg && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Caixas de E-mail e Senha */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {t('login.ident_label', 'E-mail Corporativo')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="utilizador@empresa.ao"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {t('login.pass_label', 'Palavra-passe')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer min-h-[44px]"
                      title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMsg(null);
                    setMode('forgot');
                  }}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                >
                  Esqueceu a palavra-passe?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-6 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-98 rounded-xl shadow-md shadow-emerald-700/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 min-h-[48px]"
              >
                <span>
                  {isLoading
                    ? t('login.authenticating', 'A autenticar...')
                    : t('login.submit', 'Entrar no Sistema')}
                </span>
                <ArrowRight className="w-4 h-4 text-emerald-200" />
              </button>
            </form>
          )}

          {/* MODO 2: RECUPERAÇÃO DE PALAVRA-PASSE */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="p-6 sm:p-8 space-y-5">
              {error && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  E-mail da conta registada
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    placeholder="utilizador@empresa.ao"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMsg(null);
                    setMode('login');
                  }}
                  className="py-3 px-4 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar ao Login</span>
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-3 px-6 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-700/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 min-h-[48px]"
                >
                  <KeyRound className="w-4 h-4 text-emerald-200" />
                  <span>{isLoading ? 'A enviar ligação...' : 'Enviar Ligação de Recuperação'}</span>
                </button>
              </div>
            </form>
          )}

          {/* MODO 3: REDEFINIÇÃO DE PALAVRA-PASSE (APÓS LINK DE RECOVERY) */}
          {mode === 'reset' && (
            <form onSubmit={handleResetSubmit} className="p-6 sm:p-8 space-y-5">
              {error && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Nova Palavra-passe
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="Números ou texto (mín. 6 caracteres)"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer min-h-[44px]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Confirmar Palavra-passe
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="Repita a palavra-passe"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-6 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-700/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 min-h-[48px]"
              >
                <KeyRound className="w-4 h-4 text-emerald-200" />
                <span>{isLoading ? 'A guardar...' : 'Guardar Nova Palavra-passe'}</span>
              </button>
            </form>
          )}

          {/* Security & System Info Footer */}
          <div className="px-6 sm:px-8 py-4 border-t border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Supabase Auth · Controlo de Perfis & Isolamento Multiempresa</span>
            </div>
            <button
              type="button"
              onClick={() => setIsTempResetOpen(true)}
              className="font-semibold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
            >
              Definir Senha · Super Admin
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 text-center text-xs text-emerald-300/80">
          <p>© 2026 KwanzaCobro · Angola · Controlo de Dívidas e Crédito Comercial</p>
        </div>
      </div>

      <TempSuperAdminPasswordModal
        isOpen={isTempResetOpen}
        onClose={() => setIsTempResetOpen(false)}
        isSuperAdminAuthenticated={false}
      />

      {showSqlModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-emerald-100 shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 sm:p-6 bg-gradient-to-r from-emerald-900 to-slate-900 text-white flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <Database className="w-5 h-5 text-emerald-300" />
                  <span>Inicializar Base de Dados no Supabase (supabase-schema.sql)</span>
                </h2>
                <p className="text-xs text-emerald-200 mt-0.5">
                  1. Copie este script SQL · 2. Cole no SQL Editor do Supabase e clique em Run · 3. Clique em Verificar Novamente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="p-2 text-emerald-200 hover:text-white rounded-xl hover:bg-white/10 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-600">
                  Projeto Supabase: <strong className="font-mono text-slate-900">{supabaseHealth?.projectId || 'ckcwpcnsfennfjmjwoqp'}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleCopySql}
                  disabled={!schemaSql}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isCopiedSql ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{isCopiedSql ? 'SQL Copiado!' : 'Copiar Script SQL Completo'}</span>
                </button>
              </div>

              <pre className="p-4 bg-slate-900 text-emerald-300 rounded-2xl text-[11px] font-mono overflow-x-auto leading-relaxed border border-slate-800 max-h-[50vh]">
                {schemaSql || 'A carregar script supabase-schema.sql...'}
              </pre>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={async () => {
                  await checkSupabaseSchemaHealth();
                  setShowSqlModal(false);
                }}
                className="px-4 py-2 text-xs font-bold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingHealth ? 'animate-spin' : ''}`} />
                <span>Já executei no Supabase · Verificar Novamente</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
