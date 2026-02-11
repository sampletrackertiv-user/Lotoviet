import React, { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { ChatMessage } from '../types';

interface ChatOverlayProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  playerName: string;
}

export const ChatOverlay: React.FC<ChatOverlayProps> = ({ messages, onSendMessage, playerName }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 bg-white border-b border-slate-100 font-bold text-slate-800 flex justify-between items-center shadow-sm z-10">
        <span className="text-red-600 uppercase tracking-widest text-xs">Phòng Chat</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide bg-slate-50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.isSystem ? 'justify-center' : ''}`}>
            {msg.isSystem ? (
              <span className="text-xs text-slate-400 bg-slate-200 px-3 py-1 rounded-full">{msg.text}</span>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full bg-red-100 border border-red-200 flex items-center justify-center text-xs font-bold text-red-600 shrink-0">
                  {msg.sender.charAt(0)}
                </div>
                <div className="flex flex-col max-w-[80%]">
                  <span className="text-[10px] text-slate-400 ml-1 font-bold">{msg.sender}</span>
                  <div className="bg-white text-sm text-slate-800 p-2.5 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm">
                    {msg.text}
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-100 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Nhập tin nhắn..."
          className="flex-1 bg-slate-100 text-slate-800 text-sm rounded-full px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all border border-transparent focus:bg-white"
        />
        <button type="submit" className="bg-red-500 hover:bg-red-600 text-white rounded-full p-3 transition-colors shadow-lg shadow-red-200">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};