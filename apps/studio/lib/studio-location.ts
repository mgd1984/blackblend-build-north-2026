const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function readStudioLocation(search: string) {
  const query = new URLSearchParams(search);
  const raw = query.get("project") ?? query.get("flow");
  const projectId = raw && uuid.test(raw) ? raw : null;
  return {
    view:
      projectId || query.get("view") === "projects"
        ? ("projects" as const)
        : query.get("view") === "review" || query.has("example")
          ? ("examples" as const)
          : ("build" as const),
    projectId,
    example:
      query.get("example") === "massey-harris-21" ? ("massey-harris-21" as const) : query.get("example") === "ptz" ? ("ptz" as const) : ("woodshed" as const),
  };
}
export function studioProjectUrl(projectId?: string | null) {
  return projectId && uuid.test(projectId)
    ? "/studio?project=" + encodeURIComponent(projectId)
    : "/studio?view=projects";
}
export function legacyWorkflowUrl(
  query: Record<string, string | string[] | undefined>,
) {
  const value = typeof query.flow === "string" ? query.flow : undefined;
  return studioProjectUrl(value);
}
