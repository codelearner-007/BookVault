import { apiClient } from './api-client';

// What a new business gets from a country's chart template (no id: the generic template).
export async function previewCountryTemplate(countryId) {
  const query = countryId ? `?${new URLSearchParams({ country_id: countryId })}` : '';
  return apiClient.get(`/v1/country-templates/preview${query}`);
}
