import fs from 'node:fs'

function replaceOnce(path, from, to, label) {
  const input = fs.readFileSync(path, 'utf8')
  if (!input.includes(from)) {
    throw new Error(`Patch target not found (${label}) in ${path}`)
  }
  const output = input.replace(from, to)
  fs.writeFileSync(path, output)
}

// 1) Keep TipTap local state authoritative during manual edits. Parent draft props
// are updated on every keystroke; re-copying them into editor state moves the caret.
replaceOnce(
  'features/artifacts/artifact-document-editor.tsx',
  `  useEffect(() => {\n    setBlocks(initialBlocks)\n  }, [initialBlocks])\n\n  useEffect(() => {\n    setPlainText(artifact.content_text ?? \"\")\n    setRichHtml(derivedRichHtml)\n  }, [artifact.content_text, artifact.id, artifact.current_version, artifact.title, derivedRichHtml])\n`,
  `  // Do not mirror parent draft props back into local editor state on every keystroke.\n  // Authoritative server/AI/version changes are applied through forceContentKey above.\n`,
  'artifact caret sync',
)

// 2) Task Details stack artifact header: real Word download immediately left of Expand.
replaceOnce(
  'features/artifacts/ArtifactWorkspace.tsx',
  `  ChevronDown,\n  GripVertical,\n  Loader2,\n  Maximize2,\n  Trash2,\n`,
  `  ChevronDown,\n  Download,\n  GripVertical,\n  Loader2,\n  Maximize2,\n  Trash2,\n`,
  'artifact workspace Download import',
)
replaceOnce(
  'features/artifacts/ArtifactWorkspace.tsx',
  `import { ArtifactVersionHistoryPopover } from \"./artifact-version-history-popover\"\n`,
  `import { ArtifactVersionHistoryPopover } from \"./artifact-version-history-popover\"\nimport { exportArtifactAsDocx } from \"./artifact-docx-export\"\n`,
  'artifact workspace docx import',
)
replaceOnce(
  'features/artifacts/ArtifactWorkspace.tsx',
  `                            <button\n                              type=\"button\"\n                              className=\"inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800\"\n                              aria-label=\"Expand artifact\"\n                              title=\"Expand\"\n                              onClick={() => {\n                                openArtifactCenterTab({\n                                  artifactId: display.id,\n                                  title: display.title,\n                                })\n                              }}\n                            >\n                              <Maximize2 className=\"h-3.5 w-3.5\" />\n                            </button>\n`,
  `                            <button\n                              type=\"button\"\n                              className=\"inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50\"\n                              aria-label=\"Download Word\"\n                              title=\"Download Word\"\n                              disabled={isLiveBusy}\n                              onClick={() => {\n                                void exportArtifactAsDocx({\n                                  artifact: {\n                                    id: display.id,\n                                    title: titleValueFor(display) || display.title,\n                                    content_json: display.content_json,\n                                    content_text: display.content_text,\n                                  },\n                                })\n                              }}\n                            >\n                              <Download className=\"h-3.5 w-3.5\" />\n                            </button>\n                            <button\n                              type=\"button\"\n                              className=\"inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800\"\n                              aria-label=\"Expand artifact\"\n                              title=\"Expand\"\n                              onClick={() => {\n                                openArtifactCenterTab({\n                                  artifactId: display.id,\n                                  title: display.title,\n                                })\n                              }}\n                            >\n                              <Maximize2 className=\"h-3.5 w-3.5\" />\n                            </button>\n`,
  'task detail artifact download',
)

