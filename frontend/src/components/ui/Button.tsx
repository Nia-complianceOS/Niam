import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-[10px] text-[13px] font-semibold transition-all disabled:opacity-60 disabled:cursor-default',
  {
    variants: {
      variant: {
        primary: 'bg-grad-primary text-white shadow-[0_4px_18px_rgba(91,140,255,0.28)] hover:-translate-y-px hover:shadow-[0_6px_22px_rgba(91,140,255,0.4)]',
        ghost: 'bg-white/5 border border-border text-text hover:bg-white/[0.09]',
      },
      size: {
        default: 'px-4 py-2.5',
        block: 'w-full px-4 py-2.5',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}