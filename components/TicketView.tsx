import React from 'react';
import { TicketData } from '../types';
import { Sparkles, QrCode, Flower } from 'lucide-react';

interface TicketViewProps {
  ticket: TicketData;
  onCellClick?: (rowIndex: number, colIndex: number, value: number) => void;
  interactive: boolean;
}

export const TicketView: React.FC<TicketViewProps> = ({ ticket, onCellClick, interactive }) => {
  return (
    <div className="w-full max-w-3xl mx-auto relative group perspective-1000">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-red-400 to-yellow-400 rounded-3xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
      
      <div className="relative bg-white rounded-3xl border-4 border-red-500 shadow-2xl overflow-hidden">
        {/* Decorative corner patterns */}
        <div className="absolute top-0 right-0 w-20 h-20 bg-yellow-400 rounded-bl-full opacity-20"></div>
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-red-400 rounded-tr-full opacity-20"></div>

        {/* Header */}
        <div className="bg-red-600 p-1 flex justify-between items-center px-4 shadow-sm">
             <div className="flex gap-1">
                 <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                 <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                 <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
             </div>
             <span className="text-[10px] text-yellow-200 font-bold uppercase tracking-widest">Lộc Phát Lộc Phát</span>
        </div>
        
        <div className="p-4 sm:p-6 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')]">
            <div className="flex justify-between items-end mb-6 border-b-2 border-red-100 pb-4">
                <div>
                    <div className="flex items-center gap-2 text-red-600 mb-1">
                        <Flower size={18} />
                        <span className="text-xs uppercase tracking-[0.2em] font-bold">Xuân Ất Tỵ 2025</span>
                    </div>
                    <h2 className="text-4xl sm:text-5xl font-black text-red-600 tracking-tighter drop-shadow-sm">LÔ TÔ</h2>
                </div>
                <div className="bg-red-50 p-2 rounded-lg border border-red-100">
                    <QrCode size={40} className="text-red-800"/>
                </div>
            </div>

            {/* The Grid */}
            <div className="flex flex-col gap-3">
                {ticket.map((row, rowIndex) => (
                <div key={rowIndex} className="grid grid-cols-9 gap-1 sm:gap-2">
                    {row.map((cell, colIndex) => (
                    <div
                        key={`${rowIndex}-${colIndex}`}
                        onClick={() => {
                        if (interactive && cell.value !== null && onCellClick) {
                            onCellClick(rowIndex, colIndex, cell.value);
                        }
                        }}
                        className={`
                        relative h-12 sm:h-16 rounded-xl flex items-center justify-center
                        font-black text-lg sm:text-2xl transition-all duration-300 shadow-sm
                        ${cell.value === null 
                            ? 'bg-red-50/50' // Empty
                            : 'cursor-pointer hover:scale-105 active:scale-95 border-2'}
                        
                        ${!cell.marked && cell.value !== null 
                            ? 'bg-white border-red-100 text-red-900 hover:border-red-300 hover:shadow-md' 
                            : ''}
                        
                        ${cell.marked && cell.value !== null 
                            ? 'bg-yellow-400 border-yellow-500 text-red-700 shadow-[0_4px_10px_rgba(250,204,21,0.5)] z-10 transform scale-105' 
                            : ''}
                        `}
                    >
                        {cell.value}
                        
                        {/* Checked Icon */}
                        {cell.marked && (
                            <div className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5">
                                <Sparkles size={8} fill="currentColor"/>
                            </div>
                        )}
                    </div>
                    ))}
                </div>
                ))}
            </div>

            <div className="mt-6 flex justify-between items-center">
                <span className="text-[10px] text-red-400 font-bold uppercase tracking-widest bg-red-50 px-2 py-1 rounded">Mã vé: {Math.random().toString(36).substring(7).toUpperCase()}</span>
                <span className="text-[10px] text-red-400 font-bold uppercase tracking-widest">May Mắn - Tài Lộc</span>
            </div>
        </div>
      </div>
    </div>
  );
};