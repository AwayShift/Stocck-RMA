# PRD & Diretrizes Arquiteturais: Stocck-RMA (Supabase + PostgreSQL + Storage)

Este documento estabelece as diretrizes arquitetônicas obrigatórias para o código do projeto **Stocck-RMA** no Google AI Studio. O foco principal é a eficiência de consumo de dados (Egress/Bandwidth e Leituras) utilizando o ecossistema **Supabase (PostgreSQL + Storage)**.

---

## 1. Modelagem Relacional e Consultas (Database)
- **Padrão Relacional:** O modelo de dados aproveita o PostgreSQL com chaves estrangeiras e integridade referencial entre Produtos, Triagens, Entradas e Históricos.
- **Uso de JOINs Nativos:** Para carregar dados correlacionados, utilize a sintaxe de junção nativa do Supabase JavaScript Client (ex.: `supabase.from('...').select('*, produtos(*)')`). NUNCA faça requisições separadas no frontend para evitar o problema N+1.
- **Delegação de Cálculos (Aggregations):** Cálculos de totais de itens em estoque, métricas e consolidações NUNCA devem ser feitos no frontend baixando os dados completos. Utilize *views* do PostgreSQL ou chame funções RPC (`supabase.rpc('get_stock_metrics')`) para que o banco processe a matemática e retorne apenas o valor numérico final.

---

## 2. Otimização de Leituras e Tráfego (Egress)
- **Paginação Obrigatória:** Nenhuma tela de listagem (catálogo de produtos, painel de estoque, histórico de entradas) tem permissão para puxar a tabela inteira do banco de uma só vez. Todas as consultas de listagem com `select()` devem implementar paginação usando `.range(from, to)` ou `.limit(n)`.
- **Seleção Específica de Colunas:** Ao montar listas ou tabelas no frontend, solicite apenas as colunas essenciais para a visualização gráfica (ex.: `select('id, name, sku, image_url')`).

---

## 3. Gerenciamento de Arquivos e Mídia (Supabase Storage)
- **Restrição de Tamanho de Upload:** O limite máximo de upload para imagens é fixado em **3MB** por arquivo. Não aplicar restrições mais agressivas nesta fase do sistema.
- **Armazenamento Isolado:** Nenhuma imagem deve ser salva em formato *base64* dentro das tabelas do banco de dados relacional. Todas as fotos devem ser enviadas para o bucket do Supabase Storage (`product-images`), salvando apenas a URL pública (ou path referencial) na tabela do produto/triagem.
- **Conversão de Formato (Frontend):** O frontend converte automaticamente toda imagem capturada no input para o formato `.webp` via Canvas antes do upload (`supabase.storage.from().upload()`), garantindo que o arquivo convertido respeite o teto de 3MB.

---

## 4. Padrão de Tratamento de Erros e Limites
- Todas as chamadas do Supabase devem ser envolvidas em blocos `try...catch`.
- Se o upload exceder 3MB, o cliente bloqueia o envio imediatamente e exibe um alerta amigável ao operador, sem consumir tráfego de rede desnecessário.
