# CLAUDE.md

Orientações para o Claude Code neste repositório. As diretrizes arquiteturais obrigatórias estão em [AGENTS.md](AGENTS.md) (idêntico a `GEMINI.md`) e **devem ser seguidas**; o resumo está abaixo.

## Visão geral

**Stocck-RMA / RMA Flow**: ERP web para logística reversa, triagem de devoluções (RMA), estoque físico recuperado, itens pendentes e catálogo base de produtos. Interface e dados em português (pt-BR).

## Stack

- React 19 + TypeScript + Vite 6, Tailwind CSS 4, lucide-react, motion, xlsx (import/export Excel), lz-string.
- Backend: Supabase (PostgreSQL + Storage + Auth) via `@supabase/supabase-js`.
- Servidor: `server.ts` (Express + Vite em modo middleware, porta 3000). Contém o proxy `/api/supabase-usage` (Supabase Management API); a versão serverless equivalente está em `api/supabase-usage.ts` (Vercel, ver `vercel.json`).
- Imagens: Supabase Storage (bucket `product-images`); há também `src/lib/cloudinaryService.ts` e `scripts/migrate_to_cloudinary.js`.

## Comandos

```bash
npm run dev            # tsx server.ts → http://localhost:3000
npm run build          # vite build + bundle do server.ts em dist/server.cjs
npm start              # node dist/server.cjs
npm run lint           # tsc --noEmit (único "lint"; não há suíte de testes)
npm run track-changes  # atualiza DAILY_CHANGES.md / daily_changes.json
```

Variáveis de ambiente: veja `.env.example` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLOUDINARY_*`, `GEMINI_API_KEY`). Nunca commitar `.env`. O PAT do Supabase (`SUPABASE_MANAGEMENT_TOKEN`) existe **apenas como variável de servidor** (usada por `/api/supabase-usage`): nunca usar prefixo `VITE_`, nunca salvar no navegador nem no banco.

## Estrutura

- `src/App.tsx`, `src/main.tsx`: shell da aplicação e navegação por abas.
- `src/components/`: telas e modais (Dashboard, RmaEntry, PendingItems, PhysicalStock, BaseCatalog, ProductMovements, modais de importação Excel, backup, etc.).
- `src/lib/`: acesso a dados e serviços — `supabase.ts`, `supabaseAuth.ts`, `dbService.ts` (camada de dados), `storageService.ts`, `syncCacheService.ts`, `backupService.ts`, `compressionService.ts`, `imageSecurityService.ts`, `quotaTracker.ts`, `integrationsConfigService.ts`.
- `src/utils/`: helpers puros (taxonomia de categorias, Excel, cores de filtros, imagens de produto).
- `src/types.ts`: tipos de domínio compartilhados.
- `supabase_schema.sql`: schema do banco; `security_spec.md`: especificação de segurança.

## Navegação e estado (`src/App.tsx`)

- **Sem router**: a navegação é o estado `activeTab` (`'dashboard' | 'rma' | 'catalog' | 'stock' | 'pending' | 'movement'`), com duas barras de abas (`#desktop-navigation` em `xl`+, `#mobile-navigation` abaixo). Ao adicionar uma aba, atualize o tipo em `useState` **e** em `handleSwitchTab`, e as duas barras.
- Troque de aba com `handleSwitchTab` (limpa unidade selecionada, filtros iniciais e restaura a rolagem da aba). Para ir ao estoque com contexto, use `selectedTriageUnit` / `initialStockFilters` (`platform`, `sector`, `searchTerm`, `pendingSku`).
- `PhysicalStock` fica **sempre montado** (`display: none` fora da aba) para preservar estado e filtros; as demais abas montam/desmontam.
- Papéis: `admin | operator | viewer`, definidos **no banco** (`public.users.role`) e aplicados por RLS (`supabase_rls_hardening.sql`; reversão em `supabase_rls_rollback.sql`). `viewer` = somente leitura. Não há cadastro público (a tela de login só tem "Entrar"; o signup também deve estar desligado no painel do Supabase): usuários são criados por um admin em Authentication → Users, nascem `viewer` no primeiro login e só um admin promove (`UPDATE public.users SET role = 'operator' WHERE email = '...'`). O cliente nunca grava `role`, nem lê papel de `user_metadata`, e não existe e-mail de admin fixo no código. O modo visitante (sem login) foi removido.
- **Dados no estado do App**: `products`, `triageUnits`, `dailyInflows`, `pendingItems`. Fluxo: cache local primeiro (`syncCacheService`) → delta sync em segundo plano (throttle 30s, foco da aba, a cada 5 min) → assinaturas realtime (`subscribe*`) + barramento entre abas. Mutações gravam via `dbService` e atualizam o estado local sem reler do banco; salvar uma triagem também reconcilia os vínculos com `pendingItems`.
- Textos de UI em pt-BR; `id`s dos elementos são usados pelo CSS do tema claro (veja abaixo).

## Tipos de domínio (`src/types.ts`)

- `BaseProduct` (catálogo), `TriageUnit` (unidade física; `status: 'Estoque' | 'Baixado'`; `trackingCode` = código STI), `PendingItem` (pendência `REG-xxxxx`, vinculada à unidade por `linkedUnitId`/`transferredUnitId`), `DailyInflowRecord` (contagem diária por setor).
- Enums: `PlatformType`, `DestinationSectorType` (`Principal | Openbox | RMA | Outros`), `PendingStatusType`, `PendingPriorityType`.
- `isMigrationUnit()` decide se uma unidade importada/migrada fica fora da contagem diária — reutilize, não duplique a lógica.
- Atenção: comentários antigos falam em "Base64" (`photos*`) e subcoleção `/chunks` (backup); isso é legado e **contraria** as regras de imagem — fotos devem ser URLs do Storage.

