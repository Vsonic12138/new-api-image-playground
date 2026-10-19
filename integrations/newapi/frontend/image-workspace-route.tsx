/* Example host route. This route is installed in the NewAPI PR #2 fork.
 * It is NOT an official Task Plugin payload.
 * Source of truth: new-api/web/src/routes/_authenticated/image-workspace/index.tsx
 */
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Main } from '@/components/layout'
import { isSidebarModuleEnabled } from '@/lib/nav-modules'
import { statusQueryOptions } from '@/lib/status-query'

export const Route = createFileRoute('/_authenticated/image-workspace/')({
  beforeLoad: async ({ context }) => {
    const status = await context.queryClient.fetchQuery(statusQueryOptions).catch(() => null)
    if (status?.image_workspace_enabled !== true ||
        !isSidebarModuleEnabled('chat', 'image-workspace'))
      throw redirect({ to: '/dashboard' })
  },
  component: () => (
    <Main className='p-0'>
      <iframe title='Image Workspace' src='/pg-image-workspace/' className='size-full border-0' referrerPolicy='same-origin' />
    </Main>
  ),
})
