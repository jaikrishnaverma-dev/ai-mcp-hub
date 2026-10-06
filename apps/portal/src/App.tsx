import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Navbar, type NavTab } from './components/Navbar.js';
import { MobileBottomNav } from './components/MobileBottomNav.js';
import { DailyBriefView } from './components/DailyBriefView.js';
import { WorkflowsView } from './components/WorkflowsView.js';
import { CatalogView } from './components/CatalogView.js';
import { DataBrowserView } from './components/DataBrowserView.js';
import { OAuthConsentView } from './components/OAuthConsentView.js';
import { SettingsView } from './components/SettingsView.js';
import { PlaygroundView } from './components/PlaygroundView.js';
import { LoginModal } from './components/LoginModal.js';

import {
  api,
  getActiveUser,
  type UserProfile,
  type Skill,
  type McpTool,
} from './api/client.js';

const PATH_MAP: Record<NavTab, string> = {
  marketplace: '/tools',
  workflows: '/workflows',
  endpoints: '/workflows',
  data: '/explorer',
  brief: '/brief',
  settings: '/settings',
  playground: '/playground',
};

function getActiveTabFromPath(pathname: string): NavTab {
  if (pathname.startsWith('/brief')) return 'brief';
  if (pathname.startsWith('/workflows') || pathname.startsWith('/endpoints')) return 'workflows';
  if (pathname.startsWith('/playground')) return 'playground';
  if (pathname.startsWith('/explorer') || pathname.startsWith('/data')) return 'data';
  if (pathname.startsWith('/settings') || pathname.startsWith('/connect')) return 'settings';
  if (pathname.startsWith('/tools') || pathname.startsWith('/marketplace')) return 'marketplace';
  return 'workflows';
}

export function App() {
  // Light mode by default as requested by user
  const [darkMode, setDarkMode] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isOAuthRoute = location.pathname.startsWith('/oauth/authorize');
  const isPlaygroundRoute = location.pathname.startsWith('/playground');
  const hideChrome = isOAuthRoute || isPlaygroundRoute;
  const activeTab = getActiveTabFromPath(location.pathname);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(getActiveUser());
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginReason, setLoginReason] = useState<string | undefined>(undefined);

  // Apply dark/light class to root
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Load current user profile on startup
  useEffect(() => {
    api.getMe()
      .then((res) => {
        if (res.user) setCurrentUser(res.user);
      })
      .catch(() => {});
  }, []);

  const handleOpenLogin = (reason?: string) => {
    setLoginReason(reason);
    setLoginModalOpen(true);
  };

  const handleLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    setLoginModalOpen(false);
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };

  const handleTabChange = (tab: NavTab) => {
    navigate(PATH_MAP[tab]);
  };

  const handleHarnessSkill = (_skill: Skill) => {
    navigate('/workflows');
  };

  const handleHarnessTool = (_tool: McpTool) => {
    navigate('/workflows');
  };

  return (
    <div className={`flex flex-col bg-[#f4f4f5] dark:bg-background text-foreground ${hideChrome ? "h-screen h-[100dvh] overflow-hidden" : "min-h-screen"}`}>
      {/* Top Navbar (hidden on standalone OAuth consent screen) */}
      {!hideChrome && (
        <Navbar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          currentUser={currentUser}
          onOpenLogin={handleOpenLogin}
          onLogout={handleLogout}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
      )}

      {/* Main Content Area — React Router Routes */}
      <main className={`flex-1 min-h-0 ${hideChrome ? 'h-full max-h-full flex flex-col p-0 overflow-hidden' : 'pb-24 sm:pb-12'}`}>
        <Routes>
          <Route path="/" element={<Navigate to="/tools" replace />} />
          <Route
            path="/tools"
            element={
              <CatalogView
                currentUser={currentUser}
                onRequireAuth={handleOpenLogin}
                onHarnessSkill={handleHarnessSkill}
                onHarnessTool={handleHarnessTool}
              />
            }
          />
          <Route path="/marketplace" element={<Navigate to="/tools" replace />} />
          <Route
            path="/brief"
            element={
              <DailyBriefView
                currentUser={currentUser}
                onRequireAuth={handleOpenLogin}
                onNavigateToTasks={() => navigate('/explorer')}
              />
            }
          />
          <Route
            path="/workflows"
            element={
              <WorkflowsView
                currentUser={currentUser}
                onRequireAuth={handleOpenLogin}
              />
            }
          />
          <Route
            path="/playground"
            element={
              <PlaygroundView
                currentUser={currentUser}
                onRequireAuth={handleOpenLogin}
              />
            }
          />
          <Route path="/endpoints" element={<Navigate to="/workflows" replace />} />
          <Route
            path="/explorer"
            element={
              <DataBrowserView
                currentUser={currentUser}
                onRequireAuth={handleOpenLogin}
              />
            }
          />
          <Route path="/data" element={<Navigate to="/explorer" replace />} />
          <Route
            path="/oauth/authorize"
            element={
              <OAuthConsentView
                currentUser={currentUser}
                onRequireAuth={handleOpenLogin}
              />
            }
          />
          <Route
            path="/settings"
            element={
              <SettingsView
                currentUser={currentUser}
                onRequireAuth={handleOpenLogin}
              />
            }
          />
          <Route path="/connect" element={<Navigate to="/settings" replace />} />
          <Route path="*" element={<Navigate to="/tools" replace />} />
        </Routes>
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (< 768px, hidden on OAuth screen) */}
      {!hideChrome && (
        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
      )}

      {/* Auth Gate Login Modal */}
      <LoginModal
        open={loginModalOpen}
        onOpenChange={setLoginModalOpen}
        onSuccess={handleLoginSuccess}
        reason={loginReason}
      />
    </div>
  );
}

export default App;

