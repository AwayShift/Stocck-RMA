/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar, 
  Search, 
  Package, 
  Boxes,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Filter,
  X,
  FileSpreadsheet,
  Plus,
  Download,
  Upload,
  Edit2,
  Trash2,
  BarChart3,
  Table as TableIcon,
  RotateCcw,
  Clock,
  ArrowUpRight,
  Sun
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
import { getPlatformFilterStyle, getSectorFilterStyle } from '../utils/filterColorHelpers';
import { formatStiBadge } from '../utils/stiFormatter';

interface ProductMovementsProps {
  products: BaseProduct[];
  units: TriageUnit[];
  dailyInflows?: DailyInflowRecord[];
  onSaveDailyInflow?: (record: DailyInflowRecord) => Promise<void>;
  onSaveBatchDailyInflows?: (records: DailyInflowRecord[]) => Promise<number>;
  onDeleteDailyInflow?: (id: string) => Promise<void>;
  onSaveTriage: (unit: TriageUnit) => Promise<void>;
  userRole: 'admin' | 'operator' | null;
  enableSpreadsheetImport?: boolean;
  enableSpreadsheetExport?: boolean;
  isLight?: boolean;
  onNavigateToStockUnit?: (unit: TriageUnit) => void;
}

export default function ProductMovements({ 
  products, 
  units, 
  dailyInflows = [],
  onSaveDailyInflow,
  onSaveBatchDailyInflows,
  onDeleteDailyInflow,
  onSaveTriage, 
  userRole,
  enableSpreadsheetImport = true,
  enableSpreadsheetExport = true,
  isLight = false,
  onNavigateToStockUnit
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

  // Available months list extracted strictly from dailyInflows, triage units and the current active month
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    
    // Always include current month for active entries
    monthsSet.add(currentMonthStr);
    
    // Add months from daily inflows (from imported spreadsheet or manual entries)
    dailyInflows.forEach(item => {
      if (item.date && item.date.length >= 7) {
        const mStr = item.date.substring(0, 7);
        if (/^\d{4}-\d{2}$/.test(mStr)) {
          monthsSet.add(mStr);
        }
      }
    });

    // Add months from actual triage units registered in database
    units.forEach(u => {
      try {
        if (u.createdAt) {
          const d = new Date(u.createdAt);
          if (!isNaN(d.getTime())) {
            const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthsSet.add(mStr);
          }
        }
      } catch (e) {}
    });
    
    // Convert to sorted array descending (newest first, oldest last)
    const sorted = Array.from(monthsSet).sort().reverse();
    return sorted.length > 0 ? sorted : [currentMonthStr];
  }, [units, dailyInflows, currentMonthStr]);

  // Selected Month state ("YYYY-MM")
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    if (dailyInflows && dailyInflows.length > 0) {
      const sortedInflows = [...dailyInflows].sort((a, b) => b.date.localeCompare(a.date));
      if (sortedInflows[0]?.date) {
        return sortedInflows[0].date.substring(0, 7);
      }
    }
    return currentMonthStr;
  });

  // Ensure selectedMonth is valid within availableMonths
  useEffect(() => {
    if (!availableMonths.includes(selectedMonth)) {
      setSelectedMonth(availableMonths[0] || currentMonthStr);
    }
  }, [availableMonths, selectedMonth, currentMonthStr]);

  // Check positions in available list
  const currentMonthIndex = availableMonths.indexOf(selectedMonth);
  const isOldestMonth = currentMonthIndex === -1 || currentMonthIndex >= availableMonths.length - 1;
  const isLatestMonth = currentMonthIndex === -1 || currentMonthIndex <= 0;

  // Filter selection states
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [dailyViewType, setDailyViewType] = useState<'calendar' | 'chart' | 'hourly'>('calendar');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('Todos');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('Todas');
  const [isHourlyCalendarOpen, setIsHourlyCalendarOpen] = useState<boolean>(false);

  // Reset day/week, hour and search filters when selected month changes
  useEffect(() => {
    setSelectedDay(null);
    setSelectedDateStr(null);
    setSelectedWeek(null);
    setSelectedHour(null);
    setSelectedSector('Todos');
    setSelectedPlatform('Todas');
    setSearchQuery('');
  }, [selectedMonth]);

  // Navigate months helper - Go back in time (Mês anterior existente)
  const handlePrevMonth = () => {
    if (isOldestMonth) return;
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex !== -1 && currentIndex < availableMonths.length - 1) {
      setSelectedMonth(availableMonths[currentIndex + 1]);
    }
  };

  // Navigate months helper - Advance towards newer month
  const handleNextMonth = () => {
    if (isLatestMonth) return;
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex > 0) {
      setSelectedMonth(availableMonths[currentIndex - 1]);
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

  // Helper to format Date to YYYY-MM-DD in local time safely
  const formatDateStr = (d: Date) => 
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Compute dynamic calendar weeks covering EVERY day of the month without gaps
  const monthWeeks = useMemo(() => {
    const weeks: {
      index: number;
      weekNumber: number;
      title: string;
      range: string;
      startDate: Date;
      endDate: Date;
      startStr: string;
      endStr: string;
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

      const currentNumber = weekNumber++;
      weeks.push({
        index: weeks.length,
        weekNumber: currentNumber,
        title: `Semana ${currentNumber}`,
        range: rangeStr,
        startDate: new Date(currMon),
        endDate: new Date(sunDate),
        startStr: formatDateStr(currMon),
        endStr: formatDateStr(sunDate)
      });

      currMon.setDate(currMon.getDate() + 7);
    }

    return weeks;
  }, [selectedYear, selectedMonthIdx, daysInMonth]);

  // Calendar bounds covering the full range of all weeks touching this month
  const calendarBounds = useMemo(() => {
    if (monthWeeks.length === 0) {
      return {
        minDateStr: `${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}-01`,
        maxDateStr: `${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
      };
    }
    return {
      minDateStr: monthWeeks[0].startStr,
      maxDateStr: monthWeeks[monthWeeks.length - 1].endStr
    };
  }, [monthWeeks, selectedYear, selectedMonthIdx, daysInMonth]);

  // Extract all triage units within the complete calendar weeks (including adjacent month days)
  const extendedUnits = useMemo(() => {
    return units.filter(u => {
      if (isMigrationUnit(u)) return false; // Ignore migration items for RMA inflow flux
      if (u.excludeFromDailyCount) return false; // Do not count units excluded from daily count in inflow flux
      const parts = getDateParts(u.createdAt);
      if (!parts) return false;
      return parts.dateStr >= calendarBounds.minDateStr && parts.dateStr <= calendarBounds.maxDateStr;
    });
  }, [units, calendarBounds]);

  // Units strictly for the selected month (for monthly metrics)
  const monthUnits = useMemo(() => {
    return extendedUnits.filter(u => {
      const parts = getDateParts(u.createdAt);
      return parts && parts.year === selectedYear && parts.monthIdx === selectedMonthIdx;
    });
  }, [extendedUnits, selectedYear, selectedMonthIdx]);

  // 2. Aggregate triage units by day (shared across calendar and modal)
  const unitsByDayMap = useMemo(() => {
    const map = new Map<string, { rma: number; estoque: number; openbox: number; es: number; total: number }>();
    extendedUnits.forEach(u => {
      const parts = getDateParts(u.createdAt);
      if (parts) {
        const dStr = parts.dateStr;
        if (!map.has(dStr)) {
          map.set(dStr, { rma: 0, estoque: 0, openbox: 0, es: 0, total: 0 });
        }
        const bucket = map.get(dStr)!;
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
    return map;
  }, [extendedUnits]);

  // Filter and unify daily inflows covering the complete calendar weeks (including days from other months)
  const extendedDailyInflows = useMemo(() => {
    // 1. Get explicit daily inflows from collection within the weeks range
    const explicitInflows = dailyInflows
      .filter(item => item.date >= calendarBounds.minDateStr && item.date <= calendarBounds.maxDateStr)
      .map(item => ({ ...item }));

    const explicitDateMap = new Map<string, DailyInflowRecord>();
    explicitInflows.forEach(item => {
      explicitDateMap.set(item.date, item);
    });

    // 3. Build unified records
    const unifiedMap = new Map<string, DailyInflowRecord>();

    // Add all explicit records
    explicitDateMap.forEach((rec, dateStr) => {
      const uStats = unitsByDayMap.get(dateStr);

      if (uStats && uStats.total > 0) {
        // Triage units exist in the system for this day!
        // We ensure real triaged units are never suppressed or hidden by 0s.
        const rma = Math.max(Number(rec.rma || 0), uStats.rma);
        const estoque = Math.max(Number(rec.estoque || 0), uStats.estoque);
        const openbox = Math.max(Number(rec.openbox || 0), uStats.openbox);
        const es = Math.max(Number(rec.es || 0), uStats.es);
        const totalDia = rma + estoque + openbox + es;

        unifiedMap.set(dateStr, {
          ...rec,
          rma,
          estoque,
          openbox,
          es,
          totalDia,
          notes: rec.notes || (rec.source === 'manual' ? '' : 'Lançamento automático de Triagem')
        });
      } else {
        // No triaged units on this day
        if (rec.id?.startsWith('triage-auto-') || rec.source === 'auto') {
          // If it was auto-generated and now has 0 units, skip phantom
        } else {
          const total = Number(rec.rma || 0) + Number(rec.estoque || 0) + Number(rec.openbox || 0) + Number(rec.es || 0);
          unifiedMap.set(dateStr, {
            ...rec,
            rma: Number(rec.rma || 0),
            estoque: Number(rec.estoque || 0),
            openbox: Number(rec.openbox || 0),
            es: Number(rec.es || 0),
            totalDia: total
          });
        }
      }
    });

    // Add any days with triaged units that don't have an explicit daily inflow record yet
    unitsByDayMap.forEach((stats, dateStr) => {
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
          source: 'auto',
          updatedAt: new Date().toISOString()
        });
      }
    });

    return Array.from(unifiedMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyInflows, calendarBounds, unitsByDayMap]);

  // Filter daily inflows strictly belonging to selectedMonth (for monthly totals/metrics)
  const monthDailyInflows = useMemo(() => {
    return extendedDailyInflows.filter(item => item.date.startsWith(selectedMonth));
  }, [extendedDailyInflows, selectedMonth]);

  // Group daily inflows by week for the spreadsheet view, using monthWeeks to ensure exact week order and inclusion of adjacent month days
  const weekSummaries = useMemo(() => {
    return groupRecordsByWeek(extendedDailyInflows, monthWeeks);
  }, [extendedDailyInflows, monthWeeks]);

  // Grand totals across all weeks in the month (including days belonging to weekly cycles)
  const weeksGrandTotal = useMemo(() => {
    let totalRma = 0;
    let totalEstoque = 0;
    let totalOpenbox = 0;
    let totalEs = 0;
    let totalGeral = 0;

    weekSummaries.forEach(w => {
      totalRma += w.totalRma || 0;
      totalEstoque += w.totalEstoque || 0;
      totalOpenbox += w.totalOpenbox || 0;
      totalEs += w.totalEs || 0;
      totalGeral += w.totalWeek || 0;
    });

    const totalBusinessDays = Math.max(monthWeeks.length * 5, 1);
    const avgDailyBusinessDays = (totalGeral / totalBusinessDays).toFixed(1);

    const daysWithEntries = weekSummaries.reduce((sum, w) => {
      return sum + w.records.filter(r => (r.totalDia || 0) > 0).length;
    }, 0);
    const avgDailyActiveDays = daysWithEntries > 0 ? (totalGeral / daysWithEntries).toFixed(1) : '0';

    const activeDaysInWeeks = weekSummaries.reduce((sum, w) => sum + w.records.length, 0);

    return {
      totalRma,
      totalEstoque,
      totalOpenbox,
      totalEs,
      totalGeral,
      totalBusinessDays,
      daysWithEntries,
      activeDaysCount: activeDaysInWeeks,
      avgDaily: avgDailyBusinessDays,
      avgDailyBusinessDays,
      avgDailyActiveDays
    };
  }, [weekSummaries, monthWeeks]);

  // Total summary for selected month (strictly days starting with selectedMonth)
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

    // Count business days (Segunda a Sexta) within selectedMonth
    let civilMonthBusinessDays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dt = new Date(selectedYear, selectedMonthIdx, day, 12, 0, 0);
      const dow = dt.getDay();
      if (dow >= 1 && dow <= 5) civilMonthBusinessDays++;
    }

    const daysWithEntries = monthDailyInflows.filter(r => (r.totalDia || 0) > 0).length;
    const activeDaysCount = monthDailyInflows.length;
    const avgDaily = civilMonthBusinessDays > 0 
      ? (totalGeral / civilMonthBusinessDays).toFixed(1) 
      : (activeDaysCount > 0 ? (totalGeral / activeDaysCount).toFixed(1) : '0');
    const avgDailyActiveDays = daysWithEntries > 0 ? (totalGeral / daysWithEntries).toFixed(1) : '0';

    return {
      totalRma,
      totalEstoque,
      totalOpenbox,
      totalEs,
      totalGeral,
      civilMonthBusinessDays,
      daysWithEntries,
      activeDaysCount,
      avgDaily,
      avgDailyActiveDays
    };
  }, [monthDailyInflows, daysInMonth, selectedYear, selectedMonthIdx]);

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

  // Compute entries per week based on weekSummaries directly, eliminating any divergence with the table
  const weeklyCounts = useMemo(() => {
    return weekSummaries.map(w => w.totalWeek);
  }, [weekSummaries]);

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

  // Base triage units in the selected calendar period (month, or specific week/day)
  const scopeUnits = useMemo(() => {
    return units.filter(u => {
      if (isMigrationUnit(u)) return false; // Ignore migration items
      if (u.excludeFromDailyCount) return false; // Exclude items removed from daily count from inflow flux
      const parts = getDateParts(u.createdAt);
      if (!parts) return false;

      // Filter by specific day if selected (handles both current month and cross-month days)
      if (selectedDateStr) {
        if (parts.dateStr !== selectedDateStr) return false;
      } else if (selectedWeek !== null && monthWeeks[selectedWeek]) {
        // Filter by selected week (covering the full Monday through Sunday of that week)
        const targetWeek = monthWeeks[selectedWeek];
        const dayTime = new Date(parts.year, parts.monthIdx, parts.day, 12, 0, 0).getTime();
        if (dayTime < targetWeek.startDate.getTime() || dayTime > targetWeek.endDate.getTime()) {
          return false;
        }
      } else {
        // Default to selected month
        if (
          parts.year !== selectedYear ||
          parts.monthIdx !== selectedMonthIdx
        ) {
          return false;
        }
      }
      return true;
    });
  }, [units, selectedYear, selectedMonthIdx, selectedDateStr, selectedWeek, monthWeeks]);

  // Available sectors with items in the current scope
  const availableSectors = useMemo(() => {
    const counts: Record<string, number> = {};
    scopeUnits.forEach(u => {
      const sec = (u.destinationSector || '').trim();
      if (sec) {
        counts[sec] = (counts[sec] || 0) + 1;
      }
    });

    const standardOrder = ['Principal', 'Openbox', 'RMA'];
    const result: Array<{ sector: string; count: number }> = [];

    standardOrder.forEach(s => {
      if (counts[s] && counts[s] > 0) {
        result.push({ sector: s, count: counts[s] });
      }
    });

    Object.keys(counts).forEach(s => {
      if (!standardOrder.includes(s) && counts[s] > 0) {
        result.push({ sector: s, count: counts[s] });
      }
    });

    return result;
  }, [scopeUnits]);

  // Available platforms with items in the current scope
  const availablePlatforms = useMemo(() => {
    const counts: Record<string, number> = {};
    scopeUnits.forEach(u => {
      const p = (u.platform || '').trim();
      const key = p && p !== 'N/A' && p !== 'Não Informado' ? p : 'Sem Plataforma';
      counts[key] = (counts[key] || 0) + 1;
    });

    const standardOrder = ['Mercado Livre', 'Shopee', 'Amazon', 'Amazon Ta Novo', 'Kabum'];
    const result: Array<{ platform: string; count: number }> = [];

    standardOrder.forEach(p => {
      if (counts[p] && counts[p] > 0) {
        result.push({ platform: p, count: counts[p] });
      }
    });

    Object.keys(counts).forEach(p => {
      if (!standardOrder.includes(p) && p !== 'Sem Plataforma' && p !== 'Outra' && counts[p] > 0) {
        result.push({ platform: p, count: counts[p] });
      }
    });

    if (counts['Sem Plataforma'] && counts['Sem Plataforma'] > 0) {
      result.push({ platform: 'Sem Plataforma', count: counts['Sem Plataforma'] });
    }

    return result;
  }, [scopeUnits]);

  // Auto reset filters if they no longer exist in the active scope
  useEffect(() => {
    if (selectedSector !== 'Todos' && !availableSectors.some(s => s.sector === selectedSector)) {
      setSelectedSector('Todos');
    }
  }, [availableSectors, selectedSector]);

  useEffect(() => {
    if (selectedPlatform !== 'Todas' && !availablePlatforms.some(p => p.platform === selectedPlatform)) {
      setSelectedPlatform('Todas');
    }
  }, [availablePlatforms, selectedPlatform]);

  // Hourly distribution of registered entries across the 24 hours of the day
  const hourlyDistribution = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${String(i).padStart(2, '0')}:00`,
      total: 0,
      estoque: 0,
      rma: 0,
      openbox: 0,
    }));

    scopeUnits.forEach(u => {
      if (!u.createdAt) return;
      const dt = new Date(u.createdAt);
      if (!isNaN(dt.getTime())) {
        const h = dt.getHours();
        if (h >= 0 && h < 24) {
          hours[h].total++;
          if (u.destinationSector === 'Principal') hours[h].estoque++;
          else if (u.destinationSector === 'Openbox') hours[h].openbox++;
          else hours[h].rma++;
        }
      }
    });

    const maxCount = Math.max(...hours.map(h => h.total), 1);
    const totalInScope = hours.reduce((sum, h) => sum + h.total, 0);

    let peakHour = hours[0];
    hours.forEach(h => {
      if (h.total > peakHour.total) {
        peakHour = h;
      }
    });

    const periods = {
      madrugada: hours.slice(0, 6).reduce((s, h) => s + h.total, 0),
      manha: hours.slice(6, 12).reduce((s, h) => s + h.total, 0),
      tarde: hours.slice(12, 18).reduce((s, h) => s + h.total, 0),
      noite: hours.slice(18, 24).reduce((s, h) => s + h.total, 0),
    };

    return {
      hours,
      maxCount,
      totalInScope,
      peakHour: peakHour.total > 0 ? peakHour : null,
      periods,
    };
  }, [scopeUnits]);

  // List of all days in current month with entry counts for day-specific selection
  const monthDaysOptions = useMemo(() => {
    const list: {
      dayNum: number;
      dateStr: string;
      formattedDate: string;
      weekday: string;
      count: number;
    }[] = [];

    const inflowsMap = new Map<string, number>();
    unitsByDayMap.forEach((stats, dateStr) => {
      inflowsMap.set(dateStr, stats.total);
    });

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const count = inflowsMap.get(dateStr) || 0;
      list.push({
        dayNum: d,
        dateStr,
        formattedDate: `${String(d).padStart(2, '0')}/${String(selectedMonthIdx + 1).padStart(2, '0')}`,
        weekday: getWeekdayName(dateStr),
        count
      });
    }
    return list;
  }, [daysInMonth, selectedYear, selectedMonthIdx, unitsByDayMap]);

  // Filtered list of movements (for unit view - with search, sector, platform and hour filters)
  const filteredMovements = useMemo(() => {
    return scopeUnits.filter(u => {
      // Sector filter
      if (selectedSector !== 'Todos') {
        if (u.destinationSector !== selectedSector) return false;
      }

      // Platform filter
      if (selectedPlatform !== 'Todas') {
        const p = (u.platform || '').trim();
        if (selectedPlatform === 'Sem Plataforma') {
          if (p && p !== 'N/A' && p !== 'Não Informado' && p !== 'Sem Plataforma') return false;
        } else {
          if (p !== selectedPlatform) return false;
        }
      }

      // Hour filter
      if (selectedHour !== null) {
        if (!u.createdAt) return false;
        const dt = new Date(u.createdAt);
        if (isNaN(dt.getTime()) || dt.getHours() !== selectedHour) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchesSku = u.baseProductSku?.toLowerCase().includes(query);
        const matchesName = u.baseProductName?.toLowerCase().includes(query);
        const matchesTracking = u.trackingCode?.toLowerCase().includes(query);
        const matchesSerial = u.serialNumber?.toLowerCase().includes(query);
        const matchesOrder = u.orderNumber?.toLowerCase().includes(query);
        const matchesPlatform = u.platform?.toLowerCase().includes(query);
        const matchesSector = u.destinationSector?.toLowerCase().includes(query);
        return matchesSku || matchesName || matchesTracking || matchesSerial || matchesOrder || matchesPlatform || matchesSector;
      }

      return true;
    }).sort((a, b) => {
      const ta = getDateParts(a.createdAt)?.time || 0;
      const tb = getDateParts(b.createdAt)?.time || 0;
      return tb - ta;
    });
  }, [scopeUnits, selectedSector, selectedPlatform, selectedHour, searchQuery]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedSector('Todos');
    setSelectedPlatform('Todas');
    setSelectedHour(null);
  };

  const hasActiveFilters = searchQuery.trim() !== '' || selectedSector !== 'Todos' || selectedPlatform !== 'Todas' || selectedHour !== null;

  const maxWeeklyCount = Math.max(...weeklyCounts, 1);
  const maxDailyCount = Math.max(...dailyCounts, 1);

  // Calendar info for 7-day calendar grid (Sunday through Saturday)
  const firstDayWeekday = new Date(selectedYear, selectedMonthIdx, 1, 12, 0, 0).getDay();
  const calendarDays = useMemo(() => {
    const days: {
      dayNum: number;
      count: number;
      dateStr: string;
      isAdjacentMonth: boolean;
      monthLabel?: string;
    }[] = [];

    const inflowsMap = new Map<string, DailyInflowRecord>();
    extendedDailyInflows.forEach(item => {
      inflowsMap.set(item.date, item);
    });

    const monthNamesShort = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

    // 1. Fill leading days from previous month to align with Sunday start
    for (let i = 0; i < firstDayWeekday; i++) {
      const d = new Date(selectedYear, selectedMonthIdx, 1 - (firstDayWeekday - i), 12, 0, 0);
      const dateStr = formatDateStr(d);
      const rec = inflowsMap.get(dateStr);
      days.push({
        dayNum: d.getDate(),
        count: rec?.totalDia || 0,
        dateStr,
        isAdjacentMonth: true,
        monthLabel: monthNamesShort[d.getMonth()]
      });
    }

    // 2. Fill days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const rec = inflowsMap.get(dateStr);
      days.push({
        dayNum: d,
        count: rec?.totalDia || 0,
        dateStr,
        isAdjacentMonth: false
      });
    }

    // 3. Fill trailing days from next month to complete the last week grid
    const totalCells = days.length;
    const remainingDays = (7 - (totalCells % 7)) % 7;
    for (let j = 1; j <= remainingDays; j++) {
      const d = new Date(selectedYear, selectedMonthIdx + 1, j, 12, 0, 0);
      const dateStr = formatDateStr(d);
      const rec = inflowsMap.get(dateStr);
      days.push({
        dayNum: d.getDate(),
        count: rec?.totalDia || 0,
        dateStr,
        isAdjacentMonth: true,
        monthLabel: monthNamesShort[d.getMonth()]
      });
    }

    return days;
  }, [firstDayWeekday, daysInMonth, extendedDailyInflows, selectedYear, selectedMonthIdx]);

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
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const targetDate = dateStr || (
      (today.getFullYear() === selectedYear && today.getMonth() === selectedMonthIdx)
        ? todayStr 
        : `${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}-01`
    );

    const matchedRecord = existingRecord || 
      extendedDailyInflows.find(r => r.date === targetDate) || 
      dailyInflows.find(r => r.date === targetDate);

    if (matchedRecord) {
      const cleanRecord = matchedRecord.id?.startsWith('triage-auto-')
        ? { ...matchedRecord, id: undefined as any, source: 'manual' as const }
        : matchedRecord;
      setEditingInflow(cleanRecord);
      setDefaultEntryDate(cleanRecord.date);
    } else {
      setEditingInflow(null);
      setDefaultEntryDate(targetDate);
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
      <div className={`flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 p-6 rounded-2xl border transition-colors ${
        isLight
          ? 'bg-white border-slate-200 shadow-sm'
          : 'bg-slate-900/50 border-slate-800/60 shadow-md'
      }`}>
        <div>
          <div className="flex items-center gap-2 text-sky-500 font-bold text-xs uppercase tracking-wider mb-1">
            <Boxes className="w-4 h-4" />
            Fluxo de Entradas
          </div>
          <h2 className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
            Fluxo de Entradas & Importação Excel
          </h2>
          <p className={`text-xs mt-1 max-w-2xl leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Consolide o banco de dados de entradas com importação de planilhas Excel, lançamentos manuais por dia e totalização semanal automatizada.
          </p>
        </div>

        {/* Toolbar & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month Selector */}
          <div className={`flex items-center gap-1 p-1.5 rounded-xl border transition-colors ${
            isLight
              ? 'bg-slate-100 border-slate-300 shadow-sm'
              : 'bg-slate-950/80 border-slate-800 shadow-inner'
          }`}>
            <button
              onClick={handlePrevMonth}
              disabled={isOldestMonth}
              className={`p-1.5 rounded-lg transition-colors ${
                isOldestMonth
                  ? (isLight ? 'text-slate-300 cursor-not-allowed opacity-30' : 'text-slate-600 cursor-not-allowed opacity-30')
                  : (isLight ? 'hover:bg-slate-200 text-slate-600 hover:text-slate-900 cursor-pointer' : 'hover:bg-slate-900 text-slate-400 hover:text-white cursor-pointer')
              }`}
              title={isOldestMonth ? "Mês mais antigo disponível" : "Mês Anterior"}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className="relative inline-flex items-center">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className={`appearance-none bg-transparent text-xs font-black border-0 focus:ring-0 focus:outline-none cursor-pointer pl-2.5 pr-6 py-1 rounded-lg transition-colors text-center ${
                  isLight
                    ? 'text-slate-800 hover:text-sky-600 hover:bg-slate-200/70'
                    : 'text-white hover:text-sky-300 hover:bg-slate-900/60'
                }`}
              >
                {availableMonths.map((m) => (
                  <option
                    key={m}
                    value={m}
                    className={`font-bold py-1 ${isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}`}
                  >
                    {formatMonthOptionName(m)}
                  </option>
                ))}
              </select>
              <ChevronDown className={`w-3.5 h-3.5 pointer-events-none absolute right-1.5 transition-colors ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`} />
            </div>

            <button
              onClick={handleNextMonth}
              disabled={isLatestMonth}
              className={`p-1.5 rounded-lg transition-colors ${
                isLatestMonth
                  ? (isLight ? 'text-slate-300 cursor-not-allowed opacity-30' : 'text-slate-600 cursor-not-allowed opacity-30')
                  : (isLight ? 'hover:bg-slate-200 text-slate-600 hover:text-slate-900 cursor-pointer' : 'hover:bg-slate-900 text-slate-400 hover:text-white cursor-pointer')
              }`}
              title={isLatestMonth ? "Mês mais recente disponível" : "Próximo Mês"}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Action: Excel Import */}
          {enableSpreadsheetImport && (
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer"
              id="btn-import-movements-excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Importar Planilha</span>
            </button>
          )}

          {/* Action: Export Excel */}
          {enableSpreadsheetExport && (
            <button
              onClick={() => exportInflowRecordsToExcel(monthDailyInflows.length > 0 ? monthDailyInflows : dailyInflows, `fluxo_entradas_${selectedMonth}.xlsx`)}
              className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                isLight 
                  ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-sm' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title="Exportar dados para Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar</span>
            </button>
          )}

          {/* Action: Download Template */}
          <button
            onClick={downloadInflowTemplate}
            className={`p-2 text-xs rounded-xl border transition-all cursor-pointer ${
              isLight
                ? 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-300 shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
            }`}
            title="Baixar Modelo de Planilha (.xlsx)"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className={`flex items-center justify-between border-b pb-3 ${
        isLight ? 'border-slate-200' : 'border-slate-800/80'
      }`}>
        <div className={`flex items-center gap-2 p-1 rounded-xl border ${
          isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-950 border-slate-800'
        }`}>
          <button
            onClick={() => setActiveView('spreadsheet')}
            className={`px-4 py-2 rounded-lg text-xs font-black tracking-wide flex items-center gap-2 transition-all cursor-pointer ${
              activeView === 'spreadsheet'
                ? 'bg-blue-600 text-white shadow-md'
                : (isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white')
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
                : (isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white')
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Visão Gráfica & Calendário</span>
          </button>
        </div>

        <div className={`hidden sm:flex items-center gap-2 text-xs font-medium ${
          isLight ? 'text-slate-500' : 'text-slate-400'
        }`}>
          <Calendar className={`w-4 h-4 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
          <span>Período: <strong className={isLight ? 'text-slate-900 font-extrabold' : 'text-white'}>{monthName} / {selectedYear}</strong></span>
        </div>
      </div>

      {/* VIEW 1: SPREADSHEET TABLE (Planilha Consolidada - EXACTLY like user screenshot) */}
      {activeView === 'spreadsheet' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Monthly KPI Statistics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className={`p-4 rounded-2xl flex flex-col justify-between border transition-colors ${
              isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/80 border-slate-800/80'
            }`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                isLight ? 'text-slate-600' : 'text-slate-400'
              }`}>Total Entradas</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className={`text-2xl font-black ${
                  isLight ? 'text-emerald-600' : 'text-emerald-400'
                }`}>{weeksGrandTotal.totalGeral}</span>
                <span className={`text-[10px] font-bold ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>un</span>
              </div>
              <span className={`text-[10px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                {weeksGrandTotal.totalGeral !== monthTotals.totalGeral 
                  ? `Semanas (${monthTotals.totalGeral} no mês civil)` 
                  : `${weeksGrandTotal.activeDaysCount} dias registrados`}
              </span>
            </div>

            <div className={`p-4 rounded-2xl flex flex-col justify-between border transition-colors ${
              isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/80 border-slate-800/80'
            }`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                isLight ? 'text-slate-600' : 'text-slate-400'
              }`}>Estoque Geral</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className={`text-2xl font-black ${
                  isLight ? 'text-emerald-600' : 'text-emerald-400'
                }`}>{weeksGrandTotal.totalEstoque}</span>
                <span className={`text-[10px] font-bold ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>un</span>
              </div>
              <span className={`text-[10px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Almoxarifado</span>
            </div>

            <div className={`p-4 rounded-2xl flex flex-col justify-between border transition-colors ${
              isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/80 border-slate-800/80'
            }`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                isLight ? 'text-slate-600' : 'text-slate-400'
              }`}>RMA (Triagem)</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className={`text-2xl font-black ${
                  isLight ? 'text-rose-600' : 'text-rose-400'
                }`}>{weeksGrandTotal.totalRma}</span>
                <span className={`text-[10px] font-bold ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>un</span>
              </div>
              <span className={`text-[10px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Garantia / Devoluções</span>
            </div>

            <div className={`p-4 rounded-2xl flex flex-col justify-between border transition-colors ${
              isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/80 border-slate-800/80'
            }`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                isLight ? 'text-slate-600' : 'text-slate-400'
              }`}>Openbox</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className={`text-2xl font-black ${
                  isLight ? 'text-amber-600' : 'text-amber-400'
                }`}>{weeksGrandTotal.totalOpenbox}</span>
                <span className={`text-[10px] font-bold ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>un</span>
              </div>
              <span className={`text-[10px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Reembalados / Testados</span>
            </div>

            <div className={`p-4 rounded-2xl flex flex-col justify-between border transition-colors ${
              isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/80 border-slate-800/80'
            }`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                isLight ? 'text-slate-600' : 'text-slate-400'
              }`}>ES (Espírito Santo)</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className={`text-2xl font-black ${
                  isLight ? 'text-purple-600' : 'text-purple-400'
                }`}>{weeksGrandTotal.totalEs}</span>
                <span className={`text-[10px] font-bold ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>un</span>
              </div>
              <span className={`text-[10px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Filial Espírito Santo</span>
            </div>

            <div className={`p-4 rounded-2xl flex flex-col justify-between border transition-colors ${
              isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/80 border-slate-800/80'
            }`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                isLight ? 'text-slate-600' : 'text-slate-400'
              }`}>Média Diária</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className={`text-2xl font-black ${
                  isLight ? 'text-sky-600' : 'text-sky-400'
                }`}>{weeksGrandTotal.avgDaily}</span>
                <span className={`text-[10px] font-bold ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>un/dia útil</span>
              </div>
              <div className="flex items-center justify-between text-[10px] mt-1 text-slate-500">
                <span>{weeksGrandTotal.totalBusinessDays} dias úteis</span>
                <span className={`font-semibold ${isLight ? 'text-sky-700' : 'text-sky-400'}`} title="Média considerando apenas dias com registros de entrada">
                  ~{weeksGrandTotal.avgDailyActiveDays}/dia ativo
                </span>
              </div>
            </div>
          </div>

          {/* Spreadsheet Table Container */}
          <div 
            id="inflow-consolidated-table-container"
            className={`border rounded-2xl overflow-hidden transition-colors ${
              isLight 
                ? 'bg-white border-slate-200 shadow-sm' 
                : 'bg-slate-900/90 border-slate-800/80 shadow-lg'
            }`}
          >
            {/* Table Header Controls */}
            <div 
              id="inflow-table-header-bar"
              className={`p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isLight ? 'bg-slate-50/90 border-slate-200' : 'bg-slate-950/80 border-slate-800/80'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet className={`w-5 h-5 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                <h3 className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Planilha Consolidada de Entradas • {monthName} / {selectedYear}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenManualEntry()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
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
                  {enableSpreadsheetImport && (
                    <button
                      onClick={() => setIsImportModalOpen(true)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Importar Planilha Excel</span>
                    </button>
                  )}
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
                <table className="w-full text-left text-xs border-collapse" id="inflow-consolidated-table">
                  {/* Table Column Headers */}
                  <thead>
                    <tr className={`font-extrabold uppercase tracking-wider text-[11px] border-b ${
                      isLight 
                        ? 'bg-slate-100 text-slate-700 border-slate-300' 
                        : 'bg-slate-950 text-slate-300 border-slate-800'
                    }`}>
                      <th className="py-3 px-4 w-44">DATA</th>
                      <th className={`py-3 px-4 text-center w-28 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>ESTOQUE</th>
                      <th className={`py-3 px-4 text-center w-24 ${isLight ? 'text-rose-600' : 'text-rose-400'}`}>RMA</th>
                      <th className={`py-3 px-4 text-center w-28 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>OPENBOX</th>
                      <th className={`py-3 px-4 text-center w-24 ${isLight ? 'text-purple-600' : 'text-purple-400'}`}>ES</th>
                      <th className={`py-3 px-4 text-center w-28 font-black ${
                        isLight ? 'bg-slate-200/80 text-slate-900 border-x border-slate-300' : 'bg-slate-900/90 text-white'
                      }`}>TOTAL DIA</th>
                      <th className={`py-3 px-4 text-center w-36 font-black ${
                        isLight ? 'bg-sky-100/90 text-sky-900 border-r border-sky-200' : 'bg-blue-950/40 text-sky-300'
                      }`}>TOTAL SEMANA</th>
                      <th className="py-3 px-4 text-right w-24">AÇÕES</th>
                    </tr>
                  </thead>

                  {/* Table Body Grouped By Weeks */}
                  <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-slate-800/60'}`}>
                    {weekSummaries.map((week, weekIdx) => {
                      const weekRowCount = week.records.length;
                      const middleRowIdx = Math.floor(weekRowCount / 2);

                      return (
                        <React.Fragment key={week.startDate}>
                          {/* Week Group Banner */}
                          <tr className={`inflow-week-header-row border-t-2 ${
                            isLight 
                              ? 'bg-slate-100/95 border-slate-300 text-slate-800' 
                              : 'bg-slate-950/60 border-slate-800 text-slate-300'
                          }`}>
                            <td colSpan={8} className="py-2.5 px-4">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2.5 py-0.5 rounded font-black text-[10px] uppercase tracking-wider border ${
                                    isLight 
                                      ? 'bg-blue-100 text-blue-900 border-blue-300' 
                                      : 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                                  }`}>
                                    {(week.weekLabel && week.weekLabel !== 'undefined' && !week.weekLabel.includes('undefined'))
                                      ? week.weekLabel
                                      : `Semana ${week.weekNumber || weekIdx + 1}${week.startDate && week.endDate ? ` (${week.startDate.slice(8, 10)}/${week.startDate.slice(5, 7)} a ${week.endDate.slice(8, 10)}/${week.endDate.slice(5, 7)})` : ''}`}
                                  </span>
                                  <span className={`text-[11px] font-semibold ${
                                    isLight ? 'text-slate-600' : 'text-slate-400'
                                  }`}>
                                    {week.records.length} dia(s) registrado(s)
                                  </span>
                                </div>
                                <div className={`font-mono text-xs font-black ${
                                  isLight ? 'text-sky-800' : 'text-sky-400'
                                }`}>
                                  Subtotal da Semana: <strong className={`px-2.5 py-0.5 rounded border ${
                                    isLight 
                                      ? 'text-slate-900 bg-white border-slate-300 shadow-xs' 
                                      : 'text-white bg-slate-900 border-slate-800'
                                  }`}>{week.totalWeek} un</strong>
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
                                className={`transition-colors group ${
                                  isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/30'
                                }`}
                              >
                                {/* DATA */}
                                <td className={`py-3 px-4 font-mono font-bold ${
                                  isLight ? 'text-slate-800' : 'text-slate-200'
                                }`}>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${record.date.startsWith(selectedMonth) ? (isLight ? 'bg-blue-600' : 'bg-blue-500') : (isLight ? 'bg-amber-500 ring-2 ring-amber-500/20' : 'bg-amber-400 ring-2 ring-amber-400/20')}`} />
                                    <span>{formatBrDate(record.date)}</span>
                                    <span className={`text-[10px] font-sans font-normal ${
                                      isLight ? 'text-slate-500' : 'text-slate-400'
                                    }`}>
                                      ({getWeekdayName(record.date)})
                                    </span>
                                    {!record.date.startsWith(selectedMonth) && (
                                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border whitespace-nowrap ${
                                        isLight 
                                          ? 'bg-amber-100 text-amber-900 border-amber-300' 
                                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                      }`}>
                                        {record.date < selectedMonth ? 'Mês Anterior' : 'Próximo Mês'}
                                      </span>
                                    )}
                                  </div>
                                  {record.notes && (
                                    <span className="text-[10px] text-slate-500 block truncate max-w-xs pl-4 font-sans font-normal">
                                      {record.notes}
                                    </span>
                                  )}
                                </td>

                                {/* ESTOQUE */}
                                <td className={`py-3 px-4 text-center font-mono font-bold ${
                                  isLight ? 'text-emerald-600' : 'text-emerald-400'
                                }`}>
                                  {record.estoque}
                                </td>

                                {/* RMA */}
                                <td className={`py-3 px-4 text-center font-mono font-bold ${
                                  isLight ? 'text-rose-600' : 'text-rose-400'
                                }`}>
                                  {record.rma}
                                </td>

                                {/* OPENBOX */}
                                <td className={`py-3 px-4 text-center font-mono font-bold ${
                                  isLight ? 'text-amber-600' : 'text-amber-400'
                                }`}>
                                  {record.openbox}
                                </td>

                                {/* ES */}
                                <td className={`py-3 px-4 text-center font-mono font-bold ${
                                  isLight ? 'text-purple-600' : 'text-purple-400'
                                }`}>
                                  {record.es}
                                </td>

                                {/* TOTAL DIA */}
                                <td className={`py-3 px-4 text-center font-mono font-black text-sm ${
                                  isLight ? 'text-slate-900 bg-slate-100/60 border-x border-slate-200' : 'text-white bg-slate-950/40'
                                }`}>
                                  {record.totalDia}
                                </td>

                                {/* TOTAL SEMANA */}
                                <td className={`py-3 px-4 text-center font-mono font-black ${
                                  isLight ? 'bg-sky-50/60 border-r border-sky-100 text-sky-900' : 'bg-blue-950/20 text-sky-300'
                                }`}>
                                  {isMiddleRow ? (
                                    <span className={`px-2.5 py-1 rounded-lg font-extrabold text-sm shadow-sm inline-block ${
                                      isLight 
                                        ? 'bg-blue-600 text-white border border-blue-700 shadow-sm' 
                                        : 'bg-blue-600/30 border border-blue-500/30 text-white'
                                    }`}>
                                      {week.totalWeek}
                                    </span>
                                  ) : (
                                    <span className={isLight ? 'text-slate-400 text-xs font-semibold' : 'text-slate-600 text-xs'}>-</span>
                                  )}
                                </td>

                                {/* AÇÕES */}
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => handleOpenManualEntry(record.date, record)}
                                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                        isLight 
                                          ? 'hover:bg-slate-200 text-slate-500 hover:text-blue-600' 
                                          : 'hover:bg-slate-800 text-slate-400 hover:text-blue-400'
                                      }`}
                                      title="Editar Lançamento"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteInflowRecord(record.id)}
                                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                        isLight 
                                          ? 'hover:bg-slate-200 text-slate-500 hover:text-rose-600' 
                                          : 'hover:bg-slate-800 text-slate-400 hover:text-rose-400'
                                      }`}
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
                    <tr className={`font-black border-t-2 text-xs ${
                      isLight 
                        ? 'bg-slate-100 text-slate-900 border-slate-300' 
                        : 'bg-slate-950 text-white border-slate-700'
                    }`}>
                      <td className="py-4 px-4 uppercase tracking-wider">
                        <div className="flex flex-col">
                          <span className={isLight ? 'text-slate-900' : 'text-white'}>TOTAL GERAL DAS SEMANAS</span>
                          <span className={`text-[10px] font-normal ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Ciclo semanal completo com dias adjacentes</span>
                        </div>
                      </td>
                      <td className={`py-4 px-4 text-center font-mono text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>{weeksGrandTotal.totalEstoque}</td>
                      <td className={`py-4 px-4 text-center font-mono text-sm ${isLight ? 'text-rose-600' : 'text-rose-400'}`}>{weeksGrandTotal.totalRma}</td>
                      <td className={`py-4 px-4 text-center font-mono text-sm ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>{weeksGrandTotal.totalOpenbox}</td>
                      <td className={`py-4 px-4 text-center font-mono text-sm ${isLight ? 'text-purple-600' : 'text-purple-400'}`}>{weeksGrandTotal.totalEs}</td>
                      <td className={`py-4 px-4 text-center font-mono text-base ${
                        isLight 
                          ? 'text-emerald-700 bg-emerald-50 border-x border-emerald-200' 
                          : 'text-emerald-400 bg-slate-900'
                      }`}>{weeksGrandTotal.totalGeral}</td>
                      <td className={`py-4 px-4 text-center font-mono text-base ${
                        isLight 
                          ? 'text-sky-900 bg-sky-100 border-r border-sky-300 shadow-inner' 
                          : 'text-sky-400 bg-blue-950/60 shadow-inner'
                      }`}>{weeksGrandTotal.totalGeral}</td>
                      <td className="py-4 px-4 text-right">
                        {enableSpreadsheetExport && (
                          <button
                            onClick={() => exportInflowRecordsToExcel(extendedDailyInflows, `fluxo_entradas_${selectedMonth}.xlsx`)}
                            className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${
                              isLight 
                                ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-xs' 
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                            }`}
                          >
                            Exportar
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Secondary row if there are adjacent month days */}
                    {weeksGrandTotal.totalGeral !== monthTotals.totalGeral && (
                      <tr className={`border-t text-[11px] ${
                        isLight 
                          ? 'bg-slate-50 text-slate-600 border-slate-200' 
                          : 'bg-slate-950/40 text-slate-400 border-slate-800/80'
                      }`}>
                        <td className={`py-2.5 px-4 font-semibold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                          Mês Civil Estrito ({monthName})
                        </td>
                        <td className={`py-2.5 px-4 text-center font-mono font-bold ${isLight ? 'text-emerald-600' : 'text-emerald-400/80'}`}>{monthTotals.totalEstoque}</td>
                        <td className={`py-2.5 px-4 text-center font-mono font-bold ${isLight ? 'text-rose-600' : 'text-rose-400/80'}`}>{monthTotals.totalRma}</td>
                        <td className={`py-2.5 px-4 text-center font-mono font-bold ${isLight ? 'text-amber-600' : 'text-amber-400/80'}`}>{monthTotals.totalOpenbox}</td>
                        <td className={`py-2.5 px-4 text-center font-mono font-bold ${isLight ? 'text-purple-600' : 'text-purple-400/80'}`}>{monthTotals.totalEs}</td>
                        <td className={`py-2.5 px-4 text-center font-mono font-bold ${
                          isLight ? 'text-slate-900 bg-slate-100/80 border-x border-slate-200' : 'text-slate-200 bg-slate-900/60'
                        }`}>{monthTotals.totalGeral}</td>
                        <td className={`py-2.5 px-4 text-center font-mono font-bold ${
                          isLight ? 'text-sky-800 bg-sky-50 border-r border-sky-100' : 'text-slate-400 bg-blue-950/20'
                        }`}>
                          {monthTotals.totalGeral}
                        </td>
                        <td className={`py-2.5 px-4 text-right text-[10px] font-bold ${
                          isLight ? 'text-amber-700' : 'text-amber-400'
                        }`}>
                          +{weeksGrandTotal.totalGeral - monthTotals.totalGeral} adj.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Explanatory note about complete week cycle */}
            <div className={`px-4 py-2.5 border-t flex items-center justify-between text-[11px] flex-wrap gap-2 ${
              isLight 
                ? 'bg-slate-50 border-slate-200 text-slate-600' 
                : 'bg-slate-950/60 border-slate-800/80 text-slate-400'
            }`}>
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full inline-block ${isLight ? 'bg-blue-600' : 'bg-blue-500'}`}></span>
                <span>A contagem das semanas inclui todos os dias pertencentes ao ciclo semanal (mesmo de meses adjacentes), garantindo que a soma semanal bata 100% com os registros diários.</span>
              </span>
              <div className="flex items-center gap-3 font-mono text-[11px] flex-wrap">
                <span className={`font-bold ${isLight ? 'text-sky-700' : 'text-sky-300'}`}>Total Ciclo Semanal: {weeksGrandTotal.totalGeral} un</span>
                <span className={isLight ? 'text-slate-300' : 'text-slate-500'}>|</span>
                <span className={`font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>Média Diária: {weeksGrandTotal.avgDaily} un/dia</span>
                <span className={isLight ? 'text-slate-300' : 'text-slate-500'}>|</span>
                <span className={isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'}>Mês Civil: {monthTotals.totalGeral} un</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: VISUAL GRAPHS & CALENDAR */}
      {activeView === 'visual' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Main Analysis Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Weekly Distribution Card */}
            <div className={`lg:col-span-4 p-6 rounded-2xl flex flex-col justify-between space-y-4 shadow-sm border transition-all ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800/50'
            }`}>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <h3 className={`text-xs font-black uppercase tracking-wider ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    Distribuição Semanal
                  </h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded border font-mono font-bold ${
                    isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-950 border-slate-800/50 text-slate-400'
                  }`}>
                    {monthWeeks.length} Semanas
                  </span>
                </div>
                <h4 className={`text-sm font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Entradas por Semana
                </h4>
                <p className={`text-[10px] mt-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Entradas agregadas por bloco semanal.
                </p>
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
                          ? isLight
                            ? 'bg-indigo-50 border-indigo-300 shadow-sm'
                            : 'bg-indigo-500/10 border-indigo-500/40 shadow-sm' 
                          : isLight
                            ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
                            : 'bg-slate-950/40 border-slate-900/50 hover:border-slate-800/50'
                      }`}
                    >
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`font-black tracking-tight ${
                            isSelected 
                              ? isLight ? 'text-indigo-700' : 'text-indigo-400' 
                              : isLight ? 'text-slate-800' : 'text-slate-300'
                          }`}>
                            {(label.title && label.title !== 'undefined' && !label.title.includes('undefined')) ? label.title : `Semana ${idx + 1}`}
                          </span>
                          <span className={`text-[10px] font-medium shrink-0 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            ({label.range && label.range !== 'undefined' ? label.range : ''})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span 
                            className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                              isSelected
                                ? isLight ? 'text-indigo-800 bg-indigo-100/90 border-indigo-300' : 'text-indigo-300 bg-indigo-500/25 border-indigo-500/40'
                                : isLight ? 'text-sky-700 bg-sky-50 border-sky-200' : 'text-sky-400 bg-sky-500/10 border-sky-500/20'
                            }`}
                            title={`Média diária da ${label.title}: ${(val / 5).toFixed(1)} un/dia útil (Seg-Sex)`}
                          >
                            {(val / 5).toFixed(1)}/dia
                          </span>
                          <span className={`font-mono font-bold px-2 py-0.5 rounded border ${
                            isLight ? 'text-slate-800 bg-white border-slate-200' : 'text-slate-300 bg-slate-950 border-slate-800/50'
                          }`}>
                            {val} un
                          </span>
                        </div>
                      </div>

                      {/* Bar Background */}
                      <div className={`w-full h-2 rounded-full overflow-hidden border flex ${
                        isLight ? 'bg-slate-200/80 border-slate-200' : 'bg-slate-950 border-slate-900'
                      }`}>
                        <div 
                          style={{ width: `${Math.max(val > 0 ? 3 : 0, percentage)}%` }}
                          className={`h-full rounded-full transition-all duration-500 relative ${
                            isSelected 
                              ? 'bg-gradient-to-r from-indigo-600 to-indigo-400' 
                              : isLight
                              ? 'bg-gradient-to-r from-slate-400 to-slate-500 group-hover:from-indigo-600 group-hover:to-indigo-400'
                              : 'bg-gradient-to-r from-slate-700 to-slate-500 group-hover:from-indigo-600 group-hover:to-indigo-400'
                          }`}
                        >
                          {val > 0 && <div className="absolute inset-0 bg-white/15"></div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Meta breakdown summary */}
              <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs p-3 rounded-xl border shrink-0 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/50'
              }`}>
                <div>
                  <span className={`block text-[10px] font-bold leading-tight ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    {selectedWeek !== null ? `Total Sem. ${selectedWeek + 1}` : 'Total Semanas'}
                  </span>
                  <span className={`font-extrabold text-base mt-0.5 block leading-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {selectedWeek !== null ? (weeklyCounts[selectedWeek] || 0) : weeksGrandTotal.totalGeral}
                  </span>
                  <span className={`text-[9px] block leading-tight truncate mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {selectedWeek !== null 
                      ? `${monthWeeks[selectedWeek]?.range || ''}`
                      : (weeksGrandTotal.totalGeral !== monthTotals.totalGeral ? `(${monthTotals.totalGeral} civil)` : `Em ${monthWeeks.length} sem.`)}
                  </span>
                </div>

                <div>
                  <span className={`block text-[10px] font-bold leading-tight ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    Média Semanal
                  </span>
                  <span className={`font-extrabold text-base mt-0.5 block leading-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {(weeksGrandTotal.totalGeral / Math.max(monthWeeks.length, 1)).toFixed(1)} / sem
                  </span>
                  <span className={`text-[9px] block leading-tight mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Em {monthWeeks.length} semanas
                  </span>
                </div>

                <div className={`rounded-lg p-1.5 -m-1 border ${
                  isLight ? 'bg-sky-50/70 border-sky-200/70' : 'bg-sky-500/10 border-sky-500/20'
                }`}>
                  <span className={`block text-[10px] font-bold leading-tight ${isLight ? 'text-sky-800' : 'text-sky-300'}`}>
                    {selectedWeek !== null ? `Média Diária (S${selectedWeek + 1})` : 'Média Diária'}
                  </span>
                  <span className={`font-extrabold text-base mt-0.5 block leading-tight ${isLight ? 'text-sky-900' : 'text-sky-200'}`}>
                    {selectedWeek !== null 
                      ? `${((weeklyCounts[selectedWeek] || 0) / 5).toFixed(1)} / dia`
                      : `${weeksGrandTotal.avgDaily} / dia`}
                  </span>
                  <span className={`text-[9px] block leading-tight mt-0.5 ${isLight ? 'text-sky-700/90' : 'text-sky-400/90'}`}>
                    {selectedWeek !== null 
                      ? '5 dias úteis (Seg-Sex)' 
                      : `${weeksGrandTotal.totalBusinessDays} d. úteis (~${weeksGrandTotal.avgDailyActiveDays}/ativo)`}
                  </span>
                </div>
              </div>

              {selectedWeek !== null && (
                <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border ${
                  isLight ? 'bg-indigo-50 text-indigo-900 border-indigo-200' : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                }`}>
                  <span>Filtrando: Semana {selectedWeek + 1} ({monthWeeks[selectedWeek]?.range || ''})</span>
                  <button
                    onClick={() => {
                      setSelectedWeek(null);
                      setSelectedDay(null);
                    }}
                    className="underline hover:opacity-80 cursor-pointer font-bold"
                  >
                    Ver todas as semanas
                  </button>
                </div>
              )}
            </div>

            {/* Right Column: Daily Distribution & Calendar Grid */}
            <div className={`lg:col-span-8 p-6 rounded-2xl flex flex-col space-y-4 shadow-sm border transition-all ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800/50'
            }`}>
              <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 shrink-0 ${
                isLight ? 'border-slate-200' : 'border-slate-800/50'
              }`}>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {dailyViewType === 'hourly'
                        ? (selectedDateStr ? `Análise por Horário • Dia ${String(selectedDay || '').padStart(2, '0')} (${formatBrDate(selectedDateStr)})` : `Análise por Horário • ${monthName} / ${selectedYear}`)
                        : `Análise Diária • ${monthName}`}
                    </h3>
                    <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-md border ${
                      isLight ? 'bg-sky-50 border-sky-200 text-sky-800' : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                    }`} title="Média diária no ciclo das semanas">
                      Média: {weeksGrandTotal.avgDaily} un/dia útil
                    </span>
                  </div>
                  <p className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    {dailyViewType === 'hourly'
                      ? (selectedDateStr
                          ? `Visualizando entradas do dia ${formatBrDate(selectedDateStr)} (${getWeekdayName(selectedDateStr)}). Clique nas barras para filtrar.`
                          : 'Distribuição das entradas ao longo das 24 horas do dia. Selecione um dia específico abaixo ou veja o acumulado.')
                      : 'Escolha o modo de visualização dos dias e clique para interagir.'}
                  </p>
                </div>

                <div className={`flex p-1 rounded-xl border gap-0.5 ${
                  isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800/50'
                }`}>
                  <button
                    onClick={() => setDailyViewType('calendar')}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black tracking-wide uppercase transition-all cursor-pointer ${
                      dailyViewType === 'calendar' 
                        ? 'bg-indigo-600 text-white shadow-xs' 
                        : isLight ? 'text-slate-600 hover:text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Calendário
                  </button>
                  <button
                    onClick={() => setDailyViewType('chart')}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black tracking-wide uppercase transition-all cursor-pointer ${
                      dailyViewType === 'chart' 
                        ? 'bg-indigo-600 text-white shadow-xs' 
                        : isLight ? 'text-slate-600 hover:text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Gráfico Diário
                  </button>
                  <button
                    onClick={() => setDailyViewType('hourly')}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black tracking-wide uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                      dailyViewType === 'hourly' 
                        ? 'bg-sky-600 text-white shadow-xs' 
                        : isLight ? 'text-slate-600 hover:text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Por Horário</span>
                  </button>
                </div>
              </div>

              {dailyViewType === 'calendar' ? (
                <div className="flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="grid grid-cols-7 gap-1.5 text-center">
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((wd) => (
                        <div key={wd} className="cal-weekday-header text-[10px] font-black text-slate-400 uppercase tracking-widest py-1">
                          {wd}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1.5" id="calendar-grid-cells">
                      {calendarDays.map((cell) => {
                        const isSelected = selectedDateStr === cell.dateStr;
                        const hasEntries = cell.count > 0;
                        
                        let cellTierClass = 'cal-day-empty';

                        if (hasEntries) {
                          cellTierClass = 'cal-day-tier2';
                        }

                        if (isSelected) {
                          cellTierClass = 'cal-day-selected';
                        }

                        const adjacentStyle = cell.isAdjacentMonth
                          ? isSelected
                            ? 'ring-2 ring-amber-400'
                            : hasEntries
                            ? 'ring-1 ring-amber-500/40 opacity-90'
                            : 'opacity-40 hover:opacity-75 border-dashed'
                          : '';

                        return (
                          <div
                            key={cell.dateStr}
                            onClick={() => {
                              const newSelected = isSelected ? null : cell.dateStr;
                              setSelectedDateStr(newSelected);
                              setSelectedDay(newSelected ? cell.dayNum : null);
                              setSelectedWeek(null);
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              handleOpenManualEntry(cell.dateStr);
                            }}
                            className={`group cal-day-cell aspect-square rounded-xl border flex flex-col justify-start p-1.5 sm:p-2 cursor-pointer transition-all ${cellTierClass} ${adjacentStyle}`}
                            title={cell.isAdjacentMonth 
                              ? `${cell.count} ${cell.count === 1 ? 'entrada' : 'entradas'} no dia ${formatBrDate(cell.dateStr)} (Mês ${cell.monthLabel} - clique duas vezes para editar)`
                              : `${cell.count} ${cell.count === 1 ? 'entrada' : 'entradas'} no dia ${cell.dayNum} de ${monthName} (clique duas vezes para editar)`
                            }
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className={`cal-day-number text-[11px] font-mono leading-none font-bold ${cell.isAdjacentMonth ? 'text-amber-400/90' : ''}`}>
                                {cell.dayNum}
                              </span>
                              <div className="flex items-center gap-1">
                                {cell.isAdjacentMonth && cell.monthLabel && (
                                  <span className="text-[8px] uppercase font-black text-amber-400/90 px-1 rounded bg-amber-500/10">
                                    {cell.monthLabel}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenManualEntry(cell.dateStr);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700/60 transition-all cursor-pointer"
                                  title={`Editar ou lançar quantidades para ${formatBrDate(cell.dateStr)}`}
                                >
                                  <Edit2 className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                            
                            {hasEntries && (
                              <div className="mt-1 flex items-center">
                                <span className="cal-count text-[10px] font-mono tracking-tighter leading-none font-black px-1.5 py-0.5 rounded-md">
                                  {cell.count} un
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : dailyViewType === 'chart' ? (
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
                        const dateStr = `${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                        const heightPercent = maxDailyCount > 0 ? Math.max(6, (val / maxDailyCount) * 75) : 6;
                        const isSelected = selectedDateStr === dateStr || (selectedDay === dayNum && !selectedDateStr);

                        return (
                          <div 
                            key={idx} 
                            onClick={() => {
                              const newSelected = isSelected ? null : dateStr;
                              setSelectedDateStr(newSelected);
                              setSelectedDay(newSelected ? dayNum : null);
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
              ) : (
                /* Hourly View (Gráfico de Entradas pelo Horário) */
                <div className="flex-1 flex flex-col justify-between space-y-4">
                  {/* Calendar Day Picker for Hourly View */}
                  <div 
                    className={`flex flex-col gap-2.5 p-3 rounded-xl border transition-all ${
                      isLight 
                        ? 'bg-slate-50/90 border-slate-200 shadow-xs' 
                        : 'bg-slate-950/75 border-slate-800/80 shadow-xs'
                    }`} 
                    id="hourly-calendar-container"
                  >
                    {/* Header bar: all items unified strictly in the top bar */}
                    <div className="flex items-center justify-between gap-2 sm:gap-2.5 w-full flex-nowrap overflow-x-auto no-scrollbar py-0.5" id="hourly-calendar-top-bar">
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
                        <div className={`flex items-center gap-1.5 text-xs font-bold shrink-0 ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                          <Calendar className={`w-4 h-4 ${isLight ? 'text-sky-600' : 'text-sky-400'} shrink-0`} />
                          <span className={`text-xs uppercase tracking-wider font-black ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                            Calendário <span className="hidden xl:inline">de Dias</span> ({monthName})
                          </span>
                        </div>

                        {/* Current Selection Pill */}
                        {selectedDateStr ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div 
                              id="hourly-selected-day-badge"
                              className={`text-xs font-bold px-2.5 py-1 rounded-lg border shadow-xs flex items-center gap-1.5 transition-colors shrink-0 ${
                                isLight
                                  ? 'bg-sky-100 text-sky-950 border-sky-300'
                                  : 'bg-sky-600 text-white border-sky-500'
                              }`}
                            >
                              <span className={`day-title font-black ${isLight ? 'text-sky-950' : 'text-white'}`}>
                                Dia {String(selectedDay).padStart(2, '0')}
                              </span>
                              <span className={`day-subtitle font-medium text-[11px] ${isLight ? 'text-sky-700' : 'text-sky-100'}`}>
                                ({formatBrDate(selectedDateStr)} • {getWeekdayName(selectedDateStr).split('-')[0]})
                              </span>
                            </div>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border shrink-0 ${
                              isLight
                                ? 'text-sky-800 bg-sky-100 border-sky-300'
                                : 'text-sky-400 bg-sky-500/15 border-sky-500/30'
                            }`}>
                              {hourlyDistribution.totalInScope} {hourlyDistribution.totalInScope === 1 ? 'item' : 'itens'}
                            </span>
                          </div>
                        ) : (
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 shrink-0 ${
                            isLight
                              ? 'text-emerald-900 bg-emerald-100/90 border-emerald-300'
                              : 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
                          }`}>
                            <span className="font-extrabold">Mês Completo Acumulado</span>
                            <span className={isLight ? 'text-slate-700 font-medium' : 'text-slate-400 font-normal'}>• {monthTotals.totalGeral} un</span>
                          </span>
                        )}
                      </div>

                      {/* Controls: Prev/Next day, Mês Completo button, Collapse/Expand toggle */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        {/* Day prev/next step buttons */}
                        {selectedDateStr && (
                          <div className="flex items-center gap-1 mr-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const currentIdx = monthDaysOptions.findIndex(d => d.dateStr === selectedDateStr);
                                if (currentIdx > 0) {
                                  const prev = monthDaysOptions[currentIdx - 1];
                                  setSelectedDateStr(prev.dateStr);
                                  setSelectedDay(prev.dayNum);
                                  setSelectedWeek(null);
                                }
                              }}
                              disabled={monthDaysOptions.findIndex(d => d.dateStr === selectedDateStr) <= 0}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                                isLight
                                  ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700 shadow-2xs'
                                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 hover:text-white'
                              }`}
                              title="Dia anterior"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const currentIdx = monthDaysOptions.findIndex(d => d.dateStr === selectedDateStr);
                                if (currentIdx !== -1 && currentIdx < monthDaysOptions.length - 1) {
                                  const next = monthDaysOptions[currentIdx + 1];
                                  setSelectedDateStr(next.dateStr);
                                  setSelectedDay(next.dayNum);
                                  setSelectedWeek(null);
                                }
                              }}
                              disabled={monthDaysOptions.findIndex(d => d.dateStr === selectedDateStr) >= monthDaysOptions.length - 1}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                                isLight
                                  ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700 shadow-2xs'
                                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 hover:text-white'
                              }`}
                              title="Próximo dia"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Mês Completo Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDateStr(null);
                            setSelectedDay(null);
                            setSelectedWeek(null);
                          }}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap ${
                            !selectedDateStr
                              ? isLight 
                                ? 'bg-sky-600 text-white border-sky-600 shadow-xs font-black' 
                                : 'bg-sky-500 text-white border-sky-400 shadow-xs font-black'
                              : isLight
                                ? 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-300 shadow-2xs'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
                          }`}
                          title="Visualizar o somatório acumulado do mês inteiro"
                        >
                          <Calendar className="w-3 h-3" />
                          <span>Mês Completo</span>
                        </button>

                        {/* Collapse / Expand Toggle */}
                        <button
                          type="button"
                          onClick={() => setIsHourlyCalendarOpen(v => !v)}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap ${
                            isLight
                              ? 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-300 shadow-2xs'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-800'
                          }`}
                          title={isHourlyCalendarOpen ? 'Recolher grade do calendário' : 'Expandir grade do calendário'}
                        >
                          <span>{isHourlyCalendarOpen ? 'Recolher' : 'Exibir Calendário'}</span>
                          {isHourlyCalendarOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Interactive Calendar Grid */}
                    {isHourlyCalendarOpen && (
                      <div className="pt-1 space-y-1.5">
                        {/* Weekday column headers */}
                        <div className="grid grid-cols-7 gap-1 text-center">
                          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((wd, i) => (
                            <div
                              key={wd}
                              className={`text-[10px] uppercase tracking-wider py-0.5 ${
                                isLight
                                  ? i === 0 || i === 6 ? 'text-slate-400 font-bold' : 'text-slate-700 font-black'
                                  : i === 0 || i === 6 ? 'text-slate-500' : 'text-slate-400 font-black'
                              }`}
                            >
                              {wd}
                            </div>
                          ))}
                        </div>

                        {/* Calendar Days */}
                        <div className="grid grid-cols-7 gap-1" id="hourly-calendar-grid">
                          {calendarDays.map((cell) => {
                            if (cell.isAdjacentMonth) {
                              return (
                                <div
                                  key={`adj-${cell.dateStr}`}
                                  className={`h-11 sm:h-12 rounded-lg border flex flex-col items-center justify-center select-none ${
                                    isLight
                                      ? 'border-slate-200/50 bg-slate-100/50 opacity-40'
                                      : 'border-slate-900/40 bg-slate-950/20 opacity-25'
                                  }`}
                                >
                                  <span className={`text-[10px] font-mono font-semibold ${isLight ? 'text-slate-400' : 'text-slate-600'}`}>
                                    {cell.dayNum}
                                  </span>
                                </div>
                              );
                            }

                            const isSelected = selectedDateStr === cell.dateStr;
                            const hasEntries = cell.count > 0;

                            let cellClass = '';
                            if (isSelected) {
                              cellClass = 'cal-day-selected-btn bg-sky-600 text-white border-sky-500 font-black shadow-md ring-2 ring-sky-400/70 scale-[1.03] z-10';
                            } else if (hasEntries) {
                              cellClass = isLight
                                ? 'cal-day-has-entries bg-indigo-50/90 hover:bg-indigo-100/90 border-indigo-300 text-slate-950 hover:border-indigo-500 shadow-xs'
                                : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700/80 text-slate-200 hover:border-sky-400/60 shadow-2xs';
                            } else {
                              cellClass = isLight
                                ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-950 shadow-2xs'
                                : 'bg-slate-950/40 hover:bg-slate-900/50 border-slate-800/40 text-slate-500 hover:text-slate-300';
                            }

                            return (
                              <button
                                key={cell.dateStr}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedDateStr(null);
                                    setSelectedDay(null);
                                    setSelectedWeek(null);
                                  } else {
                                    setSelectedDateStr(cell.dateStr);
                                    setSelectedDay(cell.dayNum);
                                    setSelectedWeek(null);
                                  }
                                }}
                                className={`group relative h-11 sm:h-12 rounded-lg border flex flex-col items-center justify-start p-1 transition-all cursor-pointer gap-0.5 ${cellClass}`}
                                title={`Dia ${String(cell.dayNum).padStart(2, '0')}/${String(selectedMonthIdx + 1).padStart(2, '0')} (${getWeekdayName(cell.dateStr)}): ${cell.count} ${cell.count === 1 ? 'entrada' : 'entradas'}`}
                              >
                                <div className="flex items-center justify-between w-full px-0.5">
                                  <span
                                    className={`text-[11px] font-mono leading-none ${
                                      isSelected
                                        ? 'text-white font-black'
                                        : hasEntries
                                        ? isLight ? 'text-slate-950 font-black' : 'text-slate-200 font-bold'
                                        : isLight ? 'text-slate-600 font-semibold' : 'text-slate-500'
                                    }`}
                                  >
                                    {String(cell.dayNum).padStart(2, '0')}
                                  </span>
                                  {hasEntries && (
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        isSelected ? 'bg-white' : isLight ? 'bg-indigo-500' : 'bg-indigo-400'
                                      }`}
                                    />
                                  )}
                                </div>

                                <div className="w-full flex items-center justify-center">
                                  {hasEntries ? (
                                    <span
                                      className={`cal-badge-count text-[9px] font-mono px-1 py-0.2 rounded font-black leading-tight ${
                                        isSelected
                                          ? 'bg-sky-700 text-white shadow-2xs'
                                          : isLight
                                          ? 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                                          : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                      }`}
                                    >
                                      {cell.count} un
                                    </span>
                                  ) : (
                                    <span className={`text-[9px] font-mono ${isLight ? 'text-slate-400' : 'text-slate-700'}`}>-</span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* Calendar Bottom Legend / Quick hint */}
                        <div className={`flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t text-[10px] ${
                          isLight ? 'border-slate-200 text-slate-600' : 'border-slate-800/50 text-slate-400'
                        }`}>
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded bg-sky-500 inline-block"></span>
                              <span className={isLight ? 'text-slate-700 font-medium' : ''}>Selecionado</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded bg-emerald-500 inline-block"></span>
                              <span className={isLight ? 'text-slate-700 font-medium' : ''}>Com Entradas</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <span className={`w-2 h-2 rounded inline-block ${isLight ? 'bg-slate-200 border border-slate-300' : 'bg-slate-800 border border-slate-700'}`}></span>
                              <span className={isLight ? 'text-slate-700 font-medium' : ''}>Sem Entradas</span>
                            </span>
                          </div>

                          {selectedDateStr ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDateStr(null);
                                setSelectedDay(null);
                                setSelectedWeek(null);
                              }}
                              className={`text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                                isLight ? 'text-sky-700 hover:text-sky-900' : 'text-sky-400 hover:text-sky-300'
                              }`}
                            >
                              <X className="w-3 h-3" />
                              <span>Limpar seleção (Voltar ao Mês Completo)</span>
                            </button>
                          ) : (
                            <span className={`text-[10px] ${isLight ? 'text-slate-500 font-medium' : 'text-slate-500'}`}>
                              Clique em qualquer dia para analisar a distribuição por horário
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {/* Horário de Pico */}
                    <div className={`p-2.5 rounded-xl flex items-center gap-2.5 border shadow-2xs ${
                      isLight ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800/60 shadow-sm'
                    }`}>
                      <div className={`p-2 rounded-lg border shrink-0 ${
                        isLight ? 'bg-sky-100 text-sky-700 border-sky-200' : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                      }`}>
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className={`text-[10px] block font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Horário de Pico</span>
                        <span className={`text-xs font-black truncate block ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {hourlyDistribution.peakHour ? `${hourlyDistribution.peakHour.label} (${hourlyDistribution.peakHour.total} un)` : 'Sem dados'}
                        </span>
                      </div>
                    </div>

                    {/* Total Catalogado */}
                    <div className={`p-2.5 rounded-xl flex items-center gap-2.5 border shadow-2xs ${
                      isLight ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800/60 shadow-sm'
                    }`}>
                      <div className={`p-2 rounded-lg border shrink-0 ${
                        isLight ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}>
                        <Package className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className={`text-[10px] block font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                          {selectedDateStr ? 'Total no Dia' : 'Total no Mês'}
                        </span>
                        <span className={`text-xs font-black block ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {hourlyDistribution.totalInScope} {hourlyDistribution.totalInScope === 1 ? 'item' : 'itens'}
                        </span>
                      </div>
                    </div>

                    {/* Turno Principal */}
                    <div className={`p-2.5 rounded-xl flex items-center gap-2.5 border shadow-2xs ${
                      isLight ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800/60 shadow-sm'
                    }`}>
                      <div className={`p-2 rounded-lg border shrink-0 ${
                        isLight ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        <Sun className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className={`text-[10px] block font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Turno Principal</span>
                        <span className={`text-xs font-black block truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {(() => {
                            const p = hourlyDistribution.periods;
                            const max = Math.max(p.manha, p.tarde, p.noite, p.madrugada);
                            if (max === 0) return 'Sem dados';
                            if (max === p.tarde) return `Tarde (${p.tarde} un)`;
                            if (max === p.manha) return `Manhã (${p.manha} un)`;
                            if (max === p.noite) return `Noite (${p.noite} un)`;
                            return `Madrugada (${p.madrugada} un)`;
                          })()}
                        </span>
                      </div>
                    </div>

                    {/* Filtro por Hora */}
                    <div className={`p-2.5 rounded-xl flex items-center justify-between gap-2 border shadow-2xs ${
                      isLight ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800/60 shadow-sm'
                    }`}>
                      <div className="min-w-0">
                        <span className={`text-[10px] block font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Filtro por Hora</span>
                        <span className={`text-xs font-black block truncate ${isLight ? 'text-sky-700' : 'text-sky-400'}`}>
                          {selectedHour !== null ? `${String(selectedHour).padStart(2, '0')}:00 - ${String(selectedHour).padStart(2, '0')}:59` : 'Todas (24h)'}
                        </span>
                      </div>
                      {selectedHour !== null && (
                        <button
                          onClick={() => setSelectedHour(null)}
                          className={`px-2 py-1 text-[9px] rounded border font-bold transition-all cursor-pointer ${
                            isLight
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                          }`}
                          title="Limpar filtro de hora"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Hourly 24h Bar Chart */}
                  <div className="space-y-1.5 pt-2">
                    <div className={`flex justify-between items-center text-[10px] px-1 font-mono ${
                      isLight ? 'text-slate-600 font-semibold' : 'text-slate-500'
                    }`}>
                      <span>00:00 (Madrugada)</span>
                      <span>12:00 (Almoço / Tarde)</span>
                      <span>23:00 (Noite)</span>
                    </div>

                    <div className={`h-64 w-full flex items-end gap-1 pt-8 border-b overflow-x-auto pb-2 px-1 scrollbar-thin ${
                      isLight ? 'border-slate-200 scrollbar-thumb-slate-300 scrollbar-track-slate-100' : 'border-slate-800 scrollbar-thumb-slate-800 scrollbar-track-slate-950'
                    }`}>
                      {hourlyDistribution.hours.map((h) => {
                        const isSelected = selectedHour === h.hour;
                        const hasEntries = h.total > 0;
                        const heightPercent = hourlyDistribution.maxCount > 0 
                          ? Math.max(6, (h.total / hourlyDistribution.maxCount) * 75) 
                          : 6;

                        // Calculate percentages for stacked segments (Estoque, Openbox, RMA)
                        const pctEstoque = hasEntries ? (h.estoque / h.total) * 100 : 0;
                        const pctOpenbox = hasEntries ? (h.openbox / h.total) * 100 : 0;
                        const pctRma = hasEntries ? (h.rma / h.total) * 100 : 0;

                        return (
                          <div
                            key={h.hour}
                            onClick={() => {
                              setSelectedHour(isSelected ? null : h.hour);
                            }}
                            className="flex-1 min-w-[20px] max-w-[36px] flex flex-col items-center group relative h-full justify-end cursor-pointer"
                          >
                            {/* Stacked or colored bar */}
                            <div
                              style={{ height: `${heightPercent}%` }}
                              className={`w-full rounded-t transition-all duration-300 relative flex flex-col-reverse overflow-hidden ${
                                isSelected
                                  ? 'ring-2 ring-sky-400 bg-sky-950/40 shadow-lg shadow-sky-500/20 z-10'
                                  : hasEntries
                                  ? 'bg-sky-500/30 group-hover:ring-1 group-hover:ring-sky-400/50'
                                  : isLight
                                  ? 'bg-slate-100 group-hover:bg-slate-200'
                                  : 'bg-slate-900/60 group-hover:bg-slate-800'
                              }`}
                            >
                              {hasEntries ? (
                                <>
                                  {pctEstoque > 0 && (
                                    <div 
                                      style={{ height: `${pctEstoque}%` }} 
                                      className="w-full bg-emerald-500 transition-all duration-200" 
                                      title={`Estoque: ${h.estoque}`}
                                    />
                                  )}
                                  {pctOpenbox > 0 && (
                                    <div 
                                      style={{ height: `${pctOpenbox}%` }} 
                                      className="w-full bg-amber-500 transition-all duration-200" 
                                      title={`Openbox: ${h.openbox}`}
                                    />
                                  )}
                                  {pctRma > 0 && (
                                    <div 
                                      style={{ height: `${pctRma}%` }} 
                                      className="w-full bg-rose-500 transition-all duration-200" 
                                      title={`RMA: ${h.rma}`}
                                    />
                                  )}
                                </>
                              ) : null}

                              {/* Number label on top if has entries */}
                              {hasEntries && (
                                <span className={`absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-mono font-black ${
                                  isLight ? 'text-slate-800' : 'text-slate-300'
                                } group-hover:${isLight ? 'text-slate-950' : 'text-white'}`}>
                                  {h.total}
                                </span>
                              )}

                              {/* Floating tooltip */}
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 bg-slate-900 border border-slate-700 text-white font-mono text-[10px] px-3 py-2 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 pointer-events-none whitespace-nowrap min-w-[130px]">
                                <div className="font-bold text-sky-400 border-b border-slate-800 pb-1 mb-1">
                                  {h.label} às {String(h.hour).padStart(2, '0')}:59
                                </div>
                                <div className="text-white font-extrabold text-xs mb-1">
                                  {h.total} {h.total === 1 ? 'entrada' : 'entradas'}
                                </div>
                                {hasEntries && (
                                  <div className="space-y-0.5 text-[9px] text-slate-300">
                                    {h.estoque > 0 && <div className="text-emerald-400">Estoque: {h.estoque} un</div>}
                                    {h.openbox > 0 && <div className="text-amber-400">Openbox: {h.openbox} un</div>}
                                    {h.rma > 0 && <div className="text-rose-400">RMA: {h.rma} un</div>}
                                  </div>
                                )}
                                <div className="text-[8px] text-slate-400 mt-1.5 pt-1 border-t border-slate-800">
                                  {isSelected ? 'Clique para desmarcar' : 'Clique para filtrar a lista'}
                                </div>
                              </div>
                            </div>

                            {/* Hour label on X-axis */}
                            <span className={`text-[8px] font-mono mt-1.5 font-semibold ${
                              isSelected 
                                ? isLight ? 'text-sky-700 font-black' : 'text-sky-400 font-black'
                                : hasEntries 
                                ? isLight ? 'text-slate-800 font-bold' : 'text-slate-300' 
                                : isLight ? 'text-slate-400' : 'text-slate-600'
                            }`}>
                              {String(h.hour).padStart(2, '0')}h
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Legend and Shift Breakdown (Setores sem Descarte) */}
                  <div className={`flex flex-wrap items-center justify-between gap-3 pt-2 text-[10px] border-t ${
                    isLight ? 'border-slate-200 text-slate-600' : 'border-slate-800/40 text-slate-400'
                  }`}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`font-bold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>Setores:</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Estoque</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Openbox</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span> RMA</span>
                    </div>

                    <div className="flex items-center gap-3 text-[10px]">
                      <span>Manhã: <strong className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{hourlyDistribution.periods.manha}</strong></span>
                      <span>Tarde: <strong className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{hourlyDistribution.periods.tarde}</strong></span>
                      <span>Noite: <strong className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{hourlyDistribution.periods.noite}</strong></span>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* UNITARY TRIAGE ITEMS LIST (Embedded directly below Calendar & Graph) */}
          <div className="bg-slate-900/90 border border-slate-800/50 p-6 rounded-2xl flex flex-col space-y-4 shadow-sm animate-in fade-in duration-200" id="unit-triage-movements-panel">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/50 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-black text-white">Detalhamento Unitário de RMA / Triagem</h3>
                  <span className="unit-count-badge text-[10px] font-mono text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/40 font-bold">
                    {filteredMovements.length} {filteredMovements.length === 1 ? 'item' : 'itens'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {selectedHour !== null && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold mr-2 mb-1 shadow-sm">
                      <Clock className="w-3.5 h-3.5 text-sky-400" />
                      <span>Filtrando Horário: {String(selectedHour).padStart(2, '0')}:00 às {String(selectedHour).padStart(2, '0')}:59</span>
                      <button
                        onClick={() => setSelectedHour(null)}
                        className="ml-1 hover:text-white p-0.5 rounded hover:bg-sky-500/30 cursor-pointer transition-colors"
                        title="Remover filtro de horário"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {selectedDateStr ? (
                    <span className="flex items-center flex-wrap gap-2">
                      <span>
                        Exibindo produtos que deram entrada especificamente no <strong className="text-white">{formatBrDate(selectedDateStr)}</strong>
                        {selectedDateStr.substring(0, 7) !== selectedMonth && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Mês Adjacente ({selectedDateStr.substring(0, 7) < selectedMonth ? 'Anterior' : 'Seguinte'})
                          </span>
                        )}.
                      </span>
                      <button
                        onClick={() => {
                          const existingRec = extendedDailyInflows.find(r => r.date === selectedDateStr);
                          handleOpenManualEntry(selectedDateStr, existingRec);
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300 font-bold underline flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{extendedDailyInflows.some(r => r.date === selectedDateStr) ? 'Editar Lançamento' : '+ Registrar Lançamento'}</span>
                      </button>
                    </span>
                  ) : selectedWeek !== null && monthWeeks[selectedWeek] ? (
                    <span>
                      Exibindo produtos da <strong className="text-white">{monthWeeks[selectedWeek].title} ({monthWeeks[selectedWeek].range})</strong>.
                    </span>
                  ) : (
                    <span>
                      Exibindo todos os produtos catalogados na triagem técnica durante o mês de <strong className="text-white">{monthName}</strong>. Clique em um dia do calendário ou numa barra de horário acima para filtrar.
                    </span>
                  )}
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                {(selectedDateStr !== null || selectedDay !== null || selectedWeek !== null || selectedHour !== null) && (
                  <button
                    onClick={() => {
                      setSelectedDay(null);
                      setSelectedDateStr(null);
                      setSelectedWeek(null);
                      setSelectedHour(null);
                    }}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-bold border border-slate-700/80 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Ver todo o mês</span>
                  </button>
                )}
                <span className="unit-month-total-badge text-[10px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800/50 font-bold">
                  Total no Mês: {monthUnits.length}
                </span>
              </div>
            </div>

            {/* Search and Filters Controls */}
            <div className="space-y-3">
              {/* Search Input */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar por SKU, Produto, Canal, Destino ou Rastreamento..."
                  className="unit-search-input w-full bg-slate-950 border border-slate-800/50 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-700 transition-all"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white transition-all cursor-pointer"
                    title="Limpar pesquisa"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filters Row: Estoque & Plataforma */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Filtro por Estoque */}
                <div className="space-y-1">
                  <label className={`text-[10px] font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'} uppercase tracking-wider flex items-center gap-1.5`}>
                    <Boxes className="w-3 h-3 text-emerald-400" />
                    <span>Estoque / Destino</span>
                  </label>
                  <select
                    value={selectedSector}
                    onChange={(e) => setSelectedSector(e.target.value)}
                    className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs font-semibold focus:outline-none transition-colors truncate ${
                      selectedSector !== 'Todos' 
                        ? getSectorFilterStyle(selectedSector).selectClasses 
                        : 'border-slate-800 text-slate-200'
                    }`}
                    id="select-filter-movements-sector"
                  >
                    <option value="Todos">Todos os Estoques ({scopeUnits.length})</option>
                    {availableSectors.map(({ sector, count }) => (
                      <option key={sector} value={sector}>
                        {sector === 'Principal' ? 'Estoque Principal' : sector === 'Openbox' ? 'Setor Openbox' : sector === 'RMA' ? 'Setor RMA' : sector} ({count})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtro por Plataforma */}
                <div className="space-y-1">
                  <label className={`text-[10px] font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'} uppercase tracking-wider flex items-center gap-1.5`}>
                    <ShoppingCart className="w-3 h-3 text-sky-400" />
                    <span>Plataforma</span>
                  </label>
                  <select
                    value={selectedPlatform}
                    onChange={(e) => setSelectedPlatform(e.target.value)}
                    className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs font-semibold focus:outline-none transition-colors truncate ${
                      selectedPlatform !== 'Todas' 
                        ? getPlatformFilterStyle(selectedPlatform).selectClasses 
                        : 'border-slate-800 text-slate-200'
                    }`}
                    id="select-filter-movements-platform"
                  >
                    <option value="Todas">Todas as Plataformas ({scopeUnits.length})</option>
                    {availablePlatforms.map(({ platform, count }) => (
                      <option key={platform} value={platform}>
                        {platform} ({count})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Filter feedback & Clear button */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'} font-medium flex items-center gap-1.5`}>
                    <Filter className="w-3 h-3 text-sky-400" />
                    <span>Exibindo <strong className={`font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>{filteredMovements.length}</strong> de <strong className="text-slate-500 font-mono">{scopeUnits.length}</strong> itens</span>
                  </span>

                  {selectedSector !== 'Todos' && (
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border font-bold ${getSectorFilterStyle(selectedSector).badgeClasses}`}>
                      <span>Estoque: {selectedSector}</span>
                      <button 
                        onClick={() => setSelectedSector('Todos')}
                        className="hover:opacity-75 cursor-pointer ml-0.5"
                        title="Remover filtro de estoque"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  )}

                  {selectedPlatform !== 'Todas' && (
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border font-bold ${getPlatformFilterStyle(selectedPlatform).badgeClasses}`}>
                      <span>Plataforma: {selectedPlatform}</span>
                      <button 
                        onClick={() => setSelectedPlatform('Todas')}
                        className="hover:opacity-75 cursor-pointer ml-0.5"
                        title="Remover filtro de plataforma"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  )}
                </div>

                {hasActiveFilters && (
                  <button
                    onClick={handleClearFilters}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-all cursor-pointer shadow-sm ${
                      isLight 
                        ? 'text-slate-700 hover:text-slate-900 border-slate-300 hover:border-slate-400 bg-white' 
                        : 'text-slate-400 hover:text-white border-slate-800 hover:border-slate-700 bg-slate-950/60 hover:bg-slate-800'
                    }`}
                  >
                    <X className="w-3 h-3 text-rose-400" />
                    <span>Limpar Filtros</span>
                  </button>
                )}
              </div>
            </div>

            {/* List of Movements */}
            {filteredMovements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 bg-slate-950/20 rounded-2xl border border-dashed border-slate-800/50">
                <div className="p-3 bg-slate-900 rounded-xl text-slate-500">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-300">
                    {hasActiveFilters
                      ? 'Nenhum item encontrado com os filtros selecionados'
                      : selectedDay !== null 
                        ? `Nenhum item unitário registrado no dia ${selectedDay}`
                        : selectedWeek !== null
                          ? `Nenhum item unitário registrado nesta semana`
                          : 'Nenhum item unitário localizado'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-sm leading-relaxed">
                    {hasActiveFilters ? (
                      <button 
                        onClick={handleClearFilters}
                        className="text-sky-400 underline hover:text-sky-300 font-medium cursor-pointer"
                      >
                        Clique aqui para limpar os filtros de busca
                      </button>
                    ) : selectedDay !== null || selectedWeek !== null ? (
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
              <div className="custom-scroll space-y-2 max-h-[460px] overflow-y-auto pr-1">
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
                      onClick={() => onNavigateToStockUnit && onNavigateToStockUnit(item)}
                      className="unit-movement-card p-3 bg-slate-950/70 border border-slate-800/50 hover:border-sky-500/60 hover:bg-slate-800/70 rounded-xl flex items-center justify-between gap-4 transition-all text-xs cursor-pointer group shadow-sm hover:shadow-md"
                      title="Clique para ir direto a este produto no estoque"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-1.5 h-9 rounded-full ${
                          item.destinationSector === 'Principal' 
                            ? 'bg-emerald-500' 
                            : item.destinationSector === 'Openbox' 
                              ? 'bg-amber-500' 
                              : item.destinationSector === 'Descarte'
                                ? 'bg-purple-500'
                                : 'bg-rose-500'
                        }`}></div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="unit-sku-badge font-mono text-[10px] font-black text-sky-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800/80">
                              {item.baseProductSku}
                            </span>
                            {item.destinationSector !== 'Openbox' && (
                              <span className="unit-platform text-[10px] font-bold text-slate-400">
                                • {item.platform}
                              </span>
                            )}
                          </div>
                          <p className="unit-title font-bold text-white truncate text-xs group-hover:text-sky-300 transition-colors">{item.baseProductName}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 flex-wrap">
                            <span className="unit-tracking font-mono text-slate-300">{formatStiBadge(item.trackingCode)}</span>
                            {item.serialNumber && (
                              <>
                                <span>•</span>
                                <span className="unit-serial font-mono text-slate-400">S/N: {item.serialNumber}</span>
                              </>
                            )}
                            <span>•</span>
                            <span className={`unit-sector font-extrabold uppercase text-[9px] ${
                              item.destinationSector === 'Principal' 
                                ? 'text-emerald-400' 
                                : item.destinationSector === 'Openbox' 
                                  ? 'text-amber-400' 
                                  : item.destinationSector === 'Descarte'
                                    ? 'text-purple-400'
                                    : 'text-rose-400'
                            }`}>
                              Setor: {item.destinationSector}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right flex flex-col items-end gap-1.5 shrink-0">
                        <span className="unit-date-badge font-mono text-[10px] text-slate-400 flex items-center gap-1 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800/50">
                          {formattedDate} às {formattedTime}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="unit-entry-badge text-[9px] px-1.5 py-0.5 bg-sky-950/40 text-sky-400 border border-sky-800/30 rounded font-black uppercase">
                            ENTRADA
                          </span>
                          <span className="unit-stock-link text-[10px] font-bold text-sky-400 flex items-center gap-0.5 opacity-80 group-hover:opacity-100 group-hover:text-sky-300 transition-all">
                            <span>Ver no estoque</span>
                            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                          </span>
                        </div>
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
        allInflows={extendedDailyInflows}
        unitsByDayMap={unitsByDayMap}
        allUnits={units}
      />

    </div>
  );
}
