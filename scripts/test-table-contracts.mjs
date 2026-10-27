import { withNodeBundle } from './node-bundle.mjs';
import { verifyTableContracts } from '../tests/table-contracts.mjs';
await withNodeBundle('tests/performance-api.ts', verifyTableContracts);
