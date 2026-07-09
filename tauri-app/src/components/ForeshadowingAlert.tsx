interface ForeshadowingAlertProps {
  foreshadowing: ForeshadowingItem[];
}

interface ForeshadowingItem {
  id: string;
  description: string;
  planted_in: string;
  status: "pending" | "resolved";
}

export default function ForeshadowingAlert({ foreshadowing }: ForeshadowingAlertProps) {
  const pending = foreshadowing.filter((f) => f.status === "pending");

  if (pending.length === 0) {
    return null;
  }

  return (
    <div className="foreshadowing-alert">
      <div className="alert-header">
        <span>⚠️</span>
        <span>{pending.length} 条待兑现伏笔</span>
      </div>
      <ul className="alert-list">
        {pending.map((item) => (
          <li key={item.id} className="alert-item">
            <span className="alert-id">{item.id}</span>
            <span className="alert-desc">{item.description}</span>
            <span className="alert-source">埋设于: {item.planted_in}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
