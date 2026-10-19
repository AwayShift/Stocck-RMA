# 📋 Registro Interno de Arquivos Alterados por Data

Este arquivo é mantido internamente no sistema para registrar todos os arquivos modificados no dia de trabalho.
Quando a data muda, a seção **Arquivos Alterados no Dia** é atualizada conforme o novo dia, preservando os dias anteriores no histórico.

---

## 📅 Data Atual: 2026-10-18
- **Total de arquivos alterados hoje:** 10 arquivos

### Lista de Arquivos Alterados Hoje:
1. `src/utils/stiFormatter.ts` - Implementação das funções de código 4 dígitos, validação, compatibilidade legado e busca estrita '#' (isExactHashStiSearch, matchesExactHashSti)
2. `src/components/PhysicalStock.tsx` - Preservação de código antigo na movimentação para Openbox sem pedir novo código e filtro estrito por '#' no estoque
3. `src/components/GlobalSearchBar.tsx` - Suporte a busca estrita com prefixo '#' isolando exclusivamente unidades com o código STI correspondente
4. `src/components/PendingItems.tsx` - Preservação do código legado na transferência para Openbox e busca restrita por '#' nas pendências
5. `src/components/ExcelImportModal.tsx` - Ajuste de maxLength para códigos legados e filtro estrito por '#' na tabela de importação
6. `src/components/ProductMovements.tsx` - Filtro estrito de código STI com prefixo '#' na aba de movimentações diárias
7. `src/components/BaseCatalog.tsx` - Isolamento de busca estrita '#' no catálogo base de produtos
8. `src/components/StiCodeInput.tsx` - Suporte visual e funcional para preservar códigos legados STI sem truncar, além de digitação de novos códigos de 4 dígitos
9. `src/components/StockUnitEditModal.tsx` - Exibição de status 'Código Antigo Mantido' e preservação de códigos legados sem exigir 4 dígitos ao editar
10. `src/App.tsx` - Preservação do caractere '#' ao encaminhar pesquisa global diretamente para o estoque físico

---

## 🗄️ Histórico de Alterações por Data

### 📅 2026-10-16
- `src/utils/stiFormatter.ts`
- `src/components/StiCodeInput.tsx`
- `src/components/StockUnitEditModal.tsx`
- `src/components/PhysicalStock.tsx`
- `src/components/PendingItems.tsx`
- `src/components/ExcelImportModal.tsx`

---

*Nota de Manutenção: Este arquivo é atualizado a cada alteração no sistema. Ao virar a data, a seção 'Data Atual' é renovada automaticamente para refletir as edições do novo dia.*
