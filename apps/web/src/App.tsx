import { NavLink, Route, Routes } from 'react-router-dom';
import { AiUsageIndicator } from '@/components/AiUsageIndicator';
import { ChatPanel } from '@/components/ChatPanel';
import { Dashboard } from '@/pages/Dashboard';
import { Incidents } from '@/pages/Incidents';
import { useLiveIncidents, useLiveResponses } from '@/hooks/useSocket';
import { cn } from '@/lib/utils';

function LiveUpdates() {
  useLiveResponses();
  useLiveIncidents();
  return null;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-lg px-3 py-1.5 font-medium transition-colors',
    isActive
      ? 'bg-accent text-accent-foreground'
      : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
  );

export function App() {
  return (
    <div className="min-h-screen bg-background">
      <LiveUpdates />
      <header className="border-b border-border/80 bg-card/70 shadow-sm backdrop-blur-sm">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-4">
          <div>
            <p className="font-display text-lg font-semibold leading-tight">httpbin Monitor</p>
            <p className="text-xs text-muted-foreground">Live HTTP health &amp; latency</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
            <AiUsageIndicator />
            <div className="flex gap-1">
              <NavLink to="/" end className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/incidents" className={navLinkClass}>
                Incidents
              </NavLink>
            </div>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/incidents" element={<Incidents />} />
        </Routes>
      </main>
      <ChatPanel />
    </div>
  );
}
