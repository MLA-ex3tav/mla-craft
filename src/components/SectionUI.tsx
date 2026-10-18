import type { LucideIcon } from "lucide-react";

export function SectionIntro({ icon: Icon, title, description, detail }: { icon: LucideIcon; title: string; description: string; detail?: string }) {
  return <div className="section-intro"><span className="section-icon"><Icon size={24} strokeWidth={1.7} /></span><div><h2>{title}</h2><p>{description}</p></div>{detail && <span className="section-detail">{detail}</span>}</div>;
}
export function EmptyPanel({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="inner-empty"><span className="section-icon"><Icon size={28} strokeWidth={1.5} /></span><h3>{title}</h3><p>{description}</p></div>;
}
