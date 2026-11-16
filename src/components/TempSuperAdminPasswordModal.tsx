import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  X,
  Server,
  Mail,
} from 'lucide-react';
import {
  getSupabaseAccessToken,
  sendPasswordResetEmail,
  supabase,
  updateAuthenticatedPassword,
} from '../lib/supabase';
import { PRESERVED_SUPER_ADMIN_EMAIL, PRESERVED_SUPER_ADMIN_UUID } from '../data/initialData';

interface TempSuperAdminPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSuperAdminAuthenticated: boolean;
}

interface EndpointStatus {
  enabled: boolean;
  hasSupabaseUrl: boolean;
  hasServiceRoleKey: boolean;
  hasResetToken: boolean;
}

function getPasswordStrength(password: string): { label: string; color: string; width: string } {
  if (!password) return { label: '', color: 'bg-slate-200', width: 'w-0' };
  if (password.trim().length < 6) {
    return { label: 'Mínimo de 6 caracteres (números ou texto)', color: 'bg-rose-500', width: 'w-1/3' };
  }
  let score = 1;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score >= 4) return { label: 'Forte e Definitiva', color: 'bg-emerald-600', width: 'w-full' };
  return { label: 'Válida (números ou texto aceites)', color: 'bg-emerald-500', width: 'w-2/3' };
}

