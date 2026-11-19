import Logo from './Logo';

export default function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6" style={{ backgroundColor: 'var(--color-bg-page)' }}>
      <Logo size="lg" />
      <div className="spinner spinner-lg" />
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
    </div>
  );
}
