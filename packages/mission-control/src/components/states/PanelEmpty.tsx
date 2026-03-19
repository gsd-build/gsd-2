import { Inbox } from "lucide-react";

interface PanelEmptyProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
}

export function PanelEmpty({ icon, title, description }: PanelEmptyProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-4">
      <div className="mb-4 text-slate-500">
        {icon ?? <Inbox className="h-8 w-8" />}
      </div>
      <h3 className="font-display text-sm font-bold uppercase tracking-wider text-slate-400">
        {title}
      </h3>
      <p className="mt-2 max-w-48 text-center font-mono text-xs text-slate-500">
        {description}
      </p>
    </div>
  );
}
