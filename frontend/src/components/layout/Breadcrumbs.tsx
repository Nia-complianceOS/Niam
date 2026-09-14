import { Link, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

const ROUTE_NAMES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/': 'Home',
  '/gaps': 'Compliance Gaps',
  '/graph': 'Compliance Graph',
  '/repositories': 'Repositories',
  '/vendors': 'Vendors',
  '/regulations': 'Regulations',
  '/policies': 'Policies',
  '/pull-requests': 'Pull Requests',
  '/audit': 'Audit Trail',
  '/settings': 'Settings',
}

export function Breadcrumbs() {
  const location = useLocation()
  
  if (location.pathname === '/' || location.pathname === '/dashboard') {
    return (
      <div className="flex items-center gap-2 text-xs font-medium text-text-tertiary">
        <span className="text-text-primary font-serif font-medium text-sm">Dashboard</span>
      </div>
    )
  }
  
  const pathnames = location.pathname.split('/').filter((x) => x)
  
  const items = [
    { name: 'Dashboard', path: '/dashboard' }
  ]
  
  let currentPath = ''
  pathnames.forEach((name) => {
    currentPath += `/${name}`
    items.push({
      name: ROUTE_NAMES[currentPath] || name,
      path: currentPath
    })
  })

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `https://niam.dev${item.path}`,
    })),
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <ol className="flex items-center text-xs font-medium text-text-secondary">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          
          return (
            <li key={item.path} className="flex items-center">
              {isLast ? (
                <span className="text-text-primary font-medium" aria-current="page">
                  {item.name}
                </span>
              ) : (
                <>
                  <Link
                    to={item.path}
                    className="hover:text-text-primary transition-colors"
                  >
                    {item.name}
                  </Link>
                  <ChevronRight size={12} className="mx-1.5 text-text-tertiary" />
                </>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
