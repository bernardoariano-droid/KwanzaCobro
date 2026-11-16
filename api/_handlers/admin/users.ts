import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  authenticateRequest,
  getAdminSupabase,
  getAnonSupabase,
  mapUtilizadorRow,
  normalizeServerRole,
  PRESERVED_SUPER_ADMIN_EMAIL,
  PRESERVED_SUPER_ADMIN_UUID,
} from '../../_supabase.js';

function isProtectedSuperAdmin(userId?: string | null, email?: string | null): boolean {
  const cleanId = String(userId || '').trim().toLowerCase();
  const cleanEmail = String(email || '').trim().toLowerCase();
  return (
    cleanId === PRESERVED_SUPER_ADMIN_UUID.toLowerCase() ||
    cleanEmail === PRESERVED_SUPER_ADMIN_EMAIL.toLowerCase()
  );
}

function translateAuthCreationError(message?: string): string {
  const msg = String(message || '').toLowerCase();
  if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('already exists')) {
    return 'Já existe uma conta no Supabase Auth registada com este endereço de e-mail.';
  }
  if (msg.includes('email_address_invalid') || (msg.includes('email address') && msg.includes('invalid'))) {
    return 'O endereço de e-mail não foi aceite pelo Supabase Auth. Utilize um e-mail com domínio real e válido (ex: @gmail.com, @outlook.com) sem espaços ou acentos.';
  }
  if (msg.includes('database error saving new user')) {
    return 'Erro interno no trigger de utilizadores do Supabase. Execute o script supabase-schema.sql atualizado no SQL Editor do Supabase.';
  }
  if (msg.includes('error sending confirmation email') || msg.includes('over_email_send_rate_limit') || msg.includes('email rate limit')) {
    return 'O Supabase Auth atingiu o limite de envio de e-mails de confirmação. Configure SUPABASE_SERVICE_ROLE_KEY no servidor ou desative "Confirm email" em Authentication -> Providers -> Email no painel Supabase.';
  }
  if (msg.includes('password') && msg.includes('least')) {
    return 'A palavra-passe deve ter pelo menos 6 caracteres.';
  }
  if (msg.includes('signups not allowed')) {
    return 'O registo de novos utilizadores está desativado nas definições Auth do Supabase (ou configure SUPABASE_SERVICE_ROLE_KEY no servidor).';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Limite temporário de pedidos no Supabase Auth atingido. Aguarde alguns instantes e tente novamente.';
  }
  return message || 'Erro ao criar conta no Supabase Auth.';
}

/**
 * Constrói um payload adaptativo para public.utilizadores respeitando colunas existentes na tabela.
 */
function buildAdaptiveUtilizadorPayload(
  sampleColumns: Set<string>,
  input: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: string;
    companyId: string | null;
    isActive: boolean;
    branch?: string;
    sellerId?: string;
  },
  isInsert: boolean
): Record<string, any> {
  const payload: Record<string, any> = {};

  const has = (col: string) => sampleColumns.size === 0 || sampleColumns.has(col);

  if (isInsert) {
    payload.id = input.id;
    if (sampleColumns.has('auth_user_id')) payload.auth_user_id = input.id;
    if (sampleColumns.has('user_id')) payload.user_id = input.id;
  }

  if (has('email')) payload.email = input.email;

  if (sampleColumns.has('nome')) payload.nome = input.name;
  if (sampleColumns.has('name') || (!sampleColumns.has('nome') && has('name'))) payload.name = input.name;

  if (sampleColumns.has('telefone')) payload.telefone = input.phone || '';
  if (sampleColumns.has('phone') || (!sampleColumns.has('telefone') && has('phone'))) payload.phone = input.phone || '';

  if (has('role')) payload.role = input.role;
  if (sampleColumns.has('perfil')) payload.perfil = input.role;
  if (sampleColumns.has('tipo')) payload.tipo = input.role;

  if (has('company_id')) payload.company_id = input.companyId;
  if (sampleColumns.has('empresa_id')) payload.empresa_id = input.companyId;

  if (sampleColumns.has('ativo') || has('ativo')) payload.ativo = input.isActive;
  if (sampleColumns.has('active')) payload.active = input.isActive;
  if (sampleColumns.has('is_active')) payload.is_active = input.isActive;
  if (sampleColumns.has('estado')) payload.estado = input.isActive ? 'ativo' : 'inativo';
  if (sampleColumns.has('status')) payload.status = input.isActive ? 'ativo' : 'inativo';

  if (input.branch !== undefined) {
    if (sampleColumns.has('branch') || has('branch')) payload.branch = input.branch;
    if (sampleColumns.has('filial')) payload.filial = input.branch;
  }

  if (input.sellerId && (sampleColumns.size === 0 || sampleColumns.has('seller_id'))) {
    payload.seller_id = input.sellerId;
    if (sampleColumns.has('vendedor_id')) payload.vendedor_id = input.sellerId;
  }

  if (sampleColumns.has('updated_at')) {
    payload.updated_at = new Date().toISOString();
  }

  return payload;
}

