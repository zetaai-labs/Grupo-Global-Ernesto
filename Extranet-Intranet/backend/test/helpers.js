import request from 'supertest'
import { config } from '../src/config/env.js'
import { createApp } from '../src/app.js'

export const app = createApp()

export async function loginAs(email) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: config.seedUserPassword })
  return response.body.data
}
