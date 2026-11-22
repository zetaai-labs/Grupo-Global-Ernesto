import { isDeepStrictEqual } from 'node:util'
import { query } from '../config/database.js'
import { writeAudit } from './audit.js'
import { openProfile, sealProfile, isCurrentFormat } from './vault.service.js'

/**
 * Moves investor profiles to the active key provider.
 * Dry-run by default: it decrypts and test-encrypts every pending record but writes nothing.
 * The result never contains profile data.
 */
export async function reencryptVault({ apply = false, investorIds = null } = {}) {
  const { rows } = await query(
    `SELECT investor_id, encrypted_profile FROM investors_vault
     WHERE $1::uuid[] IS NULL OR investor_id = ANY($1::uuid[])
     ORDER BY created_at`,
    [investorIds],
  )
  const result = { mode: apply ? 'apply' : 'dry-run', total: rows.length, already_current: 0, pending: 0, migrated: 0, failed: [] }

  for (const row of rows) {
    if (isCurrentFormat(row.encrypted_profile)) {
      result.already_current += 1
      continue
    }
    result.pending += 1
    try {
      const profile = await openProfile(row.encrypted_profile)
      const sealed = await sealProfile(profile)
      if (!isDeepStrictEqual(await openProfile(sealed), profile)) throw new Error('Round-trip check failed.')
      if (apply) {
        // Only replace the exact value we read, so a concurrent edit is never overwritten.
        const updated = await query(
          'UPDATE investors_vault SET encrypted_profile = $2, updated_at = now() WHERE investor_id = $1 AND encrypted_profile = $3',
          [row.investor_id, sealed, row.encrypted_profile],
        )
        if (!updated.rowCount) throw new Error('Record changed during migration.')
        result.migrated += 1
      }
    } catch (error) {
      result.failed.push({ investor_id: row.investor_id, error: error.message })
    }
  }

  if (apply) {
    await writeAudit(null, 'VAULT_KEY_MIGRATION', 'investors_vault', null, {
      total: result.total, migrated: result.migrated, failed: result.failed.length,
    })
  }
  return result
}
