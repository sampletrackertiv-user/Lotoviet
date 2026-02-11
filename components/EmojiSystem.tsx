import React, { useEffect, useState, useRef } from 'react';
import { database } from '../services/firebase';
import { ref, push, onChildAdded, remove } from "firebase/database";
import { Heart, Laugh, PartyPopper, Octagon, Flame } from 'lucide-react';

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
  left: number; // percentage
  duration: number; // seconds
}

export const EmojiSystem: React.FC<EmojiSystemProps> = ({ roomCode, senderName }) => {
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  
  // Listen for incoming reactions
  useEffect(() => {
    if (!roomCode) return;
    const reactionsRef = ref(database, `rooms/${roomCode}/reactions`);
    
    // Listen to last item only to prevent flooding on load, but in a simple app child_added is fine.
    // We filter by timestamp to avoid loading old reactions if we wanted to be strict.
    const unsubscribe = onChildAdded(reactionsRef, (snapshot) => {
       const val = snapshot.val();
       if (!val || Date.now() - val.timestamp > 5000) return; // Ignore old (older than 5s)

       // Add to floating list
       const emojiDef = EMOJIS.find(e => e.id === val.type);
       if (emojiDef) {
           addFloatingEmoji(emojiDef.icon);
       }

       // Cleanup firebase immediately to keep DB clean (optional, but good for simple logic)
       // In a real app, maybe use a cloud function or TTL. Here we just let it grow or ignore.
       // actually, let's NOT remove, just ignore old ones by timestamp.
    });

    return () => unsubscribe();
  }, [roomCode]);

  const addFloatingEmoji = (icon: string) => {
      const id = Math.random().toString(36).substr(2, 9);
      const left = Math.floor(Math.random() * 80) + 10; // 10% to 90%
      const duration = 2 + Math.random() * 2; // 2-4s
      
      setFloatingEmojis(prev => [...prev, { id, icon, left, duration }]);

      // Auto remove from DOM after animation
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
      
      // Also show locally immediately for responsiveness
      const emojiDef = EMOJIS.find(e => e.id === type);
      if(emojiDef) addFloatingEmoji(emojiDef.icon);
  };

  return (
    <>
        {/* Render Floating Emojis Layer (Pointer events none to let clicks pass through) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-[60]">
            {floatingEmojis.map(e => (
                <div 
                    key={e.id}
                    className="absolute bottom-0 text-4xl animate-float-up opacity-0"
                    style={{
                        left: `${e.left}%`,
                        animationDuration: `${e.duration}s`,
                        // inline style for animation keyframes is tricky in React, using Tailwind class + custom style
                        // We rely on global CSS or standard animate-pulse/bounce if specific keyframes aren't available.
                        // Let's assume we add a custom keyframe to index.html or use transform.
                        animationName: 'floatUp',
                        animationTimingFunction: 'ease-out'
                    }}
                >
                    {e.icon}
                </div>
            ))}
        </div>

        {/* Reaction Bar */}
        <div className="absolute bottom-20 right-4 md:bottom-8 md:right-8 flex flex-col gap-2 z-[70]">
             {EMOJIS.map(e => (
                 <button
                    key={e.id}
                    onClick={() => sendReaction(e.id)}
                    className="w-10 h-10 md:w-12 md:h-12 bg-white/90 backdrop-blur rounded-full shadow-lg border border-red-100 flex items-center justify-center text-xl md:text-2xl hover:scale-110 active:scale-90 transition-transform cursor-pointer hover:bg-white"
                    title={e.label}
                 >
                     {e.icon}
                 </button>
             ))}
        </div>
        
        <style>{`
            @keyframes floatUp {
                0% { transform: translateY(0) scale(0.5); opacity: 0; }
                10% { opacity: 1; }
                100% { transform: translateY(-80vh) scale(1.5); opacity: 0; }
            }
        `}</style>
    </>
  );
};