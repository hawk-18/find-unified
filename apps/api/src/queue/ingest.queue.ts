import { Queue } from 'bullmq'
import { redisConnection } from './client.js'

export interface IngestJobData {
  jobType: 'git' | 'http'
  syncJobId: string
}

export const ingestQueue = new Queue<IngestJobData>('ingest', {
  connection: redisConnection,
})
