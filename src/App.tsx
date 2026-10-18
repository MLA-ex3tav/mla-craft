import { lazy, Suspense, useEffect, useSyncExternalStore } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { Boxes, Server, Settings } from "lucide-react";
import { cx } from "./lib/cx";
import ServersPage from "./pages/ServersPage";
import AmbientBackground, { useBackgroundMotion } from "./components/AmbientBackground";
import { ensureServerLogs } from "./lib/serverLogs";
import { finishStartup } from "./lib/startup";
import { isAuthenticated, isDesktop, subscribeAuth } from "./lib/transport";

import ServerMenuProvider from "./components/ServerMenu";
import SidebarServers from "./components/SidebarServers";
import LoginScreen from "./components/LoginScreen";
import FolderPicker from "./components/FolderPicker";
import UpdateBanner from "./components/UpdateBanner";
import { startUpdateCheck } from "./lib/updater";

const ServerPage = lazy(() => import("./pages/ServerPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ContentPage = lazy(() => import("./pages/ContentPage"));

const nav = [
  { to: "/", label: "Servidores", icon: Server, end: true },
  { to: "/content", label: "Contenido", icon: Boxes, end: false },
  { to: "/settings", label: "Ajustes", icon: Settings, end: false },
];

function App() {
  const motion = useBackgroundMotion();
  const authed = useSyncExternalStore(subscribeAuth, isAuthenticated);

  useEffect(() => {
    void finishStartup();
    ensureServerLogs();
    startUpdateCheck();
  }, []);

  if (!isDesktop && !authed) {
    return (
      <>
        <AmbientBackground playing={motion.playing} />
        <div className="app-shell flex h-full w-full">
          <main className="workspace flex-1 overflow-hidden">
            <LoginScreen />
          </main>
        </div>
        <FolderPicker />
      </>
    );
  }

  return (
    <ServerMenuProvider>
      <AmbientBackground playing={motion.playing} />
      <div className="app-shell flex h-full w-full">
        <aside className="sidebar sidebar-compact flex shrink-0 flex-col">
          <div className="brand" title="MLA Server" aria-label="MLA Server">
            <div className="brand-mark brand-mark-simple"><img src="/branding/mla-server-ms-stone.png" width="36" height="36" alt="" /></div>
          </div>
          <nav aria-label="Navegación principal" className="sidebar-primary flex flex-col gap-2 px-1">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} title={label} aria-label={label}
                className={({ isActive }) => cx("nav-item flex items-center gap-3 rounded-xl px-3 text-sm", isActive ? "active" : "text-muted hover:bg-surface-2 hover:text-fg")}>
                <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
              </NavLink>
            ))}
          </nav>
          <SidebarServers />
        </aside>
        <main className="workspace flex min-w-0 flex-1 flex-col overflow-hidden">
          <UpdateBanner />
          <div className="min-h-0 flex-1">
            <Suspense fallback={<p className="p-6 text-sm text-muted" role="status">Cargando sección…</p>}>
            <Routes>
              <Route path="/" element={<ServersPage />} />
              <Route path="/server/:id" element={<ServerPage />} />
              <Route path="/content" element={<ContentPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
            </Suspense>
          </div>
        </main>
      </div>
      <FolderPicker />
    </ServerMenuProvider>
  );
}

export default App;
