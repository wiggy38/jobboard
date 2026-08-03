import { syncSources } from '../lib/sync-sources'

syncSources()
  .then(() => console.log('Sources synchronisées.'))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
