import { Button } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu.tsx';

interface SplitButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  menuItems: Array<{ label: string; onClick: () => void }>;
}

export function SplitButton({ label, onClick, disabled, menuItems }: SplitButtonProps) {
  return (
    <div className="relative inline-flex">
      <Button
        size="sm"
        className="rounded-r-none"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        disabled={disabled}
      >
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex items-center justify-center rounded-l-none rounded-r-lg border-l border-primary-foreground/20 bg-primary px-1.5 py-1.5 text-primary-foreground hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50 transition-colors"
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
        >
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="shadow-lg shadow-black/30"
        >
          {menuItems.map((item) => (
            <DropdownMenuItem
              key={item.label}
              onClick={(e) => {
                e.stopPropagation();
                item.onClick();
              }}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
