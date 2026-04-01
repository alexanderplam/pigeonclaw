import { Settings } from 'lucide-react';

export function SidebarFooter({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <footer className="sidebar-footer">
      <button className="sidebar-footer-button" type="button" onClick={onOpenSettings}>
        <Settings aria-hidden="true" size={18} strokeWidth={1.9} />
        <span>Settings</span>
      </button>
    </footer>
  );
}
