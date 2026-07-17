"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useGlobalSearchController } from "../hooks/use-global-search-controller"

type GlobalSearchController = ReturnType<typeof useGlobalSearchController>

const GlobalSearchContext = createContext<GlobalSearchController | null>(null)

export function GlobalSearchProvider({
  value,
  children,
}: {
  value: GlobalSearchController
  children: ReactNode
}) {
  return <GlobalSearchContext.Provider value={value}>{children}</GlobalSearchContext.Provider>
}

export function useGlobalSearchContext() {
  return useContext(GlobalSearchContext)
}
