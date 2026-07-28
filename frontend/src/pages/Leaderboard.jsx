import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { scoreAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar';

// SVG Sparkline Component matching reference design
const Sparkline = ({ color = '#7C3AED', data = [30, 45, 35, 60, 55, 80, 95], id = 'spark' }) => {
  const width = 110;
  const height = 32;
  const max = Math.max(...data);
  const min = Math.min(...data);
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / (max - min || 1)) * (height - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const lastX = width;
  const lastY = height - ((data[data.length - 1] - min) / (max - min || 1)) * (height - 8) - 4;

  return (
    <svg width={width} height={height} className="overflow-visible">
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
      <circle cx={lastX} cy={lastY} r="4" fill={color} className="animate-pulse" />
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
  const [duelChallengeSent, setDuelChallengeSent] = useState(false);

  useEffect(() => {
    scoreAPI.getLeaderboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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

  // User details
  const userEntry = leaderboardList.find(entry => entry.id === user?.id) || {};
  const userXp = userEntry.xp || user?.xp || 0;
  const userRank = data.userRank || userEntry.rank || 0;

  // Target entry (person directly above user)
  const targetEntry = userRank > 1 ? leaderboardList[userRank - 2] : null;
  const xpToTarget = targetEntry ? (targetEntry.xp - userXp) : 0;

  const handleDuelClick = (targetName) => {
    setDuelChallengeSent(true);
    setTimeout(() => setDuelChallengeSent(false), 3000);
  };

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
                
                {/* Winner 2 (Second Place) */}
                {top3[1] && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col justify-between relative overflow-hidden group">
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
                          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
                        </div>
                      </div>

                      {/* Name & Badge */}
                      <div className="text-center mt-2">
                        <h3 className="font-headline font-extrabold text-base text-slate-900 dark:text-white truncate">
                          {top3[1]?.name}
                        </h3>
                        <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-headline font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                          ⚡ Clinical Specialist
                        </span>
                      </div>

                      {/* Sparkline Curve & Score */}
                      <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <Sparkline color="#06B6D4" data={top3[1]?.sparklineData || sparklinePresets[1]} id="rank2" />
                          <span className="text-[10px] font-bold text-slate-400">7-Day Trend</span>
                        </div>
                        <div className="text-right">
                          <div className="font-headline font-black text-2xl text-slate-900 dark:text-white leading-tight">
                            {top3[1]?.xp?.toLocaleString()}
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total XP</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between gap-2 text-xs font-headline font-bold">
                      <button 
                        onClick={() => setSelectedUser(top3[1])}
                        className="flex-1 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-center"
                      >
                        PROFILE
                      </button>
                      <button 
                        onClick={() => handleDuelClick(top3[1]?.name)}
                        className="flex-1 py-1.5 rounded-xl bg-primary/10 text-primary dark:bg-primary/20 hover:bg-primary hover:text-white transition-all text-center"
                      >
                        CHALLENGE
                      </button>
                    </div>
                  </div>
                )}

                {/* Winner 1 (First Place - Champion) */}
                {top3[0] && (
                  <div className="bg-white dark:bg-slate-900 border-2 border-primary/40 dark:border-primary/60 rounded-3xl p-5 shadow-xl hover:shadow-2xl transition-all duration-300 flex flex-col justify-between relative overflow-hidden group sm:-translate-y-2">
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
                          <span className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
                        </div>
                      </div>

                      {/* Name & Badge */}
                      <div className="text-center mt-2">
                        <h3 className="font-headline font-black text-lg text-slate-900 dark:text-white truncate">
                          {top3[0]?.name}
                        </h3>
                        <span className="inline-block mt-1 px-3 py-0.5 rounded-full text-[10px] font-headline font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-sm">
                          🔥 Top Quizzer!
                        </span>
                      </div>

                      {/* Sparkline Curve & Score */}
                      <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <Sparkline color="#7C3AED" data={top3[0]?.sparklineData || sparklinePresets[0]} id="rank1" />
                          <span className="text-[10px] font-bold text-slate-400">7-Day Trend</span>
                        </div>
                        <div className="text-right">
                          <div className="font-headline font-black text-3xl text-primary leading-tight">
                            {top3[0]?.xp?.toLocaleString()}
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total XP</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between gap-2 text-xs font-headline font-bold">
                      <button 
                        onClick={() => setSelectedUser(top3[0])}
                        className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-center"
                      >
                        PROFILE
                      </button>
                      <button 
                        onClick={() => handleDuelClick(top3[0]?.name)}
                        className="flex-1 py-2 rounded-xl bg-primary text-white hover:bg-primary-dark shadow-md transition-all text-center font-black"
                      >
                        CHALLENGE
                      </button>
                    </div>
                  </div>
                )}

                {/* Winner 3 (Third Place) */}
                {top3[2] && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col justify-between relative overflow-hidden group">
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
                          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
                        </div>
                      </div>

                      {/* Name & Badge */}
                      <div className="text-center mt-2">
                        <h3 className="font-headline font-extrabold text-base text-slate-900 dark:text-white truncate">
                          {top3[2]?.name}
                        </h3>
                        <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-headline font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          🏆 Clinical Star
                        </span>
                      </div>

                      {/* Sparkline Curve & Score */}
                      <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <Sparkline color="#F59E0B" data={top3[2]?.sparklineData || sparklinePresets[2]} id="rank3" />
                          <span className="text-[10px] font-bold text-slate-400">7-Day Trend</span>
                        </div>
                        <div className="text-right">
                          <div className="font-headline font-black text-2xl text-slate-900 dark:text-white leading-tight">
                            {top3[2]?.xp?.toLocaleString()}
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total XP</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between gap-2 text-xs font-headline font-bold">
                      <button 
                        onClick={() => setSelectedUser(top3[2])}
                        className="flex-1 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-center"
                      >
                        PROFILE
                      </button>
                      <button 
                        onClick={() => handleDuelClick(top3[2]?.name)}
                        className="flex-1 py-1.5 rounded-xl bg-primary/10 text-primary dark:bg-primary/20 hover:bg-primary hover:text-white transition-all text-center"
                      >
                        CHALLENGE
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
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border transition-all duration-200 gap-4 ${
                        isMe
                          ? 'bg-primary/5 dark:bg-primary/10 border-primary shadow-lg ring-2 ring-primary/20'
                          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md'
                      }`}
                    >
                      {/* Left: Rank, Avatar & Name */}
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`w-8 h-8 rounded-xl font-headline font-black text-xs flex items-center justify-center ${
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
                          <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
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
                            Unit {String((idx % 10) + 1).padStart(2, '0')} Clinical Training
                          </p>
                        </div>
                      </div>

                      {/* Right: Sparkline Graph & XP Score */}
                      <div className="flex items-center justify-between sm:justify-end gap-6 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                        <div className="hidden sm:block">
                          <Sparkline color={sparkColor} data={entry.sparklineData || sparklinePresets[presetIdx]} id={`list-${entry.id}`} />
                        </div>

                        <div className="text-right">
                          <div className="font-headline font-black text-lg text-slate-900 dark:text-white">
                            {entry.xp?.toLocaleString()}
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Closed Quizzes: {entry.quizzes_taken || 5}
                          </span>
                        </div>

                        <button
                          onClick={() => handleDuelClick(entry.name)}
                          className="p-2 rounded-xl text-slate-400 hover:text-primary hover:bg-primary/10 transition-all"
                          title="Challenge Scholar"
                        >
                          <span className="material-symbols-outlined text-xl">swords</span>
                        </button>
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
            
            {/* Duel Challenge Notification Banner */}
            {duelChallengeSent && (
              <div className="p-4 rounded-2xl bg-emerald-500 text-white font-headline font-bold text-xs flex items-center justify-between shadow-lg animate-bounce">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">swords</span>
                  <span>Clinical Duel Challenge Sent!</span>
                </div>
                <span className="material-symbols-outlined text-base">check_circle</span>
              </div>
            )}

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

            {/* Target Acquired Card */}
            {targetEntry && (
              <div className="bg-gradient-to-br from-rose-500/10 via-slate-900 to-purple-950 text-white rounded-3xl p-6 shadow-xl border border-rose-500/30 relative overflow-hidden">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-headline font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm animate-ping">my_location</span>
                    <span>TARGET ACQUIRED</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-headline font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    RANK #{targetEntry.rank < 10 ? `0${targetEntry.rank}` : targetEntry.rank}
                  </span>
                </div>

                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 rounded-full border-2 border-rose-400 overflow-hidden bg-slate-800 shrink-0">
                    <Avatar config={targetEntry.avatar_config} size={56} showBg={false} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-headline font-black text-lg truncate text-white">
                      {targetEntry.name}
                    </h4>
                    <p className="text-xs font-headline font-bold text-rose-300">
                      {targetEntry.xp?.toLocaleString()} XP Total
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleDuelClick(targetEntry.name)}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-headline font-black text-xs uppercase tracking-wider shadow-lg hover:shadow-rose-500/30 hover:scale-105 transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-base">swords</span>
                  <span>CHALLENGE TO DUEL</span>
                </button>
              </div>
            )}

            {/* Achievements Grid */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 shadow-xl">
              <h3 className="font-headline font-black text-xs text-slate-400 uppercase tracking-wider mb-4">
                RARE ACHIEVEMENTS
              </h3>
              <div className="grid grid-cols-4 gap-3">
                <div className="aspect-square rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 hover:scale-110 transition-transform cursor-pointer" title="Master Quizzer">
                  <span className="material-symbols-outlined text-2xl">military_tech</span>
                </div>
                <div className="aspect-square rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400 hover:scale-110 transition-transform cursor-pointer" title="Clinical Networker">
                  <span className="material-symbols-outlined text-2xl">hub</span>
                </div>
                <div className="aspect-square rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 hover:scale-110 transition-transform cursor-pointer" title="Vital Signs Expert">
                  <span className="material-symbols-outlined text-2xl">vital_signs</span>
                </div>
                <div className="aspect-square rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 hover:scale-110 transition-transform cursor-pointer" title="Streak Champion">
                  <span className="material-symbols-outlined text-2xl">local_fire_department</span>
                </div>
              </div>
            </div>

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
                <span>Quizzes Completed</span>
                <span>{selectedUser.quizzes_taken || 0} Units</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <span>Average Clinical Score</span>
                <span className="text-emerald-600 dark:text-emerald-400">{Math.round(selectedUser.avg_score || 85)}%</span>
              </div>
            </div>

            <button
              onClick={() => {
                handleDuelClick(selectedUser.name);
                setSelectedUser(null);
              }}
              className="w-full mt-5 py-3 rounded-2xl bg-primary text-white font-headline font-black text-xs uppercase tracking-wider shadow-md hover:bg-primary-dark transition-all"
            >
              Challenge {selectedUser.name} to Duel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
