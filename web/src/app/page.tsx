'use client';
import Dashboard from '@/components/Dashboard';

export default function Home() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  return <Dashboard apiUrl={apiUrl} />;
}