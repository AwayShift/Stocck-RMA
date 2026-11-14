# Especificação de Segurança — Stocck-RMA (Supabase)

Esta especificação descreve o modelo **atual** (Supabase: PostgreSQL + Auth + Storage). A versão anterior era baseada em Firestore e está obsoleta.

## 1. Princípios

1. **O banco é a autoridade.** Quem pode ler/gravar é decidido por RLS no PostgreSQL, nunca pelo navegador. Esconder um botão na interface não é segurança.
2. **Papel vem de `public.users.role`**, lido pela função `public.app_role()` (SECURITY DEFINER). Nunca de `user_metadata` nem de e-mail fixo no código.
3. **Menor privilégio.** A chave `anon` não acessa nenhuma tabela. Sem login e sem linha em `public.users` = nenhum acesso.
4. **Segredos só no servidor.** O token de gerenciamento do Supabase (`SUPABASE_MANAGEMENT_TOKEN`) existe apenas como variável de ambiente do servidor (Vercel/`.env`); nunca com prefixo `VITE_`, nunca no navegador nem no banco.

## 2. Papéis

| Papel | Pode |
|---|---|
| `admin` | Tudo: dados operacionais, usuários e papéis, apagar/restaurar/importar backups (com confirmação de senha), painel de uso do Supabase. |
| `operator` | Ler e gravar dados operacionais; criar snapshots de backup e editar as 2 linhas de configuração do backup. **Não** apaga/restaura backups nem gerencia usuários. |
| `viewer` | Somente leitura dos dados operacionais. |

- Não há cadastro público (signup desligado no painel do Supabase) nem modo visitante.
- Usuários são criados por um admin em Authentication → Users, nascem `viewer` e só um admin promove:
  `UPDATE public.users SET role = 'operator' WHERE email = '...';`
- O cliente nunca grava `role`: a política de INSERT só aceita `viewer` para o próprio uid, e a de UPDATE impede mudar o próprio papel.

## 3. Regras de RLS (resumo)

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `products`, `triage_units`, `pending_items`, `daily_inflows`, `cases` | admin, operator, viewer | admin, operator | admin, operator | admin, operator |
| `users` | própria linha ou admin | admin, ou o próprio uid como `viewer` | própria linha sem mudar o papel, ou admin | admin |
| `audit_logs` | admin, operator | admin, operator (com `user_id` próprio) | ninguém | ninguém |
| `backup_snapshots` | admin, operator | admin, operator | admin; operator só em `config_system_integrations` e `config_backup_schedule` | admin |
| Storage `product-images` | público (bucket público) | admin, operator | admin, operator | admin, operator |

- `get_stock_metrics()` (RPC): só usuários logados, com `search_path` fixo.
- Fonte dos scripts: `supabase_rls_hardening.sql` (aplicar), `supabase_rls_rollback.sql` (reverter) e o bloco de segurança do `SUPABASE_SQL_SCHEMA` (`src/lib/supabase.ts`, para bancos novos). **Nunca recriar políticas "Public access".**

## 4. API do servidor

- `/api/supabase-usage` (Vercel `api/` e `server.ts`): exige `Authorization: Bearer <sessão>`; valida no Supabase Auth e confere `app_role() = 'admin'`. Sem login → 401; outro papel → 403.
- O `projectRef` é definido só pelo servidor (variáveis de ambiente); a requisição não escolhe o projeto.

## 4b. Navegador: HTML e cabeçalhos

