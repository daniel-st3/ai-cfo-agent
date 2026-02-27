import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:     "bg-white text-black hover:bg-zinc-200 border border-white",
        outline:     "border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white",
        ghost:       "text-zinc-400 hover:text-white hover:bg-zinc-900",
        destructive: "bg-red-900 text-red-100 hover:bg-red-800 border border-red-800",
        accent:      "bg-blue-600 text-white hover:bg-blue-500 border border-blue-500",
        success:     "bg-green-900 text-green-100 hover:bg-green-800 border border-green-800",
      },
      size: {
        default: "h-9 px-4 py-2 rounded-md",
        sm:      "h-7 px-3 text-xs rounded",
        lg:      "h-11 px-6 rounded-lg text-base",
        icon:    "h-9 w-9 rounded-md",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
