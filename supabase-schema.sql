-- ====================================================================
-- NEUROJUS / KwanzaCobro - Esquema SQL Completo, Relacional & RLS Multiempresa
-- Projeto Supabase: ckcwpcnsfennfjmjwoqp
-- GARANTIAS DE SEGURANÇA E PRESERVAÇÃO:
--   • NÃO apaga tabelas, registos nem dados existentes.
--   • NÃO cria coluna senha/password em public.utilizadores ou company_settings.
--   • PRESERVA o Super Administrador existente:
--     Email: bamidia@gmail.com | UUID: 8b9f3c41-c996-4764-87c2-9d82411584e1
--   • PRESERVA as funções SQL existentes:
--     public.is_super_admin(), public.current_company_id(), public.is_company_admin()
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------
-- 1. CRIAÇÃO DE TABELAS (IF NOT EXISTS — não altera tabelas existentes)
-- --------------------------------------------------------------------

-- Tabela de Empresas (Multi-Empresa)
CREATE TABLE IF NOT EXISTS public.company_settings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL DEFAULT 'KwanzaCobro - Gestão de Dívidas Empresariais',
    nif TEXT DEFAULT '',
    phone TEXT DEFAULT '+244 ',
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    city TEXT DEFAULT 'Luanda, Angola',
    bank_name TEXT DEFAULT 'Banco BAI',
    iban TEXT DEFAULT '',
    express_phone TEXT DEFAULT '',
    currency TEXT DEFAULT 'Kz',
    logo_url TEXT,
    penalty_per_day_rate NUMERIC DEFAULT 0.1,
    days_before_due_alert INTEGER DEFAULT 5,
    auto_alert_notifications BOOLEAN DEFAULT TRUE,
    status TEXT DEFAULT 'ativo',
    super_admin_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Utilizadores ligada ao Supabase Auth (sem coluna senha)