// 3) Render the lower Task Details UI as soon as the task exists. Comments may
// hydrate later, but Outputs / SEO / Attachments / Reviews chrome should not wait.
replaceOnce(
  'app/components/tasks/task-overview-previews.tsx',
  `  commentsPanelProps: TaskCommentsPanelProps\n`,
  `  commentsPanelProps?: TaskCommentsPanelProps\n`,
  'optional comments panel props',
)
replaceOnce(
  'app/components/tasks/task-overview-previews.tsx',
  `      <TaskOverviewPreviewSection\n        title=\"SEO and AI SEO\"\n        active\n        isLoading={!canLoad}\n      >\n        {canLoad ? (\n          <TaskSeoAndAiSeoTab\n            taskId={taskId}\n            embedded\n            readOnly={readOnly}\n            seedSeo={seedSeo}\n          />\n        ) : null}\n      </TaskOverviewPreviewSection>\n`,
  `      <TaskOverviewPreviewSection\n        title=\"SEO and AI SEO\"\n        active\n      >\n        <TaskSeoAndAiSeoTab\n          taskId={taskId}\n          embedded\n          readOnly={readOnly || !canLoad}\n          seedSeo={seedSeo}\n        />\n      </TaskOverviewPreviewSection>\n`,
  'seo chrome immediate render',
)
replaceOnce(
  'app/components/tasks/task-overview-previews.tsx',
  `      <TaskOverviewUpdatesComments\n        taskId={taskId}\n        commentsPanelProps={commentsPanelProps}\n        active\n      />\n`,
  `      {commentsPanelProps ? (\n        <TaskOverviewUpdatesComments\n          taskId={taskId}\n          commentsPanelProps={commentsPanelProps}\n          active\n        />\n      ) : (\n        <TaskOverviewPreviewSection title=\"Updates & comments\" active isLoading />\n      )}\n`,
  'comments skeleton immediate render',
)
replaceOnce(
  'app/components/tasks/TaskDetails.tsx',
  `          {!isSuggestionMode && taskIdNum && commentsPanelProps ? (\n            <TaskOverviewPreviews\n`,
  `          {!isSuggestionMode && taskIdNum ? (\n            <TaskOverviewPreviews\n`,
  'task overview previews early mount',
)

// 4) Task list options: one icon beside Filter, with Sort by > and Group by >
// and the active value visible in both submenus.
replaceOnce(
  'app/components/tasks/tasks-pane-more-menu.tsx',
  `import { MoreHorizontal } from \"lucide-react\"\n`,
  `import { ArrowUpDown, MoreHorizontal } from \"lucide-react\"\n`,
  'sort icon import',
)
replaceOnce(
  'app/components/tasks/tasks-pane-more-menu.tsx',
  `  ariaLabel = \"More actions\",\n}: {\n  children: React.ReactNode\n  visible?: boolean\n  align?: \"start\" | \"end\"\n  triggerClassName?: string\n  ariaLabel?: string\n}) {\n`,
  `  ariaLabel = \"More actions\",\n  triggerIcon = \"more\",\n}: {\n  children: React.ReactNode\n  visible?: boolean\n  align?: \"start\" | \"end\"\n  triggerClassName?: string\n  ariaLabel?: string\n  triggerIcon?: \"more\" | \"sort\"\n}) {\n`,
  'more menu icon prop',
)
replaceOnce(
  'app/components/tasks/tasks-pane-more-menu.tsx',
  `            <MoreHorizontal className=\"h-3.5 w-3.5\" />\n`,
  `            {triggerIcon === \"sort\" ? (\n              <ArrowUpDown className=\"h-3.5 w-3.5\" />\n            ) : (\n              <MoreHorizontal className=\"h-3.5 w-3.5\" />\n            )}\n`,
  'more menu render icon',
)

