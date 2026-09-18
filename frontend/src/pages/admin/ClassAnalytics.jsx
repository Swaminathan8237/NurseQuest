import React, { useState, useEffect, useCallback } from 'react';
const t = (val) => val;
import { adminAPI } from '../../api';
import AnalyticsFilterBar from '../../components/admin/AnalyticsFilterBar';

// Color helper for accuracy
const accColor = (pct) => {
  if (pct >= 90) return '#10B981';
  if (pct >= 75) return '#22C55E';
  if (pct >= 60) return '#F59E0B';
  if (pct >= 50) return '#F97316';
  return '#EF4444';
};

function SplitBar({ solo, live, both }) {
  const total = (solo || 0) + (live || 0) + (both || 0);
  if (total === 0) return <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>—</span>;
  return (
    <div className="split-bar" title={`Solo: ${solo} | Both: ${both} | Live: ${live}`}>
      <div className="split-bar-solo" style={{ width: `${(solo / total) * 100}%` }} />
      <div className="split-bar-both" style={{ width: `${(both / total) * 100}%` }} />
      <div className="split-bar-live" style={{ width: `${(live / total) * 100}%` }} />
    </div>
  );
}

function AccuracyBar({ value }) {
  return (
    <div className="accuracy-bar-inline">
      <span style={{ minWidth: 32, fontWeight: 700, color: accColor(value) }}>{value}%</span>
      <div className="accuracy-bar-track">
        <div className="accuracy-bar-fill" style={{ width: `${value}%`, background: accColor(value) }} />
      </div>
    </div>
  );
}

function KnowledgeBadge({ score, level }) {
  return (
    <span className="knowledge-badge" style={{
      background: `${level?.color || '#888'}22`,
      color: level?.color || '#888',
      border: `1px solid ${level?.color || '#888'}44`,
    }}>
      {score} · {level?.label || 'N/A'}
    </span>
  );
}

