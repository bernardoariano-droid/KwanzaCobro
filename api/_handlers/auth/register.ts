import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import {
  extractBearerToken,
  getAdminSupabase,
  getAnonSupabase,
  mapUtilizadorRow,
  PRESERVED_SUPER_ADMIN_EMAIL,
  PRESERVED_SUPER_ADMIN_UUID,
} from '../../_supabase.js';

/**
 * POST /api/auth/register
 * Completa ou cria o onboarding empresarial de um novo utilizador no Supabase Auth +
 * company_settings + public.utilizadores + public.sellers.
 * REGRA DE SEGURANÇA:
 *   - Nunca permite auto-registo como super_admin.
 *   - Nunca armazena palavra-passe em texto simples em tabelas públicas.
 *   - Contas criadas por auto-registo iniciam como admin_geral da sua nova empresa isolada.
 */
function isMissingSchemaError(err: any): boolean {
  const code = String(err?.code || '').toUpperCase();
  const msg = String(err?.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    code === '42P01' ||
    code === '42883' ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist')
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Utilize POST.' });
  }

  try {
    const {
      name,
      email,
      password,
      phone,
      companyName,
      nif,
      branch,
    } = req.body || {};

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(name || '').trim();
    const cleanPhone = String(phone || '').trim();
    const cleanCompanyName = String(companyName || '').trim();
    const cleanNif = String(nif || '').trim();
    const cleanBranch = String(branch || 'Sede').trim();
    const cleanPassword = String(password || '').trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'Introduza um endereço de e-mail válido.' });
    }
    if (cleanEmail === PRESERVED_SUPER_ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: 'Este e-mail pertence ao Super Administrador principal e não pode ser registado por esta via.',
      });
    }
    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Informe o seu nome completo.' });
    }
    if (!cleanCompanyName) {
      return res.status(400).json({ success: false, error: 'Informe o nome da empresa.' });
    }

    const token = extractBearerToken(req);
    const hasServiceRole = Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim());

    let targetUserId = '';
    let authUserObj: any = null;

    if (token) {
      // Caso A: O frontend já efetuou supabase.auth.signUp() e enviou o JWT da sessão criada
      const anonClient = getAnonSupabase();
      const { data: userRes, error: userErr } = await anonClient.auth.getUser(token);
      if (userErr || !userRes?.user) {
        const rawErr = String(userErr?.message || '');
        const lower = rawErr.toLowerCase();
        const detail =
          lower.includes('session') || lower.includes('expired')
            ? 'A sessão de registo expirou ou foi encerrada antes de concluir. Se a sua conta já foi criada, tente entrar em "Iniciar Sessão" com o mesmo e-mail e palavra-passe.'
            : `Token de registo inválido ou expirado (${rawErr || 'verificação JWT falhou'}). Tente novamente.`;
        return res.status(401).json({ success: false, error: detail });
      }
      targetUserId = userRes.user.id;
      authUserObj = userRes.user;
    } else if (hasServiceRole) {
      // Caso B: Criação administrativa direta no backend (quando email_confirm automático é desejado no servidor)
      if (cleanPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'A palavra-passe deve ter pelo menos 6 caracteres.' });
      }
      const adminSupabase = getAdminSupabase();
      const { data: created, error: createErr } = await adminSupabase.auth.admin.createUser({
        email: cleanEmail,
        password: cleanPassword,
        email_confirm: true,
        user_metadata: {
          name: cleanName,
          phone: cleanPhone,
          company_name: cleanCompanyName,
          nif: cleanNif,
          branch: cleanBranch,
          role: 'admin_geral',
          self_register: true,
        },
      });
      if (createErr || !created?.user) {
        const rawMsg = String(createErr?.message || '');
        const lower = rawMsg.toLowerCase();
        if (lower.includes('email_address_invalid') || (lower.includes('email address') && lower.includes('invalid'))) {
          return res.status(400).json({
            success: false,
            error:
              'O endereço de e-mail não foi aceite pelo Supabase Auth. Utilize um e-mail real com domínio válido (ex: @gmail.com, @outlook.com) sem espaços ou acentos.',
          });
        }
        return res.status(400).json({
          success: false,
          error: rawMsg || 'Não foi possível criar a conta no Supabase Auth.',
        });
      }
      targetUserId = created.user.id;
      authUserObj = created.user;
    } else {
      return res.status(400).json({
        success: false,
        code: 'SERVICE_ROLE_UNAVAILABLE',
        error: 'Sessão de registo não fornecida e SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.',
      });
    }

    if (targetUserId === PRESERVED_SUPER_ADMIN_UUID) {
      return res.status(403).json({ success: false, error: 'Operação não permitida para este UUID.' });
    }

    if (!hasServiceRole) {
      // Sem service_role no servidor:
      // 1. Verificar se o perfil já foi criado pelo trigger PostgreSQL handle_new_auth_user()
      const userClient = getAnonSupabase(token!);
      const { data: existingProfile, error: existingErr } = await userClient
        .from('utilizadores')
        .select('*')
        .eq('id', targetUserId)
        .maybeSingle();

      if (existingErr && isMissingSchemaError(existingErr)) {
        return res.status(400).json({
          success: false,
          code: 'SCHEMA_MISSING',
          error:
            'As tabelas da base de dados ainda não foram criadas no Supabase (public.utilizadores / public.company_settings). Execute o script supabase-schema.sql no SQL Editor do Supabase.',
        });
      }

      if (existingProfile) {
        const mapped = mapUtilizadorRow(existingProfile, authUserObj);
        let companyData: any = undefined;
        if (mapped.companyId) {
          const { data: cRow } = await userClient
            .from('company_settings')
            .select('*')
            .eq('id', mapped.companyId)
            .maybeSingle();
          if (cRow) companyData = cRow;
        }
        return res.status(200).json({
          success: true,
          user: mapped,
          company: companyData,
        });
      }

      // 2. Chamar a RPC SECURITY DEFINER complete_company_registration() com o JWT real do utilizador
      const { data: rpcData, error: rpcErr } = await userClient.rpc('complete_company_registration', {
        p_name: cleanName,
        p_phone: cleanPhone,
        p_company_name: cleanCompanyName,
        p_nif: cleanNif,
        p_branch: cleanBranch,
      });

      if (rpcErr) {
        if (isMissingSchemaError(rpcErr)) {
          return res.status(400).json({
            success: false,
            code: 'SCHEMA_MISSING',
            error:
              'Base de dados Supabase incompleta. Copie e execute o script supabase-schema.sql no SQL Editor do Supabase e tente novamente.',
          });
        }
        return res.status(400).json({
          success: false,
          error: `Erro ao registar empresa no Supabase: ${rpcErr.message}`,
        });
      }

      if (rpcData && (rpcData as any).user) {
        return res.status(201).json({
          success: true,
          user: mapUtilizadorRow((rpcData as any).user, authUserObj),
          company: (rpcData as any).company || undefined,
        });
      }

      // 3. Reconsultar utilizadores após RPC
      const { data: postRpcProfile } = await userClient
        .from('utilizadores')
        .select('*')
        .eq('id', targetUserId)
        .maybeSingle();

      if (postRpcProfile) {
        return res.status(201).json({
          success: true,
          user: mapUtilizadorRow(postRpcProfile, authUserObj),
        });
      }

      return res.status(400).json({
        success: false,
        code: 'SCHEMA_MISSING',
        error:
          'Conta autenticada, mas não foi possível provisionar a empresa em public.company_settings. Execute supabase-schema.sql no SQL Editor do Supabase.',
      });
    }

    const adminSupabase = getAdminSupabase();

    // Verificar se o utilizador já possui perfil em public.utilizadores (por trigger ou chamada anterior)
    const { data: existingUtil, error: existingUtilErr } = await adminSupabase
      .from('utilizadores')
      .select('*')
      .eq('id', targetUserId)
      .maybeSingle();

    if (existingUtilErr && isMissingSchemaError(existingUtilErr)) {
      return res.status(400).json({
        success: false,
        code: 'SCHEMA_MISSING',
        error:
          'As tabelas da base de dados ainda não foram criadas no Supabase. Execute o script supabase-schema.sql no SQL Editor do Supabase.',
      });
    }

    if (existingUtil) {
      const mappedProfile = mapUtilizadorRow(existingUtil, authUserObj);
      let companyData = undefined;
      if (mappedProfile.companyId) {
        const { data: cRow } = await adminSupabase
          .from('company_settings')
          .select('*')
          .eq('id', mappedProfile.companyId)
          .maybeSingle();
        if (cRow) companyData = cRow;
      }
      return res.status(200).json({
        success: true,
        user: mappedProfile,
        company: companyData,
      });
    }

    // Criar nova empresa isolada para este utilizador (papel máximo no auto-registo: admin_geral)
    const newCompanyId = crypto.randomUUID();
    const companyPayload: Record<string, any> = {
      id: newCompanyId,
      name: cleanCompanyName,
      nif: cleanNif,
      phone: cleanPhone,
      email: cleanEmail,
      address: '',
      city: 'Luanda, Angola',
      currency: 'Kz',
      status: 'ativo',
      super_admin_id: PRESERVED_SUPER_ADMIN_UUID,
      updated_at: new Date().toISOString(),
    };

    const { data: compInserted, error: compErr } = await adminSupabase
      .from('company_settings')
      .upsert(companyPayload, { onConflict: 'id' })
      .select('*')
      .maybeSingle();

    if (compErr) {
      return res.status(400).json({
        success: false,
        code: isMissingSchemaError(compErr) ? 'SCHEMA_MISSING' : undefined,
        error: isMissingSchemaError(compErr)
          ? 'Tabela public.company_settings não encontrada no Supabase. Execute supabase-schema.sql no SQL Editor.'
          : `Erro ao criar empresa: ${compErr.message}`,
      });
    }

    // Inserir perfil em public.utilizadores (sem coluna senha)
    const utilPayload: Record<string, any> = {
      id: targetUserId,
      nome: cleanName,
      email: cleanEmail,
      telefone: cleanPhone,
      role: 'admin_geral',
      company_id: newCompanyId,
      ativo: true,
      branch: cleanBranch,
      seller_id: targetUserId,
      updated_at: new Date().toISOString(),
    };

    const { data: utilInserted, error: utilErr } = await adminSupabase
      .from('utilizadores')
      .insert(utilPayload)
      .select('*')
      .maybeSingle();

    if (utilErr) {
      return res.status(400).json({
        success: false,
        error: `Erro ao criar perfil em public.utilizadores: ${utilErr.message}`,
      });
    }

    // Espelhar em sellers para manter FKs de clientes/dívidas consistentes
    try {
      await adminSupabase.from('sellers').upsert(
        {
          id: targetUserId,
          name: cleanName,
          phone: cleanPhone || '+244 900 000 000',
          branch: cleanBranch,
          email: cleanEmail,
          role: 'admin_geral',
          company_id: newCompanyId,
          is_active: true,
        },
        { onConflict: 'id' }
      );
    } catch {}

    // Atualizar metadata do utilizador Auth para refletir company_id e role
    try {
      await adminSupabase.auth.admin.updateUserById(targetUserId, {
        user_metadata: {
          name: cleanName,
          role: 'admin_geral',
          company_id: newCompanyId,
        },
      });
    } catch {}

    return res.status(201).json({
      success: true,
      user: mapUtilizadorRow(utilInserted || utilPayload, authUserObj),
      company: compInserted || companyPayload,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro interno ao processar registo.',
    });
  }
}
