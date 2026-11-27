import { config } from '../config/env.js'

/**
 * Who must accept the current privacy policy before using the platform: everyone except the Super
 * Administrator, who acts for Grupo Global itself (the data controller that publishes the policy) and must
 * always be able to reach the dashboard and the audit log.
 */
export const CONSENT_EXEMPT_ROLES = ['admin']

export function consentRequired(role, acceptedVersion) {
  return config.privacy.enforce && !CONSENT_EXEMPT_ROLES.includes(role) && acceptedVersion !== config.privacy.version
}
