import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe } from "@workspace/api-client-react";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Home from "@/pages/home";
import Notifications from "@/pages/notifications";
import Instructions from "@/pages/instructions";
import Profile from "@/pages/profile";
import Reports from "@/pages/reports";
import Volunteer from "@/pages/volunteer";
import { Layout } from "@/components/layout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        if (error && typeof error === "object" && "status" in error) {
          const status = (error as { status: number }).status;
          if (status === 401 || status === 403 || status === 404) return false;
        }
        return failureCount < 2;
      },
      staleTime: 30_000,
    },
  },
});

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: user, isLoading, isError } = useGetMe();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (isError || !user?.isAuthenticated) {
      setLocation("/login");
      return;
    }
    if (user.role === "volunteer") {
      setLocation("/volunteer");
    }
  }, [isLoading, isError, user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  if (isError || !user?.isAuthenticated || user.role === "volunteer") {
    return null;
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function VolunteerRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: user, isLoading, isError } = useGetMe();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (isError || !user?.isAuthenticated) {
      setLocation("/login");
      return;
    }
    if (user.role === "admin") {
      setLocation("/");
    }
  }, [isLoading, isError, user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  if (isError || !user?.isAuthenticated || user.role === "admin") {
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/volunteer">
        <VolunteerRoute component={Volunteer} />
      </Route>
      <Route path="/">
        <AdminRoute component={Home} />
      </Route>
      <Route path="/notifications">
        <AdminRoute component={Notifications} />
      </Route>
      <Route path="/instructions">
        <AdminRoute component={Instructions} />
      </Route>
      <Route path="/profile">
        <AdminRoute component={Profile} />
      </Route>
      <Route path="/reports">
        <AdminRoute component={Reports} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