CREATE TABLE IF NOT EXISTS public.utilizadores (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    auth_user_id UUID,
    user_id UUID,
    nome TEXT NOT NULL DEFAULT 'Utilizador',
    name TEXT,
    email TEXT NOT NULL UNIQUE,
    telefone TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    role TEXT NOT NULL DEFAULT 'vendedor' CHECK (role IN ('super_admin', 'admin_geral', 'vendedor')),
    perfil TEXT NOT NULL DEFAULT 'vendedor',
    tipo TEXT DEFAULT 'vendedor',
    company_id TEXT,
    empresa_id TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    active BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    estado TEXT NOT NULL DEFAULT 'ativo',
    status TEXT NOT NULL DEFAULT 'ativo',
    branch TEXT DEFAULT 'Sede',
    filial TEXT DEFAULT 'Sede',
    seller_id TEXT,
    vendedor_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Vendedores / Equipa Comercial por Empresa
CREATE TABLE IF NOT EXISTS public.sellers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    branch TEXT DEFAULT 'Sede',
    email TEXT,
    role TEXT DEFAULT 'vendedor',
    company_id TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Clientes por Empresa e Vendedor
CREATE TABLE IF NOT EXISTS public.clients (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    nif TEXT,
    phone TEXT DEFAULT '',
    email TEXT,
    province TEXT DEFAULT 'Luanda',
    municipality TEXT DEFAULT 'Luanda',
    address TEXT,
    client_type TEXT DEFAULT 'empresa',
    credit_limit NUMERIC DEFAULT 0,
    notes TEXT,
    created_by_seller_id TEXT,
    company_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Dívidas / Faturas a Crédito por Empresa, Cliente e Vendedor
CREATE TABLE IF NOT EXISTS public.debts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    invoice_number TEXT NOT NULL,
    client_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    company_id TEXT,
    customer_name TEXT,
    customer_phone TEXT DEFAULT '',
    issue_date DATE DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'aberta',
    payment_method_agreed TEXT DEFAULT 'multicaixa_express',
    terms TEXT,
    confirmation_status TEXT DEFAULT 'sem_sms',
    confirmation_mode TEXT DEFAULT 'pessoal',
    confirmation_code TEXT,
    confirmation_transaction_id TEXT,
    reminder_5_days_sent BOOLEAN DEFAULT FALSE,
    reminder_5_days_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Itens da Dívida
CREATE TABLE IF NOT EXISTS public.debt_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    debt_id TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity NUMERIC DEFAULT 1,
    unit_price NUMERIC DEFAULT 0,
    total NUMERIC DEFAULT 0
);

-- Tabela de Pagamentos / Amortizações
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    debt_id TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    payment_method TEXT DEFAULT 'multicaixa_express',
    receipt_ref TEXT,
    notes TEXT,
    received_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Auditoria por Empresa e Dívida
CREATE TABLE IF NOT EXISTS public.audit_trail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_id TEXT,
    company_id TEXT,
    action TEXT NOT NULL,
    performed_by TEXT,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela Auxiliar de Sincronização
CREATE TABLE IF NOT EXISTS public.kwanzacobro_sync (
    id TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 2. COLUNAS AUXILIARES E RELACIONAMENTOS ENTRE TABELAS (FOREIGN KEYS)
--    Adapta-se automaticamente ao tipo real das colunas (uuid ou text)
--    para nunca gerar erros 42703/42804 em estruturas já existentes.
-- --------------------------------------------------------------------
DO $$
DECLARE
    v_comp_id_type TEXT;
    v_sellers_id_type TEXT;
    v_clients_id_type TEXT;
    v_debts_id_type TEXT;
    v_col_type TEXT;
    v_util_emp_type TEXT;
    v_util_auth_uid_type TEXT;
    v_util_uid_type TEXT;
    v_has_comp_id_col BOOLEAN;
BEGIN
    -- Garantir coluna id em company_settings se não existir
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'company_settings' AND column_name = 'id'
    ) INTO v_has_comp_id_col;

    IF NOT v_has_comp_id_col THEN
        ALTER TABLE public.company_settings ADD COLUMN id TEXT DEFAULT gen_random_uuid()::text;
        UPDATE public.company_settings SET id = gen_random_uuid()::text WHERE id IS NULL;
        ALTER TABLE public.company_settings ALTER COLUMN id SET NOT NULL;
    END IF;

    -- Garantir índice único em company_settings(id) para suportar chaves estrangeiras
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'company_settings' AND indexdef ILIKE '%(id)%'
    ) THEN
        CREATE UNIQUE INDEX idx_company_settings_id_unique ON public.company_settings(id);
    END IF;

    -- Atualizar função de proteção antes do backfill para permitir migrações no SQL Editor (auth.uid() IS NULL)
    EXECUTE $fn$
        CREATE OR REPLACE FUNCTION public.prevent_self_privilege_change()
        RETURNS TRIGGER AS $body$
        DECLARE
            v_old JSONB := to_jsonb(OLD);
            v_new JSONB := to_jsonb(NEW);
            v_is_admin_ctx BOOLEAN := (
                current_setting('role', true) = 'service_role'
                OR (auth.uid() IS NULL AND current_user IN ('postgres', 'supabase_admin'))
            );
        BEGIN
            IF OLD.id::text = '8b9f3c41-c996-4764-87c2-9d82411584e1' AND NOT v_is_admin_ctx THEN
                IF (v_new->>'role') IS DISTINCT FROM (v_old->>'role')
                   OR (v_new->>'perfil') IS DISTINCT FROM (v_old->>'perfil')
                   OR (v_new->>'tipo') IS DISTINCT FROM (v_old->>'tipo')
                   OR (v_new->>'company_id') IS DISTINCT FROM (v_old->>'company_id')
                   OR (v_new->>'empresa_id') IS DISTINCT FROM (v_old->>'empresa_id')
                   OR (v_new->>'email') IS DISTINCT FROM (v_old->>'email') THEN
                    RAISE EXCEPTION 'A conta do Super Administrador principal está protegida.';
                END IF;
            END IF;

            IF auth.uid() IS NOT NULL
               AND OLD.id::text = auth.uid()::text
               AND current_setting('role', true) <> 'service_role' THEN
                IF (v_new->>'role') IS DISTINCT FROM (v_old->>'role')
                   OR (v_new->>'perfil') IS DISTINCT FROM (v_old->>'perfil')
                   OR (v_new->>'tipo') IS DISTINCT FROM (v_old->>'tipo')
                   OR (v_new->>'company_id') IS DISTINCT FROM (v_old->>'company_id')
                   OR (v_new->>'empresa_id') IS DISTINCT FROM (v_old->>'empresa_id')
                   OR (v_new->>'ativo') IS DISTINCT FROM (v_old->>'ativo')
                   OR (v_new->>'active') IS DISTINCT FROM (v_old->>'active')
                   OR (v_new->>'is_active') IS DISTINCT FROM (v_old->>'is_active')
                   OR (v_new->>'estado') IS DISTINCT FROM (v_old->>'estado')
                   OR (v_new->>'status') IS DISTINCT FROM (v_old->>'status') THEN
                    RAISE EXCEPTION 'Nenhum utilizador pode alterar o próprio perfil, permissões ou empresa.';
                END IF;
            END IF;

            RETURN NEW;
        END;
        $body$ LANGUAGE plpgsql SECURITY DEFINER;
    $fn$;

    -- Garantir colunas auxiliares em company_settings e utilizadores (compatibilidade PT/EN)
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo';
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS super_admin_id TEXT;
    ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- Adicionar colunas inicialmente sem DEFAULT restritivo para herdar valores reais no backfill
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS auth_user_id UUID;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS nome TEXT;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS telefone TEXT;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS role TEXT;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS perfil TEXT;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS tipo TEXT;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS ativo BOOLEAN;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS active BOOLEAN;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS is_active BOOLEAN;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS estado TEXT;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS status TEXT;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS branch TEXT;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS filial TEXT;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS seller_id TEXT;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS vendedor_id TEXT;
    ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- Preencher colunas compatíveis em registos existentes de public.utilizadores
    UPDATE public.utilizadores
    SET
        nome = COALESCE(NULLIF(trim(nome), ''), NULLIF(trim(name), ''), split_part(email, '@', 1), 'Utilizador'),
        name = COALESCE(NULLIF(trim(name), ''), NULLIF(trim(nome), ''), split_part(email, '@', 1), 'Utilizador'),
        telefone = COALESCE(telefone, phone, ''),
        phone = COALESCE(phone, telefone, ''),
        role = COALESCE(NULLIF(trim(role), ''), NULLIF(trim(perfil), ''), NULLIF(trim(tipo), ''), 'vendedor'),
        perfil = COALESCE(NULLIF(trim(role), ''), NULLIF(trim(perfil), ''), NULLIF(trim(tipo), ''), 'vendedor'),
        tipo = COALESCE(NULLIF(trim(role), ''), NULLIF(trim(perfil), ''), NULLIF(trim(tipo), ''), 'vendedor'),
        ativo = COALESCE(ativo, active, is_active, (lower(COALESCE(estado, status, 'ativo')) NOT IN ('inativo', 'bloqueado', 'suspenso'))),
        active = COALESCE(ativo, active, is_active, (lower(COALESCE(estado, status, 'ativo')) NOT IN ('inativo', 'bloqueado', 'suspenso'))),
        is_active = COALESCE(ativo, active, is_active, (lower(COALESCE(estado, status, 'ativo')) NOT IN ('inativo', 'bloqueado', 'suspenso'))),
        estado = COALESCE(NULLIF(trim(estado), ''), NULLIF(trim(status), ''), CASE WHEN COALESCE(ativo, TRUE) = TRUE THEN 'ativo' ELSE 'inativo' END),
        status = COALESCE(NULLIF(trim(status), ''), NULLIF(trim(estado), ''), CASE WHEN COALESCE(ativo, TRUE) = TRUE THEN 'ativo' ELSE 'inativo' END),
        branch = COALESCE(NULLIF(trim(branch), ''), NULLIF(trim(filial), ''), 'Sede'),
        filial = COALESCE(NULLIF(trim(filial), ''), NULLIF(trim(branch), ''), 'Sede'),
        seller_id = COALESCE(NULLIF(trim(seller_id), ''), NULLIF(trim(vendedor_id), ''), id::text),
        vendedor_id = COALESCE(NULLIF(trim(vendedor_id), ''), NULLIF(trim(seller_id), ''), id::text);

    -- Definir valores padrão após o backfill
    ALTER TABLE public.utilizadores ALTER COLUMN telefone SET DEFAULT '';
    ALTER TABLE public.utilizadores ALTER COLUMN phone SET DEFAULT '';
    ALTER TABLE public.utilizadores ALTER COLUMN role SET DEFAULT 'vendedor';
    ALTER TABLE public.utilizadores ALTER COLUMN perfil SET DEFAULT 'vendedor';
    ALTER TABLE public.utilizadores ALTER COLUMN tipo SET DEFAULT 'vendedor';
    ALTER TABLE public.utilizadores ALTER COLUMN ativo SET DEFAULT TRUE;
    ALTER TABLE public.utilizadores ALTER COLUMN active SET DEFAULT TRUE;
    ALTER TABLE public.utilizadores ALTER COLUMN is_active SET DEFAULT TRUE;
    ALTER TABLE public.utilizadores ALTER COLUMN estado SET DEFAULT 'ativo';
    ALTER TABLE public.utilizadores ALTER COLUMN status SET DEFAULT 'ativo';
    ALTER TABLE public.utilizadores ALTER COLUMN branch SET DEFAULT 'Sede';
    ALTER TABLE public.utilizadores ALTER COLUMN filial SET DEFAULT 'Sede';

    SELECT data_type INTO v_util_auth_uid_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'utilizadores' AND column_name = 'auth_user_id';
    IF v_util_auth_uid_type = 'uuid' THEN
        UPDATE public.utilizadores SET auth_user_id = id WHERE auth_user_id IS NULL;
    END IF;

    SELECT data_type INTO v_util_uid_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'utilizadores' AND column_name = 'user_id';
    IF v_util_uid_type = 'uuid' THEN
        UPDATE public.utilizadores SET user_id = id WHERE user_id IS NULL;
    END IF;

    -- Detetar tipos reais das chaves primárias
    SELECT data_type INTO v_comp_id_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_settings' AND column_name = 'id';

    SELECT data_type INTO v_sellers_id_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sellers' AND column_name = 'id';

    SELECT data_type INTO v_clients_id_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'id';

    SELECT data_type INTO v_debts_id_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'debts' AND column_name = 'id';

    -- Adicionar company_id e empresa_id nas tabelas caso falte, usando o mesmo tipo de company_settings.id
    IF v_comp_id_type = 'uuid' THEN
        ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS company_id UUID;
        ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS empresa_id UUID;
        ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS company_id UUID;
        ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS company_id UUID;
        ALTER TABLE public.debts ADD COLUMN IF NOT EXISTS company_id UUID;
        ALTER TABLE public.audit_trail ADD COLUMN IF NOT EXISTS company_id UUID;
    ELSE
        ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS company_id TEXT;
        ALTER TABLE public.utilizadores ADD COLUMN IF NOT EXISTS empresa_id TEXT;
        ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS company_id TEXT DEFAULT 'default_company';
        ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS company_id TEXT DEFAULT 'default_company';
        ALTER TABLE public.debts ADD COLUMN IF NOT EXISTS company_id TEXT DEFAULT 'default_company';
        ALTER TABLE public.audit_trail ADD COLUMN IF NOT EXISTS company_id TEXT DEFAULT 'default_company';
    END IF;

    SELECT data_type INTO v_col_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'utilizadores' AND column_name = 'company_id';
    SELECT data_type INTO v_util_emp_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'utilizadores' AND column_name = 'empresa_id';

    IF v_col_type IS NOT NULL AND v_util_emp_type = v_col_type THEN
        UPDATE public.utilizadores
        SET empresa_id = COALESCE(empresa_id, company_id),
            company_id = COALESCE(company_id, empresa_id)
        WHERE empresa_id IS NULL OR company_id IS NULL;

        EXECUTE $trig$
            CREATE OR REPLACE FUNCTION public.sync_utilizadores_empresa()
            RETURNS TRIGGER AS $fn$
            BEGIN
                IF TG_OP = 'INSERT' THEN
                    NEW.company_id := COALESCE(NEW.company_id, NEW.empresa_id);
                    NEW.empresa_id := COALESCE(NEW.empresa_id, NEW.company_id);
                ELSE
                    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
                        NEW.empresa_id := NEW.company_id;
                    ELSIF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
                        NEW.company_id := NEW.empresa_id;
                    ELSE
                        NEW.company_id := COALESCE(NEW.company_id, NEW.empresa_id);
                        NEW.empresa_id := COALESCE(NEW.empresa_id, NEW.company_id);
                    END IF;
                END IF;
                RETURN NEW;
            END;
            $fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
        $trig$;

        DROP TRIGGER IF EXISTS trg_01_sync_utilizadores_empresa ON public.utilizadores;
        CREATE TRIGGER trg_01_sync_utilizadores_empresa
        BEFORE INSERT OR UPDATE ON public.utilizadores
        FOR EACH ROW EXECUTE FUNCTION public.sync_utilizadores_empresa();
    END IF;

    -- Relacionamento 1: utilizadores.company_id -> company_settings(id)
    SELECT data_type INTO v_col_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'utilizadores' AND column_name = 'company_id';
    IF v_col_type = v_comp_id_type AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_utilizadores_company') THEN
        ALTER TABLE public.utilizadores
            ADD CONSTRAINT fk_utilizadores_company
            FOREIGN KEY (company_id) REFERENCES public.company_settings(id)
            ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
    END IF;

    -- Relacionamento 2: sellers.company_id -> company_settings(id)
    SELECT data_type INTO v_col_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sellers' AND column_name = 'company_id';
    IF v_col_type = v_comp_id_type AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sellers_company') THEN
        ALTER TABLE public.sellers
            ADD CONSTRAINT fk_sellers_company
            FOREIGN KEY (company_id) REFERENCES public.company_settings(id)
            ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
    END IF;

    -- Relacionamento 3: clients.company_id -> company_settings(id)
    SELECT data_type INTO v_col_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'company_id';
    IF v_col_type = v_comp_id_type AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_clients_company') THEN
        ALTER TABLE public.clients
            ADD CONSTRAINT fk_clients_company
            FOREIGN KEY (company_id) REFERENCES public.company_settings(id)
            ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
    END IF;

    -- Relacionamento 4: clients.created_by_seller_id -> sellers(id)
    SELECT data_type INTO v_col_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'created_by_seller_id';
    IF v_col_type = v_sellers_id_type AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_clients_seller') THEN
        ALTER TABLE public.clients
            ADD CONSTRAINT fk_clients_seller
            FOREIGN KEY (created_by_seller_id) REFERENCES public.sellers(id)
            ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
    END IF;

    -- Relacionamento 5: debts.company_id -> company_settings(id)
    SELECT data_type INTO v_col_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'debts' AND column_name = 'company_id';
    IF v_col_type = v_comp_id_type AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_debts_company') THEN
        ALTER TABLE public.debts
            ADD CONSTRAINT fk_debts_company
            FOREIGN KEY (company_id) REFERENCES public.company_settings(id)
            ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
    END IF;

    -- Relacionamento 6: debts.client_id -> clients(id)
    SELECT data_type INTO v_col_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'debts' AND column_name = 'client_id';
    IF v_col_type = v_clients_id_type AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_debts_client') THEN
        ALTER TABLE public.debts
            ADD CONSTRAINT fk_debts_client
            FOREIGN KEY (client_id) REFERENCES public.clients(id)
            ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
    END IF;

    -- Relacionamento 7: debts.seller_id -> sellers(id)
    SELECT data_type INTO v_col_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'debts' AND column_name = 'seller_id';
    IF v_col_type = v_sellers_id_type AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_debts_seller') THEN
        ALTER TABLE public.debts
            ADD CONSTRAINT fk_debts_seller
            FOREIGN KEY (seller_id) REFERENCES public.sellers(id)
            ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
    END IF;

    -- Relacionamento 8: debt_items.debt_id -> debts(id)
    SELECT data_type INTO v_col_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'debt_items' AND column_name = 'debt_id';
    IF v_col_type = v_debts_id_type AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_debt_items_debt') THEN
        ALTER TABLE public.debt_items
            ADD CONSTRAINT fk_debt_items_debt
            FOREIGN KEY (debt_id) REFERENCES public.debts(id)
            ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
    END IF;

    -- Relacionamento 9: payments.debt_id -> debts(id)
    SELECT data_type INTO v_col_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'debt_id';
    IF v_col_type = v_debts_id_type AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_debt') THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT fk_payments_debt
            FOREIGN KEY (debt_id) REFERENCES public.debts(id)
            ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
    END IF;

    -- Relacionamento 10: audit_trail.company_id -> company_settings(id)
    SELECT data_type INTO v_col_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_trail' AND column_name = 'company_id';
    IF v_col_type = v_comp_id_type AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_trail_company') THEN
        ALTER TABLE public.audit_trail
            ADD CONSTRAINT fk_audit_trail_company
            FOREIGN KEY (company_id) REFERENCES public.company_settings(id)
            ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
    END IF;

    -- Relacionamento 11: audit_trail.debt_id -> debts(id)
    SELECT data_type INTO v_col_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_trail' AND column_name = 'debt_id';
    IF v_col_type = v_debts_id_type AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_trail_debt') THEN
        ALTER TABLE public.audit_trail
            ADD CONSTRAINT fk_audit_trail_debt
            FOREIGN KEY (debt_id) REFERENCES public.debts(id)
            ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
    END IF;
