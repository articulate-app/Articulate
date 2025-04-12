"use client"

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  SortingState,
  getSortedRowModel,
} from "@tanstack/react-table"
import { useEffect, useState } from "react"
import { Task, getTasks } from "../../../lib/services/tasks"

const columns: ColumnDef<Task>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <div className={row.original.is_parent_task ? "font-bold" : ""}>
        {row.getValue("title")}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <span className={`px-2 py-1 rounded-full text-xs ${
        row.getValue("status") === "Done" ? "bg-green-100 text-green-800" :
        row.getValue("status") === "In Progress" ? "bg-blue-100 text-blue-800" :
        "bg-gray-100 text-gray-800"
      }`}>
        {row.getValue("status")}
      </span>
    ),
  },
  {
    accessorKey: "due_date",
    header: "Due Date",
    cell: ({ row }) => {
      const date = new Date(row.getValue("due_date"))
      return date.toLocaleDateString()
    },
  },
  {
    accessorKey: "project",
    header: "Project",
    cell: ({ row }) => row.original.project?.name || "-",
  },
  {
    accessorKey: "content_type",
    header: "Content Type",
  },
  {
    accessorKey: "production_type",
    header: "Production Type",
  },
  {
    accessorKey: "language",
    header: "Language",
  },
  {
    accessorKey: "last_update",
    header: "Last Update",
    cell: ({ row }) => {
      const date = new Date(row.getValue("last_update"))
      return date.toLocaleDateString()
    },
  },
]

export function TasksTable() {
  const [sorting, setSorting] = useState<SortingState>([])
  const [data, setData] = useState<Task[]>([])
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTasks() {
      try {
        setIsLoading(true)
        const { tasks, totalCount } = await getTasks({
          page: currentPage,
          pageSize: 10,
          sortBy: sorting[0]?.id || "last_update",
          sortOrder: sorting[0]?.desc ? "desc" : "asc",
        })
        setData(tasks)
        setPageCount(Math.ceil(totalCount / 10))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch tasks")
      } finally {
        setIsLoading(false)
      }
    }

    fetchTasks()
  }, [currentPage, sorting])

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    pageCount,
    manualPagination: true,
    onPaginationChange: (updater) => {
      if (typeof updater === "function") {
        const newPage = updater({ pageIndex: currentPage - 1, pageSize: 10 })
        setCurrentPage(newPage.pageIndex + 1)
      }
    },
  })

  if (isLoading) {
    return <div className="text-center py-8">Loading tasks...</div>
  }

  if (error) {
    return <div className="text-center py-8 text-red-500">{error}</div>
  }

  return (
    <div className="w-full">
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-2 text-left text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-50"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    {{
                      asc: " ↑",
                      desc: " ↓",
                    }[header.column.getIsSorted() as string] ?? null}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 border rounded-md disabled:opacity-50"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <button
            className="px-3 py-1 border rounded-md disabled:opacity-50"
            onClick={() => setCurrentPage((p) => p + 1)}
            disabled={currentPage >= pageCount}
          >
            Next
          </button>
        </div>
        <div className="text-sm text-gray-500">
          Page {currentPage} of {pageCount}
        </div>
      </div>
    </div>
  )
} 