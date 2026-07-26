# Product Requirement Document (PRD) - RMA Flow

**Aplicação:** RMA Flow - Web Logística & Segurança  
**Versão Spec:** 2.4.0  
**Data de Emissão:** 2026-07-26  
**Finalidade:** Guia de Requisitos do Produto, Especificação Técnica e Suite de Testes para Automação de QA, Análise de Falhas de Segurança, Testes de Carga e Validação de Vulnerabilidades.

---

## 1. Visão Geral do Produto

**RMA Flow** é um sistema web corporativo de alta performance voltado para logística reversa, triagem de devoluções (RMA - Return Merchandise Authorization), gestão de estoque físico recuperado, acompanhamento de disputas/contestações financeiras junto a marketplaces e rastreabilidade total de operações (logs de auditoria).

### 1.1 Objetivos de Negócio
- Reduzir perdas financeiras com fraudes em devoluções nos marketplaces (*Mercado Livre, Shopee, Amazon, Kabum, FAVS*).
- Padronizar o processo de triagem física (condição do dispositivo, estado da embalagem, setor de destinação final).
- Garantir rastreabilidade de ponta a ponta com registros de auditoria (*Audit Trail*) imutáveis.
- Rastrear valores reembolsados e pendentes de contestação em disputas de marketplaces.

---

## 2. Arquitetura do Sistema & Stack Tecnológica

- **Frontend Framework:** React 18 + TypeScript (Vite + SWC)
- **Estilização & UI:** Tailwind CSS, Lucide React (Icons), Motion/React (Animações), Recharts (Visualização de Dados)
- **Backend & Cloud Database:** Google Firebase Firestore (NoSQL em tempo real via listeners `onSnapshot`)
- **Autenticação:** Firebase Authentication (E-mail/Senha com perfis estendidos na coleção `/users`)
- **Gestão de Estado:** Estado reativo unificado sincronizado com assinaturas do Firestore.
- **Auditoria:** Gravação de ações críticas na coleção `/audit_logs`.

---

## 3. Matriz de Perfis e Permissões (RBAC - Role-Based Access Control)

O sistema possui dois perfis principais de usuário:

| Módulo / Funcionalidade | Administrador (`admin`) | Operador (`operator`) | Visitante (Não Autenticado) |
| :--- | :---: | :---: | :---: |
| **Acesso ao Sistema** | Sim (E-mail / Senha) | Sim (E-mail / Senha) | Bloqueado (Redireciona p/ Login) |
| **Dashboard & KPIs** | Leitura Completa | Leitura Completa | Bloqueado |
| **Triagem de RMA (Nova Devolução)** | Criar / Editar | Criar / Editar | Bloqueado |
| **Estoque Físico - Consulta** | Leitura Completa | Leitura Completa | Bloqueado |
| **Estoque Físico - Baixa (Checkout)** | Sim (Individual e em Lote) | Sim (Individual e em Lote) | Bloqueado |
| **Exclusão de Triagens de RMA** | Permitido | **Bloqueado** | Bloqueado |
| **Catálogo de Produtos Base (SKU)** | Criar / Editar / Excluir | **Apenas Leitura (Consulta)** | Bloqueado |
| **Acompanhamento de Casos (Disputas)** | Criar / Editar / Excluir | Criar / Editar / Excluir | Bloqueado |
| **Histórico de Movimentações** | Leitura Completa | Leitura Completa | Bloqueado |
| **Logs de Auditoria** | Leitura Completa | Leitura Completa | Bloqueado |
| **Reset do Banco de Dados (Demo)** | Permitido | **Bloqueado** | Bloqueado |

---

## 4. Coleções do Banco de Dados (Firestore Schemas)

### 4.1 Coleção `/users/{uid}`
```json
{
  "uid": "string (PK, Firebase Auth UID)",
  "email": "string (E-mail válido)",
  "name": "string (Nome do usuário)",
  "role": "admin | operator",
  "createdAt": "string (ISO 8601 Timestamp)"
}
```

