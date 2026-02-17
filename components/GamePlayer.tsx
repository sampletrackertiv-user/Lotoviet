
import React, { useState, useEffect, useRef } from 'react';
import { TicketData, ChatMessage, PlayerInfo } from '../types';
import { TicketView } from './TicketView';
import { ChatOverlay } from './ChatOverlay';
import { Volume2, VolumeX, LogOut, MessageCircle, Grid3X3, Trophy, Crown, Star } from 'lucide-react';
import { database, listenToConnectionStatus } from '../services/firebase';
import { ref, set, onValue, push, onDisconnect, get, update } from "firebase/database";
import { EmojiSystem } from './EmojiSystem';

interface GamePlayerProps {
  onExit: () => void;
  lang: 'vi' | 'en';
}

const generateFullTicketSet = (): TicketData => {
  const TOTAL_ROWS = 15;
  const ticket: TicketData = Array(TOTAL_ROWS).fill(null).map(() => Array(9).fill({ value: null, marked: false }));
  const colRanges = Array.from({length: 9}, (_, i) => ({ min: i*10 + (i===0?1:0), max: i*10 + 9 + (i===8?1:0) }));
  for (let r = 0; r < TOTAL_ROWS; r++) {
    const cols = [0,1,2,3,4,5,6,7,8].sort(() => 0.5 - Math.random()).slice(0, 4);
    cols.forEach(c => {
      ticket[r][c] = { value: Math.floor(Math.random() * (colRanges[c].max - colRanges[c].min + 1)) + colRanges[c].min, marked: false };
    });
  }
  return ticket;
};

