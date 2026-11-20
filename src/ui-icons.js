const paths = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  tasks:'<rect x="4" y="4" width="16" height="17" rx="3"/><path d="m8 11 2 2 5-5M8 17h8"/>',
  companies:'<path d="M4 21V5l8-2v18M12 9h8v12M2 21h20M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2"/>',
  backup:'<path d="M5 16a5 5 0 0 1 0-10 7 7 0 0 1 13 1 4.5 4.5 0 0 1 1 9M12 11v10m-4-4 4 4 4-4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  note:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18M8 14h2M14 14h2"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>'
};
export function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.tasks}</svg>`; }
