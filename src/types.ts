export type Subject = { id: string; name: string; kind: 'grundfach' | 'leistungsfach'; color: string; sort_order: number };
export type Cat = { id: string; subject_id: string; name: string; weight: number; active: boolean };
export type Grade = { id: string; subject_id: string; category_id: string; title: string; points: number; graded_on: string; note: string | null };
