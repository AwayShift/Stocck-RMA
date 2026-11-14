-- ============================================================================
-- Stocck-RMA: ALINHAMENTO DE SCHEMA (aditivo e idempotente)
-- Gerado a partir da comparação entre o banco REAL e o schema do código.
-- Seguro rodar mais de uma vez. Não apaga nem altera dados existentes.
-- Rode no SQL Editor do Supabase REAL depois de revisar.
-- ============================================================================

BEGIN;

-- 1. triage_units: colunas que o schema do código prevê e o banco real não tem.
--    (O app compensa a ausência guardando esses valores em tags dentro de "notes";
--     com as colunas, o vínculo passa a ser consultável e indexado.)
ALTER TABLE public.triage_units ADD COLUMN IF NOT EXISTS pending_registration_number TEXT;
ALTER TABLE public.triage_units ADD COLUMN IF NOT EXISTS pending_item_id TEXT;

-- 2. Índices que existem no schema do código e faltam no banco real
CREATE INDEX IF NOT EXISTS idx_triage_units_pending_reg ON public.triage_units (pending_registration_number);
CREATE INDEX IF NOT EXISTS idx_pending_items_reg ON public.pending_items (registration_number);

-- 3. Padrão seguro para o papel: quem entrar sem papel explícito nasce somente leitura.
--    (Hoje o padrão da coluna é 'operator', o que daria gravação a um perfil criado sem papel.)
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'viewer';

COMMIT;

-- ============================================================================
-- OPCIONAL (decisão sua): habilitar Realtime nas tabelas do app.
-- Hoje o banco real NÃO publica nenhuma tabela no realtime, então o app só se
-- atualiza por sincronização periódica (foco da aba, a cada 5 min, botão Sincronizar).
-- Habilitar deixa as telas de outros usuários atualizarem na hora, mas consome
-- conexões/mensagens do plano. Descomente para aplicar:
--
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.triage_units;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_items;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_inflows;
-- ============================================================================
