export default function Complaints() {
  return <Placeholder title="Complaints" />;
}

function Placeholder({ title }) {
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-nuqe-muted text-sm">{title} — coming soon</p>
    </div>
  );
}
