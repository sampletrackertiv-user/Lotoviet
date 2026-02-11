import React from 'react';
import { TicketData } from '../types';

interface TicketViewProps {
  ticket: TicketData;
  onCellClick?: (rowIndex: number, colIndex: number, value: number) => void;
  interactive: boolean;
}

export const TicketView: React.FC<TicketViewProps> = ({ ticket, onCellClick, interactive }) => {
  return (
    <div className="w-full max-w-2xl mx-auto p-2 sm:p-4 bg-white rounded-lg shadow-2xl border-2 sm:border-4 border-yellow-500 relative overflow-hidden">
      {/* Decorative patterns */}
      <div className="absolute top-0 left-0 w-16 h-16 bg-red-500 -rotate-45 transform -translate-x-8 -translate-y-8 opacity-50 sm:opacity-100"></div>
      <div className="absolute bottom-0 right-0 w-16 h-16 bg-red-500 -rotate-45 transform translate-x-8 translate-y-8 opacity-50 sm:opacity-100"></div>

      <div className="text-center mb-2">
        <h3 className="text-red-600 font-bold uppercase tracking-widest text-sm sm:text-lg">Vé Số / Ticket</h3>
        <div className="h-0.5 sm:h-1 w-16 sm:w-24 bg-yellow-500 mx-auto"></div>
      </div>

      <div className="grid grid-rows-3 gap-1 bg-yellow-100 p-1 sm:p-2 rounded border border-yellow-300">
        {ticket.map((row, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-9 gap-0.5 sm:gap-1 h-12 sm:h-20">
            {row.map((cell, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                onClick={() => {
                  if (interactive && cell.value !== null && onCellClick) {
                    onCellClick(rowIndex, colIndex, cell.value);
                  }
                }}
                className={`
                  relative flex items-center justify-center rounded border 
                  text-sm sm:text-2xl font-bold transition-all duration-200 select-none
                  ${cell.value === null 
                    ? 'bg-transparent border-transparent' 
                    : 'bg-white border-gray-300 cursor-pointer active:scale-95 shadow-sm'}
                  ${cell.marked && cell.value !== null ? '!bg-red-500 !text-white !border-red-600' : 'text-gray-800'}
                `}
              >
                {cell.value}
                {cell.marked && (
                  <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="w-full h-full border-2 border-white rounded opacity-50 animate-pulse"></span>
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      
      <div className="mt-2 flex justify-between text-[10px] sm:text-xs text-gray-500 uppercase font-semibold px-1">
        <span>Lucky Game</span>
        <span>#{Math.floor(Math.random() * 9999)}</span>
      </div>
    </div>
  );
};