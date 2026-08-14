/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, 
  Calendar, 
  Search, 
  Package, 
  Clock, 
  Boxes,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  FileSpreadsheet,
  Plus,
  Download,
  Upload,
  Edit2,
  Trash2,
  Layers,
  Sparkles,
  BarChart3,
  Table as TableIcon,
  CheckCircle2,
  ArrowUpDown,
  RotateCcw
} from 'lucide-react';
import { BaseProduct, TriageUnit, DailyInflowRecord, isMigrationUnit } from '../types';
import ExcelInflowImportModal from './ExcelInflowImportModal';
import ManualDailyInflowModal from './ManualDailyInflowModal';
import { 
  downloadInflowTemplate, 
  exportInflowRecordsToExcel, 
  formatBrDate, 
  getWeekdayName,
  groupRecordsByWeek 
} from '../utils/excelHelpers';

interface ProductMovementsProps {
  products: BaseProduct[];
  units: TriageUnit[];
  dailyInflows?: DailyInflowRecord[];
  onSaveDailyInflow?: (record: DailyInflowRecord) => Promise<void>;
  onSaveBatchDailyInflows?: (records: DailyInflowRecord[]) => Promise<number>;
  onDeleteDailyInflow?: (id: string) => Promise<void>;
  onSaveTriage: (unit: TriageUnit) => Promise<void>;
  userRole: 'admin' | 'operator' | null;
}

