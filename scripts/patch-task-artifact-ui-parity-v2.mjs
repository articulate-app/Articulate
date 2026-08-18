import fs from 'node:fs'

function replaceOnce(path, from, to, label) {
  const input = fs.readFileSync(path, 'utf8')
  if (!input.includes(from)) throw new Error(`Patch target not found (${label}) in ${path}`)
  fs.writeFileSync(path, input.replace(from, to))
}

const nl = (...lines) => lines.join('\n') + '\n'

replaceOnce(
  'features/artifacts/artifact-document-editor.tsx',
  nl(
    '  useEffect(() => {',
    '    setBlocks(initialBlocks)',
    '  }, [initialBlocks])',
    '',
    '  useEffect(() => {',
    '    setPlainText(artifact.content_text ?? "")',
    '    setRichHtml(derivedRichHtml)',
    '  }, [artifact.content_text, artifact.id, artifact.current_version, artifact.title, derivedRichHtml])',
  ),
  nl(
    '  // Do not mirror parent draft props back into local editor state on every keystroke.',
    '  // Authoritative server/AI/version changes are applied through forceContentKey above.',
  ),
  'artifact caret sync',
)

replaceOnce(
  'features/artifacts/ArtifactWorkspace.tsx',
  nl('  ChevronDown,', '  GripVertical,', '  Loader2,', '  Maximize2,', '  Trash2,'),
  nl('  ChevronDown,', '  Download,', '  GripVertical,', '  Loader2,', '  Maximize2,', '  Trash2,'),
  'artifact workspace Download import',
)
replaceOnce(
  'features/artifacts/ArtifactWorkspace.tsx',
  'import { ArtifactVersionHistoryPopover } from "./artifact-version-history-popover"\n',
  'import { ArtifactVersionHistoryPopover } from "./artifact-version-history-popover"\nimport { exportArtifactAsDocx } from "./artifact-docx-export"\n',
  'artifact workspace docx import',
)
replaceOnce(
  'features/artifacts/ArtifactWorkspace.tsx',
  nl(
    '                            <button',
    '                              type="button"',
    '                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"',
    '                              aria-label="Expand artifact"',
    '                              title="Expand"',
    '                              onClick={() => {',
    '                                openArtifactCenterTab({',
    '                                  artifactId: display.id,',
    '                                  title: display.title,',
    '                                })',
    '                              }}',
    '                            >',
    '                              <Maximize2 className="h-3.5 w-3.5" />',
    '                            </button>',
  ),
  nl(
    '                            <button',
    '                              type="button"',
    '                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"',
    '                              aria-label="Download Word"',
    '                              title="Download Word"',
    '                              disabled={isLiveBusy}',
    '                              onClick={() => {',
    '                                void exportArtifactAsDocx({',
    '                                  artifact: {',
    '                                    id: display.id,',
    '                                    title: titleValueFor(display) || display.title,',
    '                                    content_json: display.content_json,',
    '                                    content_text: display.content_text,',
    '                                  },',
    '                                })',
    '                              }}',
    '                            >',
    '                              <Download className="h-3.5 w-3.5" />',
    '                            </button>',
    '                            <button',
    '                              type="button"',
    '                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"',
    '                              aria-label="Expand artifact"',
    '                              title="Expand"',
    '                              onClick={() => {',
    '                                openArtifactCenterTab({',
    '                                  artifactId: display.id,',
    '                                  title: display.title,',
    '                                })',
    '                              }}',
    '                            >',
    '                              <Maximize2 className="h-3.5 w-3.5" />',
    '                            </button>',
  ),
  'task detail artifact download',
)

