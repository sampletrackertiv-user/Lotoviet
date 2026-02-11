import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Share2, Mic, Copy, Users, AlertCircle, RefreshCw, WifiOff } from 'lucide-react';
import { generateLotoRhyme } from '../services/geminiService';
import { Language, NetworkPayload, ChatMessage } from '../types';
import Peer, { DataConnection } from 'peerjs';

interface GameHostProps {
  onExit: () => void;
  lang: Language;
}

export const GameHost: React.FC<GameHostProps> = ({ onExit, lang }) => {
  // Game State
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [currentRhyme, setCurrentRhyme] = useState<string>('');
  const [isAuto, setIsAuto] = useState(false);
  const [speed, setSpeed] = useState(6000);
  const [flash, setFlash] = useState(false);
  const [muted, setMuted] = useState(false);
  
  // Network State
  const [peerId, setPeerId] = useState<string>('');
  const [connections, setConnections] = useState<DataConnection[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peerError, setPeerError] = useState<string | null>(null);
  const [isSignalingLost, setIsSignalingLost] = useState(false);
  
  const peerRef = useRef<Peer | null>(null);

  // Refs for logic
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectionsRef = useRef<DataConnection[]>([]); // Synced ref for callbacks
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // TTS Helper
  const speak = (text: string) => {
    if (muted || !window.speechSynthesis) return;
    
    // Cancel previous speech to avoid backlog
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    window.speechSynthesis.speak(utterance);
  };

  // Wake Lock Logic
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('Wake Lock active');
        }
      } catch (err) {
        console.warn('Wake Lock error:', err);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (wakeLockRef.current) wakeLockRef.current.release();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Initialize PeerJS (Host)
  useEffect(() => {
    let peer: Peer;

    const initPeer = () => {
      setPeerError(null);
      try {
        // Create Peer instance
        peer = new Peer({
            debug: 1
        });
        peerRef.current = peer;

        // --- Event: Open (ID assigned) ---
        peer.on('open', (id) => {
          console.log('Host ID:', id);
          setPeerId(id);
          const readyMsg = lang === 'vi' ? "Phòng đã sẵn sàng! Mời mọi người vào." : "Room Ready! Waiting for players.";
          setCurrentRhyme(readyMsg);
          speak(readyMsg);
          setPeerError(null);
          setIsSignalingLost(false);
        });

        // --- Event: Connection (Player joins) ---
        peer.on('connection', (conn) => {
          conn.on('open', () => {
            connectionsRef.current.push(conn);
            setConnections([...connectionsRef.current]);
            
            // Send initial sync to new player
            const syncData: NetworkPayload = {
              type: 'SYNC_STATE',
              payload: {
                 history: calledNumbers,
                 currentNumber,
                 currentRhyme
              }
            };
            
            // Send specifically to this new connection first
            conn.send(syncData);
            
            // Announce join
            broadcast({
                type: 'CHAT_MESSAGE',
                payload: {
                    id: Date.now().toString(),
                    sender: 'System',
                    text: 'New player joined!',
                    isSystem: true
                }
            });
          });

          conn.on('data', (data: any) => {
            const action = data as NetworkPayload;
            if (action.type === 'CHAT_MESSAGE') {
                const msg = action.payload as ChatMessage;
                setMessages(prev => [...prev, msg]);
                // Re-broadcast chat to everyone else
                broadcast(action);
            }
          });

          conn.on('close', () => {
             connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
             setConnections([...connectionsRef.current]);
          });
          
          conn.on('error', (err) => {
              console.warn('Connection specific error:', err);
          });
        });

        // --- Event: Disconnected (Signaling server lost) ---
        // This is not fatal for existing connections, but prevents new joins.
        peer.on('disconnected', () => {
            console.warn('Peer disconnected from signaling server. Attempting reconnect...');
            setIsSignalingLost(true);
            // Auto-reconnect
            if (peer && !peer.destroyed) {
                peer.reconnect();
            }
        });

        // --- Event: Error ---
        peer.on('error', (err: any) => {
            console.error('Peer error:', err);
            
            // Handle specific "Lost connection" which is often transient
            if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed' || err.message?.includes('Lost connection')) {
                 setIsSignalingLost(true);
                 // Retry reconnecting after a short delay
                 if (peer && !peer.destroyed) {
                     setTimeout(() => peer.reconnect(), 2000);
                 }
                 return; // Don't show fatal error for this
            }
            
            // Fatal errors (only if we don't have an ID yet)
            if (!peerId) {
                 setPeerError(lang === 'vi' ? 'Lỗi kết nối máy chủ. Thử lại...' : 'Connection error. Retrying...');
            }
        });

      } catch (e: any) {
          setPeerError(e.message || "Failed to create Peer");
      }
    };

    initPeer();

    // Prevent accidental closure since we don't have a database
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; 
      return ''; 
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (peer) peer.destroy();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [calledNumbers]); 

  const broadcast = (data: NetworkPayload) => {
    connectionsRef.current.forEach(conn => {
        if (conn.open) conn.send(data);
    });
  };

  // Game Logic
  const drawNumber = async () => {
    const allNumbers = Array.from({ length: 90 }, (_, i) => i + 1);
    const available = allNumbers.filter(n => !calledNumbers.includes(n));

    if (available.length === 0) {
      stopAuto();
      const endMsg = lang === 'vi' ? "Hết số rồi!" : "Game Over!";
      setCurrentRhyme(endMsg);
      speak(endMsg);
      broadcast({ type: 'CALL_NUMBER', payload: { number: null, rhyme: endMsg, history: calledNumbers } });
      return;
    }

    const nextNum = available[Math.floor(Math.random() * available.length)];
    
    // Update Local
    setFlash(true);
    setCurrentNumber(nextNum);
    const newHistory = [...calledNumbers, nextNum];
    setCalledNumbers(newHistory);
    setTimeout(() => setFlash(false), 500);

    // Speak just the number immediately for low latency feeling
    speak(lang === 'vi' ? `Số ${nextNum}` : `Number ${nextNum}`);

    // AI Rhyme
    const rhyme = await generateLotoRhyme(nextNum, lang);
    setCurrentRhyme(rhyme);
    
    // Speak rhyme after a tiny delay
    setTimeout(() => speak(rhyme), 800);

    // Broadcast
    broadcast({
        type: 'CALL_NUMBER',
        payload: {
            number: nextNum,
            rhyme: rhyme,
            history: newHistory
        }
    });
  };

  const startAuto = () => {
    if (isAuto) return;
    setIsAuto(true);
    drawNumber();
    timerRef.current = setInterval(drawNumber, speed);
  };

  const stopAuto = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsAuto(false);
  };

  const toggleAuto = () => {
    if (isAuto) stopAuto();
    else startAuto();
  };

  const resetGame = () => {
    if (!confirm(lang === 'vi' ? 'Bạn có chắc chắn muốn reset ván chơi?' : 'Are you sure you want to reset?')) return;
    stopAuto();
    setCalledNumbers([]);
    setCurrentNumber(null);
    setCurrentRhyme(lang === 'vi' ? "Ván mới!" : "New Game!");
    setMessages([]);
    broadcast({ type: 'RESET_GAME', payload: {} });
  };

  const handleExit = () => {
      if (confirm(lang === 'vi' ? 'Nếu thoát, phòng chơi sẽ bị hủy. Bạn chắc chứ?' : 'Exiting will destroy the room. Are you sure?')) {
          onExit();
      }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(peerId);
    alert('Room ID copied!');
  };

  return (
    <div className="flex flex-col h-screen max-h-screen">
      {/* Header */}
      <header className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center shrink-0">
        <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500">
          Loto Master <span className="text-xs text-slate-400 font-normal border border-slate-600 px-2 py-0.5 rounded ml-2">HOST</span>
        </h1>
        <div className="flex gap-2 items-center">
            <button 
             onClick={() => setMuted(!muted)} 
             className="p-2 hover:bg-slate-800 rounded-full text-slate-300 mr-2"
             title={muted ? "Unmute" : "Mute"}
            >
             {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
           <button onClick={resetGame} className="p-2 hover:bg-slate-800 rounded text-slate-300" title="Reset">
            <RotateCcw size={20} />
          </button>
          <button onClick={handleExit} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-sm rounded border border-slate-600">
            Exit
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Left Panel: The Stage */}
        <section className="flex-1 p-6 flex flex-col items-center justify-center relative bg-slate-900">
           {/* Room Info Overlay */}
           <div className="absolute top-4 left-4 bg-black/50 backdrop-blur px-4 py-2 rounded-lg border border-white/10 z-20">
              <div className="text-xs text-slate-400 uppercase font-bold mb-1">Room ID</div>
              {peerError ? (
                  <div className="flex items-center gap-2 text-red-400">
                      <AlertCircle size={16} />
                      <span className="text-xs font-bold">{peerError}</span>
                      <button onClick={() => window.location.reload()} className="p-1 hover:bg-white/10 rounded"><RefreshCw size={12}/></button>
                  </div>
              ) : (
                  <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                          <code className="text-green-400 font-mono text-lg min-w-[100px]">{peerId || (lang === 'vi' ? 'Đang tạo...' : 'Creating...')}</code>
                          {peerId && <button onClick={copyToClipboard} className="text-white hover:text-green-300"><Copy size={16}/></button>}
                      </div>
                      {isSignalingLost && (
                          <div className="flex items-center gap-1 text-[10px] text-yellow-500 animate-pulse">
                              <WifiOff size={10} />
                              <span>Reconnecting lobby...</span>
                          </div>
                      )}
                  </div>
              )}
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                 <Users size={12}/> {connections.length} players connected
              </div>
           </div>

           <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-900 to-slate-900 z-0"></div>

           <div className="z-10 w-full max-w-md text-center space-y-8">
              {/* Current Number Ball */}
              <div className="relative group cursor-pointer" onClick={isAuto ? stopAuto : drawNumber}>
                 <div className={`
                    w-48 h-48 mx-auto rounded-full 
                    bg-gradient-to-br from-red-500 via-pink-600 to-purple-700
                    flex items-center justify-center shadow-[0_0_50px_rgba(236,72,153,0.5)]
                    border-8 border-white/10 relative
                    transition-transform duration-300
                    ${flash ? 'scale-110 brightness-110' : 'scale-100'}
                 `}>
                    {currentNumber ? (
                      <span className="text-8xl font-black text-white drop-shadow-lg ball-animation">
                        {currentNumber}
                      </span>
                    ) : (
                      <span className="text-2xl font-bold text-white/50 uppercase tracking-widest">
                        Ready
                      </span>
                    )}
                    
                    {/* Shine effect */}
                    <div className="absolute top-4 left-8 w-12 h-8 bg-white/20 rounded-full rotate-[-45deg] blur-sm"></div>
                 </div>
              </div>

              {/* Rhyme Display */}
              <div className="glass-panel p-6 rounded-2xl min-h-[120px] flex items-center justify-center flex-col">
                 <div className="flex items-center gap-2 mb-2 text-indigo-400 text-sm font-semibold uppercase tracking-wider">
                    <Mic size={14} />
                    {lang === 'vi' ? 'MC AI đang hô:' : 'AI Caller:'}
                 </div>
                 <p className="text-xl md:text-2xl text-white font-medium italic leading-relaxed animate-pulse">
                   "{currentRhyme}"
                 </p>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-6">
                <button 
                  onClick={toggleAuto}
                  className={`flex items-center gap-2 px-8 py-4 rounded-full font-bold text-lg shadow-lg transition-all transform hover:scale-105 ${isAuto ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-green-600 text-white hover:bg-green-500'}`}
                >
                  {isAuto ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
                  {isAuto ? (lang === 'vi' ? 'Dừng lại' : 'Stop') : (lang === 'vi' ? 'Quay Số' : 'Draw')}
                </button>
                
                <div className="flex flex-col items-center">
                    <label className="text-xs text-slate-500 mb-1">Speed</label>
                    <input 
                      type="range" 
                      min="2000" 
                      max="10000" 
                      step="500"
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                      className="w-24 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
              </div>
           </div>
        </section>

        {/* Right Panel: The Board History */}
        <section className="md:w-96 bg-slate-800 border-l border-slate-700 flex flex-col">
          <div className="p-4 border-b border-slate-700 font-semibold text-slate-300 flex justify-between">
            <span>Board ({calledNumbers.length}/90)</span>
          </div>
          <div className="flex-1 p-2 overflow-y-auto">
             <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 90 }, (_, i) => i + 1).map((num) => {
                  const isCalled = calledNumbers.includes(num);
                  const isRecent = currentNumber === num;
                  return (
                    <div 
                      key={num}
                      className={`
                        aspect-square rounded-lg flex items-center justify-center text-sm font-bold
                        transition-all duration-500
                        ${isRecent ? 'bg-yellow-400 text-black scale-110 shadow-lg z-10' : ''}
                        ${!isRecent && isCalled ? 'bg-indigo-600 text-white' : ''}
                        ${!isCalled ? 'bg-slate-700/50 text-slate-500' : ''}
                      `}
                    >
                      {num}
                    </div>
                  );
                })}
             </div>
          </div>
        </section>
      </main>
    </div>
  );
};