import { useState, useEffect } from 'react';
import { scoreAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar';

export default function Leaderboard() {
  const { user } = useAuth();
  const [data, setData] = useState({ leaderboard: [], userRank: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    scoreAPI.getLeaderboard().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center font-display text-primary">Loading the Arena...</div>;

  const top3 = data.leaderboard.slice(0, 3);
  const rest = data.leaderboard.slice(3);

  // Find user's stats
  const userEntry = data.leaderboard.find(entry => entry.id === user?.id) || {};
  const userXp = userEntry.xp || user?.xp || 0;

  // Find next target (person directly above user)
  const targetEntry = data.userRank > 1 ? data.leaderboard[data.userRank - 2] : null;
  const xpToTarget = targetEntry ? (targetEntry.xp - userXp) : 0;

  return (
    <div className="bg-surface-container-lowest text-on-surface font-body antialiased min-h-screen flex flex-col">
      <Navbar />

      <div className="flex-1 flex flex-col md:flex-row max-w-[1600px] mx-auto w-full" style={{ marginTop: '100px' }}>
        {/* Main Canvas */}
        <main className="flex-1 p-6 pt-6 md:p-12 lg:pl-16 lg:pr-12 xl:pr-16 flex flex-col gap-12 overflow-y-auto">
          {/* Header Section */}
          <header className="flex flex-col items-center text-center gap-2">
            <h1 className="text-5xl md:text-6xl font-display font-bold tracking-widest text-[#00daf3] uppercase drop-shadow-md">THE ARENA</h1>
            <p className="text-on-surface-variant font-body text-lg tracking-wide">Global rankings. Prove your clinical mastery.</p>

            {/* Filter Tabs */}
            <div className="mt-8 flex gap-8 font-headline text-sm tracking-wider uppercase">
              <button className="text-primary border-b-2 border-primary pb-2 font-bold box-glow-primary relative">
                ALL TIME
                <div className="absolute -bottom-[2px] left-0 w-full h-[2px] bg-primary blur-[2px]"></div>
              </button>
            </div>
          </header>

          {/* Podium */}
          {top3.length >= 3 && (
            <section className="flex flex-row justify-center items-end gap-2 md:gap-6 h-60 md:h-80 mt-12 md:mt-4 mb-8 px-2 md:px-0">
              {/* Rank 2 (Left) */}
              <div className="bg-surface-variant/50 backdrop-blur-md border border-outline-variant/30 shadow-sm rounded-xl p-2 md:p-6 flex flex-col items-center flex-1 max-w-[120px] md:max-w-none md:w-48 relative order-1 h-36 md:h-64 justify-end">
                <div className="absolute -top-8 md:-top-12">
                  <div className="relative rounded-full p-[2px] md:p-[3px] bg-gradient-to-b from-[#C0C0C0] to-[#C0C0C0]/20 shadow-[0_0_15px_rgba(192,192,192,0.1)] overflow-hidden flex items-center justify-center">
                    <div className="rounded-full border border-surface-container-low overflow-hidden w-12 h-12 md:w-20 md:h-20 bg-surface-container">
                      <Avatar config={top3[1]?.avatar_config} size="100%" showBg={true} />
                    </div>
                  </div>
                </div>
                <span className="font-headline font-bold text-[#C0C0C0] text-[10px] md:text-sm tracking-widest mt-2 md:mt-6">RANK 2</span>
                <h3 className="font-display font-bold text-on-surface mt-1 md:mt-2 text-center text-xs md:text-lg truncate w-full">{top3[1]?.name}</h3>
                <div className="font-mono text-primary mt-0.5 md:mt-1 text-[10px] md:text-sm">{top3[1]?.xp?.toLocaleString()} XP</div>
              </div>

              {/* Rank 1 (Center) */}
              <div className="bg-surface-variant/50 backdrop-blur-md rounded-xl p-2 md:p-6 flex flex-col items-center w-[35%] max-w-[140px] md:max-w-none md:w-56 relative order-2 h-44 md:h-full justify-end border border-outline-variant/30 border-t-[#FFD700]/50 shadow-[0_-10px_30px_rgba(255,215,0,0.1)]">
                <div className="absolute -top-10 md:-top-16">
                  <div className="relative rounded-full p-[3px] md:p-[4px] bg-gradient-to-b from-[#FFD700] to-[#FFD700]/20 shadow-[0_0_20px_rgba(255,215,0,0.15)] overflow-hidden flex items-center justify-center">
                    <div className="rounded-full border-2 md:border-4 border-surface-container-lowest overflow-hidden w-16 h-16 md:w-24 md:h-24 bg-surface-container">
                      <Avatar config={top3[0]?.avatar_config} size="100%" showBg={true} />
                    </div>
                  </div>
                  <div className="absolute -bottom-1 -right-1 md:-bottom-2 md:-right-2 bg-[#FFD700] text-surface-container-lowest w-5 h-5 md:w-8 md:h-8 rounded-full flex items-center justify-center font-display font-black text-xs md:text-sm z-10 shadow-lg">1</div>
                </div>
                <span className="font-headline font-bold text-[#FFD700] text-[10px] md:text-sm tracking-widest mt-4 md:mt-8">RANK 1</span>
                <h3 className="font-display font-bold text-on-surface mt-1 md:mt-2 text-center text-sm md:text-xl truncate w-full">{top3[0]?.name}</h3>
                <div className="font-mono text-primary mt-1 md:mt-2 text-xs md:text-base font-bold drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]">{top3[0]?.xp?.toLocaleString()} XP</div>
              </div>

              {/* Rank 3 (Right) */}
              <div className="bg-surface-variant/50 backdrop-blur-md border border-outline-variant/30 shadow-sm rounded-xl p-2 md:p-6 flex flex-col items-center flex-1 max-w-[120px] md:max-w-none md:w-48 relative order-3 h-32 md:h-56 justify-end">
                <div className="absolute -top-6 md:-top-10">
                  <div className="relative rounded-full p-[2px] bg-gradient-to-b from-[#CD7F32] to-[#CD7F32]/20 shadow-[0_0_15px_rgba(205,127,50,0.1)] overflow-hidden flex items-center justify-center">
                    <div className="rounded-full border border-surface-container-low overflow-hidden w-10 h-10 md:w-16 md:h-16 bg-surface-container">
                      <Avatar config={top3[2]?.avatar_config} size="100%" showBg={true} />
                    </div>
                  </div>
                </div>
                <span className="font-headline font-bold text-[#CD7F32] text-[10px] md:text-sm tracking-widest mt-2 md:mt-4">RANK 3</span>
                <h3 className="font-display font-bold text-on-surface mt-1 md:mt-2 text-center text-xs md:text-lg truncate w-full">{top3[2]?.name}</h3>
                <div className="font-mono text-primary mt-0.5 md:mt-1 text-[10px] md:text-sm">{top3[2]?.xp?.toLocaleString()} XP</div>
              </div>
            </section>
          )}

          {/* Rankings Table */}
          <div className="bg-surface-container-low rounded-lg overflow-hidden flex flex-col">
            {/* Desktop header */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 border-b border-outline-variant/15 font-headline text-xs text-on-surface-variant font-bold tracking-wider uppercase bg-surface-container">
              <div className="col-span-1 text-center">RANK</div>
              <div className="col-span-4">PLAYER</div>
              <div className="col-span-1 text-center">LEVEL</div>
              <div className="col-span-2 text-center">QUIZZES</div>
              <div className="col-span-2 text-center">AVG SCORE</div>
              <div className="col-span-2 text-right">TOTAL XP</div>
            </div>

            <div className="flex flex-col">
              {rest.map((entry, index) => {
                const isMe = entry.id === user?.id;
                return (
                  <div key={entry.id} className={`
                    ${isMe
                      ? 'bg-primary/5 border border-primary/30 relative rounded-DEFAULT mx-2 my-1 shadow-[0_0_15px_rgba(0,229,255,0.2)] z-10'
                      : 'hover:bg-white/5 border-b border-outline-variant/5'
                    }
                  `}>
                    {isMe && <div className="absolute top-0 left-0 w-1 h-full bg-primary hidden md:block"></div>}

                    {/* Desktop grid row */}
                    <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 items-center">
                      <div className={`col-span-1 font-mono text-center ${isMe ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
                        {entry.rank < 10 ? `0${entry.rank}` : entry.rank}
                      </div>
                      <div className="col-span-4 flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-surface-container ${isMe ? 'border border-primary' : ''}`}>
                          <Avatar config={entry.avatar_config} size={32} showBg={false} />
                        </div>
                        <span className={`font-display text-sm truncate ${isMe ? 'font-bold text-on-surface' : 'font-semibold text-on-surface'}`}>
                          {entry.name}
                        </span>
                        {isMe && <span className="bg-secondary-container text-on-secondary-container text-[10px] px-2 py-0.5 rounded-sm font-headline tracking-wider shrink-0">YOU</span>}
                      </div>
                      <div className={`col-span-1 font-mono text-center text-sm ${isMe ? 'text-primary font-medium' : 'text-on-surface-variant'}`}>
                        {entry.level || 1}
                      </div>
                      <div className={`col-span-2 font-mono text-center text-sm ${isMe ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                        {entry.quizzes_taken || 0}
                      </div>
                      <div className={`col-span-2 font-mono text-center text-sm ${isMe ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                        {entry.avg_score ? `${Math.round(entry.avg_score)}%` : '0%'}
                      </div>
                      <div className={`col-span-2 font-mono text-right text-sm ${isMe ? 'text-primary font-bold drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]' : 'text-primary'}`}>
                        {entry.xp?.toLocaleString()}
                      </div>
                    </div>

                    {/* Mobile card row */}
                    <div className="md:hidden flex items-center gap-3 px-4 py-4">
                      <div className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-mono text-sm font-bold ${isMe ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                        {entry.rank < 10 ? `0${entry.rank}` : entry.rank}
                      </div>
                      <div className={`w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-surface-container ${isMe ? 'border-2 border-primary' : ''}`}>
                        <Avatar config={entry.avatar_config} size={36} showBg={false} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-display text-sm truncate ${isMe ? 'font-bold text-on-surface' : 'font-semibold text-on-surface'}`}>
                            {entry.name}
                          </span>
                          {isMe && <span className="bg-secondary-container text-on-secondary-container text-[10px] px-2 py-0.5 rounded-sm font-headline tracking-wider shrink-0">YOU</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-on-surface-variant">Lv.{entry.level || 1}</span>
                          <span className="text-xs text-on-surface-variant">{entry.quizzes_taken || 0} quizzes</span>
                          <span className="text-xs text-on-surface-variant">{entry.avg_score ? `${Math.round(entry.avg_score)}%` : '0%'}</span>
                        </div>
                      </div>
                      <div className={`font-mono text-sm font-bold text-right shrink-0 ${isMe ? 'text-primary drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]' : 'text-primary'}`}>
                        {entry.xp?.toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
              {rest.length === 0 && top3.length < 3 && (
                <div className="p-8 text-center text-on-surface-variant">No rankings available yet. Play quizzes to appear here!</div>
              )}
            </div>
          </div>
        </main>

        {/* Right Sidebar */}
        <aside className="w-full md:w-[380px] lg:w-[420px] bg-surface-container-low p-6 md:p-8 flex flex-col gap-8 border-t md:border-t-0 md:border-l border-outline-variant/15 overflow-y-auto">
          {/* Your Status Card */}
          <div className="bg-surface-variant/50 backdrop-blur-md p-6 rounded-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
            <h2 className="font-headline text-xs font-bold text-on-surface-variant tracking-widest uppercase mb-4">YOUR STATUS</h2>
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="text-4xl font-display font-black text-on-surface">#{data.userRank < 10 && data.userRank > 0 ? `0${data.userRank}` : (data.userRank || '--')}</div>
                <div className="text-sm font-body text-on-surface-variant mt-1">Global Rank</div>
              </div>
              {data.userRank > 0 && (
                <div className="bg-[#2ae500]/10 border border-[#2ae500]/30 px-3 py-1.5 rounded-DEFAULT flex items-center gap-1 shadow-[0_0_10px_rgba(42,229,0,0.1)]">
                  <span className="material-symbols-outlined text-[#2ae500] text-sm font-bold">military_tech</span>
                  <span className="font-mono text-[#2ae500] font-bold text-sm">ACTIVE</span>
                </div>
              )}
            </div>
            <div className="h-1.5 w-full bg-surface-container-lowest rounded-full overflow-hidden mb-2">
              <div className="h-full bg-gradient-to-r from-primary to-[#00daf3] rounded-full shadow-[0_0_8px_rgba(0,229,255,0.6)]" style={{ width: `${Math.min(100, Math.max(10, (userXp / ((userXp + xpToTarget) || 1)) * 100))}%` }}></div>
            </div>
            <div className="flex justify-between font-mono text-[10px] text-on-surface-variant uppercase">
              <span>{userXp.toLocaleString()} XP</span>
              <span>{targetEntry ? `${xpToTarget.toLocaleString()} XP TO RANK ${targetEntry.rank}` : 'TOP RANK!'}</span>
            </div>
          </div>

          {/* Target Card */}
          {targetEntry && (
            <div className="bg-surface-container p-6 rounded-lg border border-outline-variant/20">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-headline text-xs font-bold text-error tracking-widest uppercase flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">my_location</span> TARGET ACQUIRED
                </h2>
                <span className="font-mono text-[10px] text-on-surface-variant border border-outline-variant/30 px-2 py-0.5 rounded-sm">RANK {targetEntry.rank < 10 ? `0${targetEntry.rank}` : targetEntry.rank}</span>
              </div>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full border border-surface-bright overflow-hidden flex items-center justify-center bg-surface-container-lowest">
                  <Avatar config={targetEntry.avatar_config} size={48} showBg={false} />
                </div>
                <div className="truncate flex-1">
                  <div className="font-display font-bold text-on-surface truncate">{targetEntry.name}</div>
                  <div className="font-mono text-xs text-on-surface-variant mt-0.5">{targetEntry.xp?.toLocaleString()} XP</div>
                </div>
              </div>
              <button className="w-full bg-gradient-to-r from-error/20 to-error-container/20 hover:from-error/30 hover:to-error-container/30 border border-error/50 text-error font-headline font-bold text-sm tracking-wider py-3 rounded-DEFAULT transition-all active:scale-95 flex justify-center items-center gap-2 uppercase">
                <span className="material-symbols-outlined text-[18px]">swords</span>
                CHALLENGE TO DUEL
              </button>
            </div>
          )}

          {/* Rare Achievements */}
          <div>
            <h2 className="font-headline text-xs font-bold text-on-surface-variant tracking-widest uppercase mb-4 pl-1">RARE ACHIEVEMENTS</h2>
            <div className="grid grid-cols-4 gap-3">
              <div className="aspect-square bg-surface-container-highest rounded-lg border border-outline-variant/10 flex items-center justify-center group relative cursor-pointer hover:border-primary/50 transition-colors shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                <span className="material-symbols-outlined text-3xl text-primary opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all drop-shadow-[0_0_5px_rgba(0,229,255,0.5)]">military_tech</span>
              </div>
              <div className="aspect-square bg-surface-container-highest rounded-lg border border-outline-variant/10 flex items-center justify-center group relative cursor-pointer hover:border-[#ddb7ff]/50 transition-colors shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                <span className="material-symbols-outlined text-3xl text-[#ddb7ff] opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all drop-shadow-[0_0_5px_rgba(221,183,255,0.5)]">hub</span>
              </div>
              <div className="aspect-square bg-surface-container-highest rounded-lg border border-outline-variant/10 flex items-center justify-center group relative cursor-pointer hover:border-[#baffa2]/50 transition-colors shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                <span className="material-symbols-outlined text-3xl text-[#baffa2] opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all drop-shadow-[0_0_5px_rgba(186,255,162,0.5)]">vital_signs</span>
              </div>
              <div className="aspect-square bg-surface-container-lowest rounded-lg border border-outline-variant/5 flex items-center justify-center border-dashed">
                <span className="material-symbols-outlined text-2xl text-on-surface-variant/30">lock</span>
              </div>
            </div>
          </div>

          {/* Statistics */}
          <div>
            <h2 className="font-headline text-xs font-bold text-on-surface-variant tracking-widest uppercase mb-4 pl-1">STATISTICS</h2>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center py-2 border-b border-outline-variant/10">
                <span className="font-body text-sm text-on-surface-variant">Win Rate</span>
                <span className="font-mono text-sm text-on-surface font-medium">{userEntry.avg_score ? `${Math.round(userEntry.avg_score)}%` : '--'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-outline-variant/10">
                <span className="font-body text-sm text-on-surface-variant">Longest Streak</span>
                <span className="font-mono text-sm text-on-surface font-medium">{userEntry.best_streak || 0} DAYS</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-outline-variant/10">
                <span className="font-body text-sm text-on-surface-variant">Top Category</span>
                <span className="font-mono text-sm text-primary font-medium">GENERAL</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
