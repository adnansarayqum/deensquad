import { Clock, Ear, Flame, Goal, Hand, Star, Target, Trophy, Users, type LucideIcon } from "lucide-react";
import type { Badge } from "@/lib/domain";

/** The picture on each badge, shared by the parents' Family screen, the coaches' page and the admins' Rewards. */
export const BADGE_ICONS: Record<Badge["icon"], LucideIcon> = { star: Star, clock: Clock, trophy: Trophy, flame: Flame, target: Target, users: Users, goal: Goal, ear: Ear, hand: Hand };

export const badgeIcon = (icon: string): LucideIcon => BADGE_ICONS[icon as Badge["icon"]] ?? Star;
