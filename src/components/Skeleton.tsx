interface Props {
  className?: string
}

export default function Skeleton({ className = '' }: Props) {
  return <div className={`animate-pulse bg-gray-800 rounded ${className}`} />
}
