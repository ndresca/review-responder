'use client'

export function LogoFull({ className }: { className?: string }) {
  return (
    <img
      src="/logo-full.png"
      alt="Autoplier"
      className={className}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}
