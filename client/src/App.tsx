import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CallProvider } from "@/contexts/call-context-stable";
import SoftphoneNew from "@/pages/softphone-new";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={SoftphoneNew} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CallProvider>
          <Toaster />
          <Router />
        </CallProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
