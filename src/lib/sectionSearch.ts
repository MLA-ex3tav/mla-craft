import { createContext, useContext, useState } from "react";
export const SectionSearchContext = createContext<{ query: string; setQuery: (value: string) => void; toolbarTarget?: HTMLDivElement | null } | null>(null);
export function useSectionSearch() {
  const shared = useContext(SectionSearchContext);
  const [local, setLocal] = useState("");
  return { query: shared?.query ?? local, setQuery: shared?.setQuery ?? setLocal, shared: shared !== null, toolbarTarget: shared?.toolbarTarget ?? null };
}
export function matchesSearch(text: string, query: string) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return normalize(text).includes(normalize(query.trim()));
}