replaceOnce(
  'app/components/tasks/tasks-pane-toolbar.tsx',
  `  const listGroupBySummary = getListGroupByLabelFromParams(params.get(\"groupBy\"))\n\n  /** Task list always shows overflow (\"…\") with full actions (duplicating pills is OK). */\n`,
  `  const listGroupBySummary = getListGroupByLabelFromParams(params.get(\"groupBy\"))\n  const listSortBy = params.get(\"rowSortBy\") || params.get(\"sortBy\") || \"updated_at\"\n  const listSortOrder = params.get(\"rowSortOrder\") === \"asc\" || params.get(\"sortOrder\") === \"asc\"\n    ? \"asc\"\n    : \"desc\"\n  const listSortOptions = [\n    { value: \"updated_at\", label: \"Updated\" },\n    { value: \"title\", label: \"Title\" },\n    { value: \"delivery_date\", label: \"Delivery date\" },\n    { value: \"publication_date\", label: \"Publication date\" },\n    { value: \"projects\", label: \"Project\" },\n    { value: \"project_statuses\", label: \"Status\" },\n    { value: \"users\", label: \"Assignee\" },\n  ] as const\n  const activeListSortLabel = listSortOptions.find((option) => option.value === listSortBy)?.label ?? listSortBy\n  const setListSort = (sortBy: string, order: \"asc\" | \"desc\" = listSortOrder) => {\n    const next = new URLSearchParams(params.toString())\n    next.set(\"rowSortBy\", sortBy)\n    next.set(\"rowSortOrder\", order)\n    next.set(\"sortBy\", sortBy)\n    next.set(\"sortOrder\", order)\n    next.delete(\"page\")\n    shallowReplaceUrl(\`${pathname}?\${next.toString()}\`)\n    dispatchTasksShallowNavigation()\n  }\n\n  /** Task list always shows overflow with full actions. */\n`,
  'task list sort state',
)
replaceOnce(
  'app/components/tasks/tasks-pane-toolbar.tsx',
  `    return [\n      <DropdownMenuSub key=\"gb\">\n`,
  `    return [\n      <DropdownMenuSub key=\"sort\">\n        <DropdownMenuSubTrigger className=\"gap-2\">\n          <span className=\"min-w-0 truncate\">Sort by</span>\n          <OverflowMenuValueChevron value={\`${activeListSortLabel} · \${listSortOrder === \"asc\" ? \"Asc\" : \"Desc\"}\`} />\n        </DropdownMenuSubTrigger>\n        <DropdownMenuSubContent className=\"min-w-[220px]\">\n          {listSortOptions.map((option) => (\n            <DropdownMenuSub key={option.value}>\n              <DropdownMenuSubTrigger\n                className={cn(\"gap-2\", listSortBy === option.value ? \"font-semibold bg-muted\" : \"\")}\n              >\n                {option.label}\n                <OverflowMenuValueChevron value={listSortBy === option.value ? (listSortOrder === \"asc\" ? \"Asc\" : \"Desc\") : \"\"} />\n              </DropdownMenuSubTrigger>\n              <DropdownMenuSubContent className=\"min-w-[160px]\">\n                <DropdownMenuItem\n                  onSelect={() => setListSort(option.value, \"asc\")}\n                  className={listSortBy === option.value && listSortOrder === \"asc\" ? \"font-semibold bg-muted\" : \"\"}\n                >\n                  Ascending\n                </DropdownMenuItem>\n                <DropdownMenuItem\n                  onSelect={() => setListSort(option.value, \"desc\")}\n                  className={listSortBy === option.value && listSortOrder === \"desc\" ? \"font-semibold bg-muted\" : \"\"}\n                >\n                  Descending\n                </DropdownMenuItem>\n              </DropdownMenuSubContent>\n            </DropdownMenuSub>\n          ))}\n        </DropdownMenuSubContent>\n      </DropdownMenuSub>,\n      <DropdownMenuSub key=\"gb\">\n`,
  'sort by submenu',
)
replaceOnce(
  'app/components/tasks/tasks-pane-toolbar.tsx',
  `    listGroupBySummary,\n    isMultiselectMode,\n`,
  `    listGroupBySummary,\n    activeListSortLabel,\n    listSortBy,\n    listSortOrder,\n    isMultiselectMode,\n`,
  'sort dependencies',
)
replaceOnce(
  'app/components/tasks/tasks-pane-toolbar.tsx',
  `        <TasksPaneMoreMenu\n          visible={showMoreMenu || Boolean(canShowTaskControls && view === \"list\")}\n          ariaLabel={isMobileSplitCompact ? \"More split options\" : \"More actions\"}\n        >\n`,
  `        <TasksPaneMoreMenu\n          visible={showMoreMenu || Boolean(canShowTaskControls && view === \"list\")}\n          ariaLabel={\n            isMobileSplitCompact\n              ? \"More split options\"\n              : view === \"list\"\n                ? \"Sort and group\"\n                : \"More actions\"\n          }\n          triggerIcon={view === \"list\" ? \"sort\" : \"more\"}\n        >\n`,
  'sort group trigger icon',
)
replaceOnce(
  'app/components/tasks/tasks-pane-toolbar.tsx',
  `          <span className=\"shrink-0 text-sm font-medium text-gray-900\">\n            {leftPaneObjectLabel(leftObject)}\n          </span>\n`,
  `          <span className=\"flex h-7 shrink-0 items-center text-sm font-medium leading-none text-gray-900\">\n            {leftPaneObjectLabel(leftObject)}\n          </span>\n`,
  'list title vertical alignment',
)

console.log('Task/artifact UI parity patch applied.')
