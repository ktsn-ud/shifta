import { cva } from "class-variance-authority";

export const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold tracking-[0.03em] whitespace-nowrap transition-[color,background-color,border-color,box-shadow] focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(0_91_191_/_0.22)] [a]:hover:bg-primary/92",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/85",
        destructive:
          "border-destructive/25 bg-destructive/12 text-destructive focus-visible:ring-destructive/20 [a]:hover:bg-destructive/20",
        outline:
          "border-border bg-background text-foreground [a]:hover:bg-muted [a]:hover:text-foreground",
        ghost: "bg-accent/70 text-accent-foreground [a]:hover:bg-accent",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);
