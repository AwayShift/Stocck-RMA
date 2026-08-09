# Especificação de Segurança Firestore - RMA Flow & Triagem de Estoque

## 1. Princípios de Segurança e Menor Privilégio
O objetivo desta atualização é remover o acesso indiscriminado (`allow read, write: if isAuthenticated()`) e aplicar uma política rígida de controle de acesso baseada em funções (RBAC - Role-Based Access Control) e Custom Claims, combinada com verificação em documentos de usuário.

### Invariantes de Dados
1. **Coleção `/users/{userId}`**:
   - Um usuário comum só pode ler e atualizar seu próprio perfil (`auth.uid == userId`).
   - Usuários não-administradores não podem alterar seu próprio campo de função (`role`) ou privilégios de administração.
   - Administradores (`isAdmin()`) possuem acesso total de leitura e escrita a qualquer perfil de usuário.

2. **Coleções `/products/{productId}`, `/triage_units/{unitId}` e `/cases/{caseId}`**:
   - Qualquer usuário autenticado tem permissão apenas de **leitura** (`allow read: if isSignedIn()`).
   - Apenas Administradores e Gerentes (`isManagerOrAdmin()`) podem **criar, atualizar ou excluir** produtos, unidades em triagem ou casos de RMA.

3. **Coleção `/logs/{logId}`**:
   - **Ninguém pode apagar** logs (`allow delete: if false`).
   - **Ninguém pode alterar** logs existentes (`allow update: if false`).
   - Qualquer usuário autenticado pode **criar** registros de auditoria/log do sistema (`allow create: if isSignedIn()`).
   - Apenas Administradores podem **ler** os logs (`allow read: if isAdmin()`).

---

## 2. Cenários de Teste da "Dirty Dozen" (Payloads de Ataque & Resolução)

| # | Cenário de Ataque | Ação Maliciosa | Resultado Esperado |
|---|-------------------|----------------|-------------------|
| 1 | Modificação de Função | Usuário comum tenta atualizar `users/UID` definindo `role: "admin"`. | `PERMISSION_DENIED` |
| 2 | Leitura de Perfil Alheio | Usuário A tenta ler `users/UID_B`. | `PERMISSION_DENIED` |
| 3 | Escrita em Produtos por Usuário Comum | Usuário comum tenta criar/editar um produto em `products/PROD1`. | `PERMISSION_DENIED` |
| 4 | Alteração de Status de RMA por Operador Comum | Usuário comum tenta alterar `destinationSector` em `triage_units/UNIT1`. | `PERMISSION_DENIED` |
| 5 | Exclusão de Log por Ator Malicioso | Usuário (mesmo Admin) tenta executar `delete` em `logs/LOG1`. | `PERMISSION_DENIED` |
| 6 | Edição/Adulteração de Log | Usuário tenta alterar mensagem ou timestamp de um log existente em `logs/LOG1`. | `PERMISSION_DENIED` |
| 7 | Leitura de Logs por Usuário Não-Admin | Usuário comum tenta listar ou ler `logs/LOG1`. | `PERMISSION_DENIED` |
| 8 | Injeção de Shadow Fields | Usuário tenta enviar campos extras não autorizados em atualizações. | `PERMISSION_DENIED` |
| 9 | Leitura Não Autenticada | Requisição sem token de autenticação (`auth == null`) em qualquer coleção. | `PERMISSION_DENIED` |
| 10 | Leitura Geral de Usuários por Não-Admin | Usuário comum executa query `getDocs(collection(db, 'users'))`. | `PERMISSION_DENIED` |
| 11 | Criação de Casos RMA por Não-Gerente | Operador comum tenta cadastrar novo caso em `cases/CASE1`. | `PERMISSION_DENIED` |
| 12 | Remoção de Unidade de Estoque | Operador comum tenta deletar documento em `triage_units/UNIT1`. | `PERMISSION_DENIED` |

---

## 3. Matriz de Permissões das Regras

| Coleção | Leitura (Get/List) | Criação (Create) | Atualização (Update) | Exclusão (Delete) |
|---------|-------------------|------------------|----------------------|-------------------|
| `users/{userId}` | Próprio Usuário ou Admin | Próprio Usuário (sem role admin) ou Admin | Próprio Usuário (sem alterar role) ou Admin | Apenas Admin |
| `products/{productId}` | Qualquer Usuário Autenticado | Admin / Gerente | Admin / Gerente | Admin / Gerente |
| `triage_units/{unitId}` | Qualquer Usuário Autenticado | Admin / Gerente | Admin / Gerente | Admin / Gerente |
| `cases/{caseId}` | Qualquer Usuário Autenticado | Admin / Gerente | Admin / Gerente | Admin / Gerente |
| `logs/{logId}` | Apenas Admin | Qualquer Usuário Autenticado | Ninguém | Ninguém |
