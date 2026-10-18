import { memo } from "react";
import { DOG_DOSSIER } from "./world-dog-dossier-data";

/* The owner's unchanged 『犬』 dossier, now in the post-RISING file. */
export const DogDossierProse = memo(function DogDossierProse({ id }: { id?: string }) {
  return (
    <div className="world-mystery-reading world-dossier-reading" id={id}>
      <p className="world-dossier-title">
        <strong>{DOG_DOSSIER.title}</strong>
        <span>{DOG_DOSSIER.subtitle}</span>
      </p>
      {DOG_DOSSIER.sections.map((section, index) => (
        <section
          className={`world-mystery-chapter${"divider" in section && section.divider ? " world-dossier-divided" : ""}`}
          key={section.heading}
        >
          <h4>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {section.heading}
          </h4>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 24)}>{paragraph}</p>
          ))}
        </section>
      ))}
      <p className="world-mystery-end" aria-hidden="true">
        END OF RECORD
      </p>
    </div>
  );
});
