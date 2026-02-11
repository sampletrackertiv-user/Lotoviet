import React, { useEffect, useRef, useState } from 'react';
import { Send, User } from 'lucide-react';
import { ChatMessage } from '../types';

interface ChatOverlayProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  playerName: string;
}

const AVATAR_COLORS = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-yellow-500', 'bg-pink-500'];

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
    <div className="flex flex-col h-full bg-slate-900/80 backdrop-blur-md rounded-xl overflow-hidden border border-slate-700">
      <div className="p-3 bg-slate-800 border-b border-slate-700 font-bold text-white flex justify-between items-center">
        <span>💬 Chat Room</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-hide">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.isSystem ? 'justify-center' : ''}`}>
            {msg.isSystem ? (
              <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded-full">{msg.text}</span>
            ) : (
              <>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${msg.avatar || 'bg-gray-500'}`}>
                  {msg.sender.charAt(0)}
                </div>
                <div className="flex flex-col max-w-[80%]">
                  <span className="text-[10px] text-slate-400 ml-1">{msg.sender}</span>
                  <div className="bg-slate-700/80 text-sm text-slate-100 p-2 rounded-2xl rounded-tl-none">
                    {msg.text}
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-2 bg-slate-800 border-t border-slate-700 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Nhập tin nhắn..."
          className="flex-1 bg-slate-900 text-white text-sm rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-2 transition-colors">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};