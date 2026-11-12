import type { SpeakableKind } from './speakable.ts';
export declare function speakableText(source: string, kind: SpeakableKind): string;
export declare function splitSegments(text: string, limit: number): string[];