END $$;

-- --------------------------------------------------------------------
-- 3. ÍNDICES DE PERFORMANCE MULTIEMPRESA E RELACIONAIS
-- --------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_utilizadores_company ON public.utilizadores(company_id);
CREATE INDEX IF NOT EXISTS idx_sellers_company ON public.sellers(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_company ON public.clients(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_seller ON public.clients(created_by_seller_id);
CREATE INDEX IF NOT EXISTS idx_debts_client_id ON public.debts(client_id);
CREATE INDEX IF NOT EXISTS idx_debts_seller_id ON public.debts(seller_id);
CREATE INDEX IF NOT EXISTS idx_debts_company ON public.debts(company_id);
CREATE INDEX IF NOT EXISTS idx_debts_due_date ON public.debts(due_date);
CREATE INDEX IF NOT EXISTS idx_debts_status ON public.debts(status);
CREATE INDEX IF NOT EXISTS idx_audit_company ON public.audit_trail(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_debt_id ON public.audit_trail(debt_id);
CREATE INDEX IF NOT EXISTS idx_payments_debt_id ON public.payments(debt_id);
CREATE INDEX IF NOT EXISTS idx_debt_items_debt_id ON public.debt_items(debt_id);

-- --------------------------------------------------------------------
-- 4. TRIGGER DE SEGURANÇA:
--    a) Protege o Super Administrador existente (bamidia@gmail.com / 8b9f3c41-c996-4764-87c2-9d82411584e1)
--    b) Impede qualquer utilizador de alterar o próprio perfil, permissões ou empresa
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_self_privilege_change()
RETURNS TRIGGER AS $$
DECLARE
    v_old JSONB := to_jsonb(OLD);
    v_new JSONB := to_jsonb(NEW);
    v_is_admin_ctx BOOLEAN := (
        current_setting('role', true) = 'service_role'
        OR (auth.uid() IS NULL AND current_user IN ('postgres', 'supabase_admin'))
    );
BEGIN
    IF OLD.id::text = '8b9f3c41-c996-4764-87c2-9d82411584e1' AND NOT v_is_admin_ctx THEN
        IF (v_new->>'role') IS DISTINCT FROM (v_old->>'role')
           OR (v_new->>'perfil') IS DISTINCT FROM (v_old->>'perfil')
           OR (v_new->>'tipo') IS DISTINCT FROM (v_old->>'tipo')
           OR (v_new->>'company_id') IS DISTINCT FROM (v_old->>'company_id')
           OR (v_new->>'empresa_id') IS DISTINCT FROM (v_old->>'empresa_id')
           OR (v_new->>'email') IS DISTINCT FROM (v_old->>'email') THEN
            RAISE EXCEPTION 'A conta do Super Administrador principal está protegida.';
        END IF;
    END IF;

    IF auth.uid() IS NOT NULL
       AND OLD.id::text = auth.uid()::text
       AND current_setting('role', true) <> 'service_role' THEN
        IF (v_new->>'role') IS DISTINCT FROM (v_old->>'role')
           OR (v_new->>'perfil') IS DISTINCT FROM (v_old->>'perfil')
           OR (v_new->>'tipo') IS DISTINCT FROM (v_old->>'tipo')
           OR (v_new->>'company_id') IS DISTINCT FROM (v_old->>'company_id')
           OR (v_new->>'empresa_id') IS DISTINCT FROM (v_old->>'empresa_id')
           OR (v_new->>'ativo') IS DISTINCT FROM (v_old->>'ativo')
           OR (v_new->>'active') IS DISTINCT FROM (v_old->>'active')
           OR (v_new->>'is_active') IS DISTINCT FROM (v_old->>'is_active')
           OR (v_new->>'estado') IS DISTINCT FROM (v_old->>'estado')
           OR (v_new->>'status') IS DISTINCT FROM (v_old->>'status') THEN
            RAISE EXCEPTION 'Nenhum utilizador pode alterar o próprio perfil, permissões ou empresa.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_self_privilege_change ON public.utilizadores;
CREATE TRIGGER trg_prevent_self_privilege_change
BEFORE UPDATE ON public.utilizadores
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_privilege_change();

CREATE OR REPLACE FUNCTION public.sync_utilizadores_estado()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
    v_active BOOLEAN;
    v_status TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Sincronizar papel: role <-> perfil <-> tipo
        IF NULLIF(trim(NEW.role), '') IS NOT NULL AND lower(trim(NEW.role)) <> 'vendedor' THEN
            v_role := lower(trim(NEW.role));
        ELSIF NULLIF(trim(NEW.perfil), '') IS NOT NULL AND lower(trim(NEW.perfil)) <> 'vendedor' THEN
            v_role := lower(trim(NEW.perfil));
        ELSIF NULLIF(trim(NEW.tipo), '') IS NOT NULL AND lower(trim(NEW.tipo)) <> 'vendedor' THEN
            v_role := lower(trim(NEW.tipo));
        ELSE
            v_role := COALESCE(NULLIF(lower(trim(NEW.role)), ''), NULLIF(lower(trim(NEW.perfil)), ''), NULLIF(lower(trim(NEW.tipo)), ''), 'vendedor');
        END IF;

        IF v_role NOT IN ('super_admin', 'admin_geral', 'vendedor') THEN
            IF v_role IN ('admin', 'administrador', 'company_admin') THEN
                v_role := 'admin_geral';
            ELSIF v_role = 'superadmin' THEN
                v_role := 'super_admin';
            ELSE
                v_role := 'vendedor';
            END IF;
        END IF;
        NEW.role := v_role;
        NEW.perfil := v_role;
        NEW.tipo := v_role;

        -- Sincronizar estado: ativo <-> estado <-> status <-> active <-> is_active
        IF NEW.ativo = FALSE OR NEW.active = FALSE OR NEW.is_active = FALSE
           OR lower(COALESCE(NEW.estado, '')) IN ('inativo', 'bloqueado', 'suspenso')
           OR lower(COALESCE(NEW.status, '')) IN ('inativo', 'bloqueado', 'suspenso') THEN
            v_active := FALSE;
        ELSE
            v_active := TRUE;
        END IF;

        IF NOT v_active AND lower(COALESCE(NEW.estado, '')) IN ('inativo', 'bloqueado', 'suspenso') THEN
            v_status := lower(NEW.estado);
        ELSIF NOT v_active AND lower(COALESCE(NEW.status, '')) IN ('inativo', 'bloqueado', 'suspenso') THEN
            v_status := lower(NEW.status);
        ELSE
            v_status := CASE WHEN v_active THEN 'ativo' ELSE 'inativo' END;
        END IF;

        NEW.ativo := v_active;
        NEW.active := v_active;
        NEW.is_active := v_active;
        NEW.estado := v_status;
        NEW.status := v_status;

        NEW.nome := COALESCE(NULLIF(trim(NEW.nome), ''), NULLIF(trim(NEW.name), ''), split_part(NEW.email, '@', 1), 'Utilizador');
        NEW.name := NEW.nome;
        NEW.telefone := COALESCE(NEW.telefone, NEW.phone, '');
        NEW.phone := NEW.telefone;
        NEW.branch := COALESCE(NULLIF(trim(NEW.branch), ''), NULLIF(trim(NEW.filial), ''), 'Sede');
        NEW.filial := NEW.branch;
        NEW.seller_id := COALESCE(NULLIF(trim(NEW.seller_id), ''), NULLIF(trim(NEW.vendedor_id), ''), NEW.id::text);
        NEW.vendedor_id := NEW.seller_id;
    ELSE
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            v_role := COALESCE(NULLIF(lower(trim(NEW.role)), ''), OLD.role, 'vendedor');
        ELSIF NEW.perfil IS DISTINCT FROM OLD.perfil THEN
            v_role := COALESCE(NULLIF(lower(trim(NEW.perfil)), ''), OLD.perfil, 'vendedor');
        ELSIF NEW.tipo IS DISTINCT FROM OLD.tipo THEN
            v_role := COALESCE(NULLIF(lower(trim(NEW.tipo)), ''), OLD.tipo, 'vendedor');
        ELSE
            v_role := COALESCE(NULLIF(lower(trim(NEW.role)), ''), NULLIF(lower(trim(NEW.perfil)), ''), 'vendedor');
        END IF;

        IF v_role NOT IN ('super_admin', 'admin_geral', 'vendedor') THEN
            IF v_role IN ('admin', 'administrador', 'company_admin') THEN
                v_role := 'admin_geral';
            ELSIF v_role = 'superadmin' THEN
                v_role := 'super_admin';
            ELSE
                v_role := 'vendedor';
            END IF;
        END IF;
        NEW.role := v_role;
        NEW.perfil := v_role;
        NEW.tipo := v_role;

        IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
            v_active := COALESCE(NEW.ativo, TRUE);
        ELSIF NEW.active IS DISTINCT FROM OLD.active THEN
            v_active := COALESCE(NEW.active, TRUE);
        ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
            v_active := COALESCE(NEW.is_active, TRUE);
        ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
            v_active := (lower(COALESCE(NEW.estado, 'ativo')) NOT IN ('inativo', 'bloqueado', 'suspenso'));
        ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
            v_active := (lower(COALESCE(NEW.status, 'ativo')) NOT IN ('inativo', 'bloqueado', 'suspenso'));
        ELSE
            v_active := COALESCE(NEW.ativo, TRUE);
        END IF;

        IF NOT v_active AND lower(COALESCE(NEW.estado, '')) IN ('inativo', 'bloqueado', 'suspenso') THEN
            v_status := lower(NEW.estado);
        ELSIF NOT v_active AND lower(COALESCE(NEW.status, '')) IN ('inativo', 'bloqueado', 'suspenso') THEN
            v_status := lower(NEW.status);
        ELSE
            v_status := CASE WHEN v_active THEN 'ativo' ELSE 'inativo' END;
        END IF;

        NEW.ativo := v_active;
        NEW.active := v_active;
        NEW.is_active := v_active;
        NEW.estado := v_status;
        NEW.status := v_status;

        IF NEW.nome IS DISTINCT FROM OLD.nome THEN
            NEW.name := NEW.nome;
        ELSIF NEW.name IS DISTINCT FROM OLD.name THEN
            NEW.nome := NEW.name;
        ELSE
            NEW.name := COALESCE(NEW.name, NEW.nome);
        END IF;

        IF NEW.telefone IS DISTINCT FROM OLD.telefone THEN
            NEW.phone := NEW.telefone;
        ELSIF NEW.phone IS DISTINCT FROM OLD.phone THEN
            NEW.telefone := NEW.phone;
        END IF;

        IF NEW.branch IS DISTINCT FROM OLD.branch THEN
            NEW.filial := NEW.branch;
        ELSIF NEW.filial IS DISTINCT FROM OLD.filial THEN
            NEW.branch := NEW.filial;
        END IF;

        NEW.seller_id := COALESCE(NULLIF(trim(NEW.seller_id), ''), NULLIF(trim(NEW.vendedor_id), ''), NEW.id::text);
        NEW.vendedor_id := NEW.seller_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_00_sync_utilizadores_estado ON public.utilizadores;
CREATE TRIGGER trg_00_sync_utilizadores_estado
BEFORE INSERT OR UPDATE ON public.utilizadores
FOR EACH ROW EXECUTE FUNCTION public.sync_utilizadores_estado();

-- --------------------------------------------------------------------
-- 5. PRESERVAÇÃO E VALIDAÇÃO DE FUNÇÕES SQL
--    Preserva public.is_super_admin(), current_company_id() e is_company_admin()
--    quando compatíveis com a estrutura atual; corrige automaticamente
--    divergências de tipo (ex.: erro 42P13 uuid vs text em current_company_id).
-- --------------------------------------------------------------------
DO $$
DECLARE
    v_curr_comp_ret TEXT;
    v_util_comp_type TEXT;
BEGIN
    SELECT data_type INTO v_util_comp_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'utilizadores' AND column_name = 'company_id';

    SELECT pg_get_function_result(p.oid) INTO v_curr_comp_ret
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_company_id' AND p.pronargs = 0
    LIMIT 1;

    -- Se current_company_id() existente retorna uuid enquanto utilizadores.company_id é text (erro 42P13), recriar como TEXT
    IF v_curr_comp_ret = 'uuid' AND COALESCE(v_util_comp_type, 'text') <> 'uuid' THEN
        DROP FUNCTION IF EXISTS public.current_company_id() CASCADE;
        v_curr_comp_ret := NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'is_super_admin'
    ) THEN
        EXECUTE $fn$
            CREATE FUNCTION public.is_super_admin()
            RETURNS BOOLEAN
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = public
            AS $body$
                SELECT EXISTS (
                    SELECT 1 FROM public.utilizadores u
                    WHERE (u.id = auth.uid() OR u.auth_user_id = auth.uid() OR u.user_id = auth.uid())
                      AND lower(coalesce(u.role, u.perfil, '')) = 'super_admin'
                      AND coalesce(u.ativo, true) = true
                      AND lower(coalesce(u.estado, u.status, 'ativo')) NOT IN ('inativo', 'bloqueado', 'suspenso')
                );
            $body$;
        $fn$;
    END IF;

    IF v_curr_comp_ret IS NULL THEN
        EXECUTE $fn$
            CREATE FUNCTION public.current_company_id()
            RETURNS TEXT
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = public
            AS $body$
                SELECT COALESCE(u.company_id::text, u.empresa_id::text)
                FROM public.utilizadores u
                WHERE (u.id = auth.uid() OR u.auth_user_id = auth.uid() OR u.user_id = auth.uid())
                  AND coalesce(u.ativo, true) = true
                  AND lower(coalesce(u.estado, u.status, 'ativo')) NOT IN ('inativo', 'bloqueado', 'suspenso')
                LIMIT 1;
            $body$;
        $fn$;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'is_company_admin'
    ) THEN
        EXECUTE $fn$
            CREATE FUNCTION public.is_company_admin()
            RETURNS BOOLEAN
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = public
            AS $body$
                SELECT EXISTS (
                    SELECT 1 FROM public.utilizadores u
                    WHERE (u.id = auth.uid() OR u.auth_user_id = auth.uid() OR u.user_id = auth.uid())
                      AND lower(coalesce(u.role, u.perfil, '')) IN ('admin_geral', 'super_admin')
                      AND coalesce(u.ativo, true) = true
                      AND lower(coalesce(u.estado, u.status, 'ativo')) NOT IN ('inativo', 'bloqueado', 'suspenso')
                );
            $body$;
        $fn$;
    END IF;