- **HTML armazenado** (descrições, laudos, notas) só é exibido depois de passar por `sanitizeHtml` (`src/utils/sanitizeHtml.ts`, DOMPurify): remove scripts, `onerror`/`onclick` e `javascript:`, mantendo a formatação do editor. Vale para todo `dangerouslySetInnerHTML` e para o `innerHTML` do `RichTextEditor`. **Nunca** renderize HTML do banco sem ela.
- **Cabeçalhos** (`vercel.json`, todas as rotas): `Content-Security-Policy` (scripts só `'self'`; conexões só `'self'`, `*.supabase.co` e `api.cloudinary.com`; imagens `https:`; `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (câmera/microfone/localização desligados) e `Strict-Transport-Security`.
- O único script inline do app foi movido para `public/compat.js` (a CSP não permite script inline). Para usar outro domínio de Supabase ou outro serviço externo, inclua-o em `connect-src`/`img-src` no `vercel.json`.
- Navegar com texto malicioso gera avisos de CSP no console durante a análise do DOMPurify; são bloqueios inofensivos (nada é executado).
- GitHub Pages não aplica esses cabeçalhos; a proteção completa vale no deploy da Vercel.

## 5. Trilha de auditoria

- `createAuditLog` (`src/lib/dbService.ts`) grava em `audit_logs` **apenas ações sensíveis** (lista `SENSITIVE_AUDIT_ACTIONS`): mudança/exclusão de usuário e papel, limpezas totais (`RESET_*`) e operações de backup (restaurar, exportar, apagar, apagar em lote, limpeza rápida, limpeza de órfãos). É melhor esforço: nunca lança erro nem bloqueia a ação.
- Cada registro leva o `user_id` e o e-mail da sessão (o RLS só aceita o próprio `user_id`). Não grava senhas nem tokens.
- `audit_logs` é **imutável**: sem UPDATE/DELETE para ninguém (nem admin). A ação "limpar logs" foi desativada.
- Gatilho `trg_audit_user_roles` (`supabase_audit_triggers.sql`, também no `SUPABASE_SQL_SCHEMA`): registra criação, mudança de papel e exclusão em `public.users`, inclusive promoções feitas direto por SQL (marcadas "via SQL/painel").
- **Painel de segurança:** Configurações → aba **Segurança** (só admin; `SecurityAuditPanel.tsx`, leitura paginada via `fetchAuditLogsPage`), com filtro por tipo, paginação e botão Atualizar (sem Realtime). Somente leitura.
- Consulta direta: `select timestamp, user_email, action, details from audit_logs order by timestamp desc limit 50;`

## 6. Backup

- Snapshots do app: criar = admin/operator; **restaurar, importar e apagar = só admin, com confirmação de senha** (`adminReauth.ts`).
- Restauração: confere hash, cria snapshot "Pré-restauração", grava (upsert) e só depois remove o que sobrou (modo substituir).
- Leituras completas paginam com `.range()` (a API limita 1000 linhas por requisição) e conferem a contagem.
- Backup externo criptografado (GitHub Actions, `pg_dump` + AES-256, 30 dias): ver `docs/BACKUP_RESTORE.md`.

## 7. Cenários de verificação

| # | Cenário | Resultado esperado |
|---|---|---|
| 1 | Requisição com chave `anon`, sem login, lendo qualquer tabela | Negado (sem permissão) |
| 2 | `viewer` tenta inserir/alterar/apagar em qualquer tabela operacional | Violação de RLS |
| 3 | Usuário tenta `UPDATE users SET role = 'admin'` na própria linha | Violação de RLS |
| 4 | Usuário tenta criar a própria linha em `users` com `role = 'admin'` | Violação de RLS |
| 5 | `operator` tenta apagar um snapshot de backup | Violação de RLS |
| 6 | Alguém tenta alterar ou apagar um registro de `audit_logs` | Violação de RLS |
| 7 | `viewer` tenta ler `audit_logs` ou `backup_snapshots` | Nenhuma linha / negado |
| 8 | `/api/supabase-usage` sem token ou com token inválido | 401 |
| 9 | `/api/supabase-usage` com `operator` ou `viewer` | 403 |
| 10 | `/api/supabase-usage` com `projectRef` de outro projeto no corpo | Ignorado (usa o projeto do servidor) |
| 11 | Restaurar backup sem confirmar a senha de admin | Bloqueado |
| 12 | Upload de imagem acima de 3MB | Bloqueado no cliente e pelo limite do bucket |
| 13 | Admin tenta apagar registros de `audit_logs` | 0 linhas afetadas (imutável) |
| 14 | Usuário grava log com `user_id` de outra pessoa | Violação de RLS |
| 15 | Promover alguém por SQL | Gatilho registra `USER_ROLE_CHANGED` |
| 16 | Descrição com `<img onerror>`, `<script>` ou `javascript:` | Removidos na exibição; formatação normal preservada |
| 17 | Embutir o app em um `<iframe>` de outro site | Bloqueado (`X-Frame-Options`/`frame-ancestors`) |

Os cenários 1–10 e 13–15 foram verificados em um banco Supabase local de testes.