async function detectUtilizadoresColumns(supabaseClient: any): Promise<Set<string>> {
  try {
    const { data } = await supabaseClient.from('utilizadores').select('*').limit(1);
    if (Array.isArray(data) && data.length > 0) {
      return new Set(Object.keys(data[0]));
    }
  } catch {
    // fallback para conjunto padrão
  }
  return new Set(['id', 'email', 'nome', 'name', 'telefone', 'phone', 'role', 'company_id', 'ativo', 'estado', 'branch', 'seller_id']);
}

async function insertOrUpdateUtilizadorWithFallback(
  supabaseClient: any,
  mode: 'insert' | 'update',
  targetId: string,
  payload: Record<string, any>
): Promise<{ data: any; error: any }> {
  let working = { ...payload };
  for (let attempt = 0; attempt < 8; attempt++) {
    const query =
      mode === 'insert'
        ? supabaseClient.from('utilizadores').upsert(working, { onConflict: 'id' }).select('*').maybeSingle()
        : supabaseClient.from('utilizadores').update(working).eq('id', targetId).select('*').maybeSingle();

    const { data, error } = await query;
    if (!error) return { data, error: null };

    const msg = String(error.message || '');
    const colMatch =
      msg.match(/column "([^"]+)" of relation "utilizadores" does not exist/i) ||
      msg.match(/Could not find the '([^']+)' column of 'utilizadores'/i);

    if (colMatch && colMatch[1] && colMatch[1] in working) {
      const missingCol = colMatch[1];
      const next = { ...working };
      delete next[missingCol];

      // Trocar sinónimos automaticamente quando uma coluna alternativa não existe
      if (missingCol === 'nome' && !('name' in next) && working.nome !== undefined) next.name = working.nome;
      if (missingCol === 'name' && !('nome' in next) && working.name !== undefined) next.nome = working.name;
      if (missingCol === 'telefone' && !('phone' in next) && working.telefone !== undefined) next.phone = working.telefone;
      if (missingCol === 'phone' && !('telefone' in next) && working.phone !== undefined) next.telefone = working.phone;
      if (missingCol === 'role' && !('perfil' in next) && working.role !== undefined) next.perfil = working.role;
      if (missingCol === 'perfil' && !('role' in next) && working.perfil !== undefined) next.role = working.perfil;
      if (missingCol === 'ativo' && !('status' in next) && working.ativo !== undefined) next.status = working.ativo ? 'ativo' : 'inativo';

      working = next;
      continue;
    }

    return { data: null, error };
  }
  return { data: null, error: { message: 'Não foi possível mapear as colunas de public.utilizadores.' } };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, error: auth.error });
  }

  const { profile: caller, userSupabase } = auth;

  // Apenas super_admin e admin_geral podem aceder à gestão de utilizadores
  if (caller.role !== 'super_admin' && caller.role !== 'admin_geral') {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado. Apenas Administradores Gerais ou Super Administrador podem gerir utilizadores.',
    });
  }

  const hasServiceRole = Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim());
  const dbClient = hasServiceRole ? getAdminSupabase() : userSupabase;

  // -------------------------------------------------------
  // GET /api/admin/users - Listar utilizadores autorizados
  // -------------------------------------------------------
  if (req.method === 'GET') {
    try {
      const requestedCompanyId = req.query?.companyId ? String(req.query.companyId) : null;
      let query = dbClient.from('utilizadores').select('*').order('created_at', { ascending: false });

      if (caller.role === 'admin_geral') {
        if (!caller.companyId) {
          return res.status(403).json({ success: false, error: 'Administrador sem empresa associada.' });
        }
        query = query.eq('company_id', caller.companyId);
      } else if (requestedCompanyId && requestedCompanyId !== 'all') {
        query = query.eq('company_id', requestedCompanyId);
      }

      const { data, error } = await query;
      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      const users = (data || [])
        .map((row: any) => mapUtilizadorRow(row))
        // admin_geral nunca vê ou manipula contas super_admin
        .filter((u) => caller.role === 'super_admin' || u.role !== 'super_admin');

      return res.status(200).json({ success: true, users });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // -------------------------------------------------------
  // POST /api/admin/users - Criar utilizador real no Supabase Auth + public.utilizadores
  // -------------------------------------------------------
  if (req.method === 'POST') {
    try {
      const { name, email, password, phone, branch, role: rawRole, companyId: rawCompanyId } = req.body || {};

      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanName = String(name || '').trim();
      const cleanPass = String(password || '').trim();
      const cleanPhone = String(phone || '').trim();
      const cleanBranch = String(branch || 'Sede').trim();
      const requestedRole = normalizeServerRole(rawRole);

      if (!cleanEmail || !cleanEmail.includes('@')) {
        return res.status(400).json({ success: false, error: 'Informe um e-mail válido para o utilizador.' });
      }
      if (!cleanName) {
        return res.status(400).json({ success: false, error: 'Informe o nome completo do utilizador.' });
      }
      if (cleanPass.length < 6) {
        return res.status(400).json({ success: false, error: 'A palavra-passe deve ter pelo menos 6 caracteres.' });
      }
      if (isProtectedSuperAdmin(null, cleanEmail)) {
        return res.status(403).json({
          success: false,
          error: 'O e-mail do Super Administrador principal é reservado e protegido.',
        });
      }

      // Validação de permissões por perfil
      if (caller.role === 'admin_geral') {
        if (requestedRole === 'super_admin') {
          return res.status(403).json({
            success: false,
            error: 'Um Administrador Geral não pode criar contas de Super Administrador.',
          });
        }
        if (rawCompanyId && caller.companyId && String(rawCompanyId) !== caller.companyId) {
          return res.status(403).json({
            success: false,
            error: 'Um Administrador Geral só pode cadastrar utilizadores na sua própria empresa.',
          });
        }
      }

      const resolvedCompanyId =
        caller.role === 'admin_geral'
          ? caller.companyId
          : requestedRole === 'super_admin'
          ? (rawCompanyId ? String(rawCompanyId) : null)
          : String(rawCompanyId || caller.companyId || 'default_company');

      if (requestedRole !== 'super_admin' && !resolvedCompanyId) {
        return res.status(400).json({ success: false, error: 'É obrigatório associar o utilizador a uma empresa.' });
      }

      let createdAuthUser: any = null;
      let needsEmailConfirmation = false;

      if (hasServiceRole) {
        const adminSupabase = getAdminSupabase();
        const { data: createdAuth, error: authCreateErr } = await adminSupabase.auth.admin.createUser({
          email: cleanEmail,
          password: cleanPass,
          email_confirm: true,
          user_metadata: {
            name: cleanName,
            phone: cleanPhone,
            branch: cleanBranch,
            role: requestedRole,
            company_id: resolvedCompanyId,
            admin_created: true,
          },
        });

        if (authCreateErr || !createdAuth?.user) {
          return res.status(400).json({
            success: false,
            error: translateAuthCreationError(authCreateErr?.message),
          });
        }
        createdAuthUser = createdAuth.user;
      } else {
        // Sem SUPABASE_SERVICE_ROLE_KEY: cria utilizador real via Supabase Auth signUp num cliente efémero
        // sem alterar a sessão do administrador, e grava o perfil em public.utilizadores com o JWT RLS do admin.
        const ephemeralAnon = getAnonSupabase();
        const { data: signUpData, error: signUpErr } = await ephemeralAnon.auth.signUp({
          email: cleanEmail,
          password: cleanPass,
          options: {
            data: {
              name: cleanName,
              phone: cleanPhone,
              branch: cleanBranch,
              role: requestedRole,
              company_id: resolvedCompanyId,
              admin_created: true,
            },
          },
        });

        if (signUpErr) {
          return res.status(400).json({
            success: false,
            error: translateAuthCreationError(signUpErr.message),
          });
        }

        if (
          !signUpData?.user ||
          (Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0)
        ) {
          return res.status(409).json({
            success: false,
            error: 'Este endereço de e-mail já se encontra registado no Supabase Auth.',
          });
        }

        createdAuthUser = signUpData.user;
        needsEmailConfirmation = !signUpData.session;
      }

      const newUid = createdAuthUser.id;
      const cols = await detectUtilizadoresColumns(dbClient);
      const utilPayload = buildAdaptiveUtilizadorPayload(
        cols,
        {
          id: newUid,
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          role: requestedRole,
          companyId: resolvedCompanyId,
          isActive: true,
          branch: cleanBranch,
          sellerId: newUid,
        },
        true
      );

      // 2. Registar perfil em public.utilizadores (sem coluna senha)
      const { data: insertedRow, error: utilErr } = await insertOrUpdateUtilizadorWithFallback(
        dbClient,
        'insert',
        newUid,
        utilPayload
      );

      if (utilErr) {
        if (hasServiceRole) {
          try {
            await getAdminSupabase().auth.admin.deleteUser(newUid);
          } catch {}
        }
        return res.status(400).json({
          success: false,
          error: `Erro ao gravar em public.utilizadores: ${utilErr.message}`,
        });
      }

      // 3. Espelhar perfil comercial em public.sellers (sem guardar senha!) para manter FKs de dívidas/clientes
      if (resolvedCompanyId) {
        try {
          await dbClient
            .from('sellers')
            .upsert(
              {
                id: newUid,
                name: cleanName,
                phone: cleanPhone || '+244 900 000 000',
                branch: cleanBranch,
                email: cleanEmail,
                role: requestedRole,
                company_id: resolvedCompanyId,
                is_active: true,
              },
              { onConflict: 'id' }
            );
        } catch {}
      }

      const createdProfile = mapUtilizadorRow(insertedRow || utilPayload, createdAuthUser);
      const message = needsEmailConfirmation
        ? `Utilizador real criado no Supabase Auth (${cleanEmail}) e registado em public.utilizadores. Foi enviado um e-mail de confirmação antes do primeiro acesso.`
        : `Utilizador real criado e ativado no Supabase Auth e public.utilizadores: ${cleanName} (${cleanEmail}).`;

      return res.status(201).json({
        success: true,
        user: createdProfile,
        needsEmailConfirmation,
        message,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // -------------------------------------------------------
  // PATCH /api/admin/users - Atualizar utilizador / estado / permissões
  // -------------------------------------------------------
  if (req.method === 'PATCH') {
    try {
      const { userId, name, email, phone, branch, role: rawRole, companyId, isActive, password } = req.body || {};
      const targetId = String(userId || '').trim();

      if (!targetId) {
        return res.status(400).json({ success: false, error: 'userId é obrigatório.' });
      }

      const { data: existingRow, error: fetchErr } = await dbClient
        .from('utilizadores')
        .select('*')
        .eq('id', targetId)
        .maybeSingle();

      if (fetchErr || !existingRow) {
        return res.status(404).json({ success: false, error: 'Utilizador não encontrado em public.utilizadores.' });
      }

      const targetProfile = mapUtilizadorRow(existingRow);

      // Proteger Super Administrador existente (bamidia@gmail.com / UUID 8b9f3c41-c996-4764-87c2-9d82411584e1)
      if (isProtectedSuperAdmin(targetProfile.id, targetProfile.email)) {
        return res.status(403).json({
          success: false,
          error: 'O Super Administrador principal está protegido e os seus dados não podem ser alterados.',
        });
      }

      // Regra estrita: Nenhum utilizador poderá alterar o próprio perfil, permissões ou empresa
      if (targetProfile.id === caller.id || targetProfile.authUserId === caller.authUserId) {
        const triesPrivilegeChange =
          (rawRole !== undefined && normalizeServerRole(rawRole) !== caller.role) ||
          (companyId !== undefined && String(companyId || '') !== String(caller.companyId || '')) ||
          (isActive !== undefined && Boolean(isActive) !== caller.isActive);

        if (triesPrivilegeChange) {
          return res.status(403).json({
            success: false,
            error: 'Nenhum utilizador pode alterar o próprio perfil, permissões ou empresa.',
          });
        }
      }

      // Isolamento por empresa para admin_geral
      if (caller.role === 'admin_geral') {
        if (targetProfile.role === 'super_admin') {
          return res.status(403).json({ success: false, error: 'Sem permissão para gerir Super Administradores.' });
        }
        if (String(targetProfile.companyId || '') !== String(caller.companyId || '')) {
          return res.status(403).json({
            success: false,
            error: 'Acesso negado: utilizador pertence a outra empresa.',
          });
        }
        if (rawRole !== undefined && normalizeServerRole(rawRole) === 'super_admin') {
          return res.status(403).json({
            success: false,
            error: 'Administrador Geral não pode promover utilizadores para Super Administrador.',
          });
        }
        if (companyId !== undefined && String(companyId || '') !== String(caller.companyId || '')) {
          return res.status(403).json({
            success: false,
            error: 'Administrador Geral não pode transferir utilizadores para outra empresa.',
          });
        }
      }

      const nextRole = rawRole !== undefined ? normalizeServerRole(rawRole) : targetProfile.role;
      const nextCompanyId =
        caller.role === 'admin_geral'
          ? caller.companyId
          : companyId !== undefined
          ? (companyId ? String(companyId) : null)
          : targetProfile.companyId;
      const nextIsActive = isActive !== undefined ? Boolean(isActive) : targetProfile.isActive;
      const nextEmail = email !== undefined ? String(email).trim().toLowerCase() : targetProfile.email;
      const nextName = name !== undefined ? String(name).trim() : targetProfile.name;
      const nextPhone = phone !== undefined ? String(phone).trim() : targetProfile.phone;
      const nextBranch = branch !== undefined ? String(branch).trim() : targetProfile.branch;

      const requestedPasswordChange = Boolean(password && String(password).trim().length >= 6);
      const requestedEmailChange = Boolean(nextEmail && nextEmail !== targetProfile.email);

      if (hasServiceRole) {
        const adminSupabase = getAdminSupabase();
        const authUpdate: any = {
          user_metadata: {
            name: nextName,
            role: nextRole,
            company_id: nextCompanyId,
          },
          ban_duration: nextIsActive ? 'none' : '876000h',
        };
        if (requestedEmailChange) authUpdate.email = nextEmail;
        if (requestedPasswordChange) authUpdate.password = String(password).trim();

        const authUidToUpdate = targetProfile.authUserId || targetProfile.id;
        const { error: authUpdErr } = await adminSupabase.auth.admin.updateUserById(authUidToUpdate, authUpdate);
        if (authUpdErr) {
          return res.status(400).json({
            success: false,
            error: `Erro ao atualizar autenticação no Supabase Auth: ${authUpdErr.message}`,
          });
        }
      } else if (requestedPasswordChange || requestedEmailChange) {
        return res.status(400).json({
          success: false,
          missingServiceRoleKey: true,
          error:
            'Para redefinir a palavra-passe ou o e-mail de outro utilizador no Supabase Auth, configure SUPABASE_SERVICE_ROLE_KEY no servidor (ou o utilizador pode usar "Esqueceu a palavra-passe?").',
        });
      }

      const cols = await detectUtilizadoresColumns(dbClient);
      const utilUpdatePayload = buildAdaptiveUtilizadorPayload(
        cols,
        {
          id: targetProfile.id,
          name: nextName,
          email: nextEmail,
          phone: nextPhone,
          role: nextRole,
          companyId: nextCompanyId,
          isActive: nextIsActive,
          branch: nextBranch,
        },
        false
      );

      const { data: updatedRow, error: utilUpdErr } = await insertOrUpdateUtilizadorWithFallback(
        dbClient,
        'update',
        targetProfile.id,
        utilUpdatePayload
      );

      if (utilUpdErr) {
        return res.status(400).json({ success: false, error: utilUpdErr.message });
      }

      // Sincronizar tabela sellers caso exista
      if (nextCompanyId) {
        try {
          await dbClient
            .from('sellers')
            .upsert(
              {
                id: targetProfile.sellerId || targetProfile.id,
                name: nextName,
                phone: nextPhone || '+244 900 000 000',
                branch: nextBranch || 'Sede',
                email: nextEmail,
                role: nextRole,
                company_id: nextCompanyId,
                is_active: nextIsActive,
              },
              { onConflict: 'id' }
            );
        } catch {}
      }

      return res.status(200).json({
        success: true,
        user: mapUtilizadorRow(updatedRow || { ...existingRow, ...utilUpdatePayload }),
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // -------------------------------------------------------
  // DELETE /api/admin/users - Desativar ou remover utilizador
  // -------------------------------------------------------
  if (req.method === 'DELETE') {
    try {
      const targetId = String(req.query?.userId || req.body?.userId || '').trim();
      if (!targetId) {
        return res.status(400).json({ success: false, error: 'userId é obrigatório.' });
      }

      if (targetId === caller.id || targetId === caller.authUserId) {
        return res.status(403).json({ success: false, error: 'Não pode remover ou desativar a sua própria conta.' });
      }

      const { data: existingRow } = await dbClient
        .from('utilizadores')
        .select('*')
        .eq('id', targetId)
        .maybeSingle();

      if (!existingRow) {
        return res.status(404).json({ success: false, error: 'Utilizador não encontrado.' });
      }

      const targetProfile = mapUtilizadorRow(existingRow);

      if (isProtectedSuperAdmin(targetProfile.id, targetProfile.email)) {
        return res.status(403).json({
          success: false,
          error: 'O Super Administrador principal não pode ser removido.',
        });
      }

      if (caller.role === 'admin_geral') {
        if (targetProfile.role === 'super_admin' || String(targetProfile.companyId || '') !== String(caller.companyId || '')) {
          return res.status(403).json({
            success: false,
            error: 'Sem permissão para remover utilizadores de outra empresa ou Super Administradores.',
          });
        }
      }

      if (hasServiceRole) {
        const adminSupabase = getAdminSupabase();
        // Desativar no Auth (ban) ou remover conforme integridade
        try {
          const delAuthRes = await adminSupabase.auth.admin.deleteUser(targetProfile.authUserId || targetProfile.id);
          if (delAuthRes.error) {
            await adminSupabase.auth.admin.updateUserById(targetProfile.authUserId || targetProfile.id, {
              ban_duration: '876000h',
            });
          }
        } catch {
          try {
            await adminSupabase.auth.admin.updateUserById(targetProfile.authUserId || targetProfile.id, {
              ban_duration: '876000h',
            });
          } catch {}
        }
      }

      // Apenas super_admin pode apagar linha em public.utilizadores pelas políticas RLS
      if (hasServiceRole || caller.role === 'super_admin') {
        const { error: delErr } = await dbClient.from('utilizadores').delete().eq('id', targetProfile.id);
        if (!delErr) {
          return res.status(200).json({ success: true });
        }
      }

      // Fallback seguro: desativar em public.utilizadores e public.sellers
      const cols = await detectUtilizadoresColumns(dbClient);
      const disablePayload = buildAdaptiveUtilizadorPayload(
        cols,
        {
          id: targetProfile.id,
          name: targetProfile.name,
          email: targetProfile.email,
          phone: targetProfile.phone,
          role: targetProfile.role,
          companyId: targetProfile.companyId,
          isActive: false,
        },
        false
      );
      await insertOrUpdateUtilizadorWithFallback(dbClient, 'update', targetProfile.id, disablePayload);
      if (targetProfile.companyId) {
        try {
          await dbClient
            .from('sellers')
            .update({ is_active: false })
            .eq('id', targetProfile.sellerId || targetProfile.id);
        } catch {}
      }

      return res.status(200).json({ success: true, deactivatedOnly: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Método não suportado.' });
}
