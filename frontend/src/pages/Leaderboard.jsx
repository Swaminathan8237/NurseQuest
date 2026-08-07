import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { scoreAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar';

// SVG Sparkline Component matching reference design.
// `stretch` (mobile list rows) fills the row width via a viewBox so the trend spans the full
// line instead of a fixed 110px; the pulsing end dot is dropped there because the non-uniform
// horizontal scale would distort it into an ellipse.
const SPARK_DEFAULT = [30, 45, 35, 60, 55, 80, 95];
const Sparkline = ({ color = '#7C3AED', data = SPARK_DEFAULT, id = 'spark', stretch = false }) => {
  const width = 110;
  const height = 32;
  // An empty array is truthy, so `data || fallback` at call sites doesn't guard
  // it. A single point can't form a line either. Fall back here so a graph
  // always renders.
  if (!Array.isArray(data) || data.length < 2) data = SPARK_DEFAULT;
  const max = Math.max(...data);
  const min = Math.min(...data);

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / (max - min || 1)) * (height - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const lastX = width;
  const lastY = height - ((data[data.length - 1] - min) / (max - min || 1)) * (height - 8) - 4;

  const svgAttrs = stretch
    ? { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', className: 'w-full h-6 overflow-visible' }
    : { width, height, className: 'overflow-visible' };

  return (
    <svg {...svgAttrs}>
      <defs>
        <linearGradient id={`grad-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={`url(#grad-${id})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      {!stretch && <circle cx={lastX} cy={lastY} r="4" fill={color} className="animate-pulse" />}
    </svg>
  );
};

export default function Leaderboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ leaderboard: [], userRank: 0 });
  const [loading, setLoading] = useState(true);
  const [filterPeriod, setFilterPeriod] = useState('All Time');
  const [selectedUser, setSelectedUser] = useState(null);

  // Fetch the board for the active timeframe and keep it live. The full-screen spinner shows
  // only until the first response arrives; switching timeframe or the 30s background poll
  // refreshes the data in place without blanking the page.
  useEffect(() => {
    let cancelled = false;

    const fetchBoard = () => {
      scoreAPI.getLeaderboard({ period: filterPeriod })
        .then((res) => { if (!cancelled) setData(res); })
        .catch((err) => { if (!cancelled) console.error(err); })
        .finally(() => { if (!cancelled) setLoading(false); });
    };

    fetchBoard();
    const intervalId = setInterval(fetchBoard, 30000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [filterPeriod]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F19] flex items-center justify-center font-headline text-primary text-lg font-bold">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span>Loading Clinical Leaderboard...</span>
        </div>
      </div>
    );
  }

  const leaderboardList = data.leaderboard || [];
  const top3 = leaderboardList.slice(0, 3);
  const rest = leaderboardList.slice(3);

  // Headline score for an entry: the windowed XP earned for Today / This Week, else the
  // lifetime users.xp. The backend sends both as `rankScore` (falling back to `xp`).
  const scoreOf = (entry) => entry?.rankScore ?? entry?.xp ?? 0;
  // Honest sublabel for that number so a windowed sum is never mislabeled "Total XP".
  const scoreLabel = filterPeriod === 'All Time'
    ? 'Total XP'
    : (filterPeriod === 'Today' ? 'XP Today' : 'XP This Week');

  // User details
  const userEntry = leaderboardList.find(entry => entry.id === user?.id) || {};
  // Your headline number must reflect the ACTIVE metric. When you're on the board, use your
  // row's score. When you're not: All Time falls back to lifetime users.xp (which IS your
  // All-Time rank score), but a window falls back to 0 — showing lifetime XP under an
  // "XP Today"/"XP This Week" label would misreport it.
  const onBoard = Boolean(userEntry.id);
  const userXp = onBoard
    ? scoreOf(userEntry)
    : (filterPeriod === 'All Time' ? (user?.xp || 0) : 0);
  const userRank = data.userRank || userEntry.rank || 0;

  // Target entry (person directly above user)
  const targetEntry = userRank > 1 ? leaderboardList[userRank - 2] : null;
  const xpToTarget = targetEntry ? (scoreOf(targetEntry) - userXp) : 0;

  // Sparkline data presets for visual elegance
  const sparklinePresets = [
    [20, 35, 40, 65, 55, 85, 100],
    [30, 25, 50, 45, 70, 60, 92],
    [15, 40, 30, 55, 80, 75, 88],
    [25, 50, 45, 60, 70, 65, 80],
    [10, 20, 35, 50, 45, 60, 75]
  ];

  return (
    <div className="bg-[#f8fafc] dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 font-body min-h-screen flex flex-col antialiased">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-16" style={{ paddingTop: '108px' }}>
        
        {/* Header & Filter Selector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 dark:bg-primary/20 text-primary flex items-center justify-center shadow-md">
              <span className="material-symbols-outlined text-2xl font-black">trophy</span>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-headline font-black text-3xl sm:text-4xl text-slate-900 dark:text-white tracking-tight">
                  Leaderboard
                </h1>
                <span className="text-xl font-body font-medium text-slate-400 dark:text-slate-500">for</span>
                
                {/* Period Selector Pill */}
                <div className="relative inline-block">
                  <select 
                    value={filterPeriod}
                    onChange={(e) => setFilterPeriod(e.target.value)}
                    className="appearance-none bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 font-headline font-bold text-sm text-slate-800 dark:text-slate-200 px-4 py-2 pr-9 rounded-full shadow-sm hover:border-primary transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="Today">Today</option>
                    <option value="This Week">This Week</option>
                    <option value="All Time">All Time</option>
                  </select>
                  <span className="material-symbols-outlined text-sm text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    expand_more
                  </span>
                </div>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                Top clinical trainees ranked by quiz mastery, accuracy, and total XP
              </p>
            </div>
          </div>

          {/* User Quick Stats Pill Header */}
          <div className="flex items-center gap-3 bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 p-2.5 px-4 rounded-2xl shadow-sm self-start md:self-auto">
            <div className="w-10 h-10 rounded-full border-2 border-primary/50 overflow-hidden shrink-0">
              <Avatar config={user?.avatar_config} size={36} showBg={false} />
            </div>
            <div>
              <div className="text-xs font-headline font-bold text-slate-500 dark:text-slate-400">Your Rank</div>
              <div className="text-sm font-headline font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>#{userRank > 0 ? (userRank < 10 ? `0${userRank}` : userRank) : '--'}</span>
                <span className="text-xs font-bold text-primary">({userXp.toLocaleString()} XP)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid: Podiums (Left 2/3) + Sidebar (Right 1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Main Leaderboard Column */}
          <div className="lg:col-span-8 space-y-10">
            
            {/* Top 3 Winner Cards (Podium Cards matching reference image) */}
            {top3.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">

                {/* Winner 2 (Second Place) — order-2 on mobile so the champion shows first */}
                {top3[1] && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col justify-between relative overflow-hidden group order-2 sm:order-none">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />

                    <div>
                      {/* Top Row: Rank Tag & Avatar */}
                      <div className="flex justify-between items-start mb-3">
                        <span className="px-3 py-1 rounded-full text-[10px] font-headline font-black uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          Rank #02
                        </span>
                        <div className="relative">
                          <div className="w-16 h-16 rounded-full border-2 border-slate-300 dark:border-slate-700 shadow-md overflow-hidden bg-slate-100 dark:bg-slate-800 mx-auto">
                            <Avatar config={top3[1]?.avatar_config} size={60} showBg={false} />
                          </div>
                        </div>
                      </div>

                      {/* Name */}
                      <div className="text-center mt-2">
                        <h3 className="font-headline font-extrabold text-base text-slate-900 dark:text-white truncate">
                          {top3[1]?.name}
                        </h3>
                      </div>

                      {/* Sparkline Curve & Score */}
                      <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <Sparkline color="#06B6D4" data={top3[1]?.sparklineData || sparklinePresets[1]} id="rank2" />
                          <span className="text-[10px] font-bold text-slate-400">Progress Trend</span>
                        </div>
                        <div className="text-right">
                          <div className="font-headline font-black text-2xl text-slate-900 dark:text-white leading-tight">
                            {scoreOf(top3[1]).toLocaleString()}
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{scoreLabel}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex text-xs font-headline font-bold">
                      <button
                        onClick={() => setSelectedUser(top3[1])}
                        className="flex-1 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-center"
                      >
                        PROFILE
                      </button>
                    </div>
                  </div>
                )}

                {/* Winner 1 (First Place - Champion) — order-first on mobile, centered on desktop */}
                {top3[0] && (
                  <div className="bg-white dark:bg-slate-900 border-2 border-primary/40 dark:border-primary/60 rounded-3xl p-5 shadow-xl hover:shadow-2xl transition-all duration-300 flex flex-col justify-between relative overflow-hidden group order-first sm:order-none sm:-translate-y-2">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

                    <div>
                      {/* Top Row: Champion Badge & Avatar */}
                      <div className="flex justify-between items-start mb-3">
                        <span className="px-3 py-1 rounded-full text-[10px] font-headline font-black uppercase tracking-wider bg-amber-400/20 text-amber-600 dark:text-amber-300 border border-amber-400/40 flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">workspace_premium</span>
                          <span>Champion</span>
                        </span>
                        <div className="relative">
                          <div className="w-20 h-20 rounded-full border-4 border-amber-400 shadow-xl overflow-hidden bg-slate-100 dark:bg-slate-800 mx-auto">
                            <Avatar config={top3[0]?.avatar_config} size={76} showBg={false} />
                          </div>
                        </div>
                      </div>

                      {/* Name */}
                      <div className="text-center mt-2">
                        <h3 className="font-headline font-black text-lg text-slate-900 dark:text-white truncate">
                          {top3[0]?.name}
                        </h3>
                      </div>

                      {/* Sparkline Curve & Score */}
                      <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <Sparkline color="#7C3AED" data={top3[0]?.sparklineData || sparklinePresets[0]} id="rank1" />
                          <span className="text-[10px] font-bold text-slate-400">Progress Trend</span>
                        </div>
                        <div className="text-right">
                          <div className="font-headline font-black text-3xl text-primary leading-tight">
                            {scoreOf(top3[0]).toLocaleString()}
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{scoreLabel}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex text-xs font-headline font-bold">
                      <button
                        onClick={() => setSelectedUser(top3[0])}
                        className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-center"
                      >
                        PROFILE
                      </button>
                    </div>
                  </div>
                )}

                {/* Winner 3 (Third Place) — order-3 on mobile */}
                {top3[2] && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col justify-between relative overflow-hidden group order-3 sm:order-none">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

                    <div>
                      {/* Top Row: Rank Tag & Avatar */}
                      <div className="flex justify-between items-start mb-3">
                        <span className="px-3 py-1 rounded-full text-[10px] font-headline font-black uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          Rank #03
                        </span>
                        <div className="relative">
                          <div className="w-16 h-16 rounded-full border-2 border-amber-600/40 dark:border-amber-700 shadow-md overflow-hidden bg-slate-100 dark:bg-slate-800 mx-auto">
                            <Avatar config={top3[2]?.avatar_config} size={60} showBg={false} />
                          </div>
                        </div>
                      </div>

                      {/* Name */}
                      <div className="text-center mt-2">
                        <h3 className="font-headline font-extrabold text-base text-slate-900 dark:text-white truncate">
                          {top3[2]?.name}
                        </h3>
                      </div>

                      {/* Sparkline Curve & Score */}
                      <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <Sparkline color="#F59E0B" data={top3[2]?.sparklineData || sparklinePresets[2]} id="rank3" />
                          <span className="text-[10px] font-bold text-slate-400">Progress Trend</span>
                        </div>
                        <div className="text-right">
                          <div className="font-headline font-black text-2xl text-slate-900 dark:text-white leading-tight">
                            {scoreOf(top3[2]).toLocaleString()}
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{scoreLabel}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex text-xs font-headline font-bold">
                      <button
                        onClick={() => setSelectedUser(top3[2])}
                        className="flex-1 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-center"
                      >
                        PROFILE
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Other Scholars Section (Matching Reference List) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h2 className="font-headline font-black text-xl text-slate-900 dark:text-white tracking-tight">
                  Other Clinical Scholars
                </h2>
                <span className="text-xs font-headline font-bold text-slate-500">
                  {rest.length} Scholars Listed
                </span>
              </div>

              {/* Scholars List Table */}
              <div className="space-y-3">
                {rest.map((entry, idx) => {
                  const isMe = entry.id === user?.id;
                  const presetIdx = idx % sparklinePresets.length;
                  const sparkColor = isMe ? '#7C3AED' : (idx % 2 === 0 ? '#06B6D4' : '#EC4899');

                  return (
                    <div
                      key={entry.id}
                      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 p-4 rounded-2xl border transition-all duration-200 ${
                        isMe
                          ? 'bg-primary/5 dark:bg-primary/10 border-primary shadow-lg ring-2 ring-primary/20'
                          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md'
                      }`}
                    >
                      {/* Top row: rank, avatar & name — plus the XP on the right (mobile only,
                          so a phone shows the score beside the name and keeps the graph on its
                          own line below) */}
                      <div className="flex items-center justify-between gap-4 min-w-0 sm:justify-start sm:flex-1">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`w-8 h-8 rounded-xl font-headline font-black text-xs flex items-center justify-center shrink-0 ${
                              isMe ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                            }`}>
                              #{entry.rank < 10 ? `0${entry.rank}` : entry.rank}
                            </span>
                          </div>

                          <div className="relative shrink-0">
                            <div className={`w-11 h-11 rounded-full border-2 overflow-hidden bg-slate-100 dark:bg-slate-800 ${
                              isMe ? 'border-primary' : 'border-slate-200 dark:border-slate-700'
                            }`}>
                              <Avatar config={entry.avatar_config} size={44} showBg={false} />
                            </div>
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-headline font-extrabold text-sm text-slate-900 dark:text-white truncate">
                                {entry.name}
                              </span>
                              {isMe && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-headline font-black uppercase bg-primary text-white">
                                  YOU
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                              Level {entry.level ?? 1} · {entry.quizzes_taken || 0} quizzes taken
                            </p>
                          </div>
                        </div>

                        {/* XP — mobile position (top-right, beside the name) */}
                        <div className="text-right shrink-0 sm:hidden">
                          <div className="font-headline font-black text-lg text-slate-900 dark:text-white">
                            {scoreOf(entry).toLocaleString()}
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {scoreLabel}
                          </span>
                        </div>
                      </div>

                      {/* Sparkline zone: full-width trend line on its own row on mobile, or the
                          fixed 110px graph inline before the XP on desktop */}
                      <div className="flex items-center gap-6 pt-3 border-t border-slate-100 dark:border-slate-800 sm:pt-0 sm:border-t-0 sm:justify-end sm:shrink-0">
                        {/* Mobile: stretched full-width sparkline + label */}
                        <div className="flex-1 min-w-0 sm:hidden">
                          <Sparkline color={sparkColor} data={entry.sparklineData || sparklinePresets[presetIdx]} id={`list-m-${entry.id}`} stretch />
                          <span className="block text-[10px] font-bold text-slate-400 mt-1">Progress Trend</span>
                        </div>

                        {/* Desktop: fixed 110px sparkline */}
                        <div className="hidden sm:block">
                          <Sparkline color={sparkColor} data={entry.sparklineData || sparklinePresets[presetIdx]} id={`list-d-${entry.id}`} />
                        </div>

                        {/* XP — desktop position (right of the sparkline) */}
                        <div className="text-right hidden sm:block">
                          <div className="font-headline font-black text-lg text-slate-900 dark:text-white">
                            {scoreOf(entry).toLocaleString()}
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {scoreLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {rest.length === 0 && top3.length === 0 && (
                  <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-slate-500 font-headline font-bold">
                    No leaderboard scores logged yet. Start a quiz to claim Rank #1!
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar: Your Status & Target Acquired */}
          <aside className="lg:col-span-4 space-y-6">

            {/* Your Status Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-headline font-black text-xs text-slate-400 uppercase tracking-wider">
                  YOUR STATUS
                </h3>
                <span className="px-3 py-1 rounded-full text-[10px] font-headline font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">verified</span>
                  <span>ACTIVE</span>
                </span>
              </div>

              <div className="flex items-baseline gap-2 mb-4">
                <span className="font-headline font-black text-5xl text-slate-900 dark:text-white">
                  #{userRank > 0 ? (userRank < 10 ? `0${userRank}` : userRank) : '--'}
                </span>
                <span className="text-xs font-headline font-bold text-slate-500">Global Rank</span>
              </div>

              {/* Progress Bar to Next Rank */}
              <div className="space-y-2">
                <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary via-indigo-500 to-cyan-400 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, Math.max(12, (userXp / ((userXp + xpToTarget) || 1)) * 100))}%` }}
                  />
                </div>
                <div className="flex justify-between font-headline text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <span>{userXp.toLocaleString()} XP</span>
                  <span className="text-primary font-black">
                    {targetEntry ? `${xpToTarget.toLocaleString()} XP TO RANK ${targetEntry.rank}` : 'MAX RANK REACHED!'}
                  </span>
                </div>
              </div>
            </div>

            {/* NOTE: The "Target Acquired" duel card and the hardcoded "Rare Achievements"
                grid were removed. The former was Challenge UI (hidden for now); the latter
                showed identical fabricated badges for every user with no backing data. The
                Your Status card above shows the real rank and honest XP-to-next-rank progress. */}

          </aside>
        </div>
      </main>

      {/* User Profile Modal when clicking PROFILE */}
      {selectedUser && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setSelectedUser(null)} />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl z-10 animate-scaleUp">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full border-2 border-primary overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <Avatar config={selectedUser.avatar_config} size={56} showBg={false} />
                </div>
                <div>
                  <h3 className="font-headline font-black text-xl text-slate-900 dark:text-white">
                    {selectedUser.name}
                  </h3>
                  <span className="text-xs font-bold text-primary">Rank #{selectedUser.rank}</span>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="space-y-3 text-xs font-headline font-bold text-slate-600 dark:text-slate-300">
              <div className="flex justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <span>Total XP Earned</span>
                <span className="text-primary font-black">{selectedUser.xp?.toLocaleString()} XP</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <span>Level</span>
                <span>Level {selectedUser.level ?? 1}</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <span>Quizzes Completed</span>
                <span>{selectedUser.quizzes_taken || 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
