-- ============================================================================
-- Stocck-RMA: registro automático (auditoria) de criação, mudança e exclusão de PAPÉIS
-- ----------------------------------------------------------------------------
-- COMO USAR: Supabase Dashboard > SQL Editor > cole TUDO > Run. Seguro de rodar mais de uma vez.
-- Captura também promoções feitas direto por SQL (que o código do app não enxerga).
-- Os registros vão para public.audit_logs (imutável: só inserir e ler).
-- Consultar:
--   select timestamp, user_email, action, details from audit_logs order by timestamp desc limit 50;
-- Para remover: DROP TRIGGER trg_audit_user_roles ON public.users;
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text := auth.uid()::text;                       -- NULL quando rodado no SQL Editor
  v_actor_email text := auth.jwt() ->> 'email';
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, user_email, action, details)
    VALUES (v_actor, v_actor_email, 'USER_CREATED',
            'Perfil criado: ' || NEW.email || ' com papel ' || coalesce(NEW.role, 'NULL'));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      INSERT INTO public.audit_logs (user_id, user_email, action, details)
      VALUES (v_actor, v_actor_email, 'USER_ROLE_CHANGED',
              'Papel de ' || NEW.email || ': ' || coalesce(OLD.role, 'NULL') || ' -> ' || coalesce(NEW.role, 'NULL')
              || CASE WHEN v_actor IS NULL THEN ' (via SQL/painel)' ELSE '' END);
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO public.audit_logs (user_id, user_email, action, details)
    VALUES (v_actor, v_actor_email, 'USER_DELETED',
            'Perfil removido: ' || OLD.email || ' (papel ' || coalesce(OLD.role, 'NULL') || ')');
    RETURN OLD;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_user_roles() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.users;
CREATE TRIGGER trg_audit_user_roles
  AFTER INSERT OR UPDATE OF role OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles();
