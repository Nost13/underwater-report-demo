import type { ReportSection } from '../domain/types';

export interface SectionGroup {
  key: string;
  service: ReportSection['service'];
  component: string;
  sections: ReportSection[];
}

export function sectionWindow(
  sections: ReportSection[],
  activeSectionId: string,
  size = 5,
): ReportSection[] {
  if (sections.length <= size) return sections;
  const activeIndex = Math.max(0, sections.findIndex((section) => section.id === activeSectionId));
  const half = Math.floor(size / 2);
  const start = Math.min(
    Math.max(0, activeIndex - half),
    Math.max(0, sections.length - size),
  );
  return sections.slice(start, start + size);
}

export function filterSections(sections: ReportSection[], query: string): ReportSection[] {
  const tokens = query.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return sections;
  return sections.filter((section) => {
    const searchable = [
      section.id,
      section.service,
      section.area,
      section.component,
      section.side,
      section.unit ? `UNIT ${String(section.unit).padStart(2, '0')}` : '',
    ].filter(Boolean).join(' ').toUpperCase();
    return tokens.every((token) => searchable.includes(token));
  });
}

export function groupSections(sections: ReportSection[]): SectionGroup[] {
  const groups = new Map<string, SectionGroup>();
  for (const section of sections) {
    const key = `${section.service}/${section.component}`;
    const existing = groups.get(key);
    if (existing) existing.sections.push(section);
    else groups.set(key, {
      key,
      service: section.service,
      component: section.component,
      sections: [section],
    });
  }
  return [...groups.values()];
}
