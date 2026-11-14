-- ============================================================================
-- Stocck-RMA: AUDITORIA DE SCHEMA (SOMENTE LEITURA)
-- Rode no SQL Editor do Supabase REAL. Não altera nada, não lê dados de negócio.
-- Devolve UMA célula JSON com a estrutura do banco (colunas, RLS, políticas,
-- índices, funções, buckets, tabelas do realtime e contagem aproximada de linhas).
-- Copie o resultado e cole no chat para comparar com o banco local.
-- ============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'columns', (
    SELECT jsonb_object_agg(table_name, cols) FROM (
      SELECT table_name,
             jsonb_agg(
               column_name || ':' || data_type
               || CASE WHEN is_nullable = 'NO' THEN ':notnull' ELSE '' END
               || COALESCE(':default=' || column_default, '')
               ORDER BY ordinal_position
             ) AS cols
      FROM information_schema.columns
      WHERE table_schema = 'public'
      GROUP BY table_name
    ) t
  ),
  'rls_enabled', (
    SELECT jsonb_object_agg(c.relname, c.relrowsecurity)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  ),
  'policies', (
    SELECT jsonb_agg(jsonb_build_object(
      'schema', schemaname, 'table', tablename, 'name', policyname,
      'cmd', cmd, 'roles', roles, 'using', qual, 'check', with_check
    ) ORDER BY schemaname, tablename, policyname)
    FROM pg_policies WHERE schemaname IN ('public', 'storage')
  ),
  'indexes', (
    SELECT jsonb_agg(indexdef ORDER BY indexname)
    FROM pg_indexes WHERE schemaname = 'public'
  ),
  'functions', (
    SELECT jsonb_agg(jsonb_build_object(
      'name', p.proname, 'security_definer', p.prosecdef, 'config', p.proconfig
    ) ORDER BY p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ),
  'buckets', (
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'public', public, 'file_size_limit', file_size_limit,
      'allowed_mime_types', allowed_mime_types
    )) FROM storage.buckets
  ),
  'realtime_tables', (
    SELECT jsonb_agg(tablename ORDER BY tablename)
    FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
  ),
  'anon_table_grants', (
    SELECT jsonb_agg(table_name || ':' || privilege_type ORDER BY table_name, privilege_type)
    FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_schema = 'public'
  ),
  'approx_row_counts', (
    SELECT jsonb_object_agg(relname, n_live_tup)
    FROM pg_stat_user_tables WHERE schemaname = 'public'
  ),
  'auth_user_count', (SELECT count(*) FROM auth.users),
  'public_users_roles', (
    SELECT jsonb_object_agg(role, qtd) FROM (
      SELECT coalesce(role, 'NULL') AS role, count(*) AS qtd FROM public.users GROUP BY role
    ) r
  )
)) AS auditoria_schema;
