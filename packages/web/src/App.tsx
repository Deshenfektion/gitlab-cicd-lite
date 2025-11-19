import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { PipelineDetailPage } from './pages/PipelineDetailPage.js';
import { PipelineListPage } from './pages/PipelineListPage.js';

const NAV = [
  { to: '/pipelines', label: 'Pipelines' },
  { to: '/runners', label: 'Runners' },
];

export function App() {
  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <span className="text-sm font-semibold tracking-tight">gitlab-cicd-lite</span>
          <nav className="flex gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm ${
                    isActive
                      ? 'bg-surface-raised text-text-primary'
                      : 'text-text-muted hover:text-text-primary'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/pipelines" replace />} />
          <Route path="/pipelines" element={<PipelineListPage />} />
          <Route path="/pipelines/:id" element={<PipelineDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}
