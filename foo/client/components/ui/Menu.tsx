import type { ReactNode } from 'react';

interface MenuProps {
  children: ReactNode;
  className?: string;
  baseClass?: string;
}

export function Menu({ children, className, baseClass = 'menu' }: MenuProps) {
  const classes = [baseClass, 'glass-surface'];
  if (className) {
    classes.push(className);
  }
  return <div className={classes.join(' ')}>{children}</div>;
}
