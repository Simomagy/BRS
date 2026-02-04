'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const MainLayout = dynamic(() => import('@/components/layout/MainLayout'), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-screen bg-background flex items-center justify-center">
      <Skeleton className='w-full h-full' />
    </div>
  ),
});

const RenderOutputPage = dynamic(() => import('./render-output/page'), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-screen bg-background flex items-center justify-center">
      <Skeleton className='w-full h-full' />
    </div>
  ),
});

function HomeContent() {
  const searchParams = useSearchParams();
  const windowType = searchParams.get('window');

  if (windowType === 'render-output') {
    return <RenderOutputPage />;
  }

  return <MainLayout />;
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <Skeleton className='w-full h-full' />
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
