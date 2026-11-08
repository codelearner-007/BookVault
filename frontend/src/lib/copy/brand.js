// The product name, held in one config value (PRODUCT.md: no component hardcodes it).
const NAME = process.env.NEXT_PUBLIC_PRODUCTNAME || 'BookVault';

export const BRAND = {
  name: NAME,
  home: `${NAME} home`,
  description: 'Double-entry bookkeeping for your businesses, shared with your team.',
};
