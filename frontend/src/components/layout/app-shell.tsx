import { Link, useRouterState } from '@tanstack/react-router';

export function AppShell({ children }: { children: React.ReactNode }) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <div className="min-h-screen bg-[#1E1E20]">
      <nav className="border-b border-white/[0.08] bg-[#252528]/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <Link to="/" className="flex items-center gap-2">
                <img src="/pipe-logo.png" alt="Pipe" className="h-7 w-7" />
                <span className="text-lg font-bold text-white">Pipe</span>
              </Link>
              <Link
                to="/"
                className={`text-sm ${currentPath === '/' ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Inbox
              </Link>
              <Link
                to="/workflow"
                className={`text-sm ${currentPath === '/workflow' ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Workflow
              </Link>
              <Link
                to="/settings"
                className={`text-sm ${currentPath === '/settings' ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Settings
              </Link>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto">{children}</main>
    </div>
  );
}
