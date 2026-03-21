import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/')({
  component: () => (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Inbox</h1>
      <p className="text-gray-500 mt-2">PR listing coming in next task...</p>
    </div>
  ),
});