replaceOnce(
  'app/components/tasks/task-overview-previews.tsx',
  '  commentsPanelProps: TaskCommentsPanelProps\n',
  '  commentsPanelProps?: TaskCommentsPanelProps\n',
  'optional comments panel props',
)
replaceOnce(
  'app/components/tasks/task-overview-previews.tsx',
  nl(
    '      <TaskOverviewPreviewSection',
    '        title="SEO and AI SEO"',
    '        active',
    '        isLoading={!canLoad}',
    '      >',
    '        {canLoad ? (',
    '          <TaskSeoAndAiSeoTab',
    '            taskId={taskId}',
    '            embedded',
    '            readOnly={readOnly}',
    '            seedSeo={seedSeo}',
    '          />',
    '        ) : null}',
    '      </TaskOverviewPreviewSection>',
  ),
  nl(
    '      <TaskOverviewPreviewSection',
    '        title="SEO and AI SEO"',
    '        active',
    '      >',
    '        <TaskSeoAndAiSeoTab',
    '          taskId={taskId}',
    '          embedded',
    '          readOnly={readOnly || !canLoad}',
    '          seedSeo={seedSeo}',
    '        />',
    '      </TaskOverviewPreviewSection>',
  ),
  'seo chrome immediate render',
)
replaceOnce(
  'app/components/tasks/task-overview-previews.tsx',
  nl(
    '      <TaskOverviewUpdatesComments',
    '        taskId={taskId}',
    '        commentsPanelProps={commentsPanelProps}',
    '        active',
    '      />',
  ),
  nl(
    '      {commentsPanelProps ? (',
    '        <TaskOverviewUpdatesComments',
    '          taskId={taskId}',
    '          commentsPanelProps={commentsPanelProps}',
    '          active',
    '        />',
    '      ) : (',
    '        <TaskOverviewPreviewSection title="Updates & comments" active isLoading />',
    '      )}',
  ),
  'comments skeleton immediate render',
)
replaceOnce(
  'app/components/tasks/TaskDetails.tsx',
  '          {!isSuggestionMode && taskIdNum && commentsPanelProps ? (\n            <TaskOverviewPreviews\n',
  '          {!isSuggestionMode && taskIdNum ? (\n            <TaskOverviewPreviews\n',
  'task overview previews early mount',
)

replaceOnce(
  'app/components/tasks/tasks-pane-more-menu.tsx',
  'import { MoreHorizontal } from "lucide-react"\n',
  'import { ArrowUpDown, MoreHorizontal } from "lucide-react"\n',
  'sort icon import',
)
replaceOnce(
  'app/components/tasks/tasks-pane-more-menu.tsx',
  nl(
    '  ariaLabel = "More actions",',
    '}: {',
    '  children: React.ReactNode',
    '  visible?: boolean',
    '  align?: "start" | "end"',
    '  triggerClassName?: string',
    '  ariaLabel?: string',
    '}) {',
  ),
  nl(
    '  ariaLabel = "More actions",',
    '  triggerIcon = "more",',
    '}: {',
    '  children: React.ReactNode',
    '  visible?: boolean',
    '  align?: "start" | "end"',
    '  triggerClassName?: string',
    '  ariaLabel?: string',
    '  triggerIcon?: "more" | "sort"',
    '}) {',
  ),
  'more menu icon prop',
)
replaceOnce(
  'app/components/tasks/tasks-pane-more-menu.tsx',
  '            <MoreHorizontal className="h-3.5 w-3.5" />\n',
  nl(
    '            {triggerIcon === "sort" ? (',
    '              <ArrowUpDown className="h-3.5 w-3.5" />',
    '            ) : (',
    '              <MoreHorizontal className="h-3.5 w-3.5" />',
    '            )}',
  ),
  'more menu render icon',
)

