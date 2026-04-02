'use client';

import React, { createContext, useContext } from 'react';

const AdminClaimsContext = createContext(null);

export function AdminClaimsProvider({ claims, children }) {
  return (
    <AdminClaimsContext.Provider value={{ claims }}>
      {children}
    </AdminClaimsContext.Provider>
  );
}

export function useAdminClaims() {
  const ctx = useContext(AdminClaimsContext);
  if (!ctx) {
    throw new Error('useAdminClaims must be used within AdminClaimsProvider');
  }
  return ctx.claims;
}
