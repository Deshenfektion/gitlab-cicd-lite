interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-border-subtle px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description === undefined ? null : (
        <p className="mt-1 text-sm text-text-muted">{description}</p>
      )}
      {action === undefined ? null : <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
