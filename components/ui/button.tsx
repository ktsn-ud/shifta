"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-semibold tracking-[0.01em] whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] outline-none select-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/25 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(23_27_33_/_0.16)] hover:bg-primary/92 hover:shadow-[0_4px_12px_rgb(0_91_191_/_0.28)] active:bg-primary/85",
        outline:
          "border-border bg-background text-foreground shadow-[0_1px_2px_rgb(23_27_33_/_0.08)] hover:border-primary/35 hover:bg-accent/45 hover:text-foreground active:bg-accent/70 aria-expanded:border-primary/35 aria-expanded:bg-accent/70 aria-expanded:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_1px_2px_rgb(23_27_33_/_0.08)] hover:bg-secondary/85 active:bg-secondary/75 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80 aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_1px_2px_rgb(180_35_24_/_0.24)] hover:bg-destructive/92 hover:text-destructive-foreground active:bg-destructive/82 active:text-destructive-foreground focus-visible:border-destructive/60 focus-visible:ring-destructive/25",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 gap-1.5 px-4 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),8px)] px-2 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-[min(var(--radius-md),10px)] px-3 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-11 gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-10",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),8px)] in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-md",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
