import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useStore, isDarkTheme } from "@/store/useStore"

const Toaster = (props: ToasterProps) => {
  const theme = useStore((s) => s.theme)

  return (
    <Sonner
      theme={isDarkTheme(theme) ? "dark" : "light"}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-[var(--success)]" />,
        info: <InfoIcon className="size-4 text-[var(--info)]" />,
        warning: <TriangleAlertIcon className="size-4 text-[var(--warning)]" />,
        error: <OctagonXIcon className="size-4 text-[var(--danger)]" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border-[var(--border-hover)] !bg-[var(--bg-popover)] !text-[var(--text-primary)] !shadow-[var(--shadow-lg)] !font-sans",
          description: "!text-[var(--text-secondary)]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