export const GamePlayer: React.FC<GamePlayerProps> = ({ onExit, lang }) => {
  const [roomCode, setRoomCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketData>(generateFullTicketSet());
  const [history, setHistory] = useState<number[]>([]);
  const [currentCall, setCurrentCall] = useState<number | null>(null);
  const [currentRhyme, setCurrentRhyme] = useState<string>('');
  const [muted, setMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<'TICKET' | 'CHAT'>('TICKET');
  const [winners, setWinners] = useState<PlayerInfo[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // TTS Control
  const ttsQueue = useRef<string[]>([]);
  const isSpeaking = useRef(false);
  const announcedWaiters = useRef<Set<string>>(new Set());
  const announcedWinners = useRef<Set<string>>(new Set());
  const lastRhymeRef = useRef<string>('');

  const processTTSQueue = () => {
    if (isSpeaking.current || ttsQueue.current.length === 0 || muted || !window.speechSynthesis) return;
    
    const text = ttsQueue.current.shift();
    if (!text) return;

    isSpeaking.current = true;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    utterance.rate = 1.1; // Hơi nhanh một chút cho sôi nổi
    
    utterance.onend = () => {
      isSpeaking.current = false;
      setTimeout(processTTSQueue, 300);
    };
    
    utterance.onerror = () => {
      isSpeaking.current = false;
      processTTSQueue();
    };

    window.speechSynthesis.speak(utterance);
  };

  const queueSpeech = (text: string) => {
    if (muted) return;
    ttsQueue.current.push(text);
    processTTSQueue();
  };

  useEffect(() => {
    const unsub = listenToConnectionStatus(() => {});
    return () => unsub();
  }, []);

  const handleJoin = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!roomCode || !playerName) return;
      
      // Kích hoạt âm thanh bằng cách chạy một câu nói rỗng ngay khi tương tác người dùng
      if (window.speechSynthesis) {
          const silent = new SpeechSynthesisUtterance("");
          window.speechSynthesis.speak(silent);
      }

      setIsConnecting(true);
      const code = roomCode.trim().toUpperCase();
      try {
          const roomRef = ref(database, `rooms/${code}`);
          const snap = await get(roomRef);
          if (!snap.exists()) { alert("Không thấy phòng này!"); setIsConnecting(false); return; }
          const roomData = snap.val();
          setRoomName(roomData.roomName);

          const pRef = push(ref(database, `rooms/${code}/players`));
          const pId = pRef.key!;
          setPlayerId(pId);
          await set(pRef, { id: pId, name: playerName, joinedAt: Date.now(), remaining: 4, isOnline: true });
          onDisconnect(pRef).update({ isOnline: false });

          // Lắng nghe dữ liệu phòng
          onValue(roomRef, (s) => {
              const d = s.val();
              if (d) { 
                  setHistory(d.history || []); 
                  setCurrentCall(d.currentNumber); 
                  if (d.currentRhyme && d.currentRhyme !== lastRhymeRef.current) {
                      setCurrentRhyme(d.currentRhyme);
                      lastRhymeRef.current = d.currentRhyme;
                      queueSpeech(d.currentRhyme);
                  }
              }
          });

          // Lắng nghe tin nhắn
          onValue(ref(database, `rooms/${code}/messages`), (s) => {
              const d = s.val();
              if (d) setMessages(Object.entries(d).map(([k, v]: any) => ({ ...v, id: k })).sort((a: any, b: any) => a.id.localeCompare(b.id)));
          });

          // Lắng nghe danh sách người chơi để hô người đợi/thắng
          onValue(ref(database, `rooms/${code}/players`), (s) => {
              const d = s.val();
              if (d) {
                  const pList = Object.values(d) as PlayerInfo[];
                  const currentWinners = pList.filter(p => p.remaining === 0);
                  const currentWaiters = pList.filter(p => p.remaining === 1);
                  
                  // Hô người đợi
                  currentWaiters.forEach(p => {
                      if (!announcedWaiters.current.has(p.id)) {
                          queueSpeech(`Cố lên! ${p.name} đang đợi kìa bà con ơi!`);
                          announcedWaiters.current.add(p.id);
                      }
                  });

                  // Hô người thắng
                  currentWinners.forEach(p => {
                      if (!announcedWinners.current.has(p.id)) {
                          queueSpeech(`Chúc mừng! ${p.name} đã thắng rồi! Trúng rồi bà con ơi!`);
                          announcedWinners.current.add(p.id);
                      }
                  });

                  setWinners(currentWinners);
              }
          });

          setIsConnected(true);
      } catch (e) { 
          console.error(e);
          setIsConnecting(false); 
      }
  };

  useEffect(() => {
      if (history.length > 0) {
          let changed = false;
          const newTicket = ticket.map(row => row.map(cell => {
              if (cell.value && history.includes(cell.value) && !cell.marked) { 
                  changed = true; 
                  return { ...cell, marked: true }; 
              }
              return cell;
          }));
          if (changed) {
              setTicket(newTicket);
              let minRem = 4;
              newTicket.forEach(r => {
                  const rem = r.filter(c => c.value && !c.marked).length;
                  if (rem < minRem) minRem = rem;
              });
              if (playerId && roomCode) {
                  update(ref(database, `rooms/${roomCode.toUpperCase()}/players/${playerId}`), { remaining: minRem });
              }
          }
      }
  }, [history]);

  if (!isConnected) {
      return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-[#f3f4f6] p-6">
              <div className="max-w-sm w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                  <h2 className="text-2xl font-black text-slate-800 text-center uppercase mb-6">Tham Gia Game</h2>
                  <form onSubmit={handleJoin} className="space-y-4">
                      <input required className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold" placeholder="Tên bạn" value={playerName} onChange={e => setPlayerName(e.target.value)} />
                      <input required className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold uppercase" placeholder="Mã Phòng" maxLength={6} value={roomCode} onChange={e => setRoomCode(e.target.value)} />
                      <button disabled={isConnecting} className="w-full bg-slate-900 text-white font-black py-4 rounded-xl shadow-lg active:scale-95 transition-transform">
                          {isConnecting ? 'ĐANG VÀO...' : 'VÀO PHÒNG'}
                      </button>
                      <button type="button" onClick={onExit} className="w-full text-slate-400 font-bold text-xs uppercase py-2">Quay lại</button>
                  </form>
                  <p className="mt-4 text-[10px] text-slate-400 text-center uppercase font-bold tracking-widest">Âm thanh sẽ được kích hoạt khi vào phòng</p>
              </div>
          </div>
      );
  }

  const winnerNames = winners.map(w => w.name);

  return (
    <div className="flex flex-col h-screen bg-[#f3f4f6] text-slate-800 overflow-hidden relative">
      {winners.length > 0 && (
         <div className="absolute top-16 left-4 right-4 z-[60] bg-yellow-400 p-3 rounded-2xl shadow-xl flex items-center gap-3 border-2 border-white animate-bounce">
            <Trophy className="text-yellow-900 shrink-0" />
            <div className="flex-1 overflow-hidden">
                <p className="text-[10px] font-black text-yellow-900 uppercase leading-none">CÓ NGƯỜI THẮNG!</p>
                <p className="text-sm font-black text-slate-900 truncate">{winnerNames.join(', ')}</p>
            </div>
         </div>
      )}

      <nav className="h-14 px-4 bg-white flex justify-between items-center shrink-0 border-b border-slate-100 z-30 shadow-sm">
         <div className="flex flex-col">
             <span className="text-[10px] text-slate-400 font-black uppercase leading-none">{roomName}</span>
             <span className="text-sm font-black text-slate-800 truncate max-w-[150px]">{playerName}</span>
         </div>
         <div className="flex gap-2">
             <button onClick={() => {
                 const newMuted = !muted;
                 setMuted(newMuted);
                 if (newMuted) window.speechSynthesis.cancel();
                 else processTTSQueue();
             }} className={`p-2 rounded-full ${muted ? 'bg-red-50 text-red-500' : 'text-slate-400'}`}>
                 {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
             </button>
             <button onClick={onExit} className="p-2 text-slate-400"><LogOut size={20}/></button>
         </div>
      </nav>

      <div className="flex-1 overflow-hidden flex flex-col relative">
         <EmojiSystem roomCode={roomCode.toUpperCase()} senderName={playerName} />

         <div className={`flex-1 flex flex-col items-center z-10 overflow-hidden pt-2 ${activeTab === 'TICKET' ? 'flex' : 'hidden'}`}>
            <div className="w-full max-w-lg px-3 mb-2">
                <div className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm border border-slate-100">
                    <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white shrink-0 shadow-lg">
                        <span className="text-xl font-black">{currentCall || '--'}</span>
                    </div>
                    <p className="text-slate-700 text-[11px] font-bold italic line-clamp-2 leading-tight">"{currentRhyme || 'Chờ host gọi số...'}"</p>
                </div>
            </div>

            <div className="w-full flex-1 overflow-y-auto flex flex-col items-center px-2 py-1 pb-20 gap-2 scale-[0.9] origin-top">
                <TicketView ticket={ticket} interactive={false} />
            </div>
         </div>

         <div className={`flex-1 flex flex-col relative z-10 ${activeTab === 'CHAT' ? 'flex' : 'hidden'}`}>
             <ChatOverlay messages={messages} onSendMessage={(text) => push(ref(database, `rooms/${roomCode.toUpperCase()}/messages`), { sender: playerName, text })} playerName={playerName} />
         </div>
      </div>

      <div className="flex border-t border-slate-100 bg-white pb-safe z-40 fixed bottom-0 left-0 right-0 h-14 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          <button onClick={() => setActiveTab('TICKET')} className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${activeTab === 'TICKET' ? 'text-red-600' : 'text-slate-400'}`}>
              <Grid3X3 size={20} /> <span className="text-[9px] font-black uppercase">Vé Số</span>
          </button>
          <button onClick={() => setActiveTab('CHAT')} className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${activeTab === 'CHAT' ? 'text-red-600' : 'text-slate-400'}`}>
              <MessageCircle size={20} /> <span className="text-[9px] font-black uppercase">Chat</span>
          </button>
      </div>
    </div>
  );
};
