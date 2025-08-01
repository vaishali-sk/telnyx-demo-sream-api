import { useState, useEffect } from "react";
import { ConnectionStatus } from "@/components/connection-status";
import { Dialer } from "@/components/dialer";
import { CallInterface } from "@/components/call-interface";
import { ActiveCalls } from "@/components/active-calls";
import { Settings } from "@/components/settings";
import { TransferModal } from "@/components/transfer-modal";
import { useCallContext } from "@/contexts/api-call-context";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, Phone } from "lucide-react";

export default function Softphone() {
  const [activeView, setActiveView] = useState<'dialer' | 'settings'>('dialer');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const { activeCalls } = useCallContext();

  const currentCall = activeCalls.find((call: any) => call.status === 'active');

  return (
    <div className="bg-gray-50 h-screen flex flex-col">
      {/* Hidden audio element for remote audio playback */}
      <audio 
        id="remote-audio" 
        autoPlay 
        playsInline 
        style={{ display: 'none' }}
      />
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Phone className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Telnyx Softphone</h1>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <ConnectionStatus />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveView(activeView === 'settings' ? 'dialer' : 'settings')}
          >
            <SettingsIcon className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col">
          {/* Navigation Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex">
              <button
                className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                  activeView === 'dialer'
                    ? 'text-primary border-b-2 border-primary bg-primary/5'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveView('dialer')}
              >
                Dialer
              </button>
              <button
                className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                  activeView === 'settings'
                    ? 'text-primary border-b-2 border-primary bg-primary/5'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveView('settings')}
              >
                Settings
              </button>
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col">
            {activeView === 'dialer' ? (
              <>
                <Dialer />
                <ActiveCalls onTransfer={() => setShowTransferModal(true)} />
              </>
            ) : (
              <div className="p-6">
                <p className="text-sm text-gray-600">Settings are in the main panel →</p>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col bg-gray-50">
          {activeView === 'dialer' ? (
            <CallInterface currentCall={currentCall} />
          ) : (
            <Settings />
          )}
        </main>
      </div>

      {/* Transfer Modal */}
      <TransferModal
        open={showTransferModal}
        onOpenChange={setShowTransferModal}
      />
    </div>
  );
}
