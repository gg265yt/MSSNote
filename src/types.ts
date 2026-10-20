export type Subject = { id: string; name: string; kind: 'grundfach' | 'leistungsfach'; color: string; sort_order: number };
export type Cat = { id: string; subject_id: string; name: string; weight: number; active: boolean };
export type Grade = { id: string; subject_id: string; category_id: string; title: string; points: number; graded_on: string; note: string | null };
export type Profile = { half_points: boolean; theme: 'light' | 'dark' | 'system'; missing_category_mode: 'renormalize' | 'strict' };
