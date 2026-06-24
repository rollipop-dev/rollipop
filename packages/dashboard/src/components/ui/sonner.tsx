import { CheckCircle2, CircleX, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CheckCircle2 className="size-4 text-emerald-500" />,
        error: <CircleX className="size-4 text-red-500" />,
        warning: <TriangleAlert className="size-4 text-amber-500" />,
        info: <Info className="size-4 text-sky-500" />,
        loading: <LoaderCircle className="size-4 animate-spin text-muted-foreground" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}
