import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAnonSupabase, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_PROJECT_REF } from '../../_supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const start = Date.now();
  try {
    const supabase = getAnonSupabase();

    // 1. Ping endpoint Auth & REST sem enviar sb_publishable_* como Bearer JWT
    const pingHeaders: Record<string, string> = {
      apikey: SUPABASE_ANON_KEY,
    };
    if (SUPABASE_ANON_KEY.startsWith('eyJ')) {
      pingHeaders.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    }

    const pingRes = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      method: 'GET',
      headers: pingHeaders,
    });
    const latencyMs = Date.now() - start;
    const isOnline = pingRes.ok || pingRes.status === 200 || pingRes.status === 401;

    // 2. Query table counts (distinguish schema/table missing vs missing column 42703 vs empty tables)
    let tableExists = false;
    let schemaErrorDetail: string | null = null;
    let counts = { companies: 0, sellers: 0, clients: 0, debts: 0 };
    try {
      const [compRes, utilRes, selRes, cliRes, debtRes] = await Promise.all([
        supabase.from('company_settings').select('id', { count: 'exact' }).limit(1),
        supabase.from('utilizadores').select('id', { count: 'exact' }).limit(1),
        supabase.from('sellers').select('id', { count: 'exact' }).limit(1),
        supabase.from('clients').select('id', { count: 'exact' }).limit(1),
        supabase.from('debts').select('id', { count: 'exact' }).limit(1),
      ]);

      const isMissingTableErr = (err: any) => {
        if (!err) return false;
        const code = String(err.code || '').toUpperCase();
        const msg = String(err.message || '').toLowerCase();
        return (
          code === 'PGRST205' ||
          code === '42P01' ||
          msg.includes('schema cache') ||
          msg.includes('could not find the table') ||
          /relation\s+["']?[^"']+["']?\s+does not exist/i.test(msg)
        );
      };

      const isSchemaOrFunctionErr = (err: any) => {
        if (!err || isMissingTableErr(err)) return false;
        const code = String(err.code || '').toUpperCase();
        const msg = String(err.message || '').toLowerCase();
        return (
          code === '42703' ||
          code === '42P13' ||
          code === '42883' ||
          code === '42804' ||
          /column\s+.+\s+does not exist/i.test(msg) ||
          msg.includes('return type mismatch') ||
          msg.includes('does not exist') ||
          msg.includes('operator does not exist')
        );
      };

      const schemaErr = [compRes.error, utilRes.error, selRes.error, cliRes.error, debtRes.error].find(isSchemaOrFunctionErr);
      if (schemaErr) {
        schemaErrorDetail = String(schemaErr.message || 'Estrutura ou função SQL desatualizada.');
      }

      tableExists =
        !isMissingTableErr(compRes.error) ||
        !isMissingTableErr(utilRes.error) ||
        !isMissingTableErr(selRes.error) ||
        !isMissingTableErr(cliRes.error) ||
        !isMissingTableErr(debtRes.error);

      counts = {
        companies: compRes.count ?? 0,
        sellers: selRes.count ?? 0,
        clients: cliRes.count ?? 0,
        debts: debtRes.count ?? 0,
      };
    } catch {
      tableExists = false;
    }

    return res.status(200).json({
      success: true,
      connected: isOnline,
      latencyMs,
      projectId: SUPABASE_PROJECT_REF,
      url: SUPABASE_URL,
      tableExists,
      schemaUpdateRequired: Boolean(schemaErrorDetail),
      counts,
      status: isOnline ? 'online' : 'offline',
      message: isOnline
        ? !tableExists
          ? 'Supabase Auth conectado. Execute supabase-schema.sql no SQL Editor para criar as tabelas.'
          : schemaErrorDetail
          ? `Tabelas detetadas, mas falta atualizar a estrutura (${schemaErrorDetail}). Execute o script supabase-schema.sql atualizado no SQL Editor.`
          : `Conectado ao Supabase (${counts.companies} empresas, ${counts.sellers} vendedores, ${counts.clients} clientes, ${counts.debts} dívidas)`
        : 'Cluster Supabase offline ou inatingível',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      connected: false,
      error: err.message,
    });
  }
}