export const TempSuperAdminPasswordModal: React.FC<TempSuperAdminPasswordModalProps> = ({
  isOpen,
  onClose,
  isSuperAdminAuthenticated,
}) => {
  const [setupToken, setSetupToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [activeAuthEmail, setActiveAuthEmail] = useState<string>(PRESERVED_SUPER_ADMIN_EMAIL);
  const [activeAuthUuid, setActiveAuthUuid] = useState<string>(PRESERVED_SUPER_ADMIN_UUID);
  const [statusInfo, setStatusInfo] = useState<EndpointStatus | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    confirmedEmail?: string;
    confirmedUuid?: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFeedback(null);
    setNewPassword('');
    setConfirmPassword('');
    setSetupToken('');

    let active = true;

    if (isSuperAdminAuthenticated) {
      supabase.auth
        .getUser()
        .then(({ data }) => {
          if (!active || !data?.user) return;
          if (data.user.email) setActiveAuthEmail(data.user.email);
          if (data.user.id) setActiveAuthUuid(data.user.id);
        })
        .catch(() => {});
    } else {
      setActiveAuthEmail(PRESERVED_SUPER_ADMIN_EMAIL);
      setActiveAuthUuid(PRESERVED_SUPER_ADMIN_UUID);
    }

    fetch('/api/admin/reset-super-admin-password', { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (res.status === 410 || json?.disabled) {
          setStatusInfo({
            enabled: false,
            hasSupabaseUrl: false,
            hasServiceRoleKey: false,
            hasResetToken: false,
          });
          if (!isSuperAdminAuthenticated) {
            setFeedback({
              type: 'error',
              message: json?.error || 'Esta função administrativa foi desativada no servidor.',
            });
          }
          return;
        }
        if (json?.success) {
          setStatusInfo({
            enabled: Boolean(json.enabled),
            hasSupabaseUrl: Boolean(json.hasSupabaseUrl),
            hasServiceRoleKey: Boolean(json.hasServiceRoleKey),
            hasResetToken: Boolean(json.hasResetToken),
          });
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [isOpen, isSuperAdminAuthenticated]);

  if (!isOpen) return null;

  const canUseServerTokenReset = Boolean(
    statusInfo?.enabled !== false && statusInfo?.hasServiceRoleKey && statusInfo?.hasResetToken
  );

  const handleSendRecoveryLink = async () => {
    setFeedback(null);
    setIsSendingResetEmail(true);
    try {
      const result = await sendPasswordResetEmail(PRESERVED_SUPER_ADMIN_EMAIL);
      if (!result.ok) {
        setFeedback({
          type: 'error',
          message: result.error || 'Não foi possível enviar o e-mail de definição de senha.',
        });
        return;
      }
      setFeedback({
        type: 'success',
        message: `Ligação segura enviada para ${PRESERVED_SUPER_ADMIN_EMAIL}! Abra o e-mail e clique no link para definir a sua palavra-passe definitiva no Supabase Auth.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Erro ao solicitar ligação de redefinição por e-mail.',
      });
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (newPassword.trim().length < 6) {
      setFeedback({ type: 'error', message: 'A palavra-passe definitiva deve ter pelo menos 6 caracteres.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({ type: 'error', message: 'As palavras-passe não coincidem.' });
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Quando o Super Administrador já tem sessão iniciada no Supabase Auth,
      //    atualiza diretamente e definitivamente a sua própria palavra-passe via supabase.auth.updateUser
      //    (não depende de SUPABASE_SERVICE_ROLE_KEY).
      if (isSuperAdminAuthenticated) {
        const { data: userData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
        const loggedUser = userData?.user;
        const isUpdatingOwnAccount =
          !statusInfo?.hasServiceRoleKey ||
          !loggedUser ||
          loggedUser.id === PRESERVED_SUPER_ADMIN_UUID ||
          String(loggedUser.email || '').trim().toLowerCase() === PRESERVED_SUPER_ADMIN_EMAIL.toLowerCase();

        if (isUpdatingOwnAccount) {
          const directRes = await updateAuthenticatedPassword(newPassword);
          setNewPassword('');
          setConfirmPassword('');
          setSetupToken('');

          if (!directRes.ok) {
            setFeedback({
              type: 'error',
              message: directRes.error || 'Não foi possível gravar a nova palavra-passe no Supabase Auth.',
            });
            return;
          }

          setFeedback({
            type: 'success',
            message: 'Palavra-passe definitiva gravada e confirmada no Supabase Auth! Já pode utilizar esta nova senha em todos os próximos logins.',
            confirmedEmail: directRes.email || activeAuthEmail,
            confirmedUuid: directRes.uuid || activeAuthUuid,
          });
          return;
        }
      }

      // 2. Fallback administrativo via backend com SERVICE_ROLE_KEY / Token
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (isSuperAdminAuthenticated) {
        const jwt = await getSupabaseAccessToken();
        if (jwt) {
          headers.Authorization = `Bearer ${jwt}`;
        }
      }

      if (!headers.Authorization && setupToken.trim()) {
        headers['x-reset-token'] = setupToken.trim();
      }

      const res = await fetch('/api/admin/reset-super-admin-password', {
        method: 'POST',
        headers,
        body: JSON.stringify({ newPassword }),
      });

      const json = await res.json().catch(() => null);

      setNewPassword('');
      setConfirmPassword('');
      setSetupToken('');

      if (!res.ok || !json?.success || !json?.confirmedBySupabase) {
        setFeedback({
          type: 'error',
          message: json?.error || `Erro ao atualizar palavra-passe (HTTP ${res.status}).`,
        });
        return;
      }

      setFeedback({
        type: 'success',
        message: json.message || 'Palavra-passe definitiva atualizada e confirmada no Supabase Auth.',
        confirmedEmail: json.email,
        confirmedUuid: json.uuid,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Erro de comunicação com o servidor.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const strength = getPasswordStrength(newPassword);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-emerald-200 shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-5 sm:p-6 bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 text-white flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <span
                className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full mb-1 border ${
                  isSuperAdminAuthenticated
                    ? 'bg-emerald-400/20 text-emerald-200 border-emerald-300/30'
                    : 'bg-amber-400/20 text-amber-200 border-amber-300/30'
                }`}
              >
                {isSuperAdminAuthenticated
                  ? 'Sessão Autenticada · Senha Definitiva'
                  : 'Recuperação / Definição de Senha'}
              </span>
              <h2 className="text-base sm:text-lg font-bold leading-tight">
                Definir Palavra-passe Definitiva do Super Administrador
              </h2>
              <p className="text-xs text-emerald-100/90 mt-0.5">
                {isSuperAdminAuthenticated
                  ? 'Atualização direta e permanente no Supabase Auth (encriptada em bcrypt), sem alterar perfil nem RLS.'
                  : 'Defina uma palavra-passe definitiva para a conta Super Admin preservada no Supabase Auth.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-emerald-200 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {/* Dados preservados da conta alvo */}
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600 font-medium">Conta Alvo:</span>
              <span className="font-bold text-slate-900 font-mono">{activeAuthEmail}</span>
            </div>
            {isSuperAdminAuthenticated && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-600 font-medium">UUID da Conta:</span>
                <span className="font-mono text-[11px] text-emerald-900 font-semibold">
                  {activeAuthUuid}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600 font-medium">Perfil Preservado:</span>
              <span className="font-mono font-bold text-emerald-800">super_admin</span>
            </div>
          </div>

          {/* Modo sem sessão e sem SERVICE_ROLE_KEY -> Redefinição oficial via E-mail */}
          {!isSuperAdminAuthenticated && statusInfo && !canUseServerTokenReset && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs space-y-3">
              <div className="flex items-start gap-2.5 text-emerald-950">
                <Mail className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold">Definição Segura via E-mail Oficial (Supabase Auth)</div>
                  <p className="text-emerald-800 leading-relaxed">
                    Clique abaixo para enviar um link seguro para <strong>{PRESERVED_SUPER_ADMIN_EMAIL}</strong>. Ao abrir o link no seu e-mail, será exibido o formulário para gravar a sua palavra-passe definitiva.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSendRecoveryLink}
                disabled={isSendingResetEmail}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Mail className="w-4 h-4" />
                <span>
                  {isSendingResetEmail
                    ? 'A enviar e-mail de definição...'
                    : `Enviar Link de Senha Definitiva para ${PRESERVED_SUPER_ADMIN_EMAIL}`}
                </span>
              </button>
            </div>
          )}

          {/* Diagnóstico do servidor apenas quando está fora da sessão e há configuração de servidor */}
          {!isSuperAdminAuthenticated && statusInfo && canUseServerTokenReset && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-700 flex items-start gap-2">
              <Server className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold text-slate-900">Servidor Administrativo Ativo</div>
                <div>
                  <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>:{' '}
                  <strong className="text-emerald-700">Configurada</strong> ·{' '}
                  <code className="font-mono">SUPER_ADMIN_RESET_TOKEN</code>:{' '}
                  <strong className="text-emerald-700">Configurado</strong>
                </div>
              </div>
            </div>
          )}

          {feedback && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="font-semibold">{feedback.message}</p>
                {feedback.confirmedEmail && (
                  <p className="text-[11px] text-emerald-800">
                    Confirmado no Supabase Auth: <strong>{feedback.confirmedEmail}</strong> · UUID:{' '}
                    <code className="font-mono">{feedback.confirmedUuid}</code>
                  </p>
                )}
              </div>
            </div>
          )}

          {(isSuperAdminAuthenticated || canUseServerTokenReset) && (
            <>
              {!isSuperAdminAuthenticated && canUseServerTokenReset && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Token de Autorização do Servidor (SUPER_ADMIN_RESET_TOKEN) *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input
                      type={showToken ? 'text' : 'password'}
                      required
                      autoComplete="off"
                      placeholder="Introduza o token configurado no servidor"
                      value={setupToken}
                      onChange={(e) => setSetupToken(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nova Palavra-passe Definitiva *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Números ou texto (mínimo 6 caracteres)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {newPassword && (
                  <div className="mt-1.5 space-y-1">
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full transition-all ${strength.color} ${strength.width}`} />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Segurança: <strong className="text-slate-700">{strength.label}</strong>
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Confirmar Nova Palavra-passe Definitiva *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Repita a nova palavra-passe definitiva"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>
              </div>
            </>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Fechar
            </button>
            {(isSuperAdminAuthenticated || canUseServerTokenReset) && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? 'A gravar no Supabase Auth...' : 'Guardar Senha Definitiva'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