### 4.2 Coleção `/base_products/{id}`
```json
{
  "id": "string (PK UUID)",
  "sku": "string (Código SKU Mestre único)",
  "name": "string (Nome do produto)",
  "category": "string (Categoria do produto)",
  "brand": "string (Marca do produto)",
  "barcodes": ["array de strings (EAN / Códigos de barras)"],
  "minStock": "number (Limiar de estoque mínimo, >= 0)",
  "notes": "string (Opcional)",
  "createdAt": "string (ISO 8601 Timestamp)"
}
```

### 4.3 Coleção `/triage_units/{id}`
```json
{
  "id": "string (PK UUID)",
  "trackingCode": "string (Código de rastreio ou etiqueta de devolução)",
  "platform": "Mercado Livre | Shopee | Amazon | Kabum | FAVS",
  "baseProductId": "string (FK -> base_products.id)",
  "baseProductSku": "string (SKU Mestre associado)",
  "baseProductName": "string (Nome do produto no catálogo)",
  "serialNumber": "string (Número de Série do item, opcional)",
  "deviceStatus": "Em bom estado | Avariado / Quebrado | Embalagem Danificada | Peça Faltante / Incompleto",
  "packageStatus": "Lacrado | Aberto | Sem Embalagem",
  "destinationSector": "Estoque | Descarte / Sucata | Fornecedor / Garantia | Assistência Técnica",
  "triageNotes": "string (Opcional)",
  "images": ["array de strings (Base64 ou URLs de evidências fotográficas)"],
  "operatorEmail": "string (E-mail do operador responsável)",
  "operatorName": "string (Nome do operador)",
  "status": "Estoque | Baixado",
  "checkoutSector": "string (Setor informado na baixa, opcional)",
  "checkoutDate": "string (ISO 8601 Timestamp da baixa, opcional)",
  "checkoutOperator": "string (E-mail do operador que realizou a baixa, opcional)",
  "createdAt": "string (ISO 8601 Timestamp de entrada)"
}
```

### 4.4 Coleção `/cases/{id}`
```json
{
  "id": "string (PK UUID)",
  "code": "string (Código da disputa / reclamação no marketplace)",
  "platform": "Mercado Livre | Shopee | Amazon",
  "createdAt": "string (YYYY-MM-DD)",
  "reason": "string (Motivo da disputa / reembolso)",
  "status": "Pendente | Resolvido",
  "resolution": "Favorável | Não Favorável | Pago Parcial | Pendente de Resolução",
  "value": "number (Valor monetário reembolsado/recuperado em BRL, opcional)",
  "notes": "string (Observações do caso, opcional)"
}
```

### 4.5 Coleção `/audit_logs/{id}`
```json
{
  "id": "string (PK UUID)",
  "timestamp": "string (ISO 8601 Timestamp)",
  "userEmail": "string (E-mail do usuário agente)",
  "action": "LOGIN | CREATE_TRIAGE | CHECKOUT_TRIAGE | CREATE_PRODUCT | UPDATE_PRODUCT | DELETE_PRODUCT | DELETE_TRIAGE | RESET_DATABASE | TOGGLE_DEMO_ROLE",
  "details": "string (Descrição detalhada da ação)"
}
```

---

## 5. Módulos Funcionais e Regras de Negócio

### 5.1 Autenticação & Sessão (`Login.tsx`, `App.tsx`)
1. **Login de Usuário:** Autenticação por e-mail e senha utilizando `signInWithEmailAndPassword`.
2. **Sessão Persistente:** O estado de autenticação é mantido via `onAuthStateChanged`.
3. **Perfil e Role:** Ao autenticar, o sistema consulta a coleção `/users/{uid}` para carregar o nome e o papel (`admin` ou `operator`).
4. **Modo de Demonstração (Demo Role Toggle):** Permite alternar o papel do usuário logado diretamente na interface para testes de controle de acesso.

### 5.2 Triagem de RMA (`RmaEntry.tsx`)
1. **Busca de Produto Mestre:** Permite buscar pelo SKU ou código de barras (EAN) no catálogo base.
2. **Campos Obrigatórios:** Código de Rastreio/Devolução, Plataforma, Produto Mestre, Estado do Dispositivo, Estado da Embalagem, Setor de Destino Inicial.
3. **Upload de Evidências:** Anexo de imagens em formato Base64/DataURL para comprovação visual de avarias.
4. **Conclusão da Triagem:**
   - Cria um novo registro na coleção `/triage_units` com `status: "Estoque"`.
   - Dispara registro de auditoria na coleção `/audit_logs`.

