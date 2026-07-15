/** Glass surface card — dark premium theme */
export default function Card({ children, className = '', as: Tag = 'div', ...props }) {
  const Component = Tag
  return (
    <Component
      className={className}
      {...props}
    >
      {children}
    </Component>
  )
}
