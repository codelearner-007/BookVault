// Shared steps on a document view (receipt, payment, transfer, journal entry, sales and purchase documents).

// The Transaction journal is collapsed by default (?journal=1 keeps it open): open it and return its region.
export async function openTransactionJournal(page) {
  const toggle = page.getByRole('button', { name: 'Transaction journal' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  return page.getByRole('region', { name: 'Transaction journal' });
}
