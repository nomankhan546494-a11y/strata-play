import { AppTab } from '../types/gaming';

interface HeaderProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onQuickPlay: () => void;
  quickPlayLabel: string;
}

const NAV_ITEMS: { id: AppTab; label: string }[] = [
  { id: 'discover', label: 'Discover' },
  { id: 'library', label: 'Library' },
  { id: 'multiplayer', label: 'Multiplayer' },
  { id: 'profile', label: 'Profile' },
  { id: 'settings', label: 'Settings' },
];

export function Header({ activeTab, onSelectTab, onQuickPlay, quickPlayLabel }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0B0D12]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-8 px-6 py-4">
        <a
          href="#discover"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('discover');
          }}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Strata Play
        </a>

        <nav className="hidden md:flex items-center gap-7" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[17px] h-[2px] bg-emerald-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            onClick={onQuickPlay}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {quickPlayLabel}
          </button>
        </div>
      </div>

      <nav className="flex md:hidden items-center gap-5 overflow-x-auto border-t border-white/[0.06] px-6 py-2.5" aria-label="Mobile navigation">
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                active ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
