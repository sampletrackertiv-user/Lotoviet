
import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, VolumeX, Copy, LogOut, Users, MessageCircle, Grid3X3, Trophy, Crown, Star, Sparkles } from 'lucide-react';
import { generateLotoRhyme } from '../services/geminiService';
import { Language, PlayerInfo, TicketData, ChatMessage } from '../types';
import { database, listenToConnectionStatus } from '../services/firebase';
import { ref, set, onValue, update, onDisconnect, push } from "firebase/database";
import { ChatOverlay } from './ChatOverlay';
import { TicketView } from './TicketView';
import { EmojiSystem } from './EmojiSystem';

interface GameHostProps {
  onExit: () => void;
  lang: Language;
}

const generateShortCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const generateHostTicket = (): TicketData => {
  const TOTAL_ROWS = 15;
  const NUMS_PER_ROW = 4;
  const ticket: TicketData = Array(TOTAL_ROWS).fill(null).map(() => Array(9).fill({ value: null, marked: false }));
  const colRanges = Array.from({length: 9}, (_, i) => ({ min: i*10 + (i===0?1:0), max: i*10 + 9 + (i===8?1:0) }));
  for (let r = 0; r < TOTAL_ROWS; r++) {
    const cols = [0,1,2,3,4,5,6,7,8].sort(() => 0.5 - Math.random()).slice(0, NUMS_PER_ROW);
    cols.forEach(c => {
      const range = colRanges[c];
      const num = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
      ticket[r][c] = { value: num, marked: false };
    });
  }
  return ticket;
};