function ExpandedClassDetails({ cls, data }) {
  
  const bands = cls.accuracyBands || {};
  const bandData = [
    { label: 'Excellent', value: bands.excellent || 0, color: '#10B981' },
    { label: 'Good', value: bands.good || 0, color: '#22C55E' },
    { label: 'Moderate', value: bands.moderate || 0, color: '#F59E0B' },
    { label: 'Poor', value: bands.poor || 0, color: '#F97316' },
    { label: 'Very Poor', value: bands.veryPoor || 0, color: '#EF4444' },
  ];
  const bandTotal = bandData.reduce((s, b) => s + b.value, 0) || 1;

  const qtypes = data?.byQuestionType || [];
  const maxAnswered = Math.max(...qtypes.map(q => q.answered), 1);

  // Filter dormant students for this class
  const dormant = (data?.dormant || []).filter(
    s => s.university === cls.university && s.classSection === cls.classSection
  ).slice(0, 5);

  return (
    <div className="class-expanded-row" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: 16,
      padding: 16,
      background: 'rgba(255, 255, 255, 0.02)',
      borderRadius: 8,
      margin: '4px 8px 12px',
    }}>
      {/* Accuracy Bands */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.5)',
        borderRadius: 10,
        padding: 16,
        border: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t('Accuracy Bands')}
        </div>
        {bandData.map(b => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 70, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{b.label}</span>
            <div style={{
              flex: 1, height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden',
            }}>
              <div style={{
                width: `${(b.value / bandTotal) * 100}%`,
                height: '100%',
                background: b.color,
                borderRadius: 4,
                transition: 'width 0.6s ease',
              }} />
            </div>
            <span style={{ width: 24, fontSize: 12, fontWeight: 700, color: b.color, textAlign: 'right' }}>{b.value}</span>
          </div>
        ))}
      </div>

      {/* Question Type Performance */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.5)',
        borderRadius: 10,
        padding: 16,
        border: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t('By Question Type')}
        </div>
        {qtypes.length === 0 ? (
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{t('No data')}</span>
        ) : qtypes.map(q => (
          <div key={q.type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 60, fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize' }}>{q.type}</span>
            <div style={{
              flex: 1, height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden',
            }}>
              <div style={{
                width: `${q.accuracy}%`,
                height: '100%',
                background: `linear-gradient(90deg, #7C3AED, ${accColor(q.accuracy)})`,
                borderRadius: 4,
                transition: 'width 0.6s ease',
              }} />
            </div>
            <span style={{ width: 32, fontSize: 12, fontWeight: 700, color: accColor(q.accuracy), textAlign: 'right' }}>{q.accuracy}%</span>
          </div>
        ))}
      </div>

      {/* Participation */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.5)',
        borderRadius: 10,
        padding: 16,
        border: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t('Participation')}
        </div>
        {[
          { label: 'Solo Only', value: cls.participation?.soloOnly || 0, color: '#7C3AED', icon: 'person' },
          { label: 'Both', value: cls.participation?.playedBoth || 0, color: '#3B82F6', icon: 'group' },
          { label: 'Live Only', value: cls.participation?.liveOnly || 0, color: '#10B981', icon: 'groups' },
          { label: 'Inactive', value: cls.participation?.playedNeither || 0, color: '#6B7280', icon: 'person_off' },
        ].map(p => (
          <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: p.color }}>{p.icon}</span>
            <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{p.label}</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: p.color }} className="animated-stat-value">{p.value}</span>
          </div>
        ))}
      </div>

      {/* Dormant Students */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.5)',
        borderRadius: 10,
        padding: 16,
        border: '1px solid rgba(249, 115, 22, 0.1)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
          {t('Dormant Students')}
        </div>
        {dormant.length === 0 ? (
          <span style={{ color: '#10B981', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
            {t('All students active')}
          </span>
        ) : dormant.map(s => (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
            padding: '6px 8px', borderRadius: 6, background: 'rgba(249, 115, 22, 0.05)',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(249, 115, 22, 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#F59E0B',
            }}>
              {(s.name || '?').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{s.name}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                {s.lastPlayedDate
                  ? `Last active ${Math.round((Date.now() - new Date(s.lastPlayedDate)) / 86400000)}d ago`
                  : 'Never played'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ClassAnalytics() {
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [expandedClass, setExpandedClass] = useState(null);

  const fetchData = useCallback(async (f = filters) => {
    setLoading(true);
    try {
      const result = await adminAPI.getClassAnalytics(f);
      setData(result);
    } catch (err) {
      console.error('Failed to load class analytics:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, []);

  const handleFilterChange = (f) => {
    setFilters(f);
    fetchData(f);
  };

  const toggleExpand = (key) => {
    setExpandedClass(prev => prev === key ? null : key);
  };

  if (loading && !data) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
        <span className="material-symbols-outlined animate-spin" style={{ fontSize: 28 }}>progress_activity</span>
        <div style={{ marginTop: 8, fontSize: 13 }}>{t('Loading class analytics...')}</div>
      </div>
    );
  }

  const classes = data?.classes || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filter Bar */}
      <AnalyticsFilterBar onChange={handleFilterChange} />

      {/* Summary Table */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.4)',
        borderRadius: 12,
        border: '1px solid rgba(255, 255, 255, 0.05)',
        overflow: 'hidden',
      }}>
        <table className="class-analytics-table">
          <thead>
            <tr>
              <th>{t('Class')}</th>
              <th>{t('University')}</th>
              <th style={{ textAlign: 'center' }}>{t('Students')}</th>
              <th>{t('Avg Accuracy')}</th>
              <th>{t('Knowledge')}</th>
              <th>{t('Solo / Live')}</th>
              <th style={{ width: 30 }} />
            </tr>
          </thead>
          <tbody>
            {classes.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'rgba(255,255,255,0.3)' }}>
                  {t('No classes found')}
                </td>
              </tr>
            ) : classes.map(cls => {
              const key = `${cls.university || ''}::${cls.classSection || ''}`;
              const isExpanded = expandedClass === key;
              return (
                <React.Fragment key={key}>
                  <tr onClick={() => toggleExpand(key)} style={isExpanded ? { background: 'rgba(124, 58, 237, 0.06)' } : {}}>
                    <td style={{ fontWeight: 700 }}>
                      {cls.classSection || <span style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>Unassigned</span>}
                    </td>
                    <td>
                      {cls.university || <span style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{cls.studentCount}</td>
                    <td><AccuracyBar value={cls.avgAccuracy} /></td>
                    <td><KnowledgeBadge score={cls.knowledgeScore} level={cls.knowledgeLevel} /></td>
                    <td>
                      <SplitBar
                        solo={cls.participation?.soloOnly || 0}
                        live={cls.participation?.liveOnly || 0}
                        both={cls.participation?.playedBoth || 0}
                      />
                    </td>
                    <td>
                      <span className="material-symbols-outlined" style={{
                        fontSize: 18,
                        color: 'rgba(255,255,255,0.3)',
                        transition: 'transform 0.2s',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                      }}>expand_more</span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} style={{ padding: 0 }}>
                        <ExpandedClassDetails cls={cls} data={data} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
