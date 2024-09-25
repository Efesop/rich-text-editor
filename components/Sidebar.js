import React from 'react'
import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import SearchInput from './SearchInput'
import PageItem from './PageItem'
import { useTheme } from 'next-themes'
import { searchPlaceholders } from '../../constants/editorConstants'

const Sidebar = ({
  pages,
  currentPage,
  sidebarOpen,
  searchTerm,
  searchFilter,
  onNewPage,
  onPageSelect,
  onRenamePage,
  onDeletePage,
  onToggleSidebar,
  onSearchTermChange,
  onSearchFilterChange
}) => {
  const { theme } = useTheme();

  const filteredPages = pages.filter(page => {
    if (searchTerm === '') return true;
    const query = searchTerm.toLowerCase();
    switch (searchFilter) {
      case 'title':
        return page.title.toLowerCase().includes(query);
      case 'content':
        return JSON.stringify(page.content).toLowerCase().includes(query);
      case 'tags':
        return page.tags && page.tags.some(tag => tag.name.toLowerCase().includes(query));
      case 'all':
      default:
        return page.title.toLowerCase().includes(query) ||
               JSON.stringify(page.content).toLowerCase().includes(query) ||
               (page.tags && page.tags.some(tag => tag.name.toLowerCase().includes(query)));
    }
  });

  return (
    <div className={`transition-all duration-300 ease-in-out ${
      sidebarOpen ? 'w-64' : 'w-16'
    } flex flex-col h-full border-r ${
      theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-gray-100 border-gray-200 text-black'
    }`}>
      <div className="flex justify-between items-center p-4">
        {sidebarOpen && <h2 className="text-lg font-semibold">Pages</h2>}
        <Button variant="ghost" size="icon" onClick={onNewPage}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {sidebarOpen && (
        <div className="px-4 mb-2">
          <SearchInput
            value={searchTerm}
            onChange={onSearchTermChange}
            filter={searchFilter}
            onFilterChange={onSearchFilterChange}
            placeholder={searchPlaceholders[searchFilter]}
          />
        </div>
      )}
      <ScrollArea className="flex-grow">
        {filteredPages.map(page => (
          <PageItem
            key={page.id}
            page={page}
            isActive={currentPage.id === page.id}
            onSelect={onPageSelect}
            onRename={onRenamePage}
            onDelete={onDeletePage}
            sidebarOpen={sidebarOpen}
            theme={theme}
          />
        ))}
      </ScrollArea>
      <Button
        variant="ghost"
        size="icon"
        className="m-2"
        onClick={onToggleSidebar}
      >
        {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>
    </div>
  );
};

export default Sidebar;