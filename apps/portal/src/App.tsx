import { useState, useEffect } from 'react';
import { Server, Database, LayoutDashboard } from 'lucide-react';
import { Navbar } from './components/Navbar.js';
import { DailyBriefView } from './components/DailyBriefView.js';
import { EndpointsView } from './components/EndpointsView.js';
import { DataBrowserView } from './components/DataBrowserView.js';
import { LoginModal } from './components/LoginModal.js';
import { api, setActiveUser, type UserProfile } from './api/client.js';

export function App() {
  const [activeTab, setActiveTab] = useState<'brief' | 'endpoints' | 'data'>('brief');
  const [darkMode, setDarkMode] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Initialize theme
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [darkMode]);

  // Load current user profile & all users
  const loadUsers = async () => {
    try {
      const [meRes, allRes] = await Promise.all([
        api.getMe().catch(() => null),
        api.getUsers().catch(() => ({ users: [] })),
      ]);
      if (meRes?.user) {
        setCurrentUser(meRes.user);
      }
      setUsersList(allRes.users || []);
    } catch (err) {
      console.error('Failed to load user session', err);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSelectUser = (user: UserProfile) => {
    setActiveUser(user.id);
    setCurrentUser(user);
    // Reload data for the new user context
    window.location.reload();
  };

  const handleLoginNewUser = async (email: string, name: string) => {
    const res = await api.login({ email, name });
    setActiveUser(res.user.id);
    setCurrentUser(res.user);
    await loadUsers();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors">
      <Navbar
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        currentUser={currentUser}
        onOpenAuth={() => setShowLoginModal(true)}
      />

      <main className="container flex-1 py-6 space-y-6 max-w-7xl">
        {/* Navigation Tabs */}
        <div className="flex border-b border-border/80 gap-1 pb-px">
          <button
            onClick={() => setActiveTab('brief')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'brief'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Daily Brief
          </button>

          <button
            onClick={() => setActiveTab('endpoints')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'endpoints'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Server className="w-4 h-4" />
            MCP Server & Endpoints
          </button>

          <button
            onClick={() => setActiveTab('data')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'data'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Database className="w-4 h-4" />
            Users' Data Explorer
          </button>
        </div>

        {/* View Switcher */}
        {activeTab === 'brief' && (
          <DailyBriefView
            onNavigateToTasks={() => setActiveTab('data')}
            onNavigateToBlockers={() => setActiveTab('data')}
          />
        )}

        {activeTab === 'endpoints' && <EndpointsView />}

        {activeTab === 'data' && <DataBrowserView />}
      </main>

      {/* Login & User Switcher Modal */}
      {showLoginModal && (
        <LoginModal
          currentUser={currentUser}
          users={usersList}
          onSelectUser={handleSelectUser}
          onLoginNewUser={handleLoginNewUser}
          onClose={() => setShowLoginModal(false)}
        />
      )}

      {/* Footer */}
      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        Assistant AI-Native Process Manager · Connected to MongoDB Replica Set & MCP Streamable Transport
      </footer>
    </div>
  );
}

export default App;
