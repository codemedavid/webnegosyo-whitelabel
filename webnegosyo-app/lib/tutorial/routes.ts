/** Routes of the tutorial screens; one place so the hub, greeter and menus agree. */
export const TUTORIAL_HUB_ROUTE = "/(main)/tutorial" as const;

export function tutorialChapterRoute(chapterId: string): `/(main)/tutorial/${string}` {
  return `/(main)/tutorial/${chapterId}`;
}
