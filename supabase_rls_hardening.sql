-- ============================================================================
-- Stocck-RMA: Endurecimento de segurança (Row Level Security por papel)
-- ----------------------------------------------------------------------------
-- COMO USAR: Supabase Dashboard > SQL Editor > cole TUDO > Run.
-- ANTES DE RODAR: confira os papéis com
--     SELECT email, role FROM users ORDER BY role, email;
-- Se algo travar, rode supabase_rls_rollback.sql para voltar ao estado anterior.
--
-- PAPÉIS (fonte da verdade: tabela public.users, coluna role):
--   admin    -> tudo
--   operator -> lê e grava dados operacionais; NÃO apaga backups nem gerencia usuários
--   viewer   -> somente leitura dos dados operacionais
--   (sem linha em users / sem login) -> nenhum acesso
-- ============================================================================

BEGIN;

-- 0. Trava de segurança: precisa existir ao menos 1 admin real (ligado ao Supabase Auth)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN auth.users a ON a.id::text = u.uid
    WHERE u.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Abortado: nenhum admin em public.users ligado a auth.users. Corrija os papéis antes de aplicar o RLS.';
  END IF;
END $$;

-- 1. Função auxiliar: papel do usuário logado, lido do BANCO (nunca do navegador)
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE uid = auth.uid()::text LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.app_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_role() TO authenticated;

-- 2. Remove a chave anon de qualquer acesso direto às tabelas (defesa em profundidade)
REVOKE ALL ON TABLE
  public.products, public.triage_units, public.pending_items, public.daily_inflows,
  public.cases, public.audit_logs, public.users, public.backup_snapshots
FROM anon;

-- 3. Tabelas operacionais: leitura (admin/operator/viewer), escrita e exclusão (admin/operator)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products','triage_units','pending_items','daily_inflows','cases']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public access %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS rls_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_delete ON public.%I', t);

    EXECUTE format($f$CREATE POLICY rls_select ON public.%I FOR SELECT TO authenticated
      USING (public.app_role() IN ('admin','operator','viewer'))$f$, t);
    EXECUTE format($f$CREATE POLICY rls_insert ON public.%I FOR INSERT TO authenticated
      WITH CHECK (public.app_role() IN ('admin','operator'))$f$, t);
    EXECUTE format($f$CREATE POLICY rls_update ON public.%I FOR UPDATE TO authenticated
      USING (public.app_role() IN ('admin','operator'))
      WITH CHECK (public.app_role() IN ('admin','operator'))$f$, t);
    EXECUTE format($f$CREATE POLICY rls_delete ON public.%I FOR DELETE TO authenticated
      USING (public.app_role() IN ('admin','operator'))$f$, t);
  END LOOP;
END $$;

-- 4. users: cada um vê a própria linha; só admin lista, promove e remove
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access users" ON public.users;
DROP POLICY IF EXISTS rls_select ON public.users;
DROP POLICY IF EXISTS rls_insert ON public.users;
DROP POLICY IF EXISTS rls_update ON public.users;
DROP POLICY IF EXISTS rls_delete ON public.users;

CREATE POLICY rls_select ON public.users FOR SELECT TO authenticated
  USING (uid = auth.uid()::text OR public.app_role() = 'admin');

-- Autocadastro SEMPRE como viewer, com o próprio uid e o próprio e-mail
CREATE POLICY rls_insert ON public.users FOR INSERT TO authenticated
  WITH CHECK (
    public.app_role() = 'admin'
    OR (
      uid = auth.uid()::text
      AND role = 'viewer'
      AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- Cada um atualiza a própria linha SEM mudar o papel; admin muda qualquer um
CREATE POLICY rls_update ON public.users FOR UPDATE TO authenticated
  USING (uid = auth.uid()::text OR public.app_role() = 'admin')
  WITH CHECK (
    public.app_role() = 'admin'
    OR (uid = auth.uid()::text AND role = public.app_role())
  );

CREATE POLICY rls_delete ON public.users FOR DELETE TO authenticated
  USING (public.app_role() = 'admin');

-- 5. audit_logs: imutável (sem update/delete); leitura admin/operator; escrita admin/operator
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS rls_select ON public.audit_logs;
DROP POLICY IF EXISTS rls_insert ON public.audit_logs;

CREATE POLICY rls_select ON public.audit_logs FOR SELECT TO authenticated
  USING (public.app_role() IN ('admin','operator'));
CREATE POLICY rls_insert ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.app_role() IN ('admin','operator')
    AND (user_id IS NULL OR user_id = auth.uid()::text)
  );

-- 6. backup_snapshots: operator só INSERE snapshots novos e edita as 2 linhas de configuração;
--    apagar/sobrescrever snapshots é exclusivo do admin
ALTER TABLE public.backup_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access backup_snapshots" ON public.backup_snapshots;
DROP POLICY IF EXISTS rls_select ON public.backup_snapshots;
DROP POLICY IF EXISTS rls_insert ON public.backup_snapshots;
DROP POLICY IF EXISTS rls_update ON public.backup_snapshots;
DROP POLICY IF EXISTS rls_delete ON public.backup_snapshots;

CREATE POLICY rls_select ON public.backup_snapshots FOR SELECT TO authenticated
  USING (public.app_role() IN ('admin','operator'));
CREATE POLICY rls_insert ON public.backup_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.app_role() IN ('admin','operator'));
CREATE POLICY rls_update ON public.backup_snapshots FOR UPDATE TO authenticated
  USING (
    public.app_role() = 'admin'
    OR (public.app_role() = 'operator' AND id IN ('config_system_integrations','config_backup_schedule'))
  )
  WITH CHECK (
    public.app_role() = 'admin'
    OR (public.app_role() = 'operator' AND id IN ('config_system_integrations','config_backup_schedule'))
  );
CREATE POLICY rls_delete ON public.backup_snapshots FOR DELETE TO authenticated
  USING (public.app_role() = 'admin');

-- 7. Storage (bucket product-images): leitura pública (bucket público); escrita só admin/operator logados
DROP POLICY IF EXISTS "Public storage select product-images" ON storage.objects;
DROP POLICY IF EXISTS "Public storage insert product-images" ON storage.objects;
DROP POLICY IF EXISTS "Public storage update product-images" ON storage.objects;
DROP POLICY IF EXISTS "Public storage delete product-images" ON storage.objects;
DROP POLICY IF EXISTS rls_pi_select ON storage.objects;
DROP POLICY IF EXISTS rls_pi_insert ON storage.objects;
DROP POLICY IF EXISTS rls_pi_update ON storage.objects;
DROP POLICY IF EXISTS rls_pi_delete ON storage.objects;

CREATE POLICY rls_pi_select ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');
CREATE POLICY rls_pi_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.app_role() IN ('admin','operator'));
CREATE POLICY rls_pi_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.app_role() IN ('admin','operator'))
  WITH CHECK (bucket_id = 'product-images' AND public.app_role() IN ('admin','operator'));
CREATE POLICY rls_pi_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.app_role() IN ('admin','operator'));

-- 8. RPC de métricas: só usuário logado e com search_path fixo
ALTER FUNCTION public.get_stock_metrics() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.get_stock_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stock_metrics() TO authenticated;

COMMIT;

-- ============================================================================
-- PROMOVER UM USUÁRIO (rode manualmente quando criar/liberar alguém):
--   UPDATE public.users SET role = 'operator' WHERE email = 'pessoa@empresa.com';
-- ============================================================================
