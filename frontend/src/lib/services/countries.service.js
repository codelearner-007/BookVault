import { listAllPages } from './list-all-pages';

// Country reference list ({ id, code, name }); businesses store the country name.
export async function listCountries() {
  return listAllPages('/v1/countries');
}
