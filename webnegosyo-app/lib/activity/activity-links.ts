/**
 * Doors into the Activity feed from elsewhere: a staff profile's "See all
 * activity", an ingredient's "Who changed this stock". The link carries the
 * filter as query params; the screen turns them back into an initial filter
 * state. Pure so both ends are tested together.
 */

import { DEFAULT_ACTIVITY_FILTERS, type ActivityActorFilter, type ActivityFilters, type ActivitySubjectFilter } from "./filters";
import { isActivitySubjectType } from "./taxonomy";

export const ACTIVITY_ROUTE = "/(main)/activity";

const PARAM_KEYS = ["actor", "actorName", "subjectType", "subjectRef", "subjectLabel"] as const;
const FALLBACK_ACTOR_NAME = "Staff";

export interface ActivityLinkTarget {
  actor?: ActivityActorFilter;
  subject?: ActivitySubjectFilter;
}

export type ActivityRouteParams = Readonly<Record<string, string | string[] | undefined>>;

export function activityHref(target: ActivityLinkTarget): string {
  const pairs: [string, string][] = [
    ...(target.actor ? ([["actor", target.actor.id], ["actorName", target.actor.name]] as [string, string][]) : []),
    ...(target.subject
      ? ([
          ["subjectType", target.subject.type],
          ["subjectRef", target.subject.ref],
          ["subjectLabel", target.subject.label],
        ] as [string, string][])
      : []),
  ];
  if (pairs.length === 0) return ACTIVITY_ROUTE;
  return `${ACTIVITY_ROUTE}?${pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}`;
}

function single(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === "string" && text.trim() !== "" ? text.trim() : null;
}

/** The filter a link asks for, or null when it asks for none. */
export function filtersFromParams(params: ActivityRouteParams): ActivityFilters | null {
  const actorId = single(params.actor);
  const subjectType = single(params.subjectType);
  const subjectRef = single(params.subjectRef);
  const subject =
    subjectType && subjectRef && isActivitySubjectType(subjectType)
      ? { type: subjectType, ref: subjectRef, label: single(params.subjectLabel) ?? subjectRef }
      : null;
  if (!actorId && !subject) return null;
  return {
    ...DEFAULT_ACTIVITY_FILTERS,
    // One subject's story usually spans more than a week.
    period: subject ? "month" : DEFAULT_ACTIVITY_FILTERS.period,
    actor: actorId ? { id: actorId, name: single(params.actorName) ?? FALLBACK_ACTOR_NAME } : null,
    subject,
  };
}

/** Identity of a link, so the screen applies each arrival once. */
export function paramsKey(params: ActivityRouteParams): string {
  return PARAM_KEYS.map((key) => single(params[key]))
    .map((value, index) => (value === null ? "" : `${PARAM_KEYS[index]}=${value}`))
    .filter((part) => part !== "")
    .join("&");
}