END $$;

-- Funções auxiliares seguras (preservam as funções existentes sem conflito de assinatura)
CREATE OR REPLACE FUNCTION public.is_active_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.utilizadores u
        WHERE (u.id = auth.uid() OR u.auth_user_id = auth.uid() OR u.user_id = auth.uid())
          AND lower(coalesce(u.role, u.perfil, u.tipo, '')) IN ('super_admin', 'superadmin')
          AND coalesce(u.ativo, true) = true
          AND coalesce(u.active, true) = true
          AND coalesce(u.is_active, true) = true
          AND lower(coalesce(u.estado, u.status, 'ativo')) NOT IN ('inativo', 'bloqueado', 'suspenso')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_active_company_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.utilizadores u
        WHERE (u.id = auth.uid() OR u.auth_user_id = auth.uid() OR u.user_id = auth.uid())
          AND lower(coalesce(u.role, u.perfil, u.tipo, '')) IN ('admin_geral', 'super_admin', 'superadmin')
          AND coalesce(u.ativo, true) = true
          AND coalesce(u.active, true) = true
          AND coalesce(u.is_active, true) = true
          AND lower(coalesce(u.estado, u.status, 'ativo')) NOT IN ('inativo', 'bloqueado', 'suspenso')
    );
$$;

CREATE OR REPLACE FUNCTION public.app_current_company_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(u.company_id::text, u.empresa_id::text)
    FROM public.utilizadores u
    WHERE (u.id = auth.uid() OR u.auth_user_id = auth.uid() OR u.user_id = auth.uid())
      AND coalesce(u.ativo, true) = true
      AND coalesce(u.active, true) = true
      AND coalesce(u.is_active, true) = true
      AND lower(coalesce(u.estado, u.status, 'ativo')) NOT IN ('inativo', 'bloqueado', 'suspenso')
    LIMIT 1;
