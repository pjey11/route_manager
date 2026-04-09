import { Link, useLocation } from "wouter";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { LogOut, Map, Bell, Send, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useGetMe();
  const logoutMutation = useLogout();
  const [location] = useLocation();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        window.location.href = "/login";
      }
    });
  };

  const navItems = [
    { href: "/", label: "Sai Trips", icon: Map },
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/instructions", label: "Instructions", icon: Send },
    { href: "/profile", label: "Profile", icon: UserCircle },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card">
        <div className="p-6">
          <h1 className="text-2xl font-serif font-bold text-primary">Sai Trips</h1>
          <p className="text-sm text-muted-foreground mt-1 tracking-wide">Daily Route Manager</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors cursor-pointer ${
                location === item.href 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}>
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </div>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="mb-4 px-2">
            <p className="text-sm font-medium truncate">{user?.email}</p>
          </div>
          <Button 
            variant="outline" 
            className="w-full justify-start text-muted-foreground" 
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0 overflow-auto">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card sticky top-0 z-10">
          <h1 className="text-xl font-serif font-bold text-primary">Sai Trips</h1>
          <Button variant="ghost" size="icon" onClick={handleLogout} disabled={logoutMutation.isPending}>
            <LogOut className="w-5 h-5 text-muted-foreground" />
          </Button>
        </header>
        
        <div className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card flex justify-around p-2 pb-safe z-50">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div className={`flex flex-col items-center p-2 rounded-lg min-w-[64px] ${
              location === item.href ? "text-primary" : "text-muted-foreground"
            }`}>
              <item.icon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </div>
          </Link>
        ))}
      </nav>
    </div>
  );
}
