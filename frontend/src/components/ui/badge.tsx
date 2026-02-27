import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors border",
  {
    variants: {
      variant: {
        default:        "bg-gray-100 text-gray-600 border-gray-200",
        red:            "bg-red-100   text-red-700   border-red-200",
        amber:          "bg-amber-100 text-amber-700 border-amber-200",
        green:          "bg-green-100 text-green-700 border-green-200",
        blue:           "bg-blue-100  text-blue-700  border-blue-200",
        purple:         "bg-purple-100 text-purple-700 border-purple-200",
        HIGH:           "bg-red-100   text-red-700   border-red-200",
        MEDIUM:         "bg-amber-100 text-amber-700 border-amber-200",
        LOW:            "bg-green-100 text-green-700 border-green-200",
        RED:            "bg-red-100   text-red-700   border-red-200",
        YELLOW:         "bg-amber-100 text-amber-700 border-amber-200",
        GREEN:          "bg-green-100 text-green-700 border-green-200",
        READY:          "bg-green-100 text-green-700 border-green-200",
        "6_MONTHS":     "bg-amber-100 text-amber-700 border-amber-200",
        NOT_READY:      "bg-red-100   text-red-700   border-red-200",
        pricing_change: "bg-amber-100 text-amber-700 border-amber-200",
        job_posting:    "bg-blue-100  text-blue-700  border-blue-200",
        news:           "bg-gray-100  text-gray-600  border-gray-200",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
