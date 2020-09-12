const backendUrl = `http://54.145.96.186:8080/api`;

/**
 * Frontend Url.
 */
const frontendUrl = {
  host: 'localhost:3000',
  protocol: 'http',
};

/**
 * Tenant Mode
 * multi: Allow new users to create new tenants.
 * multi-with-subdomain: Same as multi, but enable access to the tenant via subdomain.
 * single: One tenant, the first user to register will be the admin.
 */
const tenantMode = 'single';

/**
 * Plan payments configuration.
 */
const isPlanEnabled = false;
const stripePublishableKey = '';

export default {
  frontendUrl,
  backendUrl,
  tenantMode,
  isPlanEnabled,
  stripePublishableKey
};
