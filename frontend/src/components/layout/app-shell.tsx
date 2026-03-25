import { Link, useRouterState } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

const navLinks = [
  { to: '/' as const, label: 'Inbox', match: (p: string) => p === '/' },
  { to: '/workflow' as const, label: 'Workflow', match: (p: string) => p === '/workflow' },
  { to: '/settings' as const, label: 'Settings', match: (p: string) => p === '/settings' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <Link to="/">
                <img src="/pipe-logo.png" alt="Pipe" className="h-8 w-8" />
              </Link>
              {navLinks.map((link) => {
                const active = link.match(currentPath);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={cn(
                      'relative text-sm transition-colors duration-150 py-4',
                      active
                        ? 'text-foreground font-medium after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary after:rounded-full'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6">{children}</main>
    </div>
  );
}
