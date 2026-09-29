import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'

const app = createApp()
const port = Number(process.env.PORT ?? 3001)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

app.use(express.static(dist))
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'))
})

app.listen(port, () => {
  console.log(`SystemOne server listening on http://localhost:${port}`)
})
