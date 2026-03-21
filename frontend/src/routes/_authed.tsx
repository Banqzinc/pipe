import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from '../components/layout/app-shell';
import { api } from '../api/client';

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    try {
      await api.get('/auth/me');
    } catch {
      throw redirect({ to: '/login' });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
