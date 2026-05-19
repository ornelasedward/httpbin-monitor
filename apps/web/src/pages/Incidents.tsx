import { IncidentsTable } from '@/components/IncidentsTable';

export function Incidents() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Incidents</h1>
      <IncidentsTable />
    </div>
  );
}
