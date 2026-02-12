import React, { useEffect, useState } from 'react';
import { Download, Share, X, Phone } from 'lucide-react';

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIphone = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIphone);

    if (isIphone) {
        // Show prompt for iOS after a small delay if not standalone
        setTimeout(() => setShowPrompt(true), 2000);
    }

    // Handle Android/Desktop "Add to Home Screen" event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowPrompt(false);
    }
  };

  if (isStandalone || !showPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 animate-in slide-in-from-bottom duration-500">
      <div className="max-w-md mx-auto bg-white/95 backdrop-blur-xl border border-red-200 rounded-2xl shadow-2xl overflow-hidden p-4 relative">
        <button 
            onClick={() => setShowPrompt(false)}
            className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
        >
            <X size={18} />
        </button>

        <div className="flex gap-4 items-start">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white shadow-lg shrink-0">
                <span className="font-black text-xl">L</span>
            </div>
            <div className="flex-1">
                <h3 className="font-bold text-slate-900">Cài đặt App LotoMaster</h3>
                <p className="text-xs text-slate-500 mt-1 mb-3 leading-relaxed">
                    {isIOS 
                        ? "Để chơi mượt mà hơn, hãy thêm ứng dụng vào màn hình chính." 
                        : "Cài đặt ứng dụng để có biểu tượng ngoài màn hình và chơi toàn màn hình."}
                </p>

                {isIOS ? (
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-2">
                        <div className="flex items-center gap-2">
                            <span>1. Bấm nút Chia sẻ</span>
                            <Share size={14} className="text-blue-500" />
                        </div>
                        <div className="flex items-center gap-2">
                            <span>2. Chọn <strong>"Thêm vào MH chính"</strong></span>
                            <span className="w-4 h-4 border border-slate-300 rounded flex items-center justify-center bg-white">+</span>
                        </div>
                    </div>
                ) : (
                    <button 
                        onClick={handleInstallClick}
                        className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 hover:bg-slate-800 transition-all shadow-md active:scale-95"
                    >
                        <Download size={14} /> Cài đặt ngay
                    </button>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};