$$;

-- --------------------------------------------------------------------
-- 6. PERMISSÕES DE TABELA & RLS MULTIEMPRESA BASEADO EM auth.uid()
-- --------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.company_settings,
    public.utilizadores,
    public.sellers,
    public.clients,
    public.debts,
    public.debt_items,
    public.payments,
    public.audit_trail,
    public.kwanzacobro_sync
TO authenticated;

-- Remove quaisquer políticas antigas (incluindo políticas RESTRICTIVE herdadas) antes de recriar as políticas oficiais
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'utilizadores', 'company_settings', 'sellers', 'clients',
              'debts', 'debt_items', 'payments', 'audit_trail', 'kwanzacobro_sync'
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

ALTER TABLE public.utilizadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "utilizadores_select_policy" ON public.utilizadores
FOR SELECT USING (
    id::text = auth.uid()::text
    OR auth_user_id::text = auth.uid()::text
    OR user_id::text = auth.uid()::text
    OR public.is_super_admin()
    OR public.is_active_super_admin()
    OR (
        (public.is_company_admin() OR public.is_active_company_admin())
        AND company_id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
    )
);

CREATE POLICY "utilizadores_insert_policy" ON public.utilizadores
FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR public.is_active_super_admin()
    OR (
        (public.is_company_admin() OR public.is_active_company_admin())
        AND company_id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
    )
);

