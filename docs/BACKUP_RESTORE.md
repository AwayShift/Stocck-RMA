# Backup e restauração do Stocck-RMA

Há duas camadas de proteção. Use as duas.

| Camada | Onde fica | Protege contra |
|---|---|---|
| **Snapshots no app** (`backup_snapshots`) | No próprio banco | Erro humano do dia a dia (apagou/alterou algo). **Não protege** se o banco for comprometido ou apagado. |
| **Backup externo diário** (GitHub Actions) | Artefato **criptografado** do GitHub, 30 dias | Banco apagado/adulterado, conta comprometida, falha do Supabase. |

## 1. Backup externo diário (`.github/workflows/backup.yml`)

Roda todo dia às 06:17 UTC (03:17 em Brasília) e também sob demanda (Actions → "Backup diário do banco" → Run workflow).
Faz `pg_dump` do schema `public` (tabelas, dados, políticas RLS e funções), confere que as 8 tabelas estão no arquivo,
**criptografa com AES-256** e publica só o arquivo `.gpg`. O dump em texto claro nunca sai do runner.

### Configuração (uma vez)

No GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

1. `SUPABASE_DB_URL`: a string de conexão do banco.
   - Supabase → botão **Connect** → **Session pooler** (porta 5432). Use o *Session pooler*: o GitHub só tem IPv4 e a conexão direta é IPv6.
   - Formato: `postgresql://postgres.<ref>:<SENHA_DO_BANCO>@aws-0-<regiao>.pooler.supabase.com:5432/postgres`
   - A senha é a do **banco** (Project Settings → Database), não a de login do app.
2. `BACKUP_PASSPHRASE`: uma senha longa que você inventa (20+ caracteres). **Guarde-a em um gerenciador de senhas.
   Sem ela o backup não abre e não existe recuperação.**

Depois, rode o workflow manualmente uma vez e confirme que terminou verde e que gerou o artefato `db-backup-AAAAMMDD-HHMMSS`.

### Limitações

- **Não inclui as imagens** do Storage (só as URLs). **Não inclui `auth.users`** (logins/senhas ficam no Supabase Auth). Os papéis (`public.users`) estão no dump.
- Em repositório público, o GitHub **desativa agendamentos após 60 dias sem atividade** e pode atrasar a execução. Confira de vez em quando na aba Actions.
- Se o workflow falhar, o GitHub avisa por e-mail quem editou o agendamento mais recentemente.

## 2. Restaurar a partir do backup externo

1. GitHub → **Actions** → execução desejada → baixe o artefato (arquivo `.zip` com o `.gpg`).
2. Descriptografe (você será solicitado a digitar a senha `BACKUP_PASSPHRASE`):

```bash
gpg --output stocck.dump --decrypt stocck-AAAAMMDD-HHMMSS.dump.gpg
```

3. **Recomendado: restaure primeiro num projeto Supabase NOVO/de teste**, confira os dados e só então decida:

```bash
pg_restore --clean --if-exists --no-owner --dbname "postgresql://postgres.<ref>:<SENHA>@<pooler>:5432/postgres" stocck.dump
```

   - `--clean --if-exists` recria os objetos do schema `public` (o que existir no destino será substituído).
   - Os usuários de login precisam existir no Supabase Auth do destino; as linhas de `public.users` (papéis) vêm no dump.
   - O destino precisa ser um projeto Supabase (que tem o esquema `auth`, usado pelas políticas RLS). Num PostgreSQL puro
     as 4 políticas que usam `auth.uid()`/`auth.jwt()` falham, enquanto tabelas e dados restauram normalmente.
4. Conferir: o app abre, as contagens batem e um operador consegue gravar.

> **Teste de restauração:** um backup que nunca foi restaurado não é um backup. Faça o passo 3 num projeto de teste
> pelo menos uma vez, e repita a cada alguns meses.

## 3. Snapshots dentro do app (Configurações → Backup)

- **Criar:** admin e operador. Agendados: fim do expediente, semanal e mensal (mantém os 15 automáticos mais recentes).
- **Restaurar, importar arquivo e apagar:** **somente admin**, com confirmação de senha.
- A restauração confere o hash de integridade, cria antes um snapshot "Pré-restauração (automático)" e só remove registros
  que não estão no backup depois de gravar todos os dados do backup com sucesso.
- O hash detecta corrupção e alterações simples, mas **não** impede um invasor que recalcule o hash. Por isso existe a cópia externa criptografada.

### Backups feitos antes desta versão podem estar incompletos

A leitura do banco para o backup pedia `limit(20000)`, mas a API do Supabase devolve no máximo **1000 linhas por requisição**.
Dependendo do aparelho que rodou o backup, as unidades (`triage_units`) além das primeiras 1000 podem ter ficado de fora.
**Não use snapshots antigos para uma restauração no modo "substituir".** Gere um backup novo (já com leitura paginada e
conferência de contagem) e use esse como referência.
