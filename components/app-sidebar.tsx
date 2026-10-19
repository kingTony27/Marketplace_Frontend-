"use client"

import * as React from "react"
import { Bell, Home, Menu, Plus, Send, User, Zap, } from "lucide-react"
import { cn } from "cn"
import PostSidebar from "@/components/post"
import NotificationSidebar from "@/components/notifications"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type RailLinkProps = {
  title: string
  url: string
  icon: React.ReactNode
  className?: string
  onClick?: React.MouseEventHandler<HTMLElement>
}

const navItems: RailLinkProps[] = [
  { title: "Home", url: "/", icon: <Home className="h-6 w-6 shrink-0 fill-current" strokeWidth={1.75} /> },
  { title: "Trending", url: "/trending", icon: <Zap className="h-6 w-6 shrink-0" strokeWidth={1.75} /> },
  // { title: "Explore", url: "/explore", icon: <Send className="h-6 w-6 shrink-0" strokeWidth={1.75} /> },
]

const ACTIVE_KEY = "sidebar.active.title"

const railLinkClasses = cn(
  "flex h-11 w-full shrink-0 items-center gap-3 overflow-hidden rounded-xl px-3 text-white",
  "transition-all duration-200 ease-out",
  "hover:bg-zinc-800 hover:text-green-400",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900",
  "group-data-[collapsible=icon]:size-11 group-data-[collapsible=icon]:p-[10px]"
)

const railLabelClasses = cn(
  "whitespace-nowrap text-sm",
  "transition-[opacity,transform] duration-200 ease-out",
  "group-data-[collapsible=icon]:-translate-x-1 group-data-[collapsible=icon]:opacity-0"
)

type RailLinkInternalProps = RailLinkProps & {
  active?: boolean
  onActivate?: (title: string) => void
}

// -------------- Used for icons that open pages not sideBars ------------
function RailLink({ title, url, icon, active, className, onClick, onActivate }: RailLinkInternalProps) {
  const { state, isMobile } = useSidebar()

  const handleClick: React.MouseEventHandler<HTMLElement> = (e) => {
    onActivate?.(title)
    onClick?.(e)
  }

  const row = (
    <a
      href={url}
      onClick={handleClick}
      aria-label={title}
      aria-current={active ? "page" : undefined}
      className={cn(
        railLinkClasses,
        active && "bg-zinc-800 text-green-400 shadow-[inset_0_0_0_1px_rgba(5,223,114,0.3)] ring-2 ring-green-400 ring-offset-2 ring-offset-zinc-900",
        className
      )}
    >
      {icon}
      <span className={railLabelClasses}>{title}</span>
    </a>
  )

  if (state !== "collapsed" || isMobile) return row

  return (
    <Tooltip>
      <TooltipTrigger render={row} />
      <TooltipContent side="right">{title}</TooltipContent>
    </Tooltip>
  )
}

// ------------ Used for icons that do not open pages but sidebars -------------
function RailButton({
  title,
  icon,
  onClick,
  className,
}: {
  title: string
  icon: React.ReactNode
  onClick: () => void
  className?: string
}) {
  const { state, isMobile } = useSidebar()

  const row = (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      aria-haspopup="dialog"
      className={cn(railLinkClasses, className)}
    >
      {icon}
      <span className={railLabelClasses}>{title}</span>
    </button>
  )

  if (state !== "collapsed" || isMobile) return row

  return (
    <Tooltip>
      <TooltipTrigger render={row} />
      <TooltipContent side="right">{title}</TooltipContent>
    </Tooltip>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { toggleSidebar } = useSidebar()
  const [postOpen, setPostOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);

  const [activeTitle, setActiveTitle] = React.useState<string>("Home")
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ACTIVE_KEY)
      if (stored) setActiveTitle(stored)
    } catch {
      /* ignore SSR / localStorage disabled */
    }
    setHydrated(true)
  }, [])

  const handleActivate = React.useCallback((title: string) => {
    setActiveTitle(title)
    try {
      window.localStorage.setItem(ACTIVE_KEY, title)
    } catch {
      /* ignore */
    }
  }, [])

  return (
    <Sidebar
      collapsible="icon"
      className="border-r-zinc-800 bg-zinc-900 pt-4 md:pt-[70px]"
      suppressHydrationWarning
      {...props}
    >
      <SidebarContent className="px-4 pt-4">
        <div className="flex flex-col items-center gap-5">
          {navItems.map((item) => (
            <RailLink
              key={item.title}
              {...item}
              active={hydrated && activeTitle === item.title}
              onActivate={handleActivate}
            />
          ))}
        </div>

        <div className="mt-7 flex flex-col items-center gap-5">
          <RailButton
            title="Create"
            icon={<Plus className="h-6 w-6 shrink-0" strokeWidth={2} />}
            onClick={() => setPostOpen(true)}
            className="bg-green-400 text-zinc-900 hover:bg-green-400/90 hover:text-zinc-900"
          />
        </div>

        {/* Activate Post sidebar */}
        <PostSidebar open={postOpen} onClose={() => setPostOpen(false)}/>  

        <div className="mt-7 flex flex-col items-center gap-5">
            <RailButton 
            title="Notifications" 
            icon={<Bell className="h-6 w-6 shrink-0" strokeWidth={1.75} />} 
            onClick={() => setNotifOpen(true)} />

          {/* Activate Notification sidebar */}
          <NotificationSidebar open={notifOpen} onClose={() => setNotifOpen(false)}/>


          {/* Profile icon */}
          <RailLink
            title="Profile"
            url="/profile"
            onActivate={handleActivate}
            active={hydrated && activeTitle === "Profile"}
            icon={
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800">
                <User className="h-4 w-4 text-white" strokeWidth={1.75} />
              </span>
            }
            className="group-data-[collapsible=icon]:p-2"
          />
        </div>
      </SidebarContent>

      <SidebarFooter className="items-center gap-5 px-4 pb-6">
        <RailLink
          title="Menu"
          url="#"
          onClick={(e) => {
            e.preventDefault()
            toggleSidebar()
          }}
          icon={<Menu className="h-6 w-6 shrink-0" strokeWidth={1.75} />}
          className="text-white"
        />
        <a
          href="/"
          aria-label="Home"
          onClick={() => handleActivate("Home")}
          className="w-full px-1 text-left text-2xl tracking-tight whitespace-nowrap text-green-400 group-data-[collapsible=icon]:text-center transition-colors duration-200 hover:text-green-400/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 rounded-lg"
        >
          NFT's
        </a>
      </SidebarFooter>
    </Sidebar>
  )
}