export const GameHost: React.FC<GameHostProps> = ({ onExit, lang }) => {
  const [setupStep, setSetupStep] = useState(true);
  const [roomName, setRoomName] = useState('');
  const [hostName, setHostName] = useState('');
  
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [displayNumber, setDisplayNumber] = useState<number | null>(null);
  const [currentRhyme, setCurrentRhyme] = useState<string>('');
  const [isAuto, setIsAuto] = useState(false);
  const [speed, setSpeed] = useState(6500);
  const [flash, setFlash] = useState(false);
  const [muted, setMuted] = useState(false);
  const [roomCode, setRoomCode] = useState<string>('');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [winners, setWinners] = useState<PlayerInfo[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'CHAT' | 'TICKET'>('DASHBOARD');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hostTicket, setHostTicket] = useState<TicketData | null>(null);
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  const announcedWaiters = useRef<Set<string>>(new Set());
  const announcedWinners = useRef<Set<string>>(new Set());
  const ttsQueue = useRef<string[]>([]);
  const isSpeaking = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const unsubscribeStatus = listenToConnectionStatus(() => {});
    return () => unsubscribeStatus();
  }, []);

  const processTTSQueue = () => {
    if (isSpeaking.current || ttsQueue.current.length === 0 || muted) return;
    const text = ttsQueue.current.shift();
    if (!text) return;

    isSpeaking.current = true;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    utterance.onend = () => {
      isSpeaking.current = false;
      setTimeout(processTTSQueue, 500);
    };
    window.speechSynthesis.speak(utterance);
  };

  const queueSpeech = (text: string) => {
    ttsQueue.current.push(text);
    processTTSQueue();
  };

  const initGame = () => {
    if (!roomName.trim()) return;
    const code = generateShortCode();
    setRoomCode(code);
    const roomRef = ref(database, `rooms/${code}`);
    set(roomRef, { status: 'ACTIVE', roomName: roomName.trim(), hostName: hostName.trim() || 'Host', createdAt: Date.now() });
    
    onValue(ref(database, `rooms/${code}/players`), (snap) => {
        const data = snap.val();
        if (!data) { setPlayers([]); setWinners([]); return; }
        const pList = Object.values(data) as PlayerInfo[];
        setPlayers(pList);
        
        const currentWinners = pList.filter(p => p.remaining === 0);
        const currentWaiters = pList.filter(p => p.remaining === 1);

        // Hô người đang đợi
        currentWaiters.forEach(p => {
            if (!announcedWaiters.current.has(p.id)) {
                queueSpeech(`Cố lên! ${p.name} đang đợi kìa bà con ơi!`);
                announcedWaiters.current.add(p.id);
            }
        });

        // Hô người thắng
        currentWinners.forEach(p => {
            if (!announcedWinners.current.has(p.id)) {
                queueSpeech(`Chúc mừng! Chúc mừng! ${p.name} đã kinh rồi! Trúng rồi bà con ơi!`);
                announcedWinners.current.add(p.id);
                setIsAuto(false);
                setShowCelebration(true);
            }
        });
        setWinners(currentWinners);
    });

    onValue(ref(database, `rooms/${code}/messages`), (snap) => {
         const data = snap.val();
         if (data) setMessages(Object.entries(data).map(([key, val]: any) => ({ ...val, id: key })).sort((a: any, b: any) => a.id.localeCompare(b.id)));
    });

    setSetupStep(false);
  };

  const drawNumber = async () => {
    if (winners.length > 0 || isSpinning) return;
    const available = Array.from({ length: 90 }, (_, i) => i + 1).filter(n => !calledNumbers.includes(n));
    if (available.length === 0) return;

    setIsSpinning(true);
    const nextNum = available[Math.floor(Math.random() * available.length)];
    let rhyme = await generateLotoRhyme(nextNum, lang);

    let spinTime = 0;
    const spinInterval = setInterval(() => {
        spinTime += 50;
        setDisplayNumber(Math.floor(Math.random() * 90) + 1);
        if (spinTime >= 1000) {
            clearInterval(spinInterval);
            setIsSpinning(false);
            const newHistory = [nextNum, ...calledNumbers];
            setCalledNumbers(newHistory);
            setDisplayNumber(nextNum);
            setCurrentRhyme(rhyme);
            setFlash(true); setTimeout(() => setFlash(false), 500);
            queueSpeech(lang === 'vi' ? rhyme : `Number ${nextNum}. ${rhyme}`);
            update(ref(database, `rooms/${roomCode}`), { currentNumber: nextNum, currentRhyme: rhyme, history: newHistory });
        }
    }, 50);
  };

  useEffect(() => {
    let timer: any;
    if (isAuto && !isSpinning && winners.length === 0) {
        timer = setTimeout(drawNumber, speed);
    }
    return () => clearTimeout(timer);
  }, [isAuto, isSpinning, calledNumbers, winners.length]);

  if (setupStep) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
          <h2 className="text-2xl font-black text-slate-800 mb-6 text-center uppercase">Thiết Lập Phòng</h2>
          <div className="space-y-4">
            <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold" placeholder="Tên Phòng (VD: Tết Nhà Mình)" value={roomName} onChange={e => setRoomName(e.target.value)} />
            <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold" placeholder="Tên Bạn (Host)" value={hostName} onChange={e => setHostName(e.target.value)} />
            <button onClick={initGame} disabled={!roomName.trim()} className="w-full bg-red-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 disabled:opacity-50 uppercase">Tạo Phòng Ngay</button>
            <button onClick={onExit} className="w-full text-slate-400 font-bold text-xs uppercase py-2">Quay lại</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#f3f4f6] text-slate-800 overflow-hidden relative">
      {showCelebration && (
        <div className="absolute inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {Array.from({length: 20}).map((_, i) => (
                    <div key={i} className="absolute animate-bounce" style={{left: `${Math.random()*100}%`, top: `${Math.random()*100}%`, animationDelay: `${Math.random()*2}s`}}>
                        <Star className="text-yellow-400" fill="currentColor" size={24} />
                    </div>
                ))}
            </div>
            <Trophy size={120} className="text-yellow-400 mb-6 animate-bounce" />
            <h2 className="text-5xl font-black text-white mb-4 uppercase tracking-tighter">CÓ NGƯỜI KINH!</h2>
            <div className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/20">
                <p className="text-2xl text-yellow-300 font-bold mb-2">Chúc mừng người chiến thắng:</p>
                <div className="space-y-2">
                    {winners.map(w => (
                        <div key={w.id} className="text-4xl font-black text-white flex items-center justify-center gap-3">
                            <Crown className="text-yellow-500" /> {w.name}
                        </div>
                    ))}
                </div>
            </div>
            <button onClick={() => setShowCelebration(false)} className="mt-10 bg-red-600 text-white px-10 py-4 rounded-full font-black text-xl shadow-2xl hover:bg-red-700 transition-all uppercase">Tiếp tục cuộc vui</button>
        </div>
      )}

      <header className="h-14 px-4 flex justify-between items-center bg-white border-b border-slate-100 shrink-0 z-50">
         <div className="flex items-center gap-3">
             <div className="flex flex-col">
                 <span className="text-[10px] text-slate-400 font-bold uppercase leading-none">{roomName}</span>
                 <span className="text-red-600 font-black text-sm tracking-tighter">{roomCode}</span>
             </div>
             <button onClick={() => navigator.clipboard.writeText(roomCode)} className="p-1.5 text-slate-400"><Copy size={14}/></button>
         </div>
         <div className="flex items-center gap-2">
             <button onClick={() => setMuted(!muted)} className={`w-9 h-9 flex items-center justify-center rounded-full ${muted ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-600'}`}>{muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</button>
             <button onClick={onExit} className="bg-slate-100 text-slate-600 p-2 rounded-full"><LogOut size={18}/></button>
         </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <EmojiSystem roomCode={roomCode} senderName={`👑 ${hostName || 'Host'}`} />
        
        <section className="flex-none md:w-[35%] bg-white border-b md:border-r border-slate-100 flex flex-col items-center p-4 z-10">
            <div className="flex-1 flex flex-col items-center justify-center w-full">
                <div onClick={isAuto ? () => setIsAuto(false) : drawNumber} className={`relative w-44 h-44 rounded-full bg-white shadow-2xl flex items-center justify-center border-8 border-slate-50 transition-all ${flash ? 'scale-110 border-red-200' : ''}`}>
                    <span className={`text-[80px] leading-none font-black text-slate-800 ${isSpinning ? 'animate-pulse opacity-50' : ''}`}>{displayNumber || '--'}</span>
                </div>
                <div className="mt-4 text-center">
                     <p className="text-xs text-slate-400 font-bold uppercase mb-1">Đang hô:</p>
                     <h3 className="text-lg font-black text-red-600 px-4 line-clamp-2 leading-tight">{currentRhyme || "Chào mừng bạn!"}</h3>
                </div>
            </div>
            <div className="w-full space-y-2 mt-4">
                 <button onClick={() => setIsAuto(!isAuto)} className={`w-full py-4 rounded-2xl font-black text-sm uppercase flex items-center justify-center gap-2 shadow-lg transition-all ${isAuto ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-900 text-white'}`}>
                    {isAuto ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}
                    {isAuto ? 'Dừng Tự Động' : 'Quay Tự Động'}
                 </button>
            </div>
        </section>

        <section className="flex-1 flex flex-col overflow-hidden relative z-10">
            <div className="h-10 bg-white border-b border-slate-100 flex items-center px-4 shrink-0 overflow-x-auto scrollbar-hide gap-1.5">
                 <span className="text-[9px] font-black text-slate-300 uppercase shrink-0">Lịch sử:</span>
                 {calledNumbers.map((num, i) => (
                    <div key={i} className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${i === 0 ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{num}</div>
                 ))}
            </div>

            <div className="flex p-1.5 gap-1.5 bg-slate-50 shrink-0">
                <button onClick={() => setActiveTab('DASHBOARD')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1.5 ${activeTab === 'DASHBOARD' ? 'bg-white shadow-sm' : 'text-slate-400'}`}><Users size={14} /> Phòng ({players.length})</button>
                <button onClick={() => setActiveTab('CHAT')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1.5 ${activeTab === 'CHAT' ? 'bg-white shadow-sm' : 'text-slate-400'}`}><MessageCircle size={14} /> Chat</button>
                <button onClick={() => setActiveTab('TICKET')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1.5 ${activeTab === 'TICKET' ? 'bg-white shadow-sm' : 'text-slate-400'}`}><Grid3X3 size={14} /> Vé Chủ</button>
            </div>

            <div className="flex-1 overflow-hidden p-2 relative">
                 <div className="h-full bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-inner">
                     {activeTab === 'DASHBOARD' && (
                        <div className="h-full overflow-y-auto p-3 space-y-2">
                            {winners.length > 0 && <div className="p-3 bg-yellow-400 rounded-xl flex items-center gap-2 animate-pulse"><Trophy className="text-yellow-900" size={18}/> <span className="font-black text-yellow-900 text-sm">TRÚNG: {winners.map(w => w.name).join(', ')}</span></div>}
                            {players.map(p => (
                                <div key={p.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${p.isOnline ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                                        <span className="text-xs font-bold">{p.name}</span>
                                    </div>
                                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${p.remaining === 1 ? 'bg-red-600 text-white animate-bounce' : 'bg-white text-slate-400 border'}`}>CÒN {p.remaining} SỐ</span>
                                </div>
                            ))}
                        </div>
                     )}
                     {activeTab === 'CHAT' && <ChatOverlay messages={messages} onSendMessage={(text) => push(ref(database, `rooms/${roomCode}/messages`), { sender: `👑 ${hostName || 'Host'}`, text })} playerName={`👑 ${hostName || 'Host'}`} />}
                     {activeTab === 'TICKET' && (
                        <div className="h-full overflow-y-auto flex flex-col items-center py-4 px-2 scale-[0.9] origin-top">
                             {!hostPlayerId ? (
                                <button onClick={() => {
                                    const ticket = generateHostTicket(); setHostTicket(ticket);
                                    const newRef = push(ref(database, `rooms/${roomCode}/players`));
                                    setHostPlayerId(newRef.key);
                                    set(newRef, { id: newRef.key, name: `👑 ${hostName}`, remaining: 4, isOnline: true });
                                }} className="bg-slate-900 text-white px-8 py-3 rounded-full font-black uppercase text-sm shadow-xl">Nhận Vé Chơi Cùng</button>
                             ) : <TicketView ticket={hostTicket!} interactive={false} />}
                        </div>
                     )}
                 </div>
            </div>
        </section>
      </main>
    </div>
  );
};
