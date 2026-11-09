import { Beef, Droplet, Dumbbell, Flame, Footprints, Leaf, Medal, Shield, Sparkles, Star, Sunrise, Trophy, Utensils, Weight, type LucideIcon } from 'lucide-react';

const MAP: Record<string, LucideIcon> = { beef: Beef, droplet: Droplet, dumbbell: Dumbbell, flame: Flame, footprints: Footprints, leaf: Leaf, medal: Medal, shield: Shield, sparkles: Sparkles, star: Star, sunrise: Sunrise, trophy: Trophy, utensils: Utensils, weight: Weight };

export function Icon({ name, size = 24 }: { name: string; size?: number }) {
  const C = MAP[name] ?? Star;
  return <C size={size} strokeWidth={2} aria-hidden="true" />;
}

/** Hand-drawn flame for streaks (gradient follows the theme). */
export function FlameArt() {
  return (
    <svg className="flame" viewBox="0 0 54 64" aria-hidden="true">
      <defs><linearGradient id="flame-g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--accent-2)" /></linearGradient></defs>
      <path d="M27 62C13 62 4 52 4 39c0-11 7-17 11-25 2 6 5 9 8 10C23 14 27 6 35 2c-1 9 3 14 8 21 4 5 7 10 7 16 0 13-9 23-23 23z" fill="url(#flame-g)" />
      <path d="M27 58c-6 0-10-4-10-10 0-5 3-8 6-12 1 3 3 5 5 5 0-4 2-8 6-10 0 5 2 8 4 11 1 2 2 4 2 6 0 6-6 10-13 10z" fill="#fff3d6" opacity=".85" />
    </svg>
  );
}
