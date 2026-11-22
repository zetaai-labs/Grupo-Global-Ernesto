// Moves Investor Vault profiles to the provider set in VAULT_KEY_PROVIDER.
// Dry-run:  node database/scripts/reencrypt-vault.js
// Write:    node database/scripts/reencrypt-vault.js --apply
// Back up the database first, and keep VAULT_ENCRYPTION_KEY until no `v1:` records remain.
import pool from '../../src/config/database.js'
import { reencryptVault } from '../../src/services/vaultReencrypt.service.js'

const apply = process.argv.includes('--apply')

try {
  const result = await reencryptVault({ apply })
  console.log(JSON.stringify(result, null, 2))
  if (!apply) console.log('Dry-run only: nothing was written. Re-run with --apply to migrate.')
  process.exitCode = result.failed.length ? 1 : 0
} finally {
  await pool.end()
}
