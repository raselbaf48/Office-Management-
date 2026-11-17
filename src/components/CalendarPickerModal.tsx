import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, Clock, Check, Lock } from 'lucide-react';

interface CalendarPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  value: string;
  onChange: (newDateStr: string) => void;
  multiSelectMode?: boolean;
  initialSelectedDates?: string[];
  onApplyMultipleDates?: (dates: string[]) => void;
  minDate?: string;
  multiSelectSummary?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const CalendarPickerModal: React.FC<CalendarPickerModalProps> = ({
  isOpen,
  onClose,
  value,
  onChange,
  multiSelectMode = false,
  initialSelectedDates = [],
  onApplyMultipleDates,
  minDate,
  multiSelectSummary,
}) => {
  // Parse initial date or default to today
  const getInitialState = () => {
    if (value && typeof value === 'string') {
      const parts = value.trim().split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          return { year: y, month: m, selectedDay: d, selectedFull: value.trim() };
        }
      }
    }
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();
    const formatted = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return { year: y, month: m, selectedDay: d, selectedFull: formatted };
  };

  const initial = getInitialState();
  const [currentYear, setCurrentYear] = useState<number>(initial.year);
  const [currentMonth, setCurrentMonth] = useState<number>(initial.month);
  const [selectedDates, setSelectedDates] = useState<string[]>(initialSelectedDates);

  // Sync state whenever modal opens or value changes
  useEffect(() => {
    if (isOpen) {
      const state = getInitialState();
      setCurrentYear(state.year);
      setCurrentMonth(state.month);
      setSelectedDates(initialSelectedDates);
    }
  }, [isOpen, value]);

  if (!isOpen) return null;

  // Navigation handlers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const y = currentYear;
    const m = String(currentMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    const fullDate = `${y}-${m}-${d}`;
    if (minDate && fullDate < minDate) {
      return;
    }
    if (multiSelectMode) {
      setSelectedDates((prev) =>
        prev.includes(fullDate)
          ? prev.filter((dt) => dt !== fullDate)
          : [...prev, fullDate].sort()
      );
      return;
    }
    onChange(fullDate);
    onClose();
  };

  const handleSetToday = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const fullDate = `${y}-${m}-${d}`;
    if (multiSelectMode) {
      if (!minDate || fullDate >= minDate) {
        setSelectedDates((prev) =>
          prev.includes(fullDate) ? prev : [...prev, fullDate].sort()
        );
      }
      setCurrentYear(today.getFullYear());
      setCurrentMonth(today.getMonth());
      return;
    }
    onChange(fullDate);
    onClose();
  };

  const handleApplyMultiDates = () => {
    if (!multiSelectMode || selectedDates.length === 0) return;
    const sorted = [...selectedDates].sort();
    if (onApplyMultipleDates) {
      onApplyMultipleDates(sorted);
    }
    onClose();
  };

  const formatShortDateChip = (isoDate: string) => {
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    const mIdx = parseInt(parts[1], 10) - 1;
    const mName = SHORT_MONTH_NAMES[mIdx] || parts[1];
    return `${parts[2]} ${mName}`;
  };

  // Calculate days for the calendar grid
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

  // Selected date components for comparison
  let selectedY: number | null = null;
  let selectedM: number | null = null;
  let selectedD: number | null = null;
  if (value && typeof value === 'string') {
    const parts = value.trim().split('-');
    if (parts.length === 3) {
      selectedY = parseInt(parts[0], 10);
      selectedM = parseInt(parts[1], 10) - 1;
      selectedD = parseInt(parts[2], 10);
    }
  }

  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  // Year options for the dropdown (e.g., 2020 to 2035)
  const years = Array.from({ length: 16 }, (_, i) => 2020 + i);

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-[360px] overflow-hidden transform transition-all animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center space-x-2 min-w-0">
            <div className={`p-1.5 text-white rounded-lg shadow-xs shrink-0 ${multiSelectMode ? 'bg-amber-500' : 'bg-indigo-600'}`}>
              {multiSelectMode ? <Lock className="w-4 h-4" /> : <CalendarIcon className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                {multiSelectMode ? 'Select Dates to Apply' : 'Select Date'}
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold truncate">
                {multiSelectMode
                  ? (multiSelectSummary || 'একাধিক তারিখ ক্লিক করে Apply চাপুন')
                  : 'তারিখ, মাস ও বছর পরিবর্তন করুন'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Month & Year Selectors with Prev/Next buttons */}
        <div className="p-4 pb-2">
          <div className="flex items-center justify-between mb-3 bg-slate-100/80 dark:bg-slate-800/80 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="w-8 h-8 flex items-center justify-center bg-gradient-to-b from-white via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-800 dark:to-slate-900 hover:from-slate-50 hover:to-slate-200 dark:hover:from-slate-650 dark:hover:to-slate-800 text-slate-700 dark:text-indigo-300 hover:text-slate-900 dark:hover:text-white rounded-lg transition-all cursor-pointer border-t border-white dark:border-t-slate-600/80 border-x border-slate-250 dark:border-slate-700/80 border-b-[2.5px] border-b-slate-400 dark:border-b-slate-950 shadow-[0_2px_4px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)] active:translate-y-[1.5px] active:border-b active:shadow-[0_0_1px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(0,0,0,0.5)]"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2.5] drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]" />
            </button>

            <div className="flex items-center space-x-1.5">
              {/* Month Dropdown */}
              <select
                value={currentMonth}
                onChange={(e) => setCurrentMonth(parseInt(e.target.value, 10))}
                className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-bold text-xs px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-indigo-500 shadow-xs cursor-pointer"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>

              {/* Year Dropdown */}
              <select
                value={currentYear}
                onChange={(e) => setCurrentYear(parseInt(e.target.value, 10))}
                className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-bold text-xs px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-indigo-500 shadow-xs cursor-pointer"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="w-8 h-8 flex items-center justify-center bg-gradient-to-b from-white via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-800 dark:to-slate-900 hover:from-slate-50 hover:to-slate-200 dark:hover:from-slate-650 dark:hover:to-slate-800 text-slate-700 dark:text-indigo-300 hover:text-slate-900 dark:hover:text-white rounded-lg transition-all cursor-pointer border-t border-white dark:border-t-slate-600/80 border-x border-slate-250 dark:border-slate-700/80 border-b-[2.5px] border-b-slate-400 dark:border-b-slate-950 shadow-[0_2px_4px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[0_2px_4px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)] active:translate-y-[1.5px] active:border-b active:shadow-[0_0_1px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(0,0,0,0.5)]"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4 stroke-[2.5] drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]" />
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {WEEKDAYS.map((wd, i) => (
              <div 
                key={wd} 
                className={`text-[11px] font-black py-1 ${i === 5 || i === 6 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {/* Blank cells before day 1 */}
            {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
              <div key={`empty-${idx}`} className="h-8 w-8" />
            ))}

            {/* Days 1..N */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const fullDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isBeforeMin = Boolean(minDate && fullDateStr < minDate);
              const isMultiSelected = multiSelectMode && selectedDates.includes(fullDateStr);
              const isSelected = !multiSelectMode && selectedY === currentYear && selectedM === currentMonth && selectedD === day;
              const isToday = todayY === currentYear && todayM === currentMonth && todayD === day;

              return (
                <button
                  key={`day-${day}`}
                  type="button"
                  disabled={isBeforeMin}
                  onClick={() => handleSelectDay(day)}
                  className={`h-8 w-8 mx-auto rounded-lg text-xs font-bold flex items-center justify-center transition-all ${
                    isBeforeMin
                      ? 'opacity-35 cursor-not-allowed text-slate-400 dark:text-slate-600'
                      : isMultiSelected
                      ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400/50 scale-105 cursor-pointer font-black'
                      : isSelected
                      ? 'bg-indigo-600 text-white shadow-md scale-105 cursor-pointer'
                      : isToday
                      ? 'border border-indigo-500 text-indigo-600 dark:text-indigo-400 font-black hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Multi-date selected chips */}
          {multiSelectMode && (
            <div className="mt-3 p-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/70">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Selected Dates ({selectedDates.length})
                </span>
                {selectedDates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDates([])}
                    className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>
              {selectedDates.length === 0 ? (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                  Click dates on the calendar above...
                </p>
              ) : (
                <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                  {selectedDates.map((dStr) => (
                    <span
                      key={dStr}
                      onClick={() => setSelectedDates((prev) => prev.filter((x) => x !== dStr))}
                      title="Click to remove date"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold cursor-pointer hover:bg-rose-600 transition-colors"
                    >
                      <span>{formatShortDateChip(dStr)}</span>
                      <X className="w-2.5 h-2.5" />
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleSetToday}
            className="flex items-center space-x-1 px-2.5 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{multiSelectMode ? '+ Today' : 'Today'}</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              {multiSelectMode ? 'Cancel' : 'Close'}
            </button>
            {multiSelectMode && (
              <button
                type="button"
                disabled={selectedDates.length === 0}
                onClick={handleApplyMultiDates}
                className={`flex items-center space-x-1 px-3.5 py-1.5 text-xs font-black rounded-lg transition-all shadow-xs ${
                  selectedDates.length > 0
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                    : 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                }`}
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Apply ({selectedDates.length})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
