import {
  vocabularyForPlacement,
  type VocabularyPlacement,
} from './explorer-vocabulary.js';

export function VocabularyHelp({
  label,
  placement,
}: {
  label: string;
  placement: VocabularyPlacement;
}) {
  const concepts = vocabularyForPlacement(placement);

  return (
    <details className="vocabulary-help" data-vocabulary-help={placement}>
      <summary>{label}</summary>
      <div className="vocabulary-help-content">
        {concepts.map((concept) => (
          <section key={concept.id} data-vocabulary-concept={concept.id}>
            <p className="vocabulary-friendly-term">{concept.friendlyTerm}</p>
            <p className="vocabulary-technical-term">Technical term: <strong>{concept.technicalTerm}</strong></p>
            <p className="vocabulary-explanation">{concept.explanation}</p>
          </section>
        ))}
      </div>
    </details>
  );
}
