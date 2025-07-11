"use client"

import React, { useState } from "react";
import { TaskHeaderBar } from "../components/ui/task-header-bar";
import { useTasksUI } from "../store/tasks-ui";

export default function TasksLayout({ children }: { children: React.ReactNode }) {
  // Sidebar state (for mobile/desktop collapsed)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // false = collapsed by default
  // Global search/filter state from Zustand
  const { searchValue, setSearchValue } = useTasksUI();

  // Handler for filter button (could open a filter modal or pane)
  const handleFilterClick = () => {
    // TODO: Implement filter pane/modal
    // For now, just log
    // You can expand this to open a filter modal or drawer
    // setIsFilterOpen(true);
    console.log("Filter button clicked");
  };

  // Handler for sidebar toggle (hamburger)
  const handleSidebarToggle = () => setIsSidebarOpen((v) => !v);

  return (
    <div className="flex flex-col h-screen w-full bg-white">
      <TaskHeaderBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onFilterClick={handleFilterClick}
        onSidebarToggle={handleSidebarToggle}
      />
      {/* Main content (children) */}
      <div className="flex-1 min-h-0 w-full flex flex-row">
        {/* Pass sidebar state as context/prop if needed */}
        {React.cloneElement(children as React.ReactElement, {
          isSidebarOpen,
          isSidebarCollapsed: !isSidebarOpen,
          onSidebarToggle: handleSidebarToggle,
        })}
      </div>
    </div>
  );
} 