### 5.3 Estoque Físico (`PhysicalStock.tsx`)
1. **Visualização:** Lista todos os itens triados que estão em `status: "Estoque"`.
2. **Filtros e Busca:** Busca por código de rastreio, SKU, número de série, plataforma e setor de destino.
3. **Baixa Individual / Em Lote (Checkout):**
   - Seleção de 1 ou múltiplos itens.
   - Abertura de modal de confirmação para informar o Setor de Baixa Final (*Ex: Venda como Usado, Descarte, Devolução Fornecedor*).
   - Atualização do status para `"Baixado"`, adicionando `checkoutSector`, `checkoutDate` e `checkoutOperator`.
   - Geração automática de logs de auditoria.

### 5.4 Acompanhamento de Casos / Disputas (`CaseTracking.tsx`)
1. **Gestão de Contestações:** Registro e gestão de chamados abertos junto aos marketplaces para recuperação de valores.
2. **Status de Resolução:** `Favorável`, `Não Favorável`, `Pago Parcial`, `Pendente de Resolução`.
3. **Valores Recuperados:** Para resoluções `Favorável` ou `Pago Parcial`, permite registrar o valor em BRL (R$) recuperado.
4. **Modal de Resolução Rápida:** Atalho na tabela para alterar o status e inserir o valor recuperado sem abrir o formulário completo.
5. **Auditoria Isolada:** Alterações nos casos de disputas **NÃO** geram poluição nos logs de auditoria operacional (conforme requisito de otimização).

### 5.5 Catálogo Base de Produtos (`BaseCatalog.tsx`)
1. **Gestão de SKUs:** Cadastro e edição de SKUs mestres, nomes, marcas, categorias e códigos EAN associados.
2. **Restrição por Perfil:** Apenas administradores (`role === 'admin'`) podem criar, editar ou remover SKUs do catálogo. Operadores possuem acesso somente leitura.

### 5.6 Histórico de Movimentações (`ProductMovements.tsx`)
1. **Linha do Tempo Operacional:** Exibe o histórico cronológico de entradas de RMA, movimentações entre setores e baixas de estoque.
2. **Filtros Avançados:** Filtro por período de datas, plataforma, SKU e tipo de movimentação.

### 5.7 Dashboard & KPIs (`Dashboard.tsx`)
1. **Indicadores Chave:** Total de RMAs recebidos, itens em estoque físico, total de baixas realizadas, valor total recuperado em disputas.
2. **Gráficos Analíticos:** Distribuição por plataforma (*Mercado Livre, Shopee, Amazon, Kabum, FAVS*), divisão por avarias/condição e tendência temporal.

### 5.8 Logs e Auditoria (`LogsAudit.tsx`)
1. **Rastreabilidade Total:** Registro de logs de segurança e ações críticas do sistema.
2. **Filtros de Log:** Busca por e-mail do operador ou tipo de ação (`LOGIN`, `CREATE_TRIAGE`, `CHECKOUT_TRIAGE`, `CREATE_PRODUCT`, `DELETE_TRIAGE`, etc.).

---

## 6. Especificação de Testes Automatizados & Segurança (Security Test Vectors)

Esta seção foi desenhada especificamente para ferramentas automatizadas de DAST (Dynamic Application Security Testing), SAST, DAST, scanners de vulnerabilidade (ex: OWASP ZAP, Burp Suite, Nuclei, Playwright, Cypress) e testes de carga.

### 6.1 Matriz de Testes de Segurança & Vetores de Ataque

