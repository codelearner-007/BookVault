// User-facing text of the Customize tabs page.
export const CUSTOMIZE_TABS_COPY = {
  title: 'Customize tabs',
  description: (businessName) => `Choose which tabs ${businessName} shows in the sidebar.`,
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The tabs could not be saved. Try again.',
  empty: 'No tabs available',
  emptyDescription: 'The platform has no tabs switched on yet.',
  enable: (label) => `Show ${label}`,
  needsParent: (parent) => `Needs ${parent}`,
  comingSoon: 'Coming soon',
  ungrouped: 'General',
};
