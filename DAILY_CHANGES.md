# 📋 Registro Interno de Arquivos Alterados por Data

Este arquivo é mantido internamente no sistema para registrar todos os arquivos modificados no dia de trabalho.
Quando a data muda, a seção **Arquivos Alterados no Dia** é atualizada conforme o novo dia, preservando os dias anteriores no histórico.

---

## 📅 Data Atual: 2026-10-26
- **Total de arquivos alterados hoje:** 3 arquivos

### Lista de Arquivos Alterados Hoje:
1. `src/components/PendingItems.tsx` - Removido fallback que gerava código STI aleatório com número de registro ao dar entrada no RMA
2. `src/components/StockUnitEditModal.tsx` - Sanitização de STIs espúrios herdados de registros no RMA e correção no campo de edição
3. `src/components/PhysicalStock.tsx` - Ignora falsos STIs originados de números de registro no RMA

---

## 🗄️ Histórico de Alterações por Data

### 📅 2026-10-23
- `src/components/PhysicalStock.tsx`
- `src/components/StockUnitEditModal.tsx`
- `src/components/PendingItems.tsx`

### 📅 2026-10-18
- `src/utils/stiFormatter.ts`
- `src/components/PhysicalStock.tsx`
- `src/components/GlobalSearchBar.tsx`
- `src/components/PendingItems.tsx`
- `src/components/ExcelImportModal.tsx`
- `src/components/ProductMovements.tsx`
- `src/components/BaseCatalog.tsx`
- `src/components/StiCodeInput.tsx`
- `src/components/StockUnitEditModal.tsx`
- `src/App.tsx`

### 📅 2026-10-16
- `src/utils/stiFormatter.ts`
- `src/components/StiCodeInput.tsx`
- `src/components/StockUnitEditModal.tsx`
- `src/components/PhysicalStock.tsx`
- `src/components/PendingItems.tsx`
- `src/components/ExcelImportModal.tsx`

---

*Nota de Manutenção: Este arquivo é atualizado a cada alteração no sistema. Ao virar a data, a seção 'Data Atual' é renovada automaticamente para refletir as edições do novo dia.*
