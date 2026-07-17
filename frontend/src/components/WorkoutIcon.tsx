import {
  Activity,
  Bike,
  BrushCleaning,
  Dumbbell,
  Flower2,
  Footprints,
  HandFist,
  Kayak,
  Mountain,
  MountainSnow,
  Music4,
  Sailboat,
  Sprout,
  Timer,
  Volleyball,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";

// Ordered by specificity, not alphabetically — e.g. "Golf (walking, carrying
// clubs)" contains both "golf" and "walking", so golf has to be checked
// before the generic walking/running rule or it'd never be reached. Matches
// by keyword against the exercise name rather than a fixed id, so it works
// for both the built-in MET list and freeform custom workout names typed
// in — those just fall through to the generic Activity icon if nothing hits.
const RULES: [RegExp, LucideIcon][] = [
  [/golf|tennis|basketball|soccer|volleyball/i, Volleyball],
  [/kayak/i, Kayak],
  [/paddleboard/i, Sailboat],
  [/garden|yard/i, Sprout],
  [/clean|housework/i, BrushCleaning],
  [/hiit|circuit|crossfit/i, Zap],
  [/jump rope/i, Timer],
  [/stair|climb|elliptical/i, Activity],
  [/ski|snowboard/i, MountainSnow],
  [/hik|mountain/i, Mountain],
  [/box|martial/i, HandFist],
  [/danc/i, Music4],
  [/yoga|pilates|stretch/i, Flower2],
  [/swim|row/i, Waves],
  [/weight training|dumbbell/i, Dumbbell],
  [/cycling|bike|spin/i, Bike],
  [/walking|running/i, Footprints],
];

function iconFor(name: string): LucideIcon {
  for (const [pattern, Icon] of RULES) {
    if (pattern.test(name)) return Icon;
  }
  return Activity;
}

export function WorkoutIcon({
  name,
  size = 16,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Icon = iconFor(name);
  // iconFor always returns one of the fixed, module-level icon components
  // above — never a freshly created one — so this doesn't hit the concern
  // the static-components rule is meant to catch.
  // eslint-disable-next-line react-hooks/static-components
  return <Icon size={size} className={className} />;
}
