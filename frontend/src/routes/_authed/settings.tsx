import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/settings')({
  component: () => (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="text-gray-500 mt-2">Coming soon...</p>
    </div>
  ),
});
