import express, { Express } from 'express';
import request from 'supertest';

import router from '../routes';

describe('GET /tokens', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/', router);
  });

  it('should return tokens data', async () => {
    const response = await request(app).get('/tokens');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
  });
});