CREATE POLICY "utilizadores_update_policy" ON public.utilizadores
FOR UPDATE USING (
    ((public.is_super_admin() OR public.is_active_super_admin()) AND id::text <> '8b9f3c41-c996-4764-87c2-9d82411584e1')
    OR (
        (public.is_company_admin() OR public.is_active_company_admin())
        AND company_id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
        AND id::text <> auth.uid()::text
    )
);

CREATE POLICY "utilizadores_delete_policy" ON public.utilizadores
FOR DELETE USING (
    (public.is_super_admin() OR public.is_active_super_admin())
    AND id::text <> '8b9f3c41-c996-4764-87c2-9d82411584e1'
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_select_policy" ON public.company_settings
FOR SELECT USING (
    public.is_super_admin()
    OR public.is_active_super_admin()
    OR id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
);

CREATE POLICY "company_write_policy" ON public.company_settings
FOR ALL USING (
    public.is_super_admin()
    OR public.is_active_super_admin()
    OR (
        (public.is_company_admin() OR public.is_active_company_admin())
        AND id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
    )
) WITH CHECK (
    public.is_super_admin()
    OR public.is_active_super_admin()
    OR (
        (public.is_company_admin() OR public.is_active_company_admin())
        AND id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
    )
);

ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sellers_tenant_policy" ON public.sellers
FOR ALL USING (
    public.is_super_admin()
    OR public.is_active_super_admin()
    OR company_id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
) WITH CHECK (
    public.is_super_admin()
    OR public.is_active_super_admin()
    OR company_id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_tenant_policy" ON public.clients
FOR ALL USING (
    public.is_super_admin()
    OR public.is_active_super_admin()
    OR company_id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
) WITH CHECK (
    public.is_super_admin()
    OR public.is_active_super_admin()
    OR company_id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "debts_tenant_policy" ON public.debts
FOR ALL USING (
    public.is_super_admin()
    OR public.is_active_super_admin()
    OR company_id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
) WITH CHECK (
    public.is_super_admin()
    OR public.is_active_super_admin()
    OR company_id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
);

ALTER TABLE public.debt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "debt_items_tenant_policy" ON public.debt_items
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.debts d
        WHERE d.id::text = debt_id::text
          AND (
              public.is_super_admin()
              OR public.is_active_super_admin()
              OR d.company_id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
          )
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.debts d
        WHERE d.id::text = debt_id::text
          AND (
              public.is_super_admin()
              OR public.is_active_super_admin()
              OR d.company_id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
          )
    )
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_tenant_policy" ON public.payments
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.debts d
        WHERE d.id::text = debt_id::text
          AND (
              public.is_super_admin()
              OR public.is_active_super_admin()
              OR d.company_id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
          )
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.debts d
        WHERE d.id::text = debt_id::text
          AND (
              public.is_super_admin()
              OR public.is_active_super_admin()
              OR d.company_id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
          )
    )
);

ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_trail_tenant_policy" ON public.audit_trail
FOR ALL USING (
    public.is_super_admin()
    OR public.is_active_super_admin()
    OR company_id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
) WITH CHECK (
    public.is_super_admin()
    OR public.is_active_super_admin()
    OR company_id::text = COALESCE(public.current_company_id()::text, public.app_current_company_id())
);

