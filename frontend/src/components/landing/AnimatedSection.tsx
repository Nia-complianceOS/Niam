import { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface AnimatedSectionProps {
  children: ReactNode
  delay?: number
  direction?: 'up' | 'left' | 'right' | 'none'
  className?: string
}

export function AnimatedSection({ 
  children, 
  delay = 0, 
  direction = 'up',
  className = ''
}: AnimatedSectionProps) {
  const getVariants = () => {
    switch (direction) {
      case 'up':
        return { hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0 } }
      case 'left':
        return { hidden: { opacity: 0, x: -40 }, visible: { opacity: 1, x: 0 } }
      case 'right':
        return { hidden: { opacity: 0, x: 40 }, visible: { opacity: 1, x: 0 } }
      case 'none':
      default:
        return { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    }
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.7, delay, ease: [0.25, 0.1, 0.25, 1] }}
      variants={getVariants()}
      className={className}
    >
      {children}
    </motion.div>
  )
}
