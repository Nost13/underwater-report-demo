import type { ReactNode } from 'react';
import {
  deriveFoulingCondition,
  deriveFoulingRating,
  deriveFoulingType,
  deriveObservedRating,
} from '../domain/conditions';
import type { Condition, ObservedLevel, ObservedType } from '../domain/types';
import type { ConditionPatch } from './conditionDefaults';

interface ConditionEditorProps {
  ariaPrefix: string;
  condition: Condition;
  onPatch: (patch: ConditionPatch) => void;
}

const observedLevels: Exclude<ObservedLevel, ''>[] = [
  'Normal / Trace',
  'Minor Observation',
  'Notable Observation',
  'Significant Observation',
  'Critical Observation',
];

const observedTypes: Exclude<ObservedType, ''>[] = [
  'Coating',
  'Damage',
  'Scratch',
  'Corrosion',
  'Other',
];

function ConditionGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section className="condition-group">
    <header>{title}</header>
    <div className="condition-columns">{children}</div>
  </section>;
}

export function ConditionEditor({ ariaPrefix, condition, onPatch }: ConditionEditorProps) {
  const foulingRating = deriveFoulingRating(
    condition.fouling.coverage,
    condition.fouling.slimeOnly,
  );
  const foulingType = deriveFoulingType(
    condition.fouling.coverage,
    condition.fouling.slimeOnly,
  );
  const observedRating = deriveObservedRating(condition.observed.level);

  const changeCoverage = (coverage: number | null) => {
    const slimeOnly = coverage === 0 ? false : condition.fouling.slimeOnly;
    const derived = deriveFoulingCondition(coverage, slimeOnly);
    onPatch({ fouling: { coverage, slimeOnly, type: derived.type } });
  };

  const changeSlimeOnly = (slimeOnly: boolean) => {
    const derived = deriveFoulingCondition(condition.fouling.coverage, slimeOnly);
    onPatch({ fouling: { slimeOnly, type: derived.type } });
  };

  return <div className="condition-tables">
    <ConditionGroup title="FOULING CONDITION">
      <label><span>RATING</span><output
        aria-label={`${ariaPrefix} fouling rating`}
        className={`rating-badge rating-${foulingRating || 'empty'}`}
      >{foulingRating ? `R${foulingRating}` : '—'}</output></label>
      <label><span>TYPE</span><output
        aria-label={`${ariaPrefix} fouling type`}
        className="condition-value"
      >{foulingType || '선택'}</output></label>
      <div className="condition-field"><span>SURFACE COVERAGE</span>
        <div className="coverage-input"><input
          aria-label={`${ariaPrefix} fouling coverage`}
          type="number"
          min="0"
          max="100"
          step="1"
          value={condition.fouling.coverage ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            changeCoverage(value === ''
              ? null
              : Math.min(100, Math.max(0, Math.round(Number(value)))));
          }}
        /><span>%</span></div>
        <label className="slime-toggle"><input
          aria-label={`${ariaPrefix} Slime Only`}
          type="checkbox"
          checked={condition.fouling.slimeOnly}
          disabled={condition.fouling.coverage === null || condition.fouling.coverage === 0}
          onChange={(event) => changeSlimeOnly(event.target.checked)}
        /><span>Slime Only</span></label>
      </div>
    </ConditionGroup>
    <ConditionGroup title="OBSERVED CONDITION">
      <label><span>RATING</span><output
        aria-label={`${ariaPrefix} observed rating`}
        className={`rating-badge rating-${observedRating || 'empty'}`}
      >{observedRating ? `R${observedRating}` : '—'}</output></label>
      <label><span>LEVEL</span><select
        aria-label={`${ariaPrefix} observed level`}
        value={condition.observed.level}
        onChange={(event) => onPatch({
          observed: { level: event.target.value as ObservedLevel },
        })}
      ><option value="">없음</option>{observedLevels.map((value) => (
        <option key={value}>{value}</option>
      ))}</select></label>
      <label><span>TYPE</span><select
        aria-label={`${ariaPrefix} observed type`}
        value={condition.observed.type}
        onChange={(event) => onPatch({
          observed: { type: event.target.value as ObservedType },
        })}
      ><option value="">선택</option>{observedTypes.map((value) => (
        <option key={value}>{value}</option>
      ))}</select></label>
    </ConditionGroup>
  </div>;
}