ALTER TABLE public.kwanzacobro_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kwanzacobro_sync_super_admin_only" ON public.kwanzacobro_sync
FOR ALL USING (public.is_super_admin() OR public.is_active_super_admin())
WITH CHECK (public.is_super_admin() OR public.is_active_super_admin());

-- --------------------------------------------------------------------
-- 7. TRIGGER & RPC DE AUTO-REGISTO SEGURO (Supabase Auth signUp -> Empresa + Perfil)
--    Cria empresa isolada + utilizador admin_geral apenas quando self_register=true.
--    Nunca permite auto-registo como super_admin.
--    Suporta id/company_id em TEXT ou UUID sem gerar erro no Auth.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
    v_is_self_register BOOLEAN := COALESCE((v_meta->>'self_register')::boolean, false);
    v_comp_uuid UUID := gen_random_uuid();
    v_comp_id_type TEXT;
    v_sellers_comp_type TEXT;
    v_sellers_id_type TEXT;
    v_name TEXT := COALESCE(NULLIF(trim(v_meta->>'name'), ''), split_part(NEW.email, '@', 1), 'Utilizador');
    v_company_name TEXT := COALESCE(NULLIF(trim(v_meta->>'company_name'), ''), 'Empresa ' || split_part(NEW.email, '@', 1));
    v_phone TEXT := COALESCE(NULLIF(trim(v_meta->>'phone'), ''), '+244 ');
    v_nif TEXT := COALESCE(trim(v_meta->>'nif'), '');
    v_branch TEXT := COALESCE(NULLIF(trim(v_meta->>'branch'), ''), 'Sede');
BEGIN
    -- Nunca interferir em contas criadas administrativamente sem self_register
    IF NOT v_is_self_register THEN
        RETURN NEW;
    END IF;

    -- Proteger conta do Super Administrador principal
    IF NEW.id::text = '8b9f3c41-c996-4764-87c2-9d82411584e1' OR lower(NEW.email) = 'bamidia@gmail.com' THEN
        RETURN NEW;
    END IF;

    -- Se já existe em public.utilizadores, não duplicar
    IF EXISTS (SELECT 1 FROM public.utilizadores WHERE id = NEW.id) THEN
        RETURN NEW;
    END IF;

    BEGIN
        SELECT data_type INTO v_comp_id_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'company_settings' AND column_name = 'id';

        IF v_comp_id_type = 'uuid' THEN
            INSERT INTO public.company_settings (
                id, name, nif, phone, email, city, currency, status, super_admin_id
            ) VALUES (
                v_comp_uuid, v_company_name, v_nif, v_phone, lower(NEW.email), 'Luanda, Angola', 'Kz', 'ativo', '8b9f3c41-c996-4764-87c2-9d82411584e1'
            ) ON CONFLICT (id) DO NOTHING;

            INSERT INTO public.utilizadores (
                id, nome, email, telefone, role, perfil, company_id, ativo, estado, status, branch, seller_id
            ) VALUES (
                NEW.id, v_name, lower(NEW.email), v_phone, 'admin_geral', 'admin_geral', v_comp_uuid, TRUE, 'ativo', 'ativo', v_branch, NEW.id::text
            ) ON CONFLICT (id) DO NOTHING;
        ELSE
            INSERT INTO public.company_settings (
                id, name, nif, phone, email, city, currency, status, super_admin_id
            ) VALUES (
                v_comp_uuid::text, v_company_name, v_nif, v_phone, lower(NEW.email), 'Luanda, Angola', 'Kz', 'ativo', '8b9f3c41-c996-4764-87c2-9d82411584e1'
            ) ON CONFLICT (id) DO NOTHING;

            INSERT INTO public.utilizadores (
                id, nome, email, telefone, role, perfil, company_id, ativo, estado, status, branch, seller_id
            ) VALUES (
                NEW.id, v_name, lower(NEW.email), v_phone, 'admin_geral', 'admin_geral', v_comp_uuid::text, TRUE, 'ativo', 'ativo', v_branch, NEW.id::text
            ) ON CONFLICT (id) DO NOTHING;
        END IF;

        SELECT data_type INTO v_sellers_id_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sellers' AND column_name = 'id';

        SELECT data_type INTO v_sellers_comp_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sellers' AND column_name = 'company_id';

        IF v_sellers_id_type = 'uuid' AND v_sellers_comp_type = 'uuid' THEN
            INSERT INTO public.sellers (id, name, phone, branch, email, role, company_id, is_active)
            VALUES (NEW.id, v_name, v_phone, v_branch, lower(NEW.email), 'admin_geral', v_comp_uuid, TRUE)
            ON CONFLICT (id) DO NOTHING;
        ELSIF v_sellers_comp_type = 'uuid' THEN
            INSERT INTO public.sellers (id, name, phone, branch, email, role, company_id, is_active)
            VALUES (NEW.id::text, v_name, v_phone, v_branch, lower(NEW.email), 'admin_geral', v_comp_uuid, TRUE)
            ON CONFLICT (id) DO NOTHING;
        ELSE
            INSERT INTO public.sellers (id, name, phone, branch, email, role, company_id, is_active)
            VALUES (NEW.id::text, v_name, v_phone, v_branch, lower(NEW.email), 'admin_geral', v_comp_uuid::text, TRUE)
            ON CONFLICT (id) DO NOTHING;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Nunca bloquear criação do utilizador no Supabase Auth; o onboarding conclui via complete_company_registration()
        RAISE WARNING 'handle_new_auth_user fallback notice: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created_neurojus ON auth.users;
