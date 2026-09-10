"use client";

import { ArrowLeft } from "lucide-react";

export default function SecondaryPageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <div className="secondary-page"><header className="secondary-header"><a href="/" className="secondary-back" onClick={(event) => { event.preventDefault(); window.location.assign("/"); }}><ArrowLeft size={17} />回小屋</a><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div><span className="secondary-mark">🏠</span></header>{children}</div>;
}