| ID Teste | Categoria | Descrição / Vetor de Teste | Comportamento Esperado / Critério de Aceite |
| :--- | :--- | :--- | :--- |
| **SEC-001** | Autenticação | Tentativa de acesso direto sem token/sessão às rotas/componentes do app. | O sistema deve bloquear a renderização e exibir a tela de `Login`. |
| **SEC-002** | RBAC / Bypassing | Usuário com perfil `operator` tentando executar requisições de deleção de SKU em `base_products` ou reset de BD. | O Firestore e a interface devem negar a ação, exibindo mensagem de erro de permissão. |
| **SEC-003** | Injection (XSS) | Injeção de scripts no formulário de RMA (campos: `trackingCode`, `serialNumber`, `triageNotes`). Exemplo: `<script>alert(1)</script>` ou `<img src=x onerror=alert(1)>`. | O React deve sanitizar a renderização de strings de texto no DOM. NENHUM código JS deve ser executado. |
| **SEC-004** | Formato de Dados / BRL | Envio de strings inválidas, caracteres especiais ou números negativos no campo de valor recuperado (`value` em `CaseTracking`). Ex: `-500`, `abc`, `999999999999`. | O parser deve validar e converter adequadamente (`parseFloat`), rejeitando valores NaN ou tratando conforme limites. |
| **SEC-005** | Integridade de Anexo | Envio de arquivos não-imagem ou payloads corrompidos no upload de evidências do RMA. | O sistema deve aceitar somente imagens válidas e limitar o tamanho dos dados Base64 armazenados. |
| **SEC-006** | Firestore Rules | Tentativa de sobrescrever o papel `role: "admin"` no documento do próprio usuário via SDK cliente manipulado. | As regras de segurança do Firestore devem impedir a alteração não autorizada do campo `role`. |
| **SEC-007** | Rate Limiting / DoS | Submissão em massa de baixas de estoque (`checkoutTriageUnit`) com loops assíncronos simultâneos (ex: 100 requisições simultâneas). | A aplicação deve tratar com resiliência, sem crash do client e mantendo a consistência no banco. |

### 6.2 Casos de Teste Funcionais Automatizados (End-to-End / E2E)

#### Caso de Teste 01: Fluxo Completo de Triagem e Baixa de RMA
1. **Passo 1:** Realizar login com credenciais de operador.
2. **Passo 2:** Navegar para a aba "Triagem de RMA".
3. **Passo 3:** Buscar o SKU "SKU-TEST-001" no catálogo.
4. **Passo 4:** Preencher Código de Rastreio: `BR123456789RMA`, Plataforma: `Mercado Livre`, Estado: `Avariado / Quebrado`, Embalagem: `Aberto`, Destino: `Estoque`.
5. **Passo 5:** Salvar a triagem.
6. **Passo 6:** Ir para a aba "Estoque Físico", filtrar por `BR123456789RMA`.
7. **Passo 7:** Confirmar que o item está visível em estoque.
8. **Passo 8:** Selecionar o item e clicar em "Dar Baixa em Lote / Selecionados".
9. **Passo 9:** Informar o setor de baixa: `Assistência Técnica` e confirmar.
10. **Passo 10:** Verificar se o item desapareceu do estoque ativo e se consta como `Baixado` no Histórico de Movimentações.

#### Caso de Teste 02: Resolução de Disputa e Registro Financeiro
1. **Passo 1:** Ir para a aba "Acompanhamento de Casos".
2. **Passo 2:** Criar novo caso com Código `ML-CLAIM-9876`, Plataforma `Mercado Livre`, Motivo `Produto retornado avariado pelo cliente`.
3. **Passo 3:** Localizar o caso na lista com status `Pendente`.
4. **Passo 4:** Clicar no botão de atalho `Favorável`.
5. **Passo 5:** No modal de valor rápido, digitar `250.50` e confirmar.
6. **Passo 6:** Validar se o badge mudou para `Favorável` e se o valor exibido é `R$ 250,50`.
7. **Passo 7:** Validar no Dashboard se o KPI de Total Recuperado acumulou o valor de R$ 250,50.

---

## 7. Apêndice & Download do Documento

Este PRD foi compilado para consumo automatizado por frameworks de testes como Cypress, Playwright, Robot Framework, Selenium, OWASP ZAP, Postman Newman e suites de testes com LLMs/AI.

*Arquivo gerado nativamente no repositório:* `public/PRD_RMA_FLOW.md` e `public/PRD_RMA_FLOW.json`
