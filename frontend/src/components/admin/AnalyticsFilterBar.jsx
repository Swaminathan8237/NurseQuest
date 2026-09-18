import React, { useState, useEffect, useRef } from 'react';
const t = (val) => val;
import { adminAPI } from '../../api';

const PERIODS = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: '7 Days' },
  { id: 'month', label: '30 Days' },
];

const GAME_MODES = [
  { id: 'all', label: 'All', icon: 'apps', color: '#3B82F6' },
  { id: 'solo', label: 'Solo', icon: 'person', color: '#7C3AED' },
  { id: 'live', label: 'Live', icon: 'groups', color: '#10B981' },
];

const QUESTION_TYPES = ['mcq', 'image', 'video', 'matching', 'slider'];

/**
 * FilterDropdown — sleek dark-themed custom dropdown with glassmorphic styling,
 * animated chevron, checkmark indicators, max-height scrolling, and click-outside dismissal.
 */
function FilterDropdown({ label, value, options, onChange, placeholder = 'All', icon }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [open]);

  const selectedOption = options.find(o => o.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;
  const isFiltered = Boolean(value);

  return (
    <div className="filter-group" ref={ref} style={{ position: 'relative' }}>
      <span className="filter-label">{label}</span>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={`filter-select-btn ${isFiltered ? 'active' : ''} ${open ? 'open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {icon && (
          <span className="material-symbols-outlined" style={{ fontSize: 14, opacity: 0.7 }}>
            {icon}
          </span>
        )}
        <span className="filter-select-text">{displayLabel}</span>
        <span
          className="material-symbols-outlined filter-select-chevron"
          style={{
            fontSize: 16,
            transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="filter-dropdown-menu" role="listbox">
          <button
            type="button"
            className={`filter-dropdown-item ${!value ? 'selected' : ''}`}
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            <span>{placeholder}</span>
            {!value && (
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#A78BFA' }}>
                check
              </span>
            )}
          </button>
          {options.map(opt => {
            const isSelected = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`filter-dropdown-item ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#A78BFA' }}>
                    check
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * AnalyticsFilterBar — a compact horizontal filter strip for admin analytics.
 * 
 * Emits a flat { mode, period, university, class, qtype } object on every change.
 * All values start null/empty = "no filter", which the backend treats as "show everything".
 */
export default function AnalyticsFilterBar({ onChange, className = '', showQType = false }) {
  const [classes, setClasses] = useState([]);
  const [universitiesList, setUniversitiesList] = useState([]);
  const [filters, setFilters] = useState({
    mode: 'all',
    period: 'all',
    university: '',
    class: '',
    qtype: '',
  });

  // Fetch available classes and universities for dropdowns
  useEffect(() => {
    adminAPI.getClasses().then(data => {
      if (Array.isArray(data)) {
        setClasses(data);
      } else if (data?.classes) {
        setClasses(data.classes);
        if (Array.isArray(data.universities) && data.universities.length > 0) {
          setUniversitiesList(data.universities);
        }
      }
    }).catch(() => {});
  }, []);

  const update = (key, value) => {
    const next = { ...filters, [key]: value };
    // Reset class when university changes
    if (key === 'university') next.class = '';
    setFilters(next);
    onChange?.(next);
  };

  const clearAll = () => {
    const reset = { mode: 'all', period: 'all', university: '', class: '', qtype: '' };
    setFilters(reset);
    onChange?.(reset);
  };

  const hasFilters = filters.university || filters.class || filters.qtype || filters.period !== 'all' || filters.mode !== 'all';

  // Extract unique universities from backend list or class rows
  const universities = universitiesList.length > 0
    ? universitiesList
    : [...new Set(classes.map(c => c.university).filter(Boolean))].sort();

  const universityOptions = universities.map(u => ({ value: u, label: u }));

  const filteredClasses = filters.university
    ? classes.filter(c => c.university === filters.university)
    : classes;

  const classOptions = [...new Set(filteredClasses.map(c => c.classSection || c.class_section).filter(Boolean))]
    .sort()
    .map(c => ({ value: c, label: c }));

  const qtypeOptions = QUESTION_TYPES.map(qt => ({
    value: qt,
    label: qt.charAt(0).toUpperCase() + qt.slice(1)
  }));

  return (
    <div className={`analytics-filter-bar ${className}`}>
      {/* Game Mode pills */}
      <div className="filter-group">
        <span className="filter-label">{t('Mode')}</span>
        <div className="pill-group">
          {GAME_MODES.map(m => (
            <button
              key={m.id}
              onClick={() => update('mode', m.id)}
              className={`filter-pill ${filters.mode === m.id ? 'active' : ''}`}
              style={filters.mode === m.id ? {
                background: `${m.color}22`,
                borderColor: m.color,
                color: m.color,
                boxShadow: `0 0 12px ${m.color}33`,
              } : {}}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{m.icon}</span>
              {t(m.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Period pills */}
      <div className="filter-group">
        <span className="filter-label">{t('Period')}</span>
        <div className="pill-group">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => update('period', p.id)}
              className={`filter-pill ${filters.period === p.id ? 'active' : ''}`}
            >
              {t(p.label)}
            </button>
          ))}
        </div>
      </div>

      {/* University custom dropdown */}
      <FilterDropdown
        label={t('University')}
        value={filters.university}
        options={universityOptions}
        onChange={val => update('university', val)}
        placeholder={t('All')}
        icon="school"
      />

      {/* Class custom dropdown */}
      <FilterDropdown
        label={t('Class')}
        value={filters.class}
        options={classOptions}
        onChange={val => update('class', val)}
        placeholder={t('All')}
        icon="groups"
      />

      {/* Question Type (conditional) */}
      {showQType && (
        <FilterDropdown
          label={t('Q. Type')}
          value={filters.qtype}
          options={qtypeOptions}
          onChange={val => update('qtype', val)}
          placeholder={t('All')}
          icon="help"
        />
      )}

      {/* Clear button */}
      {hasFilters && (
        <button onClick={clearAll} className="filter-clear-btn">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
          {t('Clear')}
        </button>
      )}
    </div>
  );
}
