-- ============================================================================
-- Stocck-RMA: REVERSÃO do endurecimento de RLS (volta ao acesso aberto anterior)
-- Use SOMENTE se o sistema travar após supabase_rls_hardening.sql.
-- ATENÇÃO: isto reabre o banco para qualquer pessoa com a chave anon.
-- ============================================================================

BEGIN;

GRANT ALL ON TABLE
  public.products, public.triage_units, public.pending_items, public.daily_inflows,
  public.cases, public.audit_logs, public.users, public.backup_snapshots
TO anon;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products','triage_units','pending_items','daily_inflows','cases','audit_logs','users','backup_snapshots']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_delete ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public access %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Public access %s" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS rls_pi_select ON storage.objects;
DROP POLICY IF EXISTS rls_pi_insert ON storage.objects;
DROP POLICY IF EXISTS rls_pi_update ON storage.objects;
DROP POLICY IF EXISTS rls_pi_delete ON storage.objects;
CREATE POLICY "Public storage select product-images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Public storage insert product-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "Public storage update product-images" ON storage.objects FOR UPDATE USING (bucket_id = 'product-images');
CREATE POLICY "Public storage delete product-images" ON storage.objects FOR DELETE USING (bucket_id = 'product-images');

GRANT EXECUTE ON FUNCTION public.get_stock_metrics() TO anon, PUBLIC;

DROP FUNCTION IF EXISTS public.app_role();

COMMIT;