CREATE TRIGGER on_auth_user_created_neurojus
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- RPC idempotente para concluir o onboarding da empresa após o registo/login no Supabase Auth
-- (funciona mesmo sem SUPABASE_SERVICE_ROLE_KEY no servidor).
CREATE OR REPLACE FUNCTION public.complete_company_registration(
    p_name TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_company_name TEXT DEFAULT NULL,
    p_nif TEXT DEFAULT '',
    p_branch TEXT DEFAULT 'Sede'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_email TEXT;
    v_existing public.utilizadores%ROWTYPE;
    v_existing_comp JSONB;
    v_comp_uuid UUID := gen_random_uuid();
    v_comp_id_type TEXT;
    v_sellers_id_type TEXT;
    v_sellers_comp_type TEXT;
    v_name TEXT;
    v_phone TEXT;
    v_company_name TEXT;
    v_nif TEXT;
    v_branch TEXT;
    v_created_user public.utilizadores%ROWTYPE;
    v_created_comp JSONB;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sessão não autenticada.';
    END IF;

    SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'Conta Supabase Auth não encontrada.';
    END IF;

    IF v_uid::text = '8b9f3c41-c996-4764-87c2-9d82411584e1' OR v_email = 'bamidia@gmail.com' THEN
        RAISE EXCEPTION 'A conta do Super Administrador principal está protegida.';
    END IF;

    -- Se o perfil já existir, retorna-o de forma idempotente (nunca eleva permissões nem cria empresa duplicada)
    SELECT * INTO v_existing FROM public.utilizadores WHERE id = v_uid;
    IF FOUND THEN
        SELECT to_jsonb(c) INTO v_existing_comp
        FROM public.company_settings c
        WHERE c.id::text = v_existing.company_id::text
        LIMIT 1;

        RETURN jsonb_build_object(
            'success', true,
            'alreadyExists', true,
            'user', to_jsonb(v_existing),
            'company', v_existing_comp
        );
    END IF;

    v_name := COALESCE(NULLIF(trim(p_name), ''), split_part(v_email, '@', 1), 'Administrador');
    v_phone := COALESCE(NULLIF(trim(p_phone), ''), '+244 ');
    v_company_name := COALESCE(NULLIF(trim(p_company_name), ''), 'Empresa ' || split_part(v_email, '@', 1));
    v_nif := COALESCE(trim(p_nif), '');
    v_branch := COALESCE(NULLIF(trim(p_branch), ''), 'Sede');

    SELECT data_type INTO v_comp_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_settings' AND column_name = 'id';

    IF v_comp_id_type = 'uuid' THEN
        INSERT INTO public.company_settings (
            id, name, nif, phone, email, address, city, currency, status, super_admin_id
        ) VALUES (
            v_comp_uuid, v_company_name, v_nif, v_phone, v_email, '', 'Luanda, Angola', 'Kz', 'ativo', '8b9f3c41-c996-4764-87c2-9d82411584e1'
        );

        INSERT INTO public.utilizadores (
            id, nome, email, telefone, role, perfil, company_id, ativo, estado, status, branch, seller_id
        ) VALUES (
            v_uid, v_name, v_email, v_phone, 'admin_geral', 'admin_geral', v_comp_uuid, TRUE, 'ativo', 'ativo', v_branch, v_uid::text
        )
        RETURNING * INTO v_created_user;
    ELSE
        INSERT INTO public.company_settings (
            id, name, nif, phone, email, address, city, currency, status, super_admin_id
        ) VALUES (
            v_comp_uuid::text, v_company_name, v_nif, v_phone, v_email, '', 'Luanda, Angola', 'Kz', 'ativo', '8b9f3c41-c996-4764-87c2-9d82411584e1'
        );

        INSERT INTO public.utilizadores (
            id, nome, email, telefone, role, perfil, company_id, ativo, estado, status, branch, seller_id
        ) VALUES (
            v_uid, v_name, v_email, v_phone, 'admin_geral', 'admin_geral', v_comp_uuid::text, TRUE, 'ativo', 'ativo', v_branch, v_uid::text
        )
        RETURNING * INTO v_created_user;
    END IF;

    SELECT data_type INTO v_sellers_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sellers' AND column_name = 'id';

    SELECT data_type INTO v_sellers_comp_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sellers' AND column_name = 'company_id';

    IF v_sellers_id_type = 'uuid' AND v_sellers_comp_type = 'uuid' THEN
        INSERT INTO public.sellers (id, name, phone, branch, email, role, company_id, is_active)
        VALUES (v_uid, v_name, v_phone, v_branch, v_email, 'admin_geral', v_comp_uuid, TRUE)
        ON CONFLICT (id) DO NOTHING;
    ELSIF v_sellers_comp_type = 'uuid' THEN
        INSERT INTO public.sellers (id, name, phone, branch, email, role, company_id, is_active)
        VALUES (v_uid::text, v_name, v_phone, v_branch, v_email, 'admin_geral', v_comp_uuid, TRUE)
        ON CONFLICT (id) DO NOTHING;
    ELSE
        INSERT INTO public.sellers (id, name, phone, branch, email, role, company_id, is_active)
        VALUES (v_uid::text, v_name, v_phone, v_branch, v_email, 'admin_geral', v_comp_uuid::text, TRUE)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    SELECT to_jsonb(c) INTO v_created_comp
    FROM public.company_settings c
    WHERE c.id::text = v_comp_uuid::text
    LIMIT 1;

    RETURN jsonb_build_object(
        'success', true,
        'alreadyExists', false,
        'user', to_jsonb(v_created_user),
        'company', v_created_comp
    );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_company_registration(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_company_registration(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- --------------------------------------------------------------------
-- 8. PRESERVAÇÃO SEGURA DE DADOS INICIAIS (SEM SOBRESCREVER EXISTENTES)
-- --------------------------------------------------------------------
DO $$
DECLARE
    v_comp_id_type TEXT;
    v_util_comp_type TEXT;
    v_default_comp_uuid UUID;
BEGIN
    SELECT data_type INTO v_comp_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_settings' AND column_name = 'id';

    SELECT data_type INTO v_util_comp_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'utilizadores' AND column_name = 'company_id';

    IF v_comp_id_type <> 'uuid' THEN
        INSERT INTO public.company_settings (id, name, email, city, currency, status, super_admin_id)
        SELECT 'default_company', 'NEUROJUS / KwanzaCobro - Sede Principal', 'contacto@kwanzacobro.ao', 'Luanda, Angola', 'Kz', 'ativo', '8b9f3c41-c996-4764-87c2-9d82411584e1'
        WHERE NOT EXISTS (SELECT 1 FROM public.company_settings WHERE id = 'default_company');
    END IF;

    -- Garante perfil para o Super Administrador preservado (por UUID ou e-mail bamidia@gmail.com)
    IF v_util_comp_type = 'uuid' THEN
        SELECT id::uuid INTO v_default_comp_uuid FROM public.company_settings LIMIT 1;
        INSERT INTO public.utilizadores (id, nome, email, role, perfil, tipo, company_id, ativo, estado, status, branch)
        SELECT au.id,
               COALESCE(NULLIF(au.raw_user_meta_data->>'name', ''), 'Super Administrador NEUROJUS'),
               lower(au.email),
               'super_admin', 'super_admin', 'super_admin',
               v_default_comp_uuid,
               TRUE, 'ativo', 'ativo', 'Sede Principal'
        FROM auth.users au
        WHERE (au.id = '8b9f3c41-c996-4764-87c2-9d82411584e1'::uuid OR lower(au.email) = 'bamidia@gmail.com')
          AND NOT EXISTS (SELECT 1 FROM public.utilizadores u WHERE u.id = au.id OR lower(u.email) = lower(au.email))
        ON CONFLICT DO NOTHING;
    ELSE
        INSERT INTO public.utilizadores (id, nome, email, role, perfil, tipo, company_id, ativo, estado, status, branch)
        SELECT au.id,
               COALESCE(NULLIF(au.raw_user_meta_data->>'name', ''), 'Super Administrador NEUROJUS'),
               lower(au.email),
               'super_admin', 'super_admin', 'super_admin',
               'default_company',
               TRUE, 'ativo', 'ativo', 'Sede Principal'
        FROM auth.users au
        WHERE (au.id = '8b9f3c41-c996-4764-87c2-9d82411584e1'::uuid OR lower(au.email) = 'bamidia@gmail.com')
          AND NOT EXISTS (SELECT 1 FROM public.utilizadores u WHERE u.id = au.id OR lower(u.email) = lower(au.email))
        ON CONFLICT DO NOTHING;
    END IF;
END $$;