export default function ProductMovements({ 
  products, 
  units, 
  dailyInflows = [],
  onSaveDailyInflow,
  onSaveBatchDailyInflows,
  onDeleteDailyInflow,
  onSaveTriage, 
  userRole 
}: ProductMovementsProps) {
  // Navigation & View mode
  const [activeView, setActiveView] = useState<'spreadsheet' | 'visual'>('spreadsheet');

  // Modals state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingInflow, setEditingInflow] = useState<DailyInflowRecord | null>(null);
  const [defaultEntryDate, setDefaultEntryDate] = useState<string>('');

  // Current month string limit (e.g., "2026-08") - strictly latest allowed
  const currentMonthStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Available months list extracted from dailyInflows, triage units and past history up to current month
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    
    // Always include current month
    monthsSet.add(currentMonthStr);
    
    // Generate past 24 months fallback
    const [currY, currM] = currentMonthStr.split('-').map(Number);
    for (let i = 0; i < 24; i++) {
      const d = new Date(currY, (currM - 1) - i, 1);
      const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (mStr <= currentMonthStr) {
        monthsSet.add(mStr);
      }
    }
    
    // Add months from daily inflows (only up to current month)
    dailyInflows.forEach(item => {
      if (item.date && item.date.length >= 7) {
        const mStr = item.date.substring(0, 7);
        if (mStr <= currentMonthStr) {
          monthsSet.add(mStr);
        }
      }
    });

    // Add months from actual triage units (only up to current month)
    units.forEach(u => {
      try {
        const d = new Date(u.createdAt);
        if (!isNaN(d.getTime())) {
          const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (mStr <= currentMonthStr) {
            monthsSet.add(mStr);
          }
        }
      } catch (e) {}
    });
    
    // Convert to sorted array descending (index 0 is currentMonthStr)
    return Array.from(monthsSet).filter(m => m <= currentMonthStr).sort().reverse();
  }, [units, dailyInflows, currentMonthStr]);

  // Selected Month state ("YYYY-MM"), strictly default to current month or valid past month
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return currentMonthStr;
  });

  // Strict clamp: never allow selectedMonth to exceed currentMonthStr
  useEffect(() => {
    if (selectedMonth > currentMonthStr) {
      setSelectedMonth(currentMonthStr);
    }
  }, [selectedMonth, currentMonthStr]);

  // Check if currently viewing the latest/current month
  const isCurrentMonth = selectedMonth >= currentMonthStr;

  // Filter selection states
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [dailyViewType, setDailyViewType] = useState<'calendar' | 'chart'>('calendar');
  const [searchQuery, setSearchQuery] = useState('');

  // Reset day/week filters when selected month changes
  useEffect(() => {
    setSelectedDay(null);
    setSelectedWeek(null);
  }, [selectedMonth]);

  // Navigate months helper - Go back in time (Mês anterior)
  const handlePrevMonth = () => {
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex !== -1 && currentIndex < availableMonths.length - 1) {
      setSelectedMonth(availableMonths[currentIndex + 1]);
    } else {
      const [y, m] = selectedMonth.split('-').map(Number);
      const prevDate = new Date(y, m - 2, 1);
      const mStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      setSelectedMonth(mStr);
    }
  };

  // Navigate months helper - Advance towards current month (never past current month)
  const handleNextMonth = () => {
    if (isCurrentMonth) return;
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex > 0) {
      const nextMonth = availableMonths[currentIndex - 1];
      if (nextMonth <= currentMonthStr) {
        setSelectedMonth(nextMonth);
      }
    }
  };

  // Safe Date Parts extractor for local date handling
  const getDateParts = (dateVal: string | Date | undefined) => {
    if (!dateVal) return null;
    try {
      if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateVal)) {
        const [y, m, d] = dateVal.substring(0, 10).split('-').map(Number);
        const dt = new Date(y, m - 1, d, 12, 0, 0);
        return {
          year: y,
          monthIdx: m - 1,
          day: d,
          dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          time: dt.getTime()
        };
      }
      const dt = new Date(dateVal);
      if (isNaN(dt.getTime())) return null;
      const y = dt.getFullYear();
      const m = dt.getMonth();
      const d = dt.getDate();
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return { year: y, monthIdx: m, day: d, dateStr, time: dt.getTime() };
    } catch {
      return null;
    }
  };

  // Parse Year and Month index
  const { selectedYear, selectedMonthIdx, monthName, daysInMonth } = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10) || new Date().getFullYear();
    const monthIdx = (parseInt(monthStr, 10) || 1) - 1; // 0-indexed
    
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    const dim = new Date(year, monthIdx + 1, 0).getDate();
    
    return {
      selectedYear: year,
      selectedMonthIdx: monthIdx,
      monthName: monthNames[monthIdx] || 'Mês',
      daysInMonth: dim
    };
  }, [selectedMonth]);

  // Extract all triage units for the selected month (ignoring spreadsheet migration items)
  const monthUnits = useMemo(() => {
    return units.filter(u => {
      if (isMigrationUnit(u)) return false; // Ignore migration items for RMA inflow flux
      const parts = getDateParts(u.createdAt);
      if (!parts) return false;
      return parts.year === selectedYear && parts.monthIdx === selectedMonthIdx;
    });
  }, [units, selectedYear, selectedMonthIdx]);

  // Filter and unify daily inflows for selected month (including triaged units)
  const monthDailyInflows = useMemo(() => {
    // 1. Get explicit daily inflows from collection
    const explicitInflows = dailyInflows
      .filter(item => item.date.startsWith(selectedMonth))
      .map(item => ({ ...item }));

    const explicitDateMap = new Map<string, DailyInflowRecord>();
    explicitInflows.forEach(item => {
      explicitDateMap.set(item.date, item);
    });

    // 2. Aggregate triage units by day
    const unitsByDay = new Map<string, { rma: number; estoque: number; openbox: number; es: number; total: number }>();
    monthUnits.forEach(u => {
      const parts = getDateParts(u.createdAt);
      if (parts && parts.year === selectedYear && parts.monthIdx === selectedMonthIdx) {
        const dStr = parts.dateStr;
        if (!unitsByDay.has(dStr)) {
          unitsByDay.set(dStr, { rma: 0, estoque: 0, openbox: 0, es: 0, total: 0 });
        }
        const bucket = unitsByDay.get(dStr)!;
        bucket.total++;
        if (u.destinationSector === 'Openbox') {
          bucket.openbox++;
        } else if (u.destinationSector === 'Principal') {
          bucket.estoque++;
        } else if (u.destinationSector === 'Descarte') {
          bucket.es++;
        } else {
          bucket.rma++;
        }
      }
    });

    // 3. Build unified records
    const unifiedMap = new Map<string, DailyInflowRecord>();

    // Add all explicit records
    explicitDateMap.forEach((rec, dateStr) => {
      const uStats = unitsByDay.get(dateStr);
      if (uStats) {
        // Merge so that if triaged units are higher or recorded in real-time, they are reflected
        unifiedMap.set(dateStr, {
          ...rec,
          rma: Math.max(rec.rma || 0, uStats.rma),
          estoque: Math.max(rec.estoque || 0, uStats.estoque),
          openbox: Math.max(rec.openbox || 0, uStats.openbox),
          es: Math.max(rec.es || 0, uStats.es),
          totalDia: Math.max(rec.totalDia || 0, uStats.total)
        });
      } else {
        unifiedMap.set(dateStr, rec);
      }
    });

    // Add any days with triaged units that don't have an explicit daily inflow record yet
    unitsByDay.forEach((stats, dateStr) => {
      if (!unifiedMap.has(dateStr)) {
        unifiedMap.set(dateStr, {
          id: `triage-auto-${dateStr}`,
          date: dateStr,
          rma: stats.rma,
          estoque: stats.estoque,
          openbox: stats.openbox,
          es: stats.es,
          totalDia: stats.total,
          notes: 'Lançamento automático de Triagem',
          source: 'manual',
          updatedAt: new Date().toISOString()
        });
      }
    });

    return Array.from(unifiedMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyInflows, selectedMonth, monthUnits, selectedYear, selectedMonthIdx]);

  // Group month daily inflows by week for the spreadsheet view
  const weekSummaries = useMemo(() => {
    return groupRecordsByWeek(monthDailyInflows);
  }, [monthDailyInflows]);

  // Total summary for selected month
  const monthTotals = useMemo(() => {
    let totalRma = 0;
    let totalEstoque = 0;
    let totalOpenbox = 0;
    let totalEs = 0;
    let totalGeral = 0;

    monthDailyInflows.forEach(r => {
      totalRma += r.rma || 0;
      totalEstoque += r.estoque || 0;
      totalOpenbox += r.openbox || 0;
      totalEs += r.es || 0;
      totalGeral += r.totalDia || 0;
    });

    const activeDaysCount = monthDailyInflows.length;
    const avgDaily = activeDaysCount > 0 ? (totalGeral / activeDaysCount).toFixed(1) : '0';

    return {
      totalRma,
      totalEstoque,
      totalOpenbox,
      totalEs,
      totalGeral,
      activeDaysCount,
      avgDaily
    };
  }, [monthDailyInflows]);

  // Compute entries per day across all days in month
  const dailyCounts = useMemo(() => {
    const counts = Array(daysInMonth).fill(0);

    monthDailyInflows.forEach(item => {
      const parts = getDateParts(item.date);
      if (parts && parts.year === selectedYear && parts.monthIdx === selectedMonthIdx) {
        if (parts.day >= 1 && parts.day <= daysInMonth) {
          counts[parts.day - 1] += item.totalDia;
        }
      }
    });

    return counts;
  }, [monthDailyInflows, daysInMonth, selectedYear, selectedMonthIdx]);

  // Compute dynamic calendar weeks covering EVERY day of the month without gaps
  const monthWeeks = useMemo(() => {
    const weeks: {
      index: number;
      title: string;
      range: string;
      startDate: Date;
      endDate: Date;
    }[] = [];

    const firstDayOfMonth = new Date(selectedYear, selectedMonthIdx, 1, 0, 0, 0, 0);
    const lastDayOfMonth = new Date(selectedYear, selectedMonthIdx, daysInMonth, 23, 59, 59, 999);

    // Find the Monday of the week containing firstDayOfMonth
    let currMon = new Date(firstDayOfMonth);
    const dayOfWeek = currMon.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    currMon.setDate(currMon.getDate() + diffToMon);
    currMon.setHours(0, 0, 0, 0);

    let weekNumber = 1;
    while (currMon <= lastDayOfMonth) {
      const sunDate = new Date(currMon);
      sunDate.setDate(sunDate.getDate() + 6);
      sunDate.setHours(23, 59, 59, 999);

      const friDate = new Date(currMon);
      friDate.setDate(friDate.getDate() + 4);

      const startMonNum = currMon.getDate();
      const startMonMonth = currMon.getMonth();
      const endFriNum = friDate.getDate();
      const endFriMonth = friDate.getMonth();

      let rangeStr = '';
      if (startMonMonth === endFriMonth) {
        rangeStr = `${String(startMonNum).padStart(2, '0')} a ${String(endFriNum).padStart(2, '0')}`;
      } else {
        const m1 = String(startMonMonth + 1).padStart(2, '0');
        const m2 = String(endFriMonth + 1).padStart(2, '0');
        rangeStr = `${String(startMonNum).padStart(2, '0')}/${m1} a ${String(endFriNum).padStart(2, '0')}/${m2}`;
      }

      weeks.push({
        index: weeks.length,
        title: `Semana ${weekNumber++}`,
        range: rangeStr,
        startDate: new Date(currMon),
        endDate: new Date(sunDate)
      });

      currMon.setDate(currMon.getDate() + 7);
    }

    return weeks;
  }, [selectedYear, selectedMonthIdx, daysInMonth]);

  // Compute entries per week based on monthWeeks & dailyCounts
  const weeklyCounts = useMemo(() => {
    const counts = Array(monthWeeks.length).fill(0);
    
    monthWeeks.forEach((week, wIdx) => {
      const startT = week.startDate.getTime();
      const endT = week.endDate.getTime();

      for (let d = 1; d <= daysInMonth; d++) {
        const dayTime = new Date(selectedYear, selectedMonthIdx, d, 12, 0, 0).getTime();
        if (dayTime >= startT && dayTime <= endT) {
          counts[wIdx] += dailyCounts[d - 1];
        }
      }
    });

    return counts;
  }, [monthWeeks, dailyCounts, daysInMonth, selectedYear, selectedMonthIdx]);

  // Peak metrics
  const peakMetrics = useMemo(() => {
    let peakWeekIdx = 0;
    let maxWeekVal = 0;
    weeklyCounts.forEach((val, idx) => {
      if (val > maxWeekVal) {
        maxWeekVal = val;
        peakWeekIdx = idx;
      }
    });

    let peakDayIdx = 0;
    let maxDayVal = 0;
    dailyCounts.forEach((val, idx) => {
      if (val > maxDayVal) {
        maxDayVal = val;
        peakDayIdx = idx;
      }
    });

    return {
      peakWeek: maxWeekVal > 0 ? { index: peakWeekIdx, value: maxWeekVal } : null,
      peakDay: maxDayVal > 0 ? { index: peakDayIdx, value: maxDayVal } : null,
    };
  }, [weeklyCounts, dailyCounts]);

  // Filtered list of movements (for unit view - excluding migration items)
  const filteredMovements = useMemo(() => {
    return units.filter(u => {
      if (isMigrationUnit(u)) return false; // Ignore migration items
      const parts = getDateParts(u.createdAt);
      if (!parts) return false;
      if (
        parts.year !== selectedYear ||
        parts.monthIdx !== selectedMonthIdx
      ) {
        return false;
      }

      if (selectedDay !== null && parts.day !== selectedDay) {
        return false;
      }

      if (selectedWeek !== null && monthWeeks[selectedWeek]) {
        const targetWeek = monthWeeks[selectedWeek];
        const dayTime = new Date(parts.year, parts.monthIdx, parts.day, 12, 0, 0).getTime();
        if (dayTime < targetWeek.startDate.getTime() || dayTime > targetWeek.endDate.getTime()) {
          return false;
        }
      }

      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchesSku = u.baseProductSku?.toLowerCase().includes(query);
        const matchesName = u.baseProductName?.toLowerCase().includes(query);
        const matchesTracking = u.trackingCode?.toLowerCase().includes(query);
        const matchesSerial = u.serialNumber?.toLowerCase().includes(query);
        const matchesPlatform = u.platform?.toLowerCase().includes(query);
        const matchesSector = u.destinationSector?.toLowerCase().includes(query);
        return matchesSku || matchesName || matchesTracking || matchesSerial || matchesPlatform || matchesSector;
      }

      return true;
    }).sort((a, b) => {
      const ta = getDateParts(a.createdAt)?.time || 0;
      const tb = getDateParts(b.createdAt)?.time || 0;
      return tb - ta;
    });
  }, [units, selectedYear, selectedMonthIdx, selectedDay, selectedWeek, searchQuery, monthWeeks]);

  const maxWeeklyCount = Math.max(...weeklyCounts, 1);
  const maxDailyCount = Math.max(...dailyCounts, 1);

  // Calendar info for 7-day calendar grid
  const firstDayWeekday = new Date(selectedYear, selectedMonthIdx, 1).getDay();
  const calendarDays = useMemo(() => {
    const days: ({ dayNum: number; count: number; dateStr: string } | null)[] = [];

    for (let i = 0; i < firstDayWeekday; i++) {
      days.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const count = dailyCounts[d - 1];
      const dateStr = `${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dayNum: d,
        count,
        dateStr
      });
    }

    return days;
  }, [firstDayWeekday, daysInMonth, dailyCounts, selectedYear, selectedMonthIdx]);

  // Format month name to show in select dropdown
  const formatMonthOptionName = (mStr: string) => {
    const [y, m] = mStr.split('-');
    const mNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${mNames[parseInt(m, 10) - 1]} / ${y}`;
  };

  // Handlers for manual and excel imports
  const handleOpenManualEntry = (dateStr?: string, existingRecord?: DailyInflowRecord) => {
    if (existingRecord) {
      setEditingInflow(existingRecord);
      setDefaultEntryDate(existingRecord.date);
    } else {
      setEditingInflow(null);
      setDefaultEntryDate(dateStr || `${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}-01`);
    }
    setIsManualModalOpen(true);
  };

  const handleSaveInflowRecord = async (record: DailyInflowRecord) => {
    if (onSaveDailyInflow) {
      await onSaveDailyInflow(record);
    }
  };

  const handleDeleteInflowRecord = async (id: string) => {
    if (onDeleteDailyInflow) {
      await onDeleteDailyInflow(id);
    }
  };

  const handleConfirmExcelImport = async (records: DailyInflowRecord[]): Promise<number> => {
    if (onSaveBatchDailyInflows) {
      const count = await onSaveBatchDailyInflows(records);
      // If records imported were for another month, switch to that month
      if (records.length > 0) {
        const firstMonth = records[0].date.substring(0, 7);
        setSelectedMonth(firstMonth);
      }
      return count;
    }
    return 0;
  };

  return (
    <div className="space-y-6" id="product-movements-tab">
      
      {/* Top Header Card with Title and Actions */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 bg-slate-900/50 p-6 rounded-2xl border border-slate-800/60 shadow-md">
        <div>
          <div className="flex items-center gap-2 text-sky-400 font-bold text-xs uppercase tracking-wider mb-1">
            <Boxes className="w-4 h-4" />
            Fluxo de Entradas
          </div>
          <h2 className="text-xl font-black text-white">Fluxo de Entradas & Importação Excel</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Consolide o banco de dados de entradas com importação de planilhas Excel, lançamentos manuais por dia e totalização semanal automatizada.
          </p>
        </div>

        {/* Toolbar & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 shadow-inner">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-slate-900 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Mês Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-black text-white border-0 focus:ring-0 focus:outline-none cursor-pointer px-2 text-center"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m} className="bg-slate-950 text-slate-200 font-bold">
                  {formatMonthOptionName(m)}
                </option>
              ))}
            </select>

            <button
              onClick={handleNextMonth}
              disabled={isCurrentMonth}
              className={`p-1.5 rounded-lg transition-colors ${
                isCurrentMonth
                  ? 'text-slate-600 cursor-not-allowed opacity-30'
                  : 'hover:bg-slate-900 text-slate-400 hover:text-white cursor-pointer'
              }`}
              title={isCurrentMonth ? "Mês atual (limite mais recente)" : "Próximo Mês"}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Action: Manual Entry */}
          <button
            onClick={() => handleOpenManualEntry()}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Lançamento Manual</span>
          </button>

          {/* Action: Excel Import */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Importar Planilha</span>
          </button>

          {/* Action: Export Excel */}
          <button
            onClick={() => exportInflowRecordsToExcel(monthDailyInflows.length > 0 ? monthDailyInflows : dailyInflows, `fluxo_entradas_${selectedMonth}.xlsx`)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
            title="Exportar dados para Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar</span>
          </button>

          {/* Action: Download Template */}
          <button
            onClick={downloadInflowTemplate}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs rounded-xl border border-slate-700 transition-all cursor-pointer"
            title="Baixar Modelo de Planilha (.xlsx)"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveView('spreadsheet')}
            className={`px-4 py-2 rounded-lg text-xs font-black tracking-wide flex items-center gap-2 transition-all cursor-pointer ${
              activeView === 'spreadsheet'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <TableIcon className="w-4 h-4" />
            <span>Tabela Consolidada (Planilha)</span>
          </button>

          <button
            onClick={() => setActiveView('visual')}
            className={`px-4 py-2 rounded-lg text-xs font-black tracking-wide flex items-center gap-2 transition-all cursor-pointer ${
              activeView === 'visual'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Visão Gráfica & Calendário</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-medium">
          <Calendar className="w-4 h-4 text-blue-400" />
          <span>Período: <strong className="text-white">{monthName} / {selectedYear}</strong></span>
        </div>
      </div>

      {/* VIEW 1: SPREADSHEET TABLE (Planilha Consolidada - EXACTLY like user screenshot) */}
      {activeView === 'spreadsheet' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Monthly KPI Statistics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-[#0f172a]/70 border border-slate-800/80 p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Entradas</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-emerald-400">{monthTotals.totalGeral}</span>
                <span className="text-[10px] text-slate-500 font-bold">un</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1">{monthTotals.activeDaysCount} dias com entrada</span>
            </div>

            <div className="bg-[#0f172a]/70 border border-slate-800/80 p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">RMA (Triagem)</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-blue-400">{monthTotals.totalRma}</span>
                <span className="text-[10px] text-slate-500 font-bold">un</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1">Garantia / Devoluções</span>
            </div>

            <div className="bg-[#0f172a]/70 border border-slate-800/80 p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Estoque Geral</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-emerald-400">{monthTotals.totalEstoque}</span>
                <span className="text-[10px] text-slate-500 font-bold">un</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1">Almoxarifado</span>
            </div>

            <div className="bg-[#0f172a]/70 border border-slate-800/80 p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Openbox</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-amber-400">{monthTotals.totalOpenbox}</span>
                <span className="text-[10px] text-slate-500 font-bold">un</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1">Reembalados / Testados</span>
            </div>

            <div className="bg-[#0f172a]/70 border border-slate-800/80 p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">ES (Especial)</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-purple-400">{monthTotals.totalEs}</span>
                <span className="text-[10px] text-slate-500 font-bold">un</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1">Lotes Especiais</span>
            </div>

            <div className="bg-[#0f172a]/70 border border-slate-800/80 p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Média Diária</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-sky-400">{monthTotals.avgDaily}</span>
                <span className="text-[10px] text-slate-500 font-bold">un/dia</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1">No período ativo</span>
            </div>
          </div>

          {/* Spreadsheet Table Container */}
          <div className="bg-[#0d1527] border border-slate-800/80 rounded-2xl overflow-hidden shadow-lg">
            {/* Table Header Controls */}
            <div className="p-4 bg-slate-950/80 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-black text-white">
                  Planilha Consolidada de Entradas • {monthName} / {selectedYear}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenManualEntry()}
                  className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo Lançamento Diário</span>
                </button>
              </div>
            </div>

            {/* Table Content */}
            {weekSummaries.length === 0 ? (
              <div className="py-16 px-6 text-center space-y-4">
                <div className="w-14 h-14 bg-slate-900 text-slate-500 rounded-2xl flex items-center justify-center mx-auto border border-slate-800">
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-200">Nenhum lançamento diário para {monthName} de {selectedYear}</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Você pode importar uma planilha Excel (.xlsx) com o fluxo de entradas ou realizar lançamentos manuais por dia.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Importar Planilha Excel</span>
                  </button>
                  <button
                    onClick={() => handleOpenManualEntry(`${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}-01`)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Lançar Manualmente</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  {/* Table Column Headers */}
                  <thead>
                    <tr className="bg-slate-950 text-slate-300 font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-800">
                      <th className="py-3 px-4 w-44">DATA</th>
                      <th className="py-3 px-4 text-center w-24 text-blue-400">RMA</th>
                      <th className="py-3 px-4 text-center w-28 text-emerald-400">ESTOQUE</th>
                      <th className="py-3 px-4 text-center w-28 text-amber-400">OPENBOX</th>
                      <th className="py-3 px-4 text-center w-24 text-purple-400">ES</th>
                      <th className="py-3 px-4 text-center w-28 bg-slate-900/90 text-white font-black">TOTAL DIA</th>
                      <th className="py-3 px-4 text-center w-36 bg-blue-950/40 text-sky-300 font-black">TOTAL SEMANA</th>
                      <th className="py-3 px-4 text-right w-24">AÇÕES</th>
                    </tr>
                  </thead>

                  {/* Table Body Grouped By Weeks */}
                  <tbody className="divide-y divide-slate-800/60">
                    {weekSummaries.map((week, weekIdx) => {
                      const weekRowCount = week.records.length;
                      const middleRowIdx = Math.floor(weekRowCount / 2);

                      return (
                        <React.Fragment key={week.startDate}>
                          {/* Week Group Banner */}
                          <tr className="bg-slate-950/60 border-t-2 border-slate-800">
                            <td colSpan={8} className="py-2 px-4">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded bg-blue-600/20 text-blue-400 font-black text-[10px] uppercase tracking-wider border border-blue-500/20">
                                    {week.weekLabel}
                                  </span>
                                  <span className="text-slate-400 text-[11px]">
                                    {week.records.length} dia(s) registrado(s)
                                  </span>
                                </div>
                                <div className="font-mono text-xs text-sky-400 font-black">
                                  Subtotal da Semana: <strong className="text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-800">{week.totalWeek} un</strong>
                                </div>
                              </div>
                            </td>
                          </tr>

                          {/* Daily Rows in this week */}
                          {week.records.map((record, rIdx) => {
                            const isMiddleRow = rIdx === middleRowIdx;

                            return (
                              <tr 
                                key={record.id}
                                className="hover:bg-slate-800/30 transition-colors group"
                              >
                                {/* DATA */}
                                <td className="py-3 px-4 font-mono font-bold text-slate-200">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                                    <span>{formatBrDate(record.date)}</span>
                                    <span className="text-[10px] font-sans font-normal text-slate-400">
                                      ({getWeekdayName(record.date)})
                                    </span>
                                  </div>
                                  {record.notes && (
                                    <span className="text-[10px] text-slate-500 block truncate max-w-xs pl-4 font-sans font-normal">
                                      {record.notes}
                                    </span>
                                  )}
                                </td>

                                {/* RMA */}
                                <td className="py-3 px-4 text-center font-mono font-bold text-blue-400">
                                  {record.rma}
                                </td>

                                {/* ESTOQUE */}
                                <td className="py-3 px-4 text-center font-mono font-bold text-emerald-400">
                                  {record.estoque}
                                </td>

                                {/* OPENBOX */}
                                <td className="py-3 px-4 text-center font-mono font-bold text-amber-400">
                                  {record.openbox}
                                </td>

                                {/* ES */}
                                <td className="py-3 px-4 text-center font-mono font-bold text-purple-400">
                                  {record.es}
                                </td>

                                {/* TOTAL DIA */}
                                <td className="py-3 px-4 text-center font-mono font-black text-white bg-slate-950/40 text-sm">
                                  {record.totalDia}
                                </td>

                                {/* TOTAL SEMANA (Rendered across the week or in middle row matching image) */}
                                <td className="py-3 px-4 text-center font-mono font-black bg-blue-950/20 text-sky-300">
                                  {isMiddleRow ? (
                                    <span className="px-2.5 py-1 rounded-lg bg-blue-600/30 border border-blue-500/30 text-white font-extrabold text-sm shadow-sm inline-block">
                                      {week.totalWeek}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600 text-xs">-</span>
                                  )}
                                </td>

                                {/* AÇÕES */}
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => handleOpenManualEntry(record.date, record)}
                                      className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-blue-400 rounded-lg transition-colors cursor-pointer"
                                      title="Editar Lançamento"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteInflowRecord(record.id)}
                                      className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                                      title="Excluir Lançamento"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}

                    {/* Table Footer Grand Totals */}
                    <tr className="bg-slate-950 text-white font-black border-t-2 border-slate-700 text-xs">
                      <td className="py-4 px-4 uppercase tracking-wider">
                        TOTAL GERAL DO MÊS ({monthName})
                      </td>
                      <td className="py-4 px-4 text-center font-mono text-blue-400 text-sm">{monthTotals.totalRma}</td>
                      <td className="py-4 px-4 text-center font-mono text-emerald-400 text-sm">{monthTotals.totalEstoque}</td>
                      <td className="py-4 px-4 text-center font-mono text-amber-400 text-sm">{monthTotals.totalOpenbox}</td>
                      <td className="py-4 px-4 text-center font-mono text-purple-400 text-sm">{monthTotals.totalEs}</td>
                      <td className="py-4 px-4 text-center font-mono text-emerald-400 text-base bg-slate-900">{monthTotals.totalGeral}</td>
                      <td className="py-4 px-4 text-center font-mono text-sky-400 text-base bg-blue-950/40">{monthTotals.totalGeral}</td>
                      <td className="py-4 px-4 text-right">
                        <button
                          onClick={() => exportInflowRecordsToExcel(monthDailyInflows, `fluxo_entradas_${selectedMonth}.xlsx`)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded border border-slate-700"
                        >
                          Exportar
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: VISUAL GRAPHS & CALENDAR */}
      {activeView === 'visual' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Main Analysis Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Weekly Distribution Card */}
            <div className="lg:col-span-4 bg-[#0d1527] border border-slate-800/50 p-6 rounded-2xl flex flex-col justify-between space-y-4 shadow-sm">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Distribuição Semanal</h3>
                  <span className="text-[10px] px-2 py-0.5 bg-slate-950 rounded border border-slate-800/50 text-slate-400 font-mono">
                    {monthWeeks.length} Semanas
                  </span>
                </div>
                <h4 className="text-sm font-extrabold text-white">Entradas por Semana</h4>
                <p className="text-[10px] text-slate-400 mt-1">Entradas agregadas por bloco semanal.</p>
              </div>

              {/* Weekly custom bars layout */}
              <div className="space-y-3 py-3 flex-1 flex flex-col justify-center">
                {weeklyCounts.map((val, idx) => {
                  const label = monthWeeks[idx];
                  if (!label) return null;
                  const percentage = maxWeeklyCount > 0 ? (val / maxWeeklyCount) * 100 : 0;
                  const isSelected = selectedWeek === idx;

                  return (
                    <div 
                      key={idx}
                      onClick={() => {
                        setSelectedWeek(isSelected ? null : idx);
                        setSelectedDay(null);
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer group flex flex-col space-y-1.5 ${
                        isSelected 
                          ? 'bg-indigo-500/10 border-indigo-500/40 shadow-sm' 
                          : 'bg-slate-950/40 border-slate-900/50 hover:border-slate-800/50'
                      }`}
                    >
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-black tracking-tight ${isSelected ? 'text-indigo-400' : 'text-slate-300'}`}>
                            {label.title}
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">({label.range})</span>
                        </div>
                        <span className="font-mono font-bold text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800/50">
                          {val} un
                        </span>
                      </div>

                      {/* Bar Background */}
                      <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-900 flex">
                        <div 
                          style={{ width: `${Math.max(val > 0 ? 3 : 0, percentage)}%` }}
                          className={`h-full rounded-full transition-all duration-500 relative ${
                            isSelected 
                              ? 'bg-gradient-to-r from-indigo-600 to-indigo-400' 
                              : 'bg-gradient-to-r from-slate-700 to-slate-500 group-hover:from-indigo-600 group-hover:to-indigo-400'
                          }`}
                        >
                          {val > 0 && <div className="absolute inset-0 bg-white/10"></div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Meta breakdown summary */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/50 shrink-0">
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold">Unidades no Mês</span>
                  <span className="font-extrabold text-white text-base mt-0.5 block">
                    {monthTotals.totalGeral || monthUnits.length}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold">Média Semanal</span>
                  <span className="font-extrabold text-white text-base mt-0.5 block">
                    {((monthTotals.totalGeral || monthUnits.length) / Math.max(monthWeeks.length, 1)).toFixed(1)} / sem
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Daily Distribution & Calendar Grid */}
            <div className="lg:col-span-8 bg-[#0d1527] border border-slate-800/50 p-6 rounded-2xl flex flex-col space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/50 pb-4 shrink-0">
                <div>
                  <h3 className="text-sm font-black text-white">Análise Diária • {monthName}</h3>
                  <p className="text-[10px] text-slate-400">Escolha o modo de visualização dos dias e clique para interagir.</p>
                </div>

                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/50 gap-0.5">
                  <button
                    onClick={() => setDailyViewType('calendar')}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black tracking-wide uppercase transition-all cursor-pointer ${
                      dailyViewType === 'calendar' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Calendário
                  </button>
                  <button
                    onClick={() => setDailyViewType('chart')}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black tracking-wide uppercase transition-all cursor-pointer ${
                      dailyViewType === 'chart' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Gráfico Diário
                  </button>
                </div>
              </div>

              {dailyViewType === 'calendar' ? (
                <div className="flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="grid grid-cols-7 gap-1.5 text-center">
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((wd) => (
                        <div key={wd} className="text-[10px] font-black text-slate-500 uppercase tracking-widest py-1">
                          {wd}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1.5">
                      {calendarDays.map((cell, index) => {
                        if (cell === null) {
                          return (
                            <div 
                              key={`empty-${index}`} 
                              className="aspect-square rounded-xl bg-slate-950/10 border border-slate-900/10 opacity-20"
                            />
                          );
                        }

                        const isSelected = selectedDay === cell.dayNum;
                        const hasEntries = cell.count > 0;
                        
                        let bgClass = 'bg-slate-950/40 border-slate-900/50 text-slate-400';
                        let hoverClass = 'hover:border-slate-800 hover:text-slate-200';
                        let countBadgeClass = 'text-[9px] text-slate-500';

                        if (hasEntries) {
                          hoverClass = 'hover:scale-[1.03] duration-150';
                          if (cell.count <= 10) {
                            bgClass = 'bg-indigo-950/20 border-indigo-950/60 text-indigo-300';
                            countBadgeClass = 'text-[10px] text-indigo-400/80 font-bold';
                          } else if (cell.count <= 40) {
                            bgClass = 'bg-indigo-950/70 border-indigo-500/20 text-indigo-200';
                            countBadgeClass = 'text-[10px] text-indigo-300 font-extrabold';
                          } else {
                            bgClass = 'bg-indigo-500/20 border-indigo-500/50 text-indigo-100 font-bold shadow-md shadow-indigo-500/5';
                            countBadgeClass = 'text-[10px] text-indigo-200 font-black';
                          }
                        }

                        if (isSelected) {
                          bgClass = 'bg-indigo-500 text-white ring-2 ring-indigo-500 ring-offset-2 ring-offset-[#0d1527] font-black';
                          countBadgeClass = 'text-[10px] text-indigo-100 font-bold';
                        }

                        return (
                          <div
                            key={`day-${cell.dayNum}`}
                            onClick={() => {
                              setSelectedDay(isSelected ? null : cell.dayNum);
                              setSelectedWeek(null);
                            }}
                            className={`aspect-square rounded-xl border flex flex-col justify-between p-2 cursor-pointer transition-all ${bgClass} ${hoverClass}`}
                            title={`${cell.count} ${cell.count === 1 ? 'entrada' : 'entradas'} no dia ${cell.dayNum} de ${monthName}`}
                          >
                            <span className="text-[11px] font-mono leading-none font-bold">
                              {cell.dayNum}
                            </span>
                            
                            {hasEntries ? (
                              <span className={`text-[10px] font-mono tracking-tighter self-end leading-none ${countBadgeClass}`}>
                                {cell.count} un
                              </span>
                            ) : (
                              <span className="text-[8px] opacity-0 leading-none">0</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-center">
                  <div className="flex flex-col space-y-2">
                    <div className="flex justify-between text-[10px] text-slate-500 px-1">
                      <span>Dia 1</span>
                      <span>Meio do Mês</span>
                      <span>Dia {daysInMonth}</span>
                    </div>
                    
                    <div className="h-72 w-full flex items-end gap-1.5 pt-12 border-b border-slate-800 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-slate-950 pb-2 px-1">
                      {dailyCounts.map((val, idx) => {
                        const dayNum = idx + 1;
                        const heightPercent = maxDailyCount > 0 ? Math.max(6, (val / maxDailyCount) * 75) : 6;
                        const isSelected = selectedDay === dayNum;

                        return (
                          <div 
                            key={idx} 
                            onClick={() => {
                              setSelectedDay(isSelected ? null : dayNum);
                              setSelectedWeek(null);
                            }}
                            className="flex-1 min-w-[16px] max-w-[28px] flex flex-col items-center group relative h-full justify-end cursor-pointer"
                          >
                            <div 
                              style={{ height: `${heightPercent}%` }}
                              className={`w-full rounded-t transition-all duration-300 relative ${
                                isSelected 
                                  ? 'bg-indigo-500 shadow-md ring-1 ring-white/10' 
                                  : val > 0 
                                    ? 'bg-indigo-500/40 group-hover:bg-indigo-500/70' 
                                    : 'bg-slate-900 group-hover:bg-slate-800'
                              }`}
                            >
                              {val > 0 && !isSelected && (
                                <div className="absolute inset-x-0 top-0 h-0.5 bg-white/20"></div>
                              )}

                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 border border-slate-800 text-white font-mono text-[10px] font-black px-2.5 py-1 rounded-lg shadow-xl shadow-slate-950/50 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 pointer-events-none whitespace-nowrap">
                                Dia {dayNum}: {val} un
                                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-slate-900 border-r border-b border-slate-800 rotate-45"></div>
                              </div>
                            </div>
                            
                            <span className={`text-[9px] font-mono font-medium mt-1.5 ${isSelected ? 'text-indigo-400 font-bold' : 'text-slate-500'}`}>
                              {dayNum}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* UNITARY TRIAGE ITEMS LIST (Embedded directly below Calendar & Graph) */}
          <div className="bg-[#0d1527] border border-slate-800/50 p-6 rounded-2xl flex flex-col space-y-4 shadow-sm animate-in fade-in duration-200" id="unit-triage-movements-panel">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/50 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-black text-white">Detalhamento Unitário de RMA / Triagem</h3>
                  <span className="text-[10px] font-mono text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/40 font-bold">
                    {filteredMovements.length} {filteredMovements.length === 1 ? 'item' : 'itens'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {selectedDay !== null ? (
                    <span>
                      Exibindo produtos que deram entrada especificamente no <strong className="text-white">Dia {selectedDay} de {monthName}</strong>.
                    </span>
                  ) : selectedWeek !== null && monthWeeks[selectedWeek] ? (
                    <span>
                      Exibindo produtos da <strong className="text-white">{monthWeeks[selectedWeek].title} ({monthWeeks[selectedWeek].range})</strong>.
                    </span>
                  ) : (
                    <span>
                      Exibindo todos os produtos catalogados na triagem técnica durante o mês de <strong className="text-white">{monthName}</strong>. Clique em um dia do calendário acima para filtrar.
                    </span>
                  )}
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                {(selectedDay !== null || selectedWeek !== null) && (
                  <button
                    onClick={() => {
                      setSelectedDay(null);
                      setSelectedWeek(null);
                    }}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-bold border border-slate-700/80 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Ver todo o mês</span>
                  </button>
                )}
                <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800/50 font-bold">
                  Total no Mês: {monthUnits.length}
                </span>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar por SKU, Produto, Canal, Destino ou Rastreamento..."
                className="w-full bg-slate-950 border border-slate-800/50 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-700 transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* List of Movements */}
            {filteredMovements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 bg-slate-950/20 rounded-2xl border border-dashed border-slate-800/50">
                <div className="p-3 bg-slate-900 rounded-xl text-slate-500">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-300">
                    {selectedDay !== null 
                      ? `Nenhum item unitário registrado no dia ${selectedDay}`
                      : selectedWeek !== null
                        ? `Nenhum item unitário registrado nesta semana`
                        : 'Nenhum item unitário localizado'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-sm leading-relaxed">
                    {selectedDay !== null || selectedWeek !== null ? (
                      <button 
                        onClick={() => { setSelectedDay(null); setSelectedWeek(null); }}
                        className="text-sky-400 underline hover:text-sky-300 font-medium cursor-pointer"
                      >
                        Clique aqui para visualizar todos os aparelhos do mês de {monthName}
                      </button>
                    ) : (
                      'Não há registros individuais de triagem cadastrados neste mês. Novos aparelhos triados aparecerão automaticamente aqui.'
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-slate-950">
                {filteredMovements.map((item) => {
                  const uDate = new Date(item.createdAt);
                  const formattedTime = !isNaN(uDate.getTime()) 
                    ? uDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : '--:--';
                  const formattedDate = !isNaN(uDate.getTime())
                    ? uDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : item.createdAt;

                  return (
                    <div 
                      key={item.id}
                      className="p-3 bg-[#0a0f1d] border border-slate-800/50 hover:border-slate-700/80 rounded-xl flex items-center justify-between gap-4 transition-all text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-1.5 h-9 rounded-full ${
                          item.destinationSector === 'Principal' 
                            ? 'bg-emerald-500' 
                            : item.destinationSector === 'Openbox' 
                              ? 'bg-amber-500' 
                              : 'bg-rose-500'
                        }`}></div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] font-black text-sky-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800/80">
                              {item.baseProductSku}
                            </span>
                            {item.destinationSector !== 'Openbox' && (
                              <span className="text-[10px] font-bold text-slate-400">
                                • {item.platform}
                              </span>
                            )}
                          </div>
                          <p className="font-bold text-white truncate text-xs">{item.baseProductName}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                            <span className="font-mono text-slate-300">{item.trackingCode}</span>
                            {item.serialNumber && (
                              <>
                                <span>•</span>
                                <span className="font-mono text-slate-400">S/N: {item.serialNumber}</span>
                              </>
                            )}
                            <span>•</span>
                            <span className="font-extrabold uppercase text-[9px]" style={{
                              color: item.destinationSector === 'Principal' ? '#10B981' : item.destinationSector === 'Openbox' ? '#F59E0B' : '#EF4444'
                            }}>
                              Setor: {item.destinationSector}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right flex flex-col items-end gap-1 shrink-0">
                        <span className="font-mono text-[10px] text-slate-400 flex items-center gap-1 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800/50">
                          {formattedDate} às {formattedTime}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-sky-950/40 text-sky-400 border border-sky-800/30 rounded font-black uppercase">
                          ENTRADA
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Excel Import Modal */}
      <ExcelInflowImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onConfirmImport={handleConfirmExcelImport}
      />

      {/* Manual Daily Entry Modal */}
      <ManualDailyInflowModal
        isOpen={isManualModalOpen}
        onClose={() => {
          setIsManualModalOpen(false);
          setEditingInflow(null);
        }}
        onSave={handleSaveInflowRecord}
        onDelete={handleDeleteInflowRecord}
        initialData={editingInflow}
        defaultDate={defaultEntryDate}
      />

    </div>
  );
}
