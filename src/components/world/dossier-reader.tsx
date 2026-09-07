import { useEffect, useState } from "react";

type Chapter = { no: string; title: string; kicker: string };
type ReaderDestination = { id: string; label: string };

/** Native anchors keep the archive navigable before hydration, too. */
export function DossierContents({ sections }: { sections: readonly Chapter[] }) {
  return (
    <nav className="dossier-contents" aria-label="人物資料の章">
      {sections.map((section) => (
        <a key={section.no} href={`#character-section-${section.no}`}>
          <span className="dossier-contents-number">{section.no}</span>
          <span className="dossier-contents-copy">
            <small>{section.kicker}</small>
            <b>{section.title}</b>
          </span>
          <span className="dossier-contents-arrow" aria-hidden="true">
            ↗
          </span>
        </a>
      ))}
    </nav>
  );
}

export function DossierReader({
  name,
  identity = false,
  forms = false,
}: {
  name: string;
  identity?: boolean;
  forms?: boolean;
}) {
  const [active, setActive] = useState("dossier-profile");
  const destinations: ReaderDestination[] = [
    { id: "dossier-profile", label: "人物紹介" },
    ...(identity ? [{ id: "identity-records", label: "関連記録" }] : []),
    { id: "dossier-index", label: "人物資料" },
    ...(forms ? [{ id: "form-records", label: "変身記録" }] : []),
  ];
  const ids = destinations.map((item) => item.id).join(",");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const current = [...entries].reverse().find((entry) => entry.isIntersecting);
        if (current) setActive(current.target.id);
      },
      { rootMargin: "-22% 0px -70% 0px", threshold: 0 },
    );
    for (const id of ids.split(",")) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [ids]);

  return (
    <nav className="dossier-reader" aria-label={`${name}の資料内を移動`}>
      <span className="dossier-reader-name">{name}</span>
      <div className="dossier-reader-links">
        {destinations.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={active === item.id ? "location" : undefined}
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
