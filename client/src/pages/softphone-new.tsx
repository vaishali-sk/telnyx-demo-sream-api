import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimpleDialer } from "@/components/simple-dialer";
import { ActiveCallsNew } from "@/components/active-calls-new";
import { Settings } from "@/components/settings";
import { ConnectionStatus } from "@/components/connection-status";
import { HttpAudioHandler } from "@/components/http-audio-handler";


import { useCallContext } from "@/contexts/api-call-context";
import { Phone, Settings as SettingsIcon, Users, History } from "lucide-react";

export default function SoftphoneNew() {
  const [activeTab, setActiveTab] = useState("dialer");

  const { activeCalls, testConnection, connectionStatus } = useCallContext();
  
  const activeCall = activeCalls.length > 0 ? activeCalls[0] : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Phone className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">
              Telnyx Call Control Softphone
            </h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <ConnectionStatus />
            <Button onClick={testConnection} variant="outline" size="sm">
              Test Connection
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Panel - Dialer and Controls */}
          <div className="lg:col-span-1">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="dialer">
                  <Phone className="w-4 h-4 mr-2" />
                  Dialer
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <SettingsIcon className="w-4 h-4 mr-2" />
                  Settings
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="dialer" className="mt-4">
                <SimpleDialer />
              </TabsContent>
              

              
              <TabsContent value="settings" className="mt-4">
                <Settings />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Panel - Active Calls */}
          <div className="lg:col-span-2 space-y-6">
            <ActiveCallsNew />
            <HttpAudioHandler 
              callId={activeCall?.callId} 
              isCallActive={activeCalls.length > 0} 
            />
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Calls</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeCalls.length}</div>
              <p className="text-xs text-muted-foreground">
                {activeCalls.filter(c => c.status === 'active').length} connected
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Call Types</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {activeCalls.filter(c => c.status === 'active').length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Active:</span>
                    <Badge variant="default">
                      {activeCalls.filter(c => c.status === 'active').length}
                    </Badge>
                  </div>
                )}
                {activeCalls.filter(c => c.status === 'held').length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>On Hold:</span>
                    <Badge variant="secondary">
                      {activeCalls.filter(c => c.status === 'held').length}
                    </Badge>
                  </div>
                )}
                {activeCalls.filter(c => c.status === 'conference').length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Conference:</span>
                    <Badge variant="destructive">
                      {activeCalls.filter(c => c.status === 'conference').length}
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Features</CardTitle>
              <History className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Call Transfer:</span>
                  <Badge variant="outline">✓</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Conference:</span>
                  <Badge variant="outline">✓</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Recording:</span>
                  <Badge variant="outline">✓</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Setup Notice for Demo Mode */}
        {connectionStatus === 'error' && (
          <Card className="mt-6 border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="text-red-800">Demo Mode - Setup Required</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <p className="text-red-700">
                  <strong>Current Status:</strong> Using demo credentials that won't make real calls.
                </p>
                <p className="text-red-700">
                  <strong>To make real calls:</strong>
                </p>
                <ol className="list-decimal list-inside space-y-1 text-red-600 ml-4">
                  <li>Create account at <a href="https://telnyx.com" target="_blank" className="underline">telnyx.com</a></li>
                  <li>Get real API key from dashboard</li>
                  <li>Set up Call Control application</li>
                  <li>Purchase phone number</li>
                  <li>Update telnyx-config.ts file</li>
                </ol>
                <p className="text-red-700">
                  <strong>Check TELNYX_SETUP_GUIDE.md</strong> for detailed instructions.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info Panel */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Call Control API Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <h4 className="font-medium mb-2">Call Management</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Make/Answer calls</li>
                  <li>• Hold/Resume</li>
                  <li>• Mute/Unmute</li>
                  <li>• Hangup calls</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Transfer Options</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Blind transfer</li>
                  <li>• Attended transfer</li>
                  <li>• Consultation transfer</li>
                  <li>• Bridge calls</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Conference Features</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Create conferences</li>
                  <li>• Join/Leave</li>
                  <li>• Unlimited participants</li>
                  <li>• Server-side mixing</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Advanced Features</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Call recording</li>
                  <li>• DTMF support</li>
                  <li>• Real-time events</li>
                  <li>• No WebRTC needed</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}