import React, { useEffect, useState } from 'react';
import { database } from '../services/firebase';
import { ref, push, onChildAdded } from "firebase/database";
import { SmilePlus, Trophy, ChevronDown, ChevronUp } from 'lucide-react';

interface EmojiSystemProps {
  roomCode: string;
  senderName: string;
}

// Emoji types configuration
const EMOJIS = [
  { id: 'heart', icon: '❤️', label: 'Yêu' },
  { id: 'haha', icon: '😂', label: 'Haha' },
  { id: 'wow', icon: '😮', label: 'Wow' },
  { id: 'tomato', icon: '🍅', label: 'Cà chua' },
  { id: 'fire', icon: '🔥', label: 'Cháy' },
];

interface FloatingEmoji {
  id: string;
  icon: string;
  sender: string;
  left: number; // percentage
  duration: number; // seconds
}

interface ReactionData {
  type: string;
  sender: string;
  timestamp: number;
}

export const EmojiSystem: React.FC<EmojiSystemProps> = ({ roomCode, senderName }) => {
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRaceExpanded, setIsRaceExpanded] = useState(false); // Default collapsed to save space
  
  // Listen for incoming reactions
  useEffect(() => {
    if (!roomCode) return;
    const reactionsRef = ref(database, `rooms/${roomCode}/reactions`);
    
    const unsubscribe = onChildAdded(reactionsRef, (snapshot) => {
       const val = snapshot.val() as ReactionData | null;
       if (!val) return;

       // Update Counts (Accumulate all valid reactions in session)
       setCounts(prev => ({
           ...prev,
           [val.type]: (prev[val.type] || 0) + 1
       }));

       // Only animate recent ones
       if (Date.now() - val.timestamp < 5000) {
           const emojiDef = EMOJIS.find(e => e.id === val.type);
           if (emojiDef) {
               addFloatingEmoji(emojiDef.icon, val.sender);
           }
       }
    });

    return () => unsubscribe();
  }, [roomCode]);

  const addFloatingEmoji = (icon: string, sender: string) => {
      const id = Math.random().toString(36).substr(2, 9);
      const left = Math.floor(Math.random() * 80) + 10; 
      const duration = 4 + Math.random() * 2; // Slower for better readability
      
      setFloatingEmojis(prev => [...prev, { id, icon, sender, left, duration }]);

      setTimeout(() => {
          setFloatingEmojis(prev => prev.filter(e => e.id !== id));
      }, duration * 1000);
  };

  const sendReaction = (type: string) => {
      if (!roomCode) return;
      push(ref(database, `rooms/${roomCode}/reactions`), {
          type,
          sender: senderName,
          timestamp: Date.now()
      });
      setIsExpanded(false); 
  };

  // Sort Emojis for the Race Board
  const sortedEmojis = [...EMOJIS].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
  const maxCount = Math.max(...(Object.values(counts) as number[]), 1);
  const leader = sortedEmojis[0];
  const leaderCount = counts[leader.id] || 0;

  return (
    <>
        {/* LAYER 40: Floating Emojis - FOREGROUND LAYER (Click-through) */}
        {/* Kept at z-40 so they are visible over cards, but pointer-events-none prevents blocking clicks */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
            {floatingEmojis.map(e => (
                <div 
                    key={e.id}
                    className="absolute bottom-0 flex flex-col items-center animate-float-up opacity-0 will-change-transform"
                    style={{
                        left: `${e.left}%`,
                        animationDuration: `${e.duration}s`,
                        animationName: 'floatUp',
                        animationTimingFunction: 'ease-out'
                    }}
                >
                    <span className="text-4xl md:text-5xl drop-shadow-md filter opacity-90">{e.icon}</span>
                    <span className="text-[10px] font-bold text-slate-700 bg-white/80 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap mt-1 border border-white/50">
                        {e.sender}
                    </span>
                </div>
            ))}
        </div>

        {/* LAYER 50: Controls & Race - UI LAYER (Interactive) */}
        
        {/* Reaction Race Board (Top Left - Collapsible) */}
        <div className="absolute top-16 left-4 z-50 flex flex-col items-start gap-2 pointer-events-auto">
            {/* Toggle Button / Header */}
            <button 
                onClick={() => setIsRaceExpanded(!isRaceExpanded)}
                className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-200 shadow-md flex items-center gap-2 transition-all active:scale-95 hover:bg-white"
            >
                <Trophy size={14} className="text-yellow-500" />
                
                {/* Minimized View: Show Leader */}
                {!isRaceExpanded && leaderCount > 0 ? (
                     <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                         <span>{leader.icon}</span>
                         <span className="text-[10px] bg-slate-100 px-1.5 rounded-md">{leaderCount}</span>
                     </div>
                ) : (
                    !isRaceExpanded && <span className="text-[10px] font-bold text-slate-500 uppercase">Rank</span>
                )}

                {/* Arrow */}
                {isRaceExpanded ? <ChevronUp size={14} className="text-slate-400"/> : <ChevronDown size={14} className="text-slate-400"/>}
            </button>

            {/* Expanded List */}
            {isRaceExpanded && (
                <div className="bg-white/90 backdrop-blur-md p-2 rounded-xl border border-slate-200 shadow-lg w-32 animate-in fade-in slide-in-from-top-2 origin-top-left">
                    <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-100">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Đua Cảm Xúc</span>
                    </div>
                    <div className="flex flex-col gap-1.5 relative">
                        {sortedEmojis.map((e, index) => {
                            const count = counts[e.id] || 0;
                            const percent = (count / maxCount) * 100;
                            return (
                                <div key={e.id} className="flex items-center gap-2 relative h-6 transition-all duration-500">
                                    <span className="text-sm z-10 w-5 shrink-0 text-center">{e.icon}</span>
                                    
                                    {/* Progress Bar Track */}
                                    <div className="flex-1 h-full relative rounded-md overflow-hidden bg-slate-100/50">
                                        <div 
                                            className={`absolute top-0 left-0 bottom-0 transition-all duration-500 rounded-md opacity-80 ${index === 0 ? 'bg-gradient-to-r from-yellow-300 to-yellow-500' : 'bg-slate-200'}`}
                                            style={{ width: `${percent}%` }}
                                        ></div>
                                        <span className={`absolute inset-0 flex items-center px-1.5 text-[10px] font-bold ${index === 0 ? 'text-yellow-900' : 'text-slate-500'}`}>
                                            {count}
                                        </span>
                                    </div>
                                    {index === 0 && count > 0 && <span className="absolute -right-1 -top-1 text-[10px] animate-bounce">👑</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>

        {/* Reaction Controls (Bottom Right) */}
        <div className="absolute bottom-24 right-4 md:bottom-8 md:right-8 z-50 flex flex-col items-end gap-2 pointer-events-auto">
             <div className={`flex flex-col gap-2 transition-all duration-300 origin-bottom ${isExpanded ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none h-0'}`}>
                {EMOJIS.map(e => (
                    <button
                        key={e.id}
                        onClick={() => sendReaction(e.id)}
                        className="w-10 h-10 bg-white/90 backdrop-blur rounded-full shadow-md border border-slate-200 flex items-center justify-center text-xl hover:scale-110 active:scale-95 transition-transform"
                    >
                        {e.icon}
                    </button>
                ))}
             </div>

             <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white transition-all duration-300 ${isExpanded ? 'bg-slate-800 rotate-45' : 'bg-gradient-to-br from-red-500 to-pink-600 hover:scale-110 rotate-0'}`}
             >
                <SmilePlus size={24} />
             </button>
        </div>
        
        <style>{`
            @keyframes floatUp {
                0% { transform: translateY(0) scale(0.8); opacity: 0; }
                10% { opacity: 1; }
                90% { opacity: 1; }
                100% { transform: translateY(-80vh) scale(1.1); opacity: 0; }
            }
        `}</style>
    </>
  );
};