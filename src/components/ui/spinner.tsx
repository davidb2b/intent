import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

type SpinnerProps = React.ComponentProps<"svg"> & {
  label?: string
}

function Spinner({ className, label = "Carregando", ...props }: SpinnerProps) {
  return (
    <Loader2Icon
      aria-label={label}
      className={cn("size-4 animate-spin", className)}
      data-slot="spinner"
      role="status"
      {...props}
    />
  )
}

export { Spinner }
