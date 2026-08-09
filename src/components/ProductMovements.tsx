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
  X
} from 'lucide-react';
import { BaseProduct, TriageUnit } from '../types';

interface ProductMovementsProps {
  products: BaseProduct[];
  units: TriageUnit[];
  onSaveTriage: (unit: TriageUnit) => Promise<void>;
  userRole: 'admin' | 'operator' | null;
}

export default function ProductMovements({ products, units, onSaveTriage, userRole }: ProductMovementsProps) {
  // Available months list extracted from units + last 12 months fallback
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    
    // Always include current month
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthsSet.add(currentMonthStr);
    
    // Generate last 12 months to guarantee choices
    for (let i = 0; i < 12; i++) {
      const d = new Date();
      d.setMonth(now.getMonth() - i);
      const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsSet.add(mStr);
    }
    
    // Add months from actual triage units
    units.forEach(u => {
      try {
        const d = new Date(u.createdAt);
        if (!isNaN(d.getTime())) {
          const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          monthsSet.add(mStr);
        }
      } catch (e) {}
    });
    
    // Convert to sorted array descending (latest first)
    return Array.from(monthsSet).sort().reverse();
  }, [units]);

  // Selected Month state ("YYYY-MM")
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

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

  // Navigate months helper
  const handlePrevMonth = () => {
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex < availableMonths.length - 1) {
      setSelectedMonth(availableMonths[currentIndex + 1]);
    } else {
      // Manual calculation if outside available range
      const [y, m] = selectedMonth.split('-').map(Number);
      const prevDate = new Date(y, m - 2, 1);
      const mStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      setSelectedMonth(mStr);
    }
  };

  const handleNextMonth = () => {
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex > 0) {
      setSelectedMonth(availableMonths[currentIndex - 1]);
    } else {
      // Manual calculation if outside available range
      const [y, m] = selectedMonth.split('-').map(Number);
      const nextDate = new Date(y, m, 1);
      const mStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
      setSelectedMonth(mStr);
    }
  };

  // Parse Year and Month index
  const { selectedYear, selectedMonthIdx, monthName, daysInMonth } = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const monthIdx = parseInt(monthStr, 10) - 1; // 0-indexed
    
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    const dim = new Date(year, monthIdx + 1, 0).getDate();
    
    return {
      selectedYear: year,
      selectedMonthIdx: monthIdx,
      monthName: monthNames[monthIdx],
      daysInMonth: dim
    };
  }, [selectedMonth]);

  // Extract all triage units for the selected month
  const monthUnits = useMemo(() => {
    return units.filter(u => {
      try {
        const uDate = new Date(u.createdAt);
        return (
          uDate.getFullYear() === selectedYear &&
          uDate.getMonth() === selectedMonthIdx
        );
      } catch {
        return false;
      }
    });
  }, [units, selectedYear, selectedMonthIdx]);

  // Compute entries per day (1 to daysInMonth)
  const dailyCounts = useMemo(() => {
    const counts = Array(daysInMonth).fill(0);
    monthUnits.forEach(u => {
      try {
        const uDate = new Date(u.createdAt);
        const day = uDate.getDate();
        if (day >= 1 && day <= daysInMonth) {
          counts[day - 1]++;
        }
      } catch {}
    });
    return counts;
  }, [monthUnits, daysInMonth]);

  // Compute dynamic calendar weeks based on full Monday-Friday workweeks
  const monthWeeks = useMemo(() => {
    const weeks: {
      index: number;
      title: string;
      range: string;
      startDate: Date;
      endDate: Date;
    }[] = [];

    const firstDayOfMonth = new Date(selectedYear, selectedMonthIdx, 1);
    const lastDayOfMonth = new Date(selectedYear, selectedMonthIdx, daysInMonth);

    // Find Monday of the week containing firstDayOfMonth
    let currMon = new Date(firstDayOfMonth);
    const dayOfWeek = currMon.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    currMon.setDate(currMon.getDate() + diffToMon);
    currMon.setHours(0, 0, 0, 0);

    while (currMon <= lastDayOfMonth) {
      const friDate = new Date(currMon);
      friDate.setDate(friDate.getDate() + 4);
      friDate.setHours(23, 59, 59, 999);

      // If Friday is before the 1st of the month, this workweek ended in the previous month
      if (friDate < firstDayOfMonth) {
        currMon.setDate(currMon.getDate() + 7);
        continue;
      }

      const sunDate = new Date(currMon);
      sunDate.setDate(sunDate.getDate() + 6);
      sunDate.setHours(23, 59, 59, 999);

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
        title: `Semana ${weeks.length + 1}`,
        range: rangeStr,
        startDate: new Date(currMon),
        endDate: sunDate
      });

      // Advance to next Monday
      currMon.setDate(currMon.getDate() + 7);
    }

    return weeks;
  }, [selectedYear, selectedMonthIdx, daysInMonth]);

  // Compute entries per week based on monthWeeks
  const weeklyCounts = useMemo(() => {
    const counts = Array(monthWeeks.length).fill(0);
    monthUnits.forEach(u => {
      try {
        const uTime = new Date(u.createdAt).getTime();
        const weekIdx = monthWeeks.findIndex(
          w => uTime >= w.startDate.getTime() && uTime <= w.endDate.getTime()
        );
        if (weekIdx !== -1) {
          counts[weekIdx]++;
        }
      } catch {}
    });
    return counts;
  }, [monthUnits, monthWeeks]);

  // Peak metrics
  const peakMetrics = useMemo(() => {
    // Peak week
    let peakWeekIdx = 0;
    let maxWeekVal = 0;
    weeklyCounts.forEach((val, idx) => {
      if (val > maxWeekVal) {
        maxWeekVal = val;
        peakWeekIdx = idx;
      }
    });

    // Peak day
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

  // Filtered list of movements
  const filteredMovements = useMemo(() => {
    return units.filter(u => {
      try {
        const uDate = new Date(u.createdAt);
        // 1. Must be in selected month
        if (
          uDate.getFullYear() !== selectedYear ||
          uDate.getMonth() !== selectedMonthIdx
        ) {
          return false;
        }

        // 2. Must match selectedDay if set
        if (selectedDay !== null && uDate.getDate() !== selectedDay) {
          return false;
        }

        // 3. Must match selectedWeek if set
        if (selectedWeek !== null && monthWeeks[selectedWeek]) {
          const targetWeek = monthWeeks[selectedWeek];
          const uTime = uDate.getTime();
          if (uTime < targetWeek.startDate.getTime() || uTime > targetWeek.endDate.getTime()) {
            return false;
          }
        }

        // 4. Must match search query
        if (searchQuery.trim() !== '') {
          const query = searchQuery.toLowerCase();
          const matchesSku = u.baseProductSku?.toLowerCase().includes(query);
          const matchesName = u.baseProductName?.toLowerCase().includes(query);
          const matchesTracking = u.trackingCode?.toLowerCase().includes(query);
          const matchesPlatform = u.platform?.toLowerCase().includes(query);
          const matchesSector = u.destinationSector?.toLowerCase().includes(query);
          return matchesSku || matchesName || matchesTracking || matchesPlatform || matchesSector;
        }

        return true;
      } catch {
        return false;
      }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [units, selectedYear, selectedMonthIdx, selectedDay, selectedWeek, searchQuery, monthWeeks]);

  // Counts of each sector for filtered movements
  const sectorCountsFiltered = useMemo(() => {
    const counts = { Principal: 0, Openbox: 0, RMA: 0 };
    filteredMovements.forEach(m => {
      if (m.destinationSector === 'Principal') counts.Principal++;
      else if (m.destinationSector === 'Openbox') counts.Openbox++;
      else if (m.destinationSector === 'RMA') counts.RMA++;
    });
    return counts;
  }, [filteredMovements]);

  // Max value of weekly and daily counts for chart scaling
  const maxWeeklyCount = Math.max(...weeklyCounts, 1);
  const maxDailyCount = Math.max(...dailyCounts, 1);

  // Calendar info for 7-day calendar grid (Dom to Sáb)
  const firstDayWeekday = new Date(selectedYear, selectedMonthIdx, 1).getDay(); // 0 is Sunday, 1 is Monday...
  const calendarDays = useMemo(() => {
    const days: ({ dayNum: number; count: number; dateStr: string } | null)[] = [];

    // Blank padding cells for weekdays before the 1st
    for (let i = 0; i < firstDayWeekday; i++) {
      days.push(null);
    }

    // Real day cells
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

  // Format month name to show in select dropdown option
  const formatMonthOptionName = (mStr: string) => {
    const [y, m] = mStr.split('-');
    const mNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${mNames[parseInt(m, 10) - 1]} / ${y}`;
  };

  return (
    <div className="space-y-6" id="product-movements-tab">
      
      {/* Title & Introduction */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800/50 shadow-sm animate-in fade-in duration-200" id="movements-header">
        <div>
          <div className="flex items-center gap-2 text-sky-400 font-bold text-xs uppercase tracking-wider mb-1">
            <Boxes className="w-4.5 h-4.5" />
            Fluxo Mensal
          </div>
          <h2 className="text-xl font-black text-white">Fluxo de Entradas por Mês</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
            Selecione um mês específico para visualizar e analisar a distribuição de entradas dividida por semanas e dias de forma detalhada.
          </p>
        </div>

        {/* Beautiful Month Selector & Controls */}
        <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800/50 self-start md:self-auto shadow-inner">
          <button
            onClick={handlePrevMonth}
            className="p-2 hover:bg-slate-900 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
            title="Mês Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent text-sm font-black text-white border-0 focus:ring-0 focus:outline-none cursor-pointer px-2 min-w-[150px] text-center"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m} className="bg-slate-950 text-slate-200 font-bold">
                {formatMonthOptionName(m)}
              </option>
            ))}
          </select>

          <button
            onClick={handleNextMonth}
            className="p-2 hover:bg-slate-900 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
            title="Próximo Mês"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Statistics Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in fade-in duration-300" id="movements-stats-row">
        
        {/* Total Month Entries Card */}
        <div 
          onClick={() => { setSelectedDay(null); setSelectedWeek(null); }}
          className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between hover:scale-[1.01] duration-300 ${
            selectedDay === null && selectedWeek === null 
              ? 'bg-sky-500/5 border-sky-500/30 shadow-md shadow-sky-500/5 ring-1 ring-sky-500/20' 
              : 'bg-[#0f172a]/60 border-slate-800/50 hover:border-slate-800'
          }`}
          title="Clique para ver todas as entradas do mês"
        >
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-400">Total de Entradas em {monthName}</span>
            <div className={`p-1.5 rounded-lg ${selectedDay === null && selectedWeek === null ? 'bg-sky-500/10 text-sky-400' : 'bg-slate-950 text-slate-500'}`}>
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight">{monthUnits.length}</span>
            <span className="text-[10px] text-slate-450 font-bold">unidades</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-900 text-[10px] text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
              {selectedDay === null && selectedWeek === null ? 'Mostrando todo o mês' : 'Clique para restaurar o mês'}
            </span>
            { (selectedDay !== null || selectedWeek !== null) && (
              <span className="text-[10px] text-sky-400 font-extrabold flex items-center gap-0.5">
                Ver todos
              </span>
            )}
          </div>
        </div>

        {/* Peak Week Card */}
        <div 
          onClick={() => {
            if (peakMetrics.peakWeek) {
              setSelectedWeek(peakMetrics.peakWeek.index);
              setSelectedDay(null);
            }
          }}
          className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between hover:scale-[1.01] duration-300 ${
            selectedWeek !== null 
              ? 'bg-[#4f46e5]/5 border-[#4f46e5]/30 shadow-md shadow-[#4f46e5]/5 ring-1 ring-[#4f46e5]/20' 
              : 'bg-[#0f172a]/60 border-slate-800/50 hover:border-slate-800'
          }`}
          title={peakMetrics.peakWeek ? `Clique para filtrar pela Semana ${peakMetrics.peakWeek.index + 1}` : undefined}
        >
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-400">Semana de Pico</span>
            <div className={`p-1.5 rounded-lg ${selectedWeek !== null ? 'bg-[#4f46e5]/10 text-[#818cf8]' : 'bg-slate-950 text-slate-500'}`}>
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            {peakMetrics.peakWeek ? (
              <>
                <span className="text-3xl font-black text-white tracking-tight">
                  Semana {peakMetrics.peakWeek.index + 1}
                </span>
                <span className="text-[10px] text-slate-450 font-bold">
                  ({peakMetrics.peakWeek.value} un)
                </span>
              </>
            ) : (
              <span className="text-lg font-bold text-slate-500">Nenhum registro</span>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-900 text-[10px] text-slate-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
            {peakMetrics.peakWeek 
              ? `Semana ${peakMetrics.peakWeek.index + 1} teve o maior fluxo` 
              : 'Sem dados para o mês'
            }
          </div>
        </div>

        {/* Peak Day Card */}
        <div 
          onClick={() => {
            if (peakMetrics.peakDay) {
              setSelectedDay(peakMetrics.peakDay.index + 1);
              setSelectedWeek(null);
            }
          }}
          className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between hover:scale-[1.01] duration-300 ${
            selectedDay !== null 
              ? 'bg-[#7c3aed]/5 border-[#7c3aed]/30 shadow-md shadow-[#7c3aed]/5 ring-1 ring-[#7c3aed]/20' 
              : 'bg-[#0f172a]/60 border-slate-800/50 hover:border-slate-800'
          }`}
          title={peakMetrics.peakDay ? `Clique para filtrar pelo Dia ${peakMetrics.peakDay.index + 1}` : undefined}
        >
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-400">Dia de Pico</span>
            <div className={`p-1.5 rounded-lg ${selectedDay !== null ? 'bg-[#7c3aed]/10 text-[#a78bfa]' : 'bg-slate-950 text-slate-500'}`}>
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            {peakMetrics.peakDay ? (
              <>
                <span className="text-3xl font-black text-white tracking-tight">
                  Dia {peakMetrics.peakDay.index + 1}
                </span>
                <span className="text-[10px] text-slate-450 font-bold">
                  ({peakMetrics.peakDay.value} un)
                </span>
              </>
            ) : (
              <span className="text-lg font-bold text-slate-500">Nenhum registro</span>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-900 text-[10px] text-slate-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500"></span>
            {peakMetrics.peakDay 
              ? `Dia ${peakMetrics.peakDay.index + 1} de ${monthName} liderou` 
              : 'Sem dados para o mês'
            }
          </div>
        </div>

      </div>

      {/* Main Analysis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="movements-main-grid">
        
        {/* Left Column: Weekly Distribution Card (lg:col-span-4) */}
        <div className="lg:col-span-4 bg-[#0d1527] border border-slate-800/50 p-6 rounded-2xl flex flex-col justify-between space-y-4 shadow-sm animate-in fade-in duration-300" id="weekly-flow-panel">
          <div>
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Distribuição Semanal</h3>
              <span className="text-[10px] px-2 py-0.5 bg-slate-950 rounded border border-slate-800/50 text-slate-400 font-mono">
                {monthWeeks.length} Semanas
              </span>
            </div>
            <h4 className="text-sm font-extrabold text-white">Entradas por Semana</h4>
            <p className="text-[10px] text-slate-400 mt-1">Clique para filtrar o histórico por semana.</p>
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
                          : 'bg-gradient-to-r from-slate-700 to-slate-500 group-hover:from-indigo-600 group-hover:to-indigo-455'
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
                {monthUnits.length}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-bold">Média Semanal</span>
              <span className="font-extrabold text-white text-base mt-0.5 block">
                {(monthUnits.length / Math.max(monthWeeks.length, 1)).toFixed(1)} / sem
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Daily Distribution & Calendar Grid (lg:col-span-8) */}
        <div className="lg:col-span-8 bg-[#0d1527] border border-slate-800/50 p-6 rounded-2xl flex flex-col space-y-4 shadow-sm animate-in fade-in duration-300" id="daily-flow-panel">
          
          {/* Header of Daily Flow with Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/50 pb-4 shrink-0">
            <div>
              <h3 className="text-sm font-black text-white">Análise Diária • {monthName}</h3>
              <p className="text-[10px] text-slate-400">Escolha o modo de visualização dos dias e clique para interagir.</p>
            </div>

            {/* View switcher: Calendar vs Chart */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/50 gap-0.5" id="daily-view-switcher">
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

          {/* Conditional Rendering of Views */}
          {dailyViewType === 'calendar' ? (
            <div className="flex-1 flex flex-col justify-between" id="calendar-view-container">
              {/* Calendar Grid */}
              <div className="space-y-2">
                {/* Weekday Headers (Dom a Sáb) */}
                <div className="grid grid-cols-7 gap-1.5 text-center">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((wd) => (
                    <div key={wd} className="text-[10px] font-black text-slate-500 uppercase tracking-widest py-1">
                      {wd}
                    </div>
                  ))}
                </div>

                {/* Day Cells Grid (7 columns) */}
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
                    
                    // Intensity scale styling
                    let bgClass = 'bg-slate-950/40 border-slate-900/50 text-slate-400';
                    let hoverClass = 'hover:border-slate-800 hover:text-slate-200';
                    let countBadgeClass = 'text-[9px] text-slate-550';

                    if (hasEntries) {
                      hoverClass = 'hover:scale-[1.03] duration-150';
                      if (cell.count === 1) {
                        bgClass = 'bg-indigo-950/20 border-indigo-950/60 text-indigo-300';
                        countBadgeClass = 'text-[10px] text-indigo-400/80 font-bold';
                      } else if (cell.count >= 2 && cell.count <= 4) {
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
                        {/* Day number */}
                        <span className="text-[11px] font-mono leading-none font-bold">
                          {cell.dayNum}
                        </span>
                        
                        {/* Entry Count Indicator */}
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
            /* Daily Bar Chart */
            <div className="flex-1 flex flex-col justify-center animate-in fade-in" id="chart-view-container">
              <div className="flex flex-col space-y-2">
                <div className="flex justify-between text-[10px] text-slate-550 px-1">
                  <span>Dia 1</span>
                  <span>Meio do Mês</span>
                  <span>Dia {daysInMonth}</span>
                </div>
                
                {/* Scrollable container of bars - Height increased and padding added to prevent tooltip clipping */}
                <div className="h-72 w-full flex items-end gap-1.5 pt-12 border-b border-slate-850 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-slate-950 pb-2 px-1">
                  {dailyCounts.map((val, idx) => {
                    const dayNum = idx + 1;
                    // Scale maximum height to 75% so there's always at least 25% empty space at the top of the container for the tooltip
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
                        {/* Bar */}
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

                          {/* Beautiful Tooltip on hover - Placed inside the bar so it's positioned relative to the bar top */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 border border-slate-800 text-white font-mono text-[10px] font-black px-2.5 py-1 rounded-lg shadow-xl shadow-slate-950/50 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 pointer-events-none whitespace-nowrap">
                            Dia {dayNum}: {val} un
                            {/* Triangle indicator pointing down */}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-slate-900 border-r border-b border-slate-800 rotate-45"></div>
                          </div>
                        </div>
                        
                        {/* X Axis Label */}
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

          {/* Quick Active Filters Banner */}
          {(selectedDay !== null || selectedWeek !== null) && (
            <div className="bg-indigo-500/10 border border-indigo-500/20 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs text-indigo-300 font-bold animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>
                  Filtrando por:{' '}
                  <span className="text-white bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 rounded ml-1 font-extrabold text-[11px]">
                    {selectedDay !== null ? `Dia ${selectedDay} de ${monthName}` : `Semana ${selectedWeek! + 1} (${monthWeeks[selectedWeek!]?.range})`}
                  </span>
                </span>
              </div>
              <button
                onClick={() => {
                  setSelectedDay(null);
                  setSelectedWeek(null);
                }}
                className="p-1 hover:bg-indigo-500/20 rounded-lg text-indigo-400 hover:text-white transition-all cursor-pointer flex items-center gap-1 text-[11px] font-extrabold"
              >
                <X className="w-3.5 h-3.5" />
                Limpar Filtro
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Analytical History List */}
      <div className="bg-[#0d1527] border border-slate-800/50 p-6 rounded-2xl flex flex-col space-y-4 shadow-sm animate-in fade-in duration-300" id="history-panel">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-white">Histórico de Movimentações</h3>
            <p className="text-[10px] text-slate-400">
              {selectedDay !== null 
                ? `Mostrando registros do Dia ${selectedDay} de ${monthName}` 
                : selectedWeek !== null 
                  ? `Mostrando registros da Semana ${selectedWeek + 1} de ${monthName}` 
                  : `Mostrando registros de todo o mês de ${monthName}`
              }
            </p>
          </div>
          
          {/* Active Filter counter indicator */}
          <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800/50 font-bold">
            {filteredMovements.length} de {monthUnits.length} localizados no mês
          </span>
        </div>

        {/* Sector breakdown for the filtered movements */}
        <div className="grid grid-cols-3 gap-3 pt-1 pb-1">
          <div className="bg-slate-950/60 border border-emerald-500/10 rounded-xl p-2.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <div className="min-w-0">
              <p className="text-[9px] text-slate-400 uppercase font-black tracking-wider truncate">Principal</p>
              <p className="text-sm font-mono font-black text-emerald-400 leading-tight">{sectorCountsFiltered.Principal}</p>
            </div>
          </div>
          <div className="bg-slate-950/60 border border-amber-500/10 rounded-xl p-2.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
            <div className="min-w-0">
              <p className="text-[9px] text-slate-400 uppercase font-black tracking-wider truncate">Openbox</p>
              <p className="text-sm font-mono font-black text-amber-400 leading-tight">{sectorCountsFiltered.Openbox}</p>
            </div>
          </div>
          <div className="bg-slate-950/60 border border-rose-500/10 rounded-xl p-2.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
            <div className="min-w-0">
              <p className="text-[9px] text-slate-400 uppercase font-black tracking-wider truncate">RMA</p>
              <p className="text-sm font-mono font-black text-rose-400 leading-tight">{sectorCountsFiltered.RMA}</p>
            </div>
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
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 bg-slate-950/20 rounded-2xl border border-dashed border-slate-800/50" id="empty-movements-state">
            <div className="p-3 bg-slate-900 rounded-xl text-slate-500">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-300">Nenhuma movimentação localizada</p>
              <p className="text-[10px] text-slate-500 mt-1 max-w-xs leading-relaxed">
                Não há registros de triagem que correspondam aos filtros ativos neste momento. Tente selecionar outro período ou limpar as buscas.
              </p>
            </div>
            {(selectedDay !== null || selectedWeek !== null || searchQuery !== '') && (
              <button
                onClick={() => {
                  setSelectedDay(null);
                  setSelectedWeek(null);
                  setSearchQuery('');
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl text-[11px] text-white font-bold transition-all cursor-pointer"
              >
                Limpar Todos os Filtros
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-slate-950" id="movements-scroller">
            {filteredMovements.map((item) => {
              const uDate = new Date(item.createdAt);
              const formattedTime = uDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              const formattedDate = uDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

              return (
                <div 
                  key={item.id}
                  className="p-3 bg-[#0a0f1d] border border-slate-800/50 hover:border-slate-800 rounded-xl flex items-center justify-between gap-4 transition-all text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Colored Left Indicator Bar */}
                    <div className={`w-1 h-8 rounded-full ${
                      item.destinationSector === 'Principal' 
                        ? 'bg-emerald-500' 
                        : item.destinationSector === 'Openbox' 
                          ? 'bg-amber-500' 
                          : 'bg-rose-500'
                    }`}></div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[10px] font-black text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800/50">
                          {item.baseProductSku}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                          • {item.platform}
                        </span>
                      </div>
                      <p className="font-bold text-white truncate text-xs">{item.baseProductName}</p>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                        <span className="font-mono">{item.trackingCode}</span>
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
  );
}
