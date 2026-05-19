import { Link, Route, Routes } from 'react-router-dom';
import { Dashboard } from '@/pages/Dashboard';
import { Incidents } from '@/pages/Incidents';
import { useLiveIncidents, useLiveResponses } from '@/hooks/useSocket';

function LiveUpdates() {
  useLiveResponses();
  useLiveIncidents();
  return null;
}

export function App() {
  return (
    <div className="min-h-screen">
      <LiveUpdates />
      <header className="border-b">
        <nav className="mx-auto flex max-w-5xl gap-4 p-4 text-sm">
          <Link to="/" className="font-medium hover:underline">
            Dashboard
          </Link>
          <Link to="/incidents" className="font-medium hover:underline">
            Incidents
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/incidents" element={<Incidents />} />
        </Routes>
      </main>
    </div>
  );
}
