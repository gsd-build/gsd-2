import { Skeleton } from "@/components/ui/skeleton";

type PanelVariant = "Sidebar" | "Milestone" | "Slice Detail" | "Active Task" | "Chat";

interface PanelSkeletonProps {
  variant: PanelVariant;
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Skeleton className="h-8 w-8 rounded bg-navy-700" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-full bg-navy-700" />
        <Skeleton className="h-4 w-full bg-navy-700" />
        <Skeleton className="h-4 w-full bg-navy-700" />
        <Skeleton className="h-4 w-full bg-navy-700" />
      </div>
    </div>
  );
}

function MilestoneSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-32 bg-navy-700" />
        <Skeleton className="h-2 flex-1 bg-navy-700" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-3 w-3 rounded-full bg-navy-700" />
          <Skeleton className="h-3 w-16 bg-navy-700" />
          <Skeleton className="h-2 flex-1 bg-navy-700" />
        </div>
      ))}
    </div>
  );
}

function SliceDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Skeleton className="h-4 w-full bg-navy-700" />
      <Skeleton className="h-4 w-3/4 bg-navy-700" />
      <Skeleton className="h-4 w-1/2 bg-navy-700" />
      <div className="flex flex-col gap-4 pt-4">
        <Skeleton className="h-8 w-full bg-navy-700" />
        <Skeleton className="h-8 w-full bg-navy-700" />
      </div>
    </div>
  );
}

function ActiveTaskSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-4 rounded-full bg-navy-700" />
        <Skeleton className="h-4 w-32 bg-navy-700" />
      </div>
      <Skeleton className="h-4 w-full bg-navy-700" />
      <Skeleton className="h-4 w-full bg-navy-700" />
      <Skeleton className="h-4 w-3/4 bg-navy-700" />
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="flex flex-1 flex-col justify-between p-4">
      <div className="flex flex-col gap-4">
        <div className="flex justify-start">
          <Skeleton className="h-8 w-3/4 rounded bg-navy-700" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-8 w-2/3 rounded bg-navy-700" />
        </div>
        <div className="flex justify-start">
          <Skeleton className="h-8 w-1/2 rounded bg-navy-700" />
        </div>
      </div>
      <Skeleton className="mt-4 h-8 w-full rounded bg-navy-700" />
    </div>
  );
}

const SKELETON_MAP: Record<PanelVariant, () => React.JSX.Element> = {
  Sidebar: SidebarSkeleton,
  Milestone: MilestoneSkeleton,
  "Slice Detail": SliceDetailSkeleton,
  "Active Task": ActiveTaskSkeleton,
  Chat: ChatSkeleton,
};

export function PanelSkeleton({ variant }: PanelSkeletonProps) {
  const SkeletonComponent = SKELETON_MAP[variant] ?? SidebarSkeleton;
  return <SkeletonComponent />;
}
