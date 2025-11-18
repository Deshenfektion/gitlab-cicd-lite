export function Spinner({ label = 'Loading' }: { readonly label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-text-muted">
      <span className="size-3 animate-spin rounded-full border-2 border-border-subtle border-t-text-muted" />
      {label}
    </div>
  );
}
