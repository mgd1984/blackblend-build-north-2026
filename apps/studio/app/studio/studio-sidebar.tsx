"use client";
import { useRef, type ReactNode } from "react";
import { PanelRightClose, type LucideIcon } from "lucide-react";

export type StudioTab = {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: boolean;
  content?: ReactNode;
  className?: string;
};
export function SidebarHeader({
  id,
  tabs,
  active,
  onSelect,
  onClose,
}: {
  id: string;
  tabs: StudioTab[];
  active: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="scene-sidebar-header">
      <div role="tablist" aria-label="Studio panels" className="scene-sidebar-tabs">
        {tabs.map(({ id: key, label, icon: Icon, badge }, index) => (
          <button
            key={key}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            id={`${id}-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={active === key}
            aria-controls={`${id}-panel-${key}`}
            tabIndex={active === key ? 0 : -1}
            onClick={() => onSelect(key)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              onSelect(tabs[next].id);
              buttons.current[next]?.focus();
            }}
          >
            <Icon size={14} />
            {label}
            {badge && <i className="scene-tab-dot" />}
          </button>
        ))}
      </div>
      <button
        className="scene-icon-button"
        aria-label="Collapse studio sidebar"
        aria-expanded={true}
        aria-controls={id}
        onClick={onClose}
      >
        <PanelRightClose size={16} />
      </button>
    </div>
  );
}
export default function StudioSidebar({
  id,
  open,
  tabs,
  active,
  onSelect,
  onClose,
  footer,
}: {
  id: string;
  open: boolean;
  tabs: StudioTab[];
  active: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  footer?: ReactNode;
}) {
  return (
    <aside
      id={id}
      className="scene-sidebar workspace-sidebar"
      aria-label="Studio sidebar"
      inert={!open}
    >
      <SidebarHeader id={id} tabs={tabs} active={active} onSelect={onSelect} onClose={onClose} />
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${id}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${tab.id}`}
          hidden={active !== tab.id}
          className={`scene-sidebar-panel ${tab.className ?? "workspace-sidebar-scroll"}`}
          tabIndex={0}
        >
          {tab.content}
        </div>
      ))}
      {footer && <div className="scene-sidebar-footer">{footer}</div>}
    </aside>
  );
}