## Estilo (`src/index.css`, Tailwind 4)

- Tema escuro é o padrão (fundo `#020617`); o claro é `html.light`. Fontes: Inter (sans) e JetBrains Mono (mono, usada em SKUs/códigos).
- **O tema claro não usa variáveis CSS**: ele sobrescreve classes utilitárias do Tailwind (`.bg-slate-900`, `.text-sky-400`, …) e `id`s de componentes com `!important`. Portanto: escreva o JSX com classes do tema escuro; ao criar um componente com cores próprias, adicione o override `html.light ...` correspondente. **Renomear um `id` existente (ex.: `#btn-open-settings`, `#settings-modal`, `#kpi-*`) quebra o tema claro silenciosamente.**
- Paleta semântica: `sky` = marca/navegação ativa; `rose` = Entrada de RMA; `emerald` = Principal; `amber` = Openbox; `purple` = Baixados; `indigo` = calendário.
- Classes customizadas reutilizáveis: `.sku-badge` / `.product-sku-badge` / `.unit-sku-badge`, `.stocck-toggle-track` + `.stocck-toggle-input`, `.photo-container-clean` (sempre fundo branco), `.cal-day-*`, `.app-toast-success` / `.app-toast-error`.
- O arquivo é grande (~4.900 linhas), organizado em seções comentadas por tela; busque a seção (`grep`) em vez de ler tudo.

## Regras obrigatórias (resumo de AGENTS.md)

1. **Consultas**: usar JOINs nativos (`select('*, produtos(*)')`); nunca N+1 no frontend.
2. **Agregações** (totais, métricas): em views/RPC do PostgreSQL (`supabase.rpc(...)`), nunca baixando dados completos para somar no cliente.
3. **Paginação obrigatória** em toda listagem (`.range(from, to)` ou `.limit(n)`); nunca puxar a tabela inteira.
4. **Colunas específicas** em listas (`select('id, name, sku, image_url')`), não `*`.
5. **Imagens**: máx. **3MB**; converter para `.webp` via Canvas antes do upload; enviar ao Storage (`product-images`) e salvar só URL/path — **nunca base64 no banco**. Acima de 3MB, bloquear no cliente com alerta amigável.
6. **Erros**: toda chamada ao Supabase dentro de `try...catch`.

## Backup

- Snapshots do app (`src/lib/backupService.ts`): criar = admin/operator; **restaurar, importar e apagar = só admin com confirmação de senha** (`src/lib/adminReauth.ts` + `<AdminReauthHost />` no `App.tsx`; as funções de serviço já chamam `ensureAdminReauthenticated`). A poda automática só roda para admin (chama `bulkDeleteCloudSnapshotsUnchecked`).
- A API do Supabase limita **1000 linhas por requisição** (`.limit(20000)` é ignorado): leituras completas devem paginar com `.range()` (ver `fetchAllRowsComplete`) e conferir a contagem.
- Restauração: confere hash, cria snapshot "Pré-restauração", grava (upsert tolerante a colunas inexistentes) e só então remove o que sobrou (modo substituir). Nunca apagar antes de gravar.
- Backup externo criptografado: `.github/workflows/backup.yml` (segredos `SUPABASE_DB_URL` e `BACKUP_PASSPHRASE`). Passo a passo e restauração em `docs/BACKUP_RESTORE.md`.

## Convenções e avisos

- Mantenha textos de UI e mensagens de erro em português.
- Alterações de schema devem refletir em `supabase_schema.sql` e `src/types.ts`.
- O script que o app mostra para bancos novos (`SUPABASE_SQL_SCHEMA` em `src/lib/supabase.ts`) deve manter as políticas de RLS **por papel** (iguais a `supabase_rls_hardening.sql`); nunca recriar políticas "Public access". Modelo de segurança em `security_spec.md`.
- Auditoria: `createAuditLog` só grava ações listadas em `SENSITIVE_AUDIT_ACTIONS` (`dbService.ts`); para auditar uma ação nova, inclua-a nessa lista. `audit_logs` é imutável (não tente apagar). Gatilho de papéis em `supabase_audit_triggers.sql`. O painel de leitura é a aba "Segurança" de `SettingsModal` (`SecurityAuditPanel.tsx`, só admin); ao incluir uma ação nova em `SENSITIVE_AUDIT_ACTIONS`, adicione também o rótulo em `ACTION_LABELS` do painel.
- HTML vindo do banco (descrição, laudo, notas) **sempre** passa por `sanitizeHtml` (`src/utils/sanitizeHtml.ts`) antes de `dangerouslySetInnerHTML`/`innerHTML`. Cabeçalhos de segurança e CSP ficam em `vercel.json`; a CSP bloqueia script inline (o patch de compatibilidade está em `public/compat.js`) e limita conexões a `*.supabase.co` e `api.cloudinary.com`.
- `/api/supabase-usage` exige login de admin (token da sessão no `Authorization`); o projeto vem só das variáveis do servidor. A função `requireAdmin` está duplicada em `api/supabase-usage.ts` e `server.ts` — mantenha as duas iguais.
- `public/PRD_RMA_FLOW.md` descreve uma versão antiga baseada em Firebase/Firestore; a arquitetura atual é Supabase — em caso de conflito, prevalece AGENTS.md e o código.
- `DAILY_CHANGES.md` e `daily_changes.json` são gerados por `npm run track-changes`; não editar à mão.
- Deploy: workflow `.github/workflows/deploy.yml` (GitHub Pages, no push para `main`) e `vercel.json`.
