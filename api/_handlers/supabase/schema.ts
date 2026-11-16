import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const candidates = [
      path.resolve(process.cwd(), 'supabase-schema.sql'),
      path.resolve(process.cwd(), '..', 'supabase-schema.sql'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const sql = fs.readFileSync(p, 'utf-8');
        return res.status(200).json({ success: true, sql });
      }
    }

    const fallbackSql = `-- NEUROJUS / KwanzaCobro: Autenticação Supabase Auth + RLS Multiempresa
-- Preserva bernardoariano@gmail.com (super_admin)
-- e funções existentes: is_super_admin(), current_company_id(), is_company_admin()
ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS auth_user_id UUID;
ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS perfil TEXT DEFAULT 'vendedor';
ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'vendedor';
ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'ativo';
ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo';
ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'Sede';
ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS filial TEXT DEFAULT 'Sede';
ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS seller_id TEXT;
ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS vendedor_id TEXT;
ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS company_id TEXT DEFAULT 'default_company';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS company_id TEXT DEFAULT 'default_company';
ALTER TABLE public.debts ADD COLUMN IF NOT EXISTS company_id TEXT DEFAULT 'default_company';
ALTER TABLE public.audit_trail ADD COLUMN IF NOT EXISTS company_id TEXT DEFAULT 'default_company';`;
    return res.status(200).json({ success: true, sql: fallbackSql });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
