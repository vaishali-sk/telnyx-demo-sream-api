import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type TelnyxConfig } from "@shared/schema";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import {TELNYX_CONFIG} from "../../../telnyx-config.ts";

export function Settings() {
  const { toast } = useToast();


  const { data: telnyxConfig, isLoading } = useQuery<TelnyxConfig>({
    queryKey: ['/api/telnyx-config'],
  });

  const [formData, setFormData] = useState({
    apiKey: TELNYX_CONFIG.API_KEY,
    applicationId: TELNYX_CONFIG.APPLICATION_ID,
    sipConnectionId: TELNYX_CONFIG.SIP_CONNECTION_ID,
    username: TELNYX_CONFIG.USERNAME,
    password: TELNYX_CONFIG.PASSWORD,
    fromNumber: TELNYX_CONFIG.FROM_NUMBER
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (config: typeof formData) => {
      const response = await apiRequest('POST', '/api/telnyx-config', config);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/telnyx-config'] });
      toast({
        title: "Success",
        description: "Telnyx configuration saved successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save Telnyx configuration",
        variant: "destructive",
      });
    }
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/telnyx-test');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.success ? "Success" : "Error",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to test connection",
        variant: "destructive",
      });
    }
  });

  useEffect(() => {
    if (telnyxConfig) {
      setFormData({
        apiKey: TELNYX_CONFIG.API_KEY,
        applicationId: TELNYX_CONFIG.APPLICATION_ID,
        sipConnectionId: TELNYX_CONFIG.SIP_CONNECTION_ID,
        username: TELNYX_CONFIG.USERNAME,
        password: TELNYX_CONFIG.PASSWORD,
        fromNumber: TELNYX_CONFIG.FROM_NUMBER
      });
    }
  }, [telnyxConfig]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    saveConfigMutation.mutate(formData);
  };

  const handleTestConnection = () => {
    testConnectionMutation.mutate();
  };

  const handleResetToDefaults = () => {
    setFormData({
      apiKey: TELNYX_CONFIG.API_KEY,
      applicationId: TELNYX_CONFIG.APPLICATION_ID,
      sipConnectionId: TELNYX_CONFIG.SIP_CONNECTION_ID,
      username: TELNYX_CONFIG.USERNAME,
      password: TELNYX_CONFIG.PASSWORD,
      fromNumber: TELNYX_CONFIG.FROM_NUMBER
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-8">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-4xl mx-auto">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Telnyx Configuration</h2>
        
        {/* Connection Status */}
        <Alert className="mb-6 border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">
            <div className="flex items-center justify-between">
              <span>Connected to Telnyx</span>
              <Badge variant="outline" className="text-green-700 border-green-300">
                SIP Connection ID: {telnyxConfig?.sipConnectionId}
              </Badge>
            </div>
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* API Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">API Configuration</h3>
            
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={formData.apiKey}
                onChange={(e) => handleInputChange('apiKey', e.target.value)}
                placeholder="Enter API Key"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="applicationId">Application ID</Label>
              <Input
                id="applicationId"
                value={formData.applicationId}
                onChange={(e) => handleInputChange('applicationId', e.target.value)}
                placeholder="Enter Application ID"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="fromNumber">From Number</Label>
              <Input
                id="fromNumber"
                type="tel"
                value={formData.fromNumber}
                onChange={(e) => handleInputChange('fromNumber', e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>
          </div>

          {/* SIP Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">SIP Configuration</h3>
            
            <div className="space-y-2">
              <Label htmlFor="sipConnectionId">SIP Connection ID</Label>
              <Input
                id="sipConnectionId"
                value={formData.sipConnectionId}
                onChange={(e) => handleInputChange('sipConnectionId', e.target.value)}
                placeholder="Enter SIP Connection ID"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                placeholder="Enter Username"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                placeholder="Enter Password"
              />
            </div>
          </div>
        </div>

        {/* Audio Settings */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Audio Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="microphone">Microphone</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select microphone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default - Built-in Microphone</SelectItem>
                  <SelectItem value="usb">USB Headset</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="speaker">Speaker</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select speaker" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default - Built-in Speakers</SelectItem>
                  <SelectItem value="usb">USB Headset</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex space-x-4">
          <Button
            onClick={handleSave}
            disabled={saveConfigMutation.isPending}
            className="bg-primary hover:bg-primary/90"
          >
            {saveConfigMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Configuration
          </Button>
          
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testConnectionMutation.isPending}
          >
            {testConnectionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Test Connection
          </Button>
          
          <Button
            variant="outline"
            onClick={handleResetToDefaults}
          >
            Reset to Defaults
          </Button>
        </div>
      </div>
    </div>
  );
}