replaceOnce(
  'app/components/tasks/tasks-pane-toolbar.tsx',
  '  const listGroupBySummary = getListGroupByLabelFromParams(params.get("groupBy"))\n\n  /** Task list always shows overflow (“…”) with full actions (duplicating pills is OK). */\n',
  nl(
    '  const listGroupBySummary = getListGroupByLabelFromParams(params.get("groupBy"))',
    '  const listSortBy = params.get("rowSortBy") || params.get("sortBy") || "updated_at"',
    '  const listSortOrder = params.get("rowSortOrder") === "asc" || params.get("sortOrder") === "asc"',
    '    ? "asc"',
    '    : "desc"',
    '  const listSortOptions = [',
    '    { value: "updated_at", label: "Updated" },',
    '    { value: "title", label: "Title" },',
    '    { value: "delivery_date", label: "Delivery date" },',
    '    { value: "publication_date", label: "Publication date" },',
    '    { value: "projects", label: "Project" },',
    '    { value: "project_statuses", label: "Status" },',
    '    { value: "users", label: "Assignee" },',
    '  ] as const',
    '  const activeListSortLabel = listSortOptions.find((option) => option.value === listSortBy)?.label ?? listSortBy',
    '  const setListSort = (sortBy: string, order: "asc" | "desc" = listSortOrder) => {',
    '    const next = new URLSearchParams(params.toString())',
    '    next.set("rowSortBy", sortBy)',
    '    next.set("rowSortOrder", order)',
    '    next.set("sortBy", sortBy)',
    '    next.set("sortOrder", order)',
    '    next.delete("page")',
    '    shallowReplaceUrl(pathname + "?" + next.toString())',
    '    dispatchTasksShallowNavigation()',
    '  }',
    '',
    '  /** Task list always shows overflow with full actions. */',
  ),
  'task list sort state',
)
replaceOnce(
  'app/components/tasks/tasks-pane-toolbar.tsx',
  '    return [\n      <DropdownMenuSub key="gb">\n',
  nl(
    '    return [',
    '      <DropdownMenuSub key="sort">',
    '        <DropdownMenuSubTrigger className="gap-2">',
    '          <span className="min-w-0 truncate">Sort by</span>',
    '          <OverflowMenuValueChevron value={activeListSortLabel + " · " + (listSortOrder === "asc" ? "Asc" : "Desc")} />',
    '        </DropdownMenuSubTrigger>',
    '        <DropdownMenuSubContent className="min-w-[220px]">',
    '          {listSortOptions.map((option) => (',
    '            <DropdownMenuSub key={option.value}>',
    '              <DropdownMenuSubTrigger className={cn("gap-2", listSortBy === option.value ? "font-semibold bg-muted" : "")}>',
    '                {option.label}',
    '                <OverflowMenuValueChevron value={listSortBy === option.value ? (listSortOrder === "asc" ? "Asc" : "Desc") : ""} />',
    '              </DropdownMenuSubTrigger>',
    '              <DropdownMenuSubContent className="min-w-[160px]">',
    '                <DropdownMenuItem onSelect={() => setListSort(option.value, "asc")} className={listSortBy === option.value && listSortOrder === "asc" ? "font-semibold bg-muted" : ""}>',
    '                  Ascending',
    '                </DropdownMenuItem>',
    '                <DropdownMenuItem onSelect={() => setListSort(option.value, "desc")} className={listSortBy === option.value && listSortOrder === "desc" ? "font-semibold bg-muted" : ""}>',
    '                  Descending',
    '                </DropdownMenuItem>',
    '              </DropdownMenuSubContent>',
    '            </DropdownMenuSub>',
    '          ))}',
    '        </DropdownMenuSubContent>',
    '      </DropdownMenuSub>,',
    '      <DropdownMenuSub key="gb">',
  ),
  'sort by submenu',
)
replaceOnce(
  'app/components/tasks/tasks-pane-toolbar.tsx',
  '    listGroupBySummary,\n    isMultiselectMode,\n',
  '    listGroupBySummary,\n    activeListSortLabel,\n    listSortBy,\n    listSortOrder,\n    isMultiselectMode,\n',
  'sort dependencies',
)
replaceOnce(
  'app/components/tasks/tasks-pane-toolbar.tsx',
  nl(
    '        <TasksPaneMoreMenu',
    '          visible={showMoreMenu || Boolean(canShowTaskControls && view === "list")}',
    '          ariaLabel={isMobileSplitCompact ? "More split options" : "More actions"}',
    '        >',
  ),
  nl(
    '        <TasksPaneMoreMenu',
    '          visible={showMoreMenu || Boolean(canShowTaskControls && view === "list")}',
    '          ariaLabel={isMobileSplitCompact ? "More split options" : view === "list" ? "Sort and group" : "More actions"}',
    '          triggerIcon={view === "list" ? "sort" : "more"}',
    '        >',
  ),
  'sort group trigger icon',
)
replaceOnce(
  'app/components/tasks/tasks-pane-toolbar.tsx',
  nl(
    '          <span className="shrink-0 text-sm font-medium text-gray-900">',
    '            {leftPaneObjectLabel(leftObject)}',
    '          </span>',
  ),
  nl(
    '          <span className="flex h-7 shrink-0 items-center text-sm font-medium leading-none text-gray-900">',
    '            {leftPaneObjectLabel(leftObject)}',
    '          </span>',
  ),
  'list title vertical alignment',
)

console.log('Task/artifact UI parity patch applied.')
