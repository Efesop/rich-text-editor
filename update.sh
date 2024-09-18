#!/bin/bash

# Create and populate files
cat > pages/index.js << EOL
import RichTextEditor from '../components/RichTextEditor'

export default function Home() {
  return (
    <div>
      <RichTextEditor />
    </div>
  )
}
EOL

cat > components/RichTextEditor.js << EOL
'use client'

import React, { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { ScrollArea } from "./ui/scroll-area"
import { ChevronRight, ChevronLeft, Plus, Save, FileText } from 'lucide-react'

const EditorJS = dynamic(() => import('@editorjs/editorjs'), { ssr: false })

export default function RichTextEditor() {
  const [pages, setPages] = useState([])
  const [currentPage, setCurrentPage] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const editorRef = useRef(null)
  const [editor, setEditor] = useState(null)

  useEffect(() => {
    fetchPages()
  }, [])

  useEffect(() => {
    if (currentPage && !editor) {
      initEditor()
    }
  }, [currentPage])

  const fetchPages = async () => {
    const response = await fetch('/api/pages')
    const data = await response.json()
    setPages(data)
    setCurrentPage(data[0])
  }

  const initEditor = () => {
    const EditorJS = require('@editorjs/editorjs')
    const Header = require('@editorjs/header')
    const List = require('@editorjs/list')
    const Checklist = require('@editorjs/checklist')
    const Quote = require('@editorjs/quote')
    const CodeTool = require('@editorjs/code')
    const InlineCode = require('@editorjs/inline-code')
    const Marker = require('@editorjs/marker')
    const Table = require('@editorjs/table')
    const LinkTool = require('@editorjs/link')
    const ImageTool = require('@editorjs/image')
    const Embed = require('@editorjs/embed')
    const Delimiter = require('@editorjs/delimiter')

    const editor = new EditorJS({
      holder: 'editorjs',
      tools: {
        header: {
          class: Header,
          inlineToolbar: ['marker', 'inlineCode']
        },
        list: {
          class: List,
          inlineToolbar: true
        },
        checklist: {
          class: Checklist,
          inlineToolbar: true
        },
        quote: {
          class: Quote,
          inlineToolbar: true,
          config: {
            quotePlaceholder: 'Enter a quote',
            captionPlaceholder: 'Quote\'s author',
          },
        },
        code: CodeTool,
        inlineCode: {
          class: InlineCode,
          shortcut: 'CMD+SHIFT+M',
        },
        marker: {
          class: Marker,
          shortcut: 'CMD+SHIFT+H',
        },
        table: {
          class: Table,
          inlineToolbar: true,
          config: {
            rows: 2,
            cols: 3,
          },
        },
        linkTool: LinkTool,
        image: {
          class: ImageTool,
          config: {
            endpoints: {
              byFile: '/api/upload-image', // You need to implement this endpoint
            }
          }
        },
        embed: {
          class: Embed,
          config: {
            services: {
              youtube: true,
              coub: true,
            }
          }
        },
        delimiter: Delimiter,
      },
      data: currentPage.content,
      onChange: async () => {
        const content = await editor.save()
        setCurrentPage(prev => ({ ...prev, content }))
      }
    })

    setEditor(editor)
  }

  const handleNewPage = () => {
    const newPage = { id: Date.now().toString(), title: 'New Page', content: { time: Date.now(), blocks: [] } }
    setPages([...pages, newPage])
    setCurrentPage(newPage)
  }

  const handleSavePage = async () => {
    if (editor) {
      const content = await editor.save()
      const updatedPages = pages.map(page => 
        page.id === currentPage.id ? { ...page, content } : page
      )
      setPages(updatedPages)
      await fetch('/api/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedPages),
      })
    }
  }

  const handlePageSelect = (page) => {
    setCurrentPage(page)
    if (editor) {
      editor.render(page.content)
    }
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  if (!currentPage) return <div>Loading...</div>

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className={\`bg-muted transition-all duration-300 ease-in-out \${sidebarOpen ? 'w-64' : 'w-0'}\`}>
        <div className="flex justify-between items-center p-4">
          <h2 className="text-lg font-semibold">Pages</h2>
          <Button variant="ghost" size="icon" onClick={handleNewPage}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="h-[calc(100vh-60px)]">
          {pages.map(page => (
            <div
              key={page.id}
              className={\`p-2 cursor-pointer hover:bg-accent \${currentPage.id === page.id ? 'bg-accent' : ''}\`}
              onClick={() => handlePageSelect(page)}
            >
              <FileText className="h-4 w-4 inline mr-2" />
              {page.title}
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Toggle Sidebar Button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 left-2 z-10"
        onClick={toggleSidebar}
      >
        {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          {isEditing ? (
            <Input
              value={currentPage.title}
              onChange={(e) => setCurrentPage({ ...currentPage, title: e.target.value })}
              onBlur={() => setIsEditing(false)}
              autoFocus
            />
          ) : (
            <h1 className="text-2xl font-bold" onClick={() => setIsEditing(true)}>{currentPage.title}</h1>
          )}
          <Button onClick={handleSavePage}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
        <div id="editorjs" className="flex-1 p-4 overflow-auto" />
      </div>
    </div>
  )
}
EOL

cat > pages/api/pages.js << EOL
import fs from 'fs';
import path from 'path';

const dataFile = path.join(process.cwd(), 'data', 'pages.json');

export default function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const data = fs.readFileSync(dataFile, 'utf8');
      res.status(200).json(JSON.parse(data));
    } catch (error) {
      res.status(500).json({ message: 'Error reading data' });
    }
  } else if (req.method === 'POST') {
    try {
      fs.writeFileSync(dataFile, JSON.stringify(req.body));
      res.status(200).json({ message: 'Data saved successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error saving data' });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
EOL

cat > components/ui/button.tsx << EOL
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
EOL

cat > components/ui/input.tsx << EOL
import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
EOL

cat > components/ui/scroll-area.tsx << EOL
import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn("relative overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
EOL

cat > lib/utils.ts << EOL
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
EOL

cat > data/pages.json << EOL
[
  {
    "id": "1",
    "title": "Welcome",
    "content": {
      "time": 1635603431943,
      "blocks": [
        {
          "type": "header",
          "data": {
            "text": "Welcome to your new workspace!",
            "level": 2
          }
        }
      ]
    }
  },
  {
    "id": "2",
    "title": "Getting Started",
    "content": {
      "time": 1635603431944,
      "blocks": [
        {
          "type": "paragraph",
          "data": {
            "text": "This is a full-featured example of using Editor.js"
          }
        }
      ]
    }
  }
]
EOL

# Update next.config.js
echo "/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = nextConfig" > next.config.js

# Update tailwind.config.js
echo "/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}" > tailwind.config.js

# Update package.json
jq '.dependencies += {
  "@editorjs/checklist": "latest",
  "@editorjs/code": "latest",
  "@editorjs/delimiter": "latest",
  "@editorjs/editorjs": "latest",
  "@editorjs/embed": "latest",
  "@editorjs/header": "latest",
  "@editorjs/image": "latest",
  "@editorjs/inline-code": "latest",
  "@editorjs/link": "latest",
  "@editorjs/list": "latest",
  "@editorjs/marker": "latest",
  "@editorjs/quote": "latest",
  "@editorjs/table": "latest",
  "@radix-ui/react-scroll-area": "^1.0.4",
  "@radix-ui/react-slot": "^1.0.2",
  "class-variance-authority": "^0.7.0",
  "clsx": "^2.0.0",
  "lucide-react": "^0.263.1",
  "tailwind-merge": "^1.14.0",
  "tailwindcss-animate": "^1.0.7"
} | .devDependencies += {
  "@types/node": "^20.5.0",
  "@types/react": "^18.2.20",
  "autoprefixer": "^10.4.15",
  "postcss": "^8.4.28",
  "tailwindcss": "^3.3.3",
  "typescript": "^5.1.6"
}' package.json > temp.json && mv temp.json package.json

echo "Setup complete. You can now run 'npm install' to update dependencies, then 'npm run dev' to start the development server."